"""Download a portable ZIP of all currently referenced PartsFlow images."""
import csv
import io
import re
import tempfile
import zipfile
from pathlib import PurePosixPath

import requests
from django.http import FileResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .auth_api import permissions_for, require_permission
from .drive_images import download_drive_file, resolve_drive_file
from .models import Part, ToolEquipment, ToolingItem
from .supabase_storage import public_url_for_object, storage_object_path


def _safe_filename(value, fallback):
    value = re.sub(r"[^A-Za-z0-9._-]+", "_", str(value or "").strip())
    return value[:100].strip("._") or fallback


def _image_rows():
    for part in Part.objects.exclude(image_path="").order_by("sku").iterator():
        yield "Stock", part.sku, part.image_path
    for item in ToolingItem.objects.exclude(image_path="").order_by("equipment_number", "name").iterator():
        yield "Tooling", item.equipment_number or str(item.pk), item.image_path
    for tool in ToolEquipment.objects.exclude(image_path="").order_by("code").iterator():
        yield "Gauge-Control", tool.code, tool.image_path


@csrf_exempt
@api_view(["GET"])
@permission_classes([AllowAny])
def image_backup(request):
    actor, error = require_permission(request, "can_view_parts")
    if error:
        return error

    permissions = permissions_for(actor)
    required = ("can_view_tooling", "can_view_tools")
    if not all(permissions.get(name) for name in required):
        return Response(
            {"detail": "การ Backup รูปภาพรวมต้องมีสิทธิ์ดู Stock, Tooling และ Gauge Control"},
            status=403,
        )

    rows = list(_image_rows())
    if not rows:
        return Response({"detail": "ไม่พบรูปภาพที่เชื่อมกับรายการ Stock, Tooling หรือ Gauge Control"}, status=404)

    output = tempfile.SpooledTemporaryFile(max_size=16 * 1024 * 1024, mode="w+b")
    manifest = []
    downloaded = 0
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for category, identifier, image_path in rows:
            object_path = storage_object_path(image_path)
            safe_id = _safe_filename(identifier, "image")
            extension = PurePosixPath(image_path).suffix.lower()
            if extension not in {".jpg", ".jpeg", ".png", ".webp", ".gif"}:
                extension = ".img"
            archive_name = f"{category}/{safe_id}{extension}"
            status = "skipped"
            detail = ""
            source = ""
            try:
                # Prefer the verified Google Drive copy so routine ZIP exports
                # do not re-download every image from Supabase Storage.
                drive_candidates = [image_path]
                drive_folder = {
                    "Stock": str(identifier),
                    "Tooling": f"Tooling_{identifier}",
                    "Gauge-Control": f"GaugeControl_{identifier}",
                }.get(category)
                if drive_folder:
                    drive_candidates.append(
                        f"DATA1_Images/WebUploads/{drive_folder}/{PurePosixPath(image_path).name}"
                    )
                image_bytes = None
                drive_errors = []
                for drive_path in drive_candidates:
                    try:
                        file_id, _mime_type, _name = resolve_drive_file(drive_path)
                        image_bytes = download_drive_file(file_id)
                        if image_bytes:
                            source = "Google Drive"
                            break
                        drive_errors.append("Google Drive ส่งไฟล์ว่าง")
                    except Exception as exc:
                        drive_errors.append(str(exc)[:120])
                if image_bytes is None:
                    if not object_path:
                        raise ValueError("ไม่มี Storage object path")
                    url = public_url_for_object(object_path, with_version=False)
                    response = requests.get(url, timeout=30)
                    if response.status_code != 200:
                        raise ValueError(f"Storage HTTP {response.status_code}")
                    image_bytes = response.content
                    source = "Supabase Storage"
                if not image_bytes:
                    raise ValueError("ไฟล์ว่างเปล่า")
                archive.writestr(archive_name, image_bytes)
                status = "downloaded"
                downloaded += 1
            except Exception as exc:
                detail = str(exc)[:240]
            manifest.append([category, identifier, image_path, archive_name if status == "downloaded" else "", status, source, detail])

        csv_buffer = io.StringIO()
        writer = csv.writer(csv_buffer)
        writer.writerow(["Category", "Part ID / Equipment Code", "Image Path", "Backup File", "Status", "Source", "Detail"])
        writer.writerows(manifest)
        archive.writestr("backup_manifest.csv", csv_buffer.getvalue().encode("utf-8-sig"))
        summary = (
            "PartsFlow Image Backup\n"
            f"Created: {timezone.localtime(timezone.now()).isoformat()}\n"
            f"Referenced images: {len(rows)}\n"
            f"Downloaded: {downloaded}\n"
            f"Skipped: {len(rows) - downloaded}\n"
            "Review backup_manifest.csv for per-image results. This archive does not modify or delete source images.\n"
        )
        archive.writestr("README.txt", summary.encode("utf-8"))

    output.seek(0)
    stamp = timezone.localtime(timezone.now()).strftime("%Y%m%d_%H%M")
    response = FileResponse(
        output,
        as_attachment=True,
        filename=f"partsflow_images_backup_{stamp}.zip",
        content_type="application/zip",
    )
    response["Cache-Control"] = "no-store"
    response["X-Image-Backup-Downloaded"] = str(downloaded)
    response["X-Image-Backup-Skipped"] = str(len(rows) - downloaded)
    return response

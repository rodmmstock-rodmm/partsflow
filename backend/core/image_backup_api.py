"""Download a portable ZIP of all currently referenced PartsFlow images."""
import csv
import io
import queue
import re
import threading
import zipfile
from pathlib import PurePosixPath

import requests
from django.http import StreamingHttpResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .auth_api import permissions_for, require_permission
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


class _QueueZipWriter:
    """Non-seekable ZIP target that forwards archive bytes to the response."""

    def __init__(self, chunks, stopped):
        self.chunks = chunks
        self.stopped = stopped
        self.position = 0

    def writable(self):
        return True

    def seekable(self):
        return False

    def tell(self):
        return self.position

    def flush(self):
        return None

    def write(self, data):
        data = memoryview(data)
        written = len(data)
        for offset in range(0, written, 64 * 1024):
            chunk = bytes(data[offset:offset + 64 * 1024])
            while not self.stopped.is_set():
                try:
                    self.chunks.put(chunk, timeout=0.25)
                    break
                except queue.Full:
                    continue
            if self.stopped.is_set():
                raise BrokenPipeError("Image backup client disconnected")
        self.position += written
        return written


def _stream_zip(rows):
    chunks = queue.Queue(maxsize=8)
    stopped = threading.Event()
    finished = object()

    def produce():
        manifest = []
        downloaded = 0
        partial = 0
        try:
            writer = _QueueZipWriter(chunks, stopped)
            with zipfile.ZipFile(
                writer, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6
            ) as archive:
                for category, identifier, image_path in rows:
                    safe_id = _safe_filename(identifier, "image")
                    extension = PurePosixPath(image_path).suffix.lower()
                    if extension not in {".jpg", ".jpeg", ".png", ".webp", ".gif"}:
                        extension = ".img"
                    archive_name = f"{category}/{safe_id}{extension}"
                    status = "skipped"
                    detail = ""
                    entry_started = False
                    response = None
                    try:
                        object_path = storage_object_path(image_path)
                        if not object_path:
                            raise ValueError("ไม่มี Storage object path")
                        url = public_url_for_object(object_path, with_version=False)
                        response = requests.get(url, timeout=(8, 25), stream=True)
                        if response.status_code != 200:
                            raise ValueError(f"Storage HTTP {response.status_code}")
                        with archive.open(archive_name, "w") as image_file:
                            entry_started = True
                            received = False
                            for chunk in response.iter_content(chunk_size=64 * 1024):
                                if chunk:
                                    image_file.write(chunk)
                                    received = True
                            if not received:
                                raise ValueError("ไฟล์ว่างเปล่า")
                        status = "downloaded"
                        downloaded += 1
                    except Exception as exc:
                        detail = str(exc)[:240]
                        if entry_started:
                            status = "partial"
                            partial += 1
                    finally:
                        if response is not None:
                            close = getattr(response, "close", None)
                            if callable(close):
                                close()
                    manifest.append([
                        category,
                        identifier,
                        image_path,
                        archive_name if status in {"downloaded", "partial"} else "",
                        status,
                        detail,
                    ])

                csv_buffer = io.StringIO()
                writer_csv = csv.writer(csv_buffer)
                writer_csv.writerow([
                    "Category",
                    "Part ID / Equipment Code",
                    "Image Path",
                    "Backup File",
                    "Status",
                    "Detail",
                ])
                writer_csv.writerows(manifest)
                archive.writestr(
                    "backup_manifest.csv", csv_buffer.getvalue().encode("utf-8-sig")
                )
                summary = (
                    "PartsFlow Image Backup\\n"
                    f"Created: {timezone.localtime(timezone.now()).isoformat()}\\n"
                    f"Referenced images: {len(rows)}\\n"
                    f"Downloaded: {downloaded}\\n"
                    f"Partial: {partial}\\n"
                    f"Skipped: {len(rows) - downloaded - partial}\\n"
                    "Review backup_manifest.csv for per-image results. "
                    "This archive does not modify or delete source images.\\n"
                )
                archive.writestr("README.txt", summary.encode("utf-8"))
        except (BrokenPipeError, GeneratorExit):
            pass
        except Exception:
            pass
        finally:
            while not stopped.is_set():
                try:
                    chunks.put(finished, timeout=0.25)
                    break
                except queue.Full:
                    continue

    producer = threading.Thread(target=produce, name="partsflow-image-backup", daemon=True)
    producer.start()
    try:
        while True:
            chunk = chunks.get()
            if chunk is finished:
                break
            yield chunk
    finally:
        stopped.set()


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
        return Response(
            {"detail": "ไม่พบรูปภาพที่เชื่อมกับรายการ Stock, Tooling หรือ Gauge Control"},
            status=404,
        )

    stamp = timezone.localtime(timezone.now()).strftime("%Y%m%d_%H%M")
    response = StreamingHttpResponse(_stream_zip(rows), content_type="application/zip")
    response["Content-Disposition"] = (
        f'attachment; filename="partsflow_images_backup_{stamp}.zip"'
    )
    response["Cache-Control"] = "no-store"
    response["X-Image-Backup-Mode"] = "stream"
    return response

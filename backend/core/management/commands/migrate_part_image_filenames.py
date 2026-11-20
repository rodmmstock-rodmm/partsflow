"""Safely migrate existing Stock images to Part-ID filenames.

Dry-run is the default. Use --apply to copy and verify the new Storage/Drive
objects before changing Part.image_path. Original objects are never deleted.
"""
import csv
import hashlib
import mimetypes
import re
from pathlib import Path, PurePosixPath

import requests
from django.core.management.base import BaseCommand, CommandError

from core.drive_image_backup import backup_web_upload
from core.drive_images import (
    DriveImageConfigError,
    DriveImageNotFound,
    download_drive_file,
    is_drive_relative_path,
    resolve_drive_file,
)
from core.models import Part
from core.supabase_storage import (
    SupabaseStorageConfigError,
    SupabaseStorageRequestError,
    public_url_for_object,
    storage_object_path,
    upload_object,
)


CONTENT_TYPE_EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}


def safe_part_id(value):
    return re.sub(r"[^A-Za-z0-9._-]+", "_", str(value or "").strip())[:80] or "part"


def source_image(part):
    """Read the current Storage image, falling back to its Drive source."""
    object_path = storage_object_path(part.image_path)
    if object_path:
        url = public_url_for_object(object_path, with_version=False)
        response = requests.get(url, timeout=30)
        if response.status_code == 200 and response.content:
            content_type = response.headers.get("Content-Type", "").split(";", 1)[0].lower()
            return response.content, content_type

    if is_drive_relative_path(part.image_path):
        file_id, content_type, _filename = resolve_drive_file(part.image_path)
        payload = download_drive_file(file_id)
        if payload:
            return payload, str(content_type or "").lower().split(";", 1)[0]

    raise ValueError("อ่านรูปต้นฉบับจาก Supabase Storage หรือ Google Drive ไม่สำเร็จ")


class Command(BaseCommand):
    help = (
        "Rename existing Stock image files to Part ID filenames. "
        "Dry-run by default; original files are never deleted."
    )

    def add_arguments(self, parser):
        parser.add_argument("--apply", action="store_true", help="Copy, verify, and update image_path.")
        parser.add_argument("--sku", default="", help="Migrate one Part ID only.")
        parser.add_argument("--limit", type=int, default=0, help="Limit the number of Parts; 0 means all.")
        parser.add_argument("--report", default="part_image_filename_migration.csv", help="CSV report path.")

    def handle(self, *args, **options):
        apply_changes = bool(options["apply"])
        sku = str(options["sku"] or "").strip()
        limit = max(0, int(options["limit"] or 0))
        report_path = Path(options["report"]).expanduser()

        qs = Part.objects.exclude(image_path="").order_by("sku")
        if sku:
            qs = qs.filter(sku__iexact=sku)
        parts = list(qs[:limit] if limit else qs)

        rows = []
        changed = skipped = failed = 0
        self.stdout.write(
            self.style.NOTICE(
                f"Mode: {'APPLY' if apply_changes else 'DRY-RUN'} | Parts with images: {len(parts):,}"
            )
        )

        for part in parts:
            part_id = safe_part_id(part.sku)
            current_name = PurePosixPath(str(part.image_path).replace("\\", "/")).name
            extension = PurePosixPath(current_name).suffix.lower()
            if current_name.lower() == f"{part_id}{extension}".lower():
                skipped += 1
                rows.append([part.sku, part.image_path, part.image_path, "ALREADY_NAMED", ""])
                continue

            if not apply_changes:
                rows.append([part.sku, part.image_path, "", "READY_DRY_RUN", "จะคัดลอกและตรวจสอบก่อนเปลี่ยน image_path"])
                changed += 1
                continue

            try:
                payload, content_type = source_image(part)
                extension = CONTENT_TYPE_EXTENSIONS.get(content_type) or extension
                if extension not in set(CONTENT_TYPE_EXTENSIONS.values()):
                    extension = mimetypes.guess_extension(content_type or "") or ""
                if extension not in set(CONTENT_TYPE_EXTENSIONS.values()):
                    raise ValueError(f"ชนิดไฟล์รูปภาพไม่รองรับ: {content_type or 'unknown'}")

                digest = hashlib.sha256(payload).hexdigest()
                logical_path = f"DATA1_Images/WebUploads/{part_id}/{part_id}{extension}"
                new_object_path = storage_object_path(logical_path)
                upload_object(
                    new_object_path,
                    payload,
                    content_type=content_type or "application/octet-stream",
                    upsert=False,
                )

                # Confirm the destination is publicly readable and byte-identical.
                verify = requests.get(
                    public_url_for_object(new_object_path, with_version=False),
                    timeout=30,
                )
                if verify.status_code != 200 or hashlib.sha256(verify.content).hexdigest() != digest:
                    raise ValueError("ตรวจสอบไฟล์ใหม่ไม่ผ่าน (HTTP/checksum ไม่ตรง)")

                # Keep the Google Drive fallback working at the matching SKU path.
                drive_result = backup_web_upload(
                    sku_folder=part_id,
                    filename=f"{part_id}{extension}",
                    payload=payload,
                    content_type=content_type or "application/octet-stream",
                )
                if not drive_result.get("verified"):
                    raise ValueError("ไฟล์สำรอง Google Drive ยังไม่ได้รับการยืนยัน")

                old_path = part.image_path
                part.image_path = logical_path
                part.save(update_fields=["image_path", "updated_at"])
                changed += 1
                rows.append([part.sku, old_path, logical_path, "MIGRATED", f"sha256={digest}; drive_verified=true"])
            except (SupabaseStorageConfigError, SupabaseStorageRequestError, DriveImageConfigError, DriveImageNotFound, requests.RequestException, ValueError, Exception) as exc:
                failed += 1
                rows.append([part.sku, part.image_path, "", "FAILED", str(exc)[:300]])

        report_path.parent.mkdir(parents=True, exist_ok=True)
        with report_path.open("w", newline="", encoding="utf-8-sig") as handle:
            writer = csv.writer(handle)
            writer.writerow(["Part ID", "Old image_path", "New image_path", "Status", "Detail"])
            writer.writerows(rows)

        self.stdout.write(
            f"Completed | {'Would migrate' if not apply_changes else 'Migrated'}: {changed:,} | "
            f"Already named: {skipped:,} | Failed: {failed:,}"
        )
        self.stdout.write(f"Report: {report_path.resolve()}")
        if failed:
            raise CommandError(f"มีรายการที่ทำไม่สำเร็จ {failed:,} รายการ กรุณาตรวจสอบ CSV")

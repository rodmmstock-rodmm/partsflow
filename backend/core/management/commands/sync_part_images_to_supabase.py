from __future__ import annotations

import csv
import time
from collections import deque
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from core.drive_images import (
    DEFAULT_ROOT_NAME,
    DRIVE_FOLDER_MIME,
    DriveImageConfigError,
    DriveImageNotFound,
    download_drive_file,
    drive_service,
    normalize_drive_relative_path,
    resolve_drive_file,
    root_folder_id,
)
from core.models import Part
from core.supabase_storage import (
    SupabaseStorageConfigError,
    SupabaseStorageRequestError,
    public_image_url,
    public_object_exists,
    storage_object_path,
    upload_object,
)


def build_drive_index():
    """List the Drive source tree once instead of one list query per Part."""
    service = drive_service()
    queue = deque([(root_folder_id(), DEFAULT_ROOT_NAME)])
    index = {}

    while queue:
        parent_id, prefix = queue.popleft()
        page_token = None

        while True:
            response = (
                service.files()
                .list(
                    q=f"'{parent_id}' in parents and trashed = false",
                    fields=(
                        "nextPageToken,"
                        "files(id,name,mimeType,size,modifiedTime)"
                    ),
                    pageSize=1000,
                    spaces="drive",
                    supportsAllDrives=True,
                    includeItemsFromAllDrives=True,
                    pageToken=page_token,
                )
                .execute()
            )

            for row in response.get("files", []):
                name = row.get("name") or ""
                if not name:
                    continue

                path = f"{prefix}/{name}"

                if row.get("mimeType") == DRIVE_FOLDER_MIME:
                    queue.append((row["id"], path))
                    continue

                normalized = normalize_drive_relative_path(path)
                if normalized:
                    index[normalized.lower()] = row

            page_token = response.get("nextPageToken")
            if not page_token:
                break

    return index


class Command(BaseCommand):
    help = (
        "Sync Part images from Google Drive source to Supabase Storage. "
        "Google Drive remains unchanged as source/backup."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Actually upload files. Without this flag the command is dry-run only.",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=0,
            help="Process only the first N eligible Parts. 0 = all.",
        )
        parser.add_argument(
            "--sku",
            default="",
            help="Process one Item ID / SKU only.",
        )
        parser.add_argument(
            "--force",
            action="store_true",
            help="Re-upload even if the Storage object already exists.",
        )
        parser.add_argument(
            "--report",
            default="supabase_image_sync_report.csv",
            help="CSV report path.",
        )

    def handle(self, *args, **options):
        apply_changes = bool(options["apply"])
        limit = max(0, int(options["limit"] or 0))
        sku = str(options["sku"] or "").strip()
        force = bool(options["force"])
        report_path = Path(options["report"]).expanduser()

        qs = Part.objects.exclude(image_path="").order_by("sku")
        if sku:
            qs = qs.filter(sku__iexact=sku)

        candidates = []
        for part in qs.iterator(chunk_size=500):
            normalized = normalize_drive_relative_path(part.image_path)
            if not normalized:
                continue
            candidates.append((part, normalized))
            if limit and len(candidates) >= limit:
                break

        if not candidates:
            raise CommandError("ไม่พบ Part ที่ใช้ DATA1_Images/...")

        self.stdout.write(
            self.style.NOTICE(
                f"Mode: {'APPLY' if apply_changes else 'DRY-RUN'} | "
                f"Eligible Parts: {len(candidates):,}"
            )
        )

        # First classify objects already available in public Storage. This makes
        # the command resumable and avoids downloading Drive files unnecessarily.
        pending = []
        rows = []
        existing_count = 0

        for i, (part, normalized) in enumerate(candidates, start=1):
            object_path = storage_object_path(normalized)
            try:
                exists = public_object_exists(object_path)
            except (SupabaseStorageConfigError, SupabaseStorageRequestError) as exc:
                raise CommandError(str(exc)) from exc

            if exists and not force:
                existing_count += 1
                rows.append(
                    {
                        "sku": part.sku,
                        "image_path": normalized,
                        "storage_object": object_path,
                        "status": "ALREADY_IN_STORAGE",
                        "detail": "",
                    }
                )
            else:
                pending.append((part, normalized, object_path))

            if i % 100 == 0:
                self.stdout.write(
                    f"Checked Storage {i:,}/{len(candidates):,}..."
                )

        self.stdout.write(
            f"Already in Storage: {existing_count:,} | "
            f"Need sync: {len(pending):,}"
        )

        if not pending:
            self._write_report(report_path, rows)
            self.stdout.write(
                self.style.SUCCESS("Supabase Storage มีรูปครบสำหรับชุดที่ตรวจแล้ว")
            )
            self.stdout.write(f"Report: {report_path.resolve()}")
            return

        self.stdout.write("Building Google Drive source index once...")
        try:
            drive_index = build_drive_index()
        except DriveImageConfigError as exc:
            raise CommandError(str(exc)) from exc
        except Exception as exc:
            raise CommandError(f"อ่านรายการไฟล์จาก Google Drive ไม่สำเร็จ: {exc}") from exc

        self.stdout.write(
            self.style.SUCCESS(
                f"Drive index ready: {len(drive_index):,} files"
            )
        )

        source_missing = []
        ready = []

        for part, normalized, object_path in pending:
            row = drive_index.get(normalized.lower())
            if row:
                ready.append((part, normalized, object_path, row))
            else:
                source_missing.append((part, normalized, object_path))
                rows.append(
                    {
                        "sku": part.sku,
                        "image_path": normalized,
                        "storage_object": object_path,
                        "status": "SOURCE_NOT_FOUND",
                        "detail": "ไม่พบใน Drive index",
                    }
                )

        self.stdout.write(
            f"Drive source found: {len(ready):,} | "
            f"Source missing: {len(source_missing):,}"
        )

        if not apply_changes:
            for part, normalized, object_path, _row in ready:
                rows.append(
                    {
                        "sku": part.sku,
                        "image_path": normalized,
                        "storage_object": object_path,
                        "status": "WOULD_UPLOAD",
                        "detail": public_image_url(normalized),
                    }
                )

            self._write_report(report_path, rows)
            self.stdout.write(
                self.style.WARNING(
                    "DRY-RUN เท่านั้น: ยังไม่มีการ Upload หรือแก้ไข Google Drive"
                )
            )
            self.stdout.write(
                "เมื่อตรวจผลแล้ว ให้รันคำสั่งเดิมเพิ่ม --apply"
            )
            self.stdout.write(f"Report: {report_path.resolve()}")
            return

        uploaded = 0
        failed = 0
        verified_public = False

        for i, (part, normalized, object_path, source_row) in enumerate(
            ready, start=1
        ):
            file_id = source_row["id"]
            mime_type = (
                source_row.get("mimeType")
                or "application/octet-stream"
            )

            try:
                payload = self._retry(
                    lambda: download_drive_file(file_id),
                    label=f"Drive download {part.sku}",
                )

                result = self._retry(
                    lambda: upload_object(
                        object_path,
                        payload,
                        content_type=mime_type,
                        upsert=force,
                    ),
                    label=f"Supabase upload {part.sku}",
                )

                # Verify the first successfully uploaded object through the
                # public CDN path. This catches a non-public bucket early.
                if not verified_public:
                    time.sleep(0.5)
                    if not public_object_exists(object_path):
                        raise SupabaseStorageConfigError(
                            "Upload สำเร็จ แต่ Public URL อ่านไม่ได้ "
                            "กรุณาตั้ง bucket เป็น Public"
                        )
                    verified_public = True

                uploaded += 1
                rows.append(
                    {
                        "sku": part.sku,
                        "image_path": normalized,
                        "storage_object": object_path,
                        "status": (
                            "ALREADY_EXISTS"
                            if result.get("already_exists")
                            else "UPLOADED"
                        ),
                        "detail": public_image_url(normalized),
                    }
                )
            except (
                DriveImageConfigError,
                DriveImageNotFound,
                SupabaseStorageConfigError,
                SupabaseStorageRequestError,
                Exception,
            ) as exc:
                failed += 1
                rows.append(
                    {
                        "sku": part.sku,
                        "image_path": normalized,
                        "storage_object": object_path,
                        "status": "ERROR",
                        "detail": str(exc),
                    }
                )
                self.stderr.write(
                    self.style.ERROR(
                        f"[{part.sku}] {exc}"
                    )
                )

            if i % 25 == 0 or i == len(ready):
                self.stdout.write(
                    f"Sync {i:,}/{len(ready):,} | "
                    f"uploaded={uploaded:,} failed={failed:,}"
                )

        self._write_report(report_path, rows)

        self.stdout.write("")
        self.stdout.write(
            self.style.SUCCESS(
                f"Finished: uploaded={uploaded:,}, "
                f"already={existing_count:,}, "
                f"source_missing={len(source_missing):,}, "
                f"errors={failed:,}"
            )
        )
        self.stdout.write(f"Report: {report_path.resolve()}")

        if failed:
            raise CommandError(
                "มีบางไฟล์ Sync ไม่สำเร็จ ดูรายละเอียดใน CSV report "
                "แล้วรันคำสั่งซ้ำได้ ระบบจะข้ามไฟล์ที่สำเร็จแล้ว"
            )

    @staticmethod
    def _retry(fn, *, label, attempts=3):
        last_error = None
        for attempt in range(1, attempts + 1):
            try:
                return fn()
            except Exception as exc:
                last_error = exc
                if attempt < attempts:
                    time.sleep(1.5 * attempt)
        raise last_error

    @staticmethod
    def _write_report(path: Path, rows):
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("w", encoding="utf-8-sig", newline="") as fh:
            writer = csv.DictWriter(
                fh,
                fieldnames=[
                    "sku",
                    "image_path",
                    "storage_object",
                    "status",
                    "detail",
                ],
            )
            writer.writeheader()
            writer.writerows(rows)

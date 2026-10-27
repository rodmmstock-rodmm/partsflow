"""Report and optionally optimize existing images in the Supabase Storage bucket.

Default mode is read-only. Use --apply only after reviewing the report and
confirming a restorable backup exists. Object paths and database records remain
unchanged; uploads overwrite only images that become smaller.
"""
from __future__ import annotations

import mimetypes
from pathlib import Path

import requests
from django.core.management.base import BaseCommand, CommandError

from core.image_optimizer import optimize_part_image
from core.supabase_storage import (
    _admin_headers,
    _quoted_object_path,
    require_admin_config,
    upload_object,
)


class Command(BaseCommand):
    help = "Dry-run or optimize existing images in Supabase Storage"

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply", action="store_true",
            help="Overwrite objects with smaller optimized versions (default is dry-run).",
        )
        parser.add_argument("--limit", type=int, default=0, help="Optional maximum objects to inspect.")
        parser.add_argument("--timeout", type=int, default=60)
        parser.add_argument(
            "--backup-dir", default="",
            help="Local directory for verified copies of originals; required with --apply.",
        )

    def handle(self, *args, **options):
        try:
            base, bucket, key = require_admin_config()
        except Exception as exc:
            raise CommandError(str(exc)) from exc

        apply_changes = options["apply"]
        backup_dir = str(options.get("backup_dir") or "").strip()
        if apply_changes and not backup_dir:
            raise CommandError(
                "--apply requires --backup-dir. Originals must be saved locally before any overwrite."
            )
        backup_root = Path(backup_dir).expanduser().resolve() if backup_dir else None
        limit = max(0, options["limit"])
        timeout = options["timeout"]
        headers = _admin_headers(key, "application/json")
        headers["Content-Type"] = "application/json"
        session = requests.Session()
        pending = [""]
        objects = []
        while pending:
            prefix = pending.pop()
            offset = 0
            while True:
                response = session.post(
                    f"{base}/storage/v1/object/list/{bucket}",
                    json={"prefix": prefix, "limit": 100, "offset": offset,
                          "sortBy": {"column": "name", "order": "asc"}},
                    headers=headers, timeout=timeout,
                )
                if response.status_code != 200:
                    raise CommandError(
                        f"Storage listing failed HTTP {response.status_code}: {response.text[:300]}"
                    )
                rows = response.json()
                for row in rows:
                    name = str(row.get("name") or "")
                    if not name:
                        continue
                    path = f"{prefix}/{name}".strip("/")
                    if row.get("id") is None and not row.get("metadata"):
                        pending.append(path)
                    else:
                        objects.append((path, row))
                        if limit and len(objects) >= limit:
                            pending.clear()
                            break
                if limit and len(objects) >= limit:
                    break
                if len(rows) < 100:
                    break
                offset += len(rows)

        inspected = optimized_count = saved_total = skipped = would_optimize = 0
        for path, row in objects:
            guessed = mimetypes.guess_type(path)[0] or ""
            metadata = row.get("metadata") or {}
            content_type = str(
                metadata.get("mimetype") or metadata.get("contentType") or guessed
            ).lower()
            if content_type not in {"image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"}:
                skipped += 1
                continue
            inspected += 1
            get_url = f"{base}/storage/v1/object/{bucket}/{_quoted_object_path(path)}"
            download = session.get(
                get_url, headers={"apikey": key, "Authorization": f"Bearer {key}"},
                timeout=timeout,
            )
            if download.status_code != 200:
                raise CommandError(f"Download failed for {path}: HTTP {download.status_code}")
            original = download.content
            try:
                optimized, output_type = optimize_part_image(original, content_type)
            except ValueError:
                skipped += 1
                continue
            saved = len(original) - len(optimized)
            if saved <= 0:
                continue
            would_optimize += 1
            self.stdout.write(
                f"{'WOULD OPTIMIZE' if not apply_changes else 'OPTIMIZE'} {path}: "
                f"{len(original)} -> {len(optimized)} bytes (saved {saved})"
            )
            if apply_changes:
                # Preserve exact original bytes and verify the backup before overwrite.
                backup_path = (backup_root / Path(*path.split("/"))).resolve()
                if backup_root not in backup_path.parents:
                    raise CommandError(f"Unsafe backup path for object: {path}")
                backup_path.parent.mkdir(parents=True, exist_ok=True)
                if backup_path.exists():
                    if backup_path.read_bytes() != original:
                        raise CommandError(
                            f"Backup already exists but differs from current object: {backup_path}"
                        )
                else:
                    with backup_path.open("xb") as backup_file:
                        backup_file.write(original)
                    if backup_path.read_bytes() != original:
                        raise CommandError(f"Backup verification failed for object: {path}")
                upload_object(path, optimized, content_type=output_type, upsert=True, timeout=timeout)
                optimized_count += 1
                saved_total += saved

        self.stdout.write(
            f"Mode={'APPLY' if apply_changes else 'DRY-RUN'}; "
            f"images_inspected={inspected}; would_save_or_saved_objects="
            f"{optimized_count if apply_changes else would_optimize}; "
            f"skipped={skipped}; bytes_saved={saved_total}"
        )
        if not apply_changes:
            self.stdout.write(self.style.WARNING(
                "Dry-run only: no objects were changed. To apply, supply --backup-dir on a persistent local disk; each original is verified there before overwrite."
            ))

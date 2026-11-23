"""Safely report and optionally optimize existing images in Supabase Storage.

Dry-run reads object metadata only: it NEVER downloads image bodies. Applying
changes is an explicit, separately guarded operation that preserves and verifies
each original locally before overwriting the Storage object.
"""
from __future__ import annotations

import mimetypes
from pathlib import Path

import requests
from django.core.management.base import BaseCommand, CommandError

from core.image_optimizer import optimize_part_image
from core.supabase_storage import (
    _quoted_object_path,
    _admin_headers,
    require_admin_config,
    upload_object,
)


SUPPORTED_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"}
DEFAULT_LIMIT = 20
MAX_APPLY_OBJECTS = 20
MAX_APPLY_DOWNLOAD_BYTES = 100 * 1024 * 1024


class Command(BaseCommand):
    help = "Report Storage image metadata or explicitly optimize a guarded sample"

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply", action="store_true",
            help="Download and optimize images; originals are backed up before overwrite.",
        )
        parser.add_argument(
            "--limit", type=int, default=DEFAULT_LIMIT,
            help="Maximum objects to inspect (default: 20; 0 scans all metadata).",
        )
        parser.add_argument("--timeout", type=int, default=60)
        parser.add_argument(
            "--backup-dir", default="",
            help="Local directory for verified copies of originals; required with --apply.",
        )
        parser.add_argument(
            "--allow-large-download", action="store_true",
            help="Explicitly override the 20-object / 100-MB safety limits for --apply.",
        )

    def handle(self, *args, **options):
        try:
            base, bucket, key = require_admin_config()
        except Exception as exc:
            raise CommandError(str(exc)) from exc

        apply_changes = bool(options["apply"])
        allow_large = bool(options["allow_large_download"])
        backup_dir = str(options.get("backup_dir") or "").strip()
        if apply_changes and not backup_dir:
            raise CommandError(
                "--apply requires --backup-dir. Originals must be saved locally before any overwrite."
            )
        backup_root = Path(backup_dir).expanduser().resolve() if backup_dir else None
        limit = max(0, int(options["limit"]))
        timeout = int(options["timeout"])
        headers = _admin_headers(key, "application/json")
        headers["Content-Type"] = "application/json"
        session = requests.Session()

        # Listing returns metadata (including object size) and does not fetch image bodies.
        pending = [""]
        objects = []
        while pending:
            prefix = pending.pop()
            offset = 0
            while True:
                response = session.post(
                    f"{base}/storage/v1/object/list/{bucket}",
                    json={
                        "prefix": prefix,
                        "limit": 100,
                        "offset": offset,
                        "sortBy": {"column": "name", "order": "asc"},
                    },
                    headers=headers,
                    timeout=timeout,
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

        candidates = []
        skipped = 0
        unknown_size = []
        total_bytes = 0
        for path, row in objects:
            metadata = row.get("metadata") or {}
            guessed = mimetypes.guess_type(path)[0] or ""
            content_type = str(
                metadata.get("mimetype") or metadata.get("contentType") or guessed
            ).lower()
            if content_type not in SUPPORTED_TYPES:
                skipped += 1
                continue
            raw_size = metadata.get("size", row.get("size"))
            try:
                size = int(raw_size)
            except (TypeError, ValueError):
                size = None
            if size is None or size < 0:
                unknown_size.append(path)
            else:
                total_bytes += size
            candidates.append((path, content_type, size))

        if apply_changes and not allow_large:
            if len(candidates) > MAX_APPLY_OBJECTS:
                raise CommandError(
                    f"Refusing to download {len(candidates)} images. Limit is "
                    f"{MAX_APPLY_OBJECTS}; use --limit to select a smaller sample, "
                    "or --allow-large-download only after reviewing the risk."
                )
            if unknown_size:
                raise CommandError(
                    "Refusing --apply because Storage metadata is missing file sizes. "
                    "Inspect metadata first or explicitly use --allow-large-download."
                )
            if total_bytes > MAX_APPLY_DOWNLOAD_BYTES:
                raise CommandError(
                    f"Refusing to download {total_bytes / 1024 / 1024:.1f} MB. "
                    "The default --apply limit is 100 MB; use --allow-large-download "
                    "only after reviewing the exact sample."
                )

        self.stdout.write(
            f"Mode={'APPLY' if apply_changes else 'DRY-RUN (METADATA ONLY)'}; "
            f"objects_listed={len(objects)}; supported_images={len(candidates)}; "
            f"metadata_total={total_bytes} bytes; skipped={skipped}"
        )

        if not apply_changes:
            for path, content_type, size in candidates:
                size_label = f"{size} bytes" if size is not None else "size unknown"
                self.stdout.write(f"METADATA ONLY {path}: {size_label} ({content_type})")
            self.stdout.write(self.style.SUCCESS(
                "Dry-run complete. No image bodies were downloaded and no Storage objects were changed."
            ))
            return

        optimized_count = saved_total = unchanged = 0
        for path, content_type, metadata_size in candidates:
            get_url = f"{base}/storage/v1/object/{bucket}/{_quoted_object_path(path)}"
            download = session.get(
                get_url,
                headers={"apikey": key, "Authorization": f"Bearer {key}"},
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
                unchanged += 1
                self.stdout.write(f"UNCHANGED {path}: {len(original)} bytes")
                continue

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

            upload_object(
                path, optimized, content_type=output_type, upsert=True, timeout=timeout
            )
            optimized_count += 1
            saved_total += saved
            self.stdout.write(
                f"OPTIMIZED {path}: {len(original)} -> {len(optimized)} bytes "
                f"(saved {saved})"
            )

        self.stdout.write(self.style.SUCCESS(
            f"Apply complete; optimized={optimized_count}; unchanged={unchanged}; "
            f"skipped={skipped}; bytes_saved={saved_total}"
        ))

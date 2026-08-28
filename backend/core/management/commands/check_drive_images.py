from django.core.management.base import BaseCommand, CommandError

from core.drive_images import (
    DriveImageConfigError,
    DriveImageNotFound,
    download_drive_file,
    normalize_drive_relative_path,
    resolve_drive_file,
    root_folder_id,
)


class Command(BaseCommand):
    help = "Check Google Drive relative image path configuration for PartsFlow"

    def add_arguments(self, parser):
        parser.add_argument(
            "--path",
            default="DATA1_Images/G3D00001.PIC.113206.jpg",
            help="Drive relative path to test",
        )

    def handle(self, *args, **options):
        value = options["path"]
        normalized = normalize_drive_relative_path(value)
        if not normalized:
            raise CommandError("Path ต้องอยู่ในรูป DATA1_Images/filename.jpg")

        self.stdout.write(f"Root folder ID: {root_folder_id()}")
        self.stdout.write(f"Testing path: {normalized}")
        try:
            file_id, mime_type, name = resolve_drive_file(normalized)
            data = download_drive_file(file_id)
        except (DriveImageConfigError, DriveImageNotFound) as exc:
            raise CommandError(str(exc)) from exc
        except Exception as exc:
            raise CommandError(f"Google Drive API error: {exc}") from exc

        self.stdout.write(self.style.SUCCESS("Google Drive image access: OK"))
        self.stdout.write(f"File: {name}")
        self.stdout.write(f"File ID: {file_id}")
        self.stdout.write(f"MIME: {mime_type}")
        self.stdout.write(f"Bytes: {len(data):,}")

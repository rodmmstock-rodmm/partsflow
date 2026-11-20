from io import StringIO
from unittest.mock import patch

from django.core.management import call_command
from django.test import TestCase

from core.models import Part


class PartImageFilenameMigrationTests(TestCase):
    def setUp(self):
        self.part = Part.objects.create(
            sku="PART-001",
            name="Test Part",
            image_path="DATA1_Images/Legacy/old-name.jpg",
        )

    def test_dry_run_does_not_change_part_or_upload(self):
        output = StringIO()
        with patch("core.management.commands.migrate_part_image_filenames.upload_object") as upload:
            call_command(
                "migrate_part_image_filenames",
                "--report=/tmp/partsflow-image-migration-dry-run.csv",
                stdout=output,
            )

        self.part.refresh_from_db()
        self.assertEqual(self.part.image_path, "DATA1_Images/Legacy/old-name.jpg")
        upload.assert_not_called()
        self.assertIn("DRY-RUN", output.getvalue())
        self.assertIn("Would migrate: 1", output.getvalue())

    @patch("core.management.commands.migrate_part_image_filenames.backup_web_upload", return_value={"verified": True})
    @patch("core.management.commands.migrate_part_image_filenames.public_url_for_object", return_value="https://storage.example/new-image")
    @patch("core.management.commands.migrate_part_image_filenames.storage_object_path", return_value="drive-source/new/SKU.jpg")
    @patch("core.management.commands.migrate_part_image_filenames.upload_object")
    @patch("core.management.commands.migrate_part_image_filenames.source_image", return_value=(b"image-bytes", "image/jpeg"))
    @patch("core.management.commands.migrate_part_image_filenames.requests.get")
    def test_apply_verifies_new_copy_before_updating_part_path(
        self, get, _source, upload, _storage_path, _public_url, _drive_backup
    ):
        class VerifiedImage:
            status_code = 200
            content = b"image-bytes"

        get.return_value = VerifiedImage()
        output = StringIO()
        call_command(
            "migrate_part_image_filenames",
            "--apply",
            "--report=/tmp/partsflow-image-migration-apply.csv",
            stdout=output,
        )

        self.part.refresh_from_db()
        self.assertEqual(
            self.part.image_path,
            "DATA1_Images/WebUploads/PART-001/PART-001.jpg",
        )
        upload.assert_called_once()
        self.assertIn("Migrated: 1", output.getvalue())

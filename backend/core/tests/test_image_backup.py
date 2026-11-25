from io import BytesIO
from unittest.mock import patch
from zipfile import ZipFile

from django.test import TestCase
from rest_framework.response import Response
from rest_framework.test import APIRequestFactory

from core.image_backup_api import image_backup


class ImageBackupTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()

    @patch("core.image_backup_api.requests.get")
    @patch("core.image_backup_api.public_url_for_object", return_value="https://storage.example/image")
    @patch("core.image_backup_api.storage_object_path", side_effect=lambda value: f"object/{value}")
    @patch("core.image_backup_api._image_rows", return_value=[
        ("Stock", "PART-001", "DATA1_Images/WebUploads/PART-001/abc/PART-001.jpg"),
        ("Tooling", "GTOOL00001", "DATA1_Images/Tooling/GTOOL00001/image.png"),
        ("Gauge-Control", "GAUGE-01", "DATA1_Images/Tools/GAUGE-01/image.gif"),
    ])
    @patch("core.image_backup_api.permissions_for", return_value={
        "can_view_tooling": True, "can_view_tools": True,
    })
    @patch("core.image_backup_api.require_permission", return_value=(object(), None))
    def test_downloads_stock_tooling_and_gauge_images_with_manifest(
        self, _permission, _permissions, _rows, _object_path, _public_url, get
    ):
        class ImageResponse:
            status_code = 200
            content = b"image-bytes"

        get.return_value = ImageResponse()
        # Existing test fixtures do not include Google Drive copies; verify
        # that the endpoint safely falls back to Supabase Storage.
        with patch("core.image_backup_api.resolve_drive_file", side_effect=Exception("Drive unavailable")):
            response = image_backup(self.factory.get("/api/backup/images.zip/"))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/zip")
        archive = ZipFile(BytesIO(b"".join(response.streaming_content)))
        self.assertEqual(
            set(archive.namelist()),
            {
                "Stock/PART-001.jpg",
                "Tooling/GTOOL00001.png",
                "Gauge-Control/GAUGE-01.gif",
                "backup_manifest.csv",
                "README.txt",
            },
        )
        self.assertEqual(archive.read("Stock/PART-001.jpg"), b"image-bytes")
        self.assertIn("Downloaded: 3", archive.read("README.txt").decode("utf-8"))
        self.assertEqual(get.call_count, 3)

    def test_image_backup_requires_all_three_view_permissions(self):
        denied = Response({"detail": "forbidden"}, status=403)
        with patch("core.image_backup_api.require_permission", return_value=(object(), None)):
            with patch("core.image_backup_api.permissions_for", return_value={
                "can_view_tooling": True, "can_view_tools": False,
            }):
                response = image_backup(self.factory.get("/api/backup/images.zip/"))
        self.assertEqual(response.status_code, 403)

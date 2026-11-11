import os
import unittest
from unittest.mock import patch

from core.supabase_storage import public_image_url


class PublicImageUrlTests(unittest.TestCase):
    def setUp(self):
        self.environment = {
            "SUPABASE_URL": "https://example-project.supabase.co",
            "SUPABASE_STORAGE_BUCKET": "parts-images",
        }

    def test_uses_existing_supabase_url_when_proxy_is_not_configured(self):
        with patch.dict(os.environ, self.environment, clear=True):
            url = public_image_url("DATA1_Images/Stock/part-photo.jpg")

        self.assertTrue(
            url.startswith(
                "https://example-project.supabase.co/storage/v1/object/public/"
                "parts-images/drive-source/"
            )
        )
        self.assertIn("?v=imgopt1-", url)

    def test_uses_cloudflare_proxy_only_when_opted_in(self):
        env = {
            **self.environment,
            "SUPABASE_IMAGE_PROXY_URL": "https://partsflow-image-cache.example.workers.dev/",
        }
        with patch.dict(os.environ, env, clear=True):
            url = public_image_url("DATA1_Images/Stock/part-photo.jpg")

        self.assertTrue(
            url.startswith(
                "https://partsflow-image-cache.example.workers.dev/image/"
                "drive-source/"
            )
        )
        self.assertIn("?v=imgopt1-", url)
        self.assertNotIn("supabase.co/storage", url)

    def test_invalid_drive_path_returns_empty_url(self):
        with patch.dict(os.environ, self.environment, clear=True):
            self.assertEqual(public_image_url("../private/photo.jpg"), "")


if __name__ == "__main__":
    unittest.main()

from io import StringIO
from unittest.mock import patch

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import SimpleTestCase


class OptimizeSupabaseImagesCommandTests(SimpleTestCase):
    def setUp(self):
        self.list_response = type(
            "Response",
            (),
            {
                "status_code": 200,
                "json": lambda _self: [
                    {
                        "name": "large-part.png",
                        "id": "object-id",
                        "metadata": {"mimetype": "image/png", "size": "5242880"},
                    }
                ],
                "text": "",
            },
        )()

    @patch(
        "core.management.commands.optimize_supabase_images.require_admin_config",
        return_value=("https://example.supabase.co", "parts-images", "secret"),
    )
    @patch("requests.Session.post")
    @patch("requests.Session.get", side_effect=AssertionError("dry-run must not download image bodies"))
    def test_dry_run_reads_metadata_without_downloading_image(self, get_mock, post_mock, _config):
        post_mock.return_value = self.list_response
        output = StringIO()

        call_command("optimize_supabase_images", limit=20, stdout=output)

        get_mock.assert_not_called()
        self.assertIn("METADATA ONLY", output.getvalue())
        self.assertIn("5242880 bytes", output.getvalue())
        self.assertIn("No image bodies were downloaded", output.getvalue())

    @patch(
        "core.management.commands.optimize_supabase_images.require_admin_config",
        return_value=("https://example.supabase.co", "parts-images", "secret"),
    )
    @patch("requests.Session.post")
    @patch("requests.Session.get")
    def test_apply_refuses_sample_over_100mb_before_download(self, get_mock, post_mock, _config):
        oversized = type(
            "Response",
            (),
            {
                "status_code": 200,
                "json": lambda _self: [
                    {
                        "name": "large-part.png",
                        "id": "object-id",
                        "metadata": {"mimetype": "image/png", "size": str(101 * 1024 * 1024)},
                    }
                ],
                "text": "",
            },
        )()
        post_mock.return_value = oversized

        with self.assertRaises(CommandError):
            call_command(
                "optimize_supabase_images",
                apply=True,
                limit=20,
                backup_dir="/tmp/partsflow-test-backups",
                stdout=StringIO(),
            )

        get_mock.assert_not_called()

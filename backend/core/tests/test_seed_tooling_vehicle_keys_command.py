from io import StringIO

from django.core.management import call_command
from django.test import TestCase

from core.models import ToolingVehicleKey


class SeedToolingVehicleKeysCommandTests(TestCase):
    def test_keys_are_not_seeded_by_migrations_and_command_is_explicit_idempotent(self):
        # Migration 0044 must not create operational records during deploy.
        self.assertEqual(ToolingVehicleKey.objects.count(), 0)

        existing = ToolingVehicleKey.objects.create(
            vehicle_number=1,
            label="ชื่อที่ผู้ใช้กำหนดเอง",
            remark="ห้ามเขียนทับ",
            active=False,
        )

        output = StringIO()
        call_command("seed_tooling_vehicle_keys", stdout=output)

        self.assertEqual(ToolingVehicleKey.objects.count(), 13)
        existing.refresh_from_db()
        self.assertEqual(existing.label, "ชื่อที่ผู้ใช้กำหนดเอง")
        self.assertEqual(existing.remark, "ห้ามเขียนทับ")
        self.assertFalse(existing.active)

        # Re-running the explicit command must not duplicate or overwrite.
        call_command("seed_tooling_vehicle_keys", stdout=StringIO())
        self.assertEqual(ToolingVehicleKey.objects.count(), 13)

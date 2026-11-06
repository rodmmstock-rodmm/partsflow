from unittest.mock import patch

from django.test import TestCase
from rest_framework.test import APIRequestFactory
from rest_framework.response import Response
from openpyxl import load_workbook
from io import BytesIO

from core.backup_api import gauge_control_backup, stock_backup, tooling_backup
from core.models import Part, ToolEquipment, ToolingItem


class BackupExportTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()

    def workbook_from(self, response):
        self.assertEqual(response.status_code, 200)
        self.assertIn(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            response["Content-Type"],
        )
        return load_workbook(BytesIO(response.content), read_only=True)

    @patch("core.backup_api.require_permission", return_value=(object(), None))
    def test_stock_backup_contains_all_parts_and_no_history_sheet(self, _permission):
        Part.objects.create(sku="BK-ACTIVE", name="Active part", active=True)
        Part.objects.create(sku="BK-INACTIVE", name="Inactive part", active=False)

        response = stock_backup(self.factory.get("/api/backup/stock.xlsx/"))
        workbook = self.workbook_from(response)

        self.assertEqual(
            workbook.sheetnames,
            ["ข้อมูลการสำรอง", "รายการอะไหล่", "ยอดตามตำแหน่ง"],
        )
        rows = list(workbook["รายการอะไหล่"].values)
        skus = {row[0] for row in rows[1:]}
        self.assertEqual(skus, {"BK-ACTIVE", "BK-INACTIVE"})

    @patch("core.backup_api.require_permission", return_value=(object(), None))
    def test_tooling_backup_includes_inactive_records(self, _permission):
        ToolingItem.objects.create(name="Backup active", active=True)
        ToolingItem.objects.create(name="Backup inactive", active=False)

        response = tooling_backup(self.factory.get("/api/backup/tooling.xlsx/"))
        workbook = self.workbook_from(response)

        self.assertEqual(workbook.sheetnames, ["ข้อมูลการสำรอง", "รายการ Tooling"])
        rows = list(workbook["รายการ Tooling"].values)
        self.assertEqual({row[0] for row in rows[1:]}, {"Backup active", "Backup inactive"})

    @patch("core.backup_api.require_permission", return_value=(object(), None))
    def test_gauge_backup_exports_equipment_only(self, _permission):
        ToolEquipment.objects.create(code="BK-GAUGE", name="Gauge item", image_path="images/gauge.jpg")

        response = gauge_control_backup(self.factory.get("/api/backup/gauge-control.xlsx/"))
        workbook = self.workbook_from(response)

        self.assertEqual(workbook.sheetnames, ["ข้อมูลการสำรอง", "รายการ Gauge Control"])
        rows = list(workbook["รายการ Gauge Control"].values)
        self.assertEqual(rows[1][0], "BK-GAUGE")
        self.assertNotIn("ประวัติการยืม-คืน", workbook.sheetnames)

    def test_backup_endpoints_enforce_permissions(self):
        denied = Response({"detail": "forbidden"}, status=403)
        with patch("core.backup_api.require_permission", return_value=(None, denied)):
            for view, path in (
                (stock_backup, "/api/backup/stock.xlsx/"),
                (tooling_backup, "/api/backup/tooling.xlsx/"),
                (gauge_control_backup, "/api/backup/gauge-control.xlsx/"),
            ):
                response = view(self.factory.get(path))
                self.assertEqual(response.status_code, 403)

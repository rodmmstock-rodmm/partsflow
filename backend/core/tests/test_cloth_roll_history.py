from datetime import datetime
from zoneinfo import ZoneInfo

from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from core.models import ClothRollStock, ClothRollTransaction, Employee, RoleAccess


class ClothRollHistoryFilterAndDeleteTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.role = RoleAccess.objects.create(
            role_name="CLOTH_HISTORY_ADMIN",
            can_view_cloth_rolls=True,
            can_delete_cloth_roll_history=True,
        )
        self.employee = Employee.objects.create(
            employee_code="TEST-CLOTH-HISTORY",
            name="Cloth History Tester",
            role=self.role.role_name,
        )
        session = self.client.session
        session["partsflow_employee_id"] = str(self.employee.id)
        session.save()
        self.stock = ClothRollStock.objects.create(
            phase=ClothRollStock.PHASE_4,
            quantity=5,
            low_stock_threshold=1,
        )

    def create_transaction(self, year, month, tx_type, quantity, balance_after):
        row = ClothRollTransaction.objects.create(
            phase=ClothRollStock.PHASE_4,
            transaction_type=tx_type,
            quantity=quantity,
            balance_after=balance_after,
            recorded_by_employee=self.employee,
            source="WEB",
        )
        # created_at is auto_now_add; update it explicitly for deterministic
        # year/month filtering tests.
        timestamp = datetime(year, month, 12, 10, 0, tzinfo=ZoneInfo("UTC"))
        ClothRollTransaction.objects.filter(pk=row.pk).update(created_at=timestamp)
        row.refresh_from_db()
        return row

    def test_history_filters_to_requested_year_and_month(self):
        january = self.create_transaction(2026, 1, ClothRollTransaction.TYPE_OUT, 1, 4)
        february = self.create_transaction(2026, 2, ClothRollTransaction.TYPE_IN, 2, 6)
        response = self.client.get(
            reverse("web-cloth-rolls"),
            {"year": "2026", "month": "1"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual([row["id"] for row in response.data["transactions"]], [str(january.id)])

        response = self.client.get(
            reverse("web-cloth-rolls"),
            {"year": "2026", "month": "2"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual([row["id"] for row in response.data["transactions"]], [str(february.id)])

    def test_delete_history_requires_dedicated_permission(self):
        self.role.can_delete_cloth_roll_history = False
        self.role.save(update_fields=["can_delete_cloth_roll_history"])
        row = self.create_transaction(2026, 1, ClothRollTransaction.TYPE_OUT, 2, 5)

        response = self.client.delete(
            reverse("web-cloth-roll-transaction-detail", kwargs={"pk": row.id})
        )

        self.assertEqual(response.status_code, 403)
        self.assertTrue(ClothRollTransaction.objects.filter(pk=row.pk).exists())
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.quantity, 5)

    def test_deleting_withdrawal_restores_stock_and_removes_history(self):
        row = self.create_transaction(2026, 1, ClothRollTransaction.TYPE_OUT, 2, 5)

        response = self.client.delete(
            reverse("web-cloth-roll-transaction-detail", kwargs={"pk": row.id})
        )

        self.assertEqual(response.status_code, 200)
        self.assertFalse(ClothRollTransaction.objects.filter(pk=row.pk).exists())
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.quantity, 7)

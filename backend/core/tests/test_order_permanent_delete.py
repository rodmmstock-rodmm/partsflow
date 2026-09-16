from datetime import date
from unittest.mock import patch

from django.test import TestCase
from rest_framework.test import APIRequestFactory

from core.models import Employee, Machine, OrderRecord
from core.order_delete_api import permanent_delete_order


class PermanentOrderDeleteTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.actor = Employee.objects.create(
            employee_code="ADMIN-DELETE",
            name="Delete Admin",
            role="admin",
        )
        self.machine = Machine.objects.create(code="MC-DELETE", name="Delete Machine")

    def make_order(self, *, is_deleted=True):
        return OrderRecord.objects.create(
            order_number="EXCEL-DELETE-TEST",
            order_date=date.today(),
            machine=self.machine,
            job="REPAIR",
            part_name="Delete Test Part",
            amount=1,
            unit_text="EA",
            is_deleted=is_deleted,
        )

    @patch("core.order_delete_api.audit")
    @patch("core.order_delete_api.require_permission")
    def test_deleted_order_can_be_removed_from_database(self, require_permission, audit):
        require_permission.return_value = (self.actor, None)
        order = self.make_order(is_deleted=True)

        response = permanent_delete_order(
            self.factory.delete(f"/api/orders/{order.id}/permanent-delete/"),
            order.id,
        )

        self.assertEqual(response.status_code, 200)
        self.assertFalse(OrderRecord.objects.filter(pk=order.id).exists())
        audit.assert_called_once()
        self.assertEqual(audit.call_args.args[1], "HARD_DELETE")
        self.assertEqual(require_permission.call_count, 2)

    @patch("core.order_delete_api.audit")
    @patch("core.order_delete_api.require_permission")
    def test_active_order_cannot_be_permanently_deleted(self, require_permission, audit):
        require_permission.return_value = (self.actor, None)
        order = self.make_order(is_deleted=False)

        response = permanent_delete_order(
            self.factory.delete(f"/api/orders/{order.id}/permanent-delete/"),
            order.id,
        )

        self.assertEqual(response.status_code, 404)
        self.assertTrue(OrderRecord.objects.filter(pk=order.id).exists())
        audit.assert_not_called()

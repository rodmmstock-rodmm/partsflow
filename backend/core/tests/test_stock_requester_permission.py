from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase
from rest_framework.test import APIRequestFactory

from core.models import Employee, Inventory, Machine, Part, RoleAccess, StockTransaction
from core.stock_api import issue_stock


class IssueRequesterPermissionTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.role = RoleAccess.objects.create(
            role_name="STOCK_OPERATOR",
            can_issue_stock=True,
            can_select_issue_requester=False,
        )
        self.recorder = Employee.objects.create(
            employee_code="REC-001",
            name="Recorder",
            role=self.role.role_name,
            active=True,
        )
        self.requester = Employee.objects.create(
            employee_code="REQ-001",
            name="Requester",
            active=True,
        )
        self.machine = Machine.objects.create(
            code="MC-001",
            name="Machine",
            active=True,
        )
        self.part = Part.objects.create(sku="P-001", name="Part")
        Inventory.objects.create(part=self.part, quantity=Decimal("10"))

    def issue(self, payload):
        request = self.factory.post(
            "/api/stock/issue/",
            {
                "part_id": str(self.part.id),
                "quantity": 1,
                "machine_id": str(self.machine.id),
                **payload,
            },
            format="json",
        )
        with patch(
            "core.stock_api.require_permission",
            return_value=(self.recorder, None),
        ):
            return issue_stock(request)

    def test_without_permission_uses_logged_in_employee_as_requester(self):
        response = self.issue({})

        self.assertEqual(response.status_code, 200)
        transaction = StockTransaction.objects.get(part=self.part)
        self.assertEqual(transaction.employee_id, self.recorder.id)
        self.assertEqual(transaction.recorded_by_employee_id, self.recorder.id)

    def test_without_permission_rejects_another_requester(self):
        response = self.issue({"requester_id": str(self.requester.id)})

        self.assertEqual(response.status_code, 403)
        self.assertFalse(StockTransaction.objects.filter(part=self.part).exists())

    def test_with_permission_allows_selecting_another_requester(self):
        self.role.can_select_issue_requester = True
        self.role.save(update_fields=["can_select_issue_requester", "updated_at"])

        response = self.issue({"requester_id": str(self.requester.id)})

        self.assertEqual(response.status_code, 200)
        transaction = StockTransaction.objects.get(part=self.part)
        self.assertEqual(transaction.employee_id, self.requester.id)
        self.assertEqual(transaction.recorded_by_employee_id, self.recorder.id)

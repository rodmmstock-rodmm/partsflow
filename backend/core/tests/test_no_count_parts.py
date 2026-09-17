from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase
from rest_framework.test import APIRequestFactory

from core.models import Employee, Inventory, Machine, Part, StockTransaction
from core.stock_api import is_no_count_part, issue_stock
from core.web_api import part_stock_status


class NoCountPartTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.recorder = Employee.objects.create(
            employee_code="REC-N",
            name="Recorder",
            active=True,
        )
        self.requester = Employee.objects.create(
            employee_code="REQ-N",
            name="Requester",
            active=True,
        )
        self.machine = Machine.objects.create(
            code="MC-N",
            name="Machine",
            active=True,
        )

    def issue(self, part, quantity):
        request = self.factory.post(
            "/api/stock/issue/",
            {
                "part_id": str(part.id),
                "quantity": quantity,
                "requester_id": str(self.requester.id),
                "machine_id": str(self.machine.id),
            },
            format="json",
        )
        with patch(
            "core.stock_api.require_permission",
            return_value=(self.recorder, None),
        ):
            return issue_stock(request)

    def test_n_prefix_issue_records_history_without_reducing_stock(self):
        part = Part.objects.create(sku="N-001", name="No-count part", min_stock=10)
        inventory = Inventory.objects.create(part=part, quantity=Decimal("0"))

        response = self.issue(part, 25)

        self.assertEqual(response.status_code, 200)
        inventory.refresh_from_db()
        self.assertEqual(inventory.quantity, Decimal("0"))
        self.assertEqual(response.data["stock_before"], 0.0)
        self.assertEqual(response.data["stock_after"], 0.0)
        transaction = StockTransaction.objects.get(part=part)
        self.assertEqual(transaction.transaction_type, "ISSUE")
        self.assertEqual(transaction.quantity, Decimal("25"))

    def test_regular_part_still_rejects_issue_above_stock(self):
        part = Part.objects.create(sku="P-001", name="Counted part")
        Inventory.objects.create(part=part, quantity=Decimal("2"))

        response = self.issue(part, 3)

        self.assertEqual(response.status_code, 400)
        self.assertEqual(StockTransaction.objects.filter(part=part).count(), 0)

    def test_n_prefix_is_case_insensitive_and_always_normal(self):
        part = Part(sku=" n-002 ", name="No-count part", min_stock=10)
        part.active_ordering = True

        self.assertTrue(is_no_count_part(part))
        self.assertEqual(
            part_stock_status(part, Decimal("0")),
            {"stock_status": "normal", "stock_status_label": "normal"},
        )

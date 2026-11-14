from decimal import Decimal

from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from core.models import (
    Employee,
    Inventory,
    Location,
    Machine,
    MachineSpareSet,
    MachineSpareSetItem,
    Maker,
    Part,
    RoleAccess,
    StockTransaction,
    Unit,
)


class MachineSpareSetBulkIssueTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.role = RoleAccess.objects.create(
            role_name="SPARE_SET_ISSUER",
            can_issue_stock=True,
            can_view_dashboard=True,
        )
        self.actor = Employee.objects.create(
            employee_code="SPARE-ISSUER-01",
            name="Spare Set Issuer",
            role=self.role.role_name,
        )
        session = self.client.session
        session["partsflow_employee_id"] = str(self.actor.id)
        session.save()

        self.machine = Machine.objects.create(code="SPARE-MC-01", name="Spare Set Machine")
        self.location = Location.objects.create(
            code="SPARE-LOC-01", name="Spare Set Location", warehouse="MM-4"
        )
        self.maker = Maker.objects.create(name="Spare Set Maker")
        self.unit = Unit.objects.create(code="PCS", name="Pieces", active=True)
        self.spare_set = MachineSpareSet.objects.create(
            machine=self.machine, name="Routine Spare Set", created_by_employee=self.actor
        )
        self.part_a = self.create_part("SPARE-A-01", "Part A", "5")
        self.part_b = self.create_part("SPARE-B-01", "Part B", "4")
        self.item_a = MachineSpareSetItem.objects.create(
            spare_set=self.spare_set, part=self.part_a, quantity=1
        )
        self.item_b = MachineSpareSetItem.objects.create(
            spare_set=self.spare_set, part=self.part_b, quantity=1
        )
        self.url = reverse("web-spare-set-bulk-issue")

    def create_part(self, sku, name, stock):
        part = Part.objects.create(
            sku=sku,
            name=name,
            maker=self.maker,
            unit=self.unit,
            location=self.location,
            min_stock=Decimal("0"),
            active=True,
        )
        Inventory.objects.create(
            part=part, location=self.location, quantity=Decimal(stock)
        )
        return part

    def test_bulk_issue_records_each_item_and_deducts_inventory(self):
        response = self.client.post(
            self.url,
            {
                "items": [
                    {"set_item_id": str(self.item_a.id), "quantity": "2"},
                    {"set_item_id": str(self.item_b.id), "quantity": "3"},
                ],
                "note": "Machine maintenance",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 2)
        self.assertEqual(
            Inventory.objects.get(part=self.part_a).quantity, Decimal("3")
        )
        self.assertEqual(
            Inventory.objects.get(part=self.part_b).quantity, Decimal("1")
        )
        transactions = StockTransaction.objects.filter(
            transaction_type="ISSUE"
        ).order_by("part__sku")
        self.assertEqual(transactions.count(), 2)
        self.assertEqual(
            list(transactions.values_list("machine_id", flat=True)),
            [self.machine.id, self.machine.id],
        )
        self.assertEqual(
            list(transactions.values_list("recorded_by_employee_id", flat=True)),
            [self.actor.id, self.actor.id],
        )

    def test_insufficient_stock_rolls_back_the_entire_bulk_issue(self):
        response = self.client.post(
            self.url,
            {
                "items": [
                    {"set_item_id": str(self.item_a.id), "quantity": "2"},
                    {"set_item_id": str(self.item_b.id), "quantity": "5"},
                ]
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            Inventory.objects.get(part=self.part_a).quantity, Decimal("5")
        )
        self.assertEqual(
            Inventory.objects.get(part=self.part_b).quantity, Decimal("4")
        )
        self.assertFalse(
            StockTransaction.objects.filter(transaction_type="ISSUE").exists()
        )

    def test_rejects_duplicate_or_inactive_set_items(self):
        response = self.client.post(
            self.url,
            {
                "items": [
                    {"set_item_id": str(self.item_a.id), "quantity": "1"},
                    {"set_item_id": str(self.item_a.id), "quantity": "1"},
                ]
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(
            StockTransaction.objects.filter(transaction_type="ISSUE").exists()
        )

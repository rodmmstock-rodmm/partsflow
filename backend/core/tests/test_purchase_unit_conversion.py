from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from core.models import Employee, Inventory, Machine, Maker, Part, RoleAccess, Unit, OrderRecord, StockTransaction


class SparePartPurchaseUnitConversionTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.role = RoleAccess.objects.create(
            role_name="PURCHASE_UNIT_TEST",
            can_add_order=True,
            can_receive_order=True,
        )
        self.actor = Employee.objects.create(
            employee_code="TEST-PU-ACTOR",
            name="Purchase Unit Actor",
            role=self.role.role_name,
        )
        self.requester = Employee.objects.create(
            employee_code="TEST-PU-REQUESTER",
            name="Purchase Unit Requester",
        )
        self.machine = Machine.objects.create(
            code="TEST-PU-MACHINE",
            name="Purchase Unit Test Machine",
        )
        self.unit = Unit.objects.create(code="PCS", name="Pieces")
        self.maker = Maker.objects.create(name="Purchase Unit Test Maker")
        self.part = Part.objects.create(
            sku="TEST-PU-001",
            name="Test Bolt",
            description="M8 bolt",
            unit=self.unit,
            maker=self.maker,
            min_stock=10,
            reorder_qty=5,
            reorder_unit_code="BOX",
            reorder_unit_stock_qty=500,
        )
        self.inventory = Inventory.objects.create(part=self.part, quantity=10)
        session = self.client.session
        session["partsflow_employee_id"] = str(self.actor.id)
        session.save()

    def create_order(self):
        response = self.client.post(
            reverse("web-orders-batch"),
            {
                "job": "SPARE",
                "ordered_by_id": str(self.requester.id),
                "remark": "Safety Stock",
                "items": [{
                    "item_type": "PART",
                    "part_id": str(self.part.id),
                    "amount": 999,
                    "unit": "PCS",
                    "machine_id": str(self.machine.id),
                    "factory": "MM-4",
                }],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        return OrderRecord.objects.get(id=response.data["results"][0]["id"])

    def test_safety_stock_part_payload_exposes_saved_purchase_unit(self):
        response = self.client.get(reverse("web-safety-stock"))
        self.assertEqual(response.status_code, 200, response.data)
        row = next(item for item in response.data["results"] if item["id"] == str(self.part.id))
        self.assertEqual(row["order_qty"], 5)
        self.assertEqual(row["order_unit_code"], "BOX")
        self.assertEqual(row["order_unit_stock_qty"], 500)

    def test_safety_stock_order_uses_saved_purchase_quantity_and_snapshots_conversion(self):
        order = self.create_order()
        self.assertEqual(order.amount, 5)
        self.assertEqual(order.unit_text, "BOX")
        self.assertEqual(order.stock_unit_text, "PCS")
        self.assertEqual(order.stock_unit_conversion, 500)
        self.assertEqual(order.stock_quantity_ordered, 2500)

    def test_receiving_purchase_unit_adds_converted_stock_quantity(self):
        order = self.create_order()
        response = self.client.post(
            reverse("web-order-receive", kwargs={"pk": order.id}),
            {},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.inventory.refresh_from_db()
        self.assertEqual(self.inventory.quantity, 2510)
        tx = StockTransaction.objects.get(reference_type="ORDER", reference_id=str(order.id))
        self.assertEqual(tx.quantity, 2500)

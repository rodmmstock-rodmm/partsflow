from datetime import date

from django.test import TestCase
from rest_framework.test import APIRequestFactory
from unittest.mock import patch

from core.models import Employee, Machine, OrderRecord, Supplier, SupplierContact
from core.order_rfq_compose_api import compose_order_rfq


class OrderRFQComposeTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.actor = Employee.objects.create(
            employee_code="RFQ-TEST-01",
            name="Requester One",
            role="PURCHASE",
        )
        self.machine = Machine.objects.create(code="MC-RFQ-01", name="Machine name")
        self.vendor = Supplier.objects.create(
            code="RFQ-VENDOR-01",
            name="Vendor Example",
            email="main@example.com",
            rfq_message="Please quote the following items.",
        )
        SupplierContact.objects.create(
            supplier=self.vendor,
            name="Contact Two",
            email="cc@example.com",
        )

    def make_order(self, number, *, pending_date=None, job="REPAIR", requester=None):
        return OrderRecord.objects.create(
            order_number=number,
            order_date=date(2026, 11, 11),
            machine=self.machine,
            job=job,
            pending_data_date=pending_date,
            ordered_by=requester or self.actor,
            part_name=f"Description {number}",
            maker_text="Maker A",
            amount=3,
            unit_text="EA",
        )

    def post_compose(self, order_ids, vendor_id=None):
        request = self.factory.post(
            "/api/orders/rfq-compose/",
            {"order_ids": order_ids, "vendor_id": str(vendor_id or self.vendor.id)},
            format="json",
        )
        with patch("core.order_rfq_compose_api.require_permission", return_value=(self.actor, None)):
            return compose_order_rfq(request)

    def test_groups_by_machine_job_and_pending_date_and_preserves_order(self):
        first = self.make_order("ORD-RFQ-2")
        second = self.make_order("ORD-RFQ-1")
        third = self.make_order("ORD-RFQ-DATE", pending_date=date(2026, 11, 10))

        response = self.post_compose([str(first.id), str(second.id), str(third.id)])

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["groups"]), 2)
        first_group = response.data["groups"][0]
        self.assertEqual(first_group["order_numbers"], [first.order_number, second.order_number])
        self.assertEqual(first_group["to"], "main@example.com")
        self.assertEqual(first_group["cc"], ["cc@example.com"])
        self.assertIn("Please quote the following items.\n\n", first_group["body"])
        self.assertIn("Order No. | Part ID | Description | Maker | Qty | Unit", first_group["body"])
        self.assertIn("Requester One", first_group["subject"])
        self.assertIn("(R)", first_group["subject"])
        self.assertNotIn("Machine name", first_group["subject"])

    def test_vendor_without_primary_email_is_rejected(self):
        self.vendor.email = ""
        self.vendor.save(update_fields=["email"])
        order = self.make_order("ORD-RFQ-NO-EMAIL")

        response = self.post_compose([str(order.id)])

        self.assertEqual(response.status_code, 400)
        self.assertIn("Email หลัก", response.data["detail"])

    def test_cancelled_order_in_selection_is_rejected(self):
        order = self.make_order("ORD-RFQ-CANCEL")
        order.lifecycle_status = OrderRecord.LIFECYCLE_CANCELLED
        order.save(update_fields=["lifecycle_status"])

        response = self.post_compose([str(order.id)])

        self.assertEqual(response.status_code, 400)
        self.assertIn("ถูกยกเลิก", response.data["detail"])

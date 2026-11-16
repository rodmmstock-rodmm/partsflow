from datetime import date

from django.test import TestCase
from rest_framework.test import APIRequestFactory
from unittest.mock import patch

from core.models import Employee, Machine, OrderRecord, Supplier, SupplierContact, SupplierRFQMessage
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
        self.vendor_message = SupplierRFQMessage.objects.create(
            supplier=self.vendor,
            employee=self.actor,
            message="Please quote the following items.",
        )

    def make_order(self, number, *, pending_date=None, job="REPAIR", requester=None, remark=""):
        return OrderRecord.objects.create(
            order_number=number,
            order_date=date(2026, 11, 11),
            machine=self.machine,
            job=job,
            pending_data_date=pending_date,
            remark=remark,
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
        self.assertEqual(first_group["message"], "Please quote the following items.")
        self.assertIn("<table", first_group["table_html"])
        self.assertIn("<td style=", first_group["table_html"])
        self.assertIn("Description ORD-RFQ-2", first_group["table_html"])
        self.assertIn("Description ORD-RFQ-1", first_group["table_html"])
        self.assertNotIn("<th", first_group["table_html"])
        self.assertNotIn("Order No.", first_group["table_html"])
        self.assertIn("┌", first_group["body"])
        self.assertIn("┬", first_group["body"])
        self.assertIn("├", first_group["body"])
        self.assertIn("└", first_group["body"])
        self.assertIn("Description ORD-RFQ-2", first_group["body"])
        self.assertIn("Description ORD-RFQ-1", first_group["body"])
        self.assertLess(
            first_group["body"].index("Description ORD-RFQ-2"),
            first_group["body"].index("Description ORD-RFQ-1"),
        )
        self.assertNotIn("Part ID", first_group["body"])
        self.assertNotIn("Description | Maker", first_group["body"])
        self.assertNotIn("Order No.", first_group["body"])
        self.assertNotIn("ORD-RFQ-2", first_group["body"].split("Please quote")[0])
        self.assertIn("Requester One", first_group["subject"])
        self.assertIn("(R)", first_group["subject"])
        self.assertNotIn("Machine name", first_group["subject"])

    def test_order_remarks_are_appended_to_subject_in_order_without_duplicates(self):
        first = self.make_order("ORD-RFQ-REMARK-1", remark="Urgent")
        second = self.make_order("ORD-RFQ-REMARK-2", remark="Line stop")
        third = self.make_order("ORD-RFQ-REMARK-3", remark="Urgent")

        response = self.post_compose([str(first.id), str(second.id), str(third.id)])

        self.assertEqual(response.status_code, 200)
        group = response.data["groups"][0]
        self.assertTrue(group["subject"].endswith(" - Urgent / Line stop"), group["subject"])

    def test_orders_without_remarks_keep_existing_subject_format(self):
        order = self.make_order("ORD-RFQ-NO-REMARK")

        response = self.post_compose([str(order.id)])

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["groups"][0]["subject"].endswith(" - "))

    def test_uses_message_for_selected_vendor_and_current_employee_only(self):
        self.vendor_message.message = "Message for this vendor and buyer."
        self.vendor_message.save(update_fields=["message"])
        other_employee = Employee.objects.create(
            employee_code="RFQ-TEST-02",
            name="Requester Two",
            role="PURCHASE",
        )
        SupplierRFQMessage.objects.create(
            supplier=self.vendor,
            employee=other_employee,
            message="Other buyer message must stay private.",
        )
        order = self.make_order("ORD-RFQ-USER-VENDOR-MESSAGE")

        response = self.post_compose([str(order.id)])

        self.assertEqual(response.status_code, 200)
        group = response.data["groups"][0]
        self.assertEqual(group["message"], "Message for this vendor and buyer.")
        self.assertTrue(group["body"].startswith("Message for this vendor and buyer.\n\n"))
        self.assertNotIn("Other buyer message must stay private.", group["body"])

    def test_missing_vendor_user_message_blocks_rfq_compose(self):
        self.vendor_message.delete()
        order = self.make_order("ORD-RFQ-MISSING-USER-MESSAGE")

        response = self.post_compose([str(order.id)])

        self.assertEqual(response.status_code, 400)
        self.assertIn("ตั้งค่า RFQ Message", response.data["detail"])

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

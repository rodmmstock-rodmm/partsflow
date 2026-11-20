from datetime import date

from django.test import TestCase
from rest_framework.test import APIRequestFactory
from unittest.mock import patch

from core.models import Employee, EmployeeRFQSubjectSetting, Machine, OrderRecord, Supplier, SupplierContact, SupplierRFQMessage
from core.order_rfq_compose_api import _compose_group, compose_order_rfq


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

    def post_compose(self, order_ids, vendor_id=None, subject_topic="RFQ"):
        request = self.factory.post(
            "/api/orders/rfq-compose/",
            {"order_ids": order_ids, "vendor_id": str(vendor_id or self.vendor.id), "subject_topic": subject_topic},
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
        self.assertIn("Machine name", first_group["subject"])
        self.assertNotIn("MC-RFQ-01", first_group["subject"])
        self.assertNotIn(" - ", first_group["subject"])

    def test_uses_saved_user_topic_phrase_and_formats_job_without_job_label(self):
        EmployeeRFQSubjectSetting.objects.create(
            employee=self.actor,
            topic_code="RFQ",
            phrase="ขอใบเสนอราคาสินค้าตามรายการ",
        )
        other_employee = Employee.objects.create(
            employee_code="RFQ-TEST-SUBJECT-OTHER",
            name="Other Buyer",
            role="PURCHASE",
        )
        SupplierRFQMessage.objects.create(
            supplier=self.vendor,
            employee=other_employee,
            message="Other buyer message",
        )
        EmployeeRFQSubjectSetting.objects.create(
            employee=other_employee,
            topic_code="RFQ",
            phrase="Private phrase for another buyer",
        )
        order = self.make_order(
            "ORD-RFQ-CUSTOM-SUBJECT",
            pending_date=date(2026, 11, 10),
        )

        response = self.post_compose([str(order.id)])

        self.assertEqual(response.status_code, 200)
        subject = response.data["groups"][0]["subject"]
        self.assertEqual(
            subject,
            "Vendor Example ขอใบเสนอราคาสินค้าตามรายการ Machine name (R) Requester One",
        )
        self.assertNotIn("JOB", subject)
        self.assertNotIn("Private phrase for another buyer", subject)

    def test_empty_user_subject_phrase_keeps_default_phrase(self):
        order = self.make_order("ORD-RFQ-DEFAULT-SUBJECT")

        response = self.post_compose([str(order.id)])

        self.assertEqual(response.status_code, 200)
        self.assertTrue(
            response.data["groups"][0]["subject"].startswith(
                "Vendor Example รบกวนขอราคา Machine name (R)"
            )
        )

    def test_compose_uses_selected_subject_topic_for_current_user(self):
        EmployeeRFQSubjectSetting.objects.create(
            employee=self.actor,
            topic_code="DELIVERY_DATE",
            phrase="ขอแจ้งกำหนดส่ง",
        )
        order = self.make_order("ORD-RFQ-DELIVERY-TOPIC")

        response = self.post_compose(
            [str(order.id)],
            subject_topic="DELIVERY_DATE",
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn("ขอแจ้งกำหนดส่ง", response.data["groups"][0]["subject"])
        self.assertNotIn("รบกวนขอราคา", response.data["groups"][0]["subject"])

    def test_price_update_and_delivery_date_use_their_own_user_phrases(self):
        order = self.make_order("ORD-RFQ-EMAIL-TYPES")
        EmployeeRFQSubjectSetting.objects.create(
            employee=self.actor,
            topic_code="RFQ",
            phrase="ขอใบเสนอราคาตามรายการ",
        )
        EmployeeRFQSubjectSetting.objects.create(
            employee=self.actor,
            topic_code="PRICE_UPDATE",
            phrase="ขออัปเดตราคาล่าสุด",
        )
        EmployeeRFQSubjectSetting.objects.create(
            employee=self.actor,
            topic_code="DELIVERY_DATE",
            phrase="ขอยืนยันวันจัดส่ง",
        )

        self.vendor_message.message = "ข้อความติดตามกำหนดส่งเฉพาะ Vendor และผู้ใช้นี้"
        self.vendor_message.save(update_fields=["message"])

        rfq_response = self.post_compose([str(order.id)], subject_topic="RFQ")
        price_response = self.post_compose([str(order.id)], subject_topic="PRICE_UPDATE")
        delivery_response = self.post_compose([str(order.id)], subject_topic="DELIVERY_DATE")

        self.assertEqual(rfq_response.status_code, 200)
        self.assertEqual(price_response.status_code, 200)
        self.assertEqual(delivery_response.status_code, 200)
        self.assertIn("ขอใบเสนอราคาตามรายการ", rfq_response.data["groups"][0]["subject"])
        self.assertIn("ขอใบเสนอราคาตามรายการ", rfq_response.data["groups"][0]["email_intro"])
        self.assertIn("ขอใบเสนอราคาตามรายการ", rfq_response.data["groups"][0]["body"])
        self.assertIn("ขออัปเดตราคาล่าสุด", price_response.data["groups"][0]["subject"])
        self.assertIn("ขออัปเดตราคาล่าสุด", price_response.data["groups"][0]["email_intro"])
        self.assertIn("ขออัปเดตราคาล่าสุด", price_response.data["groups"][0]["body"])
        self.assertIn("ขอยืนยันวันจัดส่ง", delivery_response.data["groups"][0]["subject"])
        self.assertIn("อัปเดตราคาสินค้า", price_response.data["groups"][0]["message"])
        self.assertTrue(
            price_response.data["groups"][0]["email_intro"].startswith(
                "เรียน ผู้ขาย\\n\\nรบกวนอัปเดตราคาสินค้าตามรายการด้านล่าง"
            )
        )
        self.assertTrue(
            price_response.data["groups"][0]["email_intro"].endswith(
                "\\n\\nขออัปเดตราคาล่าสุด"
            )
        )
        self.assertEqual(
            rfq_response.data["groups"][0]["email_intro"].splitlines()[:3],
            [
                "Please quote the following items.",
                "",
                "ขอใบเสนอราคาตามรายการ",
            ],
        )
        self.assertEqual(
            delivery_response.data["groups"][0]["message"],
            "ข้อความติดตามกำหนดส่งเฉพาะ Vendor และผู้ใช้นี้",
        )
        delivery_group = delivery_response.data["groups"][0]
        self.assertEqual(
            delivery_group["body"].splitlines()[:4],
            [
                "ข้อความติดตามกำหนดส่งเฉพาะ Vendor และผู้ใช้นี้",
                "",
                "ขอยืนยันวันจัดส่ง",
                "",
            ],
        )
        self.assertEqual(
            delivery_group["email_intro"],
            "ข้อความติดตามกำหนดส่งเฉพาะ Vendor และผู้ใช้นี้\n\nขอยืนยันวันจัดส่ง",
        )

    def test_subject_uses_part_id_instead_of_machine_and_job_when_available(self):
        from types import SimpleNamespace

        order = SimpleNamespace(
            part=SimpleNamespace(sku="PART-001"),
            ordered_by=SimpleNamespace(name="Requester One"),
            remark="",
            order_number="ORD-PART-SUBJECT",
            part_name="Bearing",
            maker_text="Maker A",
            amount=1,
            unit_text="EA",
        )
        group = {
            "key": "MC|R|",
            "machine_code": "MC",
            "machine_name": "Machine name",
            "job_code": "R",
            "pending_data_date": None,
            "orders": [order],
            "cc_emails": [],
        }
        vendor = SimpleNamespace(name="Vendor Example", email="vendor@example.com")

        result = _compose_group(group, vendor, "", "ขออัปเดตราคา", "PRICE_UPDATE")

        self.assertEqual(
            result["subject"],
            "Vendor Example ขออัปเดตราคา PART-001 Requester One",
        )
        self.assertNotIn("Machine name", result["subject"])
        self.assertNotIn("(R)", result["subject"])
        self.assertNotIn(" - ", result["subject"])

    def test_subject_omits_job_parentheses_when_job_is_blank(self):
        order = self.make_order("ORD-RFQ-NO-JOB", job="")

        response = self.post_compose([str(order.id)])

        self.assertEqual(response.status_code, 200)
        subject = response.data["groups"][0]["subject"]
        self.assertNotIn("()", subject)
        self.assertNotIn("(G)", subject)
        self.assertNotIn("JOB", subject)

    def test_order_remarks_are_appended_to_subject_in_order_without_duplicates(self):
        first = self.make_order("ORD-RFQ-REMARK-1", remark="Urgent")
        second = self.make_order("ORD-RFQ-REMARK-2", remark="Line stop")
        third = self.make_order("ORD-RFQ-REMARK-3", remark="Urgent")

        response = self.post_compose([str(first.id), str(second.id), str(third.id)])

        self.assertEqual(response.status_code, 200)
        group = response.data["groups"][0]
        self.assertTrue(group["subject"].endswith("Urgent / Line stop"), group["subject"])
        self.assertNotIn(" - ", group["subject"])

    def test_orders_without_remarks_keep_existing_subject_format(self):
        order = self.make_order("ORD-RFQ-NO-REMARK")

        response = self.post_compose([str(order.id)])

        self.assertEqual(response.status_code, 200)
        self.assertNotIn(" - ", response.data["groups"][0]["subject"])

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


    def test_delivery_date_uses_only_current_employee_vendor_message(self):
        self.vendor_message.message = "ข้อความของผู้ใช้ปัจจุบัน"
        self.vendor_message.save(update_fields=["message"])
        other_employee = Employee.objects.create(
            employee_code="RFQ-DELIVERY-OTHER",
            name="Other Buyer",
            role="PURCHASE",
        )
        SupplierRFQMessage.objects.create(
            supplier=self.vendor,
            employee=other_employee,
            message="ข้อความของผู้ใช้อื่นต้องไม่ถูกนำมาใช้",
        )
        EmployeeRFQSubjectSetting.objects.create(
            employee=self.actor,
            topic_code="DELIVERY_DATE",
            phrase="ขอยืนยันวันจัดส่ง",
        )
        order = self.make_order("ORD-RFQ-DELIVERY-USER-SCOPE")

        response = self.post_compose([str(order.id)], subject_topic="DELIVERY_DATE")

        self.assertEqual(response.status_code, 200)
        body = response.data["groups"][0]["body"]
        self.assertEqual(
            body.splitlines()[:4],
            ["ข้อความของผู้ใช้ปัจจุบัน", "", "ขอยืนยันวันจัดส่ง", ""],
        )
        self.assertNotIn("ข้อความของผู้ใช้อื่นต้องไม่ถูกนำมาใช้", body)

    def test_missing_vendor_user_message_blocks_delivery_date_compose(self):
        self.vendor_message.delete()
        order = self.make_order("ORD-RFQ-DELIVERY-MISSING-MESSAGE")

        response = self.post_compose([str(order.id)], subject_topic="DELIVERY_DATE")

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

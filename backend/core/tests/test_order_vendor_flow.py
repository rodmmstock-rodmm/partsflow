from datetime import date
from decimal import Decimal

from django.test import TestCase

from core import order_api, order_vendor_api
from core.models import Machine, OrderProject, OrderRecord, OrderStep, Supplier
from core.order_vendor_models import OrderVendor
from core.rfq_step_guard import _valid_step_orders


class OrderVendorFlowTests(TestCase):
    def setUp(self):
        self.machine = Machine.objects.create(code="VENDOR-MC", name="Vendor Machine")
        self.vendor_a = Supplier.objects.create(code="V-A", name="Vendor A")
        self.vendor_b = Supplier.objects.create(code="V-B", name="Vendor B")

    def make_normal_order(self):
        return OrderRecord.objects.create(
            order_number="ORD-VENDOR-TEST",
            order_date=date.today(),
            source_type="NORMAL",
            machine=self.machine,
            job="REPAIR",
            part_name="Part A",
            part_detail="Detail",
            maker_text="Maker",
            amount=1,
            unit_text="EA",
        )

    def test_normal_order_supports_multiple_vendor_candidates_with_created_time(self):
        order = self.make_normal_order()
        first = OrderVendor.objects.create(order=order, vendor=self.vendor_a)
        second = OrderVendor.objects.create(order=order, vendor=self.vendor_b)

        self.assertIsNotNone(first.created_at)
        self.assertIsNotNone(second.created_at)
        self.assertEqual(order.vendor_candidates.count(), 2)

    def test_order_quotation_data_serializes_vendor_candidates_for_detail(self):
        order = self.make_normal_order()
        OrderVendor.objects.create(order=order, vendor=self.vendor_a)
        OrderVendor.objects.create(order=order, vendor=self.vendor_b)

        payload = order_vendor_api.order_quotation_data(order)

        self.assertEqual(payload["count"], 2)
        self.assertEqual(
            [row["vendor_code"] for row in payload["results"]],
            ["V-A", "V-B"],
        )
        self.assertEqual(
            [row["vendor_name"] for row in payload["results"]],
            ["Vendor A", "Vendor B"],
        )

    def test_normal_order_quotation_readiness_uses_vendor_candidates_only(self):
        order = self.make_normal_order()
        order.quotation = "LEGACY-QTN"
        order.save(update_fields=["quotation"])
        self.assertFalse(order_api.quotation_is_ready(order))

        OrderVendor.objects.create(order=order, vendor=self.vendor_a)
        self.assertTrue(order_api.quotation_is_ready(order))

    def test_vendor_order_must_exist_in_order_quotation(self):
        order = self.make_normal_order()
        OrderVendor.objects.create(order=order, vendor=self.vendor_a)

        with self.assertRaisesMessage(ValueError, "ORDER QUOTATION"):
            order_api.apply_purchase_info(order, {"vendor_id": str(self.vendor_b.id)})

        order_api.apply_purchase_info(order, {"vendor_id": str(self.vendor_a.id)})
        self.assertEqual(order.vendor_id, self.vendor_a.id)

    def test_vendor_order_can_be_cleared_without_removing_quotation_vendor(self):
        order = self.make_normal_order()
        OrderVendor.objects.create(order=order, vendor=self.vendor_a)
        order.vendor = self.vendor_a
        order.price_per_unit = Decimal("125.50")
        order.lead_time_days = 7
        order.save()

        order_api.apply_purchase_info(order, {"vendor_id": ""})
        order.save()
        order.refresh_from_db()

        self.assertIsNone(order.vendor_id)
        self.assertTrue(
            order.vendor_candidates.filter(vendor=self.vendor_a).exists()
        )
        self.assertEqual(order.status, OrderRecord.STATUS_QUOTE)

    def test_wait_issue_pr_requires_vendor_price_and_lead_time(self):
        order = self.make_normal_order()
        OrderVendor.objects.create(order=order, vendor=self.vendor_a)
        order.vendor = self.vendor_a

        order.price_per_unit = Decimal("0")
        order.lead_time_days = None
        self.assertEqual(order_api.compute_status(order), OrderRecord.STATUS_QUOTE)

        order.price_per_unit = Decimal("125.50")
        self.assertEqual(order_api.compute_status(order), OrderRecord.STATUS_QUOTE)

        order.lead_time_days = 7
        self.assertEqual(order_api.compute_status(order), OrderRecord.STATUS_ISSUE_PR)

        order.po_number = "PO-001"
        order.issue_pr_date = date.today()
        order.due_date = date.today()
        self.assertEqual(order_api.compute_status(order), OrderRecord.STATUS_ITEM)

    def test_rfq_guard_rejects_normal_order_and_accepts_project_step(self):
        normal = self.make_normal_order()
        self.assertFalse(_valid_step_orders([str(normal.id)]))

        project = OrderProject.objects.create(name="Vendor RFQ Project", department="MODIFY")
        step = OrderStep.objects.create(project=project, step_no=1)
        project_order = OrderRecord.objects.create(
            order_number="QTN-VENDOR-STEP",
            order_date=date.today(),
            source_type="PROJECT",
            project=project,
            step=step,
            procurement_phase=OrderRecord.PROCUREMENT_QUOTATION,
            machine=self.machine,
            job="MODIFY",
            part_name="Part B",
            part_detail="Detail",
            maker_text="Maker",
            amount=1,
            unit_text="EA",
        )
        self.assertTrue(_valid_step_orders([str(project_order.id)]))


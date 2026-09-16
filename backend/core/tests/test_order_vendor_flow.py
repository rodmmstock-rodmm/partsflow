from datetime import date

from django.test import TestCase

from core import order_api
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

    def test_normal_order_quotation_readiness_uses_vendor_candidates(self):
        order = self.make_normal_order()
        self.assertFalse(order_api.quotation_is_ready(order))

        OrderVendor.objects.create(order=order, vendor=self.vendor_a)
        self.assertTrue(order_api.quotation_is_ready(order))

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

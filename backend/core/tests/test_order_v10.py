from datetime import date

from django.test import TestCase

from core.models import Machine, OrderRecord


class OrderV10Tests(TestCase):
    def setUp(self):
        self.machine_a = Machine.objects.create(code="MC-A", name="Machine A")
        self.machine_b = Machine.objects.create(code="MC-B", name="Machine B")

    def make_order(self, job="REPAIR", **extra):
        data = {
            # ORD-* represents the old PartsFlow automatic number and should be
            # replaced by the new JOB/date/time number when the row is created.
            "order_number": "ORD-TEST",
            "order_date": date.today(),
            "machine": self.machine_a,
            "job": job,
            "part_name": "Test Part",
            "amount": 1,
            "unit_text": "EA",
        }
        data.update(extra)
        return OrderRecord.objects.create(**data)

    def test_purchase_order_number_uses_job_and_creation_time(self):
        expected = {
            "REPAIR": "R",
            "MODIFY": "MO",
            "AUTOMATION": "A",
            "PM": "P",
            "SPARE": "G",
        }
        for job, prefix in expected.items():
            order = self.make_order(job=job)
            self.assertRegex(
                order.order_number,
                rf"^{prefix}-\d{{6}}-\d{{6}}(?:-\d{{2}})?$",
            )

    def test_existing_order_number_is_not_changed_on_edit(self):
        order = self.make_order(job="REPAIR")
        original = order.order_number
        order.remark = "updated"
        order.save()
        order.refresh_from_db()
        self.assertEqual(order.order_number, original)

    def test_quotation_number_is_preserved(self):
        order = self.make_order(
            job="MODIFY",
            order_number="QTN-KEEP-ME",
            procurement_phase=OrderRecord.PROCUREMENT_QUOTATION,
        )
        self.assertEqual(order.order_number, "QTN-KEEP-ME")

    def test_explicit_import_order_number_is_preserved(self):
        order = self.make_order(job="REPAIR", order_number="EXCEL-123")
        self.assertEqual(order.order_number, "EXCEL-123")

    def test_multi_machine_selection_keeps_first_as_primary(self):
        order = OrderRecord(
            order_number="ORD-TEST-MULTI",
            order_date=date.today(),
            machine=self.machine_a,
            job="REPAIR",
            part_name="Test Part",
            amount=1,
            unit_text="EA",
        )
        order._pending_machine_ids = [str(self.machine_a.id), str(self.machine_b.id)]
        order.save()
        order.refresh_from_db()

        self.assertEqual(order.machine_id, self.machine_a.id)
        self.assertEqual(
            list(order.machine_selections.values_list("machine_id", flat=True)),
            [self.machine_a.id, self.machine_b.id],
        )

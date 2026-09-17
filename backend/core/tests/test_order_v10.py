from datetime import date

from django.test import TestCase
from rest_framework.test import APIClient

from core.auth_api import create_auth_token
from core.models import Employee, Machine, OrderRecord, RoleAccess


class OrderV10Tests(TestCase):
    def setUp(self):
        RoleAccess.objects.create(role_name="PURCHASING", can_view_orders=True)
        self.employee = Employee.objects.create(
            employee_code="P-V10",
            name="Purchasing V10",
            role="PURCHASING",
        )
        self.client = APIClient()
        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {create_auth_token(self.employee)}"
        )
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

    def test_order_response_includes_active_count_for_each_month(self):
        self.make_order(order_date=date(2026, 1, 5))
        self.make_order(order_date=date(2026, 1, 20))
        self.make_order(order_date=date(2026, 9, 1))
        self.make_order(
            order_date=date(2026, 1, 25),
            lifecycle_status=OrderRecord.LIFECYCLE_WAIT_CONFIRM,
        )
        self.make_order(order_date=date(2025, 1, 5))

        response = self.client.get(
            "/api/orders/",
            {
                "date_from": "2026-09-01",
                "date_to": "2026-09-30",
                "summary_year": "2026",
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["summary_year"], 2026)
        self.assertEqual(
            response.data["monthly_active_counts"],
            [2, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
        )

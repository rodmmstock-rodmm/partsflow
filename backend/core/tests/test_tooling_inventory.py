from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from core.models import Employee, RoleAccess, ToolingItem, ToolingTransaction
from core.tooling_api import parse_whole_number


class ToolingQuantityValidationTests(TestCase):
    def test_accepts_whole_numbers_within_positive_integer_range(self):
        self.assertEqual(parse_whole_number(0), 0)
        self.assertEqual(parse_whole_number("12"), 12)
        self.assertEqual(parse_whole_number("12", allow_zero=False), 12)

    def test_rejects_invalid_or_unstorable_quantities(self):
        for value in (True, -1, "1.5", "1e2", "", None, 2147483648):
            with self.subTest(value=value):
                with self.assertRaises(ValueError):
                    parse_whole_number(value)

    def test_rejects_zero_for_withdrawals(self):
        with self.assertRaises(ValueError):
            parse_whole_number(0, allow_zero=False)


class ToolingSafetyStockPermissionTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.role = RoleAccess.objects.create(
            role_name="SAFETY_VIEWER",
            can_view_safety_stock=True,
            can_view_tooling=False,
        )
        self.employee = Employee.objects.create(
            employee_code="TEST-SAFETY-001",
            name="Safety Stock Viewer",
            role=self.role.role_name,
        )
        self.authenticate_as(self.employee)

    def authenticate_as(self, employee):
        session = self.client.session
        session["partsflow_employee_id"] = str(employee.id)
        session.save()

    def test_safety_stock_endpoint_returns_only_active_items_below_minimum(self):
        low = ToolingItem.objects.create(name="Below Min", quantity=1, min_quantity=2)
        ToolingItem.objects.create(name="At Min", quantity=2, min_quantity=2)
        ToolingItem.objects.create(name="Inactive Low", quantity=0, min_quantity=1, active=False)

        response = self.client.get(reverse("web-tooling-safety-stock"))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual([row["id"] for row in response.data["results"]], [str(low.id)])

    def test_safety_stock_permission_does_not_grant_full_tooling_inventory(self):
        response = self.client.get(reverse("web-tooling-items"))
        self.assertEqual(response.status_code, 403)


class ToolingWithdrawalTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.role = RoleAccess.objects.create(
            role_name="TOOLING_WITHDRAWER",
            can_withdraw_tooling=True,
            can_view_tooling=True,
        )
        self.actor = Employee.objects.create(
            employee_code="TEST-TOOLING-ACTOR",
            name="Tooling Actor",
            role=self.role.role_name,
        )
        self.requester = Employee.objects.create(
            employee_code="TEST-TOOLING-REQUESTER",
            name="Tooling Requester",
        )
        session = self.client.session
        session["partsflow_employee_id"] = str(self.actor.id)
        session.save()
        self.item = ToolingItem.objects.create(
            name="Test Tooling",
            quantity=3,
            min_quantity=1,
        )
        self.url = reverse("web-tooling-withdraw", kwargs={"pk": self.item.id})

    def test_withdrawal_decrements_stock_and_records_requester_and_actor(self):
        response = self.client.post(
            self.url,
            {
                "quantity": 2,
                "requester_id": str(self.requester.id),
                "reason": ToolingTransaction.REASON_DAMAGED, "vehicle_number": 1,
                "remark": "Test",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.item.refresh_from_db()
        self.assertEqual(self.item.quantity, 1)
        tx = ToolingTransaction.objects.get()
        self.assertEqual(tx.quantity, 2)
        self.assertEqual(tx.requester_id, self.requester.id)
        self.assertEqual(tx.created_by_id, self.actor.id)
        self.assertEqual(tx.reason, ToolingTransaction.REASON_DAMAGED)
        self.assertEqual(tx.vehicle_number, 1)

    def test_withdrawal_cannot_make_stock_negative(self):
        response = self.client.post(
            self.url,
            {
                "quantity": 4,
                "requester_id": str(self.requester.id),
                "reason": ToolingTransaction.REASON_LOST, "vehicle_number": 1,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.item.refresh_from_db()
        self.assertEqual(self.item.quantity, 3)

    def test_malformed_requester_id_returns_validation_error_not_server_error(self):
        response = self.client.post(
            self.url,
            {
                "quantity": 1,
                "requester_id": "not-a-uuid",
                "reason": ToolingTransaction.REASON_LOST, "vehicle_number": 1,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.item.refresh_from_db()
        self.assertEqual(self.item.quantity, 3)

    def test_zero_withdrawal_is_rejected_by_api_without_changing_stock(self):
        response = self.client.post(
            self.url,
            {
                "quantity": 0,
                "requester_id": str(self.requester.id),
                "reason": ToolingTransaction.REASON_LOST, "vehicle_number": 1,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.item.refresh_from_db()
        self.assertEqual(self.item.quantity, 3)
        self.assertEqual(ToolingTransaction.objects.count(), 0)

    def test_withdrawal_permission_is_required_even_with_tooling_view_permission(self):
        self.role.can_withdraw_tooling = False
        self.role.save(update_fields=["can_withdraw_tooling"])

        response = self.client.post(
            self.url,
            {
                "quantity": 1,
                "requester_id": str(self.requester.id),
                "reason": ToolingTransaction.REASON_LOST, "vehicle_number": 1,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 403)
        self.item.refresh_from_db()
        self.assertEqual(self.item.quantity, 3)
        self.assertEqual(ToolingTransaction.objects.count(), 0)

    def test_unauthenticated_withdrawal_is_rejected(self):
        self.client.session.flush()

        response = self.client.post(
            self.url,
            {
                "quantity": 1,
                "requester_id": str(self.requester.id),
                "reason": ToolingTransaction.REASON_LOST, "vehicle_number": 1,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 401)
        self.item.refresh_from_db()
        self.assertEqual(self.item.quantity, 3)
        self.assertEqual(ToolingTransaction.objects.count(), 0)

    def test_invalid_reason_is_rejected_without_changing_stock(self):
        response = self.client.post(
            self.url,
            {
                "quantity": 1,
                "requester_id": str(self.requester.id),
                "reason": "USED", "vehicle_number": 1,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.item.refresh_from_db()
        self.assertEqual(self.item.quantity, 3)
        self.assertEqual(ToolingTransaction.objects.count(), 0)

    def test_inactive_requester_is_rejected_without_changing_stock(self):
        self.requester.active = False
        self.requester.save(update_fields=["active"])

        response = self.client.post(
            self.url,
            {
                "quantity": 1,
                "requester_id": str(self.requester.id),
                "reason": ToolingTransaction.REASON_LOST, "vehicle_number": 1,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.item.refresh_from_db()
        self.assertEqual(self.item.quantity, 3)
        self.assertEqual(ToolingTransaction.objects.count(), 0)

    def test_inactive_tooling_item_cannot_be_withdrawn(self):
        self.item.active = False
        self.item.save(update_fields=["active"])

        response = self.client.post(
            self.url,
            {
                "quantity": 1,
                "requester_id": str(self.requester.id),
                "reason": ToolingTransaction.REASON_LOST, "vehicle_number": 1,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 404)
        self.item.refresh_from_db()
        self.assertEqual(self.item.quantity, 3)
        self.assertEqual(ToolingTransaction.objects.count(), 0)
    
    def test_vehicle_number_must_be_between_one_and_thirteen(self):
        for invalid_number in (0, 14, "not-a-number"):
            with self.subTest(vehicle_number=invalid_number):
                response = self.client.post(
                    self.url,
                    {
                        "quantity": 1,
                        "requester_id": str(self.requester.id),
                        "reason": ToolingTransaction.REASON_LOST,
                        "vehicle_number": invalid_number,
                    },
                    format="json",
                )
                self.assertEqual(response.status_code, 400)
        self.item.refresh_from_db()
        self.assertEqual(self.item.quantity, 3)
        self.assertEqual(ToolingTransaction.objects.count(), 0)

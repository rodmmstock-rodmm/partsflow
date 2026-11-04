from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from core.models import Employee, RoleAccess, ToolingVehicleKey, ToolingVehicleKeyLoan


class ToolingVehicleKeyPermissionsTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.role = RoleAccess.objects.create(
            role_name="KEY_VIEWER",
            can_view_tooling_keys=True,
        )
        self.actor = Employee.objects.create(
            employee_code="TEST-KEY-001",
            name="Key Borrower",
            role=self.role.role_name,
        )
        self.other = Employee.objects.create(
            employee_code="TEST-KEY-002",
            name="Key Returner",
        )
        session = self.client.session
        session["partsflow_employee_id"] = str(self.actor.id)
        session.save()
        self.key = ToolingVehicleKey.objects.create(vehicle_number=1)
        self.url = reverse("web-tooling-keys")

    def test_view_permission_can_borrow_and_return_key(self):
        borrow = self.client.post(
            reverse("web-tooling-key-borrow", kwargs={"pk": self.key.id}),
            {"borrower_employee_id": str(self.actor.id), "remark": "Test borrow"},
            format="json",
        )
        self.assertEqual(borrow.status_code, 201, borrow.data)
        self.assertEqual(borrow.data["key"]["status"], "BORROWED")
        self.assertEqual(ToolingVehicleKeyLoan.objects.filter(returned_at__isnull=True).count(), 1)

        returned = self.client.post(
            reverse("web-tooling-key-return", kwargs={"pk": self.key.id}),
            {"remark": "Test return"},
            format="json",
        )
        self.assertEqual(returned.status_code, 200, returned.data)
        self.assertEqual(returned.data["key"]["status"], "AVAILABLE")
        self.assertIsNotNone(ToolingVehicleKeyLoan.objects.get().returned_at)

    def test_view_permission_cannot_create_or_edit_key_master(self):
        create = self.client.post(self.url, {"vehicle_number": 2}, format="json")
        self.assertEqual(create.status_code, 403)
        edit = self.client.patch(
            reverse("web-tooling-key-detail", kwargs={"pk": self.key.id}),
            {"label": "Changed"},
            format="json",
        )
        self.assertEqual(edit.status_code, 403)

    def test_view_permission_cannot_edit_or_delete_history(self):
        loan = ToolingVehicleKeyLoan.objects.create(
            key=self.key,
            borrower_employee=self.actor,
            borrower_name=self.actor.name,
            returned_at=None,
        )
        edit = self.client.patch(
            reverse("web-tooling-key-history-detail", kwargs={"pk": loan.id}),
            {"borrow_remark": "Changed"},
            format="json",
        )
        self.assertEqual(edit.status_code, 403)
        delete = self.client.delete(
            reverse("web-tooling-key-history-detail", kwargs={"pk": loan.id})
        )
        self.assertEqual(delete.status_code, 403)

    def test_edit_permission_can_update_history_but_not_delete(self):
        self.role.can_edit_tooling_keys = True
        self.role.save(update_fields=["can_edit_tooling_keys"])
        loan = ToolingVehicleKeyLoan.objects.create(
            key=self.key,
            borrower_employee=self.actor,
            borrower_name=self.actor.name,
            returned_at=None,
        )
        edit = self.client.patch(
            reverse("web-tooling-key-history-detail", kwargs={"pk": loan.id}),
            {"borrow_remark": "Corrected"},
            format="json",
        )
        self.assertEqual(edit.status_code, 200, edit.data)
        loan.refresh_from_db()
        self.assertEqual(loan.borrow_remark, "Corrected")
        delete = self.client.delete(
            reverse("web-tooling-key-history-detail", kwargs={"pk": loan.id})
        )
        self.assertEqual(delete.status_code, 403)

    def test_delete_permission_can_archive_key_and_delete_closed_history(self):
        self.role.can_edit_tooling_keys = True
        self.role.can_delete_tooling_keys = True
        self.role.save(update_fields=["can_edit_tooling_keys", "can_delete_tooling_keys"])
        loan = ToolingVehicleKeyLoan.objects.create(
            key=self.key,
            borrower_employee=self.actor,
            borrower_name=self.actor.name,
            returned_by_employee=self.other,
            returned_by_name=self.other.name,
            returned_at=__import__("django.utils.timezone", fromlist=["now"]).now(),
        )
        delete_history = self.client.delete(
            reverse("web-tooling-key-history-detail", kwargs={"pk": loan.id})
        )
        self.assertEqual(delete_history.status_code, 200)
        loan.refresh_from_db()
        self.assertTrue(loan.is_deleted)
        delete_key = self.client.delete(
            reverse("web-tooling-key-detail", kwargs={"pk": self.key.id})
        )
        self.assertEqual(delete_key.status_code, 200)
        self.key.refresh_from_db()
        self.assertFalse(self.key.active)

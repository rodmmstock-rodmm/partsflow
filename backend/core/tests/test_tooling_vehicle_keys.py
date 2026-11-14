from datetime import timedelta

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
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
        self.key = ToolingVehicleKey.objects.create(vehicle_number=14)
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
        create = self.client.post(self.url, {"vehicle_number": 15}, format="json")
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
            returned_at=timezone.now(),
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


class ToolingVehicleKeyManagerTests(ToolingVehicleKeyPermissionsTests):
    def test_update_key_with_multiple_managers(self):
        self.role.can_edit_tooling_keys = True
        self.role.save(update_fields=["can_edit_tooling_keys"])
        third = Employee.objects.create(employee_code="TEST-KEY-003", name="Key Manager 3")
        response = self.client.patch(
            reverse("web-tooling-key-detail", kwargs={"pk": self.key.id}),
            {"manager_employee_ids": [str(self.actor.id), str(self.other.id), str(third.id)]},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(
            set(response.data["manager_employee_ids"]),
            {str(self.actor.id), str(self.other.id), str(third.id)},
        )
        self.assertEqual(len(response.data["managers"]), 3)

    def test_manager_ids_must_reference_active_employees(self):
        self.role.can_edit_tooling_keys = True
        self.role.save(update_fields=["can_edit_tooling_keys"])
        response = self.client.patch(
            reverse("web-tooling-key-detail", kwargs={"pk": self.key.id}),
            {"manager_employee_ids": [str(self.actor.id), "00000000-0000-0000-0000-000000000000"]},
            format="json",
        )
        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(self.key.managers.count(), 0)


class ToolingVehicleKeyHistoryIntegrityTests(ToolingVehicleKeyPermissionsTests):
    def enable_edit(self):
        self.role.can_edit_tooling_keys = True
        self.role.save(update_fields=["can_edit_tooling_keys"])

    def test_vehicle_number_cannot_change_after_any_loan_history_exists(self):
        self.enable_edit()
        ToolingVehicleKeyLoan.objects.create(
            key=self.key,
            borrower_employee=self.actor,
            borrower_name=self.actor.name,
            returned_at=timezone.now(),
        )

        response = self.client.patch(
            reverse("web-tooling-key-detail", kwargs={"pk": self.key.id}),
            {"vehicle_number": 15},
            format="json",
        )

        self.assertEqual(response.status_code, 409, response.data)
        self.key.refresh_from_db()
        self.assertEqual(self.key.vehicle_number, 14)

    def test_vehicle_number_can_be_changed_before_first_loan(self):
        self.enable_edit()
        response = self.client.patch(
            reverse("web-tooling-key-detail", kwargs={"pk": self.key.id}),
            {"vehicle_number": 15},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.key.refresh_from_db()
        self.assertEqual(self.key.vehicle_number, 15)

    def test_editing_returner_updates_employee_relation_and_display_name_together(self):
        self.enable_edit()
        loan = ToolingVehicleKeyLoan.objects.create(
            key=self.key,
            borrower_employee=self.actor,
            borrower_name=self.actor.name,
            returned_by_employee=self.other,
            returned_by_name=self.other.name,
            returned_at=timezone.now() + timedelta(minutes=1),
        )

        response = self.client.patch(
            reverse("web-tooling-key-history-detail", kwargs={"pk": loan.id}),
            {"returned_by_employee_id": str(self.actor.id)},
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.data)
        loan.refresh_from_db()
        self.assertEqual(loan.returned_by_employee_id, self.actor.id)
        self.assertEqual(loan.returned_by_name, self.actor.name)
        self.assertEqual(response.data["returned_by_employee_id"], str(self.actor.id))

    def test_history_rejects_free_text_returner_that_does_not_match_employee(self):
        self.enable_edit()
        loan = ToolingVehicleKeyLoan.objects.create(
            key=self.key,
            borrower_employee=self.actor,
            borrower_name=self.actor.name,
            returned_at=timezone.now(),
        )

        response = self.client.patch(
            reverse("web-tooling-key-history-detail", kwargs={"pk": loan.id}),
            {"returned_by_name": "Someone not in employee records"},
            format="json",
        )

        self.assertEqual(response.status_code, 400, response.data)
        loan.refresh_from_db()
        self.assertNotEqual(loan.returned_by_name, "Someone not in employee records")

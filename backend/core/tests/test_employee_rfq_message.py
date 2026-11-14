from django.test import TestCase
from rest_framework.test import APIRequestFactory

from unittest.mock import patch

from core.auth_api import rfq_message_view
from core.models import Employee


class EmployeeRFQMessageTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.employee = Employee.objects.create(
            employee_code="RFQ-MESSAGE-01",
            name="Buyer One",
            role="PURCHASE",
        )

    def test_employee_can_read_and_update_only_their_own_message(self):
        get_request = self.factory.get("/api/auth/rfq-message/")
        with patch("core.auth_api.current_employee", return_value=self.employee):
            get_response = rfq_message_view(get_request)
        self.assertEqual(get_response.status_code, 200)
        self.assertEqual(get_response.data["rfq_message"], "")

        patch_request = self.factory.patch(
            "/api/auth/rfq-message/",
            {"rfq_message": "My own RFQ wording."},
            format="json",
        )
        with patch("core.auth_api.current_employee", return_value=self.employee):
            patch_response = rfq_message_view(patch_request)
        self.assertEqual(patch_response.status_code, 200)
        self.employee.refresh_from_db()
        self.assertEqual(self.employee.rfq_message, "My own RFQ wording.")

    def test_rejects_non_text_message(self):
        request = self.factory.patch(
            "/api/auth/rfq-message/",
            {"rfq_message": ["not", "text"]},
            format="json",
        )
        with patch("core.auth_api.current_employee", return_value=self.employee):
            response = rfq_message_view(request)
        self.assertEqual(response.status_code, 400)

    def test_requires_login(self):
        request = self.factory.get("/api/auth/rfq-message/")
        with patch("core.auth_api.current_employee", return_value=None):
            response = rfq_message_view(request)
        self.assertEqual(response.status_code, 401)

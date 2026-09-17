from unittest.mock import patch

from django.core import signing
from django.test import RequestFactory, TestCase
from rest_framework.test import APIClient

from core.auth_api import (
    TOKEN_MAX_AGE,
    TOKEN_SALT,
    create_auth_token,
    employee_from_bearer,
)
from core.models import Employee


class MobilePersistentAuthTests(TestCase):
    def setUp(self):
        self.employee = Employee.objects.create(
            employee_code="MOBILE-LOGIN",
            name="Mobile User",
            role="PURCHASING",
        )
        self.client = APIClient()
        self.factory = RequestFactory()

    def bearer_request(self, token="signed-token"):
        return self.factory.get(
            "/api/auth/me/",
            HTTP_AUTHORIZATION=f"Bearer {token}",
        )

    def test_mobile_login_issues_remembered_token(self):
        response = self.client.post(
            "/api/auth/login/",
            {
                "employee_code": self.employee.employee_code,
                "remember_mobile": "1",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["remember_mobile"])
        self.assertIsNone(response.data["expires_in"])
        token_data = signing.loads(
            response.data["token"],
            salt=TOKEN_SALT,
        )
        self.assertTrue(token_data["remember_mobile"])

    def test_standard_login_keeps_eight_hour_expiry(self):
        response = self.client.post(
            "/api/auth/login/",
            {
                "employee_code": self.employee.employee_code,
                "remember_mobile": "0",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["remember_mobile"])
        self.assertEqual(response.data["expires_in"], TOKEN_MAX_AGE)
        token_data = signing.loads(
            response.data["token"],
            salt=TOKEN_SALT,
        )
        self.assertFalse(token_data["remember_mobile"])

    def test_mobile_me_upgrades_an_active_standard_token(self):
        token = create_auth_token(self.employee)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

        response = self.client.get("/api/auth/me/?remember_mobile=1")

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["remember_mobile"])
        upgraded = signing.loads(response.data["token"], salt=TOKEN_SALT)
        self.assertTrue(upgraded["remember_mobile"])

    def test_remembered_token_skips_standard_age_limit(self):
        data = {
            "employee_id": str(self.employee.id),
            "remember_mobile": True,
        }
        with patch("core.auth_api.signing.loads", return_value=data) as loads:
            employee = employee_from_bearer(self.bearer_request())

        self.assertEqual(employee, self.employee)
        self.assertEqual(loads.call_count, 1)
        self.assertNotIn("max_age", loads.call_args.kwargs)

    def test_standard_token_still_checks_age_limit(self):
        data = {
            "employee_id": str(self.employee.id),
            "remember_mobile": False,
        }
        with patch(
            "core.auth_api.signing.loads",
            side_effect=[data, data],
        ) as loads:
            employee = employee_from_bearer(self.bearer_request())

        self.assertEqual(employee, self.employee)
        self.assertEqual(loads.call_count, 2)
        self.assertEqual(loads.call_args.kwargs["max_age"], TOKEN_MAX_AGE)


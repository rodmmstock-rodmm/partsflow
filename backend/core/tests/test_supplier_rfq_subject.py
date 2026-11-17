from unittest.mock import patch

from django.test import TestCase
from rest_framework.test import APIRequestFactory

from core.models import Employee, EmployeeRFQSubjectSetting
from core.rfq_subject_api import rfq_subject_settings


class RFQSubjectSettingsTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.employee = Employee.objects.create(
            employee_code="RFQ-SUBJECT-USER-01",
            name="Buyer One",
            role="PURCHASE",
        )
        self.other_employee = Employee.objects.create(
            employee_code="RFQ-SUBJECT-USER-02",
            name="Buyer Two",
            role="PURCHASE",
        )

    def call_api(self, request, employee=None):
        with patch(
            "core.rfq_subject_api.require_permission",
            return_value=(employee or self.employee, None),
        ):
            return rfq_subject_settings(request)

    def test_patch_saves_phrase_per_user_and_topic_not_vendor(self):
        request = self.factory.patch(
            "/api/rfq-subject-settings/",
            {"topic_code": "RFQ", "phrase": "ขอใบเสนอราคาสินค้า"},
            format="json",
        )
        response = self.call_api(request)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["phrase"], "ขอใบเสนอราคาสินค้า")
        self.assertTrue(
            EmployeeRFQSubjectSetting.objects.filter(
                employee=self.employee,
                topic_code="RFQ",
                phrase="ขอใบเสนอราคาสินค้า",
            ).exists()
        )
        self.assertFalse(
            EmployeeRFQSubjectSetting.objects.filter(employee=self.other_employee).exists()
        )

    def test_get_returns_only_current_users_topics(self):
        EmployeeRFQSubjectSetting.objects.create(
            employee=self.employee,
            topic_code="RFQ",
            phrase="Buyer One phrase",
        )
        EmployeeRFQSubjectSetting.objects.create(
            employee=self.other_employee,
            topic_code="RFQ",
            phrase="Buyer Two private phrase",
        )
        response = self.call_api(self.factory.get("/api/rfq-subject-settings/"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["results"], [
            {"topic_code": "RFQ", "phrase": "Buyer One phrase"},
        ])
        self.assertNotIn("Buyer Two private phrase", str(response.data))

    def test_same_user_can_save_multiple_topics(self):
        for topic, phrase in (
            ("RFQ", "ขอราคา"),
            ("DELIVERY_DATE", "ขอแจ้งกำหนดส่ง"),
        ):
            response = self.call_api(self.factory.patch(
                "/api/rfq-subject-settings/",
                {"topic_code": topic, "phrase": phrase},
                format="json",
            ))
            self.assertEqual(response.status_code, 200)
        self.assertEqual(
            EmployeeRFQSubjectSetting.objects.filter(employee=self.employee).count(),
            2,
        )

    def test_patch_rejects_invalid_topic_or_phrase(self):
        invalid_payloads = (
            {"topic_code": "", "phrase": "text"},
            {"topic_code": "RFQ", "phrase": ["not", "text"]},
            {"topic_code": "RFQ", "phrase": "x" * 251},
        )
        for payload in invalid_payloads:
            response = self.call_api(self.factory.patch(
                "/api/rfq-subject-settings/", payload, format="json"
            ))
            self.assertEqual(response.status_code, 400)

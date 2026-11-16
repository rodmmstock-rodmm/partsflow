from django.test import TestCase
from rest_framework.test import APIRequestFactory
from unittest.mock import patch

from core.models import Employee, Supplier, SupplierRFQMessage
from core.supplier_rfq_message_api import supplier_rfq_message


class SupplierRFQMessageTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.employee = Employee.objects.create(
            employee_code="RFQ-VENDOR-USER-01",
            name="Buyer One",
            role="PURCHASE",
        )
        self.other_employee = Employee.objects.create(
            employee_code="RFQ-VENDOR-USER-02",
            name="Buyer Two",
            role="PURCHASE",
        )
        self.supplier = Supplier.objects.create(
            code="RFQ-VENDOR-MESSAGE-01",
            name="Vendor Message Test",
            rfq_message="Legacy shared message must not be used.",
        )

    def call_api(self, request):
        with patch(
            "core.supplier_rfq_message_api.require_permission",
            return_value=(self.employee, None),
        ):
            return supplier_rfq_message(request, self.supplier.id)

    def test_get_returns_only_current_employees_message(self):
        SupplierRFQMessage.objects.create(
            supplier=self.supplier,
            employee=self.employee,
            message="My private vendor message.",
        )
        SupplierRFQMessage.objects.create(
            supplier=self.supplier,
            employee=self.other_employee,
            message="Another buyer's private message.",
        )
        request = self.factory.get("/api/suppliers/test/rfq-message/")

        response = self.call_api(request)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["rfq_message"], "My private vendor message.")
        self.assertNotIn("Another buyer's private message.", str(response.data))

    def test_patch_persists_message_for_current_employee_only(self):
        request = self.factory.patch(
            "/api/suppliers/test/rfq-message/",
            {"rfq_message": "Saved reusable template."},
            format="json",
        )

        response = self.call_api(request)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["rfq_message"], "Saved reusable template.")
        saved = SupplierRFQMessage.objects.get(
            supplier=self.supplier,
            employee=self.employee,
        )
        self.assertEqual(saved.message, "Saved reusable template.")
        self.assertFalse(
            SupplierRFQMessage.objects.filter(
                supplier=self.supplier,
                employee=self.other_employee,
            ).exists()
        )

    def test_patch_rejects_non_text_message(self):
        request = self.factory.patch(
            "/api/suppliers/test/rfq-message/",
            {"rfq_message": ["not", "text"]},
            format="json",
        )

        response = self.call_api(request)

        self.assertEqual(response.status_code, 400)
        self.assertFalse(SupplierRFQMessage.objects.exists())

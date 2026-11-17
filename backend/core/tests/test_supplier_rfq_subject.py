from unittest.mock import patch

from django.test import TestCase
from rest_framework.test import APIRequestFactory

from core.models import Employee, Supplier, SupplierRFQMessage
from core.rfq_subject_api import supplier_rfq_subject


class SupplierRFQSubjectTests(TestCase):
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
        self.supplier = Supplier.objects.create(
            code="RFQ-SUBJECT-VENDOR-01",
            name="RFQ Subject Vendor",
            email="subject@example.com",
            rfq_message="Legacy default RFQ message",
        )

    def call_api(self, request, employee=None):
        with patch(
            "core.rfq_subject_api.require_permission",
            return_value=(employee or self.employee, None),
        ):
            return supplier_rfq_subject(request, self.supplier.id)

    def test_patch_saves_subject_phrase_for_current_user_and_vendor_only(self):
        request = self.factory.patch(
            "/api/suppliers/test/rfq-subject/",
            {"subject_phrase": "ขอใบเสนอราคาสินค้า"},
            format="json",
        )

        response = self.call_api(request)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["subject_phrase"], "ขอใบเสนอราคาสินค้า")
        self.assertEqual(
            SupplierRFQMessage.objects.get(
                supplier=self.supplier,
                employee=self.employee,
            ).subject_phrase,
            "ขอใบเสนอราคาสินค้า",
        )
        saved = SupplierRFQMessage.objects.get(
            supplier=self.supplier,
            employee=self.employee,
        )
        self.assertEqual(saved.message, "Legacy default RFQ message")
        self.assertFalse(
            SupplierRFQMessage.objects.filter(
                supplier=self.supplier,
                employee=self.other_employee,
            ).exists()
        )

    def test_get_returns_only_current_users_subject_phrase(self):
        SupplierRFQMessage.objects.create(
            supplier=self.supplier,
            employee=self.employee,
            message="Existing message",
            subject_phrase="Buyer One phrase",
        )
        SupplierRFQMessage.objects.create(
            supplier=self.supplier,
            employee=self.other_employee,
            message="Other message",
            subject_phrase="Buyer Two private phrase",
        )

        response = self.call_api(
            self.factory.get("/api/suppliers/test/rfq-subject/")
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["subject_phrase"], "Buyer One phrase")
        self.assertNotIn("Buyer Two private phrase", str(response.data))

    def test_patch_rejects_non_text_or_too_long_phrase(self):
        for value in (["not", "text"], "x" * 251):
            request = self.factory.patch(
                "/api/suppliers/test/rfq-subject/",
                {"subject_phrase": value},
                format="json",
            )
            response = self.call_api(request)
            self.assertEqual(response.status_code, 400)

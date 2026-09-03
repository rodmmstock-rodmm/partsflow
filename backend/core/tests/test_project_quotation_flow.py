from datetime import date
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from core.auth_api import create_auth_token
from core.models import (
    Employee,
    OrderProject,
    OrderRFQ,
    OrderRFQItem,
    OrderRecord,
    OrderStep,
    POBalance,
    RoleAccess,
    Supplier,
)


class ProjectQuotationFlowTests(TestCase):
    def setUp(self):
        RoleAccess.objects.create(
            role_name="PURCHASING",
            can_view_orders=True,
            can_edit_purchase_info=True,
            can_manage_order_projects=True,
            can_create_order_from_quotation=True,
            can_delete_order=True,
        )
        self.employee = Employee.objects.create(
            employee_code="P100",
            name="Purchasing One",
            role="PURCHASING",
        )
        self.client = APIClient()
        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {create_auth_token(self.employee)}"
        )
        self.project = OrderProject.objects.create(
            name="QUOTATION-PROJECT-01",
            department="MODIFY",
            owner_employee=self.employee,
            created_by_employee=self.employee,
        )
        self.step = OrderStep.objects.create(project=self.project, step_no=1)
        self.source = OrderRecord.objects.create(
            order_number="QTN-TEST-001",
            order_date=date(2026, 9, 2),
            factory="MM-4",
            group_order="QUOTATION_PROJECT_01_STEP1_MODIFY",
            job="MODIFY",
            part_name="Test Part",
            part_detail="Quotation-only project part",
            maker_text="Test Maker",
            amount=10,
            unit_text="PCS",
            ordered_by=self.employee,
            recorded_by=self.employee,
            source_type="PROJECT",
            project=self.project,
            step=self.step,
            procurement_phase=OrderRecord.PROCUREMENT_QUOTATION,
        )
        self.vendor = Supplier.objects.create(
            code="V-QTN-01",
            name="Quotation Vendor",
            email="quote@example.com",
        )
        self.rfq = OrderRFQ.objects.create(
            rfq_number="RFQ-QTN-001",
            group_order=self.source.group_order,
            job="MODIFY",
            vendor=self.vendor,
            vendor_name=self.vendor.name,
            recipient_email=self.vendor.email,
            requested_at=timezone.now(),
            sent_by_employee=self.employee,
            status=OrderRFQ.STATUS_SENT,
            gmail_web_link="https://mail.google.com/mail/u/0/#sent/rfq-qtn-001",
        )
        OrderRFQItem.objects.create(
            rfq=self.rfq,
            order=self.source,
            order_number=self.source.order_number,
            part_name=self.source.part_name,
            part_detail=self.source.part_detail,
            amount=self.source.amount,
            unit=self.source.unit_text,
        )
        POBalance.objects.create(
            rfq=self.rfq,
            quotation_received_at=timezone.now(),
            price=Decimal("125.50"),
            currency="THB",
            lead_time_days=7,
            updated_by_employee=self.employee,
        )

    def test_project_detail_splits_quotation_and_purchase_rows(self):
        response = self.client.get(f"/api/order-projects/{self.project.id}/")

        self.assertEqual(response.status_code, 200)
        step = response.data["steps"][0]
        self.assertEqual(len(step["quotation_orders"]), 1)
        self.assertEqual(len(step["orders"]), 0)
        self.assertEqual(
            step["quotation_orders"][0]["quotation_stage_status"],
            "READY_TO_CREATE_ORDER",
        )
        self.assertEqual(response.data["project"]["total_items"], 0)
        self.assertEqual(response.data["project"]["quotation_items"], 1)

    def test_conversion_keeps_source_and_records_actor_rfq_vendor_and_price(self):
        response = self.client.post(
            f"/api/order-projects/{self.project.id}/quotation-convert/",
            {
                "items": [
                    {
                        "quotation_order_id": str(self.source.id),
                        "rfq_id": str(self.rfq.id),
                        "amount": 4,
                        "price_per_unit": "130.25",
                        "currency": "USD",
                    }
                ]
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201, response.data)
        self.source.refresh_from_db()
        self.assertEqual(self.source.converted_quantity, 4)
        self.assertEqual(
            self.source.procurement_phase,
            OrderRecord.PROCUREMENT_QUOTATION,
        )

        created = OrderRecord.objects.get(
            source_quotation_order=self.source,
            procurement_phase=OrderRecord.PROCUREMENT_PURCHASE,
        )
        self.assertEqual(created.amount, 4)
        self.assertEqual(created.source_rfq, self.rfq)
        self.assertEqual(created.vendor, self.vendor)
        self.assertEqual(created.price_per_unit, Decimal("130.25"))
        self.assertEqual(created.currency, "USD")
        self.assertEqual(created.lead_time_days, 7)
        self.assertEqual(created.created_from_quotation_by_employee, self.employee)
        self.assertIsNotNone(created.created_from_quotation_at)

        updated = self.client.patch(
            f"/api/orders/{created.id}/purchase/",
            {"lead_time_days": 10},
            format="json",
        )
        self.assertEqual(updated.status_code, 200, updated.data)
        created.refresh_from_db()
        self.assertEqual(created.group_order, self.source.group_order)

        detail = self.client.get(f"/api/order-projects/{self.project.id}/")
        step = detail.data["steps"][0]
        self.assertEqual(len(step["quotation_orders"]), 1)
        self.assertEqual(len(step["orders"]), 1)
        self.assertEqual(
            step["quotation_orders"][0]["quotation_stage_status"],
            "PARTIALLY_CREATED",
        )
        self.assertEqual(step["quotation_orders"][0]["remaining_quantity"], 6)
        self.assertEqual(
            step["orders"][0]["created_from_quotation_by_code"],
            self.employee.employee_code,
        )

        delete_source = self.client.delete(f"/api/orders/{self.source.id}/delete/")
        self.assertEqual(delete_source.status_code, 400)
        self.source.refresh_from_db()
        self.assertFalse(self.source.is_deleted)

    def test_conversion_permission_is_separate(self):
        denied_role = RoleAccess.objects.create(
            role_name="STAFF-NO-CONVERT",
            can_view_orders=True,
            can_edit_purchase_info=True,
            can_create_order_from_quotation=False,
        )
        denied = Employee.objects.create(
            employee_code="S200",
            name="Staff No Convert",
            role=denied_role.role_name,
        )
        client = APIClient()
        client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {create_auth_token(denied)}"
        )

        response = client.post(
            f"/api/order-projects/{self.project.id}/quotation-conversion-preview/",
            {"quotation_order_ids": [str(self.source.id)]},
            format="json",
        )

        self.assertEqual(response.status_code, 403)
        self.assertFalse(
            OrderRecord.objects.filter(
                source_quotation_order=self.source,
                procurement_phase=OrderRecord.PROCUREMENT_PURCHASE,
            ).exists()
        )

    def test_delivery_follow_up_requires_converted_purchase_order(self):
        blocked = self.client.post(
            f"/api/rfqs/{self.rfq.id}/follow-up/",
            {
                "message_type": "DELIVERY_FOLLOW_UP",
                "email_link": "https://mail.google.com/mail/u/0/#sent/delivery",
            },
            format="json",
        )
        self.assertEqual(blocked.status_code, 400)

        converted = self.client.post(
            f"/api/order-projects/{self.project.id}/quotation-convert/",
            {
                "items": [
                    {
                        "quotation_order_id": str(self.source.id),
                        "rfq_id": str(self.rfq.id),
                        "amount": 10,
                    }
                ]
            },
            format="json",
        )
        self.assertEqual(converted.status_code, 201, converted.data)

        allowed = self.client.post(
            f"/api/rfqs/{self.rfq.id}/follow-up/",
            {
                "message_type": "DELIVERY_FOLLOW_UP",
                "body_text": "ติดตามวันที่จัดส่ง",
                "email_link": "https://mail.google.com/mail/u/0/#sent/delivery",
            },
            format="json",
        )
        self.assertEqual(allowed.status_code, 201, allowed.data)

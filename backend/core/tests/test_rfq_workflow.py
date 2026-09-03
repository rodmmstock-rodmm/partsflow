from datetime import date
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from core.auth_api import create_auth_token
from core.models import (
    Employee,
    OrderRFQ,
    OrderRFQItem,
    OrderRecord,
    POBalance,
    RFQCCRule,
    RFQMessage,
    RoleAccess,
    Supplier,
)
from core.production_check_api import MIGRATION_0017, REPAIR_KEY


class RFQWorkflowTests(TestCase):
    def setUp(self):
        RoleAccess.objects.create(
            role_name="PURCHASE",
            can_view_orders=True,
            can_edit_purchase_info=True,
            can_manage_roles=True,
        )
        self.employee = Employee.objects.create(
            employee_code="P001",
            name="Purchasing Staff",
            email="staff@example.com",
            role="PURCHASE",
        )
        self.client = APIClient()
        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {create_auth_token(self.employee)}"
        )

    def order(self, number, *, group="GRP-001", job="REPAIR", quotation=""):
        return OrderRecord.objects.create(
            order_number=number,
            order_date=date(2026, 8, 31),
            factory="MM-4",
            group_order=group,
            job=job,
            quotation=quotation,
            part_name=f"Part {number}",
            part_detail="English detail",
            amount=2,
            unit_text="PCS",
            status=OrderRecord.STATUS_NEW,
        )

    def record_payload(self, orders, **overrides):
        payload = {
            "order_ids": [str(order.id) for order in orders],
            "vendor_name": "Manual Vendor",
            "recipient_email": "vendor@example.com",
            "sent_at": "2026-08-31T10:30:00+07:00",
            "email_link": "https://mail.google.com/mail/u/0/#sent/test-message",
        }
        payload.update(overrides)
        return payload

    def test_preview_groups_items_and_default_job_cc(self):
        first = self.order("ORD-001")
        second = self.order("ORD-002")
        RFQCCRule.objects.create(
            rule_type=RFQCCRule.TYPE_DEFAULT,
            email="fixed@example.com",
        )
        RFQCCRule.objects.create(
            rule_type=RFQCCRule.TYPE_JOB,
            job="REPAIR",
            email="repair@example.com",
        )

        response = self.client.post(
            "/api/rfqs/preview/",
            {"order_ids": [str(first.id), str(second.id)]},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["groups"]), 1)
        group = response.data["groups"][0]
        self.assertEqual(group["job"], "REPAIR")
        self.assertEqual(len(group["items"]), 2)
        self.assertEqual(
            set(group["cc_emails"]),
            {"fixed@example.com", "repair@example.com"},
        )

    def test_preview_rejects_group_order_with_more_than_one_job(self):
        first = self.order("ORD-001", job="REPAIR")
        self.order("ORD-002", job="PM")

        response = self.client.post(
            "/api/rfqs/preview/",
            {"order_ids": [str(first.id)]},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("JOB เดียวกัน", response.data["detail"])

    def test_manual_record_creates_one_rfq_per_group_and_preserves_legacy(self):
        first = self.order(
            "ORD-001", group="GRP-001", job="REPAIR", quotation="LEGACY-Q-001"
        )
        second = self.order("ORD-002", group="GRP-002", job="PM")
        vendor = Supplier.objects.create(
            code="V001",
            name="Known Vendor",
            email="known@example.com",
        )
        RFQCCRule.objects.create(
            rule_type=RFQCCRule.TYPE_DEFAULT,
            email="fixed@example.com",
        )

        response = self.client.post(
            "/api/rfqs/record/",
            self.record_payload(
                [first, second],
                vendor_id=str(vendor.id),
                vendor_name="",
                recipient_email="known@example.com",
                group_cc_emails={"GRP-001": []},
            ),
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["recorded_count"], 2)
        self.assertEqual(OrderRFQ.objects.count(), 2)
        self.assertEqual(POBalance.objects.count(), 2)
        self.assertEqual(RFQMessage.objects.count(), 2)
        self.assertTrue(
            all(row.status == OrderRFQ.STATUS_SENT for row in OrderRFQ.objects.all())
        )
        self.assertTrue(
            all(not row.gmail_thread_id for row in OrderRFQ.objects.all())
        )
        self.assertTrue(
            all(
                row.gmail_web_link
                == "https://mail.google.com/mail/u/0/#sent/test-message"
                for row in OrderRFQ.objects.all()
            )
        )
        self.assertEqual(
            OrderRFQ.objects.get(group_order="GRP-001").cc_emails,
            [],
        )
        self.assertEqual(
            OrderRFQ.objects.get(group_order="GRP-002").cc_emails,
            ["fixed@example.com"],
        )
        first.refresh_from_db()
        second.refresh_from_db()
        self.assertEqual(first.quotation, "LEGACY-Q-001")
        self.assertEqual(first.status, OrderRecord.STATUS_QUOTE)
        self.assertEqual(second.status, OrderRecord.STATUS_QUOTE)

    def test_manual_record_requires_https_email_link_and_vendor(self):
        order = self.order("ORD-001")
        invalid_link = self.client.post(
            "/api/rfqs/record/",
            self.record_payload([order], email_link="javascript:alert(1)"),
            format="json",
        )
        self.assertEqual(invalid_link.status_code, 400)
        self.assertFalse(OrderRFQ.objects.exists())

        missing_vendor = self.client.post(
            "/api/rfqs/record/",
            self.record_payload([order], vendor_name=""),
            format="json",
        )
        self.assertEqual(missing_vendor.status_code, 400)
        self.assertFalse(OrderRFQ.objects.exists())

    def test_manual_record_rejects_multiple_vendor_emails(self):
        order = self.order("ORD-001")
        response = self.client.post(
            "/api/rfqs/record/",
            self.record_payload(
                [order],
                recipient_email="one@example.com, two@example.com",
            ),
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("ครั้งละ 1 Vendor", response.data["detail"])

    def test_legacy_send_endpoint_is_disabled(self):
        order = self.order("ORD-001")
        response = self.client.post(
            "/api/rfqs/send/",
            self.record_payload([order]),
            format="json",
        )
        self.assertEqual(response.status_code, 410)
        self.assertFalse(OrderRFQ.objects.exists())

    def test_manual_follow_up_records_link_without_gmail_thread(self):
        order = self.order("ORD-001")
        recorded = self.client.post(
            "/api/rfqs/record/",
            self.record_payload([order]),
            format="json",
        )
        rfq = OrderRFQ.objects.get(pk=recorded.data["results"][0]["id"])

        response = self.client.post(
            f"/api/rfqs/{rfq.id}/follow-up/",
            {
                "message_type": RFQMessage.TYPE_PRICE_FOLLOW_UP,
                "body_text": "ขอติดตามราคา",
                "cc_emails": "staff@example.com",
                "occurred_at": "2026-09-01T09:00:00+07:00",
                "email_link": "https://mail.google.com/mail/u/0/#sent/follow-up",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        follow = RFQMessage.objects.get(
            message_type=RFQMessage.TYPE_PRICE_FOLLOW_UP
        )
        self.assertEqual(follow.status, RFQMessage.STATUS_SENT)
        self.assertEqual(
            follow.gmail_web_link,
            "https://mail.google.com/mail/u/0/#sent/follow-up",
        )
        self.assertEqual(follow.gmail_thread_id, "")
        self.assertEqual(response.data["email_link"], follow.gmail_web_link)

    def test_follow_up_is_blocked_without_original_email_link(self):
        rfq = OrderRFQ.objects.create(
            rfq_number="RFQ-NO-LINK",
            group_order="GRP-001",
            job="REPAIR",
            recipient_email="vendor@example.com",
            status=OrderRFQ.STATUS_SENT,
            requested_at=timezone.now(),
        )
        response = self.client.post(
            f"/api/rfqs/{rfq.id}/follow-up/",
            {
                "message_type": RFQMessage.TYPE_PRICE_FOLLOW_UP,
                "email_link": "https://mail.google.com/mail/u/0/#sent/follow-up",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_oauth_and_sync_routes_are_not_exposed(self):
        self.assertEqual(
            self.client.get("/api/gmail/oauth/status/").status_code,
            404,
        )
        self.assertEqual(
            self.client.post(
                "/api/rfqs/00000000-0000-0000-0000-000000000000/sync/",
                {},
                format="json",
            ).status_code,
            404,
        )

    @patch("core.rfq_api.audit", side_effect=RuntimeError("audit unavailable"))
    def test_audit_problem_does_not_remove_manual_record(self, _audit):
        order = self.order("ORD-001")
        response = self.client.post(
            "/api/rfqs/record/",
            self.record_payload([order]),
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertIn("Audit", response.data["results"][0]["warning"])
        self.assertEqual(OrderRFQ.objects.count(), 1)

    def test_rfq_item_snapshot_survives_order_deletion(self):
        order = self.order("ORD-001")
        rfq = OrderRFQ.objects.create(
            rfq_number="RFQ-TEST-001",
            group_order=order.group_order,
            job=order.job,
            recipient_email="vendor@example.com",
            status=OrderRFQ.STATUS_SENT,
        )
        item = OrderRFQItem.objects.create(
            rfq=rfq,
            order=order,
            order_number=order.order_number,
            item_id="ITEM-001",
            part_name=order.part_name,
            part_detail=order.part_detail,
            amount=order.amount,
            unit=order.unit_text,
        )
        order.delete()
        item.refresh_from_db()
        self.assertIsNone(item.order_id)
        self.assertEqual(item.order_number, "ORD-001")
        self.assertEqual(item.part_name, "Part ORD-001")

    @patch("core.production_check_api.call_command")
    @patch("core.production_check_api._snapshot")
    def test_production_repair_applies_additive_rfq_migration(
        self, snapshot, call_command
    ):
        before = {
            "ok": True,
            "database_vendor": "postgresql",
            "order_count": 4110,
            "imported_order_count": 4107,
            "migration_0014_applied": True,
            "migration_0015_applied": True,
            "migration_0016_applied": False,
            "migration_0017_applied": False,
            "permission_columns_present": True,
            "missing_permission_columns": [],
            "employee_email_present": False,
            "rfq_tables_present": False,
            "missing_rfq_tables": [
                "core_integrationcredential",
                "core_orderrfq",
                "core_orderrfqitem",
                "core_pobalance",
                "core_rfqattachment",
                "core_rfqccrule",
                "core_rfqmessage",
                "core_vendoremailidentity",
            ],
            "quotation_columns_present": False,
            "missing_quotation_columns": [
                "converted_quantity",
                "created_from_quotation_at",
                "created_from_quotation_by_employee_id",
                "currency",
                "procurement_phase",
                "source_quotation_order_id",
                "source_rfq_id",
            ],
            "quotation_permission_present": False,
            "missing_quotation_permission_columns": [
                "can_create_order_from_quotation",
            ],
        }
        after = {
            **before,
            "migration_0016_applied": True,
            "migration_0017_applied": True,
            "employee_email_present": True,
            "rfq_tables_present": True,
            "missing_rfq_tables": [],
            "quotation_columns_present": True,
            "missing_quotation_columns": [],
            "quotation_permission_present": True,
            "missing_quotation_permission_columns": [],
        }
        snapshot.side_effect = [before, after]

        response = self.client.post(
            "/api/production-repair/",
            {},
            format="json",
            HTTP_X_PARTSFLOW_REPAIR_KEY=REPAIR_KEY,
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["after"]["migration_0016_applied"])
        args = call_command.call_args.args
        self.assertEqual(args[:3], ("migrate", "core", MIGRATION_0017))

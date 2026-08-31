import json
from datetime import date
from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from core.auth_api import create_auth_token
from core.gmail_service import (
    GmailConfigError,
    consume_oauth_pending,
    create_oauth_pending,
    save_oauth_pending,
)
from core.models import (
    Employee,
    OrderRFQ,
    OrderRFQItem,
    OrderRecord,
    POBalance,
    RFQAttachment,
    RFQCCRule,
    RFQMessage,
    RoleAccess,
    Supplier,
)
from core.production_check_api import MIGRATION_0016, REPAIR_KEY


def sent_result(message_id="gmail-1", thread_id="thread-1"):
    return {
        "sender_email": "purchasing@example.com",
        "gmail_message_id": message_id,
        "gmail_thread_id": thread_id,
        "rfc_message_id": f"<{message_id}@example.com>",
        "gmail_web_link": f"https://mail.google.com/search/{message_id}",
    }


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
        self.assertIn("{{RFQ_NO}}", response.data["subject_template"])
        self.assertIn("กรุณาเสนอราคา", response.data["body_text"])

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

    @patch("core.rfq_api.send_gmail_message")
    def test_send_creates_separate_vendor_threads_and_never_overwrites_legacy(self, send):
        send.side_effect = [
            sent_result("gmail-1", "thread-1"),
            sent_result("gmail-2", "thread-2"),
        ]
        order = self.order("ORD-001", quotation="LEGACY-Q-001")
        RFQCCRule.objects.create(
            rule_type=RFQCCRule.TYPE_DEFAULT,
            email="fixed@example.com",
        )
        Supplier.objects.create(
            code="V001",
            name="Known Vendor",
            email="known@example.com",
        )
        attachment = SimpleUploadedFile(
            "spec.pdf", b"pdf-content", content_type="application/pdf"
        )

        response = self.client.post(
            "/api/rfqs/send/",
            {
                "order_ids": json.dumps([str(order.id)]),
                "recipients": json.dumps(["known@example.com", "new@example.com"]),
                # An explicit empty list proves the user can remove default CC.
                "group_cc_emails": json.dumps({"GRP-001": []}),
                "subject": "[RFQ {{RFQ_NO}}] {{GROUP_ORDER}}",
                "body_text": "เรียน ผู้ขาย",
                "attachments": attachment,
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["sent_count"], 2)
        self.assertEqual(OrderRFQ.objects.filter(status=OrderRFQ.STATUS_SENT).count(), 2)
        self.assertEqual(
            set(OrderRFQ.objects.values_list("gmail_thread_id", flat=True)),
            {"thread-1", "thread-2"},
        )
        self.assertTrue(OrderRFQ.objects.filter(vendor__name="Known Vendor").exists())
        self.assertTrue(
            all(value == [] for value in OrderRFQ.objects.values_list("cc_emails", flat=True))
        )
        self.assertEqual(POBalance.objects.count(), 2)
        self.assertEqual(RFQAttachment.objects.count(), 2)
        order.refresh_from_db()
        self.assertEqual(order.quotation, "LEGACY-Q-001")
        self.assertEqual(order.status, OrderRecord.STATUS_QUOTE)

    @patch("core.rfq_api.send_gmail_message", side_effect=RuntimeError("Gmail unavailable"))
    def test_failed_send_is_logged_without_advancing_order(self, _send):
        order = self.order("ORD-001")
        response = self.client.post(
            "/api/rfqs/send/",
            {
                "order_ids": json.dumps([str(order.id)]),
                "recipients": json.dumps(["vendor@example.com"]),
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, 207)
        rfq = OrderRFQ.objects.get()
        self.assertEqual(rfq.status, OrderRFQ.STATUS_FAILED)
        self.assertIn("Gmail unavailable", rfq.send_error)
        self.assertFalse(POBalance.objects.exists())
        order.refresh_from_db()
        self.assertEqual(order.status, OrderRecord.STATUS_NEW)

    @patch("core.rfq_api.audit", side_effect=RuntimeError("audit unavailable"))
    @patch("core.rfq_api.send_gmail_message", return_value=sent_result())
    def test_post_send_audit_problem_never_labels_email_as_failed(self, _send, _audit):
        order = self.order("ORD-001")
        response = self.client.post(
            "/api/rfqs/send/",
            {
                "order_ids": json.dumps([str(order.id)]),
                "recipients": json.dumps(["vendor@example.com"]),
            },
            format="multipart",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["sent_count"], 1)
        self.assertIn("Audit", response.data["results"][0]["warning"])
        rfq = OrderRFQ.objects.get()
        self.assertEqual(rfq.status, OrderRFQ.STATUS_SENT)
        self.assertIn("POST_SEND_WARNING", rfq.send_error)

    @patch("core.rfq_api.send_gmail_message")
    def test_follow_up_replies_in_original_thread(self, send):
        send.return_value = sent_result("follow-1", "thread-1")
        order = self.order("ORD-001")
        rfq = OrderRFQ.objects.create(
            rfq_number="RFQ-TEST-001",
            group_order=order.group_order,
            job=order.job,
            recipient_email="vendor@example.com",
            status=OrderRFQ.STATUS_SENT,
            requested_at=timezone.now(),
            sent_by_employee=self.employee,
            subject="[RFQ RFQ-TEST-001] Request for Quotation",
            gmail_thread_id="thread-1",
            rfc_message_id="<original@example.com>",
        )
        OrderRFQItem.objects.create(
            rfq=rfq,
            order=order,
            order_number=order.order_number,
            part_name=order.part_name,
            part_detail=order.part_detail,
            amount=order.amount,
            unit=order.unit_text,
        )
        RFQMessage.objects.create(
            rfq=rfq,
            message_type=RFQMessage.TYPE_REQUEST,
            direction=RFQMessage.DIRECTION_OUTBOUND,
            status=RFQMessage.STATUS_SENT,
            rfc_message_id="<original@example.com>",
            gmail_thread_id="thread-1",
            occurred_at=timezone.now(),
        )

        response = self.client.post(
            f"/api/rfqs/{rfq.id}/follow-up/",
            {
                "message_type": RFQMessage.TYPE_PRICE_FOLLOW_UP,
                "body_text": "ขอติดตามราคา",
                "cc_emails": "staff@example.com",
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, 201)
        kwargs = send.call_args.kwargs
        self.assertEqual(kwargs["thread_id"], "thread-1")
        self.assertEqual(kwargs["in_reply_to"], "<original@example.com>")
        self.assertEqual(kwargs["to_emails"], ["vendor@example.com"])
        follow = RFQMessage.objects.get(message_type=RFQMessage.TYPE_PRICE_FOLLOW_UP)
        self.assertEqual(follow.status, RFQMessage.STATUS_SENT)

    @patch("core.rfq_api.audit", side_effect=RuntimeError("audit unavailable"))
    @patch("core.rfq_api.send_gmail_message", return_value=sent_result("follow-2", "thread-2"))
    def test_follow_up_audit_problem_never_labels_email_as_failed(self, _send, _audit):
        order = self.order("ORD-001")
        rfq = OrderRFQ.objects.create(
            rfq_number="RFQ-TEST-002",
            group_order=order.group_order,
            job=order.job,
            recipient_email="vendor@example.com",
            status=OrderRFQ.STATUS_SENT,
            requested_at=timezone.now(),
            sent_by_employee=self.employee,
            subject="[RFQ RFQ-TEST-002] Request for Quotation",
            gmail_thread_id="thread-2",
            rfc_message_id="<original-2@example.com>",
        )
        RFQMessage.objects.create(
            rfq=rfq,
            message_type=RFQMessage.TYPE_REQUEST,
            direction=RFQMessage.DIRECTION_OUTBOUND,
            status=RFQMessage.STATUS_SENT,
            rfc_message_id="<original-2@example.com>",
            gmail_thread_id="thread-2",
            occurred_at=timezone.now(),
        )

        response = self.client.post(
            f"/api/rfqs/{rfq.id}/follow-up/",
            {"message_type": RFQMessage.TYPE_PRICE_FOLLOW_UP},
            format="multipart",
        )

        self.assertEqual(response.status_code, 201)
        self.assertIn("Audit", response.data["warning"])
        follow = RFQMessage.objects.get(
            message_type=RFQMessage.TYPE_PRICE_FOLLOW_UP
        )
        self.assertEqual(follow.status, RFQMessage.STATUS_SENT)
        self.assertIn("POST_SEND_WARNING", follow.error)

    def test_follow_up_is_blocked_without_a_sent_original_email(self):
        rfq = OrderRFQ.objects.create(
            rfq_number="RFQ-DRAFT-001",
            group_order="GRP-001",
            job="REPAIR",
            recipient_email="vendor@example.com",
            status=OrderRFQ.STATUS_DRAFT,
        )
        response = self.client.post(
            f"/api/rfqs/{rfq.id}/follow-up/",
            {"message_type": RFQMessage.TYPE_PRICE_FOLLOW_UP},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    @patch("core.rfq_api.get_gmail_thread")
    def test_sync_preserves_each_quotation_revision(self, get_thread):
        order = self.order("ORD-001")
        rfq = OrderRFQ.objects.create(
            rfq_number="RFQ-TEST-001",
            group_order=order.group_order,
            job=order.job,
            recipient_email="vendor@example.com",
            sender_email="purchasing@example.com",
            status=OrderRFQ.STATUS_SENT,
            requested_at=timezone.now(),
            gmail_thread_id="thread-1",
        )
        POBalance.objects.create(rfq=rfq)
        RFQMessage.objects.create(
            rfq=rfq,
            message_type=RFQMessage.TYPE_REQUEST,
            direction=RFQMessage.DIRECTION_OUTBOUND,
            status=RFQMessage.STATUS_SENT,
            gmail_message_id="sent-1",
            gmail_thread_id="thread-1",
            occurred_at=timezone.now(),
        )
        when = timezone.now()
        get_thread.return_value = [
            {
                "gmail_message_id": "reply-1",
                "gmail_thread_id": "thread-1",
                "rfc_message_id": "<reply-1@example.com>",
                "subject": "Re: RFQ",
                "from_email": "Vendor <vendor@example.com>",
                "to_raw": "purchasing@example.com",
                "cc_raw": "staff@example.com",
                "body_text": "แนบใบเสนอราคา",
                "occurred_at": when,
                "attachments": [
                    {
                        "filename": "quote-v1.pdf",
                        "mime_type": "application/pdf",
                        "size": 100,
                        "gmail_attachment_id": "att-1",
                    }
                ],
            }
        ]
        first = self.client.post(f"/api/rfqs/{rfq.id}/sync/", {}, format="json")
        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.data["new_messages"], 1)
        self.assertEqual(RFQAttachment.objects.get().quotation_revision, 1)

        get_thread.return_value.append(
            {
                "gmail_message_id": "reply-2",
                "gmail_thread_id": "thread-1",
                "rfc_message_id": "<reply-2@example.com>",
                "subject": "Re: RFQ revised",
                "from_email": "vendor@example.com",
                "to_raw": "purchasing@example.com",
                "cc_raw": "staff@example.com",
                "body_text": "แก้ไขราคา",
                "occurred_at": timezone.now(),
                "attachments": [
                    {
                        "filename": "quote-v2.xlsx",
                        "mime_type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        "size": 200,
                        "gmail_attachment_id": "att-2",
                    }
                ],
            }
        )
        second = self.client.post(f"/api/rfqs/{rfq.id}/sync/", {}, format="json")
        self.assertEqual(second.data["new_messages"], 1)
        self.assertEqual(
            list(RFQAttachment.objects.order_by("quotation_revision").values_list("quotation_revision", flat=True)),
            [1, 2],
        )
        self.assertEqual(POBalance.objects.get(rfq=rfq).quotation_received_at, when)

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

    def test_oauth_pending_state_is_one_time_and_encrypted(self):
        state, state_hash = create_oauth_pending(self.employee)
        save_oauth_pending(
            state_hash=state_hash,
            code_verifier="secret-verifier",
            actor=self.employee,
        )
        actor, verifier = consume_oauth_pending(state)
        self.assertEqual(actor, self.employee)
        self.assertEqual(verifier, "secret-verifier")
        with self.assertRaises(GmailConfigError):
            consume_oauth_pending(state)

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
        }
        after = {
            **before,
            "migration_0016_applied": True,
            "employee_email_present": True,
            "rfq_tables_present": True,
            "missing_rfq_tables": [],
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
        self.assertEqual(args[:3], ("migrate", "core", MIGRATION_0016))

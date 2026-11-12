from unittest.mock import patch

from django.test import SimpleTestCase
from rest_framework.response import Response
from rest_framework.test import APIRequestFactory

from core.order_rfq_draft_api import create_order_rfq_drafts


class OrderRFQDraftTests(SimpleTestCase):
    def setUp(self):
        self.factory = APIRequestFactory()

    @patch("core.order_rfq_draft_api.create_gmail_draft")
    @patch("core.order_rfq_draft_api.compose_order_rfq")
    def test_creates_unsent_draft_with_html_table_and_no_header(self, compose, create_draft):
        compose.return_value = Response({
            "groups": [{
                "group_key": "MC|R|",
                "subject": "Vendor RFQ",
                "message": "Please quote.",
                "table_html": (
                    '<table style="border-collapse:collapse"><tbody><tr>'
                    '<td style="border:1px solid #333333;padding:6px 8px">SKU-1</td>'
                    '<td style="border:1px solid #333333;padding:6px 8px">Part A</td>'
                    '</tr></tbody></table>'
                ),
                "table_text": "SKU-1 | Part A",
                "to": "vendor@example.com",
                "cc": ["buyer@example.com"],
                "order_numbers": ["PO-1"],
            }]
        })
        create_draft.return_value = {
            "draft_id": "draft-123",
            "draft_url": "https://mail.google.com/mail/u/0/#drafts/draft-123",
            "sender_email": "parts@example.com",
        }

        request = self.factory.post(
            "/api/orders/rfq-drafts/",
            {"order_ids": ["order-1"], "vendor_id": "vendor-1"},
            format="json",
        )
        response = create_order_rfq_drafts(request)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["drafts"][0]["draft_id"], "draft-123")
        kwargs = create_draft.call_args.kwargs
        self.assertIn("Please quote.", kwargs["body_html"])
        self.assertIn("SKU-1", kwargs["body_html"])
        self.assertIn("border:1px solid #333333", kwargs["body_html"])
        self.assertNotIn("<th", kwargs["body_html"])
        self.assertEqual(kwargs["to_emails"], ["vendor@example.com"])
        self.assertEqual(kwargs["cc_emails"], ["buyer@example.com"])

    @patch("core.order_rfq_draft_api.compose_order_rfq")
    def test_rejects_invalid_rfq_before_creating_draft(self, compose):
        compose.return_value = Response({"detail": "Invalid order"}, status=400)
        request = self.factory.post(
            "/api/orders/rfq-drafts/",
            {"order_ids": ["order-1"], "vendor_id": "vendor-1"},
            format="json",
        )
        response = create_order_rfq_drafts(request)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["detail"], "Invalid order")

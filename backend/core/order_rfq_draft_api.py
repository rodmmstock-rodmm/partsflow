from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .gmail_service import GmailConfigError, create_gmail_draft
from .order_rfq_compose_api import compose_order_rfq_data


@api_view(["POST"])
@permission_classes([AllowAny])
def create_order_rfq_drafts(request):
    """Create one unsent Gmail draft for each validated RFQ group."""
    composed = compose_order_rfq_data(request)
    if composed.status_code != 200:
        return composed

    created = []
    try:
        for group in composed.data.get("groups") or []:
            message = str(group.get("message") or "")
            table_html = str(group.get("table_html") or "")
            table_text = str(group.get("table_text") or "")
            import html
            paragraphs = "".join(
                f"<p>{html.escape(line)}</p>" if line.strip() else "<br>"
                for line in message.splitlines()
            )
            body_html = (
                "<div style='font-family:Arial,sans-serif;font-size:13px;color:#222'>"
                + paragraphs + table_html + "</div>"
            )
            body_text = (message.rstrip() + "\n\n" if message else "") + table_text
            draft = create_gmail_draft(
                subject=group.get("subject") or "",
                body_text=body_text,
                body_html=body_html,
                to_emails=[group.get("to")] if group.get("to") else [],
                cc_emails=group.get("cc") or [],
            )
            created.append({
                "group_key": group.get("group_key") or "",
                "subject": group.get("subject") or "",
                "to": group.get("to") or "",
                "cc": group.get("cc") or [],
                "order_numbers": group.get("order_numbers") or [],
                **draft,
            })
    except GmailConfigError as exc:
        return Response({"detail": str(exc)}, status=400)
    except Exception:
        return Response({"detail": "สร้าง Gmail Draft ไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อ Gmail และสิทธิ์ OAuth"}, status=502)

    return Response({"drafts": created, "sender_email": created[0]["sender_email"] if created else ""})

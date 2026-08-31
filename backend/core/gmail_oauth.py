"""Admin-only OAuth setup for the shared Google Workspace Gmail account."""

from html import escape

from django.http import HttpResponse
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .auth_api import permissions_for, require_permission
from .gmail_service import (
    GMAIL_SCOPES,
    GmailConfigError,
    consume_oauth_pending,
    create_oauth_pending,
    gmail_client_config,
    gmail_connected,
    gmail_credential_row,
    gmail_redirect_uri,
    save_oauth_pending,
    save_credentials,
)


def _flow(*, state=None, code_verifier=None, autogenerate_code_verifier=False):
    try:
        from google_auth_oauthlib.flow import Flow
    except ImportError as exc:
        raise GmailConfigError("ยังไม่ได้ติดตั้ง google-auth-oauthlib") from exc

    flow = Flow.from_client_config(
        gmail_client_config(),
        scopes=GMAIL_SCOPES,
        state=state,
        code_verifier=code_verifier,
        autogenerate_code_verifier=autogenerate_code_verifier,
    )
    flow.redirect_uri = gmail_redirect_uri()
    return flow


@api_view(["GET"])
@permission_classes([AllowAny])
def oauth_status(request):
    _, err = require_permission(request, "can_manage_roles")
    if err:
        return err
    row = gmail_credential_row()
    detail = ""
    try:
        gmail_client_config()
        redirect_uri = gmail_redirect_uri()
        configured = True
    except GmailConfigError as exc:
        redirect_uri = ""
        configured = False
        detail = str(exc)
    return Response(
        {
            "configured": configured,
            "connected": gmail_connected(),
            "account_email": row.account_email if row else "",
            "connected_at": row.connected_at.isoformat() if row and row.connected_at else "",
            "redirect_uri": redirect_uri,
            "detail": detail or (row.last_error if row else ""),
        }
    )


@api_view(["GET"])
@permission_classes([AllowAny])
def oauth_start(request):
    actor, err = require_permission(request, "can_manage_roles")
    if err:
        return err
    try:
        state, state_hash = create_oauth_pending(actor)
        flow = _flow(state=state, autogenerate_code_verifier=True)
        authorization_url, returned_state = flow.authorization_url(
            access_type="offline",
            include_granted_scopes="true",
            prompt="consent",
        )
        if not flow.code_verifier:
            raise GmailConfigError("ไม่สามารถสร้าง OAuth PKCE code verifier")
        if returned_state != state:
            raise GmailConfigError("OAuth state ไม่ตรงกัน")
        save_oauth_pending(
            state_hash=state_hash,
            code_verifier=flow.code_verifier,
            actor=actor,
        )
        return Response({"authorization_url": authorization_url})
    except GmailConfigError as exc:
        return Response({"detail": str(exc)}, status=500)


@api_view(["GET"])
@permission_classes([AllowAny])
def oauth_callback(request):
    returned_state = str(request.GET.get("state", ""))
    if request.GET.get("error"):
        return HttpResponse(
            "<h2>PartsFlow Gmail</h2>"
            f"<p>Google OAuth ล้มเหลว: {escape(str(request.GET.get('error')))}</p>",
            status=400,
            content_type="text/html; charset=utf-8",
        )

    try:
        actor, verifier = consume_oauth_pending(returned_state)
        if not permissions_for(actor).get("can_manage_roles"):
            raise GmailConfigError("ผู้เริ่มเชื่อมไม่มีสิทธิ์จัดการระบบแล้ว")
        flow = _flow(state=returned_state, code_verifier=verifier)
        authorization_response = gmail_redirect_uri()
        query = request.META.get("QUERY_STRING", "")
        if query:
            authorization_response += "?" + query
        flow.fetch_token(authorization_response=authorization_response)

        try:
            from googleapiclient.discovery import build
        except ImportError as exc:
            raise GmailConfigError("ยังไม่ได้ติดตั้ง google-api-python-client") from exc
        service = build("gmail", "v1", credentials=flow.credentials, cache_discovery=False)
        profile = service.users().getProfile(userId="me").execute()
        account = profile.get("emailAddress") or ""
        save_credentials(flow.credentials, actor=actor, account_email=account)
    except Exception as exc:
        return HttpResponse(
            "<h2>PartsFlow Gmail</h2>"
            f"<p>เชื่อม Gmail ไม่สำเร็จ: {escape(str(exc))}</p>",
            status=500,
            content_type="text/html; charset=utf-8",
        )

    return HttpResponse(
        "<div style='font-family:Arial,sans-serif;max-width:680px;margin:60px auto;"
        "padding:28px;border:1px solid #e2e8f0;border-radius:18px'>"
        "<h2 style='margin-top:0'>✓ เชื่อม Google Workspace Gmail สำเร็จ</h2>"
        f"<p>บัญชีผู้ส่ง: <strong>{escape(account)}</strong></p>"
        "<p>ปิดแท็บนี้แล้วกลับไป Refresh หน้า PartsFlow ได้</p>"
        "</div>",
        content_type="text/html; charset=utf-8",
    )

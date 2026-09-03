"""Google Workspace Gmail integration for PartsFlow RFQ workflows."""

from __future__ import annotations

import base64
import hashlib
import html
import json
import mimetypes
import os
import secrets
from datetime import datetime, timedelta
from email.message import EmailMessage
from email.utils import formatdate, make_msgid
from functools import lru_cache
from pathlib import Path
from urllib.parse import quote

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from .models import IntegrationCredential


GMAIL_SCOPES = [
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.readonly",
]


class GmailConfigError(RuntimeError):
    pass


def _backend_dir() -> Path:
    return Path(__file__).resolve().parents[1]


def gmail_redirect_uri() -> str:
    value = os.getenv("GOOGLE_GMAIL_OAUTH_REDIRECT_URI", "").strip()
    if not value:
        raise GmailConfigError(
            "ยังไม่ได้กำหนด GOOGLE_GMAIL_OAUTH_REDIRECT_URI"
        )
    return value


def gmail_client_config() -> dict:
    raw = os.getenv("GOOGLE_GMAIL_OAUTH_CLIENT_JSON", "").strip()
    if raw:
        try:
            return json.loads(raw)
        except json.JSONDecodeError as exc:
            raise GmailConfigError(
                "GOOGLE_GMAIL_OAUTH_CLIENT_JSON ไม่ใช่ JSON ที่ถูกต้อง"
            ) from exc

    configured = (
        os.getenv("GOOGLE_GMAIL_OAUTH_CLIENT_FILE", "").strip()
        or os.getenv("GOOGLE_DRIVE_OAUTH_CLIENT_FILE", "").strip()
    )
    path = Path(configured).expanduser() if configured else _backend_dir() / "google-oauth-client.json"
    if not path.is_absolute():
        path = (_backend_dir() / path).resolve()
    if not path.exists():
        raise GmailConfigError(
            "ไม่พบ Google OAuth client สำหรับ Gmail"
        )
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise GmailConfigError(f"อ่าน Google OAuth client ไม่สำเร็จ: {exc}") from exc


def gmail_oauth_configured() -> bool:
    try:
        gmail_client_config()
        gmail_redirect_uri()
        return True
    except GmailConfigError:
        return False


def _fernet():
    try:
        from cryptography.fernet import Fernet
    except ImportError as exc:
        raise GmailConfigError("ยังไม่ได้ติดตั้ง cryptography") from exc

    digest = hashlib.sha256(
        (settings.SECRET_KEY + ":partsflow:gmail").encode("utf-8")
    ).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def save_credentials(credentials, actor=None, account_email=""):
    token = _fernet().encrypt(credentials.to_json().encode("utf-8")).decode("ascii")
    row, _ = IntegrationCredential.objects.update_or_create(
        provider=IntegrationCredential.PROVIDER_GMAIL,
        defaults={
            "encrypted_credentials": token,
            "account_email": account_email,
            "scopes": list(credentials.scopes or GMAIL_SCOPES),
            "connected_by_employee": actor,
            "connected_at": timezone.now(),
            "last_error": "",
            "pending_state_hash": "",
            "pending_code_verifier": "",
            "pending_by_employee": None,
            "pending_at": None,
        },
    )
    gmail_service.cache_clear()
    return row


def create_oauth_pending(actor):
    """Persist one short-lived OAuth attempt so the callback needs no app token."""
    state = secrets.token_urlsafe(32)
    state_hash = hashlib.sha256(state.encode("utf-8")).hexdigest()
    return state, state_hash


def save_oauth_pending(*, state_hash: str, code_verifier: str, actor):
    encrypted = _fernet().encrypt(code_verifier.encode("utf-8")).decode("ascii")
    IntegrationCredential.objects.update_or_create(
        provider=IntegrationCredential.PROVIDER_GMAIL,
        defaults={
            "pending_state_hash": state_hash,
            "pending_code_verifier": encrypted,
            "pending_by_employee": actor,
            "pending_at": timezone.now(),
            "last_error": "",
        },
    )


def consume_oauth_pending(state: str):
    """Return the initiating employee and PKCE verifier exactly once."""
    state_hash = hashlib.sha256(str(state or "").encode("utf-8")).hexdigest()
    with transaction.atomic():
        row = (
            IntegrationCredential.objects.select_for_update()
            .select_related("pending_by_employee")
            .filter(
                provider=IntegrationCredential.PROVIDER_GMAIL,
                pending_state_hash=state_hash,
            )
            .first()
        )
        if not row or not row.pending_code_verifier or not row.pending_at:
            raise GmailConfigError("OAuth state ไม่ถูกต้องหรือถูกใช้งานแล้ว")
        if timezone.now() - row.pending_at > timedelta(minutes=15):
            row.pending_state_hash = ""
            row.pending_code_verifier = ""
            row.pending_by_employee = None
            row.pending_at = None
            row.save(
                update_fields=[
                    "pending_state_hash",
                    "pending_code_verifier",
                    "pending_by_employee",
                    "pending_at",
                    "updated_at",
                ]
            )
            raise GmailConfigError("OAuth หมดเวลา กรุณาเริ่มเชื่อมใหม่")
        actor = row.pending_by_employee
        try:
            verifier = _fernet().decrypt(
                row.pending_code_verifier.encode("ascii")
            ).decode("utf-8")
        except Exception as exc:
            raise GmailConfigError("อ่าน OAuth PKCE verifier ไม่สำเร็จ") from exc
        row.pending_state_hash = ""
        row.pending_code_verifier = ""
        row.pending_by_employee = None
        row.pending_at = None
        row.save(
            update_fields=[
                "pending_state_hash",
                "pending_code_verifier",
                "pending_by_employee",
                "pending_at",
                "updated_at",
            ]
        )
    if not actor or not actor.active:
        raise GmailConfigError("ผู้เริ่มเชื่อม Gmail ไม่พร้อมใช้งาน")
    return actor, verifier


def gmail_credential_row():
    return IntegrationCredential.objects.filter(
        provider=IntegrationCredential.PROVIDER_GMAIL
    ).first()


def gmail_connected() -> bool:
    row = gmail_credential_row()
    return bool(row and row.encrypted_credentials)


def _load_credentials():
    try:
        from google.auth.transport.requests import Request
        from google.oauth2.credentials import Credentials
    except ImportError as exc:
        raise GmailConfigError(
            "ยังไม่ได้ติดตั้ง Google Gmail API dependencies"
        ) from exc

    row = gmail_credential_row()
    if not row or not row.encrypted_credentials:
        raise GmailConfigError("Google Workspace Gmail ยังไม่ได้เชื่อมต่อ")

    try:
        payload = _fernet().decrypt(
            row.encrypted_credentials.encode("ascii")
        ).decode("utf-8")
        credentials = Credentials.from_authorized_user_info(
            json.loads(payload), scopes=GMAIL_SCOPES
        )
    except Exception as exc:
        raise GmailConfigError(f"อ่าน Gmail OAuth token ไม่สำเร็จ: {exc}") from exc

    if credentials.expired:
        if not credentials.refresh_token:
            raise GmailConfigError("Gmail OAuth token หมดอายุ กรุณาเชื่อมใหม่")
        try:
            credentials.refresh(Request())
            save_credentials(credentials, row.connected_by_employee, row.account_email)
        except Exception as exc:
            row.last_error = str(exc)
            row.save(update_fields=["last_error", "updated_at"])
            raise GmailConfigError(f"ต่ออายุ Gmail OAuth token ไม่สำเร็จ: {exc}") from exc

    if not credentials.valid:
        raise GmailConfigError("Gmail OAuth token ไม่พร้อมใช้งาน")
    return credentials


@lru_cache(maxsize=1)
def gmail_service():
    try:
        from googleapiclient.discovery import build
    except ImportError as exc:
        raise GmailConfigError("ยังไม่ได้ติดตั้ง google-api-python-client") from exc
    return build(
        "gmail", "v1", credentials=_load_credentials(), cache_discovery=False
    )


def gmail_profile() -> dict:
    return gmail_service().users().getProfile(userId="me").execute()


def gmail_search_link(account_email: str, rfc_message_id: str) -> str:
    account = quote(str(account_email or ""), safe="@")
    query = quote(f"rfc822msgid:{rfc_message_id}", safe="")
    return f"https://mail.google.com/mail/u/?authuser={account}#search/{query}"


def _html_body(body_text: str, items: list[dict]) -> str:
    paragraphs = "".join(
        f"<p>{html.escape(line)}</p>" if line.strip() else "<br>"
        for line in str(body_text or "").splitlines()
    )
    rows = "".join(
        "<tr>"
        f"<td>{html.escape(str(item.get('item_id') or '-'))}</td>"
        f"<td>{html.escape(str(item.get('part_name') or ''))}</td>"
        f"<td>{html.escape(str(item.get('part_detail') or ''))}</td>"
        f"<td style='text-align:right'>{html.escape(str(item.get('amount') or ''))}</td>"
        f"<td>{html.escape(str(item.get('unit') or ''))}</td>"
        "</tr>"
        for item in items
    )
    table = (
        "<table style='border-collapse:collapse;width:100%;font-family:Arial,sans-serif'>"
        "<thead><tr>"
        "<th style='border:1px solid #cbd5e1;padding:8px'>Part ID</th>"
        "<th style='border:1px solid #cbd5e1;padding:8px'>Part Name</th>"
        "<th style='border:1px solid #cbd5e1;padding:8px'>Part Detail</th>"
        "<th style='border:1px solid #cbd5e1;padding:8px'>จำนวน</th>"
        "<th style='border:1px solid #cbd5e1;padding:8px'>Unit</th>"
        "</tr></thead>"
        f"<tbody>{rows}</tbody></table>"
        if rows
        else ""
    )
    return f"<div style='font-family:Arial,sans-serif'>{paragraphs}{table}</div>"


def _plain_body(body_text: str, items: list[dict]) -> str:
    if not items:
        return str(body_text or "")
    lines = [
        "Part ID | Part Name | Part Detail | Amount | Unit",
        "-" * 72,
    ]
    for item in items:
        lines.append(
            " | ".join(
                str(item.get(key) or "-").replace("\n", " ")
                for key in ("item_id", "part_name", "part_detail", "amount", "unit")
            )
        )
    return f"{str(body_text or '').rstrip()}\n\n" + "\n".join(lines)


def send_gmail_message(
    *,
    subject: str,
    body_text: str,
    to_emails: list[str],
    cc_emails: list[str],
    items: list[dict] | None = None,
    attachments=None,
    thread_id: str = "",
    in_reply_to: str = "",
):
    profile = gmail_profile()
    sender = profile.get("emailAddress") or ""
    if not sender:
        raise GmailConfigError("ไม่พบบัญชี Gmail ผู้ส่ง")

    message = EmailMessage()
    message["From"] = sender
    message["To"] = ", ".join(to_emails)
    if cc_emails:
        message["Cc"] = ", ".join(cc_emails)
    message["Subject"] = subject
    message["Date"] = formatdate(localtime=True)
    rfc_message_id = make_msgid(domain=sender.split("@")[-1] if "@" in sender else None)
    message["Message-ID"] = rfc_message_id
    if in_reply_to:
        message["In-Reply-To"] = in_reply_to
        message["References"] = in_reply_to

    message.set_content(_plain_body(body_text, items or []))
    message.add_alternative(_html_body(body_text, items or []), subtype="html")

    for uploaded in attachments or []:
        payload = uploaded.read()
        content_type = uploaded.content_type or mimetypes.guess_type(uploaded.name)[0]
        content_type = content_type or "application/octet-stream"
        maintype, subtype = content_type.split("/", 1)
        message.add_attachment(
            payload,
            maintype=maintype,
            subtype=subtype,
            filename=uploaded.name,
        )

    raw = base64.urlsafe_b64encode(message.as_bytes()).decode("ascii")
    request_body = {"raw": raw}
    if thread_id:
        request_body["threadId"] = thread_id
    result = (
        gmail_service()
        .users()
        .messages()
        .send(userId="me", body=request_body)
        .execute()
    )
    return {
        "sender_email": sender,
        "gmail_message_id": result.get("id") or "",
        "gmail_thread_id": result.get("threadId") or thread_id,
        "rfc_message_id": rfc_message_id,
        "gmail_web_link": gmail_search_link(sender, rfc_message_id),
    }


def _headers(message: dict) -> dict:
    return {
        str(row.get("name") or "").lower(): str(row.get("value") or "")
        for row in (message.get("payload", {}).get("headers") or [])
    }


def _decode_body(payload: dict) -> str:
    data = (payload.get("body") or {}).get("data")
    if data and payload.get("mimeType") == "text/plain":
        try:
            return base64.urlsafe_b64decode(data + "===").decode("utf-8", errors="replace")
        except Exception:
            return ""
    for part in payload.get("parts") or []:
        value = _decode_body(part)
        if value:
            return value
    return ""


def _attachment_parts(payload: dict):
    for part in payload.get("parts") or []:
        filename = str(part.get("filename") or "")
        attachment_id = str((part.get("body") or {}).get("attachmentId") or "")
        if filename and attachment_id:
            yield {
                "filename": filename,
                "mime_type": str(part.get("mimeType") or ""),
                "size": int((part.get("body") or {}).get("size") or 0),
                "gmail_attachment_id": attachment_id,
            }
        yield from _attachment_parts(part)


def get_gmail_thread(thread_id: str) -> list[dict]:
    result = (
        gmail_service()
        .users()
        .threads()
        .get(userId="me", id=thread_id, format="full")
        .execute()
    )
    rows = []
    for message in result.get("messages") or []:
        headers = _headers(message)
        internal_ms = int(message.get("internalDate") or 0)
        rows.append(
            {
                "gmail_message_id": message.get("id") or "",
                "gmail_thread_id": message.get("threadId") or thread_id,
                "rfc_message_id": headers.get("message-id", ""),
                "subject": headers.get("subject", ""),
                "from_email": headers.get("from", ""),
                "to_raw": headers.get("to", ""),
                "cc_raw": headers.get("cc", ""),
                "body_text": _decode_body(message.get("payload") or {}),
                "occurred_at": (
                    datetime.fromtimestamp(
                        internal_ms / 1000, tz=timezone.get_current_timezone()
                    )
                    if internal_ms
                    else timezone.now()
                ),
                "attachments": list(_attachment_parts(message.get("payload") or {})),
            }
        )
    return rows


def download_gmail_attachment(message_id: str, attachment_id: str) -> bytes:
    result = (
        gmail_service()
        .users()
        .messages()
        .attachments()
        .get(userId="me", messageId=message_id, id=attachment_id)
        .execute()
    )
    data = result.get("data") or ""
    return base64.urlsafe_b64decode(data + "===")

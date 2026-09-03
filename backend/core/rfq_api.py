"""Manual Order RFQ and PO Balance API for PartsFlow V7.4."""

from __future__ import annotations

import json
import re
from decimal import Decimal, InvalidOperation
from uuid import uuid4

from django.core.exceptions import ValidationError
from django.core.validators import URLValidator, validate_email
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.http import HttpResponse
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .audit_utils import audit
from .auth_api import require_permission
from .gmail_service import download_gmail_attachment
from .models import (
    OrderRFQ,
    OrderRFQItem,
    OrderRecord,
    POBalance,
    RFQAttachment,
    RFQCCRule,
    RFQMessage,
    Supplier,
    VendorEmailIdentity,
)


def _json_value(value, default):
    if value in (None, ""):
        return default
    if isinstance(value, (list, dict)):
        return value
    try:
        return json.loads(value)
    except (TypeError, json.JSONDecodeError):
        return default


def _emails(value, *, required=False):
    raw = _json_value(value, None)
    if raw is None:
        raw = re.split(r"[,;\n]+", str(value or ""))
    if isinstance(raw, str):
        raw = re.split(r"[,;\n]+", raw)
    result = []
    for item in raw or []:
        address = str(item or "").strip().lower()
        if not address:
            continue
        try:
            validate_email(address)
        except ValidationError as exc:
            raise ValueError(f"อีเมลไม่ถูกต้อง: {address}") from exc
        if address not in result:
            result.append(address)
    if required and not result:
        raise ValueError("กรุณาระบุอีเมล Vendor อย่างน้อย 1 รายการ")
    return result


def _email_link(value, *, required=False):
    link = str(value or "").strip()
    if not link:
        if required:
            raise ValueError("กรุณาวางลิงก์อีเมลที่ส่งคำขอราคา")
        return ""
    try:
        URLValidator(schemes=["https"])(link)
    except ValidationError as exc:
        raise ValueError("ลิงก์อีเมลไม่ถูกต้อง ต้องเป็นลิงก์ https://") from exc
    return link


def _occurred_at(value):
    if value in (None, ""):
        return timezone.now()
    parsed = parse_datetime(str(value))
    if not parsed:
        raise ValueError("วันที่และเวลาไม่ถูกต้อง")
    if timezone.is_naive(parsed):
        parsed = timezone.make_aware(parsed, timezone.get_current_timezone())
    return parsed


def _rfq_number():
    local = timezone.localtime()
    return f"RFQ-{local:%Y%m%d}-{uuid4().hex[:6].upper()}"


def _default_subject():
    return "[RFQ {{RFQ_NO}}] Request for Quotation - {{GROUP_ORDER}}"


def _default_request_body(actor_name=""):
    return (
        "เรียน ผู้ขาย\n\n"
        "กรุณาเสนอราคาสำหรับรายการด้านล่าง พร้อมระบุราคา สกุลเงิน "
        "ระยะเวลาจัดส่ง และอายุใบเสนอราคา\n\n"
        "หากต้องการข้อมูลเพิ่มเติม กรุณาตอบกลับอีเมลฉบับนี้\n\n"
        f"ขอบคุณครับ/ค่ะ\n{actor_name}"
    )


def _default_follow_up_body(rfq, message_type, actor_name=""):
    if message_type == RFQMessage.TYPE_PRICE_FOLLOW_UP:
        return (
            "เรียน ผู้ขาย\n\n"
            f"ขอติดตามใบเสนอราคาสำหรับ {rfq.rfq_number} ที่ได้ส่งไว้ก่อนหน้านี้ "
            "กรุณาแจ้งสถานะและวันที่คาดว่าจะส่งใบเสนอราคาได้\n\n"
            f"ขอบคุณครับ/ค่ะ\n{actor_name}"
        )
    return (
        "เรียน ผู้ขาย\n\n"
        f"ขอติดตามกำหนดการจัดส่งสำหรับรายการอ้างอิง {rfq.rfq_number} "
        "กรุณายืนยันวันที่จัดส่งล่าสุด และแจ้งสาเหตุหากกำหนดการมีการเปลี่ยนแปลง\n\n"
        f"ขอบคุณครับ/ค่ะ\n{actor_name}"
    )


def _selected_groups(order_ids):
    ids = [str(value) for value in order_ids if value]
    if not ids:
        raise ValueError("กรุณาเลือก Order อย่างน้อย 1 รายการ")
    rows = list(
        OrderRecord.objects.select_related("part")
        .filter(
            id__in=ids,
            is_deleted=False,
            lifecycle_status__in=[
                OrderRecord.LIFECYCLE_ACTIVE,
                OrderRecord.LIFECYCLE_WAIT_CONFIRM,
            ],
        )
        .order_by("group_order", "order_number")
    )
    if len(rows) != len(set(ids)):
        raise ValueError("มี Order บางรายการไม่พบหรือถูกลบแล้ว")

    groups = {}
    for order in rows:
        group_order = str(order.group_order or "").strip()
        if not group_order:
            raise ValueError(
                f"Order {order.order_number} ยังไม่มี Group Order จึงไม่สามารถขอราคาได้"
            )
        groups.setdefault(group_order, []).append(order)

    for group_order, selected in groups.items():
        jobs = {
            str(value or "").strip()
            for value in OrderRecord.objects.filter(
                group_order=group_order, is_deleted=False
            ).values_list("job", flat=True)
        }
        jobs.discard("")
        if len(jobs) != 1:
            raise ValueError(
                f"Group Order {group_order} ต้องมีรายการจาก JOB เดียวกันเท่านั้น"
            )
        selected_jobs = {str(order.job or "").strip() for order in selected}
        if selected_jobs != jobs:
            raise ValueError(
                f"ข้อมูล JOB ของ Group Order {group_order} ไม่ตรงกัน"
            )
    return groups


def _cc_for_job(job):
    rows = RFQCCRule.objects.filter(active=True).filter(
        Q(rule_type=RFQCCRule.TYPE_DEFAULT)
        | Q(rule_type=RFQCCRule.TYPE_JOB, job__iexact=job)
    )
    result = []
    for row in rows:
        email = row.email.strip().lower()
        if email and email not in result:
            result.append(email)
    return result


def _order_item(order):
    return {
        "order_id": str(order.id),
        "order_number": order.order_number,
        "item_id": order.part.sku if order.part else "",
        "part_name": order.part_name,
        "part_detail": order.part_detail,
        "amount": order.amount,
        "unit": order.unit_text,
    }


def _actor_link(actor, message):
    return message.gmail_web_link or ""


def _attachment_json(item):
    return {
        "id": str(item.id),
        "filename": item.filename,
        "mime_type": item.mime_type,
        "size": item.size,
        "quotation_revision": item.quotation_revision,
        "download_url": (
            f"/rfq-attachments/{item.id}/download/"
            if item.gmail_attachment_id
            else ""
        ),
    }


def _message_json(message, actor, *, include_body=True):
    email_link = _actor_link(actor, message)
    return {
        "id": str(message.id),
        "message_type": message.message_type,
        "direction": message.direction,
        "status": message.status,
        "subject": message.subject,
        "body_text": message.body_text if include_body else "",
        "from_email": message.from_email,
        "to_emails": message.to_emails,
        "cc_emails": message.cc_emails,
        "occurred_at": message.occurred_at.isoformat() if message.occurred_at else "",
        "sent_by": message.sent_by_employee.name if message.sent_by_employee else "",
        "email_link": email_link,
        "gmail_link": email_link,
        "attachments": [_attachment_json(item) for item in message.attachments.all()],
    }


def _rfq_json(rfq, actor, *, full=False):
    initial = next(
        (row for row in rfq.messages.all() if row.message_type == RFQMessage.TYPE_REQUEST),
        None,
    )
    link = _actor_link(actor, initial) if initial else rfq.gmail_web_link
    data = {
        "id": str(rfq.id),
        "rfq_number": rfq.rfq_number,
        "group_order": rfq.group_order,
        "job": rfq.job,
        "vendor_id": str(rfq.vendor_id) if rfq.vendor_id else "",
        "vendor": rfq.vendor.name if rfq.vendor else rfq.vendor_name,
        "recipient_email": rfq.recipient_email,
        "sent_at": rfq.requested_at.isoformat() if rfq.requested_at else "",
        "sent_by": rfq.sent_by_employee.name if rfq.sent_by_employee else "",
        "status": rfq.status,
        "subject": rfq.subject,
        "email_link": link,
        "gmail_link": link,
        "vendor_pending": not bool(rfq.vendor_id or rfq.vendor_name),
        "quotation_only": not rfq.items.filter(
            order__procurement_phase=OrderRecord.PROCUREMENT_PURCHASE,
            order__is_deleted=False,
        ).exists(),
        "has_purchase_order": rfq.items.filter(
            order__procurement_phase=OrderRecord.PROCUREMENT_PURCHASE,
            order__is_deleted=False,
        ).exists(),
    }
    if full:
        balance = getattr(rfq, "po_balance", None)
        data.update(
            {
                "body_text": rfq.body_text,
                "to_emails": rfq.to_emails,
                "cc_emails": rfq.cc_emails,
                "items": [
                    {
                        "id": str(item.id),
                        "order_id": str(item.order_id) if item.order_id else "",
                        "order_number": item.order_number,
                        "item_id": item.item_id,
                        "part_name": item.part_name,
                        "part_detail": item.part_detail,
                        "amount": item.amount,
                        "unit": item.unit,
                    }
                    for item in rfq.items.all()
                ],
                "messages": [
                    _message_json(message, actor)
                    for message in rfq.messages.all()
                ],
                "po_balance": {
                    "quotation_received_at": (
                        balance.quotation_received_at.isoformat()
                        if balance and balance.quotation_received_at
                        else ""
                    ),
                    "price": (
                        str(balance.price) if balance and balance.price is not None else ""
                    ),
                    "currency": balance.currency if balance else "THB",
                    "lead_time_days": balance.lead_time_days if balance else None,
                    "vendor_delivery_date": (
                        balance.vendor_delivery_date.isoformat()
                        if balance and balance.vendor_delivery_date
                        else ""
                    ),
                    "actual_delivery_date": (
                        balance.actual_delivery_date.isoformat()
                        if balance and balance.actual_delivery_date
                        else ""
                    ),
                    "note": balance.note if balance else "",
                },
            }
        )
    return data


def _rfq_queryset():
    return (
        OrderRFQ.objects.select_related(
            "vendor", "sent_by_employee", "po_balance"
        )
        .prefetch_related(
            "items", "messages__sent_by_employee", "messages__attachments"
        )
    )


@csrf_exempt
@api_view(["POST"])
@permission_classes([AllowAny])
def rfq_preview(request):
    actor, err = require_permission(request, "can_edit_purchase_info")
    if err:
        return err
    try:
        order_ids = _json_value(request.data.get("order_ids"), [])
        groups = _selected_groups(order_ids)
        return Response(
            {
                "subject_template": _default_subject(),
                "body_text": _default_request_body(actor.name),
                "groups": [
                    {
                        "group_order": group_order,
                        "job": orders[0].job,
                        "cc_emails": _cc_for_job(orders[0].job),
                        "items": [_order_item(order) for order in orders],
                    }
                    for group_order, orders in groups.items()
                ],
            }
        )
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=400)


@csrf_exempt
@api_view(["POST"])
@permission_classes([AllowAny])
def record_rfq(request):
    """Record an RFQ email that the employee already sent outside PartsFlow."""
    actor, err = require_permission(request, "can_edit_purchase_info")
    if err:
        return err
    try:
        order_ids = _json_value(request.data.get("order_ids"), [])
        groups = _selected_groups(order_ids)
        recipients = _emails(
            request.data.get("recipient_email") or request.data.get("recipients"),
            required=True,
        )
        if len(recipients) != 1:
            raise ValueError("กรุณาบันทึกแยกครั้งละ 1 Vendor เพื่อให้ลิงก์อีเมลตรงกัน")
        recipient = recipients[0]
        email_link = _email_link(
            request.data.get("email_link") or request.data.get("gmail_link"),
            required=True,
        )
        requested_at = _occurred_at(
            request.data.get("sent_at") or request.data.get("requested_at")
        )
        raw_group_cc = _json_value(request.data.get("group_cc_emails"), {})
        group_cc = {
            str(key): _emails(value)
            for key, value in (
                raw_group_cc.items() if isinstance(raw_group_cc, dict) else []
            )
        }
        vendor_id = str(request.data.get("vendor_id") or "").strip()
        vendor = None
        if vendor_id:
            vendor = Supplier.objects.filter(pk=vendor_id, active=True).first()
            if not vendor:
                raise ValueError("ไม่พบ Vendor ที่เลือก")
        vendor_name = vendor.name if vendor else str(
            request.data.get("vendor_name") or ""
        ).strip()
        if not vendor_name:
            raise ValueError("กรุณาเลือกหรือระบุชื่อ Vendor")
        if not vendor:
            vendor = Supplier.objects.filter(
                name__iexact=vendor_name, active=True
            ).first()
        if vendor:
            vendor_name = vendor.name
        body_text = str(request.data.get("body_text") or "").strip()
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=400)

    results = []
    for group_order, orders in groups.items():
        job = orders[0].job
        cc_emails = group_cc.get(group_order, _cc_for_job(job))
        cc_emails = [email for email in cc_emails if email != recipient]
        number = _rfq_number()
        subject = f"[RFQ {number}] Request for Quotation - {group_order}"[:500]

        with transaction.atomic():
            rfq = OrderRFQ.objects.create(
                rfq_number=number,
                group_order=group_order,
                job=job,
                vendor=vendor,
                vendor_name=vendor_name,
                recipient_email=recipient,
                sender_email=actor.email or "",
                requested_at=requested_at,
                sent_by_employee=actor,
                status=OrderRFQ.STATUS_SENT,
                subject=subject,
                body_text=body_text,
                to_emails=[recipient],
                cc_emails=cc_emails,
                gmail_web_link=email_link,
            )
            for order in orders:
                OrderRFQItem.objects.create(
                    rfq=rfq,
                    order=order,
                    order_number=order.order_number,
                    item_id=order.part.sku if order.part else "",
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
                subject=subject,
                body_text=body_text,
                from_email=actor.email or "",
                to_emails=[recipient],
                cc_emails=cc_emails,
                gmail_web_link=email_link,
                occurred_at=requested_at,
                sent_by_employee=actor,
            )
            POBalance.objects.create(rfq=rfq)
            VendorEmailIdentity.objects.update_or_create(
                email=recipient,
                defaults={
                    "vendor": vendor,
                    "vendor_name": vendor_name,
                    "confirmed_by_employee": actor,
                    "last_used_at": requested_at,
                },
            )

            from .order_api import compute_status

            for order in orders:
                order.status = compute_status(order, validate=False)
                order.save(update_fields=["status", "updated_at"])

        warning = ""
        try:
            audit(
                actor,
                "RFQ_RECORDED",
                "OrderRFQ",
                rfq.id,
                {
                    "rfq_number": number,
                    "group_order": group_order,
                    "vendor": vendor_name,
                    "recipient_email": recipient,
                    "email_link": email_link,
                    "order_ids": [str(order.id) for order in orders],
                },
            )
        except Exception as exc:
            warning = f"Audit: {exc}"

        result = _rfq_json(_rfq_queryset().get(pk=rfq.pk), actor)
        results.append(
            {
                "success": True,
                **result,
                **({"warning": warning} if warning else {}),
            }
        )

    return Response(
        {
            "results": results,
            "recorded_count": len(results),
            "sent_count": 0,
            "failed_count": 0,
        },
        status=201,
    )


@csrf_exempt
@api_view(["POST"])
@permission_classes([AllowAny])
def disabled_send_rfq(request):
    return Response(
        {"detail": "ระบบไม่ส่งอีเมลแล้ว กรุณาส่งเองและบันทึกลิงก์อีเมล"},
        status=410,
    )


@api_view(["GET"])
@permission_classes([AllowAny])
def rfq_list(request):
    actor, err = require_permission(request, "can_view_orders")
    if err:
        return err
    qs = _rfq_queryset().filter(status=OrderRFQ.STATUS_SENT)
    order_id = str(request.GET.get("order_id", "")).strip()
    if order_id:
        qs = qs.filter(items__order_id=order_id)
    group_order = str(request.GET.get("group_order", "")).strip()
    if group_order:
        qs = qs.filter(group_order=group_order)
    full = str(request.GET.get("full", "")).strip().lower() in {
        "1", "true", "yes"
    }
    return Response(
        {
            "results": [
                _rfq_json(row, actor, full=full)
                for row in qs.distinct()[:1000]
            ]
        }
    )


@csrf_exempt
@api_view(["PATCH"])
@permission_classes([AllowAny])
def rfq_vendor(request, pk):
    actor, err = require_permission(request, "can_edit_purchase_info")
    if err:
        return err
    rfq = _rfq_queryset().filter(pk=pk, status=OrderRFQ.STATUS_SENT).first()
    if not rfq:
        return Response({"detail": "ไม่พบ RFQ"}, status=404)

    vendor = None
    vendor_id = str(request.data.get("vendor_id") or "").strip()
    if vendor_id:
        vendor = Supplier.objects.filter(pk=vendor_id, active=True).first()
        if not vendor:
            return Response({"detail": "ไม่พบ Vendor"}, status=404)
    vendor_name = vendor.name if vendor else str(request.data.get("vendor_name") or "").strip()
    if not vendor_name:
        return Response({"detail": "กรุณาระบุชื่อ Vendor"}, status=400)

    rfq.vendor = vendor
    rfq.vendor_name = vendor_name
    rfq.save(update_fields=["vendor", "vendor_name", "updated_at"])
    VendorEmailIdentity.objects.update_or_create(
        email=rfq.recipient_email.lower(),
        defaults={
            "vendor": vendor,
            "vendor_name": vendor_name,
            "confirmed_by_employee": actor,
            "last_used_at": timezone.now(),
        },
    )
    audit(actor, "RFQ_VENDOR_SET", "OrderRFQ", rfq.id, {"vendor": vendor_name})
    return Response(_rfq_json(rfq, actor))


@api_view(["GET"])
@permission_classes([AllowAny])
def po_balance_list(request):
    actor, err = require_permission(request, "can_view_orders")
    if err:
        return err
    qs = _rfq_queryset().filter(status=OrderRFQ.STATUS_SENT)
    q = str(request.GET.get("q", "")).strip()
    if q:
        qs = qs.filter(
            Q(rfq_number__icontains=q)
            | Q(group_order__icontains=q)
            | Q(vendor_name__icontains=q)
            | Q(vendor__name__icontains=q)
            | Q(recipient_email__icontains=q)
            | Q(items__order_number__icontains=q)
            | Q(items__part_name__icontains=q)
        )
    return Response(
        {"results": [_rfq_json(row, actor, full=True) for row in qs.distinct()[:1000]]}
    )


@csrf_exempt
@api_view(["GET", "PATCH"])
@permission_classes([AllowAny])
def po_balance_detail(request, pk):
    permission = "can_view_orders" if request.method == "GET" else "can_edit_purchase_info"
    actor, err = require_permission(request, permission)
    if err:
        return err
    rfq = _rfq_queryset().filter(pk=pk, status=OrderRFQ.STATUS_SENT).first()
    if not rfq:
        return Response({"detail": "ไม่พบ RFQ ใน PO Balance"}, status=404)
    if request.method == "GET":
        return Response(_rfq_json(rfq, actor, full=True))

    balance, _ = POBalance.objects.get_or_create(rfq=rfq)
    if "quotation_received_at" in request.data:
        raw = request.data.get("quotation_received_at")
        parsed = parse_datetime(str(raw)) if raw else None
        if raw and not parsed:
            return Response({"detail": "วันที่ได้รับใบเสนอราคาไม่ถูกต้อง"}, status=400)
        balance.quotation_received_at = parsed
    if "price" in request.data:
        raw = request.data.get("price")
        try:
            balance.price = Decimal(str(raw)) if raw not in (None, "") else None
        except (InvalidOperation, TypeError, ValueError):
            return Response({"detail": "ราคาไม่ถูกต้อง"}, status=400)
    if "currency" in request.data:
        balance.currency = str(request.data.get("currency") or "THB").strip().upper()[:10]
    if "lead_time_days" in request.data:
        raw = request.data.get("lead_time_days")
        try:
            balance.lead_time_days = None if raw in (None, "") else max(0, int(raw))
        except (TypeError, ValueError):
            return Response({"detail": "Lead time ไม่ถูกต้อง"}, status=400)
    for field in ["vendor_delivery_date", "actual_delivery_date"]:
        if field in request.data:
            raw = request.data.get(field)
            parsed = parse_date(str(raw)) if raw else None
            if raw and not parsed:
                return Response({"detail": "วันที่จัดส่งไม่ถูกต้อง"}, status=400)
            setattr(balance, field, parsed)
    if "note" in request.data:
        balance.note = str(request.data.get("note") or "").strip()
    balance.updated_by_employee = actor
    balance.save()
    audit(actor, "PO_BALANCE_UPDATE", "POBalance", balance.id, {"rfq": rfq.rfq_number})
    return Response(_rfq_json(_rfq_queryset().get(pk=rfq.pk), actor, full=True))


@csrf_exempt
@api_view(["POST"])
@permission_classes([AllowAny])
def record_follow_up(request, pk):
    """Record a price or delivery follow-up sent manually by the employee."""
    actor, err = require_permission(request, "can_edit_purchase_info")
    if err:
        return err
    rfq = _rfq_queryset().filter(pk=pk, status=OrderRFQ.STATUS_SENT).first()
    initial = (
        rfq.messages.filter(message_type=RFQMessage.TYPE_REQUEST).first()
        if rfq
        else None
    )
    if not rfq or not (rfq.gmail_web_link or (initial and initial.gmail_web_link)):
        return Response(
            {"detail": "รายการนี้ยังไม่มีลิงก์อีเมลขอราคา จึงบันทึกการติดตามไม่ได้"},
            status=400,
        )

    message_type = str(request.data.get("message_type") or "")
    if message_type not in {
        RFQMessage.TYPE_PRICE_FOLLOW_UP,
        RFQMessage.TYPE_DELIVERY_FOLLOW_UP,
    }:
        return Response({"detail": "ประเภทการติดตามไม่ถูกต้อง"}, status=400)
    if (
        message_type == RFQMessage.TYPE_DELIVERY_FOLLOW_UP
        and not rfq.items.filter(
            order__procurement_phase=OrderRecord.PROCUREMENT_PURCHASE,
            order__is_deleted=False,
        ).exists()
    ):
        return Response(
            {
                "detail":
                "รายการนี้ยังอยู่ในช่วงขอราคา กรุณาสร้างไปยัง Order Step "
                "ก่อนบันทึกการตามวันที่จัดส่ง"
            },
            status=400,
        )
    try:
        email_link = _email_link(
            request.data.get("email_link") or request.data.get("gmail_link"),
            required=True,
        )
        occurred_at = _occurred_at(request.data.get("occurred_at"))
        cc_emails = (
            _emails(request.data.get("cc_emails"))
            if "cc_emails" in request.data
            else list(rfq.cc_emails or [])
        )
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=400)

    body_text = str(
        request.data.get("body_text")
        or _default_follow_up_body(rfq, message_type, actor.name)
    ).strip()
    message = RFQMessage.objects.create(
        rfq=rfq,
        message_type=message_type,
        direction=RFQMessage.DIRECTION_OUTBOUND,
        status=RFQMessage.STATUS_SENT,
        subject=rfq.subject,
        body_text=body_text,
        from_email=actor.email or "",
        to_emails=[rfq.recipient_email] if rfq.recipient_email else [],
        cc_emails=cc_emails,
        gmail_web_link=email_link,
        occurred_at=occurred_at,
        sent_by_employee=actor,
    )
    warning = ""
    try:
        audit(
            actor,
            "RFQ_FOLLOW_UP_RECORDED",
            "OrderRFQ",
            rfq.id,
            {
                "message_type": message_type,
                "email_link": email_link,
                "occurred_at": occurred_at.isoformat(),
            },
        )
    except Exception as exc:
        warning = f"Audit: {exc}"
    payload = _message_json(message, actor)
    if warning:
        payload["warning"] = warning
    return Response(payload, status=201)


@api_view(["GET"])
@permission_classes([AllowAny])
def download_attachment(request, pk):
    _, err = require_permission(request, "can_view_orders")
    if err:
        return err
    item = RFQAttachment.objects.select_related("message").filter(pk=pk).first()
    if not item or not item.gmail_attachment_id:
        return Response({"detail": "ไม่พบไฟล์แนบ"}, status=404)
    try:
        payload = download_gmail_attachment(
            item.gmail_message_id or item.message.gmail_message_id,
            item.gmail_attachment_id,
        )
    except Exception as exc:
        return Response({"detail": str(exc)}, status=502)
    response = HttpResponse(payload, content_type=item.mime_type or "application/octet-stream")
    safe_name = item.filename.replace('"', "")
    response["Content-Disposition"] = f'attachment; filename="{safe_name}"'
    return response


def _cc_rule_json(row):
    return {
        "id": str(row.id),
        "rule_type": row.rule_type,
        "job": row.job,
        "email": row.email,
        "display_name": row.display_name,
        "active": row.active,
    }


@csrf_exempt
@api_view(["GET", "POST"])
@permission_classes([AllowAny])
def cc_rules(request):
    permission = "can_view_orders" if request.method == "GET" else "can_edit_purchase_info"
    actor, err = require_permission(request, permission)
    if err:
        return err
    if request.method == "GET":
        return Response({"results": [_cc_rule_json(row) for row in RFQCCRule.objects.all()]})
    rule_type = str(request.data.get("rule_type") or "").strip().upper()
    job = str(request.data.get("job") or "").strip().upper()
    email = str(request.data.get("email") or "").strip().lower()
    if rule_type not in {RFQCCRule.TYPE_DEFAULT, RFQCCRule.TYPE_JOB}:
        return Response({"detail": "ประเภท CC ไม่ถูกต้อง"}, status=400)
    if rule_type == RFQCCRule.TYPE_JOB and not job:
        return Response({"detail": "กรุณาระบุ JOB"}, status=400)
    if rule_type == RFQCCRule.TYPE_DEFAULT:
        job = ""
    try:
        validate_email(email)
        row = RFQCCRule.objects.create(
            rule_type=rule_type,
            job=job,
            email=email,
            display_name=str(request.data.get("display_name") or "").strip(),
            created_by_employee=actor,
        )
    except ValidationError:
        return Response({"detail": "อีเมล CC ไม่ถูกต้อง"}, status=400)
    except IntegrityError:
        return Response({"detail": "อีเมล CC นี้มีอยู่แล้ว"}, status=400)
    audit(actor, "RFQ_CC_CREATE", "RFQCCRule", row.id, _cc_rule_json(row))
    return Response(_cc_rule_json(row), status=201)


@csrf_exempt
@api_view(["DELETE"])
@permission_classes([AllowAny])
def cc_rule_detail(request, pk):
    actor, err = require_permission(request, "can_edit_purchase_info")
    if err:
        return err
    row = RFQCCRule.objects.filter(pk=pk).first()
    if not row:
        return Response({"detail": "ไม่พบ CC Rule"}, status=404)
    before = _cc_rule_json(row)
    row.delete()
    audit(actor, "RFQ_CC_DELETE", "RFQCCRule", pk, before)
    return Response({"success": True})

import json
import os
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from django.core import signing
from django.db import transaction
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .auth_api import require_permission
from .models import ClothRollStock, ClothRollTransaction, Employee


QR_SIGNING_SALT = "partsflow.cloth-roll.qr"

PHASES = {
    "phase-4": ClothRollStock.PHASE_4,
    "phase4": ClothRollStock.PHASE_4,
    "PHASE4": ClothRollStock.PHASE_4,
    "phase-11": ClothRollStock.PHASE_11,
    "phase11": ClothRollStock.PHASE_11,
    "PHASE11": ClothRollStock.PHASE_11,
}


def _phase(value):
    return PHASES.get(str(value or "").strip())


def _stock_row(phase):
    row, _ = ClothRollStock.objects.get_or_create(phase=phase)
    return row


def _line_configured():
    return bool(
        os.environ.get("LINE_CHANNEL_ACCESS_TOKEN", "").strip()
        and os.environ.get("LINE_USER_ID", "").strip()
    )


def _send_line(text):
    token = os.environ.get("LINE_CHANNEL_ACCESS_TOKEN", "").strip()
    recipient = os.environ.get("LINE_USER_ID", "").strip()
    if not token or not recipient:
        return False
    payload = json.dumps({
        "to": recipient,
        "messages": [{"type": "text", "text": text[:4900]}],
    }).encode("utf-8")
    request = Request(
        "https://api.line.me/v2/bot/message/push",
        data=payload,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=8) as response:
            return 200 <= response.status < 300
    except (HTTPError, URLError, TimeoutError, OSError):
        return False


def _maybe_notify_low_stock(stock):
    if stock.quantity > stock.low_stock_threshold:
        if stock.low_stock_notified:
            stock.low_stock_notified = False
            stock.save(update_fields=["low_stock_notified", "updated_at"])
        return
    if stock.low_stock_notified:
        return
    if _send_line(
        f"แจ้งเตือนเศษผ้าเหลือน้อย\n{stock.get_phase_display()}\n"
        f"คงเหลือ: {stock.quantity} ม้วน\n"
        f"จุดแจ้งเตือน: {stock.low_stock_threshold} ม้วน"
    ):
        stock.low_stock_notified = True
        stock.save(update_fields=["low_stock_notified", "updated_at"])


def _stock_json(stock):
    return {
        "phase": stock.phase,
        "phase_label": stock.get_phase_display(),
        "quantity": stock.quantity,
        "low_stock_threshold": stock.low_stock_threshold,
        "is_low": stock.quantity <= stock.low_stock_threshold,
    }


def _transaction_json(row):
    return {
        "id": str(row.id),
        "phase": row.phase,
        "phase_label": dict(ClothRollStock.PHASE_CHOICES).get(row.phase, row.phase),
        "transaction_type": row.transaction_type,
        "type_label": "เบิก" if row.transaction_type == "OUT" else "รับเข้า",
        "quantity": row.quantity,
        "balance_after": row.balance_after,
        "borrower_employee_id": str(row.borrower_employee_id) if row.borrower_employee_id else "",
        "borrower_name": row.borrower_employee.name if row.borrower_employee else "",
        "recorded_by_name": row.recorded_by_employee.name if row.recorded_by_employee else "",
        "source": row.source,
        "created_at": row.created_at.isoformat(),
    }


@csrf_exempt
@api_view(["GET"])
@permission_classes([AllowAny])
def cloth_rolls(request):
    qr_token = str(request.GET.get("qr_token") or "").strip()
    permission = "can_view_qr_withdraw" if qr_token else "can_view_cloth_rolls"
    actor, err = require_permission(request, permission)
    if err:
        return err
    stocks = [_stock_row(phase) for phase in (ClothRollStock.PHASE_4, ClothRollStock.PHASE_11)]
    transactions = ClothRollTransaction.objects.select_related(
        "borrower_employee", "recorded_by_employee"
    ).all()[:200]
    employees = Employee.objects.filter(active=True).order_by("employee_code").values(
        "id", "employee_code", "name", "department"
    )[:1000]
    qr_phase = None
    if qr_token:
        try:
            qr_payload = signing.loads(qr_token, salt=QR_SIGNING_SALT)
            if qr_payload.get("phase") in {ClothRollStock.PHASE_4, ClothRollStock.PHASE_11}:
                qr_phase = qr_payload["phase"]
        except signing.BadSignature:
            qr_phase = None
    qr_tokens = {
        phase: signing.dumps({"phase": phase}, salt=QR_SIGNING_SALT, compress=True)
        for phase in (ClothRollStock.PHASE_4, ClothRollStock.PHASE_11)
    }
    return Response({
        "qr_phase": qr_phase,
        "qr_tokens": qr_tokens,
        "stocks": [_stock_json(row) for row in stocks],
        "transactions": [_transaction_json(row) for row in transactions],
        "employees": [
            {"id": str(e["id"]), "employee_code": e["employee_code"], "name": e["name"], "department": e["department"]}
            for e in employees
        ],
        "line_configured": _line_configured(),
        "current_employee_id": str(actor.id),
    })


@csrf_exempt
@api_view(["POST"])
@permission_classes([AllowAny])
def cloth_roll_transaction(request):
    source = str(request.data.get("source") or "WEB").strip().upper()
    permission = "can_view_qr_withdraw" if source == "QR" else "can_view_cloth_rolls"
    actor, err = require_permission(request, permission)
    if err:
        return err
    if source == "QR":
        qr_token = str(request.data.get("qr_token") or "").strip()
        try:
            qr_payload = signing.loads(qr_token, salt=QR_SIGNING_SALT)
            phase = qr_payload.get("phase")
        except signing.BadSignature:
            return Response({"detail": "QR Code ไม่ถูกต้อง กรุณาสแกน QR Code ของ Phase 4 หรือ Phase 11"}, status=400)
    else:
        phase = _phase(request.data.get("phase"))
    tx_type = str(request.data.get("transaction_type") or "").strip().upper()
    if phase not in {ClothRollStock.PHASE_4, ClothRollStock.PHASE_11}:
        return Response({"detail": "Phase ไม่ถูกต้อง"}, status=400)
    if tx_type not in {ClothRollTransaction.TYPE_IN, ClothRollTransaction.TYPE_OUT}:
        return Response({"detail": "กรุณาเลือกเบิกหรือรับเข้า"}, status=400)
    if source not in {"WEB", "QR"}:
        return Response({"detail": "แหล่งบันทึกไม่ถูกต้อง"}, status=400)
    try:
        raw_qty = request.data.get("quantity")
        if isinstance(raw_qty, bool) or str(raw_qty).strip() == "":
            raise ValueError
        qty = int(str(raw_qty).strip())
        if qty < 1:
            raise ValueError
    except (TypeError, ValueError):
        return Response({"detail": "จำนวนต้องเป็นจำนวนเต็มอย่างน้อย 1 ม้วน"}, status=400)

    borrower = None
    borrower_id = str(request.data.get("borrower_employee_id") or "").strip()
    if source == "WEB" and tx_type == "OUT" and not borrower_id:
        return Response({"detail": "กรุณาเลือกชื่อผู้เบิก"}, status=400)
    if borrower_id:
        borrower = Employee.objects.filter(id=borrower_id, active=True).first()
        if not borrower:
            return Response({"detail": "ไม่พบชื่อผู้เบิกในระบบ"}, status=400)
    if source == "QR":
        borrower = None

    _stock_row(phase)
    with transaction.atomic():
        stock = ClothRollStock.objects.select_for_update().get(phase=phase)
        if tx_type == ClothRollTransaction.TYPE_OUT and stock.quantity < qty:
            return Response({
                "detail": f"เศษผ้าไม่เพียงพอ คงเหลือ {stock.quantity} ม้วน"
            }, status=400)
        stock.quantity = stock.quantity + qty if tx_type == ClothRollTransaction.TYPE_IN else stock.quantity - qty
        stock.save(update_fields=["quantity", "updated_at"])
        row = ClothRollTransaction.objects.create(
            phase=phase,
            transaction_type=tx_type,
            quantity=qty,
            balance_after=stock.quantity,
            borrower_employee=borrower,
            recorded_by_employee=actor,
            source=source,
        )
    _maybe_notify_low_stock(stock)
    row = ClothRollTransaction.objects.select_related("borrower_employee", "recorded_by_employee").get(pk=row.pk)
    return Response({
        "transaction": _transaction_json(row),
        "stock": _stock_json(stock),
        "line_configured": _line_configured(),
    }, status=201)


@csrf_exempt
@api_view(["PATCH"])
@permission_classes([AllowAny])
def cloth_roll_settings(request, phase):
    actor, err = require_permission(request, "can_view_cloth_rolls")
    if err:
        return err
    normalized = _phase(phase)
    if normalized not in {ClothRollStock.PHASE_4, ClothRollStock.PHASE_11}:
        return Response({"detail": "Phase ไม่ถูกต้อง"}, status=400)
    try:
        raw = request.data.get("low_stock_threshold")
        if isinstance(raw, bool) or str(raw).strip() == "":
            raise ValueError
        threshold = int(str(raw).strip())
        if threshold < 0:
            raise ValueError
    except (TypeError, ValueError):
        return Response({"detail": "จุดแจ้งเตือนต้องเป็นจำนวนเต็มตั้งแต่ 0 ม้วนขึ้นไป"}, status=400)
    stock = _stock_row(normalized)
    stock.low_stock_threshold = threshold
    stock.low_stock_notified = False
    stock.save(update_fields=["low_stock_threshold", "low_stock_notified", "updated_at"])
    _maybe_notify_low_stock(stock)
    return Response({"stock": _stock_json(stock), "line_configured": _line_configured()})

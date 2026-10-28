from django.db import transaction
from django.db.models import F
import re
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .auth_api import require_permission
from .audit_utils import audit
from .models import Employee, ToolingItem, ToolingTransaction

def parse_whole_number(value, *, allow_zero=True):
    """Accept integer values only; never silently truncate decimals or booleans."""
    if isinstance(value, bool):
        raise ValueError()
    text = str(value if value is not None else "").strip()
    if not re.fullmatch(r"\d+", text):
        raise ValueError()
    number = int(text)
    if number < 0 or (not allow_zero and number == 0):
        raise ValueError()
    return number


def item_json(item):
    return {
        "id": str(item.id), "name": item.name, "detail": item.detail,
        "maker": item.maker, "quantity": item.quantity,
        "min_quantity": item.min_quantity, "unit": item.unit,
        "active": item.active, "low_stock": item.quantity < item.min_quantity,
    }


def tx_json(tx):
    return {
        "id": str(tx.id), "item_id": str(tx.item_id), "item_name": tx.item.name,
        "quantity": tx.quantity, "requester_id": str(tx.requester_id) if tx.requester_id else "",
        "requester_name": tx.requester_name, "created_by_name": tx.created_by.name if tx.created_by else "", "reason": tx.reason,
        "reason_label": tx.get_reason_display(), "remark": tx.remark,
        "created_at": tx.created_at.isoformat(),
    }


@api_view(["GET"])
@permission_classes([AllowAny])
def safety_stock(request):
    # Safety Stock users need the below-minimum view without receiving access to
    # the full Tooling inventory or withdrawal endpoints.
    actor, err = require_permission(request, "can_view_safety_stock")
    if err:
        return err
    qs = ToolingItem.objects.filter(active=True, quantity__lt=F("min_quantity")).order_by("name")
    return Response({"count": qs.count(), "results": [item_json(item) for item in qs]})


@csrf_exempt
@api_view(["GET", "POST"])
@permission_classes([AllowAny])
def items(request):
    actor, err = require_permission(request, "can_view_tooling" if request.method == "GET" else "can_add_tooling")
    if err:
        return err
    if request.method == "GET":
        qs = ToolingItem.objects.filter(active=True).order_by("name")
        return Response({"count": qs.count(), "results": [item_json(x) for x in qs]})
    name = str(request.data.get("name") or "").strip()
    if not name:
        return Response({"detail": "กรุณาระบุชื่ออุปกรณ์"}, status=400)
    try:
        quantity = parse_whole_number(request.data.get("quantity", 0))
        minimum = parse_whole_number(request.data.get("min_quantity", 0))
    except (TypeError, ValueError):
        return Response({"detail": "จำนวนต้องเป็นเลขศูนย์หรือจำนวนเต็มบวก"}, status=400)
    item = ToolingItem.objects.create(name=name, detail=str(request.data.get("detail") or "").strip(),
        maker=str(request.data.get("maker") or "").strip(), quantity=quantity,
        min_quantity=minimum, unit=str(request.data.get("unit") or "").strip())
    audit(actor, "CREATE", "ToolingItem", item.id, item_json(item))
    return Response(item_json(item), status=201)


@csrf_exempt
@api_view(["PATCH", "DELETE"])
@permission_classes([AllowAny])
def item_detail(request, pk):
    permission = "can_delete_tooling" if request.method == "DELETE" else "can_edit_tooling"
    actor, err = require_permission(request, permission)
    if err:
        return err
    item = ToolingItem.objects.filter(pk=pk, active=True).first()
    if not item:
        return Response({"detail": "ไม่พบรายการ Tooling"}, status=404)
    if request.method == "DELETE":
        item.active = False
        item.save(update_fields=["active", "updated_at"])
        audit(actor, "DEACTIVATE", "ToolingItem", item.id, {"name": item.name})
        return Response({"deleted": True})
    for field in ("name", "detail", "maker", "unit"):
        if field in request.data:
            value = str(request.data.get(field) or "").strip()
            if field == "name" and not value:
                return Response({"detail": "ชื่ออุปกรณ์ห้ามว่าง"}, status=400)
            setattr(item, field, value)
    for field in ("quantity", "min_quantity"):
        if field in request.data:
            try:
                value = parse_whole_number(request.data[field])
            except (TypeError, ValueError):
                return Response({"detail": "จำนวนต้องเป็นเลขศูนย์หรือจำนวนเต็มบวก"}, status=400)
            setattr(item, field, value)
    item.save()
    audit(actor, "UPDATE", "ToolingItem", item.id, item_json(item))
    return Response(item_json(item))


@csrf_exempt
@api_view(["POST"])
@permission_classes([AllowAny])
def withdraw(request, pk):
    actor, err = require_permission(request, "can_withdraw_tooling")
    if err:
        return err
    try:
        qty = parse_whole_number(request.data.get("quantity", 0), allow_zero=False)
    except (TypeError, ValueError):
        return Response({"detail": "จำนวนที่เบิกต้องมากกว่า 0"}, status=400)
    reason = str(request.data.get("reason") or "").upper()
    if reason not in {ToolingTransaction.REASON_LOST, ToolingTransaction.REASON_DAMAGED}:
        return Response({"detail": "กรุณาเลือกเหตุผล หาย หรือ ชำรุด"}, status=400)
    requester_id = request.data.get("requester_id")
    requester = Employee.objects.filter(pk=requester_id, active=True).first() if requester_id else None
    if not requester:
        return Response({"detail": "กรุณาเลือกผู้เบิกจากรายชื่อพนักงาน"}, status=400)
    with transaction.atomic():
        item = ToolingItem.objects.select_for_update().filter(pk=pk, active=True).first()
        if not item:
            return Response({"detail": "ไม่พบรายการ Tooling"}, status=404)
        if item.quantity < qty:
            return Response({"detail": "จำนวนคงเหลือไม่เพียงพอ"}, status=400)
        item.quantity = F("quantity") - qty
        item.save(update_fields=["quantity", "updated_at"])
        item.refresh_from_db()
        tx = ToolingTransaction.objects.create(item=item, quantity=qty, requester=requester,
            requester_name=requester.name, reason=reason, remark=str(request.data.get("remark") or "").strip(), created_by=actor)
        audit(actor, "WITHDRAW", "ToolingItem", item.id, {"transaction_id": str(tx.id), "quantity": qty, "reason": reason})
    return Response({"item": item_json(item), "transaction": tx_json(tx)}, status=201)


@api_view(["GET"])
@permission_classes([AllowAny])
def history(request):
    actor, err = require_permission(request, "can_view_tooling")
    if err:
        return err
    qs = ToolingTransaction.objects.select_related("item", "requester", "created_by").all()
    reason = str(request.query_params.get("reason") or "").upper()
    if reason in {ToolingTransaction.REASON_LOST, ToolingTransaction.REASON_DAMAGED}:
        qs = qs.filter(reason=reason)
    return Response({"count": qs.count(), "results": [tx_json(x) for x in qs[:1000]]})

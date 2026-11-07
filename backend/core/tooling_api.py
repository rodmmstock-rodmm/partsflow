from uuid import UUID
import hashlib
import re

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.db.models import F
import re
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .auth_api import require_permission
from .audit_utils import audit
from .models import Employee, OrderRecord, ToolingItem, ToolingTransaction
from .image_optimizer import optimize_part_image
from .supabase_storage import (
    SupabaseStorageConfigError,
    SupabaseStorageRequestError,
    public_image_url,
    storage_enabled,
    storage_object_path,
    upload_object,
)

def parse_whole_number(value, *, allow_zero=True):
    """Accept integer values only; never silently truncate decimals or booleans."""
    if isinstance(value, bool):
        raise ValueError()
    text = str(value if value is not None else "").strip()
    if not re.fullmatch(r"\d+", text):
        raise ValueError()
    number = int(text)
    # Tooling quantities use PositiveIntegerField (32-bit); reject values that
    # cannot be stored before they reach the database.
    if number > 2147483647 or (not allow_zero and number == 0):
        raise ValueError()
    return number


def next_equipment_number():
    """Suggest the next GTOOL number without changing any existing records."""
    latest = (
        ToolingItem.objects.filter(equipment_number__regex=r"^GTOOL[0-9]{5}$")
        .order_by("-equipment_number")
        .values_list("equipment_number", flat=True)
        .first()
    )
    next_value = int(latest[5:]) + 1 if latest else 1
    return f"GTOOL{next_value:05d}" if next_value <= 99999 else ""


def item_json(item):
    return {
        "id": str(item.id), "name": item.name,
        "equipment_number": item.equipment_number, "detail": item.detail,
        "location": item.location, "maker": item.maker, "quantity": item.quantity,
        "min_quantity": item.min_quantity, "order_quantity": item.order_quantity, "unit": item.unit,
        "active": item.active, "low_stock": item.quantity < item.min_quantity,
        "image_url": public_image_url(item.image_path) if item.image_path else "",
    }


def tx_json(tx):
    return {
        "id": str(tx.id), "item_id": str(tx.item_id), "item_name": tx.item.name,
        "quantity": tx.quantity, "requester_id": str(tx.requester_id) if tx.requester_id else "",
        "requester_name": tx.requester_name, "created_by_name": tx.created_by.name if tx.created_by else "", "reason": tx.reason,
        "reason_label": tx.get_reason_display(), "vehicle_number": tx.vehicle_number, "remark": tx.remark,
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
    active_tooling_order_ids = OrderRecord.objects.filter(
        legacy_source="TOOLING_SAFETY_STOCK",
        is_deleted=False,
        procurement_phase=OrderRecord.PROCUREMENT_PURCHASE,
        lifecycle_status__in=[
            OrderRecord.LIFECYCLE_ACTIVE,
            OrderRecord.LIFECYCLE_WAIT_CONFIRM,
        ],
    ).values_list("legacy_id", flat=True)
    active_tooling_ids = []
    for value in active_tooling_order_ids:
        try:
            active_tooling_ids.append(UUID(str(value)))
        except (TypeError, ValueError, AttributeError):
            continue
    qs = (
        ToolingItem.objects.filter(active=True, quantity__lt=F("min_quantity"))
        .exclude(id__in=active_tooling_ids)
        .order_by("name")
    )
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
        return Response({
            "count": qs.count(),
            "results": [item_json(x) for x in qs],
            "suggested_equipment_number": next_equipment_number(),
        })
    name = str(request.data.get("name") or "").strip()
    if not name:
        return Response({"detail": "กรุณาระบุชื่ออุปกรณ์"}, status=400)
    try:
        quantity = parse_whole_number(request.data.get("quantity", 0))
        minimum = parse_whole_number(request.data.get("min_quantity", 0))
        order_quantity = parse_whole_number(request.data.get("order_quantity", 0))
    except (TypeError, ValueError):
        return Response({"detail": "จำนวนต้องเป็นเลขศูนย์หรือจำนวนเต็มบวก"}, status=400)
    equipment_number = str(request.data.get("equipment_number") or "").strip().upper()
    if not equipment_number:
        equipment_number = next_equipment_number()
    if not re.fullmatch(r"GTOOL[0-9]{5}", equipment_number):
        return Response({"detail": "หมายเลขอุปกรณ์ต้องอยู่ในรูปแบบ GTOOL ตามด้วยตัวเลข 5 หลัก"}, status=400)
    try:
        with transaction.atomic():
            item = ToolingItem.objects.create(
                name=name, equipment_number=equipment_number,
                detail=str(request.data.get("detail") or "").strip(),
                location=str(request.data.get("location") or "").strip(),
                maker=str(request.data.get("maker") or "").strip(), quantity=quantity,
                min_quantity=minimum, order_quantity=order_quantity,
                unit=str(request.data.get("unit") or "").strip(),
            )
    except IntegrityError:
        return Response({"detail": "หมายเลขอุปกรณ์นี้มีอยู่แล้ว กรุณาใช้หมายเลขอื่น"}, status=409)
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
    if "equipment_number" in request.data:
        equipment_number = str(request.data.get("equipment_number") or "").strip().upper()
        if equipment_number and not re.fullmatch(r"GTOOL[0-9]{5}", equipment_number):
            return Response({"detail": "หมายเลขอุปกรณ์ต้องอยู่ในรูปแบบ GTOOL ตามด้วยตัวเลข 5 หลัก"}, status=400)
        item.equipment_number = equipment_number
    for field in ("name", "detail", "location", "maker", "unit"):
        if field in request.data:
            value = str(request.data.get(field) or "").strip()
            if field == "name" and not value:
                return Response({"detail": "ชื่ออุปกรณ์ห้ามว่าง"}, status=400)
            setattr(item, field, value)
    for field in ("quantity", "min_quantity", "order_quantity"):
        if field in request.data:
            try:
                value = parse_whole_number(request.data[field])
            except (TypeError, ValueError):
                return Response({"detail": "จำนวนต้องเป็นเลขศูนย์หรือจำนวนเต็มบวก"}, status=400)
            setattr(item, field, value)
    try:
        item.save()
    except IntegrityError:
        return Response({"detail": "หมายเลขอุปกรณ์นี้มีอยู่แล้ว กรุณาใช้หมายเลขอื่น"}, status=409)
    audit(actor, "UPDATE", "ToolingItem", item.id, item_json(item))
    return Response(item_json(item))


@csrf_exempt
@api_view(["POST"])
@permission_classes([AllowAny])
def item_image(request, pk):
    actor, err = require_permission(request, "can_edit_tooling")
    if err:
        actor, err = require_permission(request, "can_add_tooling")
    if err:
        return err
    item = ToolingItem.objects.filter(pk=pk, active=True).first()
    if not item:
        return Response({"detail": "ไม่พบรายการ Tooling"}, status=404)
    if not storage_enabled():
        return Response({"detail": "Supabase image storage ยังไม่ได้เปิดใช้งาน"}, status=503)
    upload = request.FILES.get("image")
    if not upload:
        return Response({"detail": "กรุณาเลือกไฟล์รูปภาพ"}, status=400)
    content_type = str(getattr(upload, "content_type", "") or "").lower().split(";", 1)[0].strip()
    extensions = {
        "image/jpeg": ".jpg", "image/jpg": ".jpg",
        "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif",
    }
    extension = extensions.get(content_type)
    if not extension:
        return Response({"detail": "รองรับเฉพาะ JPG, PNG, WEBP และ GIF"}, status=400)
    original = upload.read()
    if not original or len(original) > 10 * 1024 * 1024:
        return Response({"detail": "รูปภาพต้องมีขนาดมากกว่า 0 และไม่เกิน 10 MB"}, status=400)
    try:
        payload, content_type = optimize_part_image(original, content_type)
        digest = hashlib.sha256(payload).hexdigest()
        safe_number = re.sub(r"[^A-Za-z0-9._-]+", "_", item.equipment_number or str(item.id))[:80] or "tooling"
        logical_path = f"DATA1_Images/Tooling/{safe_number}/{digest[:24]}{extension}"
        upload_object(storage_object_path(logical_path), payload, content_type=content_type, upsert=False)
    except (ValueError, SupabaseStorageConfigError) as exc:
        return Response({"detail": str(exc)}, status=400)
    except SupabaseStorageRequestError as exc:
        return Response({"detail": str(exc)}, status=502)
    item.image_path = logical_path
    item.save(update_fields=["image_path", "updated_at"])
    audit(actor, "UPDATE", "ToolingItem", item.id, {
        "image_upload": {"size": len(payload), "sha256": digest},
    })
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
    try:
        vehicle_number = parse_whole_number(request.data.get("vehicle_number"), allow_zero=False)
    except (TypeError, ValueError):
        return Response({"detail": "กรุณาเลือกเบอร์รถเครื่องมือ 1-13"}, status=400)
    if vehicle_number < 1 or vehicle_number > 13:
        return Response({"detail": "เบอร์รถเครื่องมือต้องอยู่ระหว่าง 1-13"}, status=400)
    requester_id = request.data.get("requester_id")
    try:
        requester = Employee.objects.filter(pk=requester_id, active=True).first() if requester_id else None
    except (ValidationError, ValueError, TypeError):
        requester = None
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
            requester_name=requester.name, reason=reason, vehicle_number=vehicle_number, remark=str(request.data.get("remark") or "").strip(), created_by=actor)
        audit(actor, "WITHDRAW", "ToolingItem", item.id, {"transaction_id": str(tx.id), "quantity": qty, "reason": reason, "vehicle_number": vehicle_number})
    return Response({"item": item_json(item), "transaction": tx_json(tx)}, status=201)


@api_view(["DELETE"])
@permission_classes([AllowAny])
def delete_history(request, pk):
    actor, err = require_permission(request, "can_delete_tooling_history")
    if err:
        return err
    with transaction.atomic():
        tx = ToolingTransaction.objects.select_for_update().select_related("item").filter(pk=pk).first()
        if not tx:
            return Response({"detail": "ไม่พบประวัติ Tooling รายการนี้"}, status=404)
        item = ToolingItem.objects.select_for_update().filter(pk=tx.item_id).first()
        if item:
            item.quantity = F("quantity") + tx.quantity
            item.save(update_fields=["quantity", "updated_at"])
            item.refresh_from_db()
        audit(actor, "DELETE_WITHDRAWAL", "ToolingItem", tx.item_id, {"transaction_id": str(tx.id), "quantity_restored": tx.quantity, "reason": tx.reason})
        tx.delete()
    return Response({"deleted": True, "item": item_json(item) if item else None})


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

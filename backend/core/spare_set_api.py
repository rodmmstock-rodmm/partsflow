from decimal import Decimal, InvalidOperation

from django.db import IntegrityError, transaction
from django.db.models import DecimalField, Q, Sum, Value
from django.db.models.functions import Coalesce
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .audit_utils import audit
from .auth_api import require_permission
from .models import Machine, MachineSpareSet, MachineSpareSetItem, Part

QTY_FIELD = DecimalField(max_digits=18, decimal_places=2)
ZERO = Decimal("0")


def as_positive_decimal(value, label="จำนวน"):
    try:
        result = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        raise ValueError(f"{label} ไม่ถูกต้อง")
    if result <= 0:
        raise ValueError(f"{label} ต้องมากกว่า 0")
    return result


def stock_map_for(part_ids):
    if not part_ids:
        return {}
    rows = (
        Part.objects.filter(id__in=part_ids)
        .annotate(
            stock_qty=Coalesce(
                Sum("inventory__quantity"),
                Value(ZERO),
                output_field=QTY_FIELD,
            )
        )
        .values("id", "stock_qty")
    )
    return {row["id"]: Decimal(row["stock_qty"] or ZERO) for row in rows}


def spare_set_json(spare_set):
    items = list(
        spare_set.items.select_related(
            "part", "part__maker", "part__unit", "part__location"
        ).order_by("part__sku")
    )
    stock_map = stock_map_for([item.part_id for item in items])

    ready_item_count = 0
    shortage_item_count = 0
    available_set_counts = []
    item_rows = []

    for item in items:
        required_qty = Decimal(item.quantity or ZERO)
        stock_qty = Decimal(stock_map.get(item.part_id, ZERO))
        shortage_qty = max(required_qty - stock_qty, ZERO)
        enough_for_one_set = required_qty > ZERO and stock_qty >= required_qty
        available_sets = (
            max(int(stock_qty // required_qty), 0)
            if required_qty > ZERO
            else 0
        )

        if enough_for_one_set:
            ready_item_count += 1
        else:
            shortage_item_count += 1

        if required_qty > ZERO:
            available_set_counts.append(available_sets)

        item_rows.append(
            {
                "id": str(item.id),
                "part_id": str(item.part_id),
                "sku": item.part.sku,
                "name": item.part.name,
                "description": item.part.description or "",
                "maker_name": item.part.maker.name if item.part.maker else "",
                "unit_code": item.part.unit.code if item.part.unit else "",
                "location_code": item.part.location.code if item.part.location else "",
                "quantity": float(required_qty),
                "stock_qty": float(stock_qty),
                "shortage_qty": float(shortage_qty),
                "enough_for_one_set": enough_for_one_set,
                "available_sets": available_sets,
                "active": item.part.active,
                "remark": item.remark or "",
            }
        )

    item_count = len(items)
    if item_count == 0:
        readiness_status = "EMPTY"
        readiness_percent = 0.0
        available_sets = 0
    else:
        readiness_status = "READY" if shortage_item_count == 0 else "SHORTAGE"
        readiness_percent = round((ready_item_count / item_count) * 100, 1)
        available_sets = min(available_set_counts) if available_set_counts else 0

    return {
        "id": str(spare_set.id),
        "name": spare_set.name,
        "description": spare_set.description or "",
        "active": spare_set.active,
        "machine_id": str(spare_set.machine_id),
        "machine_code": spare_set.machine.code,
        "machine_name": spare_set.machine.name,
        "machine_location": spare_set.machine.location or "",
        "created_by": (
            spare_set.created_by_employee.name
            if spare_set.created_by_employee else ""
        ),
        "created_at": spare_set.created_at.isoformat(),
        "updated_at": spare_set.updated_at.isoformat(),
        "item_count": item_count,
        "ready_item_count": ready_item_count,
        "shortage_item_count": shortage_item_count,
        "readiness_status": readiness_status,
        "readiness_percent": readiness_percent,
        "available_sets": available_sets,
        "items": item_rows,
    }


def parse_items(items_data):
    if items_data is None:
        return None
    if not isinstance(items_data, list):
        raise ValueError("items ต้องเป็นรายการ")

    parsed = []
    seen = set()
    for index, raw in enumerate(items_data, start=1):
        raw = raw or {}
        part_id = str(raw.get("part_id") or "").strip()
        if not part_id:
            raise ValueError(f"รายการที่ {index}: กรุณาเลือกอะไหล่")
        if part_id in seen:
            raise ValueError(f"รายการที่ {index}: มีอะไหล่ซ้ำใน Set")
        part = Part.objects.filter(pk=part_id).first()
        if not part:
            raise ValueError(f"รายการที่ {index}: ไม่พบอะไหล่")
        quantity = as_positive_decimal(raw.get("quantity", 1), f"จำนวนรายการที่ {index}")
        parsed.append({"part": part, "quantity": quantity, "remark": str(raw.get("remark") or "").strip()})
        seen.add(part_id)
    return parsed


def replace_items(spare_set, parsed_items):
    if parsed_items is None:
        return
    spare_set.items.all().delete()
    MachineSpareSetItem.objects.bulk_create([
        MachineSpareSetItem(spare_set=spare_set, part=row["part"], quantity=row["quantity"], remark=row["remark"])
        for row in parsed_items
    ])


@csrf_exempt
@api_view(["GET", "POST"])
@permission_classes([AllowAny])
def spare_sets(request):
    permission = "can_view_dashboard" if request.method == "GET" else "can_edit_parts"
    actor, err = require_permission(request, permission)
    if err:
        return err
    if request.method == "GET":
        q = str(request.GET.get("q", "")).strip()
        machine_id = str(request.GET.get("machine_id", "")).strip()
        active_raw = str(request.GET.get("active", "true")).strip().lower()
        is_active = active_raw not in {"0", "false", "inactive", "no"}
        qs = MachineSpareSet.objects.select_related("machine", "created_by_employee").filter(active=is_active)
        if machine_id:
            qs = qs.filter(machine_id=machine_id)
        if q:
            qs = qs.filter(Q(name__icontains=q) | Q(description__icontains=q) | Q(machine__code__icontains=q) | Q(machine__name__icontains=q) | Q(items__part__sku__icontains=q) | Q(items__part__name__icontains=q)).distinct()
        qs = qs.order_by("machine__code", "name")[:1000]
        return Response({"results": [spare_set_json(x) for x in qs]})
    name = str(request.data.get("name") or "").strip()
    machine_id = str(request.data.get("machine_id") or "").strip()
    machine = Machine.objects.filter(pk=machine_id, active=True).first()
    if not machine:
        return Response({"detail": "กรุณาเลือกเครื่องจักร"}, status=400)
    if not name:
        return Response({"detail": "กรุณาระบุชื่อ Set"}, status=400)
    try:
        parsed_items = parse_items(request.data.get("items", []))
        with transaction.atomic():
            spare_set = MachineSpareSet.objects.create(machine=machine, name=name, description=str(request.data.get("description") or "").strip(), active=bool(request.data.get("active", True)), created_by_employee=actor)
            replace_items(spare_set, parsed_items)
            result = spare_set_json(MachineSpareSet.objects.select_related("machine", "created_by_employee").get(pk=spare_set.pk))
            audit(actor, "CREATE", "MachineSpareSet", spare_set.id, result)
        return Response(result, status=201)
    except (ValueError, IntegrityError) as exc:
        return Response({"detail": "เครื่องจักรนี้มีชื่อ Set นี้อยู่แล้ว" if isinstance(exc, IntegrityError) else str(exc)}, status=400)


@csrf_exempt
@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([AllowAny])
def spare_set_detail(request, pk):
    permission = "can_view_dashboard" if request.method == "GET" else "can_edit_parts"
    actor, err = require_permission(request, permission)
    if err:
        return err
    spare_set = MachineSpareSet.objects.select_related("machine", "created_by_employee").filter(pk=pk).first()
    if not spare_set:
        return Response({"detail": "ไม่พบ Machine Spare Set"}, status=404)
    if request.method == "GET":
        return Response(spare_set_json(spare_set))
    before = spare_set_json(spare_set)
    if request.method == "DELETE":
        set_id = spare_set.id
        spare_set.delete()
        audit(actor, "DELETE", "MachineSpareSet", set_id, before)
        return Response({"ok": True})
    try:
        with transaction.atomic():
            if "machine_id" in request.data:
                machine = Machine.objects.filter(pk=request.data.get("machine_id"), active=True).first()
                if not machine:
                    raise ValueError("กรุณาเลือกเครื่องจักร")
                spare_set.machine = machine
            if "name" in request.data:
                name = str(request.data.get("name") or "").strip()
                if not name:
                    raise ValueError("กรุณาระบุชื่อ Set")
                spare_set.name = name
            if "description" in request.data:
                spare_set.description = str(request.data.get("description") or "").strip()
            if "active" in request.data:
                spare_set.active = bool(request.data.get("active"))
            parsed_items = parse_items(request.data.get("items")) if "items" in request.data else None
            spare_set.save()
            replace_items(spare_set, parsed_items)
            result = spare_set_json(MachineSpareSet.objects.select_related("machine", "created_by_employee").get(pk=spare_set.pk))
            audit(actor, "UPDATE", "MachineSpareSet", spare_set.id, {"before": before, "after": result})
        return Response(result)
    except (ValueError, IntegrityError) as exc:
        return Response({"detail": "เครื่องจักรนี้มีชื่อ Set นี้อยู่แล้ว" if isinstance(exc, IntegrityError) else str(exc)}, status=400)

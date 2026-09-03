from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .audit_utils import audit
from .auth_api import require_permission
from .models import FastOrderPreset, Machine, OrderRecord, Part
from .order_api import (
    apply_order_info,
    generate_order_number,
    order_json,
    order_queryset,
)


def preset_queryset():
    return FastOrderPreset.objects.select_related(
        "part",
        "part__maker",
        "part__unit",
        "part__location",
        "machine",
        "created_by_employee",
    )


def preset_json(item):
    part = item.part
    return {
        "id": str(item.id),
        "name": item.name or "",
        "factory": item.factory,
        "machine_id": str(item.machine_id),
        "machine_code": item.machine.code,
        "machine_name": item.machine.name,
        "part_id": str(item.part_id),
        "item_id": part.sku,
        "part_name": part.name,
        "part_detail": part.description or "",
        "maker": part.maker.name if part.maker else "",
        "unit": part.unit.code if part.unit else "",
        "location": part.location.code if part.location else "",
        "remark": item.remark or "",
        "active": item.active,
        "created_by": (
            item.created_by_employee.name
            if item.created_by_employee else ""
        ),
    }


@csrf_exempt
@api_view(["GET", "POST"])
@permission_classes([AllowAny])
def fast_orders(request):
    permission = "can_view_orders" if request.method == "GET" else "can_add_order"
    actor, err = require_permission(request, permission)
    if err:
        return err

    if request.method == "GET":
        q = str(request.GET.get("q", "")).strip()
        active_raw = str(request.GET.get("active", "true")).strip().lower()
        active = active_raw not in {"false", "0", "no", "inactive"}

        qs = preset_queryset().filter(active=active)
        if q:
            qs = qs.filter(
                Q(name__icontains=q)
                | Q(part__sku__icontains=q)
                | Q(part__name__icontains=q)
                | Q(machine__code__icontains=q)
                | Q(machine__name__icontains=q)
            )

        return Response(
            {"results": [preset_json(x) for x in qs.order_by("part__sku")[:2000]]}
        )

    part_id = str(request.data.get("part_id") or "").strip()
    machine_id = str(request.data.get("machine_id") or "").strip()
    factory = str(request.data.get("factory") or "MM-4").strip().upper()

    if factory not in {"MM-4", "MM-11"}:
        return Response({"detail": "Factory ไม่ถูกต้อง"}, status=400)

    part = Part.objects.filter(pk=part_id, active=True).first()
    if not part:
        return Response({"detail": "ไม่พบ Part ID ที่เลือก"}, status=400)

    machine = Machine.objects.filter(pk=machine_id, active=True).first()
    if not machine:
        return Response({"detail": "ไม่พบ Machine ที่เลือก"}, status=400)

    try:
        item = FastOrderPreset.objects.create(
            name=str(request.data.get("name") or "").strip(),
            factory=factory,
            machine=machine,
            part=part,
            remark=str(request.data.get("remark") or "").strip(),
            created_by_employee=actor,
        )
    except IntegrityError:
        return Response(
            {
                "detail":
                "Fast Order ของ Item / Machine / Factory นี้มีอยู่แล้ว"
            },
            status=400,
        )

    audit(actor, "CREATE_FAST_ORDER", "FastOrderPreset", item.id, preset_json(item))
    return Response(preset_json(preset_queryset().get(pk=item.pk)), status=201)


@csrf_exempt
@api_view(["PATCH", "DELETE"])
@permission_classes([AllowAny])
def fast_order_detail(request, pk):
    actor, err = require_permission(request, "can_add_order")
    if err:
        return err

    item = preset_queryset().filter(pk=pk).first()
    if not item:
        return Response({"detail": "ไม่พบ Fast Order"}, status=404)

    if request.method == "DELETE":
        item.active = False
        item.save(update_fields=["active", "updated_at"])
        audit(
            actor,
            "DELETE_FAST_ORDER",
            "FastOrderPreset",
            item.id,
            preset_json(item),
        )
        return Response({"ok": True})

    before = preset_json(item)

    if "name" in request.data:
        item.name = str(request.data.get("name") or "").strip()
    if "remark" in request.data:
        item.remark = str(request.data.get("remark") or "").strip()
    if "factory" in request.data:
        factory = str(request.data.get("factory") or "").strip().upper()
        if factory not in {"MM-4", "MM-11"}:
            return Response({"detail": "Factory ไม่ถูกต้อง"}, status=400)
        item.factory = factory
    if "part_id" in request.data:
        part = Part.objects.filter(
            pk=request.data.get("part_id"),
            active=True,
        ).first()
        if not part:
            return Response({"detail": "ไม่พบ Part ID ที่เลือก"}, status=400)
        item.part = part
    if "machine_id" in request.data:
        machine = Machine.objects.filter(
            pk=request.data.get("machine_id"),
            active=True,
        ).first()
        if not machine:
            return Response({"detail": "ไม่พบ Machine ที่เลือก"}, status=400)
        item.machine = machine
    if "active" in request.data:
        item.active = bool(request.data.get("active"))

    try:
        item.save()
    except IntegrityError:
        return Response(
            {
                "detail":
                "Fast Order ของ Item / Machine / Factory นี้มีอยู่แล้ว"
            },
            status=400,
        )

    after = preset_json(preset_queryset().get(pk=item.pk))
    audit(
        actor,
        "UPDATE_FAST_ORDER",
        "FastOrderPreset",
        item.id,
        {"before": before, "after": after},
    )
    return Response(after)


@csrf_exempt
@api_view(["POST"])
@permission_classes([AllowAny])
def fast_order_create_normal(request, pk):
    """Create a Normal Order from a preset.

    User only supplies amount. JOB is always SPARE and Ordered By is the
    currently logged-in employee.
    """
    actor, err = require_permission(request, "can_add_order")
    if err:
        return err

    preset = preset_queryset().filter(pk=pk, active=True).first()
    if not preset:
        return Response({"detail": "ไม่พบ Fast Order หรือรายการถูกปิดใช้งาน"}, status=404)

    try:
        amount = int(request.data.get("amount") or 0)
    except (TypeError, ValueError):
        return Response({"detail": "จำนวนต้องเป็นจำนวนเต็ม"}, status=400)

    if amount <= 0:
        return Response({"detail": "จำนวนต้องมากกว่า 0"}, status=400)

    try:
        with transaction.atomic():
            order = OrderRecord(
                order_number=generate_order_number(),
                order_date=timezone.localdate(),
                recorded_by=actor,
                source_type="NORMAL",
                edit_workflow_enabled=True,
            )
            apply_order_info(
                order,
                {
                    "date": timezone.localdate().isoformat(),
                    "factory": preset.factory,
                    "machine_id": str(preset.machine_id),
                    "job": "SPARE",
                    "urgent_status": "",
                    "pending_data_date": "",
                    "part_id": str(preset.part_id),
                    "amount": amount,
                    "remark": preset.remark,
                    "ordered_by_id": str(actor.id),
                },
                creating=True,
            )
            order.save()

            audit(
                actor,
                "FAST_ORDER_TO_NORMAL",
                "OrderRecord",
                order.id,
                {
                    "fast_order_id": str(preset.id),
                    "amount": amount,
                    "job": "SPARE",
                    "order_number": order.order_number,
                },
            )

        return Response(
            order_json(order_queryset().get(pk=order.pk)),
            status=201,
        )
    except (ValueError, IntegrityError) as exc:
        return Response({"detail": str(exc)}, status=400)

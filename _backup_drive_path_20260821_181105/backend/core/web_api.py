from decimal import Decimal, InvalidOperation

from django.db import IntegrityError
from django.db.models import DecimalField, F, Q, Sum, Value
from django.db.models.functions import Coalesce
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .audit_utils import audit
from .auth_api import require_permission
from .models import (
    Category,
    Employee,
    Inventory,
    JobType,
    Location,
    Machine,
    Maker,
    OrderRecord,
    Part,
    Supplier,
    Unit,
)

QTY_FIELD = DecimalField(max_digits=18, decimal_places=2)


def dec(value, default="0"):
    try:
        return Decimal(str(value if value not in (None, "") else default))
    except (InvalidOperation, TypeError, ValueError):
        raise ValueError("ค่าตัวเลขไม่ถูกต้อง")


def warehouse_code(part):
    raw = (part.location.warehouse if part.location else "") or ""
    raw = raw.strip().upper()
    if raw in {"MM-11", "PHASE11", "PHASE 11"}:
        return "MM-11"
    return "MM-4"


def warehouse_label(code):
    return "Phase11" if code == "MM-11" else "Phase4"


def part_json(part):
    stock_qty = getattr(part, "stock_qty", None)
    if stock_qty is None:
        stock_qty = part.inventory.aggregate(
            total=Coalesce(Sum("quantity"), Value(Decimal("0")), output_field=QTY_FIELD)
        )["total"]
    wcode = warehouse_code(part)
    return {
        "id": str(part.id),
        "sku": part.sku,
        "name": part.name,
        "description": part.description or "",
        "maker_id": str(part.maker_id) if part.maker_id else "",
        "maker_name": part.maker.name if part.maker else "",
        "category_id": str(part.category_id) if part.category_id else "",
        "category_name": part.category.name if part.category else "",
        "unit_id": str(part.unit_id) if part.unit_id else "",
        "unit_code": part.unit.code if part.unit else "",
        "supplier_id": str(part.default_supplier_id) if part.default_supplier_id else "",
        "supplier_code": part.default_supplier.code if part.default_supplier else "",
        "supplier_name": part.default_supplier.name if part.default_supplier else "",
        "location_id": str(part.location_id) if part.location_id else "",
        "location_code": part.location.code if part.location else "",
        "warehouse": wcode,
        "warehouse_label": warehouse_label(wcode),
        "image_path": part.image_path or "",
        "min_stock": float(part.min_stock or 0),
        "max_stock": float(part.max_stock or 0),
        "reorder_qty": float(part.reorder_qty or 0),
        "vendor_lead_time_days": part.vendor_lead_time_days or 0,
        "purchasing_lead_time_days": part.purchasing_lead_time_days or 0,
        "total_lead_time_days": part.total_lead_time_days or 0,
        "last_purchase_price": float(part.last_purchase_price or 0),
        "critical": part.critical,
        "active": part.active,
        "remark": part.remark or "",
        "stock_qty": float(stock_qty or 0),
    }


def base_parts():
    return (
        Part.objects.select_related("maker", "category", "unit", "default_supplier", "location")
        .annotate(
            stock_qty=Coalesce(
                Sum("inventory__quantity"), Value(Decimal("0")), output_field=QTY_FIELD
            )
        )
    )


@csrf_exempt
@api_view(["GET", "POST"])
@permission_classes([AllowAny])
def parts_list(request):
    permission = "can_view_parts" if request.method == "GET" else "can_edit_parts"
    actor, err = require_permission(request, permission)
    if err:
        return err

    if request.method == "GET":
        q = str(request.GET.get("q", "")).strip()
        warehouse = str(request.GET.get("warehouse", "")).strip().upper()
        qs = base_parts().filter(active=True)
        if q:
            qs = qs.filter(
                Q(sku__icontains=q)
                | Q(name__icontains=q)
                | Q(description__icontains=q)
                | Q(maker__name__icontains=q)
                | Q(location__code__icontains=q)
            )
        rows = [part_json(p) for p in qs.order_by("sku")]
        if warehouse in {"MM-4", "MM-11"}:
            rows = [row for row in rows if row["warehouse"] == warehouse]
        return Response({"count": len(rows), "results": rows})

    return create_part(actor, request.data)


def resolve_part_relations(data, part=None):
    category_id = str(data.get("category_id", "")).strip()
    maker_name = str(data.get("maker_name", "")).strip()
    unit_code = str(data.get("unit_code", "")).strip()
    maker = None
    unit = None
    if maker_name:
        maker, _ = Maker.objects.get_or_create(
            name=maker_name,
            defaults={"legacy_source": "WEB", "legacy_id": maker_name},
        )
    if unit_code:
        unit, _ = Unit.objects.get_or_create(
            code=unit_code,
            defaults={"name": unit_code, "legacy_source": "WEB", "legacy_id": unit_code},
        )
    category = Category.objects.filter(pk=category_id).first() if category_id else None
    supplier = Supplier.objects.filter(pk=data.get("supplier_id")).first() if data.get("supplier_id") else None
    location = Location.objects.filter(pk=data.get("location_id")).first() if data.get("location_id") else None
    return maker, category, unit, supplier, location


def apply_part_fields(part, data):
    maker, category, unit, supplier, location = resolve_part_relations(data, part)
    part.sku = str(data.get("sku", part.sku if part.pk else "")).strip()
    part.name = str(data.get("name", part.name if part.pk else "")).strip()
    part.description = str(data.get("description", part.description if part.pk else "")).strip()
    if "maker_name" in data:
        part.maker = maker
    if "category_id" in data:
        part.category = category
    if "unit_code" in data:
        part.unit = unit
    if "supplier_id" in data:
        part.default_supplier = supplier
    if "location_id" in data:
        part.location = location
    if "image_path" in data:
        part.image_path = str(data.get("image_path") or "").strip()
    for field in ["min_stock", "max_stock", "reorder_qty", "last_purchase_price"]:
        if field in data:
            setattr(part, field, dec(data.get(field)))
    for field in ["vendor_lead_time_days", "purchasing_lead_time_days"]:
        if field in data:
            setattr(part, field, max(0, int(data.get(field) or 0)))
    part.total_lead_time_days = int(part.vendor_lead_time_days or 0) + int(part.purchasing_lead_time_days or 0)
    if "critical" in data:
        part.critical = bool(data.get("critical"))
    if "active" in data:
        part.active = bool(data.get("active"))
    if "remark" in data:
        part.remark = str(data.get("remark") or "").strip()
    if not part.sku or not part.name:
        raise ValueError("Item ID และ Part Name จำเป็นต้องใส่")


def create_part(actor, data):
    try:
        part = Part(legacy_source="WEB")
        apply_part_fields(part, data)
        part.legacy_id = part.sku
        part.save()
        Inventory.objects.create(
            part=part,
            location=part.location,
            quantity=Decimal("0"),
            legacy_source="WEB",
            legacy_id=f"WEB:{part.sku}",
        )
        audit(actor, "CREATE", "Part", part.id, part_json(base_parts().get(pk=part.pk)))
        return Response(part_json(base_parts().get(pk=part.pk)), status=201)
    except (ValueError, IntegrityError) as exc:
        return Response({"detail": str(exc)}, status=400)


@csrf_exempt
@api_view(["GET", "PATCH"])
@permission_classes([AllowAny])
def part_detail(request, pk):
    permission = "can_view_parts" if request.method == "GET" else "can_edit_parts"
    actor, err = require_permission(request, permission)
    if err:
        return err
    part = Part.objects.filter(pk=pk).first()
    if not part:
        return Response({"detail": "ไม่พบอะไหล่"}, status=404)
    if request.method == "GET":
        return Response(part_json(base_parts().get(pk=pk)))
    before = part_json(base_parts().get(pk=pk))
    try:
        apply_part_fields(part, request.data)
        part.save()
        # Keep the first inventory location aligned only when there is exactly one inventory row.
        inv = list(Inventory.objects.filter(part=part).order_by("pk"))
        if len(inv) == 1 and inv[0].location_id != part.location_id:
            inv[0].location = part.location
            inv[0].save(update_fields=["location", "updated_at"])
        after = part_json(base_parts().get(pk=pk))
        audit(actor, "UPDATE", "Part", part.id, {"before": before, "after": after})
        return Response(after)
    except (ValueError, IntegrityError) as exc:
        return Response({"detail": str(exc)}, status=400)


@api_view(["GET"])
@permission_classes([AllowAny])
def inventory_list(request):
    _, err = require_permission(request, "can_view_parts")
    if err:
        return err
    qs = Inventory.objects.select_related("part", "part__unit", "location").order_by("part__sku")
    return Response(
        {
            "results": [
                {
                    "id": str(x.id),
                    "part_id": str(x.part_id),
                    "sku": x.part.sku,
                    "name": x.part.name,
                    "location": x.location.code if x.location else "",
                    "quantity": float(x.quantity or 0),
                    "unit": x.part.unit.code if x.part.unit else "",
                }
                for x in qs[:5000]
            ]
        }
    )


def supplier_json(item):
    return {
        "id": str(item.id),
        "code": item.code,
        "name": item.name,
        "contact": item.contact or "",
        "phone": item.phone or "",
        "email": item.email or "",
        "lead_time_days": item.lead_time_days or 0,
        "active": item.active,
        "remark": item.remark or "",
    }


@csrf_exempt
@api_view(["GET", "POST"])
@permission_classes([AllowAny])
def suppliers_list(request):
    permission = "can_view_suppliers" if request.method == "GET" else "can_manage_suppliers"
    actor, err = require_permission(request, permission)
    if err:
        return err
    if request.method == "GET":
        q = str(request.GET.get("q", "")).strip()
        qs = Supplier.objects.all().order_by("code")
        if q:
            qs = qs.filter(Q(code__icontains=q) | Q(name__icontains=q))
        return Response({"results": [supplier_json(x) for x in qs[:2000]]})
    code = str(request.data.get("code", "")).strip()
    name = str(request.data.get("name", "")).strip()
    if not code or not name:
        return Response({"detail": "Vendor Code และ Vendor Name จำเป็นต้องใส่"}, status=400)
    try:
        item = Supplier.objects.create(
            code=code,
            name=name,
            contact=str(request.data.get("contact", "")).strip(),
            phone=str(request.data.get("phone", "")).strip(),
            email=str(request.data.get("email", "")).strip(),
            lead_time_days=max(0, int(request.data.get("lead_time_days") or 0)),
            active=bool(request.data.get("active", True)),
            remark=str(request.data.get("remark", "")).strip(),
            legacy_source="WEB",
            legacy_id=code,
        )
        audit(actor, "CREATE", "Supplier", item.id, supplier_json(item))
        return Response(supplier_json(item), status=201)
    except IntegrityError:
        return Response({"detail": "Vendor Code นี้มีอยู่แล้ว"}, status=400)


@csrf_exempt
@api_view(["PATCH", "DELETE"])
@permission_classes([AllowAny])
def supplier_detail(request, pk):
    actor, err = require_permission(request, "can_manage_suppliers")
    if err:
        return err
    item = Supplier.objects.filter(pk=pk).first()
    if not item:
        return Response({"detail": "ไม่พบ Vendor"}, status=404)
    before = supplier_json(item)
    if request.method == "DELETE":
        item.active = False
        item.save(update_fields=["active", "updated_at"])
        audit(actor, "DELETE", "Supplier", item.id, before)
        return Response({"success": True})
    for field in ["code", "name", "contact", "phone", "email", "remark"]:
        if field in request.data:
            setattr(item, field, str(request.data.get(field) or "").strip())
    if "lead_time_days" in request.data:
        item.lead_time_days = max(0, int(request.data.get("lead_time_days") or 0))
    if "active" in request.data:
        item.active = bool(request.data.get("active"))
    try:
        item.save()
    except IntegrityError:
        return Response({"detail": "Vendor Code นี้มีอยู่แล้ว"}, status=400)
    audit(actor, "UPDATE", "Supplier", item.id, {"before": before, "after": supplier_json(item)})
    return Response(supplier_json(item))


def machine_json(item):
    return {
        "id": str(item.id),
        "code": item.code,
        "name": item.name,
        "dept_code": item.dept_code or "",
        "work_code": item.work_code or "",
        "location": item.location or "",
        "machine_type": item.machine_type or "",
        "active": item.active,
        "remark": item.remark or "",
    }


@csrf_exempt
@api_view(["GET", "POST"])
@permission_classes([AllowAny])
def machines_list(request):
    permission = "can_view_machines" if request.method == "GET" else "can_manage_machines"
    actor, err = require_permission(request, permission)
    if err:
        return err
    if request.method == "GET":
        q = str(request.GET.get("q", "")).strip()
        qs = Machine.objects.all().order_by("code")
        if q:
            qs = qs.filter(
                Q(code__icontains=q)
                | Q(name__icontains=q)
                | Q(dept_code__icontains=q)
                | Q(work_code__icontains=q)
            )
        return Response({"results": [machine_json(x) for x in qs[:3000]]})
    code = str(request.data.get("code", "")).strip()
    name = str(request.data.get("name", "")).strip()
    if not code or not name:
        return Response({"detail": "Machine Code และ Machine Name จำเป็นต้องใส่"}, status=400)
    try:
        item = Machine.objects.create(
            code=code,
            name=name,
            dept_code=str(request.data.get("dept_code", "")).strip(),
            work_code=str(request.data.get("work_code", "")).strip(),
            location=str(request.data.get("location", "")).strip(),
            machine_type=str(request.data.get("machine_type", "")).strip(),
            active=bool(request.data.get("active", True)),
            remark=str(request.data.get("remark", "")).strip(),
            legacy_source="WEB",
            legacy_id=code,
        )
        audit(actor, "CREATE", "Machine", item.id, machine_json(item))
        return Response(machine_json(item), status=201)
    except IntegrityError:
        return Response({"detail": "Machine Code นี้มีอยู่แล้ว"}, status=400)


@csrf_exempt
@api_view(["PATCH", "DELETE"])
@permission_classes([AllowAny])
def machine_detail(request, pk):
    actor, err = require_permission(request, "can_manage_machines")
    if err:
        return err
    item = Machine.objects.filter(pk=pk).first()
    if not item:
        return Response({"detail": "ไม่พบเครื่องจักร"}, status=404)
    before = machine_json(item)
    if request.method == "DELETE":
        item.active = False
        item.save(update_fields=["active", "updated_at"])
        audit(actor, "DELETE", "Machine", item.id, before)
        return Response({"success": True})
    for field in ["code", "name", "dept_code", "work_code", "location", "machine_type", "remark"]:
        if field in request.data:
            setattr(item, field, str(request.data.get(field) or "").strip())
    if "active" in request.data:
        item.active = bool(request.data.get("active"))
    try:
        item.save()
    except IntegrityError:
        return Response({"detail": "Machine Code นี้มีอยู่แล้ว"}, status=400)
    audit(actor, "UPDATE", "Machine", item.id, {"before": before, "after": machine_json(item)})
    return Response(machine_json(item))


@api_view(["GET"])
@permission_classes([AllowAny])
def options(request):
    _, err = require_permission(request)
    if err:
        return err
    defaults = ["SPARE", "REPAIR", "MODIFY", "AUTOMATION", "PM", "GENERAL"]
    for code in defaults:
        JobType.objects.get_or_create(code=code, defaults={"name": code})
    return Response(
        {
            "employees": [
                {"id": str(e.id), "employee_code": e.employee_code, "name": e.name, "department": e.department or "", "role": e.role or ""}
                for e in Employee.objects.filter(active=True).order_by("employee_code")
            ],
            "machines": [machine_json(x) for x in Machine.objects.filter(active=True).order_by("code")],
            "vendors": [supplier_json(x) for x in Supplier.objects.filter(active=True).order_by("code")],
            "parts": [part_json(x) for x in base_parts().filter(active=True).order_by("sku")],
            "locations": [
                {
                    "id": str(x.id),
                    "code": x.code,
                    "name": x.name or "",
                    "warehouse": (x.warehouse or "MM-4"),
                }
                for x in Location.objects.filter(active=True).order_by("code")
            ],
            "categories": [
                {"id": str(x.id), "name": x.name}
                for x in Category.objects.filter(active=True).order_by("name")
            ],
            "units": [
                {"id": str(x.id), "code": x.code, "name": x.name}
                for x in Unit.objects.filter(active=True).order_by("code")
            ],
            "jobs": [x.code for x in JobType.objects.filter(active=True).order_by("code")],
            "warehouses": [
                {"value": "MM-4", "label": "Phase4"},
                {"value": "MM-11", "label": "Phase11"},
            ],
        }
    )


@api_view(["GET"])
@permission_classes([AllowAny])
def safety_stock(request):
    _, err = require_permission(request, "can_view_safety_stock")
    if err:
        return err
    open_part_ids = set(
        OrderRecord.objects.filter(is_deleted=False, cancel_status=False)
        .exclude(status=OrderRecord.STATUS_COMPLETE)
        .exclude(part_id=None)
        .values_list("part_id", flat=True)
    )
    rows = []
    for part in base_parts().filter(active=True, min_stock__gt=0).order_by("sku"):
        stock = Decimal(str(getattr(part, "stock_qty", 0) or 0))
        if stock >= Decimal(str(part.min_stock or 0)):
            continue
        if part.id in open_part_ids:
            continue
        last_tx = (
            part.transactions.filter(is_void=False, transaction_type__in=["OUT", "ISSUE", "TRANSFER_OUT"])
            .select_related("machine")
            .order_by("-transaction_date")
            .first()
        )
        rows.append(
            {
                **part_json(part),
                "last_machine": last_tx.machine.code if last_tx and last_tx.machine else "",
                "order_qty": float(part.reorder_qty or 0),
            }
        )
    return Response({"count": len(rows), "results": rows})

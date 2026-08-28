from decimal import Decimal

from django.db.models import Sum
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .auth_api import current_employee, permissions_for
from .models import (
    Inventory,
    Part,
    PurchaseOrder,
    PurchaseOrderItem,
    Supplier,
    Machine,
)


def _field_names(model):
    return {f.name for f in model._meta.get_fields()}


def _first_existing(model, candidates):
    fields = _field_names(model)
    for name in candidates:
        if name in fields:
            return name
    return None


def _number(value):
    if value is None:
        return 0
    if isinstance(value, Decimal):
        return float(value)
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0


def _part_minimum(part):
    """
    Support the common field names used during PartsFlow development.
    The first field that exists on Part is used.
    """
    for field_name in ("min_stock", "minimum_stock", "safety_stock", "min_qty"):
        if hasattr(part, field_name):
            return _number(getattr(part, field_name))
    return 0


def _inventory_map():
    """
    Return:
        {part_id: total_quantity}

    Inventory in PartsFlow is the stock source of truth.
    This aggregates all inventory rows per part so the KPI stays correct
    even if a part later has more than one stock location.
    """
    inv_fields = _field_names(Inventory)

    part_field = "part" if "part" in inv_fields else None
    qty_field = _first_existing(
        Inventory,
        ("quantity", "qty", "stock_qty", "on_hand", "current_qty"),
    )

    if not part_field or not qty_field:
        return {}

    rows = (
        Inventory.objects.values("part_id")
        .annotate(total=Sum(qty_field))
    )

    return {
        row["part_id"]: _number(row["total"])
        for row in rows
    }


def _open_order_part_ids():
    """
    Return a set of Part IDs that are currently being ordered.

    Rules:
    - PurchaseOrderItem must point to a Part.
    - Parent PurchaseOrder must NOT be in a closed/cancelled/completed state.
    - If the current model has no status field yet, any PO item is treated
      as currently ordering. This keeps Step 2 working until purchasing
      workflow statuses are expanded.
    """
    poi_fields = _field_names(PurchaseOrderItem)

    part_field = _first_existing(
        PurchaseOrderItem,
        ("part", "item", "spare_part"),
    )
    po_field = _first_existing(
        PurchaseOrderItem,
        ("purchase_order", "po", "order"),
    )

    if not part_field:
        return set()

    qs = PurchaseOrderItem.objects.all()

    # If the PO item has an explicit active/status flag, use it where possible.
    item_status_field = _first_existing(
        PurchaseOrderItem,
        ("status", "order_status"),
    )

    closed_words = {
        "closed",
        "cancelled",
        "canceled",
        "complete",
        "completed",
        "received",
        "fully received",
        "void",
    }

    # Parent PO status gives the most reliable current-order signal.
    po_status_field = _first_existing(
        PurchaseOrder,
        ("status", "po_status", "order_status"),
    )

    part_ids = set()

    # select_related only when the FK is present.
    if po_field:
        try:
            qs = qs.select_related(po_field)
        except Exception:
            pass

    for item in qs.iterator(chunk_size=500):
        item_status = ""
        if item_status_field:
            item_status = str(getattr(item, item_status_field, "") or "").strip().lower()
            if item_status in closed_words:
                continue

        if po_field and po_status_field:
            po = getattr(item, po_field, None)
            if po is not None:
                po_status = str(getattr(po, po_status_field, "") or "").strip().lower()
                if po_status in closed_words:
                    continue

        part_obj = getattr(item, part_field, None)
        part_id = getattr(part_obj, "pk", None)

        if part_id:
            part_ids.add(part_id)

    return part_ids


def _stock_value():
    """
    Keep compatibility with the old Dashboard KPI.
    Uses Inventory quantity multiplied by a usable Part price field when found.
    """
    qty_map = _inventory_map()
    price_field = _first_existing(
        Part,
        ("unit_price", "last_price", "price", "cost", "average_price"),
    )

    if not price_field:
        return 0

    total = Decimal("0")

    for part in Part.objects.only("id", price_field).iterator(chunk_size=500):
        qty = Decimal(str(qty_map.get(part.id, 0)))
        price = Decimal(str(getattr(part, price_field, 0) or 0))
        total += qty * price

    return float(total)


@api_view(["GET"])
def dashboard(request):
    employee = current_employee(request)

    if not employee:
        return Response({"detail": "กรุณาเข้าสู่ระบบ"}, status=403)

    if not permissions_for(employee).get("can_view_dashboard"):
        return Response({"detail": "คุณไม่มีสิทธิ์ดู Dashboard"}, status=403)

    parts = list(Part.objects.all())
    qty_map = _inventory_map()
    ordering_part_ids = _open_order_part_ids()

    safety_stock = 0
    safety_stock_ordering = 0
    out_of_stock = 0

    for part in parts:
        qty = qty_map.get(part.id, 0)
        minimum = _part_minimum(part)

        if qty <= 0:
            out_of_stock += 1

        # Requirement:
        # Safety Stock = below minimum AND NOT currently ordering
        # Safety Stock currently Order = below minimum AND currently ordering
        if minimum > 0 and qty < minimum:
            if part.id in ordering_part_ids:
                safety_stock_ordering += 1
            else:
                safety_stock += 1

    return Response(
        {
            "kpi": {
                "parts": len(parts),
                "machines": Machine.objects.count(),
                "suppliers": Supplier.objects.count(),

                # New Step 2 fields
                "safety_stock": safety_stock,
                "safety_stock_ordering": safety_stock_ordering,

                # Backward-compatible fields
                "low_stock": safety_stock + safety_stock_ordering,
                "out_of_stock": out_of_stock,
                "total_stock_qty": sum(qty_map.values()),
                "stock_value": _stock_value(),
            },
            "recent_transactions": [],
        }
    )

import re
from datetime import timedelta
from decimal import Decimal, InvalidOperation

from django.db import IntegrityError, transaction
from django.db.models import Count, Exists, Max, OuterRef, Q, Sum
from django.utils import timezone
from django.utils.dateparse import parse_date
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .audit_utils import audit
from .auth_api import permissions_for, require_permission
from .models import (
    Employee,
    Inventory,
    Machine,
    OrderProject,
    OrderRecord,
    OrderRFQ,
    OrderRFQItem,
    OrderStep,
    Part,
    POBalance,
    StockTransaction,
    Supplier,
)

URGENT_OPTIONS = [
    "งานด่วนเครื่องหยุด",
    "งานด่วนเครื่องไม่หยุด",
    "งานด่วน + ค้าง DATA",
]


def as_date(value, label, required=False):
    if value in (None, ""):
        if required:
            raise ValueError(f"{label} จำเป็นต้องใส่")
        return None
    if hasattr(value, "year") and not isinstance(value, str):
        return value
    result = parse_date(str(value))
    if not result:
        raise ValueError(f"{label} ไม่ถูกต้อง")
    return result


def as_decimal(value, label, default="0"):
    try:
        return Decimal(str(value if value not in (None, "") else default))
    except (InvalidOperation, TypeError, ValueError):
        raise ValueError(f"{label} ไม่ถูกต้อง")


def employee_or_none(pk):
    return Employee.objects.filter(pk=pk, active=True).first() if pk else None


def machine_or_none(pk):
    return Machine.objects.filter(pk=pk, active=True).first() if pk else None


def supplier_or_none(pk):
    return Supplier.objects.filter(pk=pk, active=True).first() if pk else None


def part_or_none(pk):
    return Part.objects.select_related("maker", "unit", "location").filter(pk=pk, active=True).first() if pk else None


def generate_order_number(prefix="ORD"):
    return f"{prefix}-{timezone.localtime().strftime('%Y%m%d-%H%M%S-%f')}"


def group_order_for(order):
    if (
        order.source_type == "PROJECT"
        and order.procurement_phase == OrderRecord.PROCUREMENT_PURCHASE
        and order.source_quotation_order_id
    ):
        source_group = str(
            order.source_quotation_order.group_order or ""
        ).strip()
        if source_group:
            return source_group[:250]
    if (
        order.source_type == "PROJECT"
        and order.procurement_phase == OrderRecord.PROCUREMENT_QUOTATION
        and order.project_id
        and order.step_id
    ):
        project_token = re.sub(
            r"[^A-Z0-9]+",
            "-",
            str(order.project.name or "").strip().upper(),
        ).strip("-")[:80]
        if not project_token:
            project_token = str(order.project_id).split("-")[0].upper()
        return (
            f"{project_token}_STEP{order.step.step_no}_"
            f"{order.project.department}"
        )[:250]
    if not (order.urgent_status or order.pending_data_date) or not order.machine:
        return ""
    return f"{order.machine.code}_{order.order_date.strftime('%d%m%Y')}"


def quotation_is_ready(order):
    if bool((order.quotation or "").strip()):
        return True
    annotated = getattr(order, "_has_sent_rfq", None)
    if annotated is not None:
        return bool(annotated)
    return bool(
        order.pk
        and order.rfq_items.filter(rfq__status=OrderRFQ.STATUS_SENT).exists()
    )


def quotation_stage_status(order):
    if order.procurement_phase != OrderRecord.PROCUREMENT_QUOTATION:
        return ""
    converted = int(order.converted_quantity or 0)
    amount = int(order.amount or 0)
    if amount and converted >= amount:
        return "CREATED_TO_ORDER_STEP"
    if converted > 0:
        return "PARTIALLY_CREATED"
    if bool(getattr(order, "_has_ready_quote", False)):
        return "READY_TO_CREATE_ORDER"
    if bool(getattr(order, "_has_received_quote", False)):
        return "QUOTATION_RECEIVED"
    if quotation_is_ready(order):
        return "WAIT_QUOTATION"
    return "DRAFT"


def compute_status(order, validate=True):
    """Return the data-derived purchase workflow status.

    Lifecycle is stored separately:
      ACTIVE / WAIT_CONFIRM / CANCELLED / COMPLETED

    Workflow:
      New Order
        -> Quotation
      Wait Quotation
        -> Vendor Order
      Wait Issue P/R
        -> PO Number + Issue PR Date + Due Date
      Wait for Item
        -> Receive
      Complete Order
    """
    quotation_ready = quotation_is_ready(order)
    vendor_ready = bool(order.vendor_id)
    po_group = [
        bool((order.po_number or "").strip()),
        bool(order.issue_pr_date),
        bool(order.due_date),
    ]

    if validate and any(po_group) and not all(po_group):
        raise ValueError(
            "PO Number, ISSUE PR DATE และ DUE DATE ต้องใส่พร้อมกันทั้ง 3 ช่อง"
        )

    if (
        order.received_at
        or order.lifecycle_status == OrderRecord.LIFECYCLE_COMPLETED
    ):
        return OrderRecord.STATUS_COMPLETE

    if all(po_group) and quotation_ready and vendor_ready:
        return OrderRecord.STATUS_ITEM

    if quotation_ready and vendor_ready:
        return OrderRecord.STATUS_ISSUE_PR

    if quotation_ready:
        return OrderRecord.STATUS_QUOTE

    return OrderRecord.STATUS_NEW


def sync_system_fields(order, validate=True):
    if order.urgent_status == "งานด่วน + ค้าง DATA" and not order.pending_data_date:
        raise ValueError("เมื่อเลือก 'งานด่วน + ค้าง DATA' กรุณาระบุวันที่งานค้าง")
    order.group_order = group_order_for(order)
    order.price_total = Decimal(str(order.amount or 0)) * Decimal(str(order.price_per_unit or 0))
    order.status = compute_status(order, validate=validate)

    if order.source_type == "NORMAL" and order.pending_data_date and order.edit_workflow_enabled:
        if not order.edit_data_status:
            order.edit_data_status = OrderRecord.EDIT_WAIT_QUOTE
    elif not order.pending_data_date and order.edit_data_status != OrderRecord.EDIT_DONE:
        order.edit_data_status = ""


def order_json(order):
    return {
        "id": str(order.id),
        "order_number": order.order_number,
        "date": order.order_date.isoformat(),
        "factory": order.factory,
        "group_order": order.group_order,
        "machine_id": str(order.machine_id) if order.machine_id else "",
        "machine_code": order.machine.code if order.machine else "",
        "machine_name": order.machine.name if order.machine else "",
        "job": order.job,
        "urgent_status": order.urgent_status,
        "pending_data_date": order.pending_data_date.isoformat() if order.pending_data_date else "",
        "remark": order.remark,
        "wait_confirm_remark": order.wait_confirm_remark,
        "drawing_path": order.drawing_path,
        "quotation": order.quotation,
        "rfq_count": int(getattr(order, "rfq_count", 0) or 0),
        "part_id": str(order.part_id) if order.part_id else "",
        "item_id": order.part.sku if order.part else "",
        "part_name": order.part_name,
        "part_detail": order.part_detail,
        "maker": order.maker_text,
        "amount": order.amount,
        "unit": order.unit_text,
        "po_number": order.po_number,
        "price_per_unit": float(order.price_per_unit or 0),
        "price_total": float(order.price_total or 0),
        "currency": order.currency or "THB",
        "vendor_id": str(order.vendor_id) if order.vendor_id else "",
        "vendor_code": order.vendor.code if order.vendor else "",
        "vendor_name": order.vendor.name if order.vendor else "",
        "lead_time_days": order.lead_time_days,
        "ordered_by_id": str(order.ordered_by_id) if order.ordered_by_id else "",
        "ordered_by": order.ordered_by.name if order.ordered_by else "",
        "issue_pr_date": order.issue_pr_date.isoformat() if order.issue_pr_date else "",
        "due_date": order.due_date.isoformat() if order.due_date else "",
        "vendor_confirm_date": order.vendor_confirm_date.isoformat() if order.vendor_confirm_date else "",
        "received_at": timezone.localtime(order.received_at).isoformat() if order.received_at else "",
        "person_in_charge_id": str(order.person_in_charge_id) if order.person_in_charge_id else "",
        "person_in_charge": order.person_in_charge.name if order.person_in_charge else "",
        "recorded_by_id": str(order.recorded_by_id) if order.recorded_by_id else "",
        "recorded_by": order.recorded_by.name if order.recorded_by else "",
        "status": order.status,
        "display_status": (
            OrderRecord.STATUS_CONFIRM
            if order.lifecycle_status == OrderRecord.LIFECYCLE_WAIT_CONFIRM
            else order.status
        ),
        "wait_confirm": order.wait_confirm,
        "lifecycle_status": order.lifecycle_status,
        "cancel_status": order.cancel_status,
        "cancelled_at": (
            timezone.localtime(order.cancelled_at).isoformat()
            if order.cancelled_at else ""
        ),
        "cancelled_by": (
            order.cancelled_by_employee.name
            if order.cancelled_by_employee else ""
        ),
        "cancel_reason": order.cancel_reason,
        "completed_at": (
            timezone.localtime(order.completed_at).isoformat()
            if order.completed_at else ""
        ),
        "completed_by": (
            order.completed_by_employee.name
            if order.completed_by_employee else ""
        ),
        "completion_note": order.completion_note,
        "edit_data_status": order.edit_data_status,
        "source_type": order.source_type,
        "project_id": str(order.project_id) if order.project_id else "",
        "project_name": order.project.name if order.project else "",
        "step_id": str(order.step_id) if order.step_id else "",
        "step_no": order.step.step_no if order.step else None,
        "usage_status": order.usage_status,
        "procurement_phase": order.procurement_phase,
        "quotation_stage_status": quotation_stage_status(order),
        "converted_quantity": int(order.converted_quantity or 0),
        "remaining_quantity": max(
            int(order.amount or 0) - int(order.converted_quantity or 0),
            0,
        ),
        "source_quotation_order_id": (
            str(order.source_quotation_order_id)
            if order.source_quotation_order_id else ""
        ),
        "source_rfq_id": str(order.source_rfq_id) if order.source_rfq_id else "",
        "source_rfq_number": order.source_rfq.rfq_number if order.source_rfq else "",
        "created_from_quotation_by": (
            order.created_from_quotation_by_employee.name
            if order.created_from_quotation_by_employee else ""
        ),
        "created_from_quotation_by_code": (
            order.created_from_quotation_by_employee.employee_code
            if order.created_from_quotation_by_employee else ""
        ),
        "created_from_quotation_at": (
            timezone.localtime(order.created_from_quotation_at).isoformat()
            if order.created_from_quotation_at else ""
        ),
        "stock_received": order.stock_received,
        "is_deleted": order.is_deleted,
        "deleted_at": (
            timezone.localtime(order.deleted_at).isoformat()
            if order.deleted_at else ""
        ),
        "deleted_by": (
            order.deleted_by_employee.name
            if order.deleted_by_employee else ""
        ),
        "created_at": timezone.localtime(order.created_at).isoformat(),
        "updated_at": timezone.localtime(order.updated_at).isoformat(),
    }


def apply_order_info(order, data, *, creating=False, allow_order_date=False):
    if creating:
        order.order_date = timezone.localdate()
    if allow_order_date and "date" in data:
        order.order_date = as_date(data.get("date"), "DATE", required=True)
    if "factory" in data or creating:
        factory = str(data.get("factory") or "").strip()
        if factory not in {"MM-4", "MM-11"}:
            raise ValueError("FACTORY ต้องเป็น Phase4 หรือ Phase11")
        order.factory = factory

    if "machine_id" in data or creating:
        order.machine = machine_or_none(data.get("machine_id"))
        if not order.machine:
            raise ValueError("MACHINE NAME จำเป็นต้องใส่")

    if order.source_type == "PROJECT" and order.project_id:
        # Project Order rules:
        # - JOB is locked to the Project department.
        # - urgent status is not used.
        # - pending-data date belongs to the Project, not each row/import file.
        order.job = order.project.department
        order.urgent_status = ""
        order.pending_data_date = order.project.pending_data_date
    else:
        if "job" in data or creating:
            order.job = str(data.get("job") or "").strip().upper()
            if not order.job:
                raise ValueError("JOB จำเป็นต้องใส่")

        if "urgent_status" in data or creating:
            urgent = str(data.get("urgent_status") or "").strip()
            if urgent and urgent not in URGENT_OPTIONS:
                raise ValueError("สถานะงานด่วนไม่ถูกต้อง")
            order.urgent_status = urgent

        if "pending_data_date" in data or creating:
            order.pending_data_date = as_date(
                data.get("pending_data_date"),
                "วันที่งานค้าง",
            )

    if "part_id" in data or creating:
        order.part = part_or_none(data.get("part_id"))

    if order.part:
        order.part_name = order.part.name
        order.part_detail = order.part.description or ""
        order.maker_text = order.part.maker.name if order.part.maker else ""
        order.unit_text = order.part.unit.code if order.part.unit else ""
    else:
        if "part_name" in data or creating:
            order.part_name = str(data.get("part_name") or "").strip()
        if "part_detail" in data or creating:
            order.part_detail = str(data.get("part_detail") or "").strip()
        if "maker" in data or creating:
            order.maker_text = str(data.get("maker") or "").strip()
        if "unit" in data or creating:
            order.unit_text = str(data.get("unit") or "").strip()

    # These four fields only need to be complete together when an Order is
    # first submitted via the full "+ เพิ่ม Order ปกติ" form. A quick-add
    # blank row is filled in one field at a time via inline editing, so an
    # inline PATCH that only touches (say) machine_id or amount must not
    # get blocked by part_detail/maker/unit still being empty - those are
    # edited in separate requests, not this one.
    if creating:
        if not order.part_name:
            raise ValueError("Part Name จำเป็นต้องใส่")
        if not order.part_detail:
            raise ValueError("Part Detail จำเป็นต้องใส่")
        if not order.maker_text:
            raise ValueError("MAKER จำเป็นต้องใส่")
        if not order.unit_text:
            raise ValueError("Unit จำเป็นต้องใส่")

    if "amount" in data or creating:
        try:
            amount = int(data.get("amount") or 0)
        except (TypeError, ValueError):
            raise ValueError("AMOUNT ต้องเป็นจำนวนเต็ม")
        if amount <= 0:
            raise ValueError("AMOUNT ต้องมากกว่า 0")
        order.amount = amount

    if "remark" in data or creating:
        order.remark = str(data.get("remark") or "").strip()

    if "drawing_path" in data or creating:
        order.drawing_path = str(data.get("drawing_path") or "").strip()

    if "ordered_by_id" in data or creating:
        order.ordered_by = employee_or_none(data.get("ordered_by_id"))
        if not order.ordered_by:
            raise ValueError("ชื่อผู้สั่งจำเป็นต้องใส่")

    sync_system_fields(order)


def apply_purchase_info(order, data):
    if "quotation" in data:
        order.quotation = str(data.get("quotation") or "").strip()
    if "po_number" in data:
        order.po_number = str(data.get("po_number") or "").strip()
    if "price_per_unit" in data:
        price = as_decimal(data.get("price_per_unit"), "PRICE PER UNIT")
        if price < 0:
            raise ValueError("PRICE PER UNIT ต้องไม่น้อยกว่า 0")
        order.price_per_unit = price
    if "currency" in data:
        order.currency = str(data.get("currency") or "THB").strip().upper()[:10]
    if "vendor_id" in data:
        order.vendor = supplier_or_none(data.get("vendor_id"))
    if "lead_time_days" in data:
        raw = data.get("lead_time_days")
        order.lead_time_days = None if raw in (None, "") else max(0, int(raw))
    if "issue_pr_date" in data:
        order.issue_pr_date = as_date(data.get("issue_pr_date"), "ISSUE PR DATE")
    if "due_date" in data:
        order.due_date = as_date(data.get("due_date"), "DUE DATE")
    if "vendor_confirm_date" in data:
        order.vendor_confirm_date = as_date(data.get("vendor_confirm_date"), "VENDOR CONFIRM DATE")
    if "person_in_charge_id" in data:
        order.person_in_charge = employee_or_none(data.get("person_in_charge_id"))

    quotation_ready = quotation_is_ready(order)
    vendor_ready = bool(order.vendor_id)
    po_group = [
        bool((order.po_number or "").strip()),
        bool(order.issue_pr_date),
        bool(order.due_date),
    ]

    if vendor_ready and not quotation_ready:
        raise ValueError("กรุณาใส่ Quotation ก่อนเลือก Vendor Order")

    if any(po_group) and not all(po_group):
        raise ValueError(
            "PO Number, ISSUE PR DATE และ DUE DATE ต้องใส่พร้อมกันทั้ง 3 ช่อง"
        )

    if all(po_group) and not (quotation_ready and vendor_ready):
        raise ValueError(
            "ก่อนบันทึกชุด PO ต้องมี Quotation และ Vendor Order ก่อน"
        )

    sync_system_fields(order)


def order_queryset():
    sent_rfq = OrderRFQItem.objects.filter(
        order_id=OuterRef("pk"), rfq__status=OrderRFQ.STATUS_SENT
    )
    received_quote = sent_rfq.filter(
        rfq__po_balance__quotation_received_at__isnull=False,
    )
    ready_quote = received_quote.filter(
        rfq__po_balance__price__isnull=False,
        rfq__vendor__isnull=False,
    )
    return OrderRecord.objects.select_related(
        "machine",
        "part",
        "vendor",
        "ordered_by",
        "person_in_charge",
        "recorded_by",
        "cancelled_by_employee",
        "completed_by_employee",
        "deleted_by_employee",
        "project",
        "step",
        "source_quotation_order",
        "source_rfq",
        "created_from_quotation_by_employee",
    ).annotate(
        _has_sent_rfq=Exists(sent_rfq),
        _has_received_quote=Exists(received_quote),
        _has_ready_quote=Exists(ready_quote),
        rfq_count=Count(
            "rfq_items",
            filter=Q(rfq_items__rfq__status=OrderRFQ.STATUS_SENT),
            distinct=True,
        ),
    )


def urgency_class(order):
    urgent = bool(order.urgent_status)
    pending = bool(order.pending_data_date)
    if urgent and pending:
        return "urgent_pending"
    if urgent:
        return "urgent"
    if pending:
        return "pending"
    return "normal"


@csrf_exempt
@api_view(["POST"])
@permission_classes([AllowAny])
def create_orders_batch(request):
    actor, err = require_permission(request, "can_add_order")
    if err:
        return err

    items = request.data.get("items")
    if not isinstance(items, list) or not items:
        return Response({"detail": "กรุณาเลือกรายการที่จะสร้าง Order"}, status=400)
    if len(items) > 200:
        return Response({"detail": "สร้าง Order ได้สูงสุดครั้งละ 200 รายการ"}, status=400)

    shared_job = str(request.data.get("job") or "SPARE").strip().upper()
    shared_ordered_by_id = request.data.get("ordered_by_id") or str(actor.id)
    shared_remark = str(request.data.get("remark") or "").strip()

    created_ids = []
    seen_part_ids = set()
    try:
        with transaction.atomic():
            for index, item in enumerate(items, start=1):
                raw = item or {}
                part_id = str(raw.get("part_id") or "").strip()
                if not part_id:
                    raise ValueError(f"รายการที่ {index}: ไม่พบ Part ID")
                if part_id in seen_part_ids:
                    raise ValueError(f"รายการที่ {index}: มี Part ID ซ้ำในรายการที่เลือก")
                seen_part_ids.add(part_id)

                if OrderRecord.objects.filter(
                    part_id=part_id,
                    is_deleted=False,
                    procurement_phase=OrderRecord.PROCUREMENT_PURCHASE,
                    lifecycle_status__in=[
                        OrderRecord.LIFECYCLE_ACTIVE,
                        OrderRecord.LIFECYCLE_WAIT_CONFIRM,
                    ],
                ).exists():
                    raise ValueError(
                        f"รายการที่ {index}: Part นี้มี Active / Wait Confirm Order อยู่แล้ว กรุณารีเฟรช Safety Stock"
                    )

                payload = {
                    "factory": raw.get("factory") or request.data.get("factory") or "MM-4",
                    "machine_id": raw.get("machine_id") or request.data.get("machine_id"),
                    "job": raw.get("job") or shared_job,
                    "urgent_status": raw.get("urgent_status") or "",
                    "pending_data_date": raw.get("pending_data_date") or "",
                    "part_id": part_id,
                    "amount": raw.get("amount"),
                    "remark": raw.get("remark") or shared_remark or "Safety Stock",
                    "ordered_by_id": raw.get("ordered_by_id") or shared_ordered_by_id,
                }

                order = OrderRecord(
                    order_number=generate_order_number(),
                    order_date=timezone.localdate(),
                    recorded_by=actor,
                    source_type="NORMAL",
                    edit_workflow_enabled=True,
                )
                try:
                    apply_order_info(order, payload, creating=True)
                except ValueError as exc:
                    raise ValueError(f"รายการที่ {index}: {exc}")
                order.save()
                created_ids.append(order.id)
                audit(
                    actor,
                    "CREATE",
                    "OrderRecord",
                    order.id,
                    {
                        **order_json(order_queryset().get(pk=order.pk)),
                        "batch_source": "SAFETY_STOCK",
                    },
                )

        results = [
            order_json(order)
            for order in order_queryset().filter(id__in=created_ids).order_by("created_at")
        ]
        return Response({"created_count": len(results), "results": results}, status=201)
    except (ValueError, IntegrityError) as exc:
        return Response({"detail": str(exc)}, status=400)


@csrf_exempt
@api_view(["GET", "POST"])
@permission_classes([AllowAny])
def orders(request):
    permission = "can_view_orders" if request.method == "GET" else "can_add_order"
    actor, err = require_permission(request, permission)
    if err:
        return err

    if request.method == "POST":
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
                    request.data,
                    creating=True,
                    allow_order_date=bool(permissions_for(actor).get("can_edit_order_date")),
                )
                order.save()
                audit(actor, "CREATE", "OrderRecord", order.id, order_json(order_queryset().get(pk=order.pk)))
            return Response(order_json(order_queryset().get(pk=order.pk)), status=201)
        except (ValueError, IntegrityError) as exc:
            return Response({"detail": str(exc)}, status=400)

    view = str(request.GET.get("view", "normal")).strip().lower()
    q = str(request.GET.get("q", "")).strip()
    urgency = str(request.GET.get("urgency", "all")).strip().lower()
    job = str(request.GET.get("job", "")).strip().upper()
    status = str(request.GET.get("status", "")).strip()

    if view == "deleted":
        qs = order_queryset().filter(is_deleted=True)
    else:
        qs = order_queryset().filter(
            is_deleted=False,
            procurement_phase=OrderRecord.PROCUREMENT_PURCHASE,
        )
    if view == "completed":
        qs = qs.filter(
            lifecycle_status=OrderRecord.LIFECYCLE_COMPLETED
        )
    elif view == "confirm":
        qs = qs.filter(
            lifecycle_status=OrderRecord.LIFECYCLE_WAIT_CONFIRM,
        )
    elif view == "cancelled":
        qs = qs.filter(
            lifecycle_status=OrderRecord.LIFECYCLE_CANCELLED
        )
    elif view == "updates":
        qs = qs.filter(
            lifecycle_status=OrderRecord.LIFECYCLE_ACTIVE,
            pending_data_date__isnull=False,
            edit_workflow_enabled=True,
        )
        qs = qs.filter(
            Q(edit_data_status=OrderRecord.EDIT_WAIT_QUOTE, status=OrderRecord.STATUS_QUOTE)
            | Q(edit_data_status=OrderRecord.EDIT_WAIT_ITEM, status=OrderRecord.STATUS_ITEM)
            | Q(edit_data_status=OrderRecord.EDIT_WAIT_COMPLETE, status=OrderRecord.STATUS_COMPLETE)
        )
    elif view == "deleted":
        pass  # already scoped to is_deleted=True above; show any lifecycle_status
    else:
        qs = qs.filter(
            lifecycle_status=OrderRecord.LIFECYCLE_ACTIVE,
        ).exclude(status=OrderRecord.STATUS_COMPLETE)

    if q:
        qs = qs.filter(
            Q(order_number__icontains=q)
            | Q(part__sku__icontains=q)
            | Q(part_name__icontains=q)
            | Q(part_detail__icontains=q)
            | Q(maker_text__icontains=q)
            | Q(machine__code__icontains=q)
            | Q(machine__name__icontains=q)
            | Q(ordered_by__name__icontains=q)
        )
    if job:
        qs = qs.filter(job=job)
    if status:
        qs = qs.filter(status=status)

    # Default to a rolling 120-day window unless the caller explicitly asks
    # for a wider/narrower range or is searching by keyword. This is the
    # single biggest lever for cutting Supabase egress: without it every
    # page load pulls the full order history (up to 5000 rows) every time.
    date_from = as_date(request.GET.get("date_from"), "date_from")
    date_to = as_date(request.GET.get("date_to"), "date_to")
    summary_year_value = str(request.GET.get("summary_year", "")).strip()
    try:
        summary_year = int(summary_year_value) if summary_year_value else None
    except ValueError:
        return Response({"detail": "summary_year ไม่ถูกต้อง"}, status=400)
    if summary_year is not None and not 2000 <= summary_year <= 2100:
        return Response({"detail": "summary_year ไม่ถูกต้อง"}, status=400)

    show_all = str(request.GET.get("date_range", "")).strip().lower() == "all"
    if (
        not date_from
        and not date_to
        and not q
        and not show_all
        and view != "deleted"
    ):
        date_from = timezone.localdate() - timedelta(days=120)
    if summary_year is None:
        summary_year = date_from.year if date_from else timezone.localdate().year

    if date_from:
        qs = qs.filter(order_date__gte=date_from)
    if date_to:
        qs = qs.filter(order_date__lte=date_to)

    order_fields = ("-deleted_at", "-updated_at") if view == "deleted" else ("-order_date", "-created_at")
    rows = list(qs.order_by(*order_fields)[:2000])
    if urgency in {"normal", "urgent", "pending", "urgent_pending"}:
        rows = [row for row in rows if urgency_class(row) == urgency]

    active_qs = order_queryset().filter(
        is_deleted=False,
        procurement_phase=OrderRecord.PROCUREMENT_PURCHASE,
        lifecycle_status__in=[
            OrderRecord.LIFECYCLE_ACTIVE,
            OrderRecord.LIFECYCLE_WAIT_CONFIRM,
        ],
    )
    active_rows = list(active_qs)
    active_only_rows = [
        x for x in active_rows if x.lifecycle_status == OrderRecord.LIFECYCLE_ACTIVE
    ]
    wait_confirm_count = sum(
        1 for x in active_rows if x.lifecycle_status == OrderRecord.LIFECYCLE_WAIT_CONFIRM
    )

    # Month badge counts must match whichever tab (view) the person is
    # currently looking at, not always the ACTIVE tab - otherwise the
    # numbers next to each month look wrong while browsing Wait Confirm,
    # Cancelled, Completed, etc. Mirror the same view->lifecycle_status
    # filter used for the main queryset above, but scoped to the whole
    # summary_year instead of the date_from/date_to window.
    if view == "deleted":
        year_qs = order_queryset().filter(is_deleted=True)
    else:
        year_qs = order_queryset().filter(
            is_deleted=False,
            procurement_phase=OrderRecord.PROCUREMENT_PURCHASE,
        )
    if view == "completed":
        year_qs = year_qs.filter(lifecycle_status=OrderRecord.LIFECYCLE_COMPLETED)
    elif view == "confirm":
        year_qs = year_qs.filter(lifecycle_status=OrderRecord.LIFECYCLE_WAIT_CONFIRM)
    elif view == "cancelled":
        year_qs = year_qs.filter(lifecycle_status=OrderRecord.LIFECYCLE_CANCELLED)
    elif view == "updates":
        year_qs = year_qs.filter(
            lifecycle_status=OrderRecord.LIFECYCLE_ACTIVE,
            pending_data_date__isnull=False,
            edit_workflow_enabled=True,
        )
        year_qs = year_qs.filter(
            Q(edit_data_status=OrderRecord.EDIT_WAIT_QUOTE, status=OrderRecord.STATUS_QUOTE)
            | Q(edit_data_status=OrderRecord.EDIT_WAIT_ITEM, status=OrderRecord.STATUS_ITEM)
            | Q(edit_data_status=OrderRecord.EDIT_WAIT_COMPLETE, status=OrderRecord.STATUS_COMPLETE)
        )
    elif view == "deleted":
        pass
    else:
        year_qs = year_qs.filter(
            lifecycle_status=OrderRecord.LIFECYCLE_ACTIVE,
        ).exclude(status=OrderRecord.STATUS_COMPLETE)

    monthly_active_counts = [0] * 12
    date_field = "deleted_at" if view == "deleted" else "order_date"
    for value in year_qs.values_list(date_field, flat=True):
        if value and value.year == summary_year:
            monthly_active_counts[value.month - 1] += 1

    job_core = {"REPAIR", "MODIFY", "AUTOMATION", "PM"}
    kpi = {
        "total": len(active_only_rows),
        "wait_confirm": wait_confirm_count,
        "urgent": sum(1 for x in active_rows if urgency_class(x) == "urgent"),
        "urgent_pending": sum(1 for x in active_rows if urgency_class(x) == "urgent_pending"),
        "urgent_stop": sum(1 for x in active_rows if x.urgent_status == "งานด่วนเครื่องหยุด"),
        "urgent_no_stop": sum(1 for x in active_rows if x.urgent_status == "งานด่วนเครื่องไม่หยุด"),
        "pending": sum(1 for x in active_rows if urgency_class(x) == "pending"),
        "repair": sum(1 for x in active_rows if x.job == "REPAIR"),
        "modify": sum(1 for x in active_rows if x.job == "MODIFY"),
        "automation": sum(1 for x in active_rows if x.job == "AUTOMATION"),
        "pm": sum(1 for x in active_rows if x.job == "PM"),
        "general": sum(1 for x in active_rows if x.job not in job_core),
    }
    return Response(
        {
            "count": len(rows),
            "kpi": kpi,
            "summary_year": summary_year,
            "monthly_active_counts": monthly_active_counts,
            "results": [order_json(x) for x in rows],
            "date_from": date_from.isoformat() if date_from else None,
            "date_range_limited": bool(date_from) and not (
                str(request.GET.get("date_from", "")).strip()
            ),
        }
    )


@api_view(["GET"])
@permission_classes([AllowAny])
def order_detail(request, pk):
    _, err = require_permission(request, "can_view_orders")
    if err:
        return err
    order = order_queryset().filter(pk=pk, is_deleted=False).first()
    if not order:
        return Response({"detail": "ไม่พบ Order"}, status=404)
    return Response(order_json(order))


@csrf_exempt
@api_view(["POST"])
@permission_classes([AllowAny])
def quick_add_order(request):
    """Create a blank draft Order row for inline (spreadsheet-style) editing.

    Only ORDER NUMBER, DATE and a created timestamp are set. Every other
    field is left blank so the person can fill it in cell-by-cell in the
    table. Application-level "required field" checks are intentionally
    skipped here (the database columns themselves allow blank/null) -
    those checks still apply normally the moment someone edits a field
    via update_order_info, so a half-filled draft can't silently pass
    validation once it's actually a real field being saved.
    """
    actor, err = require_permission(request, "can_add_order")
    if err:
        return err
    order = OrderRecord(
        order_number=generate_order_number(),
        order_date=timezone.localdate(),
        recorded_by=actor,
        source_type="NORMAL",
        edit_workflow_enabled=True,
        factory="MM-4",
        ordered_by=actor,
    )
    sync_system_fields(order, validate=False)
    order.save()
    audit(
        actor,
        "QUICK_ADD_ORDER",
        "OrderRecord",
        order.id,
        {"order_number": order.order_number},
    )
    return Response(order_json(order_queryset().get(pk=order.pk)))


@csrf_exempt
@api_view(["PATCH"])
@permission_classes([AllowAny])
def update_order_info(request, pk):
    actor, err = require_permission(request, "can_edit_order_info")
    if err:
        return err
    order = order_queryset().filter(pk=pk, is_deleted=False).first()
    if not order:
        return Response({"detail": "ไม่พบ Order"}, status=404)
    if order.received_at and order.stock_received:
        incoming_part = str(request.data.get("part_id", order.part_id or ""))
        current_part = str(order.part_id or "")
        incoming_job = str(request.data.get("job", order.job) or "").strip().upper()
        try:
            incoming_amount = int(request.data.get("amount", order.amount) or 0)
        except (TypeError, ValueError):
            incoming_amount = order.amount
        if incoming_part != current_part or incoming_job != (order.job or "").upper() or incoming_amount != order.amount:
            return Response({"detail": "Order นี้รับเข้า Stock แล้ว จึงไม่อนุญาตให้เปลี่ยน Part ID, JOB หรือ AMOUNT เพื่อป้องกัน Stock ไม่ตรง"}, status=400)
    before = order_json(order)
    can_edit_order_date = bool(permissions_for(actor).get("can_edit_order_date"))
    if "date" in request.data:
        try:
            incoming_date = as_date(request.data.get("date"), "DATE", required=True)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=400)
        if incoming_date != order.order_date and not can_edit_order_date:
            return Response({"detail": "คุณไม่มีสิทธิ์แก้ไข DATE ของ Order"}, status=403)
    try:
        with transaction.atomic():
            apply_order_info(
                order,
                request.data,
                allow_order_date=can_edit_order_date,
            )
            if (
                order.procurement_phase == OrderRecord.PROCUREMENT_QUOTATION
                and int(order.amount or 0) < int(order.converted_quantity or 0)
            ):
                raise ValueError(
                    "AMOUNT ของรายการขอราคาต้องไม่น้อยกว่าจำนวนที่สร้างเป็น Order แล้ว"
                )
            order.save()
            after = order_json(order_queryset().get(pk=pk))
            audit(actor, "UPDATE_ORDER_INFO", "OrderRecord", order.id, {"before": before, "after": after})
        return Response(after)
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=400)


def maybe_auto_wait_confirm_step(step, actor=None):
    """Auto-advance a Step from "รอขอราคา" to "รอ Confirm" the moment every
    non-cancelled Order in it has a price filled in - so a technician sees
    it queued for their confirmation right away, without waiting for an
    Admin to notice and flip the status dropdown by hand.

    Deliberately only fires FROM WAIT_QUOTATION. If an Admin has already
    moved the Step further along (or back), this never overrides that.
    """
    if not step or step.status != OrderStep.STATUS_WAIT_QUOTATION:
        return
    orders = step.orders.filter(is_deleted=False).exclude(
        lifecycle_status=OrderRecord.LIFECYCLE_CANCELLED
    )
    if not orders.exists():
        return
    if orders.filter(
        Q(price_per_unit__isnull=True) | Q(price_per_unit=0)
    ).exists():
        return
    step.status = OrderStep.STATUS_WAIT_CONFIRM
    step.save(update_fields=["status", "updated_at"])
    audit(
        actor,
        "AUTO_WAIT_CONFIRM_STEP",
        "OrderStep",
        step.id,
        {"reason": "ทุก Order ใน Step กรอกราคาครบแล้ว"},
    )


@csrf_exempt
@api_view(["PATCH"])
@permission_classes([AllowAny])
def update_purchase_info(request, pk):
    actor, err = require_permission(request, "can_edit_purchase_info")
    if err:
        return err
    order = order_queryset().filter(pk=pk, is_deleted=False).first()
    if not order:
        return Response({"detail": "ไม่พบ Order"}, status=404)
    if order.procurement_phase == OrderRecord.PROCUREMENT_QUOTATION:
        return Response(
            {"detail": "รายการขอราคาต้องบันทึกราคาใน PO Balance ก่อนสร้างเป็น Order จริง"},
            status=400,
        )
    before = order_json(order)
    try:
        with transaction.atomic():
            apply_purchase_info(order, request.data)
            order.save()
            if order.step_id:
                maybe_auto_wait_confirm_step(order.step, actor=actor)
            after = order_json(order_queryset().get(pk=pk))
            audit(actor, "UPDATE_PURCHASE_INFO", "OrderRecord", order.id, {"before": before, "after": after})
        return Response(after)
    except (ValueError, TypeError) as exc:
        return Response({"detail": str(exc)}, status=400)


def locked_inventory(part):
    """Lock every inventory row for this Part and return the receiving row.

    We deliberately do not use select_related() together with select_for_update()
    here. PostgreSQL can reject FOR UPDATE when nullable outer joins are present.
    """
    rows = list(
        Inventory.objects.select_for_update()
        .filter(part_id=part.pk)
        .order_by("pk")
    )

    target = next(
        (row for row in rows if row.location_id == part.location_id),
        None,
    )

    if target is None:
        target = Inventory.objects.create(
            part=part,
            location_id=part.location_id,
            quantity=Decimal("0"),
            legacy_source="ORDER",
            legacy_id=f"ORDER:{part.sku}",
        )
        rows.append(target)

    return rows, target


def stock_total(rows):
    return sum(
        (Decimal(str(row.quantity or 0)) for row in rows),
        Decimal("0"),
    )


def tx_no():
    return f"ORD-RCV-{timezone.now().strftime('%Y%m%d%H%M%S%f')}"


@csrf_exempt
@api_view(["POST"])
@permission_classes([AllowAny])
def receive_order(request, pk):
    actor, err = require_permission(request, "can_receive_order")
    if err:
        return err

    order = order_queryset().filter(pk=pk, is_deleted=False).first()
    if not order:
        return Response({"detail": "ไม่พบ Order"}, status=404)
    if order.procurement_phase == OrderRecord.PROCUREMENT_QUOTATION:
        return Response(
            {"detail": "รายการขอราคายัง Receive ไม่ได้ กรุณาสร้างไปยัง Order Step ก่อน"},
            status=400,
        )

    if (
        order.lifecycle_status == OrderRecord.LIFECYCLE_CANCELLED
        or order.cancel_status
    ):
        return Response({"detail": "Order ถูกยกเลิกแล้ว"}, status=400)

    if order.received_at or order.lifecycle_status == OrderRecord.LIFECYCLE_COMPLETED:
        return Response({"detail": "รายการนี้รับของแล้ว"}, status=400)

    try:
        with transaction.atomic():
            # IMPORTANT: lock only the OrderRecord table. Do not start from
            # order_queryset(), because it select_related()s nullable FKs and
            # PostgreSQL may reject FOR UPDATE on nullable outer joins.
            order = OrderRecord.objects.select_for_update().get(
                pk=pk,
                is_deleted=False,
            )

            if (
                order.received_at
                or order.lifecycle_status == OrderRecord.LIFECYCLE_COMPLETED
            ):
                raise ValueError("รายการนี้รับของแล้ว")

            if (
                order.lifecycle_status == OrderRecord.LIFECYCLE_CANCELLED
                or order.cancel_status
            ):
                raise ValueError("Order ถูกยกเลิกแล้ว")

            stock_before = None
            stock_after = None
            tx = None

            # New business rule:
            # Any Order that has a Part ID / linked Part increases stock.
            # JOB no longer has to be SPARE.
            if order.part_id:
                part = Part.objects.select_for_update().get(pk=order.part_id)
                rows, target = locked_inventory(part)
                stock_before = stock_total(rows)

                amount = Decimal(str(order.amount or 0))
                if amount <= 0:
                    raise ValueError("AMOUNT ต้องมากกว่า 0")

                target.quantity = Decimal(str(target.quantity or 0)) + amount
                target.save(update_fields=["quantity", "updated_at"])

                stock_after = stock_before + amount

                tx = StockTransaction.objects.create(
                    legacy_source="ORDER",
                    legacy_id=str(order.id),
                    transaction_no=tx_no(),
                    part=part,
                    location_id=part.location_id,
                    transaction_type="RECEIVE",
                    quantity=amount,
                    recorded_by_employee=actor,
                    reference_type="ORDER",
                    reference_id=str(order.id),
                    transaction_date=timezone.now(),
                    remark=f"รับเข้าจาก Order {order.order_number}",
                    created_by=None,
                )

                order.stock_received = True
                order.stock_transaction = tx

            now = timezone.now()
            order.received_at = now
            order.completed_at = now
            order.completed_by_employee = actor
            order.completion_note = str(
                request.data.get("completion_note") or ""
            ).strip()
            order.lifecycle_status = OrderRecord.LIFECYCLE_COMPLETED
            order.cancel_status = False
            order.wait_confirm = False
            sync_system_fields(order, validate=False)
            order.save()

            audit(
                actor,
                "RECEIVE_ORDER",
                "OrderRecord",
                order.id,
                {
                    "order_number": order.order_number,
                    "received_at": order.received_at.isoformat(),
                    "lifecycle_status": order.lifecycle_status,
                    "stock_added": bool(tx),
                    "stock_before": (
                        str(stock_before)
                        if stock_before is not None else None
                    ),
                    "stock_after": (
                        str(stock_after)
                        if stock_after is not None else None
                    ),
                    "stock_transaction_id": (
                        str(tx.id) if tx else None
                    ),
                },
            )

        return Response(order_json(order_queryset().get(pk=pk)))

    except ValueError as exc:
        return Response({"detail": str(exc)}, status=400)
    except IntegrityError:
        return Response(
            {
                "detail":
                "รับของไม่สำเร็จเนื่องจากข้อมูล Stock ซ้ำหรือไม่สมบูรณ์ "
                "กรุณาลองใหม่อีกครั้ง"
            },
            status=409,
        )


@csrf_exempt
@api_view(["POST"])
@permission_classes([AllowAny])
def wait_confirm_order(request, pk):
    actor, err = require_permission(request, "can_edit_purchase_info")
    if err:
        return err

    try:
        with transaction.atomic():
            order = OrderRecord.objects.select_for_update().filter(
                pk=pk,
                is_deleted=False,
            ).first()
            if not order:
                return Response({"detail": "ไม่พบ Order"}, status=404)

            if order.procurement_phase == OrderRecord.PROCUREMENT_QUOTATION:
                return Response(
                    {"detail": "รายการขอราคาไม่ใช้ Wait Confirm ของ Order จริง"},
                    status=400,
                )

            if order.lifecycle_status == OrderRecord.LIFECYCLE_CANCELLED:
                return Response(
                    {"detail": "Order ที่ยกเลิกแล้วไม่สามารถเปลี่ยน Wait Confirm ได้"},
                    status=400,
                )

            if (
                order.received_at
                or order.lifecycle_status == OrderRecord.LIFECYCLE_COMPLETED
            ):
                return Response(
                    {"detail": "Order ที่รับของแล้วไม่สามารถเปลี่ยน Wait Confirm ได้"},
                    status=400,
                )

            target = bool(request.data.get("wait_confirm", True))
            wait_confirm_remark = str(
                request.data.get("wait_confirm_remark") or ""
            ).strip()
            if len(wait_confirm_remark) > 1000:
                return Response(
                    {"detail": "Wait Confirm Remark ต้องไม่เกิน 1,000 ตัวอักษร"},
                    status=400,
                )

            before = {
                "wait_confirm": order.wait_confirm,
                "wait_confirm_remark": order.wait_confirm_remark,
                "lifecycle_status": order.lifecycle_status,
                "status": order.status,
            }

            order.wait_confirm = target
            if target:
                order.wait_confirm_remark = wait_confirm_remark
            order.lifecycle_status = (
                OrderRecord.LIFECYCLE_WAIT_CONFIRM
                if target
                else OrderRecord.LIFECYCLE_ACTIVE
            )
            # STATUS is always recalculated from real Order/Purchase data.
            sync_system_fields(order, validate=False)
            order.save(update_fields=[
                "wait_confirm",
                "wait_confirm_remark",
                "lifecycle_status",
                "status",
                "group_order",
                "price_total",
                "edit_data_status",
                "updated_at",
            ])

            audit(
                actor,
                "WAIT_CONFIRM_ORDER" if target else "CANCEL_WAIT_CONFIRM",
                "OrderRecord",
                order.id,
                {
                    "before": before,
                    "after": {
                        "wait_confirm": order.wait_confirm,
                        "wait_confirm_remark": order.wait_confirm_remark,
                        "lifecycle_status": order.lifecycle_status,
                        "status": order.status,
                    },
                },
            )

        return Response(order_json(order_queryset().get(pk=pk)))

    except ValueError as exc:
        return Response({"detail": str(exc)}, status=400)


@csrf_exempt
@api_view(["POST"])
@permission_classes([AllowAny])
def cancel_order(request, pk):
    actor, err = require_permission(request, "can_cancel_order")
    if err:
        return err

    try:
        with transaction.atomic():
            order = OrderRecord.objects.select_for_update().filter(
                pk=pk,
                is_deleted=False,
            ).first()
            if not order:
                return Response({"detail": "ไม่พบ Order"}, status=404)

            target = bool(request.data.get("cancel", True))

            if target and (
                order.received_at
                or order.lifecycle_status == OrderRecord.LIFECYCLE_COMPLETED
            ):
                return Response(
                    {"detail": "Order ที่รับของแล้วไม่สามารถยกเลิกได้"},
                    status=400,
                )

            before = {
                "cancel_status": order.cancel_status,
                "lifecycle_status": order.lifecycle_status,
                "cancelled_at": (
                    order.cancelled_at.isoformat()
                    if order.cancelled_at else None
                ),
                "cancel_reason": order.cancel_reason,
            }

            if target:
                order.cancel_status = True
                order.lifecycle_status = OrderRecord.LIFECYCLE_CANCELLED
                order.cancelled_at = timezone.now()
                order.cancelled_by_employee = actor
                order.cancel_reason = str(
                    request.data.get("reason") or ""
                ).strip()
                order.wait_confirm = False
            else:
                order.cancel_status = False
                order.lifecycle_status = OrderRecord.LIFECYCLE_ACTIVE
                order.wait_confirm = False
                order.cancelled_at = None
                order.cancelled_by_employee = None
                order.cancel_reason = ""
                sync_system_fields(order, validate=False)

            order.save()

            audit(
                actor,
                "CANCEL_ORDER" if target else "RESTORE_ORDER",
                "OrderRecord",
                order.id,
                {
                    "before": before,
                    "after": {
                        "cancel_status": order.cancel_status,
                        "lifecycle_status": order.lifecycle_status,
                        "cancelled_at": (
                            order.cancelled_at.isoformat()
                            if order.cancelled_at else None
                        ),
                        "cancel_reason": order.cancel_reason,
                    },
                },
            )

        return Response(order_json(order_queryset().get(pk=pk)))

    except ValueError as exc:
        return Response({"detail": str(exc)}, status=400)


@csrf_exempt
@api_view(["DELETE"])
@permission_classes([AllowAny])
def delete_order(request, pk):
    actor, err = require_permission(request, "can_delete_order")
    if err:
        return err
    order = order_queryset().filter(pk=pk, is_deleted=False).first()
    if not order:
        return Response({"detail": "ไม่พบ Order"}, status=404)
    if (
        order.procurement_phase == OrderRecord.PROCUREMENT_QUOTATION
        and order.converted_orders.filter(is_deleted=False).exists()
    ):
        return Response(
            {
                "detail":
                "ลบรายการขอราคานี้ไม่ได้ เพราะมี Order จริงที่สร้างจากรายการนี้แล้ว"
            },
            status=400,
        )
    before = order_json(order)
    order.is_deleted = True
    order.deleted_at = timezone.now()
    order.deleted_by_employee = actor
    order.save(update_fields=["is_deleted", "deleted_at", "deleted_by_employee", "updated_at"])
    audit(actor, "SOFT_DELETE", "OrderRecord", order.id, before)
    return Response({"success": True})


@api_view(["POST"])
@permission_classes([AllowAny])
def restore_order(request, pk):
    actor, err = require_permission(request, "can_view_deleted_orders")
    if err:
        return err
    order = OrderRecord.objects.filter(pk=pk, is_deleted=True).first()
    if not order:
        return Response({"detail": "ไม่พบ Order ที่ถูกลบ"}, status=404)
    before = order_json(order_queryset().get(pk=order.pk))
    order.is_deleted = False
    order.deleted_at = None
    order.deleted_by_employee = None
    order.save(update_fields=["is_deleted", "deleted_at", "deleted_by_employee", "updated_at"])
    audit(actor, "RESTORE", "OrderRecord", order.id, before)
    return Response(order_json(order_queryset().get(pk=order.pk)))


@csrf_exempt
@api_view(["POST"])
@permission_classes([AllowAny])
def update_edit_data(request, pk):
    actor, err = require_permission(request, "can_update_edit_data")
    if err:
        return err
    order = order_queryset().filter(pk=pk, is_deleted=False, cancel_status=False).first()
    if not order:
        return Response({"detail": "ไม่พบ Order"}, status=404)
    if not order.pending_data_date or not order.edit_workflow_enabled:
        return Response({"detail": "รายการนี้ไม่อยู่ใน Workflow แก้ไข Data"}, status=400)

    mapping = {
        OrderRecord.EDIT_WAIT_QUOTE: (OrderRecord.STATUS_QUOTE, OrderRecord.EDIT_WAIT_ITEM),
        OrderRecord.EDIT_WAIT_ITEM: (OrderRecord.STATUS_ITEM, OrderRecord.EDIT_WAIT_COMPLETE),
        OrderRecord.EDIT_WAIT_COMPLETE: (OrderRecord.STATUS_COMPLETE, OrderRecord.EDIT_DONE),
    }
    current = order.edit_data_status or OrderRecord.EDIT_WAIT_QUOTE
    if current not in mapping:
        return Response({"detail": "รายการนี้อัพเดตครบแล้ว"}, status=400)
    required_status, next_state = mapping[current]
    if order.status != required_status:
        return Response({"detail": f"Order ต้องอยู่สถานะ {required_status} ก่อนจึงจะกดอัพเดตได้"}, status=400)
    order.edit_data_status = next_state
    order.save(update_fields=["edit_data_status", "updated_at"])
    audit(actor, "UPDATE_EDIT_DATA", "OrderRecord", order.id, {"old": current, "new": next_state, "order_status": order.status})
    return Response(order_json(order_queryset().get(pk=pk)))


def project_json(project):
    orders = list(
        project.orders.filter(
            is_deleted=False,
            procurement_phase=OrderRecord.PROCUREMENT_PURCHASE,
        )
        .select_related("step")
    )
    quotation_orders = list(
        order_queryset().filter(
            project=project,
            is_deleted=False,
            procurement_phase=OrderRecord.PROCUREMENT_QUOTATION,
        )
    )

    # "ราคาอะไหล่ทั้งหมดที่สั่ง":
    # Cancelled is excluded, but WAIT_CONFIRM is still included.
    total_orders = [
        x for x in orders
        if x.lifecycle_status != OrderRecord.LIFECYCLE_CANCELLED
    ]

    # "ราคาอะไหล่ที่ใช้":
    # ACTIVE + COMPLETED only.
    # WAIT_CONFIRM and CANCELLED are excluded.
    used_orders = [
        x for x in orders
        if x.lifecycle_status in {
            OrderRecord.LIFECYCLE_ACTIVE,
            OrderRecord.LIFECYCLE_COMPLETED,
        }
    ]

    return {
        "id": str(project.id),
        "name": project.name,
        "department": project.department,
        "description": project.description or "",
        "owner_id": (
            str(project.owner_employee_id)
            if project.owner_employee_id else ""
        ),
        "owner_name": (
            project.owner_employee.name
            if project.owner_employee else ""
        ),
        "pending_data_date": (
            project.pending_data_date.isoformat()
            if project.pending_data_date else ""
        ),
        "created_by": (
            project.created_by_employee.name
            if project.created_by_employee else ""
        ),
        "created_at": timezone.localtime(project.created_at).isoformat(),
        "active": project.active,
        "step_count": project.steps.count(),
        "step_status_summary": {
            row["status"]: row["n"]
            for row in project.steps.values("status").annotate(n=Count("id"))
        },
        "total_items": len(orders),
        "quotation_items": len(quotation_orders),
        "quotation_waiting": sum(
            1
            for x in quotation_orders
            if quotation_stage_status(x) == "WAIT_QUOTATION"
        ),
        "quotation_received": sum(
            1
            for x in quotation_orders
            if quotation_stage_status(x)
            in {"QUOTATION_RECEIVED", "READY_TO_CREATE_ORDER"}
        ),
        "quotation_converted": sum(
            1
            for x in quotation_orders
            if quotation_stage_status(x) == "CREATED_TO_ORDER_STEP"
        ),
        "used_items": len(used_orders),
        "wait_confirm_items": sum(
            1
            for x in orders
            if x.lifecycle_status == OrderRecord.LIFECYCLE_WAIT_CONFIRM
        ),
        "cancelled_items": sum(
            1
            for x in orders
            if x.lifecycle_status == OrderRecord.LIFECYCLE_CANCELLED
        ),
        "total_order_value": float(
            sum(
                (
                    Decimal(str(x.price_total or 0))
                    for x in total_orders
                ),
                Decimal("0"),
            )
        ),
        "used_value": float(
            sum(
                (
                    Decimal(str(x.price_total or 0))
                    for x in used_orders
                ),
                Decimal("0"),
            )
        ),
    }


@csrf_exempt
@api_view(["GET", "POST"])
@permission_classes([AllowAny])
def projects(request):
    permission = (
        "can_view_orders"
        if request.method == "GET"
        else "can_manage_order_projects"
    )
    actor, err = require_permission(request, permission)
    if err:
        return err

    if request.method == "GET":
        department = str(
            request.GET.get("department", "")
        ).strip().upper()
        q = str(request.GET.get("q", "")).strip()

        qs = (
            OrderProject.objects
            .filter(active=True)
            .select_related(
                "owner_employee",
                "created_by_employee",
            )
        )

        if department in {"MODIFY", "AUTOMATION"}:
            qs = qs.filter(department=department)

        if q:
            qs = qs.filter(
                Q(name__icontains=q)
                | Q(owner_employee__name__icontains=q)
                | Q(owner_employee__employee_code__icontains=q)
            )

        return Response(
            {
                "results": [
                    project_json(p)
                    for p in qs.order_by("-created_at")
                ]
            }
        )

    name = str(request.data.get("name", "")).strip()
    if not name:
        return Response(
            {"detail": "กรุณาระบุชื่อ Project"},
            status=400,
        )

    department = str(
        request.data.get("department", "MODIFY")
    ).strip().upper()
    if department not in {"MODIFY", "AUTOMATION"}:
        return Response(
            {"detail": "แผนกต้องเป็น MODIFY หรือ AUTOMATION"},
            status=400,
        )

    owner = employee_or_none(request.data.get("owner_id"))
    if not owner:
        owner = actor

    try:
        project = OrderProject.objects.create(
            name=name,
            department=department,
            description=str(
                request.data.get("description", "")
            ).strip(),
            owner_employee=owner,
            pending_data_date=as_date(
                request.data.get("pending_data_date"),
                "วันที่งานค้าง",
            ),
            created_by_employee=actor,
        )
    except IntegrityError:
        return Response(
            {"detail": "ชื่อ Project นี้มีอยู่แล้ว"},
            status=400,
        )
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=400)

    audit(
        actor,
        "CREATE",
        "OrderProject",
        project.id,
        project_json(project),
    )
    return Response(project_json(project), status=201)


@csrf_exempt
@api_view(["GET", "DELETE"])
@permission_classes([AllowAny])
def project_detail(request, pk):
    permission = (
        "can_view_orders"
        if request.method == "GET"
        else "can_manage_order_projects"
    )
    actor, err = require_permission(request, permission)
    if err:
        return err

    project = (
        OrderProject.objects
        .select_related(
            "owner_employee",
            "created_by_employee",
        )
        .filter(pk=pk, active=True)
        .first()
    )
    if not project:
        return Response({"detail": "ไม่พบ Project"}, status=404)

    if request.method == "DELETE":
        with transaction.atomic():
            project = OrderProject.objects.select_for_update().get(
                pk=project.pk
            )
            project.active = False
            project.save(update_fields=["active", "updated_at"])

            now = timezone.now()
            project.orders.filter(
                is_deleted=False
            ).update(
                is_deleted=True,
                deleted_at=now,
                deleted_by_employee=actor,
            )

            audit(
                actor,
                "DELETE_PROJECT",
                "OrderProject",
                project.id,
                {
                    "name": project.name,
                    "department": project.department,
                },
            )

        return Response({"ok": True})

    steps = []
    for step in project.steps.select_related("confirmed_by_employee").order_by("step_no"):
        step_orders = list(
            order_queryset()
            .filter(
                step=step,
                is_deleted=False,
                procurement_phase=OrderRecord.PROCUREMENT_PURCHASE,
            )
            .order_by("created_at")
        )
        quotation_orders = list(
            order_queryset()
            .filter(
                step=step,
                is_deleted=False,
                procurement_phase=OrderRecord.PROCUREMENT_QUOTATION,
            )
            .order_by("created_at")
        )
        quotation_rows = []
        for row in quotation_orders:
            data = order_json(row)
            data["converted_orders"] = [
                {
                    "id": str(converted.id),
                    "order_number": converted.order_number,
                    "amount": converted.amount,
                    "created_by": (
                        converted.created_from_quotation_by_employee.name
                        if converted.created_from_quotation_by_employee else ""
                    ),
                    "created_by_code": (
                        converted.created_from_quotation_by_employee.employee_code
                        if converted.created_from_quotation_by_employee else ""
                    ),
                    "created_at": (
                        timezone.localtime(converted.created_from_quotation_at).isoformat()
                        if converted.created_from_quotation_at else ""
                    ),
                    "rfq_number": (
                        converted.source_rfq.rfq_number
                        if converted.source_rfq else ""
                    ),
                }
                for converted in row.converted_orders.filter(is_deleted=False)
                .select_related(
                    "created_from_quotation_by_employee",
                    "source_rfq",
                )
                .order_by("created_at")
            ]
            quotation_rows.append(data)
        steps.append(
            {
                "id": str(step.id),
                "step_no": step.step_no,
                "status": step.status,
                "status_label": dict(OrderStep.STATUS_CHOICES).get(step.status, step.status),
                "import_filename": step.import_filename,
                "confirmed_by": (
                    step.confirmed_by_employee.name
                    if step.confirmed_by_employee else ""
                ),
                "confirmed_at": (
                    timezone.localtime(step.confirmed_at).isoformat()
                    if step.confirmed_at else ""
                ),
                "created_at": (
                    timezone.localtime(step.created_at).isoformat()
                ),
                "orders": [order_json(x) for x in step_orders],
                "quotation_orders": quotation_rows,
            }
        )

    return Response(
        {
            "project": project_json(project),
            "steps": steps,
        }
    )


@csrf_exempt
@api_view(["POST"])
@permission_classes([AllowAny])
def create_project_step(request, pk):
    """Create an empty Step inside a Project.

    Step creation is explicit. Adding an Order or importing Excel no longer
    creates a new Step automatically.
    """
    actor, err = require_permission(request, "can_manage_order_projects")
    if err:
        return err

    try:
        with transaction.atomic():
            project = OrderProject.objects.select_for_update().filter(
                pk=pk,
                active=True,
            ).first()
            if not project:
                return Response({"detail": "ไม่พบ Project"}, status=404)

            current = (
                project.steps.aggregate(max_no=Max("step_no"))["max_no"] or 0
            )
            step = OrderStep.objects.create(
                project=project,
                step_no=current + 1,
                import_filename="",
                imported_by_employee=actor,
            )

            audit(
                actor,
                "CREATE_PROJECT_STEP",
                "OrderStep",
                step.id,
                {
                    "project_id": str(project.id),
                    "project_name": project.name,
                    "step_no": step.step_no,
                },
            )

        return Response(
            {
                "id": str(step.id),
                "step_no": step.step_no,
                "status": step.status,
                "status_label": dict(OrderStep.STATUS_CHOICES).get(step.status, step.status),
                "import_filename": step.import_filename,
                "orders": [],
                "project": project_json(project),
            },
            status=201,
        )
    except IntegrityError as exc:
        return Response({"detail": str(exc)}, status=400)


@csrf_exempt
@api_view(["POST"])
@permission_classes([AllowAny])
def confirm_step(request, pk, step_pk):
    """Dedicated one-click confirmation for a Step, separate from the admin
    status dropdown. Anyone with can_confirm_order_step (a lighter-weight
    permission than can_manage_order_projects) can use this to move a Step
    from WAIT_CONFIRM -> ORDERING once they're happy with the quoted price,
    without needing full project-management rights.
    """
    actor, err = require_permission(request)
    if err:
        return err
    perms = permissions_for(actor)
    if not (
        perms.get("can_confirm_order_step")
        or perms.get("can_manage_order_projects")
    ):
        return Response({"detail": "คุณไม่มีสิทธิ์ใช้งานส่วนนี้"}, status=403)

    step = OrderStep.objects.filter(pk=step_pk, project_id=pk).first()
    if not step:
        return Response({"detail": "ไม่พบ Step"}, status=404)
    if step.status != OrderStep.STATUS_WAIT_CONFIRM:
        return Response(
            {"detail": "Step นี้ไม่ได้อยู่ในสถานะรอ Confirm"}, status=400
        )

    step.status = OrderStep.STATUS_ORDERING
    step.confirmed_by_employee = actor
    step.confirmed_at = timezone.now()
    step.save(
        update_fields=[
            "status",
            "confirmed_by_employee",
            "confirmed_at",
            "updated_at",
        ]
    )
    audit(
        actor,
        "CONFIRM_STEP",
        "OrderStep",
        step.id,
        {"confirmed_by": actor.name},
    )
    return Response(
        {
            "id": str(step.id),
            "status": step.status,
            "status_label": dict(OrderStep.STATUS_CHOICES).get(step.status),
            "confirmed_by": actor.name,
            "confirmed_at": timezone.localtime(step.confirmed_at).isoformat(),
        }
    )


@csrf_exempt
@api_view(["PATCH"])
@permission_classes([AllowAny])
def update_step_status(request, pk, step_pk):
    actor, err = require_permission(request, "can_manage_order_projects")
    if err:
        return err
    step = OrderStep.objects.filter(pk=step_pk, project_id=pk).first()
    if not step:
        return Response({"detail": "ไม่พบ Step"}, status=404)
    status_value = str(request.data.get("status", "")).strip()
    valid_statuses = dict(OrderStep.STATUS_CHOICES)
    if status_value not in valid_statuses:
        return Response({"detail": "สถานะไม่ถูกต้อง"}, status=400)
    before = step.status
    step.status = status_value
    step.save(update_fields=["status", "updated_at"])
    audit(
        actor,
        "UPDATE_STEP_STATUS",
        "OrderStep",
        step.id,
        {"before": before, "after": status_value},
    )
    return Response(
        {
            "id": str(step.id),
            "status": step.status,
            "status_label": valid_statuses.get(step.status, step.status),
        }
    )


@csrf_exempt
@api_view(["DELETE"])
@permission_classes([AllowAny])
def delete_project_step(request, pk, step_pk):
    """Delete an empty Step and renumber the remaining Steps.

    A Step that still contains non-deleted Orders is intentionally protected
    from deletion so Orders cannot disappear by accident.
    """
    actor, err = require_permission(request, "can_manage_order_projects")
    if err:
        return err

    try:
        with transaction.atomic():
            project = OrderProject.objects.select_for_update().filter(
                pk=pk,
                active=True,
            ).first()
            if not project:
                return Response({"detail": "ไม่พบ Project"}, status=404)

            step = OrderStep.objects.select_for_update().filter(
                pk=step_pk,
                project=project,
            ).first()
            if not step:
                return Response({"detail": "ไม่พบ Step"}, status=404)

            active_orders = OrderRecord.objects.filter(
                step=step,
                is_deleted=False,
            ).count()
            if active_orders:
                return Response(
                    {
                        "detail":
                        f"ไม่สามารถลบ Step {step.step_no} ได้ เพราะยังมี "
                        f"{active_orders} Order อยู่ใน Step นี้ "
                        "กรุณาลบ Order ใน Step ให้หมดก่อน"
                    },
                    status=400,
                )

            deleted_no = step.step_no
            step_id = step.id
            step.delete()

            # Keep Step numbering contiguous after deletion.
            later_steps = list(
                project.steps.select_for_update()
                .filter(step_no__gt=deleted_no)
                .order_by("step_no")
            )
            for item in later_steps:
                old_no = item.step_no
                item.step_no = old_no - 1
                item.save(update_fields=["step_no", "updated_at"])

            audit(
                actor,
                "DELETE_PROJECT_STEP",
                "OrderStep",
                step_id,
                {
                    "project_id": str(project.id),
                    "project_name": project.name,
                    "deleted_step_no": deleted_no,
                    "renumbered": len(later_steps),
                },
            )

        return Response({"ok": True, "deleted_step_no": deleted_no})

    except IntegrityError as exc:
        return Response({"detail": str(exc)}, status=400)


@csrf_exempt
@api_view(["POST"])
@permission_classes([AllowAny])
def create_project_order(request, pk, step_pk=None):
    """Create one quotation item or real Project Order in a selected Step."""
    actor, err = require_permission(request, "can_add_order")
    if err:
        return err

    if not step_pk:
        return Response(
            {"detail": "กรุณาเลือก Step ก่อนเพิ่ม Order"},
            status=400,
        )

    procurement_phase = str(
        request.data.get("procurement_phase")
        or OrderRecord.PROCUREMENT_PURCHASE
    ).strip().upper()
    if procurement_phase not in {
        OrderRecord.PROCUREMENT_PURCHASE,
        OrderRecord.PROCUREMENT_QUOTATION,
    }:
        return Response({"detail": "ช่วงการจัดซื้อไม่ถูกต้อง"}, status=400)

    try:
        with transaction.atomic():
            project = OrderProject.objects.select_for_update().filter(
                pk=pk,
                active=True,
            ).first()
            if not project:
                return Response({"detail": "ไม่พบ Project"}, status=404)

            step = OrderStep.objects.select_for_update().filter(
                pk=step_pk,
                project=project,
            ).first()
            if not step:
                return Response(
                    {"detail": "ไม่พบ Step ที่เลือกใน Project นี้"},
                    status=404,
                )

            order = OrderRecord(
                order_number=generate_order_number(
                    "QTN"
                    if procurement_phase == OrderRecord.PROCUREMENT_QUOTATION
                    else "PRJ"
                ),
                order_date=timezone.localdate(),
                recorded_by=actor,
                source_type="PROJECT",
                project=project,
                step=step,
                edit_workflow_enabled=False,
                usage_status="USED",
                procurement_phase=procurement_phase,
            )
            apply_order_info(
                order,
                request.data,
                creating=True,
                allow_order_date=bool(permissions_for(actor).get("can_edit_order_date")),
            )
            order.save()

            audit(
                actor,
                (
                    "CREATE_PROJECT_QUOTATION_ITEM"
                    if procurement_phase == OrderRecord.PROCUREMENT_QUOTATION
                    else "CREATE_PROJECT_ORDER"
                ),
                "OrderRecord",
                order.id,
                {
                    "project_id": str(project.id),
                    "project_name": project.name,
                    "step_no": step.step_no,
                    "order_number": order.order_number,
                    "procurement_phase": procurement_phase,
                },
            )

        return Response(
            {
                "order": order_json(order_queryset().get(pk=order.pk)),
                "step_no": step.step_no,
                "project": project_json(project),
            },
            status=201,
        )
    except (ValueError, IntegrityError) as exc:
        return Response({"detail": str(exc)}, status=400)


def clean_lookup(value):
    return " ".join(str(value or "").strip().split())


def lookup_tokens(value):
    text = clean_lookup(value)
    if not text:
        return []
    tokens = [text]
    if "·" in text:
        left, right = text.split("·", 1)
        tokens.extend([clean_lookup(left), clean_lookup(right)])
    return [x for x in dict.fromkeys(tokens) if x]


def resolve_machine_from_row(row):
    machine_id = row.get("machine_id")
    if machine_id:
        return machine_or_none(machine_id)

    text = clean_lookup(
        row.get("machine")
        or row.get("machine_code")
        or row.get("machine_name")
    )
    if not text:
        return None

    query = Q()
    for token in lookup_tokens(text):
        query |= Q(code__iexact=token) | Q(name__iexact=token)
    return Machine.objects.filter(query, active=True).first()


def resolve_employee_from_row(row, key="ordered_by"):
    pk = row.get(f"{key}_id")
    if pk:
        return employee_or_none(pk)

    text = clean_lookup(row.get(key))
    if not text:
        return None

    query = Q()
    for token in lookup_tokens(text):
        query |= Q(employee_code__iexact=token) | Q(name__iexact=token)
    return Employee.objects.filter(query, active=True).first()


def resolve_part_from_row(row):
    pk = row.get("part_id")
    if pk:
        return part_or_none(pk)

    sku = clean_lookup(row.get("item_id"))
    if not sku:
        return None

    query = Q()
    for token in lookup_tokens(sku):
        query |= Q(sku__iexact=token)
    return (
        Part.objects.select_related("maker", "unit", "location")
        .filter(query, active=True)
        .first()
    )


def resolve_supplier_from_row(row):
    pk = row.get("vendor_id")
    if pk:
        return supplier_or_none(pk)

    text = clean_lookup(
        row.get("vendor")
        or row.get("vendor_order")
        or row.get("vendor_name")
    )
    if not text:
        return None

    query = Q()
    for token in lookup_tokens(text):
        query |= Q(code__iexact=token) | Q(name__iexact=token)
    return Supplier.objects.filter(query, active=True).first()


def normalize_import_factory(value):
    raw = clean_lookup(value).upper()
    if raw in {"MM-11", "PHASE11", "PHASE 11"} or "11" in raw:
        return "MM-11"
    return "MM-4"


@csrf_exempt
@api_view(["POST"])
@permission_classes([AllowAny])
def import_project_step(request, pk, step_pk=None):
    actor, err = require_permission(request, "can_manage_order_projects")
    if err:
        return err

    rows = request.data.get("rows") or []
    if not isinstance(rows, list) or not rows:
        return Response({"detail": "ไม่พบรายการในไฟล์ Import"}, status=400)

    if not step_pk:
        return Response(
            {"detail": "กรุณาเลือก Step ที่ต้องการ Import"},
            status=400,
        )

    procurement_phase = str(
        request.data.get("procurement_phase")
        or OrderRecord.PROCUREMENT_PURCHASE
    ).strip().upper()
    if procurement_phase not in {
        OrderRecord.PROCUREMENT_PURCHASE,
        OrderRecord.PROCUREMENT_QUOTATION,
    }:
        return Response({"detail": "ช่วงการจัดซื้อไม่ถูกต้อง"}, status=400)

    try:
        with transaction.atomic():
            project = OrderProject.objects.select_for_update().filter(
                pk=pk,
                active=True,
            ).first()
            if not project:
                return Response({"detail": "ไม่พบ Project"}, status=404)

            step = OrderStep.objects.select_for_update().filter(
                pk=step_pk,
                project=project,
            ).first()
            if not step:
                return Response(
                    {"detail": "ไม่พบ Step ที่เลือกใน Project นี้"},
                    status=404,
                )

            filename = str(
                request.data.get("filename") or "Excel Import"
            )[:255]
            if not step.import_filename:
                step.import_filename = filename
                step.imported_by_employee = actor
                step.save(
                    update_fields=[
                        "import_filename",
                        "imported_by_employee",
                        "updated_at",
                    ]
                )

            created = []
            errors = []

            for idx, raw_row in enumerate(rows, start=2):
                if not isinstance(raw_row, dict):
                    errors.append(
                        {"row": idx, "error": "รูปแบบข้อมูลแถวไม่ถูกต้อง"}
                    )
                    continue

                # A nested atomic block keeps one bad DB row from marking the
                # entire import transaction as broken.
                try:
                    with transaction.atomic():
                        row = {
                            str(k).strip().lower(): v
                            for k, v in raw_row.items()
                        }

                        machine = resolve_machine_from_row(row)
                        if not machine:
                            raise ValueError(
                                "ไม่พบ MACHINE NAME ในระบบ"
                            )

                        ordered_by = (
                            resolve_employee_from_row(row, "ordered_by")
                            or actor
                        )
                        part = resolve_part_from_row(row)

                        item_id = clean_lookup(row.get("item_id"))
                        if item_id and not part:
                            raise ValueError(
                                f"ไม่พบ PART ID '{item_id}' ใน Part Master"
                            )

                        data = {
                            "factory": normalize_import_factory(
                                row.get("factory")
                            ),
                            "machine_id": str(machine.id),
                            # JOB / urgent / pending date are Project-level
                            # rules and are enforced by apply_order_info().
                            "part_id": str(part.id) if part else "",
                            "part_name": row.get("part_name") or "",
                            "part_detail": row.get("part_detail") or "",
                            "maker": row.get("maker") or "",
                            "amount": row.get("amount") or 0,
                            "unit": row.get("unit") or "",
                            "remark": row.get("remark") or "",
                            "ordered_by_id": str(ordered_by.id),
                        }

                        order = OrderRecord(
                            order_number=generate_order_number(
                                "QTN"
                                if procurement_phase == OrderRecord.PROCUREMENT_QUOTATION
                                else "PRJ"
                            ),
                            order_date=timezone.localdate(),
                            recorded_by=actor,
                            source_type="PROJECT",
                            project=project,
                            step=step,
                            edit_workflow_enabled=False,
                            usage_status="USED",
                            procurement_phase=procurement_phase,
                        )
                        apply_order_info(order, data, creating=True)
                        imported_date = as_date(row.get("date"), "DATE")
                        if imported_date:
                            order.order_date = imported_date
                            sync_system_fields(order, validate=False)

                        if procurement_phase == OrderRecord.PROCUREMENT_PURCHASE:
                            supplier = resolve_supplier_from_row(row)
                            person = resolve_employee_from_row(
                                row, "person_in_charge"
                            )

                            purchase = {}
                            for key in [
                                "quotation",
                                "po_number",
                                "price_per_unit",
                                "currency",
                                "lead_time_days",
                                "issue_pr_date",
                                "due_date",
                                "vendor_confirm_date",
                            ]:
                                if row.get(key) not in (None, ""):
                                    purchase[key] = row.get(key)

                            if row.get("vendor_id") or row.get("vendor") or row.get("vendor_order"):
                                if not supplier:
                                    raise ValueError(
                                        "ไม่พบ VENDOR ORDER ใน Vendor Master"
                                    )
                                purchase["vendor_id"] = str(supplier.id)

                            if row.get("person_in_charge_id") or row.get("person_in_charge"):
                                if not person:
                                    raise ValueError(
                                        "ไม่พบ PERSON IN CHARGE OF ORDER"
                                    )
                                purchase["person_in_charge_id"] = str(person.id)

                            if purchase:
                                apply_purchase_info(order, purchase)

                        order.save()
                        created.append(order)

                except Exception as exc:
                    errors.append({"row": idx, "error": str(exc)})

            if not created:
                raise ValueError(
                    "ไม่มีรายการที่ Import สำเร็จ กรุณาตรวจสอบรายละเอียดแถวที่ผิด"
                )

            audit(
                actor,
                "IMPORT_TO_PROJECT_STEP",
                "OrderStep",
                step.id,
                {
                    "project_id": str(project.id),
                    "step_no": step.step_no,
                    "filename": filename,
                    "created": len(created),
                    "procurement_phase": procurement_phase,
                    "errors": errors,
                },
            )

        return Response(
            {
                "step_no": step.step_no,
                "created": len(created),
                "errors": errors,
                "project": project_json(project),
            }
        )

    except ValueError as exc:
        import_errors = locals().get("errors", [])
        detail = str(exc)
        if import_errors:
            preview = " | ".join(
                f"แถว {x.get('row')}: {x.get('error')}"
                for x in import_errors[:5]
            )
            detail = f"{detail} · {preview}"
        return Response(
            {
                "detail": detail,
                "errors": import_errors,
            },
            status=400,
        )


@csrf_exempt
@api_view(["POST"])
@permission_classes([AllowAny])
def import_orders_excel(request):
    """Bulk Import Excel for the main (non-Project) Order list.

    Each row is matched by ORDER NUMBER against an existing, non-deleted,
    NORMAL-source Order:
      - Match found  -> the existing Order is soft-deleted (its order_number
        is suffixed so it stays unique) and a brand new Order is created
        re-using the original order_number, populated from the row data.
        This is the "delete the current one and put the new one in its
        place" replace behaviour.
      - No match     -> a brand new Order is created (a fresh order_number
        is generated if the row left ORDER NUMBER blank or it doesn't match
        anything on file).

    Rows are processed independently; one bad row does not block the rest.
    """
    actor, err = require_permission(request, "can_delete_order")
    if err:
        return err
    if not permissions_for(actor).get("can_add_order"):
        return Response({"detail": "คุณไม่มีสิทธิ์ใช้งานส่วนนี้"}, status=403)

    rows = request.data.get("rows") or []
    if not isinstance(rows, list) or not rows:
        return Response({"detail": "ไม่พบรายการในไฟล์ Import"}, status=400)
    if len(rows) > 1000:
        return Response({"detail": "Import ได้สูงสุดครั้งละ 1000 แถว"}, status=400)

    filename = str(request.data.get("filename") or "Excel Import")[:255]

    replaced = 0
    created_new = 0
    errors = []

    try:
        with transaction.atomic():
            for idx, raw_row in enumerate(rows, start=2):
                if not isinstance(raw_row, dict):
                    errors.append({"row": idx, "error": "รูปแบบข้อมูลแถวไม่ถูกต้อง"})
                    continue

                try:
                    with transaction.atomic():
                        row = {str(k).strip().lower(): v for k, v in raw_row.items()}

                        machine = resolve_machine_from_row(row)
                        if not machine:
                            raise ValueError("ไม่พบ MACHINE NAME ในระบบ")

                        ordered_by = resolve_employee_from_row(row, "ordered_by") or actor
                        part = resolve_part_from_row(row)

                        item_id = clean_lookup(row.get("item_id"))
                        if item_id and not part:
                            raise ValueError(f"ไม่พบ PART ID '{item_id}' ใน Part Master")

                        job = clean_lookup(row.get("job")).upper()
                        if not job:
                            raise ValueError("JOB จำเป็นต้องใส่")

                        data = {
                            "factory": normalize_import_factory(row.get("factory")),
                            "machine_id": str(machine.id),
                            "job": job,
                            "urgent_status": clean_lookup(row.get("urgent_status")),
                            "pending_data_date": row.get("pending_data_date") or "",
                            "part_id": str(part.id) if part else "",
                            "part_name": row.get("part_name") or "",
                            "part_detail": row.get("part_detail") or "",
                            "maker": row.get("maker") or "",
                            "amount": row.get("amount") or 0,
                            "unit": row.get("unit") or "",
                            "remark": row.get("remark") or "",
                            "ordered_by_id": str(ordered_by.id),
                        }

                        order_number = clean_lookup(row.get("order_number"))
                        existing = None
                        if order_number:
                            existing = OrderRecord.objects.select_for_update().filter(
                                order_number=order_number,
                                is_deleted=False,
                                source_type="NORMAL",
                            ).first()

                        if existing:
                            if (
                                existing.procurement_phase == OrderRecord.PROCUREMENT_QUOTATION
                                and existing.converted_orders.filter(is_deleted=False).exists()
                            ):
                                raise ValueError(
                                    "แทนที่รายการนี้ไม่ได้ เพราะมี Order จริงที่สร้างจากรายการนี้แล้ว"
                                )
                            reused_number = existing.order_number
                            existing.order_number = (
                                f"{reused_number}-REPLACED-"
                                f"{timezone.localtime().strftime('%Y%m%d%H%M%S%f')}"
                            )
                            existing.is_deleted = True
                            existing.deleted_at = timezone.now()
                            existing.deleted_by_employee = actor
                            existing.save(
                                update_fields=[
                                    "order_number",
                                    "is_deleted",
                                    "deleted_at",
                                    "deleted_by_employee",
                                    "updated_at",
                                ]
                            )
                            new_number = reused_number
                        else:
                            new_number = order_number or generate_order_number()
                            if OrderRecord.objects.filter(order_number=new_number).exists():
                                new_number = generate_order_number()

                        order = OrderRecord(
                            order_number=new_number,
                            order_date=timezone.localdate(),
                            recorded_by=actor,
                            source_type="NORMAL",
                            edit_workflow_enabled=True,
                        )
                        imported_date = as_date(row.get("date"), "DATE")
                        apply_order_info(order, data, creating=True)
                        if imported_date:
                            order.order_date = imported_date
                            sync_system_fields(order, validate=False)

                        supplier = resolve_supplier_from_row(row)
                        person = resolve_employee_from_row(row, "person_in_charge")
                        purchase = {}
                        for key in [
                            "quotation",
                            "po_number",
                            "price_per_unit",
                            "currency",
                            "lead_time_days",
                            "issue_pr_date",
                            "due_date",
                            "vendor_confirm_date",
                        ]:
                            if row.get(key) not in (None, ""):
                                purchase[key] = row.get(key)
                        if row.get("vendor_id") or row.get("vendor_order") or row.get("vendor"):
                            if not supplier:
                                raise ValueError("ไม่พบ VENDOR ORDER ใน Vendor Master")
                            purchase["vendor_id"] = str(supplier.id)
                        if row.get("person_in_charge_id") or row.get("person_in_charge"):
                            if not person:
                                raise ValueError("ไม่พบ PERSON IN CHARGE OF ORDER")
                            purchase["person_in_charge_id"] = str(person.id)
                        if purchase:
                            apply_purchase_info(order, purchase)

                        order.save()

                        if existing:
                            replaced += 1
                            audit(
                                actor,
                                "REPLACE_VIA_IMPORT",
                                "OrderRecord",
                                order.id,
                                {
                                    "filename": filename,
                                    "replaced_order_id": str(existing.id),
                                    "order_number": new_number,
                                },
                            )
                        else:
                            created_new += 1
                            audit(
                                actor,
                                "CREATE_VIA_IMPORT",
                                "OrderRecord",
                                order.id,
                                {"filename": filename, "order_number": new_number},
                            )

                except Exception as exc:
                    errors.append({"row": idx, "error": str(exc)})

            if not replaced and not created_new:
                raise ValueError("ไม่มีรายการที่ Import สำเร็จ กรุณาตรวจสอบรายละเอียดแถวที่ผิด")

    except ValueError as exc:
        detail = str(exc)
        if errors:
            preview = " | ".join(
                f"แถว {x.get('row')}: {x.get('error')}" for x in errors[:5]
            )
            detail = f"{detail} · {preview}"
        return Response({"detail": detail, "errors": errors}, status=400)

    return Response(
        {
            "replaced": replaced,
            "created": created_new,
            "errors": errors,
        }
    )


def _quotation_conversion_source(project, source_id, *, lock=False):
    # Keep the locking query free of nullable select_related joins. PostgreSQL
    # rejects FOR UPDATE on the nullable side of an outer join.
    qs = OrderRecord.objects if lock else order_queryset()
    qs = qs.filter(
        pk=source_id,
        project=project,
        source_type="PROJECT",
        procurement_phase=OrderRecord.PROCUREMENT_QUOTATION,
        is_deleted=False,
        lifecycle_status__in=[
            OrderRecord.LIFECYCLE_ACTIVE,
            OrderRecord.LIFECYCLE_WAIT_CONFIRM,
        ],
    )
    if lock:
        qs = qs.select_for_update()
    return qs.first()


def _conversion_quotes(source):
    rows = (
        OrderRFQ.objects
        .filter(
            items__order=source,
            status=OrderRFQ.STATUS_SENT,
        )
        .select_related("vendor", "po_balance")
        .distinct()
        .order_by("requested_at", "created_at")
    )
    result = []
    for rfq in rows:
        balance = getattr(rfq, "po_balance", None)
        ready = bool(
            rfq.vendor_id
            and balance
            and balance.quotation_received_at
            and balance.price is not None
        )
        result.append(
            {
                "id": str(rfq.id),
                "rfq_number": rfq.rfq_number,
                "vendor_id": str(rfq.vendor_id) if rfq.vendor_id else "",
                "vendor": rfq.vendor.name if rfq.vendor else rfq.vendor_name,
                "recipient_email": rfq.recipient_email,
                "quotation_received_at": (
                    balance.quotation_received_at.isoformat()
                    if balance and balance.quotation_received_at else ""
                ),
                "price": (
                    float(balance.price)
                    if balance and balance.price is not None else None
                ),
                "currency": balance.currency if balance else "THB",
                "lead_time_days": balance.lead_time_days if balance else None,
                "ready": ready,
            }
        )
    return result


@csrf_exempt
@api_view(["POST"])
@permission_classes([AllowAny])
def quotation_conversion_preview(request, pk):
    actor, err = require_permission(
        request,
        "can_create_order_from_quotation",
    )
    if err:
        return err
    project = OrderProject.objects.filter(pk=pk, active=True).first()
    if not project:
        return Response({"detail": "ไม่พบ Project"}, status=404)

    source_ids = request.data.get("quotation_order_ids") or []
    if not isinstance(source_ids, list) or not source_ids:
        return Response({"detail": "กรุณาเลือกรายการขอราคา"}, status=400)
    if len(source_ids) > 200:
        return Response({"detail": "เลือกได้สูงสุดครั้งละ 200 รายการ"}, status=400)

    results = []
    for source_id in dict.fromkeys(str(value) for value in source_ids if value):
        source = _quotation_conversion_source(project, source_id)
        if not source:
            return Response(
                {"detail": "มีรายการขอราคาบางรายการไม่พบหรือไม่พร้อมใช้งาน"},
                status=400,
            )
        results.append(
            {
                **order_json(source),
                "quotes": _conversion_quotes(source),
            }
        )
    return Response(
        {
            "project": project_json(project),
            "employee": {
                "employee_code": actor.employee_code,
                "name": actor.name,
            },
            "results": results,
        }
    )


@csrf_exempt
@api_view(["POST"])
@permission_classes([AllowAny])
def convert_quotation_to_orders(request, pk):
    actor, err = require_permission(
        request,
        "can_create_order_from_quotation",
    )
    if err:
        return err

    items = request.data.get("items") or []
    if not isinstance(items, list) or not items:
        return Response({"detail": "กรุณาเลือกรายการที่จะสร้าง Order"}, status=400)
    if len(items) > 200:
        return Response({"detail": "สร้างได้สูงสุดครั้งละ 200 รายการ"}, status=400)

    try:
        with transaction.atomic():
            project = OrderProject.objects.select_for_update().filter(
                pk=pk,
                active=True,
            ).first()
            if not project:
                return Response({"detail": "ไม่พบ Project"}, status=404)

            created = []
            seen_sources = set()
            for index, raw in enumerate(items, start=1):
                source_id = str((raw or {}).get("quotation_order_id") or "").strip()
                rfq_id = str((raw or {}).get("rfq_id") or "").strip()
                if not source_id or not rfq_id:
                    raise ValueError(
                        f"รายการที่ {index}: กรุณาเลือกรายการและใบเสนอราคา"
                    )
                if source_id in seen_sources:
                    raise ValueError(f"รายการที่ {index}: เลือกรายการขอราคาซ้ำ")
                seen_sources.add(source_id)

                source = _quotation_conversion_source(
                    project,
                    source_id,
                    lock=True,
                )
                if not source:
                    raise ValueError(
                        f"รายการที่ {index}: ไม่พบรายการขอราคา"
                    )
                try:
                    approved_amount = int((raw or {}).get("amount") or 0)
                except (TypeError, ValueError):
                    raise ValueError(f"รายการที่ {index}: จำนวนไม่ถูกต้อง")
                remaining = max(
                    int(source.amount or 0) - int(source.converted_quantity or 0),
                    0,
                )
                if approved_amount <= 0 or approved_amount > remaining:
                    raise ValueError(
                        f"รายการที่ {index}: จำนวนต้องอยู่ระหว่าง 1 ถึง {remaining}"
                    )

                rfq = (
                    OrderRFQ.objects
                    .select_related("vendor", "po_balance")
                    .filter(
                        pk=rfq_id,
                        status=OrderRFQ.STATUS_SENT,
                        items__order=source,
                    )
                    .distinct()
                    .first()
                )
                if not rfq:
                    raise ValueError(
                        f"รายการที่ {index}: ไม่พบ RFQ ที่เลือก"
                    )
                balance = getattr(rfq, "po_balance", None)
                if not rfq.vendor_id:
                    raise ValueError(
                        f"รายการที่ {index}: กรุณาเลือก Vendor จาก Vendor Master"
                    )
                if not balance or not balance.quotation_received_at:
                    raise ValueError(
                        f"รายการที่ {index}: ยังไม่ได้บันทึกวันที่ได้รับใบเสนอราคา"
                    )
                if balance.price is None:
                    raise ValueError(
                        f"รายการที่ {index}: ยังไม่ได้บันทึกราคาใบเสนอราคา"
                    )
                raw_price = (raw or {}).get("price_per_unit")
                try:
                    selected_price = Decimal(
                        str(
                            balance.price
                            if raw_price in (None, "")
                            else raw_price
                        )
                    )
                except (TypeError, ValueError, ArithmeticError):
                    raise ValueError(
                        f"รายการที่ {index}: ราคาต่อหน่วยไม่ถูกต้อง"
                    )
                if selected_price < 0:
                    raise ValueError(
                        f"รายการที่ {index}: ราคาต่อหน่วยต้องไม่น้อยกว่า 0"
                    )
                selected_currency = str(
                    (raw or {}).get("currency")
                    or balance.currency
                    or "THB"
                ).strip().upper()[:10]

                created_at = timezone.now()
                order = OrderRecord(
                    order_number=generate_order_number("PRJ"),
                    order_date=timezone.localdate(),
                    factory=source.factory,
                    group_order=source.group_order,
                    machine=source.machine,
                    job=project.department,
                    urgent_status="",
                    pending_data_date=project.pending_data_date,
                    remark=source.remark,
                    quotation=rfq.rfq_number,
                    part=source.part,
                    part_name=source.part_name,
                    part_detail=source.part_detail,
                    maker_text=source.maker_text,
                    amount=approved_amount,
                    unit_text=source.unit_text,
                    price_per_unit=selected_price,
                    currency=selected_currency,
                    vendor=rfq.vendor,
                    lead_time_days=balance.lead_time_days,
                    ordered_by=source.ordered_by or actor,
                    recorded_by=actor,
                    source_type="PROJECT",
                    project=project,
                    step=source.step,
                    usage_status="USED",
                    edit_workflow_enabled=False,
                    procurement_phase=OrderRecord.PROCUREMENT_PURCHASE,
                    source_quotation_order=source,
                    source_rfq=rfq,
                    created_from_quotation_by_employee=actor,
                    created_from_quotation_at=created_at,
                )
                sync_system_fields(order)
                # The quotation Step group is the traceable purchasing group.
                order.group_order = source.group_order
                order.save()
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
                order.status = compute_status(order, validate=False)
                order.save(update_fields=["status", "updated_at"])

                source.converted_quantity = int(source.converted_quantity or 0) + approved_amount
                source.save(update_fields=["converted_quantity", "updated_at"])

                audit(
                    actor,
                    "CREATE_ORDER_FROM_QUOTATION",
                    "OrderRecord",
                    order.id,
                    {
                        "project_id": str(project.id),
                        "project_name": project.name,
                        "step_no": source.step.step_no if source.step else None,
                        "quotation_order_id": str(source.id),
                        "quotation_number": source.order_number,
                        "rfq_id": str(rfq.id),
                        "rfq_number": rfq.rfq_number,
                        "vendor": rfq.vendor.name,
                        "amount": approved_amount,
                        "price_per_unit": str(selected_price),
                        "currency": selected_currency,
                        "created_by_code": actor.employee_code,
                        "created_by_name": actor.name,
                    },
                )
                created.append(order)

            audit(
                actor,
                "CREATE_ORDERS_FROM_QUOTATION_BATCH",
                "OrderProject",
                project.id,
                {
                    "created_count": len(created),
                    "created_order_ids": [str(row.id) for row in created],
                    "created_by_code": actor.employee_code,
                    "created_by_name": actor.name,
                },
            )

        return Response(
            {
                "created_count": len(created),
                "results": [
                    order_json(order_queryset().get(pk=row.pk))
                    for row in created
                ],
                "project": project_json(project),
            },
            status=201,
        )
    except (ValueError, IntegrityError) as exc:
        return Response({"detail": str(exc)}, status=400)


@csrf_exempt
@api_view(["PATCH"])
@permission_classes([AllowAny])
def update_usage(request, pk):
    actor, err = require_permission(request, "can_manage_order_projects")
    if err:
        return err
    order = order_queryset().filter(pk=pk, source_type="PROJECT", is_deleted=False).first()
    if not order:
        return Response({"detail": "ไม่พบรายการ Project"}, status=404)
    status = str(request.data.get("usage_status") or "").strip().upper()
    if status not in {"USED", "NOT_USED"}:
        return Response({"detail": "สถานะต้องเป็น USED หรือ NOT_USED"}, status=400)
    before = order.usage_status
    order.usage_status = status
    order.save(update_fields=["usage_status", "updated_at"])
    audit(actor, "UPDATE_USAGE", "OrderRecord", order.id, {"old": before, "new": status})
    return Response(order_json(order_queryset().get(pk=pk)))


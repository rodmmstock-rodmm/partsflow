from django.db import IntegrityError, transaction
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .audit_utils import audit
from .auth_api import require_permission
from .models import OrderRecord, Supplier
from .order_vendor_models import OrderVendor


_ORIGINAL_QUOTATION_IS_READY = None
_ORIGINAL_COMPUTE_STATUS = None
_ORIGINAL_APPLY_PURCHASE_INFO = None


def _order(pk):
    return (
        OrderRecord.objects.filter(
            pk=pk,
            is_deleted=False,
            source_type="NORMAL",
        )
        .first()
    )


def _row_json(row):
    return {
        "id": str(row.id),
        "vendor_id": str(row.vendor_id),
        "vendor_code": row.vendor.code,
        "vendor_name": row.vendor.name,
        "vendor_email": row.vendor.email or "",
        "vendor_contact": row.vendor.contact or "",
        "added_at": timezone.localtime(row.created_at).isoformat(),
        "added_by": row.added_by_employee.name if row.added_by_employee else "",
    }


def _refresh_order_status(order):
    # Import locally to avoid a model-import cycle during Django startup.
    from . import order_api

    order_api.sync_system_fields(order, validate=False)
    order.save(
        update_fields=[
            "group_order",
            "price_total",
            "status",
            "edit_data_status",
            "updated_at",
        ]
    )


@csrf_exempt
@api_view(["GET", "POST"])
@permission_classes([AllowAny])
def order_vendors(request, pk):
    if request.method == "GET":
        _, err = require_permission(request, "can_view_orders")
    else:
        actor, err = require_permission(request, "can_edit_purchase_info")
    if err:
        return err

    order = _order(pk)
    if not order:
        return Response({"detail": "ไม่พบ Normal Order ที่เลือก"}, status=404)

    if request.method == "GET":
        rows = OrderVendor.objects.select_related("vendor", "added_by_employee").filter(order=order)
        return Response({"results": [_row_json(row) for row in rows]})

    vendor_id = str(request.data.get("vendor_id") or "").strip()
    if not vendor_id:
        return Response({"detail": "กรุณาเลือก Vendor"}, status=400)
    vendor = Supplier.objects.filter(pk=vendor_id, active=True).first()
    if not vendor:
        return Response({"detail": "ไม่พบ Vendor ที่เลือก"}, status=404)

    try:
        with transaction.atomic():
            row, created = OrderVendor.objects.get_or_create(
                order=order,
                vendor=vendor,
                defaults={"added_by_employee": actor},
            )
            if not created:
                return Response({"detail": "Vendor นี้อยู่ในรายการแล้ว"}, status=409)
            audit(
                actor,
                "ADD_ORDER_VENDOR",
                "OrderVendor",
                row.id,
                {
                    "order_id": str(order.id),
                    "order_number": order.order_number,
                    "vendor_id": str(vendor.id),
                    "vendor_code": vendor.code,
                    "vendor_name": vendor.name,
                    "added_at": timezone.localtime(row.created_at).isoformat(),
                },
            )
            _refresh_order_status(order)
    except IntegrityError:
        return Response({"detail": "Vendor นี้อยู่ในรายการแล้ว"}, status=409)

    return Response({"success": True, "vendor": _row_json(row)}, status=201)


@csrf_exempt
@api_view(["DELETE"])
@permission_classes([AllowAny])
def order_vendor_detail(request, pk, vendor_pk):
    actor, err = require_permission(request, "can_edit_purchase_info")
    if err:
        return err

    order = _order(pk)
    if not order:
        return Response({"detail": "ไม่พบ Normal Order ที่เลือก"}, status=404)

    row = (
        OrderVendor.objects.select_related("vendor")
        .filter(pk=vendor_pk, order=order)
        .first()
    )
    if not row:
        return Response({"detail": "ไม่พบ Vendor ใน Order นี้"}, status=404)

    with transaction.atomic():
        cleared_vendor_order = order.vendor_id == row.vendor_id
        detail = {
            "order_id": str(order.id),
            "order_number": order.order_number,
            "vendor_id": str(row.vendor_id),
            "vendor_code": row.vendor.code,
            "vendor_name": row.vendor.name,
            "added_at": timezone.localtime(row.created_at).isoformat(),
            "cleared_vendor_order": cleared_vendor_order,
        }
        row.delete()
        if cleared_vendor_order:
            order.vendor = None
            order.save(update_fields=["vendor", "updated_at"])
        audit(actor, "REMOVE_ORDER_VENDOR", "OrderVendor", vendor_pk, detail)
        _refresh_order_status(order)

    return Response({"success": True, "cleared_vendor_order": cleared_vendor_order})


def install():
    """Install Normal Order vendor-shortlist purchase workflow rules."""
    global _ORIGINAL_QUOTATION_IS_READY, _ORIGINAL_COMPUTE_STATUS, _ORIGINAL_APPLY_PURCHASE_INFO
    from . import order_api

    if getattr(order_api.quotation_is_ready, "_order_vendor_flow_v2", False):
        return

    _ORIGINAL_QUOTATION_IS_READY = order_api.quotation_is_ready
    _ORIGINAL_COMPUTE_STATUS = order_api.compute_status
    _ORIGINAL_APPLY_PURCHASE_INFO = order_api.apply_purchase_info

    def quotation_is_ready(order):
        if order.source_type == "NORMAL":
            # Normal Order quotation is represented only by the Vendor shortlist.
            return bool(order.pk and order.vendor_candidates.exists())
        return _ORIGINAL_QUOTATION_IS_READY(order)

    def compute_status(order, validate=True):
        status = _ORIGINAL_COMPUTE_STATUS(order, validate=validate)
        if order.source_type != "NORMAL":
            return status
        if status == OrderRecord.STATUS_COMPLETE:
            return status

        quotation_ready = quotation_is_ready(order)
        vendor_ready = bool(
            order.vendor_id
            and order.pk
            and order.vendor_candidates.filter(vendor_id=order.vendor_id).exists()
        )
        # price_per_unit historically defaults to zero, so > 0 is the only
        # reliable way to distinguish an entered price from an untouched field.
        price_ready = bool(order.price_per_unit and order.price_per_unit > 0)
        lead_time_ready = order.lead_time_days is not None
        purchase_ready = vendor_ready and price_ready and lead_time_ready
        po_group = [
            bool((order.po_number or "").strip()),
            bool(order.issue_pr_date),
            bool(order.due_date),
        ]

        if quotation_ready and purchase_ready:
            if all(po_group):
                return OrderRecord.STATUS_ITEM
            return OrderRecord.STATUS_ISSUE_PR
        if quotation_ready:
            return OrderRecord.STATUS_QUOTE
        return OrderRecord.STATUS_NEW

    def apply_purchase_info(order, data):
        if order.source_type == "NORMAL" and "vendor_id" in data:
            vendor_id = str(data.get("vendor_id") or "").strip()
            if vendor_id and not (
                order.pk
                and order.vendor_candidates.filter(vendor_id=vendor_id).exists()
            ):
                raise ValueError(
                    "VENDOR ORDER ต้องเลือกจาก Vendor ที่อยู่ใน ORDER QUOTATION เท่านั้น"
                )
        return _ORIGINAL_APPLY_PURCHASE_INFO(order, data)

    quotation_is_ready._order_vendor_flow_v2 = True
    compute_status._order_vendor_flow_v2 = True
    apply_purchase_info._order_vendor_flow_v2 = True
    order_api.quotation_is_ready = quotation_is_ready
    order_api.compute_status = compute_status
    order_api.apply_purchase_info = apply_purchase_info

from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from . import order_api, order_vendor_api
from .audit_utils import audit
from .auth_api import current_employee, permissions_for, require_permission
from .models import AuditLog


TRACKED_FIELDS = (
    "date",
    "factory",
    "machine",
    "job",
    "urgent_status",
    "pending_data_date",
    "item_id",
    "part_name",
    "part_detail",
    "maker",
    "amount",
    "unit",
    "remark",
    "wait_confirm_remark",
    "ordered_by",
    "quotation",
    "po_number",
    "price_per_unit",
    "currency",
    "vendor",
    "lead_time_days",
    "issue_pr_date",
    "due_date",
    "vendor_confirm_date",
    "person_in_charge",
    "received_at",
    "status",
    "lifecycle_status",
    "edit_data_status",
    "usage_status",
    "procurement_phase",
    "wait_confirm",
    "cancel_status",
    "cancel_reason",
    "completion_note",
    "stock_received",
)

ORDER_LIST_PAGE_SIZE = 500


def _code_name(code, name):
    code = str(code or "").strip()
    name = str(name or "").strip()
    if code and name:
        return f"{code} · {name}"
    return code or name


def _snapshot(order):
    if not order:
        return None
    data = order_api.order_json(order)
    return {
        "date": data.get("date") or "",
        "factory": data.get("factory") or "",
        "machine": _code_name(data.get("machine_code"), data.get("machine_name")),
        "job": data.get("job") or "",
        "urgent_status": data.get("urgent_status") or "",
        "pending_data_date": data.get("pending_data_date") or "",
        "item_id": data.get("item_id") or "",
        "part_name": data.get("part_name") or "",
        "part_detail": data.get("part_detail") or "",
        "maker": data.get("maker") or "",
        "amount": data.get("amount"),
        "unit": data.get("unit") or "",
        "remark": data.get("remark") or "",
        "wait_confirm_remark": data.get("wait_confirm_remark") or "",
        "ordered_by": data.get("ordered_by") or "",
        "quotation": data.get("quotation") or "",
        "po_number": data.get("po_number") or "",
        "price_per_unit": data.get("price_per_unit"),
        "currency": data.get("currency") or "THB",
        "vendor": _code_name(data.get("vendor_code"), data.get("vendor_name")),
        "lead_time_days": data.get("lead_time_days"),
        "issue_pr_date": data.get("issue_pr_date") or "",
        "due_date": data.get("due_date") or "",
        "vendor_confirm_date": data.get("vendor_confirm_date") or "",
        "person_in_charge": data.get("person_in_charge") or "",
        "received_at": data.get("received_at") or "",
        "status": data.get("display_status") or data.get("status") or "",
        "lifecycle_status": data.get("lifecycle_status") or "",
        "edit_data_status": data.get("edit_data_status") or "",
        "usage_status": data.get("usage_status") or "",
        "procurement_phase": data.get("procurement_phase") or "",
        "wait_confirm": bool(data.get("wait_confirm")),
        "cancel_status": bool(data.get("cancel_status")),
        "cancel_reason": data.get("cancel_reason") or "",
        "completion_note": data.get("completion_note") or "",
        "stock_received": bool(data.get("stock_received")),
    }


def _current_order(pk):
    return order_api.order_queryset().filter(pk=pk, is_deleted=False).first()


def _changed(before, after):
    if not before or not after:
        return {}
    result = {}
    for field in TRACKED_FIELDS:
        old = before.get(field)
        new = after.get(field)
        if str(old if old is not None else "") != str(new if new is not None else ""):
            result[field] = {"old": old, "new": new}
    return result


def _run_mutation(request, pk, view_func, source_action):
    actor = current_employee(request)
    before = _snapshot(_current_order(pk))
    response = view_func(request, pk)

    if actor and 200 <= getattr(response, "status_code", 500) < 300:
        after = _snapshot(_current_order(pk))
        fields = _changed(before, after)
        if fields:
            audit(
                actor,
                "ORDER_FIELD_UPDATE",
                "OrderRecord",
                pk,
                {
                    "source_action": source_action,
                    "fields": fields,
                },
            )
    return response


def _import_source_map(entity_ids):
    ids = [str(value) for value in entity_ids if value]
    if not ids:
        return {}
    rows = AuditLog.objects.filter(
        entity="OrderRecord",
        action="ORDER_IMPORT_SOURCE",
        entity_id__in=ids,
    ).values("entity_id", "detail")
    return {row["entity_id"]: (row["detail"] or {}) for row in rows}


def _apply_import_source(data, detail):
    if not detail:
        return data
    if not data.get("machine_code") and detail.get("machine_raw"):
        data["machine_code"] = detail.get("machine_raw")
    if not data.get("item_id") and detail.get("item_id"):
        data["item_id"] = detail.get("item_id")
    if not data.get("vendor_name") and detail.get("vendor_raw"):
        data["vendor_name"] = detail.get("vendor_raw")
    if not data.get("ordered_by") and detail.get("ordered_by_raw"):
        data["ordered_by"] = detail.get("ordered_by_raw")
    if not data.get("issue_pr_date") and detail.get("issue_pr_raw"):
        data["issue_pr_date"] = detail.get("issue_pr_raw")
    if not data.get("due_date") and detail.get("due_raw"):
        data["due_date"] = detail.get("due_raw")
    if not data.get("vendor_confirm_date") and detail.get("vendor_confirm_raw"):
        data["vendor_confirm_date"] = detail.get("vendor_confirm_raw")
    data["import_source"] = {
        "sheet": detail.get("sheet"),
        "row": detail.get("row"),
    }
    return data


@csrf_exempt
def orders(request):
    """Keep Normal filters local to the Normal tab; preserve text search everywhere.

    Large production imports can contain several thousand Orders. Returning all of
    them in one browser response made the Order page unreliable, so cap the list
    payload while preserving the total count for pagination/search UX.
    """
    if request.method == "GET":
        view = str(request.GET.get("view", "normal")).strip().lower()
        if view == "updates":
            _, permission_error = require_permission(request, "can_view_order_updates")
            if permission_error:
                return permission_error
        if view == "deleted":
            _, permission_error = require_permission(request, "can_view_deleted_orders")
            if permission_error:
                return permission_error
        if view != "normal":
            params = request.GET.copy()
            params["urgency"] = "all"
            params["job"] = ""
            params["status"] = ""
            request.GET = params

    response = order_api.orders(request)
    if request.method == "GET" and 200 <= getattr(response, "status_code", 500) < 300:
        data = getattr(response, "data", {}) or {}
        results = data.get("results") or []
        total_count = len(results)
        visible_results = results[:ORDER_LIST_PAGE_SIZE]
        sources = _import_source_map([row.get("id") for row in visible_results])
        for row in visible_results:
            _apply_import_source(row, sources.get(str(row.get("id"))))
        data["results"] = visible_results
        data["count"] = len(visible_results)
        data["total_count"] = total_count
        data["page_size"] = ORDER_LIST_PAGE_SIZE
        response.data = data
    return response


@api_view(["GET"])
@permission_classes([AllowAny])
def order_detail_by_number(request, order_number):
    actor, err = require_permission(request, "can_view_orders")
    if err:
        return err

    order = (
        order_api.order_queryset()
        .filter(order_number=order_number, is_deleted=False)
        .first()
    )
    if not order:
        return Response({"detail": "ไม่พบ Order"}, status=404)

    data = order_api.order_json(order)
    quotation_data = {"count": 0, "results": []}
    if order.source_type == "NORMAL":
        quotation_data = order_vendor_api.order_quotation_data(order)
    data["order_quotation_count"] = quotation_data["count"]
    data["order_quotation_vendors"] = quotation_data["results"]

    source = _import_source_map([order.id]).get(str(order.id))
    _apply_import_source(data, source)
    data["recorded_by_code"] = (
        order.recorded_by.employee_code if order.recorded_by else ""
    )
    data["ordered_by_code"] = (
        order.ordered_by.employee_code if order.ordered_by else ""
    )
    data["person_in_charge_code"] = (
        order.person_in_charge.employee_code if order.person_in_charge else ""
    )

    can_view_stamps = bool(
        permissions_for(actor).get("can_view_audit_log")
    )
    data["can_view_field_stamps"] = can_view_stamps
    data["field_stamps"] = {}

    if can_view_stamps:
        logs = (
            AuditLog.objects
            .select_related("employee")
            .filter(
                entity="OrderRecord",
                entity_id=str(order.id),
                action="ORDER_FIELD_UPDATE",
            )
            .order_by("-created_at")
        )
        stamps = {}
        for item in logs:
            detail = item.detail or {}
            source_action = str(detail.get("source_action") or "")
            for field, change in (detail.get("fields") or {}).items():
                if field not in TRACKED_FIELDS or not isinstance(change, dict):
                    continue
                stamps.setdefault(field, []).append(
                    {
                        "created_at": timezone.localtime(item.created_at).isoformat(),
                        "employee_code": (
                            item.employee.employee_code
                            if item.employee else ""
                        ),
                        "employee_name": (
                            item.employee.name if item.employee else ""
                        ),
                        "old": change.get("old"),
                        "new": change.get("new"),
                        "source_action": source_action,
                    }
                )
        data["field_stamps"] = stamps

    return Response(data)


@csrf_exempt
def update_order_info(request, pk):
    return _run_mutation(
        request, pk, order_api.update_order_info, "UPDATE_ORDER_INFO"
    )


@csrf_exempt
def update_purchase_info(request, pk):
    return _run_mutation(
        request, pk, order_api.update_purchase_info, "UPDATE_PURCHASE_INFO"
    )


@csrf_exempt
def receive_order(request, pk):
    return _run_mutation(
        request, pk, order_api.receive_order, "RECEIVE_ORDER"
    )


@csrf_exempt
def wait_confirm_order(request, pk):
    return _run_mutation(
        request, pk, order_api.wait_confirm_order, "WAIT_CONFIRM_ORDER"
    )


@csrf_exempt
def cancel_order(request, pk):
    return _run_mutation(
        request, pk, order_api.cancel_order, "CANCEL_ORDER"
    )


@csrf_exempt
def update_edit_data(request, pk):
    return _run_mutation(
        request, pk, order_api.update_edit_data, "UPDATE_EDIT_DATA"
    )


@csrf_exempt
def update_usage(request, pk):
    return _run_mutation(
        request, pk, order_api.update_usage, "UPDATE_USAGE"
    )


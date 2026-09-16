import json

from django.http import JsonResponse

from . import rfq_api
from .models import OrderRFQ, OrderRecord


def _payload(request):
    if request.content_type and "json" in request.content_type.lower():
        try:
            return json.loads(request.body.decode("utf-8") or "{}")
        except (TypeError, ValueError, UnicodeDecodeError):
            return {}
    return request.POST


def _order_ids(request):
    data = _payload(request)
    value = data.get("order_ids", []) if hasattr(data, "get") else []
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except (TypeError, ValueError, json.JSONDecodeError):
            value = [value]
    return [str(item) for item in (value or []) if item]


def _step_only_error():
    return JsonResponse(
        {"detail": "ระบบขอใบเสนอราคาและติดตามราคาใช้ได้เฉพาะ Order Step เท่านั้น"},
        status=400,
    )


def _valid_step_orders(ids):
    unique = set(ids)
    if not unique:
        return False
    count = OrderRecord.objects.filter(
        id__in=unique,
        is_deleted=False,
        source_type="PROJECT",
        step_id__isnull=False,
    ).count()
    return count == len(unique)


def rfq_preview(request):
    if not _valid_step_orders(_order_ids(request)):
        return _step_only_error()
    return rfq_api.rfq_preview(request)


def record_rfq(request):
    if not _valid_step_orders(_order_ids(request)):
        return _step_only_error()
    return rfq_api.record_rfq(request)


def _rfq_is_step_only(pk):
    return OrderRFQ.objects.filter(
        pk=pk,
        items__order__is_deleted=False,
        items__order__source_type="PROJECT",
        items__order__step_id__isnull=False,
    ).exists()


def rfq_vendor(request, pk):
    if not _rfq_is_step_only(pk):
        return _step_only_error()
    return rfq_api.rfq_vendor(request, pk)


def record_follow_up(request, pk):
    if not _rfq_is_step_only(pk):
        return _step_only_error()
    return rfq_api.record_follow_up(request, pk)


def rfq_list(request):
    response = rfq_api.rfq_list(request)
    if getattr(response, "status_code", 500) >= 400:
        return response

    allowed = {
        str(value)
        for value in OrderRFQ.objects.filter(
            items__order__is_deleted=False,
            items__order__source_type="PROJECT",
            items__order__step_id__isnull=False,
        )
        .values_list("id", flat=True)
        .distinct()
    }
    data = getattr(response, "data", None)
    if isinstance(data, dict) and isinstance(data.get("results"), list):
        data["results"] = [row for row in data["results"] if str(row.get("id")) in allowed]
        if "count" in data:
            data["count"] = len(data["results"])
    return response

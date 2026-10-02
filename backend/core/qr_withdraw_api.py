from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .auth_api import require_permission
from .qr_withdraw_client import (
    QrWithdrawConfigError,
    QrWithdrawRequestError,
    delete_item,
    list_items,
    list_withdrawals,
    upsert_item,
)


def _safe_call(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs), None
    except QrWithdrawConfigError as exc:
        return None, Response({"detail": str(exc)}, status=500)
    except QrWithdrawRequestError as exc:
        return None, Response({"detail": str(exc)}, status=502)


@csrf_exempt
@api_view(["GET", "POST"])
@permission_classes([AllowAny])
def qr_withdraw_items(request):
    permission = "can_view_qr_withdraw" if request.method == "GET" else "can_add_qr_withdraw_item"
    _, err = require_permission(request, permission)
    if err:
        return err

    if request.method == "GET":
        items, err = _safe_call(list_items)
        if err:
            return err
        q = str(request.GET.get("q", "")).strip().lower()
        if q:
            items = [
                it for it in items
                if q in str(it.get("code", "")).lower()
                or q in str(it.get("name", "")).lower()
                or q in str(it.get("spec", "")).lower()
            ]
        return Response({"results": items})

    code = str(request.data.get("code", "")).strip()
    name = str(request.data.get("name", "")).strip()
    spec = str(request.data.get("spec", "")).strip()
    if not code or not name:
        return Response({"detail": "Code และ Name จำเป็นต้องใส่"}, status=400)

    # admin_upsert_item is an UPSERT - without this check, "add" on a code that
    # already exists would silently overwrite it (and the QR for that code
    # already points at the pre-existing item, not this new one).
    existing, err = _safe_call(list_items)
    if err:
        return err
    if any(str(it.get("code", "")) == code for it in existing):
        return Response({"detail": "Code นี้มีอยู่แล้วในระบบเบิกของ QR"}, status=400)

    _, err = _safe_call(upsert_item, code, name, spec)
    if err:
        return err
    return Response({"code": code, "name": name, "spec": spec}, status=201)


@csrf_exempt
@api_view(["PATCH", "DELETE"])
@permission_classes([AllowAny])
def qr_withdraw_item_detail(request, code):
    permission = "can_delete_qr_withdraw_item" if request.method == "DELETE" else "can_edit_qr_withdraw_item"
    _, err = require_permission(request, permission)
    if err:
        return err

    if request.method == "DELETE":
        _, err = _safe_call(delete_item, code)
        if err:
            return err
        return Response({"success": True})

    # code (the item's primary key, and what every already-printed QR encodes)
    # is intentionally not editable here - only name/spec can change.
    name = str(request.data.get("name", "")).strip()
    spec = str(request.data.get("spec", "")).strip()
    if not name:
        return Response({"detail": "Name จำเป็นต้องใส่"}, status=400)
    _, err = _safe_call(upsert_item, code, name, spec)
    if err:
        return err
    return Response({"code": code, "name": name, "spec": spec})


@api_view(["GET"])
@permission_classes([AllowAny])
def qr_withdraw_history(request):
    _, err = require_permission(request, "can_view_qr_withdraw")
    if err:
        return err

    rows, err = _safe_call(list_withdrawals, 2000)
    if err:
        return err
    q = str(request.GET.get("q", "")).strip().lower()
    if q:
        rows = [
            r for r in rows
            if q in str(r.get("code", "")).lower()
            or q in str(r.get("name", "")).lower()
            or q in str(r.get("requester", "")).lower()
            or q in str(r.get("process", "")).lower()
        ]
    return Response({"results": rows})

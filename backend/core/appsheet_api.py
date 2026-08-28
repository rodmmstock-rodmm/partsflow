"""AppSheet integration endpoints for PartsFlow.

Architecture:
- AppSheet reads Part/Employee/Machine data from read-only PostgreSQL views.
- Stock ISSUE/RECEIVE writes go through this API webhook, never directly to
  Inventory tables. This preserves transaction locking, history and audit logs.
"""

import hashlib
import os
from decimal import Decimal

from django.db import transaction
from django.db.models import Q, Sum, Value, DecimalField
from django.db.models.functions import Coalesce
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .audit_utils import audit
from .models import Employee, Inventory, Machine, Part, StockTransaction
from .stock_api import (
    add_stock_to_first_row,
    get_machine,
    get_part,
    locked_inventory,
    to_decimal,
    tx_no,
    tx_reference_id,
)


def configured_key():
    return str(os.getenv("APPSHEET_SHARED_KEY", "") or "").strip()


def request_key(request):
    return str(
        request.headers.get("X-AppSheet-Key")
        or request.query_params.get("key")
        or ""
    ).strip()


def require_appsheet_key(request):
    expected = configured_key()
    if not expected:
        return Response(
            {"detail": "ยังไม่ได้กำหนด APPSHEET_SHARED_KEY ที่ Backend"},
            status=503,
        )

    supplied = request_key(request)
    if not supplied:
        return Response({"detail": "Missing X-AppSheet-Key"}, status=401)

    # constant-ish comparison without exposing the configured secret
    if hashlib.sha256(supplied.encode()).digest() != hashlib.sha256(
        expected.encode()
    ).digest():
        return Response({"detail": "Invalid AppSheet key"}, status=401)

    return None


def employee_by_code(code):
    code = str(code or "").strip()
    if not code:
        raise ValueError("กรุณาระบุ RecordedByCode")
    employee = Employee.objects.filter(
        employee_code__iexact=code,
        active=True,
    ).first()
    if not employee:
        raise ValueError(f"ไม่พบ Employee Code '{code}'")
    return employee


def employee_by_id_or_code(value):
    raw = str(value or "").strip()
    if not raw:
        raise ValueError("กรุณาระบุผู้เบิก")
    employee = Employee.objects.filter(pk=raw, active=True).first()
    if employee:
        return employee
    employee = Employee.objects.filter(
        employee_code__iexact=raw,
        active=True,
    ).first()
    if not employee:
        raise ValueError("ไม่พบผู้เบิก")
    return employee


@api_view(["GET"])
@permission_classes([AllowAny])
def appsheet_health(request):
    err = require_appsheet_key(request)
    if err:
        return err
    return Response(
        {
            "ok": True,
            "service": "PartsFlow AppSheet Bridge",
            "time": timezone.now().isoformat(),
        }
    )


@api_view(["GET"])
@permission_classes([AllowAny])
def appsheet_parts(request):
    """REST test/search endpoint.

    AppSheet production list view should use appsheet_parts_view directly from
    PostgreSQL; this endpoint is useful for connectivity testing.
    """
    err = require_appsheet_key(request)
    if err:
        return err

    q = str(request.GET.get("q", "")).strip()
    try:
        limit = min(max(int(request.GET.get("limit", 100) or 100), 1), 500)
    except ValueError:
        limit = 100

    qty_field = DecimalField(max_digits=18, decimal_places=2)
    qs = (
        Part.objects.filter(active=True)
        .select_related("maker", "unit", "location")
        .annotate(
            stock_qty=Coalesce(
                Sum("inventory__quantity"),
                Value(Decimal("0")),
                output_field=qty_field,
            )
        )
        .order_by("sku")
    )
    if q:
        qs = qs.filter(
            Q(sku__icontains=q)
            | Q(name__icontains=q)
            | Q(description__icontains=q)
            | Q(maker__name__icontains=q)
        )

    rows = []
    for part in qs[:limit]:
        rows.append(
            {
                "id": str(part.id),
                "sku": part.sku,
                "name": part.name,
                "description": part.description or "",
                "maker": part.maker.name if part.maker else "",
                "unit": part.unit.code if part.unit else "",
                "location": part.location.code if part.location else "",
                "stock_qty": float(part.stock_qty or 0),
                "min_stock": float(part.min_stock or 0),
            }
        )
    return Response({"count": len(rows), "results": rows})


@csrf_exempt
@api_view(["POST"])
@permission_classes([AllowAny])
def appsheet_stock(request):
    """Process one AppSheet ISSUE or RECEIVE request.

    Expected JSON:
      {
        "Action": "ISSUE" | "RECEIVE",
        "PartID": "<uuid>",
        "Quantity": 1,
        "RequesterID": "<employee uuid or code>",   # ISSUE only
        "MachineID": "<machine uuid>",              # ISSUE only
        "RecordedByCode": "1032",
        "Note": "..."
      }
    """
    err = require_appsheet_key(request)
    if err:
        return err

    try:
        action = str(
            request.data.get("Action")
            or request.data.get("action")
            or ""
        ).strip().upper()
        if action not in {"ISSUE", "RECEIVE"}:
            raise ValueError("Action ต้องเป็น ISSUE หรือ RECEIVE")

        part_id = (
            request.data.get("PartID")
            or request.data.get("part_id")
        )
        qty = to_decimal(
            request.data.get("Quantity")
            or request.data.get("quantity"),
            "จำนวน",
        )
        part = get_part(part_id)
        recorder = employee_by_code(
            request.data.get("RecordedByCode")
            or request.data.get("recorded_by_code")
        )
        note = str(
            request.data.get("Note")
            or request.data.get("note")
            or ""
        ).strip()

        requester = None
        machine = None
        if action == "ISSUE":
            requester = employee_by_id_or_code(
                request.data.get("RequesterID")
                or request.data.get("requester_id")
            )
            machine = get_machine(
                request.data.get("MachineID")
                or request.data.get("machine_id")
            )

        with transaction.atomic():
            # Lock the Part row first to serialize simultaneous AppSheet/Web
            # transactions against this Item.
            part = (
                Part.objects.select_for_update()
                .get(pk=part.pk)
            )
            rows = locked_inventory(part)
            delta = -qty if action == "ISSUE" else qty
            before, after = add_stock_to_first_row(rows, delta)

            ref_id = tx_reference_id()
            tx = StockTransaction.objects.create(
                legacy_source="APPSHEET",
                legacy_id=ref_id,
                transaction_no=tx_no(
                    "APP-ISS" if action == "ISSUE" else "APP-RCV"
                ),
                part=part,
                location=part.location,
                transaction_type=action,
                quantity=qty,
                machine=machine,
                employee=requester,
                recorded_by_employee=recorder,
                reference_type="APPSHEET",
                reference_id=ref_id,
                transaction_date=timezone.now(),
                remark=note,
                created_by=None,
            )

            audit(
                recorder,
                f"APPSHEET_{action}_STOCK",
                "StockTransaction",
                tx.id,
                {
                    "part": part.sku,
                    "quantity": str(qty),
                    "stock_before": str(before),
                    "stock_after": str(after),
                    "requester": (
                        requester.employee_code if requester else None
                    ),
                    "machine": machine.code if machine else None,
                },
            )

        return Response(
            {
                "success": True,
                "action": action,
                "transaction_id": str(tx.id),
                "item_id": part.sku,
                "stock_before": float(before),
                "stock_after": float(after),
            }
        )

    except ValueError as exc:
        return Response({"detail": str(exc)}, status=400)
    except Part.DoesNotExist:
        return Response({"detail": "ไม่พบอะไหล่"}, status=404)

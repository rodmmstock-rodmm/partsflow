from datetime import date, datetime, time, timedelta
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.db.models import Count, Q
from django.db.models.functions import ExtractMonth
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .audit_utils import audit
from .auth_api import require_permission
from .models import Employee, Inventory, Machine, Part, StockTransaction
from .pagination import StockTransactionPagination
from .serializers import (
    STOCK_TRANSACTION_LIST_ONLY_FIELDS,
    StockTransactionDetailSerializer,
    StockTransactionListSerializer,
    transaction_recorder_name,
    transaction_type_group,
)


def to_decimal(value, label, allow_zero=False):
    try:
        result = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        raise ValueError(f"{label} ไม่ถูกต้อง")
    if allow_zero:
        if result < 0:
            raise ValueError(f"{label} ต้องไม่น้อยกว่า 0")
    elif result <= 0:
        raise ValueError(f"{label} ต้องมากกว่า 0")
    return result


def get_part(part_id):
    if not part_id:
        raise ValueError("กรุณาเลือกอะไหล่")
    try:
        return Part.objects.select_related("location", "unit", "maker").get(pk=part_id)
    except Part.DoesNotExist:
        raise ValueError("ไม่พบอะไหล่ที่เลือก")


def get_employee(employee_id):
    if not employee_id:
        raise ValueError("กรุณาเลือกผู้เบิก")
    try:
        return Employee.objects.get(pk=employee_id, active=True)
    except Employee.DoesNotExist:
        raise ValueError("ไม่พบผู้เบิกที่เลือก")


def get_machine(machine_id):
    if not machine_id:
        raise ValueError("กรุณาเลือกเครื่องจักร")
    try:
        return Machine.objects.get(pk=machine_id, active=True)
    except Machine.DoesNotExist:
        raise ValueError("ไม่พบเครื่องจักรที่เลือก")


def locked_inventory(part):
    rows = list(
        Inventory.objects.select_for_update()
        .filter(part=part)
        .order_by("pk")
    )
    if not rows:
        rows = [
            Inventory.objects.create(
                part=part,
                location=part.location,
                quantity=Decimal("0"),
                legacy_source="WEB",
                legacy_id=f"WEB:{part.sku}",
            )
        ]
    return rows


def stock_total(rows):
    return sum((Decimal(str(row.quantity or 0)) for row in rows), Decimal("0"))


def is_no_count_part(part):
    """Part IDs starting with N are issued without decrementing inventory."""
    return str(getattr(part, "sku", "") or "").strip().upper().startswith("N")


def tx_no(prefix):
    return f"{prefix}-{timezone.now().strftime('%Y%m%d%H%M%S%f')}"


def tx_reference_id():
    return timezone.now().strftime("%Y%m%d%H%M%S%f")


def add_stock_to_first_row(rows, delta):
    current_total = stock_total(rows)
    new_total = current_total + delta
    if new_total < 0:
        raise ValueError(f"Stock ไม่เพียงพอ คงเหลือ {current_total}")

    if delta >= 0:
        row = rows[0]
        row.quantity = Decimal(str(row.quantity or 0)) + delta
        row.save(update_fields=["quantity", "updated_at"])
        return current_total, new_total

    remain = -delta
    for row in rows:
        if remain <= 0:
            break
        current = Decimal(str(row.quantity or 0))
        deduct = min(current, remain)
        row.quantity = current - deduct
        row.save(update_fields=["quantity", "updated_at"])
        remain -= deduct
    return current_total, new_total


@csrf_exempt
@api_view(["POST"])
@permission_classes([AllowAny])
def issue_stock(request):
    recorder, err = require_permission(request, "can_issue_stock")
    if err:
        return err

    try:
        part = get_part(request.data.get("part_id"))
        qty = to_decimal(request.data.get("quantity"), "จำนวนเบิก")
        requester = get_employee(request.data.get("requester_id"))
        machine = get_machine(request.data.get("machine_id"))
        note = str(request.data.get("note") or "").strip()

        with transaction.atomic():
            rows = locked_inventory(part)
            if is_no_count_part(part):
                before = after = stock_total(rows)
            else:
                before, after = add_stock_to_first_row(rows, -qty)
            ref_id = tx_reference_id()
            tx = StockTransaction.objects.create(
                legacy_source="WEB",
                legacy_id=ref_id,
                transaction_no=tx_no("ISS"),
                part=part,
                location=part.location,
                transaction_type="ISSUE",
                quantity=qty,
                machine=machine,
                employee=requester,
                recorded_by_employee=recorder,
                reference_type="WEB",
                reference_id=ref_id,
                transaction_date=timezone.now(),
                remark=note,
                created_by=None,
            )
            audit(
                recorder,
                "ISSUE_STOCK",
                "StockTransaction",
                tx.id,
                {
                    "part": part.sku,
                    "quantity": str(qty),
                    "stock_before": str(before),
                    "stock_after": str(after),
                    "requester": requester.employee_code,
                    "machine": machine.code,
                },
            )

        return Response(
            {
                "success": True,
                "message": "บันทึกการเบิกอะไหล่สำเร็จ",
                "transaction_id": str(tx.pk),
                "stock_before": float(before),
                "stock_after": float(after),
            }
        )
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=400)


@csrf_exempt
@api_view(["POST"])
@permission_classes([AllowAny])
def receive_stock(request):
    recorder, err = require_permission(request, "can_receive_stock")
    if err:
        return err

    try:
        part = get_part(request.data.get("part_id"))
        qty = to_decimal(request.data.get("quantity"), "จำนวนรับเข้า")
        note = str(request.data.get("note") or "").strip()

        with transaction.atomic():
            rows = locked_inventory(part)
            before, after = add_stock_to_first_row(rows, qty)
            ref_id = tx_reference_id()
            tx = StockTransaction.objects.create(
                legacy_source="WEB",
                legacy_id=ref_id,
                transaction_no=tx_no("RCV"),
                part=part,
                location=part.location,
                transaction_type="RECEIVE",
                quantity=qty,
                machine=None,
                employee=None,
                recorded_by_employee=recorder,
                reference_type="WEB",
                reference_id=ref_id,
                transaction_date=timezone.now(),
                remark=note,
                created_by=None,
            )
            audit(
                recorder,
                "RECEIVE_STOCK",
                "StockTransaction",
                tx.id,
                {
                    "part": part.sku,
                    "quantity": str(qty),
                    "stock_before": str(before),
                    "stock_after": str(after),
                },
            )

        return Response(
            {
                "success": True,
                "message": "บันทึกการรับอะไหล่เข้าสต๊อกสำเร็จ",
                "transaction_id": str(tx.pk),
                "stock_before": float(before),
                "stock_after": float(after),
            }
        )
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=400)


@csrf_exempt
@api_view(["POST"])
@permission_classes([AllowAny])
def adjust_stock(request):
    recorder, err = require_permission(request, "can_adjust_stock")
    if err:
        return err

    try:
        part = get_part(request.data.get("part_id"))
        actual = to_decimal(request.data.get("actual_quantity"), "ยอดตรวจนับจริง", allow_zero=True)
        reason = str(request.data.get("reason") or "").strip()
        if not reason:
            raise ValueError("กรุณาระบุเหตุผลในการปรับยอด")

        with transaction.atomic():
            rows = locked_inventory(part)
            before = stock_total(rows)
            delta = actual - before
            if delta == 0:
                raise ValueError("ยอดตรวจนับจริงเท่ากับยอดในระบบ ไม่มีรายการให้ปรับ")
            _, after = add_stock_to_first_row(rows, delta)
            ref_id = tx_reference_id()
            tx = StockTransaction.objects.create(
                legacy_source="WEB",
                legacy_id=ref_id,
                transaction_no=tx_no("ADJ"),
                part=part,
                location=part.location,
                transaction_type="ADJUSTMENT",
                quantity=delta,
                machine=None,
                employee=None,
                recorded_by_employee=recorder,
                reference_type="WEB",
                reference_id=ref_id,
                transaction_date=timezone.now(),
                remark=reason,
                created_by=None,
            )
            audit(
                recorder,
                "ADJUST_STOCK",
                "StockTransaction",
                tx.id,
                {
                    "part": part.sku,
                    "stock_before": str(before),
                    "actual_quantity": str(actual),
                    "difference": str(delta),
                    "reason": reason,
                },
            )

        return Response(
            {
                "success": True,
                "transaction_id": str(tx.id),
                "stock_before": float(before),
                "stock_after": float(after),
                "difference": float(delta),
            }
        )
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=400)


def type_group(tx_type):
    return transaction_type_group(tx_type)


def inventory_effect(tx):
    group = type_group(tx.transaction_type)
    qty = Decimal(str(tx.quantity or 0))
    if group == "IN":
        return qty
    if group == "OUT":
        return -qty
    return qty


def transaction_affects_current_inventory(tx):
    return (tx.legacy_source or "").upper() in {"WEB", "ORDER"} or (
        tx.reference_type or ""
    ).upper() in {"WEB", "ORDER"}


def recorder_name(tx):
    return transaction_recorder_name(tx)


def history_json(tx):
    return StockTransactionListSerializer(tx).data


def history_detail_json(tx):
    return StockTransactionDetailSerializer(tx).data


def history_date(value, label):
    raw = str(value or "").strip()
    if not raw:
        return None
    try:
        return date.fromisoformat(raw)
    except ValueError:
        raise ValueError(f"{label} ไม่ถูกต้อง")


def local_day_start(value):
    return timezone.make_aware(
        datetime.combine(value, time.min),
        timezone.get_current_timezone(),
    )


@api_view(["GET"])
@permission_classes([AllowAny])
def history_list(request):
    _, err = require_permission(request, "can_view_history")
    if err:
        return err

    q = str(request.GET.get("q", "")).strip()
    tx_type = str(request.GET.get("type", "ALL")).strip().upper()
    requester_id = str(request.GET.get("requester_id", "")).strip()
    recorder_id = str(request.GET.get("recorder_id", "")).strip()

    try:
        date_from = history_date(request.GET.get("date_from"), "date_from")
        date_to = history_date(request.GET.get("date_to"), "date_to")
        summary_year_value = str(request.GET.get("summary_year", "")).strip()
        summary_year = (
            int(summary_year_value)
            if summary_year_value
            else timezone.localdate().year
        )
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=400)
    if not 2000 <= summary_year <= 2100:
        return Response({"detail": "summary_year ไม่ถูกต้อง"}, status=400)
    if date_from and date_to and date_from > date_to:
        return Response({"detail": "ช่วงวันที่ไม่ถูกต้อง"}, status=400)

    base_qs = StockTransaction.objects.filter(is_void=False)

    if q:
        base_qs = base_qs.filter(
            Q(part__sku__icontains=q)
            | Q(part__name__icontains=q)
            | Q(part__description__icontains=q)
            | Q(part__maker__name__icontains=q)
            | Q(machine__code__icontains=q)
            | Q(employee__name__icontains=q)
            | Q(recorded_by_employee__name__icontains=q)
            | Q(remark__icontains=q)
        )
    if requester_id:
        base_qs = base_qs.filter(employee_id=requester_id)
    if recorder_id:
        recorder = Employee.objects.filter(pk=recorder_id).first()
        if recorder:
            base_qs = base_qs.filter(
                Q(recorded_by_employee=recorder)
                | Q(remark__icontains=recorder.name)
            )
    if tx_type == "IN":
        base_qs = base_qs.filter(transaction_type__in=["IN", "RECEIVE", "RETURN", "TRANSFER_IN"])
    elif tx_type == "OUT":
        base_qs = base_qs.filter(transaction_type__in=["OUT", "ISSUE", "TRANSFER_OUT"])
    elif tx_type in {"ADJUST", "ADJUSTMENT"}:
        base_qs = base_qs.filter(transaction_type="ADJUSTMENT")

    year_start = local_day_start(date(summary_year, 1, 1))
    year_end = local_day_start(date(summary_year + 1, 1, 1))
    month_rows = (
        base_qs.filter(
            transaction_date__gte=year_start,
            transaction_date__lt=year_end,
        )
        .annotate(
            summary_month=ExtractMonth(
                "transaction_date",
                tzinfo=timezone.get_current_timezone(),
            )
        )
        .values("summary_month")
        .annotate(total=Count("id"))
        .order_by()
    )
    monthly_counts = [0] * 12
    for row in month_rows:
        month_number = int(row["summary_month"] or 0)
        if 1 <= month_number <= 12:
            monthly_counts[month_number - 1] = row["total"]

    qs = base_qs
    if date_from:
        qs = qs.filter(transaction_date__gte=local_day_start(date_from))
    if date_to:
        qs = qs.filter(
            transaction_date__lt=local_day_start(date_to + timedelta(days=1))
        )

    qs = qs.select_related(
        "part",
        "part__maker",
        "part__unit",
        "part__location",
        "location",
        "machine",
        "employee",
        "recorded_by_employee",
        "created_by",
    ).only(*STOCK_TRANSACTION_LIST_ONLY_FIELDS)

    qs = qs.order_by("-transaction_date")
    paginator = StockTransactionPagination()
    page_rows = paginator.paginate_queryset(qs, request)
    rows = StockTransactionListSerializer(page_rows, many=True).data
    response = paginator.get_paginated_response(rows)
    response.data.update(
        {
            "summary_year": summary_year,
            "monthly_counts": monthly_counts,
            "date_from": date_from.isoformat() if date_from else None,
            "date_to": date_to.isoformat() if date_to else None,
        }
    )
    return response


def detail_transaction_queryset():
    return StockTransaction.objects.select_related(
        "part",
        "part__maker",
        "part__unit",
        "part__location",
        "location",
        "machine",
        "employee",
        "recorded_by_employee",
        "created_by",
    )


@csrf_exempt
@api_view(["PATCH"])
@permission_classes([AllowAny])
def history_update(request, pk):
    actor, err = require_permission(request, "can_edit_history")
    if err:
        return err
    tx = detail_transaction_queryset().filter(pk=pk, is_void=False).first()
    if not tx:
        return Response({"detail": "ไม่พบรายการประวัติ"}, status=404)
    if (tx.reference_type or "").upper() == "ORDER":
        return Response({"detail": "รายการนี้มาจากการรับของใน Order กรุณาแก้ไขจากหน้า Order เพื่อรักษาความถูกต้องของ Stock"}, status=400)

    before = history_detail_json(tx)
    try:
        with transaction.atomic():
            old_effect = inventory_effect(tx)
            if "quantity" in request.data:
                qty = to_decimal(request.data.get("quantity"), "จำนวน")
                tx.quantity = qty
            if "machine_id" in request.data:
                machine_id = request.data.get("machine_id")
                tx.machine = Machine.objects.filter(pk=machine_id).first() if machine_id else None
            if "requester_id" in request.data:
                employee_id = request.data.get("requester_id")
                tx.employee = Employee.objects.filter(pk=employee_id).first() if employee_id else None
            if "recorder_id" in request.data:
                recorder_id = request.data.get("recorder_id")
                tx.recorded_by_employee = Employee.objects.filter(pk=recorder_id).first() if recorder_id else None
            if "remark" in request.data:
                tx.remark = str(request.data.get("remark") or "").strip()
            tx.save()

            if transaction_affects_current_inventory(tx):
                new_effect = inventory_effect(tx)
                delta = new_effect - old_effect
                if delta:
                    rows = locked_inventory(tx.part)
                    add_stock_to_first_row(rows, delta)

            after = history_detail_json(tx)
            audit(actor, "UPDATE", "StockTransaction", tx.id, {"before": before, "after": after})
        return Response(after)
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=400)


@csrf_exempt
@api_view(["DELETE"])
@permission_classes([AllowAny])
def history_delete(request, pk):
    actor, err = require_permission(request, "can_delete_history")
    if err:
        return err
    tx = detail_transaction_queryset().filter(pk=pk, is_void=False).first()
    if not tx:
        return Response({"detail": "ไม่พบรายการประวัติ"}, status=404)
    if (tx.reference_type or "").upper() == "ORDER":
        return Response({"detail": "รายการนี้มาจากการรับของใน Order กรุณาแก้ไขจากหน้า Order เพื่อรักษาความถูกต้องของ Stock"}, status=400)

    try:
        with transaction.atomic():
            if transaction_affects_current_inventory(tx):
                rows = locked_inventory(tx.part)
                add_stock_to_first_row(rows, -inventory_effect(tx))
            tx.is_void = True
            tx.voided_at = timezone.now()
            tx.voided_by_employee = actor
            tx.save(update_fields=["is_void", "voided_at", "voided_by_employee", "updated_at"])
            audit(actor, "VOID", "StockTransaction", tx.id, history_json(tx))
        return Response({"success": True})
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=400)

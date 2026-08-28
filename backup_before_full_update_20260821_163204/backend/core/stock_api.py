from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .auth_api import current_employee, permissions_for
from .models import Employee, Inventory, Machine, Part, StockTransaction


def to_decimal(value, label):
    try:
        result = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        raise ValueError(f"{label} ไม่ถูกต้อง")
    if result <= 0:
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
        return Machine.objects.get(pk=machine_id)
    except Machine.DoesNotExist:
        raise ValueError("ไม่พบเครื่องจักรที่เลือก")


def locked_inventory(part):
    rows = list(
        Inventory.objects.select_for_update()
        .filter(part=part)
        .order_by("pk")
    )
    if not rows:
        raise ValueError("อะไหล่นี้ยังไม่มี Inventory")
    return rows


def stock_total(rows):
    return sum((Decimal(str(r.quantity or 0)) for r in rows), Decimal("0"))


def tx_no(prefix):
    return f"{prefix}-{timezone.now().strftime('%Y%m%d%H%M%S%f')}"


def tx_reference_id():
    return timezone.now().strftime("%Y%m%d%H%M%S%f")


@api_view(["POST"])
def issue_stock(request):
    recorder = current_employee(request)
    if not recorder:
        return Response({"detail": "กรุณาเข้าสู่ระบบ"}, status=403)
    if not permissions_for(recorder).get("can_issue_stock"):
        return Response({"detail": "คุณไม่มีสิทธิ์เบิกอะไหล่"}, status=403)

    try:
        part = get_part(request.data.get("part_id"))
        qty = to_decimal(request.data.get("quantity"), "จำนวนเบิก")
        requester = get_employee(request.data.get("requester_id"))
        machine = get_machine(request.data.get("machine_id"))
        note = str(request.data.get("note") or "").strip()

        with transaction.atomic():
            rows = locked_inventory(part)
            before = stock_total(rows)
            if qty > before:
                raise ValueError(f"Stock ไม่เพียงพอ คงเหลือ {before}")

            remain = qty
            for row in rows:
                if remain <= 0:
                    break
                current = Decimal(str(row.quantity or 0))
                deduct = min(current, remain)
                row.quantity = current - deduct
                row.save(update_fields=["quantity", "updated_at"])
                remain -= deduct

            after = before - qty
            ref_id = tx_reference_id()

            tx = StockTransaction.objects.create(
                legacy_source="WEB",
                legacy_id=ref_id,
                transaction_no=tx_no("ISS"),
                part=part,
                location=part.location,
                transaction_type="OUT",
                quantity=qty,
                machine=machine,
                employee=requester,
                reference_type="WEB",
                reference_id=ref_id,
                transaction_date=timezone.now(),
                remark=note,
                created_by=None,
            )

        return Response({
            "success": True,
            "message": "บันทึกการเบิกอะไหล่สำเร็จ",
            "transaction_id": str(tx.pk),
            "stock_before": float(before),
            "stock_after": float(after),
            "recorded_by": {
                "id": str(recorder.pk),
                "employee_code": recorder.employee_code,
                "name": recorder.name,
            },
        })

    except ValueError as exc:
        return Response({"detail": str(exc)}, status=400)


@api_view(["POST"])
def receive_stock(request):
    recorder = current_employee(request)
    if not recorder:
        return Response({"detail": "กรุณาเข้าสู่ระบบ"}, status=403)
    if not permissions_for(recorder).get("can_receive_stock"):
        return Response({"detail": "คุณไม่มีสิทธิ์รับอะไหล่เข้าสต๊อก"}, status=403)

    try:
        part = get_part(request.data.get("part_id"))
        qty = to_decimal(request.data.get("quantity"), "จำนวนรับเข้า")
        note = str(request.data.get("note") or "").strip()

        with transaction.atomic():
            rows = locked_inventory(part)
            before = stock_total(rows)

            row = rows[0]
            row.quantity = Decimal(str(row.quantity or 0)) + qty
            row.save(update_fields=["quantity", "updated_at"])

            after = before + qty
            ref_id = tx_reference_id()

            tx = StockTransaction.objects.create(
                legacy_source="WEB",
                legacy_id=ref_id,
                transaction_no=tx_no("RCV"),
                part=part,
                location=part.location,
                transaction_type="IN",
                quantity=qty,
                machine=None,
                employee=None,
                reference_type="WEB",
                reference_id=ref_id,
                transaction_date=timezone.now(),
                remark=note,
                created_by=None,
            )

        return Response({
            "success": True,
            "message": "บันทึกการรับอะไหล่เข้าสต๊อกสำเร็จ",
            "transaction_id": str(tx.pk),
            "stock_before": float(before),
            "stock_after": float(after),
            "recorded_by": {
                "id": str(recorder.pk),
                "employee_code": recorder.employee_code,
                "name": recorder.name,
            },
        })

    except ValueError as exc:
        return Response({"detail": str(exc)}, status=400)

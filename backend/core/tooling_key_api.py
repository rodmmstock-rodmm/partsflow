from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .audit_utils import audit
from .auth_api import require_permission
from .models import Employee, ToolingVehicleKey, ToolingVehicleKeyLoan


def loan_json(loan):
    return {
        "id": str(loan.id),
        "key_id": str(loan.key_id),
        "vehicle_number": loan.key.vehicle_number,
        "key_label": loan.key.label,
        "borrower_employee_id": str(loan.borrower_employee_id or ""),
        "borrower_name": loan.borrower_name,
        "borrowed_at": loan.borrowed_at.isoformat() if loan.borrowed_at else "",
        "returned_by_employee_id": str(loan.returned_by_employee_id or ""),
        "returned_by_name": loan.returned_by_name,
        "returned_at": loan.returned_at.isoformat() if loan.returned_at else "",
        "borrow_remark": loan.borrow_remark,
        "return_remark": loan.return_remark,
        "is_outstanding": loan.returned_at is None,
    }


def key_json(key):
    current = (
        key.loans.filter(returned_at__isnull=True, is_deleted=False)
        .select_related("borrower_employee")
        .order_by("-borrowed_at")
        .first()
    )
    return {
        "id": str(key.id),
        "vehicle_number": key.vehicle_number,
        "label": key.label or f"กุญแจรถเครื่องมือ {key.vehicle_number}",
        "remark": key.remark,
        "active": key.active,
        "status": "BORROWED" if current else "AVAILABLE",
        "current_loan": loan_json(current) if current else None,
    }


def _employee(employee_id):
    if not employee_id:
        return None
    return Employee.objects.filter(id=employee_id, active=True).first()


@csrf_exempt
@api_view(["GET", "POST"])
@permission_classes([AllowAny])
def keys_list(request):
    permission = "can_view_tooling_keys" if request.method == "GET" else "can_edit_tooling_keys"
    actor, err = require_permission(request, permission)
    if err:
        return err

    if request.method == "GET":
        include_inactive = request.GET.get("include_inactive") == "true"
        q = str(request.GET.get("q", "")).strip()
        qs = ToolingVehicleKey.objects.all().order_by("vehicle_number")
        if not include_inactive:
            qs = qs.filter(active=True)
        if q:
            qs = qs.filter(Q(label__icontains=q) | Q(remark__icontains=q))
            if q.isdigit():
                qs = qs.filter(vehicle_number=int(q))
        employees = [
            {"id": str(e.id), "name": e.name, "employee_code": e.employee_code}
            for e in Employee.objects.filter(active=True).order_by("name")[:1000]
        ]
        return Response({"results": [key_json(k) for k in qs[:1000]], "employees": employees})

    try:
        vehicle_number = int(request.data.get("vehicle_number"))
        if vehicle_number < 1 or vehicle_number > 999:
            raise ValueError()
    except (TypeError, ValueError):
        return Response({"detail": "หมายเลขรถต้องเป็นตัวเลขตั้งแต่ 1 ถึง 999"}, status=400)

    label = str(request.data.get("label") or "").strip() or f"กุญแจรถเครื่องมือ {vehicle_number}"
    key = ToolingVehicleKey(
        vehicle_number=vehicle_number,
        label=label,
        remark=str(request.data.get("remark") or "").strip(),
        active=True,
    )
    try:
        key.save()
    except IntegrityError:
        return Response({"detail": "มีรายการกุญแจของรถหมายเลขนี้แล้ว"}, status=409)
    audit(actor, "CREATE", "ToolingVehicleKey", key.id, {"after": key_json(key)})
    return Response(key_json(key), status=201)


@csrf_exempt
@api_view(["PATCH", "DELETE"])
@permission_classes([AllowAny])
def key_detail(request, pk):
    permission = "can_delete_tooling_keys" if request.method == "DELETE" else "can_edit_tooling_keys"
    actor, err = require_permission(request, permission)
    if err:
        return err
    key = ToolingVehicleKey.objects.filter(pk=pk).first()
    if not key:
        return Response({"detail": "ไม่พบรายการกุญแจ"}, status=404)

    if request.method == "DELETE":
        if key.loans.filter(returned_at__isnull=True, is_deleted=False).exists():
            return Response({"detail": "กุญแจยังถูกยืมอยู่ ไม่สามารถลบได้"}, status=409)
        before = key_json(key)
        key.active = False
        key.save(update_fields=["active", "updated_at"])
        audit(actor, "ARCHIVE", "ToolingVehicleKey", key.id, {"before": before})
        return Response({"success": True})

    before = key_json(key)
    if request.data.get("active") is False and key.loans.filter(returned_at__isnull=True, is_deleted=False).exists():
        return Response({"detail": "ไม่สามารถปิดใช้งานกุญแจที่ยังถูกยืมอยู่ได้"}, status=409)
    if "vehicle_number" in request.data:
        try:
            number = int(request.data.get("vehicle_number"))
            if number < 1 or number > 999:
                raise ValueError()
            key.vehicle_number = number
        except (TypeError, ValueError):
            return Response({"detail": "หมายเลขรถต้องเป็นตัวเลขตั้งแต่ 1 ถึง 999"}, status=400)
    if "label" in request.data:
        key.label = str(request.data.get("label") or "").strip()
    if "remark" in request.data:
        key.remark = str(request.data.get("remark") or "").strip()
    if "active" in request.data:
        key.active = bool(request.data.get("active"))
    try:
        key.save()
    except IntegrityError:
        return Response({"detail": "หมายเลขรถนี้มีรายการกุญแจแล้ว"}, status=409)
    audit(actor, "UPDATE", "ToolingVehicleKey", key.id, {"before": before, "after": key_json(key)})
    return Response(key_json(key))


@csrf_exempt
@api_view(["POST"])
@permission_classes([AllowAny])
def borrow_key(request, pk):
    actor, err = require_permission(request, "can_view_tooling_keys")
    if err:
        return err
    borrower = _employee(str(request.data.get("borrower_employee_id") or "").strip())
    if not borrower:
        return Response({"detail": "กรุณาเลือกชื่อผู้ยืมที่ยังปฏิบัติงานอยู่"}, status=400)

    try:
        with transaction.atomic():
            key = ToolingVehicleKey.objects.select_for_update().filter(pk=pk, active=True).first()
            if not key:
                return Response({"detail": "ไม่พบรายการกุญแจ หรือรายการถูกปิดใช้งาน"}, status=404)
            if key.loans.filter(returned_at__isnull=True, is_deleted=False).exists():
                return Response({"detail": "กุญแจดอกนี้ถูกยืมอยู่แล้ว"}, status=409)
            loan = ToolingVehicleKeyLoan.objects.create(
                key=key,
                borrower_employee=borrower,
                borrower_name=borrower.name,
                borrow_remark=str(request.data.get("remark") or "").strip(),
                created_by_employee=actor,
            )
    except IntegrityError:
        return Response({"detail": "กุญแจดอกนี้ถูกยืมไปแล้ว กรุณารีเฟรชข้อมูล"}, status=409)

    loan = ToolingVehicleKeyLoan.objects.select_related("key", "borrower_employee", "returned_by_employee").get(pk=loan.pk)
    audit(actor, "BORROW", "ToolingVehicleKey", key.id, {"loan_id": str(loan.id), "borrower": borrower.name})
    return Response({"key": key_json(key), "loan": loan_json(loan)}, status=201)


@csrf_exempt
@api_view(["POST"])
@permission_classes([AllowAny])
def return_key(request, pk):
    actor, err = require_permission(request, "can_view_tooling_keys")
    if err:
        return err
    with transaction.atomic():
        key = ToolingVehicleKey.objects.select_for_update().filter(pk=pk, active=True).first()
        if not key:
            return Response({"detail": "ไม่พบรายการกุญแจ หรือรายการถูกปิดใช้งาน"}, status=404)
        loan = (
            ToolingVehicleKeyLoan.objects.select_for_update()
            .filter(key=key, returned_at__isnull=True, is_deleted=False)
            .order_by("-borrowed_at")
            .first()
        )
        if not loan:
            return Response({"detail": "กุญแจดอกนี้ไม่ได้อยู่ระหว่างการยืม"}, status=409)
        loan.returned_by_employee = actor
        loan.returned_by_name = actor.name
        loan.returned_at = timezone.now()
        loan.return_remark = str(request.data.get("remark") or "").strip()
        loan.updated_by_employee = actor
        loan.save(update_fields=["returned_by_employee", "returned_by_name", "returned_at", "return_remark", "updated_by_employee", "updated_at"])

    loan = ToolingVehicleKeyLoan.objects.select_related("key", "borrower_employee", "returned_by_employee").get(pk=loan.pk)
    audit(actor, "RETURN", "ToolingVehicleKey", key.id, {"loan_id": str(loan.id), "returned_by": actor.name})
    return Response({"key": key_json(key), "loan": loan_json(loan)})


@csrf_exempt
@api_view(["GET"])
@permission_classes([AllowAny])
def key_history(request):
    _, err = require_permission(request, "can_view_tooling_keys")
    if err:
        return err
    q = str(request.GET.get("q", "")).strip()
    outstanding = request.GET.get("outstanding") == "true"
    qs = ToolingVehicleKeyLoan.objects.filter(is_deleted=False).select_related(
        "key", "borrower_employee", "returned_by_employee"
    )
    if outstanding:
        qs = qs.filter(returned_at__isnull=True)
    if q:
        qs = qs.filter(
            Q(key__vehicle_number__icontains=q)
            | Q(key__label__icontains=q)
            | Q(borrower_name__icontains=q)
            | Q(returned_by_name__icontains=q)
        )
    return Response({"results": [loan_json(loan) for loan in qs[:1000]]})


@csrf_exempt
@api_view(["PATCH", "DELETE"])
@permission_classes([AllowAny])
def key_history_detail(request, pk):
    permission = "can_delete_tooling_keys" if request.method == "DELETE" else "can_edit_tooling_keys"
    actor, err = require_permission(request, permission)
    if err:
        return err
    loan = ToolingVehicleKeyLoan.objects.select_related("key", "borrower_employee", "returned_by_employee").filter(pk=pk, is_deleted=False).first()
    if not loan:
        return Response({"detail": "ไม่พบประวัติการยืม-คืน"}, status=404)

    if request.method == "DELETE":
        if loan.returned_at is None:
            return Response({"detail": "ไม่สามารถลบรายการที่ยังไม่คืนกุญแจได้"}, status=409)
        before = loan_json(loan)
        loan.is_deleted = True
        loan.updated_by_employee = actor
        loan.save(update_fields=["is_deleted", "updated_by_employee", "updated_at"])
        audit(actor, "DELETE", "ToolingVehicleKeyLoan", loan.id, {"before": before})
        return Response({"success": True})

    before = loan_json(loan)
    data = request.data
    if "borrower_employee_id" in data:
        borrower = _employee(str(data.get("borrower_employee_id") or "").strip())
        if not borrower:
            return Response({"detail": "ไม่พบพนักงานผู้ยืมที่ยังปฏิบัติงานอยู่"}, status=400)
        loan.borrower_employee = borrower
        loan.borrower_name = borrower.name
    if "borrowed_at" in data:
        value = parse_datetime(str(data.get("borrowed_at") or ""))
        if not value:
            return Response({"detail": "วันเวลาที่ยืมไม่ถูกต้อง"}, status=400)
        loan.borrowed_at = timezone.make_aware(value) if timezone.is_naive(value) else value
    if "returned_at" in data:
        raw = str(data.get("returned_at") or "").strip()
        value = parse_datetime(raw) if raw else None
        if raw and not value:
            return Response({"detail": "วันเวลาที่คืนไม่ถูกต้อง"}, status=400)
        loan.returned_at = (timezone.make_aware(value) if timezone.is_naive(value) else value) if value else None
        if value is None:
            loan.returned_by_employee = None
            loan.returned_by_name = ""
        elif not loan.returned_by_name:
            loan.returned_by_employee = actor
            loan.returned_by_name = actor.name
    if "returned_by_name" in data:
        loan.returned_by_name = str(data.get("returned_by_name") or "").strip()
    if "borrow_remark" in data:
        loan.borrow_remark = str(data.get("borrow_remark") or "").strip()
    if "return_remark" in data:
        loan.return_remark = str(data.get("return_remark") or "").strip()
    loan.updated_by_employee = actor
    try:
        with transaction.atomic():
            loan.save()
    except IntegrityError:
        return Response({"detail": "แก้ไขไม่ได้ เนื่องจากรถคันนี้มีรายการยืมที่ยังไม่คืนอยู่แล้ว"}, status=409)

    loan = ToolingVehicleKeyLoan.objects.select_related("key", "borrower_employee", "returned_by_employee").get(pk=loan.pk)
    audit(actor, "UPDATE", "ToolingVehicleKeyLoan", loan.id, {"before": before, "after": loan_json(loan)})
    return Response(loan_json(loan))

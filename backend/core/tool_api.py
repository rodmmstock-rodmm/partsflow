from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .audit_utils import audit
from .auth_api import require_permission
from .models import Employee, ToolEquipment, ToolLoanRecord


def tool_json(tool):
    return {
        "id": str(tool.id),
        "code": tool.code,
        "name": tool.name,
        "category": tool.category,
        "serial_number": tool.serial_number,
        "location": tool.location,
        "remark": tool.remark,
        "status": tool.status,
        "status_label": "ถูกยืม" if tool.status == ToolEquipment.STATUS_BORROWED else "ว่าง",
        "active": tool.active,
    }


def loan_json(loan):
    return {
        "id": str(loan.id),
        "tool_id": str(loan.tool_id),
        "tool_code": loan.tool.code,
        "tool_name": loan.tool.name,
        "borrower_name": loan.borrower_name,
        "purpose": loan.purpose,
        "borrowed_at": loan.borrowed_at.isoformat() if loan.borrowed_at else "",
        "expected_return_date": loan.expected_return_date.isoformat() if loan.expected_return_date else "",
        "returned_at": loan.returned_at.isoformat() if loan.returned_at else "",
        "returned_by_name": loan.returned_by_name,
        "return_note": loan.return_note,
        "is_outstanding": loan.returned_at is None,
    }


# ---------------------------------------------------------------------------
# Admin endpoints (authenticated, permission-gated) - equipment management
# ---------------------------------------------------------------------------


@csrf_exempt
@api_view(["GET", "POST"])
@permission_classes([AllowAny])
def tools_list(request):
    permission = "can_view_tools" if request.method == "GET" else "can_add_tool"
    actor, err = require_permission(request, permission)
    if err:
        return err

    if request.method == "GET":
        q = str(request.GET.get("q", "")).strip()
        active_param = request.GET.get("active")
        qs = ToolEquipment.objects.all().order_by("code")
        if active_param is not None:
            qs = qs.filter(active=(active_param == "true"))
        if q:
            qs = qs.filter(
                Q(code__icontains=q)
                | Q(name__icontains=q)
                | Q(category__icontains=q)
                | Q(serial_number__icontains=q)
                | Q(location__icontains=q)
            )
        return Response({"results": [tool_json(t) for t in qs[:1000]]})

    code = str(request.data.get("code", "")).strip()
    name = str(request.data.get("name", "")).strip()
    if not code or not name:
        return Response({"detail": "Code และ Name จำเป็นต้องใส่"}, status=400)

    tool = ToolEquipment(
        code=code,
        name=name,
        category=str(request.data.get("category", "")).strip(),
        serial_number=str(request.data.get("serial_number", "")).strip(),
        location=str(request.data.get("location", "")).strip(),
        remark=str(request.data.get("remark", "")).strip(),
        active=bool(request.data.get("active", True)),
    )
    try:
        tool.save()
    except Exception:
        return Response({"detail": "Code นี้มีอยู่แล้ว"}, status=400)
    audit(actor, "CREATE", "ToolEquipment", tool.id, {"after": tool_json(tool)})
    return Response(tool_json(tool), status=201)


@csrf_exempt
@api_view(["PATCH", "DELETE"])
@permission_classes([AllowAny])
def tool_detail(request, pk):
    actor, err = require_permission(
        request, "can_delete_tool" if request.method == "DELETE" else "can_edit_tool"
    )
    if err:
        return err

    tool = ToolEquipment.objects.filter(pk=pk).first()
    if not tool:
        return Response({"detail": "ไม่พบอุปกรณ์"}, status=404)

    before = tool_json(tool)

    if request.method == "DELETE":
        if tool.status == ToolEquipment.STATUS_BORROWED:
            return Response(
                {"detail": "อุปกรณ์นี้ยังถูกยืมอยู่ ไม่สามารถลบได้จนกว่าจะมีการคืน"}, status=400
            )
        tool.active = False
        tool.save(update_fields=["active", "updated_at"])
        audit(actor, "DELETE", "ToolEquipment", tool.id, before)
        return Response({"success": True})

    for field in ["code", "name", "category", "serial_number", "location", "remark"]:
        if field in request.data:
            setattr(tool, field, str(request.data.get(field, "") or "").strip())
    if "active" in request.data:
        tool.active = bool(request.data.get("active"))
    try:
        tool.save()
    except Exception:
        return Response({"detail": "Code นี้มีอยู่แล้ว"}, status=400)
    audit(actor, "UPDATE", "ToolEquipment", tool.id, {"before": before, "after": tool_json(tool)})
    return Response(tool_json(tool))


@api_view(["GET"])
@permission_classes([AllowAny])
def tool_loan_history(request):
    _, err = require_permission(request, "can_view_tools")
    if err:
        return err

    q = str(request.GET.get("q", "")).strip()
    outstanding_only = request.GET.get("outstanding") == "true"
    qs = ToolLoanRecord.objects.select_related("tool").all()
    if outstanding_only:
        qs = qs.filter(returned_at__isnull=True)
    if q:
        qs = qs.filter(
            Q(tool__code__icontains=q)
            | Q(tool__name__icontains=q)
            | Q(borrower_name__icontains=q)
            | Q(purpose__icontains=q)
        )
    return Response({"results": [loan_json(l) for l in qs[:500]]})


# ---------------------------------------------------------------------------
# Public endpoints (no login) - the page opened by scanning a tool's QR code
# ---------------------------------------------------------------------------


@api_view(["GET"])
@permission_classes([AllowAny])
def tool_public_detail(request, code):
    tool = ToolEquipment.objects.filter(code=code, active=True).first()
    if not tool:
        return Response({"detail": "ไม่พบอุปกรณ์นี้ในระบบ"}, status=404)

    current_loan = None
    if tool.status == ToolEquipment.STATUS_BORROWED:
        loan = tool.loan_records.filter(returned_at__isnull=True).order_by("-borrowed_at").first()
        if loan:
            current_loan = loan_json(loan)

    employees = [
        {"id": str(e.id), "employee_code": e.employee_code, "name": e.name}
        for e in Employee.objects.filter(active=True).order_by("name")[:1000]
    ]
    return Response({"tool": tool_json(tool), "current_loan": current_loan, "employees": employees})


@csrf_exempt
@api_view(["POST"])
@permission_classes([AllowAny])
def tool_public_borrow(request, code):
    borrower_name = str(request.data.get("borrower_name", "")).strip()
    if not borrower_name:
        return Response({"detail": "กรุณาระบุชื่อผู้เบิก"}, status=400)

    with transaction.atomic():
        tool = ToolEquipment.objects.select_for_update().filter(code=code, active=True).first()
        if not tool:
            return Response({"detail": "ไม่พบอุปกรณ์นี้ในระบบ"}, status=404)
        if tool.status == ToolEquipment.STATUS_BORROWED:
            return Response({"detail": "อุปกรณ์นี้ถูกยืมไปแล้ว"}, status=409)

        borrower_employee_id = str(request.data.get("borrower_employee_id", "")).strip()
        borrower_employee = (
            Employee.objects.filter(id=borrower_employee_id, active=True).first()
            if borrower_employee_id
            else None
        )

        loan = ToolLoanRecord.objects.create(
            tool=tool,
            borrower_employee=borrower_employee,
            borrower_name=borrower_name,
            purpose=str(request.data.get("purpose", "")).strip(),
            expected_return_date=request.data.get("expected_return_date") or None,
        )
        tool.status = ToolEquipment.STATUS_BORROWED
        tool.save(update_fields=["status", "updated_at"])

    audit(None, "BORROW", "ToolEquipment", tool.id, {"borrower_name": borrower_name, "loan_id": str(loan.id)})
    return Response({"tool": tool_json(tool), "loan": loan_json(loan)}, status=201)


@csrf_exempt
@api_view(["POST"])
@permission_classes([AllowAny])
def tool_public_return(request, code):
    returned_by_name = str(request.data.get("returned_by_name", "")).strip()
    if not returned_by_name:
        return Response({"detail": "กรุณาระบุชื่อผู้คืน"}, status=400)

    with transaction.atomic():
        tool = ToolEquipment.objects.select_for_update().filter(code=code, active=True).first()
        if not tool:
            return Response({"detail": "ไม่พบอุปกรณ์นี้ในระบบ"}, status=404)
        if tool.status != ToolEquipment.STATUS_BORROWED:
            return Response({"detail": "อุปกรณ์นี้ไม่ได้อยู่ระหว่างการยืม"}, status=409)

        loan = (
            ToolLoanRecord.objects.select_for_update()
            .filter(tool=tool, returned_at__isnull=True)
            .order_by("-borrowed_at")
            .first()
        )
        if not loan:
            return Response({"detail": "ไม่พบรายการยืมที่ค้างอยู่สำหรับอุปกรณ์นี้"}, status=409)

        loan.returned_at = timezone.now()
        loan.returned_by_name = returned_by_name
        loan.return_note = str(request.data.get("return_note", "")).strip()
        loan.save(update_fields=["returned_at", "returned_by_name", "return_note", "updated_at"])

        tool.status = ToolEquipment.STATUS_AVAILABLE
        tool.save(update_fields=["status", "updated_at"])

    audit(None, "RETURN", "ToolEquipment", tool.id, {"returned_by_name": returned_by_name, "loan_id": str(loan.id)})
    return Response({"tool": tool_json(tool), "loan": loan_json(loan)})

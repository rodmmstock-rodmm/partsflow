from django.db import IntegrityError
from django.db.models import Q
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .audit_utils import audit
from .auth_api import PERMISSION_FIELDS, require_permission
from .models import AuditLog, Employee, RoleAccess


def role_json(role):
    return {
        "id": str(role.id),
        "role_name": role.role_name,
        "display_name": role.display_name,
        "active": role.active,
        "permissions": {
            field: bool(getattr(role, field)) for field in PERMISSION_FIELDS
        },
    }


def employee_json(employee):
    return {
        "id": str(employee.id),
        "employee_code": employee.employee_code,
        "name": employee.name,
        "email": employee.email or "",
        "department": employee.department or "",
        "role": employee.role or "",
        "active": employee.active,
    }


def _employee_email(value):
    email = str(value or "").strip().lower()
    if email:
        try:
            validate_email(email)
        except ValidationError as exc:
            raise ValueError("อีเมลพนักงานไม่ถูกต้อง") from exc
    return email


@csrf_exempt
@api_view(["GET", "POST"])
@permission_classes([AllowAny])
def roles(request):
    actor, err = require_permission(request, "can_manage_roles")
    if err:
        return err

    if request.method == "GET":
        return Response({"results": [role_json(r) for r in RoleAccess.objects.all()]})

    name = str(request.data.get("role_name", "")).strip()
    display_name = str(request.data.get("display_name", "")).strip()
    if not name:
        return Response({"detail": "กรุณาระบุชื่อ Role"}, status=400)
    try:
        role = RoleAccess.objects.create(
            role_name=name,
            display_name=display_name,
            active=bool(request.data.get("active", True)),
        )
    except IntegrityError:
        return Response({"detail": "ชื่อ Role นี้มีอยู่แล้ว"}, status=400)
    audit(actor, "CREATE", "RoleAccess", role.id, {"role_name": name})
    return Response(role_json(role), status=201)


@csrf_exempt
@api_view(["PATCH"])
@permission_classes([AllowAny])
def update_role(request, pk):
    actor, err = require_permission(request, "can_manage_roles")
    if err:
        return err
    role = RoleAccess.objects.filter(pk=pk).first()
    if not role:
        return Response({"detail": "ไม่พบ Role"}, status=404)

    before = role_json(role)
    permissions = request.data.get("permissions") or {}
    for field in PERMISSION_FIELDS:
        if field in permissions:
            setattr(role, field, bool(permissions[field]))
    if "display_name" in request.data:
        role.display_name = str(request.data.get("display_name") or "").strip()
    if "active" in request.data:
        role.active = bool(request.data.get("active"))
    role.save()
    audit(actor, "UPDATE", "RoleAccess", role.id, {"before": before, "after": role_json(role)})
    return Response(role_json(role))


@csrf_exempt
@api_view(["GET", "POST"])
@permission_classes([AllowAny])
def employees(request):
    permission = "can_view_employees" if request.method == "GET" else "can_add_employees"
    actor, err = require_permission(request, permission)
    if err:
        return err

    if request.method == "GET":
        q = str(request.GET.get("q", "")).strip()
        qs = Employee.objects.all().order_by("employee_code")
        if q:
            qs = qs.filter(
                Q(employee_code__icontains=q)
                | Q(name__icontains=q)
                | Q(email__icontains=q)
                | Q(department__icontains=q)
                | Q(role__icontains=q)
            )
        return Response({"results": [employee_json(e) for e in qs[:1000]]})

    code = str(request.data.get("employee_code", "")).strip()
    name = str(request.data.get("name", "")).strip()
    role = str(request.data.get("role", "")).strip()
    if not code or not name:
        return Response({"detail": "Employee Code และชื่อพนักงานจำเป็นต้องใส่"}, status=400)
    if role and not RoleAccess.objects.filter(role_name__iexact=role, active=True).exists():
        return Response({"detail": "Role นี้ยังไม่มีใน Role & Permissions"}, status=400)
    try:
        email = _employee_email(request.data.get("email", ""))
        employee = Employee.objects.create(
            employee_code=code,
            name=name,
            email=email,
            department=str(request.data.get("department", "")).strip(),
            role=role,
            active=bool(request.data.get("active", True)),
            legacy_source="WEB",
            legacy_id=code,
        )
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=400)
    except IntegrityError:
        return Response({"detail": "Employee Code นี้มีอยู่แล้ว"}, status=400)
    audit(actor, "CREATE", "Employee", employee.id, employee_json(employee))
    return Response(employee_json(employee), status=201)


@csrf_exempt
@api_view(["PATCH"])
@permission_classes([AllowAny])
def update_employee(request, pk):
    actor, err = require_permission(request, "can_edit_employees")
    if err:
        return err
    employee = Employee.objects.filter(pk=pk).first()
    if not employee:
        return Response({"detail": "ไม่พบพนักงาน"}, status=404)

    before = employee_json(employee)
    if "employee_code" in request.data:
        employee.employee_code = str(request.data.get("employee_code") or "").strip()
    if "name" in request.data:
        employee.name = str(request.data.get("name") or "").strip()
    if "email" in request.data:
        try:
            employee.email = _employee_email(request.data.get("email"))
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=400)
    if "department" in request.data:
        employee.department = str(request.data.get("department") or "").strip()
    if "active" in request.data:
        employee.active = bool(request.data.get("active"))
    if "role" in request.data:
        role = str(request.data.get("role") or "").strip()
        if role and not RoleAccess.objects.filter(role_name__iexact=role, active=True).exists():
            return Response({"detail": "Role นี้ยังไม่มีใน Role & Permissions"}, status=400)
        employee.role = role
    try:
        employee.save()
    except IntegrityError:
        return Response({"detail": "Employee Code นี้มีอยู่แล้ว"}, status=400)
    audit(actor, "UPDATE", "Employee", employee.id, {"before": before, "after": employee_json(employee)})
    return Response(employee_json(employee))


@api_view(["GET"])
@permission_classes([AllowAny])
def audit_logs(request):
    _, err = require_permission(request, "can_view_audit_log")
    if err:
        return err
    q = str(request.GET.get("q", "")).strip()
    qs = AuditLog.objects.select_related("employee")
    if q:
        qs = qs.filter(
            Q(action__icontains=q)
            | Q(entity__icontains=q)
            | Q(entity_id__icontains=q)
            | Q(employee__name__icontains=q)
            | Q(employee__employee_code__icontains=q)
        )
    rows = []
    for item in qs[:500]:
        rows.append(
            {
                "id": item.id,
                "created_at": item.created_at.isoformat(),
                "employee": employee_json(item.employee) if item.employee else None,
                "action": item.action,
                "entity": item.entity,
                "entity_id": item.entity_id,
                "detail": item.detail,
            }
        )
    return Response({"results": rows})

from django.core import signing
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .models import Employee, RoleAccess

PERMISSION_FIELDS = [
    "can_view_dashboard",
    "can_view_parts",
    "can_edit_parts",
    "can_adjust_stock",
    "can_receive_stock",
    "can_issue_stock",
    "can_view_history",
    "can_edit_history",
    "can_delete_history",
    "can_view_safety_stock",
    "can_view_orders",
    "can_view_order_updates",
    "can_add_order",
    "can_edit_order_info",
    "can_edit_order_date",
    "can_edit_purchase_info",
    "can_receive_order",
    "can_cancel_order",
    "can_delete_order",
    "can_update_edit_data",
    "can_manage_order_projects",
    "can_create_order_from_quotation",
    "can_view_deleted_orders",
    "can_view_suppliers",
    "can_manage_suppliers",
    "can_view_machines",
    "can_manage_machines",
    "can_view_employees",
    "can_add_employees",
    "can_edit_employees",
    "can_view_audit_log",
    "can_manage_roles",
]

TOKEN_SALT = "partsflow.employee.auth"
TOKEN_MAX_AGE = 60 * 60 * 8

def permissions_for(employee):
    role = RoleAccess.objects.filter(
        role_name__iexact=(employee.role or ""), active=True
    ).first()
    if role:
        return {field: bool(getattr(role, field)) for field in PERMISSION_FIELDS}

    if (employee.role or "").strip().lower() in {"admin", "administrator"}:
        return {field: True for field in PERMISSION_FIELDS}

    defaults = {field: False for field in PERMISSION_FIELDS}
    defaults.update(
        {
            "can_view_dashboard": True,
            "can_view_parts": True,
            "can_view_history": True,
            "can_view_safety_stock": True,
        }
    )
    return defaults

def create_auth_token(employee):
    return signing.dumps(
        {"employee_id": str(employee.id)},
        salt=TOKEN_SALT,
        compress=True,
    )

def employee_from_bearer(request):
    authorization = str(request.META.get("HTTP_AUTHORIZATION", "")).strip()
    if not authorization:
        return None

    parts = authorization.split(" ", 1)
    if len(parts) != 2:
        return None

    scheme, token = parts
    if scheme.lower() != "bearer" or not token:
        return None

    try:
        data = signing.loads(
            token,
            salt=TOKEN_SALT,
            max_age=TOKEN_MAX_AGE,
        )
    except (signing.BadSignature, signing.SignatureExpired):
        return None

    employee_id = data.get("employee_id")
    if not employee_id:
        return None

    return Employee.objects.filter(id=employee_id, active=True).first()

def current_employee(request):
    employee = employee_from_bearer(request)
    if employee:
        return employee

    pk = request.session.get("partsflow_employee_id")
    if not pk:
        return None

    employee = Employee.objects.filter(id=pk, active=True).first()
    if not employee:
        request.session.flush()
    return employee

def require_permission(request, permission=None):
    employee = current_employee(request)
    if not employee:
        return None, Response({"detail": "กรุณาเข้าสู่ระบบ"}, status=401)

    if permission and not permissions_for(employee).get(permission):
        return None, Response({"detail": "คุณไม่มีสิทธิ์ใช้งานส่วนนี้"}, status=403)

    return employee, None

def payload(employee):
    return {
        "id": str(employee.id),
        "employee_code": employee.employee_code,
        "name": employee.name,
        "email": employee.email or "",
        "role": employee.role or "",
        "department": employee.department or "",
        "permissions": permissions_for(employee),
    }

@csrf_exempt
@api_view(["POST"])
@permission_classes([AllowAny])
def login_view(request):
    code = str(request.data.get("employee_code", "")).strip()
    if not code:
        return Response({"detail": "กรุณากรอกรหัสพนักงาน"}, status=400)

    employee = Employee.objects.filter(
        employee_code__iexact=code,
        active=True,
    ).first()

    if not employee:
        return Response(
            {"detail": "ไม่พบรหัสพนักงาน หรือบัญชีไม่ได้เปิดใช้งาน"},
            status=401,
        )

    request.session.cycle_key()
    request.session["partsflow_employee_id"] = str(employee.id)
    request.session.set_expiry(TOKEN_MAX_AGE)

    token = create_auth_token(employee)

    return Response(
        {
            "authenticated": True,
            "token": token,
            "expires_in": TOKEN_MAX_AGE,
            "employee": payload(employee),
        }
    )

@api_view(["GET"])
@permission_classes([AllowAny])
def me_view(request):
    employee = current_employee(request)
    if not employee:
        return Response(
            {"authenticated": False, "employee": None},
            status=401,
        )

    return Response(
        {"authenticated": True, "employee": payload(employee)}
    )

@csrf_exempt
@api_view(["POST"])
@permission_classes([AllowAny])
def logout_view(request):
    request.session.flush()
    return Response({"authenticated": False})

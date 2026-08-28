from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from .models import Employee, RoleAccess

PERMISSION_FIELDS = [
    "can_view_dashboard","can_view_parts","can_edit_parts",
    "can_receive_stock","can_issue_stock","can_view_suppliers",
    "can_view_machines","can_manage_roles",
]

def permissions_for(employee):
    role = RoleAccess.objects.filter(role_name__iexact=(employee.role or ""), active=True).first()
    if role:
        return {f: bool(getattr(role, f)) for f in PERMISSION_FIELDS}
    if (employee.role or "").strip().lower() in {"admin","administrator"}:
        return {f: True for f in PERMISSION_FIELDS}
    return {
        "can_view_dashboard": True, "can_view_parts": True,
        "can_edit_parts": False, "can_receive_stock": False,
        "can_issue_stock": False, "can_view_suppliers": False,
        "can_view_machines": False, "can_manage_roles": False,
    }

def current_employee(request):
    pk = request.session.get("partsflow_employee_id")
    if not pk:
        return None
    e = Employee.objects.filter(id=pk, active=True).first()
    if not e:
        request.session.flush()
    return e

def payload(e):
    return {
        "id": str(e.id), "employee_code": e.employee_code,
        "name": e.name, "role": e.role or "",
        "department": e.department or "",
        "permissions": permissions_for(e),
    }

@csrf_exempt
@api_view(["POST"])
@permission_classes([AllowAny])
def login_view(request):
    code = str(request.data.get("employee_code","")).strip()
    if not code:
        return Response({"detail":"กรุณากรอกรหัสพนักงาน"}, status=400)
    e = Employee.objects.filter(employee_code__iexact=code, active=True).first()
    if not e:
        return Response({"detail":"ไม่พบรหัสพนักงาน หรือบัญชีไม่ได้เปิดใช้งาน"}, status=401)
    request.session.cycle_key()
    request.session["partsflow_employee_id"] = str(e.id)
    request.session.set_expiry(60*60*8)
    return Response({"authenticated":True,"employee":payload(e)})

@api_view(["GET"])
@permission_classes([AllowAny])
def me_view(request):
    e = current_employee(request)
    if not e:
        return Response({"authenticated":False,"employee":None}, status=401)
    return Response({"authenticated":True,"employee":payload(e)})

@csrf_exempt
@api_view(["POST"])
@permission_classes([AllowAny])
def logout_view(request):
    request.session.flush()
    return Response({"authenticated":False})

from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from .models import Employee, RoleAccess
from .auth_api import current_employee, permissions_for, PERMISSION_FIELDS

def require_admin(request):
    e = current_employee(request)
    if not e:
        return None, Response({"detail":"กรุณาเข้าสู่ระบบ"}, status=401)
    if not permissions_for(e).get("can_manage_roles"):
        return None, Response({"detail":"คุณไม่มีสิทธิ์จัดการ Role"}, status=403)
    return e, None

def role_json(r):
    return {
        "id": str(r.id), "role_name": r.role_name,
        "display_name": r.display_name, "active": r.active,
        "permissions": {f: bool(getattr(r,f)) for f in PERMISSION_FIELDS},
    }

@api_view(["GET"])
@permission_classes([AllowAny])
def roles(request):
    _, err = require_admin(request)
    if err: return err
    return Response({"results":[role_json(r) for r in RoleAccess.objects.all()]})

@csrf_exempt
@api_view(["PATCH"])
@permission_classes([AllowAny])
def update_role(request, pk):
    _, err = require_admin(request)
    if err: return err
    r = RoleAccess.objects.filter(pk=pk).first()
    if not r: return Response({"detail":"ไม่พบ Role"}, status=404)
    perms = request.data.get("permissions") or {}
    for f in PERMISSION_FIELDS:
        if f in perms: setattr(r,f,bool(perms[f]))
    r.save()
    return Response(role_json(r))

@api_view(["GET"])
@permission_classes([AllowAny])
def employees(request):
    _, err = require_admin(request)
    if err: return err
    qs = Employee.objects.all().order_by("employee_code")[:300]
    return Response({"results":[{
        "id":str(e.id),"employee_code":e.employee_code,"name":e.name,
        "department":e.department or "","role":e.role or "","active":e.active
    } for e in qs]})

@csrf_exempt
@api_view(["PATCH"])
@permission_classes([AllowAny])
def update_employee_role(request, pk):
    _, err = require_admin(request)
    if err: return err
    e = Employee.objects.filter(pk=pk).first()
    if not e: return Response({"detail":"ไม่พบพนักงาน"}, status=404)
    role = str(request.data.get("role","")).strip()
    if not RoleAccess.objects.filter(role_name__iexact=role, active=True).exists():
        return Response({"detail":"Role นี้ยังไม่มีใน Role Settings"}, status=400)
    e.role = role
    e.save(update_fields=["role"])
    return Response({"employee":{"id":str(e.id),"employee_code":e.employee_code,"name":e.name,"role":e.role}})

from rest_framework.permissions import BasePermission

from .auth_api import current_employee, permissions_for


URL_PERMISSION = {
    "web-dashboard": "can_view_dashboard",
    "web-parts-list": "can_view_parts",
    "web-part-detail": "can_view_parts",
    "web-inventory-list": "can_view_parts",
    "web-suppliers-list": "can_view_suppliers",
    "web-machines-list": "can_view_machines",
}


class EmployeeModulePermission(BasePermission):
    message = "คุณไม่มีสิทธิ์ใช้งานส่วนนี้"

    def has_permission(self, request, view):
        employee = current_employee(request)

        if not employee:
            self.message = "กรุณาเข้าสู่ระบบ"
            return False

        resolver_match = getattr(request, "resolver_match", None)
        url_name = resolver_match.url_name if resolver_match else None

        required_permission = URL_PERMISSION.get(url_name)

        if not required_permission:
            return True

        permissions = permissions_for(employee)

        return bool(permissions.get(required_permission))
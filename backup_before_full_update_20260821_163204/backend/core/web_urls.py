from django.urls import path

from . import auth_api, dashboard_api, role_api, stock_api, web_api

urlpatterns = [
    path("auth/login/", auth_api.login_view),
    path("auth/me/", auth_api.me_view),
    path("auth/logout/", auth_api.logout_view),

    path("roles/", role_api.roles),
    path("roles/<uuid:pk>/", role_api.update_role),
    path("employees/", role_api.employees),
    path("employees/<uuid:pk>/role/", role_api.update_employee_role),

    path("dashboard/", dashboard_api.dashboard, name="web-dashboard"),
    path("stock/issue/", stock_api.issue_stock, name="web-stock-issue"),
    path("stock/receive/", stock_api.receive_stock, name="web-stock-receive"),

    path("parts/", web_api.parts_list, name="web-parts-list"),
    path("parts/<uuid:pk>/", web_api.part_detail, name="web-part-detail"),
    path("inventory/", web_api.inventory_list, name="web-inventory-list"),
    path("suppliers/", web_api.suppliers_list, name="web-suppliers-list"),
    path("machines/", web_api.machines_list, name="web-machines-list"),
]

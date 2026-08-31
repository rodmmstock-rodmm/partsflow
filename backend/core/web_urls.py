from django.urls import path

from . import appsheet_api, auth_api, dashboard_api, drive_oauth, fast_order_api, gmail_oauth, order_api, order_audit_api, production_check_api, rfq_api, role_api, spare_set_api, stock_api, web_api

urlpatterns = [
    path("auth/login/", auth_api.login_view),
    path("auth/me/", auth_api.me_view),
    path("auth/logout/", auth_api.logout_view),

    path("production-check/", production_check_api.production_check, name="production-check"),
    path("production-repair/", production_check_api.production_repair, name="production-repair"),
    path("production-session-check/", production_check_api.production_session_check, name="production-session-check"),

    path("drive/oauth/status/", drive_oauth.oauth_status, name="drive-oauth-status"),
    path("drive/oauth/start/", drive_oauth.oauth_start, name="drive-oauth-start"),
    path("drive/oauth/callback/", drive_oauth.oauth_callback, name="drive-oauth-callback"),

    path("gmail/oauth/status/", gmail_oauth.oauth_status, name="gmail-oauth-status"),
    path("gmail/oauth/start/", gmail_oauth.oauth_start, name="gmail-oauth-start"),
    path("gmail/oauth/callback/", gmail_oauth.oauth_callback, name="gmail-oauth-callback"),

    path("dashboard/", dashboard_api.dashboard, name="web-dashboard"),

    path("parts/", web_api.parts_list, name="web-parts-list"),
    path("parts/<uuid:pk>/", web_api.part_detail, name="web-part-detail"),
    path("parts/<uuid:pk>/image/", web_api.part_image, name="web-part-image"),
    path("inventory/", web_api.inventory_list, name="web-inventory-list"),
    path("safety-stock/", web_api.safety_stock, name="web-safety-stock"),
    path("spare-sets/", spare_set_api.spare_sets, name="web-spare-sets"),
    path("spare-sets/<uuid:pk>/", spare_set_api.spare_set_detail, name="web-spare-set-detail"),
    path("options/", web_api.options, name="web-options"),

    path("stock/issue/", stock_api.issue_stock, name="web-stock-issue"),
    path("stock/receive/", stock_api.receive_stock, name="web-stock-receive"),
    path("stock/adjust/", stock_api.adjust_stock, name="web-stock-adjust"),
    path("history/", stock_api.history_list, name="web-history"),
    path("history/<uuid:pk>/", stock_api.history_update, name="web-history-update"),
    path("history/<uuid:pk>/delete/", stock_api.history_delete, name="web-history-delete"),

    path("suppliers/", web_api.suppliers_list, name="web-suppliers-list"),
    path("suppliers/<uuid:pk>/", web_api.supplier_detail, name="web-suppliers-detail"),
    path("machines/", web_api.machines_list, name="web-machines-list"),
    path("machines/<uuid:pk>/", web_api.machine_detail, name="web-machine-detail"),

    path("fast-orders/", fast_order_api.fast_orders, name="web-fast-orders"),
    path("fast-orders/<uuid:pk>/", fast_order_api.fast_order_detail, name="web-fast-order-detail"),
    path("fast-orders/<uuid:pk>/order/", fast_order_api.fast_order_create_normal, name="web-fast-order-create-normal"),

    path("appsheet/health/", appsheet_api.appsheet_health, name="appsheet-health"),
    path("appsheet/parts/", appsheet_api.appsheet_parts, name="appsheet-parts"),
    path("appsheet/stock/", appsheet_api.appsheet_stock, name="appsheet-stock"),

    path("orders/", order_audit_api.orders, name="web-orders"),
    path("orders/batch/", order_api.create_orders_batch, name="web-orders-batch"),
    path("orders/detail-by-number/<str:order_number>/", order_audit_api.order_detail_by_number, name="web-order-detail-by-number"),
    path("orders/<uuid:pk>/", order_api.order_detail, name="web-order-detail"),
    path("orders/<uuid:pk>/info/", order_audit_api.update_order_info, name="web-order-info"),
    path("orders/<uuid:pk>/purchase/", order_audit_api.update_purchase_info, name="web-order-purchase"),
    path("orders/<uuid:pk>/receive/", order_audit_api.receive_order, name="web-order-receive"),
    path("orders/<uuid:pk>/wait-confirm/", order_audit_api.wait_confirm_order, name="web-order-wait-confirm"),
    path("orders/<uuid:pk>/cancel/", order_audit_api.cancel_order, name="web-order-cancel"),
    path("orders/<uuid:pk>/delete/", order_api.delete_order, name="web-order-delete"),
    path("orders/<uuid:pk>/update-data/", order_audit_api.update_edit_data, name="web-order-update-data"),
    path("orders/<uuid:pk>/usage/", order_audit_api.update_usage, name="web-order-usage"),
    path("order-projects/", order_api.projects, name="web-order-projects"),
    path("order-projects/<uuid:pk>/", order_api.project_detail, name="web-order-project-detail"),
    path("order-projects/<uuid:pk>/steps/", order_api.create_project_step, name="web-order-project-step-add"),
    path("order-projects/<uuid:pk>/steps/<uuid:step_pk>/", order_api.delete_project_step, name="web-order-project-step-delete"),
    path("order-projects/<uuid:pk>/steps/<uuid:step_pk>/orders/", order_api.create_project_order, name="web-order-project-step-order-add"),
    path("order-projects/<uuid:pk>/steps/<uuid:step_pk>/import/", order_api.import_project_step, name="web-order-project-step-import"),

    path("rfqs/preview/", rfq_api.rfq_preview, name="web-rfq-preview"),
    path("rfqs/send/", rfq_api.send_rfq, name="web-rfq-send"),
    path("rfqs/", rfq_api.rfq_list, name="web-rfq-list"),
    path("rfqs/<uuid:pk>/vendor/", rfq_api.rfq_vendor, name="web-rfq-vendor"),
    path("rfqs/<uuid:pk>/follow-up/", rfq_api.follow_up, name="web-rfq-follow-up"),
    path("rfqs/<uuid:pk>/sync/", rfq_api.sync_rfq_thread, name="web-rfq-sync"),
    path("po-balances/", rfq_api.po_balance_list, name="web-po-balance-list"),
    path("po-balances/<uuid:pk>/", rfq_api.po_balance_detail, name="web-po-balance-detail"),
    path("rfq-attachments/<uuid:pk>/download/", rfq_api.download_attachment, name="web-rfq-attachment-download"),
    path("rfq-cc-rules/", rfq_api.cc_rules, name="web-rfq-cc-rules"),
    path("rfq-cc-rules/<uuid:pk>/", rfq_api.cc_rule_detail, name="web-rfq-cc-rule-detail"),

    path("roles/", role_api.roles, name="web-roles"),
    path("roles/<uuid:pk>/", role_api.update_role, name="web-role-update"),
    path("employees/", role_api.employees, name="web-employees"),
    path("employees/<uuid:pk>/", role_api.update_employee, name="web-employee-update"),
    path("audit-logs/", role_api.audit_logs, name="web-audit-logs"),
]

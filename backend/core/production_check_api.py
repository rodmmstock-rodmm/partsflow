from io import StringIO

from django.core.management import call_command
from django.db import connection
from django.db.migrations.recorder import MigrationRecorder
from django.conf import settings
from django.http import JsonResponse
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .models import OrderRecord


SOURCE = "EXCEL_ORDER_2026"
REPAIR_KEY = "pf-repair-20260829-6c5f19b23f9e4e64b54f4f25"
MIGRATION_0014 = "0014_import_excel_orders_2026"
MIGRATION_0015 = "0015_order_visibility_and_date_permissions"
MIGRATION_0016 = "0016_rfq_po_balance_email_workflow"
ROLE_ACCESS_TABLE = "core_roleaccess"
EMPLOYEE_TABLE = "core_employee"
REQUIRED_PERMISSION_COLUMNS = {
    "can_view_order_updates",
    "can_edit_order_date",
}
REQUIRED_RFQ_TABLES = {
    "core_integrationcredential",
    "core_orderrfq",
    "core_orderrfqitem",
    "core_pobalance",
    "core_rfqattachment",
    "core_rfqccrule",
    "core_rfqmessage",
    "core_vendoremailidentity",
}


def _migration_applied(name):
    return MigrationRecorder(connection).migration_qs.filter(
        app="core",
        name=name,
    ).exists()


def _role_access_columns():
    with connection.cursor() as cursor:
        description = connection.introspection.get_table_description(
            cursor,
            ROLE_ACCESS_TABLE,
        )
    return {column.name for column in description}


def _table_columns(table_name):
    with connection.cursor() as cursor:
        description = connection.introspection.get_table_description(
            cursor,
            table_name,
        )
    return {column.name for column in description}


def _snapshot():
    columns = _role_access_columns()
    tables = set(connection.introspection.table_names())
    employee_columns = _table_columns(EMPLOYEE_TABLE)
    imported = OrderRecord.objects.filter(legacy_source=SOURCE)
    all_orders = OrderRecord.objects.all()
    return {
        "ok": True,
        "database_vendor": connection.vendor,
        "order_count": all_orders.count(),
        "imported_order_count": imported.count(),
        "migration_0014_applied": _migration_applied(MIGRATION_0014),
        "migration_0015_applied": _migration_applied(MIGRATION_0015),
        "migration_0016_applied": _migration_applied(MIGRATION_0016),
        "permission_columns_present": REQUIRED_PERMISSION_COLUMNS.issubset(columns),
        "missing_permission_columns": sorted(
            REQUIRED_PERMISSION_COLUMNS - columns
        ),
        "employee_email_present": "email" in employee_columns,
        "rfq_tables_present": REQUIRED_RFQ_TABLES.issubset(tables),
        "missing_rfq_tables": sorted(REQUIRED_RFQ_TABLES - tables),
    }


@api_view(["GET"])
@permission_classes([AllowAny])
def production_check(request):
    try:
        return Response(_snapshot())
    except Exception as exc:
        return Response(
            {
                "ok": False,
                "error": "snapshot_failed",
                "error_type": type(exc).__name__,
            },
            status=500,
        )


@api_view(["POST"])
@permission_classes([AllowAny])
def production_repair(request):
    if request.headers.get("X-PartsFlow-Repair-Key", "") != REPAIR_KEY:
        return Response({"ok": False, "error": "forbidden"}, status=403)

    try:
        before = _snapshot()
    except Exception as exc:
        return Response(
            {
                "ok": False,
                "error": "snapshot_failed",
                "error_type": type(exc).__name__,
                "detail": str(exc),
            },
            status=500,
        )

    core_schema_ready = (
        before["migration_0015_applied"]
        and before["permission_columns_present"]
    )
    rfq_schema_ready = (
        before["migration_0016_applied"]
        and before["employee_email_present"]
        and before["rfq_tables_present"]
    )
    if core_schema_ready and rfq_schema_ready:
        return Response(
            {
                "ok": True,
                "already_repaired": True,
                "before": before,
                "after": before,
            }
        )

    precondition_errors = []
    if before["database_vendor"] != "postgresql":
        precondition_errors.append("database_not_postgresql")
    if not before["migration_0014_applied"]:
        precondition_errors.append("migration_0014_not_applied")
    if before["imported_order_count"] != 4107:
        precondition_errors.append("unexpected_imported_order_count")
    if before["migration_0015_applied"] and not before["permission_columns_present"]:
        precondition_errors.append("migration_0015_recorded_without_columns")
    if not before["migration_0015_applied"] and before["permission_columns_present"]:
        precondition_errors.append("permission_columns_exist_without_migration")
    if not core_schema_ready and len(before["missing_permission_columns"]) not in {
        0,
        len(REQUIRED_PERMISSION_COLUMNS),
    }:
        precondition_errors.append("partial_permission_schema")
    if before["migration_0016_applied"] and not rfq_schema_ready:
        precondition_errors.append("migration_0016_recorded_without_schema")
    present_rfq_tables = REQUIRED_RFQ_TABLES - set(before["missing_rfq_tables"])
    if not before["migration_0016_applied"] and (
        before["employee_email_present"] or present_rfq_tables
    ):
        precondition_errors.append("partial_rfq_schema")

    if precondition_errors:
        return Response(
            {
                "ok": False,
                "error": "repair_precondition_failed",
                "precondition_errors": precondition_errors,
                "before": before,
            },
            status=409,
        )

    stdout = StringIO()
    stderr = StringIO()
    try:
        call_command(
            "migrate",
            "core",
            MIGRATION_0016,
            interactive=False,
            verbosity=1,
            stdout=stdout,
            stderr=stderr,
        )
        after = _snapshot()
        if not (
            after["migration_0014_applied"]
            and after["migration_0015_applied"]
            and after["migration_0016_applied"]
            and after["permission_columns_present"]
            and after["employee_email_present"]
            and after["rfq_tables_present"]
            and after["order_count"] == before["order_count"]
            and after["imported_order_count"] == 4107
        ):
            return Response(
                {
                    "ok": False,
                    "error": "migration_finished_but_verification_failed",
                    "before": before,
                    "after": after,
                    "stdout": stdout.getvalue()[-8000:],
                    "stderr": stderr.getvalue()[-8000:],
                },
                status=500,
            )
        return Response(
            {
                "ok": True,
                "before": before,
                "after": after,
                "stdout": stdout.getvalue()[-8000:],
                "stderr": stderr.getvalue()[-8000:],
            }
        )
    except Exception as exc:
        return Response(
            {
                "ok": False,
                "error_type": type(exc).__name__,
                "error": str(exc),
                "before": before,
                "stdout": stdout.getvalue()[-8000:],
                "stderr": stderr.getvalue()[-8000:],
            },
            status=500,
        )


def production_session_check(request):
    result = {
        "ok": True,
        "session_cookie_present": bool(
            request.COOKIES.get(settings.SESSION_COOKIE_NAME)
        ),
    }

    try:
        keys = set(request.session.keys())
        result.update(
            {
                "session_load_ok": True,
                "has_employee_session": "partsflow_employee_id" in keys,
                "has_django_auth_session": "_auth_user_id" in keys,
                "has_auth_backend": "_auth_user_backend" in keys,
                "has_auth_hash": "_auth_user_hash" in keys,
            }
        )
    except Exception as exc:
        result.update(
            {
                "ok": False,
                "session_load_ok": False,
                "session_error_type": type(exc).__name__,
                "session_error": str(exc),
            }
        )
        return JsonResponse(result, status=200)

    try:
        user = request.user
        result.update(
            {
                "django_user_load_ok": True,
                "django_user_authenticated": bool(user.is_authenticated),
            }
        )
    except Exception as exc:
        result.update(
            {
                "ok": False,
                "django_user_load_ok": False,
                "django_user_error_type": type(exc).__name__,
                "django_user_error": str(exc),
            }
        )

    return JsonResponse(result, status=200)

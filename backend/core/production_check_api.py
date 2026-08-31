from io import StringIO

from django.core.management import call_command
from django.db import connection
from django.db.migrations.recorder import MigrationRecorder
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .models import OrderRecord


SOURCE = "EXCEL_ORDER_2026"
REPAIR_KEY = "pf-repair-20260829-6c5f19b23f9e4e64b54f4f25"
MIGRATION_0014 = "0014_import_excel_orders_2026"
MIGRATION_0015 = "0015_order_visibility_and_date_permissions"
ROLE_ACCESS_TABLE = "core_roleaccess"
REQUIRED_PERMISSION_COLUMNS = {
    "can_view_order_updates",
    "can_edit_order_date",
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


def _snapshot():
    columns = _role_access_columns()
    imported = OrderRecord.objects.filter(legacy_source=SOURCE)
    all_orders = OrderRecord.objects.all()
    return {
        "ok": True,
        "database_vendor": connection.vendor,
        "order_count": all_orders.count(),
        "imported_order_count": imported.count(),
        "migration_0014_applied": _migration_applied(MIGRATION_0014),
        "migration_0015_applied": _migration_applied(MIGRATION_0015),
        "permission_columns_present": REQUIRED_PERMISSION_COLUMNS.issubset(columns),
        "missing_permission_columns": sorted(
            REQUIRED_PERMISSION_COLUMNS - columns
        ),
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

    if (
        before["migration_0015_applied"]
        and before["permission_columns_present"]
    ):
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
    if before["migration_0015_applied"]:
        precondition_errors.append("migration_0015_recorded_without_columns")
    if before["permission_columns_present"]:
        precondition_errors.append("permission_columns_exist_without_migration")
    if len(before["missing_permission_columns"]) != len(
        REQUIRED_PERMISSION_COLUMNS
    ):
        precondition_errors.append("partial_permission_schema")

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
            MIGRATION_0015,
            interactive=False,
            verbosity=1,
            stdout=stdout,
            stderr=stderr,
        )
        after = _snapshot()
        if not (
            after["migration_0014_applied"]
            and after["migration_0015_applied"]
            and after["permission_columns_present"]
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

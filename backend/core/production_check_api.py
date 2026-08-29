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
MIGRATION_NAME = "0014_import_excel_orders_2026"


def _snapshot():
    imported = OrderRecord.objects.filter(legacy_source=SOURCE)
    all_orders = OrderRecord.objects.all()
    applied = MigrationRecorder(connection).migration_qs.filter(
        app="core",
        name=MIGRATION_NAME,
    ).exists()
    first = imported.order_by("order_date", "order_number").first()
    last = imported.order_by("-order_date", "-order_number").first()
    return {
        "ok": True,
        "database_vendor": connection.vendor,
        "order_count": all_orders.count(),
        "imported_order_count": imported.count(),
        "migration_0014_applied": applied,
        "first_imported_order": first.order_number if first else None,
        "last_imported_order": last.order_number if last else None,
    }


@api_view(["GET"])
@permission_classes([AllowAny])
def production_check(request):
    return Response(_snapshot())


@api_view(["POST"])
@permission_classes([AllowAny])
def production_repair(request):
    if request.headers.get("X-PartsFlow-Repair-Key", "") != REPAIR_KEY:
        return Response({"ok": False, "error": "forbidden"}, status=403)

    before = _snapshot()
    if before["migration_0014_applied"] and before["imported_order_count"] == 4107:
        return Response({"ok": True, "already_repaired": True, "before": before, "after": before})

    stdout = StringIO()
    stderr = StringIO()
    try:
        call_command(
            "migrate",
            "core",
            MIGRATION_NAME,
            interactive=False,
            verbosity=1,
            stdout=stdout,
            stderr=stderr,
        )
        after = _snapshot()
        if not after["migration_0014_applied"] or after["imported_order_count"] != 4107:
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

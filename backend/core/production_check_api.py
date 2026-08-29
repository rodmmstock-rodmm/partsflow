from io import StringIO

from django.core.management import call_command
from django.db import connection
from django.db.migrations.recorder import MigrationRecorder
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .models import OrderRecord


SOURCE = "EXCEL_ORDER_2026"
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
    before = _snapshot()

    # This endpoint is intentionally one-shot and safe to expose only while
    # repairing the known production incident. It refuses to touch any DB that
    # already contains Orders or already records migration 0014 as applied.
    if not (
        before["order_count"] == 0
        and before["imported_order_count"] == 0
        and before["migration_0014_applied"] is False
    ):
        return Response(
            {
                "ok": False,
                "error": "repair_precondition_failed",
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

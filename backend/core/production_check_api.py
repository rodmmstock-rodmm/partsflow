from django.db import connection
from django.db.migrations.recorder import MigrationRecorder
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .models import OrderRecord


@api_view(["GET"])
@permission_classes([AllowAny])
def production_check(request):
    imported = OrderRecord.objects.filter(legacy_source="EXCEL_ORDER_2026")
    all_orders = OrderRecord.objects.all()
    applied = MigrationRecorder(connection).migration_qs.filter(
        app="core",
        name="0014_import_excel_orders_2026",
    ).exists()

    first = imported.order_by("order_date", "order_number").first()
    last = imported.order_by("-order_date", "-order_number").first()

    return Response(
        {
            "ok": True,
            "database_vendor": connection.vendor,
            "order_count": all_orders.count(),
            "imported_order_count": imported.count(),
            "migration_0014_applied": applied,
            "first_imported_order": first.order_number if first else None,
            "last_imported_order": last.order_number if last else None,
        }
    )

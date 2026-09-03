from decimal import Decimal

from django.db.models import DecimalField, Sum, Value
from django.db.models.functions import Coalesce
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .auth_api import require_permission
from .models import OrderRecord, Part

QTY_FIELD = DecimalField(max_digits=18, decimal_places=2)


@api_view(["GET"])
@permission_classes([AllowAny])
def dashboard(request):
    _, err = require_permission(request, "can_view_dashboard")
    if err:
        return err
    parts = list(
        Part.objects.filter(active=True)
        .annotate(
            stock_qty=Coalesce(
                Sum("inventory__quantity"), Value(Decimal("0")), output_field=QTY_FIELD
            )
        )
        .values("id", "min_stock", "stock_qty")
    )
    open_part_ids = set(
        OrderRecord.objects.filter(
            is_deleted=False,
            procurement_phase=OrderRecord.PROCUREMENT_PURCHASE,
            lifecycle_status__in=[
                OrderRecord.LIFECYCLE_ACTIVE,
                OrderRecord.LIFECYCLE_WAIT_CONFIRM,
            ],
        )
        .exclude(part_id=None)
        .values_list("part_id", flat=True)
    )
    low_not_ordered = 0
    low_ordered = 0
    for row in parts:
        if Decimal(str(row["min_stock"] or 0)) <= 0:
            continue
        if Decimal(str(row["stock_qty"] or 0)) < Decimal(str(row["min_stock"] or 0)):
            if row["id"] in open_part_ids:
                low_ordered += 1
            else:
                low_not_ordered += 1
    return Response(
        {
            "kpi": {
                "parts": len(parts),
                "safety_stock": low_not_ordered,
                "safety_stock_ordered": low_ordered,
            }
        }
    )

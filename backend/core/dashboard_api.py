from decimal import Decimal

from django.db.models import DecimalField, Exists, F, OuterRef, Subquery, Sum, Value
from django.db.models.functions import Coalesce
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .auth_api import require_permission
from .models import Inventory, OrderRecord, Part

QTY_FIELD = DecimalField(max_digits=18, decimal_places=2)


@api_view(["GET"])
@permission_classes([AllowAny])
def dashboard(request):
    _, err = require_permission(request, "can_view_dashboard")
    if err:
        return err

    # Keep the calculation in Postgres. The previous implementation sent every
    # active Part row to Render and counted it in Python, which multiplied DB
    # egress on every dashboard refresh.
    inventory_total = (
        Inventory.objects.filter(part_id=OuterRef("pk"))
        .order_by()
        .values("part_id")
        .annotate(total=Sum("quantity"))
        .values("total")[:1]
    )
    active_order = OrderRecord.objects.filter(
        part_id=OuterRef("pk"),
        is_deleted=False,
        procurement_phase=OrderRecord.PROCUREMENT_PURCHASE,
        lifecycle_status__in=[
            OrderRecord.LIFECYCLE_ACTIVE,
            OrderRecord.LIFECYCLE_WAIT_CONFIRM,
        ],
    )
    low_parts = (
        Part.objects.filter(active=True, min_stock__gt=0)
        .exclude(sku__istartswith="N")
        .annotate(
            stock_qty=Coalesce(
                Subquery(inventory_total, output_field=QTY_FIELD),
                Value(Decimal("0")),
                output_field=QTY_FIELD,
            ),
            active_ordering=Exists(active_order),
        )
        .filter(stock_qty__lt=F("min_stock"))
    )

    return Response(
        {
            "kpi": {
                "parts": Part.objects.filter(active=True).count(),
                "safety_stock": low_parts.filter(active_ordering=False).count(),
                "safety_stock_ordered": low_parts.filter(active_ordering=True).count(),
            }
        }
    )


@api_view(["GET"])
@permission_classes([AllowAny])
def notification_summary(request):
    """Lightweight counts for the header notification bell. Deliberately
    reuses the same safety-stock query as the main dashboard KPI (no new
    query shape) and adds a count of Order Steps waiting for this
    employee's confirmation - either because they hold
    can_manage_order_projects, or because their department matches the
    Step's Project (same rule used by the Confirm Step feature itself).
    """
    employee, err = require_permission(request)
    if err:
        return err

    inventory_total = (
        Inventory.objects.filter(part_id=OuterRef("pk"))
        .order_by()
        .values("part_id")
        .annotate(total=Sum("quantity"))
        .values("total")[:1]
    )
    active_order = OrderRecord.objects.filter(
        part_id=OuterRef("pk"),
        is_deleted=False,
        procurement_phase=OrderRecord.PROCUREMENT_PURCHASE,
        lifecycle_status__in=[
            OrderRecord.LIFECYCLE_ACTIVE,
            OrderRecord.LIFECYCLE_WAIT_CONFIRM,
        ],
    )
    safety_stock = (
        Part.objects.filter(active=True, min_stock__gt=0)
        .exclude(sku__istartswith="N")
        .annotate(
            stock_qty=Coalesce(
                Subquery(inventory_total, output_field=QTY_FIELD),
                Value(Decimal("0")),
                output_field=QTY_FIELD,
            ),
            active_ordering=Exists(active_order),
        )
        .filter(stock_qty__lt=F("min_stock"), active_ordering=False)
        .count()
    )

    from .auth_api import permissions_for
    from .models import OrderStep

    steps = OrderStep.objects.filter(status=OrderStep.STATUS_WAIT_CONFIRM)
    perms = permissions_for(employee)
    if not (
        perms.get("can_manage_order_projects")
        or perms.get("can_confirm_order_step")
    ):
        wait_confirm_steps = 0
    elif perms.get("can_manage_order_projects"):
        wait_confirm_steps = steps.count()
    elif employee.department:
        wait_confirm_steps = steps.filter(
            project__department__iexact=employee.department.strip()
        ).count()
    else:
        wait_confirm_steps = 0

    return Response(
        {
            "safety_stock": safety_stock,
            "wait_confirm_steps": wait_confirm_steps,
        }
    )

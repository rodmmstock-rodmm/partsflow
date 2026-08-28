from decimal import Decimal

from django.db.models import (
    Count,
    DecimalField,
    ExpressionWrapper,
    F,
    Q,
    Sum,
    Value,
)
from django.db.models.functions import Coalesce
from django.shortcuts import get_object_or_404

from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from .models import Inventory, Machine, Part, StockTransaction, Supplier
from .web_permissions import EmployeeModulePermission

from .web_serializers import (
    InventorySerializer,
    MachineSerializer,
    PartDetailSerializer,
    PartListSerializer,
    StockTransactionSerializer,
    SupplierSerializer,
)


MONEY_FIELD = DecimalField(max_digits=20, decimal_places=4)
QTY_FIELD = DecimalField(max_digits=18, decimal_places=2)


def _int_param(request, name, default, minimum=1, maximum=100):
    try:
        value = int(request.GET.get(name, default))
    except (TypeError, ValueError):
        value = default
    return max(minimum, min(maximum, value))


def _paginate(request, queryset, serializer_class):
    page = _int_param(request, "page", 1, 1, 1000000)
    page_size = _int_param(request, "page_size", 25, 1, 100)
    count = queryset.count()
    start = (page - 1) * page_size
    end = start + page_size

    return Response(
        {
            "count": count,
            "page": page,
            "page_size": page_size,
            "results": serializer_class(queryset[start:end], many=True).data,
        }
    )


@api_view(["GET"])
@permission_classes([EmployeeModulePermission])
def dashboard(request):
    active_parts = Part.objects.filter(active=True)
    active_machines = Machine.objects.filter(active=True)
    active_suppliers = Supplier.objects.filter(active=True)

    low_stock = (
        Inventory.objects.filter(
            part__active=True,
            part__min_stock__gt=0,
            quantity__lte=F("part__min_stock"),
        )
        .values("part_id")
        .distinct()
        .count()
    )

    out_of_stock = (
        Inventory.objects.filter(part__active=True, quantity__lte=0)
        .values("part_id")
        .distinct()
        .count()
    )

    inventory_totals = Inventory.objects.aggregate(
        total_qty=Coalesce(Sum("quantity"), Value(Decimal("0")), output_field=QTY_FIELD),
        stock_value=Coalesce(
            Sum(
                ExpressionWrapper(
                    F("quantity") * F("part__last_purchase_price"),
                    output_field=MONEY_FIELD,
                )
            ),
            Value(Decimal("0")),
            output_field=MONEY_FIELD,
        ),
    )

    recent_qs = (
        StockTransaction.objects.select_related(
            "part", "machine", "employee", "location"
        )
        .order_by("-transaction_date")[:8]
    )

    return Response(
        {
            "kpi": {
                "parts": active_parts.count(),
                "machines": active_machines.count(),
                "suppliers": active_suppliers.count(),
                "low_stock": low_stock,
                "out_of_stock": out_of_stock,
                "total_stock_qty": inventory_totals["total_qty"],
                "stock_value": inventory_totals["stock_value"],
            },
            "recent_transactions": StockTransactionSerializer(
                recent_qs, many=True
            ).data,
        }
    )


@api_view(["GET"])
@permission_classes([EmployeeModulePermission])
def parts_list(request):
    q = request.GET.get("q", "").strip()
    status = request.GET.get("status", "").strip().lower()
    ordering = request.GET.get("ordering", "sku").strip()

    qs = (
        Part.objects.select_related(
            "maker", "unit", "default_supplier", "location"
        )
        .annotate(
            stock_qty=Coalesce(
                Sum("inventory__quantity"),
                Value(Decimal("0")),
                output_field=QTY_FIELD,
            )
        )
    )

    if q:
        qs = qs.filter(
            Q(sku__icontains=q)
            | Q(name__icontains=q)
            | Q(description__icontains=q)
            | Q(maker__name__icontains=q)
            | Q(default_supplier__name__icontains=q)
        )

    if status == "low":
        qs = qs.filter(min_stock__gt=0, stock_qty__lte=F("min_stock"))
    elif status == "out":
        qs = qs.filter(stock_qty__lte=0)
    elif status == "critical":
        qs = qs.filter(critical=True)

    allowed_ordering = {
        "sku",
        "-sku",
        "name",
        "-name",
        "stock_qty",
        "-stock_qty",
        "last_purchase_price",
        "-last_purchase_price",
    }
    if ordering not in allowed_ordering:
        ordering = "sku"

    qs = qs.order_by(ordering)
    return _paginate(request, qs, PartListSerializer)


@api_view(["GET"])
@permission_classes([EmployeeModulePermission])
def part_detail(request, pk):
    qs = (
        Part.objects.select_related(
            "maker", "unit", "default_supplier", "location"
        )
        .annotate(
            stock_qty=Coalesce(
                Sum("inventory__quantity"),
                Value(Decimal("0")),
                output_field=QTY_FIELD,
            )
        )
    )
    part = get_object_or_404(qs, pk=pk)
    return Response(PartDetailSerializer(part).data)


@api_view(["GET"])
@permission_classes([EmployeeModulePermission])
def inventory_list(request):
    q = request.GET.get("q", "").strip()
    status = request.GET.get("status", "").strip().lower()

    qs = Inventory.objects.select_related(
        "part", "part__unit", "location"
    )

    if q:
        qs = qs.filter(
            Q(part__sku__icontains=q)
            | Q(part__name__icontains=q)
            | Q(location__code__icontains=q)
        )

    if status == "low":
        qs = qs.filter(part__min_stock__gt=0, quantity__lte=F("part__min_stock"))
    elif status == "out":
        qs = qs.filter(quantity__lte=0)

    qs = qs.order_by("part__sku", "location__code")
    return _paginate(request, qs, InventorySerializer)


@api_view(["GET"])
@permission_classes([EmployeeModulePermission])
def suppliers_list(request):
    q = request.GET.get("q", "").strip()
    qs = Supplier.objects.all()

    if q:
        qs = qs.filter(
            Q(code__icontains=q)
            | Q(name__icontains=q)
            | Q(contact__icontains=q)
            | Q(email__icontains=q)
        )

    qs = qs.order_by("name")
    return _paginate(request, qs, SupplierSerializer)


@api_view(["GET"])
@permission_classes([EmployeeModulePermission])
def machines_list(request):
    q = request.GET.get("q", "").strip()

    qs = Machine.objects.prefetch_related("codes")

    if q:
        qs = qs.filter(
            Q(code__icontains=q)
            | Q(name__icontains=q)
            | Q(codes__code__icontains=q)
        ).distinct()

    qs = qs.order_by("code")
    return _paginate(request, qs, MachineSerializer)

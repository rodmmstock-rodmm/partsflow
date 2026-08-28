from rest_framework import serializers

from .models import (
    Inventory,
    Machine,
    MachineCode,
    Part,
    StockTransaction,
    Supplier,
)


class PartListSerializer(serializers.ModelSerializer):
    maker = serializers.CharField(source="maker.name", allow_null=True, read_only=True)
    unit = serializers.CharField(source="unit.code", allow_null=True, read_only=True)
    supplier = serializers.CharField(
        source="default_supplier.name", allow_null=True, read_only=True
    )
    location = serializers.CharField(
        source="location.code", allow_null=True, read_only=True
    )
    stock_qty = serializers.DecimalField(
        max_digits=18, decimal_places=2, read_only=True
    )

    class Meta:
        model = Part
        fields = [
            "id",
            "sku",
            "name",
            "description",
            "maker",
            "unit",
            "supplier",
            "location",
            "stock_qty",
            "min_stock",
            "reorder_qty",
            "last_purchase_price",
            "critical",
            "active",
        ]


class PartDetailSerializer(PartListSerializer):
    machines = serializers.SerializerMethodField()

    class Meta(PartListSerializer.Meta):
        fields = PartListSerializer.Meta.fields + [
            "max_stock",
            "vendor_lead_time_days",
            "purchasing_lead_time_days",
            "total_lead_time_days",
            "remark",
            "image_path",
            "machines",
        ]

    def get_machines(self, obj):
        return [
            {
                "id": str(link.machine_id),
                "code": link.machine.code,
                "name": link.machine.name,
                "critical": link.is_critical,
                "position": link.position,
            }
            for link in obj.machine_links.select_related("machine").all()
        ]


class InventorySerializer(serializers.ModelSerializer):
    part_id = serializers.UUIDField(source="part.id", read_only=True)
    sku = serializers.CharField(source="part.sku", read_only=True)
    part_name = serializers.CharField(source="part.name", read_only=True)
    unit = serializers.CharField(source="part.unit.code", allow_null=True, read_only=True)
    min_stock = serializers.DecimalField(
        source="part.min_stock", max_digits=14, decimal_places=2, read_only=True
    )
    location = serializers.CharField(
        source="location.code", allow_null=True, read_only=True
    )

    class Meta:
        model = Inventory
        fields = [
            "id",
            "part_id",
            "sku",
            "part_name",
            "unit",
            "location",
            "quantity",
            "min_stock",
            "updated_at",
        ]


class SupplierSerializer(serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = [
            "id",
            "code",
            "name",
            "contact",
            "phone",
            "email",
            "lead_time_days",
            "active",
            "remark",
        ]


class MachineSerializer(serializers.ModelSerializer):
    aliases = serializers.SerializerMethodField()

    class Meta:
        model = Machine
        fields = [
            "id",
            "code",
            "name",
            "location",
            "machine_type",
            "active",
            "remark",
            "aliases",
        ]

    def get_aliases(self, obj):
        return list(
            obj.codes.exclude(code_type="CURRENT")
            .values("code", "code_type", "active")
            .order_by("code")
        )


class StockTransactionSerializer(serializers.ModelSerializer):
    sku = serializers.CharField(source="part.sku", read_only=True)
    part_name = serializers.CharField(source="part.name", read_only=True)
    machine = serializers.CharField(
        source="machine.code", allow_null=True, read_only=True
    )
    employee = serializers.CharField(
        source="employee.name", allow_null=True, read_only=True
    )
    location = serializers.CharField(
        source="location.code", allow_null=True, read_only=True
    )

    class Meta:
        model = StockTransaction
        fields = [
            "id",
            "transaction_no",
            "transaction_type",
            "transaction_date",
            "sku",
            "part_name",
            "quantity",
            "location",
            "machine",
            "employee",
            "remark",
        ]

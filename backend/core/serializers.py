import hashlib
import re
from decimal import Decimal

from django.db.models import DecimalField, Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework import serializers

from .drive_images import is_drive_relative_path
from .models import Part, StockTransaction
from .supabase_storage import public_image_url, storage_enabled


QTY_FIELD = DecimalField(max_digits=18, decimal_places=2)


PART_LIST_ONLY_FIELDS = (
    "id",
    "sku",
    "name",
    "description",
    "maker_id",
    "maker__id",
    "maker__name",
    "unit_id",
    "unit__id",
    "unit__code",
    "default_supplier_id",
    "default_supplier__id",
    "default_supplier__code",
    "default_supplier__name",
    "location_id",
    "location__id",
    "location__code",
    "location__warehouse",
    "image_path",
    "min_stock",
    "max_stock",
    "reorder_qty",
    "vendor_lead_time_days",
    "purchasing_lead_time_days",
    "total_lead_time_days",
    "last_purchase_price",
    "critical",
    "active",
    "remark",
)


STOCK_TRANSACTION_LIST_ONLY_FIELDS = (
    "id",
    "transaction_date",
    "transaction_type",
    "quantity",
    "remark",
    "is_void",
    "legacy_source",
    "part_id",
    "part__id",
    "part__sku",
    "part__name",
    "part__description",
    "part__maker_id",
    "part__maker__id",
    "part__maker__name",
    "part__unit_id",
    "part__unit__id",
    "part__unit__code",
    "part__location_id",
    "part__location__id",
    "part__location__code",
    "location_id",
    "location__id",
    "location__code",
    "machine_id",
    "machine__id",
    "machine__code",
    "employee_id",
    "employee__id",
    "employee__name",
    "recorded_by_employee_id",
    "recorded_by_employee__id",
    "recorded_by_employee__name",
    "created_by_id",
    "created_by__id",
    "created_by__username",
    "created_by__first_name",
    "created_by__last_name",
)


def transaction_type_group(value):
    value = (value or "").upper()
    if value in {"IN", "RECEIVE", "RETURN", "TRANSFER_IN"}:
        return "IN"
    if value in {"OUT", "ISSUE", "TRANSFER_OUT"}:
        return "OUT"
    return "ADJUSTMENT"


def transaction_recorder_name(transaction):
    if transaction.recorded_by_employee:
        return transaction.recorded_by_employee.name
    if transaction.created_by:
        return (
            transaction.created_by.get_full_name()
            or transaction.created_by.username
        )
    note = transaction.remark or ""
    for pattern in [
        r"RECORDED\s*BY\s*:\s*([^|;\n]+)",
        r"ผู้บันทึก\s*:\s*([^|;\n]+)",
    ]:
        match = re.search(pattern, note, re.IGNORECASE)
        if match:
            return match.group(1).strip()
    return ""


class PartListSerializer(serializers.ModelSerializer):
    """Compact Part representation used by paginated list endpoints."""

    maker_id = serializers.SerializerMethodField()
    maker_name = serializers.CharField(
        source="maker.name", read_only=True, default=""
    )
    unit_id = serializers.SerializerMethodField()
    unit_code = serializers.CharField(
        source="unit.code", read_only=True, default=""
    )
    supplier_id = serializers.SerializerMethodField()
    supplier_code = serializers.CharField(
        source="default_supplier.code", read_only=True, default=""
    )
    supplier_name = serializers.CharField(
        source="default_supplier.name", read_only=True, default=""
    )
    location_id = serializers.SerializerMethodField()
    location_code = serializers.CharField(
        source="location.code", read_only=True, default=""
    )
    warehouse = serializers.SerializerMethodField()
    warehouse_label = serializers.SerializerMethodField()
    image_url = serializers.SerializerMethodField()
    image_fallback_url = serializers.SerializerMethodField()
    image_source = serializers.SerializerMethodField()
    min_stock = serializers.FloatField(read_only=True)
    max_stock = serializers.FloatField(read_only=True)
    reorder_qty = serializers.FloatField(read_only=True)
    last_purchase_price = serializers.FloatField(read_only=True)
    stock_qty = serializers.SerializerMethodField()
    stock_status = serializers.SerializerMethodField()
    stock_status_label = serializers.SerializerMethodField()

    class Meta:
        model = Part
        fields = (
            "id",
            "sku",
            "name",
            "description",
            "maker_id",
            "maker_name",
            "unit_id",
            "unit_code",
            "supplier_id",
            "supplier_code",
            "supplier_name",
            "location_id",
            "location_code",
            "warehouse",
            "warehouse_label",
            "image_path",
            "image_url",
            "image_fallback_url",
            "image_source",
            "min_stock",
            "max_stock",
            "reorder_qty",
            "vendor_lead_time_days",
            "purchasing_lead_time_days",
            "total_lead_time_days",
            "last_purchase_price",
            "critical",
            "active",
            "remark",
            "stock_qty",
            "stock_status",
            "stock_status_label",
        )

    @staticmethod
    def get_maker_id(part):
        return str(part.maker_id) if part.maker_id else ""

    @staticmethod
    def get_unit_id(part):
        return str(part.unit_id) if part.unit_id else ""

    @staticmethod
    def get_supplier_id(part):
        return str(part.default_supplier_id) if part.default_supplier_id else ""

    @staticmethod
    def get_location_id(part):
        return str(part.location_id) if part.location_id else ""

    @staticmethod
    def get_warehouse(part):
        raw = ((part.location.warehouse if part.location else "") or "").strip().upper()
        if raw in {"MM-11", "PHASE11", "PHASE 11"}:
            return "MM-11"
        return "MM-4"

    def get_warehouse_label(self, part):
        return "Phase11" if self.get_warehouse(part) == "MM-11" else "Phase4"

    def _image_payload(self, part):
        cache = getattr(self, "_partsflow_image_cache", None)
        if cache is None:
            cache = self._partsflow_image_cache = {}
        if part.pk in cache:
            return cache[part.pk]

        raw = part.image_path or ""
        if not is_drive_relative_path(raw):
            payload = {
                "image_url": raw,
                "image_fallback_url": "",
                "image_source": "url" if raw else "",
            }
        else:
            version = hashlib.sha256(raw.strip().encode("utf-8")).hexdigest()[:16]
            drive_fallback = f"/api/parts/{part.id}/image/?v={version}"
            storage_url = public_image_url(raw) if storage_enabled() else ""
            payload = {
                "image_url": storage_url or drive_fallback,
                "image_fallback_url": drive_fallback if storage_url else "",
                "image_source": "supabase" if storage_url else "drive",
            }
        cache[part.pk] = payload
        return payload

    def get_image_url(self, part):
        return self._image_payload(part)["image_url"]

    def get_image_fallback_url(self, part):
        return self._image_payload(part)["image_fallback_url"]

    def get_image_source(self, part):
        return self._image_payload(part)["image_source"]

    def _stock_qty(self, part):
        cache = getattr(self, "_partsflow_stock_cache", None)
        if cache is None:
            cache = self._partsflow_stock_cache = {}
        if part.pk not in cache:
            value = getattr(part, "stock_qty", None)
            if value is None:
                value = part.inventory.aggregate(
                    total=Coalesce(
                        Sum("quantity"),
                        Value(Decimal("0")),
                        output_field=QTY_FIELD,
                    )
                )["total"]
            cache[part.pk] = float(value or 0)
        return cache[part.pk]

    def get_stock_qty(self, part):
        return self._stock_qty(part)

    def _stock_status(self, part):
        cache = getattr(self, "_partsflow_status_cache", None)
        if cache is None:
            cache = self._partsflow_status_cache = {}
        if part.pk not in cache:
            if str(part.sku or "").strip().upper().startswith("N"):
                status = "normal"
            elif bool(getattr(part, "active_ordering", False)):
                status = "ordering_now"
            else:
                stock = Decimal(str(self._stock_qty(part) or 0))
                minimum = Decimal(str(part.min_stock or 0))
                if stock <= 0:
                    status = "out_of_stock"
                elif minimum > 0 and stock < minimum:
                    status = "low_stock"
                else:
                    status = "normal"
            cache[part.pk] = status
        return cache[part.pk]

    def get_stock_status(self, part):
        return self._stock_status(part)

    def get_stock_status_label(self, part):
        return self._stock_status(part).replace("_", " ")


class PartDetailSerializer(PartListSerializer):
    """Full Part representation; nested collections are detail-only."""

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # Import lazily to avoid a module cycle: web_api owns the detail-only
        # query helpers while this module owns the stable serializer contract.
        from .web_api import extend_part_detail_data

        return extend_part_detail_data(instance, data)


class StockTransactionListSerializer(serializers.ModelSerializer):
    """Flat history row serializer with no nested FK payloads."""

    date = serializers.SerializerMethodField()
    time = serializers.SerializerMethodField()
    transaction_date = serializers.SerializerMethodField()
    type = serializers.SerializerMethodField()
    item_id = serializers.CharField(source="part.sku", read_only=True)
    part_name = serializers.CharField(source="part.name", read_only=True)
    part_detail = serializers.CharField(
        source="part.description", read_only=True, default=""
    )
    maker = serializers.CharField(
        source="part.maker.name", read_only=True, default=""
    )
    location = serializers.SerializerMethodField()
    machine = serializers.CharField(
        source="machine.code", read_only=True, default=""
    )
    requester_id = serializers.SerializerMethodField()
    requester = serializers.CharField(
        source="employee.name", read_only=True, default=""
    )
    recorder_id = serializers.SerializerMethodField()
    recorder = serializers.SerializerMethodField()
    quantity = serializers.FloatField(read_only=True)
    unit = serializers.CharField(
        source="part.unit.code", read_only=True, default=""
    )

    class Meta:
        model = StockTransaction
        fields = (
            "id",
            "date",
            "time",
            "transaction_date",
            "type",
            "transaction_type",
            "item_id",
            "part_name",
            "part_detail",
            "maker",
            "location",
            "machine",
            "requester_id",
            "requester",
            "recorder_id",
            "recorder",
            "quantity",
            "unit",
            "remark",
            "is_void",
            "legacy_source",
        )

    @staticmethod
    def _local_datetime(transaction):
        return timezone.localtime(transaction.transaction_date)

    def get_date(self, transaction):
        return self._local_datetime(transaction).strftime("%d/%m/%Y")

    def get_time(self, transaction):
        return self._local_datetime(transaction).strftime("%H:%M:%S")

    @staticmethod
    def get_transaction_date(transaction):
        return transaction.transaction_date.isoformat()

    @staticmethod
    def get_type(transaction):
        return transaction_type_group(transaction.transaction_type)

    @staticmethod
    def get_location(transaction):
        if transaction.location:
            return transaction.location.code
        if transaction.part.location:
            return transaction.part.location.code
        return ""

    @staticmethod
    def get_requester_id(transaction):
        return str(transaction.employee_id) if transaction.employee_id else ""

    @staticmethod
    def get_recorder_id(transaction):
        return (
            str(transaction.recorded_by_employee_id)
            if transaction.recorded_by_employee_id
            else ""
        )

    @staticmethod
    def get_recorder(transaction):
        return transaction_recorder_name(transaction)


class StockTransactionDetailSerializer(StockTransactionListSerializer):
    """Single-row response used after editing a history transaction."""

    location_id = serializers.SerializerMethodField()
    machine_id = serializers.SerializerMethodField()

    class Meta(StockTransactionListSerializer.Meta):
        fields = StockTransactionListSerializer.Meta.fields + (
            "transaction_no",
            "location_id",
            "machine_id",
            "reference_type",
            "reference_id",
            "created_at",
            "updated_at",
        )

    @staticmethod
    def get_location_id(transaction):
        return str(transaction.location_id) if transaction.location_id else ""

    @staticmethod
    def get_machine_id(transaction):
        return str(transaction.machine_id) if transaction.machine_id else ""

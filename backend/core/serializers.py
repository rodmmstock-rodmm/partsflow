from rest_framework import serializers
from .models import *
class MachineSerializer(serializers.ModelSerializer):
    class Meta: model=Machine; fields="__all__"
class SupplierSerializer(serializers.ModelSerializer):
    class Meta: model=Supplier; fields="__all__"
class PartSerializer(serializers.ModelSerializer):
    stock_value=serializers.ReadOnlyField(); reorder_qty=serializers.ReadOnlyField()
    class Meta: model=Part; fields="__all__"
class StockTransactionSerializer(serializers.ModelSerializer):
    class Meta: model=StockTransaction; fields="__all__"; read_only_fields=("balance_after","created_by")
class PRItemSerializer(serializers.ModelSerializer):
    class Meta: model=PRItem; fields="__all__"
class PurchaseRequestSerializer(serializers.ModelSerializer):
    items=PRItemSerializer(many=True,read_only=True)
    class Meta: model=PurchaseRequest; fields="__all__"
class RFQSerializer(serializers.ModelSerializer):
    class Meta: model=RFQ; fields="__all__"
class QuotationSerializer(serializers.ModelSerializer):
    class Meta: model=Quotation; fields="__all__"
class QuotationItemSerializer(serializers.ModelSerializer):
    class Meta: model=QuotationItem; fields="__all__"
class PurchaseOrderSerializer(serializers.ModelSerializer):
    items=serializers.SerializerMethodField()
    class Meta: model=PurchaseOrder; fields="__all__"
    def get_items(self,obj): return POItemSerializer(obj.items.all(),many=True).data
class POItemSerializer(serializers.ModelSerializer):
    class Meta: model=POItem; fields="__all__"
class AuditLogSerializer(serializers.ModelSerializer):
    class Meta: model=AuditLog; fields="__all__"

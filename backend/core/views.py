from django.db import transaction
from django.db.models import F, Sum, Q
from django.utils import timezone
from rest_framework import viewsets, decorators, response, status
from .models import *
from .serializers import *

class Basic(viewsets.ModelViewSet): pass
class MachineViewSet(Basic):
    queryset=Machine.objects.all().order_by("code"); serializer_class=MachineSerializer
class SupplierViewSet(Basic):
    queryset=Supplier.objects.all().order_by("name"); serializer_class=SupplierSerializer
class PartViewSet(Basic):
    queryset=Part.objects.all().select_related("machine","supplier").order_by("sku"); serializer_class=PartSerializer
    @decorators.action(detail=False,methods=["get"])
    def reorder(self,request):
        qs=self.queryset.filter(active=True,stock__lt=F("min_stock"))
        return response.Response(PartSerializer(qs,many=True).data)

class StockTransactionViewSet(Basic):
    queryset=StockTransaction.objects.all().select_related("part").order_by("-created_at"); serializer_class=StockTransactionSerializer
    @transaction.atomic
    def perform_create(self,serializer):
        obj=serializer.save(created_by=self.request.user)
        part=Part.objects.select_for_update().get(pk=obj.part_id)
        if obj.tx_type=="IN": new=part.stock+obj.qty
        elif obj.tx_type=="OUT":
            if part.stock<obj.qty: raise serializers.ValidationError({"qty":"Insufficient stock"})
            new=part.stock-obj.qty
        else: new=obj.qty
        part.stock=new; part.save(update_fields=["stock","updated_at"])
        obj.balance_after=new; obj.save(update_fields=["balance_after"])
        AuditLog.objects.create(user=self.request.user,action="STOCK_"+obj.tx_type,entity="Part",entity_id=str(part.id),detail={"qty":str(obj.qty)})

class PurchaseRequestViewSet(Basic):
    queryset=PurchaseRequest.objects.all().prefetch_related("items"); serializer_class=PurchaseRequestSerializer
    @decorators.action(detail=True,methods=["post"])
    def submit(self,request,pk=None):
        obj=self.get_object(); obj.status="PENDING"; obj.save(update_fields=["status"]); return response.Response(self.get_serializer(obj).data)
    @decorators.action(detail=True,methods=["post"])
    def approve(self,request,pk=None):
        obj=self.get_object(); obj.status="APPROVED"; obj.approved_by=request.user; obj.approved_at=timezone.now(); obj.save(); return response.Response(self.get_serializer(obj).data)
    @decorators.action(detail=True,methods=["post"])
    def reject(self,request,pk=None):
        obj=self.get_object(); obj.status="REJECTED"; obj.save(update_fields=["status"]); return response.Response(self.get_serializer(obj).data)

class RFQViewSet(Basic):
    queryset=RFQ.objects.all().order_by("-created_at"); serializer_class=RFQSerializer
class QuotationViewSet(Basic):
    queryset=Quotation.objects.all().select_related("supplier","rfq"); serializer_class=QuotationSerializer
class QuotationItemViewSet(Basic):
    queryset=QuotationItem.objects.all(); serializer_class=QuotationItemSerializer
class PurchaseOrderViewSet(Basic):
    queryset=PurchaseOrder.objects.all().select_related("supplier").prefetch_related("items"); serializer_class=PurchaseOrderSerializer
class POItemViewSet(Basic):
    queryset=POItem.objects.all(); serializer_class=POItemSerializer
class AuditLogViewSet(Basic):
    queryset=AuditLog.objects.all().order_by("-created_at"); serializer_class=AuditLogSerializer
    def create(self,*args,**kwargs): return response.Response(status=405)

@decorators.api_view(["GET"])
def dashboard(request):
    parts=Part.objects.filter(active=True)
    low=parts.filter(stock__lt=F("min_stock")).count()
    return response.Response({
        "parts":parts.count(),
        "stock_value":float(sum(p.stock_value for p in parts)),
        "low_stock":low,
        "critical_low":parts.filter(critical=True,stock__lt=F("min_stock")).count(),
        "pending_pr":PurchaseRequest.objects.filter(status="PENDING").count(),
        "open_po":PurchaseOrder.objects.filter(status__in=["ORDERED","PARTIAL"]).count(),
        "reorder_value":float(sum(p.reorder_qty*p.unit_cost for p in parts.filter(stock__lt=F("min_stock"))))
    })

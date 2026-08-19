from django.db import models
from django.contrib.auth.models import User

from uuid import uuid4

class UUIDMixin(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    class Meta:
        abstract = True

class LegacyMixin(UUIDMixin):
    legacy_source=models.CharField(max_length=80,blank=True)
    legacy_id=models.CharField(max_length=120,blank=True)
    class Meta: abstract=True

class Unit(LegacyMixin):
    code=models.CharField(max_length=30,unique=True); name=models.CharField(max_length=100); active=models.BooleanField(default=True)
class Category(LegacyMixin):
    name=models.CharField(max_length=120,unique=True); active=models.BooleanField(default=True)
class Maker(LegacyMixin):
    name=models.CharField(max_length=200,unique=True); active=models.BooleanField(default=True)
class Location(LegacyMixin):
    code=models.CharField(max_length=100,unique=True); name=models.CharField(max_length=200,blank=True); warehouse=models.CharField(max_length=100,blank=True); zone=models.CharField(max_length=100,blank=True); rack=models.CharField(max_length=100,blank=True); shelf=models.CharField(max_length=100,blank=True); bin=models.CharField(max_length=100,blank=True); active=models.BooleanField(default=True)
class Employee(LegacyMixin):
    employee_code=models.CharField(max_length=80,unique=True); name=models.CharField(max_length=200); role=models.CharField(max_length=120,blank=True); department=models.CharField(max_length=120,blank=True); active=models.BooleanField(default=True)
class Machine(LegacyMixin):
    code=models.CharField(max_length=100,unique=True); name=models.CharField(max_length=250); location=models.CharField(max_length=200,blank=True); machine_type=models.CharField(max_length=120,blank=True); active=models.BooleanField(default=True); remark=models.TextField(blank=True)
class Supplier(LegacyMixin):
    code=models.CharField(max_length=80,unique=True); name=models.CharField(max_length=250); contact=models.CharField(max_length=200,blank=True); phone=models.CharField(max_length=80,blank=True); email=models.EmailField(blank=True); lead_time_days=models.PositiveIntegerField(default=0); active=models.BooleanField(default=True); remark=models.TextField(blank=True)
class Part(LegacyMixin):
    sku=models.CharField(max_length=100,unique=True); name=models.CharField(max_length=300); description=models.TextField(blank=True); maker=models.ForeignKey(Maker,null=True,blank=True,on_delete=models.SET_NULL); category=models.ForeignKey(Category,null=True,blank=True,on_delete=models.SET_NULL); unit=models.ForeignKey(Unit,null=True,blank=True,on_delete=models.SET_NULL); default_supplier=models.ForeignKey(Supplier,null=True,blank=True,on_delete=models.SET_NULL); location=models.ForeignKey(Location,null=True,blank=True,on_delete=models.SET_NULL); image_path=models.CharField(max_length=500,blank=True); min_stock=models.DecimalField(max_digits=14,decimal_places=2,default=0); max_stock=models.DecimalField(max_digits=14,decimal_places=2,default=0); reorder_qty=models.DecimalField(max_digits=14,decimal_places=2,default=0); vendor_lead_time_days=models.PositiveIntegerField(default=0); purchasing_lead_time_days=models.PositiveIntegerField(default=0); total_lead_time_days=models.PositiveIntegerField(default=0); last_purchase_price=models.DecimalField(max_digits=16,decimal_places=4,default=0); critical=models.BooleanField(default=False); active=models.BooleanField(default=True); remark=models.TextField(blank=True); updated_at=models.DateTimeField(auto_now=True)
class PartSupplier(LegacyMixin):
    part=models.ForeignKey(Part,on_delete=models.CASCADE,related_name='suppliers'); supplier=models.ForeignKey(Supplier,on_delete=models.PROTECT,related_name='parts'); supplier_part_no=models.CharField(max_length=150,blank=True); unit_price=models.DecimalField(max_digits=16,decimal_places=4,default=0); currency=models.CharField(max_length=10,default='THB'); lead_time_days=models.PositiveIntegerField(default=0); minimum_order_qty=models.DecimalField(max_digits=14,decimal_places=2,default=1); is_preferred=models.BooleanField(default=False); last_quoted_at=models.DateField(null=True,blank=True)
    class Meta: constraints=[models.UniqueConstraint(fields=['part','supplier'],name='uniq_part_supplier')]
class PartMachine(LegacyMixin):
    part=models.ForeignKey(Part,on_delete=models.CASCADE,related_name='machine_links'); machine=models.ForeignKey(Machine,on_delete=models.PROTECT,related_name='part_links'); quantity_per_machine=models.DecimalField(max_digits=14,decimal_places=2,default=1); is_critical=models.BooleanField(default=False); position=models.CharField(max_length=150,blank=True); remark=models.TextField(blank=True)
    class Meta: constraints=[models.UniqueConstraint(fields=['part','machine'],name='uniq_part_machine')]
class Inventory(LegacyMixin):
    part=models.ForeignKey(Part,on_delete=models.PROTECT,related_name='inventory'); location=models.ForeignKey(Location,null=True,blank=True,on_delete=models.PROTECT); quantity=models.DecimalField(max_digits=14,decimal_places=2,default=0); updated_at=models.DateTimeField(auto_now=True)
    class Meta: constraints=[models.UniqueConstraint(fields=['part','location'],name='uniq_part_location')]
class StockTransaction(LegacyMixin):
    TYPES=[('RECEIVE','Receive'),('ISSUE','Issue'),('ADJUSTMENT','Adjustment'),('RETURN','Return'),('TRANSFER_IN','Transfer In'),('TRANSFER_OUT','Transfer Out')]
    transaction_no=models.CharField(max_length=80,unique=True); part=models.ForeignKey(Part,on_delete=models.PROTECT,related_name='transactions'); location=models.ForeignKey(Location,null=True,blank=True,on_delete=models.PROTECT); transaction_type=models.CharField(max_length=20,choices=TYPES); quantity=models.DecimalField(max_digits=14,decimal_places=2); machine=models.ForeignKey(Machine,null=True,blank=True,on_delete=models.SET_NULL); employee=models.ForeignKey(Employee,null=True,blank=True,on_delete=models.SET_NULL); reference_type=models.CharField(max_length=50,blank=True); reference_id=models.CharField(max_length=100,blank=True); transaction_date=models.DateTimeField(); remark=models.TextField(blank=True); created_by=models.ForeignKey(User,null=True,blank=True,on_delete=models.SET_NULL)
class PurchaseRequest(LegacyMixin):
    STATUS=[('DRAFT','Draft'),('PENDING_APPROVAL','Pending Approval'),('APPROVED','Approved'),('REJECTED','Rejected'),('CANCELLED','Cancelled'),('CONVERTED_TO_PO','Converted to PO')]
    pr_number=models.CharField(max_length=60,unique=True); request_date=models.DateField(); requester=models.ForeignKey(Employee,null=True,blank=True,on_delete=models.SET_NULL); department=models.CharField(max_length=120,blank=True); machine=models.ForeignKey(Machine,null=True,blank=True,on_delete=models.SET_NULL); purpose=models.TextField(blank=True); priority=models.CharField(max_length=30,default='NORMAL'); status=models.CharField(max_length=30,choices=STATUS,default='DRAFT'); approved_by=models.ForeignKey(User,null=True,blank=True,on_delete=models.SET_NULL); approved_at=models.DateTimeField(null=True,blank=True); remark=models.TextField(blank=True)
class PurchaseRequestItem(UUIDMixin):
    pr=models.ForeignKey(PurchaseRequest,on_delete=models.CASCADE,related_name='items'); part=models.ForeignKey(Part,on_delete=models.PROTECT); quantity=models.DecimalField(max_digits=14,decimal_places=2); estimated_price=models.DecimalField(max_digits=16,decimal_places=4,default=0); reason=models.TextField(blank=True); remark=models.TextField(blank=True)
class RFQ(LegacyMixin):
    STATUS=[('OPEN','Open'),('CLOSED','Closed'),('CANCELLED','Cancelled')]
    rfq_number=models.CharField(max_length=60,unique=True); pr=models.ForeignKey(PurchaseRequest,null=True,blank=True,on_delete=models.SET_NULL); issue_date=models.DateField(); due_date=models.DateField(null=True,blank=True); status=models.CharField(max_length=20,choices=STATUS,default='OPEN'); created_by=models.ForeignKey(User,null=True,blank=True,on_delete=models.SET_NULL); remark=models.TextField(blank=True)
class RFQSupplier(UUIDMixin):
    rfq=models.ForeignKey(RFQ,on_delete=models.CASCADE,related_name='supplier_requests'); supplier=models.ForeignKey(Supplier,on_delete=models.PROTECT); sent_at=models.DateTimeField(null=True,blank=True); response_at=models.DateTimeField(null=True,blank=True); status=models.CharField(max_length=30,default='PENDING')
class Quotation(LegacyMixin):
    rfq=models.ForeignKey(RFQ,on_delete=models.CASCADE,related_name='quotations'); supplier=models.ForeignKey(Supplier,on_delete=models.PROTECT); quotation_no=models.CharField(max_length=100,blank=True); quotation_date=models.DateField(null=True,blank=True); valid_until=models.DateField(null=True,blank=True); currency=models.CharField(max_length=10,default='THB'); subtotal=models.DecimalField(max_digits=16,decimal_places=4,default=0); discount=models.DecimalField(max_digits=16,decimal_places=4,default=0); vat=models.DecimalField(max_digits=16,decimal_places=4,default=0); total=models.DecimalField(max_digits=16,decimal_places=4,default=0); lead_time_days=models.PositiveIntegerField(default=0); remark=models.TextField(blank=True)
class QuotationItem(UUIDMixin):
    quotation=models.ForeignKey(Quotation,on_delete=models.CASCADE,related_name='items'); part=models.ForeignKey(Part,on_delete=models.PROTECT); quantity=models.DecimalField(max_digits=14,decimal_places=2); unit_price=models.DecimalField(max_digits=16,decimal_places=4); discount=models.DecimalField(max_digits=16,decimal_places=4,default=0); total=models.DecimalField(max_digits=16,decimal_places=4,default=0); lead_time_days=models.PositiveIntegerField(default=0)
class PurchaseOrder(LegacyMixin):
    STATUS=[('DRAFT','Draft'),('ORDERED','Ordered'),('PARTIAL','Partial'),('RECEIVED','Received'),('CANCELLED','Cancelled')]
    po_number=models.CharField(max_length=80,unique=True); pr=models.ForeignKey(PurchaseRequest,null=True,blank=True,on_delete=models.SET_NULL); supplier=models.ForeignKey(Supplier,on_delete=models.PROTECT); machine=models.ForeignKey(Machine,null=True,blank=True,on_delete=models.SET_NULL); quotation=models.ForeignKey(Quotation,null=True,blank=True,on_delete=models.SET_NULL); order_date=models.DateField(null=True,blank=True); expected_date=models.DateField(null=True,blank=True); vendor_confirm_date=models.DateField(null=True,blank=True); receive_date=models.DateField(null=True,blank=True); ordered_by=models.ForeignKey(Employee,null=True,blank=True,on_delete=models.SET_NULL,related_name='orders_placed'); person_in_charge=models.ForeignKey(Employee,null=True,blank=True,on_delete=models.SET_NULL,related_name='orders_managed'); status=models.CharField(max_length=20,choices=STATUS,default='DRAFT'); cancel_status=models.CharField(max_length=50,blank=True); total=models.DecimalField(max_digits=16,decimal_places=4,default=0); remark=models.TextField(blank=True)
class PurchaseOrderItem(UUIDMixin):
    po=models.ForeignKey(PurchaseOrder,on_delete=models.CASCADE,related_name='items'); part=models.ForeignKey(Part,on_delete=models.PROTECT); description=models.TextField(blank=True); quantity=models.DecimalField(max_digits=14,decimal_places=2); unit=models.CharField(max_length=30,blank=True); unit_price=models.DecimalField(max_digits=16,decimal_places=4,default=0); discount=models.DecimalField(max_digits=16,decimal_places=4,default=0); total=models.DecimalField(max_digits=16,decimal_places=4,default=0); received_quantity=models.DecimalField(max_digits=14,decimal_places=2,default=0)
class Receiving(LegacyMixin):
    receiving_no=models.CharField(max_length=80,unique=True); po=models.ForeignKey(PurchaseOrder,null=True,blank=True,on_delete=models.SET_NULL); received_date=models.DateTimeField(); received_by=models.ForeignKey(Employee,null=True,blank=True,on_delete=models.SET_NULL); supplier_delivery_no=models.CharField(max_length=100,blank=True); remark=models.TextField(blank=True)
class ReceivingItem(UUIDMixin):
    receiving=models.ForeignKey(Receiving,on_delete=models.CASCADE,related_name='items'); po_item=models.ForeignKey(PurchaseOrderItem,null=True,blank=True,on_delete=models.SET_NULL); part=models.ForeignKey(Part,on_delete=models.PROTECT); quantity=models.DecimalField(max_digits=14,decimal_places=2); location=models.ForeignKey(Location,null=True,blank=True,on_delete=models.PROTECT); lot_no=models.CharField(max_length=100,blank=True); serial_no=models.CharField(max_length=150,blank=True); remark=models.TextField(blank=True)
class PurchasePriceHistory(LegacyMixin):
    part=models.ForeignKey(Part,on_delete=models.PROTECT,related_name='price_history'); supplier=models.ForeignKey(Supplier,null=True,blank=True,on_delete=models.PROTECT); purchase_date=models.DateField(null=True,blank=True); unit_price=models.DecimalField(max_digits=16,decimal_places=4); currency=models.CharField(max_length=10,default='THB'); source_type=models.CharField(max_length=40,blank=True); source_id=models.CharField(max_length=100,blank=True)
class AuditLog(models.Model):
    user=models.ForeignKey(User,null=True,blank=True,on_delete=models.SET_NULL); action=models.CharField(max_length=120); entity=models.CharField(max_length=120); entity_id=models.CharField(max_length=120,blank=True); detail=models.JSONField(default=dict); created_at=models.DateTimeField(auto_now_add=True)

from django.contrib import admin
from .models import (
    Machine,
    Supplier,
    Part,
    StockTransaction,
    PurchaseRequest,
    PurchaseRequestItem,
    RFQ,
    Quotation,
    QuotationItem,
    PurchaseOrder,
    PurchaseOrderItem,
    AuditLog,
)

admin.site.register([
    Machine,
    Supplier,
    Part,
    StockTransaction,
    PurchaseRequest,
    PurchaseRequestItem,
    RFQ,
    Quotation,
    QuotationItem,
    PurchaseOrder,
    PurchaseOrderItem,
    AuditLog,
])
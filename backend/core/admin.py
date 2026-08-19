from django.contrib import admin
from .models import *
for m in [Machine,Supplier,Part,StockTransaction,PurchaseRequest,PRItem,RFQ,Quotation,QuotationItem,PurchaseOrder,POItem,AuditLog]:
    admin.site.register(m)

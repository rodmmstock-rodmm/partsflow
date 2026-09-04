from django.contrib import admin
from .models import (
    Machine,
    Supplier,
    Part,
    StockTransaction,
    OrderRFQ,
    OrderRFQItem,
    RFQMessage,
    RFQAttachment,
    POBalance,
    RFQCCRule,
    VendorEmailIdentity,
    IntegrationCredential,
    AuditLog,
)

admin.site.register([
    Machine,
    Supplier,
    Part,
    StockTransaction,
    OrderRFQ,
    OrderRFQItem,
    RFQMessage,
    RFQAttachment,
    POBalance,
    RFQCCRule,
    VendorEmailIdentity,
    IntegrationCredential,
    AuditLog,
])

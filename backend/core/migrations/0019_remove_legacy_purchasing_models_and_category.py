from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0018_deleted_order_view_permission"),
    ]

    operations = [
        # Part.category was only ever displayed read-only and never editable;
        # dropping the field first so Category has no remaining references.
        migrations.RemoveField(
            model_name="part",
            name="category",
        ),
        migrations.DeleteModel(name="Category"),
        migrations.DeleteModel(name="PurchasePriceHistory"),
        # Legacy purchasing models from an earlier prototype of the app.
        # None of these are wired into any URL route, view, or frontend
        # page in the current codebase - superseded by OrderRecord /
        # OrderRFQ / POBalance. Order matters: children (FK holders) must
        # be dropped before the parent they point to.
        migrations.DeleteModel(name="ReceivingItem"),
        migrations.DeleteModel(name="RFQSupplier"),
        migrations.DeleteModel(name="QuotationItem"),
        migrations.DeleteModel(name="PurchaseRequestItem"),
        migrations.DeleteModel(name="Receiving"),
        migrations.DeleteModel(name="PurchaseOrderItem"),
        migrations.DeleteModel(name="PurchaseOrder"),
        migrations.DeleteModel(name="Quotation"),
        migrations.DeleteModel(name="RFQ"),
        migrations.DeleteModel(name="PurchaseRequest"),
    ]

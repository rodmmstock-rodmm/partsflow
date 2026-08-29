from django.db import migrations


ORDER_AUDIT_ENTITIES = (
    "OrderRecord",
    "OrderProject",
    "OrderStep",
)


def purge_existing_order_data(apps, schema_editor):
    """One-time clean slate before importing the approved production Excel.

    Deliberately preserves stock master data, Parts, Machines, Suppliers,
    Employees and StockTransactions. Only Order-domain rows and their audit
    history are removed.
    """
    OrderRecord = apps.get_model("core", "OrderRecord")
    OrderProject = apps.get_model("core", "OrderProject")
    AuditLog = apps.get_model("core", "AuditLog")

    # Remove every Normal and Project Order, including soft-deleted records.
    OrderRecord.objects.all().delete()

    # Removing projects cascades to OrderStep rows. Project Order rows were
    # already removed above, so no unrelated master data is affected.
    OrderProject.objects.all().delete()

    # Old field stamps / workflow audit rows must not appear in the fresh
    # production dataset after the Excel import.
    AuditLog.objects.filter(entity__in=ORDER_AUDIT_ENTITIES).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0012_tag_machine_master_visibility"),
    ]

    operations = [
        migrations.RunPython(
            purge_existing_order_data,
            migrations.RunPython.noop,
        ),
    ]

# Generated for PartsFlow Order workflow/lifecycle v2

import django.db.models.deletion
from django.db import migrations, models


def migrate_order_lifecycle(apps, schema_editor):
    OrderRecord = apps.get_model("core", "OrderRecord")

    for order in OrderRecord.objects.all().iterator(chunk_size=500):
        quotation_ready = bool((order.quotation or "").strip())
        vendor_ready = bool(order.vendor_id)
        po_ready = bool(
            (order.po_number or "").strip()
            and order.issue_pr_date
            and order.due_date
        )

        if order.cancel_status:
            order.lifecycle_status = "CANCELLED"
        elif order.received_at:
            order.lifecycle_status = "COMPLETED"
            order.completed_at = order.received_at
            order.status = "Complete Order"
        else:
            order.lifecycle_status = "ACTIVE"

        order.wait_confirm = (
            order.status == "Wait Confirm Order"
            and order.lifecycle_status == "ACTIVE"
        )

        if order.lifecycle_status == "ACTIVE":
            if order.wait_confirm:
                order.status = "Wait Confirm Order"
            elif po_ready and quotation_ready and vendor_ready:
                order.status = "Wait for Item"
            elif quotation_ready and vendor_ready:
                order.status = "Wait Issue P/R"
            elif quotation_ready:
                order.status = "Wait Quotation"
            else:
                order.status = "New Order"

        order.save(
            update_fields=[
                "lifecycle_status",
                "wait_confirm",
                "completed_at",
                "status",
            ]
        )


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0005_orderproject_department"),
    ]

    operations = [
        migrations.AddField(
            model_name="orderrecord",
            name="wait_confirm",
            field=models.BooleanField(db_index=True, default=False),
        ),
        migrations.AddField(
            model_name="orderrecord",
            name="lifecycle_status",
            field=models.CharField(
                choices=[
                    ("ACTIVE", "Active"),
                    ("CANCELLED", "Cancelled"),
                    ("COMPLETED", "Completed"),
                ],
                db_index=True,
                default="ACTIVE",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="orderrecord",
            name="cancelled_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="orderrecord",
            name="cancel_reason",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="orderrecord",
            name="cancelled_by_employee",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="cancelled_order_records",
                to="core.employee",
            ),
        ),
        migrations.AddField(
            model_name="orderrecord",
            name="completed_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="orderrecord",
            name="completion_note",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="orderrecord",
            name="completed_by_employee",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="completed_order_records",
                to="core.employee",
            ),
        ),
        migrations.RunPython(
            migrate_order_lifecycle,
            migrations.RunPython.noop,
        ),
    ]

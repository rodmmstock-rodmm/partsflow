from django.db import migrations, models
import django.db.models.deletion


def enable_admin_conversion_permission(apps, schema_editor):
    RoleAccess = apps.get_model("core", "RoleAccess")
    admin_ids = [
        role.pk
        for role in RoleAccess.objects.all().only("pk", "role_name")
        if str(role.role_name or "").strip().upper()
        in {"ADMIN", "ADMINISTRATOR"}
    ]
    RoleAccess.objects.filter(pk__in=admin_ids).update(
        can_create_order_from_quotation=True
    )


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0016_rfq_po_balance_email_workflow"),
    ]

    operations = [
        migrations.AddField(
            model_name="roleaccess",
            name="can_create_order_from_quotation",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="orderrecord",
            name="procurement_phase",
            field=models.CharField(
                choices=[("PURCHASE", "Order จริง"), ("QUOTATION", "ขอราคา")],
                db_index=True,
                default="PURCHASE",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="orderrecord",
            name="source_quotation_order",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="converted_orders",
                to="core.orderrecord",
            ),
        ),
        migrations.AddField(
            model_name="orderrecord",
            name="source_rfq",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="converted_orders",
                to="core.orderrfq",
            ),
        ),
        migrations.AddField(
            model_name="orderrecord",
            name="converted_quantity",
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="orderrecord",
            name="created_from_quotation_by_employee",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="orders_created_from_quotation",
                to="core.employee",
            ),
        ),
        migrations.AddField(
            model_name="orderrecord",
            name="created_from_quotation_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="orderrecord",
            name="currency",
            field=models.CharField(default="THB", max_length=10),
        ),
        migrations.RunPython(
            enable_admin_conversion_permission,
            migrations.RunPython.noop,
        ),
    ]

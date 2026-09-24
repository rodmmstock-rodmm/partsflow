from django.db import migrations, models


def backfill_from_view_orders(apps, schema_editor):
    RoleAccess = apps.get_model("core", "RoleAccess")
    RoleAccess.objects.filter(can_view_orders=True).update(
        can_view_order_step=True
    )


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0027_can_view_po_balance"),
    ]

    operations = [
        migrations.AddField(
            model_name="roleaccess",
            name="can_view_order_step",
            field=models.BooleanField(default=False),
        ),
        migrations.RunPython(
            backfill_from_view_orders, migrations.RunPython.noop
        ),
    ]

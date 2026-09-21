from django.db import migrations, models


def backfill_from_view_orders(apps, schema_editor):
    RoleAccess = apps.get_model("core", "RoleAccess")
    RoleAccess.objects.filter(can_view_orders=True).update(
        can_view_po_balance=True
    )


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0026_can_delete_parts"),
    ]

    operations = [
        migrations.AddField(
            model_name="roleaccess",
            name="can_view_po_balance",
            field=models.BooleanField(default=False),
        ),
        migrations.RunPython(
            backfill_from_view_orders, migrations.RunPython.noop
        ),
    ]

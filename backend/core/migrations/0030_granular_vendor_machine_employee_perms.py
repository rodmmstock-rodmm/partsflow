from django.db import migrations, models


def backfill(apps, schema_editor):
    RoleAccess = apps.get_model("core", "RoleAccess")
    RoleAccess.objects.filter(can_manage_suppliers=True).update(
        can_add_supplier=True, can_edit_supplier=True, can_delete_supplier=True
    )
    RoleAccess.objects.filter(can_manage_machines=True).update(
        can_add_machine=True, can_edit_machine=True, can_delete_machine=True
    )
    # Employee delete did not exist before; anyone who could already edit
    # employees is the closest existing equivalent of "manages employees".
    RoleAccess.objects.filter(can_edit_employees=True).update(
        can_delete_employees=True
    )


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0029_can_view_order_status"),
    ]

    operations = [
        migrations.AddField(
            model_name="roleaccess",
            name="can_add_supplier",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="roleaccess",
            name="can_edit_supplier",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="roleaccess",
            name="can_delete_supplier",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="roleaccess",
            name="can_add_machine",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="roleaccess",
            name="can_edit_machine",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="roleaccess",
            name="can_delete_machine",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="roleaccess",
            name="can_delete_employees",
            field=models.BooleanField(default=False),
        ),
        migrations.RunPython(backfill, migrations.RunPython.noop),
    ]

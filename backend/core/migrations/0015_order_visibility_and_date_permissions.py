from django.db import migrations, models
from django.db.models import Q


def enable_admin_permissions(apps, schema_editor):
    RoleAccess = apps.get_model("core", "RoleAccess")
    RoleAccess.objects.filter(
        Q(role_name__iexact="ADMIN") | Q(role_name__iexact="ADMINISTRATOR")
    ).update(
        can_view_order_updates=True,
        can_edit_order_date=True,
    )


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0014_import_excel_orders_2026"),
    ]

    operations = [
        migrations.AddField(
            model_name="roleaccess",
            name="can_view_order_updates",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="roleaccess",
            name="can_edit_order_date",
            field=models.BooleanField(default=False),
        ),
        migrations.RunPython(enable_admin_permissions, migrations.RunPython.noop),
    ]

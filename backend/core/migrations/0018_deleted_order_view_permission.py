from django.db import migrations, models


def enable_admin_deleted_orders_permission(apps, schema_editor):
    RoleAccess = apps.get_model("core", "RoleAccess")
    admin_ids = [
        role.pk
        for role in RoleAccess.objects.all().only("pk", "role_name")
        if str(role.role_name or "").strip().upper()
        in {"ADMIN", "ADMINISTRATOR"}
    ]
    RoleAccess.objects.filter(pk__in=admin_ids).update(
        can_view_deleted_orders=True
    )


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0017_project_quotation_flow"),
    ]

    operations = [
        migrations.AddField(
            model_name="roleaccess",
            name="can_view_deleted_orders",
            field=models.BooleanField(default=False),
        ),
        migrations.RunPython(
            enable_admin_deleted_orders_permission,
            migrations.RunPython.noop,
        ),
    ]

import django.db.models.deletion
from django.db import migrations, models


def enable_admin_confirm_step_permission(apps, schema_editor):
    RoleAccess = apps.get_model("core", "RoleAccess")
    admin_ids = [
        role.pk
        for role in RoleAccess.objects.all().only("pk", "role_name")
        if str(role.role_name or "").strip().upper()
        in {"ADMIN", "ADMINISTRATOR"}
    ]
    RoleAccess.objects.filter(pk__in=admin_ids).update(
        can_confirm_order_step=True
    )


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0021_order_step_status_and_drawing_path"),
    ]

    operations = [
        migrations.AddField(
            model_name="roleaccess",
            name="can_confirm_order_step",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="orderstep",
            name="confirmed_by_employee",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="confirmed_order_steps",
                to="core.employee",
            ),
        ),
        migrations.AddField(
            model_name="orderstep",
            name="confirmed_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.RunPython(
            enable_admin_confirm_step_permission,
            migrations.RunPython.noop,
        ),
    ]

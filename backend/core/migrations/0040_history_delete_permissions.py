from django.db import migrations, models
from django.db.models import Q


def grant_admin_history_delete(apps, schema_editor):
    RoleAccess = apps.get_model("core", "RoleAccess")
    RoleAccess.objects.filter(Q(role_name__iexact="ADMIN") | Q(role_name__iexact="ADMINISTRATOR")).update(
        can_delete_tooling_history=True,
        can_delete_cloth_roll_history=True,
    )


class Migration(migrations.Migration):
    dependencies = [("core", "0039_tooling_vehicle_number")]

    operations = [
        migrations.AddField(model_name="roleaccess", name="can_delete_tooling_history", field=models.BooleanField(default=False)),
        migrations.AddField(model_name="roleaccess", name="can_delete_cloth_roll_history", field=models.BooleanField(default=False)),
        migrations.RunPython(grant_admin_history_delete, migrations.RunPython.noop),
    ]

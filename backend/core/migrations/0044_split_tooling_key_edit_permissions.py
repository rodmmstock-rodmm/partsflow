from django.db import migrations, models


def copy_legacy_edit_permission(apps, schema_editor):
    RoleAccess = apps.get_model("core", "RoleAccess")
    for role in RoleAccess.objects.all().only("id", "can_edit_tooling_key_details"):
        role.can_edit_tooling_key_history = role.can_edit_tooling_key_details
        role.save(update_fields=["can_edit_tooling_key_history"])


class Migration(migrations.Migration):
    dependencies = [("core", "0043_tooling_vehicle_key_loans")]

    operations = [
        migrations.RenameField(
            model_name="roleaccess",
            old_name="can_edit_tooling_keys",
            new_name="can_edit_tooling_key_details",
        ),
        migrations.AddField(
            model_name="roleaccess",
            name="can_edit_tooling_key_history",
            field=models.BooleanField(default=False),
        ),
        migrations.RunPython(copy_legacy_edit_permission, migrations.RunPython.noop),
    ]

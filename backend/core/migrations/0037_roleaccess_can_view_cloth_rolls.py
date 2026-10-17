from django.db import migrations, models


def copy_existing_qr_permission(apps, schema_editor):
    RoleAccess = apps.get_model("core", "RoleAccess")
    for role in RoleAccess.objects.all().only("id", "can_view_qr_withdraw"):
        role.can_view_cloth_rolls = role.can_view_qr_withdraw
        role.save(update_fields=["can_view_cloth_rolls"])


def reverse_copy_permission(apps, schema_editor):
    # The new permission is independent after migration; don't overwrite the
    # existing QR permission when rolling back.
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0036_cloth_roll_inventory"),
    ]

    operations = [
        migrations.AddField(
            model_name="roleaccess",
            name="can_view_cloth_rolls",
            field=models.BooleanField(default=False),
        ),
        migrations.RunPython(copy_existing_qr_permission, reverse_copy_permission),
    ]

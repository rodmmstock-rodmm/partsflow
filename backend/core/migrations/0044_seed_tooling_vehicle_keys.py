from django.db import migrations


def seed_tooling_vehicle_keys(apps, schema_editor):
    """Create the 13 numbered starter keys without changing existing records."""
    ToolingVehicleKey = apps.get_model("core", "ToolingVehicleKey")
    database = schema_editor.connection.alias

    for vehicle_number in range(1, 14):
        ToolingVehicleKey.objects.using(database).get_or_create(
            vehicle_number=vehicle_number,
            defaults={
                "label": f"กุญแจรถเครื่องมือหมายเลข {vehicle_number}",
                "remark": "",
                "active": True,
            },
        )


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0043_tooling_vehicle_key_loans"),
    ]

    operations = [
        migrations.RunPython(
            seed_tooling_vehicle_keys,
            migrations.RunPython.noop,
        ),
    ]

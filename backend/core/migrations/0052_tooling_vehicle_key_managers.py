from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0051_employee_image_path"),
    ]

    operations = [
        migrations.AddField(
            model_name="toolingvehiclekey",
            name="managers",
            field=models.ManyToManyField(
                blank=True,
                related_name="managed_tooling_vehicle_keys",
                to="core.employee",
            ),
        ),
    ]

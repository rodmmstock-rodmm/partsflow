from django.db import migrations, models
from django.db.models.functions import Lower


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0044_seed_tooling_vehicle_keys"),
    ]

    operations = [
        migrations.AddField(
            model_name="toolingitem",
            name="equipment_number",
            field=models.CharField(blank=True, default="", max_length=10),
        ),
        migrations.AddConstraint(
            model_name="toolingitem",
            constraint=models.UniqueConstraint(
                Lower("equipment_number"),
                condition=~models.Q(equipment_number=""),
                name="uniq_tooling_equipment_number_ci",
            ),
        ),
    ]

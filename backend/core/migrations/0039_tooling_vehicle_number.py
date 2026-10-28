# Persist the selected tool vehicle number on each Tooling withdrawal.
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0038_cloth_roll_adjustment_machine_name"),
    ]

    operations = [
        migrations.AddField(
            model_name="toolingtransaction",
            name="vehicle_number",
            field=models.PositiveSmallIntegerField(blank=True, null=True),
        ),
    ]

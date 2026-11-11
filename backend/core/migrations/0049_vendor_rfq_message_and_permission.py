# Add the per-Vendor RFQ message and dedicated Order RFQ permission.
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0048_cloth_roll_adjustment_note"),
    ]

    operations = [
        migrations.AddField(
            model_name="supplier",
            name="rfq_message",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="roleaccess",
            name="can_create_rfq",
            field=models.BooleanField(default=False),
        ),
    ]

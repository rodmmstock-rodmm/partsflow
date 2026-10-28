# Add cloth-roll adjustment transactions and record the machine name.
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0037_tooling_inventory"),
    ]

    operations = [
        migrations.AlterField(
            model_name="clothrolltransaction",
            name="transaction_type",
            field=models.CharField(
                choices=[("OUT", "เบิก"), ("IN", "รับเข้า"), ("ADJ", "ปรับยอด")],
                max_length=3,
            ),
        ),
        migrations.AddField(
            model_name="clothrolltransaction",
            name="machine_name",
            field=models.CharField(blank=True, max_length=120),
        ),
    ]

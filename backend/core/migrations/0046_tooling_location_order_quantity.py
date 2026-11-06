from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0045_tooling_equipment_number"),
    ]

    operations = [
        migrations.AddField(
            model_name="toolingitem",
            name="location",
            field=models.CharField(blank=True, max_length=120),
        ),
        migrations.AddField(
            model_name="toolingitem",
            name="order_quantity",
            field=models.PositiveIntegerField(default=0),
        ),
    ]

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0046_tooling_location_order_quantity"),
    ]

    operations = [
        migrations.AddField(
            model_name="toolingitem",
            name="image_path",
            field=models.TextField(blank=True),
        ),
    ]

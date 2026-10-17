from django.db import migrations, models


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
    ]

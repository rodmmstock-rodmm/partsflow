from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0041_tool_equipment_maker_image"),
    ]

    operations = [
        migrations.AddField(
            model_name="toolequipment",
            name="warehouse",
            field=models.CharField(
                blank=True,
                choices=[("Phase4", "Phase4"), ("Phase11", "Phase11")],
                max_length=30,
            ),
        ),
    ]

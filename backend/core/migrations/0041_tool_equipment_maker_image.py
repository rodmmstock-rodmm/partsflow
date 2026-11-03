from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0040_history_delete_permissions"),
    ]

    operations = [
        migrations.AddField(
            model_name="toolequipment",
            name="maker",
            field=models.CharField(blank=True, max_length=200),
        ),
        migrations.AddField(
            model_name="toolequipment",
            name="image_path",
            field=models.TextField(blank=True),
        ),
    ]

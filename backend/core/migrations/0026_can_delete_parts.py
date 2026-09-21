from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0025_orderrecord_wait_confirm_remark"),
    ]

    operations = [
        migrations.AddField(
            model_name="roleaccess",
            name="can_delete_parts",
            field=models.BooleanField(default=False),
        ),
    ]

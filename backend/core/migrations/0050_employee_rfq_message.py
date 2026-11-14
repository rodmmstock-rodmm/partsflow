from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0049_vendor_rfq_message_and_permission"),
    ]

    operations = [
        migrations.AddField(
            model_name="employee",
            name="rfq_message",
            field=models.TextField(blank=True),
        ),
    ]

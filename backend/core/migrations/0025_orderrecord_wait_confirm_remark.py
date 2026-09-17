from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0024_order_vendor_candidates"),
    ]

    operations = [
        migrations.AddField(
            model_name="orderrecord",
            name="wait_confirm_remark",
            field=models.TextField(blank=True),
        ),
    ]


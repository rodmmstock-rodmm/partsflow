from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0020_supplier_contact"),
    ]

    operations = [
        migrations.AddField(
            model_name="orderstep",
            name="status",
            field=models.CharField(
                choices=[
                    ("WAIT_QUOTATION", "รอขอราคา"),
                    ("WAIT_CONFIRM", "รอ Confirm"),
                    ("ORDERING", "กำลังสั่งของ"),
                    ("COMPLETED", "ของมาครบแล้ว"),
                ],
                db_index=True,
                default="WAIT_QUOTATION",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="orderrecord",
            name="drawing_path",
            field=models.CharField(blank=True, max_length=500),
        ),
    ]

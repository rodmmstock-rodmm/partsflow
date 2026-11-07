from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0046_tooling_location_order_quantity"),
    ]

    operations = [
        migrations.AddField(
            model_name="part",
            name="reorder_unit_code",
            field=models.CharField(blank=True, default="", max_length=30),
        ),
        migrations.AddField(
            model_name="part",
            name="reorder_unit_stock_qty",
            field=models.DecimalField(decimal_places=2, default=1, max_digits=14),
        ),
        migrations.AddField(
            model_name="orderrecord",
            name="stock_unit_conversion",
            field=models.DecimalField(decimal_places=4, default=1, max_digits=14),
        ),
        migrations.AddField(
            model_name="orderrecord",
            name="stock_unit_text",
            field=models.CharField(blank=True, max_length=80),
        ),
        migrations.AddField(
            model_name="orderrecord",
            name="stock_quantity_ordered",
            field=models.DecimalField(decimal_places=2, default=0, max_digits=16),
        ),
    ]

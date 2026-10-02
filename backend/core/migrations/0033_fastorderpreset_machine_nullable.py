import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0032_qr_withdraw_perms"),
    ]

    operations = [
        migrations.AlterField(
            model_name="fastorderpreset",
            name="machine",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="fast_order_presets",
                to="core.machine",
            ),
        ),
    ]

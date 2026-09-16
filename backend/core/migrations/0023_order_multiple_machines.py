import uuid

from django.db import migrations, models
import django.db.models.deletion


def copy_primary_machines(apps, schema_editor):
    OrderRecord = apps.get_model("core", "OrderRecord")
    OrderMachine = apps.get_model("core", "OrderMachine")

    for order in OrderRecord.objects.exclude(machine_id=None).iterator():
        OrderMachine.objects.get_or_create(
            order_id=order.id,
            machine_id=order.machine_id,
            defaults={"position": 0},
        )


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0022_order_step_confirmation"),
    ]

    operations = [
        migrations.CreateModel(
            name="OrderMachine",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("position", models.PositiveSmallIntegerField(default=0)),
                (
                    "machine",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="order_selections",
                        to="core.machine",
                    ),
                ),
                (
                    "order",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="machine_selections",
                        to="core.orderrecord",
                    ),
                ),
            ],
            options={
                "ordering": ["position", "created_at"],
            },
        ),
        migrations.AddConstraint(
            model_name="ordermachine",
            constraint=models.UniqueConstraint(
                fields=("order", "machine"),
                name="uniq_order_machine_selection",
            ),
        ),
        migrations.RunPython(copy_primary_machines, migrations.RunPython.noop),
    ]

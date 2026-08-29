import django.db.models.deletion
import uuid
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0009_fastorder_appsheet_bridge"),
    ]

    operations = [
        migrations.CreateModel(
            name="MachineSpareSet",
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
                ("name", models.CharField(max_length=200)),
                ("description", models.TextField(blank=True)),
                ("active", models.BooleanField(db_index=True, default=True)),
                (
                    "created_by_employee",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="created_machine_spare_sets",
                        to="core.employee",
                    ),
                ),
                (
                    "machine",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="spare_sets",
                        to="core.machine",
                    ),
                ),
            ],
            options={
                "ordering": ["machine__code", "name"],
            },
        ),
        migrations.CreateModel(
            name="MachineSpareSetItem",
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
                (
                    "quantity",
                    models.DecimalField(
                        decimal_places=2,
                        default=1,
                        max_digits=14,
                    ),
                ),
                ("remark", models.TextField(blank=True)),
                (
                    "part",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="spare_set_items",
                        to="core.part",
                    ),
                ),
                (
                    "spare_set",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="items",
                        to="core.machinespareset",
                    ),
                ),
            ],
            options={
                "ordering": ["part__sku"],
            },
        ),
        migrations.AddConstraint(
            model_name="machinespareset",
            constraint=models.UniqueConstraint(
                fields=("machine", "name"),
                name="uniq_machine_spare_set",
            ),
        ),
        migrations.AddConstraint(
            model_name="machinesparesetitem",
            constraint=models.UniqueConstraint(
                fields=("spare_set", "part"),
                name="uniq_machine_spare_set_part",
            ),
        ),
    ]

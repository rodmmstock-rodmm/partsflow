import uuid

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0023_order_multiple_machines"),
    ]

    operations = [
        migrations.CreateModel(
            name="OrderVendor",
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
                    "added_by_employee",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="added_order_vendors",
                        to="core.employee",
                    ),
                ),
                (
                    "order",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="vendor_candidates",
                        to="core.orderrecord",
                    ),
                ),
                (
                    "vendor",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="order_candidates",
                        to="core.supplier",
                    ),
                ),
            ],
            options={
                "ordering": ["created_at", "vendor__code"],
            },
        ),
        migrations.AddConstraint(
            model_name="ordervendor",
            constraint=models.UniqueConstraint(
                fields=("order", "vendor"),
                name="uniq_order_vendor_candidate",
            ),
        ),
    ]

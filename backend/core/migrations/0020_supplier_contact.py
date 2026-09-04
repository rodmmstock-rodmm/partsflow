import uuid

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0019_remove_legacy_purchasing_models_and_category"),
    ]

    operations = [
        migrations.CreateModel(
            name="SupplierContact",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("name", models.CharField(blank=True, max_length=200)),
                ("role", models.CharField(blank=True, max_length=120)),
                ("phone", models.CharField(blank=True, max_length=80)),
                ("email", models.EmailField(blank=True, max_length=254)),
                ("remark", models.CharField(blank=True, max_length=250)),
                (
                    "supplier",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="contacts",
                        to="core.supplier",
                    ),
                ),
            ],
            options={
                "ordering": ["created_at"],
            },
        ),
    ]

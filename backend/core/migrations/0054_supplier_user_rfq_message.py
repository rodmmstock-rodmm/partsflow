from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0053_split_tooling_key_edit_permissions"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="SupplierRFQMessage",
            fields=[
                ("id", models.UUIDField(primary_key=True, serialize=False, editable=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("message", models.TextField(blank=True)),
                ("employee", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="supplier_rfq_messages",
                    to="core.employee",
                )),
                ("supplier", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="user_rfq_messages",
                    to="core.supplier",
                )),
            ],
        ),
        migrations.AddConstraint(
            model_name="supplierrfqmessage",
            constraint=models.UniqueConstraint(
                fields=("supplier", "employee"),
                name="uniq_supplier_employee_rfq_msg",
            ),
        ),
    ]

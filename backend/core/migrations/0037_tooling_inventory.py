# Tooling consumable inventory; intentionally separate from serialized ToolEquipment.
import uuid
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [("core", "0036_cloth_roll_inventory")]

    operations = [
        migrations.AddField(model_name="roleaccess", name="can_view_tooling", field=models.BooleanField(default=False)),
        migrations.AddField(model_name="roleaccess", name="can_add_tooling", field=models.BooleanField(default=False)),
        migrations.AddField(model_name="roleaccess", name="can_edit_tooling", field=models.BooleanField(default=False)),
        migrations.AddField(model_name="roleaccess", name="can_delete_tooling", field=models.BooleanField(default=False)),
        migrations.CreateModel(
            name="ToolingItem",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("name", models.CharField(max_length=250)),
                ("detail", models.TextField(blank=True)),
                ("maker", models.CharField(blank=True, max_length=200)),
                ("quantity", models.PositiveIntegerField(default=0)),
                ("min_quantity", models.PositiveIntegerField(default=0)),
                ("unit", models.CharField(blank=True, max_length=60)),
                ("active", models.BooleanField(default=True)),
            ],
            options={"ordering": ["name"]},
        ),
        migrations.CreateModel(
            name="ToolingTransaction",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("quantity", models.PositiveIntegerField()),
                ("requester_name", models.CharField(max_length=200)),
                ("reason", models.CharField(choices=[("LOST", "หาย"), ("DAMAGED", "ชำรุด")], max_length=12)),
                ("remark", models.TextField(blank=True)),
                ("created_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to="auth.user")),
                ("item", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="transactions", to="core.toolingitem")),
                ("requester", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="tooling_withdrawals", to="core.employee")),
            ],
            options={"ordering": ["-created_at"]},
        ),
    ]

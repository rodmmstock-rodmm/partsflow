import uuid

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0030_granular_vendor_machine_employee_perms"),
    ]

    operations = [
        migrations.AddField(
            model_name="roleaccess",
            name="can_view_tools",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="roleaccess",
            name="can_add_tool",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="roleaccess",
            name="can_edit_tool",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="roleaccess",
            name="can_delete_tool",
            field=models.BooleanField(default=False),
        ),
        migrations.CreateModel(
            name="ToolEquipment",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("code", models.CharField(max_length=50, unique=True)),
                ("name", models.CharField(max_length=250)),
                ("category", models.CharField(blank=True, max_length=120)),
                ("serial_number", models.CharField(blank=True, max_length=120)),
                ("location", models.CharField(blank=True, max_length=200)),
                ("remark", models.TextField(blank=True)),
                (
                    "status",
                    models.CharField(
                        choices=[("AVAILABLE", "ว่าง"), ("BORROWED", "ถูกยืม")],
                        default="AVAILABLE",
                        max_length=20,
                    ),
                ),
                ("active", models.BooleanField(default=True)),
            ],
            options={"abstract": False},
        ),
        migrations.CreateModel(
            name="ToolLoanRecord",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("borrower_name", models.CharField(max_length=150)),
                ("purpose", models.CharField(blank=True, max_length=250)),
                ("borrowed_at", models.DateTimeField(auto_now_add=True)),
                ("expected_return_date", models.DateField(blank=True, null=True)),
                ("returned_at", models.DateTimeField(blank=True, null=True)),
                ("returned_by_name", models.CharField(blank=True, max_length=150)),
                ("return_note", models.TextField(blank=True)),
                (
                    "borrower_employee",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="tool_loans",
                        to="core.employee",
                    ),
                ),
                (
                    "tool",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="loan_records",
                        to="core.toolequipment",
                    ),
                ),
            ],
            options={"ordering": ["-borrowed_at"], "abstract": False},
        ),
    ]

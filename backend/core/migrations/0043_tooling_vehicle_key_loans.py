import uuid

import django.db.models.deletion
from django.db import migrations, models


def grant_admin_key_permissions(apps, schema_editor):
    RoleAccess = apps.get_model("core", "RoleAccess")
    RoleAccess.objects.filter(role_name__iexact="ADMIN").update(
        can_view_tooling_keys=True,
        can_edit_tooling_keys=True,
        can_delete_tooling_keys=True,
    )
    RoleAccess.objects.filter(role_name__iexact="ADMINISTRATOR").update(
        can_view_tooling_keys=True,
        can_edit_tooling_keys=True,
        can_delete_tooling_keys=True,
    )


class Migration(migrations.Migration):
    dependencies = [("core", "0042_tool_equipment_warehouse")]

    operations = [
        migrations.AddField(
            model_name="roleaccess",
            name="can_view_tooling_keys",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="roleaccess",
            name="can_edit_tooling_keys",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="roleaccess",
            name="can_delete_tooling_keys",
            field=models.BooleanField(default=False),
        ),
        migrations.CreateModel(
            name="ToolingVehicleKey",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("vehicle_number", models.PositiveSmallIntegerField(unique=True)),
                ("label", models.CharField(blank=True, max_length=160)),
                ("remark", models.TextField(blank=True)),
                ("active", models.BooleanField(default=True)),
            ],
            options={"ordering": ["vehicle_number"]},
        ),
        migrations.CreateModel(
            name="ToolingVehicleKeyLoan",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("borrower_name", models.CharField(max_length=150)),
                ("borrowed_at", models.DateTimeField(auto_now_add=True)),
                ("returned_by_name", models.CharField(blank=True, max_length=150)),
                ("returned_at", models.DateTimeField(blank=True, null=True)),
                ("borrow_remark", models.TextField(blank=True)),
                ("return_remark", models.TextField(blank=True)),
                ("is_deleted", models.BooleanField(default=False)),
                ("borrower_employee", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="tooling_vehicle_key_borrows", to="core.employee")),
                ("created_by_employee", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="created_tooling_vehicle_key_loans", to="core.employee")),
                ("key", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="loans", to="core.toolingvehiclekey")),
                ("returned_by_employee", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="tooling_vehicle_key_returns", to="core.employee")),
                ("updated_by_employee", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="updated_tooling_vehicle_key_loans", to="core.employee")),
            ],
            options={"ordering": ["-borrowed_at", "-created_at"]},
        ),
        migrations.AddConstraint(
            model_name="toolingvehiclekeyloan",
            constraint=models.UniqueConstraint(
                condition=models.Q(("is_deleted", False), ("returned_at__isnull", True)),
                fields=("key",),
                name="uniq_open_tooling_vehicle_key_loan",
            ),
        ),
        migrations.RunPython(grant_admin_key_permissions, migrations.RunPython.noop),
    ]

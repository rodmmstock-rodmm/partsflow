from django.db import migrations, models
from django.db.models.functions import Lower


def normalize_roles_and_lifecycle(apps, schema_editor):
    RoleAccess = apps.get_model("core", "RoleAccess")
    Employee = apps.get_model("core", "Employee")
    OrderRecord = apps.get_model("core", "OrderRecord")

    # Merge role names case-insensitively. Canonical form is uppercase.
    groups = {}
    for role in RoleAccess.objects.all().order_by("created_at", "id"):
        groups.setdefault((role.role_name or "").strip().upper(), []).append(role)

    boolean_fields = [
        f.name for f in RoleAccess._meta.fields
        if isinstance(f, models.BooleanField)
    ]

    for canonical, roles in groups.items():
        if not canonical:
            continue
        keeper = next((r for r in roles if r.role_name == canonical), roles[0])
        changed = False
        for field in boolean_fields:
            value = any(bool(getattr(r, field)) for r in roles)
            if getattr(keeper, field) != value:
                setattr(keeper, field, value)
                changed = True
        if keeper.role_name != canonical:
            keeper.role_name = canonical
            changed = True
        if not keeper.display_name:
            keeper.display_name = next((r.display_name for r in roles if r.display_name), canonical.title())
            changed = True
        if changed:
            keeper.save()
        Employee.objects.filter(role__iexact=canonical).update(role=canonical)
        for dup in roles:
            if dup.pk != keeper.pk:
                dup.delete()

    # Previous v2 used wait_confirm=True while lifecycle remained ACTIVE.
    OrderRecord.objects.filter(
        wait_confirm=True,
        lifecycle_status="ACTIVE",
        received_at__isnull=True,
        cancel_status=False,
    ).update(lifecycle_status="WAIT_CONFIRM")


class Migration(migrations.Migration):
    dependencies = [("core", "0006_order_lifecycle_workflow")]

    operations = [
        migrations.AlterField(
            model_name="orderrecord",
            name="lifecycle_status",
            field=models.CharField(
                choices=[
                    ("ACTIVE", "Active"),
                    ("WAIT_CONFIRM", "Wait Confirm"),
                    ("CANCELLED", "Cancelled"),
                    ("COMPLETED", "Completed"),
                ],
                db_index=True,
                default="ACTIVE",
                max_length=20,
            ),
        ),
        migrations.RunPython(normalize_roles_and_lifecycle, migrations.RunPython.noop),
        migrations.AddConstraint(
            model_name="roleaccess",
            constraint=models.UniqueConstraint(
                Lower("role_name"),
                name="uniq_roleaccess_role_name_ci",
            ),
        ),
    ]

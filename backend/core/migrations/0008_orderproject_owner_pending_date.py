# Generated for PartsFlow Order Project owner/pending-data v4

import django.db.models.deletion
from django.db import migrations, models


def backfill_owner(apps, schema_editor):
    OrderProject = apps.get_model("core", "OrderProject")

    for project in OrderProject.objects.all().iterator(chunk_size=500):
        if not project.owner_employee_id:
            project.owner_employee_id = project.created_by_employee_id

        # Existing Project Orders may already have pending_data_date.
        # Preserve one representative value at Project level.
        if not project.pending_data_date:
            first_date = (
                project.orders.exclude(pending_data_date=None)
                .values_list("pending_data_date", flat=True)
                .first()
            )
            if first_date:
                project.pending_data_date = first_date

        project.save(
            update_fields=[
                "owner_employee",
                "pending_data_date",
            ]
        )

        # Normalize existing Project Orders to the new Project-level rules.
        project.orders.update(
            job=project.department,
            urgent_status="",
            pending_data_date=project.pending_data_date,
        )


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0007_wait_confirm_role_normalize"),
    ]

    operations = [
        migrations.AddField(
            model_name="orderproject",
            name="owner_employee",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="owned_order_projects",
                to="core.employee",
            ),
        ),
        migrations.AddField(
            model_name="orderproject",
            name="pending_data_date",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.RunPython(
            backfill_owner,
            migrations.RunPython.noop,
        ),
    ]

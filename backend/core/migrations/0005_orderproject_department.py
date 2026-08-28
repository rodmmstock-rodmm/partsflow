from django.db import migrations, models


def classify_existing_projects(apps, schema_editor):
    OrderProject = apps.get_model("core", "OrderProject")
    for project in OrderProject.objects.all():
        jobs = set(project.orders.filter(is_deleted=False).values_list("job", flat=True))
        upper = {str(x or "").upper() for x in jobs}
        if "AUTOMATION" in upper and "MODIFY" not in upper:
            project.department = "AUTOMATION"
            project.save(update_fields=["department"])


class Migration(migrations.Migration):
    dependencies = [("core", "0004_jobtype_alter_auditlog_options_and_more")]
    operations = [
        migrations.AddField(
            model_name="orderproject",
            name="department",
            field=models.CharField(
                choices=[("MODIFY", "Modify"), ("AUTOMATION", "Automation")],
                db_index=True,
                default="MODIFY",
                max_length=20,
            ),
        ),
        migrations.RunPython(classify_existing_projects, migrations.RunPython.noop),
    ]

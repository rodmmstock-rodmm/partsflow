from django.db import migrations, models
from django.db.models import Q


def enable_admin_requester_selection(apps, schema_editor):
    RoleAccess = apps.get_model("core", "RoleAccess")
    RoleAccess.objects.filter(
        Q(role_name__iexact="ADMIN") | Q(role_name__iexact="ADMINISTRATOR")
    ).update(can_select_issue_requester=True)


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0034_fastorderpreset_amount_drop_name"),
    ]

    operations = [
        migrations.AddField(
            model_name="roleaccess",
            name="can_select_issue_requester",
            field=models.BooleanField(default=False),
        ),
        migrations.RunPython(enable_admin_requester_selection, migrations.RunPython.noop),
    ]

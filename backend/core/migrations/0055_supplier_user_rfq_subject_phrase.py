from django.db import migrations, models
import uuid
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0054_supplier_user_rfq_message"),
    ]

    operations = [
        migrations.CreateModel(
            name="EmployeeRFQSubjectSetting",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, primary_key=True, serialize=False, editable=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("topic_code", models.CharField(default="RFQ", max_length=60)),
                ("phrase", models.CharField(blank=True, default="", max_length=250)),
                ("employee", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="rfq_subject_settings",
                    to="core.employee",
                )),
            ],
            options={
                "ordering": ["topic_code"],
            },
        ),
        migrations.AddConstraint(
            model_name="employeerfqsubjectsetting",
            constraint=models.UniqueConstraint(
                fields=("employee", "topic_code"),
                name="uniq_employee_rfq_subject_topic",
            ),
        ),
    ]

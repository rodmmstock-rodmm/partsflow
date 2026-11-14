from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0050_employee_rfq_message"),
    ]

    operations = [
        migrations.AddField(
            model_name="employee",
            name="image_path",
            field=models.TextField(blank=True),
        ),
    ]

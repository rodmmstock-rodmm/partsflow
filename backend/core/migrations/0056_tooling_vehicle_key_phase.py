from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("core", "0055_supplier_user_rfq_subject_phrase")]

    operations = [
        migrations.AddField(
            model_name="toolingvehiclekey",
            name="phase",
            field=models.CharField(
                blank=True,
                choices=[("4", "Phase 4"), ("11", "Phase 11")],
                max_length=2,
                null=True,
            ),
        ),
    ]

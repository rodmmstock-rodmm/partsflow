from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0054_supplier_user_rfq_message"),
    ]

    operations = [
        migrations.AddField(
            model_name="supplierrfqmessage",
            name="subject_phrase",
            field=models.CharField(blank=True, default="", max_length=250),
        ),
    ]

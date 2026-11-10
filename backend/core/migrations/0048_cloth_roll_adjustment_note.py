# Add optional notes to cloth-roll adjustment history.
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0047_tooling_item_image"),
    ]

    operations = [
        migrations.AddField(
            model_name="clothrolltransaction",
            name="note",
            field=models.TextField(blank=True),
        ),
    ]

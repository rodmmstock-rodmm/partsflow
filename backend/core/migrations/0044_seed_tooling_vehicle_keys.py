from django.db import migrations


class Migration(migrations.Migration):
    # Keep this migration schema-neutral. Seeding the 13 starter keys is an
    # explicit operational action, not an automatic side effect of deployment.
    dependencies = [
        ("core", "0043_tooling_vehicle_key_loans"),
    ]

    operations = []

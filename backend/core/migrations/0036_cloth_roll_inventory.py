# Generated for the cloth-roll inventory feature.
import uuid
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0035_roleaccess_can_select_issue_requester"),
    ]

    operations = [
        migrations.CreateModel(
            name="ClothRollStock",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("phase", models.CharField(choices=[("PHASE4", "Phase 4"), ("PHASE11", "Phase 11")], max_length=12, unique=True)),
                ("quantity", models.PositiveIntegerField(default=0)),
                ("low_stock_threshold", models.PositiveIntegerField(default=0)),
                ("low_stock_notified", models.BooleanField(default=False)),
            ],
            options={"ordering": ["phase"]},
        ),
        migrations.CreateModel(
            name="ClothRollTransaction",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("phase", models.CharField(choices=[("PHASE4", "Phase 4"), ("PHASE11", "Phase 11")], max_length=12)),
                ("transaction_type", models.CharField(choices=[("OUT", "เบิก"), ("IN", "รับเข้า")], max_length=3)),
                ("quantity", models.PositiveIntegerField()),
                ("balance_after", models.PositiveIntegerField()),
                ("source", models.CharField(choices=[("WEB", "Web"), ("QR", "QR")], default="WEB", max_length=8)),
                ("borrower_employee", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="cloth_roll_borrowings", to="core.employee")),
                ("recorded_by_employee", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="cloth_roll_records", to="core.employee")),
            ],
            options={"ordering": ["-created_at"]},
        ),
    ]

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0031_tool_equipment_loan"),
    ]

    operations = [
        migrations.AddField(
            model_name="roleaccess",
            name="can_view_qr_withdraw",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="roleaccess",
            name="can_add_qr_withdraw_item",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="roleaccess",
            name="can_edit_qr_withdraw_item",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="roleaccess",
            name="can_delete_qr_withdraw_item",
            field=models.BooleanField(default=False),
        ),
    ]

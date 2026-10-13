from django.db import migrations, models


def apply_if_needed(apps, schema_editor):
    """Idempotent: production was already altered by hand ahead of this
    deploy (amount added + backfilled, name dropped), so only touch what is
    still missing/present. Works on PostgreSQL and SQLite."""
    connection = schema_editor.connection
    with connection.cursor() as cursor:
        columns = {
            c.name
            for c in connection.introspection.get_table_description(
                cursor, "core_fastorderpreset"
            )
        }
    if "amount" not in columns:
        schema_editor.execute(
            "ALTER TABLE core_fastorderpreset ADD COLUMN amount integer NOT NULL DEFAULT 0"
        )
    if "name" in columns:
        schema_editor.execute("ALTER TABLE core_fastorderpreset DROP COLUMN name")


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0033_fastorderpreset_machine_nullable"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunPython(apply_if_needed, migrations.RunPython.noop),
            ],
            state_operations=[
                migrations.AddField(
                    model_name="fastorderpreset",
                    name="amount",
                    field=models.PositiveIntegerField(default=0),
                ),
                migrations.RemoveField(
                    model_name="fastorderpreset",
                    name="name",
                ),
            ],
        ),
    ]

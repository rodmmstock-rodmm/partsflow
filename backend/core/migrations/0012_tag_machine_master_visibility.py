from django.db import migrations


CURRENT_SOURCE = "PDF_MACHINE_MASTER_20260829"
RETIRED_SOURCE = "PDF_MACHINE_MASTER_RETIRED_20260829"


def tag_machine_master(apps, schema_editor):
    Machine = apps.get_model("core", "Machine")

    # Migration 0011 guarantees that every approved PDF code is active and
    # every pre-existing code not in the PDF is inactive. Tag that state so
    # the Machines page can hide retired records while historical FKs remain.
    Machine.objects.filter(active=True).exclude(code__iexact="COMMON").update(
        legacy_source=CURRENT_SOURCE
    )
    Machine.objects.filter(active=False).exclude(legacy_source=CURRENT_SOURCE).update(
        legacy_source=RETIRED_SOURCE
    )


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0011_machine_master_pdf_20260829"),
    ]

    operations = [
        migrations.RunPython(tag_machine_master, migrations.RunPython.noop),
    ]

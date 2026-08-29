import base64
import json
import zlib

from django.db import migrations


SOURCE = "PDF_MACHINE_MASTER_20260829"
DATA_B64 = "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"


def machine_rows():
    raw = zlib.decompress(base64.b64decode(DATA_B64)).decode("utf-8")
    return json.loads(raw)


def import_machine_master(apps, schema_editor):
    Machine = apps.get_model("core", "Machine")
    rows = machine_rows()
    source_codes = {row[0] for row in rows}

    for code, name, dept_code, work_code in rows:
        machine = Machine.objects.filter(code=code).first()
        if machine is None:
            Machine.objects.create(
                code=code,
                name=name,
                dept_code=dept_code,
                work_code=work_code,
                active=True,
                legacy_source=SOURCE,
                legacy_id=code,
            )
            continue

        changed = []
        for field, value in (
            ("name", name),
            ("dept_code", dept_code),
            ("work_code", work_code),
        ):
            if getattr(machine, field) != value:
                setattr(machine, field, value)
                changed.append(field)
        if not machine.active:
            machine.active = True
            changed.append("active")
        if changed:
            changed.append("updated_at")
            machine.save(update_fields=changed)

    # Keep the system fallback used by Safety Stock orders.
    common, _ = Machine.objects.get_or_create(
        code="COMMON",
        defaults={
            "name": "COMMON",
            "legacy_source": "SYSTEM",
            "legacy_id": "COMMON",
            "active": True,
        },
    )
    if not common.active:
        common.active = True
        common.save(update_fields=["active", "updated_at"])

    # Preserve IDs/history: old codes become inactive rather than being deleted.
    Machine.objects.exclude(code__in=source_codes | {"COMMON"}).update(active=False)


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0010_machine_spare_sets"),
    ]

    operations = [
        migrations.RunPython(import_machine_master, migrations.RunPython.noop),
    ]

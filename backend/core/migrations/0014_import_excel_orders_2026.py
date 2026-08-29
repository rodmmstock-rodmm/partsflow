import base64
import hashlib
import json
import lzma
import re
from datetime import date, datetime, time
from decimal import Decimal
from pathlib import Path
from uuid import uuid4

from django.db import migrations
from django.utils import timezone


SOURCE = "EXCEL_ORDER_2026"
PAYLOAD_LENGTH = 189160
PAYLOAD_SHA256 = "31468142039ed7466b9062dd155b40aa5f70f198effb49972bc1af9e370c9cbb"
EXPECTED_ROWS = 4107


def _norm(value):
    value = str(value or "").strip().casefold()
    return "".join(ch for ch in value if ch.isalnum())


def _unique_map(objects, attrs):
    buckets = {}
    for obj in objects:
        keys = set()
        for attr in attrs:
            value = getattr(obj, attr, "") or ""
            if value:
                keys.add(str(value).strip().casefold())
                normalized = _norm(value)
                if normalized:
                    keys.add(normalized)
        for key in keys:
            buckets.setdefault(key, []).append(obj)
    return {key: values[0] for key, values in buckets.items() if len(values) == 1}


def _resolve(mapping, raw):
    raw = str(raw or "").strip()
    if not raw:
        return None
    return mapping.get(raw.casefold()) or mapping.get(_norm(raw))


def _as_date(value):
    return date.fromisoformat(value) if value else None


def _as_dt(value):
    if not value:
        return None
    d = date.fromisoformat(value)
    naive = datetime.combine(d, time(hour=12))
    return timezone.make_aware(naive, timezone.get_current_timezone())


def _status(row):
    if row.get("receive_date"):
        return "Complete Order", "COMPLETED"
    if row.get("po_number"):
        if row.get("issue_pr_date") or row.get("due_date"):
            return "Wait for Item", "ACTIVE"
        return "Wait Issue P/R", "ACTIVE"
    if row.get("quotation") and row.get("vendor_raw"):
        return "Wait Issue P/R", "ACTIVE"
    if row.get("quotation"):
        return "Wait Quotation", "ACTIVE"
    return "New Order", "ACTIVE"


def _load_payload_rows():
    directory = Path(__file__).parent
    first = (directory / "order_import_2026_payload_01a.txt").read_text(encoding="utf-8").strip()
    fix = (directory / "order_import_2026_payload_01a_fix_0500_0999.txt").read_text(encoding="utf-8").strip()
    if len(first) != 4000 or len(fix) != 500:
        raise RuntimeError("Order import first payload segment has invalid length")
    first = first[:500] + fix + first[1000:]
    if hashlib.sha256(first.encode("ascii")).hexdigest() != "7e73f1cef4d321bd412e7b0790c4256897c15821ef53448e1f4b41d088b8694c":
        raise RuntimeError("Order import first payload segment checksum mismatch")

    pieces = [first]
    for filename in (
        "order_import_2026_payload_01b.txt",
        "order_import_2026_payload_01c.txt",
        "order_import_2026_payload_01d.txt",
        *tuple(f"order_import_2026_payload_{index:02d}.txt" for index in range(2, 13)),
    ):
        pieces.append((directory / filename).read_text(encoding="utf-8").strip())

    encoded = "".join(pieces)
    if len(encoded) != PAYLOAD_LENGTH:
        raise RuntimeError(
            f"Order import payload length mismatch: expected {PAYLOAD_LENGTH}, got {len(encoded)}"
        )
    digest = hashlib.sha256(encoded.encode("ascii")).hexdigest()
    if digest != PAYLOAD_SHA256:
        raise RuntimeError(
            f"Order import payload checksum mismatch: expected {PAYLOAD_SHA256}, got {digest}"
        )
    rows = json.loads(lzma.decompress(base64.b64decode(encoded)).decode("utf-8"))
    if len(rows) != EXPECTED_ROWS:
        raise RuntimeError(
            f"Order import payload row count mismatch: expected {EXPECTED_ROWS}, got {len(rows)}"
        )
    return rows


def import_orders(apps, schema_editor):
    OrderRecord = apps.get_model("core", "OrderRecord")
    Machine = apps.get_model("core", "Machine")
    Part = apps.get_model("core", "Part")
    Supplier = apps.get_model("core", "Supplier")
    Employee = apps.get_model("core", "Employee")
    AuditLog = apps.get_model("core", "AuditLog")

    rows = _load_payload_rows()

    machine_map = _unique_map(Machine.objects.all(), ("code", "name"))
    part_map = _unique_map(Part.objects.all(), ("sku",))
    supplier_map = _unique_map(Supplier.objects.all(), ("code", "name"))
    employee_map = _unique_map(Employee.objects.all(), ("employee_code", "name"))

    orders = []
    source_details = []

    for row in rows:
        machine = _resolve(machine_map, row.get("machine_raw"))
        part = _resolve(part_map, row.get("item_id"))
        vendor = _resolve(supplier_map, row.get("vendor_raw"))
        ordered_by = _resolve(employee_map, row.get("ordered_by_raw"))

        status, lifecycle = _status(row)
        received_at = _as_dt(row.get("receive_date"))
        order_date = _as_date(row["order_date"])
        issue_pr_date = _as_date(row.get("issue_pr_date"))
        due_date = _as_date(row.get("due_date"))
        vendor_confirm_date = _as_date(row.get("vendor_confirm_date"))
        pending_date = _as_date(row.get("pending_date"))

        price_per_unit = Decimal(str(row.get("price_per_unit") or 0))
        source_total = row.get("price_total")
        price_total = (
            Decimal(str(source_total))
            if source_total is not None
            else Decimal(str(row.get("amount") or 0)) * price_per_unit
        )

        edit_status = ""
        if pending_date:
            if status == "Wait Quotation":
                edit_status = "รออัพเดต Wait Quotation"
            elif status == "Wait for Item":
                edit_status = "รออัพเดต Wait for Item"
            elif status == "Complete Order":
                edit_status = "รออัพเดต Complete Order"

        group_order = ""
        if machine and (row.get("urgent_status") or pending_date):
            group_order = f"{machine.code}_{order_date.strftime('%d%m%Y')}"

        oid = uuid4()
        sheet_code = re.sub(r"[^A-Za-z0-9]", "", row["sheet"]).upper()
        order_number = f"IMP-{sheet_code}-{int(row['row']):04d}"

        orders.append(
            OrderRecord(
                id=oid,
                legacy_source=SOURCE,
                legacy_id=f"{row['sheet']}:{row['row']}",
                order_number=order_number,
                order_date=order_date,
                factory="MM-4",
                group_order=group_order,
                machine_id=machine.id if machine else None,
                job=str(row.get("job") or "GENERAL")[:80],
                urgent_status=str(row.get("urgent_status") or "")[:120],
                pending_data_date=pending_date,
                remark=str(row.get("remark") or ""),
                quotation=str(row.get("quotation") or ""),
                part_id=part.id if part else None,
                part_name=str(row.get("part_name") or "-")[:300],
                part_detail=str(row.get("part_detail") or ""),
                maker_text=str(row.get("maker") or "")[:250],
                amount=max(1, int(row.get("amount") or 1)),
                unit_text=str(row.get("unit") or "PCS")[:80],
                po_number=str(row.get("po_number") or "")[:120],
                price_per_unit=price_per_unit,
                price_total=price_total,
                vendor_id=vendor.id if vendor else None,
                lead_time_days=(
                    max(0, int(row["lead_time_days"]))
                    if row.get("lead_time_days") is not None else None
                ),
                ordered_by_id=ordered_by.id if ordered_by else None,
                issue_pr_date=issue_pr_date,
                due_date=due_date,
                vendor_confirm_date=vendor_confirm_date,
                received_at=received_at,
                person_in_charge_id=None,
                recorded_by_id=None,
                status=status,
                wait_confirm=False,
                lifecycle_status=lifecycle,
                cancel_status=False,
                completed_at=received_at,
                completed_by_employee_id=None,
                completion_note="",
                edit_data_status=edit_status,
                edit_workflow_enabled=bool(pending_date),
                source_type="NORMAL",
                project_id=None,
                step_id=None,
                usage_status="USED",
                stock_received=False,
                stock_transaction_id=None,
                is_deleted=False,
            )
        )

        detail = dict(row)
        detail["linked_machine"] = bool(machine)
        detail["linked_part"] = bool(part)
        detail["linked_vendor"] = bool(vendor)
        detail["linked_ordered_by"] = bool(ordered_by)
        source_details.append((oid, detail))

    OrderRecord.objects.bulk_create(orders, batch_size=250)

    AuditLog.objects.bulk_create(
        [
            AuditLog(
                employee_id=None,
                action="ORDER_IMPORT_SOURCE",
                entity="OrderRecord",
                entity_id=str(oid),
                detail=detail,
            )
            for oid, detail in source_details
        ],
        batch_size=250,
    )


def reverse_import(apps, schema_editor):
    OrderRecord = apps.get_model("core", "OrderRecord")
    AuditLog = apps.get_model("core", "AuditLog")
    ids = list(
        OrderRecord.objects.filter(legacy_source=SOURCE)
        .values_list("id", flat=True)
    )
    if ids:
        AuditLog.objects.filter(
            entity="OrderRecord",
            action="ORDER_IMPORT_SOURCE",
            entity_id__in=[str(value) for value in ids],
        ).delete()
    OrderRecord.objects.filter(legacy_source=SOURCE).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0013_purge_existing_order_data"),
    ]

    operations = [
        migrations.RunPython(import_orders, reverse_import),
    ]

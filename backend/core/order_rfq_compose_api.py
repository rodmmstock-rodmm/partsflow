from collections import OrderedDict
from html import escape
from unicodedata import east_asian_width

from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .auth_api import require_permission
from .models import OrderRecord, Supplier


JOB_CODES = {
    "REPAIR": "R",
    "REPAIR JOB": "R",
    "AUTOMATION": "IMP",
    "MODIFY": "MO",
    "SPARE": "S",
    "PM": "PM",
    "GENERAL": "G",
}


def _date_label(value):
    return value.strftime("%d/%m/%Y") if value else ""


def _job_code(value):
    normalized = str(value or "").strip().upper()
    return JOB_CODES.get(normalized, normalized or "G")


def _display_width(value):
    return sum(2 if east_asian_width(char) in ("F", "W") else 1 for char in value)


def _pad_cell(value, width):
    return value + (" " * max(0, width - _display_width(value)))


def _format_rfq_table(orders):
    rows = [
        [
            row.part.sku if row.part else "-",
            row.part_name or "-",
            row.maker_text or "-",
            str(row.amount if row.amount is not None else ""),
            row.unit_text or "-",
        ]
        for row in orders
    ]
    widths = [
        max(_display_width(row[index]) for row in rows)
        for index in range(5)
    ]

    def border(left, middle, right):
        return left + middle.join("─" * (width + 2) for width in widths) + right

    lines = [border("┌", "┬", "┐")]
    for index, row in enumerate(rows):
        cells = [" " + _pad_cell(value, widths[column]) + " " for column, value in enumerate(row)]
        lines.append("│" + "│".join(cells) + "│")
        if index < len(rows) - 1:
            lines.append(border("├", "┼", "┤"))
    lines.append(border("└", "┴", "┘"))
    return "\n".join(lines)


def _format_rfq_table_html(orders):
    rows = [
        [
            row.part.sku if row.part else "-",
            row.part_name or "-",
            row.maker_text or "-",
            str(row.amount if row.amount is not None else ""),
            row.unit_text or "-",
        ]
        for row in orders
    ]
    cells = []
    for row in rows:
        cells.append(
            "<tr>"
            + "".join(
                '<td style="border:1px solid #333333;padding:6px 8px;vertical-align:top;">'
                f"{escape(str(value))}</td>"
                for value in row
            )
            + "</tr>"
        )
    return (
        '<table style="border-collapse:collapse;border-spacing:0;'
        'font-family:Arial,sans-serif;font-size:13px;color:#222222;">'
        "<tbody>"
        + "".join(cells)
        + "</tbody></table>"
    )

def _compose_group(group, vendor):
    requesters = []
    for row in group["orders"]:
        name = str(row.ordered_by.name if row.ordered_by else "").strip()
        if name and name not in requesters:
            requesters.append(name)

    parts = [
        vendor.name,
        "รบกวนขอราคา",
        group["machine_code"],
        f'({group["job_code"]})',
        ", ".join(requesters),
        _date_label(group["pending_data_date"]),
    ]
    subject = " ".join(part for part in parts if part).strip()

    table = _format_rfq_table(group["orders"])
    table_html = _format_rfq_table_html(group["orders"])
    message = vendor.rfq_message or ""
    body = f"{message}\n\n{table}" if message else table

    return {
        "group_key": group["key"],
        "machine_code": group["machine_code"],
        "job_code": group["job_code"],
        "pending_data_date": _date_label(group["pending_data_date"]),
        "order_numbers": [row.order_number for row in group["orders"]],
        "subject": subject,
        "to": vendor.email,
        "cc": group["cc_emails"],
        "body": body,
        "message": message,
        "table_html": table_html,
        "table_text": table,
    }


def compose_order_rfq_data(request):
    actor, err = require_permission(request, "can_create_rfq")
    if err:
        return err

    order_ids = request.data.get("order_ids")
    vendor_id = str(request.data.get("vendor_id") or "").strip()
    if not isinstance(order_ids, list) or not order_ids:
        return Response({"detail": "กรุณาเลือก Order อย่างน้อย 1 รายการ"}, status=400)
    if len(order_ids) > 200:
        return Response({"detail": "เลือก Order ได้ไม่เกิน 200 รายการต่อครั้ง"}, status=400)
    ordered_ids = list(dict.fromkeys(str(value) for value in order_ids if value))
    if not ordered_ids:
        return Response({"detail": "ไม่พบ Order ที่เลือก"}, status=400)

    vendor = Supplier.objects.prefetch_related("contacts").filter(
        pk=vendor_id, active=True
    ).first()
    if not vendor:
        return Response({"detail": "ไม่พบ Vendor หรือ Vendor ถูกปิดใช้งาน"}, status=404)

    primary_email = str(vendor.email or "").strip()
    if not primary_email:
        return Response(
            {"detail": "Vendor รายนี้ยังไม่มี Email หลัก กรุณาบันทึก Email หลักใน Vendor Master ก่อนสร้าง RFQ"},
            status=400,
        )
    try:
        validate_email(primary_email)
    except ValidationError:
        return Response({"detail": "Email หลักของ Vendor ไม่ถูกต้อง"}, status=400)

    qs = OrderRecord.objects.filter(
        pk__in=ordered_ids,
        is_deleted=False,
        cancel_status=False,
        lifecycle_status__in=[
            OrderRecord.LIFECYCLE_ACTIVE,
            OrderRecord.LIFECYCLE_WAIT_CONFIRM,
        ],
        received_at__isnull=True,
    ).exclude(status=OrderRecord.STATUS_COMPLETE).select_related(
        "machine", "ordered_by", "part"
    )
    by_id = {str(row.id): row for row in qs}
    missing = [value for value in ordered_ids if value not in by_id]
    if missing:
        return Response(
            {"detail": "มี Order ที่ถูกยกเลิก เสร็จสิ้น หรือลบไปแล้ว กรุณาตรวจสอบรายการที่เลือกใหม่"},
            status=400,
        )

    cc_emails = []
    for contact in vendor.contacts.all():
        email = str(contact.email or "").strip().lower()
        if not email or email == primary_email.lower() or email in cc_emails:
            continue
        try:
            validate_email(email)
        except ValidationError:
            continue
        cc_emails.append(email)

    groups = OrderedDict()
    for order_id in ordered_ids:
        order = by_id[order_id]
        machine_code = str(order.machine.code if order.machine else "").strip()
        job_code = _job_code(order.job)
        pending_date = order.pending_data_date
        date_key = pending_date.isoformat() if pending_date else ""
        key = (machine_code, job_code, date_key)
        if key not in groups:
            groups[key] = {
                "key": "|".join(key),
                "machine_code": machine_code,
                "job_code": job_code,
                "pending_data_date": pending_date,
                "orders": [],
                "cc_emails": cc_emails,
            }
        groups[key]["orders"].append(order)

    return Response({
        "vendor": vendor.name,
        "groups": [_compose_group(group, vendor) for group in groups.values()],
    })


@csrf_exempt
@api_view(["POST"])
@permission_classes([AllowAny])
def compose_order_rfq(request):
    return compose_order_rfq_data(request)

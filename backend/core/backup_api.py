from io import BytesIO
from itertools import islice

from django.http import HttpResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill
from openpyxl.utils import get_column_letter
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny

from .auth_api import require_permission
from .models import Inventory, Part, ToolEquipment, ToolingItem


def _write_sheet(workbook, title, headers, rows):
    sheet = workbook.create_sheet(title)
    sheet.append(headers)
    for row in rows:
        sheet.append([_cell_value(value) for value in row])
    sheet.freeze_panes = "A2"
    sheet.auto_filter.ref = sheet.dimensions
    for cell in sheet[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="3978B8")
    for column in sheet.columns:
        values = [len(str(cell.value or "")) for cell in islice(column, 200)]
        width = min(max(max(values, default=10) + 2, 12), 42)
        sheet.column_dimensions[get_column_letter(column[0].column)].width = width
    return sheet


def _cell_value(value):
    if value is None:
        return ""
    if getattr(value, "tzinfo", None) is not None:
        return timezone.localtime(value).replace(tzinfo=None)
    return value


def _metadata_sheet(workbook, title, record_count, notes):
    sheet = workbook.active
    sheet.title = "ข้อมูลการสำรอง"
    sheet.append(["รายการ", "รายละเอียด"])
    sheet.append(["ประเภทข้อมูล", title])
    sheet.append(["จำนวนรายการหลัก", record_count])
    sheet.append(["วันที่สำรอง", timezone.localtime(timezone.now()).strftime("%Y-%m-%d %H:%M:%S")])
    sheet.append(["ขอบเขต", notes])
    sheet.append(["หมายเหตุ", "ไฟล์นี้เป็นสำเนาข้อมูลสำหรับ Backup เท่านั้น ไม่ได้แก้ไขข้อมูลในระบบ"])
    for cell in sheet[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="3978B8")
    sheet.column_dimensions["A"].width = 24
    sheet.column_dimensions["B"].width = 90
    sheet.freeze_panes = "A2"


def _excel_response(workbook, filename):
    output = BytesIO()
    workbook.save(output)
    output.seek(0)
    response = HttpResponse(
        output.getvalue(),
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    response["Cache-Control"] = "no-store"
    return response


@csrf_exempt
@api_view(["GET"])
@permission_classes([AllowAny])
def stock_backup(request):
    _, error = require_permission(request, "can_view_parts")
    if error:
        return error

    parts = list(
        Part.objects.select_related("maker", "unit", "default_supplier", "location")
        .order_by("sku")
    )
    inventory_rows = list(
        Inventory.objects.select_related("part", "part__unit", "location")
        .order_by("part__sku", "location__code")
    )
    totals = {}
    for item in inventory_rows:
        totals[item.part_id] = totals.get(item.part_id, 0) + (item.quantity or 0)

    workbook = Workbook()
    _metadata_sheet(
        workbook,
        "Stock",
        len(parts),
        "รายการอะไหล่ทั้งหมดทั้ง Active และ Inactive พร้อมยอดคงเหลือรวมและยอดแยกตามตำแหน่งจัดเก็บ ไม่รวมประวัติรับเข้า เบิก และปรับยอด",
    )
    _write_sheet(
        workbook,
        "รายการอะไหล่",
        [
            "SKU", "Part ID", "Legacy Source", "Legacy ID", "ชื่ออะไหล่", "รายละเอียด",
            "Maker", "Maker ID", "หน่วย", "Unit ID", "Supplier", "Supplier ID",
            "ตำแหน่งหลัก", "Location ID", "ยอดคงเหลือรวม", "Min Stock", "Max Stock",
            "Reorder Qty", "Vendor Lead Time (วัน)", "Purchasing Lead Time (วัน)",
            "Total Lead Time (วัน)", "ราคาซื้อล่าสุด", "Critical", "สถานะ",
            "Image Path / URL", "หมายเหตุ", "Created At", "Updated At",
        ],
        [
            [
                part.sku, str(part.id), part.legacy_source, part.legacy_id,
                part.name, part.description, part.maker.name if part.maker else "",
                str(part.maker_id or ""), part.unit.code if part.unit else "",
                str(part.unit_id or ""),
                part.default_supplier.name if part.default_supplier else "",
                str(part.default_supplier_id or ""),
                part.location.code if part.location else "", str(part.location_id or ""),
                totals.get(part.id, 0), part.min_stock, part.max_stock, part.reorder_qty,
                part.vendor_lead_time_days, part.purchasing_lead_time_days,
                part.total_lead_time_days, part.last_purchase_price,
                "Yes" if part.critical else "No",
                "Active" if part.active else "Inactive",
                part.image_path, part.remark, part.created_at, part.updated_at,
            ]
            for part in parts
        ],
    )
    _write_sheet(
        workbook,
        "ยอดตามตำแหน่ง",
        ["Inventory ID", "Legacy Source", "Legacy ID", "Part ID", "SKU", "ชื่ออะไหล่", "Location ID", "ตำแหน่งจัดเก็บ", "คลัง", "จำนวนคงเหลือ", "หน่วย", "Created At", "Updated At"],
        [
            [
                str(row.id), row.legacy_source, row.legacy_id, str(row.part_id),
                row.part.sku, row.part.name, str(row.location_id or ""),
                row.location.code if row.location else "",
                row.location.warehouse if row.location else "",
                row.quantity, row.part.unit.code if row.part.unit else "",
                row.created_at, row.updated_at,
            ]
            for row in inventory_rows
        ],
    )
    stamp = timezone.localtime(timezone.now()).strftime("%Y%m%d_%H%M")
    return _excel_response(workbook, f"partsflow_stock_backup_{stamp}.xlsx")


@csrf_exempt
@api_view(["GET"])
@permission_classes([AllowAny])
def tooling_backup(request):
    _, error = require_permission(request, "can_view_tooling")
    if error:
        return error
    items = list(ToolingItem.objects.all().order_by("name"))
    workbook = Workbook()
    _metadata_sheet(
        workbook,
        "Tooling รถเครื่องมือ",
        len(items),
        "รายการ Tooling ทั้งหมดทั้ง Active และ Inactive รวมจำนวนคงเหลือและจำนวนขั้นต่ำ ไม่รวมประวัติการเบิก",
    )
    _write_sheet(
        workbook,
        "รายการ Tooling",
        ["ชื่ออุปกรณ์", "หมายเลขอุปกรณ์", "Tooling ID", "Model", "Location", "Maker", "จำนวนคงเหลือ", "จำนวนขั้นต่ำ", "จำนวนที่ต้องสั่ง", "หน่วย", "สถานะ", "Image Path / URL", "Created At", "Updated At"],
        [
            [item.name, item.equipment_number, str(item.id), item.detail, item.location, item.maker, item.quantity,
             item.min_quantity, item.order_quantity, item.unit,
             "Active" if item.active else "Inactive", item.image_path, item.created_at, item.updated_at]
            for item in items
        ],
    )
    stamp = timezone.localtime(timezone.now()).strftime("%Y%m%d_%H%M")
    return _excel_response(workbook, f"partsflow_tooling_backup_{stamp}.xlsx")


@csrf_exempt
@api_view(["GET"])
@permission_classes([AllowAny])
def gauge_control_backup(request):
    _, error = require_permission(request, "can_view_tools")
    if error:
        return error
    equipment = list(ToolEquipment.objects.all().order_by("code"))
    workbook = Workbook()
    _metadata_sheet(
        workbook,
        "Gauge Control",
        len(equipment),
        "รายการอุปกรณ์ Gauge Control ทั้งหมดทั้ง Active และ Inactive รวมสถานะปัจจุบัน ไม่รวมประวัติการยืม-คืน",
    )
    _write_sheet(
        workbook,
        "รายการ Gauge Control",
        ["Code", "Equipment ID", "ชื่ออุปกรณ์", "Model", "Maker", "Serial Number",
         "ตำแหน่งจัดเก็บ", "Warehouse (legacy)", "สถานะการยืม-คืน", "สถานะรายการ",
         "Image Path / URL", "หมายเหตุ", "Created At", "Updated At"],
        [
            [
                item.code, str(item.id), item.name, item.category, item.maker,
                item.serial_number, item.location, item.warehouse,
                "ถูกยืม" if item.status == ToolEquipment.STATUS_BORROWED else "อยู่ในสต๊อก",
                "Active" if item.active else "Inactive", item.image_path, item.remark,
                item.created_at, item.updated_at,
            ]
            for item in equipment
        ],
    )
    stamp = timezone.localtime(timezone.now()).strftime("%Y%m%d_%H%M")
    return _excel_response(workbook, f"partsflow_gauge_control_backup_{stamp}.xlsx")

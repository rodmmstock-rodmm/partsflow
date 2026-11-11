"""Seed disposable Order RFQ fixtures for isolated browser E2E tests only."""
import os
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django  # noqa: E402
django.setup()

from core.models import Employee, Machine, OrderRecord, RoleAccess, Supplier, SupplierContact  # noqa: E402

role, _ = RoleAccess.objects.update_or_create(
    role_name="TOOLING_UI_TEST",
    defaults={
        "active": True,
        "can_view_dashboard": True,
        "can_view_parts": True,
        "can_view_history": True,
        "can_view_safety_stock": True,
        "can_view_orders": True,
        "can_create_rfq": True,
        "can_view_tooling": True,
        "can_withdraw_tooling": True,
        "can_add_tooling": True,
        "can_edit_tooling": True,
        "can_delete_tooling": True,
        "can_view_tools": True,
        "can_add_tool": True,
        "can_edit_tool": True,
        "can_delete_tool": True,
        "can_view_tooling_keys": True,
        "can_edit_tooling_keys": True,
        "can_delete_tooling_keys": True,
    },
)
employee, _ = Employee.objects.update_or_create(
    employee_code="UI-TEST-001",
    defaults={
        "name": "Tooling UI Tester",
        "role": role.role_name,
        "department": "QA",
        "active": True,
    },
)
machine, _ = Machine.objects.update_or_create(
    code="MC-RFQ-E2E",
    defaults={"name": "RFQ E2E Machine", "active": True},
)
vendor, _ = Supplier.objects.update_or_create(
    code="VENDOR-RFQ-E2E",
    defaults={
        "name": "RFQ E2E Vendor",
        "email": "rfq-primary@example.com",
        "rfq_message": "Please quote the following items.\nThank you.",
        "active": True,
    },
)
SupplierContact.objects.update_or_create(
    supplier=vendor,
    email="rfq-cc@example.com",
    defaults={"name": "RFQ E2E Contact", "role": "Sales"},
)

for number, part_name, sku in [
    ("ORD-RFQ-E2E-001", "RFQ E2E Bearing", "RFQ-E2E-001"),
    ("ORD-RFQ-E2E-002", "RFQ E2E Seal", "RFQ-E2E-002"),
]:
    OrderRecord.objects.update_or_create(
        order_number=number,
        defaults={
            "order_date": date.today(),
            "factory": "MM-4",
            "machine": machine,
            "job": "REPAIR",
            "part_name": part_name,
            "part_detail": "Disposable RFQ browser test item",
            "maker_text": "E2E Maker",
            "amount": 2,
            "unit_text": "EA",
            "ordered_by": employee,
            "status": OrderRecord.STATUS_NEW,
            "lifecycle_status": OrderRecord.LIFECYCLE_ACTIVE,
            "cancel_status": False,
            "is_deleted": False,
        },
    )

print("Seeded isolated RFQ E2E fixtures: permission, Vendor, Contact, Machine, and two active Orders.")

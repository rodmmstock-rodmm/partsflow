"""Seed a disposable SQLite database for the isolated Tooling browser tests only."""
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django  # noqa: E402

django.setup()

from core.models import Employee, RoleAccess, ToolEquipment, ToolingItem, ToolingVehicleKey  # noqa: E402


role, _ = RoleAccess.objects.update_or_create(
    role_name="TOOLING_UI_TEST",
    defaults={
        "active": True,
        "can_view_dashboard": True,
        "can_view_parts": True,
        "can_view_history": True,
        "can_view_safety_stock": True,
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
Employee.objects.update_or_create(
    employee_code="UI-TEST-001",
    defaults={
        "name": "Tooling UI Tester",
        "role": role.role_name,
        "department": "QA",
        "active": True,
    },
)
Employee.objects.update_or_create(
    employee_code="UI-TEST-002",
    defaults={
        "name": "Tooling UI Returner",
        "role": role.role_name,
        "department": "QA",
        "active": True,
    },
)
ToolingVehicleKey.objects.update_or_create(
    vehicle_number=7,
    defaults={"label": "E2E Test Vehicle Key", "remark": "Disposable browser-test key", "active": True},
)
ToolingItem.objects.update_or_create(
    name="E2E Test Sealant",
    defaults={
        "equipment_number": "GTOOL00001",
        "detail": "Model-E2E-01",
        "location": "MM-4-46-1",
        "maker": "Test Maker",
        "quantity": 4,
        "min_quantity": 5,
        "order_quantity": 4,
        "unit": "pcs",
        "active": True,
    },
)
ToolEquipment.objects.update_or_create(
    code="E2E-GAUGE-001",
    defaults={
        "name": "E2E Gauge Caliper",
        "category": "Digital Caliper",
        "maker": "Gauge Test Maker",
        "serial_number": "GAUGE-SN-001",
        "warehouse": "Phase4",
        "location": "QA Shelf A1",
        "remark": "Disposable Gauge Control browser-test equipment",
        "active": True,
    },
)
print("Seeded isolated SQLite database with test employees, Tooling item, Gauge Control equipment, and tooling vehicle key.")

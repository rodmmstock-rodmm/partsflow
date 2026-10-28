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

from core.models import Employee, RoleAccess, ToolingItem  # noqa: E402


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
ToolingItem.objects.update_or_create(
    name="E2E Test Sealant",
    defaults={
        "detail": "Disposable browser-test item",
        "maker": "Test Maker",
        "quantity": 4,
        "min_quantity": 5,
        "unit": "pcs",
        "active": True,
    },
)
print("Seeded isolated SQLite database with one test employee and one Tooling item.")

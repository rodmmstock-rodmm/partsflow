"""Seed only the disposable SQLite database used by Cloth Roll browser E2E tests."""
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django  # noqa: E402

django.setup()

from django.utils import timezone  # noqa: E402
from core.models import ClothRollStock, ClothRollTransaction, Employee, RoleAccess  # noqa: E402

role, _ = RoleAccess.objects.update_or_create(
    role_name="CLOTH_ROLL_UI_TEST",
    defaults={
        "active": True,
        "can_view_cloth_rolls": True,
        "can_delete_cloth_roll_history": True,
    },
)
employee, _ = Employee.objects.update_or_create(
    employee_code="UI-CLOTH-001",
    defaults={
        "name": "Cloth Roll UI Tester",
        "role": role.role_name,
        "department": "QA",
        "active": True,
    },
)
stock, _ = ClothRollStock.objects.update_or_create(
    phase=ClothRollStock.PHASE_4,
    defaults={"quantity": 100, "low_stock_threshold": 5, "low_stock_notified": False},
)
ClothRollStock.objects.update_or_create(
    phase=ClothRollStock.PHASE_11,
    defaults={"quantity": 50, "low_stock_threshold": 5, "low_stock_notified": False},
)

# This script runs only against the isolated e2e.sqlite3 database in CI.
ClothRollTransaction.objects.filter(recorded_by_employee=employee).delete()
for index in range(12):
    tx_type = ClothRollTransaction.TYPE_IN if index % 2 else ClothRollTransaction.TYPE_OUT
    ClothRollTransaction.objects.create(
        phase=ClothRollStock.PHASE_4,
        transaction_type=tx_type,
        quantity=1,
        balance_after=100 - index,
        recorded_by_employee=employee,
        source="WEB",
    )

print("Seeded disposable SQLite database with Cloth Roll UI tester and 12 history rows.")

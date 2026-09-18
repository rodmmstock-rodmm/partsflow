from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import patch

from django.core.cache import cache
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APIRequestFactory

from core.dashboard_api import dashboard
from core.models import (
    Employee,
    Inventory,
    Location,
    Machine,
    Maker,
    OrderRecord,
    Part,
    StockTransaction,
    Supplier,
    Unit,
)
from core.stock_api import history_list
from core.web_api import options, parts_list


class ApiPaginationAndCacheTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.factory = APIRequestFactory()
        cls.employee = Employee.objects.create(
            employee_code="E001", name="Tester", active=True
        )
        cls.machine = Machine.objects.create(
            code="MC-01", name="Machine 1", active=True
        )
        cls.location = Location.objects.create(
            code="A-01", name="A-01", warehouse="MM-4", active=True
        )
        cls.maker = Maker.objects.create(name="Maker")
        cls.unit = Unit.objects.create(code="PCS", name="Pieces", active=True)
        cls.supplier = Supplier.objects.create(
            code="V001", name="Vendor", active=True
        )
        cls.part = Part.objects.create(
            sku="P-001",
            name="Paginated Part",
            description="Test description",
            maker=cls.maker,
            unit=cls.unit,
            default_supplier=cls.supplier,
            location=cls.location,
            min_stock=Decimal("10"),
            active=True,
        )
        Inventory.objects.create(
            part=cls.part, location=cls.location, quantity=Decimal("5")
        )
        now = timezone.now()
        StockTransaction.objects.bulk_create(
            [
                StockTransaction(
                    transaction_no=f"TX-{index:03d}",
                    part=cls.part,
                    location=cls.location,
                    transaction_type="ISSUE",
                    quantity=Decimal("1"),
                    machine=cls.machine,
                    employee=cls.employee,
                    recorded_by_employee=cls.employee,
                    transaction_date=now - timedelta(seconds=index),
                    remark=f"row {index}",
                    legacy_source="WEB",
                )
                for index in range(105)
            ]
        )

    def test_history_defaults_to_100_rows_without_n_plus_one_queries(self):
        request = self.factory.get("/api/history/", {"page": 1})
        with patch("core.stock_api.require_permission", return_value=(self.employee, None)):
            with CaptureQueriesContext(connection) as queries:
                response = history_list(request)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 105)
        self.assertEqual(response.data["page_size"], 100)
        self.assertEqual(len(response.data["results"]), 100)
        self.assertTrue(response.data["has_next"])
        self.assertLessEqual(len(queries), 2)
        self.assertEqual(response.data["results"][0]["maker"], "Maker")
        self.assertNotIsInstance(response.data["results"][0]["machine"], dict)

        request = self.factory.get("/api/history/", {"page": 2})
        with patch("core.stock_api.require_permission", return_value=(self.employee, None)):
            response = history_list(request)
        self.assertEqual(len(response.data["results"]), 5)
        self.assertFalse(response.data["has_next"])

    def test_parts_list_is_paginated_and_flat(self):
        request = self.factory.get("/api/parts/", {"page": 1, "page_size": 50})
        with patch("core.web_api.require_permission", return_value=(self.employee, None)):
            with CaptureQueriesContext(connection) as queries:
                response = parts_list(request)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["maker_name"], "Maker")
        self.assertNotIn("maker", response.data["results"][0])
        self.assertLessEqual(len(queries), 2)

    def test_options_is_cached_and_invalidated_after_option_change(self):
        cache.clear()
        request = self.factory.get("/api/options/")
        with patch("core.web_api.require_permission", return_value=(self.employee, None)):
            first = options(request)
            with CaptureQueriesContext(connection) as queries:
                second = options(request)

        self.assertEqual(first.data, second.data)
        self.assertEqual(len(queries), 0)

        self.machine.name = "Machine changed"
        self.machine.save(update_fields=["name", "updated_at"])
        with patch("core.web_api.require_permission", return_value=(self.employee, None)):
            with CaptureQueriesContext(connection) as queries:
                refreshed = options(request)
        self.assertGreater(len(queries), 0)
        self.assertEqual(refreshed.data["machines"][0]["name"], "Machine changed")

    def test_dashboard_counts_in_database_and_excludes_n_parts(self):
        ordered = Part.objects.create(
            sku="P-ORDERED",
            name="Ordered Part",
            location=self.location,
            min_stock=Decimal("5"),
            active=True,
        )
        Inventory.objects.create(
            part=ordered, location=self.location, quantity=Decimal("0")
        )
        no_count = Part.objects.create(
            sku="N-001",
            name="No Count Part",
            location=self.location,
            min_stock=Decimal("10"),
            active=True,
        )
        Inventory.objects.create(
            part=no_count, location=self.location, quantity=Decimal("0")
        )
        OrderRecord.objects.create(
            order_number="ORD-001",
            order_date=date.today(),
            part=ordered,
            part_name=ordered.name,
            unit_text="PCS",
            procurement_phase=OrderRecord.PROCUREMENT_PURCHASE,
            lifecycle_status=OrderRecord.LIFECYCLE_ACTIVE,
            is_deleted=False,
        )

        request = self.factory.get("/api/dashboard/")
        with patch("core.dashboard_api.require_permission", return_value=(self.employee, None)):
            with CaptureQueriesContext(connection) as queries:
                response = dashboard(request)

        self.assertEqual(
            response.data["kpi"],
            {"parts": 3, "safety_stock": 1, "safety_stock_ordered": 1},
        )
        self.assertLessEqual(len(queries), 3)

from types import SimpleNamespace

from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext

from core.auth_api import PERMISSION_FIELDS, permissions_for
from core.models import RoleAccess


class PermissionQueryEfficiencyTests(TestCase):
    def test_existing_active_role_is_loaded_with_one_query(self):
        RoleAccess.objects.create(
            role_name="QUERY-TEST",
            active=True,
            can_view_parts=True,
        )

        with CaptureQueriesContext(connection) as queries:
            permissions = permissions_for(SimpleNamespace(role="QUERY-TEST"))

        self.assertEqual(len(queries), 1)
        self.assertTrue(permissions["can_view_parts"])

    def test_disabled_role_still_fails_closed_with_one_query(self):
        RoleAccess.objects.create(
            role_name="DISABLED-QUERY-TEST",
            active=False,
            can_view_parts=True,
        )

        with CaptureQueriesContext(connection) as queries:
            permissions = permissions_for(
                SimpleNamespace(role="DISABLED-QUERY-TEST")
            )

        self.assertEqual(len(queries), 1)
        self.assertTrue(all(value is False for value in permissions.values()))
        self.assertEqual(set(permissions), set(PERMISSION_FIELDS))

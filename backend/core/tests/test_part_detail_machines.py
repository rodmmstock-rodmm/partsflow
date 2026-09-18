from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from core.models import Machine, Part, PartMachine, StockTransaction
from core.web_api import part_detail_json


class PartDetailMachineHistoryTests(TestCase):
    def setUp(self):
        self.part = Part.objects.create(sku="P-MACHINE-HISTORY", name="History part")
        self.linked_only = Machine.objects.create(code="MC-LINK", name="Linked only")
        self.history_only = Machine.objects.create(code="MC-HISTORY", name="History only")
        self.both = Machine.objects.create(code="MC-BOTH", name="Linked and history")
        self.receive_only = Machine.objects.create(code="MC-RECEIVE", name="Receive only")
        self.void_only = Machine.objects.create(code="MC-VOID", name="Void only")

        PartMachine.objects.create(
            part=self.part,
            machine=self.linked_only,
            quantity_per_machine=Decimal("2"),
        )
        PartMachine.objects.create(
            part=self.part,
            machine=self.both,
            quantity_per_machine=Decimal("3"),
        )

    def add_transaction(self, number, machine, tx_type, quantity, *, is_void=False):
        return StockTransaction.objects.create(
            transaction_no=number,
            part=self.part,
            transaction_type=tx_type,
            quantity=Decimal(quantity),
            machine=machine,
            transaction_date=timezone.now(),
            is_void=is_void,
        )

    def test_machines_union_links_with_non_void_issue_history(self):
        self.add_transaction("ISS-HISTORY-1", self.history_only, "ISSUE", "4")
        self.add_transaction("OUT-HISTORY-2", self.history_only, "OUT", "5")
        self.add_transaction("ISS-BOTH-1", self.both, "ISSUE", "1")
        self.add_transaction("ISS-BOTH-2", self.both, "ISSUE", "2")
        self.add_transaction("RCV-IGNORED", self.receive_only, "RECEIVE", "8")
        self.add_transaction("ISS-VOID-IGNORED", self.void_only, "ISSUE", "9", is_void=True)

        machines = part_detail_json(self.part)["machines"]
        by_code = {row["code"]: row for row in machines}

        self.assertEqual(
            list(by_code),
            ["MC-BOTH", "MC-HISTORY", "MC-LINK"],
        )
        self.assertTrue(by_code["MC-LINK"]["linked"])
        self.assertFalse(by_code["MC-LINK"]["from_issue_history"])

        self.assertFalse(by_code["MC-HISTORY"]["linked"])
        self.assertTrue(by_code["MC-HISTORY"]["from_issue_history"])
        self.assertEqual(by_code["MC-HISTORY"]["issue_count"], 2)
        self.assertEqual(by_code["MC-HISTORY"]["total_issued"], 9.0)
        self.assertTrue(by_code["MC-HISTORY"]["last_issued_at"])

        self.assertTrue(by_code["MC-BOTH"]["linked"])
        self.assertTrue(by_code["MC-BOTH"]["from_issue_history"])
        self.assertEqual(by_code["MC-BOTH"]["issue_count"], 2)
        self.assertEqual(by_code["MC-BOTH"]["total_issued"], 3.0)
        self.assertEqual(by_code["MC-BOTH"]["quantity_per_machine"], 3.0)


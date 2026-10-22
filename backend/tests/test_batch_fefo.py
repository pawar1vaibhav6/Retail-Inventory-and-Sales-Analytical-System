"""
Unit and Concurrency Tests for Batch & Lot Controlled Inventory,
FEFO Allocation, Expiry Alerts, Scrap Transition, and POS Defense.
RetailSphere - Multi-Echelon Retail System (DMart-Style).
"""

import os
import sys
import unittest
from datetime import date, timedelta
from unittest.mock import MagicMock, patch

# Ensure backend directory is in python path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from domain_entities import (
    Batch, BatchStock, GRNLineItem, BatchStatus, LocationType
)
from batch_engine import (
    validate_batch_grn_item,
    allocate_fefo,
    validate_batch_for_pos,
    ValidationError,
    InsufficientStockError,
    PolicyViolationError,
    post_expiry_return_atomic
)


class TestBatchValidation(unittest.TestCase):
    """1. Tests for GRN Stage Batch/Lot Inward Validation."""

    def test_valid_grn_item(self):
        """Valid batch with future expiry and positive quantity succeeds."""
        today = date.today()
        mfg = today - timedelta(days=10)
        exp = today + timedelta(days=90)
        item = validate_batch_grn_item(
            product_id=101, batch_number="BAT-2026-A1",
            mfg_date=mfg, expiry_date=exp, received_qty=100, unit_cost=25.0
        )
        self.assertEqual(item.batch_number, "BAT-2026-A1")
        self.assertEqual(item.received_qty, 100)
        self.assertEqual(item.unit_cost, 25.0)

    def test_expiry_before_mfg_rejected(self):
        """Expiry date prior to or equal to manufacturing date raises ValidationError."""
        today = date.today()
        mfg = today + timedelta(days=10)
        exp = today  # Exp before mfg
        with self.assertRaises(ValidationError) as ctx:
            validate_batch_grn_item(101, "BAT-INV", mfg, exp, 50, 20.0)
        self.assertIn("strictly after manufacturing date", str(ctx.exception))

    def test_past_expiry_rejected(self):
        """Already-expired stock cannot be accepted at GRN entry."""
        today = date.today()
        mfg = today - timedelta(days=60)
        exp = today - timedelta(days=1)  # Expired yesterday
        with self.assertRaises(ValidationError) as ctx:
            validate_batch_grn_item(101, "BAT-EXPIRED", mfg, exp, 50, 20.0)
        self.assertIn("Cannot accept already expired stock", str(ctx.exception))

    def test_missing_batch_number_rejected(self):
        """Batch-controlled items require a non-empty batch/lot number."""
        today = date.today()
        exp = today + timedelta(days=30)
        for invalid in ["", "   ", None]:
            with self.subTest(val=invalid):
                with self.assertRaises(ValidationError):
                    validate_batch_grn_item(101, invalid, today, exp, 50, 20.0)

    def test_zero_or_negative_quantity_rejected(self):
        """Received quantity must be positive."""
        today = date.today()
        exp = today + timedelta(days=30)
        for invalid_qty in [0, -5]:
            with self.subTest(qty=invalid_qty):
                with self.assertRaises(ValidationError):
                    validate_batch_grn_item(101, "BAT-1", today, exp, invalid_qty, 20.0)


class TestFEFOAllocation(unittest.TestCase):
    """2. Tests for System-Enforced FEFO (First Expired, First Out) Picking."""

    def setUp(self):
        self.cur = MagicMock()
        self.today = date.today()

    def test_single_batch_fefo_allocation(self):
        """Allocates from earliest expiring batch when sufficient quantity is available."""
        earliest_exp = self.today + timedelta(days=15)
        later_exp = self.today + timedelta(days=60)

        # Batch 1 (expires in 15d, 100 qty), Batch 2 (expires in 60d, 200 qty)
        self.cur.fetchall.return_value = [
            (1, "BAT-EARLY", self.today, earliest_exp, 100, "ACTIVE"),
            (2, "BAT-LATER", self.today, later_exp, 200, "ACTIVE")
        ]

        allocs = allocate_fefo(self.cur, product_id=101, location_id=1, requested_qty=40)

        self.assertEqual(len(allocs), 1)
        self.assertEqual(allocs[0]["batch_id"], 1)
        self.assertEqual(allocs[0]["batch_number"], "BAT-EARLY")
        self.assertEqual(allocs[0]["allocated_qty"], 40)
        self.assertFalse(allocs[0]["is_override"])

    def test_multi_batch_split_fefo_allocation(self):
        """Splits allocation across multiple batches in earliest-expiry sequence."""
        exp_lot1 = self.today + timedelta(days=10)
        exp_lot2 = self.today + timedelta(days=25)
        exp_lot3 = self.today + timedelta(days=50)

        self.cur.fetchall.return_value = [
            (10, "LOT-1", self.today, exp_lot1, 30, "ACTIVE"),
            (11, "LOT-2", self.today, exp_lot2, 40, "ACTIVE"),
            (12, "LOT-3", self.today, exp_lot3, 100, "ACTIVE")
        ]

        # Request 60 units: should take all 30 of Lot-1, and 30 from Lot-2
        allocs = allocate_fefo(self.cur, product_id=101, location_id=1, requested_qty=60, allow_split=True)

        self.assertEqual(len(allocs), 2)
        self.assertEqual(allocs[0]["batch_number"], "LOT-1")
        self.assertEqual(allocs[0]["allocated_qty"], 30)
        self.assertEqual(allocs[1]["batch_number"], "LOT-2")
        self.assertEqual(allocs[1]["allocated_qty"], 30)

    def test_tie_breaking_equal_expiry_dates(self):
        """Tie-breaks identical expiry dates by earliest batch_id."""
        same_exp = self.today + timedelta(days=20)
        self.cur.fetchall.return_value = [
            (5, "BATCH-FIRST-ID", self.today, same_exp, 50, "ACTIVE"),
            (8, "BATCH-SECOND-ID", self.today, same_exp, 50, "ACTIVE")
        ]

        allocs = allocate_fefo(self.cur, product_id=101, location_id=1, requested_qty=20)
        self.assertEqual(allocs[0]["batch_id"], 5)
        self.assertEqual(allocs[0]["batch_number"], "BATCH-FIRST-ID")

    def test_min_shelf_life_rule_exclusion(self):
        """Batches failing minimum shelf-life rule are excluded from allocation."""
        near_exp = self.today + timedelta(days=10)  # 10 days remaining
        fresh_exp = self.today + timedelta(days=40)  # 40 days remaining

        self.cur.fetchall.return_value = [
            (1, "LOT-10D", self.today, near_exp, 100, "ACTIVE"),
            (2, "LOT-40D", self.today, fresh_exp, 100, "ACTIVE")
        ]

        # Require min 20 days shelf life: LOT-10D must be skipped
        allocs = allocate_fefo(self.cur, product_id=101, location_id=1, requested_qty=50, min_shelf_life_days=20)

        self.assertEqual(len(allocs), 1)
        self.assertEqual(allocs[0]["batch_number"], "LOT-40D")

    def test_authorized_override_with_reason(self):
        """Store supervisor or admin can override FEFO when providing mandatory reason."""
        self.cur.fetchone.return_value = (99, "OVERRIDE-LOT", self.today + timedelta(days=50), 100, "ACTIVE")

        allocs = allocate_fefo(
            self.cur, product_id=101, location_id=1, requested_qty=25,
            override_batch_id=99, override_reason="Customer requested specific manufacturing run",
            user_role="store_supervisor"
        )

        self.assertEqual(len(allocs), 1)
        self.assertEqual(allocs[0]["batch_id"], 99)
        self.assertTrue(allocs[0]["is_override"])
        self.assertIn("Customer requested", allocs[0]["override_reason"])

    def test_unauthorized_override_rejected(self):
        """Cashier or picker cannot override FEFO suggestion."""
        for unauthorized_role in ["cashier", "warehouse_picker", "guest"]:
            with self.subTest(role=unauthorized_role):
                with self.assertRaises(PolicyViolationError) as ctx:
                    allocate_fefo(
                        self.cur, product_id=101, location_id=1, requested_qty=25,
                        override_batch_id=99, override_reason="Bypassing FEFO",
                        user_role=unauthorized_role
                    )
                self.assertIn("Unauthorized", str(ctx.exception))

    def test_override_without_reason_rejected(self):
        """FEFO override without reason is strictly rejected."""
        with self.assertRaises(PolicyViolationError) as ctx:
            allocate_fefo(
                self.cur, product_id=101, location_id=1, requested_qty=25,
                override_batch_id=99, override_reason="",
                user_role="admin"
            )
        self.assertIn("mandatory override reason is required", str(ctx.exception))


class TestScrapTransitionAndDebitNotes(unittest.TestCase):
    """3. Tests for Atomic Scrap Ledger Moves and Debit Note Issuance."""

    def setUp(self):
        self.cur = MagicMock()

    def test_atomic_scrap_and_debit_note_generation(self):
        """Posting an expiry return atomically decrements saleable, increments scrap, and creates debit note."""
        # Return record mock: return_id, return_no, loc_id, sup_id, pid, bid, grn_id, qty, cost, claim, status, idemp
        self.cur.fetchone.side_effect = [
            (10, "RET-2026-001", 2, 5, 101, 20, 1, 50, 40.0, 2000.0, "DRAFT", "IDEMP-123"),  # return
            (100, 0),    # batch_stock: 100 saleable, 0 scrap
            (50,),       # rem_saleable: 50
            ("AMUL-B1",) # batch_number
        ]

        res = post_expiry_return_atomic(self.cur, return_id=10, posted_by="supervisor_anil")

        self.assertEqual(res["status"], "POSTED")
        self.assertEqual(res["taxable_amount"], 2000.0)
        self.assertEqual(res["gst_amount"], 360.0)  # 18% of 2000
        self.assertEqual(res["total_credit_amount"], 2360.0)

        # Verify SQL statements included quantity_saleable decrement and quantity_scrap increment
        executed_sqls = [call[0][0] for call in self.cur.execute.call_args_list]
        self.assertTrue(any("quantity_saleable - %s" in sql and "quantity_scrap + %s" in sql for sql in executed_sqls))
        self.assertTrue(any("INSERT INTO debit_notes" in sql for sql in executed_sqls))

    def test_idempotent_post_rejected_if_already_posted(self):
        """Idempotency guard prevents posting the same return transaction twice."""
        self.cur.fetchone.return_value = (
            10, "RET-2026-001", 2, 5, 101, 20, 1, 50, 40.0, 2000.0, "POSTED", "IDEMP-123"
        )
        with self.assertRaises(PolicyViolationError) as ctx:
            post_expiry_return_atomic(self.cur, return_id=10, posted_by="supervisor_anil")
        self.assertIn("Idempotency Guard", str(ctx.exception))


class TestPOSDefenseGuard(unittest.TestCase):
    """4. Tests for POS Scanning Defense: Blocking Expired and Scrap Lots."""

    def setUp(self):
        self.cur = MagicMock()
        self.today = date.today()

    def test_pos_rejects_expired_batch(self):
        """POS scan is rejected if scanned batch is expired."""
        exp_yesterday = self.today - timedelta(days=1)
        self.cur.fetchone.return_value = (10, "EXPIRED-LOT", exp_yesterday, "ACTIVE", 50)

        res = validate_batch_for_pos(self.cur, product_id=101, batch_id=10, qty=2, location_id=2)
        self.assertFalse(res["valid"])
        self.assertIn("has expired", res["reason"])

    def test_pos_rejects_scrap_status_batch(self):
        """POS scan is rejected if scanned batch is in SCRAP ledger."""
        future_exp = self.today + timedelta(days=60)
        self.cur.fetchone.return_value = (10, "SCRAP-LOT", future_exp, "SCRAP", 20)

        res = validate_batch_for_pos(self.cur, product_id=101, batch_id=10, qty=1, location_id=2)
        self.assertFalse(res["valid"])
        self.assertIn("in SCRAP status and blocked from sale", res["reason"])

    def test_pos_accepts_active_unexpired_batch(self):
        """POS scan succeeds for valid, active, unexpired lot with sufficient stock."""
        future_exp = self.today + timedelta(days=45)
        self.cur.fetchone.return_value = (10, "FRESH-LOT", future_exp, "ACTIVE", 100)

        res = validate_batch_for_pos(self.cur, product_id=101, batch_id=10, qty=5, location_id=2)
        self.assertTrue(res["valid"])
        self.assertEqual(res["batch"]["batch_number"], "FRESH-LOT")


class TestConcurrencyAndDataIntegrity(unittest.TestCase):
    """5. Concurrency Simulation & Data Integrity Tests."""

    def test_batch_stock_entity_available_for_sale_never_negative(self):
        """BatchStock entity calculates available stock correctly and avoids negative values."""
        bs = BatchStock(stock_id=1, product_id=101, location_id=2, batch_id=5,
                        quantity_saleable=50, quantity_reserved=20, quantity_scrap=10)
        self.assertEqual(bs.available_for_sale, 30)

        # When reserved exceeds saleable due to edge case
        bs.quantity_reserved = 60
        self.assertEqual(bs.available_for_sale, 0)

    def test_insufficient_stock_raises_cleanly_on_concurrent_depletion(self):
        """When available stock drops below requested qty under lock, InsufficientStockError is raised."""
        cur = MagicMock()
        cur.fetchall.return_value = []  # No stock under lock

        with self.assertRaises(InsufficientStockError) as ctx:
            allocate_fefo(cur, product_id=101, location_id=1, requested_qty=10)
        self.assertIn("No active, non-expired stock available", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()


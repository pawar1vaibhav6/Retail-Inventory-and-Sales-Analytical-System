"""
Unit Tests for Phase 2: Batch Stock (GRN Batch Capture, Batch Stock Ledger, Traceability)
Validates:
- Central DC GRN Inward Line Validation (batch, mfg, expiry, positive qty)
- Atomic Inward Posting to batches, batch_stock (at DC), Products, and stock_movements
- Batch Stock Ledger endpoint (/api/batch-stock) with Store-Level Scoping
- End-to-End Batch Traceability query (/api/traceability/batch/<batch_number>)
"""

import unittest
from datetime import date, timedelta
import sys
import os

# Add backend directory to sys.path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

import db
from app import app
from batch_engine import (
    validate_batch_grn_item,
    record_grn,
    get_batch_traceability,
    ValidationError
)


class TestPhase2BatchStock(unittest.TestCase):

    def setUp(self):
        self.conn = db.get_connection()
        self.cur = self.conn.cursor()
        self.client = app.test_client()

    def tearDown(self):
        self.conn.rollback()
        self.conn.close()

    # -------------------------------------------------------------------------
    # 1. GRN Line Validation Tests
    # -------------------------------------------------------------------------
    def test_grn_validation_missing_batch_rejected(self):
        """Batch number is mandatory for batch-controlled goods receipt."""
        with self.assertRaises(ValidationError) as ctx:
            validate_batch_grn_item(
                product_id=1, batch_number="", mfg_date=date.today(),
                expiry_date=date.today() + timedelta(days=90),
                received_qty=50, unit_cost=100.0
            )
        self.assertIn("Batch number is required", str(ctx.exception))

    def test_grn_validation_expiry_before_or_equal_mfg_rejected(self):
        """Expiry date must be strictly after manufacturing date."""
        today = date.today()
        with self.assertRaises(ValidationError) as ctx:
            validate_batch_grn_item(
                product_id=1, batch_number="B-INVALID-01",
                mfg_date=today, expiry_date=today,
                received_qty=50, unit_cost=100.0
            )
        self.assertIn("must be strictly after", str(ctx.exception))

    def test_grn_validation_already_expired_rejected(self):
        """Stock already expired cannot be accepted at GRN inward."""
        past_mfg = date.today() - timedelta(days=60)
        past_exp = date.today() - timedelta(days=1)
        with self.assertRaises(ValidationError) as ctx:
            validate_batch_grn_item(
                product_id=1, batch_number="B-EXPIRED-01",
                mfg_date=past_mfg, expiry_date=past_exp,
                received_qty=20, unit_cost=50.0
            )
        self.assertIn("Cannot accept already expired stock", str(ctx.exception))

    def test_grn_validation_non_positive_qty_rejected(self):
        """Received quantity must be positive integer."""
        with self.assertRaises(ValidationError) as ctx:
            validate_batch_grn_item(
                product_id=1, batch_number="B-QTY-01",
                mfg_date=date.today(), expiry_date=date.today() + timedelta(days=90),
                received_qty=0, unit_cost=50.0
            )
        self.assertIn("positive integer", str(ctx.exception))

    # -------------------------------------------------------------------------
    # 2. Atomic GRN Posting Tests
    # -------------------------------------------------------------------------
    def test_record_grn_atomic_posting(self):
        """
        Recording a GRN at Central DC (location_id=1) atomically creates:
        - GRN receipt record
        - Batch record
        - Batch stock record at DC
        - Stock movement entry
        """
        # Pick an active product
        self.cur.execute("SELECT product_id, stock_quantity FROM Products LIMIT 1")
        prod = self.cur.fetchone()
        self.assertIsNotNone(prod)
        pid, initial_qty = prod

        # Get Central DC location
        self.cur.execute("SELECT location_id FROM locations WHERE type = 'DC' LIMIT 1")
        dc_id = self.cur.fetchone()[0]

        # Get first supplier
        self.cur.execute("SELECT supplier_id FROM suppliers LIMIT 1")
        sup_id = self.cur.fetchone()[0]

        import uuid
        test_batch_num = f"TEST-GRN-{uuid.uuid4().hex[:6].upper()}"
        mfg = date.today() - timedelta(days=5)
        exp = date.today() + timedelta(days=180)
        inward_qty = 75

        res = record_grn(
            self.cur,
            location_id=dc_id,
            supplier_id=sup_id,
            received_by="picker",
            items_data=[{
                "product_id": pid,
                "batch_number": test_batch_num,
                "mfg_date": str(mfg),
                "expiry_date": str(exp),
                "received_qty": inward_qty,
                "unit_cost": 150.0
            }],
            invoice_no="INV-UNIT-TEST-100",
            remarks="Automated Unit Test GRN"
        )
        self.conn.commit()

        self.assertIn("grn_number", res)
        self.assertEqual(res["total_items"], 1)
        self.assertEqual(res["total_quantity"], inward_qty)

        # Verify batch exists in batches table
        self.cur.execute("SELECT batch_id, status FROM batches WHERE batch_number = %s", (test_batch_num,))
        batch_row = self.cur.fetchone()
        self.assertIsNotNone(batch_row)
        batch_id, b_status = batch_row
        self.assertEqual(b_status, "ACTIVE")

        # Verify stock exists at Central DC in batch_stock
        self.cur.execute(
            "SELECT quantity_saleable FROM batch_stock WHERE batch_id = %s AND location_id = %s",
            (batch_id, dc_id)
        )
        bs_row = self.cur.fetchone()
        self.assertIsNotNone(bs_row)
        self.assertEqual(bs_row[0], inward_qty)

        # Verify movement entry
        self.cur.execute(
            "SELECT movement_type, quantity, reference_doc_type FROM stock_movements WHERE batch_id = %s",
            (batch_id,)
        )
        mov = self.cur.fetchone()
        self.assertIsNotNone(mov)
        self.assertEqual(mov[0], "GRN_RECEIPT")
        self.assertEqual(mov[1], inward_qty)
        self.assertEqual(mov[2], "GRN")

    # -------------------------------------------------------------------------
    # 3. REST API: GRN Inward Endpoint Tests
    # -------------------------------------------------------------------------
    def test_grn_api_unauthorized_role_rejected(self):
        """Cashier role cannot access GRN inwarding (403 forbidden)."""
        res = self.client.get("/api/grn/receipts", headers={"X-User-Role": "cashier"})
        self.assertEqual(res.status_code, 403)

    def test_grn_api_picker_access_allowed(self):
        """Warehouse picker can list past GRNs."""
        res = self.client.get("/api/grn/receipts", headers={"X-User-Role": "warehouse_picker"})
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data["success"])
        self.assertIsInstance(data["grns"], list)

    # -------------------------------------------------------------------------
    # 4. Batch Stock Ledger API & Store Scoping Tests
    # -------------------------------------------------------------------------
    def test_batch_stock_ledger_endpoint(self):
        """Admin can retrieve batch stock ledger across facilities."""
        res = self.client.get("/api/batch-stock", headers={"X-User-Role": "admin"})
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data["success"])
        self.assertIsInstance(data["batches"], list)

    def test_batch_stock_ledger_store_scoping_enforced(self):
        """
        Store Supervisor scoped to STORE-101 (location_id=2) only sees
        batches present at Store-101, not Central DC stock.
        """
        res = self.client.get(
            "/api/batch-stock",
            headers={"X-User-Role": "store_supervisor", "X-Store-Id": "2"}
        )
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data["success"])
        for b in data["batches"]:
            if b["location_id"] is not None:
                self.assertEqual(b["location_id"], 2, "Store supervisor saw batch from another location!")

    # -------------------------------------------------------------------------
    # 5. End-to-End Batch Traceability Tests
    # -------------------------------------------------------------------------
    def test_batch_traceability_endpoint(self):
        """Verifies full lifecycle traceability lookup for a known batch."""
        res = self.client.get("/api/traceability/batch/LEGACY")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data["success"])
        trace = data["traceability"]
        self.assertEqual(trace["batch_number"], "LEGACY")
        self.assertIn("inventory", trace)
        self.assertIn("timeline", trace)

    def test_batch_traceability_non_existent_404(self):
        """Non-existent batch returns 404 with error message."""
        res = self.client.get("/api/traceability/batch/DOES-NOT-EXIST-999")
        self.assertEqual(res.status_code, 404)
        data = res.get_json()
        self.assertFalse(data["success"])


if __name__ == "__main__":
    unittest.main()

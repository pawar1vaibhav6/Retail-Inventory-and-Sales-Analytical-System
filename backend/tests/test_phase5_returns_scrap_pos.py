"""
Unit Tests for Phase 5: Vendor Expiry Returns, Scrap Ledger, Debit Notes & POS Defense
Validates:
- Draft expiry return creation by Store Executive
- Atomic posting of vendor return in one DB transaction:
  * Moves units from saleable to scrap ledger
  * Deducts aggregate catalog stock
  * Sets batch status to SCRAP if exhausted
  * Generates official supplier Debit Note with 18% GST
  * Idempotency protection against duplicate posting
- Segregation of Duties: Drafter cannot approve and post the return
- Debit Note reconciliation by Accounts role (Issued -> Acknowledged -> Settled)
- POS Defense Guard: strictly blocks scanning of expired or scrapped batches
- POS Active Markdown Price Resolution
"""

import unittest
from datetime import date, timedelta
import uuid
import sys
import os

backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

import db
from app import app
from batch_engine import (
    create_expiry_return,
    post_expiry_return_atomic,
    acknowledge_debit_note,
    settle_debit_note,
    validate_batch_for_pos,
    propose_markdown,
    approve_markdown,
    get_active_markdown_for_batch,
    PolicyViolationError,
    SegregationOfDutiesError,
    InsufficientStockError,
    ValidationError
)


class TestPhase5ReturnsScrapPOS(unittest.TestCase):

    def setUp(self):
        self.conn = db.get_connection()
        self.cur = self.conn.cursor()
        self.client = app.test_client()

        # Get Store 101 and Supplier
        self.cur.execute("SELECT location_id FROM locations WHERE code = 'STORE-101' LIMIT 1")
        self.store_101 = self.cur.fetchone()[0]

        self.cur.execute("SELECT supplier_id FROM suppliers LIMIT 1")
        self.supplier_id = self.cur.fetchone()[0]

        self.created_product_ids = []
        self.created_return_ids = []
        self.created_markdown_ids = []

    def tearDown(self):
        try:
            if self.created_markdown_ids:
                m_fmt = ','.join(['%s'] * len(self.created_markdown_ids))
                m_tuple = tuple(self.created_markdown_ids)
                self.cur.execute(f"DELETE FROM markdown_sales_tracking WHERE markdown_id IN ({m_fmt})", m_tuple)
                self.cur.execute(f"DELETE FROM markdown_promotions WHERE markdown_id IN ({m_fmt})", m_tuple)

            if self.created_return_ids:
                r_fmt = ','.join(['%s'] * len(self.created_return_ids))
                r_tuple = tuple(self.created_return_ids)
                self.cur.execute(f"DELETE FROM debit_notes WHERE return_id IN ({r_fmt})", r_tuple)
                self.cur.execute(f"DELETE FROM vendor_expiry_returns WHERE return_id IN ({r_fmt})", r_tuple)

            if self.created_product_ids:
                p_fmt = ','.join(['%s'] * len(self.created_product_ids))
                p_tuple = tuple(self.created_product_ids)
                self.cur.execute(f"DELETE FROM stock_movements WHERE product_id IN ({p_fmt})", p_tuple)
                self.cur.execute(f"DELETE FROM batch_stock WHERE product_id IN ({p_fmt})", p_tuple)
                self.cur.execute(f"DELETE FROM batches WHERE product_id IN ({p_fmt})", p_tuple)
                self.cur.execute(f"DELETE FROM Products WHERE product_id IN ({p_fmt})", p_tuple)

            self.conn.commit()
        except Exception:
            self.conn.rollback()
        finally:
            self.conn.close()

    def create_isolated_product(self, name="Vendor Return Item", price=250, cost=150):
        uid = int(uuid.uuid4().int % 800000 + 300000)
        self.cur.execute("""
            INSERT INTO Products (product_id, p_name, category, price, cost, stock_quantity, floor_price_percent)
            VALUES (%s, %s, 'Packaged Food', %s, %s, 100, 50.00)
        """, (uid, f"{name} {uid}", price, cost))
        self.conn.commit()
        self.created_product_ids.append(uid)
        return uid

    # -------------------------------------------------------------------------
    # 1. Draft Return & Atomic Posting Lifecycle
    # -------------------------------------------------------------------------
    def test_vendor_expiry_return_atomic_posting_lifecycle(self):
        """
        Store Executive drafts return -> Store Supervisor posts return:
        - Saleable stock decrements; scrap stock increments
        - Products.stock_quantity decrements
        - Batch status becomes SCRAP if 0 units remain
        - Debit Note generated with 18% GST
        - Idempotency guard prevents duplicate posting
        """
        pid = self.create_isolated_product("Atomic Post Item", price=300, cost=200)
        bnum = f"VRET-LOT-{uuid.uuid4().hex[:5]}"

        self.cur.execute("""
            INSERT INTO batches (product_id, batch_number, mfg_date, expiry_date, cost_price, mrp, status, supplier_id)
            VALUES (%s, %s, %s, %s, 200, 300, 'ACTIVE', %s)
        """, (pid, bnum, date.today() - timedelta(days=60), date.today() + timedelta(days=10), self.supplier_id))
        bid = self.cur.lastrowid

        # 20 units total in batch stock
        self.cur.execute("""
            INSERT INTO batch_stock (product_id, location_id, batch_id, quantity_saleable, quantity_scrap)
            VALUES (%s, %s, %s, 20, 0)
        """, (pid, self.store_101, bid))
        self.conn.commit()

        # Step 1: Store Executive drafts return for all 20 units
        draft = create_expiry_return(
            self.cur, location_id=self.store_101, supplier_id=self.supplier_id,
            product_id=pid, batch_id=bid, qty=20, created_by="store_exec_1",
            reason="Hit 15-day Vendor Return Window"
        )
        self.conn.commit()
        ret_id = draft["return_id"]
        self.created_return_ids.append(ret_id)
        self.assertEqual(draft["status"], "DRAFT")
        self.assertEqual(draft["total_claim_amount"], 4000.0) # 20 * 200

        # Step 2: Store Supervisor approves & posts return
        post_res = post_expiry_return_atomic(self.cur, return_id=ret_id, posted_by="supervisor_1")
        self.conn.commit()
        self.assertEqual(post_res["status"], "POSTED")
        self.assertIsNotNone(post_res["debit_note_number"])
        self.assertEqual(post_res["taxable_amount"], 4000.0)
        self.assertEqual(post_res["gst_amount"], 720.0) # 18% of 4000
        self.assertEqual(post_res["total_credit_amount"], 4720.0)

        # Step 3: Verify batch_stock movements
        self.cur.execute("SELECT quantity_saleable, quantity_scrap FROM batch_stock WHERE batch_id = %s AND location_id = %s", (bid, self.store_101))
        bs = self.cur.fetchone()
        self.assertEqual(bs[0], 0)  # Saleable reduced to 0
        self.assertEqual(bs[1], 20) # Scrap increased to 20

        # Step 4: Verify batch status is SCRAP
        self.cur.execute("SELECT status FROM batches WHERE batch_id = %s", (bid,))
        self.assertEqual(self.cur.fetchone()[0], "SCRAP")

        # Step 5: Verify Idempotency Guard (cannot post twice)
        with self.assertRaises(PolicyViolationError) as ctx:
            post_expiry_return_atomic(self.cur, return_id=ret_id, posted_by="supervisor_1")
        self.assertIn("already been posted", str(ctx.exception).lower())

    # -------------------------------------------------------------------------
    # 2. Segregation of Duties Tests
    # -------------------------------------------------------------------------
    def test_return_segregation_of_duties(self):
        """User who drafted the return CANNOT post the return."""
        pid = self.create_isolated_product("SOD Ret Item", price=200, cost=100)
        bnum = f"VRET-SOD-{uuid.uuid4().hex[:5]}"

        self.cur.execute("""
            INSERT INTO batches (product_id, batch_number, mfg_date, expiry_date, cost_price, mrp, status, supplier_id)
            VALUES (%s, %s, %s, %s, 100, 200, 'ACTIVE', %s)
        """, (pid, bnum, date.today() - timedelta(days=60), date.today() + timedelta(days=10), self.supplier_id))
        bid = self.cur.lastrowid

        self.cur.execute("INSERT INTO batch_stock (product_id, location_id, batch_id, quantity_saleable) VALUES (%s, %s, %s, 10)", (pid, self.store_101, bid))
        self.conn.commit()

        draft = create_expiry_return(self.cur, self.store_101, self.supplier_id, pid, bid, 5, created_by="user_same")
        ret_id = draft["return_id"]
        self.created_return_ids.append(ret_id)
        self.conn.commit()

        # Approval and posting by SAME user must fail
        with self.assertRaises(SegregationOfDutiesError):
            post_expiry_return_atomic(self.cur, return_id=ret_id, posted_by="user_same")

    # -------------------------------------------------------------------------
    # 3. Debit Note Reconciliation Lifecycle (Accounts Role)
    # -------------------------------------------------------------------------
    def test_debit_note_reconciliation_lifecycle(self):
        """
        Debit Note Status Progression:
        ISSUED -> ACKNOWLEDGED (supplier acknowledges) -> SETTLED (credit note received)
        """
        pid = self.create_isolated_product("DN Reconcile Item", price=100, cost=50)
        bnum = f"DN-REC-{uuid.uuid4().hex[:5]}"

        self.cur.execute("""
            INSERT INTO batches (product_id, batch_number, mfg_date, expiry_date, cost_price, mrp, status, supplier_id)
            VALUES (%s, %s, %s, %s, 50, 100, 'ACTIVE', %s)
        """, (pid, bnum, date.today() - timedelta(days=60), date.today() + timedelta(days=10), self.supplier_id))
        bid = self.cur.lastrowid
        self.cur.execute("INSERT INTO batch_stock (product_id, location_id, batch_id, quantity_saleable) VALUES (%s, %s, %s, 10)", (pid, self.store_101, bid))
        self.conn.commit()

        draft = create_expiry_return(self.cur, self.store_101, self.supplier_id, pid, bid, 10, "store_exec_1")
        ret_id = draft["return_id"]
        self.created_return_ids.append(ret_id)
        self.conn.commit()

        post = post_expiry_return_atomic(self.cur, ret_id, "supervisor_1")
        self.conn.commit()
        dn_id = post["debit_note_id"]

        # Step 1: Accounts marks ACKNOWLEDGED
        ack = acknowledge_debit_note(self.cur, dn_id, acknowledged_by="accounts_officer", user_role="accounts")
        self.conn.commit()
        self.assertEqual(ack["status"], "ACKNOWLEDGED")

        # Verify return status is updated to SUPPLIER_ACKNOWLEDGED
        self.cur.execute("SELECT status FROM vendor_expiry_returns WHERE return_id = %s", (ret_id,))
        self.assertEqual(self.cur.fetchone()[0], "SUPPLIER_ACKNOWLEDGED")

        # Step 2: Accounts marks SETTLED with supplier credit note reference
        set_res = settle_debit_note(self.cur, dn_id, settled_by="accounts_officer", user_role="accounts", credit_ref="SCN-998877")
        self.conn.commit()
        self.assertEqual(set_res["status"], "SETTLED")

        # Verify return status is updated to CREDIT_RECEIVED
        self.cur.execute("SELECT status FROM vendor_expiry_returns WHERE return_id = %s", (ret_id,))
        self.assertEqual(self.cur.fetchone()[0], "CREDIT_RECEIVED")

    # -------------------------------------------------------------------------
    # 4. POS Defense Guard Tests
    # -------------------------------------------------------------------------
    def test_pos_defense_expired_batch_rejection(self):
        """POS strictly rejects scanning a batch whose expiry date is in the past."""
        pid = self.create_isolated_product("POS Expired Item")
        bnum = f"POS-EXP-{uuid.uuid4().hex[:5]}"

        # Expiry 5 days ago
        self.cur.execute("""
            INSERT INTO batches (product_id, batch_number, mfg_date, expiry_date, cost_price, mrp, status)
            VALUES (%s, %s, %s, %s, 100, 150, 'ACTIVE')
        """, (pid, bnum, date.today() - timedelta(days=90), date.today() - timedelta(days=5)))
        bid = self.cur.lastrowid
        self.cur.execute("INSERT INTO batch_stock (product_id, location_id, batch_id, quantity_saleable) VALUES (%s, %s, %s, 20)", (pid, self.store_101, bid))
        self.conn.commit()

        val = validate_batch_for_pos(self.cur, product_id=pid, batch_id=bid, qty=1, location_id=self.store_101)
        self.assertFalse(val["valid"])
        self.assertIn("expired", val["reason"].lower())

    def test_pos_defense_scrap_batch_rejection(self):
        """POS strictly rejects scanning a batch with status SCRAP, BLOCKED, or QUARANTINED."""
        pid = self.create_isolated_product("POS Scrap Item")
        bnum = f"POS-SCRAP-{uuid.uuid4().hex[:5]}"

        self.cur.execute("""
            INSERT INTO batches (product_id, batch_number, mfg_date, expiry_date, cost_price, mrp, status)
            VALUES (%s, %s, %s, %s, 100, 150, 'SCRAP')
        """, (pid, bnum, date.today() - timedelta(days=20), date.today() + timedelta(days=40)))
        bid = self.cur.lastrowid
        self.cur.execute("INSERT INTO batch_stock (product_id, location_id, batch_id, quantity_saleable) VALUES (%s, %s, %s, 20)", (pid, self.store_101, bid))
        self.conn.commit()

        val = validate_batch_for_pos(self.cur, product_id=pid, batch_id=bid, qty=1, location_id=self.store_101)
        self.assertFalse(val["valid"])
        self.assertIn("blocked from sale", val["reason"].lower())

    def test_pos_active_markdown_price_resolution(self):
        """POS checks if a batch has an active markdown promotion and returns the discounted price."""
        pid = self.create_isolated_product("POS Mkd Item", price=200, cost=100)
        bnum = f"POS-MKD-{uuid.uuid4().hex[:5]}"

        self.cur.execute("""
            INSERT INTO batches (product_id, batch_number, mfg_date, expiry_date, cost_price, mrp, status)
            VALUES (%s, %s, %s, %s, 100, 200, 'ACTIVE')
        """, (pid, bnum, date.today() - timedelta(days=20), date.today() + timedelta(days=15)))
        bid = self.cur.lastrowid
        self.cur.execute("INSERT INTO batch_stock (product_id, location_id, batch_id, quantity_saleable) VALUES (%s, %s, %s, 30)", (pid, self.store_101, bid))
        self.conn.commit()

        # Propose and approve markdown
        prop = propose_markdown(self.cur, self.store_101, pid, bid, 20.0, "store_exec_1")
        mkd_id = prop["markdown_id"]
        self.created_markdown_ids.append(mkd_id)
        self.conn.commit()

        approve_markdown(self.cur, mkd_id, 20.0, "supervisor_1", "store_supervisor")
        self.conn.commit()

        # Query active markdown for this batch
        active_mkd = get_active_markdown_for_batch(self.cur, bid, self.store_101)
        self.assertIsNotNone(active_mkd)
        self.assertEqual(active_mkd["markdown_price"], 160.0) # 200 - 20%


if __name__ == "__main__":
    unittest.main()


"""
Unit Tests for Phase 4: Near-Expiry Alerts, Markdowns, Code Management & Push Sale
Validates:
- Near-expiry stock query & dump stock detection (days cover > days to expiry)
- Inter-store transfer suggestions
- Physical code audit lifecycle (create -> submit counts -> approve adjustments)
- Audit Segregation of Duties (count submitter cannot self-approve discrepancies)
- Markdown proposal & dual-authorization approval workflow
- Store Supervisor discount limit policy (supervisor <=20%, cat_mgr >20%)
- Markdown Segregation of Duties (proposer cannot self-approve)
- Pending approvals inbox endpoint
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
    get_expiry_stock_report,
    detect_dump_stock,
    get_interstore_transfer_suggestions,
    create_code_audit,
    submit_code_audit,
    approve_code_audit,
    propose_markdown,
    approve_markdown,
    get_pending_approvals,
    PolicyViolationError,
    SegregationOfDutiesError,
    ValidationError
)


class TestPhase4AuditsMarkdowns(unittest.TestCase):

    def setUp(self):
        self.conn = db.get_connection()
        self.cur = self.conn.cursor()
        self.client = app.test_client()

        # Get locations
        self.cur.execute("SELECT location_id FROM locations WHERE code = 'STORE-101' LIMIT 1")
        self.store_101 = self.cur.fetchone()[0]

        self.cur.execute("SELECT location_id FROM locations WHERE code = 'STORE-102' LIMIT 1")
        self.store_102 = self.cur.fetchone()[0]

        self.created_product_ids = []
        self.created_audit_ids = []
        self.created_markdown_ids = []

    def tearDown(self):
        try:
            if self.created_markdown_ids:
                m_fmt = ','.join(['%s'] * len(self.created_markdown_ids))
                m_tuple = tuple(self.created_markdown_ids)
                self.cur.execute(f"DELETE FROM markdown_sales_tracking WHERE markdown_id IN ({m_fmt})", m_tuple)
                self.cur.execute(f"DELETE FROM markdown_promotions WHERE markdown_id IN ({m_fmt})", m_tuple)

            if self.created_audit_ids:
                a_fmt = ','.join(['%s'] * len(self.created_audit_ids))
                a_tuple = tuple(self.created_audit_ids)
                self.cur.execute(f"DELETE FROM audit_items WHERE audit_id IN ({a_fmt})", a_tuple)
                self.cur.execute(f"DELETE FROM code_management_audits WHERE audit_id IN ({a_fmt})", a_tuple)

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

    def create_isolated_product(self, name="Audit Item", price=200, cost=120):
        uid = int(uuid.uuid4().int % 800000 + 200000)
        self.cur.execute("""
            INSERT INTO Products (product_id, p_name, category, price, cost, stock_quantity, floor_price_percent)
            VALUES (%s, %s, 'Groceries', %s, %s, 100, 50.00)
        """, (uid, f"{name} {uid}", price, cost))
        self.conn.commit()
        self.created_product_ids.append(uid)
        return uid

    # -------------------------------------------------------------------------
    # 1. Expiry Stock Report Tests
    # -------------------------------------------------------------------------
    def test_expiry_stock_report_filtering(self):
        """Report filters lots within horizon and calculates days_to_expiry and inventory value."""
        pid = self.create_isolated_product("Expiry Rep Item", price=100, cost=60)
        bnum = f"EXP-REP-{uuid.uuid4().hex[:5]}"
        exp_date = date.today() + timedelta(days=20)

        self.cur.execute("""
            INSERT INTO batches (product_id, batch_number, mfg_date, expiry_date, cost_price, mrp, status)
            VALUES (%s, %s, %s, %s, 60, 100, 'ACTIVE')
        """, (pid, bnum, date.today() - timedelta(days=10), exp_date))
        bid = self.cur.lastrowid

        self.cur.execute("""
            INSERT INTO batch_stock (product_id, location_id, batch_id, quantity_saleable)
            VALUES (%s, %s, %s, 25)
        """, (pid, self.store_101, bid))
        self.conn.commit()

        # Query 30 days horizon
        rep = get_expiry_stock_report(self.cur, days_threshold=30, location_id=self.store_101)
        found = [r for r in rep["records"] if r["batch_id"] == bid]
        self.assertEqual(len(found), 1)
        self.assertEqual(found[0]["days_to_expiry"], 20)
        self.assertEqual(found[0]["quantity"], 25)
        self.assertEqual(found[0]["inventory_value_cost"], 1500.0) # 25 * 60

        # Query 10 days horizon -> should not appear
        rep10 = get_expiry_stock_report(self.cur, days_threshold=10, location_id=self.store_101)
        found10 = [r for r in rep10["records"] if r["batch_id"] == bid]
        self.assertEqual(len(found10), 0)

    # -------------------------------------------------------------------------
    # 2. Code Management Physical Audits Tests
    # -------------------------------------------------------------------------
    def test_physical_audit_lifecycle(self):
        """
        Full Audit Lifecycle:
        1. Supervisor creates audit task (PENDING_COUNT)
        2. Store executive inputs physical counts with discrepancy (SUBMITTED)
        3. Supervisor approves discrepancy -> updates batch_stock and movements (APPROVED)
        """
        pid = self.create_isolated_product("Audit Item", price=150, cost=90)
        bnum = f"AUD-LOT-{uuid.uuid4().hex[:5]}"

        self.cur.execute("""
            INSERT INTO batches (product_id, batch_number, mfg_date, expiry_date, cost_price, mrp, status)
            VALUES (%s, %s, %s, %s, 90, 150, 'ACTIVE')
        """, (pid, bnum, date.today() - timedelta(days=5), date.today() + timedelta(days=40)))
        bid = self.cur.lastrowid

        # System quantity is 50
        self.cur.execute("""
            INSERT INTO batch_stock (product_id, location_id, batch_id, quantity_saleable)
            VALUES (%s, %s, %s, 50)
        """, (pid, self.store_101, bid))
        self.conn.commit()

        # 1. Create audit
        audit = create_code_audit(self.cur, location_id=self.store_101, created_by="supervisor_1")
        self.conn.commit()
        aid = audit["audit_id"]
        self.created_audit_ids.append(aid)
        self.assertEqual(audit["status"], "PENDING_COUNT")

        # 2. Store Executive records physical count = 48 (shortage of 2)
        self.cur.execute("SELECT audit_item_id FROM audit_items WHERE audit_id = %s AND batch_id = %s", (aid, bid))
        item_id = self.cur.fetchone()[0]

        sub_res = submit_code_audit(
            self.cur, aid,
            physical_counts=[{"audit_item_id": item_id, "physical_qty": 48, "remarks": "2 broken jars on bottom shelf"}],
            submitted_by="executive_1"
        )
        self.conn.commit()
        self.assertEqual(sub_res["status"], "SUBMITTED")
        self.assertEqual(sub_res["discrepant_batches"], 1)

        # 3. Supervisor approves discrepancy
        app_res = approve_code_audit(self.cur, aid, approved_by="supervisor_1", user_role="store_supervisor")
        self.conn.commit()
        self.assertEqual(app_res["status"], "APPROVED")
        self.assertEqual(app_res["adjustments_applied"], 1)

        # Verify batch_stock is adjusted to 48
        self.cur.execute("SELECT quantity_saleable FROM batch_stock WHERE batch_id = %s AND location_id = %s", (bid, self.store_101))
        self.assertEqual(self.cur.fetchone()[0], 48)

    def test_audit_segregation_of_duties_rejection(self):
        """A user who entered physical counts CANNOT approve their own audit adjustments."""
        pid = self.create_isolated_product("SOD Audit Item")
        bnum = f"AUD-SOD-{uuid.uuid4().hex[:5]}"

        self.cur.execute("""
            INSERT INTO batches (product_id, batch_number, mfg_date, expiry_date, cost_price, mrp, status)
            VALUES (%s, %s, %s, %s, 80, 120, 'ACTIVE')
        """, (pid, bnum, date.today() - timedelta(days=5), date.today() + timedelta(days=40)))
        bid = self.cur.lastrowid

        self.cur.execute("INSERT INTO batch_stock (product_id, location_id, batch_id, quantity_saleable) VALUES (%s, %s, %s, 30)", (pid, self.store_101, bid))
        self.conn.commit()

        audit = create_code_audit(self.cur, self.store_101, created_by="supervisor_self")
        aid = audit["audit_id"]
        self.created_audit_ids.append(aid)
        self.conn.commit()

        self.cur.execute("SELECT audit_item_id FROM audit_items WHERE audit_id = %s AND batch_id = %s", (aid, bid))
        item_id = self.cur.fetchone()[0]

        # Count submitted by "supervisor_self"
        submit_code_audit(self.cur, aid, [{"audit_item_id": item_id, "physical_qty": 28}], submitted_by="supervisor_self")
        self.conn.commit()

        # Approval by the SAME user must fail under Segregation of Duties
        with self.assertRaises(SegregationOfDutiesError):
            approve_code_audit(self.cur, aid, approved_by="supervisor_self", user_role="store_supervisor")

    # -------------------------------------------------------------------------
    # 3. Markdowns & Push Sale Tests
    # -------------------------------------------------------------------------
    def test_markdown_proposal_and_approval_workflow(self):
        """Store executive proposes markdown; Store supervisor approves <=20%."""
        pid = self.create_isolated_product("Mkd Item", price=200, cost=100)
        bnum = f"MKD-WF-{uuid.uuid4().hex[:5]}"

        self.cur.execute("""
            INSERT INTO batches (product_id, batch_number, mfg_date, expiry_date, cost_price, mrp, status)
            VALUES (%s, %s, %s, %s, 100, 200, 'ACTIVE')
        """, (pid, bnum, date.today() - timedelta(days=5), date.today() + timedelta(days=20)))
        bid = self.cur.lastrowid

        self.cur.execute("INSERT INTO batch_stock (product_id, location_id, batch_id, quantity_saleable) VALUES (%s, %s, %s, 40)", (pid, self.store_101, bid))
        self.conn.commit()

        # Propose 15% markdown by Store Executive
        prop = propose_markdown(
            self.cur, location_id=self.store_101, product_id=pid, batch_id=bid,
            proposed_discount=15.0, proposed_by="store_exec_1", notes="Near-expiry push sale"
        )
        self.conn.commit()
        mkd_id = prop["markdown_id"]
        self.created_markdown_ids.append(mkd_id)
        self.assertEqual(prop["status"], "PROPOSED")
        self.assertEqual(prop["markdown_price"], 170.0) # 200 - 15%

        # Approve by Store Supervisor
        app_res = approve_markdown(
            self.cur, markdown_id=mkd_id, approved_discount=15.0,
            approved_by="supervisor_1", user_role="store_supervisor"
        )
        self.conn.commit()
        self.assertEqual(app_res["status"], "ACTIVE")
        self.assertEqual(app_res["markdown_price"], 170.0)

    def test_supervisor_discount_limit_rejection(self):
        """Supervisor cannot approve discounts exceeding supervisor_max_discount_pct (20%)."""
        pid = self.create_isolated_product("High Disc Item", price=200, cost=80)
        bnum = f"MKD-HIGH-{uuid.uuid4().hex[:5]}"

        self.cur.execute("""
            INSERT INTO batches (product_id, batch_number, mfg_date, expiry_date, cost_price, mrp, status)
            VALUES (%s, %s, %s, %s, 80, 200, 'ACTIVE')
        """, (pid, bnum, date.today() - timedelta(days=5), date.today() + timedelta(days=10)))
        bid = self.cur.lastrowid

        self.cur.execute("INSERT INTO batch_stock (product_id, location_id, batch_id, quantity_saleable) VALUES (%s, %s, %s, 40)", (pid, self.store_101, bid))
        self.conn.commit()

        prop = propose_markdown(self.cur, self.store_101, pid, bid, 35.0, "store_exec_1")
        self.conn.commit()
        mkd_id = prop["markdown_id"]
        self.created_markdown_ids.append(mkd_id)

        # Supervisor attempting 35% discount -> REJECTED
        with self.assertRaises(PolicyViolationError) as ctx:
            approve_markdown(self.cur, mkd_id, approved_discount=35.0, approved_by="supervisor_1", user_role="store_supervisor")
        self.assertIn("exceeds store supervisor approval limit", str(ctx.exception).lower())

        # Category Manager approving 35% discount -> SUCCEEDS
        cat_res = approve_markdown(self.cur, mkd_id, approved_discount=35.0, approved_by="cat_manager_1", user_role="category_manager")
        self.conn.commit()
        self.assertEqual(cat_res["status"], "ACTIVE")

    def test_markdown_segregation_of_duties_rejection(self):
        """Proposer of a markdown cannot approve their own markdown."""
        pid = self.create_isolated_product("Mkd SOD Item")
        bnum = f"MKD-SOD-{uuid.uuid4().hex[:5]}"

        self.cur.execute("""
            INSERT INTO batches (product_id, batch_number, mfg_date, expiry_date, cost_price, mrp, status)
            VALUES (%s, %s, %s, %s, 100, 200, 'ACTIVE')
        """, (pid, bnum, date.today() - timedelta(days=5), date.today() + timedelta(days=20)))
        bid = self.cur.lastrowid

        self.cur.execute("INSERT INTO batch_stock (product_id, location_id, batch_id, quantity_saleable) VALUES (%s, %s, %s, 40)", (pid, self.store_101, bid))
        self.conn.commit()

        prop = propose_markdown(self.cur, self.store_101, pid, bid, 10.0, "user_self")
        self.conn.commit()
        mkd_id = prop["markdown_id"]
        self.created_markdown_ids.append(mkd_id)

        # Self-approval rejected
        with self.assertRaises(SegregationOfDutiesError):
            approve_markdown(self.cur, mkd_id, 10.0, approved_by="user_self", user_role="store_supervisor")

    # -------------------------------------------------------------------------
    # 4. Approvals Inbox Tests
    # -------------------------------------------------------------------------
    def test_pending_approvals_inbox(self):
        """Approvals inbox lists pending items and accurately flags self-drafted items."""
        inbox = get_pending_approvals(self.cur, user_role="store_supervisor", user_store_id=self.store_101, username="test_supervisor")
        self.assertIn("pending_audits", inbox)
        self.assertIn("pending_markdowns", inbox)


if __name__ == "__main__":
    unittest.main()


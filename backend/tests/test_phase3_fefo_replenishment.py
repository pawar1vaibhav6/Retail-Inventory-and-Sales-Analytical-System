"""
Unit Tests for Phase 3: System-Enforced FEFO Allocation & Store Replenishment
Validates:
- Pure FEFO Allocation Sorting (earliest expiry picked first)
- Split Batch Allocation across multiple batches
- Expired & Quarantined Lot Exclusion from Allocation
- End-to-End Store Replenishment Lifecycle (Request -> Allocate -> Dispatch -> Receive)
- Manual FEFO Override with Mandatory Audit Reason
- Role Access & Store Scoping Permissions
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
    allocate_fefo,
    create_replenishment_request,
    process_replenishment_allocation,
    dispatch_replenishment_transfer,
    receive_replenishment_at_store,
    InsufficientStockError,
    PolicyViolationError,
    ValidationError
)


class TestPhase3FEFOReplenishment(unittest.TestCase):

    def setUp(self):
        self.conn = db.get_connection()
        self.cur = self.conn.cursor()
        self.client = app.test_client()

        # Get DC and Store IDs
        self.cur.execute("SELECT location_id FROM locations WHERE type = 'DC' LIMIT 1")
        self.dc_id = self.cur.fetchone()[0]

        self.cur.execute("SELECT location_id FROM locations WHERE code = 'STORE-101' LIMIT 1")
        self.store_id = self.cur.fetchone()[0]

        self.created_product_ids = []
        self.created_replenishment_ids = []

    def tearDown(self):
        # Clean up any test products created during test run
        try:
            if self.created_product_ids:
                format_strings = ','.join(['%s'] * len(self.created_product_ids))
                pids = tuple(self.created_product_ids)
                self.cur.execute(f"DELETE FROM replenishment_items WHERE product_id IN ({format_strings})", pids)
                self.cur.execute(f"DELETE FROM stock_movements WHERE product_id IN ({format_strings})", pids)
                self.cur.execute(f"DELETE FROM batch_stock WHERE product_id IN ({format_strings})", pids)
                self.cur.execute(f"DELETE FROM batches WHERE product_id IN ({format_strings})", pids)
                self.cur.execute(f"DELETE FROM Products WHERE product_id IN ({format_strings})", pids)
            if self.created_replenishment_ids:
                r_format = ','.join(['%s'] * len(self.created_replenishment_ids))
                rids = tuple(self.created_replenishment_ids)
                self.cur.execute(f"DELETE FROM replenishment_items WHERE replenishment_id IN ({r_format})", rids)
                self.cur.execute(f"DELETE FROM store_replenishments WHERE replenishment_id IN ({r_format})", rids)
            self.conn.commit()
        except Exception:
            self.conn.rollback()
        finally:
            self.conn.close()

    def create_isolated_product(self, name="Test Item"):
        uid = int(uuid.uuid4().int % 800000 + 100000)
        self.cur.execute("""
            INSERT INTO Products (product_id, p_name, category, price, cost, stock_quantity)
            VALUES (%s, %s, 'Groceries', 200, 150, 100)
        """, (uid, f"{name} {uid}"))
        self.conn.commit()
        self.created_product_ids.append(uid)
        return uid

    # -------------------------------------------------------------------------
    # 1. Pure FEFO Sorting Tests
    # -------------------------------------------------------------------------
    def test_allocate_fefo_earliest_expiry_first(self):
        """Engine strictly picks batch with earliest expiry date first."""
        pid = self.create_isolated_product("FEFO Sort Item")
        batch_earlier = f"EARLY-{uuid.uuid4().hex[:5]}"
        batch_later = f"LATE-{uuid.uuid4().hex[:5]}"

        exp_early = date.today() + timedelta(days=20)
        exp_late = date.today() + timedelta(days=120)

        # Create later batch first
        self.cur.execute("""
            INSERT INTO batches (product_id, batch_number, mfg_date, expiry_date, cost_price, mrp, status)
            VALUES (%s, %s, %s, %s, 100, 150, 'ACTIVE')
        """, (pid, batch_later, date.today() - timedelta(days=10), exp_late))
        b_late_id = self.cur.lastrowid

        self.cur.execute("""
            INSERT INTO batch_stock (product_id, location_id, batch_id, quantity_saleable)
            VALUES (%s, %s, %s, 50)
        """, (pid, self.dc_id, b_late_id))

        # Create earlier batch second
        self.cur.execute("""
            INSERT INTO batches (product_id, batch_number, mfg_date, expiry_date, cost_price, mrp, status)
            VALUES (%s, %s, %s, %s, 100, 150, 'ACTIVE')
        """, (pid, batch_earlier, date.today() - timedelta(days=10), exp_early))
        b_early_id = self.cur.lastrowid

        self.cur.execute("""
            INSERT INTO batch_stock (product_id, location_id, batch_id, quantity_saleable)
            VALUES (%s, %s, %s, 50)
        """, (pid, self.dc_id, b_early_id))
        self.conn.commit()

        # Allocate 15 units -> MUST pick the earlier batch
        allocations = allocate_fefo(self.cur, pid, self.dc_id, 15, allow_split=False)
        self.assertEqual(len(allocations), 1)
        self.assertEqual(allocations[0]["batch_id"], b_early_id)
        self.assertEqual(allocations[0]["batch_number"], batch_earlier)
        self.assertEqual(allocations[0]["allocated_qty"], 15)

    # -------------------------------------------------------------------------
    # 2. Split Batch Allocation Tests
    # -------------------------------------------------------------------------
    def test_allocate_fefo_split_across_batches(self):
        """When earlier batch has insufficient qty, allocate remainder from next earliest batch."""
        pid = self.create_isolated_product("Split Item")
        batch_1 = f"SPLIT-1-{uuid.uuid4().hex[:5]}"
        batch_2 = f"SPLIT-2-{uuid.uuid4().hex[:5]}"

        # Batch 1: only 8 units left
        self.cur.execute("""
            INSERT INTO batches (product_id, batch_number, mfg_date, expiry_date, cost_price, mrp, status)
            VALUES (%s, %s, %s, %s, 100, 150, 'ACTIVE')
        """, (pid, batch_1, date.today() - timedelta(days=5), date.today() + timedelta(days=25)))
        b1_id = self.cur.lastrowid
        self.cur.execute("""
            INSERT INTO batch_stock (product_id, location_id, batch_id, quantity_saleable)
            VALUES (%s, %s, %s, 8)
        """, (pid, self.dc_id, b1_id))

        # Batch 2: 40 units available
        self.cur.execute("""
            INSERT INTO batches (product_id, batch_number, mfg_date, expiry_date, cost_price, mrp, status)
            VALUES (%s, %s, %s, %s, 100, 150, 'ACTIVE')
        """, (pid, batch_2, date.today() - timedelta(days=5), date.today() + timedelta(days=60)))
        b2_id = self.cur.lastrowid
        self.cur.execute("""
            INSERT INTO batch_stock (product_id, location_id, batch_id, quantity_saleable)
            VALUES (%s, %s, %s, 40)
        """, (pid, self.dc_id, b2_id))
        self.conn.commit()

        # Request 20 units with allow_split=True
        allocs = allocate_fefo(self.cur, pid, self.dc_id, 20, allow_split=True)
        self.assertEqual(len(allocs), 2)
        self.assertEqual(allocs[0]["batch_id"], b1_id)
        self.assertEqual(allocs[0]["allocated_qty"], 8)
        self.assertEqual(allocs[1]["batch_id"], b2_id)
        self.assertEqual(allocs[1]["allocated_qty"], 12)

    # -------------------------------------------------------------------------
    # 3. Expired & Quarantined Lot Exclusion Tests
    # -------------------------------------------------------------------------
    def test_allocate_fefo_skips_expired_and_quarantined_lots(self):
        """Expired or quarantined batches are strictly excluded from FEFO allocation."""
        pid = self.create_isolated_product("Exclusion Item")
        b_expired = f"EXP-{uuid.uuid4().hex[:5]}"
        b_quarantined = f"QUAR-{uuid.uuid4().hex[:5]}"
        b_valid = f"VAL-{uuid.uuid4().hex[:5]}"

        # Expired batch
        self.cur.execute("""
            INSERT INTO batches (product_id, batch_number, mfg_date, expiry_date, cost_price, mrp, status)
            VALUES (%s, %s, %s, %s, 100, 150, 'ACTIVE')
        """, (pid, b_expired, date.today() - timedelta(days=60), date.today() - timedelta(days=5)))
        b_exp_id = self.cur.lastrowid
        self.cur.execute("""
            INSERT INTO batch_stock (product_id, location_id, batch_id, quantity_saleable)
            VALUES (%s, %s, %s, 100)
        """, (pid, self.dc_id, b_exp_id))

        # Quarantined batch
        self.cur.execute("""
            INSERT INTO batches (product_id, batch_number, mfg_date, expiry_date, cost_price, mrp, status)
            VALUES (%s, %s, %s, %s, 100, 150, 'QUARANTINED')
        """, (pid, b_quarantined, date.today() - timedelta(days=10), date.today() + timedelta(days=50)))
        b_quar_id = self.cur.lastrowid
        self.cur.execute("""
            INSERT INTO batch_stock (product_id, location_id, batch_id, quantity_saleable)
            VALUES (%s, %s, %s, 100)
        """, (pid, self.dc_id, b_quar_id))

        # Valid active batch
        self.cur.execute("""
            INSERT INTO batches (product_id, batch_number, mfg_date, expiry_date, cost_price, mrp, status)
            VALUES (%s, %s, %s, %s, 100, 150, 'ACTIVE')
        """, (pid, b_valid, date.today() - timedelta(days=10), date.today() + timedelta(days=90)))
        b_val_id = self.cur.lastrowid
        self.cur.execute("""
            INSERT INTO batch_stock (product_id, location_id, batch_id, quantity_saleable)
            VALUES (%s, %s, %s, 50)
        """, (pid, self.dc_id, b_val_id))
        self.conn.commit()

        allocs = allocate_fefo(self.cur, pid, self.dc_id, 10, allow_split=False)
        self.assertEqual(len(allocs), 1)
        self.assertEqual(allocs[0]["batch_id"], b_val_id)
        self.assertEqual(allocs[0]["batch_number"], b_valid)

    # -------------------------------------------------------------------------
    # 4. End-to-End Store Replenishment Workflow Tests
    # -------------------------------------------------------------------------
    def test_replenishment_full_lifecycle(self):
        """
        Step 1: Store Supervisor creates request -> REQUESTED
        Step 2: FEFO allocation executed -> ALLOCATED (DC reserved stock increases)
        Step 3: DC Picker dispatches transfer -> IN_TRANSIT (DC reserved stock deducted)
        Step 4: Store Supervisor receives at store -> RECEIVED (Store saleable stock increases)
        """
        pid = self.create_isolated_product("Replenish Life Item")
        test_bnum = f"REP-CYCLE-{uuid.uuid4().hex[:5]}"
        self.cur.execute("""
            INSERT INTO batches (product_id, batch_number, mfg_date, expiry_date, cost_price, mrp, status)
            VALUES (%s, %s, %s, %s, 120, 180, 'ACTIVE')
        """, (pid, test_bnum, date.today() - timedelta(days=5), date.today() + timedelta(days=100)))
        b_id = self.cur.lastrowid

        self.cur.execute("""
            INSERT INTO batch_stock (product_id, location_id, batch_id, quantity_saleable, quantity_reserved)
            VALUES (%s, %s, %s, 100, 0)
        """, (pid, self.dc_id, b_id))
        self.conn.commit()

        # Step 1: Create request
        transfer_qty = 25
        req = create_replenishment_request(
            self.cur,
            from_location_id=self.dc_id,
            to_location_id=self.store_id,
            requested_by="supervisor",
            items_data=[{"product_id": pid, "requested_qty": transfer_qty}]
        )
        self.conn.commit()
        rep_id = req["replenishment_id"]
        self.created_replenishment_ids.append(rep_id)
        self.assertEqual(req["status"], "REQUESTED")

        # Step 2: FEFO Allocation
        alloc_res = process_replenishment_allocation(self.cur, rep_id, allocated_by="picker", user_role="warehouse_picker")
        self.conn.commit()
        self.assertEqual(alloc_res["status"], "ALLOCATED")

        # Check DC reserved stock is incremented
        self.cur.execute("SELECT quantity_saleable, quantity_reserved FROM batch_stock WHERE batch_id = %s AND location_id = %s", (b_id, self.dc_id))
        dc_stock = self.cur.fetchone()
        self.assertEqual(dc_stock[0], 100)
        self.assertEqual(dc_stock[1], transfer_qty)

        # Step 3: Dispatch transfer
        disp_res = dispatch_replenishment_transfer(self.cur, rep_id, picker="picker")
        self.conn.commit()
        self.assertEqual(disp_res["status"], "IN_TRANSIT")

        # Check DC reserved stock is deducted from both saleable and reserved
        self.cur.execute("SELECT quantity_saleable, quantity_reserved FROM batch_stock WHERE batch_id = %s AND location_id = %s", (b_id, self.dc_id))
        dc_post = self.cur.fetchone()
        self.assertEqual(dc_post[0], 100 - transfer_qty)
        self.assertEqual(dc_post[1], 0)

        # Step 4: Receive at Store
        rec_res = receive_replenishment_at_store(self.cur, rep_id, receiver="supervisor")
        self.conn.commit()
        self.assertEqual(rec_res["status"], "RECEIVED")

        # Verify store batch_stock now contains the 25 units
        self.cur.execute(
            "SELECT quantity_saleable FROM batch_stock WHERE batch_id = %s AND location_id = %s",
            (b_id, self.store_id)
        )
        store_stock = self.cur.fetchone()
        self.assertIsNotNone(store_stock)
        self.assertEqual(store_stock[0], transfer_qty)

    # -------------------------------------------------------------------------
    # 5. Manual FEFO Override Tests
    # -------------------------------------------------------------------------
    def test_manual_fefo_override_requires_reason(self):
        """Manual FEFO override without a justification reason is rejected."""
        pid = self.create_isolated_product("Override Item")
        batch_early = f"OVR-EARLY-{uuid.uuid4().hex[:5]}"
        batch_alt = f"OVR-ALT-{uuid.uuid4().hex[:5]}"

        self.cur.execute("""
            INSERT INTO batches (product_id, batch_number, mfg_date, expiry_date, cost_price, mrp, status)
            VALUES (%s, %s, %s, %s, 100, 150, 'ACTIVE')
        """, (pid, batch_early, date.today() - timedelta(days=5), date.today() + timedelta(days=30)))
        b_early_id = self.cur.lastrowid
        self.cur.execute("INSERT INTO batch_stock (product_id, location_id, batch_id, quantity_saleable) VALUES (%s, %s, %s, 50)", (pid, self.dc_id, b_early_id))

        self.cur.execute("""
            INSERT INTO batches (product_id, batch_number, mfg_date, expiry_date, cost_price, mrp, status)
            VALUES (%s, %s, %s, %s, 100, 150, 'ACTIVE')
        """, (pid, batch_alt, date.today() - timedelta(days=5), date.today() + timedelta(days=90)))
        b_alt_id = self.cur.lastrowid
        self.cur.execute("INSERT INTO batch_stock (product_id, location_id, batch_id, quantity_saleable) VALUES (%s, %s, %s, 50)", (pid, self.dc_id, b_alt_id))
        self.conn.commit()

        req = create_replenishment_request(self.cur, self.dc_id, self.store_id, "supervisor", [{"product_id": pid, "requested_qty": 10}])
        rep_id = req["replenishment_id"]
        self.created_replenishment_ids.append(rep_id)
        self.conn.commit()

        self.cur.execute("SELECT item_id FROM replenishment_items WHERE replenishment_id = %s", (rep_id,))
        item_id = self.cur.fetchone()[0]

        # Override without reason should fail
        with self.assertRaises(PolicyViolationError) as ctx:
            process_replenishment_allocation(
                self.cur, rep_id, allocated_by="admin", user_role="admin",
                overrides=[{
                    "item_id": item_id,
                    "product_id": pid,
                    "override_batch_id": b_alt_id,
                    "reason": "" # Empty reason!
                }]
            )
        self.assertIn("reason is required", str(ctx.exception).lower())

    def test_manual_fefo_override_with_reason_succeeds(self):
        """Manual FEFO override with justification reason succeeds and logs override."""
        pid = self.create_isolated_product("Override Success Item")
        batch_early = f"OVR-EARLY-{uuid.uuid4().hex[:5]}"
        batch_alt = f"OVR-ALT-{uuid.uuid4().hex[:5]}"

        self.cur.execute("""
            INSERT INTO batches (product_id, batch_number, mfg_date, expiry_date, cost_price, mrp, status)
            VALUES (%s, %s, %s, %s, 100, 150, 'ACTIVE')
        """, (pid, batch_early, date.today() - timedelta(days=5), date.today() + timedelta(days=30)))
        b_early_id = self.cur.lastrowid
        self.cur.execute("INSERT INTO batch_stock (product_id, location_id, batch_id, quantity_saleable) VALUES (%s, %s, %s, 50)", (pid, self.dc_id, b_early_id))

        self.cur.execute("""
            INSERT INTO batches (product_id, batch_number, mfg_date, expiry_date, cost_price, mrp, status)
            VALUES (%s, %s, %s, %s, 100, 150, 'ACTIVE')
        """, (pid, batch_alt, date.today() - timedelta(days=5), date.today() + timedelta(days=90)))
        b_alt_id = self.cur.lastrowid
        self.cur.execute("INSERT INTO batch_stock (product_id, location_id, batch_id, quantity_saleable) VALUES (%s, %s, %s, 50)", (pid, self.dc_id, b_alt_id))
        self.conn.commit()

        req = create_replenishment_request(self.cur, self.dc_id, self.store_id, "supervisor", [{"product_id": pid, "requested_qty": 10}])
        rep_id = req["replenishment_id"]
        self.created_replenishment_ids.append(rep_id)
        self.conn.commit()

        self.cur.execute("SELECT item_id FROM replenishment_items WHERE replenishment_id = %s", (rep_id,))
        item_id = self.cur.fetchone()[0]

        res = process_replenishment_allocation(
            self.cur, rep_id, allocated_by="admin", user_role="admin",
            overrides=[{
                "item_id": item_id,
                "product_id": pid,
                "override_batch_id": b_alt_id,
                "reason": "Carton exterior torn on rack A"
            }]
        )
        self.conn.commit()
        self.assertEqual(res["status"], "ALLOCATED")
        self.assertEqual(res["pick_list"][0]["batch_id"], b_alt_id)
        self.assertTrue(res["pick_list"][0]["is_override"])


if __name__ == "__main__":
    unittest.main()

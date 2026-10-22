"""
Unit Tests for Phase 6: Analytics, Role Dashboard Metrics, Notifications & Daily Alert Job
Validates:
- Expiry stock ageing distribution across 0-30d, 31-60d, 61-90d, >90d buckets
- Category scrap write-off loss trend
- Markdown push-sale sell-through performance analytics
- Supplier return rate metrics
- FEFO override rate per fulfillment DC
- Role-scoped KPI dashboard metrics (admin, category_manager, store_supervisor, accounts)
- Scheduled daily alert job execution and targeted notification generation
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
    get_expiry_ageing_summary,
    get_scrap_loss_trend,
    get_markdown_sellthrough_analytics,
    get_supplier_return_rate_analytics,
    get_fefo_override_analytics,
    get_role_dashboard_metrics
)
from scheduled_jobs import run_daily_expiry_notification_job, ensure_notifications_table


class TestPhase6AnalyticsJobs(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.conn = db.get_connection()
        cls.client = app.test_client()

    @classmethod
    def tearDownClass(cls):
        cls.conn.close()

    def test_expiry_ageing_distribution(self):
        """Test calculation of inventory value across ageing buckets."""
        with self.conn.cursor() as cur:
            res = get_expiry_ageing_summary(cur)
            self.assertIn("buckets", res)
            self.assertIn("0_30", res["buckets"])
            self.assertIn("31_60", res["buckets"])
            self.assertIn("61_90", res["buckets"])
            self.assertIn("OVER_90", res["buckets"])
            self.assertGreaterEqual(res["total_units"], 0)
            self.assertGreaterEqual(res["total_cost_value"], 0.0)

    def test_scrap_loss_trend(self):
        """Test category-level scrap loss aggregation."""
        with self.conn.cursor() as cur:
            trend = get_scrap_loss_trend(cur)
            self.assertIsInstance(trend, list)
            for item in trend:
                self.assertIn("category", item)
                self.assertIn("scrap_units", item)
                self.assertIn("scrap_cost_value", item)
                self.assertGreaterEqual(item["scrap_units"], 0)

    def test_markdown_sellthrough_metrics(self):
        """Test push-sale sell-through aggregation."""
        with self.conn.cursor() as cur:
            data = get_markdown_sellthrough_analytics(cur)
            self.assertIn("total_promotions", data)
            self.assertIn("total_units_marked_down", data)
            self.assertIn("total_units_sold", data)
            self.assertIn("sell_through_percent", data)
            self.assertGreaterEqual(data["sell_through_percent"], 0.0)
            self.assertLessEqual(data["sell_through_percent"], 100.0)

    def test_supplier_return_rate_calculation(self):
        """Test vendor return rate calculation."""
        with self.conn.cursor() as cur:
            rates = get_supplier_return_rate_analytics(cur)
            self.assertIsInstance(rates, list)
            if rates:
                first = rates[0]
                self.assertIn("supplier_id", first)
                self.assertIn("supplier_name", first)
                self.assertIn("inward_units", first)
                self.assertIn("return_units", first)
                self.assertIn("return_rate_pct", first)

    def test_fefo_override_rate_analytics(self):
        """Test DC FEFO override rate tracking."""
        with self.conn.cursor() as cur:
            analytics = get_fefo_override_analytics(cur)
            self.assertIsInstance(analytics, list)
            for dc in analytics:
                self.assertIn("location_id", dc)
                self.assertIn("total_allocations", dc)
                self.assertIn("override_count", dc)
                self.assertIn("override_rate_pct", dc)
                self.assertGreaterEqual(dc["override_rate_pct"], 0.0)
                self.assertLessEqual(dc["override_rate_pct"], 100.0)

    def test_role_dashboard_metrics_scoping(self):
        """Test role-scoped dashboard metrics generation."""
        with self.conn.cursor() as cur:
            # 1. Admin metrics (cross-store)
            admin_metrics = get_role_dashboard_metrics(cur, user_role="admin", user_store_id=None)
            self.assertEqual(admin_metrics["role"], "admin")
            self.assertIn("near_expiry_30d_value", admin_metrics)
            self.assertIn("pending_approvals_count", admin_metrics)
            self.assertIn("open_debit_notes_count", admin_metrics)

            # 2. Store Supervisor metrics (scoped to store 2)
            sup_metrics = get_role_dashboard_metrics(cur, user_role="store_supervisor", user_store_id=2)
            self.assertEqual(sup_metrics["role"], "store_supervisor")
            self.assertEqual(sup_metrics["store_id"], 2)
            self.assertIn("near_expiry_30d_value", sup_metrics)

            # 3. Accounts metrics
            acc_metrics = get_role_dashboard_metrics(cur, user_role="accounts", user_store_id=None)
            self.assertEqual(acc_metrics["role"], "accounts")
            self.assertIn("open_debit_notes_count", acc_metrics)
            self.assertIn("open_debit_notes_amount", acc_metrics)

    def test_scheduled_daily_expiry_job(self):
        """Test running the daily expiry notification scheduled job."""
        res = run_daily_expiry_notification_job(self.conn)
        self.assertTrue(res["success"])
        self.assertIn("alerts_generated", res)
        self.assertIn("total_chain_batches", res)
        self.assertIn("timestamp", res)

        # Verify notifications table has records
        with self.conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM system_notifications")
            count = cur.fetchone()[0]
            self.assertGreater(count, 0)


if __name__ == "__main__":
    unittest.main()


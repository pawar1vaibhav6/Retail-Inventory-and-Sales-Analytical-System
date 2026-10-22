"""
Daily Automated Scheduled Job for Batch Expiry Checks, Dump Stock Detection,
and Inter-Store Transfer Advice.
Modelled for DMart-Style Multi-Echelon Retail Logistics.
Can be executed via CLI, cron ('0 6 * * *'), or system scheduler.
"""

import os
import sys
import json
from datetime import datetime, date

# Ensure backend directory is in python path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from db import get_connection
from batch_engine import (
    get_expiry_stock_report,
    detect_dump_stock,
    get_interstore_transfer_suggestions
)


def run_daily_expiry_check():
    """
    Executes daily audit of inventory batches across all DCs and stores:
    1. Flips status to 'EXPIRED' for lots past today's date.
    2. Flips status to 'NEAR_EXPIRY' for lots within 30 days.
    3. Runs dump stock analysis.
    4. Computes inter-store rebalancing transfer advice.
    5. Saves daily summary artifact to disk.
    """
    print(f"[{datetime.now().isoformat()}] Starting RetailSphere Daily Expiry Audit Job...")
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            # 1. Update status to EXPIRED for past lots
            cur.execute("""
                UPDATE batches 
                SET status = 'EXPIRED' 
                WHERE expiry_date < CURRENT_DATE() AND status NOT IN ('EXPIRED', 'SCRAP')
            """)
            expired_updated = cur.rowcount

            # 2. Update status to NEAR_EXPIRY for lots within 30 days
            cur.execute("""
                UPDATE batches 
                SET status = 'NEAR_EXPIRY' 
                WHERE expiry_date >= CURRENT_DATE() 
                  AND DATEDIFF(expiry_date, CURRENT_DATE()) <= 30 
                  AND status = 'ACTIVE'
            """)
            near_expiry_updated = cur.rowcount
            conn.commit()

            print(f"  [OK] Updated {expired_updated} batches to EXPIRED.")
            print(f"  [OK] Updated {near_expiry_updated} batches to NEAR_EXPIRY.")

            # 3. Pull 30-day expiry stock report
            rep_30 = get_expiry_stock_report(cur, days_threshold=30)
            rep_60 = get_expiry_stock_report(cur, days_threshold=60)
            rep_90 = get_expiry_stock_report(cur, days_threshold=90)

            # 4. Detect slow-moving dump stock
            dump_items = detect_dump_stock(cur, days_threshold=30, sales_lookback_days=30)
            print(f"  [OK] Flagged {len(dump_items)} dump stock lots at risk.")

            # 5. Generate inter-store transfer suggestions
            transfer_suggs = get_interstore_transfer_suggestions(cur)
            print(f"  [OK] Generated {len(transfer_suggs)} inter-store transfer suggestions.")

            summary = {
                "generated_at": datetime.now().isoformat(),
                "audit_date": str(date.today()),
                "expired_batches_flipped": expired_updated,
                "near_expiry_batches_flipped": near_expiry_updated,
                "at_risk_windows": {
                    "30_days": {"units": rep_30["total_units"], "value": rep_30["total_cost_value"]},
                    "60_days": {"units": rep_60["total_units"], "value": rep_60["total_cost_value"]},
                    "90_days": {"units": rep_90["total_units"], "value": rep_90["total_cost_value"]}
                },
                "dump_stock_count": len(dump_items),
                "dump_stock_items": dump_items,
                "transfer_suggestions_count": len(transfer_suggs),
                "transfer_suggestions": transfer_suggs
            }

            # Save report to data directory
            data_dir = os.path.join(backend_dir, "data")
            os.makedirs(data_dir, exist_ok=True)
            report_path = os.path.join(data_dir, "daily_expiry_report.json")
            with open(report_path, "w", encoding="utf-8") as f:
                json.dump(summary, f, indent=2)

            print(f"[{datetime.now().isoformat()}] Daily Expiry Audit Job Complete. Report saved to: {report_path}")
            return summary
    finally:
        conn.close()


if __name__ == "__main__":
    run_daily_expiry_check()

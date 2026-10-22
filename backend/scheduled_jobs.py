"""
RetailSphere Enterprise - Scheduled Batch Jobs & Expiry Notification Engine
Periodically generates expiry reports, identifies dump stock, and dispatches
scoped alerts to Store Supervisors and Category Managers.
"""

import datetime
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from typing import Dict, Any, Optional
from db import get_connection
from batch_engine import get_expiry_stock_report, detect_dump_stock, get_interstore_transfer_suggestions


def ensure_notifications_table(cur):
    """Ensures system_notifications table exists for role-scoped alert dispatch."""
    cur.execute("""
        CREATE TABLE IF NOT EXISTS system_notifications (
            notification_id INT AUTO_INCREMENT PRIMARY KEY,
            recipient_role VARCHAR(50) NOT NULL,
            recipient_store_id INT NULL,
            recipient_username VARCHAR(100) NULL,
            title VARCHAR(255) NOT NULL,
            message TEXT NOT NULL,
            severity VARCHAR(20) DEFAULT 'INFO',
            category VARCHAR(50) DEFAULT 'EXPIRY',
            is_read TINYINT(1) DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_recipient (recipient_role, recipient_store_id, is_read)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    """)


def run_daily_expiry_notification_job(external_conn=None) -> Dict[str, Any]:
    """
    Daily scheduled job:
    1. Scans all stores and central DC for batches hitting 30/15/7 day expiry thresholds.
    2. Flags dump stock where days of inventory cover exceed days to expiry.
    3. Generates targeted alerts in system_notifications:
       - store_supervisor (scoped exclusively to their store)
       - category_manager (cross-store visibility and transfer suggestions)
    """
    should_close = False
    conn = external_conn
    if conn is None:
        conn = get_connection()
        should_close = True

    try:
        with conn.cursor() as cur:
            ensure_notifications_table(cur)

            alerts_generated = 0
            stores_notified = []

            # 1. Fetch near-expiry items <= 30 days
            cur.execute("""
                SELECT bs.location_id, l.name AS location_name, l.type AS loc_type,
                       COUNT(DISTINCT bs.batch_id) AS batch_count,
                       COALESCE(SUM(bs.quantity_saleable), 0) AS total_units,
                       COALESCE(SUM(bs.quantity_saleable * b.cost_price), 0.0) AS total_cost_value
                FROM batch_stock bs
                JOIN batches b ON bs.batch_id = b.batch_id
                JOIN locations l ON bs.location_id = l.location_id
                WHERE bs.quantity_saleable > 0
                  AND b.status = 'ACTIVE'
                  AND b.expiry_date >= CURDATE()
                  AND DATEDIFF(b.expiry_date, CURDATE()) <= 30
                GROUP BY bs.location_id, l.name, l.type
            """)
            store_rows = cur.fetchall()

            total_chain_batches = 0
            total_chain_val = 0.0

            for r in store_rows:
                loc_id = r[0]
                loc_name = r[1]
                loc_type = r[2]
                b_count = int(r[3])
                units = int(r[4])
                cost_val = round(float(r[5]), 2)

                total_chain_batches += b_count
                total_chain_val += cost_val

                # Alert Store Supervisor for their specific store
                if loc_type == "STORE":
                    cur.execute("""
                        INSERT INTO system_notifications 
                        (recipient_role, recipient_store_id, title, message, severity, category)
                        VALUES (%s, %s, %s, %s, %s, %s)
                    """, (
                        "store_supervisor",
                        loc_id,
                        f"Urgent Expiry Alert: {b_count} batches expiring within 30 days",
                        f"{loc_name} has {b_count} batches ({units} units, worth ₹{cost_val:,.2f}) at imminent risk of expiration. Initiate markdown push-sales or physical audits immediately.",
                        "URGENT",
                        "EXPIRY"
                    ))
                    alerts_generated += 1
                    stores_notified.append({"store_id": loc_id, "store_name": loc_name, "batch_count": b_count})

            # 2. Chain-wide summary alert for Category Manager
            if total_chain_batches > 0:
                cur.execute("""
                    INSERT INTO system_notifications 
                    (recipient_role, recipient_store_id, title, message, severity, category)
                    VALUES (%s, NULL, %s, %s, %s, %s)
                """, (
                    "category_manager",
                    f"Enterprise Expiry Watch: {total_chain_batches} batches near expiry",
                    f"Chain-wide scan detected {total_chain_batches} batches worth ₹{total_chain_val:,.2f} nearing expiry. Check transfer suggestions and approve markdown proposals.",
                    "WARNING",
                    "EXPIRY"
                ))
                alerts_generated += 1

            # 3. Detect Dump Stock & Alert Category Manager
            dump_items = detect_dump_stock(cur, days_threshold=30, sales_lookback_days=30)
            if dump_items:
                cur.execute("""
                    INSERT INTO system_notifications 
                    (recipient_role, recipient_store_id, title, message, severity, category)
                    VALUES (%s, NULL, %s, %s, %s, %s)
                """, (
                    "category_manager",
                    f"Dump Stock Detected: {len(dump_items)} high-risk products",
                    f"{len(dump_items)} product batches have days of cover exceeding days to expiry (imminent write-off risk). Consider inter-store stock transfers or deep markdowns.",
                    "URGENT",
                    "DUMP_STOCK"
                ))
                alerts_generated += 1

            conn.commit()
            return {
                "success": True,
                "alerts_generated": alerts_generated,
                "stores_notified": stores_notified,
                "total_chain_batches": total_chain_batches,
                "total_chain_cost_value": round(total_chain_val, 2),
                "timestamp": datetime.datetime.now().isoformat()
            }
    finally:
        if should_close and conn:
            conn.close()

"""
Unit Tests for Phase 1: Foundation (DMart-Style Batch/Expiry System)
Validates:
- 7 Enterprise Roles & Permissions
- Store Scoping Isolation (store_executive, store_supervisor, cashier)
- Segregation of Duties (approver != creator)
- System Policy Settings Management
- Immutable System Audit Logging
- User Authentication with store_id
"""

import unittest
import json
from datetime import date
import sys
import os

# Add backend directory to sys.path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

import db
from batch_engine import (
    enforce_store_scoping,
    validate_segregation_of_duties,
    log_audit_event,
    get_system_policy,
    update_system_policy,
    SegregationOfDutiesError,
    StoreScopingError,
    ValidationError
)


class TestPhase1Foundation(unittest.TestCase):

    def setUp(self):
        self.conn = db.get_connection()
        self.cur = self.conn.cursor()

    def tearDown(self):
        self.conn.rollback()
        self.conn.close()

    # -------------------------------------------------------------------------
    # 1. Segregation of Duties Tests
    # -------------------------------------------------------------------------
    def test_segregation_of_duties_same_user_rejected(self):
        """User cannot approve or post an item they created/proposed."""
        with self.assertRaises(SegregationOfDutiesError) as ctx:
            validate_segregation_of_duties("executive_john", "executive_john", "approve markdown")
        self.assertIn("Segregation of Duties Violation", str(ctx.exception))

    def test_segregation_of_duties_case_insensitive_rejected(self):
        """Segregation check is case-insensitive."""
        with self.assertRaises(SegregationOfDutiesError):
            validate_segregation_of_duties("Executive_John", "executive_john", "approve audit")

    def test_segregation_of_duties_distinct_user_allowed(self):
        """Distinct supervisor approving what executive proposed is allowed."""
        try:
            validate_segregation_of_duties("executive_john", "supervisor_jane", "approve audit")
        except SegregationOfDutiesError:
            self.fail("validate_segregation_of_duties raised SegregationOfDutiesError unexpectedly!")

    # -------------------------------------------------------------------------
    # 2. Store Scoping Tests
    # -------------------------------------------------------------------------
    def test_store_executive_scoping_to_own_store_allowed(self):
        """Store executive operating in own store (e.g. 2) succeeds."""
        try:
            enforce_store_scoping(user_role="store_executive", user_store_id=2, target_store_id=2)
        except StoreScopingError:
            self.fail("enforce_store_scoping raised StoreScopingError for matching store!")

    def test_store_executive_scoping_to_other_store_blocked(self):
        """Store executive assigned to Store 2 cannot operate on Store 3."""
        with self.assertRaises(StoreScopingError) as ctx:
            enforce_store_scoping(user_role="store_executive", user_store_id=2, target_store_id=3)
        self.assertIn("Access denied", str(ctx.exception))

    def test_store_supervisor_scoping_to_other_store_blocked(self):
        """Store supervisor assigned to Store 2 cannot operate on Store 3."""
        with self.assertRaises(StoreScopingError):
            enforce_store_scoping(user_role="store_supervisor", user_store_id=2, target_store_id=3)

    def test_cross_store_roles_unrestricted(self):
        """Admin, category_manager, and accounts can access any store."""
        for role in ("admin", "category_manager", "accounts"):
            try:
                enforce_store_scoping(user_role=role, user_store_id=None, target_store_id=2)
                enforce_store_scoping(user_role=role, user_store_id=None, target_store_id=3)
            except StoreScopingError:
                self.fail(f"Role {role} was unexpectedly restricted by store scoping!")

    def test_warehouse_picker_dc_scoping(self):
        """Warehouse picker assigned to DC-01 (1) cannot operate on store 2."""
        with self.assertRaises(StoreScopingError):
            enforce_store_scoping(user_role="warehouse_picker", user_store_id=1, target_store_id=2)

    # -------------------------------------------------------------------------
    # 3. System Policy Management Tests
    # -------------------------------------------------------------------------
    def test_get_and_update_system_policy(self):
        """Verify reading and updating system policies in DB."""
        val = get_system_policy(self.cur, "supervisor_markdown_discount_limit")
        self.assertIsNotNone(val)

        # Update policy
        update_system_policy(self.cur, "supervisor_markdown_discount_limit", "30.0", updated_by="admin")
        updated_val = get_system_policy(self.cur, "supervisor_markdown_discount_limit")
        self.assertEqual(updated_val, "30.0")

        # Rollback so DB returns to original
        self.conn.rollback()

    def test_invalid_policy_key_raises_error(self):
        """Updating an unknown policy key should raise ValidationError."""
        with self.assertRaises(ValidationError):
            update_system_policy(self.cur, "non_existent_policy_xyz", "100", updated_by="admin")

    # -------------------------------------------------------------------------
    # 4. System Audit Log Tests
    # -------------------------------------------------------------------------
    def test_log_audit_event_persists_record(self):
        """Audit log entry is recorded with JSON payload."""
        test_details = {"test_key": "test_val", "override_reason": "Executive approval"}
        log_audit_event(
            self.cur,
            action_type="TEST_ACTION",
            entity_type="TEST_ENTITY",
            entity_id="ENT-999",
            user_id=1,
            username="admin",
            user_role="admin",
            store_id=2,
            details=test_details,
            ip_address="127.0.0.1"
        )
        self.conn.commit()

        # Query written log
        self.cur.execute("""
            SELECT action_type, entity_type, entity_id, username, store_id, details
            FROM system_audit_log
            WHERE action_type = 'TEST_ACTION' AND entity_id = 'ENT-999'
        """)
        row = self.cur.fetchone()
        self.assertIsNotNone(row)
        self.assertEqual(row[0], "TEST_ACTION")
        self.assertEqual(row[1], "TEST_ENTITY")
        self.assertEqual(row[2], "ENT-999")
        self.assertEqual(row[3], "admin")
        self.assertEqual(row[4], 2)
        parsed_details = json.loads(row[5]) if isinstance(row[5], str) else row[5]
        self.assertEqual(parsed_details["test_key"], "test_val")

    # -------------------------------------------------------------------------
    # 5. User Authentication & Store Scoping Verification
    # -------------------------------------------------------------------------
    def test_verify_user_returns_store_id_for_all_roles(self):
        """Verifies each of the 7 enterprise roles authenticates and returns correct store_id."""
        expected = {
            "admin": (None, "admin"),
            "cashier": (2, "cashier"),
            "supervisor": (2, "store_supervisor"),
            "executive": (2, "store_executive"),
            "picker": (1, "warehouse_picker"),
            "manager": (None, "category_manager"),
            "accounts": (None, "accounts"),
        }

        for uname, (exp_store, exp_role) in expected.items():
            user = db.verify_user(uname, f"{uname}@123")
            if not user:
                user = db.verify_user(uname, f"{uname}123")
            self.assertIsNotNone(user, f"Failed to authenticate user '{uname}'")
            self.assertEqual(user["role"], exp_role)
            self.assertEqual(user["store_id"], exp_store, f"Mismatch in store_id for user '{uname}'")

    # -------------------------------------------------------------------------
    # 6. Admin REST API Endpoint Tests
    # -------------------------------------------------------------------------
    def test_admin_policies_api_access(self):
        from app import app
        client = app.test_client()

        # Unauthenticated / Cashier role -> 403
        res = client.get("/api/admin/policies", headers={"X-User-Role": "cashier"})
        self.assertEqual(res.status_code, 403)

        # Admin access -> 200
        res = client.get("/api/admin/policies", headers={"X-User-Role": "admin"})
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data["success"])
        self.assertTrue(len(data["policies"]) >= 4)

    def test_admin_policy_update_api(self):
        from app import app
        client = app.test_client()

        # Non-admin cannot update -> 403
        res = client.put(
            "/api/admin/policies",
            json={"policy_key": "supervisor_markdown_discount_limit", "policy_value": "35.0"},
            headers={"X-User-Role": "store_supervisor"}
        )
        self.assertEqual(res.status_code, 403)

        # Admin updates policy -> 200
        res = client.put(
            "/api/admin/policies",
            json={"policy_key": "supervisor_markdown_discount_limit", "policy_value": "35.0"},
            headers={"X-User-Role": "admin", "X-Username": "admin"}
        )
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.get_json()["success"])

        # Reset back to 25.0
        client.put(
            "/api/admin/policies",
            json={"policy_key": "supervisor_markdown_discount_limit", "policy_value": "25.0"},
            headers={"X-User-Role": "admin", "X-Username": "admin"}
        )

    def test_admin_supplier_terms_api(self):
        from app import app
        client = app.test_client()

        # Accounts role can view supplier terms -> 200
        res = client.get("/api/admin/supplier-terms", headers={"X-User-Role": "accounts"})
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data["success"])
        self.assertTrue(len(data["suppliers"]) >= 1)

    def test_admin_roles_api(self):
        from app import app
        client = app.test_client()

        # Admin views roles -> 200
        res = client.get("/api/admin/roles", headers={"X-User-Role": "admin"})
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data["success"])
        usernames = [u["username"] for u in data["users"]]
        self.assertIn("executive", usernames)
        self.assertIn("accounts", usernames)

    def test_admin_audit_log_api(self):
        from app import app
        client = app.test_client()

        # Admin views audit log -> 200
        res = client.get("/api/admin/audit-log", headers={"X-User-Role": "admin"})
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data["success"])
        self.assertIsInstance(data["audit_logs"], list)


if __name__ == "__main__":
    unittest.main()

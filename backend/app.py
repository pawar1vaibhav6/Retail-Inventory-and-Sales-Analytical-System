import datetime
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pymysql
from functools import wraps
from flask import Flask, request, session, jsonify, g
from flask_cors import CORS

# Load environment variables from .env
env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
if os.path.exists(env_path):
    with open(env_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                k = k.strip()
                v = v.strip().strip('"').strip("'")
                if k and k not in os.environ:
                    os.environ[k] = v

import db
from db import verify_user, register_user, get_connection, get_product_unit, normalize_subcategory
from gst_classifier import (
    classifier,
    get_item_gst_details,
    calculate_discount_and_gst,
    validate_discount_value,
    InvalidHSNError,
    UnknownHSNError,
    ClassificationError
)
import batch_engine as be
from batch_engine import (
    validate_batch_grn_item,
    record_grn,
    allocate_fefo,
    create_replenishment_request,
    process_replenishment_allocation,
    dispatch_replenishment_transfer,
    receive_replenishment_at_store,
    get_batch_traceability,
    get_expiry_stock_report,
    detect_dump_stock,
    get_interstore_transfer_suggestions,
    create_code_audit,
    submit_code_audit,
    approve_code_audit,
    calculate_markdown_suggestions,
    propose_markdown,
    approve_markdown,
    get_pending_approvals,
    get_active_markdown_for_batch,
    create_expiry_return,
    post_expiry_return_atomic,
    acknowledge_debit_note,
    settle_debit_note,
    validate_batch_for_pos,
    record_movement,
    enforce_store_scoping,
    validate_segregation_of_duties,
    log_audit_event,
    get_system_policy,
    update_system_policy,
    get_expiry_ageing_summary,
    get_scrap_loss_trend,
    get_markdown_sellthrough_analytics,
    get_supplier_return_rate_analytics,
    get_fefo_override_analytics,
    get_role_dashboard_metrics,
    ValidationError as BatchValidationError,
    InsufficientStockError,
    PolicyViolationError,
    SegregationOfDutiesError,
    StoreScopingError
)
from scheduled_jobs import run_daily_expiry_notification_job, ensure_notifications_table

VALID_ROLES = ("admin", "cashier", "store_supervisor", "store_executive", "warehouse_picker", "category_manager", "accounts")

def require_roles(*allowed_roles):
    """Decorator enforcing role-based endpoint access control and context extraction."""
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            user_role = session.get("role") or request.headers.get("X-User-Role") or "cashier"
            store_id = session.get("store_id")
            if store_id is None and request.headers.get("X-Store-Id"):
                try:
                    store_id = int(request.headers.get("X-Store-Id"))
                except (ValueError, TypeError):
                    store_id = None
            username = session.get("username") or request.headers.get("X-Username") or "anonymous"
            user_id = session.get("user_id")
            if user_id is None and request.headers.get("X-User-Id"):
                try:
                    user_id = int(request.headers.get("X-User-Id"))
                except (ValueError, TypeError):
                    user_id = 1

            g.user_role = user_role
            g.user_store_id = store_id
            g.username = username
            g.user_id = user_id or 1

            if "admin" in allowed_roles and user_role == "admin":
                return fn(*args, **kwargs)
            if user_role not in allowed_roles:
                return jsonify({
                    "success": False,
                    "message": f"Access denied. Requires one of roles: {', '.join(allowed_roles)} (current: {user_role})"
                }), 403
            return fn(*args, **kwargs)
        return wrapper
    return decorator

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY", "retailsphere-secure-secret-key-2026")

# Configure CORS for React dev servers
cors_origins_raw = os.getenv(
    "CORS_ALLOWED_ORIGINS",
    "http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174"
)
cors_origins = [origin.strip() for origin in cors_origins_raw.split(",") if origin.strip()]
CORS(app, origins=cors_origins, supports_credentials=True)

# GST category definitions matching existing logic (backward-compatible fallback)
GST_RATES = {
    "0": ["Fruits", "Vegetables", "Milk", "Pulses", "Stationery", "Grocery", "Cereals"],
    "10": ["Package Food", "Oil Products", "Dry Fruits", "Spices", "tea", "coffee", "Beverages", "Sports", "PersonalCare"],
    "18": ["Electronics", "Furniture", "Fashion", "Accessories"]
}


def get_gst_rate(category):
    """
    Backward-compatible helper returning (total_rate, cgst_rate, sgst_rate).
    Preserves existing signature.
    """
    for rate_str, cats in GST_RATES.items():
        if any(c.lower() == (category or "").lower() for c in cats):
            rate = float(rate_str) / 100.0
            return rate, rate / 2.0, rate / 2.0
    return 0.05, 0.025, 0.025


# Global JSON error handling
@app.errorhandler(404)
def not_found(e):
    return jsonify({"success": False, "message": "Resource not found."}), 404


@app.errorhandler(500)
def server_error(e):
    return jsonify({"success": False, "message": f"Internal server error: {e}"}), 500


@app.errorhandler(StoreScopingError)
def handle_scoping_error(e):
    return jsonify({"success": False, "message": str(e)}), 403


@app.errorhandler(SegregationOfDutiesError)
def handle_segregation_error(e):
    return jsonify({"success": False, "message": str(e)}), 403


@app.errorhandler(PolicyViolationError)
def handle_policy_error(e):
    return jsonify({"success": False, "message": str(e)}), 400


@app.errorhandler(BatchValidationError)
def handle_batch_error(e):
    return jsonify({"success": False, "message": str(e)}), 400


@app.errorhandler(InsufficientStockError)
def handle_stock_error(e):
    return jsonify({"success": False, "message": str(e)}), 400


def get_store_scoping(target_store_id=None):
    """
    Resolves effective store_id and role for the current request.
    For store-scoped roles (store_executive, store_supervisor, cashier),
    effective store_id is the user's store_id (defaulting to 2 if not set).
    If target_store_id is supplied and contradicts user's store, raises StoreScopingError.
    For warehouse_picker, effective store_id is 1 (DC).
    For cross-store roles (admin, category_manager, accounts), returns (target_store_id, role).
    """
    role = getattr(g, "user_role", None) or session.get("role") or request.headers.get("X-User-Role") or "admin"
    raw_store = getattr(g, "user_store_id", None) or session.get("store_id") or request.headers.get("X-Store-Id")
    user_store_id = int(raw_store) if raw_store is not None and str(raw_store).isdigit() else None

    if role in ("store_executive", "store_supervisor", "cashier"):
        assigned_store = user_store_id if user_store_id is not None else 2
        if target_store_id is not None and int(target_store_id) != int(assigned_store):
            enforce_store_scoping(role, assigned_store, int(target_store_id))
        return assigned_store, role
    elif role == "warehouse_picker":
        assigned_dc = user_store_id if user_store_id is not None else 1
        if target_store_id is not None and int(target_store_id) != int(assigned_dc):
            enforce_store_scoping(role, assigned_dc, int(target_store_id))
        return assigned_dc, role
    else:
        target_int = int(target_store_id) if target_store_id is not None and str(target_store_id).isdigit() else None
        return target_int, role


# -------------------------------------------------------------------------
# Health Check Endpoint
# -------------------------------------------------------------------------
@app.route("/api/health", methods=["GET"])
def health_check():
    return jsonify({
        "status": "healthy",
        "service": "RetailSphere Backend API",
        "timestamp": datetime.datetime.now().isoformat()
    })


# -------------------------------------------------------------------------
# GST Classification & Rates Endpoints
# -------------------------------------------------------------------------
@app.route("/api/gst/rates", methods=["GET"])
def api_gst_rates():
    """Retrieve full HSN -> GST rate registry."""
    return jsonify({
        "success": True,
        "hsns": classifier._registry
    })


@app.route("/api/gst/classify", methods=["POST"])
def api_gst_classify():
    """Classify an item or bundle using GIR / branding rules and return tax breakdown."""
    data = request.get_json(silent=True) or {}
    try:
        tax_info = get_item_gst_details(data)
        return jsonify({
            "success": True,
            "tax_info": tax_info
        })
    except (InvalidHSNError, UnknownHSNError, ClassificationError, ValueError) as err:
        return jsonify({
            "success": False,
            "error_type": err.__class__.__name__,
            "message": str(err)
        }), 400
    except Exception as err:
        return jsonify({
            "success": False,
            "message": f"Classification error: {err}"
        }), 500


# -------------------------------------------------------------------------
# Authentication Endpoints
# -------------------------------------------------------------------------
@app.route("/api/auth/login", methods=["POST"])
@app.route("/api/login", methods=["POST"])
def api_login():
    data = request.get_json(silent=True) or request.form
    username = data.get("username", "").strip()
    password = data.get("password", "").strip()

    if not username or not password:
        return jsonify({"success": False, "message": "Username and password are required."}), 400

    user = verify_user(username, password)
    if user:
        session["user_id"] = user["user_id"]
        session["username"] = user["username"]
        session["role"] = user["role"]
        session["store_id"] = user.get("store_id")
        return jsonify({
            "success": True,
            "message": f"Welcome back, {user['username']}!",
            "user": {
                "id": user["user_id"],
                "username": user["username"],
                "role": user["role"],
                "store_id": user.get("store_id")
            }
        })
    return jsonify({"success": False, "message": "Invalid username or password."}), 401


@app.route("/api/auth/register", methods=["POST"])
@app.route("/api/register", methods=["POST"])
def api_register():
    data = request.get_json(silent=True) or request.form
    username = data.get("username", "").strip()
    password = data.get("password", "").strip()
    role = data.get("role", "cashier").strip().lower()
    store_id = data.get("store_id")

    if not username or not password:
        return jsonify({"success": False, "message": "Username and password are required."}), 400

    if len(password) < 4:
        return jsonify({"success": False, "message": "Password must be at least 4 characters long."}), 400

    if role not in VALID_ROLES:
        role = "cashier"

    success, msg = register_user(username, password, role, store_id)
    if success:
        user = verify_user(username, password)
        if user:
            session["user_id"] = user["user_id"]
            session["username"] = user["username"]
            session["role"] = user["role"]
            session["store_id"] = user.get("store_id")
        return jsonify({
            "success": True,
            "message": f"Account for '{username}' created successfully!",
            "user": user or {"id": 1, "username": username, "role": role, "store_id": store_id}
        })
    return jsonify({"success": False, "message": msg}), 400


@app.route("/api/auth/logout", methods=["POST", "GET"])
@app.route("/api/logout", methods=["POST", "GET"])
def api_logout():
    session.clear()
    return jsonify({"success": True, "message": "Successfully logged out."})


@app.route("/api/auth/me", methods=["GET"])
def api_me():
    if "user_id" in session:
        return jsonify({
            "success": True,
            "user": {
                "id": session["user_id"],
                "username": session["username"],
                "role": session.get("role", "cashier"),
                "store_id": session.get("store_id")
            }
        })
    return jsonify({"success": False, "user": None})


# -------------------------------------------------------------------------
# Dashboard Statistics Endpoint
# -------------------------------------------------------------------------
@app.route("/api/dashboard/stats", methods=["GET"])
def api_dashboard_stats():
    conn = get_connection()
    stats = {
        "products_count": 0,
        "customers_count": 0,
        "sales_count": 0,
        "low_stock_count": 0,
        "inventory_value": 0,
        "total_sales_amount": 0,
        "recent_sales": [],
        "low_stock_items": []
    }
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM Products")
            stats["products_count"] = cur.fetchone()[0]

            cur.execute("SELECT COUNT(*) FROM Customers")
            stats["customers_count"] = cur.fetchone()[0]

            cur.execute("SELECT COUNT(*), COALESCE(SUM(total_amount), 0) FROM Sales")
            sales_row = cur.fetchone()
            stats["sales_count"] = sales_row[0]
            stats["total_sales_amount"] = int(sales_row[1])

            cur.execute("SELECT COALESCE(SUM(price * stock_quantity), 0) FROM Products")
            stats["inventory_value"] = int(cur.fetchone()[0])

            cur.execute("""
                SELECT product_id, p_name, category, price, stock_quantity, cost, 
                       COALESCE(unit, 'pcs') AS unit, COALESCE(subcategory, 'Packing') AS subcategory 
                FROM Products 
                WHERE stock_quantity < 5 
                ORDER BY stock_quantity ASC
            """)
            low_items = []
            for r in cur.fetchall():
                low_items.append({
                    "id": r[0],
                    "name": r[1],
                    "category": r[2],
                    "price": r[3],
                    "stock": r[4],
                    "cost": r[5],
                    "unit": r[6],
                    "subcategory": r[7]
                })
            stats["low_stock_items"] = low_items
            stats["low_stock_count"] = len(low_items)

            cur.execute("""
                SELECT s.sales_id, p.p_name, s.quantity, s.total_amount, s.gst_amount, s.Date, 
                       COALESCE(p.unit, 'pcs') AS unit, s.customer_id
                FROM Sales s 
                LEFT JOIN Products p ON s.product_id = p.product_id 
                ORDER BY s.sales_id DESC LIMIT 5
            """)
            recent = []
            for r in cur.fetchall():
                recent.append({
                    "id": r[0],
                    "productName": r[1] or "Unknown Product",
                    "quantity": r[2],
                    "totalAmount": r[3],
                    "gstAmount": r[4],
                    "date": r[5].isoformat() if hasattr(r[5], "isoformat") else str(r[5]),
                    "unit": r[6],
                    "customerId": r[7]
                })
            stats["recent_sales"] = recent
    finally:
        conn.close()

    return jsonify(stats)


# -------------------------------------------------------------------------
# Products & Inventory Management Endpoints
# -------------------------------------------------------------------------
@app.route("/api/products", methods=["GET"])
def api_get_products():
    search = request.args.get("search", "").strip()
    category = request.args.get("category", "").strip()
    subcategory = request.args.get("subcategory", "").strip()

    conn = get_connection()
    products_list = []
    try:
        with conn.cursor() as cur:
            query = """
                SELECT product_id, p_name, category, price, stock_quantity, cost, 
                       COALESCE(unit, 'pcs') AS unit, COALESCE(subcategory, 'Packing') AS subcategory,
                       COALESCE(hsn_code, '') AS hsn_code,
                       COALESCE(is_packaged, 1) AS is_packaged,
                       COALESCE(is_branded, 1) AS is_branded,
                       COALESCE(bundle_type, '') AS bundle_type,
                       COALESCE(discount, 0.0) AS discount,
                       COALESCE(is_batch_controlled, 0) AS is_batch_controlled,
                       COALESCE(has_expiry, 0) AS has_expiry,
                       COALESCE(min_shelf_life_days, 0) AS min_shelf_life_days,
                       COALESCE(floor_price_percent, 50.00) AS floor_price_percent
                FROM Products WHERE 1=1
            """
            params = []
            if search:
                query += " AND (p_name LIKE %s OR CAST(product_id AS CHAR) LIKE %s)"
                params.extend([f"%{search}%", f"%{search}%"])
            if category:
                query += " AND category = %s"
                params.append(category)
            if subcategory:
                query += " AND subcategory = %s"
                params.append(subcategory)

            query += " ORDER BY product_id ASC"
            cur.execute(query, params)

            for r in cur.fetchall():
                products_list.append({
                    "id": r[0],
                    "name": r[1],
                    "category": r[2],
                    "price": r[3],
                    "stock": r[4],
                    "cost": r[5],
                    "unit": r[6],
                    "subcategory": r[7],
                    "hsn_code": r[8] if len(r) > 8 and r[8] else None,
                    "hsn": r[8] if len(r) > 8 and r[8] else None,
                    "is_packaged": bool(r[9]) if len(r) > 9 else True,
                    "is_branded": bool(r[10]) if len(r) > 10 else True,
                    "bundle_type": r[11] if len(r) > 11 and r[11] else None,
                    "discount": float(r[12]) if len(r) > 12 and r[12] is not None else 0.0,
                    "is_batch_controlled": bool(r[13]) if len(r) > 13 else False,
                    "has_expiry": bool(r[14]) if len(r) > 14 else False,
                    "min_shelf_life_days": int(r[15]) if len(r) > 15 and r[15] is not None else 0,
                    "floor_price_percent": float(r[16]) if len(r) > 16 and r[16] is not None else 50.0
                })
    finally:
        conn.close()

    return jsonify(products_list)


@app.route("/api/products", methods=["POST"])
def api_add_product():
    data = request.get_json(silent=True) or request.form
    try:
        conn = get_connection()
        try:
            with conn.cursor() as cur:
                pid = data.get("id") or data.get("product_id")
                if not pid:
                    cur.execute("SELECT COALESCE(MAX(product_id), 100) + 1 FROM Products")
                    pid = cur.fetchone()[0]
                else:
                    pid = int(pid)

                p_name = (data.get("name") or data.get("p_name") or "").strip()
                if not p_name:
                    return jsonify({"success": False, "message": "Product name is required."}), 400

                category = (data.get("category") or "General").strip()
                subcat_input = (data.get("subcategory") or "Packing").strip()
                subcategory = normalize_subcategory(subcat_input)

                unit_input = (data.get("unit") or "").strip()
                unit = get_product_unit(category, p_name, explicit_unit=unit_input, subcategory=subcategory)

                price = int(float(data.get("price") or 0))
                stock = int(float(data.get("stock") or data.get("stock_quantity") or 0))
                cost = int(float(data.get("cost") or 0))

                # HSN and branding attributes
                hsn_input = data.get("hsn_code") or data.get("hsn")
                hsn_code = classifier.validate_hsn_format(hsn_input) if hsn_input else None
                is_packaged = 0 if str(data.get("is_packaged", "")).lower() in ("0", "false") else 1
                is_branded = 0 if str(data.get("is_branded", "")).lower() in ("0", "false") else 1
                bundle_type = data.get("bundle_type") or None

                # Batch & expiry attributes
                is_batch_ctrl = 1 if str(data.get("is_batch_controlled", "")).lower() in ("1", "true") else 0
                has_exp = 1 if str(data.get("has_expiry", "")).lower() in ("1", "true") else is_batch_ctrl
                min_shelf = int(data.get("min_shelf_life_days") or 0)
                floor_price_pct = float(data.get("floor_price_percent") or 50.00)

                # Discount attribute (0-100%, default 0.0)
                disc_input = data.get("discount")
                try:
                    discount = validate_discount_value(disc_input) if disc_input is not None and disc_input != "" else 0.0
                except ValueError as disc_err:
                    return jsonify({"success": False, "message": str(disc_err)}), 400

                cur.execute("""
                    INSERT INTO Products (
                        product_id, p_name, category, subcategory, price, stock_quantity, cost, unit,
                        hsn_code, is_packaged, is_branded, bundle_type, discount,
                        is_batch_controlled, has_expiry, min_shelf_life_days, floor_price_percent
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """, (
                    pid, p_name, category, subcategory, price, stock, cost, unit,
                    hsn_code, is_packaged, is_branded, bundle_type, discount,
                    is_batch_ctrl, has_exp, min_shelf, floor_price_pct
                ))
                conn.commit()

                product = {
                    "id": pid,
                    "name": p_name,
                    "category": category,
                    "subcategory": subcategory,
                    "price": price,
                    "stock": stock,
                    "cost": cost,
                    "unit": unit,
                    "hsn_code": hsn_code,
                    "hsn": hsn_code,
                    "is_packaged": bool(is_packaged),
                    "is_branded": bool(is_branded),
                    "bundle_type": bundle_type,
                    "discount": discount,
                    "is_batch_controlled": bool(is_batch_ctrl),
                    "has_expiry": bool(has_exp),
                    "min_shelf_life_days": min_shelf,
                    "floor_price_percent": floor_price_pct
                }
                return jsonify({
                    "success": True,
                    "message": f"Product '{p_name}' (#{pid}) added successfully.",
                    "product": product
                }), 201
        except InvalidHSNError as hsn_err:
            conn.rollback()
            return jsonify({"success": False, "message": str(hsn_err)}), 400
        except pymysql.err.IntegrityError:
            conn.rollback()
            return jsonify({"success": False, "message": f"Product ID #{pid} already exists."}), 400
        finally:
            conn.close()
    except Exception as e:
        return jsonify({"success": False, "message": f"Failed to add product: {e}"}), 500


@app.route("/api/products/<int:pid>/price", methods=["PUT", "POST"])
def api_update_product_price(pid):
    data = request.get_json(silent=True) or request.form
    new_price = data.get("new_price") or data.get("price")
    if new_price is None:
        return jsonify({"success": False, "message": "New price is required."}), 400

    try:
        new_price = int(float(new_price))
        disc_input = data.get("discount")
        new_discount = validate_discount_value(disc_input) if disc_input is not None and disc_input != "" else None
        conn = get_connection()
        try:
            with conn.cursor() as cur:
                if new_discount is not None:
                    cur.execute("UPDATE Products SET price = %s, discount = %s WHERE product_id = %s", (new_price, new_discount, pid))
                else:
                    cur.execute("UPDATE Products SET price = %s WHERE product_id = %s", (new_price, pid))
                conn.commit()
                if cur.rowcount > 0:
                    resp = {
                        "success": True,
                        "id": pid,
                        "price": new_price,
                        "message": f"Updated price for Product #{pid} to ₹{new_price}."
                    }
                    if new_discount is not None:
                        resp["discount"] = new_discount
                    return jsonify(resp)
                return jsonify({"success": False, "message": f"Product #{pid} not found."}), 404
        finally:
            conn.close()
    except ValueError as err:
        return jsonify({"success": False, "message": str(err)}), 400
    except Exception as e:
        return jsonify({"success": False, "message": f"Failed to update price: {e}"}), 500


@app.route("/api/products/<int:pid>/discount", methods=["PUT", "POST"])
def api_update_product_discount(pid):
    data = request.get_json(silent=True) or request.form
    disc_val = data.get("discount")
    if disc_val is None or disc_val == "":
        return jsonify({"success": False, "message": "Discount value is required."}), 400
    try:
        discount = validate_discount_value(disc_val)
        conn = get_connection()
        try:
            with conn.cursor() as cur:
                cur.execute("UPDATE Products SET discount = %s WHERE product_id = %s", (discount, pid))
                conn.commit()
                if cur.rowcount > 0:
                    return jsonify({
                        "success": True,
                        "id": pid,
                        "discount": discount,
                        "message": f"Updated discount for Product #{pid} to {discount}%."
                    })
                return jsonify({"success": False, "message": f"Product #{pid} not found."}), 404
        finally:
            conn.close()
    except ValueError as err:
        return jsonify({"success": False, "message": str(err)}), 400
    except Exception as e:
        return jsonify({"success": False, "message": f"Failed to update discount: {e}"}), 500


@app.route("/api/products/<int:pid>/restock", methods=["POST"])
def api_restock_product(pid):
    data = request.get_json(silent=True) or request.form
    added_stock = data.get("added_stock") or data.get("stock")
    if not added_stock:
        return jsonify({"success": False, "message": "Added stock quantity is required."}), 400

    try:
        added_stock = int(float(added_stock))
        if added_stock <= 0:
            return jsonify({"success": False, "message": "Added stock must be greater than zero."}), 400

        # Optional discount update during restock (keeps current if not supplied)
        disc_input = data.get("discount")
        new_discount = None
        if disc_input is not None and disc_input != "":
            new_discount = validate_discount_value(disc_input)

        conn = get_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT cost, p_name, category, stock_quantity, COALESCE(unit, 'pcs'), COALESCE(subcategory, 'Packing'), COALESCE(discount, 0.0) FROM Products WHERE product_id = %s",
                    (pid,)
                )
                row = cur.fetchone()
                if not row:
                    return jsonify({"success": False, "message": f"Product #{pid} not found."}), 404

                cost, p_name, cat, current_stock, raw_unit, raw_subcat, cur_discount = row
                unit = get_product_unit(cat, p_name, explicit_unit=raw_unit, subcategory=raw_subcat)
                total_restock_cost = cost * added_stock
                new_stock = current_stock + added_stock

                if new_discount is not None:
                    cur.execute("UPDATE Products SET stock_quantity = stock_quantity + %s, discount = %s WHERE product_id = %s", (added_stock, new_discount, pid))
                    active_discount = new_discount
                else:
                    cur.execute("UPDATE Products SET stock_quantity = stock_quantity + %s WHERE product_id = %s", (added_stock, pid))
                    active_discount = float(cur_discount or 0.0)

                cur.execute(
                    "INSERT INTO stock (product_id, Restock_date, Added_stock, total_cost) VALUES (%s, NOW(), %s, %s)",
                    (pid, added_stock, total_restock_cost)
                )
                conn.commit()

                return jsonify({
                    "success": True,
                    "id": pid,
                    "added": added_stock,
                    "stock": new_stock,
                    "discount": active_discount,
                    "totalCost": total_restock_cost,
                    "message": f"Restocked {added_stock} {unit} for '{p_name}'. Replenishment cost: ₹{total_restock_cost}."
                })
        finally:
            conn.close()
    except ValueError as err:
        return jsonify({"success": False, "message": str(err)}), 400
    except Exception as e:
        return jsonify({"success": False, "message": f"Failed to restock product: {e}"}), 500


@app.route("/api/products/<int:pid>", methods=["DELETE"])
def api_delete_product(pid):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT p_name FROM Products WHERE product_id = %s", (pid,))
            row = cur.fetchone()
            if not row:
                return jsonify({"success": False, "message": f"Product #{pid} not found."}), 404

            p_name = row[0]
            cur.execute("DELETE FROM stock WHERE product_id = %s", (pid,))
            cur.execute("DELETE FROM Products WHERE product_id = %s", (pid,))
            conn.commit()
            return jsonify({
                "success": True,
                "id": pid,
                "message": f"Product '{p_name}' (#{pid}) removed from catalog."
            })
    except Exception as e:
        conn.rollback()
        return jsonify({"success": False, "message": f"Failed to delete product: {e}"}), 500
    finally:
        conn.close()


@app.route("/api/products/categories", methods=["GET"])
def api_product_categories():
    conn = get_connection()
    categories = []
    subcategories = []
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT DISTINCT category FROM Products WHERE category IS NOT NULL AND category != '' ORDER BY category ASC")
            categories = [r[0] for r in cur.fetchall()]

            cur.execute("SELECT DISTINCT subcategory FROM Products WHERE subcategory IS NOT NULL AND subcategory != '' ORDER BY subcategory ASC")
            subcategories = [r[0] for r in cur.fetchall()]
            if not subcategories:
                subcategories = ["Packing", "Open"]
    finally:
        conn.close()

    return jsonify({
        "categories": categories,
        "subcategories": subcategories
    })


# -------------------------------------------------------------------------
# Customers Module Endpoints
# -------------------------------------------------------------------------
@app.route("/api/customers", methods=["GET"])
def api_get_customers():
    search = request.args.get("search", "").strip()
    conn = get_connection()
    customers_list = []
    try:
        with conn.cursor() as cur:
            query = """
                SELECT c.customer_id, c.c_name, c.email, c.region, 
                       COUNT(s.sales_id) AS total_visits, 
                       COALESCE(SUM(s.total_amount + s.gst_amount), 0) AS total_spent 
                FROM Customers c 
                LEFT JOIN Sales s ON c.customer_id = s.customer_id 
                WHERE 1=1
            """
            params = []
            if search:
                query += " AND (c.c_name LIKE %s OR c.email LIKE %s OR c.region LIKE %s OR CAST(c.customer_id AS CHAR) LIKE %s)"
                params.extend([f"%{search}%", f"%{search}%", f"%{search}%", f"%{search}%"])

            query += " GROUP BY c.customer_id, c.c_name, c.email, c.region ORDER BY c.customer_id ASC"
            cur.execute(query, params)

            for r in cur.fetchall():
                customers_list.append({
                    "id": r[0],
                    "name": r[1],
                    "email": r[2],
                    "region": r[3],
                    "totalVisits": r[4],
                    "totalSpent": int(r[5])
                })
    finally:
        conn.close()

    return jsonify(customers_list)


@app.route("/api/customers", methods=["POST"])
@app.route("/api/customers/quick-add", methods=["POST"])
def api_add_customer():
    data = request.get_json(silent=True) or request.form
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cid = data.get("id") or data.get("customer_id")
            if not cid:
                cur.execute("SELECT COALESCE(MAX(customer_id), 0) + 1 FROM Customers")
                cid = cur.fetchone()[0]
            else:
                cid = int(cid)

            c_name = (data.get("name") or data.get("c_name") or "").strip()
            if not c_name:
                return jsonify({"success": False, "message": "Customer name is required."}), 400

            email = (data.get("email") or f"customer{cid}@retail.com").strip()
            region = (data.get("region") or "General").strip()

            cur.execute("SELECT customer_id FROM Customers WHERE customer_id = %s", (cid,))
            if cur.fetchone():
                return jsonify({"success": False, "message": f"Customer ID #{cid} already exists."}), 400

            cur.execute(
                "INSERT INTO Customers (customer_id, c_name, email, region) VALUES (%s, %s, %s, %s)",
                (cid, c_name, email, region)
            )
            conn.commit()
            return jsonify({
                "success": True,
                "message": f"Customer '{c_name}' (#{cid}) registered successfully.",
                "customer": {
                    "id": cid,
                    "name": c_name,
                    "email": email,
                    "region": region,
                    "totalVisits": 0,
                    "totalSpent": 0
                }
            }), 201
    except Exception as e:
        conn.rollback()
        return jsonify({"success": False, "message": f"Failed to add customer: {e}"}), 500
    finally:
        conn.close()


@app.route("/api/customers/<int:cid>", methods=["GET"])
@app.route("/api/customers/check/<int:cid>", methods=["GET"])
def api_get_customer_by_id(cid):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT customer_id, c_name, email, region FROM Customers WHERE customer_id = %s", (cid,))
            row = cur.fetchone()
            if row:
                return jsonify({
                    "exists": True,
                    "customer": {
                        "id": row[0],
                        "name": row[1],
                        "email": row[2],
                        "region": row[3]
                    }
                })
            return jsonify({"exists": False, "customer_id": cid})
    finally:
        conn.close()


# -------------------------------------------------------------------------
# POS / Checkout Endpoint with HSN & GST Integration
# -------------------------------------------------------------------------
@app.route("/api/pos/checkout", methods=["POST"])
def api_pos_checkout():
    data = request.get_json(silent=True) or {}
    customer_info = data.get("customer") or {}
    customer_id = data.get("customer_id") or customer_info.get("id")
    items = data.get("items", [])

    if not customer_id or not items:
        return jsonify({"success": False, "message": "Customer ID and at least one item are required."}), 400

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            # Verify or auto-register customer
            cur.execute("SELECT customer_id, c_name, email, region FROM Customers WHERE customer_id = %s", (customer_id,))
            customer = cur.fetchone()
            if not customer:
                c_name = customer_info.get("name") or data.get("customer_name") or f"Customer {customer_id}"
                email = customer_info.get("email") or data.get("customer_email") or f"customer{customer_id}@retail.com"
                region = customer_info.get("region") or data.get("customer_region") or "General"

                cur.execute(
                    "INSERT INTO Customers (customer_id, c_name, email, region) VALUES (%s, %s, %s, %s)",
                    (customer_id, c_name, email, region)
                )
                customer = (customer_id, c_name, email, region)

            bill_items = []
            total_bill_amount = 0
            total_gst_amount = 0
            total_original_subtotal = 0
            total_discount_amount = 0
            created_sale_ids = []
            bill_date = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

            for item in items:
                pid = int(item.get("product_id") or item.get("id"))
                qty = int(item.get("quantity") or item.get("qty") or 0)

                if qty <= 0:
                    continue

                cur.execute("""
                    SELECT p_name, category, price, stock_quantity, 
                           COALESCE(unit, 'pcs') AS unit, 
                           COALESCE(subcategory, 'Packing') AS subcategory,
                           COALESCE(hsn_code, '') AS hsn_code,
                           COALESCE(is_packaged, 1) AS is_packaged,
                           COALESCE(is_branded, 1) AS is_branded,
                           COALESCE(bundle_type, '') AS bundle_type,
                           COALESCE(discount, 0.0) AS discount,
                           COALESCE(is_batch_controlled, 0) AS is_batch_ctrl
                    FROM Products WHERE product_id = %s FOR UPDATE
                """, (pid,))
                prod = cur.fetchone()
                if not prod:
                    conn.rollback()
                    return jsonify({"success": False, "message": f"Product #{pid} not found in catalog."}), 400

                p_name, category, price, stock_qty, raw_unit, raw_subcat, raw_hsn, raw_pkg, raw_brd, raw_bundle, discount, is_batch_ctrl = prod
                unit = get_product_unit(category, p_name, explicit_unit=raw_unit, subcategory=raw_subcat)

                store_location_id = int(item.get("location_id") or data.get("location_id") or 2)
                req_batch_id = item.get("batch_id")

                # Validate batch at POS if batch-controlled or batch specified
                selected_batch = None
                if is_batch_ctrl or req_batch_id:
                    val_res = validate_batch_for_pos(cur, pid, req_batch_id, qty, store_location_id)
                    if not val_res["valid"]:
                        conn.rollback()
                        return jsonify({"success": False, "message": val_res["reason"]}), 400
                    selected_batch = val_res["batch"]

                if qty > stock_qty:
                    conn.rollback()
                    return jsonify({
                        "success": False,
                        "message": f"Insufficient stock for '{p_name}'. Available: {stock_qty} {unit}, Requested: {qty} {unit}."
                    }), 400

                # Compute GST from HSN Code / GIR Classification
                raw_is_open = str(raw_subcat).strip().lower() in ("open", "loose")
                is_pkg = False if raw_is_open else bool(raw_pkg)
                is_brd = False if raw_is_open else bool(raw_brd)

                explicit_item_hsn = item.get("hsn_code") or item.get("hsn") or (raw_hsn if raw_hsn else None)
                item_bundle = item.get("bundle_type") or (raw_bundle if raw_bundle else None)

                try:
                    tax_info = get_item_gst_details({
                        "id": pid,
                        "name": p_name,
                        "p_name": p_name,
                        "category": category,
                        "subcategory": raw_subcat,
                        "hsn_code": explicit_item_hsn,
                        "is_packaged": is_pkg,
                        "is_branded": is_brd,
                        "bundle_type": item_bundle,
                        "bundle_items": item.get("bundle_items")
                    })
                    gst_rate = tax_info["gst_rate"]
                    cgst_rate = tax_info["cgst_rate"]
                    sgst_rate = tax_info["sgst_rate"]
                    hsn_code = tax_info.get("hsn_code", "9988")
                except Exception:
                    # Fallback to category rate if unknown or missing HSN
                    gst_rate, cgst_rate, sgst_rate = get_gst_rate(category)
                    hsn_code = explicit_item_hsn or "9988"

                # Apply Discount & GST Calculation Rule with push-sale markdown check
                item_discount = float(item.get("discount") if item.get("discount") is not None else (discount or 0.0))
                if selected_batch:
                    active_mkd = get_active_markdown_for_batch(cur, selected_batch["batch_id"], store_location_id)
                    if active_mkd:
                        item_discount = max(item_discount, float(active_mkd["approved_discount_percent"]))

                calc = calculate_discount_and_gst(price, item_discount, gst_rate, qty)

                item_subtotal = calc["line_subtotal"]
                item_gst = calc["line_gst"]
                item_final = calc["line_total"]

                batch_id_val = selected_batch["batch_id"] if selected_batch else None
                batch_num_val = selected_batch["batch_number"] if selected_batch else None

                # Insert Sale record
                cur.execute(
                    "INSERT INTO Sales (product_id, customer_id, Date, quantity, total_amount, gst_amount, batch_id, batch_number, location_id) VALUES (%s, %s, NOW(), %s, %s, %s, %s, %s, %s)",
                    (pid, customer_id, qty, int(item_subtotal), int(item_gst), batch_id_val, batch_num_val, store_location_id)
                )
                sale_id = cur.lastrowid
                created_sale_ids.append(sale_id)

                # Deduct stock
                cur.execute("UPDATE Products SET stock_quantity = stock_quantity - %s WHERE product_id = %s", (qty, pid))
                if selected_batch:
                    cur.execute("""
                        UPDATE batch_stock SET quantity_saleable = quantity_saleable - %s 
                        WHERE product_id = %s AND batch_id = %s AND location_id = %s
                    """, (qty, pid, selected_batch["batch_id"], store_location_id))
                    record_movement(
                        cur, product_id=pid, batch_id=selected_batch["batch_id"],
                        batch_number=selected_batch["batch_number"],
                        from_loc=store_location_id, to_loc=None, movement_type='POS_SALE',
                        qty=qty, ref_type='SALE', ref_id=str(sale_id), user='POS'
                    )

                bill_items.append({
                    "id": pid,
                    "product_id": pid,
                    "batch_id": batch_id_val,
                    "batch_number": batch_num_val,
                    "name": p_name,
                    "hsn_code": hsn_code,
                    "hsn": hsn_code,
                    "category": category,
                    "subcategory": raw_subcat,
                    "unit": unit,
                    "price": price,
                    "original_price": price,
                    "discount": calc["discount_percent"],
                    "discount_percent": calc["discount_percent"],
                    "discount_amount": calc["discount_amount_unit"],
                    "total_discount": calc["discount_amount_total"],
                    "discounted_price": calc["discounted_price"],
                    "quantity": qty,
                    "qty": qty,
                    "subtotal": calc["line_subtotal"],
                    "original_subtotal": calc["original_subtotal"],
                    "gstRate": int(round(gst_rate * 100)),
                    "gst": calc["line_gst"],
                    "gst_amount": calc["line_gst"],
                    "cgst_amount": round(calc["line_gst"] / 2.0, 2),
                    "sgst_amount": round(calc["line_gst"] / 2.0, 2),
                    "total": calc["line_total"]
                })

                total_bill_amount += calc["line_total"]
                total_gst_amount += calc["line_gst"]
                total_original_subtotal += calc["original_subtotal"]
                total_discount_amount += calc["discount_amount_total"]

            conn.commit()

            bill_number = created_sale_ids[0] if created_sale_ids else int(datetime.datetime.now().timestamp())
            invoice = {
                "billNumber": bill_number,
                "bill_no": bill_number,
                "sale_ids": created_sale_ids,
                "date": bill_date,
                "bill_date": bill_date,
                "customerId": customer[0],
                "customerName": customer[1],
                "customerRegion": customer[3],
                "customer": {
                    "id": customer[0],
                    "name": customer[1],
                    "email": customer[2],
                    "region": customer[3]
                },
                "items": bill_items,
                "originalSubtotal": total_original_subtotal,
                "totalDiscount": total_discount_amount,
                "total_discount": total_discount_amount,
                "subtotal": total_bill_amount - total_gst_amount,
                "gstTotal": total_gst_amount,
                "total_gst": total_gst_amount,
                "grandTotal": total_bill_amount,
                "total_amount": total_bill_amount
            }

            return jsonify({
                "success": True,
                "message": "Sale transaction completed successfully.",
                "invoice": invoice
            })
    except Exception as e:
        conn.rollback()
        return jsonify({"success": False, "message": f"Transaction failed: {e}"}), 500
    finally:
        conn.close()


# -------------------------------------------------------------------------
# Orders History Endpoint
# -------------------------------------------------------------------------
@app.route("/api/orders", methods=["GET"])
def api_get_orders():
    limit = request.args.get("limit", default=100, type=int)
    conn = get_connection()
    orders = []
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT s.sales_id, s.product_id, p.p_name, p.category, p.price, 
                       s.quantity, s.total_amount, s.gst_amount, s.Date,
                       c.customer_id, c.c_name, c.region, COALESCE(p.unit, 'pcs'),
                       COALESCE(p.hsn_code, ''), COALESCE(p.discount, 0.0)
                FROM Sales s
                LEFT JOIN Products p ON s.product_id = p.product_id
                LEFT JOIN Customers c ON s.customer_id = c.customer_id
                ORDER BY s.sales_id DESC
                LIMIT %s
            """, (limit,))
            rows = cur.fetchall()

            for r in rows:
                sales_id, pid, p_name, category, price, qty, subtotal, gst, dt, cid, cname, region, unit, hsn, discount = r
                iso_date = dt.isoformat() if hasattr(dt, "isoformat") else str(dt)
                total = (subtotal or 0) + (gst or 0)
                orig_price = float(price or 0)
                disc_pct = float(discount or 0.0)
                disc_amt_unit = round(orig_price * (disc_pct / 100.0), 2)
                disc_price = round(orig_price - disc_amt_unit, 2)
                total_disc = round(disc_amt_unit * (qty or 1), 2)

                orders.append({
                    "billNumber": sales_id,
                    "customerId": cid or 1,
                    "customerName": cname or "Valued Customer",
                    "customerRegion": region or "General",
                    "date": iso_date,
                    "items": [
                        {
                            "id": pid,
                            "name": p_name or "Product",
                            "hsn_code": hsn or None,
                            "hsn": hsn or None,
                            "category": category or "General",
                            "price": orig_price,
                            "original_price": orig_price,
                            "discount": disc_pct,
                            "discount_percent": disc_pct,
                            "discount_amount": disc_amt_unit,
                            "total_discount": total_disc,
                            "discounted_price": disc_price,
                            "qty": qty or 1,
                            "unit": unit or "pcs",
                            "subtotal": subtotal or 0,
                            "gst": gst or 0,
                            "total": total
                        }
                    ],
                    "originalSubtotal": (subtotal or 0) + total_disc,
                    "totalDiscount": total_disc,
                    "total_discount": total_disc,
                    "subtotal": subtotal or 0,
                    "gstTotal": gst or 0,
                    "grandTotal": total
                })
    finally:
        conn.close()

    return jsonify(orders)


# -------------------------------------------------------------------------
# Analytics & Reports Endpoint
# -------------------------------------------------------------------------
@app.route("/api/analytics", methods=["GET"])
def api_analytics():
    current_year = datetime.datetime.now().year
    selected_year = request.args.get("year", type=int) or current_year

    conn = get_connection()
    data = {
        "year": selected_year,
        "available_years": [current_year],
        "low_stock": [],
        "monthly_sales": [],
        "daily_sales": [],
        "weekly_sales": [],
        "category_sales": [],
        "product_sales": [],
        "monthly_gst": [],
        "inventory_value": 0
    }

    try:
        with conn.cursor() as cur:
            cur.execute("SELECT DISTINCT YEAR(Date) FROM Sales WHERE Date IS NOT NULL ORDER BY YEAR(Date) DESC")
            years_found = [r[0] for r in cur.fetchall() if r[0]]
            if years_found:
                data["available_years"] = years_found

            cur.execute("SELECT COALESCE(SUM(price * stock_quantity), 0) FROM Products")
            data["inventory_value"] = int(cur.fetchone()[0])

            cur.execute("""
                SELECT product_id, p_name, category, price, stock_quantity, 
                       COALESCE(unit, 'pcs') AS unit, COALESCE(subcategory, 'Packing') AS subcategory,
                       COALESCE(hsn_code, '') AS hsn_code
                FROM Products 
                WHERE stock_quantity < 5 
                ORDER BY stock_quantity ASC
            """)
            data["low_stock"] = [
                {
                    "id": r[0],
                    "name": r[1],
                    "category": r[2],
                    "price": r[3],
                    "stock": r[4],
                    "unit": r[5],
                    "subcategory": r[6],
                    "hsn_code": r[7] if r[7] else None
                }
                for r in cur.fetchall()
            ]

            cur.execute("""
                SELECT MONTH(s.Date) AS MonthNo, MONTHNAME(s.Date) AS Month, 
                       COALESCE(SUM(s.total_amount), 0) AS Revenue, 
                       COALESCE(SUM(p.cost * s.quantity), 0) AS Cost, 
                       COALESCE(SUM(s.total_amount - (p.cost * s.quantity)), 0) AS Profit,
                       COALESCE(SUM(s.gst_amount), 0) AS Gst
                FROM Sales s 
                JOIN Products p ON s.product_id = p.product_id 
                WHERE YEAR(s.Date) = %s 
                GROUP BY MONTH(s.Date), MONTHNAME(s.Date) 
                ORDER BY MonthNo ASC
            """, (selected_year,))
            monthly = []
            for r in cur.fetchall():
                rev = float(r[2])
                cst = float(r[3])
                prf = float(r[4])
                margin = round((prf / rev * 100), 1) if rev > 0 else 0
                monthly.append({
                    "monthNum": r[0],
                    "name": r[1][:3] if r[1] else f"M{r[0]}",
                    "revenue": rev,
                    "cost": cst,
                    "profit": prf,
                    "margin": margin,
                    "gst": float(r[5])
                })
            data["monthly_sales"] = monthly

            cur.execute("""
                SELECT CAST(s.Date AS DATE) AS SaleDate, 
                       COALESCE(SUM(s.total_amount), 0) AS Revenue, 
                       COALESCE(SUM(p.cost * s.quantity), 0) AS Cost, 
                       COALESCE(SUM(s.total_amount - (p.cost * s.quantity)), 0) AS Profit 
                FROM Sales s 
                JOIN Products p ON s.product_id = p.product_id 
                GROUP BY CAST(s.Date AS DATE) 
                ORDER BY SaleDate DESC LIMIT 15
            """)
            data["daily_sales"] = [
                {
                    "date": str(r[0]),
                    "revenue": float(r[1]),
                    "cost": float(r[2]),
                    "profit": float(r[3])
                }
                for r in cur.fetchall()
            ]

            cur.execute("""
                SELECT WEEK(s.Date) AS WeekNo, 
                       COALESCE(SUM(s.total_amount), 0) AS Revenue, 
                       COALESCE(SUM(p.cost * s.quantity), 0) AS Cost, 
                       COALESCE(SUM(s.total_amount - (p.cost * s.quantity)), 0) AS Profit 
                FROM Sales s 
                JOIN Products p ON s.product_id = p.product_id 
                WHERE YEAR(s.Date) = %s 
                GROUP BY WEEK(s.Date) 
                ORDER BY WeekNo ASC
            """, (selected_year,))
            data["weekly_sales"] = [
                {
                    "week": r[0],
                    "revenue": float(r[1]),
                    "cost": float(r[2]),
                    "profit": float(r[3])
                }
                for r in cur.fetchall()
            ]

            cur.execute("""
                SELECT p.category, 
                       COALESCE(SUM(s.total_amount), 0) AS Revenue, 
                       COALESCE(SUM(p.cost * s.quantity), 0) AS Cost, 
                       COALESCE(SUM(s.total_amount - (p.cost * s.quantity)), 0) AS Profit 
                FROM Sales s 
                JOIN Products p ON s.product_id = p.product_id 
                GROUP BY p.category 
                ORDER BY Revenue DESC
            """)
            data["category_sales"] = [
                {
                    "category": r[0] or "General",
                    "revenue": float(r[1]),
                    "cost": float(r[2]),
                    "profit": float(r[3])
                }
                for r in cur.fetchall()
            ]

            cur.execute("""
                SELECT p.p_name, 
                       COALESCE(SUM(s.quantity), 0) AS TotalQty, 
                       COALESCE(SUM(s.total_amount), 0) AS Revenue, 
                       COALESCE(SUM(s.total_amount - (p.cost * s.quantity)), 0) AS Profit,
                       COALESCE(p.unit, 'pcs') AS unit
                FROM Sales s 
                JOIN Products p ON s.product_id = p.product_id 
                GROUP BY p.p_name, p.unit 
                ORDER BY Revenue DESC LIMIT 10
            """)
            data["product_sales"] = [
                {
                    "name": r[0],
                    "totalQty": r[1],
                    "revenue": float(r[2]),
                    "profit": float(r[3]),
                    "unit": r[4]
                }
                for r in cur.fetchall()
            ]

            cur.execute("""
                SELECT MONTHNAME(Date) AS Month, COALESCE(SUM(gst_amount), 0) AS TotalGst 
                FROM Sales 
                WHERE YEAR(Date) = %s 
                GROUP BY MONTH(Date), MONTHNAME(Date) 
                ORDER BY MONTH(Date) ASC
            """, (selected_year,))
            data["monthly_gst"] = [
                {
                    "month": r[0],
                    "totalGst": float(r[1])
                }
                for r in cur.fetchall()
            ]
    finally:
        conn.close()

    return jsonify(data)


# -------------------------------------------------------------------------
# Chart Data Endpoint (Chart.js)
# -------------------------------------------------------------------------
@app.route("/api/chart-data", methods=["GET"])
def api_chart_data():
    year = request.args.get("year", type=int) or datetime.datetime.now().year
    conn = get_connection()
    result = {
        "available_years": [datetime.datetime.now().year],
        "monthly": {"labels": [], "revenue": [], "cost": [], "profit": []},
        "category": {"labels": [], "revenue": []},
        "daily": {"labels": [], "sales": []},
        "weekly": {"labels": [], "sales": []}
    }
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT DISTINCT YEAR(Date) FROM Sales WHERE Date IS NOT NULL ORDER BY YEAR(Date) DESC")
            years = [r[0] for r in cur.fetchall() if r[0]]
            if years:
                result["available_years"] = years

            cur.execute("""
                SELECT MONTHNAME(s.Date) AS Month, 
                       COALESCE(SUM(s.total_amount), 0) AS Revenue, 
                       COALESCE(SUM(p.cost * s.quantity), 0) AS Cost, 
                       COALESCE(SUM(s.total_amount - (p.cost * s.quantity)), 0) AS Profit 
                FROM Sales s 
                JOIN Products p ON s.product_id = p.product_id 
                WHERE YEAR(s.Date) = %s 
                GROUP BY MONTH(s.Date), MONTHNAME(s.Date) 
                ORDER BY MONTH(s.Date) ASC
            """, (year,))
            for r in cur.fetchall():
                result["monthly"]["labels"].append(r[0][:3] if r[0] else "M")
                result["monthly"]["revenue"].append(float(r[1]))
                result["monthly"]["cost"].append(float(r[2]))
                result["monthly"]["profit"].append(float(r[3]))

            if not result["monthly"]["labels"]:
                result["monthly"]["labels"] = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct"]
                result["monthly"]["revenue"] = [0] * 10
                result["monthly"]["cost"] = [0] * 10
                result["monthly"]["profit"] = [0] * 10

            cur.execute("""
                SELECT p.category, COALESCE(SUM(s.total_amount), 0) AS Revenue 
                FROM Sales s 
                JOIN Products p ON s.product_id = p.product_id 
                GROUP BY p.category 
                ORDER BY Revenue DESC
            """)
            for r in cur.fetchall():
                if r[0]:
                    result["category"]["labels"].append(r[0])
                    result["category"]["revenue"].append(float(r[1]))

            cur.execute("""
                SELECT DATE_FORMAT(Date, '%d-%b') AS DayStr, 
                       COALESCE(SUM(total_amount), 0) AS Revenue 
                FROM Sales 
                GROUP BY CAST(Date AS DATE), DayStr 
                ORDER BY CAST(Date AS DATE) DESC LIMIT 14
            """)
            daily_rows = list(reversed(cur.fetchall()))
            for r in daily_rows:
                result["daily"]["labels"].append(r[0])
                result["daily"]["sales"].append(float(r[1]))

            cur.execute("""
                SELECT CONCAT('Week ', WEEK(Date)) AS Wk, 
                       COALESCE(SUM(total_amount), 0) AS Revenue 
                FROM Sales 
                WHERE YEAR(Date) = %s 
                GROUP BY WEEK(Date), Wk 
                ORDER BY WEEK(Date) ASC
            """, (year,))
            for r in cur.fetchall():
                result["weekly"]["labels"].append(r[0])
                result["weekly"]["sales"].append(float(r[1]))
    finally:
        conn.close()

    return jsonify(result)


# -----------------------------------------------------------------------------
# Multi-Echelon Locations & Suppliers Endpoints
# -----------------------------------------------------------------------------
@app.route("/api/locations", methods=["GET"])
def api_get_locations():
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT location_id, code, name, type, footfall_tier, address FROM locations ORDER BY location_id ASC")
            locs = [
                {"id": r[0], "code": r[1], "name": r[2], "type": r[3], "footfall_tier": r[4], "address": r[5]}
                for r in cur.fetchall()
            ]
            return jsonify({"success": True, "locations": locs})
    finally:
        conn.close()


@app.route("/api/suppliers", methods=["GET", "POST"])
def api_suppliers():
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            if request.method == "POST":
                data = request.get_json(silent=True) or request.form
                name = (data.get("name") or data.get("supplier_name") or "").strip()
                if not name:
                    return jsonify({"success": False, "message": "Supplier name is required."}), 400
                gstin = data.get("gstin")
                email = data.get("contact_email")
                phone = data.get("phone")
                win_days = int(data.get("expiry_return_window_days") or 30)

                cur.execute("""
                    INSERT INTO suppliers (supplier_name, gstin, contact_email, phone, expiry_return_window_days)
                    VALUES (%s, %s, %s, %s, %s)
                """, (name, gstin, email, phone, win_days))
                conn.commit()
                return jsonify({"success": True, "supplier_id": cur.lastrowid, "message": f"Supplier '{name}' registered."}), 201

            cur.execute("SELECT supplier_id, supplier_name, gstin, contact_email, phone, expiry_return_window_days FROM suppliers ORDER BY supplier_id ASC")
            sups = [
                {"id": r[0], "name": r[1], "gstin": r[2], "contact_email": r[3], "phone": r[4], "expiry_return_window_days": r[5]}
                for r in cur.fetchall()
            ]
            return jsonify({"success": True, "suppliers": sups})
    finally:
        conn.close()


# -----------------------------------------------------------------------------
# Distribution Center Goods Received Note (GRN) Inwarding
# -----------------------------------------------------------------------------
@app.route("/api/grn", methods=["GET", "POST"])
@app.route("/api/grn/receipts", methods=["GET", "POST"])
@require_roles("admin", "warehouse_picker")
def api_grn():
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            if request.method == "POST":
                data = request.get_json(silent=True) or {}
                loc_id = int(data.get("location_id") or 1)
                sup_id = int(data.get("supplier_id") or 1)
                received_by = session.get("username") or data.get("received_by") or "picker"
                items = data.get("items", [])
                invoice_no = data.get("invoice_no")
                remarks = data.get("remarks")

                res = record_grn(cur, location_id=loc_id, supplier_id=sup_id,
                                 received_by=received_by, items_data=items,
                                 invoice_no=invoice_no, remarks=remarks)
                conn.commit()
                return jsonify({"success": True, "grn": res}), 201

            # GET: list past GRNs
            cur.execute("""
                SELECT g.grn_id, g.grn_number, l.name AS location_name, s.supplier_name,
                       g.invoice_no, g.receipt_date, g.received_by, g.status,
                       COUNT(gi.grn_item_id) AS total_items, COALESCE(SUM(gi.received_qty), 0) AS total_qty
                FROM grn_receipts g
                JOIN locations l ON g.location_id = l.location_id
                JOIN suppliers s ON g.supplier_id = s.supplier_id
                LEFT JOIN grn_items gi ON g.grn_id = gi.grn_id
                GROUP BY g.grn_id, g.grn_number, l.name, s.supplier_name, g.invoice_no, g.receipt_date, g.received_by, g.status
                ORDER BY g.grn_id DESC LIMIT 50
            """)
            grn_list = [
                {
                    "grn_id": r[0], "grn_number": r[1], "location": r[2], "supplier": r[3],
                    "invoice_no": r[4], "receipt_date": str(r[5]), "received_by": r[6],
                    "status": r[7], "total_items": r[8], "total_quantity": r[9]
                }
                for r in cur.fetchall()
            ]
            return jsonify({"success": True, "grns": grn_list})
    except (BatchValidationError, PolicyViolationError) as e:
        conn.rollback()
        return jsonify({"success": False, "message": str(e)}), 400
    except Exception as e:
        conn.rollback()
        return jsonify({"success": False, "message": f"GRN failed: {e}"}), 500
    finally:
        conn.close()


# -----------------------------------------------------------------------------
# Store Replenishment Requests & System-Enforced FEFO Picking
# -----------------------------------------------------------------------------
@app.route("/api/replenishment/request", methods=["POST"])
@require_roles("admin", "store_supervisor")
def api_create_replenishment():
    data = request.get_json(silent=True) or {}
    from_loc = int(data.get("from_location_id") or 1)  # Default DC
    to_loc = int(data.get("to_location_id") or 2)      # Default Store
    req_by = session.get("username") or data.get("requested_by") or "supervisor"
    items = data.get("items", [])

    if not items:
        return jsonify({"success": False, "message": "Replenishment items required."}), 400

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            res = create_replenishment_request(cur, from_loc, to_loc, req_by, items)
            conn.commit()
            return jsonify({"success": True, "replenishment": res}), 201
    except Exception as e:
        conn.rollback()
        return jsonify({"success": False, "message": str(e)}), 500
    finally:
        conn.close()


@app.route("/api/replenishment/<int:rep_id>/allocate-fefo", methods=["POST"])
@app.route("/api/replenishment/<int:rep_id>/allocate", methods=["POST"])
@require_roles("admin", "warehouse_picker")
def api_allocate_fefo_endpoint(rep_id):
    data = request.get_json(silent=True) or {}
    allocated_by = session.get("username") or data.get("allocated_by") or "picker"
    user_role = session.get("role") or request.headers.get("X-User-Role") or "warehouse_picker"
    overrides = data.get("overrides")

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            res = process_replenishment_allocation(cur, rep_id, allocated_by, user_role, overrides)
            conn.commit()
            return jsonify({"success": True, "allocation": res})
    except (InsufficientStockError, PolicyViolationError, BatchValidationError) as e:
        conn.rollback()
        return jsonify({"success": False, "message": str(e)}), 400
    except Exception as e:
        conn.rollback()
        return jsonify({"success": False, "message": str(e)}), 500
    finally:
        conn.close()


@app.route("/api/replenishment/<int:rep_id>/pick", methods=["POST"])
@app.route("/api/replenishment/<int:rep_id>/dispatch", methods=["POST"])
@require_roles("admin", "warehouse_picker")
def api_pick_replenishment(rep_id):
    picker = session.get("username") or "picker"
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            res = dispatch_replenishment_transfer(cur, rep_id, picker)
            conn.commit()
            return jsonify({"success": True, "transfer": res})
    except Exception as e:
        conn.rollback()
        return jsonify({"success": False, "message": str(e)}), 400
    finally:
        conn.close()


@app.route("/api/replenishment/<int:rep_id>/receive", methods=["POST"])
@require_roles("admin", "store_supervisor")
def api_receive_replenishment(rep_id):
    receiver = session.get("username") or "supervisor"
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            res = receive_replenishment_at_store(cur, rep_id, receiver)
            conn.commit()
            return jsonify({"success": True, "receipt": res})
    except Exception as e:
        conn.rollback()
        return jsonify({"success": False, "message": str(e)}), 400
    finally:
        conn.close()


@app.route("/api/replenishment/<int:rep_id>", methods=["GET"])
def api_get_replenishment_detail(rep_id):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT r.replenishment_id, r.request_number, r.from_location_id, lf.name AS from_loc,
                       r.to_location_id, lt.name AS to_loc, r.status, r.requested_by, r.allocated_by, r.created_at
                FROM store_replenishments r
                JOIN locations lf ON r.from_location_id = lf.location_id
                JOIN locations lt ON r.to_location_id = lt.location_id
                WHERE r.replenishment_id = %s
            """, (rep_id,))
            rep = cur.fetchone()
            if not rep:
                return jsonify({"success": False, "message": "Replenishment request not found."}), 404

            cur.execute("""
                SELECT ri.item_id, ri.product_id, p.p_name, ri.requested_qty,
                       ri.allocated_batch_id, ri.allocated_batch_number, ri.expiry_date,
                       ri.allocated_qty, ri.picked_qty, ri.is_override, ri.override_reason, ri.override_approved_by
                FROM replenishment_items ri
                JOIN Products p ON ri.product_id = p.product_id
                WHERE ri.replenishment_id = %s
                ORDER BY ri.item_id ASC
            """, (rep_id,))
            items = [
                {
                    "item_id": r[0], "product_id": r[1], "product_name": r[2], "requested_qty": r[3],
                    "allocated_batch_id": r[4], "allocated_batch_number": r[5],
                    "expiry_date": str(r[6]) if r[6] else None, "allocated_qty": r[7], "picked_qty": r[8],
                    "is_override": bool(r[9]), "override_reason": r[10], "override_approved_by": r[11]
                }
                for r in cur.fetchall()
            ]

            data = {
                "replenishment_id": rep[0], "request_number": rep[1], "from_location_id": rep[2],
                "from_location": rep[3], "to_location_id": rep[4], "to_location": rep[5],
                "status": rep[6], "requested_by": rep[7], "allocated_by": rep[8],
                "created_at": str(rep[9]), "items": items
            }
            return jsonify({"success": True, "replenishment": data})
    finally:
        conn.close()


@app.route("/api/replenishment", methods=["GET"])
@app.route("/api/replenishment/requests", methods=["GET"])
def api_list_replenishments():
    user_role = session.get("role") or request.headers.get("X-User-Role")
    user_store_id = session.get("store_id")
    if user_store_id is None and request.headers.get("X-Store-Id"):
        try:
            user_store_id = int(request.headers.get("X-Store-Id"))
        except (ValueError, TypeError):
            pass

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            query = """
                SELECT r.replenishment_id, r.request_number, lf.name AS from_loc, lt.name AS to_loc,
                       r.status, r.requested_by, r.allocated_by, r.created_at,
                       COUNT(ri.item_id) AS total_items, COALESCE(SUM(ri.requested_qty), 0) AS total_requested,
                       r.to_location_id
                FROM store_replenishments r
                JOIN locations lf ON r.from_location_id = lf.location_id
                JOIN locations lt ON r.to_location_id = lt.location_id
                LEFT JOIN replenishment_items ri ON r.replenishment_id = ri.replenishment_id
                WHERE 1=1
            """
            params = []
            if user_role in ("store_supervisor", "store_executive", "cashier") and user_store_id:
                query += " AND r.to_location_id = %s"
                params.append(user_store_id)

            query += """
                GROUP BY r.replenishment_id, r.request_number, lf.name, lt.name, r.status, r.requested_by, r.allocated_by, r.created_at, r.to_location_id
                ORDER BY r.replenishment_id DESC
            """
            cur.execute(query, tuple(params))
            orders = [
                {
                    "replenishment_id": r[0], "request_number": r[1], "from_location": r[2],
                    "to_location": r[3], "status": r[4], "requested_by": r[5], "allocated_by": r[6],
                    "created_at": str(r[7]), "total_items": r[8], "total_requested": r[9],
                    "to_location_id": r[10]
                }
                for r in cur.fetchall()
            ]
            return jsonify({"success": True, "replenishments": orders})
    finally:
        conn.close()


# -----------------------------------------------------------------------------
# Batch Master & Full End-to-End Traceability Query
# -----------------------------------------------------------------------------
@app.route("/api/batches/traceability/<batch_number>", methods=["GET"])
@app.route("/api/traceability/batch/<batch_number>", methods=["GET"])
def api_trace_batch(batch_number):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            trace = get_batch_traceability(cur, batch_number)
            return jsonify({"success": True, "traceability": trace})
    except BatchValidationError as e:
        return jsonify({"success": False, "message": str(e)}), 404
    finally:
        conn.close()


@app.route("/api/batches", methods=["GET"])
@app.route("/api/batch-stock", methods=["GET"])
def api_list_batches():
    pid = request.args.get("product_id", type=int)
    loc_id = request.args.get("location_id", type=int)
    status = request.args.get("status")

    # Enforce store scoping if user is store-bound
    user_role = session.get("role") or request.headers.get("X-User-Role")
    user_store_id = session.get("store_id")
    if user_store_id is None and request.headers.get("X-Store-Id"):
        try:
            user_store_id = int(request.headers.get("X-Store-Id"))
        except (ValueError, TypeError):
            pass

    if user_role in ("store_supervisor", "store_executive", "cashier") and user_store_id:
        loc_id = user_store_id
    elif user_role == "warehouse_picker" and user_store_id:
        loc_id = user_store_id

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            query = """
                SELECT b.batch_id, b.product_id, p.p_name, b.batch_number,
                       b.mfg_date, b.expiry_date, DATEDIFF(b.expiry_date, CURRENT_DATE()) AS days_left,
                       b.cost_price, b.mrp, b.status,
                       COALESCE(bs.quantity_saleable, 0) AS saleable,
                       COALESCE(bs.quantity_reserved, 0) AS reserved,
                       COALESCE(bs.quantity_scrap, 0) AS scrap,
                       COALESCE(l.name, 'All Locations') AS location_name,
                       bs.location_id,
                       l.code AS location_code
                FROM batches b
                JOIN Products p ON b.product_id = p.product_id
                LEFT JOIN batch_stock bs ON b.batch_id = bs.batch_id
                LEFT JOIN locations l ON bs.location_id = l.location_id
                WHERE 1=1
            """
            params = []
            if pid:
                query += " AND b.product_id = %s"
                params.append(pid)
            if loc_id:
                query += " AND bs.location_id = %s"
                params.append(loc_id)
            if status:
                query += " AND b.status = %s"
                params.append(status)

            query += " ORDER BY b.expiry_date ASC, b.batch_id ASC"
            cur.execute(query, params)
            batches = [
                {
                    "batch_id": r[0], "product_id": r[1], "product_name": r[2],
                    "batch_number": r[3], "mfg_date": str(r[4]), "expiry_date": str(r[5]),
                    "days_to_expiry": r[6], "cost_price": float(r[7]), "mrp": float(r[8]),
                    "status": r[9], "quantity_saleable": r[10], "quantity_reserved": r[11],
                    "quantity_scrap": r[12], "location_name": r[13],
                    "location_id": r[14], "location_code": r[15]
                }
                for r in cur.fetchall()
            ]
            return jsonify({"success": True, "batches": batches})
    finally:
        conn.close()


# -----------------------------------------------------------------------------
# Expiry Stock Reports, Dump Stock, and Transfer Advice
# -----------------------------------------------------------------------------
@app.route("/api/reports/expiry-stock", methods=["GET"])
def api_report_expiry_stock():
    days = request.args.get("days", default=30, type=int)
    loc_id = request.args.get("location_id", type=int)
    category = request.args.get("category")
    supplier_id = request.args.get("supplier_id", type=int)
    product_id = request.args.get("product_id", type=int)

    # Store Scoping Enforcement
    store_id_scoped, _ = get_store_scoping(loc_id)
    if store_id_scoped:
        loc_id = store_id_scoped

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            report = get_expiry_stock_report(
                cur, days_threshold=days, location_id=loc_id,
                category=category, supplier_id=supplier_id, product_id=product_id
            )
            return jsonify({"success": True, "report": report})
    finally:
        conn.close()


@app.route("/api/reports/dump-stock", methods=["GET"])
def api_report_dump_stock():
    days = request.args.get("days", default=30, type=int)
    lookback = request.args.get("lookback", default=30, type=int)

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            dumps = detect_dump_stock(cur, days_threshold=days, sales_lookback_days=lookback)
            return jsonify({"success": True, "dump_stock": dumps})
    finally:
        conn.close()


@app.route("/api/reports/transfer-suggestions", methods=["GET"])
def api_report_transfer_suggestions():
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            suggestions = get_interstore_transfer_suggestions(cur)
            return jsonify({"success": True, "suggestions": suggestions})
    finally:
        conn.close()


# -----------------------------------------------------------------------------
# Code Management (Store Physical Audits)
# -----------------------------------------------------------------------------
@app.route("/api/audits", methods=["GET"])
@require_roles("admin", "category_manager", "store_supervisor", "store_executive")
def api_list_audits():
    store_id_scoped, _ = get_store_scoping()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            query = """
                SELECT a.audit_id, a.audit_number, a.location_id, l.name AS location_name,
                       a.status, a.created_by, a.submitted_by, a.approved_by, a.created_at, a.completed_at
                FROM code_management_audits a
                JOIN locations l ON a.location_id = l.location_id
            """
            params = []
            if store_id_scoped:
                query += " WHERE a.location_id = %s"
                params.append(store_id_scoped)
            query += " ORDER BY a.created_at DESC"
            cur.execute(query, params)
            audits = [
                {"audit_id": r[0], "audit_number": r[1], "location_id": r[2], "location_name": r[3],
                 "status": r[4], "created_by": r[5], "submitted_by": r[6], "approved_by": r[7],
                 "created_at": str(r[8]), "completed_at": str(r[9]) if r[9] else None}
                for r in cur.fetchall()
            ]
            return jsonify({"success": True, "audits": audits})
    finally:
        conn.close()


@app.route("/api/audits/create", methods=["POST"])
@require_roles("admin", "store_supervisor")
def api_create_audit():
    data = request.get_json(silent=True) or {}
    store_id_scoped, _ = get_store_scoping(data.get("location_id"))
    loc_id = store_id_scoped if store_id_scoped else int(data.get("location_id") or 2)
    user = session.get("username") or request.headers.get("X-User-Name") or "supervisor"

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            res = create_code_audit(cur, loc_id, user)
            conn.commit()
            return jsonify({"success": True, "audit": res}), 201
    finally:
        conn.close()


@app.route("/api/audits/<int:audit_id>", methods=["GET"])
def api_get_audit(audit_id):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT a.audit_id, a.audit_number, a.location_id, l.name AS location_name,
                       a.status, a.created_by, a.approved_by, a.created_at, a.completed_at, a.submitted_by
                FROM code_management_audits a
                JOIN locations l ON a.location_id = l.location_id
                WHERE a.audit_id = %s
            """, (audit_id,))
            row = cur.fetchone()
            if not row:
                return jsonify({"success": False, "message": f"Audit #{audit_id} not found."}), 404

            cur.execute("""
                SELECT ai.audit_item_id, ai.product_id, p.p_name, ai.batch_id, b.batch_number,
                       b.expiry_date, ai.system_qty, ai.physical_qty, ai.discrepancy_qty, ai.remarks
                FROM audit_items ai
                JOIN Products p ON ai.product_id = p.product_id
                JOIN batches b ON ai.batch_id = b.batch_id
                WHERE ai.audit_id = %s
            """, (audit_id,))
            items = [
                {
                    "audit_item_id": r[0], "product_id": r[1], "product_name": r[2],
                    "batch_id": r[3], "batch_number": r[4], "expiry_date": str(r[5]),
                    "system_qty": r[6], "physical_qty": r[7], "discrepancy_qty": r[8], "remarks": r[9]
                }
                for r in cur.fetchall()
            ]

            audit_data = {
                "audit_id": row[0], "audit_number": row[1], "location_id": row[2],
                "location_name": row[3], "status": row[4], "created_by": row[5],
                "approved_by": row[6], "created_at": str(row[7]), "completed_at": str(row[8]) if row[8] else None,
                "submitted_by": row[9], "items": items
            }
            return jsonify({"success": True, "audit": audit_data})
    finally:
        conn.close()


@app.route("/api/audits/<int:audit_id>/submit", methods=["POST"])
@require_roles("admin", "store_supervisor", "store_executive")
def api_submit_audit(audit_id):
    data = request.get_json(silent=True) or {}
    counts = data.get("counts", [])
    user = session.get("username") or request.headers.get("X-User-Name") or "store_executive"

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            res = submit_code_audit(cur, audit_id, counts, user)
            conn.commit()
            return jsonify({"success": True, "result": res})
    except (PolicyViolationError, BatchValidationError) as e:
        conn.rollback()
        return jsonify({"success": False, "message": str(e)}), 400
    finally:
        conn.close()


@app.route("/api/audits/<int:audit_id>/approve", methods=["POST"])
@require_roles("admin", "store_supervisor")
def api_approve_audit(audit_id):
    user = session.get("username") or request.headers.get("X-User-Name") or "supervisor"
    role = session.get("role") or request.headers.get("X-User-Role") or "store_supervisor"
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            res = approve_code_audit(cur, audit_id, user, role)
            conn.commit()
            return jsonify({"success": True, "approval": res})
    except (PolicyViolationError, SegregationOfDutiesError, BatchValidationError) as e:
        conn.rollback()
        return jsonify({"success": False, "message": str(e)}), 400
    finally:
        conn.close()


# -----------------------------------------------------------------------------
# Near-Expiry Markdowns & Push Sale
# -----------------------------------------------------------------------------
@app.route("/api/markdowns/suggestions", methods=["GET"])
def api_markdown_suggestions():
    loc_id = request.args.get("location_id", type=int)
    store_id_scoped, _ = get_store_scoping(loc_id)
    if store_id_scoped:
        loc_id = store_id_scoped

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            suggs = calculate_markdown_suggestions(cur, location_id=loc_id)
            return jsonify({"success": True, "suggestions": suggs})
    finally:
        conn.close()


@app.route("/api/markdowns/promotions", methods=["GET"])
@require_roles("admin", "category_manager", "store_supervisor", "store_executive")
def api_list_markdown_promotions():
    store_id_scoped, _ = get_store_scoping()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            query = """
                SELECT m.markdown_id, m.promotion_code, m.product_id, p.p_name,
                       m.batch_id, b.batch_number, b.expiry_date, m.location_id, l.name AS location_name,
                       m.suggested_discount_percent, m.approved_discount_percent,
                       m.original_price, m.markdown_price, m.floor_price, m.is_below_floor,
                       m.status, m.created_by, m.approved_by, m.start_date, m.end_date,
                       COALESCE(t.units_initially_marked_down, 0) AS initial_units,
                       COALESCE(t.units_sold, 0) AS units_sold,
                       COALESCE(t.revenue_generated, 0.0) AS revenue_generated
                FROM markdown_promotions m
                JOIN Products p ON m.product_id = p.product_id
                JOIN batches b ON m.batch_id = b.batch_id
                JOIN locations l ON m.location_id = l.location_id
                LEFT JOIN markdown_sales_tracking t ON m.markdown_id = t.markdown_id
            """
            params = []
            if store_id_scoped:
                query += " WHERE m.location_id = %s"
                params.append(store_id_scoped)
            query += " ORDER BY m.created_at DESC"
            cur.execute(query, params)
            promos = [
                {
                    "markdown_id": r[0], "promotion_code": r[1], "product_id": r[2], "product_name": r[3],
                    "batch_id": r[4], "batch_number": r[5], "expiry_date": str(r[6]),
                    "location_id": r[7], "location_name": r[8],
                    "suggested_discount_percent": float(r[9]), "approved_discount_percent": float(r[10]),
                    "original_price": float(r[11]), "markdown_price": float(r[12]), "floor_price": float(r[13]),
                    "is_below_floor": bool(r[14]), "status": r[15], "created_by": r[16], "approved_by": r[17],
                    "start_date": str(r[18]), "end_date": str(r[19]),
                    "initial_units": r[20], "units_sold": r[21], "revenue_generated": float(r[22]),
                    "sell_through_pct": round((r[21] / r[20] * 100), 1) if r[20] > 0 else 0.0
                }
                for r in cur.fetchall()
            ]
            return jsonify({"success": True, "promotions": promos})
    finally:
        conn.close()


@app.route("/api/markdowns/propose", methods=["POST"])
@require_roles("admin", "store_supervisor", "store_executive")
def api_propose_markdown_endpoint():
    data = request.get_json(silent=True) or {}
    store_id_scoped, _ = get_store_scoping(data.get("location_id"))
    loc_id = store_id_scoped if store_id_scoped else int(data.get("location_id") or 2)
    pid = int(data["product_id"])
    bid = int(data["batch_id"])
    disc = float(data["proposed_discount_percent"])
    user = session.get("username") or request.headers.get("X-User-Name") or "store_executive"
    notes = data.get("notes")

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            res = propose_markdown(cur, loc_id, pid, bid, disc, user, notes)
            conn.commit()
            return jsonify({"success": True, "markdown": res}), 201
    except (PolicyViolationError, BatchValidationError) as e:
        conn.rollback()
        return jsonify({"success": False, "message": str(e)}), 400
    finally:
        conn.close()


@app.route("/api/markdowns/<int:markdown_id>/approve", methods=["POST"])
@require_roles("admin", "store_supervisor", "category_manager")
def api_approve_markdown_endpoint(markdown_id):
    data = request.get_json(silent=True) or {}
    disc = float(data.get("approved_discount_percent", 0.0))
    user = session.get("username") or request.headers.get("X-User-Name") or "supervisor"
    role = session.get("role") or request.headers.get("X-User-Role") or "store_supervisor"
    notes = data.get("notes")

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            res = approve_markdown(cur, markdown_id, disc, user, role, notes)
            conn.commit()
            return jsonify({"success": True, "markdown": res})
    except (PolicyViolationError, SegregationOfDutiesError, BatchValidationError) as e:
        conn.rollback()
        return jsonify({"success": False, "message": str(e)}), 400
    finally:
        conn.close()


@app.route("/api/approvals/pending", methods=["GET"])
@require_roles("admin", "store_supervisor", "category_manager", "store_executive", "accounts")
def api_get_pending_approvals():
    role = session.get("role") or request.headers.get("X-User-Role") or "store_supervisor"
    username = session.get("username") or request.headers.get("X-User-Name") or "supervisor"
    store_id, _ = get_store_scoping()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            inbox = get_pending_approvals(cur, user_role=role, user_store_id=store_id, username=username)
            return jsonify({"success": True, "inbox": inbox})
    finally:
        conn.close()


# -----------------------------------------------------------------------------
# Vendor Expiry Returns, Scrap Ledger, and Debit Notes
# -----------------------------------------------------------------------------
@app.route("/api/returns/expiry/create", methods=["POST"])
@require_roles("admin", "store_supervisor", "store_executive")
def api_create_return():
    data = request.get_json(silent=True) or {}
    store_id_scoped, _ = get_store_scoping(data.get("location_id"))
    loc_id = store_id_scoped if store_id_scoped else int(data.get("location_id") or 2)
    sup_id = int(data["supplier_id"])
    pid = int(data["product_id"])
    bid = int(data["batch_id"])
    qty = int(data["quantity"])
    reason = data.get("reason") or "Hit Supplier Expiry Return Window"
    user = session.get("username") or request.headers.get("X-User-Name") or "store_executive"

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            res = create_expiry_return(cur, loc_id, sup_id, pid, bid, qty, user, reason)
            conn.commit()
            return jsonify({"success": True, "return": res}), 201
    except (PolicyViolationError, BatchValidationError) as e:
        conn.rollback()
        return jsonify({"success": False, "message": str(e)}), 400
    finally:
        conn.close()


@app.route("/api/returns/expiry/<int:ret_id>/post", methods=["POST"])
@require_roles("admin", "store_supervisor")
def api_post_return(ret_id):
    user = session.get("username") or request.headers.get("X-User-Name") or "supervisor"
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            res = post_expiry_return_atomic(cur, ret_id, user)
            conn.commit()
            return jsonify({"success": True, "result": res})
    except (InsufficientStockError, PolicyViolationError, SegregationOfDutiesError, BatchValidationError) as e:
        conn.rollback()
        return jsonify({"success": False, "message": str(e)}), 400
    finally:
        conn.close()


@app.route("/api/returns/expiry", methods=["GET"])
@require_roles("admin", "category_manager", "store_supervisor", "store_executive", "accounts")
def api_list_returns():
    store_id_scoped, role = get_store_scoping()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            query = """
                SELECT r.return_id, r.return_number, r.location_id, l.name AS location_name,
                       s.supplier_id, s.supplier_name, p.product_id, p.p_name,
                       b.batch_id, b.batch_number, b.expiry_date, r.quantity, r.unit_cost,
                       r.total_claim_amount, r.reason, r.created_by, r.status,
                       r.posted_at, r.posted_by, r.created_at
                FROM vendor_expiry_returns r
                JOIN locations l ON r.location_id = l.location_id
                JOIN suppliers s ON r.supplier_id = s.supplier_id
                JOIN Products p ON r.product_id = p.product_id
                JOIN batches b ON r.batch_id = b.batch_id
            """
            params = []
            if store_id_scoped and role in ("store_supervisor", "store_executive"):
                query += " WHERE r.location_id = %s"
                params.append(store_id_scoped)
            query += " ORDER BY r.return_id DESC"
            cur.execute(query, params)
            returns = [
                {
                    "return_id": r[0], "return_number": r[1], "location_id": r[2], "location_name": r[3],
                    "supplier_id": r[4], "supplier_name": r[5], "product_id": r[6], "product_name": r[7],
                    "batch_id": r[8], "batch_number": r[9], "expiry_date": str(r[10]),
                    "quantity": r[11], "unit_cost": float(r[12]), "total_claim_amount": float(r[13]),
                    "reason": r[14], "created_by": r[15], "status": r[16],
                    "posted_at": str(r[17]) if r[17] else None, "posted_by": r[18], "created_at": str(r[19])
                }
                for r in cur.fetchall()
            ]
            return jsonify({"success": True, "returns": returns})
    finally:
        conn.close()


@app.route("/api/returns/scrap-ledger", methods=["GET"])
@require_roles("admin", "store_supervisor", "category_manager", "accounts", "store_executive")
def api_get_scrap_ledger():
    store_id_scoped, _ = get_store_scoping()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            query = """
                SELECT bs.location_id, l.name AS location_name, bs.product_id, p.p_name, p.category,
                       bs.batch_id, b.batch_number, b.expiry_date, b.cost_price,
                       bs.quantity_scrap, (bs.quantity_scrap * b.cost_price) AS scrap_value,
                       s.supplier_name
                FROM batch_stock bs
                JOIN batches b ON bs.batch_id = b.batch_id
                JOIN Products p ON bs.product_id = p.product_id
                JOIN locations l ON bs.location_id = l.location_id
                LEFT JOIN suppliers s ON b.supplier_id = s.supplier_id
                WHERE bs.quantity_scrap > 0
            """
            params = []
            if store_id_scoped:
                query += " AND bs.location_id = %s"
                params.append(store_id_scoped)
            query += " ORDER BY bs.quantity_scrap DESC"
            cur.execute(query, params)
            items = [
                {
                    "location_id": r[0], "location_name": r[1], "product_id": r[2], "product_name": r[3],
                    "category": r[4], "batch_id": r[5], "batch_number": r[6], "expiry_date": str(r[7]),
                    "cost_price": float(r[8]), "quantity_scrap": r[9], "scrap_value": float(r[10]),
                    "supplier_name": r[11] or "N/A"
                }
                for r in cur.fetchall()
            ]
            return jsonify({"success": True, "scrap_ledger": items})
    finally:
        conn.close()


@app.route("/api/returns/debit-notes", methods=["GET"])
@app.route("/api/debit-notes", methods=["GET"])
@require_roles("admin", "accounts", "store_supervisor")
def api_list_debit_notes():
    store_id_scoped, role = get_store_scoping()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            query = """
                SELECT dn.debit_note_id, dn.debit_note_number, dn.return_id, r.return_number,
                       r.location_id, l.name AS location_name, s.supplier_id, s.supplier_name,
                       dn.issue_date, dn.taxable_amount, dn.gst_amount, dn.total_amount,
                       dn.status, dn.acknowledged_by, dn.acknowledged_at,
                       dn.settled_by, dn.settled_at, dn.supplier_credit_ref,
                       p.p_name, b.batch_number, r.quantity
                FROM debit_notes dn
                JOIN suppliers s ON dn.supplier_id = s.supplier_id
                JOIN vendor_expiry_returns r ON dn.return_id = r.return_id
                JOIN locations l ON r.location_id = l.location_id
                JOIN Products p ON r.product_id = p.product_id
                JOIN batches b ON r.batch_id = b.batch_id
            """
            params = []
            if store_id_scoped and role == "store_supervisor":
                query += " WHERE r.location_id = %s"
                params.append(store_id_scoped)
            query += " ORDER BY dn.debit_note_id DESC"
            cur.execute(query, params)
            notes = [
                {
                    "debit_note_id": r[0], "debit_note_number": r[1], "return_id": r[2], "return_number": r[3],
                    "location_id": r[4], "location_name": r[5], "supplier_id": r[6], "supplier_name": r[7],
                    "issue_date": str(r[8]), "taxable_amount": float(r[9]), "gst_amount": float(r[10]),
                    "total_amount": float(r[11]), "status": r[12],
                    "acknowledged_by": r[13], "acknowledged_at": str(r[14]) if r[14] else None,
                    "settled_by": r[15], "settled_at": str(r[16]) if r[16] else None,
                    "supplier_credit_ref": r[17], "product_name": r[18], "batch_number": r[19], "quantity": r[20]
                }
                for r in cur.fetchall()
            ]
            return jsonify({"success": True, "debit_notes": notes})
    finally:
        conn.close()


@app.route("/api/finance/debit-notes/<int:dn_id>/acknowledge", methods=["POST"])
@require_roles("admin", "accounts")
def api_acknowledge_debit_note(dn_id):
    user = session.get("username") or request.headers.get("X-User-Name") or "accounts_officer"
    role = session.get("role") or request.headers.get("X-User-Role") or "accounts"
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            res = acknowledge_debit_note(cur, dn_id, user, role)
            conn.commit()
            return jsonify({"success": True, "result": res})
    except (PolicyViolationError, BatchValidationError) as e:
        conn.rollback()
        return jsonify({"success": False, "message": str(e)}), 400
    finally:
        conn.close()


@app.route("/api/finance/debit-notes/<int:dn_id>/settle", methods=["POST"])
@require_roles("admin", "accounts")
def api_settle_debit_note(dn_id):
    data = request.get_json(silent=True) or {}
    user = session.get("username") or request.headers.get("X-User-Name") or "accounts_officer"
    role = session.get("role") or request.headers.get("X-User-Role") or "accounts"
    credit_ref = data.get("supplier_credit_ref")
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            res = settle_debit_note(cur, dn_id, user, role, credit_ref)
            conn.commit()
            return jsonify({"success": True, "result": res})
    except (PolicyViolationError, BatchValidationError) as e:
        conn.rollback()
        return jsonify({"success": False, "message": str(e)}), 400
    finally:
        conn.close()



# -----------------------------------------------------------------------------
# Phase 1 Foundation: Enterprise Policies, Supplier Terms, Roles & Audit Log
# -----------------------------------------------------------------------------
@app.route("/api/admin/policies", methods=["GET"])
@require_roles("admin", "category_manager")
def api_get_policies():
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT policy_key, policy_value, description, updated_by, updated_at
                FROM system_policies
                ORDER BY policy_key ASC
            """)
            policies = [
                {
                    "policy_key": r[0],
                    "policy_value": r[1],
                    "description": r[2],
                    "updated_by": r[3],
                    "updated_at": str(r[4]) if r[4] else None
                }
                for r in cur.fetchall()
            ]
            return jsonify({"success": True, "policies": policies})
    finally:
        conn.close()


@app.route("/api/admin/policies", methods=["PUT"])
@require_roles("admin")
def api_update_policy():
    data = request.get_json(silent=True) or {}
    key = data.get("policy_key", "").strip()
    val = str(data.get("policy_value", "")).strip()

    if not key or not val:
        return jsonify({"success": False, "message": "policy_key and policy_value are required."}), 400

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            update_system_policy(cur, key, val, updated_by=g.username)
            log_audit_event(
                cur,
                action_type="POLICY_UPDATE",
                entity_type="SYSTEM_POLICY",
                entity_id=key,
                user_id=g.user_id,
                username=g.username,
                user_role=g.user_role,
                store_id=g.user_store_id,
                details={"policy_key": key, "new_value": val},
                ip_address=request.remote_addr
            )
            conn.commit()
            return jsonify({"success": True, "message": f"Policy '{key}' updated successfully."})
    except BatchValidationError as e:
        conn.rollback()
        return jsonify({"success": False, "message": str(e)}), 400
    except Exception as e:
        conn.rollback()
        return jsonify({"success": False, "message": f"Failed to update policy: {e}"}), 500
    finally:
        conn.close()


@app.route("/api/admin/supplier-terms", methods=["GET"])
@require_roles("admin", "category_manager", "accounts")
def api_get_supplier_terms():
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT supplier_id, supplier_name, gstin, contact_email, phone, expiry_return_window_days, created_at
                FROM suppliers
                ORDER BY supplier_name ASC
            """)
            suppliers = [
                {
                    "supplier_id": r[0],
                    "supplier_name": r[1],
                    "gstin": r[2],
                    "contact_email": r[3],
                    "phone": r[4],
                    "expiry_return_window_days": r[5],
                    "created_at": str(r[6]) if r[6] else None
                }
                for r in cur.fetchall()
            ]
            return jsonify({"success": True, "suppliers": suppliers})
    finally:
        conn.close()


@app.route("/api/admin/supplier-terms/<int:supplier_id>", methods=["PUT"])
@require_roles("admin", "category_manager")
def api_update_supplier_terms(supplier_id):
    data = request.get_json(silent=True) or {}
    window_days = data.get("expiry_return_window_days")
    contact_email = data.get("contact_email")
    phone = data.get("phone")

    if window_days is None or int(window_days) < 0:
        return jsonify({"success": False, "message": "Valid non-negative expiry_return_window_days is required."}), 400

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE suppliers
                SET expiry_return_window_days = %s,
                    contact_email = COALESCE(%s, contact_email),
                    phone = COALESCE(%s, phone)
                WHERE supplier_id = %s
            """, (int(window_days), contact_email, phone, supplier_id))
            if cur.rowcount == 0:
                conn.rollback()
                return jsonify({"success": False, "message": f"Supplier #{supplier_id} not found."}), 404

            log_audit_event(
                cur,
                action_type="SUPPLIER_TERMS_UPDATE",
                entity_type="SUPPLIER",
                entity_id=str(supplier_id),
                user_id=g.user_id,
                username=g.username,
                user_role=g.user_role,
                store_id=g.user_store_id,
                details={"supplier_id": supplier_id, "expiry_return_window_days": int(window_days)},
                ip_address=request.remote_addr
            )
            conn.commit()
            return jsonify({"success": True, "message": "Supplier terms updated successfully."})
    except Exception as e:
        conn.rollback()
        return jsonify({"success": False, "message": f"Failed to update supplier terms: {e}"}), 500
    finally:
        conn.close()


@app.route("/api/admin/roles", methods=["GET"])
@require_roles("admin")
def api_get_roles():
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT u.user_id, u.username, u.role, u.store_id, l.name AS store_name, l.code AS store_code, u.created_at
                FROM Users u
                LEFT JOIN locations l ON u.store_id = l.location_id
                ORDER BY u.user_id ASC
            """)
            users = [
                {
                    "user_id": r[0],
                    "username": r[1],
                    "role": r[2],
                    "store_id": r[3],
                    "store_name": r[4],
                    "store_code": r[5],
                    "created_at": str(r[6]) if r[6] else None
                }
                for r in cur.fetchall()
            ]
            return jsonify({"success": True, "users": users})
    finally:
        conn.close()


@app.route("/api/admin/roles/<int:target_user_id>", methods=["PUT"])
@require_roles("admin")
def api_update_user_role(target_user_id):
    data = request.get_json(silent=True) or {}
    new_role = data.get("role")
    new_store_id = data.get("store_id")

    if new_role and new_role not in VALID_ROLES:
        return jsonify({"success": False, "message": f"Invalid role '{new_role}'. Must be one of: {', '.join(VALID_ROLES)}"}), 400

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT username, role, store_id FROM Users WHERE user_id = %s", (target_user_id,))
            target = cur.fetchone()
            if not target:
                return jsonify({"success": False, "message": f"User #{target_user_id} not found."}), 404

            old_username, old_role, old_store = target
            updated_role = new_role if new_role else old_role
            updated_store = new_store_id if "store_id" in data else old_store

            cur.execute("""
                UPDATE Users
                SET role = %s, store_id = %s
                WHERE user_id = %s
            """, (updated_role, updated_store, target_user_id))

            log_audit_event(
                cur,
                action_type="USER_ROLE_SCOPING_UPDATE",
                entity_type="USER",
                entity_id=str(target_user_id),
                user_id=g.user_id,
                username=g.username,
                user_role=g.user_role,
                store_id=g.user_store_id,
                details={
                    "target_user_id": target_user_id,
                    "target_username": old_username,
                    "old_role": old_role,
                    "new_role": updated_role,
                    "old_store_id": old_store,
                    "new_store_id": updated_store
                },
                ip_address=request.remote_addr
            )
            conn.commit()
            return jsonify({"success": True, "message": f"User '{old_username}' permissions updated."})
    except Exception as e:
        conn.rollback()
        return jsonify({"success": False, "message": f"Failed to update user: {e}"}), 500
    finally:
        conn.close()


@app.route("/api/admin/audit-log", methods=["GET"])
@require_roles("admin", "category_manager")
def api_get_audit_log():
    limit = int(request.args.get("limit", 100))
    offset = int(request.args.get("offset", 0))
    action_type = request.args.get("action_type")
    user_id = request.args.get("user_id")

    query = """
        SELECT sal.log_id, sal.action_type, sal.entity_type, sal.entity_id,
               sal.user_id, sal.username, sal.user_role, sal.store_id, l.name AS store_name,
               sal.details, sal.ip_address, sal.created_at
        FROM system_audit_log sal
        LEFT JOIN locations l ON sal.store_id = l.location_id
        WHERE 1=1
    """
    params = []
    if action_type:
        query += " AND sal.action_type = %s"
        params.append(action_type)
    if user_id:
        query += " AND sal.user_id = %s"
        params.append(int(user_id))

    query += " ORDER BY sal.log_id DESC LIMIT %s OFFSET %s"
    params.extend([limit, offset])

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(query, tuple(params))
            logs = [
                {
                    "log_id": r[0],
                    "action_type": r[1],
                    "entity_type": r[2],
                    "entity_id": r[3],
                    "user_id": r[4],
                    "username": r[5],
                    "user_role": r[6],
                    "store_id": r[7],
                    "store_name": r[8],
                    "details": r[9],
                    "ip_address": r[10],
                    "created_at": str(r[11]) if r[11] else None
                }
                for r in cur.fetchall()
            ]
            return jsonify({"success": True, "audit_logs": logs})
    finally:
        conn.close()



# -----------------------------------------------------------------------------
# Phase 6: Analytics, Role-Scoped Dashboard KPIs, Notifications & Jobs
# -----------------------------------------------------------------------------
@app.route("/api/analytics/expiry-ageing", methods=["GET"])
def api_analytics_expiry_ageing():
    loc_id = request.args.get("location_id", type=int)
    store_id_scoped, _ = get_store_scoping(loc_id)
    if store_id_scoped:
        loc_id = store_id_scoped
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            data = get_expiry_ageing_summary(cur, location_id=loc_id)
            return jsonify({"success": True, "ageing": data})
    finally:
        conn.close()


@app.route("/api/analytics/scrap-trend", methods=["GET"])
def api_analytics_scrap_trend():
    loc_id = request.args.get("location_id", type=int)
    store_id_scoped, _ = get_store_scoping(loc_id)
    if store_id_scoped:
        loc_id = store_id_scoped
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            trend = get_scrap_loss_trend(cur, location_id=loc_id)
            return jsonify({"success": True, "scrap_trend": trend})
    finally:
        conn.close()


@app.route("/api/analytics/markdown-sellthrough", methods=["GET"])
def api_analytics_markdown_sellthrough():
    loc_id = request.args.get("location_id", type=int)
    store_id_scoped, _ = get_store_scoping(loc_id)
    if store_id_scoped:
        loc_id = store_id_scoped
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            data = get_markdown_sellthrough_analytics(cur, location_id=loc_id)
            return jsonify({"success": True, "markdown_sellthrough": data})
    finally:
        conn.close()


@app.route("/api/analytics/supplier-returns", methods=["GET"])
@require_roles("admin", "category_manager", "accounts", "store_supervisor")
def api_analytics_supplier_returns():
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            rates = get_supplier_return_rate_analytics(cur)
            return jsonify({"success": True, "supplier_return_rates": rates})
    finally:
        conn.close()


@app.route("/api/analytics/fefo-overrides", methods=["GET"])
@require_roles("admin", "category_manager", "store_supervisor")
def api_analytics_fefo_overrides():
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            rates = get_fefo_override_analytics(cur)
            return jsonify({"success": True, "fefo_overrides": rates})
    finally:
        conn.close()


@app.route("/api/dashboard/role-metrics", methods=["GET"])
def api_dashboard_role_metrics():
    role = session.get("role") or request.headers.get("X-User-Role") or "admin"
    raw_store = session.get("store_id") or request.headers.get("X-Store-Id")
    store_id = int(raw_store) if raw_store is not None and str(raw_store).isdigit() else None
    username = session.get("username") or request.headers.get("X-User-Name") or "supervisor"

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            metrics = get_role_dashboard_metrics(cur, user_role=role, user_store_id=store_id, username=username)
            return jsonify({"success": True, "metrics": metrics})
    finally:
        conn.close()


@app.route("/api/jobs/run-expiry-alert-check", methods=["POST"])
@require_roles("admin", "category_manager", "store_supervisor")
def api_run_expiry_alert_check():
    conn = get_connection()
    try:
        result = run_daily_expiry_notification_job(conn)
        return jsonify({"success": True, "result": result})
    finally:
        conn.close()


@app.route("/api/notifications", methods=["GET"])
def api_get_notifications():
    role = session.get("role") or request.headers.get("X-User-Role") or "admin"
    raw_store = session.get("store_id") or request.headers.get("X-Store-Id")
    store_id = int(raw_store) if raw_store is not None and str(raw_store).isdigit() else None

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            ensure_notifications_table(cur)
            query = """
                SELECT notification_id, recipient_role, recipient_store_id, title, message, severity, category, is_read, created_at
                FROM system_notifications
                WHERE (recipient_role = %s OR recipient_role = 'ALL')
            """
            params = [role]
            if role in ("store_supervisor", "store_executive", "cashier") and store_id:
                query += " AND (recipient_store_id = %s OR recipient_store_id IS NULL)"
                params.append(store_id)
            query += " ORDER BY notification_id DESC LIMIT 50"
            cur.execute(query, tuple(params))
            notifications = [
                {
                    "notification_id": r[0],
                    "recipient_role": r[1],
                    "recipient_store_id": r[2],
                    "title": r[3],
                    "message": r[4],
                    "severity": r[5],
                    "category": r[6],
                    "is_read": bool(r[7]),
                    "created_at": str(r[8]) if r[8] else None
                }
                for r in cur.fetchall()
            ]
            unread_count = sum(1 for n in notifications if not n["is_read"])
            return jsonify({"success": True, "notifications": notifications, "unread_count": unread_count})
    finally:
        conn.close()


@app.route("/api/notifications/<int:notif_id>/read", methods=["POST"])
def api_mark_notification_read(notif_id):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("UPDATE system_notifications SET is_read = 1 WHERE notification_id = %s", (notif_id,))
            conn.commit()
            return jsonify({"success": True, "message": f"Notification #{notif_id} marked as read."})
    finally:
        conn.close()


@app.route("/api/settings/notifications", methods=["GET", "POST"])
def api_notification_settings():
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            if request.method == "POST":
                data = request.get_json(silent=True) or {}
                for k, v in data.items():
                    update_system_policy(cur, k, str(v), "Updated notification preferences")
                conn.commit()
                return jsonify({"success": True, "message": "Notification preferences updated successfully."})
            else:
                threshold_days = get_system_policy(cur, "expiry_alert_threshold_days", "30")
                auto_markdown_days = get_system_policy(cur, "auto_markdown_trigger_days", "15")
                notify_channels = get_system_policy(cur, "notification_channels", "app,email")
                auto_job_enabled = get_system_policy(cur, "daily_job_auto_run_enabled", "true")
                return jsonify({
                    "success": True,
                    "settings": {
                        "expiry_alert_threshold_days": int(threshold_days),
                        "auto_markdown_trigger_days": int(auto_markdown_days),
                        "notification_channels": notify_channels,
                        "daily_job_auto_run_enabled": auto_job_enabled.lower() in ("true", "1")
                    }
                })
    finally:
        conn.close()


if __name__ == "__main__":
    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", "5000"))
    debug = os.getenv("FLASK_ENV", "development") == "development"
    print(f"Starting RetailSphere API on http://{host}:{port}")
    app.run(host=host, port=port, debug=debug)

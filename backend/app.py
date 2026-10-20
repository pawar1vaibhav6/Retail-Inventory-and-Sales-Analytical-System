import datetime
import os
import pymysql
from functools import wraps
from flask import Flask, request, session, jsonify
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
        return jsonify({
            "success": True,
            "message": f"Welcome back, {user['username']}!",
            "user": {
                "id": user["user_id"],
                "username": user["username"],
                "role": user["role"]
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

    if not username or not password:
        return jsonify({"success": False, "message": "Username and password are required."}), 400

    if len(password) < 4:
        return jsonify({"success": False, "message": "Password must be at least 4 characters long."}), 400

    if role not in ("admin", "cashier"):
        role = "cashier"

    success, msg = register_user(username, password, role)
    if success:
        user = verify_user(username, password)
        if user:
            session["user_id"] = user["user_id"]
            session["username"] = user["username"]
            session["role"] = user["role"]
        return jsonify({
            "success": True,
            "message": f"Account for '{username}' created successfully!",
            "user": user or {"id": 1, "username": username, "role": role}
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
                "role": session.get("role", "cashier")
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
                       COALESCE(discount, 0.0) AS discount
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
                    "discount": float(r[12]) if len(r) > 12 and r[12] is not None else 0.0
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

                # Discount attribute (0-100%, default 0.0)
                disc_input = data.get("discount")
                try:
                    discount = validate_discount_value(disc_input) if disc_input is not None and disc_input != "" else 0.0
                except ValueError as disc_err:
                    return jsonify({"success": False, "message": str(disc_err)}), 400

                cur.execute("""
                    INSERT INTO Products (
                        product_id, p_name, category, subcategory, price, stock_quantity, cost, unit,
                        hsn_code, is_packaged, is_branded, bundle_type, discount
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """, (
                    pid, p_name, category, subcategory, price, stock, cost, unit,
                    hsn_code, is_packaged, is_branded, bundle_type, discount
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
                    "discount": discount
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
                           COALESCE(discount, 0.0) AS discount
                    FROM Products WHERE product_id = %s FOR UPDATE
                """, (pid,))
                prod = cur.fetchone()
                if not prod:
                    conn.rollback()
                    return jsonify({"success": False, "message": f"Product #{pid} not found in catalog."}), 400

                p_name, category, price, stock_qty, raw_unit, raw_subcat, raw_hsn, raw_pkg, raw_brd, raw_bundle, discount = prod
                unit = get_product_unit(category, p_name, explicit_unit=raw_unit, subcategory=raw_subcat)

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

                # Apply Discount & GST Calculation Rule:
                # Discounted price = price - (price * discount / 100)
                # GST amount = discounted price * GST rate
                # Line total = (discounted price + GST) * quantity
                item_discount = float(item.get("discount") if item.get("discount") is not None else (discount or 0.0))
                calc = calculate_discount_and_gst(price, item_discount, gst_rate, qty)

                item_subtotal = calc["line_subtotal"]
                item_gst = calc["line_gst"]
                item_final = calc["line_total"]

                # Insert Sale record
                cur.execute(
                    "INSERT INTO Sales (product_id, customer_id, Date, quantity, total_amount, gst_amount) VALUES (%s, %s, NOW(), %s, %s, %s)",
                    (pid, customer_id, qty, int(item_subtotal), int(item_gst))
                )
                sale_id = cur.lastrowid
                created_sale_ids.append(sale_id)

                # Deduct stock
                cur.execute("UPDATE Products SET stock_quantity = stock_quantity - %s WHERE product_id = %s", (qty, pid))

                bill_items.append({
                    "id": pid,
                    "product_id": pid,
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


if __name__ == "__main__":
    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", "5000"))
    debug = os.getenv("FLASK_ENV", "development") == "development"
    print(f"Starting RetailSphere API on http://{host}:{port}")
    app.run(host=host, port=port, debug=debug)

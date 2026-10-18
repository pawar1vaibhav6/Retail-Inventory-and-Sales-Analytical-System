import datetime
import os
from functools import wraps
from flask import (
    Flask, render_template, request, redirect, url_for, session, flash, jsonify
)
import db
from db import verify_user, register_user, get_connection

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY", "retail-inventory-analytical-system-secret-key-2026")

# GST category definitions matching existing logic
GST_RATES = {
    "0": ["Fruits", "Vegetables", "Milk", "Pulses", "Stationery", "Grocery"],
    "10": ["Package Food", "Oil Products", "Dry Fruits", "Spices", "tea", "coffee", "Sports", "PersonalCare"],
    "18": ["Electronics", "Furniture", "Fashion", "Accessories"]
}


def get_gst_rate(category):
    for rate_str, cats in GST_RATES.items():
        if any(c.lower() == (category or "").lower() for c in cats):
            rate = float(rate_str) / 100.0
            return rate, rate / 2.0, rate / 2.0
    return 0.0, 0.0, 0.0


def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if "user_id" not in session:
            flash("Please sign in to access this page.", "warning")
            return redirect(url_for("login", next=request.url))
        return f(*args, **kwargs)
    return decorated_function


def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if session.get("role") != "admin":
            flash("Access denied. Admin privileges required.", "danger")
            return redirect(url_for("dashboard"))
        return f(*args, **kwargs)
    return decorated_function


# -------------------------------------------------------------------------
# Authentication Routes
# -------------------------------------------------------------------------

@app.route("/")
def index():
    if "user_id" in session:
        return redirect(url_for("dashboard"))
    return redirect(url_for("login"))


@app.route("/login", methods=["GET", "POST"])
def login():
    if "user_id" in session:
        return redirect(url_for("dashboard"))

    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "").strip()

        if not username or not password:
            flash("Please enter both username and password.", "danger")
            return render_template("login.html", username=username)

        user = verify_user(username, password)
        if user:
            session["user_id"] = user["user_id"]
            session["username"] = user["username"]
            session["role"] = user["role"]
            flash(f"Welcome back, {user['username']}! Logged in as {user['role'].capitalize()}.", "success")
            next_page = request.args.get("next")
            return redirect(next_page or url_for("dashboard"))
        else:
            flash("Invalid username or password. Please try again.", "danger")
            return render_template("login.html", username=username)

    return render_template("login.html")


@app.route("/api/login", methods=["POST"])
def api_login():
    """Dynamic AJAX Login endpoint."""
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
            "message": f"Welcome, {user['username']}!",
            "role": user["role"],
            "redirect": url_for("dashboard")
        })
    return jsonify({"success": False, "message": "Invalid username or password."}), 401


@app.route("/register", methods=["GET", "POST"])
def register():
    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "").strip()
        confirm_password = request.form.get("confirm_password", "").strip()
        role = request.form.get("role", "cashier").strip().lower()

        if not username or not password or not confirm_password:
            flash("All fields are required.", "danger")
            return render_template("register.html", username=username, role=role)

        if len(password) < 4:
            flash("Password must be at least 4 characters long.", "danger")
            return render_template("register.html", username=username, role=role)

        if password != confirm_password:
            flash("Passwords do not match.", "danger")
            return render_template("register.html", username=username, role=role)

        success, msg = register_user(username, password, role)
        if success:
            flash(f"Account for '{username}' created successfully! You can now log in.", "success")
            return redirect(url_for("login"))
        else:
            flash(msg, "danger")
            return render_template("register.html", username=username, role=role)

    return render_template("register.html")


@app.route("/logout")
def logout():
    uname = session.get("username", "User")
    session.clear()
    flash(f"You have been successfully logged out, {uname}.", "info")
    return redirect(url_for("login"))


# -------------------------------------------------------------------------
# Dashboard
# -------------------------------------------------------------------------

@app.route("/dashboard")
@login_required
def dashboard():
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
            stats["total_sales_amount"] = sales_row[1]

            cur.execute("SELECT COALESCE(SUM(price * stock_quantity), 0) FROM Products")
            stats["inventory_value"] = cur.fetchone()[0]

            cur.execute("SELECT product_id, p_name, category, price, stock_quantity FROM Products WHERE stock_quantity < 5 ORDER BY stock_quantity ASC")
            stats["low_stock_items"] = cur.fetchall()
            stats["low_stock_count"] = len(stats["low_stock_items"])

            cur.execute("""
                SELECT s.sales_id, p.p_name, s.quantity, s.total_amount, s.gst_amount, s.Date 
                FROM Sales s 
                LEFT JOIN Products p ON s.product_id = p.product_id 
                ORDER BY s.sales_id DESC LIMIT 5
            """)
            stats["recent_sales"] = cur.fetchall()
    except Exception as e:
        flash(f"Error fetching dashboard statistics: {e}", "warning")
    finally:
        conn.close()

    return render_template("dashboard.html", user=session, stats=stats)


# -------------------------------------------------------------------------
# POS / Billing Module
# -------------------------------------------------------------------------

@app.route("/pos")
@login_required
def pos():
    conn = get_connection()
    products = []
    customers = []
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT product_id, p_name, category, price, stock_quantity FROM Products ORDER BY p_name ASC")
            products = cur.fetchall()

            cur.execute("SELECT customer_id, c_name, email, region FROM Customers ORDER BY c_name ASC")
            customers = cur.fetchall()
    finally:
        conn.close()

    return render_template("pos.html", products=products, customers=customers)


@app.route("/api/pos/checkout", methods=["POST"])
@login_required
def pos_checkout():
    data = request.get_json(silent=True) or {}
    customer_id = data.get("customer_id")
    items = data.get("items", [])  # list of {product_id, quantity}

    if not customer_id or not items:
        return jsonify({"success": False, "message": "Customer and at least one item are required."}), 400

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            # Check customer
            cur.execute("SELECT customer_id, c_name, email, region FROM Customers WHERE customer_id = %s", (customer_id,))
            customer = cur.fetchone()
            if not customer:
                return jsonify({"success": False, "message": f"Customer ID #{customer_id} does not exist."}), 400

            bill_items = []
            total_bill_amount = 0
            total_gst_amount = 0
            created_sale_ids = []
            bill_date = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

            for item in items:
                pid = int(item.get("product_id"))
                qty = int(item.get("quantity"))

                if qty <= 0:
                    continue

                cur.execute("SELECT p_name, category, price, stock_quantity FROM Products WHERE product_id = %s FOR UPDATE", (pid,))
                prod = cur.fetchone()
                if not prod:
                    conn.rollback()
                    return jsonify({"success": False, "message": f"Product #{pid} not found."}), 400

                p_name, category, price, stock_qty = prod
                if qty > stock_qty:
                    conn.rollback()
                    return jsonify({
                        "success": False, 
                        "message": f"Not enough stock for '{p_name}'. Available: {stock_qty}, Requested: {qty}"
                    }), 400

                # Compute GST
                gst_rate, cgst_rate, sgst_rate = get_gst_rate(category)
                item_subtotal = price * qty
                item_gst = int(item_subtotal * gst_rate)
                item_final = item_subtotal + item_gst

                # Insert Sale record
                cur.execute(
                    "INSERT INTO Sales (product_id, customer_id, Date, quantity, total_amount, gst_amount) VALUES (%s, %s, NOW(), %s, %s, %s)",
                    (pid, customer_id, qty, item_subtotal, item_gst)
                )
                sale_id = cur.lastrowid
                created_sale_ids.append(sale_id)

                # Deduct stock
                cur.execute("UPDATE Products SET stock_quantity = stock_quantity - %s WHERE product_id = %s", (qty, pid))

                bill_items.append({
                    "product_id": pid,
                    "name": p_name,
                    "category": category,
                    "price": price,
                    "quantity": qty,
                    "subtotal": item_subtotal,
                    "gst_rate": int(gst_rate * 100),
                    "gst_amount": item_gst,
                    "cgst_amount": round(item_gst / 2.0, 2),
                    "sgst_amount": round(item_gst / 2.0, 2),
                    "final_amount": item_final
                })

                total_bill_amount += item_final
                total_gst_amount += item_gst

            conn.commit()

            return jsonify({
                "success": True,
                "message": "Sale transaction completed successfully.",
                "invoice": {
                    "bill_no": created_sale_ids[0] if created_sale_ids else "N/A",
                    "sale_ids": created_sale_ids,
                    "bill_date": bill_date,
                    "customer": {
                        "id": customer[0],
                        "name": customer[1],
                        "email": customer[2],
                        "region": customer[3]
                    },
                    "items": bill_items,
                    "total_amount": total_bill_amount,
                    "total_gst": total_gst_amount,
                    "subtotal": total_bill_amount - total_gst_amount
                }
            })
    except Exception as e:
        conn.rollback()
        return jsonify({"success": False, "message": f"Transaction failed: {e}"}), 500
    finally:
        conn.close()


# -------------------------------------------------------------------------
# Products & Inventory Management
# -------------------------------------------------------------------------

@app.route("/products")
@login_required
def products():
    search = request.args.get("search", "").strip()
    category = request.args.get("category", "").strip()

    conn = get_connection()
    products_list = []
    categories = []
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT DISTINCT category FROM Products WHERE category IS NOT NULL AND category != '' ORDER BY category")
            categories = [r[0] for r in cur.fetchall()]

            query = "SELECT product_id, p_name, category, price, stock_quantity, cost FROM Products WHERE 1=1"
            params = []

            if search:
                query += " AND (p_name LIKE %s OR product_id LIKE %s)"
                params.extend([f"%{search}%", f"%{search}%"])

            if category:
                query += " AND category = %s"
                params.append(category)

            query += " ORDER BY product_id ASC"
            cur.execute(query, params)
            products_list = cur.fetchall()
    finally:
        conn.close()

    return render_template("products.html", products=products_list, categories=categories, search=search, selected_category=category)


@app.route("/products/add", methods=["POST"])
@login_required
@admin_required
def product_add():
    try:
        pid = int(request.form.get("product_id"))
        p_name = request.form.get("p_name", "").strip()
        category = request.form.get("category", "").strip()
        price = int(request.form.get("price"))
        stock = int(request.form.get("stock_quantity"))
        cost = int(request.form.get("cost"))

        conn = get_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO Products (product_id, p_name, category, price, stock_quantity, cost) VALUES (%s, %s, %s, %s, %s, %s)",
                    (pid, p_name, category, price, stock, cost)
                )
                conn.commit()
                flash(f"Product '{p_name}' (#{pid}) added successfully.", "success")
        except pymysql.err.IntegrityError:
            conn.rollback()
            flash(f"Product ID #{pid} already exists. Please choose a different ID.", "danger")
        finally:
            conn.close()
    except Exception as e:
        flash(f"Failed to add product: {e}", "danger")

    return redirect(url_for("products"))


@app.route("/products/update-price", methods=["POST"])
@login_required
@admin_required
def product_update_price():
    try:
        pid = int(request.form.get("product_id"))
        new_price = int(request.form.get("new_price"))

        conn = get_connection()
        try:
            with conn.cursor() as cur:
                cur.execute("UPDATE Products SET price = %s WHERE product_id = %s", (new_price, pid))
                conn.commit()
                if cur.rowcount > 0:
                    flash(f"Updated price for Product #{pid} to ₹{new_price}.", "success")
                else:
                    flash(f"Product #{pid} not found.", "warning")
        finally:
            conn.close()
    except Exception as e:
        flash(f"Failed to update price: {e}", "danger")

    return redirect(url_for("products"))


@app.route("/products/restock", methods=["POST"])
@login_required
@admin_required
def product_restock():
    try:
        pid = int(request.form.get("product_id"))
        added_stock = int(request.form.get("added_stock"))

        if added_stock <= 0:
            flash("Added stock must be greater than zero.", "warning")
            return redirect(url_for("products"))

        conn = get_connection()
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT cost, p_name FROM Products WHERE product_id = %s", (pid,))
                row = cur.fetchone()
                if not row:
                    flash(f"Product #{pid} not found.", "danger")
                    return redirect(url_for("products"))

                cost, p_name = row
                total_restock_cost = cost * added_stock

                cur.execute("UPDATE Products SET stock_quantity = stock_quantity + %s WHERE product_id = %s", (added_stock, pid))
                cur.execute(
                    "INSERT INTO stock (product_id, Restock_date, Added_stock, total_cost) VALUES (%s, NOW(), %s, %s)",
                    (pid, added_stock, total_restock_cost)
                )
                conn.commit()
                flash(f"Restocked {added_stock} units for '{p_name}'. Replenishment cost: ₹{total_restock_cost}.", "success")
        finally:
            conn.close()
    except Exception as e:
        flash(f"Failed to restock product: {e}", "danger")

    return redirect(url_for("products"))


# -------------------------------------------------------------------------
# Customers Module
# -------------------------------------------------------------------------

@app.route("/customers")
@login_required
def customers():
    search = request.args.get("search", "").strip()
    conn = get_connection()
    customers_list = []
    try:
        with conn.cursor() as cur:
            query = "SELECT customer_id, c_name, email, region FROM Customers WHERE 1=1"
            params = []
            if search:
                query += " AND (c_name LIKE %s OR email LIKE %s OR region LIKE %s OR customer_id LIKE %s)"
                params.extend([f"%{search}%", f"%{search}%", f"%{search}%", f"%{search}%"])
            query += " ORDER BY customer_id ASC"
            cur.execute(query, params)
            customers_list = cur.fetchall()
    finally:
        conn.close()

    return render_template("customers.html", customers=customers_list, search=search)


@app.route("/customers/add", methods=["POST"])
@login_required
def customer_add():
    try:
        cid = int(request.form.get("customer_id"))
        c_name = request.form.get("c_name", "").strip()
        email = request.form.get("email", "").strip()
        region = request.form.get("region", "").strip()

        if not c_name or not email or not region:
            flash("All fields are required.", "danger")
            return redirect(url_for("customers"))

        conn = get_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO Customers (customer_id, c_name, email, region) VALUES (%s, %s, %s, %s)",
                    (cid, c_name, email, region)
                )
                conn.commit()
                flash(f"Customer '{c_name}' (#{cid}) registered successfully.", "success")
        except pymysql.err.IntegrityError:
            conn.rollback()
            flash("Customer with this ID or Email already exists.", "danger")
        finally:
            conn.close()
    except Exception as e:
        flash(f"Failed to add customer: {e}", "danger")

    return redirect(url_for("customers"))


# -------------------------------------------------------------------------
# Analytics & Reports (Admin)
# -------------------------------------------------------------------------

@app.route("/analytics")
@login_required
@admin_required
def analytics():
    current_year = datetime.datetime.now().year
    selected_year = request.args.get("year", type=int) or current_year

    conn = get_connection()
    data = {
        "year": selected_year,
        "available_years": [],
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
            # Available years in Sales
            cur.execute("SELECT DISTINCT YEAR(Date) FROM Sales ORDER BY YEAR(Date) DESC")
            years_found = [r[0] for r in cur.fetchall() if r[0]]
            data["available_years"] = years_found if years_found else [current_year]

            # 1. Low stock
            cur.execute("SELECT product_id, p_name, category, price, stock_quantity FROM Products WHERE stock_quantity < 5 ORDER BY stock_quantity ASC")
            data["low_stock"] = cur.fetchall()

            # 2. Monthly sales
            cur.execute("""
                SELECT MONTH(s.Date) AS MonthNo, MONTHNAME(s.Date) AS Month, 
                       SUM(s.total_amount) AS Revenue, 
                       SUM(p.cost * s.quantity) AS Cost, 
                       SUM(s.total_amount - (p.cost * s.quantity)) AS Profit 
                FROM Sales s 
                JOIN Products p ON s.product_id = p.product_id 
                WHERE YEAR(s.Date) = %s 
                GROUP BY MONTH(s.Date), MONTHNAME(s.Date) 
                ORDER BY MonthNo
            """, (selected_year,))
            data["monthly_sales"] = cur.fetchall()

            # 3. Daily sales
            cur.execute("""
                SELECT CAST(s.Date AS DATE) AS SaleDate, 
                       SUM(s.total_amount) AS Revenue, 
                       SUM(p.cost * s.quantity) AS Cost, 
                       SUM(s.total_amount - (p.cost * s.quantity)) AS Profit 
                FROM Sales s 
                JOIN Products p ON s.product_id = p.product_id 
                GROUP BY CAST(s.Date AS DATE) 
                ORDER BY SaleDate DESC LIMIT 15
            """)
            data["daily_sales"] = cur.fetchall()

            # 4. Weekly sales
            cur.execute("""
                SELECT WEEK(s.Date) AS WeekNo, 
                       SUM(s.total_amount) AS Revenue, 
                       SUM(p.cost * s.quantity) AS Cost, 
                       SUM(s.total_amount - (p.cost * s.quantity)) AS Profit 
                FROM Sales s 
                JOIN Products p ON s.product_id = p.product_id 
                WHERE YEAR(s.Date) = %s 
                GROUP BY WEEK(s.Date) 
                ORDER BY WeekNo ASC
            """, (selected_year,))
            data["weekly_sales"] = cur.fetchall()

            # 5. Category sales
            cur.execute("""
                SELECT p.category, 
                       SUM(s.total_amount) AS Revenue, 
                       SUM(p.cost * s.quantity) AS Cost, 
                       SUM(s.total_amount - (p.cost * s.quantity)) AS Profit 
                FROM Sales s 
                JOIN Products p ON s.product_id = p.product_id 
                GROUP BY p.category 
                ORDER BY Revenue DESC
            """)
            data["category_sales"] = cur.fetchall()

            # 6. Product sales
            cur.execute("""
                SELECT p.p_name, 
                       SUM(s.quantity) AS TotalQty, 
                       SUM(s.total_amount) AS Revenue, 
                       SUM(s.total_amount - (p.cost * s.quantity)) AS Profit 
                FROM Sales s 
                JOIN Products p ON s.product_id = p.product_id 
                GROUP BY p.p_name 
                ORDER BY Revenue DESC LIMIT 10
            """)
            data["product_sales"] = cur.fetchall()

            # 7. Monthly GST
            cur.execute("""
                SELECT MONTHNAME(Date) AS Month, SUM(gst_amount) AS TotalGst 
                FROM Sales 
                WHERE YEAR(Date) = %s 
                GROUP BY MONTH(Date), MONTHNAME(Date) 
                ORDER BY MONTH(Date) ASC
            """, (selected_year,))
            data["monthly_gst"] = cur.fetchall()

            # 8. Inventory Value
            cur.execute("SELECT COALESCE(SUM(price * stock_quantity), 0) FROM Products")
            data["inventory_value"] = cur.fetchone()[0]
    finally:
        conn.close()

    return render_template("analytics.html", data=data)


# -------------------------------------------------------------------------
# Interactive Charts (Admin)
# -------------------------------------------------------------------------

@app.route("/charts")
@login_required
@admin_required
def charts():
    current_year = datetime.datetime.now().year
    selected_year = request.args.get("year", type=int) or current_year

    conn = get_connection()
    available_years = [current_year]
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT DISTINCT YEAR(Date) FROM Sales ORDER BY YEAR(Date) DESC")
            rows = [r[0] for r in cur.fetchall() if r[0]]
            if rows:
                available_years = rows
    finally:
        conn.close()

    return render_template("charts.html", selected_year=selected_year, available_years=available_years)


@app.route("/api/chart-data")
@login_required
@admin_required
def api_chart_data():
    year = request.args.get("year", type=int) or datetime.datetime.now().year
    conn = get_connection()
    result = {
        "monthly": {"labels": [], "revenue": [], "cost": [], "profit": []},
        "category": {"labels": [], "revenue": []},
        "daily": {"labels": [], "sales": []},
        "weekly": {"labels": [], "sales": []}
    }
    try:
        with conn.cursor() as cur:
            # Monthly
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
                result["monthly"]["labels"].append(r[0])
                result["monthly"]["revenue"].append(float(r[1]))
                result["monthly"]["cost"].append(float(r[2]))
                result["monthly"]["profit"].append(float(r[3]))

            # Category
            cur.execute("""
                SELECT p.category, COALESCE(SUM(s.total_amount), 0) AS Revenue 
                FROM Sales s 
                JOIN Products p ON s.product_id = p.product_id 
                GROUP BY p.category 
                ORDER BY Revenue DESC
            """)
            for r in cur.fetchall():
                result["category"]["labels"].append(r[0])
                result["category"]["revenue"].append(float(r[1]))

            # Daily (recent 14 days)
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

            # Weekly
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
    app.run(debug=True, host="127.0.0.1", port=5000)

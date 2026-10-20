import pandas as pd
from db import conn, cursor, get_product_unit, normalize_subcategory
try:
    from gst_classifier import validate_discount_value
except ImportError:
    def validate_discount_value(discount):
        if discount is None or discount == "":
            return 0.0
        val = float(discount)
        if val < 0 or val > 100:
            raise ValueError(f"Discount must be between 0 and 100 (got {val}).")
        return round(val, 2)


def new_product():
    pid = int(input("Product Id:"))
    p_name = input("Product Name:")
    category = input("Product Category:")
    subcat_input = input("Product Subcategory (Packing/Open) [Packing]: ").strip()
    subcategory = normalize_subcategory(subcat_input)

    default_unit = get_product_unit(category, p_name, subcategory=subcategory)
    unit_input = input(f"Unit of measurement (e.g. L, kg, pcs) [{default_unit}]: ").strip()
    unit = get_product_unit(category, p_name, explicit_unit=unit_input, subcategory=subcategory)

    price = int(input(f"Product Price (per {unit}):"))
    
    # Discount input with validation (0-100%, default 0)
    disc_input = input("Product Discount % [0]: ").strip()
    try:
        discount = validate_discount_value(disc_input if disc_input else 0)
    except ValueError as err:
        print(f"Invalid discount: {err}")
        return

    stock = int(input(f"Product Stock (in {unit}):"))
    cost = int(input(f"Product Cost (per {unit}):"))
    try:
        query = """INSERT INTO Products 
                   (product_id, p_name, category, subcategory, price, stock_quantity, cost, unit, discount) 
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)"""
        cursor.execute(query, (pid, p_name, category, subcategory, price, stock, cost, unit, discount))
        conn.commit()
        print(f"Product Added successfully: [{subcategory}] with unit '{unit}', Discount: {discount}%")
    except Exception as e:
        conn.rollback()
        print("Failed to add product (or Product Already Exists):", e)


def check_product(prompt, result):
    query = f"""SELECT product_id, p_name, category, COALESCE(subcategory, 'Packing'), 
                       price, stock_quantity, COALESCE(unit, 'pcs'), COALESCE(discount, 0.0) 
                FROM Products WHERE {prompt} = %s"""
    cursor.execute(query, (result,))
    rows = cursor.fetchall()
    if len(rows) >= 1:
        product = []
        for row in rows:
            u = get_product_unit(row[2], row[1], explicit_unit=row[6], subcategory=row[3])
            product.append({
                "Product Id": row[0],
                "Product": row[1],
                "Category": row[2],
                "Subcategory": row[3],
                "Price": f"Rs. {row[4]} / {u}",
                "Discount": f"{row[7]}%",
                "Stock": f"{row[5]} {u}"
            })

        df = pd.DataFrame(product)
        print(df)
    else:
        print(f"Product with {result} not found.")


def set_discount(pid=None, discount=None):
    """
    Sets or updates discount percentage for a product.
    Validates input: 0-100%, numeric only.
    """
    if pid is None:
        pid = int(input("Product Id:"))
    if discount is None:
        disc_input = input("New Discount % (0-100): ").strip()
        discount = validate_discount_value(disc_input)
    else:
        discount = validate_discount_value(discount)

    query = "UPDATE Products SET discount = %s WHERE product_id = %s"
    cursor.execute(query, (discount, pid))
    conn.commit()
    if cursor.rowcount > 0:
        print(f"Successfully Updated discount to {discount}% for Product #{pid}")
        return True
    else:
        print(f"No product with {pid} exists")
        return False


def price_increase():
    pid = int(input("Product Id:"))
    new_price = int(input("New Price:"))
    query = "UPDATE Products SET price = %s WHERE product_id = %s"
    cursor.execute(query, (new_price, pid))
    
    # Optionally update discount during price edit
    disc_input = input("New Discount % (press Enter to keep unchanged): ").strip()
    if disc_input:
        try:
            new_discount = validate_discount_value(disc_input)
            cursor.execute("UPDATE Products SET discount = %s WHERE product_id = %s", (new_discount, pid))
        except ValueError as err:
            print(f"Warning: {err}. Discount left unchanged.")

    conn.commit()
    if cursor.rowcount > 0:
        print("Successfully Updated price")
    else:
        print(f"No product with {pid} exists")


def stock_increase():
    """
    Replenishes product warehouse stock.
    Allows setting/updating discount during restock.
    If user doesn't supply a discount, existing discount remains unchanged.
    Quantity update logic remains exactly as before.
    """
    pid = int(input("Product Id:"))
    try:
        q = """SELECT cost, p_name, category, COALESCE(unit, 'pcs'), 
                      COALESCE(subcategory, 'Packing'), COALESCE(discount, 0.0) 
               FROM Products WHERE product_id = %s"""
        cursor.execute(q, (pid,))
        row = cursor.fetchone()
        if not row:
            print("Product not found")
            return
        cost, p_name, cat, raw_unit, raw_subcat, cur_discount = row
        unit = get_product_unit(cat, p_name, explicit_unit=raw_unit, subcategory=raw_subcat)

        added_stock = int(input(f"Added Quantity (in {unit}):"))
        if added_stock <= 0:
            print("Quantity must be greater than zero.")
            return

        # Optional discount update during restock
        disc_input = input(f"New Discount % (press Enter to keep current {cur_discount}%): ").strip()
        if disc_input != "":
            try:
                new_discount = validate_discount_value(disc_input)
                cursor.execute("UPDATE Products SET discount = %s WHERE product_id = %s", (new_discount, pid))
                print(f"Discount updated to {new_discount}%")
            except ValueError as err:
                print(f"Invalid discount: {err}. Keeping current discount ({cur_discount}%).")

        # Quantity update logic remains exactly unchanged
        query = "UPDATE Products SET stock_quantity = stock_quantity + %s WHERE product_id = %s"
        cursor.execute(query, (added_stock, pid))
        query1 = "INSERT INTO stock (product_id, Restock_date, Added_stock, total_cost) VALUES (%s, NOW(), %s, %s)"
        cursor.execute(query1, (pid, added_stock, cost * added_stock))
        conn.commit()
        print(f"Stock Updated Successfully (+{added_stock} {unit} for '{p_name}' [{raw_subcat}])")
    except Exception as e:
        conn.rollback()
        print("Failed to update stock:", e)

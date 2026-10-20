import pandas as pd
from db import conn, cursor, get_product_unit, normalize_subcategory


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
    stock = int(input(f"Product Stock (in {unit}):"))
    cost = int(input(f"Product Cost (per {unit}):"))
    try:
        query = "INSERT INTO Products (product_id, p_name, category, subcategory, price, stock_quantity, cost, unit) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)"
        cursor.execute(query, (pid, p_name, category, subcategory, price, stock, cost, unit))
        conn.commit()
        print(f"Product Added successfully: [{subcategory}] with unit '{unit}'")
    except Exception as e:
        conn.rollback()
        print("Failed to add product (or Product Already Exists):", e)


def check_product(prompt, result):
    query = f"SELECT product_id, p_name, category, COALESCE(subcategory, 'Packing'), price, stock_quantity, COALESCE(unit, 'pcs') FROM Products WHERE {prompt} = %s"
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
                "Stock": f"{row[5]} {u}"
            })

        df = pd.DataFrame(product)
        print(df)
    else:
        print(f"Product with {result} not found.")


def price_increase():
    pid = int(input("Product Id:"))
    new_price = int(input("New Price:"))
    query = "UPDATE Products SET price = %s WHERE product_id = %s"
    cursor.execute(query, (new_price, pid))
    conn.commit()
    if cursor.rowcount > 0:
        print("Successfully Updated price")
    else:
        print(f"No product with {pid} exists")


def stock_increase():
    pid = int(input("Product Id:"))
    try:
        q = "SELECT cost, p_name, category, COALESCE(unit, 'pcs'), COALESCE(subcategory, 'Packing') FROM Products WHERE product_id = %s"
        cursor.execute(q, (pid,))
        row = cursor.fetchone()
        if not row:
            print("Product not found")
            return
        cost, p_name, cat, raw_unit, raw_subcat = row
        unit = get_product_unit(cat, p_name, explicit_unit=raw_unit, subcategory=raw_subcat)

        added_stock = int(input(f"Added Quantity (in {unit}):"))
        if added_stock <= 0:
            print("Quantity must be greater than zero.")
            return

        query = "UPDATE Products SET stock_quantity = stock_quantity + %s WHERE product_id = %s"
        cursor.execute(query, (added_stock, pid))
        query1 = "INSERT INTO stock (product_id, Restock_date, Added_stock, total_cost) VALUES (%s, NOW(), %s, %s)"
        cursor.execute(query1, (pid, added_stock, cost * added_stock))
        conn.commit()
        print(f"Stock Updated Successfully (+{added_stock} {unit} for '{p_name}' [{raw_subcat}])")
    except Exception as e:
        conn.rollback()
        print("Failed to update stock:", e)

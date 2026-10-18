import pandas as pd
from db import conn, cursor


def new_product():
    pid = int(input("Product Id:"))
    p_name = input("Product Name:")
    category = input("Product Category:")
    price = int(input("Product Price:"))
    stock = int(input("Product Stock:"))
    cost = int(input("Product Cost:"))
    try:
        query = "INSERT INTO Products (product_id, p_name, category, price, stock_quantity, cost) VALUES (%s, %s, %s, %s, %s, %s)"
        cursor.execute(query, (pid, p_name, category, price, stock, cost))
        conn.commit()
        print("Product Added successfully")
    except Exception:
        conn.rollback()
        print("Product Already Exists")


def check_product(prompt, result):
    query = f"SELECT product_id, p_name, category, price, stock_quantity FROM Products WHERE {prompt} = %s"
    cursor.execute(query, (result,))
    rows = cursor.fetchall()
    if len(rows) >= 1:
        product = []
        for row in rows:
            product.append({
                "Product Id": row[0],
                "Product": row[1],
                "Category": row[2],
                "Price": row[3],
                "Stock": row[4]
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
    added_stock = int(input("Added Quantity:"))
    try:
        q = "SELECT cost FROM Products WHERE product_id = %s"
        cursor.execute(q, (pid,))
        row = cursor.fetchone()
        if not row:
            print("Product not found")
            return
        cost = row[0]
        query = "UPDATE Products SET stock_quantity = stock_quantity + %s WHERE product_id = %s"
        cursor.execute(query, (added_stock, pid))
        query1 = "INSERT INTO stock (product_id, Restock_date, Added_stock, total_cost) VALUES (%s, NOW(), %s, %s)"
        cursor.execute(query1, (pid, added_stock, cost * added_stock))
        conn.commit()
        print("Stock Updated Successfully")
    except Exception as e:
        conn.rollback()
        print("Failed to update stock:", e)

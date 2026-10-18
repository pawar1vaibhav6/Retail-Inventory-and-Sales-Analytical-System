import pandas as pd
from db import conn, cursor, get_product_unit


def sale(customer_id, total_amount, bill_items):
    product_id = int(input("Product_id:"))
    gst_0 = ["Fruits", "Vegetables", "Milk", "Pulses", "Stationery", "Grocery", "Groceries"]
    gst_5 = ["Package Food", "Oil Products", "Dry Fruits", "Spices", "tea", "coffee", "Sports", "PersonalCare", "Personal Care", "Snacks", "Beverages", "Home Care"]
    gst_18 = ["Electronics", "Furniture", "Fashion", "Accessories"]

    q = "SELECT stock_quantity, price, category, p_name, COALESCE(unit, 'pcs'), COALESCE(subcategory, 'Packing') FROM Products WHERE product_id = %s"
    cursor.execute(q, (product_id,))
    row = cursor.fetchone()
    if not row:
        print("Product not found")
        return total_amount, None, None, None

    stock, price, cat, p_name, raw_unit, raw_subcat = row
    unit = get_product_unit(cat, p_name, explicit_unit=raw_unit, subcategory=raw_subcat)

    quantity = int(input(f"Quantity (in {unit}) [{raw_subcat}]:"))
    amount = quantity * price

    if cat in gst_0:
        cgst = 0
        sgst = 0
        gst = 0
    elif cat in gst_5:
        cgst = 0.05
        sgst = 0.05
        gst = 0.1
    elif cat in gst_18:
        cgst = 0.09
        sgst = 0.09
        gst = 0.18
    else:
        cgst = 0
        sgst = 0
        gst = 0

    if quantity > stock:
        print(f"Not Enough Stock. Available warehouse stock: {stock} {unit}")
        return total_amount, None, None, None
    else:
        try:
            query = "INSERT INTO Sales (product_id, customer_id, Date, quantity, total_amount, gst_amount) VALUES (%s, %s, NOW(), %s, %s, %s)"
            cursor.execute(query, (product_id, customer_id, quantity, amount, int(amount * gst)))
            sale_id = cursor.lastrowid

            query1 = "UPDATE Products SET stock_quantity = stock_quantity - %s WHERE product_id = %s"
            cursor.execute(query1, (quantity, product_id))
            conn.commit()

            if sale_id:
                query2 = """SELECT s.product_id, p.p_name, p.price, s.total_amount, s.sales_id, s.Date
                            FROM Products p JOIN Sales s ON p.product_id = s.product_id 
                            WHERE s.sales_id = %s"""
                cursor.execute(query2, (sale_id,))
            else:
                query2 = """SELECT s.product_id, p.p_name, p.price, s.total_amount, s.sales_id, s.Date
                            FROM Products p JOIN Sales s ON p.product_id = s.product_id 
                            WHERE s.product_id = %s AND s.customer_id = %s AND s.quantity = %s AND TIMESTAMPDIFF(MINUTE, s.Date, NOW()) <= 10
                            ORDER BY s.sales_id DESC LIMIT 1"""
                cursor.execute(query2, (product_id, customer_id, quantity))

            row = cursor.fetchone()

            bill_items.append({
                "Product Id": product_id,
                "Product": row[1],
                "Type": raw_subcat,
                "Price": f"Rs. {row[2]}/{unit}",
                "Quantity": f"{quantity} {unit}",
                "Total": row[3],
                "CGST": cgst,
                "SGSt": sgst,
                "GST_Total": row[3] * gst,
                "Final Amount": row[3] + row[3] * gst
            })
            df = pd.DataFrame(bill_items)
            total_amount += amount + row[3] * gst
            return total_amount, df, row[4], row[5]
        except Exception as e:
            conn.rollback()
            print("Failed to complete sale transaction:", e)
            return total_amount, None, None, None


def bill_format(s_id, s_date, c_id, df, total):
    m = """\033[1;32m                       Tax Invoice  
    Bill No:{}
    Bill Date & Time:{}
    Customer Id:{}
    {}\n
    Total: Rs. {}\033[0m""".format(s_id, s_date, c_id, df, total)

    print(m)
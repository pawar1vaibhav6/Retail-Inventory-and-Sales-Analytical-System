import pandas as pd
from db import conn, cursor, get_product_unit
try:
    from gst_classifier import get_item_gst_details, calculate_discount_and_gst
except ImportError:
    get_item_gst_details = None
    def calculate_discount_and_gst(price, discount=0.0, gst_rate=0.0, qty=1):
        price_val = float(price)
        disc = float(discount or 0.0)
        disc_amt_unit = round(price_val * (disc / 100.0), 2)
        disc_price = round(price_val - disc_amt_unit, 2)
        gst_unit = round(disc_price * float(gst_rate), 2)
        return {
            "original_price": price_val,
            "discount_percent": disc,
            "discount_amount_unit": disc_amt_unit,
            "discount_amount_total": round(disc_amt_unit * qty, 2),
            "discounted_price": disc_price,
            "line_subtotal": round(disc_price * qty, 2),
            "line_gst": round(gst_unit * qty, 2),
            "line_total": round((disc_price + gst_unit) * qty, 2)
        }


def sale(customer_id, total_amount, bill_items):
    product_id = int(input("Product_id:"))
    gst_0 = ["Fruits", "Vegetables", "Milk", "Pulses", "Stationery", "Grocery", "Groceries"]
    gst_5 = ["Package Food", "Oil Products", "Dry Fruits", "Spices", "tea", "coffee", "Sports", "PersonalCare", "Personal Care", "Snacks", "Beverages", "Home Care"]
    gst_18 = ["Electronics", "Furniture", "Fashion", "Accessories"]

    # Retrieve product info including HSN, classification, and discount fields if available
    try:
        q = """SELECT stock_quantity, price, category, p_name, 
                      COALESCE(unit, 'pcs'), COALESCE(subcategory, 'Packing'),
                      COALESCE(hsn_code, ''), COALESCE(is_packaged, 1), 
                      COALESCE(is_branded, 1), COALESCE(bundle_type, ''),
                      COALESCE(discount, 0.0) 
               FROM Products WHERE product_id = %s"""
        cursor.execute(q, (product_id,))
        row = cursor.fetchone()
        if not row:
            print("Product not found")
            return total_amount, None, None, None
        stock, price, cat, p_name, raw_unit, raw_subcat, hsn_code, is_packaged, is_branded, bundle_type, discount = row
    except Exception:
        # Fallback query if columns don't exist yet
        q_legacy = "SELECT stock_quantity, price, category, p_name, COALESCE(unit, 'pcs'), COALESCE(subcategory, 'Packing') FROM Products WHERE product_id = %s"
        cursor.execute(q_legacy, (product_id,))
        row = cursor.fetchone()
        if not row:
            print("Product not found")
            return total_amount, None, None, None
        stock, price, cat, p_name, raw_unit, raw_subcat = row
        hsn_code, is_packaged, is_branded, bundle_type, discount = "", 1, 1, "", 0.0

    unit = get_product_unit(cat, p_name, explicit_unit=raw_unit, subcategory=raw_subcat)

    quantity = int(input(f"Quantity (in {unit}) [{raw_subcat}]:"))

    # GST calculation: prefer HSN / GIR classification engine; fallback to category
    hsn_display = hsn_code if hsn_code else "N/A"
    gst = 0
    cgst = 0
    sgst = 0

    if get_item_gst_details:
        try:
            raw_is_open = str(raw_subcat).strip().lower() in ("open", "loose")
            tax_info = get_item_gst_details({
                "id": product_id,
                "name": p_name,
                "category": cat,
                "subcategory": raw_subcat,
                "hsn_code": hsn_code if hsn_code else None,
                "is_packaged": False if raw_is_open else bool(is_packaged),
                "is_branded": False if raw_is_open else bool(is_branded),
                "bundle_type": bundle_type if bundle_type else None
            })
            gst = tax_info["gst_rate"]
            cgst = tax_info["cgst_rate"]
            sgst = tax_info["sgst_rate"]
            hsn_display = tax_info.get("hsn_code", hsn_code or "N/A")
        except Exception:
            gst = None

    if gst is None:
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
            # Discount & GST calculation rule:
            # Discounted price = price - (price * discount / 100)
            # GST amount = discounted price * GST rate
            # Line total = (discounted price + GST) * quantity
            calc = calculate_discount_and_gst(price, discount, gst, quantity)

            query = "INSERT INTO Sales (product_id, customer_id, Date, quantity, total_amount, gst_amount) VALUES (%s, %s, NOW(), %s, %s, %s)"
            cursor.execute(query, (product_id, customer_id, quantity, int(calc["line_subtotal"]), int(calc["line_gst"])))
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

            disc_str = f"{calc['discount_percent']}% (-Rs. {calc['discount_amount_unit']})" if calc["discount_percent"] > 0 else "0%"
            bill_items.append({
                "Product Id": product_id,
                "Product": row[1],
                "HSN": hsn_display,
                "Type": raw_subcat,
                "Original Price": f"Rs. {price}/{unit}",
                "Discount": disc_str,
                "Discounted Price": f"Rs. {calc['discounted_price']}/{unit}",
                "Quantity": f"{quantity} {unit}",
                "Subtotal": calc["line_subtotal"],
                "CGST": cgst,
                "SGST": sgst,
                "GST_Total": calc["line_gst"],
                "Line Total": calc["line_total"],
                # Legacy keys for backward-compatibility
                "Price": f"Rs. {price}/{unit}",
                "Total": calc["line_subtotal"],
                "Final Amount": calc["line_total"],
                "_discount_amount_total": calc["discount_amount_total"]
            })
            df = pd.DataFrame(bill_items)
            total_amount += calc["line_total"]
            return total_amount, df, row[4], row[5]
        except Exception as e:
            conn.rollback()
            print("Failed to complete sale transaction:", e)
            return total_amount, None, None, None


def bill_format(s_id, s_date, c_id, df, total):
    total_discount = 0.0
    if isinstance(df, pd.DataFrame) and "_discount_amount_total" in df.columns:
        total_discount = float(df["_discount_amount_total"].sum())

    # Create display dataframe excluding internal columns
    display_df = df.drop(columns=["_discount_amount_total"], errors="ignore") if isinstance(df, pd.DataFrame) else df

    m = """\033[1;32m                       Tax Invoice  
    Bill No:{}
    Bill Date & Time:{}
    Customer Id:{}
    {}\n
    Total Discount: Rs. {:.2f}
    Grand Total:    Rs. {:.2f}\033[0m""".format(s_id, s_date, c_id, display_df, total_discount, float(total))

    print(m)

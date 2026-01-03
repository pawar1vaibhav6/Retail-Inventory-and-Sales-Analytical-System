import pyodbc

conn = pyodbc.connect(
    "Driver={ODBC Driver 18 for SQL Server};"
    "Server=localhost;"
    "Database=sql_class;"
    "Trusted_Connection=yes;"
    "TrustServerCertificate=yes;"
)

cursor=conn.cursor()

def sale(customer_id,total_amount):
    product_id=int(input("Product_id:"))
    quantity=int(input("Quantity:"))

    q="Select stock_quantity,price from Products where Product_id=?"
    cursor.execute(q,(product_id,))
    row=cursor.fetchall()
    stock=row[0][0]
    price=row[0][1]
    amount=quantity*price

    if quantity>stock:
        print("Not Enough Stock")
    else:
        query="Insert into Sales values(?,?,getdate(),?,?)"
        cursor.execute(query,(product_id,customer_id,quantity,amount))
        total_amount+=amount

        query1="Update Products set Stock_quantity=Stock_quantity - ? where product_id=?"
        cursor.execute(query1,(quantity,product_id))
        conn.commit()
        return total_amount
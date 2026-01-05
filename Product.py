import pyodbc
import pandas as pd

conn = pyodbc.connect(
    "Driver={ODBC Driver 18 for SQL Server};"
    "Server=localhost;"
    "Database=sql_class;"
    "Trusted_Connection=yes;"
    "TrustServerCertificate=yes;"
)

cursor=conn.cursor()

def new_product():
    pid=int(input("Product Id:"))
    p_name=input("Product Name:")
    category=input("Product Category:")
    price=int(input("Product Price:"))
    stock=int(input("Product Stock:"))
    cost=int(input("Product Cost:"))
    try:
        query="insert into products values(?,?,?,?,?,?)"
        cursor.execute(query,(pid,p_name,category,price,stock,cost))
        conn.commit()
        print("Product Added successfully")
    except:
        print("Product Already Exists")

def check_product(prompt,result):
    query="Select * from Products where {}=?".format(prompt)
    cursor.execute(query,(result,))
    rows=cursor.fetchall()
    if len(rows)>=1:
        product=[]
        for row in rows:
            product.append({
                "Product Id":row[0],
                "Product":row[1],
                "Category":row[2],
                "Price":row[3],
                "Stock":row[4]
            })
        if len(product) == 1:
            df=pd.DataFrame(product)
            print(df)
        else:
            df=pd.DataFrame(product)
            print(df)
    else:
        print(f"Product with {result} not found.")

def price_increase():
    pid=int(input("Product Id:"))
    new_price=int(input("New Price:"))
    query="Update Products set price=? where product_id=?"
    cursor.execute(query,(new_price,pid))
    conn.commit()
    if cursor.rowcount>0:
        print("Successfully Updated price")
    else:
        print(f"No product with {pid} exists")

def stock_increase():
    pid=int(input("Product Id:"))
    added_stock=int(input("Added Quantity:"))
    try:
        q="select cost from products where product_id=?"
        cursor.execute(q,(pid,))
        cost=cursor.fetchone()[0]
        query="Update Products set stock_quantity=stock_quantity+? where product_id=?"
        cursor.execute(query,(added_stock,pid))
        query1="Insert into Stock values(?,getdate(),?,?)"
        cursor.execute(query1,(pid,added_stock,cost*added_stock))
        conn.commit()
        print("Stock Updated Successfully")
    except:
        conn.rollback()
    

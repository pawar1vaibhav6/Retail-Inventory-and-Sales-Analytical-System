import pyodbc

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
    try:
        query="insert into products values(?,?,?,?,?)"
        cursor.execute(query,(pid,p_name,category,price,stock))
        conn.commit()
        print("Product Added successfully")
    except:
        print("Product Already Exists")

def check_product(pid):
    try:
        query="Select * from Products where product_id=?"
        cursor.execute(query,(pid,))
        rows=cursor.fetchall()
        row=rows[0]
        product={
            "Product":row[1],
            "Category":row[2],
            "Price":row[3],
            "Stock":row[4]
        }
        print(product)
    except Exception as e:
        print(e)

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
    query="Update Products set stock_quantity=stock_quantity+? where product_id=?"
    cursor.execute(query,(added_stock,pid))
    conn.commit()
    if cursor.rowcount>0:
        print("Successfully Updated stock")
    else:
        print(f"No product with {pid} exists")

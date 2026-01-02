import pyodbc

conn = pyodbc.connect(
    "Driver={ODBC Driver 18 for SQL Server};"
    "Server=localhost;"
    "Database=sql_class;"
    "Trusted_Connection=yes;"
    "TrustServerCertificate=yes;"
)

cursor=conn.cursor()

def new_customers():
    customer_id=int(input("Id:"))
    c_name=input("Name:")
    email=input("EmailId:")
    region=input("Region:")
    try:
        query="Insert into Customers values (?,?,?,?)"
        cursor.execute(query,(customer_id,c_name,email,region))
        conn.commit()
        print("Successfully added new customer")
    except:
        print("Customer already Exists")

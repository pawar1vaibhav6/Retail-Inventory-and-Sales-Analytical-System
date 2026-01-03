import pyodbc
import pandas as pd
import warnings
warnings.filterwarnings("ignore", category=UserWarning)


conn = pyodbc.connect(
    "Driver={ODBC Driver 18 for SQL Server};"
    "Server=localhost;"
    "Database=sql_class;"
    "Trusted_Connection=yes;"
    "TrustServerCertificate=yes;"
)

cursor=conn.cursor()

def low_stock():
    query="""
    SELECT product_id, p_name, category, stock_quantity
    FROM Products
    WHERE stock_quantity < 5
    """
    df=pd.read_sql_query(query,conn)
    if df.empty:
        print("All products have sufficient stock")
    else:
        print("Low stock products:")
        print(df)

def monthly_sale():
    query="""Select datename(M,datepart(M,Date)) as Month,sum(total_amount) as Total_sales from Sales
                group by datepart(M,Date)"""
    
    df=pd.read_sql_query(query,conn)
    print(df)

def daily_sale():
    query="""select FORMAT(date,'dd-MM-yyyy') as [Date] ,sum(total_amount) as [Total Sales] from Sales
            group by FORMAT(date,'dd-MM-yyyy')"""
    
    df=pd.read_sql_query(query,conn)
    print(df)

def weekly_sale():
    query="""select datepart(wk,date) as [Week] ,sum(total_amount) as [Total Sales] from Sales
            group by datepart(wk,date)"""
    
    df=pd.read_sql_query(query,conn)
    print(df)

def category_sale():
    query="""select Category,sum(total_amount) as [Total Sales]
        from Products p join Sales s 
        on p.product_id=s.product_id
        group by category"""

    df=pd.read_sql_query(query,conn)
    print(df)

def product_sale():
    query="""select p_name,sum(total_amount) as [Total Sales]
        from Products p join Sales s 
        on p.product_id=s.product_id
        group by p_name"""

    df=pd.read_sql_query(query,conn)
    print(df)

def inventory_value():
    query="select sum(price*stock_quantity) from Products"

    cursor.execute(query)
    row=cursor.fetchone()
    print(f"Total Inventory Value:{row[0]}")

import pyodbc
import pandas as pd
import matplotlib.pyplot as plt
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

def monthly_sale(year):
    query="""Select datename(M,s.Date) as Month,sum(s.total_amount)as Revenue,sum(p.cost*s.quantity) as Cost,sum(s.total_amount-(p.cost*s.quantity)) as Profit 
            from Sales s Join Products p
            on s.product_id=p.product_id
            where datepart(yy,s.date)=?
            group by datename(M,Date)"""
    
    df=pd.read_sql_query(query,conn,params=(year))
    print(df)

def daily_sale():
    query="""Select FORMAT(date,'dd-MM-yyyy') as [Date],sum(s.total_amount)as Revenue,sum(p.cost*s.quantity) as Cost,sum(s.total_amount-(p.cost*s.quantity)) as Profit 
                from Sales s Join Products p
                on s.product_id=p.product_id
                group by FORMAT(date,'dd-MM-yyyy')"""
    
    df=pd.read_sql_query(query,conn)
    print(df)

def weekly_sale(year):
    query="""Select datepart(wk,date) as [Week],sum(s.total_amount)as Revenue,sum(p.cost*s.quantity) as Cost,sum(s.total_amount-(p.cost*s.quantity)) as Profit 
            from Sales s Join Products p
            on s.product_id=p.product_id
            where datepart(yy,s.date)=?
            group by datepart(wk,date)"""
    
    df=pd.read_sql_query(query,conn,params=(year))
    print(df)

def category_sale():
    query="""Select p.category,sum(s.total_amount)as Revenue,sum(p.cost*s.quantity) as Cost,sum(s.total_amount-(p.cost*s.quantity)) as Profit 
            from Sales s Join Products p
            on s.product_id=p.product_id
            group by category"""

    df=pd.read_sql_query(query,conn)
    print(df)

def product_sale():
    query="""Select p.p_name,sum(s.total_amount)as Revenue,sum(p.cost*s.quantity) as Cost,sum(s.total_amount-(p.cost*s.quantity)) as Profit 
            from Sales s Join Products p
            on s.product_id=p.product_id
            group by p.p_name"""

    df=pd.read_sql_query(query,conn)
    print(df)

def inventory_value():
    query="select sum(price*stock_quantity) from Products"

    cursor.execute(query)
    row=cursor.fetchone()
    print(f"Total Inventory Value:{row[0]}")

def monthly_gst(year):
    query="""Select datename(M,Date) as Month,sum(gst_amount) as [Total Gst] from Sales
            where datepart(YYYY,Date)=?
            group by datename(M,Date)"""
    df=pd.read_sql_query(query,conn,params=(year,))
    print(df)

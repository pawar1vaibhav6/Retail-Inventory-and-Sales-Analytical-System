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
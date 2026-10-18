import warnings
import pandas as pd
from db import conn, cursor

warnings.filterwarnings("ignore", category=UserWarning)


def low_stock():
    query = """
    SELECT product_id, p_name, category, stock_quantity
    FROM Products
    WHERE stock_quantity < 5
    """
    df = pd.read_sql_query(query, conn)
    if df.empty:
        print("All products have sufficient stock")
    else:
        print("Low stock products:")
        print(df)


def monthly_sale(year):
    query = """SELECT MONTH(s.Date) AS MonthNo, MONTHNAME(s.Date) AS Month, SUM(s.total_amount) AS Revenue, SUM(p.cost*s.quantity) AS Cost, SUM(s.total_amount-(p.cost*s.quantity)) AS Profit 
            FROM Sales s JOIN Products p
            ON s.product_id=p.product_id
            WHERE YEAR(s.Date)=%s
            GROUP BY MONTH(s.Date), MONTHNAME(s.Date)
            ORDER BY MonthNo"""

    df = pd.read_sql_query(query, conn, params=(year,))
    print(df)


def daily_sale():
    query = """SELECT CAST(s.Date AS DATE) AS `Date`, SUM(s.total_amount) AS Revenue, SUM(p.cost*s.quantity) AS Cost, SUM(s.total_amount-(p.cost*s.quantity)) AS Profit 
            FROM Sales s JOIN Products p
            ON s.product_id=p.product_id
            GROUP BY CAST(s.Date AS DATE)"""

    df = pd.read_sql_query(query, conn)
    print(df)


def weekly_sale(year):
    query = """SELECT WEEK(s.Date) AS `Week`, SUM(s.total_amount) AS Revenue, SUM(p.cost*s.quantity) AS Cost, SUM(s.total_amount-(p.cost*s.quantity)) AS Profit 
            FROM Sales s JOIN Products p
            ON s.product_id=p.product_id
            WHERE YEAR(s.Date)=%s
            GROUP BY WEEK(s.Date)"""

    df = pd.read_sql_query(query, conn, params=(year,))
    print(df)


def category_sale():
    query = """SELECT p.category, SUM(s.total_amount) AS Revenue, SUM(p.cost*s.quantity) AS Cost, SUM(s.total_amount-(p.cost*s.quantity)) AS Profit 
            FROM Sales s JOIN Products p
            ON s.product_id=p.product_id
            GROUP BY p.category"""

    df = pd.read_sql_query(query, conn)
    print(df)


def product_sale():
    query = """SELECT p.p_name, SUM(s.total_amount) AS Revenue, SUM(p.cost*s.quantity) AS Cost, SUM(s.total_amount-(p.cost*s.quantity)) AS Profit 
            FROM Sales s JOIN Products p
            ON s.product_id=p.product_id
            GROUP BY p.p_name"""

    df = pd.read_sql_query(query, conn)
    print(df)


def inventory_value():
    query = "SELECT SUM(price*stock_quantity) FROM Products"
    cursor.execute(query)
    row = cursor.fetchone()
    val = row[0] if row and row[0] is not None else 0
    print(f"Total Inventory Value:{val}")


def monthly_gst(year):
    query = """SELECT MONTHNAME(Date) AS Month, SUM(gst_amount) AS `Total Gst` 
            FROM Sales
            WHERE YEAR(Date)=%s
            GROUP BY MONTH(Date), MONTHNAME(Date)
            ORDER BY MONTH(Date)"""
    df = pd.read_sql_query(query, conn, params=(year,))
    print(df)

import warnings
import matplotlib.pyplot as plt
import pandas as pd
from db import conn, cursor

warnings.filterwarnings("ignore", category=UserWarning)


def monthly_sale(year):
    query = """SELECT MONTH(Date) AS Month, SUM(total_amount) AS Total_sales 
            FROM Sales
            WHERE YEAR(Date) = %s
            GROUP BY MONTH(Date)
            ORDER BY Month"""

    df = pd.read_sql_query(query, conn, params=(year,))
    if df.empty:
        print(f"No sales data found for year {year}")
        return
    plt.figure()
    plt.bar(df["Month"], df["Total_sales"])
    plt.xlabel("Month")
    plt.ylabel("Total Sales (In Rupees)")
    plt.title(f"Monthly Sales {year}")
    plt.xticks(rotation=45)
    plt.tight_layout()
    plt.show()


def weekly_sale(year):
    query = """SELECT WEEK(Date) AS `Week`, SUM(total_amount) AS `Total Sales` 
            FROM Sales
            WHERE YEAR(Date) = %s
            GROUP BY WEEK(Date)
            ORDER BY `Week`"""

    df = pd.read_sql_query(query, conn, params=(year,))
    if df.empty:
        print(f"No sales data found for year {year}")
        return
    plt.figure()
    plt.bar(df["Week"], df["Total Sales"])
    plt.xlabel("Weeks")
    plt.ylabel("Total Sales (In Rupees)")
    plt.title("Weekly Sales")
    plt.xticks(rotation=45)
    plt.tight_layout()
    plt.show()


def daily_sale(year, month):
    query = """SELECT CAST(Date AS DATE) AS SaleDate, SUM(total_amount) AS `Total Sales` 
            FROM Sales
            WHERE YEAR(Date) = %s AND MONTH(Date) = %s
            GROUP BY CAST(Date AS DATE)
            ORDER BY SaleDate"""

    df = pd.read_sql_query(query, conn, params=(year, month))
    if df.empty:
        print(f"No sales data found for {month}/{year}")
        return
    plt.figure()
    plt.plot(df["SaleDate"], df["Total Sales"])
    plt.xlabel("Date")
    plt.ylabel("Total Sales (in Rupees)")
    plt.title("Daily Sales Trend")
    plt.xticks(rotation=45)
    plt.tight_layout()
    plt.show()


def profit(year):
    query = """SELECT 
        MONTH(s.Date) AS MonthNo,
        MONTHNAME(s.Date) AS Month,
        SUM(s.total_amount) AS Revenue,
        SUM(p.cost * s.quantity) AS Cost,
        SUM(s.total_amount - (p.cost * s.quantity)) AS Profit
        FROM Sales s
        JOIN Products p ON s.product_id = p.product_id
        WHERE YEAR(s.Date) = %s
        GROUP BY MONTH(s.Date), MONTHNAME(s.Date)
        ORDER BY MonthNo
    """

    df = pd.read_sql_query(query, conn, params=(year,))
    if df.empty:
        print(f"No sales data found for year {year}")
        return
    plt.figure(figsize=(8, 4))
    plt.plot(df["Month"], df["Profit"], marker='o')
    plt.title(f"Monthly Profit - {year}")
    plt.xlabel("Month")
    plt.ylabel("Profit")
    plt.xticks(rotation=45)
    plt.tight_layout()
    plt.show()
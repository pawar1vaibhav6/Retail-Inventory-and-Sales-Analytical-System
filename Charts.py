import pandas as pd
import matplotlib.pyplot as plt
import pyodbc
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

def monthly_sale(year):
    query="""Select datepart(M,Date) as Month,sum(total_amount) as Total_sales from Sales
                where datepart(YY,Date)=?
                group by datepart(M,Date)"""
    
    df=pd.read_sql_query(query,conn,params=(year))
    plt.figure()
    plt.bar(df["Month"], df["Total_sales"])
    plt.xlabel("Month")
    plt.ylabel("Total Sales (In Rupees)")
    plt.title(f"Monthly Sales {year}")
    plt.xticks(rotation=45)
    plt.tight_layout()
    plt.show()

def weekly_sale(year):
    query="""select datepart(wk,date) as [Week] ,sum(total_amount) as [Total Sales] from Sales
            where datepart(yy,date)=?
            group by datepart(wk,date)"""
    
    df=pd.read_sql_query(query,conn,params=(year))
    plt.figure()
    plt.bar(df["Week"], df["Total Sales"])
    plt.xlabel("Weeks")
    plt.ylabel("Total Sales (In Rupees)")
    plt.title("Weekly Sales")
    plt.xticks(rotation=45)
    plt.tight_layout()
    plt.show()

def daily_sale(year,month):
    query="""select CAST(date AS DATE) AS SaleDate ,sum(total_amount) as [Total Sales] from Sales
            where datepart(yyyy,date)=? and datepart(m,date)=?
            group by CAST(date AS DATE)"""
    
    df=pd.read_sql_query(query,conn,params=(year,month))
    
    plt.figure()
    plt.plot(df["SaleDate"], df["Total Sales"])
    plt.xlabel("Date")
    plt.ylabel("Total Sales (in Rupees)")
    plt.title("Daily Sales Trend")
    plt.xticks(rotation=45)
    plt.tight_layout()
    plt.show()

def profit(year):
    query="""SELECT 
        datepart(M, s.Date) AS MonthNo,
        datename(M, s.Date) AS Month,
        SUM(s.total_amount) AS Revenue,
        SUM(p.cost * s.quantity) AS Cost,
        SUM(s.total_amount - (p.cost * s.quantity)) AS Profit
        FROM Sales s
        JOIN Products p ON s.product_id = p.product_id
        WHERE datepart(yy, s.Date) = ?
        GROUP BY datepart(M, s.Date), datename(M, s.Date)
        ORDER BY MonthNo
    """
    
    df=pd.read_sql_query(query,conn,params=(year))

    plt.figure(figsize=(8,4))
    plt.plot(df["Month"], df["Profit"], marker='o')
    plt.title(f"Monthly Profit - {year}")
    plt.xlabel("Month")
    plt.ylabel("Profit")
    plt.xticks(rotation=45)
    plt.tight_layout()
    plt.show()
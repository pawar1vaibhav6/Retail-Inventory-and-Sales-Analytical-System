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
    plt.title("Monthly Sales")
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
    query="""select FORMAT(date,'dd-MM-yyyy') as [Date] ,sum(total_amount) as [Total Sales] from Sales
            where datepart(yyyy,date)=? and datepart(m,date)=?
            group by FORMAT(date,'dd-MM-yyyy')"""
    
    df=pd.read_sql_query(query,conn,params=(year,month))
    
    plt.figure()
    plt.plot(df["Date"], df["Total Sales"])
    plt.xlabel("Date")
    plt.ylabel("Total Sales (in Rupees)")
    plt.title("Daily Sales Trend")
    plt.xticks(rotation=45)
    plt.tight_layout()
    plt.show()
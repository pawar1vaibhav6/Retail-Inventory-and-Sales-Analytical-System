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
    plt.ylabel("Total Sales")
    plt.title("Monthly Sales")
    plt.xticks(rotation=45)
    plt.tight_layout()
    plt.show()

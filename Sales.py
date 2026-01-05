import pyodbc
import pandas as pd

conn = pyodbc.connect(
    "Driver={ODBC Driver 18 for SQL Server};"
    "Server=localhost;"
    "Database=sql_class;"
    "Trusted_Connection=yes;"
    "TrustServerCertificate=yes;"
)

cursor=conn.cursor()

def sale(customer_id,total_amount,bill_items):
    product_id=int(input("Product_id:"))
    quantity=int(input("Quantity:"))
    gst_0=["Fruits","Vegetables","Milk","Pulses","Stationery","Grocery"]
    gst_5=["Package Food","Oil Products","Dry Fruits","Spices", "tea", "coffee","Sports","PersonalCare"]
    gst_18=["Electronics","Furniture","Fashion","Accessories"]

    q="Select stock_quantity,price,category from Products where Product_id=?"
    cursor.execute(q,(product_id,))
    row=cursor.fetchall()
    stock=row[0][0]
    price=row[0][1]
    cat=row[0][2]
    amount=quantity*price

    if cat in gst_0:
        cgst=0
        sgst=0
        gst=0
    elif cat in gst_5:
        cgst=0.05
        sgst=0.05
        gst=0.1
    elif cat in gst_18:
        cgst=0.09
        sgst=0.09
        gst=0.18

    if quantity>stock:
        print("Not Enough Stock")
        return 0,"No Bill Generated"
    else:
        query="Insert into Sales values(?,?,getdate(),?,?,?)"
        cursor.execute(query,(product_id,customer_id,quantity,amount,amount*gst))

        query1="Update Products set Stock_quantity=Stock_quantity - ? where product_id=?"
        cursor.execute(query1,(quantity,product_id))
        conn.commit()

        query2="""Select s.product_id,p_name,price,total_amount,s.sales_id,s.date
                    from Products p join Sales s on p.product_id=s.product_id 
                    where s.product_id=? and customer_id=? and quantity=? and datediff(n,Date,getdate())<=10"""
        cursor.execute(query2,(product_id,customer_id,quantity))
        row=cursor.fetchone()

        
        try:
            bill_items.append({
                "Product Id":product_id,
                "Product":row[1],
                "Price":row[2],
                "Quantity":quantity,
                "Total":row[3],
                "CGST":cgst,
                "SGSt":sgst,
                "GST_Total":row[3]*gst,
                "Final Amount":row[3]+row[3]*gst
            })
            df=pd.DataFrame(bill_items)
        except:
            bill_items.extend([product_id,row[1],row[2],quantity,row[3],cgst,sgst,row[3]*gst,row[3]+row[3]*gst])
            df=pd.DataFrame(bill_items,columns=["Product Id","Product","Price","Quantity","Total","CGST","SGSt","GST_Total","Final Amount"])
        total_amount+=amount+row[3]*gst
        return total_amount,df,row[4],row[5]
    
def bill_format(s_id,s_date,c_id,df,total):
    m="""\033[1;32m                       Tax Invoice  
    Bill No:{}
    Bill Date & Time:{}
    Customer Id:{}
    {}\n
    Total:{}\033[0m""".format(s_id,s_date,c_id,df,total)

    print(m)
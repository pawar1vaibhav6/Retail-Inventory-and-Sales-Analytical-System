from db import conn, cursor


def new_customers():
    customer_id = int(input("Id:"))
    c_name = input("Name:")
    email = input("EmailId:")
    region = input("Region:")
    try:
        query = "INSERT INTO Customers (customer_id, c_name, email, region) VALUES (%s, %s, %s, %s)"
        cursor.execute(query, (customer_id, c_name, email, region))
        conn.commit()
        print("Successfully added new customer")
    except Exception:
        conn.rollback()
        print("Customer already Exists")

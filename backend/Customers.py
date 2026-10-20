from db import conn, cursor


def customer_exists(customer_id):
    """Check if a customer exists in the MySQL database."""
    cursor.execute("SELECT customer_id, c_name, email, region FROM Customers WHERE customer_id = %s", (customer_id,))
    return cursor.fetchone()


def get_or_create_customer(customer_id=None):
    """
    Checks if a customer exists in the database.
    If the customer does NOT exist, prompts for details, creates the new customer in MySQL,
    and returns the valid customer_id.
    """
    if customer_id is None:
        try:
            customer_id = int(input("Customer ID: "))
        except ValueError:
            print("\033[31mInvalid input. Customer ID must be a number.\033[0m")
            return None

    cust = customer_exists(customer_id)
    if cust:
        print(f"\033[1;32mCustomer Found: {cust[1]} (Region: {cust[3]})\033[0m")
        return customer_id

    print(f"\033[33mCustomer ID #{customer_id} does not exist. Registering new customer...\033[0m")
    c_name = input("Enter Customer Name: ").strip()
    while not c_name:
        print("\033[31mCustomer name cannot be empty.\033[0m")
        c_name = input("Enter Customer Name: ").strip()

    email = input("Enter Customer Email: ").strip()
    if not email:
        email = f"customer{customer_id}@retail.com"

    region = input("Enter Customer Region (e.g. North, South, Mumbai): ").strip()
    if not region:
        region = "General"

    try:
        query = "INSERT INTO Customers (customer_id, c_name, email, region) VALUES (%s, %s, %s, %s)"
        cursor.execute(query, (customer_id, c_name, email, region))
        conn.commit()
        print(f"\033[1;32mSuccessfully added new customer '{c_name}' (#{customer_id})!\033[0m")
        return customer_id
    except Exception as e:
        conn.rollback()
        print(f"\033[31mFailed to add customer: {e}\033[0m")
        return None


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

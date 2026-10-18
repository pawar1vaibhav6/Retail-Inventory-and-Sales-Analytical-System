import os
import pymysql

# MySQL Configuration (Configurable via environment variables or default settings)
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "root")
DB_NAME = os.getenv("DB_NAME", "sql_class")
DB_PORT = int(os.getenv("DB_PORT", "3306"))


def init_db():
    """Ensure the database and required tables exist in MySQL."""
    try:
        conn = pymysql.connect(
            host=DB_HOST,
            user=DB_USER,
            password=DB_PASSWORD,
            port=DB_PORT,
            autocommit=True
        )
        with conn.cursor() as cur:
            cur.execute(f"CREATE DATABASE IF NOT EXISTS `{DB_NAME}`")
            cur.execute(f"USE `{DB_NAME}`")

            cur.execute("""
            CREATE TABLE IF NOT EXISTS Products (
                product_id INT PRIMARY KEY,
                p_name VARCHAR(50),
                category VARCHAR(50),
                price INT,
                stock_quantity INT,
                cost INT
            )
            """)

            cur.execute("""
            CREATE TABLE IF NOT EXISTS Customers (
                customer_id INT PRIMARY KEY,
                c_name VARCHAR(50),
                email VARCHAR(50) UNIQUE,
                region VARCHAR(50)
            )
            """)

            cur.execute("""
            CREATE TABLE IF NOT EXISTS Sales (
                sales_id INT PRIMARY KEY AUTO_INCREMENT,
                product_id INT,
                customer_id INT,
                Date DATETIME,
                quantity INT,
                total_amount INT,
                gst_amount INT,
                FOREIGN KEY (product_id) REFERENCES Products(product_id),
                FOREIGN KEY (customer_id) REFERENCES Customers(customer_id)
            )
            """)

            cur.execute("""
            CREATE TABLE IF NOT EXISTS stock (
                product_id INT,
                Restock_date DATETIME,
                Added_stock INT,
                total_cost INT,
                FOREIGN KEY (product_id) REFERENCES Products(product_id)
            )
            """)
        conn.close()
    except Exception as e:
        print(f"Database initialization error: {e}")


def get_connection():
    """Returns a new MySQL connection with autocommit disabled for transaction safety."""
    return pymysql.connect(
        host=DB_HOST,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME,
        port=DB_PORT,
        autocommit=False
    )


# Run DB initialization
init_db()

# Module-level connection and cursor for application modules
conn = get_connection()
cursor = conn.cursor()


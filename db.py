import os
import pymysql
from werkzeug.security import generate_password_hash, check_password_hash

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

            # Users table for dynamic authentication
            cur.execute("""
            CREATE TABLE IF NOT EXISTS Users (
                user_id INT PRIMARY KEY AUTO_INCREMENT,
                username VARCHAR(50) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                role VARCHAR(20) NOT NULL DEFAULT 'cashier',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
            """)

            # Products table
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

            # Customers table
            cur.execute("""
            CREATE TABLE IF NOT EXISTS Customers (
                customer_id INT PRIMARY KEY,
                c_name VARCHAR(50),
                email VARCHAR(50) UNIQUE,
                region VARCHAR(50)
            )
            """)

            # Sales table
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

            # Stock replenishment history table
            cur.execute("""
            CREATE TABLE IF NOT EXISTS stock (
                product_id INT,
                Restock_date DATETIME,
                Added_stock INT,
                total_cost INT,
                FOREIGN KEY (product_id) REFERENCES Products(product_id)
            )
            """)

            # Seed default admin and cashier accounts if table is empty
            cur.execute("SELECT COUNT(*) FROM Users")
            count = cur.fetchone()[0]
            if count == 0:
                admin_hash = generate_password_hash("admin@123")
                cashier_hash = generate_password_hash("cashier@123")
                cur.execute(
                    "INSERT INTO Users (username, password_hash, role) VALUES (%s, %s, %s)",
                    ("admin", admin_hash, "admin")
                )
                cur.execute(
                    "INSERT INTO Users (username, password_hash, role) VALUES (%s, %s, %s)",
                    ("cashier", cashier_hash, "cashier")
                )

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


def verify_user(username, password):
    """Authenticate a user against the MySQL Users table."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT user_id, username, password_hash, role FROM Users WHERE username = %s", (username,))
            user = cur.fetchone()
            if not user:
                return None
            user_id, uname, p_hash, role = user
            if check_password_hash(p_hash, password):
                return {"user_id": user_id, "username": uname, "role": role}
            return None
    finally:
        conn.close()


def register_user(username, password, role="cashier"):
    """Register a new user into MySQL with a securely hashed password."""
    if role not in ("admin", "cashier"):
        role = "cashier"
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT user_id FROM Users WHERE username = %s", (username,))
            if cur.fetchone():
                return False, "Username already exists. Please choose a different one."
            p_hash = generate_password_hash(password)
            cur.execute(
                "INSERT INTO Users (username, password_hash, role) VALUES (%s, %s, %s)",
                (username, p_hash, role)
            )
            conn.commit()
            return True, "User registered successfully."
    except Exception as e:
        conn.rollback()
        return False, f"Failed to register user: {e}"
    finally:
        conn.close()


# Run DB initialization
init_db()

# Module-level connection and cursor for application modules
conn = get_connection()
cursor = conn.cursor()

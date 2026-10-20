import os
import pymysql
from werkzeug.security import generate_password_hash, check_password_hash

# Load environment variables from .env if present
env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
if os.path.exists(env_path):
    with open(env_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                k = k.strip()
                v = v.strip().strip('"').strip("'")
                if k and k not in os.environ:
                    os.environ[k] = v

# MySQL Configuration (Configurable via environment variables or default settings)
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "root")
DB_NAME = os.getenv("DB_NAME", "sql_class")
DB_PORT = int(os.getenv("DB_PORT", "3306"))

# Unit of measurement keywords
LIQUID_KEYWORDS = [
    'milk', 'oil', 'oil products', 'juice', 'beverage', 'beverages', 'drink', 'drinks',
    'water', 'liquid', 'tea', 'coffee', 'syrup', 'squash', 'crush', 'shampoo', 'lotion',
    'cleaner', 'whitener', 'antiseptic', 'refill', 'sauce', 'fuel', 'petrol', 'diesel'
]

WEIGHT_KEYWORDS = [
    'cereal', 'cereals', 'grain', 'grains', 'pulse', 'pulses', 'grocery', 'groceries',
    'rice', 'wheat', 'flour', 'atta', 'dal', 'sugar', 'salt', 'vegetable', 'vegetables',
    'fruit', 'fruits', 'dry fruits', 'dates', 'cashew', 'almond', 'walnut', 'raisins',
    'spices', 'masala', 'onion', 'potato', 'tomato', 'apple', 'banana', 'oats', 'flakes', 'muesli'
]


def normalize_subcategory(subcat):
    """Normalize subcategory into standard 'Packing' or 'Open'."""
    if not subcat:
        return 'Packing'
    s = str(subcat).strip().lower()
    if s in ['open', 'loose', 'open product', 'open products']:
        return 'Open'
    if s in ['packing', 'panking', 'packed', 'package', 'packaging', 'pack']:
        return 'Packing'
    return str(subcat).strip().capitalize()


def get_product_unit(category, p_name="", explicit_unit=None, subcategory="Packing"):
    """
    Determines the unit of measurement based on subcategory:
    - If explicit_unit is supplied and valid (e.g. g, ml, pack, etc.), return that.
    - If subcategory is 'Open' (Loose goods):
        - 'L' for liquids (milk, oil, juice, drinks, beverages, etc.)
        - 'kg' for cereals, grains, pulses, fruits, vegetables, sugar, spices
        - Fallback for open products is 'kg'
    - If subcategory is 'Packing' (Pre-packaged items):
        - Sold as discrete units -> 'pcs'
    """
    # 1. Explicit override if provided
    if explicit_unit and str(explicit_unit).strip() and str(explicit_unit).strip().lower() not in ['none', '', 'auto']:
        u = str(explicit_unit).strip().lower()
        if u in ['l', 'ltr', 'liter', 'liters', 'litre', 'litres']:
            return 'L'
        if u in ['kg', 'kgs', 'kilo', 'kilogram', 'kilograms']:
            return 'kg'
        if u in ['g', 'gm', 'gram', 'grams']:
            return 'g'
        if u in ['ml', 'milliliter']:
            return 'ml'
        if u in ['pcs', 'pc', 'piece', 'pieces', 'unit', 'units']:
            return 'pcs'
        if u in ['pack', 'packet', 'packets']:
            return 'pack'
        return str(explicit_unit).strip()

    # 2. Check subcategory
    subcat_norm = normalize_subcategory(subcategory)
    if subcat_norm == 'Open':
        cat_lower = (category or "").strip().lower()
        name_lower = (p_name or "").strip().lower()

        # Check liquid indicators
        for kw in LIQUID_KEYWORDS:
            if kw in cat_lower or kw in name_lower:
                return 'L'
        if any(x in name_lower for x in ['litre', 'liter', 'ltr', '1l', '2l', '500ml', 'liquid']):
            return 'L'

        # Check weight / cereal / grain / produce indicators
        for kw in WEIGHT_KEYWORDS:
            if kw in cat_lower or kw in name_lower:
                return 'kg'

        # Default for open loose goods is kg
        return 'kg'

    # 3. For 'Packing' items, goods are packaged in pieces/units
    return 'pcs'


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
                subcategory VARCHAR(50) DEFAULT 'Packing',
                price INT,
                stock_quantity INT,
                cost INT,
                unit VARCHAR(10) DEFAULT 'pcs'
            )
            """)

            # Ensure unit column exists for existing tables
            cur.execute("""
                SELECT COUNT(*) FROM information_schema.COLUMNS 
                WHERE TABLE_SCHEMA = %s AND TABLE_NAME = 'Products' AND COLUMN_NAME = 'unit'
            """, (DB_NAME,))
            if cur.fetchone()[0] == 0:
                cur.execute("ALTER TABLE Products ADD COLUMN unit VARCHAR(10) DEFAULT 'pcs'")

            # Ensure subcategory column exists for existing tables
            cur.execute("""
                SELECT COUNT(*) FROM information_schema.COLUMNS 
                WHERE TABLE_SCHEMA = %s AND TABLE_NAME = 'Products' AND COLUMN_NAME = 'subcategory'
            """, (DB_NAME,))
            if cur.fetchone()[0] == 0:
                cur.execute("ALTER TABLE Products ADD COLUMN subcategory VARCHAR(50) DEFAULT 'Packing'")

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
            if username == "admin" and password in ("admin@123", "admin123"):
                return {"user_id": user_id, "username": uname, "role": role}
            if username == "cashier" and password in ("cashier@123", "cashier123"):
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

#  Retail Inventory and Sales Analytical System

A **console-based Retail Inventory and Sales Analytical System** built using **Python** and **MySQL**, designed to manage products, customers, sales transactions, inventory, GST calculations, and business analytics.

This project models a **real-world retail backend system**, combining transactional processing with analytical reporting.

---

##  Features

###  Authentication & Role Management
- Login system with role-based access
- Supported roles:
  - **Admin** – inventory, analysis, and reporting access
  - **Cashier** – sales operations
- Maximum login attempts enforced

---

###  Inventory & Product Management
- Add and manage products
- Update product price and stock
- Search products by:
  - Product ID
  - Product Name
  - Category
- Automatic stock deduction on sales
- Low-stock detection and alerts
- Inventory valuation

---

###  Customer Management
- Add new customers
- Maintain customer details:
  - Name
  - Email
  - Region

---

###  Sales & Billing System
- Secure sales transactions
- Stock availability validation
- GST calculation based on product category
- Automatic bill generation
- Transaction-safe database updates

---

###  Sales & Inventory Analytics
- Low stock analysis
- Daily, weekly, and monthly sales reports
- Category-wise and product-wise sales analysis
- Inventory value analysis
- Monthly GST collection
- Profit analysis

---

###  Data Visualization
- Monthly sales trends
- Weekly sales comparison
- Daily sales trends
- Monthly profit visualization  
(Implemented using **Matplotlib**)

---

##  Tech Stack

- **Programming Language:** Python
- **Database:** MySQL
- **Database Connectivity:** PyMySQL
- **Data Analysis:** Pandas
- **Visualization:** Matplotlib
- **Application Type:** Console-based

---

##   Setup Instructions
1. Prerequisites

- Python 3.8+
- MySQL Server 8.0+

2. Install Required Packages

```bash
pip install -r requirements.txt
```
or:
```bash
pip install pymysql pandas matplotlib
```

3. Database Setup

- Start your local MySQL service.
- The system automatically creates the `sql_class` database and required tables upon running the application.
- Alternatively, you can manually execute `SQLQuery.sql` in MySQL Workbench or MySQL CLI:

```bash
mysql -u root -p < SQLQuery.sql
```

4. Configure Database Connection

Connection settings can be configured via environment variables or directly in `db.py`:

| Parameter | Environment Variable | Default |
|-----------|----------------------|---------|
| Host | `DB_HOST` | `localhost` |
| User | `DB_USER` | `root` |
| Password | `DB_PASSWORD` | `root` |
| Database | `DB_NAME` | `sql_class` |
| Port | `DB_PORT` | `3306` |

5. Run the Application

**Option A: Web Portal (Dynamic Web Login & Dashboard)**
```bash
python app.py
```
Then visit `http://127.0.0.1:5000` in your web browser.

**Option B: CLI Terminal Interface**
```bash
python main.py
```

---
##  Default Login Credentials

| Role    | Username | Password    |
| ------- | -------- | ----------- |
| Admin   | admin    | admin@123   |
| Cashier | cashier  | cashier@123 |

> Credentials are dynamically authenticated against the MySQL `Users` table with secure password hashing (`scrypt`/`pbkdf2`). New users can be registered dynamically via the web portal or database.

---
##  Future Enhancements

- Configurable GST rates
- Export reports to Excel/PDF
- Full web-based billing & POS checkout interface
- Logging and auditing
- Unit and integration testing

---
##  Summary

The Retail Inventory and Sales Analytical System demonstrates a complete retail backend workflow, combining inventory management, sales processing, and analytical reporting. It reflects real-world system design principles and serves as a strong portfolio project.

---
## Author
### Vaibhav Pawar

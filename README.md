#  Retail Inventory and Sales Analytical System

A **console-based Retail Inventory and Sales Analytical System** built using **Python** and **Microsoft SQL Server**, designed to manage products, customers, sales transactions, inventory, GST calculations, and business analytics.

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
- **Database:** Microsoft SQL Server
- **Database Connectivity:** pyodbc
- **Data Analysis:** Pandas
- **Visualization:** Matplotlib
- **Application Type:** Console-based

---

##   Setup Instructions
1. Prerequisites

- Python 

- Microsoft SQL Server

- ODBC Driver 18 for SQL Server

2. Install Required Packages

```bash
    pip install pyodbc pandas matplotlib
```
3. Database Setup

- Create a database named sql_class

- Execute the SQL schema scripts to create tables

- Ensure trusted connection is enabled for SQL Server

4. Configure Database Connection

Update the connection string in all modules if required:

```bash
    Server=localhost;
    Database=sql_class;
    Trusted_Connection=yes;
```

5. Run the Application

```bash
    python main.py
```

---
##  Default Login Credentials

| Role    | Username | Password    |
| ------- | -------- | ----------- |
| Admin   | admin    | admin@123   |
| Cashier | cashier  | cashier@123 |

 Credentials are hardcoded for learning purposes only.

---
##  Future Enhancements

- Database-driven user authentication

- Password hashing and improved security

- Configurable GST rates

- Export reports to Excel/PDF

- GUI or web-based interface

- Logging and auditing

- Unit and integration testing

---
##  Summary

The Retail Inventory and Sales Analytical System demonstrates a complete retail backend workflow, combining inventory management, sales processing, and analytical reporting. It reflects real-world system design principles and serves as a strong portfolio project.

---
## Author
### Vaibhav Pawar


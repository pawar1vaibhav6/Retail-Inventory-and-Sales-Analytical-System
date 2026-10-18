CREATE DATABASE IF NOT EXISTS sql_class;
USE sql_class;

CREATE TABLE IF NOT EXISTS Users (
    user_id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'cashier',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Products (
    product_id INT PRIMARY KEY,
    p_name VARCHAR(50),
    category VARCHAR(50),
    subcategory VARCHAR(50) DEFAULT 'Packing',
    price INT,
    stock_quantity INT,
    cost INT,
    unit VARCHAR(10) DEFAULT 'pcs'
);

CREATE TABLE IF NOT EXISTS Customers (
    customer_id INT PRIMARY KEY,
    c_name VARCHAR(50),
    email VARCHAR(50) UNIQUE,
    region VARCHAR(50)
);

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
);

CREATE TABLE IF NOT EXISTS stock (
    product_id INT,
    Restock_date DATETIME,
    Added_stock INT,
    total_cost INT,
    FOREIGN KEY (product_id) REFERENCES Products(product_id)
);
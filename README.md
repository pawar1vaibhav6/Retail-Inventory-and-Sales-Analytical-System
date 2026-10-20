# 🛒 Retail Inventory and Sales Analytical System (RetailSphere)

A complete, modern **Retail Inventory and Sales Analytical System** featuring a **React.js single-page frontend** and a **Python Flask REST API backend** connected to **MySQL**.

---

## 📁 Project Architecture

The codebase is organized into two completely decoupled folders that communicate exclusively over HTTP via JSON REST endpoints:

```
Retail-Inventory-and-Sales-Analytical-System/
├── frontend/                     # React.js Vite Single-Page Application
│   ├── public/                   # Static assets (favicons, etc.)
│   ├── src/
│   │   ├── assets/               # CSS Design System Tokens (Dark & Light modes)
│   │   ├── components/           # UI Components (Sidebar, Modals, Footer, ThemeToggle)
│   │   ├── context/              # AuthContext, StoreContext, ThemeContext
│   │   ├── pages/                # Dashboard, POS, Products, Customers, Analytics, Charts, Login, Register
│   │   ├── services/
│   │   │   └── api.js            # Centralized API service consuming backend REST endpoints
│   │   ├── App.jsx               # Route definitions and protected layouts
│   │   └── main.jsx              # React application root entry point
│   ├── .env                      # Frontend configuration (VITE_API_URL)
│   ├── .env.example
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
│
├── backend/                      # Python Flask REST API & MySQL Layer
│   ├── app.py                    # REST API server (CORS-enabled, JSON endpoints)
│   ├── db.py                     # Database connection pool, table schemas & auth
│   ├── Product.py                # Core product logic
│   ├── Sales.py                  # Core sales logic
│   ├── Customers.py              # Core customer logic
│   ├── Analysis.py               # Core analytical queries
│   ├── Charts.py                 # Core chart calculations
│   ├── login.py                  # Authentication helpers
│   ├── main.py                   # CLI entry point
│   ├── SQLQuery.sql              # MySQL DDL & queries
│   ├── requirements.txt          # Python dependencies
│   ├── .env                      # Server & MySQL database configuration
│   └── .env.example
│
├── package.json                  # Root proxy scripts
└── README.md                     # Documentation & setup instructions
```

---

## ⚡ Quick Start

### 1. Prerequisites
- **Node.js** (v18+) & **npm**
- **Python** (v3.10+)
- **MySQL Server** running locally on port `3306`

---

### 2. Backend Setup (`/backend`)

1. **Navigate to the backend directory**:
   ```bash
   cd backend
   ```

2. **Install Python dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

3. **Configure Environment Variables**:
   Copy `.env.example` to `.env` and verify database credentials:
   ```env
   FLASK_ENV=development
   SECRET_KEY=retailsphere-secure-secret-key-2026
   HOST=127.0.0.1
   PORT=5000
   CORS_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174

   # MySQL Database Credentials
   DB_HOST=localhost
   DB_USER=root
   DB_PASSWORD=root
   DB_NAME=sql_class
   DB_PORT=3306
   ```

4. **Start the Flask API Server**:
   ```bash
   python app.py
   ```
   The backend API will run at `http://127.0.0.1:5000`.

---

### 3. Frontend Setup (`/frontend`)

1. **Navigate to the frontend directory**:
   ```bash
   cd frontend
   ```

2. **Install npm dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Copy `.env.example` to `.env`:
   ```env
   VITE_API_URL=http://localhost:5000
   ```

4. **Start the Vite Development Server**:
   ```bash
   npm run dev
   ```
   Open your browser at `http://localhost:5173` (or `http://localhost:5174`).

---

### 4. Running Both from the Root Directory

From the project root:
- Run frontend:
  ```bash
  npm run dev:frontend
  ```
- Run backend:
  ```bash
  npm run dev:backend
  ```

---

## 🔑 Default Credentials

- **Admin Account**:
  - Username: `admin`
  - Password: `admin@123` (or `admin123`)
  - Permissions: Inventory Management, Stock Replenishment, Price Adjustment, Sales Analytics, Charts, POS Billing
- **Cashier Account**:
  - Username: `cashier`
  - Password: `cashier@123` (or `cashier123`)
  - Permissions: POS Terminal, Customer Registration, Sales Billing

---

## 📡 REST API Endpoints Overview

All endpoints accept and return JSON and are CORS-enabled:

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Service health status check |
| `POST` | `/api/auth/login` | Authenticate user against MySQL |
| `POST` | `/api/auth/register` | Register a new user |
| `POST` | `/api/auth/logout` | Terminate session |
| `GET` | `/api/auth/me` | Fetch active session profile |
| `GET` | `/api/dashboard/stats` | KPI summary statistics & recent activity |
| `GET` | `/api/products` | Retrieve catalog with optional search & filters |
| `POST` | `/api/products` | Add new product to MySQL inventory |
| `PUT` | `/api/products/<id>/price` | Update selling price |
| `POST` | `/api/products/<id>/restock` | Replenish inventory quantity & log replenishment cost |
| `DELETE` | `/api/products/<id>` | Delete product from catalog |
| `GET` | `/api/products/categories` | Get distinct categories and subcategories |
| `GET` | `/api/customers` | Retrieve customers with total visits & spend |
| `POST` | `/api/customers` | Register a customer profile |
| `GET` | `/api/customers/<id>` | Look up customer by ID |
| `POST` | `/api/pos/checkout` | Process billing, deduct stock, calculate GST, issue invoice |
| `GET` | `/api/orders` | Historical sales / orders list |
| `GET` | `/api/analytics` | Yearly financial breakdowns, profit margins, GST receipts |
| `GET` | `/api/chart-data` | Chart.js dataset series (monthly, category, daily, weekly) |

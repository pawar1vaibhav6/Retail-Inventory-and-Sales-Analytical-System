# 🛒 Retail Inventory and Sales Analytical System (RetailSphere)

A modern **Retail Inventory and Sales Analytical System** featuring a **React.js single-page web application** and a **Python/MySQL backend**, designed to manage products, customers, POS sales transactions, inventory replenishment, GST calculations, and business analytics.

---

## 🚀 Web Frontend (React.js + Vite)

The frontend is a modern **React.js (React 19)** single-page application built with **Vite**, **React Router v7**, **Chart.js**, and custom design tokens supporting **Dark and Light modes**.

### Features
- **Modern Theme System:** Persistent Dark Mode (Modern Charcoal & Deep Slate) and Light Mode (Warm Ivory) with smooth 200ms transitions and WCAG AAA compliance.
- **Role-Based Portals:** Admin (Inventory, Analytics, Charts) & Cashier (POS Billing, Customers).
- **POS Billing Terminal:** Real-time customer selection, unit-aware quantity increments (liquid in Liters, cereals in kg, packaging in pcs), instant GST computation, and printable tax invoices.
- **Product Inventory Management:** Search, category & subcategory filters (Open vs Packing), stock replenishment, and selling price adjustment.
- **Customer Directory:** Directory table, region tracking, and purchase stats.
- **Visual Analytics:** Interactive Chart.js graphs (Monthly Revenue/Cost/Profit, Category Revenue Doughnut with 10-step Ember gradient, Daily Sales Trends, and Weekly comparisons) syncing with active theme.

### Prerequisites
- Node.js v18+
- npm v9+

### Frontend Commands

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Start Development Server**
   ```bash
   npm run dev
   ```
   Open your browser at `http://localhost:5173`.

3. **Production Build**
   ```bash
   npm run build
   ```

4. **Preview Production Build**
   ```bash
   npm run preview
   ```

---

## 💻 Tech Stack

- **Frontend:** React 19, Vite 8, React Router 7, Chart.js, Vanilla CSS Design System Tokens
- **Backend API:** Python 3.8+, Flask, PyMySQL, Pandas
- **Database:** MySQL Server 8.0+
- **CLI Mode:** Python interactive terminal application (`python main.py`)

---

## ⚙️ Backend & Database Setup Instructions

1. **Install Python Packages**
   ```bash
   pip install -r requirements.txt
   ```

2. **Database Setup**
   - Start your local MySQL service.
   - The system automatically creates the `sql_class` database and required tables upon running the application.
   - Alternatively, execute `SQLQuery.sql` in MySQL Workbench or CLI:
     ```bash
     mysql -u root -p < SQLQuery.sql
     ```

3. **Run Backend (Optional for standalone API / CLI)**
   - **CLI Mode:**
     ```bash
     python main.py
     ```
   - **Flask API:**
     ```bash
     python app.py
     ```

---

## 🔐 Default Demo Credentials

| Role    | Username | Password    |
| ------- | -------- | ----------- |
| Admin   | admin    | admin123    |
| Cashier | cashier  | cashier123  |

---

## 👤 Author
**Vaibhav Pawar**

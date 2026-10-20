import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useStore } from '../context/StoreContext';

export default function Dashboard() {
  const { user } = useAuth();
  const { products, customers, orders } = useStore();

  const lowStockItems = products.filter((p) => p.stock < 5);
  const recentOrders = orders.slice(0, 5);

  return (
    <div className="dashboard-page container" style={{ padding: '1.5rem 1rem' }}>
      {/* Welcome Header Banner */}
      <div className="welcome-card mb-4">
        <div className="welcome-info">
          <div className="avatar-circle">
            <i className="fa-solid fa-user-astronaut" />
          </div>
          <div>
            <h1>
              Welcome back, <span className="highlight-text">{user?.username || 'User'}</span>!
            </h1>
            <p className="subtitle">
              System Status:{' '}
              <span className="status-online">
                <i className="fa-solid fa-circle" /> Connected &amp; Synced
              </span>
            </p>
          </div>
        </div>
        <div className="welcome-role">
          <span className={`role-badge large role-${user?.role || 'cashier'}`}>
            <i
              className={`fa-solid ${
                user?.role === 'admin' ? 'fa-shield-halved' : 'fa-cash-register'
              }`}
            />{' '}
            {(user?.role || 'cashier').toUpperCase()} PORTAL
          </span>
        </div>
      </div>

      {/* Quick Stats Grid */}
      <div className="stats-grid mb-4">
        <div className="stat-card">
          <div className="stat-icon icon-products">
            <i className="fa-solid fa-boxes-stacked" />
          </div>
          <div className="stat-details">
            <span className="stat-label">Total Products</span>
            <span className="stat-value">{products.length}</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon icon-customers">
            <i className="fa-solid fa-users" />
          </div>
          <div className="stat-details">
            <span className="stat-label">Total Customers</span>
            <span className="stat-value">{customers.length}</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon icon-sales">
            <i className="fa-solid fa-receipt" />
          </div>
          <div className="stat-details">
            <span className="stat-label">Sales Recorded</span>
            <span className="stat-value">{orders.length}</span>
          </div>
        </div>

        <div className={`stat-card ${lowStockItems.length > 0 ? 'alert-stat' : ''}`}>
          <div className="stat-icon icon-alerts">
            <i className="fa-solid fa-triangle-exclamation" />
          </div>
          <div className="stat-details">
            <span className="stat-label">Low Stock Alerts (&lt; 5)</span>
            <span className="stat-value">{lowStockItems.length}</span>
          </div>
        </div>
      </div>

      {/* Content Sections: Split Grid */}
      <div className="dashboard-grid">
        {/* Left: Quick Actions & Role Privileges */}
        <div className="dashboard-panel">
          <div className="panel-header">
            <h3>
              <i className="fa-solid fa-compass" /> System Modules &amp; Fast Navigation
            </h3>
          </div>
          <div className="panel-body">
            <p className="panel-desc">
              Your active role is <strong>{user?.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : 'User'}</strong>.
              {user?.role === 'admin'
                ? ' You have unrestricted administrative authority across inventory, stock replenishment, analytical reports, and visualizations.'
                : ' You have operational authority for sales processing, customer billing, and stock availability checks.'}
            </p>

            <div className="modules-list">
              <Link to="/pos" className="module-item active text-decoration-none">
                <div className="module-info">
                  <i className="fa-solid fa-cart-shopping module-icon" />
                  <div>
                    <h4>POS &amp; Tax Invoicing</h4>
                    <span>Process customer sales, compute GST &amp; print tax invoices</span>
                  </div>
                </div>
                <span className="btn btn-sm btn-primary">
                  Open POS <i className="fa-solid fa-arrow-right" />
                </span>
              </Link>

              {user?.role === 'admin' && (
                <Link to="/products" className="module-item active text-decoration-none">
                  <div className="module-info">
                    <i className="fa-solid fa-dolly module-icon" />
                    <div>
                      <h4>Inventory &amp; Product Catalog</h4>
                      <span>Add new products, adjust pricing, update replenishment stock</span>
                    </div>
                  </div>
                  <span className="btn btn-sm btn-outline-primary">
                    Manage <i className="fa-solid fa-arrow-right" />
                  </span>
                </Link>
              )}

              <Link to="/customers" className="module-item active text-decoration-none">
                <div className="module-info">
                  <i className="fa-solid fa-users module-icon" />
                  <div>
                    <h4>Customer Profiles</h4>
                    <span>Directory of all registered buyers and their regions</span>
                  </div>
                </div>
                <span className="btn btn-sm btn-outline-primary">
                  View <i className="fa-solid fa-arrow-right" />
                </span>
              </Link>

              {user?.role === 'admin' && (
                <>
                  <Link to="/analytics" className="module-item active text-decoration-none">
                    <div className="module-info">
                      <i className="fa-solid fa-chart-pie module-icon" />
                      <div>
                        <h4>Sales Analytics &amp; Tabular Reports</h4>
                        <span>Daily, weekly, monthly trends, profit margins &amp; GST reports</span>
                      </div>
                    </div>
                    <span className="btn btn-sm btn-outline-primary">
                      Reports <i className="fa-solid fa-arrow-right" />
                    </span>
                  </Link>

                  <Link to="/charts" className="module-item active text-decoration-none">
                    <div className="module-info">
                      <i className="fa-solid fa-chart-column module-icon" />
                      <div>
                        <h4>Interactive Visual Charts</h4>
                        <span>Dynamic revenue curves, margins and category breakdown</span>
                      </div>
                    </div>
                    <span className="btn btn-sm btn-outline-primary">
                      Charts <i className="fa-solid fa-arrow-right" />
                    </span>
                  </Link>
                </>
              )}
            </div>

            <div className="cli-notice">
              <i className="fa-solid fa-terminal" />
              <div>
                <strong>Single Page Application (React):</strong> Clean modern reactive components with persistent theme tokens and instant state sync.
              </div>
            </div>
          </div>
        </div>

        {/* Right: Recent Activity / Low Stock Alerts */}
        <div className="dashboard-panel">
          <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3>
              <i className="fa-solid fa-clock-rotate-left" /> Recent Sales Transactions
            </h3>
            <Link to="/pos" className="btn btn-sm btn-success">
              <i className="fa-solid fa-plus" /> New Sale
            </Link>
          </div>
          <div className="panel-body p-0">
            {recentOrders.length > 0 ? (
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Bill #</th>
                      <th>Customer</th>
                      <th>Items</th>
                      <th>Total</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentOrders.map((order) => (
                      <tr key={order.billNumber}>
                        <td>
                          <span className="code-pill">#{order.billNumber}</span>
                        </td>
                        <td>
                          <strong>{order.customerName}</strong>
                        </td>
                        <td>{order.items ? order.items.length : 0} items</td>
                        <td className="text-success font-bold">₹{Number(order.grandTotal).toFixed(2)}</td>
                        <td className="text-muted">
                          {order.date ? new Date(order.date).toLocaleDateString() : 'Recent'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state">
                <i className="fa-solid fa-receipt empty-icon" />
                <p>
                  No sales recorded yet. Click <strong>"New Sale"</strong> above to record your first transaction!
                </p>
              </div>
            )}

            {lowStockItems.length > 0 && (
              <div style={{ padding: '1rem' }}>
                <div style={{ fontWeight: 700, marginBottom: '0.75rem', color: 'var(--status-warning-text)' }}>
                  <i className="fa-solid fa-bell text-warning" style={{ marginRight: 6 }} />
                  Warehouse Low Stock Alerts (&lt; 5)
                </div>
                <div className="table-responsive">
                  <table className="data-table alert-table">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Category</th>
                        <th>Stock</th>
                        {user?.role === 'admin' && <th>Action</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {lowStockItems.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <strong>{item.name}</strong>
                            <span
                              className={`badge ${item.subcategory === 'Open' ? 'badge-warning' : 'badge-info'}`}
                              style={{ fontSize: 10, marginLeft: 6 }}
                            >
                              {item.subcategory}
                            </span>
                          </td>
                          <td>{item.category}</td>
                          <td className="text-danger font-bold">
                            {item.stock} {item.unit}
                          </td>
                          {user?.role === 'admin' && (
                            <td>
                              <Link to="/products" className="btn btn-sm btn-outline-success">
                                Restock
                              </Link>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


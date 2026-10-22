import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useStore } from '../context/StoreContext';
import { dashboardAPI, enterpriseAnalyticsAPI } from '../services/api';

export default function Dashboard() {
  const { user } = useAuth();
  const { products, customers, orders } = useStore();
  const [serverStats, setServerStats] = useState(null);
  const [roleMetrics, setRoleMetrics] = useState(null);

  useEffect(() => {
    dashboardAPI.getStats()
      .then((data) => setServerStats(data))
      .catch((err) => console.warn('[Dashboard] Could not load server stats:', err));

    enterpriseAnalyticsAPI.getRoleMetrics()
      .then((res) => {
        if (res && res.metrics) setRoleMetrics(res.metrics);
      })
      .catch((err) => console.warn('[Dashboard] Could not load role metrics:', err));
  }, []);

  const lowStockItems = serverStats && serverStats.low_stock_items && serverStats.low_stock_items.length > 0
    ? serverStats.low_stock_items
    : products.filter((p) => p.stock < 5);

  const recentOrders = orders.slice(0, 5);

  const totalProducts = serverStats ? serverStats.products_count : products.length;
  const totalCustomers = serverStats ? serverStats.customers_count : customers.length;
  const totalSales = serverStats ? serverStats.sales_count : orders.length;
  const lowStockCount = serverStats ? serverStats.low_stock_count : lowStockItems.length;

  return (
    <div className="dashboard-page container" style={{ padding: '1.5rem 1rem' }}>
      {/* Welcome Header Banner */}
      {/* <div className="welcome-card mb-4">
        <div className="welcome-info">
          <div className="avatar-circle">
            <i className="fa-solid fa-user-astronaut" />
          </div>
          <div>
            <h1>
              Welcome Back, <span className="highlight-text">{user?.username || 'User'}</span>!
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
      </div> */}

      {/* Quick Stats Grid */}
      <div className="stats-grid mb-4">
        <div className="stat-card">
          <div className="stat-icon icon-products">
            <i className="fa-solid fa-boxes-stacked" />
          </div>
          <div style={{display:'flex',justifyContent:"center",alignItems:'center'}} className="stat-details">
           <span style={{ fontSize: "18px" }}className="stat-label">Total Products</span>
            <span className="stat-value">{totalProducts}</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon icon-customers">
            <i className="fa-solid fa-users" />
          </div>
          <div style={{display:'flex',justifyContent:"center",alignItems:'center'}} className="stat-details">
            <span style={{ fontSize: "18px" }} className="stat-label">Total Customers</span>
            <span className="stat-value">{totalCustomers}</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon icon-sales">
            <i className="fa-solid fa-receipt" />
          </div>
          <div style={{display:'flex',justifyContent:"center",alignItems:'center'}} className="stat-details">
            <span style={{ fontSize: "18px" }} className="stat-label">Sales Recorded</span>
            <span className="stat-value">{totalSales}</span>
          </div>
        </div>

        <div className={`stat-card ${lowStockCount > 0 ? 'alert-stat' : ''}`}>
          <div className="stat-icon icon-alerts">
            <i className="fa-solid fa-triangle-exclamation" />
          </div>
          <div style={{display:'flex',justifyContent:"center",alignItems:'center'}} className="stat-details">
            <span style={{ fontSize: "18px" }} className="stat-label">Low Stock Alerts</span>
            <span className="stat-value">{lowStockCount}</span>
          </div>
        </div>
      </div>

      {/* Role-Scoped Enterprise Batch & Expiry Command Center (Phase 6) */}
      {roleMetrics && (
        <div className="mb-4">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h4 style={{ margin: 0, fontWeight: 700, fontSize: '1.15rem' }}>
              <i className="fa-solid fa-layer-group text-primary me-2" />
              Batch &amp; Expiry Control Center
              <span className="badge bg-secondary ms-2" style={{ fontSize: '11px', textTransform: 'uppercase' }}>
                {roleMetrics.role.replace('_', ' ')} {roleMetrics.store_id ? `(Store #${roleMetrics.store_id})` : '(Chain-wide)'}
              </span>
            </h4>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <Link to="/inventory/expiry-report" className="btn btn-sm btn-outline-primary" style={{ fontSize: '12px' }}>
                <i className="fa-solid fa-file-excel me-1" /> Expiry Report
              </Link>
              <Link to="/approvals" className="btn btn-sm btn-outline-warning text-dark" style={{ fontSize: '12px' }}>
                <i className="fa-solid fa-inbox me-1" /> Approvals ({roleMetrics.pending_approvals_count})
              </Link>
            </div>
          </div>

          <div className="row g-3">
            {/* 1. Near Expiry Stock Value */}
            <div className="col-md-3">
              <Link to="/inventory/expiry-report" className="card shadow-sm border-0 text-decoration-none h-100" style={{ borderRadius: '10px', background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.08), rgba(239, 68, 68, 0.02))', borderLeft: '4px solid #ef4444' }}>
                <div className="card-body p-3">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <span className="text-muted font-bold" style={{ fontSize: '12px' }}>NEAR-EXPIRY VALUE (&lt;=30D)</span>
                    <i className="fa-solid fa-hourglass-half text-danger" />
                  </div>
                  <h3 style={{ margin: '0.5rem 0', fontWeight: 700, color: '#dc2626' }}>
                    ₹{roleMetrics.near_expiry_30d_value?.toLocaleString('en-IN')}
                  </h3>
                  <div style={{ fontSize: '11px', color: '#6b7280' }}>
                    <span>60d: ₹{roleMetrics.near_expiry_60d_value?.toLocaleString('en-IN')}</span> &bull; <span>90d: ₹{roleMetrics.near_expiry_90d_value?.toLocaleString('en-IN')}</span>
                  </div>
                </div>
              </Link>
            </div>

            {/* 2. Pending Approvals */}
            <div className="col-md-3">
              <Link to="/approvals" className="card shadow-sm border-0 text-decoration-none h-100" style={{ borderRadius: '10px', background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.08), rgba(245, 158, 11, 0.02))', borderLeft: '4px solid #f59e0b' }}>
                <div className="card-body p-3">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <span className="text-muted font-bold" style={{ fontSize: '12px' }}>PENDING GOVERNANCE</span>
                    <i className="fa-solid fa-shield-halved text-warning" />
                  </div>
                  <h3 style={{ margin: '0.5rem 0', fontWeight: 700, color: '#d97706' }}>
                    {roleMetrics.pending_approvals_count}
                  </h3>
                  <div style={{ fontSize: '11px', color: '#6b7280' }}>
                    Audits, Markdowns &amp; Return Claims
                  </div>
                </div>
              </Link>
            </div>

            {/* 3. Monthly Scrap Loss */}
            <div className="col-md-3">
              <Link to="/store-ops/scrap-ledger" className="card shadow-sm border-0 text-decoration-none h-100" style={{ borderRadius: '10px', background: 'linear-gradient(135deg, rgba(107, 114, 128, 0.08), rgba(107, 114, 128, 0.02))', borderLeft: '4px solid #6b7280' }}>
                <div className="card-body p-3">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <span className="text-muted font-bold" style={{ fontSize: '12px' }}>SCRAP LEDGER VALUE</span>
                    <i className="fa-solid fa-dumpster text-secondary" />
                  </div>
                  <h3 style={{ margin: '0.5rem 0', fontWeight: 700, color: '#4b5563' }}>
                    ₹{roleMetrics.scrap_month_value?.toLocaleString('en-IN')}
                  </h3>
                  <div style={{ fontSize: '11px', color: '#6b7280' }}>
                    Non-saleable Damaged/Expired Stock
                  </div>
                </div>
              </Link>
            </div>

            {/* 4. Push Sale Sell-Through */}
            <div className="col-md-3">
              <Link to="/store-ops/markdowns" className="card shadow-sm border-0 text-decoration-none h-100" style={{ borderRadius: '10px', background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08), rgba(16, 185, 129, 0.02))', borderLeft: '4px solid #10b981' }}>
                <div className="card-body p-3">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <span className="text-muted font-bold" style={{ fontSize: '12px' }}>PUSH SALE SELL-THROUGH</span>
                    <i className="fa-solid fa-tags text-success" />
                  </div>
                  <h3 style={{ margin: '0.5rem 0', fontWeight: 700, color: '#059669' }}>
                    {roleMetrics.push_sale_sell_through_pct}%
                  </h3>
                  <div style={{ fontSize: '11px', color: '#6b7280' }}>
                    Markdown Promotion Liquidation Rate
                  </div>
                </div>
              </Link>
            </div>

            {/* 5. Role-Specific Supplemental Cards */}
            {(roleMetrics.role === 'accounts' || roleMetrics.role === 'admin') && (
              <div className="col-md-6">
                <Link to="/finance/debit-notes" className="card shadow-sm border-0 text-decoration-none" style={{ borderRadius: '10px', borderLeft: '4px solid #6366f1', background: '#f8fafc' }}>
                  <div className="card-body p-3" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div className="text-muted font-bold" style={{ fontSize: '12px' }}>VENDOR DEBIT NOTES RECONCILIATION</div>
                      <h4 style={{ margin: '0.25rem 0 0', fontWeight: 700, color: '#4f46e5' }}>
                        ₹{roleMetrics.open_debit_notes_amount?.toLocaleString('en-IN')} <span style={{ fontSize: '13px', fontWeight: 500, color: '#64748b' }}>({roleMetrics.open_debit_notes_count} open debit notes)</span>
                      </h4>
                    </div>
                    <span className="btn btn-sm btn-outline-indigo" style={{ fontSize: '12px', border: '1px solid #6366f1', color: '#6366f1' }}>
                      Reconcile <i className="fa-solid fa-arrow-right ms-1" />
                    </span>
                  </div>
                </Link>
              </div>
            )}

            {(roleMetrics.role === 'warehouse_picker' || roleMetrics.role === 'admin') && (
              <div className="col-md-6">
                <Link to="/inventory/pick-list" className="card shadow-sm border-0 text-decoration-none" style={{ borderRadius: '10px', borderLeft: '4px solid #0284c7', background: '#f8fafc' }}>
                  <div className="card-body p-3" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div className="text-muted font-bold" style={{ fontSize: '12px' }}>CENTRAL DC PENDING FEFO PICKS</div>
                      <h4 style={{ margin: '0.25rem 0 0', fontWeight: 700, color: '#0284c7' }}>
                        {roleMetrics.dc_pending_picks_count} Orders Awaiting Pick &amp; Dispatch
                      </h4>
                    </div>
                    <span className="btn btn-sm btn-outline-primary" style={{ fontSize: '12px' }}>
                      Pick FEFO <i className="fa-solid fa-arrow-right ms-1" />
                    </span>
                  </div>
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

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


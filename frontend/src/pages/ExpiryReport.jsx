import React, { useState, useEffect } from 'react';
import { reportsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/StatusBadge';

export default function ExpiryReport() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('expiry'); // 'expiry' | 'dump'
  const [daysPreset, setDaysPreset] = useState(30);
  const [reportData, setReportData] = useState({ records: [], total_units: 0, total_cost_value: 0 });
  const [dumpStock, setDumpStock] = useState([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [search, setSearch] = useState('');
  const [feedback, setFeedback] = useState(null);

  const fetchExpiryReport = async () => {
    try {
      setLoading(true);
      const res = await reportsAPI.getExpiryStock({ days: daysPreset, category: categoryFilter || undefined });
      if (res?.success) {
        setReportData(res.report || { records: [], total_units: 0, total_cost_value: 0 });
      }
    } catch (err) {
      setFeedback({ type: 'danger', message: err.message || 'Failed to fetch expiry stock report.' });
    } finally {
      setLoading(false);
    }
  };

  const fetchDumpStock = async () => {
    try {
      const res = await reportsAPI.getDumpStock({ days: daysPreset, lookback: 30 });
      if (res?.success) {
        setDumpStock(res.dump_stock || []);
      }
    } catch (err) {
      console.error('Failed to load dump stock alert:', err);
    }
  };

  useEffect(() => {
    fetchExpiryReport();
    fetchDumpStock();
  }, [daysPreset, categoryFilter]);

  const exportCSV = () => {
    const records = reportData.records || [];
    if (!records.length) return;

    const headers = ['Product ID', 'Product Name', 'Category', 'Batch Number', 'Expiry Date', 'Days to Expiry', 'Quantity', 'Cost Price (Rs)', 'Total Cost (Rs)', 'Location', 'Supplier'];
    const rows = records.map(r => [
      r.product_id,
      `"${r.product_name}"`,
      r.category,
      r.batch_number,
      r.expiry_date,
      r.days_to_expiry,
      r.quantity,
      r.cost_price,
      r.inventory_value_cost,
      `"${r.location_name}"`,
      `"${r.supplier_name}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `expiry_report_${daysPreset}d_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredRecords = (reportData.records || []).filter(r => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.product_name.toLowerCase().includes(q) ||
      r.batch_number.toLowerCase().includes(q) ||
      (r.location_name && r.location_name.toLowerCase().includes(q))
    );
  });

  const expiredCount = (reportData.records || []).filter(r => r.days_to_expiry < 0).length;
  const criticalCount = (reportData.records || []).filter(r => r.days_to_expiry >= 0 && r.days_to_expiry <= 7).length;

  return (
    <div className="expiry-report-page container" style={{ padding: '1.5rem 1rem' }}>
      {/* Header */}
      <div className="page-header mb-4 flex-between">
        <div>
          <h2 className="page-title" style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0 }}>
            <i className="fa-solid fa-calendar-xmark text-danger me-2" />
            Expiry Stock &amp; Markdown Intelligence
          </h2>
          <p className="text-muted" style={{ margin: '0.25rem 0 0' }}>
            Multi-store expiry calendar, days-of-cover dump detection, and near-expiry risk valuation.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="btn btn-outline" onClick={exportCSV} disabled={!filteredRecords.length}>
            <i className="fa-solid fa-file-excel text-success me-2" /> Export CSV
          </button>
          <button className="btn btn-primary" onClick={fetchExpiryReport} disabled={loading}>
            <i className="fa-solid fa-rotate me-2" /> Refresh
          </button>
        </div>
      </div>

      {feedback && (
        <div className={`alert alert-${feedback.type} mb-4 flex-between`} style={{ padding: '0.75rem 1rem' }}>
          <span>{feedback.message}</span>
          <button className="btn-close" onClick={() => setFeedback(null)}>×</button>
        </div>
      )}

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="kpi-card stat-card" style={{ padding: '1.25rem', borderRadius: '10px', background: 'var(--card-bg, #fff)', border: '1px solid var(--border-color, #e2e8f0)' }}>
          <div className="text-muted" style={{ fontSize: '0.85rem', fontWeight: 600 }}>Total At-Risk Units</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#0f172a', margin: '0.25rem 0' }}>
            {(reportData.total_units || 0).toLocaleString()}
          </div>
          <div className="text-muted" style={{ fontSize: '0.8rem' }}>Within next {daysPreset} days</div>
        </div>

        <div className="kpi-card stat-card" style={{ padding: '1.25rem', borderRadius: '10px', background: 'var(--card-bg, #fff)', border: '1px solid var(--border-color, #e2e8f0)' }}>
          <div className="text-muted" style={{ fontSize: '0.85rem', fontWeight: 600 }}>Inventory Cost at Risk</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#dc2626', margin: '0.25rem 0' }}>
            ₹{(reportData.total_cost_value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-muted" style={{ fontSize: '0.8rem' }}>Valued at cost price</div>
        </div>

        <div className="kpi-card stat-card" style={{ padding: '1.25rem', borderRadius: '10px', background: 'var(--card-bg, #fff)', border: '1px solid var(--border-color, #e2e8f0)' }}>
          <div className="text-muted" style={{ fontSize: '0.85rem', fontWeight: 600 }}>Expired / Critical (≤7d)</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#b91c1c', margin: '0.25rem 0' }}>
            {expiredCount} <span style={{ fontSize: '1rem', color: '#ea580c', fontWeight: 500 }}>/ {criticalCount}</span>
          </div>
          <div className="text-muted" style={{ fontSize: '0.8rem' }}>Require immediate markdown or pull</div>
        </div>

        <div className="kpi-card stat-card" style={{ padding: '1.25rem', borderRadius: '10px', background: 'var(--card-bg, #fff)', border: '1px solid var(--border-color, #e2e8f0)' }}>
          <div className="text-muted" style={{ fontSize: '0.85rem', fontWeight: 600 }}>Dump Stock Risk Lots</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#7c3aed', margin: '0.25rem 0' }}>
            {dumpStock.length}
          </div>
          <div className="text-muted" style={{ fontSize: '0.8rem' }}>Stock Cover &gt; Days to Expiry</div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '2px solid var(--border-color, #e2e8f0)', marginBottom: '1.5rem' }}>
        <button
          onClick={() => setActiveTab('expiry')}
          style={{
            padding: '0.65rem 1.25rem',
            fontWeight: 600,
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'expiry' ? '3px solid #2563eb' : '3px solid transparent',
            color: activeTab === 'expiry' ? '#2563eb' : '#64748b',
            cursor: 'pointer'
          }}
        >
          <i className="fa-solid fa-clock-rotate-left me-2" /> Expiry Schedule &amp; Batches ({filteredRecords.length})
        </button>
        <button
          onClick={() => setActiveTab('dump')}
          style={{
            padding: '0.65rem 1.25rem',
            fontWeight: 600,
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'dump' ? '3px solid #7c3aed' : '3px solid transparent',
            color: activeTab === 'dump' ? '#7c3aed' : '#64748b',
            cursor: 'pointer'
          }}
        >
          <i className="fa-solid fa-triangle-exclamation text-warning me-2" /> Dump Stock Risk Detection ({dumpStock.length})
        </button>
      </div>

      {/* Tab 1: Expiry Batches */}
      {activeTab === 'expiry' && (
        <>
          {/* Controls Bar */}
          <div className="card" style={{ padding: '1rem', borderRadius: '10px', marginBottom: '1.25rem', background: 'var(--card-bg, #fff)' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', justifyContent: 'space-between' }}>
              {/* Presets */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Horizon:</span>
                {[30, 60, 90].map((d) => (
                  <button
                    key={d}
                    onClick={() => setDaysPreset(d)}
                    className={`btn btn-sm ${daysPreset === d ? 'btn-primary' : 'btn-outline'}`}
                    style={{ borderRadius: '6px', fontWeight: 600 }}
                  >
                    {d} Days
                  </button>
                ))}
              </div>

              {/* Filters */}
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', flex: 1, justifyContent: 'flex-end' }}>
                <input
                  type="text"
                  placeholder="Search item, batch, store..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="form-control form-control-sm"
                  style={{ maxWidth: '240px' }}
                />
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="form-control form-control-sm"
                  style={{ maxWidth: '180px' }}
                >
                  <option value="">All Categories</option>
                  <option value="Groceries">Groceries</option>
                  <option value="Dairy & Bakery">Dairy &amp; Bakery</option>
                  <option value="Snacks & Beverages">Snacks &amp; Beverages</option>
                  <option value="Personal Care">Personal Care</option>
                </select>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="card" style={{ borderRadius: '10px', overflow: 'hidden', background: 'var(--card-bg, #fff)' }}>
            <div className="table-responsive">
              <table className="table table-hover mb-0" style={{ width: '100%', fontSize: '0.9rem' }}>
                <thead style={{ background: 'var(--header-bg, #f8fafc)', borderBottom: '2px solid #e2e8f0' }}>
                  <tr>
                    <th style={{ padding: '0.75rem 1rem' }}>Item &amp; Category</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Batch #</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Expiry Date</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Days Left</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Saleable Qty</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Cost Price</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Cost Value</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Location</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan="9" style={{ textAlign: 'center', padding: '3rem' }}>
                        <i className="fa-solid fa-spinner fa-spin fa-2x text-muted mb-2" /><br />
                        Loading near-expiry stock data...
                      </td>
                    </tr>
                  ) : filteredRecords.length === 0 ? (
                    <tr>
                      <td colSpan="9" style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
                        <i className="fa-solid fa-shield-halved fa-2x text-success mb-2" /><br />
                        No batches expiring within {daysPreset} days found matching criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredRecords.map((r, i) => {
                      const isExpired = r.days_to_expiry < 0;
                      const isCritical = r.days_to_expiry >= 0 && r.days_to_expiry <= 7;
                      const isWarning = r.days_to_expiry > 7 && r.days_to_expiry <= 15;

                      return (
                        <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <div style={{ fontWeight: 600, color: '#0f172a' }}>{r.product_name}</div>
                            <div className="text-muted" style={{ fontSize: '0.8rem' }}>{r.category} • SKU #{r.product_id}</div>
                          </td>
                          <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontWeight: 600 }}>
                            {r.batch_number}
                          </td>
                          <td style={{ padding: '0.75rem 1rem', color: isExpired ? '#dc2626' : '#334155', fontWeight: isCritical || isExpired ? 600 : 400 }}>
                            {r.expiry_date}
                          </td>
                          <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                            <span
                              style={{
                                padding: '0.2rem 0.6rem',
                                borderRadius: '999px',
                                fontSize: '0.8rem',
                                fontWeight: 700,
                                background: isExpired ? '#fee2e2' : isCritical ? '#ffedd5' : isWarning ? '#fef9c3' : '#e0f2fe',
                                color: isExpired ? '#991b1b' : isCritical ? '#9a3412' : isWarning ? '#854d0e' : '#0369a1'
                              }}
                            >
                              {isExpired ? `${Math.abs(r.days_to_expiry)}d ago` : `${r.days_to_expiry} days`}
                            </span>
                          </td>
                          <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600 }}>
                            {r.quantity}
                          </td>
                          <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                            ₹{r.cost_price.toFixed(2)}
                          </td>
                          <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600, color: isExpired ? '#dc2626' : '#0f172a' }}>
                            ₹{r.inventory_value_cost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <span className="badge bg-secondary" style={{ fontSize: '0.8rem' }}>
                              {r.location_name}
                            </span>
                          </td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            {isExpired ? (
                              <StatusBadge status="EXPIRED" />
                            ) : isCritical ? (
                              <span className="badge bg-danger" style={{ fontSize: '0.8rem' }}>CRITICAL (≤7d)</span>
                            ) : isWarning ? (
                              <span className="badge bg-warning text-dark" style={{ fontSize: '0.8rem' }}>PUSH SALE (≤15d)</span>
                            ) : (
                              <StatusBadge status="SALEABLE" />
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Tab 2: Dump Stock Detection */}
      {activeTab === 'dump' && (
        <div className="card" style={{ borderRadius: '10px', overflow: 'hidden', background: 'var(--card-bg, #fff)' }}>
          <div style={{ padding: '1rem', borderBottom: '1px solid #e2e8f0', background: '#faf5ff' }}>
            <h5 style={{ margin: 0, color: '#6b21a8', fontWeight: 700 }}>
              <i className="fa-solid fa-chart-line me-2" /> Dump Stock Detection Rule: Days of Stock Cover &gt; Days to Expiry
            </h5>
            <p className="text-muted mb-0" style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
              Identifies lots whose current sell-through velocity is too slow to exhaust stock before shelf life ends.
            </p>
          </div>
          <div className="table-responsive">
            <table className="table table-hover mb-0" style={{ width: '100%', fontSize: '0.9rem' }}>
              <thead style={{ background: 'var(--header-bg, #f8fafc)', borderBottom: '2px solid #e2e8f0' }}>
                <tr>
                  <th style={{ padding: '0.75rem 1rem' }}>Product &amp; Facility</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Batch #</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Days to Expiry</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Current Stock</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Daily Run-Rate</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Stock Cover</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Unsellable Risk</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Risk Severity</th>
                </tr>
              </thead>
              <tbody>
                {dumpStock.length === 0 ? (
                  <tr>
                    <td colSpan="8" style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
                      <i className="fa-solid fa-circle-check fa-2x text-success mb-2" /><br />
                      No slow-moving dump stock detected. All near-expiry lots have sufficient velocity.
                    </td>
                  </tr>
                ) : (
                  dumpStock.map((d, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ fontWeight: 600 }}>{d.product_name}</div>
                        <div className="text-muted" style={{ fontSize: '0.8rem' }}>{d.location_name}</div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontWeight: 600 }}>
                        {d.batch_number}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'center', fontWeight: 600, color: '#dc2626' }}>
                        {d.days_to_expiry}d
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600 }}>
                        {d.current_stock}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                        {d.avg_daily_sales} / day
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'center', fontWeight: 700, color: '#b91c1c' }}>
                        {d.days_of_stock_cover} days
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 700, color: '#dc2626' }}>
                        {d.unsellable_units_at_risk} units
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span className={`badge ${d.risk_severity === 'CRITICAL' ? 'bg-danger' : 'bg-warning text-dark'}`}>
                          {d.risk_severity}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}


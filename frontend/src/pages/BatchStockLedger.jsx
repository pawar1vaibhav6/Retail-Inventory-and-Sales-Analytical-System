import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { batchAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/StatusBadge';

export default function BatchStockLedger() {
  const { user } = useAuth();
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState(null);
  const [search, setSearch] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const isStoreScoped = ['store_executive', 'store_supervisor', 'cashier'].includes(user?.role);

  const fetchBatchStock = async () => {
    try {
      setLoading(true);
      const params = {};
      if (locationFilter) params.location_id = locationFilter;
      if (statusFilter) params.status = statusFilter;

      const res = await batchAPI.getBatchStock(params);
      if (res?.success) {
        setBatches(res.batches || []);
      }
    } catch (err) {
      setFeedback({ type: 'danger', message: err.message || 'Failed to load batch stock ledger.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBatchStock();
  }, [locationFilter, statusFilter]);

  const filteredBatches = batches.filter((b) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      b.product_name.toLowerCase().includes(q) ||
      b.batch_number.toLowerCase().includes(q) ||
      (b.location_name && b.location_name.toLowerCase().includes(q)) ||
      String(b.product_id).includes(q)
    );
  });

  // KPI Calculations
  const totalBatches = batches.length;
  const nearExpiryCount = batches.filter((b) => b.days_to_expiry !== null && b.days_to_expiry >= 0 && b.days_to_expiry <= 30).length;
  const expiredCount = batches.filter((b) => b.days_to_expiry !== null && b.days_to_expiry < 0).length;
  const totalSaleableUnits = batches.reduce((acc, b) => acc + (b.quantity_saleable || 0), 0);

  return (
    <div className="batch-ledger-container container" style={{ padding: '1.5rem 1rem' }}>
      {/* Header */}
      <div className="page-header mb-4 flex-between">
        <div>
          <h2>
            <i className="fa-solid fa-layer-group" style={{ marginRight: 8, color: 'var(--accent)' }} />
            Multi-Location Batch Stock Ledger
          </h2>
          <p className="subtitle">
            Per-batch stock tracking across Central DC and retail stores: monitor shelf-life horizons, saleable balances, and quarantined lots.
          </p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={fetchBatchStock}
            disabled={loading}
          >
            <i className={`fa-solid fa-arrows-rotate ${loading ? 'fa-spin' : ''}`} /> Refresh Ledger
          </button>
        </div>
      </div>

      {feedback && (
        <div className={`alert alert-${feedback.type} mb-4`}>
          <div className="alert-content">
            <i className={`fa-solid ${feedback.type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation'}`} />
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            className="btn-close"
            onClick={() => setFeedback(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <i className="fa-solid fa-xmark" />
          </button>
        </div>
      )}

      {/* KPI Summary Cards */}
      <div
        className="kpi-grid mb-4"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1.25rem'
        }}
      >
        <div className="card kpi-card" style={{ borderLeft: '4px solid #3b82f6', padding: '1.25rem' }}>
          <div className="flex-between mb-2">
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)' }}>Total Tracked Batches</span>
            <i className="fa-solid fa-boxes-stacked" style={{ color: '#3b82f6', fontSize: '1.2rem' }} />
          </div>
          <div style={{ fontSize: '1.85rem', fontWeight: 700 }}>{totalBatches}</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Active in inventory system</div>
        </div>

        <div className="card kpi-card" style={{ borderLeft: '4px solid #f59e0b', padding: '1.25rem' }}>
          <div className="flex-between mb-2">
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)' }}>Near-Expiry Batches</span>
            <i className="fa-solid fa-triangle-exclamation" style={{ color: '#f59e0b', fontSize: '1.2rem' }} />
          </div>
          <div style={{ fontSize: '1.85rem', fontWeight: 700, color: '#b45309' }}>{nearExpiryCount}</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Expiring in ≤ 30 days</div>
        </div>

        <div className="card kpi-card" style={{ borderLeft: '4px solid #ef4444', padding: '1.25rem' }}>
          <div className="flex-between mb-2">
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)' }}>Expired Stock Batches</span>
            <i className="fa-solid fa-ban" style={{ color: '#ef4444', fontSize: '1.2rem' }} />
          </div>
          <div style={{ fontSize: '1.85rem', fontWeight: 700, color: '#dc2626' }}>{expiredCount}</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>POS sale blocked; RTV/Scrap eligible</div>
        </div>

        <div className="card kpi-card" style={{ borderLeft: '4px solid #10b981', padding: '1.25rem' }}>
          <div className="flex-between mb-2">
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)' }}>Total Saleable Units</span>
            <i className="fa-solid fa-circle-check" style={{ color: '#10b981', fontSize: '1.2rem' }} />
          </div>
          <div style={{ fontSize: '1.85rem', fontWeight: 700, color: '#059669' }}>
            {totalSaleableUnits.toLocaleString()}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Available across facilities</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="card mb-4">
        <div className="card-body py-3">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 12, alignItems: 'center' }}>
            <div className="filter-input-wrap">
              <i className="fa-solid fa-magnifying-glass" />
              <input
                type="text"
                className="form-control"
                placeholder="Search by product name, batch number, or location..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {/* Location Selector (Disabled for store-scoped users) */}
            <select
              className="form-control"
              style={{ minWidth: '200px' }}
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              disabled={isStoreScoped}
            >
              {isStoreScoped ? (
                <option value="">Store Scoped ({user?.store_id ? `Store #${user.store_id}` : 'Assigned Store'})</option>
              ) : (
                <>
                  <option value="">All Locations (DC + Stores)</option>
                  <option value="1">Central DC Mumbai (DC-01)</option>
                  <option value="2">Store Thane (STORE-101)</option>
                  <option value="3">Store Pune (STORE-102)</option>
                </>
              )}
            </select>

            {/* Status Filter */}
            <select
              className="form-control"
              style={{ minWidth: '160px' }}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All Statuses</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="SCRAP">SCRAP</option>
              <option value="BLOCKED">BLOCKED</option>
            </select>

            {(search || locationFilter || statusFilter) && (
              <button
                type="button"
                className="btn btn-outline-danger"
                onClick={() => {
                  setSearch('');
                  setLocationFilter('');
                  setStatusFilter('');
                }}
              >
                Reset
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Batch Ledger Table Card */}
      <div className="card">
        <div className="card-header flex-between">
          <h4>
            <i className="fa-solid fa-table" style={{ marginRight: 8 }} />
            Stock Ledger by Batch &amp; Location ({filteredBatches.length})
          </h4>
          <span className="badge badge-primary">{filteredBatches.length} Entries</span>
        </div>
        <div className="card-body p-0">
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Batch / Lot No.</th>
                  <th>Location</th>
                  <th>Mfg Date</th>
                  <th>Expiry Date</th>
                  <th>Days Remaining</th>
                  <th>Saleable Qty</th>
                  <th>Reserved / Scrap</th>
                  <th>Unit Cost / MRP</th>
                  <th>Status</th>
                  <th>Traceability</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={11} style={{ textAlign: 'center', padding: '2rem' }}>
                      <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 8 }} /> Loading batch stock records...
                    </td>
                  </tr>
                ) : filteredBatches.length === 0 ? (
                  <tr>
                    <td colSpan={11} style={{ textAlign: 'center', padding: '2rem' }}>
                      No batch inventory records found matching your filters.
                    </td>
                  </tr>
                ) : (
                  filteredBatches.map((b) => {
                    const days = b.days_to_expiry;
                    let expiryBadge;
                    if (days === null || days === undefined) {
                      expiryBadge = <span className="badge badge-secondary">Non-Perishable</span>;
                    } else if (days < 0) {
                      expiryBadge = (
                        <span className="badge badge-danger">
                          <i className="fa-solid fa-ban" style={{ marginRight: 4 }} />
                          Expired ({Math.abs(days)}d ago)
                        </span>
                      );
                    } else if (days <= 30) {
                      expiryBadge = (
                        <span className="badge badge-warning" style={{ fontWeight: 700 }}>
                          <i className="fa-solid fa-clock" style={{ marginRight: 4 }} />
                          {days} Days Left
                        </span>
                      );
                    } else {
                      expiryBadge = (
                        <span className="badge badge-success">
                          <i className="fa-solid fa-check" style={{ marginRight: 4 }} />
                          {days} Days Left
                        </span>
                      );
                    }

                    return (
                      <tr key={`${b.batch_id}-${b.location_id || 0}`}>
                        <td>
                          <strong>{b.product_name}</strong>
                          <br />
                          <small style={{ color: 'var(--text-muted)' }}>ID #{b.product_id}</small>
                        </td>
                        <td>
                          <code style={{ fontSize: '0.85rem', fontWeight: 700 }}>{b.batch_number}</code>
                        </td>
                        <td>
                          <span className="badge badge-secondary">
                            <i className="fa-solid fa-warehouse" style={{ marginRight: 4 }} />
                            {b.location_name}
                          </span>
                        </td>
                        <td style={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                          {b.mfg_date || '—'}
                        </td>
                        <td style={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                          <strong>{b.expiry_date}</strong>
                        </td>
                        <td>{expiryBadge}</td>
                        <td>
                          <strong style={{ fontSize: '0.95rem', color: b.quantity_saleable > 0 ? 'var(--text)' : '#ef4444' }}>
                            {b.quantity_saleable}
                          </strong>
                        </td>
                        <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                          {b.quantity_reserved || 0} res / {b.quantity_scrap || 0} scrap
                        </td>
                        <td style={{ fontSize: '0.85rem' }}>
                          ₹{b.cost_price?.toFixed(2)} / ₹{b.mrp?.toFixed(2)}
                        </td>
                        <td>
                          <StatusBadge status={b.status} size="sm" />
                        </td>
                        <td>
                          <Link
                            to={`/inventory/traceability?batch=${encodeURIComponent(b.batch_number)}`}
                            className="btn btn-sm btn-outline-primary"
                            style={{ fontSize: '0.75rem', padding: '0.2rem 0.55rem' }}
                            title="Trace complete lifecycle of this batch"
                          >
                            <i className="fa-solid fa-route" style={{ marginRight: 4 }} /> Trace
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}


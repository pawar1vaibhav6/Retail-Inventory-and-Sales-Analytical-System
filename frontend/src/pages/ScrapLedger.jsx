import React, { useState, useEffect } from 'react';
import { returnsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/StatusBadge';

export default function ScrapLedger() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [facilityFilter, setFacilityFilter] = useState('');
  const [feedback, setFeedback] = useState(null);

  const fetchScrapLedger = async () => {
    try {
      setLoading(true);
      const res = await returnsAPI.getScrapLedger();
      if (res?.success) {
        setItems(res.scrap_ledger || []);
      }
    } catch (err) {
      setFeedback({ type: 'danger', message: err.message || 'Failed to load scrap ledger.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchScrapLedger();
  }, []);

  const filteredItems = items.filter((item) => {
    if (facilityFilter && String(item.location_id) !== String(facilityFilter)) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      item.product_name.toLowerCase().includes(q) ||
      item.batch_number.toLowerCase().includes(q) ||
      item.location_name.toLowerCase().includes(q) ||
      item.supplier_name.toLowerCase().includes(q)
    );
  });

  const totalScrapUnits = items.reduce((acc, i) => acc + (i.quantity_scrap || 0), 0);
  const totalScrapValue = items.reduce((acc, i) => acc + (i.scrap_value || 0), 0);

  return (
    <div className="scrap-ledger-page container" style={{ padding: '1.5rem 1rem' }}>
      {/* Header */}
      <div className="page-header mb-4 flex-between">
        <div>
          <h2 className="page-title" style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0 }}>
            <i className="fa-solid fa-dumpster text-danger me-2" />
            Scrap &amp; Damaged Inventory Ledger
          </h2>
          <p className="text-muted" style={{ margin: '0.25rem 0 0' }}>
            Non-saleable batch inventory ledger, write-off cost valuation, and vendor return pull tracking.
          </p>
        </div>
        <button className="btn btn-outline" onClick={fetchScrapLedger} disabled={loading}>
          <i className="fa-solid fa-rotate me-2" /> Refresh
        </button>
      </div>

      {feedback && (
        <div className={`alert alert-${feedback.type} mb-4 flex-between`} style={{ padding: '0.75rem 1rem' }}>
          <span>{feedback.message}</span>
          <button className="btn-close" onClick={() => setFeedback(null)}>×</button>
        </div>
      )}

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="card" style={{ padding: '1.25rem', borderRadius: '10px', background: 'var(--card-bg, #fff)' }}>
          <div className="text-muted" style={{ fontSize: '0.85rem', fontWeight: 600 }}>Total Scrapped Units</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#dc2626', margin: '0.25rem 0' }}>
            {totalScrapUnits.toLocaleString()}
          </div>
          <div className="text-muted" style={{ fontSize: '0.8rem' }}>Isolated from POS sale</div>
        </div>

        <div className="card" style={{ padding: '1.25rem', borderRadius: '10px', background: 'var(--card-bg, #fff)' }}>
          <div className="text-muted" style={{ fontSize: '0.85rem', fontWeight: 600 }}>Total Write-Off Valuation</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#b91c1c', margin: '0.25rem 0' }}>
            ₹{totalScrapValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-muted" style={{ fontSize: '0.8rem' }}>Valued at cost price</div>
        </div>

        <div className="card" style={{ padding: '1.25rem', borderRadius: '10px', background: 'var(--card-bg, #fff)' }}>
          <div className="text-muted" style={{ fontSize: '0.85rem', fontWeight: 600 }}>Scrapped Lots Count</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#0f172a', margin: '0.25rem 0' }}>
            {items.length}
          </div>
          <div className="text-muted" style={{ fontSize: '0.8rem' }}>Across all retail facilities</div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="card mb-4" style={{ padding: '1rem', borderRadius: '10px', background: 'var(--card-bg, #fff)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between', alignItems: 'center' }}>
          <input
            type="text"
            placeholder="Search product, batch #, supplier..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="form-control form-control-sm"
            style={{ maxWidth: '300px' }}
          />

          <select
            value={facilityFilter}
            onChange={(e) => setFacilityFilter(e.target.value)}
            className="form-control form-control-sm"
            style={{ maxWidth: '200px' }}
          >
            <option value="">All Facilities</option>
            <option value="1">Central DC</option>
            <option value="2">Store 101 - Bandra</option>
            <option value="3">Store 102 - Thane</option>
          </select>
        </div>
      </div>

      {/* Scrap Table */}
      <div className="card" style={{ borderRadius: '10px', overflow: 'hidden', background: 'var(--card-bg, #fff)' }}>
        <div className="table-responsive">
          <table className="table table-hover mb-0" style={{ width: '100%', fontSize: '0.9rem' }}>
            <thead style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
              <tr>
                <th style={{ padding: '0.75rem 1rem' }}>Product &amp; Category</th>
                <th style={{ padding: '0.75rem 1rem' }}>Batch #</th>
                <th style={{ padding: '0.75rem 1rem' }}>Facility</th>
                <th style={{ padding: '0.75rem 1rem' }}>Supplier</th>
                <th style={{ padding: '0.75rem 1rem' }}>Expiry Date</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Unit Cost</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Scrap Qty</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Write-Off Value</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', padding: '3rem' }}>
                    <i className="fa-solid fa-spinner fa-spin fa-2x text-muted mb-2" /><br />
                    Loading scrap ledger...
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
                    <i className="fa-solid fa-circle-check fa-2x text-success mb-2" /><br />
                    No scrapped or damaged items in the ledger matching criteria.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ fontWeight: 600 }}>{item.product_name}</div>
                      <div className="text-muted" style={{ fontSize: '0.8rem' }}>{item.category} • SKU #{item.product_id}</div>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontWeight: 600 }}>{item.batch_number}</td>
                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem' }}>{item.location_name}</td>
                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem' }}>{item.supplier_name}</td>
                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem' }}>{item.expiry_date}</td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>₹{item.cost_price.toFixed(2)}</td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 700, color: '#dc2626' }}>
                      {item.quantity_scrap}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 700 }}>
                      ₹{item.scrap_value.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                      <StatusBadge status="SCRAP" />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


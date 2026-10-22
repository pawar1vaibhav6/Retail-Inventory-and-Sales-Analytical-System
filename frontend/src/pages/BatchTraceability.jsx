import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { batchAPI } from '../services/api';
import StatusBadge from '../components/StatusBadge';

export default function BatchTraceability() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialBatch = searchParams.get('batch') || '';

  const [batchNumber, setBatchNumber] = useState(initialBatch);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [traceData, setTraceData] = useState(null);

  const fetchTraceability = async (targetBatch) => {
    if (!targetBatch || !targetBatch.trim()) return;

    try {
      setLoading(true);
      setFeedback(null);
      const res = await batchAPI.getTraceability(targetBatch.trim());
      if (res?.success && res.traceability) {
        setTraceData(res.traceability);
      } else {
        setFeedback({ type: 'warning', message: res?.message || `No batch found matching "${targetBatch}".` });
        setTraceData(null);
      }
    } catch (err) {
      setFeedback({ type: 'danger', message: err.message || 'Traceability query failed.' });
      setTraceData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialBatch) {
      fetchTraceability(initialBatch);
    }
  }, [initialBatch]);

  const handleSearch = (e) => {
    e.preventDefault();
    if (!batchNumber.trim()) return;
    setSearchParams({ batch: batchNumber.trim() });
    fetchTraceability(batchNumber.trim());
  };

  const getMovementIcon = (type) => {
    switch (type) {
      case 'GRN_INWARD':
        return { icon: 'fa-truck-ramp-box', color: '#2563eb', bg: '#eff6ff' };
      case 'TRANSFER_DISPATCH':
      case 'TRANSFER_RECEIVE':
        return { icon: 'fa-truck', color: '#0284c7', bg: '#f0f9ff' };
      case 'SALE':
        return { icon: 'fa-cash-register', color: '#059669', bg: '#ecfdf5' };
      case 'AUDIT_ADJUSTMENT':
        return { icon: 'fa-clipboard-check', color: '#d97706', bg: '#fffbeb' };
      case 'MARKDOWN':
        return { icon: 'fa-tags', color: '#7c3aed', bg: '#f5f3ff' };
      case 'VENDOR_RETURN':
        return { icon: 'fa-file-invoice-dollar', color: '#dc2626', bg: '#fef2f2' };
      case 'SCRAP_DISCARD':
        return { icon: 'fa-trash-can', color: '#991b1b', bg: '#fef2f2' };
      default:
        return { icon: 'fa-box', color: '#64748b', bg: '#f1f5f9' };
    }
  };

  return (
    <div className="traceability-container container" style={{ padding: '1.5rem 1rem' }}>
      {/* Header */}
      <div className="page-header mb-4 flex-between">
        <div>
          <h2>
            <i className="fa-solid fa-route" style={{ marginRight: 8, color: 'var(--accent)' }} />
            End-to-End Batch Traceability Explorer
          </h2>
          <p className="subtitle">
            DMart-style audit traceability: track every stock movement of a specific batch from Central DC GRN receipt through to store transfers, POS sales, audits, and vendor returns.
          </p>
        </div>
        <div className="header-actions">
          <Link to="/inventory/batches" className="btn btn-outline-secondary">
            <i className="fa-solid fa-layer-group" /> View All Batches
          </Link>
        </div>
      </div>

      {feedback && (
        <div className={`alert alert-${feedback.type} mb-4`}>
          <div className="alert-content">
            <i className={`fa-solid ${feedback.type === 'warning' ? 'fa-triangle-exclamation' : 'fa-circle-exclamation'}`} />
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

      {/* Batch Search Form */}
      <div className="card mb-4" style={{ borderTop: '4px solid var(--accent)' }}>
        <div className="card-body py-3">
          <form onSubmit={handleSearch} style={{ display: 'flex', gap: 12 }}>
            <div className="filter-input-wrap" style={{ flex: 1 }}>
              <i className="fa-solid fa-magnifying-glass" />
              <input
                type="text"
                className="form-control"
                placeholder="Enter Batch Number to trace (e.g. LEGACY, BATCH-2026-A, etc.)..."
                value={batchNumber}
                onChange={(e) => setBatchNumber(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? (
                <>
                  <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 6 }} /> Tracing...
                </>
              ) : (
                <>
                  <i className="fa-solid fa-route" style={{ marginRight: 6 }} /> Trace Lifecycle
                </>
              )}
            </button>
          </form>
        </div>
      </div>

      {/* Batch Overview Header Card */}
      {traceData && (
        <>
          <div className="card mb-4" style={{ background: 'var(--surface)' }}>
            <div className="card-header flex-between" style={{ background: 'var(--surface-header)' }}>
              <div>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Batch Master Record
                </span>
                <h3 style={{ margin: '0.2rem 0', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <span>{traceData.batch_number}</span>
                  <StatusBadge status={traceData.status} size="sm" />
                </h3>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Product:</span>
                <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>{traceData.product_name}</div>
              </div>
            </div>

            <div className="card-body">
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: '1rem',
                  paddingBottom: '1rem',
                  borderBottom: '1px solid var(--border)'
                }}
              >
                <div>
                  <small style={{ color: 'var(--text-muted)' }}>Manufacturing Date</small>
                  <div style={{ fontWeight: 600 }}>{traceData.mfg_date || '—'}</div>
                </div>
                <div>
                  <small style={{ color: 'var(--text-muted)' }}>Expiry Date</small>
                  <div style={{ fontWeight: 700, color: '#dc2626' }}>{traceData.expiry_date}</div>
                </div>
                <div>
                  <small style={{ color: 'var(--text-muted)' }}>Unit Cost</small>
                  <div style={{ fontWeight: 600 }}>₹{traceData.cost_price?.toFixed(2)}</div>
                </div>
                <div>
                  <small style={{ color: 'var(--text-muted)' }}>Maximum Retail Price (MRP)</small>
                  <div style={{ fontWeight: 600 }}>₹{traceData.mrp?.toFixed(2)}</div>
                </div>
                <div>
                  <small style={{ color: 'var(--text-muted)' }}>Created At</small>
                  <div style={{ fontSize: '0.82rem' }}>
                    {traceData.created_at ? new Date(traceData.created_at).toLocaleString() : 'System Seed'}
                  </div>
                </div>
              </div>

              {/* Location Balances */}
              {(traceData.inventory || traceData.stock_by_location) && (traceData.inventory || traceData.stock_by_location).length > 0 && (
                <div style={{ marginTop: '1rem' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>
                    Current Balances Across Distribution Centers &amp; Stores:
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                    {(traceData.inventory || traceData.stock_by_location).map((loc, idx) => (
                      <div
                        key={loc.location_id || idx}
                        style={{
                          background: 'var(--surface-header)',
                          border: '1px solid var(--border)',
                          borderRadius: 8,
                          padding: '0.5rem 0.85rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.75rem'
                        }}
                      >
                        <i className={`fa-solid ${loc.type === 'DC' ? 'fa-warehouse' : 'fa-store'}`} style={{ color: 'var(--accent)' }} />
                        <div>
                          <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>{loc.location || loc.name}</div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            <strong>{loc.saleable}</strong> saleable / {loc.reserved || 0} reserved / {loc.scrap || 0} scrap
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Movement Timeline */}
          <div className="card">
            <div className="card-header flex-between">
              <h4>
                <i className="fa-solid fa-timeline" style={{ marginRight: 8 }} />
                Chronological Movement Ledger ({(traceData.timeline || traceData.movements)?.length || 0} Events)
              </h4>
              <span className="badge badge-info">Full Lifecycle Audit</span>
            </div>
            <div className="card-body p-0">
              {(!(traceData.timeline || traceData.movements) || (traceData.timeline || traceData.movements).length === 0) ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No movement events recorded yet for this batch.
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Timestamp</th>
                        <th>Movement Type</th>
                        <th>Quantity Moved</th>
                        <th>Origin Facility</th>
                        <th>Destination</th>
                        <th>Reference Number</th>
                        <th>Actor / Officer</th>
                        <th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(traceData.timeline || traceData.movements).map((m, idx) => {
                        const mType = m.type || m.movement_type;
                        const styleCfg = getMovementIcon(mType);
                        return (
                          <tr key={m.movement_id || idx}>
                            <td style={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                              <i className="fa-solid fa-clock" style={{ marginRight: 5, color: 'var(--text-muted)' }} />
                              {m.timestamp || (m.created_at ? new Date(m.created_at).toLocaleString() : '—')}
                            </td>
                            <td>
                              <span
                                style={{
                                  background: styleCfg.bg,
                                  color: styleCfg.color,
                                  borderRadius: 9999,
                                  padding: '0.2rem 0.65rem',
                                  fontSize: '0.75rem',
                                  fontWeight: 700,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.35rem'
                                }}
                              >
                                <i className={`fa-solid ${styleCfg.icon}`} /> {mType}
                              </span>
                            </td>
                            <td>
                              <strong style={{ fontSize: '0.92rem' }}>{m.quantity}</strong> units
                            </td>
                            <td>
                              <span style={{ fontSize: '0.82rem' }}>{m.from_location || m.from_location_name || 'Supplier / External'}</span>
                            </td>
                            <td>
                              <span style={{ fontSize: '0.82rem' }}>{m.to_location || m.to_location_name || 'Customer / Scrap / Out'}</span>
                            </td>
                            <td>
                              <code style={{ fontSize: '0.8rem' }}>{m.reference_doc || m.reference_id || '—'}</code>
                            </td>
                            <td>
                              <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>{m.performed_by || m.created_by || 'System'}</span>
                            </td>
                            <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)', maxWidth: '240px' }}>
                              {m.notes || '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { reportsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function TransferSuggestions() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState(null);

  const fetchSuggestions = async () => {
    try {
      setLoading(true);
      const res = await reportsAPI.getTransferSuggestions();
      if (res?.success) {
        setSuggestions(res.suggestions || []);
      }
    } catch (err) {
      setFeedback({ type: 'danger', message: err.message || 'Failed to fetch transfer suggestions.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSuggestions();
  }, []);

  const handleInitiateTransfer = (sugg) => {
    // Navigate to Replenishment request page with pre-filled context
    navigate('/replenishment/requests', {
      state: {
        prefill: {
          product_id: sugg.product_id,
          product_name: sugg.product_name,
          suggested_qty: sugg.suggested_transfer_quantity,
          from_location_id: sugg.source_location_id,
          to_location_id: sugg.destination_location_id
        }
      }
    });
  };

  return (
    <div className="transfer-suggestions-page container" style={{ padding: '1.5rem 1rem' }}>
      {/* Header */}
      <div className="page-header mb-4 flex-between">
        <div>
          <h2 className="page-title" style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0 }}>
            <i className="fa-solid fa-shuffle text-primary me-2" />
            Inter-Store Transfer Suggestions
          </h2>
          <p className="text-muted" style={{ margin: '0.25rem 0 0' }}>
            Algorithmic rebalancing advice moving near-expiry inventory from low-velocity stores to high-footfall hubs.
          </p>
        </div>
        <button className="btn btn-outline" onClick={fetchSuggestions} disabled={loading}>
          <i className="fa-solid fa-rotate me-2" /> Refresh Advice
        </button>
      </div>

      {/* Advisory Banner */}
      <div className="alert alert-info mb-4" style={{ borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <i className="fa-solid fa-info-circle fa-lg text-info" />
        <div>
          <strong>DMart Policy Advisory:</strong> Rebalancing recommendations are advisory only. Transfers are never executed automatically. Store Supervisors or Category Managers must review and initiate replenishment requests.
        </div>
      </div>

      {feedback && (
        <div className={`alert alert-${feedback.type} mb-4 flex-between`} style={{ padding: '0.75rem 1rem' }}>
          <span>{feedback.message}</span>
          <button className="btn-close" onClick={() => setFeedback(null)}>×</button>
        </div>
      )}

      {/* Table */}
      <div className="card" style={{ borderRadius: '10px', overflow: 'hidden', background: 'var(--card-bg, #fff)' }}>
        <div className="table-responsive">
          <table className="table table-hover mb-0" style={{ width: '100%', fontSize: '0.9rem' }}>
            <thead style={{ background: 'var(--header-bg, #f8fafc)', borderBottom: '2px solid #e2e8f0' }}>
              <tr>
                <th style={{ padding: '0.75rem 1rem' }}>Product &amp; Batch</th>
                <th style={{ padding: '0.75rem 1rem' }}>Days Left</th>
                <th style={{ padding: '0.75rem 1rem' }}>Source (Low Velocity)</th>
                <th style={{ padding: '0.75rem 1rem' }}>Destination (High Footfall)</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Dest. Velocity</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Suggested Qty</th>
                <th style={{ padding: '0.75rem 1rem' }}>Rebalancing Rationale</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '3rem' }}>
                    <i className="fa-solid fa-spinner fa-spin fa-2x text-muted mb-2" /><br />
                    Calculating network footfall &amp; velocity rebalancing...
                  </td>
                </tr>
              ) : suggestions.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
                    <i className="fa-solid fa-check-double fa-2x text-success mb-2" /><br />
                    Network is well balanced. No inter-store transfer advice required at this time.
                  </td>
                </tr>
              ) : (
                suggestions.map((s, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ fontWeight: 600, color: '#0f172a' }}>{s.product_name}</div>
                      <div className="text-muted" style={{ fontSize: '0.8rem', fontFamily: 'monospace' }}>
                        Batch #{s.batch_number} • Exp: {s.expiry_date}
                      </div>
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <span className="badge bg-warning text-dark" style={{ fontWeight: 700 }}>
                        {s.days_to_expiry} days
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <span className="text-danger" style={{ fontWeight: 600 }}>
                        <i className="fa-solid fa-arrow-up-from-bracket me-1" />
                        {s.source_store}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <span className="text-success" style={{ fontWeight: 600 }}>
                        <i className="fa-solid fa-arrow-down-to-bracket me-1" />
                        {s.suggested_destination}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center', fontWeight: 600 }}>
                      {s.destination_monthly_velocity} units/mo
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 700, color: '#2563eb', fontSize: '1rem' }}>
                      {s.suggested_transfer_quantity}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', maxWidth: '280px', fontSize: '0.85rem', color: '#475569' }}>
                      {s.rationale}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                      <button
                        className="btn btn-sm btn-outline-primary"
                        onClick={() => handleInitiateTransfer(s)}
                        title="Create replenishment request for this transfer"
                      >
                        <i className="fa-solid fa-truck-moving me-1" /> Transfer
                      </button>
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


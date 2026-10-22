import React, { useState, useEffect } from 'react';
import { adminAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function PolicySettings() {
  const { user } = useAuth();
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState(null);
  const [editingPolicy, setEditingPolicy] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchPolicies = async () => {
    try {
      setLoading(true);
      const res = await adminAPI.getPolicies();
      if (res && res.success) {
        setPolicies(res.policies || []);
      }
    } catch (err) {
      setFeedback({ type: 'danger', message: err.message || 'Failed to load system policies.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPolicies();
  }, []);

  const handleStartEdit = (p) => {
    setEditingPolicy(p);
    setEditValue(p.policy_value);
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingPolicy) return;

    const numVal = parseFloat(editValue);
    if (isNaN(numVal) || numVal < 0) {
      setFeedback({ type: 'danger', message: 'Policy value must be a valid non-negative number.' });
      return;
    }

    if (editingPolicy.policy_key.includes('percent') && numVal > 100) {
      setFeedback({ type: 'danger', message: 'Percentage policies cannot exceed 100%.' });
      return;
    }

    try {
      setSaving(true);
      const res = await adminAPI.updatePolicy(editingPolicy.policy_key, String(numVal));
      if (res && res.success) {
        setFeedback({ type: 'success', message: `Policy "${editingPolicy.policy_key}" updated successfully!` });
        setEditingPolicy(null);
        await fetchPolicies();
      } else {
        setFeedback({ type: 'danger', message: res.message || 'Failed to update policy.' });
      }
    } catch (err) {
      setFeedback({ type: 'danger', message: err.message || 'Save failed.' });
    } finally {
      setSaving(false);
    }
  };

  const policyDisplayMeta = {
    supervisor_markdown_discount_limit: {
      title: 'Supervisor Markdown Limit',
      unit: '%',
      icon: 'fa-user-tie',
      accent: '#f59e0b',
      guidance: 'Maximum markdown discount % a store supervisor can approve alone. Above this requires category manager approval.'
    },
    default_floor_price_percent: {
      title: 'Floor Price Protection',
      unit: '% of MRP',
      icon: 'fa-shield-halved',
      accent: '#ef4444',
      guidance: 'Minimum price floor threshold. Markdowns below this floor price are strictly barred to prevent margin erosion.'
    },
    dump_stock_cover_threshold_days: {
      title: 'Dump Stock Cover Horizon',
      unit: 'Days',
      icon: 'fa-box-open',
      accent: '#8b5cf6',
      guidance: 'Threshold for excess slow-moving inventory. When stock cover exceeds this horizon, dump stock alerts trigger.'
    },
    min_shelf_life_default_days: {
      title: 'Minimum Inward Shelf-Life',
      unit: 'Days',
      icon: 'fa-calendar-check',
      accent: '#10b981',
      guidance: 'Default minimum shelf-life days required when inwarding goods at Central DC. Below this threshold, stock is rejected.'
    }
  };

  return (
    <div className="policy-settings-container container" style={{ padding: '1.5rem 1rem' }}>
      {/* Header */}
      <div className="page-header mb-4 flex-between">
        <div>
          <h2>
            <i className="fa-solid fa-sliders" style={{ marginRight: 8, color: 'var(--accent)' }} />
            Enterprise Policy &amp; Governance Settings
          </h2>
          <p className="subtitle">
            DMart-style system thresholds controlling markdown approval limits, floor price barriers, dump stock cover, and inward acceptance.
          </p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={fetchPolicies}
            disabled={loading}
          >
            <i className={`fa-solid fa-arrows-rotate ${loading ? 'fa-spin' : ''}`} /> Refresh Policies
          </button>
        </div>
      </div>

      {feedback && (
        <div className={`alert alert-${feedback.type} mb-4`}>
          <div className="alert-content">
            <i className={`fa-solid ${feedback.type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation'}`} />
            <span>{feedback.message}</span>
          </div>
          <button type="button" className="btn-close" onClick={() => setFeedback(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            <i className="fa-solid fa-xmark" />
          </button>
        </div>
      )}

      {/* KPI Policy Cards */}
      <div className="kpi-grid mb-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem' }}>
        {policies.map((p) => {
          const meta = policyDisplayMeta[p.policy_key] || {
            title: p.policy_key,
            unit: '',
            icon: 'fa-gear',
            accent: 'var(--accent)'
          };
          return (
            <div
              key={p.policy_key}
              className="card kpi-card"
              style={{
                borderLeft: `4px solid ${meta.accent}`,
                padding: '1.25rem',
                position: 'relative'
              }}
            >
              <div className="flex-between mb-2">
                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                  {meta.title}
                </span>
                <i className={`fa-solid ${meta.icon}`} style={{ color: meta.accent, fontSize: '1.2rem' }} />
              </div>
              <div style={{ fontSize: '1.85rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.4rem' }}>
                {p.policy_value} <span style={{ fontSize: '0.95rem', fontWeight: 500, color: 'var(--text-muted)' }}>{meta.unit}</span>
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.35, minHeight: '2.7rem' }}>
                {meta.guidance}
              </div>
              {user?.role === 'admin' && (
                <div style={{ marginTop: '0.75rem', borderTop: '1px solid var(--border)', paddingTop: '0.6rem' }}>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-primary"
                    style={{ fontSize: '0.78rem', padding: '0.2rem 0.6rem' }}
                    onClick={() => handleStartEdit(p)}
                  >
                    <i className="fa-solid fa-pencil" /> Edit Value
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Policies Master Table */}
      <div className="card">
        <div className="card-header flex-between">
          <h4>
            <i className="fa-solid fa-table-list" style={{ marginRight: 8 }} />
            Active Enterprise Policy Registry
          </h4>
          <span className="badge badge-info" style={{ fontSize: '0.78rem' }}>
            {policies.length} Policies Active
          </span>
        </div>
        <div className="card-body p-0">
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Policy Key</th>
                  <th>Display Title</th>
                  <th>Current Setting</th>
                  <th>Policy Description &amp; Scope</th>
                  <th>Last Updated By</th>
                  <th>Updated At</th>
                  {user?.role === 'admin' && <th>Action</th>}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={user?.role === 'admin' ? 7 : 6} style={{ textAlign: 'center', padding: '2rem' }}>
                      <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 8 }} /> Loading policy parameters...
                    </td>
                  </tr>
                ) : (
                  policies.map((p) => {
                    const meta = policyDisplayMeta[p.policy_key] || { title: p.policy_key, unit: '' };
                    return (
                      <tr key={p.policy_key}>
                        <td>
                          <code>{p.policy_key}</code>
                        </td>
                        <td style={{ fontWeight: 600 }}>{meta.title}</td>
                        <td>
                          <span
                            className="badge badge-primary"
                            style={{ fontSize: '0.9rem', fontWeight: 700, padding: '0.3rem 0.7rem' }}
                          >
                            {p.policy_value} {meta.unit}
                          </span>
                        </td>
                        <td style={{ maxWidth: '380px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                          {p.description}
                        </td>
                        <td>
                          <span className="badge badge-secondary">{p.updated_by || 'admin'}</span>
                        </td>
                        <td style={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                          {p.updated_at ? new Date(p.updated_at).toLocaleString() : 'System Default'}
                        </td>
                        {user?.role === 'admin' && (
                          <td>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-primary"
                              onClick={() => handleStartEdit(p)}
                            >
                              <i className="fa-solid fa-pencil" /> Edit
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Edit Policy Modal */}
      {editingPolicy && (
        <div
          className="modal-backdrop"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1050,
            padding: '1rem'
          }}
        >
          <div
            className="modal-dialog card"
            style={{ maxWidth: '480px', width: '100%', borderRadius: 12, overflow: 'hidden' }}
          >
            <div className="card-header flex-between" style={{ background: 'var(--surface-header)' }}>
              <h4 style={{ margin: 0 }}>
                <i className="fa-solid fa-sliders" style={{ marginRight: 8, color: 'var(--accent)' }} />
                Edit System Policy
              </h4>
              <button
                type="button"
                className="btn-close"
                onClick={() => setEditingPolicy(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer' }}
              >
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
            <form onSubmit={handleSaveEdit}>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                    Policy Key
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    value={editingPolicy.policy_key}
                    disabled
                    style={{ background: 'var(--surface-header)', opacity: 0.85 }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                    New Policy Value ({policyDisplayMeta[editingPolicy.policy_key]?.unit || 'Numeric'})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max={editingPolicy.policy_key.includes('percent') ? 100 : undefined}
                    className="form-control"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', background: 'var(--surface-header)', padding: '0.75rem', borderRadius: 8 }}>
                  <i className="fa-solid fa-info-circle" style={{ marginRight: 6 }} />
                  {editingPolicy.description}
                </div>
              </div>
              <div className="card-footer flex-between" style={{ borderTop: '1px solid var(--border)', padding: '0.9rem 1.25rem' }}>
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={() => setEditingPolicy(null)}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? (
                    <>
                      <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 6 }} /> Saving...
                    </>
                  ) : (
                    <>
                      <i className="fa-solid fa-check" style={{ marginRight: 6 }} /> Save Policy
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}


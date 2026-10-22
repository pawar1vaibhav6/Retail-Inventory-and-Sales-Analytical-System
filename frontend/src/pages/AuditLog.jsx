import React, { useState, useEffect } from 'react';
import { adminAPI } from '../services/api';

export default function AuditLog() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState(null);
  const [actionFilter, setActionFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selectedDetails, setSelectedDetails] = useState(null);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const params = {};
      if (actionFilter) params.action_type = actionFilter;
      const res = await adminAPI.getAuditLogs(params);
      if (res && res.success) {
        setLogs(res.audit_logs || []);
      }
    } catch (err) {
      setFeedback({ type: 'danger', message: err.message || 'Failed to load system audit log.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [actionFilter]);

  const filteredLogs = logs.filter((l) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (l.action_type && l.action_type.toLowerCase().includes(q)) ||
      (l.entity_type && l.entity_type.toLowerCase().includes(q)) ||
      (l.entity_id && l.entity_id.toLowerCase().includes(q)) ||
      (l.username && l.username.toLowerCase().includes(q)) ||
      (l.user_role && l.user_role.toLowerCase().includes(q)) ||
      (l.store_name && l.store_name.toLowerCase().includes(q))
    );
  });

  const getActionBadge = (action) => {
    if (action.includes('POLICY')) {
      return { bg: '#f5f3ff', color: '#7c3aed', border: '#ddd6fe', icon: 'fa-sliders' };
    }
    if (action.includes('OVERRIDE')) {
      return { bg: '#fef2f2', color: '#b91c1c', border: '#fca5a5', icon: 'fa-triangle-exclamation' };
    }
    if (action.includes('RETURN') || action.includes('SCRAP')) {
      return { bg: '#fff7ed', color: '#c2410c', border: '#fed7aa', icon: 'fa-box-archive' };
    }
    if (action.includes('AUDIT') || action.includes('ROLE')) {
      return { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe', icon: 'fa-shield-halved' };
    }
    return { bg: '#ecfdf5', color: '#047857', border: '#a7f3d0', icon: 'fa-clipboard-check' };
  };

  return (
    <div className="audit-log-container container" style={{ padding: '1.5rem 1rem' }}>
      {/* Header */}
      <div className="page-header mb-4 flex-between">
        <div>
          <h2>
            <i className="fa-solid fa-clipboard-list" style={{ marginRight: 8, color: 'var(--accent)' }} />
            Enterprise System Audit Log &amp; Trail
          </h2>
          <p className="subtitle">
            Immutable DMart-style audit trail recording policy modifications, role reassignments, FEFO overrides, stock adjustments, and debit notes.
          </p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={fetchLogs}
            disabled={loading}
          >
            <i className={`fa-solid fa-arrows-rotate ${loading ? 'fa-spin' : ''}`} /> Refresh Log
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

      {/* Filter Bar */}
      <div className="card mb-4">
        <div className="card-body py-3">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12 }}>
            <div className="filter-input-wrap">
              <i className="fa-solid fa-magnifying-glass" />
              <input
                type="text"
                className="form-control"
                placeholder="Search audit trail by username, action, entity ID, or store..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select
                className="form-control"
                style={{ minWidth: '220px' }}
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
              >
                <option value="">All Action Types</option>
                <option value="POLICY_UPDATE">Policy Updates</option>
                <option value="USER_ROLE_SCOPING_UPDATE">User Role &amp; Scoping Changes</option>
                <option value="SUPPLIER_TERMS_UPDATE">Supplier Terms Changes</option>
                <option value="FEFO_OVERRIDE">FEFO Allocation Overrides</option>
                <option value="AUDIT_ADJUSTMENT">Physical Audit Adjustments</option>
                <option value="MARKDOWN_APPROVAL">Markdown Approvals</option>
                <option value="VENDOR_RETURN">Vendor Expiry Returns</option>
                <option value="SCRAP_MOVE">Scrap Movements</option>
              </select>
              {(search || actionFilter) && (
                <button
                  type="button"
                  className="btn btn-outline-danger"
                  onClick={() => {
                    setSearch('');
                    setActionFilter('');
                  }}
                >
                  Reset
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="card">
        <div className="card-header flex-between">
          <h4>
            <i className="fa-solid fa-shield-halved" style={{ marginRight: 8 }} />
            Audit Records ({filteredLogs.length})
          </h4>
          <span className="badge badge-info" style={{ fontSize: '0.8rem' }}>
            Live Audit Stream
          </span>
        </div>
        <div className="card-body p-0">
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Log ID</th>
                  <th>Timestamp</th>
                  <th>Action Type</th>
                  <th>Entity Reference</th>
                  <th>Actor (User &amp; Role)</th>
                  <th>Store / Facility</th>
                  <th>Audit Payload</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '2rem' }}>
                      <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 8 }} /> Loading audit events...
                    </td>
                  </tr>
                ) : filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '2rem' }}>
                      No audit events recorded yet.
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((l) => {
                    const badge = getActionBadge(l.action_type);
                    return (
                      <tr key={l.log_id}>
                        <td>#{l.log_id}</td>
                        <td style={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                          <i className="fa-solid fa-clock" style={{ marginRight: 5, color: 'var(--text-muted)' }} />
                          {l.created_at ? new Date(l.created_at).toLocaleString() : '—'}
                        </td>
                        <td>
                          <span
                            style={{
                              background: badge.bg,
                              color: badge.color,
                              border: `1px solid ${badge.border}`,
                              borderRadius: '9999px',
                              padding: '0.2rem 0.6rem',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.35rem'
                            }}
                          >
                            <i className={`fa-solid ${badge.icon}`} /> {l.action_type}
                          </span>
                        </td>
                        <td>
                          <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{l.entity_type}</span>
                          <br />
                          <code style={{ fontSize: '0.78rem' }}>{l.entity_id}</code>
                        </td>
                        <td>
                          <span style={{ fontWeight: 600 }}>{l.username}</span>
                          <br />
                          <span className="badge badge-secondary" style={{ fontSize: '0.72rem' }}>
                            {l.user_role}
                          </span>
                        </td>
                        <td>
                          {l.store_name ? (
                            <span style={{ fontSize: '0.82rem' }}>
                              <i className="fa-solid fa-store" style={{ marginRight: 4, color: 'var(--text-muted)' }} />
                              {l.store_name}
                            </span>
                          ) : (
                            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                              <i className="fa-solid fa-globe" style={{ marginRight: 4 }} /> Enterprise
                            </span>
                          )}
                        </td>
                        <td>
                          {l.details ? (
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-secondary"
                              style={{ fontSize: '0.75rem', padding: '0.2rem 0.55rem' }}
                              onClick={() => setSelectedDetails(l)}
                            >
                              <i className="fa-solid fa-code" style={{ marginRight: 4 }} /> View Payload
                            </button>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>—</span>
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
      </div>

      {/* JSON Payload Modal */}
      {selectedDetails && (
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
            style={{ maxWidth: '600px', width: '100%', borderRadius: 12, overflow: 'hidden' }}
          >
            <div className="card-header flex-between" style={{ background: 'var(--surface-header)' }}>
              <h4 style={{ margin: 0 }}>
                <i className="fa-solid fa-file-code" style={{ marginRight: 8, color: 'var(--accent)' }} />
                Audit Event #{selectedDetails.log_id} Payload
              </h4>
              <button
                type="button"
                className="btn-close"
                onClick={() => setSelectedDetails(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer' }}
              >
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
            <div className="card-body">
              <div style={{ marginBottom: '0.75rem', fontSize: '0.85rem' }}>
                <strong>Action:</strong> {selectedDetails.action_type} &nbsp;|&nbsp;
                <strong>Actor:</strong> {selectedDetails.username} ({selectedDetails.user_role}) &nbsp;|&nbsp;
                <strong>IP:</strong> {selectedDetails.ip_address || 'Internal'}
              </div>
              <pre
                style={{
                  background: '#1e293b',
                  color: '#f8fafc',
                  padding: '1rem',
                  borderRadius: 8,
                  fontSize: '0.82rem',
                  maxHeight: '360px',
                  overflowY: 'auto'
                }}
              >
                {JSON.stringify(
                  typeof selectedDetails.details === 'string'
                    ? JSON.parse(selectedDetails.details)
                    : selectedDetails.details,
                  null,
                  2
                )}
              </pre>
            </div>
            <div className="card-footer" style={{ textAlign: 'right', padding: '0.75rem 1.25rem' }}>
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => setSelectedDetails(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


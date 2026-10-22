import React, { useState, useEffect } from 'react';
import { adminAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

const ROLE_DEFINITIONS = {
  admin: {
    label: 'System Admin',
    icon: 'fa-shield-halved',
    color: '#7c3aed',
    bg: '#f5f3ff',
    border: '#ddd6fe',
    description: 'Full unrestricted enterprise control across DCs, stores, policy thresholds, and master data.'
  },
  store_supervisor: {
    label: 'Store Supervisor',
    icon: 'fa-user-tie',
    color: '#d97706',
    bg: '#fffbeb',
    border: '#fde68a',
    description: 'Scoped to assigned store. Approves physical audits, approves markdowns up to policy limit, posts expiry returns and raises replenishment.'
  },
  store_executive: {
    label: 'Store Executive',
    icon: 'fa-clipboard-check',
    color: '#0284c7',
    bg: '#f0f9ff',
    border: '#bae6fd',
    description: 'Scoped to assigned store. Records audit counts, proposes near-expiry markdowns, drafts return batches. Cannot self-approve proposals.'
  },
  warehouse_picker: {
    label: 'DC Warehouse Picker',
    icon: 'fa-dolly',
    color: '#2563eb',
    bg: '#eff6ff',
    border: '#bfdbfe',
    description: 'Scoped to Central DC (DC-01). Enters inward batch/expiry data at GRN and fulfills store replenishment pick lists strictly via FEFO.'
  },
  category_manager: {
    label: 'Category Manager',
    icon: 'fa-chart-line',
    color: '#059669',
    bg: '#ecfdf5',
    border: '#a7f3d0',
    description: 'Cross-store visibility. Approves high-value markdowns exceeding supervisor limit, monitors dump stock, and plans inter-store transfers.'
  },
  accounts: {
    label: 'Accounts Officer',
    icon: 'fa-file-invoice-dollar',
    color: '#0d9488',
    bg: '#f0fdfa',
    border: '#99f6e4',
    description: 'Cross-store visibility. Views and reconciles supplier debit notes, tracks GST deductions, marks vendor credit received.'
  },
  cashier: {
    label: 'Store Cashier',
    icon: 'fa-cash-register',
    color: '#0ea5e9',
    bg: '#f0fdf4',
    border: '#bbf7d0',
    description: 'Store-scoped. POS billing with automatic FEFO batch allocation and strict defense blocking expired/scrapped goods.'
  }
};

export default function RolesPermissions() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState(null);
  const [editingUser, setEditingUser] = useState(null);
  const [selectedRole, setSelectedRole] = useState('');
  const [selectedStore, setSelectedStore] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await adminAPI.getRoles();
      if (res && res.success) {
        setUsers(res.users || []);
      }
    } catch (err) {
      setFeedback({ type: 'danger', message: err.message || 'Failed to load user roles.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleStartEdit = (u) => {
    setEditingUser(u);
    setSelectedRole(u.role);
    setSelectedStore(u.store_id !== null && u.store_id !== undefined ? String(u.store_id) : '');
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!editingUser) return;

    try {
      setSaving(true);
      const storeVal = selectedStore === '' ? null : parseInt(selectedStore, 10);
      const res = await adminAPI.updateRole(editingUser.user_id, {
        role: selectedRole,
        store_id: storeVal
      });

      if (res && res.success) {
        setFeedback({
          type: 'success',
          message: `Permissions for user "${editingUser.username}" updated successfully!`
        });
        setEditingUser(null);
        await fetchUsers();
      } else {
        setFeedback({ type: 'danger', message: res.message || 'Failed to update user permissions.' });
      }
    } catch (err) {
      setFeedback({ type: 'danger', message: err.message || 'Save failed.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="roles-container container" style={{ padding: '1.5rem 1rem' }}>
      {/* Header */}
      <div className="page-header mb-4 flex-between">
        <div>
          <h2>
            <i className="fa-solid fa-users-gear" style={{ marginRight: 8, color: 'var(--accent)' }} />
            Enterprise Roles, Permissions &amp; Store Scoping
          </h2>
          <p className="subtitle">
            DMart-style segregation of duties: store-level data isolation for store executives &amp; supervisors, DC scoping for pickers, and global visibility for category &amp; accounts.
          </p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={fetchUsers}
            disabled={loading}
          >
            <i className={`fa-solid fa-arrows-rotate ${loading ? 'fa-spin' : ''}`} /> Refresh
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

      {/* Role Definitions Carousel / Cards */}
      <div
        className="kpi-grid mb-4"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '1rem'
        }}
      >
        {Object.entries(ROLE_DEFINITIONS).map(([key, def]) => (
          <div
            key={key}
            className="card"
            style={{
              padding: '1rem 1.15rem',
              borderLeft: `4px solid ${def.color}`,
              background: 'var(--surface)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem' }}>
              <span
                style={{
                  background: def.bg,
                  color: def.color,
                  border: `1px solid ${def.border}`,
                  borderRadius: 6,
                  padding: '0.2rem 0.5rem',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem'
                }}
              >
                <i className={`fa-solid ${def.icon}`} /> {def.label}
              </span>
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.35 }}>
              {def.description}
            </div>
          </div>
        ))}
      </div>

      {/* Users Master Table */}
      <div className="card">
        <div className="card-header flex-between">
          <h4>
            <i className="fa-solid fa-user-lock" style={{ marginRight: 8 }} />
            Active Enterprise Users &amp; Scoping Assignments ({users.length})
          </h4>
          <span className="badge badge-primary">
            {users.length} Users Configured
          </span>
        </div>
        <div className="card-body p-0">
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>User ID</th>
                  <th>Username</th>
                  <th>Assigned Role</th>
                  <th>Store / Facility Scoping</th>
                  <th>Access Boundary</th>
                  <th>Created At</th>
                  {user?.role === 'admin' && <th>Action</th>}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={user?.role === 'admin' ? 7 : 6} style={{ textAlign: 'center', padding: '2rem' }}>
                      <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 8 }} /> Loading users...
                    </td>
                  </tr>
                ) : (
                  users.map((u) => {
                    const rDef = ROLE_DEFINITIONS[u.role] || {
                      label: u.role,
                      icon: 'fa-user',
                      color: '#64748b',
                      bg: '#f1f5f9',
                      border: '#cbd5e1'
                    };

                    const isStoreScoped = ['store_executive', 'store_supervisor', 'cashier'].includes(u.role);
                    const isDcScoped = u.role === 'warehouse_picker';

                    return (
                      <tr key={u.user_id}>
                        <td>#{u.user_id}</td>
                        <td style={{ fontWeight: 600 }}>
                          <i className="fa-solid fa-user" style={{ marginRight: 6, color: 'var(--text-muted)' }} />
                          {u.username}
                        </td>
                        <td>
                          <span
                            style={{
                              background: rDef.bg,
                              color: rDef.color,
                              border: `1px solid ${rDef.border}`,
                              borderRadius: '9999px',
                              padding: '0.25rem 0.7rem',
                              fontSize: '0.78rem',
                              fontWeight: 700,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.4rem'
                            }}
                          >
                            <i className={`fa-solid ${rDef.icon}`} /> {rDef.label}
                          </span>
                        </td>
                        <td>
                          {u.store_name ? (
                            <span
                              className="badge"
                              style={{
                                background: isDcScoped ? '#eff6ff' : '#f0fdf4',
                                color: isDcScoped ? '#1d4ed8' : '#15803d',
                                border: `1px solid ${isDcScoped ? '#bfdbfe' : '#bbf7d0'}`,
                                fontWeight: 600,
                                fontSize: '0.8rem'
                              }}
                            >
                              <i className={`fa-solid ${isDcScoped ? 'fa-warehouse' : 'fa-store'}`} style={{ marginRight: 4 }} />
                              {u.store_name} ({u.store_code})
                            </span>
                          ) : (
                            <span
                              className="badge badge-secondary"
                              style={{ fontSize: '0.8rem', fontWeight: 600 }}
                            >
                              <i className="fa-solid fa-globe" style={{ marginRight: 4 }} />
                              All Stores (Global / Head Office)
                            </span>
                          )}
                        </td>
                        <td>
                          {isStoreScoped ? (
                            <span className="badge badge-warning" style={{ fontSize: '0.75rem' }}>
                              <i className="fa-solid fa-lock" style={{ marginRight: 4 }} /> Own Store Only
                            </span>
                          ) : isDcScoped ? (
                            <span className="badge badge-info" style={{ fontSize: '0.75rem' }}>
                              <i className="fa-solid fa-lock" style={{ marginRight: 4 }} /> DC Logistics Only
                            </span>
                          ) : (
                            <span className="badge badge-success" style={{ fontSize: '0.75rem' }}>
                              <i className="fa-solid fa-unlock" style={{ marginRight: 4 }} /> Multi-Store
                            </span>
                          )}
                        </td>
                        <td style={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                          {u.created_at ? new Date(u.created_at).toLocaleDateString() : 'System Seed'}
                        </td>
                        {user?.role === 'admin' && (
                          <td>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-primary"
                              onClick={() => handleStartEdit(u)}
                            >
                              <i className="fa-solid fa-pencil" /> Edit Role
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

      {/* Edit Role Modal */}
      {editingUser && (
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
            style={{ maxWidth: '500px', width: '100%', borderRadius: 12, overflow: 'hidden' }}
          >
            <div className="card-header flex-between" style={{ background: 'var(--surface-header)' }}>
              <h4 style={{ margin: 0 }}>
                <i className="fa-solid fa-user-shield" style={{ marginRight: 8, color: 'var(--accent)' }} />
                Update Role &amp; Store Scoping
              </h4>
              <button
                type="button"
                className="btn-close"
                onClick={() => setEditingUser(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer' }}
              >
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
            <form onSubmit={handleSave}>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                    Username
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    value={editingUser.username}
                    disabled
                    style={{ background: 'var(--surface-header)', opacity: 0.85 }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Assign Enterprise Role</label>
                  <select
                    className="form-control"
                    value={selectedRole}
                    onChange={(e) => setSelectedRole(e.target.value)}
                    required
                  >
                    {Object.entries(ROLE_DEFINITIONS).map(([rk, rv]) => (
                      <option key={rk} value={rk}>
                        {rv.label} ({rk})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                    Store / Facility Scoping
                  </label>
                  <select
                    className="form-control"
                    value={selectedStore}
                    onChange={(e) => setSelectedStore(e.target.value)}
                  >
                    <option value="">None / All Stores (Cross-Store Global Access)</option>
                    <option value="1">DC-01 — Central Distribution Center Mumbai (DC)</option>
                    <option value="2">STORE-101 — DMart Store Thane (High Footfall)</option>
                    <option value="3">STORE-102 — DMart Store Pune (Suburban)</option>
                  </select>
                  <small style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                    Note: Store Executives and Store Supervisors must be scoped to their own store location. DC Pickers must be assigned to DC-01.
                  </small>
                </div>
              </div>
              <div className="card-footer flex-between" style={{ borderTop: '1px solid var(--border)', padding: '0.9rem 1.25rem' }}>
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={() => setEditingUser(null)}
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
                      <i className="fa-solid fa-check" style={{ marginRight: 6 }} /> Save Changes
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


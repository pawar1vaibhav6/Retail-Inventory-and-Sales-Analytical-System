import React, { useState, useEffect } from 'react';
import { adminAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function SupplierTerms() {
  const { user } = useAuth();
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState(null);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [formData, setFormData] = useState({
    expiry_return_window_days: 30,
    contact_email: '',
    phone: ''
  });
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const canEdit = user?.role === 'admin' || user?.role === 'category_manager';

  const fetchSuppliers = async () => {
    try {
      setLoading(true);
      const res = await adminAPI.getSupplierTerms();
      if (res && res.success) {
        setSuppliers(res.suppliers || []);
      }
    } catch (err) {
      setFeedback({ type: 'danger', message: err.message || 'Failed to load supplier return terms.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const handleStartEdit = (sup) => {
    setEditingSupplier(sup);
    setFormData({
      expiry_return_window_days: sup.expiry_return_window_days || 30,
      contact_email: sup.contact_email || '',
      phone: sup.phone || ''
    });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!editingSupplier) return;

    const days = parseInt(formData.expiry_return_window_days, 10);
    if (isNaN(days) || days < 0) {
      setFeedback({ type: 'danger', message: 'Return window days must be a non-negative integer.' });
      return;
    }

    try {
      setSaving(true);
      const res = await adminAPI.updateSupplierTerms(editingSupplier.supplier_id, {
        expiry_return_window_days: days,
        contact_email: formData.contact_email.trim(),
        phone: formData.phone.trim()
      });
      if (res && res.success) {
        setFeedback({
          type: 'success',
          message: `Expiry return terms for "${editingSupplier.supplier_name}" updated successfully!`
        });
        setEditingSupplier(null);
        await fetchSuppliers();
      } else {
        setFeedback({ type: 'danger', message: res.message || 'Failed to update supplier terms.' });
      }
    } catch (err) {
      setFeedback({ type: 'danger', message: err.message || 'Save failed.' });
    } finally {
      setSaving(false);
    }
  };

  const filteredSuppliers = suppliers.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      s.supplier_name.toLowerCase().includes(q) ||
      (s.gstin && s.gstin.toLowerCase().includes(q)) ||
      (s.contact_email && s.contact_email.toLowerCase().includes(q))
    );
  });

  return (
    <div className="supplier-terms-container container" style={{ padding: '1.5rem 1rem' }}>
      {/* Header */}
      <div className="page-header mb-4 flex-between">
        <div>
          <h2>
            <i className="fa-solid fa-handshake" style={{ marginRight: 8, color: 'var(--accent)' }} />
            Supplier Expiry Return Terms &amp; SLAs
          </h2>
          <p className="subtitle">
            Configure vendor return windows: stock nearing expiry within N days is eligible for supplier debit notes and RTV (Return To Vendor).
          </p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={fetchSuppliers}
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

      {/* Information Alert Banner */}
      <div
        className="card mb-4"
        style={{
          borderLeft: '4px solid #3b82f6',
          background: 'linear-gradient(90deg, rgba(59,130,246,0.06), transparent)'
        }}
      >
        <div className="card-body" style={{ padding: '1rem 1.25rem' }}>
          <div style={{ display: 'flex', gap: '0.85rem', alignItems: 'flex-start' }}>
            <i className="fa-solid fa-circle-info" style={{ color: '#3b82f6', fontSize: '1.25rem', marginTop: 2 }} />
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.92rem', marginBottom: 2 }}>
                Vendor Expiry Return Policy &amp; Debit Note Automation
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                Under retail vendor agreements, items reaching their expiry return window (e.g., 30 or 45 days prior to expiration)
                are flagged for store returns. Once approved by the Store Supervisor, the backend atomically moves units to the scrap ledger
                and generates GST-compliant Debit Notes for the Accounts team to reconcile against supplier payables.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="card mb-4">
        <div className="card-body py-3">
          <div className="search-filter-form" style={{ display: 'flex', gap: 12 }}>
            <div className="filter-input-wrap" style={{ flex: 1 }}>
              <i className="fa-solid fa-magnifying-glass" />
              <input
                type="text"
                className="form-control"
                placeholder="Search by supplier name, GSTIN, or contact email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {search && (
              <button
                type="button"
                className="btn btn-outline-danger"
                onClick={() => setSearch('')}
              >
                Reset
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Suppliers Table Card */}
      <div className="card">
        <div className="card-header flex-between">
          <h4>
            <i className="fa-solid fa-truck-field" style={{ marginRight: 8 }} />
            Registered FMCG &amp; Retail Suppliers ({filteredSuppliers.length})
          </h4>
          <span className="badge badge-primary">
            {filteredSuppliers.length} Vendors Active
          </span>
        </div>
        <div className="card-body p-0">
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Supplier Name</th>
                  <th>GSTIN</th>
                  <th>Contact Email</th>
                  <th>Phone</th>
                  <th>Expiry Return Window</th>
                  <th>Agreement Status</th>
                  {canEdit && <th>Action</th>}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={canEdit ? 8 : 7} style={{ textAlign: 'center', padding: '2rem' }}>
                      <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 8 }} /> Loading supplier terms...
                    </td>
                  </tr>
                ) : filteredSuppliers.length === 0 ? (
                  <tr>
                    <td colSpan={canEdit ? 8 : 7} style={{ textAlign: 'center', padding: '2rem' }}>
                      No suppliers found matching your query.
                    </td>
                  </tr>
                ) : (
                  filteredSuppliers.map((s) => (
                    <tr key={s.supplier_id}>
                      <td>#{s.supplier_id}</td>
                      <td style={{ fontWeight: 600 }}>{s.supplier_name}</td>
                      <td>
                        <code style={{ fontSize: '0.85rem' }}>{s.gstin}</code>
                      </td>
                      <td style={{ fontSize: '0.85rem' }}>
                        <a href={`mailto:${s.contact_email}`} style={{ color: 'var(--accent)' }}>
                          {s.contact_email || '—'}
                        </a>
                      </td>
                      <td style={{ fontSize: '0.85rem' }}>{s.phone || '—'}</td>
                      <td>
                        <span
                          className="badge"
                          style={{
                            background: '#eff6ff',
                            color: '#1d4ed8',
                            border: '1px solid #bfdbfe',
                            fontSize: '0.85rem',
                            fontWeight: 700,
                            padding: '0.3rem 0.65rem'
                          }}
                        >
                          <i className="fa-solid fa-calendar-days" style={{ marginRight: 4 }} />
                          {s.expiry_return_window_days} Days Pre-Expiry
                        </span>
                      </td>
                      <td>
                        <span className="badge badge-success">
                          <i className="fa-solid fa-circle-check" style={{ marginRight: 4 }} /> Active SLA
                        </span>
                      </td>
                      {canEdit && (
                        <td>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-primary"
                            onClick={() => handleStartEdit(s)}
                          >
                            <i className="fa-solid fa-pencil" /> Edit Terms
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Edit Terms Modal */}
      {editingSupplier && (
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
            style={{ maxWidth: '520px', width: '100%', borderRadius: 12, overflow: 'hidden' }}
          >
            <div className="card-header flex-between" style={{ background: 'var(--surface-header)' }}>
              <h4 style={{ margin: 0 }}>
                <i className="fa-solid fa-handshake" style={{ marginRight: 8, color: 'var(--accent)' }} />
                Update Supplier Return Terms
              </h4>
              <button
                type="button"
                className="btn-close"
                onClick={() => setEditingSupplier(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer' }}
              >
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
            <form onSubmit={handleSave}>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                    Supplier Name
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    value={editingSupplier.supplier_name}
                    disabled
                    style={{ background: 'var(--surface-header)', opacity: 0.85 }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                    GSTIN Identification
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    value={editingSupplier.gstin}
                    disabled
                    style={{ background: 'var(--surface-header)', opacity: 0.85 }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                    Expiry Return Window (Days Before Expiry)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="180"
                    className="form-control"
                    value={formData.expiry_return_window_days}
                    onChange={(e) => setFormData({ ...formData, expiry_return_window_days: e.target.value })}
                    required
                  />
                  <small style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                    Stock expiring in fewer than this many days can be claimed back to vendor under debit notes.
                  </small>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Contact Email</label>
                    <input
                      type="email"
                      className="form-control"
                      value={formData.contact_email}
                      onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Contact Phone</label>
                    <input
                      type="text"
                      className="form-control"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <div className="card-footer flex-between" style={{ borderTop: '1px solid var(--border)', padding: '0.9rem 1.25rem' }}>
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={() => setEditingSupplier(null)}
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
                      <i className="fa-solid fa-check" style={{ marginRight: 6 }} /> Update Terms
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


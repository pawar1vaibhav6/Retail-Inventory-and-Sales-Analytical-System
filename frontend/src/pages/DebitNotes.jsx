import React, { useState, useEffect } from 'react';
import { financeAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/StatusBadge';

export default function DebitNotes() {
  const { user } = useAuth();
  const [debitNotes, setDebitNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Settle Modal State
  const [settleTarget, setSettleTarget] = useState(null);
  const [creditRef, setCreditRef] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Invoice Print View Modal State
  const [viewInvoice, setViewInvoice] = useState(null);

  const canManage = ['admin', 'accounts'].includes(user?.role);

  const fetchDebitNotes = async () => {
    try {
      setLoading(true);
      const res = await financeAPI.getDebitNotes();
      if (res?.success) {
        setDebitNotes(res.debit_notes || []);
      }
    } catch (err) {
      setFeedback({ type: 'danger', message: err.message || 'Failed to load debit notes register.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDebitNotes();
  }, []);

  const handleAcknowledge = async (dnId) => {
    try {
      setSubmitting(true);
      const res = await financeAPI.acknowledgeDebitNote(dnId);
      if (res?.success) {
        setFeedback({ type: 'success', message: `Debit Note acknowledged by supplier successfully!` });
        fetchDebitNotes();
      }
    } catch (err) {
      setFeedback({ type: 'danger', message: err.message || 'Failed to acknowledge debit note.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSettleSubmit = async (e) => {
    e.preventDefault();
    if (!settleTarget) return;
    try {
      setSubmitting(true);
      const res = await financeAPI.settleDebitNote(settleTarget.debit_note_id, {
        supplier_credit_ref: creditRef
      });
      if (res?.success) {
        setFeedback({ type: 'success', message: `Debit note ${settleTarget.debit_note_number} settled! Credit note verified and recorded.` });
        setSettleTarget(null);
        setCreditRef('');
        fetchDebitNotes();
      }
    } catch (err) {
      setFeedback({ type: 'danger', message: err.message || 'Failed to settle debit note credit.' });
    } finally {
      setSubmitting(false);
    }
  };

  const filteredNotes = debitNotes.filter((dn) => {
    if (statusFilter && dn.status !== statusFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      dn.debit_note_number.toLowerCase().includes(q) ||
      dn.return_number.toLowerCase().includes(q) ||
      dn.supplier_name.toLowerCase().includes(q) ||
      (dn.location_name && dn.location_name.toLowerCase().includes(q))
    );
  });

  const totalClaimAmount = debitNotes.reduce((acc, dn) => acc + (dn.total_amount || 0), 0);
  const settledAmount = debitNotes.filter(dn => dn.status === 'SETTLED').reduce((acc, dn) => acc + (dn.total_amount || 0), 0);
  const pendingAmount = totalClaimAmount - settledAmount;

  return (
    <div className="debit-notes-page container" style={{ padding: '1.5rem 1rem' }}>
      {/* Header */}
      <div className="page-header mb-4 flex-between">
        <div>
          <h2 className="page-title" style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0 }}>
            <i className="fa-solid fa-file-invoice-dollar text-success me-2" />
            Supplier Debit Notes &amp; Credit Ledger
          </h2>
          <p className="text-muted" style={{ margin: '0.25rem 0 0' }}>
            Official accounting debit note claims, GST component recovery, and vendor credit reconciliation.
          </p>
        </div>
        <button className="btn btn-outline" onClick={fetchDebitNotes} disabled={loading}>
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
          <div className="text-muted" style={{ fontSize: '0.85rem', fontWeight: 600 }}>Total Claims Issued</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#0f172a', margin: '0.25rem 0' }}>
            ₹{totalClaimAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-muted" style={{ fontSize: '0.8rem' }}>{debitNotes.length} debit notes generated</div>
        </div>

        <div className="card" style={{ padding: '1.25rem', borderRadius: '10px', background: 'var(--card-bg, #fff)' }}>
          <div className="text-muted" style={{ fontSize: '0.85rem', fontWeight: 600 }}>Credit Received (Settled)</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#16a34a', margin: '0.25rem 0' }}>
            ₹{settledAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-muted" style={{ fontSize: '0.8rem' }}>Vendor credits realized</div>
        </div>

        <div className="card" style={{ padding: '1.25rem', borderRadius: '10px', background: 'var(--card-bg, #fff)' }}>
          <div className="text-muted" style={{ fontSize: '0.85rem', fontWeight: 600 }}>Outstanding Pending Claims</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#ea580c', margin: '0.25rem 0' }}>
            ₹{pendingAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-muted" style={{ fontSize: '0.8rem' }}>Awaiting credit settlement</div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="card mb-4" style={{ padding: '1rem', borderRadius: '10px', background: 'var(--card-bg, #fff)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between', alignItems: 'center' }}>
          <input
            type="text"
            placeholder="Search DN #, Return #, Supplier..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="form-control form-control-sm"
            style={{ maxWidth: '300px' }}
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="form-control form-control-sm"
            style={{ maxWidth: '200px' }}
          >
            <option value="">All Statuses</option>
            <option value="ISSUED">ISSUED</option>
            <option value="ACKNOWLEDGED">ACKNOWLEDGED</option>
            <option value="SETTLED">SETTLED</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ borderRadius: '10px', overflow: 'hidden', background: 'var(--card-bg, #fff)' }}>
        <div className="table-responsive">
          <table className="table table-hover mb-0" style={{ width: '100%', fontSize: '0.9rem' }}>
            <thead style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
              <tr>
                <th style={{ padding: '0.75rem 1rem' }}>Debit Note # &amp; Date</th>
                <th style={{ padding: '0.75rem 1rem' }}>Linked Return #</th>
                <th style={{ padding: '0.75rem 1rem' }}>Store Facility</th>
                <th style={{ padding: '0.75rem 1rem' }}>Supplier</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Taxable</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>GST (18%)</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Total Claim</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Status</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', padding: '3rem' }}>
                    <i className="fa-solid fa-spinner fa-spin fa-2x text-muted mb-2" /><br />
                    Loading debit notes...
                  </td>
                </tr>
              ) : filteredNotes.length === 0 ? (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
                    <i className="fa-solid fa-file-invoice fa-2x text-muted mb-2" /><br />
                    No debit notes matching criteria.
                  </td>
                </tr>
              ) : (
                filteredNotes.map((dn) => (
                  <tr key={dn.debit_note_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ fontWeight: 700, fontFamily: 'monospace', color: '#0f172a' }}>{dn.debit_note_number}</div>
                      <div className="text-muted" style={{ fontSize: '0.8rem' }}>{dn.issue_date}</div>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontWeight: 600 }}>
                      {dn.return_number}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem' }}>{dn.location_name}</td>
                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem', fontWeight: 600 }}>{dn.supplier_name}</td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>₹{dn.taxable_amount.toFixed(2)}</td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>₹{dn.gst_amount.toFixed(2)}</td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 700, color: '#dc2626' }}>
                      ₹{dn.total_amount.toFixed(2)}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                      <StatusBadge status={dn.status} />
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'center' }}>
                        <button
                          className="btn btn-sm btn-outline-secondary"
                          onClick={() => setViewInvoice(dn)}
                          title="View Official Tax Invoice Claim"
                        >
                          <i className="fa-solid fa-eye" />
                        </button>

                        {canManage && dn.status === 'ISSUED' && (
                          <button
                            className="btn btn-sm btn-outline-primary"
                            onClick={() => handleAcknowledge(dn.debit_note_id)}
                            title="Mark Supplier Acknowledged"
                          >
                            Ack
                          </button>
                        )}

                        {canManage && (dn.status === 'ISSUED' || dn.status === 'ACKNOWLEDGED') && (
                          <button
                            className="btn btn-sm btn-success"
                            onClick={() => {
                              setSettleTarget(dn);
                              setCreditRef('');
                            }}
                            title="Record Supplier Credit Received"
                          >
                            Settle
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Settle Credit Modal */}
      {settleTarget && (
        <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1050 }}>
          <div className="modal-dialog" style={{ background: '#fff', borderRadius: '12px', width: '480px', padding: '1.5rem', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' }}>
            <h4 style={{ margin: '0 0 1rem', fontWeight: 700 }}>Record Supplier Credit Received</h4>
            <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.85rem' }}>
              <div><strong>Debit Note:</strong> {settleTarget.debit_note_number}</div>
              <div><strong>Supplier:</strong> {settleTarget.supplier_name}</div>
              <div><strong>Total Credit Claim:</strong> ₹{settleTarget.total_amount.toFixed(2)}</div>
            </div>

            <form onSubmit={handleSettleSubmit}>
              <div className="mb-3">
                <label className="form-label" style={{ fontWeight: 600 }}>Supplier Credit Note Reference #</label>
                <input
                  type="text"
                  className="form-control"
                  value={creditRef}
                  onChange={(e) => setCreditRef(e.target.value)}
                  placeholder="e.g. SCN-2026-98124"
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                <button type="button" className="btn btn-outline" onClick={() => setSettleTarget(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-success" disabled={submitting}>
                  {submitting ? 'Settling...' : 'Confirm Credit Received'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Invoice Modal */}
      {viewInvoice && (
        <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1050 }}>
          <div className="modal-dialog" style={{ background: '#fff', borderRadius: '12px', width: '560px', padding: '2rem', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' }}>
            <div style={{ textAlign: 'center', borderBottom: '2px solid #e2e8f0', paddingBottom: '1rem', marginBottom: '1.25rem' }}>
              <h3 style={{ margin: 0, fontWeight: 800, color: '#0f172a' }}>OFFICIAL DEBIT NOTE</h3>
              <p className="text-muted" style={{ margin: '0.25rem 0 0', fontSize: '0.85rem' }}>Tax Recovery &amp; Vendor Return Credit Adjustment</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
              <div>
                <div className="text-muted">Debit Note Number:</div>
                <div style={{ fontWeight: 700, fontFamily: 'monospace' }}>{viewInvoice.debit_note_number}</div>
                <div className="text-muted" style={{ marginTop: '0.5rem' }}>Issue Date:</div>
                <div style={{ fontWeight: 600 }}>{viewInvoice.issue_date}</div>
              </div>
              <div>
                <div className="text-muted">Supplier / Vendor:</div>
                <div style={{ fontWeight: 700 }}>{viewInvoice.supplier_name}</div>
                <div className="text-muted" style={{ marginTop: '0.5rem' }}>Return Reference:</div>
                <div style={{ fontWeight: 600, fontFamily: 'monospace' }}>{viewInvoice.return_number}</div>
              </div>
            </div>

            <table className="table table-bordered mb-3" style={{ fontSize: '0.85rem' }}>
              <thead style={{ background: '#f8fafc' }}>
                <tr>
                  <th>Description</th>
                  <th style={{ textAlign: 'right' }}>Amount (₹)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Near-Expiry Stock Return Claim (Taxable)</td>
                  <td style={{ textAlign: 'right' }}>₹{viewInvoice.taxable_amount.toFixed(2)}</td>
                </tr>
                <tr>
                  <td>GST Input Reversal (18%)</td>
                  <td style={{ textAlign: 'right' }}>₹{viewInvoice.gst_amount.toFixed(2)}</td>
                </tr>
                <tr style={{ fontWeight: 700, background: '#fafafa' }}>
                  <td>Total Net Credit Claim</td>
                  <td style={{ textAlign: 'right', color: '#16a34a' }}>₹{viewInvoice.total_amount.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
              <button className="btn btn-secondary" onClick={() => setViewInvoice(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


import React, { useState, useEffect } from 'react';
import { returnsAPI, batchAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/StatusBadge';

export default function ExpiryReturns() {
  const { user } = useAuth();
  const [returns, setReturns] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState(null);

  // Draft Modal State
  const [showDraftModal, setShowDraftModal] = useState(false);
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [returnQty, setReturnQty] = useState(1);
  const [reason, setReason] = useState('Hit Supplier Expiry Return Window');
  const [submitting, setSubmitting] = useState(false);
  const [processingId, setProcessingId] = useState(null);

  const canDraft = ['admin', 'store_executive', 'store_supervisor'].includes(user?.role);
  const canPost = ['admin', 'store_supervisor'].includes(user?.role);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [retRes, stockRes] = await Promise.all([
        returnsAPI.getReturns(),
        batchAPI.getBatchStock()
      ]);
      if (retRes?.success) setReturns(retRes.returns || []);
      if (stockRes?.success) {
        // Only batches with positive saleable stock
        setBatches((stockRes.batches || []).filter(b => (b.quantity_saleable || 0) > 0));
      }
    } catch (err) {
      setFeedback({ type: 'danger', message: err.message || 'Failed to load expiry returns data.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleDraftSubmit = async (e) => {
    e.preventDefault();
    const batch = batches.find(b => String(b.batch_id) === String(selectedBatchId));
    if (!batch) return;

    try {
      setSubmitting(true);
      const res = await returnsAPI.createReturn({
        location_id: batch.location_id,
        supplier_id: batch.supplier_id || 1,
        product_id: batch.product_id,
        batch_id: batch.batch_id,
        quantity: parseInt(returnQty, 10),
        reason: reason
      });

      if (res?.success) {
        setFeedback({ type: 'success', message: `Expiry return claim ${res.return.return_number} drafted successfully! Awaiting supervisor authorization.` });
        setShowDraftModal(false);
        fetchData();
      }
    } catch (err) {
      setFeedback({ type: 'danger', message: err.message || 'Failed to draft expiry return.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handlePostReturn = async (retId) => {
    try {
      setProcessingId(retId);
      const res = await returnsAPI.postReturn(retId);
      if (res?.success) {
        setFeedback({
          type: 'success',
          message: `Return posted! ${res.result.message} Total claim: ₹${res.result.total_credit_amount}.`
        });
        fetchData();
      }
    } catch (err) {
      setFeedback({ type: 'danger', message: err.message || 'Posting rejected by Segregation of Duties or stock guard.' });
    } finally {
      setProcessingId(null);
    }
  };

  const selectedBatch = batches.find(b => String(b.batch_id) === String(selectedBatchId));

  return (
    <div className="expiry-returns-page container" style={{ padding: '1.5rem 1rem' }}>
      {/* Header */}
      <div className="page-header mb-4 flex-between">
        <div>
          <h2 className="page-title" style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0 }}>
            <i className="fa-solid fa-arrow-rotate-left text-danger me-2" />
            Vendor Expiry Returns &amp; Claims
          </h2>
          <p className="text-muted" style={{ margin: '0.25rem 0 0' }}>
            Store-level vendor return window claims, atomic scrap ledger movements, and automatic debit note generation.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          {canDraft && (
            <button className="btn btn-primary" onClick={() => setShowDraftModal(true)}>
              <i className="fa-solid fa-plus me-2" /> Draft Expiry Return
            </button>
          )}
          <button className="btn btn-outline" onClick={fetchData} disabled={loading}>
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

      {/* Advisory Policy Banner */}
      <div className="alert alert-info mb-4" style={{ borderRadius: '8px', fontSize: '0.9rem' }}>
        <i className="fa-solid fa-shield-halved me-2 text-info" />
        <strong>Segregation of Duties Enforced:</strong> Store Executives draft vendor returns. Store Supervisors review, approve, and atomically post them. The supervisor who posts <strong>cannot</strong> be the same user who drafted the return.
      </div>

      {/* Returns List Table */}
      <div className="card" style={{ borderRadius: '10px', overflow: 'hidden', background: 'var(--card-bg, #fff)' }}>
        <div className="table-responsive">
          <table className="table table-hover mb-0" style={{ width: '100%', fontSize: '0.9rem' }}>
            <thead style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
              <tr>
                <th style={{ padding: '0.75rem 1rem' }}>Return # &amp; Date</th>
                <th style={{ padding: '0.75rem 1rem' }}>Product &amp; Batch</th>
                <th style={{ padding: '0.75rem 1rem' }}>Store Facility</th>
                <th style={{ padding: '0.75rem 1rem' }}>Supplier</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Return Qty</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Claim Value</th>
                <th style={{ padding: '0.75rem 1rem' }}>Drafter / Approver</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Status</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', padding: '3rem' }}>
                    <i className="fa-solid fa-spinner fa-spin fa-2x text-muted mb-2" /><br />
                    Loading vendor expiry returns...
                  </td>
                </tr>
              ) : returns.length === 0 ? (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
                    <i className="fa-solid fa-clipboard-check fa-2x text-success mb-2" /><br />
                    No vendor expiry returns currently logged.
                  </td>
                </tr>
              ) : (
                returns.map((r) => {
                  const isDraft = r.status === 'DRAFT';
                  const isDrafter = user?.username === r.created_by;
                  const canApprovePost = canPost && isDraft && !isDrafter;

                  return (
                    <tr key={r.return_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ fontWeight: 700, fontFamily: 'monospace', color: '#0f172a' }}>{r.return_number}</div>
                        <div className="text-muted" style={{ fontSize: '0.8rem' }}>{r.created_at.slice(0, 10)}</div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ fontWeight: 600 }}>{r.product_name}</div>
                        <div className="text-muted" style={{ fontSize: '0.8rem', fontFamily: 'monospace' }}>Batch #{r.batch_number}</div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem' }}>{r.location_name}</td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem' }}>{r.supplier_name}</td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600 }}>{r.quantity}</td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 700, color: '#dc2626' }}>
                        ₹{r.total_claim_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem' }}>
                        <div>Drafted: <strong>{r.created_by}</strong></div>
                        {r.posted_by && <div className="text-muted">Posted: <strong>{r.posted_by}</strong></div>}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                        <StatusBadge status={r.status} />
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                        {isDraft && canApprovePost && (
                          <button
                            className="btn btn-sm btn-success"
                            disabled={processingId === r.return_id}
                            onClick={() => handlePostReturn(r.return_id)}
                          >
                            <i className="fa-solid fa-check-double me-1" /> Approve &amp; Post
                          </button>
                        )}
                        {isDraft && isDrafter && (
                          <span className="badge bg-secondary" title="Segregation of Duties: Drafter cannot approve/post their own return">
                            Self-Drafted
                          </span>
                        )}
                        {!isDraft && (
                          <span className="text-muted" style={{ fontSize: '0.8rem' }}>
                            <i className="fa-solid fa-lock me-1" /> Posted
                          </span>
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

      {/* Draft Return Modal */}
      {showDraftModal && (
        <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1050 }}>
          <div className="modal-dialog" style={{ background: '#fff', borderRadius: '12px', width: '500px', padding: '1.5rem', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' }}>
            <h4 style={{ margin: '0 0 1rem', fontWeight: 700 }}>Draft Vendor Expiry Return</h4>
            <p className="text-muted" style={{ fontSize: '0.85rem' }}>
              Pull near-expiry or expired units from saleable inventory for vendor return claim credit.
            </p>

            <form onSubmit={handleDraftSubmit}>
              <div className="mb-3">
                <label className="form-label" style={{ fontWeight: 600 }}>Select Stock Lot</label>
                <select
                  className="form-select"
                  value={selectedBatchId}
                  onChange={(e) => {
                    setSelectedBatchId(e.target.value);
                    const sel = batches.find(b => String(b.batch_id) === e.target.value);
                    if (sel) setReturnQty(Math.min(10, sel.quantity_saleable));
                  }}
                  required
                >
                  <option value="">-- Choose Near-Expiry Batch --</option>
                  {batches.map(b => (
                    <option key={b.batch_id} value={b.batch_id}>
                      {b.product_name} | Batch #{b.batch_number} (Exp: {b.expiry_date}) | Available: {b.quantity_saleable} | {b.location_name}
                    </option>
                  ))}
                </select>
              </div>

              {selectedBatch && (
                <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.85rem' }}>
                  <div><strong>Unit Cost:</strong> ₹{selectedBatch.cost_price} | <strong>Saleable:</strong> {selectedBatch.quantity_saleable} units</div>
                  <div><strong>Estimated Claim:</strong> ₹{(returnQty * selectedBatch.cost_price).toFixed(2)}</div>
                </div>
              )}

              <div className="mb-3">
                <label className="form-label" style={{ fontWeight: 600 }}>Return Quantity</label>
                <input
                  type="number"
                  min="1"
                  max={selectedBatch ? selectedBatch.quantity_saleable : 9999}
                  className="form-control"
                  value={returnQty}
                  onChange={(e) => setReturnQty(e.target.value)}
                  required
                />
              </div>

              <div className="mb-3">
                <label className="form-label" style={{ fontWeight: 600 }}>Return Reason</label>
                <input
                  type="text"
                  className="form-control"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Hit Supplier Expiry Return Window (30 days)"
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowDraftModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting || !selectedBatchId}>
                  {submitting ? 'Drafting...' : 'Draft Return Claim'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}


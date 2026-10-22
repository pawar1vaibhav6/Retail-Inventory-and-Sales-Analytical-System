import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { approvalsAPI, auditsAPI, markdownsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/StatusBadge';

export default function ApprovalsInbox() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [inbox, setInbox] = useState({ pending_audits: [], pending_markdowns: [] });
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState(null);
  const [processingId, setProcessingId] = useState(null);

  const fetchInbox = async () => {
    try {
      setLoading(true);
      const res = await approvalsAPI.getPendingApprovals();
      if (res?.success) {
        setInbox(res.inbox || { pending_audits: [], pending_markdowns: [] });
      }
    } catch (err) {
      setFeedback({ type: 'danger', message: err.message || 'Failed to fetch approvals inbox.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInbox();
  }, []);

  const handleQuickApproveAudit = async (auditId) => {
    try {
      setProcessingId(`audit-${auditId}`);
      const res = await auditsAPI.approveAudit(auditId);
      if (res?.success) {
        setFeedback({ type: 'success', message: `Audit adjustments approved and posted to inventory ledger!` });
        fetchInbox();
      }
    } catch (err) {
      setFeedback({ type: 'danger', message: err.message || 'Audit approval rejected.' });
    } finally {
      setProcessingId(null);
    }
  };

  const handleQuickApproveMarkdown = async (mkd) => {
    try {
      setProcessingId(`mkd-${mkd.markdown_id}`);
      const res = await markdownsAPI.approveMarkdown(mkd.markdown_id, {
        approved_discount_percent: mkd.proposed_discount_percent,
        notes: 'Fast-track approval from governance inbox'
      });
      if (res?.success) {
        setFeedback({ type: 'success', message: `Markdown promotion ${mkd.promotion_code} activated!` });
        fetchInbox();
      }
    } catch (err) {
      setFeedback({ type: 'danger', message: err.message || 'Markdown approval rejected.' });
    } finally {
      setProcessingId(null);
    }
  };

  const totalPending = (inbox.pending_audits?.length || 0) + (inbox.pending_markdowns?.length || 0);

  return (
    <div className="approvals-inbox-page container" style={{ padding: '1.5rem 1rem' }}>
      {/* Header */}
      <div className="page-header mb-4 flex-between">
        <div>
          <h2 className="page-title" style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0 }}>
            <i className="fa-solid fa-inbox text-primary me-2" />
            Governance Approvals Inbox
          </h2>
          <p className="text-muted" style={{ margin: '0.25rem 0 0' }}>
            Unified queue of pending physical audits, markdown promotions, and returns with strict Segregation of Duties.
          </p>
        </div>
        <button className="btn btn-outline" onClick={fetchInbox} disabled={loading}>
          <i className="fa-solid fa-rotate me-2" /> Refresh Queue
        </button>
      </div>

      {feedback && (
        <div className={`alert alert-${feedback.type} mb-4 flex-between`} style={{ padding: '0.75rem 1rem' }}>
          <span>{feedback.message}</span>
          <button className="btn-close" onClick={() => setFeedback(null)}>×</button>
        </div>
      )}

      {/* Segregation of Duties Banner */}
      <div className="alert alert-warning mb-4" style={{ borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <i className="fa-solid fa-shield-halved fa-lg text-warning" />
        <div style={{ fontSize: '0.9rem' }}>
          <strong>Segregation of Duties Enforced:</strong> Indian Retail Standard Policy mandates that creators/drafters cannot authorize their own counts or proposals. Dual-authorization protects margin integrity.
        </div>
      </div>

      {/* Section 1: Physical Audits Awaiting Discrepancy Approval */}
      <div className="card mb-4" style={{ borderRadius: '10px', overflow: 'hidden', background: 'var(--card-bg, #fff)' }}>
        <div style={{ padding: '1rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h5 style={{ margin: 0, fontWeight: 700 }}>
            <i className="fa-solid fa-list-check text-warning me-2" />
            Physical Count Audits ({inbox.pending_audits?.length || 0})
          </h5>
          <span className="badge bg-secondary">Awaiting Supervisor Approval</span>
        </div>

        <div className="table-responsive">
          <table className="table table-hover mb-0" style={{ width: '100%', fontSize: '0.9rem' }}>
            <thead style={{ background: '#fafafa', borderBottom: '2px solid #e2e8f0' }}>
              <tr>
                <th style={{ padding: '0.75rem 1rem' }}>Audit Number</th>
                <th style={{ padding: '0.75rem 1rem' }}>Store Facility</th>
                <th style={{ padding: '0.75rem 1rem' }}>Count Submitter</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Batches Counted</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Discrepancies</th>
                <th style={{ padding: '0.75rem 1rem' }}>Submitted At</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {inbox.pending_audits?.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                    <i className="fa-solid fa-check-double fa-lg text-success me-2" />
                    No physical count audits awaiting your authorization.
                  </td>
                </tr>
              ) : (
                inbox.pending_audits?.map((a) => (
                  <tr key={a.audit_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 700, fontFamily: 'monospace' }}>
                      {a.audit_number}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>{a.location_name}</td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <strong>{a.submitted_by}</strong>
                      {a.sod_blocked && <span className="badge bg-danger ms-2">You Counted</span>}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>{a.total_items} lots</td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                      {a.discrepancies > 0 ? (
                        <span className="badge bg-danger" style={{ fontWeight: 700 }}>{a.discrepancies} variance</span>
                      ) : (
                        <span className="badge bg-success">0 variance</span>
                      )}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem' }}>{a.created_at.slice(0, 16)}</td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                        <button
                          className="btn btn-sm btn-outline-primary"
                          onClick={() => navigate('/audits/code-management')}
                        >
                          Review Items
                        </button>
                        <button
                          className="btn btn-sm btn-success"
                          disabled={!a.can_approve || processingId === `audit-${a.audit_id}`}
                          onClick={() => handleQuickApproveAudit(a.audit_id)}
                          title={a.sod_blocked ? "Segregation of Duties: Cannot approve your own physical counts" : "Approve Discrepancies"}
                        >
                          {a.sod_blocked ? 'Self-Blocked' : 'Authorize'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 2: Markdown Promotions Awaiting Approval */}
      <div className="card" style={{ borderRadius: '10px', overflow: 'hidden', background: 'var(--card-bg, #fff)' }}>
        <div style={{ padding: '1rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h5 style={{ margin: 0, fontWeight: 700 }}>
            <i className="fa-solid fa-tags text-warning me-2" />
            Markdown Promotions ({inbox.pending_markdowns?.length || 0})
          </h5>
          <span className="badge bg-secondary">Awaiting Review</span>
        </div>

        <div className="table-responsive">
          <table className="table table-hover mb-0" style={{ width: '100%', fontSize: '0.9rem' }}>
            <thead style={{ background: '#fafafa', borderBottom: '2px solid #e2e8f0' }}>
              <tr>
                <th style={{ padding: '0.75rem 1rem' }}>Promo Code</th>
                <th style={{ padding: '0.75rem 1rem' }}>Product &amp; Batch</th>
                <th style={{ padding: '0.75rem 1rem' }}>Facility</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Proposed Discount</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Promo Price</th>
                <th style={{ padding: '0.75rem 1rem' }}>Proposer</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {inbox.pending_markdowns?.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                    <i className="fa-solid fa-check-double fa-lg text-success me-2" />
                    No markdown promotions awaiting your authorization.
                  </td>
                </tr>
              ) : (
                inbox.pending_markdowns?.map((m) => (
                  <tr key={m.markdown_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 700, fontFamily: 'monospace' }}>
                      {m.promotion_code}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ fontWeight: 600 }}>{m.product_name}</div>
                      <div className="text-muted" style={{ fontSize: '0.8rem', fontFamily: 'monospace' }}>Batch #{m.batch_number}</div>
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>{m.location_name}</td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center', fontWeight: 700, color: '#dc2626' }}>
                      {m.proposed_discount_percent}% OFF
                      {m.proposed_discount_percent > 20 && (
                        <div style={{ fontSize: '0.75rem', color: '#7c3aed' }}>Requires Cat Mgr</div>
                      )}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 700, color: '#16a34a' }}>
                      ₹{m.markdown_price.toFixed(2)}
                      {m.is_below_floor && <div className="text-danger" style={{ fontSize: '0.75rem' }}>Below Floor</div>}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <strong>{m.created_by}</strong>
                      {m.sod_blocked && <span className="badge bg-danger ms-2">You Drafted</span>}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                      <button
                        className="btn btn-sm btn-success"
                        disabled={!m.can_approve || processingId === `mkd-${m.markdown_id}`}
                        onClick={() => handleQuickApproveMarkdown(m)}
                        title={m.sod_blocked ? "Segregation of Duties: Cannot approve markdown you proposed" : "Authorize Markdown"}
                      >
                        {m.sod_blocked ? 'Self-Blocked' : 'Authorize'}
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


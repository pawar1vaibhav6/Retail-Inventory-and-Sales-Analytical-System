import React, { useState, useEffect } from 'react';
import { auditsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/StatusBadge';

export default function CodeManagementAudits() {
  const { user } = useAuth();
  const [audits, setAudits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedAudit, setSelectedAudit] = useState(null);
  const [auditDetail, setAuditDetail] = useState(null);
  const [counts, setCounts] = useState({});
  const [remarks, setRemarks] = useState({});
  const [feedback, setFeedback] = useState(null);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleLocationId, setScheduleLocationId] = useState('2');
  const [submitting, setSubmitting] = useState(false);

  const canCreate = ['admin', 'store_supervisor'].includes(user?.role);
  const canCount = ['admin', 'store_executive', 'store_supervisor'].includes(user?.role);
  const canApprove = ['admin', 'store_supervisor'].includes(user?.role);

  const fetchAudits = async () => {
    try {
      setLoading(true);
      const res = await auditsAPI.getAudits();
      if (res?.success) {
        setAudits(res.audits || []);
      }
    } catch (err) {
      setFeedback({ type: 'danger', message: err.message || 'Failed to fetch audit list.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAudits();
  }, []);

  const handleSelectAudit = async (audit) => {
    try {
      setSelectedAudit(audit);
      setLoading(true);
      const res = await auditsAPI.getAudit(audit.audit_id);
      if (res?.success) {
        setAuditDetail(res.audit);
        const initialCounts = {};
        const initialRemarks = {};
        (res.audit.items || []).forEach((item) => {
          initialCounts[item.audit_item_id] = item.physical_qty !== null ? item.physical_qty : item.system_qty;
          initialRemarks[item.audit_item_id] = item.remarks || '';
        });
        setCounts(initialCounts);
        setRemarks(initialRemarks);
      }
    } catch (err) {
      setFeedback({ type: 'danger', message: err.message || 'Failed to load audit detail.' });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAudit = async (e) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      const res = await auditsAPI.createAudit({ location_id: scheduleLocationId });
      if (res?.success) {
        setFeedback({ type: 'success', message: `Audit task ${res.audit.audit_number} created with ${res.audit.total_batches_to_count} lots to count.` });
        setShowScheduleModal(false);
        fetchAudits();
      }
    } catch (err) {
      setFeedback({ type: 'danger', message: err.message || 'Failed to create audit task.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitCounts = async () => {
    if (!auditDetail) return;
    try {
      setSubmitting(true);
      const physicalCounts = (auditDetail.items || []).map((item) => ({
        audit_item_id: item.audit_item_id,
        physical_qty: parseInt(counts[item.audit_item_id] ?? item.system_qty, 10),
        remarks: remarks[item.audit_item_id] || ''
      }));

      const res = await auditsAPI.submitAudit(auditDetail.audit_id, physicalCounts);
      if (res?.success) {
        setFeedback({ type: 'success', message: `Physical counts submitted! Discrepant batches detected: ${res.result.discrepant_batches}. Awaiting supervisor approval.` });
        handleSelectAudit(selectedAudit);
        fetchAudits();
      }
    } catch (err) {
      setFeedback({ type: 'danger', message: err.message || 'Failed to submit physical counts.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleApproveDiscrepancies = async () => {
    if (!auditDetail) return;
    try {
      setSubmitting(true);
      const res = await auditsAPI.approveAudit(auditDetail.audit_id);
      if (res?.success) {
        setFeedback({ type: 'success', message: `Audit #${auditDetail.audit_number} approved! Inventory ledger adjusted for ${res.approval.adjustments_applied} batches.` });
        handleSelectAudit(selectedAudit);
        fetchAudits();
      }
    } catch (err) {
      setFeedback({ type: 'danger', message: err.message || 'Approval rejected by segregation of duties or business policy.' });
    } finally {
      setSubmitting(false);
    }
  };

  const isSubmitter = user?.username === (auditDetail?.submitted_by || auditDetail?.created_by);
  const sodBlocked = canApprove && isSubmitter && auditDetail?.status === 'SUBMITTED';

  return (
    <div className="code-audits-page container" style={{ padding: '1.5rem 1rem' }}>
      {/* Header */}
      <div className="page-header mb-4 flex-between">
        <div>
          <h2 className="page-title" style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0 }}>
            <i className="fa-solid fa-list-check text-warning me-2" />
            Code Management &amp; Physical Stock Audits
          </h2>
          <p className="text-muted" style={{ margin: '0.25rem 0 0' }}>
            Store-level batch expiration audits, blind count capture, and dual-authorization discrepancy adjustments.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          {canCreate && (
            <button className="btn btn-primary" onClick={() => setShowScheduleModal(true)}>
              <i className="fa-solid fa-plus me-2" /> Schedule Store Audit
            </button>
          )}
          <button className="btn btn-outline" onClick={fetchAudits} disabled={loading}>
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

      {/* Main Grid: Left Audit Tasks List, Right Audit Workspace */}
      <div style={{ display: 'grid', gridTemplateColumns: selectedAudit ? '360px 1fr' : '1fr', gap: '1.5rem' }}>
        {/* Audit List Panel */}
        <div className="card" style={{ borderRadius: '10px', background: 'var(--card-bg, #fff)' }}>
          <div style={{ padding: '1rem', borderBottom: '1px solid #e2e8f0', fontWeight: 700, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Audit Tasks ({audits.length})</span>
            {selectedAudit && (
              <button className="btn btn-sm btn-link text-muted p-0" onClick={() => { setSelectedAudit(null); setAuditDetail(null); }}>
                Close Detail
              </button>
            )}
          </div>
          <div style={{ maxHeight: '680px', overflowY: 'auto' }}>
            {audits.length === 0 ? (
              <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: '#64748b' }}>
                <i className="fa-solid fa-clipboard-check fa-2x text-muted mb-2" /><br />
                No physical audits scheduled.
              </div>
            ) : (
              audits.map((a) => {
                const isSelected = selectedAudit?.audit_id === a.audit_id;
                return (
                  <div
                    key={a.audit_id}
                    onClick={() => handleSelectAudit(a)}
                    style={{
                      padding: '1rem',
                      borderBottom: '1px solid #f1f5f9',
                      cursor: 'pointer',
                      background: isSelected ? 'rgba(37,99,235,0.06)' : 'transparent',
                      borderLeft: isSelected ? '4px solid #2563eb' : '4px solid transparent'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                      <span style={{ fontWeight: 700, fontFamily: 'monospace', color: '#0f172a' }}>
                        {a.audit_number}
                      </span>
                      <StatusBadge status={a.status} />
                    </div>
                    <div style={{ fontSize: '0.85rem', color: '#475569', display: 'flex', justifyContent: 'space-between' }}>
                      <span><i className="fa-solid fa-store me-1" />{a.location_name}</span>
                      <span>{a.created_at.slice(0, 10)}</span>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.25rem' }}>
                      By: <strong>{a.created_by}</strong> {a.submitted_by ? `• Counted by: ${a.submitted_by}` : ''}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Audit Detail Workspace */}
        {selectedAudit && (
          <div className="card" style={{ borderRadius: '10px', background: 'var(--card-bg, #fff)', display: 'flex', flexDirection: 'column' }}>
            {loading && !auditDetail ? (
              <div style={{ padding: '4rem', textAlign: 'center' }}>
                <i className="fa-solid fa-spinner fa-spin fa-2x text-muted mb-2" /><br />
                Loading audit workspace...
              </div>
            ) : auditDetail ? (
              <>
                {/* Workspace Header */}
                <div style={{ padding: '1.25rem', borderBottom: '1px solid #e2e8f0', background: 'var(--header-bg, #f8fafc)', borderRadius: '10px 10px 0 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <h4 style={{ margin: 0, fontWeight: 700, fontFamily: 'monospace' }}>{auditDetail.audit_number}</h4>
                        <StatusBadge status={auditDetail.status} />
                      </div>
                      <div className="text-muted" style={{ fontSize: '0.85rem', marginTop: '0.35rem' }}>
                        Facility: <strong>{auditDetail.location_name}</strong> • Scheduled by: <strong>{auditDetail.created_by}</strong> on {auditDetail.created_at}
                      </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                      {auditDetail.status === 'PENDING_COUNT' && canCount && (
                        <button className="btn btn-primary btn-sm" onClick={handleSubmitCounts} disabled={submitting}>
                          <i className="fa-solid fa-cloud-arrow-up me-2" /> Submit Physical Counts
                        </button>
                      )}

                      {auditDetail.status === 'SUBMITTED' && canApprove && (
                        <button
                          className="btn btn-success btn-sm"
                          onClick={handleApproveDiscrepancies}
                          disabled={submitting || sodBlocked}
                          title={sodBlocked ? "Segregation of Duties: You submitted the physical counts, so another supervisor must approve." : "Approve physical count adjustments"}
                        >
                          <i className="fa-solid fa-check-double me-2" /> Approve &amp; Adjust Stock
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Segregation of Duties Guard Alert */}
                  {sodBlocked && (
                    <div className="alert alert-warning mt-3 mb-0" style={{ padding: '0.65rem 0.9rem', fontSize: '0.85rem', borderRadius: '6px' }}>
                      <i className="fa-solid fa-shield-halved me-2" />
                      <strong>Segregation of Duties Enforced:</strong> You submitted the physical count data for this audit (<code>{auditDetail.submitted_by}</code>). A different Store Supervisor or System Admin must review and approve the inventory adjustments.
                    </div>
                  )}
                </div>

                {/* Audit Items Table */}
                <div className="table-responsive" style={{ flex: 1 }}>
                  <table className="table table-hover mb-0" style={{ width: '100%', fontSize: '0.9rem' }}>
                    <thead style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                      <tr>
                        <th style={{ padding: '0.75rem 1rem' }}>Product &amp; SKU</th>
                        <th style={{ padding: '0.75rem 1rem' }}>Batch #</th>
                        <th style={{ padding: '0.75rem 1rem' }}>Expiry</th>
                        <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>System Qty</th>
                        <th style={{ padding: '0.75rem 1rem', textAlign: 'center', width: '130px' }}>Physical Count</th>
                        <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Discrepancy</th>
                        <th style={{ padding: '0.75rem 1rem' }}>Remarks / Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(auditDetail.items || []).map((item) => {
                        const physVal = counts[item.audit_item_id] ?? item.system_qty;
                        const disc = parseInt(physVal, 10) - item.system_qty;
                        const isPending = auditDetail.status === 'PENDING_COUNT';

                        return (
                          <tr key={item.audit_item_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '0.75rem 1rem' }}>
                              <div style={{ fontWeight: 600 }}>{item.product_name}</div>
                              <div className="text-muted" style={{ fontSize: '0.8rem' }}>SKU #{item.product_id}</div>
                            </td>
                            <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontWeight: 600 }}>
                              {item.batch_number}
                            </td>
                            <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem' }}>
                              {item.expiry_date}
                            </td>
                            <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600 }}>
                              {item.system_qty}
                            </td>
                            <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                              {isPending ? (
                                <input
                                  type="number"
                                  min="0"
                                  className="form-control form-control-sm text-center"
                                  style={{ fontWeight: 700, width: '90px', margin: '0 auto' }}
                                  value={physVal}
                                  onChange={(e) => setCounts({ ...counts, [item.audit_item_id]: e.target.value })}
                                />
                              ) : (
                                <span style={{ fontWeight: 700 }}>{item.physical_qty ?? item.system_qty}</span>
                              )}
                            </td>
                            <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                              {disc === 0 ? (
                                <span className="badge bg-success-subtle text-success" style={{ fontWeight: 700 }}>
                                  0 (Exact)
                                </span>
                              ) : disc > 0 ? (
                                <span className="badge bg-primary" style={{ fontWeight: 700 }}>
                                  +{disc} Surplus
                                </span>
                              ) : (
                                <span className="badge bg-danger" style={{ fontWeight: 700 }}>
                                  {disc} Shortage
                                </span>
                              )}
                            </td>
                            <td style={{ padding: '0.75rem 1rem' }}>
                              {isPending ? (
                                <input
                                  type="text"
                                  placeholder="Observation notes..."
                                  className="form-control form-control-sm"
                                  value={remarks[item.audit_item_id] || ''}
                                  onChange={(e) => setRemarks({ ...remarks, [item.audit_item_id]: e.target.value })}
                                />
                              ) : (
                                <span className="text-muted" style={{ fontSize: '0.85rem' }}>{item.remarks || '-'}</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}
          </div>
        )}
      </div>

      {/* Schedule Audit Modal */}
      {showScheduleModal && (
        <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1050 }}>
          <div className="modal-dialog" style={{ background: '#fff', borderRadius: '12px', width: '450px', padding: '1.5rem', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' }}>
            <h4 style={{ margin: '0 0 1rem', fontWeight: 700 }}>Schedule Physical Count Audit</h4>
            <p className="text-muted" style={{ fontSize: '0.9rem' }}>
              Generates a verified inventory audit task for the store. Batches with positive stock will be frozen for counting.
            </p>
            <form onSubmit={handleCreateAudit}>
              <div className="mb-3">
                <label className="form-label" style={{ fontWeight: 600 }}>Select Store Facility</label>
                <select
                  className="form-select"
                  value={scheduleLocationId}
                  onChange={(e) => setScheduleLocationId(e.target.value)}
                >
                  <option value="2">STORE-101 (Store 101 - Bandra)</option>
                  <option value="3">STORE-102 (Store 102 - Thane)</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowScheduleModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Generating Task...' : 'Schedule Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}


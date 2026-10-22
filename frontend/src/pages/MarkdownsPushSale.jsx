import React, { useState, useEffect } from 'react';
import { markdownsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/StatusBadge';

export default function MarkdownsPushSale() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('suggestions'); // 'suggestions' | 'promotions'
  const [suggestions, setSuggestions] = useState([]);
  const [promotions, setPromotions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState(null);

  // Propose Modal State
  const [showProposeModal, setShowProposeModal] = useState(false);
  const [proposeTarget, setProposeTarget] = useState(null);
  const [proposedDiscount, setProposedDiscount] = useState(10);
  const [proposeNotes, setProposeNotes] = useState('');

  // Approve Modal State
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [approveTarget, setApproveTarget] = useState(null);
  const [approvedDiscount, setApprovedDiscount] = useState(10);
  const [approveNotes, setApproveNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);

  const canPropose = ['admin', 'store_executive', 'store_supervisor'].includes(user?.role);
  const canApprove = ['admin', 'store_supervisor', 'category_manager'].includes(user?.role);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [suggRes, promoRes] = await Promise.all([
        markdownsAPI.getSuggestions(),
        markdownsAPI.getPromotions()
      ]);
      if (suggRes?.success) setSuggestions(suggRes.suggestions || []);
      if (promoRes?.success) setPromotions(promoRes.promotions || []);
    } catch (err) {
      setFeedback({ type: 'danger', message: err.message || 'Failed to load markdown data.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const openProposeModal = (sugg) => {
    setProposeTarget(sugg);
    setProposedDiscount(sugg.suggested_discount_percent);
    setProposeNotes(`Near-expiry markdown push sale (${sugg.days_to_expiry} days left)`);
    setShowProposeModal(true);
  };

  const openApproveModal = (promo) => {
    setApproveTarget(promo);
    setApprovedDiscount(promo.suggested_discount_percent || 10);
    setApproveNotes(promo.approval_notes || '');
    setShowApproveModal(true);
  };

  const handleProposeSubmit = async (e) => {
    e.preventDefault();
    if (!proposeTarget) return;
    try {
      setSubmitting(true);
      const res = await markdownsAPI.proposeMarkdown({
        location_id: proposeTarget.location_id,
        product_id: proposeTarget.product_id,
        batch_id: proposeTarget.batch_id,
        proposed_discount_percent: parseFloat(proposedDiscount),
        notes: proposeNotes
      });
      if (res?.success) {
        setFeedback({ type: 'success', message: `Markdown promotion proposal ${res.markdown.promotion_code} submitted for supervisor review!` });
        setShowProposeModal(false);
        fetchData();
      }
    } catch (err) {
      setFeedback({ type: 'danger', message: err.message || 'Failed to submit markdown proposal.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleApproveSubmit = async (e) => {
    e.preventDefault();
    if (!approveTarget) return;
    try {
      setSubmitting(true);
      const res = await markdownsAPI.approveMarkdown(approveTarget.markdown_id, {
        approved_discount_percent: parseFloat(approvedDiscount),
        notes: approveNotes
      });
      if (res?.success) {
        setFeedback({ type: 'success', message: `Markdown promotion approved and activated for POS push-sale at ₹${res.markdown.markdown_price}!` });
        setShowApproveModal(false);
        fetchData();
      }
    } catch (err) {
      setFeedback({ type: 'danger', message: err.message || 'Markdown approval rejected.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="markdowns-page container" style={{ padding: '1.5rem 1rem' }}>
      {/* Header */}
      <div className="page-header mb-4 flex-between">
        <div>
          <h2 className="page-title" style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0 }}>
            <i className="fa-solid fa-tags text-warning me-2" />
            Near-Expiry Markdowns &amp; Push Sale
          </h2>
          <p className="text-muted" style={{ margin: '0.25rem 0 0' }}>
            Multi-tier markdown thresholds, floor price protection, and real-time push-sale sell-through tracking.
          </p>
        </div>
        <button className="btn btn-outline" onClick={fetchData} disabled={loading}>
          <i className="fa-solid fa-rotate me-2" /> Refresh
        </button>
      </div>

      {feedback && (
        <div className={`alert alert-${feedback.type} mb-4 flex-between`} style={{ padding: '0.75rem 1rem' }}>
          <span>{feedback.message}</span>
          <button className="btn-close" onClick={() => setFeedback(null)}>×</button>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '2px solid var(--border-color, #e2e8f0)', marginBottom: '1.5rem' }}>
        <button
          onClick={() => setActiveTab('suggestions')}
          style={{
            padding: '0.65rem 1.25rem',
            fontWeight: 600,
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'suggestions' ? '3px solid #2563eb' : '3px solid transparent',
            color: activeTab === 'suggestions' ? '#2563eb' : '#64748b',
            cursor: 'pointer'
          }}
        >
          <i className="fa-solid fa-lightbulb me-2" /> Markdown Suggestions ({suggestions.length})
        </button>
        <button
          onClick={() => setActiveTab('promotions')}
          style={{
            padding: '0.65rem 1.25rem',
            fontWeight: 600,
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'promotions' ? '3px solid #16a34a' : '3px solid transparent',
            color: activeTab === 'promotions' ? '#16a34a' : '#64748b',
            cursor: 'pointer'
          }}
        >
          <i className="fa-solid fa-bullhorn me-2" /> Active Promotions &amp; Push Sale ({promotions.length})
        </button>
      </div>

      {/* Tab 1: Markdown Suggestions */}
      {activeTab === 'suggestions' && (
        <div className="card" style={{ borderRadius: '10px', overflow: 'hidden', background: 'var(--card-bg, #fff)' }}>
          <div style={{ padding: '1rem', background: '#eff6ff', borderBottom: '1px solid #bfdbfe', fontSize: '0.85rem', color: '#1e40af' }}>
            <i className="fa-solid fa-shield-halved me-2" />
            <strong>DMart Markdown Policy:</strong> Suggested discount tiers: <strong>≤30d: 10%</strong> | <strong>≤15d: 25%</strong> | <strong>≤7d: 50%</strong>. Store Supervisor limit is <strong>20%</strong>; discounts above 20% require <strong>Category Manager</strong> authorization.
          </div>
          <div className="table-responsive">
            <table className="table table-hover mb-0" style={{ width: '100%', fontSize: '0.9rem' }}>
              <thead style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                <tr>
                  <th style={{ padding: '0.75rem 1rem' }}>Product &amp; Batch</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Facility</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Days Left</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Stock Qty</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Original Price</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Suggested Disc.</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Markdown Price</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Floor Price</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="9" style={{ textAlign: 'center', padding: '3rem' }}>
                      <i className="fa-solid fa-spinner fa-spin fa-2x text-muted mb-2" /><br />
                      Loading markdown opportunities...
                    </td>
                  </tr>
                ) : suggestions.length === 0 ? (
                  <tr>
                    <td colSpan="9" style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
                      <i className="fa-solid fa-check-circle fa-2x text-success mb-2" /><br />
                      No near-expiry lots requiring markdowns at this time.
                    </td>
                  </tr>
                ) : (
                  suggestions.map((s, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ fontWeight: 600 }}>{s.product_name}</div>
                        <div className="text-muted" style={{ fontSize: '0.8rem', fontFamily: 'monospace' }}>
                          Batch #{s.batch_number} • Exp: {s.expiry_date}
                        </div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem' }}>{s.location_name}</td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                        <span className={`badge ${s.days_to_expiry <= 7 ? 'bg-danger' : s.days_to_expiry <= 15 ? 'bg-warning text-dark' : 'bg-info'}`}>
                          {s.days_to_expiry} days
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600 }}>{s.stock_quantity}</td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>₹{s.original_price.toFixed(2)}</td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                        <span className="badge bg-primary" style={{ fontSize: '0.85rem' }}>{s.suggested_discount_percent}% OFF</span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 700, color: '#16a34a', fontSize: '1rem' }}>
                        ₹{s.markdown_price.toFixed(2)}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontSize: '0.85rem' }}>
                        ₹{s.floor_price.toFixed(2)}
                        {s.is_below_floor && <span className="badge bg-danger ms-1">Below Floor</span>}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                        {canPropose && (
                          <button
                            className="btn btn-sm btn-primary"
                            onClick={() => openProposeModal(s)}
                          >
                            <i className="fa-solid fa-paper-plane me-1" /> Propose
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Active Promotions & Push Sale Tracking */}
      {activeTab === 'promotions' && (
        <div className="card" style={{ borderRadius: '10px', overflow: 'hidden', background: 'var(--card-bg, #fff)' }}>
          <div className="table-responsive">
            <table className="table table-hover mb-0" style={{ width: '100%', fontSize: '0.9rem' }}>
              <thead style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                <tr>
                  <th style={{ padding: '0.75rem 1rem' }}>Promo Code &amp; Item</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Batch #</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Facility</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Discount</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Promo Price</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Status</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Sell-Through</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Revenue</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {promotions.length === 0 ? (
                  <tr>
                    <td colSpan="9" style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
                      <i className="fa-solid fa-bullhorn fa-2x text-muted mb-2" /><br />
                      No markdown promotions currently registered.
                    </td>
                  </tr>
                ) : (
                  promotions.map((p) => {
                    const isPending = p.status === 'PROPOSED';
                    const isCreator = user?.username === p.created_by;
                    const canUserApprove = canApprove && isPending && !isCreator;

                    return (
                      <tr key={p.markdown_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <div style={{ fontWeight: 700, fontFamily: 'monospace', color: '#0f172a' }}>{p.promotion_code}</div>
                          <div className="text-muted" style={{ fontSize: '0.8rem' }}>{p.product_name} • By: {p.created_by}</div>
                        </td>
                        <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontWeight: 600 }}>{p.batch_number}</td>
                        <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem' }}>{p.location_name}</td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'center', fontWeight: 700, color: '#dc2626' }}>
                          {p.approved_discount_percent || p.suggested_discount_percent}% OFF
                        </td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 700, color: '#16a34a' }}>
                          ₹{p.markdown_price.toFixed(2)}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                          <StatusBadge status={p.status} />
                        </td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                          <div style={{ fontWeight: 700 }}>{p.sell_through_pct}%</div>
                          <div className="text-muted" style={{ fontSize: '0.75rem' }}>{p.units_sold} / {p.initial_units} units</div>
                        </td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600 }}>
                          ₹{(p.revenue_generated || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                          {isPending && canUserApprove && (
                            <button className="btn btn-sm btn-success" onClick={() => openApproveModal(p)}>
                              <i className="fa-solid fa-check me-1" /> Approve
                            </button>
                          )}
                          {isPending && isCreator && (
                            <span className="badge bg-secondary" title="Segregation of Duties: Cannot self-approve your proposal">
                              Self-Drafted
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
      )}

      {/* Propose Markdown Modal */}
      {showProposeModal && proposeTarget && (
        <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1050 }}>
          <div className="modal-dialog" style={{ background: '#fff', borderRadius: '12px', width: '480px', padding: '1.5rem', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' }}>
            <h4 style={{ margin: '0 0 1rem', fontWeight: 700 }}>Propose Markdown Promotion</h4>
            <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.85rem' }}>
              <div><strong>Product:</strong> {proposeTarget.product_name}</div>
              <div><strong>Batch:</strong> #{proposeTarget.batch_number} (Exp: {proposeTarget.expiry_date})</div>
              <div><strong>Original Price:</strong> ₹{proposeTarget.original_price} | <strong>Floor:</strong> ₹{proposeTarget.floor_price}</div>
            </div>

            <form onSubmit={handleProposeSubmit}>
              <div className="mb-3">
                <label className="form-label" style={{ fontWeight: 600 }}>Proposed Discount (%)</label>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input
                    type="number"
                    min="1"
                    max="90"
                    step="1"
                    className="form-control"
                    value={proposedDiscount}
                    onChange={(e) => setProposedDiscount(e.target.value)}
                    required
                  />
                  <span style={{ fontWeight: 600 }}>%</span>
                </div>
                <div className="text-muted" style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
                  Effective Price: <strong>₹{(proposeTarget.original_price * (1 - proposedDiscount / 100)).toFixed(2)}</strong>
                </div>
              </div>

              <div className="mb-3">
                <label className="form-label" style={{ fontWeight: 600 }}>Proposal Justification</label>
                <textarea
                  className="form-control"
                  rows="2"
                  value={proposeNotes}
                  onChange={(e) => setProposeNotes(e.target.value)}
                  placeholder="Reason for markdown promotion..."
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowProposeModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Submitting...' : 'Submit Proposal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Approve Markdown Modal */}
      {showApproveModal && approveTarget && (
        <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1050 }}>
          <div className="modal-dialog" style={{ background: '#fff', borderRadius: '12px', width: '480px', padding: '1.5rem', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' }}>
            <h4 style={{ margin: '0 0 1rem', fontWeight: 700 }}>Approve Markdown Promotion</h4>
            <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.85rem' }}>
              <div><strong>Promotion Code:</strong> {approveTarget.promotion_code}</div>
              <div><strong>Product:</strong> {approveTarget.product_name} • Batch #{approveTarget.batch_number}</div>
              <div><strong>Proposed by:</strong> {approveTarget.created_by}</div>
              <div><strong>Original Price:</strong> ₹{approveTarget.original_price} | <strong>Floor Price:</strong> ₹{approveTarget.floor_price}</div>
            </div>

            <form onSubmit={handleApproveSubmit}>
              <div className="mb-3">
                <label className="form-label" style={{ fontWeight: 600 }}>Authorized Discount (%)</label>
                <input
                  type="number"
                  min="1"
                  max="90"
                  step="1"
                  className="form-control"
                  value={approvedDiscount}
                  onChange={(e) => setApprovedDiscount(e.target.value)}
                  required
                />
                {user?.role === 'store_supervisor' && parseFloat(approvedDiscount) > 20 && (
                  <div className="text-danger" style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
                    <i className="fa-solid fa-circle-exclamation me-1" />
                    Store Supervisor maximum discount limit is 20%. Discounts above 20% require Category Manager authorization.
                  </div>
                )}
              </div>

              <div className="mb-3">
                <label className="form-label" style={{ fontWeight: 600 }}>Approval Notes</label>
                <textarea
                  className="form-control"
                  rows="2"
                  value={approveNotes}
                  onChange={(e) => setApproveNotes(e.target.value)}
                  placeholder="Authorization notes..."
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowApproveModal(false)}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-success"
                  disabled={submitting || (user?.role === 'store_supervisor' && parseFloat(approvedDiscount) > 20)}
                >
                  {submitting ? 'Authorizing...' : 'Authorize & Activate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}


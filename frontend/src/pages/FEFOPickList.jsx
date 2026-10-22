import React, { useState, useEffect } from 'react';
import { replenishmentAPI, batchAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/StatusBadge';

export default function FEFOPickList() {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);

  // Manual FEFO Override Modal State
  const [overrideItem, setOverrideItem] = useState(null);
  const [overrideBatchId, setOverrideBatchId] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [availableBatches, setAvailableBatches] = useState([]);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const res = await replenishmentAPI.getRequests();
      if (res?.success) {
        // Filter to orders needing picking/allocation at DC
        const dcOrders = (res.replenishments || []).filter(
          (o) => o.status === 'ALLOCATED' || o.status === 'PENDING_ALLOCATION' || o.status === 'REQUESTED'
        );
        setOrders(dcOrders);
        if (dcOrders.length > 0 && !selectedOrder) {
          loadOrderDetails(dcOrders[0].replenishment_id);
        } else if (selectedOrder) {
          loadOrderDetails(selectedOrder.replenishment_id);
        }
      }
    } catch (err) {
      setFeedback({ type: 'danger', message: err.message || 'Failed to load DC pick lists.' });
    } finally {
      setLoading(false);
    }
  };

  const loadOrderDetails = async (repId) => {
    try {
      const res = await replenishmentAPI.getRequestDetail(repId);
      if (res?.success) {
        setSelectedOrder(res.replenishment);
      }
    } catch (err) {
      setFeedback({ type: 'danger', message: err.message || 'Failed to load order items.' });
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const handleRunAllocation = async (repId) => {
    try {
      setActionLoading(true);
      const res = await replenishmentAPI.allocateRequest(repId);
      if (res?.success) {
        setFeedback({
          type: 'success',
          message: `Order #${repId} successfully allocated via FEFO! Ready to pick.`
        });
        await fetchOrders();
      } else {
        setFeedback({ type: 'danger', message: res?.message || 'FEFO allocation failed.' });
      }
    } catch (err) {
      setFeedback({ type: 'danger', message: err.message || 'Allocation failed.' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleDispatch = async (repId) => {
    try {
      setActionLoading(true);
      const res = await replenishmentAPI.dispatchTransfer(repId);
      if (res?.success) {
        setFeedback({
          type: 'success',
          message: `Pick list #${repId} verified & dispatched! Shipment is now IN TRANSIT to store.`
        });
        setSelectedOrder(null);
        await fetchOrders();
      } else {
        setFeedback({ type: 'danger', message: res?.message || 'Dispatch failed.' });
      }
    } catch (err) {
      setFeedback({ type: 'danger', message: err.message || 'Dispatch failed.' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenOverride = async (item) => {
    setOverrideItem(item);
    setOverrideReason('');
    setOverrideBatchId('');
    try {
      // Load other active batches for this product at Central DC (location_id=1)
      const res = await batchAPI.getBatchStock({ product_id: item.product_id, location_id: 1, status: 'ACTIVE' });
      if (res?.success) {
        setAvailableBatches(res.batches || []);
      }
    } catch {
      setAvailableBatches([]);
    }
  };

  const handleConfirmOverride = async (e) => {
    e.preventDefault();
    if (!overrideReason.trim()) {
      setFeedback({ type: 'danger', message: 'Mandatory reason required for FEFO override.' });
      return;
    }
    if (!overrideBatchId) {
      setFeedback({ type: 'danger', message: 'Please select a replacement batch.' });
      return;
    }

    try {
      setActionLoading(true);
      // Re-allocate with override
      const chosenBatch = availableBatches.find((b) => String(b.batch_id) === String(overrideBatchId));
      const res = await replenishmentAPI.allocateRequest(selectedOrder.replenishment_id, {
        overrides: [
          {
            item_id: overrideItem.item_id,
            product_id: overrideItem.product_id,
            override_batch_id: parseInt(overrideBatchId, 10),
            override_batch_number: chosenBatch?.batch_number,
            reason: overrideReason.trim()
          }
        ]
      });

      if (res?.success) {
        setFeedback({
          type: 'warning',
          message: `Manual FEFO override recorded for Batch ${chosenBatch?.batch_number}. Action logged in audit trail.`
        });
        setOverrideItem(null);
        await loadOrderDetails(selectedOrder.replenishment_id);
      } else {
        setFeedback({ type: 'danger', message: res?.message || 'Override failed.' });
      }
    } catch (err) {
      setFeedback({ type: 'danger', message: err.message || 'Override failed.' });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="fefo-picking-container container" style={{ padding: '1.5rem 1rem' }}>
      {/* Header */}
      <div className="page-header mb-4 flex-between">
        <div>
          <h2>
            <i className="fa-solid fa-dolly" style={{ marginRight: 8, color: 'var(--accent)' }} />
            Central DC — System-Enforced FEFO Pick List
          </h2>
          <p className="subtitle">
            Warehouse picker interface: orders are sequenced strictly by First Expired, First Out. Excludes expired or blocked lots and tracks manual overrides.
          </p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={fetchOrders}
            disabled={loading}
          >
            <i className={`fa-solid fa-arrows-rotate ${loading ? 'fa-spin' : ''}`} /> Refresh Lists
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

      {/* Main 2-Column Picking Workstation */}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '1.25rem', alignItems: 'start' }}>
        {/* Left Column: Orders Queue */}
        <div className="card">
          <div className="card-header flex-between" style={{ background: 'var(--surface-header)' }}>
            <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>
              <i className="fa-solid fa-list-ol" style={{ marginRight: 6 }} /> Picking Queue ({orders.length})
            </span>
            <span className="badge badge-info">{orders.length} Pending</span>
          </div>
          <div className="card-body p-0" style={{ maxHeight: '600px', overflowY: 'auto' }}>
            {orders.length === 0 ? (
              <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                <i className="fa-solid fa-box-open" style={{ fontSize: '2rem', marginBottom: 8, display: 'block', opacity: 0.5 }} />
                No replenishment orders pending at Central DC.
              </div>
            ) : (
              orders.map((o) => {
                const isSelected = selectedOrder?.replenishment_id === o.replenishment_id;
                return (
                  <div
                    key={o.replenishment_id}
                    onClick={() => loadOrderDetails(o.replenishment_id)}
                    style={{
                      padding: '0.85rem 1rem',
                      borderBottom: '1px solid var(--border)',
                      cursor: 'pointer',
                      background: isSelected ? 'rgba(59, 130, 246, 0.08)' : 'transparent',
                      borderLeft: isSelected ? '4px solid var(--accent)' : '4px solid transparent',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div className="flex-between mb-1">
                      <strong style={{ fontSize: '0.9rem' }}>{o.request_number}</strong>
                      <StatusBadge status={o.status} size="sm" />
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      Destination: <span style={{ fontWeight: 600 }}>{o.to_location}</span>
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>
                      {o.total_requested} units ({o.total_items} lines) &bull; {o.requested_by}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: FEFO Pick Sheet */}
        {selectedOrder ? (
          <div className="card" style={{ borderTop: '4px solid var(--accent)' }}>
            <div className="card-header flex-between">
              <div>
                <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>Pick Sheet: {selectedOrder.request_number}</span>
                  <StatusBadge status={selectedOrder.status} />
                </h4>
                <small style={{ color: 'var(--text-muted)' }}>
                  From: Central DC Mumbai &rarr; Destination: {selectedOrder.to_location}
                </small>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                {(selectedOrder.status === 'PENDING_ALLOCATION' || selectedOrder.status === 'REQUESTED') && (
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    onClick={() => handleRunAllocation(selectedOrder.replenishment_id)}
                    disabled={actionLoading}
                  >
                    <i className="fa-solid fa-wand-magic-sparkles" /> Run FEFO Allocation
                  </button>
                )}

                {selectedOrder.status === 'ALLOCATED' && (
                  <button
                    type="button"
                    className="btn btn-sm btn-success"
                    onClick={() => handleDispatch(selectedOrder.replenishment_id)}
                    disabled={actionLoading}
                  >
                    <i className="fa-solid fa-truck-fast" /> Complete Pick &amp; Dispatch
                  </button>
                )}
              </div>
            </div>

            <div className="card-body p-0">
              <div className="table-responsive">
                <table className="data-table" style={{ fontSize: '0.85rem' }}>
                  <thead>
                    <tr>
                      <th>Pick Seq</th>
                      <th>Product</th>
                      <th>Mandatory FEFO Batch</th>
                      <th>Expiry Horizon</th>
                      <th>Pick Qty</th>
                      <th>Rack Location</th>
                      <th>Override / Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedOrder.items?.map((it, idx) => (
                      <tr key={it.item_id}>
                        <td>
                          <span
                            style={{
                              width: 24,
                              height: 24,
                              borderRadius: '50%',
                              background: 'var(--surface-header)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 700,
                              fontSize: '0.78rem'
                            }}
                          >
                            {idx + 1}
                          </span>
                        </td>
                        <td>
                          <strong>{it.product_name}</strong>
                          <br />
                          <small style={{ color: 'var(--text-muted)' }}>ID #{it.product_id}</small>
                        </td>
                        <td>
                          {it.allocated_batch_number ? (
                            <code style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--accent)' }}>
                              {it.allocated_batch_number}
                            </code>
                          ) : (
                            <span className="badge badge-secondary">Pending Allocation</span>
                          )}
                        </td>
                        <td>
                          {it.expiry_date ? (
                            <span className="badge badge-success">
                              <i className="fa-solid fa-calendar-check" style={{ marginRight: 4 }} />
                              {it.expiry_date}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>
                          <strong style={{ fontSize: '1rem' }}>{it.allocated_qty || it.requested_qty}</strong> units
                        </td>
                        <td>
                          <span className="badge badge-secondary">
                            Bay A-0{((it.product_id % 5) + 1)} / Rack {((it.product_id % 3) + 1)}
                          </span>
                        </td>
                        <td>
                          {selectedOrder.status === 'ALLOCATED' && (
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-warning"
                              style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
                              onClick={() => handleOpenOverride(it)}
                              title="Audit-logged FEFO override"
                            >
                              <i className="fa-solid fa-shuffle" style={{ marginRight: 4 }} /> Override
                            </button>
                          )}
                          {it.is_override && (
                            <span className="badge badge-warning" style={{ display: 'block', marginTop: 4 }}>
                              Overridden: {it.override_reason}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card-footer flex-between" style={{ borderTop: '1px solid var(--border)', padding: '0.9rem 1.25rem' }}>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                <i className="fa-solid fa-shield-halved" style={{ marginRight: 6, color: 'var(--accent)' }} />
                FEFO strict enforcement: items allocated by earliest expiry. Overrides require justification and are permanently audit-logged.
              </span>

              {selectedOrder.status === 'ALLOCATED' && (
                <button
                  type="button"
                  className="btn btn-success"
                  onClick={() => handleDispatch(selectedOrder.replenishment_id)}
                  disabled={actionLoading}
                >
                  <i className="fa-solid fa-check-double" style={{ marginRight: 6 }} /> Fulfill &amp; Dispatch to Store
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            Select an order from the queue to view its FEFO pick list.
          </div>
        )}
      </div>

      {/* Manual FEFO Override Modal */}
      {overrideItem && (
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
                <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: 8, color: '#f59e0b' }} />
                Manual FEFO Pick Override
              </h4>
              <button
                type="button"
                className="btn-close"
                onClick={() => setOverrideItem(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer' }}
              >
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
            <form onSubmit={handleConfirmOverride}>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', padding: '0.75rem', borderRadius: 8, fontSize: '0.82rem', color: '#92400e' }}>
                  <strong>Governance Warning:</strong> Overriding the system-recommended FEFO batch bypasses first-expired dispatch rules. A permanent record will be written to the system audit log.
                </div>

                <div>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Product</label>
                  <input
                    type="text"
                    className="form-control"
                    value={overrideItem.product_name}
                    disabled
                    style={{ background: 'var(--surface-header)' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>System-Allocated FEFO Batch</label>
                  <input
                    type="text"
                    className="form-control"
                    value={`${overrideItem.allocated_batch_number || 'N/A'} (Expiry: ${overrideItem.expiry_date || 'N/A'})`}
                    disabled
                    style={{ background: 'var(--surface-header)' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Replacement Batch at Central DC *</label>
                  <select
                    className="form-control"
                    value={overrideBatchId}
                    onChange={(e) => setOverrideBatchId(e.target.value)}
                    required
                  >
                    <option value="">Select replacement batch...</option>
                    {availableBatches.map((b) => (
                      <option key={b.batch_id} value={b.batch_id}>
                        {b.batch_number} (Exp: {b.expiry_date}, Saleable: {b.quantity_saleable})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Mandatory Justification Reason *</label>
                  <textarea
                    className="form-control"
                    rows="3"
                    placeholder="e.g. Pallet physically inaccessible due to forklift repair; carton exterior crushed during transit."
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="card-footer flex-between" style={{ borderTop: '1px solid var(--border)', padding: '0.85rem 1.25rem' }}>
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={() => setOverrideItem(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-warning" disabled={actionLoading}>
                  {actionLoading ? 'Recording Override...' : 'Confirm FEFO Override'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

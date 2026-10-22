import React, { useState, useEffect } from 'react';
import { replenishmentAPI, productsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/StatusBadge';

export default function ReplenishmentRequests() {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeDetail, setActiveDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // New Request Form State
  const targetStoreId = user?.store_id || 2; // Default to STORE-101
  const [formItems, setFormItems] = useState([{ product_id: '', requested_qty: 20 }]);

  const fetchRequests = async () => {
    try {
      setLoading(true);
      const [reqRes, prodRes] = await Promise.all([
        replenishmentAPI.getRequests(),
        productsAPI.getProducts()
      ]);
      if (reqRes?.success) {
        setRequests(reqRes.replenishments || []);
      }
      if (prodRes?.success) {
        setProducts(prodRes.products || []);
      }
    } catch (err) {
      setFeedback({ type: 'danger', message: err.message || 'Failed to load replenishment requests.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const handleAddFormItem = () => {
    setFormItems([...formItems, { product_id: '', requested_qty: 20 }]);
  };

  const handleRemoveFormItem = (idx) => {
    if (formItems.length <= 1) return;
    setFormItems(formItems.filter((_, i) => i !== idx));
  };

  const handleItemChange = (idx, field, val) => {
    const next = [...formItems];
    next[idx][field] = val;
    setFormItems(next);
  };

  const handleCreateRequest = async (e) => {
    e.preventDefault();
    for (let i = 0; i < formItems.length; i++) {
      const it = formItems[i];
      if (!it.product_id) {
        setFeedback({ type: 'danger', message: `Item #${i + 1}: Please select a product.` });
        return;
      }
      if (parseInt(it.requested_qty, 10) <= 0) {
        setFeedback({ type: 'danger', message: `Item #${i + 1}: Quantity must be greater than 0.` });
        return;
      }
    }

    try {
      setActionLoading(true);
      const payload = {
        from_location_id: 1, // Central DC Mumbai
        to_location_id: targetStoreId,
        requested_by: user?.username || 'supervisor',
        items: formItems.map((it) => ({
          product_id: parseInt(it.product_id, 10),
          requested_qty: parseInt(it.requested_qty, 10)
        }))
      };

      const res = await replenishmentAPI.createRequest(payload);
      if (res?.success) {
        setFeedback({
          type: 'success',
          message: `Replenishment Request ${res.replenishment?.request_number || ''} submitted successfully!`
        });
        setIsModalOpen(false);
        setFormItems([{ product_id: '', requested_qty: 20 }]);
        await fetchRequests();
      } else {
        setFeedback({ type: 'danger', message: res?.message || 'Failed to create request.' });
      }
    } catch (err) {
      setFeedback({ type: 'danger', message: err.message || 'Request creation failed.' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleAllocateFEFO = async (repId) => {
    try {
      setActionLoading(true);
      const res = await replenishmentAPI.allocateRequest(repId);
      if (res?.success) {
        setFeedback({
          type: 'success',
          message: `Request #${repId} successfully allocated via FEFO! Reserved at DC for picking.`
        });
        await fetchRequests();
      } else {
        setFeedback({ type: 'danger', message: res?.message || 'FEFO allocation failed.' });
      }
    } catch (err) {
      setFeedback({ type: 'danger', message: err.message || 'Allocation failed.' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleReceiveShipment = async (repId) => {
    try {
      setActionLoading(true);
      const res = await replenishmentAPI.receiveAtStore(repId);
      if (res?.success) {
        setFeedback({
          type: 'success',
          message: `Transfer #${repId} acknowledged and received at store! Saleable batch stock updated.`
        });
        await fetchRequests();
        if (activeDetail && activeDetail.replenishment_id === repId) {
          viewDetail(repId);
        }
      } else {
        setFeedback({ type: 'danger', message: res?.message || 'Receiving shipment failed.' });
      }
    } catch (err) {
      setFeedback({ type: 'danger', message: err.message || 'Receive failed.' });
    } finally {
      setActionLoading(false);
    }
  };

  const viewDetail = async (repId) => {
    try {
      setDetailLoading(true);
      const res = await replenishmentAPI.getRequestDetail(repId);
      if (res?.success) {
        setActiveDetail(res.replenishment);
      }
    } catch (err) {
      setFeedback({ type: 'danger', message: err.message || 'Failed to load details.' });
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className="replenishment-container container" style={{ padding: '1.5rem 1rem' }}>
      {/* Header */}
      <div className="page-header mb-4 flex-between">
        <div>
          <h2>
            <i className="fa-solid fa-boxes-packing" style={{ marginRight: 8, color: 'var(--accent)' }} />
            Store Stock Replenishment &amp; Transfer Orders
          </h2>
          <p className="subtitle">
            DMart-style store replenishment: raise stock indents to Central DC, execute automated FEFO batch allocation, and inward dispatched shipments.
          </p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={fetchRequests}
            disabled={loading}
          >
            <i className={`fa-solid fa-arrows-rotate ${loading ? 'fa-spin' : ''}`} /> Refresh
          </button>
          {['store_supervisor', 'admin'].includes(user?.role) && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setIsModalOpen(true)}
            >
              <i className="fa-solid fa-cart-flatbed" /> Raise Indent Request
            </button>
          )}
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

      {/* Replenishments List Table */}
      <div className="card">
        <div className="card-header flex-between">
          <h4>
            <i className="fa-solid fa-list-check" style={{ marginRight: 8 }} />
            Replenishment Orders ({requests.length})
          </h4>
          <span className="badge badge-info">{requests.length} Orders</span>
        </div>
        <div className="card-body p-0">
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Request ID</th>
                  <th>Supply Facility</th>
                  <th>Destination Store</th>
                  <th>Requested Units</th>
                  <th>Status</th>
                  <th>Requested By</th>
                  <th>Order Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '2rem' }}>
                      <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 8 }} /> Loading replenishment requests...
                    </td>
                  </tr>
                ) : requests.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '2rem' }}>
                      No replenishment requests found.
                    </td>
                  </tr>
                ) : (
                  requests.map((r) => (
                    <tr key={r.replenishment_id}>
                      <td>
                        <strong style={{ color: 'var(--accent)' }}>{r.request_number}</strong>
                      </td>
                      <td>
                        <span className="badge badge-secondary">{r.from_location}</span>
                      </td>
                      <td>
                        <span className="badge badge-primary">{r.to_location}</span>
                      </td>
                      <td>
                        <strong>{r.total_requested}</strong> units ({r.total_items} items)
                      </td>
                      <td>
                        <StatusBadge status={r.status} />
                      </td>
                      <td>
                        <span style={{ fontSize: '0.85rem' }}>{r.requested_by}</span>
                      </td>
                      <td style={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                        {r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-secondary"
                            onClick={() => viewDetail(r.replenishment_id)}
                            title="View allocation details & items"
                          >
                            <i className="fa-solid fa-eye" /> View
                          </button>

                          {(r.status === 'PENDING_ALLOCATION' || r.status === 'REQUESTED') && (user?.role === 'admin' || user?.role === 'warehouse_picker') && (
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-primary"
                              onClick={() => handleAllocateFEFO(r.replenishment_id)}
                              disabled={actionLoading}
                              title="Run FEFO Allocation Engine"
                            >
                              <i className="fa-solid fa-wand-magic-sparkles" /> Allocate
                            </button>
                          )}

                          {(r.status === 'IN_TRANSIT' || r.status === 'DISPATCHED') && (user?.role === 'admin' || user?.role === 'store_supervisor') && (
                            <button
                              type="button"
                              className="btn btn-sm btn-success"
                              onClick={() => handleReceiveShipment(r.replenishment_id)}
                              disabled={actionLoading}
                              title="Receive Goods at Store"
                            >
                              <i className="fa-solid fa-box-open" /> Receive
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
      </div>

      {/* Create Replenishment Modal */}
      {isModalOpen && (
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
            style={{ maxWidth: '640px', width: '100%', borderRadius: 12, overflow: 'hidden' }}
          >
            <div className="card-header flex-between" style={{ background: 'var(--surface-header)' }}>
              <h4 style={{ margin: 0 }}>
                <i className="fa-solid fa-cart-flatbed" style={{ marginRight: 8, color: 'var(--accent)' }} />
                Raise Store Replenishment Indent
              </h4>
              <button
                type="button"
                className="btn-close"
                onClick={() => setIsModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer' }}
              >
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
            <form onSubmit={handleCreateRequest}>
              <div className="card-body">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Supply Facility</label>
                    <input
                      type="text"
                      className="form-control"
                      value="Central DC Mumbai (DC-01)"
                      disabled
                      style={{ background: 'var(--surface-header)', opacity: 0.85 }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Destination Store</label>
                    <input
                      type="text"
                      className="form-control"
                      value={`Store Thane (STORE-101) [Loc #${targetStoreId}]`}
                      disabled
                      style={{ background: 'var(--surface-header)', opacity: 0.85 }}
                    />
                  </div>
                </div>

                <div className="flex-between mb-2">
                  <span style={{ fontSize: '0.9rem', fontWeight: 700 }}>Requested Line Items</span>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-primary"
                    onClick={handleAddFormItem}
                  >
                    <i className="fa-solid fa-plus" /> Add Item
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  {formItems.map((it, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                      <select
                        className="form-control"
                        style={{ flex: 1 }}
                        value={it.product_id}
                        onChange={(e) => handleItemChange(idx, 'product_id', e.target.value)}
                        required
                      >
                        <option value="">Select Product...</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            #{p.id} - {p.name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min="1"
                        className="form-control"
                        style={{ width: '120px' }}
                        value={it.requested_qty}
                        onChange={(e) => handleItemChange(idx, 'requested_qty', e.target.value)}
                        placeholder="Qty"
                        required
                      />
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-danger"
                        onClick={() => handleRemoveFormItem(idx)}
                        disabled={formItems.length <= 1}
                      >
                        <i className="fa-solid fa-trash" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="card-footer flex-between" style={{ borderTop: '1px solid var(--border)', padding: '0.9rem 1.25rem' }}>
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={() => setIsModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={actionLoading}>
                  {actionLoading ? 'Submitting...' : 'Submit Indent Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Details Drawer / Modal */}
      {activeDetail && (
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
            style={{ maxWidth: '800px', width: '100%', borderRadius: 12, overflow: 'hidden' }}
          >
            <div className="card-header flex-between" style={{ background: 'var(--surface-header)' }}>
              <div>
                <h4 style={{ margin: 0 }}>
                  <i className="fa-solid fa-receipt" style={{ marginRight: 8, color: 'var(--accent)' }} />
                  Order {activeDetail.request_number}
                </h4>
                <small style={{ color: 'var(--text-muted)' }}>
                  From: {activeDetail.from_location} &rarr; To: {activeDetail.to_location}
                </small>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <StatusBadge status={activeDetail.status} />
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setActiveDetail(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  <i className="fa-solid fa-xmark" />
                </button>
              </div>
            </div>
            <div className="card-body p-0">
              <div className="table-responsive">
                <table className="data-table" style={{ fontSize: '0.85rem' }}>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Requested</th>
                      <th>Allocated Batch</th>
                      <th>Batch Expiry</th>
                      <th>Allocated Qty</th>
                      <th>FEFO Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeDetail.items?.map((it) => (
                      <tr key={it.item_id}>
                        <td>{it.product_name}</td>
                        <td>{it.requested_qty}</td>
                        <td>
                          {it.allocated_batch_number ? (
                            <code>{it.allocated_batch_number}</code>
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>Pending FEFO</span>
                          )}
                        </td>
                        <td>{it.expiry_date || '—'}</td>
                        <td>
                          <strong>{it.allocated_qty || 0}</strong>
                        </td>
                        <td>
                          {it.is_override ? (
                            <span className="badge badge-warning">
                              <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: 4 }} />
                              Overridden: {it.override_reason}
                            </span>
                          ) : it.allocated_batch_id ? (
                            <span className="badge badge-success">
                              <i className="fa-solid fa-check" style={{ marginRight: 4 }} /> FEFO Picked
                            </span>
                          ) : (
                            <span className="badge badge-secondary">Unallocated</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="card-footer flex-between" style={{ borderTop: '1px solid var(--border)', padding: '0.85rem 1.25rem' }}>
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => setActiveDetail(null)}
              >
                Close
              </button>
              {(activeDetail.status === 'DISPATCHED' || activeDetail.status === 'IN_TRANSIT') && (user?.role === 'admin' || user?.role === 'store_supervisor') && (
                <button
                  type="button"
                  className="btn btn-success"
                  onClick={() => handleReceiveShipment(activeDetail.replenishment_id)}
                  disabled={actionLoading}
                >
                  <i className="fa-solid fa-box-open" style={{ marginRight: 6 }} /> Confirm Inward at Store
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

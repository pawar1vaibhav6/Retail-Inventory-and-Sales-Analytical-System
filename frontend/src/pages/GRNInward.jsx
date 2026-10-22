import React, { useState, useEffect } from 'react';
import { batchAPI, adminAPI, productsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/StatusBadge';

export default function GRNInward() {
  const { user } = useAuth();
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [grnList, setGrnList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null);

  // Form State
  const [supplierId, setSupplierId] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [remarks, setRemarks] = useState('');
  const [items, setItems] = useState([
    {
      product_id: '',
      batch_number: '',
      mfg_date: new Date().toISOString().split('T')[0],
      expiry_date: '',
      received_qty: 50,
      unit_cost: 0
    }
  ]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [supRes, prodRes, grnRes] = await Promise.all([
        adminAPI.getSupplierTerms(),
        productsAPI.getProducts(),
        batchAPI.getGRNReceipts()
      ]);

      if (supRes?.success) {
        setSuppliers(supRes.suppliers || []);
        if (supRes.suppliers?.length > 0 && !supplierId) {
          setSupplierId(String(supRes.suppliers[0].supplier_id));
        }
      }
      if (prodRes?.success) {
        setProducts(prodRes.products || []);
      }
      if (grnRes?.success) {
        setGrnList(grnRes.grns || []);
      }
    } catch (err) {
      setFeedback({ type: 'danger', message: err.message || 'Failed to load GRN master data.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAddItem = () => {
    setItems([
      ...items,
      {
        product_id: '',
        batch_number: '',
        mfg_date: new Date().toISOString().split('T')[0],
        expiry_date: '',
        received_qty: 50,
        unit_cost: 0
      }
    ]);
  };

  const handleRemoveItem = (index) => {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== index));
  };

  const handleItemChange = (index, field, val) => {
    const next = [...items];
    next[index][field] = val;

    // Auto-fill cost if product is selected
    if (field === 'product_id') {
      const p = products.find((prod) => String(prod.id) === String(val));
      if (p) {
        next[index].unit_cost = p.cost || 0;
      }
    }
    setItems(next);
  };

  const handleSubmitGRN = async (e) => {
    e.preventDefault();
    setFeedback(null);

    if (!supplierId) {
      setFeedback({ type: 'danger', message: 'Please select a supplier.' });
      return;
    }

    const todayStr = new Date().toISOString().split('T')[0];

    // Validate line items
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.product_id) {
        setFeedback({ type: 'danger', message: `Row #${i + 1}: Please select a product.` });
        return;
      }
      if (!it.batch_number.trim()) {
        setFeedback({ type: 'danger', message: `Row #${i + 1}: Batch number is mandatory.` });
        return;
      }
      if (!it.mfg_date || !it.expiry_date) {
        setFeedback({ type: 'danger', message: `Row #${i + 1}: Manufacturing and expiry dates are required.` });
        return;
      }
      if (it.expiry_date <= it.mfg_date) {
        setFeedback({ type: 'danger', message: `Row #${i + 1}: Expiry date must be strictly after manufacturing date.` });
        return;
      }
      if (it.expiry_date < todayStr) {
        setFeedback({ type: 'danger', message: `Row #${i + 1}: Cannot accept expired stock (Expiry: ${it.expiry_date}).` });
        return;
      }
      if (parseInt(it.received_qty, 10) <= 0) {
        setFeedback({ type: 'danger', message: `Row #${i + 1}: Quantity must be greater than 0.` });
        return;
      }
    }

    try {
      setSubmitting(true);
      const payload = {
        location_id: 1, // Central DC Mumbai
        supplier_id: parseInt(supplierId, 10),
        received_by: user?.username || 'picker',
        invoice_no: invoiceNo.trim() || undefined,
        remarks: remarks.trim() || undefined,
        items: items.map((it) => ({
          product_id: parseInt(it.product_id, 10),
          batch_number: it.batch_number.trim(),
          mfg_date: it.mfg_date,
          expiry_date: it.expiry_date,
          received_qty: parseInt(it.received_qty, 10),
          unit_cost: parseFloat(it.unit_cost) || 0
        }))
      };

      const res = await batchAPI.recordGRN(payload);
      if (res?.success) {
        setFeedback({
          type: 'success',
          message: `Goods Received Note ${res.grn?.grn_number || ''} recorded successfully! Stock added to Central DC ledger.`
        });
        setInvoiceNo('');
        setRemarks('');
        setItems([
          {
            product_id: '',
            batch_number: '',
            mfg_date: todayStr,
            expiry_date: '',
            received_qty: 50,
            unit_cost: 0
          }
        ]);
        await loadData();
      } else {
        setFeedback({ type: 'danger', message: res?.message || 'GRN submission failed.' });
      }
    } catch (err) {
      setFeedback({ type: 'danger', message: err.message || 'Failed to submit GRN.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grn-container container" style={{ padding: '1.5rem 1rem' }}>
      {/* Header */}
      <div className="page-header mb-4 flex-between">
        <div>
          <h2>
            <i className="fa-solid fa-truck-ramp-box" style={{ marginRight: 8, color: 'var(--accent)' }} />
            Central DC Inwarding — Goods Received Note (GRN)
          </h2>
          <p className="subtitle">
            DMart-style Central DC receipt: captures supplier batch, manufacturing date, and expiry date. Validates shelf-life and populates FEFO stock ledger.
          </p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={loadData}
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

      {/* New GRN Form Card */}
      <div className="card mb-4" style={{ borderTop: '4px solid var(--accent)' }}>
        <div className="card-header flex-between">
          <h4>
            <i className="fa-solid fa-file-invoice" style={{ marginRight: 8 }} />
            Record Inward GRN Receipt (Location: Central DC Mumbai)
          </h4>
          <span className="badge badge-primary">
            <i className="fa-solid fa-warehouse" style={{ marginRight: 4 }} /> DC-01 Bhiwandi Logistics
          </span>
        </div>
        <form onSubmit={handleSubmitGRN}>
          <div className="card-body">
            {/* Header Form Row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Supplier *</label>
                <select
                  className="form-control"
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  required
                >
                  <option value="">Select Supplier...</option>
                  {suppliers.map((s) => (
                    <option key={s.supplier_id} value={s.supplier_id}>
                      {s.supplier_name} (GSTIN: {s.gstin || 'N/A'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Supplier Invoice / DC Challan No.</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. INV-AMUL-2026-908"
                  value={invoiceNo}
                  onChange={(e) => setInvoiceNo(e.target.value)}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Receiving Officer</label>
                <input
                  type="text"
                  className="form-control"
                  value={`${user?.username || 'picker'} (${user?.role || 'warehouse_picker'})`}
                  disabled
                  style={{ background: 'var(--surface-header)', opacity: 0.85 }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Receipt Remarks</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. Temperature checked & ok"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                />
              </div>
            </div>

            {/* Line Items Table */}
            <div style={{ marginBottom: '1rem' }}>
              <div className="flex-between mb-2">
                <span style={{ fontWeight: 700, fontSize: '0.92rem' }}>
                  <i className="fa-solid fa-boxes-stacked" style={{ marginRight: 6 }} />
                  Line Items &amp; Batch Attributes ({items.length})
                </span>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-primary"
                  onClick={handleAddItem}
                >
                  <i className="fa-solid fa-plus" /> Add Item Row
                </button>
              </div>

              <div className="table-responsive">
                <table className="data-table" style={{ fontSize: '0.85rem' }}>
                  <thead>
                    <tr>
                      <th style={{ minWidth: '220px' }}>Product *</th>
                      <th style={{ minWidth: '130px' }}>Batch / Lot No. *</th>
                      <th style={{ minWidth: '135px' }}>Mfg Date *</th>
                      <th style={{ minWidth: '135px' }}>Expiry Date *</th>
                      <th style={{ minWidth: '100px' }}>Inward Qty *</th>
                      <th style={{ minWidth: '110px' }}>Unit Cost (₹)</th>
                      <th style={{ width: '50px' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it, idx) => (
                      <tr key={idx}>
                        <td>
                          <select
                            className="form-control"
                            style={{ fontSize: '0.82rem', padding: '0.35rem 0.6rem' }}
                            value={it.product_id}
                            onChange={(e) => handleItemChange(idx, 'product_id', e.target.value)}
                            required
                          >
                            <option value="">Select Item...</option>
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>
                                #{p.id} - {p.name} ({p.unit || 'pcs'})
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input
                            type="text"
                            className="form-control"
                            style={{ fontSize: '0.82rem', padding: '0.35rem 0.6rem' }}
                            placeholder="e.g. BATCH-2026-A"
                            value={it.batch_number}
                            onChange={(e) => handleItemChange(idx, 'batch_number', e.target.value)}
                            required
                          />
                        </td>
                        <td>
                          <input
                            type="date"
                            className="form-control"
                            style={{ fontSize: '0.82rem', padding: '0.35rem 0.6rem' }}
                            value={it.mfg_date}
                            onChange={(e) => handleItemChange(idx, 'mfg_date', e.target.value)}
                            required
                          />
                        </td>
                        <td>
                          <input
                            type="date"
                            className="form-control"
                            style={{ fontSize: '0.82rem', padding: '0.35rem 0.6rem' }}
                            value={it.expiry_date}
                            onChange={(e) => handleItemChange(idx, 'expiry_date', e.target.value)}
                            required
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min="1"
                            className="form-control"
                            style={{ fontSize: '0.82rem', padding: '0.35rem 0.6rem' }}
                            value={it.received_qty}
                            onChange={(e) => handleItemChange(idx, 'received_qty', e.target.value)}
                            required
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className="form-control"
                            style={{ fontSize: '0.82rem', padding: '0.35rem 0.6rem' }}
                            value={it.unit_cost}
                            onChange={(e) => handleItemChange(idx, 'unit_cost', e.target.value)}
                            required
                          />
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-danger"
                            onClick={() => handleRemoveItem(idx)}
                            disabled={items.length <= 1}
                            title="Remove row"
                          >
                            <i className="fa-solid fa-trash" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="card-footer flex-between" style={{ borderTop: '1px solid var(--border)', padding: '0.9rem 1.25rem' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              <i className="fa-solid fa-shield-check" style={{ marginRight: 6 }} />
              Atomically updates batches, DC stock ledger, product quantity, and logs stock movements.
            </span>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? (
                <>
                  <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 6 }} /> Processing Inwarding...
                </>
              ) : (
                <>
                  <i className="fa-solid fa-check" style={{ marginRight: 6 }} /> Confirm &amp; Post GRN
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Historical GRN Receipts Table */}
      <div className="card">
        <div className="card-header flex-between">
          <h4>
            <i className="fa-solid fa-clock-rotate-left" style={{ marginRight: 8 }} />
            Historical Goods Received Notes ({grnList.length})
          </h4>
          <span className="badge badge-info">{grnList.length} Receipts</span>
        </div>
        <div className="card-body p-0">
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>GRN Number</th>
                  <th>Receipt Date</th>
                  <th>Receiving Location</th>
                  <th>Supplier</th>
                  <th>Invoice / Challan</th>
                  <th>Total Units</th>
                  <th>Status</th>
                  <th>Received By</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '2rem' }}>
                      <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 8 }} /> Loading GRN history...
                    </td>
                  </tr>
                ) : grnList.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '2rem' }}>
                      No inward GRN receipts recorded yet.
                    </td>
                  </tr>
                ) : (
                  grnList.map((g) => (
                    <tr key={g.grn_id}>
                      <td>
                        <strong style={{ color: 'var(--accent)' }}>{g.grn_number}</strong>
                      </td>
                      <td style={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                        {g.receipt_date ? new Date(g.receipt_date).toLocaleString() : '—'}
                      </td>
                      <td>
                        <span className="badge badge-secondary">{g.location}</span>
                      </td>
                      <td style={{ fontWeight: 600 }}>{g.supplier}</td>
                      <td>
                        <code style={{ fontSize: '0.82rem' }}>{g.invoice_no || '—'}</code>
                      </td>
                      <td>
                        <strong>{g.total_quantity}</strong> units ({g.total_items} items)
                      </td>
                      <td>
                        <StatusBadge status={g.status || 'COMPLETED'} />
                      </td>
                      <td>
                        <i className="fa-solid fa-user-check" style={{ marginRight: 4, color: 'var(--text-muted)' }} />
                        {g.received_by}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}


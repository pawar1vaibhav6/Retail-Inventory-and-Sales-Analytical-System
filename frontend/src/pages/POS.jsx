import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useStore, getGstRate } from '../context/StoreContext';
import CustomerModal from '../components/CustomerModal';
import InvoiceModal from '../components/InvoiceModal';
import SearchSelect from '../components/SearchSelect';

/* Small coloured stock pill used inside the product dropdown */
function StockPill({ stock, unit }) {
  const out = stock <= 0;
  const low = stock > 0 && stock < 5;
  const color = out ? '#dc2626' : low ? '#d97706' : '#059669';
  const bg = out ? 'rgba(220,38,38,0.12)' : low ? 'rgba(217,119,6,0.14)' : 'rgba(5,150,105,0.12)';
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        color,
        background: bg,
        whiteSpace: 'nowrap',
      }}
    >
      {out ? 'Out of stock' : `${stock} ${unit}`}
    </span>
  );
}

export default function POS() {
  const { products, customers, addCustomer, recordSale } = useStore();

  const [selectedCustomerId, setSelectedCustomerId] = useState(customers.length ? String(customers[0].id) : '');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [cart, setCart] = useState([]);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [completedOrder, setCompletedOrder] = useState(null);
  const [feedback, setFeedback] = useState(null);

  const selectedCustomer = customers.find((c) => String(c.id) === String(selectedCustomerId));
  const selectedProduct = products.find((p) => String(p.id) === String(selectedProductId));

  /* ---------- Dropdown options (searchable) ---------- */
  const customerOptions = useMemo(
    () =>
      customers.map((c) => ({
        value: String(c.id),
        label: `#${c.id} - ${c.name}`,
        sublabel: `${c.region} • ${c.email}`,
        searchText: `${c.id} ${c.name} ${c.region} ${c.email}`,
      })),
    [customers]
  );

  const productOptions = useMemo(
    () =>
      products.map((p) => {
        const disc = Number(p.discount || 0);
        const origPrice = Number(p.price || 0);
        const discAmt = Math.round(origPrice * (disc / 100) * 100) / 100;
        const finalPrice = Math.round((origPrice - discAmt) * 100) / 100;

        return {
          value: String(p.id),
          label: p.name,
          sublabel: `#${p.id} • ${p.category} | ${p.subcategory}${disc > 0 ? ` • ${disc}% off` : ''}`,
          searchText: `${p.id} ${p.name} ${p.category} ${p.subcategory}`,
          disabled: p.stock <= 0,
          right: (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>
                {disc > 0 ? (
                  <>
                    <span style={{ textDecoration: 'line-through', fontSize: 11, color: 'var(--text-muted)', marginRight: 4 }}>
                      ₹{origPrice}
                    </span>
                    ₹{finalPrice}/{p.unit}
                  </>
                ) : (
                  `₹${origPrice}/${p.unit}`
                )}
              </div>
              <StockPill stock={p.stock} unit={p.unit} />
            </div>
          ),
        };
      }),
    [products]
  );

  const handleCustomerCreated = (newCust) => {
    setIsCustomerModalOpen(false);
    if (newCust) {
      setSelectedCustomerId(String(newCust.id));
      setFeedback({ type: 'success', message: `Customer "${newCust.name}" registered and selected!` });
    }
  };

  const handleProductSelect = (id) => {
    setSelectedProductId(id);
    const prod = products.find((p) => String(p.id) === String(id));
    if (prod) {
      // Default initial quantity based on unit
      setQuantity(prod.unit === 'pcs' ? 1 : 1.0);
    }
  };

  const handleAddToCart = () => {
    if (!selectedProduct) {
      setFeedback({ type: 'warning', message: 'Please select a product first.' });
      return;
    }
    const qty = Number(quantity);
    if (qty <= 0 || isNaN(qty)) {
      setFeedback({ type: 'warning', message: 'Please enter a valid quantity.' });
      return;
    }
    if (qty > selectedProduct.stock) {
      setFeedback({
        type: 'danger',
        message: `Only ${selectedProduct.stock} ${selectedProduct.unit} available in stock!`
      });
      return;
    }

    const existingIndex = cart.findIndex((item) => item.id === selectedProduct.id);
    const discount = Number(selectedProduct.discount || 0);
    const origPrice = Number(selectedProduct.price || 0);
    const discAmtUnit = Math.round(origPrice * (discount / 100) * 100) / 100;
    const discPrice = Math.round((origPrice - discAmtUnit) * 100) / 100;
    const gstRate = getGstRate(selectedProduct.category);
    const gstPerUnit = Math.round(discPrice * gstRate * 100) / 100;
    const lineSubtotal = Math.round(discPrice * qty * 100) / 100;
    const lineGst = Math.round(gstPerUnit * qty * 100) / 100;
    const lineTotal = Math.round((discPrice + gstPerUnit) * qty * 100) / 100;

    if (existingIndex >= 0) {
      const updated = [...cart];
      const newQty = updated[existingIndex].qty + qty;
      if (newQty > selectedProduct.stock) {
        setFeedback({
          type: 'danger',
          message: `Cannot exceed stock of ${selectedProduct.stock} ${selectedProduct.unit}!`
        });
        return;
      }
      const updatedSubtotal = Math.round(discPrice * newQty * 100) / 100;
      const updatedGst = Math.round(gstPerUnit * newQty * 100) / 100;
      const updatedTotal = Math.round((discPrice + gstPerUnit) * newQty * 100) / 100;
      updated[existingIndex] = {
        ...updated[existingIndex],
        qty: newQty,
        subtotal: updatedSubtotal,
        gst: updatedGst,
        total: updatedTotal
      };
      setCart(updated);
    } else {
      setCart([
        ...cart,
        {
          id: selectedProduct.id,
          name: selectedProduct.name,
          category: selectedProduct.category,
          unit: selectedProduct.unit,
          price: origPrice,
          original_price: origPrice,
          discount,
          discount_amount: discAmtUnit,
          discounted_price: discPrice,
          qty,
          subtotal: lineSubtotal,
          gstRate: gstRate * 100,
          gst: lineGst,
          total: lineTotal
        }
      ]);
    }

    setFeedback({
      type: 'success',
      message: `Added ${qty} ${selectedProduct.unit} of "${selectedProduct.name}" to cart.`
    });

    // Ready for the next item
    setSelectedProductId('');
    setQuantity(1);
  };

  const handleUpdateQty = (index, delta) => {
    const item = cart[index];
    const prod = products.find((p) => p.id === item.id);
    const step = item.unit === 'pcs' ? 1 : 0.5;
    const newQty = Math.max(step, item.qty + delta * step);

    if (prod && newQty > prod.stock) {
      setFeedback({ type: 'danger', message: `Only ${prod.stock} ${prod.unit} available!` });
      return;
    }

    const updated = [...cart];
    const discPrice = Number(item.discounted_price ?? item.price);
    const gstRate = (item.gstRate || 0) / 100;
    const gstPerUnit = Math.round(discPrice * gstRate * 100) / 100;
    const subtotal = Math.round(discPrice * newQty * 100) / 100;
    const gst = Math.round(gstPerUnit * newQty * 100) / 100;
    const total = Math.round((discPrice + gstPerUnit) * newQty * 100) / 100;
    updated[index] = {
      ...item,
      qty: newQty,
      subtotal,
      gst,
      total
    };
    setCart(updated);
  };

  const handleRemoveItem = (index) => {
    setCart(cart.filter((_, i) => i !== index));
  };

  const handleClearCart = () => {
    setCart([]);
    setFeedback(null);
  };

  const subtotal = cart.reduce((acc, item) => acc + item.subtotal, 0);
  const gstTotal = cart.reduce((acc, item) => acc + item.gst, 0);
  const totalDiscount = cart.reduce((acc, item) => {
    const discAmt = Number(item.discount_amount || 0);
    return acc + (discAmt * item.qty);
  }, 0);
  const grandTotal = subtotal + gstTotal;

  const handleCheckout = async () => {
    if (!selectedCustomer) {
      setFeedback({ type: 'danger', message: 'Please select or register a customer before completing the sale.' });
      return;
    }
    if (cart.length === 0) {
      setFeedback({ type: 'warning', message: 'Cart is empty. Add products to proceed.' });
      return;
    }

    try {
      const order = await recordSale({
        customer: selectedCustomer,
        items: cart,
        subtotal,
        totalDiscount,
        gstTotal,
        grandTotal
      });

      setCompletedOrder(order);
      setCart([]);
      setFeedback({ type: 'success', message: `Bill #INV-${order.billNumber} created successfully!` });
    } catch (err) {
      setFeedback({ type: 'danger', message: err.message || 'Checkout failed.' });
    }
  };

  return (
    <div className="pos-container container" style={{ padding: '1.5rem 1rem' }}>
      {/* Top Header */}
      <div className="page-header mb-4">
        <div>
          <h2>
            <i className="fa-solid fa-cash-register" style={{ marginRight: 8 }} />
            Point of Sale &amp; Billing Terminal
          </h2>
          <p className="subtitle">
            Process customer transactions, auto-calculate GST, deduct inventory, and issue tax invoices.
          </p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="btn btn-outline-primary btn-sm"
            onClick={() => setIsCustomerModalOpen(true)}
          >
            <i className="fa-solid fa-user-plus" /> + Add New Customer
          </button>
          <Link to="/customers" className="btn btn-secondary btn-sm" style={{ marginLeft: 8 }}>
            <i className="fa-solid fa-address-book" /> Customer Directory
          </Link>
        </div>
      </div>

      {feedback && (
        <div className={`alert alert-${feedback.type} mb-3`}>
          <div className="alert-content" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <i
              className={`fa-solid ${
                feedback.type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation'
              }`}
            />
            <span style={{ flex: 1 }}>{feedback.message}</span>
            <button
              type="button"
              aria-label="Dismiss message"
              onClick={() => setFeedback(null)}
              style={{
                border: 'none',
                background: 'transparent',
                color: 'inherit',
                opacity: 0.7,
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              <i className="fa-solid fa-xmark" />
            </button>
          </div>
        </div>
      )}

      {/* POS Two-Column Layout */}
      <div className="pos-layout">
        {/* Left: Item Picker & Customer Selection */}
        <div className="pos-control-panel">
          {/* Customer Card */}
          <div className="card mb-3">
            <div className="card-header flex-between">
              <h4>
                <i className="fa-solid fa-user-tag" style={{ marginRight: 8 }} />
                1. Customer Selection
              </h4>
              <button
                type="button"
                className="btn btn-sm btn-outline-primary"
                onClick={() => setIsCustomerModalOpen(true)}
              >
                <i className="fa-solid fa-plus" /> New Customer
              </button>
            </div>
            <div className="card-body">
              <div className="form-group mb-2">
                <label htmlFor="posCustomerSelect">Customer Account</label>
                <SearchSelect
                  id="posCustomerSelect"
                  icon="fa-user"
                  options={customerOptions}
                  value={selectedCustomerId}
                  onChange={setSelectedCustomerId}
                  placeholder="Search by name, ID, region or email..."
                  emptyText="No matching customer"
                  footerAction={{
                    label: 'Register New Customer',
                    icon: 'fa-user-plus',
                    onClick: () => setIsCustomerModalOpen(true),
                  }}
                />
              </div>

              {selectedCustomer && (
                <div
                  id="customerDetailsBox"
                  className="customer-info-pill"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    marginTop: 12,
                    padding: '10px 12px',
                    borderRadius: 12,
                    background: 'rgba(5,150,105,0.1)',
                    border: '1px solid rgba(5,150,105,0.25)',
                  }}
                >
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 800,
                      fontSize: 16,
                      color: '#fff',
                      background: 'linear-gradient(135deg, #7c3aed, #db2777)',
                      flexShrink: 0,
                    }}
                  >
                    {(selectedCustomer.name || '?').charAt(0).toUpperCase()}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{selectedCustomer.name}</div>
                    <div
                      style={{
                        fontSize: 12,
                        color: 'var(--text-muted)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      <i className="fa-solid fa-location-dot" style={{ marginRight: 4 }} />
                      {selectedCustomer.region}
                      <span style={{ margin: '0 6px' }}>•</span>
                      <i className="fa-regular fa-envelope" style={{ marginRight: 4 }} />
                      {selectedCustomer.email}
                    </div>
                  </div>
                  <i className="fa-solid fa-circle-check text-success" style={{ fontSize: 18 }} />
                </div>
              )}
            </div>
          </div>

          {/* Product Picker Card */}
          <div className="card">
            <div className="card-header">
              <h4>
                <i className="fa-solid fa-cart-plus" style={{ marginRight: 8 }} />
                2. Add Products to Cart
              </h4>
            </div>
            <div className="card-body">
              <div className="form-group mb-2">
                <label htmlFor="posProductSelect">Select Product</label>
                <SearchSelect
                  id="posProductSelect"
                  icon="fa-magnifying-glass"
                  options={productOptions}
                  value={selectedProductId}
                  onChange={handleProductSelect}
                  placeholder="Search by name, ID, category or type..."
                  emptyText="No matching product"
                  maxHeight={300}
                />
              </div>

              {selectedProduct && (
                <div
                  className="stock-indicator mb-3"
                  style={{
                    display: 'flex',
                    gap: 14,
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    marginTop: 12,
                    padding: '0.6rem 0.8rem',
                    background: 'var(--surface-header)',
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  <span>
                    Type: <strong className={`badge ${selectedProduct.subcategory === 'Open' ? 'badge-warning' : 'badge-info'}`}>{selectedProduct.subcategory}</strong>
                  </span>
                  <span>
                    Price: <strong>₹{selectedProduct.price} / {selectedProduct.unit}</strong>
                  </span>
                  {selectedProduct.discount > 0 && (
                    <span>
                      Discount: <strong className="text-success">{selectedProduct.discount}% off</strong>
                    </span>
                  )}
                  <span>
                    Available: <strong className={selectedProduct.stock < 5 ? 'text-danger' : 'text-success'}>{selectedProduct.stock} {selectedProduct.unit}</strong>
                  </span>
                </div>
              )}

              <div className="form-row" style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginTop: selectedProduct ? 0 : 12 }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label htmlFor="posQuantity">
                    Quantity (in {selectedProduct ? selectedProduct.unit : 'units'})
                  </label>
                  <input
                    type="number"
                    id="posQuantity"
                    className="form-control"
                    min={selectedProduct?.unit === 'pcs' ? '1' : '0.1'}
                    step={selectedProduct?.unit === 'pcs' ? '1' : '0.25'}
                    value={quantity}
                    onChange={(e) => setQuantity(Number(e.target.value))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddToCart();
                      }
                    }}
                  />
                </div>
                <div className="form-group">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleAddToCart}
                    disabled={!selectedProduct || selectedProduct.stock <= 0}
                  >
                    <i className="fa-solid fa-plus" /> Add to Cart
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Current Cart & Checkout */}
        <div className="pos-cart-panel">
          <div className="card h-100">
            <div className="card-header flex-between">
              <h4>
                <i className="fa-solid fa-basket-shopping" style={{ marginRight: 8 }} />
                Bill Items ({cart.length})
              </h4>
              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearCart}
                  className="btn btn-sm btn-outline-danger"
                >
                  <i className="fa-solid fa-trash-can" /> Clear
                </button>
              )}
            </div>

            <div className="card-body p-0">
              <div className="table-responsive">
                <table className="data-table pos-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Price</th>
                      <th>Qty</th>
                      <th>GST</th>
                      <th>Total</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cart.length > 0 ? (
                      cart.map((item, idx) => (
                        <tr key={item.id}>
                          <td>
                            <strong>{item.name}</strong>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.category}</div>
                            {item.discount > 0 && (
                              <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>
                                {item.discount}% off (-₹{Number(item.discount_amount).toFixed(2)})
                              </span>
                            )}
                          </td>
                          <td>
                            {item.discount > 0 ? (
                              <>
                                <span style={{ textDecoration: 'line-through', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                  ₹{item.original_price}
                                </span>
                                <br />
                                <strong>₹{item.discounted_price}</strong>
                                <small>/{item.unit}</small>
                              </>
                            ) : (
                              <>₹{item.price}/{item.unit}</>
                            )}
                          </td>
                          <td>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              <button
                                type="button"
                                className="btn btn-sm btn-secondary"
                                style={{ padding: '0.1rem 0.4rem', fontSize: '0.75rem' }}
                                onClick={() => handleUpdateQty(idx, -1)}
                              >
                                -
                              </button>
                              <span style={{ minWidth: 40, textAlign: 'center', fontWeight: 600 }}>
                                {item.qty} {item.unit}
                              </span>
                              <button
                                type="button"
                                className="btn btn-sm btn-secondary"
                                style={{ padding: '0.1rem 0.4rem', fontSize: '0.75rem' }}
                                onClick={() => handleUpdateQty(idx, 1)}
                              >
                                +
                              </button>
                            </div>
                          </td>
                          <td>{item.gstRate}%</td>
                          <td className="font-bold">₹{item.total.toFixed(2)}</td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-danger"
                              style={{ padding: '0.2rem 0.5rem' }}
                              onClick={() => handleRemoveItem(idx)}
                              title="Remove item"
                            >
                              <i className="fa-solid fa-xmark" />
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="6" className="text-center py-4 text-muted">
                          <i className="fa-solid fa-cart-shopping empty-icon" />
                          <p>Cart is currently empty. Select a customer and add items above.</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Cart Summary Footer */}
            <div className="card-footer pos-summary">
              <div className="summary-line">
                <span>Subtotal (Excl. Tax):</span>
                <span className="font-bold">₹{subtotal.toFixed(2)}</span>
              </div>
              {totalDiscount > 0 && (
                <div className="summary-line text-success">
                  <span>Total Discount:</span>
                  <span className="font-bold">-₹{totalDiscount.toFixed(2)}</span>
                </div>
              )}
              <div className="summary-line">
                <span>Total GST:</span>
                <span className="font-bold text-muted">₹{gstTotal.toFixed(2)}</span>
              </div>
              <div className="summary-line grand-total">
                <span>Grand Total (Net Payable):</span>
                <span className="total-amount">₹{grandTotal.toFixed(2)}</span>
              </div>

              <button
                type="button"
                className="btn btn-success btn-block btn-lg mt-3"
                disabled={cart.length === 0}
                onClick={handleCheckout}
              >
                <i className="fa-solid fa-file-invoice-dollar" style={{ marginRight: 8 }} />
                Complete Sale &amp; Issue Tax Invoice
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Customer Quick Registration Modal */}
      <CustomerModal
        isOpen={isCustomerModalOpen}
        onClose={handleCustomerCreated}
        onSave={(c) => addCustomer(c)}
      />

      {/* Printable Tax Invoice Modal */}
      <InvoiceModal
        order={completedOrder}
        onClose={() => setCompletedOrder(null)}
      />
    </div>
  );
}
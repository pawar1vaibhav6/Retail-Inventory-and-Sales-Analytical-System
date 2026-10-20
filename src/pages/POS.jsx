import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore, getGstRate } from '../context/StoreContext';
import CustomerModal from '../components/CustomerModal';
import InvoiceModal from '../components/InvoiceModal';

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

  const handleCustomerSelect = (val) => {
    if (val === '__NEW__') {
      setIsCustomerModalOpen(true);
    } else {
      setSelectedCustomerId(val);
    }
  };

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
    const gstRate = getGstRate(selectedProduct.category);
    const lineSubtotal = qty * selectedProduct.price;
    const lineGst = lineSubtotal * gstRate;
    const lineTotal = lineSubtotal + lineGst;

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
      const updatedSubtotal = newQty * selectedProduct.price;
      const updatedGst = updatedSubtotal * gstRate;
      updated[existingIndex] = {
        ...updated[existingIndex],
        qty: newQty,
        subtotal: updatedSubtotal,
        gst: updatedGst,
        total: updatedSubtotal + updatedGst
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
          price: selectedProduct.price,
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
    const subtotal = newQty * item.price;
    const gstRate = item.gstRate / 100;
    const gst = subtotal * gstRate;
    updated[index] = {
      ...item,
      qty: newQty,
      subtotal,
      gst,
      total: subtotal + gst
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
  const grandTotal = subtotal + gstTotal;

  const handleCheckout = () => {
    if (!selectedCustomer) {
      setFeedback({ type: 'danger', message: 'Please select or register a customer before completing the sale.' });
      return;
    }
    if (cart.length === 0) {
      setFeedback({ type: 'warning', message: 'Cart is empty. Add products to proceed.' });
      return;
    }

    const order = recordSale({
      customer: selectedCustomer,
      items: cart,
      subtotal,
      gstTotal,
      grandTotal
    });

    setCompletedOrder(order);
    setCart([]);
    setFeedback({ type: 'success', message: `Bill #INV-${order.billNumber} created successfully!` });
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
          <div className="alert-content">
            <i
              className={`fa-solid ${
                feedback.type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation'
              }`}
            />
            <span>{feedback.message}</span>
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
                <select
                  id="posCustomerSelect"
                  className="form-control"
                  value={selectedCustomerId}
                  onChange={(e) => handleCustomerSelect(e.target.value)}
                >
                  <option value="">-- Choose Existing Customer --</option>
                  <option value="__NEW__" className="text-primary font-bold">
                    + Register New Customer...
                  </option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      #{c.id} - {c.name} ({c.region})
                    </option>
                  ))}
                </select>
              </div>

              {selectedCustomer && (
                <div id="customerDetailsBox" className="customer-info-pill" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                  <i className="fa-solid fa-circle-check text-success" />
                  <span>
                    <strong>{selectedCustomer.name}</strong> | {selectedCustomer.region} ({selectedCustomer.email})
                  </span>
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
                <select
                  id="posProductSelect"
                  className="form-control"
                  value={selectedProductId}
                  onChange={(e) => handleProductSelect(e.target.value)}
                >
                  <option value="">-- Choose Product to Add --</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      #{p.id} - {p.name} [{p.category} | {p.subcategory}] — ₹{p.price}/{p.unit} (Stock: {p.stock} {p.unit})
                    </option>
                  ))}
                </select>
              </div>

              {selectedProduct && (
                <div className="stock-indicator mb-3" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', padding: '0.6rem 0.8rem', background: 'var(--surface-header)', borderRadius: 'var(--radius-sm)' }}>
                  <span>
                    Type: <strong className={`badge ${selectedProduct.subcategory === 'Open' ? 'badge-warning' : 'badge-info'}`}>{selectedProduct.subcategory}</strong>
                  </span>
                  <span>
                    Price: <strong>₹{selectedProduct.price} / {selectedProduct.unit}</strong>
                  </span>
                  <span>
                    Available: <strong className={selectedProduct.stock < 5 ? 'text-danger' : 'text-success'}>{selectedProduct.stock} {selectedProduct.unit}</strong>
                  </span>
                </div>
              )}

              <div className="form-row" style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
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
                          </td>
                          <td>₹{item.price}/{item.unit}</td>
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


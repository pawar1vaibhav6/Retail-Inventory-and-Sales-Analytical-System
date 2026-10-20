import React from 'react';

export default function InvoiceModal({ order, onClose }) {
  if (!order) return null;

  const handlePrint = () => {
    window.print();
  };

  const formattedDate = order.date ? new Date(order.date).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }) : 'Just Now';

  const totalDiscount = Number(order.totalDiscount || order.total_discount || 0);

  return (
    <div className="modal-overlay" style={{ display: 'flex' }}>
      <div className="modal-card invoice-modal">
        <div className="modal-header">
          <div className="invoice-brand">
            <i className="fa-solid fa-chart-line" />
            <div>
              <h3>RetailSphere Supermarket</h3>
              <span>Official Tax Invoice</span>
            </div>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="modal-body printable-invoice" id="invoicePrintArea">
          <div className="invoice-meta-grid">
            <div>
              <p><strong>Invoice No:</strong> <span>INV-{order.billNumber}</span></p>
              <p><strong>Date &amp; Time:</strong> <span>{formattedDate}</span></p>
            </div>
            <div className="text-right">
              <p><strong>Customer ID:</strong> <span>#{order.customerId}</span></p>
              <p><strong>Customer Name:</strong> <span>{order.customerName}</span></p>
              <p><strong>Region:</strong> <span>{order.customerRegion || 'Local'}</span></p>
            </div>
          </div>

          <table className="invoice-items-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Product</th>
                <th>HSN</th>
                <th>Category</th>
                <th>Original Price</th>
                <th>Discount</th>
                <th>Discounted Price</th>
                <th>Qty</th>
                <th>Subtotal</th>
                <th>GST</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {order.items && order.items.map((item, idx) => {
                const origPrice = Number(item.original_price ?? item.price ?? 0);
                const discPercent = Number(item.discount ?? item.discount_percent ?? 0);
                const discAmt = Number(item.discount_amount ?? (origPrice * (discPercent / 100)));
                const discPrice = Number(item.discounted_price ?? (origPrice - discAmt));
                return (
                  <tr key={idx}>
                    <td>{idx + 1}</td>
                    <td><strong>{item.name}</strong></td>
                    <td><span className="code-pill">{item.hsn_code || item.hsn || 'N/A'}</span></td>
                    <td>{item.category}</td>
                    <td>₹{origPrice.toFixed(2)}</td>
                    <td>{discPercent > 0 ? `${discPercent}% (-₹${discAmt.toFixed(2)})` : '0%'}</td>
                    <td>₹{discPrice.toFixed(2)}</td>
                    <td>{item.qty} {item.unit || 'pcs'}</td>
                    <td>₹{Number(item.subtotal).toFixed(2)}</td>
                    <td>₹{Number(item.gst).toFixed(2)}</td>
                    <td className="font-bold">₹{Number(item.total).toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan="8" className="text-right font-bold">Subtotal:</td>
                <td colSpan="3" className="font-bold">₹{Number(order.subtotal).toFixed(2)}</td>
              </tr>
              <tr>
                <td colSpan="8" className="text-right font-bold">Total Discount:</td>
                <td colSpan="3" className="font-bold text-success">
                  {totalDiscount > 0 ? `-₹${totalDiscount.toFixed(2)}` : '₹0.00'}
                </td>
              </tr>
              <tr>
                <td colSpan="8" className="text-right font-bold">GST Amount:</td>
                <td colSpan="3" className="font-bold">₹{Number(order.gstTotal).toFixed(2)}</td>
              </tr>
              <tr className="inv-grand-total-row">
                <td colSpan="8" className="text-right font-bold">Grand Total:</td>
                <td colSpan="3" className="font-bold text-success">
                  ₹{Number(order.grandTotal).toFixed(2)}
                </td>
              </tr>
            </tfoot>
          </table>

          <div className="invoice-footer-note">
            <p>Thank you for shopping with us! Computer-generated invoice, no signature required.</p>
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
          <button type="button" className="btn btn-primary" onClick={handlePrint}>
            <i className="fa-solid fa-print" style={{ marginRight: 6 }} /> Print Invoice
          </button>
        </div>
      </div>
    </div>
  );
}

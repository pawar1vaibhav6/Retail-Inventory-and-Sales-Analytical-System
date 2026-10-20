import React, { useState } from 'react';

export default function CustomerModal({ isOpen, onClose, onSave }) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    region: ''
  });

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.name.trim()) return;
    const newCust = onSave(formData);
    setFormData({ name: '', email: '', region: '' });
    onClose(newCust);
  };

  return (
    <div className="modal-overlay" style={{ display: 'flex' }}>
      <div className="modal-card">
        <div className="modal-header">
          <h3>
            <i className="fa-solid fa-user-plus text-primary" style={{ marginRight: 8 }} />
            Register New Customer
          </h3>
          <button type="button" className="modal-close" onClick={() => onClose(null)}>
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group mb-3">
              <label htmlFor="modal_cust_name">Customer Full Name *</label>
              <input
                type="text"
                id="modal_cust_name"
                className="form-control"
                required
                placeholder="e.g. Rahul Sharma"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                autoFocus
              />
            </div>

            <div className="form-group mb-3">
              <label htmlFor="modal_cust_email">Email Address</label>
              <input
                type="email"
                id="modal_cust_email"
                className="form-control"
                placeholder="e.g. rahul@example.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label htmlFor="modal_cust_region">Region / City *</label>
              <input
                type="text"
                id="modal_cust_region"
                className="form-control"
                required
                placeholder="e.g. Mumbai, North, South, Delhi"
                value={formData.region}
                onChange={(e) => setFormData({ ...formData, region: e.target.value })}
              />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={() => onClose(null)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              <i className="fa-solid fa-check" style={{ marginRight: 6 }} />
              Save &amp; Select Customer
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

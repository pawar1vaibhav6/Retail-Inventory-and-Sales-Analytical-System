import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../context/StoreContext';
import CustomerModal from '../components/CustomerModal';

export default function Customers() {
  const { customers, addCustomer } = useStore();

  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const filteredCustomers = customers.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.email && c.email.toLowerCase().includes(q)) ||
      (c.region && c.region.toLowerCase().includes(q)) ||
      String(c.id).includes(q)
    );
  });

  const handleCustomerCreated = (newCust) => {
    setIsModalOpen(false);
    if (newCust) {
      setFeedback({ type: 'success', message: `Customer "${newCust.name}" registered successfully!` });
    }
  };

  return (
    <div className="customers-container container" style={{ padding: '1.5rem 1rem' }}>
      {/* Header */}
      <div className="page-header mb-4">
        <div>
          <h2>
            <i className="fa-solid fa-users" style={{ marginRight: 8 }} />
            Customer Directory
          </h2>
          <p className="subtitle">
            Maintain customer profiles, region demographics, and customer billing references.
          </p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setIsModalOpen(true)}
          >
            <i className="fa-solid fa-user-plus" /> Add New Customer
          </button>
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

      {/* Search Bar */}
      <div className="card mb-4">
        <div className="card-body py-3">
          <div className="search-filter-form" style={{ display: 'flex', gap: 12 }}>
            <div className="filter-input-wrap" style={{ flex: 1 }}>
              <i className="fa-solid fa-magnifying-glass" />
              <input
                type="text"
                className="form-control"
                placeholder="Search by customer name, email, region, or ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {search && (
              <button
                type="button"
                className="btn btn-outline-danger"
                onClick={() => setSearch('')}
              >
                Reset
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Customers Table Card */}
      <div className="card">
        <div className="card-header flex-between">
          <h4>
            <i className="fa-solid fa-address-book" style={{ marginRight: 8 }} />
            Registered Customers ({filteredCustomers.length})
          </h4>
        </div>
        <div className="card-body p-0">
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Customer ID</th>
                  <th>Customer Name</th>
                  <th>Email Address</th>
                  <th>Region / Location</th>
                  <th>Total Spent</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.length > 0 ? (
                  filteredCustomers.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <span className="code-pill">#{c.id}</span>
                      </td>
                      <td>
                        <div className="user-cell">
                          <div className="avatar-cell">{c.name.charAt(0).toUpperCase()}</div>
                          <strong>{c.name}</strong>
                        </div>
                      </td>
                      <td>
                        <a href={`mailto:${c.email}`} className="text-muted">
                          {c.email}
                        </a>
                      </td>
                      <td>
                        <span className="badge badge-secondary">{c.region}</span>
                      </td>
                      <td className="font-bold text-success">
                        ₹{Number(c.totalSpent || 0).toFixed(2)}
                      </td>
                      <td>
                        <Link
                          to="/pos"
                          className="btn btn-sm btn-outline-primary"
                          title="Create Bill for Customer"
                        >
                          <i className="fa-solid fa-receipt" style={{ marginRight: 4 }} /> New Bill
                        </Link>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="6" className="text-center py-5 text-muted">
                      <i className="fa-solid fa-user-slash empty-icon" />
                      <p>No customers found matching your query.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Add Customer Modal */}
      <CustomerModal
        isOpen={isModalOpen}
        onClose={handleCustomerCreated}
        onSave={(c) => addCustomer(c)}
      />
    </div>
  );
}

import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useStore } from '../context/StoreContext';
import ProductModal from '../components/ProductModal';

export default function Products() {
  const { user } = useAuth();
  const { products, categories, addProduct, updateProduct } = useStore();

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedSubcategory, setSelectedSubcategory] = useState('');
  const [modalState, setModalState] = useState({ isOpen: false, mode: 'add', product: null });
  const [feedback, setFeedback] = useState(null);

  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      String(p.id).includes(search);
    const matchesCategory = !selectedCategory || p.category === selectedCategory;
    const matchesSubcategory = !selectedSubcategory || p.subcategory === selectedSubcategory;
    return matchesSearch && matchesCategory && matchesSubcategory;
  });

  const handleOpenModal = (mode, prod = null) => {
    setModalState({ isOpen: true, mode, product: prod });
  };

  const handleCloseModal = () => {
    setModalState({ isOpen: false, mode: 'add', product: null });
  };

  const handleSaveModal = (data) => {
    if (modalState.mode === 'add') {
      const created = addProduct(data);
      setFeedback({ type: 'success', message: `Product "${created.name}" created successfully!` });
    } else if (modalState.mode === 'price' && modalState.product) {
      updateProduct(modalState.product.id, { price: data.price });
      setFeedback({
        type: 'success',
        message: `Updated price for "${modalState.product.name}" to ₹${data.price}/${modalState.product.unit}.`
      });
    } else if (modalState.mode === 'restock' && modalState.product) {
      const newStock = modalState.product.stock + data.addStock;
      updateProduct(modalState.product.id, { stock: newStock });
      setFeedback({
        type: 'success',
        message: `Restocked ${data.addStock} ${modalState.product.unit}. New Stock: ${newStock} ${modalState.product.unit}.`
      });
    }
  };

  const handleResetFilters = () => {
    setSearch('');
    setSelectedCategory('');
    setSelectedSubcategory('');
  };

  return (
    <div className="inventory-container container" style={{ padding: '1.5rem 1rem' }}>
      {/* Header */}
      <div className="page-header mb-4">
        <div>
          <h2>
            <i className="fa-solid fa-boxes-stacked" style={{ marginRight: 8 }} />
            Inventory &amp; Product Catalog
          </h2>
          <p className="subtitle">
            Manage products, adjust selling prices, replenish warehouse stock, and monitor low-stock warnings.
          </p>
        </div>
        <div className="header-actions">
          {user?.role === 'admin' && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => handleOpenModal('add')}
            >
              <i className="fa-solid fa-plus" /> Add New Product
            </button>
          )}
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

      {/* Search & Filter Bar */}
      <div className="card mb-4">
        <div className="card-body py-3">
          <div className="search-filter-form" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div className="filter-input-wrap" style={{ flex: 1, minWidth: 200 }}>
              <i className="fa-solid fa-magnifying-glass" />
              <input
                type="text"
                className="form-control"
                placeholder="Search by product name or ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="filter-select-wrap">
              <select
                className="form-control"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
              >
                <option value="">All Categories</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-select-wrap">
              <select
                className="form-control"
                value={selectedSubcategory}
                onChange={(e) => setSelectedSubcategory(e.target.value)}
              >
                <option value="">All Types (Packing &amp; Open)</option>
                <option value="Packing">📦 Packing Only</option>
                <option value="Open">⚖️ Open (Loose) Only</option>
              </select>
            </div>

            {(search || selectedCategory || selectedSubcategory) && (
              <button
                type="button"
                className="btn btn-outline-danger"
                onClick={handleResetFilters}
              >
                Reset
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Products Table Card */}
      <div className="card">
        <div className="card-header flex-between">
          <h4>
            <i className="fa-solid fa-table-list" style={{ marginRight: 8 }} />
            Product Directory ({filteredProducts.length} items)
          </h4>
        </div>
        <div className="card-body p-0">
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Product Name</th>
                  <th>Category</th>
                  <th>Subcategory</th>
                  <th>Selling Price</th>
                  <th>Cost Price</th>
                  <th>Stock Quantity</th>
                  <th>Status</th>
                  {user?.role === 'admin' && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filteredProducts.length > 0 ? (
                  filteredProducts.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <span className="code-pill">#{p.id}</span>
                      </td>
                      <td>
                        <strong>{p.name}</strong>
                      </td>
                      <td>
                        <span className="category-pill">{p.category}</span>
                      </td>
                      <td>
                        {p.subcategory === 'Open' ? (
                          <span
                            className="badge badge-warning"
                            title="Loose goods (Liters for liquids, kg for cereals)"
                          >
                            <i className="fa-solid fa-scale-unbalanced-flip" /> Open
                          </span>
                        ) : (
                          <span
                            className="badge badge-info"
                            title="Pre-packaged goods sold in pieces"
                          >
                            <i className="fa-solid fa-box" /> Packing
                          </span>
                        )}
                      </td>
                      <td>
                        <strong>₹{p.price}</strong> <small className="text-muted">/ {p.unit}</small>
                      </td>
                      <td className="text-muted">₹{p.cost}</td>
                      <td>
                        <span className={`stock-qty-val ${p.stock < 5 ? 'text-danger font-bold' : ''}`}>
                          {p.stock} {p.unit}
                        </span>
                      </td>
                      <td>
                        {p.stock < 5 ? (
                          <span className="badge badge-warning">
                            <i className="fa-solid fa-triangle-exclamation" /> Low Stock
                          </span>
                        ) : (
                          <span className="badge badge-success">
                            <i className="fa-solid fa-circle-check" /> In Stock
                          </span>
                        )}
                      </td>
                      {user?.role === 'admin' && (
                        <td>
                          <div className="action-buttons">
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-primary"
                              onClick={() => handleOpenModal('price', p)}
                              title="Adjust Selling Price"
                            >
                              <i className="fa-solid fa-tag" /> Price
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-success"
                              onClick={() => handleOpenModal('restock', p)}
                              title="Replenish Warehouse Stock"
                            >
                              <i className="fa-solid fa-dolly" /> Restock
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={user?.role === 'admin' ? 9 : 8} className="text-center py-5 text-muted">
                      <i className="fa-solid fa-box-open empty-icon" />
                      <p>No products found matching your search criteria.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Reusable Product Modal */}
      <ProductModal
        isOpen={modalState.isOpen}
        mode={modalState.mode}
        product={modalState.product}
        categories={categories}
        onClose={handleCloseModal}
        onSave={handleSaveModal}
      />
    </div>
  );
}

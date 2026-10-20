import React, { useState, useEffect } from 'react';

export default function ProductModal({ isOpen, mode, product, categories, onClose, onSave }) {
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    subcategory: 'Packing',
    unit: 'pcs',
    price: '',
    cost: '',
    stock: ''
  });

  useEffect(() => {
    if (product && (mode === 'price' || mode === 'restock' || mode === 'edit')) {
      setFormData({
        name: product.name || '',
        category: product.category || '',
        subcategory: product.subcategory || 'Packing',
        unit: product.unit || 'pcs',
        price: product.price || '',
        cost: product.cost || '',
        stock: product.stock || ''
      });
    } else {
      setFormData({
        name: '',
        category: categories && categories.length ? categories[0] : 'General',
        subcategory: 'Packing',
        unit: 'pcs',
        price: '',
        cost: '',
        stock: ''
      });
    }
  }, [product, mode, isOpen, categories]);

  if (!isOpen) return null;

  const handleSubcategoryChange = (subcat) => {
    let suggestedUnit = 'pcs';
    if (subcat === 'Open') {
      const cat = (formData.category || '').toLowerCase();
      if (cat.includes('milk') || cat.includes('oil') || cat.includes('beverage')) {
        suggestedUnit = 'Liters';
      } else {
        suggestedUnit = 'kg';
      }
    }
    setFormData((prev) => ({
      ...prev,
      subcategory: subcat,
      unit: suggestedUnit
    }));
  };

  const handleCategoryChange = (cat) => {
    let suggestedUnit = formData.unit;
    if (formData.subcategory === 'Open') {
      const lower = cat.toLowerCase();
      if (lower.includes('milk') || lower.includes('oil') || lower.includes('beverage')) {
        suggestedUnit = 'Liters';
      } else {
        suggestedUnit = 'kg';
      }
    }
    setFormData((prev) => ({
      ...prev,
      category: cat,
      unit: suggestedUnit
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (mode === 'price') {
      onSave({ price: Number(formData.price) });
    } else if (mode === 'restock') {
      onSave({ addStock: Number(formData.stock) });
    } else {
      onSave(formData);
    }
    onClose();
  };

  return (
    <div className="modal-overlay" style={{ display: 'flex' }}>
      <div className="modal-card">
        <div className="modal-header">
          <h3>
            <i className={`fa-solid ${mode === 'price' ? 'fa-tag' : mode === 'restock' ? 'fa-dolly' : 'fa-box-archive'}`} style={{ marginRight: 8 }} />
            {mode === 'price' ? 'Adjust Selling Price' : mode === 'restock' ? 'Replenish Warehouse Stock' : 'Add New Product'}
          </h3>
          <button type="button" className="modal-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {mode === 'price' && (
              <>
                <p className="mb-3">Updating price for <strong>{product?.name}</strong> (Current: ₹{product?.price}/{product?.unit})</p>
                <div className="form-group">
                  <label htmlFor="new_price">New Selling Price (₹ per {product?.unit}) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    id="new_price"
                    className="form-control"
                    required
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  />
                </div>
              </>
            )}

            {mode === 'restock' && (
              <>
                <p className="mb-3">Replenishing stock for <strong>{product?.name}</strong> (Current Stock: {product?.stock} {product?.unit})</p>
                <div className="form-group">
                  <label htmlFor="add_stock">Quantity to Add (in {product?.unit}) *</label>
                  <input
                    type="number"
                    step={product?.unit === 'pcs' ? '1' : '0.1'}
                    min="1"
                    id="add_stock"
                    className="form-control"
                    required
                    placeholder="Enter stock quantity to add"
                    value={formData.stock}
                    onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                  />
                </div>
              </>
            )}

            {(mode === 'add' || mode === 'edit') && (
              <>
                <div className="form-group mb-3">
                  <label htmlFor="prod_name">Product Name *</label>
                  <input
                    type="text"
                    id="prod_name"
                    className="form-control"
                    required
                    placeholder="e.g. Organic Wheat Flour"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>

                <div className="form-row mb-3">
                  <div className="form-group flex-1">
                    <label htmlFor="prod_category">Category *</label>
                    <input
                      type="text"
                      id="prod_category"
                      className="form-control"
                      list="categoriesList"
                      required
                      placeholder="e.g. Cereals, Milk, Oil"
                      value={formData.category}
                      onChange={(e) => handleCategoryChange(e.target.value)}
                    />
                    <datalist id="categoriesList">
                      {categories && categories.map((c) => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
                  </div>

                  <div className="form-group flex-1">
                    <label htmlFor="prod_subcat">Packaging Type</label>
                    <select
                      id="prod_subcat"
                      className="form-control"
                      value={formData.subcategory}
                      onChange={(e) => handleSubcategoryChange(e.target.value)}
                    >
                      <option value="Packing">📦 Packing (Box / Packet / Bottle)</option>
                      <option value="Open">⚖️ Open / Loose (By Weight or Volume)</option>
                    </select>
                  </div>
                </div>

                <div className="form-group mb-3">
                  <label htmlFor="prod_unit">Measurement Unit</label>
                  <select
                    id="prod_unit"
                    className="form-control"
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                  >
                    <option value="pcs">Pieces (pcs) — for packaged items</option>
                    <option value="Liters">Liters (L) — for liquids (milk, oil, beverages)</option>
                    <option value="kg">Kilograms (kg) — for cereals, pulses, fruits, vegetables</option>
                  </select>
                </div>

                <div className="form-row mb-3">
                  <div className="form-group flex-1">
                    <label htmlFor="prod_cost">Cost Price (₹ per {formData.unit})</label>
                    <input
                      type="number"
                      step="0.01"
                      id="prod_cost"
                      className="form-control"
                      placeholder="Wholesale/Cost price"
                      value={formData.cost}
                      onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
                    />
                  </div>

                  <div className="form-group flex-1">
                    <label htmlFor="prod_price">Selling Price (₹ per {formData.unit}) *</label>
                    <input
                      type="number"
                      step="0.01"
                      id="prod_price"
                      className="form-control"
                      required
                      placeholder="Retail price"
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    />
                  </div>

                  <div className="form-group flex-1">
                    <label htmlFor="prod_stock">Initial Stock ({formData.unit}) *</label>
                    <input
                      type="number"
                      step={formData.unit === 'pcs' ? '1' : '0.1'}
                      id="prod_stock"
                      className="form-control"
                      required
                      placeholder="Units in warehouse"
                      value={formData.stock}
                      onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                    />
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              <i className="fa-solid fa-check" style={{ marginRight: 6 }} />
              {mode === 'price' ? 'Save Price' : mode === 'restock' ? 'Confirm Restock' : 'Save Product'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


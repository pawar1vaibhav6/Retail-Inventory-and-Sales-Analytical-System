import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useStore } from "../context/StoreContext";
import ProductModal from "../components/ProductModal";

export default function Products() {
  const { user } = useAuth();
  const { products, categories, addProduct, updateProduct } = useStore();

  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedSubcategory, setSelectedSubcategory] = useState("");
  const [modalState, setModalState] = useState({
    isOpen: false,
    mode: "add",
    product: null,
  });
  const [feedback, setFeedback] = useState(null);
  const [focused, setFocused] = useState(null);
  const [resetHover, setResetHover] = useState(false);

  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      String(p.id).includes(search);
    const matchesCategory =
      !selectedCategory || p.category === selectedCategory;
    const matchesSubcategory =
      !selectedSubcategory || p.subcategory === selectedSubcategory;
    return matchesSearch && matchesCategory && matchesSubcategory;
  });

  const handleOpenModal = (mode, prod = null) => {
    setModalState({ isOpen: true, mode, product: prod });
  };

  const handleCloseModal = () => {
    setModalState({ isOpen: false, mode: "add", product: null });
  };

  const handleSaveModal = async (data) => {
    try {
      if (modalState.mode === "add") {
        const created = await addProduct(data);
        setFeedback({
          type: "success",
          message: `Product "${created.name}" created successfully!`,
        });
      } else if (modalState.mode === "price" && modalState.product) {
        await updateProduct(modalState.product.id, {
          price: data.price,
          discount: data.discount,
        });
        setFeedback({
          type: "success",
          message: `Updated price/discount for "${modalState.product.name}".`,
        });
      } else if (modalState.mode === "restock" && modalState.product) {
        const newStock =
          Number(modalState.product.stock) + Number(data.addStock);
        await updateProduct(modalState.product.id, {
          stock: newStock,
          addStock: data.addStock,
          discount: data.discount,
        });
        setFeedback({
          type: "success",
          message: `Restocked ${data.addStock} ${modalState.product.unit || "unit"}. New Stock: ${newStock} ${modalState.product.unit || "unit"}.`,
        });
      }
    } catch (err) {
      setFeedback({
        type: "danger",
        message: err.message || "Operation failed.",
      });
    }
  };

  const handleResetFilters = () => {
    setSearch("");
    setSelectedCategory("");
    setSelectedSubcategory("");
  };

  const s = {
    card: {
      background: "#fff",
      border: "1px solid #e5e7eb",
      borderRadius: 12,
      boxShadow: "0 1px 3px rgba(16,24,40,0.06)",
      marginBottom: 16,
    },
    body: { padding: 16 },
    grid: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
      gap: 12,
      alignItems: "center",
    },
    searchBox: { position: "relative", gridColumn: "span 2", minWidth: 0 },
    searchIcon: {
      position: "absolute",
      left: 14,
      top: "50%",
      transform: "translateY(-50%)",
      color: "#9ca3af",
      fontSize: 14,
      pointerEvents: "none",
    },
    clearBtn: {
      position: "absolute",
      right: 8,
      top: "50%",
      transform: "translateY(-50%)",
      width: 24,
      height: 24,
      border: "none",
      borderRadius: "50%",
      background: "#f3f4f6",
      color: "#6b7280",
      cursor: "pointer",
      fontSize: 11,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    },
    control: (isFocused, active) => ({
      width: "100%",
      height: 42,
      boxSizing: "border-box",
      padding: "0 14px",
      fontSize: 14,
      color: "#111827",
      background: active ? "#eff6ff" : "#fff",
      border: `1px solid ${isFocused ? "#3b82f6" : active ? "#93c5fd" : "#d1d5db"}`,
      borderRadius: 8,
      outline: "none",
      boxShadow: isFocused ? "0 0 0 3px rgba(59,130,246,0.18)" : "none",
      transition: "border-color .15s, box-shadow .15s, background .15s",
      cursor: "pointer",
    }),
    reset: (hover) => ({
      height: 42,
      padding: "0 18px",
      fontSize: 14,
      fontWeight: 500,
      color: hover ? "#fff" : "#374151",
      background: hover ? "#ef4444" : "#f3f4f6",
      border: "1px solid transparent",
      borderRadius: 8,
      cursor: "pointer",
      whiteSpace: "nowrap",
      transition: "background .15s, color .15s",
    }),
  };

  return (
    <div
      className="inventory-container container"
      style={{ padding: "1.5rem 1rem" }}
    >
      {/* Header */}
      <div className="page-header mb-4">
        <div>
          <h2>
            <i
              className="fa-solid fa-boxes-stacked"
              style={{ marginRight: 8 }}
            />
            Inventory &amp; Product Catalog
          </h2>
          <p className="subtitle">
            Manage products, adjust selling prices, set discounts, replenish
            warehouse stock, and monitor low-stock warnings.
          </p>
        </div>
        <div className="header-actions">
          {user?.role === "admin" && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => handleOpenModal("add")}
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
                feedback.type === "success"
                  ? "fa-circle-check"
                  : "fa-circle-exclamation"
              }`}
            />
            <span>{feedback.message}</span>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="card mb-4" style={s.card}>
        <div className="card-body" style={s.body}>
          <div className="filters-grid" style={s.grid}>
            <div className="search-box" style={s.searchBox}>
              <i
                className="fa-solid fa-magnifying-glass search-icon"
                style={s.searchIcon}
              />
              <input
                type="text"
                className="form-control"
                placeholder="Search products by name or ID..."
                aria-label="Search products"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && setSearch("")}
                onFocus={() => setFocused("search")}
                onBlur={() => setFocused(null)}
                style={{
                  ...s.control(focused === "search", !!search),
                  paddingLeft: 38,
                  paddingRight: search ? 38 : 14,
                  cursor: "text",
                }}
              />
              {search && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setSearch("")}
                  style={s.clearBtn}
                >
                  <i className="fa-solid fa-xmark" />
                </button>
              )}
            </div>

            <div className="filter-group">
              <select
                className="form-control"
                aria-label="Filter by category"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                onFocus={() => setFocused("category")}
                onBlur={() => setFocused(null)}
                style={s.control(focused === "category", !!selectedCategory)}
              >
                <option value="">All Categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <select
                className="form-control"
                aria-label="Filter by packaging type"
                value={selectedSubcategory}
                onChange={(e) => setSelectedSubcategory(e.target.value)}
                onFocus={() => setFocused("sub")}
                onBlur={() => setFocused(null)}
                style={s.control(focused === "sub", !!selectedSubcategory)}
              >
                <option value="">All Types (Packaging)</option>
                <option value="Packing">📦 Packing Only</option>
                <option value="Open">⚖️ Open / Loose Only</option>
              </select>
            </div>

            {(search || selectedCategory || selectedSubcategory) && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleResetFilters}
                onMouseEnter={() => setResetHover(true)}
                onMouseLeave={() => setResetHover(false)}
                style={s.reset(resetHover)}
              >
                <i
                  className="fa-solid fa-rotate-left"
                  style={{ marginRight: 6 }}
                />
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
                  <th>Discount</th>
                  <th>Cost Price</th>
                  <th>Stock Quantity</th>
                  <th>Status</th>
                  {user?.role === "admin" && <th>Actions</th>}
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
                        {p.subcategory === "Open" ? (
                          <span
                            className="badge badge-warning"
                            title="Loose goods (Liters for liquids, kg for cereals)"
                          >
                            <i className="fa-solid fa-scale-unbalanced-flip" />{" "}
                            Open
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
                        <strong>₹{p.price}</strong>{" "}
                        <small className="text-muted">/ {p.unit}</small>
                      </td>
                      <td>
                        {p.discount > 0 ? (
                          <span className="badge badge-success">
                            {p.discount}% off
                          </span>
                        ) : (
                          <span className="text-muted">0%</span>
                        )}
                      </td>
                      <td className="text-muted">₹{p.cost}</td>
                      <td>
                        <span
                          className={`stock-qty-val ${p.stock < 5 ? "text-danger font-bold" : ""}`}
                        >
                          {p.stock} {p.unit}
                        </span>
                      </td>
                      <td>
                        {p.stock < 5 ? (
                          <span className="badge badge-warning">
                            <i className="fa-solid fa-triangle-exclamation" />{" "}
                            Low Stock
                          </span>
                        ) : (
                          <span className="badge badge-success">
                            <i className="fa-solid fa-circle-check" /> In Stock
                          </span>
                        )}
                      </td>
                      {user?.role === "admin" && (
                        <td>
                          <div className="action-buttons">
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-primary"
                              onClick={() => handleOpenModal("price", p)}
                              title="Adjust Selling Price"
                            >
                              <i className="fa-solid fa-tag" /> Price
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-success text-black"
                              style={{ color: "black" }}
                              onClick={() => handleOpenModal("restock", p)}
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
                    <td
                      colSpan={user?.role === "admin" ? 10 : 9}
                      className="text-center py-5 text-muted"
                    >
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

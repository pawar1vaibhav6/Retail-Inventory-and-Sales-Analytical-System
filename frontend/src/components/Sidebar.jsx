import React from "react";
import { NavLink, Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import ThemeToggle from "./ThemeToggle";

const ADMIN_ONLY_PATHS = ["/products", "/analytics", "/charts"];

const roleStyles = {
  admin: {
    bg: "linear-gradient(135deg, #7c3aed, #db2777)",
    glow: "rgba(124,58,237,0.45)",
    icon: "#fde68a",
    iconClass: "fa-shield-halved",
  },
  cashier: {
    bg: "linear-gradient(135deg, #0ea5e9, #10b981)",
    glow: "rgba(14,165,233,0.4)",
    icon: "#ffffff",
    iconClass: "fa-cash-register",
  },
  default: {
    bg: "linear-gradient(135deg, #64748b, #475569)",
    glow: "rgba(100,116,139,0.35)",
    icon: "#ffffff",
    iconClass: "fa-user",
  },
};

export default function Sidebar({ isOpen, onClose }) {
  const { user, logout, switchRole } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = (e) => {
    e.preventDefault();
    if (onClose) onClose();
    logout();
    navigate("/login");
  };

  const handleLinkClick = () => {
    if (onClose) onClose();
  };

  // Safe even when user is null (logged out)
  const role = user?.role || "cashier";
  const rs = roleStyles[role] || roleStyles.default;
  const isAdmin = role === "admin";

  const handleRoleSwitch = (nextRole) => {
    if (nextRole === role) return;
    if (typeof switchRole === "function") switchRole(nextRole);
    // Leaving admin while on an admin-only page -> go to a safe page
    if (nextRole !== "admin" && ADMIN_ONLY_PATHS.includes(location.pathname)) {
      navigate("/dashboard");
    }
  };

  const toggleOptions = [
    { value: "cashier", label: "Cashier", icon: "fa-cash-register" },
    { value: "admin", label: "Admin", icon: "fa-shield-halved" },
  ];

  return (
    <aside
      id="app-sidebar"
      className={`app-sidebar ${isOpen ? "open" : ""}`}
      aria-label="Sidebar navigation"
    >
      {/* Top Header: Brand & Mobile Close Button */}
      <div className="sidebar-header">
        <Link to="/" className="sidebar-brand" onClick={handleLinkClick}>
          <div className="brand-icon">
            <i className="fa-solid fa-chart-line" />
          </div>
          <div className="brand-text">
            <span className="brand-title">RetailSphere</span>
            <span className="brand-subtitle">Inventory &amp; Sales System</span>
          </div>
        </Link>

        <button
          type="button"
          className="sidebar-close-btn"
          onClick={onClose}
          aria-label="Close navigation menu"
        >
          <i className="fa-solid fa-xmark" />
        </button>
      </div>

      {/* Middle Navigation Links */}
      <div className="sidebar-body">
        {user && (
          <>
            <div className="sidebar-section-label">Main Menu</div>
            <nav className="sidebar-nav" aria-label="Main">
              <NavLink
                to="/dashboard"
                onClick={handleLinkClick}
                className={({ isActive }) =>
                  `sidebar-nav-item ${isActive ? "active" : ""}`
                }
              >
                <i className="fa-solid fa-gauge" />
                <span>Dashboard</span>
              </NavLink>

              <NavLink
                to="/pos"
                onClick={handleLinkClick}
                className={({ isActive }) =>
                  `sidebar-nav-item ${isActive ? "active" : ""}`
                }
              >
                <i className="fa-solid fa-cash-register" />
                <span>POS Billing</span>
              </NavLink>

              {isAdmin && (
                <NavLink
                  to="/products"
                  onClick={handleLinkClick}
                  className={({ isActive }) =>
                    `sidebar-nav-item ${isActive ? "active" : ""}`
                  }
                >
                  <i className="fa-solid fa-boxes-stacked" />
                  <span>Inventory</span>
                </NavLink>
              )}

              <NavLink
                to="/customers"
                onClick={handleLinkClick}
                className={({ isActive }) =>
                  `sidebar-nav-item ${isActive ? "active" : ""}`
                }
              >
                <i className="fa-solid fa-users" />
                <span>Customers</span>
              </NavLink>

              {isAdmin && (
                <>
                  <div
                    className="sidebar-section-label"
                    style={{ marginTop: "0.85rem" }}
                  >
                    Reports &amp; Analytics
                  </div>
                  <NavLink
                    to="/analytics"
                    onClick={handleLinkClick}
                    className={({ isActive }) =>
                      `sidebar-nav-item ${isActive ? "active" : ""}`
                    }
                  >
                    <i className="fa-solid fa-chart-pie" />
                    <span>Analytics</span>
                  </NavLink>

                  <NavLink
                    to="/charts"
                    onClick={handleLinkClick}
                    className={({ isActive }) =>
                      `sidebar-nav-item ${isActive ? "active" : ""}`
                    }
                  >
                    <i className="fa-solid fa-chart-column" />
                    <span>Charts</span>
                  </NavLink>
                </>
              )}
            </nav>
          </>
        )}
      </div>

      {/* Bottom Section: User Info, Role Switch, Theme Toggle & Logout */}
      <div className="sidebar-footer">
        {user ? (
          <>
            <div
              className="sidebar-user"
              style={{
                margin: 12,
                padding: "12px 14px",
                borderRadius: 14,
                background:
                  "linear-gradient(145deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))",
                border: "1px solid rgba(255,255,255,0.1)",
                backdropFilter: "blur(8px)",
                boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              

              {/* Row 2: segmented role switch (Cashier | Admin) */}
              <div
                role="radiogroup"
                aria-label="Switch role"
                style={{
                  position: "relative",
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  padding: 4,
                  borderRadius: 999,
                  background: "rgba(0,0,0,0.18)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  boxShadow: "inset 0 2px 6px rgba(0,0,0,0.18)",
                }}
              >
                {/* Sliding thumb */}
                <span
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    top: 4,
                    bottom: 4,
                    left: 4,
                    width: "calc(50% - 4px)",
                    borderRadius: 999,
                    background: rs.bg,
                    boxShadow: `0 4px 14px ${rs.glow}, inset 0 1px 0 rgba(255,255,255,0.3)`,
                    transform: isAdmin ? "translateX(100%)" : "translateX(0)",
                    transition:
                      "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), background 0.3s ease, box-shadow 0.3s ease",
                  }}
                />

                {toggleOptions.map((opt) => {
                  const active = role === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => handleRoleSwitch(opt.value)}
                      title={`Switch to ${opt.label}`}
                      style={{
                        position: "relative",
                        zIndex: 1,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                        padding: "7px 8px",
                        border: "none",
                        outline: "none",
                        background: "transparent",
                        borderRadius: 999,
                        fontSize: 12.5,
                        fontWeight: active ? 700 : 600,
                        letterSpacing: "0.03em",
                        color: active ? "#fff" : "var(--bs-body-color, #111827)",
                        opacity: active ? 1 : 0.65,
                        cursor: active ? "default" : "pointer",
                        transition: "color 0.25s ease, opacity 0.25s ease",
                      }}
                    >
                      <i
                        className={`fa-solid ${opt.icon}`}
                        style={{
                          fontSize: 11,
                          color: active && opt.value === "admin" ? "#fde68a" : "inherit",
                        }}
                      />
                      <span>{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="sidebar-actions">
              <ThemeToggle id="sidebarThemeToggleBtn" />
              <button
                type="button"
                onClick={handleLogout}
                className="btn btn-sm btn-outline-danger sidebar-logout-btn"
                title="Sign out of RetailSphere"
              >
                <i className="fa-solid fa-arrow-right-from-bracket" />
                <span>Sign Out</span>
              </button>
            </div>
          </>
        ) : (
          <div className="sidebar-actions">
            <Link
              to="/login"
              onClick={handleLinkClick}
              className="btn btn-sm btn-outline-primary"
              style={{ flex: 1, textAlign: "center" }}
            >
              Sign In
            </Link>
            <Link
              to="/register"
              onClick={handleLinkClick}
              className="btn btn-sm btn-primary"
              style={{ flex: 1, textAlign: "center" }}
            >
              Register
            </Link>
          </div>
        )}
      </div>
    </aside>
  );
}
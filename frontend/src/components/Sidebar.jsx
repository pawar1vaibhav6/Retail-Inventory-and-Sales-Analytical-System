import React from "react";
import { NavLink, Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import ThemeToggle from "./ThemeToggle";

const ADMIN_ONLY_PATHS = ["/products", "/analytics", "/charts", "/admin/policies", "/admin/roles"];

const roleStyles = {
  admin: {
    bg: "linear-gradient(135deg, #7c3aed, #db2777)",
    glow: "rgba(124,58,237,0.45)",
    icon: "#fde68a",
    iconClass: "fa-shield-halved",
    title: "System Admin",
  },
  cashier: {
    bg: "linear-gradient(135deg, #0ea5e9, #10b981)",
    glow: "rgba(14,165,233,0.4)",
    icon: "#ffffff",
    iconClass: "fa-cash-register",
    title: "Store Cashier",
  },
  store_supervisor: {
    bg: "linear-gradient(135deg, #f59e0b, #d97706)",
    glow: "rgba(245,158,11,0.4)",
    icon: "#ffffff",
    iconClass: "fa-user-tie",
    title: "Store Supervisor",
  },
  store_executive: {
    bg: "linear-gradient(135deg, #0284c7, #0369a1)",
    glow: "rgba(2,132,199,0.4)",
    icon: "#ffffff",
    iconClass: "fa-clipboard-check",
    title: "Store Executive",
  },
  warehouse_picker: {
    bg: "linear-gradient(135deg, #2563eb, #4f46e5)",
    glow: "rgba(37,99,235,0.4)",
    icon: "#ffffff",
    iconClass: "fa-dolly",
    title: "DC Warehouse Picker",
  },
  category_manager: {
    bg: "linear-gradient(135deg, #059669, #0d9488)",
    glow: "rgba(5,150,105,0.4)",
    icon: "#ffffff",
    iconClass: "fa-chart-line",
    title: "Category Manager",
  },
  accounts: {
    bg: "linear-gradient(135deg, #0d9488, #115e59)",
    glow: "rgba(13,148,136,0.4)",
    icon: "#ffffff",
    iconClass: "fa-file-invoice-dollar",
    title: "Accounts Officer",
  },
  default: {
    bg: "linear-gradient(135deg, #64748b, #475569)",
    glow: "rgba(100,116,139,0.35)",
    icon: "#ffffff",
    iconClass: "fa-user",
    title: "Staff Member",
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

  const role = user?.role || "cashier";
  const rs = roleStyles[role] || roleStyles.default;
  const isAdmin = role === "admin";

  const handleRoleSwitch = (nextRole) => {
    if (nextRole === role) return;
    if (typeof switchRole === "function") switchRole(nextRole);
    if (nextRole !== "admin" && ADMIN_ONLY_PATHS.includes(location.pathname)) {
      navigate("/dashboard");
    }
  };

  const toggleOptions = [
    { value: "cashier", label: "Cashier", icon: "fa-cash-register" },
    { value: "store_executive", label: "Store Executive", icon: "fa-clipboard-check" },
    { value: "store_supervisor", label: "Store Supervisor", icon: "fa-user-tie" },
    { value: "warehouse_picker", label: "DC Picker", icon: "fa-dolly" },
    { value: "category_manager", label: "Category Mgr", icon: "fa-chart-line" },
    { value: "accounts", label: "Accounts Officer", icon: "fa-file-invoice-dollar" },
    { value: "admin", label: "System Admin", icon: "fa-shield-halved" },
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

              {/* Phase 2: Batch Stock & Logistics */}
              {(isAdmin || role === "warehouse_picker" || role === "category_manager" || role === "store_supervisor" || role === "store_executive") && (
                <>
                  <div
                    className="sidebar-section-label"
                    style={{ marginTop: "0.85rem" }}
                  >
                    Batch Stock &amp; Logistics
                  </div>
                  {(isAdmin || role === "warehouse_picker") && (
                    <NavLink
                      to="/grn/inward"
                      onClick={handleLinkClick}
                      className={({ isActive }) =>
                        `sidebar-nav-item ${isActive ? "active" : ""}`
                      }
                    >
                      <i className="fa-solid fa-truck-ramp-box" />
                      <span>DC GRN Inward</span>
                    </NavLink>
                  )}
                  {(isAdmin || role === "category_manager" || role === "store_supervisor" || role === "store_executive") && (
                    <NavLink
                      to="/inventory/batches"
                      onClick={handleLinkClick}
                      className={({ isActive }) =>
                        `sidebar-nav-item ${isActive ? "active" : ""}`
                      }
                    >
                      <i className="fa-solid fa-layer-group" />
                      <span>Batch Ledger</span>
                    </NavLink>
                  )}
                  {(isAdmin || role === "category_manager" || role === "store_supervisor" || role === "warehouse_picker") && (
                    <NavLink
                      to="/inventory/traceability"
                      onClick={handleLinkClick}
                      className={({ isActive }) =>
                        `sidebar-nav-item ${isActive ? "active" : ""}`
                      }
                    >
                      <i className="fa-solid fa-route" />
                      <span>Traceability</span>
                    </NavLink>
                  )}
                  {(isAdmin || role === "store_supervisor" || role === "category_manager" || role === "store_executive") && (
                    <NavLink
                      to="/replenishment/requests"
                      onClick={handleLinkClick}
                      className={({ isActive }) =>
                        `sidebar-nav-item ${isActive ? "active" : ""}`
                      }
                    >
                      <i className="fa-solid fa-boxes-packing" />
                      <span>Replenishment</span>
                    </NavLink>
                  )}
                  {(isAdmin || role === "warehouse_picker") && (
                    <NavLink
                      to="/replenishment/picking"
                      onClick={handleLinkClick}
                      className={({ isActive }) =>
                        `sidebar-nav-item ${isActive ? "active" : ""}`
                      }
                    >
                      <i className="fa-solid fa-list-check" />
                      <span>FEFO Pick List</span>
                    </NavLink>
                  )}
                  {(isAdmin || role === "category_manager" || role === "store_supervisor" || role === "store_executive") && (
                    <NavLink
                      to="/reports/expiry"
                      onClick={handleLinkClick}
                      className={({ isActive }) =>
                        `sidebar-nav-item ${isActive ? "active" : ""}`
                      }
                    >
                      <i className="fa-solid fa-calendar-xmark" />
                      <span>Expiry Stock Report</span>
                    </NavLink>
                  )}
                  {(isAdmin || role === "category_manager" || role === "store_supervisor") && (
                    <NavLink
                      to="/reports/transfers"
                      onClick={handleLinkClick}
                      className={({ isActive }) =>
                        `sidebar-nav-item ${isActive ? "active" : ""}`
                      }
                    >
                      <i className="fa-solid fa-shuffle" />
                      <span>Transfer Advice</span>
                    </NavLink>
                  )}
                </>
              )}

              {/* Phase 4 Store Operations */}
              {(isAdmin || role === "store_supervisor" || role === "store_executive" || role === "category_manager") && (
                <>
                  <div
                    className="sidebar-section-label"
                    style={{ marginTop: "0.85rem" }}
                  >
                    Store Operations
                  </div>
                  {(isAdmin || role === "store_supervisor" || role === "store_executive") && (
                    <NavLink
                      to="/audits/code-management"
                      onClick={handleLinkClick}
                      className={({ isActive }) =>
                        `sidebar-nav-item ${isActive ? "active" : ""}`
                      }
                    >
                      <i className="fa-solid fa-clipboard-check" />
                      <span>Code Audits</span>
                    </NavLink>
                  )}
                  <NavLink
                    to="/markdowns/promotions"
                    onClick={handleLinkClick}
                    className={({ isActive }) =>
                      `sidebar-nav-item ${isActive ? "active" : ""}`
                    }
                  >
                    <i className="fa-solid fa-tags" />
                    <span>Markdowns &amp; Push</span>
                  </NavLink>

                  <NavLink
                    to="/returns/expiry"
                    onClick={handleLinkClick}
                    className={({ isActive }) =>
                      `sidebar-nav-item ${isActive ? "active" : ""}`
                    }
                  >
                    <i className="fa-solid fa-arrow-rotate-left" />
                    <span>Expiry Returns</span>
                  </NavLink>

                  <NavLink
                    to="/returns/scrap-ledger"
                    onClick={handleLinkClick}
                    className={({ isActive }) =>
                      `sidebar-nav-item ${isActive ? "active" : ""}`
                    }
                  >
                    <i className="fa-solid fa-dumpster" />
                    <span>Scrap Ledger</span>
                  </NavLink>
                </>
              )}

              {/* Finance & Control */}
              {(isAdmin || role === "accounts" || role === "store_supervisor") && (
                <>
                  <div
                    className="sidebar-section-label"
                    style={{ marginTop: "0.85rem" }}
                  >
                    Finance &amp; Control
                  </div>
                  <NavLink
                    to="/finance/debit-notes"
                    onClick={handleLinkClick}
                    className={({ isActive }) =>
                      `sidebar-nav-item ${isActive ? "active" : ""}`
                    }
                  >
                    <i className="fa-solid fa-file-invoice-dollar" />
                    <span>Debit Notes</span>
                  </NavLink>
                </>
              )}

              {/* Governance & Approvals */}
              {(isAdmin || role === "store_supervisor" || role === "category_manager" || role === "store_executive" || role === "accounts") && (
                <>
                  <div
                    className="sidebar-section-label"
                    style={{ marginTop: "0.85rem" }}
                  >
                    Governance &amp; Approvals
                  </div>
                  <NavLink
                    to="/governance/approvals"
                    onClick={handleLinkClick}
                    className={({ isActive }) =>
                      `sidebar-nav-item ${isActive ? "active" : ""}`
                    }
                  >
                    <i className="fa-solid fa-inbox" />
                    <span>Approvals Inbox</span>
                  </NavLink>
                </>
              )}

              {/* Phase 1 Enterprise & Governance */}
              {(isAdmin || role === "category_manager" || role === "accounts") && (
                <>
                  <div
                    className="sidebar-section-label"
                    style={{ marginTop: "0.85rem" }}
                  >
                    Enterprise &amp; Governance
                  </div>
                  {(isAdmin || role === "category_manager") && (
                    <NavLink
                      to="/admin/policies"
                      onClick={handleLinkClick}
                      className={({ isActive }) =>
                        `sidebar-nav-item ${isActive ? "active" : ""}`
                      }
                    >
                      <i className="fa-solid fa-sliders" />
                      <span>Policy Settings</span>
                    </NavLink>
                  )}
                  <NavLink
                    to="/admin/supplier-terms"
                    onClick={handleLinkClick}
                    className={({ isActive }) =>
                      `sidebar-nav-item ${isActive ? "active" : ""}`
                    }
                  >
                    <i className="fa-solid fa-handshake" />
                    <span>Supplier Terms</span>
                  </NavLink>
                  {isAdmin && (
                    <NavLink
                      to="/admin/roles"
                      onClick={handleLinkClick}
                      className={({ isActive }) =>
                        `sidebar-nav-item ${isActive ? "active" : ""}`
                      }
                    >
                      <i className="fa-solid fa-users-gear" />
                      <span>Roles &amp; Scoping</span>
                    </NavLink>
                  )}
                  {(isAdmin || role === "category_manager") && (
                    <NavLink
                      to="/admin/audit-log"
                      onClick={handleLinkClick}
                      className={({ isActive }) =>
                        `sidebar-nav-item ${isActive ? "active" : ""}`
                      }
                    >
                      <i className="fa-solid fa-clipboard-list" />
                      <span>Audit Log</span>
                    </NavLink>
                  )}
                  {(isAdmin || role === "category_manager" || role === "store_supervisor") && (
                    <NavLink
                      to="/settings/notifications"
                      onClick={handleLinkClick}
                      className={({ isActive }) =>
                        `sidebar-nav-item ${isActive ? "active" : ""}`
                      }
                    >
                      <i className="fa-solid fa-bell" />
                      <span>Notifications &amp; Alerts</span>
                    </NavLink>
                  )}
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
                gap: 10,
              }}
            >
              {/* User Header */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: "50%",
                      background: rs.bg,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#fff",
                      fontSize: 14,
                      boxShadow: `0 2px 8px ${rs.glow}`
                    }}
                  >
                    <i className={`fa-solid ${rs.iconClass}`} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.2 }}>{user.username}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{rs.title}</div>
                  </div>
                </div>
                {user.store_id && (
                  <span
                    className="badge badge-secondary"
                    style={{ fontSize: 10, padding: "2px 6px" }}
                    title={`Assigned to Location #${user.store_id}`}
                  >
                    Loc #{user.store_id}
                  </span>
                )}
              </div>

              {/* Persona / Role Selector */}
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", fontWeight: 700 }}>
                  Switch Role Persona:
                </label>
                <select
                  value={role}
                  onChange={(e) => handleRoleSwitch(e.target.value)}
                  className="form-control"
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    padding: "4px 8px",
                    borderRadius: 8,
                    background: "rgba(0,0,0,0.15)",
                    color: "inherit"
                  }}
                >
                  {toggleOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
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
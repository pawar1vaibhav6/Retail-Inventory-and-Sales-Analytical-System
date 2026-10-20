import React from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ThemeToggle from './ThemeToggle';

export default function Sidebar({ isOpen, onClose }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = (e) => {
    e.preventDefault();
    if (onClose) onClose();
    logout();
    navigate('/login');
  };

  const handleLinkClick = () => {
    if (onClose) onClose();
  };

  return (
    <aside
      id="app-sidebar"
      className={`app-sidebar ${isOpen ? 'open' : ''}`}
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
                className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}
              >
                <i className="fa-solid fa-gauge" />
                <span>Dashboard</span>
              </NavLink>

              <NavLink
                to="/pos"
                onClick={handleLinkClick}
                className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}
              >
                <i className="fa-solid fa-cash-register" />
                <span>POS Billing</span>
              </NavLink>

              {user.role === 'admin' && (
                <NavLink
                  to="/products"
                  onClick={handleLinkClick}
                  className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}
                >
                  <i className="fa-solid fa-boxes-stacked" />
                  <span>Inventory</span>
                </NavLink>
              )}

              <NavLink
                to="/customers"
                onClick={handleLinkClick}
                className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}
              >
                <i className="fa-solid fa-users" />
                <span>Customers</span>
              </NavLink>

              {user.role === 'admin' && (
                <>
                  <div className="sidebar-section-label" style={{ marginTop: '0.85rem' }}>
                    Reports &amp; Analytics
                  </div>
                  <NavLink
                    to="/analytics"
                    onClick={handleLinkClick}
                    className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}
                  >
                    <i className="fa-solid fa-chart-pie" />
                    <span>Analytics</span>
                  </NavLink>

                  <NavLink
                    to="/charts"
                    onClick={handleLinkClick}
                    className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}
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

      {/* Bottom Section: User Info, Theme Toggle & Logout */}
      <div className="sidebar-footer">
        {user ? (
          <>
            <div className="sidebar-user">
              <div className="sidebar-user-info">
                <span className={`role-badge role-${user.role || 'cashier'}`}>
                  <i
                    className={`fa-solid ${
                      user.role === 'admin' ? 'fa-shield-halved' : 'fa-cash-register'
                    }`}
                  />
                  {user.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : 'User'}
                </span>
                <span className="user-name" title={user.username}>
                  {user.username}
                </span>
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
              style={{ flex: 1, textAlign: 'center' }}
            >
              Sign In
            </Link>
            <Link
              to="/register"
              onClick={handleLinkClick}
              className="btn btn-sm btn-primary"
              style={{ flex: 1, textAlign: 'center' }}
            >
              Register
            </Link>
          </div>
        )}
      </div>
    </aside>
  );
}

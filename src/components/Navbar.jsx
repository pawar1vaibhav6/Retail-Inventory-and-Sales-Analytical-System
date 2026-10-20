import React from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ThemeToggle from './ThemeToggle';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = (e) => {
    e.preventDefault();
    logout();
    navigate('/login');
  };

  return (
    <header className="navbar">
      <div className="nav-container">
        <Link to="/" className="nav-brand">
          <div className="brand-icon">
            <i className="fa-solid fa-chart-line" />
          </div>
          <div className="brand-text">
            <span className="brand-title">RetailSphere</span>
            <span className="brand-subtitle">Inventory &amp; Sales Analytical System</span>
          </div>
        </Link>

        {user && (
          <nav className="nav-menu">
            <NavLink
              to="/dashboard"
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <i className="fa-solid fa-gauge" />
              <span>Dashboard</span>
            </NavLink>

            <NavLink
              to="/pos"
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <i className="fa-solid fa-cash-register" />
              <span>POS Billing</span>
            </NavLink>

            {user.role === 'admin' && (
              <NavLink
                to="/products"
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              >
                <i className="fa-solid fa-boxes-stacked" />
                <span>Inventory</span>
              </NavLink>
            )}

            <NavLink
              to="/customers"
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <i className="fa-solid fa-users" />
              <span>Customers</span>
            </NavLink>

            {user.role === 'admin' && (
              <>
                <NavLink
                  to="/analytics"
                  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                >
                  <i className="fa-solid fa-chart-pie" />
                  <span>Analytics</span>
                </NavLink>

                <NavLink
                  to="/charts"
                  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                >
                  <i className="fa-solid fa-chart-column" />
                  <span>Charts</span>
                </NavLink>
              </>
            )}
          </nav>
        )}

        <div className="nav-actions">
          <ThemeToggle />

          {user ? (
            <>
              <div className="user-pill">
                <span className={`role-badge role-${user.role}`}>
                  <i className={`fa-solid ${user.role === 'admin' ? 'fa-shield-halved' : 'fa-cash-register'}`} />
                  {user.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : 'User'}
                </span>
                <span className="user-name">{user.username}</span>
              </div>

              <button
                type="button"
                onClick={handleLogout}
                className="btn btn-sm btn-outline-danger"
                title="Sign out of RetailSphere"
              >
                <i className="fa-solid fa-arrow-right-from-bracket" />
                <span className="d-none d-md-inline" style={{ marginLeft: 4 }}>Sign Out</span>
              </button>
            </>
          ) : (
            <div className="auth-nav-links">
              <Link to="/login" className="btn btn-sm btn-outline-primary">Sign In</Link>
              <Link to="/register" className="btn btn-sm btn-primary" style={{ marginLeft: 8 }}>Register</Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

import React, { useState, useEffect } from 'react';
import { Outlet, useLocation, Link } from 'react-router-dom';
import Sidebar from './Sidebar';
import Footer from './Footer';
import ThemeToggle from './ThemeToggle';

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Close mobile drawer on Escape key press
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && mobileOpen) {
        setMobileOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileOpen]);

  // Prevent body scroll when mobile drawer is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  return (
    <div className="app-shell">
      {/* Mobile Top Header - visible below 768px */}
      <header className="mobile-topbar" aria-label="Mobile header">
        <button
          type="button"
          className="mobile-menu-btn"
          onClick={() => setMobileOpen((prev) => !prev)}
          aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={mobileOpen}
          aria-controls="app-sidebar"
        >
          <i className="fa-solid fa-bars" />
        </button>

        <Link to="/" className="mobile-brand" onClick={() => setMobileOpen(false)}>
          <div className="brand-icon small">
            <i className="fa-solid fa-chart-line" />
          </div>
          <span className="brand-title">RetailSphere</span>
        </Link>

        <div className="mobile-topbar-actions">
          <ThemeToggle id="mobileThemeToggleBtn" />
        </div>
      </header>

      {/* Backdrop for mobile drawer */}
      <div
        className={`sidebar-backdrop ${mobileOpen ? 'active' : ''}`}
        onClick={() => setMobileOpen(false)}
        aria-hidden="true"
      />

      {/* Left Sidebar */}
      <Sidebar isOpen={mobileOpen} onClose={() => setMobileOpen(false)} />

      {/* Main Content Area */}
      <div className="app-content-wrapper">
        <main className="app-main" id="main-content">
          <Outlet />
        </main>
        <Footer />
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [showPassword, setShowPassword] = useState(false);
  const [alert, setAlert] = useState(null);
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleDemoFill = async (u, p, roleTitle = '') => {
    setUsername(u);
    setPassword(p);
    setLoading(true);
    setAlert({
      type: 'info',
      message: `Signing in as ${roleTitle || u} (${u})...`
    });
    try {
      const res = await login(u, p);
      if (res.success) {
        navigate('/dashboard');
      } else {
        setAlert({ type: 'danger', message: res.message });
      }
    } catch (err) {
      setAlert({ type: 'danger', message: err.message || 'Login failed.' });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setAlert(null);
    try {
      const res = await login(username, password);
      if (res.success) {
        navigate('/dashboard');
      } else {
        setAlert({ type: 'danger', message: res.message });
      }
    } catch (err) {
      setAlert({ type: 'danger', message: err.message || 'Login failed.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        {/* Card Header */}
        <div className="auth-header">
          <div className="auth-icon-circle">
            <i className="fa-solid fa-lock" />
          </div>
          <h2>Welcome Back</h2>
          <p>Sign in to your RetailSphere portal</p>
        </div>

        {/* Quick Demo Fill Pills for all 7 roles */}
        <div className="demo-credentials-box">
          <span className="demo-title">
            <i className="fa-solid fa-bolt" /> One-Click Demo Logins (All 7 Roles):
          </span>
          <div className="demo-buttons" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            <button
              type="button"
              className="demo-pill admin-pill"
              onClick={() => handleDemoFill('admin', 'admin123', 'System Admin')}
              title="Full enterprise system access, master data & policies"
            >
              <i className="fa-solid fa-shield-halved" /> Admin
            </button>
            <button
              type="button"
              className="demo-pill supervisor-pill"
              onClick={() => handleDemoFill('supervisor', 'supervisor123', 'Store Supervisor')}
              title="Store audits, markdowns <= 25%, expiry returns & replenishment"
            >
              <i className="fa-solid fa-user-tie" /> Supervisor
            </button>
            <button
              type="button"
              className="demo-pill executive-pill"
              style={{ background: '#f0f9ff', color: '#0369a1', borderColor: '#bae6fd' }}
              onClick={() => handleDemoFill('executive', 'executive123', 'Store Executive')}
              title="Physical counts, markdown proposals, return drafting (Store-101)"
            >
              <i className="fa-solid fa-clipboard-check" /> Store Exec
            </button>
            <button
              type="button"
              className="demo-pill picker-pill"
              onClick={() => handleDemoFill('picker', 'picker123', 'DC Warehouse Picker')}
              title="Central DC inward GRN & FEFO replenishment picking"
            >
              <i className="fa-solid fa-dolly" /> DC Picker
            </button>
            <button
              type="button"
              className="demo-pill manager-pill"
              onClick={() => handleDemoFill('manager', 'manager123', 'Category Manager')}
              title="Cross-store reports, high markdowns > 25%, dump stock & transfers"
            >
              <i className="fa-solid fa-chart-line" /> Category Mgr
            </button>
            <button
              type="button"
              className="demo-pill accounts-pill"
              style={{ background: '#f0fdfa', color: '#0f766e', borderColor: '#99f6e4' }}
              onClick={() => handleDemoFill('accounts', 'accounts123', 'Accounts Officer')}
              title="Supplier debit notes & vendor credit reconciliation"
            >
              <i className="fa-solid fa-file-invoice-dollar" /> Accounts
            </button>
            <button
              type="button"
              className="demo-pill cashier-pill"
              onClick={() => handleDemoFill('cashier', 'cashier123', 'Store Cashier')}
              title="POS billing & barcode scanning with expiry defense"
            >
              <i className="fa-solid fa-cash-register" /> Cashier
            </button>
          </div>
        </div>

        {/* Feedback Alert */}
        {alert && (
          <div className={`alert alert-${alert.type}`}>
            <div className="alert-content">
              <i
                className={`fa-solid ${
                  alert.type === 'success'
                    ? 'fa-circle-check'
                    : alert.type === 'info'
                    ? 'fa-circle-info'
                    : 'fa-circle-exclamation'
                }`}
              />
              <span>{alert.message}</span>
            </div>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <div className="input-group">
              <span className="input-icon">
                <i className="fa-solid fa-user" />
              </span>
              <input
                type="text"
                id="username"
                className="form-control"
                placeholder="Enter your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
                autoFocus
              />
            </div>
          </div>

          <div className="form-group">
            <div className="label-row">
              <label htmlFor="password">Password</label>
            </div>
            <div className="input-group">
              <span className="input-icon">
                <i className="fa-solid fa-key" />
              </span>
              <input
                type={showPassword ? 'text' : 'password'}
                id="password"
                className="form-control"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                title="Toggle password visibility"
              >
                <i className={`fa-solid ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`} />
              </button>
            </div>
          </div>

          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? (
              <span>
                <i className="fa-solid fa-spinner fa-spin" /> Authenticating...
              </span>
            ) : (
              <span>
                <i className="fa-solid fa-right-to-bracket" /> Sign In
              </span>
            )}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            Need a new account? <Link to="/register" className="link-highlight">Register Here</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

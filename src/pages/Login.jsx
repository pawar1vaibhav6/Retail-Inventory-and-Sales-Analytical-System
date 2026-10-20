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

  const handleDemoFill = (u, p) => {
    setUsername(u);
    setPassword(p);
    setAlert({
      type: 'info',
      message: `Demo credentials for "${u}" loaded! Click "Sign In" below.`
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      const res = login(username, password);
      if (res.success) {
        navigate('/dashboard');
      } else {
        setAlert({ type: 'danger', message: res.message });
        setLoading(false);
      }
    }, 300);
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

        {/* Quick Demo Fill Pills */}
        <div className="demo-credentials-box">
          <span className="demo-title">
            <i className="fa-solid fa-bolt" /> Quick Demo Logins:
          </span>
          <div className="demo-buttons">
            <button
              type="button"
              className="demo-pill admin-pill"
              onClick={() => handleDemoFill('admin', 'admin123')}
            >
              <i className="fa-solid fa-user-shield" /> Admin
            </button>
            <button
              type="button"
              className="demo-pill cashier-pill"
              onClick={() => handleDemoFill('cashier', 'cashier123')}
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


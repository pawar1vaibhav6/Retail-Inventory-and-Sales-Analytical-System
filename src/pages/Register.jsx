import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Register() {
  const [username, setUsername] = useState('');
  const [role, setRole] = useState('cashier');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');

  const { register } = useAuth();
  const navigate = useNavigate();

  const isPasswordMatch = password && confirmPassword && password === confirmPassword;
  const isPasswordMismatch = password && confirmPassword && password !== confirmPassword;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!username.trim()) {
      setError('Please choose a username.');
      return;
    }
    if (password.length < 4) {
      setError('Password must be at least 4 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    const res = register(username, role);
    if (res.success) {
      navigate('/dashboard');
    } else {
      setError(res.message);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        {/* Header */}
        <div className="auth-header">
          <div className="auth-icon-circle accent">
            <i className="fa-solid fa-user-plus" />
          </div>
          <h2>Create Account</h2>
          <p>Register a new user in RetailSphere</p>
        </div>

        {error && (
          <div className="alert alert-danger mb-3">
            <div className="alert-content">
              <i className="fa-solid fa-circle-exclamation" />
              <span>{error}</span>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="reg-username">Username</label>
            <div className="input-group">
              <span className="input-icon">
                <i className="fa-solid fa-user" />
              </span>
              <input
                type="text"
                id="reg-username"
                className="form-control"
                placeholder="Choose a username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoFocus
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="reg-role">Assign Role</label>
            <div className="input-group">
              <span className="input-icon">
                <i className="fa-solid fa-id-badge" />
              </span>
              <select
                id="reg-role"
                className="form-control"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              >
                <option value="cashier">Cashier (Sales &amp; Invoicing)</option>
                <option value="admin">Admin (Inventory &amp; Analytics)</option>
              </select>
            </div>
            <small className="form-hint">Admins have full access; Cashiers have sales access.</small>
          </div>

          <div className="form-group">
            <label htmlFor="reg-password">Password</label>
            <div className="input-group">
              <span className="input-icon">
                <i className="fa-solid fa-lock" />
              </span>
              <input
                type="password"
                id="reg-password"
                className="form-control"
                placeholder="Create a password (min 4 characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="reg-confirm">Confirm Password</label>
            <div className="input-group">
              <span className="input-icon">
                <i className="fa-solid fa-check-double" />
              </span>
              <input
                type="password"
                id="reg-confirm"
                className="form-control"
                placeholder="Re-enter password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
            {isPasswordMatch && (
              <small className="form-hint text-success">
                <i className="fa-solid fa-check" /> Passwords match
              </small>
            )}
            {isPasswordMismatch && (
              <small className="form-hint text-danger">
                <i className="fa-solid fa-xmark" /> Passwords do not match
              </small>
            )}
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={isPasswordMismatch}
          >
            <i className="fa-solid fa-user-check" style={{ marginRight: 6 }} /> Register Account
          </button>
        </form>

        <div className="auth-footer">
          <p>
            Already have an account? <Link to="/login" className="link-highlight">Sign In</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

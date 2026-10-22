import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import POS from './pages/POS';
import Products from './pages/Products';
import Customers from './pages/Customers';
import Analytics from './pages/Analytics';
import Charts from './pages/Charts';
import Login from './pages/Login';
import Register from './pages/Register';

// Phase 1 Foundation Pages
import PolicySettings from './pages/PolicySettings';
import SupplierTerms from './pages/SupplierTerms';
import RolesPermissions from './pages/RolesPermissions';
import AuditLog from './pages/AuditLog';

function ProtectedRoute({ children, adminOnly = false, allowedRoles = [] }) {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (adminOnly && user.role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role) && user.role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

export default function App() {
  const { user } = useAuth();

  return (
    <BrowserRouter>
      <Routes>
        {/* Public Auth Routes */}
        <Route
          path="/login"
          element={user ? <Navigate to="/dashboard" replace /> : <Login />}
        />
        <Route
          path="/register"
          element={user ? <Navigate to="/dashboard" replace /> : <Register />}
        />

        {/* Main App Layout */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="pos" element={<POS />} />
          <Route
            path="products"
            element={
              <ProtectedRoute adminOnly>
                <Products />
              </ProtectedRoute>
            }
          />
          <Route path="customers" element={<Customers />} />
          <Route
            path="analytics"
            element={
              <ProtectedRoute adminOnly>
                <Analytics />
              </ProtectedRoute>
            }
          />
          <Route
            path="charts"
            element={
              <ProtectedRoute adminOnly>
                <Charts />
              </ProtectedRoute>
            }
          />

          {/* Phase 1 Foundation Pages */}
          <Route
            path="admin/policies"
            element={
              <ProtectedRoute allowedRoles={['admin', 'category_manager']}>
                <PolicySettings />
              </ProtectedRoute>
            }
          />
          <Route
            path="admin/policy-settings"
            element={
              <ProtectedRoute allowedRoles={['admin', 'category_manager']}>
                <PolicySettings />
              </ProtectedRoute>
            }
          />
          <Route
            path="admin/supplier-terms"
            element={
              <ProtectedRoute allowedRoles={['admin', 'category_manager', 'accounts']}>
                <SupplierTerms />
              </ProtectedRoute>
            }
          />
          <Route
            path="admin/roles"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <RolesPermissions />
              </ProtectedRoute>
            }
          />
          <Route
            path="admin/audit-log"
            element={
              <ProtectedRoute allowedRoles={['admin', 'category_manager']}>
                <AuditLog />
              </ProtectedRoute>
            }
          />
        </Route>

        {/* Catch-all route */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

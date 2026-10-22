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

// Phase 2 Batch Stock Pages
import GRNInward from './pages/GRNInward';
import BatchStockLedger from './pages/BatchStockLedger';
import BatchTraceability from './pages/BatchTraceability';

// Phase 3 FEFO & Replenishment Pages
import ReplenishmentRequests from './pages/ReplenishmentRequests';
import FEFOPickList from './pages/FEFOPickList';

// Phase 4 Intelligence, Audits, Markdowns & Governance Pages
import ExpiryReport from './pages/ExpiryReport';
import TransferSuggestions from './pages/TransferSuggestions';
import CodeManagementAudits from './pages/CodeManagementAudits';
import MarkdownsPushSale from './pages/MarkdownsPushSale';
import ApprovalsInbox from './pages/ApprovalsInbox';

// Phase 5 Returns, Scrap & Debit Notes Pages
import ExpiryReturns from './pages/ExpiryReturns';
import ScrapLedger from './pages/ScrapLedger';
import DebitNotes from './pages/DebitNotes';

// Phase 6 Notifications & Expiry Alerts Page
import NotificationPreferences from './pages/NotificationPreferences';

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

          {/* Phase 3 FEFO & Replenishment Pages */}
          <Route
            path="replenishment/requests"
            element={
              <ProtectedRoute allowedRoles={['admin', 'store_supervisor', 'store_executive', 'category_manager']}>
                <ReplenishmentRequests />
              </ProtectedRoute>
            }
          />
          <Route
            path="replenishment/picking"
            element={
              <ProtectedRoute allowedRoles={['admin', 'warehouse_picker']}>
                <FEFOPickList />
              </ProtectedRoute>
            }
          />

          {/* Phase 4 Intelligence, Audits, Markdowns & Approvals */}
          <Route
            path="reports/expiry"
            element={
              <ProtectedRoute allowedRoles={['admin', 'category_manager', 'store_supervisor', 'store_executive']}>
                <ExpiryReport />
              </ProtectedRoute>
            }
          />
          <Route
            path="reports/transfers"
            element={
              <ProtectedRoute allowedRoles={['admin', 'category_manager', 'store_supervisor']}>
                <TransferSuggestions />
              </ProtectedRoute>
            }
          />
          <Route
            path="audits/code-management"
            element={
              <ProtectedRoute allowedRoles={['admin', 'store_supervisor', 'store_executive']}>
                <CodeManagementAudits />
              </ProtectedRoute>
            }
          />
          <Route
            path="markdowns/promotions"
            element={
              <ProtectedRoute allowedRoles={['admin', 'category_manager', 'store_supervisor', 'store_executive']}>
                <MarkdownsPushSale />
              </ProtectedRoute>
            }
          />
          <Route
            path="governance/approvals"
            element={
              <ProtectedRoute allowedRoles={['admin', 'store_supervisor', 'category_manager', 'store_executive', 'accounts']}>
                <ApprovalsInbox />
              </ProtectedRoute>
            }
          />

          {/* Phase 5 Returns, Scrap & Debit Notes */}
          <Route
            path="returns/expiry"
            element={
              <ProtectedRoute allowedRoles={['admin', 'category_manager', 'store_supervisor', 'store_executive', 'accounts']}>
                <ExpiryReturns />
              </ProtectedRoute>
            }
          />
          <Route
            path="returns/scrap-ledger"
            element={
              <ProtectedRoute allowedRoles={['admin', 'category_manager', 'store_supervisor', 'store_executive', 'accounts']}>
                <ScrapLedger />
              </ProtectedRoute>
            }
          />
          <Route
            path="finance/debit-notes"
            element={
              <ProtectedRoute allowedRoles={['admin', 'accounts', 'store_supervisor']}>
                <DebitNotes />
              </ProtectedRoute>
            }
          />

          {/* Phase 2 Batch Stock Pages */}
          <Route
            path="grn/inward"
            element={
              <ProtectedRoute allowedRoles={['admin', 'warehouse_picker']}>
                <GRNInward />
              </ProtectedRoute>
            }
          />
          <Route
            path="inventory/batches"
            element={
              <ProtectedRoute allowedRoles={['admin', 'category_manager', 'store_supervisor', 'store_executive']}>
                <BatchStockLedger />
              </ProtectedRoute>
            }
          />
          <Route
            path="inventory/traceability"
            element={
              <ProtectedRoute allowedRoles={['admin', 'category_manager', 'store_supervisor', 'warehouse_picker']}>
                <BatchTraceability />
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
          <Route
            path="settings/notifications"
            element={
              <ProtectedRoute allowedRoles={['admin', 'category_manager', 'store_supervisor']}>
                <NotificationPreferences />
              </ProtectedRoute>
            }
          />
          <Route
            path="admin/notifications"
            element={
              <ProtectedRoute allowedRoles={['admin', 'category_manager', 'store_supervisor']}>
                <NotificationPreferences />
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

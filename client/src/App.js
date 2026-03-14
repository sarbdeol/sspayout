import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Sidebar from './components/shared/Sidebar';
import Login from './pages/Login';
import AdminDashboard from './pages/admin/Dashboard';
import AgentsPage from './pages/admin/Agents';
import MerchantsPage from './pages/admin/Merchants';
import AdminPayments from './pages/admin/Payments';
import AdminSettlements from './pages/admin/Settlements';
import MerchantDashboard from './pages/merchant/Dashboard';
import MerchantPayments from './pages/merchant/Payments';
import MerchantLedger from './pages/merchant/Ledger';
import MerchantSettlements from './pages/merchant/Settlements';
import './index.css';

function ProtectedLayout({ children, role }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}><div className="spinner" style={{ width: 40, height: 40 }}></div></div>;
  if (!user) return <Navigate to="/login" />;
  if (role && user.role !== role) return <Navigate to="/login" />;
  return (
    <div className="layout">
      <Sidebar />
      <div className="main-content">{children}</div>
    </div>
  );
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to={user.role === 'superadmin' ? '/admin/dashboard' : '/merchant/dashboard'} />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
          <Route path="/" element={<Navigate to="/login" />} />

          {/* Admin routes */}
          <Route path="/admin/dashboard" element={<ProtectedLayout role="superadmin"><AdminDashboard /></ProtectedLayout>} />
          <Route path="/admin/agents" element={<ProtectedLayout role="superadmin"><AgentsPage /></ProtectedLayout>} />
          <Route path="/admin/merchants" element={<ProtectedLayout role="superadmin"><MerchantsPage /></ProtectedLayout>} />
          <Route path="/admin/payments" element={<ProtectedLayout role="superadmin"><AdminPayments /></ProtectedLayout>} />
          <Route path="/admin/settlements" element={<ProtectedLayout role="superadmin"><AdminSettlements /></ProtectedLayout>} />

          {/* Merchant routes */}
          <Route path="/merchant/dashboard" element={<ProtectedLayout role="merchant"><MerchantDashboard /></ProtectedLayout>} />
          <Route path="/merchant/payments" element={<ProtectedLayout role="merchant"><MerchantPayments /></ProtectedLayout>} />
          <Route path="/merchant/ledger" element={<ProtectedLayout role="merchant"><MerchantLedger /></ProtectedLayout>} />
          <Route path="/merchant/settlements" element={<ProtectedLayout role="merchant"><MerchantSettlements /></ProtectedLayout>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

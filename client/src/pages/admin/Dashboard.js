import React, { useEffect, useState } from 'react';
import { adminAPI } from '../../services/api';
import { formatAmount, formatDate } from '../../components/shared/StatusBadge';
import StatusBadge from '../../components/shared/StatusBadge';

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [recentPayments, setRecentPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      adminAPI.getStats(),
      adminAPI.getPayments({ limit: 8, page: 1 })
    ]).then(([s, p]) => {
      setStats(s.data.stats);
      setRecentPayments(p.data.payments);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading-overlay"><div className="spinner" style={{ width: 32, height: 32 }}></div></div>;

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">Dashboard</div>
        <div className="page-subtitle">Payment gateway overview</div>
      </div>

      <div className="stats-grid">
        <div className="stat-card accent">
          <div className="stat-icon">⇄</div>
          <div className="stat-label">Total Payments</div>
          <div className="stat-value">{parseInt(stats?.total_payments || 0).toLocaleString()}</div>
          <div className="stat-sub">{stats?.confirmed} confirmed</div>
        </div>
        <div className="stat-card success">
          <div className="stat-icon">₹</div>
          <div className="stat-label">Total Volume</div>
          <div className="stat-value" style={{ fontSize: 20 }}>{formatAmount(stats?.total_volume)}</div>
          <div className="stat-sub">Confirmed payments</div>
        </div>
        <div className="stat-card warning">
          <div className="stat-icon">◎</div>
          <div className="stat-label">Platform Fees</div>
          <div className="stat-value" style={{ fontSize: 20 }}>{formatAmount(stats?.total_platform_fees)}</div>
          <div className="stat-sub">Net profit</div>
        </div>
        <div className="stat-card danger">
          <div className="stat-icon">⏳</div>
          <div className="stat-label">Pending</div>
          <div className="stat-value">{parseInt(stats?.pending || 0)}</div>
          <div className="stat-sub">{stats?.failed} failed</div>
        </div>
        <div className="stat-card accent">
          <div className="stat-icon">◈</div>
          <div className="stat-label">Merchants</div>
          <div className="stat-value">{stats?.total_merchants}</div>
          <div className="stat-sub">Active accounts</div>
        </div>
        <div className="stat-card success">
          <div className="stat-icon">⬡</div>
          <div className="stat-label">Agents</div>
          <div className="stat-value">{stats?.total_agents}</div>
          <div className="stat-sub">Active integrations</div>
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Recent Payments</div>
          <a href="/admin/payments" className="btn btn-secondary btn-sm">View All</a>
        </div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Reference</th>
                <th>Merchant</th>
                <th>Agent</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {recentPayments.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No payments yet</td></tr>
              ) : recentPayments.map(p => (
                <tr key={p.id}>
                  <td className="td-primary mono" style={{ fontFamily: 'DM Mono, monospace', fontSize: 12 }}>{p.reference_id || p.order_id}</td>
                  <td>{p.merchant_name}</td>
                  <td>{p.agent_name || '-'}</td>
                  <td className="amount">{formatAmount(p.amount)}</td>
                  <td><StatusBadge status={p.status} /></td>
                  <td>{formatDate(p.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

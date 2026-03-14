import React, { useEffect, useState } from 'react';
import { merchantAPI } from '../../services/api';
import StatusBadge, { formatAmount, formatDate } from '../../components/shared/StatusBadge';

export default function MerchantSettlements() {
  const [settlements, setSettlements] = useState([]);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = () => {
    Promise.all([merchantAPI.getSettlements(), merchantAPI.getBalance()])
      .then(([s, b]) => { setSettlements(s.data.settlements); setBalance(b.data.balance); })
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <div className="page-title">Settlements</div>
            <div className="page-subtitle">Your settlement history</div>
          </div>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '12px 20px', textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Available Balance</div>
            <div className="amount-positive" style={{ fontSize: 22, fontWeight: 800 }}>{formatAmount(balance)}</div>
          </div>
        </div>
      </div>

      <div style={{ background: 'var(--info-bg)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 'var(--radius-sm)', padding: '14px 16px', marginBottom: 24, fontSize: 13, color: 'var(--info)' }}>
        ℹ️ To request a settlement, please contact your administrator. They will process your settlement request directly.
      </div>

      <div className="card">
        {loading ? <div className="loading-overlay"><div className="spinner"></div></div> : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Amount</th>
                  <th>Bank</th>
                  <th>Account</th>
                  <th>Status</th>
                  <th>Notes</th>
                  <th>Requested</th>
                  <th>Processed</th>
                </tr>
              </thead>
              <tbody>
                {settlements.length === 0 ? (
                  <tr><td colSpan={7}><div className="empty-state"><div className="empty-state-icon">◎</div><div className="empty-state-text">No settlement records yet</div></div></td></tr>
                ) : settlements.map(s => (
                  <tr key={s.id}>
                    <td className="amount">{formatAmount(s.amount)}</td>
                    <td>{s.bank_name || '-'}</td>
                    <td style={{ fontFamily: 'DM Mono, monospace', fontSize: 11 }}>{s.account_number || '-'}</td>
                    <td><StatusBadge status={s.status} /></td>
                    <td>{s.notes || '-'}</td>
                    <td>{formatDate(s.created_at)}</td>
                    <td>{s.processed_at ? formatDate(s.processed_at) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

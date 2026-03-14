import React, { useEffect, useState } from 'react';
import { merchantAPI } from '../../services/api';
import StatusBadge, { formatAmount, formatDate } from '../../components/shared/StatusBadge';

export default function MerchantLedger() {
  const [ledger, setLedger] = useState([]);
  const [balance, setBalance] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ type: '', from: '', to: '' });

  const load = (p = 1) => {
    setLoading(true);
    merchantAPI.getLedger({ ...filters, page: p, limit: 20 })
      .then(r => { setLedger(r.data.ledger); setBalance(r.data.current_balance); setTotal(r.data.total); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(page); }, [page, filters]);

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <div className="page-title">Ledger</div>
            <div className="page-subtitle">Full accounting history</div>
          </div>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '12px 20px', textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Available Balance</div>
            <div className="amount-positive" style={{ fontSize: 22, fontWeight: 800 }}>{formatAmount(balance)}</div>
          </div>
        </div>
      </div>
      <div className="card">
        <div className="filter-bar">
          <select className="form-control" style={{ width: 160 }} value={filters.type} onChange={e => setFilters({ ...filters, type: e.target.value })}>
            <option value="">All Types</option>
            <option value="credit">Credit</option>
            <option value="debit">Debit</option>
            <option value="fee">Fee</option>
            <option value="settlement">Settlement</option>
            <option value="reversal">Reversal</option>
          </select>
          <input className="form-control" type="date" style={{ width: 150 }} value={filters.from} onChange={e => setFilters({ ...filters, from: e.target.value })} />
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>to</span>
          <input className="form-control" type="date" style={{ width: 150 }} value={filters.to} onChange={e => setFilters({ ...filters, to: e.target.value })} />
          <button className="btn btn-secondary btn-sm" onClick={() => setFilters({ type: '', from: '', to: '' })}>Clear</button>
        </div>
        {loading ? <div className="loading-overlay"><div className="spinner"></div></div> : (
          <>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Description</th>
                    <th>Order Ref</th>
                    <th>Amount</th>
                    <th>Balance After</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.length === 0 ? (
                    <tr><td colSpan={6}><div className="empty-state"><div className="empty-state-icon">▤</div><div className="empty-state-text">No ledger entries found</div></div></td></tr>
                  ) : ledger.map(l => (
                    <tr key={l.id}>
                      <td>{formatDate(l.created_at)}</td>
                      <td><StatusBadge status={l.type} /></td>
                      <td>{l.description || '-'}</td>
                      <td style={{ fontFamily: 'DM Mono, monospace', fontSize: 11 }}>{l.order_id || l.reference_id || '-'}</td>
                      <td className={l.type === 'credit' ? 'amount-positive' : l.type === 'fee' || l.type === 'settlement' ? 'amount-negative' : 'amount'}>
                        {l.type === 'credit' ? '+' : '-'}{formatAmount(l.amount)}
                      </td>
                      <td className="amount">{formatAmount(l.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="pagination">
                <div className="pagination-info">Page {page} of {totalPages} ({total} entries)</div>
                <div className="pagination-buttons">
                  <button className="btn btn-secondary btn-sm" disabled={page === 1} onClick={() => setPage(page - 1)}>← Prev</button>
                  <button className="btn btn-secondary btn-sm" disabled={page === totalPages} onClick={() => setPage(page + 1)}>Next →</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

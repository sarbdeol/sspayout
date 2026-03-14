import React, { useEffect, useState } from 'react';
import { adminAPI } from '../../services/api';
import StatusBadge, { formatAmount, formatDate } from '../../components/shared/StatusBadge';

export default function AdminPayments() {
  const [payments, setPayments] = useState([]);
  const [merchants, setMerchants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ status: '', merchant_id: '', from: '', to: '' });

  const load = (p = 1) => {
    setLoading(true);
    adminAPI.getPayments({ ...filters, page: p, limit: 20 })
      .then(r => { setPayments(r.data.payments); setTotal(r.data.total); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { adminAPI.getMerchants().then(r => setMerchants(r.data.merchants)); }, []);
  useEffect(() => { load(page); }, [page, filters]);

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">Payments</div>
        <div className="page-subtitle">Monitor all transactions across merchants</div>
      </div>

      <div className="card">
        <div className="filter-bar">
          <select className="form-control" style={{ width: 160 }} value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })}>
            <option value="">All Status</option>
            <option value="pending">Pending</option>
            <option value="awaiting_transfer">Awaiting Transfer</option>
            <option value="utr_submitted">UTR Submitted</option>
            <option value="confirmed">Confirmed</option>
            <option value="failed">Failed</option>
          </select>
          <select className="form-control" style={{ width: 180 }} value={filters.merchant_id} onChange={e => setFilters({ ...filters, merchant_id: e.target.value })}>
            <option value="">All Merchants</option>
            {merchants.map(m => <option key={m.id} value={m.id}>{m.merchant_name}</option>)}
          </select>
          <input className="form-control" type="date" style={{ width: 150 }} value={filters.from} onChange={e => setFilters({ ...filters, from: e.target.value })} />
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>to</span>
          <input className="form-control" type="date" style={{ width: 150 }} value={filters.to} onChange={e => setFilters({ ...filters, to: e.target.value })} />
          <button className="btn btn-secondary btn-sm" onClick={() => setFilters({ status: '', merchant_id: '', from: '', to: '' })}>Clear</button>
          <span style={{ color: 'var(--text-muted)', fontSize: 13, marginLeft: 'auto' }}>{total} results</span>
        </div>

        {loading ? <div className="loading-overlay"><div className="spinner"></div></div> : (
          <>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>Merchant</th>
                    <th>Agent</th>
                    <th>Amount</th>
                    <th>Merchant Gets</th>
                    <th>Platform Fee</th>
                    <th>UTR</th>
                    <th>Status</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.length === 0 ? (
                    <tr><td colSpan={9}><div className="empty-state"><div className="empty-state-icon">⇄</div><div className="empty-state-text">No payments found</div></div></td></tr>
                  ) : payments.map(p => (
                    <tr key={p.id}>
                      <td style={{ fontFamily: 'DM Mono, monospace', fontSize: 11 }}>{p.reference_id || '-'}</td>
                      <td className="td-primary">{p.merchant_name}</td>
                      <td>{p.agent_name || '-'}</td>
                      <td className="amount">{formatAmount(p.amount)}</td>
                      <td className="amount-positive">{formatAmount(p.merchant_credit_amount)}</td>
                      <td className="amount-positive" style={{ color: 'var(--accent)' }}>{formatAmount(p.platform_fee_amount)}</td>
                      <td style={{ fontFamily: 'DM Mono, monospace', fontSize: 11 }}>{p.utr || '-'}</td>
                      <td><StatusBadge status={p.status} /></td>
                      <td>{formatDate(p.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="pagination">
                <div className="pagination-info">Page {page} of {totalPages} ({total} total)</div>
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

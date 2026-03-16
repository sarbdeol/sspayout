import React, { useEffect, useState } from 'react';
import { merchantAPI } from '../../services/api';
import StatusBadge, { formatAmount, formatDate } from '../../components/shared/StatusBadge';

export default function MerchantPayments() {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ status: '', from: '', to: '' });
  const [utrModal, setUtrModal] = useState(false);
  const [selected, setSelected] = useState(null);
  const [utr, setUtr] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = (p = 1) => {
    setLoading(true);
    merchantAPI.getPayments({ ...filters, page: p, limit: 20 })
      .then(r => { setPayments(r.data.payments); setTotal(r.data.total); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(page); }, [page, filters]);

  const handleUTR = async () => {
    if (!utr) return;
    setError(''); setSaving(true);
    try {
      await merchantAPI.submitUTR(selected.id, { utr });
      setUtrModal(false); setUtr(''); load(page);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed');
    } finally { setSaving(false); }
  };

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">Transactions</div>
        <div className="page-subtitle">All your payment records</div>
      </div>
      <div className="card">
        <div className="filter-bar">
          <select className="form-control" style={{ width: 170 }} value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })}>
            <option value="">All Status</option>
            <option value="awaiting_transfer">Awaiting Transfer</option>
            <option value="utr_submitted">UTR Submitted</option>
            <option value="confirmed">Confirmed</option>
            <option value="failed">Failed</option>
          </select>
          <input className="form-control" type="date" style={{ width: 150 }} value={filters.from} onChange={e => setFilters({ ...filters, from: e.target.value })} />
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>to</span>
          <input className="form-control" type="date" style={{ width: 150 }} value={filters.to} onChange={e => setFilters({ ...filters, to: e.target.value })} />
          <button className="btn btn-secondary btn-sm" onClick={() => setFilters({ status: '', from: '', to: '' })}>Clear</button>
          <span style={{ color: 'var(--text-muted)', fontSize: 13, marginLeft: 'auto' }}>{total} records</span>
        </div>
        {loading ? <div className="loading-overlay"><div className="spinner"></div></div> : (
          <>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>Order ID</th>
                    <th>Amount</th>
                    <th>You Receive</th>
                    <th>Bank</th>
                    <th>Account</th>
                    <th>UTR</th>
                    <th>Status</th>
                    <th>Date</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.length === 0 ? (
                    <tr><td colSpan={10}><div className="empty-state"><div className="empty-state-icon">⇄</div><div className="empty-state-text">No transactions found</div></div></td></tr>
                  ) : payments.map(p => (
                    <tr key={p.id}>
                      <td style={{ fontFamily: 'DM Mono, monospace', fontSize: 11 }}>{p.reference_id || '-'}</td>
                      <td className="td-primary" style={{ fontFamily: 'DM Mono, monospace', fontSize: 12 }}>{p.order_id}</td>
                      <td className="amount">{formatAmount(p.amount)}</td>
                      <td className="amount-positive">{formatAmount(p.merchant_credit_amount)}</td>
                      <td>{p.bank_name || '-'}</td>
                      <td style={{ fontFamily: 'DM Mono, monospace', fontSize: 11 }}>{p.account_number || '-'}</td>
                      <td style={{ fontFamily: 'DM Mono, monospace', fontSize: 11 }}>{p.utr || '-'}</td>
                      <td><StatusBadge status={p.status} /></td>
                      <td>{formatDate(p.created_at)}</td>
                      <td>
                        {p.status === 'awaiting_transfer' && (
                          <button className="btn btn-primary btn-sm" onClick={() => { setSelected(p); setUtr(''); setError(''); setUtrModal(true); }}>Submit UTR</button>
                        )}
                      </td>
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

      {utrModal && selected && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setUtrModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">Submit UTR</div>
              <button className="modal-close" onClick={() => setUtrModal(false)}>×</button>
            </div>
            <div className="modal-body">
              {error && <div className="alert alert-error">{error}</div>}
              <div style={{ background: 'var(--bg-hover)', borderRadius: 'var(--radius-sm)', padding: '14px 16px', marginBottom: 18, fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}><span style={{ color: 'var(--text-muted)' }}>Bank:</span><strong>{selected.bank_name}</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}><span style={{ color: 'var(--text-muted)' }}>Account:</span><strong style={{ fontFamily: 'DM Mono, monospace' }}>{selected.account_number}</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-muted)' }}>Amount:</span><strong className="amount-positive">{formatAmount(selected.amount)}</strong></div>
              </div>
              <div className="form-group">
                <label className="form-label">UTR Number</label>
                <input className="form-control" placeholder="Enter UTR" value={utr} onChange={e => setUtr(e.target.value)} style={{ fontFamily: 'DM Mono, monospace' }} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setUtrModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleUTR} disabled={saving}>{saving ? 'Submitting...' : 'Submit UTR'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { adminAPI } from '../../services/api';
import StatusBadge, { formatAmount, formatDate } from '../../components/shared/StatusBadge';

export default function AdminSettlements() {
  const [settlements, setSettlements] = useState([]);
  const [merchants, setMerchants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [createModal, setCreateModal] = useState(false);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ status: '', notes: '' });
  const [createForm, setCreateForm] = useState({ merchant_id: '', amount: '', notes: '' });
  const [merchantBalance, setMerchantBalance] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const load = () => {
    setLoading(true);
    Promise.all([adminAPI.getSettlements({ status: filterStatus }), adminAPI.getMerchants()])
      .then(([s, m]) => { setSettlements(s.data.settlements); setMerchants(m.data.merchants); })
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [filterStatus]);

  const openUpdate = (s) => { setSelected(s); setForm({ status: s.status, notes: s.notes || '' }); setError(''); setModal(true); };

  const handleUpdate = async () => {
    setError(''); setSaving(true);
    try {
      await adminAPI.updateSettlement(selected.id, form);
      setModal(false); load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update');
    } finally { setSaving(false); }
  };

  const handleMerchantChange = async (merchantId) => {
    setCreateForm({ ...createForm, merchant_id: merchantId });
    if (merchantId) {
      const stats = await adminAPI.getMerchantStats(merchantId);
      setMerchantBalance(parseFloat(stats.data.stats.current_balance));
    } else {
      setMerchantBalance(null);
    }
  };

  const handleCreate = async () => {
    setError(''); setSaving(true);
    try {
      await adminAPI.createSettlement(createForm);
      setCreateModal(false); load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create settlement');
    } finally { setSaving(false); }
  };

  const filtered = settlements.filter(s => !filterStatus || s.status === filterStatus);

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <div className="page-title">Settlements</div>
            <div className="page-subtitle">Process merchant settlement requests</div>
          </div>
          <button className="btn btn-primary" onClick={() => { setCreateForm({ merchant_id: '', amount: '', notes: '' }); setMerchantBalance(null); setError(''); setCreateModal(true); }}>
            + New Settlement
          </button>
        </div>
      </div>

      <div className="card">
        <div className="filter-bar">
          <select className="form-control" style={{ width: 180 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">All Status</option>
            <option value="pending">Pending</option>
            <option value="processing">Processing</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </select>
          <span style={{ color: 'var(--text-muted)', fontSize: 13, marginLeft: 'auto' }}>{filtered.length} results</span>
        </div>
        {loading ? <div className="loading-overlay"><div className="spinner"></div></div> : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Merchant</th>
                  <th>Amount</th>
                  <th>Bank</th>
                  <th>Account</th>
                  <th>Status</th>
                  <th>Requested</th>
                  <th>Processed</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={8}><div className="empty-state"><div className="empty-state-icon">◎</div><div className="empty-state-text">No settlements found</div></div></td></tr>
                ) : filtered.map(s => (
                  <tr key={s.id}>
                    <td className="td-primary">{s.merchant_name}</td>
                    <td className="amount">{formatAmount(s.amount)}</td>
                    <td>{s.bank_name || '-'}</td>
                    <td style={{ fontFamily: 'DM Mono, monospace', fontSize: 12 }}>{s.account_number || '-'}</td>
                    <td><StatusBadge status={s.status} /></td>
                    <td>{formatDate(s.created_at)}</td>
                    <td>{s.processed_at ? formatDate(s.processed_at) : '-'}</td>
                    <td>
                      <button className="btn btn-secondary btn-sm" onClick={() => openUpdate(s)}>Update Status</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Update Status Modal */}
      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">Update Settlement Status</div>
              <button className="modal-close" onClick={() => setModal(false)}>×</button>
            </div>
            <div className="modal-body">
              {error && <div className="alert alert-error">{error}</div>}
              <div style={{ marginBottom: 16, padding: '12px 16px', background: 'var(--bg-hover)', borderRadius: 'var(--radius-sm)', fontSize: 13 }}>
                <strong>{selected?.merchant_name}</strong> — {formatAmount(selected?.amount)}
              </div>
              <div className="form-group">
                <label className="form-label">New Status</label>
                <select className="form-control" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                  <option value="pending">Pending</option>
                  <option value="processing">Processing</option>
                  <option value="completed">Completed</option>
                  <option value="failed">Failed</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Notes</label>
                <textarea className="form-control" rows={3} placeholder="Add notes..." value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleUpdate} disabled={saving}>{saving ? 'Saving...' : 'Update'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Create Settlement Modal */}
      {createModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setCreateModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">Create Settlement</div>
              <button className="modal-close" onClick={() => setCreateModal(false)}>×</button>
            </div>
            <div className="modal-body">
              {error && <div className="alert alert-error">{error}</div>}
              <div className="form-group">
                <label className="form-label">Select Merchant</label>
                <select className="form-control" value={createForm.merchant_id} onChange={e => handleMerchantChange(e.target.value)}>
                  <option value="">-- Select Merchant --</option>
                  {merchants.map(m => <option key={m.id} value={m.id}>{m.merchant_name}</option>)}
                </select>
              </div>
              {merchantBalance !== null && (
                <div style={{ padding: '10px 14px', background: 'var(--success-bg)', borderRadius: 'var(--radius-sm)', marginBottom: 16, fontSize: 13, color: 'var(--success)' }}>
                  Available Balance: <strong>{formatAmount(merchantBalance)}</strong>
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Amount</label>
                <input className="form-control" type="number" step="0.01" placeholder="0.00"
                  value={createForm.amount} onChange={e => setCreateForm({ ...createForm, amount: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Notes</label>
                <textarea className="form-control" rows={2} placeholder="Settlement notes..."
                  value={createForm.notes} onChange={e => setCreateForm({ ...createForm, notes: e.target.value })} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setCreateModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreate} disabled={saving}>{saving ? 'Creating...' : 'Create Settlement'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

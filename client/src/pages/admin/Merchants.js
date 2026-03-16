import React, { useEffect, useState } from 'react';
import { adminAPI } from '../../services/api';
import StatusBadge, { formatDate } from '../../components/shared/StatusBadge';

const EMPTY_FORM = {
  name: '', username: '', password: '', merchant_name: '',
  commission_rate: 7, agent_commission_rate: 5,
  settlement_bank_name: '', settlement_account: '', settlement_ifsc: ''
};

export default function MerchantsPage() {
  const [merchants, setMerchants] = useState([]);
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [assignModal, setAssignModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [selectedMerchant, setSelectedMerchant] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [assignForm, setAssignForm] = useState({ agent_id: '', is_primary: true });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [copiedId, setCopiedId] = useState(null);

  const load = () => {
    Promise.all([adminAPI.getMerchants(), adminAPI.getAgents()])
      .then(([m, a]) => { setMerchants(m.data.merchants); setAgents(a.data.agents); })
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setError(''); setModal(true); };
  const openEdit = (m) => {
    setEditing(m);
    setForm({
      name: m.name, username: m.username || '', password: '',
      merchant_name: m.merchant_name,
      commission_rate: m.commission_rate,
      agent_commission_rate: m.agent_commission_rate,
      settlement_bank_name: m.settlement_bank_name || '',
      settlement_account: m.settlement_account || '',
      settlement_ifsc: m.settlement_ifsc || ''
    });
    setError(''); setModal(true);
  };

  const openAssign = (m) => { setSelectedMerchant(m); setAssignForm({ agent_id: '', is_primary: true }); setError(''); setAssignModal(true); };

  const handleSave = async () => {
    setError(''); setSaving(true);
    try {
      if (editing) {
        const { name, username, password, ...rest } = form;
        await adminAPI.updateMerchant(editing.id, rest);
      } else {
        await adminAPI.createMerchant(form);
      }
      setModal(false); load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save');
    } finally { setSaving(false); }
  };

  const handleAssign = async () => {
    if (!assignForm.agent_id) { setError('Select an agent'); return; }
    setError(''); setSaving(true);
    try {
      await adminAPI.assignAgent(selectedMerchant.id, assignForm);
      setAssignModal(false); load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to assign agent');
    } finally { setSaving(false); }
  };

  const handleRemoveAgent = async (merchantId, agentId) => {
    if (!window.confirm('Remove this agent from merchant?')) return;
    await adminAPI.removeAgent(merchantId, agentId);
    load();
  };

  const handleToggle = async (id) => { await adminAPI.toggleMerchant(id); load(); };

  const handleCopyCreds = (m) => {
    const creds = `🔐 Login Credentials\n\nURL: https://ss.sspay.online\nUsername: ${m.username || m.name}\nPassword: ${m.plain_password || 'N/A'}`;
    navigator.clipboard.writeText(creds);
    setCopiedId(m.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const platformFee = (form.commission_rate - form.agent_commission_rate).toFixed(2);
  const filtered = merchants.filter(m =>
    m.merchant_name?.toLowerCase().includes(search.toLowerCase()) ||
    m.name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <div className="page-title">Merchants</div>
            <div className="page-subtitle">Create and manage merchant accounts</div>
          </div>
          <button className="btn btn-primary" onClick={openCreate}>+ Add Merchant</button>
        </div>
      </div>

      <div className="card">
        <div className="filter-bar">
          <input className="search-input" placeholder="Search merchants..." value={search} onChange={e => setSearch(e.target.value)} />
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{filtered.length} merchants</span>
        </div>
        {loading ? <div className="loading-overlay"><div className="spinner"></div></div> : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Merchant</th>
                  <th>Username</th>
                  <th>Commission</th>
                  <th>Agent Fee</th>
                  <th>Your Cut</th>
                  <th>Assigned Agents</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={8}><div className="empty-state"><div className="empty-state-icon">◈</div><div className="empty-state-text">No merchants found</div></div></td></tr>
                ) : filtered.map(m => (
                  <tr key={m.id}>
                    <td className="td-primary">{m.merchant_name}</td>
                    <td style={{ fontFamily: 'DM Mono, monospace', fontSize: 13 }}>{m.username || m.name}</td>
                    <td><span className="badge badge-warning">{m.commission_rate}%</span></td>
                    <td><span className="badge badge-muted">{m.agent_commission_rate}%</span></td>
                    <td><span className="badge badge-success">{(m.commission_rate - m.agent_commission_rate).toFixed(2)}%</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {(m.agents || []).map(a => (
                          <span key={a.id} className="tag">
                            {a.is_primary ? '★ ' : ''}{a.agent_name}
                            <span className="remove" onClick={() => handleRemoveAgent(m.id, a.id)}>×</span>
                          </span>
                        ))}
                        <button className="btn btn-secondary btn-sm" style={{ fontSize: 11 }} onClick={() => openAssign(m)}>+ Assign</button>
                      </div>
                    </td>
                    <td><StatusBadge status={m.is_active ? 'active' : 'inactive'} /></td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(m)}>Edit</button>
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ color: copiedId === m.id ? 'var(--success)' : 'var(--accent)' }}
                          onClick={() => handleCopyCreds(m)}
                        >
                          {copiedId === m.id ? '✓ Copied!' : '📋 Creds'}
                        </button>
                        <button className={`btn btn-sm ${m.is_active ? 'btn-danger' : 'btn-success'}`} onClick={() => handleToggle(m.id)}>
                          {m.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create/Edit Merchant Modal */}
      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div className="modal modal-lg">
            <div className="modal-header">
              <div className="modal-title">{editing ? 'Edit Merchant' : 'Create New Merchant'}</div>
              <button className="modal-close" onClick={() => setModal(false)}>×</button>
            </div>
            <div className="modal-body">
              {error && <div className="alert alert-error">{error}</div>}

              {!editing && (
                <>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Account Details</div>
                  <div className="form-group">
                    <label className="form-label">Full Name *</label>
                    <input className="form-control" placeholder="John Doe" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Username *</label>
                      <input className="form-control" placeholder="e.g. sarbtech" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Password *</label>
                      <input className="form-control" type="text" placeholder="Enter password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
                    </div>
                  </div>
                  <hr className="section-divider" />
                </>
              )}

              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Merchant Details</div>
              <div className="form-group">
                <label className="form-label">Business Name *</label>
                <input className="form-control" placeholder="Acme Store" value={form.merchant_name} onChange={e => setForm({ ...form, merchant_name: e.target.value })} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Merchant Commission (%)</label>
                  <input className="form-control" type="number" step="0.01" value={form.commission_rate} onChange={e => setForm({ ...form, commission_rate: parseFloat(e.target.value) })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Agent Commission (%)</label>
                  <input className="form-control" type="number" step="0.01" value={form.agent_commission_rate} onChange={e => setForm({ ...form, agent_commission_rate: parseFloat(e.target.value) })} />
                </div>
              </div>

              <div style={{ background: 'var(--bg-hover)', borderRadius: 'var(--radius-sm)', padding: '12px 16px', marginBottom: 18, fontSize: 13 }}>
                💡 <strong>Fee Split Preview:</strong> Merchant pays <strong style={{ color: 'var(--warning)' }}>{form.commission_rate}%</strong> →
                Agent gets <strong style={{ color: 'var(--text-secondary)' }}>{form.agent_commission_rate}%</strong> →
                You keep <strong style={{ color: 'var(--success)' }}>{platformFee}%</strong>
              </div>

              <hr className="section-divider" />
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Settlement Bank Details</div>
              <div className="form-group">
                <label className="form-label">Bank Name</label>
                <input className="form-control" placeholder="HDFC Bank" value={form.settlement_bank_name} onChange={e => setForm({ ...form, settlement_bank_name: e.target.value })} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Account Number</label>
                  <input className="form-control" placeholder="000123456789" value={form.settlement_account} onChange={e => setForm({ ...form, settlement_account: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">IFSC Code</label>
                  <input className="form-control" placeholder="HDFC0000001" value={form.settlement_ifsc} onChange={e => setForm({ ...form, settlement_ifsc: e.target.value })} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : editing ? 'Update Merchant' : 'Create Merchant'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Agent Modal */}
      {assignModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setAssignModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">Assign Agent to {selectedMerchant?.merchant_name}</div>
              <button className="modal-close" onClick={() => setAssignModal(false)}>×</button>
            </div>
            <div className="modal-body">
              {error && <div className="alert alert-error">{error}</div>}
              <div style={{ marginBottom: 16, fontSize: 13, color: 'var(--text-muted)' }}>
                Currently assigned: {(selectedMerchant?.agents || []).map(a => a.agent_name).join(', ') || 'None'}
              </div>
              <div className="form-group">
                <label className="form-label">Select Agent</label>
                <select className="form-control" value={assignForm.agent_id} onChange={e => setAssignForm({ ...assignForm, agent_id: e.target.value })}>
                  <option value="">-- Select Agent --</option>
                  {agents.filter(a => a.is_active).map(a => (
                    <option key={a.id} value={a.id}>{a.agent_name} ({a.commission_rate}%)</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={assignForm.is_primary} onChange={e => setAssignForm({ ...assignForm, is_primary: e.target.checked })} />
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Set as primary agent (used for new payments)</span>
                </label>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setAssignModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAssign} disabled={saving}>
                {saving ? 'Assigning...' : 'Assign Agent'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
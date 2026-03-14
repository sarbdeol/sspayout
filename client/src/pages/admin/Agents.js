import React, { useEffect, useState } from 'react';
import { adminAPI } from '../../services/api';
import StatusBadge, { formatDate } from '../../components/shared/StatusBadge';

const EMPTY = { agent_name: '', api_endpoint: '', api_key: '', webhook_secret: '', commission_rate: 5, payload_structure: '{}' };

export default function AgentsPage() {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const load = () => adminAPI.getAgents().then(r => setAgents(r.data.agents)).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm(EMPTY); setError(''); setModal(true); };
  const openEdit = (a) => {
    setEditing(a);
    setForm({ ...a, payload_structure: JSON.stringify(a.payload_structure || {}, null, 2) });
    setError(''); setModal(true);
  };

  const handleSave = async () => {
    setError(''); setSaving(true);
    try {
      let payload_structure = {};
      try { payload_structure = JSON.parse(form.payload_structure || '{}'); } catch { setError('Invalid JSON in payload structure'); setSaving(false); return; }
      const data = { ...form, payload_structure };
      if (editing) await adminAPI.updateAgent(editing.id, data);
      else await adminAPI.createAgent(data);
      setModal(false); load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save');
    } finally { setSaving(false); }
  };

  const handleToggle = async (id) => {
    await adminAPI.toggleAgent(id);
    load();
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this agent?')) return;
    await adminAPI.deleteAgent(id);
    load();
  };

  const filtered = agents.filter(a => a.agent_name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <div className="page-title">Agents</div>
            <div className="page-subtitle">Manage payment agent integrations</div>
          </div>
          <button className="btn btn-primary" onClick={openCreate}>+ Add Agent</button>
        </div>
      </div>

      <div className="card">
        <div className="filter-bar">
          <input className="search-input" placeholder="Search agents..." value={search} onChange={e => setSearch(e.target.value)} />
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{filtered.length} agents</span>
        </div>
        {loading ? <div className="loading-overlay"><div className="spinner"></div></div> : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Agent Name</th>
                  <th>API Endpoint</th>
                  <th>Commission</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={6}><div className="empty-state"><div className="empty-state-icon">⬡</div><div className="empty-state-text">No agents found</div></div></td></tr>
                ) : filtered.map(a => (
                  <tr key={a.id}>
                    <td className="td-primary">{a.agent_name}</td>
                    <td style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.api_endpoint}</td>
                    <td><span className="badge badge-accent">{a.commission_rate}%</span></td>
                    <td><StatusBadge status={a.is_active ? 'active' : 'inactive'} /></td>
                    <td>{formatDate(a.created_at)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(a)}>Edit</button>
                        <button className={`btn btn-sm ${a.is_active ? 'btn-danger' : 'btn-success'}`} onClick={() => handleToggle(a.id)}>
                          {a.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(a.id)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">{editing ? 'Edit Agent' : 'Add New Agent'}</div>
              <button className="modal-close" onClick={() => setModal(false)}>×</button>
            </div>
            <div className="modal-body">
              {error && <div className="alert alert-error">{error}</div>}
              <div className="form-group">
                <label className="form-label">Agent Name *</label>
                <input className="form-control" placeholder="e.g. PayU Gateway" value={form.agent_name} onChange={e => setForm({ ...form, agent_name: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">API Endpoint *</label>
                <input className="form-control" placeholder="https://api.youragent.com/create-payment" value={form.api_endpoint} onChange={e => setForm({ ...form, api_endpoint: e.target.value })} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">API Key *</label>
                  <input className="form-control" placeholder="sk_live_..." value={form.api_key} onChange={e => setForm({ ...form, api_key: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Commission Rate (%)</label>
                  <input className="form-control" type="number" step="0.01" min="0" max="100" value={form.commission_rate} onChange={e => setForm({ ...form, commission_rate: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Webhook Secret *</label>
                <input className="form-control" placeholder="your-webhook-secret" value={form.webhook_secret} onChange={e => setForm({ ...form, webhook_secret: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Payload Structure (JSON)</label>
                <textarea className="form-control" rows={5} style={{ fontFamily: 'DM Mono, monospace', fontSize: 12 }}
                  placeholder={'{\n  "amount": "{{amount}}",\n  "ref": "{{reference_id}}"\n}'}
                  value={form.payload_structure}
                  onChange={e => setForm({ ...form, payload_structure: e.target.value })} />
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  Use {'{{field}}'} for dynamic values: amount, order_id, reference_id, merchant_id
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : editing ? 'Update Agent' : 'Create Agent'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

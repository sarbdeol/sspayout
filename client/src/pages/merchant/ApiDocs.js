import React, { useState, useEffect } from 'react';
import API from '../../services/api';

// ============================================================
// Style constants — all use existing CSS variables from your theme
// ============================================================

const styles = {
  page: {
    display: 'flex',
    minHeight: '100vh',
    background: 'var(--bg-primary)',
    color: 'var(--text-primary)',
  },
  innerSidebar: {
    width: 240,
    minWidth: 240,
    background: 'var(--bg-secondary)',
    borderRight: '1px solid var(--border)',
    padding: 20,
    position: 'sticky',
    top: 0,
    height: '100vh',
    overflowY: 'auto',
    boxSizing: 'border-box',
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: 'var(--text-secondary)',
    marginBottom: 12,
  },
  navItem: (active) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    padding: '10px 12px',
    borderRadius: 8,
    fontSize: 14,
    background: active ? 'var(--accent-bg, rgba(99, 102, 241, 0.15))' : 'transparent',
    color: active ? 'var(--accent, #818cf8)' : 'var(--text-primary)',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left',
    fontWeight: active ? 600 : 400,
    transition: 'background 0.15s',
  }),
  apiKeyCard: {
    marginTop: 24,
    padding: 12,
    background: 'var(--bg-tertiary, rgba(255,255,255,0.04))',
    border: '1px solid var(--border)',
    borderRadius: 10,
  },
  apiKeyLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--text-secondary)',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  apiKeyRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  apiKeyValue: {
    flex: 1,
    fontSize: 12,
    fontFamily: 'monospace',
    background: 'var(--bg-primary)',
    padding: '6px 8px',
    borderRadius: 6,
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  iconBtn: {
    background: 'transparent',
    border: '1px solid var(--border)',
    color: 'var(--text-secondary)',
    padding: 6,
    borderRadius: 6,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
  },
  main: {
    flex: 1,
    padding: '32px 40px',
    maxWidth: 960,
    boxSizing: 'border-box',
  },
  title: {
    fontSize: 28,
    fontWeight: 700,
    color: 'var(--text-primary)',
    margin: 0,
  },
  subtitle: {
    color: 'var(--text-secondary)',
    marginTop: 6,
    fontSize: 15,
  },
  baseUrlChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    padding: '8px 14px',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    fontFamily: 'monospace',
    fontSize: 13,
    color: 'var(--text-primary)',
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: 700,
    color: 'var(--text-primary)',
    margin: 0,
  },
  sectionWrap: {
    marginBottom: 48,
    scrollMarginTop: 16,
  },
  paragraph: {
    color: 'var(--text-primary)',
    lineHeight: 1.6,
    fontSize: 14,
  },
  list: {
    color: 'var(--text-primary)',
    lineHeight: 1.8,
    fontSize: 14,
    paddingLeft: 22,
    marginTop: 10,
  },
  inlineCode: {
    padding: '2px 6px',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 4,
    fontSize: 13,
    fontFamily: 'monospace',
    color: 'var(--text-primary)',
  },
  endpointBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 12,
    padding: '8px 14px',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    fontFamily: 'monospace',
    fontSize: 14,
  },
  methodChip: (method) => {
    const colors = {
      GET: { bg: 'rgba(59, 130, 246, 0.18)', fg: '#60a5fa' },
      POST: { bg: 'rgba(34, 197, 94, 0.18)', fg: '#4ade80' },
      PUT: { bg: 'rgba(234, 179, 8, 0.18)', fg: '#facc15' },
      DELETE: { bg: 'rgba(239, 68, 68, 0.18)', fg: '#f87171' },
    };
    const c = colors[method] || { bg: 'var(--bg-tertiary)', fg: 'var(--text-primary)' };
    return {
      padding: '3px 8px',
      borderRadius: 4,
      fontSize: 11,
      fontWeight: 700,
      background: c.bg,
      color: c.fg,
    };
  },
  h4: {
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--text-primary)',
    marginTop: 22,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  codeBlock: {
    position: 'relative',
    background: '#0d1117',
    border: '1px solid var(--border)',
    color: '#e6edf3',
    padding: 16,
    borderRadius: 8,
    overflowX: 'auto',
    fontSize: 13,
    fontFamily: 'monospace',
    lineHeight: 1.5,
    margin: '8px 0',
    whiteSpace: 'pre',
  },
  copyBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    padding: 6,
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 6,
    color: '#9ca3af',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 13,
    border: '1px solid var(--border)',
    borderRadius: 8,
    overflow: 'hidden',
  },
  th: {
    textAlign: 'left',
    padding: '10px 14px',
    background: 'var(--bg-secondary)',
    color: 'var(--text-secondary)',
    fontWeight: 600,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    borderBottom: '1px solid var(--border)',
  },
  td: {
    padding: '10px 14px',
    borderBottom: '1px solid var(--border)',
    color: 'var(--text-primary)',
    verticalAlign: 'top',
  },
  tdName: {
    padding: '10px 14px',
    borderBottom: '1px solid var(--border)',
    color: '#60a5fa',
    fontFamily: 'monospace',
    fontWeight: 500,
    verticalAlign: 'top',
  },
  note: (variant) => ({
    marginTop: 14,
    padding: '12px 14px',
    background: variant === 'warning' ? 'rgba(234, 179, 8, 0.08)' : 'rgba(59, 130, 246, 0.08)',
    border: `1px solid ${variant === 'warning' ? 'rgba(234, 179, 8, 0.3)' : 'rgba(59, 130, 246, 0.3)'}`,
    borderRadius: 8,
    fontSize: 13,
    color: 'var(--text-primary)',
    lineHeight: 1.6,
  }),
  badge: {
    padding: '2px 8px',
    fontSize: 10,
    fontWeight: 700,
    background: 'rgba(34, 197, 94, 0.18)',
    color: '#4ade80',
    borderRadius: 999,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
};

// ============================================================
// Inline SVG icons
// ============================================================

const Icon = ({ d, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {d}
  </svg>
);
const IconCopy = (p) => <Icon {...p} d={<><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>} />;
const IconCheck = (p) => <Icon {...p} d={<polyline points="20 6 9 17 4 12" />} />;
const IconChevron = (p) => <Icon {...p} d={<polyline points="9 18 15 12 9 6" />} />;
const IconCode = (p) => <Icon {...p} d={<><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></>} />;
const IconWebhook = (p) => <Icon {...p} d={<><path d="M18 16.98h-5.99c-1.1 0-1.95.94-2.48 1.9A4 4 0 0 1 2 17a3.98 3.98 0 0 1 2.65-3.77" /><path d="m12 8-2.65 4.5a4 4 0 1 1-3.7-1.95" /><path d="M19.99 12.06A4 4 0 1 1 16 16h-2.5" /></>} />;
const IconSearch = (p) => <Icon {...p} d={<><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></>} />;
const IconFile = (p) => <Icon {...p} d={<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></>} />;

// ============================================================
// Main component
// ============================================================

const ApiDocs = () => {
  const [apiKey, setApiKey] = useState('');
  const [activeSection, setActiveSection] = useState('overview');
  const [copiedField, setCopiedField] = useState(null);

  useEffect(() => {
    const loadKey = async () => {
      try {
        const res = await API.get('/auth/profile');
        setApiKey(
          res.data?.data?.merchant?.api_key ||
          res.data?.merchant?.api_key ||
          res.data?.data?.api_key ||
          res.data?.api_key ||
          ''
        );
      } catch (e) {
        console.error('Failed to load api_key', e);
      }
    };
    loadKey();
  }, []);

  const copy = (text, fieldId) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldId);
    setTimeout(() => setCopiedField(null), 1500);
  };

  const KEY = apiKey || 'YOUR_MERCHANT_API_KEY';

  const sections = [
    { id: 'overview', label: 'Overview', icon: IconFile },
    { id: 'auth', label: 'Authentication', icon: IconCode },
    { id: 'create', label: 'Create Payment', icon: IconCode },
    { id: 'status', label: 'Check Status', icon: IconSearch },
    { id: 'utr', label: 'Submit UTR', icon: IconCode },
    { id: 'webhook', label: 'Webhook', icon: IconWebhook },
    { id: 'errors', label: 'Error Codes', icon: IconChevron },
  ];

  return (
    <div style={styles.page}>
      {/* Inner sidebar */}
      <aside style={styles.innerSidebar}>
        <div style={styles.sectionLabel}>API Reference</div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {sections.map((s) => {
            const Ic = s.icon;
            const active = activeSection === s.id;
            return (
              <button
                key={s.id}
                style={styles.navItem(active)}
                onClick={() => {
                  setActiveSection(s.id);
                  document.getElementById(`section-${s.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
              >
                <Ic size={15} />
                {s.label}
              </button>
            );
          })}
        </nav>

        <div style={styles.apiKeyCard}>
          <div style={styles.apiKeyLabel}>Your API Key</div>
          <div style={styles.apiKeyRow}>
            <code style={styles.apiKeyValue}>{apiKey ? `${apiKey.slice(0, 12)}…` : 'Loading…'}</code>
            <button
              style={styles.iconBtn}
              onClick={() => apiKey && copy(apiKey, 'sidebar-key')}
              disabled={!apiKey}
              title="Copy API key"
            >
              {copiedField === 'sidebar-key' ? <IconCheck size={13} /> : <IconCopy size={13} />}
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main style={styles.main}>
        <div style={{ marginBottom: 32 }}>
          <h1 style={styles.title}>PayGateway API</h1>
          <p style={styles.subtitle}>Integrate payments into your application using our REST API.</p>
          <div style={styles.baseUrlChip}>
            <span style={{ color: 'var(--text-secondary)' }}>Base URL:</span>
            <span>https://ss.sspay.online/api</span>
            <button style={{ ...styles.iconBtn, padding: 4, marginLeft: 4 }} onClick={() => copy('https://ss.sspay.online/api', 'base-url')}>
              {copiedField === 'base-url' ? <IconCheck size={13} /> : <IconCopy size={13} />}
            </button>
          </div>
        </div>

        <Section id="overview" title="Overview">
          <p style={styles.paragraph}>
            PayGateway provides a UPI-first payment API for accepting payments in INR. The flow is:
          </p>
          <ol style={styles.list}>
            <li>Call <code style={styles.inlineCode}>POST /api/payin</code> to create a payment — you'll receive UPI / bank details and a transaction_id.</li>
            <li>Display the QR code or UPI link to your customer.</li>
            <li>Customer pays from their UPI app or bank.</li>
            <li>We POST a confirmation to your <code style={styles.inlineCode}>webhook_url</code> when payment completes.</li>
            <li>If the webhook is missed, you can poll <code style={styles.inlineCode}>GET /api/payin/status/:transaction_id</code> to reconcile.</li>
          </ol>
        </Section>

        <Section id="auth" title="Authentication">
          <p style={styles.paragraph}>
            All requests must include your <code style={styles.inlineCode}>api-key</code> header. Keep this key secret — never expose it in client-side code.
          </p>
          <CodeBlock code={`api-key: ${KEY}`} fieldId="auth-header" copy={copy} copiedField={copiedField} />
        </Section>

        <Section id="create" title="Create Payment">
          <EndpointBadge method="POST" path="/api/payin" />
          <h4 style={styles.h4}>Request Body</h4>
          <ParamTable
            rows={[
              { name: 'amount', type: 'number', required: true, desc: 'Payment amount in INR' },
              { name: 'order_id', type: 'string', required: false, desc: 'Your unique order reference (auto-generated if omitted)' },
              { name: 'webhook_url', type: 'string', required: false, desc: 'URL to receive payment confirmation' },
              { name: 'name', type: 'string', required: false, desc: 'Customer name' },
              { name: 'mobile', type: 'string', required: false, desc: 'Customer mobile (10-digit Indian)' },
              { name: 'email', type: 'string', required: false, desc: 'Customer email (real domain — no example.com)' },
            ]}
          />
          <h4 style={styles.h4}>cURL</h4>
          <CodeBlock
            code={`curl -X POST https://ss.sspay.online/api/payin \\
  -H "api-key: ${KEY}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "amount": 1000,
    "order_id": "ORD-12345",
    "webhook_url": "https://yoursite.com/webhook",
    "name": "Rahul Kumar",
    "mobile": "9876543210",
    "email": "rahul@yoursite.com"
  }'`}
            fieldId="create-curl"
            copy={copy}
            copiedField={copiedField}
          />
          <h4 style={styles.h4}>Success Response</h4>
          <CodeBlock
            code={`{
  "code": 200,
  "message": "Payment Created Successfully",
  "data": {
    "bank_name": "UPI Payment",
    "ifsc_code": null,
    "account_number": null,
    "account_holder_name": null,
    "upi_id": "upi://pay?pa=merchant@bank&am=1000.00&...",
    "qr_code": "data:image/png;base64,iVBORw0KGgoAAAANS...",
    "transaction_id": "PAY-A1B2C3D4-1778316890799",
    "order_id": "ORD-12345",
    "expires_at": "2026-05-09T11:00:00.000Z"
  }
}`}
            fieldId="create-resp"
            copy={copy}
            copiedField={copiedField}
          />
          <div style={styles.note('info')}>
            <strong>Save the <code style={styles.inlineCode}>transaction_id</code></strong> — you'll need it to check status or reconcile later. Payments expire 30 minutes after creation.
          </div>
        </Section>

        <Section id="status" title="Check Payment Status" badge="NEW">
          <EndpointBadge method="GET" path="/api/payin/status/:transaction_id" />
          <p style={{ ...styles.paragraph, marginTop: 12 }}>
            Poll this endpoint to check the current status of a payment. Useful when your webhook endpoint was down, or to reconcile a payment manually.
          </p>
          <h4 style={styles.h4}>Path Parameter</h4>
          <ParamTable
            rows={[
              { name: 'transaction_id', type: 'string', required: true, desc: 'The transaction_id returned from Create Payment' },
            ]}
          />
          <h4 style={styles.h4}>cURL</h4>
          <CodeBlock
            code={`curl https://ss.sspay.online/api/payin/status/PAY-A1B2C3D4-1778316890799 \\
  -H "api-key: ${KEY}"`}
            fieldId="status-curl"
            copy={copy}
            copiedField={copiedField}
          />
          <h4 style={styles.h4}>Success Response</h4>
          <CodeBlock
            code={`{
  "code": 200,
  "message": "OK",
  "data": {
    "transaction_id": "PAY-A1B2C3D4-1778316890799",
    "order_id": "ORD-12345",
    "amount": "1000.00",
    "status": "confirmed",
    "utr": "1234567890",
    "created_at": "2026-05-09T10:30:00.000Z",
    "updated_at": "2026-05-09T10:35:00.000Z"
  }
}`}
            fieldId="status-resp"
            copy={copy}
            copiedField={copiedField}
          />
          <h4 style={styles.h4}>Status Values</h4>
          <ParamTable
            cols={['Status', 'Type', 'Meaning']}
            hideRequired
            rows={[
              { name: 'awaiting_transfer', type: 'string', desc: 'Payment created, customer has not paid yet' },
              { name: 'utr_submitted', type: 'string', desc: 'UTR submitted, awaiting verification (bank-transfer flow)' },
              { name: 'confirmed', type: 'string', desc: 'Payment received and verified ✓' },
              { name: 'failed', type: 'string', desc: 'Payment failed or rejected ✗' },
              { name: 'expired', type: 'string', desc: 'Payment window expired without payment' },
            ]}
          />
          <div style={styles.note('info')}>
            <strong>Self-healing:</strong> if the status check finds your payment confirmed at the provider but our DB still shows pending (i.e. webhook was missed), our system reconciles automatically and returns the correct status.
          </div>
        </Section>

        <Section id="utr" title="Submit UTR">
          <EndpointBadge method="POST" path="/api/payin/utr" />
          <p style={{ ...styles.paragraph, marginTop: 12 }}>
            For bank-transfer flows where the customer has paid manually and you need to submit the UTR (Unique Transaction Reference) for verification. Not needed for UPI flows — those auto-confirm via webhook.
          </p>
          <h4 style={styles.h4}>Request Body</h4>
          <ParamTable
            rows={[
              { name: 'transaction_id', type: 'string', required: true, desc: 'The transaction_id from Create Payment' },
              { name: 'utr', type: 'string', required: true, desc: 'UTR / RRN provided by customer' },
            ]}
          />
          <h4 style={styles.h4}>cURL</h4>
          <CodeBlock
            code={`curl -X POST https://ss.sspay.online/api/payin/utr \\
  -H "api-key: ${KEY}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "transaction_id": "PAY-A1B2C3D4-1778316890799",
    "utr": "1234567890"
  }'`}
            fieldId="utr-curl"
            copy={copy}
            copiedField={copiedField}
          />
        </Section>

        <Section id="webhook" title="Webhook Callback">
          <p style={styles.paragraph}>
            When a payment reaches a final state, we POST to your <code style={styles.inlineCode}>webhook_url</code>. Your endpoint must respond with HTTP 200, otherwise we'll mark the delivery as failed.
          </p>
          <h4 style={styles.h4}>Webhook Payload</h4>
          <CodeBlock
            code={`{
  "transactionId": "PAY-A1B2C3D4-1778316890799",
  "order_id": "ORD-12345",
  "status": "approved",
  "amount": 1000,
  "utr": "1234567890"
}`}
            fieldId="webhook-body"
            copy={copy}
            copiedField={copiedField}
          />
          <h4 style={styles.h4}>Status Values in Webhook</h4>
          <ParamTable
            cols={['Status', 'Type', 'Meaning']}
            hideRequired
            rows={[
              { name: 'approved', type: 'string', desc: 'Payment confirmed' },
              { name: 'reject', type: 'string', desc: 'Payment rejected or failed' },
            ]}
          />
          <div style={styles.note('warning')}>
            <strong>Always verify on your end</strong> by calling the status check endpoint before fulfilling an order. Webhooks can be delayed, retried, or spoofed.
          </div>
        </Section>

        <Section id="errors" title="Error Codes">
          <ParamTable
            cols={['Code', 'Status', 'Meaning']}
            hideRequired
            rows={[
              { name: '200', type: 'OK', desc: 'Success' },
              { name: '400', type: 'Bad Request', desc: 'Invalid amount, missing fields, or no agent available' },
              { name: '401', type: 'Unauthorized', desc: 'Missing or invalid api-key' },
              { name: '403', type: 'Forbidden', desc: 'Merchant account is inactive' },
              { name: '404', type: 'Not Found', desc: 'Transaction not found for this merchant' },
              { name: '500', type: 'Server Error', desc: 'Internal error — contact support' },
            ]}
          />
        </Section>

        <div style={{ marginTop: 48, padding: 16, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
          Need help? Contact your account manager at PayGateway.
        </div>
      </main>
    </div>
  );
};

// ============================================================
// Building blocks
// ============================================================

const Section = ({ id, title, badge, children }) => (
  <section id={`section-${id}`} style={styles.sectionWrap}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
      <h2 style={styles.sectionTitle}>{title}</h2>
      {badge && <span style={styles.badge}>{badge}</span>}
    </div>
    {children}
  </section>
);

const EndpointBadge = ({ method, path }) => (
  <div style={styles.endpointBadge}>
    <span style={styles.methodChip(method)}>{method}</span>
    <span style={{ color: 'var(--text-primary)' }}>{path}</span>
  </div>
);

const CodeBlock = ({ code, fieldId, copy, copiedField }) => (
  <pre style={styles.codeBlock}>
    <code>{code}</code>
    <button style={styles.copyBtn} onClick={() => copy(code, fieldId)}>
      {copiedField === fieldId ? <IconCheck size={13} /> : <IconCopy size={13} />}
    </button>
  </pre>
);

const ParamTable = ({ rows, cols = ['Field', 'Type', 'Required', 'Description'], hideRequired }) => {
  const visible = hideRequired ? cols.filter((c) => c !== 'Required') : cols;
  return (
    <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid var(--border)', marginTop: 4 }}>
      <table style={styles.table}>
        <thead>
          <tr>
            {visible.map((c) => (
              <th key={c} style={styles.th}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td style={styles.tdName}>{r.name}</td>
              <td style={{ ...styles.td, color: 'var(--text-secondary)' }}>{r.type}</td>
              {!hideRequired && (
                <td style={styles.td}>
                  {r.required
                    ? <span style={{ color: '#f87171', fontWeight: 600 }}>Yes</span>
                    : <span style={{ color: 'var(--text-secondary)' }}>No</span>}
                </td>
              )}
              <td style={styles.td}>{r.desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default ApiDocs;
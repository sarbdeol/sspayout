import React, { useState, useEffect } from 'react';
import { Copy, Check, ChevronRight, Code, Webhook, Search, FileText } from 'lucide-react';
import api from '../../utils/api'; // adjust path to your axios instance

// ============================================================
// API Documentation Page (Merchant Dashboard)
// ============================================================

const ApiDocs = () => {
  const [apiKey, setApiKey] = useState('');
  const [activeSection, setActiveSection] = useState('overview');
  const [copiedField, setCopiedField] = useState(null);

  useEffect(() => {
    // Fetch merchant's own api_key from profile endpoint
    const loadKey = async () => {
      try {
        const res = await api.get('/auth/profile');
        setApiKey(res.data?.data?.merchant?.api_key || res.data?.merchant?.api_key || '');
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

  const KEY_PLACEHOLDER = apiKey || 'YOUR_MERCHANT_API_KEY';

  // -------- Sidebar navigation --------
  const sections = [
    { id: 'overview', label: 'Overview', icon: FileText },
    { id: 'auth', label: 'Authentication', icon: Code },
    { id: 'create', label: 'Create Payment', icon: Code },
    { id: 'status', label: 'Check Status', icon: Search },
    { id: 'utr', label: 'Submit UTR', icon: Code },
    { id: 'webhook', label: 'Webhook', icon: Webhook },
    { id: 'errors', label: 'Error Codes', icon: ChevronRight },
  ];

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Inner sidebar — sub-nav for docs */}
      <aside className="w-60 border-r border-gray-200 bg-white p-4 sticky top-0 h-screen overflow-y-auto">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">API Reference</h2>
        <nav className="space-y-1">
          {sections.map((s) => {
            const Icon = s.icon;
            const active = activeSection === s.id;
            return (
              <button
                key={s.id}
                onClick={() => {
                  setActiveSection(s.id);
                  document.getElementById(`section-${s.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                  active ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <Icon size={16} />
                {s.label}
              </button>
            );
          })}
        </nav>

        {/* API key card */}
        <div className="mt-6 p-3 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg border border-blue-100">
          <div className="text-xs font-semibold text-gray-700 mb-2">Your API Key</div>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-white px-2 py-1 rounded border border-gray-200 truncate">
              {apiKey ? `${apiKey.slice(0, 12)}…` : 'Loading…'}
            </code>
            <button
              onClick={() => apiKey && copy(apiKey, 'sidebar-key')}
              className="p-1.5 hover:bg-blue-100 rounded transition-colors"
              title="Copy API key"
              disabled={!apiKey}
            >
              {copiedField === 'sidebar-key' ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-8 max-w-5xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">PayGateway API</h1>
          <p className="text-gray-600 mt-2">Integrate payments into your application using our REST API.</p>
          <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 bg-gray-900 text-white rounded-lg font-mono text-sm">
            <span className="text-gray-400">Base URL:</span>
            <span>https://ss.sspay.online/api</span>
            <button onClick={() => copy('https://ss.sspay.online/api', 'base-url')} className="ml-2 hover:text-gray-300">
              {copiedField === 'base-url' ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
            </button>
          </div>
        </div>

        {/* OVERVIEW */}
        <Section id="section-overview" title="Overview">
          <p className="text-gray-700">
            PayGateway provides a UPI-first payment API for accepting payments in INR. The flow is:
          </p>
          <ol className="list-decimal list-inside space-y-2 text-gray-700 mt-3">
            <li>Call <Code>POST /api/payin</Code> to create a payment — you'll receive UPI / bank details and a transaction_id.</li>
            <li>Display the QR code or UPI link to your customer.</li>
            <li>Customer pays from their UPI app or bank.</li>
            <li>We POST a confirmation to your <Code>webhook_url</Code> when payment completes.</li>
            <li>If the webhook is missed, you can poll <Code>GET /api/payin/status/:transaction_id</Code> to reconcile.</li>
          </ol>
        </Section>

        {/* AUTH */}
        <Section id="section-auth" title="Authentication">
          <p className="text-gray-700">
            All requests must include your <Code>api-key</Code> header. Keep this key secret — never expose it in client-side code.
          </p>
          <CodeBlock
            label="Header"
            language="http"
            code={`api-key: ${KEY_PLACEHOLDER}`}
            onCopy={(c) => copy(c, 'auth-header')}
            copied={copiedField === 'auth-header'}
          />
        </Section>

        {/* CREATE PAYMENT */}
        <Section id="section-create" title="Create Payment">
          <EndpointBadge method="POST" path="/api/payin" />

          <h4 className="font-semibold mt-4 mb-2 text-gray-900">Request Body</h4>
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

          <h4 className="font-semibold mt-6 mb-2 text-gray-900">cURL</h4>
          <CodeBlock
            language="bash"
            code={`curl -X POST https://ss.sspay.online/api/payin \\
  -H "api-key: ${KEY_PLACEHOLDER}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "amount": 1000,
    "order_id": "ORD-12345",
    "webhook_url": "https://yoursite.com/webhook",
    "name": "Rahul Kumar",
    "mobile": "9876543210",
    "email": "rahul@yoursite.com"
  }'`}
            onCopy={(c) => copy(c, 'create-curl')}
            copied={copiedField === 'create-curl'}
          />

          <h4 className="font-semibold mt-6 mb-2 text-gray-900">Success Response</h4>
          <CodeBlock
            language="json"
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
            onCopy={(c) => copy(c, 'create-resp')}
            copied={copiedField === 'create-resp'}
          />
          <Note>
            <strong>Save the <Code>transaction_id</Code></strong> — you'll need it to check status or reconcile later.
            Payments expire 30 minutes after creation.
          </Note>
        </Section>

        {/* STATUS CHECK — NEW */}
        <Section id="section-status" title="Check Payment Status" badge="NEW">
          <EndpointBadge method="GET" path="/api/payin/status/:transaction_id" />

          <p className="text-gray-700 mt-2">
            Poll this endpoint to check the current status of a payment. Useful when your webhook endpoint was down,
            or to reconcile a payment manually.
          </p>

          <h4 className="font-semibold mt-4 mb-2 text-gray-900">Path Parameter</h4>
          <ParamTable
            rows={[
              { name: 'transaction_id', type: 'string', required: true, desc: 'The transaction_id returned from Create Payment' },
            ]}
          />

          <h4 className="font-semibold mt-6 mb-2 text-gray-900">cURL</h4>
          <CodeBlock
            language="bash"
            code={`curl https://ss.sspay.online/api/payin/status/PAY-A1B2C3D4-1778316890799 \\
  -H "api-key: ${KEY_PLACEHOLDER}"`}
            onCopy={(c) => copy(c, 'status-curl')}
            copied={copiedField === 'status-curl'}
          />

          <h4 className="font-semibold mt-6 mb-2 text-gray-900">Success Response</h4>
          <CodeBlock
            language="json"
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
            onCopy={(c) => copy(c, 'status-resp')}
            copied={copiedField === 'status-resp'}
          />

          <h4 className="font-semibold mt-6 mb-2 text-gray-900">Status Values</h4>
          <ParamTable
            rows={[
              { name: 'awaiting_transfer', type: 'string', desc: 'Payment created, customer has not paid yet' },
              { name: 'utr_submitted', type: 'string', desc: 'UTR submitted, awaiting verification (bank-transfer flow)' },
              { name: 'confirmed', type: 'string', desc: 'Payment received and verified ✅' },
              { name: 'failed', type: 'string', desc: 'Payment failed or rejected ❌' },
              { name: 'expired', type: 'string', desc: 'Payment window expired without payment' },
            ]}
            cols={['Status', 'Type', 'Meaning']}
            hideRequired
          />

          <Note>
            <strong>Self-healing:</strong> if the status check finds your payment confirmed at the provider but our
            DB still shows pending (i.e. webhook was missed), our system reconciles automatically and returns the
            correct status.
          </Note>
        </Section>

        {/* SUBMIT UTR */}
        <Section id="section-utr" title="Submit UTR">
          <EndpointBadge method="POST" path="/api/payin/utr" />
          <p className="text-gray-700 mt-2">
            For bank-transfer flows where the customer has paid manually and you need to submit the UTR (Unique
            Transaction Reference) for verification. Not needed for UPI flows — those auto-confirm via webhook.
          </p>

          <h4 className="font-semibold mt-4 mb-2 text-gray-900">Request Body</h4>
          <ParamTable
            rows={[
              { name: 'transaction_id', type: 'string', required: true, desc: 'The transaction_id from Create Payment' },
              { name: 'utr', type: 'string', required: true, desc: 'UTR / RRN provided by customer' },
            ]}
          />

          <h4 className="font-semibold mt-6 mb-2 text-gray-900">cURL</h4>
          <CodeBlock
            language="bash"
            code={`curl -X POST https://ss.sspay.online/api/payin/utr \\
  -H "api-key: ${KEY_PLACEHOLDER}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "transaction_id": "PAY-A1B2C3D4-1778316890799",
    "utr": "1234567890"
  }'`}
            onCopy={(c) => copy(c, 'utr-curl')}
            copied={copiedField === 'utr-curl'}
          />
        </Section>

        {/* WEBHOOK */}
        <Section id="section-webhook" title="Webhook Callback">
          <p className="text-gray-700">
            When a payment reaches a final state, we POST to your <Code>webhook_url</Code>. Your endpoint must respond
            with HTTP 200, otherwise we'll mark the delivery as failed.
          </p>

          <h4 className="font-semibold mt-4 mb-2 text-gray-900">Webhook Payload</h4>
          <CodeBlock
            language="json"
            code={`{
  "transactionId": "PAY-A1B2C3D4-1778316890799",
  "order_id": "ORD-12345",
  "status": "approved",
  "amount": 1000,
  "utr": "1234567890"
}`}
            onCopy={(c) => copy(c, 'webhook-body')}
            copied={copiedField === 'webhook-body'}
          />

          <h4 className="font-semibold mt-6 mb-2 text-gray-900">Status Values in Webhook</h4>
          <ParamTable
            rows={[
              { name: 'approved', type: 'string', desc: 'Payment confirmed' },
              { name: 'reject', type: 'string', desc: 'Payment rejected or failed' },
            ]}
            cols={['Status', 'Type', 'Meaning']}
            hideRequired
          />

          <Note variant="warning">
            <strong>Always verify on your end</strong> by calling the status check endpoint before fulfilling an order.
            Webhooks can be delayed, retried, or spoofed.
          </Note>
        </Section>

        {/* ERRORS */}
        <Section id="section-errors" title="Error Codes">
          <ParamTable
            rows={[
              { name: '200', type: 'OK', desc: 'Success' },
              { name: '400', type: 'Bad Request', desc: 'Invalid amount, missing fields, or no agent available' },
              { name: '401', type: 'Unauthorized', desc: 'Missing or invalid api-key' },
              { name: '403', type: 'Forbidden', desc: 'Merchant account is inactive' },
              { name: '404', type: 'Not Found', desc: 'Transaction not found for this merchant' },
              { name: '500', type: 'Server Error', desc: 'Internal error — contact support' },
            ]}
            cols={['Code', 'Status', 'Meaning']}
            hideRequired
          />
        </Section>

        <div className="mt-12 p-4 bg-gray-100 rounded-lg text-sm text-gray-600">
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
  <section id={id} className="mb-12 scroll-mt-8">
    <div className="flex items-center gap-2 mb-3">
      <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
      {badge && (
        <span className="px-2 py-0.5 text-xs font-semibold bg-green-100 text-green-700 rounded-full">{badge}</span>
      )}
    </div>
    {children}
  </section>
);

const Code = ({ children }) => (
  <code className="px-1.5 py-0.5 bg-gray-100 text-gray-800 rounded text-sm font-mono">{children}</code>
);

const EndpointBadge = ({ method, path }) => {
  const colors = {
    GET: 'bg-blue-100 text-blue-700',
    POST: 'bg-green-100 text-green-700',
    PUT: 'bg-yellow-100 text-yellow-700',
    DELETE: 'bg-red-100 text-red-700',
  };
  return (
    <div className="inline-flex items-center gap-3 px-4 py-2 bg-gray-900 rounded-lg font-mono text-sm">
      <span className={`px-2 py-0.5 rounded font-bold text-xs ${colors[method] || 'bg-gray-200'}`}>{method}</span>
      <span className="text-gray-100">{path}</span>
    </div>
  );
};

const CodeBlock = ({ code, language = 'bash', label, onCopy, copied }) => (
  <div className="relative group my-2">
    {label && <div className="text-xs text-gray-500 mb-1">{label}</div>}
    <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto text-sm font-mono">
      <code className={`language-${language}`}>{code}</code>
    </pre>
    <button
      onClick={() => onCopy(code)}
      className="absolute top-2 right-2 p-2 bg-gray-800 hover:bg-gray-700 rounded text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity"
    >
      {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
    </button>
  </div>
);

const ParamTable = ({ rows, cols = ['Field', 'Type', 'Required', 'Description'], hideRequired }) => {
  const visibleCols = hideRequired ? cols.filter((c) => c !== 'Required') : cols;
  return (
    <div className="overflow-x-auto border border-gray-200 rounded-lg">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            {visibleCols.map((c) => (
              <th key={c} className="text-left px-4 py-2 font-semibold text-gray-700">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-gray-100 last:border-0">
              <td className="px-4 py-2 font-mono text-blue-700">{r.name}</td>
              <td className="px-4 py-2 text-gray-600">{r.type}</td>
              {!hideRequired && (
                <td className="px-4 py-2">
                  {r.required ? (
                    <span className="text-red-600 font-medium">Yes</span>
                  ) : (
                    <span className="text-gray-400">No</span>
                  )}
                </td>
              )}
              <td className="px-4 py-2 text-gray-700">{r.desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const Note = ({ children, variant = 'info' }) => {
  const styles = {
    info: 'bg-blue-50 border-blue-200 text-blue-900',
    warning: 'bg-amber-50 border-amber-200 text-amber-900',
  };
  return (
    <div className={`mt-4 p-3 border rounded-lg text-sm ${styles[variant]}`}>
      {children}
    </div>
  );
};

export default ApiDocs;
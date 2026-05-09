const axios = require('axios');
const https = require('https');
const fs = require('fs');
const tls = require('tls');
const QRCode = require('qrcode');

// ============================================================
// HTTPS agent for MeroRecharge
// ============================================================
//
// PROBLEM:
// MeroRecharge serves an INCOMPLETE TLS chain at merorecharge.com — only
// the leaf cert. The Let's Encrypt R13 intermediate is not transmitted.
// Browsers and Postman cache intermediates and work around this; Node.js
// does not, and rejects with "unable to verify the first certificate".
//
// FIX:
// Build a CA bundle that combines:
//   1. Node's bundled root CAs (from Mozilla via tls.rootCertificates)
//   2. The system CA bundle at /etc/ssl/certs/ca-certificates.crt
//      (which we manually augmented with R13 intermediate)
//
// We load this explicitly in code rather than relying on
// NODE_EXTRA_CA_CERTS, because that env var doesn't always propagate
// through pm2 to child processes.

let combinedCAs;
try {
  const systemCAs = fs.readFileSync('/etc/ssl/certs/ca-certificates.crt', 'utf8');
  combinedCAs = [...tls.rootCertificates, systemCAs];
  console.log(`✅ MeroRecharge: loaded ${tls.rootCertificates.length} bundled CAs + system bundle`);
} catch (e) {
  console.warn('⚠️ MeroRecharge: could not read system CAs, falling back to bundled only:', e.message);
  combinedCAs = tls.rootCertificates;
}

const merorechargeHttpsAgent = new https.Agent({
  rejectUnauthorized: true,
  ca: combinedCAs,
  keepAlive: true,
});

// ============================================================
// Standard agent interface
// ============================================================

const createPayment = async (agent, { amount, order_id, reference_id, customer }) => {
  const userToken = agent.api_key;

  if (!userToken) {
    throw new Error('MeroRecharge agent missing api_key (user_token)');
  }

  const payload = {
    user_token: userToken,
    amount: String(amount),
    customer_name: customer?.name || 'Customer',
    customer_mobile: customer?.mobile || '9999999999',
    remark: order_id,
  };

  console.log(`🔵 MeroRecharge: creating order for ${order_id} (amount=${amount})`);

  const response = await axios.post(agent.api_endpoint, payload, {
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    timeout: 15000,
    httpsAgent: merorechargeHttpsAgent,
  });

  const data = response.data;

  if (!data || data.status !== true) {
    throw new Error(data?.message || 'MeroRecharge failed to create order');
  }

  const result = data.result || {};
  const upiIntentUrl = result.upi_intent_url;
  const paymentUrl = result.payment_url;
  const merchantOrderId = result.orderId;

  let qr_code = null;
  if (upiIntentUrl) {
    try {
      qr_code = await QRCode.toDataURL(upiIntentUrl, { width: 300, margin: 2 });
      console.log('✅ MeroRecharge: QR code generated from upi_intent_url');
    } catch (qrErr) {
      console.error('⚠️ MeroRecharge: QR generation failed:', qrErr.message);
    }
  }

  return {
    bank_name: 'UPI Payment',
    account_number: null,
    ifsc: null,
    upi_id: upiIntentUrl || paymentUrl || null,
    qr_code,
    account_holder_name: null,
    reference_id: merchantOrderId || reference_id,
  };
};

const submitProof = async (agent, { reference_id, utr }) => {
  console.log('MeroRecharge: skipping proof submission, callback will confirm');
};

const parseWebhook = (body) => {
  const result = body.result || body;
  return {
    reference_id: result.orderId || result.order_id || body.orderId || body.order_id || null,
    status: result.txnStatus || result.status || body.status || null,
    utr: result.utr || body.utr || null,
  };
};

const isConfirmed = (status) => {
  if (!status) return false;
  const s = String(status).toUpperCase();
  return ['COMPLETED', 'SUCCESS', 'APPROVED'].includes(s);
};

const isFailed = (status) => {
  if (!status) return false;
  const s = String(status).toUpperCase();
  return ['FAILED', 'FAILURE', 'REJECTED', 'ERROR', 'EXPIRED', 'CANCELLED'].includes(s);
};

const checkStatus = async (agent, { merchant_order_id, reference_id }) => {
  const userToken = agent.api_key;
  const statusEndpoint = agent.api_endpoint.replace(/\/create-order\/?$/, '/check-order-status');
  const orderId = reference_id || merchant_order_id;

  const params = new URLSearchParams();
  params.append('user_token', userToken);
  params.append('order_id', orderId);

  const response = await axios.post(statusEndpoint, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 10000,
    httpsAgent: merorechargeHttpsAgent,
  });

  const data = response.data;

  if (!data || String(data.status).toUpperCase() === 'ERROR') {
    return null;
  }

  return data.result || data;
};

module.exports = {
  createPayment,
  submitProof,
  parseWebhook,
  isConfirmed,
  isFailed,
  checkStatus,
};
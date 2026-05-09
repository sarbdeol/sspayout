const axios = require('axios');
const https = require('https');
const tls = require('tls');
const QRCode = require('qrcode');

// ---------- HTTPS agent for MeroRecharge ----------
//
// MeroRecharge serves an incomplete TLS chain (missing the Let's Encrypt R13
// intermediate cert). `openssl s_client` returns "Verify return code: 21
// (unable to verify the first certificate)".
//
// Their cert IS valid — Let's Encrypt is a trusted CA — but they fail to
// transmit the intermediate cert, so default Node.js validation breaks.
//
// Fix: explicitly pass Node's bundled root CA list to the HTTPS agent. This
// keeps full validation enabled (rejectUnauthorized: true) but uses Node's
// known-good Mozilla CA bundle, which contains the ISRG roots needed for
// Let's Encrypt chain reconstruction via AIA extension.

const merorechargeHttpsAgent = new https.Agent({
  rejectUnauthorized: true,
  ca: tls.rootCertificates,
  keepAlive: true,
});

// ---------- Standard agent interface ----------

/**
 * MeroRecharge — UPI payment provider.
 * Auth: `user_token` field in request body (no signature, no encryption).
 * Endpoints:
 *   POST https://merorecharge.com/api/create-order
 *   POST https://merorecharge.com/api/check-order-status
 *
 * Confirmation: webhook callback to the URL configured in MeroRecharge dashboard.
 * Status check: also available via /check-order-status as fallback.
 *
 * NOTE: We store MeroRecharge's "user_token" in the agent.api_key column.
 */

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
    remark: order_id, // pass order_id as remark so it's visible in their dashboard
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

  // MeroRecharge returns status as boolean true on success, "false" string on error.
  if (!data || data.status !== true) {
    throw new Error(data?.message || 'MeroRecharge failed to create order');
  }

  const result = data.result || {};
  const upiIntentUrl = result.upi_intent_url;
  const paymentUrl = result.payment_url;
  const merchantOrderId = result.orderId;

  // Generate QR from UPI deeplink (their primary output)
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
  // MeroRecharge is callback-only — they confirm via webhook to the configured URL.
  console.log('MeroRecharge: skipping proof submission, callback will confirm');
};

/**
 * Parse MeroRecharge's webhook callback.
 *
 * Their webhook payload isn't fully documented, but based on their status check
 * response shape, the webhook likely contains similar fields. We try a few
 * common field names defensively.
 */
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

// ---------- Status check (form-encoded) ----------

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
const axios = require('axios');
const QRCode = require('qrcode');

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
  });

  const data = response.data;

  // MeroRecharge returns status as boolean true on success, "false" string on error.
  if (!data || data.status !== true) {
    throw new Error(data?.message || 'MeroRecharge failed to create order');
  }

  const result = data.result || {};
  const upiIntentUrl = result.upi_intent_url;
  const paymentUrl = result.payment_url;
  const merchantOrderId = result.orderId; // their order id, e.g. "1234561705047510"

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
    upi_id: upiIntentUrl || paymentUrl || null, // tap-to-pay deeplink
    qr_code,
    account_holder_name: null,
    // Store MeroRecharge's orderId as reference_id so webhook lookups find it.
    // MeroRecharge will send their orderId back in the webhook.
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
 *
 * Expected fields: status, orderId / order_id, utr, amount, txnStatus
 */
const parseWebhook = (body) => {
  const result = body.result || body; // some providers wrap, some don't
  return {
    // Match by orderId (MeroRecharge's id, which we stored as reference_id)
    reference_id: result.orderId || result.order_id || body.orderId || body.order_id || null,
    status: result.txnStatus || result.status || body.status || null,
    utr: result.utr || body.utr || null,
  };
};

// MeroRecharge uses these in their status check response:
//   txnStatus: "COMPLETED"
//   status: "SUCCESS"
// We accept both since the webhook format isn't fully documented.
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

/**
 * Live status check via MeroRecharge's check-order-status API.
 * Used by getPayinStatus when DB shows non-terminal state.
 *
 * Returns the `result` object: { txnStatus, status, orderId, amount, date, utr }
 * Returns null on failure.
 */
const checkStatus = async (agent, { merchant_order_id, reference_id }) => {
  const userToken = agent.api_key;

  // Their endpoint is /check-order-status. Replace /create-order in api_endpoint.
  const statusEndpoint = agent.api_endpoint.replace(/\/create-order\/?$/, '/check-order-status');

  // Use their orderId (we stored it as reference_id), fall back to merchant_order_id.
  const orderId = reference_id || merchant_order_id;

  // They want application/x-www-form-urlencoded
  const params = new URLSearchParams();
  params.append('user_token', userToken);
  params.append('order_id', orderId);

  const response = await axios.post(statusEndpoint, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 10000,
  });

  const data = response.data;

  // Their status check uses status="COMPLETED" (string) on success, status="ERROR" on failure
  if (!data || String(data.status).toUpperCase() === 'ERROR') {
    return null;
  }

  // Return result object so getPayinStatus can read .status / .utr / .amount
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
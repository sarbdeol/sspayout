const axios = require('axios');
const crypto = require('crypto');
const QRCode = require('qrcode');

// ---------- HMAC SHA256 signature ----------

/**
 * Build canonical string from sorted fields and HMAC-SHA256 sign with apiSecret.
 * Matches HandyPay's PHP example:
 *   ksort($dataToSign);
 *   $canonical = urldecode(http_build_query($dataToSign));
 *   $signature = hash_hmac('sha256', $canonical, $apiSecret);
 *
 * URL-encoded form: keys sorted ASC, joined as key=value pairs with &.
 * `urldecode` undoes encoding so values appear raw in canonical string.
 */
const buildSignature = (fields, apiSecret) => {
  const keys = Object.keys(fields).sort();
  const canonical = keys.map(k => `${k}=${fields[k]}`).join('&');
  return crypto.createHmac('sha256', apiSecret).update(canonical).digest('hex');
};

// ---------- Helpers for safe customer defaults ----------

/**
 * Validate Indian mobile: 10 digits, starts with 6-9, not all-same digit.
 * Maxpe rejects 9999999999 and similar repeating sequences.
 */
const isValidIndianMobile = (m) => {
  if (!m) return false;
  const s = String(m).replace(/\D/g, ''); // strip non-digits
  if (s.length !== 10) return false;
  if (!/^[6-9]/.test(s)) return false;
  if (/^(\d)\1{9}$/.test(s)) return false; // all same digit
  return true;
};

/**
 * Basic email format check + reject reserved/test domains that strict
 * validators (like Maxpe) bounce.
 */
const isValidEmail = (e) => {
  if (!e) return false;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return false;
  const blocked = ['example.com', 'example.org', 'example.net', 'test.com', 'localhost'];
  const domain = e.split('@')[1].toLowerCase();
  return !blocked.includes(domain);
};

/**
 * Generate a deterministic, valid-looking mobile from order_id.
 * Starts with 7, then 9 digits derived from a hash of order_id.
 * Used when the caller didn't pass a valid mobile.
 */
const fallbackMobile = (order_id) => {
  const hash = crypto.createHash('sha256').update(String(order_id)).digest('hex');
  const digits = BigInt('0x' + hash.slice(0, 12)).toString().slice(0, 9).padStart(9, '0');
  return '7' + digits;
};

const fallbackEmail = (order_id) =>
  `customer+${String(order_id).toLowerCase().replace(/[^a-z0-9]/g, '')}@sspay.online`;

// ---------- Standard agent interface ----------

const createPayment = async (agent, { amount, order_id, reference_id, customer }) => {
  const apiKey = agent.api_key;
  const apiSecret = agent.webhook_secret; // we use webhook_secret column for HandyPay's API secret

  if (!apiKey || !apiSecret) {
    throw new Error('HandyPay agent missing api_key or webhook_secret (api_secret)');
  }

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomBytes(8).toString('hex');

  // ---------- Build payload with validated customer fields ----------

  const rawMobile = customer?.mobile;
  const rawEmail = customer?.email;

  const mobile = isValidIndianMobile(rawMobile)
    ? String(rawMobile).replace(/\D/g, '')
    : fallbackMobile(order_id);

  const email = isValidEmail(rawEmail)
    ? rawEmail
    : fallbackEmail(order_id);

  if (rawMobile && !isValidIndianMobile(rawMobile)) {
    console.warn(`⚠️ HandyPay: invalid mobile "${rawMobile}" provided, using fallback ${mobile}`);
  }
  if (rawEmail && !isValidEmail(rawEmail)) {
    console.warn(`⚠️ HandyPay: invalid email "${rawEmail}" provided, using fallback ${email}`);
  }

  const payload = {
    name: (customer?.name || 'Customer').trim(),
    mobile,
    email,
    amount: String(amount),
    merchant_order_id: order_id,
  };

  // Fields used for signature: payload fields + nonce + timestamp
  const dataToSign = {
    amount: payload.amount,
    email: payload.email.trim(),
    merchant_order_id: payload.merchant_order_id.trim(),
    mobile: payload.mobile.trim(),
    name: payload.name.trim(),
    nonce,
    timestamp,
  };

  const signature = buildSignature(dataToSign, apiSecret);

  console.log(`🔵 HandyPay: creating payment for order ${order_id} (nonce=${nonce}, mobile=${mobile}, email=${email})`);

  const response = await axios.post(agent.api_endpoint, payload, {
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-API-KEY': apiKey,
      'X-TIMESTAMP': timestamp,
      'X-NONCE': nonce,
      'X-SIGNATURE': signature,
    },
    timeout: 15000,
  });

  const data = response.data;

  if (!data || data.status !== true) {
    throw new Error(data?.message || 'HandyPay failed to create payment');
  }

  // HandyPay returns a UPI deeplink — generate QR image from it
  const upiDeeplink = data.upi_deeplink;
  let qr_code = null;
  if (upiDeeplink) {
    try {
      qr_code = await QRCode.toDataURL(upiDeeplink, { width: 300, margin: 2 });
      console.log('✅ HandyPay: QR code generated from upi_deeplink');
    } catch (qrErr) {
      console.error('⚠️ HandyPay: QR generation failed:', qrErr.message);
    }
  }

  return {
    bank_name: 'UPI Payment',
    account_number: null,
    ifsc: null,
    upi_id: upiDeeplink || null, // store full UPI deeplink so user can tap to open UPI app
    qr_code,
    account_holder_name: null,
    // HandyPay matches by merchant_order_id (= our order_id) in callbacks.
    // Store order_id as reference_id so the webhook lookup `WHERE reference_id=$1` finds it.
    reference_id: order_id,
  };
};

const submitProof = async (agent, { reference_id, utr }) => {
  // HandyPay is callback-only — confirmation comes via the configured payin webhook.
  console.log('HandyPay: skipping proof submission, callback will confirm');
};

/**
 * Parse HandyPay's callback body:
 *   { status: "SUCCESS", transaction_details: { amount, merchant_order_id, utr } }
 */
const parseWebhook = (body) => {
  const td = body.transaction_details || {};
  return {
    // HandyPay identifies payments by merchant_order_id (our order_id), not reference_id.
    // The webhook handler reads this and looks up payments by order_id for HandyPay.
    reference_id: td.merchant_order_id || null,
    status: body.status || null,
    utr: td.utr || null,
  };
};

const isConfirmed = (status) =>
  ['SUCCESS', 'success'].includes(status);

const isFailed = (status) =>
  ['FAILED', 'failed', 'FAILURE', 'failure', 'REJECTED', 'rejected'].includes(status);

// ---------- Status check (HandyPay-specific helper, exposed for /payin/status route) ----------

/**
 * Live status check via HandyPay's status API.
 * Used as fallback when our DB shows a non-terminal state.
 *
 * Returns: { status, amount, utr, charge, gst, paid_amount, created_at } or null on failure.
 */
const checkStatus = async (agent, { merchant_order_id }) => {
  const apiKey = agent.api_key;

  // HandyPay's status endpoint: replace /create-payment with /status
  // (The base URL pattern in their docs is /api/prod/payin4/{create-payment|status})
  const statusEndpoint = agent.api_endpoint.replace(/\/create-payment\/?$/, '/status');

  // They use multipart/form-data for status check (per their cURL example with --form)
  const FormData = require('form-data');
  const form = new FormData();
  form.append('merchant_order_id', merchant_order_id);

  const response = await axios.post(statusEndpoint, form, {
    headers: { 'X-API-KEY': apiKey, ...form.getHeaders() },
    timeout: 10000,
  });

  if (!response.data || response.data.status !== true) {
    return null;
  }

  return response.data.data || null;
};

module.exports = {
  createPayment,
  submitProof,
  parseWebhook,
  isConfirmed,
  isFailed,
  checkStatus,           // HandyPay-specific
  _buildSignature: buildSignature,  // exposed for testing
};
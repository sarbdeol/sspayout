const axios = require('axios');
const crypto = require('crypto');
const QRCode = require('qrcode');

// ---------- Encryption helpers ----------

/**
 * AES-CBC encrypt with random IV prepended to ciphertext, base64 encoded.
 * Matches Solwio's Java encryptMData(): IV (16 bytes) + ciphertext, base64.
 * Key length determines AES variant: 16=AES-128, 24=AES-192, 32=AES-256.
 */
const encryptPayload = (plaintext, encKey) => {
  const keyBuf = Buffer.from(encKey, 'utf8');
  const algo =
    keyBuf.length === 16 ? 'aes-128-cbc' :
    keyBuf.length === 24 ? 'aes-192-cbc' :
    keyBuf.length === 32 ? 'aes-256-cbc' :
    null;

  if (!algo) throw new Error(`Invalid Solwio enckey length: ${keyBuf.length} bytes (expected 16/24/32)`);

  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algo, keyBuf, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const combined = Buffer.concat([iv, encrypted]);
  return combined.toString('base64');
};

/**
 * AES-CBC decrypt: input is base64 of (IV + ciphertext).
 * Matches Solwio's Java decryptData().
 */
const decryptPayload = (encryptedBase64, encKey) => {
  const keyBuf = Buffer.from(encKey, 'utf8');
  const algo =
    keyBuf.length === 16 ? 'aes-128-cbc' :
    keyBuf.length === 24 ? 'aes-192-cbc' :
    keyBuf.length === 32 ? 'aes-256-cbc' :
    null;

  if (!algo) throw new Error(`Invalid Solwio enckey length: ${keyBuf.length} bytes`);

  const combined = Buffer.from(encryptedBase64, 'base64');
  const iv = combined.subarray(0, 16);
  const ciphertext = combined.subarray(16);

  const decipher = crypto.createDecipheriv(algo, keyBuf, iv);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
};

/**
 * CRC32 checksum of a string (matches Solwio's getChecksumCRC32).
 * Returns the unsigned 32-bit integer as a string.
 */
const crc32 = (str) => {
  const buf = Buffer.from(str, 'utf8');
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = crc ^ buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
    }
  }
  crc = (crc ^ 0xFFFFFFFF) >>> 0;
  return crc.toString();
};

// ---------- Helper: read mid from agent ----------

const getMid = (agent) => {
  // mid is stored in payload_structure JSONB column
  const ps = agent.payload_structure || {};
  const mid = ps.mid;
  if (!mid) throw new Error('Solwio agent missing mid in payload_structure');
  return mid;
};

// ---------- Standard agent interface ----------

const createPayment = async (agent, { amount, order_id, reference_id, customer }) => {
  const mid = getMid(agent);
  const enckey = agent.api_key;

  // Build plaintext payload (everything Solwio needs)
  const plainPayload = {
    mid,
    enckey,
    orderNo: order_id,
    amount: String(amount),
    userId: `USR-${Date.now()}`,
    currency: 'INR',
    txnReqType: 'Slupi',
    dateOfReg: new Date().toISOString().split('T')[0], // YYYY-MM-DD
    respUrl: (process.env.APP_URL || 'https://ss.sspay.online') + '/api/webhook/payment-status',
    customerVpa: 'dummy@upi', // Solwio doesn't validate this for intent-based UPI
    name: customer?.name || 'Customer',
    emailId: customer?.email || 'customer@example.com',
    mobileNo: customer?.mobile || '9999999999',
    udf1: '0.0', // Latitude (dummy)
    udf2: '0.0', // Longitude (dummy)
    udf3: '', udf4: '', udf5: '', udf6: '', udf7: '',
    udf8: '', udf9: '', udf10: '', udf11: '', udf12: '', udf13: '', udf14: '',
  };

  // Encrypt the entire payload, wrap in { mid, payload }
  const encryptedPayload = encryptPayload(JSON.stringify(plainPayload), enckey);
  const requestBody = { mid, payload: encryptedPayload };

  console.log('🔵 Solwio: creating payment for order', order_id);

  const response = await axios.post(agent.api_endpoint, requestBody, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 15000,
  });

  // Response is plaintext JSON (not encrypted on success per docs)
  const data = response.data;

  if (!data || data.statusCode !== 'OK' || data.message !== 'SUCCESS') {
    throw new Error(data?.message || 'Solwio failed to create payment');
  }

  const r = data.responseData || {};

  // Solwio returns a UPI intent string (qrString) — generate QR image from it
  let qr_code = null;
  if (r.qrString) {
    try {
      qr_code = await QRCode.toDataURL(r.qrString, { width: 300, margin: 2 });
      console.log('✅ Solwio: QR code generated from qrString');
    } catch (qrErr) {
      console.error('⚠️ Solwio: QR generation failed:', qrErr.message);
    }
  }

  return {
    bank_name: 'UPI Payment',
    account_number: null,
    ifsc: null,
    upi_id: r.qrString || null, // Store full UPI intent string so user can tap to open UPI app
    qr_code,
    account_holder_name: null,
    reference_id: r.txnId || reference_id, // Use Solwio's txnId for callback matching
  };
};

const submitProof = async (agent, { reference_id, utr }) => {
  // Solwio is callback-only — no proof submission endpoint.
  // Confirmation comes via the encrypted callback to respUrl.
  console.log('Solwio: skipping proof submission, callback will confirm');
};

/**
 * Parse Solwio's encrypted callback body { mid, data, signature }.
 * Returns { reference_id, status, utr } in the standard shape.
 *
 * IMPORTANT: This is called by webhookHandler. It needs the agent's enckey
 * to decrypt, which the handler must look up before calling this. To keep
 * the standard interface, we expect the body to already have a `_decrypted`
 * field set by the handler. See webhookHandler.js for how this works.
 */
const parseWebhook = (body) => {
  const decrypted = body._decrypted;
  if (!decrypted) {
    // Defensive — handler should have decrypted before calling
    return { reference_id: null, status: null, utr: null };
  }

  return {
    reference_id: decrypted.txnId,           // matches what we stored in payments.reference_id
    status: decrypted.txnStatus,              // 'success' / 'failed' / etc
    utr: decrypted.custRefNo || null,         // Solwio uses custRefNo as the bank reference
  };
};

const isConfirmed = (status) =>
  ['success', 'SUCCESS'].includes(status);

const isFailed = (status) =>
  ['failed', 'FAILED', 'failure', 'FAILURE', 'declined', 'DECLINED'].includes(status);

// ---------- Exported helpers (used by webhookHandler) ----------

module.exports = {
  createPayment,
  submitProof,
  parseWebhook,
  isConfirmed,
  isFailed,
  // Internal helpers exposed for webhookHandler to decrypt + verify before parseWebhook
  _decryptPayload: decryptPayload,
  _crc32: crc32,
};
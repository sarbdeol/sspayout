const axios = require('axios');
const FormData = require('form-data');
const QRCode = require('qrcode');

const createPayment = async (agent, { amount, order_id, reference_id, customer }) => {
  const form = new FormData();
  form.append('username', agent.api_key);
  form.append('name', customer?.name || 'Customer');
  form.append('mobile', customer?.mobile || '9999999999');
  form.append('email', customer?.email || 'customer@example.com');
  form.append('amount', String(amount));
  form.append('order_id', order_id);

  const response = await axios.post(agent.api_endpoint, form, {
    headers: { ...form.getHeaders() },
    timeout: 10000
  });

  if (!response.data || !response.data.success)
    throw new Error(response.data?.message || 'BhumiPay failed to create payment');

  const d = response.data;

  // Generate QR code from upi_link since BhumiPay returns null qr_code
  let qr_code = d.qr_code || null;
  if (!qr_code && d.upi_link) {
    try {
      qr_code = await QRCode.toDataURL(d.upi_link, { width: 300, margin: 2 });
      console.log('✅ QR code generated from upi_link');
    } catch (qrErr) {
      console.error('⚠️ QR generation failed:', qrErr.message);
    }
  }

  return {
    bank_name: 'UPI Payment',
    account_number: null,
    ifsc: null,
    upi_id: d.upi_link || null,
    qr_code: qr_code,
    account_holder_name: null,
    reference_id: order_id,
  };
};

const submitProof = async (agent, { reference_id, utr }) => {
  // BhumiPay has no proof endpoint — confirmation comes via webhook only
  console.log('BhumiPay: skipping proof submission, webhook will confirm');
};

const parseWebhook = (body) => ({
  reference_id: body.transaction_details?.transaction_id || body.order_id,
  status: body.status,
  utr: body.transaction_details?.utr,
});

const isConfirmed = (status) =>
  ['success', 'SUCCESS'].includes(status);

const isFailed = (status) =>
  ['failed', 'FAILED', 'failure', 'FAILURE'].includes(status);

module.exports = { createPayment, submitProof, parseWebhook, isConfirmed, isFailed };
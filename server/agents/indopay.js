const axios = require('axios');

const createPayment = async (agent, { amount, order_id, reference_id }) => {
  const payload = {
    amount: String(amount),
    webhook_url: (process.env.APP_URL || 'https://ss.sspay.online') + '/api/webhook/payment-status'
  };

  const response = await axios.post(agent.api_endpoint, payload, {
    headers: { 'api-key': agent.api_key, 'Content-Type': 'application/json' },
    timeout: 10000
  });

  if (!response.data || response.data.code !== 200)
    throw new Error(response.data?.message || 'Agent failed to create payment');

  const d = response.data.data;
  return {
    bank_name: d.bank_name || null,
    account_number: d.account_number || null,
    ifsc: d.ifsc_code || null,
    upi_id: d.upi_id || null,
    qr_code: d.qrCode || null,
    account_holder_name: d.account_holder_name || null,
    reference_id: d.transaction_id || reference_id,
  };
};

const submitProof = async (agent, { reference_id, utr, payment_proof }) => {
  const proofEndpoint = agent.api_endpoint.replace('payin-create', 'payment-proof');
  console.log('✅ Submitting proof to:', proofEndpoint);
  await axios.patch(proofEndpoint, {
    transactionId: reference_id,
    utrNumber: utr || undefined,
    paymentProof: payment_proof || undefined,
  }, {
    headers: { 'api-key': agent.api_key }
  });
  console.log('✅ Payment proof submitted successfully');
};

const parseWebhook = (body) => ({
  reference_id: body.reference_id || body.transactionId,
  status: body.status,
  utr: body.utr || body.utrNumber,
});

const isConfirmed = (status) =>
  ['approved', 'confirmed', 'success', 'paid'].includes(status?.toLowerCase());

const isFailed = (status) =>
  ['reject', 'rejected', 'failed'].includes(status?.toLowerCase());

module.exports = { createPayment, submitProof, parseWebhook, isConfirmed, isFailed };
const db = require('../models/db');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const createPayin = async (req, res) => {
  try {
    const apiKey = req.headers['api-key'];
    const { amount, webhook_url } = req.body;

    // Validate api-key
    if (!apiKey)
      return res.status(401).json({ code: 401, message: 'api-key header required', error: true, data: {} });

    if (!amount)
      return res.status(400).json({ code: 400, message: 'amount is required', error: true, data: {} });

    // Find merchant by api_key
    const merchantResult = await db.query(`
      SELECT m.*, u.is_active FROM merchants m
      JOIN users u ON u.id = m.user_id
      WHERE m.api_key = $1
    `, [apiKey]);

    if (merchantResult.rows.length === 0)
      return res.status(401).json({ code: 401, message: 'Invalid api-key', error: true, data: {} });

    const merchant = merchantResult.rows[0];

    if (!merchant.is_active)
      return res.status(403).json({ code: 403, message: 'Merchant account is inactive', error: true, data: {} });

    // Get primary agent
    const agentResult = await db.query(`
      SELECT a.* FROM agents a
      JOIN merchant_agents ma ON ma.agent_id = a.id
      WHERE ma.merchant_id = $1 AND ma.is_primary = TRUE AND a.is_active = TRUE
      LIMIT 1
    `, [merchant.id]);

    if (agentResult.rows.length === 0)
      return res.status(400).json({ code: 400, message: 'No active agent assigned', error: true, data: {} });

    const agent = agentResult.rows[0];

    // Calculate fees
    const merchantCommission = parseFloat(merchant.commission_rate);
    const agentCommission = parseFloat(merchant.agent_commission_rate);
    const platformFeePercent = merchantCommission - agentCommission;
    const feeAmount = (amount * merchantCommission) / 100;
    const agentFeeAmount = (amount * agentCommission) / 100;
    const platformFeeAmount = (amount * platformFeePercent) / 100;
    const merchantCreditAmount = amount - feeAmount;

    const order_id = `ORD-${Date.now()}`;
    let reference_id = `PAY-${uuidv4().split('-')[0].toUpperCase()}-${Date.now()}`;
    const expires_at = new Date(Date.now() + 30 * 60 * 1000);

    // Call BytexHub
    let bankDetails = { bank_name: null, account_number: null, ifsc: null, upi_id: null, qr_code: null, account_holder_name: null };
    try {
      const agentResponse = await axios.post(agent.api_endpoint, {
        amount: String(amount),
        webhook_url: 'https://ss.sspay.online/api/webhook/payment-status'
      }, {
        headers: { 'api-key': agent.api_key, 'Content-Type': 'application/json' },
        timeout: 10000
      });

      if (!agentResponse.data || agentResponse.data.code !== 200) {
        return res.status(400).json({ code: 400, message: agentResponse.data?.message || 'Payment gateway error', error: true, data: {} });
      }

      const d = agentResponse.data.data;
      bankDetails = {
        bank_name: d.bank_name,
        account_number: d.account_number,
        ifsc: d.ifsc_code,
        upi_id: d.upi_id || null,
        qr_code: d.qrCode || null,
        account_holder_name: d.account_holder_name || null,
      };
      if (d.transaction_id) reference_id = d.transaction_id;

    } catch (agentErr) {
      if (agentErr.response) {
        console.error('Agent error:', JSON.stringify(agentErr.response.data));
      } else {
        console.error('Agent error:', agentErr.message);
      }
      return res.status(400).json({ code: 400, message: agentErr.response?.data?.message || 'Payment gateway unavailable', error: true, data: {} });
    }

    // Save payment
    const paymentResult = await db.query(`
      INSERT INTO payments (merchant_id, agent_id, amount, order_id, reference_id,
        bank_name, account_number, ifsc, upi_id, qr_code, account_holder_name,
        webhook_url, status, merchant_commission, agent_commission,
        platform_fee_amount, merchant_credit_amount, agent_fee_amount, expires_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'awaiting_transfer',$13,$14,$15,$16,$17,$18)
      RETURNING *
    `, [
      merchant.id, agent.id, amount, order_id, reference_id,
      bankDetails.bank_name, bankDetails.account_number, bankDetails.ifsc,
      bankDetails.upi_id, bankDetails.qr_code, bankDetails.account_holder_name,
      webhook_url || null,
      merchantCommission, agentCommission, platformFeeAmount, merchantCreditAmount,
      agentFeeAmount, expires_at
    ]);

    await db.query(`
      INSERT INTO transaction_history (merchant_id, payment_id, event, data)
      VALUES ($1, $2, 'payment_created', $3)
    `, [merchant.id, paymentResult.rows[0].id, JSON.stringify({ amount, order_id, source: 'api' })]);

    // Return in BytexHub format
    res.json({
      code: 200,
      message: 'Payment Created Successfully',
      data: {
        bank_name: bankDetails.bank_name,
        ifsc_code: bankDetails.ifsc,
        account_number: bankDetails.account_number,
        account_holder_name: bankDetails.account_holder_name,
        upi_id: bankDetails.upi_id,
        qr_code: bankDetails.qr_code,
        transaction_id: reference_id,
        expires_at: expires_at
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, message: 'Server error', error: true, data: {} });
  }
};

const submitUTRPayin = async (req, res) => {
  try {
    const apiKey = req.headers['api-key'];
    const { transaction_id, utr } = req.body;

    // Validate
    if (!apiKey)
      return res.status(401).json({ code: 401, message: 'api-key header required', error: true, data: {} });

    if (!transaction_id || !utr)
      return res.status(400).json({ code: 400, message: 'transaction_id and utr are required', error: true, data: {} });

    // Find merchant by api_key
    const merchantResult = await db.query(`
      SELECT m.*, u.is_active FROM merchants m
      JOIN users u ON u.id = m.user_id
      WHERE m.api_key = $1
    `, [apiKey]);

    if (merchantResult.rows.length === 0)
      return res.status(401).json({ code: 401, message: 'Invalid api-key', error: true, data: {} });

    const merchant = merchantResult.rows[0];

    if (!merchant.is_active)
      return res.status(403).json({ code: 403, message: 'Merchant account is inactive', error: true, data: {} });

    // Update UTR
    const result = await db.query(`
      UPDATE payments SET utr=$1, status='utr_submitted', updated_at=NOW()
      WHERE reference_id=$2 AND merchant_id=$3 AND status='awaiting_transfer'
      RETURNING *
    `, [utr, transaction_id, merchant.id]);

    if (result.rows.length === 0)
      return res.status(404).json({ code: 404, message: 'Transaction not found or already submitted', error: true, data: {} });

    const payment = result.rows[0];

    // Log history
    await db.query(`
      INSERT INTO transaction_history (merchant_id, payment_id, event, data)
      VALUES ($1, $2, 'utr_submitted', $3)
    `, [merchant.id, payment.id, JSON.stringify({ utr, source: 'api' })]);

    // Submit proof to agent
    try {
      const agentResult = await db.query('SELECT * FROM agents WHERE id=$1', [payment.agent_id]);
      if (agentResult.rows.length > 0) {
        const agent = agentResult.rows[0];
        const { getAgentHandler } = require('../agents');
        const handler = getAgentHandler(agent.api_endpoint);
        await handler.submitProof(agent, { reference_id: payment.reference_id, utr });
      }
    } catch (proofErr) {
      console.error('Failed to submit proof to agent:', proofErr.message);
    }

    res.json({
      code: 200,
      message: 'UTR submitted successfully',
      data: {
        transaction_id: payment.reference_id,
        utr: payment.utr,
        status: payment.status
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, message: 'Server error', error: true, data: {} });
  }
};

module.exports = { createPayin, submitUTRPayin };
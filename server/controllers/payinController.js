const db = require('../models/db');
const { v4: uuidv4 } = require('uuid');
const { getAgentHandler } = require('../agents');

// ============================================================
// Customer field validators
// ============================================================

const isValidIndianMobile = (m) => {
  if (!m) return false;
  const s = String(m).replace(/\D/g, '');
  if (s.length !== 10) return false;
  if (!/^[6-9]/.test(s)) return false;
  if (/^(\d)\1{9}$/.test(s)) return false; // reject all-same-digit (9999999999, 8888888888)
  return true;
};

const isValidEmail = (e) => {
  if (!e) return false;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return false;
  const blocked = ['example.com', 'example.org', 'example.net', 'test.com', 'localhost'];
  const domain = e.split('@')[1].toLowerCase();
  return !blocked.includes(domain);
};

const isValidName = (n) => {
  if (!n) return false;
  const s = String(n).trim();
  return s.length >= 2 && s.length <= 100;
};

/**
 * Validate all required customer fields. Returns an array of error messages,
 * empty if all valid.
 */
const validateCustomer = ({ name, mobile, email }) => {
  const errors = [];
  if (!isValidName(name)) {
    errors.push(name
      ? 'name must be 2-100 characters'
      : 'name is required');
  }
  if (!isValidIndianMobile(mobile)) {
    errors.push(mobile
      ? 'mobile must be a valid 10-digit Indian number (starts with 6-9, not all same digit)'
      : 'mobile is required');
  }
  if (!isValidEmail(email)) {
    errors.push(email
      ? 'email must be a valid email address (no example.com / test domains)'
      : 'email is required');
  }
  return errors;
};

// ============================================================
// POST /api/payin — Create payment
// ============================================================

const createPayin = async (req, res) => {
  try {
    const apiKey = req.headers['api-key'];
    const { amount, webhook_url, name, mobile, email, order_id: clientOrderId } = req.body;

    if (!apiKey)
      return res.status(401).json({ code: 401, message: 'api-key header required', error: true, data: {} });

    if (!amount)
      return res.status(400).json({ code: 400, message: 'amount is required', error: true, data: {} });

    // -------- Strict customer validation --------
    const customerErrors = validateCustomer({ name, mobile, email });
    if (customerErrors.length > 0) {
      return res.status(400).json({
        code: 400,
        message: 'Invalid customer details',
        error: true,
        data: { errors: customerErrors },
      });
    }

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

    // Use merchant-provided order_id if given (for idempotency), otherwise generate
    const order_id = clientOrderId || `ORD-${Date.now()}`;
    let reference_id = `PAY-${uuidv4().split('-')[0].toUpperCase()}-${Date.now()}`;
    const expires_at = new Date(Date.now() + 30 * 60 * 1000);

    // ---------- Call agent via handler system (works for any agent) ----------
    let bankDetails = {
      bank_name: null,
      account_number: null,
      ifsc: null,
      upi_id: null,
      qr_code: null,
      account_holder_name: null,
    };

    try {
      const handler = getAgentHandler(agent.api_endpoint);
      const result = await handler.createPayment(agent, {
        amount,
        order_id,
        reference_id,
        customer: {
          name: String(name).trim(),
          mobile: String(mobile).replace(/\D/g, ''),
          email: String(email).trim().toLowerCase(),
        },
      });
      bankDetails = result;
      if (result.reference_id) reference_id = result.reference_id;
    } catch (agentErr) {
      console.error('Agent API error:', agentErr.message);
      if (agentErr.response) {
        console.error('Agent API error body:', JSON.stringify(agentErr.response.data));
      }
      return res.status(400).json({
        code: 400,
        message: agentErr.response?.data?.message || agentErr.message || 'Payment gateway unavailable',
        error: true,
        data: {},
      });
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
      agentFeeAmount, expires_at,
    ]);

    await db.query(`
      INSERT INTO transaction_history (merchant_id, payment_id, event, data)
      VALUES ($1, $2, 'payment_created', $3)
    `, [merchant.id, paymentResult.rows[0].id, JSON.stringify({ amount, order_id, source: 'api', agent_id: agent.id })]);

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
        order_id,
        expires_at,
      },
    });
  } catch (err) {
    console.error('createPayin error:', err);
    res.status(500).json({ code: 500, message: 'Server error', error: true, data: {} });
  }
};

// ============================================================
// POST /api/payin/utr — Submit UTR (unchanged)
// ============================================================

const submitUTRPayin = async (req, res) => {
  try {
    const apiKey = req.headers['api-key'];
    const { transaction_id, utr } = req.body;

    if (!apiKey)
      return res.status(401).json({ code: 401, message: 'api-key header required', error: true, data: {} });

    if (!transaction_id || !utr)
      return res.status(400).json({ code: 400, message: 'transaction_id and utr are required', error: true, data: {} });

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

    const result = await db.query(`
      UPDATE payments SET utr=$1, status='utr_submitted', updated_at=NOW()
      WHERE reference_id=$2 AND merchant_id=$3 AND status='awaiting_transfer'
      RETURNING *
    `, [utr, transaction_id, merchant.id]);

    if (result.rows.length === 0)
      return res.status(404).json({ code: 404, message: 'Transaction not found or already submitted', error: true, data: {} });

    const payment = result.rows[0];

    await db.query(`
      INSERT INTO transaction_history (merchant_id, payment_id, event, data)
      VALUES ($1, $2, 'utr_submitted', $3)
    `, [merchant.id, payment.id, JSON.stringify({ utr, source: 'api' })]);

    try {
      const agentResult = await db.query('SELECT * FROM agents WHERE id=$1', [payment.agent_id]);
      if (agentResult.rows.length > 0) {
        const agent = agentResult.rows[0];
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
        status: payment.status,
      },
    });
  } catch (err) {
    console.error('submitUTRPayin error:', err);
    res.status(500).json({ code: 500, message: 'Server error', error: true, data: {} });
  }
};

// ============================================================
// GET /api/payin/status/:transaction_id — Status check (unchanged from your version)
// ============================================================

const getPayinStatus = async (req, res) => {
  try {
    const apiKey = req.headers['api-key'];
    const { transaction_id } = req.params;

    if (!apiKey)
      return res.status(401).json({ code: 401, message: 'api-key header required', error: true, data: {} });

    if (!transaction_id)
      return res.status(400).json({ code: 400, message: 'transaction_id is required', error: true, data: {} });

    const merchantResult = await db.query(
      'SELECT m.*, u.is_active FROM merchants m JOIN users u ON u.id = m.user_id WHERE m.api_key = $1',
      [apiKey]
    );

    if (merchantResult.rows.length === 0)
      return res.status(401).json({ code: 401, message: 'Invalid api-key', error: true, data: {} });

    const merchant = merchantResult.rows[0];

    const paymentResult = await db.query(`
      SELECT p.*, a.api_endpoint FROM payments p
      LEFT JOIN agents a ON a.id = p.agent_id
      WHERE (p.reference_id=$1 OR p.order_id=$1) AND p.merchant_id=$2
      LIMIT 1
    `, [transaction_id, merchant.id]);

    if (paymentResult.rows.length === 0)
      return res.status(404).json({ code: 404, message: 'Transaction not found', error: true, data: {} });

    const payment = paymentResult.rows[0];
    const isTerminal = ['confirmed', 'failed', 'expired'].includes(payment.status);
    let liveCheck = null;

    if (!isTerminal && payment.api_endpoint) {
      try {
        const handler = getAgentHandler(payment.api_endpoint);
        if (typeof handler.checkStatus === 'function') {
          const agentResult = await db.query('SELECT * FROM agents WHERE id=$1', [payment.agent_id]);
          const agent = agentResult.rows[0];
          liveCheck = await handler.checkStatus(agent, {
            merchant_order_id: payment.order_id,
            reference_id: payment.reference_id,
          });
          console.log(`📡 Live status check for ${transaction_id}:`, liveCheck?.transaction_status || liveCheck?.status || 'no data');

          if (liveCheck) {
            const liveStatusRaw = liveCheck.transaction_status || liveCheck.status;

            if (handler.isConfirmed && handler.isConfirmed(liveStatusRaw)) {
              const updateResult = await db.query(`
                UPDATE payments
                SET status='confirmed', utr=COALESCE($1, utr), updated_at=NOW()
                WHERE id=$2 AND status NOT IN ('confirmed','failed','expired')
                RETURNING *
              `, [liveCheck.utr || null, payment.id]);

              if (updateResult.rows.length > 0) {
                console.log(`✅ Reconciled payment ${payment.reference_id} from status check (was: ${payment.status})`);
                await db.query(`
                  INSERT INTO transaction_history (merchant_id, payment_id, event, data)
                  VALUES ($1, $2, 'reconciled_via_status_check', $3)
                `, [merchant.id, payment.id, JSON.stringify({ previous_status: payment.status, live_check: liveCheck })]);
                payment.status = 'confirmed';
                if (liveCheck.utr) payment.utr = liveCheck.utr;
                payment.updated_at = updateResult.rows[0].updated_at;
              }
            } else if (handler.isFailed && handler.isFailed(liveStatusRaw)) {
              const updateResult = await db.query(`
                UPDATE payments
                SET status='failed', updated_at=NOW()
                WHERE id=$1 AND status NOT IN ('confirmed','failed','expired')
                RETURNING *
              `, [payment.id]);

              if (updateResult.rows.length > 0) {
                console.log(`❌ Reconciled payment ${payment.reference_id} to failed from status check (was: ${payment.status})`);
                await db.query(`
                  INSERT INTO transaction_history (merchant_id, payment_id, event, data)
                  VALUES ($1, $2, 'reconciled_via_status_check', $3)
                `, [merchant.id, payment.id, JSON.stringify({ previous_status: payment.status, live_check: liveCheck })]);
                payment.status = 'failed';
                payment.updated_at = updateResult.rows[0].updated_at;
              }
            }
          }
        }
      } catch (liveErr) {
        console.error('Live status check failed:', liveErr.message);
      }
    }

    res.json({
      code: 200,
      message: 'OK',
      data: {
        transaction_id: payment.reference_id,
        order_id: payment.order_id,
        amount: payment.amount,
        status: payment.status,
        utr: payment.utr,
        created_at: payment.created_at,
        updated_at: payment.updated_at,
        ...(liveCheck && { live_check: liveCheck }),
      },
    });
  } catch (err) {
    console.error('getPayinStatus error:', err);
    res.status(500).json({ code: 500, message: 'Server error', error: true, data: {} });
  }
};

module.exports = { createPayin, submitUTRPayin, getPayinStatus };
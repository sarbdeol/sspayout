const db = require("../models/db");
const { v4: uuidv4 } = require("uuid");
const axios = require("axios");

const createPayment = async (req, res) => {
  try {
    const { amount, order_id, webhook_url } = req.body;
    const merchant_id = req.user.merchant?.id;

    if (!merchant_id)
      return res
        .status(400)
        .json({ success: false, message: "Merchant profile not found" });
    if (!amount || !order_id)
      return res
        .status(400)
        .json({ success: false, message: "Amount and order_id required" });

    // Get merchant with commission rates
    const merchantResult = await db.query(
      "SELECT * FROM merchants WHERE id=$1 AND is_active=TRUE",
      [merchant_id],
    );
    if (merchantResult.rows.length === 0)
      return res
        .status(403)
        .json({ success: false, message: "Merchant not active" });
    const merchant = merchantResult.rows[0];

    // Get primary agent
    const agentResult = await db.query(
      `
      SELECT a.* FROM agents a
      JOIN merchant_agents ma ON ma.agent_id = a.id
      WHERE ma.merchant_id=$1 AND ma.is_primary=TRUE AND a.is_active=TRUE
      LIMIT 1
    `,
      [merchant_id],
    );

    if (agentResult.rows.length === 0)
      return res.status(400).json({
        success: false,
        message: "No active agent assigned to merchant",
      });
    const agent = agentResult.rows[0];

    // Calculate fees
    const merchantCommission = parseFloat(merchant.commission_rate);
    const agentCommission = parseFloat(merchant.agent_commission_rate);
    const platformFeePercent = merchantCommission - agentCommission;
    const feeAmount = (amount * merchantCommission) / 100;
    const agentFeeAmount = (amount * agentCommission) / 100;
    const platformFeeAmount = (amount * platformFeePercent) / 100;
    const merchantCreditAmount = amount - feeAmount;

    let reference_id = `PAY-${uuidv4().split("-")[0].toUpperCase()}-${Date.now()}`;
    const expires_at = new Date(Date.now() + 30 * 60 * 1000); // 30 mins

    // Call agent API
    let bankDetails = {
      bank_name: null,
      account_number: null,
      ifsc: null,
      upi_id: null,
      qr_code: null,
      account_holder_name: null,
    };
    try {
      const agentPayload = buildAgentPayload(agent.payload_structure, {
        amount,
        order_id,
        reference_id,
        merchant_id,
      });
      const agentResponse = await axios.post(agent.api_endpoint, agentPayload, {
        headers: {
          "api-key": agent.api_key,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      });

      // Check if response is success
      if (!agentResponse.data || agentResponse.data.code !== 200) {
        return res.status(400).json({
          success: false,
          message:
            agentResponse.data?.message || "Agent failed to create payment",
        });
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

      // Use BytexHub transaction_id as reference_id
      if (d.transaction_id) reference_id = d.transaction_id;
    } catch (agentErr) {
      if (agentErr.response) {
        console.error("Agent API error status:", agentErr.response.status);
        console.error(
          "Agent API error body:",
          JSON.stringify(agentErr.response.data, null, 2),
        );
      } else {
        console.error("Agent API error:", agentErr.message);
      }
      return res.status(400).json({
        success: false,
        message:
          agentErr.response?.data?.message ||
          "Payment gateway unavailable. Please try again.",
      });
    }

    // ✅ Only reaches here if agent API succeeded

    const paymentResult = await db.query(
      `INSERT INTO payments (merchant_id, agent_id, amount, order_id, reference_id,
    bank_name, account_number, ifsc, upi_id, qr_code, account_holder_name, 
    webhook_url, status, merchant_commission, agent_commission,
    platform_fee_amount, merchant_credit_amount, agent_fee_amount, expires_at)
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'awaiting_transfer',$13,$14,$15,$16,$17,$18)
   RETURNING *`,
      [
        merchant_id,
        agent.id,
        amount,
        order_id,
        reference_id,
        bankDetails.bank_name,
        bankDetails.account_number,
        bankDetails.ifsc,
        bankDetails.upi_id,
        bankDetails.qr_code,
        bankDetails.account_holder_name,
        webhook_url || null,
        merchantCommission,
        agentCommission,
        platformFeeAmount,
        merchantCreditAmount,
        agentFeeAmount,
        expires_at,
      ],
    );

    await db.query(
      `INSERT INTO transaction_history (merchant_id, payment_id, event, data) VALUES ($1, $2, 'payment_created', $3)`,
      [
        merchant_id,
        paymentResult.rows[0].id,
        JSON.stringify({ amount, order_id, agent_id: agent.id }),
      ],
    );

    res.status(201).json({ success: true, payment: paymentResult.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const buildAgentPayload = (payloadStructure, data) => {
  if (!payloadStructure || Object.keys(payloadStructure).length === 0) {
    return {
      amount: String(data.amount), // ← string
      order_id: data.order_id,
      reference_id: data.reference_id,
    };
  }
  const payload = {};
  for (const [key, value] of Object.entries(payloadStructure)) {
    if (
      typeof value === "string" &&
      value.startsWith("{{") &&
      value.endsWith("}}")
    ) {
      const field = value.slice(2, -2).trim();
      // ← convert amount to string
      const rawValue = data[field] || value;
      payload[key] = field === "amount" ? String(rawValue) : rawValue;
    } else {
      payload[key] = value;
    }
  }
  return payload;
};

const submitUTR = async (req, res) => {
  try {
    const { payment_id } = req.params;
    const { utr } = req.body;
    const merchant_id = req.user.merchant?.id;

    if (!utr)
      return res.status(400).json({ success: false, message: "UTR required" });

    const result = await db.query(
      `UPDATE payments SET utr=$1, status='utr_submitted', updated_at=NOW()
       WHERE id=$2 AND merchant_id=$3 AND status='awaiting_transfer'
       RETURNING *`,
      [utr, payment_id, merchant_id],
    );

    // ✅ Check FIRST before using result.rows[0]
    if (result.rows.length === 0)
      return res.status(404).json({
        success: false,
        message: "Payment not found or invalid status",
      });

    const payment = result.rows[0];

    // ✅ Now safe to use payment
    await db.query(
      `INSERT INTO transaction_history (merchant_id, payment_id, event, data) VALUES ($1, $2, 'utr_submitted', $3)`,
      [merchant_id, payment_id, JSON.stringify({ utr })],
    );

    // Notify BytexHub about the UTR
    try {
      const agentResult = await db.query("SELECT * FROM agents WHERE id=$1", [
        payment.agent_id,
      ]);
      if (agentResult.rows.length > 0) {
        const agent = agentResult.rows[0];
        await axios.patch(
          "https://api.bytexhub.com/transactions/payment-proof",
          {
            transactionId: payment.reference_id,
            utrNumber: utr,
          },
          {
            headers: { "api-key": agent.api_key },
          },
        );
        console.log("✅ Payment proof submitted to BytexHub");
      }
    } catch (proofErr) {
      console.error("⚠️ Failed to submit proof to agent:", proofErr.message);
      // Don't fail the whole request if BytexHub call fails
    }

    res.json({ success: true, payment });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
const getMerchantPayments = async (req, res) => {
  try {
    const merchant_id = req.user.merchant?.id;
    const { status, from, to, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let conditions = ["p.merchant_id=$1"];
    let params = [merchant_id];
    let paramCount = 1;

    if (status) {
      paramCount++;
      conditions.push(`p.status=$${paramCount}`);
      params.push(status);
    }
    if (from) {
      paramCount++;
      conditions.push(`p.created_at>=$${paramCount}`);
      params.push(from);
    }
    if (to) {
      paramCount++;
      conditions.push(`p.created_at<=$${paramCount}`);
      params.push(to);
    }

    const where = conditions.join(" AND ");
    params.push(limit, offset);

    const result = await db.query(
      `
      SELECT p.*, a.agent_name FROM payments p
      LEFT JOIN agents a ON a.id = p.agent_id
      WHERE ${where} ORDER BY p.created_at DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `,
      params,
    );

    const count = await db.query(
      `SELECT COUNT(*) FROM payments p WHERE ${where}`,
      params.slice(0, -2),
    );

    res.json({
      success: true,
      payments: result.rows,
      total: parseInt(count.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const getAllPayments = async (req, res) => {
  try {
    const { status, merchant_id, from, to, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let conditions = [];
    let params = [];
    let paramCount = 0;

    if (status) {
      paramCount++;
      conditions.push(`p.status=$${paramCount}`);
      params.push(status);
    }
    if (merchant_id) {
      paramCount++;
      conditions.push(`p.merchant_id=$${paramCount}`);
      params.push(merchant_id);
    }
    if (from) {
      paramCount++;
      conditions.push(`p.created_at>=$${paramCount}`);
      params.push(from);
    }
    if (to) {
      paramCount++;
      conditions.push(`p.created_at<=$${paramCount}`);
      params.push(to);
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    params.push(limit, offset);

    const result = await db.query(
      `
      SELECT p.*, a.agent_name, m.merchant_name FROM payments p
      LEFT JOIN agents a ON a.id = p.agent_id
      LEFT JOIN merchants m ON m.id = p.merchant_id
      ${where} ORDER BY p.created_at DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `,
      params,
    );

    const count = await db.query(
      `SELECT COUNT(*) FROM payments p ${where}`,
      params.slice(0, -2),
    );

    res.json({
      success: true,
      payments: result.rows,
      total: parseInt(count.rows[0].count),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const getAdminStats = async (req, res) => {
  try {
    const stats = await db.query(`
      SELECT
        COUNT(*) as total_payments,
        COUNT(*) FILTER (WHERE status='confirmed') as confirmed,
        COUNT(*) FILTER (WHERE status='pending' OR status='awaiting_transfer' OR status='utr_submitted') as pending,
        COUNT(*) FILTER (WHERE status='failed') as failed,
        COALESCE(SUM(amount) FILTER (WHERE status='confirmed'), 0) as total_volume,
        COALESCE(SUM(platform_fee_amount) FILTER (WHERE status='confirmed'), 0) as total_platform_fees
      FROM payments
    `);
    const merchantCount = await db.query(`SELECT COUNT(*) FROM merchants`);
    const agentCount = await db.query(
      `SELECT COUNT(*) FROM agents WHERE is_active=TRUE`,
    );

    res.json({
      success: true,
      stats: {
        ...stats.rows[0],
        total_merchants: merchantCount.rows[0].count,
        total_agents: agentCount.rows[0].count,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = {
  createPayment,
  submitUTR,
  getMerchantPayments,
  getAllPayments,
  getAdminStats,
};

const crypto = require("crypto");
const db = require("../models/db");
const { getAgentHandler } = require("../agents");

const handleWebhook = async (req, res) => {
  try {
    // Get agent handler to parse webhook based on agent type
    // First try to find payment using all possible reference_id formats
    const possibleRef =
      req.body.reference_id ||
      req.body.transactionId ||
      req.body.transaction_details?.transaction_id ||
      req.body.order_id;

    if (!possibleRef)
      return res.status(400).json({
        success: false,
        message: "reference_id or transactionId required",
      });

    // Find payment
    const paymentResult = await db.query(
      `SELECT p.*, a.webhook_secret, a.api_endpoint, m.agent_commission_rate, m.commission_rate
       FROM payments p
       JOIN agents a ON a.id = p.agent_id
       JOIN merchants m ON m.id = p.merchant_id
       WHERE p.reference_id=$1`,
      [possibleRef],
    );

    if (paymentResult.rows.length === 0)
      return res
        .status(404)
        .json({ success: false, message: "Payment not found" });

    const payment = paymentResult.rows[0];

    // Get agent handler based on agent endpoint
    const handler = getAgentHandler(payment.api_endpoint);

    // Parse webhook using agent-specific handler
    const { reference_id, status, utr } = handler.parseWebhook(req.body);

    // Validate webhook signature
    const signature = req.headers["x-webhook-signature"];
    if (signature && payment.webhook_secret) {
      const expectedSig = crypto
        .createHmac("sha256", payment.webhook_secret)
        .update(JSON.stringify(req.body))
        .digest("hex");
      if (signature !== expectedSig) {
        return res
          .status(401)
          .json({ success: false, message: "Invalid signature" });
      }
    }

    // Prevent duplicate processing
    if (payment.status === "confirmed")
      return res.json({ success: true, message: "Already confirmed" });

    // Use agent-specific status check
    const isConfirmed = handler.isConfirmed(status);
    const isFailed = handler.isFailed(status);
    const newStatus = isConfirmed
      ? "confirmed"
      : isFailed
        ? "failed"
        : "utr_submitted";

    console.log(
      `📨 Webhook received: ref=${possibleRef} status=${status} → ${newStatus}`,
    );

    const client = await db.connect();
    try {
      await client.query("BEGIN");

      await client.query(
        `UPDATE payments SET status=$1, utr=COALESCE($2, utr), updated_at=NOW() WHERE id=$3`,
        [newStatus, utr, payment.id],
      );

      if (isConfirmed) {
        const balanceResult = await client.query(
          `SELECT COALESCE(balance, 0) as balance FROM ledger
           WHERE merchant_id=$1 ORDER BY created_at DESC LIMIT 1`,
          [payment.merchant_id],
        );
        const currentBalance = parseFloat(balanceResult.rows[0]?.balance || 0);
        const newBalance =
          currentBalance + parseFloat(payment.merchant_credit_amount);

        await client.query(
          `INSERT INTO ledger (merchant_id, payment_id, type, amount, balance, description)
           VALUES ($1, $2, 'credit', $3, $4, 'Payment confirmed - credit to merchant')`,
          [
            payment.merchant_id,
            payment.id,
            payment.merchant_credit_amount,
            newBalance,
          ],
        );

        await client.query(
          `INSERT INTO ledger (merchant_id, payment_id, type, amount, balance, description)
           VALUES ($1, $2, 'fee', $3, $4, 'Platform fee deducted')`,
          [
            payment.merchant_id,
            payment.id,
            payment.platform_fee_amount,
            newBalance,
          ],
        );
      }

      await client.query(
        `INSERT INTO transaction_history (merchant_id, payment_id, event, data)
         VALUES ($1, $2, 'webhook_received', $3)`,
        [
          payment.merchant_id,
          payment.id,
          JSON.stringify({ status, utr, new_status: newStatus }),
        ],
      );

      await client.query("COMMIT");

      // Fire merchant webhook if provided
      if (payment.webhook_url && isConfirmed) {
        try {
          await require("axios").post(payment.webhook_url, {
            transactionId: possibleRef,
            status: "approved",
            amount: payment.amount,
          });
          console.log("✅ Merchant webhook fired:", payment.webhook_url);
        } catch (webhookErr) {
          console.error("⚠️ Merchant webhook failed:", webhookErr.message);
        }
      }

      res.json({
        success: true,
        message: "Webhook processed",
        status: newStatus,
      });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Webhook error:", err);
    res
      .status(500)
      .json({ success: false, message: "Webhook processing failed" });
  }
};

module.exports = { handleWebhook };

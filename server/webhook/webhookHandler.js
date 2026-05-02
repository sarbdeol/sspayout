const crypto = require("crypto");
const db = require("../models/db");
const { getAgentHandler } = require("../agents");

/**
 * Detect if this is a Solwio callback by payload shape.
 * Solwio is the only agent that sends { mid, data, signature } encrypted.
 */
const isSolwioCallback = (body) =>
  !!(body && body.mid && body.data && body.signature);

/**
 * For Solwio: find the agent by mid, decrypt data, verify signature,
 * and attach the decrypted object to body._decrypted so parseWebhook can read it.
 * Returns the matched agent row, or throws on any failure.
 */
const handleSolwioPreprocessing = async (body) => {
  // Look up the Solwio agent by matching mid in payload_structure JSONB
  const agentResult = await db.query(
    `SELECT * FROM agents
     WHERE payload_structure->>'mid' = $1
       AND (api_endpoint LIKE '%solwio.in%' OR api_endpoint LIKE '%godemo.in%')
     LIMIT 1`,
    [body.mid]
  );

  if (agentResult.rows.length === 0) {
    throw new Error(`Solwio agent not found for mid=${body.mid}`);
  }

  const agent = agentResult.rows[0];
  const solwio = require("../agents/solwio");

  // Decrypt
  let decrypted;
  try {
    const plaintext = solwio._decryptPayload(body.data, agent.api_key);
    decrypted = JSON.parse(plaintext);
  } catch (err) {
    throw new Error(`Solwio decryption failed: ${err.message}`);
  }

  // Verify CRC32 signature: mid + txnId + orderNo + txnStatus
  const checksumStr = `${decrypted.mid}${decrypted.txnId}${decrypted.orderNo}${decrypted.txnStatus}`;
  const expectedSig = solwio._crc32(checksumStr);
  if (String(body.signature) !== expectedSig) {
    throw new Error(
      `Solwio signature mismatch: expected ${expectedSig}, got ${body.signature}`
    );
  }

  // Attach decrypted payload so parseWebhook can use it
  body._decrypted = decrypted;
  return agent;
};

const handleWebhook = async (req, res) => {
  // Track whether this is a Solwio callback so we can format the response correctly
  const solwioCallback = isSolwioCallback(req.body);

  try {
    // ---------- Solwio: decrypt + verify signature BEFORE finding payment ----------
    if (solwioCallback) {
      try {
        await handleSolwioPreprocessing(req.body);
      } catch (err) {
        console.error("Solwio webhook preprocessing failed:", err.message);
        // Solwio expects { status: "207" } for rejected
        return res.status(400).json({ status: "207" });
      }
    }

    // ---------- Find the reference_id (works for all agents now) ----------
    const possibleRef =
      req.body._decrypted?.txnId ||                            // Solwio (decrypted)
      req.body.reference_id ||
      req.body.transactionId ||
      req.body.transaction_details?.transaction_id ||
      req.body.order_id;

    if (!possibleRef) {
      const errorBody = solwioCallback
        ? { status: "207" }
        : { success: false, message: "reference_id or transactionId required" };
      return res.status(400).json(errorBody);
    }

    // Find payment
    const paymentResult = await db.query(
      `SELECT p.*, a.webhook_secret, a.api_endpoint, m.agent_commission_rate, m.commission_rate
       FROM payments p
       JOIN agents a ON a.id = p.agent_id
       JOIN merchants m ON m.id = p.merchant_id
       WHERE p.reference_id=$1`,
      [possibleRef]
    );

    if (paymentResult.rows.length === 0) {
      const errorBody = solwioCallback
        ? { status: "207" }
        : { success: false, message: "Payment not found" };
      return res.status(404).json(errorBody);
    }

    const payment = paymentResult.rows[0];

    // Get agent handler based on agent endpoint
    const handler = getAgentHandler(payment.api_endpoint);

    // Parse webhook using agent-specific handler
    const { reference_id, status, utr } = handler.parseWebhook(req.body);

    // ---------- Validate non-Solwio webhook signature (existing logic) ----------
    // For Solwio, signature was already verified above via CRC32. Skip the HMAC check.
    if (!solwioCallback) {
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
    }

    // Prevent duplicate processing
    if (payment.status === "confirmed") {
      return res.json(
        solwioCallback
          ? { status: "205" } // Solwio: success ack (already confirmed)
          : { success: true, message: "Already confirmed" }
      );
    }

    // Use agent-specific status check
    const isConfirmed = handler.isConfirmed(status);
    const isFailed = handler.isFailed(status);
    const newStatus = isConfirmed
      ? "confirmed"
      : isFailed
        ? "failed"
        : "utr_submitted";

    console.log(
      `📨 Webhook received: ref=${possibleRef} status=${status} → ${newStatus}`
    );

    const client = await db.connect();
    try {
      await client.query("BEGIN");

      await client.query(
        `UPDATE payments SET status=$1, utr=COALESCE($2, utr), updated_at=NOW() WHERE id=$3`,
        [newStatus, utr, payment.id]
      );

      if (isConfirmed) {
        const balanceResult = await client.query(
          `SELECT COALESCE(balance, 0) as balance FROM ledger
           WHERE merchant_id=$1 ORDER BY created_at DESC LIMIT 1`,
          [payment.merchant_id]
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
          ]
        );

        await client.query(
          `INSERT INTO ledger (merchant_id, payment_id, type, amount, balance, description)
           VALUES ($1, $2, 'fee', $3, $4, 'Platform fee deducted')`,
          [
            payment.merchant_id,
            payment.id,
            payment.platform_fee_amount,
            newBalance,
          ]
        );
      }

      await client.query(
        `INSERT INTO transaction_history (merchant_id, payment_id, event, data)
         VALUES ($1, $2, 'webhook_received', $3)`,
        [
          payment.merchant_id,
          payment.id,
          JSON.stringify({ status, utr, new_status: newStatus }),
        ]
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

      // ---------- Respond in agent-specific format ----------
      if (solwioCallback) {
        // Solwio: 205 = success acknowledgement, 207 = rejected/failed
        const solwioStatus = isFailed ? "207" : "205";
        console.log(`📤 Solwio response: { status: "${solwioStatus}" } for ref=${possibleRef}`);
        return res.json({ status: solwioStatus });
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
    const errorBody = solwioCallback
      ? { status: "207" }
      : { success: false, message: "Webhook processing failed" };
    res.status(500).json(errorBody);
  }
};

module.exports = { handleWebhook };
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
  // Track whether this is a Solwio callback
  const solwioCallback = isSolwioCallback(req.body);

  // Detect HandyPay
  const handypayCallback = !!(
    req.body &&
    req.body.transaction_details &&
    req.body.transaction_details.merchant_order_id
  );

  // Generate short request id
  const reqId = Math.random().toString(36).substring(2, 8);

  // Detect agent type
  const agentType = solwioCallback
    ? "SOLWIO"
    : handypayCallback
    ? "HANDYPAY"
    : req.body.transaction_details
    ? "BHUMIPAY"
    : req.body.reference_id || req.body.transactionId
    ? "INDOPAY"
    : "UNKNOWN";

  // ============================================
  // WEBHOOK RECEIVED
  // ============================================

  console.log("\n========== WEBHOOK RECEIVED ==========");

  console.log(`[${reqId}] Agent type: ${agentType}`);

  console.log(
    `[${reqId}] IP: ${
      req.ip ||
      req.headers["x-forwarded-for"] ||
      req.connection.remoteAddress
    }`
  );

  console.log(
    `[${reqId}] Headers:`,
    JSON.stringify(
      {
        "content-type": req.headers["content-type"],
        "user-agent": req.headers["user-agent"],
        "x-webhook-signature":
          req.headers["x-webhook-signature"] || "(none)",
      },
      null,
      2
    )
  );

  console.log(
    `[${reqId}] Body:`,
    JSON.stringify(req.body, null, 2)
  );

  // Helper to log + send response
  const respond = (statusCode, body) => {
    console.log(
      `[${reqId}] 📤 Response: ${statusCode}`,
      JSON.stringify(body)
    );

    console.log("======================================\n");

    return res.status(statusCode).json(body);
  };

  try {
    // ============================================
    // SOLWIO PREPROCESSING
    // ============================================

    if (solwioCallback) {
      try {
        await handleSolwioPreprocessing(req.body);

        console.log(
          `[${reqId}] ✅ Solwio decryption + signature verified`
        );

        console.log(
          `[${reqId}] Decrypted payload:`,
          JSON.stringify(req.body._decrypted, null, 2)
        );

        // ============================================
        // MERCHANT PAYMENT REQUEST
        // ============================================

        console.log(`
[${reqId}] ===== MERCHANT PAYMENT REQUEST =====
Txn ID     : ${req.body._decrypted?.txnId}
Order No   : ${req.body._decrypted?.orderNo}
Amount     : ${req.body._decrypted?.amount}
Status     : ${req.body._decrypted?.txnStatus}
UTR        : ${req.body._decrypted?.custRefNo || "N/A"}
MID        : ${req.body._decrypted?.mid}
Currency   : ${req.body._decrypted?.currency}
PaymentType: ${req.body._decrypted?.paymentType}
Txn Date   : ${req.body._decrypted?.txnDate}
===========================================
`);

      } catch (err) {
        console.error(
          `[${reqId}] ❌ Solwio preprocessing failed:`,
          err.message
        );

        return respond(400, { status: "207" });
      }
    }

    // ============================================
    // FIND PAYMENT REFERENCE
    // ============================================

    const possibleRef =
      req.body._decrypted?.txnId ||
      req.body.transaction_details?.merchant_order_id ||
      req.body.reference_id ||
      req.body.transactionId ||
      req.body.transaction_details?.transaction_id ||
      req.body.order_id;

    console.log(
      `[${reqId}] Looking up payment by reference: ${possibleRef}`
    );

    if (!possibleRef) {
      console.error(
        `[${reqId}] ❌ No reference_id found in body`
      );

      const errorBody = solwioCallback
        ? { status: "207" }
        : {
            success: false,
            message: "reference_id or transactionId required",
          };

      return respond(400, errorBody);
    }

    // ============================================
    // FIND PAYMENT IN DATABASE
    // ============================================

    const paymentResult = await db.query(
      `SELECT p.*, a.webhook_secret, a.api_endpoint, m.agent_commission_rate, m.commission_rate
       FROM payments p
       JOIN agents a ON a.id = p.agent_id
       JOIN merchants m ON m.id = p.merchant_id
       WHERE p.reference_id=$1`,
      [possibleRef]
    );

    if (paymentResult.rows.length === 0) {
      console.error(
        `[${reqId}] ❌ Payment not found in DB for ref=${possibleRef}`
      );

      const errorBody = solwioCallback
        ? { status: "207" }
        : {
            success: false,
            message: "Payment not found",
          };

      return respond(404, errorBody);
    }

    const payment = paymentResult.rows[0];

    console.log(
      `[${reqId}] ✅ Payment found: id=${payment.id} merchant=${payment.merchant_id} amount=${payment.amount} current_status=${payment.status}`
    );

    // ============================================
    // PARSE WEBHOOK
    // ============================================

    const handler = getAgentHandler(payment.api_endpoint);

    const { reference_id, status, utr } =
      handler.parseWebhook(req.body);

    console.log(
      `[${reqId}] Parsed: status=${status} utr=${utr || "(none)"}`
    );

    // ============================================
    // HMAC SIGNATURE VALIDATION
    // ============================================

    if (!solwioCallback) {
      const signature = req.headers["x-webhook-signature"];

      if (signature && payment.webhook_secret) {
        const expectedSig = crypto
          .createHmac("sha256", payment.webhook_secret)
          .update(JSON.stringify(req.body))
          .digest("hex");

        if (signature !== expectedSig) {
          console.error(
            `[${reqId}] ❌ HMAC signature mismatch`
          );

          return respond(401, {
            success: false,
            message: "Invalid signature",
          });
        }

        console.log(
          `[${reqId}] ✅ HMAC signature verified`
        );
      }
    }

    // ============================================
    // DUPLICATE CHECK
    // ============================================

    if (payment.status === "confirmed") {
      console.log(
        `[${reqId}] ⏭️ Payment already confirmed, skipping`
      );

      return respond(
        200,
        solwioCallback
          ? { status: "205" }
          : {
              success: true,
              message: "Already confirmed",
            }
      );
    }

    // ============================================
    // STATUS MAPPING
    // ============================================

    const isConfirmed = handler.isConfirmed(status);
    const isFailed = handler.isFailed(status);

    const newStatus = isConfirmed
      ? "confirmed"
      : isFailed
      ? "failed"
      : "utr_submitted";

    console.log(
      `[${reqId}] 📨 Status transition: ${status} → ${newStatus} (confirmed=${isConfirmed} failed=${isFailed})`
    );

    // ============================================
    // DATABASE TRANSACTION
    // ============================================

    const client = await db.connect();

    try {
      await client.query("BEGIN");

      // Update payment
      await client.query(
        `UPDATE payments
         SET status=$1,
             utr=COALESCE($2, utr),
             updated_at=NOW()
         WHERE id=$3`,
        [newStatus, utr, payment.id]
      );

      // Credit merchant
      if (isConfirmed) {
        const balanceResult = await client.query(
          `SELECT COALESCE(balance, 0) as balance
           FROM ledger
           WHERE merchant_id=$1
           ORDER BY created_at DESC
           LIMIT 1`,
          [payment.merchant_id]
        );

        const currentBalance = parseFloat(
          balanceResult.rows[0]?.balance || 0
        );

        const newBalance =
          currentBalance +
          parseFloat(payment.merchant_credit_amount);

        // Credit entry
        await client.query(
          `INSERT INTO ledger
           (merchant_id, payment_id, type, amount, balance, description)
           VALUES ($1, $2, 'credit', $3, $4, 'Payment confirmed - credit to merchant')`,
          [
            payment.merchant_id,
            payment.id,
            payment.merchant_credit_amount,
            newBalance,
          ]
        );

        // Fee entry
        await client.query(
          `INSERT INTO ledger
           (merchant_id, payment_id, type, amount, balance, description)
           VALUES ($1, $2, 'fee', $3, $4, 'Platform fee deducted')`,
          [
            payment.merchant_id,
            payment.id,
            payment.platform_fee_amount,
            newBalance,
          ]
        );
      }

      // Transaction history
      await client.query(
        `INSERT INTO transaction_history
         (merchant_id, payment_id, event, data)
         VALUES ($1, $2, 'webhook_received', $3)`,
        [
          payment.merchant_id,
          payment.id,
          JSON.stringify({
            status,
            utr,
            new_status: newStatus,
          }),
        ]
      );

      await client.query("COMMIT");

      console.log(
        `[${reqId}] ✅ DB transaction committed`
      );

      // ============================================
      // FIRE MERCHANT WEBHOOK
      // ============================================

      if (payment.webhook_url && isConfirmed) {
        try {
          const merchantResp = await require("axios").post(
            payment.webhook_url,
            {
              transactionId: possibleRef,
              status: "approved",
              utr: utr || payment.utr || null,
              amount: payment.amount,
            },
            {
              timeout: 10000,
            }
          );

          console.log(
            `[${reqId}] ✅ Merchant webhook fired: ${payment.webhook_url} (status: ${merchantResp.status})`
          );
        } catch (webhookErr) {
          console.error(
            `[${reqId}] ⚠️ Merchant webhook failed: ${payment.webhook_url}`,
            webhookErr.message
          );
        }
      }

      // ============================================
      // SOLWIO RESPONSE FORMAT
      // ============================================

      if (solwioCallback) {
        const incomingStatus =
          req.body._decrypted?.txnStatus;

        const isWarning =
          String(incomingStatus).toLowerCase() ===
          "warning";

        let solwioStatus;

        if (isFailed) {
          solwioStatus = "207";
        } else if (isWarning) {
          solwioStatus = "206";
        } else {
          solwioStatus = "205";
        }

        return respond(200, {
          status: solwioStatus,
        });
      }

      // ============================================
      // NORMAL RESPONSE
      // ============================================

      return respond(200, {
        success: true,
        message: "Webhook processed",
        status: newStatus,
      });

    } catch (err) {
      await client.query("ROLLBACK");

      console.error(
        `[${reqId}] ❌ DB transaction rolled back:`,
        err.message
      );

      throw err;

    } finally {
      client.release();
    }

  } catch (err) {
    console.error(
      `[${reqId}] ❌ Webhook error:`,
      err
    );

    const errorBody = solwioCallback
      ? { status: "207" }
      : {
          success: false,
          message: "Webhook processing failed",
        };

    return respond(500, errorBody);
  }
};

module.exports = {
  handleWebhook,
};
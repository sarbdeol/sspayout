const db = require("../models/db");

const createSettlement = async (req, res) => {
  try {
    const { merchant_id, amount, notes } = req.body;

    const merchantResult = await db.query(
      `
      SELECT m.*, COALESCE(
        (SELECT balance FROM ledger WHERE merchant_id=m.id ORDER BY created_at DESC LIMIT 1), 0
      ) as current_balance FROM merchants m WHERE m.id=$1
    `,
      [merchant_id],
    );

    if (merchantResult.rows.length === 0)
      return res
        .status(404)
        .json({ success: false, message: "Merchant not found" });

    const merchant = merchantResult.rows[0];
    if (parseFloat(amount) > parseFloat(merchant.current_balance))
      return res
        .status(400)
        .json({ success: false, message: "Insufficient balance" });

    const client = await db.connect();
    try {
      await client.query("BEGIN");

      const settlementResult = await client.query(
        `
        INSERT INTO settlements (merchant_id, amount, bank_name, account_number, ifsc, status, notes)
        VALUES ($1, $2, $3, $4, $5, 'pending', $6) RETURNING *
      `,
        [
          merchant_id,
          amount,
          merchant.settlement_bank_name,
          merchant.settlement_account,
          merchant.settlement_ifsc,
          notes,
        ],
      );

      const newBalance =
        parseFloat(merchant.current_balance) - parseFloat(amount);
      await client.query(
        `
        INSERT INTO ledger (merchant_id, type, amount, balance, description)
        VALUES ($1, 'settlement', $2, $3, 'Settlement request created')
      `,
        [merchant_id, amount, newBalance],
      );

      await client.query("COMMIT");
      res
        .status(201)
        .json({ success: true, settlement: settlementResult.rows[0] });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const getAllSettlements = async (req, res) => {
  try {
    const { status, merchant_id, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let conditions = [];
    let params = [];
    let paramCount = 0;

    if (status) {
      paramCount++;
      conditions.push(`s.status=$${paramCount}`);
      params.push(status);
    }
    if (merchant_id) {
      paramCount++;
      conditions.push(`s.merchant_id=$${paramCount}`);
      params.push(merchant_id);
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    params.push(limit, offset);

    const result = await db.query(
      `
      SELECT s.*, m.merchant_name FROM settlements s
      JOIN merchants m ON m.id = s.merchant_id
      ${where} ORDER BY s.created_at DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `,
      params,
    );

    res.json({ success: true, settlements: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const updateSettlementStatus = async (req, res) => {
  try {
    const { status, notes } = req.body;
    const result = await db.query(
      `
  UPDATE settlements 
  SET status=$1::varchar, 
      notes=COALESCE($2, notes),
      processed_at=CASE WHEN $1::varchar='completed' THEN NOW() ELSE processed_at END,
      updated_at=NOW()
  WHERE id=$3 RETURNING *
`,
      [status, notes, req.params.id],
    );

    if (result.rows.length === 0)
      return res
        .status(404)
        .json({ success: false, message: "Settlement not found" });

    res.json({ success: true, settlement: result.rows[0] });
  } catch (err) {
    console.error("updateSettlementStatus error:", err); // ← add this
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const getMerchantSettlements = async (req, res) => {
  try {
    const merchant_id = req.user.merchant?.id;
    const result = await db.query(
      `
      SELECT * FROM settlements WHERE merchant_id=$1 ORDER BY created_at DESC
    `,
      [merchant_id],
    );
    res.json({ success: true, settlements: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = {
  createSettlement,
  getAllSettlements,
  updateSettlementStatus,
  getMerchantSettlements,
};

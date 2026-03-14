const db = require('../models/db');

const getMerchantLedger = async (req, res) => {
  try {
    const merchant_id = req.user.merchant?.id || req.params.merchant_id;
    const { type, from, to, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let conditions = ['l.merchant_id=$1'];
    let params = [merchant_id];
    let paramCount = 1;

    if (type) { paramCount++; conditions.push(`l.type=$${paramCount}`); params.push(type); }
    if (from) { paramCount++; conditions.push(`l.created_at>=$${paramCount}`); params.push(from); }
    if (to) { paramCount++; conditions.push(`l.created_at<=$${paramCount}`); params.push(to); }

    const where = conditions.join(' AND ');
    params.push(limit, offset);

    const result = await db.query(`
      SELECT l.*, p.order_id, p.reference_id FROM ledger l
      LEFT JOIN payments p ON p.id = l.payment_id
      WHERE ${where} ORDER BY l.created_at DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `, params);

    const count = await db.query(`SELECT COUNT(*) FROM ledger l WHERE ${where}`, params.slice(0, -2));

    const balanceResult = await db.query(`
      SELECT COALESCE(MAX(balance), 0) as current_balance FROM ledger
      WHERE merchant_id=$1
    `, [merchant_id]);

    res.json({
      success: true,
      ledger: result.rows,
      total: parseInt(count.rows[0].count),
      current_balance: parseFloat(balanceResult.rows[0].current_balance)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const getMerchantBalance = async (req, res) => {
  try {
    const merchant_id = req.user.merchant?.id;
    const result = await db.query(`
      SELECT COALESCE(balance, 0) as current_balance FROM ledger
      WHERE merchant_id=$1 ORDER BY created_at DESC LIMIT 1
    `, [merchant_id]);
    res.json({ success: true, balance: parseFloat(result.rows[0]?.current_balance || 0) });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = { getMerchantLedger, getMerchantBalance };

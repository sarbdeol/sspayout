const bcrypt = require('bcryptjs');
const db = require('../models/db');

const createMerchant = async (req, res) => {
  try {
    const {
      name, username, password,
      merchant_name, commission_rate, agent_commission_rate,
      settlement_bank_name, settlement_account, settlement_ifsc
    } = req.body;

    if (!name || !username || !password || !merchant_name)
      return res.status(400).json({ success: false, message: 'Required fields missing' });

    const existing = await db.query('SELECT id FROM users WHERE username=$1', [username]);
    if (existing.rows.length > 0)
      return res.status(400).json({ success: false, message: 'Username already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const userResult = await client.query(
        `INSERT INTO users (name, username, email, password, role) 
         VALUES ($1, $2, $3, $4, 'merchant') RETURNING *`,
        [name, username, username + '@paygateway.com', hashedPassword]
      );
      const user = userResult.rows[0];

      const merchantResult = await client.query(
        `INSERT INTO merchants (user_id, merchant_name, commission_rate, agent_commission_rate,
         settlement_bank_name, settlement_account, settlement_ifsc, plain_password)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [user.id, merchant_name, commission_rate || 7.00, agent_commission_rate || 5.00,
         settlement_bank_name, settlement_account, settlement_ifsc, password]
      );

      await client.query(
        `UPDATE merchants SET api_key = md5(random()::text || clock_timestamp()::text) WHERE id=$1`,
        [merchantResult.rows[0].id]
      );

      await client.query('COMMIT');
      res.status(201).json({ success: true, user: { ...user, password: undefined }, merchant: merchantResult.rows[0] });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const getAllMerchants = async (req, res) => {
  try {
    const result = await db.query(`
      SELECT m.*, u.name, u.email, u.username, u.is_active, m.plain_password,
        COALESCE(
          json_agg(
            json_build_object('id', a.id, 'agent_name', a.agent_name, 'is_primary', ma.is_primary)
          ) FILTER (WHERE a.id IS NOT NULL), '[]'
        ) as agents,
        COALESCE(SUM(CASE WHEN l.type='credit' THEN l.amount ELSE 0 END), 0) as total_credited,
        COALESCE(SUM(CASE WHEN l.type='settlement' THEN l.amount ELSE 0 END), 0) as total_settled
      FROM merchants m
      JOIN users u ON u.id = m.user_id
      LEFT JOIN merchant_agents ma ON ma.merchant_id = m.id
      LEFT JOIN agents a ON a.id = ma.agent_id
      LEFT JOIN ledger l ON l.merchant_id = m.id
      GROUP BY m.id, u.name, u.email, u.username, u.is_active, m.plain_password
      ORDER BY m.created_at DESC
    `);
    res.json({ success: true, merchants: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const getMerchant = async (req, res) => {
  try {
    const result = await db.query(`
      SELECT m.*, u.name, u.email, u.username, u.is_active
      FROM merchants m JOIN users u ON u.id = m.user_id
      WHERE m.id = $1
    `, [req.params.id]);
    if (result.rows.length === 0)
      return res.status(404).json({ success: false, message: 'Merchant not found' });

    const agents = await db.query(`
      SELECT a.id, a.agent_name, a.commission_rate, ma.is_primary
      FROM merchant_agents ma JOIN agents a ON a.id = ma.agent_id
      WHERE ma.merchant_id = $1
    `, [req.params.id]);

    res.json({ success: true, merchant: { ...result.rows[0], agents: agents.rows } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const updateMerchant = async (req, res) => {
  try {
    const {
      merchant_name, commission_rate, agent_commission_rate,
      settlement_bank_name, settlement_account, settlement_ifsc
    } = req.body;

    const result = await db.query(`
      UPDATE merchants SET merchant_name=$1, commission_rate=$2, agent_commission_rate=$3,
      settlement_bank_name=$4, settlement_account=$5, settlement_ifsc=$6, updated_at=NOW()
      WHERE id=$7 RETURNING *
    `, [merchant_name, commission_rate, agent_commission_rate,
        settlement_bank_name, settlement_account, settlement_ifsc, req.params.id]);

    if (result.rows.length === 0)
      return res.status(404).json({ success: false, message: 'Merchant not found' });

    res.json({ success: true, merchant: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const toggleMerchantStatus = async (req, res) => {
  try {
    const merchantResult = await db.query('SELECT user_id FROM merchants WHERE id=$1', [req.params.id]);
    if (merchantResult.rows.length === 0)
      return res.status(404).json({ success: false, message: 'Merchant not found' });

    const userResult = await db.query(
      'UPDATE users SET is_active = NOT is_active, updated_at=NOW() WHERE id=$1 RETURNING is_active',
      [merchantResult.rows[0].user_id]
    );
    res.json({ success: true, is_active: userResult.rows[0].is_active });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const assignAgent = async (req, res) => {
  try {
    const { merchant_id } = req.params;
    const { agent_id, is_primary } = req.body;

    if (is_primary) {
      await db.query('UPDATE merchant_agents SET is_primary=FALSE WHERE merchant_id=$1', [merchant_id]);
    }

    const result = await db.query(`
      INSERT INTO merchant_agents (merchant_id, agent_id, is_primary)
      VALUES ($1, $2, $3)
      ON CONFLICT (merchant_id, agent_id) DO UPDATE SET is_primary=$3
      RETURNING *
    `, [merchant_id, agent_id, is_primary || false]);

    res.json({ success: true, assignment: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const removeAgent = async (req, res) => {
  try {
    const { merchant_id, agent_id } = req.params;
    await db.query('DELETE FROM merchant_agents WHERE merchant_id=$1 AND agent_id=$2', [merchant_id, agent_id]);
    res.json({ success: true, message: 'Agent removed from merchant' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const getMerchantStats = async (req, res) => {
  try {
    const { id } = req.params;
    const stats = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE status='confirmed') as confirmed_payments,
        COUNT(*) FILTER (WHERE status='pending' OR status='awaiting_transfer') as pending_payments,
        COALESCE(SUM(amount) FILTER (WHERE status='confirmed'), 0) as total_volume,
        COALESCE(SUM(merchant_credit_amount) FILTER (WHERE status='confirmed'), 0) as total_credited
      FROM payments WHERE merchant_id=$1
    `, [id]);

    const balance = await db.query(`
      SELECT COALESCE(balance, 0) as current_balance 
      FROM ledger
      WHERE merchant_id=$1 
      ORDER BY created_at DESC 
      LIMIT 1
    `, [id]);

    res.json({ 
      success: true, 
      stats: { 
        ...stats.rows[0], 
        current_balance: parseFloat(balance.rows[0]?.current_balance || 0)
      } 
    });
  } catch (err) {
    console.error('getMerchantStats error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = {
  createMerchant, getAllMerchants, getMerchant, updateMerchant,
  toggleMerchantStatus, assignAgent, removeAgent, getMerchantStats
};
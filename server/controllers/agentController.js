const db = require('../models/db');
const { v4: uuidv4 } = require('uuid');

const createAgent = async (req, res) => {
  try {
    const { agent_name, api_endpoint, api_key, payload_structure, webhook_secret, commission_rate } = req.body;
    if (!agent_name || !api_endpoint || !api_key || !webhook_secret)
      return res.status(400).json({ success: false, message: 'Required fields missing' });

    const result = await db.query(
      `INSERT INTO agents (agent_name, api_endpoint, api_key, payload_structure, webhook_secret, commission_rate)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [agent_name, api_endpoint, api_key, payload_structure || {}, webhook_secret, commission_rate || 5.00]
    );
    res.status(201).json({ success: true, agent: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const getAllAgents = async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM agents ORDER BY created_at DESC');
    res.json({ success: true, agents: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const getAgent = async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM agents WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0)
      return res.status(404).json({ success: false, message: 'Agent not found' });
    res.json({ success: true, agent: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const updateAgent = async (req, res) => {
  try {
    const { agent_name, api_endpoint, api_key, payload_structure, webhook_secret, commission_rate } = req.body;
    const result = await db.query(
      `UPDATE agents SET agent_name=$1, api_endpoint=$2, api_key=$3, payload_structure=$4,
       webhook_secret=$5, commission_rate=$6, updated_at=NOW() WHERE id=$7 RETURNING *`,
      [agent_name, api_endpoint, api_key, payload_structure || {}, webhook_secret, commission_rate, req.params.id]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ success: false, message: 'Agent not found' });
    res.json({ success: true, agent: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const toggleAgentStatus = async (req, res) => {
  try {
    const result = await db.query(
      'UPDATE agents SET is_active = NOT is_active, updated_at=NOW() WHERE id=$1 RETURNING *',
      [req.params.id]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ success: false, message: 'Agent not found' });
    res.json({ success: true, agent: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const deleteAgent = async (req, res) => {
  try {
    await db.query('DELETE FROM agents WHERE id=$1', [req.params.id]);
    res.json({ success: true, message: 'Agent deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = { createAgent, getAllAgents, getAgent, updateAgent, toggleAgentStatus, deleteAgent };

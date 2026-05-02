const jwt = require('jsonwebtoken');
const db = require('../models/db');

const authMiddleware = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};

const adminOnly = (req, res, next) => {
  if (req.user.role !== 'superadmin') {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  next();
};

const merchantOnly = (req, res, next) => {
  if (req.user.role !== 'merchant') {
    return res.status(403).json({ success: false, message: 'Merchant access required' });
  }
  next();
};

const apiKeyAuth = async (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.headers['api-key'];
  if (!apiKey) {
    return res.status(401).json({ success: false, message: 'API key required' });
  }
  try {
    const result = await db.query(
      'SELECT * FROM merchants WHERE api_key=$1 AND is_active=TRUE',
      [apiKey]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid API key' });
    }
    req.merchant = result.rows[0];
    next();
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Auth error' });
  }
};

module.exports = { authMiddleware, adminOnly, merchantOnly, apiKeyAuth };
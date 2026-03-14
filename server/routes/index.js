const express = require('express');
const router = express.Router();
const { authMiddleware, adminOnly, merchantOnly } = require('../middleware/auth');
const { login, getProfile } = require('../controllers/authController');
const { createAgent, getAllAgents, getAgent, updateAgent, toggleAgentStatus, deleteAgent } = require('../controllers/agentController');
const { createMerchant, getAllMerchants, getMerchant, updateMerchant, toggleMerchantStatus, assignAgent, removeAgent, getMerchantStats } = require('../controllers/merchantController');
const { createPayment, submitUTR, getMerchantPayments, getAllPayments, getAdminStats } = require('../controllers/paymentController');
const { getMerchantLedger, getMerchantBalance } = require('../controllers/ledgerController');
const { createSettlement, getAllSettlements, updateSettlementStatus, getMerchantSettlements } = require('../controllers/settlementController');
const { handleWebhook } = require('../webhook/webhookHandler');

// Auth
router.post('/auth/login', login);
router.get('/auth/profile', authMiddleware, getProfile);

// Admin - Agents
router.post('/admin/agents', authMiddleware, adminOnly, createAgent);
router.get('/admin/agents', authMiddleware, adminOnly, getAllAgents);
router.get('/admin/agents/:id', authMiddleware, adminOnly, getAgent);
router.put('/admin/agents/:id', authMiddleware, adminOnly, updateAgent);
router.patch('/admin/agents/:id/toggle', authMiddleware, adminOnly, toggleAgentStatus);
router.delete('/admin/agents/:id', authMiddleware, adminOnly, deleteAgent);

// Admin - Merchants
router.post('/admin/merchants', authMiddleware, adminOnly, createMerchant);
router.get('/admin/merchants', authMiddleware, adminOnly, getAllMerchants);
router.get('/admin/merchants/:id', authMiddleware, adminOnly, getMerchant);
router.put('/admin/merchants/:id', authMiddleware, adminOnly, updateMerchant);
router.patch('/admin/merchants/:id/toggle', authMiddleware, adminOnly, toggleMerchantStatus);
router.post('/admin/merchants/:merchant_id/assign-agent', authMiddleware, adminOnly, assignAgent);
router.delete('/admin/merchants/:merchant_id/agents/:agent_id', authMiddleware, adminOnly, removeAgent);
router.get('/admin/merchants/:id/stats', authMiddleware, adminOnly, getMerchantStats);

// Admin - Payments
router.get('/admin/payments', authMiddleware, adminOnly, getAllPayments);
router.get('/admin/stats', authMiddleware, adminOnly, getAdminStats);

// Admin - Settlements
router.get('/admin/settlements', authMiddleware, adminOnly, getAllSettlements);
router.post('/admin/settlements', authMiddleware, adminOnly, createSettlement);
router.patch('/admin/settlements/:id/status', authMiddleware, adminOnly, updateSettlementStatus);
router.get('/admin/merchants/:merchant_id/ledger', authMiddleware, adminOnly, getMerchantLedger);

// Merchant
router.post('/merchant/payment', authMiddleware, merchantOnly, createPayment);
router.post('/merchant/payment/:payment_id/utr', authMiddleware, merchantOnly, submitUTR);
router.get('/merchant/payments', authMiddleware, merchantOnly, getMerchantPayments);
router.get('/merchant/ledger', authMiddleware, merchantOnly, getMerchantLedger);
router.get('/merchant/balance', authMiddleware, merchantOnly, getMerchantBalance);
router.get('/merchant/settlements', authMiddleware, merchantOnly, getMerchantSettlements);

// Webhook (public)
router.post('/webhook/payment-status', handleWebhook);

// public route for payment initiation (called by client)
router.post('/payin', require('../controllers/payinController').createPayin);

module.exports = router;

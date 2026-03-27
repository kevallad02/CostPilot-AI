const { Router } = require('express');
const { handleChat } = require('../controllers/chatController');
const { createEstimate, getSummary } = require('../controllers/estimateController');

const router = Router();

// Health
router.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Chat (primary interface)
router.post('/chat', handleChat);

// Direct structured estimate (bypasses ML)
router.post('/estimate', createEstimate);

// Session summary + total
router.get('/summary', getSummary);

module.exports = router;

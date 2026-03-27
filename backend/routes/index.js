const { Router } = require('express');
const { handleChat } = require('../controllers/chatController');
const { createEstimate, getSummary } = require('../controllers/estimateController');
const db = require('../db');

const router = Router();

// Health
router.get('/health', (_req, res) => res.json({ status: 'ok' }));

// DB health – confirms Supabase connection and tables exist
router.get('/health/db', async (_req, res) => {
  try {
    const { rows } = await db.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('cost_items','estimate_records')"
    );
    const tables = rows.map(r => r.table_name);
    const itemCount = (await db.query('SELECT COUNT(*) FROM cost_items')).rows[0].count;
    res.json({ status: 'ok', tables, cost_items_count: itemCount });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

// Chat (primary interface)
router.post('/chat', handleChat);

// Direct structured estimate (bypasses ML)
router.post('/estimate', createEstimate);

// Session summary + total
router.get('/summary', getSummary);

module.exports = router;

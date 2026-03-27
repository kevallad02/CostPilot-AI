/**
 * estimateController.js
 * Handles direct estimate and summary endpoints (non-chat, structured input).
 */

const costService = require('../services/costService');
const { resolveSession } = require('../services/sessionService');
const logger = require('../middleware/logger');

/**
 * POST /estimate
 * Body: { session_id?, item, quantity, unit }
 */
async function createEstimate(req, res) {
  const { item, quantity, unit } = req.body;
  const sessionId = resolveSession(req.body.session_id);

  if (!item || quantity == null || isNaN(Number(quantity))) {
    return res.status(400).json({ error: 'item and a valid numeric quantity are required' });
  }

  try {
    const record = await costService.addEstimateRecord(sessionId, item, Number(quantity), unit);
    const total = await costService.getSessionTotal(sessionId);
    return res.status(201).json({ session_id: sessionId, record, session_total: total });
  } catch (err) {
    if (err.message.startsWith('UNKNOWN_ITEM:')) {
      return res.status(404).json({ error: `Item not found: ${item}` });
    }
    logger.error({ event: 'estimate_error', error: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * GET /summary?session_id=<uuid>
 */
async function getSummary(req, res) {
  const sessionId = req.query.session_id;
  if (!sessionId) {
    return res.status(400).json({ error: 'session_id query param is required' });
  }

  try {
    const summary = await costService.getSessionSummary(sessionId);
    return res.json({ session_id: sessionId, ...summary });
  } catch (err) {
    logger.error({ event: 'summary_error', error: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { createEstimate, getSummary };

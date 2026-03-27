/**
 * chatController.js
 * POST /chat – main conversational entry point.
 * Flow: user message → ML parse → calculation → natural language response.
 */

const mlService = require('../services/mlService');
const costService = require('../services/costService');
const { resolveSession } = require('../services/sessionService');
const logger = require('../middleware/logger');

/**
 * Format a number as USD currency string.
 * @param {number} n
 */
function formatCurrency(n) {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * POST /chat
 * Body: { message: string, session_id?: string }
 */
async function handleChat(req, res) {
  const { message } = req.body;

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'message is required' });
  }

  const sessionId = resolveSession(req.body.session_id);

  let parsed;
  try {
    parsed = await mlService.parseQuery(message.trim());
    logger.info({ event: 'ml_parsed', sessionId, parsed });
  } catch (mlErr) {
    logger.error({ event: 'ml_error', error: mlErr.message });
    return res.status(502).json({
      error: 'Could not reach the ML service. Please try again.',
      session_id: sessionId,
    });
  }

  const { action, item, quantity, unit, fallback_used } = parsed;
  let reply;
  let data = null;

  try {
    switch (action) {
      case 'estimate':
      case 'add': {
        const record = await costService.addEstimateRecord(sessionId, item, quantity, unit);
        const total = await costService.getSessionTotal(sessionId);
        const verb = action === 'estimate' ? 'Estimated' : 'Added';
        reply =
          `${verb} **${record.quantity} ${record.unit}** of **${record.item_name}** ` +
          `at ${formatCurrency(record.unit_rate)}/${record.unit} = **${formatCurrency(record.total_cost)}**.\n` +
          `Running session total: **${formatCurrency(total)}**.`;
        data = { record, session_total: total };
        break;
      }

      case 'total': {
        const total = await costService.getSessionTotal(sessionId);
        reply = `Your current project total is **${formatCurrency(total)}**.`;
        data = { session_total: total };
        break;
      }

      case 'summary': {
        const summary = await costService.getSessionSummary(sessionId);
        if (summary.items.length === 0) {
          reply = 'No items added yet. Try: "Estimate 20 m3 concrete".';
        } else {
          const lines = summary.items.map(
            (i) =>
              `• ${i.item_name}: ${i.quantity} ${i.unit} × ${formatCurrency(i.unit_rate)} = ${formatCurrency(i.total_cost)}`
          );
          reply = `**Project Breakdown:**\n${lines.join('\n')}\n\n**Total: ${formatCurrency(summary.total)}**`;
        }
        data = summary;
        break;
      }

      default:
        reply = `I didn't understand that. Try: "Estimate 20 m3 concrete" or "What is the total cost?".`;
    }
  } catch (calcErr) {
    if (calcErr.message.startsWith('UNKNOWN_ITEM:')) {
      const unknownItem = calcErr.message.split(':')[1];
      reply = `Sorry, I don't have pricing for **${unknownItem}**. Available items: concrete, steel, brick, sand, gravel, cement, wood, tiles, glass, paint.`;
    } else {
      logger.error({ event: 'calc_error', error: calcErr.message });
      return res.status(500).json({ error: 'Calculation error', session_id: sessionId });
    }
  }

  return res.json({
    session_id: sessionId,
    user_message: message,
    parsed,
    reply,
    data,
    fallback_used,
  });
}

module.exports = { handleChat };

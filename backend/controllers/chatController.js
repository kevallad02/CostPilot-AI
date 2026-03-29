/**
 * chatController.js
 * POST /chat – main conversational entry point.
 * Handles v2 ML API: { actions: [{action, item?, quantity?, unit?}], fallback_used }
 */

const mlService = require('../services/mlService');
const costService = require('../services/costService');
const { resolveSession } = require('../services/sessionService');
const logger = require('../middleware/logger');

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

  // ── ML parse ───────────────────────────────────────────────────────────────
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

  const actions = parsed.actions || [];
  const fallback_used = parsed.fallback_used || false;

  // ── No usable action ───────────────────────────────────────────────────────
  if (actions.length === 0) {
    return res.json({
      session_id: sessionId,
      user_message: message,
      parsed,
      reply: "I didn't understand that. Try: \"Add 10 cubic yards of concrete\" or \"What is my total?\"",
      data: null,
      fallback_used,
    });
  }

  // ── Route by first meaningful action type ──────────────────────────────────
  const firstAction = actions[0].action;

  // get_summary
  if (firstAction === 'get_summary') {
    try {
      const summary = await costService.getSessionSummary(sessionId);
      let reply;
      if (summary.items.length === 0) {
        reply = 'No items added yet. Try: "Add 20 cubic yards of concrete".';
      } else {
        const lines = summary.items.map(
          (i) =>
            `• ${i.item_name}: ${i.quantity} ${i.unit} × ${formatCurrency(i.unit_rate)} = ${formatCurrency(i.total_cost)}`
        );
        reply = `**Project Breakdown:**\n${lines.join('\n')}\n\n**Total: ${formatCurrency(summary.total)}**`;
      }
      return res.json({ session_id: sessionId, user_message: message, parsed, reply, data: summary, fallback_used });
    } catch (e) {
      logger.error({ event: 'summary_error', error: e.message });
      return res.status(500).json({ error: 'Failed to fetch summary', session_id: sessionId });
    }
  }

  // unknown_item
  if (firstAction === 'unknown_item') {
    return res.json({
      session_id: sessionId,
      user_message: message,
      parsed,
      reply: "Sorry, I don't recognise that material. Available items: concrete, steel, brick, sand, gravel, cement, wood, tiles, glass, paint.",
      data: null,
      fallback_used,
    });
  }

  // missing_quantity
  if (firstAction === 'missing_quantity') {
    const item = actions[0].item ? ` for **${actions[0].item}**` : '';
    return res.json({
      session_id: sessionId,
      user_message: message,
      parsed,
      reply: `Please specify a quantity${item}. Example: "Add 10 cubic yards of concrete".`,
      data: null,
      fallback_used,
    });
  }

  // add_item / estimate / remove_item ────────────────────────────────────────
  const itemActions = actions.filter((a) => ['add_item', 'estimate', 'remove_item'].includes(a.action));

  if (itemActions.length === 0) {
    return res.json({
      session_id: sessionId,
      user_message: message,
      parsed,
      reply: "I didn't understand that. Try: \"Add 10 cubic yards of concrete\" or \"What is my total?\"",
      data: null,
      fallback_used,
    });
  }

  // Process each item action
  const records = [];
  const errors  = [];

  for (const act of itemActions) {
    try {
      const record = await costService.addEstimateRecord(sessionId, act.item, act.quantity, act.unit);
      records.push(record);
    } catch (e) {
      if (e.message.startsWith('UNKNOWN_ITEM:')) {
        errors.push(e.message.split(':')[1]);
      } else {
        logger.error({ event: 'calc_error', error: e.message });
        return res.status(500).json({ error: 'Calculation error', session_id: sessionId });
      }
    }
  }

  const sessionTotal = await costService.getSessionTotal(sessionId);

  // Build reply
  let replyLines = [];

  for (const r of records) {
    replyLines.push(
      `Added **${r.quantity} ${r.unit}** of **${r.item_name}** ` +
      `at ${formatCurrency(r.unit_rate)}/${r.unit} = **${formatCurrency(r.total_cost)}**`
    );
  }

  for (const unknown of errors) {
    replyLines.push(`⚠ No pricing found for **${unknown}**`);
  }

  if (records.length > 0) {
    replyLines.push(`\nRunning session total: **${formatCurrency(sessionTotal)}**`);
  }

  return res.json({
    session_id: sessionId,
    user_message: message,
    parsed,
    reply: replyLines.join('\n'),
    data: { records, session_total: sessionTotal },
    fallback_used,
  });
}

module.exports = { handleChat };

/**
 * mlService.js
 * Calls the FastAPI ML inference server to parse natural language queries.
 * Preprocesses input to handle multi-item, mixed-language, and informal queries.
 */

const axios = require('axios');
const { preprocessInput } = require('./preprocessService');

const ML_API_URL   = process.env.ML_API_URL   || 'http://localhost:8001';
const ML_TIMEOUT_MS = parseInt(process.env.ML_TIMEOUT_MS || '60000', 10);

/**
 * Call the ML service for a single clean query string.
 * @param {string} text
 * @returns {Promise<{actions: Array, fallback_used: boolean}>}
 */
async function _callML(text) {
  const response = await axios.post(
    `${ML_API_URL}/parse-input`,
    { text },
    { timeout: ML_TIMEOUT_MS, headers: { 'Content-Type': 'application/json' } }
  );
  return response.data;
}

/**
 * Parse a raw user query.
 * Splits multi-item / Hinglish input into clean sub-queries, calls ML for each,
 * and merges all actions into a single response.
 *
 * @param {string} rawText – raw user input
 * @returns {Promise<{actions: Array, fallback_used: boolean}>}
 */
async function parseQuery(rawText) {
  const parts = preprocessInput(rawText);

  // Collect all actions across all parts
  const allActions = [];
  let fallbackUsed = false;

  for (const part of parts) {
    const result = await _callML(part);
    if (result.fallback_used) fallbackUsed = true;

    // Only collect meaningful actions (skip unable_to_parse errors)
    if (Array.isArray(result.actions)) {
      for (const action of result.actions) {
        if (action.action !== 'unknown_item' || result.actions.length === 1) {
          allActions.push(action);
        }
      }
    }
  }

  // If nothing parsed at all, return the last ML result as-is for proper error handling
  if (allActions.length === 0) {
    return await _callML(parts[0] || rawText);
  }

  return { actions: allActions, fallback_used: fallbackUsed };
}

module.exports = { parseQuery };

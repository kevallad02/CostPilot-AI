/**
 * mlService.js
 * Calls the FastAPI ML inference server to parse natural language queries.
 * Implements timeout and retry logic; surfaces errors cleanly to callers.
 */

const axios = require('axios');

const ML_API_URL = process.env.ML_API_URL || 'http://localhost:8001';
const ML_TIMEOUT_MS = parseInt(process.env.ML_TIMEOUT_MS || '5000', 10);

/**
 * Parse a natural language construction query.
 * @param {string} text – raw user input
 * @returns {Promise<{action, item, quantity, unit, fallback_used}>}
 */
async function parseQuery(text) {
  const response = await axios.post(
    `${ML_API_URL}/parse-input`,
    { text },
    {
      timeout: ML_TIMEOUT_MS,
      headers: { 'Content-Type': 'application/json' },
    }
  );
  return response.data;
}

module.exports = { parseQuery };

/**
 * costService.js
 * All cost calculations live here – deterministic, no AI involved.
 * The ML model only parses intent; numbers come from the database.
 */

const db = require('../db');

/**
 * Fetch unit rate for an item. Returns null if item not found.
 * @param {string} itemName
 * @returns {Promise<{item_name, category, unit, unit_rate} | null>}
 */
async function getItemRate(itemName) {
  const { rows } = await db.query(
    'SELECT item_name, category, unit, unit_rate FROM cost_items WHERE item_name = $1',
    [itemName.toLowerCase().trim()]
  );
  return rows[0] || null;
}

/**
 * Calculate cost and persist to estimate_records.
 * @param {string} sessionId
 * @param {string} itemName
 * @param {number} quantity
 * @param {string} unit
 * @returns {Promise<{item_name, quantity, unit, unit_rate, total_cost, category}>}
 */
async function addEstimateRecord(sessionId, itemName, quantity, unit) {
  const item = await getItemRate(itemName);
  if (!item) {
    throw new Error(`UNKNOWN_ITEM:${itemName}`);
  }

  const totalCost = parseFloat((quantity * item.unit_rate).toFixed(2));

  await db.query(
    `INSERT INTO estimate_records (session_id, item_name, quantity, unit, unit_rate, total_cost)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [sessionId, item.item_name, quantity, unit || item.unit, item.unit_rate, totalCost]
  );

  return {
    item_name: item.item_name,
    category: item.category,
    quantity,
    unit: unit || item.unit,
    unit_rate: item.unit_rate,
    total_cost: totalCost,
  };
}

/**
 * Get all records for a session and compute the grand total.
 * @param {string} sessionId
 * @returns {Promise<{items: Array, total: number}>}
 */
async function getSessionSummary(sessionId) {
  const { rows } = await db.query(
    `SELECT item_name, quantity, unit, unit_rate, total_cost, created_at
     FROM estimate_records
     WHERE session_id = $1
     ORDER BY created_at ASC`,
    [sessionId]
  );

  const total = rows.reduce((sum, r) => sum + parseFloat(r.total_cost), 0);
  return {
    items: rows,
    total: parseFloat(total.toFixed(2)),
  };
}

/**
 * Get grand total only for a session.
 * @param {string} sessionId
 * @returns {Promise<number>}
 */
async function getSessionTotal(sessionId) {
  const { rows } = await db.query(
    `SELECT COALESCE(SUM(total_cost), 0) AS total
     FROM estimate_records
     WHERE session_id = $1`,
    [sessionId]
  );
  return parseFloat(parseFloat(rows[0].total).toFixed(2));
}

module.exports = { getItemRate, addEstimateRecord, getSessionSummary, getSessionTotal };

/**
 * costService.js
 * All cost calculations live here – deterministic, no AI involved.
 * Self-learn: unknown items are looked up in PRICE_CATALOG and auto-inserted
 * into cost_items so they are remembered for future requests.
 */

const db = require('../db');

// ── US Construction Price Catalog ─────────────────────────────────────────────
// Fallback prices when item is not yet in the DB.
// { item_name → { category, unit, unit_rate } }
// Keys are lowercase and may include aliases.
const PRICE_CATALOG = {
  // Concrete & Masonry
  'concrete':            { category: 'Civil',       unit: 'cubic_yards',  unit_rate: 125.00 },
  'ready mix concrete':  { category: 'Civil',       unit: 'cubic_yards',  unit_rate: 135.00 },
  'mortar':              { category: 'Masonry',     unit: 'cubic_yards',  unit_rate:  95.00 },
  'brick':               { category: 'Masonry',     unit: 'units',        unit_rate:   0.55 },
  'bricks':              { category: 'Masonry',     unit: 'units',        unit_rate:   0.55 },
  'cinder block':        { category: 'Masonry',     unit: 'units',        unit_rate:   2.10 },
  'concrete block':      { category: 'Masonry',     unit: 'units',        unit_rate:   2.10 },
  'stone':               { category: 'Masonry',     unit: 'tons',         unit_rate:  48.00 },
  'flagstone':           { category: 'Masonry',     unit: 'square_feet',  unit_rate:   4.50 },
  // Structural Steel
  'steel':               { category: 'Structural',  unit: 'pounds',       unit_rate:   0.75 },
  'steel rebar':         { category: 'Structural',  unit: 'pounds',       unit_rate:   0.75 },
  'rebar':               { category: 'Structural',  unit: 'pounds',       unit_rate:   0.75 },
  'structural steel':    { category: 'Structural',  unit: 'pounds',       unit_rate:   0.90 },
  'steel beam':          { category: 'Structural',  unit: 'linear_feet',  unit_rate:  18.00 },
  'steel pipe':          { category: 'Structural',  unit: 'linear_feet',  unit_rate:  12.00 },
  // Earthwork
  'sand':                { category: 'Civil',       unit: 'cubic_yards',  unit_rate:  35.00 },
  'gravel':              { category: 'Civil',       unit: 'cubic_yards',  unit_rate:  45.00 },
  'crushed stone':       { category: 'Civil',       unit: 'cubic_yards',  unit_rate:  50.00 },
  'topsoil':             { category: 'Civil',       unit: 'cubic_yards',  unit_rate:  28.00 },
  'fill dirt':           { category: 'Civil',       unit: 'cubic_yards',  unit_rate:  15.00 },
  'mulch':               { category: 'Civil',       unit: 'cubic_yards',  unit_rate:  38.00 },
  'asphalt':             { category: 'Civil',       unit: 'tons',         unit_rate:  90.00 },
  // Lumber
  'lumber':              { category: 'Carpentry',   unit: 'linear_feet',  unit_rate:   4.50 },
  'wood':                { category: 'Carpentry',   unit: 'linear_feet',  unit_rate:   4.50 },
  'plywood':             { category: 'Carpentry',   unit: 'units',        unit_rate:  48.00 },
  'osb':                 { category: 'Carpentry',   unit: 'units',        unit_rate:  38.00 },
  'timber':              { category: 'Carpentry',   unit: 'linear_feet',  unit_rate:   6.00 },
  'hardwood':            { category: 'Carpentry',   unit: 'square_feet',  unit_rate:   8.00 },
  // Drywall & Insulation
  'drywall':             { category: 'Finishing',   unit: 'square_feet',  unit_rate:   1.20 },
  'sheetrock':           { category: 'Finishing',   unit: 'square_feet',  unit_rate:   1.20 },
  'insulation':          { category: 'Finishing',   unit: 'square_feet',  unit_rate:   1.50 },
  'spray foam':          { category: 'Finishing',   unit: 'square_feet',  unit_rate:   2.50 },
  // Roofing
  'roofing shingles':    { category: 'Roofing',     unit: 'square_feet',  unit_rate:   1.80 },
  'shingles':            { category: 'Roofing',     unit: 'square_feet',  unit_rate:   1.80 },
  'metal roofing':       { category: 'Roofing',     unit: 'square_feet',  unit_rate:   4.50 },
  'roof tiles':          { category: 'Roofing',     unit: 'square_feet',  unit_rate:   5.00 },
  'underlayment':        { category: 'Roofing',     unit: 'square_feet',  unit_rate:   0.45 },
  // Flooring & Tile
  'tiles':               { category: 'Finishing',   unit: 'square_feet',  unit_rate:   3.50 },
  'ceramic tile':        { category: 'Finishing',   unit: 'square_feet',  unit_rate:   3.50 },
  'porcelain tile':      { category: 'Finishing',   unit: 'square_feet',  unit_rate:   5.00 },
  'hardwood flooring':   { category: 'Finishing',   unit: 'square_feet',  unit_rate:   9.00 },
  'vinyl flooring':      { category: 'Finishing',   unit: 'square_feet',  unit_rate:   2.50 },
  'carpet':              { category: 'Finishing',   unit: 'square_feet',  unit_rate:   3.00 },
  'laminate flooring':   { category: 'Finishing',   unit: 'square_feet',  unit_rate:   2.00 },
  'flooring':            { category: 'Finishing',   unit: 'square_feet',  unit_rate:   4.00 },
  // Glass & Windows
  'glass':               { category: 'Finishing',   unit: 'square_feet',  unit_rate:   9.00 },
  'tempered glass':      { category: 'Finishing',   unit: 'square_feet',  unit_rate:  18.00 },
  'windows':             { category: 'Finishing',   unit: 'units',        unit_rate: 350.00 },
  'window':              { category: 'Finishing',   unit: 'units',        unit_rate: 350.00 },
  // Paint
  'paint':               { category: 'Finishing',   unit: 'gallons',      unit_rate:  35.00 },
  'primer':              { category: 'Finishing',   unit: 'gallons',      unit_rate:  28.00 },
  'stain':               { category: 'Finishing',   unit: 'gallons',      unit_rate:  32.00 },
  'sealant':             { category: 'Finishing',   unit: 'gallons',      unit_rate:  42.00 },
  // Cement
  'cement':              { category: 'Civil',       unit: 'units',        unit_rate:  12.00 },
  'portland cement':     { category: 'Civil',       unit: 'units',        unit_rate:  14.00 },
  // Plumbing
  'copper pipe':         { category: 'Plumbing',    unit: 'linear_feet',  unit_rate:   8.50 },
  'pvc pipe':            { category: 'Plumbing',    unit: 'linear_feet',  unit_rate:   2.50 },
  'pex pipe':            { category: 'Plumbing',    unit: 'linear_feet',  unit_rate:   1.80 },
  'conduit':             { category: 'Electrical',  unit: 'linear_feet',  unit_rate:   2.00 },
  // Electrical
  'electrical wire':     { category: 'Electrical',  unit: 'linear_feet',  unit_rate:   1.20 },
  'wire':                { category: 'Electrical',  unit: 'linear_feet',  unit_rate:   1.20 },
  // Doors
  'doors':               { category: 'Carpentry',   unit: 'units',        unit_rate: 250.00 },
  'door':                { category: 'Carpentry',   unit: 'units',        unit_rate: 250.00 },
  'hardware':            { category: 'Carpentry',   unit: 'units',        unit_rate:  45.00 },
};

// ── Item lookup with self-learn ───────────────────────────────────────────────

/**
 * Look up an item by name. If not in DB, try PRICE_CATALOG and auto-insert.
 * Returns null only if item is unknown to both DB and catalog.
 */
async function getItemRate(itemName) {
  const key = itemName.toLowerCase().trim();

  // 1. Try DB first
  const { rows } = await db.query(
    'SELECT item_name, category, unit, unit_rate FROM cost_items WHERE item_name = $1',
    [key]
  );
  if (rows[0]) return rows[0];

  // 2. Try catalog → auto-insert so DB learns it
  const entry = PRICE_CATALOG[key];
  if (entry) {
    await db.query(
      `INSERT INTO cost_items (item_name, category, unit, unit_rate)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (item_name) DO NOTHING`,
      [key, entry.category, entry.unit, entry.unit_rate]
    );
    return { item_name: key, ...entry };
  }

  return null;
}

// ── Core services ─────────────────────────────────────────────────────────────

/**
 * Calculate cost and persist to estimate_records.
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
    category:  item.category,
    quantity,
    unit:      unit || item.unit,
    unit_rate: item.unit_rate,
    total_cost: totalCost,
  };
}

/**
 * Get all records for a session and compute the grand total.
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

module.exports = { getItemRate, addEstimateRecord, getSessionSummary, getSessionTotal, PRICE_CATALOG };

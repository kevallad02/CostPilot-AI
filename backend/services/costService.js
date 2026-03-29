/**
 * costService.js
 * All cost calculations live here – deterministic, no AI involved.
 * Self-learn: unknown items are looked up in PRICE_CATALOG and auto-inserted
 * into cost_items so they are remembered for future requests.
 *
 * Prices reflect 2024 US national average market rates (USD).
 */

const db = require('../db');

// ── US Construction Price Catalog ─────────────────────────────────────────────
// All rates are per the canonical DB unit listed.
// Includes common aliases so model variants resolve correctly.
const PRICE_CATALOG = {
  // ── Concrete & Masonry ──────────────────────────────────────────────────────
  'concrete':              { category: 'Civil',       unit: 'cubic_yards',  unit_rate: 130.00 },
  'ready mix concrete':    { category: 'Civil',       unit: 'cubic_yards',  unit_rate: 140.00 },
  'concrete mix':          { category: 'Civil',       unit: 'cubic_yards',  unit_rate: 130.00 },
  'mortar':                { category: 'Masonry',     unit: 'cubic_yards',  unit_rate: 100.00 },
  'brick':                 { category: 'Masonry',     unit: 'units',        unit_rate:   0.65 },
  'bricks':                { category: 'Masonry',     unit: 'units',        unit_rate:   0.65 },
  'cinder block':          { category: 'Masonry',     unit: 'units',        unit_rate:   2.50 },
  'concrete block':        { category: 'Masonry',     unit: 'units',        unit_rate:   2.50 },
  'stone':                 { category: 'Masonry',     unit: 'tons',         unit_rate:  55.00 },
  'flagstone':             { category: 'Masonry',     unit: 'square_feet',  unit_rate:   5.50 },
  'pavers':                { category: 'Masonry',     unit: 'square_feet',  unit_rate:   4.00 },

  // ── Structural Steel ────────────────────────────────────────────────────────
  'steel':                 { category: 'Structural',  unit: 'pounds',       unit_rate:   0.80 },
  'steel rebar':           { category: 'Structural',  unit: 'pounds',       unit_rate:   0.80 },
  'rebar':                 { category: 'Structural',  unit: 'pounds',       unit_rate:   0.80 },
  'structural steel':      { category: 'Structural',  unit: 'pounds',       unit_rate:   0.95 },
  'steel beam':            { category: 'Structural',  unit: 'linear_feet',  unit_rate:  22.00 },
  'steel pipe':            { category: 'Structural',  unit: 'linear_feet',  unit_rate:  14.00 },
  'metal':                 { category: 'Structural',  unit: 'pounds',       unit_rate:   0.80 },

  // ── Earthwork & Fill ────────────────────────────────────────────────────────
  'sand':                  { category: 'Civil',       unit: 'cubic_yards',  unit_rate:  38.00 },
  'gravel':                { category: 'Civil',       unit: 'cubic_yards',  unit_rate:  48.00 },
  'crushed stone':         { category: 'Civil',       unit: 'cubic_yards',  unit_rate:  55.00 },
  'topsoil':               { category: 'Civil',       unit: 'cubic_yards',  unit_rate:  32.00 },
  'fill dirt':             { category: 'Civil',       unit: 'cubic_yards',  unit_rate:  18.00 },
  'dirt':                  { category: 'Civil',       unit: 'cubic_yards',  unit_rate:  18.00 },
  'mulch':                 { category: 'Civil',       unit: 'cubic_yards',  unit_rate:  42.00 },
  'asphalt':               { category: 'Civil',       unit: 'tons',         unit_rate:  95.00 },

  // ── Lumber & Wood ───────────────────────────────────────────────────────────
  'lumber':                { category: 'Carpentry',   unit: 'linear_feet',  unit_rate:   5.00 },
  'wood':                  { category: 'Carpentry',   unit: 'linear_feet',  unit_rate:   5.00 },
  'plywood':               { category: 'Carpentry',   unit: 'units',        unit_rate:  52.00 },
  'osb':                   { category: 'Carpentry',   unit: 'units',        unit_rate:  42.00 },
  'timber':                { category: 'Carpentry',   unit: 'linear_feet',  unit_rate:   7.00 },
  'hardwood':              { category: 'Carpentry',   unit: 'square_feet',  unit_rate:   9.00 },
  'wood boards':           { category: 'Carpentry',   unit: 'linear_feet',  unit_rate:   5.00 },

  // ── Drywall & Insulation ────────────────────────────────────────────────────
  'drywall':               { category: 'Finishing',   unit: 'square_feet',  unit_rate:   1.50 },
  'sheetrock':             { category: 'Finishing',   unit: 'square_feet',  unit_rate:   1.50 },
  'gypsum board':          { category: 'Finishing',   unit: 'square_feet',  unit_rate:   1.50 },
  'insulation':            { category: 'Finishing',   unit: 'square_feet',  unit_rate:   1.75 },
  'batt insulation':       { category: 'Finishing',   unit: 'square_feet',  unit_rate:   1.75 },
  'spray foam':            { category: 'Finishing',   unit: 'square_feet',  unit_rate:   3.00 },
  'rigid insulation':      { category: 'Finishing',   unit: 'square_feet',  unit_rate:   2.00 },

  // ── Roofing ─────────────────────────────────────────────────────────────────
  'roofing shingles':      { category: 'Roofing',     unit: 'square_feet',  unit_rate:   2.00 },
  'shingles':              { category: 'Roofing',     unit: 'square_feet',  unit_rate:   2.00 },
  'asphalt shingles':      { category: 'Roofing',     unit: 'square_feet',  unit_rate:   2.00 },
  'metal roofing':         { category: 'Roofing',     unit: 'square_feet',  unit_rate:   5.00 },
  'roof tiles':            { category: 'Roofing',     unit: 'square_feet',  unit_rate:   5.50 },
  'underlayment':          { category: 'Roofing',     unit: 'square_feet',  unit_rate:   0.50 },
  'roofing':               { category: 'Roofing',     unit: 'square_feet',  unit_rate:   2.00 },

  // ── Flooring & Tile ─────────────────────────────────────────────────────────
  'tiles':                 { category: 'Finishing',   unit: 'square_feet',  unit_rate:   4.00 },
  'ceramic tile':          { category: 'Finishing',   unit: 'square_feet',  unit_rate:   4.00 },
  'porcelain tile':        { category: 'Finishing',   unit: 'square_feet',  unit_rate:   5.50 },
  'hardwood flooring':     { category: 'Finishing',   unit: 'square_feet',  unit_rate:  10.00 },
  'vinyl flooring':        { category: 'Finishing',   unit: 'square_feet',  unit_rate:   3.00 },
  'carpet':                { category: 'Finishing',   unit: 'square_feet',  unit_rate:   3.50 },
  'laminate flooring':     { category: 'Finishing',   unit: 'square_feet',  unit_rate:   2.50 },
  'flooring':              { category: 'Finishing',   unit: 'square_feet',  unit_rate:   4.50 },
  'floor tiles':           { category: 'Finishing',   unit: 'square_feet',  unit_rate:   4.00 },
  'epoxy flooring':        { category: 'Finishing',   unit: 'square_feet',  unit_rate:   6.00 },

  // ── Glass & Windows ─────────────────────────────────────────────────────────
  'glass':                 { category: 'Finishing',   unit: 'square_feet',  unit_rate:  10.00 },
  'tempered glass':        { category: 'Finishing',   unit: 'square_feet',  unit_rate:  20.00 },
  'windows':               { category: 'Finishing',   unit: 'units',        unit_rate: 400.00 },
  'window':                { category: 'Finishing',   unit: 'units',        unit_rate: 400.00 },
  'sliding door':          { category: 'Finishing',   unit: 'units',        unit_rate: 800.00 },

  // ── Paint & Coatings ────────────────────────────────────────────────────────
  'paint':                 { category: 'Finishing',   unit: 'gallons',      unit_rate:  40.00 },
  'interior paint':        { category: 'Finishing',   unit: 'gallons',      unit_rate:  40.00 },
  'exterior paint':        { category: 'Finishing',   unit: 'gallons',      unit_rate:  50.00 },
  'primer':                { category: 'Finishing',   unit: 'gallons',      unit_rate:  30.00 },
  'stain':                 { category: 'Finishing',   unit: 'gallons',      unit_rate:  35.00 },
  'sealant':               { category: 'Finishing',   unit: 'gallons',      unit_rate:  45.00 },
  'waterproofing':         { category: 'Finishing',   unit: 'gallons',      unit_rate:  55.00 },

  // ── Cement / Binding ────────────────────────────────────────────────────────
  'cement':                { category: 'Civil',       unit: 'units',        unit_rate:  14.00 },
  'portland cement':       { category: 'Civil',       unit: 'units',        unit_rate:  16.00 },
  'cement bags':           { category: 'Civil',       unit: 'units',        unit_rate:  14.00 },

  // ── Plumbing ────────────────────────────────────────────────────────────────
  'copper pipe':           { category: 'Plumbing',    unit: 'linear_feet',  unit_rate:  10.00 },
  'pvc pipe':              { category: 'Plumbing',    unit: 'linear_feet',  unit_rate:   3.00 },
  'pex pipe':              { category: 'Plumbing',    unit: 'linear_feet',  unit_rate:   2.50 },
  'pipe':                  { category: 'Plumbing',    unit: 'linear_feet',  unit_rate:   5.00 },
  'piping':                { category: 'Plumbing',    unit: 'linear_feet',  unit_rate:   5.00 },
  'conduit':               { category: 'Electrical',  unit: 'linear_feet',  unit_rate:   2.50 },
  'plumbing pipe':         { category: 'Plumbing',    unit: 'linear_feet',  unit_rate:   5.00 },

  // ── Electrical ──────────────────────────────────────────────────────────────
  'electrical wire':       { category: 'Electrical',  unit: 'linear_feet',  unit_rate:   1.50 },
  'wire':                  { category: 'Electrical',  unit: 'linear_feet',  unit_rate:   1.50 },
  'cable':                 { category: 'Electrical',  unit: 'linear_feet',  unit_rate:   2.00 },

  // ── Doors & Hardware ────────────────────────────────────────────────────────
  'doors':                 { category: 'Carpentry',   unit: 'units',        unit_rate: 300.00 },
  'door':                  { category: 'Carpentry',   unit: 'units',        unit_rate: 300.00 },
  'interior door':         { category: 'Carpentry',   unit: 'units',        unit_rate: 250.00 },
  'exterior door':         { category: 'Carpentry',   unit: 'units',        unit_rate: 500.00 },
  'hardware':              { category: 'Carpentry',   unit: 'units',        unit_rate:  50.00 },

  // ── Concrete Accessories ────────────────────────────────────────────────────
  'form work':             { category: 'Civil',       unit: 'square_feet',  unit_rate:   3.50 },
  'formwork':              { category: 'Civil',       unit: 'square_feet',  unit_rate:   3.50 },
  'vapor barrier':         { category: 'Civil',       unit: 'square_feet',  unit_rate:   0.30 },
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
 * Always uses the DB canonical unit for display and storage — the ML-parsed
 * unit may differ (e.g. model says "pounds" for drywall, DB says "square_feet").
 * Quantity stays as the user specified; rate is per the DB unit.
 */
async function addEstimateRecord(sessionId, itemName, quantity, _mlUnit) {
  const item = await getItemRate(itemName);
  if (!item) {
    throw new Error(`UNKNOWN_ITEM:${itemName}`);
  }

  // Always use the DB canonical unit — it matches the unit_rate definition
  const canonicalUnit = item.unit;
  const totalCost     = parseFloat((quantity * item.unit_rate).toFixed(2));

  await db.query(
    `INSERT INTO estimate_records (session_id, item_name, quantity, unit, unit_rate, total_cost)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [sessionId, item.item_name, quantity, canonicalUnit, item.unit_rate, totalCost]
  );

  return {
    item_name:  item.item_name,
    category:   item.category,
    quantity,
    unit:       canonicalUnit,
    unit_rate:  item.unit_rate,
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

/**
 * costService.js
 * All cost calculations live here – deterministic, no AI involved.
 * Self-learn: unknown items are looked up in PRICE_CATALOG and auto-inserted
 * into cost_items so they are remembered for future requests.
 *
 * Prices reflect 2026 US national average market rates (USD).
 */

const db = require('../db');

// ── US Construction Price Catalog ─────────────────────────────────────────────
// All rates are per the canonical DB unit listed.
// Includes common aliases so model variants resolve correctly.
const PRICE_CATALOG = {
  // ── Concrete & Masonry ─────────────────────────── 2026 US avg market rates ──
  'concrete':              { category: 'Civil',       unit: 'cubic_yards',  unit_rate: 155.00 },
  'ready mix concrete':    { category: 'Civil',       unit: 'cubic_yards',  unit_rate: 165.00 },
  'concrete mix':          { category: 'Civil',       unit: 'cubic_yards',  unit_rate: 155.00 },
  'mortar':                { category: 'Masonry',     unit: 'cubic_yards',  unit_rate: 115.00 },
  'brick':                 { category: 'Masonry',     unit: 'units',        unit_rate:   0.80 },
  'bricks':                { category: 'Masonry',     unit: 'units',        unit_rate:   0.80 },
  'cinder block':          { category: 'Masonry',     unit: 'units',        unit_rate:   3.00 },
  'concrete block':        { category: 'Masonry',     unit: 'units',        unit_rate:   3.00 },
  'stone':                 { category: 'Masonry',     unit: 'tons',         unit_rate:  65.00 },
  'flagstone':             { category: 'Masonry',     unit: 'square_feet',  unit_rate:   6.50 },
  'pavers':                { category: 'Masonry',     unit: 'square_feet',  unit_rate:   5.00 },

  // ── Structural Steel ────────────────────────────────────────────────────────
  'steel':                 { category: 'Structural',  unit: 'pounds',       unit_rate:   0.95 },
  'steel rebar':           { category: 'Structural',  unit: 'pounds',       unit_rate:   0.90 },
  'rebar':                 { category: 'Structural',  unit: 'pounds',       unit_rate:   0.90 },
  'structural steel':      { category: 'Structural',  unit: 'pounds',       unit_rate:   1.10 },
  'steel beam':            { category: 'Structural',  unit: 'linear_feet',  unit_rate:  28.00 },
  'steel pipe':            { category: 'Structural',  unit: 'linear_feet',  unit_rate:  18.00 },
  'metal':                 { category: 'Structural',  unit: 'pounds',       unit_rate:   0.95 },

  // ── Earthwork & Fill ────────────────────────────────────────────────────────
  'sand':                  { category: 'Civil',       unit: 'cubic_yards',  unit_rate:  42.00 },
  'gravel':                { category: 'Civil',       unit: 'cubic_yards',  unit_rate:  55.00 },
  'crushed stone':         { category: 'Civil',       unit: 'cubic_yards',  unit_rate:  62.00 },
  'topsoil':               { category: 'Civil',       unit: 'cubic_yards',  unit_rate:  38.00 },
  'fill dirt':             { category: 'Civil',       unit: 'cubic_yards',  unit_rate:  22.00 },
  'dirt':                  { category: 'Civil',       unit: 'cubic_yards',  unit_rate:  22.00 },
  'mulch':                 { category: 'Civil',       unit: 'cubic_yards',  unit_rate:  48.00 },
  'asphalt':               { category: 'Civil',       unit: 'tons',         unit_rate: 110.00 },

  // ── Lumber & Wood ───────────────────────────────────────────────────────────
  'lumber':                { category: 'Carpentry',   unit: 'linear_feet',  unit_rate:   5.75 },
  'wood':                  { category: 'Carpentry',   unit: 'linear_feet',  unit_rate:   5.75 },
  'plywood':               { category: 'Carpentry',   unit: 'units',        unit_rate:  60.00 },
  'osb':                   { category: 'Carpentry',   unit: 'units',        unit_rate:  48.00 },
  'timber':                { category: 'Carpentry',   unit: 'linear_feet',  unit_rate:   8.50 },
  'hardwood':              { category: 'Carpentry',   unit: 'square_feet',  unit_rate:  10.50 },
  'wood boards':           { category: 'Carpentry',   unit: 'linear_feet',  unit_rate:   5.75 },

  // ── Drywall & Insulation ────────────────────────────────────────────────────
  'drywall':               { category: 'Finishing',   unit: 'square_feet',  unit_rate:   1.80 },
  'sheetrock':             { category: 'Finishing',   unit: 'square_feet',  unit_rate:   1.80 },
  'gypsum board':          { category: 'Finishing',   unit: 'square_feet',  unit_rate:   1.80 },
  'insulation':            { category: 'Finishing',   unit: 'square_feet',  unit_rate:   2.10 },
  'batt insulation':       { category: 'Finishing',   unit: 'square_feet',  unit_rate:   2.10 },
  'spray foam':            { category: 'Finishing',   unit: 'square_feet',  unit_rate:   3.50 },
  'rigid insulation':      { category: 'Finishing',   unit: 'square_feet',  unit_rate:   2.40 },

  // ── Roofing ─────────────────────────────────────────────────────────────────
  'roofing shingles':      { category: 'Roofing',     unit: 'square_feet',  unit_rate:   2.50 },
  'shingles':              { category: 'Roofing',     unit: 'square_feet',  unit_rate:   2.50 },
  'asphalt shingles':      { category: 'Roofing',     unit: 'square_feet',  unit_rate:   2.50 },
  'metal roofing':         { category: 'Roofing',     unit: 'square_feet',  unit_rate:   6.50 },
  'roof tiles':            { category: 'Roofing',     unit: 'square_feet',  unit_rate:   6.50 },
  'underlayment':          { category: 'Roofing',     unit: 'square_feet',  unit_rate:   0.65 },
  'roofing':               { category: 'Roofing',     unit: 'square_feet',  unit_rate:   2.50 },

  // ── Flooring & Tile ─────────────────────────────────────────────────────────
  'tiles':                 { category: 'Finishing',   unit: 'square_feet',  unit_rate:   4.75 },
  'ceramic tile':          { category: 'Finishing',   unit: 'square_feet',  unit_rate:   4.75 },
  'porcelain tile':        { category: 'Finishing',   unit: 'square_feet',  unit_rate:   6.50 },
  'hardwood flooring':     { category: 'Finishing',   unit: 'square_feet',  unit_rate:  12.00 },
  'vinyl flooring':        { category: 'Finishing',   unit: 'square_feet',  unit_rate:   3.50 },
  'carpet':                { category: 'Finishing',   unit: 'square_feet',  unit_rate:   4.00 },
  'laminate flooring':     { category: 'Finishing',   unit: 'square_feet',  unit_rate:   3.00 },
  'flooring':              { category: 'Finishing',   unit: 'square_feet',  unit_rate:   5.25 },
  'floor tiles':           { category: 'Finishing',   unit: 'square_feet',  unit_rate:   4.75 },
  'epoxy flooring':        { category: 'Finishing',   unit: 'square_feet',  unit_rate:   7.50 },

  // ── Glass & Windows ─────────────────────────────────────────────────────────
  'glass':                 { category: 'Finishing',   unit: 'square_feet',  unit_rate:  12.00 },
  'tempered glass':        { category: 'Finishing',   unit: 'square_feet',  unit_rate:  24.00 },
  'windows':               { category: 'Finishing',   unit: 'units',        unit_rate: 500.00 },
  'window':                { category: 'Finishing',   unit: 'units',        unit_rate: 500.00 },
  'sliding door':          { category: 'Finishing',   unit: 'units',        unit_rate: 950.00 },

  // ── Paint & Coatings ────────────────────────────────────────────────────────
  'paint':                 { category: 'Finishing',   unit: 'gallons',      unit_rate:  48.00 },
  'interior paint':        { category: 'Finishing',   unit: 'gallons',      unit_rate:  48.00 },
  'exterior paint':        { category: 'Finishing',   unit: 'gallons',      unit_rate:  58.00 },
  'primer':                { category: 'Finishing',   unit: 'gallons',      unit_rate:  36.00 },
  'stain':                 { category: 'Finishing',   unit: 'gallons',      unit_rate:  42.00 },
  'sealant':               { category: 'Finishing',   unit: 'gallons',      unit_rate:  52.00 },
  'waterproofing':         { category: 'Finishing',   unit: 'gallons',      unit_rate:  65.00 },

  // ── Cement / Binding ────────────────────────────────────────────────────────
  'cement':                { category: 'Civil',       unit: 'units',        unit_rate:  16.00 },
  'portland cement':       { category: 'Civil',       unit: 'units',        unit_rate:  18.50 },
  'cement bags':           { category: 'Civil',       unit: 'units',        unit_rate:  16.00 },

  // ── Plumbing ────────────────────────────────────────────────────────────────
  'copper pipe':           { category: 'Plumbing',    unit: 'linear_feet',  unit_rate:  13.00 },
  'pvc pipe':              { category: 'Plumbing',    unit: 'linear_feet',  unit_rate:   3.75 },
  'pex pipe':              { category: 'Plumbing',    unit: 'linear_feet',  unit_rate:   3.00 },
  'pipe':                  { category: 'Plumbing',    unit: 'linear_feet',  unit_rate:   6.50 },
  'piping':                { category: 'Plumbing',    unit: 'linear_feet',  unit_rate:   6.50 },
  'conduit':               { category: 'Electrical',  unit: 'linear_feet',  unit_rate:   3.00 },
  'plumbing pipe':         { category: 'Plumbing',    unit: 'linear_feet',  unit_rate:   6.50 },

  // ── Electrical ──────────────────────────────────────────────────────────────
  'electrical wire':       { category: 'Electrical',  unit: 'linear_feet',  unit_rate:   1.75 },
  'wire':                  { category: 'Electrical',  unit: 'linear_feet',  unit_rate:   1.75 },
  'cable':                 { category: 'Electrical',  unit: 'linear_feet',  unit_rate:   2.50 },

  // ── Doors & Hardware ────────────────────────────────────────────────────────
  'doors':                 { category: 'Carpentry',   unit: 'units',        unit_rate: 350.00 },
  'door':                  { category: 'Carpentry',   unit: 'units',        unit_rate: 350.00 },
  'interior door':         { category: 'Carpentry',   unit: 'units',        unit_rate: 280.00 },
  'exterior door':         { category: 'Carpentry',   unit: 'units',        unit_rate: 600.00 },
  'hardware':              { category: 'Carpentry',   unit: 'units',        unit_rate:  55.00 },

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

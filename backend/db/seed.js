/**
 * seed.js – Upsert all catalog items into the DB.
 * Run once after schema.sql:  node backend/db/seed.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('./index');
const { PRICE_CATALOG } = require('../services/costService');

async function seed() {
  console.log(`Seeding ${Object.keys(PRICE_CATALOG).length} items...`);
  for (const [name, { category, unit, unit_rate }] of Object.entries(PRICE_CATALOG)) {
    await db.query(
      `INSERT INTO cost_items (item_name, category, unit, unit_rate)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (item_name) DO UPDATE
         SET unit_rate = EXCLUDED.unit_rate,
             unit      = EXCLUDED.unit,
             category  = EXCLUDED.category`,
      [name, category, unit, unit_rate]
    );
    console.log(`  ✓ ${name}`);
  }
  console.log('Done.');
  process.exit(0);
}

seed().catch((e) => { console.error(e); process.exit(1); });

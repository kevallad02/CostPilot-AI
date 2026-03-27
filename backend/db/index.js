const { Pool } = require('pg');
const dns = require('dns');

// Force IPv4 for all DNS lookups – fixes Render → Supabase IPv6 routing failure.
// Supabase's direct host (db.*.supabase.co) resolves to IPv6 on Render's network;
// the pooler host (*.pooler.supabase.com) is IPv4-only and is the preferred URL.
dns.setDefaultResultOrder('ipv4first');

// Supabase provides a connection string – prefer that over individual vars.
// Use the Transaction Pooler string (port 6543) from Supabase Dashboard:
//   Project Settings → Database → Connection pooling → Transaction mode
const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }, // required by Supabase
      }
    : {
        // Fallback: individual vars (local dev without DATABASE_URL)
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        database: process.env.DB_NAME || 'costpilot',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '',
        ssl: false,
      }
);

pool.on('error', (err) => {
  console.error('[DB] Unexpected pool error:', err.message);
});

module.exports = pool;

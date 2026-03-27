const { Pool } = require('pg');

// Supabase provides a connection string – prefer that over individual vars.
// Transaction mode (port 6543, pgbouncer): good for serverless/short-lived connections.
// Session mode  (port 5432):               required if you use prepared statements.
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

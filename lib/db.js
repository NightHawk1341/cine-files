const { Pool } = require('pg');

let pool = null;

/**
 * Returns a lazily-initialized PostgreSQL connection pool.
 * Singleton pattern — same pool reused across all requests.
 * @returns {Pool}
 */
function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false }
        : false,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 30000,
      query_timeout: 45000,
      statement_timeout: 45000,
    });

    pool.on('error', (err) => {
      console.error('Unexpected pool error:', err);
    });
  }

  return pool;
}

/**
 * Gracefully close the pool (for shutdown).
 */
async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = { getPool, closePool };

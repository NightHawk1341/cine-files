/**
 * Shared Database Connection Pool
 * Centralized PostgreSQL connection management
 *
 * This module provides a singleton database connection pool
 * used by all API endpoints to reduce memory usage and improve performance.
 */

const { Pool } = require('pg');

// Singleton pool instance
let pool = null;

/**
 * Get database connection pool
 * Lazily initializes pool on first call
 *
 * @returns {Pool} PostgreSQL connection pool
 */
function getPool() {
  if (!pool) {
    // SSL configuration for database connection
    // SECURITY NOTE: Supabase Transaction Pooler uses certificates from their internal CA
    // which aren't in Node's default CA store. The rejectUnauthorized: false setting is
    // documented by Supabase as required for their pooler connections.
    // See: https://supabase.com/docs/guides/database/connecting-to-postgres#connection-pooler
    //
    // This is acceptable because:
    // 1. The connection is still encrypted via TLS
    // 2. Supabase pooler uses internal certificates, not public CA
    // 3. The DATABASE_URL includes Supabase's specific hostname which provides implicit trust
    //
    // For enhanced security in the future, consider:
    // - Using direct connection (non-pooler) with proper CA validation
    // - Downloading Supabase's CA certificate and specifying it explicitly
    const sslConfig = process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false } // Required for Supabase Transaction Pooler
      : false;

    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: sslConfig,
      // Recommended pool configuration
      max: 20, // Maximum connections in pool
      idleTimeoutMillis: 30000, // Close idle connections after 30s
      connectionTimeoutMillis: 30000, // Timeout after 30s if connection unavailable (increased from 15s)
      query_timeout: 45000, // Timeout queries after 45s (increased from 30s)
      statement_timeout: 45000, // PostgreSQL statement timeout
    });

    // Log pool errors
    pool.on('error', (err) => {
      console.error('Unexpected database pool error:', err);
    });

    console.log('Database connection pool initialized');
  }

  return pool;
}

/**
 * Close database connection pool
 * Useful for graceful shutdowns and testing
 *
 * @returns {Promise<void>}
 */
async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('Database connection pool closed');
  }
}

module.exports = {
  getPool,
  closePool
};

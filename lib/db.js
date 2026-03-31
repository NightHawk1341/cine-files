const { Pool } = require('pg');

let pool = null;

// Transient error codes that should trigger a retry
var TRANSIENT_ERRORS = ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', '57P03', '57P01', '08006', '08001'];

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
 * Warm up the connection pool with exponential backoff (INFRA-1).
 * Ported from TR-BUTE lib/db.js.
 * @param {number} [maxAttempts=5]
 * @returns {Promise<void>}
 */
async function warmupPool(maxAttempts) {
  if (!maxAttempts) maxAttempts = 5;
  var p = getPool();
  for (var attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      var client = await p.connect();
      client.release();
      console.log('DB pool warmed up (attempt ' + attempt + ')');
      return;
    } catch (err) {
      console.warn('DB warmup attempt ' + attempt + '/' + maxAttempts + ' failed:', err.message);
      if (attempt < maxAttempts) {
        var delay = Math.pow(2, attempt) * 500; // 1s, 2s, 4s, 8s
        await new Promise(function (resolve) { setTimeout(resolve, delay); });
      }
    }
  }
  console.error('DB warmup failed after ' + maxAttempts + ' attempts — pool may cold-start on first query');
}

/**
 * Execute a query with retry on transient connection errors (INFRA-2).
 * Ported from TR-BUTE lib/db.js.
 * @param {string} text - SQL query text
 * @param {Array} [params] - Query parameters
 * @param {number} [maxRetries=3] - Maximum retry attempts
 * @returns {Promise<import('pg').QueryResult>}
 */
async function queryWithRetry(text, params, maxRetries) {
  if (!maxRetries) maxRetries = 3;
  var p = getPool();
  var lastError;

  for (var attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await p.query(text, params);
    } catch (err) {
      lastError = err;
      var code = err.code || '';
      var errMsg = err.message || '';
      var isTransient = false;

      for (var i = 0; i < TRANSIENT_ERRORS.length; i++) {
        if (code === TRANSIENT_ERRORS[i] || errMsg.indexOf(TRANSIENT_ERRORS[i]) !== -1) {
          isTransient = true;
          break;
        }
      }

      if (!isTransient || attempt >= maxRetries) {
        throw err;
      }

      console.warn('Transient DB error (attempt ' + (attempt + 1) + '/' + (maxRetries + 1) + '):', errMsg);
      var delay = Math.pow(2, attempt) * 200; // 200ms, 400ms, 800ms
      await new Promise(function (resolve) { setTimeout(resolve, delay); });
    }
  }

  throw lastError;
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

module.exports = { getPool, closePool, warmupPool, queryWithRetry };

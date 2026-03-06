/**
 * Service Daily Stats - Database Persistence
 *
 * Stores daily counters for external services (Yandex SMTP, APIShip, etc.)
 * Uses PostgreSQL with UPSERT for atomic increments.
 * Table is auto-created on first use.
 */

const { getPool } = require('./db');

let tableReady = false;

/**
 * Ensure the stats table exists (runs once per process)
 */
async function ensureTable() {
  if (tableReady) return;
  try {
    const pool = getPool();
    await pool.query(`
      CREATE TABLE IF NOT EXISTS service_daily_stats (
        service TEXT NOT NULL,
        date DATE NOT NULL DEFAULT CURRENT_DATE,
        counter TEXT NOT NULL,
        value INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (service, date, counter)
      )
    `);
    tableReady = true;
  } catch (err) {
    console.error('[ServiceStats] Failed to create table:', err.message);
  }
}

/**
 * Increment a counter by 1 for today
 * @param {string} service - e.g. 'yandex_smtp', 'apiship'
 * @param {string} counter - e.g. 'sent', 'failed', 'calculator_calls'
 */
async function increment(service, counter) {
  try {
    await ensureTable();
    const pool = getPool();
    await pool.query(`
      INSERT INTO service_daily_stats (service, date, counter, value)
      VALUES ($1, CURRENT_DATE, $2, 1)
      ON CONFLICT (service, date, counter)
      DO UPDATE SET value = service_daily_stats.value + 1
    `, [service, counter]);
  } catch (err) {
    // Non-critical — don't break email/shipping if DB write fails
    console.error(`[ServiceStats] Failed to persist ${service}.${counter}:`, err.message);
  }
}

/**
 * Get all counters for a service for today
 * @param {string} service
 * @returns {Promise<Object>} e.g. { sent: 5, failed: 1 }
 */
async function getToday(service) {
  try {
    await ensureTable();
    const pool = getPool();
    const result = await pool.query(
      'SELECT counter, value FROM service_daily_stats WHERE service = $1 AND date = CURRENT_DATE',
      [service]
    );
    const stats = {};
    for (const row of result.rows) {
      stats[row.counter] = row.value;
    }
    return stats;
  } catch (err) {
    console.error(`[ServiceStats] Failed to read ${service} today:`, err.message);
    return {};
  }
}

/**
 * Get summed counters for a service for the current month
 * @param {string} service
 * @returns {Promise<Object>} e.g. { calculator_calls: 150, cache_hits: 400, total_calls: 550 }
 */
async function getMonth(service) {
  try {
    await ensureTable();
    const pool = getPool();
    const result = await pool.query(
      `SELECT counter, SUM(value)::int as value
       FROM service_daily_stats
       WHERE service = $1 AND date >= date_trunc('month', CURRENT_DATE)
       GROUP BY counter`,
      [service]
    );
    const stats = {};
    for (const row of result.rows) {
      stats[row.counter] = row.value;
    }
    return stats;
  } catch (err) {
    console.error(`[ServiceStats] Failed to read ${service} month:`, err.message);
    return {};
  }
}

module.exports = {
  increment,
  getToday,
  getMonth
};

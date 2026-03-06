/**
 * Email Sending Statistics Tracker
 *
 * Tracks email usage across providers (Postbox + SMTP fallback) with
 * both in-memory counters (fast) and database persistence (survives deploys).
 *
 * Postbox limit: ~10M/day. Yandex SMTP fallback limit: 500/day.
 */

const dailyStats = require('./serviceDailyStats');

const SERVICE = 'email';
const DAILY_LIMIT = 500; // Conservative limit (applies to SMTP fallback)

// In-memory cache (fast reads, loaded from DB on first getEmailStats)
let cache = { date: null, sent: 0, failed: 0 };
let cacheLoaded = false;

/**
 * Track a successful email send
 */
function trackEmailSent() {
  resetIfNewDay();
  cache.sent++;
  console.log(`[Email] Today: ${cache.sent}/${DAILY_LIMIT} emails sent`);
  dailyStats.increment(SERVICE, 'sent');
}

/**
 * Track a failed email send
 */
function trackEmailFailed() {
  resetIfNewDay();
  cache.failed++;
  dailyStats.increment(SERVICE, 'failed');
}

/**
 * Get current email stats (loads from DB on first call to recover after restart)
 * @returns {Promise<{ date: string, sent: number, failed: number, limit: number, remaining: number }>}
 */
async function getEmailStats() {
  if (!cacheLoaded) {
    try {
      const dbStats = await dailyStats.getToday(SERVICE);
      cache.date = new Date().toISOString().split('T')[0];
      cache.sent = dbStats.sent || 0;
      cache.failed = dbStats.failed || 0;
      cacheLoaded = true;
    } catch (err) {
      // Fall through to in-memory values
    }
  }
  resetIfNewDay();
  return {
    date: cache.date,
    sent: cache.sent,
    failed: cache.failed,
    limit: DAILY_LIMIT,
    remaining: Math.max(0, DAILY_LIMIT - cache.sent)
  };
}

function resetIfNewDay() {
  const today = new Date().toISOString().split('T')[0];
  if (cache.date !== today) {
    if (cache.date) {
      console.log(`[Email] Daily stats for ${cache.date}: ${cache.sent} sent, ${cache.failed} failed`);
    }
    cache = { date: today, sent: 0, failed: 0 };
    cacheLoaded = false;
  }
}

module.exports = {
  trackEmailSent,
  trackEmailFailed,
  getEmailStats
};

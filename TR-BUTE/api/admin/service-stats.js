/**
 * Service Stats API
 * Returns usage statistics for external services (Yandex SMTP, APIShip)
 * Data is persisted in database and survives restarts.
 * GET /api/admin/service-stats
 */

const { getEmailStats } = require('../../lib/emailStats');
const dailyStats = require('../../lib/serviceDailyStats');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Email: today from DB-backed cache
    const email = await getEmailStats();

    // APIShip: today + monthly from DB
    const [apishipToday, apishipMonth] = await Promise.all([
      dailyStats.getToday('apiship'),
      dailyStats.getMonth('apiship')
    ]);

    return res.status(200).json({
      email: {
        date: email.date,
        sent: email.sent,
        failed: email.failed,
        limit: email.limit,
        remaining: email.remaining
      },
      apiship: {
        date: new Date().toISOString().split('T')[0],
        calculatorCalls: apishipToday.calculator_calls || 0,
        cacheHits: apishipToday.cache_hits || 0,
        totalCalls: apishipToday.total_calls || 0,
        monthlyCalculatorCalls: apishipMonth.calculator_calls || 0,
        monthlyTotalCalls: apishipMonth.total_calls || 0,
        monthlyLimit: 10000
      }
    });
  } catch (error) {
    console.error('[ServiceStats] Error fetching stats:', error.message);
    return res.status(500).json({ error: 'Failed to fetch service stats' });
  }
};

/**
 * CRON: Clean up expired auth tokens
 *
 * Deletes auth_tokens rows where expires_at < NOW() to prevent table bloat.
 *
 * GET /api/cron/cleanup-tokens
 * Authorization: Bearer <CRON_SECRET>
 *
 * Schedule: daily ("0 3 * * *")
 */

const { getPool } = require('../../lib/db');

const pool = getPool();

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers['authorization'];
  const isVercelCron = req.headers['x-vercel-cron'];

  if (!isVercelCron && cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const result = await pool.query(
      'DELETE FROM auth_tokens WHERE expires_at < NOW()'
    );

    console.log(`[Cron] Cleaned up ${result.rowCount} expired auth tokens`);

    return res.status(200).json({
      success: true,
      deleted: result.rowCount
    });
  } catch (error) {
    console.error('[Cron] Token cleanup error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

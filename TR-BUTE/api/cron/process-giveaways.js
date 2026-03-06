/**
 * CRON: Process expired giveaways
 *
 * Finds active giveaways past their end_time and picks winners.
 *
 * GET /api/cron/process-giveaways
 * Authorization: Bearer <CRON_SECRET>
 *
 * Schedule: every 5 minutes ("*\/5 * * * *")
 */

const { getPool } = require('../../lib/db');
const { pickAndAnnounceWinners } = require('../admin/giveaways/index');

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
    const { rows: expired } = await pool.query(
      `SELECT id FROM giveaways WHERE status = 'active' AND end_time <= NOW()`
    );

    const results = [];
    for (const { id } of expired) {
      try {
        const result = await pickAndAnnounceWinners(id);
        results.push({ giveaway_id: id, winners: result.winners.length, participants: result.totalParticipants });
      } catch (err) {
        console.error(`Failed to process giveaway ${id}:`, err.message);
        results.push({ giveaway_id: id, error: err.message });
      }
    }

    res.json({ processed: expired.length, results });
  } catch (err) {
    console.error('process-giveaways cron error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

/**
 * Reorder Stories
 * POST /api/admin/stories/reorder
 *
 * Body: { story_ids: [1, 3, 2, ...] } - Array of story IDs in desired order
 */

const { getPool } = require('../../../lib/db');
const { success, error, badRequest, methodNotAllowed } = require('../../../server/utils/response-helpers');

const pool = getPool();

/**
 * Main handler
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST']);
  }

  try {
    const { story_ids } = req.body;

    if (!story_ids || !Array.isArray(story_ids) || story_ids.length === 0) {
      return badRequest(res, 'story_ids array is required');
    }

    // Update sort_order for each story
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (let i = 0; i < story_ids.length; i++) {
        await client.query(
          'UPDATE stories SET sort_order = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [i + 1, story_ids[i]]
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    return success(res, {
      message: 'Stories reordered successfully'
    });

  } catch (err) {
    console.error('Error reordering stories:', err);
    return error(res, 'Failed to reorder stories', 500);
  }
};

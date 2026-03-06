/**
 * Picker Progress Sync Endpoints
 * GET /api/sync/picker - Get picker progress
 * POST /api/sync/picker - Save picker progress
 *
 * REQUIRES AUTHENTICATION
 */

const { getPool } = require('../../lib/db');
const { success, error, badRequest, unauthorized, methodNotAllowed } = require('../../server/utils/response-helpers');

const pool = getPool();

/**
 * Main handler - routes to GET or POST based on method
 */
module.exports = async function handler(req, res) {
  if (!req.userId) {
    return unauthorized(res, 'Authentication required');
  }

  switch (req.method) {
    case 'GET':
      return handleGet(req, res);
    case 'POST':
      return handlePost(req, res);
    default:
      return methodNotAllowed(res, ['GET', 'POST']);
  }
};

/**
 * GET - Fetch picker progress
 */
async function handleGet(req, res) {
  try {
    const result = await pool.query(
      'SELECT products, current_index, history FROM user_picker_progress WHERE user_id = $1',
      [req.userId]
    );

    if (result.rows.length === 0) {
      return success(res, null);
    }

    const row = result.rows[0];
    return success(res, {
      products: row.products || [],
      currentIndex: row.current_index || 0,
      history: row.history || []
    });
  } catch (err) {
    console.error('Error fetching picker progress:', err);
    return error(res, 'Failed to fetch picker progress', 500);
  }
}

/**
 * POST - Save picker progress
 */
async function handlePost(req, res) {
  try {
    const { products, currentIndex, history } = req.body;

    if (!Array.isArray(products)) {
      return badRequest(res, 'Products must be an array');
    }

    const productsJson = JSON.stringify(products);
    const historyJson = JSON.stringify(history || []);

    // Try update first (works regardless of unique constraint)
    const updateResult = await pool.query(
      `UPDATE user_picker_progress
       SET products = $2, current_index = $3, history = $4, updated_at = NOW()
       WHERE user_id = $1`,
      [req.userId, productsJson, currentIndex || 0, historyJson]
    );

    // If no row was updated, insert a new one
    if (updateResult.rowCount === 0) {
      await pool.query(
        `INSERT INTO user_picker_progress (user_id, products, current_index, history, updated_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [req.userId, productsJson, currentIndex || 0, historyJson]
      );
    }

    return success(res, { saved: true });
  } catch (err) {
    console.error('Error syncing picker progress:', err);
    return error(res, 'Failed to sync picker progress', 500);
  }
}

/**
 * Wishlist Share API
 * POST /api/favorites/share (authenticated)
 * Creates or returns an existing share link for the user's live favorites
 */

const crypto = require('crypto');
const { getPool } = require('../../lib/db');
const { success, error, badRequest, methodNotAllowed } = require('../../server/utils/response-helpers');

const pool = getPool();

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST']);
  }

  try {
    const userId = req.userId;
    if (!userId) return error(res, 'Unauthorized', 401);

    // Check user has favorites
    const favsCount = await pool.query(
      'SELECT COUNT(*)::int AS count FROM user_favorites WHERE user_id = $1',
      [userId]
    );

    if (favsCount.rows[0].count === 0) {
      return badRequest(res, 'No favorites to share');
    }

    // Reuse existing token if one exists and is not expired
    const existing = await pool.query(
      `SELECT share_token FROM shared_wishlists
       WHERE user_id = $1 AND (expires_at IS NULL OR expires_at > now())
       ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );

    let shareToken;
    if (existing.rows.length > 0) {
      shareToken = existing.rows[0].share_token;
    } else {
      shareToken = crypto.randomBytes(16).toString('hex');
      await pool.query(
        `INSERT INTO shared_wishlists (user_id, share_token, product_ids, tags)
         VALUES ($1, $2, '[]'::jsonb, '{}'::jsonb)`,
        [userId, shareToken]
      );
    }

    const siteUrl = process.env.APP_URL || 'https://buy-tribute.com';
    const shareUrl = `${siteUrl}/favorites?shared=${shareToken}`;

    return success(res, { shareToken, shareUrl });
  } catch (err) {
    console.error('Error creating wishlist share:', err);
    return error(res, 'Failed to create share link', 500);
  }
};

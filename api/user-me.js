const { config } = require('../lib/config');

/**
 * GET /api/users/me/comments — current user's comments with article info.
 */
function comments({ pool }) {
  return async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const { rows } = await pool.query(
        `SELECT c.id, c.body, c.status, c.created_at,
                a.id AS article_id, a.title AS article_title, a.slug AS article_slug,
                cat.slug AS category_slug
         FROM comments c
         JOIN articles a ON a.id = c.article_id
         LEFT JOIN categories cat ON cat.id = a.category_id
         WHERE c.user_id = $1 AND c.status != 'deleted'
         ORDER BY c.created_at DESC
         LIMIT 50`,
        [req.user.userId]
      );

      res.json({ comments: rows });
    } catch (err) {
      console.error('user-me/comments error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

/**
 * GET /api/users/me/articles — current user's articles (editors only).
 */
function articles({ pool }) {
  return async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const { rows } = await pool.query(
        `SELECT a.id, a.title, a.slug, a.status, a.created_at, a.published_at,
                a.view_count, a.comment_count,
                cat.name_ru AS category_name, cat.slug AS category_slug
         FROM articles a
         LEFT JOIN categories cat ON cat.id = a.category_id
         WHERE a.author_id = $1
         ORDER BY a.created_at DESC
         LIMIT 100`,
        [req.user.userId]
      );

      res.json({ articles: rows });
    } catch (err) {
      console.error('user-me/articles error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

/**
 * PUT /api/users/me — update own profile (display_name, preferences).
 */
function update({ pool }) {
  return async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const { display_name } = req.body;
    if (!display_name || typeof display_name !== 'string' || display_name.trim().length === 0) {
      return res.status(400).json({ error: 'display_name is required' });
    }

    try {
      const { rows } = await pool.query(
        `UPDATE users SET display_name = $1 WHERE id = $2
         RETURNING id, display_name, avatar_url, role, email`,
        [display_name.trim().slice(0, 100), req.user.userId]
      );

      if (!rows[0]) return res.status(404).json({ error: 'User not found' });
      res.json(rows[0]);
    } catch (err) {
      console.error('user-me/update error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

/**
 * DELETE /api/users/me — delete own account.
 */
function remove({ pool }) {
  return async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    try {
      // Delete user (cascades to auth_tokens, comments, etc.)
      await pool.query('DELETE FROM users WHERE id = $1', [req.user.userId]);

      // Clear cookies
      res.clearCookie('access_token', {
        httpOnly: true,
        secure: config.isProd,
        sameSite: 'lax',
        path: '/',
      });
      res.clearCookie('refresh_token', {
        httpOnly: true,
        secure: config.isProd,
        sameSite: 'lax',
        path: '/api/auth',
      });

      res.json({ ok: true });
    } catch (err) {
      console.error('user-me/remove error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

/**
 * GET /api/users/me/favorites — current user's saved article IDs.
 */
function favorites({ pool }) {
  return async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const { rows } = await pool.query(
        `SELECT article_ids FROM user_favorites WHERE user_id = $1`,
        [req.user.userId]
      );

      res.json({ article_ids: rows[0] ? rows[0].article_ids : [] });
    } catch (err) {
      // Table may not exist yet
      res.json({ article_ids: [] });
    }
  };
}

/**
 * PUT /api/users/me/favorites — sync saved article IDs.
 */
function updateFavorites({ pool }) {
  return async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const { article_ids } = req.body;
    if (!Array.isArray(article_ids)) {
      return res.status(400).json({ error: 'article_ids must be an array' });
    }

    // Sanitize: only integers, max 500
    const clean = article_ids
      .map(function (id) { return Number(id); })
      .filter(function (id) { return Number.isInteger(id) && id > 0; })
      .slice(0, 500);

    try {
      await pool.query(
        `INSERT INTO user_favorites (user_id, article_ids, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (user_id)
         DO UPDATE SET article_ids = $2, updated_at = NOW()`,
        [req.user.userId, clean]
      );

      res.json({ ok: true, article_ids: clean });
    } catch (err) {
      console.error('user-me/updateFavorites error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

module.exports = { comments, articles, update, remove, favorites, updateFavorites };

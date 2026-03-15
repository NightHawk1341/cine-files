/**
 * GET /api/comments?article_id=X
 */
function list({ pool }) {
  return async (req, res) => {
    const articleId = req.query.article_id;
    const page = Math.max(1, parseInt(req.query.page || '1'));
    const limit = Math.min(parseInt(req.query.limit || '20'), 50);
    const offset = (page - 1) * limit;

    if (!articleId || isNaN(parseInt(articleId))) {
      return res.status(400).json({ error: 'article_id is required and must be a number' });
    }

    const [commentsResult, countResult] = await Promise.all([
      pool.query(
        `SELECT c.*, u.id AS user_id_val, u.display_name, u.avatar_url
         FROM comments c
         JOIN users u ON c.user_id = u.id
         WHERE c.article_id = $1 AND c.parent_id IS NULL AND c.status = 'visible'
         ORDER BY c.created_at DESC
         LIMIT $2 OFFSET $3`,
        [parseInt(articleId), limit, offset]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS total FROM comments
         WHERE article_id = $1 AND parent_id IS NULL AND status = 'visible'`,
        [parseInt(articleId)]
      ),
    ]);

    const total = countResult.rows[0].total;
    const commentIds = commentsResult.rows.map(c => c.id);

    // Fetch replies for all top-level comments
    let repliesByParent = {};
    if (commentIds.length > 0) {
      const repliesResult = await pool.query(
        `SELECT c.*, u.id AS user_id_val, u.display_name, u.avatar_url
         FROM comments c
         JOIN users u ON c.user_id = u.id
         WHERE c.parent_id = ANY($1) AND c.status = 'visible'
         ORDER BY c.created_at ASC`,
        [commentIds]
      );
      for (const r of repliesResult.rows) {
        if (!repliesByParent[r.parent_id]) repliesByParent[r.parent_id] = [];
        repliesByParent[r.parent_id].push(formatComment(r));
      }
    }

    const comments = commentsResult.rows.map(row => ({
      ...formatComment(row),
      replies: repliesByParent[row.id] || [],
    }));

    res.json({
      comments,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  };
}

/**
 * POST /api/comments
 */
function create({ pool }) {
  return async (req, res) => {
    try {
      const { articleId, parentId, body } = req.body;

      if (!articleId || !body?.trim()) {
        return res.status(400).json({ error: 'articleId and body are required' });
      }

      // Verify article exists and allows comments
      const { rows: articleRows } = await pool.query(
        `SELECT allow_comments, status FROM articles WHERE id = $1`,
        [articleId]
      );
      if (!articleRows[0] || articleRows[0].status !== 'published') {
        return res.status(404).json({ error: 'Article not found' });
      }
      if (!articleRows[0].allow_comments) {
        return res.status(403).json({ error: 'Comments are disabled for this article' });
      }

      // Verify parent if replying
      if (parentId) {
        const { rows: parentRows } = await pool.query(
          'SELECT article_id, status FROM comments WHERE id = $1',
          [parentId]
        );
        if (!parentRows[0] || parentRows[0].article_id !== articleId || parentRows[0].status !== 'visible') {
          return res.status(404).json({ error: 'Parent comment not found' });
        }
      }

      const { rows } = await pool.query(
        `INSERT INTO comments (article_id, user_id, parent_id, body)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [articleId, req.user.userId, parentId || null, body.trim()]
      );

      // Increment article comment count
      await pool.query(
        'UPDATE articles SET comment_count = comment_count + 1 WHERE id = $1',
        [articleId]
      );

      // Fetch user info
      const { rows: userRows } = await pool.query(
        'SELECT id, display_name, avatar_url FROM users WHERE id = $1',
        [req.user.userId]
      );

      const comment = {
        ...formatComment({ ...rows[0], ...userRows[0] }),
      };

      res.status(201).json({ comment });
    } catch (err) {
      console.error('Create comment error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

function formatComment(row) {
  return {
    id: row.id,
    articleId: row.article_id,
    parentId: row.parent_id,
    body: row.body,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    user: {
      id: row.user_id_val || row.user_id,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
    },
  };
}

module.exports = { list, create };

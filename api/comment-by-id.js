/**
 * PUT /api/comments/:id
 */
function update({ pool }) {
  return async (req, res) => {
    try {
      const commentId = parseInt(req.params.id);
      const { body } = req.body;

      if (!body?.trim()) {
        return res.status(400).json({ error: 'body is required' });
      }

      const { rows: existing } = await pool.query(
        'SELECT user_id, status FROM comments WHERE id = $1', [commentId]
      );
      if (!existing[0] || existing[0].status !== 'visible') {
        return res.status(404).json({ error: 'Comment not found' });
      }

      if (existing[0].user_id !== req.user.userId && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const { rows } = await pool.query(
        `UPDATE comments SET body = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
        [body.trim(), commentId]
      );

      const { rows: userRows } = await pool.query(
        'SELECT id, display_name, avatar_url FROM users WHERE id = $1',
        [rows[0].user_id]
      );

      res.json({
        comment: {
          id: rows[0].id,
          body: rows[0].body,
          createdAt: rows[0].created_at,
          updatedAt: rows[0].updated_at,
          user: {
            id: userRows[0].id,
            displayName: userRows[0].display_name,
            avatarUrl: userRows[0].avatar_url,
          },
        },
      });
    } catch (err) {
      console.error('Update comment error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

/**
 * DELETE /api/comments/:id — soft-delete
 */
function remove({ pool }) {
  return async (req, res) => {
    try {
      const commentId = parseInt(req.params.id);

      const { rows: existing } = await pool.query(
        'SELECT user_id, article_id FROM comments WHERE id = $1', [commentId]
      );
      if (!existing[0]) return res.status(404).json({ error: 'Comment not found' });

      if (existing[0].user_id !== req.user.userId && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden' });
      }

      await pool.query(
        "UPDATE comments SET status = 'deleted' WHERE id = $1", [commentId]
      );

      await pool.query(
        'UPDATE articles SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = $1',
        [existing[0].article_id]
      );

      res.json({ message: 'Comment deleted' });
    } catch (err) {
      console.error('Delete comment error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

module.exports = { update, remove };

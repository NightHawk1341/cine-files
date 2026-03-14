/**
 * POST /api/admin/comments/:id/moderate
 * Body: { action: 'hide' | 'show' | 'delete' }
 */
function moderate({ pool }) {
  return async (req, res) => {
    try {
      const commentId = parseInt(req.params.id);
      const { action } = req.body;

      const { rows: existing } = await pool.query(
        'SELECT article_id, status FROM comments WHERE id = $1', [commentId]
      );
      if (!existing[0]) return res.status(404).json({ error: 'Comment not found' });

      let newStatus;
      switch (action) {
        case 'hide': newStatus = 'hidden'; break;
        case 'show': newStatus = 'visible'; break;
        case 'delete': newStatus = 'deleted'; break;
        default: return res.status(400).json({ error: 'Invalid action' });
      }

      const wasVisible = existing[0].status === 'visible';
      const willBeVisible = newStatus === 'visible';

      await pool.query(
        'UPDATE comments SET status = $1 WHERE id = $2',
        [newStatus, commentId]
      );

      // Update article comment count
      if (wasVisible && !willBeVisible) {
        await pool.query(
          'UPDATE articles SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = $1',
          [existing[0].article_id]
        );
      } else if (!wasVisible && willBeVisible) {
        await pool.query(
          'UPDATE articles SET comment_count = comment_count + 1 WHERE id = $1',
          [existing[0].article_id]
        );
      }

      res.json({ message: `Comment ${action}d` });
    } catch (err) {
      console.error('Moderate comment error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

module.exports = { moderate };

/**
 * GET /api/media — list media items.
 * DELETE /api/media/:id — delete a media item (admin only).
 */

/**
 * GET /api/media?limit=50&offset=0
 */
function list({ pool }) {
  return async (req, res) => {
    try {
      var limit = Math.min(Number(req.query.limit) || 50, 200);
      var offset = Number(req.query.offset) || 0;

      var { rows } = await pool.query(
        `SELECT m.id, m.url, m.filename, m.mime_type, m.file_size,
                m.width, m.height, m.alt_text, m.credit, m.created_at,
                u.display_name AS uploader_name
         FROM media m
         LEFT JOIN users u ON u.id = m.uploaded_by
         ORDER BY m.created_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );

      var countResult = await pool.query('SELECT COUNT(*) FROM media');
      var total = Number(countResult.rows[0].count);

      res.json({
        media: rows.map(function (m) {
          return {
            id: Number(m.id),
            url: m.url,
            filename: m.filename,
            mime_type: m.mime_type,
            file_size: Number(m.file_size) || 0,
            width: m.width ? Number(m.width) : null,
            height: m.height ? Number(m.height) : null,
            alt_text: m.alt_text,
            credit: m.credit,
            uploader_name: m.uploader_name,
            created_at: m.created_at,
          };
        }),
        total: total,
      });
    } catch (err) {
      console.error('List media error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

/**
 * DELETE /api/media/:id
 */
function remove({ pool }) {
  return async (req, res) => {
    try {
      var id = Number(req.params.id);
      var { rowCount } = await pool.query('DELETE FROM media WHERE id = $1', [id]);

      if (rowCount === 0) {
        return res.status(404).json({ error: 'Media not found' });
      }

      res.json({ success: true });
    } catch (err) {
      console.error('Delete media error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

module.exports = { list, remove };

/**
 * GET /api/tags/:id — by numeric ID or slug
 */
function get({ pool }) {
  return async (req, res) => {
    const { id } = req.params;
    const isNumeric = /^\d+$/.test(id);

    const { rows } = await pool.query(
      `SELECT t.*, te.tmdb_id, te.entity_type AS tmdb_entity_type, te.title_ru AS tmdb_title_ru,
              te.title_en AS tmdb_title_en, te.metadata AS tmdb_metadata,
              (SELECT COUNT(*)::int FROM article_tags WHERE tag_id = t.id) AS live_article_count
       FROM tags t
       LEFT JOIN tmdb_entities te ON t.tmdb_entity_id = te.id
       WHERE ${isNumeric ? 't.id = $1' : 't.slug = $1'}
       LIMIT 1`,
      [isNumeric ? parseInt(id) : id]
    );

    if (!rows[0]) return res.status(404).json({ error: 'Tag not found' });

    const r = rows[0];
    res.json({
      tag: {
        id: r.id,
        slug: r.slug,
        nameRu: r.name_ru,
        nameEn: r.name_en,
        tagType: r.tag_type,
        articleCount: Number(r.article_count),
        tmdbEntity: r.tmdb_id ? {
          tmdbId: r.tmdb_id,
          entityType: r.tmdb_entity_type,
          titleRu: r.tmdb_title_ru,
          titleEn: r.tmdb_title_en,
          metadata: r.tmdb_metadata,
        } : null,
      },
    });
  };
}

/**
 * PUT /api/tags/:id
 */
function update({ pool }) {
  return async (req, res) => {
    try {
      const tagId = parseInt(req.params.id);
      const { nameRu, nameEn, tagType } = req.body;

      const { rows: existing } = await pool.query(
        'SELECT id FROM tags WHERE id = $1', [tagId]
      );
      if (!existing[0]) return res.status(404).json({ error: 'Tag not found' });

      const sets = [];
      const params = [];
      let idx = 1;

      if (nameRu !== undefined) { sets.push(`name_ru = $${idx}`); params.push(nameRu); idx++; }
      if (nameEn !== undefined) { sets.push(`name_en = $${idx}`); params.push(nameEn); idx++; }
      if (tagType !== undefined) { sets.push(`tag_type = $${idx}`); params.push(tagType); idx++; }

      if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });

      params.push(tagId);
      const { rows } = await pool.query(
        `UPDATE tags SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
        params
      );

      res.json({
        tag: {
          id: rows[0].id,
          slug: rows[0].slug,
          nameRu: rows[0].name_ru,
          nameEn: rows[0].name_en,
          tagType: rows[0].tag_type,
          articleCount: Number(rows[0].article_count),
        },
      });
    } catch (err) {
      console.error('Update tag error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

/**
 * DELETE /api/tags/:id
 */
function remove({ pool }) {
  return async (req, res) => {
    try {
      const tagId = parseInt(req.params.id);

      const { rows } = await pool.query('SELECT id FROM tags WHERE id = $1', [tagId]);
      if (!rows[0]) return res.status(404).json({ error: 'Tag not found' });

      await pool.query('DELETE FROM tags WHERE id = $1', [tagId]);
      res.json({ message: 'Tag deleted' });
    } catch (err) {
      console.error('Delete tag error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

module.exports = { get, update, remove };

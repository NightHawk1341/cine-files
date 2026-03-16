/**
 * GET /api/categories
 */
function list({ pool }) {
  return async (req, res) => {
    const { rows } = await pool.query(
      `SELECT c.id, c.slug, c.name_ru, c.name_en, c.description,
              COUNT(a.id) FILTER (WHERE a.status = 'published')::int AS article_count
       FROM categories c
       LEFT JOIN articles a ON a.category_id = c.id
       GROUP BY c.id
       ORDER BY c.sort_order ASC`
    );

    res.set('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400');
    res.json({
      categories: rows.map(r => ({
        id: r.id,
        slug: r.slug,
        nameRu: r.name_ru,
        nameEn: r.name_en,
        description: r.description,
        articleCount: r.article_count,
      })),
    });
  };
}

function create({ pool }) {
  return async (req, res) => {
    var { slug, name_ru, name_en, description, sort_order } = req.body;

    if (!slug || !name_ru) {
      return res.status(400).json({ error: 'slug and name_ru are required' });
    }

    try {
      var { rows } = await pool.query(
        `INSERT INTO categories (slug, name_ru, name_en, description, sort_order)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [slug.trim().toLowerCase(), name_ru.trim(), name_en || null,
         description || null, Number(sort_order) || 0]
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ error: 'Category with this slug already exists' });
      }
      console.error('categories/create error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

function update({ pool }) {
  return async (req, res) => {
    var id = req.params.id;
    var { slug, name_ru, name_en, description, sort_order } = req.body;

    try {
      var { rows } = await pool.query(
        `UPDATE categories SET
         slug = COALESCE($1, slug),
         name_ru = COALESCE($2, name_ru),
         name_en = COALESCE($3, name_en),
         description = $4,
         sort_order = COALESCE($5, sort_order)
         WHERE id = $6 RETURNING *`,
        [slug ? slug.trim().toLowerCase() : null,
         name_ru ? name_ru.trim() : null,
         name_en || null, description !== undefined ? description : null,
         sort_order !== undefined ? Number(sort_order) : null, id]
      );
      if (!rows[0]) return res.status(404).json({ error: 'Not found' });
      res.json(rows[0]);
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ error: 'Category with this slug already exists' });
      }
      console.error('categories/update error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

function remove({ pool }) {
  return async (req, res) => {
    var id = req.params.id;

    try {
      // Check if category has articles
      var countResult = await pool.query(
        'SELECT COUNT(*)::int AS cnt FROM articles WHERE category_id = $1',
        [id]
      );
      if (countResult.rows[0].cnt > 0) {
        return res.status(409).json({
          error: 'Cannot delete category with ' + countResult.rows[0].cnt + ' articles',
        });
      }

      await pool.query('DELETE FROM categories WHERE id = $1', [id]);
      res.json({ ok: true });
    } catch (err) {
      console.error('categories/remove error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

module.exports = { list, create, update, remove };

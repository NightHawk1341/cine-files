/**
 * Collections API — CRUD for article collections.
 * GET /api/collections — list collections
 * POST /api/collections — create collection
 * GET /api/collections/:id — get single collection with articles
 * PUT /api/collections/:id — update collection
 * DELETE /api/collections/:id — delete collection
 * PUT /api/collections/:id/articles — update collection articles
 */

/**
 * GET /api/collections?limit=50&offset=0
 */
function list({ pool }) {
  return async (req, res) => {
    try {
      var limit = Math.min(Number(req.query.limit) || 50, 200);
      var offset = Number(req.query.offset) || 0;

      var { rows } = await pool.query(
        `SELECT c.*, COUNT(ca.article_id) AS article_count
         FROM collections c
         LEFT JOIN collection_articles ca ON ca.collection_id = c.id
         GROUP BY c.id
         ORDER BY c.sort_order ASC, c.created_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );

      var countResult = await pool.query('SELECT COUNT(*) FROM collections');
      var total = Number(countResult.rows[0].count);

      res.json({
        collections: rows.map(function (c) {
          return {
            id: Number(c.id),
            slug: c.slug,
            title: c.title,
            description: c.description,
            cover_image_url: c.cover_image_url,
            sort_order: Number(c.sort_order),
            is_visible: c.is_visible,
            article_count: Number(c.article_count),
            created_at: c.created_at,
          };
        }),
        total: total,
      });
    } catch (err) {
      console.error('List collections error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

/**
 * POST /api/collections
 * Body: { title, slug, description?, cover_image_url?, sort_order?, is_visible? }
 */
function create({ pool }) {
  return async (req, res) => {
    try {
      var { title, slug, description, cover_image_url, sort_order, is_visible } = req.body;

      if (!title || !slug) {
        return res.status(400).json({ error: 'Title and slug are required' });
      }

      var { rows } = await pool.query(
        `INSERT INTO collections (title, slug, description, cover_image_url, sort_order, is_visible)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [title, slug, description || null, cover_image_url || null,
         Number(sort_order) || 0, is_visible !== false]
      );

      res.status(201).json({ collection: rows[0] });
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ error: 'Collection with this slug already exists' });
      }
      console.error('Create collection error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

/**
 * GET /api/collections/:id
 */
function get({ pool }) {
  return async (req, res) => {
    try {
      var id = req.params.id;
      var isNumeric = /^\d+$/.test(id);

      var { rows } = await pool.query(
        isNumeric
          ? 'SELECT * FROM collections WHERE id = $1'
          : 'SELECT * FROM collections WHERE slug = $1',
        [isNumeric ? Number(id) : id]
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: 'Collection not found' });
      }

      var collection = rows[0];

      var artRes = await pool.query(
        `SELECT a.id, a.slug, a.title, a.lead, a.cover_image_url, a.status,
                a.published_at, a.view_count, cat.name_ru AS category_name_ru,
                ca.sort_order
         FROM collection_articles ca
         JOIN articles a ON a.id = ca.article_id
         LEFT JOIN categories cat ON cat.id = a.category_id
         WHERE ca.collection_id = $1
         ORDER BY ca.sort_order ASC`,
        [Number(collection.id)]
      );

      res.json({
        collection: {
          id: Number(collection.id),
          slug: collection.slug,
          title: collection.title,
          description: collection.description,
          cover_image_url: collection.cover_image_url,
          sort_order: Number(collection.sort_order),
          is_visible: collection.is_visible,
          created_at: collection.created_at,
          articles: artRes.rows,
        },
      });
    } catch (err) {
      console.error('Get collection error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

/**
 * PUT /api/collections/:id
 * Body: { title?, slug?, description?, cover_image_url?, sort_order?, is_visible? }
 */
function update({ pool }) {
  return async (req, res) => {
    try {
      var id = Number(req.params.id);
      var fields = [];
      var values = [];
      var idx = 1;

      ['title', 'slug', 'description', 'cover_image_url'].forEach(function (f) {
        if (req.body[f] !== undefined) {
          fields.push(f + ' = $' + idx++);
          values.push(req.body[f]);
        }
      });

      if (req.body.sort_order !== undefined) {
        fields.push('sort_order = $' + idx++);
        values.push(Number(req.body.sort_order));
      }

      if (req.body.is_visible !== undefined) {
        fields.push('is_visible = $' + idx++);
        values.push(Boolean(req.body.is_visible));
      }

      if (fields.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      values.push(id);
      var { rows } = await pool.query(
        'UPDATE collections SET ' + fields.join(', ') + ' WHERE id = $' + idx + ' RETURNING *',
        values
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: 'Collection not found' });
      }

      res.json({ collection: rows[0] });
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ error: 'Slug already exists' });
      }
      console.error('Update collection error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

/**
 * DELETE /api/collections/:id
 */
function remove({ pool }) {
  return async (req, res) => {
    try {
      var id = Number(req.params.id);
      var { rowCount } = await pool.query('DELETE FROM collections WHERE id = $1', [id]);

      if (rowCount === 0) {
        return res.status(404).json({ error: 'Collection not found' });
      }

      res.json({ success: true });
    } catch (err) {
      console.error('Delete collection error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

/**
 * PUT /api/collections/:id/articles
 * Body: { article_ids: number[] }
 */
function updateArticles({ pool }) {
  return async (req, res) => {
    try {
      var collectionId = Number(req.params.id);
      var articleIds = req.body.article_ids;

      if (!Array.isArray(articleIds)) {
        return res.status(400).json({ error: 'article_ids must be an array' });
      }

      // Delete existing
      await pool.query('DELETE FROM collection_articles WHERE collection_id = $1', [collectionId]);

      // Insert new
      for (var i = 0; i < articleIds.length; i++) {
        await pool.query(
          'INSERT INTO collection_articles (collection_id, article_id, sort_order) VALUES ($1, $2, $3)',
          [collectionId, Number(articleIds[i]), i]
        );
      }

      res.json({ success: true, count: articleIds.length });
    } catch (err) {
      console.error('Update collection articles error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

module.exports = { list, create, get, update, remove, updateArticles };

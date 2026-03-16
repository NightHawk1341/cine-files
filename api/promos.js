/**
 * Integrations CRUD + view/click tracking.
 * Partner content placements with neutral naming.
 */

function list({ pool }) {
  return async (req, res) => {
    try {
      var isAdmin = req.user && req.user.role === 'admin';
      var query, params;

      if (isAdmin && req.query.all === '1') {
        query = 'SELECT * FROM integrations ORDER BY priority DESC, created_at DESC LIMIT 200';
        params = [];
      } else {
        query = `SELECT * FROM integrations WHERE is_active = true
                 AND (start_date IS NULL OR start_date <= NOW())
                 AND (end_date IS NULL OR end_date >= NOW())
                 AND (max_views = 0 OR current_views < max_views)
                 ORDER BY priority DESC, created_at DESC`;
        params = [];
      }

      var { rows } = await pool.query(query, params);
      res.json({ items: rows });
    } catch (err) {
      console.error('integrations/list error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

function get({ pool }) {
  return async (req, res) => {
    try {
      var { rows } = await pool.query('SELECT * FROM integrations WHERE id = $1', [req.params.id]);
      if (!rows[0]) return res.status(404).json({ error: 'Not found' });
      res.json(rows[0]);
    } catch (err) {
      console.error('integrations/get error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

function create({ pool }) {
  return async (req, res) => {
    var { title, integration_type, placement, image_url, destination_url, alt_text,
          html_content, start_date, end_date, is_active, priority,
          max_views, target_categories } = req.body;

    if (!title) return res.status(400).json({ error: 'title is required' });

    try {
      var { rows } = await pool.query(
        `INSERT INTO integrations (title, integration_type, placement, image_url, destination_url, alt_text,
         html_content, start_date, end_date, is_active, priority, max_views, target_categories)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING *`,
        [title, integration_type || 'featured', placement || 'sidebar', image_url || null,
         destination_url || null, alt_text || null, html_content || null,
         start_date || null, end_date || null, is_active !== false,
         Number(priority) || 0, Number(max_views) || 0, target_categories || null]
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      console.error('integrations/create error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

function update({ pool }) {
  return async (req, res) => {
    var id = req.params.id;
    var { title, integration_type, placement, image_url, destination_url, alt_text,
          html_content, start_date, end_date, is_active, priority,
          max_views, target_categories } = req.body;

    try {
      var { rows } = await pool.query(
        `UPDATE integrations SET title = COALESCE($1, title), integration_type = COALESCE($2, integration_type),
         placement = COALESCE($3, placement), image_url = $4, destination_url = $5,
         alt_text = $6, html_content = $7, start_date = $8, end_date = $9,
         is_active = COALESCE($10, is_active), priority = COALESCE($11, priority),
         max_views = COALESCE($12, max_views),
         target_categories = $13, updated_at = NOW()
         WHERE id = $14 RETURNING *`,
        [title, integration_type, placement, image_url, destination_url, alt_text,
         html_content, start_date || null, end_date || null, is_active,
         priority !== undefined ? Number(priority) : null,
         max_views !== undefined ? Number(max_views) : null,
         target_categories || null, id]
      );
      if (!rows[0]) return res.status(404).json({ error: 'Not found' });
      res.json(rows[0]);
    } catch (err) {
      console.error('integrations/update error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

function remove({ pool }) {
  return async (req, res) => {
    try {
      await pool.query('DELETE FROM integrations WHERE id = $1', [req.params.id]);
      res.json({ ok: true });
    } catch (err) {
      console.error('integrations/remove error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

function view({ pool }) {
  return async (req, res) => {
    try {
      await pool.query(
        'UPDATE integrations SET current_views = current_views + 1 WHERE id = $1',
        [req.params.id]
      );
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

function click({ pool }) {
  return async (req, res) => {
    try {
      await pool.query(
        'UPDATE integrations SET click_count = click_count + 1 WHERE id = $1',
        [req.params.id]
      );
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

module.exports = { list, get, create, update, remove, view, click };

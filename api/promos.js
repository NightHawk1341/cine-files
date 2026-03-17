/**
 * Integrations CRUD + view/click tracking + ОРД reporting.
 * Partner content placements with legal compliance fields.
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
          max_views, target_categories,
          erid, advertiser_name, advertiser_url, contract_number, contract_date,
          revenue_amount, revenue_currency } = req.body;

    if (!title) return res.status(400).json({ error: 'title is required' });
    if (erid && !advertiser_name) {
      return res.status(400).json({ error: 'advertiser_name is required when erid is set' });
    }

    try {
      var { rows } = await pool.query(
        `INSERT INTO integrations (title, integration_type, placement, image_url, destination_url, alt_text,
         html_content, start_date, end_date, is_active, priority, max_views, target_categories,
         erid, advertiser_name, advertiser_url, contract_number, contract_date,
         revenue_amount, revenue_currency)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
                 $14, $15, $16, $17, $18, $19, $20)
         RETURNING *`,
        [title, integration_type || 'featured', placement || 'sidebar', image_url || null,
         destination_url || null, alt_text || null, html_content || null,
         start_date || null, end_date || null, is_active !== false,
         Number(priority) || 0, Number(max_views) || 0, target_categories || null,
         erid || null, advertiser_name || null, advertiser_url || null,
         contract_number || null, contract_date || null,
         revenue_amount ? Number(revenue_amount) : 0, revenue_currency || 'RUB']
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
          max_views, target_categories,
          erid, advertiser_name, advertiser_url, contract_number, contract_date,
          revenue_amount, revenue_currency } = req.body;

    if (erid && !advertiser_name) {
      return res.status(400).json({ error: 'advertiser_name is required when erid is set' });
    }

    try {
      var { rows } = await pool.query(
        `UPDATE integrations SET title = COALESCE($1, title), integration_type = COALESCE($2, integration_type),
         placement = COALESCE($3, placement), image_url = $4, destination_url = $5,
         alt_text = $6, html_content = $7, start_date = $8, end_date = $9,
         is_active = COALESCE($10, is_active), priority = COALESCE($11, priority),
         max_views = COALESCE($12, max_views),
         target_categories = $13,
         erid = $14, advertiser_name = $15, advertiser_url = $16,
         contract_number = $17, contract_date = $18,
         revenue_amount = COALESCE($19, revenue_amount),
         revenue_currency = COALESCE($20, revenue_currency),
         updated_at = NOW()
         WHERE id = $21 RETURNING *`,
        [title, integration_type, placement, image_url, destination_url, alt_text,
         html_content, start_date || null, end_date || null, is_active,
         priority !== undefined ? Number(priority) : null,
         max_views !== undefined ? Number(max_views) : null,
         target_categories || null,
         erid || null, advertiser_name || null, advertiser_url || null,
         contract_number || null, contract_date || null,
         revenue_amount !== undefined ? Number(revenue_amount) : null,
         revenue_currency || null,
         id]
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

function report({ pool }) {
  return async (req, res) => {
    try {
      var from = req.query.from;
      var to = req.query.to;

      if (!from || !to) {
        var now = new Date();
        var year = now.getFullYear();
        var month = now.getMonth();
        from = new Date(year, month, 1).toISOString().slice(0, 10);
        to = new Date(year, month + 1, 0).toISOString().slice(0, 10);
      }

      var { rows } = await pool.query(
        `SELECT id, title, erid, advertiser_name, placement,
                current_views, click_count,
                start_date, end_date,
                revenue_amount, revenue_currency, ord_reported_at
         FROM integrations
         WHERE erid IS NOT NULL
           AND (start_date IS NULL OR start_date <= $2::date)
           AND (end_date IS NULL OR end_date >= $1::date)
         ORDER BY start_date DESC NULLS LAST`,
        [from, to]
      );

      rows.forEach(function (row) {
        row.current_views = Number(row.current_views || 0);
        row.click_count = Number(row.click_count || 0);
        row.revenue_amount = Number(row.revenue_amount || 0);
      });

      res.json({
        period: { from: from, to: to },
        items: rows,
      });
    } catch (err) {
      console.error('integrations/report error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

function markReported({ pool }) {
  return async (req, res) => {
    try {
      var { rows } = await pool.query(
        'UPDATE integrations SET ord_reported_at = NOW() WHERE id = $1 RETURNING id, ord_reported_at',
        [req.params.id]
      );
      if (!rows[0]) return res.status(404).json({ error: 'Not found' });
      res.json(rows[0]);
    } catch (err) {
      console.error('integrations/markReported error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

module.exports = { list, get, create, update, remove, view, click, report, markReported };

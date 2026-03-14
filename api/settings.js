/**
 * Settings API — app_settings key/value store.
 * GET /api/settings — list all settings (admin only)
 * PUT /api/settings — update setting (admin only)
 */

/**
 * GET /api/settings
 */
function list({ pool }) {
  return async (req, res) => {
    try {
      var { rows } = await pool.query(
        'SELECT key, value, updated_at FROM app_settings ORDER BY key ASC'
      );

      res.json({
        settings: rows.map(function (s) {
          return {
            key: s.key,
            value: s.value,
            updated_at: s.updated_at,
          };
        }),
      });
    } catch (err) {
      console.error('List settings error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

/**
 * PUT /api/settings
 * Body: { key: string, value: any }
 */
function update({ pool }) {
  return async (req, res) => {
    try {
      var { key, value } = req.body;

      if (!key) {
        return res.status(400).json({ error: 'Key is required' });
      }

      var { rows } = await pool.query(
        `INSERT INTO app_settings (key, value, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()
         RETURNING *`,
        [key, JSON.stringify(value)]
      );

      res.json({ setting: rows[0] });
    } catch (err) {
      console.error('Update setting error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

module.exports = { list, update };

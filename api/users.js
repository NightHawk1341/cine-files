/**
 * GET /api/admin/users — list all users (admin only).
 * PUT /api/admin/users/:id/role — update user role (admin only).
 */

/**
 * GET /api/admin/users?limit=50&offset=0
 */
function list({ pool }) {
  return async (req, res) => {
    try {
      var limit = Math.min(Number(req.query.limit) || 50, 200);
      var offset = Number(req.query.offset) || 0;

      var { rows } = await pool.query(
        `SELECT id, display_name, email, avatar_url, role, login_method,
                created_at, last_login_at
         FROM users
         ORDER BY created_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );

      var countResult = await pool.query('SELECT COUNT(*) FROM users');
      var total = Number(countResult.rows[0].count);

      res.json({
        users: rows.map(function (u) {
          return {
            id: Number(u.id),
            display_name: u.display_name,
            email: u.email,
            avatar_url: u.avatar_url,
            role: u.role,
            login_method: u.login_method,
            created_at: u.created_at,
            last_login_at: u.last_login_at,
          };
        }),
        total: total,
      });
    } catch (err) {
      console.error('List users error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

/**
 * PUT /api/admin/users/:id/role
 * Body: { role: 'reader' | 'editor' | 'admin' }
 */
function updateRole({ pool }) {
  return async (req, res) => {
    try {
      var userId = Number(req.params.id);
      var { role } = req.body;

      if (!['reader', 'editor', 'admin'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role. Must be reader, editor, or admin' });
      }

      // Prevent demoting yourself
      if (userId === req.user.userId) {
        return res.status(400).json({ error: 'Cannot change your own role' });
      }

      var { rows } = await pool.query(
        'UPDATE users SET role = $1 WHERE id = $2 RETURNING id, display_name, role',
        [role, userId]
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json({ user: rows[0] });
    } catch (err) {
      console.error('Update role error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

module.exports = { list, updateRole };

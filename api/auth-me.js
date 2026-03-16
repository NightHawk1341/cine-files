const { getUserById } = require('../lib/auth');

/**
 * GET /api/auth/me — returns current authenticated user info.
 */
function me({ pool }) {
  return async (req, res) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const { rows } = await pool.query(
        `SELECT id, display_name, avatar_url, role, email, login_method, created_at
         FROM users WHERE id = $1`,
        [req.user.userId]
      );

      if (!rows[0]) {
        return res.status(401).json({ error: 'User not found' });
      }

      const user = rows[0];
      res.json({
        id: user.id,
        display_name: user.display_name,
        avatar_url: user.avatar_url,
        role: user.role,
        email: user.email,
        login_method: user.login_method,
        created_at: user.created_at,
      });
    } catch (err) {
      console.error('auth/me error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

module.exports = { me };

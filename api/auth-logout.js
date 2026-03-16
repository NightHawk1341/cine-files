const { config } = require('../lib/config');

/**
 * POST /api/auth/logout — clears auth cookies and removes refresh token.
 */
function logout({ pool }) {
  return async (req, res) => {
    try {
      const refreshToken = req.cookies?.refresh_token;
      if (refreshToken) {
        await pool.query(
          'DELETE FROM auth_tokens WHERE refresh_token = $1',
          [refreshToken]
        );
      }
    } catch (err) {
      console.error('Logout DB error:', err);
    }

    res.clearCookie('access_token', {
      httpOnly: true,
      secure: config.isProd,
      sameSite: 'lax',
      path: '/',
    });

    res.clearCookie('refresh_token', {
      httpOnly: true,
      secure: config.isProd,
      sameSite: 'lax',
      path: '/api/auth',
    });

    res.json({ ok: true });
  };
}

module.exports = { logout };

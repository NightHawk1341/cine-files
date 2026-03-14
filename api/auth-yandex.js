const { config } = require('../lib/config');
const { createSession } = require('../lib/auth');
const { checkTributeUser } = require('../lib/tribute-api');

/**
 * GET /api/auth/yandex — initiates Yandex OAuth flow
 */
function redirect() {
  return (req, res) => {
    const { clientId } = config.yandexOAuth;

    if (!clientId) {
      return res.status(500).json({ error: 'Yandex OAuth not configured' });
    }

    const redirectUri = `${config.appUrl}/api/auth/yandex/callback`;
    const url = new URL('https://oauth.yandex.ru/authorize');
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);

    res.redirect(url.toString());
  };
}

/**
 * GET /api/auth/yandex/callback — handles Yandex OAuth callback
 */
function callback({ pool }) {
  return async (req, res) => {
    const code = req.query.code;
    const error = req.query.error;

    if (error || !code) {
      return res.redirect(`${config.appUrl}?error=auth_failed`);
    }

    try {
      const redirectUri = `${config.appUrl}/api/auth/yandex/callback`;
      const { clientId, clientSecret } = config.yandexOAuth;

      // Exchange code for token
      const tokenRes = await fetch('https://oauth.yandex.ru/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
        }).toString(),
      });

      if (!tokenRes.ok) {
        return res.redirect(`${config.appUrl}?error=token_exchange`);
      }

      const tokenData = await tokenRes.json();

      // Fetch user info
      const userRes = await fetch('https://login.yandex.ru/info?format=json', {
        headers: { Authorization: `OAuth ${tokenData.access_token}` },
      });

      if (!userRes.ok) {
        return res.redirect(`${config.appUrl}?error=user_info`);
      }

      const yandexUser = await userRes.json();
      const yandexId = String(yandexUser.id);

      // Find or create user
      const { rows: existingRows } = await pool.query(
        'SELECT * FROM users WHERE yandex_id = $1', [yandexId]
      );

      let user;
      if (existingRows[0]) {
        const { rows } = await pool.query(
          `UPDATE users SET last_login_at = NOW(),
           avatar_url = COALESCE($2, avatar_url),
           display_name = COALESCE(display_name, $3)
           WHERE id = $1 RETURNING *`,
          [existingRows[0].id,
           yandexUser.default_avatar_id ? `https://avatars.yandex.net/get-yapic/${yandexUser.default_avatar_id}/islands-200` : null,
           yandexUser.display_name || yandexUser.real_name || null]
        );
        user = rows[0];
      } else {
        // Check TR-BUTE for existing user
        const tributeUserId = await checkTributeUser('yandex', yandexId);

        const { rows } = await pool.query(
          `INSERT INTO users (yandex_id, email, display_name, avatar_url, login_method, role, tribute_user_id)
           VALUES ($1, $2, $3, $4, 'yandex', 'reader', $5) RETURNING *`,
          [yandexId, yandexUser.default_email || null,
           yandexUser.display_name || yandexUser.real_name || `user_${yandexId}`,
           yandexUser.default_avatar_id ? `https://avatars.yandex.net/get-yapic/${yandexUser.default_avatar_id}/islands-200` : null,
           tributeUserId]
        );
        user = rows[0];
      }

      // Create session
      const session = await createSession(user.id, user.role);

      res.cookie('access_token', session.accessToken, {
        httpOnly: true,
        secure: config.isProd,
        sameSite: 'lax',
        path: '/',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      res.cookie('refresh_token', session.refreshToken, {
        httpOnly: true,
        secure: config.isProd,
        sameSite: 'lax',
        path: '/api/auth',
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });

      res.redirect(config.appUrl);
    } catch (err) {
      console.error('Yandex auth error:', err);
      res.redirect(`${config.appUrl}?error=auth_failed`);
    }
  };
}

module.exports = { redirect, callback };

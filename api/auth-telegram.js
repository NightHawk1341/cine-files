const crypto = require('crypto');
const { config } = require('../lib/config');
const { generatePkce, verifyTelegramIdToken, createSession } = require('../lib/auth');

/**
 * GET /api/auth/telegram — initiates Telegram OIDC flow
 */
function redirect() {
  return (req, res) => {
    const { botId } = config.telegram;

    if (!botId) {
      return res.status(500).json({ error: 'Telegram OAuth not configured' });
    }

    const redirectUri = `${config.appUrl}/api/auth/telegram/callback`;
    const { codeVerifier, codeChallenge } = generatePkce();
    const state = crypto.randomBytes(16).toString('hex');

    // Store PKCE verifier + state in a short-lived httpOnly cookie
    res.cookie('tg_pkce', JSON.stringify({ codeVerifier, state }), {
      httpOnly: true,
      secure: config.isProd,
      sameSite: 'lax',
      maxAge: 600 * 1000, // 10 minutes
      path: '/api/auth/telegram',
    });

    const url = new URL('https://oauth.telegram.org/auth');
    url.searchParams.set('client_id', botId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid profile photo');
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');

    res.redirect(url.toString());
  };
}

/**
 * GET /api/auth/telegram/callback — handles Telegram OIDC callback
 */
function callback({ pool }) {
  return async (req, res) => {
    const code = req.query.code;
    const state = req.query.state;
    const error = req.query.error;

    if (error) return res.redirect(`${config.appUrl}?error=${error}`);
    if (!code) return res.redirect(`${config.appUrl}?error=no_code`);

    const pkceCookie = req.cookies?.tg_pkce;
    if (!pkceCookie) {
      return res.redirect(`${config.appUrl}?error=auth_failed&details=missing_pkce_state`);
    }

    let pkceData;
    try {
      pkceData = JSON.parse(pkceCookie);
    } catch {
      return res.redirect(`${config.appUrl}?error=auth_failed&details=invalid_pkce_state`);
    }

    if (state !== pkceData.state) {
      return res.redirect(`${config.appUrl}?error=auth_failed&details=state_mismatch`);
    }

    try {
      const redirectUri = `${config.appUrl}/api/auth/telegram/callback`;
      const { botId, botToken } = config.telegram;

      const tokenParams = new URLSearchParams();
      tokenParams.append('grant_type', 'authorization_code');
      tokenParams.append('code', code);
      tokenParams.append('code_verifier', pkceData.codeVerifier);
      tokenParams.append('client_id', botId);
      tokenParams.append('redirect_uri', redirectUri);

      const tokenRes = await fetch('https://oauth.telegram.org/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${botId}:${botToken}`).toString('base64')}`,
        },
        body: tokenParams.toString(),
      });

      if (!tokenRes.ok) {
        console.error('Telegram token exchange failed:', await tokenRes.text());
        return res.redirect(`${config.appUrl}?error=auth_failed&details=token_exchange`);
      }

      const tokenData = await tokenRes.json();
      const idToken = tokenData.id_token;

      if (!idToken) {
        return res.redirect(`${config.appUrl}?error=auth_failed&details=no_id_token`);
      }

      const tgUser = await verifyTelegramIdToken(idToken);
      if (!tgUser) {
        return res.redirect(`${config.appUrl}?error=auth_failed&details=invalid_id_token`);
      }

      const telegramId = tgUser.sub;

      // Find or create user
      const { rows: existingRows } = await pool.query(
        'SELECT * FROM users WHERE telegram_id = $1', [telegramId]
      );

      let user;
      if (existingRows[0]) {
        const { rows } = await pool.query(
          `UPDATE users SET last_login_at = NOW(),
           avatar_url = COALESCE($2, avatar_url),
           display_name = COALESCE(display_name, $3)
           WHERE id = $1 RETURNING *`,
          [existingRows[0].id, tgUser.photo_url || null,
           [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ') || null]
        );
        user = rows[0];
      } else {
        const { rows } = await pool.query(
          `INSERT INTO users (telegram_id, display_name, avatar_url, login_method, role)
           VALUES ($1, $2, $3, 'telegram', 'reader') RETURNING *`,
          [telegramId,
           [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ') || `tg_${telegramId}`,
           tgUser.photo_url || null]
        );
        user = rows[0];
      }

      const session = await createSession(user.id, user.role);

      res.clearCookie('tg_pkce', { path: '/api/auth/telegram' });

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
      console.error('Telegram auth error:', err);
      res.redirect(`${config.appUrl}?error=auth_failed`);
    }
  };
}

module.exports = { redirect, callback };

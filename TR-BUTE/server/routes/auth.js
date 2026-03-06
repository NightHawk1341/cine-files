/**
 * Authentication Routes
 *
 * Handles user authentication via Telegram, Yandex OAuth, and VK OAuth
 * Manages login, logout, token refresh, and account deletion
 */

const express = require('express');
const axios = require('axios');
const crypto = require('crypto');

/**
 * Creates authentication router with required dependencies
 *
 * @param {Object} deps - Dependencies
 * @param {Object} deps.pool - PostgreSQL connection pool
 * @param {Object} deps.auth - Auth module (verifyToken, generateTokens, etc.)
 * @param {Object} deps.config - Application configuration
 * @param {Function} deps.authenticateToken - JWT authentication middleware
 * @returns {express.Router} Configured Express router
 */
module.exports = function createAuthRouter(deps) {
  const { pool, auth, config, authenticateToken } = deps;
  const router = express.Router();

  const YANDEX_CLIENT_ID = config.yandex.clientId;
  const YANDEX_CLIENT_SECRET = config.yandex.clientSecret;
  const YANDEX_REDIRECT_URI = `${config.appUrl}/auth/yandex/callback`;

  // ============================================================
  // TELEGRAM AUTH ROUTES (only enabled in Telegram mode)
  // ============================================================

  // Login with Telegram Login Widget (external website — not mini-app)
  router.post('/telegram-widget', async (req, res) => {
    if (!config.auth.telegram.enabled) {
      return res.status(404).json({
        error: 'Telegram authentication not available in this deployment mode',
        mode: config.deploymentMode
      });
    }

    try {
      const { id, first_name, last_name, username, photo_url, auth_date, hash } = req.body;

      if (!id || !auth_date || !hash) {
        return res.status(400).json({ error: 'Missing required widget fields' });
      }

      // Verify hash: secret = SHA256(BOT_TOKEN), then HMAC-SHA256(data_check_string, secret)
      const BOT_TOKEN = config.auth.telegram.userBotToken;
      if (!BOT_TOKEN) {
        return res.status(500).json({ error: 'Bot token not configured' });
      }

      const dataFields = { id, auth_date };
      if (first_name) dataFields.first_name = first_name;
      if (last_name) dataFields.last_name = last_name;
      if (username) dataFields.username = username;
      if (photo_url) dataFields.photo_url = photo_url;

      const dataCheckString = Object.entries(dataFields)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([key, val]) => `${key}=${val}`)
        .join('\n');

      const secretKey = crypto.createHash('sha256').update(BOT_TOKEN).digest();
      const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

      if (calculatedHash !== hash) {
        return res.status(401).json({ error: 'Invalid widget data' });
      }

      // Check auth_date is not older than 24 hours
      const ageSeconds = Math.floor(Date.now() / 1000) - Number(auth_date);
      if (ageSeconds > 86400) {
        return res.status(401).json({ error: 'Widget auth data expired' });
      }

      const telegramUserId = Number(id);

      let userResult = await pool.query(
        'SELECT * FROM users WHERE telegram_id = $1',
        [telegramUserId]
      );

      let internalUserId;

      if (userResult.rows.length === 0) {
        const insertQuery = `
          INSERT INTO users (telegram_id, username, first_name, last_name, photo_url, last_login, login_method, notification_method)
          VALUES ($1, $2, $3, $4, $5, NOW(), 'telegram', 'telegram')
          RETURNING id, telegram_id, username, first_name, last_name, photo_url, hide_photo, notifications_enabled, login_method, is_deleted
        `;

        userResult = await pool.query(insertQuery, [
          telegramUserId,
          username || `user_${telegramUserId}`,
          first_name || '',
          last_name || '',
          photo_url || null
        ]);

        internalUserId = userResult.rows[0].id;
      } else {
        internalUserId = userResult.rows[0].id;
        await pool.query(
          'UPDATE users SET last_login = NOW() WHERE id = $1',
          [internalUserId]
        );
      }

      const userData = userResult.rows[0];

      if (userData.is_deleted) {
        return res.status(403).json({ error: 'Account has been deleted' });
      }

      const { accessToken, refreshToken } = auth.generateTokens(internalUserId);

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      await pool.query(
        'INSERT INTO auth_tokens (user_id, refresh_token, expires_at) VALUES ($1, $2, $3)',
        [internalUserId, refreshToken, expiresAt]
      );

      res.json({
        success: true,
        accessToken,
        refreshToken,
        user: {
          id: internalUserId,
          telegramId: telegramUserId,
          username: userData.username,
          firstName: userData.first_name,
          lastName: userData.last_name,
          photo_url: userData.photo_url,
          hide_photo: userData.hide_photo,
          notifications_enabled: userData.notifications_enabled !== false,
          login_method: userData.login_method
        }
      });
    } catch (err) {
      console.error('Telegram widget auth error:', err);
      res.status(500).json({ error: 'Authentication failed' });
    }
  });

  // Login with Telegram (from mini-app)
  if (config.auth.telegram.enabled) {
    router.post('/telegram', async (req, res) => {
    try {
      const { initData } = req.body;

      // Verify Telegram data
      if (!auth.verifyTelegramData(initData)) {
        return res.status(401).json({ error: 'Invalid Telegram data' });
      }

      // Parse user data
      const telegramUser = auth.parseTelegramUser(initData);
      if (!telegramUser || !telegramUser.id) {
        return res.status(400).json({ error: 'Invalid user data' });
      }

      const telegramUserId = telegramUser.id;

      // Check if user exists by telegram_id
      let userResult = await pool.query(
        'SELECT * FROM users WHERE telegram_id = $1',
        [telegramUserId]
      );

      let internalUserId;

      if (userResult.rows.length === 0) {
        // New user - insert with telegram_id, let database auto-generate id
        const insertQuery = `
          INSERT INTO users (telegram_id, username, first_name, last_name, photo_url, last_login, login_method)
          VALUES ($1, $2, $3, $4, $5, NOW(), 'telegram')
          RETURNING id, telegram_id, username, first_name, last_name, photo_url, hide_photo, notifications_enabled, login_method, is_deleted
        `;

        userResult = await pool.query(insertQuery, [
          telegramUserId,
          telegramUser.username || `user_${telegramUserId}`,
          telegramUser.first_name || '',
          telegramUser.last_name || '',
          telegramUser.photo_url || null
        ]);

        internalUserId = userResult.rows[0].id;
      } else {
        // Existing user - update last_login
        internalUserId = userResult.rows[0].id;

        await pool.query(
          'UPDATE users SET last_login = NOW() WHERE id = $1',
          [internalUserId]
        );
      }

      const userData = userResult.rows[0];

      // Check if user is deleted
      if (userData.is_deleted) {
        return res.status(403).json({ error: 'Account has been deleted' });
      }

      // Generate tokens with internal user ID
      const { accessToken, refreshToken } = auth.generateTokens(internalUserId);

      // Store refresh token
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      await pool.query(
        'INSERT INTO auth_tokens (user_id, refresh_token, expires_at) VALUES ($1, $2, $3)',
        [internalUserId, refreshToken, expiresAt]
      );

      res.json({
        success: true,
        accessToken,
        refreshToken,
        user: {
          id: internalUserId,
          telegramId: telegramUserId,
          username: userData.username,
          firstName: userData.first_name,
          lastName: userData.last_name,
          photo_url: userData.photo_url,
          hide_photo: userData.hide_photo,
          notifications_enabled: userData.notifications_enabled !== false,
          login_method: userData.login_method
        }
      });
    } catch (err) {
      console.error('Auth error:', err);
      res.status(500).json({ error: 'Authentication failed' });
    }
    });
  } else {
    // Telegram auth is disabled - return 404
    router.post('/telegram', (req, res) => {
      res.status(404).json({
        error: 'Telegram authentication not available in this deployment mode',
        mode: config.deploymentMode
      });
    });
  }

  // ============================================================
  // YANDEX AUTH ROUTES (only enabled in Yandex mode)
  // ============================================================

  // Debug endpoint to check Yandex OAuth configuration
  if (config.auth.yandex.enabled) {
    router.get('/yandex/debug', (req, res) => {
    res.json({
      app_url: config.appUrl,
      redirect_uri: YANDEX_REDIRECT_URI,
      client_id_configured: !!YANDEX_CLIENT_ID,
      client_secret_configured: !!YANDEX_CLIENT_SECRET
    });
  });

  // Yandex OAuth login URL
  router.get('/yandex/login', (req, res) => {
    try {
      if (!YANDEX_CLIENT_ID) {
        return res.status(500).json({ error: 'Yandex not configured' });
      }
      const authorizeUrl = new URL('https://oauth.yandex.com/authorize');
      authorizeUrl.searchParams.append('client_id', YANDEX_CLIENT_ID);
      authorizeUrl.searchParams.append('redirect_uri', YANDEX_REDIRECT_URI);
      authorizeUrl.searchParams.append('response_type', 'code');
      authorizeUrl.searchParams.append('force_confirm', 'yes');

      console.log('Yandex OAuth login - redirect_uri:', YANDEX_REDIRECT_URI);

      res.json({ loginUrl: authorizeUrl.toString() });
    } catch (err) {
      console.error('Yandex login URL error:', err);
      res.status(500).json({ error: 'Failed to generate login URL' });
    }
    });
  } else {
    // Yandex auth is disabled - return 404
    router.get('/yandex/debug', (req, res) => {
      res.status(404).json({
        error: 'Yandex authentication not available in this deployment mode',
        mode: config.deploymentMode
      });
    });

    router.get('/yandex/login', (req, res) => {
      res.status(404).json({
        error: 'Yandex authentication not available in this deployment mode',
        mode: config.deploymentMode
      });
    });
  }

  // ============================================================
  // VK AUTH ROUTES (only enabled in Yandex mode with VK configured)
  // ============================================================

  if (config.auth.vk.enabled) {
    router.get('/vk/login', (req, res) => {
      try {
        const VK_CLIENT_ID = config.auth.vk.clientId;
        if (!VK_CLIENT_ID) {
          return res.status(500).json({ error: 'VK not configured' });
        }
        const VK_REDIRECT_URI = `${config.appUrl}/auth/vk/callback`;

        // PKCE: generate code_verifier (43-128 chars, base64url)
        const codeVerifier = crypto.randomBytes(32).toString('base64url');
        // code_challenge = base64url(sha256(code_verifier))
        const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
        const state = crypto.randomBytes(16).toString('hex');
        const deviceId = crypto.randomBytes(16).toString('hex');

        // Store PKCE params in a short-lived httpOnly cookie
        res.cookie('vk_pkce', JSON.stringify({ codeVerifier, state, deviceId }), {
          httpOnly: true,
          secure: config.isProduction,
          sameSite: 'lax',
          maxAge: 10 * 60 * 1000, // 10 minutes
          path: '/auth/vk'
        });

        // VK ID authorization URL
        const authorizeUrl = new URL('https://id.vk.com/authorize');
        authorizeUrl.searchParams.append('response_type', 'code');
        authorizeUrl.searchParams.append('client_id', VK_CLIENT_ID);
        authorizeUrl.searchParams.append('redirect_uri', VK_REDIRECT_URI);
        authorizeUrl.searchParams.append('code_challenge', codeChallenge);
        authorizeUrl.searchParams.append('code_challenge_method', 's256');
        authorizeUrl.searchParams.append('state', state);
        authorizeUrl.searchParams.append('scope', 'email');

        console.log('VK ID login - redirect_uri:', VK_REDIRECT_URI);

        res.json({ loginUrl: authorizeUrl.toString() });
      } catch (err) {
        console.error('VK login URL error:', err);
        res.status(500).json({ error: 'Failed to generate login URL' });
      }
    });
  } else {
    router.get('/vk/login', (req, res) => {
      res.status(404).json({
        error: 'VK authentication not available in this deployment mode',
        mode: config.deploymentMode
      });
    });
  }

  // ============================================================
  // SHARED ROUTES (available in all deployment modes)
  // ============================================================

  // Refresh token
  router.post('/refresh', async (req, res) => {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(400).json({ error: 'Refresh token required' });
      }

      const decoded = auth.verifyToken(refreshToken);
      if (!decoded) {
        return res.status(403).json({ error: 'Invalid refresh token' });
      }

      const userId = decoded.userId;

      // Check if refresh token exists and is valid
      const result = await pool.query(
        'SELECT * FROM auth_tokens WHERE user_id = $1 AND refresh_token = $2 AND expires_at > NOW()',
        [userId, refreshToken]
      );

      if (result.rows.length === 0) {
        return res.status(403).json({ error: 'Invalid or expired refresh token' });
      }

      // Generate new access token
      const { accessToken, refreshToken: newRefreshToken } = auth.generateTokens(userId);

      // Update refresh token
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      await pool.query(
        'UPDATE auth_tokens SET refresh_token = $1, expires_at = $2 WHERE user_id = $3',
        [newRefreshToken, expiresAt, userId]
      );

      res.json({
        success: true,
        accessToken,
        refreshToken: newRefreshToken
      });
    } catch (err) {
      console.error('Refresh error:', err);
      res.status(500).json({ error: 'Token refresh failed' });
    }
  });

  // Get current user
  router.get('/user', authenticateToken, async (req, res) => {
    try {
      const result = await pool.query(
        'SELECT id, username, screen_name, first_name, last_name, photo_url, hide_photo, notifications_enabled, login_method FROM users WHERE id = $1',
        [req.userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      const user = result.rows[0];
      res.json({
        id: user.id,
        username: user.username,
        screen_name: user.screen_name,
        firstName: user.first_name,
        lastName: user.last_name,
        photo_url: user.photo_url,
        hide_photo: user.hide_photo,
        notifications_enabled: user.notifications_enabled !== false,
        login_method: user.login_method
      });
    } catch (err) {
      console.error('Error fetching user:', err);
      res.status(500).json({ error: 'Failed to fetch user' });
    }
  });

  // Logout
  router.post('/logout', authenticateToken, async (req, res) => {
    try {
      await pool.query('DELETE FROM auth_tokens WHERE user_id = $1', [req.userId]);
      res.json({ success: true });
    } catch (err) {
      console.error('Logout error:', err);
      res.status(500).json({ error: 'Logout failed' });
    }
  });

  // Delete user account (soft delete)
  router.delete('/account', authenticateToken, async (req, res) => {
    try {
      const { userId } = req;

      // Use the soft delete function from database
      await pool.query('SELECT soft_delete_user($1)', [userId]);

      // Invalidate all tokens for this user
      await pool.query('DELETE FROM auth_tokens WHERE user_id = $1', [userId]);

      res.json({
        success: true,
        message: 'Ваш аккаунт удалён. История заказов сохранена согласно законодательству.'
      });
    } catch (err) {
      console.error('Account deletion error:', err);
      res.status(500).json({
        success: false,
        error: 'Не удалось удалить аккаунт'
      });
    }
  });

  return router;
};

/**
 * Yandex OAuth Callback Handler
 *
 * This is exported separately because it needs to be mounted at a different path
 * (/auth/yandex/callback instead of /api/auth/yandex/callback)
 *
 * @param {Object} deps - Dependencies
 * @param {Object} deps.pool - PostgreSQL connection pool
 * @param {Object} deps.auth - Auth module
 * @param {Object} deps.config - Application configuration
 * @returns {Function} Express route handler
 */
module.exports.yandexCallback = function(deps) {
  const { pool, auth, config } = deps;

  // If Yandex auth is disabled, return error handler
  if (!config.auth.yandex.enabled) {
    return async (req, res) => {
      res.status(404).send(`
        <html>
          <head><title>Authentication Not Available</title></head>
          <body>
            <h1>Authentication Not Available</h1>
            <p>Yandex authentication is not available in ${config.deploymentMode} mode.</p>
            <p><a href="${config.appUrl}">Return to home</a></p>
          </body>
        </html>
      `);
    };
  }

  const YANDEX_CLIENT_ID = config.yandex.clientId;
  const YANDEX_CLIENT_SECRET = config.yandex.clientSecret;

  return async (req, res) => {
    try {
      const { code, error } = req.query;

      if (error) {
        console.error('Yandex auth error:', error);
        return res.redirect(`${config.appUrl}?error=${error}`);
      }

      if (!code) {
        return res.redirect(`${config.appUrl}?error=no_code`);
      }

      // Use form data instead of JSON
      const params = new URLSearchParams();
      params.append('grant_type', 'authorization_code');
      params.append('code', code);
      params.append('client_id', YANDEX_CLIENT_ID);
      params.append('client_secret', YANDEX_CLIENT_SECRET);

      const tokenResponse = await axios.post('https://oauth.yandex.ru/token', params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });

      const accessToken = tokenResponse.data.access_token;

      const userResponse = await axios.get('https://login.yandex.ru/info', {
        headers: {
          'Authorization': `OAuth ${accessToken}`
        }
      });

      const yandexUser = userResponse.data;
      const yandexUserId = String(yandexUser.id); // Store as string to preserve exact value

      // Check if user exists by yandex_id
      let userResult = await pool.query(
        'SELECT * FROM users WHERE yandex_id = $1',
        [yandexUserId]
      );

      let internalUserId;

      if (userResult.rows.length === 0) {
        // New user - use login as username directly (no uniqueness check)
        // ID is what matters, duplicate usernames are allowed
        const username = yandexUser.login || `user_${yandexUserId}`;

        // Insert with yandex_id and username (may conflict with existing usernames, handled by ON CONFLICT)
        const insertQuery = `
          INSERT INTO users (yandex_id, username, email, first_name, last_name, photo_url, last_login, login_method, notification_method)
          VALUES ($1, $2, $3, $4, $5, $6, NOW(), 'yandex', 'email')
          ON CONFLICT (yandex_id) DO UPDATE SET
            last_login = NOW(),
            email = COALESCE(EXCLUDED.email, users.email),
            first_name = COALESCE(EXCLUDED.first_name, users.first_name),
            last_name = COALESCE(EXCLUDED.last_name, users.last_name),
            photo_url = COALESCE(EXCLUDED.photo_url, users.photo_url),
            notification_method = 'email'
          RETURNING id, yandex_id, username, email, first_name, last_name, photo_url, login_method, is_deleted
        `;

        userResult = await pool.query(insertQuery, [
          yandexUserId,
          username,
          yandexUser.default_email || null,
          yandexUser.first_name || '',
          yandexUser.last_name || '',
          yandexUser.default_avatar_id ? `https://avatars.yandex.net/get-yapic/${yandexUser.default_avatar_id}/islands-200` : null
        ]);

        internalUserId = userResult.rows[0].id;
      } else {
        // Existing user - update last_login
        internalUserId = userResult.rows[0].id;

        await pool.query(
          'UPDATE users SET last_login = NOW() WHERE id = $1',
          [internalUserId]
        );
      }

      const userData = userResult.rows[0];

      // Check if user is deleted
      if (userData.is_deleted) {
        return res.redirect(`${config.appUrl}?error=account_deleted`);
      }

      // Generate tokens with internal user ID
      const { accessToken: jwtAccessToken, refreshToken } = auth.generateTokens(internalUserId);

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      await pool.query(
        'INSERT INTO auth_tokens (user_id, refresh_token, expires_at) VALUES ($1, $2, $3)',
        [internalUserId, refreshToken, expiresAt]
      );

      // Redirect to profile page after successful Yandex login
      const redirectUrl = new URL(`${config.appUrl}/profile`);
      redirectUrl.searchParams.append('accessToken', jwtAccessToken);
      redirectUrl.searchParams.append('refreshToken', refreshToken);

      res.redirect(redirectUrl.toString());
    } catch (err) {
      console.error('Yandex auth error:', err.response?.data || err.message);
      res.redirect(`${config.appUrl}?error=auth_failed&details=${encodeURIComponent(err.message)}`);
    }
  };
};

/**
 * VK OAuth Callback Handler
 *
 * Mounted at /auth/vk/callback (separate path from /api/auth)
 *
 * @param {Object} deps - Dependencies
 * @param {Object} deps.pool - PostgreSQL connection pool
 * @param {Object} deps.auth - Auth module
 * @param {Object} deps.config - Application configuration
 * @returns {Function} Express route handler
 */
module.exports.vkCallback = function(deps) {
  const { pool, auth, config } = deps;

  if (!config.auth.vk.enabled) {
    return async (req, res) => {
      res.status(404).send(`
        <html>
          <head><title>Authentication Not Available</title></head>
          <body>
            <h1>Authentication Not Available</h1>
            <p>VK authentication is not available in ${config.deploymentMode} mode.</p>
            <p><a href="${config.appUrl}">Return to home</a></p>
          </body>
        </html>
      `);
    };
  }

  const VK_CLIENT_ID = config.auth.vk.clientId;
  const VK_REDIRECT_URI = `${config.appUrl}/auth/vk/callback`;

  return async (req, res) => {
    try {
      const { code, error, error_description, device_id: queryDeviceId, state: queryState } = req.query;

      if (error) {
        console.error('VK ID auth error:', error, error_description);
        return res.redirect(`${config.appUrl}?error=${error}`);
      }

      if (!code) {
        return res.redirect(`${config.appUrl}?error=no_code`);
      }

      // Read PKCE params from cookie
      const pkceCookie = req.cookies?.vk_pkce;
      if (!pkceCookie) {
        console.error('VK ID callback: missing PKCE cookie');
        return res.redirect(`${config.appUrl}?error=auth_failed&details=Missing+PKCE+state`);
      }

      let pkceData;
      try {
        pkceData = JSON.parse(pkceCookie);
      } catch {
        return res.redirect(`${config.appUrl}?error=auth_failed&details=Invalid+PKCE+state`);
      }

      const { codeVerifier, state, deviceId } = pkceData;

      // Verify state to prevent CSRF
      if (queryState && queryState !== state) {
        console.error('VK ID callback: state mismatch');
        return res.redirect(`${config.appUrl}?error=auth_failed&details=State+mismatch`);
      }

      // Clear the PKCE cookie
      res.clearCookie('vk_pkce', { path: '/auth/vk' });

      // VK ID returns device_id in the callback; use it if present, otherwise use stored one
      const callbackDeviceId = queryDeviceId || deviceId;

      // Exchange code for tokens via VK ID endpoint
      const tokenParams = new URLSearchParams();
      tokenParams.append('grant_type', 'authorization_code');
      tokenParams.append('code', code);
      tokenParams.append('code_verifier', codeVerifier);
      tokenParams.append('client_id', VK_CLIENT_ID);
      tokenParams.append('device_id', callbackDeviceId);
      tokenParams.append('redirect_uri', VK_REDIRECT_URI);
      tokenParams.append('state', state);

      const tokenResponse = await axios.post('https://id.vk.com/oauth2/auth', tokenParams, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });

      const tokenData = tokenResponse.data;

      if (tokenData.error) {
        console.error('VK ID token error:', tokenData.error, tokenData.error_description);
        return res.redirect(`${config.appUrl}?error=auth_failed&details=${encodeURIComponent(tokenData.error_description || tokenData.error)}`);
      }

      const vkAccessToken = tokenData.access_token;
      const vkUserId = String(tokenData.user_id);

      // Fetch user profile via VK ID user_info endpoint
      const userInfoParams = new URLSearchParams();
      userInfoParams.append('client_id', VK_CLIENT_ID);
      userInfoParams.append('access_token', vkAccessToken);

      const userResponse = await axios.post('https://id.vk.com/oauth2/user_info', userInfoParams, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });

      const userInfo = userResponse.data;

      if (userInfo.error) {
        console.error('VK ID user_info error:', userInfo.error);
        return res.redirect(`${config.appUrl}?error=auth_failed&details=Failed+to+fetch+VK+profile`);
      }

      const vkEmail = userInfo.user?.email || null;
      const vkFirstName = userInfo.user?.first_name || '';
      const vkLastName = userInfo.user?.last_name || '';
      const vkAvatar = userInfo.user?.avatar || null;
      const vkScreenName = userInfo.user?.screen_name || null;

      // Check if user exists by vk_id
      let userResult = await pool.query(
        'SELECT * FROM users WHERE vk_id = $1',
        [vkUserId]
      );

      let internalUserId;

      if (userResult.rows.length === 0) {
        const username = vkScreenName || `vk_${vkUserId}`;

        const insertQuery = `
          INSERT INTO users (vk_id, username, email, first_name, last_name, photo_url, last_login, login_method, notification_method)
          VALUES ($1, $2, $3, $4, $5, $6, NOW(), 'vk', 'email')
          ON CONFLICT (vk_id) DO UPDATE SET
            last_login = NOW(),
            email = COALESCE(EXCLUDED.email, users.email),
            first_name = COALESCE(EXCLUDED.first_name, users.first_name),
            last_name = COALESCE(EXCLUDED.last_name, users.last_name),
            photo_url = COALESCE(EXCLUDED.photo_url, users.photo_url),
            notification_method = 'email'
          RETURNING id, vk_id, username, email, first_name, last_name, photo_url, login_method, is_deleted
        `;

        userResult = await pool.query(insertQuery, [
          vkUserId,
          username,
          vkEmail,
          vkFirstName,
          vkLastName,
          vkAvatar
        ]);

        internalUserId = userResult.rows[0].id;
      } else {
        internalUserId = userResult.rows[0].id;

        await pool.query(
          'UPDATE users SET last_login = NOW() WHERE id = $1',
          [internalUserId]
        );
      }

      const userData = userResult.rows[0];

      if (userData.is_deleted) {
        return res.redirect(`${config.appUrl}?error=account_deleted`);
      }

      // Generate JWT tokens
      const { accessToken: jwtAccessToken, refreshToken } = auth.generateTokens(internalUserId);

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      await pool.query(
        'INSERT INTO auth_tokens (user_id, refresh_token, expires_at) VALUES ($1, $2, $3)',
        [internalUserId, refreshToken, expiresAt]
      );

      // Redirect to profile page with tokens (same pattern as Yandex)
      const redirectUrl = new URL(`${config.appUrl}/profile`);
      redirectUrl.searchParams.append('accessToken', jwtAccessToken);
      redirectUrl.searchParams.append('refreshToken', refreshToken);

      res.redirect(redirectUrl.toString());
    } catch (err) {
      console.error('VK ID auth error:', err.response?.data || err.message);
      res.redirect(`${config.appUrl}?error=auth_failed&details=${encodeURIComponent(err.message)}`);
    }
  };
};

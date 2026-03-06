/**
 * MAX Mini App Auth Handler
 *
 * POST /api/auth/max-miniapp
 * Body: { initData: string }
 *
 * Verifies the HMAC-SHA256 signature on the MAX Mini App initData.
 * The algorithm is identical to Telegram's initData validation:
 *   secret = HMAC_SHA256("WebAppData", MAX_BOT_TOKEN)
 *   hash   = hex(HMAC_SHA256(secret, sorted_key=value_pairs_joined_by_newline))
 *
 * Required env var:
 *   MAX_BOT_TOKEN — token issued by @BotFather on MAX (used for initData signing)
 */

const crypto = require('crypto');

module.exports = function createMAXMiniAppHandler(deps) {
  const { pool, auth, config } = deps;

  return async function handler(req, res) {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const botToken = config.maxBotToken;
    if (!botToken) {
      return res.status(404).json({
        error: 'MAX Mini App not configured. Set MAX_BOT_TOKEN.'
      });
    }

    try {
      const { initData } = req.body;

      if (!initData || typeof initData !== 'string') {
        return res.status(400).json({ error: 'initData required' });
      }

      const validation = verifyMAXInitData(initData, botToken);
      if (!validation.valid) {
        console.error('MAX initData validation failed:', validation.error);
        return res.status(401).json({ error: 'Invalid MAX initData signature' });
      }

      const maxUser = validation.user;
      const maxUserId = String(maxUser.id);
      const firstName  = maxUser.first_name  || '';
      const lastName   = maxUser.last_name   || '';
      const username   = maxUser.username    || `max_${maxUserId}`;
      const photoUrl   = maxUser.photo_url   || null;

      const insertQuery = `
        INSERT INTO users (max_id, username, first_name, last_name, photo_url, last_login, login_method, notification_method)
        VALUES ($1, $2, $3, $4, $5, NOW(), 'max', 'max')
        ON CONFLICT (max_id) DO UPDATE SET
          last_login = NOW(),
          first_name = COALESCE(EXCLUDED.first_name, users.first_name),
          last_name  = COALESCE(EXCLUDED.last_name,  users.last_name),
          photo_url  = COALESCE(EXCLUDED.photo_url,  users.photo_url),
          notification_method = 'max'
        RETURNING id, max_id, username, first_name, last_name, photo_url, notifications_enabled, login_method, is_deleted
      `;

      const userResult = await pool.query(insertQuery, [
        maxUserId, username, firstName, lastName, photoUrl
      ]);

      const userData = userResult.rows[0];

      if (userData.is_deleted) {
        return res.status(403).json({ error: 'Account has been deleted' });
      }

      const internalUserId = userData.id;
      const { accessToken, refreshToken } = auth.generateTokens(internalUserId);

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      await pool.query(
        'INSERT INTO auth_tokens (user_id, refresh_token, expires_at) VALUES ($1, $2, $3)',
        [internalUserId, refreshToken, expiresAt]
      );

      return res.json({
        success: true,
        accessToken,
        refreshToken,
        user: {
          id: internalUserId,
          maxId: maxUserId,
          username: userData.username,
          firstName: userData.first_name,
          lastName: userData.last_name,
          photo_url: userData.photo_url,
          notifications_enabled: userData.notifications_enabled !== false,
          login_method: userData.login_method
        }
      });
    } catch (err) {
      console.error('MAX Mini App auth error:', err.message);
      return res.status(500).json({ error: 'Authentication failed' });
    }
  };
};

/**
 * Verify MAX Mini App initData signature.
 * Uses the same HMAC-SHA256 algorithm as Telegram's WebApp.initData.
 * Returns { valid, user } on success or { valid: false, error } on failure.
 */
function verifyMAXInitData(initData, botToken) {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');

    if (!hash) {
      return { valid: false, error: 'No hash in initData' };
    }

    params.delete('hash');

    const dataCheckArr = [];
    for (const [key, value] of params.entries()) {
      dataCheckArr.push(`${key}=${value}`);
    }
    dataCheckArr.sort();
    const dataCheckString = dataCheckArr.join('\n');

    // Same algorithm as Telegram: secret = HMAC_SHA256("WebAppData", botToken)
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();

    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    if (calculatedHash !== hash) {
      return { valid: false, error: 'Hash mismatch' };
    }

    const userStr = params.get('user');
    if (!userStr) {
      return { valid: false, error: 'No user field in initData' };
    }

    const user = JSON.parse(userStr);
    if (!user.id) {
      return { valid: false, error: 'No user.id in initData' };
    }

    // Check freshness (24-hour window)
    const authDate = parseInt(params.get('auth_date') || '0', 10);
    const currentTime = Math.floor(Date.now() / 1000);
    if (currentTime - authDate > 24 * 60 * 60) {
      return { valid: false, error: 'initData expired' };
    }

    return { valid: true, user };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

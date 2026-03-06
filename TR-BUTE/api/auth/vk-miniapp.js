/**
 * VK Mini App Auth Handler
 *
 * POST /api/auth/vk-miniapp
 * Body: { launchParams: string, userInfo?: object }
 *
 * Verifies the HMAC-SHA256 signature on the VK Mini App launch params.
 * No VK API call needed — verification is fully local.
 *
 * Required env var:
 *   VK_APP_SECRET — "Protected key" from vk.com/editapp → Settings.
 *                   If the same VK app handles OAuth and Mini App, this
 *                   equals VK_CLIENT_SECRET. If they are separate VK apps,
 *                   this is the Mini App app's own protected key.
 *
 * Fallback: if VK_APP_SECRET is not set, VK_CLIENT_SECRET is tried.
 * Only works when both the OAuth and Mini App belong to the same VK app.
 */

const crypto = require('crypto');
const axios = require('axios');

const VK_API = 'https://api.vk.com/method';
const VK_API_VERSION = '5.199';

function getAppSecret(config) {
  return config.vkAppSecret || config.auth.vk.clientSecret || null;
}

module.exports = function createVKMiniAppHandler(deps) {
  const { pool, auth, config } = deps;

  return async function handler(req, res) {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const appSecret = getAppSecret(config);
    if (!appSecret) {
      return res.status(404).json({
        error: 'VK Mini App not configured. Set VK_APP_SECRET (protected key from vk.com/editapp)'
      });
    }

    try {
      const { launchParams, userInfo: clientUserInfo } = req.body;

      if (!launchParams || typeof launchParams !== 'string') {
        return res.status(400).json({ error: 'launchParams required' });
      }

      const params = new URLSearchParams(launchParams);
      const vkUserId = params.get('vk_user_id');
      const vkSign   = params.get('vk_sign');

      const receivedKeys = [...params.keys()].join(', ');
      if (!vkUserId) return res.status(400).json({ error: `Missing vk_user_id. Received keys: ${receivedKeys}` });
      if (!vkSign)   return res.status(400).json({ error: `Missing vk_sign. Received keys: ${receivedKeys}` });

      const { ok, checkString, expectedSign } = verifyVKSign(params, appSecret);
      if (!ok) {
        console.error(
          `VK sign mismatch. check_string="${checkString}" expected="${expectedSign}" got="${vkSign}" ` +
          `secret_source=${config.vkAppSecret ? 'VK_APP_SECRET' : 'VK_CLIENT_SECRET(fallback)'}`
        );
        return res.status(401).json({ error: 'Invalid VK signature' });
      }

      // Fetch real user info when service token is set; otherwise use VKWebAppGetUserInfo data
      const vkUserInfo = await fetchVKUserInfo(vkUserId, config.vkAppServiceToken);

      const vkFirstName  = vkUserInfo?.first_name  || clientUserInfo?.firstName  || '';
      const vkLastName   = vkUserInfo?.last_name   || clientUserInfo?.lastName   || '';
      const vkPhoto      = vkUserInfo?.photo_200   || vkUserInfo?.photo_100      || clientUserInfo?.photoUrl || null;
      const vkScreenName = vkUserInfo?.screen_name || clientUserInfo?.screenName || null;
      const username = `vk_${vkUserId}`;

      const insertQuery = `
        INSERT INTO users (vk_id, username, screen_name, first_name, last_name, photo_url, last_login, login_method, notification_method)
        VALUES ($1, $2, $3, $4, $5, $6, NOW(), 'vk', 'vk')
        ON CONFLICT (vk_id) DO UPDATE SET
          last_login = NOW(),
          screen_name = COALESCE(EXCLUDED.screen_name, users.screen_name),
          first_name = COALESCE(EXCLUDED.first_name, users.first_name),
          last_name = COALESCE(EXCLUDED.last_name, users.last_name),
          photo_url = COALESCE(EXCLUDED.photo_url, users.photo_url),
          notification_method = 'vk'
        RETURNING id, vk_id, username, screen_name, first_name, last_name, photo_url, notifications_enabled, login_method, is_deleted
      `;

      const userResult = await pool.query(insertQuery, [
        vkUserId, username, vkScreenName, vkFirstName, vkLastName, vkPhoto
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
          vkId: vkUserId,
          username: userData.username,
          screen_name: userData.screen_name,
          firstName: userData.first_name,
          lastName: userData.last_name,
          photo_url: userData.photo_url,
          notifications_enabled: userData.notifications_enabled !== false,
          login_method: userData.login_method
        }
      });
    } catch (err) {
      console.error('VK Mini App auth error:', err.message);
      return res.status(500).json({ error: 'Authentication failed' });
    }
  };
};

/**
 * Verify VK Mini App launch params signature.
 * Returns { ok, checkString, expectedSign } for diagnostics on failure.
 */
function verifyVKSign(params, appSecret) {
  const filtered = [];
  for (const [key, value] of params.entries()) {
    if (key.startsWith('vk_') && key !== 'vk_sign') {
      filtered.push([key, value]);
    }
  }
  filtered.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const checkString = filtered.map(([k, v]) => `${k}=${v}`).join('&');

  const expectedSign = crypto
    .createHmac('sha256', appSecret)
    .update(checkString)
    .digest('base64url');

  // VK may send standard base64 (+/) or base64url (-_), with or without padding
  const normalize = (s) => s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  const ok = normalize(expectedSign) === normalize(params.get('vk_sign') || '');
  return { ok, checkString, expectedSign };
}

/**
 * Fetch VK user profile using the app service token.
 * Returns null if no service token is configured.
 */
async function fetchVKUserInfo(userId, serviceToken) {
  if (!serviceToken) return null;
  try {
    const response = await axios.get(`${VK_API}/users.get`, {
      params: {
        user_ids: userId,
        fields: 'photo_200,photo_100,screen_name',
        access_token: serviceToken,
        v: VK_API_VERSION
      }
    });
    return response.data?.response?.[0] || null;
  } catch (err) {
    console.error('VK users.get error:', err.message);
    return null;
  }
}

/**
 * Preview endpoint: verify launch params and return user display info.
 */
module.exports.previewUser = async function previewUser(req, res, config) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const appSecret = getAppSecret(config);
  if (!appSecret) {
    return res.status(404).json({ error: 'VK Mini App not configured' });
  }

  try {
    const { launchParams } = req.body;
    if (!launchParams) return res.status(400).json({ error: 'launchParams required' });

    const params = new URLSearchParams(launchParams);
    const vkUserId = params.get('vk_user_id');
    if (!vkUserId) return res.status(400).json({ error: 'Missing vk_user_id' });

    const { ok } = verifyVKSign(params, appSecret);
    if (!ok) return res.status(401).json({ error: 'Invalid VK signature' });

    const userInfo = await fetchVKUserInfo(vkUserId, config.vkAppServiceToken);
    if (!userInfo) return res.status(500).json({ error: 'Failed to fetch user' });

    return res.json({
      success: true,
      firstName: userInfo.first_name || '',
      lastName: userInfo.last_name || '',
      photoUrl: userInfo.photo_200 || userInfo.photo_100 || null
    });
  } catch (err) {
    console.error('VK preview error:', err.message);
    return res.status(500).json({ error: 'Preview failed' });
  }
};

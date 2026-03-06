/**
 * Admin Authentication Middleware
 *
 * Middleware for admin authentication supporting both:
 * 1. Cookie-based JWT (for browser access)
 * 2. Telegram initData (for Telegram Mini App access)
 *
 * Returns JSON errors for API routes, redirects for page routes
 */

const crypto = require('crypto');
const auth = require('../../auth');
const config = require('../../lib/config');
const { getPool } = require('../../lib/db');

/**
 * Check if request is an API request
 */
function isApiRequest(req) {
  return req.path.startsWith('/api/') ||
         req.headers.accept?.includes('application/json') ||
         req.xhr;
}

/**
 * Validate Telegram WebApp initData signature
 * According to: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
function validateTelegramWebAppData(initData, botToken) {
  try {
    // Parse initData (it comes as a query string)
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');

    if (!hash) {
      return { valid: false, error: 'No hash provided' };
    }

    // Remove hash from params and sort the remaining
    urlParams.delete('hash');

    // Create data-check-string
    const dataCheckArr = [];
    for (const [key, value] of urlParams.entries()) {
      dataCheckArr.push(`${key}=${value}`);
    }
    dataCheckArr.sort();
    const dataCheckString = dataCheckArr.join('\n');

    // Create secret key from bot token
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();

    // Calculate hash
    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    // Compare hashes
    if (calculatedHash !== hash) {
      return { valid: false, error: 'Hash validation failed' };
    }

    // Parse user data
    const userDataStr = urlParams.get('user');
    if (!userDataStr) {
      return { valid: false, error: 'No user data provided' };
    }

    const userData = JSON.parse(userDataStr);

    // Check auth_date (data shouldn't be older than 24 hours for security)
    const authDate = parseInt(urlParams.get('auth_date'));
    const currentTime = Math.floor(Date.now() / 1000);
    const maxAge = 24 * 60 * 60; // 24 hours in seconds

    if (currentTime - authDate > maxAge) {
      return { valid: false, error: 'Data is too old' };
    }

    return {
      valid: true,
      userId: userData.id,
      user: userData
    };
  } catch (error) {
    console.error('Error validating Telegram data:', error);
    return { valid: false, error: error.message };
  }
}

/**
 * Check if user is admin by telegram_id or username
 * @param {number} telegramId - User's Telegram ID
 * @param {string} username - User's Telegram username (without @)
 */
async function isAdmin(telegramId, username) {
  try {
    const pool = getPool();

    // First, try to find admin by telegram_id
    let result = await pool.query(
      'SELECT id, name, permissions, telegram_id FROM admins WHERE telegram_id = $1',
      [telegramId]
    );

    if (result.rows.length > 0) {
      return {
        isAdmin: true,
        admin: result.rows[0]
      };
    }

    // If not found by ID and username is provided, try to find by username
    if (username) {
      // Check if any admin has this username stored in their name field
      // (common pattern: name field stores "@username" or just "username")
      result = await pool.query(
        `SELECT id, name, permissions, telegram_id FROM admins
         WHERE LOWER(name) = LOWER($1)
            OR LOWER(name) = LOWER($2)`,
        [username, `@${username}`]
      );

      if (result.rows.length > 0) {
        const admin = result.rows[0];

        // Auto-update the telegram_id in the database for future lookups
        if (!admin.telegram_id || admin.telegram_id !== telegramId) {
          try {
            await pool.query(
              'UPDATE admins SET telegram_id = $1 WHERE id = $2',
              [telegramId, admin.id]
            );
            console.log(`Updated telegram_id for admin ${admin.name} (ID: ${admin.id}) to ${telegramId}`);
          } catch (updateError) {
            console.error('Error updating admin telegram_id:', updateError);
          }
        }

        return {
          isAdmin: true,
          admin: admin
        };
      }
    }

    return { isAdmin: false };
  } catch (error) {
    console.error('Error checking admin status:', error);
    return { isAdmin: false, error: error.message };
  }
}

/**
 * Middleware to require admin authentication
 *
 * Supports BOTH:
 * 1. Cookie-based JWT (admin_token cookie) for browser access
 * 2. Telegram initData header (x-telegram-init-data) for Telegram Mini App access
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const requireAdminAuth = async (req, res, next) => {
  // Method 1: Check for Telegram initData in header (for Telegram Mini App)
  const telegramInitData = req.headers['x-telegram-init-data'];

  if (telegramInitData) {
    try {
      const botToken = config.telegram?.adminBotToken;
      if (!botToken) {
        console.error('ADMIN_BOT_TOKEN not configured for Telegram auth');
        return res.status(500).json({ error: 'Server configuration error' });
      }

      const validation = validateTelegramWebAppData(telegramInitData, botToken);

      if (!validation.valid) {
        return res.status(403).json({
          error: 'Invalid Telegram data',
          message: validation.error
        });
      }

      // Check if user is admin
      const username = validation.user?.username;
      const adminCheck = await isAdmin(validation.userId, username);

      if (!adminCheck.isAdmin) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'You are not authorized to access admin functions'
        });
      }

      // Set admin user info on request
      req.adminUser = {
        id: adminCheck.admin.id,
        name: adminCheck.admin.name,
        telegram_id: validation.userId,
        permissions: adminCheck.admin.permissions,
        isAdmin: true,
        authMethod: 'telegram'
      };

      return next();
    } catch (error) {
      console.error('Telegram auth error:', error);
      return res.status(401).json({
        error: 'Authentication failed',
        message: 'Telegram authentication error'
      });
    }
  }

  // Method 2: Check for admin JWT in cookie (for browser access)
  const adminToken = req.headers.cookie
    ?.split('; ')
    .find(row => row.startsWith('admin_token='))
    ?.split('=')[1];

  if (!adminToken) {
    if (isApiRequest(req)) {
      return res.status(401).json({ error: 'Authentication required', message: 'Admin login required' });
    }
    return res.redirect('/admin/login');
  }

  try {
    const decoded = auth.verifyToken(adminToken);
    if (!decoded || !decoded.isAdmin) {
      res.clearCookie('admin_token');
      if (isApiRequest(req)) {
        return res.status(403).json({ error: 'Access denied', message: 'Admin privileges required' });
      }
      return res.redirect('/admin/login');
    }

    req.adminUser = {
      ...decoded,
      authMethod: 'cookie'
    };
    next();
  } catch (error) {
    res.clearCookie('admin_token');
    if (isApiRequest(req)) {
      return res.status(401).json({ error: 'Invalid token', message: 'Please log in again' });
    }
    return res.redirect('/admin/login');
  }
};

module.exports = requireAdminAuth;

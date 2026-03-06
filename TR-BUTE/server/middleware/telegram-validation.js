/**
 * Telegram WebApp Validation Utilities
 *
 * Functions for validating Telegram WebApp data and checking admin status
 */

const crypto = require('crypto');

/**
 * Validates Telegram WebApp initData using HMAC-SHA256
 *
 * Verifies the hash signature and checks data freshness (24 hour window)
 *
 * @param {string} initData - The initData string from Telegram WebApp
 * @param {string} botToken - The Telegram bot token
 * @returns {Object} Validation result with { valid, userId, user } or { valid: false, error }
 */
function validateTelegramWebAppData(initData, botToken) {
  try {
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');

    if (!hash) {
      return { valid: false, error: 'No hash provided' };
    }

    urlParams.delete('hash');

    const dataCheckArr = [];
    for (const [key, value] of urlParams.entries()) {
      dataCheckArr.push(`${key}=${value}`);
    }
    dataCheckArr.sort();
    const dataCheckString = dataCheckArr.join('\n');

    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();

    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    if (calculatedHash !== hash) {
      return { valid: false, error: 'Hash validation failed' };
    }

    const userDataStr = urlParams.get('user');
    if (!userDataStr) {
      return { valid: false, error: 'No user data provided' };
    }

    const userData = JSON.parse(userDataStr);

    const authDate = parseInt(urlParams.get('auth_date'));
    const currentTime = Math.floor(Date.now() / 1000);
    const maxAge = 24 * 60 * 60;

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
 * Checks if a Telegram user ID corresponds to an admin
 *
 * @param {number} telegramId - The Telegram user ID
 * @param {Object} pool - PostgreSQL connection pool
 * @returns {Promise<Object>} Result with { isAdmin, admin } or { isAdmin: false }
 */
async function isAdminUser(telegramId, pool) {
  try {
    const result = await pool.query(
      'SELECT id, name, permissions FROM admins WHERE telegram_id = $1',
      [telegramId]
    );

    if (result.rows.length === 0) {
      return { isAdmin: false };
    }

    return {
      isAdmin: true,
      admin: result.rows[0]
    };
  } catch (error) {
    console.error('Error checking admin status:', error);
    return { isAdmin: false, error: error.message };
  }
}

module.exports = {
  validateTelegramWebAppData,
  isAdminUser
};

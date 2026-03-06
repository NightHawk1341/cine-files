/**
 * Lightweight admin request detector for rate-limit skip functions.
 *
 * Verifies credentials cryptographically (JWT or Telegram HMAC) without
 * a DB lookup, so it is safe to call on every request. The full DB-backed
 * requireAdminAuth middleware still runs afterwards for protected routes.
 */

const crypto = require('crypto');
const auth = require('../../auth');
const config = require('../../lib/config');

function parseAdminCookie(req) {
  return req.headers.cookie
    ?.split('; ')
    .find(row => row.startsWith('admin_token='))
    ?.split('=')[1];
}

function isAdminRequest(req) {
  // Browser admin: verify JWT cookie
  const token = parseAdminCookie(req);
  if (token) {
    try {
      const decoded = auth.verifyToken(token);
      if (decoded?.isAdmin) return true;
    } catch (_) {}
  }

  // Telegram Mini App admin: verify HMAC signature
  const initData = req.headers['x-telegram-init-data'];
  if (initData) {
    try {
      const botToken = config.telegram?.adminBotToken;
      if (!botToken) return false;

      const urlParams = new URLSearchParams(initData);
      const hash = urlParams.get('hash');
      if (!hash) return false;

      urlParams.delete('hash');
      const dataCheckArr = [];
      for (const [key, value] of urlParams.entries()) {
        dataCheckArr.push(`${key}=${value}`);
      }
      dataCheckArr.sort();

      const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
      const calculated = crypto.createHmac('sha256', secretKey).update(dataCheckArr.join('\n')).digest('hex');
      return calculated === hash;
    } catch (_) {}
  }

  return false;
}

module.exports = { isAdminRequest };

/**
 * Hotlink Protection Middleware
 *
 * Prevents external sites from embedding images and assets directly
 * from our server (bandwidth theft and content impersonation).
 *
 * Whitelisted origins: Telegram, VK, Max mini app platforms,
 * search engines, and the app's own domain.
 */

const config = require('../../lib/config');

// Domains allowed to hotlink our assets
const ALLOWED_REFERRER_HOSTS = [
  // Own domain (extracted at runtime from APP_URL)
  // Telegram
  'web.telegram.org',
  't.me',
  'telegram.org',
  // VK
  'vk.com',
  'm.vk.com',
  'vk.ru',
  // Max (Mail.ru)
  'max.ru',
  'web.max.ru',
  // Search engines (image preview in results)
  'google.com',
  'google.ru',
  'yandex.ru',
  'yandex.com',
  'bing.com',
  // Payment providers (receipt pages may show product images)
  'tbank.ru',
  'tinkoff.ru',
];

// File extensions to protect
const PROTECTED_EXTENSIONS = /\.(jpg|jpeg|png|gif|webp|svg|avif|ico|mp4|webm)$/i;

/**
 * Extract hostname from a URL string.
 * Returns null if parsing fails.
 */
function getHost(urlStr) {
  try {
    return new URL(urlStr).hostname;
  } catch {
    return null;
  }
}

/**
 * Check if a referrer host is in the allowed list.
 * Matches exact or subdomain (e.g. "web.telegram.org" matches "telegram.org").
 */
function isAllowedReferrer(referrerHost, ownHost) {
  if (!referrerHost) return false;

  const lower = referrerHost.toLowerCase();

  // Own domain
  if (ownHost && (lower === ownHost || lower.endsWith('.' + ownHost))) {
    return true;
  }

  for (const allowed of ALLOWED_REFERRER_HOSTS) {
    if (lower === allowed || lower.endsWith('.' + allowed)) {
      return true;
    }
  }

  return false;
}

function hotlinkGuard(req, res, next) {
  // Only protect static asset requests
  if (!PROTECTED_EXTENSIONS.test(req.path)) {
    return next();
  }

  const referer = req.headers['referer'] || req.headers['referrer'];

  // Allow direct access (no referrer) — bookmarks, address bar, mobile apps
  if (!referer) {
    return next();
  }

  const referrerHost = getHost(referer);
  const ownHost = getHost(config.appUrl);

  if (isAllowedReferrer(referrerHost, ownHost)) {
    return next();
  }

  // Block: return 403 for hotlinked assets
  console.warn(`[Hotlink Guard] Blocked: ${referrerHost} → ${req.path}`);
  return res.status(403).send('Hotlinking not allowed');
}

module.exports = { hotlinkGuard };

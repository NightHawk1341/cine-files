/**
 * Hotlink protection middleware (SEC-16).
 * Prevents external sites from directly embedding our images/media.
 * Allows requests with no referer (direct access, bookmarks) and
 * requests from allowed origins.
 */

var ALLOWED_HOSTS = [
  'cinefiles-txt.com',
  'cdn.cinefiles-txt.com',
  'buy-tribute.com',
  'cdn.buy-tribute.com',
  'localhost',
];

// File extensions to protect
var PROTECTED_EXTENSIONS = /\.(jpe?g|png|gif|webp|avif|svg|mp4|webm)$/i;

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function hotlinkGuard(req, res, next) {
  // Only protect media file requests
  if (!PROTECTED_EXTENSIONS.test(req.path)) {
    return next();
  }

  var referer = req.headers.referer || req.headers.referrer;

  // No referer — allow (direct access, bookmarks, privacy extensions)
  if (!referer) {
    return next();
  }

  try {
    var refHost = new URL(referer).hostname;
    for (var i = 0; i < ALLOWED_HOSTS.length; i++) {
      if (refHost === ALLOWED_HOSTS[i] || refHost.endsWith('.' + ALLOWED_HOSTS[i])) {
        return next();
      }
    }
  } catch {
    // Invalid referer URL — allow
    return next();
  }

  res.status(403).end();
}

module.exports = hotlinkGuard;

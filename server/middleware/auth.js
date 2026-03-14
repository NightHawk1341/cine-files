const { verifyAccessToken } = require('../../lib/auth');

/**
 * Express middleware: parse JWT from cookie, attach user to req.
 * Does NOT reject — just sets req.user to null if no valid token.
 */
function authenticateToken(req, res, next) {
  const token = req.cookies?.access_token;
  if (!token) {
    req.user = null;
    return next();
  }

  const payload = verifyAccessToken(token);
  req.user = payload; // { userId, role } or null
  next();
}

/**
 * Require any authenticated user.
 */
function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

/**
 * Require editor or admin role.
 */
function requireEditor(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (req.user.role !== 'editor' && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

/**
 * Require admin role.
 */
function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

/**
 * Require valid CRON_SECRET bearer token.
 */
function requireCronAuth(req, res, next) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return res.status(500).json({ error: 'CRON_SECRET not configured' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Invalid cron authorization' });
  }
  next();
}

module.exports = {
  authenticateToken,
  requireAuth,
  requireEditor,
  requireAdmin,
  requireCronAuth,
};

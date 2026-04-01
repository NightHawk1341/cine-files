/**
 * Admin Browser Verification Endpoint
 * GET /api/admin/browser-verify
 *
 * Verifies JWT cookie and returns admin data for browser-based auth.
 * Checks both admin_token (browser login) and access_token (OAuth) cookies.
 */

const jwt = require('jsonwebtoken');
const { config } = require('../../lib/config');
const { verifyAccessToken } = require('../../lib/auth');
const { success, error } = require('../../lib/response');

/**
 * Factory function
 */
function verify(deps) {
  return async function handler(req, res) {
    try {
      // 1. Check for admin_token cookie (browser login)
      const adminToken = req.cookies && req.cookies.admin_token;

      if (adminToken) {
        try {
          const decoded = jwt.verify(adminToken, config.auth.jwtSecret);
          if (decoded && decoded.isAdmin) {
            return success(res, {
              admin: {
                id: 'browser-admin',
                name: decoded.username || 'Admin',
                authMethod: 'browser',
                role: 'admin'
              }
            });
          }
        } catch (err) {
          // Invalid admin_token, fall through to access_token check
          res.clearCookie('admin_token');
        }
      }

      // 2. Check for access_token cookie (OAuth users)
      const accessToken = req.cookies && req.cookies.access_token;

      if (accessToken) {
        const decoded = verifyAccessToken(accessToken);
        if (decoded && decoded.role === 'admin') {
          return success(res, {
            admin: {
              id: decoded.userId,
              name: 'OAuth Admin',
              authMethod: 'oauth',
              role: 'admin'
            }
          });
        }
      }

      // No valid token found
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    } catch (err) {
      console.error('Browser verification error:', err);
      return error(res, 'Verification failed', 500);
    }
  };
}

module.exports = { verify };

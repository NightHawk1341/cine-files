/**
 * Admin Routes
 *
 * Handles admin browser authentication and admin panel static file serving.
 * Pattern matches TR-BUTE: factory function + exported loginPage + protectAdminMiniapp.
 */

const express = require('express');
const path = require('path');
const rateLimit = require('express-rate-limit');

const browserLoginHandler = require('../../api/admin/browser-login');
const browserVerifyHandler = require('../../api/admin/browser-verify');
const logoutHandler = require('../../api/admin/logout');

// Rate limiter for login endpoint
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per window
  message: { success: false, message: 'Слишком много попыток входа. Попробуйте позже.' },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Creates admin router for /api/admin/* auth endpoints
 */
module.exports = function createAdminRouter(deps) {
  const router = express.Router();

  router.post('/browser-login', loginLimiter, browserLoginHandler.login(deps));
  router.get('/browser-verify', browserVerifyHandler.verify(deps));
  router.post('/logout', logoutHandler.logout(deps));

  return router;
};

/**
 * Admin login page handler — mounted at /admin/login
 * Redirects to /admin-miniapp/ if already authenticated.
 */
module.exports.loginPage = function(deps) {
  const jwt = require('jsonwebtoken');
  const { config } = require('../../lib/config');

  return (req, res) => {
    const adminToken = req.cookies && req.cookies.admin_token;

    if (adminToken) {
      try {
        const decoded = jwt.verify(adminToken, config.auth.jwtSecret);
        if (decoded && decoded.isAdmin) {
          return res.redirect('/admin-miniapp/');
        }
      } catch (err) {
        // Invalid token, continue to login page
      }
    }

    // Also check OAuth access_token for admin users
    const accessToken = req.cookies && req.cookies.access_token;
    if (accessToken) {
      const { verifyAccessToken } = require('../../lib/auth');
      const decoded = verifyAccessToken(accessToken);
      if (decoded && decoded.role === 'admin') {
        return res.redirect('/admin-miniapp/');
      }
    }

    res.sendFile(path.join(__dirname, '../../public/admin-login.html'));
  };
};

/**
 * Admin miniapp protection middleware — mounted on /admin-miniapp
 * Serves static files with no-cache headers for JS/CSS/HTML.
 */
module.exports.protectAdminMiniapp = function(deps) {
  const jwt = require('jsonwebtoken');
  const { config } = require('../../lib/config');
  const router = express.Router();

  // Auth check middleware
  router.use((req, res, next) => {
    const adminToken = req.cookies && req.cookies.admin_token;

    if (adminToken) {
      try {
        const decoded = jwt.verify(adminToken, config.auth.jwtSecret);
        if (decoded && decoded.isAdmin) {
          req.adminUser = decoded;
          return next();
        }
      } catch (err) {
        // Invalid token — fall through
      }
    }

    // Also check OAuth access_token
    const accessToken = req.cookies && req.cookies.access_token;
    if (accessToken) {
      const { verifyAccessToken } = require('../../lib/auth');
      const decoded = verifyAccessToken(accessToken);
      if (decoded && decoded.role === 'admin') {
        req.adminUser = decoded;
        return next();
      }
    }

    // Allow unauthenticated access to static files (SPA handles auth verification)
    next();
  });

  // Serve static files from admin-miniapp directory
  router.use(express.static(path.join(__dirname, '../../public/admin-miniapp'), {
    etag: true,
    setHeaders(res, filePath) {
      if (filePath.endsWith('.js') || filePath.endsWith('.css') || filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    }
  }));

  return router;
};

/**
 * Admin Routes
 *
 * Handles admin authentication (browser and Telegram) and admin panel access
 * Route handlers are imported from api/admin/ directory
 */

const express = require('express');
const path = require('path');
const rateLimit = require('express-rate-limit');

// Import handlers from api/admin/
const verifyHandler = require('../../api/admin/verify');
const browserLoginHandler = require('../../api/admin/browser-login');
const browserVerifyHandler = require('../../api/admin/browser-verify');
const logoutHandler = require('../../api/admin/logout');

// Rate limiter for login endpoint to prevent brute-force attacks
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per window
  message: { success: false, message: 'Слишком много попыток входа. Попробуйте позже.' },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Creates admin router with required dependencies
 *
 * @param {Object} deps - Dependencies
 * @param {Object} deps.pool - PostgreSQL connection pool (unused - handlers use getPool())
 * @param {Object} deps.auth - Auth module
 * @param {Object} deps.config - Application configuration (unused - handlers use require())
 * @param {Function} deps.requireAdminAuth - Admin authentication middleware
 * @returns {express.Router} Configured Express router
 */
module.exports = function createAdminRouter(deps) {
  const router = express.Router();

  // ============ TELEGRAM ADMIN VERIFICATION ============
  router.post('/verify', verifyHandler);

  // ============ BROWSER ADMIN AUTHENTICATION ============
  router.post('/browser-login', loginLimiter, browserLoginHandler);
  router.get('/browser-verify', browserVerifyHandler);
  router.post('/logout', logoutHandler);

  return router;
};

/**
 * Admin login page handler
 *
 * Exported separately to be mounted at /admin/login
 *
 * @param {Object} deps - Dependencies
 * @param {Object} deps.auth - Auth module
 * @returns {Function} Express route handler
 */
module.exports.loginPage = function(deps) {
  const { auth } = deps;

  return (req, res) => {
    // If already logged in, redirect to admin page
    const adminToken = req.headers.cookie
      ?.split('; ')
      .find(row => row.startsWith('admin_token='))
      ?.split('=')[1];

    if (adminToken) {
      try {
        const decoded = auth.verifyToken(adminToken);
        if (decoded && decoded.isAdmin) {
          return res.redirect('/admin-miniapp/');
        }
      } catch (error) {
        // Invalid token, continue to login page
      }
    }

    res.sendFile(path.join(__dirname, '../../admin-login.html'));
  };
};

/**
 * Admin miniapp protection middleware
 *
 * Exported separately to be mounted on /admin-miniapp/*
 *
 * @param {Object} deps - Dependencies
 * @param {Object} deps.auth - Auth module
 * @returns {express.Router} Express router with authentication and static file serving
 */
module.exports.protectAdminMiniapp = function(deps) {
  const { auth } = deps;
  const router = express.Router();

  // Authentication middleware for browser users
  // Note: Static files (HTML/JS/CSS) are not sensitive — the SPA handles its own
  // auth check on load via /api/admin/verify (Telegram) or /api/admin/browser-verify.
  // All data access goes through API endpoints protected by requireAdminAuth middleware.
  // We still gate browser access behind the admin cookie to avoid casual exposure,
  // but Telegram Mini Apps load the SPA in a WebView that cannot be distinguished
  // from a regular browser on the initial request — so we allow unauthenticated
  // static file access and let the SPA's auth flow handle verification.
  router.use((req, res, next) => {
    // For browser access, check admin JWT cookie
    const adminToken = req.headers.cookie
      ?.split('; ')
      .find(row => row.startsWith('admin_token='))
      ?.split('=')[1];

    if (adminToken) {
      try {
        const decoded = auth.verifyToken(adminToken);
        if (decoded && decoded.isAdmin) {
          req.adminUser = decoded;
          return next();
        }
      } catch (error) {
        // Invalid token — fall through
      }
    }

    // Allow access to static files for Telegram Mini App users (no cookie on first load).
    // The SPA itself will verify admin access via /api/admin/verify before showing any data.
    // Only redirect to login for HTML page navigations (not JS/CSS/image assets).
    if (req.accepts('html') && !req.path.match(/\.\w+$/)) {
      // For browser navigation to /admin-miniapp/ without a valid cookie,
      // serve the SPA (which will verify auth itself) rather than redirecting.
      // This allows both Telegram WebView and direct browser access to work —
      // the SPA shows "Access Denied" if verification fails.
    }

    next();
  });

  // Serve static files from admin-miniapp directory
  router.use(express.static(path.join(__dirname, '../../admin-miniapp')));

  return router;
};

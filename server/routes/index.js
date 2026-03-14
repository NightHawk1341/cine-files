const { requireAuth, requireEditor, requireAdmin, requireCronAuth } = require('../middleware/auth');

/**
 * Register all API routes.
 * Flat registration pattern — matches TR-BUTE.
 *
 * @param {import('express').Application} app
 * @param {{ pool: import('pg').Pool, config: object }} deps
 */
function setupRoutes(app, deps) {
  // Placeholder — routes will be added in Phase 2
  // Each endpoint file exports a handler function.
  // Registration follows this pattern:
  //
  //   const articlesHandler = require('../../api/articles');
  //   app.get('/api/articles', articlesHandler.list(deps));
  //   app.post('/api/articles', requireEditor, articlesHandler.create(deps));
  //
  // Order matters: specific routes before dynamic catch-alls.

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });
}

module.exports = { setupRoutes };

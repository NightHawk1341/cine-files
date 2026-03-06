/**
 * Data Sync Routes
 *
 * Handles synchronization of user data: favorites, cart, and picker progress
 * All handlers are imported from api/sync/ directory
 */

const express = require('express');

// Import handlers from api/sync/
const favoritesHandler = require('../../api/sync/favorites');
const cartHandler = require('../../api/sync/cart');
const pickerHandler = require('../../api/sync/picker');
const favoritesTagHandler = require('../../api/sync/favorites-tag');

/**
 * Creates sync router with required dependencies
 *
 * @param {Object} deps - Dependencies
 * @param {Object} deps.pool - PostgreSQL connection pool (unused - handlers use getPool())
 * @param {Function} deps.authenticateToken - JWT authentication middleware
 * @returns {express.Router} Configured Express router
 */
module.exports = function createSyncRouter(deps) {
  const { authenticateToken } = deps;
  const router = express.Router();

  // ============ FAVORITES ============
  router.get('/favorites', authenticateToken, favoritesHandler);
  router.post('/favorites', authenticateToken, favoritesHandler);

  // ============ CART ============
  router.get('/cart', authenticateToken, cartHandler);
  router.post('/cart', authenticateToken, cartHandler);

  // ============ PICKER ============
  router.get('/picker', authenticateToken, pickerHandler);
  router.post('/picker', authenticateToken, pickerHandler);

  return router;
};

/**
 * Update tag for a specific favorite
 *
 * This route is mounted separately at /api/favorites/tag instead of /api/sync/favorites/tag
 * Exported as a separate handler for flexible mounting
 *
 * @param {Object} deps - Dependencies
 * @param {Function} deps.authenticateToken - JWT authentication middleware
 * @returns {Array} Express middleware chain [authenticateToken, handler]
 */
module.exports.updateFavoriteTag = function(deps) {
  const { authenticateToken } = deps;
  return [authenticateToken, favoritesTagHandler];
};

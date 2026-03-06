/**
 * Admin Order Constants Endpoint
 * GET /api/admin/order-constants
 *
 * Returns order status constants from the server source of truth
 * so admin miniapp can stay in sync without maintaining a local copy.
 */

const {
  VALID_STATUSES,
  STATUS_DISPLAY_NAMES,
  STATUS_COLORS,
  DELIVERY_TYPE_DISPLAY_NAMES
} = require('../../server/utils/order-constants');

module.exports = function handler(req, res) {
  res.json({
    VALID_STATUSES,
    STATUS_DISPLAY_NAMES,
    STATUS_COLORS,
    DELIVERY_TYPE_DISPLAY_NAMES
  });
};

/**
 * Admin Logout Endpoint
 * POST /api/admin/logout
 *
 * Clears admin authentication cookie
 */

const { success, methodNotAllowed } = require('../../server/utils/response-helpers');

/**
 * Main handler
 */
module.exports = function handler(req, res) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST']);
  }

  res.clearCookie('admin_token');
  return success(res, { message: 'Вышли из системы' });
};

/**
 * Admin Logout Endpoint
 * POST /api/admin/logout
 *
 * Clears admin authentication cookie
 */

const { success } = require('../../lib/response');

function logout(deps) {
  return function handler(req, res) {
    res.clearCookie('admin_token');
    return success(res, { message: 'Вышли из системы' });
  };
}

module.exports = { logout };

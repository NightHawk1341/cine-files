/**
 * Admin Telegram Verification Endpoint
 * POST /api/admin/verify
 *
 * Validates Telegram initData signature and checks admin status
 */

const { getPool } = require('../../lib/db');
const config = require('../../lib/config');
const { validateTelegramWebAppData, isAdminUser } = require('../../server/middleware/telegram-validation');
const { success, error, badRequest, forbidden, methodNotAllowed } = require('../../server/utils/response-helpers');

const pool = getPool();

/**
 * Main handler
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST']);
  }

  try {
    const { initData } = req.body;

    if (!initData) {
      return badRequest(res, 'initData is required for verification');
    }

    const botToken = config.telegram.adminBotToken;
    if (!botToken) {
      console.error('ADMIN_BOT_TOKEN not configured');
      return error(res, 'Bot token not configured', 500);
    }

    const validation = validateTelegramWebAppData(initData, botToken);

    if (!validation.valid) {
      console.error('Telegram validation failed:', validation.error);
      return forbidden(res, validation.error);
    }

    const adminCheck = await isAdminUser(validation.userId, pool);

    if (!adminCheck.isAdmin) {
      console.log(`Access denied for user ${validation.userId}: not an admin`);
      return forbidden(res, 'You are not authorized to access the admin panel');
    }

    return success(res, {
      admin: {
        id: adminCheck.admin.id,
        name: adminCheck.admin.name,
        telegram_id: validation.userId,
        permissions: adminCheck.admin.permissions
      },
      user: validation.user
    });

  } catch (err) {
    console.error('Error in admin verification:', err);
    return error(res, err.message, 500);
  }
};

/**
 * Update App Settings Endpoint
 * POST /api/settings/update - Update a specific setting (admin only)
 *
 * Body:
 *   - key: setting key (required)
 *   - value: setting value (required, will be stored as JSONB)
 *   - reset_greeted: optional array of platforms ('telegram', 'vk') to clear
 *     greeted-user records for (only used with key='bot_greetings')
 */

const { getPool } = require('../../lib/db');
const { success, error, badRequest, methodNotAllowed } = require('../../server/utils/response-helpers');
const { setCustomEmojiIds } = require('../../lib/tg-emoji');
const pool = getPool();

// Valid setting keys
const VALID_KEYS = [
  'emergency_mode',
  'order_submission',
  'delivery_methods',
  'delivery_rounding',
  'next_shipment_date',
  'capacity_limits',
  'notification_templates',
  'bot_greetings',
  'moderation_config',
  'cart_limits',
  'announcement_bar',
  'custom_emojis'
];

/**
 * Main handler
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST']);
  }

  try {
    const { key, value, updated_by, reset_greeted } = req.body;

    // Validate required fields
    if (!key) {
      return badRequest(res, 'Setting key is required');
    }

    if (value === undefined) {
      return badRequest(res, 'Setting value is required');
    }

    // Validate key is allowed
    if (!VALID_KEYS.includes(key)) {
      return badRequest(res, `Invalid setting key. Allowed keys: ${VALID_KEYS.join(', ')}`);
    }

    // Upsert the setting
    const result = await pool.query(`
      INSERT INTO app_settings (key, value, updated_at, updated_by)
      VALUES ($1, $2, CURRENT_TIMESTAMP, $3)
      ON CONFLICT (key) DO UPDATE SET
        value = EXCLUDED.value,
        updated_at = CURRENT_TIMESTAMP,
        updated_by = EXCLUDED.updated_by
      RETURNING *
    `, [key, JSON.stringify(value), updated_by || null]);

    // Hot-reload custom emoji IDs in memory so next message uses new values
    if (key === 'custom_emojis') {
      setCustomEmojiIds(value);
    }

    // Clear greeted-user records so updated greetings reach everyone
    let resetCount = 0;
    if (key === 'bot_greetings' && Array.isArray(reset_greeted) && reset_greeted.length > 0) {
      const validPlatforms = ['telegram', 'vk'];
      const platforms = reset_greeted.filter(p => validPlatforms.includes(p));
      if (platforms.length > 0) {
        const del = await pool.query(
          'DELETE FROM bot_greeted_users WHERE platform = ANY($1)',
          [platforms]
        );
        resetCount = del.rowCount;
      }
    }

    return success(res, {
      message: 'Setting updated successfully',
      setting: result.rows[0],
      reset_greeted_count: resetCount
    });

  } catch (err) {
    console.error('Error updating app setting:', err);
    return error(res, 'Failed to update setting', 500);
  }
};

/**
 * Admin Notification Templates API
 *
 * GET  /api/admin/notification-templates - Get registry + overrides
 * PUT  /api/admin/notification-templates - Save overrides for a specific type/channel
 * POST /api/admin/notification-templates/reset - Reset a specific type/channel to defaults
 */

const { getPool } = require('../../lib/db');
const { success, error, badRequest, methodNotAllowed } = require('../../server/utils/response-helpers');
const {
  NotificationTemplateRegistry,
  getTemplateGroups,
  invalidateTemplateCache
} = require('../../lib/notifications');

const pool = getPool();
const SETTINGS_KEY = 'notification_templates';

module.exports = async function handler(req, res) {
  switch (req.method) {
    case 'GET':
      return handleGet(req, res);
    case 'PUT':
      return handleSave(req, res);
    default:
      return methodNotAllowed(res, ['GET', 'PUT']);
  }
};

// Also export the reset handler separately (mounted on a different path)
module.exports.resetHandler = async function resetHandler(req, res) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST']);
  }
  return handleReset(req, res);
};

// Export the toggle handler separately (mounted on a different path)
module.exports.toggleHandler = async function toggleHandler(req, res) {
  if (req.method !== 'PATCH') {
    return methodNotAllowed(res, ['PATCH']);
  }
  return handleToggle(req, res);
};

/**
 * GET - Return full registry + any saved overrides
 */
async function handleGet(req, res) {
  try {
    // Load current overrides from DB
    const result = await pool.query(
      'SELECT value, updated_at FROM app_settings WHERE key = $1',
      [SETTINGS_KEY]
    );

    const overrides = result.rows.length > 0 ? result.rows[0].value : {};
    const updatedAt = result.rows.length > 0 ? result.rows[0].updated_at : null;

    // Build response: registry grouped + override status per field
    const groups = getTemplateGroups();

    // Mark which fields have overrides and which channels are disabled
    const groupsWithOverrides = groups.map(group => ({
      ...group,
      types: group.types.map(typeInfo => {
        const typeOverrides = overrides[typeInfo.type] || {};
        const telegramOverridden = typeOverrides.telegram ? Object.keys(typeOverrides.telegram).length > 0 : false;
        const emailOverridden = typeOverrides.email ? Object.keys(typeOverrides.email).length > 0 : false;
        const vkOverridden = typeOverrides.vk ? Object.keys(typeOverrides.vk).length > 0 : false;
        const maxOverridden = typeOverrides.max ? Object.keys(typeOverrides.max).length > 0 : false;
        const telegramDisabled = typeOverrides._disabled?.telegram === true;
        const emailDisabled = typeOverrides._disabled?.email === true;
        const vkDisabled = typeOverrides._disabled?.vk === true;
        const maxDisabled = typeOverrides._disabled?.max === true;

        return {
          ...typeInfo,
          telegramOverridden,
          emailOverridden,
          vkOverridden,
          maxOverridden,
          telegramDisabled,
          emailDisabled,
          vkDisabled,
          maxDisabled,
          overrides: typeOverrides
        };
      })
    }));

    return success(res, {
      groups: groupsWithOverrides,
      overrides,
      updatedAt
    });
  } catch (err) {
    console.error('Error getting notification templates:', err);
    return error(res, 'Failed to load notification templates', 500);
  }
}

/**
 * PUT - Save override for a specific type + channel
 * Body: { type, channel, fields: { fieldName: value, ... } }
 */
async function handleSave(req, res) {
  try {
    const { type, channel, fields } = req.body;

    if (!type || !channel || !fields) {
      return badRequest(res, 'type, channel, and fields are required');
    }

    if (!NotificationTemplateRegistry[type]) {
      return badRequest(res, `Unknown notification type: ${type}`);
    }

    if (!['telegram', 'email', 'vk', 'max'].includes(channel)) {
      return badRequest(res, 'channel must be "telegram", "email", "vk", or "max"');
    }

    // Validate field names exist in registry
    const registryFields = NotificationTemplateRegistry[type][channel]?.fields || {};
    for (const fieldName of Object.keys(fields)) {
      if (!registryFields[fieldName]) {
        return badRequest(res, `Unknown field "${fieldName}" for ${type}/${channel}`);
      }
    }

    // Load current overrides
    const result = await pool.query(
      'SELECT value FROM app_settings WHERE key = $1',
      [SETTINGS_KEY]
    );
    const overrides = result.rows.length > 0 ? result.rows[0].value : {};

    // Merge new fields
    if (!overrides[type]) overrides[type] = {};
    if (!overrides[type][channel]) overrides[type][channel] = {};

    for (const [fieldName, value] of Object.entries(fields)) {
      // If value matches default, remove the override
      const defaultValue = registryFields[fieldName]?.default || '';
      if (value === defaultValue || value === '') {
        delete overrides[type][channel][fieldName];
      } else {
        overrides[type][channel][fieldName] = value;
      }
    }

    // Clean up empty objects
    if (Object.keys(overrides[type][channel]).length === 0) {
      delete overrides[type][channel];
    }
    if (Object.keys(overrides[type]).length === 0) {
      delete overrides[type];
    }

    // Save back to DB
    await pool.query(`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES ($1, $2, CURRENT_TIMESTAMP)
      ON CONFLICT (key) DO UPDATE SET
        value = EXCLUDED.value,
        updated_at = CURRENT_TIMESTAMP
    `, [SETTINGS_KEY, JSON.stringify(overrides)]);

    // Invalidate cache
    invalidateTemplateCache();

    console.log(`Notification template saved: ${type}/${channel}`);

    return success(res, {
      message: 'Template saved',
      overrides
    });
  } catch (err) {
    console.error('Error saving notification template:', err);
    return error(res, 'Failed to save notification template', 500);
  }
}

/**
 * PATCH /toggle - Enable or disable a specific notification type for a channel
 * Body: { type, channel, disabled: boolean }
 */
async function handleToggle(req, res) {
  try {
    const { type, channel, disabled } = req.body;

    if (!type || !channel || disabled === undefined) {
      return badRequest(res, 'type, channel, and disabled are required');
    }

    if (!NotificationTemplateRegistry[type]) {
      return badRequest(res, `Unknown notification type: ${type}`);
    }

    if (!['telegram', 'email', 'vk', 'max'].includes(channel)) {
      return badRequest(res, 'channel must be "telegram", "email", "vk", or "max"');
    }

    const result = await pool.query(
      'SELECT value FROM app_settings WHERE key = $1',
      [SETTINGS_KEY]
    );
    const overrides = result.rows.length > 0 ? result.rows[0].value : {};

    if (!overrides[type]) overrides[type] = {};
    if (!overrides[type]._disabled) overrides[type]._disabled = {};

    if (disabled) {
      overrides[type]._disabled[channel] = true;
    } else {
      delete overrides[type]._disabled[channel];
      if (Object.keys(overrides[type]._disabled).length === 0) {
        delete overrides[type]._disabled;
      }
      if (Object.keys(overrides[type]).length === 0) {
        delete overrides[type];
      }
    }

    await pool.query(`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES ($1, $2, CURRENT_TIMESTAMP)
      ON CONFLICT (key) DO UPDATE SET
        value = EXCLUDED.value,
        updated_at = CURRENT_TIMESTAMP
    `, [SETTINGS_KEY, JSON.stringify(overrides)]);

    invalidateTemplateCache();

    console.log(`Notification ${disabled ? 'disabled' : 'enabled'}: ${type}/${channel}`);

    return success(res, { message: disabled ? 'Notification disabled' : 'Notification enabled', overrides });
  } catch (err) {
    console.error('Error toggling notification:', err);
    return error(res, 'Failed to toggle notification', 500);
  }
}

/**
 * POST /reset - Reset a specific type/channel to defaults
 * Body: { type, channel }
 */
async function handleReset(req, res) {
  try {
    const { type, channel } = req.body;

    if (!type) {
      return badRequest(res, 'type is required');
    }

    if (!NotificationTemplateRegistry[type]) {
      return badRequest(res, `Unknown notification type: ${type}`);
    }

    // Load current overrides
    const result = await pool.query(
      'SELECT value FROM app_settings WHERE key = $1',
      [SETTINGS_KEY]
    );
    const overrides = result.rows.length > 0 ? result.rows[0].value : {};

    // Remove overrides for specified type/channel
    if (overrides[type]) {
      if (channel) {
        delete overrides[type][channel];
        if (Object.keys(overrides[type]).length === 0) {
          delete overrides[type];
        }
      } else {
        // Reset both channels
        delete overrides[type];
      }
    }

    // Save back
    await pool.query(`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES ($1, $2, CURRENT_TIMESTAMP)
      ON CONFLICT (key) DO UPDATE SET
        value = EXCLUDED.value,
        updated_at = CURRENT_TIMESTAMP
    `, [SETTINGS_KEY, JSON.stringify(overrides)]);

    // Invalidate cache
    invalidateTemplateCache();

    console.log(`Notification template reset: ${type}${channel ? `/${channel}` : ''}`);

    return success(res, {
      message: 'Template reset to defaults',
      overrides
    });
  } catch (err) {
    console.error('Error resetting notification template:', err);
    return error(res, 'Failed to reset notification template', 500);
  }
}

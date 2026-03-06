/**
 * Parcel Storage Settings Endpoint
 * Configure how long parcels are stored at pickup points per provider/service type
 * GET /api/admin/parcel-storage-settings
 * PUT /api/admin/parcel-storage-settings
 *
 * REQUIRES ADMIN AUTHENTICATION
 *
 * Settings structure:
 * {
 *   cdek: { pvz: 7, courier: 3 },
 *   pochta: { standard: 30, express: 15, courier: 7 }
 * }
 */

const { getPool } = require('../../lib/db');
const { success, error, badRequest, unauthorized, methodNotAllowed } = require('../../server/utils/response-helpers');
const pool = getPool();

const SETTINGS_KEY = 'parcel_storage_settings';

const DEFAULT_SETTINGS = {
  cdek: {
    pvz: 7,
    courier: 3
  },
  pochta: {
    standard: 30,
    express: 15,
    courier: 7
  }
};

module.exports = async function handler(req, res) {
  if (!req.adminUser) {
    return unauthorized(res, 'Admin authentication required');
  }

  if (req.method === 'GET') {
    return handleGet(req, res);
  } else if (req.method === 'PUT') {
    return handlePut(req, res);
  } else {
    return methodNotAllowed(res, ['GET', 'PUT']);
  }
};

async function handleGet(req, res) {
  try {
    const result = await pool.query(
      "SELECT value FROM app_settings WHERE key = $1",
      [SETTINGS_KEY]
    );

    const settings = result.rows[0]?.value || DEFAULT_SETTINGS;
    return success(res, { settings });
  } catch (err) {
    console.error('Error fetching parcel storage settings:', err);
    return error(res, 'Failed to fetch settings', 500);
  }
}

async function handlePut(req, res) {
  try {
    const { cdek, pochta } = req.body;

    if (!cdek || !pochta) {
      return badRequest(res, 'cdek and pochta settings required');
    }

    const validated = {
      cdek: {
        pvz: parseInt(cdek.pvz) || DEFAULT_SETTINGS.cdek.pvz,
        courier: parseInt(cdek.courier) || DEFAULT_SETTINGS.cdek.courier
      },
      pochta: {
        standard: parseInt(pochta.standard) || DEFAULT_SETTINGS.pochta.standard,
        express: parseInt(pochta.express) || DEFAULT_SETTINGS.pochta.express,
        courier: parseInt(pochta.courier) || DEFAULT_SETTINGS.pochta.courier
      }
    };

    // Validate ranges (1-180 days)
    for (const [provider, types] of Object.entries(validated)) {
      for (const [type, days] of Object.entries(types)) {
        if (days < 1 || days > 180) {
          return badRequest(res, `Invalid days value for ${provider}.${type}: must be 1-180`);
        }
      }
    }

    await pool.query(`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (key) DO UPDATE
      SET value = $2, updated_at = NOW()
    `, [SETTINGS_KEY, JSON.stringify(validated)]);

    return success(res, { settings: validated, message: 'Settings saved' });
  } catch (err) {
    console.error('Error saving parcel storage settings:', err);
    return error(res, 'Failed to save settings', 500);
  }
}

module.exports.getStorageSettings = async function getStorageSettings() {
  try {
    const result = await pool.query(
      "SELECT value FROM app_settings WHERE key = $1",
      [SETTINGS_KEY]
    );
    return result.rows[0]?.value || DEFAULT_SETTINGS;
  } catch (err) {
    console.warn('Could not load storage settings, using defaults:', err.message);
    return DEFAULT_SETTINGS;
  }
};

module.exports.DEFAULT_SETTINGS = DEFAULT_SETTINGS;

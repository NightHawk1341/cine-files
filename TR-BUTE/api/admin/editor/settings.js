/**
 * Editor Settings API Endpoint
 * GET/POST /api/admin/editor/settings
 *
 * Manages editor permissions - which segments editor can access
 * Only accessible by admin role
 */

const { getPool } = require('../../../lib/db');
const { success, error, badRequest, forbidden, methodNotAllowed } = require('../../../server/utils/response-helpers');

/**
 * Default editor permissions (matches browser-verify.js format)
 */
const DEFAULT_EDITOR_PERMISSIONS = {
  feed: {
    enabled: true,
    showOrders: false
  },
  orders: {
    enabled: false,
    canAccessOrders: false,
    canAccessCertificates: false,
    canAccessPromos: false,
    canAccessTemplates: false
  },
  products: {
    enabled: true,
    canDelete: false,
    canAccessProducts: true,
    canAccessCatalogs: true,
    canAccessTemplates: true
  },
  statistics: {
    enabled: false,
    canAccessOverview: false,
    canAccessRevenue: false,
    canAccessOrders: false,
    canAccessShipping: false,
    canAccessCustomers: false,
    canAccessProducts: false,
    canAccessAuthors: false,
    canAccessServices: false
  },
  projectManagement: {
    enabled: false,
    canAccessOrders: false,
    canAccessEstimates: false,
    canAccessFaq: false,
    canAccessStories: false,
    canAccessPost: false,
    canAccessNotifications: false,
    canAccessSite: false,
    canAccessEditor: false
  }
};

/**
 * Main handler
 */
module.exports = async function handler(req, res) {
  const isAdmin = req.adminUser?.isAdmin === true;

  if (req.method === 'GET') {
    // Both admin and editor can GET settings (editor needs them to know their permissions)
    try {
      const pool = getPool();
      const result = await pool.query(
        "SELECT value FROM app_settings WHERE key = 'editor_permissions'"
      );

      let permissions = DEFAULT_EDITOR_PERMISSIONS;
      if (result.rows.length > 0 && result.rows[0].value) {
        permissions = { ...DEFAULT_EDITOR_PERMISSIONS, ...result.rows[0].value };
      }

      return success(res, { permissions });
    } catch (err) {
      console.error('Error fetching editor settings:', err);
      return error(res, 'Failed to fetch editor settings', 500);
    }
  }

  if (req.method === 'POST') {
    // Only admin can update editor settings
    if (!isAdmin) {
      return forbidden(res, 'Only admin can modify editor settings');
    }

    try {
      const { permissions } = req.body;

      if (!permissions || typeof permissions !== 'object') {
        return badRequest(res, 'Invalid permissions format');
      }

      // Merge with defaults to ensure all keys exist
      const mergedPermissions = { ...DEFAULT_EDITOR_PERMISSIONS };
      for (const key of Object.keys(mergedPermissions)) {
        if (permissions[key] !== undefined) {
          mergedPermissions[key] = {
            ...mergedPermissions[key],
            ...permissions[key]
          };
        }
      }

      const pool = getPool();

      // Upsert the editor_permissions setting
      await pool.query(`
        INSERT INTO app_settings (key, value, updated_at)
        VALUES ('editor_permissions', $1, NOW())
        ON CONFLICT (key)
        DO UPDATE SET value = $1, updated_at = NOW()
      `, [JSON.stringify(mergedPermissions)]);

      return success(res, {
        message: 'Editor permissions updated',
        permissions: mergedPermissions
      });
    } catch (err) {
      console.error('Error updating editor settings:', err);
      return error(res, 'Failed to update editor settings', 500);
    }
  }

  return methodNotAllowed(res, ['GET', 'POST']);
};

/**
 * Role Check Utilities
 *
 * Utilities for checking user role from JWT token
 */

const auth = require('../../auth');
const { getPool } = require('../../lib/db');

/**
 * Default editor permissions
 */
const DEFAULT_EDITOR_PERMISSIONS = {
  products: { enabled: true, canDelete: false },
  stories: { enabled: true },
  feed: { enabled: true, showOrders: false },
  statistics: { enabled: false },
  projectManagement: { enabled: false }
};

/**
 * Get role from request (JWT cookie or Telegram header)
 * @param {Object} req - Express request object
 * @returns {Object} { role: string, isEditor: boolean, isAdmin: boolean }
 */
function getRoleFromRequest(req) {
  // Check for browser auth (JWT cookie)
  const adminToken = req.headers.cookie
    ?.split('; ')
    .find(row => row.startsWith('admin_token='))
    ?.split('=')[1];

  if (adminToken) {
    try {
      const decoded = auth.verifyToken(adminToken);
      if (decoded && decoded.isAdmin) {
        const role = decoded.role || 'admin';
        return {
          role,
          isEditor: role === 'editor',
          isAdmin: role === 'admin'
        };
      }
    } catch (e) {
      // Token invalid
    }
  }

  // Check for Telegram auth (adminUser set by middleware)
  if (req.adminUser) {
    return {
      role: 'admin', // Telegram users are always admin
      isEditor: false,
      isAdmin: true
    };
  }

  return {
    role: null,
    isEditor: false,
    isAdmin: false
  };
}

/**
 * Get editor permissions from database
 * @returns {Object} Editor permissions
 */
async function getEditorPermissions() {
  try {
    const pool = getPool();
    const result = await pool.query(
      "SELECT value FROM app_settings WHERE key = 'editor_permissions'"
    );

    if (result.rows.length > 0 && result.rows[0].value) {
      return { ...DEFAULT_EDITOR_PERMISSIONS, ...result.rows[0].value };
    }
    return DEFAULT_EDITOR_PERMISSIONS;
  } catch (err) {
    console.error('Error fetching editor permissions:', err);
    return DEFAULT_EDITOR_PERMISSIONS;
  }
}

/**
 * Check if request has permission for a specific action
 * @param {Object} req - Express request object
 * @param {string} permission - Permission key (e.g., 'products', 'stories')
 * @param {string} subPermission - Optional sub-permission (e.g., 'canDelete')
 * @returns {Promise<boolean>}
 */
async function hasPermission(req, permission, subPermission = null) {
  const { role, isAdmin } = getRoleFromRequest(req);

  // Admin has all permissions
  if (isAdmin) return true;

  // No role means no permission
  if (!role) return false;

  // For editor, check configured permissions
  const editorPermissions = await getEditorPermissions();

  const perm = editorPermissions[permission];
  if (!perm || !perm.enabled) return false;

  // Check sub-permission if specified
  if (subPermission !== null) {
    return perm[subPermission] === true;
  }

  return true;
}

/**
 * Middleware to require admin role only
 * Use this for endpoints that editors should never access
 */
function requireAdmin(req, res, next) {
  const { isAdmin } = getRoleFromRequest(req);

  if (!isAdmin) {
    return res.status(403).json({
      success: false,
      error: 'Access denied',
      message: 'This action requires admin privileges'
    });
  }

  next();
}

/**
 * Middleware factory to require specific permission
 * @param {string} permission - Permission key
 * @param {string} subPermission - Optional sub-permission
 */
function requirePermission(permission, subPermission = null) {
  return async (req, res, next) => {
    const allowed = await hasPermission(req, permission, subPermission);

    if (!allowed) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
        message: `You don't have permission for this action`
      });
    }

    next();
  };
}

module.exports = {
  getRoleFromRequest,
  getEditorPermissions,
  hasPermission,
  requireAdmin,
  requirePermission,
  DEFAULT_EDITOR_PERMISSIONS
};

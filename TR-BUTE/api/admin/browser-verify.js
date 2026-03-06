/**
 * Admin Browser Verification Endpoint
 * GET /api/admin/browser-verify
 *
 * Verifies JWT cookie and returns admin data for browser-based auth
 */

const auth = require('../../auth');
const { getPool } = require('../../lib/db');
const { success, error, unauthorized, forbidden, methodNotAllowed } = require('../../server/utils/response-helpers');

/**
 * Default editor permissions
 * Structure: Main tab permissions with nested subtab permissions
 */
const DEFAULT_EDITOR_PERMISSIONS = {
  // Feed tab - Activity feed (reviews, comments, suggestions)
  feed: {
    enabled: true,
    showOrders: false // Whether editor can see orders in feed
  },

  // Orders tab - Order management
  orders: {
    enabled: false,
    // Subtab permissions
    canAccessOrders: false,       // Order list subtab
    canAccessCertificates: false, // Gift certificates subtab
    canAccessPromos: false,       // Promo codes subtab
    canAccessTemplates: false     // Order templates subtab
  },

  // Products tab - Product management
  products: {
    enabled: true,
    canDelete: false, // Cannot set products to "Not for sale"
    // Subtab permissions
    canAccessProducts: true,  // Products list subtab
    canAccessCatalogs: true,  // Catalogs subtab
    canAccessTemplates: true  // Product templates subtab
  },

  // Statistics tab - Analytics and reports
  statistics: {
    enabled: false,
    // Subtab permissions
    canAccessOverview: false,   // Overview subtab
    canAccessRevenue: false,    // Revenue subtab
    canAccessOrders: false,     // Orders analytics subtab
    canAccessShipping: false,   // Shipping subtab
    canAccessCustomers: false,  // Customers subtab
    canAccessProducts: false,   // Products analytics subtab
    canAccessAuthors: false,    // Authors subtab
    canAccessServices: false    // Services subtab
  },

  // Project Management tab - Settings and configuration
  projectManagement: {
    enabled: false,
    // Subtab permissions
    canAccessOrders: false,        // Order settings (submission toggle, messages)
    canAccessEstimates: false,     // Price estimates settings
    canAccessFaq: false,           // FAQ management
    canAccessStories: false,       // Stories management
    canAccessPost: false,          // Channel post creation
    canAccessNotifications: false, // Notification templates
    canAccessSite: false,          // Site settings (emergency mode, etc.)
    canAccessEditor: false         // Editor permissions (admin only, should always be false)
  }
};

/**
 * Get editor permissions from database
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
 * Main handler
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return methodNotAllowed(res, ['GET']);
  }

  try {
    // Check for admin JWT in cookie
    const adminToken = req.headers.cookie
      ?.split('; ')
      .find(row => row.startsWith('admin_token='))
      ?.split('=')[1];

    if (!adminToken) {
      return unauthorized(res, 'Not authenticated');
    }

    // Verify token
    const decoded = auth.verifyToken(adminToken);

    if (!decoded || !decoded.isAdmin) {
      res.clearCookie('admin_token');
      return forbidden(res, 'Invalid authentication');
    }

    // Return admin data with role information
    const role = decoded.role || 'admin'; // Default to admin for backwards compatibility

    // Get editor permissions from database
    const editorPermissions = await getEditorPermissions();

    return success(res, {
      admin: {
        id: `browser-${role}`,
        name: decoded.username || (role === 'admin' ? 'Admin' : 'Editor'),
        telegram_id: `browser-${role}`,
        authMethod: 'browser',
        role: role,
        // For admin: full access, for editor: use configured permissions
        editorPermissions: role === 'editor' ? editorPermissions : null
      }
    });

  } catch (err) {
    console.error('Browser verification error:', err);
    return error(res, 'Verification failed', 500);
  }
};

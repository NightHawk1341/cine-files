/**
 * Sharing Configuration API
 * Returns sharing configuration based on deployment mode
 */

const { getSharingConfig } = require('../lib/notifications');
const { success, error, methodNotAllowed } = require('../server/utils/response-helpers');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return methodNotAllowed(res, ['GET']);
  }

  try {
    const sharingConfig = getSharingConfig();

    return success(res, { config: sharingConfig });
  } catch (err) {
    console.error('Error getting sharing config:', err);
    return error(res, 'Failed to get sharing configuration', 500);
  }
};

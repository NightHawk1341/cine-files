/**
 * Storage Stats Admin Endpoint
 * GET /api/admin/storage/stats
 *
 * Returns storage usage statistics for all configured providers
 */

const { getStorageStats } = require('../../../lib/storage-manager');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const stats = await getStorageStats();

    return res.status(200).json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Error getting storage stats:', error);
    return res.status(500).json({
      error: 'Failed to get storage stats',
      message: error.message
    });
  }
};

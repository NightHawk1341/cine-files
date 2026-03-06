/**
 * API: Get Pickup Points
 *
 * GET /api/shipping/points
 *
 * Returns pickup points (CDEK ПВЗ, Pochta post offices) for a given location.
 */

const { getPool } = require('../../lib/db');
const shippingService = require('../../server/services/shipping');

const pool = getPool();

module.exports = async function handler(req, res) {
  // CORS handled by global middleware in server.js

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      provider,
      postalCode,
      city,
      lat,
      lng,
      limit = '50'
    } = req.query;

    // Validate provider
    if (!provider || !['cdek', 'pochta'].includes(provider)) {
      return res.status(400).json({
        error: 'Invalid or missing provider. Must be "cdek" or "pochta".'
      });
    }

    // Need either postalCode, city, or coordinates
    if (!postalCode && !city && !(lat && lng)) {
      return res.status(400).json({
        error: 'Either postalCode, city, or coordinates (lat/lng) is required.'
      });
    }

    // Parse coordinates if provided
    const latitude = lat ? parseFloat(lat) : undefined;
    const longitude = lng ? parseFloat(lng) : undefined;

    // Get pickup points
    const points = await shippingService.getPickupPoints(provider, {
      postalCode,
      city,
      latitude,
      longitude,
      limit: parseInt(limit)
    }, pool);

    // Format response
    res.status(200).json({
      success: true,
      data: {
        provider,
        count: points.length,
        points: points.map(p => ({
          code: p.code,
          name: p.name,
          address: p.address,
          city: p.city,
          postalCode: p.postalCode,
          workTime: p.workTime,
          phone: p.phone,
          type: p.type,
          location: p.location || (p.latitude && p.longitude ? {
            lat: p.latitude,
            lng: p.longitude
          } : null),
          // Provider-specific features
          ...(provider === 'cdek' && {
            haveCashless: p.haveCashless,
            haveCash: p.haveCash
          })
        }))
      }
    });

  } catch (error) {
    console.error('Pickup points error:', error);

    res.status(500).json({
      success: false,
      error: 'Failed to fetch pickup points',
      message: error.message
    });
  }
};

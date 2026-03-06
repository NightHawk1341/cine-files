/**
 * Order Tracking Endpoint
 * Get tracking status for an order from shipping provider APIs
 * GET /api/orders/tracking?order_id=123
 *
 * REQUIRES AUTHENTICATION
 * Only the order owner can view tracking
 */

const { getPool } = require('../../lib/db');
const { success, error, badRequest, unauthorized, notFound, methodNotAllowed } = require('../../server/utils/response-helpers');
const { requireUserOrder } = require('../../server/utils/order-queries');
const {
  parseTrackingNumber,
  getProviderFromDeliveryType,
  getTrackingUrl,
  getProviderDisplayName
} = require('../../server/utils/tracking-parser');
const pool = getPool();

// Import shipping services
let cdekService, apishipService;
try {
  const shippingModule = require('../../server/services/shipping');
  cdekService = shippingModule.cdek;
  apishipService = shippingModule.apiship;
} catch (err) {
  console.warn('Shipping services not available:', err.message);
}

/**
 * Get tracking from CDEK API
 */
async function getCdekTracking(order) {
  if (!cdekService) return null;

  try {
    // CDEK uses UUID for tracking
    const cdekUuid = order.provider_shipment_id;
    if (!cdekUuid) return null;

    const status = await cdekService.getOrderStatus(cdekUuid);
    return {
      provider: 'cdek',
      tracking_number: order.tracking_number,
      current_status: status?.entity?.statuses?.[0]?.name || 'Неизвестно',
      is_delivered: status?.entity?.statuses?.some(s =>
        s.code === 'DELIVERED' || s.code === 'RECEIVED'
      ) || false,
      history: (status?.entity?.statuses || []).map(s => ({
        status: s.name,
        date: s.date_time,
        city: s.city
      })),
      raw: status
    };
  } catch (err) {
    console.error('CDEK tracking error:', err.message);
    return null;
  }
}

/**
 * Get tracking from Pochta (via ApiShip) API
 */
async function getPochtaTracking(order) {
  if (!apishipService) return null;

  try {
    const trackingNumber = order.tracking_number;
    if (!trackingNumber) return null;

    const tracking = await apishipService.getTracking(trackingNumber);
    return {
      provider: 'pochta',
      tracking_number: trackingNumber,
      current_status: tracking?.statuses?.[0]?.name || 'Неизвестно',
      is_delivered: tracking?.isDelivered || false,
      history: (tracking?.statuses || []).map(s => ({
        status: s.name,
        date: s.date,
        location: s.location
      })),
      raw: tracking
    };
  } catch (err) {
    console.error('Pochta tracking error:', err.message);
    return null;
  }
}

/**
 * Detect provider from order data and tracking number
 * Uses delivery_type first, then falls back to tracking number pattern detection
 */
function detectProvider(order) {
  // First try delivery_type
  let provider = getProviderFromDeliveryType(order.delivery_type);

  // If not determined, try to detect from tracking number format
  if (!provider && order.tracking_number) {
    const parsed = parseTrackingNumber(order.tracking_number);
    provider = parsed.provider;
  }

  return provider;
}

/**
 * Main handler
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return methodNotAllowed(res, ['GET']);
  }

  try {
    // Verify authentication
    if (!req.userId) {
      return unauthorized(res, 'Authentication required');
    }

    const { order_id } = req.query;

    if (!order_id) {
      return badRequest(res, 'order_id is required');
    }

    // Get the order and verify ownership
    const order = await requireUserOrder(pool, order_id, req.userId, res);
    if (!order) return;

    // Check if order has tracking number
    if (!order.tracking_number && !order.provider_shipment_id) {
      return success(res, {
        order_id: order.id,
        status: order.status,
        has_tracking: false,
        message: 'Трек-номер пока не добавлен'
      });
    }

    // Determine provider using auto-detection
    let tracking = null;
    const provider = detectProvider(order);

    if (provider === 'cdek') {
      tracking = await getCdekTracking(order);
    } else if (provider === 'pochta') {
      tracking = await getPochtaTracking(order);
    }

    // Also check stored tracking history and storage/return state
    let storedHistory = [];
    let storageInfo = {};
    try {
      const historyResult = await pool.query(
        `SELECT tracking_history, last_tracking_status, last_tracking_update,
                arrived_at_point_at, storage_deadline, returned_to_sender_at,
                return_action, return_action_requested_at
         FROM orders WHERE id = $1`,
        [order_id]
      );
      if (historyResult.rows[0]) {
        const row = historyResult.rows[0];
        if (row.tracking_history) storedHistory = row.tracking_history;
        storageInfo = {
          arrived_at_point_at: row.arrived_at_point_at,
          storage_deadline: row.storage_deadline,
          returned_to_sender_at: row.returned_to_sender_at,
          return_action: row.return_action,
          return_action_requested_at: row.return_action_requested_at
        };
      }
    } catch (err) {
      console.warn('Could not fetch stored tracking history:', err.message);
    }

    // Update stored tracking if we got fresh data
    if (tracking && tracking.history && tracking.history.length > 0) {
      try {
        await pool.query(`
          UPDATE orders
          SET last_tracking_status = $1,
              last_tracking_update = NOW(),
              tracking_history = $2
          WHERE id = $3
        `, [
          tracking.current_status,
          JSON.stringify(tracking.history),
          order_id
        ]);
      } catch (err) {
        console.warn('Could not update tracking history:', err.message);
      }
    }

    // Return tracking info
    return success(res, {
      order_id: order.id,
      status: order.status,
      has_tracking: true,
      tracking_number: order.tracking_number,
      tracking_link: getTrackingUrl(provider, order.tracking_number),
      provider: provider,
      provider_name: getProviderDisplayName(provider),
      current_status: tracking?.current_status || order.last_tracking_status || 'Неизвестно',
      is_delivered: tracking?.is_delivered || order.user_confirmed_delivery || false,
      history: tracking?.history || storedHistory,
      last_updated: tracking ? new Date().toISOString() : order.last_tracking_update,
      can_confirm_delivery: order.status === 'shipped' && !order.user_confirmed_delivery,
      // Storage and return info
      arrived_at_point_at: storageInfo.arrived_at_point_at || null,
      storage_deadline: storageInfo.storage_deadline || null,
      returned_to_sender_at: storageInfo.returned_to_sender_at || null,
      return_action: storageInfo.return_action || null,
      return_action_requested_at: storageInfo.return_action_requested_at || null,
      delivery_cost: order.delivery_cost || null
    });

  } catch (err) {
    console.error('Error fetching tracking:', err);
    return error(res, 'Failed to fetch tracking', 500);
  }
};

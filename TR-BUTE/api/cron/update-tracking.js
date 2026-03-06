/**
 * CRON Job: Update Tracking Information
 * Automatically fetches latest tracking info for shipped orders
 *
 * Handles:
 * - Regular tracking updates from CDEK and Pochta (APIship)
 * - Arrival at pickup point: starts storage countdown, notifies user
 * - Storage reminders every 5 days until pickup or delivery confirmed
 * - Return to sender: notifies user to choose retry or cancel
 *
 * Vercel: This can be set up as a cron job using vercel.json
 * Example cron: "0 0,4,8,12,16,20 * * *" (every 4 hours)
 *
 * GET /api/cron/update-tracking
 * Authorization: Bearer <CRON_SECRET> (for security)
 */

const { getPool } = require('../../lib/db');
const { success, error, unauthorized } = require('../../server/utils/response-helpers');
const { sendNotification, NotificationType } = require('../../lib/notifications');
const { getStorageSettings } = require('../admin/parcel-storage-settings');

const pool = getPool();

// ── Status detection arrays ──────────────────────────────────────────────────

const POCHTA_DELIVERED_STATUSES = [
  'ВРУЧЕНИЕ', 'ВРУЧЕНО', 'ДОСТАВЛЕНО', 'ПОЛУЧЕНО',
  'Вручение адресату', 'Вручение', 'Delivered', 'delivered'
];

const CDEK_DELIVERED_STATUSES = [
  'DELIVERED', 'Доставлено', 'Вручен', 'RECEIVED'
];

// APIship status codes used in getStatusName
const POCHTA_ARRIVED_STATUSES = ['arrived', 'ready_for_pickup'];

const CDEK_ARRIVED_STATUSES = ['READY_FOR_PICKUP', 'ACCEPTED_AT_PICK_UP_POINT'];

const POCHTA_RETURNED_STATUSES = ['returned'];

const CDEK_RETURNED_STATUSES = ['RETURNED', 'RETURNING', 'RETURNED_TO_SENDER'];

// ── Status checkers ──────────────────────────────────────────────────────────

function isDeliveredStatus(status, provider) {
  if (!status) return false;
  const s = status.toUpperCase();
  if (provider === 'pochta') return POCHTA_DELIVERED_STATUSES.some(d => s.includes(d.toUpperCase()));
  if (provider === 'cdek') return CDEK_DELIVERED_STATUSES.some(d => s.includes(d.toUpperCase()));
  return false;
}

function isArrivedAtPointStatus(status, provider) {
  if (!status) return false;
  const s = status.toLowerCase();
  if (provider === 'pochta') return POCHTA_ARRIVED_STATUSES.some(a => s.includes(a.toLowerCase()));
  if (provider === 'cdek') return CDEK_ARRIVED_STATUSES.some(a => status.toUpperCase().includes(a.toUpperCase()));
  return false;
}

function isReturnedStatus(status, provider) {
  if (!status) return false;
  const s = status.toLowerCase();
  if (provider === 'pochta') return POCHTA_RETURNED_STATUSES.some(r => s.includes(r.toLowerCase()));
  if (provider === 'cdek') return CDEK_RETURNED_STATUSES.some(r => status.toUpperCase().includes(r.toUpperCase()));
  return false;
}

// ── Carrier API fetchers ─────────────────────────────────────────────────────

async function fetchPochtaTracking(trackingNumber) {
  try {
    const response = await fetch(
      `https://www.pochta.ru/api/tracking/api/v1/trackings/${trackingNumber}`,
      { headers: { 'Accept': 'application/json', 'User-Agent': 'TR-BUTE/1.0' } }
    );

    if (!response.ok) return null;

    const data = await response.json();

    if (data.trackingOperations && data.trackingOperations.length > 0) {
      const operations = data.trackingOperations;
      const latestOp = operations[0];

      return {
        current_status: latestOp.operationType || 'Unknown',
        current_status_code: latestOp.operationTypeCode || latestOp.operationType,
        location: latestOp.cityName || latestOp.operationPlace,
        last_update: latestOp.date,
        is_delivered: isDeliveredStatus(latestOp.operationType, 'pochta'),
        is_arrived_at_point: isArrivedAtPointStatus(latestOp.operationType, 'pochta'),
        is_returned: isReturnedStatus(latestOp.operationType, 'pochta'),
        history: operations.slice(0, 10).map(op => ({
          status: op.operationType,
          location: op.cityName || op.operationPlace,
          date: op.date
        }))
      };
    }

    return null;
  } catch (err) {
    console.error('Error fetching Pochta tracking:', err.message);
    return null;
  }
}

async function fetchCdekTracking(trackingNumber) {
  try {
    const cdekClientId = process.env.CDEK_CLIENT_ID;
    const cdekClientSecret = process.env.CDEK_CLIENT_SECRET;

    if (!cdekClientId || !cdekClientSecret) return null;

    const basicAuth = Buffer.from(`${cdekClientId}:${cdekClientSecret}`).toString('base64');
    const tokenResponse = await fetch('https://api.cdek.ru/v2/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${basicAuth}`
      },
      body: 'grant_type=client_credentials'
    });

    if (!tokenResponse.ok) return null;

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    const trackingResponse = await fetch(
      `https://api.cdek.ru/v2/orders?cdek_number=${trackingNumber}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!trackingResponse.ok) return null;

    const trackingData = await trackingResponse.json();

    if (trackingData.entity && trackingData.entity.statuses) {
      const statuses = trackingData.entity.statuses;
      const latestStatus = statuses[0];

      return {
        current_status: latestStatus.name || latestStatus.code,
        current_status_code: latestStatus.code,
        location: latestStatus.city,
        last_update: latestStatus.date_time,
        is_delivered: isDeliveredStatus(latestStatus.code, 'cdek'),
        is_arrived_at_point: isArrivedAtPointStatus(latestStatus.code, 'cdek'),
        is_returned: isReturnedStatus(latestStatus.code, 'cdek'),
        history: statuses.slice(0, 10).map(s => ({
          status: s.name || s.code,
          location: s.city,
          date: s.date_time
        }))
      };
    }

    return null;
  } catch (err) {
    console.error('Error fetching CDEK tracking:', err.message);
    return null;
  }
}

// ── Storage days lookup ──────────────────────────────────────────────────────

function getStorageDays(storageSettings, deliveryType) {
  if (!deliveryType) return 7;

  if (deliveryType.startsWith('cdek')) {
    return deliveryType === 'cdek_courier'
      ? (storageSettings.cdek?.courier || 3)
      : (storageSettings.cdek?.pvz || 7);
  }

  if (deliveryType === 'pochta_courier') {
    return storageSettings.pochta?.courier || 7;
  }

  if (deliveryType === 'pochta_first_class' || deliveryType === 'courier_ems') {
    return storageSettings.pochta?.express || 15;
  }

  // pochta_standard, pochta, pochta_pvz
  return storageSettings.pochta?.standard || 30;
}

function getProviderName(deliveryType) {
  if (!deliveryType) return '';
  if (deliveryType.startsWith('cdek')) return 'СДЭК';
  return 'Почта России';
}

// ── User notification helper ─────────────────────────────────────────────────

async function notifyUser(userId, type, data, link) {
  try {
    const userResult = await pool.query(
      'SELECT telegram_id, email, vk_id, max_id FROM users WHERE id = $1',
      [userId]
    );

    if (!userResult.rows[0]) return;

    const user = userResult.rows[0];
    await sendNotification({
      type,
      data,
      link,
      linkText: 'Открыть заказ',
      userTelegramId: user.telegram_id ? String(user.telegram_id) : null,
      userEmail: user.email,
      userVkId: user.vk_id,
      userMaxId: user.max_id
    });
  } catch (err) {
    console.error(`Failed to notify user ${userId}:`, err.message);
  }
}

// ── Database update ──────────────────────────────────────────────────────────

async function updateOrderTracking(client, orderId, trackingInfo) {
  try {
    await client.query('BEGIN');

    await client.query(`
      UPDATE orders
      SET last_tracking_status = $1,
          last_tracking_update = NOW(),
          tracking_history = $2,
          updated_at = NOW()
      WHERE id = $3
    `, [
      trackingInfo.current_status,
      JSON.stringify(trackingInfo.history || []),
      orderId
    ]);

    if (trackingInfo.is_delivered) {
      await client.query(`
        UPDATE orders
        SET status = 'delivered',
            delivered_at = COALESCE(delivered_at, NOW()),
            updated_at = NOW()
        WHERE id = $1 AND status = 'shipped'
      `, [orderId]);
    }

    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`Error updating tracking for order ${orderId}:`, err.message);
    return false;
  }
}

// ── Handle arrival at pickup point ──────────────────────────────────────────

async function handleArrivedAtPoint(order, storageSettings) {
  const storageDays = getStorageDays(storageSettings, order.delivery_type);
  const storageDeadline = new Date(Date.now() + storageDays * 24 * 60 * 60 * 1000);

  await pool.query(`
    UPDATE orders
    SET arrived_at_point_at = COALESCE(arrived_at_point_at, NOW()),
        storage_deadline = COALESCE(storage_deadline, $1),
        last_storage_notification_at = NOW(),
        arrival_notified = TRUE,
        updated_at = NOW()
    WHERE id = $2
  `, [storageDeadline.toISOString(), order.id]);

  const providerName = getProviderName(order.delivery_type);
  const orderLink = `${process.env.APP_URL || ''}/order?id=${order.id}`;

  await notifyUser(order.user_id, NotificationType.PARCEL_AT_PICKUP_POINT, {
    orderId: order.id,
    storageDays,
    providerName
  }, orderLink);

  console.log(`[TRACKING] Order ${order.id}: arrived at point, ${storageDays} days storage`);
}

// ── Handle return to sender ──────────────────────────────────────────────────

async function handleReturnedToSender(order) {
  await pool.query(`
    UPDATE orders
    SET returned_to_sender_at = COALESCE(returned_to_sender_at, NOW()),
        updated_at = NOW()
    WHERE id = $1
  `, [order.id]);

  const orderLink = `${process.env.APP_URL || ''}/order?id=${order.id}`;

  await notifyUser(order.user_id, NotificationType.PARCEL_RETURNED_TO_SENDER, {
    orderId: order.id,
    deliveryCost: parseFloat(order.delivery_cost) || 0
  }, orderLink);

  console.log(`[TRACKING] Order ${order.id}: returned to sender`);
}

// ── Send storage reminders ───────────────────────────────────────────────────

async function sendStorageReminders() {
  const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);

  const result = await pool.query(`
    SELECT o.id, o.user_id, o.delivery_type, o.delivery_cost,
           o.storage_deadline, o.last_storage_notification_at,
           o.arrived_at_point_at, o.returned_to_sender_at
    FROM orders o
    WHERE o.arrived_at_point_at IS NOT NULL
      AND o.returned_to_sender_at IS NULL
      AND o.status = 'shipped'
      AND o.delivered_at IS NULL
      AND o.user_confirmed_delivery = FALSE
      AND (
        o.last_storage_notification_at IS NULL
        OR o.last_storage_notification_at < $1
      )
  `, [fiveDaysAgo.toISOString()]);

  console.log(`[TRACKING] ${result.rows.length} orders need storage reminders`);

  for (const order of result.rows) {
    const now = new Date();
    const deadline = order.storage_deadline ? new Date(order.storage_deadline) : null;

    if (!deadline) continue;

    const daysLeft = Math.max(0, Math.ceil((deadline - now) / (24 * 60 * 60 * 1000)));

    await pool.query(`
      UPDATE orders SET last_storage_notification_at = NOW(), updated_at = NOW() WHERE id = $1
    `, [order.id]);

    const providerName = getProviderName(order.delivery_type);
    const orderLink = `${process.env.APP_URL || ''}/order?id=${order.id}`;

    await notifyUser(order.user_id, NotificationType.STORAGE_PICKUP_REMINDER, {
      orderId: order.id,
      daysLeft,
      providerName
    }, orderLink);

    await new Promise(resolve => setTimeout(resolve, 300));
  }

  return result.rows.length;
}

// ── Main handler ─────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return error(res, 'Method not allowed', 405);
  }

  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization;
  const isVercelCron = req.headers['x-vercel-signature'];
  const hasValidSecret = cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isVercelCron && !hasValidSecret && process.env.NODE_ENV === 'production') {
    return unauthorized(res, 'Invalid cron authorization');
  }

  console.log('[CRON] Starting tracking update job...');

  try {
    const storageSettings = await getStorageSettings();

    // Get all shipped orders that need tracking updates
    const ordersResult = await pool.query(`
      SELECT o.id, o.tracking_number, o.delivery_type, o.last_tracking_update,
             o.user_id, o.delivery_cost, o.arrived_at_point_at, o.arrival_notified,
             o.returned_to_sender_at, o.storage_deadline
      FROM orders o
      WHERE o.status = 'shipped'
        AND o.tracking_number IS NOT NULL
        AND o.tracking_number != ''
        AND (
          o.last_tracking_update IS NULL
          OR o.last_tracking_update < NOW() - INTERVAL '4 hours'
        )
      ORDER BY o.last_tracking_update NULLS FIRST
      LIMIT 50
    `);

    console.log(`[CRON] Found ${ordersResult.rows.length} orders to update`);

    const results = {
      total: ordersResult.rows.length,
      updated: 0,
      delivered: 0,
      arrived_at_point: 0,
      returned: 0,
      reminders_sent: 0,
      failed: 0
    };

    for (const order of ordersResult.rows) {
      let provider = 'pochta';
      if (order.delivery_type && order.delivery_type.includes('cdek')) {
        provider = 'cdek';
      }

      let trackingInfo = null;
      if (provider === 'cdek') {
        trackingInfo = await fetchCdekTracking(order.tracking_number);
      } else {
        trackingInfo = await fetchPochtaTracking(order.tracking_number);
      }

      if (!trackingInfo) {
        results.failed++;
        await new Promise(resolve => setTimeout(resolve, 500));
        continue;
      }

      const client = await pool.connect();
      try {
        const updated = await updateOrderTracking(client, order.id, trackingInfo);
        if (updated) {
          results.updated++;

          if (trackingInfo.is_delivered) {
            results.delivered++;
          } else if (trackingInfo.is_returned && !order.returned_to_sender_at) {
            await handleReturnedToSender(order);
            results.returned++;
          } else if (trackingInfo.is_arrived_at_point && !order.arrival_notified) {
            await handleArrivedAtPoint(order, storageSettings);
            results.arrived_at_point++;
          }
        } else {
          results.failed++;
        }
      } finally {
        client.release();
      }

      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Send 5-day storage reminders independently of tracking updates
    results.reminders_sent = await sendStorageReminders();

    console.log(`[CRON] Tracking update completed:`, results);

    return success(res, {
      message: 'Tracking update completed',
      results
    });

  } catch (err) {
    console.error('[CRON] Error in tracking update job:', err);
    return error(res, 'Failed to update tracking', 500);
  }
};

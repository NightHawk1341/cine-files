/**
 * Create Shipment for Order
 * POST /api/orders/create-shipment
 *
 * Creates a shipment with CDEK or Pochta (via ApiShip)
 */

const { getPool } = require('../../lib/db');
const { success, error, badRequest, unauthorized, notFound, methodNotAllowed } = require('../../server/utils/response-helpers');
const shippingService = require('../../server/services/shipping');

const pool = getPool();

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST']);
  }

  // Require authentication
  if (!req.userId) {
    return unauthorized(res, 'Authentication required');
  }

  const {
    order_id,
    parcel_id,
    provider,       // 'cdek' or 'pochta'
    service_code,   // Tariff/service code
    pickup_point    // For CDEK PVZ delivery
  } = req.body;

  if (!order_id) {
    return badRequest(res, 'order_id is required');
  }

  if (!provider || !['cdek', 'pochta'].includes(provider)) {
    return badRequest(res, 'provider must be "cdek" or "pochta"');
  }

  const client = await pool.connect();

  try {
    // Get order with address
    const orderResult = await client.query(`
      SELECT o.*, oa.surname, oa.name, oa.phone, oa.postal_index, oa.address,
             u.email, u.telegram_id
      FROM orders o
      JOIN order_addresses oa ON o.id = oa.order_id
      JOIN users u ON o.user_id = u.id
      WHERE o.id = $1 AND o.is_deleted = false
    `, [order_id]);

    if (orderResult.rows.length === 0) {
      return notFound(res, 'Order not found');
    }

    const order = orderResult.rows[0];

    // Get parcel info
    let parcel;
    if (parcel_id) {
      const parcelResult = await client.query(`
        SELECT * FROM order_parcels WHERE id = $1 AND order_id = $2
      `, [parcel_id, order_id]);

      if (parcelResult.rows.length === 0) {
        return notFound(res, 'Parcel not found');
      }

      parcel = parcelResult.rows[0];
    } else {
      // Get first pending parcel
      const parcelResult = await client.query(`
        SELECT * FROM order_parcels
        WHERE order_id = $1 AND status = 'pending'
        ORDER BY created_at ASC
        LIMIT 1
      `, [order_id]);

      if (parcelResult.rows.length === 0) {
        // Calculate parcels first
        return badRequest(res, 'No pending parcels. Calculate parcels first.');
      }

      parcel = parcelResult.rows[0];
    }

    // Get order items for this parcel
    const itemsResult = await client.query(`
      SELECT oi.title, oi.quantity, oi.price_at_purchase
      FROM order_parcel_items opi
      JOIN order_items oi ON opi.order_item_id = oi.id
      WHERE opi.order_parcel_id = $1
    `, [parcel.id]);

    // Prepare shipment data
    const shipmentData = {
      order_id: String(order_id),
      recipient: {
        name: `${order.surname} ${order.name}`.trim(),
        phone: order.phone,
        email: order.email,
        postal_code: order.postal_index,
        city: extractCity(order.address),
        address: order.address
      },
      parcel: {
        weight: parcel.total_weight,
        length: parcel.length_cm,
        width: parcel.width_cm,
        height: parcel.height_cm,
        items: itemsResult.rows.map(item => ({
          name: item.title,
          quantity: item.quantity,
          price: item.price_at_purchase
        }))
      },
      service_code,
      pickup_point
    };

    // Create shipment via appropriate provider
    let result;
    if (provider === 'cdek') {
      result = await createCdekShipment(shipmentData);
    } else {
      result = await createPochtaShipment(shipmentData);
    }

    if (!result.success) {
      return error(res, result.error || 'Failed to create shipment', 400);
    }

    // Update parcel with tracking info
    await client.query(`
      UPDATE order_parcels
      SET status = 'created',
          tracking_number = $1,
          provider = $2,
          provider_order_id = $3,
          updated_at = NOW()
      WHERE id = $4
    `, [result.tracking_number, provider, result.order_id, parcel.id]);

    // Update order tracking number (use first parcel's tracking)
    if (!order.tracking_number) {
      await client.query(`
        UPDATE orders
        SET tracking_number = $1,
            updated_at = NOW()
        WHERE id = $2
      `, [result.tracking_number, order_id]);
    }

    return success(res, {
      parcel_id: parcel.id,
      tracking_number: result.tracking_number,
      provider_order_id: result.order_id,
      provider,
      label_url: result.label_url
    });

  } catch (err) {
    console.error('Error creating shipment:', err);
    return error(res, 'Failed to create shipment: ' + err.message, 500);
  } finally {
    client.release();
  }
};

/**
 * Extract city from full address
 */
function extractCity(address) {
  if (!address) return '';

  // Try to extract city (usually first part before comma)
  const parts = address.split(',');
  if (parts.length > 0) {
    const firstPart = parts[0].trim();
    // Check if it looks like a city (starts with г. or is a known format)
    if (firstPart.startsWith('г.') || firstPart.startsWith('г ')) {
      return firstPart.replace(/^г\.?\s*/, '');
    }
    return firstPart;
  }

  return address;
}

/**
 * Create shipment via CDEK
 */
async function createCdekShipment(data) {
  const cdek = require('../../server/services/shipping/cdek');

  try {
    const credentials = await cdek.getCredentials(pool);

    const result = await cdek.createOrder({
      tariff_code: parseInt(data.service_code) || 136, // Default: PVZ-PVZ
      recipient: {
        name: data.recipient.name,
        phones: [{ number: data.recipient.phone }],
        email: data.recipient.email
      },
      from_location: {
        postal_code: process.env.SENDER_POSTAL_CODE || '344000',
        city: process.env.SENDER_CITY || 'Ростов-на-Дону',
        address: process.env.SENDER_ADDRESS || 'ул. Пушкинская, 1'
      },
      to_location: data.pickup_point
        ? { code: data.pickup_point }
        : {
            postal_code: data.recipient.postal_code,
            city: data.recipient.city,
            address: data.recipient.address
          },
      packages: [{
        number: `pkg-${data.order_id}`,
        weight: data.parcel.weight,
        length: data.parcel.length,
        width: data.parcel.width,
        height: data.parcel.height,
        items: data.parcel.items.map((item, idx) => ({
          name: item.name,
          ware_key: `item-${idx}`,
          payment: { value: 0 }, // Already paid
          cost: item.price,
          amount: item.quantity,
          weight: Math.round((data.parcel.weight / data.parcel.items.length))
        }))
      }],
      comment: `Заказ #${data.order_id}`
    }, credentials);

    return {
      success: true,
      order_id: result.order_id || result.uuid,
      tracking_number: result.cdek_number || result.order_id,
      label_url: result.print_url
    };

  } catch (err) {
    console.error('CDEK shipment error:', err);
    return {
      success: false,
      error: err.message
    };
  }
}

/**
 * Create shipment via Pochta (ApiShip)
 */
async function createPochtaShipment(data) {
  const apiship = require('../../server/services/shipping/apiship');

  try {
    const credentials = await apiship.getCredentials(pool);

    const result = await apiship.createOrder({
      providerKey: 'russianpost',
      tariff_id: data.service_code,
      delivery_type: 1, // Delivery to address
      pickup_type: 1,   // Pickup from warehouse
      recipient: {
        name: data.recipient.name,
        phone: data.recipient.phone,
        email: data.recipient.email
      },
      recipient_address: {
        postal_code: data.recipient.postal_code,
        city: data.recipient.city,
        address_string: data.recipient.address
      },
      sender: {
        name: process.env.SENDER_NAME || 'TR/BUTE',
        phone: process.env.SENDER_PHONE || '+79001234567',
        email: process.env.SENDER_EMAIL
      },
      sender_address: {
        postal_code: process.env.SENDER_POSTAL_CODE || '344000',
        city: process.env.SENDER_CITY || 'Ростов-на-Дону',
        address_string: process.env.SENDER_ADDRESS || 'ул. Пушкинская, 1'
      },
      places: [{
        weight: data.parcel.weight,
        length: data.parcel.length,
        width: data.parcel.width,
        height: data.parcel.height,
        items: data.parcel.items.map(item => ({
          articul: 'POSTER',
          name: item.name,
          count: item.quantity,
          price: item.price
        }))
      }],
      comment: `Заказ #${data.order_id}`
    }, credentials);

    return {
      success: true,
      order_id: result.order_id,
      tracking_number: result.tracking_number || result.barcode,
      label_url: result.label_url
    };

  } catch (err) {
    console.error('Pochta shipment error:', err);
    return {
      success: false,
      error: err.message
    };
  }
}

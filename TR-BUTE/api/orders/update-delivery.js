/**
 * Update Order Delivery and Address Information
 * Updates delivery info, status in orders table
 * Updates address fields in order_addresses table
 * POST /api/orders/update-delivery
 */

const { getPool } = require('../../lib/db');
const { success, error, badRequest, notFound, methodNotAllowed } = require('../../server/utils/response-helpers');
const pool = getPool();
const config = require('../../lib/config');
const { VALID_STATUSES, VALID_DELIVERY_TYPES } = require('../../server/utils/order-constants');
const { sendNotification } = require('../../lib/notifications');

/**
 * Main handler
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST']);
  }

  const client = await pool.connect();

  try {
    const {
      order_id,
      status,
      delivery_cost,
      shipment_date,
      delivery_timeframe,
      delivery_notes,
      delivery_type,
      address_surname,
      address_name,
      address_phone,
      address_postal_index,
      address_address,
      address_comment,
      address_pvz_code,
      address_pvz_address
    } = req.body;

    // Validate input
    if (!order_id) {
      return badRequest(res, 'order_id is required');
    }

    // Validate status if provided
    if (status && !VALID_STATUSES.includes(status)) {
      return badRequest(res, 'Invalid status', { valid_statuses: VALID_STATUSES
      });
    }

    // Validate delivery_type if provided
    if (delivery_type && !VALID_DELIVERY_TYPES.includes(delivery_type)) {
      return badRequest(res, 'Invalid delivery_type', { valid_types: VALID_DELIVERY_TYPES });
    }

    // Fetch current order to check status
    const currentOrderResult = await pool.query(
      'SELECT status, user_id, total_price FROM orders WHERE id = $1',
      [order_id]
    );

    if (currentOrderResult.rows.length === 0) {
      return notFound(res, 'Order');
    }

    const currentOrder = currentOrderResult.rows[0];
    const currentStatus = currentOrder.status;

    // Auto-transition to 'awaiting_payment' when admin fills delivery cost on an 'awaiting_calculation' order.
    const isFillingDeliveryDetails = delivery_cost !== undefined ||
                                     delivery_timeframe !== undefined ||
                                     shipment_date !== undefined;

    let shouldAutoUpdateStatus = false;
    let autoUpdatedStatus = null;

    if ((currentStatus === 'awaiting_calculation' || currentStatus === 'created') && isFillingDeliveryDetails && status === undefined) {
      shouldAutoUpdateStatus = true;
      autoUpdatedStatus = 'awaiting_payment';
    }

    await client.query('BEGIN');

    // Update orders table
    const orderUpdates = [];
    const orderValues = [];
    let orderParamCount = 1;

    // Use auto-updated status if applicable, otherwise use provided status
    const finalStatus = shouldAutoUpdateStatus ? autoUpdatedStatus : status;

    if (finalStatus !== undefined) {
      orderUpdates.push(`status = $${orderParamCount++}`);
      orderValues.push(finalStatus);
    }

    if (delivery_cost !== undefined) {
      orderUpdates.push(`delivery_cost = $${orderParamCount++}`);
      orderValues.push(delivery_cost);
    }

    if (shipment_date !== undefined) {
      orderUpdates.push(`shipment_date = $${orderParamCount++}`);
      orderValues.push(shipment_date || null);
    }

    if (delivery_timeframe !== undefined) {
      orderUpdates.push(`delivery_timeframe = $${orderParamCount++}`);
      orderValues.push(delivery_timeframe || null);
    }

    if (delivery_notes !== undefined) {
      orderUpdates.push(`delivery_notes = $${orderParamCount++}`);
      orderValues.push(delivery_notes || null);
    }

    if (delivery_type !== undefined) {
      orderUpdates.push(`delivery_type = $${orderParamCount++}`);
      orderValues.push(delivery_type);
    }

    // Always update updated_at
    orderUpdates.push(`updated_at = NOW()`);

    if (orderUpdates.length > 1) {
      // Add order_id as last parameter
      orderValues.push(order_id);

      // Execute orders table update
      const orderUpdateQuery = `
        UPDATE orders
        SET ${orderUpdates.join(', ')}
        WHERE id = $${orderParamCount}
        RETURNING *
      `;

      const orderResult = await client.query(orderUpdateQuery, orderValues);

      if (orderResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Order not found' });
      }
    }

    // Update order_addresses table if address fields provided
    const hasAddressUpdates = address_surname !== undefined ||
                              address_name !== undefined ||
                              address_phone !== undefined ||
                              address_postal_index !== undefined ||
                              address_address !== undefined ||
                              address_comment !== undefined ||
                              address_pvz_code !== undefined ||
                              address_pvz_address !== undefined;

    if (hasAddressUpdates) {
      const addressUpdates = [];
      const addressValues = [];
      let addressParamCount = 1;

      if (address_surname !== undefined) {
        addressUpdates.push(`surname = $${addressParamCount++}`);
        addressValues.push(address_surname || '');
      }

      if (address_name !== undefined) {
        addressUpdates.push(`name = $${addressParamCount++}`);
        addressValues.push(address_name || '');
      }

      if (address_phone !== undefined) {
        addressUpdates.push(`phone = $${addressParamCount++}`);
        addressValues.push(address_phone || '');
      }

      if (address_postal_index !== undefined) {
        addressUpdates.push(`postal_index = $${addressParamCount++}`);
        addressValues.push(address_postal_index || '');
      }

      if (address_address !== undefined) {
        addressUpdates.push(`address = $${addressParamCount++}`);
        addressValues.push(address_address || '');
      }

      if (address_comment !== undefined) {
        addressUpdates.push(`comment = $${addressParamCount++}`);
        addressValues.push(address_comment || null);
      }

      if (address_pvz_code !== undefined) {
        addressUpdates.push(`pvz_code = $${addressParamCount++}`);
        addressValues.push(address_pvz_code || null);
      }

      if (address_pvz_address !== undefined) {
        addressUpdates.push(`pvz_address = $${addressParamCount++}`);
        addressValues.push(address_pvz_address || null);
      }

      if (addressUpdates.length > 0) {
        addressValues.push(order_id);

        // Try to update existing address
        const addressUpdateQuery = `
          UPDATE order_addresses
          SET ${addressUpdates.join(', ')}
          WHERE order_id = $${addressParamCount}
        `;

        const addressResult = await client.query(addressUpdateQuery, addressValues);

        // If no rows updated, create new address record
        if (addressResult.rowCount === 0) {
          await client.query(`
            INSERT INTO order_addresses (
              order_id,
              surname,
              name,
              phone,
              postal_index,
              address,
              comment
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          `, [
            order_id,
            address_surname || '',
            address_name || '',
            address_phone || '',
            address_postal_index || '',
            address_address || '',
            address_comment || null
          ]);
        }
      }
    }

    await client.query('COMMIT');

    // Save manual delivery estimate if delivery cost was set
    if (delivery_cost !== undefined && delivery_cost > 0) {
      try {
        // Get order address for postal code and city info
        const addressResult = await pool.query(
          'SELECT postal_index, address FROM order_addresses WHERE order_id = $1',
          [order_id]
        );

        // Get order items for weight calculation
        const itemsResult = await pool.query(`
          SELECT oi.quantity, pp.weight_grams
          FROM order_items oi
          LEFT JOIN products p ON oi.product_id = p.id
          LEFT JOIN product_prices pp ON p.id = pp.id
          WHERE oi.order_id = $1 AND oi.deleted_by_admin = false
        `, [order_id]);

        const postalCode = addressResult.rows[0]?.postal_index;
        const addressStr = addressResult.rows[0]?.address || '';
        const totalWeight = itemsResult.rows.reduce((sum, item) => {
          return sum + ((item.weight_grams || 200) * (item.quantity || 1));
        }, 0);

        // Extract city from address (typically first meaningful part before comma)
        let city = null;
        if (addressStr) {
          // Address usually formatted as "город, улица, дом" or "область, город, улица"
          const parts = addressStr.split(',').map(p => p.trim()).filter(Boolean);
          if (parts.length > 0) {
            city = parts[0];
          }
        }

        // Parse delivery timeframe into days
        let estimatedDaysMin = null;
        let estimatedDaysMax = null;
        if (delivery_timeframe) {
          const match = delivery_timeframe.match(/(\d+)\s*[-–]\s*(\d+)/);
          if (match) {
            estimatedDaysMin = parseInt(match[1]);
            estimatedDaysMax = parseInt(match[2]);
          } else {
            const singleMatch = delivery_timeframe.match(/(\d+)/);
            if (singleMatch) {
              estimatedDaysMin = parseInt(singleMatch[1]);
              estimatedDaysMax = estimatedDaysMin;
            }
          }
        }

        if (postalCode) {
          await pool.query(`
            INSERT INTO delivery_estimates (
              postal_code, postal_prefix, city,
              weight_grams, delivery_type,
              total_price, source, order_id,
              estimated_days_min, estimated_days_max
            ) VALUES ($1, $2, $3, $4, $5, $6, 'manual', $7, $8, $9)
          `, [
            postalCode,
            postalCode.substring(0, 3),
            city,
            totalWeight,
            delivery_type || 'pochta',
            delivery_cost,
            order_id,
            estimatedDaysMin,
            estimatedDaysMax
          ]);
        }
      } catch (estimateError) {
        console.error('Failed to save delivery estimate:', estimateError.message);
        // Don't fail the request for estimate save failure
      }
    }

    // Send notification when admin sets delivery cost and order moves to awaiting_payment
    if (shouldAutoUpdateStatus) {
      const finalDeliveryCost = delivery_cost !== undefined ? Number(delivery_cost) : 0;
      const totalWithDelivery = Number(currentOrder.total_price) + finalDeliveryCost;

      try {
        const userResult = await pool.query(
          'SELECT telegram_id, vk_id, max_id, email, username, login_method FROM users WHERE id = $1',
          [currentOrder.user_id]
        );

        if (userResult.rows.length > 0) {
          const user = userResult.rows[0];
          let userEmail = user.email;
          if (!userEmail && user.login_method === 'yandex' && user.username) {
            userEmail = `${user.username}@yandex.ru`;
          }

          const title = 'Стоимость доставки рассчитана';
          const deliveryLine = finalDeliveryCost ? `\nСтоимость доставки: ${finalDeliveryCost} руб.` : '';
          const message = `Заказ #${order_id}

Мы рассчитали стоимость доставки для вашего заказа.${deliveryLine}

Итого к оплате: ${totalWithDelivery} руб.

Перейдите на страницу заказа, чтобы оплатить.`;

          const link = `${config.appUrl}/order?id=${order_id}`;

          await sendNotification({
            userId: currentOrder.user_id,
            title,
            message,
            link,
            linkText: 'Оплатить заказ',
            userTelegramId: user.telegram_id,
            userVkId: user.vk_id,
            userMaxId: user.max_id,
            userEmail: userEmail
          });

          console.log(`Delivery calculated notification sent for order ${order_id}`);
        }
      } catch (error) {
        console.error('Failed to send delivery notification:', error.message);
      }
    }

    // Return success
    return success(res, {
      message: 'Order delivery information updated successfully',
      order_id: order_id,
      status_auto_updated: shouldAutoUpdateStatus,
      new_status: shouldAutoUpdateStatus ? autoUpdatedStatus : (status || currentStatus)
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error updating order delivery info:', err);
    return error(res, 'Failed to update order', 500);
  } finally {
    client.release();
  }
};

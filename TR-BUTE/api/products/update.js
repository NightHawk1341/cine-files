/**
 * Update Product Endpoint
 * Updates an existing product
 * POST /api/products/update
 */

const { getPool } = require('../../lib/db');
const { success, error, badRequest, notFound, methodNotAllowed, forbidden } = require('../../server/utils/response-helpers');
const { cacheDelete } = require('../../lib/cache');
const pool = getPool();
const config = require('../../lib/config');
const axios = require('axios');
const { getRoleFromRequest, hasPermission } = require('../../server/utils/role-check');

/**
 * Main handler
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST']);
  }

  try {
    const {
      id,
      title,
      alt,
      keywords,
      ip_names,
      status,
      genre,
      type,
      price,
      description,
      image,
      triptych,
      discount,
      old_price,
      release_date,
      created_at,
      slug: customSlug,
      development_time,
      hide_development_time,
      quality,
      author,
      restored,
      vk_market_url
    } = req.body;

    // Validate required fields
    if (!id) {
      return badRequest(res, 'Product ID is required');
    }

    // Check if product exists and get current data (including current status)
    const checkResult = await pool.query(
      'SELECT id, title, triptych, type, status FROM products WHERE id = $1',
      [id]
    );

    if (checkResult.rows.length === 0) {
      return notFound(res, 'Product not found');
    }

    const currentProduct = checkResult.rows[0];
    const oldStatus = currentProduct.status;

    // Build dynamic update query
    const updates = [];
    const values = [];
    let paramCount = 1;

    // Handle slug updates (manual only)
    if (customSlug !== undefined) {
      // Validate slug uniqueness if provided
      if (customSlug) {
        const slugCheck = await pool.query(
          'SELECT id FROM products WHERE slug = $1 AND id != $2',
          [customSlug, id]
        );
        if (slugCheck.rows.length > 0) {
          return badRequest(res, 'Slug already exists. Please choose a different slug.');
        }
      }

      updates.push(`slug = $${paramCount++}`);
      values.push(customSlug || null);
    }

    if (title !== undefined) {
      updates.push(`title = $${paramCount++}`);
      values.push(title);
    }

    if (alt !== undefined) {
      updates.push(`alt = $${paramCount++}`);
      values.push(alt);
    }

    if (keywords !== undefined) {
      updates.push(`key_word = $${paramCount++}`);
      values.push(keywords);
    }

    if (ip_names !== undefined) {
      updates.push(`ip_names = $${paramCount++}`);
      values.push(ip_names || null);
    }

    if (status !== undefined) {
      // Check if editor is trying to delete (set status to not_for_sale)
      const { isEditor } = getRoleFromRequest(req);
      if (isEditor && status === 'not_for_sale') {
        const canDelete = await hasPermission(req, 'products', 'canDelete');
        if (!canDelete) {
          return forbidden(res, 'Editors cannot delete products (set status to not_for_sale)');
        }
      }

      updates.push(`status = $${paramCount++}`);
      values.push(status);
    }

    if (genre !== undefined) {
      updates.push(`genre = $${paramCount++}`);
      values.push(genre);
    }

    if (type !== undefined) {
      updates.push(`type = $${paramCount++}`);
      values.push(type);
    }

    if (price !== undefined) {
      updates.push(`price = $${paramCount++}`);
      values.push(price);
    }

    if (description !== undefined) {
      updates.push(`description = $${paramCount++}`);
      values.push(description);
    }

    if (image !== undefined) {
      updates.push(`image = $${paramCount++}`);
      values.push(image);
    }

    if (triptych !== undefined) {
      updates.push(`triptych = $${paramCount++}`);
      values.push(triptych);
    }

    if (discount !== undefined) {
      updates.push(`discount = $${paramCount++}`);
      values.push(discount);
    }

    if (old_price !== undefined) {
      updates.push(`old_price = $${paramCount++}`);
      values.push(old_price || null);
    }

    if (release_date !== undefined) {
      updates.push(`release_date = $${paramCount++}`);
      values.push(release_date || null);
    }

    if (created_at !== undefined) {
      updates.push(`created_at = $${paramCount++}`);
      values.push(created_at || null);
    }

    if (development_time !== undefined) {
      updates.push(`development_time = $${paramCount++}`);
      values.push(development_time || null);
    }

    if (hide_development_time !== undefined) {
      updates.push(`hide_development_time = $${paramCount++}`);
      values.push(Boolean(hide_development_time));
    }

    if (quality !== undefined) {
      updates.push(`quality = $${paramCount++}`);
      values.push(quality || null);
    }

    if (author !== undefined) {
      updates.push(`author = $${paramCount++}`);
      values.push(author || null);
    }

    if (restored !== undefined) {
      updates.push(`restored = $${paramCount++}`);
      values.push(Boolean(restored));
    }

    if (vk_market_url !== undefined) {
      updates.push(`vk_market_url = $${paramCount++}`);
      values.push(vk_market_url || null);
    }

    if (updates.length === 0) {
      return badRequest(res, 'No fields to update');
    }

    // Add ID as last parameter
    values.push(id);

    // Execute update
    const updateQuery = `
      UPDATE products
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const updateResult = await pool.query(updateQuery, values);
    const product = updateResult.rows[0];

    // Auto-send release notifications if status changed from coming_soon to available
    const statusChanged = status !== undefined && oldStatus !== status;
    const becameAvailable = oldStatus === 'coming_soon' && status === 'available';

    if (statusChanged && becameAvailable) {
      // Send notifications asynchronously (non-blocking)
      setImmediate(async () => {
        try {
          console.log(`Product ${id} became available, sending release notifications...`);

          // Get all users subscribed to this product
          const subscriptionsResult = await pool.query(`
            SELECT prn.id, prn.user_id, u.telegram_id, u.email, u.notification_method
            FROM product_release_notifications prn
            JOIN users u ON prn.user_id = u.id
            WHERE prn.product_id = $1 AND prn.notified = false
          `, [id]);

          const subscriptions = subscriptionsResult.rows;

          if (subscriptions.length > 0) {
            const BOT_TOKEN = config.telegram.userBotToken;
            const APP_URL = config.appUrl;

            if (BOT_TOKEN && APP_URL) {
              // Construct product URL
              const productUrl = product.slug
                ? `${APP_URL}/product?id=${product.slug}`
                : `${APP_URL}/product?id=${id}`;

              const message = `
🎉 <b>Товар теперь доступен!</b>

<b>${product.title}</b>

Товар, на который вы подписались, теперь в продаже!

Вы можете просмотреть и купить его прямо сейчас.
              `.trim();

              // Send to all subscribed users
              let successCount = 0;
              for (const sub of subscriptions) {
                const notificationMethod = sub.notification_method || 'telegram';
                let notificationSent = false;

                // Send via Telegram if user prefers it and has telegram_id
                if ((notificationMethod === 'telegram' || notificationMethod === 'both') && sub.telegram_id && BOT_TOKEN) {
                  try {
                    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                      chat_id: sub.telegram_id,
                      text: message,
                      parse_mode: 'HTML',
                      reply_markup: {
                        inline_keyboard: [
                          [{
                            text: '🛍️ Открыть товар',
                            web_app: { url: productUrl }
                          }]
                        ]
                      }
                    });
                    notificationSent = true;
                  } catch (error) {
                    console.error(`Failed to send Telegram notification to user ${sub.user_id}:`, error.message);
                  }
                }

                // Send via Email if user prefers it and has email
                if ((notificationMethod === 'email' || notificationMethod === 'both') && sub.email) {
                  try {
                    await axios.post(`${APP_URL}/api/notifications/send`, {
                      user_id: sub.user_id,
                      type: 'product_release',
                      data: {
                        product_title: product.title,
                        product_url: productUrl,
                        product_image: product.image
                      }
                    });
                    notificationSent = true;
                  } catch (error) {
                    console.error(`Failed to send email notification to user ${sub.user_id}:`, error.message);
                  }
                }

                // Mark as notified if at least one notification was sent
                if (notificationSent) {
                  await pool.query(
                    'UPDATE product_release_notifications SET notified = true WHERE id = $1',
                    [sub.id]
                  );
                  successCount++;
                }
              }

              console.log(`Sent ${successCount} automatic release notifications for product ${id} (${product.title})`);
            }
          }
        } catch (error) {
          console.error('Error sending automatic release notifications:', error.message);
        }
      });
    }

    // Invalidate product-related caches
    cacheDelete('products:*').catch(() => {});
    cacheDelete('catalogs:*').catch(() => {});
    cacheDelete('recs:*').catch(() => {});
    
    return success(res, {
      message: 'Product updated successfully',
      product: product,
      notifications_triggered: statusChanged && becameAvailable
    });

  } catch (err) {
    console.error('Error updating product:', err);
    return error(res, 'Failed to update product', 500);
  }
};

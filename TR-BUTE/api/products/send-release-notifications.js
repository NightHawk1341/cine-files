/**
 * Send Release Notifications
 * POST /api/products/send-release-notifications
 *
 * Sends Telegram notifications to all users subscribed to a product release
 * Called when a product status changes from 'coming_soon' to 'available'
 */

const crypto = require('crypto');
const { getPool } = require('../../lib/db');
const { success, error, badRequest, notFound, forbidden, methodNotAllowed } = require('../../server/utils/response-helpers');
const pool = getPool();
const config = require('../../lib/config');
const { sendNotification } = require('../../lib/notifications');

/**
 * Timing-safe comparison of API keys to prevent timing attacks
 */
function safeCompareApiKey(providedKey, expectedKey) {
  if (!providedKey || !expectedKey) return false;
  const a = Buffer.from(providedKey);
  const b = Buffer.from(expectedKey);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Send individual notification to user
 */
async function sendReleaseNotification(userId, user, product, appUrl) {
  const title = '🎉 Товар теперь доступен!';
  const message = `${product.title}

Товар, на который вы подписались, теперь в продаже!

Вы можете просмотреть и купить его прямо сейчас.`;

  try {
    const sent = await sendNotification({
      userId,
      title,
      message,
      link: appUrl,
      linkText: '🛍️ Открыть товар',
      userTelegramId: user.telegram_id,
      userVkId: user.vk_id,
      userMaxId: user.max_id,
      userEmail: user.email
    });

    return sent;
  } catch (error) {
    console.error(`Failed to send notification to user ${userId}:`, error.message);
    return false;
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST']);
  }

  try {
    const { product_id, admin_key } = req.body;

    // Validate admin access using timing-safe comparison to prevent timing attacks
    if (!safeCompareApiKey(admin_key, config.admin.apiKey)) {
      return forbidden(res, 'Unauthorized');
    }

    if (!product_id) {
      return badRequest(res, 'product_id is required');
    }

    // Get product details
    const productResult = await pool.query(
      'SELECT id, title, slug, status FROM products WHERE id = $1',
      [product_id]
    );

    if (productResult.rows.length === 0) {
      return notFound(res, 'Product not found');
    }

    const product = productResult.rows[0];

    // Get all users subscribed to this product who haven't been notified yet
    const subscriptionsResult = await pool.query(`
      SELECT prn.id, prn.user_id, u.telegram_id, u.vk_id, u.max_id, u.email, u.username, u.login_method
      FROM product_release_notifications prn
      JOIN users u ON prn.user_id = u.id
      WHERE prn.product_id = $1 AND prn.notified = false
    `, [product_id]);

    const subscriptions = subscriptionsResult.rows;

    if (subscriptions.length === 0) {
      return success(res, {
        message: 'No users to notify',
        notified_count: 0
      });
    }

    const APP_URL = config.appUrl;

    if (!APP_URL) {
      console.error('APP_URL not configured');
      return error(res, 'App configuration missing', 500);
    }

    // Send notifications to all subscribed users
    let successCount = 0;
    const notificationPromises = subscriptions.map(async (sub) => {
      // For Yandex users, construct email from username if email is not set
      let userEmail = sub.email;
      if (!userEmail && sub.login_method === 'yandex' && sub.username) {
        userEmail = `${sub.username}@yandex.ru`;
        console.log(`Constructed Yandex email for user ${sub.user_id}: ${userEmail}`);
      }

      const user = {
        telegram_id: sub.telegram_id,
        vk_id: sub.vk_id,
        email: userEmail
      };

      const productUrl = `${APP_URL}/product/${product.slug || product.id}`;
      const sent = await sendReleaseNotification(sub.user_id, user, product, productUrl);

      if (sent) {
        // Mark as notified in database
        await pool.query(
          'UPDATE product_release_notifications SET notified = true WHERE id = $1',
          [sub.id]
        );
        successCount++;
      }
    });

    // Wait for all notifications to complete
    await Promise.all(notificationPromises);

    console.log(`Sent ${successCount} release notifications for product ${product_id} (${product.title})`);

    return success(res, {
      message: `Notifications sent to ${successCount} users`,
      notified_count: successCount,
      total_subscriptions: subscriptions.length
    });

  } catch (err) {
    console.error('Error sending release notifications:', err);
    return error(res, 'Failed to send notifications', 500);
  }
};

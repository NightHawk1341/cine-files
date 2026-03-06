/**
 * T-Bank Webhook Handler
 *
 * POST /api/payment/tbank/webhook
 *
 * Handles payment notifications from T-Bank:
 * - CONFIRMED: Payment successful
 * - REJECTED / AUTH_FAIL: Payment failed
 * - REFUNDED / PARTIAL_REFUNDED: Refund processed
 * - REVERSED: Payment reversed
 *
 * Documentation: https://developer.tbank.ru/eacq/intro/developer/notification
 */

const { getPool } = require('../../../lib/db');
const tbank = require('../../../server/services/payment/tbank');
const { sendNotification, sendAdminNotification, NotificationType } = require('../../../lib/notifications');
const { generateAndUploadCertificateImage } = require('../../../lib/certificate-image');
const axios = require('axios');
const config = require('../../../lib/config');

// On Vercel, lambdas are frozen immediately after res.send().
// waitUntil extends the function lifetime so async delivery completes.
let waitUntil;
try { ({ waitUntil } = require('@vercel/functions')); } catch { waitUntil = null; }

const pool = getPool();

/**
 * Generate a short, user-friendly certificate code: XXXX-XXXX
 * Uses characters that avoid confusion (no 0/O, 1/I/L)
 */
function generateCertificateCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let part1 = '';
  let part2 = '';
  for (let i = 0; i < 4; i++) {
    part1 += chars.charAt(Math.floor(Math.random() * chars.length));
    part2 += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${part1}-${part2}`;
}

/**
 * Check if user is an admin by telegram_id
 * Used to expect test price of 10 RUB for admin orders
 */
async function isUserAdmin(telegramId) {
  if (!telegramId) return false;
  try {
    const result = await pool.query(
      'SELECT id FROM admins WHERE telegram_id = $1',
      [telegramId]
    );
    return result.rows.length > 0;
  } catch (error) {
    console.error('[tbank/webhook] Error checking admin status:', error);
    return false;
  }
}

/**
 * T-Bank requires HTTP 200 with plain text "OK" body for successful processing.
 * Without this response, T-Bank retries hourly for 24h, then daily for 30 days.
 */
function respondOK(res) {
  res.status(200).type('text/plain').send('OK');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).type('text/plain').send('Method not allowed');
  }

  try {
    // Parse payload
    const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

    // Get credentials for token verification
    const credentials = tbank.getCredentials();
    const isProduction = process.env.NODE_ENV === 'production';

    // Verify notification token
    if (isProduction && !tbank.verifyNotificationToken(payload, credentials.password)) {
      console.error('[tbank/webhook] Invalid notification token');
      return respondOK(res); // Still respond OK to prevent retries for invalid requests
    }

    if (!isProduction && payload.Token) {
      // In dev, verify if token is present but don't reject if missing
      const isValid = tbank.verifyNotificationToken(payload, credentials.password);
      if (!isValid) {
        console.warn('[tbank/webhook] Token verification failed in dev mode (continuing anyway)');
      }
    }

    // Parse notification
    const notification = tbank.parseNotificationPayload(payload);

    console.log('[tbank/webhook] Received:', {
      paymentId: notification.paymentId,
      orderId: notification.orderId,
      amount: notification.amount,
      status: notification.status,
      success: notification.success
    });

    // Get order ID — T-Bank OrderId may include an attempt suffix (e.g. "42_2"),
    // so extract the base numeric order ID before the underscore
    const rawOrderId = notification.orderId;

    if (!rawOrderId) {
      console.error('[tbank/webhook] Missing order ID');
      return respondOK(res);
    }

    const orderId = rawOrderId.includes('_') ? rawOrderId.split('_')[0] : rawOrderId;

    // Fetch order
    const orderResult = await pool.query(`
      SELECT o.id, o.status, o.user_id, o.total_price, o.delivery_cost, o.packaging_cost,
             u.telegram_id, u.vk_id, u.max_id, u.email, u.username, u.login_method
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      WHERE o.id = $1 AND o.is_deleted = false
    `, [orderId]);

    if (orderResult.rows.length === 0) {
      console.error(`[tbank/webhook] Order not found: ${orderId}`);
      return respondOK(res);
    }

    const order = orderResult.rows[0];

    // Verify amount (with tolerance for rounding)
    // For admin orders, we expect 10 RUB test price
    const fullAmount = Number(order.total_price) + Number(order.delivery_cost || 0) + Number(order.packaging_cost || 0);
    const userIsAdmin = await isUserAdmin(order.telegram_id);
    const expectedAmount = userIsAdmin ? 10 : fullAmount;

    if (Math.abs(notification.amount - expectedAmount) > 1) {
      console.error(`[tbank/webhook] Amount mismatch: expected ${expectedAmount}${userIsAdmin ? ' (admin test price)' : ''}, got ${notification.amount}`);
      return respondOK(res);
    }

    if (userIsAdmin) {
      console.log(`[tbank/webhook] Admin payment detected for order ${order.id}, using test price of 10 RUB`);
    }

    // Handle based on status
    const status = notification.status;

    switch (status) {
      case tbank.PAYMENT_STATUSES.CONFIRMED:
        await handleConfirmed(order, notification, res);
        break;

      case tbank.PAYMENT_STATUSES.AUTHORIZED:
        // For one-stage payments this shouldn't happen, but handle gracefully
        await handleConfirmed(order, notification, res);
        break;

      case tbank.PAYMENT_STATUSES.REJECTED:
      case tbank.PAYMENT_STATUSES.AUTH_FAIL:
      case tbank.PAYMENT_STATUSES.CANCELED:
      case tbank.PAYMENT_STATUSES.DEADLINE_EXPIRED:
        await handleFailed(order, notification, res);
        break;

      case tbank.PAYMENT_STATUSES.REFUNDED:
      case tbank.PAYMENT_STATUSES.PARTIAL_REFUNDED:
      case tbank.PAYMENT_STATUSES.REVERSED:
        await handleRefunded(order, notification, res);
        break;

      default:
        console.log(`[tbank/webhook] Unhandled status: ${status}`);
        respondOK(res);
    }

  } catch (error) {
    console.error('[tbank/webhook] Error:', error);
    // Always respond OK to prevent retries on our errors
    respondOK(res);
  }
};

/**
 * Handle successful payment (CONFIRMED or AUTHORIZED)
 */
async function handleConfirmed(order, notification, res) {
  // Guard against webhook retries: any post-payment status means order was already processed
  const POST_PAYMENT_STATUSES = ['paid', 'confirmed', 'shipped', 'delivered', 'on_hold', 'refunded', 'refund_requested'];
  const alreadyPaid = POST_PAYMENT_STATUSES.includes(order.status);

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // If order wasn't already paid, mark it as paid and log the transaction
    if (!alreadyPaid) {
      await client.query(`
        UPDATE orders
        SET status = 'paid',
            payment_id = $1,
            payment_provider = 'tbank',
            updated_at = NOW()
        WHERE id = $2
      `, [notification.paymentId, order.id]);

      await client.query(`
        INSERT INTO payment_transactions (order_id, provider, transaction_id, amount, currency, status, provider_response)
        VALUES ($1, 'tbank', $2, $3, 'RUB', 'completed', $4)
      `, [order.id, notification.paymentId, notification.amount, JSON.stringify(notification.raw)]);
    }

    // Always check for any pending certs — they may still be unactivated if
    // check-status marked the order paid first (race condition between the two flows)
    const pendingCerts = await client.query(
      `SELECT id, template_id, recipient_name, amount FROM certificates WHERE purchase_order_id = $1 AND status = 'pending'`,
      [order.id]
    );

    // If order was already fully processed, nothing left to do
    if (alreadyPaid && pendingCerts.rows.length === 0) {
      await client.query('COMMIT');
      console.log(`[tbank/webhook] Order ${order.id} already fully processed (status: ${order.status})`);
      return respondOK(res);
    }

    const activatedCerts = [];
    for (const cert of pendingCerts.rows) {
      const code = generateCertificateCode();
      await client.query(
        `UPDATE certificates SET certificate_code = $1, status = 'paid', paid_at = NOW() WHERE id = $2`,
        [code, cert.id]
      );
      activatedCerts.push({ ...cert, certificate_code: code });
      console.log(`[tbank/webhook] Certificate #${cert.id} activated with code ${code}`);
    }

    await client.query('COMMIT');

    console.log(`[tbank/webhook] Order ${order.id} ${alreadyPaid ? 'cert-activated (was already paid)' : 'marked as paid'}`);

    // Determine if order is cert-only (needed for notification routing)
    const hasCerts = activatedCerts.length > 0;
    let isCertOnly = false;
    if (hasCerts) {
      try {
        const nonCertResult = await pool.query(
          `SELECT COUNT(*) FROM order_items WHERE order_id = $1 AND certificate_id IS NULL AND deleted_by_admin IS NOT TRUE`,
          [order.id]
        );
        isCertOnly = parseInt(nonCertResult.rows[0].count) === 0;
      } catch (err) {
        console.error('[tbank/webhook] Failed to check cert-only status:', err.message);
      }
    }

    // Post-payment async work
    // Admin notification: fire-and-forget immediately
    if (!alreadyPaid) {
      sendAdminPaymentNotification(order, notification).catch(err => {
        console.error('[tbank/webhook] Admin notification failed:', err);
      });
    }

    if (hasCerts) {
      // Cert orders: generate images first, then send combined user notification
      const postPaymentWork = async () => {
        const certResults = await generateCertificateImages(activatedCerts);
        await sendUserPaymentNotification(order, { certificates: certResults, isCertOnly });
        await sendCertImagesViaBot(certResults, order);
        if (isCertOnly) await updateCertOnlyOrderStatus(order.id, certResults);
        await alertAdminOnCertFailures(order.id, certResults, isCertOnly);
      };

      if (waitUntil) {
        waitUntil(postPaymentWork().catch(err => {
          console.error('[tbank/webhook] Certificate delivery error:', err);
        }));
        respondOK(res);
      } else {
        await postPaymentWork().catch(err => {
          console.error('[tbank/webhook] Certificate delivery error:', err);
        });
        respondOK(res);
      }
    } else {
      // Normal order: send standard payment notification
      if (!alreadyPaid) {
        sendUserPaymentNotification(order).catch(err => {
          console.error('[tbank/webhook] User notification error:', err);
        });
      }
      respondOK(res);
    }

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Handle failed payment
 */
async function handleFailed(order, notification, res) {
  console.log(`[tbank/webhook] Payment failed for order ${order.id}:`, {
    status: notification.status,
    errorCode: notification.errorCode
  });

  // Log failed transaction
  await pool.query(`
    INSERT INTO payment_transactions (order_id, provider, transaction_id, amount, currency, status, provider_response)
    VALUES ($1, 'tbank', $2, $3, 'RUB', 'failed', $4)
  `, [order.id, notification.paymentId, notification.amount, JSON.stringify(notification.raw)]);

  respondOK(res);
}

/**
 * Handle refund
 */
async function handleRefunded(order, notification, res) {
  console.log(`[tbank/webhook] Refund processed for order ${order.id}, status: ${notification.status}`);

  // Update order status
  await pool.query(`
    UPDATE orders
    SET status = 'refunded', updated_at = NOW()
    WHERE id = $1
  `, [order.id]);

  // Log refund transaction
  await pool.query(`
    INSERT INTO payment_transactions (order_id, provider, transaction_id, amount, currency, status, provider_response)
    VALUES ($1, 'tbank', $2, $3, 'RUB', 'refunded', $4)
  `, [order.id, notification.paymentId, notification.amount, JSON.stringify(notification.raw)]);

  respondOK(res);
}

/**
 * Send admin payment notification (fire-and-forget).
 */
async function sendAdminPaymentNotification(order, notification) {
  const APP_URL = process.env.APP_URL || 'https://buy-tribute.com';
  await sendAdminNotification({
    title: '💰 Оплата получена',
    message: `Заказ: #${order.id}\nСумма: ${notification.amount} RUB\nПользователь: ${order.username || 'ID ' + order.user_id}\nPaymentId: ${notification.paymentId}`,
    link: `${APP_URL}/admin?order=${order.id}`,
    linkText: 'Открыть заказ'
  });
}

/**
 * Send user payment notification. When certificates are present, includes cert codes
 * and image status in a single combined notification instead of separate messages.
 */
async function sendUserPaymentNotification(order, { certificates, isCertOnly } = {}) {
  const APP_URL = process.env.APP_URL || 'https://buy-tribute.com';
  try {
    await sendNotification({
      type: NotificationType.PAYMENT_RECEIVED,
      data: {
        orderId: order.id,
        certificates: certificates ? certificates.map(c => ({
          certificateCode: c.certificate_code,
          recipientName: c.recipient_name,
          certImageUrl: c.cert_image_url,
          amount: c.amount
        })) : undefined,
        isCertOnly
      },
      link: certificates ? `${APP_URL}/order/${order.id}` : `${APP_URL}/profile`,
      linkText: certificates ? 'Открыть заказ' : 'Открыть профиль',
      userTelegramId: order.telegram_id,
      userVkId: order.vk_id,
      userMaxId: order.max_id,
      userEmail: order.email
    });
  } catch (err) {
    console.error('[tbank/webhook] User notification error:', err);
  }
}

/**
 * Generate certificate images with 30s timeout per cert.
 * Returns array of cert objects with cert_image_url set (null if failed).
 */
async function generateCertificateImages(certs) {
  const IMAGE_TIMEOUT_MS = 30000;
  const results = [];
  for (const cert of certs) {
    try {
      const url = await Promise.race([
        generateAndUploadCertificateImage(cert, pool),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Image generation timed out')), IMAGE_TIMEOUT_MS))
      ]);
      results.push({ ...cert, cert_image_url: url });
      if (url) console.log(`[tbank/webhook] Certificate #${cert.id} image generated: ${url}`);
    } catch (err) {
      console.error(`[tbank/webhook] Failed to generate image for cert #${cert.id}:`, err.message);
      results.push({ ...cert, cert_image_url: null });
    }
  }
  return results;
}

/**
 * Send certificate images via Telegram/MAX bot (separate from the notification).
 * Email users already receive the image embedded in the notification email.
 */
async function sendCertImagesViaBot(certs, order) {
  for (const cert of certs) {
    if (!cert.cert_image_url) continue;

    if (order.telegram_id) {
      try {
        const botToken = config.auth.telegram.userBotToken;
        if (botToken) {
          await axios.post(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
            chat_id: order.telegram_id,
            photo: cert.cert_image_url,
            caption: `Сертификат на ${cert.amount} ₽ — код: ${cert.certificate_code}`
          });
          console.log(`[tbank/webhook] Cert photo sent to Telegram ${order.telegram_id}`);
        }
      } catch (err) {
        console.error(`[tbank/webhook] Failed to send cert photo to Telegram:`, err.message);
      }
    } else if (order.max_id) {
      try {
        const botToken = config.maxBotToken;
        if (botToken) {
          await axios.post(`https://platform-api.max.ru/messages?chat_id=${order.max_id}`, {
            attachments: [{ type: 'image', payload: { url: cert.cert_image_url } }]
          }, { headers: { Authorization: botToken, 'Content-Type': 'application/json' } });
          console.log(`[tbank/webhook] Cert photo sent to MAX ${order.max_id}`);
        }
      } catch (err) {
        console.error(`[tbank/webhook] Failed to send cert photo to MAX:`, err.message);
      }
    }
  }
}

/**
 * For cert-only orders: set status to delivered (all images OK) or on_hold (some failed).
 */
async function updateCertOnlyOrderStatus(orderId, certResults) {
  const failedCount = certResults.filter(c => !c.cert_image_url).length;
  try {
    if (failedCount > 0) {
      await pool.query(
        `UPDATE orders SET status = 'on_hold', updated_at = NOW() WHERE id = $1`,
        [orderId]
      );
      console.log(`[tbank/webhook] Cert-only order ${orderId} set to on_hold (${failedCount} image(s) failed)`);
    } else {
      await pool.query(
        `UPDATE orders SET status = 'delivered', updated_at = NOW() WHERE id = $1`,
        [orderId]
      );
      console.log(`[tbank/webhook] Cert-only order ${orderId} marked as delivered`);
    }
  } catch (err) {
    console.error(`[tbank/webhook] Failed to update cert order status:`, err.message);
  }
}

/**
 * Alert admin when certificate image generation failed.
 */
async function alertAdminOnCertFailures(orderId, certResults, isCertOnly) {
  const APP_URL = process.env.APP_URL || 'https://buy-tribute.com';
  const failedCerts = certResults.filter(c => !c.cert_image_url);
  if (failedCerts.length === 0) return;

  try {
    const failedList = failedCerts.map(c =>
      `  #${c.id} (${c.certificate_code}) — ${c.recipient_name}, ${c.amount}₽`
    ).join('\n');
    await sendAdminNotification({
      title: '⚠️ Сертификат: изображение не сгенерировано',
      message: `Заказ #${orderId}${isCertOnly ? ' (только сертификаты, статус: on_hold)' : ' (смешанный заказ)'}\n\n` +
        `Не удалось автоматически создать изображение:\n${failedList}\n\n` +
        `Создайте изображение вручную и загрузите URL через раздел сертификатов.`,
      link: `${APP_URL}/admin?order=${orderId}`,
      linkText: 'Открыть заказ'
    });
  } catch (err) {
    console.error('[tbank/webhook] Failed to send cert image failure admin notification:', err);
  }
}

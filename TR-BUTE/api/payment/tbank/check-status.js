/**
 * Check T-Bank Payment Status
 *
 * POST /api/payment/tbank/check-status
 *
 * Calls T-Bank GetState API to check the real payment status,
 * and updates the order if it was confirmed. This serves as a
 * fallback when the T-Bank webhook doesn't reach the server.
 *
 * REQUIRES AUTHENTICATION
 */

const { getPool } = require('../../../lib/db');
const tbank = require('../../../server/services/payment/tbank');
const { sendNotification, sendAdminNotification, NotificationType } = require('../../../lib/notifications');
const { generateAndUploadCertificateImage } = require('../../../lib/certificate-image');
const axios = require('axios');
const config = require('../../../lib/config');

let waitUntil;
try { ({ waitUntil } = require('@vercel/functions')); } catch { waitUntil = null; }

const pool = getPool();

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

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  if (!req.userId) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  const { order_id } = req.body;
  if (!order_id) {
    return res.status(400).json({ success: false, error: 'order_id is required' });
  }

  try {
    // Fetch order and verify ownership
    const orderResult = await pool.query(`
      SELECT o.id, o.status, o.user_id, o.total_price, o.delivery_cost, o.packaging_cost,
             u.telegram_id, u.vk_id, u.max_id, u.email, u.username, u.login_method
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      WHERE o.id = $1 AND o.is_deleted = false
    `, [order_id]);

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    const order = orderResult.rows[0];

    if (order.user_id !== req.userId) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    // Already in a post-payment state — nothing to do
    const POST_PAYMENT_STATUSES = ['paid', 'confirmed', 'shipped', 'delivered', 'on_hold', 'refunded', 'refund_requested'];
    if (POST_PAYMENT_STATUSES.includes(order.status)) {
      return res.json({ success: true, status: order.status });
    }

    // Find the latest pending payment transaction for this order
    const txResult = await pool.query(`
      SELECT transaction_id FROM payment_transactions
      WHERE order_id = $1 AND provider = 'tbank' AND status = 'pending'
      ORDER BY created_at DESC LIMIT 1
    `, [order_id]);

    if (txResult.rows.length === 0) {
      return res.json({ success: true, status: order.status, message: 'No pending payment found' });
    }

    const paymentId = txResult.rows[0].transaction_id;

    // Ask T-Bank for the real status
    const credentials = tbank.getCredentials();
    const state = await tbank.getPaymentState(paymentId, credentials);

    console.log(`[tbank/check-status] Order ${order_id}, PaymentId ${paymentId}: ${state.status}`);

    const confirmedStatuses = [tbank.PAYMENT_STATUSES.CONFIRMED, tbank.PAYMENT_STATUSES.AUTHORIZED];

    if (confirmedStatuses.includes(state.status)) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        await client.query(`
          UPDATE orders
          SET status = 'paid',
              payment_id = $1,
              payment_provider = 'tbank',
              updated_at = NOW()
          WHERE id = $2 AND status != 'paid'
        `, [paymentId, order_id]);

        await client.query(`
          UPDATE payment_transactions
          SET status = 'completed', updated_at = NOW()
          WHERE order_id = $1 AND transaction_id = $2 AND status = 'pending'
        `, [order_id, paymentId]);

        // Activate any pending certificates
        const pendingCerts = await client.query(
          `SELECT id, template_id, recipient_name, amount FROM certificates WHERE purchase_order_id = $1 AND status = 'pending'`,
          [order_id]
        );

        const activatedCerts = [];
        for (const cert of pendingCerts.rows) {
          const code = generateCertificateCode();
          await client.query(
            `UPDATE certificates SET certificate_code = $1, status = 'paid', paid_at = NOW() WHERE id = $2`,
            [code, cert.id]
          );
          activatedCerts.push({ ...cert, certificate_code: code });
          console.log(`[tbank/check-status] Certificate #${cert.id} activated with code ${code}`);
        }

        await client.query('COMMIT');

        console.log(`[tbank/check-status] Order ${order_id} marked as paid (fallback)`);

        // Determine cert-only status for notification routing
        const hasCerts = activatedCerts.length > 0;
        let isCertOnly = false;
        if (hasCerts) {
          try {
            const nonCertResult = await pool.query(
              `SELECT COUNT(*) FROM order_items WHERE order_id = $1 AND certificate_id IS NULL AND deleted_by_admin IS NOT TRUE`,
              [order_id]
            );
            isCertOnly = parseInt(nonCertResult.rows[0].count) === 0;
          } catch (err) {
            console.error('[tbank/check-status] Failed to check cert-only status:', err.message);
          }
        }

        // Admin notification (fire-and-forget)
        sendAdminNotification({
          title: '💰 Оплата получена',
          message: `Заказ: #${order.id}\nПользователь: ${order.username || 'ID ' + order.user_id}\n(подтверждено через проверку статуса)`,
          link: `${APP_URL}/admin?order=${order.id}`,
          linkText: 'Открыть заказ'
        }).catch(err => {
          console.error('[tbank/check-status] Admin notification error:', err);
        });

        if (hasCerts) {
          // Cert orders: generate images, then send combined notification
          const postPaymentWork = async () => {
            const certResults = await generateCertificateImages(activatedCerts);
            await sendUserPaymentNotification(order, { certificates: certResults, isCertOnly });
            await sendCertImagesViaBot(certResults, order);
            if (isCertOnly) await updateCertOnlyOrderStatus(order.id, certResults);
            await alertAdminOnCertFailures(order.id, certResults, isCertOnly);
          };

          if (waitUntil) {
            waitUntil(postPaymentWork().catch(err => {
              console.error('[tbank/check-status] Cert delivery error:', err);
            }));
          } else {
            await postPaymentWork().catch(err => {
              console.error('[tbank/check-status] Cert delivery error:', err);
            });
          }
        } else {
          // Normal order: send standard payment notification
          sendUserPaymentNotification(order).catch(err => {
            console.error('[tbank/check-status] User notification error:', err);
          });
        }

        return res.json({ success: true, status: 'paid' });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    // Not confirmed yet
    return res.json({ success: true, status: state.status });

  } catch (error) {
    console.error('[tbank/check-status] Error:', error);
    return res.status(500).json({ success: false, error: 'Failed to check payment status' });
  }
};

/**
 * Generate certificate images with 30s timeout per cert.
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
      if (url) console.log(`[tbank/check-status] Certificate #${cert.id} image generated: ${url}`);
    } catch (err) {
      console.error(`[tbank/check-status] Failed to generate image for cert #${cert.id}:`, err.message);
      results.push({ ...cert, cert_image_url: null });
    }
  }
  return results;
}

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
    console.error('[tbank/check-status] User notification error:', err);
  }
}

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
        }
      } catch (err) {
        console.error(`[tbank/check-status] Failed to send cert photo to Telegram:`, err.message);
      }
    } else if (order.max_id) {
      try {
        const botToken = config.maxBotToken;
        if (botToken) {
          await axios.post(`https://platform-api.max.ru/messages?chat_id=${order.max_id}`, {
            attachments: [{ type: 'image', payload: { url: cert.cert_image_url } }]
          }, { headers: { Authorization: botToken, 'Content-Type': 'application/json' } });
        }
      } catch (err) {
        console.error(`[tbank/check-status] Failed to send cert photo to MAX:`, err.message);
      }
    }
  }
}

async function updateCertOnlyOrderStatus(orderId, certResults) {
  const failedCount = certResults.filter(c => !c.cert_image_url).length;
  try {
    if (failedCount > 0) {
      await pool.query(`UPDATE orders SET status = 'on_hold', updated_at = NOW() WHERE id = $1`, [orderId]);
      console.log(`[tbank/check-status] Cert-only order ${orderId} set to on_hold (${failedCount} image(s) failed)`);
    } else {
      await pool.query(`UPDATE orders SET status = 'delivered', updated_at = NOW() WHERE id = $1`, [orderId]);
      console.log(`[tbank/check-status] Cert-only order ${orderId} marked as delivered`);
    }
  } catch (err) {
    console.error(`[tbank/check-status] Failed to update cert order status:`, err.message);
  }
}

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
    console.error('[tbank/check-status] Failed to send cert image failure admin notification:', err);
  }
}

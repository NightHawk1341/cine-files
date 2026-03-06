/**
 * Universal Notification System
 * Sends notifications via Telegram bot and/or email
 * POST /api/notifications/send
 */

const { getPool } = require('../../lib/db');
const pool = getPool();
const config = require('../../lib/config');
const axios = require('axios');
const { trackEmailSent, trackEmailFailed } = require('../../lib/emailStats');
const postbox = require('../../lib/postbox');

/**
 * Get notification message for Telegram
 */
function getTelegramMessage(type, data) {
  const { orderId, deliveryCost, trackingNumber, totalPrice, receiptUrl, manualReceipt } = data;

  switch (type) {
    case 'delivery_cost_added':
      return `
📦 <b>Обновление заказа #${orderId}</b>

Стоимость доставки рассчитана!

<b>Итоговая сумма: ${totalPrice}₽</b>
${deliveryCost ? `(включая доставку: ${deliveryCost}₽)` : ''}

Для оплаты заказа перейдите в раздел "Мои заказы".
      `.trim();

    case 'payment_received':
      return `
✅ <b>Платеж получен!</b>

Заказ #${orderId} успешно оплачен.

Мы начали обработку вашего заказа. Вы получите уведомление, когда заказ будет отправлен.
${receiptUrl ? `\n📄 <b>Чек:</b> <a href="${receiptUrl}">Скачать налоговый чек</a>` : manualReceipt ? `\n📄 Налоговый чек будет отправлен вам отдельным сообщением после его формирования.` : ''}
      `.trim();

    case 'order_shipped':
      return `
📦 <b>Заказ #${orderId} отправлен!</b>

Ваш заказ в пути!

${trackingNumber ? `<b>Трек-номер:</b> <code>${trackingNumber}</code>\n\nОтслеживайте доставку на сайте транспортной компании.` : ''}
      `.trim();

    case 'order_cancelled':
      return `
❌ <b>Заказ #${orderId} отменен</b>

К сожалению, ваш заказ был отменен.

Если у вас есть вопросы, свяжитесь с нами через FAQ.
      `.trim();

    case 'admin_response':
      const { productTitle, responseText, reviewType } = data;
      const typeEmoji = reviewType === 'review' ? '⭐' : reviewType === 'comment' ? '💬' : '💡';
      return `
${typeEmoji} <b>Ответ магазина на вашу ${reviewType === 'review' ? 'рецензию' : reviewType === 'comment' ? 'комментарий' : 'предложение'}</b>

${productTitle ? `<b>Товар:</b> ${productTitle}\n\n` : ''}${responseText}

Спасибо за обратную связь!
      `.trim();

    default:
      return null;
  }
}

/**
 * Get notification email subject and body
 */
function getEmailContent(type, data) {
  const { orderId, deliveryCost, trackingNumber, totalPrice, receiptUrl, manualReceipt } = data;

  switch (type) {
    case 'delivery_cost_added':
      return {
        subject: `Заказ #${orderId} - Стоимость доставки рассчитана`,
        html: `
          <h2>📦 Обновление заказа #${orderId}</h2>
          <p>Стоимость доставки рассчитана!</p>
          <p><strong>Итоговая сумма: ${totalPrice}₽</strong></p>
          ${deliveryCost ? `<p>(включая доставку: ${deliveryCost}₽)</p>` : ''}
          <p>Для оплаты заказа перейдите на наш сайт в раздел "Мои заказы".</p>
          <hr>
          <p style="color: #666; font-size: 12px;">Это автоматическое уведомление от TR/BUTE</p>
        `,
        text: `
Обновление заказа #${orderId}

Стоимость доставки рассчитана!

Итоговая сумма: ${totalPrice}₽
${deliveryCost ? `(включая доставку: ${deliveryCost}₽)` : ''}

Для оплаты заказа перейдите на наш сайт в раздел "Мои заказы".
        `.trim()
      };

    case 'payment_received':
      return {
        subject: `Заказ #${orderId} - Платеж получен`,
        html: `
          <h2>✅ Платеж получен!</h2>
          <p>Заказ #${orderId} успешно оплачен.</p>
          <p>Мы начали обработку вашего заказа. Вы получите уведомление, когда заказ будет отправлен.</p>
          ${receiptUrl ? `
          <p><strong>📄 Налоговый чек:</strong></p>
          <p><a href="${receiptUrl}" style="display: inline-block; padding: 10px 20px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 5px;">Скачать чек</a></p>
          ` : manualReceipt ? `
          <p><strong>📄 Налоговый чек:</strong> Чек будет отправлен вам отдельным сообщением после его формирования.</p>
          ` : ''}
          <hr>
          <p style="color: #666; font-size: 12px;">Это автоматическое уведомление от TR/BUTE</p>
        `,
        text: `
Платеж получен!

Заказ #${orderId} успешно оплачен.

Мы начали обработку вашего заказа. Вы получите уведомление, когда заказ будет отправлен.
${receiptUrl ? `\n\n📄 Налоговый чек: ${receiptUrl}` : manualReceipt ? `\n\n📄 Налоговый чек будет отправлен вам отдельным сообщением после его формирования.` : ''}
        `.trim()
      };

    case 'order_shipped':
      return {
        subject: `Заказ #${orderId} - Отправлен`,
        html: `
          <h2>📦 Заказ #${orderId} отправлен!</h2>
          <p>Ваш заказ в пути!</p>
          ${trackingNumber ? `<p><strong>Трек-номер:</strong> ${trackingNumber}</p><p>Отслеживайте доставку на сайте транспортной компании.</p>` : ''}
          <hr>
          <p style="color: #666; font-size: 12px;">Это автоматическое уведомление от TR/BUTE</p>
        `,
        text: `
Заказ #${orderId} отправлен!

Ваш заказ в пути!

${trackingNumber ? `Трек-номер: ${trackingNumber}\n\nОтслеживайте доставку на сайте транспортной компании.` : ''}
        `.trim()
      };

    case 'order_cancelled':
      return {
        subject: `Заказ #${orderId} - Отменен`,
        html: `
          <h2>❌ Заказ #${orderId} отменен</h2>
          <p>К сожалению, ваш заказ был отменен.</p>
          <p>Если у вас есть вопросы, свяжитесь с нами через наш сайт.</p>
          <hr>
          <p style="color: #666; font-size: 12px;">Это автоматическое уведомление от TR/BUTE</p>
        `,
        text: `
Заказ #${orderId} отменен

К сожалению, ваш заказ был отменен.

Если у вас есть вопросы, свяжитесь с нами через наш сайт.
        `.trim()
      };

    case 'admin_response':
      const { productTitle: emailProductTitle, responseText: emailResponseText, reviewType: emailReviewType } = data;
      const typeText = emailReviewType === 'review' ? 'рецензию' : emailReviewType === 'comment' ? 'комментарий' : 'предложение';
      const typeEmoji = emailReviewType === 'review' ? '⭐' : emailReviewType === 'comment' ? '💬' : '💡';
      return {
        subject: `${typeEmoji} Ответ магазина на вашу ${typeText}`,
        html: `
          <h2>${typeEmoji} Ответ магазина</h2>
          ${emailProductTitle ? `<p><strong>Товар:</strong> ${emailProductTitle}</p>` : ''}
          <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 15px 0;">
            <p>${emailResponseText}</p>
          </div>
          <p>Спасибо за вашу обратную связь!</p>
          <hr>
          <p style="color: #666; font-size: 12px;">Это автоматическое уведомление от TR/BUTE</p>
        `,
        text: `
Ответ магазина на вашу ${typeText}

${emailProductTitle ? `Товар: ${emailProductTitle}\n\n` : ''}${emailResponseText}

Спасибо за вашу обратную связь!
        `.trim()
      };

    default:
      return null;
  }
}

/**
 * Send Telegram notification
 */
async function sendTelegramNotification(telegramId, message, buttons = null) {
  try {
    const USER_BOT_TOKEN = config.telegram.userBotToken;
    const USER_BOT_API = `https://api.telegram.org/bot${USER_BOT_TOKEN}`;

    const payload = {
      chat_id: telegramId,
      text: message,
      parse_mode: 'HTML'
    };

    if (buttons) {
      payload.reply_markup = { inline_keyboard: buttons };
    }

    const response = await axios.post(`${USER_BOT_API}/sendMessage`, payload, { timeout: 5000 });
    return response.data.ok;
  } catch (error) {
    console.error('Failed to send Telegram notification:', error.message);
    return false;
  }
}

/**
 * Send Email notification via Postbox (primary) or Yandex SMTP (fallback)
 */
async function sendEmailNotification(email, emailContent) {
  try {
    if (!config.postbox.enabled && !config.email.enabled) {
      console.warn('[Email] No email provider configured, skipping');
      return false;
    }

    const fromAddress = config.postbox.enabled
      ? config.postbox.fromAddress
      : config.email.user;

    const result = await postbox.sendEmail({
      from: `"TR/BUTE" <${fromAddress}>`,
      to: email,
      subject: emailContent.subject,
      text: emailContent.text,
      html: emailContent.html
    });

    trackEmailSent();
    console.log(`[Email] Sent via ${result.provider}: ${result.messageId}`);
    return true;
  } catch (error) {
    trackEmailFailed();
    console.error('[Email] Failed to send:', error.message);
    return false;
  }
}

/**
 * Get Telegram buttons for notification type
 */
function getTelegramButtons(type, data) {
  const { orderId } = data;
  const orderUrl = `${config.appUrl}/profile?order=${orderId}`;

  switch (type) {
    case 'delivery_cost_added':
      return [[{
        text: '💳 Оплатить заказ',
        web_app: { url: orderUrl }
      }]];

    case 'payment_received':
      return [[{
        text: '📦 Мой заказ',
        web_app: { url: orderUrl }
      }]];

    case 'order_shipped':
      return [[{
        text: '📦 Отслеживать',
        web_app: { url: orderUrl }
      }]];

    case 'order_cancelled':
      return [[{
        text: '🛍 Каталог',
        web_app: { url: `${config.appUrl}/catalog` }
      }]];

    case 'admin_response':
      return [[{
        text: '💬 Подробнее',
        web_app: { url: `${config.appUrl}/profile` }
      }]];

    default:
      return null;
  }
}

/**
 * Main handler
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { user_id, type, data } = req.body;

    // Validate input
    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    if (!type) {
      return res.status(400).json({ error: 'type is required' });
    }

    const validTypes = ['delivery_cost_added', 'payment_received', 'order_shipped', 'order_cancelled', 'admin_response'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        error: 'Invalid notification type',
        valid_types: validTypes
      });
    }

    // Admin response notifications don't require orderId
    if (!data) {
      return res.status(400).json({ error: 'data is required' });
    }
    if (type !== 'admin_response' && !data.orderId) {
      return res.status(400).json({ error: 'data.orderId is required' });
    }

    // Fetch user from database
    const userResult = await pool.query(
      'SELECT id, telegram_id, vk_id, max_id, email, username, login_method, notification_method, notifications_enabled FROM users WHERE id = $1',
      [user_id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

    if (user.notifications_enabled === false) {
      console.log(`Notifications disabled for user ${user_id}, skipping`);
      return res.json({ success: true, skipped: true, reason: 'notifications_disabled' });
    }

    // For Yandex users, construct email from username if email is not set
    let userEmail = user.email;
    if (!userEmail && user.login_method === 'yandex' && user.username) {
      userEmail = `${user.username}@yandex.ru`;
      console.log(`Constructed Yandex email for user ${user_id}: ${userEmail}`);
    }

    // Determine notification method based on login_method
    let notificationMethod = user.notification_method || config.notificationMode;
    if (user.login_method === 'telegram' && user.telegram_id) {
      notificationMethod = 'telegram';
    } else if (user.login_method === 'vk' && user.vk_id) {
      notificationMethod = 'vk';
    } else if (user.login_method === 'max' && user.max_id) {
      notificationMethod = 'max';
    }

    console.log(`[notifications] Sending notification:`, {
      user_id,
      type,
      notificationMethod,
      hasTelegramId: !!user.telegram_id,
      hasVkId: !!user.vk_id,
      hasMaxId: !!user.max_id,
      hasEmail: !!userEmail
    });

    const results = { telegram: null, vk: null, max: null, email: null };

    // MAX notification
    if (notificationMethod === 'max' && user.max_id && config.maxBotToken) {
      console.log(`[notifications] Attempting MAX notification to user: ${user.max_id}`);
      const { sendMAXNotification: sendMAX, getMAXContent } = require('../../lib/notifications');
      const maxMsg = getMAXContent(type, data, null);
      if (maxMsg) {
        results.max = await sendMAX({ maxId: user.max_id, message: maxMsg.message });
        console.log(`[notifications] MAX notification result: ${results.max ? 'SUCCESS' : 'FAILED'}`);
      }
    }

    // VK notification
    if (notificationMethod === 'vk' && user.vk_id && config.vkAppServiceToken) {
      console.log(`[notifications] Attempting VK notification to user: ${user.vk_id}`);
      const { sendVKNotification: sendVK, getVKContent } = require('../../lib/notifications');
      const vkMsg = getVKContent(type, data, null);
      if (vkMsg) {
        results.vk = await sendVK({ vkUserId: user.vk_id, message: vkMsg.message });
        console.log(`[notifications] VK notification result: ${results.vk ? 'SUCCESS' : 'FAILED'}`);
      }
    }

    // Telegram notification
    if ((notificationMethod === 'telegram' || notificationMethod === 'both') && user.telegram_id && config.auth.telegram.enabled) {
      console.log(`[notifications] Attempting Telegram notification to chat_id: ${user.telegram_id}`);
      const message = getTelegramMessage(type, data);
      if (message) {
        const buttons = getTelegramButtons(type, data);
        results.telegram = await sendTelegramNotification(user.telegram_id, message, buttons);
        console.log(`[notifications] Telegram notification result: ${results.telegram ? 'SUCCESS' : 'FAILED'}`);
      }
    }

    // Email notification
    const emailEnabled = config.postbox.enabled || config.email.enabled;
    if ((notificationMethod === 'email' || notificationMethod === 'both') && userEmail && emailEnabled) {
      console.log(`[notifications] Attempting Email notification to: ${userEmail}`);
      const emailContent = getEmailContent(type, data);
      if (emailContent) {
        results.email = await sendEmailNotification(userEmail, emailContent);
        console.log(`[notifications] Email notification result: ${results.email ? 'SUCCESS' : 'FAILED'}`);      }
    }

    const success = results.telegram || results.vk || results.max || results.email;

    return res.status(200).json({
      success,
      notifications_sent: results,
      user_id: user.id,
      notification_type: type
    });

  } catch (error) {
    console.error('Error sending notification:', error);
    return res.status(500).json({
      error: 'Failed to send notification',
      message: error.message
    });
  }
};

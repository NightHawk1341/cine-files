/**
 * Admin Bot Webhook Handler - Notion-Style Edition
 * Handles admin notifications and order management
 * Features: Professional formatting, clean UI, order management
 */

const { getPool } = require('../../lib/db');
const pool = getPool();
const config = require('../../lib/config');
const axios = require('axios');
const { getSessionStore } = require('../../lib/session-store');

const BOT_TOKEN = config.telegram.adminBotToken;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// Session storage getter (called at request time to pick up Redis when available)
const getAdminSession = () => getSessionStore('admin');

// Professional Unicode symbols (Notion-style)
const ICONS = {
  // Status indicators
  NEW: '▶',
  SUCCESS: '✓',
  ERROR: '✕',
  WARNING: '⚠',
  INFO: 'ⓘ',

  // Actions
  PACKAGE: '■',
  PAYMENT: '▣',
  TRACKING: '▤',
  CANCEL: '▢',

  // Sections
  DIVIDER: '─────────────────────',
  BULLET: '•',
  ARROW: '→',

  // Categories
  CUSTOMER: '▸',
  PRODUCTS: '▫',
  TOTAL: '▪'
};

/**
 * Send message to admin
 */
async function sendMessage(chatId, text, options = {}) {
  try {
    const response = await axios.post(`${TELEGRAM_API}/sendMessage`, {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      ...options
    });
    return response.data;
  } catch (error) {
    console.error('Error sending admin message:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Send photo to admin
 */
async function sendPhoto(chatId, photoUrl, caption, options = {}) {
  try {
    const response = await axios.post(`${TELEGRAM_API}/sendPhoto`, {
      chat_id: chatId,
      photo: photoUrl,
      caption,
      parse_mode: 'HTML',
      ...options
    });
    return response.data;
  } catch (error) {
    console.error('Error sending photo:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Edit existing message
 */
async function editMessage(chatId, messageId, text, options = {}) {
  try {
    await axios.post(`${TELEGRAM_API}/editMessageText`, {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: 'HTML',
      ...options
    });
  } catch (error) {
    console.error('Error editing message:', error.response?.data || error.message);
  }
}

/**
 * Verify if user is admin
 */
async function isAdmin(telegramId) {
  try {
    const result = await pool.query(
      'SELECT id, permissions FROM admins WHERE telegram_id = $1',
      [telegramId]
    );
    return result.rows.length > 0;
  } catch (error) {
    console.error('Error checking admin status:', error);
    return false;
  }
}

/**
 * Get all admins
 */
async function getAllAdmins() {
  try {
    const result = await pool.query('SELECT telegram_id FROM admins');
    return result.rows.map(row => row.telegram_id);
  } catch (error) {
    console.error('Error fetching admins:', error);
    return [];
  }
}

/**
 * Format order notification message (short, simple)
 */
function formatOrderNotification(order, items, address) {
  const totalItemsPrice = items.reduce((sum, item) =>
    sum + (item.price_at_purchase * item.quantity), 0
  );

  const message = `Поступил заказ #${order.id} на сумму ${totalItemsPrice} руб. Внесите информацию по доставке.`;

  return message;
}

/**
 * Send new order notification to all admins
 */
async function notifyAdminsNewOrder(orderId) {
  try {
    // Fetch order with items and address
    const orderResult = await pool.query(`
      SELECT o.*, u.username, u.first_name, u.last_name
      FROM orders o
      JOIN users u ON o.user_id = u.id
      WHERE o.id = $1
    `, [orderId]);

    if (orderResult.rows.length === 0) {
      console.error('Order not found:', orderId);
      return;
    }

    const order = orderResult.rows[0];

    const itemsResult = await pool.query(`
      SELECT * FROM order_items WHERE order_id = $1
    `, [orderId]);

    const addressResult = await pool.query(`
      SELECT * FROM order_addresses WHERE order_id = $1
    `, [orderId]);

    if (addressResult.rows.length === 0) {
      console.error('Order address not found:', orderId);
      return;
    }

    const items = itemsResult.rows;
    const address = addressResult.rows[0];

    const message = formatOrderNotification(order, items, address);

    const adminIds = await getAllAdmins();

    for (const adminId of adminIds) {
      try {
        await sendMessage(adminId, message);
      } catch (error) {
        console.error(`Failed to notify admin ${adminId}:`, error.message);
      }
    }
  } catch (error) {
    console.error('Error notifying admins:', error);
  }
}

/**
 * Handle delivery cost input request
 */
async function handleDeliveryCostRequest(chatId, messageId, orderId) {
  await getAdminSession().set(String(chatId), {
    state: 'awaiting_delivery_cost',
    orderId: orderId,
    messageId: messageId
  });

  await editMessage(chatId, messageId, `
<b>${ICONS.PAYMENT} Стоимость доставки</b>
${ICONS.DIVIDER}

Заказ #${orderId}

${ICONS.ARROW} Отправьте число (только цифры)
${ICONS.ARROW} Например: <code>350</code>
  `.trim());
}

/**
 * Handle delivery cost input
 */
async function handleDeliveryCostInput(chatId, orderId, cost) {
  try {
    // Update order
    const updateResult = await pool.query(`
      UPDATE orders
      SET delivery_cost = $1, status = 'awaiting_payment', updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [cost, orderId]);

    if (updateResult.rows.length === 0) {
      await sendMessage(chatId, `<b>${ICONS.ERROR} Ошибка</b>\n\nЗаказ #${orderId} не найден.`);
      return;
    }

    const order = updateResult.rows[0];
    const totalWithDelivery = order.total_price + cost;

    await sendMessage(chatId, `
<b>${ICONS.SUCCESS} Доставка добавлена</b>
${ICONS.DIVIDER}

<b>Заказ #${orderId}</b>

  Товары: <code>${order.total_price}₽</code>
  Доставка: <code>${cost}₽</code>
  <b>Итого: ${totalWithDelivery}₽</b>

${ICONS.DIVIDER}
${ICONS.INFO} Статус: <i>Ожидает оплаты</i>
${ICONS.INFO} Клиент получил уведомление
    `.trim());

    // Notify customer (via user bot)
    await notifyCustomerDeliveryCost(order.user_id, orderId, cost, totalWithDelivery);

  } catch (error) {
    console.error('Error updating delivery cost:', error);
    await sendMessage(chatId, `<b>${ICONS.ERROR} Ошибка</b>\n\nНе удалось обновить заказ.`);
  }
}

/**
 * Notify customer about delivery cost
 */
async function notifyCustomerDeliveryCost(userId, orderId, deliveryCost, totalPrice) {
  try {
    const userResult = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);

    if (userResult.rows.length === 0) {
      console.error('User not found:', userId);
      return;
    }

    const USER_BOT_TOKEN = config.telegram.userBotToken;
    const USER_BOT_API = `https://api.telegram.org/bot${USER_BOT_TOKEN}`;

    const message = `
<b>Стоимость доставки рассчитана</b>

Заказ #${orderId}

Итоговая сумма к оплате: ${totalPrice} руб.
Стоимость доставки: ${deliveryCost} руб.

Пожалуйста, ознакомьтесь с итоговой суммой. Если вас все устраивает, вы можете оплатить заказ в разделе "Мои заказы". После оплаты мы начнем обработку вашего заказа.
    `.trim();

    await axios.post(`${USER_BOT_API}/sendMessage`, {
      chat_id: userId,
      text: message,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Мои заказы', web_app: { url: `${config.appUrl}/profile` } }]
        ]
      }
    });
  } catch (error) {
    console.error('Error notifying customer:', error);
  }
}

/**
 * Handle order cancellation
 */
async function handleOrderCancel(chatId, messageId, orderId) {
  try {
    const updateResult = await pool.query(`
      UPDATE orders
      SET status = 'cancelled', updated_at = NOW()
      WHERE id = $1
      RETURNING user_id
    `, [orderId]);

    if (updateResult.rows.length === 0) {
      await sendMessage(chatId, `<b>${ICONS.ERROR} Ошибка</b>\n\nЗаказ #${orderId} не найден.`);
      return;
    }

    const userId = updateResult.rows[0].user_id;

    await editMessage(chatId, messageId, `
<b>${ICONS.CANCEL} Заказ отменен</b>
${ICONS.DIVIDER}

<b>Заказ #${orderId}</b>

${ICONS.INFO} Статус: <i>Отменен</i>
${ICONS.INFO} Клиент получил уведомление
    `.trim());

    // Notify customer
    await notifyCustomerOrderCancelled(userId, orderId);

  } catch (error) {
    console.error('Error cancelling order:', error);
    await sendMessage(chatId, `<b>${ICONS.ERROR} Ошибка</b>\n\nНе удалось отменить заказ.`);
  }
}

/**
 * Notify customer about order cancellation
 */
async function notifyCustomerOrderCancelled(userId, orderId) {
  try {
    const USER_BOT_TOKEN = config.telegram.userBotToken;
    const USER_BOT_API = `https://api.telegram.org/bot${USER_BOT_TOKEN}`;

    const message = `
<b>Заказ отменен</b>

Заказ #${orderId} был отменен.

К сожалению, ваш заказ был отменен. Если у вас есть вопросы или вам нужна помощь, свяжитесь с нами через раздел FAQ на сайте.
    `.trim();

    await axios.post(`${USER_BOT_API}/sendMessage`, {
      chat_id: userId,
      text: message,
      parse_mode: 'HTML'
    });
  } catch (error) {
    console.error('Error notifying customer about cancellation:', error);
  }
}

/**
 * Handle tracking number input
 */
async function handleTrackingNumberRequest(chatId, orderId) {
  await getAdminSession().set(String(chatId), {
    state: 'awaiting_tracking',
    orderId: orderId
  });

  await sendMessage(chatId, `
<b>${ICONS.TRACKING} Трек-номер доставки</b>
${ICONS.DIVIDER}

Заказ #${orderId}

${ICONS.ARROW} Отправьте трек-номер одним сообщением
  `.trim());
}

/**
 * Handle tracking number input
 */
async function handleTrackingNumberInput(chatId, orderId, trackingNumber) {
  try {
    const updateResult = await pool.query(`
      UPDATE orders
      SET tracking_number = $1, status = 'shipped', updated_at = NOW()
      WHERE id = $2
      RETURNING user_id
    `, [trackingNumber, orderId]);

    if (updateResult.rows.length === 0) {
      await sendMessage(chatId, `<b>${ICONS.ERROR} Ошибка</b>\n\nЗаказ #${orderId} не найден.`);
      return;
    }

    const userId = updateResult.rows[0].user_id;

    await sendMessage(chatId, `
<b>${ICONS.SUCCESS} Трек-номер добавлен</b>
${ICONS.DIVIDER}

<b>Заказ #${orderId}</b>

  Трек-номер: <code>${trackingNumber}</code>

${ICONS.DIVIDER}
${ICONS.INFO} Статус: <i>Отправлен</i>
${ICONS.INFO} Клиент получил уведомление
    `.trim());

    // Notify customer
    await notifyCustomerShipped(userId, orderId, trackingNumber);

  } catch (error) {
    console.error('Error updating tracking number:', error);
    await sendMessage(chatId, `<b>${ICONS.ERROR} Ошибка</b>\n\nНе удалось обновить трек-номер.`);
  }
}

/**
 * Notify customer about shipment
 */
async function notifyCustomerShipped(userId, orderId, trackingNumber) {
  try {
    const USER_BOT_TOKEN = config.telegram.userBotToken;
    const USER_BOT_API = `https://api.telegram.org/bot${USER_BOT_TOKEN}`;

    const message = `
<b>Заказ отправлен</b>

Заказ #${orderId} был отправлен и находится в пути.

Трек-номер для отслеживания: ${trackingNumber}

Вы можете отслеживать статус доставки на сайте транспортной компании или через приложение Почты России.
    `.trim();

    await axios.post(`${USER_BOT_API}/sendMessage`, {
      chat_id: userId,
      text: message,
      parse_mode: 'HTML'
    });
  } catch (error) {
    console.error('Error notifying customer about shipment:', error);
  }
}

/**
 * Notify admins about payment received
 */
async function notifyAdminsPaymentReceived(orderId, paymentId) {
  try {
    const adminIds = await getAllAdmins();

    const message = `Заказ #${orderId} был оплачен.\n\n📄 Пожалуйста, создайте налоговый чек и добавьте ссылку на него в заказе.`;

    for (const adminId of adminIds) {
      try {
        await sendMessage(adminId, message);
      } catch (error) {
        console.error(`Failed to notify admin ${adminId}:`, error.message);
      }
    }
  } catch (error) {
    console.error('Error notifying admins about payment:', error);
  }
}

/**
 * Notify admins about order cancellation
 */
async function notifyAdminsOrderCancelled(orderId) {
  try {
    const adminIds = await getAllAdmins();
    const message = `Заказ #${orderId} был отменен.`;

    for (const adminId of adminIds) {
      try {
        await sendMessage(adminId, message);
      } catch (error) {
        console.error(`Failed to notify admin ${adminId}:`, error.message);
      }
    }
  } catch (error) {
    console.error('Error notifying admins about cancellation:', error);
  }
}

/**
 * Notify admins about refund request
 */
async function notifyAdminsRefundRequest(orderId, userId, refundReason, totalAmount) {
  try {
    const adminIds = await getAllAdmins();

    // Fetch user info
    let userInfo = '';
    try {
      const userResult = await pool.query(
        'SELECT username, telegram_id, email FROM users WHERE id = $1',
        [userId]
      );
      if (userResult.rows.length > 0) {
        const user = userResult.rows[0];
        userInfo = `👤 Пользователь: ${user.username || user.email || user.telegram_id || userId}`;
      }
    } catch (error) {
      console.error('Error fetching user info:', error);
    }

    const message = `
🔔 <b>ЗАПРОС НА ВОЗВРАТ</b>
${ICONS.DIVIDER}

📦 Заказ #${orderId}
💰 Сумма: ${totalAmount} ₽
${userInfo}

📝 <b>Причина:</b>
${refundReason}
    `.trim();

    for (const adminId of adminIds) {
      try {
        await sendMessage(adminId, message);
      } catch (error) {
        console.error(`Failed to notify admin ${adminId}:`, error.message);
      }
    }
  } catch (error) {
    console.error('Error notifying admins about refund request:', error);
  }
}

/**
 * Get main keyboard for admin
 */
function getAdminKeyboard() {
  return {
    keyboard: [
      [{ text: '📊 Статус' }],
      [{ text: '📢 Пост в канал' }, { text: '🎁 Розыгрыш' }]
    ],
    resize_keyboard: true,
    persistent: true
  };
}

/**
 * Handle status button press
 */
async function handleStatusRequest(chatId) {
  try {
    // Get count of new orders needing delivery cost calculation
    const newOrdersResult = await pool.query(`
      SELECT COUNT(*) as count
      FROM orders
      WHERE status IN ('new', 'evaluation')
    `);
    const newOrdersCount = parseInt(newOrdersResult.rows[0].count);

    // Get count of reviewed orders waiting for customer acceptance
    const reviewedResult = await pool.query(`
      SELECT COUNT(*) as count
      FROM orders
      WHERE status IN ('reviewed', 'accepted')
    `);
    const reviewedCount = parseInt(reviewedResult.rows[0].count);

    // Get count of paid orders needing to be sent
    const paidResult = await pool.query(`
      SELECT COUNT(*) as count
      FROM orders
      WHERE status IN ('paid', 'in_work')
    `);
    const paidCount = parseInt(paidResult.rows[0].count);

    const totalPending = newOrdersCount + reviewedCount + paidCount;

    const message = `
<b>${ICONS.INFO} Статус заказов</b>
${ICONS.DIVIDER}

<b>Новые заказы:</b>
  ${ICONS.ARROW} Требуют расчета доставки: <code>${newOrdersCount}</code>

<b>Ожидают оплаты:</b>
  ${ICONS.ARROW} Ожидают решения клиента: <code>${reviewedCount}</code>

<b>Оплаченные заказы:</b>
  ${ICONS.ARROW} Требуют отправки: <code>${paidCount}</code>

${ICONS.DIVIDER}
${ICONS.INFO} Всего требуют внимания: <b>${totalPending}</b>
    `.trim();

    await sendMessage(chatId, message, {
      reply_markup: getAdminKeyboard()
    });
  } catch (error) {
    console.error('Error fetching status:', error);
    await sendMessage(chatId, `<b>${ICONS.ERROR} Ошибка</b>\n\nНе удалось получить статус.`, {
      reply_markup: getAdminKeyboard()
    });
  }
}

/**
 * Post a message to a Telegram channel from the admin miniapp
 */
async function postToChannel({ message, channel_id, parse_mode, buttons, image, scheduled_at, disable_notification, disable_web_page_preview }) {
  // Resolve channel: use provided channel_id or fall back to first configured channel
  let targetChannelId = channel_id;
  if (!targetChannelId) {
    const { rows } = await pool.query(
      `SELECT value FROM app_settings WHERE key = 'giveaway_channels'`
    );
    const channels = rows[0]?.value;
    if (!Array.isArray(channels) || channels.length === 0) {
      throw new Error('No channel configured. Add a channel in the Розыгрыш tab first.');
    }
    targetChannelId = channels[0].id;
  }

  const effectiveParseMode = parse_mode || 'HTML';

  // Build inline keyboard from buttons array
  // Each button: { text, url } for link buttons, { text, web_app: true, url } for miniapp buttons
  let replyMarkup = null;
  if (Array.isArray(buttons) && buttons.length > 0) {
    replyMarkup = {
      inline_keyboard: [buttons.map(b =>
        b.web_app
          ? { text: b.text, web_app: { url: b.url } }
          : { text: b.text, url: b.url }
      )]
    };
  }

  const baseOptions = {
    parse_mode: effectiveParseMode,
    ...(disable_notification ? { disable_notification: true } : {}),
    ...(disable_web_page_preview ? { link_preview_options: { is_disabled: true } } : {}),
    ...(replyMarkup ? { reply_markup: replyMarkup } : {})
  };

  if (scheduled_at) {
    // Store scheduled post in app_settings for a cron job to pick up
    await pool.query(`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES ('scheduled_channel_posts',
        COALESCE((SELECT value FROM app_settings WHERE key = 'scheduled_channel_posts'), '[]'::jsonb)
        || $1::jsonb,
        NOW())
      ON CONFLICT (key) DO UPDATE SET
        value = app_settings.value || $1::jsonb,
        updated_at = NOW()
    `, [JSON.stringify([{
      channel_id: targetChannelId,
      message,
      image: image || null,
      parse_mode: effectiveParseMode,
      buttons: buttons || null,
      disable_notification: disable_notification || false,
      disable_web_page_preview: disable_web_page_preview || false,
      scheduled_at
    }])]);
    return { ok: true, scheduled: true };
  }

  if (image) {
    // image is a base64 data URL
    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');

    const FormData = require('form-data');
    const form = new FormData();
    form.append('chat_id', String(targetChannelId));
    form.append('photo', imageBuffer, { filename: 'image.jpg', contentType: 'image/jpeg' });
    if (message) {
      form.append('caption', message);
      form.append('parse_mode', effectiveParseMode);
    }
    if (disable_notification) form.append('disable_notification', 'true');
    if (replyMarkup) form.append('reply_markup', JSON.stringify(replyMarkup));

    const resp = await axios.post(`${TELEGRAM_API}/sendPhoto`, form, {
      headers: form.getHeaders()
    });
    return { ok: true, message_id: resp.data.result?.message_id };
  }

  const resp = await axios.post(`${TELEGRAM_API}/sendMessage`, {
    chat_id: targetChannelId,
    text: message,
    ...baseOptions
  });
  return { ok: true, message_id: resp.data.result?.message_id };
}

// --- /post command flow ---

async function getConfiguredChannels() {
  const { rows } = await pool.query(
    `SELECT value FROM app_settings WHERE key = 'giveaway_channels'`
  );
  if (!rows.length || !rows[0].value) return [];
  const val = rows[0].value;
  return Array.isArray(val) ? val : [];
}

async function handlePostCommand(chatId) {
  const channels = await getConfiguredChannels();
  if (!channels.length) {
    await sendMessage(chatId, `<b>${ICONS.ERROR}</b> Нет настроенных каналов. Добавьте канал в разделе «Розыгрыш» панели управления.`);
    return;
  }

  await getAdminSession().set(String(chatId), {
    state: 'post_awaiting_text',
    channels
  });

  await sendMessage(chatId, `
<b>▸ Публикация в канал</b>
${ICONS.DIVIDER}

Отправьте текст поста. Поддерживается HTML-разметка:

  <code>&lt;b&gt;жирный&lt;/b&gt;</code>
  <code>&lt;i&gt;курсив&lt;/i&gt;</code>
  <code>&lt;a href="url"&gt;ссылка&lt;/a&gt;</code>

${ICONS.ARROW} Или /cancel для отмены
  `.trim());
}

async function handlePostText(chatId, text, media, session) {
  session.postText = text;
  // If user sent a photo/video with caption, grab the media right away
  if (media) {
    session.postMedia = media;
  }
  session.state = 'post_awaiting_media';
  await getAdminSession().set(String(chatId), session);

  if (media) {
    // Already got media, skip to buttons
    return promptPostButtons(chatId, session);
  }

  await sendMessage(chatId, `
<b>▸ Медиа</b>
${ICONS.DIVIDER}

Отправьте фото или видео для поста.

${ICONS.ARROW} Или /skip чтобы пропустить
  `.trim());
}

async function handlePostMedia(chatId, text, media, session) {
  if (media) {
    session.postMedia = media;
  } else if (text !== '/skip' && text !== '/done') {
    await sendMessage(chatId, `${ICONS.ERROR} Отправьте фото/видео или /skip`);
    return;
  }
  return promptPostButtons(chatId, session);
}

async function promptPostButtons(chatId, session) {
  session.state = 'post_awaiting_buttons';
  session.postButtons = session.postButtons || [];
  await getAdminSession().set(String(chatId), session);

  const appUrl = config.maxAppUrl || config.appUrl;
  await sendMessage(chatId, `
<b>▸ Кнопки</b>
${ICONS.DIVIDER}

<b>Ссылка:</b>
<code>Текст | https://example.com</code>

<b>Мини-приложение:</b>
<code>Текст | miniapp</code>
(откроет ${appUrl})

${ICONS.ARROW} Отправьте кнопку или /done чтобы пропустить
  `.trim());
}

async function handlePostButton(chatId, text, session) {
  if (text === '/done' || text === '/skip') {
    return handlePostChannelSelect(chatId, session);
  }

  const parts = text.split('|').map(s => s.trim());
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    await sendMessage(chatId, `${ICONS.ERROR} Формат: <code>Текст | URL</code> или <code>Текст | miniapp</code>\nИли /done чтобы продолжить.`);
    return;
  }

  const btnText = parts[0];
  const btnTarget = parts[1];

  if (btnTarget.toLowerCase() === 'miniapp') {
    const appUrl = config.maxAppUrl || config.appUrl;
    session.postButtons.push({ text: btnText, url: appUrl, web_app: true });
  } else {
    session.postButtons.push({ text: btnText, url: btnTarget });
  }
  await getAdminSession().set(String(chatId), session);

  await sendMessage(chatId, `${ICONS.SUCCESS} Кнопка «${btnText}» добавлена (всего: ${session.postButtons.length}).\n\n${ICONS.ARROW} Ещё кнопку или /done`);
}

async function handlePostChannelSelect(chatId, session) {
  const channels = session.channels;
  if (channels.length === 1) {
    session.selectedChannelId = channels[0].id;
    session.selectedChannelName = channels[0].name;
    return handlePostPreview(chatId, session);
  }

  session.state = 'post_awaiting_channel';
  await getAdminSession().set(String(chatId), session);

  const channelList = channels.map((ch, i) => `  ${i + 1}. ${ch.name}`).join('\n');
  await sendMessage(chatId, `
<b>▸ Канал</b>
${ICONS.DIVIDER}

${channelList}

${ICONS.ARROW} Отправьте номер канала
  `.trim());
}

async function handlePostChannelChoice(chatId, text, session) {
  const idx = parseInt(text) - 1;
  if (isNaN(idx) || idx < 0 || idx >= session.channels.length) {
    await sendMessage(chatId, `${ICONS.ERROR} Введите номер от 1 до ${session.channels.length}`);
    return;
  }
  session.selectedChannelId = session.channels[idx].id;
  session.selectedChannelName = session.channels[idx].name;
  return handlePostPreview(chatId, session);
}

async function handlePostPreview(chatId, session) {
  session.state = 'post_awaiting_confirm';
  await getAdminSession().set(String(chatId), session);

  const buttonsPreview = session.postButtons.length
    ? `\n\n<b>Кнопки:</b> ${session.postButtons.map(b => b.web_app ? `[${b.text} 📲]` : `[${b.text} ↗]`).join(' ')}`
    : '';
  const mediaLabel = session.postMedia
    ? { photo: '🖼 Фото', video: '🎬 Видео', animation: '🎞 GIF' }[session.postMedia.type] || '📎 Медиа'
    : null;
  const mediaPreview = mediaLabel ? `\n<b>Медиа:</b> ${mediaLabel}` : '';

  await sendMessage(chatId, `
<b>▸ Предпросмотр</b>
${ICONS.DIVIDER}

<b>Канал:</b> ${session.selectedChannelName}${mediaPreview}
${buttonsPreview}

<b>Сообщение:</b>

${session.postText}

${ICONS.DIVIDER}
${ICONS.ARROW} /send — отправить
${ICONS.ARROW} /cancel — отмена
  `.trim());
}

async function handlePostSend(chatId, session) {
  try {
    const replyMarkup = session.postButtons.length
      ? { inline_keyboard: [session.postButtons.map(b => b.web_app ? { text: b.text, web_app: { url: b.url } } : { text: b.text, url: b.url })] }
      : undefined;

    const media = session.postMedia;
    if (media) {
      // Send via file_id — no need to re-download
      const methodMap = { photo: 'sendPhoto', video: 'sendVideo', animation: 'sendAnimation' };
      const fieldMap = { photo: 'photo', video: 'video', animation: 'animation' };
      const method = methodMap[media.type] || 'sendPhoto';
      const field = fieldMap[media.type] || 'photo';

      const payload = {
        chat_id: session.selectedChannelId,
        [field]: media.file_id,
        parse_mode: 'HTML',
      };
      if (session.postText) payload.caption = session.postText;
      if (replyMarkup) payload.reply_markup = replyMarkup;

      await axios.post(`${TELEGRAM_API}/${method}`, payload);
    } else {
      // Text-only post
      await postToChannel({
        message: session.postText,
        channel_id: session.selectedChannelId,
        parse_mode: 'HTML',
        buttons: session.postButtons.length ? session.postButtons : undefined,
      });
    }

    await getAdminSession().delete(String(chatId));
    await sendMessage(chatId, `${ICONS.SUCCESS} <b>Опубликовано</b> в ${session.selectedChannelName}`, {
      reply_markup: getAdminKeyboard()
    });
  } catch (err) {
    console.error('Bot /post send error:', err.response?.data || err.message);
    await sendMessage(chatId, `${ICONS.ERROR} Ошибка отправки: ${err.response?.data?.description || err.message}`);
  }
}

// --- /giveaway command flow ---

async function handleGiveawayCommand(chatId) {
  const channels = await getConfiguredChannels();
  if (!channels.length) {
    await sendMessage(chatId, `<b>${ICONS.ERROR}</b> Нет настроенных каналов. Добавьте канал в разделе «Розыгрыш» панели управления.`);
    return;
  }

  await getAdminSession().set(String(chatId), {
    state: 'giveaway_awaiting_title',
    channels
  });

  await sendMessage(chatId, `
<b>▸ Создание розыгрыша</b>
${ICONS.DIVIDER}

<b>Шаг 1/6</b> — Название розыгрыша

${ICONS.ARROW} Отправьте название или /cancel
  `.trim());
}

async function handleGiveawayTitle(chatId, text, session) {
  session.gTitle = text;
  session.state = 'giveaway_awaiting_description';
  await getAdminSession().set(String(chatId), session);

  await sendMessage(chatId, `
<b>▸ Шаг 2/6</b> — Описание

${ICONS.ARROW} Отправьте описание или /skip
  `.trim());
}

async function handleGiveawayDescription(chatId, text, session) {
  session.gDescription = (text === '/skip') ? null : text;
  session.state = 'giveaway_awaiting_prizes';
  await getAdminSession().set(String(chatId), session);

  await sendMessage(chatId, `
<b>▸ Шаг 3/6</b> — Призы

Опишите призы одним сообщением.

${ICONS.ARROW} Отправьте описание призов или /skip
  `.trim());
}

async function handleGiveawayPrizes(chatId, text, session) {
  session.gPrizes = (text === '/skip') ? null : text;
  session.state = 'giveaway_awaiting_media';
  await getAdminSession().set(String(chatId), session);

  await sendMessage(chatId, `
<b>▸ Шаг 4/6</b> — Изображение

Отправьте фото для розыгрыша.

${ICONS.ARROW} Или /skip чтобы пропустить
  `.trim());
}

async function handleGiveawayMedia(chatId, text, media, session) {
  if (media) {
    session.gMedia = media;
  } else if (text !== '/skip' && text !== '/done') {
    await sendMessage(chatId, `${ICONS.ERROR} Отправьте фото или /skip`);
    return;
  }
  session.state = 'giveaway_awaiting_winners';
  await getAdminSession().set(String(chatId), session);

  await sendMessage(chatId, `
<b>▸ Шаг 5/6</b> — Количество победителей

${ICONS.ARROW} Отправьте число (например: <code>1</code>, <code>3</code>, <code>5</code>)
  `.trim());
}

async function handleGiveawayWinners(chatId, text, session) {
  const count = parseInt(text);
  if (isNaN(count) || count < 1 || count > 100) {
    await sendMessage(chatId, `${ICONS.ERROR} Введите число от 1 до 100`);
    return;
  }
  session.gWinnerCount = count;
  session.state = 'giveaway_awaiting_endtime';
  await getAdminSession().set(String(chatId), session);

  await sendMessage(chatId, `
<b>▸ Шаг 6/6</b> — Дата окончания

Формат: <code>ДД.ММ.ГГГГ ЧЧ:ММ</code> (МСК)
Например: <code>15.04.2026 18:00</code>

${ICONS.ARROW} Отправьте дату
  `.trim());
}

async function handleGiveawayEndTime(chatId, text, session) {
  // Parse DD.MM.YYYY HH:MM in Moscow time
  const m = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})$/);
  if (!m) {
    await sendMessage(chatId, `${ICONS.ERROR} Формат: <code>ДД.ММ.ГГГГ ЧЧ:ММ</code>`);
    return;
  }

  const [, day, month, year, hour, minute] = m;
  // Create date in Moscow timezone (UTC+3)
  const dateStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute}:00+03:00`;
  const endTime = new Date(dateStr);

  if (isNaN(endTime.getTime())) {
    await sendMessage(chatId, `${ICONS.ERROR} Некорректная дата.`);
    return;
  }
  if (endTime <= new Date()) {
    await sendMessage(chatId, `${ICONS.ERROR} Дата должна быть в будущем.`);
    return;
  }

  session.gEndTime = endTime.toISOString();

  // Channel selection
  const channels = session.channels;
  if (channels.length === 1) {
    session.gChannelIds = [channels[0].id];
    return handleGiveawayPreview(chatId, session);
  }

  session.state = 'giveaway_awaiting_channels';
  await getAdminSession().set(String(chatId), session);

  const channelList = channels.map((ch, i) => `  ${i + 1}. ${ch.name}`).join('\n');
  await sendMessage(chatId, `
<b>▸ Каналы для розыгрыша</b>
${ICONS.DIVIDER}

${channelList}

${ICONS.ARROW} Отправьте номера через запятую (например: <code>1,2</code>) или <code>all</code>
  `.trim());
}

async function handleGiveawayChannels(chatId, text, session) {
  const channels = session.channels;
  let selectedIds;

  if (text.toLowerCase() === 'all') {
    selectedIds = channels.map(c => c.id);
  } else {
    const indices = text.split(',').map(s => parseInt(s.trim()) - 1);
    const invalid = indices.some(i => isNaN(i) || i < 0 || i >= channels.length);
    if (invalid) {
      await sendMessage(chatId, `${ICONS.ERROR} Введите номера от 1 до ${channels.length} через запятую`);
      return;
    }
    selectedIds = indices.map(i => channels[i].id);
  }

  session.gChannelIds = selectedIds;
  return handleGiveawayPreview(chatId, session);
}

async function handleGiveawayPreview(chatId, session) {
  session.state = 'giveaway_awaiting_confirm';
  await getAdminSession().set(String(chatId), session);

  const channels = session.channels;
  const selectedNames = session.gChannelIds.map(id => {
    const ch = channels.find(c => c.id === id);
    return ch ? ch.name : id;
  }).join(', ');

  const endDate = new Date(session.gEndTime).toLocaleString('ru-RU', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow'
  });

  const gMediaLabel = session.gMedia
    ? { photo: '🖼 Фото', video: '🎬 Видео', animation: '🎞 GIF' }[session.gMedia.type] || '📎 Медиа'
    : null;

  await sendMessage(chatId, `
<b>▸ Предпросмотр розыгрыша</b>
${ICONS.DIVIDER}

🎁 <b>${session.gTitle}</b>
${session.gDescription ? `\n${session.gDescription}` : ''}
${session.gPrizes ? `\n🏆 Призы: ${session.gPrizes}` : ''}

👥 Победителей: ${session.gWinnerCount}
⏰ Розыгрыш: ${endDate} МСК
📢 Каналы: ${selectedNames}${gMediaLabel ? `\n${gMediaLabel}` : ''}

${ICONS.DIVIDER}
${ICONS.ARROW} /confirm — создать и опубликовать
${ICONS.ARROW} /cancel — отмена
  `.trim());
}

async function handleGiveawayConfirm(chatId, session) {
  try {
    const { buildGiveawayPost, buildParticipateButton } = require('../admin/giveaways/helpers');

    // Insert giveaway into DB
    const { rows } = await pool.query(
      `INSERT INTO giveaways (title, description, prizes, winner_count, channel_ids, end_time)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [session.gTitle, session.gDescription || null, session.gPrizes || null,
       session.gWinnerCount, session.gChannelIds, session.gEndTime]
    );
    const giveaway = rows[0];

    const postText = buildGiveawayPost(giveaway);
    const button = buildParticipateButton(giveaway.id);
    const messageIds = {};
    const media = session.gMedia;

    for (const channelId of session.gChannelIds) {
      try {
        if (media) {
          const methodMap = { photo: 'sendPhoto', video: 'sendVideo', animation: 'sendAnimation' };
          const fieldMap = { photo: 'photo', video: 'video', animation: 'animation' };
          const method = methodMap[media.type] || 'sendPhoto';
          const field = fieldMap[media.type] || 'photo';

          const payload = {
            chat_id: channelId,
            [field]: media.file_id,
            caption: postText,
            parse_mode: 'HTML',
            reply_markup: button,
          };
          const resp = await axios.post(`${TELEGRAM_API}/${method}`, payload);
          messageIds[channelId] = resp.data.result?.message_id;
        } else {
          const resp = await axios.post(`${TELEGRAM_API}/sendMessage`, {
            chat_id: channelId,
            text: postText,
            parse_mode: 'HTML',
            reply_markup: button,
          });
          messageIds[channelId] = resp.data.result?.message_id;
        }
      } catch (err) {
        console.error(`Failed to post giveaway to channel ${channelId}:`, err.response?.data || err.message);
      }
    }

    await pool.query('UPDATE giveaways SET message_ids = $1 WHERE id = $2', [messageIds, giveaway.id]);

    await getAdminSession().delete(String(chatId));
    await sendMessage(chatId, `${ICONS.SUCCESS} <b>Розыгрыш создан и опубликован!</b>\n\nНазвание: ${session.gTitle}`, {
      reply_markup: getAdminKeyboard()
    });
  } catch (err) {
    console.error('Bot /giveaway create error:', err.message);
    await sendMessage(chatId, `${ICONS.ERROR} Ошибка создания: ${err.message}`);
  }
}

/**
 * Main webhook handler
 */
module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).send('Admin Bot Webhook Active');
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { message, callback_query, action } = req.body;

    // Handle callback queries (inline button clicks)
    if (callback_query) {
      const chatId = callback_query.message?.chat?.id;
      const userId = callback_query.from.id;
      const data = callback_query.data;

      // Giveaway join — open to all users, no admin check
      if (data?.startsWith('giveaway_join:')) {
        const giveawayId = data.replace('giveaway_join:', '');
        const { first_name, username } = callback_query.from;
        let answerText;
        try {
          const { getPool } = require('../../lib/db');
          const dbPool = getPool();
          const checkRes = await dbPool.query(
            `SELECT status FROM giveaways WHERE id = $1`,
            [giveawayId]
          );
          if (!checkRes.rows.length || checkRes.rows[0].status !== 'active') {
            answerText = 'Розыгрыш уже завершён.';
          } else {
            await dbPool.query(
              `INSERT INTO giveaway_participants (giveaway_id, user_id, username, first_name)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (giveaway_id, user_id) DO NOTHING`,
              [giveawayId, userId, username || null, first_name || null]
            );
            answerText = 'Вы участвуете! 🎉';
          }
        } catch (err) {
          console.error('giveaway_join error:', err.message);
          answerText = 'Ошибка. Попробуйте позже.';
        }
        await axios.post(`${TELEGRAM_API}/answerCallbackQuery`, {
          callback_query_id: callback_query.id,
          text: answerText,
          show_alert: false
        });
        return res.status(200).json({ ok: true });
      }

      // Answer callback to remove loading state
      await axios.post(`${TELEGRAM_API}/answerCallbackQuery`, {
        callback_query_id: callback_query.id
      });

      if (!await isAdmin(userId)) {
        return res.status(200).json({ ok: true });
      }

      return res.status(200).json({ ok: true });
    }

    // Handle API calls from backend (notifications)
    if (action) {
      if (action === 'notify_new_order') {
        await notifyAdminsNewOrder(req.body.order_id);
        return res.status(200).json({ ok: true });
      } else if (action === 'notify_payment' || action === 'notify_payment_received') {
        await notifyAdminsPaymentReceived(req.body.order_id, req.body.payment_id);
        return res.status(200).json({ ok: true });
      } else if (action === 'notify_refund_request') {
        await notifyAdminsRefundRequest(req.body.order_id, req.body.user_id, req.body.refund_reason, req.body.total_amount);
        return res.status(200).json({ ok: true });
      } else if (action === 'post_to_channel') {
        const requireAdminAuth = require('../../server/middleware/admin-auth');
        let adminAuthed = false;
        await new Promise(resolve => requireAdminAuth(req, res, () => { adminAuthed = true; resolve(); }));
        if (!adminAuthed) return;
        const result = await postToChannel(req.body);
        return res.status(200).json(result);
      }
      return res.status(400).json({ error: 'Unknown action' });
    }

    // Handle text messages, photos, and videos
    if (message) {
      const chatId = message.chat.id;
      const text = message.text || message.caption || '';
      const adminId = message.from.id;

      // Extract media if present
      let media = null;
      if (message.photo?.length) {
        // Telegram sends multiple sizes; pick the largest
        media = { type: 'photo', file_id: message.photo[message.photo.length - 1].file_id };
      } else if (message.video) {
        media = { type: 'video', file_id: message.video.file_id };
      } else if (message.animation) {
        media = { type: 'animation', file_id: message.animation.file_id };
      }

      // Verify admin
      if (!await isAdmin(adminId)) {
        await sendMessage(chatId, `<b>${ICONS.ERROR} Доступ запрещен</b>\n\nУ вас нет прав администратора.`);
        return res.status(200).json({ ok: true });
      }

      // Global cancel — works in any session state
      if (text === '/cancel') {
        const session = await getAdminSession().get(String(chatId));
        if (session) {
          await getAdminSession().delete(String(chatId));
          await sendMessage(chatId, `${ICONS.INFO} Отменено.`, { reply_markup: getAdminKeyboard() });
        } else {
          await sendMessage(chatId, `${ICONS.INFO} Нет активной операции.`, { reply_markup: getAdminKeyboard() });
        }
        return res.status(200).json({ ok: true });
      }

      // Check if admin is in a special state
      const session = await getAdminSession().get(String(chatId));

      if (session) {
        switch (session.state) {
          case 'awaiting_tracking':
            await handleTrackingNumberInput(chatId, session.orderId, text.trim());
            await getAdminSession().delete(String(chatId));
            break;

          // /post flow
          case 'post_awaiting_text':
            await handlePostText(chatId, text, media, session);
            break;
          case 'post_awaiting_media':
            await handlePostMedia(chatId, text, media, session);
            break;
          case 'post_awaiting_buttons':
            await handlePostButton(chatId, text, session);
            break;
          case 'post_awaiting_channel':
            await handlePostChannelChoice(chatId, text, session);
            break;
          case 'post_awaiting_confirm':
            if (text === '/send') {
              await handlePostSend(chatId, session);
            } else {
              await sendMessage(chatId, `${ICONS.ARROW} /send — отправить, /cancel — отмена`);
            }
            break;

          // /giveaway flow
          case 'giveaway_awaiting_title':
            await handleGiveawayTitle(chatId, text, session);
            break;
          case 'giveaway_awaiting_description':
            await handleGiveawayDescription(chatId, text, session);
            break;
          case 'giveaway_awaiting_prizes':
            await handleGiveawayPrizes(chatId, text, session);
            break;
          case 'giveaway_awaiting_media':
            await handleGiveawayMedia(chatId, text, media, session);
            break;
          case 'giveaway_awaiting_winners':
            await handleGiveawayWinners(chatId, text, session);
            break;
          case 'giveaway_awaiting_endtime':
            await handleGiveawayEndTime(chatId, text, session);
            break;
          case 'giveaway_awaiting_channels':
            await handleGiveawayChannels(chatId, text, session);
            break;
          case 'giveaway_awaiting_confirm':
            if (text === '/confirm') {
              await handleGiveawayConfirm(chatId, session);
            } else {
              await sendMessage(chatId, `${ICONS.ARROW} /confirm — создать, /cancel — отмена`);
            }
            break;

          default:
            await getAdminSession().delete(String(chatId));
            break;
        }
      } else {
        // Handle commands and button presses
        if (text === '📊 Статус') {
          await handleStatusRequest(chatId);
        } else if (text === '/post' || text === '📢 Пост в канал') {
          await handlePostCommand(chatId);
        } else if (text === '/giveaway' || text === '🎁 Розыгрыш') {
          await handleGiveawayCommand(chatId);
        } else if (text === '/start' || text === '/help') {
          await sendMessage(chatId, `
<b>TR/BUTE Admin Bot</b>
${ICONS.DIVIDER}

<b>Команды:</b>
  ${ICONS.BULLET} /post — публикация в канал
  ${ICONS.BULLET} /giveaway — создать розыгрыш
  ${ICONS.BULLET} /help — эта справка

<b>Уведомления:</b>
  ${ICONS.BULLET} Новые заказы
  ${ICONS.BULLET} Полученные платежи
  ${ICONS.BULLET} Запросы на возврат
          `.trim(), {
            reply_markup: getAdminKeyboard()
          });
        }
      }

      return res.status(200).json({ ok: true });
    }

    return res.status(200).json({ ok: true });

  } catch (error) {
    console.error('Error in admin bot webhook:', error);
    return res.status(200).json({ ok: true }); // Always return 200 to Telegram
  }
};

// Export helper functions for use in other modules
module.exports.notifyAdminsNewOrder = notifyAdminsNewOrder;
module.exports.notifyAdminsPaymentReceived = notifyAdminsPaymentReceived;
module.exports.notifyAdminsOrderCancelled = notifyAdminsOrderCancelled;

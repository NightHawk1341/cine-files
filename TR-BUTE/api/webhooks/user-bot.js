/**
 * User Bot Webhook Handler
 * Handles customer interactions via Telegram bot
 * Features: Menu keyboard, FAQ system, product search, order tracking
 */

const { getPool } = require('../../lib/db');
const axios = require('axios');
const config = require('../../lib/config');
const { getSessionStore } = require('../../lib/session-store');
const { applyCustomEmoji } = require('../../lib/tg-emoji');

const pool = getPool();

const BOT_TOKEN = config.telegram.userBotToken;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// Telegram Mini App domain - always use Vercel domain for Telegram web_app buttons
// This ensures web_app buttons work correctly even if main appUrl is different
const TELEGRAM_APP_URL = 'https://buy-tribute.vercel.app';

// Session storage getter (called at request time to pick up Redis when available)
const getUserSession = () => getSessionStore('user');

// Default greeting texts
const DEFAULT_GREETINGS = {
  telegram_private: '👋 Добро пожаловать в TR/BUTE!\n\nЯ помогу вам:\n• Найти нужный постер по названию\n• Отследить ваши заказы\n• Ответить на частые вопросы\n\nВыберите действие из меню ниже:',
  telegram_group: `👋 Добро пожаловать в TR/BUTE!\n\nОткройте наш магазин, чтобы посмотреть каталог и сделать заказ.\n\n${TELEGRAM_APP_URL}`
};

// Cache greetings to avoid querying DB on every message
let cachedGreetings = null;
let greetingsCacheTime = 0;
const GREETINGS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getGreetings() {
  if (cachedGreetings && Date.now() - greetingsCacheTime < GREETINGS_CACHE_TTL) {
    return cachedGreetings;
  }
  try {
    const result = await pool.query("SELECT value FROM app_settings WHERE key = 'bot_greetings'");
    if (result.rows.length > 0) {
      const val = result.rows[0].value;
      cachedGreetings = {
        telegram_private: val.telegram_private ?? DEFAULT_GREETINGS.telegram_private,
        telegram_group: val.telegram_group ?? DEFAULT_GREETINGS.telegram_group,
        telegram_greeting_enabled: val.telegram_greeting_enabled !== false
      };
    } else {
      cachedGreetings = { ...DEFAULT_GREETINGS, telegram_greeting_enabled: true };
    }
  } catch {
    cachedGreetings = { ...DEFAULT_GREETINGS, telegram_greeting_enabled: true };
  }
  greetingsCacheTime = Date.now();
  return cachedGreetings;
}

/**
 * Send message to Telegram user
 * Returns message_id on success, null on failure
 */
async function sendMessage(chatId, text, options = {}) {
  try {
    const response = await axios.post(`${TELEGRAM_API}/sendMessage`, {
      chat_id: chatId,
      text: applyCustomEmoji(text),
      parse_mode: 'HTML',
      ...options
    });
    return response.data?.result?.message_id || null;
  } catch (error) {
    console.error('Error sending message:', error.response?.data || error.message);
    return null;
  }
}

/**
 * Send photo to Telegram user
 */
async function sendPhoto(chatId, photoUrl, caption, options = {}) {
  try {
    await axios.post(`${TELEGRAM_API}/sendPhoto`, {
      chat_id: chatId,
      photo: photoUrl,
      caption: applyCustomEmoji(caption),
      parse_mode: 'HTML',
      ...options
    });
  } catch (error) {
    console.error('Error sending photo:', error.response?.data || error.message);
  }
}

/**
 * Main keyboard menu
 */
function getMainKeyboard() {
  return {
    keyboard: [
      [{ text: '❓ FAQ' }, { text: '🔍 Найти постер' }],
      [{ text: '📦 Мои заказы' }, { text: '💬 Поддержка' }],
      [{ text: '🎴 Подборщик' }, { text: '❤️ Избранное' }]
    ],
    resize_keyboard: true
  };
}

// ============================================================
// PICKER & FAVORITES HELPERS
// ============================================================

let _pickerProductsCache = null;
let _pickerProductsCacheTime = 0;
const PICKER_PRODUCTS_CACHE_TTL = 5 * 60 * 1000;

let _defaultPricesCache = null;
let _defaultPricesCacheTime = 0;
const PRICES_CACHE_TTL = 10 * 60 * 1000;

const FAV_PAGE_SIZE = 7;

function shuffleArray(arr) {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function pluralForm(n, one, two, five) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 19) return five;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return two;
  return five;
}

async function deleteMessage(chatId, messageId) {
  try {
    await axios.post(`${TELEGRAM_API}/deleteMessage`, { chat_id: chatId, message_id: messageId });
    return true;
  } catch { return false; }
}

async function removeInlineKeyboard(chatId, messageId) {
  try {
    await axios.post(`${TELEGRAM_API}/editMessageReplyMarkup`, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: [] }
    });
    return true;
  } catch { return false; }
}

async function getDefaultPrices() {
  if (_defaultPricesCache && Date.now() - _defaultPricesCacheTime < PRICES_CACHE_TTL) {
    return _defaultPricesCache;
  }
  try {
    const result = await pool.query('SELECT discount_price, base_price FROM product_prices WHERE id = 1');
    _defaultPricesCache = result.rows[0] || { discount_price: 0, base_price: 0 };
  } catch {
    _defaultPricesCache = { discount_price: 0, base_price: 0 };
  }
  _defaultPricesCacheTime = Date.now();
  return _defaultPricesCache;
}

function formatProductPrice(product, defaultPrices) {
  let price;
  if (product.price && Number(product.price) > 0) {
    price = Number(product.price);
  } else {
    price = product.discount
      ? Number(defaultPrices.discount_price)
      : Number(defaultPrices.base_price);
    if (product.triptych) price *= 3;
  }
  if (!price || price === 0) return 'Цена не указана';
  if (product.discount) {
    const oldPrice = (product.old_price && Number(product.old_price) > 0)
      ? Number(product.old_price)
      : Number(defaultPrices.base_price) * (product.triptych ? 3 : 1);
    if (oldPrice && oldPrice !== price) return `${price} ₽ (было ${oldPrice} ₽)`;
  }
  return `${price} ₽`;
}

async function getInternalUserId(telegramUserId) {
  try {
    const result = await pool.query('SELECT id FROM users WHERE telegram_id = $1 LIMIT 1', [telegramUserId]);
    if (result.rows.length > 0) return result.rows[0].id;
  } catch { /* ignore */ }
  return telegramUserId;
}

async function getEligiblePickerProducts() {
  if (_pickerProductsCache && Date.now() - _pickerProductsCacheTime < PICKER_PRODUCTS_CACHE_TTL) {
    return _pickerProductsCache;
  }
  try {
    const result = await pool.query(`
      SELECT p.id, p.title, p.slug, p.price, p.old_price, p.discount, p.triptych, p.alt,
             pi.url as image_url
      FROM products p
      LEFT JOIN LATERAL (
        SELECT url FROM product_images
        WHERE product_id = p.id
        ORDER BY CASE WHEN extra = 'обложка' THEN 0 ELSE 1 END, sort_order
        LIMIT 1
      ) pi ON true
      WHERE p.type = 'фирменный' AND p.status = 'available'
        AND (p.triptych IS NULL OR p.triptych = false) AND p.id != 1
      ORDER BY p.sort_order, p.created_at DESC
    `);
    _pickerProductsCache = result.rows;
  } catch {
    _pickerProductsCache = [];
  }
  _pickerProductsCacheTime = Date.now();
  return _pickerProductsCache;
}

async function savePickerSession(userId, products, currentIndex, history) {
  const productsJson = JSON.stringify(products);
  const historyJson = JSON.stringify(history);
  const upd = await pool.query(
    'UPDATE user_picker_progress SET products = $2, current_index = $3, history = $4, updated_at = NOW() WHERE user_id = $1',
    [userId, productsJson, currentIndex, historyJson]
  );
  if (upd.rowCount === 0) {
    await pool.query(
      'INSERT INTO user_picker_progress (user_id, products, current_index, history, updated_at) VALUES ($1, $2, $3, $4, NOW())',
      [userId, productsJson, currentIndex, historyJson]
    );
  }
}

function buildPickerKeyboard(productUrl) {
  return {
    inline_keyboard: [
      [
        { text: '✖️ Пропустить', callback_data: 'picker_skip' },
        { text: '❤️ Нравится', callback_data: 'picker_like' }
      ],
      [
        { text: '🛍 Открыть', web_app: { url: productUrl } }
      ]
    ]
  };
}

function buildPickerCaption(product) {
  return `<b>${product.title}</b>\n@buy_tribute`;
}

async function sendPickerCard(chatId, product) {
  const productUrl = `${TELEGRAM_APP_URL}/product/${product.slug || product.id}`;
  const caption = buildPickerCaption(product);
  const keyboard = buildPickerKeyboard(productUrl);
  try {
    const response = await axios.post(`${TELEGRAM_API}/sendPhoto`, {
      chat_id: chatId,
      photo: product.image_url || `${TELEGRAM_APP_URL}/og-image.png`,
      caption,
      parse_mode: 'HTML',
      reply_markup: keyboard
    });
    return response.data?.result?.message_id || null;
  } catch (error) {
    console.error('Error sending picker card:', error.response?.data || error.message);
    return null;
  }
}

async function editPickerCard(chatId, messageId, product) {
  const productUrl = `${TELEGRAM_APP_URL}/product/${product.slug || product.id}`;
  const caption = buildPickerCaption(product);
  const keyboard = buildPickerKeyboard(productUrl);
  const photoUrl = product.image_url || `${TELEGRAM_APP_URL}/og-image.png`;
  try {
    await axios.post(`${TELEGRAM_API}/editMessageMedia`, {
      chat_id: chatId,
      message_id: messageId,
      media: { type: 'photo', media: photoUrl, caption, parse_mode: 'HTML' },
      reply_markup: keyboard
    });
    return true;
  } catch (error) {
    console.error('Error editing picker card:', error.response?.data || error.message);
    return false;
  }
}

// ============================================================
// PICKER FLOW
// ============================================================

async function handlePickerStart(chatId, telegramUserId) {
  try {
    const internalUserId = await getInternalUserId(telegramUserId);
    const allProducts = await getEligiblePickerProducts();

    if (allProducts.length === 0) {
      await sendMessage(chatId, 'Подборщик временно недоступен. Попробуйте позже.', { reply_markup: getMainKeyboard() });
      return;
    }

    const sessionResult = await pool.query(
      'SELECT products, current_index, history FROM user_picker_progress WHERE user_id = $1',
      [internalUserId]
    );

    const eligibleIds = new Set(allProducts.map(p => p.id));
    let productIds = null;
    let currentIndex = 0;
    let history = [];

    if (sessionResult.rows.length > 0) {
      const row = sessionResult.rows[0];
      const filtered = (row.products || []).filter(id => eligibleIds.has(id));
      const idx = row.current_index || 0;
      if (filtered.length > 0 && idx < filtered.length) {
        productIds = filtered;
        currentIndex = idx;
        history = row.history || [];
      }
    }

    if (!productIds) {
      const favResult = await pool.query('SELECT product_id FROM user_favorites WHERE user_id = $1', [internalUserId]);
      const favIds = new Set(favResult.rows.map(r => r.product_id));
      const eligible = allProducts.filter(p => !favIds.has(p.id));
      if (eligible.length === 0) {
        await sendMessage(chatId, '🎉 Все доступные товары уже в вашем избранном!\n\nСмотрите их через «❤️ Избранное».', { reply_markup: getMainKeyboard() });
        return;
      }
      productIds = shuffleArray(eligible.map(p => p.id));
      currentIndex = 0;
      history = [];
      await savePickerSession(internalUserId, productIds, currentIndex, history);
    }

    const currentProduct = allProducts.find(p => p.id === productIds[currentIndex]);
    if (!currentProduct) {
      await sendMessage(chatId, 'Не удалось загрузить подборщик. Попробуйте позже.', { reply_markup: getMainKeyboard() });
      return;
    }

    const msgId = await sendPickerCard(chatId, currentProduct);

    if (msgId) {
      await getUserSession().set(String(chatId), { state: 'picker', pickerMessageId: msgId, pickerUserId: internalUserId });
    }
  } catch (error) {
    console.error('Error starting picker:', error);
    await sendMessage(chatId, 'Произошла ошибка при загрузке подборщика. Попробуйте позже.', { reply_markup: getMainKeyboard() });
  }
}

async function handlePickerAction(chatId, messageId, action, telegramUserId) {
  try {
    const session = await getUserSession().get(String(chatId));

    // User clicked buttons on a stale picker card (e.g. a notification arrived and a new
    // picker was started, or the session was reset). Strip the old card's buttons silently.
    if (session?.pickerMessageId && session.pickerMessageId !== messageId) {
      await removeInlineKeyboard(chatId, messageId);
      return;
    }

    const internalUserId = session?.pickerUserId || await getInternalUserId(telegramUserId);
    const pickerMessageId = session?.pickerMessageId || messageId;

    if (action === 'exit') {
      await deleteMessage(chatId, pickerMessageId);
      await getUserSession().delete(String(chatId));
      await sendMessage(chatId, 'Подборщик закрыт.', { reply_markup: getMainKeyboard() });
      return;
    }

    const sessionResult = await pool.query(
      'SELECT products, current_index, history FROM user_picker_progress WHERE user_id = $1',
      [internalUserId]
    );

    if (sessionResult.rows.length === 0) {
      await handlePickerStart(chatId, telegramUserId);
      return;
    }

    const allProducts = await getEligiblePickerProducts();
    const eligibleIds = new Set(allProducts.map(p => p.id));
    const row = sessionResult.rows[0];
    let productIds = (row.products || []).filter(id => eligibleIds.has(id));
    let currentIndex = row.current_index || 0;
    let history = row.history || [];
    let needDelete = false;

    if (action === 'shuffle') {
      const favResult = await pool.query('SELECT product_id FROM user_favorites WHERE user_id = $1', [internalUserId]);
      const favIds = new Set(favResult.rows.map(r => r.product_id));
      const eligible = allProducts.filter(p => !favIds.has(p.id));
      productIds = shuffleArray(eligible.map(p => p.id));
      currentIndex = 0;
      history = [];
      needDelete = true;
    } else if (action === 'like') {
      const productId = productIds[currentIndex];
      await pool.query(
        'INSERT INTO user_favorites (user_id, product_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [internalUserId, productId]
      );
      history.push({ index: currentIndex, action: 'right', productId });
      currentIndex++;
    } else if (action === 'skip') {
      const productId = productIds[currentIndex];
      history.push({ index: currentIndex, action: 'left', productId });
      currentIndex++;
    } else if (action === 'undo') {
      if (history.length === 0) return;
      const last = history.pop();
      if (last.action === 'right') {
        await pool.query('DELETE FROM user_favorites WHERE user_id = $1 AND product_id = $2', [internalUserId, last.productId]);
      }
      currentIndex = last.index;
    }

    await savePickerSession(internalUserId, productIds, currentIndex, history);

    // Skip product IDs that are no longer in the eligible set
    while (currentIndex < productIds.length && !allProducts.find(p => p.id === productIds[currentIndex])) {
      currentIndex++;
    }

    if (currentIndex >= productIds.length) {
      await deleteMessage(chatId, pickerMessageId);
      await getUserSession().delete(String(chatId));
      await sendMessage(chatId, '🎉 Вы просмотрели все доступные товары!\n\nНажмите «🎴 Подборщик» ещё раз, чтобы начать заново.', { reply_markup: getMainKeyboard() });
      return;
    }

    const currentProduct = allProducts.find(p => p.id === productIds[currentIndex]);

    let newMsgId = pickerMessageId;
    if (needDelete) {
      await deleteMessage(chatId, pickerMessageId);
      newMsgId = await sendPickerCard(chatId, currentProduct);
    } else {
      const edited = await editPickerCard(chatId, pickerMessageId, currentProduct);
      if (!edited) {
        await deleteMessage(chatId, pickerMessageId);
        newMsgId = await sendPickerCard(chatId, currentProduct);
      }
    }

    await getUserSession().set(String(chatId), {
      state: 'picker',
      pickerMessageId: newMsgId || pickerMessageId,
      pickerUserId: internalUserId
    });
  } catch (error) {
    console.error('Error in picker action:', error);
    await sendMessage(chatId, 'Произошла ошибка. Попробуйте снова или перезапустите подборщик.', { reply_markup: getMainKeyboard() });
  }
}

// ============================================================
// FAVORITES FLOW
// ============================================================

async function handleFavoritesList(chatId, telegramUserId, page = 0, editMsgId = null) {
  try {
    const internalUserId = await getInternalUserId(telegramUserId);
    const result = await pool.query(`
      SELECT p.id, p.title, p.slug
      FROM user_favorites uf
      JOIN products p ON uf.product_id = p.id
      WHERE uf.user_id = $1
      ORDER BY uf.created_at DESC
    `, [internalUserId]);

    if (result.rows.length === 0) {
      const text = '❤️ Ваш список избранного пуст.\n\nИспользуйте «🎴 Подборщик», чтобы найти понравившиеся товары!';
      if (editMsgId) {
        await editMessage(chatId, editMsgId, text, { reply_markup: { inline_keyboard: [] } });
        return editMsgId;
      } else {
        return await sendMessage(chatId, text, { reply_markup: getMainKeyboard() });
      }
    }

    const items = result.rows;
    const totalPages = Math.ceil(items.length / FAV_PAGE_SIZE);
    const pageItems = items.slice(page * FAV_PAGE_SIZE, (page + 1) * FAV_PAGE_SIZE);
    const count = items.length;

    const text = `❤️ <b>Избранное</b> (${count} ${pluralForm(count, 'товар', 'товара', 'товаров')}):`;

    const buttons = pageItems.map(p => [{
      text: p.title,
      web_app: { url: `${TELEGRAM_APP_URL}/product/${p.slug || p.id}` }
    }]);

    const navRow = [];
    if (page > 0) navRow.push({ text: '← Назад', callback_data: `fav_page_${page - 1}` });
    if (page < totalPages - 1) navRow.push({ text: 'Вперёд →', callback_data: `fav_page_${page + 1}` });
    if (navRow.length > 0) buttons.push(navRow);

    const opts = { reply_markup: { inline_keyboard: buttons } };
    if (editMsgId) {
      await editMessage(chatId, editMsgId, text, opts);
      return editMsgId;
    } else {
      return await sendMessage(chatId, text, opts);
    }
  } catch (error) {
    console.error('Error fetching favorites list:', error);
    await sendMessage(chatId, 'Произошла ошибка при загрузке избранного. Попробуйте позже.', { reply_markup: getMainKeyboard() });
    return null;
  }
}

/**
 * Handle /start command and main menu
 */
async function handleStart(chatId, userInfo) {
  const greetings = await getGreetings();
  if (!greetings.telegram_greeting_enabled || !greetings.telegram_private) return;

  await sendMessage(chatId, greetings.telegram_private, {
    reply_markup: getMainKeyboard()
  });
}

/**
 * Handle FAQ - show categories
 * Pass editMsgId to edit an existing message (e.g. faq_back) instead of sending new
 * Returns the message_id of the FAQ message (new or edited)
 */
async function handleFAQ(chatId, editMsgId = null) {
  try {
    const result = await pool.query(`
      SELECT id, title, icon, sort_order
      FROM faq_categories
      ORDER BY sort_order
    `);

    if (result.rows.length === 0) {
      await sendMessage(chatId, 'FAQ пока недоступны. Попробуйте позже.');
      return null;
    }

    const buttons = result.rows.map(cat => [{
      text: `${cat.icon} ${cat.title}`,
      callback_data: `faq_cat_${cat.id}`
    }]);

    // Add website FAQ link at the end
    buttons.push([{ text: 'Перейти на сайт FAQ', web_app: { url: `${TELEGRAM_APP_URL}/faq` } }]);

    if (editMsgId) {
      await editMessage(chatId, editMsgId, '❓ Выберите категорию:', {
        reply_markup: { inline_keyboard: buttons }
      });
      return editMsgId;
    }

    return await sendMessage(chatId, '❓ Выберите категорию:', {
      reply_markup: { inline_keyboard: buttons }
    });
  } catch (error) {
    console.error('Error fetching FAQ categories:', error);
    await sendMessage(chatId, 'Произошла ошибка. Попробуйте позже.');
    return null;
  }
}

/**
 * Handle FAQ category selection - show questions
 */
async function handleFAQCategory(chatId, messageId, categoryId) {
  try {
    const categoryResult = await pool.query(
      'SELECT title, icon FROM faq_categories WHERE id = $1',
      [categoryId]
    );

    if (categoryResult.rows.length === 0) {
      await sendMessage(chatId, 'Категория не найдена.');
      return;
    }

    const category = categoryResult.rows[0];

    const itemsResult = await pool.query(`
      SELECT id, question, sort_order
      FROM faq_items
      WHERE category_id = $1
      ORDER BY sort_order
    `, [categoryId]);

    if (itemsResult.rows.length === 0) {
      await sendMessage(chatId, `В категории "${category.title}" пока нет вопросов.`);
      return;
    }

    const buttons = itemsResult.rows.map(item => [{
      text: item.question,
      callback_data: `faq_item_${item.id}`
    }]);

    buttons.push([{ text: '← Назад', callback_data: 'faq_back' }]);
    buttons.push([{ text: 'Перейти на сайт FAQ', web_app: { url: `${TELEGRAM_APP_URL}/faq` } }]);

    await editMessage(chatId, messageId, `${category.icon} ${category.title}\n\nВыберите вопрос:`, {
      reply_markup: {
        inline_keyboard: buttons
      }
    });
  } catch (error) {
    console.error('Error fetching FAQ items:', error);
    await sendMessage(chatId, 'Произошла ошибка. Попробуйте позже.');
  }
}

/**
 * Handle FAQ item selection - show answer
 */
async function handleFAQItem(chatId, messageId, itemId) {
  try {
    const result = await pool.query(`
      SELECT f.question, f.answer, c.title as category_title, c.id as category_id
      FROM faq_items f
      JOIN faq_categories c ON f.category_id = c.id
      WHERE f.id = $1
    `, [itemId]);

    if (result.rows.length === 0) {
      await sendMessage(chatId, 'Вопрос не найден.');
      return;
    }

    const item = result.rows[0];
    const answerText = `
<b>${item.question}</b>

${item.answer}
    `.trim();

    await editMessage(chatId, messageId, answerText, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '← Назад к вопросам', callback_data: `faq_cat_${item.category_id}` }],
          [{ text: '← К категориям', callback_data: 'faq_back' }],
          [{ text: 'Перейти на сайт FAQ', web_app: { url: `${TELEGRAM_APP_URL}/faq` } }]
        ]
      }
    });
  } catch (error) {
    console.error('Error fetching FAQ item:', error);
    await sendMessage(chatId, 'Произошла ошибка. Попробуйте позже.');
  }
}

/**
 * Answer inline query with results
 */
async function answerInlineQuery(inlineQueryId, results, options = {}) {
  try {
    await axios.post(`${TELEGRAM_API}/answerInlineQuery`, {
      inline_query_id: inlineQueryId,
      results,
      cache_time: 30, // Cache for 30 seconds to reduce load
      is_personal: false,
      ...options
    });
  } catch (error) {
    console.error('Error answering inline query:', error.response?.data || error.message);
  }
}

/**
 * Handle inline query - search products as user types
 */
async function handleInlineQuery(inlineQuery) {
  const query = inlineQuery.query?.trim();
  const queryId = inlineQuery.id;

  // If query is too short, show placeholder
  if (!query || query.length < 2) {
    await answerInlineQuery(queryId, [], {
      switch_pm_text: '🔍 Введите название постера',
      switch_pm_parameter: 'search'
    });
    return;
  }

  try {
    // Get default prices from product_prices (ID 1 = A3 без рамки)
    const pricesResult = await pool.query(`
      SELECT discount_price, base_price FROM product_prices WHERE id = 1
    `);
    const defaultPrices = pricesResult.rows[0] || { discount_price: 0, base_price: 0 };

    // Search products - include status, discount, triptych, alt fields
    // Search by title, key_word, and alt for comprehensive matching
    const result = await pool.query(`
      SELECT p.id, p.title, p.slug, p.status, p.price, p.old_price,
             p.discount, p.triptych, p.type, p.key_word, p.alt, pi.url as image_url
      FROM products p
      LEFT JOIN LATERAL (
        SELECT url FROM product_images
        WHERE product_id = p.id
        ORDER BY CASE WHEN extra = 'Сборка обложки' THEN 0 ELSE 1 END, sort_order
        LIMIT 1
      ) pi ON true
      WHERE p.status IN ('available', 'coming_soon', 'not_for_sale')
        AND (
          LOWER(p.title) LIKE LOWER($1) OR LOWER(p.key_word) LIKE LOWER($1) OR LOWER(p.alt) LIKE LOWER($1)
          OR word_similarity($2, p.title) > 0.3
          OR word_similarity($2, COALESCE(p.key_word, '')) > 0.3
          OR word_similarity($2, COALESCE(p.alt, '')) > 0.3
        )
      ORDER BY
        CASE WHEN LOWER(p.title) LIKE LOWER($1) OR LOWER(p.key_word) LIKE LOWER($1) OR LOWER(p.alt) LIKE LOWER($1) THEN 0 ELSE 1 END,
        GREATEST(
          word_similarity($2, p.title),
          word_similarity($2, COALESCE(p.key_word, '')),
          word_similarity($2, COALESCE(p.alt, ''))
        ) DESC,
        p.sort_order, p.created_at DESC
      LIMIT 10
    `, [`%${query}%`, query]);

    if (result.rows.length === 0) {
      await answerInlineQuery(queryId, [], {
        switch_pm_text: `Ничего не найдено по "${query}"`,
        switch_pm_parameter: 'search'
      });
      return;
    }

    // Helper to optimize image URL for thumbnails
    const optimizeImageUrl = (url) => {
      if (!url) return null;
      // Replace cs= value for faster loading
      if (url.includes('cs=')) {
        return url.replace(/cs=\d+x\d+/, 'cs=480x0');
      }
      const separator = url.includes('?') ? '&' : '?';
      return `${url}${separator}cs=480x0`;
    };

    // Helper to calculate price like frontend does
    const getPrice = (product) => {
      // Priority 1: Product-specific price
      if (product.price && Number(product.price) > 0) {
        return Number(product.price);
      }
      // Priority 2: Default prices table (discount_price if discount, else base_price)
      let price = product.discount
        ? Number(defaultPrices.discount_price)
        : Number(defaultPrices.base_price);
      // Triptych = 3 panels
      if (product.triptych) price *= 3;
      return price;
    };

    // Helper to get old price (only if discount is active)
    const getOldPrice = (product) => {
      if (!product.discount) return null;
      // Priority 1: Product-specific old_price
      if (product.old_price && Number(product.old_price) > 0) {
        return Number(product.old_price);
      }
      // Priority 2: Default base_price as old price
      let oldPrice = Number(defaultPrices.base_price);
      if (product.triptych) oldPrice *= 3;
      return oldPrice;
    };

    // Format results - use article type for list view (not photo grid)
    const results = result.rows.map(product => {
      const productUrl = `${TELEGRAM_APP_URL}/product/${product.slug || product.id}`;
      const thumbnailImage = optimizeImageUrl(product.image_url);
      // For sent message, also use optimized image
      const messageImage = optimizeImageUrl(product.image_url);

      // Handle special statuses - build price text for description
      let priceText;
      let priceTextHtml;
      if (product.status === 'coming_soon') {
        priceText = 'Скоро';
        priceTextHtml = 'Скоро';
      } else if (product.status === 'not_for_sale') {
        priceText = 'Не в продаже';
        priceTextHtml = 'Не в продаже';
      } else {
        const price = getPrice(product);
        const oldPrice = getOldPrice(product);
        if (!price || price === 0) {
          priceText = 'Цена не указана';
          priceTextHtml = 'Цена не указана';
        } else if (oldPrice && oldPrice !== price) {
          // Plain text for description (no HTML)
          priceText = `${price} ₽`;
          // HTML with strikethrough for message
          priceTextHtml = `${price} ₽ <s>${oldPrice} ₽</s>`;
        } else {
          priceText = `${price} ₽`;
          priceTextHtml = `${price} ₽`;
        }
      }

      let thirdLine;
      let thirdLineHtml;
      if (product.id === 1) {
        thirdLine = 'Можем напечатать Ваше изображение';
        thirdLineHtml = 'Можем напечатать Ваше изображение';
      } else if (product.type === 'оригинальный') {
        thirdLine = 'Больше вариантов на странице товара';
        thirdLineHtml = 'Больше вариантов на странице товара';
      } else {
        thirdLine = priceText;
        thirdLineHtml = priceTextHtml;
      }

      const description = thirdLine;

      // Build message text with title, channel, and third line
      const messageText = `<b>${product.title}</b>\n@buy_tribute\n${thirdLineHtml}`;

      // Use article type for list view (easier to tap, shows title/price/description)
      // Note: Inline results use 'url' not 'web_app' since web_app only works in direct bot chats
      return {
        type: 'article',
        id: `product_${product.id}`,
        title: product.title,
        description: description,
        thumbnail_url: thumbnailImage || `${TELEGRAM_APP_URL}/og-image.png`,
        thumbnail_width: 100,
        thumbnail_height: 100,
        input_message_content: {
          message_text: messageImage
            ? `<a href="${messageImage}">&#8205;</a>${messageText}`
            : messageText,
          parse_mode: 'HTML'
        },
        reply_markup: {
          inline_keyboard: [
            [
              { text: '❤️ Нравится', callback_data: `search_like_${product.id}` },
              { text: 'Открыть товар', url: productUrl }
            ]
          ]
        }
      };
    });

    await answerInlineQuery(queryId, results);

    // Log the search query for analytics (fire and forget)
    pool.query(`
      INSERT INTO inline_search_log (query, results_count, user_id)
      VALUES ($1, $2, $3)
    `, [query, result.rows.length, inlineQuery.from?.id]).catch(() => {});

  } catch (error) {
    console.error('Error handling inline query:', error);
    await answerInlineQuery(queryId, [], {
      switch_pm_text: 'Ошибка поиска. Попробуйте снова.',
      switch_pm_parameter: 'search'
    });
  }
}

/**
 * Handle chosen inline result - track which product was selected
 */
async function handleChosenInlineResult(chosenResult) {
  try {
    const resultId = chosenResult.result_id; // e.g., "product_123"
    const query = chosenResult.query;
    const userId = chosenResult.from?.id;

    // Extract product ID from result_id
    const productId = resultId.startsWith('product_')
      ? parseInt(resultId.replace('product_', ''))
      : null;

    // Log the selection for analytics
    await pool.query(`
      INSERT INTO inline_search_feedback (result_id, product_id, query, user_id)
      VALUES ($1, $2, $3, $4)
    `, [resultId, productId, query, userId]);

  } catch (error) {
    console.error('Error logging inline result choice:', error);
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
      text: applyCustomEmoji(text),
      parse_mode: 'HTML',
      ...options
    });
  } catch (error) {
    console.error('Error editing message:', error.response?.data || error.message);
  }
}

/**
 * Handle product search request
 */
async function handleSearchRequest(chatId) {
  const msgId = await sendMessage(chatId, '🔍 Введите название постера или ключевое слово для поиска:', {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Искать на сайте', web_app: { url: TELEGRAM_APP_URL } }]
      ]
    }
  });
  await getUserSession().set(String(chatId), { state: 'awaiting_search', activeKeyboardMessageId: msgId });
}

/**
 * Handle product search query
 */
async function handleSearchQuery(chatId, query) {
  try {
    // Search by title, key_word, and alt - matching inline search behavior
    const result = await pool.query(`
      SELECT id, title, price, old_price
      FROM products
      WHERE status IN ('available', 'coming_soon', 'not_for_sale')
        AND (
          LOWER(title) LIKE LOWER($1) OR LOWER(key_word) LIKE LOWER($1) OR LOWER(alt) LIKE LOWER($1)
          OR word_similarity($2, title) > 0.3
          OR word_similarity($2, COALESCE(key_word, '')) > 0.3
          OR word_similarity($2, COALESCE(alt, '')) > 0.3
        )
      ORDER BY
        CASE WHEN LOWER(title) LIKE LOWER($1) OR LOWER(key_word) LIKE LOWER($1) OR LOWER(alt) LIKE LOWER($1) THEN 0 ELSE 1 END,
        GREATEST(
          word_similarity($2, title),
          word_similarity($2, COALESCE(key_word, '')),
          word_similarity($2, COALESCE(alt, ''))
        ) DESC,
        sort_order, created_at DESC
      LIMIT 5
    `, [`%${query}%`, query]);

    if (result.rows.length === 0) {
      await sendMessage(chatId, `По запросу "${query}" ничего не найдено. Попробуйте другое название.`);
      await getUserSession().delete(String(chatId));
      return;
    }

    const buttons = result.rows.map(product => [{
      text: product.title,
      callback_data: `product_${product.id}`
    }]);

    const msgId = await sendMessage(chatId, `Найдено товаров: ${result.rows.length}`, {
      reply_markup: {
        inline_keyboard: buttons
      }
    });

    if (msgId) {
      await getUserSession().set(String(chatId), { activeKeyboardMessageId: msgId });
    } else {
      await getUserSession().delete(String(chatId));
    }
  } catch (error) {
    console.error('Error searching products:', error);
    await sendMessage(chatId, 'Произошла ошибка при поиске. Попробуйте позже.');
    await getUserSession().delete(String(chatId));
  }
}

/**
 * Handle product selection - show product details
 */
async function handleProductView(chatId, productId) {
  try {
    const productResult = await pool.query(`
      SELECT p.id, p.title, p.slug, pi.url as image_url
      FROM products p
      LEFT JOIN product_images pi ON p.id = pi.product_id
      WHERE p.id = $1
      LIMIT 1
    `, [productId]);

    if (productResult.rows.length === 0) {
      await sendMessage(chatId, 'Товар не найден.');
      return;
    }

    const product = productResult.rows[0];
    const productUrl = `${TELEGRAM_APP_URL}/product/${product.slug || productId}`;

    if (product.image_url) {
      await sendPhoto(chatId, product.image_url, `<b>${product.title}</b>\n@buy_tribute`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Открыть товар', web_app: { url: productUrl } }]
          ]
        }
      });
    } else {
      await sendMessage(chatId, `<b>${product.title}</b>\n@buy_tribute`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Открыть товар', web_app: { url: productUrl } }]
          ]
        }
      });
    }
  } catch (error) {
    console.error('Error fetching product:', error);
    await sendMessage(chatId, 'Произошла ошибка. Попробуйте позже.');
  }
}

/**
 * Handle "My Orders" request
 * Note: telegramUserId is the Telegram user ID from message.from.id
 * Orders are stored with the internal user ID (users.id), not the Telegram ID (users.telegram_id)
 * So we must first look up the internal ID from the Telegram ID
 */
async function handleMyOrders(chatId, telegramUserId) {
  try {
    // Look up the internal user ID from the Telegram user ID
    // Website auth stores users with telegram_id column but orders use internal id
    const userLookup = await pool.query(
      'SELECT id FROM users WHERE telegram_id = $1',
      [telegramUserId]
    );

    if (userLookup.rows.length === 0) {
      // User hasn't logged into the website via Telegram MiniApp yet
      return await sendMessage(chatId, '📦 У вас пока нет заказов.\n\nЧтобы сделать заказ, откройте наш магазин через кнопку ниже:', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🛍 Открыть магазин', web_app: { url: TELEGRAM_APP_URL } }]
          ]
        }
      });
    }

    const internalUserId = userLookup.rows[0].id;

    const result = await pool.query(`
      SELECT o.id, o.total_price, o.delivery_cost, o.status, o.created_at,
             COUNT(oi.id) as item_count
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE o.user_id = $1
      GROUP BY o.id
      ORDER BY o.created_at DESC
      LIMIT 10
    `, [internalUserId]);

    if (result.rows.length === 0) {
      return await sendMessage(chatId, '📦 У вас пока нет заказов.\n\nСделайте первый заказ в нашем магазине!');
    }

    const statusNames = {
      'new': '🆕 Новый',
      'evaluation': '⏳ Расчет',
      'reviewed': '✓ Проверен',
      'accepted': '✅ Подтвержден',
      'paid': '💳 Оплачен',
      'on_hold': '⏸ Приостановлен',
      'cancelled': '❌ Отменен',
      'refunded': '↩️ Возврат',
      'in_work': '🔧 В работе',
      'shipped': '📦 Отправлен',
      'suggested': '💡 Предложение'
    };

    let ordersText = '📦 <b>Ваши заказы:</b>\n\n';

    for (const order of result.rows) {
      const totalWithDelivery = order.total_price + (order.delivery_cost || 0);
      const date = new Date(order.created_at).toLocaleDateString('ru-RU');

      ordersText += `<b>Заказ #${order.id}</b>\n`;
      ordersText += `Статус: ${statusNames[order.status] || order.status}\n`;
      ordersText += `Товаров: ${order.item_count}\n`;
      ordersText += `Сумма: ${totalWithDelivery}₽\n`;
      ordersText += `Дата: ${date}\n\n`;
    }

    ordersText += 'Для подробной информации перейдите в профиль на сайте.';

    return await sendMessage(chatId, ordersText, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '👤 Открыть профиль', web_app: { url: `${TELEGRAM_APP_URL}/profile` } }]
        ]
      }
    });
  } catch (error) {
    console.error('Error fetching user orders:', error);
    await sendMessage(chatId, 'Произошла ошибка при загрузке заказов. Попробуйте позже.');
    return null;
  }
}

/**
 * Handle support request - show contact info
 */
async function handleSupportRequest(chatId) {
  return await sendMessage(chatId, '💬 Свяжитесь с нами:\n\nТелеграм: t.me/buy_tribute?direct\nВКонтакте: vk.com/buy_tribute\nПочта: buy.tribute@yandex.ru', {
    reply_markup: {
      inline_keyboard: [
        [{ text: '❓ Перейти в FAQ', callback_data: 'faq_back' }],
        [{ text: '🛍 Открыть магазин', web_app: { url: TELEGRAM_APP_URL } }]
      ]
    }
  });
}

/**
 * Main webhook handler
 */
module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).send('User Bot Webhook Active');
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { message, callback_query, inline_query, chosen_inline_result } = req.body;

    // Handle inline queries (user typing @bot_name query in any chat)
    if (inline_query) {
      await handleInlineQuery(inline_query);
      return res.status(200).json({ ok: true });
    }

    // Handle chosen inline result (user selected a result - for analytics)
    if (chosen_inline_result) {
      await handleChosenInlineResult(chosen_inline_result);
      return res.status(200).json({ ok: true });
    }

    // Handle callback queries (button clicks)
    if (callback_query) {
      const chatId = callback_query.message.chat.id;
      const messageId = callback_query.message.message_id;
      const data = callback_query.data;

      // Handle search like separately (needs custom callback answer text)
      if (data.startsWith('search_like_')) {
        const productId = parseInt(data.replace('search_like_', ''));
        const telegramUserId = callback_query.from.id;
        const internalUserId = await getInternalUserId(telegramUserId);
        let alertText = '❤️ Добавлено в избранное';
        try {
          await pool.query(
            'INSERT INTO user_favorites (user_id, product_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [internalUserId, productId]
          );
        } catch {
          alertText = 'Не удалось добавить в избранное';
        }
        await axios.post(`${TELEGRAM_API}/answerCallbackQuery`, {
          callback_query_id: callback_query.id,
          text: alertText
        });
        return res.status(200).json({ ok: true });
      }

      // Answer callback query to remove loading state
      await axios.post(`${TELEGRAM_API}/answerCallbackQuery`, {
        callback_query_id: callback_query.id
      });

      // Handle different callback actions
      if (data === 'faq_back') {
        await handleFAQ(chatId, messageId);
      } else if (data.startsWith('faq_cat_')) {
        const categoryId = parseInt(data.replace('faq_cat_', ''));
        await handleFAQCategory(chatId, messageId, categoryId);
      } else if (data.startsWith('faq_item_')) {
        const itemId = parseInt(data.replace('faq_item_', ''));
        await handleFAQItem(chatId, messageId, itemId);
      } else if (data.startsWith('product_')) {
        const productId = parseInt(data.replace('product_', ''));
        await handleProductView(chatId, productId);
      } else if (data === 'picker_like' || data === 'picker_skip' || data === 'picker_exit') {
        const action = data.replace('picker_', '');
        await handlePickerAction(chatId, messageId, action, callback_query.from.id);
      } else if (data.startsWith('fav_page_')) {
        const page = parseInt(data.replace('fav_page_', ''));
        await handleFavoritesList(chatId, callback_query.from.id, page, messageId);
      }

      return res.status(200).json({ ok: true });
    }

    // Handle text messages
    if (message) {
      const chatId = message.chat.id;
      const text = message.text;
      const userId = message.from.id;

      // Channel DMs (supergroup with is_direct_messages) — greet once per topic
      if (message.chat.type === 'supergroup' || message.chat.type === 'group') {
        // Only handle channel DMs, not regular groups
        if (message.direct_messages_topic) {
          const topicId = message.direct_messages_topic.topic_id;

          // Check if we already greeted this topic
          let alreadyGreeted = false;
          try {
            const result = await pool.query(
              `SELECT 1 FROM bot_greeted_users
               WHERE platform = 'telegram' AND user_identifier = $1 AND community_id = $2`,
              [String(topicId), String(chatId)]
            );
            alreadyGreeted = result.rows.length > 0;
          } catch { /* proceed with greeting on DB error */ }

          if (!alreadyGreeted) {
            const greetings = await getGreetings();
            if (!greetings.telegram_greeting_enabled || !greetings.telegram_group) {
              return res.status(200).json({ ok: true });
            }
            const sent = await sendMessage(chatId, greetings.telegram_group, {
              direct_messages_topic_id: topicId
            });

            // Only mark as greeted if message was actually delivered
            if (sent) {
              try {
                await pool.query(
                  `INSERT INTO bot_greeted_users (platform, user_identifier, community_id)
                   VALUES ('telegram', $1, $2)
                   ON CONFLICT DO NOTHING`,
                  [String(topicId), String(chatId)]
                );
              } catch (err) {
                console.error('Error marking Telegram topic as greeted:', err.message);
              }
            }
          }
        }
        // Ignore regular group/supergroup messages (not channel DMs)
        return res.status(200).json({ ok: true });
      }

      // --- Private chat logic below ---

      // Ensure user exists in database
      try {
        await pool.query(`
          INSERT INTO users (id, username, first_name, last_name, last_login, login_method)
          VALUES ($1, $2, $3, $4, NOW(), 'telegram')
          ON CONFLICT (id) DO UPDATE SET last_login = NOW()
        `, [
          userId,
          message.from.username || `user_${userId}`,
          message.from.first_name || '',
          message.from.last_name || ''
        ]);
      } catch (err) {
        console.error('Error upserting user:', err);
      }

      // Check if user is in a special state (e.g., awaiting search input)
      const session = await getUserSession().get(String(chatId));
      const isButtonCommand = text === '/start' || text === '❓ FAQ' || text === '🔍 Найти постер' || text === '📦 Мои заказы' || text === '💬 Поддержка' || text === '🎴 Подборщик' || text === '❤️ Избранное';

      if (session && session.state === 'awaiting_search' && !isButtonCommand) {
        await handleSearchQuery(chatId, text);
        return res.status(200).json({ ok: true });
      }

      // Clear any session state if user pressed a button command,
      // and strip inline keyboards from any tracked interactive messages
      if (isButtonCommand && session) {
        const stripTasks = [];
        if (session.pickerMessageId) stripTasks.push(removeInlineKeyboard(chatId, session.pickerMessageId));
        if (session.activeKeyboardMessageId) stripTasks.push(removeInlineKeyboard(chatId, session.activeKeyboardMessageId));
        if (stripTasks.length > 0) await Promise.all(stripTasks);
        await getUserSession().delete(String(chatId));
      }

      // Handle commands and menu buttons
      if (text === '/start') {
        await handleStart(chatId, message.from);
      } else if (text === '❓ FAQ') {
        const msgId = await handleFAQ(chatId);
        if (msgId) await getUserSession().set(String(chatId), { activeKeyboardMessageId: msgId });
      } else if (text === '🔍 Найти постер') {
        await handleSearchRequest(chatId); // sets session internally
      } else if (text === '📦 Мои заказы') {
        const msgId = await handleMyOrders(chatId, userId);
        if (msgId) await getUserSession().set(String(chatId), { activeKeyboardMessageId: msgId });
      } else if (text === '💬 Поддержка') {
        const msgId = await handleSupportRequest(chatId);
        if (msgId) await getUserSession().set(String(chatId), { activeKeyboardMessageId: msgId });
      } else if (text === '🎴 Подборщик') {
        await handlePickerStart(chatId, userId); // sets session internally
      } else if (text === '❤️ Избранное') {
        const msgId = await handleFavoritesList(chatId, userId);
        if (msgId) await getUserSession().set(String(chatId), { activeKeyboardMessageId: msgId });
      } else {
        // Unknown command - show main menu
        await sendMessage(chatId, 'Используйте меню для навигации:', {
          reply_markup: getMainKeyboard()
        });
      }

      return res.status(200).json({ ok: true });
    }

    // If neither message nor callback_query, return ok
    return res.status(200).json({ ok: true });

  } catch (error) {
    console.error('Error in user bot webhook:', error);
    return res.status(200).json({ ok: true }); // Always return 200 to Telegram
  }
};


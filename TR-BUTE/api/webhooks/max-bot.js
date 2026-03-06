/**
 * MAX Bot Webhook Handler
 * Handles customer interactions via MAX bot
 * Features: Greeting with store link, FAQ, product search, order tracking
 *
 * MAX Bot API base URL: https://platform-api.max.ru
 * Authentication: Authorization: <token> header
 */

const { getPool } = require('../../lib/db');
const axios = require('axios');
const config = require('../../lib/config');
const { getSessionStore } = require('../../lib/session-store');

const pool = getPool();

const BOT_TOKEN = config.maxBotToken;
const MAX_API = 'https://platform-api.max.ru';

// MAX Mini App URL — always use Vercel domain for buttons
const MAX_APP_URL = config.maxAppUrl || config.appUrl || 'https://buy-tribute.vercel.app';

const MAX_API_HEADERS = () => ({
  'Authorization': BOT_TOKEN,
  'Content-Type': 'application/json'
});

// Session storage getter
const getUserSession = () => getSessionStore('user');

// Default greeting texts
const DEFAULT_GREETINGS = {
  max_private: `👋 Добро пожаловать в TR/BUTE!\n\nЯ помогу вам:\n• Найти нужный постер по названию\n• Отследить ваши заказы\n• Ответить на частые вопросы\n\nОткройте наш магазин, чтобы посмотреть каталог и сделать заказ.`
};

// Cache greetings to avoid querying DB on every message
let cachedGreetings = null;
let greetingsCacheTime = 0;
const GREETINGS_CACHE_TTL = 5 * 60 * 1000;

async function getGreetings() {
  if (cachedGreetings && Date.now() - greetingsCacheTime < GREETINGS_CACHE_TTL) {
    return cachedGreetings;
  }
  try {
    const result = await pool.query("SELECT value FROM app_settings WHERE key = 'bot_greetings'");
    if (result.rows.length > 0) {
      const val = result.rows[0].value;
      cachedGreetings = {
        max_private: val.max_private || val.max || DEFAULT_GREETINGS.max_private
      };
    } else {
      cachedGreetings = { ...DEFAULT_GREETINGS };
    }
  } catch {
    cachedGreetings = { ...DEFAULT_GREETINGS };
  }
  greetingsCacheTime = Date.now();
  return cachedGreetings;
}

// Cache FAQs
let _faqCache = null;
let _faqCacheTime = 0;
const FAQ_CACHE_TTL = 10 * 60 * 1000;

async function getFAQItems() {
  if (_faqCache && Date.now() - _faqCacheTime < FAQ_CACHE_TTL) return _faqCache;
  try {
    const result = await pool.query(`
      SELECT fi.question, fi.answer
      FROM faq_items fi
      JOIN faq_categories fc ON fi.category_id = fc.id
      WHERE fi.is_active = true AND fc.is_active = true
      ORDER BY fc.sort_order, fi.sort_order
      LIMIT 20
    `);
    _faqCache = result.rows;
  } catch {
    _faqCache = [];
  }
  _faqCacheTime = Date.now();
  return _faqCache;
}

/**
 * Send a text message to a MAX user.
 * chat_id is passed as a query parameter per MAX Bot API.
 */
async function sendMessage(chatId, text, attachments = []) {
  if (!BOT_TOKEN) {
    console.error('[MAX Bot] MAX_BOT_TOKEN not set');
    return null;
  }
  try {
    const body = { text };
    if (attachments.length > 0) body.attachments = attachments;

    const response = await axios.post(
      `${MAX_API}/messages?chat_id=${chatId}`,
      body,
      { headers: MAX_API_HEADERS() }
    );
    return response.data?.message?.id || null;
  } catch (error) {
    console.error('[MAX Bot] sendMessage error:', error.response?.data || error.message);
    return null;
  }
}

/**
 * Build an inline keyboard attachment with a link button.
 */
function buildLinkKeyboard(label, url) {
  return [{
    type: 'inline_keyboard',
    payload: {
      buttons: [[{ type: 'link', text: label, url }]]
    }
  }];
}

/**
 * Build an inline keyboard with callback buttons.
 */
function buildCallbackKeyboard(rows) {
  return [{
    type: 'inline_keyboard',
    payload: {
      buttons: rows.map(row =>
        row.map(btn => ({ type: 'callback', text: btn.text, payload: btn.payload }))
      )
    }
  }];
}

/**
 * Check if we already greeted this user (DB-based).
 */
async function shouldGreet(userId) {
  try {
    const result = await pool.query(
      `SELECT 1 FROM bot_greeted_users
       WHERE platform = 'max' AND user_identifier = $1`,
      [String(userId)]
    );
    return result.rows.length === 0;
  } catch {
    return false;
  }
}

async function markGreeted(userId) {
  try {
    await pool.query(
      `INSERT INTO bot_greeted_users (platform, user_identifier)
       VALUES ('max', $1)
       ON CONFLICT DO NOTHING`,
      [String(userId)]
    );
  } catch (err) {
    console.error('[MAX Bot] Error marking user as greeted:', err.message);
  }
}

/**
 * Send the store greeting to a MAX user.
 */
async function sendGreeting(chatId) {
  const greetings = await getGreetings();
  const text = greetings.max_private;
  const attachments = buildLinkKeyboard('Открыть магазин', MAX_APP_URL);
  return sendMessage(chatId, text, attachments);
}

/**
 * Handle FAQ command — send FAQ as inline keyboard or plain list.
 */
async function handleFAQ(chatId, sendFn = sendMessage) {
  const items = await getFAQItems();
  if (items.length === 0) {
    return sendFn(chatId, 'Раздел FAQ пока пуст. Вы можете написать нам напрямую.');
  }

  // Build a simple numbered list (MAX doesn't support telegram-style callback FAQ trees yet)
  const lines = items.slice(0, 10).map((item, i) => `${i + 1}. <b>${item.question}</b>\n${item.answer}`);
  const text = '❓ Часто задаваемые вопросы:\n\n' + lines.join('\n\n');
  return sendFn(chatId, text);
}

/**
 * Handle product search.
 */
async function handleSearch(chatId, query) {
  if (!query || query.trim().length < 2) {
    return sendMessage(chatId, 'Введите название постера для поиска (минимум 2 символа).');
  }
  try {
    const result = await pool.query(`
      SELECT id, title, slug, price
      FROM products
      WHERE status = 'available'
        AND (
          title ILIKE $1
          OR word_similarity($2, title) > 0.3
        )
      ORDER BY
        CASE WHEN title ILIKE $1 THEN 0 ELSE 1 END,
        word_similarity($2, title) DESC,
        sort_order, created_at DESC
      LIMIT 5
    `, [`%${query.trim()}%`, query.trim()]);

    if (result.rows.length === 0) {
      return sendMessage(chatId, `По запросу «${query}» ничего не найдено. Попробуйте другой запрос.`);
    }

    const lines = result.rows.map(p => {
      const url = `${MAX_APP_URL}/product/${p.slug || p.id}`;
      return `• <a href="${url}">${p.title}</a>`;
    });
    const text = `🔍 Результаты по запросу «${query}»:\n\n${lines.join('\n')}`;
    return sendMessage(chatId, text);
  } catch (err) {
    console.error('[MAX Bot] Search error:', err.message);
    return sendMessage(chatId, 'Ошибка при поиске. Попробуйте позже.');
  }
}

/**
 * Handle order tracking.
 */
async function handleOrders(chatId, maxUserId) {
  try {
    const userResult = await pool.query(
      'SELECT id FROM users WHERE max_id = $1 LIMIT 1',
      [String(maxUserId)]
    );
    if (userResult.rows.length === 0) {
      return sendMessage(chatId, 'Войдите в аккаунт в магазине, чтобы видеть свои заказы.');
    }

    const userId = userResult.rows[0].id;
    const ordersResult = await pool.query(`
      SELECT id, status, created_at, total_price
      FROM orders
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 5
    `, [userId]);

    if (ordersResult.rows.length === 0) {
      return sendMessage(chatId, 'У вас ещё нет заказов.', buildLinkKeyboard('Открыть каталог', `${MAX_APP_URL}/catalog`));
    }

    const lines = ordersResult.rows.map(o => {
      const date = new Date(o.created_at).toLocaleDateString('ru-RU');
      return `• Заказ #${o.id} — ${o.status} (${date}${o.total_price ? `, ${o.total_price} ₽` : ''})`;
    });
    const text = `📦 Ваши последние заказы:\n\n${lines.join('\n')}`;
    return sendMessage(chatId, text, buildLinkKeyboard('Открыть профиль', `${MAX_APP_URL}/profile`));
  } catch (err) {
    console.error('[MAX Bot] Orders error:', err.message);
    return sendMessage(chatId, 'Ошибка при загрузке заказов. Попробуйте позже.');
  }
}

/**
 * Handle incoming text commands.
 */
async function handleTextMessage(chatId, text, senderId) {
  const normalized = (text || '').trim().toLowerCase();

  if (normalized === '/start' || normalized === 'start') {
    return sendGreeting(chatId);
  }

  if (normalized === '/faq' || normalized === '❓ faq' || normalized === 'faq') {
    return handleFAQ(chatId);
  }

  if (normalized === '/orders' || normalized === '📦 мои заказы') {
    return handleOrders(chatId, senderId);
  }

  if (normalized === '/catalog' || normalized === 'каталог') {
    return sendMessage(chatId, 'Откройте наш каталог:', buildLinkKeyboard('Открыть каталог', `${MAX_APP_URL}/catalog`));
  }

  if (normalized.startsWith('/search ') || normalized.startsWith('🔍 ')) {
    const query = text.replace(/^(\/search\s*|🔍\s*)/i, '').trim();
    return handleSearch(chatId, query);
  }

  // Default: show menu
  const menuText = 'Выберите действие:\n• /faq — Частые вопросы\n• /orders — Мои заказы\n• /catalog — Каталог\n• /search <название> — Найти постер';
  return sendMessage(chatId, menuText, buildLinkKeyboard('Открыть магазин', MAX_APP_URL));
}

/**
 * Main webhook handler for MAX Bot API
 */
module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).send('MAX Bot Webhook Active');
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // MAX expects a 200 response quickly
  res.status(200).json({ ok: true });

  try {
    const update = req.body;
    if (!update) return;

    const updateType = update.update_type;

    // Handle new message from user
    if (updateType === 'message_created') {
      const message = update.message;
      if (!message) return;

      const sender = message.sender || message.from;
      if (!sender || !sender.user_id) return;

      const senderId = sender.user_id;
      // MAX uses chat_id separate from user_id in some contexts; fall back to sender id for DMs
      const chatId = message.chat_id || senderId;
      const text = message.body?.text || message.text || '';

      // Greeting on first contact
      const needsGreeting = await shouldGreet(senderId);
      if (needsGreeting) {
        const sent = await sendGreeting(chatId);
        if (sent) await markGreeted(senderId);
        return;
      }

      await handleTextMessage(chatId, text, senderId);
      return;
    }

    // Handle bot started event (user presses Start button)
    if (updateType === 'bot_started') {
      const userId = update.user?.user_id || update.chat_id;
      if (!userId) return;
      const chatId = update.chat_id || userId;

      const needsGreeting = await shouldGreet(userId);
      if (needsGreeting) {
        const sent = await sendGreeting(chatId);
        if (sent) await markGreeted(userId);
      } else {
        await sendGreeting(chatId);
      }
      return;
    }

    // Handle callback button presses
    if (updateType === 'message_callback') {
      const callback = update.callback;
      if (!callback) return;
      const chatId = callback.message?.chat_id || callback.chat_id;
      const payload = callback.payload;
      const userId = callback.user?.user_id;

      if (payload === 'orders' && userId) {
        await handleOrders(chatId, userId);
      } else if (payload === 'faq') {
        await handleFAQ(chatId);
      }
      return;
    }
  } catch (error) {
    console.error('[MAX Bot] Webhook error:', error.message);
  }
};

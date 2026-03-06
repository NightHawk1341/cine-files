/**
 * Get App Settings Endpoint
 * GET /api/settings/get - Get all settings or specific setting by key
 *
 * Query params:
 *   - key: optional, specific setting key to retrieve
 *   - keys: optional, comma-separated list of keys to retrieve
 */

const { getPool } = require('../../lib/db');
const { success, error, methodNotAllowed } = require('../../server/utils/response-helpers');
const pool = getPool();

// Default settings values (used when setting doesn't exist in DB)
const DEFAULT_SETTINGS = {
  emergency_mode: {
    enabled: false,
    hide_images: true,
    replace_titles: true,
    activated_at: null,
    activated_by: null
  },
  order_submission: {
    enabled: true,
    disabled_message: 'Оформление заказов временно недоступно'
  },
  delivery_methods: {
    pochta: { enabled: true, name: 'Почта России', manual_mode: false },
    pochta_standard: { enabled: true, name: 'До отделения' },
    pochta_courier: { enabled: true, name: 'Курьер Почты' },
    pochta_first_class: { enabled: true, name: '1 класс' },
    courier_ems: { enabled: true, name: 'EMS (курьер)' },
    cdek: { enabled: true, name: 'СДЭК' },
    cdek_pvz: { enabled: true, name: 'До ПВЗ' },
    cdek_pvz_express: { enabled: true, name: 'До ПВЗ Экспресс' },
    cdek_courier: { enabled: true, name: 'Курьер СДЭК' },
    international: { enabled: true, name: 'Международная доставка' }
  },
  delivery_rounding: {
    small_order_threshold: 1500,
    small_order_step: 50,
    big_order_step: 50,
    high_ratio_threshold: 0.5,
    high_ratio_step: 100,
    very_high_ratio_threshold: 0.7,
    very_high_ratio_step: 200
  },
  bot_greetings: {
    telegram_greeting_enabled: true,
    telegram_private: '👋 Добро пожаловать в TR/BUTE!\n\nЯ помогу вам:\n• Найти нужный постер по названию\n• Отследить ваши заказы\n• Ответить на частые вопросы\n\nВыберите действие из меню ниже:',
    telegram_group: '👋 Добро пожаловать в TR/BUTE!\n\nОткройте наш магазин, чтобы посмотреть каталог и сделать заказ.\n\nhttps://buy-tribute.vercel.app',
    vk_greeting_enabled: true,
    vk_1: '👋 Добро пожаловать в TR/BUTE!\n\nМы создаём авторские постеры. Откройте наш магазин, чтобы посмотреть каталог и сделать заказ.\n\nhttps://buy-tribute.com',
    vk_2: '👋 Добро пожаловать в TR/BUTE!\n\nМы создаём авторские постеры. Откройте наш магазин, чтобы посмотреть каталог и сделать заказ.\n\nhttps://buy-tribute.com',
    vk_button_url: 'https://buy-tribute.com'
  },
  moderation_config: {
    enabled: true,
    check_reviews: true,
    check_comments: true,
    check_suggestions: true
  },
  cart_limits: {
    max_cart_total: 45000
  },
  announcement_bar: {
    enabled: true,
    text: 'Сайт находится в режиме беты, а каталог будет постепенно пополняться уже выпущенными ранее постерами и запланированными новинками. Для заказа не представленных в магазине постеров указывайте их в товаре «Постер на ваш выбор». Приносим извинения за неудобства'
  },
  custom_emojis: {
    '👋': null, '🛒': null, '✅': null, '📦': null, '💳': null,
    '🚚': null, '❌': null, '🎉': null, '📞': null, '💬': null,
    '💰': null, '↩️': null, '⏰': null, '❓': null, '🔍': null,
    '❤️': null, '🎴': null
  }
};

/**
 * Main handler
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return methodNotAllowed(res, ['GET']);
  }

  try {
    const { key, keys } = req.query;

    // If specific key requested
    if (key) {
      const result = await pool.query(
        'SELECT key, value, updated_at FROM app_settings WHERE key = $1',
        [key]
      );

      if (result.rows.length === 0) {
        // Return default value if exists
        if (DEFAULT_SETTINGS[key]) {
          return success(res, {
            setting: {
              key,
              value: DEFAULT_SETTINGS[key],
              updated_at: null,
              is_default: true
            }
          });
        }
        return success(res, { setting: null });
      }

      return success(res, {
        setting: {
          ...result.rows[0],
          is_default: false
        }
      });
    }

    // If multiple keys requested
    if (keys) {
      const keyList = keys.split(',').map(k => k.trim());
      const result = await pool.query(
        'SELECT key, value, updated_at FROM app_settings WHERE key = ANY($1)',
        [keyList]
      );

      // Build response with defaults for missing keys
      const settings = {};
      keyList.forEach(k => {
        const found = result.rows.find(r => r.key === k);
        if (found) {
          settings[k] = { ...found, is_default: false };
        } else if (DEFAULT_SETTINGS[k]) {
          settings[k] = {
            key: k,
            value: DEFAULT_SETTINGS[k],
            updated_at: null,
            is_default: true
          };
        }
      });

      return success(res, { settings });
    }

    // Return all settings
    const result = await pool.query(
      'SELECT key, value, updated_at FROM app_settings ORDER BY key'
    );

    // Merge with defaults
    const settings = { ...DEFAULT_SETTINGS };
    result.rows.forEach(row => {
      settings[row.key] = row.value;
    });

    return success(res, {
      settings,
      raw_settings: result.rows
    });

  } catch (err) {
    console.error('Error getting app settings:', err);
    return error(res, 'Failed to get settings', 500);
  }
};

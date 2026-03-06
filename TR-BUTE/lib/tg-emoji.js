/**
 * Custom Telegram emoji helpers.
 *
 * Custom emoji IDs must be filled in after creating the pack via @Stickers_bot.
 * To get an ID: send a message containing the custom emoji to @RawDataBot and
 * look for MessageEntity with type "custom_emoji" → custom_emoji_id.
 *
 * Emoji with a null ID are left as regular Unicode (graceful fallback).
 * IDs are loaded from app_settings key "custom_emojis" at server startup.
 */

const CUSTOM_EMOJI_MAP = {
  '👋': null,  // greeting
  '🛒': null,  // order_created
  '✅': null,  // order_confirmed
  '📦': null,  // delivery / parcel_at_pickup
  '💳': null,  // payment_received
  '🚚': null,  // order_shipped
  '❌': null,  // order_cancelled
  '🎉': null,  // product_available
  '📞': null,  // contact_request
  '💬': null,  // admin_response / support
  '💰': null,  // refund_processed
  '↩️': null,  // parcel_returned (U+21A9 + variation selector)
  '⏰': null,  // storage_reminder
  '❓': null,  // faq
  '🔍': null,  // search
  '❤️': null,  // favorites (U+2764 + variation selector)
  '🎴': null,  // picker
};

/**
 * Update in-memory emoji ID map from a plain object of { emoji: id | null }.
 * Called at server startup and after admin saves new IDs.
 */
function setCustomEmojiIds(ids) {
  if (!ids || typeof ids !== 'object') return;
  for (const [emoji, id] of Object.entries(ids)) {
    if (Object.prototype.hasOwnProperty.call(CUSTOM_EMOJI_MAP, emoji)) {
      CUSTOM_EMOJI_MAP[emoji] = id || null;
    }
  }
}

/**
 * Load custom emoji IDs from the database and apply them.
 * Call once at server startup.
 */
async function loadCustomEmojisFromDB(pool) {
  try {
    const result = await pool.query(
      'SELECT value FROM app_settings WHERE key = $1',
      ['custom_emojis']
    );
    if (result.rows.length > 0 && result.rows[0].value) {
      setCustomEmojiIds(result.rows[0].value);
    }
  } catch (err) {
    console.error('Failed to load custom emoji IDs from DB:', err.message);
  }
}

/**
 * Replace known Unicode emoji with <tg-emoji> HTML tags.
 * Call this AFTER escapeHtml — it inserts raw HTML.
 * Emoji with null IDs pass through unchanged.
 */
function applyCustomEmoji(text) {
  if (!text) return text;
  // Array.from splits on Unicode codepoints, preserving multi-codepoint sequences
  const chars = Array.from(text);
  let result = '';
  let i = 0;
  while (i < chars.length) {
    // Try two-codepoint sequence first (handles variation selectors like ↩️, ❤️)
    if (i + 1 < chars.length) {
      const two = chars[i] + chars[i + 1];
      if (Object.prototype.hasOwnProperty.call(CUSTOM_EMOJI_MAP, two)) {
        const id = CUSTOM_EMOJI_MAP[two];
        result += id ? `<tg-emoji emoji-id="${id}">${two}</tg-emoji>` : two;
        i += 2;
        continue;
      }
    }
    const ch = chars[i];
    if (Object.prototype.hasOwnProperty.call(CUSTOM_EMOJI_MAP, ch)) {
      const id = CUSTOM_EMOJI_MAP[ch];
      result += id ? `<tg-emoji emoji-id="${id}">${ch}</tg-emoji>` : ch;
    } else {
      result += ch;
    }
    i++;
  }
  return result;
}

/**
 * Escape HTML special characters in plain text before embedding in
 * parse_mode: 'HTML' messages. Apply to any user- or DB-sourced strings.
 */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

module.exports = { applyCustomEmoji, escapeHtml, setCustomEmojiIds, loadCustomEmojisFromDB };

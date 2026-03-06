/**
 * VK Community Bot Webhook Handler
 *
 * Sends a store link greeting when a user messages any connected VK community.
 * Supports multiple communities via indexed env vars (same message, same URL).
 *
 * Env vars per community (suffix _2, _3, etc. for additional communities):
 *   VK_COMMUNITY_ID            - Numeric community ID
 *   VK_COMMUNITY_TOKEN         - Community API access token
 *   VK_CONFIRMATION_CODE       - Callback API confirmation string
 */

const axios = require('axios');
const config = require('../../lib/config');
const { getPool } = require('../../lib/db');

const pool = getPool();
const VK_API = 'https://api.vk.com/method';
const VK_API_VERSION = '5.199';
const STORE_URL = config.appUrl || 'https://buy-tribute.com';

const DEFAULT_VK_GREETING = `👋 Добро пожаловать в TR/BUTE!\n\nМы создаём авторские постеры. Откройте наш магазин, чтобы посмотреть каталог и сделать заказ.\n\n${STORE_URL}`;

// Cache greetings per community index to avoid querying DB on every message
const greetingCache = {};
const greetingCacheTime = {};
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getGreetingData(communityIndex, greetingType = 'message') {
  const cacheKey = `vk_${communityIndex}_${greetingType}`;
  if (greetingCache[cacheKey] && Date.now() - (greetingCacheTime[cacheKey] || 0) < CACHE_TTL) {
    return greetingCache[cacheKey];
  }
  try {
    const result = await pool.query("SELECT value FROM app_settings WHERE key = 'bot_greetings'");
    if (result.rows.length > 0) {
      const greetings = result.rows[0].value;
      const baseKey = `vk_${communityIndex}`;
      // Context-aware: try type-specific key first, fall back to base key
      const typeKey = `${baseKey}_${greetingType}`;
      const text = greetings[typeKey] || greetings[baseKey] || greetings.vk || DEFAULT_VK_GREETING;
      greetingCache[cacheKey] = {
        text,
        buttonUrl: greetings.vk_button_url || STORE_URL,
        enabled: greetings.vk_greeting_enabled !== false
      };
    } else {
      greetingCache[cacheKey] = { text: DEFAULT_VK_GREETING, buttonUrl: STORE_URL, enabled: true };
    }
  } catch {
    greetingCache[cacheKey] = { text: DEFAULT_VK_GREETING, buttonUrl: STORE_URL, enabled: true };
  }
  greetingCacheTime[cacheKey] = Date.now();
  return greetingCache[cacheKey];
}

/**
 * Build community credentials map from env vars.
 * Reads VK_COMMUNITY_ID, VK_COMMUNITY_TOKEN, VK_CONFIRMATION_CODE
 * and _2, _3, etc. suffixed variants.
 */
function loadCommunities() {
  const communities = {};
  const suffixes = ['', '_2', '_3', '_4'];

  suffixes.forEach((suffix, i) => {
    const id = process.env[`VK_COMMUNITY_ID${suffix}`];
    const token = process.env[`VK_COMMUNITY_TOKEN${suffix}`];
    const confirmation = process.env[`VK_CONFIRMATION_CODE${suffix}`];

    if (id && token && confirmation) {
      communities[String(id)] = { token, confirmation, index: i + 1 };
    }
  });

  return communities;
}

const communities = loadCommunities();

/**
 * Check if we already greeted this user for a specific greeting type (DB-based).
 * Returns true if the user has NOT been greeted yet for this type.
 */
async function shouldGreet(userId, communityId, greetingType = 'message') {
  try {
    const result = await pool.query(
      `SELECT 1 FROM bot_greeted_users
       WHERE platform = 'vk' AND user_identifier = $1 AND community_id = $2 AND COALESCE(greeting_type, 'message') = $3`,
      [String(userId), String(communityId), greetingType]
    );
    return result.rows.length === 0;
  } catch {
    return false;
  }
}

/**
 * Mark user as greeted for a specific type in DB.
 */
async function markGreeted(userId, communityId, greetingType = 'message') {
  try {
    await pool.query(
      `INSERT INTO bot_greeted_users (platform, user_identifier, community_id, greeting_type)
       VALUES ('vk', $1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [String(userId), String(communityId), greetingType]
    );
  } catch (err) {
    console.error('Error marking VK user as greeted:', err.message);
  }
}

/**
 * Send the store greeting to a VK user
 */
async function sendGreeting(userId, token, communityIndex, greetingType = 'message') {
  try {
    const { text: greetingText, buttonUrl, enabled } = await getGreetingData(communityIndex, greetingType);
    if (!enabled || !greetingText) return false;

    const keyboard = JSON.stringify({
      one_time: false,
      buttons: [[{
        action: {
          type: 'open_link',
          link: buttonUrl,
          label: 'Открыть магазин'
        }
      }]]
    });

    await axios.post(`${VK_API}/messages.send`, null, {
      params: {
        user_id: userId,
        message: greetingText,
        keyboard,
        random_id: Date.now(),
        access_token: token,
        v: VK_API_VERSION
      }
    });
    return true;
  } catch (error) {
    console.error('VK sendGreeting error:', error.response?.data || error.message);
    return false;
  }
}

/**
 * Main webhook handler for VK Callback API
 */
module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).send('VK Bot Webhook Active');
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { type, object, group_id } = req.body;
    const community = communities[String(group_id)];

    // Confirmation handshake — return the right code for this community
    if (type === 'confirmation') {
      if (!community) {
        console.error('VK confirmation request from unknown group_id:', group_id);
        return res.status(200).send('unknown group');
      }
      return res.status(200).send(community.confirmation);
    }

    // No credentials for this community — ignore
    if (!community) {
      return res.status(200).send('ok');
    }

    // User sent a message — greet once per user per type (tracked in DB)
    if (type === 'message_new') {
      const msg = object?.message || object;
      if (msg && msg.from_id > 0) {
        const needsGreeting = await shouldGreet(msg.from_id, group_id, 'message');
        if (needsGreeting) {
          const sent = await sendGreeting(msg.from_id, community.token, community.index, 'message');
          if (sent) {
            await markGreeted(msg.from_id, group_id, 'message');
          }
        }
      }
    }

    // VK Market order — send market-specific greeting (separate from message greeting)
    if (type === 'market_order_new') {
      const userId = object?.user_id;
      if (userId && userId > 0) {
        const needsGreeting = await shouldGreet(userId, group_id, 'market_order');
        if (needsGreeting) {
          const sent = await sendGreeting(userId, community.token, community.index, 'market_order');
          if (sent) {
            await markGreeted(userId, group_id, 'market_order');
          }
        }
      }
    }

    return res.status(200).send('ok');

  } catch (error) {
    console.error('Error in VK bot webhook:', error);
    return res.status(200).send('ok');
  }
};

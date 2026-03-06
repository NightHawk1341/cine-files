/**
 * Giveaway API handlers
 *
 * Routes (all require admin auth):
 *   GET    /api/admin/giveaways              — list giveaways + configured channels
 *   POST   /api/admin/giveaways/create       — create giveaway, post to channels
 *   POST   /api/admin/giveaways/pick-winners — manually pick winners
 *   POST   /api/admin/giveaways/cancel       — cancel active giveaway
 *   POST   /api/admin/giveaways/channels     — save channel list to app_settings
 *
 * Channels are stored in app_settings under key 'giveaway_channels' as:
 *   [{ "id": "-100123456", "name": "TR/BUTE" }, ...]
 */

const axios = require('axios');
const { getPool } = require('../../../lib/db');
const config = require('../../../lib/config');

const pool = getPool();
const TELEGRAM_API = `https://api.telegram.org/bot${config.telegram.adminBotToken}`;

async function getChannels() {
  const { rows } = await pool.query(
    `SELECT value FROM app_settings WHERE key = 'giveaway_channels'`
  );
  if (!rows.length || !rows[0].value) return [];
  const val = rows[0].value;
  return Array.isArray(val) ? val : [];
}

async function sendChannelMessage(channelId, text, replyMarkup) {
  const payload = { chat_id: channelId, text, parse_mode: 'HTML' };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  const resp = await axios.post(`${TELEGRAM_API}/sendMessage`, payload);
  return resp.data.result;
}

async function editChannelMessage(channelId, messageId, text, replyMarkup) {
  const payload = { chat_id: channelId, message_id: messageId, text, parse_mode: 'HTML' };
  if (replyMarkup !== undefined) payload.reply_markup = replyMarkup;
  try {
    await axios.post(`${TELEGRAM_API}/editMessageText`, payload);
  } catch (err) {
    console.error('editChannelMessage error:', err.response?.data || err.message);
  }
}

const { buildGiveawayPost, buildParticipateButton } = require('./helpers');

async function pickAndAnnounceWinners(giveawayId) {
  const giveawayRes = await pool.query('SELECT * FROM giveaways WHERE id = $1', [giveawayId]);
  if (!giveawayRes.rows.length) throw new Error('Giveaway not found');
  const giveaway = giveawayRes.rows[0];

  const winnersRes = await pool.query(
    `SELECT user_id, first_name, username
     FROM giveaway_participants
     WHERE giveaway_id = $1
     ORDER BY random()
     LIMIT $2`,
    [giveawayId, giveaway.winner_count]
  );
  const winners = winnersRes.rows;
  const winnerIds = winners.map(w => w.user_id);

  const countRes = await pool.query(
    'SELECT COUNT(*) FROM giveaway_participants WHERE giveaway_id = $1',
    [giveawayId]
  );
  const totalParticipants = parseInt(countRes.rows[0].count);

  await pool.query(
    `UPDATE giveaways SET status = 'completed', winner_user_ids = $1 WHERE id = $2`,
    [winnerIds, giveawayId]
  );

  let announcement = `🎉 <b>Итоги розыгрыша «${giveaway.title}»</b>\n\nУчастников: ${totalParticipants}\n\n`;
  if (winners.length === 0) {
    announcement += 'Нет участников — розыгрыш завершён без победителей.';
  } else {
    announcement += `🏆 <b>Победител${winners.length === 1 ? 'ь' : 'и'}:</b>\n`;
    winners.forEach((w, i) => {
      const name = w.username ? `@${w.username}` : (w.first_name || `ID ${w.user_id}`);
      announcement += `${i + 1}. ${name}\n`;
    });
    if (giveaway.prizes) announcement += `\n🎁 Приз: ${giveaway.prizes}`;
  }

  const messageIds = giveaway.message_ids || {};
  for (const channelId of giveaway.channel_ids) {
    try {
      const msgId = messageIds[channelId];
      if (msgId) {
        await editChannelMessage(channelId, msgId, buildGiveawayPost(giveaway) + '\n\n<i>Розыгрыш завершён.</i>', { inline_keyboard: [] });
      }
      await sendChannelMessage(channelId, announcement);
    } catch (err) {
      console.error(`Failed to post winner announcement to ${channelId}:`, err.message);
    }
  }

  return { winners, totalParticipants };
}

// GET /api/admin/giveaways
async function listGiveaways(req, res) {
  try {
    // Auto-process any expired giveaways before returning the list
    const { rows: expired } = await pool.query(
      `SELECT id FROM giveaways WHERE status = 'active' AND end_time <= NOW()`
    );
    for (const { id } of expired) {
      pickAndAnnounceWinners(id).catch(err =>
        console.error(`Auto-process giveaway ${id} failed:`, err.message)
      );
    }

    const { rows: giveaways } = await pool.query(
      `SELECT g.*,
        (SELECT COUNT(*) FROM giveaway_participants WHERE giveaway_id = g.id) AS participant_count
       FROM giveaways g
       ORDER BY g.created_at DESC
       LIMIT 50`
    );

    for (const g of giveaways) {
      if (g.winner_user_ids?.length) {
        const { rows } = await pool.query(
          `SELECT user_id, first_name, username FROM giveaway_participants
           WHERE giveaway_id = $1 AND user_id = ANY($2)`,
          [g.id, g.winner_user_ids]
        );
        g.winners = rows;
      }
    }

    const channels = await getChannels();
    res.json({ giveaways, channels });
  } catch (err) {
    console.error('listGiveaways error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// POST /api/admin/giveaways/create
async function createGiveaway(req, res) {
  const { title, description, prizes, winner_count, channel_ids, end_time } = req.body || {};

  if (!title || !channel_ids?.length || !end_time || !winner_count) {
    return res.status(400).json({ error: 'title, channel_ids, winner_count, end_time required' });
  }
  if (new Date(end_time) <= new Date()) {
    return res.status(400).json({ error: 'end_time must be in the future' });
  }

  const configured = await getChannels();
  const configuredIds = configured.map(c => c.id);
  const validChannels = channel_ids.filter(id => configuredIds.includes(id));
  if (!validChannels.length) {
    return res.status(400).json({ error: 'No valid channels selected' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO giveaways (title, description, prizes, winner_count, channel_ids, end_time)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [title, description || null, prizes || null, winner_count, validChannels, end_time]
    );
    const giveaway = rows[0];

    const messageIds = {};
    const postText = buildGiveawayPost(giveaway);
    const button = buildParticipateButton(giveaway.id);

    for (const channelId of validChannels) {
      try {
        const msg = await sendChannelMessage(channelId, postText, button);
        messageIds[channelId] = msg.message_id;
      } catch (err) {
        console.error(`Failed to post giveaway to channel ${channelId}:`, err.response?.data || err.message);
      }
    }

    await pool.query('UPDATE giveaways SET message_ids = $1 WHERE id = $2', [messageIds, giveaway.id]);
    giveaway.message_ids = messageIds;

    res.json({ giveaway });
  } catch (err) {
    console.error('createGiveaway error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// POST /api/admin/giveaways/pick-winners
async function pickWinners(req, res) {
  const { giveaway_id } = req.body || {};
  if (!giveaway_id) return res.status(400).json({ error: 'giveaway_id required' });

  const { rows } = await pool.query('SELECT status FROM giveaways WHERE id = $1', [giveaway_id]);
  if (!rows.length) return res.status(404).json({ error: 'Giveaway not found' });
  if (rows[0].status !== 'active') return res.status(400).json({ error: 'Giveaway is not active' });

  try {
    const result = await pickAndAnnounceWinners(giveaway_id);
    res.json(result);
  } catch (err) {
    console.error('pickWinners error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// POST /api/admin/giveaways/cancel
async function cancelGiveaway(req, res) {
  const { giveaway_id } = req.body || {};
  if (!giveaway_id) return res.status(400).json({ error: 'giveaway_id required' });

  const { rows } = await pool.query(
    `UPDATE giveaways SET status = 'cancelled' WHERE id = $1 AND status = 'active' RETURNING *`,
    [giveaway_id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Active giveaway not found' });

  const giveaway = rows[0];
  const messageIds = giveaway.message_ids || {};
  for (const channelId of giveaway.channel_ids) {
    const msgId = messageIds[channelId];
    if (msgId) {
      await editChannelMessage(channelId, msgId, buildGiveawayPost(giveaway) + '\n\n<i>Розыгрыш отменён.</i>', { inline_keyboard: [] });
    }
  }

  res.json({ ok: true });
}

// POST /api/admin/giveaways/channels
async function saveChannels(req, res) {
  const { channels } = req.body || {};
  if (!Array.isArray(channels)) return res.status(400).json({ error: 'channels must be an array' });

  const cleaned = channels
    .filter(c => c.id && c.name)
    .map(c => ({ id: String(c.id).trim(), name: String(c.name).trim() }));

  try {
    await pool.query(
      `INSERT INTO app_settings (key, value) VALUES ('giveaway_channels', $1)
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
      [JSON.stringify(cleaned)]
    );
    res.json({ ok: true, channels: cleaned });
  } catch (err) {
    console.error('saveChannels error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { listGiveaways, createGiveaway, pickWinners, cancelGiveaway, saveChannels, pickAndAnnounceWinners };

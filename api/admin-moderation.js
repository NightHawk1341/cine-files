/**
 * Word filter / auto-moderation API (TR-BUTE pattern).
 * CRUD for banned words + test endpoint.
 */

let wordCache = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function invalidateCache() {
  wordCache = null;
  cacheTime = 0;
}

async function getActiveWords(pool) {
  if (wordCache && Date.now() - cacheTime < CACHE_TTL) {
    return wordCache;
  }
  const { rows } = await pool.query(
    'SELECT word FROM moderation_words WHERE is_active = true'
  );
  wordCache = rows.map(r => r.word.toLowerCase());
  cacheTime = Date.now();
  return wordCache;
}

function list({ pool }) {
  return async (req, res) => {
    try {
      const { category, search, active } = req.query;
      let query = 'SELECT * FROM moderation_words WHERE 1=1';
      const params = [];
      let idx = 1;

      if (category) {
        query += ` AND category = $${idx++}`;
        params.push(category);
      }
      if (search) {
        query += ` AND word ILIKE $${idx++}`;
        params.push(`%${search}%`);
      }
      if (active !== undefined) {
        query += ` AND is_active = $${idx++}`;
        params.push(active === 'true');
      }

      query += ' ORDER BY word ASC LIMIT 500';
      const { rows } = await pool.query(query, params);
      res.json({ words: rows });
    } catch (err) {
      console.error('moderation/list error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

function create({ pool }) {
  return async (req, res) => {
    const { words, category } = req.body;

    if (!words || !Array.isArray(words) || words.length === 0) {
      return res.status(400).json({ error: 'words array is required' });
    }

    try {
      const clean = words
        .map(w => (typeof w === 'string' ? w.trim().toLowerCase() : ''))
        .filter(w => w.length > 0);

      if (clean.length === 0) {
        return res.status(400).json({ error: 'No valid words provided' });
      }

      let inserted = 0;
      let skipped = 0;

      for (const word of clean) {
        try {
          await pool.query(
            `INSERT INTO moderation_words (word, category)
             VALUES ($1, $2)
             ON CONFLICT (word) DO NOTHING`,
            [word, category || 'general']
          );
          inserted++;
        } catch (e) {
          skipped++;
        }
      }

      invalidateCache();
      res.status(201).json({ inserted, skipped });
    } catch (err) {
      console.error('moderation/create error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

function update({ pool }) {
  return async (req, res) => {
    const { id } = req.params;
    const { word, category, is_active } = req.body;

    try {
      const { rows } = await pool.query(
        `UPDATE moderation_words SET
         word = COALESCE($1, word),
         category = COALESCE($2, category),
         is_active = COALESCE($3, is_active),
         updated_at = NOW()
         WHERE id = $4 RETURNING *`,
        [word ? word.trim().toLowerCase() : null, category, is_active, id]
      );

      if (!rows[0]) return res.status(404).json({ error: 'Not found' });
      invalidateCache();
      res.json(rows[0]);
    } catch (err) {
      console.error('moderation/update error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

function remove({ pool }) {
  return async (req, res) => {
    try {
      await pool.query('DELETE FROM moderation_words WHERE id = $1', [req.params.id]);
      invalidateCache();
      res.json({ ok: true });
    } catch (err) {
      console.error('moderation/remove error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

function test({ pool }) {
  return async (req, res) => {
    const { text } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'text is required' });
    }

    try {
      const words = await getActiveWords(pool);
      const normalized = text.toLowerCase();
      const triggered = words.filter(w => normalized.includes(w));

      res.json({
        pass: triggered.length === 0,
        triggered,
        normalized,
        original: text,
      });
    } catch (err) {
      console.error('moderation/test error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

module.exports = { list, create, update, remove, test, getActiveWords };

/**
 * Moderation Words Management API (Admin)
 * CRUD operations for banned word list
 * GET/POST/PUT/DELETE /api/admin/moderation/words
 */

const { getPool } = require('../../../lib/db');
const { success, error, badRequest, methodNotAllowed } = require('../../../server/utils/response-helpers');
const { invalidateCache } = require('../../../lib/moderation');

const pool = getPool();

module.exports = async function handler(req, res) {
  switch (req.method) {
    case 'GET':
      return handleGet(req, res);
    case 'POST':
      return handleCreate(req, res);
    case 'PUT':
      return handleUpdate(req, res);
    case 'DELETE':
      return handleDelete(req, res);
    default:
      return methodNotAllowed(res, ['GET', 'POST', 'PUT', 'DELETE']);
  }
};

/**
 * GET - List all words with optional filters
 */
async function handleGet(req, res) {
  try {
    const { category, search, active } = req.query;

    let query = 'SELECT * FROM moderation_words';
    const conditions = [];
    const params = [];

    if (category) {
      params.push(category);
      conditions.push(`category = $${params.length}`);
    }

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`word ILIKE $${params.length}`);
    }

    if (active !== undefined) {
      params.push(active === 'true');
      conditions.push(`is_active = $${params.length}`);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY category, word';

    const result = await pool.query(query, params);
    return success(res, { words: result.rows });
  } catch (err) {
    console.error('[moderation] Error fetching words:', err);
    return error(res, 'Failed to fetch moderation words', 500);
  }
}

/**
 * POST - Create word(s). Supports single and bulk insert.
 * Body: { word, category } or { words: ['w1','w2'], category }
 */
async function handleCreate(req, res) {
  try {
    const { word, words, category = 'general' } = req.body;

    const wordList = words || (word ? [word] : []);
    if (wordList.length === 0) {
      return badRequest(res, 'word or words[] is required');
    }

    // Filter empty/duplicate entries
    const cleaned = [...new Set(
      wordList
        .map(w => (typeof w === 'string' ? w.trim().toLowerCase() : ''))
        .filter(w => w.length > 0)
    )];

    if (cleaned.length === 0) {
      return badRequest(res, 'No valid words provided');
    }

    const inserted = [];
    const skipped = [];

    for (const w of cleaned) {
      try {
        const result = await pool.query(
          `INSERT INTO moderation_words (word, category)
           VALUES ($1, $2)
           ON CONFLICT (word, category) DO NOTHING
           RETURNING *`,
          [w, category]
        );
        if (result.rows.length > 0) {
          inserted.push(result.rows[0]);
        } else {
          skipped.push(w);
        }
      } catch (insertErr) {
        console.error(`[moderation] Error inserting word "${w}":`, insertErr);
        skipped.push(w);
      }
    }

    invalidateCache();

    console.log(`[moderation] Added ${inserted.length} words, skipped ${skipped.length}`);
    return success(res, { inserted, skipped });
  } catch (err) {
    console.error('[moderation] Error creating words:', err);
    return error(res, 'Failed to create moderation words', 500);
  }
}

/**
 * PUT - Update a word
 * Body: { id, word?, category?, is_active? }
 */
async function handleUpdate(req, res) {
  try {
    const { id, word, category, is_active } = req.body;

    if (!id) {
      return badRequest(res, 'id is required');
    }

    const updates = [];
    const values = [];
    let paramCount = 1;

    if (word !== undefined) {
      updates.push(`word = $${paramCount++}`);
      values.push(word.trim().toLowerCase());
    }

    if (category !== undefined) {
      updates.push(`category = $${paramCount++}`);
      values.push(category);
    }

    if (is_active !== undefined) {
      updates.push(`is_active = $${paramCount++}`);
      values.push(is_active);
    }

    if (updates.length === 0) {
      return badRequest(res, 'No fields to update');
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const result = await pool.query(`
      UPDATE moderation_words
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `, values);

    if (result.rows.length === 0) {
      return badRequest(res, 'Word not found');
    }

    invalidateCache();

    return success(res, { word: result.rows[0] });
  } catch (err) {
    console.error('[moderation] Error updating word:', err);
    return error(res, 'Failed to update moderation word', 500);
  }
}

/**
 * DELETE - Delete a word
 * Query: ?id=
 */
async function handleDelete(req, res) {
  try {
    const { id } = req.query;

    if (!id) {
      return badRequest(res, 'id is required');
    }

    const result = await pool.query(
      'DELETE FROM moderation_words WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return badRequest(res, 'Word not found');
    }

    invalidateCache();

    return success(res, { deleted: true, id: parseInt(id) });
  } catch (err) {
    console.error('[moderation] Error deleting word:', err);
    return error(res, 'Failed to delete moderation word', 500);
  }
}

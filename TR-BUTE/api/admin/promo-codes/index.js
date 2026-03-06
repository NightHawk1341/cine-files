/**
 * Promo Codes Management API (Admin)
 * CRUD operations for promo codes
 * GET/POST/PUT/DELETE /api/admin/promo-codes
 */

const { getPool } = require('../../../lib/db');
const { success, error, badRequest, methodNotAllowed } = require('../../../server/utils/response-helpers');

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
 * GET - List all promo codes
 */
async function handleGet(req, res) {
  try {
    const { search } = req.query;

    let query = 'SELECT * FROM promo_codes';
    const params = [];

    if (search) {
      query += ' WHERE code ILIKE $1';
      params.push(`%${search}%`);
    }

    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, params);

    return success(res, { promo_codes: result.rows });
  } catch (err) {
    console.error('Error fetching promo codes:', err);
    return error(res, 'Failed to fetch promo codes', 500);
  }
}

/**
 * POST - Create a new promo code
 */
async function handleCreate(req, res) {
  try {
    const { code, type, value, min_order_amount, max_uses, valid_from, valid_until, is_active } = req.body;

    if (!code || !value) {
      return badRequest(res, 'Код и значение обязательны');
    }

    if (!['fixed', 'percent'].includes(type)) {
      return badRequest(res, 'Тип должен быть fixed или percent');
    }

    if (type === 'percent' && (value < 1 || value > 100)) {
      return badRequest(res, 'Процент должен быть от 1 до 100');
    }

    // Check uniqueness
    const existing = await pool.query('SELECT id FROM promo_codes WHERE UPPER(code) = UPPER($1)', [code]);
    if (existing.rows.length > 0) {
      return badRequest(res, 'Промо-код с таким кодом уже существует');
    }

    const result = await pool.query(`
      INSERT INTO promo_codes (code, type, value, min_order_amount, max_uses, valid_from, valid_until, is_active)
      VALUES (UPPER($1), $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [
      code,
      type || 'fixed',
      value,
      min_order_amount || 0,
      max_uses || null,
      valid_from || null,
      valid_until || null,
      is_active !== false
    ]);

    console.log(`[PROMO] Created promo code: ${code.toUpperCase()}`);

    return success(res, { promo_code: result.rows[0] }, 201);
  } catch (err) {
    console.error('Error creating promo code:', err);
    return error(res, 'Failed to create promo code', 500);
  }
}

/**
 * PUT - Update a promo code
 */
async function handleUpdate(req, res) {
  try {
    const { id, code, type, value, min_order_amount, max_uses, valid_from, valid_until, is_active } = req.body;

    if (!id) {
      return badRequest(res, 'id is required');
    }

    const updates = [];
    const values = [];
    let paramCount = 1;

    if (code !== undefined) {
      // Check uniqueness if changing code
      const existing = await pool.query('SELECT id FROM promo_codes WHERE UPPER(code) = UPPER($1) AND id != $2', [code, id]);
      if (existing.rows.length > 0) {
        return badRequest(res, 'Промо-код с таким кодом уже существует');
      }
      updates.push(`code = UPPER($${paramCount++})`);
      values.push(code);
    }

    if (type !== undefined) {
      updates.push(`type = $${paramCount++}`);
      values.push(type);
    }

    if (value !== undefined) {
      updates.push(`value = $${paramCount++}`);
      values.push(value);
    }

    if (min_order_amount !== undefined) {
      updates.push(`min_order_amount = $${paramCount++}`);
      values.push(min_order_amount);
    }

    if (max_uses !== undefined) {
      updates.push(`max_uses = $${paramCount++}`);
      values.push(max_uses);
    }

    if (valid_from !== undefined) {
      updates.push(`valid_from = $${paramCount++}`);
      values.push(valid_from);
    }

    if (valid_until !== undefined) {
      updates.push(`valid_until = $${paramCount++}`);
      values.push(valid_until);
    }

    if (is_active !== undefined) {
      updates.push(`is_active = $${paramCount++}`);
      values.push(is_active);
    }

    if (updates.length === 0) {
      return badRequest(res, 'No fields to update');
    }

    values.push(id);

    const result = await pool.query(`
      UPDATE promo_codes
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `, values);

    if (result.rows.length === 0) {
      return badRequest(res, 'Promo code not found');
    }

    console.log(`[PROMO] Updated promo code #${id}`);

    return success(res, { promo_code: result.rows[0] });
  } catch (err) {
    console.error('Error updating promo code:', err);
    return error(res, 'Failed to update promo code', 500);
  }
}

/**
 * DELETE - Delete a promo code
 */
async function handleDelete(req, res) {
  try {
    const { id } = req.query;

    if (!id) {
      return badRequest(res, 'id is required');
    }

    const result = await pool.query('DELETE FROM promo_codes WHERE id = $1 RETURNING id, code', [id]);

    if (result.rows.length === 0) {
      return badRequest(res, 'Promo code not found');
    }

    console.log(`[PROMO] Deleted promo code #${id}: ${result.rows[0].code}`);

    return success(res, { deleted: true, id: parseInt(id) });
  } catch (err) {
    console.error('Error deleting promo code:', err);
    return error(res, 'Failed to delete promo code', 500);
  }
}

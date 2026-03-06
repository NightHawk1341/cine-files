/**
 * Public Promo Code Validation API
 * GET /api/promo-codes/validate?code=XXX
 *
 * Returns promo code details if valid, or error if invalid.
 * Does NOT require authentication - anyone can check if a code is valid.
 */

const { getPool } = require('../../lib/db');
const { success, badRequest, methodNotAllowed } = require('../../server/utils/response-helpers');

const pool = getPool();

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return methodNotAllowed(res, ['GET']);
  }

  const { code } = req.query;

  if (!code || !code.trim()) {
    return badRequest(res, 'Код промо-кода обязателен');
  }

  try {
    const result = await pool.query(
      'SELECT id, code, type, value, min_order_amount, max_uses, uses_count, valid_from, valid_until, is_active FROM promo_codes WHERE UPPER(code) = UPPER($1)',
      [code.trim()]
    );

    if (result.rows.length === 0) {
      return badRequest(res, 'Промо-код не найден');
    }

    const promo = result.rows[0];

    // Check if active
    if (!promo.is_active) {
      return badRequest(res, 'Промо-код неактивен');
    }

    // Check if expired
    if (promo.valid_until && new Date(promo.valid_until) < new Date()) {
      return badRequest(res, 'Срок действия промо-кода истёк');
    }

    // Check if not yet valid
    if (promo.valid_from && new Date(promo.valid_from) > new Date()) {
      return badRequest(res, 'Промо-код ещё не активен');
    }

    // Check max uses
    if (promo.max_uses && promo.uses_count >= promo.max_uses) {
      return badRequest(res, 'Промо-код исчерпан');
    }

    // Return valid promo code info (without internal fields)
    return success(res, {
      promo_code: {
        code: promo.code,
        type: promo.type,
        value: parseFloat(promo.value),
        min_order_amount: parseFloat(promo.min_order_amount) || 0,
        valid_until: promo.valid_until || null
      }
    });
  } catch (err) {
    console.error('Error validating promo code:', err);
    return res.status(500).json({ success: false, error: 'Ошибка проверки промо-кода' });
  }
};

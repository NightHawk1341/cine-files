/**
 * Saved Addresses API
 * CRUD operations for user delivery addresses
 *
 * GET    /api/user/addresses      - List all addresses
 * POST   /api/user/addresses      - Create address
 * PUT    /api/user/addresses/:id  - Update address
 * DELETE /api/user/addresses/:id  - Delete address
 */
const { getPool } = require('../../lib/db');
const { success, error, badRequest, notFound, forbidden, methodNotAllowed } = require('../../server/utils/response-helpers');
const pool = getPool();
const MAX_ADDRESSES = 5;
/**
 * List all addresses for authenticated user
 */
async function listAddresses(req, res) {
  try {
    const userId = req.userId;
    const result = await pool.query(
      `SELECT id, label, surname, name, phone, postal_index, address,
              entrance, floor_number, apartment, comment, is_default, created_at, updated_at
       FROM user_addresses
       WHERE user_id = $1
       ORDER BY is_default DESC, updated_at DESC`,
      [userId]
    );
    return success(res, { addresses: result.rows });
  } catch (err) {
    console.error('Error listing addresses:', err);
    return error(res, 'Failed to list addresses', 500);
  }
}
/**
 * Create a new saved address
 */
async function createAddress(req, res) {
  try {
    const userId = req.userId;
    const { label, surname, name, phone, postal_index, address, entrance, floor_number, apartment, comment, is_default } = req.body;
    if (!surname || !name || !phone || !address) {
      return badRequest(res, 'surname, name, phone, and address are required');
    }
    // Check max limit
    const countResult = await pool.query(
      'SELECT COUNT(*)::int as count FROM user_addresses WHERE user_id = $1',
      [userId]
    );
    if (countResult.rows[0].count >= MAX_ADDRESSES) {
      return badRequest(res, `Maximum ${MAX_ADDRESSES} addresses allowed`);
    }
    // If setting as default, unset other defaults
    if (is_default) {
      await pool.query(
        'UPDATE user_addresses SET is_default = false WHERE user_id = $1',
        [userId]
      );
    }
    // Auto-set as default if first address
    const setDefault = is_default || countResult.rows[0].count === 0;
    const result = await pool.query(
      `INSERT INTO user_addresses (user_id, label, surname, name, phone, postal_index, address, entrance, floor_number, apartment, comment, is_default)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [userId, label || null, surname, name, phone, postal_index || null, address, entrance || null, floor_number || null, apartment || null, comment || null, setDefault]
    );
    return success(res, { address: result.rows[0] }, 201);
  } catch (err) {
    console.error('Error creating address:', err);
    return error(res, 'Failed to create address', 500);
  }
}
/**
 * Update an existing address
 */
async function updateAddress(req, res) {
  try {
    const userId = req.userId;
    const addressId = parseInt(req.params.id, 10);
    if (isNaN(addressId)) return badRequest(res, 'Invalid address ID');
    // Verify ownership
    const existing = await pool.query(
      'SELECT id FROM user_addresses WHERE id = $1 AND user_id = $2',
      [addressId, userId]
    );
    if (existing.rows.length === 0) {
      return notFound(res, 'Address');
    }
    const { label, surname, name, phone, postal_index, address, entrance, floor_number, apartment, comment, is_default } = req.body;
    // Allow setting only is_default without requiring all fields
    const isDefaultOnly = is_default && !surname && !name && !phone && !address;
    if (!isDefaultOnly && (!surname || !name || !phone || !address)) {
      return badRequest(res, 'surname, name, phone, and address are required');
    }
    // If setting as default, unset other defaults
    if (is_default) {
      await pool.query(
        'UPDATE user_addresses SET is_default = false WHERE user_id = $1 AND id != $2',
        [userId, addressId]
      );
    }
    let result;
    if (isDefaultOnly) {
      result = await pool.query(
        `UPDATE user_addresses SET is_default = true, updated_at = now()
         WHERE id = $1 AND user_id = $2 RETURNING *`,
        [addressId, userId]
      );
    } else {
      result = await pool.query(
        `UPDATE user_addresses
         SET label = $1, surname = $2, name = $3, phone = $4, postal_index = $5,
             address = $6, entrance = $7, floor_number = $8, apartment = $9,
             comment = $10, is_default = $11, updated_at = now()
         WHERE id = $12 AND user_id = $13
         RETURNING *`,
        [label || null, surname, name, phone, postal_index || null, address, entrance || null, floor_number || null, apartment || null, comment || null, !!is_default, addressId, userId]
      );
    }
    return success(res, { address: result.rows[0] });
  } catch (err) {
    console.error('Error updating address:', err);
    return error(res, 'Failed to update address', 500);
  }
}
/**
 * Delete an address
 */
async function deleteAddress(req, res) {
  try {
    const userId = req.userId;
    const addressId = parseInt(req.params.id, 10);
    if (isNaN(addressId)) return badRequest(res, 'Invalid address ID');
    // Verify ownership and check if default
    const existing = await pool.query(
      'SELECT id, is_default FROM user_addresses WHERE id = $1 AND user_id = $2',
      [addressId, userId]
    );
    if (existing.rows.length === 0) {
      return notFound(res, 'Address');
    }
    const wasDefault = existing.rows[0].is_default;
    await pool.query(
      'DELETE FROM user_addresses WHERE id = $1 AND user_id = $2',
      [addressId, userId]
    );
    // If deleted address was default, make most recent one default
    if (wasDefault) {
      await pool.query(
        `UPDATE user_addresses SET is_default = true
         WHERE user_id = $1 AND id = (
           SELECT id FROM user_addresses WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1
         )`,
        [userId]
      );
    }
    return success(res, { deleted: true });
  } catch (err) {
    console.error('Error deleting address:', err);
    return error(res, 'Failed to delete address', 500);
  }
}
module.exports = { listAddresses, createAddress, updateAddress, deleteAddress };
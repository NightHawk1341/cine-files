/**
 * Shipment Settings Endpoint
 * Get and update global shipment settings (next shipment date)
 * GET/POST /api/admin/shipments/settings
 *
 * REQUIRES ADMIN AUTHENTICATION
 */

const { getPool } = require('../../../lib/db');
const { success, error, badRequest, unauthorized, methodNotAllowed } = require('../../../server/utils/response-helpers');
const pool = getPool();

/**
 * Main handler
 */
module.exports = async function handler(req, res) {
  // Verify admin authentication
  if (!req.adminUser) {
    return unauthorized(res, 'Admin authentication required');
  }

  if (req.method === 'GET') {
    return handleGet(req, res);
  } else if (req.method === 'POST') {
    return handlePost(req, res);
  } else {
    return methodNotAllowed(res, ['GET', 'POST']);
  }
};

/**
 * GET handler - retrieve current settings
 */
async function handleGet(req, res) {
  try {
    // Try to get both dates, fallback if end date column doesn't exist
    let result;
    try {
      result = await pool.query(`
        SELECT ss.*, u.username as updated_by_name
        FROM shipment_settings ss
        LEFT JOIN users u ON ss.updated_by = u.id
        ORDER BY ss.id DESC
        LIMIT 1
      `);
    } catch (err) {
      if (err.message && err.message.includes('next_shipment_date_end')) {
        // Column doesn't exist, query without it
        result = await pool.query(`
          SELECT ss.id, ss.next_shipment_date, ss.updated_at, ss.updated_by,
                 NULL as next_shipment_date_end, u.username as updated_by_name
          FROM shipment_settings ss
          LEFT JOIN users u ON ss.updated_by = u.id
          ORDER BY ss.id DESC
          LIMIT 1
        `);
      } else {
        throw err;
      }
    }

    if (result.rows.length === 0) {
      // Return default settings if none exist
      return success(res, {
        settings: {
          id: null,
          next_shipment_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          updated_at: null,
          updated_by: null,
          updated_by_name: null
        }
      });
    }

    return success(res, {
      settings: result.rows[0]
    });
  } catch (err) {
    console.error('Error fetching shipment settings:', err);
    return error(res, 'Failed to fetch shipment settings', 500);
  }
}

/**
 * POST handler - update settings
 * Supports both single date and date period (start + end)
 */
async function handlePost(req, res) {
  try {
    const { next_shipment_date, next_shipment_date_end } = req.body;

    if (!next_shipment_date) {
      return badRequest(res, 'next_shipment_date is required');
    }

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(next_shipment_date)) {
      return badRequest(res, 'Invalid date format. Use YYYY-MM-DD');
    }

    // Validate end date format if provided
    if (next_shipment_date_end && !dateRegex.test(next_shipment_date_end)) {
      return badRequest(res, 'Invalid end date format. Use YYYY-MM-DD');
    }

    // Validate date is not in the past
    const shipmentDate = new Date(next_shipment_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (shipmentDate < today) {
      return badRequest(res, 'Shipment date cannot be in the past');
    }

    // Validate end date is after or equal to start date
    if (next_shipment_date_end) {
      const endDate = new Date(next_shipment_date_end);
      if (endDate < shipmentDate) {
        return badRequest(res, 'End date must be after or equal to start date');
      }
    }

    // Check if settings exist
    const existingResult = await pool.query('SELECT id FROM shipment_settings LIMIT 1');

    // First, ensure the column exists (for backwards compatibility)
    try {
      await pool.query(`
        ALTER TABLE shipment_settings
        ADD COLUMN IF NOT EXISTS next_shipment_date_end date
      `);
    } catch (alterErr) {
      // Column might already exist or can't be added, continue anyway
      console.log('Note: Could not add next_shipment_date_end column:', alterErr.message);
    }

    let result;
    if (existingResult.rows.length === 0) {
      // Insert new settings
      result = await pool.query(`
        INSERT INTO shipment_settings (next_shipment_date, next_shipment_date_end, updated_at, updated_by)
        VALUES ($1, $2, NOW(), $3)
        RETURNING *
      `, [next_shipment_date, next_shipment_date_end || null, req.adminUser?.id]);
    } else {
      // Update existing settings
      result = await pool.query(`
        UPDATE shipment_settings
        SET next_shipment_date = $1,
            next_shipment_date_end = $2,
            updated_at = NOW(),
            updated_by = $3
        WHERE id = $4
        RETURNING *
      `, [next_shipment_date, next_shipment_date_end || null, req.adminUser?.id, existingResult.rows[0].id]);
    }

    // Get updated_by username
    const userResult = await pool.query(
      'SELECT username FROM users WHERE id = $1',
      [req.adminUser?.id]
    );

    return success(res, {
      message: 'Shipment settings updated successfully',
      settings: {
        ...result.rows[0],
        updated_by_name: userResult.rows[0]?.username
      }
    });
  } catch (err) {
    console.error('Error updating shipment settings:', err);
    return error(res, 'Failed to update shipment settings', 500);
  }
}

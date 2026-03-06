/**
 * Packaging Configuration API
 * GET/POST /api/shipping/packaging-config
 *
 * Manages packaging types, product weights, and capacity limits for parcel calculation
 */

const { getPool } = require('../../lib/db');

const pool = getPool();

// Default capacity limits if not in database
const DEFAULT_CAPACITY_LIMITS = {
  tube_a3: { a3: 5, a2: 0, a1: 0 },
  tube_a2: { a3: 5, a2: 5, a1: 0 },
  tube_a1: { a3: 5, a2: 5, a1: 5 },
  half_carton: { a3Framed: 2, a2Framed: 0, a3Frameless: 3 },
  full_carton: { a3Framed: 5, a2Framed: 5, a3Frameless: 5 }
};

/**
 * GET - Fetch all packaging configuration
 * Returns: packaging types, product weights, capacity limits
 */
async function handleGet(req, res) {
  try {
    // Fetch packaging types from packaging_config table
    const packagingResult = await pool.query(`
      SELECT
        id, code, display_name, cost, weight_grams,
        max_frameless_format, is_carton, carton_size, is_active,
        dimensions_length_cm, dimensions_width_cm, dimensions_height_cm
      FROM packaging_config
      WHERE is_active = true
      ORDER BY id
    `);

    // Fetch product weights from product_prices table
    const weightsResult = await pool.query(`
      SELECT id, format, frame_type, weight_grams
      FROM product_prices
      ORDER BY id
    `);

    // Fetch capacity limits from app_settings
    const capacityResult = await pool.query(`
      SELECT value FROM app_settings WHERE key = 'capacity_limits'
    `);

    const capacityLimits = capacityResult.rows.length > 0 && capacityResult.rows[0].value
      ? capacityResult.rows[0].value
      : DEFAULT_CAPACITY_LIMITS;

    return res.status(200).json({
      success: true,
      packaging: packagingResult.rows,
      weights: weightsResult.rows,
      capacityLimits
    });
  } catch (err) {
    console.error('Error fetching packaging config:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch packaging configuration',
      details: err.message
    });
  }
}

/**
 * POST - Update packaging configuration
 * Body can contain: packaging (array), weights (array), capacityLimits (object)
 */
async function handlePost(req, res) {
  const { packaging, weights, capacityLimits } = req.body;

  try {
    const results = {
      packagingUpdated: 0,
      weightsUpdated: 0,
      capacityLimitsUpdated: false
    };

    // Update packaging configuration
    if (packaging && Array.isArray(packaging)) {
      for (const pkg of packaging) {
        if (!pkg.code) continue;

        // Only update cost and weight_grams for existing records
        await pool.query(`
          UPDATE packaging_config
          SET
            cost = $2,
            weight_grams = $3,
            updated_at = CURRENT_TIMESTAMP
          WHERE code = $1
        `, [
          pkg.code,
          pkg.cost,
          pkg.weight_grams || pkg.weightGrams
        ]);
        results.packagingUpdated++;
      }
    }

    // Update product weights
    if (weights && Array.isArray(weights)) {
      for (const weight of weights) {
        if (!weight.id) continue;

        await pool.query(`
          UPDATE product_prices
          SET weight_grams = $1, updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
        `, [weight.weight_grams || weight.weightGrams || 0, weight.id]);
        results.weightsUpdated++;
      }
    }

    // Update capacity limits in app_settings
    if (capacityLimits) {
      await pool.query(`
        INSERT INTO app_settings (key, value, updated_at)
        VALUES ('capacity_limits', $1::jsonb, CURRENT_TIMESTAMP)
        ON CONFLICT (key) DO UPDATE SET
          value = EXCLUDED.value,
          updated_at = CURRENT_TIMESTAMP
      `, [JSON.stringify(capacityLimits)]);
      results.capacityLimitsUpdated = true;
    }

    return res.status(200).json({
      success: true,
      message: 'Packaging configuration updated successfully',
      ...results
    });
  } catch (err) {
    console.error('Error updating packaging config:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to update packaging configuration',
      details: err.message
    });
  }
}

/**
 * Main handler
 */
module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    return handleGet(req, res);
  } else if (req.method === 'POST') {
    return handlePost(req, res);
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
};

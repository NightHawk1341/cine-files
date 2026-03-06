/**
 * API: Get Delivery Price Suggestion
 *
 * GET /api/shipping/suggest
 *
 * Returns suggested delivery price based on historical data.
 * Used when admin needs to manually set delivery cost.
 */

const { getPool } = require('../../lib/db');
const { success, badRequest } = require('../../server/utils/response-helpers');

const pool = getPool();

module.exports = async function handler(req, res) {
  // CORS handled by global middleware in server.js

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { postal_code, weight, delivery_type } = req.query;

    // Validate required fields
    if (!postal_code) {
      return badRequest(res, 'Missing required field: postal_code');
    }

    if (!weight) {
      return badRequest(res, 'Missing required field: weight');
    }

    const weightGrams = parseInt(weight);
    if (isNaN(weightGrams) || weightGrams <= 0) {
      return badRequest(res, 'Invalid weight value');
    }

    // Get postal prefix (first 3 digits)
    const postalPrefix = postal_code.substring(0, 3);

    // Query for similar past deliveries
    // Match by: same postal prefix, similar weight (±20%), same delivery type (if specified), last 6 months
    const weightMin = Math.floor(weightGrams * 0.8);
    const weightMax = Math.ceil(weightGrams * 1.2);

    let query = `
      SELECT
        ROUND(AVG(total_price)) as suggested_price,
        MIN(total_price) as min_price,
        MAX(total_price) as max_price,
        COUNT(*) as sample_size,
        (SELECT total_price FROM delivery_estimates
         WHERE postal_prefix = $1
           AND source = 'api'
         ORDER BY created_at DESC
         LIMIT 1) as last_api_price
      FROM delivery_estimates
      WHERE postal_prefix = $1
        AND weight_grams BETWEEN $2 AND $3
        AND created_at > NOW() - INTERVAL '6 months'
    `;

    const values = [postalPrefix, weightMin, weightMax];
    let paramIndex = 4;

    // Add delivery type filter if specified
    if (delivery_type) {
      query += ` AND delivery_type = $${paramIndex}`;
      values.push(delivery_type);
      paramIndex++;
    }

    const result = await pool.query(query, values);
    const stats = result.rows[0];

    // Determine confidence level
    const sampleSize = parseInt(stats.sample_size) || 0;
    let confidence = 'none';
    let message = 'Нет данных для рекомендации';

    if (sampleSize > 0) {
      const suggestedPrice = parseInt(stats.suggested_price);
      const minPrice = parseInt(stats.min_price);
      const maxPrice = parseInt(stats.max_price);

      if (sampleSize >= 10) {
        confidence = 'high';
        const deviation = Math.round((maxPrice - minPrice) / 2);
        message = `${suggestedPrice}₽ ± ${deviation}₽ (надёжная оценка)`;
      } else if (sampleSize >= 4) {
        confidence = 'medium';
        message = `${minPrice}-${maxPrice}₽ (на основе ${sampleSize} заказов)`;
      } else {
        confidence = 'low';
        message = `~${suggestedPrice}₽ (мало данных)`;
      }
    }

    return success(res, {
      suggestion: {
        recommended_price: parseInt(stats.suggested_price) || null,
        min_price: parseInt(stats.min_price) || null,
        max_price: parseInt(stats.max_price) || null,
        sample_size: sampleSize,
        confidence,
        last_api_price: parseInt(stats.last_api_price) || null,
        message
      }
    });

  } catch (error) {
    console.error('Delivery suggestion error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get delivery suggestion',
      message: error.message
    });
  }
};

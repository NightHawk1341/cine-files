/**
 * Author Statistics Endpoint
 * Returns statistics about product authors
 * GET /api/analytics/author-stats?period={period}
 */

const { getPool } = require('../../lib/db');
const { success, error, methodNotAllowed } = require('../../server/utils/response-helpers');
const pool = getPool();

/**
 * Get date filter SQL based on period
 */
function getDateFilter(period) {
  switch (period) {
    case 'today':
      return "AND o.created_at >= CURRENT_DATE";
    case 'week':
      return "AND o.created_at >= CURRENT_DATE - INTERVAL '7 days'";
    case 'month':
      return "AND o.created_at >= CURRENT_DATE - INTERVAL '30 days'";
    case 'year':
      return "AND o.created_at >= CURRENT_DATE - INTERVAL '365 days'";
    case 'all':
    default:
      return "";
  }
}

/**
 * Main handler
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return methodNotAllowed(res, ['GET']);
  }

  try {
    const period = req.query.period || 'month';
    const dateFilter = getDateFilter(period);

    let authors = [];

    try {
      // Get author statistics: number of products, total sales, revenue
      const result = await pool.query(`
        WITH author_products AS (
          SELECT
            p.author,
            COUNT(DISTINCT p.id) as product_count
          FROM products p
          WHERE p.author IS NOT NULL AND p.author != ''
          GROUP BY p.author
        ),
        author_sales AS (
          SELECT
            p.author,
            COUNT(DISTINCT o.id) as order_count,
            SUM(oi.quantity) as total_quantity,
            SUM(oi.price * oi.quantity) as total_revenue
          FROM products p
          JOIN order_items oi ON p.id = oi.product_id
          JOIN orders o ON oi.order_id = o.id
          WHERE p.author IS NOT NULL AND p.author != ''
            AND o.status NOT IN ('cancelled', 'refunded')
            ${dateFilter}
          GROUP BY p.author
        )
        SELECT
          ap.author,
          ap.product_count,
          COALESCE(as2.order_count, 0) as order_count,
          COALESCE(as2.total_quantity, 0) as total_quantity,
          COALESCE(as2.total_revenue, 0) as total_revenue
        FROM author_products ap
        LEFT JOIN author_sales as2 ON ap.author = as2.author
        ORDER BY COALESCE(as2.total_revenue, 0) DESC, ap.product_count DESC
      `);

      authors = result.rows;
    } catch (queryError) {
      console.warn('Could not fetch author statistics (tables may not exist):', queryError.message);
      // Return empty data if tables don't exist yet
      authors = [];
    }

    return success(res, {
      period: period,
      authors: authors,
      total_authors: authors.length
    });

  } catch (err) {
    console.error('Error fetching author statistics:', err);
    return error(res, 'Failed to fetch author statistics', 500);
  }
};

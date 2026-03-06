/**
 * Product Statistics API
 * Provides detailed analytics for products
 * GET /api/analytics/product-stats
 */

const { getPool } = require('../../lib/db');
const { success, error, badRequest, notFound, methodNotAllowed } = require('../../server/utils/response-helpers');
const pool = getPool();

/**
 * Calculate product statistics
 */
async function calculateProductStats(productId) {
  // Get total purchases
  const purchasesResult = await pool.query(`
    SELECT COUNT(DISTINCT oi.order_id) as purchase_count
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    WHERE oi.product_id = $1
      AND o.status IN ('paid', 'shipped', 'completed')
  `, [productId]);

  // Get option popularity
  const optionsResult = await pool.query(`
    SELECT
      oi.property as option_name,
      COUNT(*) as count,
      SUM(oi.quantity) as total_quantity
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    WHERE oi.product_id = $1
      AND o.status IN ('paid', 'shipped', 'completed')
      AND oi.property IS NOT NULL
    GROUP BY oi.property
    ORDER BY count DESC
  `, [productId]);

  // Get cart statistics (orders containing this product)
  const cartStatsResult = await pool.query(`
    WITH product_orders AS (
      SELECT DISTINCT o.id, o.total_price
      FROM orders o
      JOIN order_items oi ON o.id = oi.order_id
      WHERE oi.product_id = $1
        AND o.status IN ('paid', 'shipped', 'completed')
    ),
    order_totals AS (
      SELECT
        po.id,
        po.total_price,
        COUNT(oi.id) as item_count,
        SUM(oi.quantity) as total_quantity,
        SUM(oi.price_at_purchase * oi.quantity) as items_total
      FROM product_orders po
      JOIN order_items oi ON po.id = oi.order_id
      GROUP BY po.id, po.total_price
    )
    SELECT
      AVG(items_total) as avg_cart_price,
      AVG(item_count) as avg_cart_items,
      AVG(total_quantity) as avg_cart_quantity
    FROM order_totals
  `, [productId]);

  // Get cancellation statistics
  const cancellationsResult = await pool.query(`
    SELECT
      o.status,
      COUNT(*) as count
    FROM orders o
    JOIN order_items oi ON o.id = oi.order_id
    WHERE oi.product_id = $1
      AND o.status = 'cancelled'
    GROUP BY o.status
  `, [productId]);

  // Get cancellation timeline (at what stage)
  const cancellationStagesResult = await pool.query(`
    SELECT
      CASE
        WHEN o.status = 'cancelled' AND o.payment_id IS NULL THEN 'before_payment'
        WHEN o.status = 'cancelled' AND o.payment_id IS NOT NULL THEN 'after_payment'
        ELSE 'other'
      END as stage,
      COUNT(*) as count
    FROM orders o
    JOIN order_items oi ON o.id = oi.order_id
    WHERE oi.product_id = $1
      AND o.status = 'cancelled'
    GROUP BY stage
  `, [productId]);

  return {
    purchase_count: parseInt(purchasesResult.rows[0]?.purchase_count || 0),
    popular_options: optionsResult.rows,
    avg_cart_price: parseFloat(cartStatsResult.rows[0]?.avg_cart_price || 0),
    avg_cart_items: parseFloat(cartStatsResult.rows[0]?.avg_cart_items || 0),
    avg_cart_quantity: parseFloat(cartStatsResult.rows[0]?.avg_cart_quantity || 0),
    cancellations: cancellationsResult.rows,
    cancellation_stages: cancellationStagesResult.rows
  };
}

/**
 * Get overall statistics (all products)
 */
async function getOverallStats() {
  // Top selling products
  const topProductsResult = await pool.query(`
    SELECT
      p.id,
      p.title,
      pi.url as image,
      COUNT(DISTINCT oi.order_id) as order_count,
      SUM(oi.quantity) as total_quantity,
      SUM(oi.price_at_purchase * oi.quantity) as total_revenue
    FROM products p
    JOIN order_items oi ON p.id = oi.product_id
    JOIN orders o ON oi.order_id = o.id
    LEFT JOIN LATERAL (
      SELECT url FROM product_images
      WHERE product_id = p.id
      ORDER BY id
      LIMIT 1
    ) pi ON true
    WHERE o.status IN ('paid', 'shipped', 'completed')
    GROUP BY p.id, p.title, pi.url
    ORDER BY order_count DESC
    LIMIT 10
  `);

  // Overall cart statistics
  const overallCartStats = await pool.query(`
    SELECT
      AVG(o.total_price) as avg_order_price,
      AVG(item_counts.item_count) as avg_items_per_order,
      AVG(item_counts.total_quantity) as avg_quantity_per_order
    FROM orders o
    JOIN (
      SELECT
        order_id,
        COUNT(*) as item_count,
        SUM(quantity) as total_quantity
      FROM order_items
      GROUP BY order_id
    ) item_counts ON o.id = item_counts.order_id
    WHERE o.status IN ('paid', 'shipped', 'completed')
  `);

  // Cancellation rate by status
  const cancellationStats = await pool.query(`
    SELECT
      status,
      COUNT(*) as count,
      ROUND(COUNT(*)::numeric / (SELECT COUNT(*) FROM orders) * 100, 2) as percentage
    FROM orders
    GROUP BY status
    ORDER BY count DESC
  `);

  // Most popular options across all products
  const popularOptions = await pool.query(`
    SELECT
      oi.property as option_name,
      COUNT(DISTINCT oi.order_id) as order_count,
      SUM(oi.quantity) as total_quantity
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    WHERE o.status IN ('paid', 'shipped', 'completed')
      AND oi.property IS NOT NULL
    GROUP BY oi.property
    ORDER BY order_count DESC
    LIMIT 15
  `);

  return {
    top_products: topProductsResult.rows,
    avg_order_price: parseFloat(overallCartStats.rows[0]?.avg_order_price || 0),
    avg_items_per_order: parseFloat(overallCartStats.rows[0]?.avg_items_per_order || 0),
    avg_quantity_per_order: parseFloat(overallCartStats.rows[0]?.avg_quantity_per_order || 0),
    order_status_distribution: cancellationStats.rows,
    popular_options: popularOptions.rows
  };
}

/**
 * Main handler
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return methodNotAllowed(res, ['GET']);
  }

  try {
    const { product_id } = req.query;

    if (product_id) {
      // Get statistics for specific product
      const productId = parseInt(product_id);

      if (isNaN(productId)) {
        return badRequest(res, 'Invalid product_id');
      }

      // Get product info
      const productResult = await pool.query(
        `SELECT
          p.id,
          p.title,
          pi.url as image
        FROM products p
        LEFT JOIN LATERAL (
          SELECT url FROM product_images
          WHERE product_id = p.id
          ORDER BY id
          LIMIT 1
        ) pi ON true
        WHERE p.id = $1`,
        [productId]
      );

      if (productResult.rows.length === 0) {
        return notFound(res, 'Product not found');
      }

      const product = productResult.rows[0];
      const stats = await calculateProductStats(productId);

      return success(res, {
        product: product,
        statistics: stats
      });
    } else {
      // Get overall statistics
      const stats = await getOverallStats();

      return success(res, { statistics: stats });
    }
  } catch (err) {
    console.error('Error fetching product statistics:', err);
    return error(res, 'Failed to fetch statistics', 500);
  }
};

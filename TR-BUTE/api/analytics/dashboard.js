/**
 * Dashboard Analytics API
 * Provides comprehensive analytics for the admin dashboard
 * GET /api/analytics/dashboard
 *
 * Query parameters:
 *   period: 'today' | 'week' | 'month' | 'year' | 'all' (default: 'month')
 *   metrics: comma-separated list of metric groups to include (default: all)
 *            'revenue', 'orders', 'shipping', 'products', 'customers', 'time', 'inline'
 *
 * Inline metrics include:
 *   - Total searches via @buy_tribute_bot inline mode
 *   - Top searched queries
 *   - Missing queries (searches with no results)
 *   - Most selected products
 *   - Conversion rate (searches → selections)
 */

const { getPool } = require('../../lib/db');
const { success, error, methodNotAllowed } = require('../../server/utils/response-helpers');
const pool = getPool();

/**
 * Get date range for period
 */
function getDateRange(period) {
  const now = new Date();
  let startDate;

  switch (period) {
    case 'today':
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case 'week':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case 'month':
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
      break;
    case 'year':
      startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
      break;
    case 'all':
    default:
      startDate = null;
  }

  return { startDate, endDate: now };
}

/**
 * Revenue Analytics
 */
async function getRevenueAnalytics(startDate, endDate) {
  const dateFilter = startDate
    ? `AND o.created_at >= $1 AND o.created_at <= $2`
    : '';
  const params = startDate ? [startDate, endDate] : [];

  // Total revenue
  const revenueResult = await pool.query(`
    SELECT
      COALESCE(SUM(total_price), 0) as total_revenue,
      COALESCE(SUM(delivery_cost), 0) as total_shipping_revenue,
      COALESCE(SUM(total_price - delivery_cost), 0) as product_revenue,
      COUNT(*) as paid_orders
    FROM orders o
    WHERE status IN ('paid', 'shipped', 'delivered', 'in_work', 'parcel_pending', 'parcel_ready')
    ${dateFilter}
  `, params);

  // Refunded amount
  const refundResult = await pool.query(`
    SELECT
      COALESCE(SUM(total_price), 0) as refunded_amount,
      COUNT(*) as refund_count
    FROM orders o
    WHERE status = 'refunded'
    ${dateFilter}
  `, params);

  // Revenue by day (last 30 days or period)
  const dailyRevenueResult = await pool.query(`
    SELECT
      DATE(created_at) as date,
      SUM(total_price) as revenue,
      COUNT(*) as orders
    FROM orders
    WHERE status IN ('paid', 'shipped', 'delivered', 'in_work', 'parcel_pending', 'parcel_ready')
      ${startDate ? `AND created_at >= $1 AND created_at <= $2` : 'AND created_at >= NOW() - INTERVAL \'30 days\''}
    GROUP BY DATE(created_at)
    ORDER BY date DESC
    LIMIT 30
  `, startDate ? [startDate, endDate] : []);

  // Average order value comparison
  // Calculate previous period dates in JavaScript to avoid SQL type issues
  let previousPeriodStart, previousPeriodEnd;
  if (startDate) {
    const periodMs = endDate.getTime() - startDate.getTime();
    previousPeriodEnd = new Date(startDate.getTime());
    previousPeriodStart = new Date(startDate.getTime() - periodMs);
  }

  const avgOrderResult = await pool.query(`
    SELECT
      AVG(total_price) as current_avg,
      (
        SELECT AVG(total_price)
        FROM orders
        WHERE status IN ('paid', 'shipped', 'delivered', 'in_work')
          ${startDate ? `AND created_at >= $3 AND created_at < $4` : 'AND created_at >= NOW() - INTERVAL \'60 days\' AND created_at < NOW() - INTERVAL \'30 days\''}
      ) as previous_avg
    FROM orders o
    WHERE status IN ('paid', 'shipped', 'delivered', 'in_work')
    ${dateFilter}
  `, startDate ? [startDate, endDate, previousPeriodStart, previousPeriodEnd] : []);

  const current = parseFloat(revenueResult.rows[0].total_revenue) || 0;
  const refunded = parseFloat(refundResult.rows[0].refunded_amount) || 0;
  const avgCurrent = parseFloat(avgOrderResult.rows[0].current_avg) || 0;
  const avgPrevious = parseFloat(avgOrderResult.rows[0].previous_avg) || avgCurrent;

  return {
    total_revenue: current,
    net_revenue: current - refunded,
    product_revenue: parseFloat(revenueResult.rows[0].product_revenue) || 0,
    shipping_revenue: parseFloat(revenueResult.rows[0].total_shipping_revenue) || 0,
    refunded_amount: refunded,
    refund_count: parseInt(refundResult.rows[0].refund_count) || 0,
    refund_rate: revenueResult.rows[0].paid_orders > 0
      ? ((refundResult.rows[0].refund_count / revenueResult.rows[0].paid_orders) * 100).toFixed(1)
      : 0,
    avg_order_value: avgCurrent,
    avg_order_change: avgPrevious > 0
      ? (((avgCurrent - avgPrevious) / avgPrevious) * 100).toFixed(1)
      : 0,
    daily_revenue: dailyRevenueResult.rows.reverse()
  };
}

/**
 * Order Analytics
 */
async function getOrderAnalytics(startDate, endDate) {
  const dateFilter = startDate
    ? `AND created_at >= $1 AND created_at <= $2`
    : '';
  const params = startDate ? [startDate, endDate] : [];

  // Order counts by status
  const statusResult = await pool.query(`
    SELECT
      status,
      COUNT(*) as count
    FROM orders o
    WHERE 1=1 ${dateFilter}
    GROUP BY status
    ORDER BY count DESC
  `, params);

  // Order funnel
  const funnelResult = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE status != 'suggested') as total_orders,
      COUNT(*) FILTER (WHERE status IN ('accepted', 'paid', 'shipped', 'delivered', 'in_work', 'parcel_pending', 'parcel_ready')) as confirmed_orders,
      COUNT(*) FILTER (WHERE status IN ('paid', 'shipped', 'delivered', 'in_work', 'parcel_pending', 'parcel_ready')) as paid_orders,
      COUNT(*) FILTER (WHERE status IN ('shipped', 'delivered')) as shipped_orders,
      COUNT(*) FILTER (WHERE status = 'delivered') as delivered_orders,
      COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_orders
    FROM orders o
    WHERE 1=1 ${dateFilter}
  `, params);

  const funnel = funnelResult.rows[0];
  const total = parseInt(funnel.total_orders) || 0;

  // Calculate conversion rates
  const conversionRates = {
    confirmation_rate: total > 0 ? ((funnel.confirmed_orders / total) * 100).toFixed(1) : 0,
    payment_rate: funnel.confirmed_orders > 0 ? ((funnel.paid_orders / funnel.confirmed_orders) * 100).toFixed(1) : 0,
    shipping_rate: funnel.paid_orders > 0 ? ((funnel.shipped_orders / funnel.paid_orders) * 100).toFixed(1) : 0,
    delivery_rate: funnel.shipped_orders > 0 ? ((funnel.delivered_orders / funnel.shipped_orders) * 100).toFixed(1) : 0,
    completion_rate: total > 0 ? ((funnel.delivered_orders / total) * 100).toFixed(1) : 0,
    cancellation_rate: total > 0 ? ((funnel.cancelled_orders / total) * 100).toFixed(1) : 0
  };

  // Average items per order
  const itemsResult = await pool.query(`
    SELECT
      AVG(item_count) as avg_items,
      AVG(total_quantity) as avg_quantity
    FROM (
      SELECT
        order_id,
        COUNT(*) as item_count,
        SUM(quantity) as total_quantity
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE o.status IN ('paid', 'shipped', 'delivered', 'in_work')
      ${dateFilter.replaceAll('created_at', 'o.created_at')}
      GROUP BY order_id
    ) as order_counts
  `, params);

  // Orders by day of week
  const dayOfWeekResult = await pool.query(`
    SELECT
      EXTRACT(DOW FROM created_at) as day_of_week,
      COUNT(*) as count
    FROM orders
    WHERE status NOT IN ('suggested', 'cancelled')
      ${dateFilter}
    GROUP BY day_of_week
    ORDER BY day_of_week
  `, params);

  const dayNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const ordersByDay = dayOfWeekResult.rows.map(row => ({
    day: dayNames[parseInt(row.day_of_week)],
    count: parseInt(row.count)
  }));

  return {
    status_distribution: statusResult.rows.map(row => ({
      status: row.status,
      count: parseInt(row.count)
    })),
    funnel: {
      total: parseInt(funnel.total_orders) || 0,
      confirmed: parseInt(funnel.confirmed_orders) || 0,
      paid: parseInt(funnel.paid_orders) || 0,
      shipped: parseInt(funnel.shipped_orders) || 0,
      delivered: parseInt(funnel.delivered_orders) || 0,
      cancelled: parseInt(funnel.cancelled_orders) || 0
    },
    conversion_rates: conversionRates,
    avg_items_per_order: parseFloat(itemsResult.rows[0]?.avg_items) || 0,
    avg_quantity_per_order: parseFloat(itemsResult.rows[0]?.avg_quantity) || 0,
    orders_by_day_of_week: ordersByDay
  };
}

/**
 * Shipping Analytics
 */
async function getShippingAnalytics(startDate, endDate) {
  const dateFilter = startDate
    ? `AND o.created_at >= $1 AND o.created_at <= $2`
    : '';
  const params = startDate ? [startDate, endDate] : [];

  // Orders by delivery type
  const deliveryTypeResult = await pool.query(`
    SELECT
      delivery_type,
      COUNT(*) as count,
      AVG(delivery_cost) as avg_cost
    FROM orders o
    WHERE status IN ('paid', 'shipped', 'delivered', 'in_work', 'parcel_pending', 'parcel_ready')
      AND delivery_type IS NOT NULL
      ${dateFilter}
    GROUP BY delivery_type
    ORDER BY count DESC
  `, params);

  // Average delivery time
  // Note: Using processed_at as approximation for payment time since paid_at doesn't exist
  const deliveryTimeResult = await pool.query(`
    SELECT
      AVG(EXTRACT(EPOCH FROM (delivered_at - created_at)) / 86400) as avg_days_to_delivery,
      AVG(EXTRACT(EPOCH FROM (delivered_at - COALESCE(processed_at, created_at))) / 86400) as avg_days_after_payment
    FROM orders o
    WHERE status = 'delivered'
      AND delivered_at IS NOT NULL
      ${dateFilter}
  `, params);

  // Parcels by status (if table exists)
  let parcelStats = { pending: 0, shipped: 0, delivered: 0 };
  try {
    const parcelResult = await pool.query(`
      SELECT
        op.status,
        COUNT(*) as count
      FROM order_parcels op
      JOIN orders o ON op.order_id = o.id
      WHERE 1=1 ${dateFilter.replaceAll('o.created_at', 'op.created_at')}
      GROUP BY op.status
    `, params);

    parcelStats = parcelResult.rows.reduce((acc, row) => {
      acc[row.status] = parseInt(row.count);
      return acc;
    }, parcelStats);
  } catch (e) {
    // Table might not exist yet
  }

  // User confirmed delivery rate
  const userConfirmResult = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE user_confirmed_delivery = true) as user_confirmed,
      COUNT(*) as total_delivered
    FROM orders o
    WHERE status = 'delivered'
      ${dateFilter}
  `, params);

  const deliveryTypes = {
    'pochta': 'Почта России',
    'pochta_standard': 'До отделения',
    'pochta_courier': 'Курьер',
    'pochta_first_class': 'До отделения - 1 класс',
    'cdek_pvz': 'CDEK ПВЗ',
    'cdek_pvz_express': 'CDEK ПВЗ Экспресс',
    'cdek_courier': 'CDEK Курьер',
    'courier_ems': 'EMS',
    'international': 'Международная',
    'pickup': 'Самовывоз'
  };

  return {
    by_delivery_type: deliveryTypeResult.rows.map(row => ({
      type: row.delivery_type,
      display_name: deliveryTypes[row.delivery_type] || row.delivery_type,
      count: parseInt(row.count),
      avg_cost: parseFloat(row.avg_cost) || 0
    })),
    avg_days_to_delivery: parseFloat(deliveryTimeResult.rows[0]?.avg_days_to_delivery) || 0,
    avg_days_after_payment: parseFloat(deliveryTimeResult.rows[0]?.avg_days_after_payment) || 0,
    parcel_status: parcelStats,
    user_confirmation_rate: userConfirmResult.rows[0].total_delivered > 0
      ? ((userConfirmResult.rows[0].user_confirmed / userConfirmResult.rows[0].total_delivered) * 100).toFixed(1)
      : 0
  };
}

/**
 * Product Analytics
 */
async function getProductAnalytics(startDate, endDate) {
  const dateFilter = startDate
    ? `AND o.created_at >= $1 AND o.created_at <= $2`
    : '';
  const params = startDate ? [startDate, endDate] : [];

  // Top products by revenue
  const topRevenueResult = await pool.query(`
    SELECT
      p.id,
      p.title,
      pi.url as image,
      SUM(oi.price_at_purchase * oi.quantity) as revenue,
      SUM(oi.quantity) as quantity,
      COUNT(DISTINCT oi.order_id) as orders
    FROM products p
    JOIN order_items oi ON p.id = oi.product_id
    JOIN orders o ON oi.order_id = o.id
    LEFT JOIN LATERAL (
      SELECT url FROM product_images WHERE product_id = p.id ORDER BY id LIMIT 1
    ) pi ON true
    WHERE o.status IN ('paid', 'shipped', 'delivered', 'in_work')
      ${dateFilter}
    GROUP BY p.id, p.title, pi.url
    ORDER BY revenue DESC
    LIMIT 10
  `, params);

  // Most popular options/formats
  const optionsResult = await pool.query(`
    SELECT
      oi.property as option,
      COUNT(*) as count,
      SUM(oi.quantity) as quantity,
      SUM(oi.price_at_purchase * oi.quantity) as revenue
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    WHERE o.status IN ('paid', 'shipped', 'delivered', 'in_work')
      AND oi.property IS NOT NULL
      ${dateFilter}
    GROUP BY oi.property
    ORDER BY count DESC
    LIMIT 10
  `, params);

  // Products by quality
  const qualityResult = await pool.query(`
    SELECT
      COALESCE(quality, 'not_set') as quality,
      COUNT(*) as count
    FROM products
    WHERE status = 'available'
    GROUP BY quality
    ORDER BY count DESC
  `);

  // Product count by status
  const productStatusResult = await pool.query(`
    SELECT
      status,
      COUNT(*) as count
    FROM products
    GROUP BY status
    ORDER BY count DESC
  `);

  return {
    top_by_revenue: topRevenueResult.rows.map(row => ({
      id: row.id,
      title: row.title,
      image: row.image,
      revenue: parseFloat(row.revenue) || 0,
      quantity: parseInt(row.quantity) || 0,
      orders: parseInt(row.orders) || 0
    })),
    popular_options: optionsResult.rows.map(row => ({
      option: row.option,
      count: parseInt(row.count) || 0,
      quantity: parseInt(row.quantity) || 0,
      revenue: parseFloat(row.revenue) || 0
    })),
    by_quality: qualityResult.rows.map(row => ({
      quality: row.quality,
      count: parseInt(row.count)
    })),
    by_status: productStatusResult.rows.map(row => ({
      status: row.status,
      count: parseInt(row.count)
    }))
  };
}

/**
 * Customer Analytics
 */
async function getCustomerAnalytics(startDate, endDate) {
  const dateFilter = startDate
    ? `AND created_at >= $1 AND created_at <= $2`
    : '';
  const params = startDate ? [startDate, endDate] : [];

  // New vs returning customers
  const customerResult = await pool.query(`
    WITH customer_orders AS (
      SELECT
        user_id,
        COUNT(*) as order_count,
        MIN(created_at) as first_order,
        MAX(created_at) as last_order
      FROM orders
      WHERE status IN ('paid', 'shipped', 'delivered', 'in_work', 'parcel_pending', 'parcel_ready')
        AND user_id IS NOT NULL
      GROUP BY user_id
    )
    SELECT
      COUNT(*) FILTER (WHERE order_count = 1) as one_time_customers,
      COUNT(*) FILTER (WHERE order_count > 1) as repeat_customers,
      AVG(order_count) as avg_orders_per_customer
    FROM customer_orders
    ${startDate ? 'WHERE first_order >= $1 AND first_order <= $2' : ''}
  `, params);

  // Customer acquisition over time
  const acquisitionResult = await pool.query(`
    WITH first_orders AS (
      SELECT
        user_id,
        MIN(created_at) as first_order_date
      FROM orders
      WHERE status IN ('paid', 'shipped', 'delivered', 'in_work')
        AND user_id IS NOT NULL
      GROUP BY user_id
    )
    SELECT
      DATE(first_order_date) as date,
      COUNT(*) as new_customers
    FROM first_orders
    ${startDate ? 'WHERE first_order_date >= $1 AND first_order_date <= $2' : 'WHERE first_order_date >= NOW() - INTERVAL \'30 days\''}
    GROUP BY DATE(first_order_date)
    ORDER BY date DESC
    LIMIT 30
  `, params);

  // Customer lifetime value (for repeat customers)
  const cltvResult = await pool.query(`
    WITH customer_totals AS (
      SELECT
        user_id,
        SUM(total_price) as total_spent,
        COUNT(*) as order_count
      FROM orders
      WHERE status IN ('paid', 'shipped', 'delivered', 'in_work')
        AND user_id IS NOT NULL
      GROUP BY user_id
      HAVING COUNT(*) > 1
    )
    SELECT
      AVG(total_spent) as avg_cltv,
      MAX(total_spent) as max_cltv
    FROM customer_totals
  `);

  // Users by login method (all-time, not period-filtered)
  const loginMethodResult = await pool.query(`
    SELECT login_method, COUNT(*) as count
    FROM users
    WHERE is_deleted = false
    GROUP BY login_method
    ORDER BY count DESC
  `);

  // Reviews statistics
  const reviewsResult = await pool.query(`
    SELECT
      COUNT(*) as total_reviews,
      AVG(rating) as avg_rating,
      COUNT(*) FILTER (WHERE verified_purchase = true) as verified_reviews
    FROM user_feedback
    WHERE type = 'review'
      ${dateFilter}
  `, params);

  const oneTime = parseInt(customerResult.rows[0]?.one_time_customers) || 0;
  const repeat = parseInt(customerResult.rows[0]?.repeat_customers) || 0;
  const total = oneTime + repeat;

  return {
    total_customers: total,
    one_time_customers: oneTime,
    repeat_customers: repeat,
    repeat_rate: total > 0 ? ((repeat / total) * 100).toFixed(1) : 0,
    avg_orders_per_customer: parseFloat(customerResult.rows[0]?.avg_orders_per_customer) || 1,
    customer_acquisition: acquisitionResult.rows.reverse(),
    avg_customer_lifetime_value: parseFloat(cltvResult.rows[0]?.avg_cltv) || 0,
    max_customer_lifetime_value: parseFloat(cltvResult.rows[0]?.max_cltv) || 0,
    login_methods: loginMethodResult.rows.map(r => ({
      method: r.login_method,
      count: parseInt(r.count) || 0
    })),
    reviews: {
      total: parseInt(reviewsResult.rows[0]?.total_reviews) || 0,
      avg_rating: parseFloat(reviewsResult.rows[0]?.avg_rating) || 0,
      verified: parseInt(reviewsResult.rows[0]?.verified_reviews) || 0
    }
  };
}

/**
 * Inline Bot Search Analytics
 */
async function getInlineAnalytics(startDate, endDate) {
  const dateFilter = startDate
    ? `AND created_at >= $1 AND created_at <= $2`
    : '';
  const params = startDate ? [startDate, endDate] : [];

  // Overview stats
  const overviewResult = await pool.query(`
    SELECT
      COUNT(*) as total_searches,
      COUNT(DISTINCT user_id) as unique_users,
      AVG(results_count) as avg_results,
      COUNT(*) FILTER (WHERE results_count = 0) as zero_results
    FROM inline_search_log
    WHERE 1=1 ${dateFilter}
  `, params);

  // Feedback stats (selections)
  const feedbackResult = await pool.query(`
    SELECT
      COUNT(*) as total_selections,
      COUNT(DISTINCT user_id) as users_who_selected,
      COUNT(DISTINCT product_id) as unique_products_selected
    FROM inline_search_feedback
    WHERE 1=1 ${dateFilter}
  `, params);

  // Top searched queries
  const topQueriesResult = await pool.query(`
    SELECT
      LOWER(query) as query,
      COUNT(*) as search_count
    FROM inline_search_log
    WHERE results_count > 0
      ${dateFilter}
    GROUP BY LOWER(query)
    ORDER BY search_count DESC
    LIMIT 15
  `, params);

  // Queries with no results (to identify missing products)
  const noResultsResult = await pool.query(`
    SELECT
      LOWER(query) as query,
      COUNT(*) as search_count
    FROM inline_search_log
    WHERE results_count = 0
      ${dateFilter}
    GROUP BY LOWER(query)
    ORDER BY search_count DESC
    LIMIT 10
  `, params);

  // Most selected products via inline search
  const topProductsResult = await pool.query(`
    SELECT
      f.product_id,
      p.title,
      pi.url as image,
      COUNT(*) as selection_count
    FROM inline_search_feedback f
    JOIN products p ON f.product_id = p.id
    LEFT JOIN LATERAL (
      SELECT url FROM product_images WHERE product_id = p.id ORDER BY sort_order LIMIT 1
    ) pi ON true
    WHERE f.product_id IS NOT NULL
      ${dateFilter.replace(/created_at/g, 'f.created_at')}
    GROUP BY f.product_id, p.title, pi.url
    ORDER BY selection_count DESC
    LIMIT 10
  `, params);

  // Daily activity
  const dailyResult = await pool.query(`
    SELECT
      DATE(created_at) as date,
      COUNT(*) as searches,
      COUNT(DISTINCT user_id) as unique_users
    FROM inline_search_log
    WHERE 1=1
      ${startDate ? dateFilter : 'AND created_at >= NOW() - INTERVAL \'30 days\''}
    GROUP BY DATE(created_at)
    ORDER BY date DESC
    LIMIT 30
  `, params);

  const overview = overviewResult.rows[0] || {};
  const feedback = feedbackResult.rows[0] || {};

  // Calculate conversion rate (searches that led to selection)
  const totalSearches = parseInt(overview.total_searches) || 0;
  const totalSelections = parseInt(feedback.total_selections) || 0;
  const conversionRate = totalSearches > 0
    ? ((totalSelections / totalSearches) * 100).toFixed(1)
    : 0;

  return {
    overview: {
      total_searches: totalSearches,
      unique_users: parseInt(overview.unique_users) || 0,
      avg_results_per_search: parseFloat(overview.avg_results) || 0,
      zero_result_searches: parseInt(overview.zero_results) || 0,
      zero_result_rate: totalSearches > 0
        ? ((parseInt(overview.zero_results) / totalSearches) * 100).toFixed(1)
        : 0
    },
    selections: {
      total_selections: totalSelections,
      users_who_selected: parseInt(feedback.users_who_selected) || 0,
      unique_products: parseInt(feedback.unique_products_selected) || 0,
      conversion_rate: parseFloat(conversionRate)
    },
    top_queries: topQueriesResult.rows.map(row => ({
      query: row.query,
      count: parseInt(row.search_count)
    })),
    missing_queries: noResultsResult.rows.map(row => ({
      query: row.query,
      count: parseInt(row.search_count)
    })),
    top_selected_products: topProductsResult.rows.map(row => ({
      id: row.product_id,
      title: row.title,
      image: row.image,
      selections: parseInt(row.selection_count)
    })),
    daily_activity: dailyResult.rows.reverse()
  };
}

/**
 * Time-based Analytics
 */
async function getTimeAnalytics(startDate, endDate) {
  const dateFilter = startDate
    ? `AND created_at >= $1 AND created_at <= $2`
    : '';
  const params = startDate ? [startDate, endDate] : [];

  // Orders by hour of day
  const hourlyResult = await pool.query(`
    SELECT
      EXTRACT(HOUR FROM created_at) as hour,
      COUNT(*) as count
    FROM orders
    WHERE status NOT IN ('suggested', 'cancelled')
      ${dateFilter}
    GROUP BY hour
    ORDER BY hour
  `, params);

  // Weekly trend (current vs previous)
  const weeklyTrendResult = await pool.query(`
    SELECT
      CASE
        WHEN created_at >= NOW() - INTERVAL '7 days' THEN 'current'
        ELSE 'previous'
      END as period,
      COUNT(*) as orders,
      SUM(total_price) as revenue
    FROM orders
    WHERE status IN ('paid', 'shipped', 'delivered', 'in_work')
      AND created_at >= NOW() - INTERVAL '14 days'
    GROUP BY period
  `);

  // Monthly comparison
  const monthlyResult = await pool.query(`
    SELECT
      DATE_TRUNC('month', created_at) as month,
      COUNT(*) as orders,
      SUM(total_price) as revenue
    FROM orders
    WHERE status IN ('paid', 'shipped', 'delivered', 'in_work')
      AND created_at >= NOW() - INTERVAL '12 months'
    GROUP BY month
    ORDER BY month DESC
    LIMIT 12
  `);

  const currentWeek = weeklyTrendResult.rows.find(r => r.period === 'current') || { orders: 0, revenue: 0 };
  const previousWeek = weeklyTrendResult.rows.find(r => r.period === 'previous') || { orders: 0, revenue: 0 };

  const orderGrowth = previousWeek.orders > 0
    ? ((currentWeek.orders - previousWeek.orders) / previousWeek.orders * 100).toFixed(1)
    : 0;
  const revenueGrowth = previousWeek.revenue > 0
    ? ((currentWeek.revenue - previousWeek.revenue) / previousWeek.revenue * 100).toFixed(1)
    : 0;

  return {
    orders_by_hour: hourlyResult.rows.map(row => ({
      hour: parseInt(row.hour),
      count: parseInt(row.count)
    })),
    peak_hours: hourlyResult.rows
      .sort((a, b) => parseInt(b.count) - parseInt(a.count))
      .slice(0, 3)
      .map(row => ({
        hour: parseInt(row.hour),
        count: parseInt(row.count)
      })),
    weekly_comparison: {
      current: {
        orders: parseInt(currentWeek.orders) || 0,
        revenue: parseFloat(currentWeek.revenue) || 0
      },
      previous: {
        orders: parseInt(previousWeek.orders) || 0,
        revenue: parseFloat(previousWeek.revenue) || 0
      },
      order_growth: parseFloat(orderGrowth),
      revenue_growth: parseFloat(revenueGrowth)
    },
    monthly_trend: monthlyResult.rows.reverse().map(row => ({
      month: row.month,
      orders: parseInt(row.orders) || 0,
      revenue: parseFloat(row.revenue) || 0
    }))
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
    const { period = 'month', metrics } = req.query;
    const { startDate, endDate } = getDateRange(period);

    // Parse requested metrics
    const requestedMetrics = metrics
      ? metrics.split(',').map(m => m.trim().toLowerCase())
      : ['revenue', 'orders', 'shipping', 'products', 'customers', 'time', 'inline'];

    const result = {
      period: period,
      date_range: {
        start: startDate ? startDate.toISOString() : null,
        end: endDate.toISOString()
      },
      generated_at: new Date().toISOString()
    };

    // Fetch requested metrics in parallel
    const metricPromises = [];

    if (requestedMetrics.includes('revenue')) {
      metricPromises.push(
        getRevenueAnalytics(startDate, endDate).then(data => ({ revenue: data }))
      );
    }

    if (requestedMetrics.includes('orders')) {
      metricPromises.push(
        getOrderAnalytics(startDate, endDate).then(data => ({ orders: data }))
      );
    }

    if (requestedMetrics.includes('shipping')) {
      metricPromises.push(
        getShippingAnalytics(startDate, endDate).then(data => ({ shipping: data }))
      );
    }

    if (requestedMetrics.includes('products')) {
      metricPromises.push(
        getProductAnalytics(startDate, endDate).then(data => ({ products: data }))
      );
    }

    if (requestedMetrics.includes('customers')) {
      metricPromises.push(
        getCustomerAnalytics(startDate, endDate).then(data => ({ customers: data }))
      );
    }

    if (requestedMetrics.includes('time')) {
      metricPromises.push(
        getTimeAnalytics(startDate, endDate).then(data => ({ time: data }))
      );
    }

    if (requestedMetrics.includes('inline')) {
      metricPromises.push(
        getInlineAnalytics(startDate, endDate).then(data => ({ inline: data })).catch(err => {
          // Tables might not exist yet, return empty data
          console.warn('Inline analytics tables not found:', err.message);
          return { inline: null };
        })
      );
    }

    const metricsData = await Promise.all(metricPromises);

    // Merge all metrics into result
    metricsData.forEach(metric => {
      Object.assign(result, metric);
    });

    return success(res, result);
  } catch (err) {
    console.error('Error fetching dashboard analytics:', err);
    return error(res, 'Failed to fetch analytics: ' + err.message, 500);
  }
};

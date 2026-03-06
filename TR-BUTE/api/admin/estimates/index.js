/**
 * Delivery Estimates Management API (Admin)
 * List and delete delivery estimates
 * GET/DELETE /api/admin/estimates
 *
 * Note: Admin auth is handled by middleware in routes
 */

const { getPool } = require('../../../lib/db');
const { success, error, badRequest, methodNotAllowed } = require('../../../server/utils/response-helpers');

const pool = getPool();

/**
 * Tariff code to human-readable name mapping
 */
const TARIFF_NAMES = {
  // CDEK tariffs
  '136': 'СДЭК Посылка склад-склад',
  '137': 'СДЭК Посылка склад-дверь',
  '138': 'СДЭК Посылка дверь-склад',
  '139': 'СДЭК Посылка дверь-дверь',
  '233': 'СДЭК Экспресс дверь-дверь',
  '234': 'СДЭК Экспресс дверь-склад',
  '482': 'СДЭК Экспресс склад-дверь',
  '483': 'СДЭК Экспресс склад-склад',
  // Pochta (ApiShip) service codes
  '23030': 'Почта 1 класс',
  '23020': 'Почта обычная',
  '27030': 'EMS',
  // Delivery type fallback names
  'cdek_pvz': 'СДЭК до ПВЗ',
  'cdek_pvz_express': 'СДЭК до ПВЗ Экспресс',
  'cdek_courier': 'СДЭК курьер',
  'pochta': 'Почта России',
  'pochta_standard': 'Почта до отделения',
  'pochta_courier': 'Почта курьер',
  'pochta_first_class': 'Почта 1 класс',
  'courier_ems': 'EMS курьер',
  'international': 'Международная'
};

/**
 * Get human-readable tariff name from service_code or delivery_type
 */
function getTariffDisplayName(serviceCode, deliveryType) {
  if (serviceCode && TARIFF_NAMES[String(serviceCode)]) {
    return TARIFF_NAMES[String(serviceCode)];
  }
  if (deliveryType && TARIFF_NAMES[deliveryType]) {
    return TARIFF_NAMES[deliveryType];
  }
  if (serviceCode) {
    return `Тариф ${serviceCode}`;
  }
  return deliveryType || 'Неизвестный';
}

/**
 * Determine provider from delivery_type
 */
function getProvider(deliveryType) {
  if (!deliveryType) return 'unknown';
  if (deliveryType.startsWith('cdek')) return 'cdek';
  if (deliveryType.startsWith('pochta') || deliveryType === 'courier_ems' || deliveryType === 'international') return 'pochta';
  return 'other';
}

/**
 * Build city display string from city and region
 */
function getCityDisplay(city, region) {
  if (city && region && region !== city) {
    return `${city}, ${region}`;
  }
  return city || region || null;
}

/**
 * Main handler
 */
module.exports = async function handler(req, res) {
  switch (req.method) {
    case 'GET':
      return handleGet(req, res);
    case 'DELETE':
      return handleDelete(req, res);
    default:
      return methodNotAllowed(res, ['GET', 'DELETE']);
  }
};

/**
 * GET - List estimates with filtering and pagination
 */
async function handleGet(req, res) {
  try {
    const {
      page = 1,
      limit = 50,
      source,
      delivery_type,
      provider,
      postal_prefix,
      search,
      sort = 'created_at',
      order = 'desc'
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [];
    const conditions = [];
    let paramIndex = 1;

    // Build WHERE conditions
    if (source) {
      conditions.push(`de.source = $${paramIndex++}`);
      params.push(source);
    }

    if (delivery_type) {
      conditions.push(`de.delivery_type = $${paramIndex++}`);
      params.push(delivery_type);
    }

    // Provider filter: cdek or pochta
    if (provider === 'cdek') {
      conditions.push(`de.delivery_type LIKE 'cdek%'`);
    } else if (provider === 'pochta') {
      conditions.push(`(de.delivery_type LIKE 'pochta%' OR de.delivery_type = 'courier_ems' OR de.delivery_type = 'international')`);
    }

    if (postal_prefix) {
      conditions.push(`de.postal_prefix = $${paramIndex++}`);
      params.push(postal_prefix);
    }

    if (search) {
      conditions.push(`(de.postal_code ILIKE $${paramIndex} OR de.city ILIKE $${paramIndex} OR de.region ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Validate sort column
    const validSorts = ['created_at', 'total_price', 'weight_grams', 'postal_code', 'city'];
    const sortColumn = validSorts.includes(sort) ? sort : 'created_at';
    const sortOrder = order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    // Count total
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM delivery_estimates de ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    // Get estimates
    params.push(parseInt(limit), offset);

    const query = `
      SELECT
        de.*,
        o.id as linked_order_id,
        o.status as order_status
      FROM delivery_estimates de
      LEFT JOIN orders o ON de.order_id = o.id
      ${whereClause}
      ORDER BY de.${sortColumn} ${sortOrder}
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `;

    const result = await pool.query(query, params);

    // Enrich estimates with tariff names, provider, and city display
    const estimates = result.rows.map(est => ({
      ...est,
      tariff_name: getTariffDisplayName(est.service_code, est.delivery_type),
      provider: getProvider(est.delivery_type),
      city_display: getCityDisplay(est.city, est.region),
      delivery_time: est.estimated_days_min && est.estimated_days_max
        ? (est.estimated_days_min === est.estimated_days_max
          ? `${est.estimated_days_min} дн.`
          : `${est.estimated_days_min}-${est.estimated_days_max} дн.`)
        : null
    }));

    // Get summary statistics
    const statsResult = await pool.query(`
      SELECT
        COUNT(*) as total_estimates,
        COUNT(CASE WHEN source = 'api' THEN 1 END) as api_estimates,
        COUNT(CASE WHEN source = 'manual' THEN 1 END) as manual_estimates,
        ROUND(AVG(total_price)) as avg_price,
        COUNT(DISTINCT postal_prefix) as unique_regions,
        COUNT(DISTINCT COALESCE(city, postal_prefix)) as unique_cities
      FROM delivery_estimates
    `);

    // Get per-city averages (top cities by number of estimates)
    const cityAvgResult = await pool.query(`
      SELECT
        COALESCE(city, postal_prefix) as city_key,
        city,
        region,
        COUNT(*) as estimate_count,
        ROUND(AVG(total_price)) as avg_price,
        ROUND(AVG(estimated_days_min)) as avg_days_min,
        ROUND(AVG(estimated_days_max)) as avg_days_max
      FROM delivery_estimates
      WHERE city IS NOT NULL OR postal_prefix IS NOT NULL
      GROUP BY COALESCE(city, postal_prefix), city, region
      ORDER BY COUNT(*) DESC
      LIMIT 100
    `);

    const cityAverages = cityAvgResult.rows.map(row => ({
      city_key: row.city_key,
      city_display: getCityDisplay(row.city, row.region) || row.city_key,
      estimate_count: parseInt(row.estimate_count),
      avg_price: parseInt(row.avg_price),
      avg_days_min: row.avg_days_min ? parseInt(row.avg_days_min) : null,
      avg_days_max: row.avg_days_max ? parseInt(row.avg_days_max) : null
    }));

    return success(res, {
      estimates,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      },
      stats: statsResult.rows[0],
      cityAverages
    });
  } catch (err) {
    console.error('Error fetching delivery estimates:', err);
    return error(res, 'Failed to fetch estimates', 500);
  }
}

/**
 * DELETE - Delete an estimate by ID
 */
async function handleDelete(req, res) {
  try {
    const { id } = req.query;

    if (!id) {
      return badRequest(res, 'id is required');
    }

    const result = await pool.query(`
      DELETE FROM delivery_estimates
      WHERE id = $1
      RETURNING id
    `, [id]);

    if (result.rows.length === 0) {
      return badRequest(res, 'Estimate not found');
    }

    console.log(`[Estimates] Deleted estimate #${id}`);

    return success(res, { deleted: true, id: parseInt(id) });
  } catch (err) {
    console.error('Error deleting delivery estimate:', err);
    return error(res, 'Failed to delete estimate', 500);
  }
}

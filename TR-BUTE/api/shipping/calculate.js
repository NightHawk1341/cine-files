/**
 * API: Calculate Shipping Options
 *
 * POST /api/shipping/calculate
 *
 * Calculates shipping costs and delivery times for all available providers.
 * Returns parcel breakdown, packaging costs, and shipping options sorted by price.
 */

const { getPool } = require('../../lib/db');
const shippingService = require('../../server/services/shipping');

const pool = getPool();

/**
 * Save delivery estimates to database for future suggestions
 * @param {object} params - Estimate parameters
 * @param {string} params.postalCode - Destination postal code
 * @param {string} params.city - Destination city name
 * @param {string} params.region - Destination region
 * @param {number} params.weightGrams - Total weight in grams
 * @param {number} params.packagingCost - Packaging cost
 * @param {Array} params.options - Calculated shipping options
 * @param {object} dbPool - Database pool
 */
async function saveDeliveryEstimates(params, dbPool) {
  const { postalCode, city, region, weightGrams, packagingCost, options } = params;

  if (!options || options.length === 0) return;

  const postalPrefix = postalCode.substring(0, 3);

  const insertQuery = `
    INSERT INTO delivery_estimates (
      postal_code, postal_prefix, city, region,
      weight_grams, delivery_type, service_code,
      provider_price, packaging_cost, total_price, source,
      estimated_days_min, estimated_days_max
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
  `;

  for (const opt of options) {
    try {
      await dbPool.query(insertQuery, [
        postalCode,
        postalPrefix,
        city || null,
        region || null,
        weightGrams,
        opt.provider,
        opt.code,
        opt.price,
        packagingCost,
        opt.totalPrice,
        'api',
        opt.minDays,
        opt.maxDays
      ]);
    } catch (err) {
      console.error(`Failed to save estimate for ${opt.provider}:`, err.message);
    }
  }
}

module.exports = async function handler(req, res) {
  // CORS handled by global middleware in server.js

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      toPostalCode,
      toCity,
      toAddress,     // Full address string for geocoding fallback
      orderItems,
      providers,
      deliveryType,  // 'pvz' | 'courier' - optional filter
      express        // boolean - request express/first-class delivery
    } = req.body;

    // Validate required fields
    if (!orderItems || !Array.isArray(orderItems) || orderItems.length === 0) {
      return res.status(400).json({
        error: 'Missing or invalid orderItems array'
      });
    }

    // Validate postal code based on provider requirements
    // CDEK can work with just address (uses geocoding), so postal code is optional for CDEK
    // Pochta requires valid 6-digit postal code
    const hasValidPostalCode = toPostalCode && /^\d{6}$/.test(toPostalCode);
    const isCdekOnly = providers && providers.length === 1 && providers[0] === 'cdek';
    const hasAddress = toAddress && toAddress.length > 10;

    // If no postal code provided at all
    if (!toPostalCode || toPostalCode.trim() === '') {
      // CDEK can work with just address
      if (isCdekOnly && hasAddress) {
        // Allow - CDEK will geocode from address
      } else {
        // Require postal code for Pochta or mixed providers
        return res.status(400).json({
          error: 'Missing required field: toPostalCode (required for Pochta Russia)'
        });
      }
    }
    // If postal code provided but invalid format
    else if (!hasValidPostalCode) {
      // CDEK can still work with address even if postal code format is invalid
      if (isCdekOnly && hasAddress) {
        console.log('[Shipping] Invalid postal code format but CDEK can use address for geocoding');
      } else if (providers && providers.includes('pochta')) {
        return res.status(400).json({
          error: 'Invalid postal code format. Pochta Russia requires a valid 6-digit postal code.'
        });
      } else {
        return res.status(400).json({
          error: 'Invalid postal code format. Must be 6 digits.'
        });
      }
    }

    // Fetch app settings (delivery methods and rounding)
    const settingsResult = await pool.query(
      "SELECT key, value FROM app_settings WHERE key IN ('delivery_methods', 'delivery_rounding')"
    );

    const settingsMap = {};
    settingsResult.rows.forEach(row => {
      settingsMap[row.key] = row.value;
    });

    const deliverySettings = settingsMap.delivery_methods || {};
    const roundingSettings = settingsMap.delivery_rounding || {};

    // Fetch next shipment date (supports period with start and end dates)
    // Handle gracefully if next_shipment_date_end column doesn't exist yet
    let nextShipmentDate = null;
    let nextShipmentDateEnd = null;

    try {
      const shipmentResult = await pool.query(
        "SELECT next_shipment_date, next_shipment_date_end FROM shipment_settings ORDER BY id DESC LIMIT 1"
      );
      nextShipmentDate = shipmentResult.rows[0]?.next_shipment_date || null;
      nextShipmentDateEnd = shipmentResult.rows[0]?.next_shipment_date_end || null;
    } catch (err) {
      // Column might not exist yet - fallback to just next_shipment_date
      if (err.message && err.message.includes('next_shipment_date_end')) {
        console.log('[Shipping] next_shipment_date_end column not found, using fallback query');
        const shipmentResult = await pool.query(
          "SELECT next_shipment_date FROM shipment_settings ORDER BY id DESC LIMIT 1"
        );
        nextShipmentDate = shipmentResult.rows[0]?.next_shipment_date || null;
      } else {
        throw err; // Re-throw if it's a different error
      }
    }

    // Calculate order total for ratio-based rounding
    const orderTotal = orderItems.reduce((sum, item) => {
      return sum + (item.price || 0) * (item.quantity || 1);
    }, 0);

    // Filter providers based on settings
    // Settings format: { pochta: { enabled: true, manual_mode: false }, cdek: { enabled: true }, ... }
    let enabledProviders = providers || ['pochta', 'cdek'];

    // Check for Pochta manual mode - skip API calculation if enabled
    const pochtaManualMode = deliverySettings.pochta?.manual_mode === true;

    // Check new format (from project management UI)
    if (deliverySettings.pochta?.enabled === false || pochtaManualMode) {
      enabledProviders = enabledProviders.filter(p => p !== 'pochta');
    }
    if (deliverySettings.cdek?.enabled === false) {
      enabledProviders = enabledProviders.filter(p => p !== 'cdek');
    }
    if (deliverySettings.courier_ems?.enabled === false) {
      enabledProviders = enabledProviders.filter(p => p !== 'ems');
    }

    // Legacy format check
    if (deliverySettings.pochta_disabled) {
      enabledProviders = enabledProviders.filter(p => p !== 'pochta');
    }
    if (deliverySettings.cdek_disabled) {
      enabledProviders = enabledProviders.filter(p => p !== 'cdek');
    }

    // If Pochta is in manual mode but enabled, return special flag
    const pochtaNeedsManualCalculation = pochtaManualMode && deliverySettings.pochta?.enabled !== false;

    // Calculate shipping options
    const result = await shippingService.calculateShipping({
      toPostalCode,
      toCity,
      toAddress,  // Full address for geocoding fallback
      orderItems,
      providers: enabledProviders,
      deliveryType,  // Pass delivery type filter
      express        // Pass express flag
    }, pool);

    // Helper to format date in Russian
    const formatDateRussian = (date) => {
      const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
                      'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
      return `${date.getDate()} ${months[date.getMonth()]}`;
    };

    // Helper to add days to date
    const addDays = (date, days) => {
      const result = new Date(date);
      result.setDate(result.getDate() + days);
      return result;
    };

    // Check if Pochta returned 0 price (indicates API issue or test mode)
    // This happens when APIShip can't calculate the tariff properly
    let pochtaReturnedZeroPrice = false;
    let pochtaTracingId = null;
    result.options.forEach(opt => {
      if (opt.provider === 'pochta') {
        pochtaTracingId = opt._tracingId || pochtaTracingId;
        if (opt.price === 0) {
          console.warn('[Shipping] Pochta returned 0 price - likely API issue, test mode, or credential problem');
          console.warn('[Shipping] Check APISHIP_TEST_MODE env var and credentials');
          console.warn('[Shipping] X-Tracing-Id for support:', opt._tracingId);
          pochtaReturnedZeroPrice = true;
        }
      }
    });

    // Filter out Pochta options with 0 price (they're unreliable)
    // This triggers manual mode handling on frontend
    if (pochtaReturnedZeroPrice) {
      result.options = result.options.filter(opt => !(opt.provider === 'pochta' && opt.price === 0));
    }

    // Build formatted options
    let formattedOptions = result.options.map(opt => {
      // Calculate raw total
      const rawTotal = opt.price + result.packagingCost;
      // Apply rounding with order context
      const roundedTotal = shippingService.roundDeliveryCost(rawTotal, {
        orderTotal,
        settings: roundingSettings
      });

      // Calculate estimated delivery dates if shipment date is set
      let estimatedDeliveryDisplay = null;
      let estimatedDeliveryStart = null;
      let estimatedDeliveryEnd = null;

      if (nextShipmentDate && opt.minDays && opt.maxDays) {
        const shipDate = new Date(nextShipmentDate);
        // Calculate delivery date range (shipment + transit time)
        const deliveryStart = addDays(shipDate, opt.minDays);
        const deliveryEnd = addDays(shipDate, opt.maxDays);

        estimatedDeliveryStart = deliveryStart.toISOString().split('T')[0];
        estimatedDeliveryEnd = deliveryEnd.toISOString().split('T')[0];

        // Format as "25-27 января" or "25 января - 2 февраля" if crossing months
        if (deliveryStart.getMonth() === deliveryEnd.getMonth()) {
          estimatedDeliveryDisplay = `${deliveryStart.getDate()}-${deliveryEnd.getDate()} ${formatDateRussian(deliveryEnd).split(' ')[1]}`;
        } else {
          estimatedDeliveryDisplay = `${formatDateRussian(deliveryStart)} - ${formatDateRussian(deliveryEnd)}`;
        }
      }

      return {
        code: opt.code,
        provider: opt.provider,
        name: opt.name,
        description: opt.description,
        deliveryMode: opt.deliveryMode,
        price: opt.price,
        minDays: opt.minDays,
        maxDays: opt.maxDays,
        // Raw total (for reference)
        rawTotalPrice: rawTotal,
        // Rounded total shown to customer
        totalPrice: roundedTotal,
        deliveryTimeDisplay: opt.minDays === opt.maxDays
          ? `${opt.minDays} дн.`
          : `${opt.minDays}-${opt.maxDays} дн.`,
        // Estimated delivery dates
        estimatedDeliveryStart,
        estimatedDeliveryEnd,
        estimatedDeliveryDisplay
      };
    });

    // Note: Delivery type filtering is now done at the service level
    // CDEK and Pochta services return only the relevant tariff based on deliveryType and express

    // Save delivery estimates asynchronously (don't block response)
    saveDeliveryEstimates({
      postalCode: toPostalCode,
      city: toCity || null,
      region: null,
      weightGrams: result.totalWeight,
      packagingCost: result.packagingCost,
      options: formattedOptions
    }, pool).catch(err => {
      console.error('Failed to save delivery estimates:', err);
    });

    // Format response
    res.status(200).json({
      success: true,
      // Flag indicating Pochta needs manual calculation (admin will set price)
      // This is true if: 1) manually enabled in settings, OR 2) API returned 0 price
      pochtaManualMode: pochtaNeedsManualCalculation || pochtaReturnedZeroPrice,
      // Additional flag for debugging/info
      pochtaZeroPriceDetected: pochtaReturnedZeroPrice,
      // APIShip X-Tracing-Id for support debugging (send this to APIShip when reporting issues)
      pochtaTracingId: pochtaTracingId || null,
      data: {
        parcels: result.parcels.map(p => ({
          parcelNumber: p.parcelNumber,
          packagingType: p.packagingType,
          packagingDisplayName: p.packagingDisplayName,
          itemCount: p.items.length,
          items: p.items.map(i => ({
            title: i.title,
            property: i.property
          })),
          weight: p.totalWeightGrams,
          packagingCost: p.packagingCost,
          dimensions: p.dimensions
        })),
        packagingCost: result.packagingCost,
        totalWeight: result.totalWeight,
        options: formattedOptions,
        // Shipment date info (supports period)
        nextShipmentDate: nextShipmentDate ? nextShipmentDate.toISOString().split('T')[0] : null,
        nextShipmentDateEnd: nextShipmentDateEnd ? nextShipmentDateEnd.toISOString().split('T')[0] : null
      }
    });

  } catch (error) {
    console.error('Shipping calculation error:', error);

    // Return graceful error with fallback options
    res.status(500).json({
      success: false,
      error: 'Failed to calculate shipping options',
      message: error.message,
      // Provide manual calculation note for fallback
      fallback: {
        message: 'Стоимость доставки будет рассчитана вручную после оформления заказа',
        estimatedDays: '3-14'
      }
    });
  }
};

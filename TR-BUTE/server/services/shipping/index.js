/**
 * Unified Shipping Service
 *
 * Provides a unified interface for all shipping providers:
 * - CDEK (Direct API v2)
 * - Pochta Russia (via ApiShip)
 *
 * Also handles parcel calculation and packaging logic.
 */

const cdekService = require('./cdek');
const apishipService = require('./apiship');
const parcelCalculator = require('./parcel-calculator');

/**
 * Default rounding settings
 */
const DEFAULT_ROUNDING_SETTINGS = {
  small_order_threshold: 1500,
  small_order_step: 50,
  big_order_step: 50,
  // For small orders with high delivery ratio
  high_ratio_threshold: 0.5,
  high_ratio_step: 100,
  // For very high ratio (e.g., delivery > 70% of order), even more aggressive
  very_high_ratio_threshold: 0.7,
  very_high_ratio_step: 200
};

/**
 * Round delivery cost to nice numbers (customer-friendly)
 *
 * Rules (in priority order):
 * 1. Very high ratio (>70% of order) for small orders → floor to 200₽
 * 2. High ratio (>50% of order) for small orders → floor to 100₽
 * 3. Small orders (<1500₽) → standard round to 50₽ (310→300, 340→350, 370→350, 380→400)
 * 4. Big orders (≥1500₽) → always round UP to 50₽ (310→350, 340→350, 370→400, 380→400)
 *
 * @param {number} deliveryCost - Raw delivery cost
 * @param {object} options - Optional settings
 * @param {number} options.orderTotal - Order total (to calculate ratio)
 * @param {object} options.settings - Rounding settings from database
 * @returns {number} Rounded cost
 */
function roundDeliveryCost(deliveryCost, options = {}) {
  if (typeof deliveryCost !== 'number' || isNaN(deliveryCost) || deliveryCost <= 0) {
    return deliveryCost;
  }

  const { orderTotal = 0, settings = {} } = options;
  const config = { ...DEFAULT_ROUNDING_SETTINGS, ...settings };

  // For small orders, check delivery ratio
  if (orderTotal > 0 && orderTotal < config.small_order_threshold) {
    const ratio = deliveryCost / orderTotal;

    // Very high ratio (>70%): aggressive floor to 200₽
    if (ratio >= config.very_high_ratio_threshold) {
      return Math.floor(deliveryCost / config.very_high_ratio_step) * config.very_high_ratio_step;
    }

    // High ratio (>50%): floor to 100₽
    if (ratio >= config.high_ratio_threshold) {
      return Math.floor(deliveryCost / config.high_ratio_step) * config.high_ratio_step;
    }

    // Normal small order: standard round to 50₽
    return Math.round(deliveryCost / config.small_order_step) * config.small_order_step;
  }

  // Big orders (≥1500₽): always round UP to 50₽
  return Math.ceil(deliveryCost / config.big_order_step) * config.big_order_step;
}

/**
 * Get shipping credentials from environment variables
 * @param {string} providerCode - 'cdek' or 'pochta'
 * @returns {object} Credentials
 */
function getCredentials(providerCode) {
  if (providerCode === 'cdek') {
    const clientId = process.env.CDEK_CLIENT_ID;
    const clientSecret = process.env.CDEK_CLIENT_SECRET;
    console.log('[Shipping] CDEK credentials check:', {
      hasClientId: !!clientId,
      hasClientSecret: !!clientSecret
    });
    return {
      clientId,
      clientSecret,
      isTest: process.env.CDEK_TEST_MODE === 'true'
    };
  }

  if (providerCode === 'pochta' || providerCode === 'apiship') {
    const token = process.env.APISHIP_TOKEN?.trim();
    const login = process.env.APISHIP_LOGIN?.trim();
    const password = process.env.APISHIP_PASSWORD?.trim();
    const isTest = process.env.APISHIP_TEST_MODE === 'true';

    // Debug logging for troubleshooting
    console.log('[Shipping] APIShip credentials check:', {
      authMethod: token ? 'direct token (APISHIP_TOKEN)' : 'login/password',
      hasToken: !!token,
      tokenLength: token?.length || 0,
      hasLogin: !!login,
      loginLength: login?.length || 0,
      hasPassword: !!password,
      passwordLength: password?.length || 0,
      isTest,
      apiUrl: isTest ? 'api.dev.apiship.ru (TEST)' : 'api.apiship.ru (PRODUCTION)',
      envVarSet: {
        APISHIP_TOKEN: !!process.env.APISHIP_TOKEN,
        APISHIP_LOGIN: !!process.env.APISHIP_LOGIN,
        APISHIP_PASSWORD: !!process.env.APISHIP_PASSWORD,
        APISHIP_TEST_MODE: process.env.APISHIP_TEST_MODE
      }
    });

    // Provide helpful warnings
    if (!token && !login && !password) {
      console.warn('[Shipping] WARNING: No APIShip credentials configured. Set APISHIP_TOKEN (recommended) or APISHIP_LOGIN + APISHIP_PASSWORD');
    }
    if (!token && login && !login.includes('@')) {
      console.warn('[Shipping] WARNING: APISHIP_LOGIN should be an email address');
    }
    if (!token && password && password.length > 30) {
      console.warn('[Shipping] TIP: APISHIP_PASSWORD looks like an API token. Use APISHIP_TOKEN instead for direct token auth.');
    }

    return {
      token,
      login,
      password,
      isTest
    };
  }

  throw new Error(`Unknown shipping provider: ${providerCode}`);
}

/**
 * Get sender information from database or environment
 * Merges database values with environment variable defaults
 * @param {object} pool - Database connection pool
 * @returns {Promise<object>} Sender info
 */
async function getSenderInfo(pool) {
  // Default sender info from environment variables
  const defaults = {
    name: process.env.SENDER_NAME || 'ИП',
    companyName: process.env.SENDER_COMPANY || 'ИП',
    phone: process.env.SENDER_PHONE || '+7',
    email: process.env.SENDER_EMAIL || 'info@buy-tribute.com',
    postalCode: process.env.SENDER_POSTAL_CODE || '000000',
    city: process.env.SENDER_CITY || '',
    address: process.env.SENDER_ADDRESS || ''
  };

  try {
    const result = await pool.query(
      "SELECT value FROM app_settings WHERE key = 'sender_info'"
    );

    if (result.rows.length > 0) {
      const dbValue = result.rows[0].value;
      // Merge database values with env var defaults
      // Database values take precedence, but fall back to env vars for missing/empty fields
      // Use trim() to handle empty strings and nullish coalescing
      return {
        name: (dbValue.name?.trim() || '') || defaults.name,
        companyName: (dbValue.companyName?.trim() || '') || defaults.companyName,
        phone: (dbValue.phone?.trim() || '') || defaults.phone,
        email: (dbValue.email?.trim() || '') || defaults.email,
        postalCode: (dbValue.postalCode?.trim() || '') || defaults.postalCode,
        city: (dbValue.city?.trim() || '') || defaults.city,
        address: (dbValue.address?.trim() || '') || defaults.address
      };
    }
  } catch (error) {
    console.error('Failed to load sender info from database:', error);
  }

  // Return env var defaults if database query failed or no data found
  return defaults;
}

/**
 * Calculate shipping options for an order
 *
 * @param {object} params - Calculation parameters
 * @param {string} params.toPostalCode - Recipient postal code
 * @param {string} params.toCity - Recipient city (optional, for CDEK)
 * @param {Array} params.orderItems - Order items for parcel calculation
 * @param {Array} params.providers - Providers to calculate for (default: ['pochta', 'cdek'])
 * @param {object} pool - Database connection pool
 * @returns {Promise<object>} Available shipping options
 */
async function calculateShipping(params, pool) {
  const {
    toPostalCode,
    toCity,
    toAddress,  // Full address string for geocoding fallback
    orderItems,
    providers = ['pochta', 'cdek'],
    deliveryType,  // 'pvz' | 'courier'
    express = false
  } = params;

  console.log('[Shipping] ============================================');
  console.log('[Shipping] SHIPPING CALCULATION START');
  console.log('[Shipping] ============================================');
  console.log('[Shipping] Request:', {
    toPostalCode,
    toCity: toCity || '(not provided)',
    toAddress: toAddress ? `${toAddress.substring(0, 50)}...` : '(not provided)',
    itemsCount: orderItems?.length || 0,
    providers,
    deliveryType: deliveryType || 'all',
    express
  });

  // Get sender info
  const senderInfo = await getSenderInfo(pool);
  console.log('[Shipping] Sender info loaded:', {
    name: senderInfo.name,
    postalCode: senderInfo.postalCode,
    city: senderInfo.city || '(not set)',
    cityLength: senderInfo.city?.length || 0,
    hasAddress: !!senderInfo.address,
    addressLength: senderInfo.address?.length || 0,
    // Show first 30 chars of address if present
    addressPreview: senderInfo.address ? senderInfo.address.substring(0, 30) + '...' : '(none)'
  });

  // Validate sender postal code
  if (!senderInfo.postalCode || senderInfo.postalCode === '000000' || !/^\d{6}$/.test(senderInfo.postalCode)) {
    console.error('[Shipping] Invalid sender postal code:', senderInfo.postalCode);
    throw new Error('Не настроен почтовый индекс отправителя. Обратитесь к администратору.');
  }

  // Warn if sender city is not configured (required for Pochta Russia via APIShip)
  if (providers.includes('pochta') && !senderInfo.city && !senderInfo.address) {
    console.warn('[Shipping] WARNING: Sender city not configured. Set SENDER_CITY env var or configure sender address in admin settings. Pochta Russia shipping will fail.');
  }

  // Calculate parcels from order items
  const packagingConfig = await parcelCalculator.loadPackagingConfig(pool);
  const weightConfig = await parcelCalculator.loadProductWeights(pool);
  const capacityLimits = await parcelCalculator.loadCapacityLimits(pool);
  const { parcels, totalPackagingCost, totalWeight } = parcelCalculator.calculatePackagingCost(
    orderItems,
    { packagingConfig, weightConfig, capacityLimits }
  );

  if (parcels.length === 0) {
    return {
      parcels: [],
      options: [],
      packagingCost: 0,
      totalWeight: 0
    };
  }

  const shippingOptions = [];
  const errors = [];

  // Calculate declared value for insurance
  const declaredValue = orderItems.reduce((sum, item) => sum + (item.price_at_purchase || 0) * (item.quantity || 1), 0);

  // Calculate Pochta Russia options via ApiShip
  if (providers.includes('pochta')) {
    try {
      console.log('[Shipping] ====== POCHTA (APIShip) CALCULATION ======');
      const pochtaCredentials = getCredentials('pochta');

      // Validate credentials (token OR login+password)
      const hasToken = !!pochtaCredentials.token;
      const hasLoginPassword = !!(pochtaCredentials.login && pochtaCredentials.password);
      if (!hasToken && !hasLoginPassword) {
        console.error('[Shipping] Pochta credentials missing:', {
          hasToken,
          hasLogin: !!pochtaCredentials.login,
          hasPassword: !!pochtaCredentials.password
        });
        throw new Error('Почта России: API credentials not configured (set APISHIP_TOKEN or APISHIP_LOGIN + APISHIP_PASSWORD)');
      }

      const pochtaParams = {
        fromPostalCode: senderInfo.postalCode,
        fromCity: senderInfo.city,
        fromAddress: senderInfo.address,  // Sender address for geocoding
        toPostalCode,
        toCity,
        toAddress,  // Full address for geocoding fallback
        weight: totalWeight,
        declaredValue,
        deliveryType,
        express
      };

      console.log('[Shipping] Pochta request params:', {
        ...pochtaParams,
        weight: `${pochtaParams.weight}g`,
        declaredValue: `${pochtaParams.declaredValue}₽`
      });

      const pochtaTariffs = await apishipService.calculateTariffs(pochtaParams, pochtaCredentials);

      shippingOptions.push(...pochtaTariffs);
      console.log('[Shipping] Pochta result:', pochtaTariffs.length, 'tariffs',
        pochtaTariffs.map(t => `${t.name}: ${t.price}₽`).join(', ') || 'none'
      );
    } catch (error) {
      console.error('[Shipping] Pochta tariff calculation failed:', error.message);
      errors.push(`Pochta: ${error.message}`);
    }
  }

  // Calculate CDEK options
  if (providers.includes('cdek')) {
    try {
      console.log('[Shipping] ====== CDEK CALCULATION ======');
      const cdekCredentials = getCredentials('cdek');

      // Validate credentials
      if (!cdekCredentials.clientId || !cdekCredentials.clientSecret) {
        console.error('[Shipping] CDEK credentials missing:', {
          hasClientId: !!cdekCredentials.clientId,
          hasClientSecret: !!cdekCredentials.clientSecret
        });
        throw new Error('CDEK: API credentials not configured');
      }

      const cdekParams = {
        fromPostalCode: senderInfo.postalCode,
        toPostalCode,
        weight: totalWeight,
        deliveryType,
        express
      };

      console.log('[Shipping] CDEK request params:', {
        ...cdekParams,
        weight: `${cdekParams.weight}g`
      });

      const cdekTariffs = await cdekService.calculateTariffs(cdekParams, cdekCredentials);

      shippingOptions.push(...cdekTariffs);
      console.log('[Shipping] CDEK result:', cdekTariffs.length, 'tariffs',
        cdekTariffs.map(t => `${t.name}: ${t.price}₽`).join(', ') || 'none'
      );
    } catch (error) {
      console.error('[Shipping] CDEK tariff calculation failed:', error.message);
      errors.push(`CDEK: ${error.message}`);
    }
  }

  // If all providers failed and we have errors, log them
  if (shippingOptions.length === 0 && errors.length > 0) {
    console.error('[Shipping] All providers failed:', errors);
  }

  // Sort by price
  shippingOptions.sort((a, b) => a.price - b.price);

  console.log('[Shipping] ============================================');
  console.log('[Shipping] SHIPPING CALCULATION SUMMARY');
  console.log('[Shipping] ============================================');
  console.log('[Shipping] Total options found:', shippingOptions.length);
  console.log('[Shipping] Options:', shippingOptions.map(o => ({
    provider: o.provider,
    name: o.name,
    price: `${o.price}₽`,
    days: `${o.minDays}-${o.maxDays}`
  })));
  if (errors.length > 0) {
    console.log('[Shipping] Errors:', errors);
  }
  console.log('[Shipping] Packaging cost:', `${totalPackagingCost}₽`);
  console.log('[Shipping] Total weight:', `${totalWeight}g`);
  console.log('[Shipping] ============================================');

  return {
    parcels,
    options: shippingOptions,
    packagingCost: totalPackagingCost,
    totalWeight,
    senderPostalCode: senderInfo.postalCode
  };
}

/**
 * Create shipment for an order
 *
 * @param {object} orderData - Order data
 * @param {string} orderData.provider - 'pochta' or 'cdek'
 * @param {string} orderData.serviceCode - Service code (e.g., 'pochta_1' or 'cdek_139')
 * @param {number} orderData.orderId - Order ID
 * @param {object} orderData.recipient - Recipient info
 * @param {Array} orderData.parcels - Parcel details
 * @param {object} pool - Database connection pool
 * @returns {Promise<object>} Created shipment with tracking info
 */
async function createShipment(orderData, pool) {
  const {
    provider,
    serviceCode,
    tariffCode,
    orderId,
    recipient,
    parcels
  } = orderData;

  const senderInfo = await getSenderInfo(pool);

  if (provider === 'cdek') {
    const credentials = getCredentials('cdek');

    // Determine if delivery is to pickup point or courier
    const isPickupPoint = serviceCode.includes('pvz') || recipient.pickupPointCode;

    const toLocation = isPickupPoint && recipient.pickupPointCode
      ? { code: recipient.pickupPointCode }
      : {
          postal_code: recipient.postalCode,
          city: recipient.city,
          address: recipient.address
        };

    const result = await cdekService.createOrder({
      orderNumber: `TR-${orderId}`,
      tariffCode: tariffCode || parseInt(serviceCode.replace('cdek_', '')),
      sender: {
        name: senderInfo.name,
        phone: senderInfo.phone
      },
      recipient: {
        name: `${recipient.surname} ${recipient.name}`,
        phone: recipient.phone,
        email: recipient.email
      },
      fromLocation: {
        postal_code: senderInfo.postalCode,
        city: senderInfo.city,
        address: senderInfo.address
      },
      toLocation,
      packages: parcels.map(parcel => ({
        weight: parcel.totalWeightGrams,
        length: parcel.dimensions.length,
        width: parcel.dimensions.width,
        height: parcel.dimensions.height,
        items: parcel.items.map(item => ({
          name: item.title,
          wareKey: `item_${item.orderItemId}`,
          cost: item.price || 0,
          weight: parcel.itemsWeight / parcel.items.length,
          quantity: item.quantity
        }))
      }))
    }, credentials);

    return {
      provider: 'cdek',
      providerOrderId: result.uuid,
      trackingNumber: result.cdekNumber,
      trackingUrl: result.trackingUrl,
      raw: result.raw
    };
  }

  if (provider === 'pochta') {
    const credentials = getCredentials('pochta');

    const result = await apishipService.createOrder({
      orderNumber: `TR-${orderId}`,
      tariffId: parseInt(serviceCode.replace('pochta_', '')),
      sender: {
        name: senderInfo.name,
        companyName: senderInfo.companyName,
        phone: senderInfo.phone,
        email: senderInfo.email,
        postalCode: senderInfo.postalCode,
        city: senderInfo.city,
        address: senderInfo.address
      },
      recipient: {
        name: `${recipient.surname} ${recipient.name}`,
        phone: recipient.phone,
        email: recipient.email,
        postalCode: recipient.postalCode,
        city: recipient.city,
        region: recipient.region,
        address: recipient.address
      },
      packages: parcels.map(parcel => ({
        weight: parcel.totalWeightGrams,
        length: parcel.dimensions.length,
        width: parcel.dimensions.width,
        height: parcel.dimensions.height,
        items: parcel.items.map(item => ({
          name: item.title,
          sku: `item_${item.orderItemId}`,
          cost: item.price || 0,
          weight: parcel.itemsWeight / parcel.items.length,
          quantity: item.quantity
        }))
      })),
      declaredValue: parcels.reduce((sum, p) =>
        sum + p.items.reduce((s, i) => s + (i.price || 0) * i.quantity, 0), 0)
    }, credentials);

    return {
      provider: 'pochta',
      providerOrderId: result.orderId,
      trackingNumber: result.trackingNumber,
      trackingUrl: result.trackingUrl,
      raw: result.raw
    };
  }

  throw new Error(`Unknown shipping provider: ${provider}`);
}

/**
 * Get shipment tracking status
 *
 * @param {string} provider - 'pochta' or 'cdek'
 * @param {string} trackingNumber - Tracking number or order UUID
 * @param {object} pool - Database connection pool
 * @returns {Promise<object>} Tracking status
 */
async function getShipmentStatus(provider, trackingNumber, pool) {
  const credentials = getCredentials(provider);

  if (provider === 'cdek') {
    return cdekService.getOrderStatus(trackingNumber, credentials);
  }

  if (provider === 'pochta') {
    return apishipService.getTracking(trackingNumber, credentials);
  }

  throw new Error(`Unknown shipping provider: ${provider}`);
}

/**
 * Get pickup points for a provider
 *
 * @param {string} provider - 'pochta' or 'cdek'
 * @param {object} params - Search parameters (postalCode, city, etc.)
 * @param {object} pool - Database connection pool
 * @returns {Promise<Array>} List of pickup points
 */
async function getPickupPoints(provider, params, pool) {
  const credentials = getCredentials(provider);

  if (provider === 'cdek') {
    // CDEK API requires city_code or postal_code, not city name
    // If we have postal code, use it; otherwise coordinates alone will return ALL PVZs
    const cdekParams = { ...params };

    // Log what we're searching with
    console.log('[Shipping] CDEK PVZ search params:', {
      city: params.city,
      postalCode: params.postalCode,
      hasCoordinates: !!(params.latitude && params.longitude),
      latitude: params.latitude,
      longitude: params.longitude
    });

    // If we have postal code, prefer that over city name for filtering
    if (params.postalCode) {
      cdekParams.postalCode = params.postalCode;
      delete cdekParams.city; // Remove city name, use postal code instead
      console.log('[Shipping] Using postal code for CDEK search:', params.postalCode);
    } else if (params.city) {
      // We have city name but no postal code
      // CDEK API doesn't accept city names directly, needs city_code
      // Without postal_code or city_code, it returns ALL PVZs in country
      console.warn('[Shipping] CDEK search with city name only (no postal code):', params.city);
      console.warn('[Shipping] CDEK API does not filter by city name - will return ALL PVZs in country!');
      console.warn('[Shipping] Coordinates will sort by distance but won\'t filter results.');
      delete cdekParams.city; // Remove city since CDEK doesn't use it
    }

    const result = await cdekService.getPickupPoints(cdekParams, credentials);
    console.log('[Shipping] CDEK returned', result.length, 'PVZ points');
    return result;
  }

  if (provider === 'pochta') {
    return apishipService.getPickupPoints(params, credentials);
  }

  throw new Error(`Unknown shipping provider: ${provider}`);
}

/**
 * Cancel a shipment
 *
 * @param {string} provider - 'pochta' or 'cdek'
 * @param {string} shipmentId - Provider shipment/order ID
 * @param {object} pool - Database connection pool
 * @returns {Promise<object>} Cancellation result
 */
async function cancelShipment(provider, shipmentId, pool) {
  const credentials = getCredentials(provider);

  if (provider === 'cdek') {
    return cdekService.cancelOrder(shipmentId, credentials);
  }

  if (provider === 'pochta') {
    return apishipService.cancelOrder(shipmentId, credentials);
  }

  throw new Error(`Unknown shipping provider: ${provider}`);
}

/**
 * Get available shipping services from database
 * @param {object} pool - Database connection pool
 * @param {boolean} visibleOnly - Only return user-visible services
 * @returns {Promise<Array>} Available services
 */
async function getAvailableServices(pool, visibleOnly = false) {
  const whereClause = visibleOnly
    ? 'WHERE ss.is_active = true AND ss.is_visible = true AND sp.is_active = true'
    : 'WHERE sp.is_active = true';

  const result = await pool.query(`
    SELECT
      ss.id,
      ss.code,
      ss.internal_code,
      ss.display_name,
      ss.description,
      ss.is_visible,
      ss.is_active,
      ss.priority,
      sp.code as provider_code,
      sp.display_name as provider_name
    FROM shipping_services ss
    JOIN shipping_providers sp ON ss.provider_id = sp.id
    ${whereClause}
    ORDER BY ss.priority, ss.display_name
  `);

  return result.rows;
}

module.exports = {
  calculateShipping,
  createShipment,
  getShipmentStatus,
  getPickupPoints,
  cancelShipment,
  getAvailableServices,
  getCredentials,
  getSenderInfo,
  roundDeliveryCost,
  // Re-export sub-services for direct access if needed
  cdek: cdekService,
  apiship: apishipService,
  parcelCalculator
};

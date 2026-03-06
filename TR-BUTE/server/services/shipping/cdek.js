/**
 * CDEK Shipping Service
 *
 * Direct integration with CDEK API v2
 * Handles: OAuth2 authentication, tariff calculation, order creation, tracking, pickup points
 *
 * Documentation: https://api-docs.cdek.ru/
 * Test Environment: https://api.edu.cdek.ru/v2/
 */

const API_BASE_PRODUCTION = 'https://api.cdek.ru/v2';
const API_BASE_TEST = 'https://api.edu.cdek.ru/v2';

// Token cache
let tokenCache = {
  accessToken: null,
  expiresAt: null
};

/**
 * Get CDEK API base URL based on environment
 * @param {boolean} isTest - Use test environment
 * @returns {string} Base URL
 */
function getBaseUrl(isTest = false) {
  return isTest ? API_BASE_TEST : API_BASE_PRODUCTION;
}

/**
 * Get OAuth2 access token (with caching)
 * @param {object} credentials - { clientId, clientSecret, isTest }
 * @returns {Promise<string>} Access token
 */
async function getAccessToken(credentials) {
  const { clientId, clientSecret, isTest = false } = credentials;

  // Check cache
  if (tokenCache.accessToken && tokenCache.expiresAt && Date.now() < tokenCache.expiresAt) {
    return tokenCache.accessToken;
  }

  const baseUrl = getBaseUrl(isTest);
  const response = await fetch(`${baseUrl}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`CDEK OAuth failed: ${error}`);
  }

  const data = await response.json();

  // Cache token (with 5 minute buffer)
  tokenCache = {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 300) * 1000
  };

  return data.access_token;
}

/**
 * Make authenticated request to CDEK API
 * @param {string} endpoint - API endpoint (e.g., '/calculator/tarifflist')
 * @param {object} options - Fetch options
 * @param {object} credentials - CDEK credentials
 * @returns {Promise<object>} Response data
 */
async function apiRequest(endpoint, options = {}, credentials) {
  const token = await getAccessToken(credentials);
  const baseUrl = getBaseUrl(credentials.isTest);

  const response = await fetch(`${baseUrl}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

  const data = await response.json();

  if (!response.ok) {
    const errorMessage = data.errors?.map(e => e.message).join('; ') || JSON.stringify(data);
    throw new Error(`CDEK API error: ${errorMessage}`);
  }

  return data;
}

/**
 * Calculate shipping tariffs for CDEK services
 *
 * Fetches ALL available tariffs and selects:
 * - For express=false: the CHEAPEST tariff
 * - For express=true: the FASTEST tariff
 *
 * @param {object} params - Calculation parameters
 * @param {string} params.fromPostalCode - Sender postal code
 * @param {string} params.toPostalCode - Recipient postal code
 * @param {number} params.weight - Total weight in grams
 * @param {string} params.deliveryType - 'pvz' | 'courier' (optional)
 * @param {boolean} params.express - Request express/fastest delivery (optional)
 * @param {object} credentials - CDEK credentials
 * @returns {Promise<Array>} Best tariff (cheapest or fastest)
 */
async function calculateTariffs(params, credentials) {
  const { fromPostalCode, toPostalCode, weight, deliveryType, express = false } = params;

  console.log('[CDEK] ========== TARIFF CALCULATION START ==========');
  console.log('[CDEK] Input params:', {
    fromPostalCode,
    toPostalCode,
    weight: `${weight}g`,
    deliveryType: deliveryType || 'pvz',
    express,
    strategy: express ? 'FASTEST' : 'CHEAPEST'
  });

  // Determine delivery mode filter
  // We ship FROM warehouse (склад), so only consider склад-* tariffs
  // deliveryMode 1 = door (courier), 2 = office/pvz
  const deliveryModeFilter = deliveryType === 'courier' ? 1 : 2;

  const requestBody = {
    from_location: { postal_code: fromPostalCode },
    to_location: { postal_code: toPostalCode },
    packages: [{
      weight: weight // grams
    }]
  };

  console.log('[CDEK] Request to /calculator/tarifflist:', JSON.stringify(requestBody, null, 2));

  try {
    const response = await apiRequest('/calculator/tarifflist', {
      method: 'POST',
      body: JSON.stringify(requestBody)
    }, credentials);

    // Get all tariff_codes array
    const allTariffs = response.tariff_codes || [];
    console.log('[CDEK] Received', allTariffs.length, 'tariffs from CDEK');

    // Filter tariffs:
    // 1. Only warehouse-to-* tariffs (136, 137, 482, 483)
    // 2. Match delivery mode (pvz or courier)
    const warehouseTariffs = [136, 137, 482, 483]; // склад-* tariffs
    const pvzTariffs = [136, 483]; // склад-склад (to PVZ)
    const courierTariffs = [137, 482]; // склад-дверь (to door)

    const relevantTariffCodes = deliveryType === 'courier' ? courierTariffs : pvzTariffs;

    const filteredTariffs = allTariffs.filter(t => {
      // Must be a warehouse tariff
      if (!warehouseTariffs.includes(t.tariff_code)) return false;
      // Must match delivery type
      if (!relevantTariffCodes.includes(t.tariff_code)) return false;
      // Must have valid price
      if (!t.delivery_sum || t.delivery_sum <= 0) return false;
      return true;
    });

    console.log('[CDEK] Filtered to', filteredTariffs.length, 'relevant tariffs:',
      filteredTariffs.map(t => ({
        code: t.tariff_code,
        name: t.tariff_name,
        price: t.delivery_sum,
        days: `${t.period_min}-${t.period_max}`
      }))
    );

    if (filteredTariffs.length === 0) {
      console.warn('[CDEK] No valid tariffs found after filtering');
      console.log('[CDEK] ========== TARIFF CALCULATION END (no tariffs) ==========');
      return [];
    }

    // Select best tariff based on strategy
    let bestTariff;
    if (express) {
      // FASTEST: sort by minimum delivery days, then by price
      bestTariff = filteredTariffs.sort((a, b) => {
        const daysDiff = a.period_min - b.period_min;
        if (daysDiff !== 0) return daysDiff;
        return a.delivery_sum - b.delivery_sum;
      })[0];
      console.log('[CDEK] Selected FASTEST tariff:', bestTariff.tariff_code, bestTariff.tariff_name);
    } else {
      // CHEAPEST: sort by price, then by delivery days
      bestTariff = filteredTariffs.sort((a, b) => {
        const priceDiff = a.delivery_sum - b.delivery_sum;
        if (priceDiff !== 0) return priceDiff;
        return a.period_min - b.period_min;
      })[0];
      console.log('[CDEK] Selected CHEAPEST tariff:', bestTariff.tariff_code, bestTariff.tariff_name);
    }

    const result = [{
      code: `cdek_${bestTariff.tariff_code}`,
      name: bestTariff.tariff_name || getTariffName(bestTariff.tariff_code),
      description: bestTariff.tariff_description || '',
      deliveryMode: deliveryType === 'courier' ? 'courier' : 'pickup_point',
      price: bestTariff.delivery_sum,
      currency: 'RUB',
      minDays: bestTariff.period_min,
      maxDays: bestTariff.period_max,
      provider: 'cdek',
      isExpress: express,
      allAvailableTariffs: filteredTariffs.map(t => ({
        code: t.tariff_code,
        name: t.tariff_name,
        price: t.delivery_sum,
        minDays: t.period_min,
        maxDays: t.period_max
      })),
      raw: bestTariff
    }];

    console.log('[CDEK] Final result:', {
      code: result[0].code,
      name: result[0].name,
      price: `${result[0].price}₽`,
      deliveryMode: result[0].deliveryMode,
      days: `${result[0].minDays}-${result[0].maxDays}`,
      strategy: express ? 'FASTEST' : 'CHEAPEST'
    });
    console.log('[CDEK] ========== TARIFF CALCULATION END ==========');

    return result;
  } catch (error) {
    console.error('[CDEK] Tariff calculation failed:', error.message);
    console.log('[CDEK] ========== TARIFF CALCULATION END (error) ==========');
    return [];
  }
}

/**
 * Get human-readable tariff name
 */
function getTariffName(tariffCode) {
  const names = {
    136: 'Посылка склад-склад',
    137: 'Посылка склад-дверь',
    138: 'Посылка дверь-склад',
    139: 'Посылка дверь-дверь',
    233: 'Экспресс дверь-дверь',
    234: 'Экспресс дверь-склад',
    482: 'Экспресс склад-дверь',
    483: 'Экспресс склад-склад'
  };
  return names[tariffCode] || `Тариф ${tariffCode}`;
}

/**
 * Calculate tariff for a specific CDEK service
 *
 * @param {object} params - Calculation parameters
 * @param {number} params.tariffCode - CDEK tariff code
 * @param {string} params.fromPostalCode - Sender postal code
 * @param {string} params.toPostalCode - Recipient postal code
 * @param {number} params.weight - Total weight in grams
 * @param {object} credentials - CDEK credentials
 * @returns {Promise<object>} Tariff with price
 */
async function calculateTariff(params, credentials) {
  const { tariffCode, fromPostalCode, toPostalCode, weight } = params;

  const requestBody = {
    tariff_code: tariffCode,
    from_location: { postal_code: fromPostalCode },
    to_location: { postal_code: toPostalCode },
    packages: [{
      weight: weight // grams only, dimensions optional
    }]
  };

  const response = await apiRequest('/calculator/tariff', {
    method: 'POST',
    body: JSON.stringify(requestBody)
  }, credentials);

  return {
    code: tariffCode,
    price: response.total_sum,
    currency: response.currency,
    minDays: response.period_min,
    maxDays: response.period_max,
    provider: 'cdek',
    raw: response
  };
}

/**
 * Get delivery mode (to pickup point, to door, etc.) for tariff code
 * @param {number} tariffCode - CDEK tariff code
 * @returns {string} Delivery mode
 */
function getDeliveryMode(tariffCode) {
  // Common CDEK tariff codes:
  // Door-to-Door: 480, 481, 482
  // Door-to-Pickup: 136, 137, 138
  // Pickup-to-Door: 496, 497, 498
  // Pickup-to-Pickup: 139, 366, 368
  const pickupTariffs = [136, 137, 138, 139, 366, 368, 231, 232, 233, 234];
  const courierTariffs = [480, 481, 482, 483, 496, 497, 498];

  if (pickupTariffs.includes(tariffCode)) return 'pickup_point';
  if (courierTariffs.includes(tariffCode)) return 'courier';
  return 'unknown';
}

/**
 * Get list of CDEK pickup points (ПВЗ)
 *
 * @param {object} params - Search parameters
 * @param {string} params.cityCode - CDEK city code (optional)
 * @param {string} params.postalCode - Postal code (optional)
 * @param {string} params.countryCode - Country code (default: RU)
 * @param {number} params.latitude - Latitude for nearest search (optional)
 * @param {number} params.longitude - Longitude for nearest search (optional)
 * @param {boolean} params.haveCashless - Accepts card payment
 * @param {object} credentials - CDEK credentials
 * @returns {Promise<Array>} List of pickup points (sorted by distance if coordinates provided)
 */
async function getPickupPoints(params, credentials) {
  const { cityCode, postalCode, countryCode = 'RU', latitude, longitude, haveCashless } = params;

  const queryParams = new URLSearchParams();
  if (cityCode) queryParams.append('city_code', cityCode);
  if (postalCode) queryParams.append('postal_code', postalCode);
  queryParams.append('country_codes', countryCode);

  // Add coordinates for nearest PVZ search (CDEK API sorts by distance)
  if (latitude && longitude) {
    queryParams.append('latitude', latitude.toString());
    queryParams.append('longitude', longitude.toString());
  }

  if (haveCashless !== undefined) queryParams.append('have_cashless', haveCashless);
  queryParams.append('type', 'PVZ'); // Only pickup points, not postamats
  queryParams.append('is_reception', 'true'); // Can receive parcels

  const response = await apiRequest(`/deliverypoints?${queryParams}`, {
    method: 'GET'
  }, credentials);

  return response.map(point => ({
    code: point.code,
    name: point.name,
    address: point.location?.address_full || point.location?.address,
    city: point.location?.city,
    postalCode: point.location?.postal_code,
    latitude: point.location?.latitude,
    longitude: point.location?.longitude,
    workTime: point.work_time,
    phone: point.phones?.[0]?.number,
    type: point.type,
    haveCashless: point.have_cashless,
    haveCash: point.have_cash,
    isReception: point.is_reception,
    raw: point
  }));
}

/**
 * Search for CDEK city by name or postal code
 *
 * @param {object} params - Search parameters
 * @param {string} params.query - City name or postal code
 * @param {object} credentials - CDEK credentials
 * @returns {Promise<Array>} List of matching cities
 */
async function searchCities(params, credentials) {
  const { query } = params;

  // Try to determine if it's a postal code or city name
  const isPostalCode = /^\d{6}$/.test(query);

  const queryParams = new URLSearchParams();
  if (isPostalCode) {
    queryParams.append('postal_codes', query);
  } else {
    queryParams.append('city', query);
  }
  queryParams.append('country_codes', 'RU');
  queryParams.append('size', '20');

  const response = await apiRequest(`/location/cities?${queryParams}`, {
    method: 'GET'
  }, credentials);

  return response.map(city => ({
    code: city.code,
    name: city.city,
    region: city.region,
    country: city.country,
    postalCodes: city.postal_codes
  }));
}

/**
 * Create CDEK shipment order
 *
 * @param {object} orderData - Order data
 * @param {string} orderData.orderNumber - Internal order number
 * @param {number} orderData.tariffCode - CDEK tariff code
 * @param {object} orderData.sender - Sender info
 * @param {object} orderData.recipient - Recipient info
 * @param {object} orderData.fromLocation - Sender location
 * @param {object} orderData.toLocation - Recipient location (code for ПВЗ or address for courier)
 * @param {Array} orderData.packages - Package details
 * @param {object} credentials - CDEK credentials
 * @returns {Promise<object>} Created order with UUID and cdek_number
 */
async function createOrder(orderData, credentials) {
  const {
    orderNumber,
    tariffCode,
    sender,
    recipient,
    fromLocation,
    toLocation,
    packages
  } = orderData;

  const requestBody = {
    type: 1, // Online store order type
    number: orderNumber,
    tariff_code: tariffCode,
    sender: {
      name: sender.name,
      phones: [{ number: sender.phone }]
    },
    recipient: {
      name: recipient.name,
      phones: [{ number: recipient.phone }],
      email: recipient.email
    },
    from_location: fromLocation,
    to_location: toLocation,
    packages: packages.map((pkg, index) => ({
      number: String(index + 1),
      weight: pkg.weight,
      length: pkg.length,
      width: pkg.width,
      height: pkg.height,
      items: pkg.items.map(item => ({
        name: item.name,
        ware_key: item.wareKey || `item_${item.id}`,
        payment: { value: 0 }, // Prepaid, no COD
        cost: item.cost,
        weight: item.weight,
        amount: item.quantity
      }))
    }))
  };

  const response = await apiRequest('/orders', {
    method: 'POST',
    body: JSON.stringify(requestBody)
  }, credentials);

  return {
    uuid: response.entity?.uuid,
    cdekNumber: response.entity?.cdek_number,
    trackingUrl: response.entity?.cdek_number
      ? `https://www.cdek.ru/tracking?order_id=${response.entity.cdek_number}`
      : null,
    raw: response
  };
}

/**
 * Get CDEK order status
 *
 * @param {string} uuid - CDEK order UUID
 * @param {object} credentials - CDEK credentials
 * @returns {Promise<object>} Order status and details
 */
async function getOrderStatus(uuid, credentials) {
  const response = await apiRequest(`/orders/${uuid}`, {
    method: 'GET'
  }, credentials);

  const entity = response.entity;

  return {
    uuid: entity.uuid,
    cdekNumber: entity.cdek_number,
    orderNumber: entity.number,
    status: {
      code: entity.statuses?.[0]?.code,
      name: entity.statuses?.[0]?.name,
      date: entity.statuses?.[0]?.date_time
    },
    statusHistory: entity.statuses?.map(s => ({
      code: s.code,
      name: s.name,
      date: s.date_time,
      city: s.city
    })),
    deliveryPoint: entity.delivery_point,
    raw: entity
  };
}

/**
 * Cancel CDEK order
 *
 * @param {string} uuid - CDEK order UUID
 * @param {object} credentials - CDEK credentials
 * @returns {Promise<object>} Cancellation result
 */
async function cancelOrder(uuid, credentials) {
  const response = await apiRequest(`/orders/${uuid}`, {
    method: 'DELETE'
  }, credentials);

  return {
    success: true,
    uuid,
    raw: response
  };
}

/**
 * Generate shipping label for CDEK order
 *
 * @param {string} uuid - CDEK order UUID
 * @param {object} credentials - CDEK credentials
 * @returns {Promise<object>} Label generation result
 */
async function generateLabel(uuid, credentials) {
  // Request label generation
  const response = await apiRequest('/print/orders', {
    method: 'POST',
    body: JSON.stringify({
      orders: [{ order_uuid: uuid }],
      copy_count: 1
    })
  }, credentials);

  return {
    uuid: response.entity?.uuid,
    status: response.entity?.statuses?.[0]?.code,
    raw: response
  };
}

/**
 * Get generated label URL
 *
 * @param {string} printUuid - Print request UUID
 * @param {object} credentials - CDEK credentials
 * @returns {Promise<string|null>} Label URL or null if not ready
 */
async function getLabelUrl(printUuid, credentials) {
  const response = await apiRequest(`/print/orders/${printUuid}`, {
    method: 'GET'
  }, credentials);

  if (response.entity?.statuses?.[0]?.code === 'READY') {
    return response.entity?.url;
  }

  return null;
}

// Common CDEK tariff codes for reference
// Documentation: https://api-docs.cdek.ru/63345519.html
// We ship FROM warehouse (склад), recipient picks up at PVZ or receives by courier
const CDEK_TARIFFS = {
  // Склад-Склад / Warehouse to Pickup Point (recipient picks up from PVZ)
  // These are the cheapest options for e-commerce
  WAREHOUSE_TO_PVZ_STANDARD: 136,   // Посылка склад-склад (economy, 3-5 days)
  WAREHOUSE_TO_PVZ_EXPRESS: 483,    // Экспресс склад-склад (1-2 days)

  // Склад-Дверь / Warehouse to Door (courier delivers to recipient)
  WAREHOUSE_TO_DOOR_STANDARD: 137,  // Посылка склад-дверь
  WAREHOUSE_TO_DOOR_EXPRESS: 482,   // Экспресс склад-дверь

  // Legacy names for backwards compatibility
  PVZ_PVZ_STANDARD: 136,   // Fixed: was 139 (дверь-дверь), now correctly 136 (склад-склад)
  PVZ_PVZ_EXPRESS: 483,    // Fixed: was 366, now 483 (экспресс склад-склад)
  PVZ_DOOR_STANDARD: 137,  // Correct: склад-дверь
  PVZ_DOOR_EXPRESS: 482,   // Fixed: was 368, now 482 (экспресс склад-дверь)

  // Door tariffs (we don't use these - no courier pickup from us)
  DOOR_PVZ_STANDARD: 138,  // дверь-склад
  DOOR_PVZ_EXPRESS: 234,   // экспресс дверь-склад
  DOOR_DOOR_STANDARD: 139, // дверь-дверь
  DOOR_DOOR_EXPRESS: 233   // экспресс дверь-дверь
};

module.exports = {
  getAccessToken,
  calculateTariffs,
  calculateTariff,
  getPickupPoints,
  searchCities,
  createOrder,
  getOrderStatus,
  cancelOrder,
  generateLabel,
  getLabelUrl,
  getDeliveryMode,
  CDEK_TARIFFS
};

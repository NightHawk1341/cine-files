/**
 * ApiShip Service for Pochta Russia Integration
 *
 * Uses ApiShip as an integration layer for Pochta Russia to:
 * - Avoid SOAP complexity for tracking
 * - Get unified REST API for all operations
 * - Handle rate limiting gracefully
 *
 * ApiShip Documentation: https://docs.apiship.ru/docs/api/
 * Test Environment: http://api.dev.apiship.ru/v1/ (credentials: test/test)
 */

const dailyStats = require('../../../lib/serviceDailyStats');

const API_BASE_PRODUCTION = 'https://api.apiship.ru/v1';
const API_BASE_TEST = 'http://api.dev.apiship.ru/v1';

const APISHIP_SERVICE = 'apiship';

// Token cache
let tokenCache = {
  token: null,
  expiresAt: null
};

// Tariff cache for rate limit management
const tariffCache = new Map();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// In-memory daily counter (also persisted to DB via serviceDailyStats)
let apiCallStats = {
  date: new Date().toISOString().split('T')[0],
  calculatorCalls: 0,
  cacheHits: 0,
  totalCalls: 0
};

function trackApiCall(endpoint, wasCacheHit = false) {
  const today = new Date().toISOString().split('T')[0];
  if (apiCallStats.date !== today) {
    console.log(`[APIShip] Daily stats for ${apiCallStats.date}: ${apiCallStats.calculatorCalls} calculator calls, ${apiCallStats.cacheHits} cache hits, ${apiCallStats.totalCalls} total API calls`);
    apiCallStats = { date: today, calculatorCalls: 0, cacheHits: 0, totalCalls: 0 };
  }
  if (wasCacheHit) {
    apiCallStats.cacheHits++;
    dailyStats.increment(APISHIP_SERVICE, 'cache_hits');
  } else if (endpoint === '/calculator') {
    apiCallStats.calculatorCalls++;
    apiCallStats.totalCalls++;
    dailyStats.increment(APISHIP_SERVICE, 'calculator_calls');
    dailyStats.increment(APISHIP_SERVICE, 'total_calls');
  } else {
    apiCallStats.totalCalls++;
    dailyStats.increment(APISHIP_SERVICE, 'total_calls');
  }
  if (endpoint === '/calculator') {
    console.log(`[APIShip] Today: ${apiCallStats.calculatorCalls} calculator calls, ${apiCallStats.cacheHits} cache hits (date: ${today})`);
  }
}

function getApiCallStats() {
  return { ...apiCallStats };
}

// Custom error class for rate limit detection
class RateLimitError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RateLimitError';
    this.isRateLimit = true;
  }
}

/**
 * Get ApiShip API base URL
 * @param {boolean} isTest - Use test environment
 * @returns {string} Base URL
 */
function getBaseUrl(isTest = false) {
  return isTest ? API_BASE_TEST : API_BASE_PRODUCTION;
}

/**
 * Get authentication token for ApiShip API
 *
 * Supports two authentication methods:
 * 1. Direct token (APISHIP_TOKEN) - use token directly, no login needed
 * 2. Login/password (APISHIP_LOGIN + APISHIP_PASSWORD) - call login endpoint
 *
 * @param {object} credentials - { token, login, password, isTest }
 * @returns {Promise<string>} Authentication token
 */
async function login(credentials) {
  const { token: rawToken, login: rawLogin, password: rawPassword, isTest = false } = credentials;

  // Trim credentials to remove any whitespace (common env var issue)
  const token = rawToken?.trim();
  const login = rawLogin?.trim();
  const password = rawPassword?.trim();

  // Method 1: Direct token authentication (preferred)
  // APIShip tokens don't expire, so we can use them directly
  if (token) {
    console.log('[APIShip] Using direct API token (APISHIP_TOKEN)');
    return token;
  }

  // Method 2: Login/password authentication
  // Validate credentials
  if (!login || !password) {
    console.error('[APIShip] Authentication failed: no token or login/password provided', {
      hasToken: !!token,
      hasLogin: !!login,
      loginLength: login?.length || 0,
      hasPassword: !!password,
      passwordLength: password?.length || 0
    });
    throw new Error(
      'APIShip credentials not configured. ' +
      'Set APISHIP_TOKEN (recommended) or both APISHIP_LOGIN and APISHIP_PASSWORD. ' +
      'Get your API token from https://a.apiship.ru/ dashboard.'
    );
  }

  // Check cache
  if (tokenCache.token && tokenCache.expiresAt && Date.now() < tokenCache.expiresAt) {
    console.log('[APIShip] Using cached token');
    return tokenCache.token;
  }

  const baseUrl = getBaseUrl(isTest);
  // APIShip Swagger spec: POST /users/login (https://api.apiship.ru/doc/openapi.yaml)
  const loginUrl = `${baseUrl}/users/login`;

  console.log('[APIShip] Attempting login with email/password:', {
    url: loginUrl,
    isTest,
    loginLength: login.length,
    loginIsEmail: login.includes('@'),
    passwordLength: password.length
  });

  const response = await fetch(loginUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ login, password })
  });

  // Capture X-Tracing-Id for support debugging
  const tracingId = response.headers.get('X-Tracing-Id') || response.headers.get('x-tracing-id');

  if (!response.ok) {
    const error = await response.text();
    console.error('[APIShip] Login failed:', {
      status: response.status,
      statusText: response.statusText,
      'X-Tracing-Id': tracingId,
      error
    });
    console.error('[APIShip] FOR SUPPORT: X-Tracing-Id =', tracingId);
    console.error('[APIShip] TIP: If using API token as password, use APISHIP_TOKEN instead');
    throw new Error(`ApiShip login failed (X-Tracing-Id: ${tracingId}): ${error}`);
  }

  const data = await response.json();

  // Cache token for 23 hours (tokens typically valid for 24h)
  tokenCache = {
    token: data.accessToken,
    expiresAt: Date.now() + 23 * 60 * 60 * 1000
  };

  console.log('[APIShip] Login successful, token cached');
  return data.accessToken;
}

/**
 * Make authenticated request to ApiShip API
 * @param {string} endpoint - API endpoint
 * @param {object} options - Fetch options
 * @param {object} credentials - ApiShip credentials
 * @returns {Promise<object>} Response data
 */
async function apiRequest(endpoint, options = {}, credentials) {
  const token = await login(credentials);
  const baseUrl = getBaseUrl(credentials.isTest);

  const response = await fetch(`${baseUrl}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': token,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

  // Track API call
  trackApiCall(endpoint);

  // Capture X-Tracing-Id from every response for APIShip support debugging
  const tracingId = response.headers.get('X-Tracing-Id') || response.headers.get('x-tracing-id');
  console.log(`[APIShip] ${endpoint} — X-Tracing-Id: ${tracingId || '(not present)'}`);

  // Check for rate limit before parsing response
  if (response.status === 429) {
    console.error('[APIShip] FOR SUPPORT: X-Tracing-Id =', tracingId);
    throw new RateLimitError('ShipAPI daily rate limit reached');
  }

  const data = await response.json();

  // Attach tracing ID to response data for callers that need it
  if (data && typeof data === 'object') {
    data._tracingId = tracingId;
  }

  if (!response.ok) {
    // Log full error response for debugging
    console.error('[APIShip] API Error Response:', {
      status: response.status,
      endpoint,
      'X-Tracing-Id': tracingId,
      fullResponse: JSON.stringify(data, null, 2)
    });

    // Extract detailed error information
    let errorMessage = data.message || '';
    if (data.errors && Array.isArray(data.errors)) {
      const errorDetails = data.errors.map(e => {
        if (typeof e === 'object') {
          return e.message || e.field ? `${e.field || 'unknown'}: ${e.message || JSON.stringify(e)}` : JSON.stringify(e);
        }
        return String(e);
      }).join('; ');
      errorMessage = errorMessage ? `${errorMessage} - ${errorDetails}` : errorDetails;
    }
    if (!errorMessage) {
      errorMessage = JSON.stringify(data);
    }

    // Also check for rate limit messages in response body
    if (errorMessage.toLowerCase().includes('rate limit') ||
        errorMessage.toLowerCase().includes('too many requests') ||
        errorMessage.toLowerCase().includes('limit exceeded')) {
      throw new RateLimitError(`ShipAPI rate limit: ${errorMessage}`);
    }

    throw new Error(`ApiShip API error: ${errorMessage}`);
  }

  return data;
}

/**
 * Generate cache key for tariff calculation
 */
function getTariffCacheKey(params) {
  return `${params.fromPostalCode}-${params.toPostalCode}-${params.weight}`;
}

/**
 * Calculate shipping tariffs via ApiShip (for Pochta Russia services)
 *
 * @param {object} params - Calculation parameters
 * @param {string} params.fromPostalCode - Sender postal code (required)
 * @param {string} params.toPostalCode - Recipient postal code (required)
 * @param {string} params.fromCity - Sender city name (required if fromAddress not provided)
 * @param {string} params.toCity - Recipient city name (required if toAddress not provided)
 * @param {string} params.fromAddress - Sender full address (preferred, required if fromCity not provided)
 * @param {string} params.toAddress - Recipient full address (preferred, required if toCity not provided)
 * @param {number} params.weight - Total weight in grams
 * @param {number} params.declaredValue - Declared value in rubles (optional)
 * @param {string} params.deliveryType - 'pvz' | 'courier' (optional)
 * @param {boolean} params.express - Request express delivery (optional)
 * @param {number} params.length - Package length in cm (optional, default: 20)
 * @param {number} params.width - Package width in cm (optional, default: 15)
 * @param {number} params.height - Package height in cm (optional, default: 10)
 * @param {object} credentials - ApiShip credentials
 * @returns {Promise<Array>} Available tariffs with prices
 */
async function calculateTariffs(params, credentials) {
  const {
    fromPostalCode,
    toPostalCode,
    fromCity,
    toCity,
    fromAddress,
    toAddress,
    weight,
    declaredValue = 0,
    deliveryType,
    express = false,
    length = 20,
    width = 15,
    height = 10
  } = params;

  console.log('[APIShip] ========== TARIFF CALCULATION START ==========');
  console.log('[APIShip] Input params:', {
    fromPostalCode,
    fromCity: fromCity || '(not provided)',
    fromAddress: fromAddress ? `${fromAddress.substring(0, 40)}...` : '(not provided)',
    toPostalCode,
    toCity: toCity || '(not provided)',
    toAddress: toAddress ? `${toAddress.substring(0, 40)}...` : '(not provided)',
    weight: `${weight}g`,
    dimensions: `${length}x${width}x${height}cm`,
    declaredValue: `${declaredValue}₽`,
    deliveryType: deliveryType || 'all',
    express
  });

  // Validate postal codes (must be 6 digits)
  if (!fromPostalCode || !/^\d{6}$/.test(fromPostalCode)) {
    throw new Error(`Invalid sender postal code format: ${fromPostalCode} (must be 6 digits)`);
  }
  if (!toPostalCode || !/^\d{6}$/.test(toPostalCode)) {
    throw new Error(`Invalid recipient postal code format: ${toPostalCode} (must be 6 digits)`);
  }

  // Validate and normalize weight (must be > 0 and <= 30000g for Pochta)
  let validatedWeight = parseInt(weight) || 0;
  if (validatedWeight <= 0) {
    console.warn('[APIShip] Weight is 0 or negative, setting to 100g minimum');
    validatedWeight = 100;
  }
  if (validatedWeight > 30000) {
    console.warn('[APIShip] Weight exceeds 30kg limit, capping at 30000g');
    validatedWeight = 30000;
  }
  console.log('[APIShip] Validated weight:', `${validatedWeight}g`);

  // Check cache first (to respect rate limits)
  const cacheKey = `${getTariffCacheKey(params)}-${deliveryType || 'all'}-${express}`;
  const cached = tariffCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    trackApiCall('/calculator', true);
    console.log('[APIShip] Returning cached result:', cached.data.length, 'tariffs');
    return cached.data;
  }

  // Validate and normalize dimensions (must be > 0)
  const validatedLength = Math.max(1, parseInt(length) || 20);
  const validatedWidth = Math.max(1, parseInt(width) || 15);
  const validatedHeight = Math.max(1, parseInt(height) || 10);

  console.log('[APIShip] Validated dimensions:', {
    length: `${validatedLength}cm`,
    width: `${validatedWidth}cm`,
    height: `${validatedHeight}cm`
  });

  // ApiShip calculation - requires weight and dimensions
  // APIShip requires city or addressString for geocoding - postal code alone is not sufficient
  const fromLocation = {
    countryCode: 'RU',
    index: fromPostalCode
  };

  // Prefer full address over city (more precise for tariff calculation)
  if (fromAddress && fromAddress.trim()) {
    fromLocation.addressString = fromAddress;
    console.log('[APIShip] Using sender address:', fromAddress.substring(0, 50));
  } else if (fromCity && fromCity.trim()) {
    fromLocation.city = fromCity;
    console.log('[APIShip] Using sender city:', fromCity);
  } else {
    // APIShip cannot geocode from postal code alone - city name is required
    console.error('[APIShip] Sender location validation failed:', {
      fromCity: fromCity || '(empty)',
      fromAddress: fromAddress || '(empty)',
      fromPostalCode
    });
    throw new Error(
      'Sender city not configured. Please set SENDER_CITY in environment variables or configure sender address in admin settings.'
    );
  }

  const toLocation = {
    countryCode: 'RU',
    index: toPostalCode
  };

  // Prefer full address over city (more precise for tariff calculation)
  if (toAddress) {
    toLocation.addressString = toAddress;
  } else if (toCity) {
    toLocation.city = toCity;
  } else {
    // APIShip cannot geocode from postal code alone - city name is required
    throw new Error(
      'Recipient city not provided. Please ensure the address is selected from DaData suggestions during checkout.'
    );
  }

  const requestBody = {
    from: fromLocation,
    to: toLocation,
    weight: validatedWeight, // grams
    length: validatedLength, // cm (required by APIShip)
    width: validatedWidth,   // cm (required by APIShip)
    height: validatedHeight, // cm (required by APIShip)
    assessedCost: declaredValue, // APIShip expects rubles (not kopeks)
    providerKeys: ['rupost']
  };

  console.log('[APIShip] Request to /calculator:', JSON.stringify(requestBody, null, 2));

  const response = await apiRequest('/calculator', {
    method: 'POST',
    body: JSON.stringify(requestBody)
  }, credentials);

  // Log X-Tracing-Id prominently for APIShip support debugging
  const calculatorTracingId = response._tracingId;
  console.log('[APIShip] ============================================');
  console.log('[APIShip] /calculator X-Tracing-Id:', calculatorTracingId || '(not present)');
  console.log('[APIShip] Request time (MSK):', new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' }));
  console.log('[APIShip] ============================================');

  // Log response summary (omit pointIds arrays which can be thousands of entries)
  console.log('[APIShip] Response top-level keys:', Object.keys(response));
  console.log('[APIShip] Response providers:', {
    deliveryToPoint: (response.deliveryToPoint || []).map(p => ({
      providerKey: p.providerKey,
      tariffCount: p.tariffs?.length || 0,
      pointIdCount: p.pointIds?.length || 0
    })),
    deliveryToDoor: (response.deliveryToDoor || []).map(p => ({
      providerKey: p.providerKey,
      tariffCount: p.tariffs?.length || 0
    }))
  });

  // APIShip /calculator response structure is NESTED:
  //   deliveryToPoint: [{ providerKey: 'rupost', tariffs: [{...}, {...}], pointIds: [...] }]
  //   deliveryToDoor:  [{ providerKey: 'rupost', tariffs: [{...}, {...}] }]
  // Each element is a PROVIDER wrapper; actual tariffs are inside .tariffs[]
  const extractTariffs = (providerEntries) =>
    (providerEntries || [])
      .filter(p => p.providerKey === 'rupost')
      .flatMap(p => p.tariffs || []);

  const previewPointTariffs = extractTariffs(response.deliveryToPoint);
  const previewDoorTariffs = extractTariffs(response.deliveryToDoor);
  const previewAllTariffs = [...previewPointTariffs, ...previewDoorTariffs];

  if (previewAllTariffs.length > 0) {
    console.log('[APIShip] Available tariffs:', previewAllTariffs.map(t => ({
      tariffId: t.tariffId,
      tariffName: t.tariffName,
      deliveryCost: t.deliveryCost,
      daysMin: t.daysMin,
      daysMax: t.daysMax
    })));

    // Log first tariff for debugging
    console.log('[APIShip] First tariff raw data sample:', JSON.stringify(previewAllTariffs[0], null, 2));
  } else {
    console.warn('[APIShip] No rupost tariffs found in APIShip response');
    console.warn('[APIShip] Provider entries:', (response.deliveryToPoint || []).map(p => ({
      providerKey: p.providerKey,
      tariffCount: p.tariffs?.length || 0
    })));
  }

  // Determine which tariff to use based on delivery type and express
  // Pochta services:
  // - Посылка онлайн (27020) - standard to post office
  // - Посылка 1 класса (4030) - express to post office
  // - Курьер онлайн (27030) - courier to door
  let targetTariffId;
  let targetDeliveryMode;

  if (deliveryType === 'courier') {
    targetTariffId = POCHTA_SERVICES.ONLINE_COURIER.code; // 27030
    targetDeliveryMode = 'courier';
  } else if (express) {
    targetTariffId = POCHTA_SERVICES.PARCEL_CLASS_1.code; // 4030
    targetDeliveryMode = 'pickup_point';
  } else {
    targetTariffId = POCHTA_SERVICES.ONLINE_PARCEL.code; // 27020
    targetDeliveryMode = 'pickup_point';
  }

  // Find the matching tariff from response
  // APIShip nests tariffs inside provider wrappers: deliveryToPoint[].tariffs[]
  const pointTariffs = (response.deliveryToPoint || [])
    .filter(p => p.providerKey === 'rupost')
    .flatMap(p => p.tariffs || []);
  const doorTariffs = (response.deliveryToDoor || [])
    .filter(p => p.providerKey === 'rupost')
    .flatMap(p => p.tariffs || []);
  const allTariffs = [...pointTariffs, ...doorTariffs];

  // Log all tariff IDs and costs for debugging
  console.log('[APIShip] All available rupost tariffs:', allTariffs.map(t => ({
    tariffId: t.tariffId,
    tariffName: t.tariffName,
    deliveryCost: t.deliveryCost,
    daysMin: t.daysMin,
    daysMax: t.daysMax
  })));

  // Search in the correct delivery mode first
  const primaryTariffs = deliveryType === 'courier' ? doorTariffs : pointTariffs;
  const secondaryTariffs = deliveryType === 'courier' ? pointTariffs : doorTariffs;

  // Find our target tariff - try exact match first
  let matchedTariff = primaryTariffs.find(t => t.tariffId === targetTariffId);

  // Also try in secondary tariffs (some APIs may list courier tariffs under points)
  if (!matchedTariff) {
    matchedTariff = secondaryTariffs.find(t => t.tariffId === targetTariffId);
  }

  // If exact match not found, try to find by similar name in primary tariffs
  if (!matchedTariff) {
    const targetName = getPochtaServiceName(targetTariffId).toLowerCase();
    console.log('[APIShip] No exact tariffId match, searching by name:', targetName);

    matchedTariff = primaryTariffs.find(t =>
      t.tariffName && t.tariffName.toLowerCase().includes(targetName.split(' ')[0])
    );
    if (!matchedTariff) {
      matchedTariff = secondaryTariffs.find(t =>
        t.tariffName && t.tariffName.toLowerCase().includes(targetName.split(' ')[0])
      );
    }
  }

  // If still no match and we have any tariff, use the best available one
  if (!matchedTariff && allTariffs.length > 0) {
    if (deliveryType === 'courier') {
      matchedTariff = allTariffs.find(t =>
        t.tariffName && t.tariffName.toLowerCase().includes('курьер')
      );
    } else {
      matchedTariff = allTariffs.find(t =>
        t.tariffName && t.tariffName.toLowerCase().includes('посылка')
      );
    }
    // Last resort - pick the one with the highest delivery cost (most likely to be valid)
    if (!matchedTariff) {
      matchedTariff = allTariffs
        .filter(t => (t.deliveryCost || t.totalCost || t.cost || 0) > 0)
        .sort((a, b) => (b.deliveryCost || b.totalCost || b.cost || 0) - (a.deliveryCost || a.totalCost || a.cost || 0))[0];
    }
    // Absolute last resort
    if (!matchedTariff) {
      matchedTariff = allTariffs[0];
    }
  }

  if (!matchedTariff) {
    console.log('[APIShip] No matching tariff found for:', { targetTariffId, deliveryType, express });
    console.log('[APIShip] ========== TARIFF CALCULATION END (no results) ==========');
    return [];
  }

  // Extract cost - try multiple field names (APIShip response format may vary)
  // APIShip returns costs in rubles (not kopeks)
  const rawCost = matchedTariff.deliveryCost || matchedTariff.totalCost || matchedTariff.cost || 0;
  // If rawCost > 1000, it's likely in kopeks (e.g. 35000 = 350₽), otherwise in rubles
  const deliveryCostRubles = rawCost > 1000 ? Math.round(rawCost / 100) : rawCost;

  // Extract delivery days
  const minDays = matchedTariff.daysMin || matchedTariff.days || 3;
  const maxDays = matchedTariff.daysMax || matchedTariff.days || 14;

  // Use the actual tariff ID from response, or fall back to target ID
  const effectiveTariffId = matchedTariff.tariffId || targetTariffId;

  // Warn if price or days are missing/invalid
  if (rawCost === 0) {
    console.warn('[APIShip] ZERO DELIVERY COST! This likely means:');
    console.warn('[APIShip]   1. APIShip test mode is enabled (APISHIP_TEST_MODE=true)');
    console.warn('[APIShip]   2. OR the API key/credentials are not valid for production');
    console.warn('[APIShip]   3. OR the route/dimensions are not supported');
    console.warn('[APIShip] FOR SUPPORT: X-Tracing-Id =', calculatorTracingId);
    console.warn('[APIShip] FOR SUPPORT: Request time (MSK) =', new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' }));
    console.warn('[APIShip] FOR SUPPORT: Route =', fromPostalCode, '->', toPostalCode);
    console.warn('[APIShip] FOR SUPPORT: Request body =', JSON.stringify(requestBody, null, 2));
    console.warn('[APIShip] Full tariff data:', JSON.stringify(matchedTariff, null, 2));
  }
  if (!matchedTariff.daysMin && !matchedTariff.days) {
    console.warn('[APIShip] WARNING: Tariff has no delivery days:', {
      tariffId: matchedTariff.tariffId,
      name: matchedTariff.tariffName,
      allFields: JSON.stringify(matchedTariff, null, 2)
    });
  }

  console.log('[APIShip] Selected tariff:', {
    tariffId: effectiveTariffId,
    originalTariffId: matchedTariff.tariffId,
    name: matchedTariff.tariffName,
    rawCost,
    costRubles: deliveryCostRubles,
    days: `${minDays}-${maxDays}`
  });

  const tariffs = [{
    code: `pochta_${effectiveTariffId}`,
    tariffId: effectiveTariffId,
    name: matchedTariff.tariffName || getPochtaServiceName(targetTariffId),
    description: getPochtaServiceDescription(effectiveTariffId),
    deliveryMode: targetDeliveryMode,
    price: deliveryCostRubles,
    currency: 'RUB',
    minDays: minDays,
    maxDays: maxDays,
    provider: 'pochta',
    providerKey: 'rupost',
    _tracingId: calculatorTracingId,
    raw: matchedTariff
  }];

  console.log('[APIShip] Final result:', tariffs.map(t => ({
    code: t.code,
    name: t.name,
    price: `${t.price}₽`,
    deliveryMode: t.deliveryMode,
    days: `${t.minDays}-${t.maxDays}`
  })));
  console.log('[APIShip] ========== TARIFF CALCULATION END ==========');

  // Cache the result
  tariffCache.set(cacheKey, {
    data: tariffs,
    expiresAt: Date.now() + CACHE_TTL
  });

  // Clean old cache entries periodically
  if (tariffCache.size > 1000) {
    const now = Date.now();
    for (const [key, value] of tariffCache) {
      if (now > value.expiresAt) {
        tariffCache.delete(key);
      }
    }
  }

  return tariffs;
}

/**
 * Get service name for Pochta tariff
 */
function getPochtaServiceName(tariffId) {
  const names = {
    [POCHTA_SERVICES.ONLINE_PARCEL.code]: 'Посылка онлайн',
    [POCHTA_SERVICES.ONLINE_COURIER.code]: 'Курьер онлайн',
    [POCHTA_SERVICES.PARCEL_CLASS_1.code]: 'Посылка 1 класса'
  };
  return names[tariffId] || `Тариф ${tariffId}`;
}

/**
 * Get human-readable description for Pochta Russia service
 * @param {number} tariffId - ApiShip tariff ID
 * @returns {string} Service description
 */
function getPochtaServiceDescription(tariffId) {
  const descriptions = {
    // Common Pochta Russia tariffs via ApiShip
    1: 'Посылка онлайн - доставка в почтовое отделение',
    2: 'Посылка онлайн - доставка курьером',
    3: 'Посылка 1 класса - ускоренная доставка',
    4: 'EMS - экспресс доставка',
    5: 'Международная посылка'
  };
  return descriptions[tariffId] || 'Доставка Почтой России';
}

/**
 * Get Pochta Russia pickup points (post offices) via ApiShip
 *
 * @param {object} params - Search parameters
 * @param {string} params.city - City name (optional)
 * @param {string} params.postalCode - Postal code (optional)
 * @param {object} credentials - ApiShip credentials
 * @returns {Promise<Array>} List of pickup points
 */
async function getPickupPoints(params, credentials) {
  const { city, postalCode } = params;

  // Strategy: postal index is the most reliable filter (unique per district).
  // Settlement names are ambiguous (e.g. "Абрамово" exists in many regions).
  // The user can also change the index independently from the address.
  // 1. Try postal index first (most precise, district-level)
  // 2. If too few results, try city name
  // 3. If still too few, try city + index combined

  async function queryPoints(locationName, index) {
    const queryParams = new URLSearchParams({
      providerKey: 'rupost',
      countryCode: 'RU'
    });
    if (locationName) {
      queryParams.append('city', locationName);
    }
    if (index) {
      queryParams.append('index', index);
    }
    console.log('[APIShip] Pochta pickup search:', { city: locationName, index });
    const resp = await apiRequest(`/lists/points?${queryParams}`, { method: 'GET' }, credentials);
    return resp.rows || [];
  }

  let rows = [];

  // Try postal index first — unambiguous, district-level precision
  if (postalCode) {
    rows = await queryPoints(null, postalCode);
    console.log('[APIShip] Index-only query returned', rows.length, 'results for index:', postalCode);
  }

  // If index returned too few, try city name (broader area)
  if (rows.length < 5 && city) {
    const cityRows = await queryPoints(city, null);
    console.log('[APIShip] City-only query returned', cityRows.length, 'results for:', city);
    if (rows.length > 0 && cityRows.length > 0) {
      const existingIds = new Set(rows.map(r => r.id || r.code));
      const newRows = cityRows.filter(r => !existingIds.has(r.id || r.code));
      rows = [...rows, ...newRows];
    } else if (cityRows.length > rows.length) {
      rows = cityRows;
    }
  }

  // If still too few, try both together (APIShip may AND or OR them)
  if (rows.length < 5 && postalCode && city) {
    const combinedRows = await queryPoints(city, postalCode);
    console.log('[APIShip] Combined query returned', combinedRows.length, 'results');
    if (combinedRows.length > 0) {
      const existingIds = new Set(rows.map(r => r.id || r.code));
      const newRows = combinedRows.filter(r => !existingIds.has(r.id || r.code));
      rows = [...rows, ...newRows];
    }
  }

  console.log('[APIShip] Pochta pickup points total:', rows.length);

  return rows.map(point => ({
    id: point.id,
    code: point.code,
    name: point.name,
    address: point.address,
    city: point.city,
    region: point.region,
    postalCode: point.index,
    latitude: point.lat,
    longitude: point.lng,
    // Add location object for consistency with frontend
    location: {
      lat: point.lat,
      lng: point.lng
    },
    workTime: point.timetable,
    phone: point.phone,
    type: 'post_office',
    raw: point
  }));
}

/**
 * Create shipment order via ApiShip (for Pochta Russia)
 *
 * @param {object} orderData - Order data
 * @param {string} orderData.orderNumber - Internal order number
 * @param {number} orderData.tariffId - ApiShip tariff ID
 * @param {object} orderData.sender - Sender info
 * @param {object} orderData.recipient - Recipient info
 * @param {Array} orderData.packages - Package details
 * @param {object} credentials - ApiShip credentials
 * @returns {Promise<object>} Created order with tracking number
 */
async function createOrder(orderData, credentials) {
  const {
    orderNumber,
    tariffId,
    sender,
    recipient,
    packages,
    declaredValue = 0
  } = orderData;

  const requestBody = {
    clientNumber: orderNumber,
    providerKey: 'rupost',
    tariffId: tariffId,
    sender: {
      countryCode: 'RU',
      index: sender.postalCode,
      city: sender.city,
      address: sender.address,
      companyName: sender.companyName,
      contactName: sender.name,
      phone: sender.phone,
      email: sender.email
    },
    recipient: {
      countryCode: 'RU',
      index: recipient.postalCode,
      city: recipient.city,
      region: recipient.region,
      address: recipient.address,
      contactName: recipient.name,
      phone: recipient.phone,
      email: recipient.email
    },
    places: packages.map((pkg, index) => ({
      placeNumber: index + 1,
      weight: pkg.weight,
      width: pkg.width,
      height: pkg.height,
      length: pkg.length,
      items: pkg.items.map(item => ({
        articul: item.sku || `SKU_${item.id}`,
        name: item.name,
        weight: item.weight,
        quantity: item.quantity,
        cost: item.cost * 100 // kopeks
      }))
    })),
    cost: declaredValue * 100, // kopeks
    assessedCost: declaredValue * 100
  };

  const response = await apiRequest('/orders', {
    method: 'POST',
    body: JSON.stringify(requestBody)
  }, credentials);

  return {
    orderId: response.orderId,
    providerNumber: response.providerNumber, // Pochta tracking number
    trackingNumber: response.providerNumber,
    trackingUrl: response.providerNumber
      ? `https://www.pochta.ru/tracking#${response.providerNumber}`
      : null,
    raw: response
  };
}

/**
 * Get order status from ApiShip
 *
 * @param {number} orderId - ApiShip order ID
 * @param {object} credentials - ApiShip credentials
 * @returns {Promise<object>} Order status
 */
async function getOrderStatus(orderId, credentials) {
  const response = await apiRequest(`/orders/${orderId}`, {
    method: 'GET'
  }, credentials);

  return {
    orderId: response.orderId,
    clientNumber: response.clientNumber,
    providerNumber: response.providerNumber,
    status: {
      code: response.status,
      name: getStatusName(response.status),
      description: response.statusDescription
    },
    trackingHistory: (response.statuses || []).map(s => ({
      code: s.status,
      name: getStatusName(s.status),
      description: s.description,
      date: s.date,
      city: s.city
    })),
    raw: response
  };
}

/**
 * Get tracking information for a shipment
 *
 * @param {string} trackingNumber - Pochta tracking number
 * @param {object} credentials - ApiShip credentials
 * @returns {Promise<object>} Tracking information
 */
async function getTracking(trackingNumber, credentials) {
  const response = await apiRequest(`/statuses?providerNumber=${trackingNumber}`, {
    method: 'GET'
  }, credentials);

  const order = response.rows?.[0];
  if (!order) {
    throw new Error(`Tracking not found: ${trackingNumber}`);
  }

  return {
    trackingNumber: order.providerNumber,
    status: {
      code: order.status,
      name: getStatusName(order.status),
      description: order.statusDescription
    },
    history: (order.statuses || []).map(s => ({
      code: s.status,
      name: getStatusName(s.status),
      description: s.description,
      date: s.date,
      city: s.city
    })),
    isDelivered: order.status === 'delivered',
    raw: order
  };
}

/**
 * Cancel order via ApiShip
 *
 * @param {number} orderId - ApiShip order ID
 * @param {object} credentials - ApiShip credentials
 * @returns {Promise<object>} Cancellation result
 */
async function cancelOrder(orderId, credentials) {
  const response = await apiRequest(`/orders/${orderId}/cancel`, {
    method: 'POST'
  }, credentials);

  return {
    success: true,
    orderId,
    raw: response
  };
}

/**
 * Get human-readable status name
 * @param {string} statusCode - ApiShip status code
 * @returns {string} Status name in Russian
 */
function getStatusName(statusCode) {
  const statuses = {
    'new': 'Создан',
    'created': 'Создан',
    'pending': 'Ожидает обработки',
    'accepted': 'Принят',
    'in_transit': 'В пути',
    'arrived': 'Прибыл в пункт выдачи',
    'ready_for_pickup': 'Готов к выдаче',
    'delivered': 'Доставлен',
    'returned': 'Возвращен',
    'cancelled': 'Отменен',
    'lost': 'Утерян'
  };
  return statuses[statusCode] || statusCode;
}

// Pochta Russia service types for reference
const POCHTA_SERVICES = {
  ONLINE_PARCEL: {
    code: 27020,
    name: 'Посылка онлайн',
    description: 'Стандартная доставка до почтового отделения'
  },
  ONLINE_COURIER: {
    code: 27030,
    name: 'Курьер онлайн',
    description: 'Доставка курьером до двери'
  },
  PARCEL_CLASS_1: {
    code: 4030,
    name: 'Посылка 1 класса',
    description: 'Ускоренная доставка'
  },
  EMS: {
    code: 7000,
    name: 'EMS',
    description: 'Экспресс доставка'
  },
  INTERNATIONAL: {
    code: 7030,
    name: 'Международная посылка',
    description: 'Доставка за рубеж'
  }
};

module.exports = {
  login,
  calculateTariffs,
  getPickupPoints,
  createOrder,
  getOrderStatus,
  getTracking,
  cancelOrder,
  getApiCallStats,
  getStatusName,
  POCHTA_SERVICES,
  RateLimitError
};

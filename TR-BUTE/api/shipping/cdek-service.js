/**
 * CDEK Widget Service Endpoint
 *
 * This endpoint serves as the backend proxy for CDEK widget v3.
 * It replaces the default service.php that the widget expects.
 *
 * The widget sends requests here, and we authenticate with CDEK API
 * and return the results.
 */

const API_BASE_PRODUCTION = 'https://api.cdek.ru/v2';
const API_BASE_TEST = 'https://api.edu.cdek.ru/v2';

// Token cache for OAuth
let tokenCache = {
  accessToken: null,
  expiresAt: null
};

/**
 * Get OAuth access token from CDEK
 */
async function getAccessToken(isTest = false) {
  const clientId = process.env.CDEK_CLIENT_ID;
  const clientSecret = process.env.CDEK_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('CDEK credentials not configured');
  }

  // Check cache
  if (tokenCache.accessToken && tokenCache.expiresAt && Date.now() < tokenCache.expiresAt) {
    return tokenCache.accessToken;
  }

  const baseUrl = isTest ? API_BASE_TEST : API_BASE_PRODUCTION;
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
 */
async function cdekApiRequest(endpoint, options = {}, isTest = false) {
  const token = await getAccessToken(isTest);
  const baseUrl = isTest ? API_BASE_TEST : API_BASE_PRODUCTION;

  const response = await fetch(`${baseUrl}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

  return response.json();
}

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const queryParams = req.method === 'POST' ? req.body : req.query;
    const { action, city, postal_code, city_code, type, is_handout, page, size } = queryParams;
    const isTest = process.env.CDEK_TEST_MODE === 'true';

    console.log('[CDEK Service] Request:', { action, city, postal_code, city_code, type, is_handout, page, size });

    switch (action) {
      case 'offices':
      case 'pvz': {
        // Get pickup points
        const params = new URLSearchParams();
        if (city_code) params.append('city_code', city_code);
        if (postal_code) params.append('postal_code', postal_code);
        params.append('country_codes', 'RU');
        params.append('type', type || 'PVZ');
        // Handle is_handout from CDEK widget (maps to is_reception in API)
        if (is_handout === 'true' || is_handout === true) {
          params.append('is_reception', 'true');
        } else {
          params.append('is_reception', 'true'); // Default to true for delivery points
        }
        // Handle pagination from CDEK widget
        if (page) params.append('page', page);
        if (size) params.append('size', size);

        const data = await cdekApiRequest(`/deliverypoints?${params}`, { method: 'GET' }, isTest);
        return res.json(data);
      }

      case 'cities':
      case 'city': {
        // Search cities
        const params = new URLSearchParams();
        if (city) params.append('city', city);
        if (postal_code) params.append('postal_codes', postal_code);
        params.append('country_codes', 'RU');
        params.append('size', '20');

        const data = await cdekApiRequest(`/location/cities?${params}`, { method: 'GET' }, isTest);
        return res.json(data);
      }

      case 'calculate': {
        // Calculate tariff
        const { from_postal, to_postal, weight, tariff_code } = req.method === 'POST' ? req.body : req.query;

        const requestBody = {
          tariff_code: parseInt(tariff_code) || 139,
          from_location: { postal_code: from_postal || process.env.SENDER_POSTAL_CODE },
          to_location: { postal_code: to_postal },
          packages: [{ weight: parseInt(weight) || 500 }]
        };

        const data = await cdekApiRequest('/calculator/tariff', {
          method: 'POST',
          body: JSON.stringify(requestBody)
        }, isTest);
        return res.json(data);
      }

      default:
        return res.status(400).json({ error: 'Unknown action', action });
    }
  } catch (error) {
    console.error('[CDEK Service] Error:', error);
    return res.status(500).json({
      error: error.message,
      success: false
    });
  }
};

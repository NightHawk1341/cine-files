/**
 * API: Address Suggestions (DaData)
 *
 * POST /api/address/suggest
 *
 * Returns address suggestions using DaData API with country detection
 * for international shipping handling.
 *
 * Request body:
 * - query: string (required) - Address search query
 * - count: number (optional) - Number of suggestions to return (default: 10)
 *
 * Response:
 * - suggestions: Array of address suggestions
 * - isInternational: boolean - True if foreign address detected
 */

// DaData API configuration
const DADATA_API_URL = 'https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address';
const DADATA_API_KEY = process.env.DADATA_API_KEY;       // Token - for suggestions API
const DADATA_SECRET_KEY = process.env.DADATA_SECRET_KEY; // Secret - for cleansing API (optional)

/**
 * Detect if address is international (non-Russian)
 * @param {object} suggestion - DaData suggestion object
 * @returns {boolean}
 */
function isInternationalAddress(suggestion) {
  if (!suggestion || !suggestion.data) return false;

  const data = suggestion.data;

  // Check country code (Russia = RU)
  if (data.country_iso_code && data.country_iso_code !== 'RU') {
    return true;
  }

  // Check country name
  if (data.country && data.country !== 'Россия') {
    return true;
  }

  return false;
}

/**
 * Format DaData suggestion for frontend
 * @param {object} suggestion - Raw DaData suggestion
 * @returns {object}
 */
function formatSuggestion(suggestion) {
  const data = suggestion.data || {};

  return {
    // Display value (full address)
    value: suggestion.value,
    // Unrestricted value (for display)
    unrestricted_value: suggestion.unrestricted_value,
    // Geographic data (flat fields for backward compatibility)
    country: data.country || 'Россия',
    country_iso_code: data.country_iso_code || 'RU',
    region: data.region_with_type || data.region,
    city: data.city || data.settlement || data.area,
    city_with_type: data.city_with_type || data.settlement_with_type,
    // Address components
    street: data.street_with_type || data.street,
    house: data.house,
    flat: data.flat,
    // Postal code (important for shipping calculation)
    postal_code: data.postal_code,
    // FIAS/KLADR codes (for accurate delivery calculation)
    fias_id: data.fias_id,
    fias_level: data.fias_level,
    kladr_id: data.kladr_id,
    // City FIAS ID (for CDEK city lookup)
    city_fias_id: data.city_fias_id,
    // Coordinates (for map display)
    geo_lat: data.geo_lat,
    geo_lon: data.geo_lon,
    // International flag
    isInternational: isInternationalAddress(suggestion),
    // IMPORTANT: Preserve nested data structure for precise geocoding
    // This handles cases like Moscow settlements (city: "Москва", settlement: "Внуково")
    // where using just city would be too imprecise for delivery calculations
    data: {
      city: data.city,
      settlement: data.settlement,
      area: data.area,
      city_with_type: data.city_with_type,
      settlement_with_type: data.settlement_with_type,
      area_with_type: data.area_with_type,
      region: data.region,
      region_with_type: data.region_with_type,
      geo_lat: data.geo_lat,
      geo_lon: data.geo_lon,
      postal_code: data.postal_code
    }
  };
}

module.exports = async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check API key is configured
  if (!DADATA_API_KEY) {
    console.error('DaData API key not configured');
    return res.status(500).json({
      error: 'Address service not configured',
      suggestions: []
    });
  }

  try {
    const { query, count = 10 } = req.body;

    // Validate query
    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        error: 'Missing or invalid query parameter',
        suggestions: []
      });
    }

    // Don't search for very short queries
    if (query.trim().length < 2) {
      return res.status(200).json({
        suggestions: [],
        isInternational: false
      });
    }

    // Call DaData API
    const response = await fetch(DADATA_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Token ${DADATA_API_KEY}`
      },
      body: JSON.stringify({
        query: query.trim(),
        count: Math.min(count, 20), // Limit to 20 max
        // Locations filter: prioritize Russia but allow international
        locations: [
          { country: '*' } // Allow all countries
        ],
        // Prefer addresses with postal codes
        from_bound: { value: 'country' },
        to_bound: { value: 'house' }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('DaData API error:', response.status, errorText);
      throw new Error(`DaData API returned ${response.status}`);
    }

    const data = await response.json();

    // Format suggestions
    const suggestions = (data.suggestions || []).map(formatSuggestion);

    // Check if any suggestion is international
    const hasInternational = suggestions.some(s => s.isInternational);

    return res.status(200).json({
      suggestions,
      isInternational: hasInternational
    });

  } catch (error) {
    console.error('Address suggestion error:', error);

    // Return empty suggestions on error (graceful degradation)
    return res.status(500).json({
      error: 'Failed to fetch address suggestions',
      message: error.message,
      suggestions: []
    });
  }
};

/**
 * Tracking Number Parser Utility
 *
 * Extracts tracking numbers from URLs and detects carrier (CDEK vs Pochta)
 * from tracking number format.
 */

/**
 * Pochta Russia tracking number patterns:
 * - Domestic: 14 digits (e.g., 80084123456789)
 * - International S10: 2 letters + 9 digits + 2 letters (e.g., RR123456789RU)
 * - EMS: starts with E (e.g., EA123456789RU)
 */
const POCHTA_PATTERNS = [
  /^[0-9]{14}$/,                           // 14-digit domestic
  /^[A-Z]{2}[0-9]{9}[A-Z]{2}$/i,          // S10 international format
  /^[0-9]{13}$/,                           // 13-digit format
  /^[0-9]{20}$/,                           // 20-digit barcode
];

/**
 * CDEK tracking number patterns:
 * - Typically 10-digit order numbers
 * - Can also be alphanumeric invoice numbers
 * - UUID format for API tracking
 */
const CDEK_PATTERNS = [
  /^[0-9]{10}$/,                           // 10-digit order number
  /^[A-Z0-9]{8,12}$/i,                     // Alphanumeric invoice
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, // UUID
];

/**
 * URL patterns for extracting tracking numbers
 */
const URL_PATTERNS = {
  pochta: [
    /pochta\.ru\/tracking#([A-Z0-9]+)/i,
    /pochta\.ru\/tracking\?barcode=([A-Z0-9]+)/i,
    /tracking\.pochta\.ru.*barcode=([A-Z0-9]+)/i,
  ],
  cdek: [
    /cdek\.ru\/ru\/tracking\?order_id=([A-Z0-9-]+)/i,
    /cdek\.ru\/tracking\?order_id=([A-Z0-9-]+)/i,
    /cdek\.ru.*order_id=([A-Z0-9-]+)/i,
  ]
};

/**
 * Parse tracking input (URL or number) and extract tracking number
 * @param {string} input - URL or tracking number
 * @returns {{ trackingNumber: string, provider: string|null, trackingUrl: string|null }}
 */
function parseTrackingInput(input) {
  if (!input || typeof input !== 'string') {
    return { trackingNumber: null, provider: null, trackingUrl: null };
  }

  const trimmed = input.trim();

  // Check if it's a URL
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.includes('.ru/')) {
    return parseTrackingUrl(trimmed);
  }

  // It's a tracking number - detect provider
  return parseTrackingNumber(trimmed);
}

/**
 * Extract tracking number from URL
 * @param {string} url - Tracking URL
 * @returns {{ trackingNumber: string, provider: string|null, trackingUrl: string }}
 */
function parseTrackingUrl(url) {
  // Try Pochta URL patterns
  for (const pattern of URL_PATTERNS.pochta) {
    const match = url.match(pattern);
    if (match && match[1]) {
      const trackingNumber = match[1].toUpperCase();
      return {
        trackingNumber,
        provider: 'pochta',
        trackingUrl: `https://www.pochta.ru/tracking#${trackingNumber}`
      };
    }
  }

  // Try CDEK URL patterns
  for (const pattern of URL_PATTERNS.cdek) {
    const match = url.match(pattern);
    if (match && match[1]) {
      const trackingNumber = match[1];
      return {
        trackingNumber,
        provider: 'cdek',
        trackingUrl: `https://www.cdek.ru/ru/tracking?order_id=${trackingNumber}`
      };
    }
  }

  // URL not recognized - try to extract any alphanumeric sequence after # or =
  const hashMatch = url.match(/#([A-Z0-9]+)$/i);
  if (hashMatch) {
    const trackingNumber = hashMatch[1].toUpperCase();
    const result = parseTrackingNumber(trackingNumber);
    return { ...result, trackingUrl: url };
  }

  const paramMatch = url.match(/[?&](?:order_id|barcode|track)=([A-Z0-9-]+)/i);
  if (paramMatch) {
    const trackingNumber = paramMatch[1];
    const result = parseTrackingNumber(trackingNumber);
    return { ...result, trackingUrl: url };
  }

  // Return the URL as-is, couldn't parse
  return { trackingNumber: null, provider: null, trackingUrl: url };
}

/**
 * Detect provider from tracking number format
 * @param {string} trackingNumber - Tracking number
 * @returns {{ trackingNumber: string, provider: string|null, trackingUrl: string|null }}
 */
function parseTrackingNumber(trackingNumber) {
  if (!trackingNumber) {
    return { trackingNumber: null, provider: null, trackingUrl: null };
  }

  const cleaned = trackingNumber.trim().toUpperCase();

  // Check Pochta patterns first (more specific)
  for (const pattern of POCHTA_PATTERNS) {
    if (pattern.test(cleaned)) {
      return {
        trackingNumber: cleaned,
        provider: 'pochta',
        trackingUrl: `https://www.pochta.ru/tracking#${cleaned}`
      };
    }
  }

  // Check CDEK patterns
  for (const pattern of CDEK_PATTERNS) {
    if (pattern.test(cleaned)) {
      return {
        trackingNumber: cleaned,
        provider: 'cdek',
        trackingUrl: `https://www.cdek.ru/ru/tracking?order_id=${cleaned}`
      };
    }
  }

  // Unknown format - return number without provider detection
  // Could be either, will need to use delivery_type from order
  return {
    trackingNumber: cleaned,
    provider: null,
    trackingUrl: null
  };
}

/**
 * Get tracking URL for a known provider and tracking number
 * @param {string} provider - 'pochta' or 'cdek'
 * @param {string} trackingNumber - Tracking number
 * @returns {string|null}
 */
function getTrackingUrl(provider, trackingNumber) {
  if (!trackingNumber) return null;

  switch (provider) {
    case 'pochta':
      return `https://www.pochta.ru/tracking#${trackingNumber}`;
    case 'cdek':
      return `https://www.cdek.ru/ru/tracking?order_id=${trackingNumber}`;
    default:
      return null;
  }
}

/**
 * Determine provider from delivery_type field
 * @param {string} deliveryType - Order's delivery_type value
 * @returns {string|null}
 */
function getProviderFromDeliveryType(deliveryType) {
  if (!deliveryType) return null;

  if (deliveryType.startsWith('cdek')) return 'cdek';
  if (deliveryType.startsWith('pochta') || deliveryType === 'courier_ems') return 'pochta';

  return null;
}

/**
 * Get display name for provider
 * @param {string} provider - 'pochta' or 'cdek'
 * @returns {string}
 */
function getProviderDisplayName(provider) {
  switch (provider) {
    case 'pochta':
      return 'Почта России';
    case 'cdek':
      return 'СДЭК';
    default:
      return provider || 'Неизвестно';
  }
}

module.exports = {
  parseTrackingInput,
  parseTrackingUrl,
  parseTrackingNumber,
  getTrackingUrl,
  getProviderFromDeliveryType,
  getProviderDisplayName,
  POCHTA_PATTERNS,
  CDEK_PATTERNS
};

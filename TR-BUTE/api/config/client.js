/**
 * Client Config Endpoint
 * GET /api/config/client - Returns client-safe configuration values
 *
 * This endpoint returns configuration values that are safe to expose to the frontend.
 * Sensitive values like API secrets are NOT included.
 */

module.exports = async function handler(req, res) {
  // Allow GET only
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Return client-safe config
  const config = {
    // Yandex Maps API key (for CDEK widget map)
    yandexMapsApiKey: process.env.YANDEX_MAPS_API_KEY || null,

    // DaData API key (for address suggestions - public token only)
    dadataToken: process.env.DADATA_API_KEY || null,

    // Custom product ID (for "create your own" feature)
    customProductId: 1,

    // T-Bank terminal key (public, used by SpeedPay frontend SDK)
    tbankTerminalKey: process.env.TBANK_TERMINAL_KEY || null
  };

  return res.status(200).json({
    success: true,
    config
  });
};

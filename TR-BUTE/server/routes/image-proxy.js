/**
 * Image Proxy Route
 *
 * Proxies external images (especially VK CDN) through the server to bypass
 * browser tracking protection that blocks third-party resources in Incognito mode.
 *
 * Usage: /api/img?url=<encoded_url>
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

// Allowed domains for proxying (security measure)
const ALLOWED_DOMAINS = [
  'userapi.com',      // VK CDN
  'vk.com',           // VK
  'vk.me',            // VK
  'sun1-88.userapi.com',
  'sun9-88.userapi.com',
];

/**
 * Check if domain is allowed for proxying
 * @param {string} hostname - The hostname to check
 * @returns {boolean}
 */
function isDomainAllowed(hostname) {
  return ALLOWED_DOMAINS.some(domain =>
    hostname === domain || hostname.endsWith('.' + domain)
  );
}

/**
 * Image proxy handler
 * @param {express.Request} req
 * @param {express.Response} res
 */
async function imageProxyHandler(req, res) {
  const imageUrl = req.query.url;

  if (!imageUrl) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(imageUrl);
  } catch (e) {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  // Security: Only allow certain domains
  if (!isDomainAllowed(parsedUrl.hostname)) {
    return res.status(403).json({ error: 'Domain not allowed for proxying' });
  }

  // Only allow http/https
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return res.status(400).json({ error: 'Invalid protocol' });
  }

  const protocol = parsedUrl.protocol === 'https:' ? https : http;

  const proxyReq = protocol.get(imageUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9,ru;q=0.8',
      'Referer': 'https://vk.com/',
    },
    timeout: 10000,
  }, (proxyRes) => {
    // Forward relevant headers
    const contentType = proxyRes.headers['content-type'];
    const contentLength = proxyRes.headers['content-length'];

    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }

    // Cache for 1 day
    res.setHeader('Cache-Control', 'public, max-age=86400');

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');

    res.status(proxyRes.statusCode);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('[Image Proxy] Error:', err.message);
    res.status(502).json({ error: 'Failed to fetch image' });
  });

  proxyReq.on('timeout', () => {
    proxyReq.destroy();
    res.status(504).json({ error: 'Image fetch timeout' });
  });
}

module.exports = imageProxyHandler;

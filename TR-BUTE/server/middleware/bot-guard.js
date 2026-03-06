/**
 * Bot Guard Middleware
 *
 * Detects and blocks automated scraping tools, headless browsers,
 * and known bot User-Agents from accessing API endpoints.
 *
 * Layers:
 * 1. Known bot User-Agent blocking (scrapers, crawlers)
 * 2. Headless browser detection (missing or suspicious headers)
 * 3. Rapid-fire request pattern detection (per-IP sliding window)
 */

const rateLimit = require('express-rate-limit');
const { isAdminRequest } = require('./is-admin-request');

// ============ KNOWN BOT USER-AGENTS ============
// Patterns that indicate automated scraping tools, not legitimate browsers
const BLOCKED_UA_PATTERNS = [
  // Scraping frameworks
  /scrapy/i,
  /python-requests/i,
  /python-urllib/i,
  /java\//i,
  /httpclient/i,
  /go-http-client/i,
  /node-fetch/i,
  /axios/i,
  /wget/i,
  /curl/i,
  /libwww-perl/i,
  /mechanize/i,
  /php\//i,
  /pycurl/i,
  /httpie/i,
  /rest-client/i,

  // SEO/marketing crawlers
  /ahrefsbot/i,
  /semrushbot/i,
  /mj12bot/i,
  /dotbot/i,
  /blexbot/i,
  /petalbot/i,
  /megaindex/i,
  /bytespider/i,
  /zoominfobot/i,
  /seznambot/i,

  // AI training crawlers
  /gptbot/i,
  /ccbot/i,
  /anthropic-ai/i,
  /claudebot/i,
  /cohere-ai/i,
  /google-extended/i,

  // Generic bot indicators
  /spider/i,
  /crawler/i,
  /scraper/i,
  /bot(?:[\s/;]|$)/i,

  // Headless browser tools
  /phantomjs/i,
  /headlesschrome/i,
  /selenium/i,
  /puppeteer/i,
  /playwright/i,
];

// User-Agents that are legitimate and should NOT be blocked
// even if they match generic patterns (e.g., "bot" in "Googlebot")
const ALLOWED_UA_PATTERNS = [
  /telegrambot/i,     // Telegram link previews
  /googlebot/i,       // Google (separate from Google-Extended)
  /bingbot/i,         // Bing search
  /yandexbot/i,       // Yandex search
  /tbank/i,           // T-Bank payment callbacks
  /cdek/i,            // CDEK shipping callbacks
];

/**
 * Check if a User-Agent string belongs to a known scraper/bot
 */
function isBlockedBot(userAgent) {
  if (!userAgent) return true; // No UA = suspicious

  // Check allowlist first
  for (const pattern of ALLOWED_UA_PATTERNS) {
    if (pattern.test(userAgent)) return false;
  }

  // Check blocklist
  for (const pattern of BLOCKED_UA_PATTERNS) {
    if (pattern.test(userAgent)) return true;
  }

  return false;
}

/**
 * Detect headless browsers via header analysis.
 * Real browsers send a consistent set of headers; headless tools often don't.
 */
function isHeadlessBrowser(req) {
  const ua = req.headers['user-agent'] || '';

  // HeadlessChrome identifier
  if (/HeadlessChrome/i.test(ua)) return true;

  // Phantom.js
  if (/PhantomJS/i.test(ua)) return true;

  // Missing Accept-Language is suspicious for browser requests
  // (not for API-to-API calls, which skip this middleware)
  if (!req.headers['accept-language'] && !req.headers['x-telegram-init-data']) {
    // Only flag if they claim to be a browser
    if (/mozilla/i.test(ua) && !req.headers['accept']) {
      return true;
    }
  }

  return false;
}

// ============ MIDDLEWARE EXPORTS ============

/**
 * Main bot guard middleware for API routes.
 * Blocks known scrapers and headless browsers.
 * Skips webhook endpoints that receive legitimate server-to-server traffic.
 */
function botGuard(req, res, next) {
  // Skip webhook endpoints - these are server-to-server calls
  if (req.path.startsWith('/webhooks') ||
      req.path === '/payment/webhook' ||
      req.path === '/payment/tbank/webhook' ||
      req.path.startsWith('/cron/')) {
    return next();
  }

  const userAgent = req.headers['user-agent'] || '';

  if (isBlockedBot(userAgent)) {
    console.warn(`[Bot Guard] Blocked bot: ${userAgent.substring(0, 100)} | IP: ${req.ip} | Path: ${req.path}`);
    return res.status(403).json({ error: 'Access denied' });
  }

  if (isHeadlessBrowser(req)) {
    console.warn(`[Bot Guard] Blocked headless browser: ${userAgent.substring(0, 100)} | IP: ${req.ip}`);
    return res.status(403).json({ error: 'Access denied' });
  }

  next();
}

/**
 * Stricter rate limiter for public data endpoints most targeted by scrapers.
 * Applied to product listings, search, and catalog endpoints.
 *
 * 30 requests per minute per IP — generous for real users browsing products,
 * but catches automated enumeration.
 */
const scrapingLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  message: { error: 'Too many requests, please slow down' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
  skip: (req) => isAdminRequest(req)
});

module.exports = { botGuard, scrapingLimiter };

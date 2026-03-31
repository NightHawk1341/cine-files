/**
 * Bot & scraper protection middleware.
 * Ported from TR-BUTE bot-guard.js — adapted for CineFiles context.
 *
 * 3 layers:
 * 1. Block known malicious bot/scraper user agents
 * 2. Allow legitimate bots (search engines, social crawlers, partner sites)
 * 3. Detect headless browsers
 */

// Known malicious / scraping UAs (case-insensitive match)
var BLOCKED_UA_PATTERNS = [
  'scrapy',
  'python-requests',
  'python-urllib',
  'go-http-client',
  'java/',
  'libwww-perl',
  'wget',
  'curl/',
  'httpie',
  'lwp-trivial',
  'php/',
  'pycurl',
  'aiohttp',
  'node-fetch',
  'undici',
  'gptbot',
  'chatgpt',
  'ccbot',
  'anthropic',
  'claudebot',
  'bytespider',
  'semrushbot',
  'ahrefsbot',
  'dotbot',
  'mj12bot',
  'blexbot',
  'dataforseo',
  'serpstatbot',
  'petalbot',
  'zoominfobot',
  'seekport',
  'megaindex',
  'rogerbot',
  'linkfluence',
  'webdatastats',
  'headlesschrome',
  'phantomjs',
  'playwright',
  'puppeteer',
  'selenium',
  'webdriver',
];

// Legitimate bots that should be allowed through
var ALLOWED_BOT_PATTERNS = [
  'googlebot',
  'google-inspectiontool',
  'bingbot',
  'yandexbot',
  'yandexmobilebot',
  'yandexaccessibilitybot',
  'yandexmetrika',
  'duckduckbot',
  'baiduspider',
  'twitterbot',
  'facebookexternalhit',
  'telegrambot',
  'whatsapp',
  'linkedinbot',
  'pinterestbot',
  'slackbot',
  'discordbot',
  'applebot',
  'tribute',   // Sister project TR-BUTE
  'cinefiles',  // Self-referencing
  'uptimerobot',
  'pingdom',
];

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function botGuard(req, res, next) {
  // Skip health check and cron endpoints
  if (req.path === '/api/health' || req.path.startsWith('/api/cron/')) {
    return next();
  }

  var ua = (req.headers['user-agent'] || '').toLowerCase();

  // No user agent at all — suspicious but allow (some legit clients omit it)
  if (!ua) {
    return next();
  }

  // Layer 2: Allow legitimate bots first
  for (var i = 0; i < ALLOWED_BOT_PATTERNS.length; i++) {
    if (ua.indexOf(ALLOWED_BOT_PATTERNS[i]) !== -1) {
      return next();
    }
  }

  // Layer 1: Block known malicious bots
  for (var j = 0; j < BLOCKED_UA_PATTERNS.length; j++) {
    if (ua.indexOf(BLOCKED_UA_PATTERNS[j]) !== -1) {
      return res.status(403).json({ error: 'Forbidden' });
    }
  }

  // Layer 3: Headless browser detection
  var acceptLang = req.headers['accept-language'];
  if (!acceptLang && ua.indexOf('mozilla') !== -1) {
    // Real browsers always send Accept-Language
    return res.status(403).json({ error: 'Forbidden' });
  }

  next();
}

module.exports = botGuard;

require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const { botGuard, scrapingLimiter } = require('./server/middleware/bot-guard');
const { isAdminRequest } = require('./server/middleware/is-admin-request');
const auth = require('./auth');
const { getPool } = require('./lib/db');
const config = require('./lib/config');
const { initRedis } = require('./lib/session-store');

// ============ EXPRESS SETUP ============

const app = express();
const PORT = config.port;

// ============ SECURITY HEADERS ============
// Helmet helps secure Express apps by setting various HTTP headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        // SECURITY: unsafe-inline is required for Telegram Web App SDK (injects inline scripts),
        // VK Bridge SDK initialization, and runtime inline styles across components.
        // Consider nonce-based CSP when Telegram SDK adds support.
        "'unsafe-inline'",
        "'unsafe-eval'", // Required for TensorFlow.js JIT compilation
        "'wasm-unsafe-eval'", // Required for TensorFlow.js WebAssembly
        "https://telegram.org",
        "https://unpkg.com", // VK Bridge SDK (@vkontakte/vk-bridge)
        "https://cdnjs.cloudflare.com",
        "https://cdn.jsdelivr.net",
        "https://widget.cdek.ru", // CDEK widget
        "https://widget.pochta.ru", // Pochta widget
        "https://ecom.pochta.ru", // Pochta ecom widget
        "https://integrationjs.tbank.ru", // T-Bank payment integration
        "https://securepay.tinkoff.ru", // T-Bank payment form
        "https://*.tbank.ru", // T-Bank domains
        "https://*.tinkoff.ru", // T-Bank legacy domains
        "https://*.tcsbank.ru", // T-Bank internal domains
        "https://api-maps.yandex.ru", // Yandex Maps (for widgets)
        "https://*.api-maps.yandex.ru", // Yandex Maps subdomains (csp=202512)
        "https://suggest-maps.yandex.ru", // Yandex Maps suggestions (csp=202512)
        "https://yandex.ru",
        "https://yastatic.net", // Yandex Maps static assets
        "https://*.yastatic.net",
        "https://*.maps.yandex.net", // Yandex Maps tiles (dynamic scripts)
        "https://st.max.ru" // Max.ru web app SDK
      ],
      // Allow inline event handlers (onclick, etc.) - inherits from scriptSrc
      scriptSrcAttr: ["'unsafe-inline'"],
      workerSrc: [
        "'self'",
        "data:",
        "blob:",
        "https://api-maps.yandex.ru", // Yandex Maps workers (csp=202512)
        "https://*.api-maps.yandex.ru",
        "https://yastatic.net"
      ],
      styleSrc: [
        "'self'",
        "'unsafe-inline'", // Required for inline styles
        "https://cdn.jsdelivr.net", // CDEK widget styles
        "https://widget.pochta.ru",
        "https://api-maps.yandex.ru", // Yandex Maps styles (csp=202512)
        "https://*.api-maps.yandex.ru", // Yandex Maps subdomains (csp=202512)
        "https://yastatic.net", // Yandex Maps styles
        "https://*.yastatic.net"
      ],
      fontSrc: [
        "'self'",
        "https://widget.pochta.ru", // Pochta widget fonts
        "https://fonts.gstatic.com"
      ],
      imgSrc: [
        "'self'",
        "data:",
        "blob:",
        "https://*.supabase.co",
        "https://*.supabase.in",
        "https://placeholder.com",
        "https://*.userapi.com",
        "https://avatars.yandex.net",
        "https://*.yandex.net",
        "https://t.me",
        "https://*.t.me",
        "https://api.telegram.org", // Telegram profile images
        "https://*.telegram.org", // Telegram subdomains
        "https://*.telegram-cdn.org", // Telegram CDN
        "https://*.telesco.pe", // Telegram CDN (alternative domain)
        "https://vk.com",
        "https://*.vk.com",
        "https://*.openstreetmap.org", // CDEK widget map tiles
        "https://*.tile.openstreetmap.org",
        "https://www.svgrepo.com", // CDEK widget icons
        "https://*.svgrepo.com",
        "https://widget.pochta.ru",
        "https://ecom.pochta.ru",
        "https://yastatic.net", // Yandex Maps images
        "https://*.yastatic.net",
        "https://*.maps.yandex.net", // Yandex Maps tile images
        "https://api-maps.yandex.ru", // Yandex Maps API images
        "https://*.api-maps.yandex.ru", // Yandex Maps subdomains (csp=202512)
        "https://yandex.ru", // Yandex counter/tracking pixels
        "https://cdn.jsdelivr.net", // intl-tel-input flag icons
        "https://storage.yandexcloud.net", // csp=202603 Yandex S3 cert images
        "https://*.public.blob.vercel-storage.com" // csp=202603 Vercel Blob cert images
      ],
      connectSrc: [
        "'self'",
        "https://api.telegram.org",
        "https://*.supabase.co",
        "https://*.supabase.in",
        "https://api.cdek.ru",
        "https://*.cdek.ru", // CDEK widget API
        "https://securepay.tinkoff.ru", // T-Bank payment API
        "https://*.tbank.ru", // T-Bank domains
        "https://*.tinkoff.ru", // T-Bank legacy domains
        "https://*.tcsbank.ru", // T-Bank internal domains
        "https://suggestions.dadata.ru", // DaData address suggestions
        "https://*.pochta.ru", // Pochta widget API
        "https://api-maps.yandex.ru",
        "https://*.api-maps.yandex.ru", // Yandex Maps subdomains (csp=202512)
        "https://suggest-maps.yandex.ru", // Yandex Maps suggestions (csp=202512)
        "https://search-maps.yandex.ru", // Yandex Maps search (csp=202512)
        "https://api.routing.yandex.net", // Yandex Maps routing (csp=202512)
        "https://*.yandex.ru",
        "https://yastatic.net",
        "https://*.yastatic.net",
        "https://*.maps.yandex.net", // Yandex Maps tiles API
        "https://cdn.jsdelivr.net", // TensorFlow.js model weights
        "https://tfhub.dev", // TensorFlow Hub models
        "https://storage.googleapis.com", // TensorFlow model storage
        "https://www.kaggle.com", // Kaggle model storage
        "https://*.userapi.com", // VK CDN (psv4.userapi.com etc.)
        "https://vk.com", // VK API root domain (csp=202603)
        "https://*.vk.com", // VK API subdomains
        "https://storage.yandexcloud.net", // csp=202603 Yandex S3 cert images
        "https://*.public.blob.vercel-storage.com" // csp=202603 Vercel Blob cert images
      ],
      frameSrc: [
        "'self'",
        "https://securepay.tinkoff.ru", // T-Bank payment iframe
        "https://*.tbank.ru", // T-Bank domains
        "https://*.tinkoff.ru", // T-Bank legacy domains
        "https://*.tcsbank.ru", // T-Bank internal domains
        "https://*.nspk.ru", // National Payment Card System (SBP)
        "https://widget.pochta.ru", // Pochta widget iframe
        "https://ecom.pochta.ru",
        "https://oauth.telegram.org" // Telegram login widget OAuth iframe (csp=202603)
      ],
      frameAncestors: [
        "'self'",
        "https://vk.com",
        "https://*.vk.com",
        "https://vk.ru",
        "https://*.vk.ru"
      ],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: config.isProduction ? [] : null
    }
  },
  // Disable X-Frame-Options so frame-ancestors CSP takes precedence (VK Mini App runs in iframe)
  frameguard: false,
  crossOriginEmbedderPolicy: false, // Required for external resources
  crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" }, // For OAuth popups
  crossOriginResourcePolicy: { policy: "cross-origin" }, // For Supabase images
  // HSTS - enforce HTTPS
  strictTransportSecurity: config.isProduction ? {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  } : false,
  // Referrer-Policy: send origin only on cross-origin requests (csp=202603)
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  // X-Content-Type-Options: prevent MIME-type sniffing (csp=202603)
  xContentTypeOptions: true,
  // Permissions-Policy: restrict browser features to own origin (csp=202603)
  // camera=* allows AR view in mini app iframes; geolocation for delivery widgets
  permissionsPolicy: {
    features: {
      camera: ['self', '*'],           // AR view needs camera in Telegram/VK/Max iframes
      microphone: [],                  // Not used — blocked
      geolocation: ['self'],           // Delivery address widgets
      payment: ['self', '*'],          // T-Bank payment iframes
      gyroscope: ['self'],
      accelerometer: ['self'],
      magnetometer: [],                // Not used — blocked
      usb: [],                         // Not used — blocked
      midi: [],                        // Not used — blocked
      'display-capture': []            // Not used — blocked
    }
  }
}));

// ============ CORS CONFIGURATION ============
// CORS configuration - restrict to allowed origins
const corsOptions = {
  origin: function(origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc.)
    // Note: "null" string is sent when form is submitted from inline HTML response
    if (!origin || origin === 'null') return callback(null, true);

    // Build allowed origins list from config
    const allowedOrigins = [
      config.appUrl,
      'http://localhost:3000',
      'http://localhost:5173'
    ].filter(Boolean);

    // Add common Telegram Web App origins
    if (config.isTelegramMode) {
      allowedOrigins.push('https://web.telegram.org');
    }

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-telegram-init-data']
};
app.use(require('cors')(corsOptions));
app.use(require('cookie-parser')());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============ TEMPORARY SITE LOCK ============
// TODO: REMOVE THIS WHEN READY FOR PUBLIC ACCESS
// See /TODO_REMOVE_LOCKSCREEN.md for details
const { siteLockMiddleware, unlockHandler } = require('./server/middleware/site-lock');
app.use(siteLockMiddleware);
app.post('/__site_unlock', unlockHandler);
// ============ END SITE LOCK ============

// ============ HOTLINK PROTECTION ============
// Prevent external sites from embedding our images/assets directly (csp=202603)
const { hotlinkGuard } = require('./server/middleware/hotlink-guard');
app.use(hotlinkGuard);

app.use(compression());
app.use(express.static('public', { maxAge: '1d', etag: true }));

// ============ RATE LIMITING ============

// General rate limit for API endpoints
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip for webhook endpoints and verified admin requests
    return req.path.startsWith('/webhooks') ||
           req.path === '/payment/webhook' ||
           req.path === '/payment/tbank/webhook' ||
           isAdminRequest(req);
  }
});

// Strict rate limit for authentication endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // limit each IP to 20 login attempts per windowMs
  message: { error: 'Too many login attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});

// Very strict rate limit for sensitive operations
const sensitiveLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // limit each IP to 10 requests per hour
  message: { error: 'Too many requests for this operation, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});

// Apply general rate limiting to all API routes
app.use('/api', generalLimiter);

// Block known scrapers, bots, and headless browsers from API
app.use('/api', botGuard);

// Stricter rate limit for public data endpoints targeted by scrapers
app.use('/api/products', scrapingLimiter);
app.use('/api/catalogs', scrapingLimiter);
app.use('/api/all-images', scrapingLimiter);
app.use('/products', scrapingLimiter);

// Apply stricter rate limiting to auth endpoints
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/telegram', authLimiter);
app.use('/api/auth/yandex', authLimiter);
app.use('/api/admin/browser-login', authLimiter);

// Apply sensitive rate limiting to account deletion
app.use('/api/auth/delete-account', sensitiveLimiter);

// ============ CONFIGURATION ============

// Telegram Bot Configuration
const BOT_TOKEN = config.telegram.userBotToken;
const ADMIN_CHAT_ID = config.telegram.adminChatId;

if (!BOT_TOKEN || !ADMIN_CHAT_ID) {
  console.warn('Warning: BOT_TOKEN or ADMIN_CHAT_ID not set in environment variables');
}

// PostgreSQL Connection Pool (shared)
const pool = getPool();

// Debug logging (development only - never log credentials in production)
if (process.env.NODE_ENV !== 'production') {
  console.log('DATABASE_URL exists:', !!config.databaseUrl);
}

// ============ MIDDLEWARE ============

// Import authentication middleware
const authenticateToken = require('./server/middleware/authenticate');
const requireAdminAuth = require('./server/middleware/admin-auth');

// ============ MODULAR ROUTES ============

// Load custom emoji IDs from DB into memory at startup
const { loadCustomEmojisFromDB } = require('./lib/tg-emoji');
loadCustomEmojisFromDB(pool).catch(err => console.error('Custom emoji load failed:', err.message));

// Ensure orders table has tracking_history column (may be absent on older DB instances)
pool.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_history JSONB DEFAULT '[]'::jsonb")
  .catch(err => console.error('Migration check failed (tracking_history):', err.message));

// Ensure order_addresses table has actual_delivery_info column (added with Notion export feature)
pool.query("ALTER TABLE order_addresses ADD COLUMN IF NOT EXISTS actual_delivery_info TEXT")
  .catch(err => console.error('Migration check failed (actual_delivery_info):', err.message));

// Setup all modularized routes
const setupRoutes = require('./server/routes/index');
setupRoutes(app, {
  pool,
  auth,
  config,
  authenticateToken,
  requireAdminAuth
});

// ============ FEEDBACK SYSTEM ============
// All feedback endpoints (reviews, comments, suggestions, likes, responses)
// have been extracted to /server/routes/feedback.js and are mounted via setupRoutes()

// ============ EXPRESS ERROR HANDLER ============
// Catch any errors that weren't handled by route handlers
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[Express Error Handler]', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });
  res.status(500).json({ error: 'Internal Server Error' });
});

// ============ PROCESS ERROR HANDLERS ============
// Prevent crashes from unhandled errors

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Log to external service in production (e.g., Sentry)
  // In production, you may want to gracefully shutdown after logging
  if (process.env.NODE_ENV === 'production') {
    console.error('Server will continue running, but state may be inconsistent');
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Log to external service in production
});

// ============ SERVER STARTUP ============

// Initialize session store (Redis if available)
initRedis().then(() => {
  app.listen(PORT, () => {
    console.log(`Server started: http://localhost:${PORT}`);

    if (config.tbank.enabled) {
      console.log('\nT-Bank Payment Integration:');
      console.log(`   Webhook URL: ${config.appUrl}/api/payment/tbank/webhook`);
      console.log('   Configure this URL in your T-Bank terminal settings\n');
    }
  });
}).catch(err => {
  console.error('Failed to initialize Redis:', err);
  // Start server anyway with in-memory fallback
  app.listen(PORT, () => {
    console.log(`Server started: http://localhost:${PORT} (with in-memory session store)`);
  });
});

// Graceful shutdown handler
const gracefulShutdown = async (signal) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  try {
    await pool.end();
    console.log('Connections closed');
    process.exit(0);
  } catch (err) {
    console.error('Error during shutdown:', err);
    process.exit(1);
  }
};

// Handle both SIGINT (Ctrl+C) and SIGTERM (container termination)
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

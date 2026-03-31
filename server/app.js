const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { config } = require('../lib/config');
const { getPool } = require('../lib/db');
const { setupRoutes } = require('./routes/index');
const { authenticateToken } = require('./middleware/auth');
const botGuard = require('./middleware/bot-guard');

const app = express();

// Trust first proxy (Yandex Cloud LB / Vercel edge) so req.ip is correct for rate limiting
app.set('trust proxy', 1);

// ============================================================
// Read index.html template once at startup for nonce injection
// ============================================================
var indexHtmlTemplate = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'index.html'),
  'utf8'
);

// ============================================================
// Nonce middleware — generate per-request nonce for CSP
// ============================================================
app.use(function (req, res, next) {
  res.locals.nonce = crypto.randomBytes(16).toString('base64');
  next();
});

// ============================================================
// Security
// ============================================================
app.use(function (req, res, next) {
  var nonce = res.locals.nonce;
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'nonce-" + nonce + "'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https://storage.yandexcloud.net', 'https://cdn.cinefiles-txt.com', 'https://*.userapi.com', 'https://cdn.buy-tribute.com', 'https://buy-tribute.com'], // csp=202603
        mediaSrc: ["'self'", 'https://storage.yandexcloud.net'],
        frameSrc: ['https://www.youtube.com', 'https://vk.com', 'https://rutube.ru'],
        connectSrc: ["'self'", 'https://api.themoviedb.org', 'https://*.supabase.co', 'https://buy-tribute.com'],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"], // SEC-2
        workerSrc: ["'self'"],
        frameAncestors: ["'self'"],
      },
    },
    hsts: config.isProd ? {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    } : false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  })(req, res, next);
});

// ============================================================
// Permissions-Policy header (SEC-10)
// ============================================================
app.use(function (req, res, next) {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), midi=()');
  next();
});

// ============================================================
// Bot & scraper protection (SEC-4)
// ============================================================
app.use(botGuard);

// ============================================================
// CORS (SEC-8: function-based validation with blocked-origin logging)
// ============================================================
var allowedOrigins = [
  config.appUrl,
  config.tribute.apiUrl.replace(/\/api\/?$/, ''),
  'http://localhost:3000',
  'http://localhost:5173',
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.warn('CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

// ============================================================
// Parsing & Compression
// ============================================================
app.use(compression());
app.use(express.json({
  limit: '10mb',
  // SEC-3: Prototype pollution protection
  reviver: function (key, value) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      return undefined;
    }
    return value;
  },
}));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ============================================================
// Rate Limiting
// ============================================================
var generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 150, // SEC-5: lowered from 300
  standardHeaders: true,
  legacyHeaders: false,
});

var authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

// SEC-6: Sensitive operations rate limiter (account deletion)
var sensitiveLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

// SEC-7: Cross-site integration endpoints (called by TR-BUTE) — lowered from 600
var crossSiteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 150,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/auth/', authLimiter);
app.use('/api/users/me', sensitiveLimiter); // SEC-6: covers DELETE /api/users/me
app.use('/api/articles/related', crossSiteLimiter);
app.use('/api/tribute/', crossSiteLimiter);
app.use('/api/', generalLimiter);

// ============================================================
// Auth middleware (parses token on every request, does not reject)
// ============================================================
app.use(authenticateToken);

// ============================================================
// Static files
// ============================================================
app.use(express.static(path.join(__dirname, '..', 'public'), {
  etag: true,
  index: false, // Disable automatic index.html serving — we handle it with nonce injection
  setHeaders(res, filePath) {
    if (filePath.endsWith('.js') || filePath.endsWith('.css') || filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=86400');
    }
  },
}));

// ============================================================
// API Routes
// ============================================================
var pool = getPool();
setupRoutes(app, { pool: pool, config: config });

// ============================================================
// SPA fallback — serve index.html with nonce injection for all non-API, non-static routes
// ============================================================
app.get('*', function (req, res) {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  var nonce = res.locals.nonce;
  var html = indexHtmlTemplate.replace(/%%CSP_NONCE%%/g, nonce);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.send(html);
});

// ============================================================
// Error handling
// ============================================================
app.use(function (err, req, res, _next) {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;

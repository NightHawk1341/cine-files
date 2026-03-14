const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const path = require('path');
const { config, validateConfig } = require('./lib/config');
const { getPool, closePool } = require('./lib/db');
const { setupRoutes } = require('./server/routes/index');
const { authenticateToken } = require('./server/middleware/auth');

validateConfig();

const app = express();

// ============================================================
// Security
// ============================================================
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https://storage.yandexcloud.net', 'https://*.userapi.com'],
      mediaSrc: ["'self'", 'https://storage.yandexcloud.net'],
      frameSrc: ['https://www.youtube.com', 'https://vk.com', 'https://rutube.ru'],
      connectSrc: ["'self'", 'https://api.themoviedb.org', 'https://*.supabase.co', 'https://buy-tribute.com'],
      fontSrc: ["'self'"],
    },
  },
}));

// ============================================================
// CORS
// ============================================================
app.use(cors({
  origin: [
    config.appUrl,
    'http://localhost:3000',
    'http://localhost:5173',
  ],
  credentials: true,
}));

// ============================================================
// Parsing & Compression
// ============================================================
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ============================================================
// Rate Limiting
// ============================================================
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', generalLimiter);
app.use('/api/auth/', authLimiter);

// ============================================================
// Auth middleware (parses token on every request, does not reject)
// ============================================================
app.use(authenticateToken);

// ============================================================
// Static files
// ============================================================
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: config.isProd ? '1d' : 0,
}));

// ============================================================
// API Routes
// ============================================================
const pool = getPool();
setupRoutes(app, { pool, config });

// ============================================================
// SPA fallback — serve index.html for all non-API, non-static routes
// ============================================================
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================================
// Error handling
// ============================================================
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ============================================================
// Start server
// ============================================================
const PORT = config.port;

app.listen(PORT, () => {
  console.log(`CineFiles server running on port ${PORT}`);
});

// ============================================================
// Graceful shutdown
// ============================================================
async function shutdown() {
  console.log('Shutting down...');
  await closePool();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  shutdown();
});

module.exports = app;

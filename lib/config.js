/**
 * Throws if a required env var is missing.
 * @param {string} name
 * @returns {string}
 */
function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Returns env var or default value.
 * @param {string} name
 * @param {string} [defaultValue='']
 * @returns {string}
 */
function getEnv(name, defaultValue = '') {
  return process.env[name] || defaultValue;
}

/**
 * Returns env var parsed as integer, or default.
 * @param {string} name
 * @param {number} defaultValue
 * @returns {number}
 */
function getEnvInt(name, defaultValue) {
  const val = process.env[name];
  if (!val) return defaultValue;
  const parsed = parseInt(val, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Returns env var parsed as boolean, or default.
 * @param {string} name
 * @param {boolean} defaultValue
 * @returns {boolean}
 */
function getEnvBool(name, defaultValue) {
  const val = process.env[name];
  if (!val) return defaultValue;
  return val === 'true' || val === '1';
}

const config = {
  env: getEnv('NODE_ENV', 'development'),
  port: getEnvInt('PORT', 3000),
  appUrl: getEnv('APP_URL', 'http://localhost:3000'),
  isDev: process.env.NODE_ENV !== 'production',
  isProd: process.env.NODE_ENV === 'production',

  db: {
    url: getEnv('DATABASE_URL', ''),
  },

  auth: {
    jwtSecret: getEnv('JWT_SECRET', 'dev-secret-change-me'),
    sessionSecret: getEnv('SESSION_SECRET', 'dev-session-secret'),
    accessTokenExpiry: '7d',
    refreshTokenExpiry: 30, // days
  },

  yandexOAuth: {
    clientId: getEnv('YANDEX_CLIENT_ID', ''),
    clientSecret: getEnv('YANDEX_CLIENT_SECRET', ''),
  },

  vkOAuth: {
    clientId: getEnv('VK_CLIENT_ID', ''),
    clientSecret: getEnv('VK_CLIENT_SECRET', ''),
  },

  telegram: {
    botToken: getEnv('TELEGRAM_BOT_TOKEN', ''),
    botId: getEnv('TELEGRAM_BOT_ID', ''),
  },

  s3: {
    endpoint: getEnv('YANDEX_S3_ENDPOINT', 'https://storage.yandexcloud.net'),
    region: getEnv('YANDEX_S3_REGION', 'ru-central1'),
    bucket: getEnv('YANDEX_S3_BUCKET', 'cinefiles-media'),
    accessKey: getEnv('YANDEX_S3_ACCESS_KEY', ''),
    secretKey: getEnv('YANDEX_S3_SECRET_KEY', ''),
  },

  tmdb: {
    apiKey: getEnv('TMDB_API_KEY', ''),
    proxyUrl: getEnv('TMDB_PROXY_URL', 'https://cine-files.vercel.app/api/tmdb'),
    proxySecret: getEnv('TMDB_PROXY_SECRET', ''),
  },

  tribute: {
    apiUrl: getEnv('TRIBUTE_API_URL', 'https://buy-tribute.com/api'),
  },

  cron: {
    secret: getEnv('CRON_SECRET', ''),
  },

  redis: {
    url: getEnv('REDIS_URL', ''),
  },
};

/**
 * Validate critical config in production.
 */
function validateConfig() {
  if (config.isProd) {
    if (!config.db.url) throw new Error('DATABASE_URL is required in production');
    if (config.auth.jwtSecret === 'dev-secret-change-me') {
      throw new Error('JWT_SECRET must be set in production');
    }
  }
}

module.exports = { config, requireEnv, getEnv, getEnvInt, getEnvBool, validateConfig };

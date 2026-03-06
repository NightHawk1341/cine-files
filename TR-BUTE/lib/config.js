/**
 * Application Configuration Module
 * Centralized environment variable management with validation
 *
 * All environment variables are set in Vercel project settings
 * This module provides validation, type safety, and centralized access
 */

/**
 * Validate that a required environment variable exists
 * @param {string} name - Environment variable name
 * @returns {string} The environment variable value
 * @throws {Error} If variable is missing
 */
function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`❌ Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Get environment variable with optional default
 * @param {string} name - Environment variable name
 * @param {string} defaultValue - Default value if not set
 * @returns {string} The environment variable value or default
 */
function getEnv(name, defaultValue = '') {
  return process.env[name] || defaultValue;
}

/**
 * Parse integer from environment variable
 * @param {string} name - Environment variable name
 * @param {number} defaultValue - Default value if not set or invalid
 * @returns {number} Parsed integer value
 */
function getEnvInt(name, defaultValue) {
  const value = process.env[name];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Parse boolean from environment variable
 * @param {string} name - Environment variable name
 * @param {boolean} defaultValue - Default value if not set
 * @returns {boolean} Boolean value
 */
function getEnvBool(name, defaultValue = false) {
  const value = process.env[name];
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

/**
 * Detect deployment mode based on APP_URL or AUTH_MODE environment variable
 * @returns {'telegram'|'yandex'} The deployment mode
 */
function detectDeploymentMode() {
  // Explicit AUTH_MODE takes precedence
  const authMode = process.env.AUTH_MODE;
  if (authMode === 'telegram' || authMode === 'yandex') {
    return authMode;
  }

  // Auto-detect from APP_URL
  const appUrl = process.env.APP_URL;
  if (appUrl) {
    if (appUrl.includes('vercel.app')) {
      return 'telegram';
    }
    if (appUrl.includes('buy-tribute.com')) {
      return 'yandex';
    }
  }

  // Default to telegram for development
  return 'telegram';
}

// Detect deployment mode early
const deploymentMode = detectDeploymentMode();

// Application Configuration Object
const config = {
  // Environment
  nodeEnv: getEnv('NODE_ENV', 'development'),
  isDevelopment: process.env.NODE_ENV !== 'production',
  isProduction: process.env.NODE_ENV === 'production',

  // Deployment Mode (telegram or yandex)
  deploymentMode,
  isTelegramMode: deploymentMode === 'telegram',
  isYandexMode: deploymentMode === 'yandex',

  // Server
  port: getEnvInt('PORT', 3000),
  appUrl: getEnv('APP_URL', 'http://localhost:3000'),

  // Database
  databaseUrl: getEnv('DATABASE_URL', ''),

  // JWT Authentication
  jwt: {
    secret: getEnv('JWT_SECRET') || getEnv('SESSION_SECRET'),
  },

  // Authentication Configuration (based on deployment mode)
  auth: {
    telegram: {
      userBotToken: getEnv('USER_BOT_TOKEN') || getEnv('BOT_TOKEN'),
      adminBotToken: getEnv('ADMIN_BOT_TOKEN'),
      adminChatId: getEnv('ADMIN_CHAT_ID'),
      enabled: deploymentMode === 'telegram' && !!(getEnv('USER_BOT_TOKEN') || getEnv('BOT_TOKEN'))
    },
    yandex: {
      clientId: process.env.YANDEX_CLIENT_ID,
      clientSecret: process.env.YANDEX_CLIENT_SECRET,
      redirectUri: process.env.APP_URL ? `${process.env.APP_URL}/auth/yandex/callback` : null,
      enabled: deploymentMode === 'yandex' && !!(process.env.YANDEX_CLIENT_ID && process.env.YANDEX_CLIENT_SECRET)
    },
    vk: {
      clientId: process.env.VK_CLIENT_ID,
      clientSecret: process.env.VK_CLIENT_SECRET,
      redirectUri: process.env.APP_URL ? `${process.env.APP_URL}/auth/vk/callback` : null,
      // VK ID OAuth is only used on Yandex Cloud; VK Mini App uses vk_user_id instead
      enabled: deploymentMode === 'yandex' && !!(process.env.VK_CLIENT_ID && process.env.VK_CLIENT_SECRET)
    }
  },

  // Notification Mode (based on deployment mode)
  notificationMode: deploymentMode === 'telegram' ? 'telegram' : 'email',

  // T-Bank Payment Gateway (EACQ)
  tbank: {
    terminalKey: process.env.TBANK_TERMINAL_KEY,
    password: process.env.TBANK_PASSWORD,
    enabled: !!(process.env.TBANK_TERMINAL_KEY && process.env.TBANK_PASSWORD)
  },

  // Telegram bot username (without @) — used to construct the deep link
  // shown on the payment result page so users can return to the mini-app.
  // Example: "buy_tribute_bot"
  telegramBotUsername: getEnv('TELEGRAM_BOT_USERNAME') || null,

  // VK Mini App
  // VK_APP_ID          — App ID from vk.com/editapp (the Mini App itself)
  // VK_APP_SECRET       — Protected key from vk.com/editapp → Settings (signs launch params)
  // VK_APP_SERVICE_TOKEN — Service token from vk.com/editapp → Settings (for users.get API)
  // Note: VK_APP_SECRET is distinct from VK_CLIENT_SECRET (VK ID OAuth).
  //       They match only when VK ID is connected to the same app.
  vkAppId: getEnv('VK_APP_ID') || null,
  vkAppSecret: getEnv('VK_APP_SECRET') || null,
  vkAppServiceToken: getEnv('VK_APP_SERVICE_TOKEN') || null,

  // MAX Mini App & Bot
  // MAX_BOT_TOKEN — token from @BotFather on MAX (signs initData and sends notifications)
  // MAX_APP_URL   — override for the miniapp URL shown in bot buttons (defaults to APP_URL)
  maxBotToken: getEnv('MAX_BOT_TOKEN') || null,
  maxAppUrl: getEnv('MAX_APP_URL') || null,

  // Yandex Cloud Postbox — primary email provider in Yandex mode.
  // Auth: API key with yc.postbox.send scope (ID as user, secret as password over SMTP).
  postbox: {
    enabled: !!(process.env.POSTBOX_API_KEY_ID && process.env.POSTBOX_API_KEY_SECRET),
    host: 'postbox.cloud.yandex.net',
    port: 465,
    secure: true,
    apiKeyId: getEnv('POSTBOX_API_KEY_ID'),
    apiKeySecret: getEnv('POSTBOX_API_KEY_SECRET'),
    fromAddress: getEnv('POSTBOX_FROM_ADDRESS') || getEnv('YANDEX_EMAIL')
  },

  // Email (Yandex SMTP) - fallback when Postbox is unavailable
  email: {
    enabled: !!(process.env.YANDEX_EMAIL && process.env.YANDEX_EMAIL_PASSWORD),
    host: 'smtp.yandex.ru',
    port: 465,
    secure: true,
    user: getEnv('YANDEX_EMAIL'),
    password: getEnv('YANDEX_EMAIL_PASSWORD')
  },

  // Legacy Telegram config for backward compatibility
  telegram: {
    userBotToken: getEnv('USER_BOT_TOKEN') || getEnv('BOT_TOKEN'),
    adminBotToken: getEnv('ADMIN_BOT_TOKEN'),
    adminChatId: getEnv('ADMIN_CHAT_ID')
  },

  // Legacy Yandex config for backward compatibility
  yandex: {
    clientId: process.env.YANDEX_CLIENT_ID,
    clientSecret: process.env.YANDEX_CLIENT_SECRET,
    redirectUri: process.env.APP_URL ? `${process.env.APP_URL}/auth/yandex/callback` : null,
    enabled: !!(process.env.YANDEX_CLIENT_ID && process.env.YANDEX_CLIENT_SECRET)
  },

  // VK OAuth config (legacy alias matching auth.vk)
  vk: {
    clientId: process.env.VK_CLIENT_ID,
    clientSecret: process.env.VK_CLIENT_SECRET,
    redirectUri: process.env.APP_URL ? `${process.env.APP_URL}/auth/vk/callback` : null,
    enabled: deploymentMode === 'yandex' && !!(process.env.VK_CLIENT_ID && process.env.VK_CLIENT_SECRET)
  },

  // Supabase (for image storage)
  supabase: {
    url: process.env.SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY,
    enabled: !!(process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY))
  },

  // Yandex Cloud Object Storage (S3-compatible)
  yandexS3: {
    endpoint: process.env.YANDEX_S3_ENDPOINT || 'https://storage.yandexcloud.net',
    region: process.env.YANDEX_S3_REGION || 'ru-central1',
    bucket: process.env.YANDEX_S3_BUCKET,
    accessKeyId: process.env.YANDEX_S3_ACCESS_KEY,
    secretAccessKey: process.env.YANDEX_S3_SECRET_KEY,
    enabled: !!(process.env.YANDEX_S3_BUCKET && process.env.YANDEX_S3_ACCESS_KEY && process.env.YANDEX_S3_SECRET_KEY)
  },

  // Vercel Blob Storage
  vercelBlob: {
    token: process.env.BLOB_READ_WRITE_TOKEN,
    enabled: !!process.env.BLOB_READ_WRITE_TOKEN
  },

  // Storage preference (which to use for user uploads)
  // Auto-selects: Vercel Blob in Telegram mode (Vercel deploy), Yandex S3 in Yandex mode
  getStorageProvider: function() {
    if (this.isTelegramMode && this.vercelBlob.enabled) {
      return 'vercel-blob';
    }
    if (this.yandexS3.enabled) {
      return 'yandex-s3';
    }
    if (this.supabase.enabled) {
      return 'supabase';
    }
    return null;
  },

  // Admin Access
  admin: {
    username: process.env.ADMIN_USERNAME,
    password: process.env.ADMIN_PASSWORD,
    apiKey: process.env.ADMIN_API_KEY
  },

  // Editor Access (limited admin role)
  editor: {
    username: process.env.EDITOR_USERNAME,
    password: process.env.EDITOR_PASSWORD
  }
};

/**
 * Get sharing configuration for the current deployment mode
 * @returns {Object} Sharing configuration
 */
config.getSharingConfig = function() {
  return {
    mode: this.deploymentMode,
    isTelegram: this.isTelegramMode,
    isYandex: this.isYandexMode,
    appUrl: this.appUrl
  };
};

/**
 * Validate critical configuration on startup
 * Throws error if required variables are missing
 */
function validateConfig() {
  const errors = [];

  // Always require APP_URL in production
  if (config.isProduction && !process.env.APP_URL) {
    errors.push('APP_URL is required in production');
  }

  // In production, enforce strict validation
  if (config.isProduction) {
    if (!config.databaseUrl) {
      errors.push('DATABASE_URL is required');
    }
    if (!config.jwt.secret) {
      errors.push('JWT_SECRET or SESSION_SECRET is required');
    }

    // Validate mode-specific requirements
    if (config.isTelegramMode) {
      if (!config.auth.telegram.userBotToken) {
        errors.push('USER_BOT_TOKEN or BOT_TOKEN is required in Telegram mode');
      }
      if (!config.auth.telegram.enabled) {
        console.warn('Telegram auth is not properly configured in Telegram mode');
      }
    }

    if (config.isYandexMode) {
      if (!config.auth.yandex.clientId || !config.auth.yandex.clientSecret) {
        errors.push('YANDEX_CLIENT_ID and YANDEX_CLIENT_SECRET are required in Yandex mode');
      }
      if (!config.email.enabled) {
        console.warn('Email not configured (notifications will not work in Yandex mode)');
      }
      if (!config.auth.yandex.enabled) {
        console.warn('Yandex OAuth is not properly configured in Yandex mode');
      }
    }
  } else {
    // In development, show warnings only
    if (!config.databaseUrl) {
      console.warn('DATABASE_URL not set (using default)');
    }
    if (!config.jwt.secret) {
      console.warn('JWT_SECRET not set (auth may not work)');
    }
  }

  // Warnings for optional features
  if (!config.tbank.enabled) {
    console.warn('T-Bank not configured (payment features disabled)');
  }

  if (!config.supabase.enabled) {
    console.warn('Supabase not configured (image uploads may be affected)');
  }

  // Mode-specific warnings
  if (config.isTelegramMode && !config.auth.telegram.enabled) {
    console.warn('Running in Telegram mode but Telegram auth is disabled');
  }

  if (config.isYandexMode && !config.auth.yandex.enabled) {
    console.warn('Running in Yandex mode but Yandex OAuth is disabled');
  }

  // If there are critical errors, throw
  if (errors.length > 0) {
    console.error('Configuration errors:');
    errors.forEach(err => console.error(`   - ${err}`));
    throw new Error('Invalid configuration - check environment variables');
  }

  // Success message
  console.log('Configuration validated successfully');
  console.log(`Environment: ${config.nodeEnv}`);
  console.log(`Deployment Mode: ${config.deploymentMode}`);
  console.log(`App URL: ${config.appUrl}`);
  console.log(`Auth: Telegram=${config.auth.telegram.enabled}, Yandex=${config.auth.yandex.enabled}, VK ID OAuth=${config.auth.vk.enabled}, VK MiniApp=${!!config.vkAppSecret}, MAX MiniApp=${!!config.maxBotToken}`);
  console.log(`VK Mini App: secret=${!!config.vkAppSecret}, serviceToken=${!!config.vkAppServiceToken}, appId=${!!config.vkAppId}`);
  console.log(`MAX Mini App: botToken=${!!config.maxBotToken}`);
  console.log(`Notifications: ${config.notificationMode}`);
}

// Run validation on module load
try {
  validateConfig();
} catch (error) {
  // Don't crash during require, let the application handle it
  console.error('Configuration validation failed:', error.message);
  if (config.isProduction) {
    // In production, exit immediately
    process.exit(1);
  }
}

module.exports = config;

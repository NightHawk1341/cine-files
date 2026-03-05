function getEnvVar(name: string, defaultValue?: string): string {
  const value = process.env[name] ?? defaultValue;
  if (value === undefined) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

export const config = {
  env: getEnvVar('NODE_ENV', 'development'),
  appUrl: getEnvVar('APP_URL', 'http://localhost:3000'),
  isDev: process.env.NODE_ENV === 'development',
  isProd: process.env.NODE_ENV === 'production',

  db: {
    url: getEnvVar('DATABASE_URL', ''),
  },

  auth: {
    jwtSecret: getEnvVar('JWT_SECRET', 'dev-secret-change-me'),
    sessionSecret: getEnvVar('SESSION_SECRET', 'dev-session-secret'),
    accessTokenExpiry: '7d',
    refreshTokenExpiry: 30, // days
  },

  yandexOAuth: {
    clientId: getEnvVar('YANDEX_CLIENT_ID', ''),
    clientSecret: getEnvVar('YANDEX_CLIENT_SECRET', ''),
  },

  vkOAuth: {
    clientId: getEnvVar('VK_CLIENT_ID', ''),
    clientSecret: getEnvVar('VK_CLIENT_SECRET', ''),
  },

  telegram: {
    botToken: getEnvVar('TELEGRAM_BOT_TOKEN', ''),
  },

  s3: {
    endpoint: getEnvVar('YANDEX_S3_ENDPOINT', 'https://storage.yandexcloud.net'),
    region: getEnvVar('YANDEX_S3_REGION', 'ru-central1'),
    bucket: getEnvVar('YANDEX_S3_BUCKET', 'cinefiles-media'),
    accessKey: getEnvVar('YANDEX_S3_ACCESS_KEY', ''),
    secretKey: getEnvVar('YANDEX_S3_SECRET_KEY', ''),
  },

  tmdb: {
    apiKey: getEnvVar('TMDB_API_KEY', ''),
    proxyUrl: getEnvVar('TMDB_PROXY_URL', 'https://cinefiles.vercel.app/api/tmdb'),
    proxySecret: getEnvVar('TMDB_PROXY_SECRET', ''),
  },

  tribute: {
    apiUrl: getEnvVar('TRIBUTE_API_URL', 'https://buy-tribute.com/api'),
    apiKey: getEnvVar('TRIBUTE_API_KEY', ''),
  },

  redis: {
    url: process.env.REDIS_URL || '',
  },
} as const;

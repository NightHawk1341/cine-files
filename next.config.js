/** @type {import('next').NextConfig} */
const nextConfig = {
  output: process.env.DOCKER_BUILD === 'true' ? 'standalone' : undefined,

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'storage.yandexcloud.net',
        pathname: '/cinefiles-media/**',
      },
    ],
  },

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https://storage.yandexcloud.net https://*.userapi.com",
              "media-src 'self' https://storage.yandexcloud.net",
              "frame-src https://www.youtube.com https://vk.com https://rutube.ru",
              "connect-src 'self' https://api.themoviedb.org https://*.supabase.co https://buy-tribute.com",
              "font-src 'self'",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;

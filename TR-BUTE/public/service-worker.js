/**
 * Service Worker for TRIBUTE PWA
 * Strategy: cache-first for static assets, network-first for API calls
 */
const CACHE_NAME = 'tribute-v1';
// Core app shell files to precache
const APP_SHELL = [
  '/',
  '/css/global.css',
  '/css/components.css',
  '/css/header.css',
  '/css/footer.css',
  '/css/bottom-nav.css',
  '/css/product-grid.css',
  '/css/skeleton.css',
  '/js/core/router.js',
  '/js/core/auth.js',
  '/js/core/state.js',
  '/js/core/formatters.js',
  '/js/utils.js'
];
// Offline fallback page (inline HTML)
const OFFLINE_HTML = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Офлайн — TR/BUTE</title>
  <style>
    body { font-family: 'Montserrat', sans-serif; background: #121212; color: #e0e0e0;
           display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .offline { text-align: center; padding: 2rem; }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
    p { color: #888; font-size: 0.9rem; }
    button { margin-top: 1rem; padding: 0.75rem 1.5rem; background: #fbe98a; color: #121212;
             border: none; border-radius: 8px; font-size: 0.9rem; cursor: pointer; font-family: inherit; }
  </style>
</head>
<body>
  <div class="offline">
    <h1>Нет подключения к сети</h1>
    <p>Проверьте интернет-соединение и попробуйте снова</p>
    <button onclick="window.location.reload()">Обновить</button>
  </div>
</body>
</html>`;
// Install: precache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Cache app shell files individually, skipping failures
      for (const url of APP_SHELL) {
        try {
          await cache.add(url);
        } catch {
          // Skip files that can't be cached (e.g., missing)
        }
      }
      // Cache offline fallback
      await cache.put(new Request('/_offline'), new Response(OFFLINE_HTML, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      }));
    })
  );
  self.skipWaiting();
});
// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});
// Fetch: strategy per request type
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  // Skip non-GET requests
  if (request.method !== 'GET') return;
  // Skip cross-origin requests
  if (url.origin !== self.location.origin) return;
  // API calls: network-only (no caching — data must be fresh)
  if (url.pathname.startsWith('/api/')) return;
  // Admin routes: skip
  if (url.pathname.startsWith('/admin')) return;
  // Static assets (CSS, JS, fonts, local images): cache-first
  if (isStaticAsset(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }
  // HTML pages: network-first with offline fallback
  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request).catch(() => {
        return caches.match(request).then((cached) => {
          return cached || caches.match('/_offline');
        });
      })
    );
    return;
  }
});
function isStaticAsset(pathname) {
  return /\.(css|js|woff2?|ttf|eot|png|jpg|jpeg|svg|webp|ico|gif)$/i.test(pathname);
}
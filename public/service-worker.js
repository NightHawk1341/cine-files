/**
 * CineFiles Service Worker
 * Cache-first for static assets (fonts, icons, CSS, JS).
 * Network-first for API calls and HTML navigation.
 */

var CACHE_NAME = 'cinefiles-v1';

var PRECACHE_URLS = [
  '/',
  '/css/global.css',
  '/css/header.css',
  '/css/footer.css',
  '/css/bottom-nav.css',
  '/css/page-layouts.css',
  '/css/article-card.css',
  '/fonts/Montserrat-VariableFont_wght.woff2',
  '/icons/favicon.svg',
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(PRECACHE_URLS);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(
        names.filter(function (name) { return name !== CACHE_NAME; })
          .map(function (name) { return caches.delete(name); })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (event) {
  var url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip API and auth requests — always network
  if (url.pathname.startsWith('/api/')) return;

  // Static assets: cache-first
  var isStatic = /\.(css|js|woff2?|svg|png|jpg|webp|avif|ico)(\?|$)/.test(url.pathname);

  if (isStatic) {
    event.respondWith(
      caches.match(event.request).then(function (cached) {
        if (cached) return cached;
        return fetch(event.request).then(function (response) {
          if (response.ok) {
            var clone = response.clone();
            caches.open(CACHE_NAME).then(function (cache) {
              cache.put(event.request, clone);
            });
          }
          return response;
        });
      })
    );
    return;
  }

  // HTML navigation: network-first with cache fallback
  if (event.request.headers.get('accept') && event.request.headers.get('accept').includes('text/html')) {
    event.respondWith(
      fetch(event.request).then(function (response) {
        if (response.ok) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(event.request, clone);
          });
        }
        return response;
      }).catch(function () {
        return caches.match(event.request).then(function (cached) {
          return cached || caches.match('/');
        });
      })
    );
    return;
  }
});

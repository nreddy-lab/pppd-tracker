/* ═══════════════════════════════════════════
   PPPD Tracker — Service Worker
   Strategy: cache-first for all static assets.
   Bump CACHE_VERSION when deploying updates.
   ═══════════════════════════════════════════ */

const CACHE_VERSION = 'v6';
const CACHE_NAME    = `pppd-tracker-${CACHE_VERSION}`;

/* All files that must be available offline.
   Icons are cached opportunistically (non-fatal if missing). */
const PRECACHE_CORE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
];

const PRECACHE_ICONS = [
  './icons/icon-72.png',
  './icons/icon-96.png',
  './icons/icon-128.png',
  './icons/icon-144.png',
  './icons/icon-152.png',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// ─────────────────────────────────────────────
// INSTALL — precache all static assets
// ─────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      // Core files must all succeed
      await cache.addAll(PRECACHE_CORE);

      // Icons cached individually — missing files won't block install
      await Promise.allSettled(
        PRECACHE_ICONS.map(url =>
          cache.add(url).catch(() => {
            /* Icon not generated yet — skipped */
          })
        )
      );
    })
    // Skip the waiting phase so the new SW takes over immediately
    .then(() => self.skipWaiting())
  );
});

// ─────────────────────────────────────────────
// ACTIVATE — delete stale caches, claim clients
// ─────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key => key.startsWith('pppd-tracker-') && key !== CACHE_NAME)
            .map(key => caches.delete(key))
        )
      )
      // Take control of all open tabs without requiring a reload
      .then(() => self.clients.claim())
  );
});

// ─────────────────────────────────────────────
// FETCH — cache-first, network fallback
// ─────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;

  // Only handle same-origin GET requests
  if (request.method !== 'GET') return;

  // Only handle http(s) — skip chrome-extension, data: etc.
  const url = new URL(request.url);
  if (!['http:', 'https:'].includes(url.protocol)) return;

  event.respondWith(
    caches.match(request).then(cached => {
      // Serve from cache immediately if available
      if (cached) return cached;

      // Not in cache — fetch from network and cache the response
      return fetch(request)
        .then(response => {
          // Only cache valid, same-origin responses
          if (
            !response ||
            response.status !== 200 ||
            response.type !== 'basic'
          ) {
            return response;
          }

          // Clone before consuming — cache one copy, return the other
          const toCache = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, toCache));
          return response;
        })
        .catch(() => {
          // Network failed and nothing in cache — return offline fallback
          // For navigation requests, serve the cached app shell
          if (request.mode === 'navigate') {
            return caches.match('./index.html');
          }
          // For other requests (e.g. a missing icon) just fail silently
          return new Response('', { status: 408, statusText: 'Offline' });
        });
    })
  );
});

// ─────────────────────────────────────────────
// MESSAGE — allow the app to trigger SW updates
// ─────────────────────────────────────────────
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

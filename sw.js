/* FreshTrack service worker (Phase 20): offline-first app shell.
   Same-origin GET requests are served cache-first (fresh copy fetched
   in the background on next load); API calls to the Worker always go
   to the network, never the cache. Navigation requests fall back to
   the cached index.html when offline. Bump CACHE_NAME on shell changes.
   No em dashes in this file. */
var CACHE_NAME = 'freshtrack-v1';
var PRECACHE = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './recipes.js',
  './manifest.json',
  './fonts/creepster.woff2'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      // Cache each file on its own so one missing file cannot fail all.
      return Promise.all(PRECACHE.map(function (url) {
        return cache.add(url).catch(function () { /* optional asset */ });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (key) {
        return key !== CACHE_NAME;
      }).map(function (key) {
        return caches.delete(key);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;
  var url = new URL(request.url);
  // API calls always go to the network (never serve stale pantry/AI data).
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then(function (response) {
        var copy = response.clone();
        caches.open(CACHE_NAME).then(function (cache) { cache.put(request, copy); });
        return response;
      }).catch(function () {
        return caches.match('./index.html');
      })
    );
    return;
  }
  event.respondWith(
    caches.match(request).then(function (cached) {
      var network = fetch(request).then(function (response) {
        if (response && response.status === 200) {
          var copy = response.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(request, copy); });
        }
        return response;
      }).catch(function () { return cached; });
      return cached || network;
    })
  );
});

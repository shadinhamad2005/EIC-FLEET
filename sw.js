const CACHE_NAME = 'fleet-tracker-v21';

// ONLY cache truly static external assets (fonts, icons) — NEVER JS or CSS
const STATIC_ASSETS = [
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Outfit:wght@500;700;800&display=swap'
];

// Install — pre-cache only static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate — wipe all old caches immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch strategy:
//   - Local JS/CSS files → ALWAYS fetch from network (never serve stale)
//   - Firebase/Mapbox/external APIs → ALWAYS network only (no caching)
//   - Static CDN assets (fonts, icons) → Cache first, network fallback
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Local app files: Network-First with Cache fallback, but also save to cache
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(event.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        return res;
      }).catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        // If navigating to a page and offline, return the root index.html
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      })
    );
    return;
  }

  // Never cache Firebase, Mapbox, or any API calls
  const noCacheHosts = ['firestore.googleapis.com', 'firebase.googleapis.com', 'identitytoolkit.googleapis.com', 'api.mapbox.com', 'router.project-osrm.org', 'nominatim.openstreetmap.org'];
  if (noCacheHosts.some(h => url.hostname.includes(h))) {
    event.respondWith(fetch(event.request));
    return;
  }

  // For static CDN assets: cache-first
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        return res;
      });
    })
  );
});

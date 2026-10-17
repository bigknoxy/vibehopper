/* VibeHop service worker — offline-ready.
   Navigations are network-first (a deployed update shows up on the next online load),
   assets are cache-first with an opportunistic top-up. deploy.sh bumps CACHE. */
const CACHE = 'vibehop-v4';
const ASSETS = ['./', './index.html', './manifest.json', './docs/icon-180.png', './docs/icon-192.png', './docs/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  // Navigations: try the network so deploys land, fall back to the cached shell offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            event.waitUntil(caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {}));
          }
          return res;
        })
        .catch(() => caches.match(req).then((c) => c || caches.match('./index.html')))
        .then((res) => res || new Response('Offline', { status: 503, statusText: 'Offline' }))
    );
    return;
  }

  // Everything else: cache-first, top up on miss.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            event.waitUntil(caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {}));
          }
          return res;
        })
        .catch(() => caches.match('./index.html'))
        .then((res) => res || new Response('Offline', { status: 503, statusText: 'Offline' }));
    })
  );
});

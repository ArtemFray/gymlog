/* FREILIFT service worker: offline app shell.
   Network first, revalidating past the HTTP cache, so a deploy shows on the next open.
   The cache answers when offline, or when the network is slower than NET_TIMEOUT. */
const CACHE = 'freilift-v5';
const NET_TIMEOUT = 2500;
const ASSETS = [
  './', './index.html', './style.css', './data.js', './info.js', './store.js', './views.js',
  './serif-latin.woff2', './serif-cyrillic.woff2',
  './manifest.webmanifest', './icon-180.png', './icon-192.png', './icon-512.png', './icon-512-maskable.png',
];

self.addEventListener('install', (e) => {
  /* cache: 'reload' skips the HTTP cache, so a new worker never stores stale files */
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(networkFirst(req));
});

function fromCache(req) {
  return caches.match(req, { ignoreSearch: true })
    .then((hit) => hit || (req.mode === 'navigate' ? caches.match('./index.html') : undefined));
}

function networkFirst(req) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (res) => { if (!done && res) { done = true; resolve(res); } };
    const timer = setTimeout(() => { fromCache(req).then(finish); }, NET_TIMEOUT);
    /* a new Request by URL: navigation requests cannot be re-used with a RequestInit */
    fetch(new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' }))
      .then((res) => {
        if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        clearTimeout(timer);
        finish(res);
      })
      .catch(() => {
        clearTimeout(timer);
        fromCache(req).then((hit) => finish(hit || Response.error()));
      });
  });
}

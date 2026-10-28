// Service worker: keeps the heavy, unchanging files (3D models, scripts, fonts, images) on the device
// so the app opens fast after the first visit. Pages, data, server actions, realtime and voice always
// go to the network. Bump VERSION when a file under /models is replaced under the same name.
const VERSION = 'v1';
const STATIC_CACHE = `gc-static-${VERSION}`;
const MODELS_CACHE = `gc-models-${VERSION}`;
const PAGES_CACHE = `gc-pages-${VERSION}`;
const OFFLINE_URL = '/offline.html';
// Old script chunks pile up after each deploy; keep only the newest ones.
const MAX_STATIC_ENTRIES = 400;

self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(PAGES_CACHE).then((cache) => cache.add(new Request(OFFLINE_URL, { cache: 'reload' }))),
      // The offline page shows the logo.
      caches.open(STATIC_CACHE).then((cache) => cache.add('/favicon.svg')),
    ]).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  const keep = new Set([STATIC_CACHE, MODELS_CACHE, PAGES_CACHE]);
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => n.startsWith('gc-') && !keep.has(n)).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

// Cache first: these files never change under the same URL (hashed names, or immutable by our headers).
async function cacheFirst(request, cacheName, max) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok && response.type === 'basic') {
    await cache.put(request, response.clone());
    if (max) trim(cacheName, max);
  }
  return response;
}

// Pages always come from the network (they carry the session and live data); offline shows a notice.
async function networkPage(request) {
  try {
    return await fetch(request);
  } catch {
    return (await caches.match(OFFLINE_URL)) || Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Partial downloads (audio/video seeking) are left to the browser.
  if (request.headers.has('range')) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkPage(request));
    return;
  }
  if (url.pathname.startsWith('/models/')) {
    event.respondWith(cacheFirst(request, MODELS_CACHE));
    return;
  }
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/') || url.pathname === '/favicon.svg') {
    event.respondWith(cacheFirst(request, STATIC_CACHE, MAX_STATIC_ENTRIES));
  }
  // Everything else (/api, RSC data, uploads, /hero) uses the network and the browser's own cache.
});

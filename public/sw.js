// Offline support for the web version (and the home-screen app it becomes).
// The page itself is fetched network-first, so an update is picked up the
// next time you open the game online. The hashed build files never change,
// so they are served from the cache. Saves live in localStorage, not here.

const CACHE = 'solar-dynasty-v2';
const FONTS = [
  './fonts/exo-2-cyrillic-ext.woff2',
  './fonts/exo-2-cyrillic.woff2',
  './fonts/exo-2-vietnamese.woff2',
  './fonts/exo-2-latin-ext.woff2',
  './fonts/exo-2-latin.woff2',
  './fonts/orbitron-latin.woff2',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', ...FONTS])));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put('./', res.clone());
    return res;
  } catch {
    return (await cache.match('./')) ?? Response.error();
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate') {
    e.respondWith(networkFirst(req));
  } else if (url.origin === self.location.origin) {
    e.respondWith(cacheFirst(req));
  }
});

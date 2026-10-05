const RELEASE_ID = '2026-10-05-candidate100-maintenance-release-pwa-regression-docs';
const CACHE_NAME = `bukkomi-scan-${RELEASE_ID}`;
const versioned = (path) => `${path}?release=${encodeURIComponent(RELEASE_ID)}`;
const APP_SHELL = [
  './',
  './index.html',
  './release.json',
  './manifest.webmanifest',
  versioned('./master_data.js'),
  versioned('./classifier.js'),
  versioned('./food_color_features.js'),
  versioned('./food_matcher.js'),
  versioned('./app.js'),
  versioned('./icons/favicon-32.png'),
  versioned('./icons/apple-touch-icon.png'),
  versioned('./icons/icon-192.png'),
  versioned('./icons/icon-512.png'),
  versioned('./assets/example-screenshot.png'),
  versioned('./assets/ogp-card.png')
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(APP_SHELL.map(async (url) => {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response || !response.ok) throw new Error(`Precache failed: ${url}`);
      await cache.put(url, response);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('bukkomi-scan-') && key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function networkFirst(request, fallback) {
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (response && response.ok && response.type === 'basic') {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    return (await caches.match(request)) || (fallback ? await caches.match(fallback) : Response.error());
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, './index.html'));
    return;
  }
  if (url.pathname.endsWith('/release.json')) {
    event.respondWith(fetch(request, { cache: 'no-store' }).catch(() => caches.match('./release.json')));
    return;
  }
  if (url.pathname.endsWith('/manifest.webmanifest') || url.pathname.endsWith('/index.html')) {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request, { cache: 'no-store' });
      if (response && response.ok && response.type === 'basic') {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    } catch (err) {
      return cached || Response.error();
    }
  })());
});

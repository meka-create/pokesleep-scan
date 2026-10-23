const RELEASE_ID = '2026-10-24-paddle-wait-choice-audit-v2';
// Distinct caches per release prevent stale OCR and UI assets from surviving promotion.
const CACHE_NAME = `bukkomi-scan-${RELEASE_ID}-step3-prod-multi-picker-v1-reviewclean-v1-mythical-blank-v2-food3-selfmatch-v3-mythical-food-v4-third-dash-v5-subskill-dash-v6-kana-picker-v1-unified-mobile-layout-v1-postanalysis-append-v1-food3-pixel-witness-v4-query-refresh-sources-v1-direct-files-v1-nickname-caption-v3-consensus-red-card-20261015-v1`;
const versioned = (path) => `${path}?release=${encodeURIComponent(RELEASE_ID)}&step2=sharedcsv-v1&step3=androidroi-v1&pick=multi-v1&ui=review-clean-v1-food3-pixel-v9-nickname-consensus-red-card-20261015-v1`;
const APP_SHELL = [
  './',
  './index.html',
  './release.json',
  './manifest.webmanifest',
  versioned('./master_data.js'),
  versioned('./shared_master.js'),
  versioned('./shared/MASTER_DATA.json'),
  versioned('./shared/master_release.json'),
  versioned('./master-update-status.js'),
  versioned('./csv_gate.js'),
  versioned('./android_roi.js'),
  versioned('./classifier.js'),
  versioned('./food_color_features.js'),
  versioned('./food_matcher.js'),
  versioned('./app.js'),
  versioned('./icons/favicon-32.png'),
  versioned('./icons/apple-touch-icon.png'),
  versioned('./icons/icon-192.png'),
  versioned('./icons/icon-512.png'),
  versioned('./icons/icon-maskable-192.png'),
  versioned('./icons/icon-maskable-512.png'),
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

  // Health feed is network-only; never replay an old healthy receipt.
  if (url.pathname.endsWith('/master-update-status.json')) {
    event.respondWith(fetch(request,{cache:'no-store'}).catch(()=>Response.error()));
    return;
  }
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

const CACHE_NAME = 'optirota-v3';
const API_CACHE_NAME = 'optirota-api-v2';
const DYNAMIC_CACHE_NAME = 'optirota-dynamic-v1';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.png',
  '/pwa/icons/icon-48.png',
  '/pwa/icons/icon-72.png',
  '/pwa/icons/icon-96.png',
  '/pwa/icons/icon-128.png',
  '/pwa/icons/icon-144.png',
  '/pwa/icons/icon-192.png',
  '/pwa/icons/icon-256.png',
  '/pwa/icons/icon-384.png',
  '/pwa/icons/icon-512.png'
];

const API_ENDPOINTS_TO_CACHE = [
  '/api/stops',
  '/api/itinerary',
  '/api/settings',
  '/api/stats',
  '/api/auth/me',
  '/api/subscription'
];

self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker v3...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
      .catch((error) => {
        console.error('[SW] Install failed:', error);
      })
  );
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker v3...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => !name.includes('v3') && !name.includes('v2') && !name.includes('v1'))
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') {
    return;
  }

  if (url.hostname.includes('openstreetmap.org') || 
      url.hostname.includes('tile.osm.org') ||
      url.hostname.includes('geoapify.com')) {
    event.respondWith(cacheFirst(request, DYNAMIC_CACHE_NAME));
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    const shouldCache = API_ENDPOINTS_TO_CACHE.some(endpoint => 
      url.pathname.includes(endpoint)
    );
    
    if (shouldCache) {
      event.respondWith(networkFirstWithOfflineFallback(request, API_CACHE_NAME));
    } else {
      event.respondWith(networkFirst(request));
    }
    return;
  }

  if (url.pathname.match(/\.(png|jpg|jpeg|svg|gif|webp|ico)$/)) {
    event.respondWith(cacheFirst(request, DYNAMIC_CACHE_NAME));
    return;
  }

  if (url.pathname.match(/\.(js|css)$/) || url.pathname.includes('/assets/')) {
    event.respondWith(cacheFirstWithNetwork(request, CACHE_NAME));
    return;
  }

  if (url.pathname.match(/\.(woff|woff2|ttf|eot)$/)) {
    event.respondWith(cacheFirst(request, DYNAMIC_CACHE_NAME));
    return;
  }

  event.respondWith(networkFirstWithOfflineFallback(request, CACHE_NAME));
});

async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    if (request.mode === 'navigate') {
      return caches.match('/');
    }
    throw error;
  }
}

async function networkFirstWithOfflineFallback(request, cacheName) {
  const cache = await caches.open(cacheName);
  
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const responseToCache = networkResponse.clone();
      const headers = new Headers(responseToCache.headers);
      headers.set('sw-cached-at', Date.now().toString());
      
      const body = await responseToCache.blob();
      const cachedResponse = new Response(body, {
        status: responseToCache.status,
        statusText: responseToCache.statusText,
        headers: headers
      });
      
      cache.put(request, cachedResponse);
    }
    return networkResponse;
  } catch (error) {
    console.log('[SW] Network failed, checking cache for:', request.url);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      console.log('[SW] Returning cached response for:', request.url);
      return cachedResponse;
    }
    
    if (request.mode === 'navigate') {
      const indexResponse = await caches.match('/');
      if (indexResponse) {
        return indexResponse;
      }
    }
    
    return new Response(JSON.stringify({ 
      error: 'Offline', 
      offline: true,
      message: 'Voce esta offline. Os dados serao sincronizados quando a conexao voltar.' 
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function cacheFirst(request, cacheName) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.log('[SW] Failed to fetch:', request.url);
    return new Response('', { status: 404 });
  }
}

async function cacheFirstWithNetwork(request, cacheName) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    fetch(request).then((networkResponse) => {
      if (networkResponse.ok) {
        caches.open(cacheName).then((cache) => {
          cache.put(request, networkResponse.clone());
        });
      }
    }).catch(() => {});
    
    return cachedResponse;
  }
  
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.log('[SW] Failed to fetch asset:', request.url);
    return new Response('', { status: 404 });
  }
}

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
  
  if (event.data === 'clearApiCache') {
    caches.delete(API_CACHE_NAME).then(() => {
      console.log('[SW] API cache cleared');
    });
  }

  if (event.data === 'cacheAllAssets') {
    event.waitUntil(cacheAllAppAssets());
  }
});

async function cacheAllAppAssets() {
  console.log('[SW] Caching all app assets for offline use...');
  const cache = await caches.open(CACHE_NAME);
  
  try {
    const response = await fetch('/');
    const html = await response.text();
    
    const jsMatches = html.match(/src="([^"]+\.js[^"]*)"/g) || [];
    const cssMatches = html.match(/href="([^"]+\.css[^"]*)"/g) || [];
    
    const assets = [];
    
    jsMatches.forEach(match => {
      const url = match.replace(/src="|"/g, '');
      if (url.startsWith('/') || url.startsWith('./')) {
        assets.push(url.replace('./', '/'));
      }
    });
    
    cssMatches.forEach(match => {
      const url = match.replace(/href="|"/g, '');
      if (url.startsWith('/') || url.startsWith('./')) {
        assets.push(url.replace('./', '/'));
      }
    });
    
    console.log('[SW] Found assets to cache:', assets);
    
    for (const asset of assets) {
      try {
        const assetResponse = await fetch(asset);
        if (assetResponse.ok) {
          await cache.put(asset, assetResponse);
          console.log('[SW] Cached:', asset);
        }
      } catch (e) {
        console.log('[SW] Failed to cache:', asset);
      }
    }
    
    console.log('[SW] Finished caching app assets');
  } catch (error) {
    console.error('[SW] Error caching assets:', error);
  }
}

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-pending-operations') {
    console.log('[SW] Background sync triggered');
    event.waitUntil(notifyClientsToSync());
  }
});

async function notifyClientsToSync() {
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage({ type: 'SYNC_REQUESTED' });
  });
}

self.addEventListener('push', (event) => {
  if (event.data) {
    const data = event.data.json();
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/pwa/icons/icon-192.png',
      badge: '/pwa/icons/icon-96.png'
    });
  }
});

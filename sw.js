/* LogiTrak v3.6. Seuls l'écran hors connexion et son icône sont mis en cache. */
'use strict';
const VERSION = '4.0.9';
const CACHE_PREFIX = 'logitrak-offline:' + self.registration.scope + ':';
const CACHE_NAME = CACHE_PREFIX + VERSION;
const offlineURL = new URL('offline.html', self.registration.scope).href;
const iconURL = new URL('assets/app-icon-192.png', self.registration.scope).href;
const pageURLs = new Set(['', 'index.html', 'production.html', 'colisage.html', 'envois.html', 'statistiques.html', 'algerie-poste.html', 'pointage.html', 'machines.html']
  .map(page => new URL(page, self.registration.scope).pathname));

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll([offlineURL, iconURL])));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_UPDATE') self.skipWaiting();
});
async function offlineResponse() {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(offlineURL);
  return new Response(cached ? await cached.text() : '<!doctype html><html lang="fr"><meta charset="utf-8"><title>LogiTrak</title><p>Connexion indisponible. Réessayez après avoir rétabli Internet.</p></html>', {
    status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.href === iconURL) {
    event.respondWith(caches.open(CACHE_NAME).then(async cache => (await cache.match(iconURL)) || fetch(request)));
    return;
  }
  if (request.mode === 'navigate' && pageURLs.has(url.pathname)) {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        return response.status >= 500 ? offlineResponse() : response;
      } catch {
        return offlineResponse();
      }
    })());
  }
});

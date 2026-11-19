const CACHE = 'ebberesi-admin-v1';
const ASSETS = ['/admin.html', '/admin.webmanifest', '/admin-icon.svg'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== location.origin) return;
  event.respondWith(fetch(event.request).catch(async () => (await caches.match(event.request)) || new Response('Offline', { status: 503, statusText: 'Offline' })));
});

const CACHE = 'bird-counter-pwa-v1.4.6';
const ASSETS = ['./','./index.html','./css/style.css','./js/app.js','./js/app.js?v=1.4.6','./js/storage.js','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('bird-counter-pwa-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).then(async response => {
    if (response.ok) { try { const cache = await caches.open(CACHE); await cache.put(event.request,response.clone()); } catch(e) {} }
    return response;
  }).catch(() => caches.match(event.request).then(response => response || (event.request.mode === 'navigate' ? caches.match('./index.html') : Response.error()))));
});

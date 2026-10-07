const PREFIX = 'video-shelf-' + encodeURIComponent(self.registration.scope) + '-';
const CACHE = PREFIX + '20261007-brand-1';
const files = ['index.html','app.js?v=20261007-brand-1','install.js?v=20261007-brand-1','drive.js?v=20261007-brand-1','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png'];
const url = name => new URL(name, self.registration.scope).href;
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(files.map(name => new Request(url(name), { cache: 'reload' })))));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await Promise.all((await caches.keys()).filter(k => k.startsWith(PREFIX) && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_UPDATE') self.skipWaiting();
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin || !request.url.startsWith(self.registration.scope)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(request);
      if (response.ok && (request.mode === 'navigate' || files.some(name => request.url === url(name)))) {
        await cache.put(request.mode === 'navigate' ? url('index.html') : request, response.clone());
      }
      return response;
    } catch {
      const cached = await cache.match(request.mode === 'navigate' ? url('index.html') : request);
      return cached || new Response('오프라인에서 사용할 수 없는 파일입니다.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  })());
});

/* Small, dependency-free PWA foundation: no automatic takeover during an active game. */
const CACHE = 'trivia-shell-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest'];

async function cachedResponse(request) {
  try { return await (await caches.open(CACHE)).match(request); }
  catch { return undefined; }
}

async function cacheResponse(request, response) {
  try { await (await caches.open(CACHE)).put(request, response); }
  catch { /* Cache quota/availability must not turn a successful fetch into an error. */ }
}

async function serveCached(event, cacheable) {
  const cached = await cachedResponse(event.request);
  if (cached) return cached;
  const response = await fetch(event.request);
  if (response.ok && cacheable) event.waitUntil(cacheResponse(event.request, response.clone()));
  return response;
}
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // Old caches are retained for existing tabs using their frozen application shell.
    await self.clients.claim();
    // Other open app tabs may still need their old assets. Clean up once only this tab remains.
    try {
      const clients = await self.clients.matchAll({type:'window', includeUncontrolled:true});
      if (clients.length <= 1) {
        const names = await caches.keys();
        await Promise.all(names.filter(name => name.startsWith('trivia-shell-') && name !== CACHE).map(name => caches.delete(name)));
      }
    } catch { /* Old-cache housekeeping is best effort; activation must still succeed. */ }
  })());
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/data/') || url.pathname.startsWith('/images/')) {
    event.respondWith(serveCached(event, true));
    return;
  }
  if (event.request.mode === 'navigate') {
    event.respondWith(cachedResponse('/index.html').then(cached => cached || fetch(event.request)));
    return;
  }
  event.respondWith(serveCached(event, ['script','style','font','image'].includes(event.request.destination)));
});
self.addEventListener('message', event => {
  if (event.data?.type === 'GET_VERSION') event.ports[0]?.postMessage({version:CACHE});
  if (event.data?.type === 'ACTIVATE_UPDATE') void self.skipWaiting();
});

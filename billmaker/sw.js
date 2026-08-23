/* Bill Maker service worker - its own scope, its own cache. v2.0.0 build 1787503249 */
const CACHE = 'billmaker-2.0.0-1787503249';
const CORE = ['./', './index.html', './billdata-618d01744d.js', './imgworker.js', './manifest.json', './icon.svg'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks =>
    Promise.all(ks.filter(k => k.startsWith('billmaker-') && k !== CACHE).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;                 // the reader POST is never cached
  if (url.pathname.endsWith('/index.html') || url.pathname.endsWith('/billmaker/')) {
    // network first so updates arrive; instant cache when offline
    e.respondWith(fetch(e.request).then(r => {
      const cp = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); return r;
    }).catch(() => caches.match(e.request)));
    return;
  }
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(r => {
    if (url.origin === location.origin) { const cp = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); }
    return r;
  })));
});

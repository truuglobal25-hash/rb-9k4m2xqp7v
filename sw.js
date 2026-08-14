// Killswitch. An old service worker at this address was intercepting every page
// beneath it and serving a broken copy - which is why nothing new could reach
// the phone no matter how many versions were published. This replaces it, then
// deletes itself and every cache, and never touches a fetch again.
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) await caches.delete(k);
  await self.registration.unregister();
  for (const c of await self.clients.matchAll({type:'window'})) c.navigate(c.url);
})()));
// deliberately no fetch handler - every request goes straight to the network

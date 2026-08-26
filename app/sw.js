// Retirement worker: the North book moved into /app/. This clears the old
// shell cache and unregisters itself so installed phones land in the unified
// app. IndexedDB and localStorage are untouched - visits and drafts survive.
self.addEventListener('install',e=>self.skipWaiting());
self.addEventListener('activate',e=>{e.waitUntil((async()=>{
  const ks=await caches.keys();
  await Promise.all(ks.map(k=>caches.delete(k)));
  await self.registration.unregister();
  const cs=await self.clients.matchAll({type:'window'});
  cs.forEach(c=>c.navigate(c.url));
})())});

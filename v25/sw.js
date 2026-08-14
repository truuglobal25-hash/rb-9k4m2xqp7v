// The book blob carries a hash of its contents in its name, so it can never be
// stale: cache it for good and serve it from there. That is what makes the
// second open instant and what makes it work with no signal. index.html is a
// couple of KB and stays network-first, so a new build still reaches the phone.
const C='routebook-583e9fb47c03';
const BIN='book-583e9fb47c03.bin';
self.addEventListener('install',e=>{e.waitUntil(
  caches.open(C).then(c=>c.addAll(['./','./index.html','./manifest.json','./'+BIN]))
    .then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(
  caches.keys().then(k=>Promise.all(k.filter(n=>n!==C).map(n=>caches.delete(n))))
    .then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET') return;
  if(new URL(e.request.url).pathname.endsWith('.bin')){   // immutable - cache wins
    e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(res=>{
      const copy=res.clone(); caches.open(C).then(c=>c.put(e.request,copy)).catch(()=>{});
      return res;})));
    return;
  }
  e.respondWith(
    fetch(e.request).then(res=>{
      const copy=res.clone();
      caches.open(C).then(c=>c.put(e.request,copy)).catch(()=>{});
      return res;
    }).catch(()=>
      caches.match(e.request).then(r=>r||caches.match('./index.html'))));
});

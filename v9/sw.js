// Keeps a copy on the phone so the book opens with no signal, but always tries
// for a fresh one first. Cache-first looked fine and meant a new build could
// never reach the phone - it would sit on the first copy forever.
const C='routebook-490cddf1ac3c';
self.addEventListener('install',e=>{e.waitUntil(
  caches.open(C).then(c=>c.addAll(['./','./index.html','./manifest.json'])).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(
  caches.keys().then(k=>Promise.all(k.filter(n=>n!==C).map(n=>caches.delete(n)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET') return;
  e.respondWith(
    fetch(e.request).then(res=>{
      const copy=res.clone();
      caches.open(C).then(c=>c.put(e.request,copy)).catch(()=>{});
      return res;
    }).catch(()=>
      caches.match(e.request).then(r=>r||caches.match('./index.html'))));
});

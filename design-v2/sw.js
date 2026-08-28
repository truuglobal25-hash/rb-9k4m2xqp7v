const C='v2-8e700c9bf0';
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.add('./')).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(n=>n!==C&&n.startsWith('v2-')).map(n=>caches.delete(n)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
 if(e.request.mode!=='navigate')return;
 e.respondWith(caches.match('./').then(hit=>{
  const net=fetch(e.request).then(r=>{if(r&&r.ok){const cl=r.clone();caches.open(C).then(c=>c.put('./',cl))}return r}).catch(()=>null);
  return hit||net.then(r=>r||new Response('offline',{status:503}))}))});

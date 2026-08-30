const C='v3-94eaa3941e';
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.add('./')).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(n=>n!==C&&(n.startsWith('v3-'))).map(n=>caches.delete(n)))).then(()=>self.clients.claim()).then(()=>self.clients.matchAll({type:'window'})).then(cs=>cs.forEach(c=>c.navigate(c.url))))});
self.addEventListener('fetch',e=>{
 if(e.request.mode!=='navigate')return;
 // network-first: a fresh deploy lands immediately; cache is the offline safety net
 e.respondWith(
  fetch(e.request).then(r=>{if(r&&r.ok){const cl=r.clone();caches.open(C).then(c=>c.put('./',cl))}return r})
   .catch(()=>caches.match('./').then(hit=>hit||new Response('offline',{status:503}))))});

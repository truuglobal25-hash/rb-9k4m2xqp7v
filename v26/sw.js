// v26 worker: NETWORK FIRST with a 4.5s timeout, cache only as the offline
// fallback. The old cache-first worker served a broken copy forever - this one
// can never do that: every online load comes from the network and refreshes
// the fallback copy. Versioned cache, cleans anything else on activate.
const CACHE='v26-shell-1';
self.addEventListener('install',e=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil((async()=>{
 for(const k of await caches.keys())if(k!==CACHE)await caches.delete(k);
 await self.clients.claim()})()));
self.addEventListener('fetch',e=>{
 const u=new URL(e.request.url);
 if(e.request.method!=='GET'||u.origin!==location.origin)return;
 e.respondWith((async()=>{
  const c=await caches.open(CACHE);
  try{
   const ctl=new AbortController();const t=setTimeout(()=>ctl.abort(),4500);
   const r=await fetch(e.request,{signal:ctl.signal});
   clearTimeout(t);
   if(r&&r.ok&&(u.pathname.endsWith('/')||/\.(html|json|png|svg|js)$/.test(u.pathname)))c.put(e.request,r.clone());
   return r;
  }catch(err){
   const hit=await c.match(e.request,{ignoreSearch:true});
   if(hit)return hit;
   throw err;
  }})())});

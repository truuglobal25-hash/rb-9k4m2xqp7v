// v26 worker v2: CACHE-FIRST for instant open, background revalidate, and a
// LAST-KNOWN-GOOD copy promoted only after the app reports a healthy boot.
// The old cache-first disaster cannot repeat: every hit triggers a background
// network refresh, and the in-app update banner offers new builds explicitly.
const CUR='v26-cur-2', GOOD='v26-good-2';
self.addEventListener('install',e=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil((async()=>{
 for(const k of await caches.keys())if(k!==CUR&&k!==GOOD)await caches.delete(k);
 await self.clients.claim()})()));
self.addEventListener('message',e=>{
 if(e.data==='healthy')e.waitUntil((async()=>{
  const cur=await caches.open(CUR),good=await caches.open(GOOD);
  for(const req of await cur.keys()){const r=await cur.match(req);if(r)await good.put(req,r.clone())}})())});
self.addEventListener('fetch',e=>{
 const u=new URL(e.request.url);
 if(e.request.method!=='GET'||u.origin!==location.origin)return;
 e.respondWith((async()=>{
  const cur=await caches.open(CUR);
  if(u.searchParams.has('lkg')){const g=await caches.open(GOOD);
   const hit=await g.match('index.html')||await g.match(u.pathname);
   if(hit)return hit}
  const cached=await cur.match(e.request,{ignoreSearch:false})||await cur.match(u.pathname);
  const refresh=(async()=>{try{
   const r=await fetch(e.request);
   if(r&&r.ok&&(u.pathname.endsWith('/')||/\.(html|json|png|svg|js)$/.test(u.pathname)))await cur.put(e.request,r.clone());
   return r}catch(err){return null}})();
  if(cached){e.waitUntil(refresh.catch(()=>{}));return cached}
  const net=await refresh;
  if(net)return net;
  const g=await caches.open(GOOD);
  const lk=await g.match(e.request,{ignoreSearch:true});
  if(lk)return lk;
  throw new Error('offline, nothing cached')})())});

// v26 worker v3. Root fix: ALL navigations (folder URL, index.html, any ?query)
// are cached and served under ONE canonical key ('./'), so the installed app
// opens from cache no matter which exact URL the icon launches. Cache-first,
// background refresh, last-known-good promoted only on healthy boot, and an
// inline offline screen instead of a browser error page.
const CUR='v26-cur-3', GOOD='v26-good-3', KEY='./';
// Never cache a response that was redirected or came from another origin —
// an auth wall (e.g. Cloudflare Access login) must never replace the app in cache.
const ours=r=>{try{return r&&r.ok&&!r.redirected&&new URL(r.url).origin===location.origin}catch(e){return false}};
const PRECACHE=['./','./manifest.json','./icon-192.png','./icon-512.png','./safe.html'];
self.addEventListener('install',e=>{e.waitUntil((async()=>{
 const c=await caches.open(CUR);
 for(const p of PRECACHE){try{
  const r=await fetch(p,{cache:'no-cache'});
  if(ours(r))await c.put(p==='./'?KEY:p,r.clone());
 }catch(err){}}
 await self.skipWaiting()})())});
self.addEventListener('activate',e=>e.waitUntil((async()=>{
 for(const k of await caches.keys())if(k!==CUR&&k!==GOOD)await caches.delete(k);
 await self.clients.claim()})()));
self.addEventListener('message',e=>{
 if(e.data==='healthy')e.waitUntil((async()=>{
  const cur=await caches.open(CUR),good=await caches.open(GOOD);
  for(const req of await cur.keys()){const r=await cur.match(req);if(r)await good.put(req,r.clone())}})())});
const OFFLINE_HTML=`<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<body style="background:#0E1420;color:#E8EEF6;font-family:-apple-system,sans-serif;text-align:center;padding:60px 24px">
<h2 style="color:#FFB020">NORTH ROUTE</h2><h3>OFFLINE COPY IS INCOMPLETE</h3>
<p style="color:#93A1B4">Connect once to Wi-Fi or mobile data and tap "Download Offline Copy" under More.</p>
<button style="margin:6px;padding:14px 18px;border-radius:12px;border:0;background:#FFB020;font-weight:700" onclick="location.reload()">TRY MOBILE DATA</button>
<button style="margin:6px;padding:14px 18px;border-radius:12px;border:1px solid #444;background:#1B2536;color:#E8EEF6" onclick="location.href='./?lkg=1'">OPEN ANY SAVED CONTENT</button></body>`;
self.addEventListener('fetch',e=>{
 const u=new URL(e.request.url);
 if(e.request.method!=='GET'||u.origin!==location.origin)return;
 const page=u.pathname.split('/').pop();
 // network-test.html is a pure connectivity probe: never touched by the worker.
 if(page==='network-test.html')return;
 // safe.html is the rescue page: network first, cached copy only when offline.
 if(page==='safe.html'){e.respondWith((async()=>{
  try{
   const r=await fetch(e.request);
   if(ours(r)){const c=await caches.open(CUR);await c.put('./safe.html',r.clone())}
   return r;
  }catch(err){
   const c=await caches.open(CUR);
   const hit=await c.match('./safe.html');
   if(hit)return hit;
   const g=await caches.open(GOOD);
   const gh=await g.match('./safe.html');
   if(gh)return gh;
   return new Response(OFFLINE_HTML,{headers:{'Content-Type':'text/html'}});
  }})());return}
 const isNav=e.request.mode==='navigate'||e.request.destination==='document';
 e.respondWith((async()=>{
  const cur=await caches.open(CUR);
  const refresh=(async()=>{try{
   const r=await fetch(e.request);
   if(ours(r)){await cur.put(isNav?KEY:u.pathname,r.clone())}
   return r}catch(err){return null}})();
  if(isNav){
   if(u.searchParams.has('lkg')){const g=await caches.open(GOOD);const lk=await g.match(KEY);if(lk)return lk}
   const hit=await cur.match(KEY);
   if(hit){e.waitUntil(refresh.catch(()=>{}));return hit}
   const net=await refresh;
   if(net)return net;
   const g=await caches.open(GOOD);
   const lk=await g.match(KEY);
   if(lk)return lk;
   return new Response(OFFLINE_HTML,{headers:{'Content-Type':'text/html'}})}
  const hit=await cur.match(u.pathname)||await cur.match(e.request,{ignoreSearch:true});
  if(hit){e.waitUntil(refresh.catch(()=>{}));return hit}
  const net=await refresh;
  if(net)return net;
  const g=await caches.open(GOOD);
  const lk=await g.match(u.pathname)||await g.match(e.request,{ignoreSearch:true});
  if(lk)return lk;
  throw new Error('offline, not cached')})())});

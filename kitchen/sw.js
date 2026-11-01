// Cache ONLY the shell. Never cache API, staff sessions, customer data or config.
const CACHE='missmaki-kitchen-v1';
const SHELL=['/kitchen/','/kitchen/kitchen.css','/kitchen/kitchen.js','/kitchen/icon-192.png','/kitchen/manifest.webmanifest'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('missmaki-kitchen-')&&k!==CACHE).map(k=>caches.delete(k)))));});
self.addEventListener('fetch',event=>{if(event.request.method!=='GET')return;const url=new URL(event.request.url);if(url.origin!==self.location.origin||!SHELL.includes(url.pathname))return;event.respondWith(fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(c=>c.put(event.request,copy)));}return response;}).catch(()=>caches.match(event.request)));});

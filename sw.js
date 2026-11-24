// FeGest Feria — service worker: la app abre y funciona sin internet.
const VERSION = 'fegest-feria-v1.0.21';
const ARCHIVOS = ['./', './index.html', './nucleo.js', './app.js', './estilos.css', './zxing.min.js', './manifest.webmanifest',
  './icon-192.png', './icon-512.png', './icon-maskable-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;          // la nube (Google) nunca pasa por acá
  // Primero lo guardado (arranca al instante, sin internet); en paralelo busca una versión nueva.
  e.respondWith(caches.open(VERSION).then(async cache => {
    const guardado = await cache.match(req, { ignoreSearch: true });
    const red = fetch(req).then(r => { if (r && r.ok) cache.put(req, r.clone()); return r; }).catch(() => null);
    if (guardado) { e.waitUntil(red); return guardado; }
    const r = await red;
    if (r) return r;
    if (req.mode === 'navigate') return (await cache.match('./index.html')) || Response.error();
    return Response.error();
  }));
});

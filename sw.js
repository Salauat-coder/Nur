/* Нұр — қарапайым офлайн кэш: қолданба қабығы мен Құран мәтіні. API (ауа райы, аударма, аудио) кэштелмейді — олар localStorage-та сақталады. */
const V = 'nur-shell-v1';
const SHELL = ['./', 'index.html', 'css/style.css', 'js/data.js', 'js/prayer.js', 'js/app.js', 'js/quran.js', 'js/qibla.js', 'js/dhikr.js', 'data/quran-ar.json'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(V).then(ch => ch.put(e.request, c)); return r; }).catch(() => caches.match(e.request).then(m => m || caches.match('index.html'))));
});

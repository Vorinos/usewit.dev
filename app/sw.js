/* Lets usewit.dev/app be installed as an app and open without a connection.
   The app page is fetched fresh whenever there is a connection (so an update shows at once) and kept for when there
   is none; the site's other files are served from the cache and refreshed behind. Requests to other sites, such as the
   AI you ask, are never touched, and your notes are not here: they live in the browser's own storage. */
const CACHE = 'wit-app-v2';
const PAGE = '/app/';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll([PAGE, '/app/manifest.webmanifest', '/app/icon-192.png', '/app/icon-512.png', '/favicon.svg'])));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== self.location.origin) return;
  if (r.mode === 'navigate') {
    e.respondWith(fetch(r).then(res => {
      if (res.ok && (u.pathname === PAGE || u.pathname === PAGE + 'index.html')) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(PAGE, copy)); }
      return res;
    }).catch(() => caches.match(PAGE)));
    return;
  }
  e.respondWith(caches.match(r).then(hit => {
    const fresh = fetch(r).then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(r, copy)); } return res; }).catch(() => hit);
    return hit || fresh;
  }));
});

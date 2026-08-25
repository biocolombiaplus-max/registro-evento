// Atlético Norte FC — Service Worker
const SW_VER = 'v9.30-2026-08-25';
const STATIC_CACHE = 'an-static-' + SW_VER;
const ICON_CACHE   = 'an-club-icon-' + SW_VER;

const PRECACHE = [
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(STATIC_CACHE)
      .then(c => c.addAll(PRECACHE).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== STATIC_CACHE && k !== ICON_CACHE)
            .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({type:'window', includeUncontrolled:true}))
      .then(cls => {
        // Navigate every open tab to a fresh timestamped URL.
        // The SW fetch handler intercepts this with no-store headers so
        // GitHub CDN and iOS disk cache are both bypassed.
        cls.forEach(c => {
          const freshUrl = c.url.split('?')[0] + '?_sw=' + SW_VER + '&_t=' + Date.now();
          try { c.navigate(freshUrl); } catch(err) {
            c.postMessage({type:'SW_UPDATED', ver:SW_VER});
          }
        });
      })
  );
});

self.addEventListener('message', e => {
  if (!e.data) return;
  if (e.data.type === 'SKIP_WAITING') { self.skipWaiting(); return; }
  if (e.data.type === 'SET_CLUB_ICON') {
    const { buf192, buf512 } = e.data;
    caches.open(ICON_CACHE).then(cache => {
      const headers = { 'Content-Type': 'image/png', 'Cache-Control': 'no-cache' };
      if (buf192) {
        const r192 = new Response(new Blob([buf192], {type:'image/png'}), {status:200, headers});
        cache.put('/an-logo-192.png', r192.clone());
        cache.put('/an-logo-192m.png', r192.clone());
      }
      if (buf512) {
        const r512 = new Response(new Blob([buf512], {type:'image/png'}), {status:200, headers});
        cache.put('/an-logo-512.png', r512.clone());
        cache.put('/an-logo-512m.png', r512.clone());
      }
    });
  }
});

self.addEventListener('push', e => {
  if (!e.data) return;
  let payload;
  try { payload = e.data.json(); } catch(x) { payload = {title:'Atlético Norte', body: e.data.text()}; }
  const title = payload.title || '⚽ Atlético Norte F.C.';
  const options = {
    body: payload.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: payload.tag || 'an-notif-' + Date.now(),
    data: payload.data || {},
    vibrate: [100, 50, 100],
    requireInteraction: payload.type === 'goal'
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({type:'window', includeUncontrolled:true}).then(cs => {
      for (const c of cs) { if ('focus' in c) return c.focus(); }
      return clients.openWindow('/');
    })
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.pathname === '/manifest.json' || url.pathname === '/version.json') {
    e.respondWith(fetch(new Request(e.request.url, {cache:'no-store'})));
    return;
  }
  const iconPaths = ['/an-logo-192.png','/an-logo-512.png','/an-logo-192m.png','/an-logo-512m.png',
                     '/icon-192.png','/icon-512.png','/icon-192-maskable.png','/icon-512-maskable.png'];
  if (iconPaths.includes(url.pathname)) {
    e.respondWith(
      fetch(new Request(e.request.url, {cache: 'no-store'}))
        .then(r => {
          if (r && r.ok) { caches.open(ICON_CACHE).then(c => c.put(url.pathname, r.clone())); }
          return r;
        })
        .catch(() => caches.open(ICON_CACHE).then(c => c.match(url.pathname)))
    );
    return;
  }
  if (e.request.mode === 'navigate') {
    // Use FULL URL (preserves ?_v=timestamp) so Cloudflare CDN sees a unique URL
    // and is forced to fetch from origin — url.pathname alone strips the cache-buster.
    const freshReq = new Request(e.request.url, {
      cache: 'no-store',
      headers: { 'Pragma': 'no-cache', 'Cache-Control': 'no-cache, no-store' }
    });
    e.respondWith(fetch(freshReq).catch(() => fetch(e.request, { cache: 'no-store' })));
    return;
  }
  if (url.hostname === 'www.gstatic.com') {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(r => {
          caches.open(STATIC_CACHE).then(c => c.put(e.request, r.clone()));
          return r;
        });
      })
    );
    return;
  }
});

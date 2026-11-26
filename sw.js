// Boîte à outils COA — copie hors connexion (réseau d'abord, copie du téléphone si pas de réseau).
// Changer CACHE purge l'ancienne copie.
const CACHE = 'coa-outils-v82';
const FILES = ['./', 'index.html', 'airports.json', 'airlines.json', 'aircraft.json', 'manifest.json', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x.startsWith('coa-outils') && x !== CACHE).map(x => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== self.location.origin) return;
  e.respondWith(fetch(r, { cache: 'no-cache' }).then(res => { if (res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(r, cp)); } return res; })
    .catch(() => caches.match(r, { ignoreSearch: true })));
});
// notifications envoyées par le relais (annulations, déroutements, retards, panne de la source des vols)
self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (x) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Boîte à outils COA', { body: d.body || '', tag: d.tag, icon: 'icon-192.png', badge: 'icon-192.png', data: { url: d.url || './#vols' } }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) if ('focus' in c) { if (c.navigate) c.navigate(url).catch(() => {}); return c.focus(); }
    return clients.openWindow(url);
  }));
});

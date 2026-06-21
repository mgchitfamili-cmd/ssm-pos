/* Sone Sone Mommy POS — service worker. Bump CACHE on each deploy to push updates. */
const CACHE = 'ssm-pos-v9';
const ASSETS = [
  './', 'index.html', 'receipts.html', 'products.html', 'staff.html',
  'delivery.html', 'payments.html', 'report.html', 'setting.html', 'print.html',
  'receipt.js', 'menu-logo.js', 'manifest.json', 'icon-192.png', 'icon-512.png', 'icon-180.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var isHTML = req.mode === 'navigate' || (req.headers.get('accept') || '').indexOf('text/html') >= 0;
  if (isHTML) {
    // network-first for pages so updates show when online
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); });
        return res;
      }).catch(function () { return caches.match(req).then(function (r) { return r || caches.match('index.html'); }); })
    );
  } else {
    // cache-first for assets
    e.respondWith(
      caches.match(req).then(function (c) {
        return c || fetch(req).then(function (res) {
          var copy = res.clone(); caches.open(CACHE).then(function (ch) { ch.put(req, copy); });
          return res;
        });
      })
    );
  }
});

// ── Service Worker — Delivery Dashboard (PWA offline support) ──────────────
// ဒီ file ကို update ထုတ်တိုင်း အောက်က CACHE_NAME ကို v1 → v2 → v3 ... လို့ ပြောင်းပါ
// (မပြောင်းရင် user တွေရဲ့ browser က ဟောင်းတဲ့ cache version ကို ဆက်သုံးနေမှာမို့
//  ပြင်ထားတဲ့ ပြောင်းလဲမှုတွေ မမြင်ရနိုင်ပါ)
const CACHE_NAME = "ssm-delivery-v2";

// App shell — offline ဖြစ်ရင်တောင် ချက်ချင်း ပြန်ဖွင့်လို့ရအောင် အရင်ဆုံး cache ချထားမယ့် file တွေ
// (relative path — server ပေါ်က ဘယ် folder ထားထားပဲ ဖြစ်ဖြစ် အလုပ်လုပ်အောင်)
const PRECACHE_URLS = [
  "./",
  "delivery.html",
  "firebase-init.js",
  "menu-logo.js",
  "manifest.json",
  "icon-180.png",
];

// ── Install — app shell ကို cache ချ ──────────────────────────────────────
self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) {
        // file တစ်ခုချင်းစီကို သီးသန့် fetch လုပ်ပြီး ရှိသလောက်ပဲ cache ချ —
        // file တစ်ခုမတွေ့လို့ (404) install တစ်ခုလုံး fail မဖြစ်အောင်
        return Promise.all(
          PRECACHE_URLS.map(function (url) {
            return cache.add(url).catch(function () {});
          })
        );
      })
      .then(function () { return self.skipWaiting(); })
  );
});

// ── Activate — cache version ဟောင်းတွေ ရှင်းပြီး ချက်ချင်း အလုပ်စ ──────────
self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(
          keys.map(function (key) {
            if (key !== CACHE_NAME) return caches.delete(key);
          })
        );
      })
      .then(function () { return self.clients.claim(); })
  );
});

// ── Fetch ──────────────────────────────────────────────────────────────────
// - Firebase/Firestore/Google APIs (cross-origin) → SW ဝင်မစွက်ဘူး၊ browser ကို တိုက်ရိုက် သွားခိုင်း
//   (ဒါမှ cloud data အသစ်ဆုံး/live sync အမြဲ မှန်မှာမို့)
// - HTML (page navigation)     → Network-first: internet ရရင် အသစ်ဆုံး version ယူ၊ မရရင် cache ကို fallback
// - JS/CSS/ပုံ (static assets) → Cache-first + background update (stale-while-revalidate) — မြန်မြန်ပွင့်၊ update ကလည်း ကျန်တယ်
self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;               // POST/PUT စတာတွေ (Firestore write) ကို လုံးဝ မထိ

  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // cross-origin (Firebase, CDN scripts) — SW မစွက်ဘူး

  if (req.mode === "navigate" || req.destination === "document") {
    event.respondWith(
      fetch(req)
        .then(function (res) {
          var copy = res.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(req, copy); });
          return res;
        })
        .catch(function () { return caches.match(req).then(function (r) { return r || caches.match("delivery.html"); }); })
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(function (cached) {
      var fetchPromise = fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE_NAME).then(function (cache) { cache.put(req, copy); });
        return res;
      }).catch(function () { return cached; });   // offline ဖြစ်ရင် cache ရှိရင် ဒါကိုပဲ ပြန်ပေး
      return cached || fetchPromise;
    })
  );
});

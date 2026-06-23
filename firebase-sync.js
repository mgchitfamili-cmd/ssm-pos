/* ──────────────────────────────────────────────────────────────
   Sone Sone Mommy POS — Firebase data sync
   Stage 3a: "products" only (safe single-key test).
   localStorage ကို source အဖြစ်ထားပြီး Firestore နဲ့ mirror လုပ်တယ်။
   ──────────────────────────────────────────────────────────────
   လုံခြုံအောင်:
   - Firestore doc မရှိသေးရင် local data ကို မဖျက်ဘဲ cloud ကို SEED တင်တယ်။
   - remote ≠ local ဆိုမှသာ local ကို update (တူရင် ဘာမှမလုပ်)။
   - offline edit တွေက Firestore offline queue (enablePersistence) နဲ့ ထိန်းတယ်။
   ────────────────────────────────────────────────────────────── */
(function () {
  var SYNC_KEYS = ["products"];          // later: shopSettings, staffList
  var COL = "appdata";
  var loadedAt = Date.now();
  var rawSet = localStorage.setItem.bind(localStorage);   // patch မလုပ်ခင် မူရင်း setItem
  var lastPush = {};                                       // key → local save လုပ်ခဲ့တဲ့ အချိန် (race ကာကွယ်ဖို့)

  function refreshPage(key) {
    // reload မလုပ်တော့ဘဲ (data မပျက်အောင်) — page ရဲ့ loader ပဲ ခေါ်
    try {
      if (key === "products"   && typeof window.loadProducts === "function") window.loadProducts();
      else if (key === "shopSettings" && typeof window.loadSettings === "function") window.loadSettings();
      else if (key === "staffList"    && typeof window.loadStaff    === "function") window.loadStaff();
    } catch (e) {}
  }

  function start() {
    if (!window.fb || !window.fb.db || !window.fbUser) return;
    var db = window.fb.db;

    // ── PUSH: local save → Firestore ──
    var origSet = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function (key, val) {
      origSet(key, val);
      if (SYNC_KEYS.indexOf(key) >= 0) {
        lastPush[key] = Date.now();
        db.collection(COL).doc(key).set({ json: val, updatedAt: lastPush[key] })
          .catch(function (e) { console.warn("[sync] push failed:", key, e); });
      }
    };

    // ── PULL: Firestore → local ──
    SYNC_KEYS.forEach(function (key) {
      db.collection(COL).doc(key).onSnapshot(function (snap) {
        var local = localStorage.getItem(key);
        if (!snap.exists) {
          // cloud မှာ မရှိသေး → local ရှိရင် seed (local မဖျက်)
          if (local && local !== "[]" && local !== "{}") {
            db.collection(COL).doc(key).set({ json: local, updatedAt: Date.now() }).catch(function () {});
          }
          return;
        }
        var remote = snap.data() && snap.data().json;
        if (remote == null || remote === local) return;   // တူ → ဘာမှမလုပ်

        // လတ်တလော local save ကို remote (ဟောင်း/race) နဲ့ မဖျက်အောင် ကာကွယ်
        var rAt = (snap.data() && snap.data().updatedAt) || 0;
        if (lastPush[key] && rAt <= lastPush[key]) {
          // ကျွန်တော်တို့ local က ပိုသစ် → remote ကို မယူဘဲ local ပြန်တင်
          db.collection(COL).doc(key).set({ json: local, updatedAt: lastPush[key] }).catch(function () {});
          return;
        }

        rawSet(key, remote);                               // remote ပိုသစ် → local update
        refreshPage(key);
      }, function (err) { console.warn("[sync] listen error:", key, err); });
    });
  }

  if (window.fb && window.fbUser) start();
  else document.addEventListener("fb-ready", start);
})();

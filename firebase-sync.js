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
  var RELOAD_WINDOW = 3000;              // page load ပြီး ဒီ ms အတွင်း ကွဲရင် reload
  var loadedAt = Date.now();
  var rawSet = localStorage.setItem.bind(localStorage);   // patch မလုပ်ခင် မူရင်း setItem

  function refreshPage(key) {
    // page load ပြီးခါစ ဆို reload (user မထိခင်)၊ မဟုတ်ရင် render function ခေါ်
    if (Date.now() - loadedAt < RELOAD_WINDOW) { location.reload(); return; }
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
        db.collection(COL).doc(key).set({ json: val, updatedAt: Date.now() })
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
        rawSet(key, remote);                               // local update (patch မ fire အောင် rawSet)
        refreshPage(key);
      }, function (err) { console.warn("[sync] listen error:", key, err); });
    });
  }

  if (window.fb && window.fbUser) start();
  else document.addEventListener("fb-ready", start);
})();

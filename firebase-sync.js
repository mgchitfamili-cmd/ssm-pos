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
  var SYNC_KEYS = [];          // ⏸️ ခဏပိတ်ထား (diagnostic) — ["products"] ပြန်ထည့်ရင် sync ပြန်ဖွင့်
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
    console.log("[SSM sync] v2 (push-only) loaded");
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

    // ── PULL: Firestore → local (page ဖွင့်ချိန် တစ်ခါပဲ ဆွဲ၊ ပြီးရင် local ကို ဘယ်တော့မှ မဖျက်) ──
    var initialDone = {};
    SYNC_KEYS.forEach(function (key) {
      db.collection(COL).doc(key).onSnapshot(function (snap) {
        var local = localStorage.getItem(key);

        if (!snap.exists) {
          if (local && local !== "[]" && local !== "{}") {  // cloud မရှိ → seed
            db.collection(COL).doc(key).set({ json: local, updatedAt: Date.now() }).catch(function () {});
          }
          initialDone[key] = true;
          return;
        }

        var remote = snap.data() && snap.data().json;

        if (!initialDone[key]) {
          // ပထမဆုံး snapshot (page ဖွင့်ချိန်) — local save မလုပ်ရသေးရင်သာ cloud ကို ယူ
          initialDone[key] = true;
          if (remote != null && remote !== local && !lastPush[key]) {
            rawSet(key, remote);
            refreshPage(key);
          }
          return;
        }

        // ပထမ snapshot ပြီးနောက် — local ကို ဘယ်တော့မှ မဖျက် (push-only)။
        // cloud ပိုသစ်ရင် နောက် page ဖွင့်မှ ရမယ်။
      }, function (err) { console.warn("[sync] listen error:", key, err); });
    });
  }

  if (window.fb && window.fbUser) start();
  else document.addEventListener("fb-ready", start);
})();

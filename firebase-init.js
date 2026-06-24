/* ──────────────────────────────────────────────────────────────
   Sone Sone Mommy POS — Firebase init (Stage 1: Auth)
   ──────────────────────────────────────────────────────────────
   1) Firebase console → Project settings → Your apps → Web app →
      "SDK setup and configuration" → Config — အဲ့က တန်ဖိုးတွေ ဒီအောက်မှာ ထည့်ပါ။
   2) Authentication → Sign-in method → Email/Password → Enable
   3) Authentication → Users → Add user (email + password) — login အတွက်
   (firebaseConfig က လျှို့ဝှက်ချက် မဟုတ်ပါ — client code ထဲ ထည့်ထားလို့ ရပါတယ်။
    လုံခြုံရေးက Firestore Rules + Auth နဲ့ ထိန်းတာပါ။)
   ────────────────────────────────────────────────────────────── */
(function () {
  var firebaseConfig = {
    apiKey:            "AIzaSyBgSjtlHiW8n5mQ_emo-hMzHLWwKSLAd6k",
    authDomain:        "ssm-pos.firebaseapp.com",
    projectId:         "ssm-pos",
    storageBucket:     "ssm-pos.firebasestorage.app",
    messagingSenderId: "335425237",
    appId:             "1:335425237:web:a5bf4d65d552d98d0b3c5c"
  };

  // compat SDK (vanilla multi-page app အတွက် အသင့်တော်ဆုံး)။ version ကို လိုရင် ပြောင်းလို့ရ။
  var VER  = "10.13.2";
  var base = "https://www.gstatic.com/firebasejs/" + VER + "/";
  var libs = ["firebase-app-compat.js", "firebase-auth-compat.js", "firebase-firestore-compat.js"];

  function loadSeq(i, done) {
    if (i >= libs.length) return done();
    var s = document.createElement("script");
    s.src = base + libs[i];
    s.onload  = function () { loadSeq(i + 1, done); };
    s.onerror = function () {
      console.error("Firebase SDK load failed:", libs[i]);
      document.dispatchEvent(new Event("fb-error"));
    };
    document.head.appendChild(s);
  }

  loadSeq(0, function () {
    try {
      firebase.initializeApp(firebaseConfig);
      window.fb = {
        auth: firebase.auth(),
        db:   firebase.firestore(),
        login:  function (email, pw) { return window.fb.auth.signInWithEmailAndPassword(email, pw); },
        logout: function () { return window.fb.auth.signOut(); }
      };
      // offline cache (PWA အတွက်)
      try { window.fb.db.enablePersistence({ synchronizeTabs: true }); } catch (e) {}

      // ── data sync (inlined — သီးခြား firebase-sync.js မလို) ──────────
      // page ဖွင့်ချိန် cloud ကို တစ်ခါပဲ ဆွဲ၊ ပြီးရင် local ကို ဘယ်တော့မှ မဖျက် (push-only)။
      var SYNC_KEYS   = ["products", "shopSettings", "staffList", "ssm_admin_pin"];   // + admin PIN sync
      var COL         = "appdata";
      var rawSet      = localStorage.setItem.bind(localStorage);
      var lastPush    = {};
      var initialDone = {};
      var syncStarted = false;

      function ssmRefresh(key) {
        try {
          if (key === "products"     && typeof window.loadProducts === "function") window.loadProducts();
          else if (key === "shopSettings" && typeof window.loadSettings === "function") window.loadSettings();
          else if (key === "staffList"    && typeof window.loadStaff    === "function") window.loadStaff();
        } catch (e) {}
      }

      function ssmStartSync() {
        if (syncStarted) return; syncStarted = true;
        var db = window.fb.db;
        console.log("[SSM sync] inline v6 (orderNo + newest-top) loaded");

        // device id (sales doc-id unique ဖြစ်အောင်; auto, once)
        var deviceId = localStorage.getItem("ssm_deviceId");
        if (!deviceId) { deviceId = "d" + Math.random().toString(36).slice(2, 8); localStorage.setItem("ssm_deviceId", deviceId); }
        var OWN = deviceId + "__";

        // PUSH: local save → Firestore
        var origSet = localStorage.setItem.bind(localStorage);
        localStorage.setItem = function (key, val) {
          origSet(key, val);
          if (SYNC_KEYS.indexOf(key) >= 0) {
            lastPush[key] = Date.now();
            db.collection(COL).doc(key).set({ json: val, updatedAt: lastPush[key] })
              .catch(function (e) { console.warn("[sync] push failed:", key, e); });
          }
          if (key === "salesHistory") ssmPushSales(val);
        };

        // PULL (whole-key): products / shopSettings / staffList
        SYNC_KEYS.forEach(function (key) {
          db.collection(COL).doc(key).onSnapshot(function (snap) {
            var local = localStorage.getItem(key);
            if (!snap.exists) {
              if (local && local !== "[]" && local !== "{}") {
                db.collection(COL).doc(key).set({ json: local, updatedAt: Date.now() }).catch(function () {});
              }
              initialDone[key] = true;
              return;
            }
            var remote = snap.data() && snap.data().json;
            if (!initialDone[key]) {
              initialDone[key] = true;
              if (remote != null && remote !== local && !lastPush[key]) {
                rawSet(key, remote);
                ssmRefresh(key);
              }
              return;
            }
            // ပထမ snapshot ပြီးနောက် — push-only (local ကို ဘယ်တော့မှ မဖျက်)
          }, function (err) { console.warn("[sync] listen error:", key, err); });
        });

        // ── salesHistory: per-sale collection ("sales") — doc id = orderNo (device code နဲ့ unique) ──
        var SALES = "sales";
        var saleCache = {};            // orderNo -> content JSON (change detection)
        var trackedSids = {};          // orderNo -> true (delete baseline)
        var salesInitialDone = false;

        // doc id = orderNo (SSM-A-0001 …). edit လုပ်လည်း orderNo မပြောင်း → doc တူ → ဘောင်ချာ ၂ ခု မကွဲ
        function sidOf(s) {
          var id = (s && s.orderNo != null) ? String(s.orderNo).trim() : "";
          id = id.replace(/[\/\\#?%]/g, "-");                    // Firestore doc-id safe
          return id || ("no-" + deviceId + "-" + ((s && s.orderDate) || Date.now()));
        }
        function saleContent(s) { var c = {}; for (var k in s) { if (k !== "__sid" && k !== "__synced") c[k] = s[k]; } return c; }  // hidden meta မပါ

        // syncedIds: cloud မှာ မြင်ဖူး/တင်ဖူးတဲ့ orderNo (device-local, persist) → "ဖျက်ထားတာ vs အသစ်" ခွဲဖို့
        var syncedIds; try { syncedIds = JSON.parse(localStorage.getItem("ssm_syncedIds")) || {}; } catch (e) { syncedIds = {}; }
        function markSynced(id) { if (!syncedIds[id]) { syncedIds[id] = 1; try { origSet("ssm_syncedIds", JSON.stringify(syncedIds)); } catch (e) {} } }

        // delete baseline ကို current local ကနေ စ (merge မဖြစ်ခင် save ရင် တခြား sales မှားမဖျက်အောင်)
        try { (JSON.parse(localStorage.getItem("salesHistory")) || []).forEach(function (s) { trackedSids[sidOf(s)] = true; }); } catch (e) {}

        function ssmRefreshSales() {
          try {
            if (typeof window.renderHistory === "function") window.renderHistory();
            else if (typeof window.renderCards === "function") window.renderCards();
            else if (typeof window.render === "function") window.render();
          } catch (e) {}
        }

        function ssmPushSales(val) {
          var arr; try { arr = JSON.parse(val) || []; } catch (e) { return; }
          var seen = {};
          arr.forEach(function (s) {
            var sid = sidOf(s); seen[sid] = true;
            var content = saleContent(s);
            var js = JSON.stringify(content);
            markSynced(sid);
            if (saleCache[sid] === js) return;                   // unchanged → skip
            saleCache[sid] = js;
            lastPush["__sales"] = Date.now();
            var doc = content;
            if (js.length > 900000) { doc = JSON.parse(js); delete doc.paySS; delete doc.deliveryPhoto; }  // 1MB guard
            db.collection(SALES).doc(sid).set(doc).catch(function (e) { console.warn("[sales] push failed:", sid, e); });
          });
          // delete: baseline မှာ ရှိပြီး အခု ပျောက် → cloud doc ဖျက် (device မရွေး — admin ဖျက်နိုင်)
          Object.keys(trackedSids).forEach(function (sid) {
            if (!seen[sid]) { db.collection(SALES).doc(sid).delete().catch(function () {}); delete saleCache[sid]; }
          });
          trackedSids = seen;                                    // baseline အသစ် = current local sids
        }

        // PULL: load မှာ cloud sales merge (clobber-proof), ပြီးရင် push-only
        db.collection(SALES).onSnapshot(function (snap) {
          if (salesInitialDone) return;
          salesInitialDone = true;
          var byId = {};
          snap.forEach(function (d) {
            var s = d.data(); if (s.orderNo == null) s.orderNo = d.id;
            var sid = sidOf(s);
            byId[sid] = s; markSynced(sid);
            if (d.id === sid) saleCache[sid] = JSON.stringify(saleContent(s));        // format မှန် → change-detect cache
            else db.collection(SALES).doc(d.id).delete().catch(function () {});        // format ဟောင်း → ဖျက် (push က orderNo doc ပြန်ရေးမယ်)
          });
          if (lastPush["__sales"]) return;                       // session ထဲ save ပြီးပြီ → adopt မလုပ် (clobber မဖြစ်)
          var local; try { local = JSON.parse(localStorage.getItem("salesHistory")) || []; } catch (e) { local = []; }
          local.forEach(function (s) {
            var sid = sidOf(s);
            if (byId[sid]) return;                               // cloud မှာ ရှိ → cloud version သုံး
            if (syncedIds[sid]) return;                          // cloud တင်ဖူးပြီး အခု ပျောက် → ဖျက်ထားတာ → ပြန်မထည့်
            byId[sid] = s;                                       // အသစ် (cloud မရောက်သေး) → ထား + seed
          });
          var merged = Object.keys(byId).map(function (k) { return byId[k]; });
          merged.sort(function (a, b) { return String(a.orderDate || "").localeCompare(String(b.orderDate || "")); });  // အဟောင်းအရင် (page .reverse() → အသစ် အပေါ်ဆုံး)
          rawSet("salesHistory", JSON.stringify(merged));
          trackedSids = {}; merged.forEach(function (s) { trackedSids[sidOf(s)] = true; });  // baseline = merged
          ssmRefreshSales();
          ssmPushSales(JSON.stringify(merged));                  // missing sales cloud ကို seed
        }, function (err) { console.warn("[sales] listen error:", err); });
      }

      // ── Auth guard ──────────────────────────────────────────────
      // login မဝင်ထားရင် login.html ကို ပို့။ Firebase ချိတ်လို့မရရင်တော့
      // ဘာမှ မလုပ်ဘဲ app ကို ဆက်သုံးခွင့်ပေး (fail-open — app မပိတ်မိအောင်)။
      var onLogin = /login\.html$/i.test(location.pathname);
      window.fb.auth.onAuthStateChanged(function (user) {
        window.fbUser = user || null;
        if (!user && !onLogin) { location.replace("login.html"); return; }
        if (user && onLogin)   { location.replace("index.html"); return; }
        if (user) ssmStartSync();   // login ဝင်ပြီး → data sync စ
        document.dispatchEvent(new Event("fb-ready"));
      });
    } catch (e) {
      console.error("Firebase init error:", e);
      document.dispatchEvent(new Event("fb-error"));
    }
  });
})();

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
      var _db = firebase.firestore();
      // iOS/Safari မှာ Firestore realtime connection (WebChannel) မချိတ်တတ်လို့ long-polling သုံး (settings ကို db သုံးမသုံးခင် ခေါ်ရမယ်)
      try { _db.settings({ experimentalForceLongPolling: true, merge: true }); } catch (e) { console.warn("[fb] settings:", e); }
      window.fb = {
        auth: firebase.auth(),
        db:   _db,
        login:  function (email, pw) { return window.fb.auth.signInWithEmailAndPassword(email, pw); },
        logout: function () { return window.fb.auth.signOut(); }
      };
      // offline cache (PWA အတွက်)
      try { window.fb.db.enablePersistence({ synchronizeTabs: true }).catch(function () {}); } catch (e) {}

      // ── data sync (inlined — သီးခြား firebase-sync.js မလို) ──────────
      // page ဖွင့်ချိန် cloud ကို တစ်ခါပဲ ဆွဲ၊ ပြီးရင် local ကို ဘယ်တော့မှ မဖျက် (push-only)။
      var SYNC_KEYS    = ["products", "shopSettings", "staffList", "ssm_admin_pin"];   // + admin PIN sync
      var COL          = "appdata";
      var _protoSet    = Storage.prototype.setItem;                 // original (iOS Safari မှာ instance override အလုပ်မလုပ်လို့ prototype သုံး)
      var rawSet       = function (k, v) { _protoSet.call(localStorage, k, v); };
      var origSet      = rawSet;                  // pre-patch original (recursion မဖြစ်အောင်)
      var lastPush     = {};
      var initialDone  = {};
      var syncStarted  = false;
      var _doPushKey   = null;                    // (key,val) → appdata push (sync ready မှ)
      var _doPushSales = null;                    // (val) → sales push (sync ready မှ)
      var _pendKeys    = {};                      // queued appdata pushes
      var _pendSales   = null;                    // queued salesHistory val

      // EARLY setItem patch — auth/sync မ ready ခင် save လုပ်ရင်လည်း lastPush ချက်ချင်း set။
      // (iOS မှာ SDK နှေး၍ edit save ပြီးမှ sync စလို့ merge က cloud အဟောင်းနဲ့ ပြန်ဖျက်တဲ့ bug fix)
      var _salesSnap = {};   // orderNo -> content hash (_u မပါ) — edit ဖြစ်မဖြစ် သိရန် + _u stamp
      function _saleHash(s) { var c = {}; for (var k in s) { if (k !== "_u" && k !== "__sid" && k !== "__synced") c[k] = s[k]; } return JSON.stringify(c); }
      try { (JSON.parse(localStorage.getItem("salesHistory")) || []).forEach(function (s) { _salesSnap[String(s.orderNo)] = _saleHash(s); }); } catch (e) {}

      Storage.prototype.setItem = function (key, val) {
        if (this !== localStorage) { return _protoSet.call(this, key, val); }   // sessionStorage → မထိ
        if (key === "salesHistory") {
          try {
            var arr = JSON.parse(val) || [], changed = false;
            arr.forEach(function (s) {
              var id = String(s.orderNo);
              var h = _saleHash(s);
              if (_salesSnap[id] !== h) { s._u = Date.now(); _salesSnap[id] = h; changed = true; }   // ပြောင်းသွားရင် edit-time stamp (LWW — iOS edit fix)
            });
            if (changed) val = JSON.stringify(arr);
          } catch (e) {}
        }
        _protoSet.call(this, key, val);
        if (SYNC_KEYS.indexOf(key) >= 0) {
          lastPush[key] = Date.now();
          if (_doPushKey) _doPushKey(key, val); else _pendKeys[key] = val;
        }
        if (key === "salesHistory") {
          lastPush["__sales"] = Date.now();
          if (_doPushSales) _doPushSales(val); else _pendSales = val;
        }
      };

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
        console.log("[SSM sync] inline v27 (inline-img+prune50) loaded");
        window.SSM_SYNC_VER = "v27";

        // device id (sales doc-id unique ဖြစ်အောင်; auto, once)
        var deviceId = localStorage.getItem("ssm_deviceId");
        if (!deviceId) { deviceId = "d" + Math.random().toString(36).slice(2, 8); localStorage.setItem("ssm_deviceId", deviceId); }
        var OWN = deviceId + "__";

        // PUSH ready — early-patch ကို တကယ့် push function တွဲ (sync ready ပြီ)
        _doPushKey = function (key, val) {
          db.collection(COL).doc(key).set({ json: val, updatedAt: Date.now() })
            .catch(function (e) { console.warn("[sync] push failed:", key, e); });
        };
        _doPushSales = function (val) { ssmPushSales(val); };

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
        // content = cloud + localStorage မှာ သိမ်းမယ့် အပိုင်း — ပုံ (paySS/deliveryPhoto) ကို inline ပါ ထည့် (HTML က inline ပြတယ်)
        function saleContent(s) { var c = {}; for (var k in s) { if (k !== "__sid" && k !== "__synced") c[k] = s[k]; } return c; }

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

        // ── PRUNE: ၅၀ ရက်ကျော် ဘောင်ချာဟောင်းကို cloud ကနေသာ ဖယ် (storage/read free-tier ထဲ နေအောင်)။ local + device အားလုံးမှာ အပြည့် ကျန် ──
        var PRUNE_DAYS = 50;
        function isOldSale(s) {
          try {
            var t = (s && s.orderDate) ? new Date(s.orderDate).getTime() : NaN;
            if (!t || isNaN(t)) return false;                    // date မရှိ/မဖတ်နိုင် → ဘယ်တော့မှ prune မလုပ် (safe)
            return (Date.now() - t) > PRUNE_DAYS * 86400000;
          } catch (e) { return false; }
        }
        function ssmPruneOldSales(cloudIds) {
          try { var last = +(localStorage.getItem("ssm_lastPrune") || 0); if (Date.now() - last < 12 * 3600000) return; } catch (e) {}  // device တစ်လုံးကို ၁၂ နာရီ တစ်ခါပဲ
          var local; try { local = JSON.parse(localStorage.getItem("salesHistory")) || []; } catch (e) { return; }
          local.forEach(function (s) {
            var sid = sidOf(s);
            if (isOldSale(s) && cloudIds[sid]) {                 // ဟောင်း + cloud မှာ ရှိသေး → cloud ကနေသာ ဖျက် (local မထိ)
              db.collection(SALES).doc(sid).delete().catch(function () {});
              delete saleCache[sid];
            }
          });
          try { origSet("ssm_lastPrune", String(Date.now())); } catch (e) {}
        }

        function ssmPushSales(val) {
          var arr; try { arr = JSON.parse(val) || []; } catch (e) { return; }
          var seen = {};
          arr.forEach(function (s) {
            var sid = sidOf(s); seen[sid] = true;
            if (isOldSale(s)) return;                              // ၅၀ ရက်ကျော် → cloud ကို မ push (prune ထားတာ ပြန်မတင်); local မှာ ကျန်
            var content = saleContent(s);                          // ပုံ inline ပါ
            var js = JSON.stringify(content);
            markSynced(sid);
            if (saleCache[sid] === js) return;                     // unchanged → skip
            saleCache[sid] = js;
            lastPush["__sales"] = Date.now();
            var doc = content;
            if (js.length > 1000000) {                             // Firestore 1MB limit — ပုံ ဖြုတ်ပြီးမှ တင် (rare; compress ပြီးသား)
              doc = {}; for (var k in content) doc[k] = content[k]; doc.paySS = ""; doc.deliveryPhoto = "";
              console.warn("[sales] doc too big, image stripped →", sid);
            }
            db.collection(SALES).doc(sid).set(doc).catch(function (e) { console.warn("[sales] push failed:", sid, e); });
          });
          // delete: baseline မှာ ရှိပြီး အခု ပျောက် → cloud doc ဖျက်
          Object.keys(trackedSids).forEach(function (sid) {
            if (!seen[sid]) { db.collection(SALES).doc(sid).delete().catch(function () {}); delete saleCache[sid]; }
          });
          trackedSids = seen;
        }

        // PULL: load မှာ cloud sales merge (clobber-proof, ပုံ inline)၊ ပြီးရင် push-only
        db.collection(SALES).onSnapshot(function (snap) {
          if (salesInitialDone) return;
          salesInitialDone = true;
          var byId = {};
          snap.forEach(function (d) {
            var s = d.data(); if (s.orderNo == null) s.orderNo = d.id;
            var sid = sidOf(s);
            byId[sid] = s; markSynced(sid);
            if (d.id === sid) saleCache[sid] = JSON.stringify(saleContent(s));        // format မှန် → change-detect cache
            else db.collection(SALES).doc(d.id).delete().catch(function () {});        // format ဟောင်း → ဖျက်
          });
          ssmPruneOldSales(byId);                                // ၅၀ ရက်ကျော် ဘောင်ချာ cloud ကနေ ဖယ် (local + device အားလုံးမှာ ကျန်)
          if (lastPush["__sales"]) return;                       // session ထဲ save ပြီးပြီ → adopt မလုပ် (clobber မဖြစ်)
          var local; try { local = JSON.parse(localStorage.getItem("salesHistory")) || []; } catch (e) { local = []; }
          // ── ORDER-PRESERVING merge (positional editIndex မပျက်အောင် local အစီအစဉ် ထိန်း) ──
          var seenL = {};
          local.forEach(function (s) {                            // 1) local sale တွေ နေရာအတိုင်း ထား၊ cloud ပိုသစ်ရင် content ကို နေရာတည်ရာမှာ update
            var sid = sidOf(s); seenL[sid] = true;
            var c = byId[sid];
            if (c && (c._u || 0) > (s._u || 0)) {                 // cloud ပိုသစ် (တခြား device က edit) → in-place adopt (index မရွှေ့)
              for (var k in s) { if (!(k in c)) delete s[k]; }
              for (var k2 in c) { s[k2] = c[k2]; }
            }
          });
          local = local.filter(function (s) {                    // 2) cloud မှာ ပျောက်တာ → recent ဆို တခြား device ဖျက်တာ (ဖယ်)၊ ဟောင်း (၅၀ ရက်ကျော်) ဆို prune လုပ်တာ (local မှာ ထား)
            var sid = sidOf(s);
            if (byId[sid]) return true;                          // cloud မှာ ရှိ → ထား
            if (!syncedIds[sid]) return true;                    // တင်ဖူးတာ မဟုတ် (local အသစ်) → ထား
            if (isOldSale(s)) return true;                       // ဟောင်း + cloud ပျောက် → prune ထားတာ → local မှာ ဆက်ထား
            return false;                                        // recent + တင်ဖူး + cloud ပျောက် → တခြား device ဖျက် → ဖယ်
          });
          var extras = [];                                       // 3) cloud-only (တခြား device က အသစ်) → local အဆုံးမှာ ဆက် (orderDate အလိုက် စီ)
          Object.keys(byId).forEach(function (sid) { if (!seenL[sid]) extras.push(byId[sid]); });
          extras.sort(function (a, b) { return String(a.orderDate || "").localeCompare(String(b.orderDate || "")); });
          extras.forEach(function (s) { local.push(s); });
          try { rawSet("salesHistory", JSON.stringify(local)); } catch (e) { console.warn("[sales] localStorage quota:", e); }  // ပုံ inline → ကြီးနိုင်၊ quota ကျော်ရင် crash မဖြစ်အောင်
          try { _salesSnap = {}; local.forEach(function (s) { _salesSnap[String(s.orderNo)] = _saleHash(s); }); } catch (e) {}  // _u baseline refresh
          trackedSids = {}; local.forEach(function (s) { trackedSids[sidOf(s)] = true; });
          ssmRefreshSales();
          ssmPushSales(JSON.stringify(local));                   // missing sales cloud ကို seed
        }, function (err) { console.warn("[sales] listen error:", err); });

        // auth မရခင် (early-patch) queue ထားခဲ့တဲ့ save တွေ cloud တင် (iOS slow-start fix)
        if (_pendSales != null) { ssmPushSales(_pendSales); _pendSales = null; }
        Object.keys(_pendKeys).forEach(function (k) { _doPushKey(k, _pendKeys[k]); });
        _pendKeys = {};
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

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
  /* ── image store (IndexedDB) ── base64 ပုံတွေ localStorage မှာ မသိမ်းဘဲ ဒီမှာ သိမ်း
     (iOS Safari localStorage ~5MB quota ကျော်လို့ save မဝင်တဲ့ ပြဿနာ fix)။ key = orderNo+":pay" / ":del" ── */
  var _idb = null;
  function idbOpen() {
    if (_idb) return _idb;
    _idb = new Promise(function (res, rej) {
      try {
        var r = indexedDB.open("ssm-img", 1);
        r.onupgradeneeded = function () { r.result.createObjectStore("img"); };
        r.onsuccess = function () { res(r.result); };
        r.onerror   = function () { rej(r.error); };
      } catch (e) { rej(e); }
    });
    return _idb;
  }
  window.ssmImg = {
    get: function (key) {
      return idbOpen().then(function (db) { return new Promise(function (res) {
        try { var rq = db.transaction("img", "readonly").objectStore("img").get(key);
          rq.onsuccess = function () { res(rq.result || ""); }; rq.onerror = function () { res(""); };
        } catch (e) { res(""); } }); }).catch(function () { return ""; });
    },
    set: function (key, val) {
      if (!val) return window.ssmImg.del(key);
      return idbOpen().then(function (db) { return new Promise(function (res) {
        try { var t = db.transaction("img", "readwrite"); t.objectStore("img").put(val, key);
          t.oncomplete = function () { res(true); }; t.onerror = function () { res(false); };
        } catch (e) { res(false); } }); }).catch(function () { return false; });
    },
    del: function (key) {
      return idbOpen().then(function (db) { return new Promise(function (res) {
        try { var t = db.transaction("img", "readwrite"); t.objectStore("img").delete(key);
          t.oncomplete = function () { res(true); }; t.onerror = function () { res(true); };
        } catch (e) { res(true); } }); }).catch(function () { return true; });
    },
    // <img data-imgkey="..."> တွေကို IDB ကနေ src ဖြည့် (render ပြီးမှ ခေါ်)
    fill: function (root) {
      try {
        (root || document).querySelectorAll("img[data-imgkey]:not([data-imgfilled])").forEach(function (im) {
          var k = im.getAttribute("data-imgkey"); im.setAttribute("data-imgfilled", "1");
          window.ssmImg.get(k).then(function (v) { if (v) im.src = v; });
        });
      } catch (e) {}
    }
  };

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

      function ssmDbg(m) {
        try {
          var d = document.getElementById("__ssmdbg");
          if (!d) { d = document.createElement("div"); d.id = "__ssmdbg"; d.style.cssText = "position:fixed;left:0;right:0;bottom:0;z-index:2147483647;background:rgba(0,0,0,.85);color:#0f0;font:11px/1.3 monospace;padding:5px 7px;white-space:pre-wrap"; (document.body || document.documentElement).appendChild(d); }
          d.textContent = "[dbg] " + m;
        } catch (e) {}
      }

      // EARLY setItem patch — auth/sync မ ready ခင် save လုပ်ရင်လည်း lastPush ချက်ချင်း set။
      // (iOS မှာ SDK နှေး၍ edit save ပြီးမှ sync စလို့ merge က cloud အဟောင်းနဲ့ ပြန်ဖျက်တဲ့ bug fix)
      var _salesSnap = {};   // orderNo -> content hash (_u မပါ) — edit ဖြစ်မဖြစ် သိရန် + _u stamp
      function _saleHash(s) { var c = {}; for (var k in s) { if (k !== "_u" && k !== "__sid" && k !== "__synced") c[k] = s[k]; } return JSON.stringify(c); }
      try { (JSON.parse(localStorage.getItem("salesHistory")) || []).forEach(function (s) { _salesSnap[String(s.orderNo)] = _saleHash(s); }); } catch (e) {}

      Storage.prototype.setItem = function (key, val) {
        if (this !== localStorage) { return _protoSet.call(this, key, val); }   // sessionStorage → မထိ
        if (key === "salesHistory") {
          try {
            var arr = JSON.parse(val) || [], changed = false, _st = [];
            arr.forEach(function (s) {
              var id = String(s.orderNo), h = _saleHash(s);
              if (_salesSnap[id] !== h) { s._u = Date.now(); _salesSnap[id] = h; changed = true; _st.push(id + ":i" + ((s.items && s.items.length) || 0)); }   // ပြောင်းသွားရင် edit-time stamp
            });
            if (changed) val = JSON.stringify(arr);
            ssmDbg("SAVE stamp=" + (_st.join(",") || "NONE") + " total=" + arr.length);   // TEMP
          } catch (e) { ssmDbg("SAVE err " + e); }
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
        console.log("[SSM sync] inline v13 (proto-setItem) loaded");
        window.SSM_SYNC_VER = "v13";

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
        // content = localStorage မှာ သိမ်းမယ့်/နှိုင်းမယ့် အပိုင်း — base64 ပုံ (paySS/deliveryPhoto) မပါ (IDB မှာ သိမ်း)
        function saleContent(s) { var c = {}; for (var k in s) { if (k !== "__sid" && k !== "__synced" && k !== "paySS" && k !== "deliveryPhoto") c[k] = s[k]; } return c; }

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

        // local sale ကနေ base64 ပုံ ဖြုတ်ပြီး IDB ထဲ ရွှေ့ (flag hasPay/hasDel ထား)
        function offloadImages(s, sid) {
          if (s.paySS)         { window.ssmImg.set(sid + ":pay", s.paySS); s.hasPay = true; }
          if (s.deliveryPhoto) { window.ssmImg.set(sid + ":del", s.deliveryPhoto); s.hasDel = true; }
          s.paySS = ""; s.deliveryPhoto = "";
        }

        function ssmPushSales(val) {
          var arr; try { arr = JSON.parse(val) || []; } catch (e) { return; }
          var seen = {};
          arr.forEach(function (s) {
            var sid = sidOf(s); seen[sid] = true;
            var content = saleContent(s);
            var js = JSON.stringify(content);
            markSynced(sid);
            if (saleCache[sid] === js) return;                   // unchanged (ပုံ version ပါ content ထဲ) → skip
            saleCache[sid] = js;
            lastPush["__sales"] = Date.now();
            // cloud doc = full (ပုံ IDB ကနေ ဆွဲ ပြန်တွဲ)၊ local = text-only
            Promise.all([
              content.hasPay ? window.ssmImg.get(sid + ":pay") : Promise.resolve(""),
              content.hasDel ? window.ssmImg.get(sid + ":del") : Promise.resolve("")
            ]).then(function (imgs) {
              var doc = {}; for (var k in content) doc[k] = content[k];
              doc.paySS = imgs[0] || ""; doc.deliveryPhoto = imgs[1] || "";
              if (JSON.stringify(doc).length > 900000) { doc.paySS = ""; doc.deliveryPhoto = ""; }  // 1MB guard
              console.log("[sales] push →", sid);
              db.collection(SALES).doc(sid).set(doc).catch(function (e) { console.warn("[sales] push failed:", sid, e); });
            });
          });
          // delete: baseline မှာ ရှိပြီး အခု ပျောက် → cloud doc + IDB ပုံ ဖျက်
          Object.keys(trackedSids).forEach(function (sid) {
            if (!seen[sid]) { console.log("[sales] delete →", sid); db.collection(SALES).doc(sid).delete().catch(function () {}); delete saleCache[sid]; window.ssmImg.del(sid + ":pay"); window.ssmImg.del(sid + ":del"); }
          });
          trackedSids = seen;                                    // baseline အသစ် = current local sids
        }

        // PULL: load မှာ cloud sales merge (clobber-proof)၊ ပုံတွေ IDB ထဲ ရွှေ့၊ ပြီးရင် push-only
        db.collection(SALES).onSnapshot(function (snap) {
          if (salesInitialDone) return;
          salesInitialDone = true;
          var byId = {};
          snap.forEach(function (d) {
            var s = d.data(); if (s.orderNo == null) s.orderNo = d.id;
            var sid = sidOf(s);
            offloadImages(s, sid);                                // cloud ပုံ → IDB၊ local sale ကနေ ဖြုတ်
            byId[sid] = s; markSynced(sid);
            if (d.id === sid) saleCache[sid] = JSON.stringify(saleContent(s));        // format မှန် → change-detect cache
            else db.collection(SALES).doc(d.id).delete().catch(function () {});        // format ဟောင်း → ဖျက် (push က orderNo doc ပြန်ရေးမယ်)
          });
          // ── TEMP DEBUG: edited sale local vs cloud ──
          try {
            var _dl; try { _dl = JSON.parse(localStorage.getItem("salesHistory")) || []; } catch (e) { _dl = []; }
            var _r = _dl.filter(function (s) { return s._u && (Date.now() - s._u) < 180000; }).sort(function (a, b) { return (b._u || 0) - (a._u || 0); })[0];
            if (_r) {
              var _rs = sidOf(_r), _c = byId[_rs];
              ssmDbg(_rs + " | LOCAL u" + Math.round((Date.now() - _r._u) / 1000) + "s i" + ((_r.items && _r.items.length) || 0)
                + " | CLOUD " + (_c ? ((_c._u ? "u" + Math.round((Date.now() - _c._u) / 1000) + "s" : "uNONE") + " i" + ((_c.items && _c.items.length) || 0)) : "MISSING")
                + " | " + (lastPush["__sales"] ? "SKIP-guard" : "merge"));
            } else { ssmDbg("no recent edit | cloud=" + Object.keys(byId).length + " | " + (lastPush["__sales"] ? "SKIP-guard" : "merge")); }
          } catch (e) {}
          // ── /DEBUG ──
          if (lastPush["__sales"]) return;                       // session ထဲ save ပြီးပြီ → adopt မလုပ် (clobber မဖြစ်)
          var local; try { local = JSON.parse(localStorage.getItem("salesHistory")) || []; } catch (e) { local = []; }
          local.forEach(function (s) {
            var sid = sidOf(s);
            if (byId[sid]) {                                     // cloud မှာ ရှိ
              if ((s._u || 0) > (byId[sid]._u || 0)) { offloadImages(s, sid); byId[sid] = s; }  // local ပိုသစ် (edit push မရောက်သေး) → local ထား (revert မဖြစ်)
              return;
            }
            if (syncedIds[sid]) return;                          // cloud တင်ဖူးပြီး အခု ပျောက် → ဖျက်ထားတာ → ပြန်မထည့်
            offloadImages(s, sid);                               // local-only sale ပုံလည်း IDB ထဲ ရွှေ့
            byId[sid] = s;                                       // အသစ် (cloud မရောက်သေး) → ထား + seed
          });
          var merged = Object.keys(byId).map(function (k) { return byId[k]; });
          merged.sort(function (a, b) { return String(a.orderDate || "").localeCompare(String(b.orderDate || "")); });  // အဟောင်းအရင် (page .reverse() → အသစ် အပေါ်ဆုံး)
          rawSet("salesHistory", JSON.stringify(merged));        // text-only → localStorage သေးငယ် (iOS quota fix)
          try { _salesSnap = {}; merged.forEach(function (s) { _salesSnap[String(s.orderNo)] = _saleHash(s); }); } catch (e) {}  // _u baseline refresh
          trackedSids = {}; merged.forEach(function (s) { trackedSids[sidOf(s)] = true; });  // baseline = merged
          ssmRefreshSales();
          ssmPushSales(JSON.stringify(merged));                  // missing sales cloud ကို seed
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

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
      var _doLocalPrune = null;                   // (val?) → local image prune (quota ပြည့်ရင်)
      var _pendKeys    = {};                      // queued appdata pushes
      var _pendSales   = null;                    // queued salesHistory val

      // ── ပုံများ — local မှာ လုံးဝ မသိမ်း၊ Firestore "salesImages" collection မှာသာ ──
      var IMG_COL      = "salesImages";
      var IMG_CACHE    = {};                      // sid -> {paySS, deliveryPhoto} (session memory — upload ပြီးချင်း ကြည့်ရင် cloud မစောင့်ရအောင်)
      var _pendImgs    = {};                      // queued image pushes (sync မ ready ခင်)
      var _doPushImg   = null;                    // (sid, {paySS?, deliveryPhoto?}) → salesImages push
      function sidClean(orderNo) {
        var id = (orderNo == null) ? "" : String(orderNo).trim();
        return id.replace(/[\/\\#?%]/g, "-");
      }
      // sale array ထဲက inline ပုံတွေ ဖြုတ် → cache + push queue၊ flag (hasPay/hasDel) တင်
      function ssmStripImages(arr) {
        var changed = false;
        arr.forEach(function (s) {
          if (!s) return;
          var sid = sidClean(s.orderNo); if (!sid) return;
          var up = null;
          if (s.paySS) {
            IMG_CACHE[sid] = IMG_CACHE[sid] || {}; IMG_CACHE[sid].paySS = s.paySS;
            up = up || {}; up.paySS = s.paySS;
            s.paySS = ""; s.hasPay = true; if (!s.payV) s.payV = Date.now();
            changed = true;
          }
          if (s.deliveryPhoto) {
            IMG_CACHE[sid] = IMG_CACHE[sid] || {}; IMG_CACHE[sid].deliveryPhoto = s.deliveryPhoto;
            up = up || {}; up.deliveryPhoto = s.deliveryPhoto;
            s.deliveryPhoto = ""; s.hasDel = true; if (!s.delV) s.delV = Date.now();
            changed = true;
          }
          if (up) {
            if (_doPushImg) _doPushImg(sid, up);
            else { _pendImgs[sid] = _pendImgs[sid] || {}; for (var k in up) _pendImgs[sid][k] = up[k]; }
          }
        });
        return changed;
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
            var arr = JSON.parse(val) || [], changed = false;
            if (ssmStripImages(arr)) changed = true;               // ပုံ inline ပါလာရင် — cloud ဆီ ပို့ပြီး local မှာ ဖြုတ် (localStorage မှာ ပုံ လုံးဝ မသိမ်း)
            arr.forEach(function (s) {
              var id = String(s.orderNo);
              var h = _saleHash(s);
              if (_salesSnap[id] !== h) { s._u = Date.now(); _salesSnap[id] = h; changed = true; }   // ပြောင်းသွားရင် edit-time stamp (LWW — iOS edit fix)
            });
            if (changed) val = JSON.stringify(arr);
          } catch (e) {}
        }
        try { _protoSet.call(this, key, val); }
        catch (qe) {
          if (key === "salesHistory" && _doLocalPrune && qe && (qe.name === "QuotaExceededError" || /quota|exceeded/i.test("" + (qe.name || "") + (qe.message || "")))) {
            try {
              var pv = _doLocalPrune(val);                 // ပုံအဟောင်း (backup ထဲ ရှိပြီးသား) ဖယ်ပြီး space လွတ်
              _protoSet.call(this, key, pv);               // pruned ကို ပြန်သိမ်း
              val = pv;                                    // push လည်း pruned သုံး (stripped sale → guard နဲ့ skip၊ cloud ပုံ မထိ)
            } catch (qe2) {
              console.warn("[sales] local full — could not free enough space silently");
              throw qe2;
            }
          } else { throw qe; }
        }
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
        console.log("[SSM sync] inline v32 (Blaze: prune 365d + images cloud-only in salesImages) loaded");
        window.SSM_SYNC_VER = "v32";

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

        // ── salesImages push (merge — pay/delivery တစ်ခုချင်း သီးခြား update လို့ရ) ──
        _doPushImg = function (sid, imgs) {
          var doc = {}; for (var k in imgs) doc[k] = imgs[k];
          doc.updatedAt = Date.now();
          db.collection(IMG_COL).doc(sid).set(doc, { merge: true })
            .catch(function (e) { console.warn("[img] push failed:", sid, e); });
        };
        // ပုံ ဖျက် (page တွေက ခေါ်ရန်) — field: "paySS" | "deliveryPhoto"
        window.ssmDeleteCloudImage = function (orderNo, field) {
          try {
            var sid = sidClean(orderNo); if (!sid) return;
            if (IMG_CACHE[sid]) IMG_CACHE[sid][field] = "";
            var up = {}; up[field] = firebase.firestore.FieldValue.delete();
            db.collection(IMG_COL).doc(sid).update(up).catch(function () {});
          } catch (e) {}
        };
        // ── one-time migration: local salesHistory ထဲ ကျန်နေတဲ့ inline ပုံတွေ → salesImages ရွှေ့ ──
        try {
          var _mArr = JSON.parse(localStorage.getItem("salesHistory")) || [];
          if (ssmStripImages(_mArr)) {
            rawSet("salesHistory", JSON.stringify(_mArr));
            try { _salesSnap = {}; _mArr.forEach(function (s) { _salesSnap[String(s.orderNo)] = _saleHash(s); }); } catch (e) {}
            console.log("[img] migrated inline images → salesImages");
          }
        } catch (e) {}
        // queued image pushes (sync မ ready ခင် သိမ်းခဲ့တာ) — cloud တင်
        Object.keys(_pendImgs).forEach(function (sid) { _doPushImg(sid, _pendImgs[sid]); });
        _pendImgs = {};

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

        // doc id = orderNo (SSM-A-0001 …). edit လုပ်လည်း orderNo မပြောင်း → doc တူ → ဘောင်ချာ ၂ ခု မကွဲ
        function sidOf(s) {
          var id = (s && s.orderNo != null) ? String(s.orderNo).trim() : "";
          id = id.replace(/[\/\\#?%]/g, "-");                    // Firestore doc-id safe
          return id || ("no-" + deviceId + "-" + ((s && s.orderDate) || Date.now()));
        }
        // content = cloud + localStorage မှာ သိမ်းမယ့် အပိုင်း — ပုံ (paySS/deliveryPhoto) မပါ (salesImages collection မှာ သီးခြား)
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

        // ── PRUNE: ၃၆၅ ရက်ကျော် ဘောင်ချာဟောင်းကို cloud ကနေသာ ဖယ် (Blaze plan — တစ်နှစ်စာ cloud မှာ ထား)။ local + device အားလုံးမှာ အပြည့် ကျန် ──
        var PRUNE_DAYS = 365;
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
              db.collection(IMG_COL).doc(sid).delete().catch(function () {});   // ပုံ doc ပါ ဖျက်
              delete saleCache[sid];
            }
          });
          try { origSet("ssm_lastPrune", String(Date.now())); } catch (e) {}
        }

        // ── LOCAL image prune (size-based, backup-safe) ──
        // localStorage (iOS ~5MB) ပြည့်ခါနီးရင် — backup ထဲ ရှိပြီးသား (backup ရက်ထက် အရင်) ပုံအဟောင်းကိုသာ ဖယ်။
        // စာ/ဂဏန်း အကုန် ကျန်။ stripped sale → ssmPushSales မှာ skip (cloud ပုံ မထိ)။
        var LS_LIMIT = 2000000;   // ~2M chars — iOS (UTF-16, 2B/char = ~5MB→2.5M chars) quota အောက် သေချာ နေအောင်
        function ssmLocalImagePrune(incomingVal) {
          var raw = (incomingVal != null) ? incomingVal : (localStorage.getItem("salesHistory") || "[]");
          var arr; try { arr = JSON.parse(raw) || []; } catch (e) { return raw; }
          if (JSON.stringify(arr).length < LS_LIMIT) return JSON.stringify(arr);     // space လုံလောက် → ဘာမှ မဖယ်
          var imgs = arr.filter(function (s) { return s.paySS || s.deliveryPhoto; })
                        .sort(function (a, b) { return (new Date(a.orderDate || 0)) - (new Date(b.orderDate || 0)); });  // အဟောင်းဆုံး အရင်
          var n = 0;
          for (var k = 0; k < imgs.length; k++) {
            if (JSON.stringify(arr).length < LS_LIMIT) break;                        // လုံလောက်ပြီ
            var s = imgs[k];
            // silent auto-ဖယ် (အဟောင်းဆုံး အရင်)။ cloud (၅၀ရက်) ကနေ ပြန်ဆွဲကြည့်လို့ရ — _had* flag နဲ့ မှတ်
            if (s.paySS) s._hadPay = true;
            if (s.deliveryPhoto) s._hadDelivery = true;
            s.paySS = ""; s.deliveryPhoto = ""; s._imgStripped = true; n++;
            var sid = sidOf(s); try { saleCache[sid] = JSON.stringify(saleContent(s)); } catch (e) {}   // re-push မဖြစ်အောင်
          }
          var out = JSON.stringify(arr);
          if (n) { console.log("[sales] local image prune: stripped " + n); if (incomingVal == null) { try { rawSet("salesHistory", out); } catch (e) {} } }
          return out;
        }
        _doLocalPrune = ssmLocalImagePrune;

        function ssmPushSales(val) {
          var arr; try { arr = JSON.parse(val) || []; } catch (e) { return; }
          var seen = {};
          arr.forEach(function (s) {
            var sid = sidOf(s); seen[sid] = true;
            if (s._imgStripped) return;                            // local ပုံ ဖယ်ထားတဲ့ sale → cloud ကို re-push မလုပ် (cloud ပုံ ထိန်း); seen ထဲ ရှိလို့ baseline-delete မဖြစ်
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
            if (!seen[sid]) { db.collection(SALES).doc(sid).delete().catch(function () {}); db.collection(IMG_COL).doc(sid).delete().catch(function () {}); delete saleCache[sid]; }
          });
          trackedSids = seen;
        }

        // ── ပုံ ကြည့်ရန် — memory cache → salesImages → (ဟောင်း) sales doc inline fallback ──
        window.ssmGetCloudImages = function (orderNo) {
          return new Promise(function (resolve) {
            try {
              var id = sidClean(orderNo);
              if (!id || !db) { resolve(null); return; }
              var c = IMG_CACHE[id];
              if (c && (c.paySS || c.deliveryPhoto)) { resolve({ paySS: c.paySS || "", deliveryPhoto: c.deliveryPhoto || "" }); return; }
              db.collection(IMG_COL).doc(id).get().then(function (snap) {
                var d = (snap && snap.exists) ? (snap.data() || {}) : {};
                if (d.paySS || d.deliveryPhoto) {
                  IMG_CACHE[id] = { paySS: d.paySS || "", deliveryPhoto: d.deliveryPhoto || "" };
                  resolve(IMG_CACHE[id]); return;
                }
                // legacy — ဗားရှင်းဟောင်းက sales doc ထဲ inline သိမ်းထားတာ
                db.collection(SALES).doc(id).get().then(function (s2) {
                  if (!s2 || !s2.exists) { resolve(null); return; }
                  var d2 = s2.data() || {};
                  resolve({ paySS: d2.paySS || "", deliveryPhoto: d2.deliveryPhoto || "" });
                }).catch(function () { resolve(null); });
              }).catch(function () { resolve(null); });
            } catch (e) { resolve(null); }
          });
        };

        // ── PULL (paginated): app ဖွင့်တိုင်း ၂၀ ရက်စာသာ ဆွဲမယ် (read cost လျော့ချရန်) ──
        // "Load More" ခလုတ် နှိပ်တိုင်း နောက်ထပ် ၂၀ ရက်စာ ဆွဲမယ် (window ချဲ့)
        var SALES_STEP_DAYS = 20;
        var SALES_MAX_DAYS  = 365;
        var salesWindowDays = SALES_STEP_DAYS;
        function ssmSinceISO(days) { return new Date(Date.now() - days * 86400000).toISOString(); }

        function ssmHandleSalesBatch(snap, sinceMs, isInitial) {
          var byId = {};
          snap.forEach(function (d) {
            var s = d.data(); if (s.orderNo == null) s.orderNo = d.id;
            var sid = sidOf(s);
            byId[sid] = s; markSynced(sid);
            if (d.id === sid) saleCache[sid] = JSON.stringify(saleContent(s));
            else db.collection(SALES).doc(d.id).delete().catch(function () {});
          });

          if (isInitial) {
            ssmPruneOldSales(byId);
            // NOTE: previously "if (lastPush['__sales']) return;" skipped the ENTIRE merge whenever this
            // device had written salesHistory even once before the initial fetch resolved (e.g. delivery.html's
            // auto-fix-on-render calling localStorage.setItem during page load) — this silently blocked cloud
            // updates from OTHER devices from EVER being pulled in on that device. Removed: the per-record
            // "_u" timestamp check below already protects a fresh local edit from being overwritten by a
            // stale cloud snapshot, so this blanket guard was unnecessary and actively harmful.
          }

          var local; try { local = JSON.parse(localStorage.getItem("salesHistory")) || []; } catch (e) { local = []; }
          var seenL = {};
          local.forEach(function (s) {
            var sid = sidOf(s); seenL[sid] = true;
            var c = byId[sid];
            if (c && (c._u || 0) > (s._u || 0)) {
              for (var k in s) { if (!(k in c)) delete s[k]; }
              for (var k2 in c) { s[k2] = c[k2]; }
            }
          });

          // ⚠️ NOTE: windowed query ဖြစ်လာလို့ "cloud မှာ မတွေ့ရင် တခြား device ဖျက်တယ်" ဆိုတဲ့ heuristic ကို
          // ဖယ်ရှားလိုက်ပါတယ် — query က တစ်စိတ်တစ်ပိုင်းသာ (20ရက်) ဆွဲတာမို့၊ orderDate field မှားနေတာမျိုး/
          // query timing စတာတွေကြောင့် doc တစ်ခု ခဏ မပါလာရင်တောင် local ကို အမှား ဖျက်မိနိုင်လို့ပါ။
          // (Explicit delete လုပ်ရင် ssmPushSales/trackedSids diff ကနေ cloud ကို သီးခြား ဖျက်ပေးပါတယ် — ဒါက မထိခိုက်ပါ)

          var extras = [];
          Object.keys(byId).forEach(function (sid) { if (!seenL[sid]) extras.push(byId[sid]); });
          extras.sort(function (a, b) { return String(a.orderDate || "").localeCompare(String(b.orderDate || "")); });
          if (isInitial) extras.forEach(function (s) { local.push(s); });
          else local = extras.concat(local);

          ssmStripImages(local);
          try { rawSet("salesHistory", JSON.stringify(local)); } catch (e) { console.warn("[sales] localStorage quota:", e); }
          try { _salesSnap = {}; local.forEach(function (s) { _salesSnap[String(s.orderNo)] = _saleHash(s); }); } catch (e) {}
          trackedSids = {}; local.forEach(function (s) { trackedSids[sidOf(s)] = true; });
          ssmRefreshSales();
          ssmPushSales(JSON.stringify(local));
        }

        db.collection(SALES).where("orderDate", ">=", ssmSinceISO(salesWindowDays)).get()
          .then(function (snap) { ssmHandleSalesBatch(snap, Date.now() - salesWindowDays * 86400000, true); })
          .catch(function (err) { console.warn("[sales] initial fetch failed:", err); });

        var salesLoadMoreBusy = false;
        window.ssmLoadMoreSales = function (cb) {
          if (salesLoadMoreBusy) return;
          if (salesWindowDays >= SALES_MAX_DAYS) { if (cb) cb({ more: false, count: 0 }); return; }
          salesLoadMoreBusy = true;
          var oldDays = salesWindowDays;
          var newDays = Math.min(oldDays + SALES_STEP_DAYS, SALES_MAX_DAYS);
          db.collection(SALES)
            .where("orderDate", ">=", ssmSinceISO(newDays))
            .where("orderDate", "<",  ssmSinceISO(oldDays))
            .get()
            .then(function (snap) {
              salesWindowDays = newDays;
              ssmHandleSalesBatch(snap, Date.now() - newDays * 86400000, false);
              salesLoadMoreBusy = false;
              if (cb) cb({ more: newDays < SALES_MAX_DAYS, count: snap.size });
            })
            .catch(function (err) {
              salesLoadMoreBusy = false;
              console.warn("[sales] load-more failed:", err);
              if (cb) cb({ more: true, count: 0, error: true });
            });
        };


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

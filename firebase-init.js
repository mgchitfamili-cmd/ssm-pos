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

      // ── Auth guard ──────────────────────────────────────────────
      // login မဝင်ထားရင် login.html ကို ပို့။ Firebase ချိတ်လို့မရရင်တော့
      // ဘာမှ မလုပ်ဘဲ app ကို ဆက်သုံးခွင့်ပေး (fail-open — app မပိတ်မိအောင်)။
      var onLogin = /login\.html$/i.test(location.pathname);
      window.fb.auth.onAuthStateChanged(function (user) {
        window.fbUser = user || null;
        if (!user && !onLogin) { location.replace("login.html"); return; }
        if (user && onLogin)   { location.replace("index.html"); return; }
        document.dispatchEvent(new Event("fb-ready"));
      });
    } catch (e) {
      console.error("Firebase init error:", e);
      document.dispatchEvent(new Event("fb-error"));
    }
  });
})();

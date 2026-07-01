/* Sone Sone Mommy POS — slide-menu logo + polished menu styling (injected on every page). */
(function () {
  var MENU_CSS =
    "#sideMenu,#sideMenu *{-webkit-tap-highlight-color:transparent;}" +
    "#sideMenu .menu-item{margin:4px 10px;padding:11px 12px;border-radius:14px;outline:none;-webkit-tap-highlight-color:transparent;" +
      "transition:background .18s ease,transform .12s ease,box-shadow .18s ease;}" +
    "#sideMenu .menu-item:active{transform:scale(.97);}" +
    "#sideMenu .menu-item.active{background:linear-gradient(135deg,var(--brand-tint),rgba(109,40,217,.16));" +
      "color:var(--brand-ink);box-shadow:0 4px 16px rgba(109,40,217,.16);}" +
    "#sideMenu .menu-item .ic{width:40px;height:40px;border-radius:12px;" +
      "box-shadow:0 1px 3px rgba(16,24,40,.07);transition:transform .18s ease,box-shadow .18s ease;}" +
    "#sideMenu .menu-item.active .ic{background:#fff;box-shadow:0 4px 12px rgba(109,40,217,.22);transform:scale(1.05);}" +
    "#sideMenu .menu-header{position:relative;overflow:hidden;}" +
    "#sideMenu .menu-header::after{content:'';position:absolute;right:-30px;top:-30px;width:150px;height:150px;" +
      "background:radial-gradient(circle,rgba(255,255,255,.22),transparent 70%);pointer-events:none;}" +
    "#sideMenu .menu-header::before{content:'';position:absolute;left:-50px;bottom:-60px;width:170px;height:170px;" +
      "background:radial-gradient(circle,rgba(255,255,255,.10),transparent 70%);pointer-events:none;}" +
    "#sideMenu .menu-header h2{position:relative;}" +
    "#sideMenu .menu-header p{position:relative;}";

  function injectCSS() {
    if (document.getElementById("ssm-menu-css")) return;
    var st = document.createElement("style");
    st.id = "ssm-menu-css";
    st.textContent = MENU_CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  function apply() {
    injectCSS();
    try {
      var s = JSON.parse(localStorage.getItem("shopSettings")) || {};
      if (!s.logo) return;
      var head = document.querySelector(".menu-header");
      if (!head || head.querySelector(".menu-logo")) return;
      var img = document.createElement("img");
      img.className = "menu-logo";
      img.src = s.logo;
      img.alt = "logo";
      img.style.cssText = "position:relative;width:120px;height:120px;border-radius:20px;object-fit:contain;display:block;margin-bottom:12px;background:#fff;box-shadow:0 6px 20px rgba(0,0,0,.18);";
      head.insertBefore(img, head.firstChild);
    } catch (e) {}
  }
  if (document.readyState !== "loading") apply();
  else document.addEventListener("DOMContentLoaded", apply);
})();

/* Sone Sone Mommy POS — shows the shop logo + Backup button in the slide-menu header on every page. */
(function () {
  function apply() {
    try {
      var head = document.querySelector(".menu-header");
      if (!head) return;
      var s = JSON.parse(localStorage.getItem("shopSettings")) || {};

      // logo
      if (s.logo && !head.querySelector(".menu-logo")) {
        var img = document.createElement("img");
        img.className = "menu-logo";
        img.src = s.logo;
        img.alt = "logo";
        img.style.cssText = "width:120px;height:120px;border-radius:20px;object-fit:contain;display:block;margin-bottom:12px;background:#fff;";
        head.insertBefore(img, head.firstChild);
      }

      // Backup button — logo နဲ့ လိုက် (header ထဲ၊ page တိုင်း တစ်နေရာတည်းက)
      if (!head.querySelector(".menu-backup-btn")) {
        var bk = document.createElement("div");
        bk.className = "menu-backup-btn";
        bk.textContent = "💾 Backup";
        bk.style.cssText = "margin-top:12px;padding:9px 12px;border-radius:10px;background:rgba(255,255,255,.2);color:#fff;font-size:14px;font-weight:600;cursor:pointer;text-align:center;";
        bk.onclick = function () { location.href = "setting.html#backup"; };
        head.appendChild(bk);
      }
    } catch (e) {}
  }
  if (document.readyState !== "loading") apply();
  else document.addEventListener("DOMContentLoaded", apply);
})();

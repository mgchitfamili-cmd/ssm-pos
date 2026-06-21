/* Sone Sone Mommy POS — shows the shop logo (Settings) in the slide-menu header on every page. */
(function () {
  function apply() {
    try {
      var s = JSON.parse(localStorage.getItem("shopSettings")) || {};
      if (!s.logo) return;
      var head = document.querySelector(".menu-header");
      if (!head || head.querySelector(".menu-logo")) return;
      var img = document.createElement("img");
      img.className = "menu-logo";
      img.src = s.logo;
      img.alt = "logo";
      img.style.cssText = "width:54px;height:54px;border-radius:14px;object-fit:cover;display:block;margin-bottom:10px;background:#fff;";
      head.insertBefore(img, head.firstChild);
    } catch (e) {}
  }
  if (document.readyState !== "loading") apply();
  else document.addEventListener("DOMContentLoaded", apply);
})();

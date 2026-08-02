/* Sone Sone Mommy POS — shared line-icon set (replaces emoji glyphs app-wide).
   Rounded, minimal stroke icons in a Samsung One UI-inspired style.
   Usage: ssmIcon("name", {size:16, color:"currentColor"})
   Static markup: <span data-icon="name" data-icon-size="16"></span> auto-renders on load. */
(function () {
  var ICONS = {
    report:        '<path d="M4 21V13M10 21V8M16 21V4"/><path d="M2 21h20"/>',
    cart:          '<circle cx="9" cy="20" r="1.4"/><circle cx="17" cy="20" r="1.4"/><path d="M2.5 3h2l2.4 12.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.6L21 8H6"/>',
    receipt:       '<path d="M6 2h12v18l-2.5-1.5L13 20l-2.5-1.5L8 20l-2-1.5V2z"/><path d="M9 7h6M9 11h6M9 15h4"/>',
    delivery:      '<path d="M2 8h11v8H2z"/><path d="M13 11h4l3 3v2h-7z"/><circle cx="6" cy="19" r="1.6"/><circle cx="17" cy="19" r="1.6"/>',
    cash:          '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 9v.01M18 15v.01"/>',
    package:       '<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',
    user:          '<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-6 8-6s8 2 8 6"/>',
    settings:      '<path d="M12 15a3 3 0 100-6 3 3 0 000 6z"/><path d="M19 12a7 7 0 01-.2 1.6l2 1.6-2 3.4-2.3-.9a7 7 0 01-1.4.8l-.4 2.5h-4l-.4-2.5a7 7 0 01-1.4-.8l-2.3.9-2-3.4 2-1.6A7 7 0 015 12c0-.5.1-1.1.2-1.6l-2-1.6 2-3.4 2.3.9c.4-.3.9-.6 1.4-.8L9.3 3h4l.4 2.5c.5.2 1 .5 1.4.8l2.3-.9 2 3.4-2 1.6c.1.5.2 1.1.2 1.6z"/>',
    income:        '<path d="M8 7l1.5-4h5L16 7"/><path d="M5 7h14l1 12a2 2 0 01-2 2H6a2 2 0 01-2-2z"/><path d="M12 11v6M10 13.2c0-1 .9-1.7 2-1.7s2 .7 2 1.7-1 1.7-2 1.7-2 .7-2 1.7 1 1.7 2 1.7 2-.7 2-1.7"/>',
    close:         '<path d="M6 6l12 12M18 6L6 18"/>',
    refresh:       '<path d="M3 12a9 9 0 0115-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 01-15 6.7L3 16"/><path d="M3 21v-5h5"/>',
    trash:         '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13a2 2 0 002 2h6a2 2 0 002-2l1-13"/><path d="M10 11v6M14 11v6"/>',
    edit:          '<path d="M4 20l4-1 11-11-3-3L5 16l-1 4z"/><path d="M14 5l3 3"/>',
    add:           '<path d="M12 5v14M5 12h14"/>',
    minus:         '<path d="M5 12h14"/>',
    back:          '<path d="M19 12H5"/><path d="M11 6l-6 6 6 6"/>',
    warning:       '<path d="M12 3l10 18H2L12 3z"/><path d="M12 9v5"/><circle cx="12" cy="17" r="1" fill="currentColor" stroke="none"/>',
    check:         '<path d="M5 12.5l4.5 4.5L19 7"/>',
    checkCircle:   '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9"/>',
    eye:           '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    cloud:         '<path d="M7 18a4.5 4.5 0 01-.4-9 5.5 5.5 0 0110.7-1.6A4 4 0 0117 18H7z"/>',
    camera:        '<path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 011 1v9a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1z"/><circle cx="12" cy="13" r="3.5"/>',
    card:          '<rect x="2" y="5" width="20" height="14" rx="2.5"/><path d="M2 10h20"/><path d="M6 15h4"/>',
    print:         '<path d="M6 9V3h12v6"/><rect x="4" y="9" width="16" height="8" rx="1.5"/><path d="M6 14h12v7H6z"/>',
    share:         '<circle cx="6" cy="12" r="2.4"/><circle cx="18" cy="6" r="2.4"/><circle cx="18" cy="18" r="2.4"/><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4"/>',
    gift:          '<rect x="3" y="8" width="18" height="4" rx="1"/><rect x="5" y="12" width="14" height="9" rx="1"/><path d="M12 8v13"/><path d="M12 8c-1-3-5-4-5-1s3 1 5 1zM12 8c1-3 5-4 5-1s-3 1-5 1z"/>',
    tag:           '<path d="M3 11.5V4h7.5L21 14.5 13.5 22 3 11.5z"/><circle cx="7.5" cy="7.5" r="1.4" fill="currentColor" stroke="none"/>',
    note:          '<path d="M14 3H6a1 1 0 00-1 1v16a1 1 0 001 1h12a1 1 0 001-1V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/>',
    save:          '<path d="M4 4h13l3 3v13H4z"/><path d="M8 4v6h8V4"/><path d="M8 14h8v6H8z"/>',
    folder:        '<path d="M3 6a1 1 0 011-1h5l2 2h9a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V6z"/>',
    image:         '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.7"/><path d="M21 16l-5.5-5.5L9 17"/>',
    lock:          '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/>',
    unlock:        '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 017.5-2"/>',
    scale:         '<path d="M12 3v18"/><path d="M5 7h14"/><path d="M5 7l-3 6a3 3 0 006 0z"/><path d="M19 7l-3 6a3 3 0 006 0z"/><path d="M8 21h8"/>',
    help:          '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 114 2c-.8.7-1.5 1.2-1.5 2.3"/><circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none"/>',
    calendar:      '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M8 3v4M16 3v4"/>',
    trendingUp:    '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    pin:           '<path d="M12 21s7-6.5 7-12a7 7 0 10-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>',
    phone:         '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
    moon:          '<path d="M20 14.5A8.5 8.5 0 119.5 4a7 7 0 1010.5 10.5z"/>',
    logout:        '<path d="M13 4H6a1 1 0 00-1 1v14a1 1 0 001 1h7"/><path d="M16 15l4-3-4-3"/><path d="M20 12H9"/>',
    undo:          '<path d="M4 8h9a5 5 0 010 10H8"/><path d="M8 4L4 8l4 4"/>',
    device:        '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 9h8M8 13h5"/>',
    dot:           '<circle cx="12" cy="12" r="6" fill="currentColor" stroke="none"/>',
    medal:         '<circle cx="12" cy="9" r="6"/><path d="M9 14.5L7 21l5-3 5 3-2-6.5"/>',
    splitArrow:    '<path d="M4 4v8a4 4 0 004 4h10"/><path d="M14 12l4 4-4 4"/>'
  };

  window.ssmIcon = function (name, opts) {
    var svg = ICONS[name];
    if (!svg) return "";
    opts = opts || {};
    var size  = opts.size  || 16;
    var color = opts.color || "currentColor";
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size +
      '" viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="1.8" ' +
      'stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;display:inline-block">' +
      svg + '</svg>';
  };

  // Auto-render any static <span data-icon="name" data-icon-size="16"></span> placeholders.
  function renderStaticIcons() {
    var els = document.querySelectorAll("[data-icon]");
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var name = el.getAttribute("data-icon");
      var size = Number(el.getAttribute("data-icon-size")) || 16;
      var color = el.getAttribute("data-icon-color") || "currentColor";
      el.innerHTML = window.ssmIcon(name, { size: size, color: color });
    }
  }
  if (document.readyState !== "loading") renderStaticIcons();
  else document.addEventListener("DOMContentLoaded", renderStaticIcons);

  // Re-render any icons added to the DOM later (dynamic menu injection, etc).
  window.ssmRenderIcons = renderStaticIcons;
})();

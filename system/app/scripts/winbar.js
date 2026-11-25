/* The window bar (1.6.4; Fulllion, 2026-11-24: "bring it into waypoint but just have the minimize, fullscreen, and close button on their own on
   the top, above the app like it is now, just without waypoint vtt on the left, and blended into the app"; by prompt "26 px", and of its color
   "the color scheme thats currently set for the user, it should change to match").

   In the desktop app the main window has no title bar of the system's own. The system draws only its three buttons, over the window's top right
   corner (main.js, shellguard.js barStart), and the page draws the strip they stand on: #winBar, the first child of .app, as tall as the CSS
   env titlebar-area-height (style.css --winbar), which is 0 in a browser, on a website, in a window of its own and wherever the system draws no
   buttons, so the strip is there only where they are. The strip wears the top row's own ground and ink, so it follows the theme and the look.

   This module tells the shell those two colors (POST /api/winbar, shellguard.barColor), so the buttons' own ground matches the strip: once as
   the page loads, and again whenever the theme or the look moves them (an observer of the page's root and body, and a look every
   WB_LOOK_MS, since a look may set its colors where no observer hears). It says them only while the system draws its buttons over this page
   (navigator.windowControlsOverlay.visible), so a browser and a website are never asked. window.wpWinBarH() is the strip's height now, in
   CSS pixels, for code that keeps a box clear of the window's top edge. */

var WB_LOOK_MS = 1500;
var _said = '';   // the colors last said, so the same two are never sent again
// The strip's height now, in CSS pixels (0 where there is none)
function winBarH() { var b = document.getElementById('winBar'); return b ? b.offsetHeight : 0; }
// A computed color as a six-digit hex color, or '' for one that is not rgb() or rgba()
function hexOf(c) {
    var m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(String(c || ''));
    if (!m) return '';
    return '#' + [m[1], m[2], m[3]].map(function(v) { var n = Math.max(0, Math.min(255, Math.round(+v))); return (n < 16 ? '0' : '') + n.toString(16); }).join('');
}
// Whether the system draws its buttons over this page
function barShown() { var o = navigator.windowControlsOverlay; return !!(o && o.visible); }
// The strip's ground and ink, as the shell takes them, or null
function barColors() {
    var b = document.getElementById('winBar'); if (!b) return null;
    var cs = getComputedStyle(b), c = hexOf(cs.backgroundColor), s = hexOf(cs.color);
    return c && s ? { color: c, symbol: s } : null;
}
function say() {
    if (!barShown()) return;
    var c = barColors(); if (!c) return;
    var k = c.color + c.symbol; if (k === _said) return;
    _said = k;
    try { fetch('/api/winbar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(c) }).then(function(r) { if (!r.ok) _said = ''; }, function() { _said = ''; }); } catch (e) { _said = ''; }
}
var _soon = 0;
function saySoon() { if (_soon) return; _soon = setTimeout(function() { _soon = 0; say(); }, 0); }
function wire() {
    say();
    try {
        var mo = new MutationObserver(saySoon), opts = { attributes: true, attributeFilter: ['class', 'style', 'data-theme', 'data-look'] };
        mo.observe(document.documentElement, opts);
        if (document.body) mo.observe(document.body, opts);
    } catch (e) {}
    var o = navigator.windowControlsOverlay;
    if (o && typeof o.addEventListener === 'function') o.addEventListener('geometrychange', saySoon);
    setInterval(function() { if (barShown()) say(); }, WB_LOOK_MS);
}
window.wpWinBarH = winBarH;
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();

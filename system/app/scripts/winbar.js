/* The window bar (1.6.4; Fulllion, 2026-11-24: "bring it into waypoint but just have the minimize, fullscreen, and close button on their own on
   the top, above the app like it is now, just without waypoint vtt on the left, and blended into the app"; by prompt "26 px", and of its color
   "the color scheme thats currently set for the user, it should change to match", and then "the window bar should always blend with the current
   screen in waypoint, for instance, the waypoint home screen is a different shade than the top window bar").

   In the desktop app the main window has no title bar of the system's own. The system draws only its three buttons, over the window's top right
   corner (main.js, shellguard.js barStart), and the page draws the strip they stand on: #winBar, the first child of .app, as tall as the CSS
   env titlebar-area-height (style.css --winbar), which is 0 in a browser, on a website, in the stream window and wherever the system draws no
   buttons, so the strip is there only where they are. The style sheet gives the strip the look's own ground (--winbar-bg) to start with.
   A pop-out (a page, a part, a big table, a sheet, Table Chat) has the same bar since 1.6.4's later fold: there .app is hidden, and its strip
   is #popWinBar (barEl), which stands over the pop-out's own bar, so the color read under it is that bar's. The colors are said with the
   page's own address, so each window's buttons follow its own page.

   The strip then takes the color of whatever stands right under it on screen, so it blends with the screen in view: the welcome screen, the top
   row, the gap around Slate's floating row, a window's dimmed backdrop. underColor() reads it: at a row of points along the line just under the
   strip it asks the page which elements stand there (document.elementsFromPoint), lays their background colors one over another as the browser
   paints them (stackColor), and takes the color most of the points agree on (modeOf), so a button of the top row under one point changes nothing.
   A background picture or a canvas is read by its background color alone. The color goes on the strip as its inline background, with an ink
   that reads on it (inkFor), and is told to the shell (POST /api/winbar, shellguard.barColor), so the buttons' own ground matches the strip.

   It is looked at as the page loads, a moment after every press, key and change of the page's root or body (a window opening, the welcome screen
   going), and every WB_LOOK_MS as a net under those, only while the window is in view, and only while the system draws its buttons over this page
   (navigator.windowControlsOverlay.visible), so a browser and a website are never asked. The shell is told a color only when it changed.
   window.wpWinBarH() is the strip's height now, in CSS pixels, for code that keeps a box clear of the window's top edge. */

var WB_LOOK_MS = 500;       // how often the strip looks again by itself, as a net under the events
var WB_POINTS = 12;         // how many points along the line under the strip are read
var WB_BUTTONS = 150;       // the width the system's three buttons take at the right, never read
var WB_DEPTH = 30;          // how many elements one point's stack is read to, at most
var _said = '';   // the colors last said, so the same two are never sent again
// 1.6.4: the strip of this window. A pop-out (body.popout-mode, which popout.js sets) hides .app and with it #winBar, and stands on a strip of
// its own, #popWinBar (Fulllion, 2026-11-25: "the external waypoint windows dont have the integrated window bar the main app has"); every other
// page uses #winBar. Asked at every look, since popout.js marks the page after this module has started
function barEl() {
    var pop = document.body && document.body.classList.contains('popout-mode') ? document.getElementById('popWinBar') : null;
    return pop || document.getElementById('winBar');
}
// The strip's height now, in CSS pixels (0 where there is none)
function winBarH() { var b = barEl(); return b ? b.offsetHeight : 0; }

// [lookcheck:winblend-start] the pure half: a color read, layered and chosen, run by lookcheck
// A computed color as { r, g, b, a }, or null for anything that is no rgb() or rgba() (transparent reads as a 0 alpha)
function rgbaOf(c) {
    var s = String(c || '').trim();
    if (s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
    var m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+)(%?))?\s*\)$/.exec(s);
    if (!m) return null;
    var cl = function(v) { return Math.max(0, Math.min(255, +v)); };
    var a = m[4] === undefined ? 1 : (m[5] ? +m[4] / 100 : +m[4]);
    return { r: cl(m[1]), g: cl(m[2]), b: cl(m[3]), a: Math.max(0, Math.min(1, a)) };
}
// A color laid over another, as a browser paints it (top's alpha over an opaque one under it)
function over(top, under) {
    var a = top.a;
    return { r: top.r * a + under.r * (1 - a), g: top.g * a + under.g * (1 - a), b: top.b * a + under.b * (1 - a), a: 1 };
}
// The color one point shows: its stack of background colors, top first, laid down from the first opaque one (or from `base` where none is)
function stackColor(list, base) {
    var n = 0, i;
    while (n < list.length && !(list[n] && list[n].a >= 1)) n++;
    var c = n < list.length ? list[n] : (base || { r: 0, g: 0, b: 0, a: 1 });
    for (i = Math.min(n, list.length) - 1; i >= 0; i--) if (list[i] && list[i].a > 0) c = over(list[i], c);
    return { r: c.r, g: c.g, b: c.b, a: 1 };
}
// A color as a six-digit hex color
function hexOf(c) {
    return '#' + [c.r, c.g, c.b].map(function(v) { var n = Math.max(0, Math.min(255, Math.round(+v || 0))); return (n < 16 ? '0' : '') + n.toString(16); }).join('');
}
// The value most of the list holds, the first of them on a tie; '' for an empty list
function modeOf(list) {
    var count = {}, best = '', most = 0;
    list.forEach(function(v) { if (!v) return; count[v] = (count[v] || 0) + 1; if (count[v] > most) { most = count[v]; best = v; } });
    return best;
}
// An ink that reads on a ground: the light theme's dark ink on a light ground, the dark theme's light ink on a dark one
function inkFor(hex) {
    var m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || ''));
    if (!m) return '#e9e9f0';
    var lin = function(h) { var v = parseInt(h, 16) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    var L = 0.2126 * lin(m[1]) + 0.7152 * lin(m[2]) + 0.0722 * lin(m[3]);
    return L > 0.3 ? '#1f1d24' : '#e9e9f0';
}
// The points along a line of a given width that are read: WB_POINTS of them, clear of the system's buttons at the right
function pointsX(width) {
    var right = Math.max(16, width - WB_BUTTONS), left = Math.min(8, right), out = [], i;
    for (i = 0; i < WB_POINTS; i++) out.push(Math.round(left + (right - left) * (i + 0.5) / WB_POINTS));
    return out;
}
// [lookcheck:winblend-end]

// The color right under the strip now, as a hex color, or '' where nothing can be read
function underColor() {
    var bar = barEl(), h = winBarH();
    if (!bar || !h || typeof document.elementsFromPoint !== 'function') return '';
    var base = rgbaOf(getComputedStyle(document.documentElement).backgroundColor);
    base = base && base.a >= 1 ? base : { r: 0, g: 0, b: 0, a: 1 };
    var y = h + 1, picks = [];
    pointsX(window.innerWidth || document.documentElement.clientWidth || 0).forEach(function(x) {
        var els = document.elementsFromPoint(x, y) || [], list = [], i;
        for (i = 0; i < els.length && i < WB_DEPTH; i++) {
            var el = els[i];
            if (el === bar || bar.contains(el)) continue;
            var c = rgbaOf(getComputedStyle(el).backgroundColor);
            if (c && c.a > 0) { list.push(c); if (c.a >= 1) break; }
        }
        picks.push(hexOf(stackColor(list, base)));
    });
    return modeOf(picks);
}
// Whether the system draws its buttons over this page
function barShown() { var o = navigator.windowControlsOverlay; return !!(o && o.visible); }
function say() {
    if (!barShown() || document.hidden) return;
    var bar = barEl(); if (!bar) return;
    var color = underColor(); if (!color) return;
    var symbol = inkFor(color);
    if (bar.style.backgroundColor !== color) { bar.style.backgroundColor = color; bar.style.color = symbol; }
    var k = color + symbol; if (k === _said) return;
    _said = k;
    // the page's own address goes with the colors (1.6.4), so the shell sets this very window's buttons and no other's (shellguard.barTarget)
    try { fetch('/api/winbar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ color: color, symbol: symbol, at: String(location.href) }) }).then(function(r) { if (!r.ok) _said = ''; }, function() { _said = ''; }); } catch (e) { _said = ''; }
}
// A look a moment from now, and once more a little later for a window or a screen that fades in
var _soon = 0, _later = 0;
function saySoon() {
    if (!_soon) _soon = setTimeout(function() { _soon = 0; say(); }, 30);
    if (_later) clearTimeout(_later);
    _later = setTimeout(function() { _later = 0; say(); }, 320);
}
function wire() {
    say();
    try {
        var mo = new MutationObserver(saySoon), opts = { attributes: true, attributeFilter: ['class', 'style', 'data-theme', 'data-look'] };
        mo.observe(document.documentElement, opts);
        if (document.body) mo.observe(document.body, opts);
    } catch (e) {}
    ['pointerup', 'keyup'].forEach(function(t) { document.addEventListener(t, saySoon, true); });
    document.addEventListener('visibilitychange', saySoon);
    window.addEventListener('resize', saySoon);
    var o = navigator.windowControlsOverlay;
    if (o && typeof o.addEventListener === 'function') o.addEventListener('geometrychange', saySoon);
    setInterval(function() { if (barShown()) say(); }, WB_LOOK_MS);
}
window.wpWinBarH = winBarH;
window.wpWinBar = { under: underColor, look: say };   // for the developer console and a live check: the color under the strip now, and a look
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();

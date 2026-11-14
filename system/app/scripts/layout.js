// The layout editor (1.6.2, backlog 224; the owner, 2026-11-13, by prompt after a sheet of real renders: "View menu and Settings
// (Recommended)", "Drag, and a card of places (Recommended)", "Every side, edge or box (Recommended)", "Each computer its own
// (Recommended)", and mid-design: "there should be an option where it sits flush across the whole bottom of the screen up to any panels").
// Where the map's controls stand: the toolbar on any side, across the whole edge or as a floating box, or free, and shown only when the
// pointer comes near; the column at the map's edge (View, Grid and Snap), the zoom box, the minimap, the party's faces, the trackers bar,
// the turn strip and a player's join card, each held to a place; and on the Data Map its own toolbar, its Find strip, its zoom box and
// its minimap. A layout is this computer's (wp_layout), read back only through cleanLayout, and nothing of it goes over the table.
// With no layout the page is exactly as before: nothing here writes a class, a style or a variable. On a narrow area (main.js
// area-narrow), in the stream window and in a window of its own, every control stands where it stood before. Every control keeps its id,
// its wiring and its menus; only where it stands changes, through the classes lay-* and the variables --lay-* the style sheet reads.

// [layoutcheck:core-start]
var LAY_KEY = 'wp_layout';
var LAY_SIDES = ['bottom', 'top', 'left', 'right', 'free'];
var LAY_SPOTS = ['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br'];
var LAY_BARS = { play: 'wbFloatingToolbar', data: 'dataFloatingToolbar' };
var LAY_PARTS = { play: ['wbEdgeTools', 'zoomBox', 'minimap', 'partyStrip', 'trkStrip', 'combatStrip', 'joinCard'], data: ['zoomBox', 'minimap', 'dataFind'] };
var LAY_NAMES = { wbFloatingToolbar: 'Toolbar', dataFloatingToolbar: 'Toolbar', wbEdgeTools: 'View, Grid, Snap', zoomBox: 'Zoom box', minimap: 'Minimap', partyStrip: 'Party', trkStrip: 'Trackers', combatStrip: 'Turn strip', joinCard: 'Join card', dataFind: 'Find' };
var LAY_SPOT_NAMES = { tl: 'Top left', tc: 'Top middle', tr: 'Top right', ml: 'Middle left', mc: 'Middle', mr: 'Middle right', bl: 'Bottom left', bc: 'Bottom middle', br: 'Bottom right' };
var LAY_CAP = 20000;   // an offset is never further than this from its spot
var LAY_GAP = 8;       // what a control keeps clear of the toolbar and of the area's edge
function layOwn(o, k) { return !!o && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k); }
function layNum(v) { return typeof v === 'number' && isFinite(v) ? Math.max(-LAY_CAP, Math.min(LAY_CAP, Math.round(v))) : 0; }
// A place: one of nine spots of the map's area, and how far from it. x counts inward from the left or the right edge (along from the
// middle for a middle spot), y from the top or the bottom (down from the middle)
function cleanSpot(p) {
    if (!p || typeof p !== 'object' || Array.isArray(p) || !layOwn(p, 'c') || LAY_SPOTS.indexOf(p.c) < 0) return null;
    return { c: p.c, x: layOwn(p, 'x') ? layNum(p.x) : 0, y: layOwn(p, 'y') ? layNum(p.y) : 0 };
}
// The toolbar: a side, across the whole edge or a floating box, shown only when the pointer comes near; free has its place
function cleanBar(b) {
    var o = b && typeof b === 'object' && !Array.isArray(b) ? b : {};
    var side = layOwn(o, 'side') && LAY_SIDES.indexOf(o.side) >= 0 ? o.side : 'bottom', at = side === 'free' && layOwn(o, 'at') ? cleanSpot(o.at) : null;
    if (side === 'free' && !at) side = 'bottom';
    var out = { side: side, edge: side !== 'free' && layOwn(o, 'edge') && o.edge === true, hide: layOwn(o, 'hide') && o.hide === true };
    if (at) out.at = at;
    return out;
}
function barPlain(b) { return !b || (b.side === 'bottom' && !b.edge && !b.hide); }
// One map's layout: { bar, parts: { id: place }, colHide (the play map's column shown only when the pointer comes near) }
function cleanView(v, which) {
    var o = v && typeof v === 'object' && !Array.isArray(v) ? v : {}, ids = LAY_PARTS[which] || [], parts = {}, src = layOwn(o, 'parts') && o.parts && typeof o.parts === 'object' && !Array.isArray(o.parts) ? o.parts : {};
    ids.forEach(function(id) { var s = layOwn(src, id) ? cleanSpot(src[id]) : null; if (s) parts[id] = s; });
    var out = { bar: cleanBar(layOwn(o, 'bar') ? o.bar : null), parts: parts };
    if (which === 'play' && layOwn(o, 'colHide') && o.colHide === true) out.colHide = true;
    return out;
}
function viewPlain(v) { return !v || (barPlain(v.bar) && !Object.keys(v.parts || {}).length && !v.colHide); }
// A layout as kept (text or an object) -> { v: 1, play?, data? }, or null where nothing is set: a view that says nothing is left out
function cleanLayout(raw) {
    var o = raw;
    if (typeof o === 'string') { if (o.length > 20000) return null; try { o = JSON.parse(o); } catch (e) { return null; } }
    if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
    var out = { v: 1 }, any = false;
    ['play', 'data'].forEach(function(w) { if (!layOwn(o, w)) return; var v = cleanView(o[w], w); if (!viewPlain(v)) { out[w] = v; any = true; } });
    return any ? out : null;
}
// Where a box of size box ({ w, h }) stands for a place, inside an area ({ w, h, t, l, r, b }: its size, and the room kept at each edge),
// held inside the area. Answers { x, y }, the box's left and top in the area
function spotXY(sp, box, area) {
    var s = cleanSpot(sp) || { c: 'tl', x: 0, y: 0 }, bw = Math.max(0, +box.w || 0), bh = Math.max(0, +box.h || 0);
    var row = s.c.charAt(0), col = s.c.charAt(1), x, y;
    x = col === 'l' ? area.l + s.x : col === 'r' ? area.w - area.r - bw - s.x : (area.w - bw) / 2 + s.x;
    y = row === 't' ? area.t + s.y : row === 'b' ? area.h - area.b - bh - s.y : (area.h - bh) / 2 + s.y;
    return { x: Math.round(layHold(x, area.l, area.w - area.r - bw)), y: Math.round(layHold(y, area.t, area.h - area.b - bh)) };
}
function layHold(v, lo, hi) { return hi < lo ? lo : Math.max(lo, Math.min(hi, v)); }
// A drop: the box's left and top where it was let go -> the place it keeps. The spot is the third of the area its middle stands in, and
// the offset is how far it stands from that spot, so it stays put as the window changes size
function spotOf(x, y, box, area) {
    var bw = Math.max(0, +box.w || 0), bh = Math.max(0, +box.h || 0);
    x = layHold(x, area.l, area.w - area.r - bw); y = layHold(y, area.t, area.h - area.b - bh);
    var cx = x + bw / 2, cy = y + bh / 2, col = cx < area.w / 3 ? 'l' : cx > area.w * 2 / 3 ? 'r' : 'c', row = cy < area.h / 3 ? 't' : cy > area.h * 2 / 3 ? 'b' : 'm';
    var c = row + col, at = spotXY({ c: c, x: 0, y: 0 }, box, area);
    return cleanSpot({ c: c, x: col === 'r' ? at.x - x : x - at.x, y: row === 'b' ? at.y - y : y - at.y });
}
// The toolbar dropped at a spot: the middle of an edge is that side (as a box or across the edge, as it was), a corner or the middle is free
function barOf(sp, was) {
    var s = cleanSpot(sp), w = cleanBar(was), side = !s ? 'bottom' : s.c === 'tc' ? 'top' : s.c === 'bc' ? 'bottom' : s.c === 'ml' ? 'left' : s.c === 'mr' ? 'right' : 'free';
    var out = { side: side, edge: side !== 'free' && w.edge, hide: w.hide };
    if (side === 'free') out.at = s;
    return out;
}
// What the other controls step in by, at each edge, for the toolbar as it stands (rect: the bar's box in the area; ins: the room kept
// at each edge without it). A free or hidden bar, or one at the bottom (the column alone answers for that), moves nobody
function pushOf(bar, rect, area) {
    var p = { t: 0, l: 0, r: 0 }, b = cleanBar(bar);
    if (!rect || b.hide || b.side === 'free' || b.side === 'bottom') return p;
    if (b.side === 'top') p.t = Math.max(0, Math.round(rect.bottom + LAY_GAP - area.t));
    if (b.side === 'left') p.l = Math.max(0, Math.round(rect.right + LAY_GAP - area.l));
    if (b.side === 'right') p.r = Math.max(0, Math.round(area.w - rect.left + LAY_GAP - area.r));
    return p;
}
// The layout with one change made, cleaned: set(lay, which, { bar? , part?: [id, place or null], colHide? }) -> a layout or null
function layWith(lay, which, ch) {
    var base = cleanLayout(lay) || { v: 1 }, v = base[which] ? cleanView(base[which], which) : cleanView(null, which);
    if (ch && layOwn(ch, 'bar')) v.bar = cleanBar(ch.bar);
    if (ch && layOwn(ch, 'part') && Array.isArray(ch.part)) { var id = ch.part[0]; if ((LAY_PARTS[which] || []).indexOf(id) >= 0) { if (ch.part[1]) v.parts[id] = ch.part[1]; else delete v.parts[id]; } }
    if (ch && layOwn(ch, 'colHide')) { if (ch.colHide === true) v.colHide = true; else delete v.colHide; }
    base[which] = v;
    return cleanLayout(base);
}
// The bar's classes for its layout, in a fixed order: the side, across the edge, hidden
function barClasses(bar) {
    var b = cleanBar(bar), c = [];
    if (b.side !== 'bottom') c.push('lay-' + b.side);
    if (b.side === 'left' || b.side === 'right') c.push('lay-side');
    if (b.edge) c.push('lay-edge');
    if (b.hide) c.push('lay-hide');
    return c;
}
// [layoutcheck:core-end]

var LAY_BAR_CLS = ['lay-top', 'lay-left', 'lay-right', 'lay-free', 'lay-side', 'lay-edge', 'lay-hide', 'lay-peek', 'lay-cols', 'lay-bar'];
var _lay = { raw: undefined, lay: null, edit: false, which: '', drag: null, peekT: new WeakMap(), syncing: false, queued: false, ro: null, card: null };

function layRead() {
    var raw = null; try { raw = localStorage.getItem(LAY_KEY); } catch (e) { raw = null; }
    if (raw !== _lay.raw) { _lay.raw = raw; _lay.lay = cleanLayout(raw); }
    return _lay.lay;
}
function layWrite(lay) {
    var c = cleanLayout(lay);
    try { if (c) localStorage.setItem(LAY_KEY, JSON.stringify(c)); else localStorage.removeItem(LAY_KEY); } catch (e) {}
    _lay.raw = undefined; layRead(); laySync();
}
function layEl(id) { return document.getElementById(id); }
function layView() {
    if (window.wpPopout || window.wpStream || document.body.classList.contains('stream-mode')) return '';
    var v = window.wpFloats && typeof window.wpFloats.view === 'function' ? window.wpFloats.view() : '';
    return v === 'play' || v === 'data' ? v : '';
}
function layNarrow() { return document.body.classList.contains('area-narrow'); }
// The room kept at each edge of the map's area, as the page stands: the rulers, a hidden top row's bar
function layInsets() {
    var b = document.body, rulers = !b.classList.contains('no-rulers'), rowHid = b.classList.contains('row-hidden') && !b.classList.contains('tour-on');
    var bar = rowHid ? (parseFloat(getComputedStyle(b).getPropertyValue('--rowbar')) || 0) : 0;
    return { t: rowHid ? bar + 32 : (rulers ? 26 : 8), l: rulers ? 44 : 8, r: 14, b: 8, et: rowHid ? bar + 26 : (rulers ? 18 : 0), el: rulers ? 36 : 0 };
}
function layArea() {
    var m = layEl('main'); if (!m) return null;
    var ins = layInsets(); return { el: m, w: m.clientWidth, h: m.clientHeight, t: ins.t, l: ins.l, r: ins.r, b: ins.b, et: ins.et, el0: ins.el };
}
function layRectIn(el, m) { var r = el.getBoundingClientRect(), a = m.getBoundingClientRect(); return { left: r.left - a.left, top: r.top - a.top, right: r.right - a.left, bottom: r.bottom - a.top, w: r.width, h: r.height }; }
function laySetVar(el, k, v) { if (el.style.getPropertyValue(k) !== v) el.style.setProperty(k, v); }
function layDropVar(el, k) { if (el.style.getPropertyValue(k)) el.style.removeProperty(k); }
function layAt(el, xy) { el.classList.add('lay-at'); laySetVar(el, '--lay-x', xy.x + 'px'); laySetVar(el, '--lay-y', xy.y + 'px'); }
function layFree(el) { if (!el) return; el.classList.remove('lay-at'); el.classList.remove('lay-open-r'); el.classList.remove('lay-open-d'); layDropVar(el, '--lay-x'); layDropVar(el, '--lay-y'); }
// Whether a control stands where the layout put it now (trackers.js and main.js cornerFit ask)
function layHeld(el) { return !!el && !!el.classList && el.classList.contains('lay-at') && document.body.classList.contains('lay-on'); }
function layBarOf(which) { return layEl(LAY_BARS[which]); }

// Every class, variable and place the layout writes, written again from the layout, the view and the page as they stand. With no
// layout, on a narrow area or off the two maps, all of it is taken off
function laySync() {
    if (_lay.syncing) return; _lay.syncing = true;
    try { layApply(); } finally { _lay.syncing = false; }
}
function layApply() {
    var which = layView(), lay = layRead(), v = which && lay ? lay[which] : null, on = !!v && !layNarrow(), body = document.body, m = layEl('main'), wasOn = body.classList.contains('lay-on');
    if (_lay.edit && (!which || layNarrow())) layEdit(false);
    if (_lay.edit) { on = true; if (!v) v = cleanView(null, which); }
    _lay.which = which;
    if (!on && !wasOn) return;   // no layout: the page is left exactly as it is
    body.classList.toggle('lay-on', on);
    ['play', 'data'].forEach(function(w) {
        var bar = layBarOf(w); if (!bar) return;
        var want = on && w === which ? barClasses(v.bar).concat(['lay-bar']) : [];
        if (_lay.drag && _lay.drag.el === bar) return;   // a bar being dragged keeps the look it took for the drag
        LAY_BAR_CLS.forEach(function(c) { if (c === 'lay-peek' || c === 'lay-cols') return; bar.classList.toggle(c, want.indexOf(c) >= 0); });
        if (!(on && w === which && v.bar.side === 'free')) layFree(bar);
        if (!(on && w === which && v.bar.hide)) bar.classList.remove('lay-peek');
    });
    var ids = LAY_PARTS.play.concat(LAY_PARTS.data.filter(function(id) { return LAY_PARTS.play.indexOf(id) < 0; }));
    var col = layEl('wbEdgeTools'), colOn = on && which === 'play';
    if (col) { col.classList.toggle('lay-hide', colOn && !!v.colHide); col.classList.toggle('lay-low', colOn && !barPlain(v.bar)); }   // the column stands low unless the bar is the floating box at the bottom it stands above
    if (!on || !m) { ids.forEach(function(id) { layFree(layEl(id)); }); if (m) ['--lay-t', '--lay-l', '--lay-et', '--lay-el', '--lay-pt', '--lay-pl', '--lay-pr', '--lay-colb'].forEach(function(k) { layDropVar(m, k); }); layHot(null); if (wasOn) { layFitBar(); layTrk(); } return; }   // nothing is written where nothing was laid out
    var A = layArea(), barEl = layBarOf(which);
    laySetVar(m, '--lay-t', A.t + 'px'); laySetVar(m, '--lay-l', A.l + 'px'); laySetVar(m, '--lay-et', A.et + 'px'); laySetVar(m, '--lay-el', A.el0 + 'px');
    layFitBar();
    if (barEl && v.bar.side === 'free' && v.bar.at && !(_lay.drag && _lay.drag.el === barEl)) layAt(barEl, spotXY(v.bar.at, { w: barEl.offsetWidth, h: barEl.offsetHeight }, A));
    var p = pushOf(v.bar, barEl && barEl.offsetWidth ? layRectIn(barEl, m) : null, A);
    laySetVar(m, '--lay-pt', p.t + 'px'); laySetVar(m, '--lay-pl', p.l + 'px'); laySetVar(m, '--lay-pr', p.r + 'px');
    laySetVar(m, '--lay-colb', (v.bar.side === 'bottom' && v.bar.edge && !v.bar.hide && barEl ? barEl.offsetHeight + 12 : 30) + 'px');   // over a bar across the bottom, else low
    var room = { w: A.w, h: A.h, t: A.t + p.t, l: A.l + p.l, r: A.r + p.r, b: A.b };
    if (v.bar.side === 'bottom' && !v.bar.hide && barEl && barEl.offsetWidth) room.b = Math.max(room.b, Math.round(A.h - layRectIn(barEl, m).top + LAY_GAP));
    ids.forEach(function(id) {
        var el = layEl(id); if (!el) return;
        var sp = (LAY_PARTS[which] || []).indexOf(id) >= 0 ? v.parts[id] : null;
        if (!sp || (id === 'combatStrip' && el.parentElement && el.parentElement.id === 'trkStrip')) { layFree(el); return; }
        if (_lay.drag && _lay.drag.el === el) return;
        var xy = spotXY(sp, { w: el.offsetWidth, h: el.offsetHeight }, room); layAt(el, xy);
        el.classList.toggle('lay-open-r', xy.x + el.offsetWidth / 2 < A.w / 2);
        el.classList.toggle('lay-open-d', xy.y + el.offsetHeight / 2 < A.h / 2);
    });
    layHot(v.bar.hide && barEl ? barEl : null, v.colHide && which === 'play' ? col : null);
    layTrk();
    if (_lay.edit) layTags();
}
// The trackers bar finds its row again among the boxes where they now stand (trackers.js place)
function layTrk() { if (window.wpTrackers && typeof window.wpTrackers.place === 'function') window.wpTrackers.place(); }
// A bar laid down a side or across an edge is fitted by whiteboard.js fitBar through here; a side's column tightens, then takes two columns
function layFitBar() { if (typeof window.wpFitBar === 'function') window.wpFitBar(); }
function layFitSide(bar) {
    if (!bar || !bar.classList || !bar.classList.contains('lay-side') || !document.body.classList.contains('lay-on')) { if (bar && bar.classList) bar.classList.remove('lay-cols'); return false; }
    bar.classList.remove('tb-tight'); bar.classList.remove('tb-wrap'); bar.classList.remove('lay-cols'); bar.style.width = '';
    Array.prototype.forEach.call(bar.children, function(k) { k.classList.remove('tb-brk'); });
    var A = layArea(); if (!A) return true;
    var room = A.h - (bar.classList.contains('lay-edge') ? A.et : A.t) - LAY_GAP;
    layMeasure(bar, true);
    try {
        if (bar.offsetHeight > room) bar.classList.add('tb-tight');
        if (bar.offsetHeight > room) bar.classList.add('lay-cols');
    } finally { layMeasure(bar, false); }
    return true;
}
// A bar across the edge is measured by what it holds, as a floating bar is (fitBar asks around its measuring)
function layMeasure(bar, on) { if (bar && bar.classList && bar.classList.contains('lay-edge')) bar.classList.toggle('lay-meas', !!on); }
// A menu of a laid-out bar opens away from its edge and is held inside the map's area (whiteboard.js optsFit asks first, and every
// menu that comes up in a laid-out bar is fitted here). Answers true where it fitted the menu
function layMenuFit(menu) {
    if (!menu || !menu.style || typeof menu.closest !== 'function' || !document.body.classList.contains('lay-on')) return false;
    var bar = menu.closest('.lay-bar, #wbEdgeTools.lay-at, #dataFind'); if (!bar) return false;
    var side = bar.classList.contains('lay-left') || bar.classList.contains('lay-right'), down = bar.classList.contains('lay-top') || (bar.id === 'wbEdgeTools' && bar.classList.contains('lay-open-d'));
    if (!side && !down) return false;
    var m = layEl('main'); if (!m) return false;
    menu.style.removeProperty('top'); menu.style.maxHeight = '';
    var a = m.getBoundingClientRect(), r = menu.getBoundingClientRect(), hd = document.querySelector('header'), top = Math.max(a.top, hd ? hd.getBoundingClientRect().bottom : 0) + LAY_GAP, foot = a.bottom - LAY_GAP;
    if (!(r && isFinite(r.bottom)) || r.height <= 0) return true;
    if (side && r.bottom > foot) {   // a menu beside a column stands up from the foot of the area, never above its top
        var lift = Math.min(r.bottom - foot, r.top - top); if (lift > 0) { var cur = parseFloat(getComputedStyle(menu).top) || 0; menu.style.setProperty('top', (cur - lift) + 'px', 'important'); r = menu.getBoundingClientRect(); }
    }
    menu.style.maxHeight = Math.max(160, Math.floor(foot - Math.max(r.top, top))) + 'px';
    if (!menu.style.overflowY) menu.style.overflowY = 'auto';
    return true;
}

// Shown only when the pointer comes near: a thin line where the bar waits, which brings it out, and it goes again a moment after the
// pointer leaves it, never while one of its menus is up or the focus is in it
function layHot(bar, col) {
    var m = layEl('main'); if (!m) return;
    [['layHotBar', bar], ['layHotCol', col]].forEach(function(pair) {
        var hot = layEl(pair[0]), el = pair[1];
        if (!el) { if (hot) hot.hidden = true; return; }
        if (!hot) {
            hot = document.createElement('div'); hot.id = pair[0]; hot.className = 'lay-hot'; hot.setAttribute('aria-hidden', 'true'); m.appendChild(hot);
            hot.addEventListener('pointerenter', function() { var t = hot._for; if (t) layPeek(t, true); });
            hot.addEventListener('pointerleave', function() { var t = hot._for; if (t) layPeek(t, false); });
        }
        hot._for = el; hot.hidden = false;
        var side = el.id === 'wbEdgeTools' ? 'right' : (['top', 'left', 'right', 'free'].filter(function(s) { return el.classList.contains('lay-' + s); })[0] || 'bottom');
        hot.setAttribute('data-side', side); hot.classList.toggle('lay-hot-edge', el.classList.contains('lay-edge'));
        if (!el._layHot) {
            el._layHot = true;
            el.addEventListener('pointerenter', function() { if (el.classList.contains('lay-hide')) layPeek(el, true); });
            el.addEventListener('pointerleave', function() { if (el.classList.contains('lay-hide')) layPeek(el, false); });
            el.addEventListener('focusin', function() { if (el.classList.contains('lay-hide')) layPeek(el, true); });
        }
    });
}
function layPeek(el, on) {
    var t = _lay.peekT.get(el); if (t) { clearTimeout(t); _lay.peekT.delete(el); }
    if (on) { el.classList.add('lay-peek'); return; }
    _lay.peekT.set(el, setTimeout(function() {
        _lay.peekT.delete(el);
        if (el.matches(':hover, :focus-within') || el.querySelector('.shape-menu.show')) return;
        el.classList.remove('lay-peek');
    }, 450));
}

// ---- the edit mode ----
function layPartsNow() {
    var w = _lay.which; if (!w) return [];
    return [LAY_BARS[w]].concat(LAY_PARTS[w]).map(layEl).filter(function(el) { return !!el && el.offsetWidth > 0 && !(el.id === 'combatStrip' && el.parentElement && el.parentElement.id === 'trkStrip'); });
}
function layPartOf(t) {
    if (!t || typeof t.closest !== 'function' || t.closest('#layCard, #layPart')) return null;
    var hit = null; layPartsNow().forEach(function(el) { if (!hit && el.contains(t)) hit = el; });
    return hit;
}
function layNameOf(el) { return el.id === 'wbEdgeTools' && document.body.classList.contains('net-client') ? 'View' : (LAY_NAMES[el.id] || el.id); }
function layTags() {
    var box = layEl('layTags'), m = layEl('main'); if (!box || !m) return;
    while (box.firstChild) box.removeChild(box.firstChild);
    var mw = m.clientWidth;
    layPartsNow().forEach(function(el) {
        var r = layRectIn(el, m), t = document.createElement('div'); t.className = 'lay-tag'; t.textContent = layNameOf(el);
        t.style.left = Math.max(4, Math.min(r.w > mw / 2 ? r.left + r.w / 2 - 30 : r.left - 4, mw - 120)) + 'px';   // a control as wide as half the area is named at its middle
        t.style.top = (r.top < 40 ? r.bottom + 8 : r.top - 24) + 'px';
        box.appendChild(t);
    });
}
function layEdit(on) {
    var body = document.body;
    if (on) {
        var w = layView();
        if (!w) { layToast('Open a map to change its layout.'); return false; }
        if (layNarrow()) { layToast('Make the window wider to change the layout.'); return false; }
        var sm = layEl('settingsModal'), sc = layEl('settingsCloseBtn'); if (sm && sm.style.display !== 'none' && sm.style.display !== '' && sc) sc.click();
        if (typeof window.wbOneMenu === 'function') { try { window.wbOneMenu(); } catch (e) {} }
        document.querySelectorAll('.floating-toolbar .shape-menu.show').forEach(function(mn) { mn.classList.remove('show'); });
        _lay.edit = true; body.classList.add('lay-edit');
        var lt = layEl('layTags'), sh = layEl('layShade'), cd = layEl('layCard'); if (lt) lt.hidden = false; if (sh) sh.hidden = false; if (cd) cd.hidden = false;
        laySync(); layCardSync(); layCardPlace();
        var first = cd && cd.querySelector('button'); if (first && typeof first.focus === 'function') first.focus();
        return true;
    }
    if (!_lay.edit) return false;
    _lay.edit = false; _lay.drag = null; body.classList.remove('lay-edit');
    ['layTags', 'layShade', 'layCard', 'layPart'].forEach(function(id) { var e = layEl(id); if (e) e.hidden = true; });
    document.querySelectorAll('.lay-moving').forEach(function(e) { e.classList.remove('lay-moving'); });
    laySync();
    return true;
}
// Escape: the card of one control first, then the edit mode (esckey.js asks while the body wears lay-edit)
function layEscape() { var p = layEl('layPart'); if (p && !p.hidden) { p.hidden = true; return; } layEdit(false); }
function layToast(t) { if (typeof window.appToast === 'function') window.appToast(t); }
function layCardPlace() {
    var cd = layEl('layCard'), m = layEl('main'); if (!cd || !m || cd._moved) return;
    cd.style.left = Math.max(8, Math.round((m.clientWidth - cd.offsetWidth) / 2)) + 'px';
    cd.style.top = Math.max(8, Math.round(m.clientHeight * 0.16)) + 'px';
}
function layCur() { var lay = layRead(), w = _lay.which || 'play'; return cleanView(lay && lay[w], w); }
function layCardSync() {
    var v = layCur(), cd = layEl('layCard'); if (!cd) return;
    cd.querySelectorAll('[data-lay-side]').forEach(function(b) { var on = b.getAttribute('data-lay-side') === v.bar.side; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    cd.querySelectorAll('[data-lay-edge]').forEach(function(b) { var on = (b.getAttribute('data-lay-edge') === '1') === v.bar.edge; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.disabled = v.bar.side === 'free'; });
    var hd = layEl('layHideTick'); if (hd) hd.checked = v.bar.hide;
    var ch = layEl('layColHideTick'), chRow = layEl('layColHideRow'); if (ch) ch.checked = !!v.colHide; if (chRow) chRow.hidden = _lay.which !== 'play';
    cd.querySelectorAll('[data-lay-show]').forEach(function(t) { var s = typeof window.wpViewShown === 'function' ? window.wpViewShown(t.getAttribute('data-lay-show')) : null; if (s !== null) t.checked = !!s; });
    layPrefsSync();
}
// Settings, On my screen, Layout: the play map's toolbar, as the card sets it
function layPrefsSync() {
    var lay = layRead(), v = cleanView(lay && lay.play, 'play');
    document.querySelectorAll('#setLaySide [data-lay-side]').forEach(function(b) { b.classList.toggle('on', b.getAttribute('data-lay-side') === v.bar.side); });
    document.querySelectorAll('#setLayEdge [data-lay-edge]').forEach(function(b) { b.classList.toggle('on', (b.getAttribute('data-lay-edge') === '1') === v.bar.edge); b.disabled = v.bar.side === 'free'; });
    var sw = layEl('setLayHideBtn'), st = layEl('setLayHideState'); if (sw) sw.setAttribute('aria-checked', v.bar.hide ? 'true' : 'false'); if (st) st.textContent = v.bar.hide ? 'on' : 'off';   // settings.js swSync reads the word, as for every switch there
}
function layBarSet(which, ch) {
    var lay = layRead(), v = cleanView(lay && lay[which], which), b = Object.assign({}, v.bar, ch);
    if (b.side === 'free' && !b.at) { var el = layBarOf(which), A = layArea(), r = el && A && el.offsetWidth ? layRectIn(el, A.el) : null; b.at = r ? spotOf(r.left, r.top, { w: el.offsetWidth, h: el.offsetHeight }, A) : { c: 'mc', x: 0, y: 0 }; }
    if (b.side !== 'free') delete b.at;
    layWrite(layWith(lay, which, { bar: b })); layCardSync();
}
function layPartCard(el, x, y) {
    var p = layEl('layPart'), m = layEl('main'); if (!p || !m) return;
    var which = _lay.which, isBar = el.id === LAY_BARS[which], v = layCur(), cur = isBar ? (v.bar.side === 'free' ? v.bar.at && v.bar.at.c : { top: 'tc', bottom: 'bc', left: 'ml', right: 'mr' }[v.bar.side]) : (v.parts[el.id] && v.parts[el.id].c);
    p._for = el.id; var nm = p.querySelector('.lay-part-name'); if (nm) nm.textContent = layNameOf(el);
    p.querySelectorAll('[data-lay-spot]').forEach(function(b) { var on = b.getAttribute('data-lay-spot') === cur; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    p.hidden = false;
    var a = m.getBoundingClientRect();
    p.style.left = Math.round(layHold(x - a.left, 8, m.clientWidth - p.offsetWidth - 8)) + 'px';
    p.style.top = Math.round(layHold(y - a.top, 8, m.clientHeight - p.offsetHeight - 8)) + 'px';
    var on = p.querySelector('[data-lay-spot].on') || p.querySelector('[data-lay-spot]'); if (on) on.focus();
}
function layPutPart(id, sp) {
    var which = _lay.which; if (!which) return;
    var lay = layRead();
    if (id === LAY_BARS[which]) { var v = cleanView(lay && lay[which], which); layWrite(layWith(lay, which, { bar: sp ? barOf(sp, v.bar) : { side: 'bottom', edge: false, hide: v.bar.hide } })); }
    else layWrite(layWith(lay, which, { part: [id, sp] }));
    layCardSync();
}
// A drag in the edit mode: the control follows the pointer inside the area and keeps the place it is let go at
function layDown(e) {
    if (!_lay.edit || e.button !== 0) return;
    var el = layPartOf(e.target); if (!el) return;
    e.preventDefault(); e.stopPropagation();
    var p = layEl('layPart'); if (p) p.hidden = true;
    var m = layEl('main'), r = layRectIn(el, m);
    _lay.drag = { el: el, dx: e.clientX - el.getBoundingClientRect().left, dy: e.clientY - el.getBoundingClientRect().top, moved: false, w: el.offsetWidth, h: el.offsetHeight, x: r.left, y: r.top };
    if (el.id === LAY_BARS[_lay.which]) {   // the bar is dragged as the box it is when free, and keeps the pointer at the same share of its length
        var fx = _lay.drag.dx / Math.max(1, _lay.drag.w), fy = _lay.drag.dy / Math.max(1, _lay.drag.h);
        el.classList.remove('lay-top', 'lay-left', 'lay-right', 'lay-side', 'lay-edge', 'lay-cols', 'tb-wrap'); el.classList.add('lay-free'); el.style.width = '';
        _lay.drag.w = el.offsetWidth; _lay.drag.h = el.offsetHeight; _lay.drag.dx = fx * _lay.drag.w; _lay.drag.dy = fy * _lay.drag.h;
        layAt(el, { x: Math.round(layHold(e.clientX - m.getBoundingClientRect().left - _lay.drag.dx, 0, m.clientWidth - _lay.drag.w)), y: Math.round(layHold(e.clientY - m.getBoundingClientRect().top - _lay.drag.dy, 0, m.clientHeight - _lay.drag.h)) });
    }
    el.classList.add('lay-moving');
    try { if (el.setPointerCapture) el.setPointerCapture(e.pointerId); } catch (x) {}
}
function layMove(e) {
    var d = _lay.drag; if (!d) return;
    e.preventDefault();
    var m = layEl('main'), a = m.getBoundingClientRect(), A = layArea();
    d.x = layHold(e.clientX - a.left - d.dx, 0, A.w - d.w); d.y = layHold(e.clientY - a.top - d.dy, 0, A.h - d.h); d.moved = true;
    layAt(d.el, { x: Math.round(d.x), y: Math.round(d.y) });
    layTags();
}
function layUp(e) {
    var d = _lay.drag; if (!d) return;
    _lay.drag = null; d.el.classList.remove('lay-moving');
    try { if (d.el.releasePointerCapture) d.el.releasePointerCapture(e.pointerId); } catch (x) {}
    if (!d.moved) { laySync(); return; }
    var A = layArea(), sp = spotOf(d.x, d.y, { w: d.w, h: d.h }, A);
    layPutPart(d.el.id, sp);
}
function layWire() {
    document.addEventListener('pointerdown', layDown, true);
    document.addEventListener('pointermove', layMove, true);
    document.addEventListener('pointerup', layUp, true);
    document.addEventListener('pointercancel', layUp, true);
    ['click', 'dblclick', 'mousedown', 'auxclick'].forEach(function(t) { document.addEventListener(t, function(e) { if (_lay.edit && layPartOf(e.target)) { e.preventDefault(); e.stopPropagation(); } }, true); });
    document.addEventListener('contextmenu', function(e) { if (!_lay.edit) return; var el = layPartOf(e.target); if (!el) return; e.preventDefault(); e.stopPropagation(); layPartCard(el, e.clientX, e.clientY); }, true);
    document.addEventListener('pointerdown', function(e) { var p = layEl('layPart'); if (p && !p.hidden && !p.contains(e.target)) p.hidden = true; });
    var cd = layEl('layCard');
    if (cd) {
        cd.addEventListener('click', function(e) {
            var b = e.target.closest('button'); if (!b) return; var w = _lay.which || 'play';
            if (b.hasAttribute('data-lay-side')) layBarSet(w, { side: b.getAttribute('data-lay-side') });
            else if (b.hasAttribute('data-lay-edge')) layBarSet(w, { edge: b.getAttribute('data-lay-edge') === '1' });
            else if (b.id === 'layResetBtn') { var lay = layRead(); if (lay) { delete lay[w]; layWrite(lay); } layCardSync(); }
            else if (b.id === 'layDoneBtn') layEdit(false);
        });
        cd.addEventListener('change', function(e) {
            var t = e.target, w = _lay.which || 'play';
            if (t.id === 'layHideTick') layBarSet(w, { hide: t.checked });
            else if (t.id === 'layColHideTick') layWrite(layWith(layRead(), 'play', { colHide: t.checked }));
            else if (t.hasAttribute('data-lay-show')) { var k = t.getAttribute('data-lay-show'); if (typeof window.wpViewShown === 'function' && window.wpViewShown(k) !== t.checked && typeof window.wpViewSwitch === 'function') window.wpViewSwitch(k); layCardSync(); }
        });
        var head = cd.querySelector('.lay-card-head');
        if (head) head.addEventListener('pointerdown', function(e) {
            if (e.button !== 0 || e.target.closest('button')) return; e.preventDefault();
            var sx = e.clientX - cd.offsetLeft, sy = e.clientY - cd.offsetTop, m = layEl('main');
            var mv = function(ev) { cd._moved = true; cd.style.left = Math.round(layHold(ev.clientX - sx, 0, m.clientWidth - cd.offsetWidth)) + 'px'; cd.style.top = Math.round(layHold(ev.clientY - sy, 0, m.clientHeight - cd.offsetHeight)) + 'px'; };
            var up = function() { document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); };
            document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
        });
    }
    var pc = layEl('layPart');
    if (pc) pc.addEventListener('click', function(e) {
        var b = e.target.closest('button'); if (!b || !pc._for) return;
        if (b.hasAttribute('data-lay-spot')) { var c = b.getAttribute('data-lay-spot'); layPutPart(pc._for, { c: c, x: 0, y: 0 }); }
        else if (b.id === 'layPartBackBtn') layPutPart(pc._for, null);
        pc.hidden = true;
    });
    ['wbEditLayoutBtn', 'dataEditLayoutBtn', 'setLayEditBtn'].forEach(function(id) {
        var b = layEl(id); if (!b) return;
        b.addEventListener('click', function() {
            var mn = b.closest('.shape-menu'); if (mn) mn.classList.remove('show');
            if (id === 'setLayEditBtn' && !layView()) { var pm = Array.prototype.filter.call(document.querySelectorAll('header button'), function(x) { return /^Play Map/.test(x.title || ''); })[0]; if (pm) pm.click(); }
            layEdit(true);
        });
    });
    document.querySelectorAll('#setLaySide [data-lay-side]').forEach(function(b) { b.addEventListener('click', function() { layBarSet('play', { side: b.getAttribute('data-lay-side') }); }); });
    document.querySelectorAll('#setLayEdge [data-lay-edge]').forEach(function(b) { b.addEventListener('click', function() { layBarSet('play', { edge: b.getAttribute('data-lay-edge') === '1' }); }); });
    var hs = layEl('setLayHideBtn'); if (hs) hs.addEventListener('click', function() { var lay = layRead(); layBarSet('play', { hide: !cleanView(lay && lay.play, 'play').bar.hide }); });
    var rs = layEl('setLayResetBtn'); if (rs) rs.addEventListener('click', function() { layWrite(null); layCardSync(); layToast('Every control is back in its own place.'); });
    var sb = layEl('settingsBtn'); if (sb) sb.addEventListener('click', layPrefsSync);
    layPrefsSync();
}
// Asked again when the area, a control or the page's classes change; a frame later, once, however many asked
function laySoon() { if (_lay.queued) return; _lay.queued = true; requestAnimationFrame(function() { _lay.queued = false; if (layRead() || _lay.edit || document.body.classList.contains('lay-on')) laySync(); }); }
function layInit() {
    if (typeof window === 'undefined' || typeof document === 'undefined' || window.wpPopout || window.wpStream) return;
    layWire();
    if (typeof ResizeObserver === 'function') {
        _lay.ro = new ResizeObserver(laySoon);
        ['main', 'wbFloatingToolbar', 'dataFloatingToolbar'].concat(LAY_PARTS.play, LAY_PARTS.data).forEach(function(id) { var e = layEl(id); if (e) _lay.ro.observe(e); });
    }
    if (typeof MutationObserver === 'function') {
        new MutationObserver(function(recs) {
            for (var i = 0; i < recs.length; i++) if (recs[i].attributeName === 'class') { laySoon(); return; }
        }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
        new MutationObserver(function(recs) {   // a menu that comes up in a laid-out bar is fitted; one that goes lets a hidden bar go
            recs.forEach(function(r) {
                var t = r.target; if (!t.classList || !t.classList.contains('shape-menu')) return;
                if (t.classList.contains('show')) layMenuFit(t);
                else { var bar = t.closest('.lay-hide'); if (bar && !bar.matches(':hover')) layPeek(bar, false); }
            });
        }).observe(layEl('main') || document.body, { attributes: true, attributeFilter: ['class'], subtree: true });
    }
    if (layRead()) laySync();
}
// [layoutcheck:api]
var API = { sync: laySync, edit: layEdit, escape: layEscape, held: layHeld, fitSide: layFitSide, measure: layMeasure, menuFit: layMenuFit, editing: function() { return _lay.edit; } };
export { cleanLayout, cleanView, cleanBar, cleanSpot, spotXY, spotOf, barOf, pushOf, layWith, barClasses, LAY_KEY, LAY_PARTS, LAY_BARS, LAY_SPOTS, LAY_SIDES, API };
if (typeof window !== 'undefined') {
    window.wpLayout = API;
    if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', layInit); else layInit(); }
}

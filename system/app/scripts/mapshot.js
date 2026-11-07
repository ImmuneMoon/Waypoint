/* Map builder (1.5.4, backlog item 23, fold B4): Save map as picture, the page's half. The owner, 2026-10-10, by prompt on a sheet: the
   command lives in "Export As", the dialog is "As drawn", and tokens are "Never" in the picture.

   shotcore.js draws the picture and decides what belongs in it. This module is the dialog, the loading and the file: it reads the kept
   choices, says the picture's size before anything is made, loads every picture, font and pattern the drawing needs, has the core draw them
   in one go onto a canvas of its own, and saves the PNG to this computer as every export is saved. It is the GM's alone and only for a play
   map of this computer's own campaign. Nothing on the map is changed and nothing is sent to anyone.

   A text box's markup is read through an inert parse and handed to the core as plain lines: nothing of it is ever put on the page. */
import { state } from './state.js';
import { getActiveMap } from './models.js';
import { toast } from './io.js';
import * as SC from './shotcore.js';
import * as BC from './buildcore.js';

// [buildcheck:mapshot-start]
var SHOT_KEY = 'wp_shot', SHOT_CANT = 'The picture could not be made. Try a smaller cell size.';
var _shot = { area: 'map', cell: 70, grid: true, labels: true, bg: 'dark', busy: false, gen: 0, loaded: false, err: '', flat: null, rules: 'keep' };   // 1.6.2 (backlog 39): flat, a flatten of a selection under way ({ ids }); rules, what its pieces with rules do
function shotEl(id) { return document.getElementById(id); }
// The GM's own campaign on this computer, never someone else's table, the stream window or a window of a page's own
function shotMay() {
    var n = window.wpNet, body = document.body, cl = body && body.classList;
    if (n && (n.foreign || n.stream || (n.active && n.role === 'client'))) return false;
    if (cl && typeof cl.contains === 'function' && (cl.contains('stream-mode') || cl.contains('net-client'))) return false;
    return !!(window.wpCanPersistLocal && window.wpCanPersistLocal());
}
function shotMap() { var m = getActiveMap(); return m && m.type === 'map' && state.viewMode === 'visual' && Array.isArray(m.whiteboard) ? m : null; }
function shotAsking() { var q = shotEl('customConfirm'), p = shotEl('customPrompt'); return !!((q && q.style.display === 'flex') || (p && p.style.display === 'flex')); }   // a question or a prompt of the app's own is up: its keys are its own
function shotShown() { var m = shotEl('shotModal'); return !!m && m.style.display === 'flex'; }
// The choices of the last picture, kept on this computer and read back through their own rules
function shotLoad() {
    if (_shot.loaded) return;
    _shot.loaded = true;
    try {
        var v = JSON.parse(localStorage.getItem(SHOT_KEY) || 'null'); if (!v || typeof v !== 'object') return;
        _shot.area = v.area === 'view' ? 'view' : 'map'; _shot.cell = SC.cleanCell(v.cell); _shot.grid = v.grid !== false; _shot.labels = v.labels !== false; _shot.bg = v.bg === 'none' ? 'none' : 'dark';
    } catch (e) {}
    try { _shot.rules = localStorage.getItem('wp_flatRules') === 'out' ? 'out' : 'keep'; } catch (e) {}   // 1.6.2 (backlog 39): a flatten's pieces with rules, kept apart
}
function shotKeep() { try { localStorage.setItem(SHOT_KEY, JSON.stringify({ area: _shot.area, cell: _shot.cell, grid: _shot.grid, labels: _shot.labels, bg: _shot.bg })); } catch (e) {} try { localStorage.setItem('wp_flatRules', _shot.rules); } catch (e) {} }
// 1.6.2 (backlog 38): a map's own cell (fogcore cleanMapCell), null for today's lattice
function shotOwnCell(map) { var g = shotGridOf(map), FC = window.wpFogCore; return g && map.meta && FC && typeof FC.cleanMapCell === 'function' ? FC.cleanMapCell(map.meta.cell, g) : null; }
// the board px a Cell size chip measures against: one cell of the map's own (a hex by its row as 52 is to 50), today's 50 with none
function shotRef(map) { var c = shotOwnCell(map); return c ? (shotGridOf(map) === 'hex' ? c.size * 50 / 52 : c.size) : 50; }
function shotGridOf(map) { var g = map && map.meta && map.meta.gridType; return g === 'square' || g === 'hex' ? g : ''; }   // the map's own grid, never this screen's
// The whole map begins and ends on the grid's own lines (a square's 50 px, a hex tile's 90 by 52), so that a grid laid over the picture in
// another program can start at the picture's corner. A map with no grid has no lines to keep to
function shotSnap(map) { var g = shotGridOf(map), c = shotOwnCell(map), k = c ? c.size / (g === 'hex' ? 52 : 50) : 1; return g === 'square' ? { w: 50 * k, h: 50 * k } : g === 'hex' ? { w: 90 * k, h: 52 * k } : null; }
// What is on screen, in the board's own units: where the map's area is scrolled to, over its zoom
function shotView() {
    var wrap = shotEl('whiteboardWrap'), z = state.zoomLevel > 0 ? state.zoomLevel : 1;
    return wrap ? SC.viewBox({ x: wrap.scrollLeft / z, y: wrap.scrollTop / z, w: wrap.clientWidth / z, h: wrap.clientHeight / z }) : null;
}
// 1.6.2 (backlog 39): a flatten of the selection, planned on the map as it stands (shotcore flatPlan); flatten.js lays it, since this dialog changes nothing on the map
function flatNow(map) { return _shot.flat && map ? SC.flatPlan(map.whiteboard, _shot.flat.ids, _shot.rules) : null; }
function shotBox(map) { if (_shot.flat) { var fpB = flatNow(map); return fpB && fpB.ok ? fpB.box : null; } return _shot.area === 'view' ? shotView() : SC.bounds(map.whiteboard, { labels: _shot.labels, grid: !!shotGridOf(map), snap: shotSnap(map) }); }
function shotTitle(map) { var raw = (map && map.meta && typeof map.meta.title === 'string' && map.meta.title) || 'map'; return String(raw).replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '').trim().slice(0, 80) || 'map'; }
// A tooltip set while the page runs goes into data-tip, where the app's own tooltips read it. Set back into title, the browser's own bubble
// would come up beside the app's
function shotTip(el, text) { if (!el) return; if (typeof el.removeAttribute === 'function') el.removeAttribute('title'); if (typeof el.setAttribute === 'function') el.setAttribute('data-tip', text); }
// What a Cell size chip gives on the grid this map has, in fixed words. A hex cell of the board is 60 wide and 52 high, a square one 50
function shotCellTip(c, kind) {
    if (kind === 'hex') { var hh = 52 * c / 50; return 'A hex cell is ' + Math.round(60 * c / 50) + ' pixels wide and ' + (hh % 1 ? 'about ' : '') + Math.round(hh) + ' high in the file.'; }
    if (kind === 'square') return 'One cell is ' + c + ' pixels in the file.' + (c === 50 ? ' That is its size on your screen at full zoom.' : c === 70 ? ' Many other virtual tabletops use this size.' : c === 140 ? ' This prints well.' : '');
    return 'This map has no grid. 50 pixels of it are ' + c + ' pixels in the file.';
}
// The dialog as the choices stand: the chip in use lit, the ticks, the size in words, and Save off while no picture can be made. A picture
// that could not be made is said in the same line, in sight: a notice of the page's would lie under the dialog's own backdrop
function shotSync() {
    var map = shotMap(), p = SC.plan(map ? shotBox(map) : null, _shot.cell, map ? shotRef(map) : 50), gridKind = shotGridOf(map);
    var seg = function(id, attr, val, tip) {
        var box = shotEl(id); if (!box) return;
        Array.prototype.forEach.call(box.querySelectorAll('[' + attr + ']'), function(b) { var on = b.getAttribute(attr) === String(val); b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); if (tip) shotTip(b, tip(b.getAttribute(attr))); });
    };
    seg('shotArea', 'data-area', _shot.area); seg('shotCell', 'data-cell', _shot.cell, function(v) { return shotCellTip(SC.cleanCell(Number(v)), gridKind); }); seg('shotBg', 'data-bg', _shot.bg);
    var g = shotEl('shotGrid'), l = shotEl('shotLabels'), line = shotEl('shotSize'), go = shotEl('shotGo'), cancel = shotEl('shotCancel');
    if (g) { g.checked = _shot.grid && !!gridKind; g.disabled = !gridKind || _shot.busy; shotTip(shotEl('shotGridTick') || g, gridKind ? 'The map’s own grid, drawn over the pieces.' : 'This map has no grid.'); }
    if (l) { l.checked = _shot.labels; l.disabled = _shot.busy; }
    var fl = !!_shot.flat, rowOf = function(id) { var e = shotEl(id); return e && typeof e.closest === 'function' ? e.closest('.gen-row') : null; };   // 1.6.2 (backlog 39): the same dialog flattens a selection
    [rowOf('shotArea'), rowOf('shotGridTick'), rowOf('shotBg')].forEach(function(r) { if (r) r.hidden = fl; }); var rr = shotEl('shotRulesRow'); if (rr) rr.hidden = !fl; seg('shotRules', 'data-rules', _shot.rules);
    var tt = shotEl('shotTitle'), nt = shotEl('shotNote'); if (tt) tt.textContent = fl ? 'Flatten into one picture' : 'Save map as picture'; if (nt) nt.textContent = fl ? 'The selected pieces become one picture, saved with this campaign. The plain pieces are hidden, and Unflatten on its right-click puts them back.' : 'Tokens, hidden pieces and your own GM marks are left out. Fog is not drawn, so the picture also shows what your players have not seen yet.';
    if (line) line.textContent = _shot.busy ? 'Making the picture\u2026' : (_shot.err || (fl && !p.ok && p.why === 'empty' ? 'Nothing selected can be drawn into a picture.' : SC.sizeWords(p, _shot.area)));
    if (go) { go.disabled = !p.ok || _shot.busy; go.textContent = fl ? 'Flatten' : 'Save picture'; }
    if (cancel) cancel.disabled = false;
    return p;
}
function shotShow(flat) {
    var m = shotEl('shotModal'); if (!m) return false;
    _shot.flat = flat && typeof flat === 'object' && Array.isArray(flat.ids) && flat.ids.length ? { ids: flat.ids.filter(function(x) { return typeof x === 'string'; }).slice(0, 60000) } : null;
    if (!shotMay()) { toast('Not while you are at someone else’s table.'); return false; }
    if (!shotMap()) { toast('Save map as picture is for a play map. Open a map and its Play Map view first.'); return false; }
    shotLoad(); _shot.busy = false; _shot.err = ''; shotSync();
    m.style.display = 'flex';
    var first = m.querySelector('#shotArea .gen-chip.on') || shotEl('shotCancel'); if (first && typeof first.focus === 'function') first.focus();
    return true;
}
function shotHide() {
    var m = shotEl('shotModal'); if (!m || !shotShown()) return;
    m.style.display = 'none'; _shot.gen++; _shot.busy = false; _shot.err = ''; _shot.flat = null;   // a picture still being made is let go: its answer finds another count
    var b = shotEl('moreMenuBtn'); if (b && typeof b.focus === 'function') b.focus();
}
// One picture, loaded whole or not at all: { img, w, h }, or null for a file that is gone, is no picture or takes too long
function shotPic(addr) {
    return new Promise(function(res) {
        var done = false, im = null, end = function(ok) { if (done) return; done = true; res(ok && im && im.naturalWidth > 0 && im.naturalHeight > 0 ? { img: im, w: im.naturalWidth, h: im.naturalHeight } : null); };
        try { im = new Image(); im.onload = function() { end(true); }; im.onerror = function() { end(false); }; setTimeout(function() { end(false); }, 20000); im.src = addr; } catch (e) { end(false); }
    });
}
function shotFont(css) {
    var fs = document.fonts; if (!fs || typeof fs.load !== 'function') return Promise.resolve();
    return Promise.race([Promise.resolve().then(function() { return fs.load(css); }).catch(function() {}), new Promise(function(r) { setTimeout(r, 3000); })]);
}
// A pattern's tile drawn k times its size, by the constants the board's own tile is made of: the faint fill where it has one, the one path
// stroked dark and then light with round ends, cut by the tile's own edge
function shotTile(name, k) {
    var t = BC.TEX[name], ink = BC.TEX_INK; if (!t || !ink || typeof Path2D !== 'function') return null;
    try {
        var cv = document.createElement('canvas'); cv.width = Math.round(t.w * k); cv.height = Math.round(t.h * k);
        var c = cv.getContext('2d'); if (!c) return null;
        var p = new Path2D(t.d);
        c.scale(k, k); c.beginPath(); c.rect(0, 0, t.w, t.h); c.clip();
        if (t.fill) { c.fillStyle = t.fill; c.fill(p); }
        c.lineCap = 'round';
        c.strokeStyle = ink.dark; c.lineWidth = t.dark; c.stroke(p);
        c.strokeStyle = ink.light; c.lineWidth = t.light; c.stroke(p);
        return { img: cv, k: k };
    } catch (e) { return null; }
}
// A text box's plain lines, through a parse that puts nothing on the page
function shotText(item) {
    if (typeof item.text !== 'string' || !item.text || item.text.length > 400000 || typeof DOMParser !== 'function') return [];
    try { var doc = new DOMParser().parseFromString('<!doctype html><body>' + item.text + '</body>', 'text/html'); return SC.plainLines(doc && doc.body); } catch (e) { return []; }
}
// The closing words: the size, and whatever is not in the picture that the GM would look for
function shotDoneWords(p, lost, cut) {
    var s = 'Picture saved, ' + SC.sizeWords(p, '').replace(/^The picture will be /, '');
    if (lost === 1) s += ' One picture could not be read and was left out.';
    else if (lost > 1) s += ' ' + lost + ' pictures could not be read and were left out.';
    if (cut === true) s += ' This map holds more pieces than one picture draws, so the newest were left out.';
    return s;
}
function shotSave(name, blob) {
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function() { URL.revokeObjectURL(url); }, blob && blob.size > 50 * 1024 * 1024 ? 600000 : 1000);
}
// Save picture: everything is loaded first, then drawn in one go in the board's own order, then saved. A dialog closed meanwhile saves nothing
function shotGo() {
    if (!shotShown() || _shot.busy) return false;
    var map = shotMap(); if (!map || !shotMay()) { shotHide(); return false; }
    _shot.err = '';
    var box = shotBox(map), p = SC.plan(box, _shot.cell, shotRef(map)); if (!p.ok) { shotSync(); return false; }
    var fp = flatNow(map), grid = fp ? '' : shotGridOf(map), lines = !fp && _shot.grid && !!grid, labels = fp ? true : _shot.labels, bg = fp ? 'none' : _shot.bg, items = fp ? fp.draw.slice() : map.whiteboard.slice(), need = SC.needs(items, { labels: labels, grid: !!grid, box: box }), title = shotTitle(map), my = ++_shot.gen;   // 1.6.2 (backlog 39): a flatten draws its own pieces alone, on a clear ground
    _shot.busy = true; shotKeep(); shotSync();
    var fail = function() { if (my !== _shot.gen) return; _shot.busy = false; _shot.err = SHOT_CANT; shotSync(); };
    Promise.all([Promise.all(need.pics.map(shotPic)), Promise.all(need.fonts.map(shotFont))]).then(function(got) {
        if (my !== _shot.gen) return null;
        var pics = Object.create(null), tiles = Object.create(null), lost = 0, k = Math.max(2, Math.ceil(p.scale) + 1);
        need.pics.forEach(function(a, i) { pics[a] = got[0][i] || null; if (!got[0][i]) lost++; });
        need.tiles.forEach(function(n) { tiles[n] = shotTile(n, k); });
        var cv = document.createElement('canvas'); cv.width = p.w; cv.height = p.h;
        var ctx = cv.getContext('2d'); if (!ctx) throw new Error('no context');
        var drew = SC.draw(ctx, { box: box, scale: p.scale, bg: bg, grid: grid, cell: shotOwnCell(map), lines: lines, labels: labels, items: items, res: {
            pic: function(a) { return pics[a] || null; },
            tile: function(n) { return tiles[n] || null; },
            text: shotText
        } });
        var CPs = window.wpCompassCore, cps = CPs && CPs.compassOf ? CPs.compassOf(map) : null;   // 1.6.2, backlog 82: the map's compass drawn in, where its pic tick is on
        if (cps && cps.pic === true && typeof CPs.roseDraw === 'function') { var rs = Math.max(48, Math.min(256, Math.round(Math.min(p.w, p.h) * 0.12))), rx = cps.at === 'map' ? (cps.x - box.x) * p.scale : cps.at === 'bl' ? rs / 2 + 12 : p.w - rs / 2 - 12, ry = cps.at === 'map' ? (cps.y - box.y) * p.scale : p.h - rs / 2 - 12; if (cps.at === 'map') rs = Math.max(16, 64 * p.scale); CPs.roseDraw(ctx, rx, ry, rs, cps.north || 0); }
        return new Promise(function(res, rej) { try { cv.toBlob(function(b) { if (b) res({ blob: b, lost: lost, cut: !!(drew && drew.cut) }); else rej(new Error('no file')); }, 'image/png'); } catch (e) { rej(e); } });
    }).then(function(r) {
        if (!r || my !== _shot.gen) return;
        if (fp) {   // 1.6.2 (backlog 39): the picture is saved with the campaign's pictures and laid where its pieces were
            var mapId = state.appState && state.appState.campaigns && state.appState.activeCampaignId ? (state.appState.campaigns[state.appState.activeCampaignId] || {}).activeItemId : null;
            if (typeof window.wpUploadBlob !== 'function' || !mapId) throw new Error('no upload');
            return window.wpUploadBlob(mapId, title + '-flat.png', r.blob).then(function(url) {
                if (my !== _shot.gen) return; var m2 = shotMap(); if (!m2 || !window.wpFlatten) throw new Error('map gone'); var fp2 = SC.flatPlan(m2.whiteboard, _shot.flat.ids, _shot.rules); if (!fp2.ok) throw new Error('nothing left');
                shotHide(); window.wpFlatten.lay(m2, fp2, url);
            });
        }
        shotSave(title + '.png', r.blob);
        shotHide();
        toast(shotDoneWords(p, r.lost, r.cut));
    }).catch(fail);
    return true;
}
function shotStops() {
    var m = shotEl('shotModal'); if (!m) return [];
    return Array.prototype.filter.call(m.querySelectorAll('button, input'), function(el) { return !el.disabled && !(el.closest && el.closest('[hidden]')); });
}
function shotTab(from, back) {
    var stops = shotStops(); if (!stops.length) return;
    var i = stops.indexOf(from), next = back ? (i <= 0 ? stops.length - 1 : i - 1) : (i < 0 || i === stops.length - 1 ? 0 : i + 1);
    if (typeof stops[next].focus === 'function') stops[next].focus();
}
function shotPick(change) { if (_shot.busy) return; _shot.err = ''; change(); shotKeep(); shotSync(); }
// Every key pressed while the dialog is up is the dialog's, wherever the focus is. It is heard FIRST, on the window in the capture phase, and
// goes no further: the page reads keys at the document and would undo, delete or move what is selected, and a box of the page's that closes
// on Escape would close behind the dialog. Escape puts the dialog away and Tab goes round its controls. Any other key pressed on a control
// of the dialog is that control's own press, and one pressed anywhere else does nothing. While a question or a prompt of the app's own is up
// over the dialog every key is theirs
// The press of Escape that put the dialog away is the dialog's for as long as it is held: its repeats come after the dialog is down, and
// a box of the page's that closes on Escape would hear them. Any new press, and Escape let go, end that
var _shotEsc = false;
function shotKey(e) {
    if (e.repeat !== true) _shotEsc = false;
    else if (_shotEsc && e.key === 'Escape') { if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation(); else e.stopPropagation(); e.preventDefault(); return; }
    if (!shotShown() || shotAsking()) return;
    var m = shotEl('shotModal'), inside = !!(m && e.target && typeof m.contains === 'function' && m.contains(e.target));
    if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation(); else e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); if (e.repeat !== true) { shotHide(); _shotEsc = true; } }
    else if (e.key === 'Tab') { e.preventDefault(); shotTab(inside ? e.target : null, e.shiftKey === true); }
    else if (!inside) e.preventDefault();
}
// A paste is the page's to read too (it lays a copied piece or a picture on the map): never while the dialog is up
function shotPaste(e) { if (!shotShown() || shotAsking()) return; e.preventDefault(); if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation(); else e.stopPropagation(); }
// The key that put the dialog away, still held, presses nothing on the button the focus went back to
function shotKeyUp(e) { if (e.key === 'Escape') _shotEsc = false; }
function shotHeld(e) { if (e.repeat === true && (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape')) { e.preventDefault(); e.stopPropagation(); } }
function shotWire() {
    var m = shotEl('shotModal'); if (!m) return;
    var row = shotEl('exportMapPicBtn'); if (row) row.addEventListener('click', function() { shotShow(); });
    var chips = function(id, attr, take) {
        var box = shotEl(id); if (!box) return;
        Array.prototype.forEach.call(box.querySelectorAll('[' + attr + ']'), function(b) { b.addEventListener('click', function() { var v = this.getAttribute(attr); shotPick(function() { take(v); }); }); });
    };
    chips('shotArea', 'data-area', function(v) { _shot.area = v === 'view' ? 'view' : 'map'; });
    chips('shotCell', 'data-cell', function(v) { _shot.cell = SC.cleanCell(Number(v)); });
    chips('shotBg', 'data-bg', function(v) { _shot.bg = v === 'none' ? 'none' : 'dark'; });
    chips('shotRules', 'data-rules', function(v) { _shot.rules = v === 'out' ? 'out' : 'keep'; });   // 1.6.2 (backlog 39)
    var g = shotEl('shotGrid'), l = shotEl('shotLabels'), cancel = shotEl('shotCancel'), go = shotEl('shotGo'), back = shotEl('moreMenuBtn');
    if (g) g.addEventListener('change', function() { var on = this.checked === true; shotPick(function() { _shot.grid = on; }); });
    if (l) l.addEventListener('change', function() { var on = this.checked === true; shotPick(function() { _shot.labels = on; }); });
    if (cancel) cancel.addEventListener('click', function() { shotHide(); });
    if (go) go.addEventListener('click', function() { shotGo(); });
    if (back) back.addEventListener('keydown', shotHeld);
    window.addEventListener('keydown', shotKey, true);
    window.addEventListener('keyup', shotKeyUp, true);
    window.addEventListener('paste', shotPaste, true);
}
// [buildcheck:mapshot-end]
shotWire();
if (typeof window !== 'undefined') window.wpMapShot = { open: shotShow, shown: shotShown };
if (typeof window !== 'undefined') window.wpMapShot.flatten = function(ids) { return shotShow({ ids: ids }); };   // 1.6.2 (backlog 39): the same dialog, flattening the selection

// [buildcheck:portalpic-start]
/* 1.6.0, a portal's destination as a small picture (backlog 32; the owner, 2026-10-29, by prompt). Resting on a portal shows the map it leads
   to beside its name. The picture is drawn here, on this computer, from the pieces of the map as this app holds it, by the map picture's own
   core (shotcore.js: shows, bounds, needs, draw), and kept for the next hover while the map is as it was. Nothing is sent to anyone: on a
   player's app, and in the stream window, it is drawn only from what that copy holds, so a map they have not reached (held as its stub, with
   nothing on it) has no picture. Fog is not drawn in a picture, so a map under fog has none on their screen either: it would show ground
   they have not seen. Tokens, hidden pieces, GM note cards, lights and trigger zones are never in it (shows), on the GM's screen too.
   The owner, 2026-10-29, by prompt: "Only what they've seen". A player's app holds whole only the map they stand on, so it keeps a picture
   of that map as they have seen it (seenTick, every few seconds while it changes): the whole map with no fog on it, else only the ground
   their screen remembers (fog.js memTrace), the rest dark. It is kept in memory alone, for the session, as the fog memory is, and never
   sent; a portal they rest on shows it for a map they now hold as a stub or under fog (seenPic). A map they have never stood on has none */
var PIC = { w: 160, h: 100, k: 2, max: 2, keep: 24 };
var _pics = Object.create(null), _picKeys = [];
// The GM's own screen (the map is drawn whole) or not (a player's app, someone else's table, the stream window, a window of a page's own)
function picGm() {
    var n = window.wpNet, body = document.body, cl = body && body.classList;
    if (window.wpStream || window.wpPopout || (n && (n.foreign || n.stream || (n.active && n.role === 'client')))) return false;
    return !(cl && typeof cl.contains === 'function' && (cl.contains('stream-mode') || cl.contains('net-client')));
}
// Whether a map has a picture on this screen: a map with pieces, never a stub, and on a screen not the GM's never one under fog
function picMay(map, gm) {
    if (!map || typeof map !== 'object' || map.type !== 'map' || !Array.isArray(map.whiteboard) || map.stub === true) return false;
    return gm === true || !(map.fog && typeof map.fog === 'object' && map.fog.on === true);
}
// What changes the picture, as one short word: the pieces it draws and what of them is drawn
function picSig(items) {
    var s = JSON.stringify(items.map(function(it) { return [it.id, it.type, it.x, it.y, it.w, it.h, it.rot, it.src, it.color, it.fill, it.texture, it.texSrc, it.texTile, it.opacity, it.layer, it.z, it.shape, Array.isArray(it.pts) ? it.pts.length : 0]; })), h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return s.length + ':' + h;
}
// The box and the scale: the whole of what is drawn, fitted to 160 by 100, drawn at twice that for a sharp picture, never larger than 2 to 1
function picPlan(items) {
    var box = SC.bounds(items, { labels: false, grid: false }); if (!box || !(box.w > 0) || !(box.h > 0)) return null;
    var sc = Math.min(PIC.w * PIC.k / box.w, PIC.h * PIC.k / box.h, PIC.max); if (!(sc > 0) || !isFinite(sc)) return null;
    return { box: box, scale: sc, w: Math.max(1, Math.ceil(box.w * sc)), h: Math.max(1, Math.ceil(box.h * sc)) };
}
function picKeep(key, v) { if (!_pics[key]) _picKeys.push(key); _pics[key] = v; while (_picKeys.length > PIC.keep) delete _pics[_picKeys.shift()]; }
// The picture of a map of the campaign on screen: its address now where it is drawn and the map is as it was, else '' and done(address) once
// it is drawn (never for a map that has no picture on this screen). The address is a PNG of this computer's own drawing, a data address
function picThumb(mapId, done) {
    var st = state.appState, camp = st && st.campaigns && typeof st.activeCampaignId === 'string' ? st.campaigns[st.activeCampaignId] : null;
    var map = camp && camp.items && typeof mapId === 'string' && Object.prototype.hasOwnProperty.call(camp.items, mapId) ? camp.items[mapId] : null, gm = picGm();
    if (!picMay(map, gm)) return gm || !map || map.type !== 'map' ? '' : seenPic(camp, mapId);   // a player's own picture of a map they now hold as a stub, or under fog
    var items = map.whiteboard.filter(function(it) { return SC.shows(it, false); }), p = picPlan(items); if (!p) return '';
    var key = String(camp.id) + '/' + mapId + '/' + (gm ? 'g' : 'p'), sig = picSig(items), had = _pics[key];
    if (had && had.sig === sig && had.url) return had.url;
    if (had && had.sig === sig && had.wait) { if (typeof done === 'function') had.wait.push(done); return ''; }
    var job = { sig: sig, url: '', wait: typeof done === 'function' ? [done] : [] }; picKeep(key, job);
    var need = SC.needs(items, { labels: false, grid: false, box: p.box });
    Promise.all(need.pics.map(shotPic)).then(function(got) {
        var pics = Object.create(null), tiles = Object.create(null), k = Math.max(1, Math.ceil(p.scale) + 1);
        need.pics.forEach(function(a, i) { pics[a] = got[i] || null; });
        need.tiles.forEach(function(n) { tiles[n] = shotTile(n, k); });
        var cv = document.createElement('canvas'); cv.width = p.w; cv.height = p.h;
        var ctx = cv.getContext('2d'); if (!ctx) throw new Error('no context');
        SC.draw(ctx, { box: p.box, scale: p.scale, bg: 'dark', grid: '', lines: false, labels: false, items: items, res: { pic: function(a) { return pics[a] || null; }, tile: function(n) { return tiles[n] || null; }, text: function() { return []; } } });
        job.url = cv.toDataURL('image/png');
    }).catch(function() { job.url = ''; }).then(function() {
        var w = job.wait; job.wait = null;
        if (_pics[key] !== job || !job.url) return;   // a newer drawing took its place, or none could be made (the next hover tries again)
        (w || []).forEach(function(f) { try { f(job.url); } catch (e) {} });
    });
    return '';
}
// A player's own pictures of the maps they have stood on, as they saw them: { sig, kind, url } by "<campaign>/<map>", 24 at most, in memory
var SEEN = { every: 3000 }, _seen = Object.create(null), _seenKeys = [], _seenBusy = Object.create(null);
function seenKeep(key, v) { if (!_seen[key]) _seenKeys.push(key); _seen[key] = v; while (_seenKeys.length > PIC.keep) delete _seen[_seenKeys.shift()]; }
function seenFog() { var F = window.wpFog; return F && typeof F.seenKind === 'function' && typeof F.memTrace === 'function' && typeof F.memSeenSig === 'function' ? F : null; }
// The picture this player keeps of a map, where it may still be shown: one drawn from their memory goes once the GM unticks remembering
function seenPic(camp, mapId) {
    var s = camp && typeof camp.id === 'string' ? _seen[camp.id + '/' + mapId] : null; if (!s || !s.url) return '';
    var F = seenFog(); if (s.kind === 'mem' && (!F || typeof F.rememberOff !== 'function' || F.rememberOff())) return '';
    return s.url;
}
// A picture of the map, as this player's app may have it: from the table, never from its own server, which does not hold the GM's files. '' while its bytes are on their way
function seenAddr(a) {
    var N = window.wpNet; if (!N || typeof N.assetSrc !== 'function' || /^(data:|blob:)/i.test(a)) return a;
    var raw = a; try { raw = decodeURIComponent(a); } catch (e) {}
    var out = N.assetSrc(raw); return out === raw ? a : (out === N.ASSET_PLACEHOLDER ? '' : out);
}
// Now and then on a player's app: the map they stand on, drawn as they have seen it, kept when it changed. Says whether a drawing was started
function seenTick() {
    if (picGm() || window.wpStream || window.wpPopout) return false;
    var st = state.appState, camp = st && st.campaigns && typeof st.activeCampaignId === 'string' ? st.campaigns[st.activeCampaignId] : null;
    var id = camp && typeof camp.activeItemId === 'string' ? camp.activeItemId : '', map = id && camp.items && Object.prototype.hasOwnProperty.call(camp.items, id) ? camp.items[id] : null;
    var F = seenFog(), kind = F && map ? F.seenKind(map) : ''; if (!kind || typeof camp.id !== 'string') return false;
    var items = map.whiteboard.filter(function(it) { return SC.shows(it, false); }), p = picPlan(items); if (!p) return false;
    var need = SC.needs(items, { labels: false, grid: false, box: p.box }), addrs = need.pics.map(seenAddr), waits = addrs.filter(function(a) { return !a; }).length;   // 1.6.0: a picture still on its way is left out, and the drawing is made again once it is here
    var key = camp.id + '/' + id, sig = picSig(items) + '|' + kind + '|' + (kind === 'mem' ? F.memSeenSig(map) : '') + '|' + waits, had = _seen[key];
    if ((had && had.sig === sig) || _seenBusy[key] === sig) return false;
    if (kind === 'mem' && !F.memSeenSig(map)) return false;   // nothing remembered yet: nothing to draw
    _seenBusy[key] = sig;
    Promise.all(addrs.map(function(a) { return a ? shotPic(a) : null; })).then(function(got) {
        var pics = Object.create(null), tiles = Object.create(null), k = Math.max(1, Math.ceil(p.scale) + 1);
        need.pics.forEach(function(a, i) { pics[a] = got[i] || null; });
        need.tiles.forEach(function(n) { tiles[n] = shotTile(n, k); });
        var cv = document.createElement('canvas'); cv.width = p.w; cv.height = p.h;
        var ctx = cv.getContext('2d'); if (!ctx) throw new Error('no context');
        SC.draw(ctx, { box: p.box, scale: p.scale, bg: 'dark', grid: '', lines: false, labels: false, items: items, res: { pic: function(a) { return pics[a] || null; }, tile: function(n) { return tiles[n] || null; }, text: function() { return []; } } });
        if (kind === 'mem') {   // only the ground this screen remembers stays; the rest is dark, as the fog shows it
            var mk = document.createElement('canvas'); mk.width = p.w; mk.height = p.h;
            var mc = mk.getContext('2d'); if (!mc) throw new Error('no context');
            mc.fillStyle = '#000'; mc.beginPath();
            if (!F.memTrace(map, mc, p.scale, p.box.x * p.scale, p.box.y * p.scale)) throw new Error('nothing remembered');
            mc.fill();
            ctx.globalCompositeOperation = 'destination-in'; ctx.drawImage(mk, 0, 0);
            ctx.globalCompositeOperation = 'destination-over'; ctx.fillStyle = '#05060c'; ctx.fillRect(0, 0, p.w, p.h);
            ctx.globalCompositeOperation = 'source-over';
        }
        seenKeep(key, { sig: sig, kind: kind, url: cv.toDataURL('image/png') });
    }).catch(function() {}).then(function() { if (_seenBusy[key] === sig) delete _seenBusy[key]; });
    return true;
}
// [buildcheck:portalpic-end]
if (typeof window !== 'undefined') window.wpMapShot.thumb = picThumb;
if (typeof window !== 'undefined' && typeof setInterval === 'function') setInterval(seenTick, SEEN.every);   // 1.6.0: a player's own picture of the map they stand on, as they see it

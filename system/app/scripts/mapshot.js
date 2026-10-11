/* Map builder (1.5.4, backlog item 23, fold B4): Save Map as Picture, the page's half. The owner, 2026-10-10, by prompt on a sheet: the
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
var _shot = { area: 'map', cell: 70, grid: true, labels: true, bg: 'dark', busy: false, gen: 0, loaded: false, err: '' };
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
}
function shotKeep() { try { localStorage.setItem(SHOT_KEY, JSON.stringify({ area: _shot.area, cell: _shot.cell, grid: _shot.grid, labels: _shot.labels, bg: _shot.bg })); } catch (e) {} }
function shotGridOf(map) { var g = map && map.meta && map.meta.gridType; return g === 'square' || g === 'hex' ? g : ''; }   // the map's own grid, never this screen's
// The whole map begins and ends on the grid's own lines (a square's 50 px, a hex tile's 90 by 52), so that a grid laid over the picture in
// another program can start at the picture's corner. A map with no grid has no lines to keep to
function shotSnap(map) { var g = shotGridOf(map); return g === 'square' ? { w: 50, h: 50 } : g === 'hex' ? { w: 90, h: 52 } : null; }
// What is on screen, in the board's own units: where the map's area is scrolled to, over its zoom
function shotView() {
    var wrap = shotEl('whiteboardWrap'), z = state.zoomLevel > 0 ? state.zoomLevel : 1;
    return wrap ? SC.viewBox({ x: wrap.scrollLeft / z, y: wrap.scrollTop / z, w: wrap.clientWidth / z, h: wrap.clientHeight / z }) : null;
}
function shotBox(map) { return _shot.area === 'view' ? shotView() : SC.bounds(map.whiteboard, { labels: _shot.labels, grid: !!shotGridOf(map), snap: shotSnap(map) }); }
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
    var map = shotMap(), p = SC.plan(map ? shotBox(map) : null, _shot.cell), gridKind = shotGridOf(map);
    var seg = function(id, attr, val, tip) {
        var box = shotEl(id); if (!box) return;
        Array.prototype.forEach.call(box.querySelectorAll('[' + attr + ']'), function(b) { var on = b.getAttribute(attr) === String(val); b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); if (tip) shotTip(b, tip(b.getAttribute(attr))); });
    };
    seg('shotArea', 'data-area', _shot.area); seg('shotCell', 'data-cell', _shot.cell, function(v) { return shotCellTip(SC.cleanCell(Number(v)), gridKind); }); seg('shotBg', 'data-bg', _shot.bg);
    var g = shotEl('shotGrid'), l = shotEl('shotLabels'), line = shotEl('shotSize'), go = shotEl('shotGo'), cancel = shotEl('shotCancel');
    if (g) { g.checked = _shot.grid && !!gridKind; g.disabled = !gridKind || _shot.busy; shotTip(shotEl('shotGridTick') || g, gridKind ? 'The map’s own grid, drawn over the pieces.' : 'This map has no grid.'); }
    if (l) { l.checked = _shot.labels; l.disabled = _shot.busy; }
    if (line) line.textContent = _shot.busy ? 'Making the picture…' : (_shot.err || SC.sizeWords(p, _shot.area));
    if (go) go.disabled = !p.ok || _shot.busy;
    if (cancel) cancel.disabled = false;
    return p;
}
function shotShow() {
    var m = shotEl('shotModal'); if (!m) return false;
    if (!shotMay()) { toast('Not while you are at someone else’s table.'); return false; }
    if (!shotMap()) { toast('Save Map as Picture is for a play map. Open a map and its Play Map view first.'); return false; }
    shotLoad(); _shot.busy = false; _shot.err = ''; shotSync();
    m.style.display = 'flex';
    var first = m.querySelector('#shotArea .gen-chip.on') || shotEl('shotCancel'); if (first && typeof first.focus === 'function') first.focus();
    return true;
}
function shotHide() {
    var m = shotEl('shotModal'); if (!m || !shotShown()) return;
    m.style.display = 'none'; _shot.gen++; _shot.busy = false; _shot.err = '';   // a picture still being made is let go: its answer finds another count
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
    var box = shotBox(map), p = SC.plan(box, _shot.cell); if (!p.ok) { shotSync(); return false; }
    var grid = shotGridOf(map), lines = _shot.grid && !!grid, labels = _shot.labels, bg = _shot.bg, items = map.whiteboard.slice(), need = SC.needs(items, { labels: labels, grid: !!grid, box: box }), title = shotTitle(map), my = ++_shot.gen;
    _shot.busy = true; shotKeep(); shotSync();
    var fail = function() { if (my !== _shot.gen) return; _shot.busy = false; _shot.err = SHOT_CANT; shotSync(); };
    Promise.all([Promise.all(need.pics.map(shotPic)), Promise.all(need.fonts.map(shotFont))]).then(function(got) {
        if (my !== _shot.gen) return null;
        var pics = Object.create(null), tiles = Object.create(null), lost = 0, k = Math.max(2, Math.ceil(p.scale) + 1);
        need.pics.forEach(function(a, i) { pics[a] = got[0][i] || null; if (!got[0][i]) lost++; });
        need.tiles.forEach(function(n) { tiles[n] = shotTile(n, k); });
        var cv = document.createElement('canvas'); cv.width = p.w; cv.height = p.h;
        var ctx = cv.getContext('2d'); if (!ctx) throw new Error('no context');
        var drew = SC.draw(ctx, { box: box, scale: p.scale, bg: bg, grid: grid, lines: lines, labels: labels, items: items, res: {
            pic: function(a) { return pics[a] || null; },
            tile: function(n) { return tiles[n] || null; },
            text: shotText
        } });
        return new Promise(function(res, rej) { try { cv.toBlob(function(b) { if (b) res({ blob: b, lost: lost, cut: !!(drew && drew.cut) }); else rej(new Error('no file')); }, 'image/png'); } catch (e) { rej(e); } });
    }).then(function(r) {
        if (!r || my !== _shot.gen) return;
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

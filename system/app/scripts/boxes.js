/* Containers (1.6.2, backlog 42, fold 1: the GM's side; the owner, 2026-11-12, by prompt after a drawn sheet: "A. Any piece, by a tick" and
   "A. Tiles, like a crate"). The container window: what a container on the play map holds, as tiles of the item's icon and count, its name
   under it, what the item says on hover. The GM adds an item from the system's items or the library, changes a count and takes one out. Every
   change goes through boxcore boxOp (systemcore applyRowOp on a stand-in sheet), so a list's own rules and caps hold, and is one save. The
   GM's alone: never on a player's app, at someone else's table or in the stream window, and nothing of it is sent. Steps log as boxes v1. */

import { getActiveCampaign, getActiveMap } from './models.js';
import { state } from './state.js';
import { save, toast } from './io.js';
import * as BC from './boxcore.js';
import { applyRowOp, glyphPath, uid } from './systemcore.js';
import * as F from './formula.js';

var _box = { mapId: null, pieceId: null, sel: null, list: null };
function step(s, f) { try { if (typeof window.wpStepLog === 'function') window.wpStepLog('boxes v1', s, f || {}); } catch (e) {} }
function P() { return document.getElementById('boxPanel'); }
function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined && text !== null) e.textContent = String(text); return e; }
// [boxcheck:gm-start]
// The GM's own screen of their own campaign: never a player's app, someone else's table or the stream window
function gmMay() { var n = window.wpNet; return !window.wpStream && !(n && (n.foreign || (n.active && n.role === 'client'))) && (typeof window.wpCanPersistLocal !== 'function' || window.wpCanPersistLocal() !== false); }
// A piece that may hold items is the core's to say (boxcore boxPieceOk)
function boxPieceOk(w) { return BC.boxPieceOk(w); }
function sysOf(camp) { return camp && camp.system && typeof camp.system === 'object' ? camp.system : null; }
function boxOf(camp, w) { return camp && w && typeof w.box === 'string' && camp.boxes && Object.prototype.hasOwnProperty.call(camp.boxes, w.box) ? camp.boxes[w.box] : null; }
// Holds items, ticked or not, on a piece of the map on screen. Unticked with items in it, it asks first. Answers what to say
function holds(w, on, ask) {
    var camp = getActiveCampaign(), map = getActiveMap(); if (!gmMay() || !camp || !map || !boxPieceOk(w)) return '';
    if (on) {
        if (boxOf(camp, w)) return '';
        camp.boxes = camp.boxes && typeof camp.boxes === 'object' ? camp.boxes : Object.create(null);
        var id = BC.newBoxId(Math.random, camp.boxes); if (!id) return 'This campaign holds as many containers as it can.';
        if (Object.keys(camp.boxes).length >= BC.BOX_MAX) return 'This campaign holds as many containers as it can.';
        camp.boxes[id] = { id: id, values: {} }; w.box = id; save(); step('holds', { on: true }); if (typeof window.appRender === 'function') window.appRender();
        return 'It holds items now. Open contents to put some in.';
    }
    var b = boxOf(camp, w), n = b ? BC.boxCount(sysOf(camp), b) : 0;
    var drop = function() { if (b) delete camp.boxes[w.box]; delete w.box; save(); step('holds', { on: false, n: n }); if (_box.pieceId === w.id) close(); if (typeof window.appRender === 'function') window.appRender(); };
    if (n > 0 && ask) { ask('It holds ' + n + ' item' + (n === 1 ? '' : 's') + '. Take them out with it? They cannot be put back.', function(ok) { if (ok) drop(); else if (typeof window.appRender === 'function') window.appRender(); }); return ''; }
    drop(); return '';
}
// [boxcheck:gm-end]
// The piece the window shows, found again by id on the map it was opened on
function piece() { var camp = getActiveCampaign(), map = getActiveMap(); if (!camp || !map || map.id !== _box.mapId || !Array.isArray(map.whiteboard)) return null; for (var i = 0; i < map.whiteboard.length; i++) { var w = map.whiteboard[i]; if (w && w.id === _box.pieceId) return w; } return null; }
function open(pieceId) {
    var camp = getActiveCampaign(), map = getActiveMap(), p = P(); if (!gmMay() || !camp || !map || !p) return false;
    var w = (map.whiteboard || []).find(function(x) { return x && x.id === pieceId; }); if (!w || !boxOf(camp, w)) return false;
    _box = { mapId: map.id, pieceId: pieceId, sel: null, list: null };
    p.style.display = ''; if (window.wpFloats && typeof window.wpFloats.reveal === 'function') window.wpFloats.reveal(p);
    draw(); step('open', { n: BC.boxCount(sysOf(camp), boxOf(camp, w)) }); return true;
}
function close() { var p = P(); if (!p || p.style.display === 'none') return; if (_box.player && window.wpNet && typeof window.wpNet.boxAsk === 'function') window.wpNet.boxAsk('close', _box.mapId, _box.pieceId, {}); p.style.display = 'none'; _box = { mapId: null, pieceId: null, sel: null, list: null }; step('close'); }
// The item's icon: one of the app's own glyphs, or the item's own characters, or the first letter of its name
function iconInto(box, t) {
    var g = typeof t.icon === 'string' && /^icon:/.test(t.icon) ? glyphPath(t.icon) : '';
    if (g) { var NS = 'http://www.w3.org/2000/svg', s = document.createElementNS(NS, 'svg'), pa = document.createElementNS(NS, 'path'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'box-glyph'); s.setAttribute('aria-hidden', 'true'); pa.setAttribute('d', g); s.appendChild(pa); box.appendChild(s); return; }
    box.appendChild(el('span', 'box-ch', t.icon ? t.icon : (t.name || '?').charAt(0).toUpperCase()));
}
function tipOf(t) { return t.name + (t.qty > 1 ? ' ×' + t.qty : '') + (t.list ? '\n' + t.list : '') + (t.notes ? '\n' + t.notes.slice(0, 300) : ''); }
function change(fid, q, what, back) {
    var camp = getActiveCampaign(), w = piece(), b = boxOf(camp, w); if (!gmMay() || !b) { close(); return; }
    var r = BC.boxOp(sysOf(camp), b, fid, q, F, applyRowOp);
    if (!r.ok) { toast(r.reason === 'full' ? 'That list holds as many rows as it can.' : r.reason === 'gm' ? 'A container holds only what players may see, since they will take it.' : 'That cannot be put in this container.'); step('change-refused', { what: what, reason: r.reason }); return; }
    b.values = r.values; save(); step(what, {}); draw(); if (typeof window.appRender === 'function') window.appRender(); refocus(back);
}
// The window is drawn anew at a change: the focus goes back to the control pressed, or the first of those named that is there (the review rule of 1.6.2)
function refocus(list) { (Array.isArray(list) ? list : []).some(function(s) { var n = document.querySelector('#boxBody ' + s); if (n && !n.disabled && n.focus) { n.focus(); return true; } return false; }); }
function draw() {
    if (_box.player) { drawPlayer(); return; }   // fold 2: a player's view of a container, as the host sends it
    var p = P(), camp = getActiveCampaign(), w = piece(), b = boxOf(camp, w), sys = sysOf(camp); if (!p) return;
    if (!b || !gmMay()) { close(); return; }
    var nm = document.getElementById('boxName'); if (nm) nm.textContent = (typeof w.name === 'string' && w.name) ? w.name : 'Container';
    var body = document.getElementById('boxBody'); if (!body) return; while (body.firstChild) body.removeChild(body.firstChild);
    var tiles = BC.boxTiles(sys, b), lists = BC.boxLists(sys);
    if (!lists.length) { body.appendChild(el('div', 'muted box-say', 'Your system has no list ticked Tradable that players see, so a container has nowhere to keep things. Tick Tradable on a list in the System editor.')); return; }
    var grid = el('div', 'box-grid'); grid.setAttribute('role', 'list');
    tiles.forEach(function(t) {
        var b2 = el('button', 'box-tile' + (_box.sel === t.rowId ? ' on' : '')); b2.type = 'button'; b2.dataset.row = t.rowId; b2.setAttribute('role', 'listitem');
        b2.title = tipOf(t); b2.setAttribute('aria-label', t.name + (t.qty > 1 ? ', ' + t.qty : ''));
        var ic = el('span', 'box-ic'); iconInto(ic, t); b2.appendChild(ic);
        if (t.qty > 1) b2.appendChild(el('span', 'box-n', t.qty));
        b2.appendChild(el('span', 'box-nm', t.name));
        b2.addEventListener('click', function() { _box.sel = _box.sel === t.rowId ? null : t.rowId; draw(); var n = document.querySelector('#boxBody .box-tile[data-row="' + t.rowId + '"]'); if (n) n.focus(); });
        grid.appendChild(b2);
    });
    if (!tiles.length) body.appendChild(el('div', 'muted box-say', 'Nothing in it yet.')); else body.appendChild(grid);
    var sel = tiles.filter(function(t) { return t.rowId === _box.sel; })[0];
    if (sel) {
        var bar = el('div', 'box-sel'); bar.appendChild(el('b', '', sel.name));
        var spec = lists.filter(function(f) { return f.id === sel.fid; })[0], noQty = !!(spec && spec.list && spec.list.noQty);
        if (!noQty) {
            var mi = el('button', 'tool ghost box-less', '−'); mi.type = 'button'; mi.title = 'One fewer'; mi.setAttribute('aria-label', 'One fewer');
            mi.disabled = sel.qty <= 1; mi.addEventListener('click', function() { change(sel.fid, { op: 'setQty', rowId: sel.rowId, qty: sel.qty - 1 }, 'less', ['.box-less', '.box-more']); });
            var pl = el('button', 'tool ghost box-more', '+'); pl.type = 'button'; pl.title = 'One more'; pl.setAttribute('aria-label', 'One more');
            pl.addEventListener('click', function() { change(sel.fid, { op: 'setQty', rowId: sel.rowId, qty: sel.qty + 1 }, 'more', ['.box-more']); });
            bar.appendChild(mi); bar.appendChild(el('span', 'box-q', sel.qty)); bar.appendChild(pl);
        }
        var rm = el('button', 'tool ghost danger box-rm', 'Take out'); rm.type = 'button'; rm.title = 'Take this item out of the container';
        rm.addEventListener('click', function() { _box.sel = null; change(sel.fid, { op: 'remove', rowId: sel.rowId }, 'remove', ['.box-tile', '.box-item', '.box-lib']); });
        bar.appendChild(rm); body.appendChild(bar);
    }
    // Add: the system's items players may see, and the library where it holds any
    var add = el('div', 'box-add'), fsel = null;
    if (!lists.some(function(f) { return f.id === _box.list; })) _box.list = lists[0].id;   // the list picked stays picked across a redraw (the review)
    if (lists.length > 1) { fsel = el('select', 'box-list'); fsel.title = 'The list an item goes into'; lists.forEach(function(f) { var o = el('option', '', f.label || f.key || 'Items'); o.value = f.id; fsel.appendChild(o); }); fsel.value = _box.list; fsel.addEventListener('change', function() { _box.list = fsel.value; draw(); refocus(['.box-list']); }); add.appendChild(fsel); }
    var listId = function() { return _box.list; };
    var lf = lists.filter(function(f) { return f.id === _box.list; })[0], lcats = lf && lf.list && Array.isArray(lf.list.cats) ? lf.list.cats.map(function(c) { return String(c).toLowerCase(); }) : [];
    var items = (Array.isArray(sys.items) ? sys.items : []).filter(function(it) { return it && it.vis !== 'gm' && typeof it.id === 'string' && (!lcats.length || lcats.indexOf(String(it.category || '').toLowerCase()) >= 0); }).sort(function(a, z) { return String(a.name).localeCompare(String(z.name)); });   // the items the list takes, by its own categories (the review)
    if (items.length) {
        var isel = el('select', 'box-item'); isel.title = 'Put an item from your system in';
        var o0 = el('option', '', '+ Add an item'); o0.value = ''; isel.appendChild(o0);
        items.forEach(function(it) { var o = el('option', '', it.name || 'Item'); o.value = it.id; isel.appendChild(o); });
        if (window.wpTexList && typeof window.wpTexList.keys === 'function') window.wpTexList.keys(isel);   // a key step on a closed list opens it, never adds
        isel.addEventListener('change', function() { var v = isel.value; if (!v) return; isel.value = ''; change(listId(), { op: 'add', defId: v, rowId: uid('w_'), qty: 1 }, 'add', ['.box-item']); });
        add.appendChild(isel);
    }
    var LB = window.wpLibrary, LP = window.wpLibPicker;
    if (LB && LP && typeof LB.size === 'function' && LB.size() > 0 && camp.library) {
        var lb = el('button', 'tool ghost box-lib', 'From the library'); lb.type = 'button'; lb.title = 'Put an entry of your library in';
        lb.addEventListener('click', function() {
            var fid = listId(), f = lists.filter(function(x) { return x.id === fid; })[0];
            LP.open({ anchor: lb, title: 'Put in ' + ((w && w.name) || 'the container'), cats: f && f.list && Array.isArray(f.list.cats) && f.list.cats.length ? f.list.cats : null, noQty: !!(f && f.list && f.list.noQty), gm: true,
                source: { packs: function() { return (camp.library && camp.library.packs) || []; }, entries: function(pid) { return LB.entriesOf(pid); } },
                onAdd: function(ids, qty) { if (getActiveCampaign() !== camp) return; ids.forEach(function(id) { change(fid, { op: 'add', defId: id, rowId: uid('w_'), qty: qty || 1 }, 'add-lib', ['.box-lib', '.box-item']); }); } });
        });
        add.appendChild(lb);
    }
    if (add.firstChild) body.appendChild(add);
}
function wire() {
    var c = document.getElementById('boxClose'); if (c) c.addEventListener('click', close);
    var p = P(), head = document.getElementById('boxHead'), drag = null; if (!p || !head) return;
    head.addEventListener('pointerdown', function(e) { if (e.target.closest('button')) return; var r = p.getBoundingClientRect(); drag = { dx: e.clientX - r.left, dy: e.clientY - r.top }; head.setPointerCapture(e.pointerId); });
    head.addEventListener('pointermove', function(e) { if (!drag) return; p.style.left = (e.clientX - drag.dx) + 'px'; p.style.top = (e.clientY - drag.dy) + 'px'; p.style.right = 'auto'; });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function(ev) { head.addEventListener(ev, function() { drag = null; }); });   // a drag ends however the pointer is let go
}
// [boxcheck:player-start]
// Fold 2 (the owner, 2026-11-12: "A. Next to it, a roll if locked", "A. Tiles, like a crate"): a player opens a container by its mark. The press
// names the token of theirs it is opened with (the selected one, else the one of theirs nearest the container) and asks the host, which
// judges every step and sends what the container holds as tiles; nothing of it is kept on the player's app beyond the window
var _ask = null;
function tokFor(map, w) {
    var n = window.wpNet, me = n && n.myId ? n.myId : null, sel = state && Array.isArray(state.selWbIds) ? state.selWbIds : [];
    var mine = (map && Array.isArray(map.whiteboard) ? map.whiteboard : []).filter(function(x) { return x && x.isChar && !x.waiting && !x.hidden && typeof x.charId === 'string' && (!me || x.ownerId === me); });
    var picked = mine.filter(function(x) { return sel.indexOf(x.id) >= 0; })[0]; if (picked) return picked;
    var cx = (w.x || 0) + (w.w || 0) / 2, cy = (w.y || 0) + (w.h || 0) / 2, best = null, bd = Infinity;
    mine.forEach(function(x) { var d = Math.hypot((x.x || 0) + (x.w || 0) / 2 - cx, (x.y || 0) + (x.h || 0) / 2 - cy); if (d < bd) { bd = d; best = x; } });
    return best;
}
function ask(itemId) {
    var map = getActiveMap(), n = window.wpNet; if (!map || !n || typeof n.boxAsk !== 'function') return;
    var w = (map.whiteboard || []).find(function(x) { return x && x.id === itemId; }); if (!w) return;
    var tok = tokFor(map, w); if (!tok) { toast('You need a token of your own on this map to open it.'); return; }
    _ask = { mapId: map.id, itemId: itemId, tok: tok.id };
    var r = n.boxAsk('open', map.id, itemId, { tok: tok.id }); if (r && r.error) toast(r.error); step('ask', {});
}
// The host's view, cleaned again: tiles of plain words and numbers, 400 at most
function cleanTiles(raw) {
    var cut = function(v, n) { return typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, n) : ''; };
    return (Array.isArray(raw) ? raw.slice(0, 400) : []).map(function(x) { if (!x || typeof x !== 'object' || typeof x.rowId !== 'string' || typeof x.fid !== 'string') return null; var q = Math.floor(Number(x.qty)); return { fid: cut(x.fid, 40), rowId: cut(x.rowId, 40), name: cut(x.name, 240) || 'Item', qty: q >= 1 && q <= 1e6 ? q : 1, icon: cut(x.icon, 40), notes: cut(x.notes, 600), list: cut(x.list, 60) }; }).filter(Boolean);
}
function view(msg) {
    var p = P(), map = getActiveMap(); if (!p || !msg || typeof msg.itemId !== 'string' || typeof msg.mapId !== 'string' || !map || map.id !== msg.mapId) return;
    var same = _box.player && _box.pieceId === msg.itemId, tok = _ask && _ask.itemId === msg.itemId ? _ask.tok : (same ? _box.tok : null); if (!tok) return;
    _box = { player: true, mapId: msg.mapId, pieceId: msg.itemId, tok: tok, sel: same ? _box.sel : null, qty: same ? _box.qty : 1, list: null, tiles: cleanTiles(msg.tiles), name: typeof msg.name === 'string' ? msg.name.slice(0, 120) : '' };
    if (!_box.tiles.some(function(t) { return t.rowId === _box.sel; })) { _box.sel = null; _box.qty = 1; }
    var was = p.style.display !== 'none'; p.style.display = ''; if (!was && window.wpFloats && typeof window.wpFloats.reveal === 'function') window.wpFloats.reveal(p);
    var f = document.activeElement, cls = f && p.contains(f) && f.className ? '.' + String(f.className).split(' ')[0] : null;
    drawPlayer(); if (cls) refocus([cls, '.box-tile', '.box-all']);
}
function take(more) { var n = window.wpNet; if (!_box.player || !n || typeof n.boxAsk !== 'function') return; var r = n.boxAsk('take', _box.mapId, _box.pieceId, Object.assign({ tok: _box.tok }, more)); if (r && r.error) toast(r.error); step('take', { all: !!more.all }); }
function drawPlayer() {
    var p = P(); if (!p) return; var nm = document.getElementById('boxName'); if (nm) nm.textContent = _box.name || 'Container';
    var body = document.getElementById('boxBody'); if (!body) return; while (body.firstChild) body.removeChild(body.firstChild);
    var tiles = _box.tiles || [];
    if (!tiles.length) { body.appendChild(el('div', 'muted box-say', 'It is empty.')); return; }
    var grid = el('div', 'box-grid'); grid.setAttribute('role', 'list');
    tiles.forEach(function(t) {
        var b2 = el('button', 'box-tile' + (_box.sel === t.rowId ? ' on' : '')); b2.type = 'button'; b2.dataset.row = t.rowId; b2.setAttribute('role', 'listitem');
        b2.title = tipOf(t); b2.setAttribute('aria-label', t.name + (t.qty > 1 ? ', ' + t.qty : ''));
        var ic = el('span', 'box-ic'); iconInto(ic, t); b2.appendChild(ic); if (t.qty > 1) b2.appendChild(el('span', 'box-n', t.qty)); b2.appendChild(el('span', 'box-nm', t.name));
        b2.addEventListener('click', function() { _box.sel = _box.sel === t.rowId ? null : t.rowId; _box.qty = t.qty; drawPlayer(); var n = document.querySelector('#boxBody .box-tile[data-row="' + t.rowId + '"]'); if (n) n.focus(); });
        grid.appendChild(b2);
    });
    body.appendChild(grid);
    var sel = tiles.filter(function(t) { return t.rowId === _box.sel; })[0];
    if (sel) {
        var bar = el('div', 'box-sel'); bar.appendChild(el('b', '', sel.name)); var q = Math.max(1, Math.min(sel.qty, _box.qty | 0 || 1)); _box.qty = q;
        if (sel.qty > 1) {
            var mi = el('button', 'tool ghost box-less', '\u2212'); mi.type = 'button'; mi.title = 'Take fewer'; mi.setAttribute('aria-label', 'Take fewer'); mi.disabled = q <= 1; mi.addEventListener('click', function() { _box.qty = q - 1; drawPlayer(); refocus(['.box-less', '.box-more']); });
            var pl = el('button', 'tool ghost box-more', '+'); pl.type = 'button'; pl.title = 'Take more'; pl.setAttribute('aria-label', 'Take more'); pl.disabled = q >= sel.qty; pl.addEventListener('click', function() { _box.qty = q + 1; drawPlayer(); refocus(['.box-more', '.box-less']); });
            bar.appendChild(mi); bar.appendChild(el('span', 'box-q', q)); bar.appendChild(pl);
        }
        var tk = el('button', 'tool box-take', 'Take'); tk.type = 'button'; tk.title = 'Put it in your own sheet'; tk.addEventListener('click', function() { take({ fid: sel.fid, rowId: sel.rowId, qty: q }); });
        bar.appendChild(tk); body.appendChild(bar);
    }
    var all = el('button', 'tool box-all', 'Take all'); all.type = 'button'; all.title = 'Put everything in it in your own sheet'; all.addEventListener('click', function() { take({ all: true }); });
    var foot = el('div', 'box-add'); foot.appendChild(all); body.appendChild(foot);
}
// [boxcheck:player-end]
// A copy of a container (Duplicate, a paste) gets a container of its own with a copy of what it holds, or none where the store is full: two
// pieces never share one (the review)
function copyFor(it) {
    var camp = getActiveCampaign(); if (!it || typeof it !== 'object' || it.box === undefined) return;
    var src = boxOf(camp, it); delete it.box; if (!src || !gmMay() || !camp.boxes || Object.keys(camp.boxes).length >= BC.BOX_MAX) return;
    var id = BC.newBoxId(Math.random, camp.boxes); if (!id) return;
    camp.boxes[id] = { id: id, values: JSON.parse(JSON.stringify(src.values || {})) }; it.box = id; step('copy', {});
}
function has(w) { return !!boxOf(getActiveCampaign(), w); }
// The window follows the app: a piece gone, another map or another campaign closes it; otherwise its name follows the piece's
function sync() { var p = P(); if (!p || p.style.display === 'none') return; if (_box.player) { var mp = getActiveMap(), n = window.wpNet; if (!mp || mp.id !== _box.mapId || !n || !n.active || n.role !== 'client') close(); return; } if (!piece() || !boxOf(getActiveCampaign(), piece()) || !gmMay()) { close(); return; } var nm = document.getElementById('boxName'), w = piece(); if (nm) nm.textContent = (typeof w.name === 'string' && w.name) ? w.name : 'Container'; }   // never drawn again under a press: only its own changes draw it
if (typeof window !== 'undefined') {
    window.wpBoxes = { open: open, close: close, sync: sync, holds: holds, pieceOk: boxPieceOk, gmMay: gmMay, has: has, copyFor: copyFor, ask: ask, view: view, redraw: function() { var p = P(); if (p && p.style.display !== 'none' && !_box.player) draw(); } };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
}
export { open, close, sync, holds, boxPieceOk };

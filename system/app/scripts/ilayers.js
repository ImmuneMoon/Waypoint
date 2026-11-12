/* Interaction layers (1.6.2, backlog 43; the owner, 2026-10-02: "not just element layers but interaction layers", so the GM can "check for where
   things are and then switch back to just seeing what the players see easily", with no menus in the way while moving tokens; and 2026-11-12, by
   prompt after a drawn mock-up: "A. Top of the Layers window", "C. A, with walls too", "A. Click straight through"). The things only the GM sees
   as the GM does, and walls, each a row with two switches on this computer: shown on my map, and takes clicks. Off, a kind is out of sight on
   the GM's own screen; not taking clicks, a press, a hover and a right-click go straight through it to what is under it. Nothing changes for
   players and nothing is stored in the campaign or sent: a hidden kind still works (a trigger still fires, a wall still blocks). As players see
   it puts every row out of sight at once, and a second press puts back what was there. Containers (backlog 42) join the list when they are built.
   Steps log as ilayers v1. */

import { getActiveMap } from './models.js';
import { state } from './state.js';

// [ilayerscheck:core-start]
var KINDS = [
    { k: 'trigger', name: 'Trigger zones' },
    { k: 'portal', name: 'Portals and doors' },
    { k: 'wall', name: 'Walls and barriers' },
    { k: 'note', name: 'GM notes' },
    { k: 'light', name: 'Lights' },
    { k: 'area', name: 'Room areas' },
    { k: 'hidden', name: 'Hidden pieces' }
];
var KIND_IDS = KINDS.map(function(x) { return x.k; });
function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
// The kinds a piece belongs to: one piece may be several (a hidden trigger zone is a trigger zone and a hidden piece). A door is a portal's row,
// never a wall's; a token is only ever a hidden piece. FC is fogcore (isPortal, isDoor); with none, portals and doors are passed over
function kindsOf(w, map, FC) {
    if (!isObj(w)) return [];
    var out = [], tok = !!(w.isChar || w.waiting);
    if (!tok) {
        var door = !!(FC && typeof FC.isDoor === 'function' && FC.isDoor(w));
        if (w.type === 'trigger') out.push('trigger');
        if (door || (FC && typeof FC.isPortal === 'function' && FC.isPortal(w, map))) out.push('portal');
        if (!door && (w.blocksSight === true || w.barrier === true)) out.push('wall');
        if (w.gmNoteFor) out.push('note');
        if (w.type === 'light') out.push('light');
        if (w.roomArea === true) out.push('area');
    }
    if (w.hidden) out.push('hidden');
    return out;
}
// What this computer keeps: { kind: { s, p } } for a row that differs from on and taking clicks, read back as data. A kind out of sight takes no clicks
function cleanState(raw) {
    var out = Object.create(null); if (!isObj(raw)) return out;
    KIND_IDS.forEach(function(k) {
        var v = raw[k]; if (!isObj(v)) return;
        var s = v.s !== false, p = s && v.p !== false;
        if (!s || !p) out[k] = { s: s, p: p };
    });
    return out;
}
function rowOf(st, k) { var v = st && st[k]; return { s: !v || v.s !== false, p: !v || (v.s !== false && v.p !== false) }; }
// A piece as the GM's screen draws it: off (out of sight) where any of its kinds is out of sight, through (takes no clicks) where any is off or takes none
function judge(w, map, FC, st) {
    var ks = kindsOf(w, map, FC), off = false, through = false;
    ks.forEach(function(k) { var r = rowOf(st, k); if (!r.s) off = true; if (!r.p) through = true; });
    return { off: off, through: off || through };
}
// As players see it: every row out of sight, keeping what was there to put back; a second press puts it back. Answers { st, prev }
function playersView(st, prev) {
    var all = Object.create(null); KIND_IDS.forEach(function(k) { all[k] = { s: false, p: false }; });
    if (isPlayersView(st)) return { st: cleanState(prev || {}), prev: null };
    return { st: all, prev: cleanState(st) };
}
function isPlayersView(st) { return KIND_IDS.every(function(k) { return !rowOf(st, k).s; }); }
// [ilayerscheck:core-end]

var ST_KEY = 'wp_iLayers', PREV_KEY = 'wp_iLayersPrev';
function readJ(k) { try { var v = JSON.parse(localStorage.getItem(k) || 'null'); return isObj(v) ? v : null; } catch (e) { return null; } }
function writeJ(k, v) { try { if (v && Object.keys(v).length) localStorage.setItem(k, JSON.stringify(v)); else localStorage.removeItem(k); } catch (e) {} }
var _st = null;
function kept() { if (_st === null) _st = cleanState(readJ(ST_KEY)); return _st; }
function step(s, f) { try { if (typeof window.wpStepLog === 'function') window.wpStepLog('ilayers v1', s, f || {}); } catch (e) {} }
// The GM's own screen only: never a player's app, someone else's table or the stream window
function gmScreen() { var n = window.wpNet; return !window.wpStream && !(n && (n.foreign || (n.active && n.role === 'client'))); }
function fc() { return window.wpFogCore || null; }
function activeMap() { return getActiveMap(); }

// [ilayerscheck:ui-start]
// The board's marks: il-off out of sight, il-through taking no clicks (style.css). Asked for every piece at every draw; a piece in no kind that
// was never marked passes by at once
function mark(el, w, map) {
    if (!el || !el.classList) return;
    var j = gmScreen() && Object.keys(kept()).length ? judge(w, map, fc(), kept()) : null;
    if (!j && !el._il) return;
    el.classList.toggle('il-off', !!(j && j.off)); el.classList.toggle('il-through', !!(j && j.through)); el._il = !!(j && (j.off || j.through));
}
// A piece the pointer passes through, for the board's own picks made by geometry (a wall's line by its stroke, a locked piece handing its press on, a marquee)
function through(w) { return gmScreen() && Object.keys(kept()).length > 0 && judge(w, activeMap(), fc(), kept()).through; }
function set(k, which, on) {
    if (KIND_IDS.indexOf(k) < 0) return;
    var st = Object.assign(Object.create(null), kept()), r = rowOf(st, k);
    if (which === 's') { r.s = !!on; r.p = !!on; }   // shown again takes clicks again
    else if (which === 'p') { r.p = !!on && r.s; }
    st[k] = r; _st = cleanState(st); writeJ(ST_KEY, _st); writeJ(PREV_KEY, null);
    step('set', { kind: k, s: r.s, p: r.p }); redraw();
}
function players() {
    var o = playersView(kept(), readJ(PREV_KEY)); _st = cleanState(o.st); writeJ(ST_KEY, _st); writeJ(PREV_KEY, o.prev);
    step('players', { on: isPlayersView(_st) }); redraw();
}
function redraw() { dropSel(); draw(); if (typeof window.appRender === 'function') window.appRender(); }
// The selection keeps no piece that is out of sight: Delete and the arrow keys act on the selection, and nothing unseen is deleted or moved (the review)
function dropSel() {
    var map = activeMap(); if (!map || !Array.isArray(map.whiteboard) || !state) return;
    var off = Object.create(null); map.whiteboard.forEach(function(w) { if (w && w.id && offNow(w)) off[w.id] = 1; });
    var ids = (Array.isArray(state.selWbIds) ? state.selWbIds : []).filter(function(id) { return !off[id]; });
    if (ids.length !== (state.selWbIds || []).length) state.selWbIds = ids;
    if (state.selWbId && off[state.selWbId]) state.selWbId = ids.length ? ids[ids.length - 1] : null;
}
// A piece out of sight on this screen now
function offNow(w) { return gmScreen() && Object.keys(kept()).length > 0 && judge(w, activeMap(), fc(), kept()).off; }
// The part at the top of the Layers window: a row a kind, its name as text, two ticks; then As players see it. Elements and text nodes alone
function draw() {
    var box = document.getElementById('iLayers'); if (!box) return;
    while (box.firstChild) box.removeChild(box.firstChild);
    var st = kept(), head = document.createElement('div'); head.className = 'il-head';
    ['Show on my map', 'Shown', 'Clicks'].forEach(function(t, i) { var s = document.createElement('span'); s.textContent = t; if (i) s.className = 'il-col'; head.appendChild(s); });
    box.appendChild(head);
    KINDS.forEach(function(x) {
        var r = rowOf(st, x.k), row = document.createElement('div'); row.className = 'il-row'; row.dataset.kind = x.k;
        var nm = document.createElement('span'); nm.className = 'il-name'; nm.textContent = x.name; row.appendChild(nm);
        [['s', r.s, 'Shown on my map: ' + x.name], ['p', r.p, 'Takes clicks: ' + x.name + '. Unticked, a click goes straight through to what is under it.']].forEach(function(c) {
            var t = document.createElement('input'); t.type = 'checkbox'; t.className = 'il-tick il-' + c[0]; t.checked = c[1]; t.title = c[2]; t.setAttribute('aria-label', c[2]);
            if (c[0] === 'p' && !r.s) t.disabled = true;
            t.addEventListener('change', function() { set(x.k, c[0], t.checked); refocus('.il-row[data-kind="' + x.k + '"] .il-' + c[0]); });
            row.appendChild(t);
        });
        box.appendChild(row);
    });
    var pv = isPlayersView(st), b = document.createElement('button'); b.type = 'button'; b.className = 'tool ghost il-players' + (pv ? ' on' : '');
    b.textContent = pv ? 'Back to what I had' : 'As players see it';
    b.title = pv ? 'Put back the rows as they were before As players see it.' : 'Put every row out of sight on your screen, to see the map as players do. Press again to put them back.';
    b.addEventListener('click', function() { players(); refocus('.il-players'); });
    box.appendChild(b);
    var say = document.createElement('div'); say.className = 'il-say muted'; say.textContent = 'Your screen alone. Players see and use everything as before.'; box.appendChild(say);
}
function refocus(sel) { var box = document.getElementById('iLayers'), n = box && box.querySelector ? box.querySelector(sel) : null; if (n && n.focus) n.focus(); }
// [ilayerscheck:ui-end]

if (typeof window !== 'undefined') {
    window.wpILayers = { mark: mark, through: through, offNow: offNow, draw: draw, set: set, players: players, kinds: KINDS };
    window.addEventListener('storage', function(e) { if (e && e.key === ST_KEY) { _st = null; dropSel(); draw(); if (typeof window.appRender === 'function') window.appRender(); } });   // another window of this computer (the review)
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', draw); else draw();
}
export { KINDS, kindsOf, cleanState, judge, playersView, isPlayersView };

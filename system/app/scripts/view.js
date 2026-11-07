/* Waypoint — the view that turns with your token (1.6.2, backlog 82b, fold 2; the owner, 2026-11-07: "the main starting intention was essentially
   having the map move as you do, individually as a token, whoever you control, so the character token always stays upright", and by prompt
   "Smoothly, exactly").

   This computer's own switch (wp_viewTurn, off by default). On, the play map turns about the token you control so that its heading points up: its
   facing where Token facing is on, else the way it last moved. On a player's app that is a character token of theirs on the map, the one selected
   first; on the GM's screen the one character token selected. With none, the map eases back to north up. The board turns by one transform (asked by
   main.js where it sets the zoom), and every pointer reading undoes it through the helpers of fold 1 (wbX, wbY, wbDX, wbDY), which ask turned, bx, by,
   dx and dy here. The fog turns its drawing about the same point (fog.js asks turnCtx). Nothing is stored on a map or sent. */
import { state } from './state.js';
import { getActiveMap } from './models.js';
import { save } from './io.js';
import { cleanViewTurn } from './compasscore.js';

// [viewcheck:core-start]
// The view's own numbers: the angle the board is turned by (degrees, clockwise on screen), and the board point it turns about
// tx, ty: an offset in the wrap's content pixels that keeps the screen still when the point it turns about moves (a token walks, another is picked)
var V = { on: false, src: '', deg: 0, goal: 0, ox: 0, oy: 0, tx: 0, ty: 0, tok: null, last: {} };
function rad() { return V.deg * Math.PI / 180; }
function isTurned() { return Math.abs(V.deg) > 0.01 || Math.abs(V.tx) > 0.5 || Math.abs(V.ty) > 0.5; }
// Shortest way round from one angle to another, in degrees from -180 to 180
function turnTo(from, to) { var d = ((to - from) % 360 + 540) % 360 - 180; return d === -180 ? 180 : d; }
// A board point from a pointer on screen: the content point (cx - r.left + scroll) undone of the zoom, then of the turn about the pivot
function bxy(cx, cy, r, w) {
    var z = state.zoomLevel || 1, u = (cx - r.left + w.scrollLeft - V.tx) / z - V.ox, v = (cy - r.top + w.scrollTop - V.ty) / z - V.oy, c = Math.cos(rad()), s = Math.sin(rad());
    return { x: V.ox + c * u + s * v, y: V.oy - s * u + c * v };
}
// A step on screen as a step on the board
function dxy(dx, dy) { var z = state.zoomLevel || 1, c = Math.cos(rad()), s = Math.sin(rad()); return { x: (c * dx + s * dy) / z, y: (-s * dx + c * dy) / z }; }
// A board point on screen, in the wrap's own content pixels (before its scroll): where the board draws it
function sxy(bx, by) { var z = state.zoomLevel || 1, c = Math.cos(rad()), s = Math.sin(rad()), u = bx - V.ox, v = by - V.oy; return { x: V.tx + z * (V.ox + c * u - s * v), y: V.ty + z * (V.oy + s * u + c * v) }; }
// The point it turns about moved to (nx, ny): the offset takes the difference, so nothing on screen moves (T' = T + z (I - R)(o - n))
function pivotTo(nx, ny) {
    if (nx === V.ox && ny === V.oy) return;
    var z = state.zoomLevel || 1, c = Math.cos(rad()), s = Math.sin(rad()), dx = V.ox - nx, dy = V.oy - ny;
    V.tx += z * (dx - (c * dx - s * dy)); V.ty += z * (dy - (s * dx + c * dy)); V.ox = nx; V.oy = ny;
}
// The board's transform at zoom z: scale alone when unturned, else turned about the pivot. Its origin is the board's top left (style.css)
function transform(z) {
    z = z || 1; if (!isTurned()) return 'scale(' + z + ')';
    var px = V.ox * z, py = V.oy * z;
    return 'translate(' + (V.tx + px) + 'px, ' + (V.ty + py) + 'px) rotate(' + V.deg + 'deg) translate(' + (-px) + 'px, ' + (-py) + 'px) scale(' + z + ')';
}
// The heading of a token, in degrees clockwise from up: its facing where facing is on, else the way it last moved, else none
function headingOf(item, facing, last) {
    if (!item) return null;
    if (facing) return ((Number(item.rot) || 0) + (Number(item.front) || 0)) % 360;
    return last && typeof last.h === 'number' ? last.h : null;
}
// The way a token went, from where it was to where it is: degrees clockwise from up, once it has gone more than a few pixels
function moveHeading(from, to) { if (!from || !to) return null; var dx = to.x - from.x, dy = to.y - from.y; if (dx * dx + dy * dy < 16) return null; return (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360; }
// What stays upright on screen as the map turns: every text box, so that its words read across, and a character token where Token facing is off,
// since it faces no way of its own. Answered as the element's own rotate, which turns it on top of the rot its transform already carries
function uprightOf(item, facing) { return !!item && !item.waiting && (item.type === 'text' || (!facing && !!item.isChar)); }
function uprightTurn(deg) { return Math.abs(deg) > 0.01 ? (Math.round(-deg * 100) / 100) + 'deg' : ''; }
// A token's own turn on the board (what it wears of ours and its own rot), taken back from its words: always a value, so a map turned back to
// north keeps the words level while the token keeps a turn
// The fog's screen as its unturned drawing reaches it (backlog 82b): the box, in the fog canvas's own unturned space, that holds the four
// corners of a W by H screen once that space is turned by a about the pivot's place p and moved by t. A layer drawn there covers every
// corner of a turned screen. Whole pixels, two to spare each way
function fogBox(W, H, a, tx, ty, px, py) {
    var c = Math.cos(a), s = Math.sin(a), xs = [], ys = [];
    [[0, 0], [W, 0], [W, H], [0, H]].forEach(function(p) { var dx = p[0] - tx - px, dy = p[1] - ty - py; xs.push(Math.round((px + c * dx + s * dy) * 1000) / 1000); ys.push(Math.round((py - s * dx + c * dy) * 1000) / 1000); });
    var x = Math.floor(Math.min.apply(null, xs)) - 2, y = Math.floor(Math.min.apply(null, ys)) - 2;
    return { x: x, y: y, w: Math.ceil(Math.max.apply(null, xs)) + 2 - x, h: Math.ceil(Math.max.apply(null, ys)) + 2 - y };
}
function levelTurn(own) { return (Math.round(-(Number(own) || 0) * 100) / 100 || 0) + 'deg'; }
// The turn a piece wears of its own: a text box reads across the screen; a character token that faces no way stands upright while the view follows a
// token (follow), else faces the way it last moved where Turn to movement is on (heading, null for none yet), else stands upright on a turned map
function pieceTurn(item, deg, follow, moveTurn, heading) {
    if (item.type === 'text' || follow || !moveTurn) return uprightTurn(deg);
    return typeof heading === 'number' && Math.abs(heading) > 0.01 ? (Math.round(heading * 100) / 100) + 'deg' : '';
}
// Which turn a screen wears: the GM's for everyone where it holds or the screen follows no token of its own; else the screen's own, or none
function viewSource(gmTurn, mine) { return gmTurn && (gmTurn.hold || !mine) ? 'gm' : mine ? 'own' : ''; }
// [viewcheck:core-end]

function wrapEl() { return document.getElementById('whiteboardWrap'); }
function boardEl() { return document.getElementById('whiteboard'); }
function onPlay() { return state.viewMode !== 'data' && !!getActiveMap(); }
function prefOn() { try { return localStorage.getItem('wp_viewTurn') === 'on'; } catch (e) { return false; } }
function net() { return window.wpNet || null; }
function moveTurnOn() { return !!(window.wpVtt && window.wpVtt.on && window.wpVtt.on('moveturn')) && !facingOn() && onPlay(); }
function gmTurnOf(m) { return m && m.meta ? cleanViewTurn(m.meta.viewTurn) : null; }
function gmHere() { var n = window.wpNet; return !state.streamMode && !(n && (n.foreign || n.stream || (n.active && n.role === 'client'))) && (typeof window.wpCanPersistLocal !== 'function' || window.wpCanPersistLocal() !== false); }
function facingOn() { return !!(window.wpVtt && window.wpVtt.on && window.wpVtt.on('turning')); }
// The token the view follows: a player's own character token on this map, the one selected first; the GM's one selected character token
function followed() {
    var m = getActiveMap(); if (!m || !Array.isArray(m.whiteboard)) return null;
    var sel = Array.isArray(state.selWbIds) && state.selWbIds.length ? state.selWbIds : state.selWbId ? [state.selWbId] : [], n = net(), me = n && n.active && n.role === 'client' ? n.myId : null;
    var toks = m.whiteboard.filter(function(w) { return w && w.isChar && !w.waiting; });
    if (me) { var mine = toks.filter(function(w) { return w.ownerId === me; }); return mine.filter(function(w) { return sel.indexOf(w.id) >= 0; })[0] || mine[0] || null; }
    var picked = toks.filter(function(w) { return sel.indexOf(w.id) >= 0; });
    return picked.length === 1 ? picked[0] : null;
}
function centreOf(w) { var x = Number(w.x) || 0, y = Number(w.y) || 0, wd = Number(w.w) || 50, ht = Number(w.h) || 50; return { x: x + wd / 2, y: y + ht / 2 }; }
var _up = {}, _lv = {}, _upAt = 0, _upOn = false, _upMt = false, _mv = {};   // the ids that stay upright, worked out again twice a second or when the map turns or comes back
function upright(force) {
    var now = Date.now(), els = state.wbEls || {}, r = uprightTurn(V.deg);
    var mt = moveTurnOn(), fol = V.src === 'own';
    if (force || now - _upAt > 500 || !!r !== _upOn || mt !== _upMt) {
        var m = getActiveMap(), want = {}, facing = facingOn(); _upAt = now; _upOn = !!r; _upMt = mt;
        if ((r || mt) && m && Array.isArray(m.whiteboard)) m.whiteboard.forEach(function(w) {
            if (!uprightOf(w, facing)) return;
            if (w.isChar && mt) { var c = centreOf(w), p = _mv[w.id], h = moveHeading(p, c); if (!p || h !== null) _mv[w.id] = { x: c.x, y: c.y, h: h !== null ? h : p ? p.h : null }; }
            var t = pieceTurn(w, V.deg, fol, mt, _mv[w.id] ? _mv[w.id].h : null); if (t) want[w.id] = t;
        });
        Object.keys(_up).forEach(function(id) { if (!want[id]) { var el = els[id]; if (el && el.style) el.style.rotate = ''; } });
        _up = want;
        var lv = {};   // a token's words (its initials, its effect marks) read level: the style sheet turns them by this less the board's own turn
        if (m && Array.isArray(m.whiteboard)) m.whiteboard.forEach(function(w) {
            if (!w || !w.isChar || w.waiting || !(r || want[w.id])) return;
            var own = (parseFloat(want[w.id]) || 0) + (Number(w.rot) || 0); lv[w.id] = levelTurn(own);
        });
        Object.keys(_lv).forEach(function(id) { if (!lv[id]) { var el = els[id]; if (el && el.style && el.style.removeProperty) el.style.removeProperty('--lvl-own'); } });
        _lv = lv;
    }
    Object.keys(_up).forEach(function(id) { var el = els[id], t = _up[id]; if (el && el.style && el.style.rotate !== t) el.style.rotate = t; });   // each frame, so a piece the board draws again stays upright
    Object.keys(_lv).forEach(function(id) { var el = els[id], t = _lv[id]; if (el && el.style && el.style.setProperty && el.style.getPropertyValue('--lvl-own') !== t) el.style.setProperty('--lvl-own', t); });
    var rose = document.getElementById('compassRose');   // a compass at a corner turns with the map, so its north still points north
    if (rose && rose.style) { var cr = rose.classList.contains('compass-map') || !r ? '' : (Math.round(V.deg * 100) / 100) + 'deg'; if (rose.style.rotate !== cr) rose.style.rotate = cr; }
}
var _mmOn = false, _mmDeg = 0, _mmAt = 0;
var _raf = 0, _down = false;   // a press held on the board: the view stands still until it is let go, so a drag lands where it is let go
function apply() {
    var b = boardEl(); if (!b) return;
    var t = transform(state.zoomLevel || 1); if (b.style.transform !== t) b.style.transform = t;
    if (b.style && b.style.setProperty) b.style.setProperty('--view-turn', V.deg + 'deg');
    if (document.body) document.body.classList.toggle('view-turned', isTurned());   // the coordinate rulers stand aside: a turned map has no straight edge to number
    upright();
    var now = Date.now(), tv = isTurned();   // the minimap draws the turned screen as a turned box: drawn again as the turn changes, at most ten times a second
    if ((tv !== _mmOn || Math.abs(V.deg - _mmDeg) > 0.5) && now - _mmAt > 100 && typeof window.renderMinimap === 'function') { _mmOn = tv; _mmDeg = V.deg; _mmAt = now; try { window.renderMinimap(); } catch (e) {} }
}
function tick() {
    _raf = 0;
    if (_down) { _raf = window.requestAnimationFrame ? requestAnimationFrame(tick) : setTimeout(tick, 33); return; }
    var map = onPlay() ? getActiveMap() : null, gt = gmTurnOf(map); V.src = map ? viewSource(gt, prefOn()) : ''; V.on = !!V.src;
    var w = V.src === 'own' ? followed() : null, goal = 0;
    if (V.src === 'gm') { var wr0 = wrapEl(); goal = gt.deg || 0; V.tok = null; if (wr0) { var r0 = wr0.getBoundingClientRect(), mid = bxy(r0.left + r0.width / 2, r0.top + r0.height / 2, r0, wr0); pivotTo(mid.x, mid.y); } }   // the GM's turn, about the middle of this screen
    else if (w) {
        var c = centreOf(w), prev = V.last[w.id], h = moveHeading(prev, c);
        if (h !== null) V.last[w.id] = { x: c.x, y: c.y, h: h }; else if (!prev) V.last[w.id] = { x: c.x, y: c.y, h: prev && prev.h };
        var hd = headingOf(w, facingOn(), V.last[w.id]);
        if (hd !== null) goal = -hd;
        pivotTo(c.x, c.y); V.tok = w.id;
    } else if (V.src !== 'gm') V.tok = null;
    V.goal = goal;
    var d = turnTo(V.deg, V.goal), moved = Math.abs(d) > 0.05;
    if (moved) V.deg = (V.deg + d * 0.18 + 360) % 360; else V.deg = ((V.goal % 360) + 360) % 360;
    if (V.deg > 180) V.deg -= 360;
    if (!moved && Math.abs(V.deg) <= 0.01 && (V.tx || V.ty)) {   // north up again: the offset goes back into the scroll, as far as the wrap can scroll
        var wr = wrapEl(); if (wr) { wr.scrollLeft = wr.scrollLeft - V.tx; wr.scrollTop = wr.scrollTop - V.ty; } V.tx = 0; V.ty = 0; V.deg = 0;
    }
    apply();
    if (moved || V.on) _raf = window.requestAnimationFrame ? requestAnimationFrame(tick) : setTimeout(tick, 33);
}
function wake() { if (!_raf) _raf = window.requestAnimationFrame ? requestAnimationFrame(tick) : setTimeout(tick, 33); }
function setOn(on) { try { localStorage.setItem('wp_viewTurn', on ? 'on' : 'off'); } catch (e) {} syncTick(); wake(); }
// The GM's turn of the map on screen, written: cleaned, saved and drawn, so every screen at the table turns with it
function setGmTurn(deg, hold) {
    var m = getActiveMap(); if (!m || !gmHere()) return false; if (!m.meta) m.meta = {};
    var v = cleanViewTurn({ deg: deg, hold: hold }); if (v) m.meta.viewTurn = v; else delete m.meta.viewTurn;
    save(); if (typeof window.render === 'function') window.render(); gmSync(); wake(); return true;
}
function gmSync() {
    var part = document.getElementById('wbViewAllPart'); if (!part) return;
    var m = onPlay() ? getActiveMap() : null, gm = gmHere() && !!m; part.hidden = !gm; if (!gm) return;
    var g = gmTurnOf(m), nb = document.getElementById('wbViewAll'), hb = document.getElementById('wbViewHold');
    if (nb && document.activeElement !== nb) nb.value = String(g && g.deg ? g.deg : 0); if (hb) hb.checked = !!(g && g.hold);
}
function syncTick() { gmSync(); var b = document.getElementById('wbViewTurnBtn'); if (!b) return; var on = prefOn(); b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); }

window.wpView = {
    turned: function(w) { return isTurned() && (!w || w === wrapEl()); },
    bx: function(cx, cy, r, w) { return bxy(cx, cy, r, w).x; },
    by: function(cx, cy, r, w) { return bxy(cx, cy, r, w).y; },
    dx: function(dx, dy) { return dxy(dx, dy).x; },
    dy: function(dx, dy) { return dxy(dx, dy).y; },
    transform: transform,
    screen: sxy,
    rad: rad, deg: function() { return V.deg; },
    // the fog's canvas turned about the pivot's place on screen, where it draws a board point at board * zoom - scroll
    screenRect: function() { var w = wrapEl(); if (!w || !isTurned()) return null; var r = w.getBoundingClientRect(), cs = [[r.left, r.top], [r.right, r.top], [r.right, r.bottom], [r.left, r.bottom]]; return cs.map(function(p) { return bxy(p[0], p[1], r, w); }); },   // the screen's four corners on the board, for the minimap
    turnCtx: function(ctx) { if (!isTurned() || !ctx) return false; var w = wrapEl(), z = state.zoomLevel || 1, px = V.ox * z - (w ? w.scrollLeft : 0), py = V.oy * z - (w ? w.scrollTop : 0); ctx.translate(V.tx + px, V.ty + py); ctx.rotate(rad()); ctx.translate(-px, -py); return true; },
    fogBox: function(W, H) { if (!isTurned() || !(W > 0) || !(H > 0)) return null; var w = wrapEl(), z = state.zoomLevel || 1; return fogBox(W, H, rad(), V.tx, V.ty, V.ox * z - (w ? w.scrollLeft : 0), V.oy * z - (w ? w.scrollTop : 0)); },   // where the fog's remembered ground must be drawn to reach a turned screen's corners
    on: function() { return prefOn(); }, set: setOn, wake: wake, upright: function() { upright(true); },
    setGm: setGmTurn, gmSync: gmSync,
    now: function() { return { on: V.on, src: V.src, tok: V.tok, goal: V.goal, deg: V.deg, ox: V.ox, oy: V.oy, tx: V.tx, ty: V.ty }; }   // what the view follows, for the step log and a check
};
(function wire() {
    var b = document.getElementById('wbViewTurnBtn'); if (b) b.addEventListener('click', function() { setOn(!prefOn()); });
    window.addEventListener('pointerdown', function(e) { var w = wrapEl(); if (w && e.target && w.contains(e.target)) _down = true; }, true);
    ['pointerup', 'pointercancel', 'blur'].forEach(function(k) { window.addEventListener(k, function() { if (_down) { _down = false; wake(); } }, true); });
    window.addEventListener('storage', function(e) { if (e.key === 'wp_viewTurn') { syncTick(); wake(); } });
    var nb = document.getElementById('wbViewAll'), hb = document.getElementById('wbViewHold');
    if (nb) nb.addEventListener('change', function() { var v = Number(nb.value); if (!isFinite(v)) { gmSync(); return; } setGmTurn(v, !!(hb && hb.checked)); });
    if (hb) hb.addEventListener('change', function() { setGmTurn(Number(nb && nb.value) || 0, hb.checked); });
    var vb = document.getElementById('wbCenterBtn'); if (vb) vb.addEventListener('click', gmSync);
    syncTick(); wake();
    setInterval(function() { var m = onPlay() ? getActiveMap() : null; if (prefOn() || isTurned() || gmTurnOf(m)) wake(); else if (moveTurnOn() || Object.keys(_up).length) upright(true); }, 400);   // a map opened, a token picked or moved: the view follows within a moment   // a map opened, a token picked or moved: the view follows within a moment
})();

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

// [viewcheck:core-start]
// The view's own numbers: the angle the board is turned by (degrees, clockwise on screen), and the board point it turns about
// tx, ty: an offset in the wrap's content pixels that keeps the screen still when the point it turns about moves (a token walks, another is picked)
var V = { on: false, deg: 0, goal: 0, ox: 0, oy: 0, tx: 0, ty: 0, tok: null, last: {} };
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
// [viewcheck:core-end]

function wrapEl() { return document.getElementById('whiteboardWrap'); }
function boardEl() { return document.getElementById('whiteboard'); }
function onPlay() { return state.viewMode !== 'data' && !!getActiveMap(); }
function prefOn() { try { return localStorage.getItem('wp_viewTurn') === 'on'; } catch (e) { return false; } }
function net() { return window.wpNet || null; }
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
var _raf = 0, _down = false;   // a press held on the board: the view stands still until it is let go, so a drag lands where it is let go
function apply() {
    var b = boardEl(); if (!b) return;
    var t = transform(state.zoomLevel || 1); if (b.style.transform !== t) b.style.transform = t;
    if (b.style && b.style.setProperty) b.style.setProperty('--view-turn', V.deg + 'deg');   // fold 3: what stays upright counters it
}
function tick() {
    _raf = 0;
    if (_down) { _raf = window.requestAnimationFrame ? requestAnimationFrame(tick) : setTimeout(tick, 33); return; }
    V.on = prefOn() && onPlay();
    var w = V.on ? followed() : null, goal = 0;
    if (w) {
        var c = centreOf(w), prev = V.last[w.id], h = moveHeading(prev, c);
        if (h !== null) V.last[w.id] = { x: c.x, y: c.y, h: h }; else if (!prev) V.last[w.id] = { x: c.x, y: c.y, h: prev && prev.h };
        var hd = headingOf(w, facingOn(), V.last[w.id]);
        if (hd !== null) goal = -hd;
        pivotTo(c.x, c.y); V.tok = w.id;
    } else V.tok = null;
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
function syncTick() { var b = document.getElementById('wbViewTurnBtn'); if (!b) return; var on = prefOn(); b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); }

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
    turnCtx: function(ctx) { if (!isTurned() || !ctx) return false; var w = wrapEl(), z = state.zoomLevel || 1, px = V.ox * z - (w ? w.scrollLeft : 0), py = V.oy * z - (w ? w.scrollTop : 0); ctx.translate(V.tx + px, V.ty + py); ctx.rotate(rad()); ctx.translate(-px, -py); return true; },
    on: function() { return prefOn(); }, set: setOn, wake: wake,
    now: function() { return { on: V.on, tok: V.tok, goal: V.goal, deg: V.deg, ox: V.ox, oy: V.oy, tx: V.tx, ty: V.ty }; }   // what the view follows, for the step log and a check
};
(function wire() {
    var b = document.getElementById('wbViewTurnBtn'); if (b) b.addEventListener('click', function() { setOn(!prefOn()); });
    window.addEventListener('pointerdown', function(e) { var w = wrapEl(); if (w && e.target && w.contains(e.target)) _down = true; }, true);
    ['pointerup', 'pointercancel', 'blur'].forEach(function(k) { window.addEventListener(k, function() { if (_down) { _down = false; wake(); } }, true); });
    window.addEventListener('storage', function(e) { if (e.key === 'wp_viewTurn') { syncTick(); wake(); } });
    syncTick(); wake();
    setInterval(function() { if (prefOn() || isTurned()) wake(); }, 400);   // a map opened, a token picked or moved: the view follows within a moment
})();

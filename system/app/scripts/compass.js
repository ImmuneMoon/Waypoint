/* Waypoint — a map's compass, the page's half (1.6.2, backlog 82; the owner's answers of 2026-11-06 are in compasscore.js).

   The rose stands at the bottom right or the bottom left of the play map, or on the map itself as a piece that pans and zooms with it. The GM
   drags the rose to turn north (on the map, its grip moves it), or sets it in the Measure options' Compass part, beside the map's scale. The
   GM's ticks there say what reads it, and a viewer's own Settings switch turns the words off on their screen alone (wp_compassWords). The
   rose is made with createElementNS from compasscore's ROSE: nothing of a map reaches it but numbers. */
import { getActiveCampaign, getActiveMap } from './models.js';
import { save } from './io.js';
import { state } from './state.js';
import { compassOf, cleanCompass, wayOf, bearing, reads, northAt, ROSE, INK } from './compasscore.js';

var NS = 'http://www.w3.org/2000/svg';
// [compasscheck:page-start]
function gmHere() { var n = window.wpNet; return !state.streamMode && !(n && (n.foreign || n.stream)) && typeof window.wpCanPersistLocal === 'function' ? window.wpCanPersistLocal() !== false : !state.streamMode && !(n && n.foreign); }
function wordsOn() { try { return localStorage.getItem('wp_compassWords') !== 'off'; } catch (e) { return true; } }
function onPlay() { return !!getActiveMap() && state.viewMode !== 'data'; }
// The way a token faces, in words for its card: "Faces north-east"
function faceWords(item) {
    var m = getActiveMap(), c = compassOf(m); if (!c || !reads(c, 'face', wordsOn()) || !item || !item.isChar) return '';
    var w = wayOf(c, (Number(item.rot) || 0) + (Number(item.front) || 0)); return w ? 'Faces ' + w : '';
}
// The way the ruler points, after its distance: " north-west"
function rulerWay(x1, y1, x2, y2) {
    var m = getActiveMap(), c = compassOf(m); if (!c || !reads(c, 'ruler', wordsOn())) return '';
    var b = bearing(x1, y1, x2, y2); return b === null ? '' : ' ' + wayOf(c, b);
}
// The rose as an svg, turned by north
function roseSvg(c, grip) {
    var sv = document.createElementNS(NS, 'svg'); sv.setAttribute('viewBox', '0 0 64 64'); sv.setAttribute('class', 'compass-rose');
    var g = document.createElementNS(NS, 'g'); g.setAttribute('transform', 'rotate(' + (c.north || 0) + ' 32 32)'); sv.appendChild(g);
    ROSE.forEach(function(p) {
        var e;
        if (p.k === 'disc' || p.k === 'hub') { e = document.createElementNS(NS, 'circle'); e.setAttribute('cx', String(p.cx)); e.setAttribute('cy', String(p.cy)); e.setAttribute('r', String(p.r)); e.setAttribute('fill', p.k === 'disc' ? INK.disc : INK.hub); if (p.k === 'disc') { e.setAttribute('stroke', INK.rim); e.setAttribute('stroke-width', '1'); } }
        else if (p.k === 'line') { e = document.createElementNS(NS, 'line'); e.setAttribute('x1', String(p.p[0])); e.setAttribute('y1', String(p.p[1])); e.setAttribute('x2', String(p.p[2])); e.setAttribute('y2', String(p.p[3])); e.setAttribute('stroke', INK.pale); e.setAttribute('stroke-width', '1.4'); e.setAttribute('stroke-linecap', 'round'); }
        else if (p.k === 'pale' || p.k === 'gold') { e = document.createElementNS(NS, 'path'); e.setAttribute('d', 'M' + p.p[0] + ' ' + p.p[1] + 'L' + p.p[2] + ' ' + p.p[3] + 'L' + p.p[4] + ' ' + p.p[5] + 'Z'); e.setAttribute('fill', INK[p.k]); }
        else { e = document.createElementNS(NS, 'text'); e.setAttribute('x', String(p.x)); e.setAttribute('y', String(p.y)); e.setAttribute('text-anchor', 'middle'); e.setAttribute('class', p.k === 'n' ? 'compass-n' : 'compass-o'); e.textContent = p.t; }
        g.appendChild(e);
    });
    if (grip) { var gp = document.createElementNS(NS, 'circle'); gp.setAttribute('class', 'compass-grip'); gp.setAttribute('cx', '32'); gp.setAttribute('cy', '32'); gp.setAttribute('r', '7'); sv.appendChild(gp); var gt = document.createElementNS(NS, 'title'); gt.textContent = 'Drag the middle to move the compass'; gp.appendChild(gt); }
    return sv;
}
var _sig = '', _drag = null;
// Draws the rose where the map's compass stands, or takes it away: asked at every redraw of the board
function sync() {
    var m = onPlay() ? getActiveMap() : null, c = compassOf(m), gm = gmHere(), sig = c ? JSON.stringify([m.id, c, gm]) : '', old = document.getElementById('compassRose');
    if (_drag) return;
    var wantIn = c ? document.getElementById(c.at === 'map' ? 'whiteboard' : 'main') : null;
    if (sig === _sig && (!c || (old && old.parentNode === wantIn))) return;
    _sig = sig; if (old) old.remove(); if (!c || !wantIn) return;
    var box = document.createElement('div'); box.id = 'compassRose'; box.className = 'compass ' + (c.at === 'map' ? 'compass-map' : c.at === 'bl' ? 'compass-bl' : 'compass-br') + (gm ? ' compass-gm' : '');
    if (c.at === 'map') { box.style.left = (c.x - 32) + 'px'; box.style.top = (c.y - 32) + 'px'; }
    box.dataset.tip = gm ? 'North. Drag the rose to turn it' + (c.at === 'map' ? ', or its middle to move it' : '') + '. The Measure options set it too.' : 'North';
    box.appendChild(roseSvg(c, gm && c.at === 'map'));
    wantIn.appendChild(box);
}
function boardScale() { var b = document.getElementById('whiteboard'); if (!b || !b.offsetWidth) return 1; var r = b.getBoundingClientRect(); return r.width / b.offsetWidth || 1; }
// A press on the GM's rose is the rose's, heard first at the window: on the map the board's own tools would take it otherwise
function pressFirst(e) { var box = e.target && e.target.closest ? e.target.closest('#compassRose.compass-gm') : null; if (box) dragStart(e, box); }
function dragStart(e, box) {
    if (e.button !== 0 || !box) return; var m = getActiveMap(), c = compassOf(m); if (!c || !m) return;
    e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    var r = box.getBoundingClientRect(), mv = !!(e.target && e.target.closest && e.target.closest('.compass-grip'));
    _drag = { box: box, m: m, c: c, cx: r.left + r.width / 2, cy: r.top + r.height / 2, mv: mv, sx: e.clientX, sy: e.clientY, x0: c.x, y0: c.y, k: boardScale(), id: e.pointerId };
    try { box.setPointerCapture(e.pointerId); } catch (er) {}
    box.addEventListener('pointermove', dragMove); box.addEventListener('pointerup', dragEnd); box.addEventListener('pointercancel', dragEnd);
}
function dragMove(e) {
    var d = _drag; if (!d) return;
    if (d.mv) { d.c.x = Math.round(d.x0 + (e.clientX - d.sx) / d.k); d.c.y = Math.round(d.y0 + (e.clientY - d.sy) / d.k); d.box.style.left = (d.c.x - 32) + 'px'; d.box.style.top = (d.c.y - 32) + 'px'; return; }
    var n = northAt(d.cx, d.cy, e.clientX, e.clientY); if (n === null) return; d.c.north = n;
    var g = d.box.querySelector('g'); if (g) g.setAttribute('transform', 'rotate(' + n + ' 32 32)');
}
function dragEnd() {
    var d = _drag; _drag = null; if (!d) return;
    d.box.removeEventListener('pointermove', dragMove); d.box.removeEventListener('pointerup', dragEnd); d.box.removeEventListener('pointercancel', dragEnd);
    setCompass(d.m, d.c);
}
// The map's compass written: cleaned, saved, and everything that reads it drawn again
function setCompass(m, c) {
    if (!m || !m.meta) return false;
    var v = c ? cleanCompass(c) : null; if (v) m.meta.compass = v; else delete m.meta.compass;
    _sig = ''; save(); if (typeof window.render === 'function') window.render(); else if (window.appRender) window.appRender(); sync(); menuSync(); return true;
}
// The Measure options' Compass part: the GM's alone
function menuSync() {
    var part = document.getElementById('measureCompass'); if (!part) return;
    var m = getActiveMap(), c = compassOf(m), gm = gmHere(); part.hidden = !gm || !m;
    var on = document.getElementById('compassOn'), more = document.getElementById('compassMore'); if (!on) return;
    on.checked = !!c; if (more) more.hidden = !c;
    var nb = document.getElementById('compassNorth'); if (nb && document.activeElement !== nb) nb.value = String(c && c.north ? c.north : 0);
    var at = document.getElementById('compassAt'); if (at) at.value = c && c.at ? c.at : 'br';
    ['face', 'ruler', 'pic'].forEach(function(k) { var t = document.getElementById('compass_' + k); if (t) t.checked = !!(c && c[k] === true); });
}
function viewMiddle() {   // the middle of the view, in board pixels: where a compass put on the map first stands
    var w = document.getElementById('whiteboardWrap'), b = document.getElementById('whiteboard'); if (!w || !b) return { x: 400, y: 300 };
    var rw = w.getBoundingClientRect(), rb = b.getBoundingClientRect(), k = boardScale();
    return { x: Math.round((rw.left + rw.width / 2 - rb.left) / k), y: Math.round((rw.top + rw.height / 2 - rb.top) / k) };
}
function menuWire() {
    var on = document.getElementById('compassOn'); if (!on || on.dataset.wired) return; on.dataset.wired = '1';
    on.addEventListener('change', function() { var m = getActiveMap(); if (!m) return; setCompass(m, on.checked ? { face: true, ruler: true, pic: true } : null); });
    var nb = document.getElementById('compassNorth');
    if (nb) nb.addEventListener('change', function() { var m = getActiveMap(), c = compassOf(m); if (!c) return; var v = Number(nb.value); if (!isFinite(v)) { menuSync(); return; } c.north = v; setCompass(m, c); });
    var at = document.getElementById('compassAt');
    if (at) at.addEventListener('change', function() { var m = getActiveMap(), c = compassOf(m); if (!c) return; if (at.value === 'map') { var p = viewMiddle(); c.at = 'map'; c.x = p.x; c.y = p.y; } else if (at.value === 'bl') { c.at = 'bl'; delete c.x; delete c.y; } else { delete c.at; delete c.x; delete c.y; } setCompass(m, c); });
    ['face', 'ruler', 'pic'].forEach(function(k) { var t = document.getElementById('compass_' + k); if (t) t.addEventListener('change', function() { var m = getActiveMap(), c = compassOf(m); if (!c) return; if (t.checked) c[k] = true; else delete c[k]; setCompass(m, c); }); });
}
// [compasscheck:page-end]
window.wpCompass = { sync: sync, faceWords: faceWords, rulerWay: rulerWay, menuSync: menuSync, set: setCompass };
if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('pointerdown', pressFirst, true);
if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', menuWire); else menuWire(); }

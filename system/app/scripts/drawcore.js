// The paint window's pure half (1.6.2, backlog 232; the owner, 2026-11-13: "we sould let people draw textures and other items in
// waypoint too", and by prompt: a small set of tools "plus more" (text, a soft brush, a selection you move or turn), strokes that wrap
// with a live 3 by 3 for a pattern, "Layers like a paint program", and what it opens on "optional for the user"). It reads nothing but
// its arguments: no page, no canvas, no clock. drawwin.js draws with what it answers.
//   canvasFor        the drawing's pixel size for cells at a cell's pixels, held to MAX_SIDE a side
//   copiesOf         where a stroke is drawn again: mirrored left and right, and for a pattern at the eight neighbors that wrap it
//   flood            a fill on RGBA bytes, by a tolerance, wrapping round the edges where asked
//   pickAt, hexOf, rgbOf, cleanHex   a color read from the bytes, and a color's text
//   dabsAlong        the points a brush lays down a segment, spaced, carrying what is left over to the next segment
//   layerAdd, layerDel, layerMove, layerName, newLayerName, cleanOp   the layers' list
//   histPush, histUndo, histRedo                                      undo and redo, held to a count and a size
//   rectOf, constrain, turnBy, selHit, rotPt                          the shapes, the selection and its turn
//   fitZoom, zoomStep, startChoices, cleanText, toolOfKey
var DRAW = Object.freeze({ MAX_SIDE: 2048, LAYERS: 8, HIST: 40, HIST_BYTES: 256 * 1024 * 1024, SIZE_MIN: 1, SIZE_MAX: 200, TOL: 32, TEXT: 200, NAME: 40, SNAP: Math.PI / 12 });
var TOOLS = Object.freeze(['pen', 'brush', 'eraser', 'fill', 'line', 'rect', 'circle', 'text', 'select', 'pick']);
var TOOL_KEYS = Object.freeze({ p: 'pen', b: 'brush', e: 'eraser', g: 'fill', l: 'line', r: 'rect', c: 'circle', t: 'text', s: 'select', i: 'pick' });

function fin(n) { return typeof n === 'number' && isFinite(n); }
function whole(n, lo, hi) { return fin(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : lo; }

// The drawing's size: cells across and down at a cell's pixels, held to MAX_SIDE a side by one scale for both, so its shape stays
function canvasFor(cw, ch, px) {
    var a = whole(cw, 1, 64), b = whole(ch, 1, 64), p = whole(px, 1, 4096), w = a * p, h = b * p, s = Math.min(1, DRAW.MAX_SIDE / Math.max(w, h));
    return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)), scaled: s < 1 };
}
// Each place a stroke is drawn: { flip, dx, dy }. flip draws it mirrored across the drawing's middle; dx and dy move it by a whole drawing
// so that what runs off one edge comes in on the other (a pattern). The plain stroke is always first
function copiesOf(w, h, wrap, mirror) {
    var out = [], offs = [[0, 0]];
    if (wrap) [-1, 0, 1].forEach(function(i) { [-1, 0, 1].forEach(function(j) { if (i || j) offs.push([i * w, j * h]); }); });
    [false].concat(mirror ? [true] : []).forEach(function(f) { offs.forEach(function(o) { out.push({ flip: f, dx: o[0], dy: o[1] }); }); });
    return out;
}
// A point where a copy lands: mirrored across x = w / 2, then moved
function copyPt(c, x, y, w) { return { x: (c.flip ? w - x : x) + c.dx, y: y + c.dy }; }

// Fill: every pixel joined to (x, y) whose color is within tol of the color there, set to rgba [r, g, b, a]. Wraps round the edges where
// asked. Changes the bytes in place and answers how many pixels it set (0 where the start is outside, or already that color)
function flood(px, w, h, x, y, rgba, tol, wrap) {
    if (!px || !fin(w) || !fin(h) || w < 1 || h < 1 || px.length < w * h * 4) return 0;
    x = Math.floor(x); y = Math.floor(y);
    if (wrap) { x = ((x % w) + w) % w; y = ((y % h) + h) % h; } else if (x < 0 || y < 0 || x >= w || y >= h) return 0;
    var t = fin(tol) ? Math.max(0, Math.min(255, tol)) : DRAW.TOL, i0 = (y * w + x) * 4, sr = px[i0], sg = px[i0 + 1], sb = px[i0 + 2], sa = px[i0 + 3];
    var fr = rgba[0] | 0, fg = rgba[1] | 0, fb = rgba[2] | 0, fa = rgba[3] | 0;
    if (sr === fr && sg === fg && sb === fb && sa === fa) return 0;
    var seen = new Uint8Array(w * h), stack = [y * w + x], n = 0;
    function near(p) { var j = p * 4; if (sa === 0 && px[j + 3] === 0) return true; return Math.abs(px[j] - sr) <= t && Math.abs(px[j + 1] - sg) <= t && Math.abs(px[j + 2] - sb) <= t && Math.abs(px[j + 3] - sa) <= t; }
    seen[stack[0]] = 1;
    while (stack.length) {
        var p = stack.pop(), j = p * 4; px[j] = fr; px[j + 1] = fg; px[j + 2] = fb; px[j + 3] = fa; n++;
        var cx = p % w, cy = (p - cx) / w, nb = [];
        if (cx > 0) nb.push(p - 1); else if (wrap) nb.push(p + w - 1);
        if (cx < w - 1) nb.push(p + 1); else if (wrap) nb.push(p - w + 1);
        if (cy > 0) nb.push(p - w); else if (wrap) nb.push(p + w * (h - 1));
        if (cy < h - 1) nb.push(p + w); else if (wrap) nb.push(p - w * (h - 1));
        for (var k = 0; k < nb.length; k++) { var q = nb[k]; if (!seen[q] && near(q)) { seen[q] = 1; stack.push(q); } }
    }
    return n;
}
function hex2(n) { var s = Math.max(0, Math.min(255, Math.round(n))).toString(16); return s.length < 2 ? '0' + s : s; }
function hexOf(r, g, b) { return '#' + hex2(r) + hex2(g) + hex2(b); }
function cleanHex(v) { return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : typeof v === 'string' && /^#[0-9a-fA-F]{3}$/.test(v) ? ('#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3]).toLowerCase() : ''; }
function rgbOf(v) { var c = cleanHex(v); return c ? [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)] : [0, 0, 0]; }
// The color at (x, y) of RGBA bytes: its text and how solid it is; null where nothing is there to pick
function pickAt(px, w, h, x, y) {
    x = Math.floor(x); y = Math.floor(y); if (!px || x < 0 || y < 0 || x >= w || y >= h) return null;
    var j = (y * w + x) * 4; if (px[j + 3] === 0) return null;
    return { hex: hexOf(px[j], px[j + 1], px[j + 2]), a: px[j + 3] / 255 };
}

// The points a brush lays from (x0, y0) to (x1, y1), every `gap` pixels, the first `carry` pixels in: answers { pts, carry } with what is
// left for the next segment, so a slow stroke and a fast one lay alike
function dabsAlong(x0, y0, x1, y1, gap, carry) {
    var g = fin(gap) && gap > 0.25 ? gap : 0.25, dx = x1 - x0, dy = y1 - y0, len = Math.sqrt(dx * dx + dy * dy), at = fin(carry) && carry >= 0 ? carry : 0, pts = [];
    if (!fin(len)) return { pts: pts, carry: 0 };
    while (at <= len && pts.length < 20000) { var f = len ? at / len : 0; pts.push({ x: x0 + dx * f, y: y0 + dy * f }); at += g; }
    return { pts: pts, carry: at - len };
}

// Layers: [{ id, name, hidden, op }], the top one last
function layerName(s) { return typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, DRAW.NAME) : ''; }
function newLayerName(list) { var n = (list || []).length + 1; while ((list || []).some(function(l) { return l && typeof l.name === 'string' && l.name.toLowerCase() === ('layer ' + n); })) n++; return 'Layer ' + n; }
function cleanOp(v) { return fin(v) ? Math.max(0, Math.min(1, Math.round(v * 100) / 100)) : 1; }
// A new layer right above `at` (the top where at is none); null at the most a drawing holds
function layerAdd(list, id, at) {
    if (!Array.isArray(list) || list.length >= DRAW.LAYERS) return null;
    var out = list.slice(), i = fin(at) && at >= 0 && at < list.length ? at + 1 : list.length, L = { id: id, name: newLayerName(list), hidden: false, op: 1 };
    out.splice(i, 0, L); return { list: out, at: i };
}
function layerDel(list, i) { if (!Array.isArray(list) || list.length < 2 || !fin(i) || i < 0 || i >= list.length) return null; var out = list.slice(); out.splice(i, 1); return { list: out, at: Math.min(i, out.length - 1) }; }
// One step up (dir 1) or down (dir -1); null at the end it would go past
function layerMove(list, i, dir) {
    if (!Array.isArray(list) || !fin(i) || i < 0 || i >= list.length) return null;
    var j = i + (dir > 0 ? 1 : -1); if (j < 0 || j >= list.length) return null;
    var out = list.slice(), t = out[i]; out[i] = out[j]; out[j] = t; return { list: out, at: j };
}

// Undo and redo: { undo: [], redo: [] } of entries { bytes, ... }. A push empties redo and lets the oldest go past HIST steps or HIST_BYTES
function histNew() { return { undo: [], redo: [] }; }
function histBytes(list) { return list.reduce(function(a, e) { return a + (e && fin(e.bytes) ? e.bytes : 0); }, 0); }
function histPush(h, e) {
    if (!h || !e) return h; h.undo.push(e); h.redo = [];
    while (h.undo.length > DRAW.HIST || (h.undo.length > 1 && histBytes(h.undo) > DRAW.HIST_BYTES)) h.undo.shift();
    return h;
}
// Takes the newest step off undo and hands it to `swap`, which puts it back and answers the step that takes it forward again
function histUndo(h, swap) { if (!h || !h.undo.length) return false; var e = h.undo.pop(), back = swap(e); if (back) h.redo.push(back); return true; }
function histRedo(h, swap) { if (!h || !h.redo.length) return false; var e = h.redo.pop(), back = swap(e); if (back) h.undo.push(back); return true; }

// A box from two corners, its sides whole; with `square` its sides alike, toward the second corner
function rectOf(x0, y0, x1, y1, square) {
    var dx = x1 - x0, dy = y1 - y0;
    if (square) { var m = Math.max(Math.abs(dx), Math.abs(dy)); dx = (dx < 0 ? -1 : 1) * m; dy = (dy < 0 ? -1 : 1) * m; }
    return { x: Math.min(x0, x0 + dx), y: Math.min(y0, y0 + dy), w: Math.abs(dx), h: Math.abs(dy) };
}
// A line's end held to a multiple of 15 degrees from its start
function constrain(x0, y0, x1, y1) {
    var dx = x1 - x0, dy = y1 - y0, len = Math.sqrt(dx * dx + dy * dy), a = Math.round(Math.atan2(dy, dx) / DRAW.SNAP) * DRAW.SNAP;
    return { x: x0 + Math.cos(a) * len, y: y0 + Math.sin(a) * len };
}
// The turn from the center to a point, measured from straight up, by 15 degrees where `snap`
function turnBy(cx, cy, x, y, snap) { var a = Math.atan2(x - cx, cy - y); return snap ? Math.round(a / DRAW.SNAP) * DRAW.SNAP : a; }
function rotPt(x, y, cx, cy, a) { var c = Math.cos(a), s = Math.sin(a), dx = x - cx, dy = y - cy; return { x: cx + dx * c - dy * s, y: cy + dx * s + dy * c }; }
// Where a press lands on a selection { x, y, w, h, a }: 'turn' on the handle above its top (r pixels of the drawing round it), 'in' inside
// it, null outside. The handle stands `lift` pixels above the top's middle
function selHit(sel, x, y, r, lift) {
    if (!sel || !fin(sel.w) || !fin(sel.h)) return null;
    var cx = sel.x + sel.w / 2, cy = sel.y + sel.h / 2, a = fin(sel.a) ? sel.a : 0, p = rotPt(x, y, cx, cy, -a), rr = fin(r) ? r : 8, up = fin(lift) ? lift : 20;
    var hx = cx, hy = sel.y - up;
    if ((p.x - hx) * (p.x - hx) + (p.y - hy) * (p.y - hy) <= rr * rr) return 'turn';
    return p.x >= sel.x && p.x <= sel.x + sel.w && p.y >= sel.y && p.y <= sel.y + sel.h ? 'in' : null;
}

// The view's zoom: the largest of the steps at which the drawing fits the room, never under the smallest
var ZOOMS = Object.freeze([0.125, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8]);
function fitZoom(w, h, vw, vh) { var best = ZOOMS[0]; ZOOMS.forEach(function(z) { if (w * z <= vw && h * z <= vh) best = z; }); return best; }
function zoomStep(z, dir) { var i = ZOOMS.indexOf(z); if (i < 0) { i = 0; ZOOMS.forEach(function(v, k) { if (v <= z) i = k; }); } return ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, i + (dir > 0 ? 1 : -1)))]; }

// What the window may start from: your picture where there is one, a clear drawing, and Waypoint's own drawing where it has one. The first is
// what it opens on
function startChoices(mine, wp) {
    var out = []; if (mine) out.push({ v: 'mine', label: 'Your picture' });
    out.push({ v: 'clear', label: 'Clear' }); if (wp) out.push({ v: 'wp', label: 'Waypoint’s drawing' });
    return out;
}
function cleanText(s) { return typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, DRAW.TEXT) : ''; }
// A key pressed with nothing held names a tool, or none
function toolOfKey(k) { return typeof k === 'string' && k.length === 1 && Object.prototype.hasOwnProperty.call(TOOL_KEYS, k.toLowerCase()) ? TOOL_KEYS[k.toLowerCase()] : null; }

var API = { DRAW: DRAW, TOOLS: TOOLS, TOOL_KEYS: TOOL_KEYS, ZOOMS: ZOOMS, canvasFor: canvasFor, copiesOf: copiesOf, copyPt: copyPt, flood: flood, hexOf: hexOf, cleanHex: cleanHex, rgbOf: rgbOf, pickAt: pickAt,
    dabsAlong: dabsAlong, layerName: layerName, newLayerName: newLayerName, cleanOp: cleanOp, layerAdd: layerAdd, layerDel: layerDel, layerMove: layerMove,
    histNew: histNew, histPush: histPush, histUndo: histUndo, histRedo: histRedo, rectOf: rectOf, constrain: constrain, turnBy: turnBy, rotPt: rotPt, selHit: selHit,
    fitZoom: fitZoom, zoomStep: zoomStep, startChoices: startChoices, cleanText: cleanText, toolOfKey: toolOfKey };
export { DRAW, TOOLS, TOOL_KEYS, ZOOMS, canvasFor, copiesOf, copyPt, flood, hexOf, cleanHex, rgbOf, pickAt, dabsAlong, layerName, newLayerName, cleanOp, layerAdd, layerDel, layerMove,
    histNew, histPush, histUndo, histRedo, rectOf, constrain, turnBy, rotPt, selHit, fitZoom, zoomStep, startChoices, cleanText, toolOfKey };
if (typeof window !== 'undefined') window.wpDrawCore = API;

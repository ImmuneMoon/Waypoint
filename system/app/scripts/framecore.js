/* The token creator's pure core (no DOM): the square a picture is framed to — the middle by default, always inside the picture (owner,
   2026-09-27: "choose what part of an image is used for the crop ... zoom in on a specific part"), zoomed about a point, moved by a drag —
   the outline the grid will cut it to (a guide only: the saved file is the square), and the size and format it is saved at.
   window.wpFrameCore; tested in Node (tools/framecheck.js). */

var VERSION = 1;
var MIN_SIDE = 32;                 // the smallest square (in picture pixels) a zoom may reach: past this there is nothing left to see
var ZOOM_MAX = 8;                  // the slider's end (8x the whole-picture square), never past MIN_SIDE

function fin(v) { return typeof v === 'number' && isFinite(v); }

// The middle square of a w x h picture — exactly the old automatic centre crop, so OK with no change gives the same picture
function defaultRect(w, h) { var s = Math.min(w, h); return { x: (w - s) / 2, y: (h - s) / 2, s: s }; }
function minSide(w, h) { var m = Math.min(w, h); return Math.min(m, Math.max(MIN_SIDE, m / ZOOM_MAX)); }
// A square kept inside the picture and between the smallest square and the whole short side; anything that is not a number: the middle
function clampRect(r, w, h) {
    if (!(fin(w) && fin(h) && w > 0 && h > 0)) return { x: 0, y: 0, s: 0 };
    var maxS = Math.min(w, h), lo = minSide(w, h), d = defaultRect(w, h);
    var s = r && fin(r.s) ? Math.max(lo, Math.min(maxS, r.s)) : d.s;
    var x = r && fin(r.x) ? r.x : (w - s) / 2, y = r && fin(r.y) ? r.y : (h - s) / 2;
    return { x: Math.max(0, Math.min(w - s, x)), y: Math.max(0, Math.min(h - s, y)), s: s };
}
// Zoom by factor (> 1 closer) about a point (px, py, in picture pixels) that stays where it is on screen
function zoomAt(r, factor, px, py, w, h) {
    var c = clampRect(r, w, h); if (!fin(factor) || factor <= 0 || !c.s) return c;
    var maxS = Math.min(w, h), s2 = Math.max(minSide(w, h), Math.min(maxS, c.s / factor)), k = s2 / c.s;
    if (!fin(px) || !fin(py)) { px = c.x + c.s / 2; py = c.y + c.s / 2; }
    return clampRect({ x: px - (px - c.x) * k, y: py - (py - c.y) * k, s: s2 }, w, h);
}
// Move the square by (dx, dy) picture pixels (a drag moves the picture the other way: the caller negates)
function panBy(r, dx, dy, w, h) { var c = clampRect(r, w, h); return clampRect({ x: c.x + (fin(dx) ? dx : 0), y: c.y + (fin(dy) ? dy : 0), s: c.s }, w, h); }
// The zoom a square stands for (1 = the whole short side), and a square at a zoom about its own centre (the slider)
function zoomOf(r, w, h) { var c = clampRect(r, w, h); return c.s ? Math.min(w, h) / c.s : 1; }
function setZoom(r, z, w, h) { var c = clampRect(r, w, h); if (!fin(z) || z <= 0 || !c.s) return c; var s2 = Math.min(w, h) / z; return clampRect({ x: c.x + c.s / 2 - s2 / 2, y: c.y + c.s / 2 - s2 / 2, s: s2 }, w, h); }
// The side of the saved square: the chosen square's own pixels, at most cap — never enlarged
function outSide(s, cap) { var c = fin(cap) && cap > 0 ? Math.floor(cap) : 256; return Math.max(1, Math.min(c, Math.round(fin(s) ? s : 0))); }
// The formats a framed picture is encoded in, in order (a data URL for a profile or a player's picture): PNG, then WebP, then JPEG on a
// filled background (a transparent corner would turn black) — the first that fits
var ENCODE = Object.freeze([Object.freeze({ type: 'image/png' }), Object.freeze({ type: 'image/webp', q: 0.9 }), Object.freeze({ type: 'image/jpeg', q: 0.85, fill: true })]);
// The first candidate { type, data } that really is its type (a browser that cannot write WebP answers PNG) and fits within max characters
function firstFit(cands, max) {
    for (var i = 0; i < (cands || []).length; i++) {
        var c = cands[i]; if (!c || typeof c.data !== 'string' || typeof c.type !== 'string') continue;
        if (c.data.indexOf('data:' + c.type + ';base64,') === 0 && (!fin(max) || c.data.length <= max)) return c.data;
    }
    return '';
}
// The outline a map's grid cuts a token's square to (owner, 2026-09-27: the grid gives the outline), drawn over the square as an SVG path
// in a 100 x 100 box: what a bw x bh token box shows of a square picture (object-fit: cover — a wide box shows a band) and its shape
function guidePath(shape, bw, bh) {
    bw = fin(bw) && bw > 0 ? bw : 60; bh = fin(bh) && bh > 0 ? bh : 52;
    var bx = 0, by = 0, W = 100, H = 100;
    if (bw > bh) { H = 100 * bh / bw; by = (100 - H) / 2; } else if (bh > bw) { W = 100 * bw / bh; bx = (100 - W) / 2; }
    var f = function(v) { return Math.round(v * 100) / 100; };
    if (shape === 'hexagon') return 'M' + f(bx + W * 0.25) + ' ' + f(by) + 'L' + f(bx + W * 0.75) + ' ' + f(by) + 'L' + f(bx + W) + ' ' + f(by + H / 2) + 'L' + f(bx + W * 0.75) + ' ' + f(by + H) + 'L' + f(bx + W * 0.25) + ' ' + f(by + H) + 'L' + f(bx) + ' ' + f(by + H / 2) + 'Z';
    if (shape === 'circle') { var rx = W / 2, ry = H / 2, cy = by + ry; return 'M' + f(bx) + ' ' + f(cy) + 'A' + f(rx) + ' ' + f(ry) + ' 0 1 0 ' + f(bx + W) + ' ' + f(cy) + 'A' + f(rx) + ' ' + f(ry) + ' 0 1 0 ' + f(bx) + ' ' + f(cy) + 'Z'; }
    return 'M' + f(bx) + ' ' + f(by) + 'H' + f(bx + W) + 'V' + f(by + H) + 'H' + f(bx) + 'Z';
}
// A wheel's zoom (> 1 closer): its vertical move only (a sideways scroll zooms nothing), in proportion to how far it goes — a mouse notch
// (100 px) about 10%, a touchpad's small steps and pinches (ctrl+wheel) a little each — never more than a notch in one event
function wheelFactor(dy, mode) { if (!fin(dy) || !dy) return 1; var px = dy * (mode === 1 ? 16 : mode === 2 ? 400 : 1); px = Math.max(-100, Math.min(100, px)); return Math.exp(-px * 0.001); }
// A stored framing (the GM's kept original: its square), cleaned against the picture's size: numbers only, inside it; else null
function cleanRect(v, w, h) {
    if (!v || typeof v !== 'object' || !fin(v.x) || !fin(v.y) || !fin(v.s) || !(fin(w) && fin(h) && w > 0 && h > 0)) return null;
    return clampRect({ x: v.x, y: v.y, s: v.s }, w, h);
}

var API = { VERSION: VERSION, MIN_SIDE: MIN_SIDE, ZOOM_MAX: ZOOM_MAX, ENCODE: ENCODE, defaultRect: defaultRect, minSide: minSide, clampRect: clampRect, zoomAt: zoomAt, panBy: panBy, zoomOf: zoomOf, setZoom: setZoom, outSide: outSide, firstFit: firstFit, guidePath: guidePath, cleanRect: cleanRect, wheelFactor: wheelFactor };
if (typeof window !== 'undefined') window.wpFrameCore = API;
export { VERSION, MIN_SIDE, ZOOM_MAX, ENCODE, defaultRect, minSide, clampRect, zoomAt, panBy, zoomOf, setZoom, outSide, firstFit, guidePath, cleanRect, wheelFactor };

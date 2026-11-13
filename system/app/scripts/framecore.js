/* The token creator's pure core (no DOM): the square a picture is framed to — the middle by default, always inside the picture (owner,
   2026-09-27: "choose what part of an image is used for the crop ... zoom in on a specific part"), zoomed about a point, moved by a drag —
   the outline the grid will cut it to (a guide only: the saved file is the square), and the size and format it is saved at.
   window.wpFrameCore; tested in Node (tools/framecheck.js). */

var VERSION = 1;
var MIN_SIDE = 32;                 // the smallest square (in picture pixels) a zoom may reach: past this there is nothing left to see
var ZOOM_MAX = 8;                  // the slider's end (8x the whole-picture square), never past MIN_SIDE

function fin(v) { return typeof v === 'number' && isFinite(v); }

// The middle square of a w x h picture — exactly the old automatic center crop, so OK with no change gives the same picture
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
// The zoom a square stands for (1 = the whole short side), and a square at a zoom about its own center (the slider)
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
// 1.6.2 (backlog 141; the owner: "Trim and center (Recommended)"): the square a picture made a token is cut to, in the picture's own pixels.
// Its see-through border is trimmed, or, where its four corners are all one color, a border of that color. The rest is centered in a
// square, which may reach past the picture: what lies past it stays see-through. px is the RGBA bytes. null where nothing is worth trimming:
// no border wider than a fiftieth of the shorter side, or a picture that is all border
function trimRect(px, w, h) {
    if (!px || !(w >= 1) || !(h >= 1) || Math.floor(w) !== w || Math.floor(h) !== h || !(px.length >= w * h * 4)) return null;
    var at = function(x, y) { return (y * w + x) * 4; }, see = function(i) { return px[i + 3] <= 8; };
    var cs = [at(0, 0), at(w - 1, 0), at(0, h - 1), at(w - 1, h - 1)], c0 = cs[0];
    var near = function(i, j) { return Math.abs(px[i] - px[j]) + Math.abs(px[i + 1] - px[j + 1]) + Math.abs(px[i + 2] - px[j + 2]) <= 24; };
    var plain = cs.every(function(i) { return !see(i) && near(i, c0); });
    var empty = plain ? function(i) { return see(i) || (px[i + 3] >= 240 && near(i, c0)); } : see;
    var rowFull = function(y) { for (var x = 0; x < w; x++) if (!empty(at(x, y))) return true; return false; };
    var colFull = function(x, y0, y1) { for (var y = y0; y <= y1; y++) if (!empty(at(x, y))) return true; return false; };
    var y0 = 0; while (y0 < h && !rowFull(y0)) y0++;
    if (y0 >= h) return null;
    var y1 = h - 1; while (y1 > y0 && !rowFull(y1)) y1--;
    var x0 = 0; while (x0 < w && !colFull(x0, y0, y1)) x0++;
    var x1 = w - 1; while (x1 > x0 && !colFull(x1, y0, y1)) x1--;
    var m = Math.max(1, Math.round(Math.min(w, h) / 50));
    if (x0 < m && y0 < m && w - 1 - x1 < m && h - 1 - y1 < m) return null;
    var bw = x1 - x0 + 1, bh = y1 - y0 + 1, s = Math.max(bw, bh);
    return { bx: x0, by: y0, bw: bw, bh: bh, s: s, x: x0 + bw / 2 - s / 2, y: y0 + bh / 2 - s / 2 };
}
// ... and the size a token's picture is best at, for a map's grid ('hex', 'square' or 'off'), in plain words (the owner: "Also on upload")
function sizeTip(grid) {
    var cut = grid === 'hex' ? ' Its hexagon is cut from the middle, so keep the subject there.' : grid === 'square' ? '' : ' Its circle is cut from the middle, so keep the subject there.';
    return 'For a token, a square picture of 256 pixels or more fits best.' + cut;
}
function cleanRect(v, w, h) {
    if (!v || typeof v !== 'object' || !fin(v.x) || !fin(v.y) || !fin(v.s) || !(fin(w) && fin(h) && w > 0 && h > 0)) return null;
    return clampRect({ x: v.x, y: v.y, s: v.s }, w, h);
}

var API = { VERSION: VERSION, MIN_SIDE: MIN_SIDE, ZOOM_MAX: ZOOM_MAX, ENCODE: ENCODE, defaultRect: defaultRect, minSide: minSide, clampRect: clampRect, zoomAt: zoomAt, panBy: panBy, zoomOf: zoomOf, setZoom: setZoom, outSide: outSide, firstFit: firstFit, guidePath: guidePath, cleanRect: cleanRect, wheelFactor: wheelFactor, trimRect: trimRect, sizeTip: sizeTip };
if (typeof window !== 'undefined') window.wpFrameCore = API;
export { VERSION, MIN_SIDE, ZOOM_MAX, ENCODE, defaultRect, minSide, clampRect, zoomAt, panBy, zoomOf, setZoom, outSide, firstFit, guidePath, cleanRect, wheelFactor, trimRect, sizeTip };

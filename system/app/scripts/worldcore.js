/* Map builder (1.5.4, backlog item 23, fold B7) -- the world generator's pure half. One seed and seven settings make one world, the same
   every time. No state, no DOM, no clock and no Math.random: the seed is the only source of chance. tools/buildcheck.js runs it under
   Node, and the dialog (whiteboard.js) reads it as window.wpWorldCore. It imports buildcore.js alone.

   The owner's answers (2026-10-11, by prompt, on the world sheet): the land patterns are "The four (Recommended)": Forest, Mountains,
   Sand, Snow; a generated world is "C. A Land list (Recommended)": an island, a continent or a scatter of islands; towns are "optional
   when generating", as "A list, None first (Recommended)": None, Marks, Marks with names; the row wears "A. Peaks (Recommended)" and
   the dialog is as the sheet drew it (Land, Size, Mountains, Forests, Rivers, Climate, and Towns).

   A world is an overview with no battle grid. It is planned on a board of cells 100 px wide: which cells are land, how far each lies
   from the sea, and what each wears (plain land, forest, sand, snow, mountains). Each stretch of one kind is laid as ONE filled region,
   its outline following the cells' corners, which chance moves a little so that no coast is a staircase. The kinds are painted in one
   order (land, forest, sand, snow, mountains), so a region needs no hole: what lies inside it is painted over it, and what a stretch
   closes in and is painted before it becomes its own before anything is laid. A river runs from high ground down to the drawn coast
   as a line. Nothing blocks sight or stops a token: a world map is for pointing and travelling.

   Only +, -, * and / reach a number that is kept, never a sine or a root: a plan is the same on every machine. */
'use strict';

import { polyItem, wallLine } from './buildcore.js';

var VERSION = 1;
function isObj(v) { return v !== null && typeof v === 'object'; }
function fin(v) { return typeof v === 'number' && isFinite(v); }

var LANDS = Object.freeze(['island', 'continent', 'islands']), SIZES = Object.freeze(['small', 'medium', 'large']), AMOUNTS = Object.freeze(['none', 'few', 'some', 'many']);
var CLIMATES = Object.freeze(['mild', 'cold', 'dry']), TOWNS = Object.freeze(['none', 'marks', 'names']);
var KINDS = Object.freeze(['land', 'forest', 'sand', 'snow', 'mountains']);   // the order they are painted in: a later kind lies over an earlier one
// each kind's own colour and pattern, as the world sheet drew them; the sea and plain land wear the Water and the Grass material's
var LAND_COLOR = Object.freeze({ sea: '#2e5d86', land: '#4b6b36', forest: '#2f5d3a', sand: '#c9ad6b', snow: '#dfe6ee', mountains: '#6f6a66', river: '#2e5d86', town: '#7a3f33' });
var LAND_TEXTURE = Object.freeze({ sea: 'ripples', land: 'grass', forest: 'forest', sand: 'sand', snow: 'snow', mountains: 'mountains' });
var SEED_RE = /^[A-Za-z0-9-]{1,24}$/, CELL = 100, JIT = 34, MAXPTS = 480;
// what worldPieces reads of a plan handed in: a board no larger than this each way, and no more layers, rivers, towns or points of a river
var MAXSIDE = 10000, MAXLAYERS = 4000, MAXRIVERS = 400, MAXTOWNS = 400, MAXRIVERPTS = 1500;
var BOARD = Object.freeze({ small: Object.freeze([20, 14]), medium: Object.freeze([30, 21]), large: Object.freeze([40, 28]) });
function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined; }
function pick(list, v, d) { return typeof v === 'string' && list.indexOf(v) >= 0 ? v : d; }
// The settings as the generator takes them, whatever is handed in: a seed of letters, digits and hyphens (24 at most; anything else the
// first seed), and one word for each list. Read by own keys only
function cleanWorld(v) {
    var o = isObj(v) ? v : {}, seed = own(o, 'seed');
    return { seed: typeof seed === 'string' && SEED_RE.test(seed) ? seed : '0000-fox', land: pick(LANDS, own(o, 'land'), 'island'), size: pick(SIZES, own(o, 'size'), 'medium'),
        mountains: pick(AMOUNTS, own(o, 'mountains'), 'some'), forests: pick(AMOUNTS, own(o, 'forests'), 'some'), rivers: pick(AMOUNTS, own(o, 'rivers'), 'some'),
        climate: pick(CLIMATES, own(o, 'climate'), 'mild'), towns: pick(TOWNS, own(o, 'towns'), 'none') };
}
// Chance from the seed alone, as the dungeon's and the city's: a 32-bit hash of the text (FNV-1a) feeds a small generator (mulberry32)
function hash32(s) { var h = 0x811c9dc5; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; }
function rngOf(text) {
    var a = hash32(text) || 1;
    return function() { a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function seedText(o) { return 'world|' + VERSION + '|' + o.seed + '|' + o.land + '|' + o.size + '|' + o.mountains + '|' + o.forests + '|' + o.rivers + '|' + o.climate + '|' + o.towns; }
// A smooth field of chance over the board, 0 to 1: values on a coarse lattice, each cell a blend of the four around it
function noiseOf(rnd, cols, rows, step) {
    var gw = Math.floor(cols / step) + 2, gh = Math.floor(rows / step) + 2, g = [], i;
    for (i = 0; i < gw * gh; i++) g.push(rnd());
    return function(x, y) {
        var fx = x / step, fy = y / step, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
        return (g[iy * gw + ix] * (1 - tx) + g[iy * gw + ix + 1] * tx) * (1 - ty) + (g[(iy + 1) * gw + ix] * (1 - tx) + g[(iy + 1) * gw + ix + 1] * tx) * ty;
    };
}
var N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
// The cells of `mask` (1 a cell) joined by their sides, as lists of [x, y]
function parts(mask, cols, rows) {
    var seen = [], out = [], x, y, i;
    if (!Array.isArray(mask)) return out;
    for (i = 0; i < cols * rows; i++) seen.push(0);
    for (y = 0; y < rows; y++) for (x = 0; x < cols; x++) {
        if (!mask[y * cols + x] || seen[y * cols + x]) continue;
        var list = [[x, y]], at = 0; seen[y * cols + x] = 1;
        while (at < list.length) {
            var c = list[at++];
            for (i = 0; i < 4; i++) { var nx = c[0] + N4[i][0], ny = c[1] + N4[i][1]; if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || !mask[ny * cols + nx] || seen[ny * cols + nx]) continue; seen[ny * cols + nx] = 1; list.push([nx, ny]); }
        }
        out.push(list);
    }
    return out;
}
// The cells a part closes in: those of its box that are not its own and that no walk by sides from outside the box reaches
function closedIn(list, cols, rows) {
    if (!Array.isArray(list)) return [];
    var x0 = cols, y0 = rows, x1 = -1, y1 = -1, i;
    for (i = 0; i < list.length; i++) { x0 = Math.min(x0, list[i][0]); x1 = Math.max(x1, list[i][0]); y0 = Math.min(y0, list[i][1]); y1 = Math.max(y1, list[i][1]); }
    var bw = x1 - x0 + 3, bh = y1 - y0 + 3, g = [], at = 0, q = [[0, 0]], out = [], x, y;   // the box, one cell wider each way: 0 free, 1 the part, 2 reached
    for (i = 0; i < bw * bh; i++) g.push(0);
    for (i = 0; i < list.length; i++) g[(list[i][1] - y0 + 1) * bw + (list[i][0] - x0 + 1)] = 1;
    g[0] = 2;
    while (at < q.length) {
        var c = q[at++];
        for (i = 0; i < 4; i++) { var nx = c[0] + N4[i][0], ny = c[1] + N4[i][1]; if (nx < 0 || ny < 0 || nx >= bw || ny >= bh || g[ny * bw + nx]) continue; g[ny * bw + nx] = 2; q.push([nx, ny]); }
    }
    for (y = 1; y < bh - 1; y++) for (x = 1; x < bw - 1; x++) if (!g[y * bw + x]) out.push([x + x0 - 1, y + y0 - 1]);
    return out;
}
// The outline of a part: its outer sides walked once round with the part on the right hand, as corners of the cells' lattice [i, j].
// The walk starts at the top left corner of the part's first cell in reading order, which only one side leaves, so the order of the
// list does not matter. A part that closes nothing in meets no corner twice, and genWorld hands over a part with what it closes in.
// A list that does (two of its cells meet at a corner only) is walked on the turn that keeps the part on the right, so the walk comes
// back through that corner later and the outline is one loop. A list of no cells has no outline
function outline(list, cols) {
    if (!Array.isArray(list)) return [];
    var inP = Object.create(null), out = Object.create(null), n = 0, i, first = null;
    for (i = 0; i < list.length; i++) inP[list[i][1] * cols + list[i][0]] = 1;
    var has = function(x, y) { return x >= 0 && x < cols && y >= 0 && inP[y * cols + x] === 1; };
    var put = function(ax, ay, bx, by) { var k = ax + ',' + ay; (out[k] || (out[k] = [])).push([bx, by]); n++; };
    for (i = 0; i < list.length; i++) {
        var x = list[i][0], y = list[i][1];
        if (first === null || y < first[1] || (y === first[1] && x < first[0])) first = [x, y];
        if (!has(x, y - 1)) put(x, y, x + 1, y);           // the top side, walked east: the cell lies to the right of the walk
        if (!has(x + 1, y)) put(x + 1, y, x + 1, y + 1);   // the east side, walked south
        if (!has(x, y + 1)) put(x + 1, y + 1, x, y + 1);   // the bottom side, walked west
        if (!has(x - 1, y)) put(x, y + 1, x, y);           // the west side, walked north
    }
    if (first === null) return [];
    var pts = [first], cur = first, dx = 0, dy = 0, guard = 0;
    while (guard++ <= n) {
        var opts = out[cur[0] + ',' + cur[1]]; if (!opts || !opts.length) break;
        var best = 0;
        if (opts.length > 1) {   // a corner the part touches twice: the side that turns right is the one that keeps hugging the part
            for (i = 0; i < opts.length; i++) { var ex = opts[i][0] - cur[0], ey = opts[i][1] - cur[1]; if (dx * ey - dy * ex > 0) best = i; }
        }
        var nx = opts[best]; opts.splice(best, 1);
        dx = nx[0] - cur[0]; dy = nx[1] - cur[1]; cur = nx;
        if (cur[0] === first[0] && cur[1] === first[1]) break;
        pts.push(cur);
    }
    return pts;
}

// Whether the i-th largest stretch of land goes as a scrap (i from 0): an island keeps its one largest stretch, the others every stretch
// of six cells or more. The largest always stays, and a scatter's second largest too, whatever its size, so that this rule never
// makes a scatter one land. Chance has not reached that last clause (a blob's own core is larger), so the suite runs this directly
function scrapGoes(i, size, land) { return i > 0 && (land === 'island' || (size < 6 && !(land === 'islands' && i === 1))); }

// An outline of more corners than a filled region takes loses every other corner until it fits. Chance does not reach this on the
// three boards, so it is a function of its own and the suite runs it directly
function thin(pts) {
    var p = Array.isArray(pts) ? pts : [];
    while (p.length > MAXPTS) p = p.filter(function(q, n) { return n % 2 === 0; });
    return p;
}

// What a stretch closes in and is painted before it becomes its own: for every kind (2 forest, 3 sand, 4 snow, 5 mountains), and until
// nothing changes, BEFORE any stretch is laid. So no stretch is laid that a later kind then covers whole. What is painted after a
// stretch stays, and lies over it; the sea (0) is never taken. A single cell of forest, sand or snow that the closing leaves takes the
// latest kind beside it: ground of its own kind beside it would be its stretch, and plain land beside it would have been closed in with
// it, so every side of it wears a later kind. That may close another ring, which is why the rule is asked again. Changes cls, and
// hands it back. Chance seldom needs the second turn, so it is a function of its own and the suite runs it directly
function closeIn(cls, cols, rows) {
    if (!Array.isArray(cls)) return [];
    var k, mask = function(kk) { return cls.map(function(v) { return v === kk ? 1 : 0; }); };
    for (var grew = true, turns = 0; grew && turns < 64; turns++) {
        grew = false;
        for (k = 2; k <= 5; k++) parts(mask(k), cols, rows).forEach(function(p) {
            closedIn(p, cols, rows).forEach(function(c) { var ci = c[1] * cols + c[0]; if (cls[ci] >= 1 && cls[ci] < k) { cls[ci] = k; grew = true; } });
        });
        for (k = 2; k <= 4; k++) parts(mask(k), cols, rows).forEach(function(p) {
            if (p.length !== 1) return;
            var best = 0; for (var q = 0; q < 4; q++) { var ax = p[0][0] + N4[q][0], ay = p[0][1] + N4[q][1]; if (ax >= 0 && ay >= 0 && ax < cols && ay < rows) best = Math.max(best, cls[ay * cols + ax]); }
            if (best > k) { cls[p[0][1] * cols + p[0][0]] = best; grew = true; }
        });
    }
    return cls;
}

// genWorld(settings) -> the plan: { kind: 'world', v, cols, rows, cell, w, h, layers: [{ kind, pts }], rivers: [[...points]],
// towns: [{ c, r, x, y, name? }], counts, cls }. `cls` is what each cell wears (0 sea, 1 land, 2 forest, 3 sand, 4 snow, 5 mountains),
// row by row, and a town's c and r are its cell
function genWorld(settings) {
    var o = cleanWorld(settings), rnd = rngOf(seedText(o)), cols = BOARD[o.size][0], rows = BOARD[o.size][1], N = cols * rows, x, y, i, k;
    var at = function(xx, yy) { return yy * cols + xx; }, inB = function(xx, yy) { return xx >= 0 && yy >= 0 && xx < cols && yy < rows; };
    var nShape = noiseOf(rnd, cols, rows, 4), nHigh = noiseOf(rnd, cols, rows, 3), nWood = noiseOf(rnd, cols, rows, 3), nDry = noiseOf(rnd, cols, rows, 4), nCold = noiseOf(rnd, cols, rows, 5);
    /* ---- which cells are land ---- */
    var land = [], blobs = [];
    for (i = 0; i < N; i++) land.push(0);
    if (o.land === 'island') blobs.push([cols / 2, rows / 2, cols * 0.4, rows * 0.4]);
    else if (o.land === 'islands') {   // the board in zones, two rows of two or three: three of them or more each get a blob of land, so the scatter fills the board
        var zx = o.size === 'small' ? 2 : 3, zy = 2, zones = [], zw = cols / zx, zh = rows / zy;
        for (y = 0; y < zy; y++) for (x = 0; x < zx; x++) zones.push([x, y]);
        for (i = zones.length - 1; i > 0; i--) { var zj = Math.floor(rnd() * (i + 1)), zt = zones[i]; zones[i] = zones[zj]; zones[zj] = zt; }
        var keep = 3 + Math.floor(rnd() * (zones.length - 2));
        for (i = 0; i < keep; i++) { var br = zw * (0.3 + rnd() * 0.14); blobs.push([(zones[i][0] + 0.32 + rnd() * 0.36) * zw, (zones[i][1] + 0.32 + rnd() * 0.36) * zh, br, Math.min(br, zh * 0.42)]); }
    }
    var side = Math.floor(rnd() * 4);   // a continent: the side of the board its land runs off (0 west, 1 east, 2 north, 3 south)
    for (y = 0; y < rows; y++) for (x = 0; x < cols; x++) {
        var nz = nShape(x, y), is = false;
        if (o.land === 'continent') {
            var t = side === 0 ? x / cols : side === 1 ? 1 - (x + 1) / cols : side === 2 ? y / rows : 1 - (y + 1) / rows;   // 0 at the land's side, 1 at the far one
            is = t < 0.6 + 0.42 * (nz - 0.5);   // land over three fifths of the board on average: a continent is mostly land
        } else {
            if (x === 0 || y === 0 || x === cols - 1 || y === rows - 1) is = false;   // sea all around
            else for (i = 0; i < blobs.length && !is; i++) { var ex = (x + 0.5 - blobs[i][0]) / blobs[i][2], ey = (y + 0.5 - blobs[i][1]) / blobs[i][3]; is = ex * ex + ey * ey < 0.35 + 0.95 * nz; }
        }
        land[at(x, y)] = is ? 1 : 0;
    }
    // tidy: a cell of land with one side on land at most is a speck, a cell of sea with three sides on land a notch
    var sides = function(xx, yy) { var s = 0; for (var q = 0; q < 4; q++) { var ax = xx + N4[q][0], ay = yy + N4[q][1]; if (inB(ax, ay) ? land[at(ax, ay)] : (o.land === 'continent' && edgeLand(ax, ay))) s++; } return s; };
    var edgeLand = function(ax, ay) { return side === 0 ? ax < 0 : side === 1 ? ax >= cols : side === 2 ? ay < 0 : ay >= rows; };   // beyond the continent's own side lies more land
    var tidy = function() {
        for (var t = 0; t < 2; t++) {
            var nextL = land.slice();
            for (var ty = 0; ty < rows; ty++) for (var tx = 0; tx < cols; tx++) { var sN = sides(tx, ty), brd = o.land !== 'continent' && (tx === 0 || ty === 0 || tx === cols - 1 || ty === rows - 1); if (land[at(tx, ty)] && sN <= 1) nextL[at(tx, ty)] = 0; else if (!land[at(tx, ty)] && sN >= 3 && !brd) nextL[at(tx, ty)] = 1; }
            land = nextL;
        }
    };
    // a lake goes: sea that no walk by sides from the board's edge reaches becomes land (a continent's sea is reached from its far side)
    var lakes = function() {
        parts(land.map(function(v) { return v ? 0 : 1; }), cols, rows).forEach(function(s) { var open = false; for (var q = 0; q < s.length && !open; q++) open = s[q][0] === 0 || s[q][1] === 0 || s[q][0] === cols - 1 || s[q][1] === rows - 1; if (!open) s.forEach(function(c) { land[at(c[0], c[1])] = 1; }); });
    };
    tidy(); lakes();
    var bySize = function() { return parts(land, cols, rows).sort(function(a, b) { return b.length - a.length; }); };
    var ps = bySize();
    // A scatter is two lands or more, counted AFTER the lakes are filled, since a filled lake can join two lands. Where its blobs ran
    // together into one, a strait one cell wide is cut along the zones' own borders and the land is tidied again: each blob's middle lies
    // well inside its zone, so every zone that had a blob keeps its land, and the strait reaches the board's edge, so no lake closes it
    if (o.land === 'islands' && ps.length < 2) {
        for (y = 0; y < rows; y++) for (x = 0; x < cols; x++) {
            var cut = y === Math.floor(zh);
            for (i = 1; i < zx && !cut; i++) cut = x === Math.floor(i * zw);
            if (cut) land[at(x, y)] = 0;
        }
        tidy(); lakes(); ps = bySize();
    }
    // small scraps go (scrapGoes). Land that goes leaves sea that the board's edge reaches, so no lake comes of it
    for (i = 1; i < ps.length; i++) if (scrapGoes(i, ps[i].length, o.land)) ps[i].forEach(function(c) { land[at(c[0], c[1])] = 0; });
    /* ---- how far each cell of land lies from the sea ---- */
    var dist = [], queue = [], head = 0, landN = 0;
    for (i = 0; i < N; i++) { dist.push(land[i] ? -1 : 0); if (land[i]) landN++; }
    for (y = 0; y < rows; y++) for (x = 0; x < cols; x++) {
        if (!land[at(x, y)]) continue;
        var shore = false; for (i = 0; i < 4; i++) { var sx = x + N4[i][0], sy = y + N4[i][1]; if (inB(sx, sy) && !land[at(sx, sy)]) shore = true; }
        if (shore) { dist[at(x, y)] = 1; queue.push([x, y]); }
    }
    while (head < queue.length) { var qc = queue[head++]; for (i = 0; i < 4; i++) { var qx = qc[0] + N4[i][0], qy = qc[1] + N4[i][1]; if (inB(qx, qy) && dist[at(qx, qy)] === -1) { dist[at(qx, qy)] = dist[at(qc[0], qc[1])] + 1; queue.push([qx, qy]); } } }
    for (i = 0; i < N; i++) if (dist[i] === -1) dist[i] = 1;   // land with no sea on the board at all: every cell counts as shore
    /* ---- what each cell of land wears: 1 land, 2 forest, 3 sand, 4 snow, 5 mountains ---- */
    var cls = land.map(function(v) { return v ? 1 : 0; }), high = [], cells = [];
    for (y = 0; y < rows; y++) for (x = 0; x < cols; x++) { high.push(land[at(x, y)] ? dist[at(x, y)] * 3 + 10 * nHigh(x, y) : -1); if (land[at(x, y)]) cells.push([x, y]); }
    // the first n of a list by a score, the highest first; a tie goes to the cell further north, then further west
    var top = function(list, score, n) { var s = list.slice().sort(function(a, b) { var d = score(b) - score(a); return d !== 0 ? d : (a[1] - b[1]) || (a[0] - b[0]); }); return s.slice(0, Math.max(0, Math.round(n))); };
    var PEAKS = { none: 0, few: 0.07, some: 0.14, many: 0.24 }, WOOD = { none: 0, few: 0.18, some: 0.36, many: 0.58 };   // the share of the land that is mountains, and of the rest that is forest
    top(cells.filter(function(c) { return dist[at(c[0], c[1])] >= 2; }), function(c) { return high[at(c[0], c[1])]; }, PEAKS[o.mountains] * cells.length).forEach(function(c) { cls[at(c[0], c[1])] = 5; });   // never on the shore itself
    var low = cells.filter(function(c) { return cls[at(c[0], c[1])] === 1; });
    top(low, function(c) { return nWood(c[0], c[1]); }, WOOD[o.forests] * low.length).forEach(function(c) { cls[at(c[0], c[1])] = 2; });
    cells.forEach(function(c) {   // a beach here and there on any shore, sand inland where it is dry, snow in the north where it is cold
        var ci = at(c[0], c[1]); if (cls[ci] === 5) return;
        var dryV = nDry(c[0], c[1]), wood = cls[ci] === 2;   // where it is dry, sand takes open land readily and a forest only where it is driest: Forests still says how wooded the world is
        if (dist[ci] === 1 && dryV > (o.climate === 'dry' ? (wood ? 0.75 : 0.35) : 0.62)) cls[ci] = 3;
        if (o.climate === 'dry' && dist[ci] >= 2 && dryV > (wood ? 0.75 : 0.5)) cls[ci] = 3;
        if (o.climate === 'cold' && (c[1] + 0.5) / rows < 0.34 + 0.3 * (nCold(c[0], c[1]) - 0.5)) cls[ci] = 4;
    });
    // a lone cell of forest, sand or snow is a speck and goes back to plain land (a lone peak stays)
    for (k = 2; k <= 4; k++) parts(cls.map(function(v) { return v === k ? 1 : 0; }), cols, rows).forEach(function(p) { if (p.length < 2) cls[at(p[0][0], p[0][1])] = 1; });
    /* ---- each stretch of a kind as one outline ---- */
    var jit = function(ci, cj, salt) { return (hash32(o.seed + '|' + ci + '|' + cj + '|' + salt) % (2 * JIT + 1)) - JIT; };
    var corner = function(ci, cj) {   // a corner of the cells' lattice, moved a little by chance: the same for every outline that passes it
        var px = ci * CELL + (ci === 0 || ci === cols ? 0 : jit(ci, cj, 'x')), py = cj * CELL + (cj === 0 || cj === rows ? 0 : jit(ci, cj, 'y'));
        return [px, py];
    };
    // what a stretch closes in and is painted before it becomes its own, BEFORE any stretch is laid (closeIn)
    closeIn(cls, cols, rows);
    var kindMask = function(kk) { return cls.map(function(v) { return kk === 1 ? (v >= 1 ? 1 : 0) : (v === kk ? 1 : 0); }); };
    var layers = [], counts = { land: 0, forest: 0, sand: 0, snow: 0, mountains: 0 };
    for (k = 1; k <= 5; k++) {
        var mp = parts(kindMask(k), cols, rows);
        for (i = 0; i < mp.length; i++) {
            var all = mp[i].concat(closedIn(mp[i], cols, rows)), ring = outline(all, cols).map(function(c) { return corner(c[0], c[1]); }), pts = [];
            for (var a = 0; a < ring.length; a++) {   // a corner on a straight run adds nothing (the board's own edge, where chance moves nothing)
                var p0 = ring[(a + ring.length - 1) % ring.length], p1 = ring[a], p2 = ring[(a + 1) % ring.length];
                if ((p1[0] - p0[0]) * (p2[1] - p1[1]) - (p1[1] - p0[1]) * (p2[0] - p1[0]) !== 0) pts.push(p1);
            }
            pts = thin(pts);   // never more corners than a filled region takes
            if (pts.length >= 3) { layers.push({ kind: KINDS[k - 1], pts: pts }); counts[KINDS[k - 1]]++; }
        }
    }
    /* ---- rivers: from high ground down to the sea ---- */
    var RIV = { none: 0, few: 2, some: 4, many: 6 }, rivN = Math.ceil(RIV[o.rivers] * (o.size === 'small' ? 0.5 : o.size === 'medium' ? 0.75 : 1)), rivers = [], wet = Object.create(null), mouths = [];
    var nFlow = noiseOf(rnd, cols, rows, 2), flow = function(cx, cy) { return dist[at(cx, cy)] * 1.5 + 9 * nFlow(cx, cy); };   // the ground a river reads: the sea's nearness and small valleys of chance, so it bends
    // a river's point in its cell: the middle, moved by chance 15 px at most inland and not at all in a shore cell, so that the coast's own move (34 px) never passes it
    var mid = function(cx, cy) { var mv = dist[at(cx, cy)] >= 2 ? 0.44 : 0; return [cx * CELL + CELL / 2 + Math.round(jit(cx, cy, 'rx') * mv), cy * CELL + CELL / 2 + Math.round(jit(cx, cy, 'ry') * mv)]; };
    var inland = cells.filter(function(c) { return dist[at(c[0], c[1])] >= 3; });
    if (!inland.length) inland = cells.filter(function(c) { return dist[at(c[0], c[1])] >= 2; });   // land too thin to hold a cell three from the sea: a river may rise two from it
    var springs = top(inland, function(c) { return high[at(c[0], c[1])]; }, inland.length), used = [];
    for (i = 0; i < springs.length && rivers.length < rivN; i++) {
        var s0 = springs[i], apart = true;
        for (k = 0; k < used.length; k++) if (Math.abs(used[k][0] - s0[0]) + Math.abs(used[k][1] - s0[1]) < 5) apart = false;
        if (!apart || wet[at(s0[0], s0[1])]) continue;
        var line = [mid(s0[0], s0[1])], cur = s0, steps = 0, mouth = null, mine = [at(s0[0], s0[1])], ends = false;
        while (steps++ < N) {
            var dHere = dist[at(cur[0], cur[1])], hHere = flow(cur[0], cur[1]), next = null, nextV = 0, sea = null;
            for (k = 0; k < 4; k++) {   // downhill is lower ground or nearer the sea: of those cells the lowest, and never one this river has been through
                var rx = cur[0] + N4[k][0], ry = cur[1] + N4[k][1]; if (!inB(rx, ry)) continue;
                if (!land[at(rx, ry)]) { if (!sea) sea = [rx, ry]; continue; }
                if (mine.indexOf(at(rx, ry)) >= 0) continue;
                var hv = flow(rx, ry); if ((hv < hHere || dist[at(rx, ry)] < dHere) && (next === null || hv < nextV)) { next = [rx, ry]; nextV = hv; }
            }
            if (sea) {   // out through the side it shares with the sea, at the middle of that side AS DRAWN: its two corners are the coast's own, moved as the coast is
                var across = sea[0] !== cur[0], sx0 = Math.max(cur[0], sea[0]), sy0 = Math.max(cur[1], sea[1]);
                var ca = across ? corner(sx0, cur[1]) : corner(cur[0], sy0), cb = across ? corner(sx0, cur[1] + 1) : corner(cur[0] + 1, sy0);
                line.push([Math.round((ca[0] + cb[0]) / 2), Math.round((ca[1] + cb[1]) / 2)]); mouth = cur; ends = true; break;
            }
            if (!next) break;   // closed in by its own bends: this one is not laid
            line.push(mid(next[0], next[1]));
            if (wet[at(next[0], next[1])]) { ends = true; break; }   // it joins a river that is there
            cur = next; mine.push(at(cur[0], cur[1]));
        }
        if (!ends || line.length < 3) continue;
        mine.forEach(function(ci) { wet[ci] = 1; }); used.push(s0); rivers.push(line); if (mouth) mouths.push(mouth);
    }
    /* ---- towns, only where asked for: at a river's mouth first, then along the shore, far from each other ---- */
    var towns = [];
    if (o.towns !== 'none') {
        var townN = o.size === 'small' ? 3 : o.size === 'medium' ? 5 : 7, gap = Math.max(3, Math.round(cols / 7)), shoreCells = cells.filter(function(c) { return dist[at(c[0], c[1])] === 1 && cls[at(c[0], c[1])] !== 5; }), spots = mouths.concat(top(shoreCells, function(c) { return hash32(o.seed + '|town|' + c[0] + '|' + c[1]); }, shoreCells.length));
        var names = Object.create(null);
        var NA = ['Har', 'Salt', 'East', 'West', 'Wind', 'Oak', 'Stone', 'Grey', 'Red', 'Mar', 'Fen', 'Dun', 'Ash', 'Wolf', 'King', 'Mill', 'North', 'Black', 'High', 'Fair', 'Elm', 'Rook', 'Thorn', 'Wyn'];
        var NB = ['mouth', 'by', 'wick', 'haven', 'ford', 'ton', 'stead', 'port', 'mere', 'holm', 'bridge', 'field', 'watch', 'gate', 'cross', 'well'];
        for (i = 0; i < spots.length && towns.length < townN; i++) {
            var sp = spots[i], okT = true;
            for (k = 0; k < towns.length; k++) if (Math.abs(towns[k].c - sp[0]) + Math.abs(towns[k].r - sp[1]) < gap) okT = false;
            if (!okT) continue;
            var town = { c: sp[0], r: sp[1], x: sp[0] * CELL + CELL / 2, y: sp[1] * CELL + CELL / 2 };
            if (o.towns === 'names') { var nm = '', nt = 0; do { nm = NA[Math.floor(rnd() * NA.length)] + NB[Math.floor(rnd() * NB.length)]; } while (names[nm] && nt++ < 40); names[nm] = 1; town.name = nm; }
            towns.push(town);
        }
    }
    return { kind: 'world', v: VERSION, cols: cols, rows: rows, cell: CELL, w: cols * CELL, h: rows * CELL, layers: layers, rivers: rivers, towns: towns, counts: counts, cls: cls };
}

// worldPieces(plan, ox, oy) -> { pieces, w, h }: the plan as geometry at a place, in the order it is laid: the sea, each stretch of land
// in the order of the kinds, the rivers, then the towns and their names. A plan handed in is read as data, within bounds: a board of
// whole numbers no larger than MAXSIDE each way, the first MAXLAYERS layers, MAXRIVERS rivers and MAXTOWNS towns, and every point ON
// the board. A piece with a number that is none, or a point off the board, is passed over whole, and nothing throws. Each value of the
// plan is read ONCE and judged as read. What is laid lies inside the box the answer says: a town's mark is held to the board, and its
// name stands on the mark's right, or on its left where the board ends first (`align` says which side the words hug)
function num(v) { return fin(v) ? v : null; }
function boardSide(v) { return fin(v) && Math.floor(v) === v && v >= 1 && v <= MAXSIDE ? v : null; }
function worldPieces(plan, ox, oy) {
    var out = { pieces: [], w: 0, h: 0 };
    if (!isObj(plan) || plan.kind !== 'world' || num(ox) === null || num(oy) === null || Math.abs(ox) > 100000 || Math.abs(oy) > 100000) return out;
    var w = boardSide(plan.w), h = boardSide(plan.h); if (w === null || h === null) return out;
    ox = Math.round(ox) || 0; oy = Math.round(oy) || 0; out.w = w; out.h = h;   // never a minus zero
    var onB = function(px, py) { return num(px) !== null && num(py) !== null && px >= 0 && py >= 0 && px <= w && py <= h; };
    var shift = function(pts, max) {
        if (!Array.isArray(pts) || pts.length > max) return null;
        var r = []; for (var n = 0; n < pts.length; n++) { var p = pts[n]; if (!Array.isArray(p)) return null; var px = p[0], py = p[1]; if (!onB(px, py)) return null; r.push([px + ox, py + oy]); }
        return r;
    };
    out.pieces.push({ kind: 'sea', geo: { x: ox, y: oy, w: w, h: h }, color: LAND_COLOR.sea, texture: LAND_TEXTURE.sea });
    var i, k, pl = plan.layers, pr = plan.rivers, pt = plan.towns, layers = Array.isArray(pl) ? pl : [], rivers = Array.isArray(pr) ? pr : [], towns = Array.isArray(pt) ? pt : [];
    var by = Object.create(null); for (k = 0; k < KINDS.length; k++) by[KINDS[k]] = [];
    for (i = 0; i < layers.length && i < MAXLAYERS; i++) {   // read once, laid kind by kind
        var lay = layers[i]; if (!isObj(lay)) continue;
        var kd = lay.kind, bucket = typeof kd === 'string' ? by[kd] : null; if (!bucket) continue;
        var pts = shift(lay.pts, 500), geo = pts ? polyItem(pts) : null; if (geo) bucket.push({ kind: kd, geo: geo, color: LAND_COLOR[kd], texture: LAND_TEXTURE[kd] });
    }
    for (k = 0; k < KINDS.length; k++) for (i = 0; i < by[KINDS[k]].length; i++) out.pieces.push(by[KINDS[k]][i]);
    for (i = 0; i < rivers.length && i < MAXRIVERS; i++) { var rp = shift(rivers[i], MAXRIVERPTS), rg = rp ? wallLine(rp) : null; if (rg) out.pieces.push({ kind: 'river', geo: rg, color: LAND_COLOR.river }); }
    for (i = 0; i < towns.length && i < MAXTOWNS; i++) {
        var t = towns[i]; if (!isObj(t)) continue;
        var tx = t.x, ty = t.y, nm = t.name; if (!onB(tx, ty) || w < 28 || h < 28) continue;
        var mx = Math.min(Math.max(Math.round(tx) - 14, 0), w - 28), my = Math.min(Math.max(Math.round(ty) - 14, 0), h - 28);
        out.pieces.push({ kind: 'town', geo: { x: mx + ox, y: my + oy, w: 28, h: 28 }, color: LAND_COLOR.town });
        if (typeof nm !== 'string' || !/^[A-Za-z]{1,24}$/.test(nm) || h < 32) continue;
        var right = mx + 34 + 170 <= w, left = mx - 6 - 170 >= 0; if (!right && !left) continue;   // a board too narrow for a name beside the mark
        out.pieces.push({ kind: 'name', geo: { x: (right ? mx + 34 : mx - 176) + ox, y: Math.min(Math.max(my - 2, 0), h - 32) + oy, w: 170, h: 32 }, text: nm, align: right ? 'left' : 'right' });
    }
    return out;
}

var API = { VERSION: VERSION, LANDS: LANDS, SIZES: SIZES, AMOUNTS: AMOUNTS, CLIMATES: CLIMATES, TOWNS: TOWNS, KINDS: KINDS, LAND_COLOR: LAND_COLOR, LAND_TEXTURE: LAND_TEXTURE, cleanWorld: cleanWorld, genWorld: genWorld, worldPieces: worldPieces, parts: parts, closedIn: closedIn, outline: outline, thin: thin, scrapGoes: scrapGoes, closeIn: closeIn };
if (typeof window !== 'undefined') window.wpWorldCore = API;
export { VERSION, LANDS, SIZES, AMOUNTS, CLIMATES, TOWNS, KINDS, LAND_COLOR, LAND_TEXTURE, cleanWorld, genWorld, worldPieces, parts, closedIn, outline, thin, scrapGoes, closeIn };

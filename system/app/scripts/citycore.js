/* Map builder (1.5.4, backlog item 23, fold B6) -- the city generator's pure half. One seed and five settings make one city, the same
   every time. No state, no DOM, no clock and no Math.random: the seed is the only source of chance. tools/buildcheck.js runs it under
   Node, and whiteboard.js (the dialog) imports it. Published as window.wpCityCore.

   The owner's answers (2026-10-11, by prompt, on the city sheet): a city map is for "Both, by a Size list": a VILLAGE at token scale, a
   TOWN and a CITY as an overview; a building is "A block" to a token (it blocks sight and stops tokens as a wall does); the dialog "As
   drawn" (Size, City wall: none, a wall with gates, a wall with towers; Water: none, a river, a coast; Roofs: mixed or one of the four
   roof patterns; Fields outside); a city is ORDINARY pieces, as a dungeon is.

   A village is planned on a board of cells, as a dungeon is: a main street two cells wide with one street across it and often a second that leaves it to one side, and houses
   as boxes of cells along them, each touching its street and nothing else. It is laid on the 50 px lattice whatever grid the map has.

   A town and a city are planned in pixels, with no lattice: a grid of wards whose corners are moved a little by chance, and the wards
   inside an oval are the city. A ward's houses are its own quarter cut into lots, with lanes between them and a street along every
   ward's edge. The city wall follows the edge of the kept wards and leaves a gate where a main road leaves the city. A river runs along
   one line of the wards' corners, so it flows where a street would, and a coast takes the last row of wards.

   Only +, -, * and / reach a number that is kept, never a sine or a root: a plan is the same on every machine. */
'use strict';

import { polyItem, wallLine } from './buildcore.js';

var VERSION = 1;
function isObj(v) { return v !== null && typeof v === 'object'; }
function fin(v) { return typeof v === 'number' && isFinite(v); }

var SIZES = Object.freeze(['village', 'town', 'city']), WALLS = Object.freeze(['none', 'gates', 'towers']), WATERS = Object.freeze(['none', 'river', 'coast']);
var ROOF_NAMES = Object.freeze(['shingles', 'pantiles', 'slates', 'thatch']), ROOFS = Object.freeze(['mixed'].concat(ROOF_NAMES));
var ROOF_COLOR = Object.freeze({ shingles: '#7a3f33', pantiles: '#a8552f', slates: '#4b5563', thatch: '#b59a55' });   // each roof's own colour, as the city sheet drew them
var SEED_RE = /^[A-Za-z0-9-]{1,24}$/, CELL = 50;
function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined; }
function pick(list, v, d) { return typeof v === 'string' && list.indexOf(v) >= 0 ? v : d; }
// The settings as the generator takes them, whatever is handed in: a seed of letters, digits and hyphens (24 at most; anything else the
// first seed), and one word for each list. Fields outside is on unless it is false itself. Read by own keys only
function cleanCity(v) {
    var o = isObj(v) ? v : {}, seed = own(o, 'seed');
    return { seed: typeof seed === 'string' && SEED_RE.test(seed) ? seed : '0000-fox', size: pick(SIZES, own(o, 'size'), 'town'), wall: pick(WALLS, own(o, 'wall'), 'gates'),
        water: pick(WATERS, own(o, 'water'), 'river'), roofs: pick(ROOFS, own(o, 'roofs'), 'mixed'), fields: own(o, 'fields') !== false };
}
// Chance from the seed alone, as the dungeon's: a 32-bit hash of the text (FNV-1a) feeds a small generator (mulberry32)
function hash32(s) { var h = 0x811c9dc5; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; }
function rngOf(text) {
    var a = hash32(text) || 1;
    return function() { a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function seedText(o) { return 'city|' + VERSION + '|' + o.seed + '|' + o.size + '|' + o.wall + '|' + o.water + '|' + o.roofs + '|' + (o.fields ? 'f' : '-'); }
// A house's roof: the one picked, or with Mixed mostly its neighbourhood's own and now and then another
function roofOf(o, rnd, main) { return o.roofs !== 'mixed' ? o.roofs : (rnd() < 0.72 ? main : ROOF_NAMES[Math.floor(rnd() * ROOF_NAMES.length)]); }

/* ---------- a village, on a board of cells ---------- */
// The village itself is V_COLS by V_ROWS cells. Fields outside add a margin around it, and a coast three rows of sea under it
var V_COLS = 30, V_ROWS = 22, V_MARGIN = 5, V_COAST = 3;
function genVillage(o, rnd) {
    var int = function(a, b) { return a + Math.floor(rnd() * (b - a + 1)); };
    var mg = o.fields ? V_MARGIN : 0, coast = o.water === 'coast', walled = o.wall !== 'none', a = walled ? 1 : 0;
    var L = mg, T = mg, R = L + V_COLS, Bm = T + V_ROWS, cols = R + mg, rows = Bm + (coast ? V_COAST : mg), occ = [], x, y, i;
    for (y = 0; y < rows; y++) { occ.push([]); for (x = 0; x < cols; x++) occ[y].push(0); }
    // what a cell holds: 0 nothing, 1 street, 2 house, 3 water, 4 field, 5 wall, 6 tower
    var mark = function(b, v) { for (var yy = b.r; yy < b.r + b.h; yy++) for (var xx = b.c; xx < b.c + b.w; xx++) occ[yy][xx] = v; };
    // a box and `pad` cells around it hold nothing. The box itself must lie on the board, and what is around it may lie off it
    var free = function(b, pad) {
        if (b.w < 1 || b.h < 1 || b.c < 0 || b.r < 0 || b.c + b.w > cols || b.r + b.h > rows) return false;
        for (var yy = b.r - pad; yy < b.r + b.h + pad; yy++) for (var xx = b.c - pad; xx < b.c + b.w + pad; xx++) if (yy >= 0 && xx >= 0 && yy < rows && xx < cols && occ[yy][xx]) return false;
        return true;
    };
    var plan = { kind: 'cells', cols: cols, rows: rows, streets: [], bridges: [], water: [], fields: [], buildings: [], walls: [], towers: [] };
    // water first: a coast is the rows under the village, a river two columns from top to bottom near one side
    if (coast) { var sea = { c: 0, r: Bm, w: cols, h: V_COAST }; plan.water.push(sea); mark(sea, 3); }
    var rc = -1;
    if (o.water === 'river') { rc = rnd() < 0.5 ? L + int(4, 6) : R - int(6, 8); var river = { c: rc, r: 0, w: 2, h: rows }; plan.water.push(river); mark(river, 3); }
    // the wall's ring, one cell thick around the village and open where the river runs, and a tower on each corner
    if (walled) {
        for (x = L; x < R; x++) { if (!occ[T][x]) occ[T][x] = 5; if (!occ[Bm - 1][x]) occ[Bm - 1][x] = 5; }
        for (y = T; y < Bm; y++) { if (!occ[y][L]) occ[y][L] = 5; if (!occ[y][R - 1]) occ[y][R - 1] = 5; }
        if (o.wall === 'towers') [[L, T], [R - 2, T], [L, Bm - 2], [R - 2, Bm - 2]].forEach(function(t) { var tb = { c: t[0], r: t[1], w: 2, h: 2 }; plan.towers.push(tb); mark(tb, 6); });
    }
    // the main street runs across the whole board, so it is the road out, and its two cells in the wall are a gate. A street over the
    // river is a bridge, a box of its own, with no water under it. One street crosses the main street, and often a second one leaves it to one side
    var r0 = T + 10 + int(-2, 2), c0 = L + 14 + int(-4, 4), sides = [];
    var cross = function(c, up) { return up ? { c: c, r: T + a, w: 2, h: r0 - T - a } : { c: c, r: r0 + 2, w: 2, h: Bm - a - r0 - 2 }; };
    sides.push(cross(c0, true), cross(c0, false));
    if (rnd() < 0.6) { var c1 = c0 + (c0 < L + 15 ? 9 : -9), up1 = rnd() < 0.5; if (!(rc >= 0 && Math.abs(c1 - rc) < 4)) sides.push(cross(c1, up1)); }
    if (rc >= 0) {
        plan.streets.push({ c: 0, r: r0, w: rc, h: 2 }, { c: rc + 2, r: r0, w: cols - rc - 2, h: 2 }); plan.bridges.push({ c: rc, r: r0, w: 2, h: 2 });
        // the river is cut where its bridge stands, a box above it and a box below: water is difficult terrain, and laid under the bridge it
        // made the one way across cost what wading costs (the highest cost on a cell is the cell's)
        plan.water.splice(plan.water.indexOf(river), 1, { c: rc, r: 0, w: 2, h: r0 }, { c: rc, r: r0 + 2, w: 2, h: rows - r0 - 2 });
    }
    else plan.streets.push({ c: 0, r: r0, w: cols, h: 2 });
    mark({ c: 0, r: r0, w: cols, h: 2 }, 1);
    sides.forEach(function(s) { plan.streets.push(s); mark(s, 1); });
    // houses along both sides of every street: a box that touches its street and, a cell around the rest of it, nothing at all
    var mainRoof = ROOF_NAMES[int(0, ROOF_NAMES.length - 1)], inL = L + a, inT = T + a, inR = R - a, inB = Bm - a;
    var along = function(s, flat) {
        [-1, 1].forEach(function(side) {
            var p = (flat ? s.c : s.r) + int(0, 1), end = flat ? s.c + s.w : s.r + s.h;
            while (p < end) {
                // a house two to four cells along its street and two or three deep. Where that one does not fit a smaller one is tried,
                // then the next cell on, and now and then a place that would take a house is left as a yard
                var len = int(2, 4), dep = int(2, 3), b = null;
                for (var n = len; n >= 2 && !b; n--) for (var d = dep; d >= 2 && !b; d--) {
                    var h = flat ? { c: p, r: side < 0 ? s.r - d : s.r + s.h, w: n, h: d } : { c: side < 0 ? s.c - d : s.c + s.w, r: p, w: d, h: n };
                    var rest = flat ? { c: h.c, r: side < 0 ? h.r : h.r + 1, w: h.w, h: h.h - 1 } : { c: side < 0 ? h.c : h.c + 1, r: h.r, w: h.w - 1, h: h.h };
                    if (h.c >= inL && h.r >= inT && h.c + h.w <= inR && h.r + h.h <= inB && free(h, 0) && free(rest, 1)) b = h;
                }
                if (!b) { p += 1; continue; }
                if (rnd() < 0.93) { b.roof = roofOf(o, rnd, mainRoof); plan.buildings.push(b); mark(b, 2); }
                p += (flat ? b.w : b.h) + int(1, 2);
            }
        });
    };
    along({ c: L, r: r0, w: V_COLS, h: 2 }, true);
    sides.forEach(function(s) { along(s, false); });
    // fields outside: boxes of grass in the margin, a cell clear of everything
    if (o.fields) for (i = 0; i < 40 && plan.fields.length < 8; i++) {
        var where = int(0, 3), len = int(4, 8), off = int(0, 1);
        var f = where === 0 ? { c: int(0, cols - len), r: off, w: len, h: 3 } : where === 1 ? { c: int(0, cols - len), r: Bm + 1 + off, w: len, h: 3 }
            : where === 2 ? { c: off, r: int(0, rows - len), w: 3, h: len } : { c: R + 1 + off, r: int(0, rows - len), w: 3, h: len };
        if (free(f, 1)) { plan.fields.push(f); mark(f, 4); }
    }
    // the wall as boxes: each run of ring cells that is still wall. The top and bottom rows take the corners
    if (walled) {
        var runs = function(n0, n1, at, flat) {
            var s0 = -1;
            for (var n = n0; n <= n1; n++) {
                var on = n < n1 && (flat ? occ[at][n] : occ[n][at]) === 5;
                if (on && s0 < 0) s0 = n;
                if (!on && s0 >= 0) { plan.walls.push(flat ? { c: s0, r: at, w: n - s0, h: 1 } : { c: at, r: s0, w: 1, h: n - s0 }); s0 = -1; }
            }
        };
        runs(L, R, T, true); runs(L, R, Bm - 1, true); runs(T + 1, Bm - 1, L, false); runs(T + 1, Bm - 1, R - 1, false);
    }
    return plan;
}

/* ---------- a town and a city, as an overview ---------- */
function lerp(p, q, t) { return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]; }
function quadAt(q, u, v) { return lerp(lerp(q[0], q[1], u), lerp(q[3], q[2], u), v); }   // a point of a quad by its two shares: q is top left, top right, bottom right, bottom left
function whole(p) { return [Math.round(p[0]), Math.round(p[1])]; }
// every cell reached from the starts through cells `ok` passes, by its key
function flood(starts, ok) {
    var seen = {}, st = starts.slice();
    while (st.length) { var c = st.pop(), k = c[0] + ',' + c[1]; if (seen[k] === 1 || !ok(c[0], c[1])) continue; seen[k] = 1; st.push([c[0] + 1, c[1]], [c[0] - 1, c[1]], [c[0], c[1] + 1], [c[0], c[1] - 1]); }
    return seen;
}
// A board of wards is a list of columns, each a list as long as the first; a place on it is two whole numbers
function boardOf(inn) {
    var nx = Array.isArray(inn) ? inn.length : 0, ny = nx && Array.isArray(inn[0]) ? inn[0].length : 0;
    if (!nx || !ny) return null;
    for (var i = 0; i < nx; i++) if (!Array.isArray(inn[i]) || inn[i].length !== ny) return null;
    return { nx: nx, ny: ny };
}
function wholeNum(n) { return typeof n === 'number' && n === Math.floor(n); }
// One city, with no hole in it: of a board of wards (inn[i][j], 1 for a kept one) the wards joined by a side to the middle one stay and
// the rest go, and a ward the kept ones close in is kept too. The board itself is changed and handed back
function oneCity(inn, mi, mj) {
    var bd = boardOf(inn), i, j; if (!bd) return inn;   // a board that is none is handed back as it is
    var nx = bd.nx, ny = bd.ny;
    var isIn = function(p, q) { return wholeNum(p) && wholeNum(q) && p >= 0 && q >= 0 && p < nx && q < ny && inn[p][q] === 1; };
    var joined = flood([[mi, mj]], isIn);
    for (i = 0; i < nx; i++) for (j = 0; j < ny; j++) inn[i][j] = joined[i + ',' + j] === 1 ? 1 : 0;
    var outside = flood([[-1, -1]], function(p, q) { return p >= -1 && q >= -1 && p <= nx && q <= ny && !isIn(p, q); });
    for (i = 0; i < nx; i++) for (j = 0; j < ny; j++) if (outside[i + ',' + j] !== 1) inn[i][j] = 1;
    return inn;
}
// The edge of the city: every side of a kept ward whose other side is not kept, as loops walked with the city on the right hand. A side
// says its two corners { a, b }, the way it faces and whether it is a gate. Four sides are gates, where a main road leaves: the outermost
// side of the middle column to the north and to the south, and of the middle row to the west and to the east
function cityEdge(inn, mi, mj) {
    var bd = boardOf(inn), i, j, k, edges = [], loops = []; if (!bd) return loops;
    var nx = bd.nx, ny = bd.ny;
    var isIn = function(p, q) { return wholeNum(p) && wholeNum(q) && p >= 0 && q >= 0 && p < nx && q < ny && inn[p][q] === 1; };
    var jt = -1, jb = -1, il = -1, ir = -1;
    var mid = wholeNum(mi) && wholeNum(mj);   // a middle that names no ward gives the edge with no gate
    for (j = 0; mid && j < ny; j++) if (isIn(mi, j)) { if (jt < 0) jt = j; jb = j; }
    for (i = 0; mid && i < nx; i++) if (isIn(i, mj)) { if (il < 0) il = i; ir = i; }
    var side = function(pa, pb, way, gate) { edges.push({ a: pa, b: pb, way: way, gate: gate, used: false }); };
    for (i = 0; i < nx; i++) for (j = 0; j < ny; j++) {
        if (!isIn(i, j)) continue;
        if (!isIn(i, j - 1)) side([i, j], [i + 1, j], 'n', i === mi && j === jt);
        if (!isIn(i + 1, j)) side([i + 1, j], [i + 1, j + 1], 'e', j === mj && i === ir);
        if (!isIn(i, j + 1)) side([i + 1, j + 1], [i, j + 1], 's', i === mi && j === jb);
        if (!isIn(i - 1, j)) side([i, j + 1], [i, j], 'w', j === mj && i === il);
    }
    var from = {}; edges.forEach(function(e) { var kk = e.a[0] + ',' + e.a[1]; (from[kk] = from[kk] || []).push(e); });
    edges.forEach(function(e0) {
        if (e0.used) return;
        var loop = [], e = e0;
        while (e) { e.used = true; loop.push({ a: e.a, b: e.b, way: e.way, gate: e.gate }); var nxt = from[e.b[0] + ',' + e.b[1]] || []; e = null; for (k = 0; k < nxt.length; k++) if (!nxt[k].used) { e = nxt[k]; break; } }
        loops.push(loop);
    });
    return loops;
}
var O_WARD = 230, O_MARGIN = 240, O_RIVER = 34, O_GATE = 24, O_ROAD = 14, O_TOWER = 15, O_TOWERS = 60;
function genOverview(o, rnd) {
    var big = o.size === 'city', nx = big ? 9 : 6, ny = big ? 7 : 5, B = O_WARD, M = O_MARGIN, W = nx * B + 2 * M, H = ny * B + 2 * M, i, j;
    var plan = { kind: 'free', w: W, h: H, streets: [], bridges: [], water: [], fields: [], buildings: [], walls: [], towers: [] };
    // the wards' corners, each moved a little by chance
    var G = [];
    for (i = 0; i <= nx; i++) { G.push([]); for (j = 0; j <= ny; j++) G[i].push([Math.round(M + i * B + (rnd() - 0.5) * B * 0.24), Math.round(M + j * B + (rnd() - 0.5) * B * 0.24)]); }
    // the wards inside an oval are the city, and a coast takes the last row
    var mi = Math.floor(nx / 2), mj = Math.floor(ny / 2), coast = o.water === 'coast', lastRow = coast ? ny - 1 : ny, inn = [];
    for (i = 0; i < nx; i++) { inn.push([]); for (j = 0; j < ny; j++) { var dx = (i + 0.5 - nx / 2) / (nx / 2), dy = (j + 0.5 - ny / 2) / (ny / 2), edge = 0.86 + (rnd() - 0.5) * 0.24; inn[i].push(j < lastRow && dx * dx + dy * dy < edge ? 1 : 0); } }
    inn[mi][mj] = 1;
    // the river runs along one line of corners, a ward off the middle. Where the city has a ward on one bank it has the ward across
    // the water too, so its edge never runs down the middle of the river
    var ri = o.water === 'river' ? mi + (rnd() < 0.5 ? -1 : 1) : -1, RW = O_RIVER;
    if (ri > 0) for (j = 0; j < ny; j++) if (inn[ri - 1][j] !== inn[ri][j]) inn[ri - 1][j] = inn[ri][j] = 1;
    oneCity(inn, mi, mj);
    var isIn = function(p, q) { return p >= 0 && q >= 0 && p < nx && q < ny && inn[p][q] === 1; };
    // the river itself, from the top of the board to its bottom, with a bridge where a street meets it and the city lies all around:
    // three at most, the first such crossing, the middle one and the last, so that no end of the city is left without one
    if (ri > 0) {
        var mid = [[G[ri][0][0], 0]]; for (j = 0; j <= ny; j++) mid.push(G[ri][j]); mid.push([G[ri][ny][0], H]);
        plan.water.push(mid.map(function(p) { return [p[0] - RW, p[1]]; }).concat(mid.slice().reverse().map(function(p) { return [p[0] + RW, p[1]]; })));
        var cross = []; for (j = 1; j < ny; j++) if (isIn(ri - 1, j - 1) && isIn(ri - 1, j) && isIn(ri, j - 1) && isIn(ri, j)) cross.push(j);
        if (cross.length > 3) cross = [cross[0], cross[Math.floor((cross.length - 1) / 2)], cross[cross.length - 1]];
        cross.forEach(function(jc) { var g = G[ri][jc]; plan.bridges.push([[g[0] - RW - 14, g[1] - 13], [g[0] + RW + 14, g[1] - 13], [g[0] + RW + 14, g[1] + 13], [g[0] - RW - 14, g[1] + 13]]); });
    }
    if (coast) { var shore = [[0, H], [0, G[0][lastRow][1] + 40]]; for (i = 0; i <= nx; i++) shore.push([G[i][lastRow][0], G[i][lastRow][1] + 40]); shore.push([W, G[nx][lastRow][1] + 40], [W, H]); plan.water.push(shore); }
    // the edge of the city, with its four gates
    var loops = cityEdge(inn, mi, mj);
    var pt = function(c) { return G[c[0]][c[1]]; };
    loops.forEach(function(loop) {
        plan.streets.push(loop.map(function(e) { return pt(e.a); }));   // the ground of the city: cobbles under everything
        if (o.wall === 'none') return;
        // the wall is the loop, open for a gate in the middle of each gate side, and it stops short of the water on both banks where
        // the river runs through a corner. The walk begins at a corner: where that is no opening its first and last runs are one
        var wet = function(c) { return ri > 0 && c[0] === ri; };
        var span = function(e) { var p = pt(e.a), q = pt(e.b); return Math.max(Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]), 1); };
        var gap = function(e, t) { return whole(lerp(pt(e.a), pt(e.b), 0.5 + t * O_GATE / Math.max(span(e), 4 * O_GATE))); };
        // a side that ends at a river corner runs ACROSS the river, whose banks lie RW to each side of the corner: the wall's end is measured
        // by the side's level run, so a side that leans still ends clear of the water
        var bank = function(e, t) { var p = pt(e.a), q = pt(e.b), d = Math.min((RW + 8) / Math.max(Math.abs(q[0] - p[0]), 1), 0.3); return whole(lerp(p, q, t > 0 ? d : 1 - d)); };
        var runs = [], run = [], shut = function() { if (run.length > 1) runs.push(run); run = []; };
        loop.forEach(function(e) {
            if (wet(e.a)) shut();
            if (!run.length) run.push(wet(e.a) ? bank(e, 1) : pt(e.a));
            if (e.gate) { run.push(gap(e, -1)); shut(); run.push(gap(e, 1)); }
            run.push(wet(e.b) ? bank(e, -1) : pt(e.b));
            if (wet(e.b)) shut();
        });
        if (run.length > 1) { if (runs.length && !wet(loop[0].a)) runs[0] = run.concat(runs[0].slice(1)); else runs.push(run); }
        runs.forEach(function(r) { plan.walls.push(r); });
        if (o.wall === 'towers') loop.forEach(function(e) { if (!wet(e.a) && plan.towers.length < O_TOWERS) plan.towers.push({ x: pt(e.a)[0], y: pt(e.a)[1], r: O_TOWER }); });
    });
    // a road from each gate straight out to the edge of the board, but for the one that faces the sea
    loops.forEach(function(loop) { loop.forEach(function(e) {
        if (!e.gate || (coast && e.way === 's')) return;
        var m = whole(lerp(pt(e.a), pt(e.b), 0.5)), r = O_ROAD;
        plan.streets.push(e.way === 'n' ? [[m[0] - r, 0], [m[0] + r, 0], [m[0] + r, m[1] + 4], [m[0] - r, m[1] + 4]] : e.way === 's' ? [[m[0] - r, m[1] - 4], [m[0] + r, m[1] - 4], [m[0] + r, H], [m[0] - r, H]]
            : e.way === 'w' ? [[0, m[1] - r], [m[0] + 4, m[1] - r], [m[0] + 4, m[1] + r], [0, m[1] + r]] : [[m[0] - 4, m[1] - r], [W, m[1] - r], [W, m[1] + r], [m[0] - 4, m[1] + r]]);
    }); });
    // the houses: every kept ward but the market in the middle, cut into lots with lanes between them. A ward beside the river keeps
    // clear of it. A ward that is not kept and touches the city may be a field, but for those a road out runs through
    for (i = 0; i < nx; i++) for (j = 0; j < ny; j++) {
        var q = [G[i][j], G[i + 1][j], G[i + 1][j + 1], G[i][j + 1]];
        if (!isIn(i, j)) {
            if (o.fields && j < lastRow && i !== mi && j !== mj && !(ri > 0 && (i === ri - 1 || i === ri)) && (isIn(i - 1, j) || isIn(i + 1, j) || isIn(i, j - 1) || isIn(i, j + 1)) && rnd() < 0.6)
                plan.fields.push([quadAt(q, 0.14, 0.14), quadAt(q, 0.86, 0.14), quadAt(q, 0.86, 0.86), quadAt(q, 0.14, 0.86)].map(whole));
            continue;
        }
        if (i === mi && j === mj) continue;   // the market square
        var l = ri > 0 && i === ri ? 0.28 : 0.07, r = ri > 0 && i === ri - 1 ? 0.72 : 0.93, na = 2 + Math.floor(rnd() * 2), nb = 2 + Math.floor(rnd() * 2), wardRoof = ROOF_NAMES[Math.floor(rnd() * ROOF_NAMES.length)], lane = 0.035;
        for (var u = 0; u < na; u++) for (var v = 0; v < nb; v++) {
            if (rnd() < 0.08) continue;   // a yard
            var u0 = l + (r - l) * (u / na) + lane, u1 = l + (r - l) * ((u + 1) / na) - lane, v0 = 0.07 + 0.86 * (v / nb) + lane, v1 = 0.07 + 0.86 * ((v + 1) / nb) - lane;
            var pts = [quadAt(q, u0, v0), quadAt(q, u1, v0), quadAt(q, u1, v1), quadAt(q, u0, v1)].map(whole);
            if (polyItem(pts)) plan.buildings.push({ pts: pts, roof: roofOf(o, rnd, wardRoof) });
        }
    }
    return plan;
}

// genCity(opts) -> the plan of one city, from the settings as cleanCity keeps them (plan.opts)
//   a village:  { kind: 'cells', cols, rows, and boxes { c, r, w, h } of cells: streets, bridges, water, fields, walls, towers, and buildings, each with its roof }
//   a town or a city:  { kind: 'free', w, h in pixels, and polygons [[x, y]]: streets, bridges, water, fields; walls: lines [[x, y]]; towers: { x, y, r }; buildings: { pts, roof } }
function genCity(opts) {
    var o = cleanCity(opts), rnd = rngOf(seedText(o)), plan = o.size === 'village' ? genVillage(o, rnd) : genOverview(o, rnd);
    plan.opts = o;
    return plan;
}

// cityPieces(plan, ox, oy) -> the plan as geometry with its top left corner at a place on the board, in the order it is laid (what lies
// under comes first):
//   { grounds: [{ kind: 'field' | 'street' | 'water' | 'bridge', geo }], buildings: [{ geo, roof, color }], walls: [{ geo, line }], towers: [{ geo }], w, h, count }
// geo is a box { type: 'rect', x, y, w, h }, a circle, a filled region (buildcore polyItem) or, for an overview's wall (line: true), the
// pen's line geometry (buildcore wallLine). The caller dresses each with a material's props and lays ordinary items. A village is seated
// on the 50 px lattice whatever place is handed in. A plan is read as data: a piece whose numbers are no numbers of a plan's own size is
// passed over whole, a size that is none is 0, a place far off the board gives nothing, and nothing throws
// What cityPieces takes of a plan: a place within P_FAR of the board's corner, a point within P_PLAN of the plan's own, a box of whole cells
var P_FAR = 100000, P_PLAN = 20000, P_CELLS = 400, P_TOWER = 1000;
function cityPieces(plan, ox, oy) {
    var out = { grounds: [], buildings: [], walls: [], towers: [], w: 0, h: 0, count: 0 };
    if (!isObj(plan) || !fin(ox) || !fin(oy) || Math.abs(ox) > P_FAR || Math.abs(oy) > P_FAR) return out;
    var cells = plan.kind === 'cells'; if (!cells && plan.kind !== 'free') return out;
    // a village is seated on its lattice of cells, at the lattice point nearest the place handed in; a town at the whole pixel nearest it
    var x0 = cells ? Math.round(ox / CELL) * CELL : Math.round(ox), y0 = cells ? Math.round(oy / CELL) * CELL : Math.round(oy), list = function(v) { return Array.isArray(v) ? v : []; };
    var near = function(v) { return fin(v) && Math.abs(v) <= P_PLAN; }, cell = function(v) { return fin(v) && v === Math.floor(v) && v >= 0 && v <= P_CELLS; };
    // a list of points at its place, or nothing where one of them is no pair of numbers of a plan's own size: a shape is laid whole or not at all
    var at = function(pts) {
        var o = []; if (!Array.isArray(pts)) return null;
        for (var i = 0; i < pts.length; i++) { var p = pts[i]; if (!Array.isArray(p) || !near(p[0]) || !near(p[1])) return null; o.push([x0 + p[0], y0 + p[1]]); }
        return o;
    };
    var box = function(b) { return isObj(b) && cell(b.c) && cell(b.r) && cell(b.w) && cell(b.h) && b.w >= 1 && b.h >= 1 ? { type: 'rect', x: x0 + b.c * CELL, y: y0 + b.r * CELL, w: b.w * CELL, h: b.h * CELL } : null; };
    var poly = function(pts) { var q = at(pts); return q ? polyItem(q) : null; }, line = function(pts) { var q = at(pts); return q ? wallLine(q) : null; };
    var ground = function(kind, v, make) { list(v).forEach(function(s) { var g = make(s); if (g) out.grounds.push({ kind: kind, geo: g }); }); };
    var make = cells ? box : poly, size = function(n, px) { return cells ? (cell(n) && n >= 1 ? n * CELL : 0) : (near(px) && px > 0 ? px : 0); };
    out.w = size(plan.cols, plan.w); out.h = size(plan.rows, plan.h);
    ground('field', plan.fields, make); ground('street', plan.streets, make); ground('water', plan.water, make); ground('bridge', plan.bridges, make);
    list(plan.buildings).forEach(function(b) { var g = isObj(b) ? (cells ? box(b) : poly(b.pts)) : null, roof = g && ROOF_NAMES.indexOf(b.roof) >= 0 ? b.roof : ROOF_NAMES[0]; if (g) out.buildings.push({ geo: g, roof: roof, color: ROOF_COLOR[roof] }); });
    list(plan.walls).forEach(function(L) { var g = cells ? box(L) : line(L); if (g) out.walls.push({ geo: g, line: !cells }); });
    list(plan.towers).forEach(function(t) { var g = cells ? box(t) : (isObj(t) && near(t.x) && near(t.y) && fin(t.r) && t.r > 0 && t.r <= P_TOWER ? { type: 'circle', x: x0 + t.x - t.r, y: y0 + t.y - t.r, w: t.r * 2, h: t.r * 2 } : null); if (g) out.towers.push({ geo: g }); });
    out.count = out.grounds.length + out.buildings.length + out.walls.length + out.towers.length;
    return out;
}

var API = { VERSION: VERSION, SIZES: SIZES, WALLS: WALLS, WATERS: WATERS, ROOFS: ROOFS, ROOF_NAMES: ROOF_NAMES, ROOF_COLOR: ROOF_COLOR, CELL: CELL, cleanCity: cleanCity, oneCity: oneCity, cityEdge: cityEdge, genCity: genCity, cityPieces: cityPieces };
if (typeof window !== 'undefined') window.wpCityCore = API;
export { VERSION, SIZES, WALLS, WATERS, ROOFS, ROOF_NAMES, ROOF_COLOR, CELL, cleanCity, oneCity, cityEdge, genCity, cityPieces };
export default API;

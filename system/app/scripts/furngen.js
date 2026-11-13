/* Furnishings laid by the generators (1.6.2, backlog 222, fold 5). The owner, 2026-11-13, by prompt: "Rooms + town square" (a dungeon's
   rooms, and a village, town or city's market square and streets; a world map gets nothing), "List, starts on A few" (Furnishings: None, A
   few, Furnished, the same seed giving the same furnishings), "A purpose per room" (store room, sleeping room, dining hall, study, workshop,
   shrine, along the walls with the middle and the doorways clear) and "Looks pack, else Waypoint" (the caller's to give). A generator picks
   furnishings by its own Theme, which names the same four eras.

   Pure: no state, no DOM, no clock and no chance of the page's own. What it lays is worked out from the plan the generator already made and from the
   seed, through a chance of its own, so a dungeon's or a city's plan, and every hash the suites pin of them, is exactly as before. It answers
   where each piece's middle stands on the board and how it is turned; the caller makes the piece as Build's Objects tab makes one. */
import { cellOf, cellCenter } from './fogcore.js';

var AMOUNTS = Object.freeze(['none', 'few', 'full']);
var WORDS = Object.freeze({ none: 'None', few: 'A few', full: 'Furnished' });
function cleanFurnish(v) { return typeof v === 'string' && AMOUNTS.indexOf(v) >= 0 ? v : 'few'; }
function fin(v) { return typeof v === 'number' && isFinite(v); }
function isObj(v) { return v !== null && typeof v === 'object'; }
// The kinds a generator may lay, with their cells across and down as Build's Objects tab draws them (furncore FURN_KINDS, held to it by furncheck)
var SIZE = Object.freeze({ chest: [1, 1], crate: [1, 1], barrel: [1, 1], cabinet: [1, 1], chair: [1, 1], bench: [2, 1], stool: [1, 1], sofa: [2, 1], bed: [1, 2], bedroll: [1, 2], table: [2, 1], desk: [2, 1], bookshelf: [2, 1], hearth: [2, 1], counter: [2, 1], workbench: [2, 1], light: [1, 1], plant: [1, 1], statue: [1, 1], sacks: [1, 1], rug: [2, 1] });
// Sets that belong together (the owner, by prompt: "Sets that belong together", "Lived-in"). A set is drawn against a wall it turns its back
// to: u runs along the wall, v into the room, and rel is how a piece is turned from facing into the room (0 its back to the wall, 180 facing
// the wall, as a chair at a desk does). A middle set stands in the room's middle, read the same way about its own first cell
function S(k, u, v, rel) { return Object.freeze({ k: k, u: u, v: v, rel: rel || 0 }); }
function SET(list) { return Object.freeze(list); }
// A room's purpose: the sets along its walls, in the order they are tried, and the set that may stand in its middle where the room is large
var PURPOSES = Object.freeze([
    Object.freeze({ id: 'store', name: 'Store room', sets: Object.freeze([SET([S('crate', 0, 0), S('crate', 1, 0), S('barrel', 0, 1)]), SET([S('barrel', 0, 0), S('barrel', 1, 0), S('sacks', 2, 0)]), SET([S('chest', 0, 0), S('cabinet', 1, 0)]), SET([S('sacks', 0, 0), S('sacks', 1, 0), S('crate', 0, 1)])]) }),
    Object.freeze({ id: 'sleep', name: 'Sleeping room', sets: Object.freeze([SET([S('bed', 0, 0), S('chest', 0, 2), S('light', 1, 0)]), SET([S('bed', 0, 0), S('chest', 0, 2)]), SET([S('cabinet', 0, 0), S('plant', 1, 0)]), SET([S('bedroll', 0, 0), S('sacks', 1, 0)])]) }),
    Object.freeze({ id: 'dining', name: 'Dining hall', sets: Object.freeze([SET([S('hearth', 0, 0), S('rug', 0, 1)]), SET([S('counter', 0, 0), S('barrel', 2, 0)]), SET([S('cabinet', 0, 0), S('light', 1, 0)]), SET([S('bench', 0, 0)])]),
        mid: SET([S('table', 0, 0), S('chair', 0, -1), S('chair', 1, -1), S('chair', 0, 1, 180), S('chair', 1, 1, 180)]) }),
    Object.freeze({ id: 'study', name: 'Study', sets: Object.freeze([SET([S('desk', 0, 0), S('chair', 0, 1, 180), S('bookshelf', 2, 0)]), SET([S('bookshelf', 0, 0), S('light', 2, 0)]), SET([S('cabinet', 0, 0), S('plant', 1, 0)]), SET([S('desk', 0, 0), S('chair', 1, 1, 180)])]),
        mid: SET([S('rug', 0, 0), S('chair', 0, -1), S('chair', 1, 1, 180)]) }),
    Object.freeze({ id: 'workshop', name: 'Workshop', sets: Object.freeze([SET([S('workbench', 0, 0), S('stool', 0, 1, 180), S('crate', 2, 0)]), SET([S('crate', 0, 0), S('crate', 1, 0), S('barrel', 0, 1)]), SET([S('workbench', 0, 0), S('stool', 1, 1, 180)]), SET([S('barrel', 0, 0), S('sacks', 1, 0), S('light', 2, 0)])]) }),
    Object.freeze({ id: 'shrine', name: 'Shrine', sets: Object.freeze([SET([S('light', 0, 0), S('statue', 1, 0), S('light', 2, 0)]), SET([S('plant', 0, 0), S('light', 1, 0)]), SET([S('bench', 0, 0)]), SET([S('plant', 0, 0)])]),
        mid: SET([S('bench', 0, 0, 180), S('bench', 0, 2, 180)]) })
]);
// A town's goods as they gather by a house wall, in twos and threes, the first against the wall and the rest beside it along the wall
var STREET_SETS = Object.freeze([SET(['barrel', 'barrel', 'crate']), SET(['crate', 'sacks']), SET(['bench']), SET(['barrel', 'crate', 'crate']), SET(['sacks', 'barrel']), SET(['bench', 'plant']), SET(['plant'])]);
var STALL_GOODS = Object.freeze(['crate', 'sacks', 'barrel', 'crate']);
function hash32(s) { var h = 0x811c9dc5; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; }
function rngOf(text) {   // mulberry32 from a text: the same text, the same run
    var a = hash32(text);
    return function() { a = (a + 0x6d2b79f5) | 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
var TOWN_STEP = 40, SET_TRIES = 600;

// roomPlan(dg, amount, hex) -> [{ k, c, r, fw, fh, rot, room, use, set, lead?, mid? }]: in the dungeon's own cells, each piece's footprint
// (fw by fh cells, its top left at c, r) and its turn: rot 0 its back to the top wall (a drawing's front is down the page), 180 the bottom,
// 90 the right and 270 the left, so its footprint is its cells turned. A room lays its purpose's sets (the owner: "Sets that belong
// together"): along a wall, corners first, each set whole or not at all, its first piece (lead) with its back to that wall; and in a room
// 5 by 5 or larger that is Furnished, its middle set first, with a ring of clear cells round it. A few lays one set; Furnished lays sets
// until half the room's wall cells are taken (the owner: "Lived-in"). The cell a doorway opens into, the cells beside it along the wall and
// the cell inward from it stay clear, and every cell no piece stands on stays one walk, so no set closes a doorway or a corner off.
// hex: the dungeon is laid on hexagons, where the cells of one column stack exactly and the next column stands half a row lower, so a
// piece two cells long lies only along a column there (a piece across two columns would stand half in one row and half in the next)
function roomPlan(dg, amount, hex) {
    var out = [], am = cleanFurnish(amount);
    if (am === 'none' || !isObj(dg) || !Array.isArray(dg.rooms) || !Array.isArray(dg.doors)) return out;
    var seed = isObj(dg.opts) && typeof dg.opts.seed === 'string' ? dg.opts.seed : '', rnd = rngOf('furn|rooms|' + seed + '|' + am), setN = 0;
    dg.rooms.slice(0, 400).forEach(function(R, n) {
        if (!isObj(R) || !fin(R.c) || !fin(R.r) || !fin(R.w) || !fin(R.h) || R.w < 1 || R.h < 1 || R.w > 60 || R.h > 60) return;
        var P = PURPOSES[Math.floor(rnd() * PURPOSES.length)], used = Object.create(null), k = function(c, r) { return c + ',' + r; };
        var inside = function(c, r) { return c >= R.c && r >= R.r && c < R.c + R.w && r < R.r + R.h; };
        var edge = function(c, r) { return c === R.c || r === R.r || c === R.c + R.w - 1 || r === R.r + R.h - 1; };
        dg.doors.forEach(function(D) {   // a doorway's way in stays clear
            if (!isObj(D) || !fin(D.c) || !fin(D.r) || !fin(D.dc) || !fin(D.dr)) return;
            var c = D.c + D.dc, r = D.r + D.dr; if (!inside(c, r)) return;
            used[k(c, r)] = 1; used[k(c + D.dc, r + D.dr)] = 1;
            if (D.dc) { used[k(c, r - 1)] = 1; used[k(c, r + 1)] = 1; } else { used[k(c - 1, r)] = 1; used[k(c + 1, r)] = 1; }
        });
        // The room stays one walk: every cell no piece stands on is reached from every other, so no piece, or two together, closes a doorway
        // or a corner off from the rest (the review of fold 5: a bed turned against a side wall reaches in, and with the next one shut a pocket)
        var occ = Object.create(null), whole = function() {
            var free = [], seen = Object.create(null), todo, got;
            for (var y = R.r; y < R.r + R.h; y++) for (var x = R.c; x < R.c + R.w; x++) if (!occ[k(x, y)]) free.push([x, y]);
            if (!free.length) return true;
            todo = [free[0]]; seen[k(free[0][0], free[0][1])] = 1; got = 1;
            while (todo.length) {
                var p = todo.pop();
                for (var d = 0; d < 4; d++) { var nx = p[0] + [1, -1, 0, 0][d], ny = p[1] + [0, 0, 1, -1][d], q = k(nx, ny); if (inside(nx, ny) && !occ[q] && !seen[q]) { seen[q] = 1; got++; todo.push([nx, ny]); } }
            }
            return got === free.length;
        };
        // A set's pieces in the room's cells, its frame at cell (oc, or) turned by d (0: u to the right and v down; each next d a quarter turn
        // clockwise), or null where a piece would leave the room, cross a cell already taken or kept clear, or lie across two hex columns
        var place = function(set, oc, or, d) {
            var ps = [], cells = Object.create(null);
            for (var i = 0; i < set.length; i++) {
                var s = set[i], sz = SIZE[s.k], tn = s.rel === 90 || s.rel === 270, fu = tn ? sz[1] : sz[0], fv = tn ? sz[0] : sz[1], c0 = Infinity, r0 = Infinity, c1 = -Infinity, r1 = -Infinity;
                for (var a = 0; a < fu; a++) for (var b = 0; b < fv; b++) {
                    var uu = s.u + a, vv = s.v + b, c = d === 0 ? oc + uu : d === 90 ? oc - vv : d === 180 ? oc - uu : oc + vv, r = d === 0 ? or + vv : d === 90 ? or + uu : d === 180 ? or - vv : or - uu, key = k(c, r);
                    if (!inside(c, r) || used[key] || cells[key]) return null;
                    cells[key] = 1; c0 = Math.min(c0, c); r0 = Math.min(r0, r); c1 = Math.max(c1, c); r1 = Math.max(r1, r);
                }
                if (hex && c1 > c0) return null;
                ps.push({ k: s.k, c: c0, r: r0, fw: c1 - c0 + 1, fh: r1 - r0 + 1, rot: (d + s.rel) % 360 });
            }
            Object.keys(cells).forEach(function(q) { occ[q] = 1; });
            if (!whole()) { Object.keys(cells).forEach(function(q) { delete occ[q]; }); return null; }
            Object.keys(cells).forEach(function(q) { used[q] = 1; });
            return ps;
        };
        var lay = function(ps, mid) { ps.forEach(function(p, i) { var e = { k: p.k, c: p.c, r: p.r, fw: p.fw, fh: p.fh, rot: p.rot, room: n, use: P.id, set: setN }; if (mid) e.mid = true; else if (!i) e.lead = true; out.push(e); }); setN++; };
        if (am === 'full' && P.mid && R.w >= 5 && R.h >= 5) {   // the middle set, turned along a column on hexagons, centered by its own size with a ring of clear cells round it
            var mps = null, u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
            P.mid.forEach(function(s) { var sz = SIZE[s.k], tn = s.rel === 90 || s.rel === 270; u0 = Math.min(u0, s.u); v0 = Math.min(v0, s.v); u1 = Math.max(u1, s.u + (tn ? sz[1] : sz[0]) - 1); v1 = Math.max(v1, s.v + (tn ? sz[0] : sz[1]) - 1); });
            [hex ? 90 : 0, hex ? 0 : 90].some(function(d) {
                var su = u1 - u0 + 1, sv = v1 - v0 + 1, wx = d === 90 ? sv : su, wy = d === 90 ? su : sv;
                if (R.w < wx + 2 || R.h < wy + 2) return false;   // a cell between it and every wall
                var oc = d === 90 ? R.c + Math.floor((R.w - wx) / 2) + v1 : R.c + Math.floor((R.w - wx) / 2) - u0, or = d === 90 ? R.r + Math.floor((R.h - wy) / 2) - u0 : R.r + Math.floor((R.h - wy) / 2) - v0;
                mps = place(P.mid, oc, or, d); return !!mps;
            });
            if (mps) {
                lay(mps, true);
                mps.forEach(function(p) { for (var y = p.r - 1; y <= p.r + p.fh; y++) for (var x = p.c - 1; x <= p.c + p.fw; x++) used[k(x, y)] = 1; });
            }
        }
        // The walls in the seed's order, and along each the places a set may start, the two corners first and then inward
        var walls = [0, 90, 180, 270], wallCells = 2 * (R.w + R.h) - 4;
        for (var i = walls.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)), sw = walls[i]; walls[i] = walls[j]; walls[j] = sw; }
        var spots = function(d, len) {   // the frame of a set against wall d, its first cell a cells from the wall's start (its left end, seen from the room)
            var L = d === 0 || d === 180 ? R.w : R.h, out2 = [], seen = Object.create(null);
            for (var a = 0; a <= Math.max(0, L - len); a++) { [a, L - len - a].forEach(function(x) { if (x >= 0 && x <= L - len && !seen[x]) { seen[x] = 1; out2.push(x); } }); }
            return out2.map(function(a2) { return d === 0 ? [R.c + a2, R.r] : d === 90 ? [R.c + R.w - 1, R.r + a2] : d === 180 ? [R.c + R.w - 1 - a2, R.r + R.h - 1] : [R.c, R.r + R.h - 1 - a2]; });
        };
        var wallTaken = function() { var t = 0; Object.keys(occ).forEach(function(q) { var p = q.split(','); if (edge(+p[0], +p[1])) t++; }); return t; };
        var goal = am === 'few' ? 1 : Infinity, sets = 0, tries = 0, si = Math.floor(rnd() * P.sets.length);
        for (var round = 0; sets < goal && round < P.sets.length * 2 && tries < SET_TRIES; round++) {
            if (am === 'full' && wallTaken() * 2 >= wallCells) break;
            var set = P.sets[(si + round) % P.sets.length], len = 0;
            set.forEach(function(s) { var sz = SIZE[s.k], tn = s.rel === 90 || s.rel === 270; len = Math.max(len, s.u + (tn ? sz[1] : sz[0])); });
            var done = false;
            for (var wi = 0; wi < walls.length && !done && tries < SET_TRIES; wi++) {
                var sp = spots(walls[wi], len);
                for (var q = 0; q < sp.length && !done && tries < SET_TRIES; q++) { tries++; var ps = place(set, sp[q][0], sp[q][1], walls[wi]); if (ps) { lay(ps, false); sets++; done = true; } }
            }
            if (done) walls.push(walls.shift());   // the next set starts on another wall, so a room's sets spread round it
        }
        // A room too small for a whole set, its doorways kept clear, takes one set's first piece alone, against a wall
        for (var one = 0; !sets && one < P.sets.length && tries < SET_TRIES * 2; one++) {
            var lone = SET([P.sets[(si + one) % P.sets.length][0]]), llen = SIZE[lone[0].k][0];
            for (var w2 = 0; w2 < walls.length && !sets; w2++) { var sp2 = spots(walls[w2], llen); for (var q2 = 0; q2 < sp2.length && !sets; q2++) { tries++; var ps2 = place(lone, sp2[q2][0], sp2[q2][1], walls[w2]); if (ps2) { lay(ps2, false); sets++; } } }
        }
    });
    return out;
}
// roomPieces(plan, grid, ox, oy) -> [{ k, x, y, rot }]: each piece's middle on the board, by the very lattice dungeonPieces lays the dungeon
// on, its top left corner in the cell that holds (ox, oy)
function roomPieces(plan, grid, ox, oy) {
    var out = []; if (!Array.isArray(plan) || !isObj(grid) || !fin(ox) || !fin(oy)) return out;
    var sq = grid.type === 'square' && fin(grid.size) && grid.size > 0, hex = grid.type === 'hex' && fin(grid.s) && grid.s > 0 && fin(grid.h) && grid.h > 0;
    if (!sq && !hex) return out;
    var o0 = cellOf(ox, oy, grid);
    plan.forEach(function(p) {
        if (!isObj(p) || !SIZE[p.k] || !fin(p.c) || !fin(p.r) || !fin(p.fw) || !fin(p.fh)) return;
        if (sq) { var s = grid.size; out.push({ k: p.k, x: (o0.c + p.c + p.fw / 2) * s, y: (o0.r + p.r + p.fh / 2) * s, rot: p.rot }); return; }
        var row0 = o0.r + Math.floor(o0.q / 2), sx = 0, sy = 0, n = 0;   // a column of the plan is a column of hexagons, as dungeonPieces has it
        for (var r = p.r; r < p.r + p.fh; r++) for (var c = p.c; c < p.c + p.fw; c++) { var q = o0.q + c, ce = cellCenter({ q: q, r: row0 + r - Math.floor(q / 2) }, grid); sx += ce.x; sy += ce.y; n++; }
        if (n) out.push({ k: p.k, x: sx / n, y: sy / n, rot: p.rot });
    });
    return out;
}

// What a town's open ground is, read from cityPieces' own pieces: a point inside a street that no house, water, bridge or field covers
function inGeo(g, x, y) {
    if (!isObj(g) || !fin(g.x) || !fin(g.y)) return false;
    if (g.type === 'rect') return x >= g.x && y >= g.y && x <= g.x + g.w && y <= g.y + g.h;
    if (g.type === 'circle') { var rx = g.w / 2, ry = g.h / 2, dx = (x - g.x - rx) / rx, dy = (y - g.y - ry) / ry; return dx * dx + dy * dy <= 1; }
    if (!Array.isArray(g.pts) || x < g.x || y < g.y || x > g.x + g.w || y > g.y + g.h) return false;
    var px = x - g.x, py = y - g.y, inn = false, P = g.pts;
    for (var i = 0, j = P.length - 1; i < P.length; j = i++) { var a = P[i], b = P[j]; if ((a[1] > py) !== (b[1] > py) && px < (b[0] - a[0]) * (py - a[1]) / (b[1] - a[1]) + a[0]) inn = !inn; }
    return inn;
}
function boxOf(g) { return isObj(g) && fin(g.x) && fin(g.y) && fin(g.w) && fin(g.h) ? [g.x, g.y, g.x + g.w, g.y + g.h] : null; }
// The distance from a point to the nearest side of a box: a house is judged by its box, which a town's lots are near enough
function gapTo(bx, x, y) { var dx = Math.max(bx[0] - x, 0, x - bx[2]), dy = Math.max(bx[1] - y, 0, y - bx[3]); return Math.sqrt(dx * dx + dy * dy); }
// Whether the segment a to b crosses or touches a box [x0, y0, x1, y1] (Liang and Barsky's clipping)
function segBox(ax, ay, bx, by, b) {
    var t0 = 0, t1 = 1, dx = bx - ax, dy = by - ay, P = [-dx, dx, -dy, dy], Q = [ax - b[0], b[2] - ax, ay - b[1], b[3] - ay];
    for (var i = 0; i < 4; i++) {
        if (P[i] === 0) { if (Q[i] < 0) return false; continue; }
        var t = Q[i] / P[i]; if (P[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
    }
    return true;
}
function boxesMeet(a, b) { return a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]; }
// townPieces(pc, amount, seed, cell, onCells) -> [{ k, x, y, rot, at }]: pieces on a town's open ground, at 'market' (the open ground near the
// middle farthest from any house: a statue, counters round it facing in with their goods behind them, lights at its corners) or 'street'
// (goods in twos and threes backed onto a house wall, lights where streets meet). cell: one cell of the map in board pixels, the
// size each piece is drawn at. onCells, only as true: a village, laid on its cells, where each piece fills whole cells. A piece is judged by
// its whole box as it will be drawn, turned: on open ground everywhere, over no house, wall or other piece (the review of fold 5)
function townPieces(pc, amount, seed, cell, onCells) {
    var out = [], am = cleanFurnish(amount); if (am === 'none' || !isObj(pc) || !Array.isArray(pc.grounds) || !Array.isArray(pc.buildings)) return out;
    var u = fin(cell) && cell >= 10 && cell <= 400 ? cell : 50, rnd = rngOf('furn|town|' + (typeof seed === 'string' ? seed : '') + '|' + am);
    var lat = onCells === true, step = lat ? u : TOWN_STEP;
    var streets = [], blocks = [], houses = [], segs = [];
    pc.grounds.slice(0, 4000).forEach(function(g) { if (!isObj(g) || !isObj(g.geo)) return; if (g.kind === 'street') streets.push(g.geo); else blocks.push(g.geo); });
    pc.buildings.slice(0, 4000).forEach(function(b) { var bx = isObj(b) ? boxOf(b.geo) : null; if (bx) { houses.push(bx); blocks.push(b.geo); } });
    (Array.isArray(pc.towers) ? pc.towers : []).forEach(function(t) { if (isObj(t) && isObj(t.geo)) { blocks.push(t.geo); var tb = boxOf(t.geo); if (tb) houses.push(tb); } });
    (Array.isArray(pc.walls) ? pc.walls : []).slice(0, 4000).forEach(function(w) {   // a village's wall is boxes, a town's the pen's line: a piece stays off both
        var g = isObj(w) && isObj(w.geo) ? w.geo : null; if (!g || !fin(g.x) || !fin(g.y)) return;
        if (w.line && Array.isArray(g.pts)) { for (var i = 1; i < g.pts.length && i < 2000; i++) { var a = g.pts[i - 1], b = g.pts[i]; if (Array.isArray(a) && Array.isArray(b) && fin(a[0]) && fin(a[1]) && fin(b[0]) && fin(b[1])) segs.push([g.x + a[0], g.y + a[1], g.x + b[0], g.y + b[1]]); } }
        else { blocks.push(g); var wb = boxOf(g); if (wb) houses.push(wb); }
    });
    if (!streets.length || !houses.length) return out;
    var X0 = Infinity, Y0 = Infinity, X1 = -Infinity, Y1 = -Infinity;
    streets.forEach(function(g) { var bx = boxOf(g); if (!bx) return; X0 = Math.min(X0, bx[0]); Y0 = Math.min(Y0, bx[1]); X1 = Math.max(X1, bx[2]); Y1 = Math.max(Y1, bx[3]); });
    if (!(X1 > X0) || !(Y1 > Y0) || (X1 - X0) * (Y1 - Y0) > 4e7) return out;
    var B = 200, FAR = 200, bucket = Object.create(null), keyOf = function(x, y) { return Math.floor(x / B) + ',' + Math.floor(y / B); };   // houses by where they stand, so a point asks only the near ones
    houses.forEach(function(h, i) { for (var bx = Math.floor((h[0] - FAR) / B); bx <= Math.floor((h[2] + FAR) / B); bx++) for (var by = Math.floor((h[1] - FAR) / B); by <= Math.floor((h[3] + FAR) / B); by++) (bucket[bx + ',' + by] = bucket[bx + ',' + by] || []).push(i); });
    var open = [];
    for (var y = Y0 + step / 2; y < Y1; y += step) for (var x = X0 + step / 2; x < X1; x += step) {
        if (!streets.some(function(g) { return inGeo(g, x, y); }) || blocks.some(function(g) { return inGeo(g, x, y); })) continue;
        var near = bucket[keyOf(x, y)] || [], gap = Infinity;
        near.forEach(function(i) { gap = Math.min(gap, gapTo(houses[i], x, y)); });
        if (gap < FAR) open.push({ x: x, y: y, gap: gap });   // ground no house stands near is the outskirts, never the square nor a street's edge
    }
    if (!open.length) return out;
    var placed = [], far = function(x, y, d) { return placed.every(function(p) { var dx = p.x - x, dy = p.y - y; return dx * dx + dy * dy >= d * d; }); };
    // Open ground: on a street, under no house, water, bridge, field, tower or wall
    var openAt = function(x, y) { return streets.some(function(g) { return inGeo(g, x, y); }) && !blocks.some(function(g) { return inGeo(g, x, y); }); };
    var boxes = [], WALL = 5;   // what is laid, as drawn; a town's wall line is 8 px wide
    var dims = function(k, rot) { var sz = SIZE[k], tn = rot === 90 || rot === 270; return [(tn ? sz[1] : sz[0]) * u, (tn ? sz[0] : sz[1]) * u]; };
    // Whether a piece of kind k, its middle at x, y and turned by rot, stands whole on open ground: a grid of points over its box open, no
    // house, tower or wall box under it, no wall line across it and no piece laid before it in its way
    var fits = function(k, x, y, rot) {
        var wh = dims(k, rot), w = wh[0], h = wh[1], b = [x - w / 2, y - h / 2, x + w / 2, y + h / 2], i = 1;
        var pts = []; for (var a = 0; a <= 8; a++) for (var c = 0; c <= 8; c++) pts.push([b[0] + i + (w - 2 * i) * a / 8, b[1] + i + (h - 2 * i) * c / 8]);   // a grid of points over the whole box, its edges inset a pixel
        if (!pts.every(function(p) { return openAt(p[0], p[1]); })) return false;
        if ((bucket[keyOf(x, y)] || []).some(function(j) { return boxesMeet(houses[j], b); })) return false;
        var wb = [b[0] - WALL, b[1] - WALL, b[2] + WALL, b[3] + WALL];
        if (segs.some(function(s) { return segBox(s[0], s[1], s[2], s[3], wb); })) return false;
        return !boxes.some(function(o) { return boxesMeet(o, b); });
    };
    // On a village's cells a piece's middle is put where the piece fills whole cells: a cell's middle for one cell, a cell edge for two
    var snap = function(v, cells, o) { return lat ? o + (Math.round((v - o) / u - cells / 2) + cells / 2) * u : v; };
    // One piece where it fits whole, its middle at x, y (snapped to a village's cells), or false
    var put = function(k, x, y, rot, at) {
        var wh = dims(k, rot), sx = snap(x, wh[0] / u, X0), sy = snap(y, wh[1] / u, Y0);
        if (!fits(k, sx, sy, rot)) return false;
        boxes.push([sx - wh[0] / 2, sy - wh[1] / 2, sx + wh[0] / 2, sy + wh[1] / 2]); placed.push({ x: sx, y: sy }); out.push({ k: k, x: sx, y: sy, rot: rot, at: at });
        return true;
    };
    // The square: of the open ground near the town's middle, the point farthest from any house, and what joins it there, a step at a time
    var cx = (X0 + X1) / 2, cy = (Y0 + Y1) / 2, d2 = function(a, x, y) { var dx = a.x - x, dy = a.y - y; return dx * dx + dy * dy; }, lim = Math.pow(Math.min(X1 - X0, Y1 - Y0) / 4, 2);
    var mid = open.filter(function(p) { return p.gap >= u * 1.4 && d2(p, cx, cy) <= lim; }).sort(function(a, b) { return b.gap - a.gap || d2(a, cx, cy) - d2(b, cx, cy) || a.y - b.y || a.x - b.x; })
        .filter(function(p) { return fits('statue', snap(p.x, 1, X0), snap(p.y, 1, Y0), 0); })[0] || null;   // where a statue stands whole: the ground farthest from a house may lie by the water
    var sq = Object.create(null), at = Object.create(null);
    open.forEach(function(p) { at[p.x + ',' + p.y] = p; });
    if (mid) {
        var todo = [mid]; sq[mid.x + ',' + mid.y] = 1;
        while (todo.length) {
            var q = todo.pop();
            [[step, 0], [-step, 0], [0, step], [0, -step]].forEach(function(d) {
                var k = (q.x + d[0]) + ',' + (q.y + d[1]), nb = at[k];
                if (nb && !sq[k] && nb.gap >= u * 0.5 && d2(nb, mid.x, mid.y) <= (u * 6) * (u * 6)) { sq[k] = 1; todo.push(nb); }
            });
        }
        // Stalls round the statue (the owner: "Stalls round the square"): a counter on each side facing in, its goods behind it, as near as
        // there is room; Furnished adds a light at each corner between them
        if (put('statue', mid.x, mid.y, 0, 'market')) { mid = placed[placed.length - 1]; }
        var sides = [[0, -1, 0], [0, 1, 180], [-1, 0, 270], [1, 0, 90]], first = Math.floor(rnd() * 2), stalls = 0, sWant0 = am === 'few' ? 2 : 4;
        if (first) sides = [sides[2], sides[3], sides[0], sides[1]];   // A few: a pair facing each other across the statue, the other pair where that pair finds no room
        sides.forEach(function(s, i) {
            if (stalls >= sWant0) return;
            for (var R2 = 2; R2 <= 5; R2 += 0.5) {
                var x = mid.x + s[0] * R2 * u, y = mid.y + s[1] * R2 * u;
                if (!put('counter', x, y, s[2], 'market')) continue;
                var c = placed[placed.length - 1]; put(STALL_GOODS[i % STALL_GOODS.length], c.x + s[0] * u, c.y + s[1] * u, s[2], 'market'); stalls++;
                break;
            }
        });
        if (am === 'full') [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function(s) { for (var R3 = 2.5; R3 <= 4.5; R3 += 0.5) if (put('light', mid.x + s[0] * R3 * u, mid.y + s[1] * R3 * u, 0, 'market')) break; });
    }
    // Along the streets, goods gather in twos and threes with their backs to a house wall, on the side of the house the street is on
    var street = open.filter(function(p) { return !sq[p.x + ',' + p.y] && p.gap >= u * 0.4 && p.gap <= u * 1.5; }), sWant = am === 'few' ? 3 : 9, n = 0, t;
    for (t = 0; n < sWant && t < sWant * 40 && street.length; t++) {
        var sp = street[Math.floor(rnd() * street.length)]; if (!far(sp.x, sp.y, u * 3)) continue;
        var hs = (bucket[keyOf(sp.x, sp.y)] || []).map(function(j) { return houses[j]; }).sort(function(a, b) { return gapTo(a, sp.x, sp.y) - gapTo(b, sp.x, sp.y); })[0];
        if (!hs) continue;
        var ddx = sp.x < hs[0] ? hs[0] - sp.x : sp.x > hs[2] ? sp.x - hs[2] : 0, ddy = sp.y < hs[1] ? hs[1] - sp.y : sp.y > hs[3] ? sp.y - hs[3] : 0, rot, ax, ay, ux, uy;
        if (ddy >= ddx) { rot = sp.y > hs[3] ? 0 : 180; ux = 1; uy = 0; ax = sp.x; }   // below the house its back is up, above it its back is down
        else { rot = sp.x > hs[2] ? 270 : 90; ux = 0; uy = 1; ay = sp.y; }
        var set = STREET_SETS[Math.floor(rnd() * STREET_SETS.length)], laid = 0, along = 0;
        for (var i = 0; i < set.length; i++) {
            var wh = dims(set[i], rot), gapPx = lat ? 0 : 1;
            if (rot === 0) ay = hs[3] + wh[1] / 2 + gapPx; else if (rot === 180) ay = hs[1] - wh[1] / 2 - gapPx; else if (rot === 270) ax = hs[2] + wh[0] / 2 + gapPx; else ax = hs[0] - wh[0] / 2 - gapPx;
            var off = i === 0 ? 0 : along + (ux ? wh[0] : wh[1]) / 2, px = (ux ? (i === 0 ? sp.x : sp.x + off) : ax), py = (uy ? (i === 0 ? sp.y : sp.y + off) : ay);
            if (put(set[i], px, py, rot, 'street')) { laid++; var last = placed[placed.length - 1]; if (i === 0) { sp = { x: last.x, y: last.y }; along = (ux ? wh[0] : wh[1]) / 2; } else along = off + (ux ? wh[0] : wh[1]) / 2; }
            else if (i === 0) break;
        }
        if (laid) n++;
    }
    // Lights where streets meet: open ground with a way on to three sides or four
    var lWant = am === 'few' ? 2 : 6, ln = 0;
    open.filter(function(p) { return !sq[p.x + ',' + p.y]; }).filter(function(p) { var d = 1.5 * u; return [[d, 0], [-d, 0], [0, d], [0, -d]].filter(function(o) { return openAt(p.x + o[0], p.y + o[1]); }).length >= 3; })
        .sort(function(a, b) { return hash32(String(seed) + '|' + a.x + ',' + a.y) - hash32(String(seed) + '|' + b.x + ',' + b.y); })
        .some(function(p) { if (ln >= lWant) return true; if (far(p.x, p.y, u * 5) && put('light', p.x, p.y, 0, 'street')) ln++; return false; });
    return out;
}

var API = { AMOUNTS: AMOUNTS, WORDS: WORDS, SIZE: SIZE, PURPOSES: PURPOSES, cleanFurnish: cleanFurnish, roomPlan: roomPlan, roomPieces: roomPieces, townPieces: townPieces, inGeo: inGeo };
if (typeof window !== 'undefined') window.wpFurnGen = API;
export { AMOUNTS, WORDS, SIZE, PURPOSES, cleanFurnish, roomPlan, roomPieces, townPieces, inGeo };

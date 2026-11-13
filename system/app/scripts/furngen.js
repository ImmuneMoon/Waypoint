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
// A room's purpose: what stands along its walls, in the order it is tried, and what may stand in its middle where the room is large
var PURPOSES = Object.freeze([
    Object.freeze({ id: 'store', name: 'Store room', edge: Object.freeze(['crate', 'barrel', 'sacks', 'crate', 'chest', 'cabinet', 'barrel', 'sacks']) }),
    Object.freeze({ id: 'sleep', name: 'Sleeping room', edge: Object.freeze(['bed', 'chest', 'bed', 'light', 'bedroll', 'cabinet', 'bed']) }),
    Object.freeze({ id: 'dining', name: 'Dining hall', edge: Object.freeze(['bench', 'hearth', 'counter', 'barrel', 'light', 'cabinet', 'bench']), mid: 'table' }),
    Object.freeze({ id: 'study', name: 'Study', edge: Object.freeze(['bookshelf', 'desk', 'light', 'bookshelf', 'cabinet', 'plant', 'chair']), mid: 'rug' }),
    Object.freeze({ id: 'workshop', name: 'Workshop', edge: Object.freeze(['workbench', 'crate', 'barrel', 'light', 'workbench', 'stool', 'sacks']) }),
    Object.freeze({ id: 'shrine', name: 'Shrine', edge: Object.freeze(['light', 'plant', 'bench', 'light', 'statue', 'plant']), mid: 'statue' })
]);
var MARKET = Object.freeze(['counter', 'crate', 'barrel', 'sacks', 'counter', 'bench', 'light', 'crate', 'plant', 'sacks']);
var STREET = Object.freeze(['barrel', 'crate', 'sacks', 'bench', 'light', 'barrel', 'plant', 'crate']);
function hash32(s) { var h = 0x811c9dc5; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; }
function rngOf(text) {   // mulberry32 from a text: the same text, the same run
    var a = hash32(text);
    return function() { a = (a + 0x6d2b79f5) | 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
var ROOM_MAX = 12, TOWN_STEP = 40;

// roomPlan(dg, amount) -> [{ k, c, r, fw, fh, rot, room, use }]: in the dungeon's own cells, each piece's footprint (fw by fh cells, its top
// left at c, r) and its turn. A piece stands against a wall, its back to it: rot 0 against the top wall (a drawing's front is down the page),
// 180 the bottom, 90 the right and 270 the left, so its footprint is its cells turned. The cell a doorway opens into, the cells beside it along
// the wall and the cell inward from it stay clear, and so does the middle, but for the one piece a large room's purpose puts there.
// hex: the dungeon is laid on hexagons, where the cells of one column stack exactly and the next column stands half a row lower, so a
// piece two cells long lies only along a column there (a piece across two columns would stand half in one row and half in the next)
function roomPlan(dg, amount, hex) {
    var out = [], am = cleanFurnish(amount);
    if (am === 'none' || !isObj(dg) || !Array.isArray(dg.rooms) || !Array.isArray(dg.doors)) return out;
    var seed = isObj(dg.opts) && typeof dg.opts.seed === 'string' ? dg.opts.seed : '', rnd = rngOf('furn|rooms|' + seed + '|' + am);
    dg.rooms.slice(0, 400).forEach(function(R, n) {
        if (!isObj(R) || !fin(R.c) || !fin(R.r) || !fin(R.w) || !fin(R.h) || R.w < 1 || R.h < 1 || R.w > 60 || R.h > 60) return;
        var P = PURPOSES[Math.floor(rnd() * PURPOSES.length)], used = Object.create(null), k = function(c, r) { return c + ',' + r; };
        var inside = function(c, r) { return c >= R.c && r >= R.r && c < R.c + R.w && r < R.r + R.h; };
        dg.doors.forEach(function(D) {   // a doorway's way in stays clear
            if (!isObj(D) || !fin(D.c) || !fin(D.r) || !fin(D.dc) || !fin(D.dr)) return;
            var c = D.c + D.dc, r = D.r + D.dr; if (!inside(c, r)) return;
            used[k(c, r)] = 1; used[k(c + D.dc, r + D.dr)] = 1;
            if (D.dc) { used[k(c, r - 1)] = 1; used[k(c, r + 1)] = 1; } else { used[k(c - 1, r)] = 1; used[k(c + 1, r)] = 1; }
        });
        var want = am === 'few' ? (rnd() < 0.75 ? 1 + Math.floor(rnd() * 2) : 0) : Math.min(ROOM_MAX, Math.max(2, Math.round((R.w + R.h) * 2 * 0.4)));
        var put = function(kind, c, r, fw, fh, rot) {
            for (var y = r; y < r + fh; y++) for (var x = c; x < c + fw; x++) if (!inside(x, y) || used[k(x, y)]) return false;
            for (y = r; y < r + fh; y++) for (x = c; x < c + fw; x++) used[k(x, y)] = 1;
            out.push({ k: kind, c: c, r: r, fw: fw, fh: fh, rot: rot, room: n, use: P.id });
            return true;
        };
        var laid = 0;
        if (am === 'full' && P.mid && R.w >= 5 && R.h >= 5) {   // the middle piece, with a ring of clear cells round it
            var s = SIZE[P.mid], mt = hex && s[0] > 1, mw = mt ? s[1] : s[0], mh = mt ? s[0] : s[1], mc = R.c + Math.floor((R.w - mw) / 2), mr = R.r + Math.floor((R.h - mh) / 2);
            if (put(P.mid, mc, mr, mw, mh, mt ? 90 : 0)) { laid++; for (var y2 = mr - 1; y2 <= mr + mh; y2++) for (var x2 = mc - 1; x2 <= mc + mw; x2++) used[k(x2, y2)] = 1; }
        }
        for (var t = 0; laid < want && t < want * 8; t++) {
            var kind = P.edge[(laid + t) % P.edge.length], sz = SIZE[kind], side = Math.floor(rnd() * 4), fw, fh, c, r, rot;
            if (side === 0) { rot = 0; fw = sz[0]; fh = sz[1]; r = R.r; c = R.c + Math.floor(rnd() * Math.max(1, R.w - fw + 1)); }
            else if (side === 1) { rot = 180; fw = sz[0]; fh = sz[1]; r = R.r + R.h - fh; c = R.c + Math.floor(rnd() * Math.max(1, R.w - fw + 1)); }
            else if (side === 2) { rot = 270; fw = sz[1]; fh = sz[0]; c = R.c; r = R.r + Math.floor(rnd() * Math.max(1, R.h - fh + 1)); }
            else { rot = 90; fw = sz[1]; fh = sz[0]; c = R.c + R.w - fw; r = R.r + Math.floor(rnd() * Math.max(1, R.h - fh + 1)); }
            if (fw >= R.w || fh >= R.h || (hex && fw > 1)) continue;   // a piece never spans a room, which would close it, nor two columns of hexagons
            if (put(kind, c, r, fw, fh, rot)) laid++;
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
// townPieces(pc, amount, seed, cell) -> [{ k, x, y, rot, at }]: pieces on a town's open ground, at 'market' (the open ground farthest from any
// house, a statue in its middle) or 'street' (beside a house front). cell: one cell of the map in board pixels, how far apart pieces stand
function townPieces(pc, amount, seed, cell) {
    var out = [], am = cleanFurnish(amount); if (am === 'none' || !isObj(pc) || !Array.isArray(pc.grounds) || !Array.isArray(pc.buildings)) return out;
    var u = fin(cell) && cell >= 10 && cell <= 400 ? cell : 50, rnd = rngOf('furn|town|' + (typeof seed === 'string' ? seed : '') + '|' + am);
    var streets = [], blocks = [], houses = [];
    pc.grounds.slice(0, 4000).forEach(function(g) { if (!isObj(g) || !isObj(g.geo)) return; if (g.kind === 'street') streets.push(g.geo); else blocks.push(g.geo); });
    pc.buildings.slice(0, 4000).forEach(function(b) { var bx = isObj(b) ? boxOf(b.geo) : null; if (bx) { houses.push(bx); blocks.push(b.geo); } });
    (Array.isArray(pc.towers) ? pc.towers : []).forEach(function(t) { if (isObj(t) && isObj(t.geo)) blocks.push(t.geo); });
    if (!streets.length || !houses.length) return out;
    var X0 = Infinity, Y0 = Infinity, X1 = -Infinity, Y1 = -Infinity;
    streets.forEach(function(g) { var bx = boxOf(g); if (!bx) return; X0 = Math.min(X0, bx[0]); Y0 = Math.min(Y0, bx[1]); X1 = Math.max(X1, bx[2]); Y1 = Math.max(Y1, bx[3]); });
    if (!(X1 > X0) || !(Y1 > Y0) || (X1 - X0) * (Y1 - Y0) > 4e7) return out;
    var B = 200, FAR = 200, bucket = Object.create(null), keyOf = function(x, y) { return Math.floor(x / B) + ',' + Math.floor(y / B); };   // houses by where they stand, so a point asks only the near ones
    houses.forEach(function(h, i) { for (var bx = Math.floor((h[0] - FAR) / B); bx <= Math.floor((h[2] + FAR) / B); bx++) for (var by = Math.floor((h[1] - FAR) / B); by <= Math.floor((h[3] + FAR) / B); by++) (bucket[bx + ',' + by] = bucket[bx + ',' + by] || []).push(i); });
    var open = [];
    for (var y = Y0 + TOWN_STEP / 2; y < Y1; y += TOWN_STEP) for (var x = X0 + TOWN_STEP / 2; x < X1; x += TOWN_STEP) {
        if (!streets.some(function(g) { return inGeo(g, x, y); }) || blocks.some(function(g) { return inGeo(g, x, y); })) continue;
        var near = bucket[keyOf(x, y)] || [], gap = Infinity;
        near.forEach(function(i) { gap = Math.min(gap, gapTo(houses[i], x, y)); });
        if (gap < FAR) open.push({ x: x, y: y, gap: gap });   // ground no house stands near is the outskirts, never the square nor a street's edge
    }
    if (!open.length) return out;
    var placed = [], far = function(x, y, d) { return placed.every(function(p) { var dx = p.x - x, dy = p.y - y; return dx * dx + dy * dy >= d * d; }); };
    // Open ground: on a street, under no house, water, bridge, field or tower
    var openAt = function(x, y) { return streets.some(function(g) { return inGeo(g, x, y); }) && !blocks.some(function(g) { return inGeo(g, x, y); }); };
    // A piece two cells long is laid only where both its cells are open ground, along or across as the seed says and else the other way
    var lay = function(k, p, at) {
        var sz = SIZE[k], rot = [0, 90, 180, 270][Math.floor(rnd() * 4)];
        if (k === 'light' || k === 'statue') rot = 0;
        if (sz[0] > 1 || sz[1] > 1) {
            var h = u / 2, ways = rnd() < 0.5 ? [0, 90] : [90, 0];
            rot = ways.filter(function(r) { var along = (r === 0) === (sz[0] > 1); return along ? openAt(p.x - h, p.y) && openAt(p.x + h, p.y) : openAt(p.x, p.y - h) && openAt(p.x, p.y + h); })[0];
            if (rot === undefined) return false;
        }
        placed.push({ x: p.x, y: p.y }); out.push({ k: k, x: p.x, y: p.y, rot: rot, at: at });
        return true;
    };
    // The square: the open ground nearest the town's middle that lies well clear of every house, and what joins it there, a step at a time
    var cx = (X0 + X1) / 2, cy = (Y0 + Y1) / 2, d2 = function(a, x, y) { var dx = a.x - x, dy = a.y - y; return dx * dx + dy * dy; };
    var mid = open.filter(function(p) { return p.gap >= u * 1.4; }).sort(function(a, b) { return d2(a, cx, cy) - d2(b, cx, cy) || a.y - b.y || a.x - b.x; })[0] || null;
    if (mid && d2(mid, cx, cy) > Math.pow(Math.min(X1 - X0, Y1 - Y0) / 4, 2)) mid = null;   // no wide ground near the middle: a place with no square
    var sq = Object.create(null), at = Object.create(null), mWant = am === 'few' ? 5 : 14, sWant = am === 'few' ? 6 : 16, n = 0, t;
    open.forEach(function(p) { at[p.x + ',' + p.y] = p; });
    if (mid) {
        var todo = [mid]; sq[mid.x + ',' + mid.y] = 1;
        while (todo.length) {
            var q = todo.pop();
            [[TOWN_STEP, 0], [-TOWN_STEP, 0], [0, TOWN_STEP], [0, -TOWN_STEP]].forEach(function(d) {
                var k = (q.x + d[0]) + ',' + (q.y + d[1]), nb = at[k];
                if (nb && !sq[k] && nb.gap >= u * 0.5 && d2(nb, mid.x, mid.y) <= (u * 6) * (u * 6)) { sq[k] = 1; todo.push(nb); }
            });
        }
        lay('statue', mid, 'market');
        var ring = open.filter(function(p) { return sq[p.x + ',' + p.y] && d2(p, mid.x, mid.y) >= (u * 1.2) * (u * 1.2); });
        for (t = 0; n < mWant && t < mWant * 12 && ring.length; t++) { var mp = ring[Math.floor(rnd() * ring.length)], mk = MARKET[n % MARKET.length]; if (far(mp.x, mp.y, u * 1.3) && lay(mk, mp, 'market')) n++; }
    }
    var street = open.filter(function(p) { return !sq[p.x + ',' + p.y] && p.gap >= u * 0.35 && p.gap <= u * 0.75; });
    for (n = 0, t = 0; n < sWant && t < sWant * 12 && street.length; t++) { var sp = street[Math.floor(rnd() * street.length)], sk = STREET[n % STREET.length]; if (far(sp.x, sp.y, u * 3) && lay(sk, sp, 'street')) n++; }
    return out;
}

var API = { AMOUNTS: AMOUNTS, WORDS: WORDS, SIZE: SIZE, PURPOSES: PURPOSES, cleanFurnish: cleanFurnish, roomPlan: roomPlan, roomPieces: roomPieces, townPieces: townPieces, inGeo: inGeo };
if (typeof window !== 'undefined') window.wpFurnGen = API;
export { AMOUNTS, WORDS, SIZE, PURPOSES, cleanFurnish, roomPlan, roomPieces, townPieces, inGeo };

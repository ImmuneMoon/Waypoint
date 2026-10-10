/* Map builder (1.5.4, backlog item 23, fold B2) -- the dungeon generator's pure half. One seed and five settings make one dungeon, the
   same every time: rooms, the corridors that join them, and where doors stand. No state, no DOM, no clock and no Math.random: the seed is
   the only source of chance. tools/buildcheck.js runs it under Node, and whiteboard.js (the dialog) imports it. Published as
   window.wpGenCore.

   The owner's answers (docs/MAP_BUILDER_PLAN.md and the two sheets of 2026-10-10): the dialog "As drawn" (Size, Rooms: Few / Some / Many,
   Corridors: Straight / Winding, Doors: None / Some / Most rooms, a Seed with New); a dungeon is ORDINARY pieces, floors, wall lines and
   door lines, with today's keys, so the fog, cover and movement read it as they read anything drawn; it is built on a square grid or a hex
   one (my call, since the owner's own maps are hex: "The dungeon follows that map's own grid").

   The plan. The dungeon is planned on a board of cells, cols by rows, on which every second cell each way is a NODE (the odd cells). A room
   covers a block of nodes and the cells between them, so its sides are an odd number of cells. No room comes nearer another than one free
   node, so solid ground always lies between two rooms. The corridors are a maze carved from node to node through every free node, then cut
   back from every dead end, so what is left only joins rooms. A room opens into a corridor through the one cell between its edge and the
   corridor's node: that cell is where a door may stand.

   On a hex grid the same plan is read with the cells as hexagons, a column of the plan a column of hexagons. A hexagon touches six cells
   where a square touches four, but two cells of the plan that are not next to each other across a side or a corner are never neighbours as
   hexagons, and solid ground lies a whole cell wide between a room and anything it is not opened to, so nothing joins that the plan keeps
   apart. That holds for two corridor cells too: two that lie corner to corner always have a corridor cell beside them both, but for two
   openings of one room at its corner, which is why a node of a room gives one opening at most. An opening may touch two or three cells of
   its room as a hexagon: its door runs along every side it shares with the room. */
'use strict';

import { cellOf, cellCenter, cellKey } from './fogcore.js';
import { outlineWalls, wallLine, hexCellBox } from './buildcore.js';

var VERSION = 1;
function isObj(v) { return v !== null && typeof v === 'object'; }
function fin(v) { return typeof v === 'number' && isFinite(v); }

var SIZE = Object.freeze({ min: 10, max: 60, w: 30, h: 20 });
var ROOMS = Object.freeze(['few', 'some', 'many']), CORRS = Object.freeze(['straight', 'winding']), DOORS = Object.freeze(['none', 'some', 'most']);
var SEED_RE = /^[A-Za-z0-9-]{1,24}$/;
var WORDS = Object.freeze(['fox', 'owl', 'oak', 'elm', 'ash', 'bay', 'fen', 'tor', 'gate', 'keep', 'moss', 'reed', 'salt', 'iron', 'flint', 'ember', 'raven', 'heron', 'thorn', 'brook', 'cairn', 'vault', 'spire', 'hollow', 'lantern', 'anvil', 'harbor', 'meadow', 'quarry', 'willow', 'copper', 'marble']);

// A seed as the dialog shows one, from a whole number the caller drew: four digits and a word, "4471-fox"
function seedOf(n) {
    var v = fin(n) ? Math.abs(Math.floor(n)) : 0;
    return String(v % 10000 + 10000).slice(1) + '-' + WORDS[Math.floor(v / 10000) % WORDS.length];
}
function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined; }
function whole(v, d) { return fin(v) ? Math.max(SIZE.min, Math.min(SIZE.max, Math.round(v))) : d; }
function pick(list, v, d) { return typeof v === 'string' && list.indexOf(v) >= 0 ? v : d; }
// The settings as the generator takes them, whatever is handed in: a seed of letters, digits and hyphens (24 at most; anything else the
// first seed), a size of 10 to 60 cells each way, and one word for each of the three lists. Read by own keys only
function cleanGen(v) {
    var o = isObj(v) ? v : {}, seed = own(o, 'seed');
    return { seed: typeof seed === 'string' && SEED_RE.test(seed) ? seed : '0000-fox', w: whole(own(o, 'w'), SIZE.w), h: whole(own(o, 'h'), SIZE.h),
        rooms: pick(ROOMS, own(o, 'rooms'), 'some'), corr: pick(CORRS, own(o, 'corr'), 'winding'), doors: pick(DOORS, own(o, 'doors'), 'most') };
}
// Chance from the seed alone: a 32-bit hash of the text (FNV-1a) feeds a small generator (mulberry32). The same text, the same numbers
function hash32(s) { var h = 0x811c9dc5; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; }
function rngOf(text) {
    var a = hash32(text) || 1;
    return function() { a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Of a board of cells (rows of numbers, 0 solid ground) the largest part that hangs together across the cells' sides stays, the first met
// of two as large, and every other cell becomes solid ground. The board is changed in place and handed back. It is the generator's net:
// what genDungeon makes hangs together as it is, and this keeps the promise that every cell can be walked to should a change break that
function keepLargest(cell) {
    var rows = Array.isArray(cell) ? cell.length : 0, cols = rows ? cell[0].length : 0, part = [], sizes = [0], best = 0, x, y, d, D4 = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    for (y = 0; y < rows; y++) { part.push([]); for (x = 0; x < cols; x++) part[y].push(0); }
    for (y = 0; y < rows; y++) for (x = 0; x < cols; x++) {
        if (!cell[y][x] || part[y][x]) continue;
        var id = sizes.length, count = 0, q = [[x, y]]; part[y][x] = id;
        while (q.length) { var cur = q.pop(); count++; for (d = 0; d < 4; d++) { var qx = cur[0] + D4[d][0], qy = cur[1] + D4[d][1]; if (qx >= 0 && qy >= 0 && qx < cols && qy < rows && cell[qy][qx] && !part[qy][qx]) { part[qy][qx] = id; q.push([qx, qy]); } } }
        sizes.push(count); if (count > sizes[best]) best = id;
    }
    for (y = 0; y < rows; y++) for (x = 0; x < cols; x++) if (part[y][x] !== best) cell[y][x] = 0;
    return cell;
}

// genDungeon(opts) -> { opts, cols, rows, rooms, cells, doors }
//   opts    the settings as cleanGen keeps them
//   rooms   [{ c, r, w, h }] in cells, each side odd, none nearer another than three cells
//   cells   [[c, r]] the corridors' cells, the openings among them, none inside a room, each once, by row and then by column
//   doors   [{ c, r, dc, dr, door }] an opening (one of `cells`) and the way to the room's cell it leads into; door: a door stands there
// Every cell of a room or a corridor can be walked to from every other, and no corridor ends anywhere but at a room
function genDungeon(opts) {
    var o = cleanGen(opts), rnd = rngOf([o.seed, o.w, o.h, o.rooms, o.corr, o.doors].join('|')), cols = o.w, rows = o.h, NX = Math.floor(cols / 2), NY = Math.floor(rows / 2);
    var ri = function(lo, hi) { return lo + Math.floor(rnd() * (hi - lo + 1)); };
    var roomAt = [], i, j, k;   // roomAt[j][i]: the room (its number + 1) a node belongs to, or 0
    for (j = 0; j < NY; j++) { roomAt.push([]); for (i = 0; i < NX; i++) roomAt[j].push(0); }
    // rooms: blocks of 2 to 4 nodes each way (never wider than about half the board), tried at random places; one is kept when no room
    // lies within a node of it. The share of the board the rooms may take (`cap`) is asked from the third room on
    var rooms = [], tries = Math.max(24, Math.round(NX * NY * (o.rooms === 'few' ? 0.25 : o.rooms === 'some' ? 0.7 : 2.2))), cap = o.rooms === 'few' ? 0.14 : o.rooms === 'some' ? 0.26 : 0.4, used = 0;
    var mw = Math.min(4, Math.max(2, Math.floor((NX - 1) / 2))), mh = Math.min(o.rooms === 'many' ? 3 : 4, Math.max(2, Math.floor((NY - 1) / 2)));
    for (k = 0; k < tries; k++) {
        var rw = ri(2, mw), rh = ri(2, mh), ni = ri(0, NX - 1), nj = ri(0, NY - 1);
        if (ni + rw > NX || nj + rh > NY || (rooms.length >= 2 && (used + rw * rh) / (NX * NY) > cap)) continue;
        var free = true;
        for (j = Math.max(0, nj - 1); j <= Math.min(NY - 1, nj + rh) && free; j++) for (i = Math.max(0, ni - 1); i <= Math.min(NX - 1, ni + rw) && free; i++) if (roomAt[j][i]) free = false;
        if (!free) continue;
        rooms.push({ ni: ni, nj: nj, rw: rw, rh: rh });
        for (j = nj; j < nj + rh; j++) for (i = ni; i < ni + rw; i++) roomAt[j][i] = rooms.length;
        used += rw * rh;
    }
    if (rooms.length < 2) {   // chance left one room or none: two small rooms in opposite corners, which fit the smallest board, and a way between
        for (j = 0; j < NY; j++) for (i = 0; i < NX; i++) roomAt[j][i] = 0;
        var lf = rnd() < 0.5;
        rooms = [{ ni: lf ? 0 : NX - 2, nj: 0, rw: 2, rh: 2 }, { ni: lf ? NX - 2 : 0, nj: NY - 2, rw: 2, rh: 2 }];
        rooms.forEach(function(R, n) { for (var b = R.nj; b < R.nj + 2; b++) for (var a = R.ni; a < R.ni + 2; a++) roomAt[b][a] = n + 1; });
    }
    // corridors: a maze through every free node, carved from node to node; `straight` keeps its way where it can. Solid ground a node wide
    // lies around every room and no room is wider than half the board, so the free nodes hang together and one maze reaches them all
    var keep = o.corr === 'straight' ? 0.9 : 0.25, seen = [], link = Object.create(null), DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    for (j = 0; j < NY; j++) { seen.push([]); for (i = 0; i < NX; i++) seen[j].push(false); }
    var order = []; for (j = 0; j < NY; j++) for (i = 0; i < NX; i++) if (!roomAt[j][i]) order.push([i, j]);
    for (k = order.length - 1; k > 0; k--) { var sw = ri(0, k), tmp = order[k]; order[k] = order[sw]; order[sw] = tmp; }
    for (k = 0; k < order.length; k++) {
        if (seen[order[k][1]][order[k][0]]) continue;
        var stack = [[order[k][0], order[k][1], -1]]; seen[order[k][1]][order[k][0]] = true;
        while (stack.length) {
            var top = stack[stack.length - 1], opts2 = [];
            for (var d = 0; d < 4; d++) { var xi = top[0] + DIRS[d][0], yj = top[1] + DIRS[d][1]; if (xi >= 0 && yj >= 0 && xi < NX && yj < NY && !roomAt[yj][xi] && !seen[yj][xi]) opts2.push(d); }
            if (!opts2.length) { stack.pop(); continue; }
            var go = opts2.indexOf(top[2]) >= 0 && rnd() < keep ? top[2] : opts2[ri(0, opts2.length - 1)], nx2 = top[0] + DIRS[go][0], ny2 = top[1] + DIRS[go][1];
            seen[ny2][nx2] = true;
            link[(2 * top[0] + 1 + DIRS[go][0]) + ',' + (2 * top[1] + 1 + DIRS[go][1])] = 1;   // the cell between the two nodes
            stack.push([nx2, ny2, go]);
        }
    }
    // openings: an edge node of a room and the way out of it, [i, j, dx, dy], wherever the board goes on past the room: the node beyond is
    // free, since no room comes nearer another than a node. Each room takes one to three of them, and a node gives one at most: two
    // openings that leave a corner node, one to the side and one down, lie corner to corner, and as hexagons they would touch
    var opens = [];
    rooms.forEach(function(R) {
        var list = [], a, b;
        for (a = 0; a < R.rw; a++) { if (R.nj > 0) list.push([R.ni + a, R.nj, 0, -1]); if (R.nj + R.rh < NY) list.push([R.ni + a, R.nj + R.rh - 1, 0, 1]); }
        for (b = 0; b < R.rh; b++) { if (R.ni > 0) list.push([R.ni, R.nj + b, -1, 0]); if (R.ni + R.rw < NX) list.push([R.ni + R.rw - 1, R.nj + b, 1, 0]); }
        var want = 1 + (rnd() < 0.55 ? 1 : 0) + (R.rw * R.rh >= 9 && rnd() < 0.5 ? 1 : 0);
        for (var t = 0; t < want && list.length; t++) {
            var pk = list.splice(ri(0, list.length - 1), 1)[0]; opens.push(pk);
            list = list.filter(function(c) { return c[0] !== pk[0] || c[1] !== pk[1]; });
        }
    });
    // the board of cells: 1 a room's cell, 2 a corridor's cell (a node, the cell between two nodes, an opening)
    var cell = [], x, y;
    for (y = 0; y < rows; y++) { cell.push([]); for (x = 0; x < cols; x++) cell[y].push(0); }
    rooms.forEach(function(R) { for (var yy = 2 * R.nj + 1; yy <= 2 * (R.nj + R.rh - 1) + 1; yy++) for (var xx = 2 * R.ni + 1; xx <= 2 * (R.ni + R.rw - 1) + 1; xx++) cell[yy][xx] = 1; });
    for (j = 0; j < NY; j++) for (i = 0; i < NX; i++) if (!roomAt[j][i] && seen[j][i]) cell[2 * j + 1][2 * i + 1] = 2;
    Object.keys(link).forEach(function(key) { var p = key.split(','); cell[+p[1]][+p[0]] = 2; });
    var doorAt = Object.create(null);
    opens.forEach(function(c) { var ox = 2 * c[0] + 1 + c[2], oy = 2 * c[1] + 1 + c[3]; cell[oy][ox] = 2; doorAt[ox + ',' + oy] = { c: ox, r: oy, dc: -c[2], dr: -c[3] }; });
    // cut back from every dead end: a corridor's cell with fewer than two ways on goes, until none is left
    var at = function(cx, cy) { return cx >= 0 && cy >= 0 && cx < cols && cy < rows ? cell[cy][cx] : 0; };
    var ways = function(cx, cy) { return (at(cx + 1, cy) ? 1 : 0) + (at(cx - 1, cy) ? 1 : 0) + (at(cx, cy + 1) ? 1 : 0) + (at(cx, cy - 1) ? 1 : 0); };
    var ends = [];
    for (y = 0; y < rows; y++) for (x = 0; x < cols; x++) if (cell[y][x] === 2 && ways(x, y) < 2) ends.push([x, y]);
    while (ends.length) {
        var e = ends.pop(); if (ways(e[0], e[1]) >= 2) continue;
        cell[e[1]][e[0]] = 0;
        for (d = 0; d < 4; d++) { var ex = e[0] + DIRS[d][0], ey = e[1] + DIRS[d][1]; if (at(ex, ey) === 2 && ways(ex, ey) < 2) ends.push([ex, ey]); }
    }
    keepLargest(cell);   // the net: what was made hangs together as it is
    var outRooms = [], outCells = [], outDoors = [], pDoor = o.doors === 'none' ? 0 : o.doors === 'some' ? 0.5 : 0.9;
    rooms.forEach(function(R) { if (cell[2 * R.nj + 1][2 * R.ni + 1]) outRooms.push({ c: 2 * R.ni + 1, r: 2 * R.nj + 1, w: 2 * R.rw - 1, h: 2 * R.rh - 1 }); });
    for (y = 0; y < rows; y++) for (x = 0; x < cols; x++) if (cell[y][x] === 2) {
        outCells.push([x, y]);
        var dr = doorAt[x + ',' + y]; if (dr) outDoors.push({ c: dr.c, r: dr.r, dc: dr.dc, dr: dr.dr, door: rnd() < pDoor });
    }
    return { opts: o, cols: cols, rows: rows, rooms: outRooms, cells: outCells, doors: outDoors };
}

// The corridors' cells as few boxes: a run of two or more along a row first, then what is left as runs down a column. [{ c, r, w, h }]
function strips(cells) {
    var left = Object.create(null), out = [], i;
    for (i = 0; i < cells.length; i++) left[cells[i][0] + ',' + cells[i][1]] = 1;
    for (i = 0; i < cells.length; i++) {   // rows first (the list is by row, then column)
        var c = cells[i][0], r = cells[i][1]; if (!left[c + ',' + r] || left[(c - 1) + ',' + r]) continue;
        var w = 1; while (left[(c + w) + ',' + r]) w++;
        if (w < 2) continue;
        for (var a = 0; a < w; a++) delete left[(c + a) + ',' + r];
        out.push({ c: c, r: r, w: w, h: 1 });
    }
    for (i = 0; i < cells.length; i++) {
        var c2 = cells[i][0], r2 = cells[i][1]; if (!left[c2 + ',' + r2] || left[c2 + ',' + (r2 - 1)]) continue;
        var h = 1; while (left[c2 + ',' + (r2 + h)]) h++;
        for (var b = 0; b < h; b++) delete left[c2 + ',' + (r2 + b)];
        out.push({ c: c2, r: r2, w: 1, h: h });
    }
    return out;
}
// dungeonPieces(dg, grid, ox, oy) -> { floors, doors, walls, count }: the dungeon as geometry on a map's lattice, its top left corner in the
// cell that holds the board point (ox, oy). grid: a square or a hex lattice as fogcore builds them (no grid: the caller passes the 50 px
// square lattice). floors: [{ type: 'rect' | 'hexagon', x, y, w, h }]: on squares a box a room and a box a run of corridor, on hexagons one
// hexagon a cell. walls and doors: the pen's line geometry (buildcore wallLine), the walls along the outer edge of all the floors together
// (buildcore outlineWalls), a door along every side an opening shares with its room. count: how many pieces that is
function dungeonPieces(dg, grid, ox, oy) {
    var out = { floors: [], doors: [], walls: [], count: 0 };
    if (!isObj(dg) || !Array.isArray(dg.rooms) || !Array.isArray(dg.cells) || !Array.isArray(dg.doors) || !isObj(grid) || !fin(ox) || !fin(oy)) return out;
    var sq = grid.type === 'square', hex = grid.type === 'hex'; if (!(sq && fin(grid.size) && grid.size > 0) && !(hex && fin(grid.s) && grid.s > 0 && fin(grid.h) && grid.h > 0)) return out;
    var o0 = cellOf(ox, oy, grid), i;
    if (sq) {
        var s = grid.size, bx = function(b) { return { type: 'rect', x: (o0.c + b.c) * s, y: (o0.r + b.r) * s, w: b.w * s, h: b.h * s }; };
        dg.rooms.forEach(function(R) { out.floors.push(bx(R)); });
        strips(dg.cells).forEach(function(S) { out.floors.push(bx(S)); });
        dg.doors.forEach(function(D) {
            if (!D.door) return;
            var cx = (o0.c + D.c) * s, cy = (o0.r + D.r) * s, ln = D.dc ? wallLine([[cx + (D.dc > 0 ? s : 0), cy], [cx + (D.dc > 0 ? s : 0), cy + s]]) : wallLine([[cx, cy + (D.dr > 0 ? s : 0)], [cx + s, cy + (D.dr > 0 ? s : 0)]]);
            if (ln) out.doors.push(ln);
        });
    } else {
        // a column of the plan is a column of hexagons; a row of the plan is the hexagons' own row across the columns
        var row0 = o0.r + Math.floor(o0.q / 2), hexOf = function(c, r) { var q = o0.q + c; return { q: q, r: row0 + r - Math.floor(q / 2) }; };
        var inRoom = Object.create(null), put = function(c, r) { var hb = hexCellBox(grid, hexOf(c, r)); if (hb) out.floors.push({ type: 'hexagon', x: hb.x, y: hb.y, w: hb.w, h: hb.h }); };
        dg.rooms.forEach(function(R) { for (var r = R.r; r < R.r + R.h; r++) for (var c = R.c; c < R.c + R.w; c++) { put(c, r); inRoom[cellKey(hexOf(c, r), grid)] = 1; } });
        dg.cells.forEach(function(C) { put(C[0], C[1]); });
        var hs = grid.s, hh = grid.h / 2;
        dg.doors.forEach(function(D) {
            if (!D.door) return;
            var p = cellCenter(hexOf(D.c, D.r), grid), vs = [[p.x - hs, p.y], [p.x - hs / 2, p.y - hh], [p.x + hs / 2, p.y - hh], [p.x + hs, p.y], [p.x + hs / 2, p.y + hh], [p.x - hs / 2, p.y + hh]], on = [];
            for (var k = 0; k < 6; k++) { var a = vs[k], b = vs[(k + 1) % 6]; on.push(!!inRoom[cellKey(cellOf(a[0] + b[0] - p.x, a[1] + b[1] - p.y, grid), grid)]); }   // the cell across this side is the room's
            var first = -1; for (k = 0; k < 6; k++) if (on[k] && !on[(k + 5) % 6]) { first = k; break; }
            if (first < 0) return;   // no side on the room (or all six): no door to draw
            var pts = [vs[first]]; for (k = first; on[k % 6] && k < first + 6; k++) pts.push(vs[(k + 1) % 6]);
            var ln = wallLine(pts); if (ln) out.doors.push(ln);
        });
    }
    var walls = outlineWalls(out.floors, grid, {});
    out.walls = walls.over ? [] : walls.lines;
    out.count = out.floors.length + out.doors.length + out.walls.length;
    return out;
}

var API = { VERSION: VERSION, SIZE: SIZE, ROOMS: ROOMS, CORRS: CORRS, DOORS: DOORS, WORDS: WORDS, seedOf: seedOf, cleanGen: cleanGen, keepLargest: keepLargest, genDungeon: genDungeon, strips: strips, dungeonPieces: dungeonPieces };
if (typeof window !== 'undefined') window.wpGenCore = API;
export { VERSION, SIZE, ROOMS, CORRS, DOORS, WORDS, seedOf, cleanGen, keepLargest, genDungeon, strips, dungeonPieces };

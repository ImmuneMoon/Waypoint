/* Fog of war / dynamic vision (1.5.0, v1) — the pure half: grid cell geometry (square 50px, flat-top hex s=30/52,
   or a gridless map's assigned cell), a viewer token's visible-cell set (a radius disc on square, a ring on hex, each
   gated by a facing arc that is decoupled from the grid type — see visibleCells), the range→cells conversion, the
   revealed-point test, and the validators for map.fog / camp.fog.
   No DOM, no state: the host (enforcement) and the client (overlay) run the SAME code so they agree on what is
   seen. tools/fogcheck.js runs it under Node. Published as window.wpFogCore. Design of record: docs/FOG_OF_WAR_PLAN.md. */
'use strict';

var VERSION = '1.5.0';
var LIMITS = Object.freeze({
    rangeCells: 60,     // a viewer's sight, in cells, after conversion — hard cap so a bad field can't sweep the board
    cells: 12000,       // the most visible cells one recompute yields (the whole disc at rangeCells: 11,289 on square, 10,981 on hex)
    manual: 4000,       // manual reveal/hide cells stored per map
    hand: 12000,        // 1.5.4: the cells all of a map's pieces marked Always revealed may add (a piece that would pass it is left out whole)
    blockerCells: 6000, // sight-blocker cells resolved per map — over this, occlusion falls open (no blocking)
    wallSegs: 8000,     // item 18 W2: the straight pieces of the pen lines that block, per map — over this, occlusion falls open as for cells
    wallSamples: 400000, // item 18 W2: the samples all of a set's walls may take to index (a quarter cell each) — past this the rest are left out, on every side alike
    lights: 200,        // lighting (L2): light sources counted per map — over this the map reads dark (never more light than there is)
    lightVisits: 120000, // lighting (L2): cells all of a map's light sources may walk — over this the map reads dark
    lightName: 60,      // lighting (L4): the name a light keeps of the preset it came from
    senses: 8,          // senses S2b: the ranges a token gives its own senses (the system holds at most eight)
    marks: 60,          // senses S4: the marks one player's copy of a map holds (past this, the nearest)
    markTests: 4000,    // senses S4: the lines of sight one player's marks may test on one map (past this, the far creatures go untested)
    arcDeg: 180,        // GURPS front arc
    len: [10, 4000]     // a gridless cell length in board px
});
var RULESETS = { dnd: 1, gurps: 1 };
var MODES = { auto: 1, reveal: 1, cover: 1 };   // per-map override: auto = vision + manual, reveal = whole map shown, cover = only manual shown

function isObj(v) { return v !== null && typeof v === 'object'; }
function fin(v) { return typeof v === 'number' && isFinite(v); }
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function norm180(d) { d = ((d % 360) + 360) % 360; return d > 180 ? d - 360 : d; }

/* ---------- grids ----------
   A grid descriptor the caller builds from the map: { type:'square', size } or { type:'hex', s, h }.
   Square maps use size 50; hex maps use s=30,h=52 (the app's flat-top lattice); a gridless map passes its
   assigned fog.cell (square size = len, or hex s = len/2 with h = len*0.866*2 kept to the app ratio → we keep
   it simple: gridless hex reuses s=30/h=52 scaled by len/60). */
function squareGrid(size) { return { type: 'square', size: size > 0 ? size : 50 }; }
function hexGrid(s, h) { return { type: 'hex', s: s > 0 ? s : 30, h: h > 0 ? h : 52 }; }
function gridFor(gridType, fogCell) {
    if (gridType === 'square') return squareGrid(50);
    if (gridType === 'hex') return hexGrid(30, 52);
    // gridless: use the map's assigned fog.cell
    if (isObj(fogCell) && fogCell.grid === 'hex') { var s = clamp(fogCell.len, LIMITS.len[0], LIMITS.len[1]) / 2; return hexGrid(s, s * 52 / 30); }
    if (isObj(fogCell) && fogCell.grid === 'square') return squareGrid(clamp(fogCell.len, LIMITS.len[0], LIMITS.len[1]));
    return null;   // gridless with no assigned cell → fog cannot compute cells (the GM must choose one)
}

/* ---------- cells ---------- */
function cellOf(x, y, grid) {
    if (grid.type === 'square') return { c: Math.floor(x / grid.size), r: Math.floor(y / grid.size) };
    // flat-top hex: x = 1.5s·q + s/2, y = h·(r + q/2); invert then cube-round (the app's snapToHex)
    var q = (x - grid.s / 2) / (1.5 * grid.s), r = y / grid.h - q / 2;
    var rx = Math.round(q), ry = Math.round(r), rz = Math.round(-q - r);
    var dx = Math.abs(rx - q), dy = Math.abs(ry - r), dz = Math.abs(rz - (-q - r));
    if (dx > dy && dx > dz) rx = -ry - rz; else if (dy > dz) ry = -rx - rz;
    return { q: rx, r: ry };
}
function cellCenter(cell, grid) {
    if (grid.type === 'square') return { x: cell.c * grid.size + grid.size / 2, y: cell.r * grid.size + grid.size / 2 };
    return { x: 1.5 * grid.s * cell.q + grid.s / 2, y: grid.h * (cell.r + cell.q / 2) };
}
function cellKey(cell, grid) { return grid.type === 'square' ? cell.c + ',' + cell.r : cell.q + ':' + cell.r; }
function hexDist(a, b) { var dq = a.q - b.q, dr = a.r - b.r; return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr)); }

// range in the map's length unit (ft/yd) → cells, via yards-per-cell; clamped
function rangeToCells(rangeUnits, perCellUnits) {
    if (!fin(rangeUnits) || rangeUnits <= 0) return 0;
    var per = fin(perCellUnits) && perCellUnits > 0 ? perCellUnits : 1;
    return clamp(Math.round(rangeUnits / per), 0, LIMITS.rangeCells);
}
// Lighting (L4): the units a length may be counted in besides yards (the absent default): feet, metres, or the map's own cells
var LENGTH_UNITS = Object.freeze({ ft: 1 / 3, m: 1.09361, cells: 0 });
function lightUnit(u) { return typeof u === 'string' && Object.prototype.hasOwnProperty.call(LENGTH_UNITS, u) ? u : ''; }
// A length in its unit → a map's cells, rounded and clamped as rangeToCells. Yards (no unit, or one not known) convert exactly as before;
// cells count as they are, whatever the map's scale; feet and metres go through the map's yards per cell, to the millionth first (3.5 ft on
// 1 ft squares is three cells and a half, so 4, not a hair under it and 3)
function unitCells(value, unit, perCellYards) {
    if (!fin(value) || value <= 0) return 0;
    var u = lightUnit(unit);
    if (u === 'cells') return rangeToCells(value, 1);
    if (!u) return rangeToCells(value, perCellYards);
    var per = fin(perCellYards) && perCellYards > 0 ? perCellYards : 1;
    return rangeToCells(Math.round(value * LENGTH_UNITS[u] / per * 1e6) / 1e6, 1);
}
var CTRL_G = new RegExp('[' + String.fromCharCode(0) + '-' + String.fromCharCode(31) + String.fromCharCode(127) + ']', 'g');
var LONE_SURROGATE = /^[\uD800-\uDFFF]$/;
// A short name cut by code points (never half an emoji; a lone surrogate is dropped), control characters to spaces: systemcore cutPoints' own
// rule, so a light's name copied from a preset is the preset's name
function cleanName(v, cap) { if (typeof v !== 'string') return ''; return Array.from(v.slice(0, 256).replace(CTRL_G, ' ').trim()).filter(function(ch) { return !LONE_SURROGATE.test(ch); }).slice(0, cap).join('').trim(); }

/* ---------- sight-blockers (line-of-sight occlusion, v1: static walls) ----------
   Pure & item-blind: fog.js converts flagged board items to a Set of opaque cell KEYS and passes
   it to visibleCells, so host enforcement and the client overlay run the SAME code and agree. */
// Cells whose CENTRE lies inside an axis-aligned board rect [x,x+w]x[y,y+h].
// A column of cells at a time (cellsUnderSpan with no span): on hexagons the rows of a column lie half a row lower with each column, so a
// walk of the corners' whole range of rows took half the box's width squared, which one long thin piece made thousands of millions of steps
// (the review of 2026-10-09). The cells and their order are as they always were
function cellsUnderRect(x, y, w, h, grid) { return cellsUnderSpan(x, y, w, h, grid, null); }
// Point-in-flat-top-hexagon (the board item's box is w wide, h tall, centre cx,cy).
function pointInFlatHex(px, py, cx, cy, w, h) {
    var s = w / 2, b = h / 2, qx = Math.abs(px - cx), qy = Math.abs(py - cy);
    if (qx > s || qy > b) return false;
    if (qx <= s / 2) return true;
    return qy <= (2 * b / s) * (s - qx) + 1e-9;
}
// Cells whose centre lies inside a flat-top hexagon board item (top-left x,y, box w x h).
function cellsUnderHex(x, y, w, h, grid) {
    var cx = x + w / 2, cy = y + h / 2, out = [], box = cellsUnderRect(x, y, w, h, grid);
    for (var i = 0; i < box.length; i++) { var p = cellCenter(box[i], grid); if (pointInFlatHex(p.x, p.y, cx, cy, w, h)) out.push(box[i]); }
    return out;
}
// Cells whose centre lies inside a circle/ellipse board item (a pillar) — box w x h, centre cx,cy.
function cellsUnderCircle(x, y, w, h, grid) {
    var cx = x + w / 2, cy = y + h / 2, rx = w / 2 || 1, ry = h / 2 || 1, out = [], box = cellsUnderRect(x, y, w, h, grid);
    for (var i = 0; i < box.length; i++) { var p = cellCenter(box[i], grid), dx = (p.x - cx) / rx, dy = (p.y - cy) / ry; if (dx * dx + dy * dy <= 1 + 1e-9) out.push(box[i]); }
    return out;
}
// Cells whose centre lies inside a diamond (rhombus) board item — box w x h, centre cx,cy.
function cellsUnderDiamond(x, y, w, h, grid) {
    var cx = x + w / 2, cy = y + h / 2, rx = w / 2 || 1, ry = h / 2 || 1, out = [], box = cellsUnderRect(x, y, w, h, grid);
    for (var i = 0; i < box.length; i++) { var p = cellCenter(box[i], grid); if (Math.abs(p.x - cx) / rx + Math.abs(p.y - cy) / ry <= 1 + 1e-9) out.push(box[i]); }
    return out;
}
// The owed review, 2026-10-09: a turned piece's cells are found a column of cells at a time, so the work follows the piece and not its box (a
// long thin wall turned across the grid has a box hundreds of times its own cells). cellsUnderSpan lists the cells of a board rect exactly as
// cellsUnderRect does, in its order and by its test, but walks in each column only the rows `span` leaves: span(px) gives the stretch of y in
// which the column at x may hold a centre the caller keeps ([lo, hi], or null for none). The rows are widened past the stretch, so a span that
// leaves no kept centre out loses none. With no span the whole box is walked: cellsUnderRect itself
function cellsUnderSpan(x, y, w, h, grid, span) {
    var out = [], cs = [cellOf(x, y, grid), cellOf(x + w, y, grid), cellOf(x, y + h, grid), cellOf(x + w, y + h, grid)], sq = grid.type === 'square';
    var a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    cs.forEach(function(c) { var a = sq ? c.c : c.q; a0 = Math.min(a0, a); a1 = Math.max(a1, a); b0 = Math.min(b0, c.r); b1 = Math.max(b1, c.r); });
    if (!sq) { a0 -= 2; a1 += 2; b0 -= 2; b1 += 2; }
    for (var a = a0; a <= a1; a++) {
        var px = sq ? a * grid.size + grid.size / 2 : 1.5 * grid.s * a + grid.s / 2, lo = y, hi = y + h;
        if (span) { var sp = span(px); if (!sp) continue; lo = Math.max(sp[0], y); hi = Math.min(sp[1], y + h); }
        if (!(lo <= hi)) continue;
        var from = Math.max(b0, sq ? Math.floor(lo / grid.size) - 1 : Math.floor(lo / grid.h - a / 2) - 2), to = Math.min(b1, sq ? Math.floor(hi / grid.size) + 1 : Math.ceil(hi / grid.h - a / 2) + 2);
        for (var b = from; b <= to; b++) {
            var cell = sq ? { c: a, r: b } : { q: a, r: b }, p = cellCenter(cell, grid);
            if (p.x >= x && p.x <= x + w && p.y >= y && p.y <= y + h) out.push(cell);
        }
    }
    return out;
}
// The span of a turned piece: its own box about (cx, cy), half-sizes rx and ry (never under any outline's own half-size), a hair wider than the
// outline tests' own 1e-9, cut by the line x. A side that runs along the column, the piece all but square to the grid, cuts nothing off
function turnedSpan(cx, cy, co, si, rx, ry) {
    var hx = rx * (1 + 1e-8) + 1e-6, hy = ry * (1 + 1e-8) + 1e-6;
    return function(px) {
        var dx = px - cx, lo = -Infinity, hi = Infinity, a, b;
        if (Math.abs(si) > 1e-6) { a = (-hx - dx * co) / si; b = (hx - dx * co) / si; lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b)); }
        if (Math.abs(co) > 1e-6) { a = (-hy + dx * si) / co; b = (hy + dx * si) / co; lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b)); }
        return lo <= hi ? [cy + lo, cy + hi] : null;
    };
}
// Whether a piece is too large to list its cells: past OVER_TIMES times the walls' cap (the owed review, 2026-10-09: a host may name a piece of
// any size, and listing one 16 million cells wide stalled a player's app before any cap was counted). Judged on what itemCells would walk: an
// unturned piece's own box; a turned one's own size, since its cells are found a column at a time and its columns are fewer than twice its
// own size in cells; a turned piece with a size below 0, whose box is walked whole, by that box. A painted cell is its one cell whatever its box
var OVER_TIMES = 40;
function itemOver(w, grid) {
    if (!isObj(w) || !isObj(grid) || w.fill) return false;
    var cw = grid.type === 'square' ? grid.size : 1.5 * grid.s, ch = grid.type === 'square' ? grid.size : grid.h, top = LIMITS.blockerCells * OVER_TIMES;
    var ww = fin(w.w) ? w.w : 0, hh = fin(w.h) ? w.h : 0, rot = fin(w.rot) ? w.rot % 360 : 0;
    if (!rot || (w.type === 'circle' && ww === hh)) return !((Math.abs(ww) / cw + 2) * (Math.abs(hh) / ch + 2) <= top);
    var m = Math.min(cw, ch); if (ww >= 0 && hh >= 0) return !((ww / m + 2) * (hh / m + 2) <= top);
    var rad = rot * Math.PI / 180, co = Math.abs(Math.cos(rad)), si = Math.abs(Math.sin(rad)), bw = Math.abs(ww) * co + Math.abs(hh) * si, bh = Math.abs(ww) * si + Math.abs(hh) * co;
    return !((bw / cw + 2) * (bh / ch + 2) <= top);
}
// Item 18 (the owner's answer, 2026-09-30: a turned shape or an image blocks by its outline, never by pixels): a board piece's cells — those
// whose centre lies inside its outline, turned by its rot (degrees, about its box's centre, as the board draws it). A painted cell is its one
// cell; a circle its ellipse (a true circle turns into itself, so it is read unturned); a hexagon or a diamond its own outline; a rectangle, an
// image or anything else its box. Unturned: exactly the helpers above
function itemCells(w, grid) {
    if (!isObj(w) || !isObj(grid) || !fin(w.x) || !fin(w.y)) return [];
    var ww = fin(w.w) ? w.w : 0, hh = fin(w.h) ? w.h : 0;
    if (w.fill) return [cellOf(w.x + ww / 2, w.y + hh / 2, grid)];
    var kind = w.type === 'hexagon' ? 'hex' : w.type === 'circle' ? 'ell' : w.type === 'diamond' ? 'dia' : 'rect', rot = fin(w.rot) ? w.rot % 360 : 0;
    if (!rot || (kind === 'ell' && ww === hh)) return kind === 'hex' ? cellsUnderHex(w.x, w.y, ww, hh, grid) : kind === 'ell' ? cellsUnderCircle(w.x, w.y, ww, hh, grid) : kind === 'dia' ? cellsUnderDiamond(w.x, w.y, ww, hh, grid) : cellsUnderRect(w.x, w.y, ww, hh, grid);
    var rad = rot * Math.PI / 180, co = Math.cos(rad), si = Math.sin(rad), cx = w.x + ww / 2, cy = w.y + hh / 2, rx = ww / 2 || 1, ry = hh / 2 || 1;
    var bw = Math.abs(ww * co) + Math.abs(hh * si), bh = Math.abs(ww * si) + Math.abs(hh * co), out = [];
    var box = ww >= 0 && hh >= 0 ? cellsUnderSpan(cx - bw / 2, cy - bh / 2, bw, bh, grid, turnedSpan(cx, cy, co, si, rx, ry)) : cellsUnderRect(cx - bw / 2, cy - bh / 2, bw, bh, grid);   // the turned box's cells, a column at a time for a plain size
    for (var i = 0; i < box.length; i++) {
        var p = cellCenter(box[i], grid), dx = p.x - cx, dy = p.y - cy, lx = dx * co + dy * si, ly = -dx * si + dy * co;   // the cell centre in the piece's own frame
        var inside = kind === 'hex' ? pointInFlatHex(lx, ly, 0, 0, ww, hh) : kind === 'ell' ? (lx / rx) * (lx / rx) + (ly / ry) * (ly / ry) <= 1 + 1e-9
            : kind === 'dia' ? Math.abs(lx) / rx + Math.abs(ly) / ry <= 1 + 1e-9 : Math.abs(lx) <= ww / 2 + 1e-9 && Math.abs(ly) <= hh / 2 + 1e-9;
        if (inside) out.push(box[i]);
    }
    return out;
}
/* ---------- thin walls (item 18 W2, the owner's answer: a pen line blocks as THE LINE ITSELF, a thin wall between cells) ----------
   A wall is a straight board segment [x1, y1, x2, y2]. A blocker set carries its walls beside its cells in a WeakMap, so every set keeps its
   shape (a plain map of cell keys) and every reader that walks a line — sight, light, cover, movement, marks — tests them through segClear
   (visibleCells through its own quick copy of it). Each wall is registered in the cells of its samples (every quarter cell, both ends) and in
   their neighbours: a line sampled every half cell always visits a cell a wall it crosses is registered in (two points under 0.375 of a cell
   apart lie in the same or neighbouring cells, on both grids). A line is stopped where it crosses a wall strictly between its ends (a line
   ending on a wall, or starting on one, passes), a wall's own ends included; a line running along a wall passes it */
var WALLS = typeof WeakMap === 'function' ? new WeakMap() : null;
function wallIndex(segs, grid) {
    var idx = { segs: [], cells: Object.create(null), box: [Infinity, Infinity, -Infinity, -Infinity] }, used = 0;
    if (!Array.isArray(segs) || !isObj(grid)) return idx;
    var step = (grid.type === 'square' ? grid.size : grid.s) / 4;
    for (var i = 0; i < segs.length && idx.segs.length < LIMITS.wallSegs; i++) {
        var s = segs[i]; if (!Array.isArray(s) || s.length !== 4 || !fin(s[0]) || !fin(s[1]) || !fin(s[2]) || !fin(s[3])) continue;
        var dx = s[2] - s[0], dy = s[3] - s[1], steps = Math.max(1, Math.ceil(Math.sqrt(dx * dx + dy * dy) / step));
        if (steps > 20000) continue;   // a wall longer than 5000 cells is no wall on a map (a hostile number): it blocks nothing, on every side alike
        if ((used += steps + 1) > LIMITS.wallSamples) break;   // the walls past the budget are left out (a map drawn to freeze a player's app)
        var n = idx.segs.length, done = Object.create(null); idx.segs.push([s[0], s[1], s[2], s[3]]);
        idx.box = [Math.min(idx.box[0], s[0], s[2]), Math.min(idx.box[1], s[1], s[3]), Math.max(idx.box[2], s[0], s[2]), Math.max(idx.box[3], s[1], s[3])];
        for (var k = 0; k <= steps; k++) {
            var c = cellOf(s[0] + dx * k / steps, s[1] + dy * k / steps, grid), ck = cellKey(c, grid); if (done[ck] === 2) continue;
            var near = [c].concat(neighbourCells(c, grid));
            for (var m = 0; m < near.length; m++) { var nk = cellKey(near[m], grid); if (done[nk]) continue; done[nk] = 1; (idx.cells[nk] || (idx.cells[nk] = [])).push(n); }
            done[ck] = 2;
        }
    }
    return idx;
}
// A blocker set (null: a new one) with these walls added; the set itself, so its cells and its identity stay as they were. No walls: as it is
function withWalls(set, segs, grid) {
    if (!WALLS) return set;
    var idx = wallIndex(segs, grid); if (!idx.segs.length) return set;
    var s = set || Object.create(null); WALLS.set(s, (WALLS.get(s) || []).concat([idx])); return s;
}
function wallsOf(set) { return set && WALLS ? WALLS.get(set) || null : null; }
function copyWalls(from, to) { var w = wallsOf(from); if (w && to && WALLS) WALLS.set(to, (WALLS.get(to) || []).concat(w)); return to; }
function crossesWall(ax, ay, bx, by, s) {
    var rx = bx - ax, ry = by - ay, sx = s[2] - s[0], sy = s[3] - s[1], den = rx * sy - ry * sx;
    if (Math.abs(den) < 1e-12) return false;   // parallel: a line along a wall never crosses it
    var qx = s[0] - ax, qy = s[1] - ay, t = (qx * sy - qy * sx) / den, u = (qx * ry - qy * rx) / den;
    return t > 1e-9 && t < 1 - 1e-9 && u >= -1e-9 && u <= 1 + 1e-9;
}
function wallHit(pax, pay, pbx, pby, grid, lists) {
    var dx = pbx - pax, dy = pby - pay, steps = Math.max(1, Math.ceil(Math.sqrt(dx * dx + dy * dy) / ((grid.type === 'square' ? grid.size : grid.s) / 2)));
    var x0 = Math.min(pax, pbx), y0 = Math.min(pay, pby), x1 = Math.max(pax, pbx), y1 = Math.max(pay, pby);
    for (var L = 0; L < lists.length; L++) {
        var idx = lists[L], b = idx.box; if (b[0] > x1 || b[2] < x0 || b[1] > y1 || b[3] < y0) continue;   // no wall of it near the line
        var tried = Object.create(null), last = null;
        for (var i = 0; i <= steps; i++) {
            var key = cellKey(cellOf(pax + dx * i / steps, pay + dy * i / steps, grid), grid); if (key === last) continue; last = key;
            var ws = idx.cells[key]; if (!ws) continue;
            for (var j = 0; j < ws.length; j++) { var n = ws[j]; if (tried[n]) continue; tried[n] = 1; if (crossesWall(pax, pay, pbx, pby, idx.segs[n])) return true; }
        }
    }
    return false;
}
// Item 18 W2: a pen line's board segments — its points (pts, in its own box of baseW x baseH) scaled to its box (w x h) and turned by its rot
// about the box's centre, as the board draws it; a filled region (tip 'fill') closed, with each of its holes (50 at most). A point that is no
// pair of numbers is passed over; at most 20000 points a run and LIMITS.wallSegs segments; none for anything but a path
function pathSegs(w) {
    var out = [];
    if (!isObj(w) || w.type !== 'path' || !fin(w.x) || !fin(w.y) || !Array.isArray(w.pts)) return out;
    var ww = fin(w.w) && w.w > 0 ? w.w : 0, hh = fin(w.h) && w.h > 0 ? w.h : 0, bw = fin(w.baseW) && w.baseW > 0 ? w.baseW : (ww || 1), bh = fin(w.baseH) && w.baseH > 0 ? w.baseH : (hh || 1);
    var sx = ww ? ww / bw : 1, sy = hh ? hh / bh : 1, rot = fin(w.rot) ? w.rot % 360 : 0, rad = rot * Math.PI / 180, co = Math.cos(rad), si = Math.sin(rad), cx = w.x + ww / 2, cy = w.y + hh / 2;
    var pt = function(p) {
        if (!Array.isArray(p) || !fin(p[0]) || !fin(p[1])) return null;
        var x = w.x + p[0] * sx, y = w.y + p[1] * sy; if (!rot) return [x, y];
        var dx = x - cx, dy = y - cy; return [cx + dx * co - dy * si, cy + dx * si + dy * co];
    };
    var run = function(pts, closed) {
        var first = null, prev = null;
        for (var i = 0; i < pts.length && i < 20000 && out.length < LIMITS.wallSegs; i++) { var q = pt(pts[i]); if (!q) continue; if (!first) first = q; if (prev && (prev[0] !== q[0] || prev[1] !== q[1])) out.push([prev[0], prev[1], q[0], q[1]]); prev = q; }
        if (closed && first && prev && out.length < LIMITS.wallSegs && (first[0] !== prev[0] || first[1] !== prev[1])) out.push([prev[0], prev[1], first[0], first[1]]);
    };
    run(w.pts, w.tip === 'fill');
    if (w.tip === 'fill' && Array.isArray(w.holes)) w.holes.slice(0, 50).forEach(function(h) { if (Array.isArray(h)) run(h, true); });
    return out;
}
// ... and the cells its line passes through (a door's neighbours are judged from them, and a click in fog mode finds the door there)
function pathCells(w, grid) {
    var out = [], seen = Object.create(null); if (!isObj(grid)) return out;
    var step = (grid.type === 'square' ? grid.size : grid.s) / 4, segs = pathSegs(w), used = 0;
    for (var i = 0; i < segs.length && out.length < LIMITS.blockerCells; i++) {
        var s = segs[i], dx = s[2] - s[0], dy = s[3] - s[1], steps = Math.max(1, Math.ceil(Math.sqrt(dx * dx + dy * dy) / step)); if (steps > 20000) continue;
        if ((used += steps + 1) > LIMITS.wallSamples) break;   // as the walls' index: the same budget
        for (var k = 0; k <= steps; k++) { var c = cellOf(s[0] + dx * k / steps, s[1] + dy * k / steps, grid), key = cellKey(c, grid); if (!seen[key]) { seen[key] = 1; out.push(c); } }
    }
    return out;
}
// True if the straight PIXEL segment (pax,pay)->(pbx,pby) crosses no opaque cell, sampling at ~half a cell and
// skipping any cell key in skipKeys. The shared sampler behind lineClear (sight) and coverBetween (cover), so host
// enforcement, the client overlay and the cover readout all agree by construction. Private to this module.
function segClear(pax, pay, pbx, pby, grid, blockers, skipKeys) {
    if (!blockers) return true;
    var dx = pbx - pax, dy = pby - pay, dist = Math.sqrt(dx * dx + dy * dy);
    var stepPx = (grid.type === 'square' ? grid.size : grid.s) / 2;
    var steps = Math.max(1, Math.ceil(dist / stepPx));
    for (var i = 1; i < steps; i++) {
        var t = i / steps, k = cellKey(cellOf(pax + dx * t, pay + dy * t, grid), grid);
        if (skipKeys && skipKeys[k]) continue;
        if (blockers[k]) return false;
    }
    var wl = wallsOf(blockers); if (wl && wallHit(pax, pay, pbx, pby, grid, wl)) return false;   // item 18 W2: a thin wall it crosses, its end cells included
    return true;
}
// True if the straight line from cell A to cell B crosses no opaque INTERMEDIATE cell (endpoints
// excluded — a viewer on/next to a wall still sees out, and a wall's own cell shows its near face).
function lineClear(a, b, grid, blockers) {
    if (!blockers) return true;
    var pa = cellCenter(a, grid), pb = cellCenter(b, grid), skip = Object.create(null);
    skip[cellKey(a, grid)] = 1; skip[cellKey(b, grid)] = 1;
    return segClear(pa.x, pa.y, pb.x, pb.y, grid, blockers, skip);
}

// A cell a thin wall runs through (the owner, 2026-10-04, of the dark cells along a room's walls: "it doesnt go away when a character is
// nearby"). A cell is seen by its centre, so the cells of a room whose centres lie just past its wall were never seen from inside it: a bite
// out of the floor along every wall drawn across the grid. For DRAWING the fog only — what a player is sent is still judged by the centre —
// a cell that is not seen, beside a seen one, is drawn with it when the first wall on the line between their centres lies in the unseen
// cell's own half: the wall runs through that cell, and the part of it on this side is ground the viewer stands beside. keys: { cell key:
// tier } (the seen cells); opts.skip: cell keys never added (cut by hand); opts.through: seen cells that lend nothing (seen only by a sense
// that passes walls). Returns [{ key, cell, tier }], each with the highest tier of the seen cells that lend it, at most LIMITS.cells; none
// where the set has no thin wall. A solid blocker's own cell is never added and never lends (its near face is seenCells' own business).
// How far towards the unseen cell's centre the wall must lie: past 0.55 of the way from the seen cell's centre. Measured on six of the owner's
// walled maps (14,000 unseen cells beside walls, each cell's truly visible share sampled at 61 points): at 0.5 a cell is drawn for a strip
// too thin to see, at 0.65 one cell in eight with a real share seen stays dark; 0.55 leaves 6% of those dark — corners, and cells at the
// edge of sight round a wall's end, which no wall cuts — and draws the fewest cells of which next to nothing is seen.
var EDGE = typeof WeakMap === 'function' ? new WeakMap() : null, EDGE_AT = 0.55;
function firstWallAt(ax, ay, bx, by, lists, ka, kb) {   // how far along a -> b (0 to 1) the first wall it crosses lies; null where it crosses none
    var best = null, rx = bx - ax, ry = by - ay;
    for (var L = 0; L < lists.length; L++) {
        var idx = lists[L], two = [idx.cells[ka], idx.cells[kb]], tried = Object.create(null);
        for (var w = 0; w < 2; w++) {
            var ws = two[w]; if (!ws) continue;
            for (var j = 0; j < ws.length; j++) {
                var n = ws[j]; if (tried[n]) continue; tried[n] = 1;
                var s = idx.segs[n], sx = s[2] - s[0], sy = s[3] - s[1], den = rx * sy - ry * sx; if (Math.abs(den) < 1e-12) continue;   // along the wall: no crossing
                var qx = s[0] - ax, qy = s[1] - ay, t = (qx * sy - qy * sx) / den, u = (qx * ry - qy * rx) / den;
                if (t > 1e-9 && t < 1 - 1e-9 && u >= -1e-9 && u <= 1 + 1e-9 && (best === null || t < best)) best = t;   // crossesWall's own test
            }
        }
    }
    return best;
}
// The cells of a set that a thin wall cuts, each with the neighbours it shares a side with (never a corner) on whose side part of it lies:
// the walls' own geometry, so it is worked out once a set (and a grid) and every draw only walks the list
function wallCutCells(blockers, grid) {
    var wl = wallsOf(blockers); if (!wl) return [];
    var sq = grid.type === 'square', sig = grid.type + ':' + (sq ? grid.size : grid.s + '/' + grid.h), kept = EDGE ? EDGE.get(blockers) : null;
    if (kept && kept.n === wl.length && kept.sig === sig) return kept.list;
    var out = [], done = Object.create(null);
    for (var L = 0; L < wl.length; L++) for (var k in wl[L].cells) {
        if (done[k]) continue; done[k] = 1;
        var sp = k.split(sq ? ',' : ':'); if (sp.length !== 2 || !fin(+sp[0]) || !fin(+sp[1])) continue;
        var uc = sq ? { c: +sp[0], r: +sp[1] } : { q: +sp[0], r: +sp[1] }; if (cellKey(uc, grid) !== k) continue;   // a key that is no cell's
        var pu = cellCenter(uc, grid), lend = [];
        var nb = sq ? [{ c: uc.c + 1, r: uc.r }, { c: uc.c - 1, r: uc.r }, { c: uc.c, r: uc.r + 1 }, { c: uc.c, r: uc.r - 1 }] : neighbourCells(uc, grid);
        for (var j = 0; j < nb.length; j++) {
            var ks = cellKey(nb[j], grid), ps = cellCenter(nb[j], grid), t = firstWallAt(ps.x, ps.y, pu.x, pu.y, wl, ks, k);
            if (t !== null && t > EDGE_AT) lend.push(ks);   // the first wall lies well inside this cell's half: it runs through this cell
        }
        if (lend.length) out.push({ key: k, cell: uc, lend: lend });
    }
    if (EDGE) EDGE.set(blockers, { n: wl.length, sig: sig, list: out });
    return out;
}
function wallEdgeCells(keys, grid, blockers, opts) {
    var out = []; if (!isObj(keys) || !isObj(grid) || !isObj(blockers)) return out;
    if (!wallsOf(blockers)) return out;
    var skip = isObj(opts) && isObj(opts.skip) ? opts.skip : null, th = isObj(opts) && isObj(opts.through) ? opts.through : null, cut = wallCutCells(blockers, grid);
    for (var i = 0; i < cut.length && out.length < LIMITS.cells; i++) {
        var U = cut[i]; if (keys[U.key] !== undefined || blockers[U.key] || (skip && skip[U.key])) continue;
        var tier = 0;
        for (var j = 0; j < U.lend.length; j++) { var ks = U.lend[j], ts = keys[ks]; if (ts > tier && !(th && th[ks]) && !blockers[ks]) tier = ts; }
        if (tier) out.push({ key: U.key, cell: U.cell, tier: tier });
    }
    return out;
}

// Turn-based combat T3a (D11, owner 2026-09-26): a token's straight move from one point to another is clear unless it lands in, or crosses, a
// cell a sight-blocker occupies. Its start cell never counts (a token the GM left in a wall can step out). No blockers or no grid: clear
function moveClear(x1, y1, x2, y2, grid, blockers) {
    if (!blockers || !grid || !fin(x1) || !fin(y1) || !fin(x2) || !fin(y2)) return true;
    var s = Object.create(null), a = cellKey(cellOf(x1, y1, grid), grid), b = cellKey(cellOf(x2, y2, grid), grid); s[a] = 1;
    if (b !== a && blockers[b]) return false;
    return segClear(x1, y1, x2, y2, grid, blockers, s);
}
// Difficult terrain T2 (owner 2026-09-29): what a straight move from cell a to cell b costs against its length. It walks the cells the move
// steps into along the line (a hex grid's cube line; a square grid's line a column or a row at a time, a diagonal step where both change),
// weighs each step by its own length (1, or a square's diagonal: 1 with diag 'one', 1 then 2 by turns with 'alt', the straight line's
// otherwise) and by the cost of the cell it enters (terr: { cellKey: 2..10 }, 1 where none), and gives the factor to multiply the move's
// length by: 1 with no terrain, no step or no grid. The start cell never counts; a line past 4000 steps, or from a cell that is no number, is
// not walked (1)
function cubeRoundQR(x, y, z) {
    var rx = Math.round(x), ry = Math.round(y), rz = Math.round(z), dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
    if (dx > dy && dx > dz) rx = -ry - rz; else if (dy > dz) ry = -rx - rz; else rz = -rx - ry;
    return { q: rx, r: rz };
}
function terrainFactor(a, b, grid, terr, diag) {
    if (!isObj(grid) || !isObj(terr) || !isObj(a) || !isObj(b)) return 1;
    var hex = grid.type === 'hex', n = hex ? hexDist(a, b) : Math.max(Math.abs(b.c - a.c), Math.abs(b.r - a.r));
    if (n > 4000) return 1;
    var sum = 0, wsum = 0, nd = 0, prev = a;
    for (var i = 1; i <= n; i++) {
        var u = i / n, c, s = 1;
        if (hex) { var x = a.q + (b.q - a.q) * u + 1e-6, z = a.r + (b.r - a.r) * u + 2e-6; c = cubeRoundQR(x, -x - z, z); }
        else { c = { c: a.c + Math.round((b.c - a.c) * u), r: a.r + Math.round((b.r - a.r) * u) }; if (c.c !== prev.c && c.r !== prev.r) { nd++; s = diag === 'one' ? 1 : diag === 'alt' ? (nd % 2 ? 1 : 2) : Math.SQRT2; } }
        var t = cleanTerrain(terr[cellKey(c, grid)]) || 1;
        sum += s * t; wsum += s; prev = c;
    }
    return wsum > 0 ? sum / wsum : 1;
}
/* ---------- cover (line-of-effect between two cells, for combat cover) ----------
   Reuses the SAME opaque-cell blocker set as fog, so the cover readout, host enforcement and the client overlay
   agree. coverBetween returns a SYSTEM-NEUTRAL result — { coverage 0..1 (kept < 1), lineOfEffect } — and each
   campaign-system (systemcore coverTier) maps it to its own tiers (D&D half/three-quarters/total, a GURPS-style
   label, etc.). v1 is informational: nothing here changes an authoritative number. */
// The corners of a cell, each nudged slightly toward its centre so it resolves cleanly into its own cell: a square
// cell has 4; a flat-top hex has 6 (matching the drawn hex, centre-to-vertex radius = grid.s).
function cellCorners(cell, grid) {
    var eps = 0.01, ctr = cellCenter(cell, grid), out = [];
    if (grid.type === 'square') {
        var s = grid.size, x0 = cell.c * s, y0 = cell.r * s, pts = [[x0, y0], [x0 + s, y0], [x0 + s, y0 + s], [x0, y0 + s]];
        for (var i = 0; i < 4; i++) out.push({ x: pts[i][0] + (ctr.x - pts[i][0]) * eps, y: pts[i][1] + (ctr.y - pts[i][1]) * eps });
        return out;
    }
    for (var k = 0; k < 6; k++) { var a = Math.PI / 180 * (60 * k), px = ctr.x + grid.s * Math.cos(a), py = ctr.y + grid.s * Math.sin(a); out.push({ x: px + (ctr.x - px) * eps, y: py + (ctr.y - py) * eps }); }
    return out;
}
// Cover between two cells via the corner rule, computed direction-SYMMETRICALLY (a ruler has no attacker/target):
// from each cell's corners trace to the other cell's corners, and take the corner with the FEWEST blocked lines from
// EITHER side. Returns { lines, blocked, coverage(0..<1), lineOfEffect }. blockers is the fog opaque-cell key set;
// null/empty → fully clear. coverage stays strictly below 1 so "4/4 corners" reads as heavy-but-partial cover, while
// TOTAL cover is signalled only by lineOfEffect:false (no clear line from any corner) — the two are never conflated.
// soft (cover follow-ups, owner 2026-09-28): the cells of see-over cover (a crate, a low wall) — they block a line for the coverage count but
// never the line of effect, so they give half or three-quarters, never total. Absent: exactly as before. all: their union when the caller keeps
// one (fog.js builds it once per map), else built here
function coverBetween(aCell, bCell, grid, blockers, soft, all) {
    var out = { lines: 0, blocked: 0, coverage: 0, lineOfEffect: true };
    if (!aCell || !bCell || !grid) return out;
    var aKey = cellKey(aCell, grid), bKey = cellKey(bCell, grid);
    if (aKey === bKey) return out;                       // same cell: no cover
    var ca = cellCorners(aCell, grid), cb = cellCorners(bCell, grid), n = Math.min(ca.length, cb.length);
    out.lines = n;
    if ((!blockers && !soft) || n <= 0) return out;      // no blockers → fully clear
    var skip = Object.create(null), every = all || unionSets(blockers, soft); skip[aKey] = 1; skip[bKey] = 1;
    var side = function(src, dst, set) {                 // fewest blocked lines from any one src corner to all dst corners
        var best = dst.length;
        for (var i = 0; i < src.length; i++) {
            var blk = 0;
            for (var j = 0; j < dst.length; j++) if (!segClear(src[i].x, src[i].y, dst[j].x, dst[j].y, grid, set, skip)) blk++;
            if (blk < best) best = blk;
        }
        return best;
    };
    var mb = Math.min(side(ca, cb, every), side(cb, ca, every)), hb = !soft ? mb : blockers ? Math.min(side(ca, cb, blockers), side(cb, ca, blockers)) : 0;
    out.blocked = mb > n ? n : mb;
    out.lineOfEffect = hb < n;                           // the best corner still has at least one clear line past the walls (see-over cover never shuts it)
    out.coverage = Math.min(out.blocked / n, 0.999);
    return out;
}
function unionSets(a, b) { if (!b) return a; var u = Object.create(null), k; if (a) for (k in a) u[k] = 1; for (k in b) u[k] = 1; copyWalls(a, u); copyWalls(b, u); return u; }   // item 18 W2: the walls of both
// Cover follow-ups: the cover a board POINT (a blast's centre) has to a cell — its lines to the cell's corners (4 on a square grid, 6 on a hex),
// the point's own cell and the target's skipped; the same shape and rules as coverBetween (a point has no corner to choose, so no best side)
function coverFromPoint(px, py, bCell, grid, blockers, soft, all) {
    var out = { lines: 0, blocked: 0, coverage: 0, lineOfEffect: true };
    if (!bCell || !grid || !fin(px) || !fin(py)) return out;
    var aKey = cellKey(cellOf(px, py, grid), grid), bKey = cellKey(bCell, grid);
    if (aKey === bKey) return out;
    var cb = cellCorners(bCell, grid); out.lines = cb.length;
    if (!blockers && !soft) return out;
    var skip = Object.create(null); skip[aKey] = 1; skip[bKey] = 1;
    var cnt = function(set) { var b = 0; for (var j = 0; j < cb.length; j++) if (!segClear(px, py, cb[j].x, cb[j].y, grid, set, skip)) b++; return b; };
    out.blocked = cnt(all || unionSets(blockers, soft));
    out.lineOfEffect = (soft ? (blockers ? cnt(blockers) : 0) : out.blocked) < out.lines;
    out.coverage = Math.min(out.blocked / out.lines, 0.999);
    return out;
}
// Cover follow-ups (owner 2026-09-28, answer 5): a blast can't go off inside a wall or a closed door (a cell of `blocked`). The centre of the
// open cell in front of it, within four cells of the hit: first one with a clear line to (tx, ty) (the thrower's token, else where the click
// landed: the thrower's side), then the nearest to the hit, then one facing that way, then the nearest to (tx, ty). A far point counts by its
// direction (the line is bounded). null when the hit cell is open (nothing to move) or no open cell is that near
function openSeat(px, py, tx, ty, grid, blocked) {
    if (!grid || !blocked || !fin(px) || !fin(py)) return null;
    var hit = cellOf(px, py, grid); if (!blocked[cellKey(hit, grid)]) return null;
    var hc = cellCenter(hit, grid), gap = grid.type === 'square' ? grid.size : grid.s * Math.sqrt(3), R = 4;
    var ax = fin(tx) && fin(ty) ? tx - hc.x : 0, ay = fin(tx) && fin(ty) ? ty - hc.y : 0, d = Math.hypot(ax, ay), toward = isFinite(d) && d > 1e-6;
    if (toward && d > gap * 200) { ax = ax / d * gap * 200; ay = ay / d * gap * 200; }
    var sx = hc.x + ax, sy = hc.y + ay, skip = Object.create(null), best = null, bk = null;
    if (toward) skip[cellKey(cellOf(sx, sy, grid), grid)] = 1;    // the thrower's own cell never blocks (a token in a doorway)
    var less = function(a, b) { for (var n = 0; n < a.length; n++) if (a[n] !== b[n]) return a[n] < b[n]; return false; };
    for (var i = -R; i <= R; i++) for (var j = -R; j <= R; j++) {
        var c = grid.type === 'square' ? { c: hit.c + i, r: hit.r + j } : { q: hit.q + i, r: hit.r + j };
        if (blocked[cellKey(c, grid)]) continue;
        var ce = cellCenter(c, grid), near = Math.hypot(ce.x - hc.x, ce.y - hc.y), ring = Math.round(near / gap);
        if (ring < 1 || ring > R) continue;
        var key = [toward && segClear(ce.x, ce.y, sx, sy, grid, blocked, skip) ? 0 : 1, Math.round(near), toward && (ce.x - hc.x) * ax + (ce.y - hc.y) * ay > 0 ? 0 : 1, toward ? Math.round(Math.hypot(ce.x - sx, ce.y - sy)) : 0];
        if (!bk || less(key, bk)) { bk = key; best = ce; }
    }
    return best;
}
// Cover follow-ups (owner 2026-09-28): what a board piece gives as cover — 'hard' (it blocks sight: a wall, a pillar, a closed door, unless set to
// no cover), 'soft' (set to give cover without blocking sight: a crate, a low wall — never total), or null. Never a token (a token is not cover,
// and its absence from a fogged player's board would split the host's cover from theirs), a hidden piece, an open door or a rotated shape other
// than a circle (item 18: a turned shape and an image count too, by their outline). w.cover: 'yes' | 'no' | absent (as its sight) — read by
// comparison only (an import's value can be anything)
function coverRole(w) {
    if (!w || typeof w !== 'object' || w.hidden || w.isChar || w.waiting) return null;
    if (w.sightType === 'door' && w.doorOpen) return null;
    var shapeOk = !!w.fill || w.type === 'circle' || w.type === 'rect' || w.type === 'hexagon' || w.type === 'diamond' || w.type === 'image' || w.type === 'path';   // item 18 W2: a pen line as its line
    if (!shapeOk || w.cover === 'no') return null;
    if (w.blocksSight) return 'hard';
    return w.cover === 'yes' ? 'soft' : null;
}
// See-through barriers (1.5.1; the owner's ruling of 2026-10-03: "active force fields are see through and impassible"): a piece flagged
// barrier (only true counts) stops a player's token as a wall does and stops nothing else — a force field, bars, a window, a railing. Sight,
// light, a sense, a mark, the fog, smoke and the height rules never read it, and it gives cover only as any piece does (coverRole: cover
// 'yes'). The kinds of piece a sight-blocker may be: a fill cell, a rectangle, a hexagon, a circle, a diamond or an image by the cells its
// outline covers, a pen line as the line itself. Never a hidden piece, a token, a waiting token or a GM-note card (no player holds one), nor
// an open door. A piece that also blocks sight is a wall, as before: the flag adds nothing to it
function barrierOn(w) {
    if (!isObj(w) || w.barrier !== true || w.blocksSight || w.hidden || w.isChar || w.waiting || w.gmNoteFor) return false;
    if (w.sightType === 'door' && w.doorOpen) return false;
    return !!w.fill || w.type === 'rect' || w.type === 'hexagon' || w.type === 'diamond' || w.type === 'circle' || w.type === 'image' || w.type === 'path';
}
// A door: a wall or a barrier whose type is Door — it opens and closes (doorOpen), and the GM may lock it against players (doorLock)
function isDoor(w) { return isObj(w) && (w.blocksSight === true || w.barrier === true) && w.sightType === 'door'; }
// A drawing its player may no longer erase or redraw (the owner, by prompt, 2026-10-06: "Lock it for its player"): one the GM made a wall
// (Blocks sight, read as the wall judges read it: any value that blocks) or a see-through barrier (Stops movement only, only as true).
// Judged on the two flags alone: an open door is still the GM's piece, and so is a wall on a map whose fog is off. The GM unticks both to
// hand the line back. Asked by the host's patch path (net.js: a redraw and an erase) and by a player's own eraser (whiteboard.js)
function strokeHeld(w) { return isObj(w) && (!!w.blocksSight || w.barrier === true); }
// The flag as a file or a host may give it: true, or nothing
function cleanBarrier(v) { return v === true; }
// A barrier that also stops blasts (the owner, 2026-10-03: "A tick per barrier" — on for a force field or a window, off for bars or a
// railing): blastStop, only as true and only on a piece barrierOn calls a barrier (closed, shown, of a kind a wall may be). Such a barrier
// is hard cover to a BLAST alone — where a thrown blast is seated and what shields a token from it (fog.js coverSetsFor asked with blast
// true, by coverAt and blastSeat) — and to nothing else: sight, light, senses, marks, smoke, the height rules and an attack's cover never
// read it. A wall needs no tick: it is hard cover already
function blastStopOn(w) { return barrierOn(w) && w.blastStop === true; }
function cleanBlastStop(v) { return v === true; }

// A fog mark on a piece (1.5.4; the owner, 2026-10-04: "having a way to fill fog for a whole image would be good too", by prompt "A mark on
// the image"): fogHand 'hide' keeps every cell under the piece under fog for every player, 'show' keeps them revealed, whatever their tokens
// see — the Hide and the Reveal brush for a whole piece, following it as it moves. Only on a picture, a plain shape or a painted cell; never
// a hidden piece (no player holds it, so its mark counts for no one), a token, a waiting token or a GM-note card. Sight, light, movement and
// cover never read it: it is fog set by hand, read where the brushes' own cells are (fog.js pieceHand)
function fogHandOf(w) {
    if (!isObj(w) || (w.fogHand !== 'hide' && w.fogHand !== 'show') || w.hidden || w.isChar || w.waiting || w.gmNoteFor) return null;
    return (!!w.fill || w.type === 'image' || w.type === 'rect' || w.type === 'circle' || w.type === 'hexagon' || w.type === 'diamond') ? w.fogHand : null;
}
// The mark as a file or a host may give it: one of its two words, or nothing
function cleanFogHand(v) { return v === 'hide' || v === 'show' ? v : undefined; }
// The cells a hand brush of that width covers around one cell: the cell alone (r 0), or every cell within one or two cells of it — a block
// 3 or 5 cells wide on squares, 7 or 19 hexagons. Any other r is 0; a cell of the other grid's shape gives none
function cellsNear(cell, r, grid) {
    var c = cleanCell(cell), n = r === 1 || r === 2 ? r : 0, out = []; if (!c || !isObj(grid)) return out;
    if (grid.type === 'square') { if (c.c === undefined) return out; for (var dc = -n; dc <= n; dc++) for (var dr = -n; dr <= n; dr++) out.push({ c: c.c + dc, r: c.r + dr }); return out; }
    if (c.q === undefined) return out;
    for (var dq = -n; dq <= n; dq++) for (var d2 = Math.max(-n, -dq - n); d2 <= Math.min(n, -dq + n); d2++) out.push({ q: c.q + dq, r: c.r + d2 });
    return out;
}

/* ---------- a portal's own lock (the owner, 2026-10-03) ----------
   A portal is a play-map piece that leads to another map: by its own targetMapId, or through the room it is linked to (nodeId) when that
   room has one — the rule the board's marker and the host's travel have always read. A portal flagged portalLock (only true counts) lets no
   player travel through it until the GM unlocks it: the host is the judge (net.js travelBar, asked by hostTravel alone), and the GM's own
   hand is never stopped. Sight, light, senses, movement and cover never read the flag */
function isPortal(w, map) {
    if (!isObj(w)) return false;
    if (w.targetMapId) return true;
    if (!w.nodeId || !isObj(map) || !Array.isArray(map.rooms)) return false;
    for (var i = 0; i < map.rooms.length; i++) { var r = map.rooms[i]; if (isObj(r) && r.id === w.nodeId) return !!r.targetMapId; }   // the first room of that id, as the marker reads it
    return false;
}
// The flag as a file or a host may give it: true, or nothing
function cleanPortalLock(v) { return v === true; }

/* ---------- heights (item 19b, the owner's answers of 2026-10-01) ----------
   Pure, as the rest: fog.js gathers a map's pieces that have a height ({ cells: { cellKey: H }, lines: [{ segs, h }] }, yards) and asks here
   whether one of them stops the line between an eye and a target, so the host's drop, a player's own overlay and the cover readout agree.
   H4, the true 3D sightline: a piece stops a line only where the line runs AT OR BELOW its height where it passes the piece.
   H3, the rule "clears" (the cover readout's own, fog.js heightCover): a see-over piece stops it when looked at from below with the target
   no higher than the piece (eye < target <= piece), wherever on the line it stands. */
// The height of the straight line from (ax, ay) at ha to (bx, by) at hb where it passes (px, py): at the point of the line nearest that point,
// never past either end
function lineHeightAt(ax, ay, ha, bx, by, hb, px, py) {
    var dx = bx - ax, dy = by - ay, d2 = dx * dx + dy * dy, t = d2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / d2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return ha + (hb - ha) * t;
}
// Whether that line runs ABOVE height H there (at H exactly it does not: a piece blocks a line at or below its height). An end's height that
// is no number reads 0; a piece's that is no finite number is full height (never passed over); a place that is no number passes nothing
function lineOverHeight(ax, ay, ha, bx, by, hb, px, py, H) {
    if (!fin(H) || !fin(ax) || !fin(ay) || !fin(bx) || !fin(by) || !fin(px) || !fin(py)) return false;
    return lineHeightAt(ax, ay, fin(ha) ? ha : 0, bx, by, fin(hb) ? hb : 0, px, py) > H + 1e-9;
}
// ...and above a thin wall s = [x1, y1, x2, y2] of height H: judged where the line meets the wall's own line (a wall that runs along the line:
// at the wall's middle)
function lineOverWall(ax, ay, ha, bx, by, hb, s, H) {
    if (!Array.isArray(s) || s.length !== 4 || !fin(s[0]) || !fin(s[1]) || !fin(s[2]) || !fin(s[3])) return false;
    var rx = bx - ax, ry = by - ay, sx = s[2] - s[0], sy = s[3] - s[1], den = rx * sy - ry * sx, px = (s[0] + s[2]) / 2, py = (s[1] + s[3]) / 2;
    if (Math.abs(den) >= 1e-12) { var t = ((s[0] - ax) * sy - (s[1] - ay) * sx) / den; px = ax + rx * t; py = ay + ry * t; }
    return lineOverHeight(ax, ay, ha, bx, by, hb, px, py, H);
}
// Where along (ax, ay) -> (bx, by) the line crosses wall s, strictly between the line's ends (crossesWall's own test): 0..1, or -1 for none
function crossAt(ax, ay, bx, by, s) {
    var rx = bx - ax, ry = by - ay, sx = s[2] - s[0], sy = s[3] - s[1], den = rx * sy - ry * sx;
    if (Math.abs(den) < 1e-12) return -1;
    var qx = s[0] - ax, qy = s[1] - ay, t = (qx * sy - qy * sx) / den, u = (qx * ry - qy * rx) / den;
    return t > 1e-9 && t < 1 - 1e-9 && u >= -1e-9 && u <= 1 + 1e-9 ? t : -1;
}
// Whether a piece with a height stops the straight line of sight from cell a (the eye at height ha) to cell b (the target at hb). The line as
// lineClear walks it (centre to centre, every half cell, both end cells skipped: a viewer beside a crate sees out, a target in a piece's own
// cell is not hidden by it), each cell's piece judged once, at the cell's centre; a thin wall where the line crosses it. rule 'clears': H3's
// rule; anything else: the true 3D line. A height that is no number reads 0; a piece whose height is no number is no piece
function heightStops(a, b, grid, ha, hb, hs, rule) {
    if (!isObj(hs) || !isObj(grid) || !isObj(a) || !isObj(b)) return false;
    ha = fin(ha) ? ha : 0; hb = fin(hb) ? hb : 0;
    var below = rule === 'clears';
    if (below && !(ha < hb)) return false;   // only looked at from below
    var ak = cellKey(a, grid), bk = cellKey(b, grid); if (ak === bk) return false;
    var pa = cellCenter(a, grid), pb = cellCenter(b, grid), dx = pb.x - pa.x, dy = pb.y - pa.y, cells = isObj(hs.cells) ? hs.cells : null;
    if (cells) {
        var steps = Math.max(1, Math.ceil(Math.sqrt(dx * dx + dy * dy) / ((grid.type === 'square' ? grid.size : grid.s) / 2))), last = null;
        for (var i = 1; i < steps; i++) {
            var t = i / steps, c = cellOf(pa.x + dx * t, pa.y + dy * t, grid), k = cellKey(c, grid);
            if (k === last) continue; last = k;
            if (k === ak || k === bk) continue;
            var H = cells[k]; if (typeof H !== 'number' || !fin(H)) continue;
            if (below) { if (hb <= H) return true; continue; }
            var ctr = cellCenter(c, grid); if (!lineOverHeight(pa.x, pa.y, ha, pb.x, pb.y, hb, ctr.x, ctr.y, H)) return true;
        }
    }
    var lines = Array.isArray(hs.lines) ? hs.lines : [];
    for (var L = 0; L < lines.length; L++) {
        var g = lines[L]; if (!isObj(g) || !Array.isArray(g.segs) || typeof g.h !== 'number' || !fin(g.h)) continue;
        if (below && !(hb <= g.h)) continue;
        for (var j = 0; j < g.segs.length; j++) {
            var s = g.segs[j]; if (!Array.isArray(s) || s.length !== 4 || !fin(s[0]) || !fin(s[1]) || !fin(s[2]) || !fin(s[3])) continue;
            var tc = crossAt(pa.x, pa.y, pb.x, pb.y, s); if (tc < 0) continue;
            if (below || !(ha + (hb - ha) * tc > g.h + 1e-9)) return true;
        }
    }
    return false;
}

/* ---------- one viewer's visible cells ----------
   viewer: { x, y, front(deg), range(cells), arc(deg) }. Returns an array of { key, cell }. The vision SHAPE is the
   grid's (square = Euclidean radius disc; hex = the flat-top ring within hex distance), but the ARC is DECOUPLED from
   the grid type: arc >= 360 = all-around (the default on square); a smaller arc is a facing cone centred on `front`,
   honoured on BOTH grids (the default on hex is 180). The viewer's own cell is always included. When arc >= 360 the
   bearing test is skipped, so all-around vision costs exactly what it did before. */
function visibleCells(viewer, grid, blockers) {
    var out = [], seen = Object.create(null);
    if (!grid || !fin(viewer.x) || !fin(viewer.y)) return out;
    var R = clamp(viewer.range | 0, 0, LIMITS.rangeCells);
    var here = cellOf(viewer.x, viewer.y, grid);
    var arc = fin(viewer.arc) ? clamp(viewer.arc, 0, 360) : (grid.type === 'square' ? 360 : LIMITS.arcDeg);
    var allAround = arc >= 360, half = arc / 2, facing = fin(viewer.front) ? viewer.front : 0;
    var vc = cellCenter(here, grid);
    var inArc = function(cell) {   // is `cell` within the facing cone? (the own cell is handled by the caller)
        if (allAround) return true;
        var ctr = cellCenter(cell, grid);
        var bearing = Math.atan2(ctr.x - vc.x, -(ctr.y - vc.y)) * 180 / Math.PI;   // 0 = up, clockwise
        return Math.abs(norm180(bearing - facing)) <= half + 1e-9;
    };
    var push = function(cell) { if (out.length >= LIMITS.cells) return; var k = cellKey(cell, grid); if (!seen[k]) { seen[k] = 1; out.push({ key: k, cell: cell }); } };
    push(here);
    if (R <= 0) return out;
    // the line of sight to each cell, as lineClear walks it (centre to centre, every half cell, both end cells skipped) — over only the blockers
    // within R + 2 of the viewer (a segment inside the disc never samples a cell further out) and numeric cell codes, so a lit disc of 60 cells
    // stays quick; the same cells as lineClear over the whole set
    var sqG = grid.type === 'square', OFF = R + 3, STR = 2 * OFF + 1, bset = null;
    var code = function(cc) { return sqG ? (cc.c - here.c + OFF) * STR + (cc.r - here.r + OFF) : (cc.q - here.q + OFF) * STR + (cc.r - here.r + OFF); };
    if (blockers) {
        for (var bk in blockers) {
            var sp = bk.split(sqG ? ',' : ':'), bc = sqG ? { c: +sp[0], r: +sp[1] } : { q: +sp[0], r: +sp[1] };
            if (sp.length !== 2 || !fin(+sp[0]) || !fin(+sp[1])) continue;
            var bd = sqG ? Math.sqrt((bc.c - here.c) * (bc.c - here.c) + (bc.r - here.r) * (bc.r - here.r)) : hexDist(here, bc);
            if (bd > R + 2) continue;
            if (!bset) bset = Object.create(null);
            bset[code(bc)] = 1;
        }
    }
    var stepPx = (sqG ? grid.size : grid.s) / 2, hereCode = code(here);
    var wl = wallsOf(blockers), cellLen = sqG ? grid.size : grid.s * 2, reach = (R + 2) * cellLen;   // item 18 W2: only walls near the disc are asked
    if (wl) { wl = wl.filter(function(ix) { var b = ix.box; return !(b[0] > vc.x + reach || b[2] < vc.x - reach || b[1] > vc.y + reach || b[3] < vc.y - reach); }); if (!wl.length) wl = null; }
    var lineClear = function(a, cell) {
        if (!bset && !wl) return true;
        var pa = cellCenter(a, grid), pb = cellCenter(cell, grid), dx = pb.x - pa.x, dy = pb.y - pa.y, cellCode = code(cell);
        if (bset) {
            var steps = Math.max(1, Math.ceil(Math.sqrt(dx * dx + dy * dy) / stepPx));
            for (var i = 1; i < steps; i++) { var t = i / steps, cd = code(cellOf(pa.x + dx * t, pa.y + dy * t, grid)); if (cd !== hereCode && cd !== cellCode && bset[cd]) return false; }   // t as segClear computes it: the same floats, the same cells
        }
        return !(wl && wallHit(pa.x, pa.y, pb.x, pb.y, grid, wl));   // item 18 W2: as segClear asks its walls
    };
    if (grid.type === 'square') {
        for (var c = here.c - R; c <= here.c + R && out.length < LIMITS.cells; c++)
            for (var r = here.r - R; r <= here.r + R; r++) {
                var dc = c - here.c, dr = r - here.r;
                if (dc === 0 && dr === 0) continue;
                if (Math.sqrt(dc * dc + dr * dr) <= R + 1e-9 && inArc({ c: c, r: r }) && lineClear(here, { c: c, r: r })) push({ c: c, r: r });
            }
        return out;
    }
    // hex: cells within hex distance R, gated by the facing arc
    for (var q = here.q - R; q <= here.q + R && out.length < LIMITS.cells; q++)
        for (var rr = here.r - R; rr <= here.r + R; rr++) {
            var cell = { q: q, r: rr };
            if (hexDist(here, cell) > R) continue;
            if (q === here.q && rr === here.r) continue;
            if (inArc(cell) && lineClear(here, cell)) push(cell);
        }
    return out;
}

// Lighting (backlog 14, owner 2026-09-28): one viewer's seen cells, each with its tier — 2 clear or bright, 1 dim. ctx absent or its level not a
// number (lighting off): exactly visibleCells, every cell tier 2. ctx.level, the map's light (0 dark, 1 dim, 2 bright): a cell within the
// viewer's Sight (viewer.range: its sight in the dark) is seen clear whatever the light; beyond it, out to the vision cap, a dim or bright cell
// in the arc and the line of sight is seen at its level, a dark one is not
// L2: ctx.lit, the cells a map's light sources light ({ key: 1 | 2 }, litLevels): a cell is at the brighter of the map's light and its own. A
// wall's cell beyond the viewer's sight shows at the light on its near face — the brightest light of the open cells beside it this viewer sees,
// at least the map's own — never lit from behind, never by the viewer's sight in the dark; within the viewer's sight, clear
function seenCells(viewer, grid, blockers, ctx) {
    var lvl = ctx && fin(ctx.level) ? clamp(Math.round(ctx.level), 0, 2) : null, lit = ctx && isObj(ctx.lit) ? ctx.lit : null, out = [], anyLit = false;
    if (!viewer || !grid) return out;
    if (viewer.blind) { var own = fin(viewer.x) && fin(viewer.y) ? cellOf(viewer.x, viewer.y, grid) : null; if (own) out.push({ key: cellKey(own, grid), cell: own, tier: 2 }); return out; }   // senses S3: blind eyes see their own cell alone, whatever the light
    if (viewer.sense) return senseCells(viewer, grid, blockers, lvl, lit);   // senses S2a: judged before the dark and the lighting-off shortcuts

    if (lit) for (var lk in lit) { anyLit = true; break; }
    if (lvl === null || (lvl === 0 && !anyLit)) { var base = visibleCells(viewer, grid, blockers); for (var i = 0; i < base.length; i++) out.push({ key: base[i].key, cell: base[i].cell, tier: 2 }); return out; }
    var sight = clamp(viewer.range | 0, 0, LIMITS.rangeCells), here = fin(viewer.x) && fin(viewer.y) ? cellOf(viewer.x, viewer.y, grid) : null;
    var far = visibleCells({ x: viewer.x, y: viewer.y, front: viewer.front, arc: viewer.arc, range: LIMITS.rangeCells }, grid, blockers);
    var olit = Object.create(null), walls = [];   // the light on each open cell this viewer sees (never its sight in the dark)
    for (var j = 0; j < far.length; j++) {
        var o = far[j], isWall = !!(blockers && blockers[o.key]), lv = isWall ? 0 : Math.max(lvl, (lit && lit[o.key]) || 0);
        if (!isWall) olit[o.key] = lv;
        if (cellDist(here, o.cell, grid) <= sight + 1e-9) { out.push({ key: o.key, cell: o.cell, tier: 2 }); continue; }
        if (isWall) { walls.push(o); continue; }
        if (lv > 0) out.push({ key: o.key, cell: o.cell, tier: lv });
    }
    for (var w = 0; w < walls.length; w++) {
        var nb = neighbourCells(walls[w].cell, grid), best = lvl;
        for (var n = 0; n < nb.length; n++) { var nk = cellKey(nb[n], grid); if (olit[nk] > best) best = olit[nk]; }
        if (best > 0) out.push({ key: walls[w].key, cell: walls[w].cell, tier: best });
    }
    return out;
}
// Senses S2b: a token's own ranges for the system's senses (item.senses: [{ id, n }], set by the GM in its Properties) — a sense id of the
// system's pattern, each once, a range finite and within 0 to 100000 (0: that sense is off for this token), at most eight; null when none is
// left. Read as the app reads it, on the host, on the player's app for their own token and from a file
var SENSE_ID_RE = /^sn_[a-z0-9]{8}$/;
function cleanTokSenses(v) {
    if (!Array.isArray(v)) return null;
    var out = [], seen = Object.create(null);
    for (var i = 0; i < v.length && out.length < LIMITS.senses; i++) { var e = v[i]; if (!isObj(e) || typeof e.id !== 'string' || !SENSE_ID_RE.test(e.id) || seen[e.id] || !fin(e.n)) continue; seen[e.id] = 1; out.push({ id: e.id, n: clamp(e.n, 0, 100000) }); }
    return out.length ? out : null;
}
// Senses S4: which senses never mark a token (item.unsensed, the GM's) — true (none marks it), or at most eight sense ids; null for none
function cleanUnsensed(v) {
    if (v === true) return true;
    if (!Array.isArray(v)) return null;
    var out = [], seen = Object.create(null);
    for (var i = 0; i < v.length && out.length < LIMITS.senses; i++) { var e = v[i]; if (typeof e !== 'string' || !SENSE_ID_RE.test(e) || seen[e]) continue; seen[e] = 1; out.push(e); }
    return out.length ? out : null;
}
// Senses S7a: the senses a null area switches off for a token standing in it (item.nulls, the GM's) — at most eight sense ids by pattern, each
// once; null for none
function cleanNulls(v) {
    if (!Array.isArray(v)) return null;
    var out = [], seen = Object.create(null);
    for (var i = 0; i < v.length && out.length < LIMITS.senses; i++) { var e = v[i]; if (typeof e !== 'string' || !SENSE_ID_RE.test(e) || seen[e]) continue; seen[e] = 1; out.push(e); }
    return out.length ? out : null;
}
// Conditions C2 (docs/CONDITIONS_PLAN.md): the effects a token with no character sheet carries (item.fx, the GM's) — at most 12 rows, each
// once by id: a library effect by its id (once per token), or one made on the spot with a name (plain, 60 at most), an icon (64 characters at
// most: drawn only as the app's own cleaner keeps it) and a tone; null for none
var TOKFX_ROW = /^x_[A-Za-z0-9_]{1,24}$/, TOKFX_REF = /^e_[A-Za-z0-9_]{1,24}$/;
function cleanTokFx(v) {
    if (!Array.isArray(v)) return null;
    var out = [], ids = Object.create(null), refs = Object.create(null);
    for (var i = 0; i < v.length && out.length < 12; i++) {
        var r = v[i]; if (!isObj(r) || typeof r.id !== 'string' || !TOKFX_ROW.test(r.id) || ids[r.id]) continue;
        if (r.ref !== undefined) { if (typeof r.ref !== 'string' || !TOKFX_REF.test(r.ref) || refs[r.ref]) continue; ids[r.id] = 1; refs[r.ref] = 1; out.push({ id: r.id, ref: r.ref }); continue; }
        var nm = typeof r.name === 'string' ? r.name.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').trim().slice(0, 60) : ''; if (!nm) continue;
        ids[r.id] = 1;
        out.push({ id: r.id, name: nm, icon: typeof r.icon === 'string' ? r.icon.slice(0, 64) : '', tone: r.tone === 'buff' || r.tone === 'debuff' ? r.tone : '' });
    }
    return out.length ? out : null;
}
// Difficult terrain T1: what moving into a piece costs (item.terrain, the GM's) — a number rounded to a whole one, 2 to 10 (above 10 is 10);
// below 2, or anything but a finite number, is none (null)
// Item 19 H1 (the owner's answer: a Height box, shown in each viewer's own unit): a piece's height, kept in yards as a token's elevation is — a
// number above 0 and at most 10,000, to the hundredth; anything else none
function cleanHeight(v) { if (typeof v !== 'number' || !fin(v) || v <= 0) return null; return Math.min(10000, Math.round(v * 100) / 100) || null; }
function cleanTerrain(v) {
    if (typeof v !== 'number' || !isFinite(v)) return null;
    var n = Math.round(v);
    return n >= 2 ? Math.min(n, 10) : null;
}
// Item 19b H5 (the owner's answer of 2026-10-01, "Added": ground height — a hill, a ledge, a pit): a piece's ground, kept in yards as a token's
// elevation is — a number from -1000 to 1000, to the hundredth, below 0 for a pit; 0, or anything that is no number, none (null). A token
// standing on the piece is that much higher, on top of its own elevation (whiteboard.js tokenElevation). The map builder's materials will
// write it too
function cleanGround(v) { if (typeof v !== 'number' || !fin(v)) return null; var g = clamp(Math.round(v * 100) / 100, -1000, 1000); return g === 0 ? null : g; }
// ... what a piece gives as ground (0: none), read by its own key: a shape, an image or a filled region — never a token, a waiting token, a
// GM-note card, a pen line, a text, a trigger or a light
function groundOf(w) {
    if (!isObj(w) || w.isChar || w.waiting || w.gmNoteFor || !Object.prototype.hasOwnProperty.call(w, 'ground')) return 0;
    if (!(w.type === 'rect' || w.type === 'circle' || w.type === 'hexagon' || w.type === 'diamond' || w.type === 'image' || (w.type === 'path' && w.tip === 'fill'))) return 0;
    return cleanGround(w.ground) || 0;
}
// A filled region's board segments (pathSegs: scaled and turned as the board draws it) and the box they span, kept while its outline, its
// holes and its place stand
var REGION_SEGS = typeof WeakMap === 'function' ? new WeakMap() : null;
function regionSegs(w) {
    var sig = [w.x, w.y, w.w, w.h, w.baseW, w.baseH, w.rot, Array.isArray(w.pts) ? w.pts.length : -1, Array.isArray(w.holes) ? w.holes.length : -1].join(','), got = REGION_SEGS ? REGION_SEGS.get(w) : null;
    if (got && got.sig === sig && got.pts === w.pts && got.holes === w.holes) return got;
    var segs = pathSegs(w), x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (var i = 0; i < segs.length; i++) { var s = segs[i]; x0 = Math.min(x0, s[0], s[2]); x1 = Math.max(x1, s[0], s[2]); y0 = Math.min(y0, s[1], s[3]); y1 = Math.max(y1, s[1], s[3]); }
    got = { sig: sig, pts: w.pts, holes: w.holes, segs: segs, x0: x0, x1: x1, y0: y0, y1: y1 };
    if (REGION_SEGS) REGION_SEGS.set(w, got);
    return got;
}
// Whether a piece's outline covers a board point, read as itemCells reads an outline: a cell is one of a piece's cells exactly when its centre
// is covered (fogcheck proves the two agree, turned or not, on both grids). A painted cell covers its one cell (with a grid); a filled region
// its outline less its holes, even-odd as the board draws it; a pen line covers nothing
function itemCovers(w, px, py, grid) {
    if (!isObj(w) || !fin(w.x) || !fin(w.y) || !fin(px) || !fin(py)) return false;
    var ww = fin(w.w) ? w.w : 0, hh = fin(w.h) ? w.h : 0, cx = w.x + ww / 2, cy = w.y + hh / 2;
    if (w.fill && isObj(grid)) return cellKey(cellOf(px, py, grid), grid) === cellKey(cellOf(cx, cy, grid), grid);
    if (w.type === 'path') {
        if (w.tip !== 'fill') return false;
        var rs = regionSegs(w), inside = false; if (px < rs.x0 || px > rs.x1 || py < rs.y0 || py > rs.y1) return false;
        for (var i = 0; i < rs.segs.length; i++) { var s = rs.segs[i]; if ((s[1] > py) !== (s[3] > py) && px < (s[2] - s[0]) * (py - s[1]) / (s[3] - s[1]) + s[0]) inside = !inside; }
        return inside;
    }
    var kind = w.type === 'hexagon' ? 'hex' : w.type === 'circle' ? 'ell' : w.type === 'diamond' ? 'dia' : 'rect', rot = fin(w.rot) ? w.rot % 360 : 0, rx = ww / 2 || 1, ry = hh / 2 || 1;
    if (!rot || (kind === 'ell' && ww === hh)) {
        if (!(px >= w.x && px <= w.x + ww && py >= w.y && py <= w.y + hh)) return false;   // cellsUnderRect's own test of a cell's centre
        if (kind === 'hex') return pointInFlatHex(px, py, cx, cy, ww, hh);
        if (kind === 'ell') { var ex = (px - cx) / rx, ey = (py - cy) / ry; return ex * ex + ey * ey <= 1 + 1e-9; }
        if (kind === 'dia') return Math.abs(px - cx) / rx + Math.abs(py - cy) / ry <= 1 + 1e-9;
        return true;
    }
    var rad = rot * Math.PI / 180, co = Math.cos(rad), si = Math.sin(rad), bw = Math.abs(ww * co) + Math.abs(hh * si), bh = Math.abs(ww * si) + Math.abs(hh * co), bx = cx - bw / 2, by = cy - bh / 2;
    if (!(px >= bx && px <= bx + bw && py >= by && py <= by + bh)) return false;   // the turned box, as itemCells lists its cells
    var dx = px - cx, dy = py - cy, lx = dx * co + dy * si, ly = -dx * si + dy * co;   // the point in the piece's own frame
    return kind === 'hex' ? pointInFlatHex(lx, ly, 0, 0, ww, hh) : kind === 'ell' ? (lx / rx) * (lx / rx) + (ly / ry) * (ly / ry) <= 1 + 1e-9
        : kind === 'dia' ? Math.abs(lx) / rx + Math.abs(ly) / ry <= 1 + 1e-9 : Math.abs(lx) <= ww / 2 + 1e-9 && Math.abs(ly) <= hh / 2 + 1e-9;
}
// The ground under a board point of a map's pieces (wb), in yards: the highest ground of the pieces whose outline covers the centre of the
// point's cell — the cell the cover readers put a token in; with no grid, the point itself — and 0 where none does. A pit alone is below 0;
// under a hill the hill wins (the owner: where ground pieces overlap the highest wins). shown: only the pieces players hold, never one the GM
// hid (what a host works out for its players); a player's own copy holds no hidden piece
function groundAt(wb, x, y, grid, shown) {
    if (!Array.isArray(wb) || !fin(x) || !fin(y)) return 0;
    var g = isObj(grid) ? grid : null, p = g ? cellCenter(cellOf(x, y, g), g) : { x: x, y: y }, best = null;
    for (var i = 0; i < wb.length; i++) {
        var w = wb[i], gr = groundOf(w); if (!gr || (shown && w.hidden) || (best !== null && gr <= best)) continue;
        if (itemCovers(w, p.x, p.y, g)) best = gr;
    }
    return best === null ? 0 : best;
}
// Senses S7a: a player's own tokens whose senses a null area switches off, as their app takes it from the host (map.fogOff) — keys only of
// ownIds (their own tokens on that map), each a list cleanNulls keeps; null for none
function cleanFogOff(v, ownIds) {
    if (!isObj(v) || Array.isArray(v) || !isObj(ownIds)) return null;
    var out = Object.create(null), n = 0;
    Object.keys(v).forEach(function(id) { if (n >= LIMITS.marks || ownIds[id] !== 1) return; var ids = cleanNulls(v[id]); if (ids) { out[id] = ids; n++; } });
    return n ? out : null;
}
// Senses S4: the host's marks — for each creature, nearest first to any viewer, the first of the player's mark senses that finds it: within
// its range (free to test), in its arc, along a clear line unless it passes walls (only lines count, at most LIMITS.markTests: past that the far
// creatures go untested). One mark per cell, the lowest glyph number winning; past LIMITS.marks cells the nearest kept; sorted by cell key, so
// neither their order nor how many share a cell says anything. viewers: [{ x, y, front, range (cells), arc, pass, k (1-4), sid }]; creatures:
// [{ x, y, skip, id }] (skip: true, or { senseId: 1 } for the senses that never mark it). { marks: [{ c, r, k } | { q, r, k }], capped }.
// found (S4b, the host's held marks): an object each creature any sense finds is named in by its id (1), whether or not its cell already had a
// better mark; the marks themselves are the same with or without it. smoke (S7b): { cellKey: 1 } a sense the walls stop and that does not see
// through smoke (viewer.veil) neither finds a creature in nor sees past
function markCells(viewers, creatures, grid, blockers, found, smoke) {
    var out = { marks: [], capped: false }; if (!grid || !Array.isArray(viewers) || !Array.isArray(creatures)) return out;
    var vs = [];
    viewers.forEach(function(v) { if (isObj(v) && fin(v.x) && fin(v.y) && fin(v.range) && v.range > 0 && (v.k === 1 || v.k === 2 || v.k === 3 || v.k === 4)) vs.push({ v: v, cell: cellOf(v.x, v.y, grid), range: Math.min(v.range, LIMITS.rangeCells) }); });
    if (!vs.length) return out;
    var cs = [];
    creatures.forEach(function(cr) {
        if (!isObj(cr) || !fin(cr.x) || !fin(cr.y) || cr.skip === true) return;
        var cell = cellOf(cr.x, cr.y, grid), d = Infinity;
        vs.forEach(function(o) { var dd = cellDist(o.cell, cell, grid); if (dd < d) d = dd; });
        cs.push({ cell: cell, key: cellKey(cell, grid), d: d, skip: isObj(cr.skip) ? cr.skip : null, id: cr.id, open: cr.open === true });   // item 19b: open — a piece hides it in a cell its player sees (fog.js)
    });
    var byKey = function(a, b) { return a.key < b.key ? -1 : a.key > b.key ? 1 : 0; };
    cs.sort(function(a, b) { return a.d - b.d || byKey(a, b); });
    var got = Object.create(null), tests = 0, withSmoke = null;
    if (isObj(smoke)) { withSmoke = Object.create(null); var bk; if (blockers) for (bk in blockers) withSmoke[bk] = 1; for (bk in smoke) withSmoke[bk] = 1; copyWalls(blockers, withSmoke); copyWalls(smoke, withSmoke); }   // the owed review, 2026-10-09: the thin walls too, as unionSets and fog.js smokeUnion carry them (with the cells alone, one Smoke piece anywhere made every pen-line wall stop no mark sense)
    cs.forEach(function(cr) {
        vs.forEach(function(o) {
            var v = o.v, g = got[cr.key], better = !g || v.k < g.k;
            if (!better && !(found && typeof cr.id === 'string' && found[cr.id] !== 1)) return;
            if (cr.skip && typeof v.sid === 'string' && cr.skip[v.sid] === 1) return;
            if (isObj(v.hid) && !Array.isArray(v.hid) && typeof cr.id === 'string' && v.hid[cr.id] === 1) return;   // item 19b: a piece hides this creature from this viewer's token at their heights (fog.js heightVeto), as a wall would
            if (!(cellDist(o.cell, cr.cell, grid) <= o.range + 1e-9) || !cellInArc(v, cr.cell, grid)) return;
            var smk = !v.pass && withSmoke && !v.veil;   // senses S7b: smoke hides a creature in it and past it from such a sense
            if (smk && smoke[cr.key] === 1) return;
            var bl = smk ? withSmoke : blockers;
            if (!v.pass && bl) { if (tests >= LIMITS.markTests) { out.capped = true; return; } tests++; if (!lineClear(o.cell, cr.cell, grid, bl)) return; }
            if (found && typeof cr.id === 'string') found[cr.id] = 1;
            if (better) got[cr.key] = { cell: cr.cell, key: cr.key, d: cr.d, k: v.k, s: cr.open || !!(g && g.s) };
        });
    });
    var list = Object.keys(got).map(function(key) { return got[key]; });
    if (list.length > LIMITS.marks) { out.capped = true; list.sort(function(a, b) { return a.d - b.d || byKey(a, b); }); list = list.slice(0, LIMITS.marks); }
    list.sort(byKey);
    out.marks = list.map(function(o) { var m = o.cell.q !== undefined ? { q: o.cell.q, r: o.cell.r, k: o.k } : { c: o.cell.c, r: o.cell.r, k: o.k }; if (o.s) m.s = 1; return m; });   // item 19b: s — the creature stands in a cell its player sees, hidden by a piece: the mark is drawn there all the same
    return out;
}
// Senses S4: a player's marks as their app takes them from the host — a whole cell and a glyph number 1-4, nothing else (item 19b: and s, only as 1); the first mark of a cell;
// none on a cell of one of this player's own tokens (ownKeys: their cells' keys); at most LIMITS.marks; null for none
function cleanFogMarks(v, ownKeys) {
    if (!Array.isArray(v)) return null;
    var out = [], seen = Object.create(null);
    for (var i = 0; i < v.length && out.length < LIMITS.marks; i++) {
        var e = v[i], c = cleanCell(e); if (!c || !(e.k === 1 || e.k === 2 || e.k === 3 || e.k === 4)) continue;
        var key = c.q !== undefined ? c.q + ':' + c.r : c.c + ',' + c.r; if (seen[key] === 1 || (ownKeys && ownKeys[key] === 1)) continue;
        seen[key] = 1; c.k = e.k; if (e.s === 1) c.s = 1; out.push(c);
    }
    return out.length ? out : null;
}
// Senses S2a: what a full sense sees — every cell in its range and arc, along a clear line unless it passes walls (pass: no blocker at all),
// light or none: clear (tier 2); one that sees the dark as dim (dim) shows a cell at its own light raised to dim at least (a wall's own cell
// at the map's level). With lighting off every cell it reaches is clear. No lit cell beyond its range
function senseCells(viewer, grid, blockers, lvl, lit) {
    var cells = visibleCells(viewer, grid, viewer.pass ? null : blockers), out = [];
    for (var i = 0; i < cells.length; i++) {
        var o = cells[i], t = 2;
        if (viewer.dim && lvl !== null) { var lv = blockers && blockers[o.key] ? lvl : Math.max(lvl, (lit && lit[o.key]) || 0); t = lv >= 2 ? 2 : 1; }
        out.push({ key: o.key, cell: o.cell, tier: t });
    }
    return out;
}
// Lighting (L2): a board item's light — { bright, dim } radii in yards (dim, the outer edge, at least bright: equal is no dim fringe, as a
// ShadowBase glowrod), off: true while switched off. null when it gives none. Numbers only, clamped, read by comparison (an import can hold
// anything). L4: unit, what the radii count in when not yards (ft, m or cells), and name, the preset it was copied from (text, shown escaped)
function cleanLight(l) {
    if (!isObj(l)) return null;
    var b = fin(l.bright) ? clamp(l.bright, 0, 1000) : 0, d = fin(l.dim) ? clamp(l.dim, 0, 1000) : 0;
    if (d < b) d = b;
    if (b <= 0 && d <= 0) return null;
    var out = { bright: b, dim: d }; if (l.off === true) out.off = true;
    var u = lightUnit(l.unit); if (u) out.unit = u;
    var nm = cleanName(l.name, LIMITS.lightName); if (nm) out.name = nm;
    return out;
}
// Whether a cell lies in a viewer's facing arc — visibleCells' own test, for a point query: all around, or within half the arc of its facing;
// its own cell always
function cellInArc(viewer, cell, grid) {
    if (!viewer || !cell || !grid || !fin(viewer.x) || !fin(viewer.y)) return false;
    var arc = fin(viewer.arc) ? clamp(viewer.arc, 0, 360) : (grid.type === 'square' ? 360 : LIMITS.arcDeg);
    if (arc >= 360) return true;
    var here = cellOf(viewer.x, viewer.y, grid); if (cellKey(here, grid) === cellKey(cell, grid)) return true;
    var vc = cellCenter(here, grid), ctr = cellCenter(cell, grid), bearing = Math.atan2(ctr.x - vc.x, -(ctr.y - vc.y)) * 180 / Math.PI;
    return Math.abs(norm180(bearing - (fin(viewer.front) ? viewer.front : 0))) <= arc / 2 + 1e-9;
}
// Lighting (L2): the light each cell gets from a map's light sources — 2 within a source's bright radius, 1 out to its dim radius — along a clear
// line from the source's cell (walls stop light as they stop sight). A wall's own cell takes none: a viewer's rule shows its lit face. sources:
// [{ cell, bright, dim }], radii in cells. Past LIMITS.lightVisits cells walked: null (the map reads dark, never lit by half)
function litLevels(sources, grid, blockers) {
    var out = Object.create(null), visits = 0;
    if (!grid || !Array.isArray(sources)) return out;
    for (var i = 0; i < sources.length; i++) {
        var s = sources[i]; if (!s || !s.cell) continue;
        var R = clamp(Math.max(s.bright | 0, s.dim | 0), 0, LIMITS.rangeCells), B = s.bright < 0 ? -1 : clamp(s.bright | 0, 0, R), src = cellCenter(s.cell, grid);   // bright -1: a dim-only light (its own cell dim too)
        var cells = visibleCells({ x: src.x, y: src.y, range: R, arc: 360 }, grid, blockers);
        visits += cells.length; if (visits > LIMITS.lightVisits) return null;
        for (var j = 0; j < cells.length; j++) {
            var c = cells[j]; if (blockers && blockers[c.key]) continue;
            var lv = cellDist(s.cell, c.cell, grid) <= B + 1e-9 ? 2 : 1;
            if (!(out[c.key] >= lv)) out[c.key] = lv;
        }
    }
    return out;
}
// Lighting (L3, owner answer 2): the lit cells a host sends one player — cells they see that a light they cannot see lights (a torch round a
// corner): { c, r, t } or { q, r, t }, t 1 dim or 2 bright. Whatever arrives: at most LIMITS.cells such cells, anything else dropped; null if none
function cleanFogLit(a) {
    if (!Array.isArray(a)) return null;
    var out = [];
    for (var i = 0; i < a.length && out.length < LIMITS.cells; i++) { var e = a[i], c = cleanCell(e); if (c && (e.t === 1 || e.t === 2)) { c.t = e.t; out.push(c); } }
    return out.length ? out : null;
}
// A cell's neighbours: 8 on a square grid, 6 on a hex one
function neighbourCells(cell, grid) {
    if (grid.type === 'square') { var sq = []; for (var dc = -1; dc <= 1; dc++) for (var dr = -1; dr <= 1; dr++) if (dc || dr) sq.push({ c: cell.c + dc, r: cell.r + dr }); return sq; }
    return [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]].map(function(d) { return { q: cell.q + d[0], r: cell.r + d[1] }; });
}
// The distance between two cells as vision measures it: straight-line cells on a square grid, hex steps on a hex grid
function cellDist(a, b, grid) { if (!a || !b || !grid) return Infinity; if (grid.type === 'square') { var dc = a.c - b.c, dr = a.r - b.r; return Math.sqrt(dc * dc + dr * dr); } return hexDist(a, b); }

// The union of a party's viewers → a Set of revealed cell keys (plus manual adds, minus manual cuts).
function revealedKeys(viewers, grid, manual, blockers) {
    var set = Object.create(null);
    (viewers || []).forEach(function(v) { visibleCells(v, grid, blockers).forEach(function(o) { set[o.key] = 1; }); });
    if (manual && Array.isArray(manual.adds)) manual.adds.forEach(function(cell) { set[cellKey(cell, grid)] = 1; });
    if (manual && Array.isArray(manual.cuts)) manual.cuts.forEach(function(cell) { delete set[cellKey(cell, grid)]; });
    return set;
}
// Is a board point inside a revealed cell?
function pointRevealed(keySet, x, y, grid) { return !!(grid && keySet[cellKey(cellOf(x, y, grid), grid)]); }

/* ---------- validators ---------- */
function cleanCell(cell) {   // grid-agnostic: a square cell is {c,r}, a hex cell {q,r} — keep whichever shape it carries
    if (!isObj(cell)) return null;
    if (fin(cell.q) && fin(cell.r)) return { q: cell.q | 0, r: cell.r | 0 };
    if (fin(cell.c) && fin(cell.r)) return { c: cell.c | 0, r: cell.r | 0 };
    return null;
}
// Vision mode: { mode:'all', arc:360 } (all-around) or { mode:'arc', arc:1..360 } (a facing cone). Anything else → null,
// which means "no explicit vision" — the caller then falls back to the grid-type default (square all-around, hex 180).
function cleanVision(v) {
    if (!isObj(v)) return null;
    if (v.mode === 'all') return { mode: 'all', arc: 360 };
    if (v.mode === 'arc') return { mode: 'arc', arc: fin(v.arc) ? clamp(Math.round(v.arc), 1, 360) : LIMITS.arcDeg };
    return null;
}
function cleanFog(fog) {   // per-map: { on, mode, vision?, cell?, manual:{adds,cuts} }
    if (!isObj(fog)) return null;
    var out = { on: fog.on === true, mode: MODES[fog.mode] ? fog.mode : 'auto' };
    var vis = cleanVision(fog.vision); if (vis) out.vision = vis;   // absent → grid-type default is resolved at read time
    if (fog.light === 'bright' || fog.light === 'dim' || fog.light === 'dark') out.light = fog.light;   // lighting (backlog 14): the map's light; absent = auto
    if (isObj(fog.cell) && (fog.cell.grid === 'square' || fog.cell.grid === 'hex') && fin(fog.cell.len)) out.cell = { grid: fog.cell.grid, len: clamp(fog.cell.len, LIMITS.len[0], LIMITS.len[1]) };
    if (fin(fog.epoch) && fog.epoch >= 1) out.epoch = clamp(Math.floor(fog.epoch), 1, 1e9);   // senses S6: bumped by Cover all and Reveal all, which empties every player's memory of the map; absent = 0
    var m = isObj(fog.manual) ? fog.manual : {};
    var adds = [], cuts = [];
    (Array.isArray(m.adds) ? m.adds : []).forEach(function(c) { if (adds.length < LIMITS.manual) { var cc = cleanCell(c); if (cc) adds.push(cc); } });
    (Array.isArray(m.cuts) ? m.cuts : []).forEach(function(c) { if (cuts.length < LIMITS.manual) { var cc = cleanCell(c); if (cc) cuts.push(cc); } });
    out.manual = { adds: adds, cuts: cuts };
    return out;
}
function cleanCampFog(cf) {   // campaign-level: { fields:{sight, sightUnit?}, defaults:{sight, vision?, on?} } — vision/on = the new-map defaults
    if (!isObj(cf)) return { fields: {}, defaults: { sight: 0 } };
    var f = isObj(cf.fields) ? cf.fields : {}, d = isObj(cf.defaults) ? cf.defaults : {};
    var out = { fields: {}, defaults: { sight: fin(d.sight) ? clamp(d.sight, 0, 100000) : 0 } };
    if (typeof f.sight === 'string' && /^f_[A-Za-z0-9_]{1,24}$/.test(f.sight)) out.fields.sight = f.sight;
    var su = lightUnit(f.sightUnit); if (su) out.fields.sightUnit = su;   // lighting (L4): what sight counts in (the field and the default) when not yards — ft, m or cells
    var dv = cleanVision(d.vision); if (dv) out.defaults.vision = dv;   // stamped onto new maps only (never retroactive)
    if (d.on === true) out.defaults.on = true;   // "new maps start with fog on" — stamped onto new maps only, never retroactive (stored only when true)
    if (d.emptyFog === 'none') out.defaults.emptyFog = 'none';   // a map with NO play-area item marked: 'none' = no fog; default (absent) = fog the whole map
    if (d.marks === 'turn') out.defaults.marks = 'turn';   // senses S4b: "Marks in a fight" On your own turn; absent = as they move
    if (d.remember === false) out.defaults.remember = false;   // senses S6: "Players remember what they have seen" is ON unless the GM unticked it (the owner, 2026-10-04: "on by default"): only the tick taken away is stored; an older save's true means what an absent key means now
    return out;
}

var API = { VERSION: VERSION, LIMITS: LIMITS, RULESETS: RULESETS, MODES: MODES, squareGrid: squareGrid, hexGrid: hexGrid, gridFor: gridFor, cellOf: cellOf, cellCenter: cellCenter, cellKey: cellKey, hexDist: hexDist, rangeToCells: rangeToCells, cellsUnderRect: cellsUnderRect, cellsUnderHex: cellsUnderHex, cellsUnderCircle: cellsUnderCircle, cellsUnderDiamond: cellsUnderDiamond, itemCells: itemCells, itemOver: itemOver, pathSegs: pathSegs, pathCells: pathCells, withWalls: withWalls, wallsOf: wallsOf, copyWalls: copyWalls, wallEdgeCells: wallEdgeCells, lineClear: lineClear, moveClear: moveClear, cellCorners: cellCorners, coverBetween: coverBetween, coverFromPoint: coverFromPoint, openSeat: openSeat, coverRole: coverRole, barrierOn: barrierOn, isDoor: isDoor, strokeHeld: strokeHeld, cleanBarrier: cleanBarrier, blastStopOn: blastStopOn, cleanBlastStop: cleanBlastStop, fogHandOf: fogHandOf, cleanFogHand: cleanFogHand, cellsNear: cellsNear, isPortal: isPortal, cleanPortalLock: cleanPortalLock, visibleCells: visibleCells, seenCells: seenCells, cellDist: cellDist, cleanLight: cleanLight, cleanTokSenses: cleanTokSenses, cleanUnsensed: cleanUnsensed, cleanNulls: cleanNulls, cleanTerrain: cleanTerrain, cleanHeight: cleanHeight, cleanGround: cleanGround, itemCovers: itemCovers, groundAt: groundAt, cleanTokFx: cleanTokFx, terrainFactor: terrainFactor, cleanFogOff: cleanFogOff, markCells: markCells, lineOverHeight: lineOverHeight, lineOverWall: lineOverWall, heightStops: heightStops, cleanFogMarks: cleanFogMarks, lightUnit: lightUnit, unitCells: unitCells, cellInArc: cellInArc, litLevels: litLevels, neighbourCells: neighbourCells, cleanFogLit: cleanFogLit, revealedKeys: revealedKeys, pointRevealed: pointRevealed, cleanVision: cleanVision, cleanFog: cleanFog, cleanCampFog: cleanCampFog };
if (typeof window !== 'undefined') window.wpFogCore = API;
export { VERSION, LIMITS, RULESETS, MODES, squareGrid, hexGrid, gridFor, cellOf, cellCenter, cellKey, hexDist, rangeToCells, cellsUnderRect, cellsUnderHex, cellsUnderCircle, cellsUnderDiamond, itemCells, itemOver, pathSegs, pathCells, withWalls, wallsOf, copyWalls, wallEdgeCells, lineClear, moveClear, cellCorners, coverBetween, coverFromPoint, openSeat, coverRole, barrierOn, isDoor, strokeHeld, cleanBarrier, blastStopOn, cleanBlastStop, fogHandOf, cleanFogHand, cellsNear, isPortal, cleanPortalLock, visibleCells, seenCells, cellDist, cleanLight, cleanTokSenses, cleanUnsensed, cleanNulls, cleanTerrain, cleanHeight, cleanGround, itemCovers, groundAt, cleanTokFx, terrainFactor, cleanFogOff, markCells, lineOverHeight, lineOverWall, heightStops, cleanFogMarks, lightUnit, unitCells, cellInArc, litLevels, neighbourCells, cleanFogLit, revealedKeys, pointRevealed, cleanVision, cleanFog, cleanCampFog };

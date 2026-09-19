/* Fog of war / dynamic vision (1.5.0, v1) — the pure half: grid cell geometry (square 50px, flat-top hex s=30/52,
   or a gridless map's assigned cell), a viewer token's visible-cell set (D&D radius on square, GURPS front-180°
   arc on hex), the range→cells conversion, the revealed-point test, and the validators for map.fog / camp.fog.
   No DOM, no state: the host (enforcement) and the client (overlay) run the SAME code so they agree on what is
   seen. tools/fogcheck.js runs it under Node. Published as window.wpFogCore. Design of record: docs/FOG_OF_WAR_PLAN.md. */
'use strict';

var VERSION = '1.5.0';
var LIMITS = Object.freeze({
    rangeCells: 60,     // a viewer's sight, in cells, after conversion — hard cap so a bad field can't sweep the board
    cells: 8000,        // the most visible cells one recompute yields
    manual: 4000,       // manual reveal/hide cells stored per map
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

/* ---------- one viewer's visible cells ----------
   viewer: { x, y, front(deg), range(cells), ruleset, arc(deg, default 180) }. Returns an array of { key, cell }.
   D&D/square: every cell whose centre is within `range` cells (Euclidean). GURPS/hex: cells within hex distance
   `range` that lie in the front arc (the viewer's own cell always included). */
function visibleCells(viewer, grid) {
    var out = [], seen = Object.create(null);
    if (!grid || !fin(viewer.x) || !fin(viewer.y)) return out;
    var R = clamp(viewer.range | 0, 0, LIMITS.rangeCells);
    var here = cellOf(viewer.x, viewer.y, grid);
    var push = function(cell) { if (out.length >= LIMITS.cells) return; var k = cellKey(cell, grid); if (!seen[k]) { seen[k] = 1; out.push({ key: k, cell: cell }); } };
    push(here);
    if (R <= 0) return out;
    if (grid.type === 'square') {
        for (var c = here.c - R; c <= here.c + R && out.length < LIMITS.cells; c++)
            for (var r = here.r - R; r <= here.r + R; r++) {
                var dc = c - here.c, dr = r - here.r;
                if (Math.sqrt(dc * dc + dr * dr) <= R + 1e-9) push({ c: c, r: r });
            }
        return out;   // D&D is all-around; facing ignored on square in v1
    }
    // hex GURPS: front arc
    var arc = fin(viewer.arc) ? viewer.arc : LIMITS.arcDeg, half = arc / 2, facing = fin(viewer.front) ? viewer.front : 0;
    for (var q = here.q - R; q <= here.q + R && out.length < LIMITS.cells; q++)
        for (var rr = here.r - R; rr <= here.r + R; rr++) {
            var cell = { q: q, r: rr };
            if (hexDist(here, cell) > R) continue;
            if (q === here.q && rr === here.r) continue;
            var ctr = cellCenter(cell, grid), vc = cellCenter(here, grid);
            var bearing = Math.atan2(ctr.x - vc.x, -(ctr.y - vc.y)) * 180 / Math.PI;   // 0 = up, clockwise
            if (arc >= 360 || Math.abs(norm180(bearing - facing)) <= half + 1e-9) push(cell);
        }
    return out;
}

// The union of a party's viewers → a Set of revealed cell keys (plus manual adds, minus manual cuts).
function revealedKeys(viewers, grid, manual) {
    var set = Object.create(null);
    (viewers || []).forEach(function(v) { visibleCells(v, grid).forEach(function(o) { set[o.key] = 1; }); });
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
function cleanFog(fog) {   // per-map: { on, mode, ruleset?, cell?, manual:{adds,cuts} }
    if (!isObj(fog)) return null;
    var out = { on: fog.on === true, mode: MODES[fog.mode] ? fog.mode : 'auto' };
    if (fog.ruleset && RULESETS[fog.ruleset]) out.ruleset = fog.ruleset;
    if (isObj(fog.cell) && (fog.cell.grid === 'square' || fog.cell.grid === 'hex') && fin(fog.cell.len)) out.cell = { grid: fog.cell.grid, len: clamp(fog.cell.len, LIMITS.len[0], LIMITS.len[1]) };
    var m = isObj(fog.manual) ? fog.manual : {};
    var adds = [], cuts = [];
    (Array.isArray(m.adds) ? m.adds : []).forEach(function(c) { if (adds.length < LIMITS.manual) { var cc = cleanCell(c); if (cc) adds.push(cc); } });
    (Array.isArray(m.cuts) ? m.cuts : []).forEach(function(c) { if (cuts.length < LIMITS.manual) { var cc = cleanCell(c); if (cc) cuts.push(cc); } });
    out.manual = { adds: adds, cuts: cuts };
    return out;
}
function cleanCampFog(cf) {   // campaign-level: { fields:{sight}, defaults:{sight} } (v1 = sight only)
    if (!isObj(cf)) return { fields: {}, defaults: { sight: 0 } };
    var f = isObj(cf.fields) ? cf.fields : {}, d = isObj(cf.defaults) ? cf.defaults : {};
    var out = { fields: {}, defaults: { sight: fin(d.sight) ? clamp(d.sight, 0, 100000) : 0 } };
    if (typeof f.sight === 'string' && /^f_[A-Za-z0-9_]{1,24}$/.test(f.sight)) out.fields.sight = f.sight;
    return out;
}

var API = { VERSION: VERSION, LIMITS: LIMITS, RULESETS: RULESETS, MODES: MODES, squareGrid: squareGrid, hexGrid: hexGrid, gridFor: gridFor, cellOf: cellOf, cellCenter: cellCenter, cellKey: cellKey, hexDist: hexDist, rangeToCells: rangeToCells, visibleCells: visibleCells, revealedKeys: revealedKeys, pointRevealed: pointRevealed, cleanFog: cleanFog, cleanCampFog: cleanCampFog };
if (typeof window !== 'undefined') window.wpFogCore = API;
export { VERSION, LIMITS, RULESETS, MODES, squareGrid, hexGrid, gridFor, cellOf, cellCenter, cellKey, hexDist, rangeToCells, visibleCells, revealedKeys, pointRevealed, cleanFog, cleanCampFog };

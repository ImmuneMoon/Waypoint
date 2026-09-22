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
    cells: 8000,        // the most visible cells one recompute yields
    manual: 4000,       // manual reveal/hide cells stored per map
    blockerCells: 6000, // sight-blocker cells resolved per map — over this, occlusion falls open (no blocking)
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

/* ---------- sight-blockers (line-of-sight occlusion, v1: static walls) ----------
   Pure & item-blind: fog.js converts flagged board items to a Set of opaque cell KEYS and passes
   it to visibleCells, so host enforcement and the client overlay run the SAME code and agree. */
// Cells whose CENTRE lies inside an axis-aligned board rect [x,x+w]x[y,y+h].
function cellsUnderRect(x, y, w, h, grid) {
    var out = [], cs = [cellOf(x, y, grid), cellOf(x + w, y, grid), cellOf(x, y + h, grid), cellOf(x + w, y + h, grid)];
    if (grid.type === 'square') {
        var c0 = Infinity, c1 = -Infinity, r0 = Infinity, r1 = -Infinity;
        cs.forEach(function(c) { c0 = Math.min(c0, c.c); c1 = Math.max(c1, c.c); r0 = Math.min(r0, c.r); r1 = Math.max(r1, c.r); });
        for (var c = c0; c <= c1; c++) for (var r = r0; r <= r1; r++) { var p = cellCenter({ c: c, r: r }, grid); if (p.x >= x && p.x <= x + w && p.y >= y && p.y <= y + h) out.push({ c: c, r: r }); }
    } else {
        var q0 = Infinity, q1 = -Infinity, s0 = Infinity, s1 = -Infinity;
        cs.forEach(function(c) { q0 = Math.min(q0, c.q); q1 = Math.max(q1, c.q); s0 = Math.min(s0, c.r); s1 = Math.max(s1, c.r); });
        for (var q = q0 - 2; q <= q1 + 2; q++) for (var rr = s0 - 2; rr <= s1 + 2; rr++) { var p2 = cellCenter({ q: q, r: rr }, grid); if (p2.x >= x && p2.x <= x + w && p2.y >= y && p2.y <= y + h) out.push({ q: q, r: rr }); }
    }
    return out;
}
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
function coverBetween(aCell, bCell, grid, blockers) {
    var out = { lines: 0, blocked: 0, coverage: 0, lineOfEffect: true };
    if (!aCell || !bCell || !grid) return out;
    var aKey = cellKey(aCell, grid), bKey = cellKey(bCell, grid);
    if (aKey === bKey) return out;                       // same cell: no cover
    var ca = cellCorners(aCell, grid), cb = cellCorners(bCell, grid), n = Math.min(ca.length, cb.length);
    out.lines = n;
    if (!blockers || n <= 0) return out;                 // no blockers → fully clear
    var skip = Object.create(null); skip[aKey] = 1; skip[bKey] = 1;
    var side = function(src, dst) {                      // fewest blocked lines from any one src corner to all dst corners
        var best = dst.length;
        for (var i = 0; i < src.length; i++) {
            var blk = 0;
            for (var j = 0; j < dst.length; j++) if (!segClear(src[i].x, src[i].y, dst[j].x, dst[j].y, grid, blockers, skip)) blk++;
            if (blk < best) best = blk;
        }
        return best;
    };
    var mb = Math.min(side(ca, cb), side(cb, ca));
    out.blocked = mb > n ? n : mb;
    out.lineOfEffect = out.blocked < n;                  // the best corner still has at least one clear line
    out.coverage = Math.min(out.blocked / n, 0.999);
    return out;
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
    if (grid.type === 'square') {
        for (var c = here.c - R; c <= here.c + R && out.length < LIMITS.cells; c++)
            for (var r = here.r - R; r <= here.r + R; r++) {
                var dc = c - here.c, dr = r - here.r;
                if (dc === 0 && dr === 0) continue;
                if (Math.sqrt(dc * dc + dr * dr) <= R + 1e-9 && inArc({ c: c, r: r }) && lineClear(here, { c: c, r: r }, grid, blockers)) push({ c: c, r: r });
            }
        return out;
    }
    // hex: cells within hex distance R, gated by the facing arc
    for (var q = here.q - R; q <= here.q + R && out.length < LIMITS.cells; q++)
        for (var rr = here.r - R; rr <= here.r + R; rr++) {
            var cell = { q: q, r: rr };
            if (hexDist(here, cell) > R) continue;
            if (q === here.q && rr === here.r) continue;
            if (inArc(cell) && lineClear(here, cell, grid, blockers)) push(cell);
        }
    return out;
}

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
    if (isObj(fog.cell) && (fog.cell.grid === 'square' || fog.cell.grid === 'hex') && fin(fog.cell.len)) out.cell = { grid: fog.cell.grid, len: clamp(fog.cell.len, LIMITS.len[0], LIMITS.len[1]) };
    var m = isObj(fog.manual) ? fog.manual : {};
    var adds = [], cuts = [];
    (Array.isArray(m.adds) ? m.adds : []).forEach(function(c) { if (adds.length < LIMITS.manual) { var cc = cleanCell(c); if (cc) adds.push(cc); } });
    (Array.isArray(m.cuts) ? m.cuts : []).forEach(function(c) { if (cuts.length < LIMITS.manual) { var cc = cleanCell(c); if (cc) cuts.push(cc); } });
    out.manual = { adds: adds, cuts: cuts };
    return out;
}
function cleanCampFog(cf) {   // campaign-level: { fields:{sight}, defaults:{sight, vision?, on?} } — vision/on = the new-map defaults
    if (!isObj(cf)) return { fields: {}, defaults: { sight: 0 } };
    var f = isObj(cf.fields) ? cf.fields : {}, d = isObj(cf.defaults) ? cf.defaults : {};
    var out = { fields: {}, defaults: { sight: fin(d.sight) ? clamp(d.sight, 0, 100000) : 0 } };
    if (typeof f.sight === 'string' && /^f_[A-Za-z0-9_]{1,24}$/.test(f.sight)) out.fields.sight = f.sight;
    var dv = cleanVision(d.vision); if (dv) out.defaults.vision = dv;   // stamped onto new maps only (never retroactive)
    if (d.on === true) out.defaults.on = true;   // "new maps start with fog on" — stamped onto new maps only, never retroactive (stored only when true)
    if (d.emptyFog === 'none') out.defaults.emptyFog = 'none';   // a map with NO play-area item marked: 'none' = no fog; default (absent) = fog the whole map
    return out;
}

var API = { VERSION: VERSION, LIMITS: LIMITS, RULESETS: RULESETS, MODES: MODES, squareGrid: squareGrid, hexGrid: hexGrid, gridFor: gridFor, cellOf: cellOf, cellCenter: cellCenter, cellKey: cellKey, hexDist: hexDist, rangeToCells: rangeToCells, cellsUnderRect: cellsUnderRect, cellsUnderHex: cellsUnderHex, cellsUnderCircle: cellsUnderCircle, cellsUnderDiamond: cellsUnderDiamond, lineClear: lineClear, cellCorners: cellCorners, coverBetween: coverBetween, visibleCells: visibleCells, revealedKeys: revealedKeys, pointRevealed: pointRevealed, cleanVision: cleanVision, cleanFog: cleanFog, cleanCampFog: cleanCampFog };
if (typeof window !== 'undefined') window.wpFogCore = API;
export { VERSION, LIMITS, RULESETS, MODES, squareGrid, hexGrid, gridFor, cellOf, cellCenter, cellKey, hexDist, rangeToCells, cellsUnderRect, cellsUnderHex, cellsUnderCircle, cellsUnderDiamond, lineClear, cellCorners, coverBetween, visibleCells, revealedKeys, pointRevealed, cleanVision, cleanFog, cleanCampFog };

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
    blockerCells: 6000, // sight-blocker cells resolved per map — over this, occlusion falls open (no blocking)
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

// Turn-based combat T3a (D11, owner 2026-09-26): a token's straight move from one point to another is clear unless it lands in, or crosses, a
// cell a sight-blocker occupies. Its start cell never counts (a token the GM left in a wall can step out). No blockers or no grid: clear
function moveClear(x1, y1, x2, y2, grid, blockers) {
    if (!blockers || !grid || !fin(x1) || !fin(y1) || !fin(x2) || !fin(y2)) return true;
    var s = Object.create(null), a = cellKey(cellOf(x1, y1, grid), grid), b = cellKey(cellOf(x2, y2, grid), grid); s[a] = 1;
    if (b !== a && blockers[b]) return false;
    return segClear(x1, y1, x2, y2, grid, blockers, s);
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
function unionSets(a, b) { if (!b) return a; var u = Object.create(null), k; if (a) for (k in a) u[k] = 1; for (k in b) u[k] = 1; return u; }
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
// than a circle. w.cover: 'yes' | 'no' | absent (as its sight) — read by comparison only (an import's value can be anything)
function coverRole(w) {
    if (!w || typeof w !== 'object' || w.hidden || w.isChar || w.waiting) return null;
    if (w.sightType === 'door' && w.doorOpen) return null;
    var shapeOk = w.type === 'circle' || (!w.rot && (!!w.fill || w.type === 'rect' || w.type === 'hexagon' || w.type === 'diamond'));
    if (!shapeOk || w.cover === 'no') return null;
    if (w.blocksSight) return 'hard';
    return w.cover === 'yes' ? 'soft' : null;
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
    var lineClear = function(a, cell) {
        if (!bset) return true;
        var pa = cellCenter(a, grid), pb = cellCenter(cell, grid), dx = pb.x - pa.x, dy = pb.y - pa.y, cellCode = code(cell);
        var steps = Math.max(1, Math.ceil(Math.sqrt(dx * dx + dy * dy) / stepPx));
        for (var i = 1; i < steps; i++) { var t = i / steps, cd = code(cellOf(pa.x + dx * t, pa.y + dy * t, grid)); if (cd !== hereCode && cd !== cellCode && bset[cd]) return false; }   // t as segClear computes it: the same floats, the same cells
        return true;
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
// Senses S4: the host's marks — for each creature, nearest first to any viewer, the first of the player's mark senses that finds it: within
// its range (free to test), in its arc, along a clear line unless it passes walls (only lines count, at most LIMITS.markTests: past that the far
// creatures go untested). One mark per cell, the lowest glyph number winning; past LIMITS.marks cells the nearest kept; sorted by cell key, so
// neither their order nor how many share a cell says anything. viewers: [{ x, y, front, range (cells), arc, pass, k (1-4), sid }]; creatures:
// [{ x, y, skip, id }] (skip: true, or { senseId: 1 } for the senses that never mark it). { marks: [{ c, r, k } | { q, r, k }], capped }.
// found (S4b, the host's held marks): an object each creature any sense finds is named in by its id (1), whether or not its cell already had a
// better mark; the marks themselves are the same with or without it
function markCells(viewers, creatures, grid, blockers, found) {
    var out = { marks: [], capped: false }; if (!grid || !Array.isArray(viewers) || !Array.isArray(creatures)) return out;
    var vs = [];
    viewers.forEach(function(v) { if (isObj(v) && fin(v.x) && fin(v.y) && fin(v.range) && v.range > 0 && (v.k === 1 || v.k === 2 || v.k === 3 || v.k === 4)) vs.push({ v: v, cell: cellOf(v.x, v.y, grid), range: Math.min(v.range, LIMITS.rangeCells) }); });
    if (!vs.length) return out;
    var cs = [];
    creatures.forEach(function(cr) {
        if (!isObj(cr) || !fin(cr.x) || !fin(cr.y) || cr.skip === true) return;
        var cell = cellOf(cr.x, cr.y, grid), d = Infinity;
        vs.forEach(function(o) { var dd = cellDist(o.cell, cell, grid); if (dd < d) d = dd; });
        cs.push({ cell: cell, key: cellKey(cell, grid), d: d, skip: isObj(cr.skip) ? cr.skip : null, id: cr.id });
    });
    var byKey = function(a, b) { return a.key < b.key ? -1 : a.key > b.key ? 1 : 0; };
    cs.sort(function(a, b) { return a.d - b.d || byKey(a, b); });
    var got = Object.create(null), tests = 0;
    cs.forEach(function(cr) {
        vs.forEach(function(o) {
            var v = o.v, g = got[cr.key], better = !g || v.k < g.k;
            if (!better && !(found && typeof cr.id === 'string' && found[cr.id] !== 1)) return;
            if (cr.skip && typeof v.sid === 'string' && cr.skip[v.sid] === 1) return;
            if (!(cellDist(o.cell, cr.cell, grid) <= o.range + 1e-9) || !cellInArc(v, cr.cell, grid)) return;
            if (!v.pass && blockers) { if (tests >= LIMITS.markTests) { out.capped = true; return; } tests++; if (!lineClear(o.cell, cr.cell, grid, blockers)) return; }
            if (found && typeof cr.id === 'string') found[cr.id] = 1;
            if (better) got[cr.key] = { cell: cr.cell, key: cr.key, d: cr.d, k: v.k };
        });
    });
    var list = Object.keys(got).map(function(key) { return got[key]; });
    if (list.length > LIMITS.marks) { out.capped = true; list.sort(function(a, b) { return a.d - b.d || byKey(a, b); }); list = list.slice(0, LIMITS.marks); }
    list.sort(byKey);
    out.marks = list.map(function(o) { return o.cell.q !== undefined ? { q: o.cell.q, r: o.cell.r, k: o.k } : { c: o.cell.c, r: o.cell.r, k: o.k }; });
    return out;
}
// Senses S4: a player's marks as their app takes them from the host — a whole cell and a glyph number 1-4, nothing else; the first mark of a cell;
// none on a cell of one of this player's own tokens (ownKeys: their cells' keys); at most LIMITS.marks; null for none
function cleanFogMarks(v, ownKeys) {
    if (!Array.isArray(v)) return null;
    var out = [], seen = Object.create(null);
    for (var i = 0; i < v.length && out.length < LIMITS.marks; i++) {
        var e = v[i], c = cleanCell(e); if (!c || !(e.k === 1 || e.k === 2 || e.k === 3 || e.k === 4)) continue;
        var key = c.q !== undefined ? c.q + ':' + c.r : c.c + ',' + c.r; if (seen[key] === 1 || (ownKeys && ownKeys[key] === 1)) continue;
        seen[key] = 1; c.k = e.k; out.push(c);
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
    if (d.remember === true) out.defaults.remember = true;   // senses S6: "Players remember what they have seen"; absent = off
    return out;
}

var API = { VERSION: VERSION, LIMITS: LIMITS, RULESETS: RULESETS, MODES: MODES, squareGrid: squareGrid, hexGrid: hexGrid, gridFor: gridFor, cellOf: cellOf, cellCenter: cellCenter, cellKey: cellKey, hexDist: hexDist, rangeToCells: rangeToCells, cellsUnderRect: cellsUnderRect, cellsUnderHex: cellsUnderHex, cellsUnderCircle: cellsUnderCircle, cellsUnderDiamond: cellsUnderDiamond, lineClear: lineClear, moveClear: moveClear, cellCorners: cellCorners, coverBetween: coverBetween, coverFromPoint: coverFromPoint, openSeat: openSeat, coverRole: coverRole, visibleCells: visibleCells, seenCells: seenCells, cellDist: cellDist, cleanLight: cleanLight, cleanTokSenses: cleanTokSenses, cleanUnsensed: cleanUnsensed, markCells: markCells, cleanFogMarks: cleanFogMarks, lightUnit: lightUnit, unitCells: unitCells, cellInArc: cellInArc, litLevels: litLevels, neighbourCells: neighbourCells, cleanFogLit: cleanFogLit, revealedKeys: revealedKeys, pointRevealed: pointRevealed, cleanVision: cleanVision, cleanFog: cleanFog, cleanCampFog: cleanCampFog };
if (typeof window !== 'undefined') window.wpFogCore = API;
export { VERSION, LIMITS, RULESETS, MODES, squareGrid, hexGrid, gridFor, cellOf, cellCenter, cellKey, hexDist, rangeToCells, cellsUnderRect, cellsUnderHex, cellsUnderCircle, cellsUnderDiamond, lineClear, moveClear, cellCorners, coverBetween, coverFromPoint, openSeat, coverRole, visibleCells, seenCells, cellDist, cleanLight, cleanTokSenses, cleanUnsensed, markCells, cleanFogMarks, lightUnit, unitCells, cellInArc, litLevels, neighbourCells, cleanFogLit, revealedKeys, pointRevealed, cleanVision, cleanFog, cleanCampFog };

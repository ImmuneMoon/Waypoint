/* Map builder (1.5.1, backlog item 23, fold B1) — the pure half: the eight code-drawn textures a piece may wear (a NAME from a frozen
   list, drawn here as a seamless SVG tile — never a file, never an address), the seven materials of the palette and the props bag a
   piece of each takes, the Wall-line preset the pen takes, and the lattice maths the palette lays pieces by (a square box snapped to
   the lattice, a hexagon seated on its cell, a corridor, a polygon's vertex and item, the piece already seated where a new one would
   go). No state, no DOM; tools/buildcheck.js runs it under Node, and whiteboard.js (the palette) imports it. Published as
   window.wpBuildCore.

   The owner's decisions of 2026-10-01 (docs/MAP_BUILDER_PLAN.md, Design 3):
   - a texture is a code-drawn pattern named from a frozen list (fogcore cleanTexture keeps the same eight, in both views): a piece
     carries item.texture = 'bricks', and every machine draws the same tile from the same constants — nothing is fetched;
   - a piece is an ordinary board item with today's flags (blocksSight / sightType, cover, terrain, layer), so fog, cover, light,
     movement and the inspector read it as they read any shape, and an older install shows it as a plain coloured shape;
   - a wall drawn as a line is the pen's thin wall of item 18 W2 (a path with blocksSight), never a textured stroke;
   - whether a piece gives cover is the GM's to decide per piece ("depends on the GM's intention. should be flexible"): a material
     only sets the default, the tick on the piece wins.

   The tiles: drawn twice, the grid overlay's own recipe (whiteboard hexBgCss) — a dark line under a narrower light one, round caps,
   no fill — an embossed groove that reads over any base colour and in both themes. Each tile is a whole number of pixels (a
   fractional tile drifts in Chrome), 50 px where it has joints so they fall on the square lattice; every stroke that reaches a
   tile's edge leaves it at the same place it enters the next, so the 2x2 tiling shows no seam, and a piece's background position
   is taken from its board place (texPos), so abutting pieces continue one pattern. */
'use strict';

import { cellOf, cellCenter, cellKey, cellsUnderRect, cleanTerrain } from './fogcore.js';   // the one lattice the fog, cover and movement read
import { cssColor } from './safecore.js';   // one colour rule for the GM's screen and the wire (safecore COLOR_RE)

var VERSION = 1;

function isObj(v) { return v !== null && typeof v === 'object'; }
function fin(v) { return typeof v === 'number' && isFinite(v); }
function mod(v, m) { v = fin(v) ? v : 0; return ((v % m) + m) % m; }   // never negative: a piece left of the origin tiles as one right of it
function r2(v) { return Math.round(v * 100) / 100; }
function frozenTable(o) { var t = Object.create(null), k; for (k in o) if (Object.prototype.hasOwnProperty.call(o, k)) t[k] = Object.freeze(o[k]); return Object.freeze(t); }

/* ---------- textures ---------- */
var TEXTURES = Object.freeze(['flagstones', 'bricks', 'cobbles', 'planks', 'stone', 'hatching', 'ripples', 'grass']);
function cleanTexture(v) { return typeof v === 'string' && TEXTURES.indexOf(v) >= 0 ? v : null; }

// name -> { w, h, d, dark, light, fill? }: the tile's size in whole pixels, ONE path drawn twice (dark under light, the widths), and for
// stone a faint fill under the grooves. Only M L H V C Q A Z, digits, '.', ',', '-' and spaces may appear in a path
var TEX = frozenTable({
    // running bond of 50 x 25 stones, the courses and joints offset by half a stone from the tile's edge so no joint lies on the seam;
    // the joints wobble a little and meet the course lines where they bend
    flagstones: { w: 50, h: 50, dark: 2.2, light: 1,
        d: 'M 0 12.5 L 12.5 13.2 L 27 12.1 L 39 12.8 L 50 12.5 M 0 37.5 L 12.5 37.4 L 24 38.1 L 37.5 37.2 L 50 37.5 M 12.5 13.2 L 13.3 25 L 12.5 37.4 M 37.5 37.2 L 38.1 44 L 37.5 50 M 37.5 0 L 36.9 6 L 37.5 12.7' },
    // four 12.5 px courses of 25 x 12.5 bricks, a half-brick stagger, everything shifted 6.25 so no line lies on the seam
    bricks: { w: 50, h: 50, dark: 1.6, light: 0.7,
        d: 'M 0 6.25 H 50 M 0 18.75 H 50 M 0 31.25 H 50 M 0 43.75 H 50 M 6.25 6.25 V 18.75 M 31.25 6.25 V 18.75 M 18.75 18.75 V 31.25 M 43.75 18.75 V 31.25 M 6.25 31.25 V 43.75 M 31.25 31.25 V 43.75 M 18.75 43.75 V 50 M 43.75 43.75 V 50 M 18.75 0 V 6.25 M 43.75 0 V 6.25' },
    // two rows of three rounded stones, the second row half a stone over: its end stone straddles the seam, so it is drawn at both edges
    cobbles: { w: 50, h: 50, dark: 1.8, light: 0.8,
        d: 'M 1.1 12.5 A 7.2 10.4 0 1 0 15.5 12.5 A 7.2 10.4 0 1 0 1.1 12.5 Z M 17.9 12.3 A 7.1 10.6 0 1 0 32.1 12.3 A 7.1 10.6 0 1 0 17.9 12.3 Z M 34.5 12.6 A 7.2 10.3 0 1 0 48.9 12.6 A 7.2 10.3 0 1 0 34.5 12.6 Z '
            + 'M -7.2 37.5 A 7.2 10.4 0 1 0 7.2 37.5 A 7.2 10.4 0 1 0 -7.2 37.5 Z M 42.8 37.5 A 7.2 10.4 0 1 0 57.2 37.5 A 7.2 10.4 0 1 0 42.8 37.5 Z M 9.6 37.3 A 7.1 10.5 0 1 0 23.8 37.3 A 7.1 10.5 0 1 0 9.6 37.3 Z M 26.1 37.7 A 7.2 10.3 0 1 0 40.5 37.7 A 7.2 10.3 0 1 0 26.1 37.7 Z' },
    // four 12.5 px boards along x, shifted 6.25 off the seam, an end joint staggered board to board (the fourth board wraps the seam), a few grain ticks
    planks: { w: 50, h: 50, dark: 1.6, light: 0.7,
        d: 'M 0 6.25 H 50 M 0 18.75 H 50 M 0 31.25 H 50 M 0 43.75 H 50 M 11 6.25 V 18.75 M 36 18.75 V 31.25 M 22 31.25 V 43.75 M 44 43.75 V 50 M 44 0 V 6.25 '
            + 'M 22 12 L 29 12.4 M 39 13 L 45 12.8 M 5 25.5 L 12 25 M 43 24.6 L 48 25 M 30 37 L 38 37.5 M 5 38 L 11 37.6 M 12 47 L 20 46.6 M 31 2.6 L 38 3' },
    // five irregular closed quads kept inside the tile (the gaps read as mortar at the seam), a faint fill under them: rubble, rock
    stone: { w: 50, h: 50, dark: 1.8, light: 0.8, fill: 'rgba(0,0,0,0.12)',
        d: 'M 3 3 L 22 2 L 24 16 L 5 19 Z M 27 3 L 47 6 L 45 20 L 29 18 Z M 2 24 L 15 22 L 18 33 L 4 36 Z M 21 22 L 46 25 L 44 38 L 23 36 Z M 7 40 L 40 41 L 37 47 L 9 47 Z' },
    // 45-degree lines y = x + c, c every 12.5 px offset by half a step so none passes a corner; each leaves an edge where its twin enters
    hatching: { w: 50, h: 50, dark: 1.6, light: 0.7,
        d: 'M 0 6.25 L 43.75 50 M 0 18.75 L 31.25 50 M 0 31.25 L 18.75 50 M 0 43.75 L 6.25 50 M 6.25 0 L 50 43.75 M 18.75 0 L 50 31.25 M 31.25 0 L 50 18.75 M 43.75 0 L 50 6.25' },
    // three wave rows 16 px apart (a 48 px tile), period 25 (twice across the tile), the middle row half a period out of phase
    ripples: { w: 50, h: 48, dark: 1.6, light: 0.8,
        d: 'M 0 8 Q 6.25 2 12.5 8 Q 18.75 14 25 8 Q 31.25 2 37.5 8 Q 43.75 14 50 8 M 0 24 Q 6.25 30 12.5 24 Q 18.75 18 25 24 Q 31.25 30 37.5 24 Q 43.75 18 50 24 M 0 40 Q 6.25 34 12.5 40 Q 18.75 46 25 40 Q 31.25 34 37.5 40 Q 43.75 46 50 40' },
    // four tufts of three short blades, each bending outward from its own foot (never one point: that reads as a bird's), all inside the tile
    grass: { w: 50, h: 50, dark: 1.8, light: 0.8,
        d: 'M 10 18 Q 9.5 13 7 10 M 12 18 Q 12.5 12.5 12 8 M 14 18 Q 15 13 17 11 M 34 14 Q 33.5 9 31 6 M 36 14 Q 36.5 8.5 36 4 M 38 14 Q 39 9 41 7 '
            + 'M 18 43 Q 17.5 38 15 35 M 20 43 Q 20.5 37.5 20 33 M 22 43 Q 23 38 25 36 M 40 37 Q 39.5 32 37 29 M 42 37 Q 42.5 31.5 42 27 M 44 37 Q 45 32 47 30' }
});
var DARK = 'rgba(0,0,0,0.38)', LIGHT = 'rgba(255,255,255,0.18)', SVG_NS = 'http://www.w3.org/2000/svg';

// The tile as an SVG document, exactly as hexBgCss builds the grid's: single quotes only, so it travels in a data: URL
function tileSvg(t) {
    var s = "<svg xmlns='" + SVG_NS + "' width='" + t.w + "' height='" + t.h + "' viewBox='0 0 " + t.w + ' ' + t.h + "'>";
    if (t.fill) s += "<path d='" + t.d + "' fill='" + t.fill + "' stroke='none'/>";
    s += "<g stroke='" + DARK + "' stroke-width='" + t.dark + "' fill='none' stroke-linecap='round'><path d='" + t.d + "'/></g>";
    s += "<g stroke='" + LIGHT + "' stroke-width='" + t.light + "' fill='none' stroke-linecap='round'><path d='" + t.d + "'/></g></svg>";
    return s;
}
// name -> { image, size }: the CSS a piece's element takes, built once from the constants above
var TEX_CSS = (function() {
    var o = {};
    for (var i = 0; i < TEXTURES.length; i++) { var t = TEX[TEXTURES[i]]; o[TEXTURES[i]] = { image: 'url("data:image/svg+xml,' + encodeURIComponent(tileSvg(t)) + '")', size: t.w + 'px ' + t.h + 'px' }; }
    return frozenTable(o);
})();
function px(v) { return v ? '-' + v + 'px' : '0px'; }
// The background position that puts the tile's origin on the board's: pieces at x = 0 and x = 100 wearing a 50 px tile show one pattern
function texPos(x, y, name) {
    var n = cleanTexture(name); if (!n) return '0px 0px';
    return px(mod(x, TEX[n].w)) + ' ' + px(mod(y, TEX[n].h));
}
function texStyle(name, x, y) {
    var n = cleanTexture(name); if (!n) return null;
    return { image: TEX_CSS[n].image, size: TEX_CSS[n].size, position: texPos(x, y, n) };
}
// The same tile as an SVG <pattern> for a piece drawn in SVG (a hexagon's plate, a polygon): built with createElementNS only, never markup.
// serial: the caller's count (a whole number from 0), the id 'wptex' + it; color: the base colour under the grooves, a css colour or
// 'transparent'. The caller sets patternTransform itself where its SVG is scaled
function texPattern(doc, name, x, y, color, serial) {
    if (!doc || typeof doc.createElementNS !== 'function') return null;
    var n = cleanTexture(name); if (!n) return null;
    var t = TEX[n], sn = fin(serial) && serial >= 0 && Math.floor(serial) === serial ? serial : 0;
    var p = doc.createElementNS(SVG_NS, 'pattern');
    p.setAttribute('id', 'wptex' + sn);
    p.setAttribute('patternUnits', 'userSpaceOnUse');
    p.setAttribute('width', String(t.w)); p.setAttribute('height', String(t.h));
    p.setAttribute('x', String(-mod(x, t.w))); p.setAttribute('y', String(-mod(y, t.h)));
    var r = doc.createElementNS(SVG_NS, 'rect');
    r.setAttribute('width', String(t.w)); r.setAttribute('height', String(t.h)); r.setAttribute('fill', cssColor(color, 'transparent'));
    p.appendChild(r);
    if (t.fill) { var f = doc.createElementNS(SVG_NS, 'path'); f.setAttribute('d', t.d); f.setAttribute('fill', t.fill); f.setAttribute('stroke', 'none'); p.appendChild(f); }
    var strokes = [[DARK, t.dark], [LIGHT, t.light]];
    for (var i = 0; i < 2; i++) {
        var g = doc.createElementNS(SVG_NS, 'g');
        g.setAttribute('stroke', strokes[i][0]); g.setAttribute('stroke-width', String(strokes[i][1])); g.setAttribute('fill', 'none'); g.setAttribute('stroke-linecap', 'round');
        var path = doc.createElementNS(SVG_NS, 'path'); path.setAttribute('d', t.d); g.appendChild(path); p.appendChild(g);
    }
    return p;
}

/* ---------- materials ---------- */
var MATERIALS = frozenTable({
    floor: { name: 'Floor', texture: 'flagstones', color: '#5a5663', layer: 'back' },
    wall: { name: 'Wall', texture: 'bricks', color: '#3f3b47', layer: 'back-mid', blocksSight: true, sightType: 'wall' },
    door: { name: 'Door', texture: 'planks', color: '#6b4a2a', layer: 'back-mid', blocksSight: true, sightType: 'door' },
    water: { name: 'Water', texture: 'ripples', color: '#2e5d86', layer: 'back', terrain: 2 },
    rubble: { name: 'Rubble', texture: 'stone', color: '#55505c', layer: 'back-mid', cover: 'yes' },
    wood: { name: 'Wood floor', texture: 'planks', color: '#7a5634', layer: 'back' },
    grass: { name: 'Grass', texture: 'grass', color: '#4b6b36', layer: 'back' }
});
var MATERIAL_IDS = Object.freeze(['floor', 'wall', 'door', 'water', 'rubble', 'wood', 'grass']);
function cleanMaterial(v) { return typeof v === 'string' && MATERIAL_IDS.indexOf(v) >= 0 ? v : null; }
var HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
function hexColor(v) { return typeof v === 'string' && HEX_RE.test(v) && cssColor(v) === v ? v : null; }

// The props a new piece of a material takes, with the GM's overrides from the palette — a fresh bag built by whitelist (nothing is copied
// from the overrides object, so a hostile key never rides along); null for an unknown material. Never written here whatever the overrides
// say: fill, rot, isChar, waiting, hidden, gmNoteFor, doorOpen, doorLock, light, id, type, x, y, w, h, pts, src, height, opacity (the
// caller adds newOpacityProps()). Rules:
//   color       the override when it is a #rgb / #rrggbb / #rrggbbaa literal, else the material's
//   texture     the override when cleanTexture keeps it; the material's when the override is undefined OR an unknown string (a name this
//               build does not know falls back to the material's default, never to none); ABSENT for '' or null ("Plain colour")
//   blocksSight / sightType   the material's as given; blocksSight: false drops both (a piece that blocks nothing is no door either, so it
//               wins over door: true); door: true on any material sets blocksSight: true, sightType: 'door'
//   cover       true -> 'yes', false -> absent, undefined -> the material's (Rubble's default, the GM's tick deciding per piece)
//   terrain     a number -> fogcore cleanTerrain of it (2..10) or absent; 0, false, null or anything else -> absent; undefined -> the material's
function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined; }   // an override is read as the bag's own key only, never inherited
function picks(ov) { var o = isObj(ov) ? ov : {}, p = {}, ks = ['color', 'texture', 'blocksSight', 'door', 'cover', 'terrain']; for (var i = 0; i < ks.length; i++) p[ks[i]] = own(o, ks[i]); return p; }
function pieceProps(matId, ov) {
    var id = cleanMaterial(matId); if (!id) return null;
    var m = MATERIALS[id], o = picks(ov), out = {};
    out.color = hexColor(o.color) || m.color;
    out.layer = m.layer;
    out.name = m.name.slice(0, 60);
    if (o.texture === undefined) out.texture = m.texture;
    else if (o.texture !== '' && o.texture !== null) out.texture = cleanTexture(o.texture) || m.texture;
    if (o.blocksSight === false) { /* neither key */ }
    else if (o.door === true) { out.blocksSight = true; out.sightType = 'door'; }
    else if (m.blocksSight) { out.blocksSight = true; out.sightType = m.sightType; }
    if (o.cover === true) out.cover = 'yes';
    else if (o.cover !== false && m.cover) out.cover = m.cover;
    if (o.terrain === undefined) { if (m.terrain) out.terrain = m.terrain; }
    else if (typeof o.terrain === 'number') { var t = cleanTerrain(o.terrain); if (t) out.terrain = t; }
    return out;
}
// The Wall-line preset the pen takes for a wall or a door drawn as a line: item 18 W2's thin wall (a path with blocksSight), a square tip,
// never a texture (a stroke is not textured); null for any other material
function penPreset(matId, ov) {
    var id = cleanMaterial(matId); if (id !== 'wall' && id !== 'door') return null;
    var m = MATERIALS[id], o = picks(ov), door = o.door === true || id === 'door';
    return { strokeWidth: 6, tip: 'square', color: hexColor(o.color) || m.color, layer: 'back-mid', name: m.name, blocksSight: true, sightType: door ? 'door' : 'wall' };
}

/* ---------- lattice maths (grid descriptors as fogcore builds them: { type: 'square', size } or { type: 'hex', s, h }) ---------- */
function squareOk(grid) { return isObj(grid) && grid.type === 'square' && fin(grid.size) && grid.size > 0; }
function hexOk(grid) { return isObj(grid) && grid.type === 'hex' && fin(grid.s) && grid.s > 0 && fin(grid.h) && grid.h > 0; }
function gridOk(grid) { return squareOk(grid) || hexOk(grid); }

// A box on the square lattice: a click takes the cell under it; a drag rounds both corners to the nearest lattice lines and is at least one
// cell each way (an axis that rounds to nothing keeps the press cell on that axis). null on any other grid or for a number that is none
function snapBox(grid, sx, sy, ex, ey, dragged) {
    if (!squareOk(grid) || !fin(sx) || !fin(sy)) return null;
    var s = grid.size, c = cellOf(sx, sy, grid);
    if (!dragged) return { x: c.c * s, y: c.r * s, w: s, h: s };
    if (!fin(ex) || !fin(ey)) return null;
    // a drag lays every cell from the one the press lies in to the one the release lies in, inclusive (a drag that stays inside the press cell
    // lays that one cell): what a painter expects, never a box rounded to the nearest lines that could leave the pressed cell out
    var e = cellOf(ex, ey, grid), c0 = Math.min(c.c, e.c), c1 = Math.max(c.c, e.c), r0 = Math.min(c.r, e.r), r1 = Math.max(c.r, e.r);
    return { x: c0 * s, y: r0 * s, w: (c1 - c0 + 1) * s, h: (r1 - r0 + 1) * s };
}
// The hexagon item seated exactly on a hex cell: 2s wide, h tall, centred on the cell (whiteboard's 60 x 52 hexagon on the 30/52 grid)
function hexCellBox(grid, cell) {
    if (!hexOk(grid) || !isObj(cell) || !fin(cell.q) || !fin(cell.r)) return null;
    var c = cellCenter(cell, grid), w = 2 * grid.s, h = grid.h;
    return { x: r2(c.x - grid.s), y: r2(c.y - h / 2), w: r2(w), h: r2(h) };
}
// A list of cells cut to a cap (400 by default), each cell once: { cells, more }
function capped(cells, grid, cap) {
    var n = fin(cap) && cap >= 1 ? Math.floor(cap) : 400, out = [], seen = Object.create(null), more = false;
    for (var i = 0; i < cells.length; i++) {
        var k = cellKey(cells[i], grid); if (seen[k]) continue; seen[k] = 1;
        if (out.length >= n) { more = true; break; }
        out.push(cells[i]);
    }
    return { cells: out, more: more };
}
// The cells whose centre lies in a dragged box (fogcore cellsUnderRect's own order), a click (under a pixel either way) the one cell under it
function hexCellsInBox(grid, x, y, w, h, cap) {
    if (!gridOk(grid) || !fin(x) || !fin(y)) return null;
    w = fin(w) ? w : 0; h = fin(h) ? h : 0;
    if (w < 0) { x += w; w = -w; }
    if (h < 0) { y += h; h = -h; }
    if (w < 1 || h < 1) return { cells: [cellOf(x, y, grid)], more: false };
    return capped(cellsUnderRect(x, y, w, h, grid), grid, cap);
}
// A corridor from the press to the release. Square: a strip locked to the axis of the larger extent (a tie reads horizontal), from the press
// cell to the release cell inclusive, one cell wide or two (the press cell's row or column plus the next toward the pointer's perpendicular
// side; downward or rightward when it is level). Hex: the cells a straight segment passes, sampled every quarter cell; width 2 adds each
// of them its neighbour on the segment's lower side (its right side when it runs up or down), so a run along a lattice axis is two rows
// wide (a distance band could not be: the next row's centres lie 1.5 s away, past 0.75 h, and a band wide enough takes both sides);
// cut at 400 with `more`. null for a number that is none or a grid that is neither
var HEX_NB = [[1, 0], [1, -1], [0, 1], [0, -1], [-1, 1], [-1, 0]];
function corridor(grid, sx, sy, ex, ey, width) {
    if (!gridOk(grid) || !fin(sx) || !fin(sy) || !fin(ex) || !fin(ey)) return null;
    var two = width === 2;
    if (grid.type === 'square') {
        var s = grid.size, a = cellOf(sx, sy, grid), b = cellOf(ex, ey, grid);
        if (Math.abs(ex - sx) >= Math.abs(ey - sy)) {
            var c0 = Math.min(a.c, b.c), c1 = Math.max(a.c, b.c), r0 = two && ey - sy < 0 ? a.r - 1 : a.r;
            return { x: c0 * s, y: r0 * s, w: (c1 - c0 + 1) * s, h: (two ? 2 : 1) * s };
        }
        var rr0 = Math.min(a.r, b.r), rr1 = Math.max(a.r, b.r), cc0 = two && ex - sx < 0 ? a.c - 1 : a.c;
        return { x: cc0 * s, y: rr0 * s, w: (two ? 2 : 1) * s, h: (rr1 - rr0 + 1) * s };
    }
    var dx = ex - sx, dy = ey - sy, len = Math.hypot(dx, dy), steps = Math.min(20000, Math.max(1, Math.ceil(len / (grid.s / 4)))), run = [];
    for (var k = 0; k <= steps; k++) run.push(cellOf(sx + dx * k / steps, sy + dy * k / steps, grid));
    var out = capped(run, grid, 400);
    if (two && !out.more) {
        var nx = -dy, ny = dx;   // the segment's normal, turned to point down, or right when it is level (a point: right)
        if (ny < 0 || (ny === 0 && nx < 0)) { nx = -nx; ny = -ny; }
        if (!nx && !ny) nx = 1;
        var cells = out.cells.slice();
        for (var i = 0; i < out.cells.length; i++) {
            var c = out.cells[i], p = cellCenter(c, grid), best = null, bd = -Infinity;
            for (var n = 0; n < 6; n++) { var nb = { q: c.q + HEX_NB[n][0], r: c.r + HEX_NB[n][1] }, pc = cellCenter(nb, grid), d = (pc.x - p.x) * nx + (pc.y - p.y) * ny; if (d > bd) { bd = d; best = nb; } }
            cells.push(best);
        }
        out = capped(cells, grid, 400);
    }
    return out;
}
// The lattice corner nearest a point, for a polygon's vertex: a square grid's line crossing; a hex grid's nearest vertex of the cell the point
// lies in (datamap snapToHex 'vertex'); no grid: the 50 px lattice when snap is true, else the point as it is. To the hundredth
function snapVertex(grid, x, y, snap) {
    if (!fin(x) || !fin(y)) return null;
    if (!isObj(grid)) return snap ? { x: Math.round(x / 50) * 50, y: Math.round(y / 50) * 50 } : { x: r2(x), y: r2(y) };
    if (squareOk(grid)) return { x: r2(Math.round(x / grid.size) * grid.size), y: r2(Math.round(y / grid.size) * grid.size) };
    if (!hexOk(grid)) return null;
    var c = cellCenter(cellOf(x, y, grid), grid), s = grid.s, hh = grid.h / 2, best = null, bd = Infinity;
    var vs = [[c.x - s, c.y], [c.x - s / 2, c.y - hh], [c.x + s / 2, c.y - hh], [c.x + s, c.y], [c.x + s / 2, c.y + hh], [c.x - s / 2, c.y + hh]];
    for (var i = 0; i < 6; i++) { var d = (x - vs[i][0]) * (x - vs[i][0]) + (y - vs[i][1]) * (y - vs[i][1]); if (d < bd) { bd = d; best = vs[i]; } }
    return { x: r2(best[0]), y: r2(best[1]) };
}
// A filled region item from board points: consecutive repeats and a closing repeat of the first dropped, a point that is no pair of numbers
// passed over; 3 to 500 vertices, else null. Its box is their extent (a pixel at least), its points relative to the box, to the hundredth
function polyItem(verts) {
    if (!Array.isArray(verts)) return null;
    var v = [];
    for (var i = 0; i < verts.length && v.length <= 500; i++) {
        var p = verts[i]; if (!Array.isArray(p) || !fin(p[0]) || !fin(p[1])) continue;
        var q = [r2(p[0]), r2(p[1])], last = v.length ? v[v.length - 1] : null;
        if (last && last[0] === q[0] && last[1] === q[1]) continue;
        v.push(q);
    }
    if (v.length > 1 && v[0][0] === v[v.length - 1][0] && v[0][1] === v[v.length - 1][1]) v.pop();
    if (v.length < 3 || v.length > 500) return null;
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (var k = 0; k < v.length; k++) { x0 = Math.min(x0, v[k][0]); y0 = Math.min(y0, v[k][1]); x1 = Math.max(x1, v[k][0]); y1 = Math.max(y1, v[k][1]); }
    var w = Math.max(1, r2(x1 - x0)), h = Math.max(1, r2(y1 - y0)), pts = [];
    for (var n = 0; n < v.length; n++) pts.push([r2(v[n][0] - x0), r2(v[n][1] - y0)]);
    return { type: 'path', tip: 'fill', x: x0, y: y0, w: w, h: h, baseW: w, baseH: h, pts: pts };
}
function near1(a, b) { return fin(a) && fin(b) && Math.abs(a - b) <= 1; }
// The index of the item already seated where a piece would go — the same type, its box within a pixel each way, not a token, not hidden, no
// pts — so a paint-drag re-lays onto it instead of stacking; -1 for none
function seatedAt(items, piece) {
    if (!Array.isArray(items) || !isObj(piece)) return -1;
    for (var i = 0; i < items.length; i++) {
        var w = items[i];
        if (!isObj(w) || w.type !== piece.type || w.isChar || w.waiting || w.hidden || w.pts) continue;
        if (near1(w.x, piece.x) && near1(w.y, piece.y) && near1(w.w, piece.w) && near1(w.h, piece.h)) return i;
    }
    return -1;
}

var API = { VERSION: VERSION, TEXTURES: TEXTURES, cleanTexture: cleanTexture, TEX: TEX, TEX_CSS: TEX_CSS, texStyle: texStyle, texPos: texPos, texPattern: texPattern, MATERIALS: MATERIALS, MATERIAL_IDS: MATERIAL_IDS, cleanMaterial: cleanMaterial, pieceProps: pieceProps, penPreset: penPreset, snapBox: snapBox, hexCellBox: hexCellBox, hexCellsInBox: hexCellsInBox, corridor: corridor, snapVertex: snapVertex, polyItem: polyItem, seatedAt: seatedAt };
if (typeof window !== 'undefined') window.wpBuildCore = API;
export { VERSION, TEXTURES, cleanTexture, TEX, TEX_CSS, texStyle, texPos, texPattern, MATERIALS, MATERIAL_IDS, cleanMaterial, pieceProps, penPreset, snapBox, hexCellBox, hexCellsInBox, corridor, snapVertex, polyItem, seatedAt };

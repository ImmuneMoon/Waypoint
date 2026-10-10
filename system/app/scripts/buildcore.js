/* Map builder (1.5.4, backlog item 23, fold B1) — the pure half: the eight code-drawn textures a piece may wear (a NAME from a frozen
   list, drawn here as a seamless SVG tile — never a file, never an address), the seven materials of the palette and the props bag a
   piece of each takes, the Wall-line preset the pen takes, and the lattice maths the palette lays pieces by (a square box snapped to
   the lattice, a hexagon seated on its cell, a corridor, a polygon's vertex and item, the piece already seated where a new one would
   go), and the wall lines around a set of floor pieces (outlineWalls). No state, no DOM; tools/buildcheck.js runs it under Node, and whiteboard.js (the palette) imports it. Published as
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

import { cellOf, cellCenter, cellKey, cellsUnderRect, cleanTerrain, cleanTexSrc, cleanTexTile, itemCells, itemOver, itemCovers, pathSegs, isDoor } from './fogcore.js';   // the one lattice the fog, cover and movement read
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
    // 45-degree lines y = x + c, c every 12.5 px offset by half a step so none passes a corner; each leaves an edge where its twin enters.
    // Every line runs 4 px past the tile at both ends: the tile's own edge cuts it, so no round cap nicks the seam (a cap covers less of
    // the edge than a slanted stroke's body does)
    hatching: { w: 50, h: 50, dark: 1.6, light: 0.7,
        d: 'M -4 2.25 L 47.75 54 M -4 14.75 L 35.25 54 M -4 27.25 L 22.75 54 M -4 39.75 L 10.25 54 M 2.25 -4 L 54 47.75 M 14.75 -4 L 54 35.25 M 27.25 -4 L 54 22.75 M 39.75 -4 L 54 10.25' },
    // three wave rows 16 px apart (a 48 px tile), period 25 (twice across the tile), the middle row half a period out of phase. Each row
    // runs half a wave past the tile at both ends (the wave it would draw in the next tile), so the edge cuts it and no cap nicks the seam
    ripples: { w: 50, h: 48, dark: 1.6, light: 0.8,
        d: 'M -12.5 8 Q -6.25 14 0 8 Q 6.25 2 12.5 8 Q 18.75 14 25 8 Q 31.25 2 37.5 8 Q 43.75 14 50 8 Q 56.25 2 62.5 8 M -12.5 24 Q -6.25 18 0 24 Q 6.25 30 12.5 24 Q 18.75 18 25 24 Q 31.25 30 37.5 24 Q 43.75 18 50 24 Q 56.25 30 62.5 24 M -12.5 40 Q -6.25 46 0 40 Q 6.25 34 12.5 40 Q 18.75 46 25 40 Q 31.25 34 37.5 40 Q 43.75 46 50 40 Q 56.25 34 62.5 40' },
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
//   texSrc / texTile   (fold B3) the override's picture when fogcore cleanTexSrc keeps it, with its repeat (cleanTexTile, else 1): one of the
//               campaign's own pictures as the fill. texture is then ABSENT: a piece that wears a picture names no pattern
//   blocksSight / sightType   the material's as given; blocksSight: false drops both (a piece that blocks nothing is no door either, so it
//               wins over door: true); door: true on any material sets blocksSight: true, sightType: 'door'
//   cover       true -> 'yes', false -> absent, undefined -> the material's (Rubble's default, the GM's tick deciding per piece)
//   terrain     a number -> fogcore cleanTerrain of it (2..10) or absent; 0, false, null or anything else -> absent; undefined -> the material's
function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined; }   // an override is read as the bag's own key only, never inherited
function picks(ov) { var o = isObj(ov) ? ov : {}, p = {}, ks = ['color', 'texture', 'texSrc', 'texTile', 'blocksSight', 'door', 'cover', 'terrain']; for (var i = 0; i < ks.length; i++) p[ks[i]] = own(o, ks[i]); return p; }
function pieceProps(matId, ov) {
    var id = cleanMaterial(matId); if (!id) return null;
    var m = MATERIALS[id], o = picks(ov), out = {};
    out.color = hexColor(o.color) || m.color;
    out.layer = m.layer;
    out.name = m.name.slice(0, 60);
    if (o.texture === undefined) out.texture = m.texture;
    else if (o.texture !== '' && o.texture !== null) out.texture = cleanTexture(o.texture) || m.texture;
    var ps = cleanTexSrc(o.texSrc);
    if (ps) { delete out.texture; out.texSrc = ps; out.texTile = cleanTexTile(o.texTile) || 1; }
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

/* ---------- one of the campaign's own pictures as a fill (fold B3) ---------- */
// The address handed in is what the board resolved for a piece's texSrc: the app's own path, or on a player's app the blob or data address
// of the bytes the host sent. It reaches a style or an attribute only as picUrl gives it: a path percent-encoded (a file's name may hold a
// space, a bracket or a quote mark), a blob or data address only when it holds nothing that could end a css url(). Anything else is no
// address, and the piece shows its colour. One repeat is PIC_CELL px a cell on every map, the lattice the code-drawn patterns use
var PIC_CELL = 50;
function picUrl(u) {
    if (typeof u !== 'string' || !u || u.length > 4194304) return '';
    var out = u;
    if (!/^(data:image\/|blob:)/i.test(u)) {
        if (u.charAt(0) !== '/' || u.charAt(1) === '/') return '';   // the app's own path only: never a scheme, never a host of its own
        try { out = encodeURI(u).replace(/[()']/g, function(c) { return '%' + c.charCodeAt(0).toString(16).toUpperCase(); }); } catch (e) { return ''; }
    }
    return /[\s'"()\\]/.test(out) ? '' : out;
}
function picTileOf(v) { return v === 2 || v === 4 || v === 'whole' ? v : 1; }
// The name a Texture list shows for a picture in use: its file's own name, 40 characters at most. Text for a text node or for esc, never markup
function picName(u) {
    if (typeof u !== 'string') return '';
    var cp = Array.from(u.slice(u.lastIndexOf('/') + 1));
    return cp.length > 40 ? cp.slice(0, 39).join('') + '\u2026' : cp.join('');
}
// Where a repeat of `mark` px (a text: '50', '100', '200') sits so that its origin is the board's; 'whole' and anything else sit at the piece's own corner
function picPos(x, y, mark) {
    var t = typeof mark === 'string' && /^[1-9][0-9]{1,3}$/.test(mark) ? Number(mark) : 0; if (!t) return '0px 0px';
    return px(mod(x, t)) + ' ' + px(mod(y, t));
}
// A box shape's picture as its background: { image, size, position, repeat, mark } or null where the address is none
function picStyle(u, tile, x, y) {
    var url = picUrl(u); if (!url) return null;
    var tl = picTileOf(tile), img = 'url("' + url + '")';
    if (tl === 'whole') return { image: img, size: '100% 100%', position: '0px 0px', repeat: 'no-repeat', mark: 'whole' };
    var t = tl * PIC_CELL;
    return { image: img, size: t + 'px ' + t + 'px', position: picPos(x, y, String(t)), repeat: '', mark: String(t) };
}
// The same picture as an SVG <pattern> for a filled region, built with createElementNS only. w and h: the region's box as drawn, which
// 'whole' stretches the picture over once (the pattern is then marked data-whole and sits at the region's own corner)
function picPattern(doc, u, tile, x, y, w, h, color, serial) {
    if (!doc || typeof doc.createElementNS !== 'function') return null;
    var url = picUrl(u); if (!url) return null;
    var tl = picTileOf(tile), whole = tl === 'whole', tw = whole ? (fin(w) && w > 0 ? w : 0) : tl * PIC_CELL, th = whole ? (fin(h) && h > 0 ? h : 0) : tl * PIC_CELL; if (!(tw > 0 && th > 0)) return null;
    var sn = fin(serial) && serial >= 0 && Math.floor(serial) === serial ? serial : 0, p = doc.createElementNS(SVG_NS, 'pattern');
    p.setAttribute('id', 'wptex' + sn);
    p.setAttribute('patternUnits', 'userSpaceOnUse');
    p.setAttribute('width', String(tw)); p.setAttribute('height', String(th));
    p.setAttribute('x', whole ? '0' : String(-mod(x, tw))); p.setAttribute('y', whole ? '0' : String(-mod(y, th)));
    if (whole) p.setAttribute('data-whole', '1');
    var r = doc.createElementNS(SVG_NS, 'rect');
    r.setAttribute('width', String(tw)); r.setAttribute('height', String(th)); r.setAttribute('fill', cssColor(color, 'transparent'));
    p.appendChild(r);
    var im = doc.createElementNS(SVG_NS, 'image');
    im.setAttribute('href', url); im.setAttribute('width', String(tw)); im.setAttribute('height', String(th)); im.setAttribute('preserveAspectRatio', 'none');
    p.appendChild(im);
    return p;
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
// The cells whose centre lies in a dragged box (fogcore cellsUnderRect's own order), a click (under a pixel either way) the one cell under it.
// A box far larger than the cap is not listed whole before it is cut. The lister walks a column of cells at a time from the left, each from
// the top, so the box is first tried no taller than one column needs to pass the cap, and no wider than holds the cap by its columns' least
// count: the first cells of that try are the first cells of the whole box. It is listed whole only where the try came short
function hexCellsInBox(grid, x, y, w, h, cap) {
    if (!gridOk(grid) || !fin(x) || !fin(y)) return null;
    w = fin(w) ? w : 0; h = fin(h) ? h : 0;
    if (w < 0) { x += w; w = -w; }
    if (h < 0) { y += h; h = -h; }
    if (w < 1 || h < 1) return { cells: [cellOf(x, y, grid)], more: false };
    var n = fin(cap) && cap >= 1 ? Math.floor(cap) : 400, colW = grid.type === 'square' ? grid.size : 1.5 * grid.s, rowH = grid.type === 'square' ? grid.size : grid.h;
    var hT = Math.min(h, (n + 2) * rowH), perCol = Math.floor(hT / rowH), wT = perCol >= 1 ? Math.min(w, (Math.ceil((n + 1) / perCol) + 2) * colW) : w;
    if (wT < w || hT < h) { var first = capped(cellsUnderRect(x, y, wT, hT, grid), grid, n); if (first.more) return first; }
    return capped(cellsUnderRect(x, y, w, h, grid), grid, n);
}
// A corridor from the press to the release. Square: a strip locked to the axis of the larger extent (a tie reads horizontal), from the press
// cell to the release cell inclusive, one cell wide or two (the press cell's row or column plus the next toward the pointer's perpendicular
// side; downward or rightward when it is level). Hex: the cells a straight segment passes, sampled every quarter cell; width 2 adds each
// of them its neighbour on the segment's lower side (its right side when it runs up or down), so a run along a lattice axis is two rows
// wide (a distance band could not be: the next row's centres lie 1.5 s away, past 0.75 h, and a band wide enough takes both sides);
// cut at 400 with `more`, a two-wide one as run cell and neighbour in turn. null for a number that is none or a grid that is neither
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
    var nx = -dy, ny = dx;   // the segment's normal, turned to point down, or right when it is level (a point: right)
    if (ny < 0 || (ny === 0 && nx < 0)) { nx = -nx; ny = -ny; }
    if (!nx && !ny) nx = 1;
    // Every sample is moved a hair toward that side. A run that rides the edge two cells share (a level drag through cell centres does, in
    // every other column) then takes the cell on its lower side each time, never one or the other as the rounding falls
    var nl = Math.hypot(nx, ny), ox = nx / nl * grid.s * 1e-6, oy = ny / nl * grid.s * 1e-6;
    for (var k = 0; k <= steps; k++) run.push(cellOf(sx + dx * k / steps + ox, sy + dy * k / steps + oy, grid));
    var out = capped(run, grid, 400);
    if (!two) return out;
    // Two wide: each cell of the run and then its neighbour on that side, so a corridor cut at the cap is two wide for all of its length
    var cells = [];
    for (var i = 0; i < out.cells.length; i++) {
        var c = out.cells[i], p = cellCenter(c, grid), best = null, bd = -Infinity;
        for (var n = 0; n < 6; n++) { var nb = { q: c.q + HEX_NB[n][0], r: c.r + HEX_NB[n][1] }, pc = cellCenter(nb, grid), d = (pc.x - p.x) * nx + (pc.y - p.y) * ny; if (d > bd) { bd = d; best = nb; } }
        cells.push(c, best);
    }
    var wide = capped(cells, grid, 400);
    return { cells: wide.cells, more: out.more || wide.more };
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
// within a million either way passed over; 3 to 500 vertices, else null (501 and a closing repeat is 500; anything read past that is over,
// never cut to fit). A shape that covers nothing (under a square pixel: its corners in a line, or there and back) is null too. Its box is
// their extent (a pixel at least), its points relative to the box, to the hundredth
var POLY_FAR = 1e6;
function polyItem(verts) {
    if (!Array.isArray(verts)) return null;
    var v = [];
    for (var i = 0; i < verts.length && v.length <= 501; i++) {
        var p = verts[i]; if (!Array.isArray(p) || !fin(p[0]) || !fin(p[1]) || Math.abs(p[0]) > POLY_FAR || Math.abs(p[1]) > POLY_FAR) continue;
        var q = [r2(p[0]), r2(p[1])], last = v.length ? v[v.length - 1] : null;
        if (last && last[0] === q[0] && last[1] === q[1]) continue;
        v.push(q);
    }
    if (v.length > 1 && v[0][0] === v[v.length - 1][0] && v[0][1] === v[v.length - 1][1]) v.pop();
    if (v.length < 3 || v.length > 500) return null;
    var area = 0;
    for (var a = 0; a < v.length; a++) { var b = v[(a + 1) % v.length]; area += v[a][0] * b[1] - b[0] * v[a][1]; }
    if (Math.abs(area) / 2 < 1) return null;
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (var k = 0; k < v.length; k++) { x0 = Math.min(x0, v[k][0]); y0 = Math.min(y0, v[k][1]); x1 = Math.max(x1, v[k][0]); y1 = Math.max(y1, v[k][1]); }
    var w = Math.max(1, r2(x1 - x0)), h = Math.max(1, r2(y1 - y0)), pts = [];
    for (var n = 0; n < v.length; n++) pts.push([r2(v[n][0] - x0), r2(v[n][1] - y0)]);
    return { type: 'path', tip: 'fill', x: x0, y: y0, w: w, h: h, baseW: w, baseH: h, pts: pts };
}
function near1(a, b) { return fin(a) && fin(b) && Math.abs(a - b) <= 1; }
// The index of the item already seated where a piece would go — the same type, its box within a pixel each way, not a token, not hidden, no
// pts — so a paint-drag re-lays onto it instead of stacking; -1 for none. Only a PLAIN piece is re-laid: never one that is locked or turned,
// nor one with a purpose of its own that a new floor or wall must not take over (a see-through barrier, a play area, a portal by its own key
// or its node's, a null area, smoke, a fog mark, a pin to a page, a GM note card). Such a piece is left as it is and the new one lands on it
function special(w) {
    return !!(w.locked || w.gmNoteFor || w.barrier === true || w.fogged || w.targetMapId || w.nodeId || w.nulls || w.smoke === true || w.fogHand || w.page || (fin(w.rot) && w.rot % 360 !== 0));
}
function seatedAt(items, piece) {
    if (!Array.isArray(items) || !isObj(piece) || typeof piece.type !== 'string') return -1;
    for (var i = 0; i < items.length; i++) {
        var w = items[i];
        if (!isObj(w) || w.type !== piece.type || w.isChar || w.waiting || w.hidden || w.pts || special(w)) continue;
        if (near1(w.x, piece.x) && near1(w.y, piece.y) && near1(w.w, piece.w) && near1(w.h, piece.h)) return i;
    }
    return -1;
}

/* ---------- walls around floors (fold B2b; the owner, 2026-10-10, by prompt: "Walls first", on the "Right-click menu") ----------
   One command lays thin wall lines along the outer edge of the cells a set of floor pieces covers together. Nothing is derived live: what
   comes back is geometry for ordinary Wall lines (the pen's thin wall of item 18 W2), which the caller dresses with penPreset and adds as
   items. The outline follows the LATTICE, as the fog's own reading of a piece does (fogcore itemCells / itemCovers: a cell is a piece's when
   its centre is covered), so a rectangle on the grid is walled exactly and a round room or a slanted polygon gets stepped walls. */
// A FLOOR piece: a plain area a wall may run around: a rectangle, a circle, a hexagon, a diamond, a filled region or a painted cell that
// players see and that blocks nothing itself. Never a token, a waiting token or a GM note card; never a hidden piece (walls around one would
// draw its shape for the players); never a wall, a door or a see-through barrier; never a play area, a null area or smoke; never a picture,
// a text, a pen line, a trigger or a light
function floorOk(w) {
    if (!isObj(w) || w.isChar || w.waiting || w.gmNoteFor || w.hidden || w.blocksSight || w.barrier === true || w.fogged || w.nulls || w.smoke === true) return false;
    if (!fin(w.x) || !fin(w.y)) return false;
    if (w.type === 'path') return w.tip === 'fill' && Array.isArray(w.pts);
    return w.type === 'rect' || w.type === 'circle' || w.type === 'hexagon' || w.type === 'diamond';
}
var WALLS = Object.freeze({ cells: 6000, region: 24000, work: 2e7, doors: 1000, chunk: 120 });   // cells: the fog's own cap of blocker cells
// The cells a floor piece covers, as the fog reads them: { cells } or { over: true } for a piece too large to list. A filled region is asked
// cell by cell over its outline's box (itemCells reads any path as its box)
function floorCells(w, grid) {
    if (w.type !== 'path' || w.fill) return itemOver(w, grid) ? { over: true } : { cells: itemCells(w, grid) };
    var segs = pathSegs(w), x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, i;
    for (i = 0; i < segs.length; i++) { var s = segs[i]; x0 = Math.min(x0, s[0], s[2]); x1 = Math.max(x1, s[0], s[2]); y0 = Math.min(y0, s[1], s[3]); y1 = Math.max(y1, s[1], s[3]); }
    if (!segs.length) return { cells: [] };
    var cw = grid.type === 'square' ? grid.size : 1.5 * grid.s, ch = grid.type === 'square' ? grid.size : grid.h, est = ((x1 - x0) / cw + 2) * ((y1 - y0) / ch + 2);
    if (!(est <= WALLS.region) || est * segs.length > WALLS.work) return { over: true };
    var box = cellsUnderRect(x0, y0, x1 - x0, y1 - y0, grid), out = [];
    for (i = 0; i < box.length; i++) { var p = cellCenter(box[i], grid); if (itemCovers(w, p.x, p.y, grid)) out.push(box[i]); }
    return { cells: out };
}
function segDist(px, py, s) {
    var dx = s[2] - s[0], dy = s[3] - s[1], l2 = dx * dx + dy * dy, t = l2 ? ((px - s[0]) * dx + (py - s[1]) * dy) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return Math.hypot(px - (s[0] + t * dx), py - (s[1] + t * dy));
}
// A wall line's geometry from board points, as the pen stores a stroke: its box their extent (10 px at least each way, the pen's own least),
// its points relative to the box, to the hundredth
function lineOf(pts) {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, i;
    for (i = 0; i < pts.length; i++) { x0 = Math.min(x0, pts[i][0]); y0 = Math.min(y0, pts[i][1]); x1 = Math.max(x1, pts[i][0]); y1 = Math.max(y1, pts[i][1]); }
    var w = Math.max(10, r2(x1 - x0)), h = Math.max(10, r2(y1 - y0)), rel = [];
    for (i = 0; i < pts.length; i++) rel.push([r2(pts[i][0] - x0), r2(pts[i][1] - y0)]);
    return { x: r2(x0), y: r2(y0), w: w, h: h, baseW: w, baseH: h, pts: rel };
}
// outlineWalls(pieces, grid, opts) -> { lines, floors, cells, had, over }
//   pieces   the selection: only its floor pieces count (floorOk)
//   grid     a square or a hex lattice (a map with no grid: the caller passes the 50 px square lattice Build seats its pieces on)
//   opts.doors   the map's pieces: where a DOOR that players see stands, the doorway is left open. A door laid as a block: no wall on the
//                edge between a floor cell and a cell the door covers, nor on the outer sides of a floor cell the door itself stands on (the
//                door is the closure there). A door drawn as a line: no wall on a cell edge whose middle lies on it (within a fifth of a
//                cell). A hidden door is walled over, since a gap would show where it is. Only the doors NEAR the floors are read (their
//                box, a cell wider each way), so a door line of many points elsewhere on the map never crowds a near one out; past 1000
//                near segments the rest are not read and the answer says so (`doorsOver`, only as true)
//   opts.have    the map's pieces: a wall line that is already there (the same box and the same points, each within a pixel) is not laid
//                twice (`had`). Every point is compared: a hex outline that changed by one cell can keep its box, its count and its start
//   lines    each { x, y, w, h, baseW, baseH, pts }. Square: one line a straight run, the runs along a row line first and then along a
//            column line, each in order. Hex: the outline's zigzag as chains of at most 120 edges, an open chain before a closed one
//   over     the floors cover more than 6000 cells together, or one of them is too large to list: nothing is laid
function outlineWalls(pieces, grid, opts) {
    var out = { lines: [], floors: 0, cells: 0, had: 0, over: false };
    if (!Array.isArray(pieces) || !gridOk(grid)) return out;
    var inSet = Object.create(null), cells = [], i, k;
    for (i = 0; i < pieces.length; i++) {
        var w = pieces[i]; if (!floorOk(w)) continue;
        var fc = floorCells(w, grid); if (fc.over) { out.over = true; return out; }
        out.floors++;
        for (k = 0; k < fc.cells.length; k++) {
            var ck = cellKey(fc.cells[k], grid); if (inSet[ck]) continue;
            if (cells.length >= WALLS.cells) { out.over = true; return out; }
            inSet[ck] = 1; cells.push(fc.cells[k]);
        }
    }
    return wallsOfCells(out, cells, inSet, grid, opts, null);
}
// The wall lines along the outer edge of a set of cells (each once, keyed in inSet), written into the answer. `end`, when given, says of an
// outer edge (its middle and its outward normal) that it is left open: a corridor's two ends
function wallsOfCells(out, cells, inSet, grid, opts, end) {
    var o = isObj(opts) ? opts : {}, i, k, n;
    out.cells = cells.length;
    if (!cells.length) return out;
    var bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity, padX = grid.type === 'square' ? grid.size : 2 * grid.s, padY = grid.type === 'square' ? grid.size : grid.h;
    for (i = 0; i < cells.length; i++) { var fcn = cellCenter(cells[i], grid); bx0 = Math.min(bx0, fcn.x); bx1 = Math.max(bx1, fcn.x); by0 = Math.min(by0, fcn.y); by1 = Math.max(by1, fcn.y); }
    bx0 -= padX; bx1 += padX; by0 -= padY; by1 += padY;   // the floors' box, a cell wider each way: a door further off opens nothing here
    var doorCells = Object.create(null), doorSegs = [], doors = Array.isArray(o.doors) ? o.doors : [];
    for (i = 0; i < doors.length; i++) {
        var d = doors[i]; if (!isDoor(d) || d.hidden || d.isChar || d.waiting || d.gmNoteFor || !fin(d.x) || !fin(d.y)) continue;
        if (d.type === 'path' && !d.fill) {
            var ds = pathSegs(d);
            for (k = 0; k < ds.length; k++) {
                var sg = ds[k]; if (Math.max(sg[0], sg[2]) < bx0 || Math.min(sg[0], sg[2]) > bx1 || Math.max(sg[1], sg[3]) < by0 || Math.min(sg[1], sg[3]) > by1) continue;
                if (doorSegs.length >= WALLS.doors) { out.doorsOver = true; break; }
                doorSegs.push(sg);
            }
            continue;
        }
        if (itemOver(d, grid)) continue;
        var dc = itemCells(d, grid);
        for (k = 0; k < dc.length; k++) { var dcn = cellCenter(dc[k], grid); if (dcn.x >= bx0 && dcn.x <= bx1 && dcn.y >= by0 && dcn.y <= by1) doorCells[cellKey(dc[k], grid)] = 1; }
    }
    var tol = 0.2 * (grid.type === 'square' ? grid.size : grid.s);
    var open = function(outKey, mx, my) {   // a doorway: no wall on this edge
        if (doorCells[outKey]) return true;
        for (var q = 0; q < doorSegs.length; q++) if (segDist(mx, my, doorSegs[q]) <= tol) return true;
        return false;
    };
    var lines = [];
    if (grid.type === 'square') {
        var s = grid.size, H = Object.create(null), V = Object.create(null);   // a lattice line -> the cells along it that have an outer edge there
        var put = function(M, line, at, outKey, mx, my, nx, ny) { if (!inSet[outKey] && !open(outKey, mx, my) && !(end && end(mx, my, nx, ny))) (M[line] || (M[line] = [])).push(at); };
        for (i = 0; i < cells.length; i++) {
            var c = cells[i].c, r = cells[i].r;
            if (doorCells[c + ',' + r]) continue;   // a door block stands on this floor cell: the door is the closure, its outer sides stay open
            put(H, r, c, c + ',' + (r - 1), (c + 0.5) * s, r * s, 0, -1);
            put(H, r + 1, c, c + ',' + (r + 1), (c + 0.5) * s, (r + 1) * s, 0, 1);
            put(V, c, r, (c - 1) + ',' + r, c * s, (r + 0.5) * s, -1, 0);
            put(V, c + 1, r, (c + 1) + ',' + r, (c + 1) * s, (r + 0.5) * s, 1, 0);
        }
        var runs = function(M, level) {
            var ks = Object.keys(M).map(Number).sort(function(a, b) { return a - b; });
            for (var a = 0; a < ks.length; a++) {
                var ats = M[ks[a]].slice().sort(function(p, q) { return p - q; }), from = null, to = null;
                for (var b = 0; b <= ats.length; b++) {
                    if (b < ats.length && from !== null && (ats[b] === to || ats[b] === to + 1)) { to = ats[b]; continue; }
                    if (from !== null) lines.push(lineOf(level ? [[from * s, ks[a] * s], [(to + 1) * s, ks[a] * s]] : [[ks[a] * s, from * s], [ks[a] * s, (to + 1) * s]]));
                    if (b < ats.length) { from = ats[b]; to = ats[b]; }
                }
            }
        };
        runs(H, true); runs(V, false);
    } else {
        var hs = grid.s, hh = grid.h / 2, edges = [], at = Object.create(null);   // a corner -> the outer edges that meet there (two at most)
        var vkey = function(x, y) { return Math.round(x / (hs / 2)) + ',' + Math.round(y / hh); };   // a hex lattice's corners lie on whole half-steps
        for (i = 0; i < cells.length; i++) {
            if (doorCells[cellKey(cells[i], grid)]) continue;   // a door block stands on this floor cell, as on a square lattice
            var p = cellCenter(cells[i], grid), vs = [[p.x - hs, p.y], [p.x - hs / 2, p.y - hh], [p.x + hs / 2, p.y - hh], [p.x + hs, p.y], [p.x + hs / 2, p.y + hh], [p.x - hs / 2, p.y + hh]];
            for (k = 0; k < 6; k++) {
                var va = vs[k], vb = vs[(k + 1) % 6], mx = (va[0] + vb[0]) / 2, my = (va[1] + vb[1]) / 2, nk = cellKey(cellOf(2 * mx - p.x, 2 * my - p.y, grid), grid);   // the cell across this side
                if (inSet[nk] || open(nk, mx, my)) continue;
                if (end) { var hn = Math.hypot(mx - p.x, my - p.y); if (end(mx, my, (mx - p.x) / hn, (my - p.y) / hn)) continue; }
                var ka = vkey(va[0], va[1]), kb = vkey(vb[0], vb[1]);
                n = edges.length; edges.push({ a: va, b: vb, ka: ka, kb: kb, used: false });
                (at[ka] || (at[ka] = [])).push(n); (at[kb] || (at[kb] = [])).push(n);
            }
        }
        var walk = function(first, key, pt) {   // from a corner along unused edges until none leads on
            var pts = [pt], e = first;
            while (e !== -1) {
                var E = edges[e]; E.used = true;
                var fwd = E.ka === key; key = fwd ? E.kb : E.ka; pts.push(fwd ? E.b : E.a);
                var next = at[key]; e = -1;
                for (var q = 0; q < next.length; q++) if (!edges[next[q]].used) { e = next[q]; break; }
            }
            for (var c0 = 0; c0 < pts.length - 1; c0 += WALLS.chunk) lines.push(lineOf(pts.slice(c0, c0 + WALLS.chunk + 1)));
        };
        for (i = 0; i < edges.length; i++) {   // the chains a doorway cut open, each from one of its ends
            if (edges[i].used) continue;
            if (at[edges[i].ka].length === 1) walk(i, edges[i].ka, edges[i].a); else if (at[edges[i].kb].length === 1) walk(i, edges[i].kb, edges[i].b);
        }
        for (i = 0; i < edges.length; i++) if (!edges[i].used) walk(i, edges[i].ka, edges[i].a);   // then the closed loops
    }
    var have = Array.isArray(o.have) ? o.have : [], walls = [];   // the wall lines that stand on the map, picked out once
    for (k = 0; k < have.length; k++) {
        var hw = have[k];
        if (isObj(hw) && hw.type === 'path' && hw.tip !== 'fill' && hw.blocksSight === true && hw.sightType !== 'door' && !hw.hidden && !(fin(hw.rot) && hw.rot % 360 !== 0) && Array.isArray(hw.pts)) walls.push(hw);
    }
    for (i = 0; i < lines.length; i++) {
        var L = lines[i], dup = false;
        for (k = 0; k < walls.length && !dup; k++) {
            var wl = walls[k];
            if (wl.pts.length !== L.pts.length || !near1(wl.x, L.x) || !near1(wl.y, L.y) || !near1(wl.w, L.w) || !near1(wl.h, L.h)) continue;
            dup = true;   // the same line only when every point is the same
            for (n = 0; n < L.pts.length && dup; n++) dup = Array.isArray(wl.pts[n]) && near1(wl.pts[n][0], L.pts[n][0]) && near1(wl.pts[n][1], L.pts[n][1]);
        }
        if (dup) out.had++; else out.lines.push(L);
    }
    return out;
}
// corridorWalls(grid, sx, sy, ex, ey, width, opts) -> as outlineWalls answers. The wall lines along the two long sides of the corridor that
// corridor() lays for the same gesture: the outer edge of its cells, less its two ENDS (the owner, 2026-10-10, by prompt: "Open ends"). A
// wall that already stands across an end stays: nothing is derived live. An end is an outer edge that faces along the corridor at its last cell, or against it at its first: its
// outward normal within about 53 degrees of the corridor's direction (so the two sides beside a hexagon's forward side stay walled), and its
// middle no further back than a quarter of a cell from that end. The direction runs from the first cell's centre to the last one's; a
// corridor of one cell takes the gesture's own (a tie reads level, as corridor() reads it). opts as outlineWalls takes them
function corridorWalls(grid, sx, sy, ex, ey, width, opts) {
    var out = { lines: [], floors: 0, cells: 0, had: 0, over: false };
    var co = corridor(grid, sx, sy, ex, ey, width), run = corridor(grid, sx, sy, ex, ey, 1); if (!co || !run) return out;
    var sq = grid.type === 'square', list = sq ? cellsUnderRect(co.x, co.y, co.w, co.h, grid) : co.cells, a, b, inSet = Object.create(null), cells = [], i;
    if (sq) { a = { x: run.x + grid.size / 2, y: run.y + grid.size / 2 }; b = { x: run.x + run.w - grid.size / 2, y: run.y + run.h - grid.size / 2 }; }
    else { if (!run.cells.length) return out; a = cellCenter(run.cells[0], grid); b = a; }
    if (list.length > WALLS.cells) { out.over = true; return out; }
    for (i = 0; i < list.length; i++) { var ck = cellKey(list[i], grid); if (!inSet[ck]) { inSet[ck] = 1; cells.push(list[i]); } }
    if (!sq) for (i = run.cells.length - 1; i >= 0; i--) if (inSet[cellKey(run.cells[i], grid)]) { b = cellCenter(run.cells[i], grid); break; }   // the far end is the last run cell that was laid: a corridor two wide is cut at half the run
    var dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
    if (len < 1e-6) { dx = ex - sx; dy = ey - sy; if (sq) { if (Math.abs(dx) >= Math.abs(dy)) { dx = 1; dy = 0; } else { dx = 0; dy = 1; } } else if (!dx && !dy) dx = 1; len = 0; }
    var dl = Math.hypot(dx, dy); dx /= dl; dy /= dl;
    var q = 0.25 * (sq ? grid.size : 1.5 * grid.s);
    out.floors = 1;
    return wallsOfCells(out, cells, inSet, grid, opts, function(mx, my, nx, ny) {
        var t = (mx - a.x) * dx + (my - a.y) * dy, d = nx * dx + ny * dy;
        return (d > 0.6 && t > len - q) || (d < -0.6 && t < q);
    });
}
// One wall line's geometry from board points (two at least, each a pair of numbers), for a caller that knows where its wall runs; else null
function wallLine(pts) {
    if (!Array.isArray(pts) || pts.length < 2) return null;
    for (var i = 0; i < pts.length; i++) if (!Array.isArray(pts[i]) || !fin(pts[i][0]) || !fin(pts[i][1])) return null;
    return lineOf(pts);
}

var API = { VERSION: VERSION, TEXTURES: TEXTURES, cleanTexture: cleanTexture, TEX: TEX, TEX_CSS: TEX_CSS, texStyle: texStyle, texPos: texPos, texPattern: texPattern, PIC_CELL: PIC_CELL, picUrl: picUrl, picPos: picPos, picStyle: picStyle, picPattern: picPattern, picName: picName, MATERIALS: MATERIALS, MATERIAL_IDS: MATERIAL_IDS, cleanMaterial: cleanMaterial, pieceProps: pieceProps, penPreset: penPreset, snapBox: snapBox, hexCellBox: hexCellBox, hexCellsInBox: hexCellsInBox, corridor: corridor, snapVertex: snapVertex, polyItem: polyItem, seatedAt: seatedAt, floorOk: floorOk, outlineWalls: outlineWalls, corridorWalls: corridorWalls, wallLine: wallLine };
if (typeof window !== 'undefined') window.wpBuildCore = API;
export { VERSION, TEXTURES, cleanTexture, TEX, TEX_CSS, texStyle, texPos, texPattern, PIC_CELL, picUrl, picPos, picStyle, picPattern, picName, MATERIALS, MATERIAL_IDS, cleanMaterial, pieceProps, penPreset, snapBox, hexCellBox, hexCellsInBox, corridor, snapVertex, polyItem, seatedAt, floorOk, outlineWalls, corridorWalls, wallLine };

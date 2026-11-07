// A map's own cell size (backlog 38's later fold; the owner, 2026-11-07, by prompt: "Both" to set it, a picture's grid fitted and the
// numbers typed, and "Tokens resize, rest stays (Recommended)" when it changes, with a setting that asks each time). Pure: it reads nothing
// but its arguments and fogcore, and changes only the map it is handed. cellcheck is not a suite of its own: buildcheck runs it.
import { cleanMapCell, gridFor, cellOf, cellCenter, cellKey } from './fogcore.js';

var VERSION = 1;
function isObj(v) { return v !== null && typeof v === 'object'; }
function fin(v) { return typeof v === 'number' && isFinite(v); }
function gridTypeOf(map) { var g = isObj(map) && isObj(map.meta) ? map.meta.gridType : null; return g === 'square' || g === 'hex' ? g : ''; }
// The text that says which cell a map has: '' for today's lattice
function cellSig(type, c) { return c ? type + ':' + c.size + ':' + (c.ox || 0) + ':' + (c.oy || 0) : ''; }
// One cell's box on a lattice: a square's side, or a hex's width (two half-widths) and its row
function cellBox(G) { return G.type === 'square' ? { w: G.size, h: G.size } : { w: 2 * G.s, h: G.h }; }
// A piece the cell size moves: a character token, a waiting token, or a piece fitted to the grid. Nothing else (a picture, a drawing, a
// wall, a text) moves, so the grid can be lined up under a picture
function cellMoves(w) { return isObj(w) && (w.isChar === true || w.waiting === true || w.gridFit === true) && fin(w.x) && fin(w.y); }
// A piece on the new lattice: its size by the cells it covered on the old one (one at least), and its centre in the cell under it, or for
// a piece of several cells on a square lattice its corner on the nearest line. True when it moved
function seatOn(w, oldG, newG) {
    var ob = cellBox(oldG), nb = cellBox(newG), ow = fin(w.w) && w.w > 0 ? w.w : ob.w, oh = fin(w.h) && w.h > 0 ? w.h : ob.h;
    var cw = Math.max(1, Math.round(ow / ob.w * 100) / 100), ch = Math.max(1, Math.round(oh / ob.h * 100) / 100);
    var nw = Math.round(cw * nb.w * 100) / 100, nh = Math.round(ch * nb.h * 100) / 100, cx = w.x + ow / 2, cy = w.y + oh / 2, x, y;
    if (newG.type === 'square' && (cw > 1.28 || ch > 1.28)) {
        var o = newG.ox || 0, p = newG.oy || 0, s = newG.size;
        x = Math.round((cx - nw / 2 - o) / s) * s + o; y = Math.round((cy - nh / 2 - p) / s) * s + p;
    } else { var c = cellCenter(cellOf(cx, cy, newG), newG); x = c.x - nw / 2; y = c.y - nh / 2; }
    x = Math.round(x * 100) / 100; y = Math.round(y * 100) / 100;
    var moved = x !== w.x || y !== w.y || nw !== w.w || nh !== w.h;
    w.x = x; w.y = y; w.w = nw; w.h = nh;
    return moved;
}
// A list of cells moved from one lattice to the other by each cell's centre, each once
function rekeyCells(list, oldG, newG) {
    if (!Array.isArray(list)) return list;
    var seen = Object.create(null), out = [];
    list.forEach(function(c) {
        if (!isObj(c)) return;
        var cell = oldG.type === 'square' ? { c: c.c, r: c.r } : { q: c.q, r: c.r };
        if (!fin(oldG.type === 'square' ? cell.c : cell.q) || !fin(cell.r)) return;
        var ctr = cellCenter(cell, oldG), n = cellOf(ctr.x, ctr.y, newG), k = cellKey(n, newG);
        if (seen[k]) return; seen[k] = 1; out.push(n);
    });
    return out;
}
// A map's environment cells ({ cellKey: values }) moved the same way, the later of two that land in one cell kept
function rekeyEnv(cells, oldG, newG) {
    if (!isObj(cells)) return cells;
    var out = {};
    Object.keys(cells).forEach(function(k) {
        var m = oldG.type === 'square' ? /^(-?\d+),(-?\d+)$/.exec(k) : /^(-?\d+):(-?\d+)$/.exec(k); if (!m) return;
        var cell = oldG.type === 'square' ? { c: +m[1], r: +m[2] } : { q: +m[1], r: +m[2] }, ctr = cellCenter(cell, oldG), n = cellOf(ctr.x, ctr.y, newG);
        out[cellKey(n, newG)] = cells[k];
    });
    return out;
}
// The one change of a map's cell: map.meta.cell set (or taken off for today's lattice), the hand-painted fog's cells and the environment's
// moved onto the new lattice, and, where resize is true, every token and grid-fitted piece fitted to it. Answers { changed, moved, cell },
// changed false for a map with no grid or a cell that is the one it has
function cellChange(map, next, resize) {
    var g = gridTypeOf(map); if (!g) return { changed: false, moved: 0, cell: null };
    var was = cleanMapCell(map.meta.cell, g), now = cleanMapCell(next, g);
    if (cellSig(g, was) === cellSig(g, now)) return { changed: false, moved: 0, cell: now };
    var oldG = gridFor(g, null, was), newG = gridFor(g, null, now), moved = 0;
    if (now) map.meta.cell = now; else delete map.meta.cell;
    if (isObj(map.fog) && isObj(map.fog.manual)) { var mn = map.fog.manual; if (Array.isArray(mn.adds)) mn.adds = rekeyCells(mn.adds, oldG, newG); if (Array.isArray(mn.cuts)) mn.cuts = rekeyCells(mn.cuts, oldG, newG); }
    if (isObj(map.meta.envCells)) map.meta.envCells = rekeyEnv(map.meta.envCells, oldG, newG);
    if (resize === true && Array.isArray(map.whiteboard)) map.whiteboard.forEach(function(w) { if (cellMoves(w) && seatOn(w, oldG, newG)) moved++; });
    return { changed: true, moved: moved, cell: now };
}
// The cell a picture's printed grid gives, from two clicks n cells apart (a, b board points) and the grid type: a square's side is their
// distance over n with a corner at a; a hex's row is their distance over n down one column with a centre at a. Null where it cannot be read
function cellFromClicks(type, a, b, n) {
    if ((type !== 'square' && type !== 'hex') || !isObj(a) || !isObj(b) || !fin(a.x) || !fin(a.y) || !fin(b.x) || !fin(b.y)) return null;
    if (!(n >= 1) || n !== Math.floor(n) || n > 1000) return null;
    var d = Math.hypot(b.x - a.x, b.y - a.y), size = d / n;
    if (!(d >= 4)) return null;
    var ox = type === 'square' ? a.x : a.x - size * 30 / 52 / 2, oy = a.y;
    return cleanMapCell({ size: size, ox: ox, oy: oy }, type) || { size: type === 'hex' ? 52 : 50 };
}
var API = { VERSION: VERSION, cellSig: cellSig, cellMoves: cellMoves, seatOn: seatOn, rekeyCells: rekeyCells, rekeyEnv: rekeyEnv, cellChange: cellChange, cellFromClicks: cellFromClicks };
if (typeof window !== 'undefined') window.wpCellCore = API;
export { VERSION, cellSig, cellMoves, seatOn, rekeyCells, rekeyEnv, cellChange, cellFromClicks };

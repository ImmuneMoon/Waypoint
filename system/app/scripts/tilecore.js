// tilecore.js: where the rows of a list stand in a body view (1.6.2, docs/BODY_VIEW_PLAN.md). Pure: it reads nothing but its arguments and draws nothing.
// A row hangs from a row (`up`), so the figure comes from the tree. A row with no parent and no child goes in the strip under the figure, and a row in a
// circle a file wrote goes there too, so no row is ever hidden. A child out to one side of its parent steps that way; one on the side its parent is already on, or on no side, stands below it

var TILES_MAX = 400;

function map() { return Object.create(null); }
function idOf(r) { return r && typeof r.id === 'string' && r.id ? r.id : ''; }

// a tile's own hand-set place, or null. Column 0 is the figure's middle, so a place holds whatever else moves
export function cleanTp(v) { if (!v || typeof v !== 'object' || !Number.isInteger(v.c) || !Number.isInteger(v.r) || Math.abs(v.c) > 20 || v.r < 0 || v.r > 60) return null; return { c: v.c, r: v.r }; }
// rows: [{ id, up, side, tp }], side -1 left, 1 right, else none. A row with a tp stands there first and the rest set themselves out around it. { tiles: [{ id, c, r }], strip: [id], cols, rows, lo }, columns and rows from 0, lo the column the figure's middle was moved by
export function tileLayout(rows) {
    var list = (Array.isArray(rows) ? rows : []).filter(idOf).slice(0, TILES_MAX), byId = map(), kids = map(), seated = map(), taken = map(), out = [];
    list.forEach(function(r) { if (!byId[r.id]) byId[r.id] = r; });
    var parentOf = function(r) { return typeof r.up === 'string' && r.up !== r.id && byId[r.up] ? r.up : ''; };
    list.forEach(function(r) { var p = parentOf(r); if (p) (kids[p] = kids[p] || []).push(r); });
    var seat = function(n, c, r, side) {
        var y = r; while (taken[c + '|' + y]) y++;
        taken[c + '|' + y] = 1; seated[n.id] = 1; out.push({ id: n.id, c: c, r: y });
        (kids[n.id] || []).forEach(function(k) {
            if (seated[k.id]) return;
            var s = k.side === -1 || k.side === 1 ? k.side : 0, out2 = s && s !== side;
            seat(k, out2 ? c + s : c, out2 ? y : y + 1, s || side);
        });
    };
    list.forEach(function(r) { var tp = cleanTp(r.tp); if (tp && !seated[r.id] && !taken[tp.c + '|' + tp.r]) { taken[tp.c + '|' + tp.r] = 1; seated[r.id] = 1; out.push({ id: r.id, c: tp.c, r: tp.r }); } });
    var next = 0;
    list.forEach(function(r) { if (seated[r.id] && kids[r.id]) { var at0 = out.filter(function(t) { return t.id === r.id; })[0]; (kids[r.id] || []).forEach(function(k) { if (seated[k.id]) return; var s = k.side === -1 || k.side === 1 ? k.side : 0; seat(k, s ? at0.c + s : at0.c, s ? at0.r : at0.r + 1, s); }); } });
    list.forEach(function(r) { if (parentOf(r) || !kids[r.id] || seated[r.id]) return; seat(r, 0, next, 0); out.forEach(function(t) { if (t.r >= next) next = t.r + 1; }); });
    var strip = list.filter(function(r) { return !seated[r.id]; }).map(function(r) { return r.id; });
    var lo = 0, hi = 0, bot = -1; out.forEach(function(t) { if (t.c < lo) lo = t.c; if (t.c > hi) hi = t.c; if (t.r > bot) bot = t.r; });
    return { tiles: out.map(function(t) { return { id: t.id, c: t.c - lo, r: t.r }; }), strip: strip, cols: out.length ? hi - lo + 1 : 0, rows: bot + 1, lo: lo };
}

// the tile an arrow key goes to: the nearest in that direction, one straight ahead before one off to the side; none: the id it came from
export function tileStep(tiles, id, dir) {
    var ts = Array.isArray(tiles) ? tiles : [], at = ts.filter(function(t) { return t && t.id === id; })[0]; if (!at) return id;
    var dx = dir === 'left' ? -1 : dir === 'right' ? 1 : 0, dy = dir === 'up' ? -1 : dir === 'down' ? 1 : 0, best = null, cost = Infinity;
    ts.forEach(function(t) {
        if (!t || t.id === id) return; var ax = t.c - at.c, ay = t.r - at.r, fw = ax * dx + ay * dy, sd = Math.abs(ax * dy) + Math.abs(ay * dx); if (fw <= 0) return;
        var k = fw * 2 + sd * 3; if (k < cost) { cost = k; best = t; }
    });
    return best ? best.id : id;
}

// a row's side from the words of its stat, or from a figure 1 left, 2 right, as a location's side is written: -1, 1 or 0
export function tileSide(words, n) {
    var w = typeof words === 'string' ? words.toLowerCase() : '';
    if (w.indexOf('left') >= 0) return -1; if (w.indexOf('right') >= 0) return 1;
    return n === 1 ? -1 : n === 2 ? 1 : 0;
}

export const wpTileCore = { tileLayout: tileLayout, tileStep: tileStep, tileSide: tileSide, cleanTp: cleanTp };
if (typeof window !== 'undefined') window.wpTileCore = wpTileCore;

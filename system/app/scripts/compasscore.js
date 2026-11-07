/* Waypoint — a map's compass, the pure half (1.6.2, backlog 82).

   The owner, 2026-11-06, by prompt: everyone sees it and the GM can leave a map without one ("Everyone, GM can hide it"); north is set by
   dragging the rose or in degrees ("drag, or set degrees in map options"); it stands at the bottom right, the bottom left or on the map
   itself ("optional between the three"); three things read it, each a tick of the GM's for the map ("all should be optional"), and a viewer
   can still turn the words off on their own screen ("Both"): the way a token faces in words, the way the ruler points, and the rose drawn
   into the map's picture. The rose is D of docs/sheets/compass-sheet.html: eight points with N, E, S and W ("D").

   A map's compass is meta.compass, present only where the GM put one, so a map with none is stored and sent as before:
     north  whole degrees 1 to 359 the needle turns clockwise from straight up (absent: north is up)
     at     'bl' the bottom left, 'map' a piece on the map (absent: the bottom right)
     x, y   where it stands on the map, board pixels, only with 'map'
     face, ruler, pic   true only: the facing in words, the ruler's way, the map's picture

   Pure: no imports, nothing touched at load time. compasscheck runs it. */

var AT = Object.freeze(['br', 'bl', 'map']);
var WAYS = Object.freeze(['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west']);
var READS = Object.freeze(['face', 'ruler', 'pic']);
var SPAN = 1e6;   // how far from the board's corner a compass on the map may stand

function isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
function mod(a, n) { return ((a % n) + n) % n; }
function own(o, k) { return isObj(o) && Object.prototype.hasOwnProperty.call(o, k); }

// A map's compass as it is kept: null for none
function cleanCompass(v) {
    if (!isObj(v)) return null;
    var o = {}, n = typeof v.north === 'number' && isFinite(v.north) ? mod(Math.round(v.north), 360) : 0; if (n) o.north = n;
    var at = own(v, 'at') && AT.indexOf(v.at) > 0 ? v.at : '';
    if (at === 'map') {
        var x = typeof v.x === 'number' && isFinite(v.x) && Math.abs(v.x) <= SPAN ? Math.round(v.x) : null, y = typeof v.y === 'number' && isFinite(v.y) && Math.abs(v.y) <= SPAN ? Math.round(v.y) : null;
        if (x !== null && y !== null) { o.at = 'map'; o.x = x; o.y = y; }   // a compass on the map with no place stands at the bottom right
    } else if (at) o.at = at;
    READS.forEach(function(k) { if (v[k] === true) o[k] = true; });
    return o;
}
// The compass of a map's meta, cleaned, or null
function compassOf(map) { return map && isObj(map.meta) ? cleanCompass(map.meta.compass) : null; }
// The way a bearing points (degrees clockwise from straight up on the board) by a compass's north: one of eight words, '' with no compass
function wayOf(cmp, deg) {
    var c = cleanCompass(cmp); if (!c || typeof deg !== 'number' || !isFinite(deg)) return '';
    return WAYS[mod(Math.round(mod(deg - (c.north || 0), 360) / 45), 8)];
}
// The bearing from one point of the board to another, degrees clockwise from straight up; null where they are the same point
function bearing(x1, y1, x2, y2) { var dx = x2 - x1, dy = y2 - y1; if (!isFinite(dx) || !isFinite(dy) || (!dx && !dy)) return null; return mod(Math.atan2(dx, -dy) * 180 / Math.PI, 360); }
// Whether a compass's tick for one reader is on: the map's own tick, and the viewer's own words (off: none of the words)
function reads(cmp, k, wordsOn) { var c = cleanCompass(cmp); return !!c && c[k] === true && (k === 'pic' || wordsOn !== false); }
// The needle's turn, in degrees, from where the pointer stands against the rose's middle (dragging the rose)
function northAt(cx, cy, px, py) { var b = bearing(cx, cy, px, py); return b === null ? null : mod(Math.round(b), 360); }

// The rose, D of the sheet, on a 64 by 64 box, north up: its parts in drawing order, each a plain shape the screen and the map's picture
// both draw (a disc, two lines, the three pale points, the gold north point, the hub and the four letters)
var ROSE = Object.freeze([
    Object.freeze({ k: 'disc', cx: 32, cy: 32, r: 30 }),
    Object.freeze({ k: 'line', p: Object.freeze([19, 19, 45, 45]) }),
    Object.freeze({ k: 'line', p: Object.freeze([45, 19, 19, 45]) }),
    Object.freeze({ k: 'pale', p: Object.freeze([32, 50, 35.5, 32, 28.5, 32]) }),
    Object.freeze({ k: 'pale', p: Object.freeze([14, 32, 32, 28.5, 32, 35.5]) }),
    Object.freeze({ k: 'pale', p: Object.freeze([50, 32, 32, 28.5, 32, 35.5]) }),
    Object.freeze({ k: 'gold', p: Object.freeze([32, 15, 35.5, 32, 28.5, 32]) }),
    Object.freeze({ k: 'hub', cx: 32, cy: 32, r: 2.2 }),
    Object.freeze({ k: 'n', t: 'N', x: 32, y: 12.5 }),
    Object.freeze({ k: 'o', t: 'S', x: 32, y: 58.5 }),
    Object.freeze({ k: 'o', t: 'W', x: 8, y: 34.5 }),
    Object.freeze({ k: 'o', t: 'E', x: 56, y: 34.5 })
]);
var INK = Object.freeze({ disc: 'rgba(22,21,27,0.72)', rim: 'rgba(233,230,239,0.55)', pale: '#e9e6ef', gold: '#e3a23b', hub: '#16151b' });

// The rose drawn on a 2d canvas: its middle at cx, cy, size pixels across, turned by north (the map's picture; any context it is handed)
function roseDraw(ctx, cx, cy, size, north) {
    if (!ctx || !(size > 0) || !isFinite(cx) || !isFinite(cy)) return false;
    var k = size / 64, tri = function(p) { ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[2], p[3]); ctx.lineTo(p[4], p[5]); ctx.closePath(); ctx.fill(); };
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(mod(Number(north) || 0, 360) * Math.PI / 180); ctx.scale(k, k); ctx.translate(-32, -32);
    ROSE.forEach(function(p) {
        if (p.k === 'disc') { ctx.beginPath(); ctx.arc(p.cx, p.cy, p.r, 0, Math.PI * 2); ctx.fillStyle = INK.disc; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = INK.rim; ctx.stroke(); }
        else if (p.k === 'line') { ctx.beginPath(); ctx.moveTo(p.p[0], p.p[1]); ctx.lineTo(p.p[2], p.p[3]); ctx.lineWidth = 1.4; ctx.lineCap = 'round'; ctx.strokeStyle = INK.pale; ctx.stroke(); }
        else if (p.k === 'pale' || p.k === 'gold') { ctx.fillStyle = INK[p.k]; tri(p.p); }
        else if (p.k === 'hub') { ctx.beginPath(); ctx.arc(p.cx, p.cy, p.r, 0, Math.PI * 2); ctx.fillStyle = INK.hub; ctx.fill(); }
        else { ctx.fillStyle = p.k === 'n' ? INK.gold : INK.pale; ctx.font = p.k === 'n' ? '700 9px sans-serif' : '600 7px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(p.t, p.x, p.y); }
    });
    ctx.restore(); return true;
}
var api = { roseDraw: roseDraw, AT: AT, WAYS: WAYS, READS: READS, ROSE: ROSE, INK: INK, cleanCompass: cleanCompass, compassOf: compassOf, wayOf: wayOf, bearing: bearing, reads: reads, northAt: northAt };
if (typeof window !== 'undefined') window.wpCompassCore = api;
export { roseDraw, AT, WAYS, READS, ROSE, INK, cleanCompass, compassOf, wayOf, bearing, reads, northAt };

/* Map builder (1.5.4, backlog item 23, fold B4): a map as a picture, the pure half. The owner, 2026-10-10, by prompt on a sheet: the command
   lives in "Export As", the dialog is "As drawn" (Area, Cell size, Grid lines, Labels, Background), and tokens are "Never" in it.

   The picture is DRAWN from the map's own pieces onto a 2d canvas context, never taken from the screen. So it is sharp at any cell size, and
   it shows a piece only where this code draws it: a token, a waiting token, a hidden piece, a GM note card, a light's marker and a trigger
   zone are never drawn, and no cue the GM's screen lays over a piece (a wall's dashes, a lock's dim, a selection) has a line here.

   This module reads nothing but its arguments. It draws through the context it is handed (a real one in the app, a recording one in
   tools/buildcheck.js) and asks the caller for every loaded thing through job.res: a picture by its address, a pattern's tile by its name, a
   label's plain lines. Nothing here loads, parses markup or touches the page. Colours are fixed to the app's dark theme, so the same map
   gives the same picture on every computer.

   What it knowingly does not match to the pixel: a see-through piece's border and pattern are blended on the piece's colour one after the
   other, where the board blends the whole piece once, and a label's words are plain, wrapped by measured width. */
import { cleanTexSrc, cleanTexTile } from './fogcore.js';
import { cleanTexture, TEX, PIC_CELL, picUrl } from './buildcore.js';
import { cssColor, picRef } from './safecore.js';
import { fontCss } from './textfmt.js';

var VERSION = 1;
var CELLS = Object.freeze([50, 70, 100, 140]);   // px a cell in the file; the board itself is 50
// A picture is refused past these, before a canvas is made: a browser gives a blank canvas, or no file, with no error past its own limits
var LIMITS = Object.freeze({ side: 16000, area: 100000000, margin: 25, board: 30000, items: 60000, lines: 400 });
var INK = Object.freeze({ bg: '#15151c', edge: '#3a3a4a', faint: '#6a6a7d', ink: '#e9e9f0', plateDark: '#f2f2f7', plateLight: '#1f1d24' });
var VARS = Object.freeze({ '--bg': '#15151c', '--bg2': '#1c1c26', '--panel': '#20202c', '--panel2': '#262633', '--edge': '#3a3a4a', '--ink': '#e9e9f0', '--dim': '#9a9aad', '--faint': '#6a6a7d', '--gold': '#e0a54f', '--blue': '#4db3d3', '--green': '#5cb87a', '--red': '#d9534f', '--violet': '#b98cff', '--teal': '#3fb6a8', '--steel': '#9aa4b0', '--neutral': '#c9c9d4' });
var BODY_FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
// The clipped shapes, as the style sheet's own polygons, in parts of the piece's box
var POLY = Object.freeze({
    hexagon: [[0.25, 0], [0.75, 0], [1, 0.5], [0.75, 1], [0.25, 1], [0, 0.5]],
    diamond: [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]],
    triangle: [[0.5, 0], [0, 1], [1, 1]],
    star: [[0.5, 0], [0.61, 0.35], [0.98, 0.35], [0.68, 0.57], [0.79, 0.91], [0.5, 0.7], [0.21, 0.91], [0.32, 0.57], [0.02, 0.35], [0.39, 0.35]]
});
var BOXES = Object.freeze({ rect: 1, circle: 1, hexagon: 1, diamond: 1, triangle: 1, star: 1, line: 1 });
var TEXTURED = Object.freeze({ rect: 1, circle: 1, hexagon: 1, diamond: 1 });   // the kinds of box that wear a pattern or a picture
var LAYER_Z = Object.freeze({ 'back': 10, 'back-mid': 15, 'middle': 20, 'front-mid': 25, 'front': 30 });
var GRID_Z = 15000;

function fin(v) { return typeof v === 'number' && isFinite(v); }
function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
function mod(v, m) { v = fin(v) ? v : 0; return ((v % m) + m) % m; }
function alpha(v) { return fin(v) && v >= 0 && v < 1 ? v : 1; }

// A stored colour as a canvas takes one. A canvas ignores a var() without a word and keeps its last colour, so the theme's names are read
// here as the dark theme has them, and one this table lacks is the fallback
// The forms a canvas takes for certain: a hex of 3, 4, 6 or 8 digits, rgb of three plain numbers or three percentages, hsl, each with an
// alpha or none, and a colour's own name. A canvas says nothing at a colour it cannot read and keeps the one it had, which is whatever was
// drawn last. So any other form the sink's own rule lets through (inherit, a word that is no colour, rgb(1,2), a hex of five digits) is
// the fallback, never the last colour
var NUMC = '(?:\\d+(?:\\.\\d+)?|\\.\\d+)', ALPHAC = '\\s*(?:,\\s*' + NUMC + '%?\\s*)?\\)$';
var CANVAS_RE = Object.freeze([/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i,
    new RegExp('^rgba?\\(\\s*' + NUMC + '\\s*,\\s*' + NUMC + '\\s*,\\s*' + NUMC + ALPHAC, 'i'),
    new RegExp('^rgba?\\(\\s*' + NUMC + '%\\s*,\\s*' + NUMC + '%\\s*,\\s*' + NUMC + '%' + ALPHAC, 'i'),
    new RegExp('^hsla?\\(\\s*' + NUMC + '\\s*,\\s*' + NUMC + '%\\s*,\\s*' + NUMC + '%' + ALPHAC, 'i')]);
var NAMED = Object.freeze(('aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen transparent').split(' ').reduce(function(o, n) { o[n] = 1; return o; }, Object.create(null)));
function canvasColor(c) {
    if (typeof c !== 'string') return false;
    if (NAMED[c.toLowerCase()] === 1) return true;
    for (var i = 0; i < CANVAS_RE.length; i++) if (CANVAS_RE[i].test(c)) return true;
    return false;
}
function paint(v, fallback) {
    var c = cssColor(v, '');
    if (!c) return fallback;
    var m = /^var\((--[a-z0-9-]+)\)$/i.exec(c);
    if (m) return own(VARS, m[1]) ? VARS[m[1]] : fallback;
    return canvasColor(c) ? c : fallback;
}
// The ink a label takes on its own plate, as the board's plateInk reads the plate: light words on a dark plate, dark on a light one
function plateInk(bg) {
    if (typeof bg !== 'string' || !bg || bg === 'transparent') return '';
    var r, g, b, a = 1, m, s = bg.trim();
    if ((m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s))) {
        var x = m[1].length === 3 ? m[1].split('').map(function(c) { return c + c; }).join('') : m[1];
        r = parseInt(x.slice(0, 2), 16); g = parseInt(x.slice(2, 4), 16); b = parseInt(x.slice(4, 6), 16);
    } else if ((m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(s))) {
        r = +m[1]; g = +m[2]; b = +m[3]; if (m[4] !== undefined) a = +m[4];
    } else return '';
    if (a < 0.35) return '';
    return 0.299 * r + 0.587 * g + 0.114 * b < 128 ? INK.plateDark : INK.plateLight;
}

/* ---------- which pieces, and in what order ---------- */
// A piece belongs in the picture when players see it as part of the map. Never a token, a waiting token, a hidden piece, a GM note card, a
// light's marker or a trigger zone, and a label only where labels are asked for. A piece with no place or no size is none
function shows(item, labels) {
    if (!item || typeof item !== 'object' || item.hidden || item.gmNoteFor || item.isChar || item.waiting) return false;
    if (!fin(item.x) || !fin(item.y) || !fin(item.w) || !fin(item.h) || item.w < 0 || item.h < 0) return false;
    var t = item.type;
    if (t === 'text') return labels === true;
    return t === 'image' || t === 'path' || BOXES[t] === 1;
}
// The board's own stacking, as its renderer sets it: a layer's level, a drawing above the tokens' level, a piece marked above the grid.
// On a map that has a grid a label lies over every other piece, as it does on the board, whether or not the picture draws the grid's lines
function stackZ(item, gridOn) {
    var n = Number(item.z), z = fin(n) && n ? n : 10;   // read as systemcore's stackZ reads it: a level a file wrote as text counts
    if (typeof item.layer === 'string' && own(LAYER_Z, item.layer)) z = LAYER_Z[item.layer];
    if (item.type === 'path' && !item.layer) z = Math.max(z, 35);
    if (item.aboveGrid) z += 15020;
    if (gridOn && item.type === 'text') z = 15010;
    return z;
}
// The pieces to draw, lowest first, the later of two on one level on top (the board's rule), split at the grid's own level. A map of more
// pieces than one picture draws answers `cut`, only as true: the first of them in the map's own order are kept
function order(items, opts) {
    var o = opts || {}, list = Array.isArray(items) ? items : [], kept = [];
    var cut = false;
    for (var i = 0; i < list.length; i++) if (shows(list[i], o.labels === true)) { if (kept.length >= LIMITS.items) { cut = true; break; } kept.push({ item: list[i], z: stackZ(list[i], !!o.grid), i: i }); }
    kept.sort(function(a, b) { return a.z - b.z || a.i - b.i; });
    var under = [], over = [];
    kept.forEach(function(k) { (k.z < GRID_Z ? under : over).push(k.item); });
    var out = { under: under, over: over }; if (cut) out.cut = true;   // more pieces than one picture draws: the caller says so
    return out;
}

/* ---------- the area ---------- */
// The box a piece covers as it is drawn: its own box turned about its centre, and for a line its whole width more each way, which covers
// the half that spills past its box, a square end and a blunt corner
function extent(item, wide) {
    var x = item.x, y = item.y, w = item.w, h = item.h, pad = 0;
    if (item.type === 'path' && item.tip !== 'fill') {
        var bw = fin(item.baseW) && item.baseW > 0 ? item.baseW : w, bh = fin(item.baseH) && item.baseH > 0 ? item.baseH : h, sw = fin(item.strokeWidth) && item.strokeWidth > 0 ? item.strokeWidth : 3;
        pad = sw * Math.max(bw > 0 ? w / bw : 1, bh > 0 ? h / bh : 1, 1) * (wide === true ? 6 : 1);
    }
    var rot = fin(item.rot) ? item.rot % 360 : 0;
    if (!rot) return { x: x - pad, y: y - pad, w: w + 2 * pad, h: h + 2 * pad };
    var a = rot * Math.PI / 180, c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a)), hw = (w / 2 + pad), hh = (h / 2 + pad), ex = hw * c + hh * s, ey = hw * s + hh * c;
    return { x: x + w / 2 - ex, y: y + h / 2 - ey, w: 2 * ex, h: 2 * ey };
}
// Whether a piece could show inside a box of the board: by its extent, taken six times wider for a line, whose sharp corners reach past
// its width. A label always could, since its words are not held to its box. With no box every piece could
function near(item, box) {
    if (!box || item.type === 'text') return true;
    var e = extent(item, true);
    return e.x < box.x + box.w && e.x + e.w > box.x && e.y < box.y + box.h && e.y + e.h > box.y;
}
// "The whole map": the box around every piece the picture draws, with a small margin, held to the board. null where it draws nothing. A
// piece the picture leaves out never widens it, so the picture's size says nothing of what is hidden. With opts.snap the box is widened
// to the lines of that lattice, so that the picture begins and ends on a grid line and a grid laid over it elsewhere starts at its corner
function bounds(items, opts) {
    var o = order(items, opts), all = o.under.concat(o.over), x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    all.forEach(function(it) { var e = extent(it); x0 = Math.min(x0, e.x); y0 = Math.min(y0, e.y); x1 = Math.max(x1, e.x + e.w); y1 = Math.max(y1, e.y + e.h); });
    if (!all.length) return null;
    var m = LIMITS.margin, B = LIMITS.board;
    x0 = Math.max(0, Math.floor(x0 - m)); y0 = Math.max(0, Math.floor(y0 - m)); x1 = Math.min(B, Math.ceil(x1 + m)); y1 = Math.min(B, Math.ceil(y1 + m));
    var sn = opts && opts.snap, sw = sn && fin(sn.w) && sn.w >= 1 ? sn.w : 0, sh = sn && fin(sn.h) && sn.h >= 1 ? sn.h : 0;   // opts.snap: the map's own lattice, { w, h }
    if (sw) { x0 = Math.floor(x0 / sw) * sw; x1 = Math.min(B, Math.ceil(x1 / sw) * sw); }
    if (sh) { y0 = Math.floor(y0 / sh) * sh; y1 = Math.min(B, Math.ceil(y1 / sh) * sh); }
    return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}
// A box of the board as handed in (what is on screen), held to the board; null for one that is no box
function viewBox(v) {
    if (!v || !fin(v.x) || !fin(v.y) || !fin(v.w) || !fin(v.h)) return null;
    var B = LIMITS.board, x0 = Math.max(0, Math.floor(v.x)), y0 = Math.max(0, Math.floor(v.y)), x1 = Math.min(B, Math.ceil(v.x + v.w)), y1 = Math.min(B, Math.ceil(v.y + v.h));
    return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}

/* ---------- the size ---------- */
function cleanCell(v) { return CELLS.indexOf(v) >= 0 ? v : 70; }
function fits(w, h) { return fin(w) && fin(h) && w >= 1 && h >= 1 && w <= LIMITS.side && h <= LIMITS.side && w * h <= LIMITS.area; }
// What a box becomes at a cell size: its size in pixels, whether a picture that large is made, and where it is not, the largest cell size
// below the asked one at which it would be (0 for none)
function plan(box, cell) {
    var c = cleanCell(cell), s = c / 50;
    if (!box || !(box.w > 0) || !(box.h > 0)) return { ok: false, why: 'empty', cell: c, scale: s, w: 0, h: 0, fit: 0 };
    var w = Math.ceil(box.w * s), h = Math.ceil(box.h * s), ok = fits(w, h), fit = 0;
    if (!ok) for (var i = CELLS.length - 1; i >= 0 && !fit; i--) if (CELLS[i] < c && fits(Math.ceil(box.w * CELLS[i] / 50), Math.ceil(box.h * CELLS[i] / 50))) fit = CELLS[i];
    return { ok: ok, why: ok ? '' : 'large', cell: c, scale: s, w: w, h: h, fit: fit };
}
function num(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
// The dialog's line under Cell size, in fixed words
function sizeWords(p, area) {
    if (!p || p.why === 'empty') return area === 'view' ? 'There is nothing on screen to save.' : 'There is nothing on this map for a picture yet.';
    if (p.ok) return 'The picture will be ' + num(p.w) + ' by ' + num(p.h) + ' pixels.';
    if (p.fit) return 'Too large to make at ' + p.cell + ' px a cell. ' + p.fit + ' px a cell fits.';
    return area === 'view' ? 'Too large to make at any cell size. Zoom in and try again.' : 'Too large to make at any cell size. Choose What is on screen.';
}

/* ---------- what a picture needs loaded first ---------- */
// The picture a piece wears as its fill, as the board's one reader has it: on a box shape or a filled region, the path only as the cleaner
// keeps it, its repeat 1, 2, 4 or whole. null for none
function fillOf(item) {
    var box = TEXTURED[item.type] === 1;
    if (!box && !(item.type === 'path' && item.tip === 'fill')) return null;
    var src = cleanTexSrc(item.texSrc); if (!src) return null;
    var url = picUrl(src); if (!url) return null;
    return { url: url, tile: cleanTexTile(item.texTile) || 1 };
}
// The pattern a piece wears: a name of the app's own list, on a box shape or a filled drawing, and never beside a picture
function patternOf(item) {
    if (fillOf(item)) return null;
    if (!(TEXTURED[item.type] === 1 || (item.type === 'path' && (item.tip === 'fill' || item.tip === 'flat')))) return null;
    return cleanTexture(item.texture);
}
// The address a picture piece is loaded from: the app's own paths only (safecore picRef: never a web address), encoded for a request
function picOf(item) {
    var ref = picRef(item.src); if (!ref) return '';
    if (/^(data:|blob:)/i.test(ref)) return ref;
    try { return encodeURI(ref); } catch (e) { return ''; }
}
function fontOf(item, scale) {
    var size = fin(item.fontSize) && item.fontSize >= 4 && item.fontSize <= 400 ? item.fontSize : 16, fam = fontCss(item.font) || BODY_FONT;
    return { px: size * scale, css: (size * scale) + 'px ' + fam, load: size + 'px ' + fam };
}
// Everything the caller loads before draw: each picture's address once, each pattern's name once, each label's font once. With opts.box,
// only for the pieces that could show inside that box, which are the ones draw draws
function needs(items, opts) {
    var o = order(items, opts), box = opts && opts.box ? opts.box : null, all = o.under.concat(o.over).filter(function(it) { return near(it, box); }), pics = [], tiles = [], fonts = [], seen = Object.create(null);
    var add = function(list, kind, v) { if (v && !seen[kind + v]) { seen[kind + v] = 1; list.push(v); } };
    all.forEach(function(it) {
        if (it.type === 'image') add(pics, 'p', picOf(it));
        else if (it.type === 'text') add(fonts, 'f', fontOf(it, 1).load);
        else { var f = fillOf(it); if (f) add(pics, 'p', f.url); else add(tiles, 't', patternOf(it)); }
    });
    var need = { pics: pics, tiles: tiles, fonts: fonts, count: all.length }; if (o.cut) need.cut = true;
    return need;
}

/* ---------- a label's words ---------- */
var BLOCK_TAGS = Object.freeze({ DIV: 1, P: 1, LI: 1, H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1, BLOCKQUOTE: 1, PRE: 1, TR: 1, TD: 1, TH: 1, UL: 1, OL: 1, DL: 1, DT: 1, DD: 1, TABLE: 1, CAPTION: 1, HR: 1 });
// what a page never shows as words: code, a picture, and the text an element holds only for a browser that cannot show the element itself
var SKIP_TAGS = Object.freeze({ SCRIPT: 1, STYLE: 1, IMG: 1, TEMPLATE: 1, SVG: 1, HEAD: 1, TITLE: 1, NOSCRIPT: 1, IFRAME: 1, NOEMBED: 1, NOFRAMES: 1, XMP: 1, TEXTAREA: 1, CANVAS: 1, VIDEO: 1, AUDIO: 1, OBJECT: 1, DATALIST: 1, SELECT: 1, MATH: 1 });
// The plain lines of a text box's markup, read from a tree that was parsed elsewhere and never put on the page: a text node's characters, a
// line break at br and around a block, runs of white space as one space. Nothing of a tag or an address is read, and of a style only
// whether it puts the element away: an element that is hidden holds no words of the label
function plainLines(node) {
    var lines = [''], n = 0;
    var brk = function() { if (lines[lines.length - 1] !== '' || lines.length === 1) lines.push(''); };
    (function walk(nd, depth) {
        if (!nd || depth > 60 || n++ > 20000) return;
        if (nd.nodeType === 3) { lines[lines.length - 1] += String(nd.nodeValue == null ? '' : nd.nodeValue); return; }
        if (nd.nodeType !== 1 && nd.nodeType !== 9 && nd.nodeType !== 11) return;
        var tag = typeof nd.tagName === 'string' ? nd.tagName.toUpperCase() : '';
        if (SKIP_TAGS[tag] === 1 || nd.hidden === true || (nd.style && nd.style.display === 'none')) return;   // nor an element the markup itself puts away
        if (tag === 'BR') { lines.push(''); return; }
        var block = BLOCK_TAGS[tag] === 1, kids = nd.childNodes;
        if (block) brk();
        for (var i = 0; kids && i < kids.length; i++) walk(kids[i], depth + 1);
        if (block) brk();
    })(node, 0);
    var out = lines.map(function(l) { return l.replace(/[\s\u00a0]+/g, ' ').trim(); });
    while (out.length && out[0] === '') out.shift();
    while (out.length && out[out.length - 1] === '') out.pop();
    return out.slice(0, LIMITS.lines);
}
// Lines broken to a width by a measure of the caller's: at a space where one fits, inside a word where a word alone is too wide
function wrapLines(lines, maxW, measure) {
    var out = [];
    if (!Array.isArray(lines) || typeof measure !== 'function' || !(maxW > 0)) return out;
    for (var li = 0; li < lines.length && out.length < LIMITS.lines; li++) {
        var words = String(lines[li]).split(' '), cur = '';
        if (lines[li] === '') { out.push(''); continue; }
        for (var wi = 0; wi < words.length; wi++) {
            var word = words[wi], tryLine = cur ? cur + ' ' + word : word;
            if (measure(tryLine) <= maxW) { cur = tryLine; continue; }
            if (cur) { out.push(cur); cur = ''; }
            if (measure(word) <= maxW) { cur = word; continue; }
            var cps = Array.from(word), part = '';
            for (var ci = 0; ci < cps.length; ci++) {
                if (part && measure(part + cps[ci]) > maxW) { out.push(part); part = ''; }
                part += cps[ci];
            }
            cur = part;
        }
        if (cur) out.push(cur);
    }
    return out.slice(0, LIMITS.lines);
}

/* ---------- drawing ---------- */
function roundRect(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    if (!r) { ctx.rect(x, y, w, h); return; }
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
}
function polygon(ctx, pts, w, h) {
    ctx.beginPath();
    for (var i = 0; i < pts.length; i++) { if (i) ctx.lineTo(pts[i][0] * w, pts[i][1] * h); else ctx.moveTo(pts[i][0] * w, pts[i][1] * h); }
    ctx.closePath();
}
// The outline of a box shape in its own frame (its corner at 0,0), as the style sheet shapes it. plain: a piece that wears a pattern or a
// picture has square corners
function outline(ctx, type, w, h, s, plain) {
    if (type === 'circle') { ctx.beginPath(); ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); ctx.closePath(); }
    else if (own(POLY, type)) polygon(ctx, POLY[type], w, h);
    else roundRect(ctx, 0, 0, w, h, plain ? 0 : (type === 'line' ? 4 : 6) * s);
}
// A pattern's tile or a picture's repeat laid over the shape that was just clipped to, seated as the board seats it: from the piece's own
// corner, back by the piece's place within one repeat, so that pieces side by side read as one surface
function tileOver(ctx, img, sx, sy, item, tw, th, s, w, h) {
    var pat = typeof ctx.createPattern === 'function' ? ctx.createPattern(img, 'repeat') : null; if (!pat) return false;
    if (typeof pat.setTransform === 'function') pat.setTransform({ a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 });
    ctx.translate(-mod(item.x, tw) * s, -mod(item.y, th) * s);
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, w + tw * s, h + th * s);
    return true;
}
// The fill a piece wears over its colour, inside the clip the caller set, in the piece's own frame at the picture's scale. True when drawn
function wear(ctx, item, job, w, h) {
    var s = job.scale, res = job.res || {}, f = fillOf(item);
    if (f) {
        var p = typeof res.pic === 'function' ? res.pic(f.url) : null;
        if (!p || !p.img || !(p.w > 0) || !(p.h > 0)) { job.out.missing++; return false; }
        if (f.tile === 'whole') { ctx.drawImage(p.img, 0, 0, w, h); return true; }
        var rep = f.tile * PIC_CELL;
        return tileOver(ctx, p.img, rep * s / p.w, rep * s / p.h, item, rep, rep, s, w, h);
    }
    var name = patternOf(item); if (!name) return false;
    var t = typeof res.tile === 'function' ? res.tile(name) : null;
    if (!t || !t.img || !(t.k > 0)) return false;
    return tileOver(ctx, t.img, s / t.k, s / t.k, item, TEX[name].w, TEX[name].h, s, w, h);
}
function drawBox(ctx, item, job, w, h) {
    var s = job.scale, t = item.type, worn = !!(fillOf(item) || patternOf(item)), col;
    if (t === 'line') col = paint(item.color, INK.edge);
    else if (own(POLY, t)) col = paint(item.color, INK.faint);
    else col = paint(item.color, '');
    if (col && col !== 'transparent') { outline(ctx, t, w, h, s, worn); ctx.fillStyle = col; ctx.fill(); }
    if (worn) { ctx.save(); outline(ctx, t, w, h, s, true); ctx.clip(); wear(ctx, item, job, w, h); ctx.restore(); return; }
    if (t === 'rect' || t === 'circle') {   // the 2 px edge of a plain rectangle or circle, inside its box
        var b = 2 * s; if (!(w > b) || !(h > b)) return;
        ctx.strokeStyle = INK.edge; ctx.lineWidth = b;
        if (t === 'circle') { ctx.beginPath(); ctx.ellipse(w / 2, h / 2, (w - b) / 2, (h - b) / 2, 0, 0, Math.PI * 2); ctx.closePath(); }
        else roundRect(ctx, b / 2, b / 2, w - b, h - b, 6 * s - b / 2);
        ctx.stroke();
    }
}
function drawImagePiece(ctx, item, job, w, h) {
    var addr = picOf(item), res = job.res || {}, p = addr && typeof res.pic === 'function' ? res.pic(addr) : null;
    if (!p || !p.img || !(p.w > 0) || !(p.h > 0)) { job.out.missing++; return; }
    var k = Math.min(w / p.w, h / p.h), dw = p.w * k, dh = p.h * k;   // contain: the whole picture inside the box, centred
    ctx.drawImage(p.img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}
function pointsOk(pts, min) { if (!Array.isArray(pts) || pts.length < min) return false; for (var i = 0; i < pts.length; i++) if (!Array.isArray(pts[i]) || !fin(pts[i][0]) || !fin(pts[i][1])) return false; return true; }
function trace(ctx, pts, close) { for (var i = 0; i < pts.length; i++) { if (i) ctx.lineTo(pts[i][0], pts[i][1]); else ctx.moveTo(pts[i][0], pts[i][1]); } if (close) ctx.closePath(); }
function drawPath(ctx, item, job, w, h) {
    var s = job.scale, bw = fin(item.baseW) && item.baseW > 0 ? item.baseW : item.w, bh = fin(item.baseH) && item.baseH > 0 ? item.baseH : item.h;
    if (!(bw > 0) || !(bh > 0) || !(w > 0) || !(h > 0) || !pointsOk(item.pts, item.tip === 'fill' ? 3 : 1) || item.pts.length > 20000) return;   // a line with no height has no box to be drawn in: the board shows none either
    var tip = item.tip === 'fill' || item.tip === 'flat' || item.tip === 'square' ? item.tip : 'round', col = paint(item.color, INK.ink), sw = fin(item.strokeWidth) && item.strokeWidth > 0 ? item.strokeWidth : 3, pts = item.pts, rule = 'nonzero';
    var shape = function() {
        ctx.beginPath();
        if (tip === 'fill') {
            trace(ctx, pts, true);
            if (Array.isArray(item.holes)) item.holes.forEach(function(hole) { if (pointsOk(hole, 3)) { trace(ctx, hole, true); rule = 'evenodd'; } });
        } else {   // a flat nib: a ribbon between the line moved half a width one way along the nib and the same line moved the other way
            var o = 0.70711 * sw / 2, top = pts.map(function(q) { return [q[0] + o, q[1] + o]; }), bot = pts.map(function(q) { return [q[0] - o, q[1] - o]; }).reverse();
            trace(ctx, top.concat(bot), true);
        }
    };
    ctx.save();
    ctx.scale(w / bw, h / bh);   // the drawing's own units: its points, and its width, stretch with its box
    if (tip === 'fill' || tip === 'flat') {
        shape(); ctx.fillStyle = col; if (rule === 'evenodd') ctx.fill('evenodd'); else ctx.fill();
        if (fillOf(item) || patternOf(item)) { shape(); if (rule === 'evenodd') ctx.clip('evenodd'); else ctx.clip(); ctx.scale(bw / w, bh / h); wear(ctx, item, job, w, h); }
    } else {
        ctx.beginPath(); trace(ctx, pts, false);
        ctx.strokeStyle = col; ctx.lineWidth = sw; ctx.lineCap = tip === 'square' ? 'square' : 'round'; ctx.lineJoin = tip === 'square' ? 'miter' : 'round';
        if (tip === 'square') ctx.miterLimit = 4;   // the board's line is an svg stroke, whose sharp corners are cut off at 4: a canvas's own 10 would draw a needle there
        ctx.stroke();
    }
    ctx.restore();
}
function drawLabel(ctx, item, job, w, h) {
    var s = job.scale, res = job.res || {}, base = ctx.globalAlpha, plate = paint(item.bg, '');
    if (plate && plate !== 'transparent') { ctx.globalAlpha = base * alpha(item.bgOpacity); roundRect(ctx, 0, 0, w, h, 4 * s); ctx.fillStyle = plate; ctx.fill(); }
    var lines = typeof res.text === 'function' ? res.text(item) : null; if (!Array.isArray(lines) || !lines.length) { ctx.globalAlpha = base; return; }
    var f = fontOf(item, s), pad = 5 * s, lh = f.px * 1.5, stored = cssColor(item.color, ''), ink = !stored || stored === 'transparent' || stored === 'var(--panel2)' ? (plateInk(typeof item.bg === 'string' ? item.bg : '') || (job.bg === 'none' ? INK.plateLight : INK.ink)) : paint(item.color, INK.ink);
    ctx.font = f.css;
    var wrapped = wrapLines(lines, Math.max(1, w - 2 * pad), function(t) { return ctx.measureText(t).width; });
    var align = item.align === 'left' || item.align === 'right' ? item.align : 'center', total = wrapped.length * lh, top = item.valign === 'top' ? pad : item.valign === 'bottom' ? h - pad - total : (h - total) / 2, x = align === 'left' ? pad : align === 'right' ? w - pad : w / 2;
    ctx.globalAlpha = base * alpha(item.textOpacity); ctx.fillStyle = ink; ctx.textAlign = align; ctx.textBaseline = 'middle';
    for (var i = 0; i < wrapped.length; i++) if (wrapped[i]) ctx.fillText(wrapped[i], x, top + lh * (i + 0.5));
    ctx.globalAlpha = base;
}
// One piece: its box turned about its centre, see-through as the piece is, then what its kind draws
function drawPiece(ctx, item, job) {
    var s = job.scale, w = item.w * s, h = item.h * s, rot = fin(item.rot) ? item.rot % 360 : 0;
    ctx.save();
    ctx.globalAlpha = alpha(item.opacity);
    ctx.translate((item.x - job.box.x) * s + w / 2, (item.y - job.box.y) * s + h / 2);
    if (rot) ctx.rotate(rot * Math.PI / 180);
    ctx.translate(-w / 2, -h / 2);
    if (item.type === 'image') drawImagePiece(ctx, item, job, w, h);
    else if (item.type === 'path') drawPath(ctx, item, job, w, h);
    else if (item.type === 'text') drawLabel(ctx, item, job, w, h);
    else drawBox(ctx, item, job, w, h);
    ctx.restore();
}
// The map's own grid over the area, as the board draws it and scaled with the picture: on squares a light core under a dark band at every
// 50 px, on hexagons the seven edges of the board's 90 by 52 tile, dark under light
var HEX_EDGES = Object.freeze([[30, 26, 0, 26], [30, 26, 45, 0], [30, 26, 45, 52], [75, 0, 45, 0], [75, 0, 90, 26], [75, 52, 45, 52], [75, 52, 90, 26]]);
function drawGrid(ctx, job) {
    var s = job.scale, b = job.box, W = b.w * s, H = b.h * s, kind = job.grid;
    if (kind === 'square') {
        var bands = [['rgba(255,255,255,0.55)', 1], ['rgba(0,0,0,0.55)', 3]];
        bands.forEach(function(band) {
            ctx.fillStyle = band[0];
            for (var gx = Math.ceil(b.x / 50) * 50; gx <= b.x + b.w; gx += 50) ctx.fillRect((gx - b.x - band[1] / 2) * s, 0, band[1] * s, H);
            for (var gy = Math.ceil(b.y / 50) * 50; gy <= b.y + b.h; gy += 50) ctx.fillRect(0, (gy - b.y - band[1] / 2) * s, W, band[1] * s);
        });
    } else if (kind === 'hex') {
        var strokes = [['rgba(0,0,0,0.55)', 3], ['rgba(255,255,255,0.55)', 1.2]], tx0 = Math.floor(b.x / 90) * 90, ty0 = Math.floor(b.y / 52) * 52;
        strokes.forEach(function(st) {
            ctx.strokeStyle = st[0]; ctx.lineWidth = st[1] * s; ctx.lineCap = 'butt';
            ctx.beginPath();
            for (var tx = tx0; tx < b.x + b.w; tx += 90) for (var ty = ty0; ty < b.y + b.h; ty += 52) HEX_EDGES.forEach(function(e) { ctx.moveTo((tx + e[0] - b.x) * s, (ty + e[1] - b.y) * s); ctx.lineTo((tx + e[2] - b.x) * s, (ty + e[3] - b.y) * s); });
            ctx.stroke();
        });
    }
}
// The whole picture onto a context that is job.box at job.scale: the ground, the pieces under the grid, the grid, what lies over it. It
// answers what it drew and what it had to leave out (`missing` pictures, and `cut`, only as true, for a map of more pieces than one picture
// draws). The ground and the clip cover the canvas's whole pixels, which plan() rounds up. Everything is drawn in one go, in the board's own
// order: the caller loads first.
// job.grid is the MAP's own grid ('square', 'hex' or none), which decides the order; job.lines false leaves its lines out of the picture
function draw(ctx, job) {
    var out = { drawn: 0, missing: 0 };
    if (!ctx || !job || !job.box || !(job.scale > 0)) return out;
    job.out = out;
    var s = job.scale, W = Math.ceil(job.box.w * s), H = Math.ceil(job.box.h * s), grid = job.grid === 'square' || job.grid === 'hex' ? job.grid : '', o = order(job.items, { labels: job.labels === true, grid: !!grid });
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
    if (job.bg !== 'none') { ctx.fillStyle = INK.bg; ctx.fillRect(0, 0, W, H); }
    o.under.forEach(function(it) { if (near(it, job.box)) { drawPiece(ctx, it, job); out.drawn++; } });   // a piece wholly outside the box is passed over
    if (grid && job.lines !== false) { ctx.save(); drawGrid(ctx, { scale: s, box: job.box, grid: grid }); ctx.restore(); }
    o.over.forEach(function(it) { if (near(it, job.box)) { drawPiece(ctx, it, job); out.drawn++; } });
    ctx.restore();
    if (o.cut) out.cut = true;
    return out;
}

var API = { VERSION: VERSION, CELLS: CELLS, LIMITS: LIMITS, INK: INK, POLY: POLY, paint: paint, plateInk: plateInk, shows: shows, stackZ: stackZ, order: order, extent: extent, bounds: bounds, viewBox: viewBox, cleanCell: cleanCell, fits: fits, plan: plan, sizeWords: sizeWords, fillOf: fillOf, patternOf: patternOf, picOf: picOf, fontOf: fontOf, needs: needs, plainLines: plainLines, wrapLines: wrapLines, draw: draw };
if (typeof window !== 'undefined') window.wpShotCore = API;
export { VERSION, CELLS, LIMITS, INK, POLY, paint, plateInk, shows, stackZ, order, extent, bounds, viewBox, cleanCell, fits, plan, sizeWords, fillOf, patternOf, picOf, fontOf, needs, plainLines, wrapLines, draw };

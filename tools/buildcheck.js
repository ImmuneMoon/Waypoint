/* Offline check of the map builder's pure half (backlog item 23, fold B1: system/app/scripts/buildcore.js) — the eight code-drawn
   textures (a frozen list of names, fogcore's own; seamless whole-pixel SVG tiles built from constants, the CSS and the SVG <pattern>
   a piece draws them by, the position that makes abutting pieces one pattern), the seven materials and the props bag a piece takes
   (built by whitelist; the real fogcore and fog.js read the bag as a wall, a door, cover, terrain), the pen's Wall-line preset, and
   the lattice maths proved against the real fogcore and the app's own snapToHex (a snapped box, a hexagon on its cell, the cells of a
   box, a corridor, a polygon's vertex and item, the piece already seated). No DOM. Usage: node tools/buildcheck.js   (exit 1 on any failure) */
'use strict';
const path = require('path'), fs = require('fs'), os = require('os'), cp = require('child_process');
const NL = String.fromCharCode(10);
const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).replace(/[\\]/g, '/');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/\r\n/g, NL);
const j = o => JSON.stringify(o);
let pass = 0, fail = 0;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok       ', name); } else { fail++; console.log('FAIL     ', name, detail !== undefined ? '-> ' + String(detail).slice(0, 400) : ''); } }
// the first function of that name in a source, up to its closing brace at the indent it opened with (how fogcheck slices fog.js)
function cut(src, head, indent) { const i = src.indexOf(head), end = NL + (indent || '') + '}' + NL, k = src.indexOf(end, i); if (i < 0 || k < 0) throw new Error('buildcheck: ' + head + ' not found'); return src.slice(i, k + end.length); }
let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;   // a tiny LCG: the same walk every run
const ri = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));

let summed = false;   // a check that never settles (a promise nothing answers) would let Node exit with no summary and code 0: that is a failure
process.on('exit', code => { if (!summed && !code) { console.log(NL + 'FAIL      the asynchronous checks never finished (a promise was left waiting)'); process.exitCode = 1; } });
(async () => {
    let B = null, F = null, err = null;
    try { B = await import(url('buildcore.js')); F = await import(url('fogcore.js')); } catch (e) { err = e; }
    check('buildcore loads in Node with no window (and fogcore beside it)', !!B && !F === false && !err, err && err.stack);
    if (!B || !F) { console.log(NL + pass + ' passed, ' + fail + ' failed.'); process.exit(1); }
    const src = read('system/app/scripts/buildcore.js');
    const HOSTILE = ['constructor', '__proto__', 'hasOwnProperty', 'toString', 'valueOf', 'Flagstones', 'flagstones ', ' flagstones', 'url(x)', '/saves/images/x.png', 'data:image/png;base64,AA', '', 1, null, undefined, {}, [], true];

    /* ---- textures ---- */
    check('TEXTURES: frozen, eight lower-case names, fogcore\'s own eight element for element (the cleaner on the wire and the drawer agree); TEX holds exactly them, both ways',
        Object.isFrozen(B.TEXTURES) && B.TEXTURES.length === 8 && B.TEXTURES.every(n => /^[a-z][a-z0-9-]{0,23}$/.test(n)) && j(B.TEXTURES) === j(F.TEXTURES) && j(B.TEXTURES) === j(['flagstones', 'bricks', 'cobbles', 'planks', 'stone', 'hatching', 'ripples', 'grass'])
        && j(Object.keys(B.TEX)) === j(B.TEXTURES) && B.TEXTURES.every(n => Object.prototype.hasOwnProperty.call(B.TEX, n)) && B.VERSION === 1, j([B.TEXTURES, F.TEXTURES, Object.keys(B.TEX)]));
    check('TEX, TEX_CSS and MATERIALS have no prototype and are frozen (each entry too): a name like constructor finds nothing',
        [B.TEX, B.TEX_CSS, B.MATERIALS].every(t => Object.getPrototypeOf(t) === null && Object.isFrozen(t)) && B.TEXTURES.every(n => Object.isFrozen(B.TEX[n]) && Object.isFrozen(B.TEX_CSS[n])) && B.MATERIAL_IDS.every(m => Object.isFrozen(B.MATERIALS[m]))
        && B.TEX.constructor === undefined && B.TEX_CSS.toString === undefined && B.MATERIALS.hasOwnProperty === undefined && Object.isFrozen(B.MATERIAL_IDS));
    const PATH_RE = /^[MLHVCQAZmlhvcqaz0-9 .,-]+$/;
    check('every tile: one path of M L H V C Q A Z, digits, points, commas, minus and spaces only; a whole-pixel size 10..100 each way; stroke widths numbers, the light under the dark; a fill only as rgba(...)',
        B.TEXTURES.every(n => { const t = B.TEX[n]; return PATH_RE.test(t.d) && Number.isInteger(t.w) && Number.isInteger(t.h) && t.w >= 10 && t.w <= 100 && t.h >= 10 && t.h <= 100 && typeof t.dark === 'number' && typeof t.light === 'number' && t.light < t.dark && (t.fill === undefined || /^rgba\([\d.,\s]+\)$/.test(t.fill)); }),
        j(B.TEXTURES.map(n => [n, B.TEX[n].w, B.TEX[n].h, PATH_RE.test(B.TEX[n].d)])));
    const PRE = 'url("data:image/svg+xml,';
    const svgOf = n => decodeURIComponent(B.TEX_CSS[n].image.slice(PRE.length, -2));
    check('TEX_CSS: a data: URL of the SVG tile (single quotes only, as hexBgCss builds the grid\'s), its elements only svg, g, path (and rect), no script, no url(, no double quote; its width and height the tile\'s; the dark group under the light one with the one path in each; the size "Wpx Hpx"',
        B.TEXTURES.every(n => {
            const t = B.TEX[n], img = B.TEX_CSS[n].image, s = svgOf(n), tags = (s.match(/<(\w+)/g) || []).map(x => x.slice(1));
            const di = s.indexOf("stroke='rgba(0,0,0,0.38)' stroke-width='" + t.dark + "' fill='none' stroke-linecap='round'><path d='" + t.d + "'/>"), li = s.indexOf("stroke='rgba(255,255,255,0.18)' stroke-width='" + t.light + "' fill='none' stroke-linecap='round'><path d='" + t.d + "'/>");
            return img.slice(0, PRE.length) === PRE && img.slice(-2) === '")' && tags.length >= 5 && tags.every(x => x === 'svg' || x === 'g' || x === 'path' || x === 'rect') && !/<script/i.test(s) && s.indexOf('url(') < 0 && s.indexOf('"') < 0
                && s.indexOf("<svg xmlns='http://www.w3.org/2000/svg' width='" + t.w + "' height='" + t.h + "' viewBox='0 0 " + t.w + ' ' + t.h + "'>") === 0 && di > 0 && li > di && s.endsWith('</g></svg>')
                && (t.fill ? s.indexOf("<path d='" + t.d + "' fill='" + t.fill + "' stroke='none'/>") > 0 && s.indexOf("<path d='" + t.d + "' fill='" + t.fill) < di : (s.match(/<path/g) || []).length === 2) && B.TEX_CSS[n].size === t.w + 'px ' + t.h + 'px';
        }), j(B.TEXTURES.map(n => svgOf(n).slice(0, 120))));
    // the seam rule, read off the constants: a stroke that reaches an edge leaves it where its twin enters the opposite edge; one that straddles an
    // edge has a twin shifted by the tile; every other point keeps half the dark stroke inside the tile (absolute commands only, as the tiles are written)
    const subpaths = d => d.trim().split(/(?=M)/).map(sp => {
        const tok = sp.trim().split(/[\s,]+/), pts = []; let i = 0, cmd = '', cx = 0, cy = 0, qc = [];
        while (i < tok.length) {
            if (/^[A-Za-z]$/.test(tok[i])) { cmd = tok[i++]; if (cmd === 'Z') continue; }
            const num = () => Number(tok[i++]);
            if (cmd === 'M' || cmd === 'L') { cx = num(); cy = num(); pts.push([cx, cy]); }
            else if (cmd === 'H') { cx = num(); pts.push([cx, cy]); }
            else if (cmd === 'V') { cy = num(); pts.push([cx, cy]); }
            else if (cmd === 'Q') { qc.push([num(), num()]); cx = num(); cy = num(); pts.push([cx, cy]); }
            else if (cmd === 'A') { const rx = num(), ry = num(); i += 3; cx = num(); cy = num(); pts.push([cx, cy]); qc.push([cx, cy - ry], [cx, cy + ry]); void rx; }
            else throw new Error('buildcheck: path command ' + cmd);
        }
        return { pts, bounds: pts.concat(qc), text: sp.trim() };
    });
    // The seam itself, measured (the review of fold B1a: comparing end points could not see a round cap that covers less of an edge than a slanted
    // stroke's body does). A tile's strokes are flattened to short segments, curves and arcs sampled. Every point of a band 2 px deep along the
    // tile's four edges is asked two things: is it within half the stroke of the tile's OWN segments (what the tile draws there, cut at its
    // edge), and is it within half the stroke of the segments of the tile and its eight neighbours (what the tiling should show there). A stroke
    // that ends on an edge with no twin, a twin a little off, or a cap that nicks the seam, each leaves points where the two answers differ
    const flat = d => { const out = [], tok = d.trim().split(/[\s,]+/); let cur = null, cx = 0, cy = 0, x0 = 0, y0 = 0, cmd = '', i = 0;
        const num = () => Number(tok[i++]), to = (x, y) => { cur.push([x, y]); cx = x; cy = y; };
        while (i < tok.length) {
            if (/^[A-Za-z]$/.test(tok[i])) { cmd = tok[i++]; if (cmd === 'Z') { to(x0, y0); continue; } }
            if (cmd === 'M') { cur = []; out.push(cur); x0 = num(); y0 = num(); to(x0, y0); }
            else if (cmd === 'L') { const x = num(), y = num(); to(x, y); }
            else if (cmd === 'H') to(num(), cy);
            else if (cmd === 'V') to(cx, num());
            else if (cmd === 'Q') { const ax = cx, ay = cy, qx = num(), qy = num(), x = num(), y = num(); for (let k = 1; k <= 24; k++) { const t = k / 24, u = 1 - t; to(u * u * ax + 2 * u * t * qx + t * t * x, u * u * ay + 2 * u * t * qy + t * t * y); } }
            else if (cmd === 'A') {   // an arc by its end points, as the SVG rules turn them into a centre (the tiles' arcs are never turned)
                const x1 = cx, y1 = cy; let rx = num(), ry = num(); const phi = num(), fa = num(), fs = num(), x2 = num(), y2 = num(); if (phi !== 0) throw new Error('buildcheck: a turned arc');
                const xp = (x1 - x2) / 2, yp = (y1 - y2) / 2, lam = xp * xp / (rx * rx) + yp * yp / (ry * ry); if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
                const den = rx * rx * yp * yp + ry * ry * xp * xp, co = (fa === fs ? -1 : 1) * Math.sqrt(Math.max(0, (rx * rx * ry * ry - den) / den)), ccx = co * rx * yp / ry, ccy = -co * ry * xp / rx, mx = ccx + (x1 + x2) / 2, my = ccy + (y1 + y2) / 2;
                const a1 = Math.atan2((yp - ccy) / ry, (xp - ccx) / rx); let da = Math.atan2((-yp - ccy) / ry, (-xp - ccx) / rx) - a1; if (!fs && da > 0) da -= 2 * Math.PI; if (fs && da < 0) da += 2 * Math.PI;
                for (let k = 1; k <= 32; k++) to(mx + rx * Math.cos(a1 + da * k / 32), my + ry * Math.sin(a1 + da * k / 32));
            } else throw new Error('buildcheck: path command ' + cmd);
        }
        return out; };
    const segsOf = (d, dx, dy) => [].concat(...flat(d).map(pl => pl.slice(1).map((p, k) => [pl[k][0] + dx, pl[k][1] + dy, p[0] + dx, p[1] + dy])));
    const nearSeg = (segs, x, y, r) => { for (let s = 0; s < segs.length; s++) { const a = segs[s], vx = a[2] - a[0], vy = a[3] - a[1], l2 = vx * vx + vy * vy, t = l2 ? Math.max(0, Math.min(1, ((x - a[0]) * vx + (y - a[1]) * vy) / l2)) : 0, ex = a[0] + t * vx - x, ey = a[1] + t * vy - y; if (ex * ex + ey * ey <= r * r) return true; } return false; };
    const seamGaps = t => { let gaps = 0; const own = segsOf(t.d, 0, 0), reach = t.dark / 2 + 0.1;
        const all = [].concat(...[-1, 0, 1].map(a => [].concat(...[-1, 0, 1].map(b => segsOf(t.d, a * t.w, b * t.h))))).filter(s => Math.max(s[0], s[2]) >= -reach && Math.min(s[0], s[2]) <= t.w + reach && Math.max(s[1], s[3]) >= -reach && Math.min(s[1], s[3]) <= t.h + reach);
        [t.dark / 2, t.light / 2].forEach(r => { for (let x = 0.05; x < t.w; x += 0.1) for (let y = 0.05; y < t.h; y += 0.1) { if (x > 2 && x < t.w - 2 && y > 2 && y < t.h - 2) continue; if (nearSeg(all, x, y, r) && !nearSeg(own, x, y, r)) gaps++; } });
        return gaps; };
    const tileGaps = B.TEXTURES.map(n => seamGaps(B.TEX[n]));
    const oldHatch = { w: 50, h: 50, dark: 1.6, light: 0.7, d: 'M 0 6.25 L 43.75 50 M 0 18.75 L 31.25 50 M 0 31.25 L 18.75 50 M 0 43.75 L 6.25 50 M 6.25 0 L 50 43.75 M 18.75 0 L 50 31.25 M 31.25 0 L 50 18.75 M 43.75 0 L 50 6.25' };
    const oldRipple = { w: 50, h: 48, dark: 1.6, light: 0.8, d: 'M 0 8 Q 6.25 2 12.5 8 Q 18.75 14 25 8 Q 31.25 2 37.5 8 Q 43.75 14 50 8 M 0 24 Q 6.25 30 12.5 24 Q 18.75 18 25 24 Q 31.25 30 37.5 24 Q 43.75 18 50 24 M 0 40 Q 6.25 34 12.5 40 Q 18.75 46 25 40 Q 31.25 34 37.5 40 Q 43.75 46 50 40' };
    const badGaps = [oldHatch, oldRipple, { w: 50, h: 50, dark: 1.6, light: 0.7, d: 'M 0 12.5 H 30' }, { w: 50, h: 50, dark: 1.6, light: 0.7, d: 'M 0 12.5 H 50 M 20 0 V 20 M 20.6 30 V 50' }, { w: 50, h: 50, dark: 1.6, light: 0.7, d: 'M 10 0.5 H 40' }].map(seamGaps);
    check('every tile tiles seamlessly, measured: no point of the 2 px band along a tile\'s edges is drawn by a neighbour\'s stroke and not by the tile\'s own, at the dark width and at the light; the same measure finds the nicks the hatching and the ripples had while their strokes ended on the edge, a stroke with no twin, a twin a little off and a stroke too near an edge',
        j(tileGaps) === j(Array(8).fill(0)) && badGaps.every(g => g > 0), j([tileGaps, badGaps]));
    check('the ripples run half a wave past the tile at both ends and the hatching 4 px past it, so the tile\'s own edge cuts each stroke: a row passes both edges at one height; the hatching\'s eight lines all run at 45 degrees and end outside the tile',
        (() => { const sp = subpaths(B.TEX.ripples.d), w = B.TEX.ripples.w; return sp.length === 3 && sp.every(s => s.pts.length === 7 && s.pts[0][0] === -12.5 && s.pts[1][0] === 0 && s.pts[5][0] === w && s.pts[6][0] === w + 12.5 && s.pts.every(p => p[1] === s.pts[0][1])); })()
        && subpaths(B.TEX.hatching.d).length === 8 && subpaths(B.TEX.hatching.d).every(s => s.pts.length === 2 && Math.abs((s.pts[1][1] - s.pts[0][1]) - (s.pts[1][0] - s.pts[0][0])) < 1e-9 && s.pts.every(p => p[0] === -4 || p[1] === -4 || p[0] === 54 || p[1] === 54)));
    check('cleanTexture and texStyle: the eight names themselves, and nothing for another case, a space, a path, an address, a number, an object, a boolean or a prototype\'s name',
        B.TEXTURES.every(n => B.cleanTexture(n) === n && B.texStyle(n, 0, 0) !== null) && HOSTILE.every(v => B.cleanTexture(v) === null && B.texStyle(v, 0, 0) === null) && B.cleanTexture(['flagstones']) === null, j(HOSTILE.map(v => B.cleanTexture(v))));
    check('texStyle: the tile\'s image and size with the position for the piece\'s place', j(B.texStyle('bricks', 120, 70)) === j({ image: B.TEX_CSS.bricks.image, size: '50px 50px', position: '-20px -20px' }) && j(B.texStyle('ripples', 0, 0)) === j({ image: B.TEX_CSS.ripples.image, size: '50px 48px', position: '0px 0px' }));
    check('texPos: the tile\'s origin put on the board\'s — (0,0) and (100,100) read 0px 0px on a 50 px tile, (-30,70) -20px -20px (never a positive offset), a fraction keeps its fraction, a number that is none reads 0, an unknown name 0px 0px',
        B.texPos(0, 0, 'bricks') === '0px 0px' && B.texPos(100, 100, 'bricks') === '0px 0px' && B.texPos(-30, 70, 'bricks') === '-20px -20px' && B.texPos(NaN, 'x', 'bricks') === '0px 0px' && B.texPos(12.5, 3.25, 'grass') === '-12.5px -3.25px' && B.texPos(50, 96, 'ripples') === '0px 0px' && B.texPos(10, 50, 'ripples') === '-10px -2px'
        && B.texPos(10, 10, 'nope') === '0px 0px' && B.texPos(10, 10) === '0px 0px' && B.texPos(Infinity, -Infinity, 'grass') === '0px 0px');
    const cont = (() => { for (let i = 0; i < 300; i++) { const n = B.TEXTURES[i % 8], t = B.TEX[n], x1 = ri(-40, 40) * 50, x2 = x1 + ri(1, 40) * 50, y1 = ri(-40, 40) * 50, y2 = y1 + ri(1, 40) * 50;
        const g = (v, name, k) => { const m = /^(-?[\d.]+)px (-?[\d.]+)px$/.exec(B.texPos(k === 0 ? v : 0, k === 1 ? v : 0, name)); return Number(m[k + 1]); };
        const ox1 = ((x1 + g(x1, n, 0)) % t.w + t.w) % t.w, ox2 = ((x2 + g(x2, n, 0)) % t.w + t.w) % t.w, oy1 = ((y1 + g(y1, n, 1)) % t.h + t.h) % t.h, oy2 = ((y2 + g(y2, n, 1)) % t.h + t.h) % t.h;
        if (ox1 !== ox2 || oy1 !== oy2) return 'texture ' + n + ' at ' + x1 + '/' + x2 + ' ' + y1 + '/' + y2 + ': ' + j([ox1, ox2, oy1, oy2]); } return ''; })();
    check('continuity: two pieces on the lattice (300 seeded pairs on every texture) put their tile edges at the same global pixels — the implied origin agrees mod the tile, so one pattern runs across them', cont === '', cont);

    /* ---- texPattern on a recording document ---- */
    const recDoc = () => {
        const calls = [], mk = (ns, tag) => { const el = { ns, tag, attrs: {}, children: [] }; el.setAttribute = (k, v) => { calls.push('setAttribute'); el.attrs[k] = v; }; el.appendChild = c => { calls.push('appendChild'); el.children.push(c); return c; };
            Object.defineProperty(el, 'innerHTML', { set() { calls.push('innerHTML'); }, get() { return ''; } }); return el; };
        return { calls, doc: { createElementNS(ns, tag) { calls.push('createElementNS'); return mk(ns, tag); } } };
    };
    const NS = 'http://www.w3.org/2000/svg';
    const pat = (name, x, y, color, serial) => { const r = recDoc(); return { p: B.texPattern(r.doc, name, x, y, color, serial), calls: r.calls }; };
    const p1 = pat('bricks', 120, 70, '#ff0000', 7);
    check('texPattern: an SVG <pattern> built with createElementNS alone (never innerHTML): the id from the serial, userSpaceOnUse, the tile\'s width and height, x and y the negative mod of the piece\'s place; children a rect of the base colour, then the dark and the light stroke groups each holding the one path',
        p1.p && p1.p.ns === NS && p1.p.tag === 'pattern' && j(p1.p.attrs) === j({ id: 'wptex7', patternUnits: 'userSpaceOnUse', width: '50', height: '50', x: '-20', y: '-20' }) && p1.p.children.length === 3
        && p1.p.children[0].tag === 'rect' && p1.p.children[0].ns === NS && j(p1.p.children[0].attrs) === j({ width: '50', height: '50', fill: '#ff0000' })
        && p1.p.children[1].tag === 'g' && j(p1.p.children[1].attrs) === j({ stroke: 'rgba(0,0,0,0.38)', 'stroke-width': '1.6', fill: 'none', 'stroke-linecap': 'round' }) && p1.p.children[1].children.length === 1 && p1.p.children[1].children[0].tag === 'path' && p1.p.children[1].children[0].attrs.d === B.TEX.bricks.d
        && p1.p.children[2].tag === 'g' && j(p1.p.children[2].attrs) === j({ stroke: 'rgba(255,255,255,0.18)', 'stroke-width': '0.7', fill: 'none', 'stroke-linecap': 'round' }) && p1.p.children[2].children[0].attrs.d === B.TEX.bricks.d
        && p1.calls.every(c => c === 'createElementNS' || c === 'setAttribute' || c === 'appendChild') && p1.calls.filter(c => c === 'createElementNS').length === 6 && Object.values(p1.p.attrs).concat(Object.values(p1.p.children[0].attrs)).every(v => typeof v === 'string'), j([p1.p && p1.p.attrs, p1.calls]));
    const p2 = pat('stone', 0, 0, 'red', 0).p, p3 = pat('ripples', -10, 50, 'url(x)', -1).p;
    check('a stone pattern carries its faint fill path between the rect and the strokes; (0,0) reads x 0 y 0 (never -0); a 48 px tile mods by 48', p2 && p2.children.length === 4 && p2.children[1].tag === 'path' && j(p2.children[1].attrs) === j({ d: B.TEX.stone.d, fill: 'rgba(0,0,0,0.12)', stroke: 'none' }) && p2.attrs.x === '0' && p2.attrs.y === '0'
        && p3 && p3.attrs.x === '-40' && p3.attrs.y === '-2' && p3.attrs.height === '48', j([p2 && p2.attrs, p3 && p3.attrs]));
    check('the rect\'s fill is the colour only as safecore\'s one rule keeps it: a hex literal and a keyword ("red" passes COLOR_RE) kept, url(x), a second property, a quote, a number or nothing read transparent',
        p2.children[0].attrs.fill === 'red' && p3.children[0].attrs.fill === 'transparent' && pat('grass', 0, 0, '#fff; background: url(x)', 1).p.children[0].attrs.fill === 'transparent' && pat('grass', 0, 0, 'rgba(1,2,3,0.5)', 1).p.children[0].attrs.fill === 'rgba(1,2,3,0.5)'
        && pat('grass', 0, 0, "'x'", 1).p.children[0].attrs.fill === 'transparent' && pat('grass', 0, 0, 5, 1).p.children[0].attrs.fill === 'transparent' && pat('grass', 0, 0, undefined, 1).p.children[0].attrs.fill === 'transparent' && pat('grass', 0, 0, 'var(--wp-ink)', 1).p.children[0].attrs.fill === 'var(--wp-ink)');
    check('the serial: a whole number from 0 as given (7 -> wptex7, 0 -> wptex0); -1, a string, a fraction, NaN or nothing -> wptex0',
        p2.attrs.id === 'wptex0' && p3.attrs.id === 'wptex0' && pat('grass', 0, 0, 'red', 'x').p.attrs.id === 'wptex0' && pat('grass', 0, 0, 'red', 1.5).p.attrs.id === 'wptex0' && pat('grass', 0, 0, 'red', NaN).p.attrs.id === 'wptex0' && pat('grass', 0, 0, 'red').p.attrs.id === 'wptex0' && pat('grass', 0, 0, 'red', 123456).p.attrs.id === 'wptex123456');
    check('texPattern is null for an unknown or hostile name, a document without createElementNS or none at all — and makes nothing first',
        HOSTILE.every(v => { const r = recDoc(); return B.texPattern(r.doc, v, 0, 0, 'red', 1) === null && r.calls.length === 0; }) && B.texPattern({}, 'bricks', 0, 0, 'red', 1) === null && B.texPattern(null, 'bricks', 0, 0, 'red', 1) === null && B.texPattern({ createElementNS: 'x' }, 'bricks', 0, 0, 'red', 1) === null);

    /* ---- materials ---- */
    const want = {
        floor: { color: '#5a5663', layer: 'back', name: 'Floor', texture: 'flagstones' },
        wall: { color: '#3f3b47', layer: 'back-mid', name: 'Wall', texture: 'bricks', blocksSight: true, sightType: 'wall' },
        door: { color: '#6b4a2a', layer: 'back-mid', name: 'Door', texture: 'planks', blocksSight: true, sightType: 'door' },
        water: { color: '#2e5d86', layer: 'back', name: 'Water', texture: 'ripples', terrain: 2 },
        rubble: { color: '#55505c', layer: 'back-mid', name: 'Rubble', texture: 'stone', cover: 'yes' },
        wood: { color: '#7a5634', layer: 'back', name: 'Wood floor', texture: 'planks' },
        grass: { color: '#4b6b36', layer: 'back', name: 'Grass', texture: 'grass' }
    };
    const sortKeys = o => { const r = {}; Object.keys(o).sort().forEach(k => { r[k] = o[k]; }); return r; };
    check('MATERIALS: the seven of the palette in order, each as the plan lists it (name, texture, colour, layer; a wall and a door block sight by their kind, water is terrain 2, rubble gives cover)',
        j(B.MATERIAL_IDS) === j(['floor', 'wall', 'door', 'water', 'rubble', 'wood', 'grass']) && j(Object.keys(B.MATERIALS)) === j(B.MATERIAL_IDS)
        && j(sortKeys(B.MATERIALS.floor)) === j(sortKeys({ name: 'Floor', texture: 'flagstones', color: '#5a5663', layer: 'back' })) && j(sortKeys(B.MATERIALS.wall)) === j(sortKeys({ name: 'Wall', texture: 'bricks', color: '#3f3b47', layer: 'back-mid', blocksSight: true, sightType: 'wall' }))
        && j(sortKeys(B.MATERIALS.door)) === j(sortKeys({ name: 'Door', texture: 'planks', color: '#6b4a2a', layer: 'back-mid', blocksSight: true, sightType: 'door' })) && j(sortKeys(B.MATERIALS.water)) === j(sortKeys({ name: 'Water', texture: 'ripples', color: '#2e5d86', layer: 'back', terrain: 2 }))
        && j(sortKeys(B.MATERIALS.rubble)) === j(sortKeys({ name: 'Rubble', texture: 'stone', color: '#55505c', layer: 'back-mid', cover: 'yes' })) && j(sortKeys(B.MATERIALS.wood)) === j(sortKeys({ name: 'Wood floor', texture: 'planks', color: '#7a5634', layer: 'back' })) && j(sortKeys(B.MATERIALS.grass)) === j(sortKeys({ name: 'Grass', texture: 'grass', color: '#4b6b36', layer: 'back' }))
        && B.MATERIAL_IDS.every(m => B.cleanMaterial(m) === m) && HOSTILE.every(v => B.cleanMaterial(v) === null) && B.cleanMaterial('Wall') === null, j(B.MATERIALS));
    check('pieceProps with no overrides: each material\'s bag exactly (colour, layer, name, texture and the material\'s flags; no opacity, no fill); a fresh object each call; an unknown or hostile material null',
        B.MATERIAL_IDS.every(m => j(sortKeys(B.pieceProps(m))) === j(sortKeys(want[m])) && j(sortKeys(B.pieceProps(m, undefined))) === j(sortKeys(want[m])) && j(sortKeys(B.pieceProps(m, null))) === j(sortKeys(want[m])) && j(sortKeys(B.pieceProps(m, 'x'))) === j(sortKeys(want[m])))
        && B.pieceProps('floor') !== B.pieceProps('floor') && HOSTILE.every(v => B.pieceProps(v) === null) && B.pieceProps('Floor') === null && B.pieceProps('lava') === null, j(B.MATERIAL_IDS.map(m => B.pieceProps(m))));
    check('texture override: a known name is taken; "" and null leave the key out ("Plain colour"); undefined and an UNKNOWN string (a name this build does not know, a path, a prototype\'s name) fall back to the material\'s own, never to none',
        B.pieceProps('floor', { texture: 'grass' }).texture === 'grass' && !('texture' in B.pieceProps('floor', { texture: '' })) && !('texture' in B.pieceProps('wall', { texture: null })) && B.pieceProps('floor', { texture: undefined }).texture === 'flagstones'
        && ['Flagstones', 'marble', 'url(x)', '/saves/images/x.png', 'constructor', '__proto__', 1, {}, [], true, 'flagstones '].every(v => B.pieceProps('wall', { texture: v }).texture === 'bricks'));
    check('colour override: only a #rgb, #rrggbb or #rrggbbaa literal; anything else (a keyword, rgb(), a second property, a web colour of 4 or 5 digits, a number) keeps the material\'s',
        B.pieceProps('floor', { color: '#abc' }).color === '#abc' && B.pieceProps('floor', { color: '#A1B2C3' }).color === '#A1B2C3' && B.pieceProps('floor', { color: '#a1b2c380' }).color === '#a1b2c380'
        && ['red', 'rgb(1,2,3)', '#fff; background: url(x)', '#abcd', '#abcde', '#abcdefg', 'abc', 5, null, '', 'url(#x)', '#ggg'].every(v => B.pieceProps('floor', { color: v }).color === '#5a5663'));
    const wallOpen = B.pieceProps('wall', { blocksSight: false }), floorDoor = B.pieceProps('floor', { door: true }), wallDoor = B.pieceProps('wall', { door: true }), bothOff = B.pieceProps('door', { door: true, blocksSight: false });
    check('sight: blocksSight: false on a wall drops both blocksSight and sightType; door: true on any material sets blocksSight true and sightType door; blocksSight: false wins over door: true (a piece that blocks nothing is no door); other values change nothing',
        !('blocksSight' in wallOpen) && !('sightType' in wallOpen) && floorDoor.blocksSight === true && floorDoor.sightType === 'door' && wallDoor.sightType === 'door' && !('blocksSight' in bothOff) && !('sightType' in bothOff)
        && B.pieceProps('wall', { blocksSight: 'false' }).sightType === 'wall' && B.pieceProps('wall', { blocksSight: 0 }).blocksSight === true && B.pieceProps('floor', { door: 'true' }).blocksSight === undefined && B.pieceProps('floor', { door: 1 }).sightType === undefined && B.pieceProps('floor', { blocksSight: true }).blocksSight === undefined
        && !('blocksSight' in B.pieceProps('floor', { blocksSight: false })) && B.pieceProps('door', { blocksSight: true }).sightType === 'door', j([wallOpen, floorDoor, wallDoor, bothOff]));
    check('cover: true writes cover yes on any material, false drops it (rubble included: the GM\'s tick decides per piece), anything else leaves the material\'s own',
        B.pieceProps('floor', { cover: true }).cover === 'yes' && B.pieceProps('wall', { cover: true }).cover === 'yes' && !('cover' in B.pieceProps('rubble', { cover: false })) && !('cover' in B.pieceProps('floor', { cover: false })) && B.pieceProps('rubble', { cover: 'yes' }).cover === 'yes' && !('cover' in B.pieceProps('floor', { cover: 'yes' })) && B.pieceProps('rubble', { cover: 1 }).cover === 'yes' && !('cover' in B.pieceProps('floor', { cover: 'no' })));
    check('terrain: a number goes through fogcore cleanTerrain (3 -> 3, 11 -> 10, 2.4 -> 2); 1, 0, false, null, a string or NaN drop it (water included); undefined keeps the material\'s',
        B.pieceProps('floor', { terrain: 3 }).terrain === 3 && B.pieceProps('floor', { terrain: 11 }).terrain === 10 && B.pieceProps('floor', { terrain: 2.4 }).terrain === 2 && B.pieceProps('water', { terrain: 4 }).terrain === 4
        && [1, 0, false, null, 'x', '3', NaN, Infinity, true, {}, 1.4].every(v => !('terrain' in B.pieceProps('water', { terrain: v }))) && B.pieceProps('water', { terrain: undefined }).terrain === 2 && !('terrain' in B.pieceProps('floor', {})));
    const hostileOv = { fill: true, rot: 90, isChar: true, waiting: true, hidden: true, gmNoteFor: 'x', doorOpen: true, doorLock: true, light: { bright: 9 }, id: 'x', type: 'image', src: 'http://e', x: 1, y: 2, w: 3, h: 4, pts: [[0, 0]], height: 3, opacity: 0.1, name: 'Evil', layer: 'front', __proto__: { z: 1, texture: 'grass' }, constructor: 1 };
    const hb = B.pieceProps('wall', hostileOv);
    check('hostile overrides: fill, rot, isChar, waiting, hidden, gmNoteFor, doorOpen, doorLock, light, id, type, src, x/y/w/h, pts, height, opacity, a name, a layer, a prototype\'s keys and constructor never ride along — the bag holds exactly the material\'s keys, built by whitelist, with a plain prototype',
        j(Object.keys(hb).sort()) === j(['blocksSight', 'color', 'layer', 'name', 'sightType', 'texture']) && hb.name === 'Wall' && hb.layer === 'back-mid' && hb.texture === 'bricks' && Object.getPrototypeOf(hb) === Object.prototype && hb.z === undefined && !Object.prototype.hasOwnProperty.call(hb, 'constructor')
        && j(Object.keys(B.pieceProps('floor', { terrain: 3, cover: true, door: true, texture: 'grass', color: '#123' })).sort()) === j(['blocksSight', 'color', 'cover', 'layer', 'name', 'sightType', 'terrain', 'texture']), j(hb));
    check('the comment states the texture fall-back and the never-written keys', /an unknown string \(a name this\n\/\/\s+build does not know falls back to the material's default, never to none\)/.test(src) && /Never written here whatever the overrides\n\/\/ say: fill, rot, isChar, waiting, hidden, gmNoteFor, doorOpen, doorLock, light, id, type, x, y, w, h, pts, src, height, opacity/.test(src));

    /* ---- the real fogcore and fog.js read a piece's bag ---- */
    const piece = (m, ov, extra) => Object.assign({ type: 'rect', x: 0, y: 0, w: 50, h: 50 }, B.pieceProps(m, ov), extra || {});
    check('fogcore coverRole reads a wall and a door as hard cover, rubble as soft, floor / water / wood / grass as none; an open door none; a floor the GM ticks for cover soft; a wall ticked off none; a door made of floor hard',
        F.coverRole(piece('wall')) === 'hard' && F.coverRole(piece('door')) === 'hard' && F.coverRole(piece('rubble')) === 'soft' && ['floor', 'water', 'wood', 'grass'].every(m => F.coverRole(piece(m)) === null) && F.coverRole(piece('door', null, { doorOpen: true })) === null
        && F.coverRole(piece('floor', { cover: true })) === 'soft' && F.coverRole(piece('wall', { blocksSight: false })) === null && F.coverRole(piece('floor', { door: true })) === 'hard' && F.coverRole(piece('rubble', { cover: false })) === null);
    check('fogcore cleanTerrain keeps water\'s cost as 2 and a GM\'s override as written; a piece\'s height, fill, rot are not set (itemCells reads its box unturned)',
        F.cleanTerrain(B.pieceProps('water').terrain) === 2 && F.cleanTerrain(B.pieceProps('grass', { terrain: 5 }).terrain) === 5 && F.cleanTerrain(B.pieceProps('floor').terrain) === null && F.itemCells(piece('wall'), F.squareGrid(50)).length === 1);
    const fogSrc = read('system/app/scripts/fog.js');
    const eligibleBlocker = new Function(cut(fogSrc, 'function eligibleBlocker(') + NL + 'return eligibleBlocker;')();
    check('fog.js eligibleBlocker (sliced and run for real) takes a wall and a door piece as sight-blockers and none of the other five; an open door, a hidden wall, a wall with blocksSight off, a floor made a door: as fog reads them',
        eligibleBlocker(piece('wall')) === true && eligibleBlocker(piece('door')) === true && ['floor', 'water', 'rubble', 'wood', 'grass'].every(m => eligibleBlocker(piece(m)) === false) && eligibleBlocker(piece('door', null, { doorOpen: true })) === false
        && eligibleBlocker(piece('wall', null, { hidden: true })) === false && eligibleBlocker(piece('wall', { blocksSight: false })) === false && eligibleBlocker(piece('floor', { door: true })) === true && eligibleBlocker(Object.assign({ type: 'hexagon', x: 0, y: 0, w: 60, h: 52 }, B.pieceProps('wall'))) === true);

    /* ---- the pen's Wall-line preset ---- */
    check('penPreset: a wall line and a door line exactly (stroke 6, a square tip, the material\'s colour or a hex override, back-mid, blocksSight, its sightType), door: true on a wall a door, never a texture; floor and the rest null',
        j(B.penPreset('wall')) === j({ strokeWidth: 6, tip: 'square', color: '#3f3b47', layer: 'back-mid', name: 'Wall', blocksSight: true, sightType: 'wall' }) && j(B.penPreset('door')) === j({ strokeWidth: 6, tip: 'square', color: '#6b4a2a', layer: 'back-mid', name: 'Door', blocksSight: true, sightType: 'door' })
        && B.penPreset('wall', { door: true }).sightType === 'door' && B.penPreset('door', { door: false }).sightType === 'door' && B.penPreset('wall', { color: '#123456' }).color === '#123456' && B.penPreset('wall', { color: 'red' }).color === '#3f3b47' && B.penPreset('wall', { texture: 'bricks' }).texture === undefined
        && ['floor', 'water', 'rubble', 'wood', 'grass', 'Wall', '', null, undefined, 'constructor'].every(m => B.penPreset(m) === null) && eligibleBlocker(Object.assign({ type: 'path', x: 0, y: 0, w: 100, h: 1, pts: [[0, 0], [100, 0]] }, B.penPreset('wall'))) === true);

    /* ---- lattice: snapBox ---- */
    const sq = F.squareGrid(50), sq60 = F.squareGrid(60), hx = F.hexGrid(30, 52);
    check('snapBox click: the one cell under the press (floor), 50 or 60 px; a hex grid, no grid or a number that is none null',
        j(B.snapBox(sq, 120, 70, 0, 0, false)) === j({ x: 100, y: 50, w: 50, h: 50 }) && j(B.snapBox(sq, -1, -1, 0, 0, false)) === j({ x: -50, y: -50, w: 50, h: 50 }) && j(B.snapBox(sq60, 125, 61, 0, 0, false)) === j({ x: 120, y: 60, w: 60, h: 60 })
        && B.snapBox(hx, 10, 10, 20, 20, true) === null && B.snapBox(null, 10, 10, 20, 20, true) === null && B.snapBox(sq, NaN, 10, 20, 20, false) === null && B.snapBox(sq, 10, 10, Infinity, 20, true) === null && B.snapBox({ type: 'square', size: 'x' }, 10, 10, 20, 20, true) === null);
    const dragBox = j({ x: 100, y: 50, w: 150, h: 100 });
    check('snapBox drag: every cell from the press cell to the release cell inclusive, the same box from all four directions; a 3 px drag inside one cell gives that cell; a press at a cell\'s centre dragged a hair into the next cell lays both (never a box rounded to the nearest lines that leaves the pressed cell out)',
        j(B.snapBox(sq, 110, 60, 240, 140, true)) === dragBox && j(B.snapBox(sq, 240, 140, 110, 60, true)) === dragBox && j(B.snapBox(sq, 240, 60, 110, 140, true)) === dragBox && j(B.snapBox(sq, 110, 140, 240, 60, true)) === dragBox
        && j(B.snapBox(sq, 120, 70, 123, 72, true)) === j({ x: 100, y: 50, w: 50, h: 50 }) && j(B.snapBox(sq, 120, 70, 230, 72, true)) === j({ x: 100, y: 50, w: 150, h: 50 }) && j(B.snapBox(sq, 170, 70, 180, 240, true)) === j({ x: 150, y: 50, w: 50, h: 200 })
        && j(B.snapBox(sq, 25, 25, 51, 26, true)) === j({ x: 0, y: 0, w: 100, h: 50 }) && j(B.snapBox(sq, 25, 25, 49, 49, true)) === j({ x: 0, y: 0, w: 50, h: 50 }), j(B.snapBox(sq, 25, 25, 51, 26, true)));
    const boxProp = grid => { for (let i = 0; i < 200; i++) { const sx = ri(-500, 1500), sy = ri(-500, 1500), ex = ri(-500, 1500), ey = ri(-500, 1500), b = B.snapBox(grid, sx, sy, ex, ey, true), s = grid.size;
        if (!b || ![b.x, b.y, b.w, b.h].every(Number.isInteger) || b.w < s || b.h < s || b.x % s || b.y % s || b.w % s || b.h % s) return 'shape ' + j([sx, sy, ex, ey, b]);
        const cells = F.itemCells({ type: 'rect', x: b.x, y: b.y, w: b.w, h: b.h }, grid), n = (b.w / s) * (b.h / s);
        if (cells.length !== n || !cells.every(c => c.c >= b.x / s && c.c < (b.x + b.w) / s && c.r >= b.y / s && c.r < (b.y + b.h) / s)) return 'cells ' + j([sx, sy, ex, ey, b, cells.length, n]);
        const pc = F.cellOf(sx, sy, grid), ec = F.cellOf(ex, ey, grid), rx = [pc.c, ec.c].sort((a, c) => a - c), ry = [pc.r, ec.r].sort((a, c) => a - c);   // the press cell through the release cell
        if (b.x !== rx[0] * s || b.w !== (rx[1] - rx[0] + 1) * s) return 'x axis ' + j([sx, sy, ex, ey, b, rx]);
        if (b.y !== ry[0] * s || b.h !== (ry[1] - ry[0] + 1) * s) return 'y axis ' + j([sx, sy, ex, ey, b, ry]); } return ''; };
    const bp50 = boxProp(sq), bp60 = boxProp(sq60);
    check('snapBox property (200 seeded drags on 50 px and on 60 px squares): integers on the lattice, at least a cell each way, each axis the press cell through the release cell, and fogcore itemCells of the rect is exactly the w/size x h/size lattice cells it covers', bp50 === '' && bp60 === '', bp50 || bp60);

    /* ---- hexCellBox against fogcore and the app's snapToHex ---- */
    const dmSrc = read('system/app/scripts/datamap.js');
    const snapToHex = new Function(cut(dmSrc, 'function snapToHex(', '  ') + NL + 'return snapToHex;')();
    check('the app\'s snapToHex (sliced from datamap.js) runs: a cell centre snaps to itself, a point near it to it', typeof snapToHex === 'function' && j(snapToHex(15, 0, 30, 'center')) === j({ x: 15, y: 0 }) && j(snapToHex(62, 25, 30, 'center')) === j({ x: 60, y: 26 }));
    const hexProp = (() => { for (let i = 0; i < 50; i++) { const cell = { q: ri(-20, 20), r: ri(-20, 20) }, b = B.hexCellBox(hx, cell), c = F.cellCenter(cell, hx);
        if (!b || b.w !== 60 || b.h !== 52 || b.x !== c.x - 30 || b.y !== c.y - 26) return 'box ' + j([cell, b, c]);
        const cells = F.itemCells(Object.assign({ type: 'hexagon' }, b), hx); if (cells.length !== 1 || cells[0].q !== cell.q || cells[0].r !== cell.r) return 'cells ' + j([cell, b, cells]);
        const sh = snapToHex(b.x + b.w / 2, b.y + b.h / 2, 30, 'center'), jit = snapToHex(b.x + b.w / 2 + (rnd() - 0.5) * 20, b.y + b.h / 2 + (rnd() - 0.5) * 20, 30, 'center');
        if (Math.abs(sh.x - (b.x + b.w / 2)) > 1e-9 || Math.abs(sh.y - (b.y + b.h / 2)) > 1e-9 || Math.abs(jit.x - sh.x) > 1e-9 || Math.abs(jit.y - sh.y) > 1e-9) return 'snapToHex ' + j([cell, b, sh, jit]); } return ''; })();
    check('hexCellBox (50 seeded cells): a 60 x 52 hexagon centred on fogcore cellCenter, fogcore itemCells of it exactly that cell, and its centre what the app\'s snapToHex gives for it (and for a point jittered within the cell)', hexProp === '', hexProp);
    const gl = F.gridFor('', { grid: 'hex', len: 90 }), glb = B.hexCellBox(gl, { q: 2, r: 1 });
    check('hexCellBox on a gridless map\'s assigned hex cell (fogcore gridFor): 2s wide, h tall, to the hundredth, itemCells exactly the cell; null for a square grid, no grid or a cell that is none',
        glb && glb.w === 90 && glb.h === 78 && j(F.itemCells(Object.assign({ type: 'hexagon' }, glb), gl)) === j([{ q: 2, r: 1 }]) && [glb.x, glb.y].every(v => Math.round(v * 100) === v * 100)
        && B.hexCellBox(sq, { q: 0, r: 0 }) === null && B.hexCellBox(null, { q: 0, r: 0 }) === null && B.hexCellBox(hx, { q: 'x', r: 0 }) === null && B.hexCellBox(hx, null) === null, j([gl, glb]));

    /* ---- hexCellsInBox ---- */
    const under = F.cellsUnderRect(100, 60, 200, 120, hx), keys = new Set(), dedup = under.filter(c => { const k = F.cellKey(c, hx); if (keys.has(k)) return false; keys.add(k); return true; });
    check('hexCellsInBox: a click (under a pixel either way) the one cell under it; a 200 x 120 box exactly the cells fogcore cellsUnderRect gives, in its order, each once, more false; a negative extent read from its other corner',
        j(B.hexCellsInBox(hx, 100, 60, 0, 0)) === j({ cells: [F.cellOf(100, 60, hx)], more: false }) && j(B.hexCellsInBox(hx, 100, 60, 0.5, 300)) === j({ cells: [F.cellOf(100, 60, hx)], more: false }) && j(B.hexCellsInBox(hx, 100, 60, 200, 120)) === j({ cells: dedup, more: false }) && dedup.length > 6
        && j(B.hexCellsInBox(hx, 300, 180, -200, -120)) === j({ cells: dedup, more: false }) && j(B.hexCellsInBox(sq, 0, 0, 100, 100)) === j({ cells: F.cellsUnderRect(0, 0, 100, 100, sq), more: false }) && B.hexCellsInBox(null, 0, 0, 10, 10) === null && B.hexCellsInBox(hx, NaN, 0, 10, 10) === null, j(B.hexCellsInBox(hx, 100, 60, 200, 120)));
    const boxEq = (() => { for (let i = 0; i < 240; i++) { const g = i % 2 ? hx : sq, x = ri(-3000, 3000), y = ri(-3000, 3000), w = ri(1, i % 5 ? 6000 : 60000), h = ri(1, i % 7 ? 3000 : 40000), cap = [5, 60, 400][i % 3], got = B.hexCellsInBox(g, x, y, w, h, cap);
        const seen = new Set(), uniq = F.cellsUnderRect(x, y, w, h, g).filter(c => { const k = F.cellKey(c, g); if (seen.has(k)) return false; seen.add(k); return true; });
        if (j(got) !== j({ cells: uniq.slice(0, cap), more: uniq.length > cap })) return j([i, g.type, x, y, w, h, cap, got.cells.length, got.more, uniq.length]); } return ''; })();
    const hugeHx = B.hexCellsInBox(hx, -2e7, -2e7, 4e7, 4e7), hugeSq = B.hexCellsInBox(sq, 0, 0, 5e7, 5e7, 7), wideHx = B.hexCellsInBox(hx, 0, 0, 4e7, 300), tallSq = B.hexCellsInBox(sq, 10, 10, 120, 4e7), thinHx = B.hexCellsInBox(hx, 0, 0, 100000, 20);
    check('hexCellsInBox never lists a huge box whole (the review of fold B1a): 240 seeded boxes on both grids, some far wider or taller than the cap needs, give exactly the first cells of the whole listing, in its order, and whether there were more; a box forty million pixels each way, or that wide or that tall alone, answers with the cap and more (listed whole it would never answer); a box too thin for a row to be sure of a cell is still listed',
        boxEq === '' && hugeHx.cells.length === 400 && hugeHx.more === true && hugeSq.cells.length === 7 && hugeSq.more === true && j(hugeSq.cells) === j([0, 1, 2, 3, 4, 5, 6].map(r => ({ c: 0, r }))) && wideHx.cells.length === 400 && wideHx.more === true && tallSq.cells.length === 400 && tallSq.more === true && tallSq.cells.every(c => c.c === 0)
        && thinHx.more === true && thinHx.cells.length === 400, boxEq || j([hugeHx.cells.length, hugeSq.cells, wideHx.cells.length, tallSq.cells.length, thinHx.cells.length]));
    const capd = B.hexCellsInBox(hx, 100, 60, 200, 120, 5), big = B.hexCellsInBox(hx, 0, 0, 3000, 3000);
    check('the cap: cap 5 gives the first 5 cells and more true; the default 400 on a box of thousands; a cap that is none reads 400',
        capd.cells.length === 5 && capd.more === true && j(capd.cells) === j(dedup.slice(0, 5)) && big.cells.length === 400 && big.more === true && B.hexCellsInBox(hx, 0, 0, 3000, 3000, 'x').cells.length === 400 && B.hexCellsInBox(hx, 0, 0, 3000, 3000, 0).cells.length === 400 && B.hexCellsInBox(hx, 0, 0, 3000, 3000, 2.7).cells.length === 2);

    /* ---- corridor ---- */
    check('corridor square: locked to the axis of the larger extent (a tie reads horizontal), from the press cell to the release cell inclusive, in the press cell\'s row or column; the same strip from either end of one row or column (a release in another row anchors to its own press cell); width 1 unless 2',
        j(B.corridor(sq, 120, 130, 410, 160, 1)) === j({ x: 100, y: 100, w: 350, h: 50 }) && j(B.corridor(sq, 410, 130, 120, 160, 1)) === j({ x: 100, y: 100, w: 350, h: 50 }) && j(B.corridor(sq, 410, 160, 120, 130, 1)) === j({ x: 100, y: 150, w: 350, h: 50 }) && j(B.corridor(sq, 130, 120, 160, 410)) === j({ x: 100, y: 100, w: 50, h: 350 })
        && j(B.corridor(sq, 130, 410, 160, 120, 'x')) === j({ x: 100, y: 100, w: 50, h: 350 }) && j(B.corridor(sq, 160, 410, 130, 120, 'x')) === j({ x: 150, y: 100, w: 50, h: 350 }) && j(B.corridor(sq, 10, 10, 110, 110, 3)) === j({ x: 0, y: 0, w: 150, h: 50 }) && j(B.corridor(sq, 120, 130, 120, 130, 1)) === j({ x: 100, y: 100, w: 50, h: 50 }) && j(B.corridor(sq, 120, 130, 125, 100, 1)) === j({ x: 100, y: 100, w: 50, h: 50 }),
        j([B.corridor(sq, 410, 130, 120, 160, 1), B.corridor(sq, 410, 160, 120, 130, 1), B.corridor(sq, 130, 410, 160, 120, 'x'), B.corridor(sq, 160, 410, 130, 120, 'x')]));
    check('corridor square width 2: the press row or column plus the next toward the pointer\'s perpendicular side — below when the release is lower, above when higher, below when level; right or left likewise, right when level',
        j(B.corridor(sq, 120, 130, 410, 160, 2)) === j({ x: 100, y: 100, w: 350, h: 100 }) && j(B.corridor(sq, 120, 130, 410, 100, 2)) === j({ x: 100, y: 50, w: 350, h: 100 }) && j(B.corridor(sq, 120, 130, 410, 130, 2)) === j({ x: 100, y: 100, w: 350, h: 100 })
        && j(B.corridor(sq, 130, 120, 160, 410, 2)) === j({ x: 100, y: 100, w: 100, h: 350 }) && j(B.corridor(sq, 130, 120, 100, 410, 2)) === j({ x: 50, y: 100, w: 100, h: 350 }) && j(B.corridor(sq, 130, 120, 130, 410, 2)) === j({ x: 100, y: 100, w: 100, h: 350 })
        && B.corridor(sq, NaN, 0, 10, 10, 1) === null && B.corridor(sq, 0, 0, 10, Infinity, 1) === null && B.corridor(null, 0, 0, 10, 10, 1) === null && B.corridor({ type: 'tri' }, 0, 0, 10, 10, 1) === null);
    const hexRun = (sx, sy, ex, ey, w) => B.corridor(hx, sx, sy, ex, ey, w);
    const keyH = c => F.cellKey(c, hx), perCol = cells => { const m = new Map(); cells.forEach(c => m.set(c.q, (m.get(c.q) || 0) + 1)); return [...m.values()]; };
    // the side a run leans to and a band grows on: down, or right when the run is level (a point: right); every sample is moved a hair that way
    const lean = (sx, sy, ex, ey) => { let nx = -(ey - sy), ny = ex - sx; if (ny < 0 || (ny === 0 && nx < 0)) { nx = -nx; ny = -ny; } if (!nx && !ny) nx = 1; const l = Math.hypot(nx, ny); return [nx / l, ny / l]; };
    const hexProp2 = (() => { for (let i = 0; i < 60; i++) { const sx = ri(-800, 800), sy = ri(-800, 800), ex = ri(-800, 800), ey = ri(-800, 800), one = hexRun(sx, sy, ex, ey, 1), two = hexRun(sx, sy, ex, ey, 2), [nx, ny] = lean(sx, sy, ex, ey), e = hx.s * 1e-6;
        if (!one || one.more || one.cells.length < 1 || j(one.cells[0]) !== j(F.cellOf(sx + nx * e, sy + ny * e, hx)) || j(one.cells[one.cells.length - 1]) !== j(F.cellOf(ex + nx * e, ey + ny * e, hx))) return 'ends ' + j([sx, sy, ex, ey, one]);
        for (let k = 1; k < one.cells.length; k++) if (F.hexDist(one.cells[k - 1], one.cells[k]) !== 1) return 'step ' + j([sx, sy, ex, ey, one.cells[k - 1], one.cells[k]]);
        const ks = new Set(one.cells.map(keyH)); if (ks.size !== one.cells.length) return 'twice ' + j(one);
        const k2 = new Set(two.cells.map(keyH)); if (two.more || k2.size !== two.cells.length || two.cells.length <= one.cells.length || two.cells.length > 2 * one.cells.length || !one.cells.every(c => k2.has(keyH(c)))) return 'width 2 ' + j([sx, sy, ex, ey, one.cells.length, two.cells.length]);
        if (j(two.cells[0]) !== j(one.cells[0]) || j(two.cells.filter(c => ks.has(keyH(c)))) !== j(one.cells)) return 'width 2 order ' + j([sx, sy, ex, ey]);   // the run's own cells in the run's order, each before its neighbour
        const added = two.cells.filter(c => !ks.has(keyH(c)));
        if (!added.every(c => { const p = F.cellCenter(c, hx); return one.cells.some(o => { const q = F.cellCenter(o, hx); return F.hexDist(o, c) === 1 && (p.x - q.x) * nx + (p.y - q.y) * ny > 0; }); })) return 'width 2 side ' + j([sx, sy, ex, ey]); } return ''; })();
    check('corridor hex (60 seeded segments): a straight run from the press cell to the release cell (each end read a hair toward the run\'s lower side), each consecutive pair at hexDist 1, each cell once; width 2 holds every cell of width 1 in the run\'s order and adds (at most as many again) only neighbours of the run on its lower side — its right side when it runs up or down', hexProp2 === '', hexProp2);
    const axisRun = hexRun(15, 0, 15, 520, 1), axisTwo = hexRun(15, 0, 15, 520, 2), flat2 = hexRun(15, 10, 465, 10, 2), flatOne = hexRun(15, 10, 465, 10, 1), flatKeys = new Set(flatOne.cells.map(keyH));
    check('corridor hex along a lattice axis: a run down one column is that column\'s 11 cells, and two wide is exactly that column and the next to its right (22 cells); a level run (a zigzag through the half-offset columns) two wide adds each cell\'s neighbour below; the same band from either end',
        axisRun.cells.length === 11 && axisRun.cells.every(c => c.q === 0) && axisTwo.cells.length === 22 && axisTwo.cells.every(c => c.q === 0 || c.q === 1) && axisTwo.cells.filter(c => c.q === 1).length === 11 && j(hexRun(15, 520, 15, 0, 2).cells.map(keyH).sort()) === j(axisTwo.cells.map(keyH).sort())
        && flat2.cells.length === 2 * flatOne.cells.length && flat2.cells.filter(c => !flatKeys.has(keyH(c))).every(c => { const p = F.cellCenter(c, hx); return flatOne.cells.some(o => { const q = F.cellCenter(o, hx); return F.hexDist(o, c) === 1 && p.y > q.y; }); })
        && j(hexRun(465, 10, 15, 10, 2).cells.map(keyH).sort()) === j(flat2.cells.map(keyH).sort()), j([axisRun.cells.length, axisTwo.cells.length, flatOne.cells.length, flat2.cells.length]));
    // the review of fold B1a: a level run through cell centres rides the edge the two cells of every other column share; the rounding took one, the
    // other or both from sample to sample, so a corridor one wide was two wide in every other column
    const tie1 = hexRun(15, 0, 4015, 0, 1), tie2 = hexRun(15, 0, 4015, 0, 2), tieBack = hexRun(4015, 0, 15, 0, 1), tieUp = hexRun(15, 52, 4015, 52, 1), slope = hexRun(15, 0, 15 + 45 * 40, 26 * 40, 1);
    check('corridor hex on a shared edge: a level run through cell centres takes ONE cell a column, the lower one where it rides an edge (centres at y 0 and y 26 only), 90 cells for 90 columns and the same cells from either end; a row lower alike; a run along the other lattice direction through centres one cell a column too; two wide is two cells in every column',
        tie1.cells.length === 90 && perCol(tie1.cells).every(n => n === 1) && tie1.cells.every(c => { const y = F.cellCenter(c, hx).y; return y === 0 || y === 26; }) && j(tieBack.cells.map(keyH).sort()) === j(tie1.cells.map(keyH).sort())
        && tieUp.cells.length === 90 && tieUp.cells.every(c => { const y = F.cellCenter(c, hx).y; return y === 52 || y === 78; }) && slope.cells.length === 41 && perCol(slope.cells).every(n => n === 1)
        && tie2.cells.length === 180 && perCol(tie2.cells).every(n => n === 2) && tie2.more === false, j([tie1.cells.length, perCol(tie1.cells).filter(n => n !== 1).length, tieUp.cells.length, slope.cells.length, tie2.cells.length]));
    const longHex = hexRun(0, 0, 60000, 0, 1), lhDense = hexRun(0, 0, 60000, 0, 2), half = hexRun(15, 0, 9015, 0, 2);
    check('corridor hex cap: a segment of thousands of cells gives 400 and more true, at either width; a two-wide corridor cut at the cap is two wide for all of its kept length (two cells in each of 200 columns, whether the run alone passed the cap or only the pair did); a point gives its one cell, two wide its cell and the one to its right',
        longHex.cells.length === 400 && longHex.more === true && lhDense.cells.length === 400 && lhDense.more === true && perCol(lhDense.cells).length === 200 && perCol(lhDense.cells).every(n => n === 2) && half.cells.length === 400 && half.more === true && perCol(half.cells).length === 200 && perCol(half.cells).every(n => n === 2)
        && j(hexRun(100, 100, 100, 100, 1)) === j({ cells: [F.cellOf(100, 100, hx)], more: false }) && j(hexRun(105, 104, 105, 104, 2)) === j({ cells: [{ q: 2, r: 1 }, { q: 3, r: 1 }], more: false }), j([longHex.cells.length, lhDense.cells.length, perCol(half.cells).length, hexRun(100, 100, 100, 100, 2)]));

    /* ---- snapVertex ---- */
    const vProp = (() => { for (let i = 0; i < 50; i++) { const x = ri(-900, 900) + rnd(), y = ri(-900, 900) + rnd(), v = B.snapVertex(hx, x, y), a = snapToHex(x, y, 30, 'vertex');
        if (!v || Math.abs(v.x - a.x) > 0.006 || Math.abs(v.y - a.y) > 0.006 || Math.round(v.x * 100) !== v.x * 100) return j([x, y, v, a]); } return ''; })();
    check('snapVertex hex (50 seeded points): the nearest vertex of the cell the point lies in, to the hundredth — what the app\'s snapToHex gives in its vertex mode', vProp === '', vProp);
    check('snapVertex square: the nearest lattice crossing (50 and 60 px); gridless: the 50 px lattice when snap is true, else the point to the hundredth; a number that is none or a grid of another kind null',
        j(B.snapVertex(sq, 37, 88)) === j({ x: 50, y: 100 }) && j(B.snapVertex(sq, -24, 26)) === j({ x: 0, y: 50 }) && j(B.snapVertex(sq60, 37, 88)) === j({ x: 60, y: 60 }) && j(B.snapVertex(null, 123, 77, true)) === j({ x: 100, y: 100 }) && j(B.snapVertex(undefined, 123.456, 77, false)) === j({ x: 123.46, y: 77 })
        && j(B.snapVertex(null, 123.456, 77)) === j({ x: 123.46, y: 77 }) && B.snapVertex(sq, NaN, 1) === null && B.snapVertex(null, 1, Infinity, true) === null && B.snapVertex({ type: 'tri' }, 1, 1) === null && j(B.snapVertex(gl, 100, 100)) === j(snapToHexAt(gl, 100, 100)), j(B.snapVertex(gl, 100, 100)));
    function snapToHexAt(grid, x, y) { const c = F.cellCenter(F.cellOf(x, y, grid), grid), s = grid.s, hh = grid.h / 2, vs = [[c.x - s, c.y], [c.x - s / 2, c.y - hh], [c.x + s / 2, c.y - hh], [c.x + s, c.y], [c.x + s / 2, c.y + hh], [c.x - s / 2, c.y + hh]]; let b = null, bd = Infinity; vs.forEach(v => { const d = (x - v[0]) ** 2 + (y - v[1]) ** 2; if (d < bd) { bd = d; b = v; } }); return { x: Math.round(b[0] * 100) / 100, y: Math.round(b[1] * 100) / 100 }; }

    /* ---- polyItem ---- */
    const tri = B.polyItem([[10, 10], [110, 10], [60, 90]]), sqr = B.polyItem([[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]]), dup = B.polyItem([[0, 0], [0, 0], [50, 0], [50, 0], [50, 50], [50, 50], [0, 0]]), frac = B.polyItem([[10.004, 20.126], [60.5, 20.126], [60.5, 70]]);
    check('polyItem: a filled path item from board points — its box their extent, baseW/baseH the box, the points relative to it to the hundredth; a closing repeat of the first dropped; consecutive repeats dropped',
        j(tri) === j({ type: 'path', tip: 'fill', x: 10, y: 10, w: 100, h: 80, baseW: 100, baseH: 80, pts: [[0, 0], [100, 0], [50, 80]] }) && j(sqr) === j({ type: 'path', tip: 'fill', x: 0, y: 0, w: 100, h: 100, baseW: 100, baseH: 100, pts: [[0, 0], [100, 0], [100, 100], [0, 100]] })
        && j(dup.pts) === j([[0, 0], [50, 0], [50, 50]]) && j(frac) === j({ type: 'path', tip: 'fill', x: 10, y: 20.13, w: 50.5, h: 49.87, baseW: 50.5, baseH: 49.87, pts: [[0, 0], [50.5, 0], [50.5, 49.87]] }), j([tri, sqr, dup, frac]));
    const many = n => { const v = []; for (let i = 0; i < n; i++) v.push([Math.round(1000 * Math.cos(i / n * 2 * Math.PI) * 100) / 100, Math.round(1000 * Math.sin(i / n * 2 * Math.PI) * 100) / 100]); return v; };
    check('polyItem refuses fewer than 3 distinct vertices or more than 500 (whatever follows the 501st: never cut to fit); 500 kept (and 500 with the closing repeat); a point that is no pair of numbers within a million either way passed over; no list null; a shape of no area (corners in a line, there and back, under a square pixel) null, a thin one that has an area still a pixel tall, and a shape drawn the other way round a shape all the same',
        B.polyItem([[0, 0], [100, 0]]) === null && B.polyItem([[0, 0], [100, 0], [100, 0], [0, 0]]) === null && B.polyItem(many(501)) === null && B.polyItem(many(500)).pts.length === 500 && B.polyItem(many(500).concat([many(500)[0]])).pts.length === 500 && B.polyItem(many(600)) === null
        && j(B.polyItem([[0, 0], 'x', [100, 0], [null, 5], [50, 80], [NaN, 1], [1]]).pts) === j([[0, 0], [100, 0], [50, 80]]) && B.polyItem('x') === null && B.polyItem(null) === null && B.polyItem([]) === null && B.polyItem([[0, 0], [100, 0], [50, 0]]) === null && B.polyItem([[0, 0], [10, 0], [0, 0], [10, 0]]) === null && B.polyItem([[0, 0], [100, 0], [50, 0.01]]) === null && B.polyItem([[0, 0], [100, 0], [50, 0.5]]).h === 1
        && B.polyItem(many(500).concat([many(500)[0], [5, 5], [6, 6], [7, 7]])) === null && B.polyItem([[0, 0], [1e308, 0], [0, 1e308]]) === null && j(B.polyItem([[0, 0], [1e7, 5], [100, 0], [-5, 1.5e6], [50, 80]]).pts) === j([[0, 0], [100, 0], [50, 80]]) && B.polyItem([[0, 0], [1e6, 0], [0, 1e6]]).w === 1e6 && j(B.polyItem([[60, 90], [110, 10], [10, 10]]).pts) === j([[50, 80], [100, 0], [0, 0]]));
    const sqG = F.squareGrid(50), segs = F.pathSegs(sqr), segs3 = F.pathSegs(tri);
    check('fogcore pathSegs closes the ring (n segments for n vertices, the last back to the first) and pathCells finds its cells on a square grid; a scaled copy (w, h over baseW, baseH) still closes',
        segs.length === 4 && segs3.length === 3 && j(segs[3]) === j([0, 100, 0, 0]) && j(segs3[2]) === j([60, 90, 10, 10]) && F.pathCells(sqr, sqG).length >= 8 && F.pathCells(tri, sqG).length >= 4 && F.pathSegs(Object.assign({}, sqr, { w: 200, h: 200 })).length === 4 && F.pathSegs(B.polyItem(many(500))).length === 500, j([segs, segs3]));

    /* ---- seatedAt ---- */
    const items = [{ type: 'rect', x: 100, y: 50, w: 50, h: 50, isChar: true }, { type: 'rect', x: 100, y: 50, w: 50, h: 50, hidden: true }, { type: 'path', x: 100, y: 50, w: 50, h: 50, pts: [[0, 0], [50, 50]] }, { type: 'rect', x: 102, y: 50, w: 50, h: 50 }, { type: 'hexagon', x: 100, y: 50, w: 50, h: 50 },
        null, 'x', { type: 'rect', x: 100, y: 50, w: 50, h: 50, waiting: true }, { type: 'rect', x: 100.6, y: 49.4, w: 50.9, h: 49.1, color: '#000' }, { type: 'rect', x: 100, y: 50, w: 50, h: 50 }];
    check('seatedAt: the first item of the same type whose box lies within a pixel each way and is no token (isChar / waiting), not hidden and no path; never one 2 px over or of another type; -1 for none, no list or no piece',
        B.seatedAt(items, { type: 'rect', x: 100, y: 50, w: 50, h: 50 }) === 8 && B.seatedAt(items.slice(0, 8), { type: 'rect', x: 100, y: 50, w: 50, h: 50 }) === -1 && B.seatedAt(items, { type: 'hexagon', x: 100, y: 50, w: 50, h: 50 }) === 4 && B.seatedAt(items, { type: 'rect', x: 100, y: 50, w: 60, h: 50 }) === -1
        && B.seatedAt(items, { type: 'path', x: 100, y: 50, w: 50, h: 50 }) === -1 && B.seatedAt([], { type: 'rect', x: 0, y: 0, w: 1, h: 1 }) === -1 && B.seatedAt(null, { type: 'rect' }) === -1 && B.seatedAt(items, null) === -1 && B.seatedAt(items, { type: 'rect', x: 'x', y: 50, w: 50, h: 50 }) === -1);
    // the review of fold B1a: the Build tool overwrites the colour, layer, name, texture and wall keys of the piece it finds seated, so only a
    // PLAIN piece may be found: never a locked or turned one, nor one with a purpose of its own
    const spOne = extra => [Object.assign({ type: 'rect', x: 0, y: 0, w: 50, h: 50 }, extra)], spPiece = { type: 'rect', x: 0, y: 0, w: 50, h: 50 };
    const spNo = [{ locked: true }, { rot: 45 }, { rot: -90 }, { rot: 0.5 }, { barrier: true }, { fogged: true }, { targetMapId: 'm2' }, { nodeId: 'r1' }, { nulls: ['s1'] }, { smoke: true }, { fogHand: 'hide' }, { fogHand: 'show' }, { page: 'p1' }, { gmNoteFor: 't1' }].map(e => B.seatedAt(spOne(e), spPiece));
    const spYes = [{}, { rot: 0 }, { rot: 360 }, { rot: -720 }, { rot: 'x' }, { barrier: 'yes' }, { smoke: 1 }, { fill: true }, { texture: 'bricks', blocksSight: true, sightType: 'wall' }, { terrain: 2 }, { cover: 'yes' }, { height: 2 }, { ground: 1 }, { layer: 'front' }, { name: 'Floor' }].map(e => B.seatedAt(spOne(e), spPiece));
    check('seatedAt re-lays only a plain piece: one that is locked, turned (by any angle that is no whole turn), a see-through barrier, a play area, a portal by its own key or its node\'s, a null area, smoke, marked for the fog, pinned to a page or a GM note card is never found; a painted cell, a built wall, a piece with terrain, cover, a height, a ground or another layer, and one turned by nothing or a whole turn, are; a piece with no type finds nothing, even an item with none',
        spNo.every(v => v === -1) && spYes.every(v => v === 0) && B.seatedAt([{ x: 0, y: 0, w: 1, h: 1 }], { x: 0, y: 0, w: 1, h: 1 }) === -1 && B.seatedAt(spOne({}), { type: 7, x: 0, y: 0, w: 50, h: 50 }) === -1
        && B.seatedAt([spOne({ locked: true })[0], spOne({})[0]], spPiece) === 1, j([spNo, spYes]));

    /* ---- the module itself ---- */
    check('buildcore\'s header: what it is, no state no DOM, run by tools/buildcheck.js under Node, the owner\'s decisions of 2026-10-01; what it publishes on window is what it exports',
        /No state, no DOM; tools\/buildcheck\.js runs it under Node/.test(src) && /The owner's decisions of 2026-10-01/.test(src) && /code-drawn pattern named from a frozen list/.test(src) && /ordinary board item with today's flags/.test(src) && /the pen's thin wall of item 18 W2/.test(src) && /the GM's to decide per piece/.test(src)
        && /var API = \{[^}]*pieceProps: pieceProps[^}]*\};\nif \(typeof window !== 'undefined'\) window\.wpBuildCore = API;\nexport \{ /.test(src) && Object.keys(B).filter(k => k !== 'default').every(k => new RegExp('\\b' + k + ': ' + k + '\\b').test(src) && new RegExp('export \\{[^}]*\\b' + k + '\\b').test(src))
        && src.indexOf('\r') < 0 && !/=>|`/.test(src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')) && src.split(NL).length > 150, Object.keys(B).join(','));
    const tmp = path.join(os.tmpdir(), 'wp-buildcore-' + process.pid + '.mjs');
    let chk = null; try { fs.writeFileSync(tmp, src); chk = cp.spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' }); } catch (e) { chk = { status: -1, stderr: String(e) }; } finally { try { fs.unlinkSync(tmp); } catch (e) { /* gone */ } }
    check('buildcore.js passes node --check as a .mjs copy (a syntax error parsecheck would attribute to every importer)', chk && chk.status === 0, chk && (chk.stderr || chk.status));

    summed = true;
    console.log(NL + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exit(1);
})().catch(function(e) { console.log('FAIL      the suite threw: ' + (e && e.stack || e)); process.exit(1); });

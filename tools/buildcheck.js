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
    const seamOk = n => {
        const t = B.TEX[n], sps = subpaths(t.d), all = [].concat(...sps.map(s => s.pts)), has = (x, y) => all.some(p => Math.abs(p[0] - x) < 1e-9 && Math.abs(p[1] - y) < 1e-9), m = t.dark / 2;
        const shifted = (sp, dx, dy) => sps.some(o => o !== sp && o.pts.length === sp.pts.length && o.pts.every((p, k) => Math.abs(p[0] - (sp.pts[k][0] + dx)) < 1e-9 && Math.abs(p[1] - (sp.pts[k][1] + dy)) < 1e-9));
        return sps.every(sp => {
            const out = sp.bounds.some(p => p[0] < 0 || p[0] > t.w || p[1] < 0 || p[1] > t.h);
            if (out) { const xs = sp.bounds.map(p => p[0]), ys = sp.bounds.map(p => p[1]); return (Math.min(...xs) < 0 && shifted(sp, t.w, 0)) || (Math.max(...xs) > t.w && shifted(sp, -t.w, 0)) || (Math.min(...ys) < 0 && shifted(sp, 0, t.h)) || (Math.max(...ys) > t.h && shifted(sp, 0, -t.h)); }
            return sp.bounds.every(p => {
                const onX = p[0] === 0 || p[0] === t.w, onY = p[1] === 0 || p[1] === t.h;
                if (onX && !has(p[0] === 0 ? t.w : 0, p[1])) return false;
                if (onY && !has(p[0], p[1] === 0 ? t.h : 0)) return false;
                return (onX || (p[0] >= m && p[0] <= t.w - m)) && (onY || (p[1] >= m && p[1] <= t.h - m));
            });
        });
    };
    check('every tile tiles seamlessly by its constants: a stroke ending on an edge continues from the same place on the opposite edge, a stone straddling the seam is drawn at both edges, and nothing else comes within half the dark stroke of an edge',
        B.TEXTURES.every(seamOk), j(B.TEXTURES.filter(n => !seamOk(n))));
    check('the ripples\' wave period divides the tile, so a row leaves the right edge at the height and slope it enters the left (the control points mirror); the hatching\'s lines leave an edge where their twins enter',
        (() => { const sp = subpaths(B.TEX.ripples.d); return sp.length === 3 && sp.every(s => s.pts.length === 5 && s.pts[0][0] === 0 && s.pts[4][0] === B.TEX.ripples.w && s.pts[0][1] === s.pts[4][1] && s.bounds[5][1] - s.pts[0][1] === -(s.bounds[8][1] - s.pts[0][1])); })()
        && subpaths(B.TEX.hatching.d).every(s => s.pts.length === 2 && Math.abs((s.pts[1][1] - s.pts[0][1]) - (s.pts[1][0] - s.pts[0][0])) < 1e-9));
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
    const hexProp2 = (() => { for (let i = 0; i < 60; i++) { const sx = ri(-800, 800), sy = ri(-800, 800), ex = ri(-800, 800), ey = ri(-800, 800), one = hexRun(sx, sy, ex, ey, 1), two = hexRun(sx, sy, ex, ey, 2);
        if (!one || one.more || one.cells.length < 1 || j(one.cells[0]) !== j(F.cellOf(sx, sy, hx)) || j(one.cells[one.cells.length - 1]) !== j(F.cellOf(ex, ey, hx))) return 'ends ' + j([sx, sy, ex, ey, one]);
        for (let k = 1; k < one.cells.length; k++) if (F.hexDist(one.cells[k - 1], one.cells[k]) !== 1) return 'step ' + j([sx, sy, ex, ey, one.cells[k - 1], one.cells[k]]);
        const ks = new Set(one.cells.map(c => F.cellKey(c, hx))); if (ks.size !== one.cells.length) return 'twice ' + j(one);
        const k2 = new Set(two.cells.map(c => F.cellKey(c, hx))); if (k2.size !== two.cells.length || two.cells.length <= one.cells.length || two.cells.length > 2 * one.cells.length || !one.cells.every(c => k2.has(F.cellKey(c, hx)))) return 'width 2 ' + j([sx, sy, ex, ey, one.cells.length, two.cells.length]);
        const added = two.cells.slice(one.cells.length); if (!added.every(c => one.cells.some(o => F.hexDist(o, c) === 1))) return 'width 2 neighbours ' + j([sx, sy, ex, ey]);
        const nx0 = -(ey - sy), ny0 = ex - sx, flip = ny0 < 0 || (ny0 === 0 && nx0 < 0) ? -1 : 1, nx = nx0 * flip, ny = ny0 * flip;   // the side the band grows on: down, or right when level
        if (!added.every(c => { const p = F.cellCenter(c, hx); return one.cells.some(o => { const q = F.cellCenter(o, hx); return F.hexDist(o, c) === 1 && (p.x - q.x) * nx + (p.y - q.y) * ny > 0; }); })) return 'width 2 side ' + j([sx, sy, ex, ey]); } return ''; })();
    check('corridor hex (60 seeded segments): a straight run from the press cell to the release cell, each consecutive pair at hexDist 1, each cell once; width 2 holds every cell of width 1 and adds (at most as many again) only neighbours of the run on its lower side — its right side when it runs up or down', hexProp2 === '', hexProp2);
    const axisRun = hexRun(15, 0, 15, 520, 1), axisTwo = hexRun(15, 0, 15, 520, 2), flat = hexRun(15, 10, 465, 10, 2), flatOne = hexRun(15, 10, 465, 10, 1);
    check('corridor hex along a lattice axis: a run down one column is that column\'s 11 cells, and two wide is exactly that column and the next to its right (22 cells); a level run (a zigzag through the half-offset columns) two wide adds each cell\'s neighbour below; the same band from either end',
        axisRun.cells.length === 11 && axisRun.cells.every(c => c.q === 0) && axisTwo.cells.length === 22 && axisTwo.cells.every(c => c.q === 0 || c.q === 1) && axisTwo.cells.filter(c => c.q === 1).length === 11 && j(hexRun(15, 520, 15, 0, 2).cells.map(c => F.cellKey(c, hx)).sort()) === j(axisTwo.cells.map(c => F.cellKey(c, hx)).sort())
        && flat.cells.length === 2 * flatOne.cells.length && flat.cells.slice(flatOne.cells.length).every(c => { const p = F.cellCenter(c, hx); return flatOne.cells.some(o => { const q = F.cellCenter(o, hx); return F.hexDist(o, c) === 1 && p.y > q.y; }); }), j([axisRun.cells.length, axisTwo.cells.length, flatOne.cells.length, flat.cells.length]));
    const longHex = hexRun(0, 0, 60000, 0, 1), lhDense = hexRun(0, 0, 60000, 0, 2);
    check('corridor hex cap: a segment of thousands of cells gives 400 and more true, at either width; a point gives its one cell, two wide its cell and the one to its right', longHex.cells.length === 400 && longHex.more === true && lhDense.cells.length === 400 && lhDense.more === true && j(hexRun(100, 100, 100, 100, 1)) === j({ cells: [F.cellOf(100, 100, hx)], more: false })
        && j(hexRun(105, 104, 105, 104, 2)) === j({ cells: [{ q: 2, r: 1 }, { q: 3, r: 1 }], more: false }), j([longHex.cells.length, lhDense.cells.length, hexRun(100, 100, 100, 100, 2)]));

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
    check('polyItem refuses fewer than 3 distinct vertices or more than 500; 500 kept (and 500 with the closing repeat); a point that is no pair of numbers passed over; no list null; a flat extent still a pixel',
        B.polyItem([[0, 0], [100, 0]]) === null && B.polyItem([[0, 0], [100, 0], [100, 0], [0, 0]]) === null && B.polyItem(many(501)) === null && B.polyItem(many(500)).pts.length === 500 && B.polyItem(many(500).concat([many(500)[0]])).pts.length === 500 && B.polyItem(many(600)) === null
        && j(B.polyItem([[0, 0], 'x', [100, 0], [null, 5], [50, 80], [NaN, 1], [1]]).pts) === j([[0, 0], [100, 0], [50, 80]]) && B.polyItem('x') === null && B.polyItem(null) === null && B.polyItem([]) === null && B.polyItem([[0, 0], [100, 0], [50, 0]]).h === 1);
    const sqG = F.squareGrid(50), segs = F.pathSegs(sqr), segs3 = F.pathSegs(tri);
    check('fogcore pathSegs closes the ring (n segments for n vertices, the last back to the first) and pathCells finds its cells on a square grid; a scaled copy (w, h over baseW, baseH) still closes',
        segs.length === 4 && segs3.length === 3 && j(segs[3]) === j([0, 100, 0, 0]) && j(segs3[2]) === j([60, 90, 10, 10]) && F.pathCells(sqr, sqG).length >= 8 && F.pathCells(tri, sqG).length >= 4 && F.pathSegs(Object.assign({}, sqr, { w: 200, h: 200 })).length === 4 && F.pathSegs(B.polyItem(many(500))).length === 500, j([segs, segs3]));

    /* ---- seatedAt ---- */
    const items = [{ type: 'rect', x: 100, y: 50, w: 50, h: 50, isChar: true }, { type: 'rect', x: 100, y: 50, w: 50, h: 50, hidden: true }, { type: 'path', x: 100, y: 50, w: 50, h: 50, pts: [[0, 0], [50, 50]] }, { type: 'rect', x: 102, y: 50, w: 50, h: 50 }, { type: 'hexagon', x: 100, y: 50, w: 50, h: 50 },
        null, 'x', { type: 'rect', x: 100, y: 50, w: 50, h: 50, waiting: true }, { type: 'rect', x: 100.6, y: 49.4, w: 50.9, h: 49.1, color: '#000' }, { type: 'rect', x: 100, y: 50, w: 50, h: 50 }];
    check('seatedAt: the first item of the same type whose box lies within a pixel each way and is no token (isChar / waiting), not hidden and no path; never one 2 px over or of another type; -1 for none, no list or no piece',
        B.seatedAt(items, { type: 'rect', x: 100, y: 50, w: 50, h: 50 }) === 8 && B.seatedAt(items.slice(0, 8), { type: 'rect', x: 100, y: 50, w: 50, h: 50 }) === -1 && B.seatedAt(items, { type: 'hexagon', x: 100, y: 50, w: 50, h: 50 }) === 4 && B.seatedAt(items, { type: 'rect', x: 100, y: 50, w: 60, h: 50 }) === -1
        && B.seatedAt(items, { type: 'path', x: 100, y: 50, w: 50, h: 50 }) === -1 && B.seatedAt([], { type: 'rect', x: 0, y: 0, w: 1, h: 1 }) === -1 && B.seatedAt(null, { type: 'rect' }) === -1 && B.seatedAt(items, null) === -1 && B.seatedAt(items, { type: 'rect', x: 'x', y: 50, w: 50, h: 50 }) === -1);

    /* ---- the module itself ---- */
    check('buildcore\'s header: what it is, no state no DOM, run by tools/buildcheck.js under Node, the owner\'s decisions of 2026-10-01; what it publishes on window is what it exports',
        /No state, no DOM; tools\/buildcheck\.js runs it under Node/.test(src) && /The owner's decisions of 2026-10-01/.test(src) && /code-drawn pattern named from a frozen list/.test(src) && /ordinary board item with today's flags/.test(src) && /the pen's thin wall of item 18 W2/.test(src) && /the GM's to decide per piece/.test(src)
        && /var API = \{[^}]*pieceProps: pieceProps[^}]*\};\nif \(typeof window !== 'undefined'\) window\.wpBuildCore = API;\nexport \{ /.test(src) && Object.keys(B).filter(k => k !== 'default').every(k => new RegExp('\\b' + k + ': ' + k + '\\b').test(src) && new RegExp('export \\{[^}]*\\b' + k + '\\b').test(src))
        && src.indexOf('\r') < 0 && !/=>|`/.test(src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')) && src.split(NL).length > 150, Object.keys(B).join(','));
    const tmp = path.join(os.tmpdir(), 'wp-buildcore-' + process.pid + '.mjs');
    let chk = null; try { fs.writeFileSync(tmp, src); chk = cp.spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' }); } catch (e) { chk = { status: -1, stderr: String(e) }; } finally { try { fs.unlinkSync(tmp); } catch (e) { /* gone */ } }
    check('buildcore.js passes node --check as a .mjs copy (a syntax error parsecheck would attribute to every importer)', chk && chk.status === 0, chk && (chk.stderr || chk.status));

    /* ---- the Build tool itself: whiteboard.js sliced by its buildtool markers and run for real on a page of plain objects ---- */
    const wbSrc = read('system/app/scripts/whiteboard.js');
    const cutM = (s, name, file) => { const a = '// [buildcheck:' + name + '-start]', b = '// [buildcheck:' + name + '-end]', i = s.indexOf(a), k = s.indexOf(b); if (i < 0 || k < i) throw new Error('buildcheck: marker ' + name + ' not found in ' + file); if (s.indexOf(a, i + 1) >= 0 || s.indexOf(b, k + 1) >= 0) throw new Error('buildcheck: marker ' + name + ' not unique in ' + file); return s.slice(i, k); };
    const toolSrc = cutM(wbSrc, 'buildtool', 'whiteboard.js');
    // a page of plain objects: a recording document whose elements hold a class set, a style, a dataset, a value, children and handlers; a plain store for
    // localStorage; the REAL buildcore and fogcore on the window; recorders for save, render, toast, the placement; a map of plain objects
    const mkPage = o => {
        o = o || {};
        const rec = { saves: 0, renders: 0, toasts: [], arms: [], fogInv: 0, fogRedraw: 0, n: 0, els: Object.create(null), docH: {} };
        const mkEl = (tag, id) => {
            const el = { tag, id: id || '', cls: new Set(), style: {}, dataset: {}, attrs: {}, value: '', checked: false, disabled: false, textContent: '', title: '', type: '', children: [], handlers: {}, clicks: 0, parent: null, scrollLeft: 0, scrollTop: 0 };
            el.classList = { add: c => { el.cls.add(c); }, remove: c => { el.cls.delete(c); }, toggle: (c, on) => { if (on === undefined) on = !el.cls.has(c); if (on) el.cls.add(c); else el.cls.delete(c); return on; }, contains: c => el.cls.has(c) };
            Object.defineProperty(el, 'className', { get() { return Array.from(el.cls).join(' '); }, set(v) { el.cls = new Set(String(v).split(/\s+/).filter(Boolean)); } });
            Object.defineProperty(el, 'firstChild', { get() { return el.children[0] || null; } });
            Object.defineProperty(el, 'options', { get() { return el.children.filter(k => k.tag === 'option'); } });
            el.appendChild = k => { el.children.push(k); k.parent = el; return k; };
            el.removeChild = k => { const i = el.children.indexOf(k); if (i >= 0) el.children.splice(i, 1); k.parent = null; return k; };
            el.insertBefore = (k, ref) => { const i = ref ? el.children.indexOf(ref) : -1; el.children.splice(i < 0 ? el.children.length : i, 0, k); k.parent = el; return k; };
            el.remove = () => { if (el.parent) el.parent.removeChild(el); };
            el.setAttribute = (k, v) => { el.attrs[k] = String(v); };
            el.getAttribute = k => (Object.prototype.hasOwnProperty.call(el.attrs, k) ? el.attrs[k] : null);
            el.addEventListener = (ev, fn) => { (el.handlers[ev] = el.handlers[ev] || []).push(fn); };
            el.fire = (ev, e) => { (el.handlers[ev] || []).forEach(fn => fn.call(el, e || { stopPropagation() {}, preventDefault() {} })); };
            el.click = () => { el.clicks++; el.cls.add('active'); };   // a toolbar button clicked lights up, as the real one does
            el.closest = () => null;
            el.getBoundingClientRect = () => ({ left: 0, top: 0 });
            return el;
        };
        const byId = id => rec.els[id] || (rec.els[id] = mkEl('div', id));
        const swatches = ['#5a5663', '#3f3b47'].map(c => { const s = mkEl('button'); s.dataset.color = c; return s; }), custom = mkEl('label'); custom.cls.add('custom');
        const shapeBtns = ['rect', 'circle', 'poly', 'corridor', 'line'].map(sh => { const b = mkEl('button'); b.dataset.shape = sh; return b; });
        const doc = { body: mkEl('body'), createElement: tag => mkEl(tag), createElementNS: (ns, tag) => { const e = mkEl(tag); e.ns = ns; return e; }, getElementById: byId,
            querySelectorAll: sel => sel === '#buildMatRow .build-mat-btn' ? byId('buildMatRow').children.slice() : sel === '#buildShapeRow .build-shape-btn' ? shapeBtns : sel === '#buildColorRow .draw-swatch[data-color]' ? swatches : [],
            querySelector: sel => sel === '#buildColorRow .draw-swatch.custom' ? custom : sel === '#buildColorRow .draw-swatch[data-color].active' ? swatches.find(s => s.cls.has('active')) || null : null,
            addEventListener: (ev, fn) => { (rec.docH[ev] = rec.docH[ev] || []).push(fn); } };
        const store = Object.assign({}, o.store || {}), ls = { getItem: k => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
        const win = { wpBuildCore: B, wpFogCore: F, wpCanPersistLocal: () => o.gm !== false, wpSnapOn: () => o.snap === true, wpFog: { invalidateVision: () => { rec.fogInv++; }, redraw: () => { rec.fogRedraw++; } }, wpPlace: null, wpPenPreset: null };
        const map = o.map || { id: 'm1', type: 'map', meta: { gridType: o.grid === undefined ? 'square' : o.grid }, whiteboard: [] };
        const state = { selWbId: null, selWbIds: [], zoomLevel: 1 }, wb = mkEl('div', 'whiteboard'), wbWrap = mkEl('div', 'wbWrap');
        const api = new Function('document', 'localStorage', 'window', 'getActiveMap', 'toast', 'save', 'render', 'uid', 'newOpacityProps', 'state', 'armPlacement', 'disarmPlacement', 'wb', 'wbWrap', "'use strict';" + NL + toolSrc
            + NL + 'return { b: _build, load: buildLoad, saveB: buildSave, material: buildMaterial, props: buildProps, arm: buildArm, disarm: buildDisarm, sync: buildSync, commit: wpBuildCommit, lay: buildLay, polyAdd: buildPolyAdd, polyClose: buildPolyClose, gridOf: buildGridOf, MAX: BUILD_MAX };')(
            doc, ls, win, () => map, m => rec.toasts.push(m), () => { rec.saves++; }, () => { rec.renders++; }, () => ++rec.n, () => ({}), state,
            (type, props, label, quiet) => { rec.arms.push([type, label, quiet]); win.wpPlace = { type, props }; }, () => { rec.arms.push(['off']); win.wpPlace = null; }, wb, wbWrap);
        // what wpPlaceCommit does with an armed build: takes the placement, disarms it and hands it on (a click: pw = ph = 0 at the press; a drag: the box from the press corner)
        const commit = (px, py, pw, ph, sx, sy) => { const P = win.wpPlace; rec.arms.push(['off']); win.wpPlace = null; if (P && P.build) api.commit(P, px, py, pw, ph, sx === undefined ? px : sx, sy === undefined ? py : sy); return P; };
        const click = (x, y) => commit(x, y, 0, 0, x, y), drag = (x, y, w, h) => commit(x, y, w, h, x, y);
        const key = (k, target) => (rec.docH.keydown || []).forEach(fn => fn({ key: k, target: target || null, preventDefault() {} }));
        return Object.assign({ api, rec, win, map, state, doc, store, wb, wbWrap, byId, shapeBtns, swatches, commit, click, drag, key }, api);
    };
    const bare = w => { const o = {}; Object.keys(w).forEach(k => { if (k !== 'id') o[k] = w[k]; }); return o; };
    // (a) a rect on a square map: a click, the materials, a drag, a circle and a corridor
    const pgA = mkPage(), aArm = pgA.arm(true), aP = pgA.win.wpPlace;
    pgA.click(120, 70);
    const a1 = pgA.map.whiteboard.slice();
    check('Build tool (a): arming puts a build placement on the window (type build, the floor\'s props by the real pieceProps, the shape and the corridor width) and a click lays ONE rect over the press cell with the material\'s props — texture, colour, layer, name, z 10 — and no other key (never fill, rot, isChar or hidden); save ran once, render once; the piece is selected and building has re-armed itself',
        aArm === true && !!aP && aP.type === 'build' && j(aP.build) === j({ mat: 'floor', shape: 'rect', corridorW: 1 }) && j(aP.props) === j(B.pieceProps('floor'))
        && a1.length === 1 && /^wb\d+$/.test(a1[0].id) && j(bare(a1[0])) === j({ type: 'rect', x: 100, y: 50, w: 50, h: 50, z: 10, color: '#5a5663', layer: 'back', name: 'Floor', texture: 'flagstones' })
        && pgA.rec.saves === 1 && pgA.rec.renders === 1 && pgA.state.selWbId === a1[0].id && j(pgA.state.selWbIds) === '[]' && !!pgA.win.wpPlace && !!pgA.win.wpPlace.build && pgA.b.armed === true && pgA.rec.arms.filter(a => a[0] === 'build').length === 2, j([aP, a1, pgA.rec.saves, pgA.rec.renders, pgA.rec.arms]));
    const matLay = (mat, x, y) => { pgA.material(mat); pgA.b.shape = 'rect'; pgA.arm(true); pgA.click(x, y); return pgA.map.whiteboard[pgA.map.whiteboard.length - 1]; };
    const wallP = matLay('wall', 320, 70), waterP = matLay('water', 420, 70), rubbleP = matLay('rubble', 520, 70), doorP = matLay('door', 620, 70);
    check('Build tool (a): a wall piece carries blocksSight and sightType wall, a door sightType door, water terrain 2, rubble cover yes — each material\'s own props through the real pieceProps — and no piece a fill, a rot, isChar or hidden',
        j(bare(wallP)) === j({ type: 'rect', x: 300, y: 50, w: 50, h: 50, z: 10, color: '#3f3b47', layer: 'back-mid', name: 'Wall', texture: 'bricks', blocksSight: true, sightType: 'wall' }) && doorP.sightType === 'door' && doorP.blocksSight === true && doorP.texture === 'planks'
        && j(bare(waterP)) === j({ type: 'rect', x: 400, y: 50, w: 50, h: 50, z: 10, color: '#2e5d86', layer: 'back', name: 'Water', texture: 'ripples', terrain: 2 }) && j(bare(rubbleP)) === j({ type: 'rect', x: 500, y: 50, w: 50, h: 50, z: 10, color: '#55505c', layer: 'back-mid', name: 'Rubble', texture: 'stone', cover: 'yes' })
        && pgA.map.whiteboard.length === 5 && pgA.map.whiteboard.every(w => !('fill' in w) && !('rot' in w) && !('isChar' in w) && !('hidden' in w)) && pgA.rec.saves === 5, j([wallP, waterP, rubbleP, doorP]));
    const pgD = mkPage(); pgD.arm(true); pgD.drag(120, 70, 130, 80);
    const d1 = pgD.map.whiteboard.slice(0), dS1 = pgD.rec.saves, dR1 = pgD.rec.renders;
    pgD.b.shape = 'circle'; pgD.arm(true); pgD.click(620, 70); const dCirc = pgD.map.whiteboard[1];
    pgD.b.shape = 'corridor'; pgD.b.corridorW = 2; pgD.arm(true); pgD.drag(120, 330, 300, 10); const dCorr = pgD.map.whiteboard[2];
    check('Build tool (a): a drag lays one rect over every cell from the press cell to the release cell (the real snapBox), one save, one render; the circle shape lays a circle on the cell; a corridor two wide lays the strip the real corridor gives',
        d1.length === 1 && j([d1[0].type, d1[0].x, d1[0].y, d1[0].w, d1[0].h]) === j(['rect', 100, 50, 200, 150]) && dS1 === 1 && dR1 === 1 && j([dCirc.type, dCirc.x, dCirc.y, dCirc.w, dCirc.h]) === j(['circle', 600, 50, 50, 50])
        && j([dCorr.type, dCorr.x, dCorr.y, dCorr.w, dCorr.h]) === j(['rect', 100, 300, 350, 100]) && j([dCorr.x, dCorr.y, dCorr.w, dCorr.h]) === j([B.corridor(sq, 120, 330, 420, 340, 2).x, B.corridor(sq, 120, 330, 420, 340, 2).y, B.corridor(sq, 120, 330, 420, 340, 2).w, B.corridor(sq, 120, 330, 420, 340, 2).h]) && pgD.map.whiteboard.length === 3 && pgD.rec.saves === 3, j([d1, dCirc, dCorr]));
    // (b) a hex map: one hexagon per cell, laid again in place
    const pgH = mkPage({ grid: 'hex' }); pgH.arm(true); pgH.drag(100, 60, 200, 120);
    const hCells = (() => { const seen = new Set(); return F.cellsUnderRect(100, 60, 200, 120, hx).filter(c => { const k = F.cellKey(c, hx); if (seen.has(k)) return false; seen.add(k); return true; }); })();
    const h1 = pgH.map.whiteboard.slice(), hOk = h1.length === hCells.length && h1.every((w, i) => { const b = B.hexCellBox(hx, hCells[i]), c = F.cellCenter(hCells[i], hx); return w.type === 'hexagon' && w.w === 60 && w.h === 52 && w.x === b.x && w.y === b.y && w.x + 30 === c.x && w.y + 26 === c.y && w.texture === 'flagstones' && w.name === 'Floor'; });
    const hIds = h1.map(w => w.id), hS1 = pgH.rec.saves;
    pgH.material('grass'); pgH.arm(true); pgH.drag(100, 60, 200, 120);
    const h2 = pgH.map.whiteboard.slice();
    pgH.material('floor'); pgH.arm(true); pgH.click(400, 300); const hClick = pgH.map.whiteboard[pgH.map.whiteboard.length - 1], hCell = F.cellOf(400, 300, hx), hBox = B.hexCellBox(hx, hCell);
    check('Build tool (b): on a hex map a drag lays one 60 x 52 hexagon per cell whose centre lies in the box (fogcore cellsUnderRect, each seated on cellCenter by hexCellBox), one save for the gesture; the same area laid again as grass updates every piece in place — the count and the ids unchanged, the props replaced — and saves once more; a click lays the one cell under it',
        hOk && hCells.length > 6 && hS1 === 1 && h2.length === h1.length && j(h2.map(w => w.id)) === j(hIds) && h2.every(w => w.texture === 'grass' && w.color === '#4b6b36' && w.name === 'Grass') && pgH.rec.saves === 3 && pgH.rec.renders === 3
        && j([hClick.type, hClick.x, hClick.y, hClick.w, hClick.h]) === j(['hexagon', hBox.x, hBox.y, 60, 52]) && pgH.map.whiteboard.length === hIds.length + 1, j([h1.length, hCells.length, h2.length, pgH.rec.saves, pgH.rec.renders]));
    // (c) a wall and the fog
    const pgW = mkPage(); pgW.arm(true); pgW.click(120, 70); const fogFloor = [pgW.rec.fogInv, pgW.rec.fogRedraw];
    pgW.material('wall'); pgW.b.shape = 'rect'; pgW.arm(true); pgW.click(320, 70); const fogWall = [pgW.rec.fogInv, pgW.rec.fogRedraw];
    pgW.material('floor'); pgW.arm(true); pgW.click(320, 70); const over = pgW.map.whiteboard[1], fogBack = [pgW.rec.fogInv, pgW.rec.fogRedraw, pgW.map.whiteboard.length, 'blocksSight' in over, 'sightType' in over, over.texture, over.name];
    check('Build tool (c): a wall piece laid has the fog work vision out afresh and redraw; a floor does not; a floor laid over the wall\'s cell re-lays onto that piece (one piece, blocksSight and sightType gone, the floor\'s texture and name) and, as a wall changed, redraws the fog too',
        j(fogFloor) === j([0, 0]) && j(fogWall) === j([1, 1]) && j(fogBack) === j([2, 2, 2, false, false, 'flagstones', 'Floor']), j([fogFloor, fogWall, fogBack]));
    // (d) the cap
    const full = []; for (let i = 0; i < 6000; i++) full.push({ id: 'd' + i, type: 'text', x: 900000, y: 900000, w: 1, h: 1 });
    const pgF = mkPage({ map: { id: 'mF', type: 'map', meta: { gridType: 'square' }, whiteboard: full.slice() } }); pgF.arm(true); pgF.click(120, 70);
    const oneShort = { id: 'mG', type: 'map', meta: { gridType: 'hex' }, whiteboard: full.slice(1) }, pgG = mkPage({ map: oneShort }); pgG.arm(true); pgG.drag(100, 60, 200, 120);
    check('Build tool (d): a map holding 6000 items lays nothing more — the count stays, nothing saved, a toast says the players\' copies\' cap; a hex map one short of it takes one cell of a drag of many and says so, saving once',
        pgF.map.whiteboard.length === 6000 && pgF.rec.saves === 0 && pgF.rec.renders === 0 && pgF.rec.toasts.length === 1 && /^This map holds as many pieces as players.{1,2}copies can carry \(6000\)\. Nothing more was laid\.$/.test(pgF.rec.toasts[0]) && pgF.MAX === 6000
        && oneShort.whiteboard.length === 6000 && oneShort.whiteboard[5999].type === 'hexagon' && pgG.rec.saves === 1 && pgG.rec.toasts.some(t => /Nothing more was laid/.test(t)), j([pgF.map.whiteboard.length, pgF.rec.toasts, oneShort.whiteboard.length, pgG.rec.toasts]));
    // (e) a client
    const pgC = mkPage(); pgC.arm(true); const armedGm = pgC.b.armed; pgC.win.wpCanPersistLocal = () => false; pgC.click(120, 70);
    const cOut = [pgC.map.whiteboard.length, pgC.b.armed, pgC.win.wpPlace, pgC.rec.saves, pgC.rec.arms.filter(a => a[0] === 'build').length, pgC.byId('buildBtn').cls.has('active')];
    const pgC2 = mkPage({ gm: false }), armedCl = pgC2.arm(true);
    check('Build tool (e): on a client (wpCanPersistLocal false) a commit lays nothing and ends building — no item, no save, no re-arm, the placement gone, the button unlit; arming on a client is refused outright',
        armedGm === true && j(cOut) === j([0, false, null, 0, 1, false]) && armedCl === false && pgC2.b.armed === false && pgC2.win.wpPlace === null && pgC2.rec.arms.length === 0, j(cOut));
    // (f) the polygon
    const pgP = mkPage(); pgP.b.shape = 'poly'; pgP.arm(true);
    pgP.click(103, 97); pgP.click(197, 104); pgP.click(203, 196);
    const mid = [pgP.map.whiteboard.length, pgP.b.poly && pgP.b.poly.length, pgP.wb.children.length, pgP.b.polyEl && pgP.b.polyEl.firstChild.children.map(k => k.tag), pgP.b.polyEl && pgP.b.polyEl.firstChild.children[0].attrs.points, pgP.rec.saves];
    pgP.click(96, 103);
    const poly = pgP.map.whiteboard[0];
    check('Build tool (f): with the polygon shape each click is a corner snapped to the lattice (the real snapVertex) and the band over the board holds a polyline through them and one circle per corner (numbers only, built by createElementNS); a click on the first corner closes it into ONE filled path with the piece\'s props, its points relative to its box, the band gone, one save, building still armed with the polygon',
        j(mid) === j([0, 3, 1, ['polyline', 'circle', 'circle', 'circle'], '100,100 200,100 200,200', 0]) && pgP.map.whiteboard.length === 1 && !!poly && poly.type === 'path' && poly.tip === 'fill' && j([poly.x, poly.y, poly.w, poly.h, poly.baseW, poly.baseH]) === j([100, 100, 100, 100, 100, 100]) && j(poly.pts) === j([[0, 0], [100, 0], [100, 100]])
        && poly.texture === 'flagstones' && poly.color === '#5a5663' && poly.layer === 'back' && poly.name === 'Floor' && pgP.b.poly === null && pgP.wb.children.length === 0 && pgP.rec.saves === 1 && pgP.rec.renders === 1 && pgP.b.armed === true && !!pgP.win.wpPlace && pgP.win.wpPlace.build.shape === 'poly' && !/innerHTML/.test(toolSrc), j([mid, poly]));
    pgP.click(303, 297); pgP.click(397, 304); const esc0 = [pgP.b.poly.length, pgP.wb.children.length];
    pgP.key('Escape');
    const escOut = [pgP.b.poly, pgP.wb.children.length, pgP.map.whiteboard.length, pgP.b.armed, pgP.win.wpPlace, pgP.rec.saves];
    pgP.arm(true); pgP.click(303, 297); pgP.click(397, 304); pgP.key('Enter'); const enter2 = pgP.map.whiteboard.length; pgP.click(403, 396); pgP.key('Enter', { tagName: 'INPUT' }); const enterTyping = pgP.map.whiteboard.length; pgP.key('Enter');
    check('Build tool (f): Esc with a polygon in progress clears its corners and its band, lays nothing and ends building (the placement gone, nothing saved); Enter closes a polygon of three corners like a click on the first, never one of two nor while typing in a box',
        j(esc0) === j([2, 1]) && j(escOut) === j([null, 0, 1, false, null, 1]) && enter2 === 1 && enterTyping === 1 && pgP.map.whiteboard.length === 2 && pgP.map.whiteboard[1].tip === 'fill' && j(pgP.map.whiteboard[1].pts) === j([[0, 0], [100, 0], [100, 100]]) && pgP.map.whiteboard[1].x === 300 && pgP.rec.saves === 2 && pgP.b.poly === null, j([esc0, escOut, enter2, enterTyping, pgP.map.whiteboard[1]]));
    // (g) the kept choices through their cleaners
    const bOf = pg => { const b = pg.b; return [b.mat, b.shape, b.tex, b.color, b.terrain, b.cover, b.sight, b.corridorW]; };
    const hostileStore = '{"mat":"wall","shape":"evil","tex":"url(x)","color":"red","terrain":99,"cover":"yes","sight":1,"corridorW":3,"evil":1,"__proto__":{"mat":"grass","tex":"grass","polluted":1}}';
    const pgL1 = mkPage({ store: { wp_build: hostileStore } }), pgL2 = mkPage({ store: { wp_build: '{"__proto__":{"mat":"grass"}}' } }), pgL3 = mkPage({ store: { wp_build: '{"mat":"constructor","shape":"poly"}' } }), pgL4 = mkPage({ store: { wp_build: 'garbage{' } }), pgL5 = mkPage({ store: { wp_build: '[1,2]' } });
    const pgL6 = mkPage({ store: { wp_build: j({ mat: 'water', shape: 'corridor', tex: '', color: '#123456', terrain: 3, cover: true, sight: true, corridorW: 2 }) } }), pgL7 = mkPage({ store: { wp_build: j({ mat: 'door', shape: 'line', tex: 'cobbles', color: '#ABCDEF', terrain: 2.6, cover: false, sight: false, corridorW: '2' }) } });
    const defaults = ['floor', 'rect', 'flagstones', '#5a5663', 0, false, false, 1];
    check('Build tool (g): buildLoad reads the kept choices (wp_build) through the cleaners at first use — a material by cleanMaterial, a shape from the five else rect, a texture by cleanTexture (an unknown one the material\'s own, "" kept as Plain colour), a colour only as #rrggbb else the material\'s, the terrain by fogcore cleanTerrain (99 reads 10, 2.6 reads 3) or 0, the ticks true only, the width 2 or 1; a __proto__ key, an unknown key or a prototype\'s name as the material sets nothing, so do garbage and a list',
        j(bOf(pgL1)) === j(['wall', 'rect', 'bricks', '#3f3b47', 10, false, false, 1]) && !('evil' in pgL1.b) && !('polluted' in pgL1.b) && pgL1.b.mat !== 'grass' && j(bOf(pgL2)) === j(defaults) && j(bOf(pgL3)) === j(defaults) && j(bOf(pgL4)) === j(defaults) && j(bOf(pgL5)) === j(defaults)
        && j(bOf(pgL6)) === j(['water', 'corridor', '', '#123456', 3, true, true, 2]) && j(bOf(pgL7)) === j(['door', 'line', 'cobbles', '#ABCDEF', 3, false, false, 1]) && Object.getPrototypeOf(pgL1.b) === Object.prototype, j([bOf(pgL1), bOf(pgL2), bOf(pgL6), bOf(pgL7)]));
    pgL1.b.poly = [{ x: 1, y: 1 }]; pgL1.b.armed = true; pgL1.saveB(); const saved = JSON.parse(pgL1.store.wp_build);
    check('Build tool (g): buildSave writes exactly the eight choices — mat, shape, tex, color, terrain, cover, sight, corridorW — never the polygon in progress, the armed flag or anything else',
        j(Object.keys(saved).sort()) === j(['color', 'corridorW', 'cover', 'mat', 'shape', 'sight', 'terrain', 'tex']) && j(saved) === j({ mat: 'wall', shape: 'rect', tex: 'bricks', color: '#3f3b47', terrain: 10, cover: false, sight: false, corridorW: 1 }), j(saved));
    // the menu: the chips, the Texture select, the Build button, the Wall chip's pen preset, another tool's button
    const pgM = mkPage(); pgM.sync();
    const chips = pgM.byId('buildMatRow').children, texSel = pgM.byId('buildTexture'), chipsAgain = (pgM.sync(), pgM.byId('buildMatRow').children.length);
    check('Build tool: the menu\'s material chips are built once by code — seven buttons in the palette\'s order, each a swatch of its material\'s texture over its colour (buildcore texStyle) titled with its name, the chosen one active, a second sync adding none; the Texture select\'s rows are "Plain colour" then the eight names as values with their capitalised text, its value the chosen texture; the count hint names the cap',
        chips.length === 7 && j(chips.map(c => c.dataset.mat)) === j(B.MATERIAL_IDS) && chips.every(c => c.style.backgroundColor === B.MATERIALS[c.dataset.mat].color && c.style.backgroundImage === B.texStyle(B.MATERIALS[c.dataset.mat].texture, 0, 0).image && c.title === B.MATERIALS[c.dataset.mat].name && c.type === 'button') && chips.filter(c => c.cls.has('active')).map(c => c.dataset.mat).join() === 'floor' && chipsAgain === 7
        && j(texSel.options.map(o => [o.value, o.textContent])) === j([['', 'Plain colour']].concat(B.TEXTURES.map(n => [n, n.charAt(0).toUpperCase() + n.slice(1)]))) && texSel.value === 'flagstones' && /^0 of 6000 pieces on this map\./.test(pgM.byId('buildHint').textContent), j([chips.map(c => c.dataset.mat), texSel.options.map(o => o.value), texSel.value]));
    const pgB = mkPage(); pgB.byId('buildBtn').fire('click');
    const b1 = [pgB.b.armed, pgB.byId('buildMenu').cls.has('show'), pgB.win.wpPlace && pgB.win.wpPlace.type, pgB.rec.toasts.length, pgB.byId('buildBtn').cls.has('active'), pgB.doc.body.cls.has('mode-build')];
    pgB.byId('buildMatRow').children[1].fire('click');   // the Wall chip: a wall is laid as a line, the pen with the wall preset
    const b2 = [pgB.b.mat, pgB.b.shape, j(pgB.win.wpPenPreset), pgB.win.wpPlace, pgB.byId('drawModeBtn').clicks, JSON.parse(pgB.store.wp_build).mat, pgB.b.armed];
    pgB.byId('buildSightChk').checked = false; pgB.byId('buildSightChk').fire('change'); const b2b = j(pgB.win.wpPenPreset);   // Blocks sight off: the preset loses its sight keys
    pgB.byId('buildBtn').fire('click');   // the palette is open: this click ends building
    const b3 = [pgB.b.armed, pgB.win.wpPenPreset, pgB.byId('buildMenu').cls.has('show'), pgB.byId('moveModeBtn').clicks, pgB.byId('buildBtn').cls.has('active'), pgB.doc.body.cls.has('mode-build')];
    const wallPre = B.penPreset('wall', { color: '#3f3b47' }), wallNoSight = Object.assign({}, wallPre); delete wallNoSight.blocksSight; delete wallNoSight.sightType;
    check('Build tool: the Build button arms building and opens the palette (the button lit, the body in build mode, a toast saying how); the Wall chip picks the wall and the Wall line shape — the pen takes the wall preset (window.wpPenPreset, buildcore penPreset), no placement — and keeps the choice on this machine; Blocks sight unticked takes the sight keys off the preset; the button again, with the palette open, ends building: the preset gone, the menu closed, the move tool back',
        j(b1) === j([true, true, 'build', 1, true, true]) && j(b2) === j(['wall', 'line', j(wallPre), null, 1, 'wall', true]) && b2b === j(wallNoSight) && j(b3) === j([false, null, false, 1, false, false]), j([b1, b2, b2b, b3]));
    const pgT = mkPage(); pgT.arm(true); const tbar = pgT.byId('wbFloatingToolbar'), tbBtn = id => ({ closest: sel => (sel === '.wb-tool-btn' ? { id, closest: () => null } : null) });
    tbar.fire('click', { target: tbBtn('measureModeBtn') }); const t1 = [pgT.b.armed, pgT.win.wpPlace];
    pgT.material('wall'); pgT.arm(true); tbar.fire('click', { target: tbBtn('drawModeBtn') }); const t2 = [pgT.b.armed, !!pgT.win.wpPenPreset]; tbar.fire('click', { target: tbBtn('buildBtn') }); const t2b = pgT.b.armed; tbar.fire('click', { target: tbBtn('fillModeBtn') }); const t3 = [pgT.b.armed, pgT.win.wpPenPreset];
    check('Build tool: another tool\'s button on the toolbar ends building (the placement gone); while a Wall line is armed the pen\'s own button leaves it on (it only opens the pen menu), the Build button is its own, and another tool still ends it and takes the preset away',
        j(t1) === j([false, null]) && j(t2) === j([true, true]) && t2b === true && j(t3) === j([false, null]), j([t1, t2, t2b, t3]));
    const pgS = mkPage(); pgS.shapeBtns[2].fire('click'); const sh1 = [pgS.b.shape, pgS.b.armed, pgS.win.wpPlace && pgS.win.wpPlace.build.shape, JSON.parse(pgS.store.wp_build).shape];
    pgS.byId('buildTexture').value = 'url(x)'; pgS.byId('buildTexture').fire('change'); const tx1 = pgS.b.tex; pgS.byId('buildTexture').value = 'grass'; pgS.byId('buildTexture').fire('change'); const tx2 = [pgS.b.tex, pgS.win.wpPlace.props.texture]; pgS.byId('buildTexture').value = ''; pgS.byId('buildTexture').fire('change'); const tx3 = [pgS.b.tex, 'texture' in pgS.win.wpPlace.props];
    pgS.byId('buildColorInput').value = 'red'; pgS.byId('buildColorInput').fire('input'); const c1 = pgS.b.color; pgS.byId('buildColorInput').value = '#123456'; pgS.byId('buildColorInput').fire('input'); const c2 = [pgS.b.color, pgS.win.wpPlace.props.color];
    pgS.byId('buildTerrainChk').checked = true; pgS.byId('buildTerrainCost').value = '99'; pgS.byId('buildTerrainCost').fire('change'); const tr1 = [pgS.b.terrain, pgS.byId('buildTerrainCost').value, pgS.win.wpPlace.props.terrain]; pgS.byId('buildTerrainChk').checked = false; pgS.byId('buildTerrainChk').fire('change'); const tr2 = [pgS.b.terrain, 'terrain' in pgS.win.wpPlace.props];
    pgS.byId('buildCoverChk').checked = true; pgS.byId('buildCoverChk').fire('change'); const cv1 = [pgS.b.cover, pgS.win.wpPlace.props.cover]; pgS.byId('buildCorridorW').value = '2'; pgS.byId('buildCorridorW').fire('change'); const cw = [pgS.b.corridorW, pgS.win.wpPlace.build.corridorW];
    check('Build tool: the menu\'s controls set the choices through the cleaners and re-arm with them — a shape button (the polygon) arms that shape and keeps it; the Texture select takes a known name onto the armed props, an unknown one is ignored, Plain colour leaves the key out; the colour input only a #rrggbb; the terrain tick and cost (99 reads 10) go on as terrain and come off; the cover tick as cover yes; the corridor width 2',
        j(sh1) === j(['poly', true, 'poly', 'poly']) && tx1 === 'flagstones' && j(tx2) === j(['grass', 'grass']) && j(tx3) === j(['', false]) && c1 === '#5a5663' && j(c2) === j(['#123456', '#123456']) && j(tr1) === j([10, 10, 10]) && j(tr2) === j([0, false]) && j(cv1) === j([true, 'yes']) && j(cw) === j([2, 2]), j([sh1, tx1, tx2, tx3, c1, c2, tr1, tr2, cv1, cw]));

    /* ---- the pen's Wall line: datamap.js sliced by its penpreset markers and run for real; its snap sites and the seating of a moved tile pinned ---- */
    const ppSrc = cutM(dmSrc, 'penpreset', 'datamap.js');
    const penRun = (item, win) => { new Function('item', 'window', "'use strict';" + NL + ppSrc)(item, win); return item; };
    const strokeBase = () => ({ id: 'wb1', type: 'path', x: 0, y: 0, w: 100, h: 10, baseW: 100, baseH: 10, z: 10, pts: [[0, 0], [100, 0]], color: '#e9e9f0', strokeWidth: 3, tip: 'round' });
    const gmOn = { wpCanPersistLocal: () => true }, withPre = (pp, extra) => Object.assign({ wpPenPreset: pp }, gmOn, extra || {});
    const gmWall = penRun(strokeBase(), withPre(B.penPreset('wall'))), gmDoor = penRun(strokeBase(), withPre(B.penPreset('door', { color: '#123456' })));
    const openPre = B.penPreset('wall'); delete openPre.blocksSight; delete openPre.sightType; const gmOpen = penRun(strokeBase(), withPre(openPre));
    const oddPre = Object.assign(B.penPreset('wall'), { sightType: 'portcullis' }), gmOdd = penRun(strokeBase(), withPre(oddPre)), yesPre = Object.assign(B.penPreset('wall'), { blocksSight: 'yes' }), gmYes = penRun(strokeBase(), withPre(yesPre));
    const playerBase = () => Object.assign(strokeBase(), { ownerId: 'u_a', byPlayer: true }), plWall = penRun(playerBase(), withPre(B.penPreset('wall')));
    const noPre = penRun(strokeBase(), withPre(null)), noPre2 = penRun(strokeBase(), gmOn), clientWall = penRun(strokeBase(), { wpPenPreset: B.penPreset('wall'), wpCanPersistLocal: () => false }), noGate = penRun(strokeBase(), { wpPenPreset: B.penPreset('wall') });
    check('the pen\'s Wall line (datamap.js penpreset, run for real): the GM\'s stroke takes the preset\'s strokeWidth, tip, colour, layer and name and blocks sight as a wall — or a door when the preset says so, never another word; a preset without blocksSight (Blocks sight unticked, or one that is not true) adds no sight keys; a player\'s stroke takes nothing whatever their window holds; no preset, a client or no persist gate leaves the stroke untouched',
        j(gmWall) === j(Object.assign(strokeBase(), { strokeWidth: 6, tip: 'square', color: '#3f3b47', layer: 'back-mid', name: 'Wall', blocksSight: true, sightType: 'wall' })) && j(gmDoor) === j(Object.assign(strokeBase(), { strokeWidth: 6, tip: 'square', color: '#123456', layer: 'back-mid', name: 'Door', blocksSight: true, sightType: 'door' }))
        && j(gmOpen) === j(Object.assign(strokeBase(), { strokeWidth: 6, tip: 'square', color: '#3f3b47', layer: 'back-mid', name: 'Wall' })) && gmOdd.sightType === 'wall' && gmOdd.blocksSight === true && !('blocksSight' in gmYes) && !('sightType' in gmYes) && gmYes.name === 'Wall'
        && j(plWall) === j(playerBase()) && j(noPre) === j(strokeBase()) && j(noPre2) === j(strokeBase()) && j(clientWall) === j(strokeBase()) && j(noGate) === j(strokeBase()), j([gmWall, gmDoor, gmOpen, plWall]));
    const snapA = dmSrc.indexOf('  function snapLattice(x, y) {'), snapB = dmSrc.indexOf(NL + '  }' + NL, dmSrc.indexOf('  function texSeatEl(el, x, y) {'));
    if (snapA < 0 || snapB < snapA) throw new Error('buildcheck: snapLattice .. texSeatEl not found in datamap.js');
    const snapSrc = dmSrc.slice(snapA, snapB + 5);
    const mkSnap = (st, win) => { const asked = []; const api = new Function('state', 'window', 'snapToHex', 'getSnapCoords', "'use strict';" + NL + snapSrc + NL + 'return { snapLattice: snapLattice, penSnap: penSnap, penSnapOn: penSnapOn, texSeatEl: texSeatEl };')(st, win, snapToHex, (x, y) => { asked.push([x, y]); return { x: x + 1000, y: y + 1000 }; }); api.asked = asked; return api; };
    const pre = { wpPenPreset: B.penPreset('wall'), wpBuildCore: B }, noP = { wpPenPreset: null, wpBuildCore: B };
    const sHexP = mkSnap({ gridType: 'hex', snap: false }, pre), sSqP = mkSnap({ gridType: 'square', snap: false }, pre), sOffP = mkSnap({ gridType: 'off', snap: true }, pre), sHexN = mkSnap({ gridType: 'hex', snap: true }, noP), sNone = mkSnap({ gridType: 'hex', snap: false }, noP);
    const vtx = snapToHex(62, 25, 30, 'vertex');
    check('penSnap / penSnapOn (datamap.js, run for real): with a Wall line armed the pen rides the lattice whatever Snap says — a hex map\'s vertices (the app\'s own snapToHex, vertex mode), a square map\'s corners every 50 — and the walk along grid lines is on; with no grid, or with no preset, the pen snaps as Snap says (getSnapCoords)',
        j(sHexP.penSnap(62, 25)) === j({ x: vtx.x, y: vtx.y }) && sHexP.asked.length === 0 && sHexP.penSnapOn() === true && j(sSqP.penSnap(62, 25)) === j({ x: 50, y: 50 }) && j(sSqP.penSnap(-24, 76)) === j({ x: 0, y: 100 }) && sSqP.penSnapOn() === true
        && j(sOffP.penSnap(62, 25)) === j({ x: 1062, y: 1025 }) && j(sOffP.asked) === j([[62, 25]]) && j(sHexN.penSnap(62, 25)) === j({ x: 1062, y: 1025 }) && sHexN.penSnapOn() === true && j(sNone.penSnap(62, 25)) === j({ x: 1062, y: 1025 }) && sNone.penSnapOn() === false, j([sHexP.penSnap(62, 25), vtx, sSqP.penSnap(62, 25)]));
    const boxEl = { dataset: { tex: 'bricks' }, style: {} }, plainEl = { dataset: {}, style: {}, querySelector: () => null };
    const patEl = { attrs: { width: '50', height: '48', x: '0', y: '0' }, setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k]; } }, svgEl = { dataset: { texId: 'wptex3', texKey: 'ripples|0|0|100|100|100|100|#fff' }, querySelector: sel => (sel === ':scope > defs > pattern' ? patEl : null) };
    const pathEl = { dataset: { type: 'path' }, style: {}, querySelector: sel => (sel === ':scope > svg' ? svgEl : null) }, bareSvg = { dataset: {}, querySelector: () => null }, pathNoTex = { dataset: { type: 'path' }, style: {}, querySelector: () => bareSvg };
    sNone.texSeatEl(boxEl, 130, -20); sNone.texSeatEl(plainEl, 130, 70); sNone.texSeatEl(pathEl, 130, 70); sNone.texSeatEl(pathNoTex, 130, 70); sNone.texSeatEl(null, 1, 1); sNone.texSeatEl({}, 1, 1);
    const noCoreEl = { dataset: { tex: 'bricks' }, style: {} }; mkSnap({ gridType: 'off' }, {}).texSeatEl(noCoreEl, 130, 70);
    check('texSeatEl (datamap.js, run for real): a moving textured box keeps its tile on the board\'s lattice (backgroundPosition by buildcore texPos, never positive); a moving filled region\'s svg pattern takes the place in tile units (x and y the negative mod of the tile\'s width and height) and its key is cleared so the next full render rebuilds it; a plain element, a path with no pattern, nothing or no core change nothing',
        boxEl.style.backgroundPosition === '-30px -30px' && boxEl.style.backgroundPosition === B.texPos(130, -20, 'bricks') && j(plainEl.style) === '{}' && patEl.attrs.x === '-30' && patEl.attrs.y === '-22' && svgEl.dataset.texKey === '' && svgEl.dataset.texId === 'wptex3' && j(pathEl.style) === '{}' && j(pathNoTex.style) === '{}' && j(bareSvg.dataset) === '{}' && j(noCoreEl.style) === '{}', j([boxEl.style, patEl.attrs, svgEl.dataset]));
    check('the pen\'s four snap sites call penSnap / penSnapOn (never getSnapCoords or state.snap alone): the press and the move snap through penSnap, the repeat-point gate and the walk along grid lines through penSnapOn; the preview strokes with the preset\'s tip, colour and width; a wall line laid has the fog work vision out at once',
        (dmSrc.match(/var snapped = penSnap\(mouseX, mouseY\);/g) || []).length === 2 && !/var snapped = getSnapCoords\(mouseX, mouseY\);/.test(dmSrc) && /if \(typeof state !== 'undefined' && penSnapOn\(\)\) \{\n\s*if \(drawPoints\.length > 0 && drawPoints\[drawPoints\.length-1\]\[0\] === mouseX/.test(dmSrc) && !/typeof state !== 'undefined' && state\.snap\) \{\n\s*if \(drawPoints/.test(dmSrc)
        && /if \(penSnapOn\(\) && state\.gridType && state\.gridType !== 'off' && drawPoints\.length\) \{/.test(dmSrc) && !/if \(state\.snap && state\.gridType && state\.gridType !== 'off' && drawPoints\.length\)/.test(dmSrc)
        && /function penSnap\(x, y\) \{ return window\.wpPenPreset \? snapLattice\(x, y\) : getSnapCoords\(x, y\); \}/.test(dmSrc) && /function penSnapOn\(\) \{ return !!\(state\.snap \|\| window\.wpPenPreset\); \}/.test(dmSrc)
        && /var _PPd = window\.wpPenPreset, _dtip = _PPd \? _PPd\.tip : state\.drawTip;[^\n]*\n\s*var _dcol = _PPd \? _PPd\.color : \(state\.drawColor \|\| 'var\(--ink\)'\);\n\s*var _dw = _PPd \? _PPd\.strokeWidth : \(state\.drawStrokeWidth \|\| 3\);/.test(dmSrc)
        && /save\(!!\(window\.wpNet && window\.wpNet\.active && window\.wpNet\.role === 'client'\)\); render\(\);[^\n]*\n\s*if \(item\.blocksSight && window\.wpFog && window\.wpFog\.invalidateVision\) \{ window\.wpFog\.invalidateVision\(\); window\.wpFog\.redraw\(\); \}/.test(dmSrc));
    check('texSeatEl runs in the live-drag loop (after each piece\'s left and top are set) and once more after the release, where the drop snapped the pieces, before the save',
        /mEl\.style\.top = m\.item\.y \+ 'px';\n\s*texSeatEl\(mEl, m\.item\.x, m\.item\.y\);/.test(dmSrc) && /multiDrag\.forEach\(function\(md\) \{ texSeatEl\(md\.el \|\| state\.wbEls\[md\.item\.id\], md\.item\.x, md\.item\.y\); \}\);[^\n]*\n\s*save\(\);/.test(dmSrc) && (dmSrc.match(/texSeatEl\(/g) || []).length === 3);

    summed = true;
    console.log(NL + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exit(1);
})().catch(function(e) { console.log('FAIL      the suite threw: ' + (e && e.stack || e)); process.exit(1); });

/* Offline check of a map's compass (1.6.2, backlog 82; the owner, 2026-11-06, by prompt: everyone sees it and the GM can leave a map without
   one, north set by dragging or in degrees, it stands at a corner or on the map, and three things read it, each a tick of the GM's and the
   words a viewer's own to hide; the rose D of docs/sheets/compass-sheet.html): compasscore.js imported and run (the cleaner, the way a bearing
   points, the rose on a recording canvas), compass.js's page slice run on stand-ins of the page, and the wiring pinned (the Measure options'
   Compass part, Settings, the redraw, the card, the ruler, the map's picture, the cleaners on the way in, Help and both release notes).
   Usage: node tools/compasscheck.js (exit 1 on failure) */
'use strict';
const path = require('path'), fs = require('fs');
const NL = String.fromCharCode(10), root = path.join(__dirname, '..'), app = path.join(root, 'system', 'app');
const read = f => fs.readFileSync(path.join(app, f), 'utf8').replace(/\r\n/g, NL);
const url = f => 'file:///' + path.resolve(path.join(app, 'scripts', f)).replace(/[\\]/g, '/');
let pass = 0, fail = 0;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok       ', name); } else { fail++; console.log('FAIL     ', name, detail !== undefined ? '-> ' + String(detail).slice(0, 400) : ''); } }
const J = JSON.stringify;
let summed = false;
process.on('exit', code => { if (!summed && !code) { console.log(NL + 'FAIL      the asynchronous checks never finished'); process.exitCode = 1; } });
(async () => {
    const C = await import(url('compasscore.js'));
    // the cleaner
    const cl = [{}, { north: 450 }, { north: -90 }, { north: 0.6 }, { north: 'x' }, { at: 'bl' }, { at: 'map', x: 120.4, y: -40 }, { at: 'map' }, { at: 'map', x: 2e6, y: 0 }, { at: 'br' }, { at: '__proto__' }, { face: true, ruler: 'yes', pic: 1 }, null, 'x', []].map(C.cleanCompass);
    check('a map\'s compass as it is kept: north in whole degrees turned to 0 to 359 and written only where it is not up, a corner other than the bottom right, a place on the map only with both its numbers inside the bounds (else the bottom right), each reader\'s tick only as true; none for what is no object',
        J(cl) === J([{}, { north: 90 }, { north: 270 }, { north: 1 }, {}, { at: 'bl' }, { at: 'map', x: 120, y: -40 }, {}, {}, {}, {}, { face: true }, null, null, null]), J(cl));
    check('... the compass of a map\'s meta, cleaned, or none', J(C.compassOf({ meta: { compass: { north: 10, junk: 1 } } })) === J({ north: 10 }) && C.compassOf({ meta: {} }) === null && C.compassOf(null) === null);
    // the way
    const ways = [0, 44, 46, 90, 180, 270, 315, 359].map(d => C.wayOf({}, d)), turned = [0, 90, 180].map(d => C.wayOf({ north: 72 }, d));
    check('the way a bearing points by the compass: one of eight words, north up by default, the compass\'s north turning them; nothing with no compass or no bearing',
        J(ways) === J(['north', 'north-east', 'north-east', 'east', 'south', 'west', 'north-west', 'north']) && J(turned) === J(['west', 'north', 'east']) && C.wayOf(null, 10) === '' && C.wayOf({}, NaN) === '' && C.WAYS.length === 8 && Object.isFrozen(C.WAYS), J([ways, turned]));
    check('... the bearing from one point to another, clockwise from straight up, none for one point; north from where the pointer stands against the rose\'s middle',
        C.bearing(0, 0, 0, -5) === 0 && C.bearing(0, 0, 5, 0) === 90 && C.bearing(0, 0, 0, 5) === 180 && C.bearing(0, 0, -5, 0) === 270 && C.bearing(1, 1, 1, 1) === null && C.northAt(10, 10, 20, 10) === 90 && C.northAt(10, 10, 10, 10) === null);
    check('... a reader is on only where the map\'s own tick is, and the words only where the viewer has not hidden them; the picture whatever the viewer\'s words say',
        C.reads({ face: true }, 'face', true) === true && C.reads({ face: true }, 'face', false) === false && C.reads({}, 'face', true) === false && C.reads({ pic: true }, 'pic', false) === true && C.reads(null, 'pic', true) === false);
    // the rose
    const calls = [], ctx = new Proxy({}, { get(t, k) { if (k in t) return t[k]; return (...a) => { calls.push([k].concat(a)); }; }, set(t, k, v) { calls.push(['=' + String(k), v]); return true; } });
    const drew = C.roseDraw(ctx, 100, 50, 128, 90), names = calls.filter(c => c[0] === 'fillText').map(c => c[1]);
    check('the rose drawn on a canvas, as passed (D: eight points with N, E, S and W): moved to its middle, turned by north, scaled from its 64 by 64 box, the disc, two lines, four points (north gold) and the four letters; nothing for a size that is none',
        drew === true && J(calls.slice(0, 4)) === J([['save'], ['translate', 100, 50], ['rotate', Math.PI / 2], ['scale', 2, 2]]) && J(names) === J(['N', 'S', 'W', 'E']) && calls.filter(c => c[0] === 'fill').length === 4 + 1 + 1 && calls.some(c => c[0] === '=fillStyle' && c[1] === '#e3a23b') && calls[calls.length - 1][0] === 'restore'
            && C.roseDraw(ctx, 0, 0, 0, 0) === false && C.roseDraw(null, 0, 0, 10, 0) === false && C.ROSE.filter(p => p.k === 'n' || p.k === 'o').map(p => p.t).join('') === 'NSWE', J(calls.slice(0, 6)));
    // the page's half, sliced and run on stand-ins
    const src = read('scripts/compass.js'), slice = src.slice(src.indexOf('// [compasscheck:page-start]'), src.indexOf('// [compasscheck:page-end]'));
    let map = { id: 'm1', meta: { compass: { north: 72, face: true, ruler: true } } }, store = {};
    const ls = { getItem: k => Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null, setItem: (k, v) => { store[k] = String(v); } };
    const P = new Function('getActiveMap', 'state', 'compassOf', 'cleanCompass', 'wayOf', 'bearing', 'reads', 'northAt', 'ROSE', 'INK', 'localStorage', 'document', 'window', 'save', 'getActiveCampaign',
        slice + '\nreturn { faceWords, rulerWay, wordsOn, gmHere };')(() => map, { viewMode: 'play', streamMode: false }, C.compassOf, C.cleanCompass, C.wayOf, C.bearing, C.reads, C.northAt, C.ROSE, C.INK, ls, {}, { wpNet: null }, () => {}, () => null);
    const f1 = P.faceWords({ isChar: true, rot: 90, front: 0 }), r1 = P.rulerWay(0, 10, 0, 0); store.wp_compassWords = 'off'; const f2 = P.faceWords({ isChar: true, rot: 90 }), r2 = P.rulerWay(0, 10, 0, 0); delete store.wp_compassWords;
    const f3 = P.faceWords({ isChar: false, rot: 90 }); map = { id: 'm2', meta: {} }; const f4 = P.faceWords({ isChar: true }), r4 = P.rulerWay(0, 10, 0, 0);
    map = { id: 'm3', meta: { compass: { north: 0 } } }; const f5 = P.faceWords({ isChar: true }), r5 = P.rulerWay(0, 10, 0, 0);
    check('the card says the way a token faces (its turn and its arrow\'s side together) and the ruler the way it points, by the map\'s compass; neither with the viewer\'s words hidden, for a piece that is no token, on a map with no compass, or with the map\'s own tick off',
        f1 === 'Faces north' && r1 === ' west' && f2 === '' && r2 === '' && f3 === '' && f4 === '' && r4 === '' && f5 === '' && r5 === '' && P.wordsOn() === true && P.gmHere() === true, J([f1, r1, f2, r2, f3, f4, r4, f5, r5]));
    const P2 = new Function('getActiveMap', 'state', 'compassOf', 'cleanCompass', 'wayOf', 'bearing', 'reads', 'northAt', 'ROSE', 'INK', 'localStorage', 'document', 'window', 'save', 'getActiveCampaign', slice + '\nreturn { gmHere };');
    check('... the rose is the GM\'s to turn and move, never on a player\'s app or in the stream window',
        P2(() => map, { streamMode: false }, C.compassOf, C.cleanCompass, C.wayOf, C.bearing, C.reads, C.northAt, C.ROSE, C.INK, ls, {}, { wpNet: { foreign: true } }, () => {}, () => null).gmHere() === false
        && P2(() => map, { streamMode: true }, C.compassOf, C.cleanCompass, C.wayOf, C.bearing, C.reads, C.northAt, C.ROSE, C.INK, ls, {}, { wpNet: null }, () => {}, () => null).gmHere() === false);
    // the wiring
    const ix = read('index.html'), wb = read('scripts/whiteboard.js'), mn = read('scripts/main.js'), ms = read('scripts/mapshot.js'), cu = read('scripts/cleanup.js'), st = read('scripts/settings.js'), css = read('style.css');
    const nt = fs.readFileSync(path.join(app, 'scripts', 'net.js'), 'latin1');
    check('the Measure options have a Compass part, the GM\'s: A compass on this map, North at, Stands with its three places, and the three ticks; the module loaded after the trackers\'',
        ix.includes('<div class="gm-only" id="measureCompass" hidden>') && ix.includes('<input type="checkbox" id="compassOn"> A compass on this map') && ix.includes('id="compassNorth" min="0" max="359"') && ix.includes('<option value="br">Bottom right</option><option value="bl">Bottom left</option><option value="map">On the map</option>')
        && ['compass_face', 'compass_ruler', 'compass_pic'].every(id => ix.split('id="' + id + '"').length === 2) && ix.includes('<script type="module" src="scripts/trackers.js"></script>\n<script type="module" src="scripts/compass.js"></script>'));
    check('... drawn at every redraw, the card\'s line, the ruler\'s way after its distance, the options following the map, and the rose in the map\'s picture where its tick is on, by the core\'s own drawing',
        mn.includes("if (window.wpCompass && typeof window.wpCompass.sync === 'function') window.wpCompass.sync();") && wb.includes("var cpF = window.wpCompass && typeof window.wpCompass.faceWords === 'function' ? window.wpCompass.faceWords(item) : ''; if (cpF) out.push(cpF);")
        && wb.includes("measureLabel(dist, diagCells(m)) + esc(cpW)") && wb.includes("if (window.wpCompass && typeof window.wpCompass.menuSync === 'function') window.wpCompass.menuSync();") && ms.includes("if (cps && cps.pic === true && typeof CPs.roseDraw === 'function')"));
    check('... a file\'s compass cleaned by the core on Replace and Merge, none without it; a player\'s app cleaning a host\'s again; the GM\'s screen hearing a press on the rose first; Settings\' switch kept on this computer alone',
        cu.includes("if (it.type === 'map' && isObj(it.meta) && it.meta.compass !== undefined) { var CPd = deps && deps.CP && typeof deps.CP.cleanCompass === 'function' ? deps.CP : null") && mn.includes('CP: window.wpCompassCore')
        && nt.includes("if (m.meta && typeof m.meta === 'object' && m.meta.compass !== undefined) { var CPh = window.wpCompassCore") && src.includes("window.addEventListener('pointerdown', pressFirst, true);") && st.includes("localStorage.setItem('wp_compassWords', _cwSel.value === 'off' ? 'off' : 'on')")
        && ix.includes('<span class="set-name"><span>Compass words on my screen</span>') && css.includes('#compassRose.compass-br { right: 26px; bottom: 20px; }'));
    const wn = ['WHATSNEW.txt', 'system/app/assets/whatsnew.txt'].map(f => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, NL));
    check('Help says it in plain words, and both release notes alike',
        ix.includes('<li><b>Compass</b>, in the measure options, puts a compass on the map.') && ix.includes('Anyone can hide the words on their own screen with <b>Compass words on my screen</b> in Settings.') && wn.every(w => w.includes('- A map can have a compass. Put it on in the measure options, drag the rose')));
    summed = true;
    console.log(NL + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exit(1);
})();

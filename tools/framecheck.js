/* Offline check of the token creator's pure core (system/app/scripts/framecore.js): the square a picture is framed to — the middle by
   default (the old automatic centre crop), always inside the picture, zoomed about a point, moved by a drag — the saved size, the format a
   picture is encoded in, the outline guide the grid gives, and a stored framing cleaned. Usage: node tools/framecheck.js (exit 1 on failure) */
'use strict';
const path = require('path'), fs = require('fs');
const NL = String.fromCharCode(10);
const app = path.join(__dirname, '..', 'system', 'app');
const url = f => 'file:///' + path.resolve(path.join(app, 'scripts', f)).replace(/[\\]/g, '/');
let pass = 0, fail = 0;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok       ', name); } else { fail++; console.log('FAIL     ', name, detail !== undefined ? '-> ' + String(detail).slice(0, 300) : ''); } }
const j = v => JSON.stringify(v);
let summed = false;   // a check that never settles would let Node exit with no summary and code 0: that is a failure
process.on('exit', code => { if (!summed && !code) { console.log('\nFAIL      the asynchronous checks never finished (a promise was left waiting)'); process.exitCode = 1; } });
(async () => {
    let F = null, err = null;
    try { F = await import(url('framecore.js')); } catch (e) { err = e; }
    check('framecore loads in Node with no window', !!F && !err, err && err.message);
    if (!F) { summed = true; console.log(NL + pass + ' passed, ' + fail + ' failed.'); process.exit(1); }
    const within = (r, w, h) => r.x >= 0 && r.y >= 0 && r.x + r.s <= w + 1e-9 && r.y + r.s <= h + 1e-9;
    check('the default square is the middle of the picture, its whole short side — exactly the old centre crop (wide, tall, square)',
        j(F.defaultRect(400, 200)) === j({ x: 100, y: 0, s: 200 }) && j(F.defaultRect(200, 300)) === j({ x: 0, y: 50, s: 200 }) && j(F.defaultRect(96, 96)) === j({ x: 0, y: 0, s: 96 }) && j(F.defaultRect(101, 50)) === j({ x: 25.5, y: 0, s: 50 }));
    const c1 = F.clampRect({ x: -50, y: 900, s: 5000 }, 400, 200), c2 = F.clampRect({ x: 390, y: 10, s: 1 }, 400, 200), c3 = F.clampRect({ x: 'a', y: NaN, s: Infinity }, 400, 200), c4 = F.clampRect(null, 400, 200), c5 = F.clampRect({ x: 0, y: 0, s: 10 }, 0, 0);
    check('the square always stays inside the picture, no larger than its short side, no smaller than the least square (32 px, or an eighth of a large picture); anything that is not a number is the middle; a picture of no size gives nothing',
        j(c1) === j({ x: 0, y: 0, s: 200 }) && c2.s === 32 && within(c2, 400, 200) && c2.x === 368 && j(c3) === j({ x: 100, y: 0, s: 200 }) && j(c4) === j({ x: 100, y: 0, s: 200 }) && j(c5) === j({ x: 0, y: 0, s: 0 })
        && F.minSide(4000, 3000) === 375 && F.minSide(100, 100) === 32 && F.minSide(20, 20) === 20
        && j(F.clampRect({ x: NaN, y: NaN, s: 100 }, 400, 200)) === j({ x: 150, y: 50, s: 100 }), j([c1, c2, c3, c4]));   // a size with no place: the middle of that square
    const base = F.defaultRect(1000, 800), z1 = F.zoomAt(base, 2, 300, 300, 1000, 800), z2 = F.zoomAt(base, 2, NaN, NaN, 1000, 800), z3 = F.zoomAt(z1, 100, 300, 300, 1000, 800), z4 = F.zoomAt(z1, 0.001, 300, 300, 1000, 800), z5 = F.zoomAt(base, 0, 1, 1, 1000, 800);
    check('zooming about a point keeps that point where it is (its place in the square unchanged), about the middle when no point is given; never past the least square nor out past the whole short side; a zoom of nothing changes nothing',
        z1.s === 400 && Math.abs((300 - z1.x) / z1.s - (300 - base.x) / base.s) < 1e-9 && Math.abs((300 - z1.y) / z1.s - (300 - base.y) / base.s) < 1e-9 && within(z1, 1000, 800)
        && z2.s === 400 && z2.x + z2.s / 2 === 500 && z2.y + z2.s / 2 === 400 && z3.s === F.minSide(1000, 800) && z4.s === 800 && within(z4, 1000, 800) && j(z5) === j(base), j([z1, z2, z3, z4]));
    const p1 = F.panBy(z1, 50, -20, 1000, 800), p2 = F.panBy(z1, -5000, 5000, 1000, 800), p3 = F.panBy(z1, 'x', null, 1000, 800);
    check('a drag moves the square by picture pixels and stops at the picture\'s edges; a move that is not a number moves nothing',
        p1.x === z1.x + 50 && p1.y === z1.y - 20 && p1.s === z1.s && p2.x === 0 && p2.y === 800 - z1.s && j(p3) === j(z1), j([p1, p2]));
    const sz = F.setZoom(base, 4, 1000, 800);
    check('the zoom a square stands for (1 = the whole short side) and the slider: a zoom about the square\'s own middle, kept inside',
        F.zoomOf(base, 1000, 800) === 1 && F.zoomOf(z1, 1000, 800) === 2 && sz.s === 200 && sz.x + 100 === 500 && sz.y + 100 === 400 && j(F.setZoom(base, -1, 1000, 800)) === j(base) && F.zoomOf(F.setZoom(base, 100, 1000, 800), 1000, 800) === 800 / F.minSide(1000, 800));
    check('the saved side is the chosen square\'s own pixels, at most the cap (96 for a profile, 256 for a picture) — never enlarged; a nonsense cap is 256',
        F.outSide(800, 96) === 96 && F.outSide(50, 96) === 50 && F.outSide(300, 256) === 256 && F.outSide(0.2, 96) === 1 && F.outSide(900, 'x') === 256 && F.outSide(NaN, 96) === 1);
    const png = 'data:image/png;base64,AAAA', big = 'data:image/png;base64,' + 'A'.repeat(500);
    check('the encoded picture: the first candidate that really is its type (a browser that cannot write WebP answers PNG) and fits within the limit — else nothing; the order PNG, WebP, JPEG on a filled background',
        F.firstFit([{ type: 'image/png', data: png }], 100) === png && F.firstFit([{ type: 'image/png', data: big }, { type: 'image/webp', data: 'data:image/png;base64,BB' }, { type: 'image/jpeg', data: 'data:image/jpeg;base64,CC' }], 100) === 'data:image/jpeg;base64,CC'
        && F.firstFit([{ type: 'image/png', data: big }], 100) === '' && F.firstFit([null, { type: 'image/png' }, 5], 100) === '' && F.firstFit([{ type: 'image/png', data: png }]) === png
        && j(F.ENCODE.map(e => [e.type, e.q || 0, !!e.fill])) === j([['image/png', 0, false], ['image/webp', 0.9, false], ['image/jpeg', 0.85, true]]) && Object.isFrozen(F.ENCODE) && F.ENCODE.every(e => Object.isFrozen(e)));
    const gh = F.guidePath('hexagon', 60, 52), gs = F.guidePath('rect', 50, 50), gc = F.guidePath('circle', 60, 52), gx = F.guidePath('nope', 'a', -1);
    check('the outline guide over the square (a 100 x 100 box): what a token box shows of a square picture (a wide 60x52 box: a centred band) cut to the grid\'s shape — the hexagon\'s six points, the square\'s whole box, the circle as two arcs; anything else a plain box (a size that is not one: the 60x52 cell)',
        gh === 'M25 6.67L75 6.67L100 50L75 93.33L25 93.33L0 50Z' && gs === 'M0 0H100V100H0Z' && /^M0 50A50 43\.33 0 1 0 100 50A50 43\.33 0 1 0 0 50Z$/.test(gc) && gx === 'M0 6.67H100V93.33H0Z'
        && F.guidePath('rect', 52, 60) === 'M6.67 0H93.33V100H6.67Z' && F.guidePath('hexagon', 52, 60) === 'M28.33 0L71.67 0L93.33 50L71.67 100L28.33 100L6.67 50Z', j([gh, gs, gc, gx]));   // a tall box: a centred upright band
    const css = fs.readFileSync(path.join(app, 'style.css'), 'utf8');
    check('the guide\'s hexagon is the grid\'s own (the same points the map cuts a picture token to)', /\.wb-item\.image\.tok-pic-hexagon > img \{ clip-path: polygon\(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%\); \}/.test(css));
    check('the stage stays square on a short window (it never shrinks in the column; a short window scrolls the box instead), so the preview is what OK saves',
        /\.frame-stage \{ position: relative; flex: none; align-self: center; width: min\(100%, max\(160px, calc\(94vh - 250px\)\)\); aspect-ratio: 1 \/ 1;/.test(css) && /\.frame-box \{[^}]*max-height: 94vh; overflow: auto;/.test(css));
    check('a stored framing is cleaned against the picture: numbers only, kept inside it; anything else is nothing',
        j(F.cleanRect({ x: 10, y: 20, s: 100 }, 400, 200)) === j({ x: 10, y: 20, s: 100 }) && j(F.cleanRect({ x: 390, y: 150, s: 100 }, 400, 200)) === j({ x: 300, y: 100, s: 100 }) && F.cleanRect({ x: '1', y: 2, s: 3 }, 400, 200) === null
        && F.cleanRect({ x: 1, y: 2 }, 400, 200) === null && F.cleanRect(null, 400, 200) === null && F.cleanRect({ x: 1, y: 2, s: 3 }, 0, 200) === null && F.cleanRect({ x: 1, y: 2, s: Infinity }, 400, 200) === null);
    const wf = F.wheelFactor, near = (a, b) => Math.abs(a - b) < 1e-9;
    check('the wheel zooms by how far it moves: a mouse notch (100 px) about 10% either way, a touchpad\'s small step a little, lines and pages counted in pixels, never past a notch an event; a sideways scroll (no vertical move) or nonsense zooms nothing',
        near(wf(100, 0), Math.exp(-0.1)) && near(wf(-100, 0), Math.exp(0.1)) && wf(-100, 0) > 1.1 && wf(-100, 0) < 1.11 && near(wf(-4, 0), Math.exp(0.004)) && near(wf(3, 1), Math.exp(-0.048)) && near(wf(1, 2), Math.exp(-0.1)) && near(wf(-5000, 0), Math.exp(0.1))
        && wf(0, 0) === 1 && wf(NaN, 0) === 1 && wf('100', 0) === 1 && wf(undefined) === 1);

    /* ---- The creator itself (framer.js, run for real on a stubbed page): the encoding it picks, its limits, its keys and guards, its outline chips ---- */
    const frS = fs.readFileSync(path.join(app, 'scripts', 'framer.js'), 'utf8').replace(/\r\n/g, NL), fA = frS.indexOf('var MAX_INPUT'), fB = frS.indexOf('// The creator\'s own controls');
    const SC = await import(url('systemcore.js'));
    const mkFramer = (cfg) => {
        cfg = cfg || {};
        const log = { toasts: [], created: 0, revoked: 0, blobCbs: [], listeners: {}, encoded: [], focus: 0 };
        const el = id => ({ id, style: {}, attrs: {}, textContent: '', value: '', checked: false, clientWidth: 300, setAttribute(k, v) { this.attrs[k] = String(v); }, removeAttribute(k) { delete this.attrs[k]; }, focus() { log.focus++; }, querySelectorAll() { return []; }, getBoundingClientRect() { return { left: 0, top: 0 }; } });
        const els = {}; ['frameModal', 'frameImg', 'frameTitle', 'frameZoom', 'frameDim', 'frameEdge', 'frameOk', 'frameKeep', 'frameKeepRow', 'frameStage'].forEach(id => { els[id] = el(id); });
        const lens = Object.assign({ 'image/png': 100, 'image/webp': 100, 'image/jpeg': 100 }, cfg.lens || {});
        const canvas = () => { const cv = { width: 0, height: 0, fill: null, getContext() { return { fillStyle: '', drawImage() {}, fillRect() { cv.fill = this.fillStyle; } }; },
            toDataURL(t) { log.encoded.push([t, cv.fill]); return 'data:' + ((cfg.answer && cfg.answer[t]) || t) + ';base64,' + 'A'.repeat(lens[t]); },
            toBlob(cb) { if (cfg.blobThrows) throw new Error('tainted'); log.blobCbs.push(cb); } }; return cv; };
        const doc = { getElementById: id => els[id] || null, createElement: t => t === 'canvas' ? canvas() : null, querySelectorAll: () => [], activeElement: null, body: { contains: () => true } };
        const win = { addEventListener(t, f) { (log.listeners[t] = log.listeners[t] || []).push(f); }, removeEventListener(t, f) { log.listeners[t] = (log.listeners[t] || []).filter(x => x !== f); }, appToast: t => log.toasts.push(t), wpSystemCore: SC };
        const URLs = { createObjectURL: () => { log.created++; return 'blob:pic'; }, revokeObjectURL: () => { log.revoked++; } };
        class Img { set src(v) { this._s = v; if (cfg.defer) { (cfg.pending = cfg.pending || []).push(this); return; } if (cfg.err) { if (this.onerror) this.onerror(); return; } if (this.onload) this.onload(); } get naturalWidth() { return cfg.bad ? 0 : cfg.w || 400; } get naturalHeight() { return cfg.h || 200; } }
        const picRef = v => typeof v === 'string' && v.indexOf('/saves/') === 0 ? v : '';
        const api = new Function('clampRect', 'zoomAt', 'panBy', 'zoomOf', 'setZoom', 'outSide', 'firstFit', 'guidePath', 'defaultRect', 'ENCODE', 'wheelFactor', 'picRef', 'getActiveMap', 'document', 'window', 'URL', 'Image',
            frS.slice(fA, fB) + '\nreturn { open, close, finish, cancel, onKey, block, pickShape, isOpen: function() { return !!st; } };')(
            F.clampRect, F.zoomAt, F.panBy, F.zoomOf, F.setZoom, F.outSide, F.firstFit, F.guidePath, F.defaultRect, F.ENCODE, F.wheelFactor, picRef, () => cfg.map || null, doc, win, URLs, Img);
        return { api, log, els, cfg, live: t => (log.listeners[t] || []).length };
    };
    const FILE = { type: 'image/png', size: 1000 };
    const enc = (cfg, opts) => { const f = mkFramer(cfg), got = []; f.api.open(FILE, Object.assign({ px: 96, as: 'data', max: 102400 }, opts || {}), r => got.push(r)); f.api.finish(); return { got, f, types: f.log.encoded.map(e => e[0]), data: got[0] && got[0].data }; };
    const e1 = enc(), e2 = enc({ lens: { 'image/png': 300000 } }), e3 = enc({ lens: { 'image/png': 300000 }, answer: { 'image/webp': 'image/png' } }), e4 = enc({ lens: { 'image/png': 300000, 'image/webp': 300000 } });
    const e5 = enc({ lens: { 'image/png': 300000, 'image/webp': 300000, 'image/jpeg': 300000 } }), e6 = enc({ lens: { 'image/png': 150000 } }, { max: 200000 }), e7 = enc({ lens: { 'image/png': 150000 } });
    check('the creator (run for real): OK saves PNG when it fits, else WebP, else JPEG drawn on a filled background (#1e1c28) — a browser that answers PNG for WebP falls through to JPEG; nothing that fits: nothing saved, a toast, the creator stays open; the limit is the caller\'s (the same picture fits 200,000 characters, not 102,400); the saved side is the square\'s own, at most px',
        fA > 0 && fB > fA && e1.got.length === 1 && /^data:image\/png;base64,A{100}$/.test(e1.data) && j(e1.types) === j(['image/png']) && !e1.f.api.isOpen()
        && /^data:image\/webp;/.test(e2.data) && j(e2.types) === j(['image/png', 'image/webp']) && /^data:image\/jpeg;/.test(e3.data) && /^data:image\/jpeg;/.test(e4.data) && j(e4.f.log.encoded[2]) === j(['image/jpeg', '#1e1c28']) && e4.f.log.encoded[0][1] === null
        && e5.got.length === 0 && e5.f.log.toasts.length === 1 && e5.f.api.isOpen() && /^data:image\/png;/.test(e6.data) && /^data:image\/webp;/.test(e7.data)
        && j(e1.got[0].rect) === j({ x: 100, y: 0, s: 200 }) && e1.got[0].w === 400 && e1.got[0].h === 200 && e1.got[0].keep === false, j([e1.types, e2.types, e3.types, e4.f.log.encoded, e5.f.log.toasts]));
    const o1 = mkFramer(), r1 = o1.api.open({ type: 'text/plain', size: 10 }, {}, () => {}), o2 = mkFramer(), r2 = o2.api.open({ type: 'image/png', size: 9 * 1024 * 1024 }, {}, () => {}), o3 = mkFramer(), r3 = o3.api.open('https://evil.example/x.png', {}, () => {}), o4 = mkFramer(), r4 = o4.api.open(42, {}, () => {});
    const o5 = mkFramer(); o5.api.open(FILE, {}, () => {}); const liveOpen = ['keydown', 'paste', 'drop', 'dragover'].map(o5.live); o5.api.close(); const liveShut = ['keydown', 'paste', 'drop', 'dragover'].map(o5.live);
    const o6 = mkFramer(); o6.api.open('/saves/images/a b.png', {}, () => {}); const src6 = o6.els.frameImg.src; o6.api.close();
    check('the creator (run for real): a file that is not an image, one past 8 MB, a web address or anything else is refused with a toast and never read; open, its keys, pastes and drops are caught on the window, and closing it lets them go and frees the file it read (a library picture is only pointed at, its address encoded)',
        r1 === false && r2 === false && r3 === false && r4 === false && o1.log.created + o2.log.created + o3.log.created === 0 && o1.log.toasts.length === 1 && o2.log.toasts.length === 1 && o3.log.toasts.length === 1
        && j(liveOpen) === j([1, 1, 1, 1]) && j(liveShut) === j([0, 0, 0, 0]) && o5.log.created === 1 && o5.log.revoked === 1 && src6 === '/saves/images/a%20b.png' && o6.log.created === 0 && o6.log.revoked === 0, j([liveOpen, liveShut, src6]));
    const ev = (key, target) => { const e = { key, target: target || null, shiftKey: false, prevented: 0, stopped: 0, preventDefault() { this.prevented++; }, stopPropagation() { this.stopped++; } }; return e; };
    let cancels = 0; const k1 = mkFramer(), kGot = []; k1.api.open(FILE, { onCancel: () => { cancels++; } }, r => kGot.push(r));
    const kL = ev('ArrowLeft'), kD = ev('Delete'), kP = ev('+'), kT = ev('Tab'), kB = ev('Enter', { tagName: 'BUTTON', id: 'frameCancel' }); [kL, kD, kP, kT, kB].forEach(k1.api.onKey);
    const stillOpen = k1.api.isOpen(), kE = ev('Escape'); k1.api.onKey(kE);
    const bOpen = ev('paste'), k2 = mkFramer(); k2.api.open(FILE, {}, () => {}); k2.api.block(bOpen); k2.api.close(); const bShut = ev('drop'); k2.api.block(bShut);
    const k3 = mkFramer(), k3Got = []; k3.api.open(FILE, {}, r => k3Got.push(r)); k3.api.onKey(ev('Enter'));
    check('the creator (run for real): no key reaches the map behind it (arrows, Delete, +, Tab all stopped); Enter on another button is that button\'s, Enter elsewhere is OK; Escape closes it and says so once (onCancel), with nothing saved; a paste or a drop is swallowed while it is open and left alone after',
        [kL, kD, kP, kT, kB].every(e => e.stopped === 1) && kL.prevented === 1 && kB.prevented === 0 && stillOpen && !k1.api.isOpen() && cancels === 1 && kGot.length === 0 && kE.prevented === 1
        && bOpen.prevented === 1 && bOpen.stopped === 1 && bShut.prevented === 0 && bShut.stopped === 0 && k3Got.length === 1 && !k3.api.isOpen());
    const b1 = mkFramer(), b1Got = []; let b1Cancel = 0; b1.api.open(FILE, { as: 'blob', px: 256, onCancel: () => { b1Cancel++; } }, r => b1Got.push(r)); b1.api.finish(); b1.api.finish(); const b1Calls = b1.log.blobCbs.length; b1.api.cancel(); b1.log.blobCbs[0]({ size: 5 });
    const b2 = mkFramer(), b2Got = []; b2.api.open(FILE, { as: 'blob' }, r => b2Got.push(r)); b2.api.finish(); b2.api.open(FILE, { as: 'blob' }, r => b2Got.push(['second', r])); b2.log.blobCbs[0]({ size: 5 }); const b2Open = b2.api.isOpen();
    const b3 = mkFramer(), b3Got = []; b3.api.open(FILE, { as: 'blob' }, r => b3Got.push(r)); b3.api.finish(); b3.log.blobCbs[0]({ size: 7 });
    const b4 = mkFramer({ blobThrows: true }); b4.api.open(FILE, { as: 'blob' }, () => {}); b4.api.finish(); b4.api.finish();
    check('the creator (run for real) as a PNG blob: a second OK while it is being made is ignored; Cancel (or opening it again) while it is made delivers nothing — the cancel is the only outcome; a finished blob is delivered and closes it; a picture the canvas cannot give back leaves OK working (a toast each time)',
        b1Calls === 1 && b1Got.length === 0 && b1Cancel === 1 && b2Got.length === 0 && b2Open && b3Got.length === 1 && b3Got[0].blob.size === 7 && !b3.api.isOpen() && b4.log.toasts.length === 2 && b4.api.isOpen(), j([b1Calls, b1Got, b2Got, b3Got.length, b4.log.toasts]));
    const g1 = mkFramer(); g1.api.open(FILE, { guide: { shape: 'hexagon', w: 60, h: 52 } }, () => {});
    const edge = () => g1.els.frameEdge.attrs.d; const gHex = edge(); g1.api.pickShape('rect'); const gRect = edge(); g1.api.pickShape('circle'); const gCirc = edge(); g1.api.pickShape('hexagon'); const gBack = edge(); g1.api.pickShape('nope'); const gNope = edge();
    const g2 = mkFramer({ map: { type: 'map', meta: { gridType: 'square' } } }); g2.api.open(FILE, {}, () => {}); const g2e = g2.els.frameEdge.attrs.d; g2.api.pickShape('hexagon'); const g2h = g2.els.frameEdge.attrs.d;
    const g3 = mkFramer(); g3.api.open(FILE, { guide: { shape: 'rect', w: 1, h: 1 } }, () => {}); const g3e = g3.els.frameEdge.attrs.d; g3.api.pickShape('circle'); g3.api.pickShape('rect'); const g3b = g3.els.frameEdge.attrs.d;
    const g4 = mkFramer(); g4.api.open(FILE, { guide: { shape: 'hexagon', w: 100, h: 88 } }, () => {}); const g4e = g4.els.frameEdge.attrs.d; g4.api.pickShape('rect'); g4.api.pickShape('hexagon'); const g4b = g4.els.frameEdge.attrs.d;
    check('the creator (run for real): the outline chips preview what each grid\'s one-cell token shows of the square — Square the whole square (a 50x50 cell), Hexagon and Circle a 60x52 band — and the chip it opened with gives back the box it opened with (a sized-up 100x88 token\'s, not a cell\'s); the default outline is the open map\'s grid; anything else is no chip',
        g4e === F.guidePath('hexagon', 100, 88) && g4b === g4e && g4e !== F.guidePath('hexagon', 60, 52) && gHex === F.guidePath('hexagon', 60, 52) && gRect === 'M0 0H100V100H0Z' && gCirc === F.guidePath('circle', 60, 52) && gBack === gHex && gNope === gHex
        && g2e === 'M0 0H100V100H0Z' && g2h === F.guidePath('hexagon', 60, 52) && g3e === 'M0 0H100V100H0Z' && g3b === 'M0 0H100V100H0Z' && g1.els.frameDim.attrs.d === 'M0 0H100V100H0Z' + gHex, j([gHex, gRect, gCirc, g2e, g2h]));
    const lf1 = mkFramer({ bad: true }); let lfC = 0; const lr1 = lf1.api.open(FILE, { onCancel: () => { lfC++; } }, () => { lfC += 10; });
    const lf2 = mkFramer({ err: true }); let lfE = 0; lf2.api.open('/saves/images/x.png', { onCancel: () => { lfE++; } }, () => { lfE += 10; });
    check('the creator (run for real): a picture it cannot read ends the framing — a toast, onCancel once, never OK, the file it read freed — so a caller waiting on it (the ShadowBase import) goes on',
        lr1 === true && lfC === 1 && lf1.log.revoked === 1 && !lf1.api.isOpen() && lf1.log.toasts.length === 1 && lfE === 1 && !lf2.api.isOpen() && lf2.log.toasts.length === 1);
    const lf3 = mkFramer({ err: true }); let lfErr = 0, lfCan = 0; lf3.api.open(FILE, { onError: () => { lfErr++; }, onCancel: () => { lfCan++; } }, () => {});
    check('the creator (run for real): a picture it cannot read ends as onError when the caller gives one (the GM\'s Frame picture… then frames the picture the token wears), else as onCancel',
        lfErr === 1 && lfCan === 0);
    const ro = mkFramer(); let roC = 0, roA = 0, roB = 0;
    ro.api.open(FILE, { onCancel: () => { roC++; } }, () => { roA++; }); ro.api.open(FILE, {}, () => { roB++; }); ro.api.finish();
    const rd = mkFramer({ defer: true }); let rdC = 0, rdA = 0, rdB = 0;
    rd.api.open(FILE, { onCancel: () => { rdC++; } }, () => { rdA++; }); rd.api.open(FILE, {}, () => { rdB++; }); rd.cfg.pending[0].onload(); const rdOpenA = rd.api.isOpen(); rd.cfg.pending[1].onload(); const rdOpenB = rd.api.isOpen(); rd.api.finish();
    check('the creator (run for real): a framing opened over another ends the first as a cancel — its onCancel once, never its OK, its file freed — whether it was open or its picture still loading; the second frames as usual (a caller waiting on the first, the ShadowBase import, goes on)',
        roC === 1 && roA === 0 && roB === 1 && ro.log.revoked === 2 && !ro.api.isOpen() && rdC === 1 && rdA === 0 && !rdOpenA && rdOpenB && rdB === 1 && rd.log.revoked === 2);
    const bigF = { type: 'image/png', size: 10 * 1024 * 1024 }, mb1 = mkFramer(), mbR1 = mb1.api.open(bigF, {}, () => {}), mb2 = mkFramer(), mbR2 = mb2.api.open(bigF, { maxInput: 64 * 1024 * 1024 }, () => {}), mb3 = mkFramer(), mbR3 = mb3.api.open({ type: 'image/png', size: 65 * 1024 * 1024 }, { maxInput: 64 * 1024 * 1024 }, () => {});
    check('the creator (run for real): a file past 8 MB is refused unless the caller raises the cap (the GM\'s own local file: 64 MB), and the refusal names the cap',
        mbR1 === false && /under 8 MB/.test(mb1.log.toasts[0]) && mbR2 === true && mb2.api.isOpen() && mbR3 === false && /under 64 MB/.test(mb3.log.toasts[0]));
    const kp1 = mkFramer(), kpGot = []; kp1.api.open(FILE, { keep: true, title: 'X'.repeat(200) }, r => kpGot.push(r)); const kpShow = kp1.els.frameKeepRow.style.display, kpTitle = kp1.els.frameTitle.textContent.length; kp1.api.finish();
    const kp2 = mkFramer(), kp2Got = []; kp2.api.open(FILE, {}, r => kp2Got.push(r)); kp2.els.frameKeep.checked = true; const kp2Show = kp2.els.frameKeepRow.style.display; kp2.api.finish();
    check('the creator (run for real): "Keep the original" shows only when the caller offers it (as it was set) and is reported only then; the title is text, at most 80 characters',
        kpShow === '' && kpGot[0].keep === true && kp2Show === 'none' && kp2Got[0].keep === false && kpTitle === 80);
    summed = true;
    console.log(NL + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exit(1);
})();

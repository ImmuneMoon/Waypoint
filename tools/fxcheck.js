/* Offline check of the visual-effects pure half (system/app/scripts/fxcore.js): the validator for what the GM
   sends and a player receives, the reduced-motion transform, the photosensitivity gate, the running-set replay
   and the panel presets. No DOM, no engine. Usage: node tools/fxcheck.js   (exit 1 on any failure) */
'use strict';
const path = require('path');
const NL = String.fromCharCode(10);
const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).replace(/[\\]/g, '/');
let pass = 0, fail = 0;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok       ', name); } else { fail++; console.log('FAIL     ', name, detail !== undefined ? '-> ' + String(detail).slice(0, 300) : ''); } }

(async () => {
    let X = null, err = null;
    try { X = await import(url('fxcore.js')); } catch (e) { err = e; }
    check('module loads in Node with no window', !!X && !err, err && err.message);
    if (!X) { console.log(NL + pass + ' passed, ' + fail + ' failed.'); process.exit(1); }
    const { LIMITS, LOOKS, PRESETS, cleanFx, reduced, allowFlash, bright, runningSet, codePoints } = X;
    const M = 'map_x';

    /* ---- flash ---- */
    check('flash: default white, ms clamped to the flash range', (() => { const a = cleanFx({ kind: 'flash', mapId: M }); const b = cleanFx({ kind: 'flash', mapId: M, ms: 5000 }); const c = cleanFx({ kind: 'flash', mapId: M, ms: 10 }); return a.color === '#ffffff' && a.ms === 300 && b.ms === 600 && c.ms === 120; })());
    check('flash: a bad colour is refused, a good one lower-cased', cleanFx({ kind: 'flash', mapId: M, color: 'red' }) === null && cleanFx({ kind: 'flash', mapId: M, color: '#ABCDEF' }).color === '#abcdef' && cleanFx({ kind: 'flash', mapId: M, color: '#fff' }) === null);
    check('every kind but stop needs a mapId', cleanFx({ kind: 'flash' }) === null && cleanFx({ kind: 'flash', mapId: '' }) === null && cleanFx({ kind: 'flash', mapId: 'x'.repeat(81) }) === null);

    /* ---- shake ---- */
    check('shake: ms and amp clamped, amp rounded', (() => { const a = cleanFx({ kind: 'shake', mapId: M, ms: 99, amp: 100 }); const b = cleanFx({ kind: 'shake', mapId: M, ms: 99999, amp: 0 }); return a.ms === 200 && a.amp === 24 && b.ms === 1200 && b.amp === 2; })());

    /* ---- wash ---- */
    check('wash: hold wins over ms; else ms clamped; alpha clamped', (() => { const a = cleanFx({ kind: 'wash', mapId: M, hold: true, ms: 500 }); const b = cleanFx({ kind: 'wash', mapId: M, ms: 50 }); const c = cleanFx({ kind: 'wash', mapId: M, alpha: 5 }); return a.hold === true && a.ms === undefined && b.hold === undefined && b.ms === 300 && c.alpha === LIMITS.alpha[1] && a.color === '#000000'; })());
    check('wash: ms 0 is NOT a hold — it clamps to the floor (hold is explicit)', (() => { const a = cleanFx({ kind: 'wash', mapId: M, ms: 0 }); return a.ms === 300 && !a.hold; })());

    /* ---- burst ---- */
    check('burst: x/y off the board refused, not clamped; r clamped; look required', (() => { const a = cleanFx({ kind: 'burst', mapId: M, x: 100, y: 200, look: 'boom', r: 999999 }); const b = cleanFx({ kind: 'burst', mapId: M, x: -1, y: 0, look: 'boom' }); const c = cleanFx({ kind: 'burst', mapId: M, x: 30001, y: 0, look: 'boom' }); const d = cleanFx({ kind: 'burst', mapId: M, x: 1, y: 1, look: 'nope' }); return a && a.r === LIMITS.r[1] && a.x === 100 && b === null && c === null && d === null; })());
    check('burst: non-finite x refused; ms clamped to the burst range', cleanFx({ kind: 'burst', mapId: M, x: 'a', y: 1, look: 'boom' }) === null && cleanFx({ kind: 'burst', mapId: M, x: 1, y: 1, look: 'boom', ms: 99999 }).ms === 3000);

    /* ---- weather / banner / pulse ---- */
    check('weather: look required, density clamped', cleanFx({ kind: 'weather', mapId: M, look: 'rain', density: 9 }).density === 1 && cleanFx({ kind: 'weather', mapId: M, look: 'fog' }) === null);
    check('banner: text trimmed, control chars refused, over 60 code points refused', (() => { const a = cleanFx({ kind: 'banner', mapId: M, text: '  Round 3  ' }); const b = cleanFx({ kind: 'banner', mapId: M, text: 'x' + String.fromCharCode(7) }); const c = cleanFx({ kind: 'banner', mapId: M, text: 'x'.repeat(61) }); const d = cleanFx({ kind: 'banner', mapId: M, text: '   ' }); return a.text === 'Round 3' && a.ms === 2500 && b === null && c === null && d === null; })());
    check('banner: 60 astral glyphs (120 UTF-16 units) refused; 30 accepted', cleanFx({ kind: 'banner', mapId: M, text: '\u{1F600}'.repeat(61) }) === null && cleanFx({ kind: 'banner', mapId: M, text: '\u{1F600}'.repeat(30) }) !== null && codePoints('\u{1F600}\u{1F600}') === 2);
    check('pulse: tok by regex; a bad id refused; colour optional', cleanFx({ kind: 'pulse', mapId: M, tok: 'wbabc123' }).tok === 'wbabc123' && cleanFx({ kind: 'pulse', mapId: M, tok: '../x' }) === null && cleanFx({ kind: 'pulse', mapId: M, tok: 'nope' }) === null);

    /* ---- stop ---- */
    check('stop: no mapId, what defaults to all, bad what -> all', (() => { const a = cleanFx({ kind: 'stop' }); const b = cleanFx({ kind: 'stop', what: 'weather' }); const c = cleanFx({ kind: 'stop', what: 'evil' }); return a.what === 'all' && a.mapId === undefined && b.what === 'weather' && c.what === 'all'; })());
    check('unknown kind refused; non-object refused', cleanFx({ kind: 'wat', mapId: M }) === null && cleanFx(null) === null && cleanFx('x') === null);

    /* ---- reduced motion ---- */
    check('reduced: shake dropped, flash <=150 + dim, burst no particles, weather halved, off = unchanged', (() => {
        const on = true;
        const sh = reduced(cleanFx({ kind: 'shake', mapId: M }), on);
        const fl = reduced(cleanFx({ kind: 'flash', mapId: M, ms: 600 }), on);
        const bu = reduced(cleanFx({ kind: 'burst', mapId: M, x: 1, y: 1, look: 'boom' }), on);
        const we = reduced(cleanFx({ kind: 'weather', mapId: M, look: 'rain', density: 0.8 }), on);
        const off = cleanFx({ kind: 'flash', mapId: M, ms: 600 });
        return sh === null && fl.ms === 150 && fl.dim === true && bu.noParticles === true && Math.abs(we.density - 0.4) < 1e-9 && reduced(off, false).ms === 600; })());
    check('reduced: weather never below the density floor', reduced(cleanFx({ kind: 'weather', mapId: M, look: 'haze', density: 0.2 }), true).density === LIMITS.density[0]);

    /* ---- photosensitivity gate ---- */
    check('allowFlash: a bright kind gated only against its OWN kind; a flash never blocks a boom; washes/shakes/sparks ungated', (() => {
        const f = cleanFx({ kind: 'flash', mapId: M });
        const boom = cleanFx({ kind: 'burst', mapId: M, x: 1, y: 1, look: 'boom' });
        const spark = cleanFx({ kind: 'burst', mapId: M, x: 1, y: 1, look: 'sparks' });
        const wash = cleanFx({ kind: 'wash', mapId: M, hold: true });
        const shake = cleanFx({ kind: 'shake', mapId: M });
        return allowFlash(f, {}, 1000) === true && allowFlash(f, { flash: 1000 }, 1200) === false && allowFlash(f, { flash: 1000 }, 1600) === true
            && allowFlash(boom, { flash: 1000 }, 1000) === true && allowFlash(boom, { boom: 1000 }, 1100) === false
            && bright(boom) && !bright(spark) && !bright(wash) && !bright(shake)
            && allowFlash(spark, {}, 1000) === true && allowFlash(wash, { flash: 1000 }, 1000) === true; })());

    /* ---- runningSet ---- */
    check('runningSet: weather and a held wash re-emitted with the mapId and type, nothing for an empty map', (() => {
        const running = { map_a: { weather: cleanFx({ kind: 'weather', mapId: 'map_a', look: 'rain' }), wash: cleanFx({ kind: 'wash', mapId: 'map_a', hold: true }) } };
        const out = runningSet(running, 'map_a');
        return out.length === 2 && out.every(o => o.mapId === 'map_a' && o.type === 'fx') && runningSet(running, 'map_b').length === 0; })());

    /* ---- presets ---- */
    check('every preset passes cleanFx once completed and has a unique id and a valid look', (() => {
        const ids = {}; let ok = true;
        PRESETS.forEach(p => {
            if (ids[p.id]) ok = false; ids[p.id] = 1;
            const base = Object.assign({ mapId: M }, p.fx);
            if (p.fx.kind === 'burst') { base.x = 100; base.y = 100; }
            const c = cleanFx(base);
            if (!c || c.kind !== p.fx.kind) ok = false;
            if (p.fx.look && LOOKS[p.fx.kind].indexOf(p.fx.look) < 0) ok = false;
        });
        return ok && PRESETS.length === 13; })());

    /* ---- publication ---- */
    global.window = {};
    const X2 = await import(url('fxcore.js') + '?x');
    check('window.wpFxCore published', !!(global.window.wpFxCore && global.window.wpFxCore.cleanFx && global.window.wpFxCore.VERSION === X2.VERSION));
    delete global.window;

    console.log(NL + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exit(1);
})();

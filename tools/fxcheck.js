/* Offline check of the visual-effects pure half (system/app/scripts/fxcore.js): the validator for what the GM
   sends and a player receives, the reduced-motion transform, the photosensitivity gate, the running-set replay
   and the panel presets. No DOM, no engine. Usage: node tools/fxcheck.js   (exit 1 on any failure) */
'use strict';
const path = require('path');
const NL = String.fromCharCode(10);
const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).replace(/[\\]/g, '/');
let pass = 0, fail = 0;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok       ', name); } else { fail++; console.log('FAIL     ', name, detail !== undefined ? '-> ' + String(detail).slice(0, 300) : ''); } }

let summed = false;   // a check that never settles (a promise nothing answers) would let Node exit with no summary and code 0: that is a failure
process.on('exit', code => { if (!summed && !code) { console.log('\nFAIL      the asynchronous checks never finished (a promise was left waiting)'); process.exitCode = 1; } });
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

    /* ---- the GM's ping (fold P) ---- */
    const { pingAdmit } = X;
    const P = (o) => cleanFx(Object.assign({ kind: 'burst', look: 'ping', mapId: M, x: 125, y: 75, r: 50, ms: 1600 }, o || {}));
    check('ping: a burst look — the list of looks gains it on purpose; the weather looks are untouched',
        JSON.stringify(LOOKS.burst) === JSON.stringify(['boom', 'magic', 'smoke', 'sparks', 'ping']) && JSON.stringify(LOOKS.weather) === JSON.stringify(['rain', 'snow', 'embers', 'haze']));
    check('ping: cleaned exactly as a burst, to the burst\'s own fields (anything else dropped)',
        JSON.stringify(P({ evil: 1, still: true, noParticles: true, type: 'x' })) === JSON.stringify({ kind: 'burst', mapId: M, x: 125, y: 75, look: 'ping', r: 50, ms: 1600 }), JSON.stringify(P({ evil: 1 })));
    check('ping: the full shape is required — no kind, no map, off the board or an unknown look is refused as before; r and ms clamped as a burst\'s',
        cleanFx({ look: 'ping', mapId: M, x: 1, y: 1 }) === null && P({ mapId: undefined }) === null && P({ x: -1 }) === null && P({ y: 30001 }) === null && P({ x: 'a' }) === null
        && cleanFx({ kind: 'burst', look: 'Ping', mapId: M, x: 1, y: 1 }) === null && cleanFx({ kind: 'burst', look: 'pong', mapId: M, x: 1, y: 1 }) === null
        && P({ r: 1 }).r === LIMITS.r[0] && P({ ms: 1 }).ms === LIMITS.ms.burst[0] && P({ color: 'red' }) === null && P({ color: '#ABCDEF' }).color === '#abcdef');
    check('ping: a look, never a preset — the panel\'s burst row does not gain it (13 presets as before)',
        PRESETS.every(p => p.fx.look !== 'ping' && p.id.indexOf('ping') < 0) && PRESETS.length === 13);
    check('ping: not a bright effect — never gated by, nor gating, a flash or a boom',
        !bright(P()) && allowFlash(P(), { flash: 1000, boom: 1000 }, 1001) === true && allowFlash(cleanFx({ kind: 'burst', mapId: M, x: 1, y: 1, look: 'boom' }), {}, 5) === true);
    check('ping: under reduced motion a still ring (and no particles); other bursts are never still; off leaves it as it came',
        (() => { const r = reduced(P(), true), b = reduced(cleanFx({ kind: 'burst', mapId: M, x: 1, y: 1, look: 'magic' }), true), o = reduced(P(), false);
            return r.still === true && r.noParticles === true && r.look === 'ping' && r.x === 125 && b.still === undefined && b.noParticles === true && o.still === undefined && !('still' in P()); })());
    check('ping: a receiver\'s bound — 8 at most at once (the oldest taken away), none within 200 ms of the last drawn',
        LIMITS.pingLive === 8 && LIMITS.pingGapMs === 200
        && pingAdmit([], 0) === 0 && pingAdmit([0, 300, 600, 900, 1200, 1500, 1800], 2100) === 0 && pingAdmit([0, 300, 600, 900, 1200, 1500, 1800, 2100], 2400) === 1
        && pingAdmit([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 500) === 3 && pingAdmit([1000], 1199) === -1 && pingAdmit([1000], 1200) === 0 && pingAdmit([5000], 4000) === -1
        && pingAdmit(null, 5) === 0 && pingAdmit('xx', 5) === 0 && pingAdmit({ length: 20 }, 5) === 0 && pingAdmit([NaN], 5) === 0 && pingAdmit([1000], NaN) === 0 && pingAdmit([1000], undefined) === 0);

    // fx.js's ping, sliced by its markers and run for real on a stubbed screen, with the real fxcore and fogcore
    const fs = require('fs');
    const fxSrc = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'fx.js'), 'utf8').replace(/\r\n/g, NL);
    const slice = (a, b) => { const i = fxSrc.indexOf('// [fxcheck:' + a + ']'), k = fxSrc.indexOf('// [fxcheck:' + b + ']'); if (i < 0 || k < i) throw new Error('fxcheck: ' + a + ' not found in fx.js'); return fxSrc.slice(i, k); };
    const G = await import(url('fogcore.js'));
    class El {
        constructor(tag, cls, text) { this.tag = tag; this.className = cls || ''; this.textContent = text === undefined ? '' : text; this.children = []; this.parent = null; this.props = {}; const me = this; this.style = { setProperty(k, v) { me.props[k] = v; } }; }
        appendChild(c) { c.parent = this; this.children.push(c); return c; }
        removeChild(c) { this.children = this.children.filter(x => x !== c); c.parent = null; return c; }
        remove() { if (this.parent) this.parent.removeChild(this); }
        get firstChild() { return this.children[0] || null; }
        get isConnected() { return !!this.parent; }
    }
    const mkRender = (o) => {
        o = o || {};
        const W = { clock: 0, timers: [], screen: new El('div'), wrap: { scrollLeft: o.sl || 0, scrollTop: o.st || 0 } };
        const fns = new Function('window', 'core', 'screenEl', 'ui', 'el', 'state', 'now', 'setTimeout', 'var pings = [];' + NL + slice('ping-start', 'ping-end') + NL + 'return { pingAt: pingAt, renderPing: renderPing, livePings: livePings };')(
            { wpFogCore: o.noFog ? undefined : G }, () => X, () => W.screen, id => id === 'whiteboardWrap' ? W.wrap : null, (t, c, x) => new El(t, c, x), { zoomLevel: o.z || 1 }, () => W.clock, (fn, ms) => W.timers.push([fn, ms]));
        return Object.assign(W, fns);
    };
    const R = mkRender();
    const sq = { meta: { gridType: 'square' } }, hex = { meta: { gridType: 'hex' } };
    const hc = G.cellCenter(G.cellOf(200, 130, G.gridFor('hex')), G.gridFor('hex'));
    check('ping (fx.js pingAt, run): the middle of the cell clicked, one cell\'s length in radius — square, hex, a gridless map by its fog cell; with no grid at all, where it was clicked',
        JSON.stringify(R.pingAt(sq, 123, 77)) === JSON.stringify({ x: 125, y: 75, r: 50 }) && JSON.stringify(R.pingAt(sq, 0, 0)) === JSON.stringify({ x: 25, y: 25, r: 50 })
        && JSON.stringify(R.pingAt(hex, 200, 130)) === JSON.stringify({ x: hc.x, y: hc.y, r: 52 }) && (hc.x !== 200 || hc.y !== 130)
        && JSON.stringify(R.pingAt({ meta: {}, fog: { cell: { grid: 'square', len: 70 } } }, 100, 100)) === JSON.stringify({ x: 105, y: 105, r: 70 })
        && JSON.stringify(R.pingAt({ meta: {} }, 101, 99)) === JSON.stringify({ x: 101, y: 99, r: 50 }) && JSON.stringify(R.pingAt(null, 7, 8)) === JSON.stringify({ x: 7, y: 8, r: 50 })
        && JSON.stringify(mkRender({ noFog: true }).pingAt(sq, 123, 77)) === JSON.stringify({ x: 123, y: 77, r: 50 }),
        JSON.stringify([R.pingAt(sq, 123, 77), R.pingAt(hex, 200, 130), hc]));
    check('ping (fx.js renderPing, run): drawn on the effects screen at its place (pan and zoom), a pulse of two rings and a dot, removed once its time is up',
        (() => { const W = mkRender({ z: 2, sl: 100, st: 40 }); W.renderPing(P()); const d = W.screen.children[0];
            return W.screen.children.length === 1 && d.className === 'fx-burst fx-ping' && d.style.left === (125 * 2 - 100 - 100) + 'px' && d.style.top === (75 * 2 - 40 - 100) + 'px' && d.style.width === '200px'
                && d.props['--fx-dur'] === '1600ms' && JSON.stringify(d.children.map(c => c.className)) === JSON.stringify(['fx-ping-ring', 'fx-ping-ring fx-ping-echo', 'fx-ping-dot'])
                && W.timers.length === 1 && W.timers[0][1] === 1800 && (W.timers[0][0](), W.screen.children.length === 0 && W.livePings().length === 0); })());
    check('ping (fx.js renderPing, run): under reduced motion a still ring and the dot, no echo; a ring never smaller than 18 px on screen; a colour carried',
        (() => { const W = mkRender({ z: 0.1 }); W.renderPing(reduced(P({ color: '#112233' }), true)); const d = W.screen.children[0];
            return d.className === 'fx-burst fx-ping fx-ping-still' && JSON.stringify(d.children.map(c => c.className)) === JSON.stringify(['fx-ping-ring', 'fx-ping-dot']) && d.style.width === '36px' && d.props['--fx-color'] === '#112233'; })());
    check('ping (fx.js renderPing, run): a ninth takes the oldest away (8 drawn at once), one within 200 ms of the last is not drawn, and a ping already gone frees its place',
        (() => { const W = mkRender(); const first = [];
            for (let i = 0; i < 9; i++) { W.clock = i * 250; W.renderPing(P({ x: 100 + i })); first.push(W.screen.children[W.screen.children.length - 1]); }
            const nine = W.screen.children.length === 8 && !first[0].isConnected && first[1].isConnected && W.screen.children[7] === first[8];
            W.clock = 2000 + 199; W.renderPing(P({ x: 999 })); const soon = W.screen.children.length === 8 && !W.screen.children.some(c => c.style.left === (999 - 50) + 'px');
            first[3].remove(); W.clock = 2400; W.renderPing(P({ x: 500 })); const freed = W.screen.children.length === 8 && first[1].isConnected && first[2].isConnected;
            W.clock = 2700; W.renderPing(P({ x: 600 })); const again = W.screen.children.length === 8 && !first[1].isConnected;
            return nine && soon && freed && again; })());

    // the GM's controls, sliced and run: whom a ping goes to, Alt+click following the list, the list's text nodes
    const mkGm = (o) => {
        o = o || {};
        const W = { played: [], toasts: [], clock: 10000, roster: o.roster || {}, map: o.map === undefined ? { id: 'm1', type: 'map', meta: { gridType: 'square' } } : o.map, host: o.host !== false, live: o.live || [], sel: o.noSel ? null : new El('select'), panelOpen: !!o.panelOpen, active: null };
        W.sel.style.display = undefined;
        const doc = { createElement: t => new El(t), get activeElement() { return W.active; } };
        const src = 'var pingTo = ' + JSON.stringify(o.pingTo || '') + ', PING_MS = 1600, panelOpen = W.panelOpen;' + NL + slice('gmping-start', 'gmping-end')
            + NL + 'return { canPing: canPing, pingPlayers: pingPlayers, checkPingTo: checkPingTo, ping: ping, syncPingTo: syncPingTo, pingPoll: pingPoll, get pingTo() { return pingTo; }, set pingTo(v) { pingTo = v; } };';
        const fns = new Function('W', 'document', 'net', 'isHost', 'mapNow', 'getActiveMap', 'canWrite', 'featureOn', 'state', 'core', 'livePings', 'now', 'pingAt', 'play', 'toast', 'ui', src)(
            W, doc, () => ({ active: true, role: W.host ? 'host' : 'client', roster: W.roster }), () => W.host, () => W.map && W.map.type === 'map' ? W.map.id : null, () => W.map,
            () => o.write !== false, () => o.feature !== false, { viewMode: o.view || 'visual' }, () => X, () => W.live, () => W.clock, R.pingAt,
            (fx, to) => { W.played.push([fx, to]); return { ok: true }; }, m => W.toasts.push(m), id => id === 'fxPingTo' ? W.sel : null);
        return Object.assign(W, { f: fns });
    };
    const opts = s => JSON.stringify(s.children.map(c => [c.value, c.textContent]));
    const roster = { pA: { id: 'u_a', name: 'Ann', location: 'm1' }, pA2: { id: 'u_a', name: 'Ann', location: 'm1' }, pB: { id: 'u_b', name: '<img src=x onerror=alert(1)>', location: 'm1' }, pC: { id: 'u_c', name: 'Cy', location: 'm2' }, pD: { id: 'u_d', location: 'm1' }, pE: { location: 'm1' } };
    check('ping (fx.js, run): the list is everyone on this map, then each player ON it once (by profile, their other connection too), names as text nodes; hidden when no player is here',
        (() => { const W = mkGm({ roster }); W.f.syncPingTo();
            const one = opts(W.sel) === JSON.stringify([['', 'Everyone on this map'], ['u_a', 'Ann'], ['u_b', '<img src=x onerror=alert(1)>'], ['u_d', 'Player']]) && W.sel.style.display === '' && W.sel.value === '';
            const V = mkGm({ roster: { pC: roster.pC } }); V.f.syncPingTo(); const none = opts(V.sel) === JSON.stringify([['', 'Everyone on this map']]) && V.sel.style.display === 'none';
            const S = mkGm({ roster, host: false }); S.f.syncPingTo(); const solo = S.sel.children.length === 1 && S.sel.style.display === 'none';
            const T = mkGm({ roster, pingTo: 'u_c' }); T.f.syncPingTo(); const stale = T.sel.value === '' && T.sel.children.length === 4;
            const K = mkGm({ roster, pingTo: 'u_b' }); K.f.syncPingTo(); const kept = K.sel.value === 'u_b';
            return one && none && solo && stale && kept &&!/innerHTML/.test(slice('gmping-start', 'gmping-end')); })());
    check('ping (fx.js, run): Alt+click pings everyone on the map by default — snapped to the cell, one cell across, 1600 ms, the whole shape',
        (() => { const W = mkGm({ roster }); W.f.ping(123, 77);
            return JSON.stringify(W.played) === JSON.stringify([[{ kind: 'burst', look: 'ping', mapId: 'm1', x: 125, y: 75, r: 50, ms: 1600 }, null]]) && W.toasts.length === 0; })());
    check('ping (fx.js, run): with one player chosen, every ping goes to that player; once they leave the map the choice goes back to Everyone (told once) and the ping goes to everyone',
        (() => { const W = mkGm({ roster: JSON.parse(JSON.stringify(roster)), pingTo: 'u_b' }); W.f.ping(10, 10); W.clock += 300; W.f.ping(60, 10);
            const to = W.played.map(p => p[1]).join() === 'u_b,u_b';
            W.roster.pB.location = 'm2'; W.clock += 300; W.f.ping(10, 60); W.clock += 300; W.f.ping(10, 110);
            return to && W.played[2][1] === null && W.played[3][1] === null && W.f.pingTo === '' && W.toasts.length === 1; })());
    check('ping (fx.js, run): the choice follows its player on the map poll too (a player gone from the table, or a GM on another map), the open list refreshed; a focused list is not rebuilt under the pointer',
        (() => { const W = mkGm({ roster: JSON.parse(JSON.stringify(roster)), pingTo: 'u_a', panelOpen: true }); W.f.syncPingTo(); const had = W.sel.value === 'u_a';
            delete W.roster.pA; W.f.pingPoll(); const kept = W.f.pingTo === 'u_a' && W.toasts.length === 0;
            delete W.roster.pA2; W.f.pingPoll(); const gone = W.f.pingTo === '' && W.toasts.length === 1 && opts(W.sel) === JSON.stringify([['', 'Everyone on this map'], ['u_b', '<img src=x onerror=alert(1)>'], ['u_d', 'Player']]);
            W.f.pingTo = 'u_b'; W.map = { id: 'm2', type: 'map' }; W.f.pingPoll(); const moved = W.f.pingTo === '' && W.toasts.length === 2 && opts(W.sel) === JSON.stringify([['', 'Everyone on this map'], ['u_c', 'Cy']]);
            W.active = W.sel; W.roster.pZ = { id: 'u_z', name: 'Zed', location: 'm2' }; W.f.pingPoll(); const focused = W.sel.children.length === 2;
            W.active = null; W.f.pingPoll(); const after = W.sel.children.length === 3;
            return had && kept && gone && moved && focused && after; })());
    check('ping (fx.js, run): the GM\'s own clicks keep the spacing (none sent within 200 ms of the last drawn); nothing from a player, the stream, a closed feature, the data view or no map',
        (() => { const W = mkGm({ roster, live: [9900] }); W.f.ping(1, 1); const soon = W.played.length === 0; W.live = [9800]; W.f.ping(1, 1); const ok = W.played.length === 1;
            const none = [{ write: false }, { feature: false }, { view: 'data' }, { map: null }, { map: { id: 'd1', type: 'data' } }].every(o => { const V = mkGm(Object.assign({ roster }, o)); V.f.ping(1, 1); return V.played.length === 0 && !V.f.canPing(); });
            const bad = mkGm({ roster }); bad.f.ping(NaN, 1); bad.f.ping(1, Infinity);
            return soon && ok && none && bad.played.length === 0 && mkGm({ roster }).f.canPing(); })());
    const wbSrc = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'whiteboard.js'), 'utf8').replace(/\r\n/g, NL);
    check('ping: the GM\'s play passes the one player through to the wire and leaves such a ping off the stream window; Alt+click is caught on the way down on the play map, ahead of every tool, and the Alt released after it never shows the desktop window\'s hidden menu bar',
        /var n = net\(\); if \(n && n\.sendFx\) n\.sendFx\(clean, to \|\| null\);/.test(fxSrc) && /\n    if \(!to\) streamPost\(clean\);/.test(fxSrc) && /if \(look === 'ping'\) ping\(x, y\); else play\(/.test(fxSrc)
        && /wbWrap\.addEventListener\('pointerdown', function\(e\) \{\n\s*if \(!e\.altKey \|\| e\.button !== 0 \|\| !window\.wpFx \|\| !window\.wpFx\.canPing\(\)\) return;[\s\S]{0,400}?e\.preventDefault\(\); e\.stopImmediatePropagation\(\); _pingAlt = true;\n\s*window\.wpFx\.ping\(x, y\);\n\s*\}, true\);/.test(wbSrc)
        && /document\.addEventListener\('keyup', function\(e\) \{ if \(_pingAlt && e\.key === 'Alt'\) \{ _pingAlt = false; e\.preventDefault\(\); \} \}, true\);/.test(wbSrc)
        && /return f\.look === 'ping' \? renderPing\(f\) : renderBurst\(f\);/.test(fxSrc)
        && /\nvar PING_MS = 1600;\n/.test(fxSrc) && /\nfunction tableLeft\(\) \{ stopAll\(\); pingTo = ''; \}\n/.test(fxSrc));   // a ping lasts 1600 ms; a session's end forgets the choice

    /* ---- publication ---- */
    global.window = {};
    const X2 = await import(url('fxcore.js') + '?x');
    check('window.wpFxCore published', !!(global.window.wpFxCore && global.window.wpFxCore.cleanFx && global.window.wpFxCore.VERSION === X2.VERSION));
    delete global.window;

    summed = true;
    console.log(NL + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exit(1);
})();

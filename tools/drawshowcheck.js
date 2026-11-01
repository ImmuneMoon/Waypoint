/* Offline check of drawings to show (1.6.2). The owner, 2026-10-31: "if a gm is using them for drawing on a map to create the environment, fog should work
   normally, but if they need to use it to visually demonstrate something, fog shouldnt cover it. and just turning fog off isnt a good solution. same for if
   a player want to draw something that goes on the map (gm approval only) or also visually demonstrate something". drawshow.js is sliced by its
   [drawshowcheck:core-*] markers and run for real with the real fogcore on stand-ins of the page, the board's lines by [drawshowcheck:board-*]. The wire is
   netcheck's, the fog's canvas fogcheck's, the file cleanupcheck's, the map's picture buildcheck's, and the right-click rows sinkcheck's; the page is pinned here.
   Usage: node tools/drawshowcheck.js   (exit 1 on any failure) */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const dir = path.join(__dirname, '..'), scripts = path.join(dir, 'system', 'app', 'scripts');
let pass = 0, fail = 0, summed = false;
function check(name, ok, info) { if (ok) { pass++; console.log('ok        ' + name); } else { fail++; console.log('FAIL      ' + name + (info !== undefined ? ' -> ' + info : '')); } }
process.on('exit', () => { if (!summed) { console.log('the suite ended before its summary'); process.exitCode = 1; } });
const read = f => fs.readFileSync(path.join(dir, f), 'utf8').replace(/\r\n/g, '\n');
const J = JSON.stringify;
const slice = (src, name) => { const a = src.indexOf('// [' + name + '-start]'), z = src.indexOf('// [' + name + '-end]'); if (a < 0 || z < a) throw new Error('slice ' + name + ' not found'); return src.slice(a, z); };
const src = read('system/app/scripts/drawshow.js');
const make = new Function(slice(src, 'drawshowcheck:core') + '\nreturn { make, FADE_MS, FADE_TAIL_MS, FADE_LEAST, ASK_MOST, TICK_MS, SEEN_KEEP_MS, lineNear, askWords };')();
const { FADE_MS, FADE_TAIL_MS, FADE_LEAST, ASK_MOST } = make;

async function main() {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-drawshow-'));
    fs.writeFileSync(path.join(tmp, 'fogcore.mjs'), read('system/app/scripts/fogcore.js'), 'utf8');
    const FC = await import('file://' + path.join(tmp, 'fogcore.mjs').replace(/\\/g, '/'));

    const line = (id, more) => Object.assign({ id, type: 'path', x: 100, y: 100, w: 100, h: 100, baseW: 100, baseH: 100, pts: [[0, 0], [100, 0]], color: '#e9e9f0', strokeWidth: 3 }, more || {});
    function world(o) {
        o = o || {};
        const W = { clock: 1000, store: Object.assign({}, o.store || {}), saves: [], writes: [], dropped: [], unsel: [], toasts: [], waits: {}, dones: [], asks: [], told: [], logs: [], renders: 0, fights: {}, players: {}, client: !!o.client, foreign: !!o.foreign, known: o.known !== false, owns: o.owns !== false, preset: false, me: 'u_a', fades: [], els: {}, askOk: true };
        const map = { id: 'm1', type: 'map', meta: { title: 'Old Quay' }, whiteboard: (o.wb || []).slice() };
        W.camp = { id: 'k', activeItemId: 'm1', items: Object.assign({ m1: map }, o.items || {}) }; W.mapOn = map;
        W.api = make.make({
            camp: () => W.camp, map: () => W.mapOn, FC: () => FC, client: () => W.client, foreign: () => W.foreign, hostKnows: () => W.known, owns: () => W.owns, myId: () => W.me, preset: () => W.preset,
            get: k => { if (W.getThrows) throw new Error('no store'); return Object.prototype.hasOwnProperty.call(W.store, k) ? W.store[k] : null; }, set: (k, v) => { W.store[k] = v; }, now: () => W.clock, el: id => W.els[id] || null, fadeEls: () => W.fades,
            fightOn: id => W.fights[id] || null, playerOn: id => !!W.players[id], save: now => W.saves.push(now === true), render: () => { W.renders++; }, write: (c, id) => W.writes.push(id), dropped: (id, ids) => W.dropped.push([id, ids.slice()]), unselect: ids => W.unsel.push(ids.slice()),
            toast: t => W.toasts.push(t), wait: (k, t, kind, arg) => { W.waits[k] = { t, kind, arg }; }, done: k => W.dones.push(k), ask: (id, ids) => { W.asks.push([id, ids.slice()]); return W.askOk; }, tell: (p, t) => W.told.push([p, t]), log: (s, f) => W.logs.push(s + ' ' + J(f)),
        });
        W.ids = () => W.mapOn.whiteboard.map(x => x.id);
        return W;
    }

    {   // the pen's choice, kept for this computer
        const G = world(), g0 = G.api.penOn(); G.api.pick('show'); const g1 = G.api.penOn(), kept = J(G.store);
        G.preset = true; const g2 = G.api.penOn(); G.preset = false; G.foreign = true; const g3 = G.api.penOn();
        const P = world({ client: true }), P2 = world({ client: true, known: false }), back = world({ store: { wp_penShow: 'show', wp_penStay: 'scene' } }), odd = world({ store: { wp_penShow: '<b>', wp_penStay: 'forever' } }), none = world();
        none.getThrows = true; const noneA = make.make.length;
        check('the pen\'s pick: On the map until To show is picked, and kept for this computer; a line of the Build tool and someone else\'s table with its link down are never one; a player\'s drawing is always one, at a host that knows the mark, and at an older host none is; what is kept is read back by its own words alone',
            g0 === false && g1 === true && g2 === false && g3 === false && kept === J({ wp_penShow: 'show', wp_penStay: 'erased' }) && P.api.penOn() === true && P2.api.penOn() === false && back.api.state.pick === 'show' && back.api.state.stay === 'scene' && odd.api.state.pick === 'map' && odd.api.state.stay === 'erased' && noneA === 1,
            J([g0, g1, g2, g3, kept, P.api.penOn(), P2.api.penOn()]));
    }
    {   // a stroke as the pen makes it
        const G = world(); const a = line('a'); const r0 = G.api.stamp(a, G.mapOn); G.api.pick('show'); const b = line('b'), r1 = G.api.stamp(b, G.mapOn);
        G.api.stayPick('fade'); const c = line('c'), r2 = G.api.stamp(c, G.mapOn), wall = line('w', { blocksSight: true, sightType: 'wall' }), r3 = G.api.stamp(wall, G.mapOn);
        G.api.stayPick('nonsense'); const e = line('e'); G.api.stamp(e, G.mapOn);
        G.preset = true; const f = line('f'), r4 = G.api.stamp(f, G.mapOn);
        check('a stroke: On the map writes nothing, To show its tick, Until erased no word of its own and any other its word; a wall is never one, nor a stroke under the Build tool; a word no choice holds is Until erased',
            r0 === false && !('toShow' in a) && r1 === true && b.toShow === true && !('showFor' in b) && r2 === true && c.showFor === 'fade' && r3 === false && !('toShow' in wall) && e.toShow === true && !('showFor' in e) && r4 === false && !('toShow' in f), J([a, b, c]));
    }
    {   // a drawing that fades on its own
        const wb = [line('f', { toShow: true, showFor: 'fade' }), line('s', { toShow: true }), line('h', { toShow: true, showFor: 'fade', hidden: true })];
        const G = world({ wb }); G.api.touch('m1'); G.api.tick();   // first seen at 1000
        const f = wb[0], at = ms => { G.clock = 1000 + ms; return G.api.fadeOf(f); };
        const curve = [at(0), at(FADE_MS - FADE_TAIL_MS - 1), at(FADE_MS - FADE_TAIL_MS), at(FADE_MS - FADE_TAIL_MS / 2), at(FADE_MS - 1)];
        const el = { dataset: { id: 'f' }, style: {} }; G.fades = [el]; G.clock = 1000 + FADE_MS - FADE_TAIL_MS / 2; G.api.tick();
        const painted = el.style.opacity, stay = G.ids().slice(), writes0 = G.writes.length;
        G.clock = 1000 + FADE_MS; const went = G.api.tick();
        check('Fades on its own: whole until its last seconds, then down to a faint line; each tick paints it; the machine that owns the campaign takes it off the map at its time, outside the GM\'s undo and telling the table (write, once), notes it as gone and takes it off the selection; one that stays until erased and a hidden one stay',
            curve[0] === 1 && curve[1] === 1 && curve[2] === 1 && curve[3] > 0.49 && curve[3] < 0.51 && curve[4] === FADE_LEAST && Number(painted) === 0.5 && J(stay) === J(['f', 's', 'h']) && writes0 === 0 && went === 1 && J(G.ids()) === J(['s', 'h']) && J(G.writes) === J(['m1']) && J(G.dropped) === J([['m1', ['f']]]) && J(G.unsel) === J([['f']]) && G.saves.length === 0 && /^gone/.test(G.logs[G.logs.length - 1]),
            J([curve, painted, G.ids(), G.writes]));
        const P = world({ wb: [line('f', { toShow: true, showFor: 'fade' })], owns: false }); P.api.fadeOf(P.mapOn.whiteboard[0]); P.api.tick(); P.clock += FADE_MS * 3; P.api.tick();
        check('a screen that does not own the campaign (a player, the stream window) only draws the fade: it takes nothing off the map', J(P.ids()) === J(['f']) && P.writes.length === 0 && P.api.fadeOf(P.mapOn.whiteboard[0]) === FADE_LEAST);
    }
    {   // Until the fight or scene ends
        const wb = () => [line('s', { toShow: true, showFor: 'scene' }), line('e', { toShow: true }), line('f', { toShow: true, showFor: 'fade' })];
        const other = { id: 'm2', type: 'map', meta: { title: 'Ford' }, whiteboard: [line('o', { toShow: true, showFor: 'scene' }), line('p', { showFor: 'scene' })] };
        const G = world({ wb: wb(), items: { m2: other, d1: { id: 'd1', type: 'doc' } } });
        G.api.tick(); const onHere = other.whiteboard.map(w => w.id).join();
        G.camp.activeItemId = 'm2'; G.fights.m1 = { id: 'f' }; G.api.tick(); const inFight = G.ids().join();
        delete G.fights.m1; G.players.m1 = true; G.api.tick(); const withPlayer = G.ids().join();
        delete G.players.m1; G.api.tick();
        check('Until the fight or scene ends: the first look finds the drawings of every map, not only the one on screen; the map the GM has left with nobody on it holds none, at once; it stays while the GM\'s screen is on it, while a fight runs there or while a player stands there, and goes once none of these holds; a drawing that does not say so stays; a piece with no tick is nothing to do with it',
            onHere === 'p' && inFight === 's,e,f' && withPlayer === 's,e,f' && G.ids().join() === 'e,f' && J(G.writes) === J(['m2', 'm1']), J([onHere, inFight, withPlayer, G.ids(), G.writes]));
        const H = world({ wb: wb() }); H.fights.m1 = { id: 'f' }; const held = H.api.sceneOver('m1'); delete H.fights.m1; const a = H.api.sceneOver('nope'), b = H.api.sceneOver(); H.owns = false; H.mapOn.whiteboard.push(line('s2', { toShow: true, showFor: 'scene' })); const c = H.api.sceneOver('m1');
        check('a fight or a scene over (sceneOver): nothing while a fight still runs on that map, a map that is none or for a screen that does not own the campaign; else the drawings that stay until then go at once, from the map named or the map on screen, and the table is told', held === 0 && a === 0 && b === 1 && c === 0 && J(H.writes) === J(['m1']) && H.ids().join() === 'e,f,s2', J([held, a, b, c, H.ids()]));
        const N = world({ wb: [line('n')] }); N.api.tick(); N.camp = { id: 'k2', activeItemId: 'mx', items: { mx: { id: 'mx', type: 'map', whiteboard: [line('z', { toShow: true, showFor: 'scene' })] }, my: { id: 'my', type: 'map', whiteboard: [line('y', { toShow: true, showFor: 'scene' })] } } }; N.mapOn = N.camp.items.mx; N.api.tick();
        check('another campaign is looked through afresh, and a map a drawing to show stands on goes on being watched', N.camp.items.my.whiteboard.length === 0 && N.camp.items.mx.whiteboard.length === 1);
    }
    {   // Clear drawings to show
        const wb = () => [line('g', { toShow: true }), line('m', { toShow: true, ownerId: 'u_a', byPlayer: true }), line('o', { toShow: true, ownerId: 'u_b', byPlayer: true }), line('l', { toShow: true, ownerId: 'u_a', byPlayer: true, locked: true }), line('p', { ownerId: 'u_a', byPlayer: true }), line('x')];
        const G = world({ wb: wb() }), n = G.api.clear();
        check('Clear, the GM\'s: every drawing to show on this map, whoever drew it, as a step of the GM\'s undo (an ordinary save, so Undo brings them back), noted as gone, a map drawing left alone, and it says how many', n === 4 && G.ids().join() === 'p,x' && J(G.saves) === J([false]) && G.writes.length === 0 && J(G.dropped) === J([['m1', ['g', 'm', 'o', 'l']]]) && G.renders === 1 && G.toasts[0] === '4 drawings to show cleared.', J([n, G.ids(), G.saves, G.toasts]));
        const P = world({ wb: wb(), client: true }), pn = P.api.clear();
        check('Clear, a player\'s: their own alone, never one the GM locked and never a map drawing of theirs; it goes to the host at once as their own erase', pn === 1 && P.ids().join() === 'g,o,l,p,x' && J(P.saves) === J([true]) && P.dropped.length === 0 && P.toasts[0] === 'Drawing to show cleared.', J([pn, P.ids(), P.saves]));
        const E = world({ wb: [line('p')] }), en = E.api.clear(), S = world({ wb: wb(), owns: false }), sn = S.api.clear();
        check('nothing to clear is said; a screen that is neither a player\'s nor the owner\'s (the stream window) clears nothing', en === 0 && E.toasts[0] === 'No drawings to show on this map.' && E.saves.length === 0 && sn === 0 && S.ids().length === 6);
    }
    {   // the GM's tick on a drawing
        const mine = line('a'), pl = line('b', { toShow: true, showFor: 'fade', byPlayer: true, ownerId: 'u_a' }), wall = line('w', { blocksSight: true }), G = world({ wb: [mine, pl, wall] });
        G.api.stayPick('scene'); const on = G.api.setShow([mine, wall], true, G.mapOn), off = G.api.setShow([pl], false, G.mapOn);
        G.camp.activeItemId = 'none'; G.api.tick();
        check('the tick: on, a drawing takes the mark and how long the pen says stays, and is watched from then on; a wall takes none; off, a drawing is a map drawing, and a player\'s is the GM\'s from then on, as a yes to their ask makes it',
            on === 1 && off === 1 && !G.ids().includes('a') && !('toShow' in wall) && (() => { const T = world({ wb: [] }); T.mapOn.whiteboard.push(line('t', { toShow: true, showFor: 'scene' })); T.api.tick(); T.camp.activeItemId = 'x'; T.mapOn.whiteboard.push(line('u', { toShow: true, showFor: 'scene' })); T.api.touch(); T.api.tick(); return T.ids().length === 0; })() && !('toShow' in pl) && !('showFor' in pl) && !('byPlayer' in pl) && !('ownerId' in pl), J([mine, pl]));
    }
    {   // a player's own drawing under the pointer
        const near = line('n', { toShow: true, ownerId: 'u_a', byPlayer: true, x: 100, y: 100, w: 200, h: 100, baseW: 100, baseH: 100, pts: [[0, 0], [100, 0]] });
        const P = world({ client: true, wb: [line('o', { toShow: true, ownerId: 'u_b', byPlayer: true }), line('m', { ownerId: 'u_a', byPlayer: true, y: 300 }), near, line('l', { toShow: true, ownerId: 'u_a', byPlayer: true, locked: true, y: 500 })] });
        const at = (x, y) => { const w = P.api.mineAt(x, y); return w ? w.id : null; };
        const got = [at(250, 104), at(250, 120), at(320, 100), at(150, 300), at(150, 500), at(NaN, 1)];
        const G = world({ wb: [near] }), older = world({ client: true, known: false, wb: [near] });
        check('a player\'s right-click (mineAt): a drawing of their own to show within reach of its line, as the board draws it stretched; never another\'s, a map drawing of theirs, one the GM locked, a place that is no number, the GM\'s screen or a host that does not know the mark',
            J(got) === J(['n', null, null, null, null, null]) && G.api.mineAt(250, 104) === null && older.api.mineAt(250, 104) === null, J(got));
    }
    {   // the ask, on a player's app
        const wb = () => [line('a', { toShow: true, ownerId: 'u_a', byPlayer: true }), line('b', { toShow: true, ownerId: 'u_a', byPlayer: true }), line('o', { toShow: true, ownerId: 'u_b', byPlayer: true }), line('g', { toShow: true })];
        const P = world({ client: true, wb: wb() }), all = P.api.ask(null), one = P.api.ask(['b', 'o', 'g']);
        const none = world({ client: true, wb: [line('o', { toShow: true, ownerId: 'u_b', byPlayer: true })] }), n0 = none.api.ask(null);
        const many = world({ client: true, wb: Array.from({ length: ASK_MOST + 5 }, (_, i) => line('s' + i, { toShow: true, ownerId: 'u_a', byPlayer: true })) }), nm = many.api.ask(null);
        const older = world({ client: true, known: false, wb: wb() }), no = older.api.ask(null), lost = world({ client: true, wb: wb() }); lost.askOk = false; const nl = lost.api.ask(null);
        check('the ask: all their own drawings to show, or the one they pressed, and nobody else\'s; said when it goes; at most what the host takes; nothing with none (and it says so), at an older host or where it could not be sent',
            all === 2 && one === 1 && J(P.asks) === J([['m1', ['a', 'b']], ['m1', ['b']]]) && P.toasts[0] === 'Your GM has been asked.' && n0 === 0 && none.asks.length === 0 && none.toasts[0] === 'You have no drawings to show on this map.' && nm === ASK_MOST && many.asks[0][1].length === ASK_MOST && no === 0 && older.asks.length === 0 && nl === 0 && lost.toasts.length === 0, J([all, one, P.asks, n0, nm, no, nl]));
    }
    {   // the bell
        const wb = () => [line('a', { toShow: true, ownerId: 'u_a', byPlayer: true }), line('b', { toShow: true, ownerId: 'u_a', byPlayer: true })];
        const G = world({ wb: wb() }), q = { pid: 'u_a', name: 'Pat', mapId: 'm1', ids: ['a'] }; G.api.asked(q);
        const key = 'showask:u_a:m1', w1 = G.waits[key].t, kind = G.waits[key].kind; G.api.asked({ pid: 'u_a', name: 'Pat', mapId: 'm1', ids: ['a', 'b'] });
        const w2 = G.waits[key].t, arg = G.waits[key].arg, still = G.api.askStill(arg), n = G.api.answer(arg, true);
        const after = G.mapOn.whiteboard.map(x => [x.id, 'toShow' in x, 'byPlayer' in x, 'ownerId' in x]);
        check('the bell: an ask is one item a player and map, naming the map, and a newer ask joins the one that waits; a yes makes each a map drawing, the GM\'s, told to the table and to its player, and the item goes, outside the GM\'s undo',
            w1 === 'Pat asks to put a drawing on the map Old Quay.' && kind === 'showask' && G.toasts[0] === w1 && w2 === 'Pat asks to put 2 drawings on the map Old Quay.' && still === true && n === 2 && J(after) === J([['a', false, false, false], ['b', false, false, false]]) && J(G.writes) === J(['m1']) && J(G.told) === J([['u_a', 'Your GM put your drawing on the map. It is the GM\'s now.']]) && J(G.dones) === J([key]) && G.saves.length === 0, J([w1, w2, after, G.told]));
        const R = world({ wb: wb() }); R.api.asked(q); const ar = R.waits[key].arg, nr = R.api.answer(ar, false);
        check('a no leaves it a drawing to show and tells its player, and the item goes', nr === 1 && R.mapOn.whiteboard[0].toShow === true && R.mapOn.whiteboard[0].ownerId === 'u_a' && R.writes.length === 0 && J(R.told) === J([['u_a', 'Your GM kept your drawing as one to show.']]) && J(R.dones) === J([key]));
        const S = world({ wb: wb() }); S.api.asked(q); const as = S.waits[key].arg; S.mapOn.whiteboard[0].toShow = false; const st1 = S.api.askStill(as); S.mapOn.whiteboard = []; const st2 = S.api.askStill(as), ns = S.api.answer(as, true);
        check('an ask whose drawing is gone or is no drawing to show any more no longer waits, and a yes to it does nothing and tells nobody', st1 === false && st2 === false && ns === 0 && S.writes.length === 0 && S.told.length === 0 && J(S.dones) === J([key]));
        const O = world({ wb: [line('b2', { ownerId: 'u_b', byPlayer: true, toShow: true }), line('a2', { toShow: true })] }); O.api.asked({ pid: 'u_a', name: 'Pat', mapId: 'm1', ids: ['b2', 'a2'] }); const ao = O.waits['showask:u_a:m1'].arg, no = O.api.answer(ao, true);
        check('a yes reaches only drawings that are still that player\'s: another player\'s and the GM\'s stand as they did', no === 0 && O.mapOn.whiteboard[0].toShow === true && O.mapOn.whiteboard[0].ownerId === 'u_b' && O.mapOn.whiteboard[1].toShow === true);
        const words = [make.askWords('Pat', 1, 'x'), make.askWords('Pat', 3, 'x')], un = world({ wb: wb(), items: { m3: { id: 'm3', type: 'map', whiteboard: [] } } }); un.api.asked({ pid: 'u_a', name: 'Pat', mapId: 'm3', ids: ['a'] }); const gone = un.api.asked({ pid: 'u_a', name: 'Pat', mapId: 'mNone', ids: ['a'] });
        check('its words, and a map with no name or one that is gone', J(words) === J(['Pat asks to put a drawing on the map x.', 'Pat asks to put 3 drawings on the map x.']) && un.waits['showask:u_a:m3'].t === 'Pat asks to put a drawing on the map with no name.' && gone === false);
    }
    {   // the pen's options as they stand
        const cls = () => { const s = new Set(); return { toggle: (c, on) => { if (on) s.add(c); else s.delete(c); }, has: c => s.has(c) }; };
        const page = () => ({ drawShowBox: {}, drawOnMapBtn: { classList: cls() }, drawToShowBtn: { classList: cls() }, drawShowLine: {}, drawShowPart: {}, drawShowAsk: {}, drawShowFor: { children: ['erased', 'fade', 'scene'].map(w => ({ dataset: { showfor: w }, classList: cls() })) } });
        const on = W => [W.els.drawShowBox.hidden, W.els.drawOnMapBtn.classList.has('active'), W.els.drawToShowBtn.classList.has('active'), W.els.drawShowPart.hidden, W.els.drawShowAsk.hidden, Array.prototype.map.call(W.els.drawShowFor.children, b => b.classList.has('active')).join()];
        const G = world(); G.els = page(); G.api.sync(); const g0 = on(G), l0 = G.els.drawShowLine.textContent; G.api.pick('show'); G.api.stayPick('fade'); const g1 = on(G), l1 = G.els.drawShowLine.textContent;
        const P = world({ client: true }); P.els = page(); P.api.sync(); const p0 = on(P);
        const O = world({ client: true, known: false }); O.els = page(); const oS = O.api.sync(); const F = world({ foreign: true }); F.els = page(); F.api.sync();
        const N = world(); const nS = N.api.sync();
        check('the pen\'s options: the GM\'s On the map or To show, and with To show how long it stays and Clear, each with its one line; a player has To show alone with Clear and the ask; at an older host and at someone else\'s table with its link down there is nothing to pick; a page with no such box is left alone',
            J(g0) === J([false, true, false, true, true, 'true,false,false']) && /covers it/.test(l0) && J(g1) === J([false, false, true, false, true, 'false,true,false']) && /over the fog/.test(l1) && J(p0) === J([false, false, true, false, false, 'true,false,false']) && oS === false && O.els.drawShowBox.hidden === true && F.els.drawShowBox.hidden === true && nS === false, J([g0, g1, p0]));
    }
    {   // the board's lines, run as written
        const board = slice(read('system/app/scripts/whiteboard.js'), 'drawshowcheck:board');
        let touched = 0; const run = (item, fade) => { const cl = new Set(), el = { classList: { toggle: (c, on) => { if (on) cl.add(c); else cl.delete(c); } }, style: { opacity: '0.5' } }; new Function('item', 'el', 'window', board)(item, el, { wpFogCore: FC, wpDrawShow: { fadeOf: () => fade || 1, touch: () => { touched++; } } }); return [[...cl].sort().join(), el.style.opacity]; };
        const kept = run(line('a', { toShow: true })), fades = run(line('a', { toShow: true, showFor: 'fade' }), 0.5), plain = run(line('a')), hid = run(line('a', { toShow: true, hidden: true })), wall = run(line('a', { toShow: true, blocksSight: true }));
        check('the board: a drawing to show is marked for the fog\'s canvas, one that fades marked for its tick and drawn as far as it has gone; a plain drawing, a hidden one and a wall are not',
            J(kept) === J(['wb-toshow', '0.5']) && J(fades) === J(['wb-fade,wb-toshow', '0.25']) && J(plain) === J(['', '0.5']) && J(hid) === J(['', '0.5']) && J(wall) === J(['', '0.5']) && touched === 1, J([kept, fades, plain, hid, wall, touched]));
    }
    {   // the page, its wiring and its words
        const ix = read('system/app/index.html'), wb = read('system/app/scripts/whiteboard.js'), dm = read('system/app/scripts/datamap.js'), nt = read('system/app/scripts/net.js'), sc = read('system/app/scripts/scene.js'), css = read('system/app/style.css'), ci = read('.github/workflows/checks.yml');
        const one = (s, t) => s.split(t).length === 2;
        check('the pen\'s options in the page, first in its menu; On the map the GM\'s alone; the three stays by their words and their data; the module loaded after the fog; the pen\'s menu drawing them',
            ix.indexOf('id="drawMenu"') < ix.indexOf('id="drawShowBox"') && ix.indexOf('id="drawShowBox"') < ix.indexOf('>Pen Style<') && /class="draw-style-btn active gm-only" id="drawOnMapBtn" data-show="map"/.test(ix) && /id="drawToShowBtn" data-show="show"/.test(ix) && />Until erased<\/button>/.test(ix) && />Fades on its own<\/button>/.test(ix) && />Until the fight or scene ends<\/button>/.test(ix) && />Clear drawings to show<\/button>/.test(ix) && /id="drawShowAsk"[^>]* hidden>Ask to put them on the map<\/button>/.test(ix)
            && ix.indexOf('scripts/fog.js') < ix.indexOf('scripts/drawshow.js') && one(wb, 'if (window.wpDrawShow) window.wpDrawShow.sync();'));
        check('the wiring: the pen stamps a stroke as it is laid, before its save, and marks it for the fog as it is drawn; the last fight on a map and a scene closed for everyone end what stays until then; every step is logged in its own words, with no words of the table in them; the bell\'s kind waits there alone',
            dm.indexOf('window.wpDrawShow.stamp(item, getActiveMap());') > dm.indexOf('getActiveMap().whiteboard.push(item);') && dm.indexOf('window.wpDrawShow.stamp(item, getActiveMap());') < dm.indexOf('currentDrawItem = null;', dm.indexOf('getActiveMap().whiteboard.push(item);')) && one(dm, "if (window.wpDrawShow && window.wpDrawShow.penOn()) currentDrawItem.classList.add('wb-toshow');")
            && one(nt, 'window.wpDrawShow.sceneOver(mapId);') && one(sc, 'window.wpDrawShow.sceneOver();') && /nkS2\.showask = \{ label: 'Put on the map', altLabel: 'No', only: true, stay: true,/.test(src) && /window\.wpStepLog\('drawshow v1', step, facts\)/.test(src) && css.includes('#drawShowBox { display: flex;'));
        const helpSaid = ix.includes('<b>To show</b>') && ix.includes('Clear drawings to show') && ix.includes('Until the fight or scene ends') && ix.includes('Ask to put it on the map');
        const notes = ['WHATSNEW.txt', 'system/app/assets/whatsnew.txt'].map(f => read(f)), top = t => t.slice(0, t.indexOf('WAYPOINT 1.6.1'));
        check('Help says it, for the GM and for players, and both release notes say it under 1.6.2; CI runs this suite', helpSaid && notes.every(t => /Drawings to show/.test(top(t)) && /over the fog/.test(top(t))) && top(notes[0]) === top(notes[1]) && ci.includes('run: node tools/drawshowcheck.js'), J([helpSaid]));
    }
    console.log(pass + ' passed, ' + fail + ' failed.'); summed = true;
    if (fail) process.exitCode = 1;
}
main().catch(e => { console.log('FAIL      the suite threw: ' + (e && e.stack)); summed = true; process.exitCode = 1; });

/* netfightcheck.js: the fights on the host, the tests that came out of netcheck.js with their area (docs/REFACTOR_SPLIT_PLAN.md, area 9,
   2026-11-19). The code lives mostly in system/app/scripts/netfight.js, a part of net.js; every slice of its markers (holds, charsplit,
   initfight, initround, turnhold, orders, targetas, ally, rangeto, targethit) and every definition only it holds is read from the part by
   its own name, while the slices of other areas (the combats' messages, the roll-req branch, the GM's own roll, the turn's start) still
   read the joined net.js through srcjoin.
   What it covers, each block as it stood in netcheck.js: a player's roll reading the range to their own pointer's target (range
   penalties R2) and kept to its roller and the GM while another player cannot see the target (R3), a called shot's location (B5: hit-ask
   and hit-rows, the GM's own roll), a player's End turn and the initiative folds O1 to O4 (a player's own roll into the fight, a hold, a
   roll each round, sides), a reminder card delivered to its player (T2b), a step back as a correction (fold 3 of backlog 152), fights by
   their own ids with two on one map (fold 2), a sheet given its own copy while a fight runs, and who holds whom. With "Finishing the
   test split", step 5 (2026-11-19), from netcheck.js: the round hook (G10), a fight ended with its session or its map (fold 0 of backlog
   152), walls that stop a player's token (T3a), the move limit and the out-of-turn lock (T3b), the actions a turn allows (T4), the combat
   roster on the wire, and a hold that names what sets it off.
   Run: node tools/netfightcheck.js   (exit 1 on any failure) */
require('./srcjoin').install();   // a split giant script reads joined, exactly as it was before the split (tools/srcjoin.js)
const fs = require('fs'), path = require('path');
const kit = require('./checkkit');   // what the suites that came out of the giant ones share (tools/checkkit.js)
const T = kit.suite('net'), check = T.check, pendingChecks = T.pending, packCheck = kit.packCheck;
// netcheck's slice helpers over the joined net.js; a call that names a part's file (netfight.js) reads that part by its own name
const { src, between, fnSrc, lineOf, ordersSrc } = kit.netSlices('netfightcheck');
// the harness pieces netcheck keeps at its top, the very code (checkkit netHarness)
const { H, ownKeySrc, fightIn, mkConn } = kit.netHarness('netfightcheck');
const j = JSON.stringify;
check('netfightcheck: netfight.js is a part of net.js, read by its own name', kit.part('netfight.js').includes('// [split:body-start]') && kit.part('netfight.js').includes('// [netcheck:orders-start]') && kit.part('netfight.js').includes('// [netcheck:holds-start]'));

// Range penalties R2 (docs/RANGE_PLAN.md 3): a player's roll and apply action read RangeMod and TargetDistance to their own pointer's target
// as their copy holds it — the real roll-req and char-apply branches with the real rangeTo (sliced by its netcheck markers), systemcore,
// formula engine and dicecore; never a target the GM hid, one their sight drops on a fogged map, one on another map, their own token or
// anyone else's pointer; an open drag judged at its start
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js')), Dx = await import(url('dicecore.js'));
    const rtSrc = between('// [netcheck:rangeto-start]', '// [netcheck:rangeto-end]', 'rangeto', 'netfight.js'), rqSrc = (ordersSrc + '\n' + between('// [netcheck:rollreq-start]', '// [netcheck:rollreq-end]', 'rollreq'));
    const apSrc = (ordersSrc + '\n' + between('// [netcheck:charapply-start]', '// [netcheck:charapply-end]', 'charapply')), paSrc = between('// [netcheck:postapply-start]', '// [netcheck:postapply-end]', 'postapply'), dlSrc = between('// [netcheck:chardelta-start]', '// [netcheck:chardelta-end]', 'chardelta');
    const lineOf = (k, file) => { const t = typeof file === 'string' ? require('./checkkit').part(file) : src, i = t.indexOf(k); if (i < 0) throw new Error('netcheck: ' + k + ' not found'); return t.slice(i, t.indexOf('\n', i)); };   // file: a part of net.js, read by its own name
    const helpers = ['function own(', 'function peerProfileId(', 'function fxLib(', 'function itemLib(', 'function diceFrom(', 'function fogDrop('].map(lineOf).join('\n') + '\n';
    const STEPS = [{ to: 2, mod: 0 }, { to: 5, mod: -2 }, { to: 10, mod: -4 }];
    const sysOf = range => Sx.cleanSystem({ v: 1, name: 'R', fields: [{ id: 'f_hp', key: 'HP', label: 'Hit points', kind: 'resource', maxFormula: '10', def: 'max', min: -50, edit: 'owner' }],
        rolls: [{ id: 'r_rng', label: 'Range hit', apply: [{ f: 'f_hp', formula: '0 - RangeMod' }] }], combat: range === null ? undefined : { range: range || { steps: STEPS } } }, { F: Fx, gmView: true });
    // a square map (5 ft squares): the player's token at the corner, an NPC 6 squares east (30 ft = 10 yd: -4), another NPC and a plain shape
    const world = o => {
        o = o || {};
        const mine = { id: 't_me', isChar: true, charId: 'c_a', ownerId: 'u_a', x: 0, y: 0, w: 50, h: 50 };
        const npc = Object.assign({ id: 't_npc', isChar: true, charId: 'c_n', x: 300, y: 0, w: 50, h: 50 }, o.npc || {});
        const wall = { id: 't_wall', type: 'rect', x: 100, y: 0, w: 50, h: 50 };
        const camp = { id: 'k', activeItemId: 'm1', system: o.sys || sysOf(), chars: { c_a: { id: 'c_a', name: 'Ana', ownerId: 'u_a', npc: false, values: {} }, c_n: { id: 'c_n', name: 'Orc', npc: true, values: {} } },
            items: { m1: { id: 'm1', type: 'map', meta: { gridType: 'square' }, whiteboard: [mine, npc, wall].concat(o.pieces || []) }, m2: { id: 'm2', type: 'map', meta: { gridType: 'square' }, whiteboard: [{ id: 't_far', isChar: true, x: 0, y: 0 }] } } };
        const targets = o.targets !== undefined ? o.targets : { u_a: { id: 't_npc', mapId: 'm1', name: 'Pat' } };
        const net = { active: true, role: 'host', paused: false, targets: targets, combats: {}, conns: [], roster: { pA: { id: 'u_a', name: 'Pat', location: o.loc || 'm1' } } };
        const drops = [], landed = [];
        const win = { wpFormula: Fx, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpVtt: { on: () => true, rulesOn: k => k !== 'elevation' || o.elev === true }, wpDiceCore: null,
            wpFog: { fogDropIds: (pid, c, m) => { drops.push([pid, c === camp, m && m.id]); return o.drop || null; } }, wpStance: o.stance };   // item 19b H5: the stance module, where a case reads the ground
        const fogLanded = o.drag ? (mapId, fn) => { landed.push(mapId); const was = mine.x; mine.x = o.drag; try { return fn(); } finally { mine.x = was; } } : undefined;
        return { camp, net, win, mine, npc, drops, landed, fogLanded };
    };
    const roll = o => {
        const W = world(o), out = { table: [], sent: [] }, conn = { peer: 'pA', send(m) { packCheck(m); out.sent.push(JSON.parse(JSON.stringify(m))); } };
        const msg = { type: 'roll-req', rid: 'q1', expr: 'd20 + RangeMod + TargetDistance', charId: 'c_a', label: 'Shot' };
        new Function('msg', 'conn', 'net', 'DC', 'SC', 'window', 'getActiveCampaign', 'peerPaused', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'fogLanded', 'var diceLimit = null, _diceSlowSaid = {};\n' + helpers + rtSrc + '\n' + rqSrc)(
            msg, conn, W.net, () => Dx, () => Sx, W.win, () => W.camp, () => false, e => { throw e; }, rec => { packCheck(rec); out.table.push(JSON.parse(JSON.stringify(rec))); }, () => {}, () => {}, W.fogLanded);
        const rec = out.table[0] || {}, nm = n => ((rec.names || []).filter(x => x.name === n).map(x => x.value))[0];
        return { mod: nm('RangeMod'), dist: nm('TargetDistance'), n: out.table.length, sent: out.sent, drops: W.drops, landed: W.landed, back: W.mine.x };
    };
    const base = roll(), none = roll({ targets: {} }), other = roll({ targets: { u_a: { id: 't_far', mapId: 'm2', name: 'Pat' } } }), elsewhere = roll({ loc: 'm2' }), hid = roll({ npc: { hidden: true } });
    const fogged = roll({ drop: { t_npc: 1 } }), foggedOther = roll({ drop: { t_wall: 1 } }), self = roll({ targets: { u_a: { id: 't_me', mapId: 'm1', name: 'Pat' } } }), gmOnly = roll({ targets: { u_gm: { id: 't_npc', mapId: 'm1', name: 'GM' } } });
    const shape = roll({ targets: { u_a: { id: 't_wall', mapId: 'm1', name: 'Pat' } } }), gone = roll({ targets: { u_a: { id: 't_zz', mapId: 'm1', name: 'Pat' } } }), noRule = roll({ sys: sysOf(null) }), formula = roll({ sys: sysOf({ unit: 'ft', formula: '-1 * floor(Distance / 10)' }) });
    const wrongMap = roll({ targets: { u_a: { id: 't_npc', mapId: 'm2', name: 'Pat' } } }), selfBonus = roll({ sys: sysOf({ steps: [{ to: 1, mod: 3 }] }), targets: { u_a: { id: 't_me', mapId: 'm1', name: 'Pat' } } }), dragged = roll({ drag: -300 }), up = roll({ elev: true, npc: { elevation: 30 } }), upOff = roll({ npc: { elevation: 30 } });
    const zero = r => r.n === 1 && r.mod === 0 && r.dist === 0;
    check('range R2 roll-req (host, run for real): a player\'s roll reads RangeMod (-4) and TargetDistance (10 yd: six 5 ft squares) to their own pointer\'s target on the map they are on, asking the fog what their copy holds; both read 0 with no pointer, a pointer on another map or to a map they are not on, a target the GM hid, one their sight drops, their own token, a plain shape, a token that is gone, or only the GM\'s pointer',
        base.n === 1 && base.mod === -4 && base.dist === 10 && j(base.drops) === j([['u_a', true, 'm1']]) && foggedOther.mod === -4
        && [none, other, elsewhere, hid, fogged, self, gmOnly, shape, gone, wrongMap, selfBonus].every(zero) && j(fogged.drops) === j([['u_a', true, 'm1']]) && none.drops.length === 0,
        j([base, none, other, elsewhere, hid, fogged, self, gmOnly, shape, gone].map(r => [r.mod, r.dist, r.n])));
    check('range R2 roll-req: with no range rule TargetDistance still reads the distance in yards and RangeMod 0; a formula rule in feet reads its own (30 ft: -3); an open drag is judged where it began (fogLanded on that map: 20 yd, past the last step -4 holds) and the token is back where it was; heights count only while the elevation rule is on (30 yd up: 31.622777 yd)',
        noRule.mod === 0 && noRule.dist === 10 && formula.mod === -3 && formula.dist === 30 && dragged.mod === -4 && dragged.dist === 20 && dragged.landed[0] === 'm1' && dragged.landed.every(m => m === 'm1') && dragged.back === 0
        && up.dist === 31.622777 && up.mod === -4 && upOff.dist === 10,
        j([[noRule.mod, noRule.dist], [formula.mod, formula.dist], [dragged.mod, dragged.dist, dragged.landed, dragged.back], [up.mod, up.dist], [upOff.mod, upOff.dist]]));
    // item 19b H5: the ground each token stands on, as the player's copy reads it — the real tokenGround (whiteboard.js sliced by its ground markers) over the real fogcore
    const FCg5 = await import(url('fogcore.js')), wbG5 = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'whiteboard.js'), 'utf8').replace(/\r\n/g, '\n'), g5A = wbG5.indexOf('// [fogcheck:ground-start]'), g5B = wbG5.indexOf('// [fogcheck:ground-end]');
    const stanceG = (() => { try { return new Function('window', 'stanceOn', 'fmtElev', 'lenUnit', '"use strict";\n' + wbG5.slice(g5A, g5B) + '\nreturn { tokenGround: tokenGround, tokenElevation: tokenElevation };')({ wpFogCore: FCg5 }, () => true, String, () => 'yd'); } catch (e) { return undefined; } })();
    const hillG = { id: 't_hill', type: 'rect', x: 250, y: -50, w: 150, h: 150, ground: 9 }, hillHid = { id: 't_hid', type: 'rect', x: 250, y: -50, w: 150, h: 150, ground: 30, hidden: true }, pitMe = { id: 't_pit', type: 'circle', x: -50, y: -50, w: 150, h: 150, ground: -3 };
    const gUp = roll({ elev: true, stance: stanceG, pieces: [hillG] }), gHid = roll({ elev: true, stance: stanceG, pieces: [hillHid] }), gBoth = roll({ elev: true, stance: stanceG, pieces: [hillG, pitMe], npc: { elevation: 3 } }), gOff = roll({ stance: stanceG, pieces: [hillG] }), gNoSt = roll({ elev: true, pieces: [hillG] });
    check('item 19b H5 roll-req (host, run for real): a player\'s roll reads the range with the ground each token stands on — a target on a 9-yard hill 10 yards off is 13.453624 yd away; with the target\'s own elevation and the roller in a pit, all of it (15 up: 18.027756 yd); a piece the GM hid counts for nothing in a player\'s roll (their copy does not hold it); nothing with the elevation rule off, nor with no stance module on hand',
        !!stanceG && gUp.dist === 13.453624 && gHid.dist === 10 && gBoth.dist === 18.027756 && gOff.dist === 10 && gNoSt.dist === 10 && /St\.tokenGround\(t, map, true\)/.test(rtSrc), j([gUp.dist, gHid.dist, gBoth.dist, gOff.dist, gNoSt.dist]));
    // an apply action reads it the same way: Range hit takes (0 - RangeMod) from HP
    const apply = o => {
        const W = world(o), out = { answer: [], saves: 0 }, box = b => m => { packCheck(m); b.push(JSON.parse(JSON.stringify(m))); };
        const conn = { peer: 'pA', send: box(out.answer) }; W.net.conns = [{ peer: 'pA', open: true, send: () => {} }];
        new Function('msg', 'conn', 'net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'lim', 'own', 'diceFrom', 'sendTable', 'pushChat', 'logEvent', 'applyLine', 'fogLanded', 'fogDrop',
            'var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {};\n' + rtSrc + '\n' + dlSrc + '\n' + paSrc + '\n' + apSrc)(
            { type: 'char-apply', rid: 'a1', charId: 'c_a', act: 'r_rng' }, conn, W.net, () => Sx, W.win, () => false, () => W.camp, () => { out.saves++; }, e => { throw e; }, c => (W.net.roster[c.peer] ? W.net.roster[c.peer].id : null), { allow: () => true },
            (ob, k) => !!ob && Object.prototype.hasOwnProperty.call(ob, k), (p, gm) => ({ id: p.id, name: p.name, gm: !!gm }), () => {}, () => {}, () => {}, r => Dx.applyText(r), W.fogLanded, (c, m, pid) => W.win.wpFog.fogDropIds(pid, c, m));
        return { hp: W.camp.chars.c_a.values.f_hp, answer: out.answer.map(m => m.type + (m.reason ? ':' + m.reason : '')), saves: out.saves };
    };
    // secrets (R2 #17): the hover lines the host works out from the owner's view for a teammate name only the effects the teammate's own copy holds —
    // never a GM-only effect — while the numbers stay the owner's; the owner's own copy is handed back untouched
    {
        const whl = fnSrc('function withHoverLines(', '\nfunction charViewFor(', 'withHoverLines');
        const sys17 = { v: 1, name: 'S17', fields: [{ id: 'f_st', key: 'ST', kind: 'number', def: 10, vis: 'all', hover: true }, { id: 'f_fx', key: 'Fx', label: 'Effects', kind: 'effects', vis: 'all', edit: 'owner', hover: true }], rolls: [],
            effects: [{ id: 'e_rage', name: 'Rage', mods: [{ f: 'f_st', op: 'add', v: 2 }] }, { id: 'e_curse', name: 'Curse', vis: 'gm', icon: 'X', tone: 'debuff', mods: [{ f: 'f_st', op: 'add', v: -3 }] }] };
        const GM17 = Sx.cleanSystem(sys17, { F: Fx, gmView: true }), PL17 = Sx.cleanSystem(sys17, { F: Fx, gmView: false }), lib17 = {}; GM17.effects.forEach(d => { lib17[d.id] = d; });
        const cc17 = { id: 'c_1', name: 'P', ownerId: 'u_p', npc: false, values: { f_fx: [{ id: 'x_1', ref: 'e_rage', on: true }, { id: 'x_2', ref: 'e_curse', on: true }] } };
        const WHL = new Function('SC', 'window', whl + '\nreturn withHoverLines;')(() => Sx, { wpFormula: Fx });
        const mate17 = WHL(Sx.charFor(cc17, PL17, 'u_m', { lib: lib17 }), cc17, PL17, lib17, null, GM17), ownIn = Sx.charFor(cc17, PL17, 'u_p', { lib: lib17 }), own17 = WHL(ownIn, cc17, PL17, lib17, null, GM17);
        check('secrets withHoverLines (run for real): a teammate\'s copy gets the lines worked out from the owner\'s view (ST 9: the GM-only Curse still counts) with the Effects line naming only the effects their copy holds ("Effects Rage"), and nothing of the GM-only effect anywhere in the copy; the owner\'s own copy is handed back as it was',
            Array.isArray(mate17.lines) && mate17.lines.includes('ST 9') && mate17.lines.includes('Effects Rage') && !JSON.stringify(mate17).includes('Curse') && mate17.values.f_fx.map(r => r.name).join() === 'Rage' && own17 === ownIn && !('lines' in own17) && own17.values.f_fx.length === 2, j([mate17, own17.values]));
    }
    const apA = apply(), apN = apply({ targets: {} }), apH = apply({ npc: { hidden: true } });
    check('range R2 char-apply (host, run for real): an apply action\'s amount reads RangeMod as a roll does (Range hit: HP 10 - 4 = 6); with no target, or a hidden one, it reads 0, so the action changes nothing and is refused as any such action is (none): nothing stored, nothing saved',
        j(apA.hp) === j({ cur: 6 }) && j(apA.answer) === j(['char-ack']) && apA.saves === 1 && [apN, apH].every(r => r.hp === undefined && j(r.answer) === j(['char-deny:none']) && r.saves === 0), j([apA, apN, apH]));
    check('range R2 (source): the host\'s roll and apply action merge the range after the round, through rangeTo with the player\'s own token on the map they are on and their own id, guarded where a handler runs alone; the GM\'s own roll reads the sheet\'s token context (tokenCtxFor, which carries it)',
        /if \(typeof rangeTo === 'function' && SQ\.withRange\) tcQ = SQ\.withRange\(tcQ, rangeTo\(campQ, mapQ, locQ, SQ\.charTokenOn\(mapQ, q\.charId, tokOwnQ, tokOptQ\), pidQ\)\);/.test(src) && /var tokOwnQ = pressQ \? '' : pidQ, tokOptQ = pressQ \? \{\} : \{ strict: true \};/.test(src)
        && /if \(typeof rangeTo === 'function' && Sa\.withRange\) tcA = Sa\.withRange\(tcA, rangeTo\(campA, mapA, locA, Sa\.charTokenOn\(mapA, qa\.charId, profA\.id, \{ strict: true \}\), profA\.id\)\);/.test(src)
        && /tcR = window\.wpSheets && window\.wpSheets\.tokenCtxFor \? window\.wpSheets\.tokenCtxFor\(chR\.id, campR\) : null; varsR = SR\.makeResolver\(campR\.system, chR, F, tcR\);/.test(src)
        && /return typeof fogLanded === 'function' \? fogLanded\(mapId, judge\) : judge\(\);/.test(rtSrc));
    // secrets (R2 #15): net.tokUnseen (run for real) — an initiative card names its creature, so one some admitted, connected player would read as Hidden
    // in their turn order is rolled in private: the GM hid it, or their fogged copy drops it and they never saw it in this fight (combatSeen), on any map
    const unseen = o => {
        o = o || {}; const asked = [], landed = [];
        const map = { id: 'm1', type: 'map', fog: { on: true }, whiteboard: [{ id: 't_g', isChar: true, charId: 'c_g', x: 300, y: 0 }, { id: 't_h', isChar: true, charId: 'c_h', hidden: true, x: 0, y: 0 }, { id: 't_a', isChar: true, charId: 'c_a', ownerId: 'u_a', x: 0, y: 0 }] };
        const camp = { id: 'k', items: { m1: map, m2: { id: 'm2', type: 'map', whiteboard: [] } } };
        const conns = (o.conns || [['pA', true], ['pB', true]]).map(c => ({ peer: c[0], open: c[1] }));
        const net = { active: true, role: 'host', targets: {}, conns, roster: o.roster || { pA: { id: 'u_a', name: 'Pat', location: 'm1' }, pB: { id: 'u_b', name: 'Bo', location: o.locB || 'm1' } },
            combats: { f_keep0001: { id: 'f_keep0001', mapId: 'm1', round: 1, turn: 0, rows: [{ id: 'r_t_g', tokId: 't_g' }] } } };   // fold 2: the fight on m1 that holds the Goblin, under its own id
        const fogDropF = (c, m, pid) => { asked.push(pid); const d = (o.drop || {})[pid]; return d || null; };
        const fogLandedF = (mapId, fn) => { landed.push(mapId); return fn(); };
        new Function('net', 'getActiveCampaign', 'own', 'fogDrop', 'combatSeen', 'fogLanded', 'SC', 'window', ordersSrc + '\n' + rtSrc)(net, () => camp, H.own, fogDropF, o.seen || undefined, o.noLand ? undefined : fogLandedF, () => Sx, { wpVtt: { on: () => true } });
        return { got: net.tokUnseen(o.mapId || 'm1', o.tokId === undefined ? 't_g' : o.tokId), asked, landed };
    };
    const uSeen = unseen(), uDropB = unseen({ drop: { u_b: { t_g: 1 } } }), uDropA = unseen({ drop: { u_a: { t_g: 1 } } }), uOther = unseen({ drop: { u_b: { t_a: 1 } } }), uElse = unseen({ drop: { u_b: { t_g: 1 } }, locB: 'm2' });
    const uShut = unseen({ drop: { u_b: { t_g: 1 } }, conns: [['pA', true], ['pB', false]] }), uWait = unseen({ drop: { u_b: { t_g: 1 } }, roster: { pA: { id: 'u_a', location: 'm1' } } }), uHid = unseen({ tokId: 't_h' }), uGone = unseen({ tokId: 't_zz' });
    const uSaw = unseen({ drop: { u_b: { t_g: 1 } }, seen: (fid, pid, tokId) => fid === 'f_keep0001' && pid === 'u_b' && tokId === 't_g' }), uSawA = unseen({ drop: { u_b: { t_g: 1 } }, seen: (mapId, pid) => pid === 'u_a' }), uNone = unseen({ conns: [] });
    const uBad = [unseen({ mapId: 'm9' }), unseen({ mapId: 5 }), unseen({ tokId: 5 }), unseen({ mapId: 'constructor' })], uNoLand = unseen({ drop: { u_b: { t_g: 1 } }, noLand: true });
    check('secrets net.tokUnseen (run for real): true while an admitted, connected player\'s fogged copy drops the token (any player\'s, on that map or elsewhere), for a token the GM hid and for one that is gone; false when every connected player sees it, when a copy drops another token only, when the only player who cannot see it saw it in this fight (combatSeen, asked by the id of the fight that holds it: fold 2), is not connected, is only waiting, or no one is at the table; a map that is none, a bad id or a prototype name read false; judged with every open drag at its start (fogLanded on that map), each player asked once',
        uSeen.got === false && j(uSeen.asked) === j(['u_a', 'u_b']) && j(uSeen.landed) === j(['m1']) && uDropB.got === true && uDropA.got === true && uOther.got === false && uElse.got === true
        && uShut.got === false && uWait.got === false && uHid.got === true && uGone.got === true && uSaw.got === false && uSawA.got === true && uNone.got === false && uBad.every(u => u.got === false && u.landed.length === 0) && uNoLand.got === true,
        j([uSeen, uDropB, uDropA, uOther, uElse, uShut, uWait, uHid, uGone, uSaw, uSawA, uNone, uBad.map(u => u.got)]));
    const wbU = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'whiteboard.js'), 'utf8').replace(/\r\n/g, '\n');
    check('secrets (source): the roster\'s Roll all and its per-row Roll (whiteboard.js) pass the judge\'s word to the sheet\'s initiative roll as priv, and the every-round re-roll asks it beside the hidden tick',
        /var rr = window\.wpSheets\.rollInit\(r\.charId, \{ priv: combatRollPriv\(draft\.mapId, r\.tokId\), tok: r\.tokId \}\);/.test(wbU) && /window\.wpSheets\.rollInit\(rows\[i\]\.charId, \{ priv: combatRollPriv\(combatDraft\.mapId, rows\[i\]\.tokId\), tok: rows\[i\]\.tokId \}\)/.test(wbU)
        && /rollInit\(ch\.id, \{ priv: !!\(tkI && \(tkI\.hidden \|\| \(typeof net\.tokUnseen === 'function' && net\.tokUnseen\(mapId, tkI\.id\)\)\)\), tok: tkI \? tkI\.id : undefined \}\)/.test(require('./checkkit').part('netfight.js')));   // 1.6.3 (the combat review, finding 3): and the token rolled for, whose name the card wears, moved on purpose
})());
// Range penalties R3 (the owner's answer of 2026-09-29): a public roll that reads the range goes to its roller and the GM alone while
// another player on the target's map cannot see the target — the real roll-req branch and the GM's own net.diceRoll, with the real
// rangeTo, rangeReadBy and rangeUnseen (sliced by their netcheck markers), systemcore, formula engine and dicecore
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js')), Dx = await import(url('dicecore.js'));
    const rtSrc = between('// [netcheck:rangeto-start]', '// [netcheck:rangeto-end]', 'rangeto', 'netfight.js'), rqSrc = (ordersSrc + '\n' + between('// [netcheck:rollreq-start]', '// [netcheck:rollreq-end]', 'rollreq')), drSrc = between('// [netcheck:diceroll-start]', '// [netcheck:diceroll-end]', 'diceroll');
    const lineOf = (k, file) => { const t = typeof file === 'string' ? require('./checkkit').part(file) : src, i = t.indexOf(k); if (i < 0) throw new Error('netcheck: ' + k + ' not found'); return t.slice(i, t.indexOf('\n', i)); };   // file: a part of net.js, read by its own name
    const helpers = ['function own(', 'function peerProfileId(', 'function fxLib(', 'function itemLib(', 'function diceFrom(', 'function fogDrop('].map(lineOf).join('\n') + '\n';
    const sysR3 = Sx.cleanSystem({ v: 1, name: 'R3', fields: [{ id: 'f_atk', key: 'Atk', kind: 'formula', formula: '10 + RangeMod', vis: 'all' }, { id: 'f_a', key: 'A', kind: 'number', def: 4, vis: 'all' }], rolls: [],
        combat: { range: { steps: [{ to: 2, mod: 0 }, { to: 5, mod: -2 }, { to: 10, mod: -4 }] } } }, { F: Fx, gmView: true });
    // Ana (u_a) at the corner, an orc six squares east; Bo (u_b) another player, on the same map unless told otherwise
    const world = o => {
        o = o || {};
        const mine = { id: 't_me', isChar: true, charId: 'c_a', ownerId: 'u_a', x: 0, y: 0, w: 50, h: 50 }, orc = Object.assign({ id: 't_npc', isChar: true, charId: 'c_n', x: 300, y: 0, w: 50, h: 50 }, o.orc || {});
        const camp = { id: 'k', activeItemId: 'm1', system: sysR3, chars: { c_a: { id: 'c_a', name: 'Ana', ownerId: 'u_a', npc: false, values: {} }, c_n: { id: 'c_n', name: 'Orc', npc: true, values: {} } },
            items: { m1: { id: 'm1', type: 'map', meta: { gridType: 'square' }, whiteboard: [mine, orc] }, m2: { id: 'm2', type: 'map', meta: { gridType: 'square' }, whiteboard: [] } } };
        const roster = { pA: { id: 'u_a', name: 'Pat', location: 'm1' } }; if (o.bo !== false) roster.pB = { id: 'u_b', name: 'Bo', location: o.boAt || 'm1' };
        const conns = [{ peer: 'pA', open: true, send() {} }, { peer: 'pB', open: o.boOpen !== false, send() {} }];
        const net = { active: true, role: 'host', paused: false, targets: o.targets !== undefined ? o.targets : { u_a: { id: 't_npc', mapId: 'm1', name: 'Pat' }, u_gm: { id: 't_npc', mapId: 'm1', name: 'GM' } }, combats: {}, conns, roster };
        const asked = [], landed = [];
        const win = { wpFormula: Fx, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {}, tokenCtxFor: o.gmCtx || (() => null) }, wpVtt: { on: () => true, rulesOn: () => true }, wpDiceCore: null,
            wpFog: { fogDropIds: (pid, c, m) => { asked.push(pid); return (o.unseenBy || []).indexOf(pid) >= 0 ? { t_npc: 1 } : null; } } };
        const fogLanded = (mapId, fn) => { landed.push(mapId); return fn(); };
        return { camp, net, win, asked, landed, fogLanded };
    };
    const roll = (expr, o) => {
        o = o || {}; const W = world(o), out = { table: [], sent: [], notes: [] }, conn = { peer: 'pA', send(m) { packCheck(m); out.sent.push(JSON.parse(JSON.stringify(m))); } }; if (o.sys) W.camp.system = o.sys;
        const msg = Object.assign({ type: 'roll-req', rid: 'q1', expr: expr, charId: 'c_a', label: 'Shot' }, o.msg || {});
        new Function('msg', 'conn', 'net', 'DC', 'SC', 'window', 'getActiveCampaign', 'peerPaused', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'fogLanded', 'turnNote', 'var diceLimit = null, _diceSlowSaid = {};\n' + helpers + rtSrc + '\n' + rqSrc)(
            msg, conn, W.net, () => Dx, () => Sx, W.win, () => W.camp, () => false, e => { throw e; }, rec => { packCheck(rec); out.table.push(JSON.parse(JSON.stringify(rec))); }, () => {}, () => {}, W.fogLanded, (c, text, cid) => out.notes.push([c === conn, text, cid]));
        return { pub: out.table.length === 1 && out.sent.length === 0 && !out.table[0].priv, priv: out.table.length === 0 && out.sent.length === 1 && out.sent[0].priv === 'gm' && out.sent[0].type === 'roll', notes: out.notes, asked: W.asked, landed: W.landed, rec: out.table[0] || out.sent[0] };
    };
    const NOTE = [[true, 'Rolled privately: a player on that map cannot see your target.', 'c_a']];
    const sysPa = Sx.cleanSystem({ v: 1, name: 'Pa', rolls: [], fields: [{ id: 'f_a', key: 'A', kind: 'number', def: 4, vis: 'all' }], combat: { postureOnAttack: true, cover: { on: true, mods: { half: -2 } }, postures: [{ id: 'standing', name: 'Standing' }, { id: 'p_flat', name: 'Flat', ranged: -4, aimed: true }] } }, { F: Fx, gmView: true });
    const pa1 = roll('d20 + Target.CoverOrPosture', { sys: sysPa, orc: { posture: 'p_flat' } }), pa2 = roll('d20 + A', { sys: sysPa, orc: { posture: 'p_flat' } }), pa3 = roll('d20 + Target.PostureRanged', { sys: sysPa, orc: { posture: 'p_flat' }, unseenBy: ['u_b'] }), pa4 = roll('d20 + Target.CoverOrPosture', { sys: sysPa, orc: {} });
    check('1.6.0 an attack reads its target\'s posture (roll-req, run for real): worked out on the host from the target\'s own token, with nothing named in the message; the card says which counted; a roll that reads none of the names says nothing; a player who cannot see the target keeps it private, as the range does; a target standing as a posture says nothing',
        pa1.pub && JSON.stringify(pa1.rec.pos) === JSON.stringify({ n: 'Flat', by: 'posture', a: 1 }) && pa2.pub && !('pos' in pa2.rec) && pa3.priv && JSON.stringify(pa3.notes) === JSON.stringify(NOTE) && pa4.pub && !('pos' in pa4.rec), JSON.stringify([pa1.rec, pa2.rec, pa3.priv, pa4.rec]));
    const hid = roll('d20 + RangeMod', { unseenBy: ['u_b'] }), seen = roll('d20 + RangeMod'), elsewhere = roll('d20 + RangeMod', { unseenBy: ['u_b'], boAt: 'm2' }), closed = roll('d20 + RangeMod', { unseenBy: ['u_b'], boOpen: false }), alone = roll('d20 + RangeMod', { unseenBy: ['u_b'], bo: false });
    const plain = roll('d20 + A', { unseenBy: ['u_b'] }), derived = roll('d20 + Atk', { unseenBy: ['u_b'] }), dist = roll('d20 + TargetDistance', { unseenBy: ['u_b'] }), branch = roll('if(0, RangeMod, 1) + d20', { unseenBy: ['u_b'] });
    const noTarget = roll('d20 + RangeMod', { unseenBy: ['u_b'], targets: {} }), already = roll('d20 + RangeMod', { unseenBy: ['u_b'], msg: { priv: 'gm' } }), selfUnseen = roll('d20 + RangeMod', { unseenBy: ['u_a'] });
    check('range R3 roll-req (host, run for real): a public roll reading RangeMod goes to the roller and the GM alone, with a note to its roller, while another player on that map cannot see the target (the fog asked as them, with every open drag at its start); it stays public when they see it, are on another map, have no open connection or are not at the table, and when the roller alone would not see it',
        hid.priv && j(hid.notes) === j(NOTE) && hid.asked.indexOf('u_b') >= 0 && hid.landed.filter(m => m === 'm1').length >= 2
        && [seen, elsewhere, closed, alone, selfUnseen].every(r => r.pub && r.notes.length === 0), j([hid, seen, elsewhere, closed, alone, selfUnseen].map(r => [r.pub, r.priv, r.notes.length, r.asked])));
    check('range R3 roll-req: what counts as reading the range — RangeMod or TargetDistance, a field worked out from them (Atk = 10 + RangeMod), or a name in a branch the roll does not take (the card shows its text); a roll reading neither stays public, one with no target too, and one already private stays private with no note',
        [derived, dist, branch].every(r => r.priv && j(r.notes) === j(NOTE)) && plain.pub && noTarget.pub && already.priv && already.notes.length === 0, j([derived, dist, branch, plain, noTarget, already].map(r => [r.pub, r.priv, r.notes.length])));
    // the GM's own roll: the sheet's token context carries the range with its target and map
    const gmRoll = (expr, o) => {
        o = o || {}; const W = world(Object.assign({ gmCtx: () => (o.ctx === undefined ? { facing: null, stance: null, range: { mod: -4, dist: 10, tid: 't_npc', mapId: 'm1' } } : o.ctx) }, o)), out = { table: [], pushed: [], toasts: [] };
        const dr = new Function('net', 'DC', 'SC', 'window', 'getActiveCampaign', 'getProfile', 'toast', 'ui', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'fogLanded', 'var _dicePending = null;\n' + helpers + rtSrc + '\n' + drSrc + '\nreturn net.diceRoll;')(
            W.net, () => Dx, () => Sx, W.win, () => W.camp, () => ({ id: 'u_gm', name: 'GM' }), t => out.toasts.push(t), k => (k === 'chatTo' ? { value: '' } : null), e => { throw e; }, rec => { packCheck(rec); out.table.push(JSON.parse(JSON.stringify(rec))); }, (rec, res, scope) => out.pushed.push([scope, rec.priv || '']), () => {}, W.fogLanded);
        const ret = dr(expr, { charId: 'c_n', label: 'Axe' });
        return { priv: !!ret && ret.priv === true && out.table.length === 0 && j(out.pushed) === j([['whisper', 'gm']]), pub: !!ret && ret.priv === false && out.table.length === 1, toasts: out.toasts };
    };
    const gHid = gmRoll('d20 + RangeMod', { unseenBy: ['u_b'] }), gSeen = gmRoll('d20 + RangeMod'), gPlain = gmRoll('d20 + A', { unseenBy: ['u_b'] }), gNone = gmRoll('d20 + RangeMod', { unseenBy: ['u_b'], ctx: null });
    const gHidden = gmRoll('d20 + RangeMod', { orc: { hidden: true } }), gAllIn = gmRoll('d20 + RangeMod', { unseenBy: ['u_a'] });
    check('range R3 the GM\'s own roll (net.diceRoll, run for real): reading the range to a target a player on that map cannot see — out of their sight, or one the GM hid — keeps it the GM\'s, with the toast; every player seeing it, a roll reading no range, or no range at all leaves it public',
        gHid.priv && j(gHid.toasts) === j(['Kept private: a player on that map cannot see its target (Axe).']) && gHidden.priv && gAllIn.priv && [gSeen, gPlain, gNone].every(r => r.pub && r.toasts.length === 0),
        j([gHid, gSeen, gPlain, gNone, gHidden, gAllIn]));
})());
// 1.6.0 (B5, a called shot by the target's own location): the host judges the location row a roller picked on its target (the real roll-req
// branch, the GM's own net.diceRoll, the hit-ask and hit-rows branches, with the real rangeTo, the targethit slice, systemcore, the formula engine
// and dicecore); a player names a row only beside a named roll, never one kept from players nor one the target lacks, reads it through the
// players' view, and a roll that reads it is kept private as one reading the range is; the GM's own roll reading a figure players would read
// otherwise stays the GM's
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js')), Dx = await import(url('dicecore.js'));
    const rtSrc = between('// [netcheck:rangeto-start]', '// [netcheck:rangeto-end]', 'rangeto', 'netfight.js'), thSrc = require('./checkkit').netState('fight') + between('// [netcheck:targethit-start]', '// [netcheck:targethit-end]', 'targethit', 'netfight.js');   // the open hit-ask and the limiters stand in net.js's own lines above the fights (area 9)
    const rqSrc = (ordersSrc + '\n' + between('// [netcheck:rollreq-start]', '// [netcheck:rollreq-end]', 'rollreq')), drSrc = between('// [netcheck:diceroll-start]', '// [netcheck:diceroll-end]', 'diceroll');
    const askSrc = between('// [netcheck:hitask-start]', '// [netcheck:hitask-end]', 'hitask'), rowsSrc = between('// [netcheck:hitrows-start]', '// [netcheck:hitrows-end]', 'hitrows');
    const lineOf = (k, file) => { const t = typeof file === 'string' ? require('./checkkit').part(file) : src, i = t.indexOf(k); if (i < 0) throw new Error('netcheck: ' + k + ' not found'); return t.slice(i, t.indexOf('\n', i)); };   // file: a part of net.js, read by its own name
    const helpers = ['function own(', 'function peerProfileId(', 'function fxLib(', 'function itemLib(', 'function diceFrom(', 'function fogDrop('].map(lineOf).join('\n') + '\n';
    const sysH = Sx.cleanSystem({ v: 1, name: 'H', fields: [{ id: 'f_locs', key: 'Locs', label: 'Locations', kind: 'item-list', vis: 'all', edit: 'owner', list: { stats: [{ key: 'pen', label: 'Penalty' }, { key: 'sz', label: 'Size' }, { key: 'hp', label: 'HP' }], cols: [{ key: 'aim', label: 'Aim', formula: 'Row.pen + Row.sz' }] } }],
        rolls: [{ id: 'r_aim', label: 'Aim', formula: '3d6 + Target.Hit.aim', vis: 'all' }, { id: 'r_cut', label: 'Cut', formula: '1d6 + Target.Hit.aim', vis: 'all', dmg: true }],
        items: [{ id: 'i_torso', name: 'Torso', stats: { pen: 0, sz: 0, hp: 20 } }, { id: 'i_servo', name: 'Servo-arm', stats: { pen: -2, sz: -3, hp: 6 } }, { id: 'i_core', name: 'Core', vis: 'gm', stats: { pen: -9, sz: 0, hp: 3 } }],
        combat: { blastAuto: 'full', blastRoller: 'owner', hpResource: '', targetHit: 'f_locs' } }, { F: Fx, gmView: true });
    const unitRows = () => [{ id: 'w_tor', defId: 'i_torso', qty: 1 }, { id: 'w_srv', defId: 'i_servo', qty: 1 }, { id: 'w_cor', defId: 'i_core', qty: 1 }, { id: 'w_hid', defId: 'i_servo', qty: 1, hid: 1 }];
    const world = o => {
        o = o || {};
        const mine = { id: 't_me', isChar: true, charId: 'c_a', ownerId: 'u_a', x: 0, y: 0, w: 50, h: 50 }, unit = Object.assign({ id: 't_npc', isChar: true, charId: 'c_n', x: 300, y: 0, w: 50, h: 50 }, o.unit || {});
        const camp = { id: 'k', activeItemId: 'm1', system: o.sys || sysH, chars: { c_a: { id: 'c_a', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_locs: [{ id: 'w_ahand', defId: 'i_torso', qty: 1 }] } }, c_n: { id: 'c_n', name: 'Unit Nine', npc: true, values: { f_locs: unitRows() } } },
            items: { m1: { id: 'm1', type: 'map', meta: { gridType: 'square' }, whiteboard: [mine, unit] } } };
        const roster = { pA: { id: 'u_a', name: 'Pat', location: 'm1' } }; if (o.bo !== false) roster.pB = { id: 'u_b', name: 'Bo', location: 'm1' };
        const conns = [{ peer: 'pA', open: true, send() {} }, { peer: 'pB', open: true, send() {} }];
        const net = { active: true, role: 'host', paused: false, targets: o.targets !== undefined ? o.targets : { u_a: { id: 't_npc', mapId: 'm1', name: 'Pat' } }, combats: {}, conns, roster };
        const win = { wpFormula: Fx, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {}, tokenCtxFor: o.gmCtx || (() => null) }, wpVtt: { on: () => true, rulesOn: () => true }, wpDiceCore: null,
            wpFog: { coverGrade: () => o.grade || 0, fogDropIds: (pid) => ((o.unseenBy || []).indexOf(pid) >= 0 ? { t_npc: 1 } : null) } };
        return { camp, net, win, fogLanded: (mapId, fn) => fn() };
    };
    const roll = (expr, msgX, o) => {
        o = o || {}; const W = world(o), out = { table: [], sent: [], notes: [] }, conn = { peer: 'pA', send(m) { packCheck(m); out.sent.push(JSON.parse(JSON.stringify(m))); } };
        const msg = Object.assign({ type: 'roll-req', rid: 'q1', expr: expr, charId: 'c_a', label: 'Aim' }, msgX || {});
        new Function('msg', 'conn', 'net', 'DC', 'SC', 'window', 'getActiveCampaign', 'peerPaused', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'fogLanded', 'turnNote', 'var diceLimit = null, _diceSlowSaid = {};\n' + helpers + rtSrc + '\n' + thSrc + '\n' + rqSrc)(
            msg, conn, W.net, () => Dx, () => Sx, W.win, () => W.camp, () => false, e => { throw e; }, rec => { packCheck(rec); out.table.push(JSON.parse(JSON.stringify(rec))); }, rec => { out.pushed = JSON.parse(JSON.stringify(rec)); }, () => {}, W.fogLanded, (c, text) => out.notes.push(text));
        const rec = out.table[0] || out.sent.find(m => m.type === 'roll') || null, deny = out.sent.find(m => m.type === 'roll-deny') || null;
        return { pushed: out.pushed, pub: out.table.length === 1 && !out.table[0].priv, priv: out.table.length === 0 && !!rec && rec.priv === 'gm', aim: rec && Array.isArray(rec.names) ? (rec.names.find(n => n.name === 'Target.Hit.aim') || {}).value : undefined, rec, deny: deny ? deny.message || deny.reason : '', notes: out.notes };
    };
    const servo = roll('3d6 + Target.Hit.aim', { act: 'r_aim', hit: 'w_srv' }), torso = roll('3d6 + Target.Hit.aim', { act: 'r_aim', hit: 'w_tor' }), none = roll('3d6 + Target.Hit.aim', { act: 'r_aim' });
    check('1.6.0 (B5) roll-req (host, run for real): a player\'s named roll aimed at a row of their own target reads that row through their view, a Size -3 servo-arm at -5 and the torso at 0, on a public card; with no row picked it reads 0',
        servo.pub && servo.aim === -5 && torso.pub && torso.aim === 0 && none.pub && none.aim === 0 && !servo.deny, j([servo.aim, torso.aim, none.aim, servo.deny]));
    const core = roll('3d6 + Target.Hit.aim', { act: 'r_aim', hit: 'w_cor' }), hidR = roll('3d6 + Target.Hit.aim', { act: 'r_aim', hit: 'w_hid' }), ownR = roll('3d6 + Target.Hit.aim', { act: 'r_aim', hit: 'w_ahand' }), nopeR = roll('3d6 + Target.Hit.aim', { act: 'r_aim', hit: 'w_nope' });
    const noTgt = roll('3d6 + Target.Hit.aim', { act: 'r_aim', hit: 'w_srv' }, { targets: {} }), hiddenTgt = roll('3d6 + Target.Hit.aim', { act: 'r_aim', hit: 'w_srv' }, { unit: { hidden: true } });
    const NOT = 'That location is not on your target now.';
    check('1.6.0 (B5) roll-req: the host refuses a row a player may not name, before anything is rolled: a GM-only entry, one kept out of their sight, a row of their own sheet (the target lacks it), a row that is not there, and any row with no target or a target the GM hid',
        [core, hidR, ownR, nopeR, noTgt, hiddenTgt].every(r => r.deny === NOT && !r.rec), j([core, hidR, ownR, nopeR, noTgt, hiddenTgt].map(r => r.deny)));
    const typed = roll('3d6 + Target.Hit.hp', { hit: 'w_srv' }), other = roll('3d6 + Target.Hit.hp', { act: 'r_aim', hit: 'w_srv' });
    check('1.6.0 (B5) roll-req: a player cannot name another figure of the row: a pick only stands beside a named roll whose formula the host rebuilds (a typed roll with a pick is not read, and a named roll reading another stat does not match its button)',
        typed.deny === 'That roll could not be read.' && !typed.rec && other.deny === 'That roll does not match its button now.' && !other.rec, j([typed.deny, other.deny]));
    const unseen = roll('3d6 + Target.Hit.aim', { act: 'r_aim', hit: 'w_srv' }, { unseenBy: ['u_b'] }), cut = roll('1d6 + Target.Hit.aim', { act: 'r_cut', hit: 'w_srv' }), cutNo = roll('1d6 + Target.Hit.aim', { act: 'r_cut' });
    check('1.6.0 (B5) roll-req: a roll that reads Target.Hit is read with the range, so its card goes to its roller and the GM alone while another player on that map cannot see the target; a damage roll aimed so carries the row on the host\'s record for Apply to target, and one aimed nowhere none',
        unseen.priv && unseen.notes.length === 1 && cut.pub && cut.rec.hit === 'w_srv' && cut.rec.dmg === 1 && !('hit' in cutNo.rec) && !('hit' in servo.rec), j([unseen.priv, cut.rec, cutNo.rec]));
    // the GM's own roll (net.diceRoll): this machine's own word, any row of the target; a figure players would read otherwise keeps it the GM's
    const gmRoll = (expr, o, oo) => {
        oo = oo || {}; const W = world(Object.assign({ gmCtx: () => ({ facing: null, stance: null, range: { mod: 0, dist: 6, tid: 't_npc', mapId: 'm1' } }) }, oo)), out = { table: [], pushed: [], toasts: [] };
        const dr = new Function('net', 'DC', 'SC', 'window', 'getActiveCampaign', 'getProfile', 'toast', 'ui', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'fogLanded', 'var _dicePending = null;\n' + helpers + rtSrc + '\n' + thSrc + '\n' + drSrc + '\nreturn net.diceRoll;')(
            W.net, () => Dx, () => Sx, W.win, () => W.camp, () => ({ id: 'u_gm', name: 'GM' }), t => out.toasts.push(t), k => (k === 'chatTo' ? { value: '' } : null), e => { throw e; }, rec => { packCheck(rec); out.table.push(JSON.parse(JSON.stringify(rec))); }, (rec, res, scope) => out.pushed.push([scope, rec.priv || '', rec.hit || '']), () => {}, W.fogLanded);
        const ret = dr(expr, Object.assign({ charId: 'c_a', label: 'Shot' }, o));
        return { ret, pub: !!ret && ret.priv === false && out.table.length === 1, priv: !!ret && ret.priv === true && out.table.length === 0, toasts: out.toasts, pushed: out.pushed };
    };
    const gCore = gmRoll('3d6 + Target.Hit.aim', { act: 'r_aim', hit: 'w_cor' }), gServo = gmRoll('3d6 + Target.Hit.aim', { act: 'r_aim', hit: 'w_srv' }), gNope = gmRoll('3d6 + Target.Hit.aim', { act: 'r_aim', hit: 'w_nope' }), gCut = gmRoll('1d6 + Target.Hit.aim', { act: 'r_cut', hit: 'w_cor' }), gHid = gmRoll('3d6 + Target.Hit.aim', { act: 'r_aim', hit: 'w_hid' });
    check('1.6.0 (B5) the GM\'s own roll (net.diceRoll, run for real): the GM may aim at any row of the target the sheet reads; one players would read otherwise (a GM-only entry) keeps the roll the GM\'s with its toast, one they read alike stays public; a row the target lacks and one kept out of sight are refused; a damage roll keeps the row for Apply to target',
        gCore.priv && gCore.toasts.length === 1 && /Kept private: it reads a figure of its target/.test(gCore.toasts[0]) && gServo.pub && gServo.toasts.length === 0 && gNope.ret && gNope.ret.error === 'That location is not on the target now.' && gHid.ret && gHid.ret.error === 'That location is not on the target now.' && gCut.priv && gCut.pushed[0][2] === 'w_cor', j([gCore, gServo, gNope.ret, gCut.ret, gCut.pushed]));
    // hit-ask (host) and hit-rows (a player's app): which locations a player's target has, the rows a pick of theirs may name, by id and name
    const ask = (msg, o) => {
        o = o || {}; const W = world(o), sent = [], conn = { peer: 'pA', send(m) { packCheck(m); sent.push(JSON.parse(JSON.stringify(m))); } };
        new Function('msg', 'conn', 'net', 'DC', 'SC', 'window', 'getActiveCampaign', 'sendFailed', 'fogLanded', helpers + rtSrc + '\n' + thSrc + '\n' + 'if (true) {\n' + askSrc + '\n}')(Object.assign({ type: 'hit-ask', rid: 'qa1', charId: 'c_a' }, msg || {}), conn, W.net, () => Dx, () => Sx, W.win, () => W.camp, e => { throw e; }, W.fogLanded);
        return sent;
    };
    const a1 = ask(), aNo = ask(null, { targets: {} }), aNpc = ask({ charId: 'c_n' }), aBad = ask({ rid: '<x>' }), aHid = ask(null, { unseenBy: ['u_a'] });
    check('1.6.0 (B5) hit-ask (host, run for real): a player\'s own character with a target is answered with that target\'s rows a pick of theirs may name, each an id and its name and nothing else (never the GM-only Core nor a row kept out of their sight); no target, a target their sight drops and a character not theirs get no row; a question that is not well formed is not answered',
        j(a1) === j([{ type: 'hit-rows', rid: 'qa1', rows: [{ id: 'w_tor', name: 'Torso' }, { id: 'w_srv', name: 'Servo-arm' }] }]) && j(aNo) === j([{ type: 'hit-rows', rid: 'qa1', rows: [] }]) && j(aNpc) === j(aNo) && aBad.length === 0 && j(aHid) === j(aNo), j([a1, aNo, aNpc, aBad, aHid]));
    const ridOf = () => { let r = ''; const net = { role: 'client', foreign: true, syncedPeer: 'pH', active: true, conns: [{ open: true, send(m) { r = m.rid; } }] }; new Function('net', 'setTimeout', 'clearTimeout', thSrc + '\nhitsKnow(true);\nnet.hitRows("c_a", function() {});')(net, () => 1, () => {}); return r; };
    const BAD = '<img src=x onerror=alert(1)>Arm';
    const answered = (() => { const got = [], sent = []; const net = { role: 'client', foreign: true, syncedPeer: 'pH', stream: false, active: true, conns: [{ open: true, send(m) { sent.push(m); } }] };
        const run = new Function('net', 'setTimeout', 'clearTimeout', 'got', thSrc + '\nhitsKnow(true);\nnet.hitRows("c_a", function(r) { got.push(r); });\nreturn function(msg, conn) {\nif (true) {\n' + rowsSrc + '\n}\n};')(net, () => 1, () => {}, got);
        run({ type: 'hit-rows', rid: 'zzz', rows: [{ id: 'w_x', name: 'X' }] }, { peer: 'pH' });   // another question's answer: not taken
        run({ type: 'hit-rows', rid: sent[0].rid, rows: [{ id: 'w_x', name: 'X' }] }, { peer: 'pOther' });   // not the synced host: not taken
        run({ type: 'hit-rows', rid: sent[0].rid, rows: [{ id: 'w_a', name: BAD + '\u0007' }, { id: 'bad id', name: 'Y' }, { id: 'w_a', name: 'Again' }, { id: 'w_b', name: 7 }, { id: 'w_c', name: '' }, 'nope'] }, { peer: 'pH' });
        run({ type: 'hit-rows', rid: sent[0].rid, rows: [] }, { peer: 'pH' });   // a second answer: the question is closed
        return { got, sent }; })();
    const oldHost = (() => { const got = []; const net = { role: 'client', foreign: true, syncedPeer: 'pH', active: true, conns: [{ open: true, send() { got.push('sent'); } }] }; new Function('net', 'setTimeout', 'clearTimeout', 'got', thSrc + '\nhitsKnow(undefined);\nnet.hitRows("c_a", function(r) { got.push(r); });')(net, () => 1, () => {}, got); return got; })();
    check('1.6.0 (B5) hit-rows (a player\'s app, run for real): the answer to its own open question, from the synced host only and once, each row an id of a row and its name as text (a hostile name kept as the very text, control characters out, a repeat, a bad id, a name that is no text dropped, an empty name said as A location); a host whose snapshot did not say hits is never asked',
        answered.sent.length === 1 && answered.sent[0].type === 'hit-ask' && answered.sent[0].charId === 'c_a' && j(answered.got) === j([[{ id: 'w_a', name: BAD }, { id: 'w_c', name: 'A location' }]]) && j(oldHost) === j([null]) && typeof ridOf() === 'string',
        j([answered, oldHost]));
    // 1.6.0 Where a hit behind cover lands: a damage roll at a target behind cover, the host's die, on a player's roll and the GM's own
    const sysC = Sx.cleanSystem(Object.assign({}, sysH, { combat: Object.assign({}, sysH.combat, { cover: { on: true, style: 'graded', hit: { threeq: [{ from: 1, to: 3, row: 'Row.pen = -2' }, { from: 4, to: 6, row: 'Row.pen = -9' }] } } }) }), { F: Fx, gmView: true });
    const cvO = { sys: sysC, grade: 2 }, runs = Array.from({ length: 30 }, () => roll('1d6', { act: 'r_cover' }, Object.assign({ sys: Sx.cleanSystem(Object.assign({}, sysC, { rolls: sysC.rolls.concat([{ id: 'r_cover', label: 'Wound', formula: '1d6', vis: 'all', dmg: true }]) }), { F: Fx, gmView: true }) }, { grade: 2 })));
    check('1.6.0 roll-req (host, run for real): a player\'s damage roll at a target behind cover rolls the host\'s die: its card goes to the table with the die and never the row, a location kept from players is called a location, and the host\'s own copy holds the row for Apply to target',
        runs.every(r => r.pub && r.rec.dmg === 1 && !('hit' in r.rec) && r.rec.cvh && r.rec.cvh.of === 6 && (r.rec.cvh.d <= 3 ? r.rec.cvh.n === 'Servo-arm' && r.pushed.hit === 'w_srv' : r.rec.cvh.n === 'a location' && r.pushed.hit === 'w_cor')) && runs.some(r => r.rec.cvh.d <= 3) && runs.some(r => r.rec.cvh.d > 3), j(runs.slice(0, 2).map(r => [r.rec.cvh, r.pushed && r.pushed.hit])));
    const cvAt = roll('1d6 + Target.Hit.aim', { act: 'r_cut', hit: 'w_srv' }, cvO), cvOff = roll('1d6 + Target.Hit.aim', { act: 'r_cut', hit: 'w_srv' }, { sys: sysC, grade: 0 }), cvAtk = roll('3d6 + Target.Hit.aim', { act: 'r_aim', hit: 'w_srv' }, cvO), cvNone = roll('1d6 + Target.Hit.aim', { act: 'r_cut', hit: 'w_srv' }, { grade: 2 });
    check('1.6.0 roll-req: a called shot at a part the rows name stands with no die; with no cover, on a roll that is no damage roll, or with no such rule, the card says nothing and a pick is as it was',
        cvAt.rec.cvh && cvAt.rec.cvh.st === 1 && cvAt.rec.cvh.n === 'Servo-arm' && cvAt.rec.cvh.d === undefined && cvAt.pushed.hit === 'w_srv' && !cvOff.rec.cvh && cvOff.rec.hit === 'w_srv' && !cvAtk.rec.cvh && !cvNone.rec.cvh && cvNone.rec.hit === 'w_srv', j([cvAt.rec.cvh, cvOff.rec, cvAtk.rec, cvNone.rec]));
    const cvG = (hit, oo) => { const out = { table: [], pushed: [] }, W = world(Object.assign({ sys: sysC, gmCtx: () => ({ range: { mod: 0, dist: 6, tid: 't_npc', mapId: 'm1', cgrade: 2 } }) }, oo || {}));
        const dr = new Function('net', 'DC', 'SC', 'window', 'getActiveCampaign', 'getProfile', 'toast', 'ui', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'fogLanded', 'var _dicePending = null;\n' + helpers + rtSrc + '\n' + thSrc + '\n' + drSrc + '\nreturn net.diceRoll;')(W.net, () => Dx, () => Sx, W.win, () => W.camp, () => ({ id: 'u_gm', name: 'GM' }), () => {}, k => (k === 'chatTo' ? { value: '' } : null), e => { throw e; }, rec => { out.table.push(JSON.parse(JSON.stringify(rec))); }, rec => out.pushed.push(JSON.parse(JSON.stringify(rec))), () => {}, W.fogLanded);
        const ret = dr('1d6 + Target.Hit.aim', Object.assign({ charId: 'c_a', label: 'Cut', act: 'r_cut' }, hit ? { hit } : {})); return { ret, table: out.table, pushed: out.pushed }; };
    const sysM = Sx.cleanSystem(Object.assign({}, sysC, { combat: Object.assign({}, sysC.combat, { cover: Object.assign({}, sysC.combat.cover, { mods: { threeq: -4 } }) }) }), { F: Fx, gmView: true });
    const gcT = cvG('w_tor'), gcS = cvG('w_srv'), gcB = cvG('w_tor', { gmCtx: () => ({ range: { mod: 0, dist: 6, tid: 't_npc', mapId: 'm1', cgrade: 2, pn: 'Low', pr: -4, aim: 1 } }) }), gcC = cvG('w_tor', { sys: sysM, gmCtx: () => ({ range: { mod: 0, dist: 6, tid: 't_npc', mapId: 'm1', cgrade: 2, pn: 'Low', pr: -2, aim: 1 } }) });
    check('1.6.0 the GM\'s own roll (net.diceRoll, run for real): a damage roll at a target behind cover aimed at a part the rows do not name takes the die, the host\'s copy holding where it landed and the table\'s the aim alone; one the rows name stands; a posture Target.Aimed reads keeps any pick, and one cover outdoes sets nothing aside',
        gcT.table[0].cvh && gcT.table[0].cvh.of === 6 && gcT.table[0].hit === 'w_tor' && ['w_srv', 'w_cor'].includes(gcT.pushed[0].hit) && gcS.table[0].cvh.st === 1 && gcS.pushed[0].hit === 'w_srv' && gcB.table[0].cvh.st === 1 && gcB.pushed[0].hit === 'w_tor' && gcC.table[0].cvh.of === 6 && !gcC.table[0].cvh.st, j([gcT, gcS.table, gcB.table, gcC.table]));
    const sysP = Sx.cleanSystem(Object.assign({}, sysC, { combat: Object.assign({}, sysC.combat, { postureOnAttack: true, postures: [{ id: 'standing', name: 'Standing' }, { id: 'p_low', name: 'Low', ranged: -4, aimed: true }] }) }), { F: Fx, gmView: true });
    const cvP = roll('1d6 + Target.Hit.aim', { act: 'r_cut', hit: 'w_tor' }, { sys: sysP, grade: 2, unit: { posture: 'p_low' } }), cvQ0 = roll('1d6 + Target.Hit.aim', { act: 'r_cut', hit: 'w_tor' }, { sys: sysP, grade: 2 });
    check('1.6.0 roll-req: a target in a posture whose hits land as aimed keeps a player\'s pick through the real range, and with none the pick takes the die',
        cvP.rec.cvh && cvP.rec.cvh.st === 1 && cvP.pushed.hit === 'w_tor' && cvQ0.rec.cvh && cvQ0.rec.cvh.of === 6, j([cvP.rec.cvh, cvQ0.rec.cvh]));
    const memo = (() => { const W = world(cvO), log = [], A = new Function('net', 'DC', 'SC', 'window', 'getActiveCampaign', helpers + rtSrc + '\n' + thSrc + '\nreturn { coverAimNote, coverHitIn, coverAimForget };')(W.net, () => Dx, () => Sx, W.win, () => W.camp), rc = { tid: 't_npc', mapId: 'm1', cgrade: 2 }, go = () => A.coverHitIn(W.camp, 'c_a', rc, '');
        A.coverAimNote(W.camp, 'c_a', rc, 'w_srv', () => true); log.push(go().stood === true, !(go() || {}).stood);   // kept for its damage, then used up
        A.coverAimNote(W.camp, 'c_a', rc, 'w_srv', () => true); A.coverAimNote(W.camp, 'c_a', rc, '', () => false); log.push(go().stood === true);   // a roll that reads no location leaves it
        A.coverAimNote(W.camp, 'c_a', rc, 'w_srv', () => true); A.coverAimNote(W.camp, 'c_a', rc, '', () => true); log.push(!(go() || {}).stood);   // No called shot on the next attack drops it
        A.coverAimNote(W.camp, 'c_a', rc, 'w_srv', () => true); log.push(!(A.coverHitIn(W.camp, 'c_a', Object.assign({}, rc, { tid: 't_me' }), '') || {}).stood);   // another target's hit
        A.coverAimNote(W.camp, 'c_a', rc, 'w_srv', () => true); A.coverAimForget(); log.push(!(go() || {}).stood);
        const Off = world({}), off = new Function('net', 'DC', 'SC', 'window', 'getActiveCampaign', helpers + rtSrc + '\n' + thSrc + '\nvar c = { n: 0 }; return { coverAimNote, keep: function() { return Object.keys(coverAims).length; } };')(Off.net, () => Dx, () => Sx, Off.win, () => Off.camp); off.coverAimNote(Off.camp, 'c_a', rc, 'w_srv', () => true); log.push(off.keep() === 0);
        return log; })();
    check('1.6.0 an attack\'s pick waits for its damage on the host (coverAimNote and coverHitIn, run for real): it stands once, a roll that reads no location leaves it, an attack with no pick drops it, it holds for that target alone, it goes with the table, and with no such rule nothing is kept',
        memo.length === 7 && memo.every(x => x === true), j(memo));
    // 1.6.3 (the review of defense fold 1, finding 5): a landed attack's damage (coverHitIn's alone) neither reads nor uses up the pick another attack of that
    // character left: its own location is the landing's; that pick still stands for its own damage after
    const memoL = (() => { const W = world(cvO), A = new Function('net', 'DC', 'SC', 'window', 'getActiveCampaign', helpers + rtSrc + '\n' + thSrc + '\nreturn { coverAimNote, coverHitIn };')(W.net, () => Dx, () => Sx, W.win, () => W.camp), rc = { tid: 't_npc', mapId: 'm1', cgrade: 2 };
        A.coverAimNote(W.camp, 'c_a', rc, 'w_srv', () => true); const a = A.coverHitIn(W.camp, 'c_a', rc, '', true), b = A.coverHitIn(W.camp, 'c_a', rc, '', true), c = A.coverHitIn(W.camp, 'c_a', rc, ''), d = A.coverHitIn(W.camp, 'c_a', rc, '', true);
        return [!(a || {}).stood, !(b || {}).stood, (c || {}).stood === true, !(d || {}).stood, (A.coverHitIn(W.camp, 'c_a', rc, 'w_srv', true) || {}).stood === true]; })();
    check('1.6.3 (the review of defense fold 1) a landed attack\'s damage neither reads nor uses up the pick another attack of that character left (coverHitIn with alone, run for real): with no location of its own it takes the die, twice, while the pick still stands for that other attack\'s own damage; a location of its own stands',
        memoL.every(x => x === true), j(memoL));
    check('1.6.0 (B5) the snapshot says hits (true) and a player\'s app reads it through typeof, true only; the host\'s hit-ask branch sits right after roll-req\'s, a player\'s request names a row only beside a named roll',
        /stage: land\.stage, hits: true, paused: net\.paused/.test(src) && /\n    if \(typeof hitsKnow === 'function'\) hitsKnow\(msg\.hits\);/.test(require('./checkkit').part('netfog.js')) && /\/\/ \[netcheck:rollreq-end\]\n    \} else if \(msg\.type === 'hit-ask' && net\.role === 'host'\) \{/.test(src)
        && src.includes("if (typeof o.hit === 'string' && o.charId && (req.act || req.fr || (req.row && typeof req.row.i === 'number' && typeof req.row.r === 'string'))) req.hit = o.hit;"));
})());
// Turn-based combat T2: a player's End turn — the host steps only for the player whose own character token has the turn, on the map they are on,
// for the row they saw (a stale or second press never skips the next character), turn-based combat on, not paused, rate-limited; the client
// offers it only then (net.myTurnTok) and sends the row it saw
{
    {   // initiative O1: a player's own initiative roll into the fight on their map, once (initIntoFight, run for real)
        const ifSrc = between('// [netcheck:initfight-start]', '// [netcheck:initfight-end]', 'initfight', 'netfight.js'), J = JSON.stringify;
        const mkIF = () => { const out = { bc: 0, rf: 0, toasts: [], logs: [] }, net = { role: 'host', combats: { m1: { mapId: 'm1', round: 2, turn: 1, rows: [{ id: 'r_a', name: 'Ana', tokId: 't_a', init: 18, src: null, rolled: 1 }, { id: 'r_g', name: 'Goblin', tokId: 't_g', init: 12, src: null, rolled: 1 }, { id: 'r_b', name: 'Bo', tokId: 't_b', init: 0, src: null }, { id: 'c_t', name: 'Trap', tokId: null, init: 5, src: null }] } } };
            const camp = { items: { m1: { type: 'map', whiteboard: [{ id: 't_a', isChar: true, charId: 'c_ana', ownerId: 'u_a' }, { id: 't_g', isChar: true, charId: 'c_gob' }, { id: 't_b', isChar: true, charId: 'c_bo', ownerId: 'u_b' }] }, m2: { type: 'map', whiteboard: [] } } };
            out.fn = new Function('net', 'own', 'SC', 'toast', 'logEvent', 'mapTitleOf', 'broadcastCombats', 'combatRefresh', "'use strict';\n" + ordersSrc + '\n' + ifSrc + '\nreturn initIntoFight;')(net, H.own, () => ({ orderByInit: rows => rows.map((r, i) => ({ r, i })).sort((a, b) => (b.r.init - a.r.init) || (a.i - b.i)).map(x => x.r) }), t => out.toasts.push(t), (k, t) => out.logs.push(t), () => 'Hall', () => out.bc++, () => out.rf++);
            return Object.assign(out, { net, camp }); };
        const W1 = mkIF(), got1 = W1.fn(W1.camp, 'm1', 'c_bo', 'u_b', 14.256), rows1 = W1.net.combats.m1.rows.map(r => r.id), turn1 = W1.net.combats.m1.turn, bo1 = W1.net.combats.m1.rows.find(r => r.id === 'r_b');
        const again = W1.fn(W1.camp, 'm1', 'c_bo', 'u_b', 30), rows1b = W1.net.combats.m1.rows.map(r => r.id);
        const W2 = mkIF(), none = [W2.fn(W2.camp, 'm1', 'c_ana', 'u_a', 25), W2.fn(W2.camp, 'm1', 'c_bo', 'u_a', 25), W2.fn(W2.camp, 'm2', 'c_bo', 'u_b', 25), W2.fn(W2.camp, 'm9', 'c_bo', 'u_b', 25), W2.fn(W2.camp, 'm1', 'c_gob', 'u_b', 25), W2.fn(W2.camp, 'm1', 'c_bo', 'u_b', NaN), W2.fn(W2.camp, 'm1', 'c_bo', '', 25)];
        const W3 = mkIF(); W3.net.role = 'client'; const cl3 = W3.fn(W3.camp, 'm1', 'c_bo', 'u_b', 14);
        check('initiative O1 (host, run for real): a player\'s own initiative roll sets their row\'s number in the combat on the map they are on when it has none yet (rounded to the hundredth, marked rolled), the order re-sorts by initiative and whoever\'s turn it is keeps it; one broadcast, the GM told the number and the place; a second roll, a row with a number, another player\'s token, an NPC\'s, another map, no combat, a total that is no number, no profile or a player\'s app: nothing',
            got1 === true && J(rows1) === J(['r_a', 'r_b', 'r_g', 'c_t']) && turn1 === 2 && bo1.init === 14.26 && bo1.rolled === 1 && W1.bc === 1 && W1.rf === 1 && J(W1.toasts) === J(['Bo rolled initiative: 14.26, now 2 of 4.']) && W1.logs.length === 1
            && again === false && J(rows1b) === J(rows1) && W1.bc === 1 && none.every(x => x === false) && W2.bc === 0 && J(W2.net.combats.m1.rows.map(r => r.init)) === J([18, 12, 0, 5]) && cl3 === false, J([rows1, turn1, bo1, W1.toasts, none]));
        const W4 = mkIF(); W4.camp.chars = { c_bo: { id: 'c_bo' }, c_gob: { id: 'c_gob' } }; W4.camp.system = { id: 'sys' }; let tieArgs = null, tieSeen = null;
        const fn4 = new Function('net', 'own', 'SC', 'toast', 'logEvent', 'mapTitleOf', 'broadcastCombats', 'combatRefresh', 'window', "'use strict';\n" + ordersSrc + '\n' + ifSrc + '\nreturn initIntoFight;')(W4.net, H.own, () => ({ initTie: (sys, F, charOf) => { tieArgs = [sys, F, charOf]; return { steps: [{ roll: false }] }; }, orderByInit: (rows, tie) => { tieSeen = tie; return rows; } }), () => {}, () => {}, () => 'Hall', () => {}, () => {}, { wpFormula: 'F!' });
        W4.net.combats.m1.rows[2].tb = [null, [4]]; fn4(W4.camp, 'm1', 'c_bo', 'u_b', 9);
        check('initiative O2 (host, run for real): a player\'s roll re-sorts with the system\'s tie steps — worked out on the host\'s system with its engine, each row\'s character found by its token on that map (none for a row with no token or a token with no character) — and their new number drops the row\'s old roll-offs; the host keeps roll-offs, never sent',
            !!tieArgs && tieArgs[0] === W4.camp.system && tieArgs[1] === 'F!' && tieArgs[2]({ tokId: 't_b' }) === W4.camp.chars.c_bo && tieArgs[2]({ tokId: 't_g' }) === W4.camp.chars.c_gob && tieArgs[2]({ tokId: 't_a' }) === null && tieArgs[2]({ tokId: null }) === null && j(tieSeen) === j({ steps: [{ roll: false }] }) && !('tb' in W4.net.combats.m1.rows.find(r => r.id === 'r_b'))
            && /if \(Array\.isArray\(r\.tb\)\) \{ var tb = r\.tb\.slice\(0, 3\)/.test(src), JSON.stringify(tieArgs && tieArgs.slice(0, 2)));
        const rrSrc = (ordersSrc + '\n' + between('// [netcheck:rollreq-start]', '// [netcheck:rollreq-end]', 'rollreq'));
        check('initiative O1 (source): the roll request takes a player\'s own initiative roll into the fight after the roll goes out — only when the entry it was rebuilt from is the system\'s initiative roll; players never get a row\'s number or its rolled mark (combatRowOut)',
            rrSrc.includes("if (actQ && actQ.init === true && typeof initIntoFight === 'function') initIntoFight(campQ, locQ, q.charId, pidQ, resQ.value);") && rrSrc.indexOf('initIntoFight(campQ') > rrSrc.indexOf("else { sendTable(recQ, null);")
            && src.includes("function combatRowOut(r, i, unseen) { if (unseen) return { id: 'h' + i, name: 'Hidden', tokId: null, src: null, hid: 1 }; var o = { id: r.id, name: r.name, tokId: r.tokId, src: r.src }; if (r.held === 1) o.held = 1; return o; }") && /if \(r\.rolled === 1 \|\| r\.rolled === true\) o\.rolled = 1;/.test(src));
    }
    const teSrc = between('// [netcheck:turnend-start]', '// [netcheck:turnend-end]', 'turnend');
    const runTE = (msg, o) => {
        o = o || {}; const steps = [];
        const map = { type: 'map', whiteboard: [{ id: 't_pat', isChar: true, charId: 'c_p', ownerId: 'u_a' }, { id: 't_orc', isChar: true, charId: 'c_o' }, { id: 't_sam', isChar: true, charId: 'c_s', ownerId: 'u_b' }, { id: 't_box', isChar: false, ownerId: 'u_a' }] };
        const camp = { items: { m1: map, m2: { type: 'map', whiteboard: [] } } };
        const net = { role: 'host', paused: !!o.paused, roster: { pA: { id: 'u_a', location: o.loc || 'm1' } }, combats: { m1: Object.assign({ mapId: 'm1', round: 1, turn: o.turn === undefined ? 1 : o.turn, rows: [{ id: 'r_orc', tokId: 't_orc' }, { id: 'r_pat', tokId: 't_pat' }, { id: 'r_sam', tokId: 't_sam' }, { id: 'r_box', tokId: 't_box' }, { id: 'r_trap', tokId: null }] }, o.extra || {}) } };   // o.extra (1.6.3): what a turn shape keeps on a fight
        const own = (ob, k) => !!ob && Object.prototype.hasOwnProperty.call(ob, k);
        new Function('msg', 'conn', 'net', 'window', 'getActiveCampaign', 'peerPaused', 'allow', 'own', 'toast', 'broadcastCombats', 'combatRefresh', 'roundChanged', 'turnStarted', ordersSrc + '\n' + teSrc)(Object.assign({ type: 'turn-end' }, msg), { peer: 'pA' }, net,
            { wpVtt: { on: k => k === 'turns' ? o.turns !== false : true } }, () => camp, () => !!o.peerPaused, () => o.slow !== true, own, () => {}, () => {}, () => {}, () => {}, (m) => steps.push(m + ':1'));
        return steps;
    };
    const ok = { mapId: 'm1', row: 'r_pat' };
    check('turn-end (net.js, run for real): the player whose own character token has the turn steps the combat once, as the GM\'s Next turn',
        j(runTE(ok)) === j(['m1:1']));
    check('turn-end: nothing for a row they did not see on turn (stale, or someone else\'s), another\'s token, a GM token, a token that is not a character, a row with no token, another map than theirs, no row, turn-based combat off, a paused table or player, past the rate',
        [runTE({ mapId: 'm1', row: 'r_orc' }), runTE(ok, { turn: 0 }), runTE({ mapId: 'm1', row: 'r_sam' }, { turn: 2 }), runTE({ mapId: 'm1', row: 'r_box' }, { turn: 3 }), runTE({ mapId: 'm1', row: 'r_trap' }, { turn: 4 }),
            runTE({ mapId: 'm2', row: 'r_pat' }), runTE(ok, { loc: 'm2' }), runTE({ mapId: 'm1' }), runTE({ mapId: 'm1', row: 5 }), runTE(ok, { turns: false }), runTE(ok, { paused: true }), runTE(ok, { peerPaused: true }), runTE(ok, { slow: true }), runTE({ mapId: {}, row: 'r_pat' })].every(s => s.length === 0));
    {   // 1.6.3, Fulllion's ruling of 2026-11-20: "players should be able to pass their own round on their own, but not other's round. the gm is always able to pass or reverse
        // anyones rounds however". The host judges a player's End turn by the row on turn and its token alone, whatever the fight's turn shape keeps beside it (several
        // turns a round, a counting clock, a drawn order that ends the round at a card, a declaration under way), and a player has no way to step a fight back
        const shapes = [{}, { seq: ['r_orc', 'r_pat', 'r_orc', 'r_sam'], sq: 1 }, { ck0: { r_orc: 5, r_pat: 4, r_sam: 2 } }, { endAt: 3 }, { dec: { round: 1, lines: {}, open: 1 } }];
        const ruled = shapes.map(x => [j(runTE(ok, { extra: x })), runTE({ mapId: 'm1', row: 'r_orc' }, { extra: x, turn: 0 }).length, runTE(ok, { extra: x, turn: 0 }).length, runTE({ mapId: 'm1', row: 'r_sam' }, { extra: x, turn: 2 }).length]);
        const wbR = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'whiteboard.js'), 'utf8').replace(/\r\n/g, '\n');
        check('1.6.3 (Fulllion\'s ruling of 2026-11-20, run for real under every turn shape): a player ends their own turn, and no one else\'s (the row on turn being another\'s, or theirs named while another is on turn), under several turns a round, a counting clock, a drawn order and a declaration as with none; no message of a player\'s steps a fight back, the only steps a player reaches being their End turn and their own hold, and the strip\'s Previous and Next stand behind the host\'s own check',
            ruled.every(r => r[0] === j(['m1:1']) && r[1] === 0 && r[2] === 0 && r[3] === 0) && require('./checkkit').familyCount('net.js', "fightStep(fidT, 1, 'player', pkT)") === 1 && require('./checkkit').familyCount('net.js', 'fightStep(') === 5   /* moved on purpose by the merge of the two combat lanes: fightStep's batch wrapper (1.6.3, combat speed) calls fightStep again inside itself, so the four callers and the wrapper make five */
            && require('./checkkit').familyCount('net.js', "fightHold(fidH, 'player'") === 1 && wbR.includes("if (!(n && n.role === 'host' && am)) return;\n        var fidB = stripFightId(am.id); if (!fidB) return;") && wbR.includes("if (b.dataset.act === 'next') n.fightStep(fidB, 1);\n        else if (b.dataset.act === 'prev') n.fightStep(fidB, -1);"), j(ruled));
    }
    {   // initiative O3: holding a turn — net.combatHold / net.combatAct and the hold's end at a new round (combatStep), run for real
        const wbAll = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'whiteboard.js'), 'utf8').replace(/\r\n/g, '\n');
        const hsSrc = fnSrc('net.combatStep = function', '// [netcheck:turnhold-start]', 'combatStep', 'netfight.js') + between('// [netcheck:turnhold-start]', '// [netcheck:turnhold-end]', 'turnhold', 'netfight.js');
        const mkH = (turn, role) => { const out = { bc: 0, toasts: [], starts: 0 }, net = { role: role || 'host', combats: { m1: { mapId: 'm1', round: 1, turn: turn, rows: ['A', 'B', 'C', 'D'].map(x => ({ id: x, name: x, tokId: 't' + x, init: 0, src: null })) } } };
            new Function('net', 'own', 'toast', 'logEvent', 'mapTitleOf', 'broadcastCombats', 'combatRefresh', 'roundChanged', 'turnStarted', "'use strict';\n" + hsSrc + '\n' + ordersSrc)(net, H.own, t => out.toasts.push(t), () => {}, () => 'Hall', () => out.bc++, () => {}, () => {}, () => out.starts++);
            return Object.assign(out, { net, c: net.combats.m1, ids: () => net.combats.m1.rows.map(r => r.id + (r.held ? '*' : '')) }); };
        const H1 = mkH(1); H1.net.combatHold('m1'); const h1a = [H1.ids(), H1.c.turn, H1.c.round]; H1.net.combatStep('m1', 1); const h1b = [H1.ids(), H1.c.turn];
        const act1 = H1.net.combatAct('m1', 'B'), h1c = [H1.ids(), H1.c.turn, H1.c.rows[H1.c.turn].id]; H1.net.combatStep('m1', 1); const h1d = [H1.c.rows[H1.c.turn].id, H1.c.round];
        const H2 = mkH(1); H2.net.combatHold('m1'); H2.net.combatStep('m1', 1); H2.net.combatStep('m1', 1); const h2 = [H2.ids(), H2.c.round, H2.c.turn];
        const H3 = mkH(3); H3.net.combatHold('m1'); const h3 = [H3.ids(), H3.c.round, H3.c.turn];
        const H4 = mkH(1); H4.net.combatHold('m1'); const no4 = [H4.net.combatAct('m1', 'C'), H4.net.combatAct('m1', 'A'), H4.net.combatAct('m1', 'Z'), H4.net.combatAct('m9', 'B'), H4.net.combatAct('m1', 5)];
        const H5 = mkH(1, 'client'), no5 = [H5.net.combatHold('m1'), H5.net.combatAct('m1', 'B')];
        const H6 = mkH(1); H6.net.combatHold('m1'); H6.net.combatStep('m1', -1); const h6 = [H6.ids(), H6.c.turn];
        const J = JSON.stringify, mkR = (turn, tn, ended) => { const out = { toasts: [] }, net = { role: 'host', combats: { m1: { mapId: 'm1', round: 1, turn: turn, rows: ['A', 'B', 'C', 'D'].map(x => ({ id: x, name: x, tokId: 't' + x, init: 0, src: null })) } } };
            new Function('net', 'own', 'toast', 'logEvent', 'mapTitleOf', 'broadcastCombats', 'combatRefresh', 'roundChanged', 'turnStarted', 'getActiveCampaign', 'turnEnded', "'use strict';\n" + hsSrc + '\n' + ordersSrc)(net, H.own, t => out.toasts.push(t), () => {}, () => 'Hall', () => {}, () => {}, () => {}, () => {}, () => ({ system: { combat: { turn: tn } } }), ended);
            return Object.assign(out, { net, c: net.combats.m1, ids: () => net.combats.m1.rows.map(r => r.id + (r.held ? '*' : '')) }); };
        const R1 = mkR(3, { hold: 'next' }); R1.net.combatHold('m1'); const r1a = [R1.ids(), R1.c.round, R1.c.turn]; R1.net.combatStep('m1', 1); R1.net.combatStep('m1', 1); R1.net.combatStep('m1', 1); const r1b = [R1.ids(), R1.c.round, R1.c.rows[R1.c.turn].id];
        const R2 = mkR(1, { hold: 'next' }); R2.net.combatHold('m1'); R2.net.combatStep('m1', 1); R2.net.combatStep('m1', 1); const r2a = [R2.ids(), R2.c.round, R2.c.turn];
        const R3 = mkR(1, { holdAct: 'stay' }); R3.net.combatHold('m1'); const r3k = R3.net.combatAct('m1', 'B'), r3a = [R3.ids(), R3.c.turn, R3.c.rows[R3.c.turn].id]; R3.net.combatStep('m1', 1); const r3b = [R3.c.rows[R3.c.turn].id];
        check('1.6.0 the Combat tab\'s hold rules (host, run for real): lasting to its next turn, a hold on the round\'s last turn is kept into the next round and ends as that row\'s turn comes, and a hold made earlier lasts past the round\'s end; acting from a hold with the order kept ends the hold, moves no row and leaves the turn where it was',
            J(r1a) === J([['A', 'B', 'C', 'D*'], 2, 0]) && J(r1b) === J([['A', 'B', 'C', 'D'], 2, 'D']) && J(r2a) === J([['A', 'B*', 'C', 'D'], 2, 0]) && r3k === true && J(r3a) === J([['A', 'B', 'C', 'D'], 2, 'C']) && J(r3b) === J(['D']), J([r1a, r1b, r2a, r3a, r3b]));
        const hsE = (tn) => { const ended = [], out = mkR(1, tn, (m, c, row, round) => ended.push(row.id + '@' + round)); out.net.combatHold('m1'); return { ended, ids: out.ids() }; };
        const heOff = hsE({}), heOn = hsE({ holdEnd: 'end' });
        check('1.6.0 a hold and its turn\'s end (host, run for real): the turn-end step does not run as a row holds unless the system says so, and then it names the row that held, in its round',
            J(heOff.ended) === J([]) && J(heOn.ended) === J(['B@1']), J([heOff, heOn]));
        check('initiative O3 (host, run for real): Hold on the one whose turn it is marks their row held and moves play on; Act later in the round puts the held row right after whoever is acting (it acts next) and keeps that place, the hold cleared; a hold not used by the round\'s end is lost (a new round clears every hold), a hold on the round\'s last turn is lost at once, a row whose turn it is holds nothing; Act on a row not held, the one on turn, one not there, another map or a player\'s app does nothing',
            j(h1a) === j([['A', 'B*', 'C', 'D'], 2, 1]) && j(h1b) === j([['A', 'B*', 'C', 'D'], 3]) && act1 === true && j(h1c) === j([['A', 'C', 'D', 'B'], 2, 'D']) && j(h1d) === j(['B', 1]) && H1.toasts.includes('B holds their turn.') && H1.toasts.includes('B acts next.')
            && j(h2) === j([['A', 'B', 'C', 'D'], 2, 0]) && j(h3) === j([['A', 'B', 'C', 'D'], 2, 0]) && no4.every(x => x === false) && j(H4.ids()) === j(['A', 'B*', 'C', 'D']) && no5.every(x => x === false) && j(h6) === j([['A', 'B', 'C', 'D'], 1]), j([h1a, h1b, h1c, h1d, h2, h3, h6]));
        {   // 1.6.0: a turn's end — fightStep with the turnended slice, run for real
            const teS = between('// [netcheck:turnended-start]', '// [netcheck:turnended-end]', 'turnended');
            const mkE = (turn, tn) => { const seq = [], net = { role: 'host', combats: { m1: { mapId: 'm1', round: 1, turn: turn, rows: ['A', 'B', 'C', 'D'].map(x => ({ id: x, name: x, tokId: 't' + x, init: 0, src: null })) } } };
                new Function('net', 'own', 'toast', 'logEvent', 'mapTitleOf', 'broadcastCombats', 'combatRefresh', 'roundChanged', 'turnStarted', 'window', 'getActiveCampaign', "'use strict';\n" + hsSrc + '\n' + ordersSrc + '\n' + teS)(net, H.own, () => {}, () => {}, () => 'Hall', () => {}, () => {},
                    (m, c) => seq.push('round ' + c.round), (m, c) => seq.push('start ' + c.rows[c.turn].id), { wpSheets: { turnEndHook: (m, c) => { seq.push('end ' + c.rows[0].id + ' r' + c.round + ' t' + c.turn + ' ' + m); } } }, () => ({ system: { combat: { turn: tn || {} } } }));
                return { seq, net, c: net.combats.m1 }; };
            const E1 = mkE(0); for (let i = 0; i < 4; i++) E1.net.combatStep('m1', 1); E1.net.combatStep('m1', -1); E1.net.combatStep('m1', 1); E1.net.combatStep('m1', 1);
            const E2 = mkE(1); E2.net.combatHold('m1'); E2.net.combatStep('m1', 1); const E3 = mkE(0); E3.net.combatStep('m1', -1);
            check('1.6.3 (the combat review, finding 29): every step of a fight is a turn of its own by its serial (fightStep raises tn, run for real), a hold\'s step among them, and the serial rides on each player\'s copy and through a roster edit and a reload',
                E1.c.tn === 7 && E2.c.tn === 2 && E3.c.tn === 1 && /if \(typeof cmb\.tn === 'number'\) out\[fid\]\.tn = cmb\.tn;/.test(src) && /if \(typeof had\.tn === 'number'\) f\.tn = had\.tn;/.test(src) && /\['n', 'rr', 'rh', 'eh', 'sq', 'tn'\]/.test(src), j([E1.c.tn, E2.c.tn, E3.c.tn]));
            const E4 = mkE(1, { holdEnd: 'end' }); E4.net.combatHold('m1'); const e4a = E4.seq.filter(x => x.indexOf('end B') === 0).length; E4.net.combatAct('m1', 'B'); E4.net.combatStep('m1', 1); E4.net.combatStep('m1', 1);
            const E5 = mkE(1); E5.net.combatHold('m1'); const e5a = E5.seq.filter(x => x.indexOf('end B') === 0).length; E5.net.combatAct('m1', 'B'); E5.net.combatStep('m1', 1); E5.net.combatStep('m1', 1); const e5b = E5.seq.filter(x => x.indexOf('end B') === 0).length;
            check('1.6.0 a hold and its turn\'s end (fightStep with the turnended slice, run for real): set, the turn-end step runs as the row holds and not again when it acts from the hold and that turn ends; absent, it waits and runs once, when the turn it acts in ends',
                e4a === 1 && E4.seq.includes('start B') && E4.seq.filter(x => x.indexOf('end B') === 0).length === 1 && e5a === 0 && e5b === 1, j([E4.seq, E5.seq]));
            check('1.6.0 a turn\'s end (fightStep with the turnended slice, run for real): a forward step ends the turn of the row that was on, in the round it was on and before the new round and the next turn begin, the hook handed that row alone; a step back ends nothing, and a turn ended once in a round is not ended again after a correction; a held turn does not end, the next one does; a step back at the first turn ends nothing',
                j(E1.seq) === j(['end A r1 t0 m1', 'start B', 'end B r1 t0 m1', 'start C', 'end C r1 t0 m1', 'start D', 'end D r1 t0 m1', 'round 2', 'start A', 'round 1', 'start D', 'round 2', 'start A', 'end A r2 t0 m1', 'start B'])
                && E1.c.eh === 2 && j(E2.seq) === j(['start C', 'end C r1 t0 m1', 'start D']) && E3.seq.every(x => x.indexOf('end') !== 0), j([E1.seq, E2.seq, E3.seq]));
            check('1.6.0 a turn\'s end (source): fightReachKept carries how far a fight\'s turn ends have gone through a roster edit, as it carries its turn starts; fightStep asks turnEnded through typeof, before the new round',
                /if \(typeof had\.eh === 'number'\) f\.eh = had\.eh;[^\n]*\n    if \(had\.et && typeof had\.et === 'object'\) f\.et = had\.et;/.test(src)
                && /if \(endRow && typeof turnEnded === 'function'\) turnEnded\(mapId, c, endRow, r0, t0\);[^\n]*\n    if \(c\.round > r0 && typeof combatNewRound === 'function'\)/.test(require('./checkkit').part('netfight.js')));
        }
        const hmSrc = between('// [netcheck:turnholdmsg-start]', '// [netcheck:turnholdmsg-end]', 'turnholdmsg');
        const runHM = (msg, o) => { o = o || {}; const calls = [];
            const map = { type: 'map', whiteboard: [{ id: 't_pat', isChar: true, charId: 'c_p', ownerId: 'u_a' }, { id: 't_orc', isChar: true, charId: 'c_o' }, { id: 't_sam', isChar: true, charId: 'c_s', ownerId: 'u_b' }] };
            const net = { role: 'host', paused: !!o.paused, roster: { pA: { id: 'u_a', location: o.loc || 'm1' } }, combats: { m1: { mapId: 'm1', round: 1, turn: o.turn === undefined ? 1 : o.turn, rows: [{ id: 'r_orc', tokId: 't_orc' }, { id: 'r_pat', tokId: 't_pat', held: o.held ? 1 : undefined }, { id: 'r_sam', tokId: 't_sam' }, { id: 'r_trap', tokId: null }] } } };
            new Function('msg', 'conn', 'net', 'window', 'getActiveCampaign', 'peerPaused', 'allow', 'own', 'toast', 'logEvent', 'mapTitleOf', 'broadcastCombats', 'combatRefresh', 'roundChanged', 'turnStarted', ordersSrc + '\n' + hmSrc)(msg, { peer: 'pA' }, net, { wpVtt: { on: k => k === 'turns' ? o.turns !== false : true } }, () => ({ items: { m1: map, m2: { type: 'map', whiteboard: [] } } }), () => !!o.peerPaused, () => o.slow !== true, H.own,
                () => {}, (k, t) => calls.push(t), m => 'Hall', () => {}, () => {}, () => {}, () => {});
            return calls; };
        const hOk = { type: 'turn-hold', mapId: 'm1', row: 'r_pat' }, aOk = { type: 'turn-act', mapId: 'm1', row: 'r_pat' };
        check('initiative O3 (net.js, run for real): a player holds their own turn (their row on turn) and acts from their own row, each as the GM\'s own hold or act; nothing for a row not on turn (a hold), another\'s or a GM\'s token, a row with no token, another map than theirs, turn-based combat off, a paused table or player, past the rate',
            j(runHM(hOk)) === j(['Someone held their turn on Hall']) && j(runHM(aOk, { turn: 0, held: true })) === j(['Someone acted from a hold on Hall']) && [runHM(hOk, { turn: 0 }), runHM({ type: 'turn-hold', mapId: 'm1', row: 'r_sam' }, { turn: 2 }), runHM({ type: 'turn-act', mapId: 'm1', row: 'r_orc' }, { turn: 2 }), runHM({ type: 'turn-act', mapId: 'm1', row: 'r_trap' }),
                runHM({ type: 'turn-hold', mapId: 'm2', row: 'r_pat' }), runHM(hOk, { loc: 'm2' }), runHM(hOk, { turns: false }), runHM(hOk, { paused: true }), runHM(hOk, { peerPaused: true }), runHM(hOk, { slow: true }), runHM({ type: 'turn-hold', mapId: 'm1', row: 5 })].every(s => s.length === 0));
        check('initiative O3 (source): the table sees a seen row held (combatRowOut, never an unseen one\'s), the cleaner keeps the mark; a player\'s app sends its hold and its act; the strip draws Hold for the GM and the player on turn, a held row with Act for the GM and its own player, and presses them',
            src.includes("var o = { id: r.id, name: r.name, tokId: r.tokId, src: r.src }; if (r.held === 1) o.held = 1; return o; }") && src.includes("if (r.held === 1 || r.held === true) o.held = 1;") && src.includes("var mH = { type: 'turn-hold', mapId: t.mapId, row: t.rowId };") && src.includes('net.conns[0].send(mH);') /* 1.6.0, a deliberate change of this pin: a named hold says what it names */ && src.includes("net.conns[0].send({ type: 'turn-act', mapId: mid, row: rowId });")
            && /\(host \|\| mine \? '<button class="combat-strip-btn" data-act="hold"/.test(wbAll) && wbAll.includes("(host || (typeof r.tokId === 'string' && myTokIds[r.tokId] === 1) ? '<button class=\"combat-strip-btn\" data-act=\"act\" data-row=\"' + esc(r.id) + '\"") && wbAll.includes("else if (b.dataset.act === 'hold') n.fightHold(fidB);") && wbAll.includes("n.turnAct ? n.turnAct(String(b.dataset.row || '')) : null"));
    }
    // initiative O4: rolled again every round and side initiative — combatSet, combatStep and initIntoFight with the initround slice, run for
    // real on the real systemcore (its sideFirst, orderBySide, orderByInit)
    pendingChecks.push((async () => {
        const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).replace(/[\\]/g, '/');
        const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js'));
        const ccO = fnSrc('function cleanCombats(c) {', '\nfunction applyNotepad(', 'cleanCombats'), setO = fnSrc('function combatRefresh() {', '\nnet.combatStep = function', 'combatSet'), stepO = fnSrc('net.combatStep = function', '\nnet.combatEnd = function', 'combatStep', 'netfight.js');
        const mkO = (ir, o) => { o = o || {};
            const out = { toasts: [], logs: [], labels: [], calls: [], privs: [], errs: [], dice: (o.dice || []).slice(), seqs: JSON.parse(j(o.seqs || {})) };
            const camp = { system: { combat: { initiative: ir } }, chars: { c_a: { id: 'c_a' }, c_b: { id: 'c_b' }, c_g: { id: 'c_g' } }, items: { m1: { type: 'map', meta: { title: 'Hall' }, whiteboard: [{ id: 't_a', isChar: true, charId: 'c_a', ownerId: 'u_a' }, { id: 't_g', isChar: true, charId: 'c_g' }, { id: 't_b', isChar: true, charId: 'c_b', ownerId: 'u_b' }, { id: 't_x', isChar: false, charId: 'c_a', ownerId: 'u_a' }] } } };
            const net = { role: 'host', active: true, combats: {}, diceRoll: (expr, d) => { out.labels.push(expr + '|' + d.label); if (o.diceErr) return { error: o.diceErr }; return { ok: true, value: out.dice.length ? out.dice.shift() : 1 }; } };
            const win = { wpFormula: Fx, wpSheets: { rollInit: (id, oI) => { out.calls.push(id); out.privs.push(!!(oI && oI.priv === true)); if (o.rollErr) return { error: o.rollErr }; if (o.held && Object.prototype.hasOwnProperty.call(o.held, id)) return { held: true, error: o.held[id] }; const s = out.seqs[id]; return { ok: true, value: s && s.length ? s.shift() : 0 }; } } };
            const api = new Function('net', 'window', 'getActiveCampaign', 'broadcastCombats', 'logEvent', 'toast', 'render', 'console', 'showConfirm', 'own', 'SC', ccO + '\n' + setO + '\n' + stepO + '\n' + ordersSrc + '\nreturn { initIntoFight: initIntoFight, cleanCombats: cleanCombats };')(
                net, win, () => camp, () => {}, (k, t) => out.logs.push(t), t => out.toasts.push(t), () => {}, { error: e => out.errs.push(String(e && e.message)) }, () => {}, H.own, () => Sx);
            return Object.assign(out, { net, camp, api, c: () => fightIn(net.combats, 'm1'), ids: () => fightIn(net.combats, 'm1').rows.map(r => r.id), cur: () => fightIn(net.combats, 'm1').rows[fightIn(net.combats, 'm1').turn].id }); };
        const rowsO = () => [{ id: 'r_a', name: 'Ana', tokId: 't_a', init: 15, src: null, tb: [[3]] }, { id: 'r_g', name: 'Gob', tokId: 't_g', init: 10, src: null }, { id: 'r_c', name: 'Trap', tokId: null, init: 12, src: null }, { id: 'r_x', name: 'Box', tokId: 't_x', init: 1, src: null }];
        const stepN = (W, n, d) => { for (let i = 0; i < n; i++) W.net.combatStep('m1', d || 1); };
        // every: a new round rolls every row with a character again (never a row with no token or a token that is no character), once per round reached
        const E = mkO({ every: true }, { seqs: { c_a: [3, 20], c_g: [18, 5] } }); E.net.combatSet('m1', { round: 1, turn: 0, rows: rowsO() });
        const e0 = [E.ids(), E.calls.length]; stepN(E, 4); const e1 = [E.ids(), E.cur(), E.c().round, E.calls.slice(), E.c().rows.map(r => [r.init, r.rolled || 0, 'tb' in r])];
        E.net.combatSet('m1', { round: 2, turn: 0, rows: E.c().rows.map(r => Object.assign({}, r)) });   // a roster edit keeps the last round rolled for
        stepN(E, 1, -1); stepN(E, 1); const e2 = [E.ids(), E.c().round, E.calls.length]; stepN(E, 4); const e3 = [E.ids(), E.cur(), E.c().round, E.calls.slice()];
        check('initiative O4 every round (net.js, run for real): the first time the fight reaches a new round, every row whose token has a character rolls the system\'s initiative roll again through the sheet\'s own roll, marked rolled, its old roll-offs gone, and the order re-sorts, the new first on turn; a row with no token or a token that is no character keeps its number; a step back and on again rolls nothing; the fight\'s start rolls nothing',
            j(e0) === j([['r_a', 'r_g', 'r_c', 'r_x'], 0]) && j(e1) === j([['r_g', 'r_c', 'r_a', 'r_x'], 'r_g', 2, ['c_a', 'c_g'], [[18, 1, false], [12, 0, false], [3, 1, false], [1, 0, false]]]) && E.toasts.includes("Gob's turn. Round 2.")
            && j(e2) === j([['r_g', 'r_c', 'r_a', 'r_x'], 2, 2]) && j(e3) === j([['r_a', 'r_c', 'r_g', 'r_x'], 'r_a', 3, ['c_a', 'c_g', 'c_g', 'c_a']]) && E.errs.length === 0, j([e0, e1, e2, e3, E.errs]));
        const Ef = mkO({ every: true }, { rollErr: 'Dice are off for this campaign (Settings > VTT features).' }); Ef.net.combatSet('m1', { round: 1, turn: 0, rows: rowsO() }); stepN(Ef, 4);
        const En = mkO({}, { seqs: { c_a: [30] } }); En.net.combatSet('m1', { round: 1, turn: 0, rows: rowsO() }); stepN(En, 4);
        check('initiative O4 every round: a roll the sheet refuses is said once and the rest keep their numbers and their order; without the rule a new round rolls nothing and keeps the order',
            j(Ef.calls) === j(['c_a']) && Ef.toasts.filter(t => t === 'Dice are off for this campaign (Settings > VTT features).').length === 1 && j(Ef.ids()) === j(['r_a', 'r_g', 'r_c', 'r_x']) && Ef.c().rows[0].init === 15
            && En.calls.length === 0 && En.labels.length === 0 && j(En.ids()) === j(['r_a', 'r_g', 'r_c', 'r_x']) && !('side' in En.c()), j([Ef.calls, Ef.toasts, Ef.ids(), En.ids()]));
        // [m410 review] (3) a row whose initiative roll the sheet holds back by what it needs is passed over: it keeps its number, the rest roll on, nothing said
        const Eq = mkO({ every: true }, { seqs: { c_g: [18] }, held: { c_a: 'Not while down' } }); Eq.net.combatSet('m1', { round: 1, turn: 0, rows: rowsO() }); stepN(Eq, 4);
        check('m410 review (3) every round, a row whose initiative roll is held back by its needs (the sheet\'s rollInit answering held) is passed over: it keeps its number and its place by it, the rows after it still roll, and nothing is said',
            j(Eq.calls) === j(['c_a', 'c_g']) && j(Eq.c().rows.map(r => [r.id, r.init, r.rolled || 0])) === j([['r_g', 18, 1], ['r_a', 15, 0], ['r_c', 12, 0], ['r_x', 1, 0]]) && !Eq.toasts.some(t => /Not while down/.test(t)) && Eq.errs.length === 0, j([Eq.calls, Eq.c().rows, Eq.toasts]));
        // hidden pieces (owner, 2026-10-01): a creature the GM hid rolls again in private — its row reads Hidden on the table, and an open card would name it
        const Eh = mkO({ every: true }, { seqs: { c_a: [3], c_g: [18], c_h: [19] } }); Eh.camp.chars.c_h = { id: 'c_h' }; Eh.camp.items.m1.whiteboard.push({ id: 't_h', isChar: true, charId: 'c_h', hidden: true });
        Eh.net.combatSet('m1', { round: 1, turn: 0, rows: rowsO().concat([{ id: 'r_h', name: 'Lurker', tokId: 't_h', init: 11, src: null }]) }); stepN(Eh, 5);
        check('initiative O4 every round, hidden pieces: a row whose token the GM hid rolls again through the sheet\'s roll in private (priv true), a shown token\'s row in the open (priv false), and its new number still places it in the order; nothing else of the round changes',
            j(Eh.calls) === j(['c_a', 'c_g', 'c_h']) && j(Eh.privs) === j([false, false, true]) && j(E.privs) === j([false, false, false, false]) && j(Eh.ids()) === j(['r_h', 'r_g', 'r_c', 'r_a', 'r_x']) && Eh.c().rows[0].init === 19 && Eh.c().round === 2 && Eh.errs.length === 0, j([Eh.calls, Eh.privs, Eh.ids(), E.privs]));
        // secrets (R2 #15): a creature no one hid but some player's copy drops (its row reads Hidden to them) rolls again in private too, through the host's
        // one judge net.tokUnseen (by the map and the token); one every player sees, in the open
        const Eu = mkO({ every: true }, { seqs: { c_a: [3], c_g: [18] } }); Eu.asked = []; Eu.net.tokUnseen = (mapId, tokId) => { Eu.asked.push(mapId + ':' + tokId); return tokId === 't_g'; };
        Eu.net.combatSet('m1', { round: 1, turn: 0, rows: rowsO() }); stepN(Eu, 4);
        check('secrets: the every-round re-roll asks the host\'s judge (net.tokUnseen, by the map and the token) for each row with a character and rolls one some player at the table cannot see in private (priv true), a seen one in the open; the hidden tick still counts on its own',
            j(Eu.calls) === j(['c_a', 'c_g']) && j(Eu.privs) === j([false, true]) && j(Eu.asked) === j(['m1:t_a', 'm1:t_g']) && Eu.errs.length === 0 && j(Eh.privs) === j([false, false, true]), j([Eu.calls, Eu.privs, Eu.asked]));
        // side: the players' characters against the rest, rolled at the fight's start and each new round, again while they tie
        const rowsS = () => [{ id: 'r_a', name: 'Ana', tokId: 't_a', init: 15, src: null }, { id: 'r_g', name: 'Gob', tokId: 't_g', init: 10, src: null }, { id: 'r_b', name: 'Bo', tokId: 't_b', init: 8, src: null }, { id: 'r_c', name: 'Trap', tokId: null, init: 12, src: null }];
        const Sd = mkO({ side: '1d6' }, { dice: [2, 5, 4, 4, 6, 1] }); Sd.net.combatSet('m1', { round: 1, turn: 0, rows: rowsS() });
        const s0 = [Sd.ids(), Sd.cur(), Sd.c().side, Sd.labels.slice()];
        Sd.net.combatSet('m1', { round: 1, turn: 1, rows: [rowsS()[0], rowsS()[1], rowsS()[2], rowsS()[3]] }); const s1 = [Sd.ids(), Sd.cur(), Sd.c().side, Sd.labels.length];
        stepN(Sd, 1); const s1b = Sd.cur(); stepN(Sd, 3); const s2 = [Sd.ids(), Sd.cur(), Sd.c().side, Sd.c().round, Sd.labels.slice(2)];
        check('initiative O4 sides (net.js, run for real): a fight starts with both sides rolling the sides roll (a card each, labeled, reading no one\'s values), the higher side first, each side\'s rows in their own order, its first on turn; a roster edit keeps the side and puts each side together again, the row on turn kept, rolling nothing; each new round both roll again, again while they tie, and the table is told the rolls',
            j(s0) === j([['r_g', 'r_c', 'r_a', 'r_b'], 'r_g', 'rest', ['1d6|Side initiative: the players', '1d6|Side initiative: the rest']]) && Sd.toasts.includes('Combat started on Hall. Gob goes first.') && Sd.toasts.includes('Round 1 on Hall: the players rolled 2, the rest 5; the rest go first.')
            && j(s1) === j([['r_g', 'r_c', 'r_a', 'r_b'], 'r_g', 'rest', 2]) && s1b === 'r_c'
            && j(s2) === j([['r_a', 'r_b', 'r_g', 'r_c'], 'r_a', 'pc', 2, ['1d6|Side initiative: the players', '1d6|Side initiative: the rest', '1d6|Side initiative: the players (again)', '1d6|Side initiative: the rest (again)']])
            && Sd.toasts.includes('Round 2 on Hall: the players rolled 4, then 6, the rest 4, then 1; the players go first.') && Sd.logs.includes('Round 2 on Hall: the players rolled 4, then 6, the rest 4, then 1; the players go first.') && Sd.errs.length === 0, j([s0, s1, s1b, s2, Sd.toasts]));
        const Si = mkO({ side: '1d6' }, { dice: [1, 6] }); Si.net.combatSet('m1', { round: 1, turn: 0, rows: rowsS().map(r => r.id === 'r_b' ? Object.assign({}, r, { init: 0 }) : Object.assign({ rolled: 1 }, r)) }); stepN(Si, 1);
        const gotI = Si.api.initIntoFight(Si.camp, 'm1', 'c_b', 'u_b', 30), si = [Si.ids(), Si.cur()];
        const Sf = mkO({ side: '1d6' }, { diceErr: 'Dice are off for this campaign.' }); Sf.net.combatSet('m1', { round: 1, turn: 0, rows: rowsS() });
        const Sp = mkO({ side: '1d6' }); Sp.net.combatSet('m1', { round: 1, turn: 0, rows: rowsS().filter(r => r.id === 'r_a' || r.id === 'r_b') }); const Sr = mkO({ side: '1d6' }); Sr.net.combatSet('m1', { round: 1, turn: 0, rows: rowsS().filter(r => r.id === 'r_g' || r.id === 'r_c') });
        const Sn = mkO({ side: '1d6' }); Sn.net.combatSet('m1', { round: 1, turn: 0, rows: rowsO().filter(r => r.id === 'r_x' || r.id === 'r_g') });   // a token with a player that is no character is the rest's
        const Sy = mkO({ side: '1d6' }, { dice: [6, 1] }); Sy.net.combatSet('m1', { round: 1, turn: 0, rows: rowsS().map(r => r.id === 'r_b' ? Object.assign({}, r, { init: 0 }) : Object.assign({ rolled: 1 }, r)) }); const sy0 = Sy.c().side; Sy.camp.system.combat.initiative = {}; Sy.api.initIntoFight(Sy.camp, 'm1', 'c_b', 'u_b', 30);
        const So = mkO({ side: '1d6' }, { dice: [6, 1] }); So.net.combatSet('m1', { round: 1, turn: 0, rows: rowsS() }); const so0 = So.c().side; So.camp.system.combat.initiative = {}; So.net.combatSet('m1', { round: 1, turn: 0, rows: rowsS() }); stepN(So, 4);
        check('initiative O4 sides: a player\'s own roll into the fight keeps each side together (the row on turn kept); a sides roll that fails is said and the players go first; a side alone goes first without a roll; the sides gone from the system, the fight has no side and a new round rolls nothing',
            gotI === true && j(si) === j([['r_c', 'r_g', 'r_b', 'r_a'], 'r_c']) && Si.c().turn === 0 && Sf.c().side === 'pc' && Sf.toasts.includes('Side initiative: Dice are off for this campaign. The players go first.') && j(Sf.ids()) === j(['r_a', 'r_b', 'r_g', 'r_c'])
            && Sp.c().side === 'pc' && Sp.labels.length === 0 && Sr.c().side === 'rest' && Sr.labels.length === 0 && Sn.c().side === 'rest' && Sn.labels.length === 0 && sy0 === 'pc' && !('side' in Sy.c()) && so0 === 'pc' && !('side' in So.c()) && So.labels.length === 2 && j(So.ids()) === j(['r_a', 'r_g', 'r_b', 'r_c']), j([si, Sf.ids(), Sf.toasts, So.ids(), So.labels]));
        const clO = Si.api.cleanCombats({ m: { round: 1, turn: 0, rows: [{ id: 'a', name: 'A' }], side: 'pc', rr: 4 }, n: { round: 1, turn: 0, rows: [{ id: 'b', name: 'B' }], side: 'constructor' } });
        check('initiative O4 on the wire: the cleaner keeps a combat\'s side as the players\' or the rest\'s only (never its last rolled round, the host\'s own); the table\'s copy (combatsFor) names this round\'s side, never its rolls; the host rolls the sides by its own diceRoll',
            clO.m.side === 'pc' && !('rr' in clO.m) && !('side' in clO.n) && src.includes("if (cmb.side === 'pc' || cmb.side === 'rest') out[fid].side = cmb.side;") && src.includes("if (k.side === 'pc' || k.side === 'rest') f.side = k.side;")
            && /if \(c\.round > r0 && typeof combatNewRound === 'function'\) \{ combatNewRound\(mapId, c\); t = c\.turn; \}/.test(require('./checkkit').part('netfight.js')) && require('./checkkit').part('netfight.js').includes("if (typeof combatSideOrder === 'function') combatSideOrder(camp, mapId, c);") && require('./checkkit').part('netfight.js').includes("var r = net.diceRoll(ir.side, { label: label[side] + (k ? ' (again)' : '') });"), j(clO));
    })());
    // the client's side: whose turn it is on the map in view, and the message it sends
    const mtSrc = fnSrc('net.myTurnTok = function', '\n// the player ends their own turn', 'myTurnTok'), teCl = fnSrc('net.turnEnd = function', '\n// A player\'s change of a carried list', 'turnEnd');
    const cl = o => {
        o = o || {}; const sent = [];
        const camp = { activeItemId: o.mid || 'm1', items: { m1: { type: 'map', whiteboard: [{ id: 't_pat', isChar: true, charId: 'c_p', ownerId: 'u_a' }, { id: 't_orc', isChar: true }] } } };
        const net = { active: true, role: o.role || 'client', stream: false, myId: 'u_a', foreign: true, syncedPeer: 'gm', conns: [{ peer: 'gm', open: o.open !== false, send: m => sent.push(m) }], combats: { m1: { mapId: 'm1', round: 1, turn: o.turn === undefined ? 1 : o.turn, rows: [{ id: 'r_orc', tokId: 't_orc' }, { id: 'r_pat', tokId: 't_pat' }] } } };
        new Function('net', 'window', 'getActiveCampaign', 'own', ordersSrc + '\n' + mtSrc + '\n' + teCl)(net, { wpVtt: { on: k => k === 'turns' ? o.turns !== false : true } }, () => camp, (ob, k) => !!ob && Object.prototype.hasOwnProperty.call(ob, k));
        return { tok: net.myTurnTok(), end: net.turnEnd(), sent: sent };
    };
    const cOn = cl(), cOff = [cl({ turn: 0 }), cl({ turns: false }), cl({ role: 'host' }), cl({ mid: 'm9' })], cShut = cl({ open: false });
    check('turn-end, the client: myTurnTok names the map, the row and the token only while the player\'s own token has the turn there (turn-based combat on, at a table); End turn sends that row, else says why and sends nothing',
        cOn.tok && cOn.tok.mapId === 'm1' && cOn.tok.rowId === 'r_pat' && cOn.tok.tok.id === 't_pat' && j(cOn.sent) === j([{ type: 'turn-end', mapId: 'm1', row: 'r_pat' }]) && j(cOn.end) === j({ ok: true })
        && cOff.every(c => c.tok === null && !c.sent.length && c.end.error === 'It is not your turn.') && !cShut.sent.length && cShut.end.error === 'Not at the table yet.', j([cOn, cOff.map(c => c.end)]));
    {   // 1.6.3 (the combat review, finding 29): End turn pressed twice. Under several turns a round, or a counting clock, the same row may be on turn again at
        // once, so the host's check that the row on turn is the one the player saw let a second press (a double click) end that turn too. The press now names
        // the turn's serial (tn), the host steps nothing for one that has ended, and the player's own app sends one press a turn (net.js, run for real)
        const runN = (msgTn, tn) => {
            const steps = [], map = { type: 'map', whiteboard: [{ id: 't_pat', isChar: true, charId: 'c_p', ownerId: 'u_a' }] }, camp = { items: { m1: map } };
            const net = { role: 'host', roster: { pA: { id: 'u_a', location: 'm1' } }, combats: { m1: { mapId: 'm1', round: 1, turn: 0, rows: [{ id: 'r_pat', tokId: 't_pat' }] } } }; if (tn !== undefined) net.combats.m1.tn = tn;
            const msg = { type: 'turn-end', mapId: 'm1', row: 'r_pat' }; if (msgTn !== undefined) msg.tn = msgTn;
            new Function('msg', 'conn', 'net', 'window', 'getActiveCampaign', 'peerPaused', 'allow', 'own', 'toast', 'broadcastCombats', 'combatRefresh', 'roundChanged', 'turnStarted', ordersSrc + '\n' + teSrc)(msg, { peer: 'pA' }, net,
                { wpVtt: { on: () => true } }, () => camp, () => false, () => true, (ob, k) => !!ob && Object.prototype.hasOwnProperty.call(ob, k), () => {}, () => {}, () => {}, () => {}, (m, c) => steps.push(c.tn));
            return steps;
        };
        const hNow = runN(4, 4), hOld = runN(3, 4), hNone = runN(undefined, 4), hFresh = runN(0, undefined), hBad = runN('4', 4);
        check('1.6.3 (the combat review, finding 29), the host: an End turn that names the turn on hand steps it (its serial raised), one naming a turn that has ended steps nothing, an older app that names none steps as before, a fight with no serial yet is its turn 0, and a serial that is no number steps nothing',
            j(hNow) === j([5]) && j(hOld) === j([]) && j(hNone) === j([5]) && j(hFresh) === j([1]) && j(hBad) === j([]), j([hNow, hOld, hNone, hFresh, hBad]));
        const twice = (() => {
            const sent = [], camp = { activeItemId: 'm1', items: { m1: { type: 'map', whiteboard: [{ id: 't_pat', isChar: true, charId: 'c_p', ownerId: 'u_a' }] } } };
            const net = { active: true, role: 'client', stream: false, myId: 'u_a', foreign: true, syncedPeer: 'gm', conns: [{ peer: 'gm', open: true, send: m => sent.push(m) }], combats: { m1: { mapId: 'm1', round: 1, turn: 0, tn: 9, rows: [{ id: 'r_pat', tokId: 't_pat' }] } } };
            new Function('net', 'window', 'getActiveCampaign', 'own', ordersSrc + '\n' + mtSrc + '\n' + teCl)(net, { wpVtt: { on: () => true } }, () => camp, (ob, k) => !!ob && Object.prototype.hasOwnProperty.call(ob, k));
            const a = net.turnEnd(), b = net.turnEnd(), hb = net.turnHold(); net.combats.m1.tn = 10; const c = net.turnEnd();
            return { a, b, hb, c, sent };
        })();
        check('1.6.3 (the combat review, finding 29), the player\'s app: End turn names the turn\'s serial; a second press of that same turn (and a hold after it) sends nothing and says the turn is already ending; the next turn of theirs sends again',
            j(twice.a) === j({ ok: true }) && twice.b.error === 'Your turn is already ending.' && twice.hb.error === 'Your turn is already ending.' && j(twice.c) === j({ ok: true })
            && j(twice.sent) === j([{ type: 'turn-end', mapId: 'm1', row: 'r_pat', tn: 9 }, { type: 'turn-end', mapId: 'm1', row: 'r_pat', tn: 10 }]), j(twice));
        const first = (() => {   // a fight that has not stepped yet: its copy holds no serial (it is turn 0), the press names none, and a second press is held here
            const sent = [], camp = { activeItemId: 'm1', items: { m1: { type: 'map', whiteboard: [{ id: 't_pat', isChar: true, charId: 'c_p', ownerId: 'u_a' }] } } };
            const net = { active: true, role: 'client', stream: false, myId: 'u_a', foreign: true, syncedPeer: 'gm', conns: [{ peer: 'gm', open: true, send: m => sent.push(m) }], combats: { m1: { mapId: 'm1', round: 1, turn: 0, rows: [{ id: 'r_pat', tokId: 't_pat' }] } } };
            new Function('net', 'window', 'getActiveCampaign', 'own', ordersSrc + '\n' + mtSrc + '\n' + teCl)(net, { wpVtt: { on: () => true } }, () => camp, (ob, k) => !!ob && Object.prototype.hasOwnProperty.call(ob, k));
            const a = net.turnEnd(), b = net.turnEnd(); net.combats.m1.tn = 1; const c = net.turnEnd();
            return { a, b, c, sent };
        })();
        check('1.6.3 (the combat review, finding 29), the first turn: a fight that has not stepped is its turn 0, so a double press of its first End turn sends one (naming no serial, as an older host reads it) and the next turn of theirs sends again',
            j(first.a) === j({ ok: true }) && first.b.error === 'Your turn is already ending.' && j(first.c) === j({ ok: true }) && j(first.sent) === j([{ type: 'turn-end', mapId: 'm1', row: 'r_pat' }, { type: 'turn-end', mapId: 'm1', row: 'r_pat', tn: 1 }]), j(first));
    }
    {   // 1.6.3 (the combat review, finding 14): a fight held 60 rows and cut the rest with no word. It holds 600, a safety ceiling well past any real battle,
        // on the host and on a player's app alike (cleanFightBody, run for real), and a start or a roster edit past it says how many were left out (fightSet)
        const cfb = new Function(fnSrc('function cleanFightBody(k, mapId) {', '\n// [netcheck:notepad-start]', 'cleanFightBody') + '\nreturn cleanFightBody;')();
        const many = n => Array.from({ length: n }, (x, i) => ({ id: 'r' + i, name: 'N' + i, tokId: 't' + i, init: n - i }));
        const f70 = cfb({ round: 1, turn: 0, rows: many(70) }, 'm1'), f700 = cfb({ round: 1, turn: 0, rows: many(700), dec: { in: many(700).map(r => r.id), n: 700 } }, 'm1'), fTn = cfb({ round: 1, turn: 0, rows: many(2), tn: 12 }, 'm1'), fBad = cfb({ round: 1, turn: 0, rows: many(2), tn: -1 }, 'm1');
        const fsS = fnSrc('function fightSet(fid, combat) {', '\n    } else if (!combat) combatOver(fid, had);', 'fightSet', 'netfight.js');
        check('1.6.3 (the combat review, finding 14): a fight keeps 70 rows whole and holds 600 at most of 700 (its declaration too); a start or a roster edit past that says how many were left out, in a notice and the Game Record; the turn\'s serial is kept as a whole number',
            f70.rows.length === 70 && f700.rows.length === 600 && f700.dec.in.length === 600 && f700.dec.n === 600 && fTn.tn === 12 && !('tn' in fBad)
            && fsS.includes("var cutN = Array.isArray(combat.rows) ? combat.rows.filter(function(r) { return !!r && typeof r === 'object'; }).length - f.rows.length : 0;") && fsS.includes("if (cutN > 0) { toast(cutN + (cutN === 1 ? ' was' : ' were') + ' left out. A fight holds 600 at most.');"), j([f70.rows.length, f700.rows.length, f700.dec, fTn.tn]));
    }
}
// Turn-based combat T2b: a reminder card — the host delivers a player's to each of that player's admitted connections (the GM's copy then says
// whose it is), else keeps it the GM's; a client takes one from its synced host only, cleaned, never a GM's copy; the turn's start runs on
// every step that moves the turn (net.js combatStep / combatSet, run for real)
pendingChecks.push((async () => {
    const Dx = await import('file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', 'dicecore.js')).split(String.fromCharCode(92)).join('/'));
    const pdSrc = between('// [netcheck:postdue-start]', '// [netcheck:postdue-end]', 'postdue'), diSrc = between('// [netcheck:duein-start]', '// [netcheck:duein-end]', 'duein');
    const pidOf = c => ({ pA: 'u_a', pA2: 'u_a', pB: 'u_b', pW: 'u_a' })[c.peer];
    const runPD = (ch, toOwner, o) => {
        o = o || {}; const conns = [mkConn('pA'), mkConn('pA2'), mkConn('pB'), mkConn('pW'), mkConn('pShut', false)], chat = [];
        const net = { active: true, role: o.role || 'host', conns, roster: { pA: { id: 'u_a' }, pA2: { id: 'u_a' }, pB: { id: 'u_b' }, pShut: { id: 'u_a' } } };
        new Function('rec', 'ch', 'toOwner', 'net', 'peerProfileId', 'sendFailed', 'pushChat', pdSrc + '\npostDue(rec, ch, toOwner);')({ type: 'due', id: 'r_d1', charId: 'c_a', act: 'r_re', why: 'turn', round: 2, ts: 1, from: { id: 'u_gm', name: 'GM', gm: true } }, ch, toOwner, net, pidOf, e => { throw e; }, m => chat.push(m));
        return { sent: conns.map(c => c.peer + ':' + c.sent.length).join(','), chat };
    };
    const ana = { id: 'c_a', ownerId: 'u_a' }, pd1 = runPD(ana, true), pd2 = runPD(ana, false), pd3 = runPD({ id: 'c_a', ownerId: 'u_c' }, true), pd4 = runPD({ id: 'c_o', ownerId: 'u_a', npc: true }, true);
    const pdG = (() => { const conns = [mkConn('pA')], chat = []; const net = { active: true, role: 'host', conns, roster: { pA: { id: 'u_a' } } };   // 1.6.3 (the review of defense fold 1): gmX, what the GM's own copy says in its place
        const rec = { type: 'due', id: 'r_d2', charId: 'c_a', act: 'r_row', why: 'called', lnd: 1, on: '', round: 1, ts: 1, from: { id: 'u_gm', name: 'GM', gm: true } };
        new Function('rec', 'ch', 'net', 'peerProfileId', 'sendFailed', 'pushChat', pdSrc + '\npostDue(rec, ch, true, { on: \'Pebbles\' }); postDue(rec, { id: \'c_o\', npc: true }, false, { on: \'Pebbles\' }); postDue(rec, ch, true, null);')(rec, { id: 'c_a', ownerId: 'u_a' }, net, pidOf, e => { throw e; }, m => chat.push(m));
        return { sent: conns[0].sent, chat }; })();
    check('1.6.3 (the review of defense fold 1) postDue\'s gmX: the GM\'s own copy of a landed attack\'s card names whom it landed on, while the player\'s copy says only what they may be told; with no player the GM\'s copy names them too; with none the copy is as before',
        pdG.sent.length === 2 && pdG.sent.every(m => m.on === '') && pdG.chat.length === 3 && pdG.chat[0].due.on === 'Pebbles' && pdG.chat[0].due.theirs === 1 && pdG.chat[1].due.on === 'Pebbles' && !pdG.chat[1].due.theirs && pdG.chat[2].due.on === '' && pdG.chat[2].due.theirs === 1, j(pdG));
    check('T2b postDue (net.js, run for real): a player\'s reminder reaches each admitted connection of theirs (a waiting or closed one nothing, another player nothing) and the GM\'s copy says it is theirs; otherwise the GM\'s alone — the player not at the table, an NPC, or a GM reminder; always a whisper',
        pd1.sent === 'pA:1,pA2:1,pB:0,pW:0,pShut:0' && pd1.chat.length === 1 && pd1.chat[0].due.theirs === 1 && pd1.chat[0].scope === 'whisper'
        && [pd2, pd3, pd4].every(p => p.sent === 'pA:0,pA2:0,pB:0,pW:0,pShut:0' && p.chat.length === 1 && !p.chat[0].due.theirs && p.chat[0].scope === 'whisper'), j([pd1.sent, pd2.sent, pd3.sent, pd4.sent]));
    const runDI = (msg, o) => {
        o = o || {}; const chat = [];
        new Function('msg', 'conn', 'net', 'DC', 'pushChat', diSrc)(msg, { peer: o.peer || 'host1' }, { foreign: true, syncedPeer: 'host1', stream: !!o.stream }, () => Dx, m => chat.push(m));
        return chat;
    };
    const dueOk = { type: 'due', id: 'r_d1', from: { id: 'u_gm', name: 'GM', gm: true }, charId: 'c_a', act: 'r_re', label: '<img src=x>', why: 'turn', round: 2, ts: 1 };
    const di1 = runDI(dueOk);
    check('T2b a client\'s reminder (net.js, run for real): from the synced host only, cleaned (the label stays text), a whisper; nothing from another peer, in the stream window, malformed, or a GM\'s copy (theirs)',
        di1.length === 1 && di1[0].due.label === '<img src=x>' && di1[0].scope === 'whisper' && di1[0].due.charId === 'c_a'
        && [runDI(dueOk, { peer: 'other' }), runDI(dueOk, { stream: true }), runDI(Object.assign({}, dueOk, { act: 'f_hp' })), runDI(Object.assign({}, dueOk, { theirs: 1 }))].every(c => c.length === 0), j(di1));
    const setSrcT = fnSrc('function combatRefresh() {', '\nnet.combatStep = function', 'combatSet'), stepSrcT = fnSrc('net.combatStep = function', '\nnet.combatEnd = function', 'combatStep', 'netfight.js'), ccSrcT = fnSrc('function cleanCombats(c) {', '\nfunction applyNotepad(', 'cleanCombats');
    const callsT = [], netT = { role: 'host', active: true, combats: {} };
    new Function('net', 'window', 'getActiveCampaign', 'broadcastCombats', 'logEvent', 'toast', 'render', 'console', 'showConfirm', ccSrcT + '\n' + setSrcT + '\n' + stepSrcT + '\n' + ordersSrc)(
        netT, { wpSheets: { roundHook: (m, c) => callsT.push('R' + c.round), turnHook: (m, c) => callsT.push('T' + c.round + '.' + c.turn) } }, () => ({ items: { m1: { type: 'map', meta: { title: 'K' } } } }), () => {}, () => {}, () => {}, () => {}, { error: () => {} }, () => {});
    const rwT = n => Array.from({ length: n }, (_, i) => ({ id: 'r' + i, name: 'N' + i, tokId: 't' + i, init: 0, src: null }));
    netT.combatSet('m1', { round: 1, turn: 0, rows: rwT(2) }); netT.combatSet('m1', { round: 1, turn: 1, rows: rwT(3) }); netT.combatStep('m1', 1); netT.combatStep('m1', 1); netT.combatStep('m1', -1); netT.combatStep('m1', -1); netT.combatStep('m1', -1); netT.combatStep('m1', -1);
    check('T2b the turn\'s start (net.js, run for real): at the combat\'s start (after the round), on each step that moves the turn (after the round when it changes too) — never on a roster edit, or a step back at round 1\'s first turn; fold 3 (moved on purpose): never for a round or a turn the fight reached already, so the steps back past round 2\'s first turn run neither hook',
        j(callsT) === j(['R1', 'T1.0', 'T1.2', 'R2', 'T2.0']), j(callsT));
})());
// Fold 3 (backlog 152, docs/FIGHT_CLOCK_DESIGN.md sections 2 and 6, settled 18): a step back is a correction, so a fight lives nothing twice. Run for
// real on a host world: the combats slice, the cut of the old names (roundChanged and turnStarted, with the real turnMoveStart, turnActsStart and
// turnFxStart over the real fxTick, and initIntoFight with the real orderByInit) and the orders slice (fightSet, fightStep, fightHold, fightAct), with
// Kael and Sela, two players' characters, and Unit 7, an NPC sheet with two tokens, on the Docks. The round hook (Each round actions) runs once for each
// round a fight reaches, the turn hook (Each turn actions) and a turn's timed effects once for each turn reached in it, and a character's timed effects
// once a round of that fight whatever rows it has; the move and the turn's actions are still given back at a step back; a turn reached is known by its
// row, so a roster edit (a row taken out before, at or after the row on turn, one added, the order sorted again) and a player's initiative that
// re-sorts the order in play neither skip a turn still to come nor run one again; two fights on one map keep their own; and rh, th and turned are never sent
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js'));
    const J = v => JSON.stringify(v);
    const cbS = between('// [netcheck:combats-start]', '// [netcheck:combats-end]', 'combats'), setS = fnSrc('function combatRefresh() {', '\nnet.combatStep = function', 'combatSet');
    const pidS = (() => { const i = src.indexOf('function peerProfileId('); return src.slice(i, src.indexOf('\n', i)) + '\n'; })();
    const sys3 = Sx.cleanSystem({ v: 1, name: 'F3', fields: [{ id: 'f_fx', key: 'Effects', kind: 'effects' }], rolls: [], effects: [{ id: 'e_c', name: 'Charge', dur: '100 turns', mods: [] }], combat: { turn: { acts: [{ key: 'Action', n: 1 }] } } }, { F: Fx, gmView: true });
    const mk3 = () => {
        const hooks = [], toasts = [];
        const tok = (id, charId, ownerId) => Object.assign({ id, type: 'image', isChar: true, charId, x: 0, y: 0, w: 50, h: 50 }, ownerId ? { ownerId } : {});
        const fx = id => ({ f_fx: [{ id, ref: 'e_c', on: true, t: { left: 600, at: 0 } }] });   // banked, as a fight's start leaves them: each turn's tick takes the round's 6 seconds
        const camp = { id: 'k', system: sys3, items: { mDocks: { id: 'mDocks', type: 'map', meta: { title: 'Docks' }, whiteboard: [tok('t_kael', 'c_kael', 'u_a'), tok('t_u7', 'c_u7'), tok('t_u7b', 'c_u7'), tok('t_sela', 'c_sela', 'u_b'), tok('t_mira', 'c_mira')] } },
            chars: { c_kael: { id: 'c_kael', name: 'Kael', ownerId: 'u_a', values: fx('x_k') }, c_u7: { id: 'c_u7', name: 'Unit 7', npc: true, values: fx('x_7') }, c_sela: { id: 'c_sela', name: 'Sela', ownerId: 'u_b', values: fx('x_s') }, c_mira: { id: 'c_mira', name: 'Mira', npc: true, values: fx('x_m') } } };
        const mkC = p => ({ peer: p, open: true, sent: [], send(m) { packCheck(m); this.sent.push(JSON.parse(J(m))); } }), conns = [mkC('pA'), mkC('pB')];
        const net = { active: true, role: 'host', myId: 'u_gm', conns, roster: { pA: { id: 'u_a', name: 'Pat', location: 'mDocks' }, pB: { id: 'u_b', name: 'Bea', location: 'mDocks' } }, combats: {}, targets: {}, paused: false, syncCharDelta() {} };
        const fids = [], tag = c => { let i = fids.indexOf(c.id); if (i < 0) { fids.push(c.id); i = fids.length - 1; } return '@' + (i + 1); };   // each fight named by the order it first reached a hook
        const env = { net, window: { wpVtt: { on: () => true }, wpSheets: { roundHook: (m, c) => hooks.push('R' + c.round + tag(c)), turnHook: (m, c) => hooks.push('T' + c.round + '.' + c.turn + ':' + c.rows[c.turn].name + tag(c)), charChanged() {} } },
            getActiveCampaign: () => camp, SC: () => Sx, own: H.own, toast: t => toasts.push(t), logEvent() {}, render() {}, console: { error: e => { throw e; } }, showConfirm: (t, cb) => cb(true), sendFailed: e => { throw e; },
            anyFog: () => false, fogDrop: () => null, broadcast: () => { throw new Error('the fights go to each connection on its own'); }, moveMode: () => 'refuse', saveRemoteSoon() {}, pushChat() {} };
        const api = new Function(...Object.keys(env), "'use strict';\n" + pidS + cbS + '\n' + setS + '\n' + ordersSrc + '\nreturn { initIntoFight: initIntoFight, combatsFor: combatsFor, cleanFights: cleanFights, cleanCombats: cleanCombats };')(...Object.values(env));
        const row = (tokId, name) => ({ id: 'r' + tokId, name, tokId, init: 0, src: null });
        const ticks = id => (600 - camp.chars[id].values.f_fx[0].t.left) / 6;   // how many turns' timed effects that character has counted
        const fight = (rows) => net.fightSet(null, { mapId: 'mDocks', round: 1, turn: 0, rows });
        return { net, camp, api, hooks, toasts, conns, row, ticks, fight };
    };
    // (A) a Prev past round 2's first turn and on again: each round and turn reached runs once; the move and the actions come back at the step back
    const A = mk3(), NA = A.net, fA = A.fight([A.row('t_kael', 'Kael'), A.row('t_u7', 'Unit 7')]);
    NA.fightStep(fA, 1); NA.fightStep(fA, 1); NA.fightStep(fA, -1);   // Unit 7, round 2 with Kael, back to Unit 7 in round 1
    NA.turnSpent.c_kael = { Action: 1 }; const sentA = A.conns[0].sent.length;   // Kael spent his action
    NA.fightStep(fA, -1);   // back to Kael's turn in round 1
    const backA = { move: J(NA.turnMove[fA]), spent: Object.prototype.hasOwnProperty.call(NA.turnSpent, 'c_kael'), told: A.conns[0].sent.slice(sentA).filter(m => m.type === 'acts-left').map(m => m.charId + ':' + J(m.left)), hooks: A.hooks.length };
    NA.fightStep(fA, 1); NA.fightStep(fA, 1); NA.fightStep(fA, 1); NA.fightStep(fA, 1);   // on again: Unit 7 and Kael's round 2, reached already; Unit 7 in round 2 and round 3, never reached
    const gA = { hooks: A.hooks, ticks: [A.ticks('c_kael'), A.ticks('c_u7')], back: backA, reach: [NA.combats[fA].rh, J(NA.combats[fA].th), J(NA.combats[fA].turned)] };
    check('fold 3 (backlog 152, run for real): a step back is a correction — the round hook (Each round actions) runs once for each round a fight reaches, and the turn hook (Each turn actions) and a turn\'s timed effects once for each turn reached in it, so a Prev past round 2\'s first turn and on again runs nothing twice and goes on into round 3 as before (Kael\'s Charge counted three turns, Unit 7\'s two); the move and the turn\'s actions are still given back at the step back, as before: Kael\'s move begun afresh, what he spent gone and his player told',
        J(gA.hooks) === J(['R1@1', 'T1.0:Kael@1', 'T1.1:Unit 7@1', 'R2@1', 'T2.0:Kael@1', 'T2.1:Unit 7@1', 'R3@1', 'T3.0:Kael@1']) && J(gA.ticks) === J([3, 2])
        && J(backA) === J({ move: J({ rowId: 'rt_kael', tokId: 't_kael', moved: 0, allow: null }), spent: false, told: ['c_kael:{"Action":1}'], hooks: 5 }) && J(gA.reach) === J([3, J({ rt_kael: 1 }), J({ c_kael: 3, c_u7: 2 })]), J(gA));
    // (B) a Hold and Act: the turn Kael acts from his hold is no turn reached anew; (C) two rows of one NPC sheet: its timed effects once a round
    const B = mk3(), NB = B.net, fB = B.fight([B.row('t_kael', 'Kael'), B.row('t_u7', 'Unit 7'), B.row('t_sela', 'Sela')]);
    NB.fightHold(fB); const actB = NB.fightAct(fB, 'rt_kael'), orderB = NB.combats[fB].rows.map(r => r.name);   // Kael holds, Unit 7 is up, Kael acts: right after Unit 7
    NB.fightStep(fB, 1); NB.fightStep(fB, 1); NB.fightStep(fB, 1); NB.fightStep(fB, 1);   // Kael acting, Sela, round 2 with Unit 7 first, Kael
    const gB = { hooks: B.hooks, act: actB, order: orderB, ticks: [B.ticks('c_kael'), B.ticks('c_u7'), B.ticks('c_sela')] };
    const C = mk3(), NC = C.net, fC = C.fight([C.row('t_u7', 'Unit 7'), C.row('t_u7b', 'Unit 7b'), C.row('t_kael', 'Kael')]);
    NC.fightStep(fC, 1); NC.fightStep(fC, 1); NC.fightStep(fC, 1); NC.fightStep(fC, 1);   // Unit 7b, Kael, round 2 with Unit 7, Unit 7b
    const gC = { hooks: C.hooks, ticks: [C.ticks('c_u7'), C.ticks('c_kael')] };
    check('fold 3 (run for real): a Hold and Act counts once — Kael holds his turn and acts after Unit 7, and the turn he acts in is no turn reached anew, so neither his Each turn actions nor his timed effects run again in round 1 (one turn counted in each round); two rows of one character count once — Unit 7, an NPC sheet with two tokens in the fight, has its Each turn actions at each of its turns but its timed effects counted once a round (two in two rounds, not four)',
        gB.act === true && J(gB.order) === J(['Unit 7', 'Kael', 'Sela']) && J(gB.hooks) === J(['R1@1', 'T1.0:Kael@1', 'T1.1:Unit 7@1', 'T1.2:Sela@1', 'R2@1', 'T2.0:Unit 7@1', 'T2.1:Kael@1']) && J(gB.ticks) === J([2, 2, 1])
        && J(gC.hooks) === J(['R1@1', 'T1.0:Unit 7@1', 'T1.1:Unit 7b@1', 'T1.2:Kael@1', 'R2@1', 'T2.0:Unit 7@1', 'T2.1:Unit 7b@1']) && J(gC.ticks) === J([2, 1]), J([gB, gC]));
    // (D) a roster edit keeps how far the fight has gone: a row taken out before the one on turn, then a round set back
    const D = mk3(), ND = D.net, fD = D.fight([D.row('t_kael', 'Kael'), D.row('t_u7', 'Unit 7'), D.row('t_sela', 'Sela')]);
    ND.fightStep(fD, 1);   // Unit 7's turn
    const editD = (round, turn) => ND.fightSet(fD, { mapId: 'mDocks', round, turn, rows: [D.row('t_u7', 'Unit 7'), D.row('t_sela', 'Sela')] });   // as the menu's Remove from the fight sends it: Kael out, the row on turn kept
    editD(1, 0); const keptD = [ND.combats[fD].rh, J(ND.combats[fD].th), J(ND.combats[fD].turned)];
    ND.fightStep(fD, 1); ND.fightStep(fD, 1);   // Sela, never reached in round 1; round 2 with Unit 7
    editD(1, 1); ND.fightStep(fD, 1); ND.fightStep(fD, 1);   // the roster sets round 1 again with Sela on turn: on into round 2, reached already, with Unit 7, then Sela
    const gD = { hooks: D.hooks, kept: keptD, ticks: [D.ticks('c_kael'), D.ticks('c_u7'), D.ticks('c_sela')] };
    // (E) a player's initiative re-sorts the order in play: Kael rolls low after his turn, and Sela, still to come, keeps hers
    const E = mk3(), NE = E.net, fE = E.fight([E.row('t_kael', 'Kael'), E.row('t_u7', 'Unit 7'), E.row('t_sela', 'Sela')]);
    NE.fightStep(fE, 1); const intoE = E.api.initIntoFight(E.camp, 'mDocks', 'c_kael', 'u_a', -5), orderE = NE.combats[fE].rows.map(r => r.name), turnE = NE.combats[fE].turn;
    NE.fightStep(fE, 1); NE.fightStep(fE, 1);   // Sela, then Kael, moved past the row on turn though he had his turn
    const gE = { into: intoE, order: orderE, turn: turnE, hooks: E.hooks.slice(3), ticks: [E.ticks('c_kael'), E.ticks('c_sela')] };
    check('fold 3 (run for real): a roster edit keeps how far the fight has gone (rh, th and turned put back after cleaning, as rr and side are), a turn reached known by its row — Kael taken out before Unit 7\'s turn costs Sela, still to come, nothing; the roster setting round 1 again runs no round hook and no turn of it again; and a player\'s initiative that re-sorts the order in play keeps it the same way: Kael rolling low after his turn moves to the end, Sela, still to come, has her turn, and Kael\'s place at the end runs no second turn of his in that round',
        J(gD.kept) === J([1, J({ rt_kael: 1, rt_u7: 1 }), J({ c_kael: 1, c_u7: 1 })]) && J(gD.hooks) === J(['R1@1', 'T1.0:Kael@1', 'T1.1:Unit 7@1', 'T1.1:Sela@1', 'R2@1', 'T2.0:Unit 7@1', 'T2.1:Sela@1']) && J(gD.ticks) === J([1, 2, 2])
        && gE.into === true && J(gE.order) === J(['Unit 7', 'Sela', 'Kael']) && gE.turn === 0 && J(gE.hooks) === J(['T1.1:Sela@1']) && J(gE.ticks) === J([1, 1]), J([gD, gE]));
    // (H) the review of fold 3: a turn reached is known by its row, never by its place, so no edit of the order skips a turn still to come or runs one again
    const four = Wd => [Wd.row('t_kael', 'Kael'), Wd.row('t_u7', 'Unit 7'), Wd.row('t_sela', 'Sela'), Wd.row('t_mira', 'Mira')];
    const H1 = mk3(), g1 = H1.fight(four(H1));
    H1.net.fightStep(g1, 1); H1.net.fightStep(g1, 1);   // Sela's turn
    H1.net.fightSet(g1, { mapId: 'mDocks', round: 1, turn: 0, rows: [H1.row('t_kael', 'Kael'), H1.row('t_u7', 'Unit 7'), H1.row('t_mira', 'Mira')] });   // the roster's Update with Sela unticked: with the row on turn gone it sends the first row's turn (whiteboard.js, at >= 0 ? at : 0)
    H1.net.fightStep(g1, 1); H1.net.fightStep(g1, 1); H1.net.fightStep(g1, 1);   // Unit 7, reached already; Mira, never reached; round 2 with Kael
    const H2 = mk3(), g2 = H2.fight(four(H2));
    H2.net.fightStep(g2, 1); H2.net.fightStep(g2, 1); H2.net.fightStep(g2, -1);   // Sela's turn, then a step back to Unit 7
    H2.net.fightSet(g2, { mapId: 'mDocks', round: 1, turn: 1, rows: [H2.row('t_kael', 'Kael'), H2.row('t_u7', 'Unit 7'), H2.row('t_mira', 'Mira')] });   // the menu's Remove from the fight takes Sela out, the row on turn kept
    H2.net.fightStep(g2, 1);   // Mira, never reached
    const H3 = mk3(), g3 = H3.fight([Object.assign(H3.row('t_u7', 'Unit 7'), { init: 10, rolled: 1 }), Object.assign(H3.row('t_sela', 'Sela'), { init: 8, rolled: 1 }), Object.assign(H3.row('t_mira', 'Mira'), { init: 5, rolled: 1 }), H3.row('t_kael', 'Kael')]);
    H3.net.fightStep(g3, 1); H3.net.fightStep(g3, 1); H3.net.fightStep(g3, -1);   // Sela, Mira, then a step back to Sela
    const into3 = H3.api.initIntoFight(H3.camp, 'mDocks', 'c_kael', 'u_a', 6), order3 = H3.net.combats[g3].rows.map(r => r.name);   // Kael's first number goes in between Sela and Mira
    H3.net.fightStep(g3, 1); H3.net.fightStep(g3, 1);   // Kael, never reached; Mira, reached already
    const H4 = mk3(), g4 = H4.fight(four(H4));
    H4.net.fightStep(g4, 1);   // Unit 7's turn
    H4.net.fightSet(g4, { mapId: 'mDocks', round: 1, turn: 1, rows: [H4.row('t_mira', 'Mira'), H4.row('t_u7', 'Unit 7'), H4.row('t_kael', 'Kael'), H4.row('t_sela', 'Sela')] });   // the roster's Update after numbers typed: the draft sorted again, the row on turn kept
    H4.net.fightStep(g4, 1); H4.net.fightStep(g4, 1); H4.net.fightStep(g4, 1);   // Kael, reached already; Sela; round 2 with Mira
    const H5 = mk3(), g5 = H5.fight([H5.row('t_kael', 'Kael'), H5.row('t_u7', 'Unit 7')]);
    H5.net.fightStep(g5, 1); H5.net.fightStep(g5, 1);   // round 2, Kael's turn
    H5.net.fightSet(g5, { mapId: 'mDocks', round: 2, turn: 0, rows: [H5.row('t_kael', 'Kael'), H5.row('t_u7', 'Unit 7'), H5.row('t_mira', 'Mira')] });   // Add to the fight: Mira at the end, the row on turn kept
    H5.net.fightStep(g5, -1); const back5 = { round: H5.net.combats[g5].round, on: H5.net.combats[g5].rows[H5.net.combats[g5].turn].name, ticks: H5.ticks('c_mira') };   // a step back into round 1 lands on Mira
    H5.net.fightStep(g5, 1); H5.net.fightStep(g5, 1); H5.net.fightStep(g5, 1);   // on again: Kael, reached already; Unit 7; Mira
    const gH = { h1: [H1.hooks, H1.ticks('c_mira'), H1.ticks('c_u7')], h2: [H2.hooks, H2.ticks('c_mira')], h3: [into3, order3, H3.hooks, H3.ticks('c_kael'), H3.ticks('c_mira')], h4: [H4.hooks, H4.ticks('c_kael')], h5: [back5, H5.hooks, H5.ticks('c_mira')] };
    check('fold 3\'s review (run for real): a turn reached is known by its row, never by its place — the roster\'s Update with the row on turn unticked costs Mira, still to come, nothing and gives Unit 7 no second turn; a row taken out between the turn and the furthest turn reached after a step back costs Mira nothing; a player\'s first initiative that puts Kael in between after a step back gives him his turn and Mira no second one; the roster sorting a row already reached after the row on turn gives it no second turn; and a step back into a round the fight has gone past runs nothing for a row added since, which then has its turn and its timed effects once',
        J(gH.h1) === J([['R1@1', 'T1.0:Kael@1', 'T1.1:Unit 7@1', 'T1.2:Sela@1', 'T1.2:Mira@1', 'R2@1', 'T2.0:Kael@1'], 1, 1])
        && J(gH.h2) === J([['R1@1', 'T1.0:Kael@1', 'T1.1:Unit 7@1', 'T1.2:Sela@1', 'T1.2:Mira@1'], 1])
        && J(gH.h3) === J([true, ['Unit 7', 'Sela', 'Kael', 'Mira'], ['R1@1', 'T1.0:Unit 7@1', 'T1.1:Sela@1', 'T1.2:Mira@1', 'T1.2:Kael@1'], 1, 1])
        && J(gH.h4) === J([['R1@1', 'T1.0:Kael@1', 'T1.1:Unit 7@1', 'T1.3:Sela@1', 'R2@1', 'T2.0:Mira@1'], 1])
        && J(gH.h5) === J([{ round: 1, on: 'Mira', ticks: 0 }, ['R1@1', 'T1.0:Kael@1', 'T1.1:Unit 7@1', 'R2@1', 'T2.0:Kael@1', 'T2.1:Unit 7@1', 'T2.2:Mira@1'], 1]), J(gH));
    // (F) two fights on one map keep their own
    const F = mk3(), NF = F.net, f1 = F.fight([F.row('t_kael', 'Kael'), F.row('t_u7', 'Unit 7')]), f2 = F.fight([F.row('t_sela', 'Sela')]);
    NF.fightStep(f1, 1); NF.fightStep(f1, 1); NF.fightStep(f1, -1);   // the first fight: Unit 7, round 2 with Kael, back to Unit 7
    NF.fightStep(f2, 1); NF.fightStep(f2, -1); NF.fightStep(f2, 1);   // the second: its own round 2, back and on again
    NF.fightStep(f1, 1); NF.fightStep(f1, 1);   // the first: round 2 again with Kael, then Unit 7
    const gF = { hooks: F.hooks, own: [f1, f2].map(f => [NF.combats[f].rh, J(NF.combats[f].th), J(NF.combats[f].turned)]), ticks: [F.ticks('c_kael'), F.ticks('c_u7'), F.ticks('c_sela')] };
    check('fold 3 (run for real): two fights on one map keep how far each has gone on its own — the second fight reaches its own round 2 though the first has, and each fight\'s step back and on again runs nothing twice in that fight',
        J(gF.hooks) === J(['R1@1', 'T1.0:Kael@1', 'R1@2', 'T1.0:Sela@2', 'T1.1:Unit 7@1', 'R2@1', 'T2.0:Kael@1', 'R2@2', 'T2.0:Sela@2', 'T2.1:Unit 7@1'])
        && J(gF.own) === J([[2, J({ rt_kael: 1, rt_u7: 1 }), J({ c_kael: 2, c_u7: 2 })], [2, J({ rt_sela: 1 }), J({ c_sela: 2 })]]) && J(gF.ticks) === J([2, 2, 2]), J(gF));
    // (G) never sent: every copy of the fights the players were sent, and what the join snapshot and a hostile host would give
    const keysOf = cs => Object.keys(cs).map(k => Object.keys(cs[k]).sort().join(','));
    const S5 = ['id', 'mapId', 'round', 'turn', 'rows'].sort().join(','), S5T = ['id', 'mapId', 'round', 'turn', 'rows', 'tn'].sort().join(','), S4 = ['mapId', 'round', 'turn', 'rows'].sort().join(',');   // the keys a fight is sent with, and an older host's
    const msgs = [A, B, C, D, E, F].reduce((all, Wd) => all.concat(...Wd.conns.map(c => c.sent.filter(m => m.type === 'combats'))), []);
    const snapA = A.api.combatsFor('u_a', 'mDocks'), hostile = { f_abcd1234: { mapId: 'mDocks', round: 2, turn: 0, rows: [{ id: 'r1', name: 'Kael', tokId: 't_kael' }], rh: 9, th: 3, turned: { c_kael: 9 } } };
    const cleanedF = A.api.cleanFights(hostile), cleanedC = A.api.cleanCombats({ mDocks: hostile.f_abcd1234 });
    const gG = { host: [A, F].map(Wd => Object.keys(Wd.net.combats).every(k => ['rh', 'th', 'turned'].every(x => Object.prototype.hasOwnProperty.call(Wd.net.combats[k], x)))), msgs: msgs.length,
        sent: msgs.every(m => /"(rh|th|turned)"/.test(J(m)) === false && keysOf(m.combats).every(s => s === S5 || s === S5T)), snap: keysOf(snapA).map(s => s === S5T ? S5 : s), cleaned: [keysOf(cleanedF), keysOf(cleanedC)] };
    // 1.6.3 (the combat review, finding 29), moved on purpose: a fight that has stepped is sent with tn, its turn's serial, which a player's End turn names (S5T)
    check('fold 3 (run for real): rh, th and turned are the host\'s own — every fight here keeps all three, and none of them is in any copy of the fights a player was sent, in what the join snapshot carries (combatsFor), or in what a player\'s app keeps from a hostile host that names them (cleanFights, cleanCombats)',
        J(gG) === J({ host: [true, true], msgs: gG.msgs, sent: true, snap: [S5], cleaned: [[S5], [S4]] }) && gG.msgs > 20, J(gG));
    const rd3 = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n'), help3 = rd3('system/app/index.html'), notes3 = ['WHATSNEW.txt', 'system/app/assets/whatsnew.txt'].map(rd3);
    check('fold 3 (source): Help\'s combat entry says that a step back is a correction and runs nothing twice, naming the actions by the words their list shows, the Rolls entry says the round still goes back at a step back but runs an action once for each round reached, the timed effects say they count once a round, and both release notes say it under 1.5.5\'s Combat',
        help3.includes('<li>A step back with <b><i class="wib wi-nextturn wib-mirror"></i> Previous turn</b> on the turn strip is a correction. Going on again runs no <b>Also each round</b>, <b>Also at its turn&rsquo;s start</b> or <b>end</b> action twice, and counts no timed effect twice.</li>')
        && help3.includes('<b>Also each round</b> runs it on every character with a token in the fight once for each round the fight reaches. The round changes at the combat&rsquo;s start, at <b>Next turn</b> past the last and back at a step back past the first. A step back is a correction, so a round reached before runs nothing again.') && !help3.includes('runs no Each round or Each turn action')
        && help3.includes('In a combat one round passes at the start of its character&rsquo;s turn, once in each round of the fight, and a step back counts nothing again.')
        && notes3.every(t => { const a = t.indexOf('WAYPOINT 1.5.5'), b = t.indexOf('WAYPOINT 1.5.4'), c = t.indexOf('\nCombat\n', a), i = t.indexOf('- A step back on the turn strip is a correction. Going back and on\n'); return a >= 0 && c > a && i > c && i < b; }));
})());
// Fold 2 (backlog 152, docs/FIGHT_CLOCK_DESIGN.md sections 2, 4, 8 and 10): fights have ids of their own, so one map may hold two. net.js run for
// real on one host world with three fights, two on the Docks and one on the Bridge: the combats slice, everything from combatRefresh to the old names,
// the orders slice, the pos gate's turnCombatOf, the stage slice, net.itemGone and the turn messages' own branches; and a player's app beside it
// (the client's combats branch with the combats and orders slices). Each reader is asked of the fight that holds the token or the character
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js')), Dx = await import(url('dicecore.js'));
    const J = v => JSON.stringify(v), FID = /^f_[a-z0-9]{8}$/;
    const rdApp = f => fs.readFileSync(path.join(__dirname, '..', 'system', 'app', f), 'utf8').replace(/\r\n/g, '\n');
    const cbS = between('// [netcheck:combats-start]', '// [netcheck:combats-end]', 'combats'), setS = fnSrc('function combatRefresh() {', '\nnet.combatStep = function', 'combatSet'), stepS = fnSrc('net.combatStep = function', '\nnet.combatEnd = function', 'combatStep', 'netfight.js');
    const tcS = fnSrc('function turnCombatOf(', '\n}\n', 'turnCombatOf') + '\n}\n' + lineOf('function moveMode(') + '\n', stgS = between('// [netcheck:stage-start]', '// [netcheck:stage-end]', 'stage');
    const teS = between('// [netcheck:turnend-start]', '// [netcheck:turnend-end]', 'turnend'), hmS = between('// [netcheck:turnholdmsg-start]', '// [netcheck:turnholdmsg-end]', 'turnholdmsg');
    const igA = src.indexOf('net.itemGone = function(campId, itemId, title) {'), igS = src.slice(igA, src.indexOf('\n};\n', igA) + 4);
    const mkH = () => {
        const toasts = [], logs = [], marks = [], hooks = [], asked = [];
        const tok = (id, charId, ownerId, more) => Object.assign({ id, type: 'image', isChar: true, charId, x: 0, y: 0, w: 50, h: 50 }, ownerId ? { ownerId } : {}, more || {});
        const camp = { id: 'k', items: {
            mDocks: { id: 'mDocks', type: 'map', meta: { title: 'Docks' }, whiteboard: [tok('t_kael', 'c_kael', 'u_a'), tok('t_u7', 'c_u7'), tok('t_sela', 'c_sela', 'u_b'), tok('t_crate', 'c_crate', null, { isChar: false })] },
            mBridge: { id: 'mBridge', type: 'map', meta: { title: 'Bridge' }, whiteboard: [tok('t_u9', 'c_u9'), tok('t_u8', 'c_u8')] },
            mEmpty: { id: 'mEmpty', type: 'map', meta: { title: 'Yard' }, whiteboard: [] }, mQuiet: { id: 'mQuiet', type: 'map', meta: { title: 'Quay' }, whiteboard: [] } },
            chars: { c_kael: { id: 'c_kael', name: 'Kael', ownerId: 'u_a', values: {} }, c_u7: { id: 'c_u7', name: 'Unit 7', npc: true, values: {} }, c_sela: { id: 'c_sela', name: 'Sela', ownerId: 'u_b', values: {} }, c_u9: { id: 'c_u9', name: 'Unit 9', npc: true, values: {} }, c_u8: { id: 'c_u8', name: 'Unit 8', npc: true, values: {} }, c_crate: { id: 'c_crate', name: 'Crate', npc: true, values: {} } } };
        const mk = p => ({ peer: p, open: true, sent: [], send(m) { packCheck(m); this.sent.push(JSON.parse(J(m))); } }), conns = [mk('pA'), mk('pB'), mk('pC')];
        const net = { active: true, role: 'host', myId: 'u_gm', conns, roster: { pA: { id: 'u_a', name: 'Pat', location: 'mDocks' }, pB: { id: 'u_b', name: 'Bea', location: 'mDocks' }, pC: { id: 'u_c', name: 'Cy', location: 'mBridge' } }, combats: {}, targets: {}, turnSpent: {}, paused: false };
        const env = { net, window: { wpVtt: { on: () => true }, wpSheets: { roundHook: (m, c) => hooks.push('R:' + m + ':' + c.round), turnHook: m => hooks.push('T:' + m) } }, getActiveCampaign: () => camp, SC: () => Sx,
            own: H.own, toast: t => toasts.push(t), logEvent: (k, t) => logs.push(t), render() {}, console: { error: e => { throw e; } }, showConfirm: (t, cb) => { asked.push(t); cb(true); }, sendFailed: e => { throw e; },
            anyFog: () => false, fogDrop: () => null, broadcast: () => { throw new Error('the fights go to each connection on its own'); }, marksStart: m => marks.push('start:' + m), marksEnd: m => marks.push('end:' + m), renderNotepad() {},
            ensurePlayerToken() {}, peerPaused: () => false, allow: () => true, saveRemoteSoon() {}, pushChat() {}, _lastSent: {} };
        const api = new Function(...Object.keys(env), "'use strict';\n" + cbS + '\n' + setS + '\n' + stepS + '\n' + ordersSrc + '\n' + tcS + '\n' + stgS + '\n' + igS
            + '\nreturn { turnCombatOf: turnCombatOf, actsCombat: actsCombat, initIntoFight: initIntoFight, stageConn: stageConn, fightIds: fightIds, hidSig: combatHidSigNow, sentForget: combatsSentForget, sentSeed: combatsSentSeed, forgetAll: function() { combatForget(); }, turnEnd: function(msg, conn) {\n' + teS + '\n}, turnHold: function(msg, conn) {\n' + hmS + '\n} };')(...Object.values(env));
        return { net, camp, api, toasts, logs, marks, hooks, conns, asked };
    };
    {   // found live: End on a map of three fights said "The other fight there goes on."
        const E = mkH(), rowE = (tokId, name) => ({ id: 'r' + tokId, name, tokId, init: 0, src: null });
        const e1 = E.net.fightSet(null, { mapId: 'mDocks', round: 2, turn: 0, rows: [rowE('t_kael', 'Kael')] }), e2 = E.net.fightSet(null, { mapId: 'mDocks', round: 1, turn: 0, rows: [rowE('t_u7', 'Unit 7')] }), e3 = E.net.fightSet(null, { mapId: 'mDocks', round: 1, turn: 0, rows: [rowE('t_sela', 'Sela')] });
        const endE = [];
        [e1, e2, e3].forEach(f => { E.asked.length = 0; E.net.fightEnd(f); endE.push([E.asked.slice(), E.net.fightsOn('mDocks').length]); });
        check('fold 2 (net.js fightEnd, run for real; found live): End asks first, and on a map of three fights says that the other 2 go on, then that the other one goes on, and for the last that the ring and the turn strip go for everyone; each yes ends that fight alone',
            J(endE) === J([[['End combat on Docks? Round 2, 1 in the order. The other 2 fights there go on.'], 2], [['End combat on Docks? Round 1, 1 in the order. The other fight there goes on.'], 1], [['End combat on Docks? Round 1, 1 in the order. The ring and the turn strip go for everyone.'], 0]]), J(endE));
    }
    const W = mkH(), N = W.net, A = W.api, camp = W.camp, wb = id => camp.items.mDocks.whiteboard.find(w => w.id === id), rowOf = (tokId, name) => ({ id: 'r' + tokId, name, tokId, init: 0, src: null });
    const f1 = N.fightSet(null, { mapId: 'mDocks', round: 1, turn: 0, rows: [rowOf('t_kael', 'Kael'), rowOf('t_u7', 'Unit 7'), rowOf('t_crate', 'Crate')] });
    const f2 = N.fightSet(null, { mapId: 'mDocks', round: 1, turn: 0, rows: [rowOf('t_sela', 'Sela'), rowOf('t_kael', 'Kael')] });   // Kael is in the first fight already: his row stays out of the second
    const f3 = N.fightSet(null, { mapId: 'mBridge', round: 1, turn: 0, rows: [rowOf('t_u9', 'Unit 9')] }), marksStarted = W.marks.slice();
    const g1 = { ids: [f1, f2, f3].every(x => FID.test(x)) && new Set([f1, f2, f3]).size === 3, docks: J(N.fightsOn('mDocks')) === J([f1, f2]), bridge: J(N.fightsOn('mBridge')) === J([f3]), f2rows: N.combats[f2].rows.map(r => r.id),
        on: N.fightOn === f3, forDocks: N.combatFor('mDocks') === N.combats[f1], forBridge: N.combatFor('mBridge') === N.combats[f3], noFight: N.combatFor('mEmpty') };
    N.fightPlay(f2); g1.played = [N.fightOn === f2, N.combatFor('mDocks') === N.combats[f2], N.fightPlay('f_nothere1')]; N.fightPlay(f1);
    g1.tok = [N.combatOfTok('mDocks', 't_sela') === N.combats[f2], N.combatOfTok('mDocks', 't_kael') === N.combats[f1], N.combatOfTok('mBridge', 't_u9') === N.combats[f3], N.combatOfTok('mDocks', 't_u9'), N.combatOfTok('mDocks', 'constructor')];
    g1.order = [N.orderOf('c_kael') === f1, N.orderOf('c_sela') === f2, N.orderOf('c_u9') === f3, N.orderOf('c_crate'), N.charInCombat('c_crate'), N.charInCombat('c_sela'), N.orderOf('c_none'), N.orderOf('__proto__')];
    check('fold 2 (backlog 152, run for real): fights have ids of their own (f_ and 8 of a-z0-9), two on the Docks and one on the Bridge, listed by their map in the order begun; a token is in one fight at most, so Kael\'s row stays out of the second fight on the Docks; a new fight is the one played, and net.combatFor answers the fight played on a map, else the first begun there; net.combatOfTok the fight that holds a token; the marks start with a map\'s first fight only',
        g1.ids && g1.docks && g1.bridge && J(g1.f2rows) === J(['rt_sela']) && g1.on && g1.forDocks && g1.forBridge && g1.noFight === null && J(g1.played) === J([true, true, false]) && J(g1.tok) === J([true, true, true, null, null])
        && J(marksStarted) === J(['start:mDocks', 'start:mBridge']), J([g1, marksStarted]));
    check('fold 2: net.orderOf is the one judge of which fight a character is in, by combatChars\' rule — a character token of a character of the campaign, a hidden token counted too — so a token with Is Character unticked puts its character in no fight (its timed effects run as outside one: net.charInCombat), where it used to stop them without ever ticking them; a character that is none, or a prototype\'s name, is in none',
        J(g1.order) === J([true, true, true, null, false, true, null, null]) && /function charCombat\(camp, charId\) \{[^\n]*\n    var fid = orderOfIn\(camp, charId\); return fid \? \{ mapId: net\.combats\[fid\]\.mapId, combat: net\.combats\[fid\] \} : null;\n\}/.test(require('./checkkit').part('nettime.js')) && require('./checkkit').familyCount('net.js', /function orderOfIn\(/g) === 1, J(g1.order));
    // fold 2's review: the one judge reads Is Character as combatChars reads it, any word that is true (a file may write 1 or yes), so such a character
    // is in its fight for both; read as true alone, it was a fighter to the round and turn hooks and in no fight to net.orderOf, its timed effects running
    const ischar = [1, 'yes', true, 0, false, null].map(v => { wb('t_u7').isChar = v; return [N.orderOf('c_u7') === f1, Sx.combatChars(camp.items.mDocks, N.combats[f1], camp.chars).some(x => x.charId === 'c_u7'), N.charInCombat('c_u7')]; }); wb('t_u7').isChar = true;
    check('fold 2\'s review: net.orderOf reads a token\'s Is Character as combatChars reads it — any word that is true, as a file may write 1 or yes, puts its character in its fight for both, and net.charInCombat says so; a word that is false puts it in none for both',
        J(ischar) === J([[true, true, true], [true, true, true], [true, true, true], [false, false, false], [false, false, false], [false, false, false]]), J(ischar));
    // each reader asked of the right fight
    const g2 = { tc: [A.turnCombatOf(camp, 'mDocks', wb('t_sela')) === N.combats[f2], A.turnCombatOf(camp, 'mDocks', wb('t_kael')) === N.combats[f1], A.turnCombatOf(camp, 'mDocks', wb('t_u7')) === N.combats[f1], A.turnCombatOf(camp, 'mEmpty', wb('t_kael'))],
        acts: [A.actsCombat(camp, 'c_sela', N.roster.pB) === N.combats[f2], A.actsCombat(camp, 'c_kael', N.roster.pA) === N.combats[f1], A.actsCombat(camp, 'c_kael', N.roster.pC)] };
    g2.init = [A.initIntoFight(camp, 'mDocks', 'c_sela', 'u_b', 12), N.combats[f2].rows[0].init, N.combats[f2].rows[0].rolled, N.combats[f1].rows.every(r => !r.rolled)];
    const st = () => [N.combats[f1].round, N.combats[f1].turn, N.combats[f2].round, N.combats[f2].turn, N.combats[f3].round];
    const s0 = st(); A.turnEnd({ type: 'turn-end', mapId: 'mDocks', row: 'rt_sela' }, W.conns[1]); const s1 = st();
    A.turnEnd({ type: 'turn-end', mapId: 'mDocks', row: 'rt_kael' }, W.conns[0]); const s2 = st();
    A.turnEnd({ type: 'turn-end', mapId: 'mDocks', row: 'rt_sela' }, W.conns[0]); const s3 = st();   // Pat ends a turn that is Sela's: nothing
    A.turnHold({ type: 'turn-hold', mapId: 'mDocks', row: 'rt_sela' }, W.conns[1]); const s4 = st();
    check('fold 2 (run for real): each reader asks the fight that holds the token or the character — the pos gate\'s turnCombatOf, the actions a turn allows (actsCombat), a player\'s initiative roll into the fight (initIntoFight, Sela\'s in the second fight and nothing of the first) — and the turn messages find their fight by the row, carrying nothing new: Sela\'s End turn steps the second fight, Kael\'s the first, Pat ending a turn that is Sela\'s does nothing, and Sela\'s hold moves her own fight alone',
        J(g2.tc) === J([true, true, true, null]) && J(g2.acts) === J([true, true, null]) && J(g2.init) === J([true, 12, 1, true])
        && J([s0, s1, s2, s3, s4]) === J([[1, 0, 1, 0, 1], [1, 0, 2, 0, 1], [1, 1, 2, 0, 1], [1, 1, 2, 0, 1], [1, 1, 3, 0, 1]]), J([g2, s0, s1, s2, s3, s4]));
    // fold 2's review: what the table was told of hidden rows (combatHidSigNow) is read fight by fight, so hiding a token of the second fight on the
    // Docks moves it as hiding one of the first does; and a copy of a fogged map that leaves out or brings back a token of the second fight there
    // changes what that connection's order holds (fogSeed), as one of the first does
    const sg0 = A.hidSig(); wb('t_sela').hidden = true; const sg1 = A.hidSig(); wb('t_sela').hidden = false; wb('t_kael').hidden = true; const sg2 = A.hidSig(); wb('t_kael').hidden = false; const sg3 = A.hidSig();
    const fsS = (() => { const p = require('./checkkit').part('netfog.js'), i = p.indexOf('function fogSeed(conn, mapId, out, sum) {'), e = p.indexOf('\n}\n', i); return i < 0 || e < 0 ? 'function fogSeed() { throw new Error("fogSeed is not found"); }' : p.slice(i, e + 3); })();   // in netfog.js, a part of net.js
    const netF = { combats: { f_dock0001: { id: 'f_dock0001', mapId: 'mDocks', round: 1, turn: 0, rows: [{ id: 'rt_kael', tokId: 't_kael' }] }, f_dock0002: { id: 'f_dock0002', mapId: 'mDocks', round: 1, turn: 0, rows: [{ id: 'rt_sela', tokId: 't_sela' }] } }, targets: {} };
    const seedF = new Function('net', 'own', 'getActiveCampaign', "'use strict';\nvar _fogHeld = Object.create(null); function quickHash(s) { return s; }\n" + ordersSrc + '\n' + fsS + '\nreturn fogSeed;')(netF, H.own, () => null);
    const cF = { peer: 'pB' }, wbOf = ids => ({ whiteboard: ids.map(id => ({ id })) });
    const seedR = [['t_kael', 't_sela', 't_crate'], ['t_kael', 't_sela', 't_crate'], ['t_kael', 't_crate'], ['t_kael', 't_sela', 't_crate'], ['t_kael', 't_sela'], ['t_sela']].map(ids => seedF(cF, 'mDocks', wbOf(ids)));
    check('fold 2\'s review (combatHidSigNow and fogSeed, run for real): hiding a token of the second fight on a map moves what the table was told of hidden rows, as one of the first does, and showing it again puts it back; a copy of a fogged map that leaves out a token of the second fight there, or brings it back, changes what that connection\'s turn order holds, as one of the first does, and a piece that is in no fight changes nothing',
        sg1 !== sg0 && sg2 !== sg0 && sg2 !== sg1 && sg3 === sg0 && J(seedR) === J([true, false, true, true, false, true]), J([sg0, sg1, sg2, seedR]));
    // what each connection is sent: the fights on the map it is on, under their own ids, nothing of the host's own; a stage sends them after the word
    const lastC = c => c.sent.filter(m => m.type === 'combats').pop(), ca = lastC(W.conns[0]), cb = lastC(W.conns[1]), cc = lastC(W.conns[2]), allSent = J(W.conns.map(c => c.sent));
    const kinds = c => c.sent.map(m => m.type + (m.type === 'combats' ? ':' + Object.keys(m.combats).join(',') : ''));
    W.conns[2].sent.length = 0; A.stageConn(W.conns[2], { campId: 'k', itemId: 'mDocks' }, true); const stg1 = kinds(W.conns[2]);
    W.conns[2].sent.length = 0; A.stageConn(W.conns[2], { campId: 'k', itemId: 'mEmpty' }, true); const stg2 = kinds(W.conns[2]);
    W.conns[2].sent.length = 0; A.stageConn(W.conns[2], { campId: 'k', itemId: 'mQuiet' }, true); const stg3 = kinds(W.conns[2]);
    check('fold 2 (run for real): each connection is sent the fights on the map it is on, under their own ids in the order begun — Pat and Bea the two on the Docks, Cy the one on the Bridge — each fight naming its map and id, and never a fight\'s count, last rolled round or a row\'s number; a stage sends that connection the fights on the map it now stands on, after the stage word, and the empty list where it left a fight for a map with none; between two maps with no fight it sends none',
        J(Object.keys(ca.combats)) === J([f1, f2]) && J(cb) === J(ca) && J(Object.keys(cc.combats)) === J([f3]) && J(Object.values(ca.combats).map(f => [f.id, f.mapId])) === J([[f1, 'mDocks'], [f2, 'mDocks']]) && !/"n":|"rr":|"init":|"rolled":|"tb":/.test(allSent)
        && J(stg1) === J(['stage', 'combats:' + f1 + ',' + f2]) && J(stg2) === J(['stage', 'combats:']) && J(stg3) === J(['stage']), J([Object.keys(ca.combats), Object.keys(cc.combats), stg1, stg2, stg3]));
    // fold 2's review: a fight that moves on another map sends a connection nothing at all. Before, everyone was sent a copy at every step of any fight,
    // an empty one to a player on a map with none, which told them that a fight ran elsewhere and how fast. A copy that changed still goes; the record
    // of what each connection holds is forgotten with the connection and at a new table, and the join snapshot seeds it
    const cmbN = () => W.conns.map(c => c.sent.filter(m => m.type === 'combats').length), clearW = () => W.conns.forEach(c => { c.sent.length = 0; });
    clearW(); N.fightStep(f3, 1); N.fightStep(f3, 1); const q1 = cmbN();   // the Bridge's fight: Pat and Bea are on the Docks, Cy on the Quay
    N.roster.pC.location = 'mBridge'; clearW(); N.fightStep(f3, 1); const q2 = cmbN();   // Cy now on the Bridge: its fight is news to him
    clearW(); N.fightStep(f2, 1); const q3 = cmbN(), q3b = Object.keys((W.conns[1].sent.filter(m => m.type === 'combats').pop() || { combats: {} }).combats);   // the Docks' second fight: Pat and Bea
    A.sentForget('pA'); clearW(); N.fightStep(f3, 1); const q4 = cmbN(), patCopy = (W.conns[0].sent.filter(m => m.type === 'combats').pop() || {}).combats;   // Pat's connection gone and back: he is sent his copy again
    A.forgetAll(); clearW(); N.fightStep(f3, 1); const q5 = cmbN();   // a new table: everyone
    A.sentForget('pA'); A.sentSeed(W.conns[0], patCopy); clearW(); N.fightStep(f3, 1); const q6 = cmbN();   // Pat's snapshot carried his copy: nothing more
    N.roster.pC.location = 'mQuiet';
    check('fold 2\'s review (broadcastCombats, run for real): a fight that moves on another map sends a connection nothing at all — Pat and Bea on the Docks and Cy on the Quay hear nothing of two steps of the Bridge\'s fight, where each was sent a copy at every step before — while a copy that changed still goes: Cy, now on the Bridge, its fight; Pat and Bea a step of the Docks\' second fight; Pat his copy again once his connection is gone and back, and everyone at a new table; a copy the join snapshot carried is not sent again',
        J(q1) === J([0, 0, 0]) && J(q2) === J([0, 0, 1]) && J(q3) === J([1, 1, 0]) && J(q3b) === J([f1, f2]) && J(q4) === J([1, 0, 1]) && J(q5) === J([1, 1, 1]) && J(q6) === J([0, 0, 1]), J([q1, q2, q3, q4, q5, q6]));
    // the end of each: the marks end with a map's last fight; the fight played handed on; a deleted map ends every fight on it
    // 152 fold 4: the GM's own steps above made the Bridge's fight the one played, so the Docks' first is played again before it ends
    N.fightPlay(f1); W.marks.length = 0; N.fightSet(f1, null); const mEnd1 = W.marks.slice(), on1 = N.fightOn === f2; N.fightSet(f2, null); const mEnd2 = W.marks.slice(), on2 = N.fightOn === f3;
    W.marks.length = 0; const f4 = N.fightSet(null, { mapId: 'mBridge', round: 1, turn: 0, rows: [rowOf('t_u8', 'Unit 8')] }), mF4 = W.marks.slice(); W.toasts.length = 0;
    delete camp.items.mBridge; N.itemGone('k', 'mBridge', 'Bridge'); const gone = { left: A.fightIds(), marks: W.marks.slice(), on: N.fightOn, toasts: W.toasts.filter(t => t === 'Combat ended on Bridge.').length, f4: FID.test(f4) };
    check('fold 2 (run for real): the marks end only with a map\'s last fight (the first fight on the Docks ends and the marks stay held for the second; the second ends and they end); the fight played that ends hands on to the one furthest behind, which, with no fight keeping time here, is the first begun of those left (152 fold 4); a second fight on the Bridge starts no marks again, and deleting the Bridge ends both fights on it, each with its notice, and the marks there once',
        J(mEnd1) === J([]) && on1 && J(mEnd2) === J(['end:mDocks']) && on2 && J(mF4) === J([]) && J(gone) === J({ left: [], marks: ['end:mBridge'], on: null, toasts: 2, f4: true }), J([mEnd1, mEnd2, mF4, gone]));
    // a player's roll reads CombatRound from the fight that holds its token (roll-req, run for real over the hud-d20 fixture)
    const rqS = between('// [netcheck:rollreq-start]', '// [netcheck:rollreq-end]', 'rollreq'), helpersR = ['function own(', 'function peerProfileId(', 'function fxLib(', 'function itemLib(', 'function diceFrom('].map(k => lineOf(k)).join('\n') + '\n';
    const gmSys = Sx.cleanSystem(JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'hud-d20.json'), 'utf8')), { F: Fx, gmView: true });
    const rollAs = (charId, ownerId, peer, tokId) => {
        const campR = { id: 'k', activeItemId: 'mDocks', system: gmSys, chars: { [charId]: { id: charId, name: 'X', ownerId, npc: false, values: { f_str: 14, f_level: 5 } } }, items: { mDocks: { type: 'map', whiteboard: [{ id: tokId, isChar: true, charId, ownerId, x: 0, y: 0 }] } } };
        const netR = { active: true, role: 'host', paused: false, roster: { [peer]: { id: ownerId, name: 'P', location: 'mDocks' } }, combats: { f_dock0001: { id: 'f_dock0001', mapId: 'mDocks', round: 2, turn: 0, rows: [{ id: 'rt_kael', tokId: 't_kael' }] }, f_dock0002: { id: 'f_dock0002', mapId: 'mDocks', round: 7, turn: 0, rows: [{ id: 'rt_sela', tokId: 't_sela' }] } } };
        const out = [];
        new Function('msg', 'conn', 'net', 'DC', 'SC', 'window', 'getActiveCampaign', 'peerPaused', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'var diceLimit = null, _diceSlowSaid = {};\n' + helpersR + ordersSrc + "\nnet.fightOn = 'f_dock0002';   // the GM plays the second fight (set after the slice, which starts with none)\n" + rqS)(
            { type: 'roll-req', rid: 'q1', expr: 'd20 + RoundNow', charId }, { peer, send() {} }, netR, () => Dx, () => Sx, { wpFormula: Fx, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }) }, wpVtt: { on: () => true, rulesOn: () => true } }, () => campR, () => false, e => { throw e; }, rec => out.push(rec), () => {}, () => {});
        const r = out[0]; return r ? (r.names || []).filter(x => x.name === 'RoundNow').map(x => x.value)[0] : 'none';
    };
    const rounds = [rollAs('c_kael', 'u_a', 'pA', 't_kael'), rollAs('c_sela', 'u_b', 'pB', 't_sela'), rollAs('c_rook', 'u_c', 'pC', 't_rook')];
    check('fold 2 (roll-req, run for real): a player\'s roll reads CombatRound from the fight that holds their token, two fights on one map in rounds 2 and 7 — Kael\'s reads 2 and Sela\'s 7 — and one whose token is in neither reads the first begun there, though the GM plays the second (fold 2\'s review: as the player\'s own sheet reads it, net.combatRoundOf; the fight played is the host\'s own and never sent)',
        J(rounds) === J([2, 7, 2]), J(rounds));
    // a player's app: the toasts follow the fight that holds their token on the map on screen; a newer player at an older host reads today's shape
    const cbr = (() => { const a = src.indexOf("} else if (msg.type === 'combats' && net.role === 'client') {"), b = src.indexOf("    } else if (msg.type === 'targets' && net.role === 'client') {", a); return a < 0 || b < 0 ? 'throw new Error("the combats branch is not found");' : src.slice(src.indexOf('\n', a) + 1, b); })();
    const mkC = () => {
        const toasts = [], campC = { activeItemId: 'mDocks', items: { mDocks: { id: 'mDocks', type: 'map', whiteboard: [{ id: 't_sela', isChar: true, ownerId: 'u_b' }, { id: 't_kael', isChar: true, ownerId: 'u_a' }] } } }, netC = { role: 'client', myId: 'u_b', combats: {} };
        const apiC = new Function('net', 'getActiveCampaign', 'toast', 'fromHost', 'combatRefresh', "'use strict';\n" + cbS + '\n' + ordersSrc + '\nreturn { know: fightsKnow, cleanCombats: cleanCombats, cleanFights: cleanFights, got: function(msg, conn) {\n' + cbr + '\n} };')(netC, () => campC, t => toasts.push(t), () => true, () => {});
        return { net: netC, api: apiC, toasts };
    };
    const O = mkC(); O.api.know(undefined); O.api.got({ type: 'combats', combats: { mDocks: { mapId: 'mDocks', round: 1, turn: 0, rows: [{ id: 'rt_sela', name: 'Sela', tokId: 't_sela' }] } } }, {});
    const old1 = [Object.keys(O.net.combats), O.net.combats.mDocks && O.net.combats.mDocks.round, O.toasts.slice(), O.net.fightsOn('mDocks')];
    const O2 = mkC(); O2.api.know('yes'); O2.api.got({ type: 'combats', combats: { mDocks: { mapId: 'mDocks', round: 1, turn: 0, rows: [{ id: 'x', name: 'X' }] } } }, {}); const old2 = Object.keys(O2.net.combats);
    const two = (t1, t2) => ({ type: 'combats', combats: { f_dock0001: { id: 'f_dock0001', mapId: 'mDocks', round: 1, turn: t1, rows: [{ id: 'rt_kael', name: 'Kael', tokId: 't_kael' }, { id: 'c_u7', name: 'Unit 7', tokId: null }] }, f_dock0002: { id: 'f_dock0002', mapId: 'mDocks', round: 1, turn: t2, rows: [{ id: 'rt_sela', name: 'Sela', tokId: 't_sela' }, { id: 'c_u8', name: 'Unit 8', tokId: null }] } } });
    const Nw = mkC(); Nw.api.know(true); Nw.api.got(two(0, 0), {}); const n1 = Nw.toasts.slice();
    Nw.api.got(two(1, 0), {}); const n2 = Nw.toasts.length; Nw.api.got(two(1, 1), {}); const n3 = Nw.toasts.slice(-1);
    Nw.api.got({ type: 'combats', combats: { f_dock0001: two(1, 1).combats.f_dock0001 } }, {}); const n4 = [Nw.toasts.slice(-1), Object.keys(Nw.net.combats)];
    Nw.api.got({ type: 'combats', combats: { mDocks: { mapId: 'mDocks', round: 1, turn: 0, rows: [{ id: 'x', name: 'X' }] } } }, {}); const n5 = Object.keys(Nw.net.combats);
    check('fold 2 (a player\'s app, the combats branch run for real): a host that says fights (true only) is read by the fights\' own ids, two on one map; the toasts follow the fight that holds this player\'s token on the map on screen — "Combat! Sela\'s turn." as it begins, nothing when the other fight there moves on, her own fight\'s next turn, and "Combat is over." when her fight ends while the other goes on — and a map-keyed copy from such a host holds no fight; a newer player at an older host, which says nothing of fights (or says something that is not true), reads today\'s shape exactly, by the map',
        J(old1) === J([['mDocks'], 1, ["Combat! Sela's turn."], ['mDocks']]) && J(old2) === J(['mDocks']) && J(n1) === J(["Combat! Sela's turn."]) && n2 === 1 && J(n3) === J(["Unit 8's turn."]) && J(n4) === J([['Combat is over.'], ['f_dock0001']]) && J(n5) === J([]),
        J([old1, old2, n1, n2, n3, n4, n5]));
    // fold 2's review: a player's app finds the turn of theirs in whichever fight on the map holds it (net.myTurnTok, run for real over the orders slice),
    // and its End turn names that row, which the host finds its fight by: Sela on turn in the second fight on the Docks, Kael in the first
    const mtS = (() => { const a = src.indexOf('net.myTurnTok = function() {'), b = src.indexOf('\nnet.turnAct = function(rowId) {', a); return a < 0 || b < 0 ? 'throw new Error("net.myTurnTok is not found");' : src.slice(a, b); })();
    const myTurn = (me, t1, t2) => {
        const sentT = [], campT = { activeItemId: 'mDocks', items: { mDocks: { id: 'mDocks', type: 'map', whiteboard: [{ id: 't_kael', isChar: true, ownerId: 'u_a' }, { id: 't_sela', isChar: true, ownerId: 'u_b' }, { id: 't_u7', isChar: true }] } } };
        const netT = { active: true, role: 'client', stream: false, myId: me, foreign: true, syncedPeer: 'h', conns: [{ peer: 'h', open: true, send(m) { sentT.push(JSON.parse(J(m))); } }], combats: two(t1, t2).combats };
        new Function('net', 'getActiveCampaign', 'window', 'own', "'use strict';\n" + ordersSrc + '\n' + mtS)(netT, () => campT, { wpVtt: { on: () => true } }, H.own);
        const t = netT.myTurnTok(), e = netT.turnEnd(); return [t ? [t.fid, t.rowId, t.tok.id] : null, e.ok === true ? sentT : e.error];
    };
    const mt = [myTurn('u_b', 1, 0), myTurn('u_a', 0, 0), myTurn('u_b', 1, 1), myTurn('u_a', 1, 0)];
    check('fold 2\'s review (a player\'s app, net.myTurnTok and net.turnEnd run for real): Sela on turn in the second fight on the Docks finds it there, with Unit 7 on turn in the first, and her End turn names her row; Kael on turn in the first finds his; neither finds a turn of someone else\'s',
        J(mt) === J([[['f_dock0002', 'rt_sela', 't_sela'], [{ type: 'turn-end', mapId: 'mDocks', row: 'rt_sela' }]], [['f_dock0001', 'rt_kael', 't_kael'], [{ type: 'turn-end', mapId: 'mDocks', row: 'rt_kael' }]], [null, 'It is not your turn.'], [null, 'It is not your turn.']]), J(mt));
    // a hostile host's "__proto__" key: a key like any other, never the copy's prototype, by either reader; an id that is no fight's dropped
    const hostileOld = JSON.parse('{"__proto__":{"mapId":"mDocks","round":5,"turn":0,"rows":[{"id":"x","name":"Evil"}]},"mDocks":{"mapId":"mDocks","round":1,"turn":0,"rows":[{"id":"y","name":"Y"}]}}');
    const hostileNew = JSON.parse('{"__proto__":{"id":"f_aaaaaaaa","mapId":"mDocks","rows":[{"id":"x"}]},"f_bbbbbbbb":{"mapId":"mDocks","rows":[{"id":"z"}]},"f_BAD12345":{"mapId":"mDocks","rows":[{"id":"q"}]},"f_cccccccc":{"mapId":"","rows":[{"id":"q"}]},"f_dddddddd":{"mapId":"mDocks","rows":[]}}');
    const oc = O.api.cleanCombats(hostileOld), nc = O.api.cleanFights(hostileNew), Hc = mkC(); Hc.api.know(false); Hc.api.got({ type: 'combats', combats: hostileOld }, {});
    const hp = [Object.getPrototypeOf(oc) === null, Object.keys(oc).sort(), oc.round, oc.rows, Object.getPrototypeOf(nc) === null, Object.keys(nc), nc.f_bbbbbbbb && nc.f_bbbbbbbb.id, nc.rows, Object.getPrototypeOf(Hc.net.combats) === null, ({}).round, Hc.net.combats.round];
    check('fold 2 (security): a hostile host\'s "__proto__" key is a key like any other — the reader of an older host\'s shape (cleanCombats) and the reader by id (cleanFights) build into an object with no prototype, so no fight becomes the copy\'s prototype (before, the older reader took it as one: the copy then read that fight\'s round and rows for any name); cleanFights keeps only an id of f_ and 8 of a-z0-9 with a map\'s id and a row, and names each fight by its key; nothing reaches Object.prototype',
        J(hp) === J([true, ['__proto__', 'mDocks'], null, null, true, ['f_bbbbbbbb'], 'f_bbbbbbbb', null, true, null, null]), J(hp));
    // the wiring
    const snapP = require('./checkkit').part('netfog.js'), snapAt = snapP.indexOf('function applySnapshot(msg) {'), snapEnd = snapP.indexOf('\n}\n', snapAt), snapBody = snapAt > 0 && snapEnd > snapAt ? snapP.slice(snapAt, snapEnd) : '';   // in netfog.js, a part of net.js
    const wbSrcR = rdApp('scripts/whiteboard.js'), shSrcR = rdApp('scripts/sheets.js');
    check('fold 2\'s review (source): the join snapshot seeds what its connection holds of the fights, and its close (fogForgetConn) and a new table (combatForget) forget it; CombatRound reads net.combatRoundOf in the host\'s roll for a player, in an apply action and on the sheet, never the fight the GM plays; the board\'s ring on a token whose turn it is asks every fight on the map through onTurnHere',
        /\n    if \(snapOk && typeof combatsSentSeed === 'function'\) combatsSentSeed\(conn, snap\.combats\);/.test(src) && /function fogForgetConn\(peer\) \{[^\n]*if \(typeof combatsSentForget === 'function'\) combatsSentForget\(peer\); \}/.test(require('./checkkit').part('netfog.js'))
        && /function combatForget\(fid\) \{ if \(fid === undefined\) \{ _combatSeen = Object\.create\(null\); _combatsSent = Object\.create\(null\); \}/.test(src)
        && (src.match(/net\.combatRoundOf\(/g) || []).length === 4 /* 1.6.0: and Or resisted by's list roll, judging its Shown where in the target's fight (moved on purpose); 1.6.3: and lockOptsHost, reading a field's Locked while in the round the player's own sheet reads it in (moved on purpose) */ && !/net\.combatFor\(loc[QA]\)/.test(src) && (shSrcR.match(/n\.combatRoundOf\(/g) || []).length === 1
        && /el\.classList\.toggle\('wb-turn', onTurnHere\(window\.wpNet, activeMap\.id, item\.id\)\);/.test(wbSrcR) && (wbSrcR.match(/onTurnHere\(/g) || []).length === 3 /* 1.6.3 (the combat review, finding 26): and turnRings, which sets the ring after a step within its round with no redraw (moved on purpose) */);
    check('fold 2 (source): the join snapshot says fights (true) and carries the fights on the map the player lands on; a player\'s app takes the word through typeof before it reads the snapshot\'s fights and reads every later copy by it; nothing of the host reads a fight by its map\'s id any more (net.js, whiteboard.js, pills.js and sheets.js); fights start, change and end in fightSet alone and end in combatOver alone; the host\'s branches are 31 (voice-up of voice chat, 1.5.9, the newest) (1.6.0, a deliberate change of this pin: blast-roll, the core\'s gap 8, a player\'s press of a blast card, makes the host\'s branches 34; 1.6.0 B5, a deliberate change of this pin: hit-ask, a player asking which locations their target has, makes them 35; 1.6.0, a deliberate change of this pin: sheet-out, a player asking the host\'s reader for a file of their own character, makes them 36; 1.6.2, a deliberate change of this pin: show-ask, a player asking to put drawings on the map, makes them 37)',
        /combats: combatsFor\(prof\.id, prof\.location\), fights: true,/.test(src) && /\n    if \(typeof fightsKnow === 'function'\) fightsKnow\(msg\.fights\);[^\n]*\n    net\.combats = typeof cleanFightsIn === 'function' \? cleanFightsIn\(msg\.combats\) : cleanCombats\(msg\.combats\);/.test(snapBody)
        && src.split('fightsKnow(').length === 3 && /var before = net\.combats, after = typeof cleanFightsIn === 'function' \? cleanFightsIn\(msg\.combats\) : cleanCombats\(msg\.combats\);/.test(src)
        && !/combats\[(mapId|am\.id|map\.id|activeMap\.id|combatDraft\.mapId|getActiveMap\(\)\.id|msg\.mapId|locQ|locA|pr\.location|mid)\]/.test(src + rdApp('scripts/whiteboard.js') + rdApp('scripts/pills.js') + rdApp('scripts/sheets.js'))
        && require('./checkkit').familyCount('net.js', /net\.combats\[fid\] = f;/g) === 1 && (src.match(/combatOver\(/g) || []).length === 4 && (src.match(/msg\.type === '[a-z-]+' && net\.role === 'host'/g) || []).length === 49 /* 1.6.4 (Drop here, a deliberate change of this pin): drop, the 49th; 1.6.4 (a Notes page on every sheet, a deliberate change of this pin): char-qnote, the 48th; 1.6.4 (a player's name changed at the table, a deliberate change of this pin): profile-set, the 47th; 1.6.3 (the multiplayer review, finding 9): handout-want, the 46th; (defense fold 4): send-on, the 45th; (defense fold 1): land-take, the 44th; 1.6.2 (backlog 42): box, the 43rd; 1.6.2 Assist: help-act, the 42nd (moved on purpose) */);
})());
{   // the review of backlog 237: a token given its own copy of a sheet while a fight runs (net.js charSplitFight and fightRowsRenamed, sliced by their charsplit markers and run for real)
    const J = JSON.stringify, csS = between('// [netcheck:charsplit-start]', '// [netcheck:charsplit-end]', 'charsplit', 'netfight.js');
    const mkS = (o) => {
        o = o || {}; const seen = { bc: 0, kept: 0, strip: 0 };
        const map = { id: 'm1', type: 'map', whiteboard: [{ id: 'g1', isChar: true, charId: 'c_g', charName: 'Guard', name: 'Guard' }, { id: 'g2', isChar: true, charId: 'c_n', charName: 'Guard 2', name: 'Guard 2' }, { id: 'g3', isChar: true, charId: 'c_g', charName: 'Guard', name: 'Guard' }] };
        const camp = { id: 'k', items: { m1: map }, chars: { c_g: { id: 'c_g', name: 'Guard' }, c_n: { id: 'c_n', name: 'Guard 2' } } };
        const turned = Object.create(null); turned.c_g = 2; const fxEnded = Object.create(null); fxEnded.c_g = 2;
        const f1 = { id: 'f1', mapId: 'm1', round: 2, turn: o.onTurn ? 1 : 0, rows: [{ id: 'rg1', tokId: 'g1', name: 'Guard' }, { id: 'rg2', tokId: 'g2', name: 'Guard' }, { id: 'rg3', tokId: 'g3', name: 'Guard' }], turned, fxEnded };
        const net = { active: !!o.host, role: o.client ? 'client' : (o.host ? 'host' : undefined), combats: { f1 }, turnSpent: { c_g: { act: 1 } }, turnMax: { c_g: { act: 2 } }, turnMove: { f1: { rowId: o.onTurn ? 'rg2' : 'rg1', tokId: o.onTurn ? 'g2' : 'g1', charId: 'c_g', run: 3 } } };
        const win = { wpRowNameOf: (w) => w.charName || w.name, wpRenderCombatStrip: () => seen.strip++ };
        const fn = new Function('net', 'own', 'fightIds', 'getActiveCampaign', 'window', 'broadcastCombats', 'fightsKeepSoon', csS + '\nreturn net;');
        fn(net, (ob, k) => !!ob && typeof k === 'string' && Object.prototype.hasOwnProperty.call(ob, k) && ob[k] !== undefined && ob[k] !== null, () => Object.keys(net.combats), () => camp, win, () => seen.bc++, () => seen.kept++);
        return { net, camp, map, f1, seen };
    };
    const A = mkS({ onTurn: true, host: true }), a1 = A.net.charSplitFight('c_g', 'c_n', 'g2');
    const B = mkS({ onTurn: false }), b1 = B.net.charSplitFight('c_g', 'c_n', 'g2');
    const C = mkS({ onTurn: true, client: true, host: true }), c1 = C.net.charSplitFight('c_g', 'c_n', 'g2'), c2 = A.net.charSplitFight('c_g', 'c_g', 'g2'), c3 = A.net.charSplitFight(null, 'c_n', 'g2');
    check('the review of backlog 237 (charSplitFight): a guard given its own copy while a fight runs takes the round its sheet\'s turn timed effects and turn-end ones were last counted in, so its copy is not counted twice in that round; where its row is on turn it takes what the turn has spent and allows, and a run under way names the copy, so it gets no action back; off turn, those stay with the original; a client, the same id and no id move nothing',
        a1 === true && A.f1.turned.c_n === 2 && A.f1.fxEnded.c_n === 2 && A.f1.turned.c_g === 2 && J(A.net.turnSpent.c_n) === J({ act: 1 }) && A.net.turnSpent.c_n !== A.net.turnSpent.c_g && J(A.net.turnMax.c_n) === J({ act: 2 }) && A.net.turnMove.f1.charId === 'c_n' && A.seen.kept === 1
        && b1 === true && B.f1.turned.c_n === 2 && !('c_n' in B.net.turnSpent) && !('c_n' in B.net.turnMax) && B.net.turnMove.f1.charId === 'c_g'
        && c1 === false && !('c_n' in C.f1.turned) && c2 === false && c3 === false, J([A.f1.turned, A.net.turnSpent, A.net.turnMove, B.net.turnSpent]));
    const R = mkS({ host: true }); R.map.whiteboard[1].charName = R.map.whiteboard[1].name = 'Guard 2'; const r1 = R.net.fightRowsRenamed(['g2']), r2 = R.net.fightRowsRenamed(['g2']), r3 = R.net.fightRowsRenamed([]);
    const Q = mkS({}); const q1 = Q.net.fightRowsRenamed(['g2', 'g3']), P = mkS({ host: true, client: true }), p1 = P.net.fightRowsRenamed(['g2']);
    check('the review of backlog 237 (fightRowsRenamed): after a split a fight\'s row takes its token\'s new name as a row is named at Start (rowNameOf), sent to the table once by the host and drawn on the strip, nothing sent where nothing changed; on a GM\'s machine with no table the fight is kept for a reload; a client renames nothing',
        r1 === 1 && J(R.f1.rows.map(x => x.name)) === J(['Guard', 'Guard 2', 'Guard']) && R.seen.bc === 1 && R.seen.strip === 1 && r2 === 0 && r3 === 0 && R.seen.bc === 1 && q1 === 1 && Q.seen.bc === 0 && Q.seen.kept === 1 && p1 === 0 && P.f1.rows[1].name === 'Guard'
        , J([R.f1.rows, R.seen, Q.seen]));
    const shN = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'sheets.js'), 'utf8'), wbN = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'whiteboard.js'), 'utf8');
    check('the review of backlog 237 wired: shareTake asks charSplitFight only for a token that stood on that very sheet, and holdsRetarget for every copy; the three ways a split is made name the fights\' rows again once; the board publishes the name a row takes',
        shN.includes("if (n && was === c.id && typeof n.charSplitFight === 'function') n.charSplitFight(c.id, nc.id, w.id);") && shN.includes("if (n && typeof n.holdsRetarget === 'function') n.holdsRetarget(w.id, c.id, nc.id);")
        && shN.includes('syncOwners(getActiveCampaign()); shareRows([w]); save(true);') && (shN.match(/syncOwners\(camp\); shareRows\(toks\); save\(true\);/g) || []).length === 2 && wbN.includes('window.wpRowNameOf = rowNameOf;'));
}
{ const { pathToFileURL } = require('url'); pendingChecks.push((async () => {
    {   // 1.6.0 Who holds whom: net.js's holds slice run for real with the real core: the records, the effects, the keep, a squeeze, the move gates and what ends them
        const J = JSON.stringify, src = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'net.js'), 'utf8').replace(/\r\n/g, '\n'), hsS = between('// [netcheck:holds-start]', '// [netcheck:holds-end]', 'holds', 'netfight.js');
        const pool = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'systemcore.js'), 'utf8').length;
        const mk = async (rules, mode) => {
            const Sh = await import(pathToFileURL(path.join(__dirname, '..', 'system', 'app', 'scripts', 'systemcore.js')).href), Fh = await import(pathToFileURL(path.join(__dirname, '..', 'system', 'app', 'scripts', 'formula.js')).href), Dh = await import(pathToFileURL(path.join(__dirname, '..', 'system', 'app', 'scripts', 'dicecore.js')).href);
            const sys = Sh.cleanSystem({ fields: [{ id: 'f_hp', key: 'HP', kind: 'number', vis: 'all', edit: 'owner' }, { id: 'f_fx', key: 'Fx', kind: 'effects', vis: 'all', edit: 'owner' }], rolls: [{ id: 'r_take', label: 'Take', formula: '3d6 <= 10' }, { id: 'r_pin', label: 'Pin', formula: '3d6 <= 10' }, { id: 'r_keep', label: 'Keep', formula: '3d6 <= 10' }, { id: 'r_hit', label: 'Hit', formula: '3d6 <= 10' }, { id: 'r_sq', label: 'Squeeze', formula: '1d6', dmg: true }, { id: 'r_free', label: 'Free', formula: '3d6 <= 10' }], items: [], effects: [{ id: 'e_held', name: 'Held', mods: [] }, { id: 'e_pin', name: 'Pinned', mods: [] }],
                combat: { turn: { diag: '' }, holds: Object.assign({ held: 'e_held', pinned: 'e_pin', take: 'r_take', pin: 'r_pin', keep: 'r_keep', also: ['r_hit'], squeeze: 'r_sq', free: 'r_free', drag: 1, ends: 'HP < 0' }, rules || {}) } }, { F: Fh, gmView: true });
            const toks = [['t_k', 'c_k', 0], ['t_a', 'c_a', 100], ['t_b', 'c_b', -100], ['t_far', 'c_far', 900]].map(([id, cid, x]) => ({ id, isChar: true, charId: cid, charName: cid, x, y: 0, ownerId: 'u_' + cid }));
            const chars = {}; ['c_k', 'c_a', 'c_b', 'c_far'].forEach(id => { chars[id] = Sh.cleanChar({ id, name: id, ownerId: 'u_' + id, values: { f_hp: 10 } }, sys); });
            const camp = { id: 'k', system: sys, chars, turnRules: { move: mode || 'refuse' }, items: { m1: { id: 'm1', type: 'map', meta: {}, whiteboard: toks } } }, c = { id: 'f1', mapId: 'm1', round: 1, turn: 0, rows: toks.map(t => ({ id: 'r' + t.id, tokId: t.id, name: t.charId })) };
            const log = { notes: [], synced: [], pos: [], rec: [], back: [], toast: [], due: [], over: [], rolled: [] }, net = { role: 'host', combats: { f1: c }, syncCharDelta: (id, v) => { log.synced.push([id, Object.keys(v)]); holdsApi && holdsApi.holdsWatch(id); }, postBlastDue: (ch, att, label, toO, go) => log.due.push([ch.id, att, label, toO, go]), dueOver: a => log.over.push(a), dueRolled: a => log.rolled.push(a) };
            let holdsApi = null;
            const win = { wpFormula: Fh, wpSheets: { charChanged() {} }, wpFog: { moveCells: (m, w, fx, fy, tx, ty) => Math.round(Math.hypot(tx - fx, ty - fy) / 100), arrivalOk: (m, t, fx, fy, x, y) => log.walk ? log.walk(fx, fy, x, y) : true }, wpStepLog: (a, s, f) => log.rec.push(s) };
            const near = (m, a, b) => Math.hypot(a.x - b.x, a.y - b.y) <= 100.5;
            holdsApi = new Function('net', 'window', 'SC', 'own', 'getActiveCampaign', 'fightIds', 'fightsOn', 'fightOfTok', 'orderById', 'turnCombatOf', 'moveMode', 'snapBack', 'turnNote', 'noteOwner', 'toast', 'allyNear', 'fightNum', 'attemptRec', hsS + '\nreturn { holdRefQ, holdsRolled, holdsSqueeze, holdsBar, holdsTurnEnd, holdsWatch, holdsGone, holdsPrune, holdMoveCheck, holdMoveWhy, holdsMoved, holdsRead, holdPut, holdsOf };')(
                net, win, () => Sh, (o, k) => Object.prototype.hasOwnProperty.call(o, k), () => camp, () => Object.keys(net.combats), m => Object.keys(net.combats).filter(k => net.combats[k].mapId === m), (m, t) => Object.keys(net.combats).filter(k => net.combats[k].rows.some(r => r.tokId === t))[0] || null, id => net.combats[id] || null, (cp, m, w) => { const f = Object.keys(net.combats).find(k => net.combats[k].rows.some(r => r.tokId === w.id)); return f ? net.combats[f] : null; },
                () => mode || 'refuse', (cp, map, w, msg, to) => { log.back.push(w.id); log.pos.push([w.id, to.x, to.y]); w.x = to.x; w.y = to.y; }, (cn, t) => log.notes.push(t), (pid, t, cid) => log.notes.push(cid + ':' + t), t => log.toast.push(t), near, v => typeof v === 'number' && v >= 0, id => (log.att && log.att[id]) || null);
            const tc = (tid) => ({ range: { tid, mapId: 'm1' } }), fx = id => (chars[id].values.f_fx || []).filter(r => r.on !== false).map(r => r.ref);
            return Object.assign(holdsApi, { camp, c, net, log, chars, tc, fx, toks, Dh, tok: id => toks.find(t => t.id === id) });
        };
        {   // 1.6.2 a grab draws its target in
            const take = (W, by, tid) => W.holdsRolled(W.camp, W.chars[by], null, 'r_take', true, W.tc(tid), null, '');
            const off = await mk(); take(off, 'c_k', 't_far');
            const on = await mk({ drawIn: true }); take(on, 'c_k', 't_far');
            const beside = await mk({ drawIn: true }); take(beside, 'c_k', 't_a');
            const room = await mk({ drawIn: true }); room.log.walk = () => false; take(room, 'c_k', 't_far');
            const walled = await mk({ drawIn: true }), froms = []; walled.log.walk = (fx, fy, x) => { froms.push(fx + ',' + fy); return x < 60; }; take(walled, 'c_k', 't_far');
            const box = await mk({ drawIn: true }); Object.assign(box.tok('t_a'), { w: 60, h: 52 }); take(box, 'c_k', 't_far');
            const hex = await mk({ drawIn: true }); hex.camp.items.m1.meta.gridType = 'hex'; Object.assign(hex.tok('t_a'), { x: 100, y: 0, w: 60, h: 52 }); take(hex, 'c_k', 't_far');
            const cell = await mk({ drawIn: true }); cell.camp.items.m1.meta.gridType = 'hex'; Object.assign(cell.tok('t_a'), { x: 48, y: 0, w: 60, h: 52 }); take(cell, 'c_k', 't_far');
            const gripped = await mk({ drawIn: true }); gripped.c.hl = [{ by: 't_b', on: 't_far', bc: 'c_b', oc: 'c_far', k: 1 }]; take(gripped, 'c_k', 't_far');
            const pinned = await mk({ drawIn: true }); pinned.c.hl = [{ by: 't_k', on: 't_far', bc: 'c_k', oc: 'c_far', k: 1 }]; pinned.holdsRolled(pinned.camp, pinned.chars.c_k, null, 'r_pin', true, pinned.tc('t_far'), null, '');
            check('1.6.2 Who holds whom, A grab draws its target in: off unless the system sets it, the target staying where it stood and held; on, it comes to a free spot beside the holder on the side it came from, a spot the holder could walk to, and is told so',
                off.tok('t_far').x === 900 && off.c.hl.length === 1 && !off.log.back.length && on.tok('t_far').x === 64 && on.tok('t_far').y === 0 && on.c.hl.length === 1 && on.log.notes.includes('c_far:You are held, and drawn in.') && on.log.rec.includes('drawn'), J([off.tok('t_far').x, on.tok('t_far'), on.log.notes, on.log.rec]));
            check('1.6.2 Who holds whom, what draws nobody in: someone already beside the holder, a pin of someone already held, and someone another holder has, each staying put; with no cell the holder could walk to, the token stays where it stood, the hold stands and it is told only that it is held',
                !beside.log.back.length && !pinned.log.back.length && !gripped.log.back.length && gripped.c.hl.length === 2 && room.tok('t_far').x === 900 && room.c.hl.length === 1 && room.log.notes.includes('c_far:You are held.'), J([beside.log.back, pinned.log.back, gripped.log.back, room.tok('t_far')]));
            check('1.6.2 Who holds whom, where it lands: past a wall on the side it came from it takes the next way round, walked from the holder\'s own place; a token there on a map with no grid is judged by its box; on a grid by the cell, so that a hex map\'s neighbor, whose box overlaps, is no bar and a token in that very cell is',
                Math.round(walled.tok('t_far').x) === 55 && Math.round(walled.tok('t_far').y) === 32 && froms[0] === '0,0' && Math.round(box.tok('t_far').x) === 32 && Math.round(box.tok('t_far').y) === 55 && hex.tok('t_far').x === 48 && hex.tok('t_far').y === 0 && Math.round(cell.tok('t_far').x) !== 48, J([walled.tok('t_far'), froms[0], box.tok('t_far'), hex.tok('t_far'), cell.tok('t_far')]));
        }
        {   // the review of backlog 237: a token given its own copy of the sheet it shared (net.holdsRetarget, run for real with the holds slice)
            const copyOf = (W, from, to) => { W.chars[to] = JSON.parse(JSON.stringify(Object.assign({}, W.chars[from], { id: to }))); return W.chars[to]; };
            const R1 = await mk(); R1.holdsRolled(R1.camp, R1.chars.c_k, null, 'r_take', true, R1.tc('t_a'), null, ''); copyOf(R1, 'c_a', 'c_a2'); R1.tok('t_a').charId = 'c_a2';
            const m1 = R1.net.holdsRetarget('t_a', 'c_a', 'c_a2'), oc1 = R1.c.hl[0].oc, fx1 = [R1.fx('c_a'), R1.fx('c_a2')]; R1.holdsGone(R1.camp, R1.c); const fx1e = [R1.fx('c_a'), R1.fx('c_a2')];
            const R2 = await mk(); R2.tok('t_b').charId = 'c_a'; R2.holdsRolled(R2.camp, R2.chars.c_k, null, 'r_take', true, R2.tc('t_a'), null, ''); copyOf(R2, 'c_a', 'c_a3'); R2.tok('t_b').charId = 'c_a3';
            const m2 = R2.net.holdsRetarget('t_b', 'c_a', 'c_a3'), fx2 = [R2.fx('c_a'), R2.fx('c_a3')], oc2 = R2.c.hl[0].oc;
            const R3 = await mk({ holder: 'e_pin', pinned: undefined }); R3.holdsRolled(R3.camp, R3.chars.c_k, null, 'r_take', true, R3.tc('t_a'), null, ''); copyOf(R3, 'c_k', 'c_k2'); R3.tok('t_k').charId = 'c_k2';
            const m3 = R3.net.holdsRetarget('t_k', 'c_k', 'c_k2'), bc3 = R3.c.hl[0].bc, fx3 = [R3.fx('c_k'), R3.fx('c_k2')];
            const R4 = await mk(); copyOf(R4, 'c_a', 'c_a4'); const syncedBefore = R4.log.synced.length, m4 = R4.net.holdsRetarget('t_a', 'c_a', 'c_a4'), m5 = R4.net.holdsRetarget('t_a', 'c_a', 'c_a'), m6 = R4.net.holdsRetarget(5, 'c_a', 'c_a4');
            const R5 = await mk(); R5.holdsRolled(R5.camp, R5.chars.c_k, null, 'r_take', true, R5.tc('t_a'), null, ''); R5.net.role = 'client'; R5.net.active = true; const m7 = R5.net.holdsRetarget('t_a', 'c_a', 'c_a5');
            check('the review of backlog 237: a held guard given its own copy of the sheet moves its hold record to the copy, which then wears Held while the original lets it go, and the hold\'s end takes it off the copy; a guard on the same sheet who is not held takes its copy with no Held while the held one keeps it; a holder\'s record follows its copy, and the holder wears its effect there; nothing named, a client, the same id or a token that is no id moves nothing and syncs nothing',
                m1 === true && oc1 === 'c_a2' && J(fx1) === J([[], ['e_held']]) && J(fx1e) === J([[], []]) && m2 === false && oc2 === 'c_a' && J(fx2) === J([['e_held'], []])
                && m3 === true && bc3 === 'c_k2' && J(fx3) === J([[], ['e_pin']]) && m4 === false && m5 === false && m6 === false && R4.log.synced.length === syncedBefore && m7 === false && R5.c.hl[0].oc === 'c_a' && R1.log.rec.includes('split'),
                J([m1, oc1, fx1, fx1e, m2, fx2, m3, bc3, fx3, m4, m7]));
        }
        const A = await mk();
        A.holdsRolled(A.camp, A.chars.c_k, null, 'r_take', true, A.tc('t_a'), null, ''); A.holdsRolled(A.camp, A.chars.c_b, null, 'r_take', true, A.tc('t_a'), null, ''); A.holdsRolled(A.camp, A.chars.c_k, null, 'r_take', false, A.tc('t_b'), null, '');
        const two = J(A.c.hl.map(x => [x.by, x.on, x.k])), fxTwo = A.fx('c_a'), sent = J(Object.keys(A.c).sort());
        A.holdsRolled(A.camp, A.chars.c_k, null, 'r_pin', true, A.tc('t_a'), null, ''); const pinFx = A.fx('c_a'), recPin = A.c.hl[0].pin;
        A.holdsRolled(A.camp, A.chars.c_b, null, 'r_take', true, A.tc('t_a'), null, ''); const noDouble = A.c.hl.length;
        check('1.6.0 Who holds whom, the records: a success takes hold of the roller\'s target and a failure does not; one effect however many hold them, and the pinned effect with a pin; one record a pair',
            two === J([['t_k', 't_a', 1], ['t_b', 't_a', 1]]) && J(fxTwo) === J(['e_held']) && J(pinFx.sort()) === J(['e_held', 'e_pin']) && recPin === 1 && noDouble === 2, J([two, fxTwo, pinFx, A.log]));
        const Hw = await mk({ pinned: undefined, holder: 'e_pin' }), hRules = Hw.camp.system.combat.holds.holder; Hw.holdsRolled(Hw.camp, Hw.chars.c_k, null, 'r_take', true, Hw.tc('t_a'), null, ''); const hOne = Hw.fx('c_k'), hHeld = Hw.fx('c_a'); Hw.holdsRolled(Hw.camp, Hw.chars.c_k, null, 'r_take', true, Hw.tc('t_b'), null, ''); const hTwo = Hw.fx('c_k'); Hw.holdsGone(Hw.camp, Hw.c); const hEnd = [Hw.fx('c_k'), Hw.fx('c_a'), Hw.fx('c_b')];
        const Hn = await mk(); Hn.holdsRolled(Hn.camp, Hn.chars.c_k, null, 'r_take', true, Hn.tc('t_a'), null, ''); const hNone = Hn.fx('c_k');
        check('1.6.0 Who holds whom, The holder wears: the effect on whoever holds anyone, once however many they hold, off with the last hold; the held wear their own as before; with none named a holder wears nothing',
            hRules === 'e_pin' && J(hOne) === J(['e_pin']) && J(hHeld) === J(['e_held']) && J(hTwo) === J(['e_pin']) && J(hEnd) === J([[], [], []]) && J(hNone) === J([]), J([hRules, hOne, hHeld, hTwo, hEnd, hNone]));
        // A hand test's question: a players' view drops a roll that reads a GM-only stat, so a list's roll stands lower there than on the GM's list, where a hold counts it
        const Hq = await mk(), cq = { system: { fields: [{ id: 'f_g', kind: 'item-list', list: { rolls: [{ label: 'Sell', formula: '1d6' }, { label: 'Grip', formula: '3d6' }, { label: 'Grip', formula: '3d6' }, { label: 'Shove', apply: [{ f: 'f_x' }] }] } }] } }, rq = (i, act) => Hq.holdRefQ(cq, { row: { f: 'f_g', r: 'w', i } }, act), netSrc = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'net.js'), 'utf8');
        check('1.6.0 a hold reads a player\'s list roll by its place on the GM\'s list (holdRefQ): a roll their view lists lower found where the GM\'s list has it, the one of two alike at or past that place, an action by its name, a press of a system roll, and a roll the GM\'s list does not hold left as named; the host\'s four places ask it, and the GM\'s own press is by the GM\'s list already',
            rq(0, { label: 'Grip', formula: '3d6' }) === 'f_g#1' && rq(2, { label: 'Grip', formula: '3d6' }) === 'f_g#2' && rq(2, { label: 'Shove' }) === 'f_g#3' && rq(1, { label: 'Gone', formula: '1' }) === 'f_g#1' && Hq.holdRefQ(cq, { act: 'r_x' }, { label: 'X' }) === 'r_x'
            && (netSrc.match(/holdRefQ\(camp[AQ], q/g) || []).length >= 3 && !/S[aQ]\.holdRefOf\(q/.test(netSrc.replace(/typeof S[aQ]\.holdRefOf/g, '')), JSON.stringify([rq(0, { label: 'Grip', formula: '3d6' }), rq(2, { label: 'Shove' })]));
        // Found by the core session reading the code: a grab that was dodged held all the same. A take or a pin its target may resist waits for that roll, as a break free does
        const Hr = await mk(), rWait = (id) => { Hr.log.att = Hr.log.att || {}; Hr.log.att[id] = {}; return Hr.log.att[id]; }, aOne = rWait('a_1'); Hr.holdsRolled(Hr.camp, Hr.chars.c_k, null, 'r_take', true, Hr.tc('t_a'), null, 'a_1'); const waitN = (Hr.c.hl || []).length, waitFx = Hr.fx('c_a');
        Hr.holdsRolled(Hr.camp, Hr.chars.c_a, null, '', true, null, aOne, ''); const dodged = (Hr.c.hl || []).length, dodgedFx = Hr.fx('c_a');
        const aTwo = rWait('a_2'); Hr.holdsRolled(Hr.camp, Hr.chars.c_k, null, 'r_take', true, Hr.tc('t_a'), null, 'a_2'); Hr.holdsRolled(Hr.camp, Hr.chars.c_a, null, '', false, null, aTwo, ''); const landed = (Hr.c.hl || []).length, landedFx = Hr.fx('c_a');
        const aThree = rWait('a_3'); Hr.holdsRolled(Hr.camp, Hr.chars.c_k, null, 'r_pin', true, Hr.tc('t_a'), null, 'a_3'); const pinWait = Hr.c.hl[0].pin; Hr.holdsRolled(Hr.camp, Hr.chars.c_a, null, '', false, null, aThree, ''); const pinLanded = Hr.c.hl[0].pin;
        const Hs = await mk(); Hs.holdsRolled(Hs.camp, Hs.chars.c_k, null, 'r_take', true, Hs.tc('t_a'), null, ''); const noAttempt = (Hs.c.hl || []).length;
        // The owner, 2026-11-01, by prompt: "Apply now on the card (Recommended)": a hold that waits for a player's roll that never comes
        const Hg = await mk(); Hg.log.att = { a_g: { charId: 'c_a' } }; Hg.holdsRolled(Hg.camp, Hg.chars.c_k, { label: 'Grab {Row.x}' }, 'r_take', true, Hg.tc('t_a'), null, 'a_g'); const gDue = J(Hg.log.due), gWait = (Hg.c.hl || []).length, gOk = Hg.net.holdGo('a_g'), gHeld = (Hg.c.hl || []).length, gFx = Hg.fx('c_a'), gOver = J(Hg.log.over);
        delete Hg.log.att.a_g; const gLate = Hg.net.holdGo('a_g'), gSaid = Hg.log.toast.slice(-1)[0], gStill = (Hg.c.hl || []).length;
        const HgN = await mk(); HgN.chars.c_a.npc = true; HgN.log.att = { a_n: { charId: 'c_a' } }; HgN.holdsRolled(HgN.camp, HgN.chars.c_k, { label: 'Grab' }, 'r_take', true, HgN.tc('t_a'), null, 'a_n'); const nDue = HgN.log.due.length;
        const Hq2 = await mk(), aQ = { charId: 'c_a' }; Hq2.log.att = { a_q: aQ, a_r: { charId: 'c_a' }, a_s: { charId: 'c_a' } }; Hq2.holdsRolled(Hq2.camp, Hq2.chars.c_k, { label: 'Grab' }, 'r_take', true, Hq2.tc('t_a'), null, 'a_q'); Hq2.holdsRolled(Hq2.camp, Hq2.chars.c_a, null, '', true, null, aQ, ''); const qRolled = J(Hq2.log.rolled), qDue = Hq2.log.due.length;
        Hq2.holdsRolled(Hq2.camp, Hq2.chars.c_k, { label: 'Pin' }, 'r_pin', true, Hq2.tc('t_a'), null, 'a_r'); const pinNone = Hq2.log.due.length;
        Hq2.holdsRolled(Hq2.camp, Hq2.chars.c_k, null, 'r_take', true, Hq2.tc('t_a'), null, ''); Hq2.holdsRolled(Hq2.camp, Hq2.chars.c_k, { label: 'Pin' }, 'r_pin', true, Hq2.tc('t_a'), null, 'a_s'); const pinHeld = Hq2.log.due.length;
        check('1.6.0 the GM\'s Apply now turns over as the target\'s roll lands, whichever way it goes, and a Pin with nobody held offers none, since it has nothing to land; one on a hold does', qRolled === J(['a_q']) && qDue === 1 && pinNone === 1 && pinHeld === 2, J([qRolled, qDue, pinNone, pinHeld]));
        const Hp = await mk(); Hp.net.role = 'client'; Hp.log.att = { a_p: { charId: 'c_a', ht: { m: 'm1', c: 'c_k', on: 't_a' } } }; const pGo = Hp.net.holdGo('a_p'), pHeld = (Hp.c.hl || []).length;
        check('1.6.0 a hold that waits for a player\'s roll gives the GM a card, Apply now: it names the hold and its target and goes to the GM alone, nothing is held until it is pressed, the press lands the hold and its effect and closes the player\'s card, a press once their roll is in lands nothing and says so, an NPC target\'s card is the GM\'s already, and a player\'s app lands nothing',
            gDue === J([['c_a', 'a_g', 'Grab on c_a', false, 'hold']]) && gWait === 0 && gOk === true && gHeld === 1 && J(gFx) === J(['e_held']) && gOver === J(['a_g']) && gLate === false && /roll is in already/.test(gSaid) && gStill === 1 && nDue === 0 && pGo === false && pHeld === 0, J([gDue, gWait, gOk, gHeld, gFx, gOver, gLate, gSaid, nDue, pGo, pHeld]));
        const HgW = await mk(); HgW.chars.c_k.values.f_hp = -1; HgW.holdsRolled(HgW.camp, HgW.chars.c_k, null, 'r_take', true, HgW.tc('t_a'), null, ''); const wGone = (Hw.c.hl || []).length, wFx = Hw.fx('c_a');
        check('1.6.0 a hold taken while All holds end where is true ends at once, with its effect, where before it stood until that character next changed (read in the code by the hand test)', wGone === 0 && J(wFx) === J([]), J([wGone, wFx]));
        const dsS = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'dice.js'), 'utf8');
        check('1.6.0 the Apply now card: its words and its press are the hold\'s own, a player\'s resist card says the GM applied it, and a Full auto card whose blast waits for Defense rolls says so', dsS.includes("rec.hold === 1 ? 'waiting for their roll'") && dsS.includes("m.rolled ? 'Their roll is in.' : 'Applied.'") && src.includes('net.dueRolled = function(att)') && dsS.includes("window.wpNet.holdGo(rec.att)") && dsS.includes("rec.why === 'resist' ? 'The GM applied it, so this roll is over.'") && dsS.includes("rec.dmgWait === 1 ? 'Applied once the Defense rolls are in' : 'Applied'") && src.includes('if (o.usedWait === true) rec.dmgWait = 1;'));
        check('1.6.0 a take or a pin its target may resist waits for that roll (the core session, reading the code: a dodged grab held all the same): nothing held and no effect while the attempt is open, nothing once the target succeeds, the hold and the effect once they fail, a pin alike, and a take with no attempt to answer holds at once as before',
            waitN === 0 && J(waitFx) === J([]) && dodged === 0 && J(dodgedFx) === J([]) && landed === 1 && J(landedFx) === J(['e_held']) && !pinWait && pinLanded === 1 && noAttempt === 1, J([waitN, dodged, landed, landedFx, pinWait, pinLanded, noAttempt]));
        const B = await mk(); B.holdsRolled(B.camp, B.chars.c_k, null, 'r_take', true, B.tc('t_a'), null, ''); B.holdsRolled(B.camp, B.chars.c_k, null, 'r_take', true, B.tc('t_b'), null, '');
        B.c.round = 2; B.holdsRolled(B.camp, B.chars.c_k, null, 'r_keep', true, null, null, ''); B.holdsTurnEnd('m1', B.c, B.c.rows[0], 2); const kept = B.c.hl.length;
        B.c.round = 3; B.holdsRolled(B.camp, B.chars.c_k, null, 'r_hit', false, B.tc('t_a'), null, ''); B.holdsTurnEnd('m1', B.c, B.c.rows[0], 3); const hitKept = B.c.hl.length;
        B.c.round = 4; B.holdsRolled(B.camp, B.chars.c_k, null, 'r_hit', true, B.tc('t_far'), null, ''); B.holdsTurnEnd('m1', B.c, B.c.rows[0], 4); const gone = B.c.hl, fxFree = B.fx('c_a');
        const C = await mk({ keep: undefined }); C.holdsRolled(C.camp, C.chars.c_k, null, 'r_take', true, C.tc('t_a'), null, ''); C.c.round = 5; C.holdsTurnEnd('m1', C.c, C.c.rows[0], 5);
        check('1.6.0 Who holds whom, the keep: one keep at the holder\'s turn keeps all their holds, an attack on someone held keeps them hit or miss, an attack on another does not and with none every hold ends at the turn\'s end, its effect off; a system that names no keep asks none',
            kept === 2 && hitKept === 2 && gone === undefined && J(fxFree) === J([]) && C.c.hl.length === 1, J([kept, hitKept, gone, fxFree, C.c.hl]));
        const D = await mk(); D.holdsRolled(D.camp, D.chars.c_k, null, 'r_take', true, D.tc('t_a'), null, ''); D.holdsRolled(D.camp, D.chars.c_k, null, 'r_take', true, D.tc('t_b'), null, '');
        const rec = { dmg: 1, id: 'x1', rid: 'q9', label: 'Squeeze', t: 5 }, extra = D.holdsSqueeze(D.camp, D.chars.c_k, 'r_sq', rec, D.Dh), bar0 = D.holdsBar(D.camp, D.chars.c_a, 'r_sq'), bar1 = D.holdsBar(D.camp, D.chars.c_k, 'r_sq'), bar2 = D.holdsBar(D.camp, D.chars.c_k, 'r_free'), bar3 = D.holdsBar(D.camp, D.chars.c_a, 'r_free');
        D.c.round = 2; D.holdsRolled(D.camp, D.chars.c_k, null, 'r_sq', null, null, null, ''); D.holdsTurnEnd('m1', D.c, D.c.rows[0], 2);
        D.chars.c_k.values.f_hp = -1; D.net.syncCharDelta('c_k', { f_hp: -1 }); const lost = D.c.hl, afterLost = [D.fx('c_a'), D.fx('c_b')];
        check('1.6.0 Who holds whom, a squeeze and a lost action: the blow lands on each held character, the first on the roll\'s own card and a copy for the rest, the card naming no attack, and it keeps the holds; a roll that needs holds is refused in words; the ends formula read as any change moves the holder ends all their holds at once, each effect off',
            rec.dmgOn === 'c_a' && extra.length === 1 && extra[0].dmgOn === 'c_b' && extra[0].rid === undefined && extra[0].id !== rec.id && /c_a$/.test(rec.label) && /c_b$/.test(extra[0].label) && bar0 === 'You hold nobody.' && bar1 === '' && bar2 === 'Nobody holds you.' && bar3 === '' && lost === undefined && J(afterLost) === J([[], []]), J([rec, extra, bar0, bar1, bar2, bar3, lost, afterLost]));
        const E = await mk(); E.holdsRolled(E.camp, E.chars.c_k, null, 'r_take', true, E.tc('t_a'), null, '');
        const wa = E.tok('t_a'), bad = E.holdMoveCheck(E.camp, E.camp.items.m1, wa, { x: 100, y: 0 }, { itemId: 'm1', x: 400, y: 0, final: true }, {}), midDrag = E.holdMoveCheck(E.camp, E.camp.items.m1, wa, { x: 100, y: 0 }, { itemId: 'm1', x: 400, y: 0 }, {}), staying = E.holdMoveCheck(E.camp, E.camp.items.m1, wa, { x: 100, y: 0 }, { itemId: 'm1', x: 0, y: 100, final: true }, {}), noted = E.log.notes.filter(n => /goes back/.test(n)), turned = E.holdMoveWhy(E.camp, E.camp.items.m1, 'm1', wa, 100, 0, 100, 0);
        E.holdsRolled(E.camp, E.chars.c_k, null, 'r_pin', true, E.tc('t_a'), null, ''); const pinned = E.holdMoveWhy(E.camp, E.camp.items.m1, 'm1', wa, 100, 0, 0, 100), freeTok = E.holdMoveWhy(E.camp, E.camp.items.m1, 'm1', E.tok('t_far'), 900, 0, 1500, 0);
        const Ew = await mk(null, 'warn'); Ew.holdsRolled(Ew.camp, Ew.chars.c_k, null, 'r_take', true, Ew.tc('t_a'), null, ''); const warn = Ew.holdMoveCheck(Ew.camp, Ew.camp.items.m1, Ew.tok('t_a'), { x: 100, y: 0 }, { itemId: 'm1', x: 400, y: 0, final: true }, {}), Eo = await mk(null, 'off'); Eo.holdsRolled(Eo.camp, Eo.chars.c_k, null, 'r_take', true, Eo.tc('t_a'), null, ''); const off = Eo.holdMoveCheck(Eo.camp, Eo.camp.items.m1, Eo.tok('t_a'), { x: 100, y: 0 }, { itemId: 'm1', x: 400, y: 0, final: true }, {});
        check('1.6.0 Who holds whom, the move gates through the fight\'s move mode: Refuse puts a held token back in words and stops a drag mid-way, a move that stays by the holder goes, a turn in place is no move, a pinned token has no move at all, a token nobody holds is free; Warn lets it go and says so; Off says nothing',
            bad === 'stop' && midDrag === 'stop' && staying === '' && noted.length === 1 && J(E.log.back) === J(['t_a']) && turned === '' && /pinned/.test(pinned) && freeTok === '' && warn === '' && Ew.log.notes.includes('You moved while held.') && off === '' && !Eo.log.notes.includes('You moved while held.'), J([bad, midDrag, staying, noted, turned, pinned, freeTok, warn, off]));
        const G = await mk(); G.holdsRolled(G.camp, G.chars.c_k, null, 'r_take', true, G.tc('t_a'), null, ''); const wk = G.tok('t_k'), mapG = G.camp.items.m1;
        wk.x = -100; G.holdsMoved(G.camp, mapG, 'm1', wk, { x: 0, y: 0 }); const dragged = [G.tok('t_a').x, G.c.hl.length, J(G.log.pos)];
        wk.x = -200; G.holdsMoved(G.camp, mapG, 'm1', wk, { x: -100, y: 0 }); const second = [G.tok('t_a').x, (G.c.hl || []).length];
        const G2 = await mk(); G2.holdsRolled(G2.camp, G2.chars.c_k, null, 'r_take', true, G2.tc('t_a'), null, ''); const wk2 = G2.tok('t_k'); wk2.x = -500; G2.holdsMoved(G2.camp, G2.camp.items.m1, 'm1', wk2, { x: 0, y: 0 }); const walked = [G2.tok('t_a').x, G2.c.hl];
        const G3 = await mk({ drag: undefined }); G3.holdsRolled(G3.camp, G3.chars.c_k, null, 'r_take', true, G3.tc('t_a'), null, ''); const wk3 = G3.tok('t_k'); wk3.x = -100; G3.holdsMoved(G3.camp, G3.camp.items.m1, 'm1', wk3, { x: 0, y: 0 }); const noDrag = [G3.tok('t_a').x, G3.c.hl];
        const G4 = await mk(); G4.holdsRolled(G4.camp, G4.chars.c_k, null, 'r_take', true, G4.tc('t_a'), null, ''); const wa4 = G4.tok('t_a'); wa4.x = 900; G4.holdsMoved(G4.camp, G4.camp.items.m1, 'm1', wa4, { x: 100, y: 0 }); const parted = G4.c.hl;
        check('1.6.0 Who holds whom, a holder\'s move: within its drag a turn what it holds goes along for everyone, past that it lets go; a walk further at once lets go and leaves them where they stand; with no drag named walking off lets go; a held token moved off by the GM\'s hand is free',
            dragged[0] === 0 && dragged[1] === 1 && dragged[2] === J([['t_a', 0, 0]]) && second[0] === 0 && second[1] === 0 && walked[0] === 100 && walked[1] === undefined && noDrag[0] === 100 && noDrag[1] === undefined && parted === undefined, J([dragged, second, walked, noDrag, parted]));
        const H = await mk(), attR = {}; H.holdsRolled(H.camp, H.chars.c_k, null, 'r_take', true, H.tc('t_a'), null, ''); H.holdsRolled(H.camp, H.chars.c_b, null, 'r_take', true, H.tc('t_a'), null, '');
        H.holdsRolled(H.camp, H.chars.c_a, null, 'r_free', true, null, null, ''); const askWhich = H.log.notes.filter(n => /Point at/.test(n)).length, stillTwo = H.c.hl.length;
        H.holdsRolled(H.camp, H.chars.c_a, null, 'r_free', true, H.tc('t_b'), null, ''); const oneLeft = J(H.c.hl.map(x => x.by)), fxOn = H.fx('c_a');
        H.holdsRolled(H.camp, H.chars.c_a, null, 'r_free', false, H.tc('t_k'), null, ''); const failed = H.c.hl.length; H.holdsRolled(H.camp, H.chars.c_a, { resistBy: 'r_x' }, 'r_free', true, H.tc('t_k'), null, ''); const waits = H.c.hl.length;
        const was = { hf: { f: 'f1', by: 't_k', on: 't_a' } }; H.holdsRolled(H.camp, H.chars.c_k, null, 'r_x', true, null, was, ''); const heldOn = H.c.hl.length; H.holdsRolled(H.camp, H.chars.c_k, null, 'r_x', false, null, was, ''); const brokeOut = H.c.hl, fxOff = H.fx('c_a');
        check('1.6.0 Who holds whom, breaking free: each hold takes its own roll, aimed at the holder where there are two, and the effect stays while anyone holds them; a failure ends nothing; a roll that is resisted waits for that roll, which ends the hold when the holder fails it and not when the holder passes',
            askWhich === 1 && stillTwo === 2 && oneLeft === J(['t_k']) && J(fxOn) === J(['e_held']) && failed === 1 && waits === 1 && heldOn === 1 && brokeOut === undefined && J(fxOff) === J([]), J([askWhich, stillTwo, oneLeft, fxOn, failed, waits, heldOn, brokeOut, fxOff]));
        const I = await mk(); I.holdsRolled(I.camp, I.chars.c_k, null, 'r_take', true, I.tc('t_a'), null, ''); I.holdsRolled(I.camp, I.chars.c_b, null, 'r_take', true, I.tc('t_far'), null, ''); I.camp.items.m1.whiteboard = I.camp.items.m1.whiteboard.filter(t => t.id !== 't_far'); I.holdsPrune(I.camp, I.c); const afterTok = J(I.c.hl.map(x => x.on));
        I.c.rows = I.c.rows.filter(r => r.tokId !== 't_a'); I.holdsPrune(I.camp, I.c); const afterRow = I.c.hl, I2 = await mk(); I2.holdsRolled(I2.camp, I2.chars.c_k, null, 'r_take', true, I2.tc('t_a'), null, ''); I2.holdsGone(I2.camp, I2.c);
        const rd = I.holdsRead([{ by: 't_k', on: 't_a', bc: 'c_k', oc: 'c_a', k: 2, pin: 1, evil: 1 }, { by: 't_k', on: 't_gone', bc: 'c_k', oc: 'c_a', k: 2 }, { by: '<b>', on: 't_a', bc: 'c_k', oc: 'c_a', k: 1 }, { by: 't_k', on: 't_a', bc: 'x', oc: 'c_a', k: 1 }, null, 5], [{ tokId: 't_k' }, { tokId: 't_a' }]);
        const out = src.slice(src.indexOf('function combatsFor('), src.indexOf('function combatsTo('));
        check('1.6.0 Who holds whom, what ends them and where they live: a token gone from the map or the fight takes its records, the fight\'s end takes them all and the effect with them; the save\'s copy is cleaned by whitelist against the order; a fight\'s records are kept through a roster edit and read by no message: combatsFor names what it sends',
            afterTok === J(['t_a']) && afterRow === undefined && I2.c.hl === undefined && J(I2.fx('c_a')) === J([]) && J(rd) === J([{ by: 't_k', on: 't_a', bc: 'c_k', oc: 'c_a', k: 2, pin: 1 }]) && !/\bhl\b/.test(out) && src.includes('if (Array.isArray(had.hl)) f.hl = had.hl;') && pool > 0, J([afterTok, afterRow, rd, I2.c.hl, I2.fx('c_a'), /\bhl\b/.test(out), src.includes('if (Array.isArray(had.hl)) f.hl = had.hl;')]));
        check('1.6.0 Who holds whom, the wiring: the pos gate and the map copy both ask it, the roll\'s branch, the GM\'s own roll and an action\'s press report to it, turnEnded and the fight\'s end call it, and the GM\'s drop',
            src.includes("if (typeof holdMoveCheck === 'function' && holdMoveCheck(camp, map, w, frW, msg, conn) === 'stop') return;") && src.includes("var hwR = holdMoveWhy(camp, map, mapId, w, fx, fy, tx, ty); if (hwR) return hwR;") && src.includes('holdsRolled(campQ, chQ, actQ, holdRefQ(campQ, q, actQ), pcQ, tcQ, blowRecQ, atQ);') && src.includes('holdsRolled(campA, chA, actA, holdRefQ(campA, qa, actA), null, tcA, null, \'\');') && src.includes("if (typeof holdsTurnEnd === 'function') holdsTurnEnd(mapId, c, row, round);") && src.includes("holdsGone(campO, had);")
            && fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'datamap.js'), 'utf8').includes('window.wpNet.holdsMoved(am, item,'));
    }
})()); }



// 1.6.0 A hold names what sets it off (combat.turn.holdNames, holdLost): the host's fight, run for real on a world of plain objects (invented data: Kael, Sela, Orc, Pebbles)
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx3 = await import(url('formula.js'));
    const line3 = k => { const i = src.indexOf(k); return src.slice(i, src.indexOf('\n', i)); };
    const help3 = ['function own(', 'function peerProfileId(', 'function fxLib(', 'function itemLib(', 'function moveMode('].map(line3).join('\n') + '\n';
    const cb3 = between('// [netcheck:combats-start]', '// [netcheck:combats-end]', 'combats'), set3 = fnSrc('function combatRefresh() {', '\nnet.combatStep = function', 'combatSet'), ta3 = between('// [netcheck:turnacts-start]', '// [netcheck:turnacts-end]', 'turnacts'), hm3 = between('// [netcheck:turnholdmsg-start]', '// [netcheck:turnholdmsg-end]', 'turnholdmsg'), of3 = src.slice(src.indexOf('// [netcheck:offturn-start]'), src.indexOf('// [netcheck:offturn-end]'));
    const fog3 = fnSrc('function fogDrop(', '\nfunction fogFilterClean(', 'fogDrop', 'netfog.js') + fnSrc('function anyFog(camp) {', '\n// Everything a player receives', 'anyFog', 'netfog.js');
    const sysH = o => Sx.cleanSystem({ v: 1, name: 'H', sheet: { sections: [] }, fields: [{ id: 'f_dz', key: 'Dazed', kind: 'number', vis: 'all', def: 0 }, { id: 'f_gm', key: 'Grudge', kind: 'number', vis: 'gm', def: 1 }], rolls: [{ id: 'r_sh', label: 'Shoot', formula: '3d6 <= 13', vis: 'all' }, { id: 'r_gm', label: 'Secret', formula: '3d6', vis: 'gm' }],
        combat: { turn: Object.assign({ holdNames: true, holdLost: 'Dazed > 0', off: 'refuse', acts: [{ key: 'Action', n: 1, nf: '1 - Dazed' }] }, o || {}) } }, { F: Fx3, gmView: true });
    const mkH = o => {
        o = o || {};
        const camp = { id: 'k', activeItemId: 'm1', system: o.system || sysH(), turnRules: {}, chars: { c_a: { id: 'c_a', name: 'Kael', ownerId: 'u_a', values: {} }, c_b: { id: 'c_b', name: 'Sela', ownerId: 'u_b', values: {} }, c_o: { id: 'c_o', name: 'Orc', npc: true, values: {} } },
            items: { m1: { type: 'map', meta: { title: 'Keep' }, fog: { on: false }, whiteboard: [{ id: 't_a', isChar: true, charId: 'c_a', ownerId: 'u_a', x: 0, y: 0 }, { id: 't_b', isChar: true, charId: 'c_b', ownerId: 'u_b', x: 50, y: 0 }, { id: 't_o', isChar: true, charId: 'c_o', x: 100, y: 0 }] } } };
        const out = { toasts: [], cards: [], names: [], posts: [], events: [], steps: [], sent: {} }, mk = p => ({ peer: p, open: true, send: m => { packCheck(m); (out.sent[p] = out.sent[p] || []).push(JSON.parse(JSON.stringify(m))); } }), cA = mk('pA'), cB = mk('pB');
        const fight = { id: 'f_keep0001', mapId: 'm1', round: 1, turn: 0, rows: [{ id: 'r_a', name: 'Kael', tokId: 't_a' }, { id: 'r_b', name: 'Sela', tokId: 't_b' }, { id: 'r_o', name: 'Orc', tokId: 't_o' }] };
        const net = { active: true, role: 'host', paused: false, conns: [cA, cB], roster: { pA: { id: 'u_a', location: 'm1' }, pB: { id: 'u_b', location: 'm1' } }, combats: { f_keep0001: fight }, damageCard: (ch, lines, nm) => { out.names.push(nm); out.cards.push([ch.id, lines.join(' ')]); } };
        if (o.tokName) net.tokNameOf = (ch, mapId, tokId) => o.tokName + ' ' + ch.id + ' ' + mapId + ' ' + tokId;   // 1.6.3 (the release click test): the token's name, as the strip says it
        const win = { wpFog: { fogDropIds: () => null }, wpVtt: { on: () => true, rulesOn: () => true }, wpFormula: Fx3, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx3, gmView: false }) }, wpStepLog: (w, s) => out.steps.push(w + ':' + s) };
        const api = new Function('net', 'getActiveCampaign', 'window', 'broadcast', 'sendFailed', 'logEvent', 'toast', 'render', 'renderNotepad', 'SC', 'callPost', 'turnMoveStart', 'turnFxStart', 'peerPaused', 'allow', 'mapTitleOf', 'bellOut', 'applyPosToDom', 'broadcastPos', 'turnNote',
            help3 + fog3 + '\n' + cb3 + '\n' + set3 + '\n' + ordersSrc + '\n' + ta3 + '\n' + of3 + '\nreturn { combatsFor, cleanFights, actsMaxOf, offTurnOf, msg: function(msg, conn) {\n' + hm3 + '\n} };')(
            net, () => camp, win, () => {}, e => { throw e; }, (a, s) => out.events.push(s), t => out.toasts.push(t), () => {}, () => {}, () => Sx, (cp, roll, ch, by, priv) => { out.posts.push([roll, ch.id, by, priv]); return o.posted !== false; }, () => {}, () => {}, () => false, () => true, () => 'Keep', () => {}, () => {}, () => {}, () => {});
        return { camp, net, fight, out, api, cA, cB, row: id => fight.rows.find(r => r.id === id), step: d => net.fightStep('f_keep0001', d === undefined ? 1 : d), hold: hf => net.fightHold('f_keep0001', undefined, hf), off: id => net.fightSetOff('f_keep0001', id) };
    };
    const a = mkH(), a0 = a.hold(undefined), a1 = a.hold({ text: '   ' }), aTurn = a.fight.turn, a2 = a.hold({ text: 'Whoever comes\nthrough the door', roll: 'r_sh' });
    check('1.6.0 a named hold: with nothing named it is refused and play stays; named it holds, cleaned to one line with its roll, and play moves on',
        a0 === false && a1 === false && aTurn === 0 && a2 === true && a.row('r_a').held === 1 && j(a.row('r_a').holdFor) === j({ text: 'Whoever comes through the door', roll: 'r_sh' }) && a.fight.turn === 1, j(a.row('r_a')));
    const seen = who => a.api.combatsFor(who, 'm1').f_keep0001.rows[0], copyA = seen('u_a'), copyB = seen('u_b'), kept = a.api.cleanFights({ f_keep0001: { mapId: 'm1', round: 1, turn: 0, rows: [{ id: 'r', name: 'A', held: 1, hf: 'one\ntwo' + 'x'.repeat(200), sf: 1, holdFor: { text: 'x' } }, { id: 'r2', name: 'B', hf: 7 }] } }).f_keep0001.rows;
    check('1.6.0 a named hold: what sets it off reaches its holder\'s own copy alone, held shows to everyone, the record travels to no one, and a player\'s app keeps a line of text',
        copyA.held === 1 && copyA.hf === 'Whoever comes through the door' && copyB.held === 1 && !('hf' in copyB) && !('holdFor' in copyA) && !('holdFor' in copyB) && !/r_sh/.test(j(a.api.combatsFor('u_b', 'm1'))) && !/r_sh/.test(j(copyA)) && kept[0].hf.length === 120 && !/\n/.test(kept[0].hf) && !('holdFor' in kept[0]) && kept[0].sf === 1 && !('hf' in kept[1]), j([copyA, copyB, kept]));
    a.step(); a.step();
    check('1.6.0 a named hold lasts to its row\'s next turn: at that turn it clears, a card says the action was lost, and the turn plays as normal', a.row('r_a').held === undefined && a.row('r_a').holdFor === undefined && a.fight.round === 2 && a.fight.turn === 0 && j(a.out.cards) === j([['c_a', 'Nothing set off the hold, so that action was lost.']]), j([a.fight, a.out.cards]));
    const b = mkH({ system: sysH({ holdLost: undefined }) }); b.step(); b.step(); b.hold({ text: 'A foe in sight' }); const bCross = b.row('r_o').held === 1 && b.fight.round === 2 && b.fight.turn === 0, bCard0 = b.out.cards.length; b.step(); b.step(); const bClear = b.row('r_o').held, bHf = b.row('r_o').holdFor;
    check('1.6.0 a named hold on a round\'s last turn is not lost at once: it lasts over the round\'s end to its row\'s next turn, where it clears, with a card to the GM and its player that the action was lost',
        bCross && bCard0 === 0 && bClear === undefined && bHf === undefined && j(b.out.cards) === j([['c_o', 'Nothing set off the hold, so that action was lost.']]) && b.out.steps.includes('hold v1:lapsed'), j([bCross, b.out.cards, b.row('r_o')]));
    const bN = mkH({ system: sysH({ holdLost: undefined }), tokName: 'Spacer' }); bN.step(); bN.step(); bN.hold({ text: 'A foe in sight' }); bN.step(); bN.step();
    check('1.6.3 (the release click test): the line that a hold lapsed names the row\'s token as the turn strip does (net.tokNameOf with the fight\'s map and the row\'s token), never the sheet\'s name alone; with no such name the row\'s own',
        j(bN.out.names) === j(['Spacer c_o m1 t_o']) && j(b.out.names) === j(['Orc']) && /net\.damageCard = function\(ch, lines, name\) \{/.test(src) && /String\(\(typeof name === 'string' && name\.trim\(\) \? name\.trim\(\) : ''\) \|\| ch\.name \|\| 'A character'\)/.test(src), j([bN.out.names, b.out.names]));
    const c = mkH(); c.step(); c.hold({ text: 'A foe in sight', roll: 'r_sh' }); const cAt = c.fight.turn, cOrder = j(c.fight.rows.map(r => r.id)), cOff = c.off('r_b'), cRow = c.row('r_b');
    check('1.6.0 Set off: the GM\'s press clears the hold, keeps the order and the turn on hand, sends the named roll as a card and says so; the row is marked until the turn moves, and acts off its turn under the system\'s rule',
        cOff === true && cRow.held === undefined && cRow.holdFor === undefined && cRow.sf === 1 && c.fight.turn === cAt && j(c.fight.rows.map(r => r.id)) === cOrder && j(c.out.posts) === j([['r_sh', 'c_b', 'its hold', false]]) && !c.out.cards.length && c.out.toasts.includes('Sela acts before the turn goes on.') && c.api.offTurnOf(c.camp, 'c_b') === '' && c.api.combatsFor('u_a', 'm1').f_keep0001.rows[1].sf === 1, j([cOff, cRow, c.out]));
    c.step(); const cAfter = c.row('r_b').sf, cOffAfter = c.api.offTurnOf(c.camp, 'c_b');
    check('1.6.0 Set off: once the turn moves the row is off its turn again', cAfter === undefined && cOffAfter === 'refuse', j([cAfter, cOffAfter]));
    const d = mkH({ posted: false }); d.step(); d.hold({ text: 'A sound' }); const dOff = d.off('r_b'), d2 = mkH({ posted: false }); d2.step(); d2.hold({ text: 'A sound', roll: 'r_sh' }); d2.off('r_b');
    const e = mkH(), e1 = e.off('r_a'), e2 = e.net.fightSetOff('f_none0000', 'r_a'); e.step(); e.hold({ text: 'x' }); const e3 = e.off('nope'), e4 = e.net.fightAct('f_keep0001', 'r_b'); e.net.role = 'client'; const e5 = e.off('r_b');
    check('1.6.0 Set off: with no roll named, or a roll whose needs do not hold, a card tells them to act now; it needs a row that holds, another fight or row sets nothing off, Act does not fire a named hold, and a player\'s app cannot press it',
        dOff === true && d.out.cards[0][1] === 'The hold was set off: act now, before the turn goes on.' && d2.out.cards.length === 1 && e1 === false && e2 === false && e3 === false && e4 === false && e5 === false && e.row('r_b').held === 1, j([d.out, d2.out, e1, e3, e4, e5]));
    const f = mkH(); f.hold({ text: 'A foe in sight' }); f.camp.chars.c_a.values.f_dz = 1; f.step(); const fGone = f.row('r_a'), fCard = f.out.cards.slice(), fHk = fGone.hk === 1, fMax = f.api.actsMaxOf(f.camp, f.camp.chars.c_a, f.camp.items.m1, f.camp.items.m1.whiteboard[0], f.fight).Action, fPlain = f.api.actsMaxOf(f.camp, f.camp.chars.c_b, f.camp.items.m1, f.camp.items.m1.whiteboard[1], f.fight).Action;
    check('1.6.0 holdLost: as the system\'s formula comes true while a hold stands, the hold goes in the lost action\'s place, said on a card, and that row\'s next turn keeps its own actions though its count reads none',
        fGone.held === undefined && fGone.holdFor === undefined && fHk && j(fCard) === j([['c_a', 'The hold went in place of a lost action. The next action stays.']]) && fMax === 1 && fPlain === 1, j([fGone, fCard, fMax]));
    f.step(); const fTurn = f.fight.turn, fNext = f.api.actsMaxOf(f.camp, f.camp.chars.c_a, f.camp.items.m1, f.camp.items.m1.whiteboard[0], f.fight).Action; f.step(); const fAfter = f.api.actsMaxOf(f.camp, f.camp.chars.c_a, f.camp.items.m1, f.camp.items.m1.whiteboard[0], f.fight).Action, fHkA = f.row('r_a').hk;
    check('1.6.0 holdLost: what the hold kept is that one turn\'s: once the turn ends the count reads as it reads', fTurn === 0 && fNext === 1 && fHkA === undefined && fAfter === 0, j([fTurn, fNext, fAfter, f.row('r_a')]));
    const g = mkH(); g.camp.chars.c_a.values.f_dz = 1; g.hold({ text: 'A foe in sight' }); const gWas = g.row('r_a').holdFor.was; g.step(); const gStays = g.row('r_a').held === 1; delete g.camp.chars.c_a.values.f_dz; g.step(); g.camp.chars.c_a.values.f_dz = 2; g.step(); const gGone = g.row('r_a').held, gCards = g.out.cards.length;
    const h = mkH({ system: sysH({ holdLost: 'Nope + 1' }) }); h.hold({ text: 'x' }); h.camp.chars.c_a.values.f_dz = 1; h.step(); const hHeld = h.row('r_a').held, i = mkH(); i.hold({ text: 'x' }); i.camp.chars.c_a.values.f_dz = 1; const iOff = i.off('r_a'), iRow = i.row('r_a');
    check('1.6.0 holdLost: a formula already true as the row held takes nothing until it has gone false and comes true again; one that cannot be worked out takes nothing; and a Set off with the action lost is the hold going',
        gWas === 1 && gStays && gGone === undefined && gCards === 1 && hHeld === 1 && iOff === true && iRow.held === undefined && iRow.sf === undefined && iRow.hk === 1 && !i.out.posts.length, j([gWas, gStays, gGone, g.out.cards, hHeld, iRow]));
    const k = mkH({ system: sysH({ holdLost: undefined }) }); k.hold({ text: 'x' }); k.step(-1); const kRow = k.row('r_a'), kCards = k.out.cards.length;
    check('1.6.0 a step back onto a held row clears its hold with no card, as a correction runs nothing', kRow.held === undefined && kRow.holdFor === undefined && kCards === 0, j([kRow, k.out]));
    const m = mkH(), rowM = m.row('r_a'), msg = (conn, o2) => m.api.msg(Object.assign({ type: 'turn-hold', mapId: 'm1', row: 'r_a' }, o2), conn);
    msg(m.cA, {}); const m0 = rowM.held; msg(m.cB, { text: 'Not my row' }); const m1 = rowM.held; msg(m.cA, { text: 'A <b>foe</b>\u0007 at the gate', roll: 'r_gm', kind: 'x' }); const m2 = j(rowM.holdFor);
    const n = mkH(), msgN = (conn, o2) => n.api.msg(Object.assign({ type: 'turn-hold', mapId: 'm1', row: 'r_a' }, o2), conn); msgN(n.cA, { text: 'y'.repeat(500), roll: 'r_sh' }); const n1 = n.row('r_a').holdFor;
    check('1.6.0 a named hold, the turn-hold branch (the host, run for real): a player\'s hold with no words is refused, another\'s row sets nothing, what it names is cleaned to a plain line of 120 characters, and a roll is kept only where their own view holds it, by its id alone',
        m0 === undefined && m1 === undefined && m2 === j({ text: 'A <b>foe</b>  at the gate' }) && n1.text.length === 120 && n1.roll === 'r_sh', j([m0, m1, m2, n1]));
    const p = mkH({ system: Sx.cleanSystem(Object.assign(JSON.parse(JSON.stringify(sysH())), { combat: { turn: { off: 'refuse', acts: [{ key: 'Action', n: 1 }] } } }), { F: Fx3, gmView: true }) }), p1 = p.net.fightHold('f_keep0001'), pHf = p.row('r_a').holdFor; p.step(); p.step(); const pHeld = p.row('r_a').held, pOff = p.net.fightSetOff('f_keep0001', 'r_a');
    check('1.6.0 with no named holds a hold is as it was: no words asked, no record, gone by the round\'s end, and no Set off', p1 === true && pHf === undefined && pHeld === undefined && pOff === false && !p.out.cards.length, j([p1, pHf, pHeld, pOff]));
    const rows2 = { rows: [{ id: 'r_a', held: 1 }, { id: 'r_b' }] }, had2 = { rows: [{ id: 'r_a', held: 1, holdFor: { text: 't' } }, { id: 'r_b', sf: 1, hk: 1 }, { id: 'r_gone', holdFor: { text: 'z' }, held: 1 }] };
    const reach = new Function(fnSrc('function fightReachKept(had, f) {', '\n}\n', 'fightReachKept') + '\n}\nreturn fightReachKept;')(); reach(had2, rows2);
    check('1.6.0 a roster edit keeps a named hold with its row, and what a set off and a lost action left', j(rows2.rows) === j([{ id: 'r_a', held: 1, holdFor: { text: 't' } }, { id: 'r_b', sf: 1, hk: 1 }]), j(rows2));
})());
// Stage 6 HUD G10: the round hook fires when a combat's round changes — its start, a step past either end (net.js combatSet / combatStep, run
// for real) — never within a round, on a roster edit that keeps the round, or at its end; a hook that throws never stops the turn. Fold 3 (backlog
// 152, moved on purpose): only for a round the fight reaches for the first time, so a step back past the first and on again runs nothing twice
{
    const setSrcG = fnSrc('function combatRefresh() {', '\nnet.combatStep = function', 'combatSet'), stepSrcG = fnSrc('net.combatStep = function', '\nnet.combatEnd = function', 'combatStep', 'netfight.js');
    const ccSrcG = fnSrc('function cleanCombats(c) {', '\nfunction applyNotepad(', 'cleanCombats');
    const calls = [], errs = [], hook = { throws: false };
    const netG = { role: 'host', active: true, combats: {} }, campG = { items: { m1: { type: 'map', meta: { title: 'Keep' } } } };
    const win = { wpSheets: { roundHook: (mapId, c) => { calls.push(mapId + ':' + c.round); if (hook.throws) throw new Error('boom'); } } };
    new Function('net', 'window', 'getActiveCampaign', 'broadcastCombats', 'logEvent', 'toast', 'render', 'console', 'showConfirm', ccSrcG + '\n' + setSrcG + '\n' + stepSrcG + '\n' + ordersSrc)(
        netG, win, () => campG, () => {}, () => {}, () => {}, () => {}, { error: e => errs.push(String(e && e.message)) }, () => {});
    const rw = n => Array.from({ length: n }, (_, i) => ({ id: 'r' + i, name: 'N' + i, tokId: 't' + i, init: 0, src: null }));
    const st = () => fightIn(netG.combats, 'm1') ? 'r' + fightIn(netG.combats, 'm1').round + 't' + fightIn(netG.combats, 'm1').turn : 'none';
    const seen = [];
    netG.combatSet('m1', { round: 1, turn: 0, rows: rw(2) }); seen.push(st() + '=' + calls.join());
    netG.combatSet('m1', { round: 1, turn: 1, rows: rw(3) }); seen.push(st() + '=' + calls.join());
    netG.combatStep('m1', 1); seen.push(st() + '=' + calls.join());
    netG.combatStep('m1', 1); seen.push(st() + '=' + calls.join());
    netG.combatStep('m1', -1); seen.push(st() + '=' + calls.join());
    netG.combatStep('m1', -1); seen.push(st() + '=' + calls.join());
    netG.combatStep('m1', -1); seen.push(st() + '=' + calls.join());
    hook.throws = true; netG.combatStep('m1', 1); netG.combatStep('m1', 1); netG.combatStep('m1', 1); netG.combatStep('m1', 1); netG.combatStep('m1', 1); netG.combatStep('m1', 1); seen.push(st() + '=' + calls.join()); hook.throws = false;   // fold 3: on through round 2, reached already, into round 3
    netG.combatSet('m1', { round: 5, turn: 0, rows: rw(3) }); seen.push(st() + '=' + calls.join());
    netG.combatSet('m1', null); seen.push(st() + '=' + calls.join());
    check('G10 the round hook (net.js, run for real): at the combat\'s start (round 1), a step past the last (round 2), on again into round 3 and a roster edit that sets round 5 — never within a round, on a roster edit that keeps it, at round 1\'s first turn stepping back, or at the end; fold 3: a step back past the first is a correction, so going back into round 1 and on again into round 2 runs nothing; a hook that throws is logged and the turn still moves',
        j(seen) === j(['r1t0=m1:1', 'r1t1=m1:1', 'r1t2=m1:1', 'r2t0=m1:1,m1:2', 'r1t2=m1:1,m1:2', 'r1t1=m1:1,m1:2', 'r1t0=m1:1,m1:2',
            'r3t0=m1:1,m1:2,m1:3', 'r5t0=m1:1,m1:2,m1:3,m1:5', 'none=m1:1,m1:2,m1:3,m1:5']) && j(errs) === j(['boom']), j([seen, errs]));
}

// Fold 0 (backlog 152, docs/FIGHT_CLOCK_DESIGN.md): a fight ends as End combat ends it when the session ends (leaveSession) and when its map is
// deleted (net.itemGone). net.js sliced and run for real on stubs: leaveSession and net.itemGone beside the combats slice and everything from
// combatRefresh to combatStep (combatOver, combatsOverAll, turnActsEnd, fxCombatEdge and the clock's tick with the real fxTick, clockFightEnd);
// calendar.js liveHeld with its own helpers and the real cleanClock. Before this fold the session's end dropped every fight with its effects banked
// until the clock's next tick and the Calendar never asked, and a deleted map left its fight running, so the clock waited for it for the rest of
// the session. The review of fold 0: a fighter still in another fight keeps what it spent (combatFreed's guard), and a deleted map's fight is named
// by the name dialogs.js hands on
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js')), Cx = await import(url('calendarcore.js'));
    const J = v => JSON.stringify(v);
    const setS = fnSrc('function combatRefresh() {', '\nnet.combatStep = function', 'combatSet'), cbS = between('// [netcheck:combats-start]', '// [netcheck:combats-end]', 'combats');
    const lvS = fnSrc('function leaveSession(silent) {', '\n}\n', 'leaveSession') + '\n}\n';
    const igA = src.indexOf('net.itemGone = function(campId, itemId, title) {'), igS = src.slice(igA, src.indexOf('\n};\n', igA) + 4);
    const pidS = (() => { const i = src.indexOf('function peerProfileId('); return src.slice(i, src.indexOf('\n', i)) + '\n'; })();
    const calJs = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'calendar.js'), 'utf8').replace(/\r\n/g, '\n');
    const calLine = k => { const i = calJs.indexOf(k); if (i < 0 || calJs.indexOf(k, i + 1) >= 0) throw new Error('netcheck: ' + k + ' not found once in calendar.js'); return calJs.slice(i, calJs.indexOf('\n', i)); };
    const lhA = calJs.indexOf('function liveHeld(camp) {'), lhS = calJs.slice(lhA, calJs.indexOf('\n}\n', lhA)) + '\n}\n';
    const liveHeldOf = n => new Function('window', 'cleanClock', "'use strict';\n" + ['function net() {', 'function isPlayer() {', 'function clockOn() {', 'function clockOf(camp) {', 'function sysClockStart() {', 'function fightMode() {', 'function liveHold(ck) {'].map(calLine).join('\n') + '\n' + lhS + '\nreturn liveHeld;')(
        { wpNet: n, wpVtt: { on: k => k === 'calendar' } }, Cx.cleanClock);
    const sysF = Sx.cleanSystem({ v: 1, name: 'F', fields: [{ id: 'f_fx', key: 'Effects', kind: 'effects' }], rolls: [], effects: [{ id: 'e_c', name: 'Charge', dur: '10 turns', mods: [] }], combat: { turn: { acts: [{ key: 'Action', n: 1 }] } } }, { F: Fx, gmView: true });
    const mkW = o => {
        o = o || {};
        const ev = [], toasts = [], logs = [], cal = [], marks = [], loads = [];
        const tok = (id, charId, ownerId) => ({ id, type: 'image', isChar: true, charId, ownerId: ownerId || null, x: 0, y: 0, w: 50, h: 50 });
        const fx = id => ({ f_fx: [{ id, ref: 'e_c', on: true, t: { left: 30, at: 0 } }] });   // banked, as a fight's start leaves them
        const camp = { id: 'k', clock: { t: 0 }, system: sysF,
            items: { mDocks: { type: 'map', meta: { title: 'Docks' }, whiteboard: [tok('t_kael', 'c_kael', 'u_a'), tok('t_u7', 'c_u7')] }, mBridge: { type: 'map', meta: { title: 'Bridge' }, whiteboard: [tok('t_u9', 'c_u9')] }, pNote: { type: 'doc', meta: { title: 'Notes' } } },
            chars: { c_kael: { id: 'c_kael', name: 'Kael', ownerId: 'u_a', values: fx('x_k') }, c_u7: { id: 'c_u7', name: 'Unit 7', npc: true, values: fx('x_7') }, c_u9: { id: 'c_u9', name: 'Unit 9', npc: true, values: fx('x_9') } } };
        if (o.sela) { camp.items.mBridge.whiteboard.push(tok('t_sela', 'c_sela', 'u_a')); camp.chars.c_sela = { id: 'c_sela', name: 'Sela', ownerId: 'u_a', values: fx('x_s') }; }   // the review of fold 0: a player's character still fighting on the Bridge
        const row = (id, name) => ({ id: 'r_' + id, name, tokId: id, init: 0, src: null });
        const conns = [{ peer: 'pA', open: true, sent: [], send(m) { packCheck(m); this.sent.push(JSON.parse(JSON.stringify(m))); } }];
        const net = { active: true, role: o.role || 'host', stream: !!o.stream, foreign: o.role === 'client', myId: 'u_gm', conns, roster: { pA: { id: 'u_a', location: 'mBridge' } }, peer: null, paused: false,
            combats: { mDocks: { mapId: 'mDocks', round: 3, turn: 1, rows: [row('t_kael', 'Kael'), row('t_u7', 'Unit 7')] }, mBridge: { mapId: 'mBridge', round: 1, turn: 0, rows: [row('t_u9', 'Unit 9')] } },
            syncCharDelta: () => {}, videoStop: () => {}, libReset: () => {} };
        if (o.sela) net.combats.mBridge.rows.push(row('t_sela', 'Sela'));
        const win = { wpVtt: { on: k => (k === 'calendar' ? o.calendar === true : true) }, wpSheets: { charChanged: () => {} }, wpCalendarCore: Cx, wpCalendar: { ownTime: () => false, second: () => { cal.push(net.active); ev.push('calendar'); } } };   // 152 fold 4: an end hands its closing round to ownTime and the clock to second (once a fight), where fightEnded was asked
        const broadcast = msg => { packCheck(msg); ev.push('broadcast:' + msg.type); conns.forEach(c => { if (c.open && net.roster[c.peer]) c.send(msg); }); };
        const noop = () => {}, env = { net, window: win, getActiveCampaign: () => camp, SC: () => Sx, own: (ob, k) => !!ob && Object.prototype.hasOwnProperty.call(ob, k), broadcast, sendFailed: e => { throw e; }, logEvent: (k, t) => logs.push(k + ':' + t), toast: t => toasts.push(t),
            render: noop, moveMode: () => 'refuse', saveRemoteSoon: noop, pushChat: noop, anyFog: () => false, fogDrop: () => null, marksEnd: mid => marks.push(mid), _lastSent: {},
            forgetHostCode: noop, cancelReconnect: noop, videoOver: noop, diceSessionReset: noop, _libSpent: {}, _shareBytes: {}, _shareCount: {}, resetAssetTransfers: noop, endWaiting: noop, combatAskOpen: {}, combatAsked: {}, renderNotepad: noop,
            setTimeout: noop, stopHeartbeat: noop, setIndicator: noop, setPausedLocal: noop, setTravelLockLocal: noop, setSelfPausedLocal: noop, bannedIds: {}, pendingJoins: [], approvalOpen: false, _unboundSaid: {}, ui: () => null, renderRoster: noop, setStatus: noop,
            save: noop, load: () => loads.push(1), syncSessionButtons: noop };
        const api = new Function(...Object.keys(env), "'use strict';\n" + pidS + cbS + '\n' + setS + '\n' + ordersSrc + '\n' + lvS + '\n' + igS + '\nreturn { leaveSession, combatSeen, combatSaw };')(...Object.values(env));
        net.turnSpent.c_kael = { Action: 1 };   // Kael spent his action this turn (the slice's own line set the record empty)
        if (o.sela) net.turnSpent.c_sela = { Action: 1 };   // and Sela spent hers in the fight on the Bridge
        api.combatSaw('mDocks', 'u_a', 't_u7');   // and Kael's player has seen Unit 7 in this fight
        const atOf = () => { const out = {}; Object.keys(camp.chars).forEach(id => { const t = camp.chars[id].values.f_fx[0].t; out[id] = t.at > 0 ? 'run' : 'banked'; }); return out; };
        const acts = () => conns[0].sent.filter(m => m.type === 'acts-left').map(m => m.charId + ':' + J(m.left));
        return { net, camp, api, ev, toasts, logs, cal, marks, loads, conns, atOf, acts, seen: () => api.combatSeen('mDocks', 'u_a', 't_u7') };
    };
    const runs = (W, silent) => { W.api.leaveSession(silent); return { cal: W.cal, ev: W.ev, at: W.atOf(), spent: J(W.net.turnSpent), acts: W.acts(), marks: W.marks, seen: W.seen(), combats: J(W.net.combats), toasts: W.toasts, logs: W.logs, loads: W.loads.length }; };
    const allRun = { c_kael: 'run', c_u7: 'run', c_u9: 'run' }, allBanked = { c_kael: 'banked', c_u7: 'banked', c_u9: 'banked' }, kaelSpent = J({ c_kael: { Action: 1 } });
    const ended = ['table:Combat ended on Docks after 3 rounds', 'table:Combat ended on Bridge after 1 round'], bye = 'Session ended for everyone. The room code is retired.';
    const hGot = runs(mkW(), false), qGot = runs(mkW(), true), oneW = mkW(); delete oneW.net.combats.mBridge; const oGot = runs(oneW, false), noneW = mkW(); noneW.net.combats = {}; const zGot = runs(noneW, false);
    const pGot = runs(mkW({ role: 'client' }), false), tGot = runs(mkW({ stream: true }), false);
    check('fold 0 (run for real): the session\'s end on the host ends every fight as End combat ends it, while the table still hears it — the Calendar asked once a fight with the table still on, both before the end is said; every fighter\'s timed effects running again (Kael, Unit 7, Unit 9); what Kael spent gone and his player told; the marks\' end on each map; nothing of a fight still seen; one log line a fight; quietly: no notice of a fight, the session\'s one notice saying the fight or the fights ended too, and a silent end (a new table over it) saying nothing at all; nothing at all on a player\'s app (its copy of the fights simply goes) or in the stream window, even one that says it hosts',
        J(hGot) === J({ cal: [true, true], ev: ['calendar', 'calendar', 'broadcast:end'], at: allRun, spent: '{}', acts: ['c_kael:null'], marks: ['mDocks', 'mBridge'], seen: false, combats: '{}', toasts: [bye + ' The 2 fights ended too.'], logs: ended.concat(['session:Session ended']), loads: 0 })
        && J(oGot.toasts) === J([bye + ' The fight ended too.']) && J(oGot.cal) === J([true]) && J(zGot.toasts) === J([bye]) && J(zGot.cal) === '[]' && J(zGot.at) === J(allBanked)
        && J(qGot) === J({ cal: [true, true], ev: ['calendar', 'calendar'], at: allRun, spent: '{}', acts: ['c_kael:null'], marks: ['mDocks', 'mBridge'], seen: false, combats: '{}', toasts: [], logs: ended, loads: 0 })
        && J(pGot) === J({ cal: [], ev: [], at: allBanked, spent: kaelSpent, acts: [], marks: [], seen: true, combats: '{}', toasts: ['Left the session. Restoring your own campaign.'], logs: [], loads: 1 })
        && J(tGot) === J({ cal: [], ev: ['broadcast:end'], at: allBanked, spent: kaelSpent, acts: [], marks: [], seen: true, combats: '{}', toasts: [bye], logs: ['session:Session ended'], loads: 0 }),
        J([hGot, oGot.toasts, zGot.toasts, qGot, pGot, tGot]));
    // a deleted map: the GM's delete takes the map out of the campaign first, then asks net.itemGone
    const sentOf = W => W.conns[0].sent.filter(m => m.type === 'combats' || m.type === 'itemGone').map(m => m.type === 'combats' ? 'combats:' + Object.keys(m.combats).join(',') : 'itemGone:' + m.itemId);
    const G = mkW({ calendar: true, sela: true }), lhG = liveHeldOf(G.net), g0 = lhG(G.camp);
    delete G.camp.items.mDocks; G.net.itemGone('k', 'mDocks', 'Docks');
    const g1 = { lh: lhG(G.camp), combats: Object.keys(G.net.combats), cal: G.cal.slice(), toasts: G.toasts.slice(), logs: G.logs.slice(), marks: G.marks.slice(), seen: G.seen(), spent: J(G.net.turnSpent), acts: G.acts(), sent: sentOf(G), at: G.atOf() };
    delete G.camp.items.mBridge; G.net.itemGone('k', 'mBridge'); const g2 = { lh: lhG(G.camp), combats: J(G.net.combats), cal: G.cal.length, toasts: G.toasts.slice(1), logs: G.logs.slice(1), spent: J(G.net.turnSpent), acts: G.acts(), sent: sentOf(G).slice(2) };
    G.net.itemGone('k', 'mDocks', 'Docks'); G.net.itemGone('k', 'pNote', 'Notes'); const g3 = { cal: G.cal.length, toasts: G.toasts.length, combats: sentOf(G).filter(s => /^combats/.test(s)).length };
    const G2 = mkW({ sela: true }); delete G2.camp.items.mDocks; G2.net.itemGone('k', 'mDocks', 'Docks'); const g4 = G2.atOf();
    const GP = mkW({ role: 'client' }); delete GP.camp.items.mDocks; GP.net.itemGone('k', 'mDocks', 'Docks'); const g5 = { combats: Object.keys(GP.net.combats), cal: GP.cal.length, sent: GP.conns[0].sent.length, toasts: GP.toasts.length };
    const E = mkW({ sela: true }); E.net.combatSet('mDocks', null);
    const eGot = { combats: Object.keys(E.net.combats), cal: E.cal, toasts: E.toasts, logs: E.logs, marks: E.marks, seen: E.seen(), spent: J(E.net.turnSpent), acts: E.acts(), sent: sentOf(E), at: E.atOf() };
    const selaSpent = J({ c_sela: { Action: 1 } }), selaBanked = { c_kael: 'banked', c_u7: 'banked', c_u9: 'banked', c_sela: 'banked' };
    check('fold 0 (run for real): a fight on a deleted map ends as End combat ends it — the fight taken away and the players sent the fights left, before they are told the map is gone; the Calendar asked once; End\'s notice and log line naming the map by the name the delete hands on, and as the deleted map where none is handed on; the marks\' end; nothing of it still seen; what Kael spent gone and his player told, while what Sela spent, still fighting on the Bridge, stays and her player is told nothing until that fight ends too — so the clock no longer waits for it (calendar.js liveHeld: a fight, then still a fight on the Bridge, then running once that map goes too); a map with no token left to find its fighters by has the clock\'s own tick run at once, which (152 fold 4, moved on purpose) keeps everyone\'s effects banked while the fight on the Bridge runs, Kael and Unit 7 following the second as everyone in no fight does, with the Calendar off as on; another delete, of that map again or of a page, ends nothing; on a player\'s app a delete ends no fight; End itself as before, its fighters\' effects banked while another fight runs (fold 4)',
        g0 === 'fight' && J(g1) === J({ lh: 'fight', combats: ['mBridge'], cal: [true], toasts: ['Combat ended on Docks.'], logs: ['table:Combat ended on Docks after 3 rounds'], marks: ['mDocks'], seen: false, spent: selaSpent, acts: ['c_kael:null'], sent: ['combats:mBridge', 'itemGone:mDocks'], at: selaBanked })
        && J(g2) === J({ lh: '', combats: '{}', cal: 2, toasts: ['Combat ended on the deleted map.'], logs: ['table:Combat ended on the deleted map after 1 round'], spent: '{}', acts: ['c_kael:null', 'c_sela:null'], sent: ['combats:', 'itemGone:mBridge'] }) && J(g3) === J({ cal: 2, toasts: 2, combats: 2 })
        && J(g4) === J(selaBanked) && J(g5) === J({ combats: ['mDocks', 'mBridge'], cal: 0, sent: 0, toasts: 0 })
        && J(eGot) === J({ combats: ['mBridge'], cal: [true], toasts: ['Combat ended on Docks.'], logs: [ended[0]], marks: ['mDocks'], seen: false, spent: selaSpent, acts: ['c_kael:null'], sent: ['combats:mBridge'], at: selaBanked }),
        J([g0, g1, g2, g3, g4, g5, eGot]));
    const dlgJs = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'dialogs.js'), 'utf8');
    check('fold 0 (source): End, the session\'s end and a deleted map end a fight in one place (combatOver); the session\'s end asks it right after its drags go back, before the end is said and while the table is still on, never in the stream window; a deleted map asks it only on an active host, before the players are told, with the name it was handed; dialogs.js\'s two deletes of an item hand on the name the item had',
        (src.match(/combatOver\(/g) || []).length === 4 && /\} else if \(!combat\) combatOver\(fid, had\);/.test(require('./checkkit').part('netfight.js')) && /var fightsOver = wasHost && !net\.stream && typeof combatsOverAll === 'function' \? combatsOverAll\(\) : 0;/.test(lvS)
        && lvS.indexOf('combatsOverAll()') > lvS.indexOf('fogDragSweep(true)') && lvS.indexOf('combatsOverAll()') < lvS.indexOf("broadcast({ type: 'end' }") && lvS.indexOf('combatsOverAll()') < lvS.indexOf('net.active = false')
        && igS.indexOf('combatOver(fid') > igS.indexOf("if (!(net.active && net.role === 'host')) return;") && igS.indexOf('combatOver(fid') < igS.indexOf("type: 'itemGone'")
        && /fightsOn\(itemId\)\.filter\(function\(fid\) \{ return combatOver\(fid, net\.combats\[fid\], false, title\); \}\)/.test(igS) && (dlgJs.match(/window\.wpNet\.itemGone\(/g) || []).length === 2   // 1.5.6: moved on purpose, the page switch's own call gone (the save takes a page from players, net.js pagesSync)
        && /window\.wpNet\.itemGone\(camp\.id, id, removed && removed\.meta \? removed\.meta\.title : undefined\);/.test(dlgJs) && /var goneId = camp\.activeItemId, goneIt = camp\.items\[goneId\];\r?\n\s*delete camp\.items\[goneId\];\r?\n\s*if \(window\.wpNet && window\.wpNet\.itemGone\) window\.wpNet\.itemGone\(camp\.id, goneId, goneIt && goneIt\.meta \? goneIt\.meta\.title : undefined\);/.test(dlgJs));
})());




// Turn-based combat T3a (D11, owner): walls stop a player's token — the host's pos gate (net.js, run for real) asks the fog for the move from
// where the drag began; the campaign's mode: refuse (mid-drag moves are not applied; the drop puts the token back for everyone, the mover
// too, with a note), warn (through, a note to the mover and the GM), off; a client shows the note from its synced host only, as plain text
{
    const posW = between('// [netcheck:pos-start]', '// [netcheck:pos-end]', 'pos'), tnW = between('// [netcheck:turnnote-start]', '// [netcheck:turnnote-end]', 'turnnote');
    const runW = (mode, moves, o) => {
        o = o || {}; const w = { id: 't1', isChar: true, charId: 'c_w', ownerId: 'u_a', x: 0, y: 0, w: 50, h: 50 }, map = { type: 'map', whiteboard: [w] }, camp = { items: { m1: map }, turnRules: mode === undefined ? undefined : { walls: mode } };
        const out = { bcast: [], dom: [], toasts: [], sent: [], asked: [], bells: [] }, conn = { peer: 'pA', send: m => out.sent.push(m) };
        const env = { net: { role: 'host', paused: false, roster: { pA: { id: 'u_a', location: 'm1' } }, tokenDropped() {} }, campOf: () => camp, validKey: k => k === 'm1', peerPaused: () => false, allow: () => true, checkRoomHandouts() {},
            applyPosToDom: m => out.dom.push(m), broadcastPos: (m, ex) => out.bcast.push([m.x, m.y, m.final, ex === null ? 'all' : 'others']), toast: t => out.toasts.push(t), saveRemoteSoon() {}, sendFailed: e => { throw e; },
            window: { wpFog: { moveBlocked: (mp, tok, fx, fy, tx, ty) => { out.asked.push([fx, fy, tx, ty]); return tx >= 200 && fx < 200; } } }, setTimeout: f => f(), bellOut: (cid, note) => out.bells.push([cid, note.title, note.text]) };
        const run = new Function('env', 'msg', 'conn', 'var net = env.net, campOf = env.campOf, validKey = env.validKey, peerPaused = env.peerPaused, allow = env.allow, checkRoomHandouts = env.checkRoomHandouts, applyPosToDom = env.applyPosToDom, broadcastPos = env.broadcastPos, toast = env.toast, saveRemoteSoon = env.saveRemoteSoon, sendFailed = env.sendFailed, window = env.window, setTimeout = env.setTimeout, bellOut = env.bellOut;\n' + posW + '\nreturn function(m, c) { return handlePos(m, c); };')(env);
        moves.forEach(mv => run(Object.assign({ type: 'pos', campId: 'c', itemId: 'm1', wbId: 't1' }, mv), conn));
        out.at = [w.x, w.y]; return out;
    };
    const drag = [{ x: 100, y: 0 }, { x: 250, y: 0 }, { x: 300, y: 0, final: true }];
    const rf = runW(undefined, drag), rfE = runW('refuse', drag), wn = runW('warn', drag), of = runW('off', drag), ok = runW('refuse', [{ x: 100, y: 0 }, { x: 150, y: 0, final: true }]);
    const two = runW('refuse', [{ x: 100, y: 0, final: true }, { x: 150, y: 0 }, { x: 250, y: 0, final: true }]);
    check('walls (host, run for real): refuse by default — a move past the wall is not applied mid-drag, the drop puts the token back where the drag began for everyone (the mover too) with one note to them; every check measures from where the drag began',
        j(rf.at) === j([0, 0]) && j(rf.bcast) === j([[100, 0, false, 'others'], [0, 0, true, 'all']]) && rf.sent.length === 1 && rf.sent[0].type === 'turn-note' && /wall/.test(rf.sent[0].text) && rf.asked.every(a => a[0] === 0 && a[1] === 0) && j(rfE) === j(rf), j(rf));
    check('walls: warn lets the move through with a note to the mover and the GM; off never asks; a move clear of the wall goes through untouched; each drop begins the next drag from where it landed',
        j(wn.at) === j([300, 0]) && wn.sent.length === 1 && /went through a wall/.test(wn.sent[0].text) && wn.toasts.length === 1 && j(of.at) === j([300, 0]) && !of.asked.length && !of.sent.length
        && j(ok.at) === j([150, 0]) && !ok.sent.length && j(two.at) === j([100, 0]) && j(two.asked.map(a => a[0])) === j([0, 100, 100]), j([wn, of.asked, two]));
    const runTN = (msg, o) => { o = o || {}; const t = []; new Function('msg', 'conn', 'net', 'toast', 'bellOut', tnW)(msg, { peer: o.peer || 'h' }, { foreign: true, syncedPeer: 'h', stream: false }, x => t.push(x), (cid, note) => (o.bells || []).push([cid, note.title, note.text])); return t; };
    check('turn-note (client, run for real): the synced host\'s note shows as one plain line (controls and bidi marks out, 200 at most); nothing from another peer or that is not text',
        j(runTN({ type: 'turn-note', text: 'A wall\u202e\u0007 is <b>here</b>' + 'x'.repeat(300) })) === j(['A wall   is <b>here</b>' + 'x'.repeat(177)]) && !runTN({ type: 'turn-note', text: 'x' }, { peer: 'o' }).length && !runTN({ type: 'turn-note', text: 5 }).length);
    const tb = [], tbN = []; runTN({ type: 'turn-note', text: 'Your \u202eturn', charId: 'c_p' }, { bells: tb }); runTN({ type: 'turn-note', text: 'x', charId: '../c' }, { bells: tbN }); runTN({ type: 'turn-note', text: 'x', charId: 5 }, { bells: tbN }); runTN({ type: 'turn-note', text: 'x' }, { bells: tbN }); runTN({ type: 'turn-note', text: ' ', charId: 'c_p' }, { bells: tbN }); runTN({ type: 'turn-note', text: 'x', charId: 'c_p' }, { peer: 'o', bells: tbN });
    const tnS = (() => { const T = src.replace(/\r\n/g, '\n'), i = T.indexOf('function turnNote(conn, text, cid) {'); return i < 0 ? '' : T.slice(i, T.indexOf('\n}\n', i) + 2); })();
    const tnSent = [], tnC = { send: m => tnSent.push(m) }, TNf = new Function('sendFailed', tnS + '\nreturn turnNote;')(e => { throw e; });
    TNf(tnC, 'a', 'c_p'); TNf(tnC, 'b', '../x'); TNf(tnC, 'c'); TNf(tnC, 'd', 5); TNf(tnC, 'e', 'c_' + 'x'.repeat(30)); TNf(null, 'f', 'c_p');
    check('The bell (Bell-b): turnNote (net.js, run for real) adds the character only when it is a well-formed id (a path, a number, none, one too long: the note alone); no connection, nothing',
        j(tnSent) === j([{ type: 'turn-note', text: 'a', charId: 'c_p' }, { type: 'turn-note', text: 'b' }, { type: 'turn-note', text: 'c' }, { type: 'turn-note', text: 'd' }, { type: 'turn-note', text: 'e' }]), j(tnSent));
    check('The bell (Bell-b): a turn note naming a character goes to that character\'s bell as its cleaned line (sheets.js takes the player\'s own only); none for a bad or missing id, an empty line or another peer; on the host the walls\' notes name the token\'s character and Warn also notes it in the GM\'s bell',
        j(tb) === j([['c_p', 'Turn', 'Your  turn']]) && !tbN.length && rf.sent.every(m => m.charId === 'c_w') && wn.sent[0].charId === 'c_w' && j(wn.bells) === j([['c_w', 'Turn', 'Moved through a wall.']]) && !rf.bells.length && !of.bells.length, j([tb, tbN, rf.sent, wn.sent, wn.bells]));
    // secrets (R2 #19): a trigger zone's message, said by the host when a player's own token lands in a shown zone — to that connection alone, as the
    // dropper's app used to read it off its own copy (the token's center inside the zone's box, the first zone found); the player's app shows it as text
    const runTZ = (moves, zones, o) => {
        o = o || {}; const w = { id: 't1', isChar: true, charId: 'c_w', ownerId: 'u_a', x: 0, y: 0, w: 50, h: 50 }, other = { id: 't2', isChar: true, charId: 'c_o', ownerId: 'u_b', x: 0, y: 0, w: 50, h: 50 };
        const map = { type: 'map', whiteboard: [w, other].concat(zones) }, camp = { items: { m1: map } }, out = { sent: [], sentB: [], toasts: [] };
        const conn = { peer: 'pA', send: m => { packCheck(m); out.sent.push(JSON.parse(JSON.stringify(m))); } }, connB = { peer: 'pB', send: m => out.sentB.push(m) };
        const env = { net: { role: 'host', paused: false, roster: { pA: { id: 'u_a', location: 'm1' }, pB: { id: 'u_b', location: 'm1' } }, conns: [conn, connB], tokenDropped() { out.dropped = (out.dropped || 0) + 1; } }, campOf: () => camp, validKey: k => k === 'm1', peerPaused: () => false, allow: () => true, checkRoomHandouts() {},
            applyPosToDom() {}, broadcastPos() {}, toast: t => out.toasts.push(t), saveRemoteSoon() {}, sendFailed: e => { throw e; }, window: {}, setTimeout: f => f(), bellOut() {} };
        const run = new Function('env', 'msg', 'conn', 'var net = env.net, campOf = env.campOf, validKey = env.validKey, peerPaused = env.peerPaused, allow = env.allow, checkRoomHandouts = env.checkRoomHandouts, applyPosToDom = env.applyPosToDom, broadcastPos = env.broadcastPos, toast = env.toast, saveRemoteSoon = env.saveRemoteSoon, sendFailed = env.sendFailed, window = env.window, setTimeout = env.setTimeout, bellOut = env.bellOut;\n' + posW + '\nreturn function(m, c) { return handlePos(m, c); };')(env);
        moves.forEach(mv => run(Object.assign({ type: 'pos', campId: 'c', itemId: 'm1', wbId: 't1' }, mv), conn));
        return out;
    };
    const zoneA = { id: 'z1', type: 'trigger', name: 'Altar', eventMessage: 'The crystals brighten.', x: 200, y: 200, w: 100, h: 100 }, zoneHid = { id: 'z2', type: 'trigger', hidden: true, eventMessage: 'A trap', x: 400, y: 400, w: 100, h: 100 };
    const zoneMute = { id: 'z3', type: 'trigger', eventMessage: '  ', x: 600, y: 600, w: 100, h: 100 }, zoneHex = { id: 'z4', type: 'trigger', shape: 'hexagon', eventMessage: 'Hex', x: 800, y: 800 }, zoneLong = { id: 'z5', type: 'trigger', eventMessage: 'y'.repeat(3000), x: 1000, y: 1000, w: 100, h: 100 };
    const tzIn = runTZ([{ x: 100, y: 100 }, { x: 210, y: 210, final: true }], [zoneA, zoneHid, zoneMute, zoneHex, zoneLong]), tzEdge = runTZ([{ x: 275, y: 275, final: true }], [zoneA]), tzOut = runTZ([{ x: 276, y: 276, final: true }], [zoneA]);
    const tzHid = runTZ([{ x: 410, y: 410, final: true }], [zoneA, zoneHid]), tzMute = runTZ([{ x: 610, y: 610, final: true }], [zoneMute]), tzMid = runTZ([{ x: 210, y: 210 }], [zoneA]), tzHex = runTZ([{ x: 820, y: 820, final: true }], [zoneHex]), tzLong = runTZ([{ x: 1010, y: 1010, final: true }], [zoneLong]);
    const tzFirst = runTZ([{ x: 210, y: 210, final: true }], [{ id: 'z0', type: 'trigger', eventMessage: '', x: 200, y: 200, w: 100, h: 100 }, zoneA]), tzRect = runTZ([{ x: 210, y: 210, final: true }], [{ id: 'r', type: 'rect', eventMessage: 'a shape', x: 200, y: 200, w: 100, h: 100 }]);
    // a gesture that leaves the token where it stood in a zone — a turn (the facing dial, the rotate handle, an arrow turn: a final with the same place),
    // or a drag ending in the zone it began in — says nothing again; a nudge that carries it in (a final with no drag before it) does
    const zoneAt0 = { id: 'z6', type: 'trigger', eventMessage: 'Here.', x: 0, y: 0, w: 100, h: 100 };
    const tzTurn = runTZ([{ x: 0, y: 0, rot: 90, final: true }], [zoneAt0]), tzStay = runTZ([{ x: 10, y: 10 }, { x: 20, y: 20, final: true }], [zoneAt0]), tzBack = runTZ([{ x: 210, y: 210 }, { x: 0, y: 0, final: true }], [zoneAt0]);
    const tzNudge = runTZ([{ x: 60, y: 60, final: true }], [{ id: 'z7', type: 'trigger', eventMessage: 'Step.', x: 50, y: 50, w: 100, h: 100 }]), tzAcross = runTZ([{ x: 210, y: 210 }, { x: 410, y: 410, final: true }], [zoneA, { id: 'z8', type: 'trigger', eventMessage: 'Second.', x: 400, y: 400, w: 100, h: 100 }]);
    check('secrets: a player\'s own token dropped (final) with its center inside a shown trigger zone gets that zone\'s message once, as one trigmsg to its own connection alone (never another player\'s), text only, 2000 characters at most, a zone with no box 100 by 100 as the dropper\'s app read it; nothing mid-drag, outside every zone (the edge counts), in a hidden zone, in a zone whose message is blank or on a shape that is no zone; the first zone under the token is the one that speaks, even a mute one',
        j(tzIn.sent) === j([{ type: 'trigmsg', text: 'The crystals brighten.' }]) && tzIn.sentB.length === 0 && tzIn.dropped === 1 && j(tzEdge.sent) === j([{ type: 'trigmsg', text: 'The crystals brighten.' }]) && j(tzHex.sent) === j([{ type: 'trigmsg', text: 'Hex' }])
        && tzLong.sent.length === 1 && tzLong.sent[0].text.length === 2000 && [tzOut, tzHid, tzMute, tzMid, tzFirst, tzRect].every(r => r.sent.length === 0 && r.sentB.length === 0), j([tzIn.sent, tzEdge.sent, tzOut.sent, tzHid.sent, tzMute.sent, tzMid.sent, tzHex.sent, tzFirst.sent]));
    check('secrets: the message is said when the gesture carries the token\'s center INTO the zone — a turn in place (the facing dial, the rotate handle, an arrow turn send a final too), a drag that ends in the zone it began in, or one that leaves and comes back say nothing again; a nudge into a zone (a final with no drag before it) and a drag from one zone into another speak',
        [tzTurn, tzStay, tzBack].every(r => r.sent.length === 0 && r.sentB.length === 0) && j(tzNudge.sent) === j([{ type: 'trigmsg', text: 'Step.' }]) && j(tzAcross.sent) === j([{ type: 'trigmsg', text: 'Second.' }]), j([tzTurn.sent, tzStay.sent, tzBack.sent, tzNudge.sent, tzAcross.sent]));
    const tgW = between('// [netcheck:trigmsg-start]', '// [netcheck:trigmsg-end]', 'trigmsg');
    const runTG = (msg, o) => { o = o || {}; const shown = []; new Function('msg', 'conn', 'net', 'showAlert', tgW)(msg, { peer: o.peer || 'h' }, { foreign: o.foreign !== false, syncedPeer: 'h', stream: !!o.stream }, (t, cb) => { shown.push([t, typeof cb]); }); return shown; };
    const tg1 = runTG({ type: 'trigmsg', text: 'The door\u202e\u0007 bangs <b>open</b>.\nA driver stumbles in.' + 'x'.repeat(3000) });
    check('trigmsg (client, run for real): the synced host\'s message shows once as plain text through showAlert (a text node: controls and bidi marks out, line breaks kept, 2000 at most); nothing from another peer, before the snapshot, in the stream window, that is not text or that is blank',
        tg1.length === 1 && tg1[0][1] === 'function' && tg1[0][0].length === 2000 && tg1[0][0].indexOf('The door   bangs <b>open</b>.\nA driver stumbles in.xxx') === 0
        && [runTG({ type: 'trigmsg', text: 'x' }, { peer: 'o' }), runTG({ type: 'trigmsg', text: 'x' }, { foreign: false }), runTG({ type: 'trigmsg', text: 'x' }, { stream: true }), runTG({ type: 'trigmsg', text: 5 }), runTG({ type: 'trigmsg', text: ' \u200b ' })].every(s => s.length === 0), j(tg1));
    const dmT = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'datamap.js'), 'utf8').replace(/\r\n/g, '\n');
    // the dropper's app still reads its own copy at a drop and speaks only for a zone that carries a message: at a 1.5.0 host the copy carries none
    // (wireWbItem), so the host's trigmsg is the one word; at an older host, whose copies still carry it, the message shows as it always did
    check('trigmsg (source): the client branch runs only for a client and the host\'s branch fires at a final drop, with where the gesture began, beside the room note and the travel; a player\'s app reads its own copy at a drop as before and speaks only for a zone that carries a message (none at a 1.5.0 host; an older host\'s copies still carry it), and net.js imports showAlert from the dialogs',
        /\} else if \(msg\.type === 'trigmsg' && net\.role === 'client'\) \{\n\s*\/\/ \[netcheck:trigmsg-start\]/.test(src) && /if \(msg\.final\) \{\n\s*if \(typeof triggerFire === 'function'\) triggerFire\(conn, map, w, frW\);/.test(src) && /^import \{ showConfirm, showAlert \} from '\.\/dialogs\.js';/m.test(src)
        && /var mdZn = multiDrag\.filter\(function\(m\) \{ return m\.item === item; \}\)\[0\], zoneMsg = gmZoneSay\(am, item, mdZn \? \{ x: mdZn\.ox, y: mdZn\.oy \} : null\);[^\n]*\n\s*if \(zoneMsg\) import\('\.\/dialogs\.js'\)\.then\(d => d\.showAlert\(zoneMsg, function\(\)\{\}\)\);/.test(dmT) && !/trigLocal/.test(dmT));
}

// Turn-based combat T3b (D2, D3, D5): the move limit and the out-of-turn lock on the host — the real pos gate and the real patch path together (a
// client saves its map right after a drop; that copy closes the drag, judged and counted from where it began, when the drag's final pos was
// lost), and the turn's start (turnMoveStart: the allowance through the player's view, their note)
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js'));
    const posT = between('// [netcheck:pos-start]', '// [netcheck:pos-end]', 'pos'), patT = between('// [netcheck:patch-start]', '// [netcheck:patch-end]', 'patch', 'netfog.js'), tmT = between('// [netcheck:turnmove-start]', '// [netcheck:turnmove-end]', 'turnmove');
    const clT = src.slice(src.indexOf('function cleanElevation('), src.indexOf('function sanitizeItem('));
    const lineT = k => { const i = src.indexOf(k); return src.slice(i, src.indexOf('\n', i)); };
    const helpT = ['function peerProfileId(', 'function fxLib(', 'function itemLib('].map(lineT).join('\n') + '\n';
    const sysT = Sx.cleanSystem({ v: 1, name: 'T', fields: [{ id: 'f_sp', key: 'Speed', kind: 'number', def: 30 }, { id: 'f_g', key: 'GMFig', kind: 'number', def: 1, vis: 'gm' }], rolls: [], combat: { turn: { move: 'Speed', unit: 'ft', diag: 'one' } } }, { F: Fx, gmView: true });
    const mkT = o => {
        o = o || {};
        const pat = { id: 't_p', isChar: true, charId: 'c_p', ownerId: 'u_a', x: 0, y: 0, w: 50, h: 50 }, orc = { id: 't_o', isChar: true, charId: 'c_o', x: 500, y: 0, w: 50, h: 50 }, free = { id: 't_f', isChar: true, charId: 'c_f', ownerId: 'u_a', x: 0, y: 500, w: 50, h: 50 };
        const map = { type: 'map', meta: { gridType: 'square' }, whiteboard: [pat, orc, free] };
        const camp = { id: 'c1', items: { m1: map }, system: o.system || sysT, turnRules: o.rules || {}, chars: { c_p: { id: 'c_p', name: 'Pat', ownerId: 'u_a', values: {} }, c_o: { id: 'c_o', name: 'Orc', npc: true, values: {} } } };
        const out = { bcast: [], notes: [], toasts: [], sent: [], bells: [] }, conn = { peer: 'pA', open: true, send: m => out.sent.push(m) }, conn2 = { peer: 'pA2', open: true, send: m => out.sent.push(Object.assign({ to: 'pA2' }, m)) };
        const net = { role: 'host', paused: false, roster: { pA: { id: 'u_a', location: 'm1' }, pA2: { id: 'u_a', location: 'm1' } }, conns: [conn, conn2], tokenDropped() {}, combats: { f_keep0001: { id: 'f_keep0001', mapId: 'm1', round: 1, turn: o.turn === undefined ? 1 : o.turn, rows: [{ id: 'r_o', tokId: 't_o' }, { id: 'r_p', tokId: 't_p' }] } } };   // fold 2: a fight under its own id, on its map (fold 2's review: an id that is not its map's, so a turn's move keyed by the map is told apart)
        const win = { wpVtt: { on: k => k === 'turns' ? o.turns !== false : true, campaignOn: () => true }, wpFog: { moveBlocked: (mp, w, fx, fy, tx, ty) => tx >= 1000, moveCells: o.moveCells || ((mp, w, fx, fy, tx, ty) => Math.max(Math.abs(tx - fx), Math.abs(ty - fy)) / 50) }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }) }, wpFormula: Fx };
        const api = new Function('state', 'net', 'window', 'peerPaused', 'allow', 'checkRoomHandouts', 'applyPosToDom', 'broadcastPos', 'toast', 'saveRemoteSoon', 'sendFailed', 'setTimeout', 'playerStroke', 'SC', 'getActiveCampaign', 'bellOut',
            clT + ownKeySrc + helpT + posT + '\n' + patT + '\n' + tmT + '\n' + ordersSrc + '\nreturn { pos: function(m, c) { return handlePos(m, c); }, patch: function(m) { return applyClientItemFiltered(m, { id: "u_a" }); }, patchOut: function(m, o) { return applyClientItemFiltered(m, { id: "u_a" }, o); }, start: turnMoveStart };')(
            { appState: { campaigns: { c1: camp } } }, net, win, () => false, () => true, () => {}, () => {}, (m, ex) => out.bcast.push([m.wbId, m.x, m.y, ex === null ? 'all' : 'others']), t => out.toasts.push(t), () => {}, e => { throw e; }, f => f(), () => null, () => Sx, () => camp, (cid, note) => out.bells.push([cid, note.title, note.text]));
        if (o.allow !== undefined) net.turnMove = { f_keep0001: { rowId: 'r_p', tokId: 't_p', moved: o.moved || 0, allow: o.allow } };
        const P = (wb, x, y, fin) => api.pos({ type: 'pos', campId: 'c1', itemId: 'm1', wbId: wb, x, y, final: !!fin }, conn);
        const C = (wb, x, y) => { const copy = JSON.parse(JSON.stringify(map.whiteboard)); copy.find(w => w.id === wb).x = x; copy.find(w => w.id === wb).y = y; api.patch({ type: 'item', campId: 'c1', itemId: 'm1', item: { type: 'map', whiteboard: copy } }); };
        out.notes = () => out.sent.filter(m => m.type === 'turn-note').map(m => (m.to ? m.to + ':' : '') + m.text);
        return { out, net, map, camp, pat, free, P, C, api };
    };
    const wt = mkT({ rules: { walls: 'refuse' }, turns: false }); wt.map.whiteboard.push({ id: 't_w', waiting: 1, ownerId: 'u_a', x: 0, y: 200, w: 50, h: 50 }); wt.C('t_w', 1100, 200); const wtW = wt.map.whiteboard.find(w => w.id === 't_w');
    const wt2 = mkT({ rules: { walls: 'refuse' }, turns: false }); wt2.map.whiteboard.push({ id: 't_w', waiting: 1, ownerId: 'u_a', x: 0, y: 200, w: 50, h: 50 }); wt2.C('t_w', 300, 200); const wt2W = wt2.map.whiteboard.find(w => w.id === 't_w');
    check('F1a the walls rule on a waiting token\'s map copy (run for real): past a wall it goes back (it never lands where a move would be refused); within the walls it moves',
        wtW.x === 0 && wtW.y === 200 && wt2W.x === 300, j([wtW, wt2W, wt.out.notes()]));
    // the pos path: within the move, past it (refuse), the copy that follows a refused drop, a lost final (the copy closes it), warn, off
    const a = mkT({ allow: 4 }); a.P('t_p', 50, 0); a.P('t_p', 100, 0, true); a.C('t_p', 100, 0);
    const aMoved = a.net.turnMove.f_keep0001.moved, aNotes = a.out.notes();
    a.P('t_p', 150, 0); a.P('t_p', 250, 0, true); a.C('t_p', 250, 0);
    check('T3b the move limit (host, run for real): a drop within the move goes through and counts from where its drag began, with a note of what is left; one past it is not applied mid-drag, goes back for everyone with a note, and the map copy that repeats it moves nothing and says nothing more',
        aMoved === 2 && j(aNotes) === j(['Moved 2 squares (10 ft); 2 squares (10 ft) left.']) && a.net.turnMove.f_keep0001.moved === 2 && a.pat.x === 100
        && j(a.out.notes().slice(1)) === j(['That is 3 squares (15 ft); you have 2 squares (10 ft) left.']) && a.out.bcast.filter(b => b[3] === 'all').length === 2 && a.out.bcast.filter(b => b[3] === 'all').every(b => b[1] === 100), j([aMoved, a.out.notes(), a.out.bcast]));
    const b = mkT({ allow: 4 }); b.P('t_p', 50, 0); b.C('t_p', 250, 0);
    const b2 = mkT({ allow: 4 }); b2.P('t_p', 50, 0); b2.C('t_p', 150, 0);
    check('T3b a drag whose final pos was lost: the map copy after it closes it — past the move, the token goes back to where the drag began for everyone, with a note to each of the player\'s connections; within it, the whole drag counts (from its start, not the last mid-drag place), with its note',
        b.pat.x === 0 && b.out.bcast.some(x => x[1] === 0 && x[3] === 'all') && j(b.out.notes()) === j(['That is 5 squares (25 ft); you have 4 squares (20 ft) left.', 'pA2:That is 5 squares (25 ft); you have 4 squares (20 ft) left.'])
        && b2.pat.x === 150 && b2.net.turnMove.f_keep0001.moved === 3 && j(b2.out.notes()) === j(['Moved 3 squares (15 ft); 1 square (5 ft) left.', 'pA2:Moved 3 squares (15 ft); 1 square (5 ft) left.']), j([b.out.notes(), b2.out.notes(), b2.net.turnMove]));
    {   // 1.6.2 (backlog 70; the owner, 2026-11-11, by prompt: "System sets it, table rule (Recommended)"): the facing limit, the pos gate, the map-copy path and the turn's start run for real
        const sysF = by => Sx.cleanSystem({ v: 1, name: 'F', fields: [{ id: 'f_sp', key: 'Speed', kind: 'number', def: 30 }, { id: 'f_tn', key: 'Turns', kind: 'number', def: 2 }, { id: 'f_g', key: 'GMFig', kind: 'number', def: 1, vis: 'gm' }], rolls: [], combat: { turn: Object.assign({ move: 'Speed', unit: 'ft', face: by === 'gm' ? 'GMFig + 1' : 'Turns' }, by === 'turn' ? { faceBy: 'turn' } : {}) } }, { F: Fx, gmView: true });
        const mkF = (o, by) => { const x = mkT(Object.assign({ system: sysF(by) }, o || {})); x.conn = x.net.conns[0]; x.T = (rot, fin, px) => x.api.pos({ type: 'pos', campId: 'c1', itemId: 'm1', wbId: 't_p', x: px || 0, y: 0, rot: rot, front: 0, final: !!fin, a: 7 }, x.conn);
            x.CR = rot => { const copy = JSON.parse(JSON.stringify(x.map.whiteboard)); copy.find(w => w.id === 't_p').rot = rot; return x.api.patch({ type: 'item', campId: 'c1', itemId: 'm1', item: { type: 'map', whiteboard: copy } }); };
            x.begin = () => x.api.start('m1', x.net.combats.f_keep0001); x.mine = () => x.out.notes().filter(n => !/^pA2:/.test(n) && !/to move/.test(n)); return x; };
        const hadAck = Object.prototype.hasOwnProperty.call(globalThis, 'withAck'); if (!hadAck) globalThis.withAck = (m, c, a) => Object.assign({}, m, { ack: a });
        let f, st0, n0, r1, r2, backs, r3, r3n, r4, r5, g, g1, wn, off, bt, hx, ng, ot, gm, both, h1, mid, rl, ar, lo, lw, sq, tiny, cl, f2, sn, ro;
        try {
            f = mkF(); f.begin(); st0 = j(f.net.turnFace.f_keep0001); n0 = f.out.notes();
            f.T(90, true); r1 = [f.pat.rot, f.net.turnFace.f_keep0001.used, f.mine().slice(-1)[0]];
            f.T(270, true); backs = f.out.sent.filter(m => m.type === 'pos').map(m => [m.rot, m.final, m.ack]); r2 = [f.pat.rot, f.net.turnFace.f_keep0001.used, f.mine().slice(-1)[0]]; const nBefore = f.out.notes().length; f.CR(270); r3 = [f.pat.rot, f.net.turnFace.f_keep0001.used, f.out.notes().length - nBefore];
            f.T(180, false); const live = f.pat.rot; f.T(180, true); r4 = [live, f.pat.rot, f.net.turnFace.f_keep0001.used, f.mine().slice(-1)[0]];
            f.T(270, false); f.T(270, true); r5 = [f.pat.rot, f.net.turnFace.f_keep0001.used, f.mine().slice(-1)[0]]; f.CR(180); r3n = [f.pat.rot, f.net.turnFace.f_keep0001.used];
            g = mkF(); g.begin(); g.net.turnFace.f_keep0001.allow = 1; const gN = g.out.notes().length; g.T(180, false); g.CR(180); g1 = [g.pat.rot, g.net.turnFace.f_keep0001.used, g.out.notes().slice(gN)];
            wn = mkF({ rules: { face: 'warn' } }); wn.begin(); wn.net.turnFace.f_keep0001.allow = 1; wn.T(180, true); wn = [wn.pat.rot, wn.net.turnFace.f_keep0001.used, wn.mine().slice(-1)[0], wn.out.toasts, wn.out.bells];
            off = mkF({ rules: { face: 'off' } }); off.begin(); off.T(180, true); off.T(0, true); off.T(90, true); off = [off.pat.rot, off.net.turnFace.f_keep0001.used, off.mine()];
            bt = mkF(null, 'turn'); bt.begin(); bt.T(180, true); bt = [bt.pat.rot, bt.net.turnFace.f_keep0001.used, bt.mine().slice(-1)[0]];
            hx = mkF(); hx.map.meta.gridType = 'hex'; hx.begin(); hx.T(120, true); const hxU = hx.net.turnFace.f_keep0001.used; hx.T(120, true); hx.T(480, true); const hxN = [hx.pat.rot, hx.net.turnFace.f_keep0001.used]; hx.T(120.3, true); hx = [hxU, hxN, hx.pat.rot, hx.net.turnFace.f_keep0001.used];
            ng = mkF(); ng.map.meta.gridType = 'off'; ng.begin(); ng.T(170, true); ng = [ng.pat.rot, ng.net.turnFace.f_keep0001.used];
            ot = mkF({ turn: 0, rules: { order: 'off' } }); ot.begin(); ot.T(180, true); ot = [ot.pat.rot, j(ot.net.turnFace), ot.mine()];
            gm = mkF(null, 'gm'); gm.begin(); gm.T(180, true); gm.T(0, true); gm.T(180, true); gm = [gm.pat.rot, j(gm.net.turnFace), gm.mine()];
            both = mkF(); both.begin(); both.T(90, true, 100); both = [both.pat.x, both.pat.rot, both.net.turnMove.f_keep0001.moved, both.net.turnFace.f_keep0001.used, both.mine().slice(-1)[0], both.out.notes().filter(n => /^Moved/.test(n))];
            // the review of 2026-11-11
            h1 = mkF(); h1.begin(); h1.T(90, false, 50); const h1Live = [h1.pat.x, h1.pat.rot]; h1.T(90, true, 500); h1 = [h1Live, h1.pat.x, h1.pat.rot, h1.net.turnFace.f_keep0001.used, h1.out.sent.filter(m => m.type === 'pos').map(m => [m.x, m.rot, m.final])];
            mid = mkF(); mid.begin(); mid.net.turnFace.f_keep0001.allow = 1; mid.T(180, false); const midA = [mid.pat.rot, mid.net.turnFace.f_keep0001.used]; mid.T(90, false); const midB = [mid.pat.rot, mid.net.turnFace.f_keep0001.used]; mid.T(90, true); mid = [midA, midB, mid.pat.rot, mid.net.turnFace.f_keep0001.used];
            rl = mkF(); rl.begin(); rl.net.turnFace.f_keep0001.allow = 1; rl.T(90, false); const rlLive = rl.pat.rot, rlB = rl.out.bcast.length; rl.CR(180); rl = [rlLive, rl.pat.rot, rl.net.turnFace.f_keep0001.used, rl.out.bcast.slice(rlB).map(b => [b[0], b[1], b[3]]), rl.out.notes().filter(n => /turns back/.test(n)).length];
            ar = mkF(); ar.begin(); ar.api.pos({ type: 'pos', campId: 'c1', itemId: 'm1', wbId: 't_p', x: 0, y: 0, rot: 0, front: 90, final: true, a: 1 }, ar.conn); ar = [ar.pat.rot || 0, ar.pat.front, ar.net.turnFace.f_keep0001.used];
            lo = mkF(); lo.begin(); lo.T(90, false); lo.CR(90); lo = [lo.pat.rot, lo.net.turnFace.f_keep0001.used, lo.out.notes().filter(n => /Turned/.test(n))];
            lw = mkF({ rules: { face: 'warn' } }); lw.begin(); lw.net.turnFace.f_keep0001.allow = 1; lw.T(90, false); lw.CR(180); lw = [lw.pat.rot, lw.net.turnFace.f_keep0001.used, lw.out.toasts.length, lw.out.bells.length];
            // the check of 2026-11-11
            sq = mkF(); sq.begin(); sq.net.turnFace.f_keep0001.allow = 9; sq.T(120, true); const sqA = sq.net.turnFace.f_keep0001.used; sq.T(135, true); sq = [sqA, sq.net.turnFace.f_keep0001.used];
            tiny = mkF(); tiny.begin(); tiny.T(0.0005, true); tiny = [tiny.pat.rot, tiny.net.turnFace.f_keep0001.used];
            cl = mkF(); cl.begin(); cl.net.turnFace.f_keep0001.allow = 1; cl.T(90, false); cl.T(180, false); cl = [cl.pat.rot, cl.net.turnFace.f_keep0001.used, cl.out.bcast.length];
            f2 = mkF({ rules: { walls: 'refuse' } }); f2.begin(); f2.T(0, false, 50); const f2Out = { conn: f2.conn }; { const cp = JSON.parse(JSON.stringify(f2.map.whiteboard)); const t = cp.find(w => w.id === 't_p'); t.x = 1100; t.rot = 90; f2.api.patchOut({ type: 'item', campId: 'c1', itemId: 'm1', item: { type: 'map', whiteboard: cp } }, f2Out); } f2 = [f2.pat.x, f2.pat.rot, f2.net.turnFace.f_keep0001.used, f2Out.whole === true];
            sn = mkF(); sn.begin(); sn.T(90, true); sn.T(270, true); const snN = sn.out.notes().length, snOut = { conn: sn.conn }; { const cp = JSON.parse(JSON.stringify(sn.map.whiteboard)); cp.find(w => w.id === 't_p').rot = 270; sn.api.patchOut({ type: 'item', campId: 'c1', itemId: 'm1', item: { type: 'map', whiteboard: cp } }, snOut); } sn = [sn.pat.rot, snOut.whole === true, sn.out.notes().length - snN];
            ro = mkF(); ro.begin(); ro.net.turnFace.f_keep0001.allow = 1; ro.T(90, false); const roB = ro.out.bcast.length, roOut = { conn: ro.conn }; { const cp = JSON.parse(JSON.stringify(ro.map.whiteboard)); cp.find(w => w.id === 't_p').rot = 180; ro.api.patchOut({ type: 'item', campId: 'c1', itemId: 'm1', item: { type: 'map', whiteboard: cp } }, roOut); } ro = [ro.pat.rot, roOut.whole === true, ro.out.bcast.slice(roB).map(b => [b[0], b[3]])];
        } finally { if (!hadAck) delete globalThis.withAck; }
        check('1.6.2 the facing limit, what its review found (backlog 70, run for real): a drop whose MOVE is refused goes back to the facing its drag began with too, for the mover as well, and counts no turn; mid-drag a turn past what is left is not applied, a turn within it is followed, and nothing is counted before the release; a map copy that closes a drag the host followed and is refused shows everyone the facing it goes back to, with its note to each of the player\'s connections; a token turned by its front is counted as one turned by its rotation; a lost final closed by a copy within the limit is counted with its note to each connection, and under Warn one past it goes through with a word and a bell to the GM',
            j(h1) === j([[50, 90], 0, 0, 0, [[0, 0, true]]]) && j(mid) === j([[0, 0], [90, 0], 90, 1]) && j(rl) === j([90, 0, 0, [['t_p', 0, 'all']], 2])
            && j(ar) === j([0, 90, 1]) && j(lo) === j([90, 1, ['Turned: 1 facing change left.', 'pA2:Turned: 1 facing change left.']]) && j(lw) === j([180, 2, 1, 1]), j([h1, mid, rl, ar, lo, lw]));
        check('1.6.2 the facing limit, what its check found (backlog 70, run for real): part of a grid step is a whole one, so 120 degrees on squares is two changes; a turn of any size, however small, is at least one; mid-drag a turn past what is left keeps the token where it faces now, not where the drag began; a map copy that a Refuse rule stops from moving but that turns the token within the limit answers its sender with the map whole, the turn counted; a refused copy that repeats a final already refused answers with the map whole and no second note; a refused copy after a drag the host followed shows the others the facing it goes back to, its sender excepted',
            j(sq) === j([2, 3]) && j(tiny) === j([0.0005, 1]) && cl[0] === 90 && cl[1] === 0 && j(f2) === j([0, 90, 1, true]) && j(sn) === j([90, true, 0]) && j(ro) === j([0, true, [['t_p', 'others']]]), j([sq, tiny, cl, f2, sn, ro]));
        check('1.6.2 the facing limit, the review (source): a refused copy always answers its sender with the map whole, the relay is asked only where the host followed the drag, a put-back takes the drag\'s facing with it, Token facing off begins no count, and a player\'s map copy waits for an open turn gesture of their own that is no older than ten seconds',
            patT.includes("w.rot = Number(drF.rot) || 0; w.front = Number(drF.front) || 0; if (out) out.whole = true;") && patT.includes("if ((wasR !== w.rot || wasFr !== w.front) && typeof faceRelay === 'function') faceRelay(camp, liveItem, msg, lw, w, out && out.conn);")
            && posT.includes("if (to && typeof to.rot === 'number') { w.rot = to.rot; w.front = Number(to.front) || 0; }") && tmT.includes("if (!row || typeof row.tokId !== 'string' || !vt || !vt.on('turns') || !rl('turning')) return;")
            && src.includes("if (net.role === 'client' && typeof tgL === 'number' && tgL > 0 && Date.now() - tgL < 10000) { net._heldSave = true; return; }")
            && (() => { const wb = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'whiteboard.js'), 'utf8'); return wb.includes("window.wpTurnGesture = on === true ? Date.now() : 0;") && wb.includes("if (n && n._heldSave === true && typeof n.onLocalSave === 'function') n.onLocalSave();") && (wb.match(/turnGesture\(true\);/g) || []).length === 2 && (wb.match(/window\.wpTurnGesture = 0;/g) || []).length === 3 && (wb.match(/turnGesture\(false\)/g) || []).length === 6 && wb.includes("handle.addEventListener('pointercancel', rotCancel); handle.addEventListener('lostpointercapture', rotCancel);") && wb.includes("if (!turning) return; if (!turning.moved) { turning = null; turnGesture(false); return; } turnUp(e);"); })());
        check('1.6.2 the facing limit (backlog 70; the pos gate, the map-copy path and the turn\'s start, run for real on the real systemcore): a turn\'s start works out how many facing changes the token of a player\'s own character has, through the players\' view, and tells each of their connections; a quarter turn on squares is one change, counted with a note of what is left; a turn past what is left goes back to the facing it began with, for the mover too as the answer to that very action, with why, and the map copy that repeats it changes nothing and says nothing more; a drag of the token\'s arrow is followed live and judged at its release from where it began',
            st0 === j({ rowId: 'r_p', tokId: 't_p', used: 0, allow: 2 }) && j(n0.filter(n => /facing/.test(n))) === j(['You may change facing 2 times this turn.', 'pA2:You may change facing 2 times this turn.'])
            && j(r1) === j([90, 1, 'Turned: 1 facing change left.']) && j(r2) === j([90, 1, 'That is 2 facing changes; you have 1 left: your token turns back.']) && j(backs) === j([[90, true, 7]]) && j(r3) === j([90, 1, 0])
            && j(r4) === j([180, 180, 2, 'Turned: 0 facing changes left.']) && j(r5) === j([180, 2, 'That is 1 facing change; you have 0 left: your token turns back.']) && j(r3n) === j([180, 2]), j([st0, n0, r1, r2, backs, r3, r4, r5, r3n]));
        check('1.6.2 the facing limit, its other ways (backlog 70, run for real): a drag whose final was lost is closed by the map copy, judged from where the drag began and turned back with a note to each of the player\'s connections; under Warn a turn past the limit goes through, counted, with a note to them and a word and a bell to the GM; under Off nothing is counted or said; a system that counts each turn as one counts a half turn once; on hexes a step is a sixth of a turn, the same facing sent again or a whole turn round is no change, and any real turn, however small, is at least one, so small turns never add up to a free one; on a map with no grid each turn is one; off the token\'s own turn nothing is counted; a limit that reads a GM-only value is no limit for players; a move and a turn in one drop are each counted and said',
            j(g1) === j([0, 0, ['That is 2 facing changes; you have 1 left: your token turns back.', 'pA2:That is 2 facing changes; you have 1 left: your token turns back.']])
            && j(wn) === j([180, 2, 'That went 1 facing change past what your turn allows.', ['A token turned past its facing changes.'], [['c_p', 'Turn', 'Turned past its facing changes.']]]) && j(off) === j([90, 0, []])
            && j(bt) === j([180, 1, 'Turned: 1 facing change left.']) && j(hx) === j([2, [480, 2], 480, 2]) && j(ng) === j([170, 1]) && j(ot) === j([180, '{}', []]) && j(gm) === j([180, '{}', []])
            && j(both) === j([100, 90, 2, 1, 'Turned: 1 facing change left.', ['Moved 2 squares (10 ft); 4 squares (20 ft) left.']]), j([g1, wn, off, bt, hx, ng, ot, gm, both]));
        check('1.6.2 the facing limit is wired (backlog 70, source): the pos gate asks it after the move limit and sends the turn back to the mover after the relay; the map-copy path asks the same judge before the facing lands; the turn\'s start begins it; the table\'s mode is read as the move\'s is',
            /if \(turnLimitCheck\(camp, map, w, frW, msg, conn\) === 'stop'\) return;[^\n]*\n\s*var fbW = typeof turnFaceCheck === 'function' && turnFaceCheck\(camp, map, w, frW, msg, conn\) === 'back';/.test(posT)
            && /if \(frW\.sk === undefined\) frW\.sk = skW;[^\n]*\n\s*if \(\(fbW \|\| doorW\) && conn && conn\.open && typeof conn\.send === 'function' && typeof withAck === 'function'\) \{ try \{ conn\.send\(withAck\(msg, conn, aIn\)\); \} catch \(e\) \{ sendFailed\(e\); \} \}/.test(posT)
            && /if \(lw\.isChar && typeof faceJudge === 'function'\) \{[^\n]*\n[^\n]*\n[^\n]*\n[^\n]*\n[^\n]*\n[^\n]*\n\s*\}\n[^\n]*\n[^\n]*\n\s*\}\n\s*if \(lw\.x !== w\.x \|\| lw\.y !== w\.y \|\| \(lw\.rot \|\| 0\) !== \(w\.rot \|\| 0\)/.test(patT)
            && /if \(typeof turnFaceStart === 'function'\) \{ try \{ turnFaceStart\(mapId, c\); \} catch \(e\) \{ console\.error\(e\); \} \}/.test(tmT) && /var fm = moveMode\(camp, 'face'\); if \(fm === 'off'\) return null;/.test(posT));
    }
    // difficult terrain T2: the fog tells the move's own length beside its cost (moveCells' out.len); here a move ending past x 100 costs double
    const terrMc = (mp, tw, fx, fy, tx, ty, dg, outL) => { const l = Math.max(Math.abs(tx - fx), Math.abs(ty - fy)) / 50; if (outL) outL.len = l; return tx > 100 ? l * 2 : l; };
    const tA = mkT({ allow: 4, moveCells: terrMc }); tA.P('t_p', 150, 0, true);
    const tB = mkT({ allow: 8, moveCells: terrMc }); tB.P('t_p', 150, 0, true);
    const tN = mkT({ allow: 8, moveCells: terrMc }); tN.P('t_p', 100, 0, true);
    const tC = mkT({ allow: 8, moveCells: terrMc }); tC.P('t_p', 50, 0); tC.C('t_p', 150, 0);
    const tD = mkT({ allow: 4, moveCells: terrMc }); tD.P('t_p', 50, 0); tD.C('t_p', 150, 0);
    check('terrain T2 the move limit counts a move\'s cost (host, run for real): a drop that difficult terrain makes cost past the move goes back, its note naming the cost; one within counts its cost, its note naming both the length and the cost; plain ground as before; the map copy that closes a drag alike, refused or counted, to each of the player\'s connections',
        tA.pat.x === 0 && j(tA.out.notes()) === j(['That costs 6 squares (30 ft) with difficult terrain; you have 4 squares (20 ft) left.'])
        && tB.pat.x === 150 && tB.net.turnMove.f_keep0001.moved === 6 && j(tB.out.notes()) === j(['Moved 3 squares (15 ft), costing 6 squares (30 ft) with difficult terrain; 2 squares (10 ft) left.'])
        && tN.net.turnMove.f_keep0001.moved === 2 && j(tN.out.notes()) === j(['Moved 2 squares (10 ft); 6 squares (30 ft) left.'])
        && tC.pat.x === 150 && tC.net.turnMove.f_keep0001.moved === 6 && j(tC.out.notes()) === j(['Moved 3 squares (15 ft), costing 6 squares (30 ft) with difficult terrain; 2 squares (10 ft) left.', 'pA2:Moved 3 squares (15 ft), costing 6 squares (30 ft) with difficult terrain; 2 squares (10 ft) left.'])
        && tD.pat.x === 0 && j(tD.out.notes()) === j(['That costs 6 squares (30 ft) with difficult terrain; you have 4 squares (20 ft) left.', 'pA2:That costs 6 squares (30 ft) with difficult terrain; you have 4 squares (20 ft) left.']),
        j([tA.out.notes(), tB.out.notes(), tN.out.notes(), tC.out.notes(), tD.out.notes()]));
    // whole cells (owner, 2026-10-01): the real moveCells (fog.js, sliced, over the real fogcore and systemcore) in the real pos gate and patch
    // path — a token standing off the grid is counted from the cell it stands in to the cell it lands in; a final that moved nothing says nothing
    const FCm = await import(url('fogcore.js')), fogM = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'fog.js'), 'utf8').replace(/\r\n/g, '\n');
    const realMc = new Function('core', 'window', 'gridForMap', 'terrainFor', fogM.slice(fogM.indexOf('function moveCells('), fogM.indexOf('// GM clicks a door while in fog mode')) + '\nreturn moveCells;')(() => FCm, { wpSystemCore: Sx }, m => FCm.gridFor(m.meta.gridType), () => null);
    const offAt = (o, x, y) => { const W = mkT(Object.assign({ moveCells: realMc }, o)); W.pat.x = x; W.pat.y = y; return W; };
    const g1 = offAt({ allow: 4 }, 100, 321.7); g1.P('t_p', 100, 400, true);                                   // straight down, off the lattice: 2 squares (1.6 by the old raw count)
    const g2 = offAt({ allow: 4 }, 100, 321.7); g2.P('t_p', 100, 360); g2.C('t_p', 100, 400);                  // the same through the map copy that closes a lost final
    const g3 = offAt({ allow: 4 }, 100, 321.7); g3.P('t_p', 100, 580, true);                                   // six squares: past the move, back where it began
    const g4 = offAt({ allow: 4 }, 0, 0); g4.P('t_p', 20, 20, true); g4.P('t_p', 20, 20, true); g4.C('t_p', 24, 24);   // a shuffle inside its own cell, a turn in place, a copy of the same
    const g5 = offAt({ allow: 4, rules: { move: 'warn' }, moved: 9 }, 0, 0); g5.P('t_p', 0, 0, true);          // already past its move (Warn), turning in place: nothing more is said
    const g6 = offAt({ allow: 4, moved: 9 }, 10, 10); g6.P('t_p', 12, 14, true); g6.P('t_p', 12, 14); g6.C('t_p', 16, 18);   // Refuse, already past its move: a shuffle in its cell is no move to refuse
    check('whole cells in the move limit (host, the real moveCells in the real pos gate and patch path): a token standing off the grid that moves straight down two squares is told "Moved 2 squares", and so is the map copy that closes a lost final (each of the player\'s connections); six squares past a move of four goes back where it stood, off the grid as it was; a shuffle inside its own cell, a turn in place and a copy of the same count nothing and say nothing, even for a token already past its move, which is not sent back for a move of nothing either',
        g1.net.turnMove.f_keep0001.moved === 2 && j(g1.out.notes()) === j(['Moved 2 squares (10 ft); 2 squares (10 ft) left.'])
        && g2.net.turnMove.f_keep0001.moved === 2 && j(g2.out.notes()) === j(['Moved 2 squares (10 ft); 2 squares (10 ft) left.', 'pA2:Moved 2 squares (10 ft); 2 squares (10 ft) left.'])
        && g3.pat.x === 100 && g3.pat.y === 321.7 && g3.net.turnMove.f_keep0001.moved === 0 && j(g3.out.notes()) === j(['That is 6 squares (30 ft); you have 4 squares (20 ft) left.'])
        && g4.net.turnMove.f_keep0001.moved === 0 && j(g4.out.notes()) === '[]' && g4.out.toasts.length === 0 && g5.net.turnMove.f_keep0001.moved === 9 && j(g5.out.notes()) === '[]' && g5.out.toasts.length === 0 && g5.out.bells.length === 0
        && g6.pat.x === 16 && g6.pat.y === 18 && g6.net.turnMove.f_keep0001.moved === 9 && j(g6.out.notes()) === '[]',
        j([g1.out.notes(), g2.out.notes(), g3.out.notes(), [g3.pat.x, g3.pat.y], g4.out.notes(), g5.out.notes(), g5.out.toasts]));
    const w = mkT({ allow: 4, rules: { move: 'warn' } }); w.P('t_p', 300, 0, true);
    const bo = mkT({ turn: 0, rules: { order: 'warn' } }); bo.P('t_p', 50, 0, true); const br = mkT({ turn: 0 }); br.P('t_p', 50, 0, true);
    const bp = mkT({ allow: 4 }); bp.P('t_p', 50, 0); bp.C('t_p', 250, 0); const bs = mkT(); bs.api.start('m1', bs.net.combats.f_keep0001);
    check('The bell (Bell-b): every turn note of the move gates names the token\'s character — Your turn, a counted or refused move, out of turn, and the map copy\'s note to each of the player\'s connections; Warn past the move or out of turn also notes it in the GM\'s bell; a refusal does not',
        [w, bo, br, bp, bs].every(x => { const tn = x.out.sent.filter(m => m.type === 'turn-note'); return tn.length > 0 && tn.every(m => m.charId === 'c_p'); }) && bp.out.sent.filter(m => m.type === 'turn-note').length === 2
        && j(w.out.bells) === j([['c_p', 'Turn', 'Moved 2 squares (10 ft) past the move.']]) && j(bo.out.bells) === j([['c_p', 'Turn', 'Moved out of turn.']]) && !br.out.bells.length && !bp.out.bells.length, j([w.out.bells, bo.out.bells, bs.out.sent]));
    const f = mkT({ allow: 4, rules: { move: 'off' } }); f.P('t_p', 300, 0, true);
    const g = mkT({ allow: 4 }); g.P('t_f', 400, 500, true);
    const nt = mkT({ allow: 4, turns: false }); nt.P('t_p', 300, 0, true);
    check('T3b the move limit\'s modes: warn lets it past with a note to the player and the GM; off neither stops nor counts nor notes; a token outside the combat and a table without turn-based combat are free',
        w.pat.x === 300 && j(w.out.notes()) === j(['That went 2 squares (10 ft) past your move.']) && w.out.toasts.length === 1 && f.pat.x === 300 && !f.out.notes().length && f.net.turnMove.f_keep0001.moved === 0
        && g.free.x === 400 && !g.out.notes().length && nt.pat.x === 300 && !nt.out.notes().length, j([w.out.notes(), w.out.toasts, f.out.notes()]));
    // out of turn
    const o1 = mkT({ turn: 0 }); o1.P('t_p', 50, 0); o1.P('t_p', 100, 0, true); o1.C('t_p', 100, 0);
    const o2 = mkT({ turn: 0, rules: { order: 'warn' } }); o2.P('t_p', 100, 0, true);
    const o3 = mkT({ turn: 0, rules: { order: 'off' } }); o3.P('t_p', 100, 0, true);
    const o4 = mkT({ turn: 0 }); o4.C('t_p', 100, 0);
    const o5 = mkT({ turn: 0 }); o5.P('t_p', 50, 0); const o5mid = o5.pat.x;
    const wl = mkT(); wl.C('t_p', 1000, 0);
    const b3 = mkT({ allow: 4 }); b3.P('t_p', 50, 0); b3.C('t_p', 150, 0); b3.P('t_p', 200, 0, true);
    check('T3b out of turn: a token in the combat moves only on its turn — refused, not applied mid-drag and put back with one note (its map copy after moves nothing); a copy alone is refused too; warn lets it with notes to them and the GM; off lets it be. A map copy alone crossing a wall is put back with its note; a copy closes its drag, so the next drag begins where it landed',
        o1.pat.x === 0 && j(o1.out.notes()) === j(['It is not your turn: your token goes back.']) && o4.pat.x === 0 && o4.out.notes().length === 2 && o5mid === 0
        && wl.pat.x === 0 && /A wall is in the way/.test(wl.out.notes()[0] || '') && b3.pat.x === 200 && b3.net.turnMove.f_keep0001.moved === 4
        && o2.pat.x === 100 && j(o2.out.notes()) === j(['You moved out of turn.']) && o2.out.toasts.length === 1 && o3.pat.x === 100 && !o3.out.notes().length, j([o1.out.notes(), o4.out.notes(), o2.out.notes()]));
    // the turn's start: the allowance through the player's view
    const s1 = mkT(); s1.api.start('m1', s1.net.combats.f_keep0001);
    const s2 = mkT(); s2.api.start('m1', Object.assign({}, s2.net.combats.f_keep0001, { turn: 0 }));
    const s3 = mkT({ system: Sx.cleanSystem(Object.assign({}, sysT, { combat: { turn: { move: 'GMFig * 30', unit: 'ft' } } }), { F: Fx, gmView: true }) }); s3.api.start('m1', s3.net.combats.f_keep0001);
    const s4 = mkT({ turns: false }); s4.api.start('m1', s4.net.combats.f_keep0001);
    check('T3b the turn\'s start (turnMoveStart, run for real): the player\'s token gets its system\'s Move per turn as the map\'s cells (Speed 30 ft on 5 ft squares: 6) and each of its player\'s connections hears it; an NPC\'s token has no state; a move reading a GM-only value, or turn-based combat off, sets no limit',
        j(s1.net.turnMove.f_keep0001) === j({ rowId: 'r_p', tokId: 't_p', moved: 0, allow: 6 }) && j(s1.out.notes()) === j(['Your turn: 6 squares (30 ft) to move.', 'pA2:Your turn: 6 squares (30 ft) to move.'])
        && !('f_keep0001' in s2.net.turnMove) && s3.net.turnMove.f_keep0001.allow === null && !s3.out.notes().length && !('f_keep0001' in s4.net.turnMove), j([s1.net.turnMove, s1.out.notes(), s2.net.turnMove, s3.net.turnMove]));
    // fold 2's review: each fight keeps its own turn's move (net.turnMove by the fight's id). Pat moves 2 of his 4 squares in the first fight on the
    // map; a turn starting in a second fight there (his other token's) leaves his allowance and what he moved as they were, and his next move counts on
    const tw = mkT({ allow: 4 }); tw.P('t_p', 50, 0); tw.P('t_p', 100, 0, true);
    tw.net.combats.f_keep0002 = { id: 'f_keep0002', mapId: 'm1', round: 1, turn: 0, rows: [{ id: 'r_f', tokId: 't_f' }] }; tw.api.start('m1', tw.net.combats.f_keep0002);
    const twA = j(tw.net.turnMove.f_keep0001), twB = j(tw.net.turnMove.f_keep0002); tw.P('t_p', 150, 0, true); const twA2 = tw.net.turnMove.f_keep0001 && tw.net.turnMove.f_keep0001.moved;
    check('fold 2\'s review (turnMoveStart and the pos gate, run for real): each fight keeps its own turn\'s move, by its own id — a turn starting in a second fight on the map leaves the first fight\'s allowance and what was moved in it as they were, and the next move there counts on from them',
        twA === j({ rowId: 'r_p', tokId: 't_p', moved: 2, allow: 4 }) && twB === j({ rowId: 'r_f', tokId: 't_f', moved: 0, allow: null }) && twA2 === 3 && !('m1' in tw.net.turnMove), j([twA, twB, twA2, tw.net.turnMove]));
})());

// Turn-based combat T4 (D4, D5): the actions a turn allows — the host's spend (net.js, run for real), the refill at a turn's start and the clearing
// at the combat's end, the player's counts on the wire (their connections only), and a client's intake (the synced host only, cleaned)
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js'));
    {   // 1.6.0 A move by giving up an action (combat.turn.run and runCost): the host's gates, run for real (invented data: Pat, Speed, Dash)
        const Fx5 = await import(url('formula.js'));
        const line5 = k => { const i = src.indexOf(k); return src.slice(i, src.indexOf('\n', i)); };
        const pos5 = between('// [netcheck:pos-start]', '// [netcheck:pos-end]', 'pos'), pat5 = between('// [netcheck:patch-start]', '// [netcheck:patch-end]', 'patch', 'netfog.js'), tm5 = between('// [netcheck:turnmove-start]', '// [netcheck:turnmove-end]', 'turnmove'), ta5 = between('// [netcheck:turnacts-start]', '// [netcheck:turnacts-end]', 'turnacts');
        const cl5 = src.slice(src.indexOf('function cleanElevation('), src.indexOf('function sanitizeItem('));
        const help5 = ['function peerProfileId(', 'function fxLib(', 'function itemLib('].map(line5).join('\n') + '\n';
        const sys5 = (o) => Sx.cleanSystem(Object.assign({ v: 1, name: 'R', rolls: [], sheet: { sections: [] }, fields: [{ id: 'f_sp', key: 'Speed', kind: 'number', vis: 'all', def: 5 }, { id: 'f_ds', key: 'Dash', kind: 'number', vis: 'all', def: 10 }, { id: 'f_dz', key: 'Dazed', kind: 'number', vis: 'all', def: 0 }, { id: 'f_gm', key: 'Secret', kind: 'number', vis: 'gm', def: 20 }],
            combat: { turn: Object.assign({ move: 'Speed', unit: 'cells', run: 'Dash', runCost: 'action', acts: [{ key: 'Action', n: 1, nf: '1 - Dazed' }, { key: 'Bonus', n: 1 }] }, o || {}) } }), { F: Fx5, gmView: true });
        const mk5 = o => {
            o = o || {};
            const pat = { id: 't_p', isChar: true, charId: 'c_p', ownerId: 'u_a', x: 0, y: 0, w: 50, h: 50 }, map = { type: 'map', meta: { gridType: 'square' }, whiteboard: [pat] };
            const camp = { id: 'c1', items: { m1: map }, system: o.system || sys5(), turnRules: o.rules || {}, chars: { c_p: { id: 'c_p', name: 'Pat', ownerId: 'u_a', values: o.values || {} } } };
            const out = { sent: [], toasts: [], bells: [] }, conn = { peer: 'pA', open: true, send: m => out.sent.push(m) }, fight = { id: 'f_keep0001', mapId: 'm1', round: 1, turn: 0, rows: [{ id: 'r_p', tokId: 't_p' }] };
            const net = { role: 'host', paused: false, roster: { pA: { id: 'u_a', location: 'm1' } }, conns: [conn], tokenDropped() {}, combats: { f_keep0001: fight } };
            const win = { wpVtt: { on: () => true, campaignOn: () => true }, wpFog: { moveBlocked: () => false, moveCells: (mp, w, fx, fy, tx, ty) => Math.max(Math.abs(tx - fx), Math.abs(ty - fy)) / 50 }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx5, gmView: false }) }, wpFormula: Fx5 };
            const api = new Function('state', 'net', 'window', 'peerPaused', 'allow', 'checkRoomHandouts', 'applyPosToDom', 'broadcastPos', 'toast', 'saveRemoteSoon', 'sendFailed', 'setTimeout', 'playerStroke', 'SC', 'getActiveCampaign', 'bellOut',
                cl5 + ownKeySrc + help5 + pos5 + '\n' + pat5 + '\n' + tm5 + '\n' + ta5 + '\n' + ordersSrc + '\nreturn { pos: function(m, c) { return handlePos(m, c); }, patch: function(m) { return applyClientItemFiltered(m, { id: "u_a" }); }, start: function(c) { turnMoveStart("m1", c); turnActsStart("m1", c); }, spend: actSpend };')(
                { appState: { campaigns: { c1: camp } } }, net, win, () => false, () => true, () => {}, () => {}, () => {}, t => out.toasts.push(t), () => {}, e => { throw e; }, f => f(), () => null, () => Sx, () => camp, (cid, note) => out.bells.push([cid, note.text]));
            api.start(fight);
            const st = () => net.turnMove.f_keep0001, go = (x, fin) => api.pos({ type: 'pos', campId: 'c1', itemId: 'm1', wbId: 't_p', x, y: 0, final: fin !== false }, conn), press = (k, look) => api.spend(camp, 'c_p', net.roster.pA, k, conn, 'Pat', look);
            const C = x => { const copy = JSON.parse(JSON.stringify(map.whiteboard)); copy[0].x = x; api.patch({ type: 'item', campId: 'c1', itemId: 'm1', item: { type: 'map', whiteboard: copy } }); };
            out.notes = () => out.sent.filter(m => m.type === 'turn-note').map(m => m.text);
            return { out, net, camp, pat, st, go, press, C };
        };
        const a5 = mk5(); const aStart = a5.st().allow, aNote = a5.out.notes()[0]; a5.go(350); const aRan = a5.st().ran, aSpent = a5.net.turnSpent.c_p.Action, aAllow = a5.st().allow, aNote2 = a5.out.notes()[1];
        a5.go(500); const aAt = a5.pat.x; a5.go(550); const aPast = a5.pat.x, aRefused = a5.press('Action'), aOther = a5.press('Bonus');
        check('1.6.0 run: a free action gives the turn the run (10): moving 7 spends it, the turn keeps the 10, 11 goes back, and a roll that costs that action is then refused by the Move limit while another action stands',
            aStart === 10 && aNote === 'Your turn: 5 squares (25 ft) to move, or 10 squares (50 ft) if you give up your Action.' && aRan === true && aSpent === 1 && aAllow === 10 && /That spent your Action\.$/.test(aNote2) && aAt === 500 && aPast === 500 && aRefused === 'You gave up your Action to move further.' && aOther === '' && a5.net.turnSpent.c_p.Action === 1 && a5.net.turnSpent.c_p.Bonus === 1, j([aStart, aNote, aRan, aSpent, aAllow, aNote2, aAt, aPast, aRefused, aOther, a5.net.turnSpent]));
        const b5 = mk5(); const bPress = b5.press('Action'), bAllow = b5.st().allow; b5.go(300); const bRefused = b5.pat.x; b5.go(250); const bAt = b5.pat.x, bRan = b5.st().ran === undefined;
        const c5 = mk5(); c5.go(150); const cPress = c5.press('Action'), cAllow = c5.st().allow, cLeftNote = c5.out.notes().length; c5.go(300); const cAt = c5.pat.x; c5.go(250); const cDone = c5.pat.x;
        check('1.6.0 run: the action spent first leaves the move alone, 5 in all, before and after the attack',
            bPress === '' && bAllow === 5 && bRefused === 0 && bAt === 250 && bRan && cPress === '' && cAllow === 5 && cLeftNote >= 2 && cAt === 150 && cDone === 250, j([bPress, bAllow, bRefused, bAt, cPress, cAllow, cAt, cDone]));
        const d5 = mk5({ values: { f_dz: 1 } }), dNote = d5.out.notes()[0], dAllow = d5.st().allow; d5.go(300); const dAt = d5.pat.x;
        const e5 = mk5({ values: { f_ds: 5 } }), eKeys = Object.keys(e5.st()).sort().join(), eNote = e5.out.notes()[0];
        check('1.6.0 run: a turn whose count gives none of that action has the move alone, and a run no further than the move offers nothing',
            dAllow === 5 && dNote === 'Your turn: 5 squares (25 ft) to move.' && dAt === 0 && e5.st().allow === 5 && eNote === 'Your turn: 5 squares (25 ft) to move.' && e5.st().ran === undefined, j([dAllow, dNote, dAt, eKeys, eNote]));
        const w5 = mk5({ rules: { move: 'warn' } }); w5.go(350); const wPress = w5.press('Action'), wRn = w5.out.sent.filter(m => m.type === 'acts-left').pop();
        const wA = mk5({ rules: { move: 'refuse', acts: 'warn' } }); wA.go(350); const waPress = wA.press('Action');
        const o5 = mk5({ rules: { move: 'off' } }); o5.go(350); const oRan = o5.st().ran, oPress = o5.press('Action');
        check('1.6.0 run: Warn lets the roll through with a note to them and the GM, and tells their app so that its button is not grayed by the Actions rule; the Move limit, not the Actions rule, says; Off counts no move and no run',
            wPress === '' && w5.out.notes().pop() === 'Action: used after giving it up to move further.' && w5.out.toasts.length === 1 && w5.net.turnSpent.c_p.Action === 2 && wRn.rn === 'Action' && !/used after/.test(wA.out.notes().join()) && waPress === 'You gave up your Action to move further.' && oRan === undefined && oPress === '' && o5.pat.x === 350, j([wPress, w5.out.notes(), wRn, waPress, oRan, oPress]));
        const f5 = mk5({ rules: { acts: 'off' } }); const fPress = f5.press('Action'), fAllow = f5.st().allow, fRan = f5.st().ran; f5.go(300); const fAt = f5.pat.x;
        const g5 = mk5({ rules: { acts: 'off' } }); g5.go(350); const gPress = g5.press('Action');
        check('1.6.0 run: with actions not counted the turn still reads what its action went to: a press takes it down to the move, a run past the move still meets the Move limit',
            fPress === '' && fAllow === 5 && fRan === undefined && fAt === 0 && gPress === 'You gave up your Action to move further.', j([fPress, fAllow, fAt, gPress]));
        const h5 = mk5(); h5.go(50); h5.C(350); const hSt = h5.st(), hAt = h5.pat.x;
        check('1.6.0 run: a move that lands through a map copy counts as a move does, past the move it spends the action', hAt === 350 && hSt.ran === true && hSt.moved === 7 && h5.net.turnSpent.c_p.Action === 1, j([hAt, hSt, h5.net.turnSpent]));
        const i5 = mk5({ system: sys5({ run: 'Secret' }) }), j5 = mk5({ system: sys5({ run: undefined, runCost: undefined }) }), k5 = mk5({ system: sys5({ run: '1d6' }) });
        check('1.6.0 run: one read from a GM-only value leaves players the one move, a turn with none keeps the four keys it always had and its note, and a formula that rolls dice offers nothing',
            i5.st().allow === 5 && i5.st().run === undefined && j(Object.keys(j5.st()).sort()) === j(['allow', 'moved', 'rowId', 'tokId']) && j5.out.notes()[0] === 'Your turn: 5 squares (25 ft) to move.' && k5.st().allow === 5 && k5.st().run === undefined, j([i5.st(), j5.st(), k5.st()]));
        const cf5 = new Function(fnSrc('function cleanFightBody(', '\n// [netcheck:notepad-start]', 'cleanFightBody') + '\nreturn cleanFightBody;')();
        const kept = cf5({ round: 1, turn: 0, rows: [{ id: 'r', name: 'A' }], mv: { m: 1, a: 10, w: 5 } }, 'm1'), plain = cf5({ round: 1, turn: 0, rows: [{ id: 'r', name: 'A' }], mv: { m: 1, a: 10, w: 'x' } }, 'm1');
        check('1.6.0 run: a player\'s app keeps how far the move goes before it spends the action only as a number', kept.mv.w === 5 && !('w' in plain.mv), j([kept.mv, plain.mv]));
    }
    const posA = between('// [netcheck:pos-start]', '// [netcheck:pos-end]', 'pos'), taA = between('// [netcheck:turnacts-start]', '// [netcheck:turnacts-end]', 'turnacts'), aiA = between('// [netcheck:actsin-start]', '// [netcheck:actsin-end]', 'actsin');
    const pidA = ['function peerProfileId('].map(k => { const i = src.indexOf(k); return src.slice(i, src.indexOf('\n', i)); }).join('\n') + '\n';
    const mkA = o => {
        o = o || {};
        const map = { type: 'map', whiteboard: [{ id: 't_p', isChar: true, charId: 'c_p', ownerId: 'u_a' }, { id: 't_o', isChar: true, charId: 'c_o' }, { id: 't_q', isChar: true, charId: 'c_q', ownerId: 'u_a' }] };
        const camp = { id: 'c1', items: { m1: map }, turnRules: o.rules || {}, system: { combat: { turn: { acts: o.acts || [{ key: 'Action', n: 1 }, { key: 'Bonus', label: 'Bonus action', n: 2 }] } } }, chars: { c_p: { id: 'c_p', name: 'Pat', ownerId: 'u_a' }, c_o: { id: 'c_o', name: 'Orc', npc: true }, c_q: { id: 'c_q', name: 'Quin', ownerId: 'u_a' } } };
        const out = { sent: [], toasts: [], bells: [] }, mk = p => ({ peer: p, open: true, send: m => out.sent.push(Object.assign({ to: p }, m)) }), conns = [mk('pA'), mk('pA2'), mk('pB')];
        const net = { role: 'host', conns, roster: { pA: { id: 'u_a', location: 'm1' }, pA2: { id: 'u_a', location: 'm1' }, pB: { id: 'u_b', location: 'm1' } }, combats: { m1: { mapId: 'm1', round: 1, turn: 1, rows: [{ id: 'r_o', tokId: 't_o' }, { id: 'r_p', tokId: 't_p' }] } } };
        const api = new Function('net', 'window', 'SC', 'getActiveCampaign', 'own', 'toast', 'sendFailed', 'applyPosToDom', 'broadcastPos', 'bellOut', pidA + posA + '\n' + taA + '\n' + ordersSrc + '\nreturn { spend: actSpend, start: turnActsStart, end: turnActsEnd };')(
            net, { wpVtt: { on: k => k === 'turns' ? o.turns !== false : true } }, () => Sx, () => camp, (ob, k) => !!ob && Object.prototype.hasOwnProperty.call(ob, k), t => out.toasts.push(t), e => { throw e; }, () => {}, () => {}, (cid, note) => out.bells.push([cid, note.title, note.text]));
        const sp = (cost, ch) => api.spend(camp, ch || 'c_p', net.roster.pA, cost, conns[0], 'Pat');
        out.notes = () => out.sent.filter(m => m.type === 'turn-note').map(m => m.text);
        out.left = () => out.sent.filter(m => m.type === 'acts-left').map(m => m.to + ':' + JSON.stringify(m.left) + ':' + m.mode);
        return { out, net, camp, api, sp, conns };
    };
    const a = mkA(); const a1 = a.sp('Action'), a2 = a.sp('Action'), a3 = a.sp('Bonus');
    check('T4 actSpend (host, run for real): a press that costs an action spends it (a note of what is left; its player\'s connections hear the counts, another player nothing); none left under Refuse is refused with why, spending nothing; another action still has its own count',
        a1 === '' && a2 === 'No Action left this turn.' && a3 === '' && j(a.net.turnSpent) === j({ c_p: { Action: 1, Bonus: 1 } }) && j(a.out.notes()) === j(['Action: 0 of 1 left this turn.', 'Bonus action: 1 of 2 left this turn.'])
        && j(a.out.left()) === j(['pA:{"Action":0,"Bonus":2}:refuse', 'pA2:{"Action":0,"Bonus":2}:refuse', 'pA:{"Action":0,"Bonus":1}:refuse', 'pA2:{"Action":0,"Bonus":1}:refuse']), j([a1, a2, a3, a.net.turnSpent, a.out.notes(), a.out.left()]));
    const w = mkA({ rules: { acts: 'warn' } }); w.sp('Action'); const w2 = w.sp('Action');
    const f = mkA({ rules: { acts: 'off' } }); const f1 = f.sp('Action'), f2 = f.sp('Action');
    const nq = mkA(); const nq1 = nq.sp('Action', 'c_q');
    const nt = mkA({ turns: false }); nt.sp('Action'); const nt2 = nt.sp('Action');
    const nk = mkA(); const nk1 = nk.sp('Nope'), nk2 = nk.sp('');
    check('The bell (Bell-b): an action\'s turn note names its character (what is left, and past it under Warn), and Warn also notes it in the GM\'s bell; a spend within the count does not',
        w.out.sent.filter(m => m.type === 'turn-note').length === 2 && w.out.sent.filter(m => m.type === 'turn-note').every(m => m.charId === 'c_p') && j(w.out.bells) === j([['c_p', 'Turn', 'Used Action past what a turn allows.']]) /* 1.6.3 (finding 25): no article, and a plain word for an action with no name, moved on purpose */, j([w.out.sent, w.out.bells]));
    check('T4 actSpend\'s modes and reach: Warn lets a press past the count through with a note to them and the GM (it still counts); Off neither counts nor notes; a character not in the combat, turn-based combat off, a cost naming no action or none: free',
        w2 === '' && w.net.turnSpent.c_p.Action === 2 && /used past what a turn allows/.test(w.out.notes()[1]) && w.out.toasts.length === 1 && j(w.out.left().pop()) === j('pA2:{"Action":0,"Bonus":2}:warn')
        && f1 === '' && f2 === '' && !f.out.sent.length && !('c_p' in f.net.turnSpent) && nq1 === '' && !('c_q' in nq.net.turnSpent) && nt2 === '' && !nt.out.sent.length && nk1 === '' && nk2 === '' && !nk.out.sent.length, j([w.net.turnSpent, w.out.notes(), f.out.sent]));
    const s = mkA(); s.sp('Action'); s.out.sent.length = 0; s.api.start('m1', s.net.combats.m1); const sAfter = j(s.net.turnSpent), sLeft = s.out.left();
    s.sp('Action'); s.out.sent.length = 0; s.api.end('m1', s.net.combats.m1); const eLeft = s.out.left();
    const s2 = mkA(); s2.sp('Action'); s2.api.start('m1', Object.assign({}, s2.net.combats.m1, { turn: 0 }));
    check('T4 a turn\'s start gives the character whose turn it is its actions back (its player hears the full counts); another\'s stay spent; the combat\'s end clears its characters\' counts (null: their sheets stop graying)',
        sAfter === '{}' && j(sLeft) === j(['pA:{"Action":1,"Bonus":2}:refuse', 'pA2:{"Action":1,"Bonus":2}:refuse']) && j(eLeft) === j(['pA:null:refuse', 'pA2:null:refuse']) && j(s2.net.turnSpent) === j({ c_p: { Action: 1 } }), j([sAfter, sLeft, eLeft, s2.net.turnSpent]));
    {   // 192 (the owner, by prompt: "Count is a formula (Recommended)"): an action's count a formula of the character's names, worked out at its turn's start over the players' view and the owner's own copy
        const Fx2 = await import(url('formula.js'));
        const lineOf = (k, file) => { const t = typeof file === 'string' ? require('./checkkit').part(file) : src, i = t.indexOf(k); return t.slice(i, t.indexOf('\n', i)); }, fxL = lineOf('function fxLib(sys)'), itL = lineOf('function itemLib(sys)');
        const sysR = { v: 1, name: 'R', rolls: [], fields: [{ id: 'f_er', key: 'ExtraReady', label: 'Extra ready', kind: 'number', vis: 'all', def: 0 }, { id: 'f_gm', key: 'Secret', label: 'Secret', kind: 'number', vis: 'gm', def: 5 }],
            combat: { turn: { acts: [{ key: 'Ready', n: 1, nf: '1 + ExtraReady' }, { key: 'Act', n: 1 }, { key: 'Hid', n: 2, nf: '1 + Secret' }, { key: 'Dice', n: 3, nf: '1d6' }] } }, sheet: { sections: [] } };
        const mkR = (er) => {
            const map = { type: 'map', whiteboard: [{ id: 't_p', isChar: true, charId: 'c_p', ownerId: 'u_a', x: 0, y: 0, w: 50, h: 50 }] };
            const camp = { id: 'c1', items: { m1: map }, turnRules: {}, system: Sx.cleanSystem(sysR, { F: Fx2, gmView: true }), chars: { c_p: { id: 'c_p', name: 'Pat', ownerId: 'u_a', values: { f_er: er } } } };
            const out = { sent: [] }, conns = [{ peer: 'pA', open: true, send: m => out.sent.push(m) }];
            const net = { role: 'host', conns, roster: { pA: { id: 'u_a', location: 'm1' } }, combats: { m1: { mapId: 'm1', round: 1, turn: 0, rows: [{ id: 'r_p', tokId: 't_p' }] } } };
            const win = { wpVtt: { on: () => true }, wpFormula: Fx2, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx2, gmView: false }) } };
            const api = new Function('net', 'window', 'SC', 'getActiveCampaign', 'own', 'toast', 'sendFailed', 'applyPosToDom', 'broadcastPos', 'bellOut', pidA + fxL + '\n' + itL + '\n' + posA + '\n' + taA + '\n' + ordersSrc + '\nreturn { spend: actSpend, start: turnActsStart, end: turnActsEnd };')(
                net, win, () => Sx, () => camp, (ob, k) => !!ob && Object.prototype.hasOwnProperty.call(ob, k), () => {}, e => { throw e; }, () => {}, () => {}, () => {});
            return { out, net, camp, api, sp: cost => api.spend(camp, 'c_p', net.roster.pA, cost, conns[0], 'Pat'), left: () => out.sent.filter(m => m.type === 'acts-left').map(m => JSON.stringify(m.left)) };
        };
        const r2 = mkR(2); r2.api.start('m1', r2.net.combats.m1); const l2 = r2.left().pop(), m2 = JSON.stringify(r2.net.turnMax.c_p);
        const sp2 = [r2.sp('Ready'), r2.sp('Ready'), r2.sp('Ready'), r2.sp('Ready')];
        const r0 = mkR(0); const pre = r0.sp('Ready'), pre2 = r0.sp('Ready'), m0 = JSON.stringify(r0.net.turnMax.c_p);
        const rE = mkR(2); rE.api.start('m1', rE.net.combats.m1); rE.api.end('m1', rE.net.combats.m1); const gone = !('c_p' in rE.net.turnMax);
        check('192 an action\'s count by formula (host, run for real): worked out at the turn\'s start over the players\' view and the owner\'s own copy (1 + ExtraReady with 2 gives 3; a count naming a GM-only value and one that rolls dice stand at their number), told as what is left, spent to 0 and then refused; a press before any turn of theirs works it out then; the combat\'s end forgets it',
            m2 === JSON.stringify({ Ready: 3, Act: 1, Hid: 2, Dice: 3 }) && l2 === JSON.stringify({ Ready: 3, Act: 1, Hid: 2, Dice: 3 }) && JSON.stringify(sp2) === JSON.stringify(['', '', '', 'No Action left this turn.'] /* 1.6.3 (finding 25): an action with no name is said as Action, never its key, moved on purpose */)
            && pre === '' && pre2 === 'No Action left this turn.' && m0 === JSON.stringify({ Ready: 1, Act: 1, Hid: 2, Dice: 3 }) && gone, j([m2, l2, sp2, pre, pre2, m0, gone]));
    }
    const runAI = (msg, o) => { o = o || {}; const net = { foreign: true, syncedPeer: 'h', stream: false, actsLeft: o.had || undefined }, seen = []; new Function('msg', 'conn', 'net', 'window', aiA)(Object.assign({ type: 'acts-left' }, msg), { peer: o.peer || 'h' }, net, { wpSheets: { charChanged: id => seen.push(id) } }); return { al: net.actsLeft, seen }; };
    const ai1 = runAI({ charId: 'c_p', left: { Action: 0, Bonus: 2, 'bad key': 1, Big: 120, Mid: 12, Frac: 0.5, constructor: 1 }, mode: 'warn' }), ai2 = runAI({ charId: 'c_p', left: null }, { had: { c_p: { left: {}, mode: 'refuse' } } });
    check('T4 a client\'s counts (net.js, run for real): from the synced host only — action keys (in a map with no prototype: constructor is a key like any) and whole numbers 0 to 99 kept (192: a count may be a formula, moved on purpose from 0 to 9), anything else dropped, the mode refuse unless warn; null clears; its sheet and HUD redraw; nothing from another peer, a bad character id or a left that is neither',
        j(ai1.al.c_p) === j({ left: { Action: 0, Bonus: 2, Mid: 12, constructor: 1 }, mode: 'warn' }) && Object.getPrototypeOf(ai1.al.c_p.left) === null && j(ai1.seen) === j(['c_p']) && !('c_p' in ai2.al) && j(ai2.seen) === j(['c_p'])
        && [runAI({ charId: 'c_p', left: {} }, { peer: 'o' }), runAI({ charId: 'x', left: {} }), runAI({ charId: 'c_p', left: [1] })].every(r => !r.seen.length), j([ai1, ai2]));
    const T = src.replace(/\r\n/g, '\n');
    check('T4 the presses on the host (source): a player\'s roll with a cost spends it once it is a valid roll, before it is recorded (refused: a roll-deny with why); a player\'s apply action once its change is worked out, before it lands; turnStarted refills, the combat\'s end clears',
        /var whyQ = Dq\.checkTableRoll\(resQ\); if \(whyQ\) \{ denyQ\(whyQ\); return; \}\n\s*if \(actQ && actQ\.cost && chQ && typeof actSpend === 'function'\) \{ var costQ = actSpend\(campQ, turnChQ\.id, net\.roster\[conn\.peer\], actQ\.cost, conn, turnChQ\.name, false, actQ\.costN\); if \(costQ\) \{ denyQ\('error', \{ error: \{ message: costQ, pos: 0, len: 0 \} \}\); return; \} \}/.test(T)
        && /if \(!resA\.ok\) \{ denyA\(resA\.reason, resA\.message\); return; \}\n\s*var costA = costDoneA \? '' : typeof actSpend === 'function' \? actSpend\(campA, qa\.charId, profA, actA\.cost, conn, chA\.name, false, actA\.costN\) : ''; if \(costA\) \{ denyA\('error', costA\); return; \}/.test(T)
        && /try \{ turnActsStart\(mapId, c\); \} catch \(e\)/.test(T) && /if \(had\) \{ try \{ turnActsEnd\(mapId, had\); \} catch \(e\)/.test(T));
})());

// The combat roster on the wire (1.5.0): players get the order, never a number. A row's initiative can be the total of a roll the GM alone
// saw (the roster's Roll keeps one that reads a GM-only value private, and its total still sets the order); on a fogged map an unseen
// creature's row is Hidden whole. Run for real: the roster's Roll and Start (sliced from whiteboard.js) into net.js's combatSet, combatsFor,
// broadcastCombats and cleanCombats (the [netcheck:combats] slice), with anyFog and fogDrop as they are; fogDropIds is the one stand-in
{
    const cbSrc = between('// [netcheck:combats-start]', '// [netcheck:combats-end]', 'combats');
    const setSrc = fnSrc('function combatRefresh() {', '\nnet.combatStep = function', 'combatSet');
    const fogSrc = fnSrc('function fogDrop(', '\nfunction fogFilterClean(', 'fogDrop', 'netfog.js') + fnSrc('function anyFog(camp) {', '\n// Everything a player receives', 'anyFog', 'netfog.js');
    const wb = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'whiteboard.js'), 'utf8').replace(/\r\n/g, '\n');
    const wbCut = (a, b, label) => { const i = wb.indexOf(a), k = wb.indexOf(b, i + 1); if (i < 0 || k < 0 || wb.indexOf(a, i + 1) >= 0) throw new Error('netcheck: ' + label + ' not found once in whiteboard.js'); return wb.slice(i, k); };
    const sortSrc = wbCut('function combatSortByInit(rows) {', '\nfunction renderCombatModal() {', 'combatSortByInit'), wireSrc = wbCut('(function wireCombatModal() {', '\nfunction renderCombatStrip() {', 'wireCombatModal');
    const fhSrc = wbCut('function fightsHere(', '\n', 'fightsHere');   // fold 2: the fights on a map, which the strip's stripShow asks after a Start
    const fe = () => ({ on: {}, style: {}, value: '', addEventListener(t, f) { this.on[t] = f; }, querySelectorAll: () => [] });
    // o.fog: m1 is fogged; o.drops: { profileId: { tokId: 1 } } — what fogDropIds hides from whom (null when nothing, as it does);
    // o.rolled: what the sheet's rollInit gave (net.diceRoll's own shape: { ok, value, priv }, or { error })
    const scen = o => {
        o = o || {};
        const tok = (id, ownerId) => ({ id, isChar: true, ownerId: ownerId || null, x: 0, y: 0 });
        const camp = { id: 'k', activeItemId: 'm1', items: { m1: { type: 'map', meta: { title: 'Keep' }, fog: o.fog ? { on: true } : { on: false }, whiteboard: [tok('t_ana', 'u_a'), tok('t_orc'), tok('t_gob'), tok('t_x')] }, m2: { type: 'map', meta: { title: 'Yard' }, whiteboard: [] } } };
        const conns = [mkConn('pA'), mkConn('pB'), mkConn('pWait'), mkConn('pShut', false)].concat(o.m2 ? [mkConn('pM')] : []);   // o.m2: a fifth player, on the Yard
        const net = { active: true, role: 'host', conns, roster: { pA: { id: 'u_a', location: 'm1' }, pB: { id: 'u_b', location: 'm1' }, pShut: { id: 'u_s', location: 'm1' } }, combats: {} };
        if (o.m2) net.roster.pM = { id: 'u_m', location: 'm2' };
        const out = { toasts: [], rolls: [], bcast: [], net, conns };
        const win = { wpFog: { fogDropIds: (pid, c, map) => (o.drops && map === c.items.m1 && o.drops[pid]) || null }, wpVtt: { on: k => k === 'fog' } };
        const broadcast = (msg, except) => { packCheck(msg); out.bcast.push(JSON.parse(JSON.stringify(msg))); conns.forEach(c => { if (c !== except && c.open && net.roster[c.peer]) c.send(msg); }); };   // admitted peers only, as the real one on a host
        const N = new Function('net', 'getActiveCampaign', 'window', 'broadcast', 'sendFailed', 'logEvent', 'toast', 'render', 'renderNotepad', fogSrc + '\n' + cbSrc + '\n' + setSrc + '\n' + ordersSrc + '\nreturn { cleanCombats, cleanFights, combatsFor, broadcastCombats, targetsFor, broadcastTargets };')(
            net, () => camp, win, broadcast, e => { throw e; }, () => {}, t => out.toasts.push(t), () => {}, () => {});
        out.N = N; out.camp = camp;
        const els = {}; ['combatModal', 'combatRows', 'combatAddBtn', 'combatAddName', 'combatCancelBtn', 'combatCloseBtn', 'combatStartBtn'].forEach(id => { els[id] = fe(); });
        const draft = { mapId: 'm1', running: false, rows: [
            { id: 'r_t_orc', name: 'Orc', tokId: 't_orc', init: 12, src: 'orc.png', on: true, charId: null },
            { id: 'r_t_ana', name: 'Ana', tokId: 't_ana', init: 0, src: 'ana.png', on: true, party: true, charId: 'c_a' },
            { id: 'r_t_gob', name: 'Goblin', tokId: 't_gob', init: 8, src: 'gob.png', on: true, charId: 'c_g' },
            { id: 'c_trap', name: 'Trap', tokId: null, init: 5, src: null, on: true, custom: true },
            { id: 'r_t_x', name: 'Bystander', tokId: 't_x', init: 3, src: null, on: false, charId: null }] };
        const sheets = { rollInit: cid => { out.rolls.push(cid); return o.rolled !== undefined ? o.rolled : { ok: true, value: 23, priv: true }; } };
        const W = new Function('document', 'window', 'toast', 'renderCombatModal', 'draft', 'getActiveCampaign', 'var combatDraft = draft;\n' + fhSrc + '\n' + sortSrc + '\n' + wireSrc + '\nreturn { draft: function(d) { if (d !== undefined) combatDraft = d; return combatDraft; }, strip: function(mapId) { return stripFightId(mapId); }, sw: function(mapId) { return stripSwitch(mapId); } };')(
            { getElementById: id => els[id] || null }, { wpSheets: sheets, wpNet: net }, t => out.toasts.push(t), () => {}, draft, () => camp);
        const at = (sel, i) => ({ target: { closest: s => s === '.combat-row' ? { dataset: { i: String(i) } } : s === sel ? {} : null } });
        out.rollRow = name => { const i = W.draft().rows.findIndex(r => r.name === name); els.combatRows.on.click(at('.combat-roll', i)); };
        out.start = () => els.combatStartBtn.on.click({});
        out.stripOf = mapId => W.strip(mapId);   // fold 2: the fight this screen's strip shows on that map
        out.stripSw = mapId => W.sw(mapId);
        out.fresh = (name, id) => W.draft({ mapId: 'm1', fresh: true, rows: [{ id, name, tokId: null, init: 1, src: null, on: true, custom: true }] });   // a roster opened as Start another fight here, with one row of its own
        out.draftRows = () => W.draft() && W.draft().rows.map(r => r.name + ':' + r.init);
        out.last = c => { const m = c.sent.filter(x => x.type === 'combats'); m.forEach(packCheck); return m.length ? JSON.parse(JSON.stringify(m[m.length - 1])) : null; };
        return out;
    };
    const rowsOf = (m, mapId) => { const fr = m && fightIn(m.combats, mapId || 'm1'); return fr ? fr.rows : null; };   // fold 2: the fight on that map, under its own id
    const noFid = m => j(m).replace(/f_[a-z0-9]{8}/g, 'f_');   // a message as text with each fight's id taken out: an id is eight random letters and digits, and may hold any short word looked for (fold 3's review: "gob" one run in 7,800, "23" one in 185)
    const full = (id, name, tokId, src) => ({ id, name, tokId, src });
    const order = [full('r_t_gob', 'Goblin', 't_gob', 'gob.png'), full('r_t_orc', 'Orc', 't_orc', 'orc.png'), full('c_trap', 'Trap', null, null), full('r_t_ana', 'Ana', 't_ana', 'ana.png')];

    // no fog: the private roll's 23 puts the Goblin first for the GM and the players; the players' rows carry no number
    const a = scen();
    a.rollRow('Goblin');
    const aDraft = a.draftRows();
    a.start();
    const aHost = fightIn(a.net.combats, 'm1'), aFid = aHost.id, aMsg = a.last(a.conns[0]), aMsgB = a.last(a.conns[1]);
    const oneFight = (fid, mapId, round, turn, rows) => ({ [fid]: { id: fid, mapId, round, turn, rows } });
    check('combat roster (whiteboard + net.js, run for real): a private initiative roll still sets the order — its total fills the row and the roster sorts by it — and the host keeps every number for the GM\'s roster',
        j(a.rolls) === '["c_g"]' && j(aDraft) === j(['Goblin:23', 'Orc:12', 'Trap:5', 'Bystander:3', 'Ana:0']) && aHost.rows.map(r => r.name + ':' + r.init).join() === 'Goblin:23,Orc:12,Trap:5,Ana:0' && aHost.turn === 0 && aHost.round === 1,
        j([a.rolls, aDraft, aHost]));
    check('combat roster (no fog): players get the order, the names, the tokens and the pictures, never a number — fold 2: under the fight\'s own id, each admitted player on that map their own copy, the same for each, never a broadcast; a waiting or closed connection gets nothing',
        /^f_[a-z0-9]{8}$/.test(aFid) && j(aMsg) === j({ type: 'combats', combats: oneFight(aFid, 'm1', 1, 0, order) }) && j(aMsgB) === j(aMsg) && a.bcast.length === 0
        && a.conns[2].sent.length === 0 && a.conns[3].sent.length === 0 && noFid(aMsg).indexOf('init') < 0 && noFid(aMsg).indexOf('23') < 0, j([aMsg, a.bcast.length, a.conns[2].sent]));
    const snapA = a.N.combatsFor('u_a', 'm1');
    check('combat roster: the join snapshot\'s combats (combatsFor, per player) carry no number either, and building them leaves the host\'s own rows as they were',
        j(snapA) === j(aMsg.combats) && aHost.rows[0].init === 23 && aHost.rows[0].src === 'gob.png' && aHost.rows.every(r => 'init' in r), j([snapA, aHost.rows[0]]));
    {   // 1.5.7 (the owner: "waypoint should show how much the player has traveled on a move in combat and how much more they can move"): the turn's move
        // on that fight's copy, { m, a }, for the token's own player alone and only while its row is on turn; a player's app keeps it only as two numbers
        const cur = aHost.rows[aHost.turn], hadOwn = a.net.turnMoveOwn;
        a.net.turnMove = { [aFid]: { rowId: cur.id, tokId: cur.tokId, moved: 2.004, allow: 6 } }; a.net.turnMoveOwn = Object.create(null); a.net.turnMoveOwn[aFid] = 'u_a';
        const mvA = a.N.combatsFor('u_a', 'm1'), mvB = a.N.combatsFor('u_b', 'm1');
        a.net.turnMove[aFid].rowId = 'r_gone'; const mvGone = a.N.combatsFor('u_a', 'm1');
        a.net.turnMove[aFid] = { rowId: cur.id, tokId: cur.tokId, moved: 0, allow: null }; const mvNone = a.N.combatsFor('u_a', 'm1');
        const clMv = a.N.cleanFights({ [aFid]: Object.assign({}, mvA[aFid]) })[aFid], clBad = a.N.cleanFights({ [aFid]: Object.assign({}, mvA[aFid], { mv: { m: 'x', a: 6 } }) })[aFid];
        const clBig = a.N.cleanFights({ [aFid]: Object.assign({}, mvA[aFid], { mv: { m: -3, a: 1e12, z: 1 } }) })[aFid];
        a.net.turnMove = {}; a.net.turnMoveOwn = hadOwn;
        check('1.5.7 the turn\'s move on the wire (combatsFor, run for real): the token\'s own player gets { m, a } on that fight\'s copy, to the hundredth; another player, a row no longer on turn and a turn with no limit carry none; a player\'s app keeps two numbers held to 0 and a million, and nothing else',
            j(mvA[aFid].mv) === j({ m: 2, a: 6 }) && !('mv' in mvB[aFid]) && !('mv' in mvGone[aFid]) && !('mv' in mvNone[aFid])
            && !!clMv && j(clMv.mv) === j({ m: 2, a: 6 }) && !!clBad && !('mv' in clBad) && !!clBig && j(clBig.mv) === j({ m: 0, a: 1e6 }), j([mvA, mvB[aFid], clMv, clBad, clBig]));
    }
    const cl = a.N.cleanFights(aMsg.combats), clF = cl[aFid];
    check('combat roster (a player\'s machine, fold 2: by the fight\'s own id): the host\'s rows without a number clean to 0 each, keeping the order, the turn, the round, the map and the id (nothing on a player\'s side reads the number)',
        !!clF && clF.rows.map(r => r.name + ':' + r.init).join() === 'Goblin:0,Orc:0,Trap:0,Ana:0' && clF.turn === 0 && clF.round === 1 && clF.mapId === 'm1' && clF.id === aFid && Object.keys(cl).length === 1, j(cl));
    {   // fold 2 (backlog 152), found live: the GM switched the strip to the first fight on a map, started another there, and the strip still showed the first
        const Sp = scen(); Sp.rollRow('Goblin'); Sp.start(); const sp1 = fightIn(Sp.net.combats, 'm1').id, spGot = [Sp.stripOf('m1') === sp1];
        Sp.fresh('Bell', 'c_bell'); Sp.start(); const sp2 = Sp.net.fightsOn('m1')[1]; spGot.push(!!sp2 && sp2 !== sp1, Sp.stripOf('m1') === sp2);
        spGot.push(Sp.stripSw('m1') === sp1, Sp.stripOf('m1') === sp1);
        Sp.fresh('Gong', 'c_gong'); Sp.start(); const sp3 = Sp.net.fightsOn('m1')[2]; spGot.push(!!sp3 && sp3 !== sp2, Sp.stripOf('m1') === sp3);
        Sp.stripSw('m1'); spGot.push(Sp.stripOf('m1') === sp1);
        check('fold 2 (backlog 152, whiteboard.js\'s roster and strip run for real over net.js): a fight the GM starts from the roster is the one this screen\'s strip shows, beside a fight the strip\'s switch had picked on that map, and the switch still goes on from there',
            j(spGot) === j([true, true, true, true, true, true, true, true]), j([spGot, Sp.net.fightsOn('m1')]));
    }

    {   // fold 2's review: a token already in another fight on the map is offered in a new roster with no tick (whiteboard.js combatRowsFor, renderCombatModal,
        // openCombatModal and the roster's own change and Start handlers, run for real over net.js): its box grayed with the reason and its row tagged with
        // the fight it is in; a tick on it does nothing, and Start leaves it out
        const Bz = scen(); Bz.rollRow('Goblin'); Bz.start();   // the first fight on the Keep: the Goblin, the Orc, the Trap and Ana
        const rowsS = wbCut('function combatRowsFor(mapId, opts) {', '\nfunction combatSortByInit(rows) {', 'combatRowsFor'), rendS = wbCut('function renderCombatModal() {', '\nfunction openCombatModal(', 'renderCombatModal'), openS = wbCut('function openCombatModal(mapId, opts) {', '\nwindow.wpOpenCombat = openCombatModal;', 'openCombatModal');
        const findS = wbCut('// [lookcheck:combatfind-start]', '// [lookcheck:combatfind-end]', 'combatfind'), escS = (/\n  (function esc\(s\)\{return [^\n]*\})\n/.exec(fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'inspector.js'), 'utf8').replace(/\r\n/g, '\n')) || [])[1] || '';
        const elsB = {}; ['combatModal', 'combatRows', 'combatAddBtn', 'combatAddName', 'combatCancelBtn', 'combatCloseBtn', 'combatStartBtn', 'combatMapName', 'combatRollAllBtn'].forEach(id => { elsB[id] = fe(); });
        const RB = new Function('document', 'window', 'toast', 'getActiveCampaign', 'getActiveMap', 'state', 'resolveImg', 'setTimeout', 'clearTimeout', 'var combatDraft = null;\n' + escS + '\n' + fhSrc + '\n' + findS + '\n' + rowsS + '\n' + sortSrc + '\n' + rendS + '\n' + openS + '\n' + wireSrc + '\nreturn { open: openCombatModal, draft: function() { return combatDraft; } };')(
            { getElementById: id => elsB[id] || null }, { wpNet: Bz.net, wpSheets: { hasInitRoll: () => false } }, t => Bz.toasts.push(t), () => Bz.camp, () => Bz.camp.items.m1, { viewMode: 'visual' }, s => s, () => 0, () => {});
        RB.open('m1', { fresh: true });
        {   // found live, 2026-10-30: tokens picked on the map opened the roster each marked as targeted, though nobody had targeted anything
            const netP = { combats: {}, fightsOn: () => [], targets: { u_a: { id: 'o1', mapId: 'm1' } } }, mapP = { id: 'm1', whiteboard: [{ id: 'p1', isChar: true, ownerId: 'u_a', name: 'Ana' }, { id: 'o1', isChar: true, name: 'Orc' }, { id: 'o2', isChar: true, name: 'Goblin' }, { id: 'o3', isChar: true, name: 'Bat' }, { id: 'o4', isChar: true, hidden: true, name: 'Rat' }] };
            const rowsP = new Function('window', 'getActiveCampaign', fhSrc + '\n' + rowsS + '\nreturn combatRowsFor;')({ wpNet: netP }, () => ({ items: { m1: mapP } }))('m1', { pre: ['o2'] }).map(r => r.tokId + ':' + (r.on ? 'on' : 'off') + ':' + r.targeted);
            check('the roster: a token picked on the map is ticked and is not called targeted; a real target and whoever points at it keep their tags; a token nobody picked or targeted is offered unticked, after the ticked ones (found live, 2026-10-30)',
                j(rowsP) === j(['p1:on:targeting', 'o2:on:', 'o1:on:targeted', 'o3:off:', 'o4:off:']), j(rowsP));   // 1.6.3 (the combat review, finding 15, a deliberate change of this pin): the hidden Rat is offered too, unticked
            const rowsA = new Function('window', 'getActiveCampaign', fhSrc + '\n' + rowsS + '\nreturn combatRowsFor;')({ wpNet: Object.assign({}, netP, { targets: { 'tk:o2': { id: 'o1', mapId: 'm1' } } }) }, () => ({ items: { m1: mapP } }))('m1', {}).filter(r => r.on).map(r => r.tokId + ':' + r.targeted);
            check('the live test, 2026-10-30: one of the GM\'s characters aiming at a target (Target as) comes ticked with it, as a player\'s token does',
                j(rowsA.sort()) === j(['o1:targeted', 'o2:targeting']), j(rowsA));
        }
        const busyOf = () => RB.draft().rows.map(r => r.tokId + ':' + (r.busy ? 'busy' : '') + ':' + (r.on ? 'on' : '')), rowHtml = i => String(elsB.combatRows.innerHTML || '').split('<div class="combat-row').find(h => h.indexOf(' data-i="' + i + '"') >= 0) || '';
        const busy0 = busyOf(), title0 = elsB.combatMapName.textContent, rowsH = RB.draft().rows.map((r, i) => [/ disabled /.test(rowHtml(i)), rowHtml(i).indexOf('in another fight on Keep') >= 0]);
        const tick = (i, on) => elsB.combatRows.on.change({ target: { checked: on, classList: { contains: c => c === 'combat-on' }, closest: sel => (sel === '.combat-row' ? { dataset: { i: String(i) } } : null) } });
        tick(0, true); tick(3, true); const busy1 = busyOf();
        elsB.combatStartBtn.on.click({}); const fB2 = Bz.net.fightsOn('m1')[1], rowsB2 = fB2 ? Bz.net.combats[fB2].rows.map(r => r.tokId) : null;
        check('fold 2\'s review (whiteboard.js\'s roster run for real over net.js): Start another fight on a map that holds one offers its tokens with no tick — Ana, the Orc and the Goblin each with a grayed box and the tag of the fight they are in, the Bystander as any token — and its title says it is another fight; a tick on Ana does nothing while the Bystander\'s takes, and Start makes a fight of the Bystander alone',
            j(busy0) === j(['t_ana:busy:', 't_orc:busy:', 't_gob:busy:', 't_x::']) && title0 === 'Keep, another fight' && j(rowsH) === j([[true, true], [true, true], [true, true], [false, false]])
            && j(busy1) === j(['t_ana:busy:', 't_orc:busy:', 't_gob:busy:', 't_x::on']) && j(rowsB2) === j(['t_x']), j([busy0, title0, rowsH, busy1, rowsB2]));
    }
    {   // 1.6.3 (the improvement week's combat review, findings 0, 7, 13, 15, 20, 32 and 35; Fulllion's picks of 2026-11-20): the roster of a fight (whiteboard.js
        // combatRowsFor, rosterShape, rosterRowState, clockNeverWords, renderCombatModal, openCombatModal and the roster's Start and Update, run for real over net.js)
        const rowsS = wbCut('function combatRowsFor(mapId, opts) {', '\nfunction combatSortByInit(rows) {', 'combatRowsFor'), rendS = wbCut('function renderCombatModal() {', '\nfunction openCombatModal(', 'renderCombatModal'), openS = wbCut('function openCombatModal(mapId, opts) {', '\nwindow.wpOpenCombat = openCombatModal;', 'openCombatModal');
        const findS = wbCut('// [lookcheck:combatfind-start]', '// [lookcheck:combatfind-end]', 'combatfind'), escS = (/\n  (function esc\(s\)\{return [^\n]*\})\n/.exec(fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'inspector.js'), 'utf8').replace(/\r\n/g, '\n')) || [])[1] || '';
        // A roster world over a scen() table: o.roll, the system has an initiative roll; o.sys, the system the GM's copy holds
        const mkR = (Bq, o) => {
            o = o || {}; const els = {}, made = []; ['combatModal', 'combatRows', 'combatAddBtn', 'combatAddName', 'combatCancelBtn', 'combatCloseBtn', 'combatStartBtn', 'combatMapName', 'combatRollAllBtn', 'combatHelp', 'combatTickAllBtn'].forEach(id => { els[id] = fe(); });   // the review of the combat roster: Tick all too
            if (o.sys) Bq.camp.system = o.sys; Bq.camp.items.m1.whiteboard.forEach(w => { w.charId = 'c' + w.id; if (!w.name) w.name = w.id.charAt(2).toUpperCase() + w.id.slice(3); });   // Orc, Ana, Gob, X
            const doc = { getElementById: id => els[id] || null, createElement: tag => { const e = { tag, className: '', title: '', innerHTML: '' }; made.push(e); return e; } };
            const R = new Function('document', 'window', 'toast', 'getActiveCampaign', 'getActiveMap', 'state', 'resolveImg', 'setTimeout', 'clearTimeout', 'var combatDraft = null;\n' + escS + '\n' + fhSrc + '\n' + findS + '\n' + rowsS + '\n' + sortSrc + '\n' + rendS + '\n' + openS + '\n' + wireSrc + '\nreturn { open: openCombatModal, render: renderCombatModal, draft: function() { return combatDraft; }, shape: rosterShape, never: clockNeverWords };')(
                doc, { wpNet: Bq.net, wpSheets: { hasInitRoll: () => !!o.roll, rollInit: () => ({ ok: true, value: 7 }) } }, t => Bq.toasts.push(t), () => Bq.camp, () => Bq.camp.items.m1, { viewMode: 'visual' }, s => s, () => 0, () => {});
            const rowHtml = rid => String(els.combatRows.innerHTML || '').split('<div class="combat-row').find(h => h.indexOf(' data-rid="' + rid + '"') >= 0) || '';
            return { R, els, made, rowHtml };
        };
        // findings 0, 7, 15 and 20: a fight under way (Orc on turn, the Goblin holding its turn for "the guard moves", Ana having gone), the Orc's token then hidden
        const Bh = scen(); Bh.start(); const fidH = Bh.net.fightsOn('m1')[0], cH = Bh.net.combats[fidH];
        const gobH = cH.rows.find(r => r.tokId === 't_gob'); gobH.held = 1; gobH.holdFor = { text: 'the guard moves' }; cH.rh = 1; cH.th = { r_t_ana: 1, r_t_orc: 1 };
        Bh.camp.items.m1.whiteboard.find(w => w.id === 't_orc').hidden = true;   // (what the hold names is drawn, then taken off before Update: this world has no holdOwner for the broadcast; the host's half of a named hold is the fightReachKept check below)
        const MH = mkR(Bh); MH.R.open('m1', { fid: fidH });
        const orcH = MH.rowHtml('r_t_orc'), gobRH = MH.rowHtml('r_t_gob'), anaH = MH.rowHtml('r_t_ana'), titleH = MH.els.combatMapName.textContent, dH = MH.R.draft().rows.filter(r => r.tokId).map(r => r.tokId + ':' + (r.on ? 'on' : 'off') + (r.hidden ? ':hidden' : '') + (r.held ? ':held' : ''));
        delete gobH.holdFor; MH.els.combatStartBtn.on.click({}); const afterH = Bh.net.combats[fidH].rows.map(r => r.tokId + (r.held === 1 ? ':held' : ''));
        check('1.6.3 (the combat review, findings 0, 7 and 20, run for real over net.js): a running fight\'s roster says where play stands (the round in its title, the row on turn marked now, a held row holding with what its hold names, a row that has gone this round acted), lists a token hidden since the fight began ticked and tagged hidden, and Update keeps both its row and the Goblin\'s hold, where before the hidden row was taken out and the hold wiped with nothing said',
            titleH === 'Keep, round 1' && orcH.indexOf(' now"') === 0 && orcH.indexOf('combat-tag combat-now') > 0 && orcH.indexOf('>hidden</span>') > 0 && / checked /.test(orcH + ' ')
            && gobRH.indexOf('title="Holding their turn until the guard moves">holding</span>') > 0 && anaH.indexOf('>acted</span>') > 0 && gobRH.indexOf('>acted<') < 0
            && j(dH) === j(['t_orc:on:hidden', 't_ana:on', 't_gob:on:held', 't_x:off']) && j(afterH) === j(['t_orc', 't_ana', 't_gob:held', 'null']), j([titleH, orcH, gobRH, anaH, dH, afterH]));
        // finding 15: a hidden token not in the fight is offered unticked, a hidden token picked on the map comes ticked, and Start keeps it in the fight
        const Bp = scen(); Bp.camp.items.m1.whiteboard.find(w => w.id === 't_x').hidden = true; const MP = mkR(Bp); MP.R.open('m1', { pre: ['t_orc', 't_x'] });
        const pRows = MP.R.draft().rows.map(r => r.tokId + ':' + (r.on ? 'on' : 'off') + (r.hidden ? ':hidden' : '')); MP.els.combatStartBtn.on.click({}); const pFight = Bp.net.combats[Bp.net.fightsOn('m1')[0]].rows.map(r => r.tokId);
        const Bp2 = scen(); Bp2.camp.items.m1.whiteboard.find(w => w.id === 't_x').hidden = true; const MP2 = mkR(Bp2); MP2.R.open('m1', {}); const p2Rows = MP2.R.draft().rows.filter(r => r.tokId === 't_x').map(r => (r.on ? 'on' : 'off') + (r.hidden ? ':hidden' : ''));
        check('1.6.3 (finding 15; Fulllion: a hidden token joins a fight and acts like any other): the roster lists a hidden token, unticked unless it was picked on the map, tagged hidden, and Start puts a hidden pick in the fight',
            j(pRows) === j(['t_orc:on', 't_x:on:hidden', 't_ana:off', 't_gob:off']) && MP.rowHtml('rt_x').indexOf('>hidden</span>') > 0 && j(pFight) === j(['t_orc', 't_x']) && j(p2Rows) === j(['off:hidden']), j([pRows, pFight, p2Rows]));
        // finding 32, under each turn shape: a deck puts the numbers, each row's roll and Roll all away and says the order is drawn; a counting clock titles the box Count
        // and marks a ticked row at 0, which Start then says never acts (finding 13); sides say the order is grouped; an initiative is as it was
        const Bd = scen(), MD = mkR(Bd, { roll: true, sys: { combat: { initiative: { deck: { key: 'D1' } } }, decks: [{ key: 'D1', label: 'Fate deck' }] } }); MD.R.open('m1', { pre: ['t_orc'] });
        const dInit = (String(MD.els.combatRows.innerHTML).match(/<input type="number" class="combat-init field"[^>]*>/g) || []), dRoll = (String(MD.els.combatRows.innerHTML).match(/<button class="tool ghost combat-roll"[^>]*>/g) || []);
        const Bc = scen(), MC = mkR(Bc, { roll: true, sys: { combat: { initiative: { clock: { cost: 3 } } } } }); MC.R.open('m1', { pre: ['t_orc'] }); Bc.net.fightSet = () => 'f_clock1';   /* the Start's own toast is what is read here, not the host's clock */ const cOrc = MC.rowHtml('rt_orc'), cAna = MC.rowHtml('rt_ana'); MC.els.combatStartBtn.on.click({});
        const Bs = scen(), MS = mkR(Bs, { roll: true, sys: { combat: { initiative: { side: 'pc' } } } }); MS.R.open('m1', {});
        const Bn = scen(), MN = mkR(Bn, { roll: true }); MN.R.open('m1', {});
        check('1.6.3 (finding 32; Fulllion: the roster fits the turn shape): under a deck the number boxes, the rows\' rolls and Roll all are put away, never removed, and the help line says the order is drawn from the deck by name; under a counting clock the box is titled Count, a ticked row at 0 is marked never acts (an unticked one is not) and Start says so (finding 13); under sides a line says the order is grouped by side; with no shape the words and boxes are as they were',
            dInit.length === 4 && dInit.every(s => /style="display:none"/.test(s)) && dRoll.length === 4 && dRoll.every(s => /style="display:none"/.test(s)) && MD.els.combatRollAllBtn.style.display === 'none'
            && MD.els.combatHelp.textContent === 'Tick who is in the fight. The order is drawn from Fate deck at each round’s start, so no number is asked.'
            && /aria-label="Count"/.test(cOrc) && cOrc.indexOf(' never"') === 0 && cOrc.indexOf('>never acts</span>') > 0 && cAna.indexOf('>never acts</span>') < 0 && MC.els.combatHelp.textContent === 'Tick who is in the fight and give each a count. Higher acts first. A row at 0 or less never acts.'
            && Bc.toasts.indexOf('Orc has a count of 0 or less, so on the counting clock it never acts. Give it a count above 0 in the roster.') >= 0
            && MS.els.combatHelp.textContent === 'Tick who is in the fight and give each an initiative. Higher goes first. The order is then grouped by side, and each side goes together.'
            && MN.els.combatHelp.textContent === 'Tick who is in the fight and give each an initiative. Higher goes first.' && MN.els.combatRollAllBtn.style.display === '' && !/display:none/.test(String(MN.els.combatRows.innerHTML)) && /title="Initiative\. Higher goes first"/.test(String(MN.els.combatRows.innerHTML))
            && MC.R.never(['A', 'B', 'C', 'D']) === 'A, B, C and 1 more have a count of 0 or less, so on the counting clock they never act. Give each a count above 0 in the roster.' && MC.R.never([]) === '',
            j([dInit, dRoll, MD.els.combatHelp.textContent, cOrc, Bc.toasts, MS.els.combatHelp.textContent]));
        // finding 35: a picture whose file is missing gives way to the plain face, by a listener on the picture, once
        const Bi = scen(); Bi.camp.items.m1.whiteboard.find(w => w.id === 't_orc').src = 'gone.png'; const MI = mkR(Bi), swapped = [];
        const img = { on: {}, addEventListener(t, f, op) { this.on[t] = [f, op]; }, parentNode: { replaceChild(n, old) { swapped.push([n, old]); } } };
        MI.els.combatRows.querySelectorAll = sel => (sel === 'img.combat-face' ? [img] : []); MI.R.open('m1', {});
        const imgHtml = MI.rowHtml('rt_orc'), heard = !!img.on.error; if (heard) img.on.error[0]();
        check('1.6.3 (finding 35): a roster row\'s picture listens for its file failing, once, and gives way to the plain face a token with no picture has, said in its tooltip, never the browser\'s broken picture; the row is drawn with no handler attribute',
            heard && img.on.error[1] && img.on.error[1].once === true && swapped.length === 1 && swapped[0][1] === img && swapped[0][0].className === 'combat-face combat-face-empty' && swapped[0][0].title === 'Its picture file is missing' && swapped[0][0].innerHTML === '<i class="wib wi-starf"></i>'
            && imgHtml.indexOf('<img class="combat-face" src="gone.png" alt="">') > 0 && !/onerror/i.test(imgHtml), j([heard, swapped.length, imgHtml]));
        // finding 0, the host's half: a roster edit keeps what a held row's hold names where the row still holds (net.js fightReachKept, run for real)
        const frkS = fnSrc('function fightReachKept(had, f) {', '\n// [netcheck:turnmove-start]', 'fightReachKept'), FRK = new Function(frkS + '\nreturn fightReachKept;')();
        const fK1 = { rows: [{ id: 'g', held: 1 }, { id: 'a' }] }, fK2 = { rows: [{ id: 'g' }] }; FRK({ rows: [{ id: 'g', held: 1, holdFor: { text: 'the guard moves' } }] }, fK1); FRK({ rows: [{ id: 'g', held: 1, holdFor: { text: 'x' } }] }, fK2);
        check('1.6.3 (finding 0, the host\'s half, run for real): a roster edit that keeps a row held keeps what its hold names (fightReachKept), and one whose row no longer holds lets it go, which is why the roster must hand held on',
            j(fK1.rows[0].holdFor) === j({ text: 'the guard moves' }) && fK2.rows[0].holdFor === undefined, j([fK1, fK2]));
        // The review of the combat roster (2026-11-20), finding 1: on a counting clock a row's count runs down to 0 as it acts and goes back to where it began (ck0) at
        // the next cycle, so in the middle of a cycle a row that acted down to 0 is no row that never acts. The roster, Update and the strip judge by where it begins
        const sysK = { combat: { initiative: { clock: { cost: 3 } } } }, Bk = scen(); Bk.start(); const fidK = Bk.net.fightsOn('m1')[0], cK = Bk.net.combats[fidK];
        cK.ck0 = { r_t_orc: 6, r_t_ana: 4, r_t_gob: 0, c_trap: 5 }; cK.rows.forEach(r => { r.init = { r_t_orc: 0, r_t_ana: 4, r_t_gob: 0, c_trap: 0 }[r.id]; }); cK.turn = cK.rows.findIndex(r => r.id === 'r_t_ana');
        const MK = mkR(Bk, { sys: sysK }); MK.R.open('m1', { fid: fidK }); const kOrc = MK.rowHtml('r_t_orc'), kGob = MK.rowHtml('r_t_gob'), kTrap = MK.rowHtml('c_trap');
        Bk.net.fightSet = f => f;   /* Update's own toast is what is read here, not the host's clock (this world has no system core) */ MK.els.combatStartBtn.on.click({});
        const sortK = sortSrc.indexOf('function clockBegin(live, id, now) {') >= 0 ? new Function(sortSrc + '\nreturn clockBegin;')() : null;
        const wbK = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'whiteboard.js'), 'utf8').replace(/\r\n/g, '\n');
        check('1.6.3 (the review of the combat roster, finding 1, run for real): mid-cycle on a counting clock a row that acted down to 0 but began above 0 is not marked never acts in the running roster, nor said at Update, nor named on the strip; a row that began at 0 still is; a count the GM types above 0 wins; the strip asks the same rule with the fight the host holds',
            !!sortK && kOrc.indexOf('>never acts</span>') < 0 && kOrc.indexOf(' never"') < 0 && kTrap.indexOf('>never acts</span>') < 0 && kGob.indexOf('>never acts</span>') > 0
            && j(Bk.toasts.filter(t => /never act/.test(t))) === j(['Gob has a count of 0 or less, so on the counting clock it never acts. Give it a count above 0 in the roster.'])
            && sortK({ ck0: { a: 6 } }, 'a', 0) === 6 && sortK({ ck0: { a: 0 } }, 'a', 5) === 5 && sortK(null, 'a', 0) === 0 && sortK({ ck0: { a: 6 } }, 'b', -2) === -2 && !(sortK(null, 'a', undefined) > 0)
            && wbK.includes("c.rows.filter(function(r) { return !!r && !((typeof clockBegin === 'function' ? clockBegin(c, r.id, r.init) : Number(r.init)) > 0); })"), j([kOrc, kGob, kTrap, Bk.toasts]));
        // Finding 4: Update reads a hold from the fight as it stands, never from the roster as it opened. The Goblin held when the roster opened, then acted from its hold
        // while the roster was open: Update does not bring the hold back. The Orc held as the roster opened and still holds: it keeps it. A row now on turn holds nothing
        const Bu = scen(); Bu.start(); const fidU = Bu.net.fightsOn('m1')[0], cU = Bu.net.combats[fidU]; cU.turn = cU.rows.findIndex(r => r.id === 'r_t_ana');
        cU.rows.find(r => r.id === 'r_t_gob').held = 1; cU.rows.find(r => r.id === 'r_t_orc').held = 1; cU.rows.find(r => r.id === 'c_trap').held = 1;
        const MU = mkR(Bu); MU.R.open('m1', { fid: fidU }); const dU = MU.R.draft().rows.filter(r => r.held).map(r => r.id).sort();
        delete cU.rows.find(r => r.id === 'r_t_gob').held; cU.turn = cU.rows.findIndex(r => r.id === 'c_trap');   // the Goblin acted from its hold, and the trap's held turn came round
        MU.els.combatStartBtn.on.click({}); const afU = Bu.net.combats[fidU].rows.filter(r => r.held === 1).map(r => r.id).sort();
        check('1.6.3 (the review of the combat roster, finding 4, run for real): Update sets a hold from the fight as it stands at the press: a row that acted from its hold while the roster was open, and one whose turn has come, hold nothing after; a row that still holds keeps its hold',
            j(dU) === j(['c_trap', 'r_t_gob', 'r_t_orc']) && j(afU) === j(['r_t_orc']), j([dU, afU]));
        // Finding 5: Tick all passes over a hidden token, which is ticked one at a time, so no press pulls hidden ambushers into every player's order
        const Bt = scen(); Bt.camp.items.m1.whiteboard.find(w => w.id === 't_x').hidden = true; const MT = mkR(Bt); MT.R.open('m1', {}); MT.els.combatTickAllBtn.on.click({});
        const tRows = MT.R.draft().rows.map(r => r.tokId + ':' + (r.on ? 'on' : 'off')).sort();
        check('1.6.3 (the review of the combat roster, finding 5, run for real): Tick all ticks every row that may join but a hidden token, and its tooltip says so',
            j(tRows) === j(['t_ana:on', 't_gob:on', 't_orc:on', 't_x:off']) && /id="combatTickAllBtn" title="Tick every row that may join this fight but the hidden ones, which you tick one at a time"/.test(fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'index.html'), 'utf8')), j(tRows));
    }
    // fog: a player who cannot see the Goblin gets a Hidden row with nothing of it (no name, token, picture, or the row id that carries its
    // token's); one who sees everything gets the plain order; a combat on an unfogged map at the same table has no number either
    const f = scen({ fog: true, drops: { u_a: { t_gob: 1 } } });
    f.rollRow('Goblin'); f.start();
    f.net.combatSet('m2', { mapId: 'm2', round: 2, turn: 1, rows: [{ id: 'c_tur', name: 'Turret', tokId: null, init: 9, src: null }, { id: 'c_gat', name: 'Gate', tokId: null, init: 4, src: null }] });
    const fA = f.last(f.conns[0]), fB = f.last(f.conns[1]), fYard = fightIn(f.net.combats, 'm2'), fYardOut = f.N.combatsFor('u_a', 'm2');
    const hid = { id: 'h0', name: 'Hidden', tokId: null, src: null, hid: 1 };   // 1.6.3 (finding 24): a redacted row carries its mark, moved on purpose
    check('combat roster (fog): an unseen creature\'s row is Hidden whole — no name, token, picture or token-bearing id — in its place in the order; nor is there a number on any row, on the fogged map or an unfogged one',
        j(rowsOf(fA)) === j([hid].concat(order.slice(1))) && j(fYardOut) === j(oneFight(fYard.id, 'm2', 2, 1, [full('c_tur', 'Turret', null, null), full('c_gat', 'Gate', null, null)]))
        && noFid(fA).indexOf('gob') < 0 && noFid(fA).indexOf('Goblin') < 0 && noFid(fA).indexOf('init') < 0, j([fA, fYardOut]));
    check('fold 2 (backlog 152, run for real): a player is sent only the fights on the map they are on — Ana, on the Keep, gets the Keep\'s fight and nothing of the fight on the Yard (its turret, its gate, its round); every player was sent every fight on every map before',
        Object.keys(fA.combats).length === 1 && fightIn(fA.combats, 'm2') === undefined && Object.keys(fB.combats).length === 1 && fightIn(fB.combats, 'm2') === undefined && j(fA).indexOf('Turret') < 0 && j(fB).indexOf('Gate') < 0
        && Object.keys(f.net.combats).length === 2 && !!fYard && fYard.id !== fightIn(f.net.combats, 'm1').id, j([fA, fB]));
    check('combat roster (fog): each admitted player gets their own copy (the one who sees the Goblin, the plain order); nothing goes to a waiting or closed connection; the host keeps the Goblin whole with its 23',
        j(rowsOf(fB)) === j(order) && noFid(fB).indexOf('init') < 0 && f.bcast.length === 0 && f.conns[2].sent.length === 0 && f.conns[3].sent.length === 0
        && fightIn(f.net.combats, 'm1').rows[0].name === 'Goblin' && fightIn(f.net.combats, 'm1').rows[0].init === 23 && fightIn(f.net.combats, 'm1').rows[0].tokId === 't_gob', j([fB, fightIn(f.net.combats, 'm1').rows[0]]));
    const fSnap = f.N.combatsFor('u_a', 'm1'), fSnapB = f.N.combatsFor('u_b', 'm1');
    check('combat roster (fog): the join snapshot for each player matches what the broadcast sent them', j(fSnap) === j(fA.combats) && j(fSnapB) === j(fB.combats), j([fSnap, fSnapB]));

    // the Roll button: a refusal toasts and changes nothing; an answer with no number (a request still waiting) changes nothing
    const e1 = scen({ rolled: { error: 'Dice are off for this campaign (Settings > VTT features).' } }); e1.rollRow('Goblin');
    const e2 = scen({ rolled: { ok: true, pending: true } }); e2.rollRow('Goblin');
    check('combat roster: a refused initiative roll toasts its reason and leaves the order; one with no number yet leaves it too',
        j(e1.toasts) === j(['Dice are off for this campaign (Settings > VTT features).']) && j(e1.draftRows()) === j(['Orc:12', 'Ana:0', 'Goblin:8', 'Trap:5', 'Bystander:3']) && j(e2.draftRows()) === j(e1.draftRows()) && e2.toasts.length === 0,
        j([e1.toasts, e1.draftRows(), e2.draftRows()]));
    check('combat roster (source): a roll\'s answer is net.diceRoll\'s own ({ ok, value, priv }) through the sheet\'s rollInit; combats go to players only through combatsFor (the broadcast, the join snapshot, the one player whose sight moved and, fold M7, a copy caught up in place), never net.combats as it is; fold 2\'s review: each send through combatsTo, the one place a message of the fights is made, and the broadcast alone holds back a copy the connection holds already',
        /return \{ ok: true, value: res\.value, priv: !!rec\.priv \};/.test(src) && (src.match(/type: 'combats'/g) || []).length === 1 && /function combatsTo\(c, combats, fresh\) \{[^]*?c\.send\(\{ type: 'combats', combats: combats \}\);/.test(cbSrc)
        && (between('// [netcheck:fogmove-start]', '// [netcheck:fogmove-end]', 'fogmove', 'netfog.js').match(/combatsTo\(c, combatsFor\(pid, connMap\(c\)\)\)/g) || []).length === 1
        && (src.match(/if \(inFight\) combatsTo\(c, combatsFor\(pid, connMap\(c\)\)\);/g) || []).length === 2 && /combats: combatsFor\(prof\.id, prof\.location\), fights: true,/.test(src) && !/combats: net\.combats/.test(src)
        && !/broadcast\(\{ type: 'combats'/.test(src) && /combatsTo\(c, combatsFor\(pr\.id, pr\.location\), true\)/.test(src) && /combatsTo\(c, combatsFor\(pr\.id, loc\)\)/.test(src) && (src.match(/combatsTo\(/g) || []).length === 5 && (src.match(/combatsTo\([^;\n]*, true\)/g) || []).length === 1);

    // Fold M0 (a security fix): a token the GM hides after the fight began leaves every player's copy, so its row goes out Hidden too, on
    // a table without fog as on a fogged one (combatHidden, run for real in combatsFor and broadcastCombats); the host keeps the row whole. m2
    // holds a hidden token with the Orc's id and a combat of its own: a hidden token counts on its own map only. An item whose id reads 'null'
    // (a file may hold any id) is hidden on m1: a row with no token is never touched
    const tokOf = (s, mapId, id) => s.camp.items[mapId].whiteboard.find(w => w.id === id);
    const hidRow = i => ({ id: 'h' + i, name: 'Hidden', tokId: null, src: null, hid: 1 });   // 1.6.3 (finding 24): a redacted row carries its mark, moved on purpose
    const hideWorld = o => {
        const s = scen(Object.assign({ m2: true }, o)); s.rollRow('Goblin'); s.start(); fightIn(s.net.combats, 'm1').round = 3; fightIn(s.net.combats, 'm1').turn = 1;
        s.camp.items.m1.whiteboard.push({ id: 'null', hidden: true, x: 0, y: 0 });
        s.camp.items.m2.whiteboard.push({ id: 't_orc', isChar: true, hidden: true, x: 0, y: 0 });
        s.net.combats.f_yard0001 = { id: 'f_yard0001', mapId: 'm2', round: 2, turn: 2, rows: [{ id: 'r_g2', name: 'Goblin2', tokId: 't_gob', init: 6, src: 'g2.png' }, { id: 'r_o2', name: 'Orc2', tokId: 't_orc', init: 4, src: 'o2.png' }, { id: 'c_gate', name: 'Gate', tokId: null, init: 2, src: null }] };
        tokOf(s, 'm1', 't_gob').hidden = true; return s;
    };
    const m2Out = hid1 => ({ f_yard0001: { id: 'f_yard0001', mapId: 'm2', round: 2, turn: 2, rows: [full('r_g2', 'Goblin2', 't_gob', 'g2.png'), hid1 ? hidRow(1) : full('r_o2', 'Orc2', 't_orc', 'o2.png'), full('c_gate', 'Gate', null, null)] } });
    const U = hideWorld(), ub0 = U.bcast.length, uFid = fightIn(U.net.combats, 'm1').id; U.N.broadcastCombats();
    const uA = U.last(U.conns[0]), uB = U.last(U.conns[1]), uM = U.last(U.conns[4]), uSnap = [U.N.combatsFor('u_a', 'm1'), U.N.combatsFor('u_b', 'm1')], uHost = fightIn(U.net.combats, 'm1').rows[0];
    check('fold M0 and the owner\'s ruling of 2026-10-01: on a table without fog a token the GM hid after the fight began keeps its row by name for the table that saw it go out whole at the start (broadcastCombats, run for real), the order, the count, the round and the turn intact; a creature hidden before any copy of its fight went out (the Yard\'s Orc2, its fight set up while it was hidden) goes out as a Hidden row to the player on the Yard — no name, token, picture or token-bearing id, in its place; a hidden token on another map than the fight\'s hides nothing; fold 2: each player gets the fights on the map they are on',
        j(uA) === j({ type: 'combats', combats: oneFight(uFid, 'm1', 3, 1, order) }) && j(uM) === j({ type: 'combats', combats: m2Out(true) })
        && j(rowsOf(uA)).indexOf('Goblin') >= 0 && j(uM).indexOf('Orc2') < 0 && j(uM).indexOf('o2.png') < 0 && j(uM).indexOf('t_orc') < 0, j([uA, uM]));
    check('fold M0: without fog that is each player\'s own copy (fold 2: per connection always, never a broadcast), the same for each admitted player on that map, nothing to a waiting or closed connection; the join snapshot (combatsFor) says the same; the host keeps the hidden token\'s row whole with its number',
        U.bcast.length === ub0 && ub0 === 0 && j(uB) === j(uA) && U.conns[2].sent.length === 0 && U.conns[3].sent.length === 0
        && j(uSnap) === j([uA.combats, uA.combats]) && j(uHost) === j({ id: 'r_t_gob', name: 'Goblin', tokId: 't_gob', init: 23, src: 'gob.png', rolled: 1 }) && !/rolled|init/.test(j(uA)), j([U.bcast.length - ub0, uSnap, uHost]));   // initiative O1: the roster's roll marks the host's row rolled (a deliberate change); a player gets neither
    tokOf(U, 'm1', 't_gob').hidden = false; tokOf(U, 'm2', 't_orc').hidden = false; U.N.broadcastCombats(); const uShown = U.last(U.conns[0]), uShownM = U.last(U.conns[4]);
    check('fold M0: a token shown again goes out whole — its row as it was, on both maps',
        j(uShown) === j({ type: 'combats', combats: oneFight(uFid, 'm1', 3, 1, order) }) && j(uShownM) === j({ type: 'combats', combats: m2Out(false) }), j([uShown, uShownM]));
    // fogged: Bo cannot see the Orc on m1; the Goblin is hidden
    const Fh = hideWorld({ fog: true, drops: { u_b: { t_orc: 1 } } }), fb0 = Fh.bcast.length, fhFid = fightIn(Fh.net.combats, 'm1').id; Fh.N.broadcastCombats();
    const fhA = Fh.last(Fh.conns[0]), fhB = Fh.last(Fh.conns[1]), fhM = Fh.last(Fh.conns[4]);
    check('fold M0 and the owner\'s ruling: on a fogged table each player\'s own copy (per-player sends, no broadcast) keeps the hidden Goblin by name — both saw it at the start — while Bo, who never saw the Orc, still gets its row Hidden, by its place; the Trap and Ana whole; the Yard (no fog there) as on a table without fog, to the player on it; the join snapshot matches',
        Fh.bcast.length === fb0 && fb0 === 0 && j(fhA) === j({ type: 'combats', combats: oneFight(fhFid, 'm1', 3, 1, order) })
        && j(fhB) === j({ type: 'combats', combats: oneFight(fhFid, 'm1', 3, 1, [order[0], hidRow(1), order[2], order[3]]) }) && j(fhM) === j({ type: 'combats', combats: m2Out(true) })
        && Fh.conns[2].sent.length === 0 && Fh.conns[3].sent.length === 0 && j(Fh.N.combatsFor('u_a', 'm1')) === j(fhA.combats) && j(Fh.N.combatsFor('u_b', 'm1')) === j(fhB.combats), j([fhA, fhB, fhM, Fh.bcast.length]));

    // net.syncCombatHidden (run for real): the host sends the combats again only when a running row's hidden flag changes, and then (fold 2's review)
    // only to a connection whose copy changes: a row a player saw keeps its name when its token is hidden (the owner's ruling of 2026-10-01), so
    // their copy is as it was and nothing goes, where a copy as it was went out before and told them that the GM had hidden something. Here the
    // Goblin is hidden from the start, so nobody has seen it; Mo stands on the Yard, and Pip joins the Keep once the Orc is hidden
    const sendsTo = (s, i) => s.conns[i].sent.filter(m => m.type === 'combats').length;
    const synOf = s => { const n = s.conns.map((c, i) => sendsTo(s, i)); s.net.syncCombatHidden(); return s.conns.map((c, i) => sendsTo(s, i) - n[i]); };
    const Sy = scen({ m2: true }); tokOf(Sy, 'm1', 't_gob').hidden = true; Sy.rollRow('Goblin'); Sy.start();
    const syFirst = synOf(Sy), syQuiet = synOf(Sy);
    tokOf(Sy, 'm1', 't_gob').hidden = false; const syShow = synOf(Sy), syShowMsg = Sy.last(Sy.conns[0]), syShowAgain = synOf(Sy);   // shown: its row whole to both on the Keep
    tokOf(Sy, 'm1', 't_gob').hidden = true; const syHide = synOf(Sy), syHideAgain = synOf(Sy);   // hidden again: both saw it, so their copies are as they were
    tokOf(Sy, 'm1', 't_x').hidden = true; Sy.camp.items.m1.whiteboard.push({ id: 'null', hidden: true }); const syOff = synOf(Sy);   // the Bystander, left out of the fight, and an item no row names
    Sy.net.combats.f_yard0002 = { id: 'f_yard0002', mapId: 'm2', round: 1, turn: 0, rows: [{ id: 'c_tur', name: 'Turret', tokId: null, init: 9, src: null }] }; const syAdd = synOf(Sy), syAddMsg = Sy.last(Sy.conns[4]);
    delete Sy.net.combats.f_yard0002; const syDel = synOf(Sy), syDelMsg = Sy.last(Sy.conns[4]);
    const cliBefore = Sy.conns.map(c => c.sent.length).join(); Sy.net.role = 'client'; tokOf(Sy, 'm1', 't_orc').hidden = true; const syCli = synOf(Sy), cliSent = Sy.conns.map(c => c.sent.length).join();
    Sy.net.role = 'host'; Sy.net.active = false; const syOffline = synOf(Sy); Sy.net.active = true;
    const cPip = mkConn('pPip'); Sy.conns.push(cPip); Sy.net.roster.pPip = { id: 'u_pip', location: 'm1' };   // a late joiner on the Keep, who never saw the Orc
    const syBack = synOf(Sy), syBackPip = Sy.last(cPip), Z5 = [0, 0, 0, 0, 0];
    check('fold M0: net.syncCombatHidden (run for real on a table without fog) sends nothing while the flags stay the same; when a running row\'s token is shown it sends each player on that map their copy with the row whole, and nothing more after; when it is hidden again nothing at all, since both saw it and their copies are as they were (fold 2\'s review: a copy as it was told them the GM had hidden something); nothing when a token no running row names is hidden; the player on another map is sent none of it',
        j(syFirst) === j(Z5) && j(syQuiet) === j(Z5) && j(syShow) === j([1, 1, 0, 0, 0]) && j(rowsOf(syShowMsg)) === j(order) && j(syShowAgain) === j(Z5) && j(syHide) === j(Z5) && j(syHideAgain) === j(Z5) && j(syOff) === j(Z5),
        j([syFirst, syQuiet, syShow, syShowAgain, syHide, syHideAgain, syOff, syShowMsg]));
    check('fold M0: a combat added or removed changes what net.syncCombatHidden compares: the player on its map is sent it, once each, and nobody on another map (fold 2\'s review); on a player\'s machine or with no session it sends nothing, and once hosting again it catches up with a change made meanwhile: a player who joined meanwhile and never saw the creature hidden then gets its row Hidden, the others nothing, their copies as they were',
        j(syAdd) === j([0, 0, 0, 0, 1]) && !!fightIn(syAddMsg.combats, 'm2') && !fightIn(syAddMsg.combats, 'm1') && j(syDel) === j([0, 0, 0, 0, 1]) && j(syDelMsg.combats) === '{}' && j(syCli) === j(Z5) && cliSent === cliBefore && j(syOffline) === j(Z5)
        && j(syBack) === j([0, 0, 0, 0, 0, 1]) && j(rowsOf(syBackPip)) === j([hidRow(0), hidRow(1), order[2], order[3]]),
        j([syAdd, syDel, syCli, syOffline, syBack, syBackPip]));
    const Sf = scen({ fog: true }); tokOf(Sf, 'm1', 't_gob').hidden = true; Sf.rollRow('Goblin'); Sf.start(); Sf.net.syncCombatHidden(); Sf.conns.forEach(c => { c.sent.length = 0; });
    tokOf(Sf, 'm1', 't_gob').hidden = false; Sf.net.syncCombatHidden();
    const sfOut = Sf.conns.map(c => c.sent.filter(m => m.type === 'combats').length).join(''), sfRows = [rowsOf(Sf.last(Sf.conns[0])), rowsOf(Sf.last(Sf.conns[1]))];
    tokOf(Sf, 'm1', 't_gob').hidden = true; Sf.conns.forEach(c => { c.sent.length = 0; }); Sf.net.syncCombatHidden(); const sfOut2 = Sf.conns.map(c => c.sent.filter(m => m.type === 'combats').length).join('');
    check('fold M0: on a fogged table net.syncCombatHidden sends each admitted player their own copy (the Goblin, hidden from the start and then shown, by name); no broadcast, nothing to a waiting or closed connection; hidden again, nothing, since each saw it (fold 2\'s review)',
        sfOut === '1100' && Sf.bcast.length === 0 && j(sfRows) === j([order, order]) && sfOut2 === '0000', j([sfOut, sfRows, sfOut2]));

    // what the table holds is recorded by every send of the rows: once the rows went out for another reason (a turn step), a token shown reaches the
    // player who never saw it and only them, and hidden again it is sent to nobody, as everyone has seen it now (fold 2's review)
    const Sr = scen(); Sr.rollRow('Goblin'); Sr.start(); Sr.net.syncCombatHidden();
    tokOf(Sr, 'm1', 't_gob').hidden = true; const srHide = synOf(Sr);   // Pat and Bea saw it: nothing
    const cPip2 = mkConn('pPip'); Sr.conns.push(cPip2); Sr.net.roster.pPip = { id: 'u_pip', location: 'm1' };
    Sr.N.broadcastCombats(); const srPip = rowsOf(Sr.last(cPip2));   // the rows go out for another reason: Pip, new, gets the Goblin Hidden
    tokOf(Sr, 'm1', 't_gob').hidden = false; const srShow = synOf(Sr), srShowPip = rowsOf(Sr.last(cPip2));
    tokOf(Sr, 'm1', 't_gob').hidden = true; const srReHide = synOf(Sr);
    check('fold M0: what the table holds is recorded by every send of the rows: once the rows went out for another reason (a turn step), the Goblin shown reaches Pip, who never saw it, and nobody else; hidden again it is sent to nobody, as everyone has seen it now (fold 2\'s review: a copy as it was is never sent again)',
        j(srHide) === j([0, 0, 0, 0]) && j(srPip) === j([hidRow(0)].concat(order.slice(1))) && j(srShow) === j([0, 0, 0, 0, 1]) && j(srShowPip) === j(order) && j(srReHide) === j([0, 0, 0, 0, 0]), j([srHide, srPip, srShow, srShowPip, srReHide]));
    // the owner's ruling of 2026-10-01, run for real: a creature never sent whole in this fight reads Hidden until it is; one seen keeps its name while hidden or out of sight; a new fight there, the fight's end and a new table forget what was seen; a late joiner who never saw it gets Hidden
    const Sn = scen({ fog: true, drops: { u_b: { t_orc: 1 } } }); Sn.rollRow('Goblin'); Sn.start();
    const snA0 = rowsOf(Sn.last(Sn.conns[0])).map(r => r.name), snB0 = rowsOf(Sn.last(Sn.conns[1])).map(r => r.name);
    tokOf(Sn, 'm1', 't_gob').hidden = true; Sn.N.broadcastCombats(); const snA1 = rowsOf(Sn.last(Sn.conns[0])).map(r => r.name), snB1 = rowsOf(Sn.last(Sn.conns[1])).map(r => r.name);
    Sn.net.roster.pC = { id: 'u_c', location: 'm1' }; const snLate = fightIn(Sn.N.combatsFor('u_c', 'm1'), 'm1').rows.map(r => r.name), snNull = fightIn(Sn.N.combatsFor(null, 'm1'), 'm1').rows.map(r => r.name);
    const seenAfterB = (() => { Object.keys(Sn.net.combats).forEach(k => { delete Sn.net.combats[k]; }); Sn.net.combatSet('m1', { round: 1, turn: 0, rows: [{ id: 'r_t_gob', name: 'Goblin', tokId: 't_gob', init: 1, src: null }, { id: 'r_t_orc', name: 'Orc', tokId: 't_orc', init: 2, src: null }] }); return rowsOf(Sn.last(Sn.conns[0])).map(r => r.name); })();   // a new fight: the hidden Goblin unseen again
    tokOf(Sn, 'm1', 't_gob').hidden = false; Sn.N.broadcastCombats(); const snShown = rowsOf(Sn.last(Sn.conns[0])).map(r => r.name); tokOf(Sn, 'm1', 't_gob').hidden = true; Sn.N.broadcastCombats(); const snAgain = rowsOf(Sn.last(Sn.conns[0])).map(r => r.name);
    Sn.net.combatSet('m1', null); Sn.net.combatSet('m1', { round: 1, turn: 0, rows: [{ id: 'r_t_gob', name: 'Goblin', tokId: 't_gob', init: 1, src: null }] }); const snEnded = rowsOf(Sn.last(Sn.conns[0])).map(r => r.name);
    check('the owner\'s ruling of 2026-10-01 (combatsFor, run for real on a fogged table): at the start Ana sees everyone and Bo not the Orc (Hidden for him); the GM hiding the Goblin changes nothing for either (both saw it), the Orc still Hidden for Bo; a player who joins now, and the unfogged broadcast\'s own view, never saw the Goblin and get Hidden; a new fight on that map forgets what was seen (the hidden Goblin Hidden again), seen once shown it keeps its name when hidden again, and the fight\'s end forgets it too',
        j(snA0) === j(['Goblin', 'Orc', 'Trap', 'Ana']) && j(snB0) === j(['Goblin', 'Hidden', 'Trap', 'Ana']) && j(snA1) === j(snA0) && j(snB1) === j(snB0) && j(snLate) === j(['Hidden', 'Orc', 'Trap', 'Ana']) && j(snNull) === j(['Hidden', 'Orc', 'Trap', 'Ana'])
        && j(seenAfterB) === j(['Hidden', 'Orc']) && j(snShown) === j(['Goblin', 'Orc']) && j(snAgain) === j(['Goblin', 'Orc']) && j(snEnded) === j(['Hidden']), j([snA0, snB0, snA1, snB1, snLate, snNull, seenAfterB, snShown, snAgain, snEnded]));
    check('the owner\'s ruling (source): what a player saw is kept in the combats slice alone, per fight by its own id (fold 2: a new fight has an id of its own, so nothing is seen in it), read only by combatsFor (and, as a read alone, by net.tokUnseen: secrets R2, by the fight that holds the token), forgotten at the fight\'s end and by fogForgetAll at a new table; the client\'s toast still names Hidden only for a row that reads so',
        (src.match(/function combatForget\(/g) || []).length === 1 && (cbSrc.match(/combatSeen\(|combatSaw\(/g) || []).length === 4 && (src.match(/combatSeen\(|combatSaw\(/g) || []).length === 5 && /if \(typeof combatSeen === 'function' && combatSeen\(fightOfTok\(mapId, tokId\), p\.id, tokId\)\) return false;/.test(require('./checkkit').part('netfight.js'))
        && /function combatSeen\(fid, pid, tokId\) \{ var m = typeof fid === 'string' \? _combatSeen\[fid\] : null;/.test(src) && /if \(typeof fid === 'string'\) \{ delete net\.combats\[fid\];[^\n]*\n[^\n]*\n[^\n]*marksEnd\(mapId\)[^\n]*\n\s*if \(typeof fid === 'string' && typeof combatForget === 'function'\) combatForget\(fid\);/.test(src) && /_fogCost = Object\.create\(null\); if \(typeof combatForget === 'function'\) combatForget\(\); \}/.test(require('./checkkit').part('netfog.js'))
        && /A creature your players have seen stays in their order by name when you hide it or it moves out of their sight/.test(fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'index.html'), 'utf8')));
    // hidden pieces (owner, 2026-10-01): a pointer at a token the GM hid, or at nothing on the host's map, goes to no one, on a table without fog as on one
    // with it — hidden and gone answer alike; net.syncCombatHidden sends the pointers again when a hide, a show or a deletion changes which are sent
    const Tg = scen(); Tg.net.targets = { u_a: { id: 't_orc', mapId: 'm1', name: 'Ana' }, u_b: { id: 't_gob', mapId: 'm1', name: 'Bea' }, u_g: { id: 'nope', mapId: 'm1', name: 'GM' }, u_x: { id: 't_orc', mapId: 'zzz', name: 'X' }, u_y: { id: 't_orc', mapId: '__proto__', name: 'Y' }, u_z: { id: 't_orc', mapId: 'm2', name: 'Z' } };
    const tgKeys = o => Object.keys(o || {}).sort().join(), tgn = () => { const n = Tg.bcast.length; Tg.net.syncCombatHidden(); return Tg.bcast.slice(n).map(m => m.type + ':' + tgKeys(m.targets)); };
    const tg0 = tgKeys(Tg.N.targetsFor('u_a')), tgNull = tgKeys(Tg.N.targetsFor(null)); Tg.N.broadcastTargets(); const tgB = Tg.bcast[Tg.bcast.length - 1], tgQuiet = tgn();
    tokOf(Tg, 'm1', 't_orc').hidden = true; const tgHide = tgn(), tgHideAgain = tgn(), tgHidFor = tgKeys(Tg.N.targetsFor('u_a'));
    tokOf(Tg, 'm1', 't_orc').hidden = false; const tgShow = tgn();
    Tg.camp.items.m1.whiteboard = Tg.camp.items.m1.whiteboard.filter(w => w.id !== 't_gob'); const tgGone = tgn(), tgGoneFor = tgKeys(Tg.N.targetsFor('u_b')), tgGoneAgain = tgn();
    check('hidden pieces: a target pointer at a token the GM hid, at a token that is gone, at nothing on its map, or at a map that is none (another map, a prototype name) goes to no one on a table without fog — the one broadcast is built by the same judge, and hidden and gone answer alike; net.syncCombatHidden sends the pointers again once when a hide, a show or a deletion changes which are sent, and nothing while they stay',
        tg0 === 'u_a,u_b' && tgNull === 'u_a,u_b' && tgB.type === 'targets' && tgKeys(tgB.targets) === 'u_a,u_b' && !/nope|zzz|u_g|u_x|u_y|u_z/.test(j(tgB)) && j(tgQuiet) === j([]) && j(tgHide) === j(['targets:u_b']) && j(tgHideAgain) === j([]) && tgHidFor === 'u_b'
        && j(tgShow) === j(['targets:u_a,u_b']) && j(tgGone) === j(['targets:u_a']) && tgGoneFor === 'u_a' && j(tgGoneAgain) === j([]), j([tg0, tgNull, tgB, tgQuiet, tgHide, tgHideAgain, tgHidFor, tgShow, tgGone, tgGoneFor]));
    const Tf = scen({ fog: true, drops: { u_b: { t_orc: 1 } } }); Tf.net.targets = { u_a: { id: 't_orc', mapId: 'm1', name: 'Ana' }, u_b: { id: 't_gob', mapId: 'm1', name: 'Bea' } }; tokOf(Tf, 'm1', 't_gob').hidden = true;
    const tfA = tgKeys(Tf.N.targetsFor('u_a')), tfB = tgKeys(Tf.N.targetsFor('u_b')); Tf.conns.forEach(c => { c.sent.length = 0; }); Tf.N.broadcastTargets(); const tfOut = Tf.conns.map(c => c.sent.filter(m => m.type === 'targets').map(m => tgKeys(m.targets)));
    check('hidden pieces: on a fogged table each player\'s own copy of the pointers drops one at a hidden token for everyone (Bea\'s pointer at the hidden goblin reaches neither) and one at a creature that player does not see for them alone (Ana\'s pointer at the orc Bea cannot see); no broadcast, nothing to a waiting or closed connection',
        tfA === 'u_a' && tfB === '' && j(tfOut) === j([['u_a'], [''], [], []]) && Tf.bcast.length === 0, j([tfA, tfB, tfOut]));

    // 158 (the owner by prompt, 2026-10-18: "From your selected token (Recommended)"): a pointer one of the GM's characters holds, keyed by its token,
    // goes to no one while that token is hidden, waiting, gone or on another map, and on a fogged table to no player whose sight drops that token
    const Ta = scen(); Ta.camp.items.m2.whiteboard.push({ id: 't_far', isChar: true, x: 0, y: 0 });
    Ta.net.targets = { 'tk:t_gob': { id: 't_ana', mapId: 'm1', name: 'Goblin', from: 't_gob' }, 'tk:t_zz': { id: 't_ana', mapId: 'm1', name: 'Gone', from: 't_zz' }, 'tk:t_far': { id: 't_ana', mapId: 'm1', name: 'Far', from: 't_far' }, u_a: { id: 't_orc', mapId: 'm1', name: 'Ana' } };
    const ta0 = tgKeys(Ta.N.targetsFor('u_a')); tokOf(Ta, 'm1', 't_gob').hidden = true; const ta1 = tgKeys(Ta.N.targetsFor('u_a')); tokOf(Ta, 'm1', 't_gob').hidden = false; tokOf(Ta, 'm1', 't_gob').waiting = true; const ta2 = tgKeys(Ta.N.targetsFor(null)); delete tokOf(Ta, 'm1', 't_gob').waiting;
    const Tb = scen({ fog: true, drops: { u_b: { t_gob: 1 } } }); Tb.net.targets = { 'tk:t_gob': { id: 't_ana', mapId: 'm1', name: 'Goblin', from: 't_gob' } };
    const tbA = tgKeys(Tb.N.targetsFor('u_a')), tbB = tgKeys(Tb.N.targetsFor('u_b')); Tb.conns.forEach(c => { c.sent.length = 0; }); Tb.N.broadcastTargets(); const tbOut = Tb.conns.map(c => c.sent.filter(m => m.type === 'targets').map(m => tgKeys(m.targets)));
    const CT = new Function(fnSrc('function cleanTargets(', '\n}\n', 'cleanTargets', 'netfight.js') + '\n}\nreturn cleanTargets;')();
    const ct = CT({ 'tk:a': { id: 'x', mapId: 'm', name: 'A', from: 'a' }, 'tk:b': { id: 'x', mapId: 'm', from: 'c' }, u_a: { id: 'x', mapId: 'm', from: 'a' }, ['tk:' + 'L'.repeat(78)]: { id: 'x', mapId: 'm', from: 'L'.repeat(78) }, 'tk:n': { id: 'x', mapId: 'm', from: 5 } });
    check('158 a pointer one of the GM\'s characters holds (net.js targetTok and targetsFor, run for real): sent while its token is shown on the target\'s map; to no one while that token is hidden, waiting, gone or on another map; on a fogged table to no player whose sight drops it, each player their own copy; and a player\'s app keeps its source only where the pointer\'s key names that very token',
        ta0 === 'tk:t_gob,u_a' && ta1 === 'u_a' && ta2 === 'u_a' && tbA === 'tk:t_gob' && tbB === '' && j(tbOut) === j([['tk:t_gob'], [''], [], []])
        && ct['tk:a'].from === 'a' && !('from' in ct['tk:b']) && !('from' in ct.u_a) && !('tk:' + 'L'.repeat(78) in ct) && !('from' in ct['tk:n']), j([ta0, ta1, ta2, tbA, tbB, tbOut, ct]));
    // setTargetAs (the host's alone) and what targets a token for the facing rules (aimsOf), sliced by their targetas markers and run for real
    const taS = between('// [netcheck:targetas-start]', '// [netcheck:targetas-end]', 'targetas', 'netfight.js');
    const mkTA = (role, o) => {
        o = o || {}; const st = { applied: [], bc: 0, toasts: [] }, net = { active: role !== 'off', role: role === 'off' ? 'host' : role, targets: {} };
        const N = new Function('net', 'applyTarget', 'broadcastTargets', 'toast', 'getActiveCampaign', 'fogDrop', 'mapFogged', taS + '\nreturn net;')(net,
            (pid, name, t) => { st.applied.push([pid, name, t && JSON.parse(JSON.stringify(t))]); if (t) { net.targets[pid] = { id: t.id, mapId: t.mapId, name: name }; if (typeof t.from === 'string') net.targets[pid].from = t.from; } else delete net.targets[pid]; },
            () => { st.bc++; }, t => st.toasts.push(t), () => o.camp || null, (c, m, pid) => (o.drops && o.drops[pid]) || null, m => !!(m && m.fog && m.fog.on === true));
        return { N, st, net };
    };
    const orcT = { id: 't_orc', isChar: true, charName: 'Orc', x: 100, y: 300 }, H1 = mkTA('host');
    const as1 = H1.N.setTargetAs(orcT, 't_ana', 'm1', 'Ana'), as1T = j(H1.net.targets), as1B = H1.st.bc, as2 = H1.N.setTargetAs(orcT, 't_ana', 'm1', 'Ana'), as2T = j(H1.net.targets);
    const asNo = [H1.N.setTargetAs(orcT, 't_orc', 'm1'), H1.N.setTargetAs({ id: 'x'.repeat(78) }, 't_ana', 'm1'), H1.N.setTargetAs(null, 't_ana', 'm1'), H1.N.setTargetAs(orcT, 5, 'm1'), mkTA('client').N.setTargetAs(orcT, 't_ana', 'm1'), mkTA('off').N.setTargetAs(orcT, 't_ana', 'm1')];
    const me = { id: 't_me', isChar: true, ownerId: 'u_p', x: 100, y: 100 }, hidT = { id: 't_hid', isChar: true, hidden: true, x: 400, y: 100 }, qTok = { id: 't_q', isChar: true, ownerId: 'u_q', charId: 'c_q', x: 100, y: 0 }, waitT = { id: 't_w', waiting: true, isChar: true, x: 0, y: 0 };
    const mapA = { id: 'm1', type: 'map', fog: { on: false }, whiteboard: [me, orcT, hidT, qTok, waitT] };
    const tgA = { 'tk:t_orc': { id: 't_me', mapId: 'm1', from: 't_orc' }, 'tk:t_hid': { id: 't_me', mapId: 'm1', from: 't_hid' }, u_q: { id: 't_me', mapId: 'm1' }, 'tk:t_me': { id: 't_me', mapId: 'm1', from: 't_me' }, 'tk:t_w': { id: 't_me', mapId: 'm1', from: 't_w' }, 'tk:t_odd': { id: 't_me', mapId: 'm1', from: 't_orc' }, u_x: { id: 't_me', mapId: 'm2' }, u_z: { id: 't_orc', mapId: 'm1' } };
    const H2 = mkTA('host', { camp: {} }); H2.net.targets = tgA;
    const ids = l => l.map(w => w.id).join();
    const aimGm = ids(H2.N.aimsOf(mapA, me)), aimP = ids(H2.N.aimsOf(mapA, me, 'u_p'));
    const mapF = Object.assign({}, mapA, { fog: { on: true } }), H3 = mkTA('host', { camp: {}, drops: { u_p: { t_orc: 1 } } }); H3.net.targets = tgA; const aimFog = ids(H3.N.aimsOf(mapF, me, 'u_p')), aimFogGm = ids(H3.N.aimsOf(mapF, me));
    const C1 = mkTA('client'); C1.net.targets = tgA; const aimC = ids(C1.N.aimsOf(mapA, me, 'u_p')), aimOff = ids(mkTA('off').N.aimsOf(mapA, me));
    check('158 setTargetAs and aimsOf (the targetas slice, run for real): the host keys a pointer of one of the GM\'s characters by its token, with its name and its source, sends the pointers and says so, and the same again clears it; refused for the token itself, a key too long, no token, an id that is no text, a player\'s app and no table; what targets a token is each attacker\'s own token on that map (a player\'s character, one of the GM\'s characters), never the token itself, a waiting token, a source its key does not name, another map\'s pointer or one at another token; judged for a player on the host, never an attacker the GM hid or their sight drops; for the GM every one; a player\'s app reads its own copy',
        as1 === true && as1T === j({ 'tk:t_orc': { id: 't_ana', mapId: 'm1', name: 'Orc', from: 't_orc' } }) && as1B === 1 && as2 === true && as2T === '{}' && H1.st.bc === 2 && /Orc is targeting Ana/.test(H1.st.toasts[0]) && asNo.every(x => x === false)
        && aimGm === 't_orc,t_hid,t_q' && aimP === 't_orc,t_q' && aimFog === 't_q' && aimFogGm === 't_orc,t_hid,t_q' && aimC === 't_orc,t_hid,t_q' && aimOff === '', j([as1T, asNo, aimGm, aimP, aimFog, aimFogGm, aimC]));
    // 1.5.9 (the owner's game of 2026-10-25, by prompt: "Both places"): net.clearTargetOf, the GM taking a player's pointer off (or one of the GM's
    // characters'), run for real in the targetas slice beside the real broadcastTargets and targetsFor of the combats slice, on a table with fog and one without
    const ctRun = (o) => {
        const S = scen(o.fog ? { fog: true, drops: {} } : undefined), st = { toasts: [], applied: [] };
        S.net.myId = 'u_gm'; S.net.targets = { u_a: { id: 't_orc', mapId: 'm1', name: 'Ana <b>' }, u_b: { id: 't_gob', mapId: 'm1', name: 'Bea' }, 'tk:t_gob': { id: 't_orc', mapId: 'm1', name: 'Goblin', from: 't_gob' } };
        if (o.role) S.net.role = o.role;
        const N = new Function('net', 'applyTarget', 'broadcastTargets', 'toast', 'getActiveCampaign', 'fogDrop', 'mapFogged', taS + '\nreturn net;')(S.net,
            (pid, name, t) => { st.applied.push([pid, name, t]); if (t) S.net.targets[pid] = t; else delete S.net.targets[pid]; }, () => S.N.broadcastTargets(), t => st.toasts.push(t), () => S.camp, () => null, () => false);
        S.conns.forEach(c => { c.sent.length = 0; }); const b0 = S.bcast.length;
        const ret = o.pids.map(p => N.clearTargetOf(p));
        const per = S.conns.map(c => c.sent.filter(m => m.type === 'targets').map(m => tgKeys(m.targets)));
        return { ret, left: tgKeys(S.net.targets), per, bc: S.bcast.slice(b0).filter(m => m.type === 'targets').map(m => tgKeys(m.targets)), toasts: st.toasts };
    };
    const ctF = ctRun({ fog: true, pids: ['u_a'] }), ctU = ctRun({ pids: ['u_a', 'tk:t_gob'] }), ctNo = ctRun({ pids: ['u_zz', '', 5, null, '__proto__', 'x'.repeat(81)] }), ctP = ctRun({ role: 'client', pids: ['u_a'] });
    check('1.5.9 net.clearTargetOf (the targetas slice run for real with the real broadcastTargets and targetsFor): the host takes a player\'s pointer off and the pointers go to everyone afresh, each player\'s own copy on a fogged table and the one broadcast on a table without, with the cleared pointer in none of them; one of the GM\'s characters\' pointers is cleared the same way; the GM is told whose it was, the name as given (the notice sets it as text); a key that holds no pointer, one that is no text, empty, too long or a prototype\'s name changes nothing and sends nothing; nothing on a player\'s app',
        j(ctF.ret) === j([true]) && ctF.left === 'tk:t_gob,u_b' && ctF.per.slice(0, 2).every(l => l.length === 1 && !/u_a/.test(l[0])) && ctF.bc.length === 0 && j(ctF.toasts) === j(['Ana <b>\u2019s target is cleared.'])
        && j(ctU.ret) === j([true, true]) && ctU.left === 'u_b' && j(ctU.bc) === j(['tk:t_gob,u_b', 'u_b']) && j(ctU.toasts) === j(['Ana <b>\u2019s target is cleared.', 'Goblin\u2019s target is cleared.'])
        && ctNo.ret.every(r => r === false) && ctNo.left === 'tk:t_gob,u_a,u_b' && ctNo.bc.length === 0 && ctNo.per.every(l => l.length === 0) && ctNo.toasts.length === 0
        && j(ctP.ret) === j([false]) && ctP.left === 'tk:t_gob,u_a,u_b' && ctP.toasts.length === 0, j([ctF, ctU, ctNo, ctP]));
    const ioSrcM0 = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'io.js'), 'utf8').replace(/\r\n/g, '\n'), undoLine = (ioSrcM0.match(/\n[^\n]*if \(hosting\) \{ window\.wpNet\.applyingRemote = true; save\(true\);[^\n]*/) || [''])[0];
    check('fold M0 (source): the GM\'s undo while hosting (io.js), saved as a remote change so the host\'s save hook returns early, calls net.syncCombatHidden itself, after the map and the other maps it undid went out',
        undoLine.length > 0 && /window\.wpNet\.sendItem\(camp\.id, item\.id\);[^\n]*wUndo\.forEach\([^\n]*broadcastItemFiltered[^\n]*\}\); if \(window\.wpNet\.syncCombatHidden\) window\.wpNet\.syncCombatHidden\(\); \}/.test(undoLine), undoLine.slice(0, 400));
    // the host's save calls it right after the map it saved went out (the map first, the token gone from it), run for real: net.onLocalSave sliced whole, over stubs
    const olsSrc = fnSrc('net.onLocalSave = function() {', '\n};\n', 'onLocalSave') + '\n};';
    const SYNCS = ['syncStance', 'syncSounds', 'syncMusic', 'syncSystem', 'syncSenses', 'syncDocStyle', 'syncCampName', 'syncTurnRules', 'syncLibrary', 'syncNewPlayers', 'syncCampFog', 'syncClock'];
    const runSave = (s, patch) => {
        const log = [], real = s.net.syncCombatHidden;
        SYNCS.forEach(k => { s.net[k] = () => log.push(k); });
        s.net.sendItem = (c, i) => { log.push('sendItem:' + i); s.conns.forEach(cn => { if (cn.open && s.net.roster[cn.peer]) cn.send({ type: 'item', campId: c, itemId: i }); }); };
        s.net.syncCombatHidden = () => { log.push('combatHidden'); real(); };
        new Function('net', 'window', 'activeItemPatch', 'quickHash', '_lastPatchHash', 'broadcast', 'scheduleStageFollow', 'getActiveMap', 'checkRoomHandouts', olsSrc)(
            s.net, {}, () => (patch ? { campId: 'k', itemId: 'm1', item: { id: 'm1' } } : null), () => 'h', {}, m => log.push('broadcast:' + m.type), () => log.push('follow'), () => null, () => {});
        s.net.onLocalSave(); s.net.syncCombatHidden = real; return log;
    };
    const Ls = scen(); tokOf(Ls, 'm1', 't_gob').hidden = true; Ls.rollRow('Goblin'); Ls.start(); Ls.net.syncCombatHidden(); tokOf(Ls, 'm1', 't_gob').hidden = false; Ls.conns.forEach(c => { c.sent.length = 0; });   // fold 2's review: hidden from the start, shown before the save, so the players' copies change
    const lsHost = runSave(Ls, true), lsWire = Ls.conns[0].sent.map(m => m.type), lsRows = rowsOf(Ls.last(Ls.conns[0]));
    const lsNoPatch = runSave(Ls, false);
    Ls.net.role = 'client'; Ls.net.foreign = true; Ls.net.syncedPeer = Ls.conns[0].peer; const lsCli = runSave(Ls, true); Ls.net.role = 'host'; Ls.net.foreign = false; Ls.net.syncedPeer = null; Ls.net.applyingRemote = true; const lsRemote = runSave(Ls, true); Ls.net.applyingRemote = false;
    check('fold M0: the host\'s save (net.onLocalSave, run for real) calls net.syncCombatHidden once, right after the map went out (sendItem) — a player gets the map (the token on it again) first, then the combats (its row whole now); a save with no map to send still calls it once; a player\'s save and a remote change\'s save never do',
        j(lsHost) === j(SYNCS.concat(['sendItem:m1', 'combatHidden', 'follow'])) && j(lsWire) === j(['item', 'combats']) && j(lsRows) === j(order)
        && j(lsNoPatch) === j(SYNCS.concat(['combatHidden', 'follow'])) && lsCli.indexOf('combatHidden') < 0 && !lsCli.some(e => SYNCS.indexOf(e) >= 0) && lsCli.length > 0 &&j(lsRemote) === j([]), j([lsHost, lsWire, lsNoPatch, lsCli, lsRemote]));
    const wbAll = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'whiteboard.js'), 'utf8');
    check('fold M0 (source): combatHidden is defined once and read only by combatsFor and net.syncCombatHidden, inside the combats slice; net.syncCombatHidden is called once, from the host\'s save; the GM\'s own strip (whiteboard.js) reads neither; the host\'s message handler has the same number of branches as before (1.6.0, a deliberate change of this pin: blast-roll, the core\'s gap 8, a player\'s press of a blast card, makes the host\'s branches 34; 1.6.0 B5, a deliberate change of this pin: hit-ask, a player asking which locations their target has, makes them 35; 1.6.0, a deliberate change of this pin: sheet-out, a player asking the host\'s reader for a file of their own character, makes them 36; 1.6.2, a deliberate change of this pin: show-ask, a player asking to put drawings on the map, makes them 37)',
        (src.match(/function combatHidden\(/g) || []).length === 1 && (src.match(/combatHidden\(/g) || []).length === 3 && (cbSrc.match(/combatHidden\(/g) || []).length === 3
        && (src.match(/syncCombatHidden/g) || []).length === 3 && (cbSrc.match(/syncCombatHidden/g) || []).length === 1 && (olsSrc.match(/syncCombatHidden/g) || []).length === 2 && (cbSrc.match(/_combatHidSig = combatHidSigNow\(\);/g) || []).length === 1
        && !/combatsFor|combatHidden|syncCombatHidden/.test(wbAll) && (src.match(/msg\.type === '[a-z-]+' && net\.role === 'host'/g) || []).length === 49 /* 1.6.4 (Drop here, a deliberate change of this pin): drop, the 49th; 1.6.4 (a Notes page on every sheet, a deliberate change of this pin): char-qnote, the 48th; 1.6.4 (a player's name changed at the table, a deliberate change of this pin): profile-set, the 47th; 1.6.3 (the multiplayer review, finding 9): handout-want, the 46th; (defense fold 4): send-on, the 45th; (defense fold 1): land-take, the 44th; 1.6.2 (backlog 42): box, the 43rd; 1.6.2 Assist: help-act, the 42nd (moved on purpose) */,
        j([(src.match(/combatHidden\(/g) || []).length, (src.match(/syncCombatHidden/g) || []).length, (src.match(/msg\.type === '[a-z-]+' && net\.role === 'host'/g) || []).length]));
}

// From netcheck.js's closing block ("Finishing the test split", step 6), where it ran after every pending check (it leans on none of them):
    {   // 1.6.0, found by hand on a live table
        const flat = src.split('\r\n').join('\n'), cutN = (a, b) => { const i = flat.indexOf(a), k = flat.indexOf(b, i); if (i < 0 || k < 0) throw new Error('slice ' + a); return flat.slice(i, k); };
        const farS = cutN('function fightFar(c, pr, was, loc) {', 'function combatsSendTo(c, was) {'), said = [], blasts = [];
        const camp = { items: { m1: { meta: { title: 'Upper Deck' }, whiteboard: [{ id: 't1', charId: 'c1' }, { id: 't2', charId: 'c2' }] } }, chars: { c1: { ownerId: 'p1' }, c2: { ownerId: 'p2' } } };
        const nF = { combats: { f1: { rows: [{ tokId: 't1' }] } }, broadcastBlast: (w, m, ch, only) => blasts.push([w.x, m, ch, only && only.peer]) };
        const winF = { wpBlastsShown: m => (m === 'm1' ? [{ wire: { x: 7 }, charId: 'c9' }] : []) };
        const far = new Function('net', 'getActiveCampaign', 'fightsOn', 'sendFailed', 'window', farS + '\nreturn { fightFar: fightFar, blastsSendTo: blastsSendTo };')(nF, () => camp, m => (m === 'm1' ? ['f1'] : []), () => {}, winF), cF = { peer: 'pc', send: m => said.push(m) };
        far.fightFar(cF, { id: 'p1' }, 'm1', 'm2'); far.fightFar(cF, { id: 'p2' }, 'm1', 'm2'); far.fightFar(cF, { id: 'p1' }, 'm1', 'm1'); far.fightFar(cF, { id: 'p1' }, undefined, 'm2'); far.fightFar(cF, { id: 'p1' }, 'gone', 'm2');
        check('a player who leaves a map with their token still in its fight is told, by the map\'s name (fightFar, run for real): nobody else, nobody who stayed, no word for a first landing or a map that is gone',
            said.length === 1 && said[0].type === 'fightfar' && said[0].title === 'Upper Deck', JSON.stringify(said));
        far.blastsSendTo(cF, 'm1'); far.blastsSendTo(cF, 'm2'); far.blastsSendTo(cF, 7);
        check('one who comes to a map is told what the table was told stands there, alone (blastsSendTo, run for real): as it was sent, with its thrower so that an unseen NPC stays unnamed, and nothing for a map with none',
            JSON.stringify(blasts) === JSON.stringify([[7, 'm1', 'c9', 'pc']]) && flat.includes('if ((!only || c === only) && c.open && net.roster[c.peer] && net.roster[c.peer].location === mapId)'), JSON.stringify(blasts));
        const brS = cutN("    } else if (msg.type === 'fightfar' && net.role === 'client') {", "    } else if (msg.type === 'trigmsg' && net.role === 'client') {").replace('    } else if', 'if') + '}', toasts = [];
        const runB = (m, n, c) => new Function('msg', 'net', 'conn', 'toast', brS)(m, n, c, t => toasts.push(t));
        const okN = { role: 'client', foreign: true, syncedPeer: 'h', stream: false };
        runB({ type: 'fightfar', title: 'Deck' }, okN, { peer: 'h' }); runB({ type: 'fightfar', title: 'Deck' }, okN, { peer: 'x' }); runB({ type: 'fightfar', title: 7 }, okN, { peer: 'h' }); runB({ type: 'fightfar', title: 'Deck' }, Object.assign({}, okN, { stream: true }), { peer: 'h' });
        check('a player\'s app says the word from the synced host alone, as text, never in the stream window', JSON.stringify(toasts) === JSON.stringify(['You are still in the fight on Deck.']), JSON.stringify(toasts));
        const wasS = cutN('var _fightWas = Object.create(null);', 'function fightSet(fid, combat) {'), nW = {}; const wasF = new Function('net', wasS + '\nreturn _fightWas;')(nW); wasF.f1 = Object.create(null); wasF.f1.t1 = { init: 9, rolled: true };
        check('the host remembers what a token held when it left a fight (net.fightWas): by fight and token, nothing else answered, and the stored rows are noted as a roster edit drops them',
            nW.fightWas('f1', 't1').init === 9 && nW.fightWas('f1', 'zz') === null && nW.fightWas('f9', 't1') === null && require('./checkkit').part('netfight.js').includes('wn[r.tokId] = { init: r.init, rolled: r.rolled === 1 };'));
        check('a join the player began closes the Multiplayer window; a reconnect leaves it as it stands', flat.includes("if (conn.wpRetry !== true) { var nmJ = ui('netModal'); if (nmJ) nmJ.style.display = 'none'; }"));
    }

// 1.6.3 (the improvement week's combat review, finding 26: every Next drew the whole app again): the host's step of a fight that stays in its
// round sets the board's ring by onTurnHere with no redraw (whiteboard.js turnRings) and draws what shows whose turn it is (net.js
// combatRefreshTurn); a new round still draws everything (run for real, and the step's wiring)
{
    const wbF = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'whiteboard.js'), 'utf8').replace(/\r\n/g, '\n');
    const otA = wbF.indexOf('// [lookcheck:onturn-start]'), trA = wbF.indexOf('function turnRings() {'), trZ = wbF.indexOf('window.wpTurnRings = turnRings;');
    const ringSrc = otA >= 0 && trA > otA && trZ > trA ? wbF.slice(otA, trZ) : 'function turnRings() { throw new Error("markers"); }';
    const mkEl = on => { const s = new Set(on ? ['wb-turn'] : []); return { classList: { toggle: (c, v) => { if (v) s.add(c); else s.delete(c); }, has: c => s.has(c) } }; };
    const els = { t1: mkEl(true), t2: mkEl(false), t3: mkEl(false) }, wn = { active: true, fightsOn: m => (m === 'm1' ? ['f1', 'f2'] : []), combats: { f1: { rows: [{ tokId: 't1' }, { tokId: 't2' }], turn: 1 }, f2: { rows: [{ tokId: 't3' }], turn: 0 } } };
    const rings = new Function('getActiveMap', 'state', 'window', ringSrc + '\nreturn turnRings;')(() => ({ id: 'm1', type: 'map' }), { wbEls: els }, { wpNet: wn });
    const ran = rings(), on = Object.keys(els).filter(k => els[k].classList.has('wb-turn'));
    const crS = lineOf('function combatRefresh() {') + '\n' + src.slice(src.indexOf('function combatRefreshTurn() {'), src.indexOf('function roundChanged('));
    const runCR = w => { const calls = []; const win = Object.assign({ wpRenderCombatStrip: () => calls.push('strip'), wpRenderPartyStrip: () => calls.push('party'), wpPills: { sync: () => calls.push('pills') }, wpTrackers: { draw: () => calls.push('trackers') }, wpCharList: { sync: () => calls.push('chars') }, wpSheets: { tokenTurned: (a, b) => calls.push('turned:' + a + ':' + b) } }, w(calls));
        new Function('render', 'window', crS + '\nreturn combatRefreshTurn;')(() => calls.push('render'), win)(); return calls; };
    const light = runCR(calls => ({ wpTurnRings: () => { calls.push('rings'); return true; } })), none = runCR(() => ({})), off = runCR(calls => ({ wpTurnRings: () => { calls.push('rings'); return false; } }));
    check('finding 26 (whiteboard.js turnRings and net.js combatRefreshTurn, run for real): the ring on each drawn piece follows onTurnHere over every fight on the map with no redraw; a step within its round draws the ring, the strip, the party strip, the pills, the trackers, Characters and an open sheet\u2019s End turn, and never the whole app; where the board cannot set its rings, the whole draw as before',
        ran === true && j(on) === j(['t2', 't3']) && j(light) === j(['rings', 'strip', 'party', 'pills', 'trackers', 'chars', 'turned:null:true']) && j(none) === j(['render', 'strip']) && j(off) === j(['rings', 'render', 'strip']), j([ran, on, light, none, off]));
    check('finding 26 (source): the host\u2019s fight step draws only what shows whose turn it is while its round stays, and everything at a new round; a player\u2019s app still draws everything at every word of the fights',
        require('./checkkit').part('netfight.js').includes("    broadcastCombats(); if (c.round === r0 && typeof combatRefreshTurn === 'function') combatRefreshTurn(); else combatRefresh();") && wbF.includes('window.wpTurnRings = turnRings;'));
}

{   // 1.6.3 (the improvement week's combat review, batch "strip", finding 24): a redacted row is known by its mark (hid, 1), never by the name Hidden.
    // combatToasts run for real: a player's notice for a row they cannot see says someone they cannot see acts; cleanFightBody keeps the mark only as 1;
    // declare.js mineOf run for real: an NPC the GM really named Hidden is in the GM's Declaring box, and a redacted row is in no one's
    const flat = src.split('\r\n').join('\n'), pf = kit.part('netfight.js').split('\r\n').join('\n');
    const toS = pf.slice(pf.indexOf('function combatToasts(before, after) {'), pf.indexOf('// [netcheck:orders-end]')), said = [];
    const toF = new Function('getActiveCampaign', 'fightMineKey', 'chosenRule', 'toast', toS + '\nreturn combatToasts;')(() => ({ activeItemId: 'm1' }), (o) => (o && o.f1 ? 'f1' : null), () => false, t => said.push(t));
    const fHid = { f1: { round: 1, turn: 0, rows: [{ id: 'h0', name: 'Hidden', hid: 1 }, { id: 'r1', name: 'Hidden' }] } }, fName = { f1: { round: 1, turn: 1, rows: fHid.f1.rows } };
    toF(null, fHid); toF(fHid, fName); toF(fName, { f1: { round: 2, turn: 0, rows: fHid.f1.rows } });
    const cB = flat.slice(flat.indexOf('function cleanFightBody(k, mapId) {'), flat.indexOf('// [netcheck:notepad-start]')), clF = new Function(cB + '\nreturn cleanFightBody;')();
    const kept = clF({ rows: [{ id: 'h0', name: 'Hidden', hid: 1 }, { id: 'r1', name: 'Hidden', hid: true }, { id: 'r2', name: 'B', hid: 2 }] }, 'm');
    const dm = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'declare.js'), 'utf8').replace(/\r\n/g, '\n'), mineS = dm.slice(dm.indexOf('function own(o, k)'), dm.indexOf('function inOf(c, host)'));
    const mineOf = new Function('window', mineS.replace(/function fightOf[^\n]*\n/, '').replace(/function declaring[^\n]*\n/, '') + '\nreturn mineOf;')({});
    const mapD = { whiteboard: [{ id: 't_h', ownerId: '' }, { id: 't_p', ownerId: 'u_a' }] }, cD = { rows: [{ id: 'r_h', tokId: 't_h', name: 'Hidden' }, { id: 'r_p', tokId: 't_p', name: 'Pat' }, { id: 'h2', tokId: null, name: 'Hidden', hid: 1 }] };
    check('1.6.3 (finding 24, run for real): a player\'s turn notice for a row they cannot see says someone they cannot see acts, and a row the GM named Hidden says its name; cleanFightBody keeps the mark only as 1; the GM\'s Declaring box keeps an NPC named Hidden; a redacted row is no one\'s; and combatsFor and a drawn order\'s card count shown rows by the mark',
        j(said) === j(['Combat! Someone you cannot see acts.', "Hidden's turn.", 'Someone you cannot see acts. Round 2.']) && kept.rows[0].hid === 1 && !('hid' in kept.rows[1]) && !('hid' in kept.rows[2])
        && j(mineOf(cD, mapD, true, 'gm').map(r => r.id)) === j(['r_h']) && j(mineOf(cD, mapD, false, 'u_a').map(r => r.id)) === j(['r_p'])
        && flat.includes("var shownD = out[fid].rows.filter(function(r) { return r.hid !== 1; });") && flat.includes("return !!cp.rows[i] && cp.rows[i].hid !== 1; }), rec = mk(seen);") && !/name !== 'Hidden'/.test(flat) && !/name !== 'Hidden'/.test(dm),
        j([said, kept.rows]));
}

{   // 1.6.3 (the improvement week's combat review, batch "strip", finding 23): fightNextAt run for real, who acts next by the turn shape. The plain order is the row after
    // the one on turn, round to round; several turns a round walk the round's own turns, the same row again among them; a drawn order ends its round at its card; a counting
    // clock and a round whose order is made again (rolled every round, sides, a drawn order) have no next; Next is chosen is the strip's own; combatsFor sends nx only where
    // it is not the row after the one on turn; and turn notices say an action by its name, never with an article, nor its key
    const flat = src.split('\r\n').join('\n'), nxS = flat.slice(flat.indexOf("// 1.6.3 (the combat review's batch \"strip\", finding 23)"), flat.indexOf('net.fightNextAt = function(fid) {'));
    let IR = {}; const fna = new Function('initRulesOf', nxS + '\nreturn fightNextAt;')(() => IR), rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const at = (ir, c) => { IR = ir; return fna({}, Object.assign({ rows: rows }, c)); };
    const got = [at({}, { turn: 0 }), at({}, { turn: 2 }), at({ every: true }, { turn: 2 }), at({ side: 'pc' }, { turn: 1 }), at({ side: 'pc' }, { turn: 2 }), at({ deck: { key: 'D1' } }, { turn: 0, endAt: 2 }), at({ deck: { key: 'D1' } }, { turn: 1, endAt: 2 }),
        at({}, { turn: 1, endAt: 2 }), at({ clock: { cost: 3 } }, { turn: 0 }), at({ chosen: true }, { turn: 0 }), at({ several: { by: 'passes' } }, { turn: 0, seq: ['a', 'a', 'c'], sq: 0 }), at({ several: { by: 'passes' } }, { turn: 2, seq: ['a', 'a', 'c'], sq: 2 }),
        at({ every: true }, { turn: 2, seq: ['a', 'c'], sq: 1 }), fna({}, { rows: [] })];
    check('1.6.3 (finding 23, fightNextAt run for real): who acts next by the turn shape, -1 where it cannot be known now, null for Next is chosen; combatsFor sends it only where it is not the row after the one on turn; turn notices drop the article and never name an action by its key',
        j(got) === j([1, 0, -1, 2, -1, 1, -1, 0, -1, null, 0, 0, -1, -1])
        && flat.includes("var nxF = fightNextAt(camp, cmb); if (typeof nxF === 'number' && nxF !== (cmb.turn + 1) % cmb.rows.length) out[fid].nx = nxF;") && flat.includes("if (typeof k.nx === 'number' && Math.floor(k.nx) === k.nx && k.nx >= -1 && k.nx < rows.length) f.nx = k.nx;")
        && !/ used a ' \+ lbl/.test(flat) && !/'Used a ' \+ lbl/.test(flat) && !/lbl = a\.label \|\| a\.key/.test(flat) && !/String\(a\.label \|\| a\.key\)/.test(flat), j(got));
}

T.finish();
{ const { pathToFileURL } = require('url'); pendingChecks.push((async () => {
    // 1.6.4 (Fulllion, 2026-11-22, by prompt): a picture on a trigger zone or a place. net.js standFire run for real with the real placecore at a
    // player's final drop (who is shown it, how, and what the host records on the piece; the secrecy of a zone's message), and revealHandout run
    // for real with the real sceneKeys (the place's at goes to its stander alone, on the picture message, beside the scene's keys)
    const J = JSON.stringify;
    const PCn = await import(pathToFileURL(path.join(__dirname, '..', 'system', 'app', 'scripts', 'placecore.js')).href);
    const sfS = between('// [netcheck:standfire-start]', '// [netcheck:standfire-end]', 'standfire');
    const runSF = (pieces, o) => {
        o = o || {}; const shown = [], tok = Object.assign({ id: 't1', isChar: true, ownerId: 'u_a', x: 210, y: 210, w: 50, h: 50 }, o.tok || {});
        const map = { id: 'm1', type: 'map', rooms: [], whiteboard: [tok].concat(pieces) }, camp = { handouts: Object.assign({ h1: { id: 'h1', title: 'Map', src: '/saves/images/m.png' }, h2: { id: 'h2', kind: 'text', title: 'Letter', text: 'x' } }, o.hs || {}) };
        const net = { roster: Object.assign({ pA: { id: 'u_a', location: 'm1' }, pB: { id: 'u_b', location: 'm1' }, pC: { id: 'u_c', location: 'm2' } }, o.roster || {}), revealHandout: (hid, pids, x) => shown.push([hid, pids, x]) };
        const made = [], win = { wpPlaceCore: PCn, wpHandoutOf: (src, title) => { made.push([src, title, net.applyingRemote === true]); return 'h_new'; } };
        const SF = new Function('net', 'window', sfS + '\nreturn standFire;')(net, win);
        (o.drops || [o.from === undefined ? { x: 0, y: 0 } : o.from]).forEach(fr => SF({ peer: o.peer || 'pA', send() {} }, camp, map, tok, fr));
        return { shown: JSON.parse(J(shown)), made, pieces };
    };
    const Z = k => Object.assign({ id: 'z1', type: 'trigger', x: 200, y: 200, w: 100, h: 100, standPic: '/saves/images/Altar.png' }, k);
    const dflt = runSF([Z()], { drops: [{ x: 0, y: 0 }, { x: 0, y: 0 }] }), byHid = runSF([Z({ standPic: undefined, standHid: 'h1' })]), place = runSF([{ id: 'p1', type: 'mappin', x: 220, y: 220, w: 40, h: 40, place: true, placeName: 'Old Well', standPic: '/saves/images/Well.png' }]);
    check('1.6.4 a picture on a zone (standFire, run for real): a player\'s own token carried into it shows the zone\'s picture to that player alone, big and kept the first time and big alone after; the picture of the campaign\'s own goes as its handout, never under the zone\'s own name; a picture handout goes as itself; no place is named for a zone; the record goes on the zone',
        J(dflt.shown) === J([['h_new', ['u_a'], { scene: true, keep: true, at: null }], ['h_new', ['u_a'], { scene: true, keep: false, at: null }]]) && J(dflt.made) === J([['/saves/images/Altar.png', '', true], ['/saves/images/Altar.png', '', true]]) && J(dflt.pieces[0].standSeen) === J({ u_a: 2 })
        && J(byHid.shown) === J([['h1', ['u_a'], { scene: true, keep: true, at: null }]]) && !byHid.made.length,
        J([dflt.shown, byHid.shown]));
    const zPlace = runSF([Z({ place: true })]);
    check('1.6.4 on a place, a zone ticked Place among them, the stander is told which place (at: the map and the piece, to them alone); a new handout is titled by the picture\'s own name, never a place\'s, and its save is no step of the GM\'s (applyingRemote while it is made)',
        J(place.shown) === J([['h_new', ['u_a'], { scene: true, keep: true, at: { pid: 'u_a', map: 'm1', wb: 'p1' } }]]) && J(place.made) === J([['/saves/images/Well.png', '', true]]) && J(zPlace.shown[0][2].at) === J({ pid: 'u_a', map: 'm1', wb: 'z1' }), J([place, zPlace.shown]));
    const allOn = runSF([Z({ standWho: 'all' })], { drops: [{ x: 0, y: 0 }, { x: 0, y: 0 }] }), once = runSF([Z({ standWho: 'once', standJournal: false })], { drops: [{ x: 0, y: 0 }, { x: 0, y: 0 }] });
    check('1.6.4 Everyone on this map, once: the stander and every player on that map (never one on another map), kept, and never again; Each player once with no Journal copy: big once, then nothing',
        J(allOn.shown) === J([['h_new', ['u_a', 'u_b'], { scene: true, keep: true, at: null }]]) && allOn.pieces[0].standDone === true && J(allOn.pieces[0].standSeen) === J({ u_a: 2, u_b: 1 })
        && J(once.shown) === J([['h_new', ['u_a'], { scene: true, keep: false, at: null }]]), J([allOn.shown, once.shown]));
    const quiet = [
        runSF([Z({ hidden: true })]), runSF([Z({ mine: { dmg: '1d6' } })]), runSF([Z()], { from: { x: 210, y: 210 } }), runSF([Z()], { from: { x: 220, y: 230 } }), runSF([Z({ x: 300 })]),
        runSF([Z({ standPic: 'https://evil.example/a.png' })]), runSF([Z({ standPic: undefined, standHid: 'h2' })]), runSF([Z({ standPic: undefined, standHid: 'h9' })]), runSF([Z()], { peer: 'pX' }),
        runSF([{ id: 'r', type: 'rect', x: 200, y: 200, w: 100, h: 100, standPic: '/saves/images/a.png' }]), runSF([Z({ standScene: false, standSeen: { u_a: 2 } })])
    ];
    check('1.6.4 a picture says nothing for a zone the GM hid, a mine, a gesture that began on it (a turn in place, a shuffle inside), a token off it, a picture that is no board picture, a text or missing handout, a peer the roster does not know, a piece that is no place, or a stander who has it already with no scene to show; nothing is recorded then',
        quiet.every(r => r.shown.length === 0) && quiet.every(r => r.pieces.every(p => p.standSeen === undefined || J(p.standSeen) === J({ u_a: 2 }))), J(quiet.map(r => r.shown)));
    const zh = runSF([Z({ zoneHidden: true })]), first = runSF([Z({ standPic: undefined }), Z({ id: 'z2', standPic: '/saves/images/Second.png' })]), firstPic = runSF([Z({ id: 'z0', standPic: '/saves/images/First.png' }), Z({ id: 'z2', standPic: '/saves/images/Second.png' })]);
    check('1.6.4 a zone the GM unticked Players see this zone still shows its picture, as its message still comes up; the first piece found that carries a picture is the one that shows',
        zh.shown.length === 1 && J(first.made) === J([['/saves/images/Second.png', '', true]]) && J(firstPic.made) === J([['/saves/images/First.png', '', true]]), J([zh.shown, first.made, firstPic.made]));
    // the review of this feature: a piece with nothing to show now is passed over (a pin inside a hall); one that may carry no picture for now is left as it is
    const hall = { id: 'hall', type: 'rect', x: 0, y: 0, w: 1000, h: 1000, place: true, placeName: 'Hall', standPic: '/saves/images/Hall.png', standWho: 'once' }, pinIn = { id: 'p2', type: 'mappin', x: 220, y: 220, w: 40, h: 40, place: true, standPic: '/saves/images/Pin.png' };
    const inHall = runSF([hall, pinIn], { from: { x: 100, y: 100 } }), hallSeen = runSF([Object.assign({}, hall, { standSeen: { u_a: 2 } }), pinIn], { from: { x: 5000, y: 5000 } }), gone = runSF([Z({ standPic: undefined, standHid: 'h9' }), Z({ id: 'z2', standPic: '/saves/images/Second.png' })]);
    const mineKept = runSF([Z({ mine: { dmg: '1d6' }, standWho: 'once' })]), secretKept = runSF([{ id: 'sd', type: 'rect', x: 200, y: 200, w: 100, h: 100, blocksSight: true, sightType: 'door', secret: true, place: true, standPic: '/saves/images/a.png' }]);
    check('1.6.4 a piece with nothing to show now is passed over, so one under it may show its own: a pin inside a hall the token walked about in, a pin inside a hall already seen once, a zone after one whose handout is gone; a piece that may carry no picture for now (a mine, a secret door) is left as it is, its picture kept for when it may again',
        J(inHall.made) === J([['/saves/images/Pin.png', '', true]]) && J(hallSeen.made) === J([['/saves/images/Pin.png', '', true]]) && J(gone.made) === J([['/saves/images/Second.png', '', true]])
        && !mineKept.shown.length && mineKept.pieces[0].standPic === '/saves/images/Altar.png' && mineKept.pieces[0].standWho === 'once' && !secretKept.shown.length && secretKept.pieces[0].standPic === '/saves/images/a.png', J([inHall.made, hallSeen.made, gone.made, mineKept.pieces, secretKept.pieces]));
    const odd = runSF([Z({ standWho: 'all' })], { roster: { pA: { id: 'u.a:1', location: 'm1' } } });
    check('1.6.4 a player whose id holds a dot or a colon (net.js validProfileId allows them) is shown it and remembered like any other', J(odd.shown) === J([['h_new', ['u.a:1', 'u_b'], { scene: true, keep: true, at: null }]]) && J(odd.pieces[0].standSeen) === J({ 'u.a:1': 2, u_b: 1 }), J(odd));
    check('1.6.4 the pos gate asks standFire at a final drop after the zone\'s message, a mine and a zone\'s sound, through typeof, and a throw in it never stops the rest of the drop',
        /if \(window\.wpSoundOn\) window\.wpSoundOn\.zoneDrop\(map, w, frW\);[^\n]*\n\s*if \(typeof standFire === 'function'\) \{ try \{ standFire\(conn, camp, map, w, frW\); \} catch \(e\) \{ console\.error\(e\); \} \}/.test(src));

    // revealHandout, run for real: at only for the stander, only on the picture message
    const rvS = (() => { const i = src.indexOf('net.revealHandout = function(hid, pids, o) {'), e = src.indexOf('\n};\n', i); return src.slice(i, e + 3); })(), skS = between('// [netcheck:scenekeys-start]', '// [netcheck:scenekeys-end]', 'scenekeys');
    const runRV = async (o, kind) => {
        const sent = { a: [], b: [] }, camp = { id: 'c1', name: 'C', handouts: { h1: kind === 'text' ? { id: 'h1', kind: 'text', title: 'L' } : { id: 'h1', title: 'Map', src: '/saves/images/m.png' } } };
        const net = { active: true, role: 'host', conns: [{ open: true, peer: 'pA', send: m => sent.a.push(m) }, { open: true, peer: 'pB', send: m => sent.b.push(m) }], roster: { pA: { id: 'u_a', name: 'A' }, pB: { id: 'u_b', name: 'B' } } };
        const win = { wpHandoutPayload: async h => h.kind === 'text' ? { kind: 'text', text: 'x' } : { mime: 'image/png', data: new Uint8Array(2) } };
        const p = new Promise(res => { new Function('net', 'window', 'getActiveCampaign', 'getProfile', 'hostId', 'toast', 'sendFailed', 'save', 'logEvent', 'document', 'CustomEvent', skS + rvS + '\nreturn net.revealHandout;')(net, win, () => camp, () => ({ id: 'u_gm', name: 'GM' }), () => 'u_gm', () => {}, e => { throw e; }, () => {}, () => res(), { dispatchEvent() {} }, function() {})('h1', ['u_a', 'u_b'], o); setTimeout(res, 50); });
        await p; return { a: sent.a.map(m => ({ at: m.at, scene: m.scene, nokeep: m.nokeep })), b: sent.b.map(m => ({ at: m.at, scene: m.scene, nokeep: m.nokeep })), rev: camp.handoutReveals };
    };
    const rv1 = await runRV({ scene: true, keep: false, at: { pid: 'u_a', map: 'm1', wb: 'p1' } }), rv2 = await runRV({ scene: false, keep: true, at: { pid: 'u_a', map: 'm1', wb: 'p1' } }), rv3 = await runRV({ scene: true, at: { pid: 'u_a', map: 5, wb: 'p1' } }), rvT = await runRV({ at: { pid: 'u_a', map: 'm1', wb: 'p1' } }, 'text');
    check('1.6.4 revealHandout (run for real): a place\'s at goes on the picture message to its stander alone (the other player gets the same picture without it), beside a scene\'s keys or none; an at that is no three texts, or a text handout, says no place; a scene kept out of the Journals records no reveal, as before',
        J(rv1.a) === J([{ at: { map: 'm1', wb: 'p1' }, scene: true, nokeep: true }]) && J(rv1.b) === J([{ scene: true, nokeep: true }]) && !rv1.rev
        && J(rv2.a) === J([{ at: { map: 'm1', wb: 'p1' } }]) && J(rv2.b) === J([{}]) && !!rv2.rev && !!rv2.rev.u_a.h1 && !!rv2.rev.u_b.h1
        && J(rv3.a) === J([{ scene: true }]) && J(rvT.a) === J([{}]), J([rv1, rv2, rv3, rvT]));
})()); }

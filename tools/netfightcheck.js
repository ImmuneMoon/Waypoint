/* netfightcheck.js: the fights on the host, the tests that came out of netcheck.js with their area (docs/REFACTOR_SPLIT_PLAN.md, area 9,
   2026-11-19). The code lives mostly in system/app/scripts/netfight.js, a part of net.js; every slice of its markers (holds, charsplit,
   initfight, initround, turnhold, orders, targetas, ally, rangeto, targethit) and every definition only it holds is read from the part by
   its own name, while the slices of other areas (the combats' messages, the roll-req branch, the GM's own roll, the turn's start) still
   read the joined net.js through srcjoin.
   What it covers, each block as it stood in netcheck.js: a player's roll reading the range to their own pointer's target (range
   penalties R2) and kept to its roller and the GM while another player cannot see the target (R3), a called shot's location (B5: hit-ask
   and hit-rows, the GM's own roll), a player's End turn and the initiative folds O1 to O4 (a player's own roll into the fight, a hold, a
   roll each round, sides), a reminder card delivered to its player (T2b), a step back as a correction (fold 3 of backlog 152), fights by
   their own ids with two on one map (fold 2), a sheet given its own copy while a fight runs, and who holds whom.
   Run: node tools/netfightcheck.js   (exit 1 on any failure) */
require('./srcjoin').install();   // a split giant script reads joined, exactly as it was before the split (tools/srcjoin.js)
const fs = require('fs'), path = require('path');
const kit = require('./checkkit');   // what the suites that came out of the giant ones share (tools/checkkit.js)
const T = kit.suite('net'), check = T.check, pendingChecks = T.pending, packCheck = kit.packCheck;
// netcheck's slice helpers over the joined net.js; a call that names a part's file (netfight.js) reads that part by its own name
const { src, between, fnSrc, lineOf } = kit.netSlices('netfightcheck');
// the harness pieces netcheck keeps at its top, the very code (checkkit netHarness)
const { H, fightIn, mkConn } = kit.netHarness('netfightcheck');
const ordersSrc = between('// [netcheck:orders-start]', '// [netcheck:orders-end]', 'orders', 'netfight.js');
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
        /var rr = window\.wpSheets\.rollInit\(r\.charId, \{ priv: combatRollPriv\(draft\.mapId, r\.tokId\) \}\);/.test(wbU) && /window\.wpSheets\.rollInit\(rows\[i\]\.charId, \{ priv: combatRollPriv\(combatDraft\.mapId, rows\[i\]\.tokId\) \}\)/.test(wbU)
        && /rollInit\(ch\.id, \{ priv: !!\(tkI && \(tkI\.hidden \|\| \(typeof net\.tokUnseen === 'function' && net\.tokUnseen\(mapId, tkI\.id\)\)\)\) \}\)/.test(require('./checkkit').part('netfight.js')));
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
            && src.includes("function combatRowOut(r, i, unseen) { if (unseen) return { id: 'h' + i, name: 'Hidden', tokId: null, src: null }; var o = { id: r.id, name: r.name, tokId: r.tokId, src: r.src }; if (r.held === 1) o.held = 1; return o; }") && /if \(r\.rolled === 1 \|\| r\.rolled === true\) o\.rolled = 1;/.test(src));
    }
    const teSrc = between('// [netcheck:turnend-start]', '// [netcheck:turnend-end]', 'turnend');
    const runTE = (msg, o) => {
        o = o || {}; const steps = [];
        const map = { type: 'map', whiteboard: [{ id: 't_pat', isChar: true, charId: 'c_p', ownerId: 'u_a' }, { id: 't_orc', isChar: true, charId: 'c_o' }, { id: 't_sam', isChar: true, charId: 'c_s', ownerId: 'u_b' }, { id: 't_box', isChar: false, ownerId: 'u_a' }] };
        const camp = { items: { m1: map, m2: { type: 'map', whiteboard: [] } } };
        const net = { role: 'host', paused: !!o.paused, roster: { pA: { id: 'u_a', location: o.loc || 'm1' } }, combats: { m1: { mapId: 'm1', round: 1, turn: o.turn === undefined ? 1 : o.turn, rows: [{ id: 'r_orc', tokId: 't_orc' }, { id: 'r_pat', tokId: 't_pat' }, { id: 'r_sam', tokId: 't_sam' }, { id: 'r_box', tokId: 't_box' }, { id: 'r_trap', tokId: null }] } } };
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
    const S5 = ['id', 'mapId', 'round', 'turn', 'rows'].sort().join(','), S4 = ['mapId', 'round', 'turn', 'rows'].sort().join(',');   // the keys a fight is sent with, and an older host's
    const msgs = [A, B, C, D, E, F].reduce((all, Wd) => all.concat(...Wd.conns.map(c => c.sent.filter(m => m.type === 'combats'))), []);
    const snapA = A.api.combatsFor('u_a', 'mDocks'), hostile = { f_abcd1234: { mapId: 'mDocks', round: 2, turn: 0, rows: [{ id: 'r1', name: 'Kael', tokId: 't_kael' }], rh: 9, th: 3, turned: { c_kael: 9 } } };
    const cleanedF = A.api.cleanFights(hostile), cleanedC = A.api.cleanCombats({ mDocks: hostile.f_abcd1234 });
    const gG = { host: [A, F].map(Wd => Object.keys(Wd.net.combats).every(k => ['rh', 'th', 'turned'].every(x => Object.prototype.hasOwnProperty.call(Wd.net.combats[k], x)))), msgs: msgs.length,
        sent: msgs.every(m => /"(rh|th|turned)"/.test(J(m)) === false && keysOf(m.combats).every(s => s === S5)), snap: keysOf(snapA), cleaned: [keysOf(cleanedF), keysOf(cleanedC)] };
    check('fold 3 (run for real): rh, th and turned are the host\'s own — every fight here keeps all three, and none of them is in any copy of the fights a player was sent, in what the join snapshot carries (combatsFor), or in what a player\'s app keeps from a hostile host that names them (cleanFights, cleanCombats)',
        J(gG) === J({ host: [true, true], msgs: gG.msgs, sent: true, snap: [S5], cleaned: [[S5], [S4]] }) && gG.msgs > 20, J(gG));
    const rd3 = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n'), help3 = rd3('system/app/index.html'), notes3 = ['WHATSNEW.txt', 'system/app/assets/whatsnew.txt'].map(rd3);
    check('fold 3 (source): Help\'s combat entry says that a step back is a correction and runs nothing twice, naming the actions by the words their list shows, the Rolls entry says the round still goes back at a step back but runs an action once for each round reached, the timed effects say they count once a round, and both release notes say it under 1.5.5\'s Combat',
        help3.includes('<li>A step back with <b>&#9664;</b> on the turn strip is a correction. Going on again runs no <b>Also each round</b>, <b>Also at its turn&rsquo;s start</b> or <b>end</b> action twice, and counts no timed effect twice.</li>')
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
    const fsS = (() => { const p = require('./checkkit').part('netfog.js'), i = p.indexOf('function fogSeed(conn, mapId, out) {'), e = p.indexOf('\n}\n', i); return i < 0 || e < 0 ? 'function fogSeed() { throw new Error("fogSeed is not found"); }' : p.slice(i, e + 3); })();   // in netfog.js, a part of net.js
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
        && /el\.classList\.toggle\('wb-turn', onTurnHere\(window\.wpNet, activeMap\.id, item\.id\)\);/.test(wbSrcR) && (wbSrcR.match(/onTurnHere\(/g) || []).length === 2);
    check('fold 2 (source): the join snapshot says fights (true) and carries the fights on the map the player lands on; a player\'s app takes the word through typeof before it reads the snapshot\'s fights and reads every later copy by it; nothing of the host reads a fight by its map\'s id any more (net.js, whiteboard.js, pills.js and sheets.js); fights start, change and end in fightSet alone and end in combatOver alone; the host\'s branches are 31 (voice-up of voice chat, 1.5.9, the newest) (1.6.0, a deliberate change of this pin: blast-roll, the core\'s gap 8, a player\'s press of a blast card, makes the host\'s branches 34; 1.6.0 B5, a deliberate change of this pin: hit-ask, a player asking which locations their target has, makes them 35; 1.6.0, a deliberate change of this pin: sheet-out, a player asking the host\'s reader for a file of their own character, makes them 36; 1.6.2, a deliberate change of this pin: show-ask, a player asking to put drawings on the map, makes them 37)',
        /combats: combatsFor\(prof\.id, prof\.location\), fights: true,/.test(src) && /\n    if \(typeof fightsKnow === 'function'\) fightsKnow\(msg\.fights\);[^\n]*\n    net\.combats = typeof cleanFightsIn === 'function' \? cleanFightsIn\(msg\.combats\) : cleanCombats\(msg\.combats\);/.test(snapBody)
        && src.split('fightsKnow(').length === 3 && /var before = net\.combats, after = typeof cleanFightsIn === 'function' \? cleanFightsIn\(msg\.combats\) : cleanCombats\(msg\.combats\);/.test(src)
        && !/combats\[(mapId|am\.id|map\.id|activeMap\.id|combatDraft\.mapId|getActiveMap\(\)\.id|msg\.mapId|locQ|locA|pr\.location|mid)\]/.test(src + rdApp('scripts/whiteboard.js') + rdApp('scripts/pills.js') + rdApp('scripts/sheets.js'))
        && require('./checkkit').familyCount('net.js', /net\.combats\[fid\] = f;/g) === 1 && (src.match(/combatOver\(/g) || []).length === 4 && (src.match(/msg\.type === '[a-z-]+' && net\.role === 'host'/g) || []).length === 45 /* 1.6.3 (defense fold 4): send-on, the 45th; (defense fold 1): land-take, the 44th; 1.6.2 (backlog 42): box, the 43rd; 1.6.2 Assist: help-act, the 42nd (moved on purpose) */);
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

T.finish();

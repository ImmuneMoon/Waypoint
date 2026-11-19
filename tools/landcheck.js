/* landcheck.js: the defense folds 0 to 4, the tests that came out of netcheck.js with their area (docs/REFACTOR_SPLIT_PLAN.md, "Tests
   move with their area", 2026-11-18): an attack that lands on its target and waits there to be answered, the answers a defense may
   give, an attack sent on, and what a player who cannot see the attacker is told. The code lives in system/app/scripts/netattack.js
   (the attempt record, attland, ansline and sendon) and system/app/scripts/nethold.js (cardEnt), parts of net.js; every slice of
   their markers and cardEnt are read from the part by its own name, while the slices of other areas (rollreq, diceroll, npcseen,
   burst, landdeny, landtake, sendonbranch) still read the joined net.js through srcjoin.
   Run: node tools/landcheck.js   (exit 1 on any failure) */
require('./srcjoin').install();   // a split giant script reads joined, exactly as it was before the split (tools/srcjoin.js)
const fs = require('fs'), path = require('path');
const kit = require('./checkkit');   // what the suites that came out of the giant ones share (tools/checkkit.js)
const T = kit.suite('net'), check = T.check, pendingChecks = T.pending, packCheck = kit.packCheck;
// netcheck's slice helpers over the joined net.js; a call that names a part's file (netattack.js, nethold.js) reads that part by its own name
const { src, between, fnSrc, range } = kit.netSlices('landcheck');
const ordersSrc = between('// [netcheck:orders-start]', '// [netcheck:orders-end]', 'orders', 'netfight.js');
const j = JSON.stringify;
check('landcheck: netattack.js and nethold.js are parts of net.js, read by their own names', kit.part('netattack.js').includes('// [split:body-start]') && kit.part('nethold.js').includes('// [split:body-start]'));

// 1.6.3 (defense fold 0; Fulllion's decision 7 of 2026-11-17): where a called damage roll lands, end to end on both roll paths: a player's roll and the GM's own
// call for a damage roll as a card, and the card's press lands on the one its record names, however long it waited and wherever the roller points by then.
// roll-req, net.diceRoll and the attempt slice run for real with the real core and dice; invented names
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx0 = await import(url('formula.js')), Dx = await import(url('dicecore.js'));
    const src4 = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'net.js'), 'utf8').replace(/\r\n/g, '\n');
    const line = k => { const i = src4.indexOf(k); if (i < 0) throw new Error('netcheck: ' + k + ' not found'); return src4.slice(i, src4.indexOf('\n', i)); };
    const helpers = ['function own(', 'function peerProfileId(', 'function fxLib(', 'function itemLib(', 'function diceFrom('].map(line).join('\n') + '\n';
    const rqSrc = (ordersSrc + '\n' + between('// [netcheck:rollreq-start]', '// [netcheck:rollreq-end]', 'rollreq')), drSrc = between('// [netcheck:diceroll-start]', '// [netcheck:diceroll-end]', 'diceroll'), atSrc = between('// [netcheck:attempt-start]', '// [netcheck:attempt-end]', 'attempt', 'netattack.js');
    let dq = []; const Fx = Object.assign({}, Fx0, { evaluate: (e, o) => Fx0.evaluate(e, Object.assign({ random: () => { if (!dq.length) throw new Error('netcheck: no die left'); return dq.shift(); } }, o)) });
    const CK = '3d6 <= 12', sysL = Sx.cleanSystem({ v: 1, name: 'L', combat: { checks: 'under3d6' }, fields: [{ id: 'f_hp', key: 'HP', label: 'HP', kind: 'number', vis: 'all', edit: 'owner', def: 5 }],
        rolls: [{ id: 'r_swing', label: 'Swing', formula: CK, vis: 'all', calls: [{ roll: 'r_cut', when: 'hit' }, { roll: 'r_trip', when: 'miss' }] }, { id: 'r_cut', label: 'Cut', formula: '1d6', vis: 'all', dmg: true }, { id: 'r_trip', label: 'Trip', formula: '1d6', vis: 'all', dmg: true }] }, { F: Fx, gmView: true });
    const RG = { tid: 't_5', mapId: 'm1', mod: 0, dist: 5 };
    const world = () => { const out = { table: [], due: [], gm: [] };
        const tok = (id, charId, x, y) => ({ id, isChar: true, charId, x, y, w: 60, h: 52 }), wb = [Object.assign(tok('t_me', 'c_a', 0, 0), { ownerId: 'u_a' }), tok('t_5', 'c_1', 300, 0), tok('t_9', 'c_2', 600, 0)];
        const camp = { id: 'k', activeItemId: 'm1', system: sysL, chars: { c_a: { id: 'c_a', name: 'Kael', ownerId: 'u_a', values: {} }, c_1: { id: 'c_1', name: 'Pebbles', npc: true, values: {} }, c_2: { id: 'c_2', name: 'Coin', npc: true, values: {} } }, items: { m1: { id: 'm1', type: 'map', meta: { gridType: 'square' }, whiteboard: wb } } };
        const net = { role: 'host', active: true, stream: false, paused: false, conns: [], targets: {}, roster: { pA: { id: 'u_a', name: 'Pat', location: 'm1' } }, combats: {}, syncCharDelta: () => {}, postDue: (c, rr, kind, r, toO, more) => out.due.push({ ch: c.id, roll: rr.id, kind, att: more.att }), damageCard: () => {} };
        let rg = RG;
        const win = { wpFormula: Fx, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {}, tokenCtxFor: () => null }, wpVtt: { on: () => true, rulesOn: () => true } };
        const cA = { peer: 'pA', send(m) { packCheck(m); out.table.push(JSON.parse(JSON.stringify(m))); } };
        const W = new Function('net', 'DC', 'SC', 'window', 'getActiveCampaign', 'peerPaused', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'saveRemoteSoon', 'rangeTo', 'getProfile', 'toast', 'ui', 'save', 'var diceLimit = null, _diceSlowSaid = {}, _dicePending = null;\n' + helpers + atSrc + '\n' + drSrc + '\nreturn { rq: function(msg, conn) {\ndiceLimit = null; _diceSlowSaid = {};\n' + rqSrc + '\n}, dr: net.diceRoll };')(
            net, () => Dx, () => Sx, win, () => camp, () => false, e => { throw e; }, rec => { packCheck(rec); out.table.push(JSON.parse(JSON.stringify(rec))); }, rec => out.gm.push(JSON.parse(JSON.stringify(rec))), () => {}, () => {}, () => rg, () => ({ id: 'u_gm', name: 'GM' }), () => {}, () => null, () => {});
        const press = (act, dice, x) => { dq = dice.slice(); W.rq(Object.assign({ type: 'roll-req', rid: 'q' + Math.random().toString(36).slice(2, 7), charId: 'c_a', act, expr: CK }, x || {}), cA); };
        return { camp, net, out, W, press, aim: r => { rg = r; }, dq: d => { dq = d.slice(); } }; };
    const dmgOf = out => out.table.filter(m => m.type === 'roll' && m.dmg === 1).map(m => m.dmgOn === undefined ? 'nobody' : m.dmgOn);
    // a player's Swing hits: its Cut card lands on the one it was aimed at, after a hundred newer attempts and with the player now aimed elsewhere
    const w1 = world(); w1.press('r_swing', [2, 3, 3]); const cut1 = w1.out.due.filter(d => d.roll === 'r_cut')[0], kept1 = w1.net.attemptsKept();
    for (let i = 0; i < 101; i++) w1.net.blowMake(w1.camp.chars.c_a, 'r_x', {}, '', '', null, true);
    w1.aim({ tid: 't_9', mapId: 'm1', mod: 0, dist: 9 }); w1.press('r_cut', [4], { expr: '1d6', att: cut1 && cut1.att });
    const land1 = dmgOf(w1.out), gm1 = w1.out.gm.filter(m => m.dmg === 1).map(m => m.onName);
    w1.press('r_cut', [4], { expr: '1d6', att: cut1 && cut1.att }); const twice1 = w1.out.table.filter(m => m.type === 'roll-deny').length;
    check('1.6.3 Lands on, end to end (roll-req run for real): a player\'s hit posts its damage roll\'s card on a hard record kept apart, and its press, after a hundred and one newer attempts and with the player now aimed at another, lands on the one it was aimed at, named on the GM\'s own copy; a second press of that card is refused, not aimed again',
        cut1 && /^a_/.test(cut1.att) && kept1 === 0 && j(land1) === j(['c_1']) && j(gm1) === j(['Pebbles']) && twice1 === 1 && dmgOf(w1.out).length === 1, j([cut1, kept1, land1, gm1, twice1]));
    const w2 = world(); w2.press('r_swing', [6, 6, 6]); const trip2 = w2.out.due.filter(d => d.roll === 'r_trip')[0]; w2.press('r_trip', [2], { expr: '1d6', att: trip2 && trip2.att });
    const w3 = world(); w3.press('r_swing', [2, 3, 3]); const cut3 = w3.out.due.filter(d => d.roll === 'r_cut')[0]; delete w3.camp.chars.c_1; w3.press('r_cut', [4], { expr: '1d6', att: cut3 && cut3.att });
    const deny3 = w3.out.table.filter(m => m.type === 'roll-deny').map(m => m.message || (m.error && m.error.message) || '');
    const w4 = world(); w4.aim(null); w4.press('r_swing', [2, 3, 3]); const cut4 = w4.out.due.filter(d => d.roll === 'r_cut')[0]; w4.aim(RG); w4.press('r_cut', [4], { expr: '1d6', att: cut4 && cut4.att });
    check('1.6.3 ... a miss\'s card lands on the roller; a card whose target has left the campaign is refused in words, nothing rolled; a hit with no target lands on nobody, so the GM\'s Apply aims it, never on the roller',
        trip2 && j(dmgOf(w2.out)) === j(['c_a']) && deny3.length === 1 && /not in the campaign now/.test(deny3[0]) && dmgOf(w3.out).length === 0 && cut4 && j(dmgOf(w4.out)) === j(['nobody']), j([dmgOf(w2.out), deny3, dmgOf(w4.out)]));
    // the GM's own roll alike (net.diceRoll)
    const w5 = world(); w5.dq([2, 3, 3]); const g5 = w5.W.dr(CK, { charId: 'c_a', act: 'r_swing', range: RG }), cut5 = w5.out.due.filter(d => d.roll === 'r_cut')[0];
    w5.dq([4]); const p5 = w5.W.dr('1d6', { charId: 'c_a', act: 'r_cut', att: cut5 && cut5.att }), land5 = dmgOf(w5.out), gm5 = w5.out.gm.filter(m => m.dmg === 1).map(m => m.onName);
    w5.dq([4]); const again5 = w5.W.dr('1d6', { charId: 'c_a', act: 'r_cut', att: cut5 && cut5.att });
    check('1.6.3 ... the GM\'s own roll (net.diceRoll run for real): the same card lands on the same target, named on the GM\'s copy, and its second press is refused',
        g5 && g5.ok === true && cut5 && p5 && p5.ok === true && j(land5) === j(['c_1']) && j(gm5) === j(['Pebbles']) && again5 && typeof again5.error === 'string', j([g5, p5, land5, gm5, again5]));
})());
// 1.6.3 (defense fold 1; docs/DEFENSE_INTERACTIONS_DESIGN.md 4.0 and 4.1, Fulllion's decisions 1, 2 and 5 of 2026-11-17): an attack that names Its damage lands
// on its target, from the host's own record. roll-req, net.diceRoll, the attempt slice, the landing slice and the host's land-take branch run for real with the
// real core and dice; the table's sends, the cards and the GM's notices are recorded. Every way of landing, one answer a defense, a ceiling, the save and its
// reading back, Take it judged, the wait, and a press that spends nothing. Invented names
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx0 = await import(url('formula.js')), Dx = await import(url('dicecore.js'));
    const src5 = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'net.js'), 'utf8').replace(/\r\n/g, '\n');
    const line = k => { const i = src5.indexOf(k); if (i < 0) throw new Error('netcheck: ' + k + ' not found'); return src5.slice(i, src5.indexOf('\n', i)); };
    const helpers = ['function own(', 'function peerProfileId(', 'function fxLib(', 'function itemLib(', 'function diceFrom('].map(line).join('\n') + '\n';
    const rqSrc = (ordersSrc + '\n' + between('// [netcheck:rollreq-start]', '// [netcheck:rollreq-end]', 'rollreq')), drSrc = between('// [netcheck:diceroll-start]', '// [netcheck:diceroll-end]', 'diceroll'), atSrc = between('// [netcheck:attempt-start]', '// [netcheck:attempt-end]', 'attempt', 'netattack.js');
    const buSrc5 = between('// [netcheck:burst-start]', '// [netcheck:burst-end]', 'burst'), ldSrc5 = between('// [netcheck:landdeny-start]', '// [netcheck:landdeny-end]', 'landdeny');
    const lnSrc = between('// [netcheck:attland-start]', '// [netcheck:attland-end]', 'attland', 'netattack.js'), ltSrc = between('// [netcheck:landtake-start]', '// [netcheck:landtake-end]', 'landtake'), ceSrc = fnSrc('function cardEnt(camp, act, row, seen) {', '\n}\n', 'cardEnt', 'nethold.js') + '\n}\n', nsSrc5 = between('// [netcheck:npcseen-start]', '// [netcheck:npcseen-end]', 'npcseen');
    let dq = []; const Fx = Object.assign({}, Fx0, { evaluate: (e, o) => Fx0.evaluate(e, Object.assign({ random: () => { if (!dq.length) throw new Error('netcheck: no die left'); return dq.shift(); } }, o)) });
    const CK = '3d6 <= 12', DEF = '3d6 <= 10';
    const sysOf = combat => Sx.cleanSystem({ v: 1, name: 'L', combat: Object.assign({ checks: 'under3d6', turn: { acts: [{ key: 'attack', label: 'Attack', n: 1 }] } }, combat || {}), fields: [{ id: 'f_hp', key: 'HP', label: 'HP', kind: 'number', vis: 'all', edit: 'owner', def: 5 },
            { id: 'f_gun', key: 'Guns', label: 'Guns', kind: 'item-list', vis: 'all', edit: 'owner', list: { stats: [{ key: 'dmg', label: 'Damage' }], rolls: [{ label: 'Fire', formula: CK, resistBy: 'r_def', landDmg: 1 }, { label: 'Blast', formula: '1d6 + Row.dmg', dmg: true },
                { label: 'Mark', formula: CK, landDmg: 1, then: [{ s: 'dmg', formula: '7', set: true }] }, { label: 'Throw', formula: CK, landDmg: 1, then: [{ q: true, formula: '0', set: true }] }, { label: 'Aim', formula: CK, landDmg: 5 }, { label: 'Bad', formula: '1d6', dmg: true, showIf: 'Row.dmg > 100' }] } },
            { id: 'f_rifle', key: 'Rifles', label: 'Rifles', kind: 'item-list', vis: 'all', edit: 'owner', list: { rolls: [{ label: 'Spray', formula: CK, burst: 'attack', landDmg: 1 }, { label: 'Hits', formula: '1d6 + Row.bursthits', dmg: true }] } },
            { id: 'f_blade', key: 'Blades', label: 'Blades', kind: 'item-list', vis: 'all', edit: 'owner', list: { rolls: [{ label: 'Parry', formula: DEF, resist: true, thru: true }] } }],
        rolls: [{ id: 'r_swing', label: 'Swing', formula: CK, vis: 'all', resistBy: 'r_def', landDmg: 'r_cut', cost: 'attack' }, { id: 'r_shot', label: 'Shot', formula: CK, vis: 'all', landDmg: 'r_cut' }, { id: 'r_def', label: 'Dodge', formula: DEF, vis: 'all', resist: true },
            { id: 'r_cut', label: 'Cut', formula: '1d6', vis: 'all', dmg: true, cost: 'attack' }] }, { F: Fx, gmView: true });
    const RG = (tid, dist) => ({ tid, mapId: 'm1', mod: 0, dist: dist || 5, tb: 30, cgrade: 0 });
    const world = (combat, o) => { o = o || {}; const out = { table: [], sent: { pA: [], pB: [] }, due: [], gm: [], toasts: [], notes: [], over: [], spent: [], clock: [] };
        const tok = (id, charId, x) => ({ id, isChar: true, charId, x, y: 0, w: 60, h: 52 }), wb = [Object.assign(tok('t_me', 'c_a', 0), { ownerId: 'u_a' }), Object.assign(tok('t_b', 'c_b', 60), { ownerId: 'u_b' }), tok('t_5', 'c_1', 300), tok('t_9', 'c_2', 600)];
        const camp = { id: 'k', activeItemId: 'm1', system: sysOf(combat), chars: { c_a: { id: 'c_a', name: 'Kael', ownerId: 'u_a', values: { f_gun: [{ id: 'w_g1', def: { name: 'Pistol', stats: { dmg: 2 } } }, { id: 'w_g2', qty: 1, def: { name: 'Knife', stats: { dmg: 3 } } }], f_rifle: [{ id: 'w_r1', def: { name: 'Rifle' } }] } }, c_b: { id: 'c_b', name: 'Sela', ownerId: 'u_b', values: {} }, c_1: { id: 'c_1', name: 'Pebbles', npc: true, values: {} }, c_2: { id: 'c_2', name: 'Coin', npc: true, values: {} } }, items: { m1: { id: 'm1', type: 'map', meta: { gridType: 'square' }, whiteboard: wb } } };
        const conn = p => ({ peer: p, open: true, send(m) { packCheck(m); out.sent[p].push(JSON.parse(JSON.stringify(m))); } }), cA = conn('pA'), cB = conn('pB');
        const net = { role: 'host', active: true, stream: false, paused: false, conns: [cA, cB], targets: {}, roster: { pA: { id: 'u_a', name: 'Pat', location: 'm1' }, pB: { id: 'u_b', name: 'Bo', location: 'm1' } }, combats: o.fid ? { [o.fid]: { mapId: 'm1', rows: [] } } : {}, syncCharDelta: () => {},
            postDue: (c, rr, kind, r, toO, more) => out.due.push({ ch: c.id, roll: rr.id, kind, att: more && more.att, toO: !!toO, lnd: !!(more && more.lnd), on: more && more.on, onGm: more && more.onGm, now: !!(more && more.now), row: more && more.row }), damageCard: () => {}, dueOver: (att, say) => out.over.push([att, say]) };
        let rg = RG('t_5');
        const win = { wpFormula: Fx, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {}, tokenCtxFor: () => rg ? { range: rg } : null }, wpVtt: { on: () => true, rulesOn: () => true }, wpStepLog: () => {} };
        const W = new Function('net', 'DC', 'SC', 'window', 'getActiveCampaign', 'peerPaused', 'sendFailed', 'pushRoll', 'logEvent', 'saveRemoteSoon', 'rangeTo', 'getProfile', 'toast', 'ui', 'save', 'fogDrop', 'targetHitIn', 'turnNote', 'actSpend', 'clockPress', 'fightOfTok', 'pushChat', 'sendTable', 'fogDrop',
            'var diceLimit = null, _diceSlowSaid = {}, _dicePending = null, chatLog = [];\n' + helpers + ceSrc + nsSrc5 + '\n' + atSrc + '\n' + lnSrc + '\n' + buSrc5 + '\n' + drSrc + '\nreturn { rq: function(msg, conn) {\ndiceLimit = null; _diceSlowSaid = {};\n' + rqSrc + '\n}, take: function(msg, conn) {\ndiceLimit = null;\n' + ltSrc + '\n}, dr: net.diceRoll, answered: landAnswered, fightOver: landFightOver, stuck: net.landStuck, forgetAtt: attemptForget, rosterMoved: landRosterMoved, rec: function(id) { return _attempts[id]; }, land: function(id) { return _lands[id]; }, ids: function() { return _landIds.slice(); }, keep: landsKeep, back: landsBack, forget: function() { landForget(); attemptForget(); }, sweep: landSweep, attIds: function() { return _attIds.slice(); }, chat: function() { return chatLog; } };')(
            net, () => Dx, () => Sx, win, () => camp, () => false, e => { throw e; }, (rec, res) => out.gm.push({ rec: JSON.parse(JSON.stringify(rec)), v: res && res.value }), () => {}, () => {}, () => rg, () => ({ id: 'u_gm', name: 'GM' }), t => out.toasts.push(t), () => null, () => {}, () => null,
            (c, rc, row) => rc && typeof rc.tid === 'string' && /^w_/.test(row) ? { fn: () => 0, aim: () => ({ n: 'Arm' }), secret: () => false } : null, (c, t) => out.notes.push(t), (camp, id) => { out.spent.push(id); return ''; }, (camp, id) => out.clock.push(id), () => o.fid || null, () => {}, rec => { packCheck(rec); out.table.push(JSON.parse(JSON.stringify(rec))); }, () => null);
        const press = (act, expr, dice, x, who) => { dq = dice.slice(); const rid = 'q' + Math.random().toString(36).slice(2, 7); const m = Object.assign({ type: 'roll-req', rid, charId: who === 'pB' ? 'c_b' : 'c_a', expr }, act ? { act } : {}, x || {}); Object.keys(m).forEach(k => { if (m[k] === undefined) delete m[k]; }); W.rq(m, who === 'pB' ? cB : cA); return rid; };
        const due = (roll, kind) => { const d = out.due.filter(x => x.roll === roll && (!kind || x.kind === kind)); return d.length ? d[d.length - 1] : null; };
        const dmg = () => out.gm.filter(m => m.rec.dmg === 1).map(m => m.rec.dmgOn === undefined ? 'nobody' : m.rec.dmgOn);
        return { camp, net, out, W, win, press, due, dmg, cA, cB, aim: r => { rg = r; }, dq: d => { dq = d.slice(); } }; };

    // (a) a hit that nothing resists lands at once: the damage card to the attacker's player, stamped on its target; pressed later with the pointer elsewhere it lands
    // there, spends no action, and a second press is refused
    const wA = world(); wA.press('r_shot', CK, [2, 3, 3]); const cA = wA.due('r_cut', 'called'), recA = cA && wA.W.rec(cA.att), lnA = cA && wA.W.land(cA.att);
    wA.aim(RG('t_9', 9)); const spentA0 = wA.out.spent.length; wA.press('r_cut', '1d6', [4], { att: cA && cA.att }); const landA = wA.dmg(), spentA = wA.out.spent.length - spentA0, clockA = wA.out.clock.length;
    wA.press('r_cut', '1d6', [4], { att: cA && cA.att }); const twiceA = wA.out.sent.pA.filter(m => m.type === 'roll-deny').length; const spentC0 = wA.out.spent.length; wA.press('r_cut', '1d6', [3]); const ctlA = wA.out.spent.length - spentC0;
    check('1.6.3 (defense fold 1) a hit that names Its damage and nothing resists lands at once (roll-req run for real): its damage card goes to the attacker\'s player marked as a landing, names whom it landed on, its record kept apart from the other attempts and stamped on that target; pressed with the pointer now on another it lands on the first, spends no action and moves no counting clock; a second press is refused and the landing is gone',
        !!cA && /^a_/.test(cA.att) && cA.toO === true && cA.lnd === true && cA.on === 'Pebbles' && !!recA && recA.charId === 'c_a' && recA.act === 'r_cut' && recA.land && recA.land.on === 'c_1' && wA.W.attIds().indexOf(cA.att) < 0 && !!lnA && lnA.st === 'card' && lnA.to === 'c_1' && lnA.atk === 1 && lnA.hops === 0
        && j(landA) === j(['c_1']) && spentA === 0 && clockA === 1 && twiceA === 1 && ctlA === 1 && !wA.W.land(cA.att) && wA.W.ids().length === 0 && wA.out.over.some(x => x[0] === cA.att && x[1] === 'rolled'), j([cA, recA, lnA, landA, spentA, clockA, twiceA]));

    // (b) an attack that waits for its defense: a Dodge that fails lands it, one that succeeds stops it; a hundred newer attempts never push the waiting one out
    const wB = world(); wB.press('r_swing', CK, [2, 3, 3]); const dB = wB.due('r_def', 'resist'), wtB = dB && JSON.parse(JSON.stringify(wB.W.land(dB.att))), keptB = dB ? wB.W.attIds().indexOf(dB.att) : 0;
    for (let i = 0; i < 101; i++) wB.net.blowMake(wB.camp.chars.c_a, 'r_x', {}, '', '', null, true);
    wB.dq([6, 6, 6]); const gB = wB.W.dr(DEF, { charId: 'c_1', act: 'r_def', att: dB && dB.att }), cB = wB.due('r_cut', 'called'), lB = cB && wB.W.land(cB.att);
    const wB2 = world(); wB2.press('r_swing', CK, [2, 3, 3]); const dB2 = wB2.due('r_def', 'resist'); wB2.dq([2, 2, 2]); const gB2 = wB2.W.dr(DEF, { charId: 'c_1', act: 'r_def', att: dB2 && dB2.att });
    check('1.6.3 (defense fold 1) an attack with Resisted by and Its damage waits for the defense, its card marked so it offers Take it, the attempt kept apart so a hundred and one newer attempts never push it out; a Dodge that fails (net.diceRoll run for real) lands it, the damage card going to the attacker under the very same record id, stamped on the defender, and the defense card said over; a Dodge that succeeds stops it, no card and no landing left',
        !!dB && dB.lnd === true && dB.toO === false && !!wtB && wtB.st === 'wait' && keptB < 0 && gB && gB.ok === true && !!cB && cB.att === dB.att && cB.toO === true && !!lB && lB.st === 'card' && wB.W.rec(cB.att).land.on === 'c_1' && wB.out.over.some(x => x[0] === dB.att && x[1] === 'land')
        && !!dB2 && gB2 && gB2.ok === true && !wB2.due('r_cut', 'called') && !wB2.W.land(dB2.att) && wB2.W.ids().length === 0, j([dB, wtB, keptB, gB, cB, gB2]));

    // (c) Take it: judged on the host by the record alone (the land-take branch run for real): another player's is refused in words, the defender's lands it; a defense pressed after is refused; a card being rolled refuses it
    const wC = world(); wC.aim(RG('t_b')); wC.press('r_swing', CK, [2, 3, 3]); const dC = wC.due('r_def', 'resist');
    wC.W.take({ type: 'land-take', att: dC && dC.att }, wC.cA); const noteC1 = wC.out.notes.slice(), stillC = !!(dC && wC.W.land(dC.att) && wC.W.land(dC.att).st === 'wait');
    wC.W.take({ type: 'land-take', att: dC && dC.att }, wC.cB); const cC = wC.due('r_cut', 'called');
    wC.press('r_def', DEF, [6, 6, 6], { att: dC && dC.att }, 'pB'); const lateC = wC.out.sent.pB.filter(m => m.type === 'roll-deny').length;
    wC.W.take({ type: 'land-take', att: dC && dC.att }, wC.cB); const noteC2 = wC.out.notes.slice(noteC1.length);
    const wC2 = world(); wC2.aim(RG('t_b')); wC2.press('r_swing', CK, [2, 3, 3]); const dC2 = wC2.due('r_def', 'resist'); wC2.W.rec(dC2.att).busy = 1; wC2.W.take({ type: 'land-take', att: dC2.att }, wC2.cB);
    wC2.W.take({ type: 'land-take', att: 'zz' }, wC2.cB); const odd2 = wC2.out.notes.length;
    check('1.6.3 (defense fold 1) Take it (the host\'s land-take branch run for real): the defense card went to the defender\'s player; Take it from another player is refused in words and lands nothing; the defender\'s own lands the attack at once and the damage card goes to the attacker; a defense pressed after that is refused, and a second Take it says the attack is answered; a card being rolled refuses it; a message that is no record\'s id is not answered',
        !!dC && dC.toO === true && noteC1.length === 1 && /not yours/.test(noteC1[0]) && stillC && !!cC && cC.att === dC.att && lateC === 1 && noteC2.length === 1 && /answered already/.test(noteC2[0])
        && /being rolled/.test(wC2.out.notes[0] || '') && wC2.W.land(dC2.att).st === 'wait' && odd2 === 1, j([dC, noteC1, cC, lateC, noteC2, wC2.out.notes]));

    // (d) the GM's No defense, and the system's wait: lands after its time, held while the table is paused or the defender's player is away
    const wD = world(); wD.press('r_swing', CK, [2, 3, 3]); const dD = wD.due('r_def', 'resist'), ndD = wD.net.landNoDefense(dD.att), cD = wD.due('r_cut', 'called'), ndD2 = wD.net.landNoDefense(dD.att);
    const wE = world({ defenseWait: 30 }); wE.aim(RG('t_b')); wE.press('r_swing', CK, [2, 3, 3]); const dE = wE.due('r_def', 'resist'), lE = wE.W.land(dE.att), hasUntil = typeof lE.until === 'number' && lE.until - lE.at === 30000;
    lE.until = Date.now() - 1; wE.net.paused = true; wE.W.sweep(); const heldPaused = wE.W.land(dE.att).st === 'wait';
    wE.net.paused = false; wE.W.land(dE.att).until = Date.now() - 1; wE.net.conns = [wE.cA]; wE.W.sweep(); const heldAway = wE.W.land(dE.att).st === 'wait';
    wE.net.conns = [wE.cA, wE.cB]; wE.W.land(dE.att).until = Date.now() - 1; wE.W.sweep(); const cE = wE.due('r_cut', 'called');
    check('1.6.3 (defense fold 1) the GM\'s No defense lands an attack waiting on an NPC\'s defense and a second press says it is answered; a system\'s wait (combat.defenseWait, 30 seconds) is kept on the landing, holds while the table is paused and while the defender\'s player is away, and then lands the attack',
        ndD === true && !!cD && cD.att === dD.att && ndD2 === false && hasUntil && heldPaused && heldAway && !!cE && cE.att === dE.att, j([ndD, cD, ndD2, lE, heldPaused, heldAway, cE]));

    // (e) who rolls it: now (rolled at once, as the attacker, landing on the target) and both (the card, and the GM's Roll it now)
    const wF = world({ landBy: 'now' }); wF.press('r_shot', CK, [2, 3, 3, 5]); const nowF = wF.dmg(), cardF = wF.due('r_cut', 'called'), fromF = (wF.out.gm.filter(m => m.rec.dmg === 1)[0] || { rec: {} }).rec.from;
    const wG = world({ landBy: 'both' }); wG.press('r_shot', CK, [2, 3, 3]); const cG = wG.due('r_cut', 'called'); wG.dq([5]); const rnG = wG.net.landNow(cG.att), landG = wG.dmg(), againG = wG.net.landNow(cG.att);
    check('1.6.3 (defense fold 1) When an attack lands: rolled at once, the damage is rolled on the host as the attacker, from the player whose press it was, and lands on the target with no card; with both, the attacker\'s card says the GM may roll it at once, the GM\'s Roll it now rolls it on the target, and a second is refused',
        j(nowF) === j(['c_1']) && !cardF && !!fromF && fromF.id === 'u_a' && !!cG && cG.now === true && cG.toO === true && rnG === true && j(landG) === j(['c_1']) && againG === false, j([nowF, cardF, fromF, cG, rnG, landG, againG]));

    // (f) a list's attack names a damage roll of its own list: the card names the row, the record the row as it stood; pressed after the row has gone it still rolls from it
    const wH = world(); wH.press(undefined, CK, [2, 3, 3], { act: undefined, row: { f: 'f_gun', r: 'w_g1', i: 0 } }); const dH = wH.due('r_def', 'resist');
    wH.dq([6, 6, 6]); wH.W.dr(DEF, { charId: 'c_1', act: 'r_def', att: dH && dH.att }); const cH = wH.due('r_row', 'called'), lH = cH && wH.W.land(cH.att);
    wH.camp.chars.c_a.values.f_gun = []; wH.press(undefined, '1d6 + Row.dmg', [4], { act: undefined, row: { f: 'f_gun', r: 'w_g1', i: 1 }, att: cH && cH.att }); const vH = (wH.out.gm.filter(m => m.rec.dmg === 1)[0] || {}).v, onH = wH.dmg();
    check('1.6.3 (defense fold 1) a list\'s attack whose Its damage is a roll of its own list: the defense waits, then the damage card names that roll on the attacking row, and the landing keeps the row as it stood; pressed after the row has gone, the host lays it back and rolls 4 + its damage 2 on the target',
        !!dH && !!cH && cH.row && cH.row.f === 'f_gun' && cH.row.r === 'w_g1' && cH.row.i === 1 && !!lH && lH.rowCopy && lH.rowCopy.id === 'w_g1' && vH === 6 && j(onH) === j(['c_1']), j([dH, cH, lH, vH, onH]));

    // (g) the save: a landing in a fight that runs is kept with it and comes back as data (its attempt, its wait, the GM's copy of its card); one with no fight is not saved,
    // and is said to the GM by name when the table lets it go
    const wK = world(undefined, { fid: 'f_aaaaaaaa' }); wK.press('r_swing', CK, [2, 3, 3]); const dK = wK.due('r_def', 'resist'), kept = JSON.parse(JSON.stringify(wK.W.keep()));
    wK.camp.fights = { list: {}, lands: kept }; wK.W.forget(); const goneK = wK.out.toasts.slice(); wK.W.back(kept, wK.camp); const backK = JSON.parse(JSON.stringify(wK.W.land(dK.att))), attK = JSON.parse(JSON.stringify(wK.W.rec(dK.att)));
    wK.dq([6, 6, 6]); wK.W.dr(DEF, { charId: 'c_1', act: 'r_def', att: dK.att }); const cK = wK.due('r_cut', 'called');
    const hostile = [{ id: 'a_zzzzzzzz', st: 'wait', by: 'c_a', to: 'c_a', range: RG('t_5'), dmg: 'r_cut', att: {} }, { id: 'bad', st: 'card' }, { id: 'a_yyyyyyyy', st: 'card', by: 'c_a', to: 'c_1', range: { tid: 't_5' }, dmg: 'r_cut' }, { id: 'a_xxxxxxxx', st: 'wait', by: 'c_a', to: 'c_1', range: RG('t_5'), dmg: 'r_cut', att: { charId: 'c_2', lw: 'a_xxxxxxxx' } }, null, 7];
    const wK2 = world(); const nBad = wK2.W.back(hostile, wK2.camp);
    // 1.6.3 (the review of defense fold 2, finding 1): a waiting landing whose Defend is answered with a row keeps the rows it offered (withs) through the save, so the
    // card put back after a reload still answers "Defend with Blade"; before, landAttRead read them not, and every press was refused as gone
    const sysWr = Sx.cleanSystem({ v: 1, name: 'L', combat: { checks: 'under3d6' }, fields: [{ id: 'f_hp', key: 'HP', label: 'HP', kind: 'number', vis: 'all', edit: 'owner', def: 5 }, { id: 'f_bl', key: 'Blades', label: 'Blades', kind: 'item-list', vis: 'all', edit: 'owner', list: { stats: [{ key: 'Def', label: 'Defense' }] } }],
        rolls: [{ id: 'r_swing', label: 'Swing', formula: CK, vis: 'all', resistBy: 'r_dw', landDmg: 'r_cut' }, { id: 'r_dw', label: 'Defend', formula: '3d6 <= Row.Def - AttemptMargin', vis: 'all', resist: true, withRow: 'f_bl' }, { id: 'r_cut', label: 'Cut', formula: '1d6', vis: 'all', dmg: true }] }, { F: Fx, gmView: true });
    const wW = world(undefined, { fid: 'f_aaaaaaaa' }); wW.camp.system = sysWr; wW.camp.chars.c_1.values = { f_bl: [{ id: 'w_b1', def: { name: 'Blade', stats: { Def: 11 } } }] };
    wW.press('r_swing', CK, [2, 3, 3]); const dW = wW.due('r_dw', 'resist'), keptW = JSON.parse(JSON.stringify(wW.W.keep()));
    wW.camp.fights = { list: {}, lands: keptW }; wW.W.forget(); wW.W.back(keptW, wW.camp); const attW = dW && wW.W.rec(dW.att) ? JSON.parse(JSON.stringify(wW.W.rec(dW.att))) : null;
    wW.dq([6, 6, 6]); const gW = dW ? wW.W.dr('3d6 <= Row.Def - AttemptMargin', { charId: 'c_1', act: 'r_dw', att: dW.att, with: { f: 'f_bl', r: 'w_b1' } }) : null; const cW = wW.due('r_cut', 'called');
    check('1.6.3 (the review of defense fold 2, finding 1) a waiting landing whose Defend is answered with a row keeps the row it offered through the save and back (landAttRead reads withs), so Defend with Blade still answers it after a reload, and a failed defense lands the damage',
        !!dW && !!attW && j(attW.withs) === j(['r_dw#f_bl#w_b1']) && attW.act === '' && !!gW && gW.ok === true && !!cW && cW.att === dW.att, j([dW, attW, gW, cW]));
    const wL = world(); wL.press('r_swing', CK, [2, 3, 3]); wL.W.forget(); const goneL = wL.out.toasts.slice();
    check('1.6.3 (defense fold 1) the landings of a fight that runs are saved with it as data and come back as the table opens: kept silently when the save holds them, the waiting attempt rebuilt so a defense that fails then lands it; a saved landing that does not read (to itself, no range, a defense of another character, junk) is left out; one with no fight is not saved and is said to the GM by name when the table lets it go',
        Array.isArray(kept) && kept.length === 1 && kept[0].att && kept[0].att.lw === dK.att && goneK.length === 0 && !!backK && backK.st === 'wait' && !!attK && attK.charId === 'c_1' && !!cK && cK.att === dK.att
        && nBad === 0 && goneL.length === 1 && /Kael.s attack on Pebbles did not land/.test(goneL[0]), j([kept.length, goneK, backK, attK, cK, nBad, goneL]));

    // (h) the ceiling: at most LAND_MAX a fight, the oldest let go and said to the GM by name
    const wM = world(); for (let i = 0; i < 201; i++) wM.press('r_swing', CK, [2, 3, 3]); const idsM = wM.W.ids(), toastM = wM.out.toasts.filter(t => /did not land/.test(t));
    check('1.6.3 (defense fold 1) at most 200 landings wait in one fight: the 201st lets the oldest go, its card said over and the GM told by name why',
        idsM.length === 200 && toastM.length === 1 && /Kael.s attack on Pebbles did not land: 200 were waiting in that fight/.test(toastM[0]) && wM.out.over.some(x => x[1] === 'gone'), j([idsM.length, toastM]));

    // (j) the review of fold 1, finding 1: the landing is made once the attack's own Then and its burst have run, so the row it keeps is the row as this very
    // shot left it. A Then that sets the row's damage to 7 is read by the damage card pressed later (4 + 7) and by a damage rolled at once (5 + 7); a burst's
    // marks are there (Row.bursthits 1: 4 + 1); a Then that uses the row up keeps the row as it stood before it (4 + its 3)
    const wJ = world(); wJ.press(undefined, CK, [2, 3, 3], { act: undefined, row: { f: 'f_gun', r: 'w_g1', i: 2 } }); const cJ = wJ.due('r_row', 'called'), dmgJ = wJ.camp.chars.c_a.values.f_gun[0].def.stats.dmg;
    wJ.press(undefined, '1d6 + Row.dmg', [4], { act: undefined, row: { f: 'f_gun', r: 'w_g1', i: 1 }, att: cJ && cJ.att }); const vJ = (wJ.out.gm.filter(m => m.rec.dmg === 1)[0] || {}).v;
    const wJn = world({ landBy: 'now' }); wJn.press(undefined, CK, [2, 3, 3, 5], { act: undefined, row: { f: 'f_gun', r: 'w_g1', i: 2 } }); const vJn = (wJn.out.gm.filter(m => m.rec.dmg === 1)[0] || {}).v;
    const wJb = world(); wJb.press(undefined, CK, [2, 3, 3], { act: undefined, row: { f: 'f_rifle', r: 'w_r1', i: 0 } }); const cJb = wJb.due('r_row', 'called'), lJb = cJb && wJb.W.land(cJb.att);
    wJb.press(undefined, '1d6 + Row.bursthits', [4], { act: undefined, row: { f: 'f_rifle', r: 'w_r1', i: 1 }, att: cJb && cJb.att }); const vJb = (wJb.out.gm.filter(m => m.rec.dmg === 1)[0] || {}).v;
    const wJt = world(); wJt.press(undefined, CK, [2, 3, 3], { act: undefined, row: { f: 'f_gun', r: 'w_g2', i: 3 } }); const cJt = wJt.due('r_row', 'called'), goneJt = !wJt.camp.chars.c_a.values.f_gun.some(x => x.id === 'w_g2'), lJt = cJt && wJt.W.land(cJt.att);
    wJt.press(undefined, '1d6 + Row.dmg', [4], { act: undefined, row: { f: 'f_gun', r: 'w_g2', i: 1 }, att: cJt && cJt.att }); const vJt = (wJt.out.gm.filter(m => m.rec.dmg === 1)[0] || {}).v;
    check('1.6.3 (the review of defense fold 1) the landing is made after the attack\'s own Then and its burst (roll-req run for real): a Then that sets the row\'s damage to 7 is read by the damage card pressed later (4 + 7) and by a damage rolled at once (5 + 7); a burst\'s marks are kept on the row it holds (Row.bursthits 1: 4 + 1); a Then that uses the row up keeps the row as it stood before it, so its damage still reads it (4 + 3)',
        !!cJ && dmgJ === 7 && vJ === 11 && vJn === 12 && !!cJb && !!lJb && lJb.rowCopy && lJb.rowCopy.bu && lJb.rowCopy.bu.h[0] === 1 && vJb === 5 && !!cJt && goneJt && !!lJt && lJt.rowCopy && lJt.rowCopy.id === 'w_g2' && vJt === 7, j([cJ, dmgJ, vJ, vJn, lJb && lJb.rowCopy, vJb, goneJt, vJt]));

    // (k) findings 2, 3, 10 and 11: a refused Take it is answered with land-deny beside its words, which makes the player's card live again (the client's
    // branch run for real); a damage rolled at once that cannot be rolled comes to the GM as a card; a system damage roll the player's view does not hold
    // with the same formula goes to the GM; the GM's copy names whom it landed on whatever the player is told; Roll it now while the attacker's player is away
    const wK3 = world(); wK3.aim(RG('t_b')); wK3.press('r_swing', CK, [2, 3, 3]); const dK3 = wK3.due('r_def', 'resist'); wK3.W.take({ type: 'land-take', att: dK3 && dK3.att }, wK3.cA); const denyK3 = wK3.out.sent.pA.filter(m => m.type === 'land-deny');
    wK3.net.paused = true; wK3.W.take({ type: 'land-take', att: dK3 && dK3.att }, wK3.cB); const denyK3b = wK3.out.sent.pB.filter(m => m.type === 'land-deny'); wK3.net.paused = false;
    const ldRun = (m0, msg, peer) => { const chat = m0.map(x => Object.assign({}, x)); let drawn = 0; new Function('net', 'DC', 'chatLog', 'renderChatSoon', 'msg', 'conn', ldSrc5)({ foreign: true, syncedPeer: 'pH', stream: false }, () => Dx, chat, () => { drawn++; }, msg, { peer: peer || 'pH' }); return { chat, drawn }; };
    const ldA = ldRun([{ due: { att: 'a_abcd1234' }, done: true }, { due: { att: 'a_zzzz9999' }, done: true }, { due: { att: 'a_abcd1234' }, done: true, over: 1 }], { type: 'land-deny', att: 'a_abcd1234' }), ldB = ldRun([{ due: { att: 'a_abcd1234' }, done: true }], { type: 'land-deny', att: 'a_abcd1234' }, 'pX'), ldC = ldRun([{ due: { att: 'a_abcd1234' }, done: true }], { type: 'land-deny', att: '<b>' });
    const wKn = world({ landBy: 'now' }); wKn.press(undefined, CK, [2, 3, 3], { act: undefined, row: { f: 'f_gun', r: 'w_g1', i: 4 } }); const cKn = wKn.due('r_row', 'called'), lKn = cKn && wKn.W.land(cKn.att), toastKn = wKn.out.toasts.filter(t => /could not be rolled/.test(t));
    const wKv = world(); const pvKv = wKv.win.wpSheets.playerSystem; wKv.win.wpSheets.playerSystem = c => { const v = pvKv(c); v.rolls = v.rolls.filter(r => r.id !== 'r_cut'); return v; }; wKv.press('r_shot', CK, [2, 3, 3]); const cKv = wKv.due('r_cut', 'called');
    const wKs = world(); wKs.press('r_shot', CK, [2, 3, 3]); const cKs = wKs.due('r_cut', 'called'), stuckHere = wKs.W.stuck(cKs && cKs.att); wKs.net.conns = [wKs.cB]; const stuckAway = wKs.W.stuck(cKs && cKs.att); wKs.dq([5]); const nowKs = wKs.net.landNow(cKs && cKs.att), onKs = wKs.dmg();
    check('1.6.3 (the review of defense fold 1) a refused Take it is said in words and answered with land-deny (another player\'s, and one while the table is paused), which makes that player\'s card live again: the client\'s branch (run for real) clears the pressed mark of that attempt\'s card alone, never one that is over, and only from the synced host and for a record id; a damage rolled at once that cannot be rolled (Shown where fails) is said to the GM and comes to the GM as a card; a system damage roll the player\'s view does not hold goes to the GM; the GM\'s copy names whom it landed on; while the attacker\'s player is away the GM may roll it now under any setting',
        denyK3.length === 1 && denyK3[0].att === dK3.att && denyK3b.length === 1 && ldA.chat[0].done === false && ldA.chat[1].done === true && ldA.chat[2].done === true && ldA.drawn === 1 && ldB.chat[0].done === true && ldB.drawn === 0 && ldC.chat[0].done === true
        && !!cKn && cKn.toO === false && cKn.lnd === true && cKn.row && cKn.row.i === 5 && !!lKn && lKn.st === 'card' && toastKn.length === 1 && wKn.dmg().length === 0
        && !!cKv && cKv.toO === false && !!cKs && cKs.toO === true && cKs.onGm === 'Pebbles' && stuckHere === false && stuckAway === true && nowKs === true && j(onKs) === j(['c_1']), j([denyK3, ldA, cKn, lKn && lKn.st, toastKn, cKv, cKs, stuckHere, stuckAway, nowKs]));

    // (l) finding 4: a parry on a row ticked Takes the blow lands the attack with that row kept on the landing and stamped on its damage roll's record, so
    // the window names it however late the card is pressed (net.thruOf forgets after two minutes); finding 8: a defense card offers Take it only where a
    // landing will be made, so an attack whose damage roll is no damage roll now gets a defense card with no Take it and makes no landing
    const wL2 = world(); wL2.camp.chars.c_1.values = { f_blade: [{ id: 'w_b1', def: { name: 'Saber' } }] }; wL2.press('r_swing', CK, [2, 3, 3]); const dL2 = wL2.due('r_def', 'resist'); wL2.W.answered(wL2.camp, dL2 && dL2.att, true, { f: 'f_blade', r: 'w_b1', i: 0 });
    const lL2 = dL2 && wL2.W.land(dL2.att), cL2 = wL2.due('r_cut', 'called'); wL2.press('r_cut', '1d6', [4], { att: cL2 && cL2.att }); const recL2 = (wL2.out.gm.filter(m => m.rec.dmg === 1)[0] || { rec: {} }).rec, tableL2 = wL2.out.table.filter(m => m.dmg === 1);
    const wL3 = world(); wL3.camp.system.rolls.filter(r => r.id === 'r_cut')[0].dmg = false; wL3.press('r_swing', CK, [2, 3, 3]); const dL3 = wL3.due('r_def', 'resist');
    check('1.6.3 (the review of defense fold 1) a parry ticked Takes the blow on this row lands the attack with that row on the landing and on its damage roll\'s record, the GM\'s copy alone, never the table\'s, so the window names it however late; a defense card offers Take it only where a landing will be made: with its damage roll no damage roll now, the defense card has no Take it and no landing is made',
        !!lL2 && lL2.thru === 'w_b1' && !!cL2 && recL2.thru === 'w_b1' && tableL2.every(m => m.thru === undefined) && !!dL3 && dL3.lnd === false && wL3.W.ids().length === 0, j([lL2, cL2, recL2.thru, tableL2.map(m => m.thru), dL3]));

    // (m) findings 6 and 7: a fight that ends (End combat or its map deleted: combatOver asks landFightOver, never at the session's end) lets go of its
    // landings, waiting or as cards, each said to the GM by name, so a reload never loses one unsaid; the wait lets go of an attack whose attacker is gone;
    // an attempt landForget kept for its fight's save is not wiped by attemptForget
    const wM2 = world(undefined, { fid: 'f_aaaaaaaa' }); wM2.press('r_swing', CK, [2, 3, 3]); wM2.press('r_shot', CK, [2, 3, 3]); const nM2 = wM2.W.ids().length, goneM2 = wM2.W.fightOver('f_aaaaaaaa'), sayM2 = wM2.out.toasts.filter(t => /did not land: its fight ended/.test(t)), keepM2 = wM2.W.keep().length;
    const wM3 = world({ defenseWait: 30 }); wM3.press('r_swing', CK, [2, 3, 3]); const dM3 = wM3.due('r_def', 'resist'); delete wM3.camp.chars.c_a; wM3.W.land(dM3.att).until = Date.now() - 1; wM3.W.sweep(); const sayM3 = wM3.out.toasts.filter(t => /its attacker is gone/.test(t)), leftM3 = wM3.W.land(dM3.att);
    const wM4 = world(); wM4.press('r_swing', CK, [2, 3, 3]); const dM4 = wM4.due('r_def', 'resist'); wM4.net.blowMake(wM4.camp.chars.c_a, 'r_x', {}, '', '', null, true); wM4.W.forgetAtt(); const keptM4 = !!wM4.W.rec(dM4.att) && wM4.W.attIds().length === 0;
    check('1.6.3 (the review of defense fold 1) a fight that ends lets go of its landings, the waiting one and the card alike, each said to the GM by name, the cards said over, nothing left to save; the wait lets go of an attack whose attacker is gone, said by name, never waiting on; attemptForget keeps the attempt of a landing still held and lets every other go',
        nM2 === 2 && goneM2 === 2 && sayM2.length === 1 && /Kael.s attack on Pebbles; Kael.s attack on Pebbles did not land/.test(sayM2[0]) && keepM2 === 0 && wM2.W.ids().length === 0 && wM2.out.over.filter(x => x[1] === 'gone').length === 2
        && sayM3.length === 1 && !leftM3 && keptM4, j([nM2, goneM2, sayM2, keepM2, sayM3, keptM4]));

    // (i) the source: the host's branches gain land-take alone; the snapshot says lands; a player's app reads it through typeof; the save, the reload and the session's end ask the slice
    check('1.6.3 (defense fold 1, source): the host\'s land-take branch sits before card-act and asks landClose with the sender\'s own profile id; the snapshot says lands (true) and applySnapshot reads it through typeof beside hits; fightsKeep saves landsKeep, fightsRead hands the landings on as data, fightsBack asks landsBack; diceSessionReset asks landForget before attemptForget; roll-req and net.diceRoll each drop a landing once its damage is rolled and ask landAfter once after attemptMake',
        /\} else if \(msg\.type === 'land-take' && net\.role === 'host'\) \{\n        \/\/ \[netcheck:landtake-start\]/.test(src5) && src5.indexOf("landClose(getActiveCampaign(), msg.att, 'take', peerProfileId(conn))") > 0 && src5.indexOf("    } else if (msg.type === 'land-take' && net.role === 'host') {") < src5.indexOf("    } else if (msg.type === 'card-act' && net.role === 'host') {")
        && /stance: net\.stanceFlags\(\), lands: true, stanceCamps:/.test(src5) && require('./checkkit').part('netfog.js').includes("hitsKnow(msg.hits); if (typeof landsKnow === 'function') landsKnow(msg.lands);") && require('./checkkit').familyCount('net.js', 'landsKnow(') === 2
        && src5.includes("var lnK = typeof landsKeep === 'function' ? landsKeep() : []; if (lnK.length) bodyK.lands = lnK;") && src5.includes('lands: Array.isArray(raw.lands) ? raw.lands : null') && src5.includes('if (back.lands && typeof landsBack === \'function\')')
        && src5.indexOf("if (typeof landForget === 'function') landForget();") < src5.indexOf("    if (typeof attemptForget === 'function') attemptForget();   // 1.6.0 (B2)") && src5.split('landDone(blowRec').length === 3 && src5.split('landAfter(camp').length === 4
        /* the review of fold 1: landAfter runs after burstAfter in both roll paths; an attack that carries its damage keeps no pick in coverAims, and its landing's damage reads none; a fight that ends lets its landings go, never at the session's end */
        && src5.indexOf('landAfter(campQ') > src5.indexOf('burstAfter(campQ') && src5.indexOf('landAfter(campR') > src5.indexOf('burstAfter(campR') && src5.indexOf('landAfter(campR') < src5.indexOf('net.rollMade = ')
        && src5.includes("!(landEntQ && landEntQ.landDmg !== undefined) && typeof coverAimNote === 'function'") && src5.includes("!(entR && entR.landDmg !== undefined) && typeof coverAimNote === 'function'") && src5.split("lndQ.hit || '', true)").length === 2 && src5.split("lndR.hit || '', true)").length === 2
        && /\} else if \(msg\.type === 'land-deny' && net\.role === 'client'\) \{\n        \/\/ \[netcheck:landdeny-start\]/.test(src5) && src5.includes("if (had && quiet !== true && typeof landFightOver === 'function') { try { landFightOver(fid); }") && src5.includes("function broadcastRoster() { if (typeof landRosterMoved === 'function') landRosterMoved();"));
})());
// 1.6.3 (defense fold 3; docs/DEFENSE_INTERACTIONS_DESIGN.md 4.2, Fulllion's decisions 3, 6 and 8 of 2026-11-17, and the core's answers 1 to 3): what a defense
// that succeeds does to the attack it answers. roll-req, net.diceRoll, the attempt slice, the landing slice and the ansline slice run for real with the real core
// and dice; the table's sends, the cards and the GM's own copies are recorded. Lets some through, a type, Stops a number of hits on one hit and on a burst, a
// condition that does not hold, a defense that fails, the weapon tests by each setting, a line attack's save for half, a save and its reading back. Invented names
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx0 = await import(url('formula.js')), Dx = await import(url('dicecore.js'));
    const src6 = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'net.js'), 'utf8').replace(/\r\n/g, '\n'), att6 = kit.part('netattack.js');   // the joined net.js for the wiring, the attempt's own lines by netattack.js's name
    const line = k => { const i = src6.indexOf(k); if (i < 0) throw new Error('netcheck: ' + k + ' not found'); return src6.slice(i, src6.indexOf('\n', i)); };
    const helpers = ['function own(', 'function peerProfileId(', 'function fxLib(', 'function itemLib(', 'function diceFrom('].map(line).join('\n') + '\n';
    const rqSrc = (ordersSrc + '\n' + between('// [netcheck:rollreq-start]', '// [netcheck:rollreq-end]', 'rollreq')), drSrc = between('// [netcheck:diceroll-start]', '// [netcheck:diceroll-end]', 'diceroll'), atSrc = between('// [netcheck:attempt-start]', '// [netcheck:attempt-end]', 'attempt', 'netattack.js');
    const buSrc = between('// [netcheck:burst-start]', '// [netcheck:burst-end]', 'burst'), lnSrc = between('// [netcheck:attland-start]', '// [netcheck:attland-end]', 'attland', 'netattack.js'), anSrc = between('// [netcheck:ansline-start]', '// [netcheck:ansline-end]', 'ansline', 'netattack.js');
    const ceSrc = fnSrc('function cardEnt(camp, act, row, seen) {', '\n}\n', 'cardEnt', 'nethold.js') + '\n}\n', nsSrc = between('// [netcheck:npcseen-start]', '// [netcheck:npcseen-end]', 'npcseen');
    let dq = []; const Fx = Object.assign({}, Fx0, { evaluate: (e, o) => Fx0.evaluate(e, Object.assign({ random: () => { if (!dq.length) throw new Error('netcheck: no die left'); return dq.shift(); } }, o)) });
    const CK = '3d6 <= 12', DEF = '3d6 <= 10';
    const rawOf = (combat, noLines, ans) => ({ v: 1, name: 'D', combat: Object.assign({ checks: 'under3d6', damage: { types: [{ key: 'cut', label: 'Cutting' }, { key: 'cold', label: 'Cold' }] } }, combat || {}),
        fields: [{ id: 'f_hp', key: 'HP', label: 'HP', kind: 'number', vis: 'all', edit: 'owner', def: 5 },
            { id: 'f_gun', key: 'Guns', label: 'Guns', kind: 'item-list', vis: 'all', edit: 'owner', list: { rolls: [{ label: 'Fire', formula: CK, resistBy: 'r_def', resistOr: ['f_blade#0'], landDmg: 1 }, { label: 'Blast', formula: '1d6', dmg: true, dtype: 'cut' },
                { label: 'Spray', formula: CK, resistBy: 'r_def', landDmg: 3 }, { label: 'Rounds', formula: '1d6', dmg: true, hits: '3' }, { label: 'Strain', formula: '3d6' }] } },
            { id: 'f_blade', key: 'Blades', label: 'Blades', kind: 'item-list', vis: 'all', edit: 'owner', list: { rolls: [Object.assign({ label: 'Parry', formula: DEF, resist: true }, noLines ? {} : { answers: [{ does: 'stop', test: 'f_blade#1', testAtk: 'f_gun#4' }] }), { label: 'Wear', formula: '3d6' }] } }],
        rolls: [{ id: 'r_swing', label: 'Swing', formula: CK, vis: 'all', resistBy: 'r_def', landDmg: 'r_cut' },
            Object.assign({ id: 'r_def', label: 'Dodge', formula: DEF, vis: 'all', resist: true }, noLines ? {} : { answers: ans || [{ if: 'RollMargin >= 4', does: 'share', type: 'cold' }, { if: 'RollMargin >= 2', does: 'hits', hits: 'RollMargin - 1' }] }),
            { id: 'r_cut', label: 'Cut', formula: '1d6', vis: 'all', dmg: true, dtype: 'cut' },
            { id: 'r_jab', label: 'Jab', formula: CK, vis: 'all', resistBy: 'r_def', calls: [{ roll: 'r_cut', when: 'hit' }] }, { id: 'r_grab', label: 'Grab', formula: CK, vis: 'all', resistBy: 'r_def' }] });   // the review of fold 3: Jab, an attack whose damage is applied by hand (it calls for Cut), and Grab, which deals no damage
    const RG = tid => ({ tid, mapId: 'm1', mod: 0, dist: 5, tb: 30, cgrade: 0 });
    const world = (combat, o) => { o = o || {}; const out = { table: [], sent: { pA: [], pB: [] }, due: [], gm: [], toasts: [], notes: [], over: [], steps: [], clock: [], off: [] };
        const tok = (id, charId, x) => ({ id, isChar: true, charId, x, y: 0, w: 60, h: 52 }), wb = [Object.assign(tok('t_me', 'c_a', 0), { ownerId: 'u_a' }), Object.assign(tok('t_b', 'c_b', 60), { ownerId: 'u_b' })];
        const camp = { id: 'k', activeItemId: 'm1', system: Sx.cleanSystem(rawOf(combat, o.noLines, o.ans), { F: Fx, gmView: true }), chars: { c_a: { id: 'c_a', name: 'Kael', ownerId: 'u_a', values: { f_gun: [{ id: 'w_g1', def: { name: 'Pistol' } }] } }, c_b: { id: 'c_b', name: 'Sela', ownerId: 'u_b', values: { f_blade: [{ id: 'w_b1', def: { name: 'Saber' } }] } } }, items: { m1: { id: 'm1', type: 'map', meta: { gridType: 'square' }, whiteboard: wb } } };
        const conn = p => ({ peer: p, open: true, send(m) { packCheck(m); out.sent[p].push(JSON.parse(JSON.stringify(m))); } }), cA = conn('pA'), cB = conn('pB');
        const net = { role: 'host', active: true, stream: false, paused: false, conns: [cA, cB], targets: {}, roster: { pA: { id: 'u_a', name: 'Pat', location: 'm1' }, pB: { id: 'u_b', name: 'Bo', location: 'm1' } }, combats: o.fid ? { [o.fid]: { mapId: 'm1', rows: [] } } : {}, syncCharDelta: () => {},
            postDue: (c, rr, kind, r, toO, more) => out.due.push({ ch: c.id, roll: rr.id, kind, att: more && more.att, toO: !!toO, lnd: !!(more && more.lnd), row: more && more.row, tnow: !!(more && more.tnow), by: more && more.by }), damageCard: () => {}, dueOver: (att, say) => out.over.push([att, say]), offTurnSay: (c, act, row, label) => out.off.push([c.id, label]) };
        let rg = RG('t_b');
        const win = { wpFormula: Fx, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {}, tokenCtxFor: () => rg ? { range: rg } : null }, wpVtt: { on: () => true, rulesOn: () => true }, wpStepLog: (w, s, x) => out.steps.push([w, s, x]) };
        const Wd = new Function('net', 'DC', 'SC', 'window', 'getActiveCampaign', 'peerPaused', 'sendFailed', 'pushRoll', 'logEvent', 'saveRemoteSoon', 'rangeTo', 'getProfile', 'toast', 'ui', 'save', 'fogDrop', 'targetHitIn', 'turnNote', 'actSpend', 'clockPress', 'fightOfTok', 'pushChat', 'sendTable',
            'var diceLimit = null, _diceSlowSaid = {}, _dicePending = null, chatLog = [];\n' + helpers + ceSrc + nsSrc + '\n' + atSrc + '\n' + lnSrc + '\n' + anSrc + '\n' + buSrc + '\n' + drSrc + '\nreturn { rq: function(msg, conn) {\ndiceLimit = null; _diceSlowSaid = {};\n' + rqSrc + '\n}, rec: function(id) { return _attempts[id]; }, land: function(id) { return _lands[id]; }, keep: landsKeep, back: landsBack, forget: function() { landForget(); attemptForget(); }, area: areaAnswered, called: attemptCalled, ansFrom: ansFrom, ansStamp: ansStamp, ansClean: ansClean };')(
            net, () => Dx, () => Sx, win, () => camp, () => false, e => { throw e; }, (rec, res) => out.gm.push({ rec: JSON.parse(JSON.stringify(rec)), v: res && res.value }), () => {}, () => {}, () => rg, () => ({ id: 'u_gm', name: 'GM' }), t => out.toasts.push(t), () => null, () => {}, () => null,
            () => null, (c, t) => out.notes.push(t), () => '', (cp, cid, ent) => out.clock.push([cid, ent && ent.label]), () => o.fid || null, () => {}, rec => { packCheck(rec); out.table.push(JSON.parse(JSON.stringify(rec))); });
        const press = (act, expr, dice, x, who) => { dq = dice.slice(); const m = Object.assign({ type: 'roll-req', rid: 'q' + Math.random().toString(36).slice(2, 7), charId: who === 'pB' ? 'c_b' : 'c_a', expr }, act ? { act } : {}, x || {}); Object.keys(m).forEach(k => { if (m[k] === undefined) delete m[k]; }); Wd.rq(m, who === 'pB' ? cB : cA); };
        const due = (roll, kind, ch) => { const d = out.due.filter(x => x.roll === roll && (!kind || x.kind === kind) && (!ch || x.ch === ch)); return d.length ? d[d.length - 1] : null; };
        const dmgRec = () => { const l = out.gm.filter(m => m.rec.dmg === 1); return l.length ? l[l.length - 1].rec : null; };
        const seenBy = () => JSON.stringify([out.table, out.sent.pA, out.sent.pB]);
        return { camp, net, out, W: Wd, press, due, dmgRec, seenBy, dq: d => { dq = d.slice(); }, aim: t => { rg = t ? RG(t) : null; } }; };
    // (a) Lets some through, as Cold: Sela's Dodge succeeds by 7, the first line holds; the attack lands with what its defense did kept on the landing, and its
    // damage, pressed by Kael, carries the share and the type on the GM's own copy alone
    const wA = world(); wA.press('r_swing', CK, [2, 3, 3]); const dA = wA.due('r_def', 'resist'); wA.press('r_def', DEF, [1, 1, 1], { att: dA && dA.att }, 'pB');
    const lA = dA && wA.W.land(dA.att), cA = wA.due('r_cut', 'called'); wA.press('r_cut', '1d6', [5], { att: cA && cA.att }); const rA = wA.dmgRec();
    check('1.6.3 defense fold 3: a Dodge that succeeds by 7 meets its first line (If RollMargin >= 4, Then it lets some through, as Cold): the attack lands, the landing keeps what its defense did, and the damage pressed later carries on the GM\'s own copy a share of 2 of 5, the type it lands as and its words, marked as a landing\'s; nothing of it reaches the table or either player',
        !!dA && dA.ch === 'c_b' && dA.toO === true && !!lA && lA.st === 'card' && j(lA.ans) === j({ does: 'share', share: 'Blow.dmg / 2', type: 'cold' }) && !!cA && cA.ch === 'c_a' && cA.att === dA.att
        && !!rA && rA.landed === 1 && rA.dtype === 'cut' && rA.ans && rA.ans.amt === 2 && rA.ans.type === 'cold' && j(rA.ans.say) === j(['The defense let 2 of 5 through.', 'It lands as Cold.']) && !/"ans"|"landed"/.test(wA.seenBy()),
        j([dA, lA, cA, rA]));
    // (b) the second line: by 2, it stops one hit, and an attack of one hit is stopped; (c) by 0 no line holds and it is stopped; (d) a defense that fails lands whole
    const wB = world(); wB.press('r_swing', CK, [2, 3, 3]); const dB = wB.due('r_def', 'resist'); wB.press('r_def', DEF, [3, 3, 2], { att: dB.att }, 'pB'); const lB = wB.W.land(dB.att), cB = wB.due('r_cut', 'called');
    const wC = world(); wC.press('r_swing', CK, [2, 3, 3]); const dC = wC.due('r_def', 'resist'); wC.press('r_def', DEF, [3, 3, 4], { att: dC.att }, 'pB'); const lC = wC.W.land(dC.att), cC = wC.due('r_cut', 'called');
    const wD = world(); wD.press('r_swing', CK, [2, 3, 3]); const dD = wD.due('r_def', 'resist'); wD.press('r_def', DEF, [6, 6, 6], { att: dD.att }, 'pB'); const cD = wD.due('r_cut', 'called'); wD.press('r_cut', '1d6', [4], { att: cD && cD.att }); const rD = wD.dmgRec();
    check('1.6.3 defense fold 3: by 2 the second line holds (it stops RollMargin - 1, one hit), and an attack of one hit is stopped, with no damage card; by 0 no line holds and a success stops it; a defense that fails lands the whole blow, its damage with no line on it, still marked as a landing\'s so the window never reads the defender\'s last parry',
        lB === undefined && cB === null && lC === undefined && cC === null && !!cD && !!rD && rD.landed === 1 && !('ans' in rD), j([lB, cB, lC, cC, cD, rD]));
    // (e) a burst: by 2 its line stops one of three hits, and the rest land
    const wE = world(); wE.press(undefined, CK, [2, 3, 3], { row: { f: 'f_gun', r: 'w_g1', i: 2 } }); const dE = wE.due('r_def', 'resist'); wE.press('r_def', DEF, [3, 3, 2], { att: dE && dE.att }, 'pB');
    const lE = dE && wE.W.land(dE.att), cE = wE.due('r_row', 'called', 'c_a'); wE.press(undefined, '1d6', [4, 5, 6], { row: { f: 'f_gun', r: 'w_g1', i: 3 }, att: cE && cE.att }); const rE = wE.dmgRec();
    check('1.6.3 defense fold 3: against a burst, Stops a number of hits keeps the landing with how many it stopped, and the damage of three hits carries on the GM\'s copy that two land (keep), said in words',
        !!lE && j(lE.ans) === j({ does: 'hits', n: 1 }) && !!cE && !!rE && Array.isArray(rE.more) && rE.more.length === 2 && rE.ans && rE.ans.keep === 2 && j(rE.ans.say) === j(['The defense stopped 1 of 3 hits.']), j([lE, cE, rE]));
    // (f) a weapon test, by each setting: a Parry with Sela's Saber stops Kael's Fire and calls for Wear on the Saber and Strain on the Pistol
    const fire = (w, def) => { w.press(undefined, CK, [2, 3, 3], { row: { f: 'f_gun', r: 'w_g1', i: 0 } }); const d = w.due('r_def', 'resist'); w.press(undefined, DEF, def, { row: { f: 'f_blade', r: 'w_b1', i: 0 }, att: d && d.att }, 'pB'); return d; };
    const wF = world(), dF = fire(wF, [1, 1, 1]), tF = wF.out.due.filter(d => d.roll === 'r_row' && d.kind === 'called').map(d => [d.ch, d.row && d.row.r, d.row && d.row.i, d.toO, d.tnow]), lF = dF && wF.W.land(dF.att);
    const wN = world({ testBy: 'now' }), dN = fire(wN, [1, 1, 1, 2, 2, 2, 3, 3, 3]), tN = wN.out.due.filter(d => d.roll === 'r_row' && d.kind === 'called').length, gN = wN.out.gm.filter(m => m.rec.label === 'Wear' || m.rec.label === 'Strain').map(m => [m.rec.label, m.rec.as]);
    const wT = world({ testBy: 'both' }), dT = fire(wT, [1, 1, 1]), tT = wT.out.due.filter(d => d.roll === 'r_row' && d.kind === 'called'), attT = tT[0] && tT[0].att, tstT = attT && j(wT.W.rec(attT).tst); wT.dq([2, 2, 2]); const nowT = wT.net.testNow(attT), gT = wT.out.gm.filter(m => m.rec.label === 'Wear').length, goneT = !wT.W.rec(attT), overT = wT.out.over.filter(o => o[0] === attT && o[1] === 'rolled').length, againT = wT.net.testNow(attT);
    const wF2 = world(), dF2 = fire(wF2, [6, 6, 6]), tF2 = wF2.out.due.filter(d => d.roll === 'r_row' && d.kind === 'called' && d.ch === 'c_a' && d.row && d.row.i === 1).length, tF2b = wF2.out.due.filter(d => d.roll === 'r_row' && d.kind === 'called' && d.row && ((d.ch === 'c_b' && d.row.i === 1) || d.row.i === 4)).length;   // the damage card (Blast, on the Pistol) and no test
    check('1.6.3 defense fold 3: a line\'s weapon tests come only on a success (the core\'s answer 1), the parrying row\'s on Sela\'s Saber and the attacking row\'s on Kael\'s Pistol: by default a card each its owner presses, the attack stopped; rolled at once under It is rolled at once, as each owner, with no card; under Both a card, the GM\'s copy marked to offer Roll it now, which rolls it as its owner, closes its card and lets its record go; a failed parry tests nothing and lands the attack',
        j(tF) === j([['c_b', 'w_b1', 1, true, false], ['c_a', 'w_g1', 4, true, false]]) && lF === undefined && tN === 0 && j(gN) === j([['Wear', 'Sela'], ['Strain', 'Kael']])
        && tT.length === 2 && tT.every(d => d.tnow === true) && tstT === j({ f: 'f_blade', r: 'w_b1', i: 1, priv: false }) && nowT === true && gT === 1 && goneT && overT === 1 && againT === false
        && tF2b === 0 && !!wF2.due('r_row', 'called', 'c_a') && tF2 === 1, j([tF, lF, tN, gN, tT, tstT, nowT, gT, goneT, overT, againT, tF2, tF2b]));
    // (g) a line attack resisted by each target reads the lines: save for half, a stop, and a hit the defense failed
    const hit = { by: 'c_a', to: 'c_b', dmg: 'r_cut', label: 'Beam', nm: 'Sela' }, wG = world();
    wG.dq([6]); wG.W.area(wG.camp, hit, true, { line: { does: 'share', share: 'Blow.dmg / 2' }, row: null }); const rG1 = wG.dmgRec(); const nG = wG.out.gm.length;
    wG.W.area(wG.camp, hit, true, { line: { does: 'stop' }, row: null }); wG.W.area(wG.camp, hit, true, null); const nG2 = wG.out.gm.length; wG.dq([4]); wG.W.area(wG.camp, hit, false, null); const rG3 = wG.dmgRec();
    check('1.6.3 defense fold 3: a line resisted by each target reads its defense\'s lines (areaAnswered, run for real): Lets some through rolls the hit\'s damage on Sela with half of it on the GM\'s copy, a stop or no line rolls nothing, and a failed defense rolls the whole hit as before',
        !!rG1 && rG1.dmgOn === 'c_b' && rG1.ans && rG1.ans.amt === 3 && rG1.landed === 1 && nG2 === nG && !!rG3 && rG3.dmgOn === 'c_b' && !('ans' in rG3), j([rG1, nG, nG2, rG3]));
    // (h) only an attack's attempt reads lines; a saved landing keeps what its defense did and reads it back as data; a system with no lines is as before
    const nonAtk = wG.W.ansFrom(wG.camp, { charId: 'c_b', act: 'r_def', m: 0 }, 'r_def', null, wG.camp.chars.c_b, null, Dx, { ok: true, value: 3, breakdown: { checks: [{ top: true, left: 3, op: '<=', right: 10, pass: true }] } }, 'under3d6', null, false);
    const wS = world(null, { fid: 'f_abcd1234' }); wS.press('r_swing', CK, [2, 3, 3]); const dS = wS.due('r_def', 'resist'); wS.press('r_def', DEF, [1, 1, 1], { att: dS.att }, 'pB'); const kS = wS.W.keep(), kRec = kS.filter(r => r.id === dS.att)[0];
    wS.W.forget(); const nS = wS.W.back(kS, wS.camp), backS = wS.W.land(dS.att);
    const cl = wS.W.ansClean, cln = [cl({ does: 'stop' }), cl({ does: 'share' }), cl({ does: 'hits', n: 3.7 }), cl({ does: 'thru', type: 'bad key!' }), cl({ does: 'share', share: 'Blow.dmg', type: 'cold', all: true }), cl('x'), cl(null)];
    const wZ = world(null, { noLines: true }); wZ.press('r_swing', CK, [2, 3, 3]); const dZ = wZ.due('r_def', 'resist'); wZ.press('r_def', DEF, [1, 1, 1], { att: dZ.att }, 'pB'); const lZ = wZ.W.land(dZ.att), cZ = wZ.due('r_cut', 'called'), rZ = wZ.out.gm.filter(m => m.rec.dmg === 1).length;
    check('1.6.3 defense fold 3: only an attack\'s attempt reads lines (a record with no atk reads none); a landing waiting as a card is saved with what its defense did and read back as data (ansClean: three effects, a whole number of hits, a type only by its pattern); with no lines a success stops the attack and nothing is stamped',
        nonAtk === undefined && !!kRec && j(kRec.ans) === j({ does: 'share', share: 'Blow.dmg / 2', type: 'cold' }) && nS >= 1 && !!backS && j(backS.ans) === j(kRec.ans)
        && j(cln) === j([null, null, { does: 'hits', n: 3 }, { does: 'thru' }, { does: 'share', share: 'Blow.dmg', type: 'cold', all: true }, null, null]) && lZ === undefined && cZ === null && rZ === 0,
        j([nonAtk, kRec && kRec.ans, nS, backS && backS.ans, cln, lZ, cZ, rZ]));
    // (i) the wiring: both roll paths judge the line once and hand it on; thru is keyed to the record; the GM's copy alone carries what the line came to
    check('1.6.3 defense fold 3: both roll paths work the line out once (ansFrom) and hand it to areaAnswered and attemptCalled; attemptMake marks an attack\'s attempt (atk, atkBy, atkRow); a landing never notes thru by the defender; the stamp stands past the table\'s copy on every path',
        src6.includes("var ansQ = typeof ansFrom === 'function' ? ansFrom(campQ, blowRecQ, q.act, rowGQ || (q.with ? { f: q.with.f, r: q.with.r } : null), chQ, tcQ, Dq, resQ, ruleQ, mfQ, recQ.big === true) : undefined;") && src6.includes("var ansR = typeof ansFrom === 'function' ? ansFrom(campR, blowRecR, o.act, o.row || (o.with ? { f: o.with.f, r: o.with.r } : null), chR, tcR, D, res, ruleR, mfR, rec.big === true) : undefined;")
        && src6.indexOf('var ansQ = ') < src6.indexOf("areaAnswered(campQ, blowRecQ.area") && src6.indexOf('var ansR = ') < src6.indexOf("areaAnswered(campR, blowRecR.area")
        && att6.includes("_attempts[id] = { charId: tch.id, act: noMain ? '' : rr.id, m: m }; if (ov || typeof atkDeals !== 'function' || atkDeals(camp, entry, rowRef)) _attempts[id].atk = 1;")   /* the review of fold 3 (finding 6): atk only for an attack that deals damage (moved on purpose); defense fold 4: or one sent on (ov), whatever the one who sends it holds (moved on purpose) */ && src6.split("if (lndQ && typeof ansStampLand === 'function') ansStampLand(campQ, recQ, resQ, lndQ);").length === 4 && src6.includes("if (lndR && typeof ansStampLand === 'function') ansStampLand(campR, rec, res, lndR);")
        && att6.includes("if (pass === true && ch && typeof thruNote === 'function' && !(rec && (typeof rec.lw === 'string' || rec.area))) thruNote(camp, ch, row, pick && pick.line ? pick.line.does === 'thru' : undefined);"));   /* the review of fold 3 (finding 3): nor for a line's hit (moved on purpose) */
    // ---- 1.6.3 follow-ups of the defense folds (2026-11-18), with the same world. Invented names ----
    // Fulllion's ruling: Lets some through may say Dice counted per die, The same share of the dice (dice: 'share'). The landing keeps it, a save reads it back,
    // and the stamp on the GM's own copy says dc, which dice.js ansOn cuts the dice by (systemcheck runs that); a line with no such key stamps no dc
    const wDc = world(null, { ans: [{ if: 'RollMargin >= 4', does: 'share', dice: 'share' }] }); wDc.press('r_swing', CK, [2, 3, 3]); const dDc = wDc.due('r_def', 'resist'); wDc.press('r_def', DEF, [1, 1, 1], { att: dDc && dDc.att }, 'pB');
    const lDc = dDc && wDc.W.land(dDc.att), cDc = wDc.due('r_cut', 'called'); wDc.press('r_cut', '1d6', [5], { att: cDc && cDc.att }); const rDc = wDc.dmgRec();
    const clDc = [wDc.W.ansClean({ does: 'share', share: 'Blow.dmg', dice: 'share' }), wDc.W.ansClean({ does: 'share', share: 'Blow.dmg', dice: 'every' }), wDc.W.ansClean({ does: 'hits', n: 2, dice: 'share' })];
    check('1.6.3 Dice counted per die (Fulllion\'s ruling of 2026-11-18): a line that lets some through with The same share of the dice is kept on the landing, read back from a save only on a share and only as that word, and its damage carries dc on the GM\'s own copy with words that say so, never at the table; the line with no such key stamps no dc (a) above',
        !!lDc && j(lDc.ans) === j({ does: 'share', share: 'Blow.dmg / 2', dice: 'share' }) && !!rDc && rDc.ans && rDc.ans.amt === 2 && rDc.ans.dc === 1 && j(rDc.ans.say) === j(['The defense let 2 of 5 through.', 'What is counted per die counts the same share of its dice.'])
        && j(clDc) === j([{ does: 'share', share: 'Blow.dmg', dice: 'share' }, { does: 'share', share: 'Blow.dmg' }, { does: 'hits', n: 2 }]) && !('dc' in rA.ans) && !/"dc"|"dice":"share"/.test(wDc.seenBy()), j([lDc, rDc, clDc]));
    // found in a live two-peer check: the weapon test's card says the defense and the row it was made with (withLabel), "Parry with Saber"; the attacker's own
    // test names the parrying row only where the defense was not kept the GM's
    const wTn = world(), dTn = fire(wTn, [1, 1, 1]), byTn = wTn.out.due.filter(d => d.roll === 'r_row' && d.kind === 'called').map(d => [d.ch, d.by]);
    const wTp = world(); wTp.press(undefined, CK, [2, 3, 3], { row: { f: 'f_gun', r: 'w_g1', i: 0 } }); const dTp = wTp.due('r_def', 'resist'); wTp.press(undefined, DEF, [1, 1, 1], { row: { f: 'f_blade', r: 'w_b1', i: 0 }, att: dTp && dTp.att, priv: 'gm' }, 'pB'); const byTp = wTp.out.due.filter(d => d.roll === 'r_row' && d.kind === 'called').map(d => [d.ch, d.by]);
    check('1.6.3 (a live two-peer check) a weapon test a parry calls for says it was called for by the parry and the row it was made with, on the parrying weapon\'s card and the attacker\'s; a parry kept the GM\'s names the row on its own weapon\'s card alone',
        !!dTn && j(byTn) === j([['c_b', 'Parry with Saber'], ['c_a', 'Parry with Saber']]) && !!dTp && j(byTp) === j([['c_b', 'Parry with Saber'], ['c_a', 'Parry']]), j([byTn, byTp]));
    // found in a live two-peer check: an attack with Its damage made with no target makes no attempt and no landing, and tells its roller in one plain line: a
    // player's press through a note to their own connection, the GM's own press on this screen. The roll itself stands, and an attack that misses says nothing
    const NOTGT = 'This attack had no one to land on, so its damage does not come. Target someone before you attack.';
    const wNt = world(); wNt.aim(null); const nT0 = wNt.out.table.length; wNt.press('r_swing', CK, [2, 3, 3]); const ntNotes = wNt.out.notes.slice(), ntRes = wNt.due('r_def', 'resist'), ntRoll = wNt.out.table.slice(nT0).filter(r => r.type === 'roll').length;
    wNt.press('r_swing', CK, [6, 6, 6]); const ntMiss = wNt.out.notes.length;
    wNt.dq([2, 3, 3]); const ntGm = wNt.net.diceRoll(CK, { charId: 'c_a', act: 'r_swing' }), ntToast = wNt.out.toasts.slice();
    check('1.6.3 (a live two-peer check) an attack with Its damage that hits with no target makes no attempt and no landing, and its roller is told in one plain line, a player through a note to them and the GM\'s own press as a notice; the roll stands, and a miss says nothing',
        j(ntNotes) === j([NOTGT]) && ntRes === null && ntRoll >= 1 && ntMiss === 1 && !!ntGm && ntGm.ok === true && ntToast.filter(t => t === NOTGT).length === 1
        && att6.includes("var LAND_NO_TARGET = 'This attack had no one to land on, so its damage does not come. Target someone before you attack.';"), j([ntNotes, ntRes, ntRoll, ntMiss, ntGm, ntToast]));
    // ---- the review of defense fold 3 (2026-11-18), with the same world. Invented names ----
    // finding 1: How many hits that cannot be worked out stops the attack whole and is said to the GM, never read as 0; a real 0 stops none, and the GM's copy says so
    const sprayRow = { row: { f: 'f_gun', r: 'w_g1', i: 2 } }, sprayDmg = { f: 'f_gun', r: 'w_g1', i: 3 };
    const burst = (w, def) => { w.press(undefined, CK, [2, 3, 3], sprayRow); const d = w.due('r_def', 'resist'); w.press('r_def', DEF, def, { att: d && d.att }, 'pB'); return d; };
    const wH1 = world(null, { ans: [{ does: 'hits', hits: 'Nothing + 1' }] }), dH1 = burst(wH1, [3, 3, 2]), lH1 = dH1 && wH1.W.land(dH1.att), cH1 = wH1.due('r_row', 'called', 'c_a');
    const wH0 = world(null, { ans: [{ does: 'hits', hits: '0' }] }), dH0 = burst(wH0, [3, 3, 2]), lH0 = dH0 && wH0.W.land(dH0.att), cH0 = wH0.due('r_row', 'called', 'c_a'); wH0.press(undefined, '1d6', [4, 5, 6], { row: sprayDmg, att: cH0 && cH0.att }); const rH0 = wH0.dmgRec();
    const wHa = world(), nGa = wHa.out.gm.length; wHa.W.area(wHa.camp, { by: 'c_a', to: 'c_b', dmg: 'r_cut', label: 'Beam', nm: 'Sela' }, true, { line: { does: 'hits', hits: 'Nothing + 1' }, n: 0, nBad: true, row: null });
    check('1.6.3 the review of defense fold 3 (finding 1): How many hits that cannot be worked out stops the burst whole, as a success does by default, with no damage card for anyone, and the GM is told in words; on a line\'s hit alike; a real 0 lets all three hits land, the GM\'s copy saying the defense stopped none',
        !!dH1 && lH1 === undefined && cH1 === null && wH1.out.toasts.filter(t => /defense could not work out how many hits it stops, so it stopped the whole attack\./.test(t)).length === 1
        && wHa.out.gm.length === nGa && wHa.out.toasts.some(t => /^Sela’s defense could not work out how many hits it stops/.test(t))
        && !!lH0 && j(lH0.ans) === j({ does: 'hits', n: 0 }) && !!rH0 && !!rH0.ans && rH0.ans.keep === 3 && j(rH0.ans.say) === j(['The defense stopped none of the 3 hits.']) && !/"ans"|"landed"/.test(wH0.seenBy()),
        j([lH1, cH1, wH1.out.toasts, wHa.out.toasts, lH0, rH0 && rH0.ans]));
    // finding 11: a burst whose hits, worked out at the landing, come to no more than the line stops is stopped there, so nobody rolls damage for nothing
    const wH3 = world(null, { ans: [{ does: 'hits', hits: '3' }] }), dH3 = burst(wH3, [3, 3, 2]), lH3 = dH3 && wH3.W.land(dH3.att), cH3 = wH3.due('r_row', 'called', 'c_a');
    const wH2 = world(null, { ans: [{ does: 'hits', hits: '2' }] }), dH2 = burst(wH2, [3, 3, 2]), lH2 = dH2 && wH2.W.land(dH2.att), cH2 = wH2.due('r_row', 'called', 'c_a');
    check('1.6.3 the review of defense fold 3 (finding 11): Rounds rolls 3 hits, worked out at the landing as its damage will be, so a line that stops 3 stops the attack there with no damage card for the attacker or the table; one that stops 2 lets it land, keeping that it stopped 2',
        !!dH3 && lH3 === undefined && cH3 === null && !!lH2 && j(lH2.ans) === j({ does: 'hits', n: 2 }) && !!cH2, j([lH3, cH3, lH2, cH2]));
    // finding 2: an attack with no landing record (its damage applied by hand) still meets its line, and the GM is told what it says
    const wJ = world(); wJ.press('r_jab', CK, [2, 3, 3]); const dJ = wJ.due('r_def', 'resist'), recJ = dJ ? j(wJ.W.rec(dJ.att)) : ''; wJ.press('r_def', DEF, [1, 1, 1], { att: dJ && dJ.att }, 'pB'); const tJ = wJ.out.toasts.filter(t => /defense:/.test(t));
    check('1.6.3 the review of defense fold 3 (finding 2): Jab, whose damage is applied by hand (it calls for Cut), is an attack: a Dodge by 7 meets Lets some through, as Cold, and with no landing to carry it the GM is told what the line says by the defender\'s name, the share read as a formula; nothing of it reaches the table or a player',
        !!dJ && /"atk":1/.test(recJ) && tJ.length === 1 && tJ[0] === 'Sela’s defense: half of it gets through, it lands as Cold. Apply its damage from Take damage as that says.' && !/defense:/.test(wJ.seenBy()), j([recJ, tJ]));
    // finding 6: a roll that deals no damage and calls for none is no attack, so its defense reads no line
    const wR = world(); wR.press('r_grab', CK, [2, 3, 3]); const dR = wR.due('r_def', 'resist'), recR = dR ? wR.W.rec(dR.att) : null; wR.press('r_def', DEF, [1, 1, 1], { att: dR && dR.att }, 'pB');
    check('1.6.3 the review of defense fold 3 (finding 6): Grab deals no damage and calls for none, so its attempt is no attack\'s (no atk), and a Dodge that succeeds by 7 reads no line of When it answers an attack: nothing is said and no line is logged',
        !!recR && !('atk' in recR) && wR.out.toasts.length === 0 && wR.out.steps.filter(s => s[0] === 'attempt v1' && s[1] === 'line').length === 0 && wJ.out.steps.filter(s => s[0] === 'attempt v1' && s[1] === 'line').length === 1, j([recR, wR.out.toasts]));
    // finding 3: a line's hit never notes the defender's two-minute parry, since its own record carries the row
    const wT3 = world(), rowT3 = { f: 'f_blade', r: 'w_b1', i: 0 }, thruPick = { line: { does: 'thru' }, at: 0, row: { f: 'f_blade', r: 'w_b1' } }; wT3.dq([6]);
    wT3.W.called(wT3.camp, { charId: 'c_b', act: '', m: 2, atk: 1, area: { by: 'c_a', to: 'c_b', dmg: 'r_cut', label: 'Beam', nm: 'Sela' } }, undefined, rowT3, true, wT3.camp.chars.c_b, false, null, thruPick); const t3Area = wT3.net.thruOf('c_b'), t3Said = wT3.out.toasts.slice();
    wT3.W.called(wT3.camp, { charId: 'c_b', act: '', m: 2, atk: 1 }, undefined, rowT3, true, wT3.camp.chars.c_b, false, null, thruPick); const t3Plain = wT3.net.thruOf('c_b');
    check('1.6.3 the review of defense fold 3 (finding 3): a parry that takes a line\'s hit on its row leaves the defender\'s two-minute parry unset and says nothing of taking the blow, since areaAnswered rolls that hit with its row stamped on it; an attack with no record of its own still notes it, as before',
        t3Area === null && !t3Said.some(t => /took the blow/.test(t)) && t3Plain === 'w_b1', j([t3Area, t3Said, t3Plain]));
    // finding 5: a weapon test rolled at once is no press its owner chose
    const wC5 = world({ testBy: 'now' }); fire(wC5, [1, 1, 1, 2, 2, 2, 3, 3, 3]); const tC5 = wC5.out.gm.filter(m => m.rec.label === 'Wear' || m.rec.label === 'Strain').length;
    check('1.6.3 the review of defense fold 3 (finding 5): the two weapon tests rolled at once spend nothing on a counting clock and say nothing of acting off a turn, while the presses that called for them still do (the recorders hear Fire and Parry)',
        tC5 === 2 && !wC5.out.clock.some(c => c[1] === 'Wear' || c[1] === 'Strain') && !wC5.out.off.some(o => o[1] === 'Wear' || o[1] === 'Strain') && wC5.out.clock.length >= 2
        && src6.includes("if (chR && entR && !lndR && o.called !== true && typeof clockPress === 'function') clockPress(campR, chR.id, entR);") && src6.includes("if (chR && !o.att && o.called !== true && typeof net.offTurnSay === 'function') net.offTurnSay(chR, o.act, o.row, o.label);")
        && src6.includes("&& !o.cross && !o.att && o.called !== true && typeof helpHold === 'function') {") && src6.includes("&& !o.cross && o.called !== true && typeof cardHold === 'function' && cardHold("), j([tC5, wC5.out.clock, wC5.out.off]));
    // finding 4: a latecomer's history carries none of the host's own stamps on a landing's damage roll
    const hoAt6 = src6.indexOf('function chatHistoryOf(log) {'), npcW6 = new WeakMap(), hist6 = new Function('figOf', '_npcCards', src6.slice(hoAt6, src6.indexOf('\n', hoAt6)) + '\nreturn chatHistoryOf;')(undefined, npcW6);
    const gmRec6 = Object.assign({}, rA, { thru: 'w_b1', hit: 'w_l1', onName: 'Sela' }); npcW6.set(gmRec6, { on: wA.camp.chars.c_b });
    const plain6 = { type: 'roll', id: 'r_pl', from: gmRec6.from, expr: '1d6', draws: [3], v: 1, ts: 2 };
    const hOut6 = hist6([{ from: gmRec6.from, text: '', scope: 'global', ts: 1, roll: gmRec6 }, { from: plain6.from, text: '', scope: 'global', ts: 2, roll: plain6 }]), hr6 = hOut6[0] && hOut6[0].roll;
    check('1.6.3 the review of defense fold 3 (finding 4): a landing\'s damage roll in a latecomer\'s history is a copy without ans, landed, thru and hit, the GM\'s own stamps, keeping its id, whom it landed on and how historySeen judges it; a roll with none of them goes as it was',
        !!rA.ans && rA.landed === 1 && !!hr6 && hr6 !== gmRec6 && !('ans' in hr6) && !('landed' in hr6) && !('thru' in hr6) && !('hit' in hr6) && hr6.onName === 'Sela' && hr6.id === gmRec6.id && npcW6.get(hr6) === npcW6.get(gmRec6) && !!gmRec6.ans && hOut6[1].roll === plain6, j(hr6));
    // finding 7: a line attack's attempt knows the attacking row
    check('1.6.3 the review of defense fold 3 (finding 7): areaAfter hands attemptMake the attacking row, so a line that tests the attacking weapon finds it',
        att6.includes("attemptMake(camp, entry, vd, malf, { tid: tid, mapId: mapId, area: hit }, ch, priv, vars, row); else areaHit(camp, hit);"));
})());
// 1.6.3 (defense fold 4; docs/DEFENSE_INTERACTIONS_DESIGN.md 4.3, backlog 243, Fulllion's decision 4 and the core's answers 4 to 6 of 2026-11-17): a defense that
// sends the attack on. roll-req, net.diceRoll, the attempt slice, the landing slice, the ansline slice, the sendon slice and the host's send-on branch run for real
// with the real core and dice; the table's sends, the cards, the GM's notices, what is spent and the clock are recorded. Kael fires his Pistol at Sela; her Parry
// sends it on with her Return roll at whoever she points at. Invented names
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx0 = await import(url('formula.js')), Dx = await import(url('dicecore.js'));
    const src7 = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'net.js'), 'utf8').replace(/\r\n/g, '\n');
    const line = k => { const i = src7.indexOf(k); if (i < 0) throw new Error('netcheck: ' + k + ' not found'); return src7.slice(i, src7.indexOf('\n', i)); };
    const helpers = ['function own(', 'function peerProfileId(', 'function fxLib(', 'function itemLib(', 'function diceFrom('].map(line).join('\n') + '\n';
    const rqSrc = (ordersSrc + '\n' + between('// [netcheck:rollreq-start]', '// [netcheck:rollreq-end]', 'rollreq')), drSrc = between('// [netcheck:diceroll-start]', '// [netcheck:diceroll-end]', 'diceroll'), atSrc = between('// [netcheck:attempt-start]', '// [netcheck:attempt-end]', 'attempt', 'netattack.js');
    const buSrc = between('// [netcheck:burst-start]', '// [netcheck:burst-end]', 'burst'), lnSrc = between('// [netcheck:attland-start]', '// [netcheck:attland-end]', 'attland', 'netattack.js'), anSrc = between('// [netcheck:ansline-start]', '// [netcheck:ansline-end]', 'ansline', 'netattack.js');
    const soSrc = between('// [netcheck:sendon-start]', '// [netcheck:sendon-end]', 'sendon', 'netattack.js'), sbSrc = between('// [netcheck:sendonbranch-start]', '// [netcheck:sendonbranch-end]', 'sendonbranch');
    const ceSrc = fnSrc('function cardEnt(camp, act, row, seen) {', '\n}\n', 'cardEnt', 'nethold.js') + '\n}\n', nsSrc = between('// [netcheck:npcseen-start]', '// [netcheck:npcseen-end]', 'npcseen');
    let dq = []; const Fx = Object.assign({}, Fx0, { evaluate: (e, o) => Fx0.evaluate(e, Object.assign({ random: () => { if (!dq.length) throw new Error('netcheck: no die left'); return dq.shift(); } }, o)) });
    const CK = '3d6 <= 12', DEF = '3d6 <= 10';
    const rawOf = (combat, o) => ({ v: 1, name: 'S', combat: Object.assign({ checks: 'under3d6', turn: { acts: [{ key: 'attack', label: 'Attack', n: 1 }] } }, combat || {}),
        fields: [{ id: 'f_hp', key: 'HP', label: 'HP', kind: 'number', vis: 'all', edit: 'owner', def: 5 },
            { id: 'f_gun', key: 'Guns', label: 'Guns', kind: 'item-list', vis: 'all', edit: 'owner', list: { stats: [{ key: 'grade', label: 'Grade' }], rolls: [{ label: 'Fire', formula: CK, resistBy: 'r_def', resistOr: ['f_blade#0'], landDmg: 1, attemptKey: 'grade', cost: 'attack' }, { label: 'Blast', formula: '1d6', dmg: true }] } },
            ...(o && o.sec ? [{ id: 'f_sec', key: 'Secret', label: 'Secret', kind: 'number', vis: 'gm', edit: 'gm', def: 0 }] : []),
            { id: 'f_blade', key: 'Blades', label: 'Blades', kind: 'item-list', vis: 'all', edit: 'owner', list: { stats: [{ key: 'grade', label: 'Grade' }], rolls: [{ label: 'Parry', formula: DEF, resist: true, answers: (o && o.lines) || [{ does: 'send', roll: 'f_blade#1', mod: '0 - 2', far: '20' }] }, Object.assign({ label: 'Return', formula: '3d6 <= 12', cost: 'attack' }, (o && o.ret) || {})] } }],
        rolls: [Object.assign({ id: 'r_def', label: 'Dodge', formula: DEF, vis: 'all', resist: true }, o && o.dodge ? { answers: o.dodge } : {}), { id: 'r_jab', label: 'Jab', formula: CK, vis: 'all', resistBy: 'r_def', calls: [{ roll: 'r_cut', when: 'hit' }] }, { id: 'r_cut', label: 'Cut', formula: '1d6', vis: 'all', dmg: true }, Object.assign({ id: 'r_aim', label: 'Aim', formula: '3d6 <= 12', vis: 'all' }, (o && o.aim) || {})] });
    const RG = (tid, dist) => tid ? ({ tid, mapId: 'm1', mod: 0, dist: dist || 5, tb: 30, cgrade: 0 }) : null;
    const world = (combat, o) => { o = o || {}; const out = { table: [], sent: { pA: [], pB: [] }, due: [], gm: [], toasts: [], notes: [], over: [], steps: [], spent: [], clock: [], off: [], rto: [] };
        const tok = (id, charId, x) => ({ id, isChar: true, charId, x, y: 0, w: 60, h: 52 }), wb = [Object.assign(tok('t_me', 'c_a', 0), { ownerId: 'u_a' }), Object.assign(tok('t_b', 'c_b', 60), { ownerId: 'u_b' }), tok('t_5', 'c_1', 300), tok('t_9', 'c_2', 600)];
        const camp = { id: 'k', activeItemId: 'm1', system: Sx.cleanSystem(rawOf(combat, o), { F: Fx, gmView: true }), chars: { c_a: { id: 'c_a', name: 'Kael', ownerId: 'u_a', values: { f_gun: [{ id: 'w_g1', def: { name: 'Pistol', stats: { grade: 3 } } }] } }, c_b: { id: 'c_b', name: 'Sela', ownerId: 'u_b', values: { f_blade: [{ id: 'w_b1', def: { name: 'Saber', stats: { grade: 7 } } }] } }, c_1: { id: 'c_1', name: 'Pebbles', npc: true, values: {} }, c_2: { id: 'c_2', name: 'Coin', npc: true, values: {} } }, items: { m1: { id: 'm1', type: 'map', meta: { gridType: 'square' }, whiteboard: wb } } };
        const conn = p => ({ peer: p, open: true, send(m) { packCheck(m); out.sent[p].push(JSON.parse(JSON.stringify(m))); } }), cA = conn('pA'), cB = conn('pB');
        const net = { role: 'host', active: true, stream: false, paused: false, conns: [cA, cB], targets: {}, roster: { pA: { id: 'u_a', name: 'Pat', location: 'm1' }, pB: { id: 'u_b', name: 'Bo', location: 'm1' } }, combats: {}, syncCharDelta: () => {},
            postDue: (c, rr, kind, r, toO, more) => out.due.push({ ch: c.id, roll: rr.id, kind, att: more && more.att, toO: !!toO, lnd: !!(more && more.lnd), by: more && more.by, kn: more && more.kn, m: more && more.m, row: more && more.row }),
            postSendOn: (c, att, by, toO) => out.due.push({ ch: c.id, kind: 'send', att, by, toO: !!toO }), damageCard: () => {}, dueOver: (att, say) => out.over.push([att, say]), offTurnSay: (c, act, row, label) => out.off.push([c.id, label]) };
        let rg = RG('t_b'), rgBy = null;   // rgBy (the review of fold 4): each pointer's own answer, as rangeTo gives it; null where any pointer reads rg
        const win = { wpFormula: Fx, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {}, tokenCtxFor: () => rg ? { range: rg } : null }, wpVtt: { on: () => true, rulesOn: () => true }, wpStepLog: (w, s, x) => out.steps.push([w, s, x]) };
        const Wd = new Function('net', 'DC', 'SC', 'window', 'getActiveCampaign', 'peerPaused', 'sendFailed', 'pushRoll', 'logEvent', 'saveRemoteSoon', 'rangeTo', 'getProfile', 'toast', 'ui', 'save', 'fogDrop', 'targetHitIn', 'turnNote', 'actSpend', 'clockPress', 'fightOfTok', 'pushChat', 'sendTable',
            'var diceLimit = null, _diceSlowSaid = {}, _dicePending = null, chatLog = [];\n' + helpers + ceSrc + nsSrc + '\n' + atSrc + '\n' + lnSrc + '\n' + soSrc + '\n' + anSrc + '\n' + buSrc + '\n' + drSrc + '\nreturn { rq: function(msg, conn) {\ndiceLimit = null; _diceSlowSaid = {};\n' + rqSrc + '\n}, send: function(msg, conn) {\ndiceLimit = null;\n' + sbSrc + '\n}, rec: function(id) { return _attempts[id]; }, land: function(id) { return _lands[id]; }, ids: function() { return _landIds.slice(); }, keep: landsKeep, back: landsBack, forget: function() { landForget(); attemptForget(); }, sweep: landSweep, area: areaAnswered, called: attemptCalled };')(
            net, () => Dx, () => Sx, win, () => camp, () => false, e => { throw e; }, (rec, res) => out.gm.push({ rec: JSON.parse(JSON.stringify(rec)), v: res && res.value }), () => {}, () => {}, (cm, mp, mid, tk, pid, tid) => { const ky = pid || 'tid:' + tid; out.rto.push(ky); return rgBy ? (Object.prototype.hasOwnProperty.call(rgBy, ky) ? rgBy[ky] : null) : rg; }, () => ({ id: 'u_gm', name: 'GM' }), t => out.toasts.push(t), () => null, () => {}, () => null,
            () => null, (c, t) => out.notes.push(t), (cp, id) => { out.spent.push(id); return ''; }, (cp, cid, ent) => out.clock.push([cid, ent && ent.label]), () => null, () => {}, rec => { packCheck(rec); out.table.push(JSON.parse(JSON.stringify(rec))); });
        const press = (act, expr, dice, x, who) => { dq = dice.slice(); const m = Object.assign({ type: 'roll-req', rid: 'q' + Math.random().toString(36).slice(2, 7), charId: who === 'pB' ? 'c_b' : 'c_a', expr }, act ? { act } : {}, x || {}); Object.keys(m).forEach(k => { if (m[k] === undefined) delete m[k]; }); Wd.rq(m, who === 'pB' ? cB : cA); };
        const due = (roll, kind, ch) => { const d = out.due.filter(x => (roll === null || x.roll === roll) && (!kind || x.kind === kind) && (!ch || x.ch === ch)); return d.length ? d[d.length - 1] : null; };
        const fire = dice => { rg = RG('t_b'); press(undefined, CK, dice || [2, 3, 3], { row: { f: 'f_gun', r: 'w_g1', i: 0 } }); return due('r_def', 'resist', 'c_b'); };
        const parry = (d, dice) => press(undefined, DEF, dice || [1, 1, 1], { row: { f: 'f_blade', r: 'w_b1', i: 0 }, att: d && d.att }, 'pB');
        const sendOn = (att, how, who) => { const m = { type: 'send-on', att }; if (how) m.how = how; Wd.send(m, who === 'pA' ? cA : cB); };
        const dmgRec = () => { const l = out.gm.filter(m => m.rec.dmg === 1); return l.length ? l[l.length - 1].rec : null; };
        net.myId = 'u_gm';   // the GM's own screen speaks as its host id; aim sets the GM's own pointer beside what a player's reads, so a GM's press to send it on finds one
        return { camp, net, out, W: Wd, press, due, fire, parry, sendOn, dmgRec, aim: r => { rg = r; if (r) net.targets.u_gm = { id: r.tid, mapId: 'm1' }; else delete net.targets.u_gm; }, aimBy: m => { rgBy = m; }, dq: d => { dq = d.slice(); } }; };
    const tail = (a, n) => a.slice(a.length - (n || 1));

    // (a) the parry sends it on: the landing waits as a card to send it on, to Sela's player, naming Kael; what it sends with is worked out once, now
    const wA = world(); const dA = wA.fire(); wA.parry(dA); const sA = wA.due(null, 'send', 'c_b'), lA = dA && wA.W.land(dA.att);
    check('1.6.3 defense fold 4: a Parry whose line sends it on stops the attack and leaves a card to send it on to the defender\'s player, naming the one who sent it; the landing waits with the roll it is sent on with, its modifier and How far worked out as the parry succeeded, and the row it parried with; nothing of it is a damage card',
        !!dA && !!sA && sA.att === dA.att && sA.toO === true && sA.by === 'Kael' && !!lA && lA.st === 'send' && JSON.stringify(lA.snd) === JSON.stringify({ roll: 'f_blade#1', mod: -2, far: 20, row: { f: 'f_blade', r: 'w_b1' } }) && lA.hops === 0 && !wA.due('r_row', 'called') && lA.ent === 'f_gun#0' && !!lA.ak && lA.ak.k === 3,
        JSON.stringify([dA, sA, lA && lA.snd, lA && lA.ent, lA && lA.ak]));

    // (b) refusals, each said to her in words with the card live again: another player's press; nobody pointed at; out of reach; straight back at Kael; at herself
    const noteA0 = wA.out.notes.length; wA.sendOn(dA.att, '', 'pA'); const nA1 = tail(wA.out.notes)[0], deny1 = wA.out.sent.pA.filter(m => m.type === 'land-deny').length;
    wA.aim(null); wA.sendOn(dA.att); const nA2 = tail(wA.out.notes)[0];
    wA.aim(RG('t_5', 30)); wA.sendOn(dA.att); const nA3 = tail(wA.out.notes)[0];
    wA.aim(RG('t_me', 4)); wA.sendOn(dA.att); const nA4 = tail(wA.out.notes)[0];
    const denyB = wA.out.sent.pB.filter(m => m.type === 'land-deny' && m.att === dA.att).length, stillA = wA.W.land(dA.att) && wA.W.land(dA.att).st === 'send', rolledA = wA.out.gm.filter(m => /sending it on/.test(m.rec.label || '')).length;
    check('1.6.3 defense fold 4: the host judges a press to send it on from its own record and her pointer alone: another player\'s press is not theirs to make; with nobody pointed at, at someone out of How far, or straight back at the one who sent it, she is told why in words and her card is live again; nothing is rolled and the attack still waits',
        /not yours/.test(nA1) && deny1 === 1 && /Point at who you send it to/.test(nA2) && /out of reach/.test(nA3) && /20 yards at most/.test(nA3) && /30 yards away/.test(nA3) && /straight back/.test(nA4) && denyB === 3 && stillA && rolledA === 0 && wA.out.notes.length - noteA0 === 4, JSON.stringify([nA1, nA2, nA3, nA4, denyB]));

    // (c) sent on at Pebbles: her Return roll is made as her, at Pebbles, with the line's modifier, and it hits; a new attempt from her, with the kind the Pistol's
    // shot was made with; the damage stays Kael's: Pebbles' Dodge fails, the card goes to Kael and lands on Pebbles; no action spent, no counting clock, nothing said of a turn
    const spentA0 = wA.out.spent.length, clockA0 = wA.out.clock.length, offA0 = wA.out.off.length;
    wA.aim(RG('t_5', 8)); wA.dq([2, 2, 2]); wA.sendOn(dA.att); const rRet = wA.out.gm.filter(m => /sending it on/.test(m.rec.label || ''))[0], dP = wA.due('r_def', 'resist', 'c_1'), l2 = dP && wA.W.land(dP.att), a2 = dP && wA.W.rec(dP.att);
    const overA = wA.out.over.filter(x => x[0] === dA.att && x[1] === 'sent').length, goneA = !wA.W.land(dA.att), spentA = wA.out.spent.length - spentA0, clockA = wA.out.clock.length - clockA0, offA = wA.out.off.length - offA0;
    check('1.6.3 defense fold 4: Send it on at Pebbles makes Sela\'s Return roll as Sela, at Pebbles, with the line\'s modifier (3d6 against 10), on the table; it spends no action, moves no counting clock and says nothing of acting off a turn (the core\'s answer 6); the first landing ends, its card said sent on',
        !!rRet && rRet.rec.as === 'Sela' && /\(12\)\s*-\s*2|12\)? ?- ?2/.test(rRet.rec.expr) && spentA === 0 && clockA === 0 && offA === 0 && overA === 1 && goneA, JSON.stringify([rRet && rRet.rec.expr, spentA, clockA, offA, overA]));
    check('1.6.3 defense fold 4: the one who sends it on is the attacker of what follows (decision 4): Pebbles gets a Dodge card naming Sela, with Take it, and her Return\'s margin; its attempt keeps the kind the Pistol\'s shot was made with (3, not her Saber\'s 7), reads Sela as its attacker and her Saber as the attacking row; the new landing keeps Kael\'s damage roll and Pistol, hops 1, sent by Sela',
        !!dP && dP.by === 'Sela' && dP.lnd === true && dP.toO === false && dP.m === 4 && !!a2 && a2.k === 3 && a2.atk === 1 && a2.atkBy === 'c_b' && JSON.stringify(a2.atkRow) === JSON.stringify({ f: 'f_blade', r: 'w_b1' }) && !a2.calls
        && !!l2 && l2.st === 'wait' && l2.by === 'c_a' && l2.to === 'c_1' && l2.sby === 'c_b' && l2.hops === 1 && l2.dmg === 1 && JSON.stringify(l2.row) === JSON.stringify({ f: 'f_gun', r: 'w_g1' }) && l2.ent === 'f_gun#0' && l2.range.tid === 't_5', JSON.stringify([dP, a2, l2]));
    wA.dq([6, 6, 6]); const gP = wA.W.rec(dP.att) && wA.net.diceRoll(DEF, { charId: 'c_1', act: 'r_def', att: dP.att }), cK = wA.due('r_row', 'called', 'c_a');
    wA.aim(RG('t_9', 2)); wA.press(undefined, '1d6', [5], { row: { f: 'f_gun', r: 'w_g1', i: 1 }, att: cK && cK.att }); const rK = wA.dmgRec();
    check('1.6.3 defense fold 4: Pebbles\' Dodge fails, so the attack lands: its damage card goes to Kael, who made the attack, and pressed with his pointer now elsewhere it lands on Pebbles, its damage the Pistol\'s own',
        gP && gP.ok === true && !!cK && cK.att === dP.att && cK.toO === true && !!rK && rK.dmgOn === 'c_1' && rK.as === 'Kael', JSON.stringify([gP, cK, rK && rK.dmgOn]));

    // (d) the hops: a Dodge that would send it on again stops it at the system's once (the core's answer 5), and the GM is told; at twice it goes on, back at
    // Kael, who was not the one who sent it to Pebbles, and never straight back at Sela, who was
    const dodgeSend = [{ does: 'send', roll: 'r_aim' }];
    const wD = world({}, { dodge: dodgeSend }); const dD = wD.fire(); wD.parry(dD); wD.aim(RG('t_5', 8)); wD.dq([2, 2, 2]); wD.sendOn(dD.att); const dD2 = wD.due('r_def', 'resist', 'c_1');
    wD.dq([1, 1, 1]); wD.net.diceRoll(DEF, { charId: 'c_1', act: 'r_def', att: dD2.att }); const sD = wD.out.due.filter(x => x.kind === 'send' && x.ch === 'c_1').length, gD = tail(wD.out.toasts)[0], leftD = wD.W.ids().length;
    const wE = world({ sendHops: 2 }, { dodge: dodgeSend }); const dE = wE.fire(); wE.parry(dE); wE.aim(RG('t_5', 8)); wE.dq([2, 2, 2]); wE.sendOn(dE.att); const dE2 = wE.due('r_def', 'resist', 'c_1');
    wE.dq([1, 1, 1]); wE.net.diceRoll(DEF, { charId: 'c_1', act: 'r_def', att: dE2.att }); const sE = wE.due(null, 'send', 'c_1');
    wE.aim(RG('t_b', 6)); const backE = wE.net.sendOn(sE.att), tE = tail(wE.out.toasts)[0];
    wE.aim(RG('t_me', 6)); wE.dq([2, 2, 2]); const goE = wE.net.sendOn(sE.att), dE3 = wE.due('r_def', 'resist', 'c_a'), lE3 = dE3 && wE.W.land(dE3.att);
    check('1.6.3 defense fold 4: hops, judged on the host from the landing\'s own chain: sent on once, a Dodge whose line would send it on again stops it (the system\'s once), with the GM told it can be sent on no further; at Can be sent on at most 2, Pebbles may send it on, by the GM\'s press, never straight back at Sela who sent it, and back at Kael, who then gets a Dodge card for the attack he made, hops 2, sent by Pebbles',
        !!dD2 && sD === 0 && /can be sent on no further/.test(gD) && leftD === 0 && !!sE && backE === false && /straight back/.test(tE) && goE === true && !!dE3 && dE3.by === 'Pebbles' && !!lE3 && lE3.hops === 2 && lE3.sby === 'c_1' && lE3.by === 'c_a' && lE3.to === 'c_a', JSON.stringify([sD, gD, backE, tE, goE, dE3, lE3 && [lE3.hops, lE3.sby]]));

    // (e) Turn it aside, a miss, Placed with no roll, a wait that runs out, a save read back
    const wT = world(); const dT = wT.fire(); wT.parry(dT); wT.sendOn(dT.att, 'aside'); const tT = !wT.W.land(dT.att) && wT.out.over.some(x => x[0] === dT.att && x[1] === 'aside') && wT.out.gm.filter(m => /sending it on/.test(m.rec.label || '')).length === 0;
    const wM = world(); const dM = wM.fire(); wM.parry(dM); wM.aim(RG('t_5', 8)); wM.dq([6, 6, 6]); wM.sendOn(dM.att); const tM = !wM.W.land(dM.att) && wM.out.over.some(x => x[0] === dM.att && x[1] === 'missed') && !wM.due('r_def', 'resist', 'c_1') && /and it missed/.test(tail(wM.out.toasts)[0]);
    const wP = world({}, { lines: [{ does: 'send', noRoll: true, margin: 'RollMargin + 1' }] }); const dPl = wP.fire(); wP.parry(dPl); wP.aim(RG('t_5', 8)); wP.dq([]); wP.sendOn(dPl.att); const dP2 = wP.due('r_def', 'resist', 'c_1');
    check('1.6.3 defense fold 4: Turn it aside closes it with no roll; a Return that misses ends it, said to the GM, with no new card; Placed with no roll sends it on with no dice at Its margin, worked out as the parry succeeded (by 7, plus 1)',
        tT && tM && !!dP2 && dP2.m === 8 && wP.out.gm.filter(m => /sending it on/.test(m.rec.label || '')).length === 0, JSON.stringify([tT, tM, dP2]));
    const wW = world({ defenseWait: 5 }); const dW = wW.fire(); wW.parry(dW); const uW = wW.W.land(dW.att) && typeof wW.W.land(dW.att).until === 'number'; wW.W.land(dW.att).until = 1; wW.W.sweep(); const tW = !wW.W.land(dW.att) && wW.out.over.some(x => x[0] === dW.att && x[1] === 'aside');
    const wK = world(); const dK = wK.fire(); wK.parry(dK); wK.net.combats = { f_abcd1234: { mapId: 'm1', rows: [] } }; wK.W.land(dK.att).fid = 'f_abcd1234'; const keptK = wK.W.keep(); wK.W.forget(); const backK = wK.W.back(JSON.parse(JSON.stringify(keptK)), wK.camp), lK = wK.W.land(dK.att);
    wK.aim(RG('t_5', 8)); wK.dq([2, 2, 2]); wK.sendOn(dK.att); const goK = !!wK.due('r_def', 'resist', 'c_1');
    const badK = wK.W.back([Object.assign(JSON.parse(JSON.stringify(keptK[0])), { snd: 'nonsense' })], wK.camp);
    check('1.6.3 defense fold 4: the Combat tab\'s wait turns a card to send it on aside when it runs out; a card to send it on is saved with its fight and read back as data, the roll, modifier, reach and row as they were, and still sends it on; a saved one whose sending does not read is dropped',
        uW && tW && keptK.length === 1 && keptK[0].st === 'send' && backK === 1 && !!lK && lK.st === 'send' && JSON.stringify(lK.snd) === JSON.stringify({ roll: 'f_blade#1', mod: -2, far: 20, row: { f: 'f_blade', r: 'w_b1' } }) && goK && badK === 0, JSON.stringify([uW, tW, keptK, backK, lK && lK.snd]));

    // (f) where it cannot be sent on: a line that cannot work out how far stops it, said to the GM; a hit along a line, and an attack with no damage of its own
    const wB = world({}, { lines: [{ does: 'send', roll: 'f_blade#1', far: 'Nope + 1' }] }); const dB = wB.fire(); wB.parry(dB); const tB = !wB.W.land(dB.att) && !wB.due(null, 'send') && /could not work out how far/.test(tail(wB.out.toasts)[0]);
    const wL = world(); wL.W.area(wL.camp, { by: 'c_a', to: 'c_b', nm: 'Sela', dmg: 1, row: { f: 'f_gun', r: 'w_g1' } }, true, { line: { does: 'send' } }); const tL = /an attack along a line cannot be sent on/.test(tail(wL.out.toasts)[0]) && wL.out.gm.length === 0;
    const wJ = world({}, { dodge: dodgeSend }); wJ.aim(RG('t_b')); wJ.press('r_jab', CK, [2, 3, 3]); const dJ = wJ.due('r_def', 'resist', 'c_b'); wJ.press('r_def', DEF, [1, 1, 1], { att: dJ && dJ.att }, 'pB'); const tJ = /names no damage of its own to send/.test(wJ.out.toasts.join(' | ')) && !wJ.due(null, 'send');
    check('1.6.3 defense fold 4: a line whose reach cannot be worked out stops the attack and the GM is told; a hit along a line cannot be sent on, so it is stopped and said; an attack with no damage of its own (its damage applied by hand) is stopped too, said to the GM, with no card to send it on',
        tB && tL && tJ, JSON.stringify([wB.out.toasts, wL.out.toasts, wJ.out.toasts]));

    // The review of fold 4 (2026-11-18). (1) A send-on roll the GM keeps keeps what follows the GM's. Sela's parry sends it straight back at Kael (May go
    // straight back), so the next defense card is a player's: with a Return roll that reads a GM-only figure the roll is the GM's own, and so are Kael's Dodge
    // card and the new landing; with a plain Return both are public. This also builds a landing whose attacker is its target (finding 4)
    const sendBack = [{ does: 'send', roll: 'f_blade#1', back: true }];
    const wQ = world({}, { lines: sendBack }); const dQ = wQ.fire(); wQ.parry(dQ); wQ.aim(RG('t_me', 4)); wQ.dq([2, 2, 2]); wQ.sendOn(dQ.att); const kQ = wQ.due('r_def', 'resist', 'c_a'), lQ = kQ && wQ.W.land(kQ.att);
    const wR = world({}, { lines: sendBack, sec: true, ret: { formula: '3d6 <= 12 + Secret' } }); const dR = wR.fire(); wR.parry(dR); wR.aim(RG('t_me', 4)); wR.dq([2, 2, 2]); wR.sendOn(dR.att);
    const rR = wR.out.gm.filter(m => /sending it on/.test(m.rec.label || ''))[0], kR = wR.due('r_def', 'resist', 'c_a'), lR = kR && wR.W.land(kR.att), tblR = wR.out.table.filter(m => /sending it on/.test(m.label || '')).length;
    check('1.6.3 the review of defense fold 4 (finding 1): the roll that sends it on reads a GM-only figure, so it is the GM\'s own, and so is all that follows: the next defense card goes to the GM, not Kael\'s player, and the new landing is private; the same roll with no such figure leaves both public',
        !!kQ && kQ.toO === true && !!lQ && lQ.priv !== true && !!rR && rR.rec.priv === 'gm' && tblR === 0 && !!kR && kR.toO === false && !!lR && lR.priv === true, JSON.stringify([kQ, lQ && lQ.priv, rR && rR.rec.priv, tblR, kR, lR && lR.priv]));
    // (2) a roll of the system marked GM only, picked as the roll that sends it on, is posted to the GM alone, its label and formula with it
    const wG2 = world({}, { lines: [{ does: 'send', roll: 'r_aim', back: true }], aim: { vis: 'gm' } }); const dG2 = wG2.fire(); wG2.parry(dG2); wG2.aim(RG('t_me', 4)); wG2.dq([2, 2, 2]); wG2.sendOn(dG2.att);
    const rG2 = wG2.out.gm.filter(m => /sending it on/.test(m.rec.label || ''))[0], kG2 = wG2.due('r_def', 'resist', 'c_a');
    check('1.6.3 the review of defense fold 4 (finding 2): a GM-only roll of the system that a line sends it on with is kept the GM\'s: nothing of it reaches the table, and the next defense card is the GM\'s',
        !!rG2 && rG2.rec.priv === 'gm' && wG2.out.table.filter(m => /sending it on/.test(m.label || '')).length === 0 && !!kG2 && kG2.toO === false && /GM only/.test(wG2.out.toasts.join(' | ')), JSON.stringify([rG2 && rG2.rec, kG2, wG2.out.toasts]));
    // (3) the needs of the roll that sends it on, by whoever presses: a need on a GM-only figure never holds a player back; a need of their own view holds them
    // back in its own words; the GM's own press for an NPC passes a roll ticked Needs judged only for players, and is held back by one that is not
    const wN1 = world({}, { sec: true, ret: { needs: 'Secret >= 5', needsText: 'Only with the secret' } }); const dN1 = wN1.fire(); wN1.parry(dN1); wN1.aim(RG('t_5', 8)); wN1.dq([2, 2, 2]); wN1.sendOn(dN1.att); const goN1 = !!wN1.due('r_def', 'resist', 'c_1') && !/secret/i.test(wN1.out.notes.join(' | '));
    const wN2 = world({}, { ret: { needs: 'HP >= 99', needsText: 'Only when unhurt' } }); const dN2 = wN2.fire(); wN2.parry(dN2); wN2.aim(RG('t_5', 8)); wN2.dq([2, 2, 2]); wN2.sendOn(dN2.att); const nN2 = tail(wN2.out.notes)[0], stN2 = wN2.W.land(dN2.att) && wN2.W.land(dN2.att).st === 'send';
    const npcN = (aim) => { const w = world({ sendHops: 2 }, { dodge: dodgeSend, aim }); const d = w.fire(); w.parry(d); w.aim(RG('t_5', 8)); w.dq([2, 2, 2]); w.sendOn(d.att); const d2 = w.due('r_def', 'resist', 'c_1'); w.dq([1, 1, 1]); w.net.diceRoll(DEF, { charId: 'c_1', act: 'r_def', att: d2.att }); const s2 = w.due(null, 'send', 'c_1'); w.aim(RG('t_me', 6)); w.dq([2, 2, 2]); const toasts0 = w.out.toasts.length; const r = w.net.sendOn(s2.att); return { r, said: w.out.toasts.slice(toasts0).join(' | '), next: w.due('r_def', 'resist', 'c_a') }; };
    const gmPass = npcN({ needs: 'HP >= 99', needsText: 'Only when unhurt', needsGm: true }), gmHeld = npcN({ needs: 'HP >= 99', needsText: 'Only when unhurt' });
    check('1.6.3 the review of defense fold 4 (finding 3): a player\'s press to send it on is judged by their own view: a need on a GM-only figure, which their view leaves out, holds nothing back; a need they can read holds them back in its own words and the card waits; the GM\'s own press for an NPC passes a roll ticked Needs judged only for players, and is held back in its words by one that is not',
        goN1 && /Only when unhurt/.test(nN2) && stN2 && gmPass.r === true && !!gmPass.next && gmHeld.r === false && /Only when unhurt/.test(gmHeld.said) && !gmHeld.next, JSON.stringify([goN1, nN2, gmPass, gmHeld]));
    // (4) the landing that came straight back at Kael (its attacker and its target both Kael, sent by Sela) is saved with its fight and read back whole
    wQ.net.combats = { f_abcd1234: { mapId: 'm1', rows: [] } }; wQ.W.land(kQ.att).fid = 'f_abcd1234'; const keptQ = wQ.W.keep(); wQ.W.forget(); const backQ = wQ.W.back(JSON.parse(JSON.stringify(keptQ)), wQ.camp), lQ2 = wQ.W.land(kQ.att);
    const badQ = wQ.W.back([Object.assign(JSON.parse(JSON.stringify(keptQ[0])), { hops: 0, sby: undefined })], wQ.camp);
    check('1.6.3 the review of defense fold 4 (finding 4): a landing whose attacker is also its target, because another sent it back at them, is saved with its fight and read back, by, to, who sent it and its hops as they were; one that says nobody sent it is no landing and is dropped as before',
        keptQ.length === 1 && backQ === 1 && !!lQ2 && lQ2.by === 'c_a' && lQ2.to === 'c_a' && lQ2.sby === 'c_b' && lQ2.hops === 1 && badQ === 0, JSON.stringify([keptQ, backQ, lQ2]));
    // (5) the attack's own roll gone: the defense that would send it on stops it, said to the GM, with no card; a card waiting when its roll goes is turned aside,
    // never sent on undefended
    const wX1 = world(); const dX1 = wX1.fire(); delete wX1.W.land(dX1.att).ent; wX1.parry(dX1); const tX1 = !wX1.W.land(dX1.att) && !wX1.due(null, 'send') && /the roll the attack was made with is not there now/.test(wX1.out.toasts.join(' | '));
    const wX2 = world(); const dX2 = wX2.fire(); wX2.parry(dX2); wX2.W.land(dX2.att).ent = 'r_nope'; wX2.aim(RG('t_5', 8)); wX2.dq([2, 2, 2]); wX2.sendOn(dX2.att);
    const tX2 = !wX2.W.land(dX2.att) && wX2.out.over.some(x => x[0] === dX2.att && x[1] === 'aside') && !wX2.due('r_def', 'resist', 'c_1') && wX2.out.gm.filter(m => /sending it on/.test(m.rec.label || '')).length === 0 && /is not there now, so it was turned aside/.test(tail(wX2.out.toasts)[0]);
    check('1.6.3 the review of defense fold 4 (finding 5): an attack whose own roll the system no longer holds is never sent on to a new target undefended: as its defense comes in it is stopped and said, with no card; a card that waits when its roll goes is turned aside, nothing rolled, and said',
        tX1 && tX2, JSON.stringify([wX1.out.toasts, wX2.out.toasts, wX2.out.over]));
    // (6) Sela's player away: her card waits, its GM's copy offers Send it on (sendStuck), and the GM sends it with their own pointer; back at the table, it is hers
    const wS = world(); const dS = wS.fire(); wS.parry(dS); const stuck0 = wS.net.sendStuck(dS.att); wS.net.conns[1].open = false; const stuck1 = wS.net.sendStuck(dS.att);
    wS.net.targets.u_gm = { id: 't_5', mapId: 'm1' }; wS.aimBy({ 'tid:t_5': RG('t_5', 8) }); wS.dq([2, 2, 2]); wS.out.rto.length = 0; const goS = wS.net.sendOn(dS.att), nS = wS.due('r_def', 'resist', 'c_1');
    check('1.6.3 the review of defense fold 4 (finding 6): while the defender\'s player is away the GM\'s copy of the card may send it on (sendStuck true only then), and the GM\'s press aims it with the GM\'s own pointer',
        stuck0 === false && stuck1 === true && goS === true && !!nS && nS.by === 'Sela' && wS.out.rto[0] === 'tid:t_5', JSON.stringify([stuck0, stuck1, goS, nS, wS.out.rto]));
    // (7) the GM's own press for an NPC defender: the GM's pointer on that map comes first, ahead of a leftover pointer of the token's own (Target as, still on
    // the one who sent it); with no GM pointer on that map, the token's own aims it
    const npcP = (by) => { const w = world({ sendHops: 2 }, { dodge: dodgeSend }); const d = w.fire(); w.parry(d); w.aim(RG('t_5', 8)); w.dq([2, 2, 2]); w.sendOn(d.att); const d2 = w.due('r_def', 'resist', 'c_1'); w.dq([1, 1, 1]); w.net.diceRoll(DEF, { charId: 'c_1', act: 'r_def', att: d2.att }); const s2 = w.due(null, 'send', 'c_1'); Object.keys(w.net.targets).forEach(k => { delete w.net.targets[k]; }); Object.keys(by).forEach(k => { w.net.targets[k] = { id: by[k], mapId: 'm1' }; }); w.aimBy({ 'tid:t_b': RG('t_b', 6), 'tid:t_me': RG('t_me', 6) }); w.dq([2, 2, 2]); w.out.rto.length = 0; const t0 = w.out.toasts.length; const r = w.net.sendOn(s2.att); return { r, said: w.out.toasts.slice(t0).join(' | '), asked: w.out.rto.slice(), to: w.due('r_def', 'resist', 'c_a') }; };
    const pGm = npcP({ 'tk:t_5': 't_b', u_gm: 't_me' }), pTk = npcP({ 'tk:t_5': 't_me' }), pNo = npcP({ u_gm: 't_x' });
    check('1.6.3 the review of defense fold 4 (finding 7): the GM\'s own press for an NPC aims with the GM\'s own pointer where it stands on that map, so a Target as left on the one who sent it is passed over; with none of the GM\'s there, the token\'s own aims it; each is judged as the GM sees the map (rangeTo with no viewer and the pointer\'s token); with only a pointer at someone it cannot be sent at, the card waits',
        pGm.r === true && !!pGm.to && JSON.stringify(pGm.asked) === JSON.stringify(['tid:t_me']) && !/straight back/.test(pGm.said) && pTk.r === true && !!pTk.to && JSON.stringify(pTk.asked) === JSON.stringify(['tid:t_me'])
        && pNo.r === false && /Point at who you send it to/.test(pNo.said), JSON.stringify([pGm, pTk, pNo]));
    // (11) a target the defender cannot see: her own pointer is what is judged (rangeTo, as her), so one her fog drops reads as nobody pointed at; a hidden token is not
    // someone it can be sent at; nothing is rolled either way
    const wF = world(); const dF = wF.fire(); wF.parry(dF); wF.aimBy({ u_b: null }); wF.out.rto.length = 0; wF.sendOn(dF.att); const nF1 = tail(wF.out.notes)[0], askF = wF.out.rto.slice();
    wF.aimBy(null); wF.camp.items.m1.whiteboard.filter(x => x.id === 't_5')[0].hidden = true; wF.aim(RG('t_5', 8)); wF.sendOn(dF.att); const nF2 = tail(wF.out.notes)[0];
    check('1.6.3 the review of defense fold 4 (finding 11): a player\'s send is judged by their own pointer through rangeTo, as them, so a target their fog drops reads as nobody pointed at; a hidden token is not someone it can be sent at; the card waits and nothing is rolled',
        JSON.stringify(askF) === JSON.stringify(['u_b']) && /Point at who you send it to/.test(nF1) && /not someone it can be sent at/.test(nF2) && wF.W.land(dF.att) && wF.W.land(dF.att).st === 'send' && wF.out.gm.filter(m => /sending it on/.test(m.rec.label || '')).length === 0, JSON.stringify([askF, nF1, nF2]));
    // (11) a chain of three under Can be sent on at most 3: Sela sends it at Pebbles; Pebbles' Dodge sends it on, and that card is saved with its fight and read back
    // mid-chain (its roll, who sent it, its kind as first made); Pebbles sends it at Coin, Coin's Dodge sends it back at Sela, who did not send it to Coin: hops 3
    const wC = world({ sendHops: 3 }, { dodge: dodgeSend }); const dC = wC.fire(); wC.parry(dC); wC.aim(RG('t_5', 8)); wC.dq([2, 2, 2]); wC.sendOn(dC.att); const dC1 = wC.due('r_def', 'resist', 'c_1');
    wC.dq([1, 1, 1]); wC.net.diceRoll(DEF, { charId: 'c_1', act: 'r_def', att: dC1.att }); const sC1 = wC.due(null, 'send', 'c_1');
    wC.net.combats = { f_abcd1234: { mapId: 'm1', rows: [] } }; wC.W.land(sC1.att).fid = 'f_abcd1234'; const keptC = wC.W.keep(); wC.W.forget(); const backC = wC.W.back(JSON.parse(JSON.stringify(keptC)), wC.camp), lC1 = wC.W.land(sC1.att);
    wC.aim(RG('t_9', 6)); wC.dq([2, 2, 2]); const goC2 = wC.net.sendOn(sC1.att), dC2 = wC.due('r_def', 'resist', 'c_2');
    wC.dq([1, 1, 1]); wC.net.diceRoll(DEF, { charId: 'c_2', act: 'r_def', att: dC2.att }); const sC2 = wC.due(null, 'send', 'c_2');
    wC.aim(RG('t_b', 6)); wC.dq([2, 2, 2]); const goC3 = wC.net.sendOn(sC2.att), dC3 = wC.due('r_def', 'resist', 'c_b'), lC3 = dC3 && wC.W.land(dC3.att);
    check('1.6.3 the review of defense fold 4 (finding 11): a chain of three, Can be sent on at most 3: a card to send it on read back from its fight\'s save mid-chain keeps its roll, who sent it on and the kind the attack was first made with, and still sends it; Coin may send it back at Sela, who did not send it to Coin; the last landing is hops 3, sent by Coin, its attacker still Kael',
        backC === 1 && !!lC1 && lC1.st === 'send' && lC1.hops === 1 && lC1.sby === 'c_b' && JSON.stringify(lC1.snd) === JSON.stringify({ roll: 'r_aim' }) && !!lC1.ak && lC1.ak.k === 3 && goC2 === true && !!sC2 && goC3 === true && !!lC3 && lC3.hops === 3 && lC3.sby === 'c_2' && lC3.by === 'c_a' && lC3.to === 'c_b',
        JSON.stringify([keptC, lC1, goC2, sC2, goC3, lC3]));

    // (g) the source: one host branch, before card-act, reading the landing's id and how alone; the verdict net.diceRoll leaves for it; a system with no line that
    // sends it on is as before (a Parry with no lines stops it, its landing never waits as a card to send it on)
    const wN = world({}, { lines: [] }); const dN = wN.fire(); wN.parry(dN); const tN = !wN.W.land(dN.att) && !wN.due(null, 'send') && !wN.out.over.some(x => /sent|aside|missed/.test(x[1] || ''));
    check('1.6.3 defense fold 4 (source): the host\'s send-on branch sits before card-act and hands sendOnPress the landing\'s id, Turn it aside or not, and the sender\'s own profile id; net.diceRoll leaves its verdict for it; attemptMake keeps an attack sent on to the kind it was first made with; a Parry with no line that sends it on stops the attack as before',
        src7.indexOf("    } else if (msg.type === 'send-on' && net.role === 'host') {") > 0 && src7.indexOf("    } else if (msg.type === 'send-on' && net.role === 'host') {") < src7.indexOf("    } else if (msg.type === 'card-act' && net.role === 'host') {")
        && src7.includes("sendOnPress(getActiveCampaign(), qso.att, qso.how, peerProfileId(conn), diceFrom(net.roster[conn.peer], false))") && src7.includes("    net.rollVerdict = D.verdictOf(res, ruleR);") && kit.part('netattack.js').includes("function attemptMake(camp, entry, vd, malf, range, fromCh, priv, vars, rowRef, ov) {") && tN, JSON.stringify(tN));
})());
// 1.6.3 (the review of defense fold 0): the press of a called damage roll's card, end to end with the table's own sends (roll-req, net.diceRoll, the attempt slice,
// the npcseen slice and sendTable run for real with the real core and dice, two players at the table). Invented names
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx0 = await import(url('formula.js')), Dx = await import(url('dicecore.js'));
    const src4 = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'net.js'), 'utf8').replace(/\r\n/g, '\n');
    const line = k => { const i = src4.indexOf(k); if (i < 0) throw new Error('netcheck: ' + k + ' not found'); return src4.slice(i, src4.indexOf('\n', i)); };
    const helpers = ['function own(', 'function peerProfileId(', 'function fxLib(', 'function itemLib(', 'function diceFrom('].map(line).join('\n') + '\n';
    const rqSrc = (ordersSrc + '\n' + between('// [netcheck:rollreq-start]', '// [netcheck:rollreq-end]', 'rollreq')), drSrc = between('// [netcheck:diceroll-start]', '// [netcheck:diceroll-end]', 'diceroll'), atSrc = between('// [netcheck:attempt-start]', '// [netcheck:attempt-end]', 'attempt', 'netattack.js');
    const nsSrc = between('// [netcheck:npcseen-start]', '// [netcheck:npcseen-end]', 'npcseen'), stSrc = fnSrc('function sendTable(msg, exceptConn) {', '\n}\n', 'sendTable') + '\n}\n';
    let dq = []; const Fx = Object.assign({}, Fx0, { evaluate: (e, o) => Fx0.evaluate(e, Object.assign({ random: () => { if (!dq.length) throw new Error('netcheck: no die left'); return dq.shift(); } }, o)) });
    const CK = '3d6 <= 12', STAB = '1d6 + TargetDistance', sysR = Sx.cleanSystem({ v: 1, name: 'R', combat: { checks: 'under3d6' }, fields: [{ id: 'f_hp', key: 'HP', label: 'HP', kind: 'number', vis: 'all', edit: 'owner', def: 5 }],
        rolls: [{ id: 'r_swing', label: 'Swing', formula: CK, vis: 'all', calls: [{ roll: 'r_cut', when: 'hit' }, { roll: 'r_trip', when: 'miss' }, { roll: 'r_look', when: 'hit' }, { roll: 'r_stab', when: 'hit' }] }, { id: 'r_cut', label: 'Cut', formula: '1d6', vis: 'all', dmg: true },
            { id: 'r_trip', label: 'Trip', formula: '1d6', vis: 'all', dmg: true }, { id: 'r_look', label: 'Look', formula: '3d6 <= 10', vis: 'all' }, { id: 'r_stab', label: 'Stab', formula: STAB, vis: 'all', dmg: true }] }, { F: Fx, gmView: true });
    const at = (tid, dist) => tid ? { tid, mapId: 'm1', mod: 0, dist: dist || 5, tb: 30 } : null;
    const world = () => { const out = { sent: { pA: [], pB: [] }, due: [], gm: [] };
        const tok = (id, charId, x) => ({ id, isChar: true, charId, x, y: 0, w: 60, h: 52 }), wb = [Object.assign(tok('t_me', 'c_a', 0), { ownerId: 'u_a' }), Object.assign(tok('t_b', 'c_b', 60), { ownerId: 'u_b' }), tok('t_5', 'c_1', 300), tok('t_9', 'c_2', 600)];
        const camp = { id: 'k', activeItemId: 'm1', system: sysR, chars: { c_a: { id: 'c_a', name: 'Kael', ownerId: 'u_a', values: {} }, c_b: { id: 'c_b', name: 'Sela', ownerId: 'u_b', values: {} }, c_1: { id: 'c_1', name: 'Pebbles', npc: true, values: {} }, c_2: { id: 'c_2', name: 'Coin', npc: true, values: {} } }, items: { m1: { id: 'm1', type: 'map', meta: { gridType: 'square' }, whiteboard: wb } } };
        const conn = p => ({ peer: p, open: true, send(m) { packCheck(m); out.sent[p].push(JSON.parse(JSON.stringify(m))); } }), cA = conn('pA'), cB = conn('pB');
        const net = { role: 'host', active: true, stream: false, paused: false, conns: [cA, cB], targets: {}, roster: { pA: { id: 'u_a', name: 'Pat', location: 'm1' }, pB: { id: 'u_b', name: 'Bo', location: 'm1' } }, combats: {}, syncCharDelta: () => {}, postDue: (c, rr, kind, r, toO, more) => out.due.push({ ch: c.id, roll: rr.id, att: more.att }), damageCard: () => {} };
        let rg = at('t_5');
        const win = { wpFormula: Fx, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {}, tokenCtxFor: () => rg ? { range: rg } : null }, wpVtt: { on: () => true, rulesOn: () => true } };
        const hitIn = (c, rc, row) => rc && typeof rc.tid === 'string' && /^w_/.test(row) ? { fn: () => 0, aim: () => ({ n: 'Arm' }), secret: () => false } : null;   // a stand-in for the host's location judge: any location on any target
        const W = new Function('net', 'DC', 'SC', 'window', 'getActiveCampaign', 'peerPaused', 'sendFailed', 'pushRoll', 'logEvent', 'saveRemoteSoon', 'rangeTo', 'getProfile', 'toast', 'ui', 'save', 'fogDrop', 'targetHitIn',
            'var diceLimit = null, _diceSlowSaid = {}, _dicePending = null;\n' + helpers + nsSrc + '\n' + stSrc + atSrc + '\n' + drSrc + '\nreturn { rq: function(msg, conn) {\ndiceLimit = null; _diceSlowSaid = {};\n' + rqSrc + '\n}, dr: net.diceRoll, rec: function(id) { return _attempts[id]; }, forget: attemptForget };')(
            net, () => Dx, () => Sx, win, () => camp, () => false, e => { throw e; }, (rec, res) => out.gm.push({ rec: JSON.parse(JSON.stringify(rec)), v: res && res.value }), () => {}, () => {}, () => rg, () => ({ id: 'u_gm', name: 'GM' }), () => {}, () => null, () => {}, () => null, hitIn);
        const press = (act, expr, dice, x) => { dq = dice.slice(); const rid = 'q' + Math.random().toString(36).slice(2, 7); W.rq(Object.assign({ type: 'roll-req', rid, charId: 'c_a', act, expr }, x || {}), cA); return rid; };
        const due = roll => { const d = out.due.filter(x => x.roll === roll); return d.length ? d[d.length - 1].att : null; };
        const mine = rid => out.sent.pA.filter(m => m.type === 'roll' && m.rid === rid)[0] || null, denied = rid => out.sent.pA.filter(m => m.type === 'roll-deny' && m.rid === rid).map(m => m.message || '')[0] || null;
        const others = id => out.sent.pB.filter(m => m.type === 'roll' && m.id === id), gmLast = () => out.gm[out.gm.length - 1];
        return { camp, net, out, W, press, due, mine, denied, others, gmLast, aim: r => { rg = r; }, dq: d => { dq = d.slice(); } }; };
    const tok = (w, id) => w.camp.items.m1.whiteboard.filter(x => x.id === id)[0];

    // finding 11: a system that sets nothing new: a hit call for a roll that is no damage roll posts its card on a soft record, as before
    const w0 = world(); w0.press('r_swing', CK, [2, 3, 3]); const look0 = w0.due('r_look'), trip0b = w0.due('r_cut');
    check('1.6.3 (the review of defense fold 0) a player\'s hit through roll-req: a call for a roll that is no damage roll keeps its soft record, and one for a damage roll that lands on their target a hard one', /^b_/.test(look0 || '') && /^a_/.test(trip0b || ''), j([look0, trip0b]));

    // finding 1 and 8: the roller always gets their own roll, and their copy names the one it lands on only where they can see that one
    const w1 = world(); w1.press('r_swing', CK, [2, 3, 3]); const c1 = w1.due('r_cut'); tok(w1, 't_5').hidden = true;
    const r1 = w1.press('r_cut', '1d6', [4], { att: c1 }), m1 = w1.mine(r1), g1 = w1.gmLast();
    check('1.6.3 (the review of fold 0, finding 1) a card that lands on someone the roller cannot see now (the GM hid them): the roller still gets their own roll, answered by its rid, with no word of whom it lands on; no other player who cannot see them gets it; the GM\'s own copy lands on them and names them',
        !!m1 && m1.dmg === 1 && m1.dmgOn === undefined && m1.onName === undefined && w1.denied(r1) === null && w1.others(m1 && m1.id).length === 0 && g1.rec.dmgOn === 'c_1' && g1.rec.onName === 'Pebbles', j([m1, g1.rec.dmgOn, g1.rec.onName, w1.others(m1 && m1.id).length]));
    tok(w1, 't_5').hidden = false; w1.press('r_swing', CK, [2, 3, 3]); const c1b = w1.due('r_cut'), r1b = w1.press('r_cut', '1d6', [4], { att: c1b }), m1b = w1.mine(r1b), o1b = w1.others(m1b && m1b.id);
    check('1.6.3 ... and where they can see that one, the roller\'s copy and every other player\'s who can see them say whom it lands on, each sent once',
        !!m1b && m1b.dmgOn === 'c_1' && m1b.onName === 'Pebbles' && o1b.length === 1 && o1b[0].onName === 'Pebbles', j([m1b, o1b]));
    w1.press('r_swing', CK, [2, 3, 3]); const c1c = w1.due('r_cut'); tok(w1, 't_5').hidden = true; const r1c = w1.press('r_cut', '1d6', [4], { att: c1c, priv: 'gm' }), m1c = w1.mine(r1c), g1c = w1.gmLast();
    check('1.6.3 (finding 8) a private press of such a card: the roller\'s copy carries no word of whom it lands on where they cannot see them, while the GM\'s copy lands on them and names them',
        !!m1c && m1c.dmgOn === undefined && m1c.onName === undefined && g1c.rec.dmgOn === 'c_1' && g1c.rec.onName === 'Pebbles' && g1c.rec.priv === 'gm', j([m1c, g1c.rec.dmgOn]));

    // finding 2: a card stamped as landing on nobody reads nothing of whoever the presser points at by then
    const w2 = world(); w2.aim(null); w2.press('r_swing', CK, [2, 3, 3]); const s2 = w2.due('r_stab'); w2.aim(at('t_9', 9)); w2.press('r_stab', STAB, [4], { att: s2 }); const g2 = w2.gmLast();
    check('1.6.3 (the review of fold 0, finding 2) a card stamped as landing on nobody: the record says the GM aims it (dmgAim), with no dmgOn and nothing of the presser\'s live target (no facing, no distance read, 4 and not 4 + 9)',
        g2.rec.dmgAim === 1 && g2.rec.dmgOn === undefined && g2.rec.tb === undefined && g2.v === 4, j([g2.rec.dmgAim, g2.rec.dmgOn, g2.rec.tb, g2.v]));

    // finding 3: a card that lands on its stamped target never reads, nor aims at, another the presser points at now
    const w3 = world(); w3.press('r_swing', CK, [2, 3, 3]); const s3 = w3.due('r_stab'); w3.aim(at('t_9', 9)); w3.press('r_stab', STAB, [4], { att: s3, hit: 'w_arm' }); const g3 = w3.gmLast();
    w3.aim(at('t_5', 5)); w3.press('r_swing', CK, [2, 3, 3]); const s3b = w3.due('r_stab'); w3.press('r_stab', STAB, [4], { att: s3b, hit: 'w_arm' }); const g3b = w3.gmLast();
    check('1.6.3 (the review of fold 0, finding 3) a card that lands on Pebbles, pressed while the roller points at Coin with a location picked: no location of Coin\'s rides on it and nothing of Coin is read (4, not 4 + 9); pressed while still pointing at Pebbles, the location and the distance stand (4 + 5)',
        g3.rec.dmgOn === 'c_1' && g3.rec.hit === undefined && g3.rec.aim === undefined && g3.v === 4 && g3b.rec.dmgOn === 'c_1' && g3b.rec.hit === 'w_arm' && g3b.v === 9, j([g3.rec.dmgOn, g3.rec.hit, g3.v, g3b.rec.hit, g3b.v]));
    // ... and the GM's own roll alike (net.diceRoll)
    const w3g = world(); w3g.dq([2, 3, 3]); w3g.W.dr(CK, { charId: 'c_a', act: 'r_swing' }); const s3g = w3g.due('r_stab'); w3g.aim(at('t_9', 9)); w3g.dq([4]); w3g.W.dr(STAB, { charId: 'c_a', act: 'r_stab', att: s3g, hit: 'w_arm' }); const g3g = w3g.gmLast();
    check('1.6.3 ... the GM\'s own press (net.diceRoll run for real) alike: it lands on Pebbles, with nothing of Coin read or aimed at',
        g3g.rec.dmgOn === 'c_1' && g3g.rec.hit === undefined && g3g.v === 4, j([g3g.rec.dmgOn, g3g.rec.hit, g3g.v]));

    // finding 5: a card whose roll is held for its card actions answers no second press, in words of its own
    const w5 = world(); w5.press('r_swing', CK, [2, 3, 3]); const c5 = w5.due('r_cut'); w5.W.rec(c5).busy = 1; const r5 = w5.press('r_cut', '1d6', [4], { att: c5 });
    const w5g = world(); w5g.press('r_swing', CK, [2, 3, 3]); const c5g = w5g.due('r_cut'); w5g.W.rec(c5g).busy = 1; w5g.dq([4]); const g5 = w5g.W.dr('1d6', { charId: 'c_a', act: 'r_cut', att: c5g });
    const srcN = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'net.js'), 'utf8');
    check('1.6.3 (the review of fold 0, finding 5) a card whose roll is under way (held by its card actions until accepted) is refused on a second press, on both roll paths, in words of its own; both paths mark it as they hold it',
        /being rolled already/.test(w5.denied(r5) || '') && !w5.mine(r5) && g5 && /being rolled already/.test(g5.error || '') && srcN.includes("if (heldCQ && q.att && typeof attemptRec === 'function') { var bzQ = attemptRec(q.att); if (bzQ) bzQ.busy = 1; }") && srcN.includes("{ if (typeof o.att === 'string' && typeof attemptRec === 'function') { var bzR = attemptRec(o.att); if (bzR) bzR.busy = 1; } return { ok: true, pending: true, value: res.value }; }"), j([w5.denied(r5), g5]));

    // finding 7: after a reload of the GM's Waypoint, a card that landed on someone else is refused in a damage card's own words; one that lands on its own character still lands there
    const w7 = world(); w7.press('r_swing', CK, [2, 3, 3]); const c7 = w7.due('r_cut'); w7.press('r_swing', CK, [6, 6, 6]); const t7 = w7.due('r_trip'); w7.W.forget();
    const r7 = w7.press('r_cut', '1d6', [4], { att: c7 }), r7b = w7.press('r_trip', '1d6', [2], { att: t7 }), m7b = w7.mine(r7b);
    check('1.6.3 (the review of fold 0, finding 7) after the GM\'s Waypoint lets its records go, a card that landed on their target is refused in a damage card\'s words, never aimed again; a miss\'s card, which lands on the roller, is still pressed and lands on them',
        /damage card has been rolled already, or the GM\u2019s Waypoint reloaded/.test(w7.denied(r7) || '') && !!m7b && m7b.dmgOn === 'c_a' && /^b_/.test(t7 || ''), j([w7.denied(r7), m7b, t7]));
})());
// 1.6.3 (defense fold 2; docs/DEFENSE_INTERACTIONS_DESIGN.md 4.4, backlog 245): a roll of the system that resists may be Answered with a row of a list. Its card
// offers it once for each row of that list the defender may answer with, the press names that row beside the roll (the wire's with: { f, r }, never q.row), and
// the host takes the attempt only on a row it offered, reads the roll, its Then and a call's Read on the one who resisted on that row, and lands a call to a roll
// of that list there. The roll-req branch, net.diceRoll and the attempt slice run for real with the real core (invented data: Kael, Sela, Tor, Pebbles)
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx0 = await import(url('formula.js')), Dx = await import(url('dicecore.js'));
    const src4 = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'net.js'), 'utf8').replace(/\r\n/g, '\n');
    const line = k => { const i = src4.indexOf(k); if (i < 0) throw new Error('netcheck: ' + k + ' not found'); return src4.slice(i, src4.indexOf('\n', i)); };
    const helpers = ['function own(', 'function peerProfileId(', 'function fxLib(', 'function itemLib(', 'function diceFrom('].map(line).join('\n') + '\n';
    const rqSrc = (ordersSrc + '\n' + between('// [netcheck:rollreq-start]', '// [netcheck:rollreq-end]', 'rollreq')), drSrc = between('// [netcheck:diceroll-start]', '// [netcheck:diceroll-end]', 'diceroll'), atSrc = between('// [netcheck:attempt-start]', '// [netcheck:attempt-end]', 'attempt', 'netattack.js');
    let dq = []; const Fx = Object.assign({}, Fx0, { evaluate: (e, o) => Fx0.evaluate(e, Object.assign({ random: () => { if (!dq.length) throw new Error('netcheck: no die left'); return dq.shift(); } }, o)) });
    const DEF = '3d6 <= Row.Def - AttemptMargin';
    const raw = { v: 1, name: 'W', combat: { checks: 'under3d6' }, fields: [{ id: 'f_wl', key: 'Will', label: 'Will', kind: 'number', vis: 'all', edit: 'owner', def: 12 }, { id: 'f_sn', key: 'Seen', label: 'Seen', kind: 'number', vis: 'all', edit: 'owner', def: 0 },
        { id: 'f_wp', key: 'Weapons', label: 'Weapons', kind: 'item-list', vis: 'all', edit: 'owner', list: { stats: [{ key: 'Def' }], rolls: [{ label: 'Wear', formula: '3d6' }] } }],
        items: [{ id: 'i_sw', name: 'Blade', stats: { Def: 11 } }, { id: 'i_st', name: 'Staff', stats: { Def: 10 } }, { id: 'i_sk', name: 'Stick', stats: { Def: 5 } }, { id: 'i_gm', name: 'Cursed hook', vis: 'gm', stats: { Def: 9 } }],
        rolls: [{ id: 'r_tr', label: 'Lunge', formula: '3d6 <= 13', vis: 'all', resistBy: 'r_df', resistOr: ['r_dg'], calls: [{ roll: 'f_wp#0', when: 'resisted', by: 'r_df', byIf: 'Row.Def >= 11' }] },
            { id: 'r_t2', label: 'Jab', formula: '3d6 <= 13', vis: 'all', resistBy: 'r_df' },
            { id: 'r_df', label: 'Defend', formula: DEF, vis: 'all', resist: true, withRow: 'f_wp', needs: 'Row.Def >= 8', then: [{ f: 'f_sn', formula: 'Row.Def', set: true }] },
            { id: 'r_dg', label: 'Duck', formula: '3d6 <= Will - AttemptMargin', vis: 'all', resist: true }] };
    const sys = Sx.cleanSystem(raw, { F: Fx, gmView: true }), sysP = Sx.cleanSystem(sys, { F: Fx, gmView: false });
    const out = { table: [], sent: { pA: [], pB: [] }, dues: [] }, aim = { u_a: 't_b', u_b: 't_a', gm: 't_b' };
    const camp = { id: 'k', activeItemId: 'm1', system: sys, chars: { c_a: { id: 'c_a', name: 'Kael', ownerId: 'u_a', npc: false, values: {} },
        c_b: { id: 'c_b', name: 'Sela', ownerId: 'u_b', npc: false, values: { f_wp: [{ id: 'w_sw', defId: 'i_sw', qty: 1 }, { id: 'w_st', defId: 'i_st', qty: 1 }, { id: 'w_sk', defId: 'i_sk', qty: 1 }, { id: 'w_gm', defId: 'i_gm', qty: 1 }, { id: 'w_hd', defId: 'i_sw', qty: 1, hid: 1 }] } },
        c_c: { id: 'c_c', name: 'Tor', ownerId: 'u_c', npc: false, values: {} } },
        items: { m1: { type: 'map', whiteboard: [{ id: 't_a', charId: 'c_a', ownerId: 'u_a', isChar: true, x: 0, y: 0 }, { id: 't_b', charId: 'c_b', ownerId: 'u_b', isChar: true, x: 50, y: 0 }, { id: 't_c', charId: 'c_c', ownerId: 'u_c', isChar: true, x: 100, y: 0 }] } } };
    const net = { role: 'host', active: true, stream: false, paused: false, conns: [], roster: { pA: { id: 'u_a', name: 'Pat', location: 'm1' }, pB: { id: 'u_b', name: 'Bo', location: 'm1' } }, combats: {}, syncCharDelta() {},
        postDue: (ch, act, kind, round, toOwner, more) => out.dues.push({ ch: ch.id, act: act.id, kind: kind, toOwner: toOwner, or: more && Array.isArray(more.or) ? more.or.map(r => r.id) : null, withs: more && Array.isArray(more.withs) ? more.withs : null, nm: more && more.nm === true, att: more && more.att, m: more && more.m, row: more && more.row ? more.row : null }) };
    const conn = p => ({ peer: p, send(m) { packCheck(m); out.sent[p].push(JSON.parse(JSON.stringify(m))); } }), cA = conn('pA'), cB = conn('pB');
    const rng = t => t ? { mod: 0, dist: 2, tid: t, mapId: 'm1' } : null;
    const win = { wpFormula: Fx, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {}, tokenCtxFor: () => aim.gm ? { range: rng(aim.gm) } : null }, wpVtt: { on: () => true, rulesOn: () => true } };
    const W = new Function('net', 'DC', 'SC', 'window', 'getActiveCampaign', 'peerPaused', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'saveRemoteSoon', 'rangeTo', 'getProfile', 'toast', 'ui', 'save',
        'var diceLimit = null, _diceSlowSaid = {}, _dicePending = null;\n' + helpers + atSrc + '\n' + drSrc + '\nreturn { rq: function(msg, conn) {\ndiceLimit = null; _diceSlowSaid = {};\n' + rqSrc + '\n}, dr: net.diceRoll, att: function(id) { return _attempts[id]; }, cp: callPost };')(
        net, () => Dx, () => Sx, win, () => camp, () => false, e => { throw e; }, rec => { packCheck(rec); out.table.push(JSON.parse(JSON.stringify(rec))); }, rec => { (out.gmR = out.gmR || []).push(JSON.parse(JSON.stringify(rec))); }, () => {}, () => {},
        (c, m, l, tok, pid) => rng(aim[pid]), () => ({ id: 'u_gm', name: 'GM' }), () => {}, () => null, () => {});
    const roll = (cn, charId, extra, expr, dice) => { dq = dice.slice(); W.rq(Object.assign({ type: 'roll-req', rid: 'q' + Math.random().toString(36).slice(2, 7), charId: charId, expr: expr }, extra), cn); };
    const last = p => out.sent[p][out.sent[p].length - 1];
    roll(cA, 'c_a', { act: 'r_tr' }, '3d6 <= 13', [2, 3, 4]); const d1 = out.dues[out.dues.length - 1], rec1 = W.att(d1.att);
    roll(cB, 'c_b', { act: 'r_df', att: d1.att }, DEF, [1, 1, 1]); const bare = last('pB');
    roll(cB, 'c_b', { act: 'r_df', with: { f: 'f_wp', r: 'w_sk' }, att: d1.att }, DEF, [1, 1, 1]); const stick = last('pB');
    roll(cB, 'c_b', { act: 'r_df', with: { f: 'f_wp', r: 'w_gm' }, att: d1.att }, DEF, [1, 1, 1]); const hook = last('pB');
    roll(cB, 'c_b', { act: 'r_dg', with: { f: 'f_wp', r: 'w_st' }, att: d1.att }, '3d6 <= Will - AttemptMargin', [1, 1, 1]); const duckW = last('pB'), keptA = !!W.att(d1.att);
    const nC0 = out.dues.length; roll(cB, 'c_b', { act: 'r_df', with: { f: 'f_wp', r: 'w_st' }, att: d1.att }, DEF, [1, 1, 2]); const seenSt = camp.chars.c_b.values.f_sn, goneA = !W.att(d1.att), calls1 = out.dues.slice(nC0).filter(d => d.kind === 'called');
    roll(cB, 'c_b', { act: 'r_df', with: { f: 'f_wp', r: 'w_sw' }, att: d1.att }, DEF, [1, 1, 1]); const again = last('pB');
    roll(cA, 'c_a', { act: 'r_tr' }, '3d6 <= 13', [2, 3, 4]); const d2 = out.dues[out.dues.length - 1];
    const nC1 = out.dues.length; roll(cB, 'c_b', { act: 'r_df', with: { f: 'f_wp', r: 'w_sw' }, att: d2.att }, DEF, [1, 1, 1]); const seenSw = camp.chars.c_b.values.f_sn, calls2 = out.dues.slice(nC1).filter(d => d.kind === 'called');
    roll(cA, 'c_a', { act: 'r_tr', priv: 'gm' }, '3d6 <= 13', [2, 3, 4]); const dP = out.dues[out.dues.length - 1];
    net._attNext = { att: dP.att, charId: 'c_b', act: 'r_df', with: { f: 'f_wp', r: 'w_gm' } }; dq = [1, 1, 1]; const gR = W.dr(DEF, { charId: 'c_b', act: 'r_df' }); net._attNext = null; const seenGm = camp.chars.c_b.values.f_sn, goneP = !W.att(dP.att);
    roll(cA, 'c_a', { act: 'r_tr', priv: 'gm' }, '3d6 <= 13', [2, 3, 4]); const dP2 = out.dues[out.dues.length - 1]; dq = [1, 1, 1]; const gBare = W.dr(DEF, { charId: 'c_b', act: 'r_df', att: dP2.att }), gWrong = W.dr(DEF, { charId: 'c_b', act: 'r_dg', att: dP2.att, with: { f: 'f_wp', r: 'w_sw' } });
    aim.u_a = 't_c'; const nT = out.dues.length; roll(cA, 'c_a', { act: 'r_tr' }, '3d6 <= 13', [2, 3, 4]); const dT = out.dues.slice(nT); roll(cA, 'c_a', { act: 'r_t2' }, '3d6 <= 13', [2, 3, 4]); const dT2 = out.dues.length - nT - dT.length; aim.u_a = 't_b';
    check('1.6.3 defense fold 2: a Defend Answered with a row of Weapons is offered on Sela\'s card once for each row she may answer with, as "Defend with Blade" (never the GM-only hook, the hidden row, or the Stick its needs Row.Def >= 8 leave out), the plain Duck beside them and never the Defend bare; a bare press, a row not offered, the hook, and Duck naming a row are refused with the attempt kept; Defend with Staff reads Row.Def 10 in its formula and its Then (Seen 10) and uses the attempt up, so a second press is refused; a call By Defend with Read on the one who resisted Row.Def >= 11 comes for the Blade alone, posted on that very row; the GM\'s private card offers every row its needs hold on (the hook too; a row kept out of sight is read as nothing by its own resolver, as a list\'s roll with needs reads it), and the GM\'s own press with the hook reads it; Tor, who holds no weapon, gets Duck alone, and an attack resisted by Defend alone sends him nothing',
        d1 && d1.ch === 'c_b' && d1.act === 'r_df' && d1.toOwner === true && d1.nm === true && j(d1.or) === j(['r_dg']) && j(d1.withs) === j([{ act: 'r_df', f: 'f_wp', r: 'w_sw', label: 'Defend with Blade' }, { act: 'r_df', f: 'f_wp', r: 'w_st', label: 'Defend with Staff' }])
        && rec1 && rec1.act === '' && j(rec1.withs) === j(['r_df#f_wp#w_sw', 'r_df#f_wp#w_st']) && j(rec1.alts) === j(['r_dg'])
        && bare.type === 'roll-deny' && stick.type === 'roll-deny' && hook.type === 'roll-deny' && duckW.type === 'roll-deny' && keptA
        && seenSt === 10 && goneA && calls1.length === 0 && again.type === 'roll-deny' && /resisted already/.test(again.message)
        && seenSw === 11 && calls2.length === 1 && j(calls2[0].row) === j({ f: 'f_wp', r: 'w_sw', i: 0 })
        && dP && dP.toOwner === false && j(dP.withs.map(x => x.r)) === j(['w_sw', 'w_st', 'w_gm']) && gR && gR.ok === true && seenGm === 9 && goneP
        && gBare && !!gBare.error && gWrong && !!gWrong.error && !!W.att(dP2.att)
        && dT.length === 1 && dT[0].ch === 'c_c' && dT[0].act === 'r_df' && dT[0].nm === true && j(dT[0].or) === j(['r_dg']) && j(dT[0].withs) === j([]) && dT2 === 0,
        j([d1, rec1, bare, stick, hook, duckW, seenSt, calls1, again, seenSw, calls2, dP && dP.withs, gR, seenGm, gBare, gWrong, dT, dT2]));
    // a player's app sends the row beside the roll and the attempt (net.diceRoll's client path, from the card's _attNext), and nothing else carries it
    const sentC = [], keepN = { role: net.role, foreign: net.foreign, syncedPeer: net.syncedPeer, conns: net.conns };
    Object.assign(net, { role: 'client', foreign: true, syncedPeer: 'h', conns: [{ open: true, peer: 'h', send(m) { sentC.push(JSON.parse(JSON.stringify(m))); throw new Error('stop'); } }] });
    net._attNext = { att: 'a_abcd1234', charId: 'c_b', act: 'r_df', with: { f: 'f_wp', r: 'w_sw' } }; W.dr(DEF, { charId: 'c_b', act: 'r_df' }); net._attNext = null; W.dr('3d6 <= 13', { charId: 'c_b', act: 'r_tr' });
    Object.assign(net, keepN);
    const cq = sentC[0] ? Dx.cleanRollReq(sentC[0]) : null;
    check('1.6.3 defense fold 2: the card\'s press goes out as act, att and with: { f, r } (never row), which the host\'s cleaner keeps; a plain press carries no with',
        sentC.length === 2 && j(sentC[0].with) === j({ f: 'f_wp', r: 'w_sw' }) && sentC[0].act === 'r_df' && sentC[0].att === 'a_abcd1234' && !('row' in sentC[0]) && cq && j(cq.with) === j({ f: 'f_wp', r: 'w_sw' }) && !('with' in sentC[1]), j(sentC));
    // the players' view: the roll keeps its list; a GM-only list, or a formula that reads a GM-only stat of the row, leaves the roll out of their view, and the
    // defense card then goes to the GM with every row
    const rawG = JSON.parse(JSON.stringify(raw)); rawG.fields[2].vis = 'gm'; const sysG = Sx.cleanSystem(rawG, { F: Fx, gmView: true }), sysGP = Sx.cleanSystem(sysG, { F: Fx, gmView: false });
    camp.system = sysG; const nG = out.dues.length; roll(cA, 'c_a', { act: 'r_tr' }, '3d6 <= 13', [2, 3, 4]); const dG = out.dues[nG]; camp.system = sys;
    const rawS = JSON.parse(JSON.stringify(raw)); rawS.fields[2].list.stats.push({ key: 'Flaw', vis: 'gm' }); rawS.rolls[2].formula = '3d6 <= Row.Def + Row.Flaw - AttemptMargin'; const sysSP = Sx.cleanSystem(Sx.cleanSystem(rawS, { F: Fx, gmView: true }), { F: Fx, gmView: false });
    check('1.6.3 defense fold 2: Answered with a row of is kept in both views beside Resists an attempt; where the list is GM only or the roll reads a GM-only stat of the row, a players\' view leaves the roll out, and the defense card goes to the GM with every row its needs hold on',
        sys.rolls[2].withRow === 'f_wp' && sysP.rolls.filter(r => r.id === 'r_df')[0].withRow === 'f_wp' && sysGP.rolls.every(r => r.id !== 'r_df') && dG && dG.toOwner === false && j(dG.withs.map(x => x.r)) === j(['w_sw', 'w_st', 'w_gm'])
        && sysSP.rolls.every(r => r.id !== 'r_df') && sysSP.rolls.some(r => r.id === 'r_dg'),
        j([sysP.rolls.map(r => r.id), sysGP.rolls.map(r => r.id), dG, sysSP.rolls.map(r => r.id)]));
    check('1.6.3 defense fold 2: postDue puts a button for each row a roll answered with a row offers first on the card, as { act, w: { f, r }, label }',
        src4.includes("if (rec.why === 'resist' && Array.isArray(more.withs) && more.withs.length) rec.or = more.withs.slice(0, 80).map(function(x) { return { act: x.act, w: { f: x.f, r: x.r }, label: String(x.label || 'Roll').slice(0, 60) }; }).concat(rec.or || []);"));
    /* ---- 1.6.3 (the review of defense fold 2): what the review found, run for real in the same world ---- */
    const WGONE = 'That row cannot answer this card now.', WONLY = 'That roll is made from a defense card, with one of your rows.';
    // finding 9: a row the card did not offer, and a row gone from the sheet since the card, are said as a row that cannot answer it (never "not yours", never "resisted already")
    roll(cA, 'c_a', { act: 'r_tr' }, '3d6 <= 13', [2, 3, 4]); const d9 = out.dues[out.dues.length - 1];
    roll(cB, 'c_b', { act: 'r_df', with: { f: 'f_wp', r: 'w_sk' }, att: d9.att }, DEF, [1, 1, 1]); const w9a = last('pB');
    const wpKeep = camp.chars.c_b.values.f_wp; camp.chars.c_b.values.f_wp = wpKeep.filter(r => r.id !== 'w_st');
    roll(cB, 'c_b', { act: 'r_df', with: { f: 'f_wp', r: 'w_st' }, att: d9.att }, DEF, [1, 1, 1]); const w9b = last('pB');
    dq = [1, 1, 1]; const g9 = W.dr(DEF, { charId: 'c_b', act: 'r_df', att: d9.att, with: { f: 'f_wp', r: 'w_st' } }); camp.chars.c_b.values.f_wp = wpKeep;
    check('1.6.3 (the review of defense fold 2, finding 9) a press with a row the card did not offer, and with a row gone from the sheet since the card, is told the row cannot answer this card now, on a player' + "'" + 's press and the GM' + "'" + 's own; the card stays',
        w9a.type === 'roll-deny' && w9a.message === WGONE && w9b.type === 'roll-deny' && w9b.message === WGONE && g9 && g9.error === WGONE && !!W.att(d9.att), j([w9a, w9b, g9]));
    // findings 3 and 4: a roll answered with a row is never made bare, a player's press or the GM's own, however it is reached; a call or a blast's Defense roll naming it posts no card
    roll(cB, 'c_b', { act: 'r_df' }, DEF, [1, 1, 1]); const b3 = last('pB'); dq = [1, 1, 1]; const g3 = W.dr(DEF, { charId: 'c_b', act: 'r_df' });
    const nP = out.dues.length, cp3 = W.cp(camp, 'r_df', camp.chars.c_b, 'Kael', false), df3 = net.defendPost(camp, 'r_df', camp.chars.c_b, 'Kael', 0, {}, false, null), dues3 = out.dues.length - nP;
    check('1.6.3 (the review of defense fold 2, findings 3 and 4) a roll answered with a row pressed with no card and no row is refused in words, a player' + "'" + 's press and the GM' + "'" + 's own; a call (callPost) and a blast' + "'" + 's Defense roll (net.defendPost) that name it post no card',
        b3.type === 'roll-deny' && b3.message === WONLY && g3 && g3.error === WONLY && cp3 === false && df3 === '' && dues3 === 0, j([b3, g3, cp3, df3, dues3]));
    // finding 6: an Or resisted by roll answered with a row their view cannot offer sends the whole card to the GM, rows and all, rather than dropping it from theirs
    const rawO = JSON.parse(JSON.stringify(raw)); rawO.fields[2].vis = 'gm'; rawO.rolls.push({ id: 'r_t3', label: 'Feint', formula: '3d6 <= 13', vis: 'all', resistBy: 'r_dg', resistOr: ['r_df'] });
    camp.system = Sx.cleanSystem(rawO, { F: Fx, gmView: true }); const nO = out.dues.length; roll(cA, 'c_a', { act: 'r_t3' }, '3d6 <= 13', [2, 3, 4]); const d6 = out.dues[nO]; camp.system = sys;
    check('1.6.3 (the review of defense fold 2, finding 6) a defense card whose Or resisted by roll is answered with a row of a list the player' + "'" + 's view does not hold goes to the GM, the plain Duck first and every row of that roll offered, where before that defense dropped off the player' + "'" + 's card unsaid',
        !!d6 && d6.act === 'r_dg' && d6.toOwner === false && j((d6.withs || []).map(x => x.r)) === j(['w_sw', 'w_st', 'w_gm']), j(d6));
    // finding 7: a defender holding many rows of an Or resisted by list's roll never crowds the main Defend off the card; what is left out for room is logged
    const rawC = JSON.parse(JSON.stringify(raw)); rawC.fields.push({ id: 'f_sh', key: 'Shields', label: 'Shields', kind: 'item-list', vis: 'all', edit: 'owner', list: { rolls: [{ label: 'Block', formula: '3d6 <= 10', resist: true }] } });
    rawC.rolls.push({ id: 'r_t4', label: 'Bash', formula: '3d6 <= 13', vis: 'all', resistBy: 'r_df', resistOr: ['f_sh#0'] });
    const logs7 = [], logKeep = win.wpStepLog; win.wpStepLog = (k, w, d) => logs7.push([k, w, d]);
    camp.system = Sx.cleanSystem(rawC, { F: Fx, gmView: true }); camp.chars.c_b.values.f_sh = Array.from({ length: 85 }, (x, i) => ({ id: 'w_s' + i, def: { name: 'Shield' } }));
    const n7 = out.dues.length; roll(cA, 'c_a', { act: 'r_t4' }, '3d6 <= 13', [2, 3, 4]); const d7 = out.dues[n7], a7 = d7 && W.att(d7.att);
    camp.system = sys; delete camp.chars.c_b.values.f_sh; win.wpStepLog = logKeep;
    check('1.6.3 (the review of defense fold 2, finding 7) the main Defend' + "'" + 's rows are offered first, so 85 shields on an Or resisted by roll leave both weapons on the card and fill the rest to 80; the rows left out for room are logged',
        !!a7 && j(a7.withs) === j(['r_df#f_wp#w_sw', 'r_df#f_wp#w_st']) && Array.isArray(a7.rows) && a7.rows.length === 78 && logs7.some(x => x[0] === 'attempt v1' && x[1] === 'rows cut' && x[2] && x[2].cut === 7), j([a7 && a7.withs, a7 && a7.rows && a7.rows.length, logs7]));
    // 1.6.3 (found in a live two-peer check): the card of a defense made with a row names that row, as its button did, from the host's own record (withLabel):
    // "Defend with Staff" on the player's own copy and the table's; the GM's own press with the GM-only hook names no row; a press that names no label takes the
    // roll's own, and a label that names the row already is kept as it is
    const rollAt = n => out.table.slice(n).filter(m => m.type === 'roll').pop();   // a public roll goes to the whole table, its roller among them (sendTable)
    roll(cA, 'c_a', { act: 'r_tr' }, '3d6 <= 13', [2, 3, 4]); const dLb = out.dues[out.dues.length - 1], nLb = out.table.length;
    roll(cB, 'c_b', { act: 'r_df', label: 'Defend', with: { f: 'f_wp', r: 'w_st' }, att: dLb.att }, DEF, [1, 1, 1]); const tLb = rollAt(nLb);
    roll(cA, 'c_a', { act: 'r_tr' }, '3d6 <= 13', [2, 3, 4]); const dLb2 = out.dues[out.dues.length - 1], nLb2 = out.table.length;
    roll(cB, 'c_b', { act: 'r_df', with: { f: 'f_wp', r: 'w_sw' }, att: dLb2.att }, DEF, [1, 1, 1]); const pLb2 = rollAt(nLb2), pLb = tLb;
    roll(cA, 'c_a', { act: 'r_tr', priv: 'gm' }, '3d6 <= 13', [2, 3, 4]); const dLb3 = out.dues[out.dues.length - 1]; const nGr = (out.gmR || []).length;
    net._attNext = { att: dLb3.att, charId: 'c_b', act: 'r_df', with: { f: 'f_wp', r: 'w_gm' } }; dq = [1, 1, 1]; W.dr(DEF, { charId: 'c_b', act: 'r_df', label: 'Defend' }); net._attNext = null; const gLb = (out.gmR || []).slice(nGr).filter(r => r.type === 'roll').pop();
    roll(cA, 'c_a', { act: 'r_tr', priv: 'gm' }, '3d6 <= 13', [2, 3, 4]); const dLb4 = out.dues[out.dues.length - 1]; const nGr2 = (out.gmR || []).length;
    net._attNext = { att: dLb4.att, charId: 'c_b', act: 'r_df', with: { f: 'f_wp', r: 'w_sw' } }; dq = [1, 1, 1]; W.dr(DEF, { charId: 'c_b', act: 'r_df', label: 'Defend with Blade' }); net._attNext = null; const gLb2 = (out.gmR || []).slice(nGr2).filter(r => r.type === 'roll').pop();
    check('1.6.3 (a live two-peer check) a defense made with a row names that row on its card, as its button did: Defend with Staff on the card the table and its player get, the roll\'s own label where the press names none, never the GM-only hook, and a label that names it already is not named twice',
        pLb && pLb.type === 'roll' && pLb.label === 'Defend with Staff' && tLb && tLb.label === 'Defend with Staff' && pLb2 && pLb2.label === 'Defend with Blade' && gLb && gLb.label === 'Defend' && gLb2 && gLb2.label === 'Defend with Blade',
        j([pLb && pLb.label, tLb && tLb.label, pLb2 && pLb2.label, gLb && gLb.label, gLb2 && gLb2.label]));
    // finding 10: a defense answered with a row that is itself an attack, or carries its damage, names that row; finding 2's hidden steps (thengmcheck runs them)
    check('1.6.3 (the review of defense fold 2, findings 2 and 10, source) both roll paths hand the row a defense was answered with to attemptMake, landRowNow and landAfter as its row, and thenGmRun reads q.with',
        src4.includes('tcQ && tcQ.range, chQ, !!recQ.priv, varsQ, q.row || q.with);') && src4.includes('tcR && tcR.range, chR, !!rec.priv || !!rec.to, varsR, o.row || o.with);') && src4.includes('landRowNow(chQ, q.row || q.with)') && src4.includes('landRowNow(chR, o.row || o.with)')
        && src4.includes('tcQ, chQ, !!recQ.priv, q.row || q.with, atQ, recQ.from') && src4.includes('tcR, chR, !!rec.priv || !!rec.to, o.row || o.with, atR, rec.from') && kit.part('nettrade.js').includes("var rq = q.row && q.row.r ? q.row : q.with && typeof q.with.f === 'string' && typeof q.with.r === 'string' ? q.with : null;"));
})());
T.finish();

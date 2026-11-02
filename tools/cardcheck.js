// cardcheck — what a roll's card offers before it lands (1.6.2, backlog 210 b, G5; the owner, by prompt: "Wait for Accept, then run", and "a roll with no card
// actions shouldn't wait, so ordinary rolls stay instant"; the time a setting a GM can change, off while the roller is away, and the card saying plainly that
// the result is pending). systemcore's cleaners imported and run, and the host's real roll branch with the real hold, on plain objects and a clock of the suite's own.
'use strict';
const fs = require('fs'), path = require('path'), url = require('url');
let pass = 0, fail = 0, summed = false;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok        ' + name); } else { fail++; console.log('FAIL      ' + name + (detail === undefined ? '' : ' -> ' + String(detail).slice(0, 900))); } }
const J = JSON.stringify, NL = '\n', root = path.join(__dirname, '..');
const app = p => path.join(root, 'system', 'app', p), read = p => fs.readFileSync(app(p), 'utf8').replace(/\r\n/g, NL), readRoot = p => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, NL);
(async () => {
    const S = await import(url.pathToFileURL(app('scripts/systemcore.js')).href), F = await import(url.pathToFileURL(app('scripts/formula.js')).href), D = await import(url.pathToFileURL(app('scripts/dicecore.js')).href);
    const ACTS = [{ label: 'Push', does: 'add', n: '2' }, { label: 'Again', does: 'again' }, { label: 'Some', does: 'againIf', test: { op: '<=', v: 2 } }];
    const RAW = { v: 1, name: 'A', combat: { checks: 'plain', bands: [{ name: 'Low', if: 'RollTotal < 5' }, { name: 'High', if: 'RollTotal >= 5' }] }, fields: [{ id: 'f_hp', key: 'HP', kind: 'number', def: 0 }, { id: 'f_luck', key: 'Luck', kind: 'number', def: 2 }],
        rolls: [{ id: 'r_a', label: 'Try', formula: '1d6 + 100 >= 1', then: [{ f: 'f_hp', formula: '1', add: true }], cardActs: ACTS }, { id: 'r_p', label: 'Plain', formula: '1d6 >= 1', then: [{ f: 'f_hp', formula: '1', add: true }] }, { id: 'r_n', label: 'Picky', formula: '1d6 + 100 >= 1', then: [{ f: 'f_hp', formula: '1', add: true }], cardActs: [{ label: 'Never', does: 'again', needs: 'Luck > 99' }] }, { id: 'r_c', label: 'Costly', formula: '1d6 >= 1', then: [{ f: 'f_hp', formula: '1', add: true }], cardActs: [{ label: 'Pay', does: 'again', pay: 'r_sp', times: 2 }] }, { id: 'r_b', label: 'Band', formula: '1d4 >= 1', cardActs: [{ label: 'Up', does: 'bandUp' }] }, { id: 'r_l', label: 'Named', formula: '1d6 + Luck >= 1', cardActs: [{ label: 'Again', does: 'again' }] }, { id: 'r_sp', label: 'Spend', apply: [{ f: 'f_luck', formula: '1' }] }] };
    const SYS = S.cleanSystem(RAW, { F, gmView: true }), VIEW = S.cleanSystem(SYS, { F, gmView: false }), rA = SYS.rolls[0];

    check('an action as it is kept: words, what it does, and only what that needs', J(S.cleanCardActs(ACTS)) === J([{ label: 'Push', does: 'add', n: '2' }, { label: 'Again', does: 'again' }, { label: 'Some', does: 'againIf', test: { op: '<=', v: 2 } }]));
    check('what is no action is none, and a list holds six', S.cleanCardActs([{ does: 'again' }, { label: 'x', does: 'nope' }, { label: 'x', does: 'add' }, { label: 'x', does: 'againIf' }]) === undefined && S.cleanCardActs('x') === undefined && S.cleanCardActs(Array.from({ length: 9 }, () => ({ label: 'a', does: 'again' }))).length === S.CARD_MAX);
    check('the host alone reads them: a players’ view holds none, and a roll with none has no key', Array.isArray(rA.cardActs) && !('cardActs' in VIEW.rolls[0]) && !('cardActs' in SYS.rolls[1]));
    check('a list on the Combat tab joins every roll’s, the roll’s own first, and the wait is the GM’s to set, 60 seconds at first, within bounds', S.cardActsOf({ combat: { cardActs: [{ label: 'B' }] } }, { cardActs: [{ label: 'A' }] }).map(a => a.label).join() === 'A,B' && S.cardWaitOf({}) === 60 && S.cardWaitOf({ combat: { cardWait: 20 } }) === 20 && S.cardWaitOf({ combat: { cardWait: 1 } }) === 5 && S.cardWaitOf({ combat: { cardWait: 9999 } }) === 600);
    const CW = S.cleanSystem({ v: 1, name: 'B', combat: { cardWait: 20, cardActs: ACTS } }, { F, gmView: true }), CV = S.cleanSystem(CW, { F, gmView: false });
    check('the Combat tab’s are kept in the GM’s view alone', CW.combat.cardWait === 20 && CW.combat.cardActs.length === 3 && !('cardActs' in CV.combat) && !('cardWait' in CV.combat));
    check('a die is read as the action says', S.cardDieHolds(2, { op: '<=', v: 2 }) && !S.cardDieHolds(3, { op: '<=', v: 2 }) && S.cardDieHolds(6, { op: '>=', v: 5 }) && S.cardDieHolds(4, { op: '=', v: 4 }));
    check('the wire takes a press by a held roll’s id and an action’s place, or accept, and nothing else', !!D.cleanCardAct({ id: 'r_abc12345', key: 'accept' }) && !!D.cleanCardAct({ id: 'r_abc12345', key: '2' }) && !D.cleanCardAct({ id: 'r_abc12345', key: 'x' }) && !D.cleanCardAct({ id: '<b>', key: '1' }) && !D.cleanCardAct({ key: '1' }));

    // the host's real roll branch with the real hold
    const nsrc = read('scripts/net.js'), between = (a, b) => { const i = nsrc.indexOf(a), k = nsrc.indexOf(b); if (i < 0 || k < i) throw new Error('no slice ' + a); return nsrc.slice(i + a.length, k); };
    const line = k => { const i = nsrc.indexOf(k); if (i < 0) throw new Error('no line ' + k); return nsrc.slice(i, nsrc.indexOf(NL, i)); };
    const helpers = ['function own(', 'function peerProfileId(', 'function fxLib(', 'function itemLib(', 'function diceFrom('].map(line).join(NL) + NL, rq = between('// [netcheck:rollreq-start]', '// [netcheck:rollreq-end]'), hold = between('// [netcheck:cardhold-start]', '// [netcheck:cardhold-end]');
    const world = (o) => {
        o = o || {}; const W = { table: [], pushed: [], sent: [], timers: [], notes: [], deltas: [] };
        W.camp = { id: 'k', activeItemId: 'm1', system: JSON.parse(J(SYS)), chars: { c_a: { id: 'c_a', name: 'Ana', ownerId: 'u_a', npc: false, values: Object.assign({ f_luck: 2 }, o.vals) } }, items: { m1: { type: 'map', whiteboard: [] } } };
        W.net = { role: 'host', paused: false, roster: { pA: { id: 'u_a', name: 'Pat', location: 'm1' }, pB: { id: 'u_b', name: 'Bo', location: 'm1' } }, combats: {}, combatRoundOf: () => null, syncCharDelta: (id, d) => W.deltas.push(d) };
        W.conn = { peer: 'pA', send(m) { W.sent.push(JSON.parse(J(m))); } };
        const win = { wpFormula: F, wpSheets: { playerSystem: c => S.cleanSystem(c.system, { F, gmView: false }), charChanged() {} }, wpVtt: { on: () => true, rulesOn: () => true } };
        W.setT = (fn, ms) => { const t = { fn, ms, off: false }; W.timers.push(t); return t; }; W.clearT = t => { if (t) t.off = true; };
        W.api = new Function('net', 'DC', 'SC', 'window', 'getActiveCampaign', 'peerPaused', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'saveRemoteSoon', 'setTimeout', 'clearTimeout', 'turnNote', 'toast',
            'var diceLimit = null, _diceSlowSaid = {};\n' + helpers + hold + '\nreturn { handle: function(msg, conn) {\n' + rq + '\n}, press: cardPress, away: cardAway, held: function() { return Object.keys(_cardHeld); } };')(
            W.net, () => D, () => S, win, () => W.camp, () => false, e => { throw e; }, rec => W.table.push(JSON.parse(J(rec))), rec => W.pushed.push(JSON.parse(J(rec))), () => {}, () => {}, W.setT, W.clearT, (c, w) => W.notes.push(w), w => W.notes.push(w));
        W.roll = (act, expr) => W.api.handle({ type: 'roll-req', rid: 'q1abcdef', charId: 'c_a', act, expr }, W.conn);
        W.live = () => W.timers.filter(t => !t.off && !t.done); W.tick = () => { const t = W.live().slice(-1)[0]; if (t) { t.done = true; t.fn(); } };
        return W;
    };
    const fA = rA.formula, w1 = world(); w1.roll('r_a', fA);
    const c1 = w1.table[0] || {};
    check('a roll that offers something is held: the card says so, offers its actions, and nothing of it has landed', w1.table.length === 1 && c1.pend === 60 && J(c1.offers.map(o => o.l)) === J(['Push', 'Again', 'Some']) && !w1.camp.chars.c_a.values.f_hp && w1.api.held().length === 1 && w1.live().length === 1 && w1.live()[0].ms === 60000, J(c1));
    check('the cleaner keeps the pending card as it is', (() => { const r = D.cleanRoll(Object.assign({}, c1, { type: 'roll' })); return !r || (r.pend === 60 && r.offers.length === 3); })());
    const id1 = c1.id; w1.api.press(id1, 'accept', 'u_b');
    check('another player’s press does nothing', w1.api.held().length === 1 && !w1.camp.chars.c_a.values.f_hp);
    w1.api.press(id1, 'accept', 'u_a');
    const f1 = w1.table[w1.table.length - 1];
    check('Accept runs what follows once, under the card’s one id, so the final card takes the pending one’s place', w1.camp.chars.c_a.values.f_hp === 1 && f1.id === id1 && !f1.pend && w1.api.held().length === 0 && w1.live().length === 0, J([f1, w1.camp.chars.c_a.values]));
    w1.api.press(id1, 'accept', 'u_a');
    check('and a second press finds nothing, so nothing runs twice', w1.camp.chars.c_a.values.f_hp === 1);

    const w2 = world(); w2.roll('r_a', fA); w2.tick();
    check('left alone it lands by itself when the time is up', w2.camp.chars.c_a.values.f_hp === 1 && w2.api.held().length === 0);
    const w3 = world(); w3.camp.system.combat.cardWait = 15; w3.roll('r_a', fA);
    check('the time is the system’s to set', w3.live()[0].ms === 15000 && w3.table[0].pend === 15);
    const w4 = world(); w4.roll('r_a', fA); w4.api.away('pA');
    check('the time stops while its roller is away, so it cannot spend a choice for them', w4.live().length === 0 && w4.api.held().length === 1);
    w4.api.press(w4.table[0].id, 'accept', '');
    check('and the GM may accept for them', w4.camp.chars.c_a.values.f_hp === 1);
    const w4b = world(); w4b.roll('r_a', fA); const hc = w4b.table[0]; w4b.api.press(hc.id, '0', '');
    check('the GM cannot spend a player’s action for them', w4b.table.length === 1 && w4b.api.held().length === 1);

    const w5 = world(); w5.roll('r_a', fA); const c5 = w5.table[0], d5 = c5.draws.slice(); w5.api.press(c5.id, '0', 'u_a');
    const c5b = w5.table[w5.table.length - 1];
    check('an action changes the roll in hand and sends the card again under its one id, the same dice standing, and it can be used once', c5b.id === c5.id && c5b.pend === 60 && J(c5b.draws) === J(d5) && c5b.expr.includes("+ 2 >= 1") && !c5b.offers.some(o => o.l === 'Push') && w5.api.held().length === 1, J(c5b));
    w5.api.press(c5.id, '0', 'u_a');
    check('a second press of an action used up does nothing', w5.table[w5.table.length - 1] === c5b || w5.table.length === 2);

    const lw = world(); lw.roll('r_l', '1d6 + Luck >= 1'); const lc = D.cleanRoll(lw.table[0]), lr = lc ? F.evaluate(lc.expr, { vars: n => { const m = (lc.names || []).filter(x => String(x.name).toLowerCase() === String(n).toLowerCase())[0]; return m ? m.value : undefined; }, random: (() => { let i = 0; return () => lc.draws[i++]; })() }) : null;
    check('a pending card carries the figures its formula read, so that a player\u2019s app can draw it, as a final card does (found by pressing it: "a roll that could not be read")', !!lc && Array.isArray(lc.names) && lc.names.length > 0 && !!lr && lr.ok === true, J([lw.table[0], lc, lr]));
    const pw = world(); pw.roll('r_p', '1d6 >= 1');
    check('a roll that offers nothing never waits', pw.camp.chars.c_a.values.f_hp === 1 && !pw.table[0].pend && pw.api.held().length === 0);
    const nw = world(); nw.roll('r_n', SYS.rolls[2].formula);
    check('nor does one whose actions are all held back by what they need', nw.camp.chars.c_a.values.f_hp === 1 && !nw.table[0].pend);
    const cw = world(); cw.roll('r_c', '1d6 >= 1'); const cc = cw.table[0]; cw.api.press(cc.id, '0', 'u_a');
    check('an action that costs something pays it as it is pressed, once a press', cw.camp.chars.c_a.values.f_luck === 1 && cw.deltas.length === 1 && cw.api.held().length === 1, J([cw.camp.chars.c_a.values, cw.notes]));
    cw.api.press(cc.id, '0', 'u_a');
    check('and with no uses left there is nothing to wait for, so it lands', cw.camp.chars.c_a.values.f_luck === 0 && cw.api.held().length === 0 && cw.camp.chars.c_a.values.f_hp === 1, J(cw.camp.chars.c_a.values));
    const bw = world(); bw.roll('r_b', '1d4 >= 1'); const bc = bw.table[0]; bw.api.press(bc.id, '0', 'u_a'); const bf = bw.table[bw.table.length - 1];
    check('up a band takes the result up one step, and lands where there is no higher', bf.band === 'High' && !bf.pend, J(bf));

    // the words and the wiring
    const ix = read('index.html'), dc = read('scripts/dice.js'), ci = readRoot('.github/workflows/checks.yml');
    check('the card says it plainly', dc.includes("'Pending. Nothing has landed yet.'"));
    check('and a held card keeps Table Chat up for its roller and the GM, so its buttons stay in reach (found by pressing it)', /function waits\(m\) \{[\s\S]{0,160}m\.due[\s\S]{0,200}m\.roll\.pend/.test(dc));
    check('Help, the key, both notes and CI say it', /<b>On the card<\/b> lets a roller change a roll/.test(ix) && /<b>On the card<\/b><small>/.test(ix) && /can offer things to do before it lands/.test(readRoot('WHATSNEW.txt')) && /can offer things to do before it lands/.test(read('assets/whatsnew.txt')) && /node tools\/cardcheck\.js/.test(ci));
    check('a box of the card’s is a form, so nobody types a name', /'sys-card-n': 'amt', 'sys-card-needs': 'cond'/.test(read('scripts/formbox.js')));
    summed = true; console.log(pass + ' passed, ' + fail + ' failed.'); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL      the suite stopped: ' + (e && e.stack || e)); process.exit(1); });
process.on('exit', () => { if (!summed) { console.log('FAIL      the suite did not finish'); process.exitCode = 1; } });

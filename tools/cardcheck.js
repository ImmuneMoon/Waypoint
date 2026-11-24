// cardcheck — what a roll's card offers before it lands (1.6.2, backlog 210 b, G5; the owner, by prompt: "Wait for Accept, then run", and "a roll with no card
// actions shouldn't wait, so ordinary rolls stay instant"; the time a setting a GM can change, off while the roller is away, and the card saying plainly that
// the result is pending). systemcore's cleaners imported and run, and the host's real roll branch with the real hold, on plain objects and a clock of the suite's own.
'use strict';
require('./srcjoin').install();   // a split giant script reads joined, exactly as it was before the split (tools/srcjoin.js)
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
    const helpers = ['function own(', 'function peerProfileId(', 'function fxLib(', 'function itemLib(', 'function diceFrom('].map(line).join(NL) + NL, rq = between('// [netcheck:rollreq-start]', '// [netcheck:rollreq-end]'), hold = require('./checkkit').netSlices('cardcheck').between('// [netcheck:cardhold-start]', '// [netcheck:cardhold-end]', 'cardhold', 'nethold.js');
    const world = (o) => {
        o = o || {}; const W = { table: [], pushed: [], sent: [], timers: [], notes: [], deltas: [] };
        W.camp = { id: 'k', activeItemId: 'm1', system: JSON.parse(J(SYS)), chars: { c_a: { id: 'c_a', name: 'Ana', ownerId: 'u_a', npc: false, values: Object.assign({ f_luck: 2 }, o.vals) } }, items: { m1: { type: 'map', whiteboard: [] } } };
        W.net = { role: 'host', paused: false, roster: { pA: { id: 'u_a', name: 'Pat', location: 'm1' }, pB: { id: 'u_b', name: 'Bo', location: 'm1' } }, combats: {}, combatRoundOf: () => null, syncCharDelta: (id, d) => W.deltas.push(d) };
        W.conn = { peer: 'pA', send(m) { W.sent.push(JSON.parse(J(m))); } };
        const Fw = o.draws ? Object.assign({}, F, { evaluate: (e, op) => F.evaluate(e, Object.assign({ random: () => o.draws.shift() || 1 }, op)) }) : F;   // gap #2: dice of the suite's own where a check needs them
        const win = { wpFormula: Fw, wpSheets: { playerSystem: c => S.cleanSystem(c.system, { F, gmView: false }), charChanged() {} }, wpVtt: { on: () => true, rulesOn: () => true } };
        W.setT = (fn, ms) => { const t = { fn, ms, off: false }; W.timers.push(t); return t; }; W.clearT = t => { if (t) t.off = true; };
        W.api = new Function('net', 'DC', 'SC', 'window', 'getActiveCampaign', 'peerPaused', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'saveRemoteSoon', 'setTimeout', 'clearTimeout', 'turnNote', 'toast',
            'var diceLimit = null, _diceSlowSaid = {};\n' + (o.pre || '') + helpers + hold + '\nreturn { handle: function(msg, conn) {\n' + rq + '\n}, press: cardPress, away: cardAway, held: function() { return Object.keys(_cardHeld); } };')(
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

    // result points (G5)
    {
        const kept = S.cleanCardActs([{ label: 'Flank', does: 'run', act: 'r_flank', spend: 2 }, { label: 'x', does: 'run' }, { label: 'y', does: 'again', spend: 0 }, { label: 'z', does: 'again', spend: 500 }]);
        check('G5: an action may run one of the system’s and spend points, within bounds', J(kept) === J([{ label: 'Flank', does: 'run', act: 'r_flank', spend: 2 }, { label: 'y', does: 'again' }, { label: 'z', does: 'again', spend: 99 }]), J(kept));
        const PR = { v: 1, name: 'P', combat: { checks: 'plain' }, fields: [{ id: 'f_hp', key: 'HP', kind: 'number', def: 0 }, { id: 'f_luck', key: 'Luck', kind: 'number', def: 2 }],
            rolls: [{ id: 'r_x', label: 'Try', formula: '1d6 + 100 >= 1', cardPts: 'floor(RollMargin / 40)', cardPtsWord: 'Raises', cardActs: [{ label: 'Flank', does: 'run', act: 'r_f', spend: 1, times: 9 }, { label: 'Big', does: 'run', act: 'r_b', spend: 2 }, { label: 'Far', does: 'run', act: 'r_b', spend: 99 }], then: [{ f: 'f_hp', formula: '1', add: true }] }, { id: 'r_f', label: 'Flanked', apply: [{ f: 'f_luck', formula: '10', add: true }] }, { id: 'r_b', label: 'Big one', apply: [{ f: 'f_luck', formula: 'Luck * 2', set: true }] }, { id: 'r_z', label: 'None', formula: '1d6 >= 1', cardActs: [{ label: 'Flank', does: 'run', act: 'r_f', spend: 1 }] }] };
        const SP = S.cleanSystem(PR, { F, gmView: true }), PV = S.cleanSystem(SP, { F, gmView: false }), pw0 = world();
        check('what a roll gives to spend is the GM’s view alone', SP.rolls[0].cardPts === 'floor(RollMargin / 40)' && SP.rolls[0].cardPtsWord === 'Raises' && !('cardPts' in PV.rolls[0]) && J(S.cardPtsOf(SP, SP.rolls[0])) === J({ text: 'floor(RollMargin / 40)', word: 'Raises' }) && S.cardPtsOf(SP, SP.rolls[3]) === null);
        const go = () => { const w = world({ vals: { f_luck: 3 } }); w.camp.system = JSON.parse(J(SP)); w.roll('r_x', SP.rolls[0].formula); return w; }, w1 = go(), c1 = w1.table[0], lands = w => w.table[w.table.length - 1];
        check('the card says what is left, offers what can be paid for with its price, and an action that costs too much stays off', c1.pts && c1.pts.n === 2 && c1.pts.w === 'Raises' && J(c1.offers.map(o => o.l)) === J(['Flank (1)', 'Big (2)']), J(c1));
        check('the cleaner keeps the points as data', (() => { const r = D.cleanRoll(Object.assign({}, c1, { type: 'roll' })); return !r || (r.pts && r.pts.n === 2 && r.pts.w === 'Raises'); })());
        w1.api.press(c1.id, '0', 'u_a'); const c2 = lands(w1);
        check('a pick spends its points at once and runs nothing yet: what it does waits for Accept', c2.pts.n === 1 && J(c2.offers.map(o => o.l)) === J(['Flank (1)']) && w1.camp.chars.c_a.values.f_luck === 3 && w1.deltas.length === 0, J([c2, w1.camp.chars.c_a.values]));
        w1.api.press(c1.id, '0', 'u_a');
        check('with nothing left to pick it lands, the Then first, then each pick in order on the sheet as the last left it', w1.camp.chars.c_a.values.f_hp === 1 && w1.camp.chars.c_a.values.f_luck === 23 && w1.api.held().length === 0, J(w1.camp.chars.c_a.values));
        const w2 = go(); w2.api.press(w2.table[0].id, '1', 'u_a');
        check('a pick reads the sheet as it stands when it lands, and a press that takes all ends the wait', w2.camp.chars.c_a.values.f_luck === 6 && w2.api.held().length === 0, J(w2.camp.chars.c_a.values));
        const w3 = go(); w3.tick();
        check('left alone nothing is spent, and the roll lands', w3.camp.chars.c_a.values.f_luck === 3 && w3.camp.chars.c_a.values.f_hp === 1);
        const w4 = world(); w4.camp.system = JSON.parse(J(SP)); w4.roll('r_z', SP.rolls[3].formula);
        check('with no points a roll has nothing to spend, so an action that spends leaves nothing to wait for', w4.api.held().length === 0 && !w4.table[0].pend, J(w4.table[0]));
    }
    // 1.6.3 (the review of Hide my rolls): a player's roll that answers an attempt whose figure is hidden (net.js figAnswers, the attempt marked hide on
    // the host's own record) and that is held for its card actions sends its PENDING card masked, as its final card is (figMark's copy, its buttons kept,
    // its points to spend left off); the GM's own copy stays whole. The real hidefig slice runs beside the real hold and the real roll-req branch
    {
        const hfS = between('// [netcheck:hidefig-start]', '// [netcheck:hidefig-end]');
        const DGE = { id: 'r_d', label: 'Dodge', formula: '1d6 + AttemptMargin >= 1', resist: true, cardActs: [{ label: 'Again', does: 'again' }] };
        const figW = hide => { const w = world({ pre: 'var _attS = { hide: ' + (hide ? 'true' : 'false') + ' }; function attemptRec() { return _attS; } function attemptPeek() { return 3; } function attemptDrop() {}\n' + hfS + '\n' });
            w.camp.system.rolls.push(S.cleanSystem({ v: 1, name: 'X', fields: SYS.fields, rolls: [DGE] }, { F, gmView: true }).rolls[0]);
            w.api.handle({ type: 'roll-req', rid: 'q1abcdef', charId: 'c_a', act: 'r_d', att: 'a_abcdefgh', expr: DGE.formula }, w.conn); return w; };
        const fH = figW(true), fO = figW(false), tH = fH.table[0] || {}, gH = fH.pushed[0] || {}, tO = fO.table[0] || {};
        check('1.6.3 (the review of Hide my rolls) a held roll answering a hidden figure: its pending card leaves masked (the host\'s word in place of its figures, no formula that names the attacker, no points), its buttons and wait kept; the GM\'s own copy is whole; with the figure not hidden the pending card is as before',
            fH.api.held().length === 1 && ['pass', 'fail', 'rolled'].indexOf(tH.hid) >= 0 && !/AttemptMargin/.test(tH.expr) && tH.pend === 60 && Array.isArray(tH.offers) && tH.offers.length === 1 && !('pts' in tH)
            && /AttemptMargin/.test(gH.expr || '') && !gH.hid && gH.pend === 60
            && !tO.hid && /AttemptMargin/.test(tO.expr || '') && tO.pend === 60 && (() => { const r = D.cleanRoll(Object.assign({}, tH, { type: 'roll' })); return !!r && r.pend === 60 && !!r.hid; })(), J([tH, gH, tO]));
    }
    // 1.6.4 (gap #2 of the full test): Roll again and keep the better or the worse try, and Roll one die again, the die its roller picks on the card
    {
        const fixed = (expr, ds) => { let i = 0; return F.evaluate(expr, { random: () => ds[i++] }); }, rule = D.ruleOf({}, 'plain');
        check('gap #2: the three new actions are kept as words alone, with the times every action has', J(S.cleanCardActs([{ label: 'Luck', does: 'best', times: 2 }, { label: 'Jinx', does: 'worst' }, { label: 'Nudge', does: 'oneDie', test: { op: '<=', v: 1 }, n: '3' }])) === J([{ label: 'Luck', does: 'best', times: 2 }, { label: 'Jinx', does: 'worst' }, { label: 'Nudge', does: 'oneDie' }]));
        check('gap #2: a check keeps the better outcome first, then the bigger margin; a tie keeps the old try',
            D.tryKeepsNew('best', fixed('1d20 >= 15', [9]), fixed('1d20 >= 15', [16]), rule) && !D.tryKeepsNew('best', fixed('1d20 >= 15', [16]), fixed('1d20 >= 15', [15]), rule) && D.tryKeepsNew('best', fixed('1d20 >= 15', [16]), fixed('1d20 >= 15', [19]), rule)
            && D.tryKeepsNew('best', fixed('1d20 >= 15', [3]), fixed('1d20 >= 15', [12]), rule) && !D.tryKeepsNew('best', fixed('1d20 >= 15', [12]), fixed('1d20 >= 15', [12]), rule));
        check('gap #2: a roll under its target ranks the lower total better, by its margin', D.tryKeepsNew('best', fixed('3d6 <= 12', [5, 5, 5]), fixed('3d6 <= 12', [2, 2, 2]), rule) && D.tryKeepsNew('worst', fixed('3d6 <= 12', [2, 2, 2]), fixed('3d6 <= 12', [5, 5, 5]), rule));
        check('gap #2: a roll that is no check keeps the higher total, or the lower for keep the worse', D.tryKeepsNew('best', fixed('2d6', [1, 2]), fixed('2d6', [3, 3]), rule) && !D.tryKeepsNew('best', fixed('2d6', [3, 3]), fixed('2d6', [1, 2]), rule) && D.tryKeepsNew('worst', fixed('2d6', [3, 3]), fixed('2d6', [1, 2]), rule));
        const u3 = D.ruleOf({}, 'under3d6');
        check('gap #2: under criticals at fixed rolls a critical outranks a success by a bigger margin, and a critical failure a failure by a bigger one', D.tryKeepsNew('best', fixed('3d6 + 10 >= 5', [6, 6, 5]), fixed('3d6 + 10 >= 5', [1, 1, 1]), D.ruleOf({ crit: [3, 18] }, 'fixed')) && D.tryKeepsNew('worst', fixed('3d6 >= 30', [1, 1, 1]), fixed('3d6 >= 30', [6, 6, 6]), D.ruleOf({ crit: [3, 18] }, 'fixed')));
        check('gap #2: a critical success beats any plain success and a critical failure loses to any failure', D.tryKeepsNew('best', fixed('3d6 <= 14', [3, 3, 3]), fixed('3d6 <= 14', [1, 1, 2]), u3) && D.tryKeepsNew('worst', fixed('3d6 <= 8', [5, 5, 5]), fixed('3d6 <= 8', [6, 6, 6]), u3));
        const sp = D.oneDieSpots(fixed('3d6 + 1d4 >= 1', [2, 5, 6, 3]));
        check('gap #2: a die in a count is offered in its own place, before the dice it counts', J(D.oneDieSpots(fixed('(1d4)d6 + 1d8', [2, 5, 3, 7]))) === J([{ at: 0, faces: 4, v: 2 }, { at: 1, faces: 6, v: 5 }, { at: 2, faces: 6, v: 3 }, { at: 3, faces: 8, v: 7 }]) && D.oneDieSpots(Object.assign({}, fixed('2d6', [1, 2]), { draws: [1, 2, 3] })).length === 0 && D.oneDieSpots(Object.assign({}, fixed('2d6', [1, 2]), { draws: [2, 2] })).length === 0);
        check('gap #2: every plain die is offered by its place among the draws, its sides and what it shows', J(sp) === J([{ at: 0, faces: 6, v: 2 }, { at: 1, faces: 6, v: 5 }, { at: 2, faces: 6, v: 6 }, { at: 3, faces: 4, v: 3 }]), J(sp));
        const spX = D.oneDieSpots(fixed('2d6! + 1d8', [6, 2, 3, 7])), spR = D.oneDieSpots(fixed('2d6r1 + 1d8', [1, 4, 3, 7])), spK = D.oneDieSpots(fixed('4d6kh3', [1, 4, 3, 6]));
        check('gap #2: a die of a group that explodes or rolls again by its own formula is never offered, and the dice after it keep their true places; a kept or dropped die alike', J(spX) === J([{ at: 3, faces: 8, v: 7 }]) && J(spR) === J([{ at: 3, faces: 8, v: 7 }]) && spK.length === 4, J([spX, spR, spK]));
        check('gap #2: the wire takes an action and a die, and nothing looser', !!D.cleanCardAct({ id: 'r_abc12345', key: '2:5' }) && !D.cleanCardAct({ id: 'r_abc12345', key: '2:' }) && !D.cleanCardAct({ id: 'r_abc12345', key: '2:5:1' }) && !D.cleanCardAct({ id: 'r_abc12345', key: 'accept:1' }) && !D.cleanCardAct({ id: 'r_abc12345', key: '2:1234' }));
        check('gap #2: what the card says is cleaned to the two shapes alone', J(D.cleanRedo({ k: 'better', n: 3 })) === J({ k: 'better', n: 3 }) && J(D.cleanRedo({ f: 6, a: 2, b: 5, x: 1 })) === J({ f: 6, a: 2, b: 5 }) && D.cleanRedo({ k: 'best', n: 3 }) === null && D.cleanRedo({ k: 'better', n: 1 }) === null && D.cleanRedo({ f: '<b>', a: 1, b: 2 }) === null
            && D.redoWords({ k: 'better', n: 3 }) === 'Kept the better of 3 tries' && D.redoWords({ f: 6, a: 2, b: 5 }) === 'Rolled a d6 again: 2 became 5');
        const NM = S.cleanSystem({ v: 1, name: 'N', fields: SYS.fields, rolls: [{ id: 'r_m', label: 'Swing', formula: '2d6 + 1', cardActs: [{ label: 'Nudge', does: 'oneDie' }] }, { id: 'r_q', label: 'Plain', formula: '2d6 + 1' }] }, { F, gmView: true }), NMV = S.cleanSystem(NM, { F, gmView: false });
        check('gap #2 (found by its live check): a roll whose only consequence is its card names itself as it is pressed in both views, so the host holds it for its card; a roll with no card stays plain', NM.rolls[0].named === true && NMV.rolls[0].named === true && !('cardActs' in NMV.rolls[0]) && !('named' in NM.rolls[1]) && !('named' in NMV.rolls[1]), J([NM.rolls, NMV.rolls]));
        const RR = S.cleanSystem({ v: 1, name: 'R', combat: { checks: 'plain' }, fields: SYS.fields, rolls: [
            { id: 'r_k', label: 'Lucky', formula: '1d20 >= 11', then: [{ f: 'f_hp', formula: '1', add: true }], cardActs: [{ label: 'Luck', does: 'best', times: 2 }, { label: 'Jinx', does: 'worst' }] },
            { id: 'r_o', label: 'Pool', formula: '3d6 >= 1', then: [{ f: 'f_hp', formula: '1', add: true }], cardActs: [{ label: 'Nudge', does: 'oneDie' }] },
            { id: 'r_x', label: 'Wild', formula: '1d6! >= 1', then: [{ f: 'f_hp', formula: '1', add: true }], cardActs: [{ label: 'Nudge', does: 'oneDie' }] }] }, { F, gmView: true });
        const rw = (id) => { const w = world(); w.camp.system = JSON.parse(J(RR)); w.roll(id, RR.rolls.filter(r => r.id === id)[0].formula); return w; }, last = w => w.table[w.table.length - 1], rank = c => { const r = fixed(c.expr, c.draws), v = D.verdictOf(r, rule); return [v.pass ? 1 : 0, v.margin]; };
        let betterOk = true, worseOk = true, sayOk = true;
        for (let t = 0; t < 40; t++) {
            const w = rw('r_k'), c0 = w.table[0], r0 = rank(c0); w.api.press(c0.id, '0', 'u_a'); const c1 = last(w), r1 = rank(c1);
            if (r1[0] < r0[0] || (r1[0] === r0[0] && r1[1] < r0[1])) betterOk = false;
            if (!c1.redo || c1.redo.k !== 'better' || c1.redo.n !== 2 || c1.id !== c0.id || !c1.pend) sayOk = false;
            w.api.press(c0.id, '0', 'u_a'); const c2 = last(w); if (!c2.redo || c2.redo.n !== 3) sayOk = false;
            const v = rw('r_k'), d0 = v.table[0], s0 = rank(d0); v.api.press(d0.id, '1', 'u_a'); const d1 = last(v), s1 = rank(d1);
            if (s1[0] > s0[0] || (s1[0] === s0[0] && s1[1] > s0[1])) worseOk = false;
        }
        check('gap #2: keep the better never leaves a worse try than it had, keep the worse never a better (40 rolls each)', betterOk && worseOk);
        check('gap #2: the pending card counts the tries under the roll’s one id', sayOk);
        const wl = rw('r_k'), l0 = wl.table[0]; wl.api.press(l0.id, '0', 'u_a'); wl.api.press(l0.id, 'accept', 'u_a'); const lf = last(wl);
        check('gap #2: the final card keeps the line, and the cleaner keeps it for a player’s app', !lf.pend && lf.id === l0.id && J(lf.redo) === J({ k: 'better', n: 2 }) && wl.camp.chars.c_a.values.f_hp === 1 && J(D.cleanRoll(Object.assign({}, lf, { type: 'roll' })).redo) === J({ k: 'better', n: 2 }), J(lf));
        const wo = rw('r_o'), o0 = wo.table[0];
        check('gap #2: one die again is offered as a pick of a die', J(o0.offers) === J([{ k: '0', l: 'Nudge', d: 1 }]) && J(D.cleanRoll(Object.assign({}, o0, { type: 'roll' })).offers) === J([{ k: '0', l: 'Nudge', d: 1 }]), J(o0));
        wo.api.press(o0.id, '0', 'u_a'); wo.api.press(o0.id, '0:7', 'u_a');
        check('gap #2: a press that names no die, or a die the card does not offer, does nothing', wo.table.length === 1 && wo.api.held().length === 1);
        const mr = Math.random; Math.random = () => 0.5; const wq = world({ draws: [2, 5, 6] }); wq.camp.system = JSON.parse(J(RR)); wq.roll('r_o', '3d6 >= 1'); wq.api.press(wq.table[0].id, '0:1', 'u_a'); Math.random = mr;
        check('gap #2: the die picked is truly rolled again (a fresh 4 where it showed 5)', J(last(wq).draws) === J([2, 4, 6]) && J(last(wq).redo) === J({ f: 6, a: 5, b: 4 }), J(last(wq)));
        let oneOk = true;
        for (let t = 0; t < 30; t++) {
            const w = rw('r_o'), a0 = w.table[0]; w.api.press(a0.id, '0:1', 'u_a'); const a1 = last(w);
            if (a1.id !== a0.id || a1.pend || a1.draws[0] !== a0.draws[0] || a1.draws[2] !== a0.draws[2] || a1.draws.length !== 3 || !a1.redo || a1.redo.f !== 6 || a1.redo.a !== a0.draws[1] || a1.redo.b !== a1.draws[1] || w.camp.chars.c_a.values.f_hp !== 1) { oneOk = false; console.log(J([a0, a1])); break; }
        }
        check('gap #2: only the die picked is rolled again, the others stand, the card says what it showed and shows now, and with no uses left it lands', oneOk);
        const FX = S.cleanSystem({ v: 1, name: 'X', combat: { checks: 'fixed' }, fields: SYS.fields, rolls: [{ id: 'r_f', label: 'Fixed', formula: '3d6 + 10 >= 5', cardActs: [{ label: 'Luck', does: 'best' }] }] }, { F, gmView: true }), wf = world({ draws: [6, 6, 5, 1, 1, 1] }); wf.camp.system = JSON.parse(J(FX)); wf.roll('r_f', '3d6 + 10 >= 5'); wf.api.press(wf.table[0].id, '0', 'u_a');
        check('gap #2: on the host, keep the better reads the roll’s own critical range, so a critical success is kept over a plain one', J(last(wf).draws) === J([1, 1, 1]) && !last(wf).pend, J(last(wf)));
        const wx = rw('r_x');
        check('gap #2: a roll with no die that can be rolled again offers nothing, so it never waits', wx.api.held().length === 0 && !wx.table[0].pend && wx.camp.chars.c_a.values.f_hp === 1, J(wx.table[0]));
    }
    // the words and the wiring
    const ix = read('index.html'), dc = read('scripts/dice.js'), ci = readRoot('.github/workflows/checks.yml');
    check('the card says it plainly', dc.includes("'Pending. Nothing has landed yet.'"));
    check('and a held card keeps Table Chat up for its roller and the GM, so its buttons stay in reach (found by pressing it)', /function waits\(m\) \{[\s\S]{0,160}m\.due[\s\S]{0,200}m\.roll\.pend/.test(dc));
    check('Help, the key, both notes and CI say it', /<b>On the card<\/b> lets a roller change a roll/.test(ix) && /<b>On the card<\/b><small>/.test(ix) && /can offer things to do before it lands/.test(readRoot('WHATSNEW.txt')) && /can offer things to do before it lands/.test(read('assets/whatsnew.txt')) && /node tools\/cardcheck\.js/.test(ci));
    check('the viewing of 2026-11-09: one point to spend is said as one point, and a word the system names is said as it names it', dc.includes("rec.pts.n + ' ' + String(rec.pts.w || (rec.pts.n === 1 ? 'point' : 'points')) + ' to spend'"));
    check('a box of the card’s is a form, so nobody types a name', /'sys-card-n': 'amt', 'sys-card-needs': 'cond'/.test(read('scripts/formbox.js')));
    summed = true; console.log(pass + ' passed, ' + fail + ' failed.'); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL      the suite stopped: ' + (e && e.stack || e)); process.exit(1); });
process.on('exit', () => { if (!summed) { console.log('FAIL      the suite did not finish'); process.exitCode = 1; } });

// askcheck — what a roll or an action asks as it is pressed (1.6.2, backlog 210 b, G6). systemcore's cleaners, the host's judge of an answer against the
// entry it rebuilds the roll from, what a player's view keeps, and the names, imported and run; dicecore's wire; the host's real roll-req branch and the
// real press of the sheet, sliced by their markers and run on plain objects. No browser, no network.
'use strict';
const fs = require('fs'), path = require('path'), url = require('url');
let pass = 0, fail = 0, summed = false;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok        ' + name); } else { fail++; console.log('FAIL      ' + name + (detail === undefined ? '' : ' -> ' + String(detail).slice(0, 900))); } }
const J = JSON.stringify, NL = '\n', root = path.join(__dirname, '..');
const app = p => path.join(root, 'system', 'app', p), read = p => fs.readFileSync(app(p), 'utf8').replace(/\r\n/g, NL), readRoot = p => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, NL);
const slice = (s, t) => { const a = s.indexOf('// [' + t + '-start]'), b = s.indexOf('// [' + t + '-end]'); if (a < 0 || b < a) throw new Error('no slice ' + t); return s.slice(a, b); };
(async () => {
    const S = await import(url.pathToFileURL(app('scripts/systemcore.js')).href), F = await import(url.pathToFileURL(app('scripts/formula.js')).href), D = await import(url.pathToFileURL(app('scripts/dicecore.js')).href);
    const PICK = { key: 'Spend', label: 'How many points?', kind: 'pick', opts: [{ label: 'One', v: 1 }, { label: 'Two', v: 2 }, { label: 'All in', v: 5 }] };
    const NUM = { key: 'Push', label: 'How hard?', kind: 'num', min: '1', max: 'Might' }, FLD = { key: 'Attr', label: 'Which?', kind: 'field', fields: ['f_might', 'f_wits', 'f_sec'] };
    const RAW = { v: 1, name: 'A', fields: [{ id: 'f_might', key: 'Might', kind: 'number', def: 4 }, { id: 'f_wits', key: 'Wits', kind: 'number', def: 7 }, { id: 'f_sec', key: 'Sec', kind: 'number', def: 9, vis: 'gm' }, { id: 'f_hp', key: 'HP', kind: 'number', def: 0 }, { id: 'f_note', key: 'Note', kind: 'text' }],
        rolls: [{ id: 'r_a', label: 'Strike', formula: '1d1 + Ask.Spend + Ask.Attr', asks: [PICK, FLD], needs: 'Ask.Spend >= 2', then: [{ f: 'f_hp', formula: 'Ask.Spend', add: true }] }, { id: 'r_n', label: 'Shove', apply: [{ f: 'f_hp', formula: 'Ask.Push', add: true }], asks: [NUM] }, { id: 'r_p', label: 'Plain', formula: '1d6' }] };
    const SYS = S.cleanSystem(RAW, { F, gmView: true }), VIEW = S.cleanSystem(SYS, { F, gmView: false }), ch = () => ({ id: 'c_a', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_might: 4, f_wits: 7, f_sec: 9 } });
    const rA = SYS.rolls[0], rN = SYS.rolls[1], rvA = VIEW.rolls[0], vars = S.makeResolver(SYS, ch(), F, null);

    check('a question as it is kept: words, a key the builder keeps, and an answer of one of three kinds, each a figure, a value of the sheet or a number between two', J(S.cleanAsks([PICK])) === J([{ key: 'Spend', label: 'How many points?', kind: 'pick', opts: PICK.opts }]) && J(S.cleanAsks([NUM])) === J([{ key: 'Push', label: 'How hard?', kind: 'num', min: '1', max: 'Might' }]) && J(S.cleanAsks([FLD])[0].fields) === J(FLD.fields));
    check('an answer with no figure takes its place in the list, as a list of words does', J(S.cleanAsks([{ key: 'K', label: 'Q', opts: [{ label: 'a' }, { label: 'b', v: 9 }, { label: 'c' }] }])[0].opts.map(o => o.v)) === J([1, 9, 3]));
    check('what is no question is none: no words, a key that is no word, a key twice, no answers, no ends, and at most three', [[{ key: 'K', opts: [{ label: 'a' }] }], [{ key: '1x', label: 'Q', opts: [{ label: 'a' }] }], [{ key: 'K', label: 'Q' }], [{ key: 'K', label: 'Q', kind: 'num', min: '1' }], [{ key: 'K', label: 'Q', kind: 'field', fields: [] }], 'x', null, []].every(v => S.cleanAsks(v) === undefined)
        && S.cleanAsks([PICK, Object.assign({}, PICK, { label: 'Again' })]).length === 1 && S.cleanAsks(['a', 'b', 'c', 'd'].map(k => Object.assign({}, PICK, { key: k }))).length === S.ASKS_MAX);
    check('a roll with none cleans as it always did, with no key', !('asks' in SYS.rolls[2]) && J(Object.keys(S.cleanSystem({ v: 1, name: 'B', fields: [], rolls: [{ id: 'r_x', label: 'X', formula: '1d6' }] }, { F, gmView: true }).rolls[0])) === J(['id', 'label', 'formula', 'vis']));
    check('it is kept on a roll, on an action and on a list’s roll and action, and a roll that asks needs no other mark', Array.isArray(rA.asks) && Array.isArray(rN.asks) && (() => { const L = S.cleanSystem({ v: 1, name: 'L', fields: [{ id: 'f_l', key: 'Gear', kind: 'item-list', list: { rolls: [{ label: 'R', formula: '1d6', asks: [PICK] }, { label: 'U', apply: [{ f: 'f_l', q: true, formula: '1', add: true }], asks: [PICK] }] } }] }, { F, gmView: true }); return L.fields[0].list.rolls.every(r => Array.isArray(r.asks)); })());

    check('a value a player cannot read truthfully is offered in neither view, so both sheets offer the same', J(rA.asks[1].fields) === J(['f_might', 'f_wits']) && J(rvA.asks[1].fields) === J(['f_might', 'f_wits']));
    const SEC = S.cleanSystem({ v: 1, name: 'C', fields: [{ id: 'f_s', key: 'Sec', kind: 'number', def: 2, vis: 'gm' }, { id: 'f_d', key: 'Derived', kind: 'formula', formula: 'Sec + 1' }, { id: 'f_t', key: 'Txt', kind: 'text' }], rolls: [{ id: 'r_a', label: 'A', formula: '1d6', asks: [{ key: 'A', label: 'Q', kind: 'num', min: '0', max: 'Sec' }, { key: 'B', label: 'R', kind: 'num', min: '0', max: 'Derived' }, { key: 'C', label: 'S', kind: 'num', min: '1d6', max: '3' }, { key: 'E', label: 'T', kind: 'field', fields: ['f_t', 'f_s', 'f_d'] }] }] }, { F, gmView: true });
    check('a number whose ends read a GM-only value, even through another, or roll dice, is no question, and a field that holds words is no value', !('asks' in SEC.rolls[0]), J(SEC.rolls[0].asks));

    const ok1 = S.askJudge(SYS, rA, { Spend: 2, Attr: 'f_wits' }, vars, F);
    check('an answer judged: a place in the list reads its figure, a value of the sheet its own figure, and the card gets the words', J(ok1.said) === J([{ l: 'How many points?', w: 'All in' }, { l: 'Which?', w: 'Wits' }]) && ok1.ask.spend === 5 && ok1.ask.attr.f === 'Wits');
    const w1 = S.withAsk(vars, ok1), ev = t => { const r = F.evaluate(t, { vars: w1, bare: true }); return r.ok ? r.value : 'ERR'; };
    check('Ask.<key> reads the answer in any case, and every other name as before', ev('Ask.Spend') === 5 && ev('ASK.spend') === 5 && ev('Ask.Attr') === 7 && ev('Might') === 4 && w1.asked === true && (F.evaluate('Ask.Nope', { vars: w1, bare: true }).ok === false));
    const bad = [{ Spend: 3 }, { Spend: -1 }, { Spend: 1.5 }, { Spend: 'One' }, { Attr: 'f_sec' }, { Attr: 'f_hp' }, { Attr: 3 }].map(a => S.askJudge(SYS, rA, a, vars, F).error);
    check('an answer that was not offered is refused, a GM-only value by its id among them: nothing a roller sends is read as a figure', bad.every(e => typeof e === 'string' && e.length > 0), J(bad));
    const num = n => S.askJudge(SYS, rN, { Push: n }, vars, F);
    check('a number stands between its two ends as this character reads them, whole, and past either end it is refused', num(1).ask.push === 1 && num(4).ask.push === 4 && !!num(5).error && !!num(0).error && !!num(2.5).error);
    const none = S.askJudge(SYS, rA, undefined, vars, F);
    check('a press that names no answer takes the first of each, as a run by itself does', none.ask.spend === 1 && none.ask.attr.f === 'Might' && J(none.said.map(x => x.w)) === J(['One', 'Might']));
    check('an unknown key in an answer names nothing and is passed over', S.askJudge(SYS, rA, { Spend: 1, Nope: 3 }, vars, F).ask.nope === undefined);

    const proto = S.askJudge(SYS, rA, JSON.parse('{"__proto__":1,"Spend":0}'), vars, F);
    check('a hostile key reaches no prototype', !proto.error && ({}).spend === undefined && Object.prototype.toString.call(proto.ask) !== undefined && !S.cleanAskWire(JSON.parse('{"__proto__":1}')));
    check('the wire takes numbers and field ids, three at most, and nothing else, on both sides alike', [[{ Spend: 1 }, true], [{ Attr: 'f_wits' }, true], [{ a: 1, b: 2, c: 3 }, true], [{ a: 1, b: 2, c: 3, d: 4 }, false], [{}, false], [{ a: {} }, false], [{ a: 1e7 }, false], [{ a: '<b>' }, false], [{ '1a': 1 }, false], ['x', false], [[], false], [null, false]].every(c => !!S.cleanAskWire(c[0]) === c[1] && !!D.cleanRollReq({ rid: 'q1abcdef', expr: '1d6', charId: 'c_a', act: 'r_a', ask: c[0] === null ? undefined : c[0] }) === (c[0] === null ? true : c[1])));
    check('an answer travels beside a named roll alone, and on an action', !D.cleanRollReq({ rid: 'q1abcdef', expr: '1d6', charId: 'c_a', ask: { a: 1 } }) && !D.cleanRollReq({ rid: 'q1abcdef', expr: '1d6', ask: { a: 1 } }) && J(S.cleanCharApply({ rid: 'e1abcdef', charId: 'c_a', act: 'r_n', ask: { Push: 2 } }).ask) === J({ Push: 2 }) && !S.cleanCharApply({ rid: 'e1abcdef', charId: 'c_a', act: 'r_n', ask: { Push: {} } }));
    const cr = D.cleanRoll({ type: 'roll', id: 'r1abcdef', from: { id: 'u', name: 'A', color: '#112233' }, expr: '1d6', draws: [1], v: F.VERSION, ts: 1, asked: [{ l: 'Q', w: 'A' }, { l: 'R' }, 5] });
    check('the card keeps the words alone', !cr || J(cr.asked) === J([{ l: 'Q', w: 'A' }]), J(cr));

    check('needs that read an answer wait for it, and are judged once it is given', S.rollNeedsOk(rA, vars, F) === true && S.rollNeedsOk(rA, S.withAsk(vars, S.askJudge(SYS, rA, { Spend: 0 }, vars, F)), F) === false && S.rollNeedsOk(rA, S.withAsk(vars, S.askJudge(SYS, rA, { Spend: 1 }, vars, F)), F) === true);
    const ap = S.applyAct(SYS, ch(), rN, S.withAsk(vars, S.askJudge(SYS, rN, { Push: 3 }, vars, F)), F, null, null);
    check('an action reads its answer in what it changes', ap.ok === true && ap.values.f_hp === 3, J(ap));
    const apF = S.applyAct(SYS, ch(), rN, vars, F, null, null);
    check('and an action run by itself takes the first answer', apF.ok === true && apF.values.f_hp === 1, J(apF));

    const V = (r, extra) => S.validateSystem(S.cleanSystem(Object.assign({ v: 1, name: 'V', fields: RAW.fields, rolls: [r] }, extra || {}), { F, gmView: true }), F);
    check('the check knows Ask.<key> in the entry that asks it, in its roll, needs and Then, and nowhere else', !V({ id: 'r_a', label: 'A', formula: '1d6 + Ask.Spend', asks: [PICK], then: [{ f: 'f_hp', formula: 'Ask.Spend', add: true }] }).errors.length && V({ id: 'r_a', label: 'A', formula: '1d6 + Ask.Spend' }).errors.length === 1 && V({ id: 'r_a', label: 'A', formula: '1d6 + Ask.Nope', asks: [PICK] }).errors.length === 1);
    const onItsOwn = V({ id: 'r_a', label: 'A', formula: '1d6', asks: [PICK], every: { n: 1, unit: 'hour' } }, { calendar: { day: { hours: 24 } } });
    check('a roll that runs by itself is warned that nobody is asked', (onItsOwn.warnings || []).some(w => /nobody is asked/.test(w.message)) || !('every' in S.cleanSystem({ v: 1, name: 'V', fields: [], rolls: [{ id: 'r_a', label: 'A', formula: '1d6', asks: [PICK], every: { n: 1, unit: 'hour' } }] }, { F, gmView: true }).rolls[0]), J(onItsOwn.warnings));

    check('a question is said in words, in what a form offers and in what it reads back', S.nameWord(SYS, 'Ask.Spend') === 'their answer to “How many points?”' && S.readsOf(SYS, { roll: rA }).some(g => g.name === 'What they answered' && g.items.length === 2 && g.items[0].s === 'Ask.Spend') && !S.readsOf(SYS, { roll: SYS.rolls[2] }).some(g => g.name === 'What they answered') && S.nameAsks(SYS, 'Ask.Spend') === true);

    // the host's real roll branch
    const nsrc = read('scripts/net.js'), between = (a, b) => { const i = nsrc.indexOf(a), k = nsrc.indexOf(b); if (i < 0 || k < i) throw new Error('no slice ' + a); return nsrc.slice(i + a.length, k); };
    const line = k => { const i = nsrc.indexOf(k); if (i < 0) throw new Error('no line ' + k); return nsrc.slice(i, nsrc.indexOf(NL, i)); };
    const helpers = ['function own(', 'function peerProfileId(', 'function fxLib(', 'function itemLib(', 'function diceFrom('].map(line).join(NL) + NL;
    const rq = between('// [netcheck:rollreq-start]', '// [netcheck:rollreq-end]');
    const send = msg => {
        const out = { table: [], sent: [] }, camp = { id: 'k', activeItemId: 'm1', system: SYS, chars: { c_a: Object.assign(ch(), {}) }, items: { m1: { type: 'map', whiteboard: [] } } };
        const net = { role: 'host', paused: false, roster: { pA: { id: 'u_a', name: 'Pat', location: 'm1' } }, combats: {}, combatRoundOf: () => null, syncCharDelta() {} }, conn = { peer: 'pA', send(m) { out.sent.push(JSON.parse(J(m))); } };
        const win = { wpFormula: F, wpSheets: { playerSystem: c => S.cleanSystem(c.system, { F, gmView: false }), charChanged() {} }, wpVtt: { on: () => true, rulesOn: () => true } };
        new Function('msg', 'conn', 'net', 'DC', 'SC', 'window', 'getActiveCampaign', 'peerPaused', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'saveRemoteSoon', 'var diceLimit = null, _diceSlowSaid = {};\n' + helpers + rq)(Object.assign({ type: 'roll-req', rid: 'q1abcdef', charId: 'c_a' }, msg), conn, net, () => D, () => S, win, () => camp, () => false, e => { throw e; }, rec => { out.table.push(JSON.parse(J(rec))); }, () => {}, () => {}, () => {});
        out.vals = camp.chars.c_a.values; return out;
    };
    const f = rA.formula, okR = send({ act: 'r_a', expr: f, ask: { Spend: 1, Attr: 'f_wits' } });
    check('the host’s real roll branch: the roll reads the answers, Then reads them too, and the card says what was answered', okR.table.length === 1 && J(okR.table[0].asked) === J([{ l: 'How many points?', w: 'Two' }, { l: 'Which?', w: 'Wits' }]) && okR.vals.f_hp === 2, J([okR.table, okR.sent, okR.vals]));
    const lowR = send({ act: 'r_a', expr: f, ask: { Spend: 0, Attr: 'f_wits' } }), forged = send({ act: 'r_a', expr: f, ask: { Spend: 1, Attr: 'f_sec' } }), plain = send({ act: 'r_p', expr: '1d6', ask: { Spend: 1 } }), fake = send({ act: 'r_a', expr: f, ask: { Spend: 99 } });
    check('its needs read the answer before anything is rolled, an answer that was not offered is refused with nothing rolled or changed, and a roll that asks nothing takes no answer', lowR.table.length === 0 && lowR.sent[0].type === 'roll-deny' && forged.table.length === 0 && forged.sent[0].type === 'roll-deny' && plain.table.length === 0 && fake.table.length === 0 && !('f_hp' in fake.vals), J([lowR.sent, forged.sent, plain.sent, fake.sent]));
    const noAns = send({ act: 'r_a', expr: f });
    check('a press that names no answer takes each first answer, where needs may then hold it back', noAns.table.length === 0 && noAns.sent[0].type === 'roll-deny', J(noAns.sent));

    // the sheet's press, run for real on a page of plain objects
    const sh = read('scripts/sheets.js'), box = slice(sh, 'sinkcheck:askbox');
    const made = []; const mk = (t, c, x) => { const e = { tag: t, className: c || '', children: [], style: {}, dataset: {}, attrs: {}, on: {}, textContent: x === undefined ? '' : String(x), setAttribute(k, v) { this.attrs[k] = v; }, appendChild(k) { this.children.push(k); return k; }, addEventListener(n, fn) { this.on[n] = fn; }, focus() { this.focused = true; }, getBoundingClientRect() { return { left: 10, bottom: 20, height: 100 }; } }; Object.defineProperty(e, 'innerHTML', { set() { throw new Error('markup'); } }); made.push(e); return e; };
    const opt = (v, t, s) => { const o = mk('option', '', t); o.value = v; o.selected = !!s; return o; };
    const docA = { body: mk('body'), addEventListener() {}, removeEventListener() {} }, winA = { innerWidth: 900, innerHeight: 700 };
    const sysH = JSON.parse(J(SYS)), mod = new Function('el', 'opt', 'document', 'window', 'systemOf', 'getActiveCampaign', 'charById', 'F', 'resolveAll', 'tokenCtxFor', 'fieldById', 'askEnds', 'closeLoadMenu', 'ldOutside', 'ldKey', 'state', box + '\nreturn { askEntry, askNamed, askThen, set: function(v) { _ldPop = v; }, get: function() { return _ldPop; } };'.replace('_ldPop = v', 'state.pop = v').replace('return _ldPop', 'return state.pop'))(mk, opt, docA, winA, () => sysH, () => ({}), () => ch(), () => F, () => ({ vars }), () => null, (s, id) => s.fields.find(x => x.id === id), S.askEnds, () => {}, () => {}, () => {}, {});
    check('the sheet finds what a press asks by its name, a list’s roll by its place, and nothing for a roll that asks nothing', !!mod.askEntry({ act: 'r_a' }, null) && !!mod.askEntry(null, { r: 'r_a' }) && mod.askEntry({ act: 'r_p' }, null) === null && mod.askEntry({}, null) === null);
    check('a press is named as the host needs it, by act or by a list’s row, with its answers', J(mod.askNamed({}, { r: 'r_a' }, { a: 1 })) === J({ act: 'r_a', ask: { a: 1 } }) && J(mod.askNamed({}, { l: 'f_l', row: 'w_a', i: 2 }, { a: 1 })) === J({ row: { f: 'f_l', r: 'w_a', i: 2 }, ask: { a: 1 } }));

    // the words and the wiring
    const ix = read('index.html'), wn = readRoot('WHATSNEW.txt'), wa = read('assets/whatsnew.txt'), ci = readRoot('.github/workflows/checks.yml');
    check('Help, the key, both notes and CI say it', /<b>What it asks when pressed<\/b> lets a roll or an action ask up to three things/.test(ix) && /<b>What it asks when pressed<\/b><small>/.test(ix) && /can ask up to three things as it is pressed/.test(wn) && /can ask up to three things as it is pressed/.test(wa) && /node tools\/askcheck\.js/.test(ci));
    check('a question’s key is the builder’s own: the box never shows or asks for one', /keyOf = function\(\)/.test(sh) && !/sys-ask-key/.test(sh));
    check('the box stands in the Rolls tab and on a list’s roll, each with a group or a place of its own', sh.includes('row.appendChild(asksBox(r));') && sh.includes('row.appendChild(asksBox(rr));') && read('scripts/sysui.js').includes("['asks', 'What it asks when pressed', 0, ['sys-asks']]"));
    check('a crew member\u2019s press is asked as well', /enC = typeof askEntry === 'function' \? askEntry\(oC, null\) : null; if \(enC\) askThen\(enC, c, bR, oC, null, goC\)/.test(sh));
    // found by pressing it: each hop from the box to the host copies named keys, and a key left off is silently the first answer. The real rollFor, roll and net.diceRoll's send, on a stub of each
    {
        const dsrc = read('scripts/dice.js'), rfA = dsrc.indexOf('function rollFor('), rfB = dsrc.indexOf('/* ---------- Stage 5a', rfA), rA0 = dsrc.indexOf('function roll(expr, opts) {'), rB0 = dsrc.indexOf(NL + '}' + NL, rA0) + 3, got = [];
        const net0 = { diceRoll(e, o) { got.push(o); return { ok: true }; } };
        const mkD = new Function('net', 'ui', 'panelOpen', 'syncChars', 'toast', 'cleanExpr', 'remember', 'LIMITS', 'var _rollMore = null, lastSource = null;' + NL + dsrc.slice(rA0, rB0) + dsrc.slice(rfA, rfB) + NL + 'return rollFor;')(() => net0, () => null, () => false, () => {}, () => {}, x => x, () => {}, { expr: 500 });
        mkD('c_a', '1d6', 'L', { act: 'r_a', ask: { Q1: 1 } });
        check('the answer goes from the press to the net’s send, by rollFor and roll', got.length === 1 && J(got[0].ask) === J({ Q1: 1 }), J(got));
        check('and the send puts it on the message', nsrc.includes("req.ask = o.ask;") && nsrc.includes("if (ask && typeof ask === 'object') req.ask = ask;"));
    }
    check('both ends of a number are forms, so nobody types a name', /'sys-ask-min': 'amt', 'sys-ask-max': 'amt'/.test(read('scripts/formbox.js')) && /'sys-ask-min': \['What is the lowest answer\?'/.test(read('scripts/formbox.js')));
    summed = true; console.log(pass + ' passed, ' + fail + ' failed.'); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL      the suite stopped: ' + (e && e.stack || e)); process.exit(1); });
process.on('exit', () => { if (!summed) { console.log('FAIL      the suite did not finish'); process.exitCode = 1; } });

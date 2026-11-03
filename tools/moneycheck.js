// moneycheck — currencies (backlog 157 M1; the owner, 2026-11-03: "A price stays in the system's base unit", and of a Separate currency, "it isn't
// converted, it isn't picked by the smallest-first rule"). systemcore's cleaners and the real moneyHeld and moneyMove imported and run, a system
// with no currency held to what the code before gave by a seeded walk pinned by its hash, and the editor's boxes. No browser, no network.
'use strict';
const fs = require('fs'), path = require('path'), url = require('url'), crypto = require('crypto');
let pass = 0, fail = 0, summed = false;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok        ' + name); } else { fail++; console.log('FAIL      ' + name + (detail === undefined ? '' : ' -> ' + String(detail).slice(0, 900))); } }
const J = JSON.stringify, NL = '\n', root = path.join(__dirname, '..');
const app = p => path.join(root, 'system', 'app', p), read = p => fs.readFileSync(app(p), 'utf8').replace(/\r\n/g, NL), readRoot = p => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, NL);
// [moneycheck:walk-start]
// a seeded walk over money with no currency: what is held and what each move does, new rows' ids left out (they are random)
function moneyWalk(S, F) {
    let seed = 20261103; const rnd = n => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
    const mk = only => S.cleanSystem({ v: 1, name: 'W', rolls: [], fields: [
        { id: 'f_chips', key: 'Chips', label: 'Chips', kind: 'item-list', edit: 'owner', vis: 'all', list: { multi: true, cats: ['Chip'], on: { label: 'Stowed' }, lvl: { label: 'Stored', min: 0, max: 100000, step: 0.01, def: 0 }, money: '@lvl' } },
        { id: 'f_bars', key: 'Bars', label: 'Bars', kind: 'item-list', edit: 'owner', vis: 'all', list: { multi: true, stats: [{ key: 'cr', label: 'Denom' }], money: 'cr' } }].slice(only ? 1 : 0),
        items: [{ id: 'i_chip', name: 'Chip' }, { id: 'i_b100', name: 'Bar 100', stats: { cr: 100 } }, { id: 'i_b10', name: 'Bar 10', stats: { cr: 10 } }, { id: 'i_b1', name: 'Bar 1', stats: { cr: 1 } }] }, { F, gmView: true });
    const both = mk(false), bars = mk(true), out = [];
    const norm = r => r.ok ? Object.keys(r.values).sort().map(k => k + ':' + r.values[k].map(x => (x.lvl !== undefined ? 'L' + x.lvl : '') + 'q' + x.qty + (x.defId || x.def.name) + (x.on === false ? 'o' : '') + (x.keptOn ? 'k' : '') + (x.hid ? 'h' : '')).join(',')).join(' ') : r.reason + '|' + r.msg;
    for (let i = 0; i < 400; i++) {
        const sys = rnd(3) ? both : bars, ch = { values: { f_chips: [], f_bars: [] } };
        if (sys === both) for (let c = rnd(4); c > 0; c--) { const r = { id: 'w_c' + c, defId: 'i_chip', qty: 1 + rnd(2), lvl: rnd(200000) / 100 }; if (!rnd(9)) r.keptOn = 1; if (!rnd(11)) r.hid = 1; ch.values.f_chips.push(r); }
        ['i_b100', 'i_b10', 'i_b1'].forEach((d, k) => { const q = rnd(5); if (q) ch.values.f_bars.push({ id: 'w_b' + k, defId: d, qty: q }); });
        const d = rnd(4) ? (rnd(6001) - 3000) : (rnd(600001) - 300000) / 100;
        out.push([S.moneyHeld(sys, ch), norm(S.moneyMove(sys, ch, d))]);
    }
    return crypto.createHash('sha256').update(J(out)).digest('hex');
}
// [moneycheck:walk-end]
(async () => {
    const S = await import(url.pathToFileURL(app('scripts/systemcore.js')).href), F = await import(url.pathToFileURL(app('scripts/formula.js')).href);
    check('a system with no currency holds and moves money byte for byte as before 157 M1, by the hash the code before gave over 400 seeded moves', moneyWalk(S, F) === 'ea6d6254a7ffb3364228f76e4ae92c0d20dd00cb28fa4020c6dab8361f277a9f', moneyWalk(S, F));
    // the cleaner
    const cc = S.cleanCurrencies([{ key: 'C1', label: 'Crowns', worth: 10 }, { key: 'c1', label: 'Twice' }, { key: '__proto__', label: 'X' }, { key: '1C', label: 'Bad' }, { key: 'C2', label: '', worth: -3, sep: 'yes' }, { key: 'C3', label: 'Tokens', worth: 1, sep: true }, 'junk', null]);
    check('a currency keeps a key once, a name, a worth above 0 (else 1) and Separate only as true; a key that is none, a second spelling of one and junk are no currency',
        J(cc) === J([{ key: 'C1', label: 'Crowns', worth: 10 }, { key: 'C2', label: 'C2', worth: 1 }, { key: 'C3', label: 'Tokens', worth: 1, sep: true }]), J(cc));
    check('twelve at most, and a worth held to a millionth', S.cleanCurrencies(Array.from({ length: 30 }, (x, i) => ({ key: 'K' + i, label: 'K', worth: 1e12 }))).length === S.CUR_MAX && S.CUR_MAX === 12 && S.cleanCurrencies([{ key: 'A', worth: 1e-9 }])[0].worth === 0.000001 && S.cleanCurrencies([{ key: 'A', worth: 1e12 }])[0].worth === 1e9);
    const RAW = { v: 1, name: 'M', rolls: [], currencies: [{ key: 'C1', label: 'Crowns', worth: 10 }, { key: 'C2', label: 'Marks', worth: 0.5 }, { key: 'C3', label: 'Tokens', worth: 1, sep: true }], fields: [
        { id: 'f_chips', key: 'Chips', label: 'Chips', kind: 'item-list', edit: 'owner', vis: 'all', list: { multi: true, cats: ['Chip'], lvl: { label: 'Stored', min: 0, max: 100000, step: 0.01, def: 0 }, money: '@lvl' } },
        { id: 'f_coins', key: 'Coins', label: 'Coins', kind: 'item-list', edit: 'owner', vis: 'all', list: { multi: true, stats: [{ key: 'cr', label: 'Denom' }, { key: 'kind', label: 'Coin', kind: 'pick', opts: [{ label: 'Crowns', name: 'Crowns' }, { label: 'Marks', name: 'Marks' }, { label: 'Tokens', name: 'Tokens' }] }], money: 'cr', cur: 'c2', curBy: 'KIND' } },
        { id: 'f_odd', key: 'Odd', label: 'Odd', kind: 'item-list', edit: 'owner', vis: 'all', list: { stats: [{ key: 'cr', label: 'Denom' }], money: 'cr', cur: 'C9', curBy: 'cr' } },
        { id: 'f_none', key: 'None', label: 'None', kind: 'item-list', edit: 'owner', vis: 'all', list: { stats: [{ key: 'kind', label: 'K', kind: 'pick', opts: [{ label: 'a', name: 'a' }] }], cur: 'C1', curBy: 'kind' } }],
        items: [{ id: 'i_chip', name: 'Chip' }, { id: 'i_cr1', name: 'Crown', stats: { cr: 1, kind: 'Crowns' } }, { id: 'i_mk1', name: 'Mark', stats: { cr: 1, kind: 'Marks' } }, { id: 'i_mk5', name: 'Five marks', stats: { cr: 5 } }, { id: 'i_tk1', name: 'Token', stats: { cr: 1, kind: 'Tokens' } }] };
    const sy = S.cleanSystem(RAW, { F, gmView: true }), pv = S.cleanSystem(RAW, { F, gmView: false }), L = id => sy.fields.filter(f => f.id === id)[0].list;
    check('the system keeps its currencies, the same in both views', J(sy.currencies) === J(RAW.currencies) && J(pv.currencies) === J(sy.currencies), J([sy.currencies, pv.currencies]));
    check('a money list keeps a currency the system names, spelled as it spells it, and a choice of each row that names its own; one that names none, a number with no value names and a list that holds no money keep neither',
        L('f_coins').cur === 'C2' && L('f_coins').curBy === 'kind' && L('f_odd').cur === undefined && L('f_odd').curBy === undefined && L('f_none').cur === undefined && L('f_none').curBy === undefined, J([L('f_coins'), L('f_odd'), L('f_none')]));
    const noCur = S.cleanSystem(Object.assign({}, RAW, { currencies: [] }), { F, gmView: true });
    check('with no currency a list keeps neither, and the system no currencies key', noCur.currencies === undefined && noCur.fields[1].list.cur === undefined && noCur.fields[1].list.curBy === undefined, J(noCur.fields[1].list));
    const box = S.moneyBoxes(sy).filter(b => b.f.id === 'f_coins')[0], cOf = id => (S.moneyCurOf(sy, box, sy.items.filter(i => i.id === id)[0]) || { key: '' }).key;
    check('a row holds the currency its choice names, by its name or key ignoring case; one whose choice names none holds the list’s own', cOf('i_cr1') === 'C1' && cOf('i_mk1') === 'C2' && cOf('i_mk5') === 'C2' && cOf('i_tk1') === 'C3', J(['i_cr1', 'i_mk1', 'i_mk5', 'i_tk1'].map(cOf)));
    const mk = () => ({ values: { f_chips: [{ id: 'w_c1', defId: 'i_chip', qty: 1, lvl: 30 }], f_coins: [{ id: 'w_1', defId: 'i_cr1', qty: 3 }, { id: 'w_2', defId: 'i_mk1', qty: 4 }, { id: 'w_3', defId: 'i_mk5', qty: 2 }, { id: 'w_4', defId: 'i_tk1', qty: 7 }] } });
    const qs = r => r.ok ? Object.keys(r.values).sort().map(k => k + ':' + r.values[k].map(x => (x.lvl !== undefined ? 'L' + x.lvl : '') + 'q' + x.qty + (x.defId || x.def.name)).join(',')).join(' ') : r.reason + '|' + r.msg;
    check('what a character holds is the base unit’s money, each row times its currency’s worth, a Separate currency left out; a currency’s own counts its own units', S.moneyHeld(sy, mk()) === 67 && S.moneyHeld(sy, mk(), 'C1') === 3 && S.moneyHeld(sy, mk(), 'c2') === 14 && S.moneyHeld(sy, mk(), 'C3') === 7 && S.moneyHeld(sy, mk(), 'C9') === 0,
        J([S.moneyHeld(sy, mk()), S.moneyHeld(sy, mk(), 'C1'), S.moneyHeld(sy, mk(), 'C2'), S.moneyHeld(sy, mk(), 'C3')]));
    const p35 = S.moneyMove(sy, mk(), -35);
    check('a price in the base unit drains the smallest money first by worth, breaks the largest piece and hands the change back in the fewest pieces, a Separate currency untouched',
        qs(p35) === 'f_chips: f_coins:q2i_cr1,q4i_mk1,q4i_mk5,q7i_tk1 f_odd:' && S.moneyHeld(sy, { values: Object.assign(mk().values, p35.values) }) === 32, qs(p35));
    check('more than the base unit’s money is refused in its own words, what a Separate currency holds never counting', qs(S.moneyMove(sy, mk(), -70)) === 'money|Not enough money: 67 held, 70 needed.', qs(S.moneyMove(sy, mk(), -70)));
    check('an amount in a currency moves that currency’s rows alone, in its own units, and says its name when short', qs(S.moneyMove(sy, mk(), -5, 'C3')) === 'f_chips:L30q1i_chip f_coins:q3i_cr1,q4i_mk1,q2i_mk5,q2i_tk1 f_odd:' && qs(S.moneyMove(sy, mk(), -8, 'C3')) === 'money|Not enough Tokens: 7 held, 8 needed.' && qs(S.moneyMove(sy, mk(), -1, 'C9')) === 'value|There is no such currency.',
        J([qs(S.moneyMove(sy, mk(), -5, 'C3')), qs(S.moneyMove(sy, mk(), -8, 'C3'))]));
    check('money paid in lands on the largest chip of the base unit, or in a currency on that currency’s pieces', qs(S.moneyMove(sy, mk(), 12)) === 'f_chips:L42q1i_chip' && qs(S.moneyMove(sy, mk(), 3, 'C1')) === 'f_coins:q6i_cr1,q4i_mk1,q2i_mk5,q7i_tk1 f_odd:',
        J([qs(S.moneyMove(sy, mk(), 12)), qs(S.moneyMove(sy, mk(), 3, 'C1'))]));
    const sy2 = S.cleanSystem(Object.assign({}, RAW, { fields: RAW.fields.filter(f => f.id === 'f_coins') }), { F, gmView: true }), coinsOnly = { values: { f_coins: mk().values.f_coins } };
    check('with no chip the base unit’s money comes in the fewest pieces by their worth, never as a Separate currency', qs(S.moneyMove(sy2, coinsOnly, 7)) === 'f_coins:q3i_cr1,q8i_mk1,q4i_mk5,q7i_tk1', qs(S.moneyMove(sy2, coinsOnly, 7)));
    // the editor
    const sh = read('scripts/sheets.js'), ix = read('index.html'), ui = read('scripts/sysui.js');
    check('the Rules tab has Money, a currency a row with its name, Worth and Separate, a key made once and never shown', ix.includes('<div id="sysMoney" data-topic="money"></div>') && ui.includes("['money', 'Money', 'The currencies money is counted in.']") && sh.includes("function renderCurrencies() {")
        && sh.includes("input('sys-cur-label field'") && sh.includes("numInput('sys-cur-worth'") && sh.includes("checkLabel('sys-cur-sep'") && sh.includes("draft.currencies.push({ key: 'C' + n, label: '', worth: 1 })") && sh.includes("    if (tab === 'rules') renderCurrencies();   // 157 M1"));
    check('a list that holds money picks its currency and a choice that names each row’s by name, only where the system names currencies', sh.includes('if (typeof curBoxes === \'function\') curBoxes(sb, sp); }   // 1.5.6 the Money box') && sh.includes("[['', 'The base unit']].concat(cs.map(function(c) { return [c.key, c.label || 'A currency']; }))")
        && sh.indexOf("c.indexOf('sys-list-curby') >= 0") > 0 && sh.indexOf("c.indexOf('sys-list-curby') >= 0") < sh.indexOf("c.indexOf('sys-list-cur') >= 0"));
    check('Help, both notes and CI say it', ix.includes('Your game may count money in <b>currencies</b>, named on the Rules tab&rsquo;s <b>Money</b>.') && readRoot('WHATSNEW.txt').includes("- Currencies: the Rules tab's Money names the currencies your game counts money") && read('assets/whatsnew.txt').includes("- Currencies: the Rules tab's Money names the currencies your game counts money")
        && readRoot('.github/workflows/checks.yml').includes('run: node tools/moneycheck.js'));
    summed = true; console.log(pass + ' passed, ' + fail + ' failed.'); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL      the suite stopped: ' + (e && e.stack || e)); process.exit(1); });
process.on('exit', () => { if (!summed) { console.log('FAIL      the suite did not finish'); process.exitCode = 1; } });

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
    // a price set in a currency (157 M1b)
    const RAW2 = Object.assign({}, RAW, { fields: RAW.fields.concat([{ id: 'f_gear', key: 'Gear', label: 'Gear', kind: 'item-list', edit: 'owner', vis: 'all', list: { multi: true, stats: [{ key: 'cr', label: 'Cost' }, { key: 'pc', label: 'Paid in', kind: 'pick', opts: [{ label: 'Crowns', name: 'Crowns' }, { label: 'Tokens', name: 'Tokens' }] }], price: 'cr', priceCur: 'C9', priceCurBy: 'PC' } },
        { id: 'f_gear2', key: 'Gear2', label: 'Gear2', kind: 'item-list', edit: 'owner', vis: 'all', list: { stats: [{ key: 'cr', label: 'Cost' }], priceCur: 'C1' } }]),
        items: RAW.items.concat([{ id: 'i_lamp', name: 'Lamp', stats: { cr: 2, pc: 'Crowns' } }, { id: 'i_charm', name: 'Charm', stats: { cr: 3, pc: 'Tokens' } }, { id: 'i_rope', name: 'Rope', stats: { cr: 5 } }]) });
    const sy2p = S.cleanSystem(RAW2, { F, gmView: true }), G = id => sy2p.fields.filter(f => f.id === id)[0].list, gearSpec = G('f_gear'), pcOf = id => (S.priceCurOf(sy2p, gearSpec, sy2p.items.filter(i => i.id === id)[0]) || { key: '' }).key;
    check('a price keeps a currency the system names and a choice that names each row’s, beside a price alone; one that names none goes', gearSpec.priceCur === undefined && gearSpec.priceCurBy === 'pc' && G('f_gear2').priceCur === undefined && S.cleanSystem(Object.assign({}, RAW2, { currencies: [] }), { F, gmView: true }).fields.filter(f => f.id === 'f_gear')[0].list.priceCurBy === undefined, J([gearSpec, G('f_gear2')]));
    check('a row’s price is set in the currency its choice names, else the base unit', pcOf('i_lamp') === 'C1' && pcOf('i_charm') === 'C3' && pcOf('i_rope') === '', J(['i_lamp', 'i_charm', 'i_rope'].map(pcOf)));
    const buy = (defId, pay) => { const ch = mk(), q = { op: 'add', defId: defId, qty: 1 }, r = S.applyRowOp(sy2p, ch, 'f_gear', q, F, {}); return S.rowOpMoney(sy2p, ch, 'f_gear', Object.assign({ pay: pay }, q), r); };
    const bCharm = buy('i_charm', 3), bRope = buy('i_rope', 5), bTooMuch = buy('i_charm', 9);
    check('a price in a Separate currency is paid from that currency alone, and one in the base unit from the base unit’s money', bCharm.ok && bCharm.values.f_coins.filter(r => r.defId === 'i_tk1')[0].qty === 4 && bCharm.values.f_chips[0].lvl === 30 && bRope.ok && bRope.values.f_chips[0].lvl === 25 && bRope.values.f_coins.filter(r => r.defId === 'i_tk1')[0].qty === 7,
        J([bCharm, bRope]));
    check('a Separate price more than that currency holds is refused in its own words, whatever else is held', bTooMuch.ok === false && bTooMuch.msg === 'Not enough Tokens: 7 held, 9 needed.', J(bTooMuch));
    // the money on offer in a trade (157 M1b)
    const tm = off => S.tradeMoney(sy, mk(), off);
    check('a trade’s money on offer is the base unit’s at each row’s worth, a Separate currency on a line of its own, a chip’s amount by its amount', J(tm([{ fid: 'f_coins', rowId: 'w_1', qty: 2 }, { fid: 'f_coins', rowId: 'w_2', qty: 4 }, { fid: 'f_coins', rowId: 'w_4', qty: 3 }, { fid: 'f_chips', rowId: 'w_c1', key: '@lvl', amt: 12.5 }]))
        === J([{ cur: '', label: 'Money', v: 34.5 }, { cur: 'C3', label: 'Tokens', v: 3 }]), J(tm([{ fid: 'f_coins', rowId: 'w_1', qty: 2 }, { fid: 'f_coins', rowId: 'w_2', qty: 4 }, { fid: 'f_coins', rowId: 'w_4', qty: 3 }, { fid: 'f_chips', rowId: 'w_c1', key: '@lvl', amt: 12.5 }])));
    check('what is no money, a row that is gone and an offer that is no list say nothing', J(tm([{ fid: 'f_odd', rowId: 'x', qty: 1 }, { fid: 'f_coins', rowId: 'nope', qty: 1 }])) === '[]' && J(tm('junk')) === '[]' && J(S.tradeMoney(S.cleanSystem({ v: 1, name: 'N', rolls: [], fields: [] }, { F, gmView: true }), mk(), [{ fid: 'f_coins', rowId: 'w_1', qty: 1 }])) === '[]');
    const nt = read('scripts/net.js'), tw = read('scripts/trade.js');
    check('the host puts it on each side of the view only where there is some, the player’s app keeps it as words and numbers, and the window draws a line each', nt.includes("mo = S && S.tradeMoney && sys && ch ? S.tradeMoney(sys, ch, off) : []; if (mo.length) o.money = mo;") && nt.includes("if (mon.length) out.money = mon;")
        && tw.includes("(s.money || []).forEach(function(m) { col.appendChild(twEl(doc, 'div', 'trade-total trade-money', m.label + ' offered: ' + twNum(m.v))); });"));
    // a trader's accepted currencies (157 M1b part 3)
    check('a trader keeps the currencies it accepts, the base unit as *, each once, with nothing left no key', J(S.cleanTrader({ acc: ['*', 'C1', 'c1', '__proto__', 7, '1x', 'C3'] })) === J({ acc: ['*', 'C1', 'C3'] }) && S.cleanTrader({ acc: [] }) === null && S.cleanTrader('x') === null);
    const taker = (acc) => ({ name: 'Merchant', trader: acc ? { acc: acc } : undefined }), offT = [{ fid: 'f_coins', rowId: 'w_1', qty: 1 }, { fid: 'f_coins', rowId: 'w_4', qty: 2 }];
    check('money the taker does not accept is refused in words naming what it does, a row of a currency being that currency and any other money the base unit; nothing ticked is open', S.tradeAcceptSays(sy, mk(), offT, taker()) === '' && S.tradeAcceptSays(sy, mk(), offT, taker(['C1', 'C3'])) === ''
        && S.tradeAcceptSays(sy, mk(), offT, taker(['C1'])) === 'Merchant accepts only Crowns.' && S.tradeAcceptSays(sy, mk(), [{ fid: 'f_chips', rowId: 'w_c1', key: '@lvl', amt: 5 }], taker(['C1', '*'])) === '' && S.tradeAcceptSays(sy, mk(), [{ fid: 'f_chips', rowId: 'w_c1', key: '@lvl', amt: 5 }], taker(['C3'])) === 'Merchant accepts only Tokens.',
        J([S.tradeAcceptSays(sy, mk(), offT, taker(['C1']))]));
    const scC = read('scripts/systemcore.js');
    check('the terms are the GM’s alone on the character, set by whoever acts for a side, judged as money is put on and again at the confirm, and ticked in the window', scC.includes("if (opts && opts.state === 'host' && isObj(c.trader)) { var trC = cleanTrader(c.trader); if (trC) out.trader = trC; }")
        && nt.includes("var accW = S.tradeAcceptSays ? S.tradeAcceptSays(camp.system, chM, off, mine === 'a' ? cb : ca) : ''; if (accW) return { error: accW };") && nt.includes("if (msg.op === 'accepts') {") && nt.includes("if (Array.isArray(msg.acc)) qTr.acc = msg.acc.slice(0, 13);")
        && nt.includes("var accC = S.tradeAcceptSays ? S.tradeAcceptSays(camp.system, ca, tr2.offA, cb) || S.tradeAcceptSays(camp.system, cb, tr2.offB, ca) : '';") && tw.includes("act('acc', sd, keys);") && tw.includes("else if (kind === 'acc' && n.tradeAccepts) say(n.tradeAccepts(v.tid, arg, side));"));
    // a trader's buy and sell prices (157 M1c)
    check('a trader keeps a Buys at and a Sells at as a whole per cent from 0 to 1000 beside what it accepts', J(S.cleanTrader({ buy: 49.6, sell: 5000, acc: ['C1'] })) === J({ acc: ['C1'], buy: 50, sell: 1000 }) && J(S.cleanTrader({ buy: 'x', sell: NaN })) === 'null' && J(S.cleanTrader({ sell: 0 })) === J({ sell: 0 }));
    const RAW3 = Object.assign({}, RAW2, { trading: { rates: true, junk: 1 }, fields: RAW2.fields.map(f => f.id !== 'f_gear' ? f : Object.assign({}, f, { list: Object.assign({}, f.list, { stats: f.list.stats.concat([{ key: 'bp', label: 'Buy' }, { key: 'sp', label: 'Sell' }]), buyBy: 'BP', sellBy: 'pc', trade: true }) })) }),
        sy3 = S.cleanSystem(RAW3, { F, gmView: true }), pv3 = S.cleanSystem(RAW3, { F, gmView: false }), g3 = sy3.fields.filter(f => f.id === 'f_gear')[0].list;
    check('the system keeps its buy and sell rule as true alone, the same in both views, and a priced list a number stat each for an entry’s own Buy and Sell figures, spelled as it spells them; a choice is no figure',
        J(sy3.trading) === J({ rates: true }) && J(pv3.trading) === J(sy3.trading) && g3.buyBy === 'bp' && g3.sellBy === undefined && S.cleanSystem(Object.assign({}, RAW3, { trading: { rates: 'yes' } }), { F, gmView: true }).trading === undefined
        && S.cleanSystem(Object.assign({}, RAW3, { trading: undefined }), { F, gmView: true }).fields.filter(f => f.id === 'f_gear')[0].list.buyBy === undefined, J([sy3.trading, g3]));
    const seller = { name: 'Merchant', trader: { sell: 100, buy: 50 } }, plain = { name: 'Kael' }, e = (o) => Object.assign({ price: 20 }, o);
    check('what a line is worth: the giver’s Sells at, its entry’s own Sell figure first; else the taker’s Buys at, its entry’s own Buy figure first; none where neither trades, the rule is off or it comes to the list price',
        S.tradeDeal(sy3, seller, plain, e()) === null && S.tradeDeal(sy3, seller, plain, e({ sellAt: 25 })) === 25 && S.tradeDeal(sy3, plain, seller, e()) === 10 && S.tradeDeal(sy3, plain, seller, e({ buyAt: 7.5 })) === 7.5
        && S.tradeDeal(sy3, plain, plain, e()) === null && S.tradeDeal(sy, plain, seller, e()) === null && S.tradeDeal(sy3, { trader: { sell: 120 } }, seller, e()) === 24 && S.tradeDeal(sy3, plain, { trader: { buy: 33 } }, e({ price: 1 })) === 0.33,
        J([S.tradeDeal(sy3, plain, seller, e()), S.tradeDeal(sy3, { trader: { sell: 120 } }, seller, e())]));
    const ch3 = { values: { f_gear: [{ id: 'w_g', defId: 'i_bow', qty: 2 }] } }, sy3b = S.cleanSystem(Object.assign({}, RAW3, { items: RAW3.items.concat([{ id: 'i_bow', name: 'Bow', stats: { cr: 40, bp: 12 } }]) }), { F, gmView: true }), off3 = S.tradeOfferable(sy3b, ch3, 'gm').filter(x => x.rowId === 'w_g')[0];
    check('an offer carries its entry’s own Buy figure where it is set, and none it does not have', off3 && off3.price === 40 && off3.buyAt === 12 && off3.sellAt === undefined, J(off3));
    check('the host works a line’s worth out for who takes it, sends it and each side’s figures where the rule is on, a player’s app keeps them as numbers, and the window draws them, with boxes for whoever acts for a side',
        nt.includes("var dl = S.tradeDeal ? S.tradeDeal(sys, ch, other, e) : null; if (dl !== null) o.deal = dl;") && nt.includes("a: side(tr.a, ca, tr.offA, tr.okA, cb), b: side(tr.b, cb, tr.offB, tr.okB, ca) }") && nt.includes("if (msg.op === 'rates') {") && nt.includes("var dv = num(l.deal); if (dv !== null) o.deal = dv;")
        && tw.includes("'Worth at these prices: ' + twNum(dtot) + ' (list price ' + twNum(tot) + ')'") && tw.includes("ib.setAttribute('data-k', 'rate|' + sd + '|' + q[0]);") && tw.includes("else if (kind === 'rate' && n.tradeRates) say(n.tradeRates(v.tid, arg, side));"));
    // making change (157 M1d)
    const RAW5 = { v: 1, name: 'T', rolls: [], trading: { change: true }, fields: [
        { id: 'f_cn', key: 'Coins', label: 'Coins', kind: 'item-list', edit: 'owner', vis: 'all', list: { multi: true, trade: true, stats: [{ key: 'cr', label: 'Denom' }], money: 'cr' } },
        { id: 'f_gr', key: 'Gear', label: 'Gear', kind: 'item-list', edit: 'owner', vis: 'all', list: { multi: true, trade: true, stats: [{ key: 'cr', label: 'Cost' }], price: 'cr' } }],
        items: [{ id: 'i_c10', name: 'Ten', stats: { cr: 10 } }, { id: 'i_c5', name: 'Five', stats: { cr: 5 } }, { id: 'i_c1', name: 'One', stats: { cr: 1 } }, { id: 'i_bow', name: 'Bow', stats: { cr: 7 } }, { id: 'i_rope', name: 'Rope', stats: { cr: 3 } }, { id: 'i_odd', name: 'Odd' }] };
    const s5 = S.cleanSystem(RAW5, { F, gmView: true }), kael = { name: 'Kael', values: { f_cn: [{ id: 'w_t', defId: 'i_c10', qty: 2 }], f_gr: [{ id: 'w_r', defId: 'i_rope', qty: 1 }] } };
    const shop = coins => ({ name: 'Shop', values: { f_cn: coins, f_gr: [{ id: 'w_b', defId: 'i_bow', qty: 1 }, { id: 'w_o', defId: 'i_odd', qty: 1 }] } }), payTen = [{ fid: 'f_cn', rowId: 'w_t', qty: 1 }], bow = [{ fid: 'f_gr', rowId: 'w_b', qty: 1 }];
    check('making change is kept as true alone beside buy and sell prices', J(S.cleanSystem(Object.assign({}, RAW5, { trading: { change: 'yes', rates: true } }), { F, gmView: true }).trading) === J({ rates: true }) && J(s5.trading) === J({ change: true }));
    check('where money tips a trade the payer gives over, the other owes change it can give from money it holds and has not put down, exactly or not at all',
        J(S.tradeChange(s5, kael, payTen, shop([{ id: 'w_1', defId: 'i_c1', qty: 3 }]), bow)) === J({ payer: 'a', over: 3, can: true }) && J(S.tradeChange(s5, kael, payTen, shop([{ id: 'w_1', defId: 'i_c1', qty: 2 }]), bow)) === J({ payer: 'a', over: 3, can: false })
        && S.tradeChange(s5, kael, payTen, shop([{ id: 'w_5', defId: 'i_c5', qty: 4 }]), bow).can === false && S.tradeChange(s5, kael, payTen, shop([{ id: 'w_1', defId: 'i_c1', qty: 2 }, { id: 'w_5', defId: 'i_c5', qty: 1 }]), bow.concat([{ fid: 'f_cn', rowId: 'w_1', qty: 1 }])).can === false
        && J(S.tradeChange(s5, shop([{ id: 'w_1', defId: 'i_c1', qty: 3 }]), bow, kael, payTen)) === J({ payer: 'b', over: 3, can: true }), J(S.tradeChange(s5, kael, payTen, shop([{ id: 'w_1', defId: 'i_c1', qty: 2 }]), bow)));
    check('none where the sides are even, the rule is off, a line has no price, nothing but goods is given or the payer’s goods already outweigh all it gets',
        S.tradeChange(s5, kael, payTen, shop([{ id: 'w_1', defId: 'i_c1', qty: 3 }]), bow.concat([{ fid: 'f_cn', rowId: 'w_1', qty: 3 }])) === null && S.tradeChange(S.cleanSystem(Object.assign({}, RAW5, { trading: undefined }), { F, gmView: true }), kael, payTen, shop([]), bow) === null
        && S.tradeChange(s5, kael, payTen, shop([]), [{ fid: 'f_gr', rowId: 'w_o', qty: 1 }]) === null && S.tradeChange(s5, kael, [{ fid: 'f_gr', rowId: 'w_r', qty: 1 }], shop([]), []) === null && S.tradeChange(s5, kael, payTen.concat([{ fid: 'f_gr', rowId: 'w_r', qty: 1 }]), shop([]), []) === null);
    check('a chip gives any part of its amount, and a sum too large to work out is taken as one that can be given', S.changeCan(sy, mk(), [], 12.25) === true && S.changeCan(sy, { values: { f_chips: [{ id: 'w_c1', defId: 'i_chip', qty: 1, lvl: 30 }] } }, [{ fid: 'f_chips', rowId: 'w_c1', key: '@lvl', amt: 25 }], 6) === false && S.changeCan(sy, { values: { f_chips: [{ id: 'w_c1', defId: 'i_chip', qty: 1, lvl: 30 }] } }, [], 6) === true && S.changeCan(s5, { values: { f_cn: [{ id: 'x', defId: 'i_c5', qty: 1 }] } }, [], 1e9) === true);
    check('the host says the change owed or that it cannot be given, a player’s app keeps the words, the payer’s Confirm says it overpays, and the card says who kept it',
        nt.includes("' can\\u2019t give change for that: overpay by ' + cO + ', or offer smaller pieces.'") && nt.includes("' kept ' + chgC.over + ' over the price.'") && nt.includes("o.change = { payer: v.change.payer, over: ovN, say: txt(v.change.say, 300) };")
        && tw.includes("'Confirm, overpaying by ' + twNum(ovr)") && tw.includes("root.appendChild(twEl(doc, 'div', 'trade-change', v.change.say));"));
    // the sheet's Money line (157 M1)
    check('what a character holds is said in each currency it holds, in the system’s order and its own units, then In all in the base unit; none with no currency or no money', J(S.moneySummary(sy, mk())) === J({ fid: 'f_chips', parts: [{ label: 'Crowns', v: 3, sep: false }, { label: 'Marks', v: 14, sep: false }, { label: 'Tokens', v: 7, sep: true }, { label: 'In all', v: 67, all: true }] })
        && S.moneySummary(noCur, mk()) === null && S.moneySummary(sy, { values: {} }) === null && J(S.moneySummary(sy, { values: { f_coins: [{ id: 'w_4', defId: 'i_tk1', qty: 2 }] } })) === J({ fid: 'f_chips', parts: [{ label: 'Tokens', v: 2, sep: true }] }), J(S.moneySummary(sy, mk())));
    check('the sheet draws it once, under the first money list’s home placement, never in a tile’s drawer', read('scripts/sheets.js').includes("if ((!catT || catT.home) && !onOnly && typeof moneySumLine === 'function') moneySumLine(wrap, sysI, c, f);") && read('scripts/sheets.js').includes("if (!ms || ms.fid !== f.id || !ms.parts.length) return;"));
    // the editor
    const sh = read('scripts/sheets.js'), ix = read('index.html'), ui = read('scripts/sysui.js');
    check('the Rules tab has Money, a currency a row with its name, Worth and Separate, a key made once and never shown', ix.includes('<div id="sysMoney" data-topic="money"></div>') && ui.includes("['money', 'Money', 'The currencies money is counted in.']") && sh.includes("function renderCurrencies() {")
        && sh.includes("input('sys-cur-label field'") && sh.includes("numInput('sys-cur-worth'") && sh.includes("checkLabel('sys-cur-sep'") && sh.includes("draft.currencies.push({ key: 'C' + n, label: '', worth: 1 })") && sh.includes("    if (tab === 'rules') renderCurrencies();   // 157 M1"));
    check('a list that holds money picks its currency and a choice that names each row’s by name, only where the system names currencies', sh.includes('if (typeof curBoxes === \'function\') curBoxes(sb, sp); }   // 1.5.6 the Money box') && sh.includes("[['', 'The base unit']].concat(cs.map(function(c) { return [c.key, c.label || 'A currency']; }))")
        && sh.indexOf("c.indexOf('sys-list-curby') >= 0") > 0 && sh.indexOf("c.indexOf('sys-list-curby') >= 0") < sh.indexOf("c.indexOf('sys-list-cur') >= 0"));
    check('a price picks its currency beside the Price box, an ordinary one turned into the base unit and a Separate one named in the price box', sh.includes("if (sp.price && typeof curBoxes === 'function') curBoxes(sb, sp, true); if (sp.price && typeof rateBoxes === 'function') rateBoxes(sb, sp); }") && sh.indexOf("c.indexOf('sys-list-pcurby') >= 0") < sh.indexOf("c.indexOf('sys-list-pcur') >= 0")
        && sh.includes("if (pc && !pc.sep && typeof u === 'number') u = Math.round(u * pc.worth * 100) / 100;") && sh.includes("held: pcS ? moneyHeld(sys, c, pcS.key) : moneyHeld(sys, c), cur: pcS ? pcS.label : '' });") && sh.includes("'Held now: ' + fmt(o.held) + cw + '. '")
        && ix.includes('A price may be set in a currency by <b>Priced in</b>'));
    check('Help, both notes and CI say it', ix.includes('Your game may count money in <b>currencies</b>, named on the Rules tab&rsquo;s <b>Money</b>.') && readRoot('WHATSNEW.txt').includes("- Currencies: the Rules tab's Money names the currencies your game counts money") && read('assets/whatsnew.txt').includes("- Currencies: the Rules tab's Money names the currencies your game counts money")
        && readRoot('.github/workflows/checks.yml').includes('run: node tools/moneycheck.js'));
    summed = true; console.log(pass + ' passed, ' + fail + ' failed.'); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL      the suite stopped: ' + (e && e.stack || e)); process.exit(1); });
process.on('exit', () => { if (!summed) { console.log('FAIL      the suite did not finish'); process.exitCode = 1; } });

/* moneycore.js: a part of systemcore.js (docs/REFACTOR_SPLIT_PLAN.md, area 6, trade and money; split 2026-11-18 with no change in behavior).
   What it holds: a sheet's money. The currencies a system names (cleanCurrencies, moneyCurs), the lists that hold money and what each
   row is worth, moneyHeld and moneyMove by the site's own rules for money in and out, a list's price read from a column (priceColOf),
   what a trade's money is worth to each side (tradeMoney, rates, haggling, change and debts, the condition a row sells at) and a row
   op's price (rowOpMoney, which every caller of a row op stores). The trade itself is in tradecore.js; a group roll by its weakest
   member (groupweak) stands between the two in systemcore.js, as it always did. What a list roll's Then asks of the money before any
   die (moneyThen, moneyDue) stays in systemcore.js, beside applyAct.
   Why it looks this way: these lines stood in systemcore.js, and they still run exactly where they stood. systemcore.js calls
   moneyCore() at its line `// [split:moneycore.js]`, so the body below runs in the old order. The body keeps its lines at the left
   margin inside the install function, unchanged, so that every test that reads systemcore.js (through tools/srcjoin.js, which puts
   these lines back) sees the old file. The first lines import what the body uses of systemcore.js (live, so a value systemcore.js
   changes later is read as it is then); the last line hands back the names systemcore.js uses of it. Neither side may assign the
   other's names (tools/splitcheck.js holds it). Change the code here as if it still stood in systemcore.js. */
// [split:of systemcore.js]
import { FIELD_ID, LIMITS, ROLL_ID, TABLE_KEY, applyRowOp, clampNum, cleanChar, cleanNum, cutText, fieldById, fin, fmtNum, fontKnown, hasOwn, isObj, lower, makeResolver, map, nameFold, resolveAll, rollCheckAst, rowDef, rowIdOf, rowLvl, rowPaid, rowStat, spelledIn, statName, statOf, tableKeyOk, tradeOfferable, uid } from './systemcore.js';   // [split:glue]
export function moneyCore() {   // [split:glue]
// [split:body-start]
// [systemcheck:money-start]
// 1.5.6 buying and selling (docs/TRADE_PLAN.md B1 and B2; the site's own rules, its currency-transaction, as the site session gave them on
// 2026-10-24). A list with a Money box (spec.money) holds money: '@lvl', each row holds its level (a chip's stored amount, times its quantity),
// or the key of a number stat, each piece worth that stat (a bar's denomination, times its quantity). moneyHeld sums it; moneyMove adds or takes
// an amount by the site's rules: what comes in lands on the largest chip (with no chip in the list, a new one), or where no list holds chips in
// the fewest pieces; what goes out drains the smallest chips first, then breaks the largest pieces and hands the change back in the fewest pieces,
// and change no piece can hold goes onto a chip. A chip or a stack spent to nothing goes, as the site has it. Every Money box counts in the base
// unit, each row times its currency's worth (157 M1, below). A hidden row and a kept curse never count. Pure, on copies
// 157 M1 (the owner, 2026-11-03): a system may name currencies (sys.currencies), each worth so much of the base unit, the unit every price is
// written in. A Money box holds one (its list's cur) or reads each row's by a choice stat (curBy), a row whose choice names none counting in the
// list's own. A Separate currency (sep) never mixes: it is not counted in what a character holds, and never pays nor is paid an amount in the
// base unit. moneyHeld and moneyMove with a currency's key count in that currency's own units, its rows alone. With no currency every row is
// worth 1 and counts as it always did
var CUR_MAX = 12, DEVICE_ID = /^[A-Za-z0-9_-]{1,64}$/;
function cleanCurrencies(v) {
    var res = [], seen = map(); (Array.isArray(v) ? v : []).slice(0, CUR_MAX * 4).forEach(function(c) {
        if (res.length >= CUR_MAX || !isObj(c)) return; var key = tableKeyOk(c.key, TABLE_KEY); if (!key || seen[lower(key)]) return; seen[lower(key)] = 1;
        var w = typeof c.worth === 'number' && fin(c.worth) && c.worth > 0 ? Math.round(clampNum(c.worth, 1e-6, 1e9) * 1e6) / 1e6 : 1, o = { key: key, label: cutText(c.label, LIMITS.label) || key, worth: w || 1e-6 };
        if (c.sep === true) o.sep = true;
        if (c.kind === 'physical') { o.kind = 'physical'; if (typeof c.weight === 'number' && fin(c.weight) && c.weight > 0) o.weight = Math.round(clampNum(c.weight, 0, 1e6) * 1e4) / 1e4; }   // 157 M1k: what one of it weighs
        else if (c.kind === 'digital') { o.kind = 'digital'; if (typeof c.device === 'string' && DEVICE_ID.test(c.device)) { o.device = c.device; var dnm = cutText(c.deviceName, LIMITS.itemName); if (dnm) o.deviceName = dnm; } }   // 157 M1k: the device it needs
        res.push(o);
    });
    return res;
}
function moneyCurs(sys) { return isObj(sys) && Array.isArray(sys.currencies) ? sys.currencies.filter(function(c) { return isObj(c) && typeof c.key === 'string'; }) : []; }
function curPick(sys, spec, def, by, own) {   // a currency read from a choice of the row (by) naming it by its name or key, else the list's own (own), else null for the base unit
    var cs = moneyCurs(sys); if (!cs.length || !isObj(spec)) return null; var hit = null;
    if (typeof by === 'string' && by) { var nm = lower(statName(spec, def, by).trim()); if (nm) hit = cs.filter(function(c) { return lower(c.label) === nm || lower(c.key) === nm; })[0] || null; }
    if (!hit && typeof own === 'string' && own) hit = cs.filter(function(c) { return lower(c.key) === lower(own); })[0] || null;
    return hit;
}
function moneyCurOf(sys, b, def) { return curPick(sys, b.spec, def, b.spec.curBy, b.spec.cur); }   // the currency a row of a Money box holds
// 1.6.2, backlog 234 (asked by a build session: a limb priced at its wearer's size): a row's price read from the list's Price from column,
// worked out for that row on that sheet (the row need not be in the list yet); null where the list names none, no engine is handed in or
// the column gives no number of 0 or more, and the caller then reads the price stat as before
function priceColOf(sys, char, f, row, F) {
    var sp = isObj(f) && isObj(f.list) ? f.list : null; if (!sp || !sp.priceCol || !isObj(row) || !F || !rowDef(sys, row)) return null;   // a row this machine holds no definition for is priced by the stat (the review of 234: a library row on a player's app)
    try { var v = makeResolver(sys, isObj(char) ? char : { values: {} }, F).cell(f, row, sp.priceCol); return typeof v === 'number' && fin(v) && v >= 0 ? v : null; } catch (e) { return null; }
}
function priceCurOf(sys, spec, def) { return isObj(spec) && spec.price ? curPick(sys, spec, def, spec.priceCurBy, spec.priceCur) : null; }   // 157 M1b: the currency a row's price is set in: an ordinary one is worth so much of the base unit, a Separate one is paid from its own money alone
function moneyBoxes(sys) {
    return (isObj(sys) && Array.isArray(sys.fields) ? sys.fields : []).filter(function(f) { return isObj(f) && f.kind === 'item-list' && isObj(f.list) && typeof f.list.money === 'string' && f.list.money; })
        .map(function(f) { return { f: f, spec: f.list, chip: f.list.money === '@lvl' }; });
}
function moneyR(n) { return Math.round(n * 100) / 100; }
function moneyLive(r) { return isObj(r) && r.hid !== 1 && r.keptOn !== 1; }
function moneyRowVal(sys, b, r) {
    var rd = rowDef(sys, r); if (!rd || !isObj(rd.def)) return null;
    var q = clampNum(cleanNum(r.qty, 1) | 0, 0, LIMITS.maxQty), u = b.chip ? rowLvl(b.spec, r, rd.def) : rowStat(b.spec, rd.def, b.spec.money), cu = moneyCurOf(sys, b, rd.def);
    return fin(u) ? { unit: u, qty: q, val: u * q, w: cu ? cu.worth : 1, c: cu ? cu.key : '', sep: !!(cu && cu.sep) } : null;
}
// 157 M1k: whether a character carries an entry, named by its id or its key, a row of it on any item list that is not kept from sight; an owner's
// inline copy names it as src
function carriesEntry(sys, char, id) {
    if (!isObj(char) || !isObj(char.values) || typeof id !== 'string' || !id) return false;
    return (isObj(sys) && Array.isArray(sys.fields) ? sys.fields : []).some(function(f) { return isObj(f) && f.kind === 'item-list' && (Array.isArray(char.values[f.id]) ? char.values[f.id] : []).some(function(r) { if (!moneyLive(r)) return false; if (r.defId === id || (r.lnk === 1 && r.src === id)) return true; var rd = rowDef(sys, r); return !!rd && isObj(rd.def) && typeof rd.def.key === 'string' && lower(rd.def.key) === lower(id); }); });
}
// the words that stop a character paying or being paid in a digital currency it has no device for; '' where it may. Pure
function curDeviceSays(sys, char, curKey, paid) {
    var cu = curKey ? moneyCurs(sys).filter(function(c) { return lower(c.key) === lower(curKey); })[0] : null; if (!cu || cu.kind !== 'digital' || !cu.device || carriesEntry(sys, char, cu.device)) return '';
    var it = (isObj(sys) && Array.isArray(sys.items) ? sys.items : []).concat(isObj(sys) && Array.isArray(sys.core) ? sys.core : []).filter(function(x) { return isObj(x) && (x.id === cu.device || (typeof x.key === 'string' && lower(x.key) === lower(cu.device))); })[0], dn = it ? (it.vis !== 'gm' ? cutText(it.name, LIMITS.itemName) : '') : cu.deviceName || '';
    return (cutText(isObj(char) ? char.name : '', 60) || 'This character') + ' carries no ' + (dn || 'device') + ' to ' + (paid ? 'be paid' : 'pay') + ' in ' + cu.label + '.';
}
// 157 M1k: the weight of the physical money a character holds, each currency's units times what one of it weighs. Pure
function moneyWeight(sys, char) {
    var t = 0; if (!isObj(char)) return 0; var cs = map(); moneyCurs(sys).forEach(function(c) { if (c.kind === 'physical' && typeof c.weight === 'number') cs[lower(c.key)] = c.weight; });
    moneyBoxes(sys).forEach(function(b) { (isObj(char.values) && Array.isArray(char.values[b.f.id]) ? char.values[b.f.id] : []).forEach(function(r) { if (!moneyLive(r)) return; var v = moneyRowVal(sys, b, r); if (v && v.val > 0 && v.c && hasOwn(cs, lower(v.c))) t += v.val * cs[lower(v.c)]; }); });
    return Math.round(t * 1e4) / 1e4;
}
function moneyIn(v, cur) { return cur === undefined ? !v.sep : !!v.c && lower(v.c) === lower(cur); }   // what an amount may come from: the base unit's money, or one currency's own
function moneyHeld(sys, char, cur) {
    var t = 0; if (!isObj(char)) return 0;
    moneyBoxes(sys).forEach(function(b) { (isObj(char.values) && Array.isArray(char.values[b.f.id]) ? char.values[b.f.id] : []).forEach(function(r) { if (!moneyLive(r)) return; var v = moneyRowVal(sys, b, r); if (v && v.val > 0 && moneyIn(v, cur)) t += cur === undefined ? v.val * v.w : v.val; }); });
    return moneyR(t);
}
function moneyMove(sys, char, delta, cur) {
    var boxes = moneyBoxes(sys); if (!boxes.length || !isObj(char)) return { ok: false, reason: 'money', msg: 'This sheet keeps no money.' };
    if (typeof delta !== 'number' || !fin(delta) || Math.abs(delta) > LIMITS.statAbs) return { ok: false, reason: 'value', msg: 'That is not an amount.' };
    var curD = cur === undefined ? null : moneyCurs(sys).filter(function(c) { return lower(c.key) === lower(String(cur)); })[0] || null; if (cur !== undefined && !curD) return { ok: false, reason: 'value', msg: 'There is no such currency.' };
    if (Math.abs(delta) < 0.005) return { ok: true, values: {} };
    var vals = map(), listOf = function(fid) { if (!Object.prototype.hasOwnProperty.call(vals, fid)) vals[fid] = JSON.parse(JSON.stringify(isObj(char.values) && Array.isArray(char.values[fid]) ? char.values[fid] : [])); return vals[fid]; };
    var wt = function(v) { return cur === undefined ? v.w : 1; };   // what one of a row's units is worth in the amount's own unit
    var devNo = '', devOk = function(v) { var s = curDeviceSays(sys, char, v.c, delta > 0); if (s && !devNo) devNo = s; return !s; };   // 157 M1k: a digital currency moves only with its device
    var held = function(chip) { var out = []; boxes.forEach(function(b) { if (b.chip !== chip) return; listOf(b.f.id).forEach(function(r) { if (!moneyLive(r)) return; var v = moneyRowVal(sys, b, r); if (v && moneyIn(v, cur) && devOk(v)) out.push({ b: b, r: r, v: v, w: wt(v) }); }); }); return out; };
    var drop = function(b, r) { var l = listOf(b.f.id), i = l.indexOf(r); if (i >= 0) l.splice(i, 1); };
    var chipBox = boxes.filter(function(b) { if (!b.chip) return false; var bc = moneyCurOf(sys, b, {}); if (bc && !devOk({ c: bc.key })) return false; return cur === undefined ? !(bc && bc.sep) : !!bc && lower(bc.key) === lower(curD.key); })[0] || null, chipW = chipBox && cur === undefined ? (moneyCurOf(sys, chipBox, {}) || { worth: 1 }).worth : 1, err = null;
    var lvlSet = function(b, r, n) { var lv = b.spec.lvl || {}, st = lv.step > 0 ? lv.step : 0.01, x = Math.round(moneyR(n) / st) * st; x = Math.round(x * 1e6) / 1e6; if (lv.max !== undefined && x > lv.max + 1e-9) { err = { ok: false, reason: 'max', msg: 'That is more than a chip holds.' }; return; } r.lvl = x; };
    var gainChip = function(amt) {   // onto the largest chip; none in the list: a new one, named as the list's first category
        var cs = held(true).sort(function(a, z) { return z.v.val * z.w - a.v.val * a.w; });
        if (cs.length) { var c = cs[0], qn = c.v.qty || 1; lvlSet(c.b, c.r, c.v.unit + amt / c.w / qn); return; }
        if (!chipBox) { err = { ok: false, reason: devNo ? 'device' : 'change', msg: devNo || 'There is no way to hold that in whole pieces.' }; return; }
        var l = listOf(chipBox.f.id); if (l.filter(moneyLive).length >= LIMITS.carried) { err = { ok: false, reason: 'field', msg: 'A list there is full.' }; return; }
        var id = null; for (var i = 0; i < 50 && !id; i++) { var t = uid('w_'); if (!l.some(function(r) { return rowIdOf(r) === t; })) id = t; } if (!id) { err = { ok: false, reason: 'field', msg: 'A list there is full.' }; return; }
        var nm = (Array.isArray(chipBox.spec.cats) && chipBox.spec.cats[0]) || chipBox.f.label || 'Chip', nr = { id: id, def: { name: cutText(nm, LIMITS.itemName) || 'Chip' }, qty: 1, lvl: 0 };
        if (Array.isArray(chipBox.spec.cats) && chipBox.spec.cats[0]) nr.def.category = chipBox.spec.cats[0];
        if (isObj(chipBox.spec.on)) nr.on = false; l.push(nr); lvlSet(chipBox, nr, amt / chipW);
    };
    var gainPieces = function(amt) {   // in the fewest pieces of the worths the sheet already holds; what none can hold is handed back
        var ps = held(false), byU = map(); ps.forEach(function(p) { var ub = p.v.unit * p.w; if (ub > 0 && !byU[ub]) byU[ub] = p; });
        Object.keys(byU).map(Number).sort(function(a, z) { return z - a; }).forEach(function(u) { var n = Math.floor((amt + 1e-9) / u); if (n > 0) { var p = byU[u]; p.r.qty = clampNum((p.r.qty | 0) + n, 1, LIMITS.maxQty); amt = moneyR(amt - n * u); } });
        return amt;
    };
    if (delta > 0) {
        if (chipBox) gainChip(delta); else { var left = gainPieces(delta); if (left > 0.005) err = { ok: false, reason: devNo ? 'device' : 'change', msg: devNo || 'There is no way to hold that in whole pieces.' }; }
    } else {
        var need = moneyR(-delta), have = moneyR(held(true).concat(held(false)).reduce(function(s, p) { return s + p.v.val * p.w; }, 0));   // 157 M1k: what it may pay with
        if (have + 0.005 < need) return devNo ? { ok: false, reason: 'device', msg: devNo } : { ok: false, reason: 'money', msg: 'Not enough ' + (curD ? curD.label : 'money') + ': ' + fmtNum(have) + ' held, ' + fmtNum(need) + ' needed.' };
        held(true).sort(function(a, z) { return a.v.val * a.w - z.v.val * z.w; }).forEach(function(c) {   // the smallest chips first
            if (need <= 0.005 || err) return; var qn = c.v.qty || 1, cv = c.v.val * c.w;
            if (cv >= need - 1e-9) { lvlSet(c.b, c.r, c.v.unit - need / c.w / qn); need = 0; if (!err && !(c.r.lvl > 0.005)) drop(c.b, c.r); }
            else { need = moneyR(need - cv); drop(c.b, c.r); }
        });
        held(false).sort(function(a, z) { return z.v.unit * z.w - a.v.unit * a.w; }).forEach(function(p) {   // then the largest pieces, broken, the change handed back
            var ub = p.v.unit * p.w, pv = p.v.val * p.w;
            if (need <= 0.005 || err || !(ub > 0)) return;
            if (pv >= need - 1e-9) {
                var take = Math.ceil(need / ub - 1e-9), over = moneyR(take * ub - need); need = 0;
                p.r.qty = (p.r.qty | 0) - take; if (!(p.r.qty > 0)) drop(p.b, p.r);
                if (over > 0.005) { var back = gainPieces(over); if (back > 0.005) gainChip(back); }
            } else { need = moneyR(need - pv); drop(p.b, p.r); }
        });
        if (!err && need > 0.005) err = { ok: false, reason: 'money', msg: 'Not enough ' + (curD ? curD.label : 'money') + '.' };
    }
    if (err) return err;
    var plain = {}; Object.keys(vals).forEach(function(k) { plain[k] = vals[k]; });
    return { ok: true, values: plain };
}
// 157 M1b: the money one side of a trade has on offer, from its own rows: the base unit's (a row in an ordinary currency at its worth) as one figure,
// and each Separate currency's on a line of its own in its own units. A whole row counts its pieces, an amount of a chip's level or of a bar's worth its
// amount; a row that is no money, kept out of sight or gone counts nothing. Pure
function tradeMoneyEach(sys, ch, off, fn) {   // each line of an offer that is money: fn(line, its row's money value, the units it gives)
    var boxes = moneyBoxes(sys); if (!boxes.length) return;
    (Array.isArray(off) ? off : []).forEach(function(l) {
        if (!isObj(l)) return; var b = boxes.filter(function(x) { return x.f.id === l.fid; })[0]; if (!b) return;
        var r = (isObj(ch) && isObj(ch.values) && Array.isArray(ch.values[l.fid]) ? ch.values[l.fid] : []).filter(function(x) { return rowIdOf(x) === l.rowId; })[0]; if (!r || !moneyLive(r)) return;
        var v = moneyRowVal(sys, b, r); if (!v) return;
        var units = l.key === undefined ? v.unit * clampNum(cleanNum(l.qty, 1) | 0, 0, LIMITS.maxQty) : (l.key === (b.chip ? '@lvl' : b.spec.money) && typeof l.amt === 'number' && fin(l.amt) ? l.amt : null);
        if (units === null || !(units > 0)) return;
        fn(l, v, units);
    });
}
function tradeMoney(sys, ch, off) {
    var base = 0, any = false, seps = [], sepAt = map();
    tradeMoneyEach(sys, ch, off, function(l, v, units) {
        if (v.sep) { if (!sepAt[v.c]) { var cu = moneyCurs(sys).filter(function(c) { return lower(c.key) === lower(v.c); })[0]; sepAt[v.c] = { cur: v.c, label: cu ? cu.label : v.c, v: 0 }; seps.push(sepAt[v.c]); } sepAt[v.c].v += units; }
        else { base += units * v.w; any = true; }
    });
    var out = []; if (any) out.push({ cur: '', label: 'Money', v: moneyR(base) }); seps.forEach(function(s) { s.v = moneyR(s.v); out.push(s); });
    return out;
}
// 157 M1b (the owner, 2026-11-03, by prompt: "Trade window side (Recommended)"): a trader's own terms, kept on its character for the GM alone (cleanChar
// under state host): acc, the currencies it accepts, '*' the base unit, by key; none ticked is open, and the other side decides as it confirms
// 157 M1i: haggling, an extra the system switches on: { roll, step, most }, the system roll both sides roll, how many per cent each point of difference
// between their margins moves the prices, and the most they may move either way. Pure
// 157 M1j: whether a row is stolen or illegal, where the system's trading switches it on: the GM's mark on the row first, else its list's stat, read as
// its value name (one that says illegal is Illegal, any other Stolen) or as a number that is not 0. '' for neither. Pure
function hotOf(sys, spec, def, r) {
    if (!(isObj(sys) && isObj(sys.trading) && sys.trading.hot === true)) return ''; if (isObj(r) && (r.hot === 'stolen' || r.hot === 'illegal')) return r.hot;
    if (!isObj(spec) || typeof spec.hot !== 'string' || !isObj(def)) return ''; var nm = statName(spec, def, spec.hot); if (nm) return /illegal/i.test(nm) ? 'illegal' : /^(no|none|clean|legal)$/i.test(nm.trim()) ? '' : 'stolen';
    var v = rowStat(spec, def, spec.hot); return typeof v === 'number' && fin(v) && v !== 0 ? 'stolen' : v === true ? 'stolen' : '';
}
// 157 M1k: the words that refuse a trade where money in a digital currency is put down by a side, or for a side, that carries no device for it. Pure
function tradeDeviceSays(sys, giver, off, taker) {
    var said = ''; tradeMoneyEach(sys, giver, off, function(l, v) { if (said || !v.c) return; said = curDeviceSays(sys, giver, v.c, false) || curDeviceSays(sys, taker, v.c, true); }); return said;
}
// the words that refuse a trade where one side puts down what is stolen or illegal and the other is no fence; '' where nothing stops it. Pure
function tradeHotSays(sys, giver, off, taker) {
    if (!(isObj(sys) && isObj(sys.trading) && sys.trading.hot === true) || (isObj(taker) && isObj(taker.trader) && taker.trader.fence === true)) return ''; var can = map();
    tradeOfferable(sys, giver, 'gm').forEach(function(e) { can[e.fid + '|' + e.rowId] = e; });
    var bad = (Array.isArray(off) ? off : []).map(function(l) { return isObj(l) ? can[l.fid + '|' + l.rowId] : null; }).filter(function(e) { return e && e.hot; })[0];
    return bad ? (cutText(isObj(taker) ? taker.name : '', 60) || 'The other side') + ' is no fence and will not take ' + bad.name + ', which is ' + (bad.hot === 'illegal' ? 'illegal' : 'stolen') + '.' : '';
}
function cleanHaggle(h) {
    if (!isObj(h) || typeof h.roll !== 'string' || !ROLL_ID.test(h.roll)) return null; var n = function(x, d, lo, hi) { return typeof x === 'number' && fin(x) ? clampNum(Math.round(x * 10) / 10, lo, hi) : d; };
    return { roll: h.roll, step: n(h.step, 1, 0.1, 100), most: n(h.most, 20, 1, 100) };
}
// a side's haggling roll, worked out on the host with the engine's own dice: the system's roll on its own sheet, where its trader record names what it
// haggles at (a merchant the GM gives a figure) that figure in place of what the roll is compared with. The engine's result, or null. Pure but for its dice
function haggleRoll(sys, ch, F, rnd) {
    var hg = isObj(sys) && isObj(sys.trading) ? cleanHaggle(sys.trading.haggle) : null, r = hg && Array.isArray(sys.rolls) ? sys.rolls.filter(function(x) { return isObj(x) && x.id === hg.roll; })[0] : null;
    if (!r || typeof r.formula !== 'string' || !F || typeof F.evaluate !== 'function') return null; var fm = r.formula, at = isObj(ch) && isObj(ch.trader) && typeof ch.trader.hag === 'number' && fin(ch.trader.hag) ? ch.trader.hag : null;
    if (at !== null) { var ast = rollCheckAst(F, fm), rt = ast ? ast.body.r : null; if (!rt || typeof rt.pos !== 'number' || typeof rt.len !== 'number') return null; fm = fm.slice(0, rt.pos) + String(at) + fm.slice(rt.pos + rt.len); }
    var vars = null; try { vars = resolveAll(sys, ch, F).vars; } catch (e) { return null; }
    var res = F.evaluate(fm, rnd ? { vars: vars, random: rnd } : { vars: vars }); return res && res.ok ? res : null;
}
function cleanTrader(t) {
    if (!isObj(t)) return null; var o = {}, seen = map(), acc = [];
    (Array.isArray(t.acc) ? t.acc.slice(0, CUR_MAX * 4) : []).forEach(function(k) { var key = k === '*' ? '*' : tableKeyOk(k, TABLE_KEY); if (key && !seen[lower(key)] && acc.length <= CUR_MAX) { seen[lower(key)] = 1; acc.push(key); } });
    if (acc.length) o.acc = acc;
    ['buy', 'sell'].forEach(function(k) { if (typeof t[k] === 'number' && fin(t[k])) o[k] = clampNum(Math.round(t[k]), 0, 1000); });   // 157 M1c
    if (typeof t.hag === 'number' && fin(t.hag)) o.hag = clampNum(Math.round(t.hag), 0, 999);   // 157 M1i: what a merchant haggles at
    if (t.fence === true) { o.fence = true; if (typeof t.fenceAt === 'number' && fin(t.fenceAt)) o.fenceAt = clampNum(Math.round(t.fenceAt), 0, 1000); }   // 157 M1j: a fence, and what it buys the stolen and illegal at
    if (isObj(t.xr)) { var xr = map(), xn = 0; Object.keys(t.xr).slice(0, CUR_MAX * 4).forEach(function(k) { var key = tableKeyOk(k, TABLE_KEY), r = t.xr[k]; if (!key || xn >= CUR_MAX || typeof r !== 'number' || !fin(r) || hasOwn(xr, key)) return; xr[key] = clampNum(Math.round(r), 0, 1000); xn++; }); if (xn) o.xr = xr; }   // 157 M1e: what it takes each currency at, a whole per cent of its worth: Buys at and Sells at, a whole per cent of list price
    return Object.keys(o).length ? o : null;
}
// 157 M1c: a trader's buy and sell prices, an extra the system switches on (trading.rates, true only, the same in both views)
function cleanTrading(v) { if (!isObj(v)) return null; var o = {}; if (v.rates === true) o.rates = true; if (v.change === true) o.change = true; if (v.exchange === true) o.exchange = true; var hg = cleanHaggle(v.haggle); if (hg) o.haggle = hg; if (v.hot === true) o.hot = true; return Object.keys(o).length ? o : null; }   // change: 157 M1d; exchange: 157 M1e
// 157 M1e: what a taker counts one of a currency at, as a share of its worth: its own rate where exchange rates are on and it set one; an ordinary
// currency else whole; a Separate one else null, as it never mixes unless a trader offers to take it so. Pure
function tradeRateOf(sys, taker, cur) {
    var on = isObj(sys) && isObj(sys.trading) && sys.trading.exchange === true, xr = on && isObj(taker) && isObj(taker.trader) && isObj(taker.trader.xr) ? taker.trader.xr : null, cu = cur ? moneyCurs(sys).filter(function(c) { return lower(c.key) === lower(cur); })[0] : null;
    var r = null; if (xr && cu) Object.keys(xr).forEach(function(k) { if (lower(k) === lower(cu.key)) r = xr[k] / 100; });
    return r !== null ? r : cu && cu.sep ? null : 1;
}
// the money one side offers, in the base unit at what the taker counts it at; null where none is offered. Pure
function tradeMoneyAt(sys, giver, off, taker) {
    var t = 0, any = false; tradeMoneyEach(sys, giver, off, function(l, v, units) { var r = tradeRateOf(sys, taker, v.c); if (r === null) return; t += units * v.w * r; any = true; });
    return any ? moneyR(t) : null;
}
function tradeRatesOn(sys) { return isObj(sys) && isObj(sys.trading) && sys.trading.rates === true; }
// what one of a line on offer is worth in this trade: where the giver Sells at a per cent, the entry's own Sell figure else that per cent of its list price;
// else where the taker Buys at one, the entry's own Buy figure else that per cent. null where neither has one, the rule is off, or it comes to the list
// price. Only what the trade window shows: a barter moves what both sides confirm, whatever it is said to be worth. Pure
function tradeDeal(sys, giver, taker, e, hag) {   // hag (157 M1i): the per cent this trade's haggling moved prices toward the giver
    if (!isObj(e) || typeof e.price !== 'number') return null;
    var gt = isObj(giver) && isObj(giver.trader) ? giver.trader : {}, tt = isObj(taker) && isObj(taker.trader) ? taker.trader : {}, u = null;
    if (e.hot && tt.fence === true && typeof tt.fenceAt === 'number') u = e.price * tt.fenceAt / 100;   // 157 M1j: what a fence pays
    else if (tradeRatesOn(sys)) { if (typeof gt.sell === 'number') u = typeof e.sellAt === 'number' ? e.sellAt : e.price * gt.sell / 100;
    else if (typeof tt.buy === 'number') u = typeof e.buyAt === 'number' ? e.buyAt : e.price * tt.buy / 100; }
    if (typeof hag === 'number' && fin(hag) && hag) u = (u === null ? e.price : u) * (1 + clampNum(hag, -100, 100) / 100);
    if (u === null) return null; u = moneyR(u); return u === e.price ? null : u;
}
// 157 M1d: making change, an extra the system switches on (trading.change). Where one side gives more than it gets, by list price or this trade's
// prices, and money is what tips it, the other owes change: changeCan says whether it can give that much exactly from the base unit's money it holds
// and has not put on the table (a chip's amount any part of it, a piece whole). A sum too large to work out is taken as one it can give. Pure
function changeCan(sys, ch, off, over) {
    var T = Math.round(over * 100); if (!(T > 0)) return true; var used = map(), chips = 0, coins = [];
    (Array.isArray(off) ? off : []).forEach(function(l) { if (!isObj(l) || typeof l.fid !== 'string' || typeof l.rowId !== 'string') return; var k = l.fid + '|' + l.rowId, u = used[k] || (used[k] = { q: 0, a: 0 }); if (l.key === undefined) u.q += clampNum(cleanNum(l.qty, 1) | 0, 0, LIMITS.maxQty); else if (typeof l.amt === 'number' && fin(l.amt)) u.a += l.amt; });
    moneyBoxes(sys).forEach(function(b) { (isObj(ch) && isObj(ch.values) && Array.isArray(ch.values[b.f.id]) ? ch.values[b.f.id] : []).forEach(function(r) {
        if (!moneyLive(r)) return; var v = moneyRowVal(sys, b, r); if (!v || v.sep || !(v.unit > 0)) return; var u = used[b.f.id + '|' + rowIdOf(r)] || { q: 0, a: 0 }, q = Math.max(0, v.qty - u.q);
        if (b.chip) chips += Math.max(0, Math.round((v.unit * q - u.a) * v.w * 100)); else if (q > 0) coins.push([Math.round(v.unit * v.w * 100), q]);
    }); });
    if (chips >= T) return true; coins = coins.filter(function(c) { return c[0] > 0; }); if (!coins.length) return false;
    var gcd = function(x, y) { while (y) { var t = y; y = x % y; x = t; } return x; }, g = chips > 0 ? 1 : coins.reduce(function(x, c) { return gcd(x, c[0]); }, 0);
    if (T % g) return false; var N = T / g; if (N > 200000) return true; var bits = new Uint8Array(N + 1); bits[0] = 1;
    coins.forEach(function(c) { var cv = c[0] / g, left = c[1]; for (var k = 1; left > 0; k *= 2) { var take = Math.min(k, left), val = cv * take; left -= take; if (val > N) continue; for (var s = N; s >= val; s--) if (bits[s - val]) bits[s] = 1; } });
    var low = Math.max(0, N - Math.floor(chips / g)); for (var s2 = low; s2 <= N; s2++) if (bits[s2]) return true; return false;
}
// { payer: 'a' or 'b', over, can } where one side gives more than it gets and money tips it; null where the rule is off, the sides are even, a line has
// no price, a Separate currency is on the table, or what the payer gives besides money is already worth more than all it gets
function tradeChange(sys, chA, offA, chB, offB, hag) {   // hag (157 M1i): toward side a, as the trade keeps it
    if (!(isObj(sys) && isObj(sys.trading) && sys.trading.change === true)) return null;
    var side = function(ch, off, other, hg) {
        var can = map(), mon = map(), goods = 0, money = 0, bad = false, lk = function(l) { return l.fid + '|' + l.rowId + '|' + (l.key === undefined ? '' : l.key); };
        tradeOfferable(sys, ch, 'gm').forEach(function(e) { can[e.fid + '|' + e.rowId] = e; });
        tradeMoneyEach(sys, ch, off, function(l, v, units) { mon[lk(l)] = 1; var rt = tradeRateOf(sys, other, v.c); if (rt === null) bad = true; else money += units * v.w * rt; });   // 157 M1e: at what the taker counts it at
        (Array.isArray(off) ? off : []).forEach(function(l) { if (!isObj(l) || mon[lk(l)]) return; var e = can[l.fid + '|' + l.rowId]; if (!e || l.key !== undefined || typeof e.price !== 'number') { bad = true; return; } var d = tradeDeal(sys, ch, other, e, hg); goods += (d === null ? e.price : d) * clampNum(cleanNum(l.qty, 1) | 0, 0, LIMITS.maxQty); });
        return bad ? null : { goods: goods, money: money, all: goods + money };
    };
    var hN = typeof hag === 'number' && fin(hag) ? hag : 0, a = side(chA, offA, chB, hN), b = side(chB, offB, chA, -hN); if (!a || !b) return null;
    var d = moneyR(a.all - b.all); if (Math.abs(d) < 0.01) return null;
    var pa = d > 0, P = pa ? a : b, Q = pa ? b : a; if (!(P.money > 0) || P.goods >= Q.all) return null;
    var over = Math.abs(d); return { payer: pa ? 'a' : 'b', over: over, can: changeCan(sys, pa ? chB : chA, pa ? offB : offA, over) };
}
// 157 M1: what a character holds in each currency, for the sheet: { fid, parts } where fid is the first money list, parts each currency it holds any of
// in the system's order, in that currency's own units, then In all, the base unit's money at each currency's worth, where it holds any that is not
// Separate. null where the system names no currency, keeps no money or the character holds none. Pure
function moneySummary(sys, char) {
    var cs = moneyCurs(sys), boxes = moneyBoxes(sys); if (!cs.length || !boxes.length || !isObj(char)) return null;
    var own = map(), base = false, any = false;
    boxes.forEach(function(b) { (isObj(char.values) && Array.isArray(char.values[b.f.id]) ? char.values[b.f.id] : []).forEach(function(r) { if (!moneyLive(r)) return; var v = moneyRowVal(sys, b, r); if (!v || !(v.val > 0)) return; any = true; if (!v.sep) base = true; own[lower(v.c || '*')] = 1; }); });
    if (!any) return null; var parts = [];
    cs.forEach(function(c) { if (own[lower(c.key)]) parts.push({ label: cutText(c.label, 60) || c.key, v: moneyHeld(sys, char, c.key), sep: c.sep === true }); });
    if (base) parts.push({ label: 'In all', v: moneyHeld(sys, char), all: true });
    return { fid: boxes[0].f.id, parts: parts };
}
// 157 M2: the rule a Money box sets for a player's own change of its money: 'ask' or 'gm', or null where it sets none or the op moves no money (a switch,
// a split, a note). A purchase, a sale and a trade move money by their own rules, and the GM's hand is never judged. Pure
function moneyEditOf(sys, fieldId, q) {
    var f = typeof fieldId === 'string' ? fieldById(sys, fieldId) : null; if (!f || f.kind !== 'item-list' || !isObj(f.list) || !f.list.money || (f.list.moneyEdits !== 'ask' && f.list.moneyEdits !== 'gm') || !isObj(q)) return null;
    var moves = q.op === 'add' || q.op === 'remove' || q.op === 'setQty' || q.op === 'custom' || q.op === 'restore' || (q.op === 'set' && isObj(q.facts) && (q.facts.lvl !== undefined || q.facts.qty !== undefined));
    return moves ? f.list.moneyEdits : null;
}
// under 'ask', a typed amount (a chip's level) or count (a stack's quantity) as one line of the character's ask, a fact line the Review applies by the
// row's own op; anything else is refused in words. { ok, change } or { ok: false, reason, msg }. Pure
function moneyAsk(sys, char, fieldId, q) {
    var f = typeof fieldId === 'string' ? fieldById(sys, fieldId) : null; if (!f || !isObj(f.list) || !f.list.money || !isObj(q)) return { ok: false, reason: 'field' };
    var amt = q.op === 'set' && isObj(q.facts) && q.facts.lvl !== undefined && Object.keys(q.facts).length === 1 ? 'lvl' : q.op === 'setQty' ? 'qty' : null;
    if (!amt) return { ok: false, reason: 'money', msg: 'Ask your GM for that. Here you may ask for another amount or count, and it waits for their review.' };
    var rw = null; (isObj(char) && isObj(char.values) && Array.isArray(char.values[fieldId]) ? char.values[fieldId] : []).forEach(function(r) { if (!rw && isObj(r) && rowIdOf(r) === q.rowId) rw = r; });
    if (!rw || rw.hid === 1) return { ok: false, reason: 'missing' }; var rd = rowDef(sys, rw); if (!rd || !isObj(rd.def)) return { ok: false, reason: 'missing' };
    var from = amt === 'lvl' ? rowLvl(f.list, rw, rd.def) : clampNum(cleanNum(rw.qty, 1) | 0, 0, LIMITS.maxQty), to = amt === 'lvl' ? q.facts.lvl : q.qty;
    if (typeof to !== 'number' || !fin(to) || to < 0) return { ok: false, reason: 'value' }; if (to === from) return { ok: false, reason: 'same' };
    var lab = amt === 'lvl' ? (isObj(f.list.lvl) && f.list.lvl.label) || 'Amount' : 'Count';
    var ch = { kind: 'fact', f: fieldId, row: q.rowId, label: cutText((f.label || f.key) + ': ' + (rd.def.name || 'Money'), 120), from: lab + ' ' + fmtNum(from), to: lab + ' ' + fmtNum(to), accept: true };
    if (amt === 'lvl') ch.facts = { lvl: to }; else ch.qty = to;
    return { ok: true, change: ch };
}
// 157 M1: Money, the base unit's money a character holds (every currency but the Separate ones, at its worth), and Money.<currency>, that
// currency's own count, by its key or its name. A field, link or crew group keyed Money keeps the family. undefined where it names nothing. Pure
function moneyCurNamed(sys, w) { var k = nameFold(String(w || '')); if (!k) return null; return moneyCurs(sys).filter(function(c) { return nameFold(c.key) === k; })[0] || moneyCurs(sys).filter(function(c) { return nameFold(c.label) === k; })[0] || null; }
function moneyNamed(sys, char, l) {
    if (!moneyBoxes(sys).length) return undefined; if (l === 'money') return moneyHeld(sys, char);
    var cu = l.slice(0, 6) === 'money.' ? moneyCurNamed(sys, l.slice(6)) : null; return cu ? moneyHeld(sys, char, cu.key) : l === 'money.weight' ? moneyWeight(sys, char) : undefined;   // 157 M1k: Money.weight, the physical money's weight, where no currency is named weight
}
// 157 M1f: the share of full worth a row's condition leaves it, from its list's condition stat read as a per cent, 0 to 100; 1 where the list names
// none or the row's figure is no number. Pure
function condShare(spec, def) {
    if (!isObj(spec) || typeof spec.cond !== 'string' || !spec.cond || !isObj(def)) return 1; var st = statOf(spec, spec.cond), k = st ? st.key : spec.cond, ds = isObj(def.stats) ? def.stats : null, set = !!ds && (Object.prototype.hasOwnProperty.call(ds, k) || spelledIn(ds, lower(k)) !== undefined);
    if (!set && !(st && typeof st.def === 'number' && fin(st.def))) return 1;   // an entry that sets no figure, of a stat with no default, is in full condition
    var v = rowStat(spec, def, spec.cond);
    return typeof v === 'number' && fin(v) ? clampNum(v, 0, 100) / 100 : 1;
}
// 157 M1g: one list put back as it stood before a trade, row by row: a row the trade changed, took or brought is put back where the list still holds
// it as the trade left it (a row it took comes back where it is still gone, a row it brought goes where it is still as it came); a row changed since is
// left as it is, and named in missed by nameOf. Pure
function tradeUndoList(before, after, now, nameOf) {
    var B = Array.isArray(before) ? before : [], A = Array.isArray(after) ? after : [], N = Array.isArray(now) ? now : [], J = function(x) { return JSON.stringify(x === undefined ? null : x); };
    var by = function(L) { var m = map(); L.forEach(function(r) { var id = rowIdOf(r); if (id) m[id] = r; }); return m; }, bM = by(B), aM = by(A), nM = by(N), ids = [], seen = map(), put = map(), missed = [], out = [];
    var nm = function(r) { var s = typeof nameOf === 'function' ? nameOf(r) : ''; return s || (isObj(r) && isObj(r.def) && r.def.name) || (isObj(r) && isObj(r.snap) && r.snap.name) || 'a row'; };
    B.concat(A).forEach(function(r) { var id = rowIdOf(r); if (id && !seen[id]) { seen[id] = 1; ids.push(id); } });
    ids.forEach(function(id) { var b = bM[id], a = aM[id], n = nM[id]; if (J(b) === J(a)) return; if (J(n) === J(a)) put[id] = b || null; else missed.push(cutText(nm(b || a), 60)); });
    N.forEach(function(r) { var id = rowIdOf(r); if (id && hasOwn(put, id)) { if (put[id]) out.push(put[id]); delete put[id]; } else out.push(r); });
    B.forEach(function(r) { var id = rowIdOf(r); if (id && hasOwn(put, id) && put[id]) { out.push(put[id]); delete put[id]; } });
    return { list: out, missed: missed };
}
// 157 M1h: debts on a tab. A character's debts are one line a character it owes or is owed by: { with, name, v }, v how much it owes that one (below
// 0: that one owes it), in the base unit, 50 at most; none, no key. Both sheets keep their line, written together by debtPut. Pure
var DEBT_MAX = 50, DEBT_ID = /^[A-Za-z0-9_-]{1,64}$/;
// 1.6.2, backlog 35, a personal look (the owner, 2026-11-03, by prompt: "name, roll cards, and sheet text", set by "player, or GM, both can
// clear the other's changes"): the font a character's name is drawn in, one of Waypoint's own (fontKnown, never a computer's), and its color,
// a strict #rrggbb in lower case; the cleaned record, or null for none. Everyone who sees the name sees the look, so every copy keeps it
function cleanPlook(v) {
    if (!isObj(v)) return null; var o = {}, f = fontKnown(v.font); if (f) o.font = f;
    if (typeof v.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.color)) o.color = v.color.toLowerCase();
    return o.font || o.color ? o : null;
}
function cleanDebts(v) {
    var out = [], seen = map(); (Array.isArray(v) ? v.slice(0, DEBT_MAX * 2) : []).forEach(function(d) {
        if (!isObj(d) || typeof d.with !== 'string' || !DEBT_ID.test(d.with) || (d.with in Object.prototype) || seen[d.with] || out.length >= DEBT_MAX || typeof d.v !== 'number' || !fin(d.v)) return; var n = moneyR(clampNum(d.v, -1e9, 1e9)); if (!n) return;
        seen[d.with] = 1; out.push({ with: d.with, name: cutText(d.name, 60) || 'Someone', v: n });
    });
    return out.length ? out : null;
}
function debtOf(ch, otherId) { var d = (isObj(ch) && Array.isArray(ch.debts) ? ch.debts : []).filter(function(x) { return isObj(x) && x.with === otherId; })[0]; return d && typeof d.v === 'number' && fin(d.v) ? d.v : 0; }
function debtPut(a, b, v) {   // a owes b v (below 0: b owes a), on both sheets; 0 clears both lines
    if (!isObj(a) || !isObj(b) || typeof a.id !== 'string' || typeof b.id !== 'string' || a.id === b.id) return false; var n = typeof v === 'number' && fin(v) ? moneyR(clampNum(v, -1e9, 1e9)) : 0;
    [[a, b, n], [b, a, -n]].forEach(function(q) { var list = (Array.isArray(q[0].debts) ? q[0].debts : []).filter(function(x) { return isObj(x) && x.with !== q[1].id; }); if (q[2]) list.push({ with: q[1].id, name: cutText(q[1].name, 60) || 'Someone', v: q[2] }); var cl = cleanDebts(list); if (cl) q[0].debts = cl; else delete q[0].debts; });
    return true;
}
function curName(sys, k) { if (k === '*') return 'the base unit'; var cu = moneyCurs(sys).filter(function(c) { return lower(c.key) === lower(k); })[0]; return cu ? cu.label : String(k); }
// '' where the taker takes every money the giver offers, else the words: a row of a currency is that currency, any other money row the base unit
function tradeAcceptSays(sys, giver, off, taker) {
    var acc = isObj(taker) && isObj(taker.trader) && Array.isArray(taker.trader.acc) ? taker.trader.acc : []; if (!acc.length) return '';
    var ok = map(), bad = false; acc.forEach(function(k) { ok[lower(k)] = 1; });
    tradeMoneyEach(sys, giver, off, function(l, v) { if (!ok[lower(v.c || '*')]) bad = true; });
    return bad ? (cutText(taker.name, 60) || 'They') + ' accepts only ' + acc.map(function(k) { return curName(sys, k); }).join(', ') + '.' : '';
}
// what a row op paid or was paid moves the money with it, on the result of applyRowOp (res) for that op (q): q.pay on an add (the agreed total,
// taken by moneyMove, each unit's Paid stamped as that total over the units bought, averaged into a stack it joined), q.get on a remove or a
// lowered quantity (the agreed price, paid in). Answers { ok, values } with the row's list and every money list it moved, or a refusal
function rowOpMoney(sys, char, fieldId, q, res) {
    var vals = {}; if (!isObj(res) || !res.ok) return { ok: false, reason: 'value' }; vals[fieldId] = res.value;
    if (isObj(res.also)) Object.keys(res.also).forEach(function(k) { if (k !== fieldId && FIELD_ID.test(k)) vals[k] = res.also[k]; });   // 1.5.8 Loads from: the other list a load or an unload changed
    var amt = q && q.op === 'add' ? q.pay : q && (q.op === 'remove' || q.op === 'setQty') ? q.get : q && q.op === 'work' && isObj(q.work) && typeof res.fee === 'number' ? res.fee : undefined;   // 1.6.0, backlog 206: a work line's fee, paid (the Pay)
    if (typeof amt !== 'number' || !fin(amt) || amt < 0) return { ok: true, values: vals };
    if (q.op === 'work' && !moneyBoxes(sys).length) return { ok: true, values: vals };   // ... on a sheet that keeps money; one that keeps none has the fee written on the line alone
    if (q.op !== 'add' && q.op !== 'work') {   // a sale needs a quantity that went down
        var was = (isObj(char) && isObj(char.values) && Array.isArray(char.values[fieldId]) ? char.values[fieldId] : []).filter(function(r) { return rowIdOf(r) === q.rowId; })[0], now = (Array.isArray(res.value) ? res.value : []).filter(function(r) { return rowIdOf(r) === q.rowId; })[0];
        if (!was || (now ? (now.qty | 0) : 0) >= (was.qty | 0 || 1)) return { ok: true, values: vals };
    }
    var ch2 = { values: Object.assign({}, isObj(char) && isObj(char.values) ? char.values : {}) }; ch2.values[fieldId] = res.value;
    var pcF = fieldById(sys, fieldId), pcR = q.op === 'work' ? null : (q.op === 'add' ? (Array.isArray(res.value) ? res.value : []).filter(function(r) { return rowIdOf(r) === res.row; })[0] : (isObj(char) && isObj(char.values) && Array.isArray(char.values[fieldId]) ? char.values[fieldId] : []).filter(function(r) { return rowIdOf(r) === q.rowId; })[0]), pcD = pcR ? rowDef(sys, pcR) : null;
    var pcC = pcF && isObj(pcF.list) && pcD && isObj(pcD.def) ? priceCurOf(sys, pcF.list, pcD.def) : null, pcK = pcC && pcC.sep ? pcC.key : undefined;   // 157 M1b: a price set in a Separate currency is paid in it alone; any other price is the base unit's
    var mv = amt > 0 ? moneyMove(sys, ch2, q.op === 'add' || q.op === 'work' ? -amt : amt, pcK) : { ok: true, values: {} }; if (!mv.ok) return mv;
    Object.keys(mv.values).forEach(function(k) { vals[k] = mv.values[k]; });
    if (q.op === 'add' && typeof res.row === 'string' && res.added > 0) {
        var f = fieldById(sys, fieldId), spec = isObj(f && f.list) ? f.list : null;
        if (spec && spec.price) {
            var l = vals[fieldId] === res.value ? (vals[fieldId] = JSON.parse(JSON.stringify(res.value))) : vals[fieldId], r = l.filter(function(x) { return rowIdOf(x) === res.row; })[0];
            if (r) { var qn = r.qty | 0 || 1, old = qn - res.added, before = old > 0 ? rowPaid(spec, r, (rowDef(sys, r) || {}).def) : 0; r.paid = clampNum(moneyR((before * old + amt) / qn), 0, LIMITS.statAbs); }
        }
    }
    return { ok: true, values: vals };
}
// [systemcheck:money-end]
// [split:body-end]
return { CUR_MAX: CUR_MAX, DEBT_MAX: DEBT_MAX, carriesEntry: carriesEntry, changeCan: changeCan, cleanCurrencies: cleanCurrencies, cleanDebts: cleanDebts, cleanHaggle: cleanHaggle, cleanPlook: cleanPlook, cleanTrader: cleanTrader, cleanTrading: cleanTrading, condShare: condShare, curDeviceSays: curDeviceSays, debtOf: debtOf, debtPut: debtPut, haggleRoll: haggleRoll, hotOf: hotOf, moneyAsk: moneyAsk, moneyBoxes: moneyBoxes, moneyCurNamed: moneyCurNamed, moneyCurOf: moneyCurOf, moneyCurs: moneyCurs, moneyEditOf: moneyEditOf, moneyHeld: moneyHeld, moneyMove: moneyMove, moneyNamed: moneyNamed, moneyR: moneyR, moneySummary: moneySummary, moneyWeight: moneyWeight, priceColOf: priceColOf, priceCurOf: priceCurOf, rowOpMoney: rowOpMoney, tradeAcceptSays: tradeAcceptSays, tradeChange: tradeChange, tradeDeal: tradeDeal, tradeDeviceSays: tradeDeviceSays, tradeHotSays: tradeHotSays, tradeMoney: tradeMoney, tradeMoneyAt: tradeMoneyAt, tradeRateOf: tradeRateOf, tradeRatesOn: tradeRatesOn, tradeUndoList: tradeUndoList };   // [split:glue]
}   // [split:glue]

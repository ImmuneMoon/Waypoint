/* tradecore.js: a part of systemcore.js (docs/REFACTOR_SPLIT_PLAN.md, area 6, trade and money; split 2026-11-18 with no change in behavior).
   What it holds: the trade itself, pure and on copies. What a side may put on the table (tradeOfferable), an offer cleaned against
   it (cleanTradeOffer), where an amount lands on the receiver's side (tradeInto), the marks a row takes as it changes hands and the
   rolls a confirmed trade calls for (tradeMarks, tradeRolls), and tradeApply, which moves everything at once or nothing. Money (the
   sheet's money, buying and selling, a trade's money, rates, haggling and debts) is in moneycore.js; a group roll by its weakest member
   (groupweak) stands between the two in systemcore.js, as it always did. The host's side of a trade is in nettrade.js, a part
   of net.js.
   Why it looks this way: these lines stood in systemcore.js, and they still run exactly where they stood. systemcore.js calls
   tradeCore() at its line `// [split:tradecore.js]`, so the body below runs in the old order. The body keeps its lines at the left
   margin inside the install function, unchanged, so that every test that reads systemcore.js (through tools/srcjoin.js, which puts
   these lines back) sees the old file. The first lines import what the body uses of systemcore.js (live, so a value systemcore.js
   changes later is read as it is then); the last line hands back the names systemcore.js uses of it. Neither side may assign the
   other's names (tools/splitcheck.js holds it). Change the code here as if it still stood in systemcore.js. */
// [split:of systemcore.js]
import { LIMITS, RM_MODES, clampNum, cleanNum, condShare, cutText, fieldById, fin, fmtNum, grantOwn, hotOf, isObj, itemListIds, lower, map, moneyR, resolveAll, rollNeedsOk, rowDef, rowIdOf, rowLvl, rowOn, rowStat, uid } from './systemcore.js';   // [split:glue]
export function tradeCore() {   // [split:glue]
// [split:body-start]
// [systemcheck:trade-start]
// 1.5.6 trading (backlog 157; the owner, 2026-10-18: "a barter screen the gm/ players put items and/or money into on their side. both people
// trading see the other's offer and when both sides confirm, the trade is completed", and 2026-10-24: "using npcs as merchants with inventories of
// items they sell"). Pure: what a side may put on the table (tradeOfferable), an offer cleaned against it (cleanTradeOffer), and the trade itself,
// all or none, on copies (tradeApply). A row moves by its quantity, or a part of a figure ticked Split in trades (a list's level or a number stat)
// moves as an amount. Only what players may see is ever offered: a list players see and a row whose definition is not GM-only, on both sides,
// since the other side holds it afterwards. who 'player': only a list its owner may change (edit owner)
var TRADE_LINES = 400;
function tradeEntry(a, b) { if (!isObj(a) || !isObj(b)) return false; if (typeof a.defId === 'string') return a.defId === b.defId; return typeof b.defId !== 'string' && isObj(a.def) && isObj(b.def) && lower(a.def.name || '') === lower(b.def.name || ''); }
function tradeFields(sys, who) { return (isObj(sys) && Array.isArray(sys.fields) ? sys.fields : []).filter(function(f) { return isObj(f) && f.kind === 'item-list' && isObj(f.list) && f.list.trade === true && f.vis === 'all' && (who !== 'player' || f.edit === 'owner'); }); }   // only a list ticked Tradable
function tradeOfferable(sys, char, who) {
    var out = []; if (!isObj(sys) || !isObj(char)) return out;
    tradeFields(sys, who).forEach(function(f) {
        var spec = isObj(f.list) ? f.list : {}, rows = isObj(char.values) && Array.isArray(char.values[f.id]) ? char.values[f.id] : [];
        rows.forEach(function(r) {
            if (!isObj(r) || r.hid === 1) return; var rid = rowIdOf(r), rd = rowDef(sys, r); if (!rid || !rd || !isObj(rd.def) || rd.def.vis === 'gm') return;
            var q = clampNum(cleanNum(r.qty, 1) | 0, 1, LIMITS.maxQty), e = { fid: f.id, list: f.label || 'List', rowId: rid, name: cutText(rd.def.name, LIMITS.itemName) || 'Item', qty: q, split: [] };
            if (q === 1 && isObj(spec.lvl) && spec.lvl.split === true) e.split.push({ key: '@lvl', label: spec.lvl.label || 'Level', max: rowLvl(spec, r, rd.def), step: spec.lvl.step > 0 ? spec.lvl.step : 1 });
            if (q === 1) (Array.isArray(spec.stats) ? spec.stats : []).forEach(function(s) { if (isObj(s) && s.split === true && s.kind !== 'pick') e.split.push({ key: s.key, label: s.label || s.key, max: rowStat(spec, rd.def, s.key), step: 0.01 }); });
            var htW = hotOf(sys, spec, rd.def, r); if (htW) e.hot = htW;   // 157 M1j
            if (spec.price) { var pr = rowStat(spec, rd.def, spec.price), cdS = condShare(spec, rd.def); if (fin(pr) && pr !== 0) { e.price = moneyR(pr * cdS); if (cdS !== 1) e.cond = Math.round(cdS * 100); } [['buyBy', 'buyAt'], ['sellBy', 'sellAt']].forEach(function(q) { if (!spec[q[0]]) return; var bv = rowStat(spec, rd.def, spec[q[0]]); if (fin(bv) && bv > 0) e[q[1]] = moneyR(bv * cdS); }); }   // 157 M1c: an entry's own Buy and Sell figures, where set
            var kids = tradeCarry(sys, char.values, rid), gby = typeof r.gr === 'string' ? tradeRowAt(sys, char.values, r.gr) : null, kn = tradeKidsSeen(sys, kids);
            if (kn) { e.with = kn; e.name += ', with ' + kn + ' more'; }
            if (r.keptOn === 1) e.no = 'It cannot be taken off.';
            else if (gby) { var gd = rowDef(sys, gby); e.no = 'It came with ' + (gd && isObj(gd.def) && gd.def.vis !== 'gm' ? cutText(gd.def.name, LIMITS.itemName) || 'another row' : 'another row') + ', and goes with it.'; }
            else if (rowOn(spec, r) && RM_MODES[rd.def.eq] === 1 && who === 'player') e.no = 'It cannot be taken off while it is on.';
            else if (RM_MODES[rd.def.rm] === 1 && who === 'player') e.no = 'It cannot be given away.';
            else kids.forEach(function(k) { if (e.no) return; var kd = rowDef(sys, k.row), ks = tradeSpec(sys, k.f); if (k.row.keptOn === 1 || k.row.hid === 1) e.no = 'Something with it cannot be taken off.'; else if (who === 'player' && k.how === 'in' && kd && isObj(kd.def) && (RM_MODES[kd.def.rm] === 1 || (rowOn(ks, k.row) && RM_MODES[kd.def.eq] === 1))) e.no = 'Something with it cannot be given away.'; });
            out.push(e);
        });
    });
    return out;
}
// 1.6.0 (v2): what goes with a row that changes hands whole: the rows it granted (gr, B4) and the parts it holds (in, R14), and theirs in turn,
// as they stand, each found after the row it goes with; [{ f, row, by, how }], how 'gr' or 'in'. A granted row goes only with its granter
function tradeCarry(sys, values, rid) {
    var out = [], ids = map(), fids = itemListIds(sys), grew = true, n = 0; if (typeof rid !== 'string') return out; ids[rid] = 1;
    while (grew && n++ < 8 && out.length < LIMITS.carried) {
        grew = false; var add = [];
        fids.forEach(function(fid) { (isObj(values) && Array.isArray(values[fid]) ? values[fid] : []).forEach(function(r) {
            var id = rowIdOf(r); if (!isObj(r) || !id || ids[id] === 1) return;
            var how = typeof r.gr === 'string' && ids[r.gr] === 1 ? 'gr' : typeof r.in === 'string' && ids[r.in] === 1 ? 'in' : ''; if (how) add.push({ f: fid, row: r, by: r[how], how: how });
        }); });
        add.forEach(function(a) { if (ids[rowIdOf(a.row)] === 1) return; ids[rowIdOf(a.row)] = 1; out.push(a); grew = true; });
    }
    return out;
}
function tradeRowAt(sys, values, rid) { var hit = null; itemListIds(sys).forEach(function(fid) { (isObj(values) && Array.isArray(values[fid]) ? values[fid] : []).forEach(function(r) { if (!hit && isObj(r) && rowIdOf(r) === rid) hit = r; }); }); return hit; }
function tradeSpec(sys, fid) { var f = fieldById(sys, fid); return isObj(f && f.list) ? f.list : {}; }
function tradeKidsSeen(sys, kids) { return kids.filter(function(k) { var d = rowDef(sys, k.row); return k.row.hid !== 1 && !!(d && isObj(d.def)) && d.def.vis !== 'gm'; }).length; }   // what is said goes with it: never a GM-only entry
function tradeRound(n, step) { var s = step > 0 ? step : 0.01, x = Math.round(n / s) * s; return Math.round(x * 1e6) / 1e6; }
// an offer as the side may make it NOW: each line names a row tradeOfferable lists without a reason; qty a whole number 1..its quantity; amt a
// number above 0 and no more than the figure holds, on the figure's step; a row once by quantity, or once for each figure by amount, never both
function cleanTradeOffer(sys, char, offer, who) {
    var can = map(), out = [], used = map(); tradeOfferable(sys, char, who).forEach(function(e) { can[e.fid + '|' + e.rowId] = e; });
    (Array.isArray(offer) ? offer.slice(0, TRADE_LINES * 2) : []).forEach(function(l) {
        if (out.length >= TRADE_LINES || !isObj(l) || typeof l.fid !== 'string' || typeof l.rowId !== 'string') return;
        var k = l.fid + '|' + l.rowId, e = Object.prototype.hasOwnProperty.call(can, k) ? can[k] : null; if (!e || e.no) return;
        if (l.key === undefined) {
            var q = typeof l.qty === 'number' && fin(l.qty) ? Math.floor(l.qty) : NaN; if (!(q >= 1) || q > e.qty || used[k] || used[k + '|amt']) return;
            used[k] = 1; out.push({ fid: e.fid, rowId: e.rowId, qty: q });
        } else {
            var sp = null; e.split.forEach(function(s) { if (!sp && typeof l.key === 'string' && lower(s.key) === lower(l.key)) sp = s; }); if (!sp || used[k] || used[k + '|' + lower(sp.key)]) return;
            var a = typeof l.amt === 'number' && fin(l.amt) ? tradeRound(l.amt, sp.step) : NaN; if (!(a > 0) || a > sp.max + 1e-9) return;
            used[k + '|amt'] = 1; used[k + '|' + lower(sp.key)] = 1; out.push({ fid: e.fid, rowId: e.rowId, key: sp.key, amt: a });
        }
    });
    return out;
}
// 1.5.6, the receiver picks a chip (docs/TRADE_PLAN.md: "The receiver picks a chip (Recommended)", the first by default): the rows of the
// receiver's own list an amount of key from the giver's row like may land on. A level (a chip's money) any row of that list of quantity 1, a stat
// only a row of the same entry; never a hidden row, a kept curse or a GM-only entry. [{ rowId, name, cur }], 40 at most
function tradeInto(sys, char, fid, key, like) {
    var f = fieldById(sys, fid), spec = isObj(f && f.list) ? f.list : null, out = []; if (!spec || !isObj(char) || typeof key !== 'string') return out;
    var isL = key === '@lvl'; if (isL && !isObj(spec.lvl)) return out;
    (isObj(char.values) && Array.isArray(char.values[fid]) ? char.values[fid] : []).forEach(function(r) {
        if (out.length >= TRADE_LINES || !isObj(r) || r.hid === 1 || r.keptOn === 1 || (r.qty | 0 || 1) !== 1) return; var rid = rowIdOf(r), rd = rowDef(sys, r); if (!rid || !rd || !isObj(rd.def) || rd.def.vis === 'gm') return;
        if (!isL && !tradeEntry(r, like)) return;
        out.push({ rowId: rid, name: cutText(rd.def.name, LIMITS.itemName) || 'Item', cur: isL ? rowLvl(spec, r, rd.def) : rowStat(spec, rd.def, key) });
    });
    return out;
}
function tradeNewId(list) { for (var i = 0; i < 50; i++) { var id = uid('w_'); if (!list.some(function(r) { return rowIdOf(r) === id; })) return id; } return null; }
// the trade, all or none, on copies of both sides' lists. offA is what A gives, offB what B gives, each as cleanTradeOffer gave it when it was put
// on the table: cleaned again against both characters as they are now, and a line that no longer holds refuses the whole trade
// 1.6.2: a row's stats as it changes hands, by its list's When traded
function tradeMarks(spec, def, row) {
    if (!isObj(spec) || !Array.isArray(spec.onTrade) || !isObj(def)) return; var put = function(k, n) { if (typeof row.defId === 'string') { row.ov = isObj(row.ov) ? row.ov : {}; row.ov.stats = isObj(row.ov.stats) ? row.ov.stats : {}; row.ov.stats[k] = n; } else if (isObj(row.def)) { row.def.stats = isObj(row.def.stats) ? row.def.stats : {}; row.def.stats[k] = n; } };
    spec.onTrade.forEach(function(t) { var was = rowStat(spec, def, t.s), n = typeof was === 'number' && fin(was) ? was : 0; if (typeof t.to === 'string') { if (!n) return; put(t.to, n); put(t.s, 0); } else { var nv = typeof t.v === 'number' ? t.v : 0; if (nv !== n) put(t.s, nv); } });
}
// 1.6.2: the rolls a trade calls for: each row going whole whose list names a roll and whose row meets its Only where, on its giver's sheet. The GM's to see, and it changes nothing of the trade
function tradeRolls(sys, ch, off, F, tctx) {
    var res = []; if (!isObj(sys) || !isObj(ch) || !Array.isArray(off) || !F) return res; var vars = null;
    off.forEach(function(l) {
        if (!isObj(l) || l.key !== undefined) return; var f = fieldById(sys, l.fid), sp = isObj(f && f.list) ? f.list : null, tr = sp && isObj(sp.tradeRoll) ? sp.tradeRoll : null, rl = tr && Array.isArray(sp.rolls) ? sp.rolls[tr.i] : null; if (!rl || typeof rl.formula !== 'string' || Array.isArray(rl.apply)) return;
        vars = vars || resolveAll(sys, ch, F, tctx).vars; var rv = vars && typeof vars.row === 'function' ? vars.row(l.fid, l.rowId) : null; if (!rv || (tr['if'] && !rollNeedsOk({ needs: tr['if'] }, rv, F))) return;
        res.push({ charId: ch.id, f: l.fid, r: l.rowId, i: tr.i, formula: rl.formula, label: rl.label || 'Trade' });
    });
    return res;
}
function tradeApply(sys, a, b, offA, offB, whoA, whoB, into) {   // into { a: { fid: rowId | '+' }, b: ... }: where what each side receives lands, its own pick; '+' a row of its own
    var ca = cleanTradeOffer(sys, a, offA, whoA), cb = cleanTradeOffer(sys, b, offB, whoB);
    var same = function(x, y) { return JSON.stringify(x) === JSON.stringify(Array.isArray(y) ? y : []); };
    if (!same(ca, offA) || !same(cb, offB)) return { ok: false, reason: 'changed', msg: 'Something on the table changed. Look again and confirm.' };
    if (!ca.length && !cb.length) return { ok: false, reason: 'empty', msg: 'Nothing is on the table.' };
    var vals = { a: map(), b: map() }, lines = { a: [], b: [] }, err = null;
    var listOf = function(side, ch, fid) { if (!Object.prototype.hasOwnProperty.call(vals[side], fid)) vals[side][fid] = JSON.parse(JSON.stringify(isObj(ch.values) && Array.isArray(ch.values[fid]) ? ch.values[fid] : [])); return vals[side][fid]; };
    var at = function(list, rid) { for (var i = 0; i < list.length; i++) if (rowIdOf(list[i]) === rid) return i; return -1; };
    // each side's lines are taken off the giver first, all of them, so that what one side receives never feeds what it gives
    var moving = { a: [], b: [] }, gone = { a: map(), b: map() };
    var seenOf = function(side, ch) { var v = map(); itemListIds(sys).forEach(function(fid) { v[fid] = Object.prototype.hasOwnProperty.call(vals[side], fid) ? vals[side][fid] : isObj(ch.values) && Array.isArray(ch.values[fid]) ? ch.values[fid] : []; }); return v; };
    [['a', a, ca], ['b', b, cb]].forEach(function(s) {
        s[2].forEach(function(l) {
            if (err || gone[s[0]][l.rowId] === 1) return;   // 1.6.0: a part already gone with its host
            var f = fieldById(sys, l.fid), spec = isObj(f && f.list) ? f.list : {}, list = listOf(s[0], s[1], l.fid), i = at(list, l.rowId); if (i < 0) { err = 'changed'; return; }
            var r = list[i], rd = rowDef(sys, r), nm = (rd && rd.def && rd.def.name) || 'Item';
            if (l.key === undefined) {
                var mv = JSON.parse(JSON.stringify(r)), kids = []; tradeMarks(spec, rd && rd.def, mv); mv.qty = l.qty; delete mv.keptOn; delete mv.hid; delete mv.tp; delete mv.gr; delete mv.gp; delete mv.in; delete mv.up; delete mv.pl; grantOwn(mv); if (isObj(spec.on)) mv.on = false;   // 1.6.0: alone, it is no one's grant or part there
                if (l.qty >= (r.qty | 0 || 1)) {
                    list.splice(i, 1);
                    tradeCarry(sys, seenOf(s[0], s[1]), l.rowId).forEach(function(k) { var kl = listOf(s[0], s[1], k.f), ki = at(kl, rowIdOf(k.row)); if (ki < 0) return; kids.push({ f: k.f, how: k.how, by: k.by, old: rowIdOf(k.row), row: JSON.parse(JSON.stringify(kl[ki])) }); kl.splice(ki, 1); gone[s[0]][rowIdOf(k.row)] = 1; });
                } else { r.qty = (r.qty | 0) - l.qty; delete mv.id; delete mv.sh; }   // 1.6.2 (vehicles, fold (a)): a stack split keeps its sheet on the row it came from
                var kn = tradeKidsSeen(sys, kids), wn = kn ? ', with ' + kn + ' more' : '';
                moving[s[0]].push({ fid: l.fid, row: mv, kids: kids, oid: l.rowId }); s[0] === 'a' ? lines.a.push(nm + (l.qty > 1 ? ' x' + l.qty : '') + wn) : lines.b.push(nm + (l.qty > 1 ? ' x' + l.qty : '') + wn);
            } else {
                var isL = l.key === '@lvl', have = isL ? rowLvl(spec, r, rd && rd.def) : rowStat(spec, rd && rd.def, l.key), left = tradeRound(have - l.amt, isL ? spec.lvl.step : 0.01);
                if (left < -1e-9 || (isL && spec.lvl.min !== undefined && left < spec.lvl.min - 1e-9)) { err = 'changed'; return; }
                if (isL) r.lvl = left; else if (typeof r.defId === 'string') { r.ov = isObj(r.ov) ? r.ov : {}; r.ov.stats = isObj(r.ov.stats) ? r.ov.stats : {}; r.ov.stats[l.key] = left; } else { r.def.stats = isObj(r.def.stats) ? r.def.stats : {}; r.def.stats[l.key] = left; }
                var lab = isL ? (spec.lvl.label || 'Level') : ((spec.stats || []).filter(function(x) { return x.key === l.key; })[0] || {}).label || l.key;
                moving[s[0]].push({ fid: l.fid, amt: l.amt, key: l.key, like: r }); lines[s[0]].push(fmtNum(l.amt) + ' ' + lab + ' from ' + nm);
            }
        });
    });
    if (err) return { ok: false, reason: 'changed', msg: 'Something on the table changed. Look again and confirm.' };
    [['a', a], ['b', b]].forEach(function(s) {   // 1.6.0 (a builder audit): a row of its own the giver keeps, backed by a row that left, falls back to its own level
        var left = map(), any = false; moving[s[0]].forEach(function(m) { if (m.row) { left[m.oid] = 1; any = true; m.kids.forEach(function(k) { left[k.old] = 1; }); } }); if (!any) return;
        itemListIds(sys).forEach(function(fid) { var cur = Object.prototype.hasOwnProperty.call(vals[s[0]], fid) ? vals[s[0]][fid] : isObj(s[1].values) && Array.isArray(s[1].values[fid]) ? s[1].values[fid] : []; if (!cur.some(function(r) { return isObj(r) && typeof r.gb === 'string' && left[r.gb] === 1; })) return; listOf(s[0], s[1], fid).forEach(function(r) { if (isObj(r) && typeof r.gb === 'string' && left[r.gb] === 1) grantOwn(r); }); });
    });
    // then each lands on the other side
    [['a', 'b', b], ['b', 'a', a]].forEach(function(s) {
        moving[s[0]].forEach(function(m) {
            if (err) return; var f = fieldById(sys, m.fid), spec = isObj(f && f.list) ? f.list : {}, list = listOf(s[1], s[2], m.fid), live = function(r) { return isObj(r) && r.hid !== 1 && r.keptOn !== 1; };
            if (m.row) {
                var mv = m.row, j = -1;
                if (typeof mv.defId === 'string' && !isObj(mv.ov) && !m.kids.length && typeof mv.sh !== 'string') for (var k = 0; k < list.length; k++) { var r = list[k]; if (live(r) && r.defId === mv.defId && typeof r.sh !== 'string' && !isObj(r.ov) && !(isObj(spec.on) && rowOn(spec, r)) && (r.lvl === mv.lvl) && !isObj(r.ct) && !isObj(r.ld) && !isObj(r.fl) && !Array.isArray(r.rd) && !isObj(r.fd) && (r.pic || '') === (mv.pic || '')) { j = k; break; } }   // 1.5.8: never onto a row that holds a loaded copy; 1.6.2: nor one that wears another picture (the review)
                if (j >= 0 && spec.noQty) { err = 'one'; return; }
                if (j >= 0 && !isObj(mv.ct) && !isObj(mv.ld) && !isObj(mv.fl) && !Array.isArray(mv.rd) && !isObj(mv.fd)) { list[j].qty = clampNum((list[j].qty | 0) + mv.qty, 1, LIMITS.maxQty); return; }
                if (spec.noQty && list.some(function(r) { return live(r) && tradeEntry(r, mv); })) { err = 'one'; return; }
                if (list.filter(live).length >= LIMITS.carried) { err = 'full'; return; }
                if (!mv.id || at(list, mv.id) >= 0) { var nid = tradeNewId(list); if (!nid) { err = 'full'; return; } mv.id = nid; }
                list.push(mv);
                // 1.6.0: what it granted and the parts it holds come in with it, each a row of its own linked to its new id. A grant the
                // receiver's list holds once already is not granted again (as an add's), and what it granted with it; a part whose host
                // did not come lands loose
                var nids = map(); nids[m.oid] = mv.id;
                m.kids.forEach(function(k) {
                    if (err) return; var ks = tradeSpec(sys, k.f), kl = listOf(s[1], s[2], k.f), kr = JSON.parse(JSON.stringify(k.row));
                    if (k.how === 'gr' && !nids[k.by]) return;
                    delete kr.keptOn; delete kr.hid; if (isObj(ks.on)) kr.on = false;
                    ['gr', 'in'].forEach(function(w) { if (typeof kr[w] === 'string') { if (nids[kr[w]]) kr[w] = nids[kr[w]]; else delete kr[w]; } });
                    if (typeof kr.gr !== 'string') delete kr.gp;   // 1.6.0: Pays back goes with its mark
                    if (typeof kr.gb === 'string') { if (nids[kr.gb]) kr.gb = nids[kr.gb]; else grantOwn(kr); }   // 1.6.0 (a builder audit): backed by a row that came with it, else at its own level
                    if (ks.noQty && kl.some(function(r) { return live(r) && tradeEntry(r, kr); })) { if (k.how === 'gr' && !ks.multi) return; if (k.how !== 'gr') { err = 'one'; return; } }
                    if (kl.filter(live).length >= LIMITS.carried) { err = 'full'; return; }
                    if (!kr.id || at(kl, kr.id) >= 0) { kr.id = k.old && at(kl, k.old) < 0 ? k.old : tradeNewId(kl); if (!kr.id) { err = 'full'; return; } }
                    nids[k.old] = kr.id; kl.push(kr);
                });
            } else {
                var isL = m.key === '@lvl', tgt = -1, pick = function(test) { for (var k2 = 0; tgt < 0 && k2 < list.length; k2++) if (live(list[k2]) && (list[k2].qty | 0 || 1) === 1 && test(list[k2])) tgt = k2; };
                var mineIn = isObj(into) && isObj(into[s[1]]) ? into[s[1]] : null, want = mineIn && Object.prototype.hasOwnProperty.call(mineIn, m.fid) && typeof mineIn[m.fid] === 'string' ? mineIn[m.fid] : '';
                if (want && want !== '+') {   // the receiver's own pick: gone or no longer fit refuses, a stat whose entry it is not lands as it would
                    var wi = at(list, want), wr = wi >= 0 ? list[wi] : null, wd = wr ? rowDef(sys, wr) : null;
                    if (!wr || !live(wr) || (wr.qty | 0 || 1) !== 1 || !wd || !isObj(wd.def) || wd.def.vis === 'gm') { err = 'changed'; return; }
                    if (isL || tradeEntry(wr, m.like)) tgt = wi;
                }
                if (want !== '+') { pick(function(r) { return tradeEntry(r, m.like) && !rowOn(spec, r); }); pick(function(r) { return tradeEntry(r, m.like); }); if (isL) pick(function(r) { return !rowOn(spec, r); }); }   // a level (a chip's money) may land on another chip of the list; a stat only on the same entry, else a row of its own
                if (tgt < 0) {
                    if (list.filter(live).length >= LIMITS.carried) { err = 'full'; return; }
                    var nr = JSON.parse(JSON.stringify(m.like)); delete nr.keptOn; delete nr.hid; delete nr.ct; delete nr.ld; delete nr.fl; delete nr.rd; delete nr.fd; delete nr.bu; delete nr.note; nr.qty = 1; nr.id = tradeNewId(list); if (!nr.id) { err = 'full'; return; } if (isObj(spec.on)) nr.on = false;
                    if (isL) nr.lvl = 0; else if (typeof nr.defId === 'string') { nr.ov = isObj(nr.ov) ? nr.ov : {}; nr.ov.stats = isObj(nr.ov.stats) ? nr.ov.stats : {}; nr.ov.stats[m.key] = 0; } else { nr.def.stats = isObj(nr.def.stats) ? nr.def.stats : {}; nr.def.stats[m.key] = 0; }
                    list.push(nr); tgt = list.length - 1;
                }
                var tr = list[tgt], rdT = rowDef(sys, tr), cur = isL ? rowLvl(spec, tr, rdT && rdT.def) : rowStat(spec, rdT && rdT.def, m.key), nv = tradeRound(cur + m.amt, isL ? spec.lvl.step : 0.01);
                if (isL && spec.lvl.max !== undefined && nv > spec.lvl.max + 1e-9) { err = 'max'; return; }
                if (isL) tr.lvl = nv; else if (typeof tr.defId === 'string') { tr.ov = isObj(tr.ov) ? tr.ov : {}; tr.ov.stats = isObj(tr.ov.stats) ? tr.ov.stats : {}; tr.ov.stats[m.key] = nv; } else { tr.def.stats = isObj(tr.def.stats) ? tr.def.stats : {}; tr.def.stats[m.key] = nv; }
            }
        });
    });
    if (err === 'one') return { ok: false, reason: 'one', msg: 'A list there holds one of each, and that one is already there.' };
    if (err === 'full') return { ok: false, reason: 'full', msg: 'A list there is full.' };
    if (err === 'max') return { ok: false, reason: 'max', msg: 'That would take a figure past its most.' };
    if (err) return { ok: false, reason: 'changed', msg: 'Something on the table changed. Look again and confirm.' };
    var plain = function(m) { var o = {}; Object.keys(m).forEach(function(k) { o[k] = m[k]; }); return o; };
    return { ok: true, valuesA: plain(vals.a), valuesB: plain(vals.b), linesA: lines.a, linesB: lines.b };
}
// [systemcheck:trade-end]
// [split:body-end]
return { TRADE_LINES: TRADE_LINES, cleanTradeOffer: cleanTradeOffer, tradeApply: tradeApply, tradeCarry: tradeCarry, tradeInto: tradeInto, tradeOfferable: tradeOfferable, tradeRolls: tradeRolls };   // [split:glue]
}   // [split:glue]

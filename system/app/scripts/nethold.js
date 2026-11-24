/* nethold.js: a part of net.js (docs/REFACTOR_SPLIT_PLAN.md, split 2026-11-18 with no change in behavior).
   What it holds: a roll held on the host for a choice on its card (cardHold, cardPress, cardAway, cardForget, cardEnt), with the cost
   of a roll bonus worked out and paid (swPayPlan, swPayDo). A help roll's hold (the [netcheck:helphold-*] lines) stays in net.js,
   since the roll-req branch there sets its state.
   Why it looks this way: these lines stood in net.js, and they still run exactly where they stood. net.js calls netHold() at its line
   `// [split:nethold.js]`, so the body below runs in the old order, after everything above that line and before everything below it.
   The body keeps its lines at the left margin inside the install function, unchanged, so that every test that reads net.js (through
   tools/srcjoin.js, which puts these lines back) sees the old file. The first lines import what the body uses of net.js (live, so a
   value net.js changes later is read as it is then); the last line hands back the names net.js uses of it. Neither side may assign
   the other's names (tools/splitcheck.js holds it). Change the code here as if it still stood in net.js. Like net.js, this file is
   kept byte for byte by git (.gitattributes), with its CRLF line endings. */
// [split:of net.js]
import { net, own, pushRoll, saveRemoteSoon, sendFailed, sendTable, toast, turnNote } from './net.js';   // [split:glue]
export function netHold() {   // [split:glue]
// [split:body-start]
// [netcheck:cardhold-start]
// 1.6.2 (backlog 210 b, G5; the owner: "Wait for Accept, then run", and "a roll with no card actions shouldn't wait, so ordinary rolls stay instant"): a roll
// whose card offers something is held here, its Then and all that follows it not run, and its card says so plainly. Accept, or the time the system sets,
// runs what follows once. The time does not run on while its roller is away, since it could spend a choice for them, and the GM may accept for them. Each
// action works on the roll in hand and sends the card again under its one id, so the final card takes its place. Nothing here is stored
var _cardHeld = Object.create(null);
function cardEnt(camp, act, row, seen) {   // a player's press is judged through their view, which holds no card actions, so they are read from the GM's entry
    var sys = camp && camp.system, hit = null; if (!sys) return seen;
    if (typeof act === 'string' && act) (Array.isArray(sys.rolls) ? sys.rolls : []).forEach(function(r) { if (r && r.id === act) hit = r; });
    else if (row && typeof row.i === 'number') (Array.isArray(sys.fields) ? sys.fields : []).forEach(function(f) { if (f && f.id === row.f && f.list && Array.isArray(f.list.rolls)) hit = f.list.rolls[row.i] || null; });
    return hit || seen;
}
function cardVars(h) { var o = h.o, vd = o.D.verdictOf(h.res, o.D.ruleOf({}, o.camp.system && o.camp.system.combat ? o.camp.system.combat.checks : '')); return o.S.withRollCrit(o.vars, o.S.thenCrit(vd, false), o.S.thenMargin(vd, false), false, h.res); }
// 1.6.2 (G5): what a roll has left to spend: its figure, worked out from the roll as it stands, less what was spent. A roll with none has no points, and an action that spends is not offered
function cardPoints(h) { var o = h.o, p = typeof o.S.cardPtsOf === 'function' ? o.S.cardPtsOf(o.camp.system, o.ent) : null; if (!p) return null; var r = null; try { r = o.F.evaluate(p.text, { vars: cardVars(h), random: function() { return 1; } }); } catch (e) { r = null; } var n = r && r.ok && typeof r.value === 'number' && isFinite(r.value) ? Math.floor(r.value) : 0; return { n: Math.max(0, Math.min(999, n - (h.spent || 0))), w: p.word }; }
function cardRunAct(o, id) { var hit = null; (Array.isArray(o.camp.system.rolls) ? o.camp.system.rolls : []).forEach(function(r) { if (r && r.id === id && Array.isArray(r.apply)) hit = r; }); return hit; }
function cardOffers(h) {
    var o = h.o, v = cardVars(h), out = [], pts = cardPoints(h);
    h.acts.forEach(function(a, i) { if ((h.used[i] || 0) >= (a.times || 1)) return; if (a.pay && !cardPayAct(o, a)) return; if (a.spend && (!pts || pts.n < a.spend)) return; if (a.does === 'run' && (!o.ch || !cardRunAct(o, a.act))) return; if (a.does === 'bandUp' && !(o.S.bandsFor(o.camp.system, o.ent).length > h.step + 1)) return; if (a.does === 'oneDie' && !o.D.oneDieSpots(h.res).length) return; if (!o.S.cardActOk(a, v, o.F)) return; var off = { k: String(i), l: a.spend ? a.label + ' (' + a.spend + ')' : a.label }; if (a.does === 'oneDie') off.d = 1; out.push(off); });   // 1.6.4 (gap #2): one die again asks its roller for the die (d), and only where a die can be
    return out;
}
// [netcheck:swpay-start]
// 1.6.2 (G6): a roll bonus with a cost, a system action run as it is ticked, from the GM's system whatever the roller's view holds. Worked out whole on a copy before anything is spent, so a bonus that cannot be paid refuses the roll, and stored once nothing else has refused it
function swPayPlan(S, camp, ch, pays, F, D, tc) {
    var sys = camp.system, rolls = Array.isArray(sys.rolls) ? sys.rolls : [], work = Object.assign({}, ch, { values: Object.assign({}, ch.values) }), all = {}, cards = [], links = {};
    for (var i = 0; i < pays.length; i++) {
        var act = rolls.filter(function(r) { return !!r && r.id === pays[i] && Array.isArray(r.apply); })[0]; if (!act) return { error: 'That bonus cannot be paid now.' };
        var res = S.applyAct(sys, work, act, S.makeResolver(sys, work, F, tc || null), F, tc || null, null, undefined, D); if (!res || !res.ok) return { error: (res && res.message) || 'That bonus cannot be paid now.' };
        Object.keys(res.values).forEach(function(k) { work.values[k] = res.values[k]; all[k] = res.values[k]; }); if (res.linkValues) Object.keys(res.linkValues).forEach(function(id) { links[id] = Object.assign(links[id] || {}, res.linkValues[id]); }); /* 1.6.2 (the CORE session's batch 6, 12): a cost paid from a linked sheet */ if (Array.isArray(res.lines) && res.lines.length) cards.push({ label: act.label, lines: res.lines, scope: S.applyScope(sys, work, act, false, F) });
    }
    return { values: all, cards: cards, links: links };
}
function swPayDo(ch, plan) {
    if (plan.links && Object.keys(plan.links).length && window.wpSheets && window.wpSheets.linkValuesWrite) { window.wpSheets.linkValuesWrite(plan.links); saveRemoteSoon(); }   // 1.6.2 (12)
    var ks = Object.keys(plan.values); if (!ks.length) { plan.cards.forEach(function(c) { net.postApplyCard(ch, c.label, c.lines, c.scope); }); return; } ch.values = ch.values || {}; ks.forEach(function(k) { ch.values[k] = plan.values[k]; }); ch.updated = Date.now(); saveRemoteSoon(); net.syncCharDelta(ch.id, plan.values); if (window.wpSheets) window.wpSheets.charChanged(ch.id);
    plan.cards.forEach(function(c) { net.postApplyCard(ch, c.label, c.lines, c.scope); });
}
// [netcheck:swpay-end]
function cardPayAct(o, a) { var hit = null; (Array.isArray(o.camp.system.rolls) ? o.camp.system.rolls : []).forEach(function(r) { if (r && r.id === a.pay && Array.isArray(r.apply)) hit = r; }); return hit; }
// 1.6.3 (the review of Hide my rolls): o.fig, handed by roll-req where the roll answers an attempt whose figure is hidden (the hidefig slice of net.js), turns the
// card into the copy that leaves the host (the hidefig slice's mask, its buttons kept). The table and its roller get that copy; the GM's own card (pushRoll) stays whole
function cardSend(h, offers) {
    var o = h.o, rec = { type: 'roll', id: h.id, from: o.from, expr: h.expr, draws: h.res.draws, v: o.F.VERSION, ts: Date.now(), pend: h.wait, offers: offers }, ptsS = cardPoints(h); if (ptsS) rec.pts = ptsS;
    if (h.redo) rec.redo = h.redo; if (o.dl) rec.dl = o.dl; if (o.rid) rec.rid = o.rid; if (o.label) rec.label = o.label; if (o.as) rec.as = o.as; if (o.priv) rec.priv = 'gm'; if (o.asked && o.asked.length) rec.asked = o.asked;
    if (h.res.breakdown && h.res.breakdown.names && h.res.breakdown.names.length) { var nmH = o.D.cleanNames(h.res.breakdown.names); if (nmH && nmH.length) rec.names = nmH; }   // what its formula read, without which no other machine can draw the card
    var out = typeof o.fig === 'function' ? o.fig(rec, h.res) : rec;
    if (o.conn) { if (o.priv) { try { o.conn.send(out); } catch (e) { sendFailed(e); } } else sendTable(out, null); } else if (!o.priv) sendTable(out, null);
    pushRoll(rec, h.res, o.priv ? 'whisper' : 'global', { cid: o.cid });
}
function cardClock(h) { if (h.timer) clearTimeout(h.timer); h.timer = null; if (h.away) return; h.timer = setTimeout(function() { cardSettle(h); }, h.wait * 1000); }
function cardSettle(h) { if (!_cardHeld[h.id]) return; delete _cardHeld[h.id]; if (h.timer) clearTimeout(h.timer); h.timer = null; h.o.go(h.res, h.expr, h.id, h.step, h.redo || null); cardRuns(h); }
function cardRuns(h) {   // 1.6.2 (G5): what was picked runs once the roll has landed, in the order picked, each read on the sheet as the one before left it
    var o = h.o, vd = o.D.verdictOf(h.res, o.D.ruleOf({}, o.camp.system && o.camp.system.combat ? o.camp.system.combat.checks : ''));
    (h.queue || []).forEach(function(id) {
        var act = cardRunAct(o, id); if (!act || !o.ch) return; var v = o.S.withRollCrit(o.S.makeResolver(o.camp.system, o.ch, o.F, o.tc || null), o.S.thenCrit(vd, false), o.S.thenMargin(vd, false), false, h.res), pr = o.S.applyAct(o.camp.system, o.ch, act, v, o.F, o.tc || null, null, undefined, o.D); if (!pr || !pr.ok) { cardSay(h, (pr && pr.message) || 'That could not be done.'); return; }
        var ks = Object.keys(pr.values); if (ks.length) { o.ch.values = o.ch.values || {}; ks.forEach(function(k) { o.ch.values[k] = pr.values[k]; }); o.ch.updated = Date.now(); saveRemoteSoon(); net.syncCharDelta(o.ch.id, pr.values); if (window.wpSheets) window.wpSheets.charChanged(o.ch.id); }
        if (Array.isArray(pr.lines) && pr.lines.length && typeof net.postApplyCard === 'function') net.postApplyCard(o.ch, act.label, pr.lines, o.S.applyScope(o.camp.system, o.ch, act, false, o.F));
    });
}
function cardHold(o) {
    if (!o || !o.camp || !o.camp.system || !o.ent || typeof o.S.cardActsOf !== 'function') return false;
    var acts = o.S.cardActsOf(o.camp.system, o.ent); if (!acts.length) return false;
    var h = { id: o.D.uid(), o: o, acts: acts, used: {}, spent: 0, queue: [], res: o.res, expr: o.expr, step: 0, wait: o.S.cardWaitOf(o.camp.system), timer: null, away: false }, off = cardOffers(h); if (!off.length) return false;
    _cardHeld[h.id] = h; cardSend(h, off); cardClock(h); return true;
}
function cardSay(h, words) { var o = h.o; if (o.conn && typeof turnNote === 'function') turnNote(o.conn, words, o.cid); else if (typeof toast === 'function') toast(words); }
// 1.6.4 (gap #2): what a press that rolls again keeps, and what its card says of it (h.redo). Keep the better or the worse: the try the judge keeps (null where
// the old one stays), counting every try; a plain Roll again starts the count afresh. One die: the new roll, the card saying what it showed
function cardRedo(h, a, pick, again) {
    var o = h.o;
    if (a.does === 'best' || a.does === 'worst') {
        var cr = typeof o.S.critRange === 'function' ? o.S.critRange(o.camp.system, o.ent, o.vars, o.F) : null;   // criticals at fixed rolls: the roll's own range, as its card reads it
        var rule = o.D.ruleOf(cr ? { crit: cr } : {}, o.camp.system && o.camp.system.combat ? o.camp.system.combat.checks : ''), word = a.does === 'best' ? 'better' : 'worse', same = !!(h.redo && h.redo.k === word);
        var keeps = o.D.tryKeepsNew(a.does, h.res, again, rule), others = same && Array.isArray(h.redo.o) ? h.redo.o.slice() : [];   // the totals of the tries not kept, in the order they fell (Fulllion, 2026-11-24)
        var gone = o.D.tryTotal(keeps ? h.res : again, rule); if (gone !== null && others.length < 8) others.push(gone);
        h.redo = { k: word, n: Math.min(99, (same ? h.redo.n : 1) + 1) }; if (others.length) h.redo.o = others;
        return keeps ? again : null;
    }
    if (a.does === 'oneDie') { var now = o.D.oneDieSpots(again).filter(function(sp) { return sp.at === pick.at; })[0]; h.redo = now ? { f: pick.faces, a: pick.v, b: now.v } : null; return again; }
    if (a.does === 'again' || a.does === 'againIf') h.redo = null;   // a new roll, so no try is kept any more; a number added keeps what the card said
    return again;
}
// who: the profile that pressed, '' for the GM's own hand. A press is its roller's or the GM's, and an action is the roller's alone
function cardPress(id, key, who) {
    var h = typeof id === 'string' && Object.prototype.hasOwnProperty.call(_cardHeld, id) ? _cardHeld[id] : null; if (!h) return false;
    var o = h.o, mine = who === '' || who === o.pid; if (!mine) return false;
    if (key === 'accept') { cardSettle(h); return true; }
    if (who === '' && o.pid) return false;
    var kp = String(key).split(':'), i = Number(kp[0]), a = h.acts[i]; if (!a || !cardOffers(h).some(function(x) { return x.k === String(i); })) return false;
    var pick = null; if (a.does === 'oneDie') { var dieAt = kp.length === 2 ? Number(kp[1]) : -1; pick = o.D.oneDieSpots(h.res).filter(function(sp) { return sp.at === dieAt; })[0] || null; if (!pick) return false; } else if (kp.length !== 1) return false;   // 1.6.4 (gap #2): the die named must be one the card offers, and only that action names one
    if (a.pay) {
        var pa = cardPayAct(o, a), pr = pa ? o.S.applyAct(o.camp.system, o.ch, pa, o.vars, o.F, o.tc, null, undefined, o.D) : null;
        if (!pr || !pr.ok) { cardSay(h, (pr && pr.message) || 'That cannot be paid now.'); return false; }
        o.ch.values = o.ch.values || {}; Object.keys(pr.values).forEach(function(k) { o.ch.values[k] = pr.values[k]; }); o.ch.updated = Date.now(); saveRemoteSoon(); net.syncCharDelta(o.ch.id, pr.values); if (window.wpSheets) window.wpSheets.charChanged(o.ch.id);
    }
    h.used[i] = (h.used[i] || 0) + 1; if (a.spend) h.spent += a.spend; if (a.does === 'run') h.queue.push(a.act);
    var again = null, keep = h.res.draws.slice(), at = 0;
    if (a.does === 'again' || a.does === 'best' || a.does === 'worst') again = o.F.evaluate(h.expr, { vars: o.vars });
    else if (a.does === 'oneDie') again = o.F.evaluate(h.expr, { vars: o.vars, random: function(fc) { var j = at++, raw = keep[j]; if (j !== pick.at && typeof raw === 'number' && raw >= 1 && raw <= fc) return raw; return 1 + Math.floor(Math.random() * fc); } });   // every draw as it was but the one picked, so all that reads it is worked out again
    else if (a.does === 'againIf') again = o.F.evaluate(h.expr, { vars: o.vars, random: function(fc) { var raw = keep[at++]; if (typeof raw === 'number' && raw >= 1 && raw <= fc && !o.S.cardDieHolds(raw, a.test)) return raw; return 1 + Math.floor(Math.random() * fc); } });
    else if (a.does === 'add' || a.does === 'sub') {
        var nv = o.F.evaluate(a.n, { vars: cardVars(h) }), md = nv.ok && typeof nv.value === 'number' && isFinite(nv.value) ? Math.round(nv.value) : null; if (md === null) { cardSay(h, 'That amount could not be worked out.'); return false; }
        var cm = o.D.composeModifier(h.expr, a.does === 'add' ? md : -md, o.F.parse); if (!cm.ok) { cardSay(h, 'That roll cannot take that change.'); return false; }
        h.expr = cm.expr; again = o.F.evaluate(h.expr, { vars: o.vars, random: function(fc) { var raw = keep[at++]; return typeof raw === 'number' && raw >= 1 && raw <= fc ? raw : 1 + Math.floor(Math.random() * fc); } });
    } else if (a.does === 'bandUp') h.step += 1;
    if (again) { if (!again.ok) { cardSay(h, 'That roll cannot take that change.'); return false; } again = cardRedo(h, a, pick, again); if (again) h.res = again; }
    var off = cardOffers(h); if (!off.length) { cardSettle(h); return true; }
    cardSend(h, off); cardClock(h); return true;
}
function cardAway(peer) { Object.keys(_cardHeld).forEach(function(id) { var h = _cardHeld[id]; if (h.o.conn && h.o.conn.peer === peer) { h.away = true; if (h.timer) clearTimeout(h.timer); h.timer = null; } }); }
function cardForget() { Object.keys(_cardHeld).forEach(function(id) { if (_cardHeld[id].timer) clearTimeout(_cardHeld[id].timer); delete _cardHeld[id]; }); }
net.cardAct = function(id, key) {
    if (net.role === 'client') { if (!net.conns[0] || !net.conns[0].open) return false; try { net.conns[0].send({ type: 'card-act', id: String(id), key: String(key) }); } catch (e) { return false; } return true; }
    return cardPress(id, key, '');
};
// [netcheck:cardhold-end]
// [split:body-end]
return { cardAway: cardAway, cardEnt: cardEnt, cardForget: cardForget, cardHold: cardHold, cardPress: cardPress, swPayDo: swPayDo, swPayPlan: swPayPlan };   // [split:glue]
}   // [split:glue]

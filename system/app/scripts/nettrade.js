/* nettrade.js: a part of net.js (docs/REFACTOR_SPLIT_PLAN.md, area 6, trade and money; split 2026-11-18 with no change in behavior).
   What it holds: trades at a table. The host keeps every trade (_trades) and judges every step in one place (tradeDo): who acts for a
   side, what a trade in a fight costs (tradePayers, tradeBar, tradeSpend), each side's view and the word sent to it (tradeView,
   tradeTell), a row on offer that moves (tradeMoved), a player's last connection gone (tradeConnGone), and a player's ask to change
   their own money (moneyAskPut). Then the GM's log of this session's trades and Put back (net.tradeLog, net.tradeReverse), the private
   card a trade posts (tradeCard), the calls a screen makes, the same on both ends (tradeSendUp, net.tradeAsk to net.tradeOffer,
   net.debtSet), and cleanTradeView, with which a player's app cleans the host's view again. The host's one trade branch of
   handleMessage and a player's tradeState branch stay in net.js; the trade itself (tradeApply) and money are in tradecore.js and
   moneycore.js, parts of systemcore.js.
   Not trade, though it stands here: a roll sent to the GM (thenGmRun, and the host's side of To the GM: toGmKeep, toGmApply,
   toGmAgain and net.toGmButtons, between moneyAskPut and the trade log). It stood inside the trade lines in net.js and came with them,
   since netcheck cuts the whole of the trade lines as one slice. Look for it here.
   Why it looks this way: these lines stood in net.js, and they still run exactly where they stood. net.js calls netTrade() at its line
   `// [split:nettrade.js]`, so the body below runs in the old order, after everything above that line and before everything below it.
   The body keeps its lines at the left margin inside the install function, unchanged, so that every test that reads net.js (through
   tools/srcjoin.js, which puts these lines back) sees the old file. The first lines import what the body uses of net.js (live, so a
   value net.js changes later is read as it is then); the last line hands back the names net.js uses of it. Neither side may assign
   the other's names (tools/splitcheck.js holds it). Change the code here as if it still stood in net.js. Like net.js, this file is
   kept byte for byte by git (.gitattributes), with its CRLF line endings. */
// [split:of net.js]
import { SC, actSpend, actsCombat, actsOf, fxNow, getActiveCampaign, logEvent, net, offTurnOf, offTurnTell, own, peerProfileId, pushChat, pushRoll, rowOnGm, saveRemoteSoon, sendFailed, toast, turnNote } from './net.js';   // [split:glue]
export function netTrade() {   // [split:glue]
// [split:body-start]
// [netcheck:trade-start]
// 1.5.6 trading (backlog 157; docs/TRADE_V1_SPEC.md). The host keeps every trade (_trades) and judges every step; each side sees its view
// (tradeView). A side is acted for by its player while that player is at the table, else by the GM (an NPC, a merchant, or a player's
// character whose player is away: the GM's own hand). One trade at a time a character. Both confirm, then tradeApply moves everything at once
var _trades = Object.create(null), _tradeViews = Object.create(null), TRADE_TID = /^t_[a-z0-9]{8}$/;
function tradeForget() { _trades = Object.create(null); _tradeViews = Object.create(null); }
// a trade open on this screen when its table went: the host ended it and could not say so, so the window goes with these words (1.6.0, found live: a player who dropped and came back kept a dead window)
function tradeLost(words) { Object.keys(_tradeViews).forEach(function(k) { tradeKeep({ tid: k, status: 'cancelled', msg: words }); }); }
function tradeChar(camp, id) { return camp && camp.chars && typeof id === 'string' && Object.prototype.hasOwnProperty.call(camp.chars, id) ? camp.chars[id] : null; }
function tradeHere(pid) { return !!pid && net.active && net.role === 'host' && net.conns.some(function(c) { return c.open && net.roster[c.peer] && net.roster[c.peer].id === pid; }); }
// who acts for a character: its player while at the table, '' for the GM (an NPC, one with no player, one whose player is away)
function tradeBy(ch) { return ch && !ch.npc && ch.ownerId && tradeHere(ch.ownerId) ? ch.ownerId : ''; }
function tradeOfChar(id) { var hit = null; Object.keys(_trades).forEach(function(k) { var tr = _trades[k]; if (!hit && (tr.a.charId === id || tr.b.charId === id)) hit = tr; }); return hit; }
// 1.6.2 (backlog 226): a line's face, its row's own picture else its entry's, and the entry's icon, each through the core's own cleaner. tradeOfferable
// offers no GM-only entry, so a picture here is one players may see; it is named under pic, so the asset gate serves it to whoever is sent the view
function tradeFace(S, sys, ch, l, o) {
    var rows = ch && ch.values && Array.isArray(ch.values[l.fid]) ? ch.values[l.fid] : [], r = null; rows.forEach(function(x) { if (!r && x && S.rowIdOf && S.rowIdOf(x) === l.rowId) r = x; }); if (!r) return o;
    var rd = S.rowDef ? S.rowDef(sys, r) : null, d = rd && rd.def && typeof rd.def === 'object' ? rd.def : {}; if (d.vis === 'gm') return o;
    var pc = S.cleanPic ? S.cleanPic(r.pic) || S.cleanPic(d.pic) : ''; if (pc) o.pic = pc;
    var ic = S.cleanIcon && typeof d.icon === 'string' ? S.cleanIcon(d.icon) : ''; if (ic) o.icon = ic;
    return o;
}
function tradeLines(S, sys, ch, off, who, other, hag) {   // other: who takes it, for what it is worth to them (157 M1c); hag: haggling toward this side (157 M1i)
    var can = Object.create(null); S.tradeOfferable(sys, ch, who).forEach(function(e) { can[e.fid + '|' + e.rowId] = e; });
    return (off || []).map(function(l) {
        var e = can[l.fid + '|' + l.rowId]; if (!e) return null; var o = tradeFace(S, sys, ch, l, { fid: l.fid, rowId: l.rowId, name: e.name, list: e.list });
        if (l.key === undefined) { o.qty = l.qty; if (typeof e.price === 'number') { o.price = e.price; var dl = S.tradeDeal ? S.tradeDeal(sys, ch, other, e, hag) : null; if (dl !== null) o.deal = dl; if (typeof e.cond === 'number') o.cond = e.cond; } if (e.hot) o.hot = e.hot; } else { var sp = e.split.filter(function(s) { return s.key === l.key; })[0]; o.key = l.key; o.amt = l.amt; o.label = sp ? sp.label : l.key; }
        return o;
    }).filter(Boolean);
}
// 1.6.0 A trade in a fight (combat.turn.trade, in a system's Turns; the owner: "should be available in general for waypoint as something that can be applied"). It names an action of
// the system's, and a side that gives spends it as the trade completes. Who only takes spends nothing, so a swap costs both sides. Only a player's side at the table is counted: the GM's
// hand spends nothing here, as a GM's press does not. Everything is judged before anything moves, so one side short of its action costs the other nothing. Absent, as ever
function tradeAct(camp) {
    if (typeof actsOf !== 'function') return null;
    var tn = camp && camp.system && camp.system.combat ? camp.system.combat.turn : null, k = tn ? tn.trade : '', a = null;
    if (typeof k === 'string' && k) actsOf(camp).forEach(function(x) { if (!a && x && x.key === k) a = x; });
    return a;
}
function tradeFight(camp, sd) {   // this side's player and connection, while its character is in a fight
    if (!sd.by) return null; var hit = null;
    net.conns.forEach(function(c) { var p = c.open ? net.roster[c.peer] : null; if (!hit && p && p.id === sd.by && actsCombat(camp, sd.charId, p)) hit = { conn: c, pr: p }; });
    return hit;
}
function tradePayers(camp, tr) {
    var a = tradeAct(camp), out = []; if (!a) return out;
    [[tr.a, tr.offA], [tr.b, tr.offB]].forEach(function(q) {
        if (!q[1] || !q[1].length) return; var f = tradeFight(camp, q[0]), ch = tradeChar(camp, q[0].charId);
        if (f && ch) out.push({ ch: ch, conn: f.conn, pr: f.pr, key: a.key, nm: String(ch.name || 'A character').slice(0, 60) });
    });
    return out;
}
function tradeBar(camp, pays) {   // '' where every side that gives may; else the words both sides see
    var out = '';
    pays.forEach(function(p) {
        if (out) return;
        if (offTurnOf(camp, p.ch.id) === 'refuse') { offTurnTell(p.nm, p.nm + ' tried a trade out of turn.'); out = 'It is not ' + p.nm + '\u2019s turn.'; return; }
        var w = actSpend(camp, p.ch.id, p.pr, p.key, p.conn, p.nm, true); if (w) out = p.nm + ': ' + w;
    });
    return out;
}
function tradeSpend(camp, pays) {
    pays.forEach(function(p) {
        actSpend(camp, p.ch.id, p.pr, p.key, p.conn, p.nm);
        if (offTurnOf(camp, p.ch.id) === 'warn') { offTurnTell(p.nm, p.nm + ' traded out of turn.'); turnNote(p.conn, 'It is not your turn. The GM is told.', p.ch.id); }
    });
}
net.tradeFights = function() { return !!tradeAct(getActiveCampaign()); };   // the system lets a trade happen in a fight: its row stands on an NPC there (trade.js canAsk)
function tradeView(tr, you, status, msg) {
    var S = SC(), camp = getActiveCampaign(), ca = tradeChar(camp, tr.a.charId), cb = tradeChar(camp, tr.b.charId), sys = camp && camp.system;
    var side = function(sd, ch, off, ok, other) { var o = { charId: sd.charId, name: String((ch && ch.name) || 'A character').slice(0, 60), ok: !!ok, lines: S && sys && ch ? tradeLines(S, sys, ch, off, sd.by ? 'player' : 'gm', other, sd === tr.a ? hagV : -hagV) : [] }, mo = S && S.tradeMoney && sys && ch ? S.tradeMoney(sys, ch, off) : []; if (mo.length) o.money = mo; if (curs && ch && ch.trader && Array.isArray(ch.trader.acc)) o.acc = ch.trader.acc.slice(); if (rates && ch && ch.trader) ['buy', 'sell'].forEach(function(k) { if (typeof ch.trader[k] === 'number') o[k] = ch.trader[k]; }); if (xch && ch && ch.trader && ch.trader.xr) o.xr = Object.assign({}, ch.trader.xr); var atM = xch && S.tradeMoneyAt ? S.tradeMoneyAt(sys, ch, off, other) : null, faceM = mo.filter(function(m) { return m.cur === ''; })[0]; if (atM !== null && (!faceM || atM !== faceM.v)) o.moneyAt = atM; return o; };   // 157 M1e: its exchange rates, and what its money counts for with the other side   // 157 M1c: its buy and sell prices
    var rates = !!(S && S.tradeRatesOn && S.tradeRatesOn(sys));   // 157 M1c
    var hagOn = !!(sys && sys.trading && sys.trading.haggle), hagV = hagOn && typeof tr.hag === 'number' ? tr.hag : 0;   // 157 M1i
    var hotOn = !!(sys && sys.trading && sys.trading.hot === true);   // 157 M1j
    var xch = !!(sys && sys.trading && sys.trading.exchange === true && Array.isArray(sys.currencies) && sys.currencies.length);   // 157 M1e
    var curs = sys && Array.isArray(sys.currencies) && sys.currencies.length ? [{ key: '*', label: 'The base unit' }].concat(sys.currencies.map(function(c) { return { key: c.key, label: String(c.label || c.key).slice(0, 60) }; })) : null;   // 157 M1b: what a side may accept   // 157 M1b: the money on offer, a Separate currency's on its own line
    var v = { tid: tr.tid, status: status || tr.status, you: you, a: side(tr.a, ca, tr.offA, tr.okA, cb), b: side(tr.b, cb, tr.offB, tr.okB, ca) }; if (curs) v.curs = curs; if (rates) v.rates = true; if (xch) v.xch = true;
    if (typeof tr.oweA === 'number' && tr.oweA > 0) v.a.owe = tr.oweA; if (typeof tr.oweB === 'number' && tr.oweB > 0) v.b.owe = tr.oweB; var dbStand = S && S.debtOf && ca && cb ? S.debtOf(ca, cb.id) : 0; if (dbStand) v.debt = dbStand;   // 157 M1h: what each side owes on this trade, and the debt between them
    var dvV = S && S.tradeDeviceSays && sys && ca && cb ? S.tradeDeviceSays(sys, ca, tr.offA, cb) || S.tradeDeviceSays(sys, cb, tr.offB, ca) : ''; if (dvV) v.devSays = dvV;   // 157 M1k: digital money with no device
    if (hotOn) { v.hot = true; [['a', ca], ['b', cb]].forEach(function(q) { var tq = q[1] && q[1].trader; if (tq && tq.fence === true) { v[q[0]].fence = true; if (typeof tq.fenceAt === 'number') v[q[0]].fenceAt = tq.fenceAt; } }); var hsV = S && S.tradeHotSays && ca && cb ? S.tradeHotSays(sys, ca, tr.offA, cb) || S.tradeHotSays(sys, cb, tr.offB, ca) : ''; if (hsV) v.hotSays = hsV; }   // 157 M1j: who fences, and what stops the trade
    if (hagOn) { v.hagOn = true; if (tr.hagDone) v.hagDone = true; if (hagV) v.hag = hagV; [['a', tr.a, ca], ['b', tr.b, cb]].forEach(function(q) { if (!q[1].by && q[2] && (q[2].npc || !q[2].ownerId)) { v[q[0]].merch = true; if (q[2].trader && typeof q[2].trader.hag === 'number') v[q[0]].hagAt = q[2].trader.hag; } }); }   // 157 M1i: haggling, and what a merchant the GM acts for haggles at
    var chg = S && S.tradeChange && sys && ca && cb ? S.tradeChange(sys, ca, tr.offA, cb, tr.offB, hagV) : null;   // 157 M1d: change owed, or the payer told it cannot be given
    if (chg) { var cP = v[chg.payer].name, cR = chg.payer === 'a' ? 'b' : 'a', cRn = v[cR].name, cO = String(chg.over); v.change = { payer: chg.payer, over: chg.over, say: chg.can ? cRn + ' owes ' + cP + ' ' + cO + ' in change.' : cRn + ' can\u2019t give change for that: overpay by ' + cO + ', or offer smaller pieces.' + ((cR === 'a' ? tr.a : tr.b).by ? ' ' + cRn + ' may also add something to make up the difference.' : '') }; }
    // where an amount this side receives lands (the receiver picks a chip): only on the view of one who acts for that side, since it names their own rows
    if (S && S.tradeInto && sys) [['a', ca, cb, tr.offB, tr.intoA], ['b', cb, ca, tr.offA, tr.intoB]].forEach(function(q) {
        if (!(you === 'both' || you === q[0]) || !q[1] || !q[2]) return; var seen = Object.create(null), gets = [];
        (q[3] || []).forEach(function(l) {
            if (l.key === undefined || seen[l.fid]) return; seen[l.fid] = 1;
            var f = (sys.fields || []).filter(function(x) { return x && x.id === l.fid; })[0], gv = q[2].values && Array.isArray(q[2].values[l.fid]) ? q[2].values[l.fid] : [], like = gv.filter(function(r) { return r && (r.id || r.rowId) === l.rowId; })[0];
            var ln = v[q[0] === 'a' ? 'b' : 'a'].lines.filter(function(x) { return x.fid === l.fid && x.key !== undefined; })[0];
            var into = q[4] && typeof q[4][l.fid] === 'string' ? q[4][l.fid] : '';
            gets.push({ fid: l.fid, list: String((f && f.label) || 'List').slice(0, 60), label: ln ? ln.label : l.key, pick: into, opts: S.tradeInto(sys, q[1], l.fid, l.key, like || {}) });
        });
        if (gets.length) v[q[0]].gets = gets;
    });
    if (msg) v.msg = String(msg).slice(0, 200);
    var acV = tradeAct(camp), payV = acV ? [['a', tr.a], ['b', tr.b]].filter(function(q) { return tradeFight(camp, q[1]); }).map(function(q) { return v[q[0]].name; }) : [];   // only the sides that will pay are named
    if (payV.length) v.cost = 'Giving in this fight costs ' + payV.join(' and ') + ' one ' + String(acV.label || acV.key).slice(0, 40) + (payV.length > 1 ? ' each' : '') + '.';
    return v;
}
function tradeKeep(v) {   // a view on this screen: kept while it is open, said through the window event either way
    if (!v || typeof v.tid !== 'string') return;
    if (v.status === 'asking' || v.status === 'open') _tradeViews[v.tid] = v; else delete _tradeViews[v.tid];
    if (v.status !== 'asking' && window.wpNotices && typeof window.wpNotices.done === 'function') { try { window.wpNotices.done('trade:' + v.tid); } catch (e) {} }   // the ask the bell kept is answered
    try { window.dispatchEvent(new CustomEvent('wptrade', { detail: JSON.parse(JSON.stringify(v)) })); } catch (e) {}
}
function tradeTell(tr, status, msg) {   // each one who acts gets one view: a player's to their every connection, the GM's on this machine; one who holds both sides sees both as theirs
    tr.sig = tradeSig(tr);
    var by = Object.create(null); [['a', tr.a.by], ['b', tr.b.by]].forEach(function(s) { (by[s[1]] = by[s[1]] || []).push(s[0]); });
    Object.keys(by).forEach(function(k) {
        var v = tradeView(tr, by[k].length === 2 ? 'both' : by[k][0], status, msg);
        if (!k) { tradeKeep(v); return; }
        var m = { type: 'tradeState', view: v };
        net.conns.forEach(function(c) { if (c.open && net.roster[c.peer] && net.roster[c.peer].id === k) { try { c.send(m); } catch (e) { sendFailed(e); } } });
    });
}
function tradeEnd(tr, status, msg) { delete _trades[tr.tid]; tradeTell(tr, status, msg); }
// What the rows on offer stand at now, each as a side's own list reads it (1.6.0, found by hand: the GM took a row on offer away, and the window went on
// showing it until a Confirm was refused). A change to a side's character is held against it, and only a change to a row on offer says anything
function tradeSig(tr) {
    var S = SC(), camp = getActiveCampaign(), sys = camp && camp.system; if (!S || !sys) return '';
    var one = function(sd, off) {
        var ch = tradeChar(camp, sd.charId), can = Object.create(null); if (ch) S.tradeOfferable(sys, ch, sd.by ? 'player' : 'gm').forEach(function(e) { can[e.fid + '|' + e.rowId] = e; });
        return (off || []).map(function(l) { return can[l.fid + '|' + l.rowId] || null; });
    };
    return JSON.stringify([one(tr.a, tr.offA), one(tr.b, tr.offB)]);
}
function tradeMoved(id) {
    var tr = typeof id === 'string' ? tradeOfChar(id) : null; if (!tr || tr.status !== 'open' || tr.closing || tradeSig(tr) === tr.sig) return;
    var had = tr.okA || tr.okB; tr.okA = false; tr.okB = false; tradeTell(tr, null, had ? 'The offer changed: confirm again.' : '');
}
// a player's last connection closed: their trades end, the other side told
function tradeConnGone(pid) { Object.keys(_trades).forEach(function(k) { var tr = _trades[k]; if (tr.a.by === pid || tr.b.by === pid) tradeEnd(tr, 'cancelled', 'A player left the table, so the trade ended.'); }); }
// one step of a trade, on the host: actor { pid } for a player (by their profile id), {} for the GM. Answers { ok } or { error: words }
function tradeDo(actor, msg) {
    var S = SC(), camp = getActiveCampaign(), pid = actor && actor.pid ? actor.pid : ''; if (!S || !S.tradeApply || !camp || !camp.system) return { error: 'Trading is not ready.' };
    if (net.paused) return { error: 'The table is paused.' };
    if (window.wpVtt && !window.wpVtt.on('sheets')) return { error: 'Character sheets are off.' };
    if (msg.op === 'ask') {
        var fa = tradeChar(camp, msg.from), fb = tradeChar(camp, msg.to);
        if (!fa || !fb || msg.from === msg.to || fa.partial || fb.partial || fa.making === 1 || fb.making === 1) return { error: 'That trade cannot start.' };
        var byA = tradeBy(fa); if (pid ? byA !== pid : byA) return { error: 'You can only trade for your own character.' };
        if (!pid && (fa.npc || !fa.ownerId) && (fb.npc || !fb.ownerId)) return { error: 'Two NPCs trade by hand: move the rows on their sheets.' };
        if (tradeOfChar(msg.from) || tradeOfChar(msg.to)) return { error: (tradeOfChar(msg.to) ? fb.name : fa.name) + ' is trading with someone else. Ask again in a moment.' };
        var byB = tradeBy(fb); if (pid && !byB && !fb.npc && fb.ownerId) return { error: (fb.name || 'That character') + '\u2019s player is not at the table.' };
        var tid; do { tid = 't_' + Math.random().toString(36).slice(2, 10).padEnd(8, '0'); } while (_trades[tid]);
        var tr = { tid: tid, a: { charId: msg.from, by: byA }, b: { charId: msg.to, by: byB }, status: byA === byB ? 'open' : 'asking', offA: [], offB: [], okA: false, okB: false, intoA: Object.create(null), intoB: Object.create(null) };
        _trades[tid] = tr; tradeTell(tr);
        if (!byB && pid && typeof window.wpNotices === 'object' && window.wpNotices && typeof window.wpNotices.wait === 'function') { try { window.wpNotices.wait('trade:' + tid, (fa.name || 'A character') + ' asks to trade with ' + (fb.name || 'your character') + '.', 'trade', tid); } catch (e) {} }
        logEvent('char', (fa.name || 'A character') + ' asked to trade with ' + (fb.name || 'a character'));
        return { ok: true, tid: tid };
    }
    var tr2 = typeof msg.tid === 'string' && TRADE_TID.test(msg.tid) && _trades[msg.tid] ? _trades[msg.tid] : null; if (!tr2) return { error: 'That trade is over.' };
    var sideA = tr2.a.by === pid, sideB = tr2.b.by === pid; if (!sideA && !sideB) return { error: 'That trade is not yours.' };
    var ca = tradeChar(camp, tr2.a.charId), cb = tradeChar(camp, tr2.b.charId); if (!ca || !cb) { tradeEnd(tr2, 'cancelled', 'A character in the trade is gone.'); return { error: 'That trade is over.' }; }
    var who = function(sd) { return sd.by ? 'player' : 'gm'; };
    if (msg.op === 'cancel') { tradeEnd(tr2, 'cancelled', ((sideA ? ca : cb).name || 'Someone') + ' ended the trade.'); return { ok: true }; }
    if (msg.op === 'answer') {
        if (tr2.status !== 'asking' || !sideB) return { error: 'There is nothing to answer.' };
        if (msg.yes !== true) { tradeEnd(tr2, 'cancelled', (cb.name || 'They') + ' declined the trade.'); return { ok: true }; }
        tr2.status = 'open'; tradeTell(tr2); return { ok: true };
    }
    if (tr2.status !== 'open') return { error: 'The trade has not started yet.' };
    var mine = msg.side === 'b' && sideB ? 'b' : msg.side === 'a' && sideA ? 'a' : sideA ? 'a' : 'b';   // the GM holding both sides names the side
    if (msg.op === 'put') {
        var chM = mine === 'a' ? ca : cb, off = S.cleanTradeOffer(camp.system, chM, msg.offer, who(tr2[mine]));
        var accW = S.tradeAcceptSays ? S.tradeAcceptSays(camp.system, chM, off, mine === 'a' ? cb : ca) : ''; if (accW) return { error: accW };   // 157 M1b: money the other side does not accept
        if (mine === 'a') tr2.offA = off; else tr2.offB = off; var had = tr2.okA || tr2.okB; tr2.okA = false; tr2.okB = false;
        tradeTell(tr2, null, had ? 'The offer changed: confirm again.' : ''); return { ok: true };
    }
    if (msg.op === 'into') {   // the receiver picks the row of its own list an amount lands on: '' the first that fits, '+' a row of its own
        var fT = typeof msg.fid === 'string' ? (camp.system.fields || []).filter(function(x) { return x && x.id === msg.fid && x.kind === 'item-list' && x.list && x.list.trade === true; })[0] : null;
        var rowT = typeof msg.row === 'string' && (msg.row === '' || msg.row === '+' || /^[A-Za-z0-9_-]{1,40}$/.test(msg.row)) ? msg.row : null; if (!fT || rowT === null) return { error: 'That is not a row of yours.' };
        var inM = mine === 'a' ? tr2.intoA : tr2.intoB; if (rowT) inM[fT.id] = rowT; else delete inM[fT.id];
        var hadI = tr2.okA || tr2.okB; tr2.okA = false; tr2.okB = false; tradeTell(tr2, null, hadI ? 'The offer changed: confirm again.' : ''); return { ok: true };
    }
    if (msg.op === 'accepts') {   // 157 M1b: the currencies a side accepts, set in the window by whoever acts for it, kept on its character for next time
        var chT = mine === 'a' ? ca : cb, tN = S.cleanTrader ? S.cleanTrader(Object.assign({}, chT.trader || {}, { acc: Array.isArray(msg.acc) ? msg.acc : [] })) : null;
        if (tN) chT.trader = tN; else delete chT.trader; chT.updated = Date.now(); saveRemoteSoon();
        var hadT = tr2.okA || tr2.okB; tr2.okA = false; tr2.okB = false; tradeTell(tr2, null, hadT ? 'The terms changed: confirm again.' : ''); return { ok: true };
    }
    if (msg.op === 'rates') {   // 157 M1c: a side's Buys at and Sells at, set in the window by whoever acts for it, kept on its character as what it accepts is
        if (!(S.tradeRatesOn && S.tradeRatesOn(camp.system))) return { error: 'This game sets no buy and sell prices.' };
        var chR = mine === 'a' ? ca : cb, rN = Object.assign({}, chR.trader || {}); ['buy', 'sell'].forEach(function(k) { if (typeof msg[k] === 'number') rN[k] = msg[k]; else delete rN[k]; });
        var rC = S.cleanTrader ? S.cleanTrader(rN) : null; if (rC) chR.trader = rC; else delete chR.trader; chR.updated = Date.now(); saveRemoteSoon();
        var hadR = tr2.okA || tr2.okB; tr2.okA = false; tr2.okB = false; tradeTell(tr2, null, hadR ? 'The terms changed: confirm again.' : ''); return { ok: true };
    }
    if (msg.op === 'xrates') {   // 157 M1e: what a side takes each currency at, set in the window by whoever acts for it, kept on its character
        if (!(camp.system && camp.system.trading && camp.system.trading.exchange === true)) return { error: 'This game sets no exchange rates.' };
        var chX = mine === 'a' ? ca : cb, xN = Object.assign({}, chX.trader || {}, { xr: msg.xr && typeof msg.xr === 'object' ? msg.xr : {} }), xC = S.cleanTrader ? S.cleanTrader(xN) : null;
        if (xC) chX.trader = xC; else delete chX.trader; chX.updated = Date.now(); saveRemoteSoon();
        var hadX = tr2.okA || tr2.okB; tr2.okA = false; tr2.okB = false; tradeTell(tr2, null, hadX ? 'The terms changed: confirm again.' : ''); return { ok: true };
    }
    if (msg.op === 'fence') {   // 157 M1j: whether a side fences, and what it buys the stolen and illegal at, set by whoever acts for it, kept on its character
        if (!(camp.system && camp.system.trading && camp.system.trading.hot === true)) return { error: 'This game marks nothing stolen.' };
        var chF = mine === 'a' ? ca : cb, fN = Object.assign({}, chF.trader || {}); if (msg.on === true) { fN.fence = true; if (typeof msg.amt === 'number' && isFinite(msg.amt) && msg.amt >= 0) fN.fenceAt = msg.amt; else delete fN.fenceAt; } else { delete fN.fence; delete fN.fenceAt; }
        var fC = S.cleanTrader ? S.cleanTrader(fN) : null; if (fC) chF.trader = fC; else delete chF.trader; chF.updated = Date.now(); saveRemoteSoon();
        var hadF = tr2.okA || tr2.okB; tr2.okA = false; tr2.okB = false; tradeTell(tr2, null, hadF ? 'The terms changed: confirm again.' : ''); return { ok: true };
    }
    if (msg.op === 'haggle') {   // 157 M1i: both sides roll the system's haggling roll on the host, and the difference in their margins moves the prices, once a trade
        var hgR = camp.system && camp.system.trading ? camp.system.trading.haggle : null; if (!hgR) return { error: 'This game sets no haggling.' }; if (tr2.hagDone) return { error: 'This trade has been haggled over already.' };
        var Fh = window.wpFormula, Dh = window.wpDiceCore; if (!Fh || !Dh || !S.haggleRoll) return { error: 'Haggling cannot be rolled here.' };
        var rlH = Dh.ruleOf ? Dh.ruleOf(null, camp.system.combat ? camp.system.combat.checks : '') : '', vH = [ca, cb].map(function(ch) { var rs = S.haggleRoll(camp.system, ch, Fh); return rs ? Dh.verdictOf(rs, rlH) : null; });
        if (!vH[0] || !vH[1] || vH[0].kind !== 'check' || vH[1].kind !== 'check') return { error: 'The haggling roll cannot be worked out for both sides.' };
        var pH = Math.max(-hgR.most, Math.min(hgR.most, Math.round(((vH[0].margin || 0) - (vH[1].margin || 0)) * hgR.step * 10) / 10)); tr2.hag = pH; tr2.hagDone = true; tr2.okA = false; tr2.okB = false;
        var saidH = 'Haggling. ' + (ca.name || 'A character') + ': ' + vH[0].text + '. ' + (cb.name || 'A character') + ': ' + vH[1].text + '. ' + (pH ? 'Prices move ' + Math.abs(pH) + '% toward ' + ((pH > 0 ? ca : cb).name || 'a character') + '.' : 'Prices stay as they are.');
        tradeCard([ca, cb], saidH); tradeTell(tr2, null, saidH + ' Confirm again.'); return { ok: true };
    }
    if (msg.op === 'hagat') {   // 157 M1i: what a merchant haggles at, set by the GM acting for it, kept on its character as its prices are
        var chH = mine === 'a' ? ca : cb; if (tr2[mine].by || !(chH.npc || !chH.ownerId)) return { error: 'Only the GM sets what a merchant haggles at.' };
        var hN = Object.assign({}, chH.trader || {}); if (typeof msg.amt === 'number' && isFinite(msg.amt) && msg.amt > 0) hN.hag = msg.amt; else delete hN.hag; var hC = S.cleanTrader ? S.cleanTrader(hN) : null; if (hC) chH.trader = hC; else delete chH.trader; chH.updated = Date.now(); saveRemoteSoon();
        tradeTell(tr2); return { ok: true };
    }
    if (msg.op === 'owe') {   // 157 M1h: I owe you, in place of money, set by whoever acts for that side
        var oN = typeof msg.amt === 'number' && isFinite(msg.amt) ? Math.max(0, Math.min(1e9, Math.round(msg.amt * 100) / 100)) : 0; if (mine === 'a') tr2.oweA = oN; else tr2.oweB = oN;
        var hadO = tr2.okA || tr2.okB; tr2.okA = false; tr2.okB = false; tradeTell(tr2, null, hadO ? 'The offer changed: confirm again.' : ''); return { ok: true };
    }
    if (msg.op === 'confirm') {
        if (mine === 'a') tr2.okA = msg.on === true; else tr2.okB = msg.on === true;
        if (!(tr2.okA && tr2.okB)) { tradeTell(tr2); return { ok: true }; }
        var accC = S.tradeAcceptSays ? S.tradeAcceptSays(camp.system, ca, tr2.offA, cb) || S.tradeAcceptSays(camp.system, cb, tr2.offB, ca) : ''; if (accC) { tr2.okA = false; tr2.okB = false; tradeTell(tr2, null, accC); return { error: accC }; }   // 157 M1b: terms changed since the money was put on
        var devC = S.tradeDeviceSays ? S.tradeDeviceSays(camp.system, ca, tr2.offA, cb) || S.tradeDeviceSays(camp.system, cb, tr2.offB, ca) : ''; if (devC) { tr2.okA = false; tr2.okB = false; tradeTell(tr2, null, devC); return { error: devC }; }   // 157 M1k
        var hotC = S.tradeHotSays ? S.tradeHotSays(camp.system, ca, tr2.offA, cb) || S.tradeHotSays(camp.system, cb, tr2.offB, ca) : ''; if (hotC) { tr2.okA = false; tr2.okB = false; tradeTell(tr2, null, hotC); return { error: hotC }; }   // 157 M1j: no fence takes what is stolen
        var chgC = S.tradeChange ? S.tradeChange(camp.system, ca, tr2.offA, cb, tr2.offB, typeof tr2.hag === 'number' ? tr2.hag : 0) : null;   // 157 M1d: what the payer agreed to give over, said on the card
        var res = S.tradeApply(camp.system, ca, cb, tr2.offA, tr2.offB, who(tr2.a), who(tr2.b), { a: tr2.intoA, b: tr2.intoB });
        if (!res.ok && res.reason === 'empty' && ((tr2.oweA || 0) - (tr2.oweB || 0))) res = { ok: true, valuesA: {}, valuesB: {}, linesA: [], linesB: [] };   // 157 M1h: a trade of I owe you alone
        var oweNet = (tr2.oweA || 0) - (tr2.oweB || 0);
        if (!res.ok) { tr2.okA = false; tr2.okB = false; tradeTell(tr2, null, res.msg); return { error: res.msg }; }
        var paysT = tradePayers(camp, tr2), barT = paysT.length ? tradeBar(camp, paysT) : ''; if (barT) { tr2.okA = false; tr2.okB = false; tradeTell(tr2, null, barT); return { error: barT }; }
        if (typeof S.tradeRolls === 'function' && window.wpDice && typeof window.wpDice.rollFor === 'function' && window.wpFormula) S.tradeRolls(camp.system, ca, tr2.offA, window.wpFormula).concat(S.tradeRolls(camp.system, cb, tr2.offB, window.wpFormula)).forEach(function(q) { window.wpDice.rollFor(q.charId, q.formula, q.label, { row: { f: q.f, r: q.r, i: q.i }, gmOnly: true }); });   // 1.6.2: on the sheets as they stand, so that the row is still there to roll on; the GM's to see
        var logT = { id: tr2.tid, at: Date.now(), a: { charId: tr2.a.charId, name: String(ca.name || 'A character').slice(0, 60), before: {}, after: JSON.parse(JSON.stringify(res.valuesA)) }, b: { charId: tr2.b.charId, name: String(cb.name || 'A character').slice(0, 60), before: {}, after: JSON.parse(JSON.stringify(res.valuesB)) } };   // 157 M1g: what the trade log can put back
        Object.keys(res.valuesA).forEach(function(k) { logT.a.before[k] = JSON.parse(JSON.stringify(ca.values && ca.values[k] !== undefined ? ca.values[k] : [])); }); Object.keys(res.valuesB).forEach(function(k) { logT.b.before[k] = JSON.parse(JSON.stringify(cb.values && cb.values[k] !== undefined ? cb.values[k] : [])); });
        tr2.closing = true; var now = Date.now(); ca.values = ca.values || {}; cb.values = cb.values || {};
        var goA = typeof S.sheetsGo === 'function' ? S.sheetsGo(camp.system, camp, ca, res.valuesA) : { give: [] }, goB = typeof S.sheetsGo === 'function' ? S.sheetsGo(camp.system, camp, cb, res.valuesB) : { give: [] };   // 1.6.2 (vehicles, fold (a)): the sheets of the rows that changed hands
        Object.keys(res.valuesA).forEach(function(k) { ca.values[k] = res.valuesA[k]; }); Object.keys(res.valuesB).forEach(function(k) { cb.values[k] = res.valuesB[k]; }); ca.updated = now; cb.updated = now;
        saveRemoteSoon();
        if (Object.keys(res.valuesA).length) net.syncCharDelta(tr2.a.charId, res.valuesA); if (Object.keys(res.valuesB).length) net.syncCharDelta(tr2.b.charId, res.valuesB);
        if (window.wpSheets) { window.wpSheets.charChanged(tr2.a.charId); window.wpSheets.charChanged(tr2.b.charId); }
        goA.give.concat(goB.give).forEach(function(sid) { net.syncChar(sid); if (window.wpSheets) window.wpSheets.charChanged(sid); });   // the sheets that went with their rows, to their new owners
        if (goA.give.length + goB.give.length && window.wpStepLog) window.wpStepLog('rowsheet v1', 'traded', { sheets: goA.give.length + goB.give.length, dropped: (goA.drop || 0) + (goB.drop || 0) });
        if (paysT.length) tradeSpend(camp, paysT);
        var said = (ca.name || 'A character') + ' gave ' + (res.linesA.join(', ') || 'nothing') + '. ' + (cb.name || 'A character') + ' gave ' + (res.linesB.join(', ') || 'nothing') + '.';
        if (oweNet && S.debtPut && S.debtOf) { var dbW = S.debtOf(ca, cb.id) + oweNet; S.debtPut(ca, cb, dbW); net.syncChar(tr2.a.charId); net.syncChar(tr2.b.charId); said += ' ' + (oweNet > 0 ? (ca.name || 'A character') + ' owes ' + (cb.name || 'a character') + ' ' + (Math.round(oweNet * 100) / 100) : (cb.name || 'A character') + ' owes ' + (ca.name || 'a character') + ' ' + (Math.round(-oweNet * 100) / 100)) + ' more.'; }   // 157 M1h: the debt both sheets keep
        if (chgC) said += ' ' + ((chgC.payer === 'a' ? cb : ca).name || 'A character') + ' kept ' + chgC.over + ' over the price.';
        tradeCard([ca, cb], 'Trade done. ' + said);
        if (oweNet) logT.owe = oweNet; logT.said = 'Trade done. ' + said; if (typeof tradeLogPut === 'function') tradeLogPut(logT);   // 157 M1h: the debt it made, which Put back takes off
        tradeEnd(tr2, 'done', 'Trade done. ' + said);
        return { ok: true };
    }
    return { error: 'That is not a step of a trade.' };
}
// what a trade did: a private line to each side's player at the table and the GM (the damageCard pattern), and the Game Record
// 157 M2: a player's ask to change their money waits in the Review as one line of the character's ask, as a stat's ask does (char-ask): a newer ask
// of the same row replaces the older line, the GM is told by a card and a Session Log line, and nothing of the character changes until they apply it
function moneyAskPut(camp, ch, pr, q, conn) {
    var S = SC(), say = function(reason, text) { try { conn.send({ type: 'char-deny', rid: q.rid, reason: reason, msg: text || '' }); } catch (e) { sendFailed(e); } };
    var a = S && S.moneyAsk ? S.moneyAsk(camp.system, ch, q.fieldId, q) : { ok: false, reason: 'missing' };
    if (!a.ok) { say(a.reason === 'same' ? 'money' : a.reason, a.reason === 'same' ? 'That is what it holds now.' : a.msg); return; }
    var ups = Array.isArray(camp.uploads) ? camp.uploads : [], ent = null; ups.forEach(function(u) { if (!ent && u && u.ask === true && u.charId === ch.id) ent = u; });
    var chs = ent && Array.isArray(ent.changes) ? ent.changes.filter(function(c) { return !(c && c.kind === 'fact' && c.f === q.fieldId && c.row === q.rowId); }) : [];
    if (chs.length >= S.LIMITS.uploadChanges) { say('money', 'Your GM has too many changes to review. Try again later.'); return; }
    var n = 0; chs.forEach(function(c) { var m = /^u_([a-z0-9]{1,8})$/.exec((c && c.id) || ''); if (m) n = Math.max(n, parseInt(m[1], 36) || 0); }); a.change.id = 'u_' + (n + 1).toString(36); chs.push(a.change);
    var now = Date.now(), rest = ups.filter(function(u) { return u !== ent; }), e = ent || { id: 'up_' + now.toString(36) + Math.random().toString(36).slice(2, 6), charId: ch.id, from: pr.id, name: String(pr.name || 'A player').slice(0, 60), ask: true };
    e.at = now; e.changes = chs; rest.push(e); camp.uploads = rest.slice(-S.LIMITS.uploads); saveRemoteSoon();
    var t = (pr.name || 'A player') + ' asks to change ' + (ch.name || 'their character') + ': ' + a.change.label + ', ' + a.change.from + ' to ' + a.change.to + '.';
    toast(t); logEvent('char', t);
    if (window.wpSheets && window.wpSheets.approveNote) window.wpSheets.approveNote(ch.id, t, 'review', e.id);
    if (window.wpSheets && window.wpSheets.uploadsChanged) window.wpSheets.uploadsChanged(ch.id);
    say('money', 'Sent to your GM to review.');
}
// [thengmcheck:run-start]
// 1.6.2 (asked by the session that keeps a campaign's build, settled 2026-11-03): the steps of a player's roll's Then their view could not hold (systemcore thenGmCut: they read or
// change what players may not), run here from the GM's own entry on the host's own copy, after the rest, with the roll's result as the rest read it. No
// card goes out: what happens to the roller shows on their sheet, and the GM is told on a line of the Game Record. A step that reads what the roller
// answered (Ask.) or the one it is used on (On.) does not read it here
function thenGmRun(camp, ch, q, view, act, o) {
    var S = SC(); if (!S || !camp || !camp.system || !ch || !o || !o.F) return null; var sys = camp.system, gE = null;
    if (q.act) (Array.isArray(sys.rolls) ? sys.rolls : []).forEach(function(r) { if (!gE && r && r.id === q.act) gE = r; });
    else if (q.row) { var rg = rowOnGm(S, camp, view, q.row); (Array.isArray(sys.fields) ? sys.fields : []).forEach(function(f) { if (!gE && f && f.id === rg.f && f.list && Array.isArray(f.list.rolls)) gE = f.list.rolls[rg.i] || null; }); }
    if (!gE || !Array.isArray(gE.then)) return null;
    var steps = act.thenGm.map(function(i) { return gE.then[i]; }).filter(Boolean); if (!steps.length) return null;
    var th = S.thenChanges({ then: steps }, o.mf ? false : (o.vd && o.vd.kind === 'check' ? o.vd.pass : null), o.mf, o.cr, o.band); if (!th.length) return null;
    // 1.6.3 (the review of defense fold 2, finding 2): a roll Answered with a row of a list was pressed with a row (q.with), which its hidden steps read as
    // Row.<name> as its shown ones do; q.row stays a list's own roll alone
    var rq = q.row && q.row.r ? q.row : q.with && typeof q.with.f === 'string' && typeof q.with.r === 'string' ? q.with : null;
    var gv = S.makeResolver(sys, ch, o.F, o.tc); if (rq) { gv = gv.row(rq.f, rq.r, typeof rq.lv === 'number' ? rq.lv : undefined); if (!gv) return null; }
    var r = S.applyAct(sys, ch, { apply: th }, typeof S.withRollCrit === 'function' ? S.withRollCrit(gv, o.cr, typeof S.thenMargin === 'function' ? S.thenMargin(o.vd, o.mf) : 0, o.big === true, o.res) : gv, o.F, o.tc, rq ? { f: rq.f, r: rq.r } : null, undefined, o.D, null, typeof fxNow === 'function' ? fxNow(q.charId, null) : null);
    if (!r || !r.ok) return r;
    ch.values = ch.values || {}; Object.keys(r.values).forEach(function(k) { ch.values[k] = r.values[k]; }); ch.updated = Date.now(); saveRemoteSoon();
    if (Object.keys(r.values).length) { net.syncCharDelta(q.charId, r.values); if (window.wpSheets && window.wpSheets.charChanged) window.wpSheets.charChanged(q.charId); }
    logEvent('char', (ch.name || 'A character') + ': the hidden part of ' + String(o.label || 'a roll').slice(0, 60) + ' ran.');
    return r;
}
// [thengmcheck:run-end]
// [togmcheck:host-start]
// HR1: what the host keeps of each roll that went straight to the GM, in memory alone (the newest 50): whether its Then waits, whether it was a critical
// failure, and what it was rolled with. The GM's card offers Apply and Skip where it waits, and Roll again secretly and Decide on a critical failure
var _toGm = Object.create(null);
function toGmKeep(id, h) { var ks = Object.keys(_toGm); if (ks.length >= 50) delete _toGm[ks[0]]; _toGm[id] = h; }
function toGmApply(id) {
    var h = Object.prototype.hasOwnProperty.call(_toGm, id) ? _toGm[id] : null; if (!h || !h.wait || h.ran) return { error: 'That roll is not waiting now.' }; h.ran = 'apply';
    var S = h.S, mf = h.mf !== null && h.D.naturalOf(h.res) >= h.mf, vd = h.D.verdictOf(h.res, h.rule), cr = typeof S.thenCrit === 'function' ? S.thenCrit(vd, mf) : '', said = '';
    var th = h.act && h.act.then ? S.thenChanges(h.act, mf ? false : (vd && vd.kind === 'check' ? vd.pass : null), mf, cr, h.band) : [];
    if (th.length) {
        var ta = S.applyAct(h.camp.system, h.ch, { apply: th }, typeof S.withRollCrit === 'function' ? S.withRollCrit(h.vars, cr, typeof S.thenMargin === 'function' ? S.thenMargin(vd, mf) : 0, h.big, h.res) : h.vars, h.F, h.tc, h.q.row && h.q.row.r ? { f: h.q.row.f, r: h.q.row.r } : null, undefined, h.D, null, typeof fxNow === 'function' ? fxNow(h.q.charId, null) : null);
        if (ta && ta.ok) { h.ch.values = h.ch.values || {}; Object.keys(ta.values).forEach(function(k) { h.ch.values[k] = ta.values[k]; }); h.ch.updated = Date.now(); saveRemoteSoon(); if (Object.keys(ta.values).length) { net.syncCharDelta(h.q.charId, ta.values); if (window.wpSheets && window.wpSheets.charChanged) window.wpSheets.charChanged(h.q.charId); } }
        else if (ta && ta.message) said = String(ta.message);
    }
    if (h.act && Array.isArray(h.act.thenGm) && h.act.thenGm.length && typeof thenGmRun === 'function') thenGmRun(h.camp, h.ch, h.q, h.view, h.act, { cr: cr, mf: mf, vd: vd, big: h.big, res: h.res, band: h.band, tc: h.tc, D: h.D, F: h.F, label: h.label });
    logEvent('char', (h.ch.name || 'A character') + ': ' + (h.label || 'a roll') + ', applied by the GM.');
    return said ? { ok: true, said: said } : { ok: true };
}
function toGmAgain(id) {   // the same roll again, worked out here with what it was rolled with, a card the GM's alone
    var h = Object.prototype.hasOwnProperty.call(_toGm, id) ? _toGm[id] : null; if (!h) return { error: 'That roll is no longer kept.' };
    var res = h.F.evaluate(h.expr, { vars: h.vars }); if (!res || !res.ok) return { error: 'It could not be rolled again.' };
    var rec = { type: 'roll', id: h.D.uid(), from: h.from, expr: h.expr, draws: res.draws, v: h.F.VERSION, ts: Date.now(), priv: 'gm', label: String((h.label || 'Roll') + ': again, in secret').slice(0, 120) }; if (h.as) rec.as = h.as;
    pushRoll(rec, res, 'whisper', { cid: h.q.charId }); logEvent('dice', h.D.cardText(rec, res, h.F, { rule: h.rule }), { w: h.as || '', h: true });
    return { ok: true };
}
net.toGmButtons = function(wrap, rec) {
    var h = rec && typeof rec.id === 'string' && Object.prototype.hasOwnProperty.call(_toGm, rec.id) ? _toGm[rec.id] : null; if (!h || net.role === 'client' || !wrap || typeof document === 'undefined') return;
    var row = document.createElement('div'); row.className = 'chat-togm';
    var say = function(t) { while (row.firstChild) row.removeChild(row.firstChild); row.appendChild(document.createTextNode(t)); };
    var mk = function(txt, tip, fn) { var b = document.createElement('button'); b.type = 'button'; b.className = 'tool ghost'; b.textContent = txt; b.title = tip; b.addEventListener('click', fn); row.appendChild(b); };
    row.appendChild(document.createTextNode(h.crit === 'fumble' ? 'Sent to you, a critical failure. ' : 'Sent to you. '));
    if (h.wait && !h.ran) { mk('Apply', 'Run its Then now', function() { var r = toGmApply(rec.id); say(r.error || r.said || 'Applied.'); }); mk('Skip', 'Its Then does nothing', function() { h.ran = 'skip'; logEvent('char', (h.ch.name || 'A character') + ': ' + (h.label || 'a roll') + ', skipped by the GM.'); say('Skipped.'); }); }
    else if (h.wait) row.appendChild(document.createTextNode(h.ran === 'skip' ? 'Skipped. ' : 'Applied. '));
    if (h.crit === 'fumble' && !h.decided) { mk('Roll again secretly', 'Roll the same roll where only you see it', function() { var r = toGmAgain(rec.id); if (r.error) say(r.error); }); mk('Decide', 'Decide what happens yourself, with no roll', function() { h.decided = true; say('You decide.'); }); }
    wrap.appendChild(row);
};
// [togmcheck:host-end]
// [moneycheck:tradelog-start]
// 157 M1g: the GM's log of this session's trades, in memory alone (the newest 30): each side's lists before and after, so that Put back restores every
// row and coin where it still stands as the trade left it (systemcore tradeUndoList), and says plainly what could not come back
var _tradeLog = [];
function tradeLogPut(e) { _tradeLog.push(e); if (_tradeLog.length > 30) _tradeLog.shift(); }
net.tradeLog = function() { if (net.role === 'client') return []; return _tradeLog.slice().reverse().map(function(e) { var o = { id: e.id, at: e.at, said: String(e.said || '').slice(0, 1500) }; if (e.back) o.back = e.back; return o; }); };
net.tradeReverse = function(id) {
    if (net.role === 'client') return { error: 'Only the GM keeps the trade log.' };
    var e = _tradeLog.filter(function(x) { return x.id === id; })[0], S = SC(), camp = getActiveCampaign(); if (!e) return { error: 'That trade is no longer in the log.' }; if (e.back) return { error: 'That trade was put back already.' };
    if (!S || typeof S.tradeUndoList !== 'function' || !camp || !camp.system) return { error: 'The trade cannot be put back here.' };
    var missed = [], chars = [], nameOf = function(r) { var d = typeof S.rowDef === 'function' ? S.rowDef(camp.system, r) : null; return d && d.def && d.def.name ? String(d.def.name) : ''; };
    [e.a, e.b].forEach(function(sd) {
        var ch = typeof tradeChar === 'function' ? tradeChar(camp, sd.charId) : null; if (!ch) { missed.push(sd.name + '\u2019s sheet, which is gone'); return; }
        var vals = {}; ch.values = ch.values || {};
        Object.keys(sd.after).forEach(function(k) { var r = S.tradeUndoList(sd.before[k], sd.after[k], ch.values[k], nameOf); vals[k] = r.list; r.missed.forEach(function(m) { missed.push(sd.name + '\u2019s ' + m); }); });
        Object.keys(vals).forEach(function(k) { ch.values[k] = vals[k]; }); ch.updated = Date.now(); chars.push(ch);
        if (Object.keys(vals).length) { net.syncCharDelta(sd.charId, vals); if (window.wpSheets && window.wpSheets.charChanged) window.wpSheets.charChanged(sd.charId); }
    });
    if (typeof e.owe === 'number' && e.owe && S.debtPut && S.debtOf) { var dA = tradeChar(camp, e.a.charId), dB = tradeChar(camp, e.b.charId); if (dA && dB) { S.debtPut(dA, dB, S.debtOf(dA, dB.id) - e.owe); net.syncChar(e.a.charId); net.syncChar(e.b.charId); } else missed.push('the debt it made'); }   // 157 M1h
    saveRemoteSoon();
    e.back = missed.length ? 'Put back, but not ' + missed.join(', ') + ': they changed since.' : 'Put back.';
    if (chars.length && typeof tradeCard === 'function') tradeCard(chars, 'The GM put back a trade between ' + e.a.name + ' and ' + e.b.name + '.');
    return { ok: true, back: e.back, missed: missed };
};
// [moneycheck:tradelog-end]
function tradeCard(chars, text) {
    var t = String(text).slice(0, 1500), m = { type: 'chat', scope: 'whisper', from: { id: net.myId || 'gm', name: 'GM', gm: true }, text: t, ts: Date.now() }, to = Object.create(null);
    chars.forEach(function(ch) { if (ch && ch.ownerId && !ch.npc) to[ch.ownerId] = 1; });
    if (net.active && net.role === 'host') net.conns.forEach(function(c) { if (c.open && net.roster[c.peer] && to[peerProfileId(c)] === 1) { try { c.send(m); } catch (e) { sendFailed(e); } } });
    pushChat(m); logEvent('char', t);
}
// the API, the same on both ends: on a player's app one message to the synced host, on the GM's machine the host's own step
function tradeSendUp(o) {
    if (net.active && net.role === 'client') {
        if (net.stream) return { error: 'Not here.' };
        if (!net.foreign || !net.syncedPeer || !net.conns[0] || !net.conns[0].open || net.conns[0].peer !== net.syncedPeer) return { error: 'Not at the table yet.' };
        o.type = 'trade'; try { net.conns[0].send(o); } catch (e) { return { error: 'Could not reach the GM.' }; } return { ok: true, pending: true };
    }
    if (net.stream) return { error: 'Not here.' };
    return tradeDo({}, o);
}
net.tradeAsk = function(from, to) { return tradeSendUp({ op: 'ask', from: String(from || ''), to: String(to || '') }); };
net.tradeAnswer = function(tid, yes) { if (window.wpNotices && window.wpNotices.done) { try { window.wpNotices.done('trade:' + tid); } catch (e) {} } return tradeSendUp({ op: 'answer', tid: String(tid || ''), yes: yes === true }); };
net.tradePut = function(tid, offer, side) { var o = { op: 'put', tid: String(tid || ''), offer: Array.isArray(offer) ? offer.slice(0, 80) : [] }; if (side === 'a' || side === 'b') o.side = side; return tradeSendUp(o); };
net.tradeConfirm = function(tid, on, side) { var o = { op: 'confirm', tid: String(tid || ''), on: on === true }; if (side === 'a' || side === 'b') o.side = side; return tradeSendUp(o); };
net.tradeRates = function(tid, r, side) { var o = { op: 'rates', tid: String(tid || '') }; ['buy', 'sell'].forEach(function(k) { if (r && typeof r[k] === 'number' && isFinite(r[k])) o[k] = r[k]; }); if (side === 'a' || side === 'b') o.side = side; return tradeSendUp(o); };   // 157 M1c
net.tradeXRates = function(tid, xr, side) { var o = { op: 'xrates', tid: String(tid || ''), xr: {} }; if (xr && typeof xr === 'object') Object.keys(xr).slice(0, 13).forEach(function(k) { if (typeof xr[k] === 'number' && isFinite(xr[k])) o.xr[k] = xr[k]; }); if (side === 'a' || side === 'b') o.side = side; return tradeSendUp(o); };   // 157 M1e
net.tradeFence = function(tid, on, amt, side) { var o = { op: 'fence', tid: String(tid || '') }; if (on === true) o.on = true; if (typeof amt === 'number' && isFinite(amt)) o.amt = amt; if (side === 'a' || side === 'b') o.side = side; return tradeSendUp(o); };   // 157 M1j
net.tradeHaggle = function(tid, side) { var o = { op: 'haggle', tid: String(tid || '') }; if (side === 'a' || side === 'b') o.side = side; return tradeSendUp(o); };   // 157 M1i
net.tradeHagAt = function(tid, amt, side) { var o = { op: 'hagat', tid: String(tid || ''), amt: typeof amt === 'number' && isFinite(amt) ? amt : 0 }; if (side === 'a' || side === 'b') o.side = side; return tradeSendUp(o); };   // 157 M1i
net.tradeOwe = function(tid, amt, side) { var o = { op: 'owe', tid: String(tid || ''), amt: typeof amt === 'number' && isFinite(amt) ? amt : 0 }; if (side === 'a' || side === 'b') o.side = side; return tradeSendUp(o); };   // 157 M1h
net.debtSet = function(aId, bId, v) {   // 157 M1h: the GM's hand on a debt: a owes b v (below 0: b owes a), 0 clears; both sheets, saved, sent to their owners and logged
    if (net.role === 'client') return { error: 'Only the GM changes a debt.' }; var S = SC(), camp = getActiveCampaign(), a = camp && camp.chars ? camp.chars[aId] : null, b = camp && camp.chars ? camp.chars[bId] : null;
    if (!S || !S.debtPut || !a || !b || aId === bId) return { error: 'That debt cannot be set.' }; S.debtPut(a, b, v); a.updated = b.updated = Date.now(); saveRemoteSoon(); net.syncChar(aId); net.syncChar(bId);
    if (window.wpSheets && window.wpSheets.charChanged) { window.wpSheets.charChanged(aId); window.wpSheets.charChanged(bId); }
    var n = typeof v === 'number' && isFinite(v) ? Math.round(v * 100) / 100 : 0; logEvent('char', n > 0 ? (a.name || 'A character') + ' owes ' + (b.name || 'a character') + ' ' + n + ', set by the GM.' : n < 0 ? (b.name || 'A character') + ' owes ' + (a.name || 'a character') + ' ' + (-n) + ', set by the GM.' : 'The GM cleared the debt between ' + (a.name || 'a character') + ' and ' + (b.name || 'a character') + '.');
    return { ok: true };
};
net.tradeAccepts = function(tid, acc, side) { var o = { op: 'accepts', tid: String(tid || ''), acc: Array.isArray(acc) ? acc.slice(0, 13).map(String) : [] }; if (side === 'a' || side === 'b') o.side = side; return tradeSendUp(o); };   // 157 M1b
net.tradeInto = function(tid, fid, row, side) { var o = { op: 'into', tid: String(tid || ''), fid: String(fid || ''), row: typeof row === 'string' ? row : '' }; if (side === 'a' || side === 'b') o.side = side; return tradeSendUp(o); };
net.tradeCancel = function(tid) { return tradeSendUp({ op: 'cancel', tid: String(tid || '') }); };
net.tradeNow = function() { var ks = Object.keys(_tradeViews); return ks.length ? JSON.parse(JSON.stringify(_tradeViews[ks[ks.length - 1]])) : null; };
net.tradeViews = function() { return Object.keys(_tradeViews).map(function(k) { return JSON.parse(JSON.stringify(_tradeViews[k])); }); };
net.tradeOffer = function(charId, gm) {   // what this screen's side may put on the table, from its own copy of the character
    var S = SC(), camp = getActiveCampaign(), ch = tradeChar(camp, charId); if (!S || !S.tradeOfferable || !camp || !camp.system || !ch) return [];
    return S.tradeOfferable(camp.system, ch, gm ? 'gm' : 'player');
};
// a host's view, cleaned again on a player's app: ids by their patterns, names as short text, numbers as numbers, 40 lines a side
function cleanTradeView(v) {
    var S = SC(), N = S && S.TRADE_LINES ? S.TRADE_LINES : 400; if (!v || typeof v !== 'object' || typeof v.tid !== 'string' || !TRADE_TID.test(v.tid)) return null;
    var st = ['asking', 'open', 'done', 'cancelled'].indexOf(v.status) >= 0 ? v.status : null, you = ['a', 'b', 'both'].indexOf(v.you) >= 0 ? v.you : null; if (!st || !you) return null;
    var txt = function(s, n) { return typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, ' ').slice(0, n).trim() : ''; };
    var num = function(x) { return typeof x === 'number' && isFinite(x) && Math.abs(x) <= 1e9 ? x : null; };
    var side = function(s) {
        if (!s || typeof s !== 'object' || typeof s.charId !== 'string' || !/^c_[A-Za-z0-9_]{1,24}$/.test(s.charId)) return null;
        var lines = (Array.isArray(s.lines) ? s.lines.slice(0, N) : []).map(function(l) {
            if (!l || typeof l !== 'object' || typeof l.fid !== 'string' || typeof l.rowId !== 'string' || l.fid.length > 40 || l.rowId.length > 40) return null;
            var o = { fid: l.fid, rowId: l.rowId, name: txt(l.name, 80) || 'Item', list: txt(l.list, 60) };
            var pcV = S && S.cleanPic ? S.cleanPic(l.pic) : '', icV = S && S.cleanIcon && typeof l.icon === 'string' ? S.cleanIcon(l.icon) : ''; if (pcV) o.pic = pcV; if (icV) o.icon = icV;   // 1.6.2 (backlog 226): a picture of the campaign's own and an icon, cleaned again; anything else is none
            if (typeof l.key === 'string') { var a = num(l.amt); if (a === null) return null; o.key = l.key.slice(0, 40); o.amt = a; o.label = txt(l.label, 60) || o.key; }
            else { var q = num(l.qty); if (q === null || q < 1) return null; o.qty = Math.floor(q); var p = num(l.price); if (p !== null) { o.price = p; var dv = num(l.deal); if (dv !== null) o.deal = dv; var cdv = num(l.cond); if (cdv !== null && cdv >= 0 && cdv < 100) o.cond = Math.round(cdv); if (l.hot === 'stolen' || l.hot === 'illegal') o.hot = l.hot; } }
            return o;
        }).filter(Boolean);
        var out = { charId: s.charId, name: txt(s.name, 60) || 'A character', ok: s.ok === true, lines: lines };
        var gets = (Array.isArray(s.gets) ? s.gets.slice(0, N) : []).map(function(g) {
            if (!g || typeof g !== 'object' || typeof g.fid !== 'string' || g.fid.length > 40) return null;
            var pick = typeof g.pick === 'string' && (g.pick === '' || g.pick === '+' || /^[A-Za-z0-9_-]{1,40}$/.test(g.pick)) ? g.pick : '';
            var opts = (Array.isArray(g.opts) ? g.opts.slice(0, N) : []).map(function(o) { return o && typeof o === 'object' && typeof o.rowId === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(o.rowId) ? { rowId: o.rowId, name: txt(o.name, 80) || 'Item', cur: num(o.cur) } : null; }).filter(Boolean);
            return { fid: g.fid, list: txt(g.list, 60) || 'List', label: txt(g.label, 60) || 'It', pick: pick, opts: opts };
        }).filter(Boolean);
        if (gets.length) out.gets = gets;
        var mon = (Array.isArray(s.money) ? s.money.slice(0, 13) : []).map(function(x) { var n = x && typeof x === 'object' ? num(x.v) : null; return n === null ? null : { label: txt(x.label, 60) || 'Money', v: n }; }).filter(Boolean); if (mon.length) out.money = mon;   // 157 M1b
        var acS = (Array.isArray(s.acc) ? s.acc.slice(0, 13) : []).filter(function(k) { return typeof k === 'string' && /^(\*|[A-Za-z][A-Za-z0-9_]{0,23})$/.test(k); }); if (acS.length) out.acc = acS;
        ['buy', 'sell'].forEach(function(k) { var rv = num(s[k]); if (rv !== null && rv >= 0 && rv <= 1000) out[k] = Math.round(rv); });   // 157 M1c
        if (s.xr && typeof s.xr === 'object' && !Array.isArray(s.xr)) { var xrS = {}, xnS = 0; Object.keys(s.xr).slice(0, 13).forEach(function(k) { var xv = num(s.xr[k]); if (/^[A-Za-z][A-Za-z0-9_]{0,23}$/.test(k) && xv !== null && xv >= 0 && xv <= 1000) { xrS[k] = Math.round(xv); xnS++; } }); if (xnS) out.xr = xrS; }   // 157 M1e
        var maS = num(s.moneyAt); if (maS !== null) out.moneyAt = maS; var owS = num(s.owe); if (owS !== null && owS > 0) out.owe = owS; if (s.merch === true) out.merch = true; if (s.fence === true) { out.fence = true; var faS = num(s.fenceAt); if (faS !== null && faS >= 0) out.fenceAt = faS; } var haS = num(s.hagAt); if (haS !== null && haS >= 0) out.hagAt = haS;   // 157 M1h
        return out;
    };
    var a = side(v.a), b = side(v.b); if (!a || !b) return null;
    var o = { tid: v.tid, status: st, you: you, a: a, b: b }; if (v.rates === true) o.rates = true; if (v.xch === true) o.xch = true; var dbN = num(v.debt); if (dbN !== null && dbN !== 0) o.debt = dbN; if (v.hot === true) o.hot = true; if (typeof v.hotSays === 'string' && v.hotSays) o.hotSays = v.hotSays.slice(0, 300); if (typeof v.devSays === 'string' && v.devSays) o.devSays = v.devSays.slice(0, 300); if (v.hagOn === true) o.hagOn = true; if (v.hagDone === true) o.hagDone = true; var hgN = num(v.hag); if (hgN !== null && hgN !== 0 && Math.abs(hgN) <= 100) o.hag = hgN; if (v.change && typeof v.change === 'object' && (v.change.payer === 'a' || v.change.payer === 'b')) { var ovN = num(v.change.over); if (ovN !== null && ovN > 0) o.change = { payer: v.change.payer, over: ovN, say: txt(v.change.say, 300) }; } var cuV = (Array.isArray(v.curs) ? v.curs.slice(0, 13) : []).map(function(c) { return c && typeof c === 'object' && typeof c.key === 'string' && /^(\*|[A-Za-z][A-Za-z0-9_]{0,23})$/.test(c.key) ? { key: c.key, label: txt(c.label, 60) || c.key } : null; }).filter(Boolean); if (cuV.length) o.curs = cuV; var m = txt(v.msg, 200); if (m) o.msg = m; var cs = txt(v.cost, 200); if (cs) o.cost = cs; return o;
}
// [netcheck:trade-end]
// [split:body-end]
return { cleanTradeView: cleanTradeView, moneyAskPut: moneyAskPut, thenGmRun: thenGmRun, toGmKeep: toGmKeep, tradeConnGone: tradeConnGone, tradeDo: tradeDo, tradeForget: tradeForget, tradeKeep: tradeKeep, tradeLost: tradeLost, tradeMoved: tradeMoved };   // [split:glue]
}   // [split:glue]

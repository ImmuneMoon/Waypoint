/* netattack.js: a part of net.js (docs/REFACTOR_SPLIT_PLAN.md, split 2026-11-18 with no change in behavior).
   What it holds: attacks and defenses on the host. The attempt record an attack leaves for its target to answer (attemptMake,
   attemptPeek, attemptDrop and the rest, with the critok, bodyin, rollcalls and thru lines inside them), a line's area (areaAfter),
   a blow's record (blowMake, blowCrip), a landed attack (the land* functions, kept until its damage is applied), an attack sent on
   (sendOnPress) and the answers' lines (ansFrom, ansStamp). The branches of handleMessage that take these messages stay in net.js.
   Why it looks this way: these lines stood in net.js, and they still run exactly where they stood. net.js calls netAttack() at its
   line `// [split:netattack.js]`, so the body below runs in the old order, after everything above that line and before everything
   below it. The body keeps its lines at the left margin inside the install function, unchanged, so that every test that reads net.js
   (through tools/srcjoin.js, which puts these lines back) sees the old file. The first lines import what the body uses of net.js
   (live, so a value net.js changes later is read as it is then; cardEnt comes from nethold.js through net.js); the last line hands
   back the names net.js uses of it. Neither side may assign the other's names (tools/splitcheck.js holds it). Change the code here as
   if it still stood in net.js. Like net.js, this file is kept byte for byte by git (.gitattributes), with its CRLF line endings. */
// [split:of net.js]
import { DC, SC, broadcastRoster, cardEnt, chatLog, combatOver, diceSessionReset, fightOfTok, fightsBack, fightsKeep, fightsKeepSoon, fxLib, getActiveCampaign, handsTo, itemLib, logEvent, net, npcByOf, npcShown, own, peerProfileId, pushChat, rangeTo, renderChatSoon, save, saveRemoteSoon, sendFailed, targetHitIn, toast } from './net.js';   // [split:glue]
export function netAttack() {   // [split:glue]
// [split:body-start]
// [netcheck:attempt-start]
// 1.6.0 (a build's sort, B2: "resist at minus the attempt's margin"): a roll whose entry names Resisted by (a system roll ticked Resists an
// attempt) and that succeeds against the roller's target makes an attempt here, on the host alone: the target's character, the roll that
// resists it and how far it succeeded. The resist roll is posted to the target's character as a reminder card (to its player where it is a
// player's and the attempt was rolled in the open, else to the GM), and when that card's roll is made it reads the margin as AttemptMargin,
// once. The margin is the host's own record, never a player's word. Memory alone, the newest ATT_MAX, gone with the table
var _attempts = Object.create(null), _attIds = [], ATT_MAX = 100, ATT_GONE = 'That attempt has been resisted already, or is not there now.';
// 1.6.3 (the review of defense fold 0): a damage card's own words where its record is gone (a card that lands on someone else keeps a hard record, which a
// reload of the GM's Waypoint lets go), and a card whose roll is under way already, held by its card actions until it is accepted (busy, set as it is held)
var DMG_GONE = 'That damage card has been rolled already, or the GM\u2019s Waypoint reloaded since it came. Roll it from the sheet instead.', ATT_BUSY = 'That card is being rolled already.';
// WITH_GONE (1.6.3, the review of defense fold 2, finding 9): what a press of a roll Answered with a row of a list is told where its card is still there but that
// row can no longer answer it: not among the rows the card offered, or gone from the sheet since (sold, dropped, kept from them)
var WITH_GONE = 'That row cannot answer this card now.';
// WITH_ONLY (the review of fold 2, findings 3 and 4): a roll Answered with a row of a list is made only from a defense card, with a row; any other press of it is
// refused in these words on the host, the GM's own too, however it was reached, since its names read that row and would read nothing
var WITH_ONLY = 'That roll is made from a defense card, with one of your rows.';
function attGoneWords(id, camp, act, row, wr) {   // what a press whose record attemptPeek refused is told: busy, a damage card's words, a row that cannot answer it (wr, the press's with), else ATT_GONE
    var a = typeof id === 'string' && Object.prototype.hasOwnProperty.call(_attempts, id) ? _attempts[id] : null; if (a && a.busy) return ATT_BUSY; if (a && wr && typeof wr === 'object') return WITH_GONE;
    var sys = camp && camp.system, ent = null;
    if (row && typeof row === 'object' && typeof row.f === 'string' && typeof row.i === 'number') (sys && Array.isArray(sys.fields) ? sys.fields : []).forEach(function(f) { if (f && f.id === row.f && f.list && Array.isArray(f.list.rolls)) ent = f.list.rolls[row.i] || null; });
    else if (typeof act === 'string') (sys && Array.isArray(sys.rolls) ? sys.rolls : []).forEach(function(r) { if (r && r.id === act) ent = r; });
    return ent && ent.dmg === true ? DMG_GONE : ATT_GONE;
}
function attemptForget() { var keepA = Object.create(null); if (typeof _lands !== 'undefined' && _lands) Object.keys(_attempts).forEach(function(k) { if (Object.prototype.hasOwnProperty.call(_lands, k)) keepA[k] = _attempts[k]; }); _attempts = keepA; _attIds = [];   /* 1.6.3 (the review of defense fold 1): the attempt of a landing landForget kept stays with it */ if (typeof _callIds !== 'undefined') _callIds = []; }   // 1.6.3: and the called damage rolls kept apart
// 1.6.3 (defense fold 2): wr, the row a roll Answered with a row of a list was pressed with ({ f, r }, the wire's with): the attempt is taken only where it
// offered that very roll on that very row (its withs, each act#f#r, which attemptMake writes). A press that names no row never takes such a roll
function attemptPeek(id, charId, act, row, wr) { var a = typeof id === 'string' && Object.prototype.hasOwnProperty.call(_attempts, id) ? _attempts[id] : null; if (a && a.busy) return null; if (wr && typeof wr === 'object') return a && a.charId === charId && typeof act === 'string' && typeof wr.f === 'string' && typeof wr.r === 'string' && Array.isArray(a.withs) && a.withs.indexOf(act + '#' + wr.f + '#' + wr.r) >= 0 ? a.m : null; if (row && typeof row === 'object') return a && a.charId === charId && typeof row.i === 'number' && typeof row.r === 'string' && Array.isArray(a.rows) && a.rows.indexOf(row.f + '#' + row.i + '#' + row.r) >= 0 ? a.m : null; return a && a.charId === charId && (a.act === act || (Array.isArray(a.alts) && a.alts.indexOf(act) >= 0)) ? a.m : null; }   // 1.6.0: or a list's roll on one of the rows it offers   // 1.6.0 (the core's gap 5): or one of the other rolls it may be resisted by
function attemptDrop(id) { if (typeof id === 'string' && Object.prototype.hasOwnProperty.call(_attempts, id)) { delete _attempts[id]; _attIds = _attIds.filter(function(x) { return x !== id; }); if (typeof _callIds !== 'undefined') _callIds = _callIds.filter(function(x) { return x !== id; }); } }
// the roll's entry as the GM's own system holds it: a players' view says only that it is resisted (resisted: true), so the host finds the
// whole entry, a system roll by its id, a list's roll by the same label and formula
function attemptEntry(sys, q, act) {
    if (!act || act.resisted !== true || !sys) return null;
    var pool = [];
    if (q.act) pool = Array.isArray(sys.rolls) ? sys.rolls.filter(function(r) { return r && r.id === q.act; }) : [];
    else if (q.row) (Array.isArray(sys.fields) ? sys.fields : []).forEach(function(f) { if (f && f.id === q.row.f && f.kind === 'item-list' && f.list && Array.isArray(f.list.rolls)) pool = f.list.rolls; });
    for (var i = 0; i < pool.length; i++) { var r = pool[i]; if (r && typeof r.resistBy === 'string' && r.formula === act.formula && r.label === act.label) return r; }
    return null;
}
// 1.6.0 (asked by a system build): Or resisted by naming a list's roll (<field id>#<place>, systemcore listRollRef): that roll, ticked Resists an
// attempt, once for each row of that list the target holds, in the list's order, ATT_ROWS at most. On a player's card only a roll their own
// view holds and a row their own copy holds that is not kept from them (systemcore rowKeptFrom: a curse the GM keeps on or out of sight, a
// GM-only entry or row); on the GM's card every row. Each { f, r, i, label } pushed onto out. A roll with its own Shown where (showIf) is
// offered only on the rows where it holds for the target, worked out here from the target's character as the press is judged (a player's
// through their own view, as the roll-req branch reads it; the GM's through the system, as net.diceRoll does), at: { map, tok, mapId }, its token
var ATT_ROWS = 80;
// 1.6.0 An attempt's kind (attemptKey on the attack, systemcore attemptKeyOf): the stat of the attacker's row, read here off the host's own copy of the row
// the roll named, and never the attacker's word. A defense whose needs fail for it is not offered: a needs formula is read as the press will read it, a
// player's through their own view, with the margin and the kind on the target's token context. Only an attack that names a kind is judged so
function attKindRow(camp, entry, fromCh, rowRef) {   // { f: the list's field, def: the row's definition }, or null
    var S = SC(); if (!S || !camp || !camp.system || !rowRef || typeof rowRef.f !== 'string' || typeof rowRef.r !== 'string' || !fromCh || !fromCh.values || !Array.isArray(fromCh.values[rowRef.f]) || typeof entry.attemptKey !== 'string' || !entry.attemptKey) return null;
    var f = null; (Array.isArray(camp.system.fields) ? camp.system.fields : []).forEach(function(x) { if (x && x.id === rowRef.f && x.kind === 'item-list' && x.list) f = x; }); if (!f) return null;
    var row = null; fromCh.values[rowRef.f].forEach(function(x) { if (!row && S.rowIdOf(x) === rowRef.r) row = x; }); var rd = row ? S.rowDef(camp.system, row) : null;
    return rd && rd.def ? { f: f, def: rd.def } : null;
}
// 1.6.2 (the CORE session): an attempt's type, the attacking row's Attempt type formula worked out on the host's own record with that row's names; 0 with none or where it cannot be worked out
function attTypeOf(camp, entry, fromCh, rowRef) {
    var S = SC(), Fs = window.wpFormula; if (!S || !Fs || !camp || !camp.system || typeof entry.attemptType !== 'string' || !entry.attemptType || !rowRef || typeof rowRef.f !== 'string' || typeof rowRef.r !== 'string' || !fromCh) return 0;
    try { var rv = S.makeResolver(camp.system, fromCh, Fs).row(rowRef.f, rowRef.r); if (typeof rv !== 'function') return 0; var r = Fs.evaluate(entry.attemptType, { vars: rv }); var v = r && r.ok ? (typeof r.value === 'boolean' ? (r.value ? 1 : 0) : r.value) : 0; return typeof v === 'number' && isFinite(v) ? v : 0; } catch (e) { return 0; }
}
// 1.6.2 (the CORE session's batch 6, 7): what a resist roll reads of the attacking row, as Attempter.Row.<name>: each stat or column of that row any
// formula of the system names so, worked out on the host's own record with that row's names as the attack was made, and kept beside the attacker's
// figures (rd), never on the wire. The names wanted are found once a system (64 at most); none where nothing names one or the attack was no list's row
var _attRowW = typeof WeakMap === 'function' ? new WeakMap() : null;
function attRowFigs(camp, fromCh, rowRef) {
    var S = SC(), Fs = window.wpFormula; if (!S || !Fs || !camp || !camp.system || !fromCh || !rowRef || typeof rowRef.f !== 'string' || typeof rowRef.r !== 'string') return null;
    var w = _attRowW ? _attRowW.get(camp.system) : null; if (!w) { w = []; var re = /attempter\.row\.([A-Za-z][A-Za-z0-9_]{0,39})/gi, js = '', m; try { js = JSON.stringify(camp.system); } catch (e) { js = ''; } while ((m = re.exec(js))) { var k = m[1].toLowerCase(); if (w.indexOf(k) < 0 && w.length < 64) w.push(k); } if (_attRowW) _attRowW.set(camp.system, w); }
    if (!w.length) return null;
    try { var rv = S.makeResolver(camp.system, fromCh, Fs).row(rowRef.f, rowRef.r); if (typeof rv !== 'function') return null; var out = {}; w.forEach(function(k) { var v = rv('row.' + k); if (typeof v === 'boolean') v = v ? 1 : 0; out['row.' + k] = typeof v === 'number' && isFinite(v) ? v : 0; }); return out; } catch (e) { return null; }
}
function attKindOf(camp, entry, fromCh, rowRef) { var S = SC(), kr = attKindRow(camp, entry, fromCh, rowRef), v = kr ? S.rowStat(kr.f.list, kr.def, entry.attemptKey) : 0; return typeof v === 'number' && isFinite(v) ? v : 0; }
function attTokCtx(tch, toO, at) {   // the target's token context on the map the attempt was made at, read as the press will be: a player's for their own view, in the round of its fight
    var S = SC(), vtA = window.wpVtt, ruA = function(k) { return !vtA || (vtA.rulesOn ? vtA.rulesOn(k) : vtA.on(k)); }, cxA = null;
    try { cxA = at && typeof S.tokenCtx === 'function' ? S.tokenCtx(at.map, at.tok, { turning: ruA('turning'), posture: ruA('posture'), elevation: ruA('elevation'), viewer: toO ? tch.ownerId : undefined }) : null; if (at && typeof S.withRound === 'function' && typeof net.combatRoundOf === 'function') cxA = S.withRound(cxA, net.combatRoundOf(at.mapId, at.tok.id)); } catch (e) { cxA = null; }
    return cxA;
}
function attKindWord(camp, entry, fromCh, rowRef) { var S = SC(), kr = attKindRow(camp, entry, fromCh, rowRef); return kr && typeof S.statName === 'function' ? S.statName(kr.f.list, kr.def, entry.attemptKey) : ''; }   // the kind's value name, for a card that may say it
function attOffers(camp, tch, toO, r, at) {   // a system roll that resists: whether its needs hold for this attempt
    var S = SC(), Fs = window.wpFormula; if (!r.needs && !r.needsWhy) return true; if (!Fs) return false;
    try {
        if (!toO) return S.rollNeedsOk(r, S.makeResolver(camp.system, tch, Fs, S.withAttempt(attTokCtx(tch, false, at), at.m, at.k, at.r, at.t)), Fs);
        var view = window.wpSheets.playerSystem(camp), vr = null; (view && Array.isArray(view.rolls) ? view.rolls : []).forEach(function(x) { if (x && x.id === r.id) vr = x; }); if (!vr) return false;
        var chv = S.charFor(tch, view, tch.ownerId, { lib: fxLib(camp.system), items: itemLib(camp.system), full: camp.system }); if (!chv) return false;
        return S.rollNeedsOk(vr, S.makeResolver(view, chv, Fs, S.withAttempt(attTokCtx(tch, true, at), at.m, at.k, at.r, at.t)), Fs);
    } catch (e) { return false; }
}
// [netcheck:critok-start]
// 1.6.2: whether a defense answers a critical that is not resisted: its Answers a critical where, read on the defender as the host holds it, with the
// attempt's names (AttemptMargin, Attempt.kind, Attempter.<key>). None set, or one that cannot be worked out, answers no
function attCritOk(camp, tch, r, at) {
    var S = SC(), Fs = window.wpFormula; if (!r || typeof r.critOk !== 'string' || !r.critOk || !S || !Fs) return false;
    try { return S.rollNeedsOk({ needs: r.critOk }, S.makeResolver(camp.system, tch, Fs, S.withAttempt(attTokCtx(tch, false, at), at.m, at.k, at.r, at.t)), Fs) === true; } catch (e) { return false; }
}
// [netcheck:critok-end]
// room (1.6.3, the review of defense fold 2, finding 7): how many buttons the list may hold at most, ATT_ROWS where none is handed in. It answers how many rows
// were left out for want of room, which attemptMake logs
function attRowAlts(camp, tch, ref, toO, out, at, room) {
    var S = SC(), lr0 = S && typeof S.listRollRef === 'function' ? S.listRollRef(ref) : null, cut = 0; if (typeof room !== 'number') room = ATT_ROWS; if (!lr0) return 0;
    var f = null; (Array.isArray(camp.system.fields) ? camp.system.fields : []).forEach(function(x) { if (x && x.id === lr0.f && x.kind === 'item-list' && x.list && Array.isArray(x.list.rolls)) f = x; }); if (!f) return;
    var lr = f.list.rolls[lr0.i]; if (!lr || lr.resist !== true || typeof lr.formula !== 'string' || !lr.formula || lr.apply) return;
    var seen = null, ri = lr0.i;   // ri: its place as this card's press will name it. A player's press names a place in their own view, which may stand lower than on the GM's list
    if (toO) {
        if (f.vis === 'gm' || lr.gm === true || !window.wpSheets || typeof window.wpSheets.playerSystem !== 'function') return;
        var view = window.wpSheets.playerSystem(camp), vf = null; (view && Array.isArray(view.fields) ? view.fields : []).forEach(function(x) { if (x && x.id === lr0.f && x.kind === 'item-list') vf = x; });
        ri = typeof S.rollPlace === 'function' ? S.rollPlace(camp.system, view, lr0.f, lr0.i) : lr0.i; var vr = vf && vf.list && Array.isArray(vf.list.rolls) ? vf.list.rolls[ri] : null; if (!vr || vr.resist !== true || vr.formula !== lr.formula) return;
        var chv = S.charFor(tch, view, tch.ownerId, { lib: fxLib(camp.system), items: itemLib(camp.system), full: camp.system }); if (!chv) return;
        seen = Object.create(null); (chv.values && Array.isArray(chv.values[lr0.f]) ? chv.values[lr0.f] : []).forEach(function(r) { var id = S.rowIdOf(r); if (id) seen[id] = 1; });
    }
    var lb = String(lr.label || 'Roll').split('{')[0].trim() || 'Roll';
    var shw = toO ? vr.showIf : lr.showIf, Fs = window.wpFormula, rvs = null;   // 1.6.0: Shown where, as the host judges the press (none: every row, as before)
    var ndA = at && typeof at.k === 'number' ? (toO ? vr.needs : lr.needs) : ''; if (typeof ndA !== 'string') ndA = ''; var ndW = at && typeof at.k === 'number' && Array.isArray((toO ? vr : lr).needsWhy) ? (toO ? vr : lr).needsWhy : null;   // 1.6.0 An attempt's kind: its needs, only where the attack names a kind (1.6.2: and its reasons)
    if ((typeof shw === 'string' && shw) || ndA || ndW) { if (!Fs) return; var cxA = attTokCtx(tch, toO, at);
        if (ndA || ndW) cxA = S.withAttempt(cxA, at.m, at.k, at.r, at.t);
        try { rvs = S.makeResolver(toO ? view : camp.system, toO ? chv : tch, Fs, cxA); } catch (e) { return; } if (!rvs || typeof rvs.row !== 'function') return; }
    (tch.values && Array.isArray(tch.values[lr0.f]) ? tch.values[lr0.f] : []).forEach(function(row) {
        var rid = S.rowIdOf(row); if (typeof rid !== 'string' || !/^w_[A-Za-z0-9_]{1,24}$/.test(rid) || out.some(function(x) { return x.f === lr0.f && x.r === rid && x.i === ri; })) return;
        if (toO && (seen[rid] !== 1 || S.rowKeptFrom(camp.system, row))) return;
        if (rvs) { var rvA = null; try { rvA = rvs.row(lr0.f, rid); } catch (e) { rvA = null; } if (!rvA || (typeof shw === 'string' && shw && !S.rollNeedsOk({ needs: shw }, rvA, Fs)) || ((ndA || ndW) && !S.rollNeedsOk({ needs: ndA, needsWhy: ndW }, rvA, Fs))) return; }   // 1.6.0: only where its Shown where holds on that row, and an attempt's kind its needs
        var rd = S.rowDef(camp.system, row), nm = rd && rd.def && typeof rd.def.name === 'string' && rd.def.name.trim() ? rd.def.name.trim() : 'a row';
        if (out.length >= room) { cut++; return; }   // judged first, so a row counted as cut is one that would have been offered
        out.push({ f: lr0.f, r: rid, i: ri, label: (lb + ' with ' + nm).slice(0, 60) });
    });
    return cut;
}
// 1.6.3 (the review of defense fold 3, finding 6): whether an attempt is an attack's, whose defense reads the lines of When it answers an attack. It is where the
// attacking roll deals damage itself, names Its damage, rolls a burst, hits along a line with damage, or calls for a damage roll, or where it was made from a row
// of a list that holds a damage roll, a weapon whose damage the GM may apply by hand. A grab, a pin, an influence roll or a spell that deals no damage is no
// attack, so a line with no condition never answers one and no weapon is tested for one. Read on the GM's own entry (attemptEntry, areaEntry)
function atkDeals(camp, entry, rowRef) {
    var sys = camp && camp.system, S = typeof SC === 'function' ? SC() : null; if (!sys || !entry || typeof entry !== 'object') return false;
    if (entry.dmg === true || entry.landDmg !== undefined || !!entry.burst || (entry.area && typeof entry.area === 'object' && entry.area.dmg !== undefined)) return true;
    var fields = Array.isArray(sys.fields) ? sys.fields : [], listHurts = function(fid) { var f = fields.filter(function(x) { return x && x.id === fid && x.kind === 'item-list'; })[0]; return !!(f && f.list && Array.isArray(f.list.rolls) && f.list.rolls.some(function(r) { return r && r.dmg === true; })); };
    var rollHurts = function(id) { if (typeof id !== 'string' || !id) return false; var lr = S && typeof S.listRollRef === 'function' ? S.listRollRef(id) : null; if (lr) { var f = fields.filter(function(x) { return x && x.id === lr.f; })[0], r = f && f.list && Array.isArray(f.list.rolls) ? f.list.rolls[lr.i] : null; return !!(r && r.dmg === true); } return (Array.isArray(sys.rolls) ? sys.rolls : []).some(function(r) { return r && r.id === id && r.dmg === true; }); };
    if (Array.isArray(entry.calls) && entry.calls.some(function(c) { return c && rollHurts(c.roll); })) return true;
    return !!(rowRef && typeof rowRef.f === 'string' && listHurts(rowRef.f));
}
// ov (1.6.3, defense fold 4): an attack sent on (sendOnGo), { kon, k, t, kn }: the kind and type it was first made with, frozen, never read from the one who
// sends it; its card offers Take it, since it carries its damage. vars null then, so the first attack's Calls for never run again
function attemptMake(camp, entry, vd, malf, range, fromCh, priv, vars, rowRef, ov) {   // vars: the roller's names, which a Calls for that waits for it to be resisted is read with; rowRef: the row a list's roll was made on, where an attempt's kind is read
    var S = SC(); if (!S || !camp || !camp.system || !entry || typeof entry.resistBy !== 'string' || !vd || vd.kind !== 'check' || vd.pass !== true || malf === true) return null;
    var hidPriv = priv === 'hid'; if (hidPriv) priv = false;   // 1.6.3 (Fulllion: "Player still defends"): an attack hidden by the GM's choice alone (the hiderolls slice of net.js) still sends its Defend card to the attacked player, as an open attack does; only its own figures stay hidden (hdA below)
    var critOnly = entry.noResistOnCrit === true && typeof S.thenCrit === 'function' && S.thenCrit(vd, malf) === 'crit';   // 1.6.0: a critical success its system does not let be resisted makes no attempt; 1.6.2, but for a defense whose Answers a critical where holds for its defender (below)
    if (critOnly && !(Array.isArray(camp.system.rolls) ? camp.system.rolls : []).some(function(r) { return r && r.resist === true && typeof r.critOk === 'string' && !!r.critOk; })) return null;
    var rr = null; (Array.isArray(camp.system.rolls) ? camp.system.rolls : []).forEach(function(r) { if (r && r.id === entry.resistBy && r.resist === true && typeof r.formula === 'string' && !r.apply) rr = r; });
    if (!rr || !range || typeof range.tid !== 'string' || typeof range.mapId !== 'string' || !camp.items || !Object.prototype.hasOwnProperty.call(camp.items, range.mapId)) return null;
    var map = camp.items[range.mapId], tok = null; (map && Array.isArray(map.whiteboard) ? map.whiteboard : []).forEach(function(w) { if (w && w.id === range.tid) tok = w; });
    if (!tok || tok.hidden || tok.waiting || typeof tok.charId !== 'string' || !camp.chars || !Object.prototype.hasOwnProperty.call(camp.chars, tok.charId)) return null;
    var tch = camp.chars[tok.charId]; if (!tch || typeof tch.id !== 'string' || (fromCh && tch.id === fromCh.id)) return null;
    var m = typeof S.thenMargin === 'function' ? S.thenMargin(vd, false) : (typeof vd.margin === 'number' ? vd.margin : 0), id = '';
    while (!id || Object.prototype.hasOwnProperty.call(_attempts, id)) { id = 'a_'; while (id.length < 10) id += 'abcdefghijklmnopqrstuvwxyz0123456789'.charAt(Math.floor(Math.random() * 36)); }
    // 1.6.3 (defense fold 2): a roll Answered with a row of a list goes on a player's card only where their own view holds it with the same list and formula
    // (attWithView); otherwise the GM gets the card, as for a GM-only roll, so that a defense never goes missing because a player's view cannot offer it. The
    // review of that fold (finding 6): judged on every such roll the card would offer, its Or resisted by rolls too (a GM-only one is left off a player's card
    // as ever), since one their view cannot offer would otherwise drop off their card with no word
    var wOf = function(r) { return !!r && typeof r.withRow === 'string' && !!r.withRow; }, wBad = function(r) { return wOf(r) && !(typeof attWithView === 'function' && attWithView(camp, r)); };
    var wAltBad = (Array.isArray(entry.resistOr) ? entry.resistOr : []).some(function(oid) { return typeof oid === 'string' && oid.indexOf('#') < 0 && (Array.isArray(camp.system.rolls) ? camp.system.rolls : []).some(function(r) { return r && r.id === oid && r.id !== rr.id && r.resist === true && typeof r.formula === 'string' && !r.apply && r.vis !== 'gm' && wBad(r); }); });
    var toO = !priv && !tch.npc && !!tch.ownerId && rr.vis !== 'gm' && !wBad(rr) && !wAltBad, alts = [], rowsA = [], kindOn = ov && typeof ov === 'object' ? ov.kon === true : (typeof entry.attemptKey === 'string' && !!entry.attemptKey) || (typeof entry.attemptType === 'string' && !!entry.attemptType), rdA = null, kindA = kindOn ? (ov && typeof ov === 'object' ? { k: typeof ov.k === 'number' ? ov.k : 0, m: m, t: typeof ov.t === 'number' ? ov.t : undefined } : { k: attKindOf(camp, entry, fromCh, rowRef), m: m, t: attTypeOf(camp, entry, fromCh, rowRef) }) : null;   // 1.6.0 (the core's gap 5): the other rolls the target may pick, each a resist roll of the system, none GM-only on a player's card; 1.6.0: the attack's kind, only where it names one
    if (fromCh && typeof S.targetReadsOf === 'function') { try { rdA = S.targetReadsOf(camp.system, fromCh.id, { charOf: function() { return fromCh; }, F: window.wpFormula }); } catch (e) { rdA = null; } if (rdA && kindA) kindA.r = rdA; }
    if (fromCh && rowRef && typeof attRowFigs === 'function') { var rfA = attRowFigs(camp, fromCh, rowRef); if (rfA) { rdA = rdA || {}; Object.keys(rfA).forEach(function(k) { rdA[k] = rfA[k]; }); if (kindA) kindA.r = rdA; } }   // 1.6.2 (the CORE session's batch 6, 7): and of the attacking row, as Attempter.Row.<name>   // 1.6.0: what a resist roll reads of the attacker as Attempter.<key>, the fields combat.targetReads names, on the host's record alone
    if (range && typeof range.adk === 'number' && isFinite(range.adk)) { rdA = rdA || {}; rdA['@dk'] = range.adk; rdA['@dkp'] = typeof range.adkp === 'number' && isFinite(range.adkp) ? range.adkp : 0; if (kindA) kindA.r = rdA; }   // 1.6.2 (the CORE session's answer 7): the darkness at the attacker's place, which a Defense reads as AttackerDark and AttackerDarkPen
    // 1.6.3 (defense fold 2; docs/DEFENSE_INTERACTIONS_DESIGN.md 4.4, backlog 245): a roll Answered with a row of a list (withRow) is offered once for each row of
    // that list the defender may answer with (attWithRows), and never alone. The review of that fold (finding 7): the main roll's rows are made FIRST, so a
    // defender holding many rows of an Or resisted by list's roll can never crowd the main Defend off the card; then those list rolls' rows, then the rows of
    // any Or resisted by roll answered with a row, all within ATT_ROWS, and a row left out for room is logged (cut). Such a roll leaves the plain buttons. Its
    // needs are judged row by row there, so the kind's own judgment below passes over it. With the main roll answered by a row, nothing presses it bare
    // (noMain); a defender who holds no row it can be answered with is offered the other rolls, or none at all
    var withsA = [], mainW = wOf(rr), atW = Object.assign({ map: map, tok: tok, mapId: range.mapId, m: m }, rdA ? { r: rdA } : {}, kindA || {}), cutA = 0;
    if (mainW && typeof attWithRows === 'function') cutA += attWithRows(camp, tch, rr, toO, withsA, atW, ATT_ROWS) || 0;
    (Array.isArray(entry.resistOr) ? entry.resistOr : []).forEach(function(oid) { if (typeof oid === 'string' && oid.indexOf('#') > 0) { cutA += attRowAlts(camp, tch, oid, toO, rowsA, Object.assign({ map: map, tok: tok, mapId: range.mapId }, kindA), ATT_ROWS - withsA.length) || 0; return; }   // 1.6.0: a list's roll, a button a row
        (Array.isArray(camp.system.rolls) ? camp.system.rolls : []).forEach(function(r) { if (r && r.id === oid && r.id !== rr.id && r.resist === true && typeof r.formula === 'string' && !r.apply && !(toO && r.vis === 'gm') && alts.indexOf(r) < 0 && alts.length < 3) alts.push(r); }); });
    var noMain = false, atK = kindOn ? Object.assign({ map: map, tok: tok, mapId: range.mapId }, kindA) : null;   // 1.6.0 An attempt's kind: a defense whose needs fail is not offered, the next that holds standing first
    if (typeof attWithRows === 'function') alts.forEach(function(r) { if (wOf(r)) cutA += attWithRows(camp, tch, r, toO, withsA, atW, ATT_ROWS - rowsA.length) || 0; });
    if (cutA && window.wpStepLog) window.wpStepLog('attempt v1', 'rows cut', { cut: cutA, room: ATT_ROWS });
    if (mainW) noMain = true; alts = alts.filter(function(r) { return !wOf(r); });
    if (kindOn) { alts = alts.filter(function(r) { return attOffers(camp, tch, toO, r, atK); }); if (!mainW && !attOffers(camp, tch, toO, rr, atK)) { if (alts.length) rr = alts.shift(); else if (rowsA.length || withsA.length) noMain = true; else { if (window.wpStepLog) window.wpStepLog('attempt v1', 'none offered', { rows: 0 }); return null; } } }
    if (noMain && !alts.length && !rowsA.length && !withsA.length) { if (window.wpStepLog) window.wpStepLog('attempt v1', 'none offered', { rows: 0, withRow: 1 }); return null; }   // 1.6.3 (defense fold 2): a defense answered with a row, and the defender holds none it may use
    if (critOnly) {   // 1.6.2 (the CORE session): a critical that is not resisted is still answered by a defense whose Answers a critical where holds for its defender; a list's row is not offered then
        var atC = atK || Object.assign({ map: map, tok: tok, mapId: range.mapId, m: m }, rdA ? { r: rdA } : {}), cOk = function(r) { return attCritOk(camp, tch, r, atC); };
        alts = alts.filter(cOk); rowsA = []; withsA = withsA.filter(function(x) { var wr0 = null; (Array.isArray(camp.system.rolls) ? camp.system.rolls : []).forEach(function(r) { if (r && r.id === x.act) wr0 = r; }); return !!wr0 && cOk(wr0); });   // 1.6.3 (defense fold 2): a roll answered with a row stays on its rows where its Answers a critical where holds
        if (noMain || !cOk(rr)) { if (alts.length) { rr = alts.shift(); noMain = false; } else if (withsA.length) noMain = true; else { if (window.wpStepLog) window.wpStepLog('attempt v1', 'crit unanswered', {}); return null; } }
    }
    var hdA = hidPriv || (typeof S.hideFigOn === 'function' && S.hideFigOn(camp.system, fromCh));   // 1.6.2: its figure is hidden, on the host's own record; 1.6.3: and an attack the GM hid by choice, whose margin is its own figure
    _attempts[id] = { charId: tch.id, act: noMain ? '' : rr.id, m: m }; if (ov || typeof atkDeals !== 'function' || atkDeals(camp, entry, rowRef)) _attempts[id].atk = 1;   /* the review of fold 3 (finding 6): atk only for an attack that deals damage (atkDeals), so a grab, a pin or an influence roll reads no lines */ if (fromCh && typeof fromCh.id === 'string') _attempts[id].atkBy = fromCh.id; if (rowRef && typeof rowRef.f === 'string' && typeof rowRef.r === 'string') _attempts[id].atkRow = { f: rowRef.f, r: rowRef.r }; if (priv) _attempts[id].atkPriv = true; if (hdA) _attempts[id].hide = true;   /* 1.6.3 (defense fold 3): atk, an attack's attempt, whose defense reads the lines of When it answers an attack (ansPick); atkBy and atkRow, who made it and from which row, where a line tests the attacking weapon */ if (range.area) _attempts[id].area = range.area; if (kindOn) { _attempts[id].k = kindA.k; if (typeof kindA.t === 'number') _attempts[id].t = kindA.t; if (priv) _attempts[id].kp = true; } if (rdA) { _attempts[id].rd = rdA; if (priv) _attempts[id].kp = true; } if (alts.length) _attempts[id].alts = alts.map(function(r) { return r.id; }); if (rowsA.length) _attempts[id].rows = rowsA.map(function(x) { return x.f + '#' + x.i + '#' + x.r; }); if (withsA.length) _attempts[id].withs = withsA.map(function(x) { return x.act + '#' + x.f + '#' + x.r; }); _attIds.push(id); while (_attIds.length > ATT_MAX) delete _attempts[_attIds.shift()];
    var csA = vars && typeof S.callsDue === 'function' ? S.callsDue(entry, 'resisted', vars, window.wpFormula) : []; if (csA.length) { _attempts[id].calls = csA.map(function(c) { var cK = { roll: c.roll, by: c.by || '' }; if (c.byIf) cK.byIf = c.byIf; if (c.to === 'self') cK.to = 'self'; if (c.crew) cK.crew = c.crew; if (c.on) cK.on = c.on; return cK; }); _attempts[id].callBy = callName(entry); if (fromCh && typeof fromCh.id === 'string') { _attempts[id].callFrom = fromCh.id; if (typeof tokNameOf === 'function') _attempts[id].callFromName = tokNameOf(camp, range && range.mapId, fromCh); } if (rowRef && typeof rowRef.f === 'string' && typeof rowRef.r === 'string') _attempts[id].callRow = { f: rowRef.f, r: rowRef.r }; if (priv) _attempts[id].callPriv = true; }   // 1.6.0: Calls for, waiting for the target's roll   // 1.6.2: and who made it, on which row, for a call to the roller
    if (typeof net.postDue === 'function') net.postDue(tch, rr, 'resist', 1, toO, { att: id, by: fromCh && fromCh.name ? (toO && typeof npcByOf === 'function' ? npcByOf(camp, fromCh, tch.ownerId) : fromCh.name) : '', m: hdA && toO ? undefined : m, or: alts, rows: rowsA, withs: withsA, nm: noMain, kn: kindOn && !priv ? (ov && typeof ov === 'object' ? String(ov.kn || '') : attKindWord(camp, entry, fromCh, rowRef)) : '', lnd: ov && typeof ov === 'object' ? true : entry.landDmg !== undefined && typeof landDmgOf === 'function' && !!landDmgOf(camp, { dmg: entry.landDmg, row: rowRef && typeof rowRef.f === 'string' && typeof rowRef.r === 'string' ? { f: rowRef.f, r: rowRef.r } : null }) });   // 1.6.3 (the review of defense fold 1): Take it only where a landing will be made: its damage roll is there (landAfter's own test)
    return id;
}
// 1.6.3 (defense fold 2; docs/DEFENSE_INTERACTIONS_DESIGN.md 4.4, backlog 245: "a Defend that parries may ask which weapon ... and answer as that row"). A system
// roll ticked Resists an attempt may say Answered with a row of a list (withRow, a field id). Its card then offers it once for each row of that list the defender
// holds, as "Defend with Blade", and the press names that row beside the roll (the wire's with: { f, r }), so the roll, its needs, its Then and a call's Read on
// the one who resisted read that row's names as Row.<name>, and a call to a roll of that list lands on that row. attWithView says whether a player's card may
// offer such a roll: their own view must hold it with the same list and formula. attWithRows pushes { act, f, r, label } onto out for each row, room at most: on
// a player's card only rows their own copy holds and that are not kept from them (systemcore rowKeptFrom, as attRowAlts judges), on the GM's card every row. A
// roll with needs is offered only on the rows where they hold, read on that row with the attempt laid on (AttemptMargin, Attempt.kind and the rest), as the press
// will read them. Both read only the host's own records, never a player's word
function attWithView(camp, rr) {   // { view, vr, vf }: the players' view, the roll and the list as it holds them; null where a player's card cannot offer it
    var S = SC(); if (!S || !camp || !rr || !window.wpSheets || typeof window.wpSheets.playerSystem !== 'function') return null;
    var view = window.wpSheets.playerSystem(camp), vr = null, vf = null;
    (view && Array.isArray(view.rolls) ? view.rolls : []).forEach(function(x) { if (x && x.id === rr.id) vr = x; });
    (view && Array.isArray(view.fields) ? view.fields : []).forEach(function(x) { if (x && x.id === rr.withRow && x.kind === 'item-list') vf = x; });
    return vr && vf && vr.withRow === rr.withRow && vr.formula === rr.formula && vr.resist === true ? { view: view, vr: vr, vf: vf } : null;
}
function attWithRows(camp, tch, rr, toO, out, at, room) {   // answers how many rows were left out for want of room (the review of fold 2, finding 7)
    var S = SC(), Fs = window.wpFormula, cut = 0; if (typeof room !== 'number') room = ATT_ROWS; if (!S || !camp || !camp.system || !rr || typeof rr.withRow !== 'string' || !rr.withRow) return;
    var f = null; (Array.isArray(camp.system.fields) ? camp.system.fields : []).forEach(function(x) { if (x && x.id === rr.withRow && x.kind === 'item-list') f = x; }); if (!f) return;
    var wv = null, chv = null, seen = null, vr = rr;
    if (toO) {   // the roll and the rows as the player's own view and copy hold them
        if (f.vis === 'gm') return; wv = attWithView(camp, rr); if (!wv) return; vr = wv.vr;
        chv = S.charFor(tch, wv.view, tch.ownerId, { lib: fxLib(camp.system), items: itemLib(camp.system), full: camp.system }); if (!chv) return;
        seen = Object.create(null); (chv.values && Array.isArray(chv.values[f.id]) ? chv.values[f.id] : []).forEach(function(r) { var id = S.rowIdOf(r); if (id) seen[id] = 1; });
    }
    var nd = typeof vr.needs === 'string' ? vr.needs : '', ndW = Array.isArray(vr.needsWhy) ? vr.needsWhy : null, rvs = null;
    if (nd || ndW) { if (!Fs) return; var cx = S.withAttempt(attTokCtx(tch, toO, at), at.m, at.k, at.r, at.t); try { rvs = S.makeResolver(toO ? wv.view : camp.system, toO ? chv : tch, Fs, cx); } catch (e) { return; } if (!rvs || typeof rvs.row !== 'function') return; }
    var lb = String(vr.label || 'Roll').split('{')[0].trim() || 'Roll';
    (tch.values && Array.isArray(tch.values[f.id]) ? tch.values[f.id] : []).forEach(function(row) {
        var rid = S.rowIdOf(row); if (typeof rid !== 'string' || !/^w_[A-Za-z0-9_]{1,24}$/.test(rid) || out.some(function(x) { return x.act === rr.id && x.f === f.id && x.r === rid; })) return;
        if (toO && (seen[rid] !== 1 || S.rowKeptFrom(camp.system, row))) return;
        if (rvs) { var rvA = null; try { rvA = rvs.row(f.id, rid); } catch (e) { rvA = null; } if (!rvA || !S.rollNeedsOk({ needs: nd, needsWhy: ndW }, rvA, Fs)) return; }
        var rd = S.rowDef(camp.system, row), nm = rd && rd.def && typeof rd.def.name === 'string' && rd.def.name.trim() ? rd.def.name.trim() : 'a row';
        if (out.length >= room) { cut++; return; }   // the review of fold 2 (finding 7): counted, so attemptMake logs a row left out for room
        out.push({ act: rr.id, f: f.id, r: rid, label: (lb + ' with ' + nm).slice(0, 60) });
    });
    return cut;
}
// 1.6.3 (found in a live two-peer check of the defense folds): the label a defense made with a row is recorded under, its own label and the row's name,
// "Parry with Sword", as its card's button said (attWithRows), so the roll's card says which weapon parried. Made here on the host from its own records:
// the roll's label as pressed, the row by its id on the host's own copy of the character (ch). A row kept from players (systemcore rowKeptFrom), a row of a
// list the players do not see, and a row with no name are never named, since the card may go to the table: base comes back alone then. A label that
// names the row already is kept as it is. w: { f, r }, the row; base: the label as pressed; act: the roll's id, whose own label stands where the press
// names none. Both roll paths ask it where a press names its row (q.with, o.with), and ansTests asks it for the weapon test's "called for by"
function withLabel(camp, ch, w, base, act) {
    var S = SC(); if (!base && typeof act === 'string' && camp && camp.system && Array.isArray(camp.system.rolls)) camp.system.rolls.forEach(function(x) { if (!base && x && x.id === act && typeof x.label === 'string') base = x.label; });
    var lb = String(base || 'Roll').split('{')[0].trim() || 'Roll'; if (!S || !camp || !camp.system || !ch || !w || typeof w.f !== 'string' || typeof w.r !== 'string') return lb;
    var f = null; (Array.isArray(camp.system.fields) ? camp.system.fields : []).forEach(function(x) { if (x && x.id === w.f && x.kind === 'item-list') f = x; }); if (!f || f.vis === 'gm') return lb;
    var row = null; (ch.values && Array.isArray(ch.values[w.f]) ? ch.values[w.f] : []).forEach(function(x) { if (!row && S.rowIdOf(x) === w.r) row = x; });
    if (!row || (typeof S.rowKeptFrom === 'function' && S.rowKeptFrom(camp.system, row))) return lb;
    var rd = S.rowDef(camp.system, row), nm = rd && rd.def && typeof rd.def.name === 'string' ? rd.def.name.trim() : ''; if (!nm) return lb;
    var tail = ' with ' + nm; return lb.length >= tail.length && lb.slice(lb.length - tail.length) === tail ? lb : (lb + tail).slice(0, 60);
}
// [netcheck:bodyin-start]
// 1.6.2 (build 14; the owner by way of the Campaign beats session, 2026-11-04: "a miss by no more than that cover's penalty switches to the body
// automatically, the card says so, and the damage card goes to that body's token"). A roll that reads TargetBodyCover and misses by no more than it
// switches to the body: its card says so, and the roller's next damage roll lands on that body, while its pointer is on the same target and for ten
// minutes at most. Any other roll of that character ends it. The host's own, in memory alone, and never a hidden body.
// The owner's answers on its limits (by way of the Campaign beats session): the stray shot is a full hit, "a hit is a hit", so its Then and its calls
// run as a hit and anything aimed at the target is aimed at the body (bodyAim); the body makes no Defense; and a player who can see the target sees
// who took the shot, so the cards name the body to them (bodyView, which every send of a card and a latecomer's history asks) and to no one else.
// A critical failure hits nobody
var _bodyNext = Object.create(null);
function bodyName(camp, w) { var ch = w && camp && camp.chars && own(camp.chars, w.charId) ? camp.chars[w.charId] : null; return String((w && w.name) || (ch && ch.name) || '').slice(0, 60); }
function bodyAim(tc, rec) { return rec && rec.body === 1 && tc && tc.range && typeof rec.bodyTok === 'string' ? Object.assign({}, tc, { range: Object.assign({}, tc.range, { tid: rec.bodyTok }) }) : tc; }
function bodyView(m, p, camp) {   // a card as one player gets it: the body named where they can see the target, and the host's own keys left off
    if (!m || typeof m !== 'object' || (m.bodyTgt === undefined && m.bodyTok === undefined)) return m;
    var c = Object.assign({}, m), tc = typeof m.bodyTgt === 'string' && camp && camp.chars && own(camp.chars, m.bodyTgt) ? camp.chars[m.bodyTgt] : null; delete c.bodyTgt; delete c.bodyTok;
    if (c.bodyName && !(tc && typeof npcShown === 'function' && npcShown(camp, tc, p))) delete c.bodyName;
    return c;
}
function bodySwitch(camp, charId, rec, res, D, mf, rg, reads) {
    if (typeof charId !== 'string' || !rec) return false;
    delete _bodyNext[charId];
    if (!rg || !(rg.body > 0) || typeof rg.bodyTok !== 'string' || typeof rg.tid !== 'string' || typeof rg.mapId !== 'string' || !D || typeof D.verdictOf !== 'function' || typeof D.ruleOf !== 'function') return false;
    var vd = D.verdictOf(res, D.ruleOf(rec, camp && camp.system && camp.system.combat ? camp.system.combat.checks : ''));
    if (!vd || vd.kind !== 'check' || vd.pass !== false || typeof vd.margin !== 'number' || !isFinite(vd.margin) || -vd.margin > rg.body) return false;
    if (typeof mf === 'number' && typeof D.naturalOf === 'function' && D.naturalOf(res) >= mf) return false;   // a malfunction hits nobody
    if (vd.crit === 'fumble') return false;   // ... and nor does a critical failure
    if (typeof reads === 'function' && reads() !== true) return false;
    var map = camp && camp.items && own(camp.items, rg.mapId) ? camp.items[rg.mapId] : null, w = map && Array.isArray(map.whiteboard) ? map.whiteboard.find(function(x) { return !!x && x.id === rg.bodyTok; }) : null;
    if (!w || !w.isChar || w.hidden || typeof w.charId !== 'string' || !camp.chars || !own(camp.chars, w.charId)) return false;
    var tw = map.whiteboard.find(function(x) { return !!x && x.id === rg.tid; }), tgt = tw && typeof tw.charId === 'string' ? tw.charId : '', nm = bodyName(camp, w);
    _bodyNext[charId] = { ch: w.charId, tok: w.id, tid: rg.tid, mapId: rg.mapId, at: Date.now(), tgt: tgt, name: nm };
    rec.body = 1; rec.bodyTok = w.id; if (nm) rec.bodyName = nm; if (tgt) rec.bodyTgt = tgt;
    if (window.wpStepLog) window.wpStepLog('bodycover v1', 'switched', { by: -vd.margin, cover: rg.body });
    return true;
}
function bodyLand(rec, charId, rg) {
    var b = typeof charId === 'string' && own(_bodyNext, charId) ? _bodyNext[charId] : null; if (!b || !rec) return false;
    delete _bodyNext[charId];
    if (!rg || rg.tid !== b.tid || rg.mapId !== b.mapId || Date.now() - b.at > 600000) return false;
    rec.dmgOn = b.ch; rec.bodyOn = 1; if (b.name) rec.bodyName = b.name; if (b.tgt) rec.bodyTgt = b.tgt;
    if (window.wpStepLog) window.wpStepLog('bodycover v1', 'landed', {});
    return true;
}
net.bodyForget = function() { _bodyNext = Object.create(null); };
// [netcheck:bodyin-end]
// [netcheck:rollcalls-start]
// 1.6.0 (the owner, 2026-10-31, by prompt: "A card to press"): Calls for, on the host alone. A roll or an action of the
// system or a list posts another roll of the system as a card (systemcore callsDue picks which, cleanCalls says what each holds): to the character's
// player, or the GM for an NPC, a private roll or a GM-only roll, and only while that roll's own needs hold, read on the sheet as it now stands. Each
// card carries a soft record of its own, so a damage roll lands on the character the card is for (systemcore dmgOnSelf). A call that waits for the
// attempt to be resisted is kept on the attempt and read as the target's roll succeeds (attemptCalled). Its byIf is read then, on the one who resisted,
// through the system the host holds and with that roll's token context, a list's roll with its row's names: what cannot be worked out does not hold
function callName(entry) { return String(entry && entry.label || '').split('{')[0].trim().slice(0, 60); }
// 1.6.3 (defense fold 0; docs/DEFENSE_INTERACTIONS_DESIGN.md, Fulllion's decision 7 of 2026-11-17: "a choice on the call, The roller or Their target,
// starting as the target on a hit and the roller on a miss"). A called DAMAGE roll that lands on someone other than the character its card goes to carries a
// hard record (a_), not a soft one, stamped as it is posted with the character its damage lands on (land: { on, tok, map, name }, the host's alone and never
// sent; systemcore callLandOf says which, dmgLandOf reads it at the press), or with nobody (on: '') where the roll had no target. So its damage never moves to
// whoever the presser points at later, and a press whose record is gone is refused, never aimed again. Those records are kept apart from the other attempts
// (_callIds, CALL_MAX at most, the oldest let go first, said to the GM and logged), so a hundred newer attempts, wound rolls or a blast's Defense cards never
// push one out; attemptDrop takes one off the list once its roll is made, and attemptForget lets them all go with the table. A called roll that is no damage
// roll, and a damage roll that lands on the card's own character, keeps the soft record it always had: nothing there can be aimed again, since a press
// whose soft record is gone still lands on its own character (the review of fold 0: both roll paths hand dmgOnSelf the word that it answered a card), and
// such a card can still be pressed after the GM's Waypoint reloads
var _callIds = [], CALL_MAX = 500;
function callTarget(camp, tc) {   // whom the roll that brings the card was aimed at, read as attemptMake reads a target: a shown, seated character of the campaign; null for none
    var rg = tc && tc.range, mp = rg && typeof rg.tid === 'string' && typeof rg.mapId === 'string' && camp && camp.items && Object.prototype.hasOwnProperty.call(camp.items, rg.mapId) ? camp.items[rg.mapId] : null, tok = null;
    (mp && Array.isArray(mp.whiteboard) ? mp.whiteboard : []).forEach(function(w) { if (w && w.id === rg.tid) tok = w; });
    if (!tok || tok.hidden || tok.waiting || typeof tok.charId !== 'string' || !camp.chars || !Object.prototype.hasOwnProperty.call(camp.chars, tok.charId)) return null;
    var tch = camp.chars[tok.charId]; if (!tch || typeof tch.id !== 'string') return null;
    return { on: tch.id, tok: tok.id, map: rg.mapId, name: String(tok.charName || tok.name || tch.name || '').slice(0, 60) };
}
// 1.6.3 (the review of defense fold 0): the name a card gives a character, as the board shows them on a map: the token's own Character name box, else its
// name, else the sheet's. The token is tokId where it is one of theirs there, else the first of theirs that is shown and seated. So a GM who names a token apart
// from its sheet, as a disguise, never has the sheet's name put on a card. callTarget reads a target's name the same way
function tokNameOf(camp, mapId, ch, tokId) {
    if (!ch || typeof ch.id !== 'string') return '';
    var mp = typeof mapId === 'string' && camp && camp.items && Object.prototype.hasOwnProperty.call(camp.items, mapId) ? camp.items[mapId] : null, tok = null;
    (mp && Array.isArray(mp.whiteboard) ? mp.whiteboard : []).forEach(function(w) { if (!w || w.charId !== ch.id || w.hidden || w.waiting) return; if (typeof tokId === 'string' && w.id === tokId) tok = w; else if (!tok) tok = w; });
    return String((tok && (tok.charName || tok.name)) || ch.name || '').slice(0, 60);
}
// Where a call's damage lands, as callsAfter and attemptCalled stamp it: { on, ... }, { on: '' } for a target where the roll had none (the GM's Apply then
// aims it), or null for the card's own character. roller is the one who made the roll that brings the card (on an entry that applies to an adjacent
// character, the one who used it, never the one it was used on); target, where attemptCalled hands it in, the one who resisted it, and otherwise the one that
// roll was aimed at, read from tc, its token context. nm (1.6.3, the review of fold 0): { roller, target }, the names their tokens show, which win over a sheet's
function callLand(c, camp, tc, roller, target, nm) {
    var S = SC(), md = S && typeof S.callLandOf === 'function' ? S.callLandOf(c) : 'card', n = nm && typeof nm === 'object' ? nm : {};
    var who = function(x, nx) { return x && typeof x.id === 'string' ? { on: x.id, name: String(nx || x.name || '').slice(0, 60) } : { on: '' }; };
    if (md === 'roller') return who(roller, n.roller);
    if (md === 'target') return target !== undefined ? who(target, n.target) : (callTarget(camp, tc) || { on: '' });
    return null;
}
// whether a called damage roll's card needs a hard record: only where it lands on someone other than ch, the character the card goes to (nobody included)
function callHard(land, ch) { return !!land && typeof land === 'object' && !(ch && typeof ch.id === 'string' && land.on === ch.id); }
// The token context a press of a stamped card is worked out in (the review of fold 0, its finding 3): where the one it lands on is not the one the presser
// points at now, nothing of that live target is read (no range, so no Target.* figure, no cover, no body in the way, no facing; no location picked on
// them), so no figure of one sheet is mixed into damage that lands on another. Where they are the same character the context stands as it is
function callLandCtx(camp, tc, land) {
    if (!land || typeof land !== 'object' || !tc || typeof tc !== 'object' || (!tc.range && !tc.thit)) return tc;
    var live = typeof land.on === 'string' && land.on ? callTarget(camp, tc) : null; if (live && live.on === land.on) return tc;
    var t = Object.assign({}, tc); delete t.range; delete t.thit; return t;
}
function callKeep(id, land, ch, by) {   // the record of a called damage roll that lands on someone else: stamped where it lands, and kept apart. by: the name of the roll that brought it
    if (typeof _attempts === 'undefined' || typeof id !== 'string' || !Object.prototype.hasOwnProperty.call(_attempts, id)) return;
    var l = land && typeof land === 'object' ? land : { on: ch && typeof ch.id === 'string' ? ch.id : '' }, k = { on: typeof l.on === 'string' ? l.on : '' };
    if (typeof l.tok === 'string') k.tok = l.tok; if (typeof l.map === 'string') k.map = l.map; if (typeof l.name === 'string' && l.name) k.name = l.name;
    _attempts[id].land = k; _attempts[id].lt = { by: String(by || '').slice(0, 60), who: String(ch && ch.name || '').slice(0, 60) };   // lt: what the GM is told should it be let go
    if (typeof _attIds !== 'undefined') { var at = _attIds.indexOf(id); if (at >= 0) _attIds.splice(at, 1); }
    _callIds.push(id);
    while (_callIds.length > CALL_MAX) {
        var old = _callIds.shift(); if (!Object.prototype.hasOwnProperty.call(_attempts, old)) continue;
        var lo = _attempts[old], ltO = lo.lt || {}, onO = lo.land && lo.land.name ? lo.land.name : 'its target'; delete _attempts[old];
        if (window.wpStepLog) window.wpStepLog('attempt v1', 'call let go', { kept: CALL_MAX });
        if (typeof toast === 'function') toast((ltO.by ? ltO.by : 'An attack') + (ltO.who ? ' by ' + ltO.who : '') + ' on ' + onO + ' did not land: its damage card was let go, since ' + CALL_MAX + ' were waiting.');   // design 4.0: nothing is dropped in silence
    }
}
function callEntry(sys, q, act) {   // the whole entry behind what a player's view holds
    if (!act || !sys) return null; var pool = [];
    if (q.act) pool = Array.isArray(sys.rolls) ? sys.rolls.filter(function(r) { return r && r.id === q.act; }) : [];
    else if (q.row) (Array.isArray(sys.fields) ? sys.fields : []).forEach(function(f) { if (f && f.id === q.row.f && f.kind === 'item-list' && f.list && Array.isArray(f.list.rolls)) pool = f.list.rolls; });
    for (var i = 0; i < pool.length; i++) { var r = pool[i]; if (r && Array.isArray(r.calls) && r.formula === act.formula && r.label === act.label) return r; }
    return null;
}
// 1.6.2: a list's roll posted on one row of the character the card is for: that list's roll, on a row it holds that its player may see, while the
// roll's needs hold on that row. The card's one button is that row's, at the place the press will name it (a player's own view may stand lower), and
// its record names that row alone, so the press passes as an answer (attemptPeek) and nothing else does
function callPostRow(camp, ref, ch, by, priv, row, big, land, tnow) {   // land (1.6.3): where its damage lands, as callLand says; tnow (1.6.3, defense fold 3): a weapon test under the Combat tab's Both, whose GM copy offers Roll it now (net.testNow)
    var S = SC(), Fc = window.wpFormula; if (!S || !Fc || !row || typeof row.r !== 'string' || row.f !== ref.f) return false;
    var f = null; (Array.isArray(camp.system.fields) ? camp.system.fields : []).forEach(function(x) { if (x && x.id === ref.f && x.kind === 'item-list' && x.list && Array.isArray(x.list.rolls)) f = x; }); if (!f) return false;
    var lr = f.list.rolls[ref.i]; if (!lr || typeof lr.formula !== 'string' || !lr.formula || lr.apply) return false;
    var rw = null; (ch.values && Array.isArray(ch.values[f.id]) ? ch.values[f.id] : []).forEach(function(x) { if (x && S.rowIdOf(x) === row.r) rw = x; }); if (!rw) return false;
    var toO = !priv && !ch.npc && !!ch.ownerId && f.vis !== 'gm' && lr.gm !== true && lr.vis !== 'gm' && rw.hid !== 1, ri = ref.i;
    if (toO) {   // the place their own view gives it, and the row as their own copy holds it
        if (!window.wpSheets || typeof window.wpSheets.playerSystem !== 'function') return false;
        var view = window.wpSheets.playerSystem(camp), vf = null; (view && Array.isArray(view.fields) ? view.fields : []).forEach(function(x) { if (x && x.id === f.id && x.kind === 'item-list') vf = x; });
        ri = typeof S.rollPlace === 'function' ? S.rollPlace(camp.system, view, f.id, ref.i) : ref.i; var vr = vf && vf.list && Array.isArray(vf.list.rolls) ? vf.list.rolls[ri] : null; if (!vr || vr.formula !== lr.formula) return false;
        var chv = S.charFor(ch, view, ch.ownerId, { lib: fxLib(camp.system), items: itemLib(camp.system), full: camp.system }); if (!chv || !(chv.values && Array.isArray(chv.values[f.id]) && chv.values[f.id].some(function(x) { return S.rowIdOf(x) === row.r; }))) return false;
    }
    if (lr.needs || lr.needsWhy) { var cv = null; try { cv = S.makeResolver(camp.system, ch, Fc, null); cv = typeof cv === 'function' ? cv.row(f.id, row.r) : null; } catch (e) { cv = null; } if (typeof cv !== 'function' || !S.rollNeedsOk(lr, cv, Fc)) return false; }
    if (typeof net.blowMake !== 'function' || typeof net.postDue !== 'function') return false;
    var dmC = lr.dmg === true && callHard(land, ch), id = net.blowMake(ch, 'r_row', {}, '', '', null, !dmC); if (!id) return false; _attempts[id].rows = [f.id + '#' + ri + '#' + row.r]; if (big === true) _attempts[id].big = true; if (dmC) callKeep(id, land, ch, by);   // 1.6.3: a damage roll that lands on someone else has a hard record that says where
    var lb = String(lr.label || 'Roll').split('{')[0].trim().slice(0, 60) || 'Roll';
    if (tnow === true) _attempts[id].tst = { f: f.id, r: row.r, i: ref.i, priv: !!priv };   // what the GM's Roll it now rolls: the roll by its place on the GM's own list
    net.postDue(ch, { id: 'r_row', label: lb }, 'called', 1, toO, { att: id, by: by, row: { f: f.id, r: row.r, i: ri }, label: lb, tnow: tnow === true && toO }); return true;
}
// big (1.6.2): the attack that called it landed as a heavy hit; kept on the card's record, so a damage roll made with it is a Major Wound if it injures at all
function callPost(camp, rollId, ch, by, priv, row, big, land, tnow) {   // row (1.6.2): the row a list's roll it names is posted on; land (1.6.3): where its damage lands, as callLand says; tnow (1.6.3, defense fold 3): a weapon test whose GM copy offers Roll it now
    var S = SC(), Fc = window.wpFormula; if (!S || !Fc || !camp || !camp.system || !ch || typeof ch.id !== 'string') return false;
    var lref = typeof S.listRollRef === 'function' ? S.listRollRef(rollId) : null; if (lref) return callPostRow(camp, lref, ch, by, priv, row, big, land, tnow);
    var rr = null; (Array.isArray(camp.system.rolls) ? camp.system.rolls : []).forEach(function(r) { if (r && r.id === rollId && (Array.isArray(r.apply) || typeof r.formula === 'string')) rr = r; }); if (!rr) return false;
    if (withRowNo(rr, 'Calls for')) return false;   // 1.6.3 (the review of defense fold 2, finding 3): made only from a defense card, with a row
    if (rr.needs || rr.needsWhy) { var cv = null; try { cv = S.makeResolver(camp.system, ch, Fc, null); } catch (e) { cv = null; } if (typeof cv !== 'function' || !S.rollNeedsOk(rr, (rr.to === 'near' || rr.to === 'target') && S.withOnSelf ? S.withOnSelf(cv, true) : cv, Fc)) return false; }
    var dmC = !Array.isArray(rr.apply) && rr.dmg === true && callHard(land, ch), toO = !priv && !ch.npc && !!ch.ownerId && rr.vis !== 'gm', id = Array.isArray(rr.apply) || typeof net.blowMake !== 'function' ? '' : net.blowMake(ch, rr.id, {}, '', '', null, !dmC);
    if (dmC && id) callKeep(id, land, ch, by);   // 1.6.3: a damage roll that lands on someone else has a hard record that says where
    if (big === true && id && Object.prototype.hasOwnProperty.call(_attempts, id)) _attempts[id].big = true;   // 1.6.2
    if (typeof net.postDue === 'function') net.postDue(ch, rr, 'called', 1, toO, { att: id, by: by }); return true;
}
// 1.6.3 (the review of defense fold 2, finding 3): a roll Answered with a row of a list is made only from a defense card, with a row, so a call or a blast's
// Defense roll that names it posts no card, which would only be refused. The GM is told once a session for each roll and place, and it is logged. True where it is such a roll
var _withNoSaid = Object.create(null);
function withRowNo(rr, where) {
    if (!rr || typeof rr.withRow !== 'string' || !rr.withRow) return false;
    var k = String(where) + '|' + rr.id; if (!_withNoSaid[k]) { _withNoSaid[k] = 1; if (typeof toast === 'function') toast(where + ' names ' + (String(rr.label || 'a roll').split('{')[0].trim() || 'a roll') + ', which is answered with a row, so no card was posted. It is made only from a defense card.'); }
    if (window.wpStepLog) window.wpStepLog('attempt v1', 'with row not posted', { where: String(where).slice(0, 30) });
    return true;
}
function crewPost(camp, c, ch, by, priv, big, land) { var S = SC(); if (!S || typeof S.crewAt !== 'function' || !camp || !camp.chars || !ch) return; S.crewAt(camp.system, camp.chars, ch.id, c.crew).forEach(function(id) { var x = Object.prototype.hasOwnProperty.call(camp.chars, id) ? camp.chars[id] : null; if (x) callPost(camp, c.roll, x, by, priv, null, big === true, land); }); }   // 1.6.2 (vehicles, fold (f)): a call to the crew at its stations, one card each, on each crew sheet
// 1.6.2 (the owner, by prompt: "A roll ticked Kept for the scene"): the host keeps what a roll so ticked came to on the token it was rolled at, as
// that token's reaction (the GM's alone, never on the wire), read by later rolls as Target.Reaction; the scene's end lets it go
function sceneKeep(camp, entry, res, tc) {
    var S = SC(); if (net.role !== 'host' && net.active) return; if (!camp || !entry || entry.keep !== 'scene' || !res || !res.ok || !tc || !tc.range || typeof tc.range.tid !== 'string' || typeof tc.range.mapId !== 'string') return;
    var mp = camp.items && Object.prototype.hasOwnProperty.call(camp.items, tc.range.mapId) ? camp.items[tc.range.mapId] : null, tok = mp && Array.isArray(mp.whiteboard) ? mp.whiteboard.filter(function(w) { return w && w.id === tc.range.tid; })[0] : null; if (!tok) return;
    var v = S && typeof S.rollTotalOf === 'function' ? S.rollTotalOf(res) : res.value; if (typeof v !== 'number' || !isFinite(v)) return;
    tok.reaction = Math.max(-9999, Math.min(9999, Math.round(v))); if (typeof saveRemoteSoon === 'function') saveRemoteSoon();
    if (window.wpStepLog) window.wpStepLog('scene v1', 'reaction', { kept: 1 });
}
function callsAfter(camp, entry, pass, vars, ch, priv, row, big, tc, roller) {   // roller (1.6.3, the review of fold 0): who made the roll, where ch is the one an entry was used on   // tc (1.6.3): the roll's token context, whose target a call's damage may land on   // big (1.6.2): the roll landed as a heavy hit   // pass: the roll's verdict, null for an action or a roll with no check; row (1.6.2): the row a list's roll was made on
    var S = SC(); if (!S || typeof S.callsDue !== 'function' || !entry || !Array.isArray(entry.calls)) return;
    var rl = roller && typeof roller.id === 'string' ? roller : ch, rlN = tokNameOf(camp, tc && tc.selfMap, rl, tc && tc.self);
    // a roll that hits a line has no one target (the tokens it hit each get their own resist), so a call's damage that would land on the target is aimed by the GM
    S.callsDue(entry, pass === true ? 'hit' : pass === false ? 'miss' : '', vars, window.wpFormula).forEach(function(c) { var ln = entry.area && S.callLandOf && S.callLandOf(c) === 'target' ? { on: '' } : callLand(c, camp, tc, rl, undefined, { roller: rlN }); if (c.crew) { crewPost(camp, c, ch, callName(entry), priv, big, ln); return; } callPost(camp, c.roll, ch, callName(entry), priv, row, big === true, ln); });
}
net.callsAfter = callsAfter;
function attemptByIf(camp, text, row, ch, tc) {
    var S = SC(), Fc = window.wpFormula, v = null; if (!S || !Fc || !camp || !camp.system) return false;
    try { v = S.makeResolver(camp.system, ch, Fc, tc || null); if (row && typeof row.f === 'string' && typeof row.r === 'string') v = v.row(row.f, row.r, typeof row.lv === 'number' ? row.lv : undefined); } catch (e) { v = null; }
    return typeof v === 'function' && S.rollNeedsOk({ needs: text }, v, Fc);
}
// [netcheck:thru-start] 1.6.2 (CORE Ch14; the owner, by prompt: "On the parry roll"): a list's roll ticked Takes the blow on this row that resists an
// attempt: the host keeps which row took it, for two minutes, in its memory alone, and the Take damage window on this machine names that row and
// ticks What is over its Dur goes on (sheets.js takeDamage through net.thruOf). The GM is told
var _thru = Object.create(null);
function thruNote(camp, ch, row, force) {   // force (1.6.3, defense fold 3): true where a line of When it answers an attack says Takes it on this row, false where the line picked says otherwise; absent, the list roll's own tick decides, as before
    if (force === false) return false;
    if (!camp || !camp.system || !ch || typeof ch.id !== 'string' || !row || typeof row.f !== 'string' || typeof row.r !== 'string' || (force !== true && typeof row.i !== 'number')) return false;
    var f = (Array.isArray(camp.system.fields) ? camp.system.fields : []).filter(function(x) { return x && x.id === row.f; })[0], rr = f && f.list && Array.isArray(f.list.rolls) && typeof row.i === 'number' ? f.list.rolls[row.i] : null; if (force !== true && (!rr || rr.thru !== true)) return false; if (!f) return false;
    var S = SC(), rw = (ch.values && Array.isArray(ch.values[f.id]) ? ch.values[f.id] : []).filter(function(r) { return S && S.rowIdOf(r) === row.r; })[0], rd = rw && S ? S.rowDef(camp.system, rw) : null, nm = rd && rd.def && rd.def.name ? String(rd.def.name).slice(0, 60) : 'a row';
    _thru[ch.id] = { r: row.r, at: Date.now() };
    var words = String(ch.name || 'A character').slice(0, 60) + ' took the blow on ' + nm + '. Apply its damage from Take damage: what is over its Dur goes on.';
    if (typeof logEvent === 'function') logEvent('table', words); if (typeof toast === 'function') toast(words); return true;
}
net.thruOf = function(charId) { var t = typeof charId === 'string' && _thru[charId] ? _thru[charId] : null; return t && Date.now() - t.at < 120000 ? t.r : null; };
// [netcheck:thru-end]
function attemptCalled(camp, rec, act, row, pass, ch, priv, tc, pick) {   // the target's roll against an attempt came in; tc: that roll's token context; pick (1.6.3, defense fold 3): the line of When it answers an attack that roll's success was judged by (ansPick), which both roll paths work out once, with the roll's result, and hand to areaAnswered too
    var atkC = !!rec && (rec.atk === 1 || typeof rec.lw === 'string');   // an attack's attempt (a landing's is one, whenever it was made)
    if (pick === undefined && pass === true && atkC && typeof ansPick === 'function') pick = ansPick(camp, rec, act, row, ch, tc, null, !!rec.area && typeof rec.lw !== 'string');   // a caller that handed none: judged here, with no result of the roll
    if (rec && typeof rec.lw === 'string' && typeof landAnswered === 'function') landAnswered(camp, rec.lw, pass, row, pass === true ? pick || null : null);   // 1.6.3 (defense fold 1): an attack that carries its damage lands unless its defense succeeded; fold 3: and then as its line says
    if (pass === true && pick && atkC && typeof ansTests === 'function') ansTests(camp, rec, pick, ch, priv, act, row);   // 1.6.3 (defense fold 3): a weapon test the line calls for, only on a success (the core's answer 1)
    if (rec && rec.fw && (pass === true || pass === false)) { var fwA = rec.fw; rec.fw = null; if (typeof window !== 'undefined' && typeof window.wpFlyLand === 'function') window.wpFlyLand(fwA, pass); if (rec.htAtt && typeof net.dueRolled === 'function') net.dueRolled(rec.htAtt); }   // 1.6.2 (the core's gap 214): a thing in flight lands where its target fails to resist, and is avoided where it resists
    if (pass === true && ch && typeof thruNote === 'function' && !(rec && (typeof rec.lw === 'string' || rec.area))) thruNote(camp, ch, row, pick && pick.line ? pick.line.does === 'thru' : undefined);   // the review of fold 3 (finding 3): nor for a line's hit, which areaAnswered rolls with its row stamped on it, so thruOf is never used beside a record
    if (pass === true && ch && pick && pick.line && atkC && !(typeof rec.lw === 'string' || rec.area) && typeof ansNote === 'function') ansNote(camp, ch, pick);   // the review of fold 3 (finding 2): with no landing record, the damage is applied by hand, so the GM is told what the line says   // 1.6.2: a parry on a row ticked Takes the blow on this row. 1.6.3 (defense fold 3): never for a landing, whose record carries its row (thru keyed to the record), and as the line picked says where one was
    if (!rec || pass !== true || !Array.isArray(rec.calls) || !ch) return;
    var ref = row && typeof row.f === 'string' && typeof row.i === 'number' ? row.f + '#' + row.i : act;
    rec.calls.forEach(function(c) {
        if (!((!c.by || c.by === ref) && (!c.byIf || attemptByIf(camp, c.byIf, row, ch, tc)))) return;
        var fc = typeof rec.callFrom === 'string' && camp.chars && Object.prototype.hasOwnProperty.call(camp.chars, rec.callFrom) ? camp.chars[rec.callFrom] : null;   // 1.6.2: to the roller, on the roller's own row
        var ln = callLand(c, camp, tc, fc, ch, { roller: typeof rec.callFromName === 'string' ? rec.callFromName : '', target: tokNameOf(camp, tc && tc.selfMap, ch, tc && tc.self) });   // 1.6.3: here the roller is the one who attacked and their target the one who resisted, each named as their token shows
        if (c.crew && c.to !== 'self') { crewPost(camp, c, ch, rec.callBy, priv, false, ln); return; } if (c.to !== 'self') { callPost(camp, c.roll, ch, rec.callBy, priv, row, false, ln); return; }
        if (fc) callPost(camp, c.roll, fc, rec.callBy, rec.callPriv === true, rec.callRow, false, ln);
    });
}
// [netcheck:rollcalls-end]
net.attemptsKept = function() { return _attIds.length; };
// 1.6.0 (the core's gaps 6 and 7): a roll the damage step posts (a Major Wound's or a wound's) answers the blow that called it. Its record is
// an attempt's, with no margin, the blow (systemcore withBlow reads it as Blow.<name> and Hit.<name>) and crip, the location list's stat its
// failure sets: made here on the host as the card is posted (wpSheets.majorFollow), read when that roll is made with the record's id, once.
// vals (the core handbook session's ask 3, 2026-10-29): the character's values as the blow left them, which that roll is worked out on (its
// formula, needs, Malf and critical range, and the amounts of its Then, which still land on the character as it is now). Memory alone
net.blowMake = function(ch, actId, blow, crip, cripBy, vals, soft) {   // soft: a b_ record, which the roll may do without once it is gone (attSoftGone)   // cripBy (the core's ruling on gap 7): what the failure writes, by formula
    if (!ch || typeof ch.id !== 'string' || typeof actId !== 'string' || !blow || typeof blow !== 'object') return '';
    var id = ''; while (!id || Object.prototype.hasOwnProperty.call(_attempts, id)) { id = soft === true ? 'b_' : 'a_'; while (id.length < 10) id += 'abcdefghijklmnopqrstuvwxyz0123456789'.charAt(Math.floor(Math.random() * 36)); }
    _attempts[id] = { charId: ch.id, act: actId, m: 0, blow: blow }; if (vals && typeof vals === 'object' && !Array.isArray(vals)) _attempts[id].vals = vals; if (typeof crip === 'string' && crip) { _attempts[id].crip = crip; if (typeof cripBy === 'string' && cripBy) _attempts[id].cripBy = cripBy; } _attIds.push(id); while (_attIds.length > ATT_MAX) delete _attempts[_attIds.shift()];
    return id;
};
// 1.6.0 An attack on a line (a roll's area, systemcore rollAreaInto): one attack roll. Where it succeeds the host finds who stands in the line, from the roller's
// token to the point picked on the map, out to its reach or the first wall: blastcore lineTargets, over the map as the host holds it. A body stops nothing. A
// hidden or waiting token is passed over, as an attempt's. With resistAll each is sent the Resisted by roll, each reading the margin as AttemptMargin, and a
// failure is a hit. With none each is hit at once. A hit puts fx on, whatever comes of the damage, and rolls dmg as the attacker, a damage card that lands on
// that token through the GM's Apply. Nothing here reads a player's word but the point. A new reader of a line goes through areaAfter
var AREA_AIM = 'Click the map to say where it is aimed.';
function isObj0(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
function areaEntry(sys, q, act) {   // the whole entry behind what a player's view holds
    if (!act || !sys) return null; var pool = [];
    if (q.act) pool = Array.isArray(sys.rolls) ? sys.rolls.filter(function(r) { return r && r.id === q.act; }) : [];
    else if (q.row) (Array.isArray(sys.fields) ? sys.fields : []).forEach(function(f) { if (f && f.id === q.row.f && f.kind === 'item-list' && f.list && Array.isArray(f.list.rolls)) pool = f.list.rolls; });
    for (var i = 0; i < pool.length; i++) { var r = pool[i]; if (r && isObj0(r.area) && r.formula === act.formula && r.label === act.label) return r; }
    return null;
}
function areaTokens(camp, map, tok, aim, width, reach) {   // the token ids in the line, nearest first
    var S = SC(), BC = window.wpBlastCore, Fg = window.wpFog; if (!S || !BC || typeof BC.lineTargets !== 'function' || !map || !tok || !aim) return [];
    var yd = typeof S.rangeDist === 'function' ? S.rangeDist(camp.system, map, { x: 0, y: 0 }, { x: 1000, y: 0 }, 'yd') : null, unit = typeof yd === 'number' && yd > 0 ? 1000 / yd : 50, mid = function(w) { return { x: (w.x || 0) + (w.w || 60) / 2, y: (w.y || 0) + (w.h || 52) / 2 }; }, from = mid(tok);
    var dx = aim.x - from.x, dy = aim.y - from.y, d = Math.sqrt(dx * dx + dy * dy); if (!(d > 0)) return [];
    var far = { x: from.x + dx / d * reach * unit, y: from.y + dy / d * reach * unit }, wall = Fg && typeof Fg.flightWall === 'function' ? Fg.flightWall(map, from, far) : null;
    var pts = (Array.isArray(map.whiteboard) ? map.whiteboard : []).filter(function(w) { return !!w && w !== tok && w.isChar && !w.hidden && !w.waiting && typeof w.charId === 'string'; }).map(function(w) { var c = mid(w); return { id: w.id, x: c.x, y: c.y, half: Math.max(0, Math.min(w.w || 60, w.h || 52) - unit) / 2 }; });
    return BC.lineTargets(from, aim, pts, { unit: unit, width: width, reach: reach, stop: wall && typeof wall.at === 'number' ? wall.at : undefined });
}
function areaAfter(camp, entry, vd, malf, aim, ch, priv, vars, row, map, tok, from) {
    var S = SC(), F = window.wpFormula, ar = entry && isObj0(entry.area) ? entry.area : null; if (!S || !F || !ar || !vd || vd.kind !== 'check' || vd.pass !== true || malf === true || !camp || !camp.system) return null;
    if (!map || !tok) { if (window.wpStepLog) window.wpStepLog('line v1', 'no-token', {}); return null; }
    var q = null; try { q = F.evaluate(ar.reach, { vars: vars, random: function() { throw new Error('no dice'); } }); } catch (e) { q = null; } var reach = q && q.ok && typeof q.value === 'number' && isFinite(q.value) ? Math.max(0, Math.min(100000, q.value)) : 0;
    var ids = reach > 0 ? areaTokens(camp, map, tok, aim, ar.width, reach) : [], mapId = typeof map.id === 'string' ? map.id : tok.mapId, by = { by: ch.id, dmg: ar.dmg, fx: ar.fx, row: row && typeof row.r === 'string' ? { f: row.f, r: row.r } : null, label: String(entry.label || 'Line').split('{')[0].trim().slice(0, 50), gm: entry.vis === 'gm' }; if (from) by.from = from;   // from: the player who pressed, whose card the damage is
    if (priv === true || priv === 'hid') by.priv = true;   // a line rolled in private stays private: its damage cards with it (the review of rolls: one hidden by the GM's choice alone too, though its targets still get their Defend cards)
    ids.forEach(function(tid) {
        var w = map.whiteboard.filter(function(x) { return !!x && x.id === tid; })[0], tc = w && camp.chars && own(camp.chars, w.charId) ? camp.chars[w.charId] : null; if (!tc || tc.id === ch.id) return;
        var hit = Object.assign({}, by, { to: tc.id, nm: w.charName || w.name || tc.name });
        if (entry.resistAll === true && typeof entry.resistBy === 'string') attemptMake(camp, entry, vd, malf, { tid: tid, mapId: mapId, area: hit }, ch, priv, vars, row); else areaHit(camp, hit);   // the review of defense fold 3 (finding 7): with the attacking row, so a line that tests the attacking weapon finds it
    });
    if (window.wpStepLog) window.wpStepLog('line v1', 'found', { tokens: ids.length, resisted: entry.resistAll === true });
    return ids;
}
function areaAnswered(camp, hit, pass, pick) {   // pick (1.6.3, defense fold 3): the line of When it answers an attack its success was judged by (ansPick), only an explicit line: the list roll's own Takes the blow tick never let a line through, and still does not
    if (window.wpStepLog) window.wpStepLog('line v1', 'answered', { pass: pass === true });
    if (pass !== true) { areaHit(camp, hit); return; }
    var a = pick && pick.line ? pick.line : null; if (!a || a.does === 'stop') return;   // stopped
    if (a.does === 'send') { if (typeof sendOnNone === 'function') sendOnNone(hit.nm, 'line'); return; }   // 1.6.3 (defense fold 4): a hit along a line has no one attacker to aim back from, so it is stopped, as every line attack a defense resisted was
    if (a.does === 'thru' && !(pick.row && typeof pick.row.r === 'string')) return;
    if (a.does === 'hits' && pick.nBad === true) { if (typeof ansBadSay === 'function') ansBadSay(hit.nm); return; }   // the review of fold 3 (finding 1): a count that cannot be worked out stops it, and the GM is told
    if (a.does === 'hits' && pick.n >= 1) { var ent = areaDmgEnt(camp && camp.system, hit); if (!(ent && typeof ent.hits === 'string' && ent.hits)) return; var chA = camp.chars && typeof hit.by === 'string' && own(camp.chars, hit.by) ? camp.chars[hit.by] : null, hnA = typeof ansHitsNow === 'function' ? ansHitsNow(camp, chA, typeof hit.dmg === 'number' ? hit.row : null, ent, null, null) : null; if (typeof hnA === 'number' && hnA <= pick.n) return; }   // finding 11: hits that come to no more than it stops roll nothing
    var e = typeof ansEff === 'function' ? ansEff(pick) : null, h = Object.assign({}, hit); if (e && (a.does !== 'thru' || e.type)) h.ans = e; if (a.does === 'thru') h.thru = pick.row.r;
    if (window.wpStepLog) window.wpStepLog('attempt v1', 'answered', { does: a.does, line: true });
    areaHit(camp, h);
}
// The damage roll a line's hit names, as the GM's system holds it (h.dmg: a system roll's id, or a place among the attacking row's list's rolls)
function areaDmgEnt(sys, h) {
    var ent = null; if (!sys || !h) return null;
    if (typeof h.dmg === 'number' && h.row) (Array.isArray(sys.fields) ? sys.fields : []).forEach(function(f) { if (f && f.id === h.row.f && f.kind === 'item-list' && f.list && Array.isArray(f.list.rolls)) ent = f.list.rolls[h.dmg] || null; });
    else if (typeof h.dmg === 'string') (Array.isArray(sys.rolls) ? sys.rolls : []).forEach(function(r) { if (r && r.id === h.dmg) ent = r; });
    return ent;
}
function areaHit(camp, h) {
    var S = SC(), F = window.wpFormula, sys = camp && camp.system, tc = sys && camp.chars && own(camp.chars, h.to) ? camp.chars[h.to] : null, ch = sys && camp.chars && own(camp.chars, h.by) ? camp.chars[h.by] : null; if (!S || !F || !tc) return;
    if (typeof h.fx === 'string' && h.fx) {   // on whatever comes of the damage: a hit armor stops whole still sets it
        var defs = Array.isArray(sys.effects) ? sys.effects : [], def = defs.filter(function(d) { return d && d.id === h.fx; })[0], lists = (Array.isArray(sys.fields) ? sys.fields : []).filter(function(f) { return f && f.kind === 'effects'; }), fl = lists.filter(function(f) { var l = tc.values ? tc.values[f.id] : null; return Array.isArray(l) && l.some(function(x) { return x && x.ref === h.fx; }); })[0] || lists[0];
        var onB = !!fl && !!tc.values && Array.isArray(tc.values[fl.id]) && tc.values[fl.id].some(function(x) { return !!x && x.ref === h.fx && x.on !== false; }), res = def && fl ? S.applyEffectOp(sys, tc, fl.id, { op: 'add', rowId: 'x_' + Math.random().toString(36).slice(2, 14), ref: h.fx }, F, { now: Date.now(), inCombat: !!(typeof net.charInCombat === 'function' && net.charInCombat(tc.id)) }) : null;
        if (res && res.ok) { var vals = {}; vals[fl.id] = res.value; if (res.clamp) Object.keys(res.clamp).forEach(function(k) { vals[k] = res.clamp[k]; }); tc.values = tc.values || {}; Object.keys(vals).forEach(function(k) { tc.values[k] = vals[k]; }); tc.updated = Date.now(); if (net.active && net.role === 'host' && typeof net.syncCharDelta === 'function') net.syncCharDelta(tc.id, vals); if (window.wpSheets && window.wpSheets.charChanged) window.wpSheets.charChanged(tc.id); if (typeof net.damageCard === 'function') net.damageCard(tc, [(h.gm ? 'A line' : h.label) + ':', (def.vis === 'gm' ? 'An effect' : String(def.name || 'An effect').slice(0, 60)) + (onB && !res.again ? ' is on already.' : ' is on.')]); }
    }
    if (!ch || h.dmg === undefined) return;
    var ent = null, o = { charId: ch.id, label: (h.gm ? 'Line' : h.label) + ' damage', landOn: tc.id, onName: String(h.nm || tc.name || '').slice(0, 60), gmOnly: h.gm === true }; if (h.from) o.from = h.from; if (h.priv === true) o.priv = true;
    if (h.ans) o.ansLine = h.ans; if (typeof h.thru === 'string') o.thruRow = h.thru;   // 1.6.3 (defense fold 3): what the defense let through, stamped on the GM's copy alone (host-only keys: net.diceRoll is called with them by the host's own code)
    if (typeof h.dmg === 'number' && h.row) { (Array.isArray(sys.fields) ? sys.fields : []).forEach(function(f) { if (f && f.id === h.row.f && f.kind === 'item-list' && f.list && Array.isArray(f.list.rolls)) ent = f.list.rolls[h.dmg] || null; }); o.row = { f: h.row.f, r: h.row.r, i: h.dmg }; }
    else if (typeof h.dmg === 'string') { (Array.isArray(sys.rolls) ? sys.rolls : []).forEach(function(r) { if (r && r.id === h.dmg) ent = r; }); o.act = h.dmg; }
    if (!ent || ent.dmg !== true || typeof ent.formula !== 'string' || !ent.formula || typeof net.diceRoll !== 'function') return;
    var rd = net.diceRoll(ent.formula, o); if (rd && rd.error && window.wpStepLog) window.wpStepLog('line v1', 'no-damage', {});
}
// 1.6.0 A blast's own Defense roll (combat.blast.defend): a card of the roll to a character in reach, before its share, as a roll called for. Its record is
// a blow's, with no blow, so any roll may answer it, the margin m (a launched round's, on its direct target alone, else 0) and def, what the host asks when
// the roll is made (whiteboard.js wpBlastDefended). Only while the roll's Needs hold, read with its token. The attempt's id, or '' where no card goes
net.defendPost = function(camp, rollId, ch, by, m, def, gm, tctx) {
    var S = SC(), Fc = window.wpFormula; if (!S || !Fc || !camp || !camp.system || !ch || typeof ch.id !== 'string') return '';
    var rr = null; (Array.isArray(camp.system.rolls) ? camp.system.rolls : []).forEach(function(r) { if (r && r.id === rollId && typeof r.formula === 'string' && !r.apply) rr = r; }); if (!rr) return '';
    if (withRowNo(rr, 'A blast\u2019s Defense roll')) return '';   // 1.6.3 (the review of defense fold 2, finding 3)
    if (rr.needs || rr.needsWhy) { var cv = null; try { cv = S.makeResolver(camp.system, ch, Fc, tctx || null); } catch (e) { cv = null; } if (typeof cv !== 'function' || !S.rollNeedsOk(rr, cv, Fc)) return ''; }
    var id = net.blowMake(ch, rr.id, {}, '', '', null, false); if (!id) return '';
    _attempts[id].m = typeof m === 'number' && isFinite(m) ? m : 0; _attempts[id].defend = def;
    if (typeof net.postDue === 'function') net.postDue(ch, rr, 'called', 1, !gm && !ch.npc && !!ch.ownerId && rr.vis !== 'gm', { att: id, by: by });
    return id;
};
net.attemptDrop = function(id) { attemptDrop(id); };
// a soft record of a blow (b_) the host no longer holds: the roll is made on the live sheet with no attempt, as before the core's ask 3
function attSoftGone(id) { return typeof id === 'string' && /^b_[a-z0-9]{8}$/.test(id) && !Object.prototype.hasOwnProperty.call(_attempts, id); }
function attemptRec(id) { return typeof id === 'string' && Object.prototype.hasOwnProperty.call(_attempts, id) ? _attempts[id] : null; }
// the location a failed roll of a blow's record cripples: how far it failed (a malfunction 1 at least), on the host's own copy of the character,
// through systemcore blowCripOf. { charId, values, line } for the caller to write as it writes the roll's own changes, or null
function blowCrip(camp, rec, vd, malf, nat) {   // nat: the roll's natural total, read by cripBy as Natural
    var S = SC(); if (!S || typeof S.blowCripOf !== 'function' || !camp || !camp.system || !rec || !rec.blow || typeof rec.crip !== 'string') return null;
    var failed = malf === true || (vd && vd.kind === 'check' && vd.pass === false); if (!failed) return null;
    var ch = camp.chars && Object.prototype.hasOwnProperty.call(camp.chars, rec.charId) ? camp.chars[rec.charId] : null; if (!ch) return null;
    var by = vd && typeof vd.margin === 'number' && isFinite(vd.margin) && vd.margin < 0 ? -vd.margin : 1;
    if (typeof rec.cripBy === 'string' && typeof S.blowCripN === 'function') { var cbN = S.blowCripN(rec.cripBy, by, typeof nat === 'number' ? nat : 0, rec.blow, window.wpFormula, camp.system); if (cbN === null) return null; if (!(cbN > 0)) return null; by = cbN; }   // its own formula, where the system names one; 0 or below cripples nothing
    var cp = S.blowCripOf(camp.system, ch, rec.blow, rec.crip, by); if (!cp) return null;
    var gmCp = S.gmStatKeys ? S.gmStatKeys(camp.system) : null;   // 1.6.0: a GM-only stat is written and said to the GM alone
    return { charId: ch.id, ch: ch, values: cp.values, gm: !!(gmCp && gmCp[String(rec.crip).toLowerCase()] === 1), line: cp.name + ' is crippled: the roll failed by ' + cp.n + '.' };
}
function blowCripWrite(bc, persist) {   // its changes onto the character, sent to the table and told to the sheet, and its card
    if (!bc) return; var ch = bc.ch; ch.values = ch.values || {}; Object.keys(bc.values).forEach(function(k) { ch.values[k] = bc.values[k]; }); ch.updated = Date.now();
    if (typeof persist === 'function') persist(); if (net.syncCharDelta && (net.role === 'host' || !net.active)) net.syncCharDelta(bc.charId, bc.values);
    if (window.wpSheets && window.wpSheets.charChanged) window.wpSheets.charChanged(bc.charId); if (bc.gm === true) { if (typeof toast === 'function') toast(bc.line); } else if (typeof net.damageCard === 'function') net.damageCard(ch, [bc.line]);
}
// [netcheck:attempt-end]
// [netcheck:attland-start]
// 1.6.3 (defense fold 1; docs/DEFENSE_INTERACTIONS_DESIGN.md 4.0 and 4.1, Fulllion's decisions of 2026-11-17, 1, 2 and 5). An attack that names Its damage
// (systemcore landDmgInto) LANDS on its target, and its damage comes from the host's own record of the attack, never from where the attacker points later.
// That record, the landing, is the host's alone and never sent. It is kept here apart from the other attempts (_lands, in the order made in _landIds, at
// most LAND_MAX a fight, the oldest let go first and said to the GM by name), so no newer attempt, called roll, wound roll or blast Defense pushes one
// out, and it is saved with its fight (landsKeep, which fightsKeep asks; landsBack, which fightsBack asks). A landing with no fight lives in memory only.
// A landing holds: who attacks (by, the name their token shows, the player whose press it was as from), who is attacked (to, their token, their name, the
// map), where the attack was aimed (hit, the attack's own pick), the range as the host worked it out at the attack (range: the distance, RangeMod, cover,
// the arc, the darkness, as systemcore withRange keeps them), the attacking row and a copy of it as it stood (row, rowCopy), the damage roll (dmg: a
// system roll's id, or a place among the attacking list's rolls), the heavy hit (big), a private attack (priv), the fight (fid), hops 0 and atk 1.
// An attack lands where its defense fails (landAnswered, from attemptCalled), where it hits and nothing resists it (no Resisted by, a defense that is not
// offered, a critical nobody may answer, a body in the way), where the defender presses Take it (the host branch land-take), where the GM presses No
// defense (net.landNoDefense), and where the system's wait ends (combat.defenseWait, landSweep; never while the table is paused or the defender's player
// is away). A defense that succeeds stops it, but a list's roll ticked Takes the blow on this row lets it land, the row noted for the window as before
// (thruNote). One answer a defense: the attempt is dropped as its roll is made, so a second press finds nothing (attemptPeek), and Take it, No defense
// and the wait refuse a card that its card actions are holding (busy). Once it lands the record's attempt becomes the damage card's, under the same id
// (a_, hard: a press whose record is gone is refused, never aimed again): the card goes to the attacker's player, or the GM for an NPC, a private attack
// or a GM-only roll (combat.landBy absent), the host rolls it at once ('now'), or both ('both': the player's card, and the GM's copy offers Roll it now).
// Its press spends nothing, and both roll paths work it out from the record (landCtx, landVals). The GM applies it with Apply, the window filled in
var _lands = Object.create(null), _landIds = [], LAND_MAX = 200, _landTimer = null, LAND_ID = /^a_[a-z0-9]{8}$/, LAND_GONE = 'That attack has been answered already, or is not there now.';
function landOf(id) { return typeof id === 'string' && Object.prototype.hasOwnProperty.call(_lands, id) ? _lands[id] : null; }
function landLog(step, o) { if (window.wpStepLog) window.wpStepLog('attempt v1', step, o || {}); }
function landKeepSoon() { if (typeof fightsKeepSoon === 'function') fightsKeepSoon(); }   // saved with the fight a moment later, as any change of a fight is
// The system's rules for it, from the Combat tab: by, who rolls a landed attack's damage ('card', 'now' or 'both'), and wait, the seconds a defense waits (0: none)
function landRule(camp) {
    var c = camp && camp.system && camp.system.combat && typeof camp.system.combat === 'object' ? camp.system.combat : null;
    return { by: c && (c.landBy === 'now' || c.landBy === 'both') ? c.landBy : 'card', wait: c && typeof c.defenseWait === 'number' && isFinite(c.defenseWait) && c.defenseWait >= 5 ? Math.min(3600, Math.floor(c.defenseWait)) : 0 };
}
// The damage roll a landing names, as the GM's system holds it: { ent, act } for a system roll, or { ent, row: { f, r, i }, f } for a list's roll on the
// attacking row (i: its place on the GM's list). null where it is gone or no damage roll
function landDmgOf(camp, rec) {
    var sys = camp && camp.system, d = rec ? rec.dmg : null; if (!sys) return null;
    if (typeof d === 'string') { var e = null; (Array.isArray(sys.rolls) ? sys.rolls : []).forEach(function(r) { if (r && r.id === d && r.dmg === true && typeof r.formula === 'string' && r.formula && !Array.isArray(r.apply)) e = r; }); return e ? { ent: e, act: d } : null; }
    if (typeof d !== 'number' || !rec.row || typeof rec.row.f !== 'string' || typeof rec.row.r !== 'string') return null;
    var f = null; (Array.isArray(sys.fields) ? sys.fields : []).forEach(function(x) { if (x && x.id === rec.row.f && x.kind === 'item-list' && x.list && Array.isArray(x.list.rolls)) f = x; });
    var lr = f ? f.list.rolls[d] : null;
    return lr && lr.dmg === true && typeof lr.formula === 'string' && lr.formula && !Array.isArray(lr.apply) ? { ent: lr, row: { f: f.id, r: rec.row.r, i: d }, f: f } : null;
}
// The attacker's values with the attacking row laid back as it stood at the attack, where it has gone or changed since (so a damage roll that reads the
// round a gun fired reads the round of this attack)
function landVals(ch, rec) {
    var v = ch && ch.values && typeof ch.values === 'object' ? ch.values : {}; if (!rec || !rec.row || !rec.rowCopy) return v;
    var S = SC(), f = rec.row.f, list = Array.isArray(v[f]) ? v[f] : [], at = -1;
    list.forEach(function(x, i) { if (at < 0 && S && S.rowIdOf(x) === rec.row.r) at = i; });
    var out = Object.assign({}, v), nl = list.slice(); if (at >= 0) nl[at] = rec.rowCopy; else nl.push(rec.rowCopy); out[f] = nl; return out;
}
// The token context a landed attack's damage is worked out in: the attacker's own as it stands (facing, posture, the round of its fight), with the range
// and the location as the host held them at the attack, never the attacker's pointer now. { tc, aim: what the card says of where it was aimed, gmOnly: the
// location reads a figure the players do not see, which keeps the roll the GM's }. pid: the player whose press it is, '' for the GM's own
function landCtx(camp, tc, rec, pid) {
    var S = SC(), t = Object.assign({}, tc && typeof tc === 'object' ? tc : {}); delete t.thit; delete t.range;
    if (rec && rec.range && S && typeof S.withRange === 'function') t = S.withRange(t, rec.range);
    var out = { tc: t, aim: null, gmOnly: false };
    if (rec && rec.hit && typeof targetHitIn === 'function' && S && typeof S.withTargetHit === 'function') {
        var th = targetHitIn(camp, rec.range, rec.hit, pid || '');
        if (th) { out.tc = S.withTargetHit(out.tc, th); out.gmOnly = typeof th.secret === 'function' && th.secret() === true; if (!out.gmOnly && typeof th.aim === 'function') out.aim = th.aim() || null; }
    }
    return out;
}
function landAttKeep(id) { var i = _attIds.indexOf(id); if (i >= 0) _attIds.splice(i, 1); if (typeof _callIds !== 'undefined') _callIds = _callIds.filter(function(x) { return x !== id; }); }   // its attempt kept apart, so ATT_MAX lets it be
function landNewId() { var id = ''; while (!id || Object.prototype.hasOwnProperty.call(_attempts, id) || Object.prototype.hasOwnProperty.call(_lands, id)) { id = 'a_'; while (id.length < 10) id += 'abcdefghijklmnopqrstuvwxyz0123456789'.charAt(Math.floor(Math.random() * 36)); } return id; }
// What the GM is told where landings are let go: each by name, three at most and how many more. why: the reason said after them
function landSayGone(list, why) {
    if (!list.length) return;
    var named = list.slice(0, 3).map(function(r) { return (r.byName || 'An attacker') + '’s attack on ' + (r.toName || 'its target'); }).join('; '), more = list.length > 3 ? '; and ' + (list.length - 3) + ' more' : '';
    var words = named + more + ' did not land' + (why ? ': ' + why : '.');
    if (typeof toast === 'function') toast(words); if (typeof logEvent === 'function') logEvent('table', words);
}
function landEnd(id, step) { if (!Object.prototype.hasOwnProperty.call(_lands, id)) return; delete _lands[id]; _landIds = _landIds.filter(function(x) { return x !== id; }); landLog(step || 'done', {}); landKeepSoon(); }
function landLetGo(id, why) { var r = landOf(id); if (!r) return; landEnd(id, 'let go'); if (typeof attemptDrop === 'function') attemptDrop(id); if (typeof net.dueOver === 'function') net.dueOver(id, 'gone'); landSayGone([r], why); }
// At most LAND_MAX landings wait in one fight (and as many with none): past it the oldest of that fight is let go, said to the GM by name
function landBound(fid) {
    var mine = _landIds.filter(function(id) { return _lands[id] && (_lands[id].fid || '') === (fid || ''); });
    while (mine.length > LAND_MAX) landLetGo(mine.shift(), LAND_MAX + ' were waiting in that fight.');
}
// The GM's own copy of a card just posted, kept on the landing so a reload of the GM's Waypoint can put it back (landsBack): the last chat entry of that id
function landCardKeep(rec) { for (var i = chatLog.length - 1; i >= 0; i--) { var m = chatLog[i]; if (m && m.due && m.due.att === rec.id) { rec.card = JSON.parse(JSON.stringify(m.due)); return; } } }
// The record a landed attack's damage card answers to, and whom it goes to: { a, toO, ri }. The record names the attacker, the damage roll (a list's roll by
// its row, under its place on the GM's list and on the player's own, which may stand lower), its landing (lnd) and where it lands (land, which the roll paths'
// systemcore dmgLandOf reads). toO: the attacker's player gets the card, never for an NPC, a private attack, a GM-only roll or list, or a row kept from them
function landCardAtt(camp, rec, dm, ch) {
    var S = SC(), a = { charId: ch.id, act: dm.act || 'r_row', m: 0, blow: {}, lnd: rec.id, land: { on: rec.to, tok: rec.toTok, map: rec.map, name: rec.toName } }; if (rec.big) a.big = true;
    var toO = !rec.priv && !ch.npc && !!ch.ownerId && dm.ent.vis !== 'gm' && dm.ent.gm !== true && !(dm.f && dm.f.vis === 'gm'), ri = dm.row ? dm.row.i : -1;
    if (dm.row && toO) {
        var rw = null; (ch.values && Array.isArray(ch.values[dm.row.f]) ? ch.values[dm.row.f] : []).forEach(function(x) { if (!rw && S && S.rowIdOf(x) === dm.row.r) rw = x; });
        var view = window.wpSheets && typeof window.wpSheets.playerSystem === 'function' ? window.wpSheets.playerSystem(camp) : null, vri = view && S && typeof S.rollPlace === 'function' ? S.rollPlace(camp.system, view, dm.row.f, dm.row.i) : -1;
        var vf = null; (view && Array.isArray(view.fields) ? view.fields : []).forEach(function(x) { if (x && x.id === dm.row.f && x.kind === 'item-list') vf = x; });
        var vr = vf && vf.list && Array.isArray(vf.list.rolls) && vri >= 0 ? vf.list.rolls[vri] : null;
        if (!vr || vr.formula !== dm.ent.formula || (rw && S && typeof S.rowKeptFrom === 'function' && S.rowKeptFrom(camp.system, rw))) toO = false; else ri = vri;
    }
    if (dm.act && toO) {   // the review of fold 1: a system damage roll goes to the player only where their view holds it with the same formula; else to the GM, who can roll it
        var viewA = window.wpSheets && typeof window.wpSheets.playerSystem === 'function' ? window.wpSheets.playerSystem(camp) : null, vra = null;
        (viewA && Array.isArray(viewA.rolls) ? viewA.rolls : []).forEach(function(x) { if (x && x.id === dm.act) vra = x; });
        if (!vra || vra.formula !== dm.ent.formula) toO = false;
    }
    if (dm.row) { a.rows = [dm.row.f + '#' + dm.row.i + '#' + dm.row.r]; if (toO && ri !== dm.row.i) a.rows.push(dm.row.f + '#' + ri + '#' + dm.row.r); }
    return { a: a, toO: toO, ri: toO ? ri : dm.row ? dm.row.i : -1 };
}
// After an attack roll on the host (both roll paths): where it hit and names Its damage, a landing is made. pass: the attack hit (a body in the way counts);
// att: the attempt it made, if any, which the landing waits on; otherwise it lands at once. rowRef: the row a list's roll was made on; from: the player whose
// press it was; hit: the location they picked; big: it landed as a heavy hit. The landing's id, or ''
// say (1.6.3, found in a live two-peer check): how to tell the roller in one plain line that an attack that hit had no one to land on (LAND_NO_TARGET); the
// roll stays as it is, and no attempt or landing is made. roll-req hands a note to the player's connection, net.diceRoll a notice on this screen
var LAND_NO_TARGET = 'This attack had no one to land on, so its damage does not come. Target someone before you attack.';
function landAfter(camp, entry, pass, tc, ch, priv, rowRef, att, from, hit, big, was, say) {   // was (the review of fold 1): the attacking row before the attack's Then, from landRowNow, kept where the Then used the row up
    if (net.active && net.role !== 'host') return '';
    if (!camp || !camp.system || !entry || entry.landDmg === undefined || !ch || typeof ch.id !== 'string' || pass !== true) return '';
    var tg = typeof callTarget === 'function' ? callTarget(camp, tc) : null;
    if (!tg || !tg.on || tg.on === ch.id) { landLog('no target', {}); if (typeof say === 'function') { try { say(LAND_NO_TARGET); } catch (e) { /* the note is a courtesy: the roll stands */ } } return ''; }
    var S = SC(), rg = tc && tc.range && S && typeof S.withRange === 'function' ? (S.withRange({}, tc.range) || {}).range : null; if (!rg) { landLog('no range', {}); return ''; }
    var rec = { st: 'wait', at: Date.now(), by: ch.id, byName: typeof tokNameOf === 'function' ? tokNameOf(camp, tc && tc.selfMap, ch, tc && tc.self) : String(ch.name || '').slice(0, 60), to: tg.on, toTok: tg.tok, toName: tg.name, map: tg.map, range: rg, dmg: entry.landDmg, hops: 0, atk: 1 };
    if (rowRef && typeof rowRef.f === 'string' && typeof rowRef.r === 'string') {
        rec.row = { f: rowRef.f, r: rowRef.r };
        (ch.values && Array.isArray(ch.values[rowRef.f]) ? ch.values[rowRef.f] : []).forEach(function(x) { if (!rec.rowCopy && S && S.rowIdOf(x) === rowRef.r) rec.rowCopy = JSON.parse(JSON.stringify(x)); });
        if (!rec.rowCopy && was && typeof was === 'object' && S && S.rowIdOf(was) === rowRef.r) rec.rowCopy = JSON.parse(JSON.stringify(was));   // a Then that used the row up: the row as it stood before it
    }
    if (!landDmgOf(camp, rec)) { landLog('no damage roll', {}); return ''; }
    if (typeof hit === 'string' && /^w_[A-Za-z0-9_]{1,24}$/.test(hit)) rec.hit = hit;
    if (big === true) rec.big = true; if (priv) rec.priv = true;
    // the review of rolls (finding 1): priv may be 'hid', an attack hidden by the GM's choice alone (the hiderolls slice of net.js). The landing is private all the same, so its
    // damage card goes to the GM, a damage rolled at once (landRoll hands net.diceRoll priv) stays private, and so does an attack sent on; hid says the defender
    // was still given their Defend card, so they are given the card to send it on too (sendOnOffer), and the next defender theirs (sendOnGo)
    if (priv === 'hid') rec.hid = true;
    if (from && typeof from === 'object') { var D = DC(), fr = D && typeof D.cleanFrom === 'function' ? D.cleanFrom(from) : null; if (fr) rec.from = fr; }
    var fid = tc && typeof tc.selfMap === 'string' && typeof tc.self === 'string' && typeof fightOfTok === 'function' ? fightOfTok(tc.selfMap, tc.self) : null; rec.fid = typeof fid === 'string' ? fid : '';
    if (typeof camp.id === 'string') rec.cid = camp.id;
    var entA = typeof sendOnEntRef === 'function' ? sendOnEntRef(camp, entry, rowRef) : ''; if (entA) rec.ent = entA;   // 1.6.3 (defense fold 4): the attack itself, by its id or its place, so a defense that sends it on finds its Resisted by again   // the review of fold 1: the campaign it was made in, so the wait judges it only there
    var waits = typeof att === 'string' && att && Object.prototype.hasOwnProperty.call(_attempts, att), id = waits ? att : landNewId(); rec.id = id;
    if (waits && typeof _attempts[att].k === 'number') { rec.ak = { k: _attempts[att].k }; if (typeof _attempts[att].t === 'number') rec.ak.t = _attempts[att].t; }   // 1.6.3 (defense fold 4): its kind and type as it was made, frozen, which it keeps if it is sent on
    _lands[id] = rec; _landIds.push(id);
    if (waits) {   // it waits for its defense: the attempt is kept apart, and the GM's copy of its card is kept for a reload
        _attempts[id].lw = id; landAttKeep(id); var w = landRule(camp).wait; if (w) rec.until = rec.at + w * 1000;
        landCardKeep(rec); landLog('waits', { wait: w }); landArm();
    } else landFire(camp, id, 'hit');
    landBound(rec.fid); landKeepSoon();
    return id;
}
// The review of fold 1: a copy of the attacking row as it stands (rowRef: a list's roll's row), taken before the attack's Then, which landAfter keeps only
// where that Then used the row up; null for none
function landRowNow(ch, rowRef) {
    var S = SC(), out = null; if (!S || !ch || !rowRef || typeof rowRef.f !== 'string' || typeof rowRef.r !== 'string') return null;
    (ch.values && Array.isArray(ch.values[rowRef.f]) ? ch.values[rowRef.f] : []).forEach(function(x) { if (!out && S.rowIdOf(x) === rowRef.r) out = JSON.parse(JSON.stringify(x)); });
    return out;
}
// It lands: the attempt becomes the damage card's, the defense card says so, and the card is posted, or the damage rolled at once. how: why it landed
function landFire(camp, id, how) {
    var rec = landOf(id); if (!rec || rec.st === 'card') return false;
    var dm = landDmgOf(camp, rec), ch = camp && camp.chars && own(camp.chars, rec.by) ? camp.chars[rec.by] : null, tch = camp && camp.chars && own(camp.chars, rec.to) ? camp.chars[rec.to] : null;
    if (!dm || !ch || !tch) { landLetGo(id, 'its damage roll or a character of it is gone.'); return false; }
    rec.st = 'card'; delete rec.until; delete rec.card; rec.how = how;
    if (typeof net.dueOver === 'function') net.dueOver(id, 'land');   // the defense card, if one went out, says the attack landed
    var rule = landRule(camp), ca = landCardAtt(camp, rec, dm, ch), toO = ca.toO, ri = ca.ri; _attempts[id] = ca.a; landAttKeep(id);
    landLog('landed', { how: how, by: rule.by });
    if (rule.by === 'now') { if (landRoll(camp, id)) { landKeepSoon(); return true; } toO = false; ri = dm.row ? dm.row.i : -1; landLog('now failed', {}); }   // the review of fold 1: a roll at once that fails comes to the GM as a card, so the landing never waits with no way to roll it
    var lb = String(dm.ent.label || 'Damage').split('{')[0].trim().slice(0, 60) || 'Damage', on = toO ? landSeenBy(camp, tch, ch.ownerId, rec.toName) : rec.toName;
    if (typeof net.postDue === 'function') net.postDue(ch, { id: dm.act || 'r_row', label: lb }, 'called', 1, toO, { att: id, row: dm.row ? { f: dm.row.f, r: dm.row.r, i: ri } : undefined, label: lb, lnd: true, on: on, onGm: rec.toName, now: rule.by === 'both' && toO });   // on: whom it landed on as the attacker's player may be told it; onGm: the GM's own copy names them whatever the player sees
    landCardKeep(rec); landKeepSoon(); return true;
}
// The name of the one an attack landed on, as its attacker's player may be told it: none where they cannot see that NPC (npcShown, by their roster entry)
function landSeenBy(camp, tch, pid, name) { var p = null; Object.keys(net.roster || {}).forEach(function(k) { if (net.roster[k] && net.roster[k].id === pid) p = net.roster[k]; }); return typeof npcShown === 'function' && npcShown(camp, tch, p) ? name : ''; }
// The damage of a landing rolled here, on the host, as its attacker, through net.diceRoll with the landing's record (the Combat tab's 'now', and the GM's
// Roll it now under 'both'). true where it was rolled
function landRoll(camp, id) {
    var rec = landOf(id), dm = rec ? landDmgOf(camp, rec) : null; if (!rec || rec.st !== 'card' || !dm || typeof net.diceRoll !== 'function' || typeof attemptRec !== 'function' || !attemptRec(id)) return false;
    var o = { charId: rec.by, label: String(dm.ent.label || 'Damage').split('{')[0].trim().slice(0, 60) || 'Damage', att: id }; if (dm.act) o.act = dm.act; else o.row = { f: dm.row.f, r: dm.row.r, i: dm.row.i };
    if (rec.from) o.from = rec.from; if (rec.priv) o.priv = true;
    var r = net.diceRoll(dm.ent.formula, o);
    if (r && r.error) { landLog('roll failed', {}); if (typeof toast === 'function') toast('The damage of ' + (rec.byName || 'an attack') + '’s attack on ' + (rec.toName || 'its target') + ' could not be rolled: ' + r.error); return false; }
    return true;
}
// The damage card's roll was made (both roll paths, as they drop its record): the landing is over, and every copy of its card says so
function landDone(id) { if (!landOf(id)) return; landEnd(id, 'rolled'); if (typeof net.dueOver === 'function') net.dueOver(id, 'rolled'); }
// The defense of a landing came in (attemptCalled, with the roll's verdict): it lands unless it succeeded. 1.6.3 (defense fold 3): a success does what the
// line it was answered with says (pick, from ansPick: the first line of When it answers an attack whose condition held, the list roll's own Takes the blow on
// this row tick read as such a line, or none, which stops it). Takes it on this row keeps the parrying row on the landing, stamped on its damage roll's record
// however late it is pressed (net.thruOf forgets after two minutes, and is never asked for a landing's damage); Lets some through, Stops a number of hits and
// a type are kept as the landing's ans, which the damage roll's GM copy carries (ansStamp). An attack of one hit that a line stops one hit of is stopped here
function landAnswered(camp, id, pass, row, pick) {
    var rec = landOf(id); if (!rec || rec.st !== 'wait') return;
    if (pass !== true) { landFire(camp, id, 'failed'); return; }
    if (pick === undefined) pick = landTickPick(camp, row);   // a caller that judged no line (an older caller): the list roll's own tick alone, as before
    var a = pick && pick.line ? pick.line : null;
    if (!a || a.does === 'stop') { landEnd(id, 'stopped'); return; }
    if (a.does === 'send') { if (typeof sendOnOffer !== 'function' || !sendOnOffer(camp, id, pick)) { if (landOf(id)) landEnd(id, 'stopped'); } return; }   // 1.6.3 (defense fold 4): the defender may send it on; where they cannot, it is stopped
    if (a.does === 'thru') { if (!pick.row || typeof pick.row.r !== 'string' || !/^w_[A-Za-z0-9_]{1,24}$/.test(pick.row.r)) { landEnd(id, 'stopped'); return; } rec.thru = pick.row.r; }
    if (a.does === 'hits' && pick.nBad === true) { if (typeof ansBadSay === 'function') ansBadSay(rec.toName); landEnd(id, 'stopped'); return; }   // the review of fold 3 (finding 1): a count that cannot be worked out stops it, and the GM is told
    if (a.does === 'hits' && pick.n >= 1) { var dmH = landDmgOf(camp, rec); if (!(dmH && dmH.ent && typeof dmH.ent.hits === 'string' && dmH.ent.hits)) { landEnd(id, 'stopped'); return; } var chH = camp.chars && typeof rec.by === 'string' && own(camp.chars, rec.by) ? camp.chars[rec.by] : null, hnH = typeof ansHitsNow === 'function' ? ansHitsNow(camp, chH, dmH.row || null, dmH.ent, chH && typeof landVals === 'function' ? landVals(chH, rec) : null, rec.range) : null; if (typeof hnH === 'number' && hnH <= pick.n) { landEnd(id, 'stopped'); return; } }   // finding 11: a burst whose hits, worked out now, come to no more than the line stops is stopped here, so nobody is asked to roll damage that lands nowhere
    var e = typeof ansEff === 'function' ? ansEff(pick) : null; if (e && (a.does !== 'thru' || e.type)) { rec.ans = e; landLog('answered', { does: a.does, type: !!e.type }); }
    landFire(camp, id, a.does);
}
// The list roll's own Takes the blow on this row tick, read as a line with no condition (row: that roll on the GM's list, with its place i), or null
function landTickPick(camp, row) {
    var thru = false; if (row && typeof row.f === 'string' && typeof row.i === 'number') (camp && camp.system && Array.isArray(camp.system.fields) ? camp.system.fields : []).forEach(function(f) { if (f && f.id === row.f && f.list && Array.isArray(f.list.rolls) && f.list.rolls[row.i] && f.list.rolls[row.i].thru === true) thru = true; });
    return thru ? { line: { does: 'thru' }, at: -1, row: { f: row.f, r: row.r } } : null;
}
// Take it (the defender's player, pid), No defense (the GM, pid '') and the wait: the defense is closed and the attack lands at once. true, or the words why not
function landClose(camp, id, how, pid) {
    var rec = landOf(id), a = typeof attemptRec === 'function' ? attemptRec(id) : null;
    if (!rec || rec.st !== 'wait' || !a || a.lw !== id) return LAND_GONE;
    if (a.busy) return typeof ATT_BUSY === 'string' ? ATT_BUSY : 'That card is being rolled already.';
    if (how === 'take') { var dch = camp && camp.chars && own(camp.chars, a.charId) ? camp.chars[a.charId] : null; if (!dch || dch.npc || !pid || !(dch.ownerId === pid || (typeof handsTo === 'function' && handsTo(dch, pid)))) return 'That defense is not yours to give up.'; }
    attemptDrop(id); landFire(camp, id, how); return true;
}
// Whether the defender's player is away from the table, so the wait holds (an NPC is never away)
function landAway(camp, a) {
    var ch = a && camp && camp.chars && own(camp.chars, a.charId) ? camp.chars[a.charId] : null; if (!ch || ch.npc || !ch.ownerId || !net.active) return false;
    return !net.conns.some(function(c) { return c && c.open && net.roster[c.peer] && peerProfileId(c) === ch.ownerId; });
}
// The wait: one timer for the soonest end. A wait that ends while the table is paused, the defender's player is away or the card is held waits on a little
function landArm() {
    if (_landTimer) { clearTimeout(_landTimer); _landTimer = null; }
    var soon = Infinity; _landIds.forEach(function(id) { var r = _lands[id]; if (r && (r.st === 'wait' || r.st === 'send') && typeof r.until === 'number' && r.until < soon) soon = r.until; });
    if (soon < Infinity) _landTimer = setTimeout(landSweep, Math.max(250, soon - Date.now()));
}
function landSweep() {
    _landTimer = null; var camp = getActiveCampaign(), now = Date.now();
    _landIds.slice().forEach(function(id) {
        if (_lands[id] && _lands[id].st === 'send') { if (typeof sendOnSweep === 'function') sendOnSweep(camp, id, now); return; }   // 1.6.3 (defense fold 4): a card to send it on whose wait ran out is turned aside
        var r = _lands[id], a = r && typeof attemptRec === 'function' ? attemptRec(id) : null; if (!r || r.st !== 'wait' || typeof r.until !== 'number' || r.until > now) return;
        if (!a) { landLetGo(id, 'its defense is not there now.'); return; }
        if (!camp || !camp.chars || (typeof r.cid === 'string' && camp.id !== r.cid)) { r.until = now + 5000; return; }   // another campaign on screen: it waits for its own
        if (!own(camp.chars, r.by)) { landLetGo(id, 'its attacker is gone.'); return; }   // the review of fold 1: never waits on for an attacker that is gone
        if (net.paused || landAway(camp, a) || a.busy) { r.until = now + (a.busy ? 2000 : 5000); return; }
        landClose(camp, id, 'wait', '');
    });
    landArm();
}
// The GM's own presses on a card: No defense on a defense card, and Roll it now on a damage card under 'both'
net.landNoDefense = function(id) {
    if (net.active && net.role !== 'host') return false;
    var r = landClose(getActiveCampaign(), id, 'nodef', ''); if (r !== true && typeof toast === 'function') toast(r); return r === true;
};
net.landNow = function(id) {
    if (net.active && net.role !== 'host') return false;
    var rec = landOf(id); if (!rec || rec.st !== 'card') { if (typeof toast === 'function') toast(LAND_GONE); return false; }
    return landRoll(getActiveCampaign(), id);
};
// A player's Take it on their own defense card: sent to the host, which judges it (the branch land-take). Only to a host that says it knows landings
var _landsOk = false;
function landsKnow(v) { _landsOk = v === true; }
net.landsOk = function() { return net.role === 'client' ? _landsOk : true; };
net.landTake = function(id) {
    if (!net.active || net.role !== 'client' || !_landsOk || !net.conns || !net.conns[0] || !net.conns[0].open || typeof id !== 'string') return false;
    try { net.conns[0].send({ type: 'land-take', att: id }); return true; } catch (e) { sendFailed(e); return false; }
};
// The session's end (diceSessionReset): what waits goes, each said to the GM by name, but for one its fight's save holds, which comes back with the table
function landForget() {
    var camp = getActiveCampaign(), kept = Object.create(null), gone = [];
    (camp && camp.fights && Array.isArray(camp.fights.lands) ? camp.fights.lands : []).forEach(function(r) { if (r && typeof r.id === 'string') kept[r.id] = 1; });
    _landIds.slice().forEach(function(id) { if (kept[id] === 1) return; if (_lands[id]) gone.push(_lands[id]); delete _lands[id]; });
    _landIds = _landIds.filter(function(id) { return Object.prototype.hasOwnProperty.call(_lands, id); });
    if (_landTimer) { clearTimeout(_landTimer); _landTimer = null; }
    if (net.role === 'host' || !net.active) landSayGone(gone, 'the table was let go.');
}
// What fightsKeep saves of the landings: those of a fight that runs, each with the attempt it waits on and the GM's copy of its card, as data
function landsKeep() {
    var out = [];
    _landIds.forEach(function(id) {
        var r = _lands[id]; if (!r || typeof r.fid !== 'string' || !r.fid || !own(net.combats, r.fid)) return;
        if (r.st === 'wait' && Object.prototype.hasOwnProperty.call(_attempts, id)) { r.attSaved = JSON.parse(JSON.stringify(_attempts[id])); delete r.attSaved.busy; }
        var c = JSON.parse(JSON.stringify(r)); c.att = r.st === 'wait' && r.attSaved ? r.attSaved : null; delete c.attSaved; out.push(c);
    });
    return out;
}
// A saved attempt a landing waits on, read back as data: the defender, its roll and the other rolls and rows offered, its margin, kind, type and what it
// read of the attacker, and its Calls for. null where it does not read
function landAttRead(a, rec, camp) {
    if (!a || typeof a !== 'object' || a.charId !== rec.to || a.lw !== rec.id) return null;
    var num = function(v) { return typeof v === 'number' && isFinite(v) ? Math.max(-9999, Math.min(9999, v)) : 0; }, txt = function(v, n) { return typeof v === 'string' ? v.slice(0, n) : ''; };
    var out = { charId: rec.to, act: typeof a.act === 'string' && (a.act === '' || /^r_[A-Za-z0-9_]{1,24}$/.test(a.act)) ? a.act : '', m: num(a.m), lw: rec.id };
    if (Array.isArray(a.alts)) out.alts = a.alts.filter(function(x) { return typeof x === 'string' && /^r_[A-Za-z0-9_]{1,24}$/.test(x); }).slice(0, 30);
    if (Array.isArray(a.rows)) out.rows = a.rows.filter(function(x) { return typeof x === 'string' && /^f_[A-Za-z0-9_]{1,24}#\d{1,3}#w_[A-Za-z0-9_]{1,24}$/.test(x); }).slice(0, 80);
    // 1.6.3 (the review of defense fold 2, finding 1): and the rows a roll Answered with a row of a list was offered on (act#f#r), without which a reload
    // left the card's Defend with buttons pressing an attempt that took none of them
    if (Array.isArray(a.withs)) out.withs = a.withs.filter(function(x) { return typeof x === 'string' && /^r_[A-Za-z0-9_]{1,24}#f_[A-Za-z0-9_]{1,24}#w_[A-Za-z0-9_]{1,24}$/.test(x); }).slice(0, 80);
    if (typeof a.k === 'number') out.k = num(a.k); if (typeof a.t === 'number') out.t = num(a.t); if (a.kp === true) out.kp = true; if (a.hide === true) out.hide = true;
    out.atk = 1; if (typeof a.atkBy === 'string' && camp.chars && own(camp.chars, a.atkBy)) out.atkBy = a.atkBy; if (a.atkRow && typeof a.atkRow.f === 'string' && /^f_[A-Za-z0-9_]{1,24}$/.test(a.atkRow.f) && typeof a.atkRow.r === 'string' && /^w_[A-Za-z0-9_]{1,24}$/.test(a.atkRow.r)) out.atkRow = { f: a.atkRow.f, r: a.atkRow.r }; if (a.atkPriv === true) out.atkPriv = true;   // 1.6.3 (defense fold 3): a landing's attempt is an attack's, whose defense reads its lines
    if (a.rd && typeof a.rd === 'object' && !Array.isArray(a.rd)) { var rd = {}; Object.keys(a.rd).slice(0, 80).forEach(function(k) { if (k.length <= 60 && typeof a.rd[k] === 'number' && isFinite(a.rd[k])) rd[k] = a.rd[k]; }); out.rd = rd; }
    if (Array.isArray(a.calls)) { out.calls = a.calls.filter(function(c) { return c && typeof c === 'object' && typeof c.roll === 'string'; }).slice(0, 12).map(function(c) { var k = { roll: c.roll.slice(0, 40), by: txt(c.by, 40) }; if (typeof c.byIf === 'string') k.byIf = c.byIf.slice(0, 10000); if (c.to === 'self') k.to = 'self'; if (c.on === 'roller' || c.on === 'target') k.on = c.on; if (typeof c.crew === 'string' || Array.isArray(c.crew)) k.crew = typeof c.crew === 'string' ? c.crew.slice(0, 40) : c.crew.filter(function(x) { return typeof x === 'string'; }).slice(0, 8).map(function(x) { return x.slice(0, 40); }); return k; }); out.callBy = txt(a.callBy, 60); if (typeof a.callFrom === 'string' && camp.chars && own(camp.chars, a.callFrom)) out.callFrom = a.callFrom; out.callFromName = txt(a.callFromName, 60); if (a.callRow && typeof a.callRow.f === 'string' && typeof a.callRow.r === 'string') out.callRow = { f: a.callRow.f.slice(0, 30), r: a.callRow.r.slice(0, 30) }; if (a.callPriv === true) out.callPriv = true; }
    return out;
}
// A saved landing, read back as data (landsBack): null where it does not read, or its characters, its map or its damage roll are gone
function landRead(r, camp) {
    if (!r || typeof r !== 'object' || typeof r.id !== 'string' || !LAND_ID.test(r.id) || (r.st !== 'wait' && r.st !== 'card' && r.st !== 'send') || !camp || !camp.chars) return null;
    var cid = function(x) { return typeof x === 'string' && x.length <= 80 && own(camp.chars, x) ? x : ''; }, txt = function(x, n) { return typeof x === 'string' ? x.replace(/[\u0000-\u001f\u007f]+/g, ' ').slice(0, n) : ''; };
    var by = cid(r.by), to = cid(r.to), S = SC(); if (!by || !to || !S || typeof S.withRange !== 'function') return null;
    if (by === to && !(typeof r.hops === 'number' && r.hops > 0 && cid(r.sby) && r.sby !== to)) return null;   // the review of defense fold 4 (finding 4): an attack sent on may come back at the one who made it, so that is no fault where another sent it
    var rg = r.range && typeof r.range === 'object' ? (S.withRange({}, r.range) || {}).range : null; if (!rg) return null;
    var out = { id: r.id, st: r.st, at: typeof r.at === 'number' && isFinite(r.at) ? r.at : Date.now(), by: by, byName: txt(r.byName, 60), to: to, toTok: txt(r.toTok, 80), toName: txt(r.toName, 60), map: txt(r.map, 80), range: rg, hops: typeof r.hops === 'number' && isFinite(r.hops) ? Math.max(0, Math.min(8, Math.floor(r.hops))) : 0, atk: 1, fid: typeof r.fid === 'string' && /^f_[a-z0-9]{8}$/.test(r.fid) ? r.fid : '' };
    if (typeof r.dmg === 'string' && /^r_[A-Za-z0-9_]{1,24}$/.test(r.dmg)) out.dmg = r.dmg; else if (typeof r.dmg === 'number' && Math.floor(r.dmg) === r.dmg && r.dmg >= 0 && r.dmg < 64) out.dmg = r.dmg; else return null;
    if (r.row && typeof r.row === 'object' && typeof r.row.f === 'string' && /^f_[A-Za-z0-9_]{1,24}$/.test(r.row.f) && typeof r.row.r === 'string' && /^w_[A-Za-z0-9_]{1,24}$/.test(r.row.r)) {
        out.row = { f: r.row.f, r: r.row.r };
        if (r.rowCopy && typeof r.rowCopy === 'object' && !Array.isArray(r.rowCopy)) { var s = ''; try { s = JSON.stringify(r.rowCopy); } catch (e) { s = ''; } if (s && s.length <= 200000) out.rowCopy = JSON.parse(s); }
    } else if (typeof out.dmg === 'number') return null;
    if (!landDmgOf(camp, out)) return null;
    if (typeof r.hit === 'string' && /^w_[A-Za-z0-9_]{1,24}$/.test(r.hit)) out.hit = r.hit;
    if (r.big === true) out.big = true; if (r.priv === true) out.priv = true; if (r.hid === true && out.priv) out.hid = true;   // the review of rolls: hidden by the GM's choice alone, read back only beside priv
    if ((out.st === 'wait' || out.st === 'send') && typeof r.until === 'number' && isFinite(r.until)) out.until = r.until;
    if (typeof sendOnRead === 'function' && !sendOnRead(r, out, camp)) return null;   // 1.6.3 (defense fold 4): the attack itself, its frozen kind, who sent it on, and what a card to send it on waits with
    if (typeof r.thru === 'string' && /^w_[A-Za-z0-9_]{1,24}$/.test(r.thru)) out.thru = r.thru; if (typeof camp.id === 'string') out.cid = camp.id;
    if (r.ans !== undefined && typeof ansClean === 'function') { var anL = ansClean(r.ans); if (anL) out.ans = anL; }   // 1.6.3 (defense fold 3): what its defense did, read back as data   // the review of fold 1: the row a parry took the blow on, and the campaign it is read into
    var D = DC(); if (r.from && D && typeof D.cleanFrom === 'function') { var fr = D.cleanFrom(r.from); if (fr) out.from = fr; }
    var cd = r.card && D && typeof D.cleanDue === 'function' ? D.cleanDue(r.card) : null; if (cd && cd.att === r.id) out.card = cd;
    if (out.st === 'wait') { var a = landAttRead(r.att, out, camp); if (!a) return null; out.attSaved = a; }
    return out;
}
// As the host's table opens (fightsBack): the landings its fights' save held come back, each with its attempt, its wait armed again, and the GM's own copy
// of its card put back in the chat where a reload took it away. How many came back
function landsBack(list, camp) {
    var n = 0; if (!Array.isArray(list) || !camp) return 0;
    list.slice(0, LAND_MAX * 40).forEach(function(raw) {
        var rec = landRead(raw, camp); if (!rec) return;
        _lands[rec.id] = rec; if (_landIds.indexOf(rec.id) < 0) _landIds.push(rec.id);
        if (rec.st === 'wait') { _attempts[rec.id] = JSON.parse(JSON.stringify(rec.attSaved)); landAttKeep(rec.id); }
        else if (rec.st === 'card') { var dm = landDmgOf(camp, rec), ch = own(camp.chars, rec.by) ? camp.chars[rec.by] : null; if (!dm || !ch) { delete _lands[rec.id]; _landIds = _landIds.filter(function(x) { return x !== rec.id; }); return; } _attempts[rec.id] = landCardAtt(camp, rec, dm, ch).a; landAttKeep(rec.id); }
        if (rec.card && !chatLog.some(function(m) { return m && m.due && m.due.att === rec.id; })) pushChat({ from: rec.card.from, text: '', scope: 'whisper', ts: rec.card.ts, due: rec.card });
        n++;
    });
    if (n) { landArm(); landLog('back', { n: n }); }
    return n;
}
net.landsHeld = function() { return _landIds.length; };
// The review of fold 1: a fight that ends by End combat or with its map (combatOver, never the session's end, which landForget says) lets go of its landings,
// waiting or as cards, each said to the GM by name, so none is kept for a fight that is over and lost unsaid on a reload
function landFightOver(fid) {
    if (typeof fid !== 'string' || !fid) return 0; var gone = [];
    _landIds.slice().forEach(function(id) { var r = _lands[id]; if (!r || r.fid !== fid) return; gone.push(r); landEnd(id, 'fight over'); if (typeof attemptDrop === 'function') attemptDrop(id); if (typeof net.dueOver === 'function') net.dueOver(id, 'gone'); });
    if (gone.length) landSayGone(gone, 'its fight ended.');
    return gone.length;
}
// Whether a landing's damage card has nobody to press it now: the attacker's player is away from the table (the GM's copy then offers Roll it now under
// any setting, so the damage never waits with no way to roll it)
function landByAway(camp, rec) {
    var ch = rec && camp && camp.chars && own(camp.chars, rec.by) ? camp.chars[rec.by] : null; if (!ch || ch.npc || !ch.ownerId) return false;
    return !(net.active && net.conns.some(function(c) { return c && c.open && net.roster[c.peer] && peerProfileId(c) === ch.ownerId; }));
}
net.landBy = function() { return landRule(getActiveCampaign()).by; };   // 1.6.3 (a live two-peer check): who rolls a landed attack's damage, for the words of No defense (dice.js noDefTip)
net.landStuck = function(id) { var r = landOf(id); return !!r && r.st === 'card' && net.role !== 'client' && landByAway(getActiveCampaign(), r); };
// The roster moved (broadcastRoster): a landing's card may now have nobody to press it, or somebody again, so the GM's chat is drawn again
function landRosterMoved() { if (_landIds.some(function(id) { return _lands[id] && (_lands[id].st === 'card' || _lands[id].st === 'send'); }) && typeof renderChatSoon === 'function') renderChatSoon(); }   // 1.6.3 (the review of defense fold 4, finding 6): and a card to send it on
// [netcheck:attland-end]
// [netcheck:sendon-start]
// 1.6.3 (defense fold 4; docs/DEFENSE_INTERACTIONS_DESIGN.md 4.3, backlog 243, Fulllion's decision 4 of 2026-11-17 and the core's answers 4 to 6 of the same day).
// A line of When it answers an attack may send the attack on (does 'send', systemcore cleanAnswers). The defense succeeds and stops it, and the defender gets a
// card, Send it on, with Turn it aside beside it (the backlog's own word for closing it with no roll). Send it on aims the attack at the one the defender points
// at as they press it: the host reads that pointer from its own net.targets, never the press, and checks the target as every pointer is checked (rangeTo: a
// shown character token on the map they stand on, never their own), then that it is not themselves, that it is within How far, and that it is not straight
// back at the one who sent it to them (the landing's sby, else its first attacker; the core's answer 5), unless the line ticks May go straight back. Then the
// line's roll is made as the defender, from their token, at the new target, with the line's modifier (sendOnPress), or the attack is placed with no roll at Its
// margin. The one who sends it on is the attacker of what follows (decision 4; the core's answer 4): a new attempt is made from them (sendOnGo, attemptMake),
// so the new target's defense reads their figures as Attempter.<key>, the row they parried with as Attempter.Row.<name>, the darkness at their place and their
// margin. The damage and its type stay the first attack's: the new landing keeps the first one's damage roll and the copy of the attacking row it froze, and
// the attack's kind and type as first made (ak), and its damage card still goes to the one who made the attack. An attack may be sent on as many times as the
// Combat tab says (combat.sendHops, absent: once, the core's answer 5; the app's own ceiling SEND_ON_MAX), counted on the landing (hops); past it the defense
// that would send it on stops it, and the GM is told. Sending it on spends nothing and Off a character's turn does not judge it (the core's answer 6). A card
// to send it on is saved with its fight as a landing is (st 'send', snd), and the Combat tab's wait turns it aside when it runs out. Each step logs as attempt v1
var SEND_ON_MAX = 8, SEND_NOT = 'That attack cannot be sent on now.';
function sendOnHops(camp) { var c = camp && camp.system && camp.system.combat; var n = c && typeof c.sendHops === 'number' && isFinite(c.sendHops) ? Math.floor(c.sendHops) : 1; return Math.max(1, Math.min(SEND_ON_MAX, n)); }
function sendOnSay(words) { if (typeof logEvent === 'function') logEvent('table', words); if (typeof toast === 'function') toast(words); return words; }
function sendOnNames(rec) { return (rec && rec.sbyName ? rec.sbyName : rec && rec.byName ? rec.byName : 'An attacker') + '\u2019s attack on ' + (rec && rec.toName ? rec.toName : 'its target'); }
// What the GM is told where a line would send an attack on that cannot be: who (the defender's name), and why: 'line', a hit along a line; 'none', an attack
// with no landing, whose damage is applied by hand and so nothing carries it on; 'gone' (the review of fold 4, finding 5), an attack whose own roll the system no
// longer holds (a landing saved before this fold, or a roll moved or removed in the System editor while it waited), so nothing could make the next attempt from it
function sendOnNone(who, why) {
    var nm = String(who || 'A character').slice(0, 60);
    landLog('send none', { why: why });
    return sendOnSay(nm + '\u2019s defense would send the attack on, but ' + (why === 'line' ? 'an attack along a line cannot be sent on' : why === 'gone' ? 'the roll the attack was made with is not there now' : 'it names no damage of its own to send') + ', so it stopped it.');
}
// The attack a landing was made by, as a reference: a roll of the system by its id, or a list's roll by its place on the GM's list (f#i). '' where it is neither
function sendOnEntRef(camp, entry, rowRef) {
    var sys = camp && camp.system; if (!sys || !entry) return '';
    if (typeof entry.id === 'string' && /^r_[A-Za-z0-9_]{1,24}$/.test(entry.id)) return entry.id;
    var f = null; if (rowRef && typeof rowRef.f === 'string') (Array.isArray(sys.fields) ? sys.fields : []).forEach(function(x) { if (x && x.id === rowRef.f && x.kind === 'item-list' && x.list && Array.isArray(x.list.rolls)) f = x; });
    var i = f ? f.list.rolls.indexOf(entry) : -1; if (i < 0 && f) f.list.rolls.forEach(function(r, k) { if (i < 0 && r && r.formula === entry.formula && r.label === entry.label) i = k; });
    return i >= 0 ? f.id + '#' + i : '';
}
// ... and back: the GM's entry it names, or null
function sendOnEnt(camp, ref) {
    var sys = camp && camp.system, hit = null; if (!sys || typeof ref !== 'string') return null;
    if (/^r_[A-Za-z0-9_]{1,24}$/.test(ref)) { (Array.isArray(sys.rolls) ? sys.rolls : []).forEach(function(r) { if (r && r.id === ref && typeof r.formula === 'string') hit = r; }); return hit; }
    var m = /^(f_[A-Za-z0-9_]{1,24})#(\d{1,3})$/.exec(ref); if (!m) return null;
    (Array.isArray(sys.fields) ? sys.fields : []).forEach(function(f) { if (f && f.id === m[1] && f.kind === 'item-list' && f.list && Array.isArray(f.list.rolls)) hit = f.list.rolls[+m[2]] || null; });
    return hit;
}
// The roll a line sends it on with, as the GM's system holds it: { ent, row } where row is the parrying row for a list's roll (its own list's alone), or null
function sendOnRoll(camp, snd) {
    var S = SC(), sys = camp && camp.system; if (!S || !sys || !snd || typeof snd.roll !== 'string') return null;
    var lr = typeof S.listRollRef === 'function' ? S.listRollRef(snd.roll) : null, ent = lr ? null : sendOnEnt(camp, snd.roll);
    if (lr) { if (!snd.row || snd.row.f !== lr.f) return null; ent = sendOnEnt(camp, snd.roll); }
    return ent && typeof ent.formula === 'string' && ent.formula && !Array.isArray(ent.apply) ? { ent: ent, row: lr ? { f: snd.row.f, r: snd.row.r } : null } : null;
}
// A defense whose line sends it on came in (landAnswered, with the line picked and what it worked out): the landing waits for the defender's press. false
// where it cannot be sent on, which stops it (the caller ends it): the defender is gone, it may be sent on no further, or a figure could not be worked out
function sendOnOffer(camp, id, pick) {
    var rec = landOf(id), a = pick && pick.line; if (!rec || rec.st !== 'wait' || !a) return false;
    var tch = camp && camp.chars && own(camp.chars, rec.to) ? camp.chars[rec.to] : null; if (!tch) return false;
    if ((rec.hops || 0) >= sendOnHops(camp)) { landLog('send no further', { hops: rec.hops || 0 }); sendOnSay(sendOnNames(rec) + ' can be sent on no further, so ' + String(tch.name || 'the defense').slice(0, 60) + ' stopped it.'); return false; }
    if (pick.sBad === true) { landLog('send unread', {}); sendOnSay(String(tch.name || 'A character').slice(0, 60) + '\u2019s defense could not work out how far or how well it sends the attack on, so it stopped it.'); return false; }
    if (!sendOnEnt(camp, rec.ent)) { sendOnNone(tch.name, 'gone'); return false; }   // the review of fold 4 (finding 5): with no roll of its own to make the next attempt from, it is stopped here, never sent on undefended
    var snd = {}; if (a.back === true) snd.back = true;
    if (a.noRoll === true) { snd.noRoll = true; snd.margin = typeof pick.margin === 'number' ? pick.margin : 0; }
    else if (typeof a.roll === 'string' && a.roll) { snd.roll = a.roll; if (typeof pick.mod === 'number' && pick.mod) snd.mod = pick.mod; }
    if (typeof pick.far === 'number') snd.far = pick.far;
    if (pick.row && typeof pick.row.f === 'string' && typeof pick.row.r === 'string') snd.row = { f: pick.row.f, r: pick.row.r };
    rec.st = 'send'; rec.snd = snd; delete rec.until; delete rec.card;
    var w = landRule(camp).wait; if (w) rec.until = Date.now() + w * 1000;
    var toO = (!rec.priv || rec.hid === true) && !tch.npc && !!tch.ownerId, sby = typeof rec.sby === 'string' && rec.sby ? rec.sby : rec.by, sc = camp.chars && own(camp.chars, sby) ? camp.chars[sby] : null, sn = rec.sbyName || rec.byName || '';
    if (typeof net.postSendOn === 'function') net.postSendOn(tch, id, toO && sc ? landSeenBy(camp, sc, tch.ownerId, sn) : sn, toO);
    landCardKeep(rec); landLog('send offered', { hops: rec.hops || 0, roll: snd.noRoll !== true }); landArm(); landKeepSoon();
    return true;
}
// It goes no further: the landing ends and every copy of its card says why, a fixed word ('aside', 'missed', 'sent')
function sendOnEnd(id, say, step) { landEnd(id, step || say); if (typeof net.dueOver === 'function') net.dueOver(id, say); }
// The defender's press (pid: their player's profile id, '' for the GM's own; from: who pressed, for the roll's card). how 'aside' turns it aside; 'send' sends
// it at the one they point at now. true, or the words why not, which leave the card waiting
function sendOnPress(camp, id, how, pid, from) {
    var S = SC(), D = DC(), Fc = window.wpFormula, rec = landOf(id); if (!rec || rec.st !== 'send' || !rec.snd || !camp || !camp.system) return typeof LAND_GONE === 'string' ? LAND_GONE : SEND_NOT;
    if (typeof rec.cid === 'string' && camp.id !== rec.cid) return SEND_NOT;
    var tch = camp.chars && own(camp.chars, rec.to) ? camp.chars[rec.to] : null; if (!tch) { landLetGo(id, 'its defender is gone.'); return SEND_NOT; }
    if (pid && !(!tch.npc && (tch.ownerId === pid || (typeof handsTo === 'function' && handsTo(tch, pid))))) return 'That attack is not yours to send on.';
    if (how === 'aside') { sendOnEnd(id, 'aside', 'turned aside'); return true; }
    if ((rec.hops || 0) >= sendOnHops(camp)) { sendOnEnd(id, 'aside', 'no further'); sendOnSay(sendOnNames(rec) + ' can be sent on no further, so it was turned aside.'); return true; }
    if (!sendOnEnt(camp, rec.ent)) { sendOnEnd(id, 'aside', 'no attack'); landLog('send none', { why: 'gone' }); sendOnSay('The roll ' + sendOnNames(rec) + ' was made with is not there now, so it was turned aside.'); return true; }   // the review of fold 4 (finding 5): never sent on undefended for want of its own roll
    var snd = rec.snd, map = camp.items && own(camp.items, rec.map) ? camp.items[rec.map] : null, tok = map && Array.isArray(map.whiteboard) ? map.whiteboard.find(function(x) { return !!x && x.id === rec.toTok; }) : null;
    if (!tok || tok.waiting || tok.charId !== tch.id) return 'Your token is not on that map now, so it cannot be sent on from there.';
    // Whose pointer aims it. A player's press: their own, always, judged by rangeTo as them (so a target their fog drops reads as nobody pointed at). The GM's own
    // press (the review of fold 4, finding 7): the GM's own pointer where it stands on that map, which the card asks them to set, else the token's own (Target
    // as), else, for a player's character whose player is away, that player's; the first that stands on that map aims it, judged as the GM sees the map (no
    // viewer's fog: rangeTo with no profile and the pointer's token), since the GM sees every token there
    var rg = null;
    if (pid) rg = typeof rangeTo === 'function' ? rangeTo(camp, map, rec.map, tok, pid) : null;
    else [typeof net.myId === 'string' ? net.myId : '', 'tk:' + tok.id, !tch.npc && tch.ownerId ? tch.ownerId : ''].forEach(function(p) {
        var t = !rg && p && net.targets && own(net.targets, p) ? net.targets[p] : null; if (!t || t.mapId !== rec.map || typeof t.id !== 'string' || typeof rangeTo !== 'function') return;
        var rgP = rangeTo(camp, map, rec.map, tok, '', t.id); if (rgP && typeof rgP.tid === 'string') rg = rgP;
    });
    if (!rg || typeof rg.tid !== 'string') return 'Point at who you send it to first, on the map you stand on.';
    var w = map.whiteboard.find(function(x) { return !!x && x.id === rg.tid; }), ch2 = w && typeof w.charId === 'string' && own(camp.chars, w.charId) ? camp.chars[w.charId] : null;
    if (!w || !ch2 || w.hidden || w.waiting) return 'That is not someone it can be sent at.';
    if (ch2.id === tch.id) return 'It cannot be sent at yourself.';
    var backTo = typeof rec.sby === 'string' && rec.sby ? rec.sby : rec.by; if (snd.back !== true && ch2.id === backTo) return 'It cannot go straight back at the one who sent it.';
    var fmt = function(n) { return D && typeof D.fmtNum === 'function' ? D.fmtNum(n) : String(n); }, uw = function(n) { return S && typeof S.rangeUnitWord === 'function' ? ' ' + S.rangeUnitWord(camp.system, n) : ''; };   // the review of fold 4 (finding 9): in the unit the range counts in, named
    if (typeof snd.far === 'number' && !(typeof rg.dist === 'number' && isFinite(rg.dist) && rg.dist <= snd.far)) return 'That is out of reach. It can be sent ' + fmt(snd.far) + uw(snd.far) + ' at most, and that is ' + (typeof rg.dist === 'number' && isFinite(rg.dist) ? fmt(rg.dist) + uw(rg.dist) : 'farther') + ' away.';
    var vd = null, privS = false;   // privS: the roll that sends it on was kept the GM's own (the review of fold 4, finding 1), so what follows is kept so too
    if (snd.noRoll === true) vd = { kind: 'check', pass: true, margin: typeof snd.margin === 'number' ? snd.margin : 0 };
    else {
        var sr = sendOnRoll(camp, snd); if (!sr) { sendOnEnd(id, 'aside', 'no roll'); sendOnSay('The roll ' + String(tch.name || 'the defender').slice(0, 60) + ' sends it on with is not there now, so ' + sendOnNames(rec) + ' was turned aside.'); return true; }
        var tcS = S && typeof S.withRange === 'function' ? S.withRange({}, rg) : null;
        var ndS = sendOnNeeds(camp, snd.roll, sr, tch, pid, tcS); if (ndS !== true) return ndS;   // its own needs, a rank or once a round, judged as its press would be (by the presser's own view: the review of fold 4, finding 3)
        var ex = sr.ent.formula; if (snd.mod && D && typeof D.composeModifier === 'function' && Fc) { var cm = D.composeModifier(ex, snd.mod, Fc.parse); if (!cm || !cm.ok) return 'Its modifier cannot be added to that roll.'; ex = cm.expr; }
        var o = { charId: tch.id, label: (String(sr.ent.label || 'Roll').split('{')[0].trim().slice(0, 40) || 'Roll') + ', sending it on', range: rg, called: true };   // called: no press its owner chose, so nothing is spent and Off a character's turn says nothing (the core's answer 6)
        if (sr.row) o.row = { f: sr.row.f, r: sr.row.r }; if (rec.priv) { if (rec.hid === true) o.hide = true; else o.priv = true; } if (from && typeof from === 'object') o.from = from;   // the review of rolls: an attack hidden by the GM's choice alone is sent on as hidden by choice (hide), so a secret reason of the roll's own still counts apart
        if (sendOnGmRoll(camp, sr)) o.gmOnly = true;   // the review of fold 4 (finding 2): a roll the GM keeps (a GM-only roll, or a roll of a GM-only list or one ticked GM only) is posted to the GM alone, its label and formula with it
        net.rollVerdict = null; net.rollChose = false; var r = typeof net.diceRoll === 'function' ? net.diceRoll(ex, o) : { error: SEND_NOT }; if (r && r.error) return r.error;
        vd = net.rollVerdict; net.rollVerdict = null; privS = !!(r && r.priv) && net.rollChose !== true; net.rollChose = false;   // the review of rolls: a roll private only by the GM's choice (a hidden attack sent on) leaves what follows hidden by choice, its defender still given their card
        if (!vd || vd.kind !== 'check') { sendOnEnd(id, 'aside', 'no check'); sendOnSay('The roll ' + String(tch.name || 'the defender').slice(0, 60) + ' sent it on with is no check, so ' + sendOnNames(rec) + ' was turned aside.'); return true; }
    }
    if (vd.pass !== true) { sendOnEnd(id, 'missed', 'missed'); landLog('send missed', {}); sendOnSay(String(tch.name || 'The defender').slice(0, 60) + ' sent ' + (rec.byName || 'an attacker') + '’s attack on at ' + String(w.charName || w.name || ch2.name || 'someone').slice(0, 60) + ', and it missed.'); return true; }
    sendOnGo(camp, rec, tch, tok, rg, w, ch2, vd, privS);
    return true;
}
// The review of fold 4 (finding 2): whether the roll a line sends it on with is the GM's own: a roll of the system marked GM only, a roll of a list players do
// not see, or a list roll ticked GM only. Such a roll's card is the GM's alone, as its own press would be
function sendOnGmRoll(camp, sr) {
    if (!sr || !sr.ent) return false; if (sr.ent.vis === 'gm' || sr.ent.gm === true) return true;
    var f = sr.row ? (camp && camp.system && Array.isArray(camp.system.fields) ? camp.system.fields : []).filter(function(x) { return !!x && x.id === sr.row.f; })[0] : null;
    return !!(f && f.vis === 'gm');
}
// The review of fold 4 (finding 3): the needs of the roll a line sends it on with, judged as that roll's own press would be. A player's press is judged by their
// own view (playerSystem, the roll by its place there, rollPlace, and their own copy of the character), so a need the players' view leaves out, one on a
// GM-only value, never holds them back, and the words they are told are their view's. The GM's own press is judged by the system, and a roll ticked Needs
// judged only for players (needsGm) lets it past. ref: the line's roll as it names it (a roll of the system by id, a list's by f#i). true, or the words why not
function sendOnNeeds(camp, ref, sr, tch, pid, tcS) {
    var S = SC(), Fc = window.wpFormula, sys = camp.system, ent = sr.ent, chv = tch; if (!S || !Fc) return SEND_NOT;
    if (pid) {
        var W = window.wpSheets; if (!W || typeof W.playerSystem !== 'function' || typeof S.charFor !== 'function') return SEND_NOT;
        sys = W.playerSystem(camp); if (!sys) return SEND_NOT; ent = null;
        var lr = typeof S.listRollRef === 'function' ? S.listRollRef(ref) : null;
        if (lr) { var vf = (Array.isArray(sys.fields) ? sys.fields : []).filter(function(x) { return !!x && x.id === lr.f && x.kind === 'item-list'; })[0], ri = typeof S.rollPlace === 'function' ? S.rollPlace(camp.system, sys, lr.f, lr.i) : lr.i; ent = vf && vf.list && Array.isArray(vf.list.rolls) ? vf.list.rolls[ri] || null : null; }
        else (Array.isArray(sys.rolls) ? sys.rolls : []).forEach(function(x) { if (x && x.id === ref) ent = x; });
        if (!ent) return true;   // the players' view holds no such roll: nothing of it they may read holds them back
        if (!ent.needs && !(Array.isArray(ent.needsWhy) && ent.needsWhy.length)) return true;
        chv = S.charFor(tch, sys, pid, { lib: fxLib(camp.system), items: itemLib(camp.system), full: camp.system }); if (!chv) return SEND_NOT;
    } else if (ent.needsGm === true) return true;
    if (!ent.needs && !(Array.isArray(ent.needsWhy) && ent.needsWhy.length)) return true;
    var cv = null; try { cv = S.makeResolver(sys, chv, Fc, tcS); if (typeof cv === 'function' && sr.row) cv = cv.row(sr.row.f, sr.row.r); } catch (e) { cv = null; }
    if (typeof cv !== 'function') return SEND_NOT;
    return S.rollNeedsOk(ent, cv, Fc) ? true : S.rollNeedsSays(ent, cv, Fc);
}
// It goes on: a new attempt from the one who sent it, at the new target, and a new landing that keeps the first attack's damage (decision 4). The old landing
// ends, its card saying it was sent on. A new target no defense is offered to is hit at once, as a hit with no defense is (landFire)
function sendOnGo(camp, old, tch, tok, rg, w, ch2, vd, privS) {   // privS (the review of fold 4, finding 1): the roll that sent it on was kept the GM's own
    var S = SC(), rgc = S && typeof S.withRange === 'function' ? (S.withRange({}, rg) || {}).range : null; if (!rgc) { sendOnEnd(old.id, 'aside', 'no range'); return ''; }
    var ent = sendOnEnt(camp, old.ent), snd = old.snd || {}, oc = camp.chars && own(camp.chars, old.by) ? camp.chars[old.by] : null, pv = old.priv === true || privS === true;
    if (!ent) { sendOnEnd(old.id, 'aside', 'no attack'); sendOnSay('The roll ' + sendOnNames(old) + ' was made with is not there now, so it was turned aside.'); return ''; }   // the review of fold 4 (finding 5): never on to a new target undefended
    var kn = oc && old.ak && ent && typeof attKindWord === 'function' ? attKindWord(camp, ent, Object.assign({}, oc, { values: landVals(oc, old) }), old.row) : '';
    var att = '';
    if (typeof ent.resistBy === 'string' && typeof attemptMake === 'function') att = attemptMake(camp, ent, vd, false, rg, tch, pv ? (old.hid === true && old.priv === true && privS !== true ? 'hid' : true) : false, null, snd.row || null, { kon: !!old.ak, k: old.ak ? old.ak.k : 0, t: old.ak ? old.ak.t : undefined, kn: kn }) || '';
    var rec = { st: 'wait', at: Date.now(), by: old.by, byName: old.byName, to: ch2.id, toTok: w.id, toName: typeof tokNameOf === 'function' ? tokNameOf(camp, old.map, ch2, w.id) : String(ch2.name || '').slice(0, 60), map: old.map, range: rgc, dmg: old.dmg, hops: (old.hops || 0) + 1, atk: 1, sby: tch.id, sbyName: typeof tokNameOf === 'function' ? tokNameOf(camp, old.map, tch, tok.id) : String(tch.name || '').slice(0, 60) };
    ['ent', 'row', 'rowCopy', 'big', 'priv', 'from', 'cid'].forEach(function(k) { if (old[k] !== undefined) rec[k] = JSON.parse(JSON.stringify(old[k])); }); if (old.ak) rec.ak = JSON.parse(JSON.stringify(old.ak)); if (pv) rec.priv = true; if (old.hid === true && old.priv === true && privS !== true) rec.hid = true;   // the review of rolls: an attack the GM hid by choice alone stays so when sent on, unless the roll that sent it was kept private itself
    var fid = typeof fightOfTok === 'function' ? fightOfTok(old.map, tok.id) : null; rec.fid = typeof fid === 'string' && fid ? fid : old.fid || '';
    sendOnEnd(old.id, 'sent', 'sent on');
    var waits = typeof att === 'string' && att && Object.prototype.hasOwnProperty.call(_attempts, att), id = waits ? att : landNewId(); rec.id = id;
    _lands[id] = rec; _landIds.push(id);
    landLog('sent on', { hops: rec.hops, waits: !!waits });
    sendOnSay(String(tch.name || 'The defender').slice(0, 60) + ' sent ' + (old.byName || 'an attacker') + '\u2019s attack on at ' + (rec.toName || 'someone') + '.');
    if (waits) { _attempts[id].lw = id; landAttKeep(id); var wt = landRule(camp).wait; if (wt) rec.until = rec.at + wt * 1000; landCardKeep(rec); landArm(); }
    else landFire(camp, id, 'hit');
    landBound(rec.fid); landKeepSoon();
    return id;
}
// The wait ran out on a card to send it on (landSweep): it is turned aside, but never while the table is paused, its defender's player is away, or another
// campaign is on screen, when it waits on a little
function sendOnSweep(camp, id, now) {
    var r = landOf(id); if (!r || r.st !== 'send' || typeof r.until !== 'number' || r.until > now) return;
    if (!camp || !camp.chars || (typeof r.cid === 'string' && camp.id !== r.cid)) { r.until = now + 5000; return; }
    if (net.paused || (typeof landAway === 'function' && landAway(camp, { charId: r.to }))) { r.until = now + 5000; return; }
    sendOnEnd(id, 'aside', 'wait');
}
// A saved landing's own of this fold, read back as data (landRead): the attack by its reference, its frozen kind and type, who sent it on, and what a card to
// send it on waits with. false where a card to send it on does not read, which drops it
function sendOnRead(r, out, camp) {
    var txt = function(x, n) { return typeof x === 'string' ? x.replace(/[\u0000-\u001f\u007f]+/g, ' ').slice(0, n) : ''; }, num = function(v, lo, hi) { return typeof v === 'number' && isFinite(v) ? Math.max(lo, Math.min(hi, v)) : null; };
    if (typeof r.ent === 'string' && (/^r_[A-Za-z0-9_]{1,24}$/.test(r.ent) || /^f_[A-Za-z0-9_]{1,24}#\d{1,3}$/.test(r.ent))) out.ent = r.ent;
    if (r.ak && typeof r.ak === 'object' && typeof r.ak.k === 'number' && isFinite(r.ak.k)) { out.ak = { k: num(r.ak.k, -9999, 9999) }; if (typeof r.ak.t === 'number' && isFinite(r.ak.t)) out.ak.t = num(r.ak.t, -9999, 9999); }
    if (typeof r.sby === 'string' && camp && camp.chars && own(camp.chars, r.sby)) { out.sby = r.sby; out.sbyName = txt(r.sbyName, 60); }
    if (out.st !== 'send') return true;
    var s = r.snd; if (!s || typeof s !== 'object' || Array.isArray(s)) return false; var o = {};
    if (s.back === true) o.back = true;
    if (s.noRoll === true) { o.noRoll = true; var mg = num(s.margin, -999, 999); o.margin = mg === null ? 0 : Math.round(mg); }
    else if (typeof s.roll === 'string' && (/^r_[A-Za-z0-9_]{1,24}$/.test(s.roll) || /^f_[A-Za-z0-9_]{1,24}#\d{1,3}$/.test(s.roll))) { o.roll = s.roll; var md = num(s.mod, -999, 999); if (md) o.mod = Math.round(md); }
    var fr = num(s.far, 0, 1e6); if (fr !== null) o.far = fr;
    if (s.row && typeof s.row === 'object' && typeof s.row.f === 'string' && /^f_[A-Za-z0-9_]{1,24}$/.test(s.row.f) && typeof s.row.r === 'string' && /^w_[A-Za-z0-9_]{1,24}$/.test(s.row.r)) o.row = { f: s.row.f, r: s.row.r };
    out.snd = o; return true;
}
// The GM's own presses on a card to send it on (the GM's own card for an NPC, Turn it aside on their copy of a player's), and a player's, sent to the host
net.sendOn = function(id, how) {
    if (net.active && net.role !== 'host') return false;
    var r = sendOnPress(getActiveCampaign(), id, how === 'aside' ? 'aside' : 'send', '', null); if (r !== true && typeof toast === 'function') toast(r); return r === true;
};
// The review of fold 4 (finding 6): a card to send it on whose defender's player is away from the table, so its GM's copy offers Send it on too (as landStuck
// offers Roll it now). The GM aims it with their own pointer (sendOnPress), and the card is drawn again as the roster moves (landRosterMoved)
net.sendStuck = function(id) { var r = landOf(id); return !!r && r.st === 'send' && net.role !== 'client' && typeof landAway === 'function' && landAway(getActiveCampaign(), { charId: r.to }); };
net.sendOnAsk = function(id, how) {
    if (!net.active || net.role !== 'client' || !net.conns || !net.conns[0] || !net.conns[0].open || typeof id !== 'string') return false;
    try { net.conns[0].send(how === 'aside' ? { type: 'send-on', att: id, how: 'aside' } : { type: 'send-on', att: id }); return true; } catch (e) { sendFailed(e); return false; }
};
// [netcheck:sendon-end]
// [netcheck:ansline-start]
// 1.6.3 (defense fold 3; docs/DEFENSE_INTERACTIONS_DESIGN.md 4.2, Fulllion's decisions 3, 6 and 8 of 2026-11-17, and the core's answers 1 to 3): what a defense that
// succeeds does to the attack it answers, judged here on the host from its own records alone. The lines are the defense roll's own (systemcore cleanAnswers,
// When it answers an attack, the GM's view only). ansPick reads them as the defense comes in: the first line whose condition holds, read on the defender with
// the parrying row's names, the attempt laid on and the defense roll's result (RollMargin, RollTotal, Natural, RollCrit, RollBig), and for Stops a number of hits
// how many, read the same way. A list roll's own Takes the blow on this row tick is read as a last line with no condition (but never for a line attack, which
// it never let through). Only an attack's attempt reads them (atk, set by attemptMake; a landing's): a blast's own Defense, a called roll and a wound roll never
// do. The effect is applied when the damage lands: landAnswered (a landing) and areaAnswered (a line resisted by each target) keep it, ansStamp writes what it
// comes to on the GM's own copy of the damage roll (the table's copy shows the dice as rolled), and dice.js lays it on the Take damage window's figures. A
// weapon test the line names is made by ansTests as the defense succeeds, as the Combat tab's How a weapon test is made says (Fulllion's decision 8): a card
// the weapon's owner presses (callPost), rolled at once (testRollNow), or both, the GM's copy then offering Roll it now (net.testNow). Each step logs as attempt v1
function ansPick(camp, rec, act, row, ch, tc, rv, noTick) {   // rv: { vd, mf, res, big }, the defense roll's verdict, malfunction, result and heavy hit (none: its result reads 0); noTick: the list roll's own tick is no line here
    var S = SC(), Fc = window.wpFormula; if (!S || !Fc || !camp || !camp.system || !rec || !ch || typeof cardEnt !== 'function') return null;
    var ent = cardEnt(camp, act, row && typeof row.i === 'number' ? row : null, null); if (!ent || ent.resist !== true) return null;
    var lines = Array.isArray(ent.answers) ? ent.answers.slice() : [], own = lines.length; if (ent.thru === true && !noTick) lines.push({ does: 'thru' });   // the tick, after the GM's own lines
    if (!lines.length) return null;
    var v = null, vOk = false, vars = function() {
        if (vOk) return v; vOk = true;
        try { v = S.makeResolver(camp.system, ch, Fc, tc || null); if (typeof v === 'function' && row && typeof row.f === 'string' && typeof row.r === 'string') v = v.row(row.f, row.r); } catch (e) { v = null; }
        if (typeof v === 'function' && typeof S.withRollCrit === 'function') v = S.withRollCrit(v, rv ? S.thenCrit(rv.vd, rv.mf) : '', rv ? S.thenMargin(rv.vd, rv.mf) : 0, !!rv && rv.big === true, rv ? rv.res : undefined);
        return v;
    };
    for (var i = 0; i < lines.length; i++) {
        var a = lines[i]; if (!a || typeof a !== 'object') continue;
        if (a.if) { var vv = vars(); if (typeof vv !== 'function' || !S.rollNeedsOk({ needs: a.if }, vv, Fc)) continue; }   // a condition that cannot be worked out does not hold
        var out = { line: a, at: i < own ? i : -1, row: row && typeof row.f === 'string' && typeof row.r === 'string' ? { f: row.f, r: row.r } : null };
        if (a.does === 'send') {   // 1.6.3 (defense fold 4): How far, the modifier and Its margin, worked out once, now, as How many hits is; one that cannot be worked out, or rolls dice, stops the attack (sBad) and the GM is told
            var vs = vars(), evS = function(t) { var q = null; try { q = typeof vs === 'function' ? Fc.evaluate(t, { vars: vs, random: function() { throw new Error('no dice'); } }) : null; } catch (e) { q = null; } return q && q.ok && typeof q.value === 'number' && isFinite(q.value) ? q.value : null; };
            if (typeof a.far === 'string' && a.far) { var fS = evS(a.far); if (fS === null) out.sBad = true; else out.far = Math.max(0, Math.min(1e6, fS)); }
            if (!a.noRoll && typeof a.mod === 'string' && a.mod) { var mS = evS(a.mod); if (mS === null) out.sBad = true; else out.mod = Math.max(-999, Math.min(999, Math.round(mS))); }
            if (a.noRoll === true && typeof a.margin === 'string' && a.margin) { var gS = evS(a.margin); if (gS === null) out.sBad = true; else out.margin = Math.max(-999, Math.min(999, Math.round(gS))); }
        }
        if (a.does === 'hits') { var vh = vars(), q = null; try { q = typeof vh === 'function' ? Fc.evaluate(a.hits, { vars: vh, random: function() { throw new Error('no dice'); } }) : null; } catch (e) { q = null; } var qOk = !!(q && q.ok && typeof q.value === 'number' && isFinite(q.value)); out.n = qOk ? Math.max(0, Math.min(999, Math.floor(q.value))) : 0; if (!qOk) out.nBad = true; }   // nBad (the review of fold 3, finding 1): How many hits could not be worked out, or rolls dice. It is never read as 0: the attack is stopped whole, the default of a success, and the GM is told (ansBadSay)
        if (window.wpStepLog) window.wpStepLog('attempt v1', 'line', { at: out.at, does: a.does });
        return out;
    }
    return null;
}
// Both roll paths ask this once: the line a defense's success is judged by, or undefined where the roll answered no attack's attempt or did not succeed
function ansFrom(camp, rec, act, row, ch, tc, D, res, rule, mf, big) {
    if (!rec || !(rec.atk === 1 || typeof rec.lw === 'string') || !ch || !D) return undefined;
    var vd = D.verdictOf(res, rule), mfH = mf !== null && mf !== undefined && D.naturalOf(res) >= mf; if (mfH || !vd || vd.kind !== 'check' || vd.pass !== true) return undefined;
    return ansPick(camp, rec, act, row, ch, tc, { vd: vd, mf: mfH, res: res, big: big === true }, !!rec.area && typeof rec.lw !== 'string');
}
// What a landing or a line's hit keeps of the line: { does, share?, n?, type?, all? }, the effect alone (its condition was judged already)
function ansEff(pick) {
    var a = pick && pick.line; if (!a) return null; var e = { does: a.does };
    if (a.does === 'share' && typeof a.share === 'string') e.share = a.share; if (a.does === 'share' && a.dice === 'share') e.dice = 'share'; if (a.does === 'hits') e.n = typeof pick.n === 'number' ? pick.n : 0;   // dice (Fulllion's ruling of 2026-11-18): Dice counted per die, The same share of the dice
    if (typeof a.type === 'string' && a.type) { e.type = a.type; if (a.all === true) e.all = true; }
    return e;
}
// ... read back as data from a fight's save (landRead): null where it does not read
function ansClean(e) {
    if (!e || typeof e !== 'object' || Array.isArray(e) || ['thru', 'share', 'hits'].indexOf(e.does) < 0) return null; var o = { does: e.does };
    if (e.does === 'share') { if (typeof e.share !== 'string' || !e.share || e.share.length > 10000) return null; o.share = e.share; if (e.dice === 'share') o.dice = 'share'; }
    if (e.does === 'hits') o.n = typeof e.n === 'number' && isFinite(e.n) ? Math.max(0, Math.min(999, Math.floor(e.n))) : 0;
    if (typeof e.type === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,23}$/.test(e.type)) { o.type = e.type; if (e.all === true) o.all = true; }
    return o;
}
// The damage roll of a landing was made (both roll paths): what its defense let through goes on the GM's own copy, and the copy is marked as a landing's, so the
// Take damage window reads the parrying row from the record alone (never net.thruOf, which is the defender's and may be another blow's)
function ansStampLand(camp, rec, res, lnd) { if (!rec || rec.dmg !== 1 || !lnd) return; rec.landed = 1; if (lnd.ans) ansStamp(camp, rec, res, lnd.ans); }
// What the line comes to on this very roll, on the GM's copy as rec.ans: { say: its words, amt and p (each part's share, by slot) and hits (each later hit's)
// for Lets some through, keep (how many hits land) for Stops a number of hits, type and all for a type }. dice.js lays it on what Apply hands the window
function ansStamp(camp, rec, res, eff) {
    var S = SC(), Fc = window.wpFormula, sys = camp && camp.system; if (!S || !sys || !rec || rec.dmg !== 1 || !eff || typeof eff !== 'object') return;
    var out = {}, say = [], more = Array.isArray(rec.more) ? rec.more : [], H = 1 + more.length, first = res && typeof res.value === 'number' && isFinite(res.value) ? Math.max(0, Math.floor(res.value)) : 0;
    var types = sys.combat && sys.combat.damage && Array.isArray(sys.combat.damage.types) ? sys.combat.damage.types : [], tyD = typeof eff.type === 'string' ? types.filter(function(y) { return y && typeof y.key === 'string' && y.key.toLowerCase() === eff.type.toLowerCase(); })[0] : null;
    if (eff.does === 'share' && typeof eff.share === 'string' && typeof S.ansShare === 'function') {
        var tot = 0, got = 0, odd = false, cut = function(amt, ty, kd) { var a = typeof amt === 'number' && isFinite(amt) ? Math.max(0, Math.floor(amt)) : 0, v = S.ansShare(sys, eff.share, a, ty, kd, Fc); if (v === null) { odd = true; v = a; } tot += a; got += v; return v; };
        var partsOf = function(h) { var p = {}, any = false; [2, 3, 4, 5].forEach(function(k) { var pk = h['dmg' + k]; if (pk && typeof pk === 'object' && typeof pk.t === 'number') { p[k] = cut(pk.t, pk.dtype, pk.dkind); any = true; } }); return any ? p : null; };
        out.amt = cut(first, rec.dtype, rec.dkind); var p0 = partsOf(rec); if (p0) out.p = p0;
        if (more.length) out.hits = more.map(function(h) { var o = { amt: cut(h && h.t, h && h.dtype, h && h.dkind) }, ph = h ? partsOf(h) : null; if (ph) o.p = ph; return o; });
        say.push('The defense let ' + got + ' of ' + tot + ' through.'); if (odd) say.push('How much gets through could not be worked out for some of it, so that came through whole.');
        if (eff.dice === 'share') { out.dc = 1; say.push('What is counted per die counts the same share of its dice.'); }   // 1.6.3 (Fulllion's ruling of 2026-11-18): dc, so dice.js ansOn cuts the dice each part hands the damage step by the same fraction as its damage
    }
    if (eff.does === 'hits' && typeof eff.n === 'number' && eff.n >= 0) { out.keep = Math.max(0, H - Math.floor(eff.n)); say.push(out.keep === 0 ? 'The defense stopped every hit.' : out.keep === H ? (H === 1 ? 'The defense stopped no hit.' : 'The defense stopped none of the ' + H + ' hits.') : 'The defense stopped ' + (H - out.keep) + ' of ' + H + ' hits.'); }   // the review of fold 3 (finding 1): How many hits that comes to 0 stops none, as its line says, and says so
    if (tyD) { out.type = tyD.key; if (eff.all === true) out.all = true; say.push((eff.all === true ? 'Every part lands as ' : 'It lands as ') + String(tyD.label || tyD.key).slice(0, 60) + '.'); }
    if (!say.length) return;
    out.say = say; rec.ans = out;
    if (window.wpStepLog) window.wpStepLog('attempt v1', 'stamped', { does: eff.does, hits: H });
}
// 1.6.3 (the review of defense fold 3, finding 11): how many hits the attack's damage will roll, worked out now on the attacker (ch) as the host holds them,
// with the attacking row (row: { f, r }, for a list's damage roll) and the values and range kept at the attack (vals, range), as roll-req and net.diceRoll will
// work it out (systemcore hitCount). null where it cannot be told, which leaves the attack to land and the count to be read as its damage is rolled
function ansHitsNow(camp, ch, row, ent, vals, range) {
    var S = SC(), Fc = window.wpFormula; if (!S || !Fc || !camp || !camp.system || !ch || !ent || typeof S.hitCount !== 'function') return null;
    try {
        var c = vals && typeof vals === 'object' ? Object.assign({}, ch, { values: vals }) : ch, tc = range && typeof S.withRange === 'function' ? S.withRange({}, range) : null, v = S.makeResolver(camp.system, c, Fc, tc);
        if (typeof v === 'function' && row && typeof row.f === 'string' && typeof row.r === 'string') v = typeof v.row === 'function' ? v.row(row.f, row.r) : null;
        var n = S.hitCount(ent, v, Fc); return typeof n === 'number' ? n : null;
    } catch (e) { return null; }
}
// The review of defense fold 3 (finding 1): How many hits could not be worked out, so the defense stopped the whole attack, the default of a success. The GM
// is told by the defender's name (who), since the line said a number and the table sees no damage
function ansBadSay(who) {
    var words = String(who || 'A character').slice(0, 60) + '’s defense could not work out how many hits it stops, so it stopped the whole attack.';
    if (typeof logEvent === 'function') logEvent('table', words); if (typeof toast === 'function') toast(words); if (window.wpStepLog) window.wpStepLog('attempt v1', 'hits unread', {});
    return words;
}
// The review of defense fold 3 (finding 2): a line that lets some through, stops a number of hits or names a type, answering an attack that has no landing
// record and no line's hit (its damage is applied by hand, so nothing carries the line to it): the GM is told what the line says, by the defender's name
// (ch). A line that takes it on the parrying row is said by thruNote, its type here, and a stop needs no word. The words name nothing a GM does not see
function ansNote(camp, ch, pick) {
    var a = pick && pick.line; if (a && ch && a.does === 'send') return typeof sendOnNone === 'function' ? sendOnNone(ch.name, 'none') : '';   // 1.6.3 (defense fold 4)
    if (!a || !ch || !(a.does === 'share' || a.does === 'hits' || (a.does === 'thru' && a.type))) return '';
    var nm = String(ch.name || 'A character').slice(0, 60); if (a.does === 'hits' && pick.nBad === true) return ansBadSay(nm);
    var S = SC(), Fc = window.wpFormula, sys = camp && camp.system, parts = [];
    if (a.does === 'share') { var w = S && typeof S.ansShareWord === 'function' ? S.ansShareWord(sys, a.share, Fc) : ''; parts.push(w === 'half' ? 'half of it gets through' : w === 'none' ? 'none of it gets through' : w === 'all' ? 'all of it gets through' : 'only part of it gets through, as its line says'); if (a.dice === 'share') parts.push('what is counted per die counts the same share of its dice'); }
    if (a.does === 'hits') { var n = typeof pick.n === 'number' ? pick.n : 0; parts.push(n === 0 ? 'it stops no hit' : 'it stops ' + n + (n === 1 ? ' hit' : ' hits') + ' and the rest land'); }
    if (typeof a.type === 'string' && a.type) { var types = sys && sys.combat && sys.combat.damage && Array.isArray(sys.combat.damage.types) ? sys.combat.damage.types : [], ty = types.filter(function(y) { return y && typeof y.key === 'string' && y.key.toLowerCase() === a.type.toLowerCase(); })[0]; if (ty) parts.push((a.all === true ? 'every part lands as ' : 'it lands as ') + String(ty.label || ty.key).slice(0, 60)); }
    if (!parts.length) return '';
    var words = nm + '’s defense: ' + parts.join(', ') + '. Apply its damage from Take damage as that says.';
    if (typeof logEvent === 'function') logEvent('table', words); if (typeof toast === 'function') toast(words); if (window.wpStepLog) window.wpStepLog('attempt v1', 'line by hand', { does: a.does, type: !!a.type });
    return words;
}
// How a weapon test a line calls for is made: the Combat tab's combat.testBy, 'card' (absent: a card the weapon's owner presses), 'now' or 'both'
function testRule(camp) { var c = camp && camp.system && camp.system.combat; return c && (c.testBy === 'now' || c.testBy === 'both') ? c.testBy : 'card'; }
// The tests a line calls for, as its defense succeeds: test on the parrying row (row), testAtk on the attacking row (the attempt's atkRow, or a landing's row),
// each only where that row is a row of the roll's list. by: the defense's name, which its card says called for it
function ansTests(camp, rec, pick, ch, priv, act, row) {
    var a = pick && pick.line, S = SC(); if (!a || !S || (!a.test && !a.testAtk)) return;
    var by = typeof callName === 'function' ? callName(cardEnt(camp, act, row && typeof row.i === 'number' ? row : null, null)) : '', how = testRule(camp);
    // 1.6.3 (found in a live two-peer check): the test's card says it was called for by the defense AND the row it was made with, "Parry with Sword", as the
    // defense card's button said, where that row may be named (withLabel). The attacker's card names it only where the defense itself was not kept the GM's
    var byW = by && pick.row && typeof withLabel === 'function' ? withLabel(camp, ch, pick.row, by) : by;
    if (a.test && pick.row) ansTest(camp, a.test, ch, pick.row, !!priv, how, byW);
    if (a.testAtk) {
        var lnd = typeof rec.lw === 'string' && typeof landOf === 'function' ? landOf(rec.lw) : null, byId = lnd ? lnd.by : rec.atkBy || rec.callFrom, aRow = lnd && lnd.row ? lnd.row : rec.atkRow || rec.callRow;
        var aCh = typeof byId === 'string' && camp.chars && own(camp.chars, byId) ? camp.chars[byId] : null;
        if (aCh && aRow) ansTest(camp, a.testAtk, aCh, aRow, lnd ? lnd.priv === true : rec.atkPriv === true || rec.callPriv === true, how, priv ? by : byW);
    }
}
function ansTest(camp, ref, ch, row, priv, how, by) {
    var S = SC(), lr = S && typeof S.listRollRef === 'function' ? S.listRollRef(ref) : null; if (!lr || !ch || !row || row.f !== lr.f || typeof row.r !== 'string') return false;
    var ok = how === 'now' ? testRollNow(camp, lr, ch, row, priv) : typeof callPost === 'function' ? callPost(camp, ref, ch, by, priv, row, false, undefined, how === 'both') : false;
    if (window.wpStepLog) window.wpStepLog('attempt v1', 'weapon test', { how: how, made: ok === true });
    return ok;
}
// A weapon test rolled here, on the host, as the row's owner, through net.diceRoll on that row (the roll by its place on the GM's own list), while its needs
// hold on that row. true where it was rolled
function testRollNow(camp, lr, ch, row, priv) {
    var S = SC(), Fc = window.wpFormula, f = null; if (!S || !Fc || !camp || !camp.system || typeof net.diceRoll !== 'function') return false;
    (Array.isArray(camp.system.fields) ? camp.system.fields : []).forEach(function(x) { if (x && x.id === lr.f && x.kind === 'item-list' && x.list && Array.isArray(x.list.rolls)) f = x; });
    var e = f ? f.list.rolls[lr.i] : null; if (!e || typeof e.formula !== 'string' || !e.formula || Array.isArray(e.apply)) return false;
    if (!(ch.values && Array.isArray(ch.values[f.id]) && ch.values[f.id].some(function(x) { return S.rowIdOf(x) === row.r; }))) return false;
    if (e.needs || e.needsWhy) { var cv = null; try { cv = S.makeResolver(camp.system, ch, Fc, null); cv = typeof cv === 'function' ? cv.row(f.id, row.r) : null; } catch (er) { cv = null; } if (typeof cv !== 'function' || !S.rollNeedsOk(e, cv, Fc)) return false; }
    var o = { charId: ch.id, row: { f: f.id, r: row.r, i: lr.i }, label: String(e.label || 'Roll').split('{')[0].trim().slice(0, 60) || 'Roll', called: true }; if (priv) o.priv = true;   // called (the review of fold 3, finding 5): the host's own word that this is no press its owner chose, so net.diceRoll spends nothing of theirs on a counting clock, says nothing of acting off its turn and holds it for no help or card action
    var r = net.diceRoll(e.formula, o); return !(r && r.error);
}
// The GM's Roll it now on their copy of a weapon test's card under Both: rolled here as the row's owner; the card's own record is let go and every copy of the
// card says it was rolled, so the owner's press then finds nothing
net.testNow = function(att) {
    if (net.active && net.role !== 'host') return false;
    var a = typeof attemptRec === 'function' ? attemptRec(att) : null, camp = getActiveCampaign(), t = a && a.tst, S = SC();
    var ch = t && camp && camp.chars && own(camp.chars, a.charId) ? camp.chars[a.charId] : null;
    if (!t || !ch || a.busy || !S) { if (typeof toast === 'function') toast(typeof ATT_GONE === 'string' ? ATT_GONE : 'That card is not there now.'); return false; }
    if (!testRollNow(camp, { f: t.f, i: t.i }, ch, { f: t.f, r: t.r }, t.priv === true)) { if (typeof toast === 'function') toast('That test cannot be rolled now: its row or its roll is gone, or what it needs does not hold.'); return false; }
    attemptDrop(att); if (typeof net.dueOver === 'function') net.dueOver(att, 'rolled'); if (window.wpStepLog) window.wpStepLog('attempt v1', 'weapon test', { how: 'gm now' });
    return true;
};
// [netcheck:ansline-end]
// [split:body-end]
return { AREA_AIM: AREA_AIM, ATT_GONE: ATT_GONE, WITH_GONE: WITH_GONE, WITH_ONLY: WITH_ONLY, ansFrom: ansFrom, ansStamp: ansStamp, ansStampLand: ansStampLand, areaAfter: areaAfter, areaAnswered: areaAnswered, areaEntry: areaEntry, attGoneWords: attGoneWords, attSoftGone: attSoftGone, attemptCalled: attemptCalled, attemptDrop: attemptDrop, attemptEntry: attemptEntry, attemptForget: attemptForget, attemptMake: attemptMake, attemptPeek: attemptPeek, attemptRec: attemptRec, blowCrip: blowCrip, blowCripWrite: blowCripWrite, bodyAim: bodyAim, bodyLand: bodyLand, bodySwitch: bodySwitch, bodyView: bodyView, callEntry: callEntry, callLandCtx: callLandCtx, callPost: callPost, callsAfter: callsAfter, landAfter: landAfter, landClose: landClose, landCtx: landCtx, landDone: landDone, landFightOver: landFightOver, landForget: landForget, landOf: landOf, landRosterMoved: landRosterMoved, landRowNow: landRowNow, landVals: landVals, landsBack: landsBack, landsKeep: landsKeep, landsKnow: landsKnow, sceneKeep: sceneKeep, sendOnOffer: sendOnOffer, sendOnPress: sendOnPress, withLabel: withLabel };   // [split:glue]
}   // [split:glue]

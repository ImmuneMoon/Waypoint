/* netfight.js: a part of net.js (docs/REFACTOR_SPLIT_PLAN.md, area 9, fog and fights on the host; split 2026-11-19 with no change in behavior).
   What it holds: the fights on the host. Who holds whom (combat.holds: holdPut, holdsBar, holdsSqueeze, holdsRolled, holdsMoved,
   net.holdSet), a sheet given its own copy in a fight (net.charSplitFight), a player's initiative put into a fight (initIntoFight), a
   new round's initiative and sides (combatNewRound, deckOrder), the fights by their own ids (fightIds, fightsOn, fightOfTok, the one
   judge orderOfIn behind net.orderOf, the API by id from fightSet to fightPlay, with a hold and Next is chosen), each fight's own time
   and the clock that follows the one furthest behind (fightTime, fightTurned, fightEndTime, ordersMoved), the pointers (cleanTargets,
   net.setTarget, net.setTargetAs, net.aimsOf), an item used on an adjacent character (allyOn, allyWrite, allyCard), the range to a
   roller's target and who may see it (rangeTo, rangeReadBy, rangeUnseen, net.tokUnseen), a called shot's location (targetHitIn,
   targetHitAsk, net.hitRows) and where a hit behind cover lands (coverHitIn). The state handleMessage and fightsBack set too (_fightN,
   the three limiters of a player's hit-ask, deck-do and declare, and _hitAsk) stands in net.js just above this part, and the body sets
   it through fightNSet and hitAskSet; the combats' own messages (combatsTo, the combats slice), the fight's end (combatOver), a turn's
   start and end, the fight kept in the save (fightsave) and every branch of handleMessage stay in net.js.
   Why it looks this way: these lines stood in net.js, and they still run exactly where they stood. net.js calls netFight() at its line
   `// [split:netfight.js]`, so the body below runs in the old order, after everything above that line and before everything below it.
   The body keeps its lines at the left margin inside the install function, unchanged, so that every test that reads net.js (through
   tools/srcjoin.js, which puts these lines back) sees the old file. The first lines import what the body uses of net.js (live, so a
   value net.js changes later is read as it is then); the last line hands back the names net.js uses of it. Neither side may assign
   the other's names (tools/splitcheck.js holds it). Change the code here as if it still stood in net.js. Like net.js, this file is
   kept byte for byte by git (.gitattributes), with its CRLF line endings. */
// [split:of net.js]
import { HELD_WORDS, SC, _fightN, _hitAsk, applyLines, attemptCalled, attemptDrop, attemptRec, bellOut, broadcast, broadcastCombats, broadcastTargets, callPost, cleanFightBody, clockCycle, clockRule, clockStart, clockStep, combatOver, combatRefresh, combatRefreshTurn, combatSeen, combatsFor, declareReveal, diceFrom, figApply, fightNSet, fightNum, fightReachKept, fightsKeep, fightsKeepSoon, fightsRead, fogDrop, fogLanded, fxCombatEdge, fxEnded, fxLib, getActiveCampaign, getProfile, hitAskSet, itemLib, logEvent, mapFogged, mapTitleOf, marksStart, moveMode, net, noteOwner, own, playerHue, postApply, recLine, render, roundChanged, save, saveRemoteSoon, sendFailed, seqIdx, seqMake, seqMoved, seqPlace, seqStep, severalRule, showConfirm, snapBack, targetTok, targetsFor, toast, turnCombatOf, turnEnded, turnNote, turnStarted } from './net.js';   // [split:glue]
export function netFight() {   // [split:glue]
// [split:body-start]
// [netcheck:holds-start]
// 1.6.0 Who holds whom (combat.holds, the host's alone; systemcore cleanHolds). A fight's hl holds one record a pair of tokens, its own as rh and th are: it
// never travels (combatsFor names what it sends), a roster edit keeps it (fightReachKept), the save keeps it with the fight (fightsRead cleans it), and no
// reader of a fight needs know of it. { by, on } the holder's and the held token, { bc, oc } their characters, pin 1 where pinned, k the round it was last
// kept in, dr what the holder has dragged this turn. A player sees the effect, never a record. A turn's end is lived once (turnEnded), so a step back, a
// correction, ends nothing and asks for no keep again
var HOLDS_MAX = 32, _holdBusy = false, HOLD_WHY = Object.freeze({ free: 'Broke free', unkept: 'Not kept', lost: 'Lost the action or went down', parted: 'Moved apart', walked: 'Walked off', gone: 'Token gone', gm: 'By the GM' });
function holdsRules(camp) { var h = camp && camp.system && camp.system.combat ? camp.system.combat.holds : null; return h && typeof h === 'object' ? h : null; }
function holdsOf(c) { return c && Array.isArray(c.hl) ? c.hl : []; }
function holdLog(step, facts) { if (typeof window !== 'undefined' && window.wpStepLog) window.wpStepLog('holds v1', step, facts || {}); }
function holdTok(map, id) { return map && Array.isArray(map.whiteboard) ? map.whiteboard.find(function(w) { return !!w && w.id === id; }) || null : null; }
function holdMap(camp, c) { return c && camp && camp.items && own(camp.items, c.mapId) ? camp.items[c.mapId] : null; }
function holdsAll(pick) { var out = []; fightIds().forEach(function(fid) { var c = net.combats[fid]; holdsOf(c).forEach(function(x) { if (pick(x)) out.push({ c: c, rec: x }); }); }); return out; }
function holdTokOf(camp, mapId, charId) {   // the character's token in a fight on that map
    var map = camp && camp.items && own(camp.items, mapId) ? camp.items[mapId] : null, hit = null;
    fightsOn(mapId).forEach(function(fid) { net.combats[fid].rows.forEach(function(r) { var w = !hit && r && typeof r.tokId === 'string' ? holdTok(map, r.tokId) : null; if (w && w.charId === charId) hit = w; }); });
    return hit;
}
function holdTell(camp, id, text) { var ch = camp && camp.chars && own(camp.chars, id) ? camp.chars[id] : null; if (ch && ch.ownerId && !ch.npc && typeof noteOwner === 'function') noteOwner(ch.ownerId, text, id); }
function holdFx(camp, ch, id, on) {   // an effect on or off through the effects' own rules, written and sent as any change of a character; as asked already, nothing moves
    var S = SC(), F = window.wpFormula; if (!S || !F || !camp.system) return;
    var r = S.applyAct(camp.system, ch, { apply: [{ fx: id, on: on }] }, S.makeResolver(camp.system, ch, F, null), F, null, null, undefined, null, null, { now: Date.now(), inCombat: true, onInCombat: false });
    if (!r || !r.ok || !r.values || !Object.keys(r.values).length) { if (r && r.reason && r.reason !== 'none') holdLog('failed', { at: 'effect', reason: r.reason }); return; }
    ch.values = ch.values || {}; Object.keys(r.values).forEach(function(k) { ch.values[k] = r.values[k]; }); ch.updated = Date.now();
    if (typeof saveRemoteSoon === 'function') saveRemoteSoon(); if (net.syncCharDelta) net.syncCharDelta(ch.id, r.values);
    if (window.wpSheets && window.wpSheets.charChanged) window.wpSheets.charChanged(ch.id);
}
function holdsSync(camp, ids, by) {   // each character's effects as the records now stand: on once however many hold it, off with the last; by: those who held, for the effect a holder wears (asked apart, so a holder's own Held is left alone)
    var r = holdsRules(camp); if (!r) return; _holdBusy = true;
    try {
        ids.forEach(function(id, i) {
            var ch = camp.chars && own(camp.chars, id) ? camp.chars[id] : null; if (!ch || ids.indexOf(id) !== i) return;
            var on = holdsAll(function(x) { return x.oc === id; });
            holdFx(camp, ch, r.held, on.length > 0); if (r.pinned) holdFx(camp, ch, r.pinned, on.some(function(x) { return x.rec.pin === 1; }));
        });
        if (r.holder) (Array.isArray(by) ? by : []).forEach(function(id, i) { var ch = camp.chars && own(camp.chars, id) ? camp.chars[id] : null; if (ch && by.indexOf(id) === i) holdFx(camp, ch, r.holder, holdsAll(function(x) { return x.bc === id; }).length > 0); });
    } finally { _holdBusy = false; }
}
function holdEnd(camp, c, recs, why) {   // those records gone, the effects with them, and each side told in words that name nobody
    var left = holdsOf(c).filter(function(x) { return recs.indexOf(x) < 0; }); if (left.length) c.hl = left; else delete c.hl;
    holdsSync(camp, recs.map(function(x) { return x.oc; }), recs.map(function(x) { return x.bc; }));
    recs.forEach(function(x) { holdTell(camp, x.bc, 'You let go.'); holdTell(camp, x.oc, 'You are no longer held.'); if (typeof recLine === 'function') recLine('fight', (camp.chars && own(camp.chars, x.bc) ? camp.chars[x.bc].name : '') || 'Someone', 'Lets go', HOLD_WHY[why] || ''); });
    holdLog('ended', { n: recs.length, why: why }); if (typeof fightsKeepSoon === 'function') fightsKeepSoon();
}
function holdDraw(camp, map, mapId, by, on, c) {   // 1.6.2: a grab from a distance draws its target in (combat.holds.drawIn, off unless a system sets it): to a free cell beside the holder, as near the side they came from as there is one, that the holder could walk to. With none, or while someone else holds them, they stay and the GM moves the token
    var r = holdsRules(camp); if (!r || r.drawIn !== true || !map || allyNear(map, by, on, false)) return false;
    if (holdsOf(c).some(function(x) { return x.on === on.id && x.by !== by.id; })) return false;
    var w = on.w || 60, h = on.h || 52, bw = by.w || 60, bh = by.h || 52, cx = by.x + bw / 2, cy = by.y + bh / 2, gd = !!(map.meta && map.meta.gridType), d = (Math.max(bw, bh) + Math.max(w, h)) / 2 * (gd ? 0.8 : 1) + (gd ? 0 : 4);
    var at = Math.atan2(on.y + h / 2 - cy, on.x + w / 2 - cx), F = window.wpFog && typeof window.wpFog.arrivalOk === 'function' ? window.wpFog : null, spot = null;
    var taken = function(p) {   // on a grid by the cell: a hex map's boxes overlap their neighbors'
        return (map.whiteboard || []).some(function(o) {
            if (!o || o.id === on.id || !(o.isChar || o.waiting)) return false;
            var ow = o.w || 0, oh = o.h || 0;
            return gd ? Math.hypot(p.x + w / 2 - o.x - ow / 2, p.y + h / 2 - o.y - oh / 2) < 0.7 * Math.min(w, h) : p.x < o.x + ow && p.x + w > o.x && p.y < o.y + oh && p.y + h > o.y;
        });
    };
    var walks = function(p) { if (!F) return true; try { return F.arrivalOk(map, on, cx - w / 2, cy - h / 2, p.x, p.y) !== false; } catch (e) { return true; } };   // the one judge of walls, barriers and the play area
    for (var k = 0; k < 12 && !spot; k++) {   // 0, then 30 degrees either way, on round to behind the holder
        var ang = at + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * Math.PI / 6, t = Object.assign({}, on, { x: cx + Math.cos(ang) * d - w / 2, y: cy + Math.sin(ang) * d - h / 2 });
        if (window.wpSeatCell) window.wpSeatCell(t, map);
        if (!taken(t) && allyNear(map, by, t, false) && walks(t)) spot = { x: t.x, y: t.y };
    }
    if (!spot) return false;
    var was = { x: on.x, y: on.y };
    snapBack(camp, map, on, { campId: camp.id, itemId: mapId, wbId: on.id }, spot, null);
    holdsMoved(camp, map, mapId, on, was);   // those they hold themselves come along or are let go, as when they walk
    holdLog('drawn', {}); if (typeof save === 'function') save(true);
    return true;
}
function holdPut(camp, mapId, by, onId, pin) {   // a hold of the token by on the token onId, or pinned; words where there can be none
    var fid = by ? fightOfTok(mapId, by.id) : null, c = fid ? net.combats[fid] : null, map = holdMap(camp, c), on = holdTok(map, onId);
    if (!c || !on || fightOfTok(mapId, onId) !== fid) return 'Both must be in the same fight.';
    if (!on.isChar || !by.isChar || typeof on.charId !== 'string' || typeof by.charId !== 'string' || on.charId === by.charId || !own(camp.chars, on.charId) || !own(camp.chars, by.charId)) return 'Only characters hold one another.';
    var had = holdsOf(c).filter(function(x) { return x.by === by.id && x.on === onId; })[0];
    if (!had) { if (pin) return 'Hold them first.'; if (holdsOf(c).length >= HOLDS_MAX) return 'That fight holds as many holds as it may.'; c.hl = holdsOf(c).concat([{ by: by.id, on: onId, bc: by.charId, oc: on.charId, k: c.round }]); holdTell(camp, on.charId, holdDraw(camp, map, mapId, by, on, c) ? 'You are held, and drawn in.' : 'You are held.'); }
    else if (pin) { had.pin = 1; had.k = c.round; holdTell(camp, on.charId, 'You are pinned.'); }
    holdsSync(camp, [on.charId], [by.charId]); holdLog(pin ? 'pinned' : 'taken', { n: holdsOf(c).length }); if (typeof fightsKeepSoon === 'function') fightsKeepSoon();
    return '';
}
function holdsBar(camp, ch, ref) {   // why a roll named by combat.holds cannot be made now: words, or ''
    var r = holdsRules(camp); if (!r || !ch || typeof ref !== 'string' || !ref) return '';
    if ((ref === r.squeeze || ref === r.keep) && !holdsAll(function(x) { return x.bc === ch.id; }).length) return 'You hold nobody.';
    if (ref === r.free && !holdsAll(function(x) { return x.oc === ch.id; }).length) return 'Nobody holds you.';
    return '';
}
// a squeeze: its roll's card lands on the first held character and a copy of it on each of the rest, with no attack and no resist. The copies, to post as the roll is
function holdsSqueeze(camp, ch, ref, rec, D) {
    var r = holdsRules(camp); if (!r || !ch || !ref || ref !== r.squeeze || !rec || rec.dmg !== 1) return null;
    var base = typeof rec.label === 'string' && rec.label ? rec.label : 'Squeeze', out = [], first = true;
    holdsAll(function(x) { return x.bc === ch.id; }).forEach(function(y) {
        var oc = camp.chars && own(camp.chars, y.rec.oc) ? camp.chars[y.rec.oc] : null, map = holdMap(camp, y.c), tk = holdTok(map, y.rec.on); if (!oc) return;
        var said = (base + ': ' + String((tk && !tk.hidden && (tk.charName || tk.name)) || 'someone')).slice(0, 60);
        if (first) { rec.dmgOn = oc.id; rec.label = said; first = false; return; }
        var o = Object.assign({}, rec, { id: D.uid(), dmgOn: oc.id, label: said }); delete o.rid; out.push(o);
    });
    return out;
}
// what a roll or an action named by combat.holds did, once it has landed. pass: its verdict, null for one that tests nothing; tc: its token context; was: the
// attempt it resisted; made: the attempt it made
function holdRefQ(camp, q, act) {   // what a player's press names, as a hold names it. Their view drops a roll that reads a GM-only value, so a list's roll may stand lower there than on the GM's list, which is where a hold counts it
    var S = SC(), ref = S && typeof S.holdRefOf === 'function' ? S.holdRefOf(q.act, q.row) : ''; if (!ref || !act || !q.row) return ref;
    var fs = camp && camp.system && Array.isArray(camp.system.fields) ? camp.system.fields : [], f = fs.filter(function(x) { return x && x.id === q.row.f && x.kind === 'item-list' && x.list && Array.isArray(x.list.rolls); })[0];
    if (f) for (var i = q.row.i; i < f.list.rolls.length; i++) { var r = f.list.rolls[i]; if (r && r.label === act.label && (r.formula || '') === (act.formula || '')) return q.row.f + '#' + i; }
    return ref;
}
function rowOnGm(S, camp, view, row) {   // a player's press names a list's roll by its place in their view: the same roll by its place on the GM's list, which is where the host's own judges count it (systemcore rollPlace). A roll that is not found stays as it came
    if (!row || typeof row.i !== 'number' || !view || !S || typeof S.rollPlace !== 'function') return row;
    var i = S.rollPlace(view, camp && camp.system, row.f, row.i); return i < 0 || i === row.i ? row : Object.assign({}, row, { i: i });
}
function holdLand(camp, ht) { var pw = holdPut(camp, ht.m, holdTokOf(camp, ht.m, ht.c), ht.on, ht.pin); if (pw) holdTell(camp, ht.c, pw); else if (typeof holdsWatch === 'function') holdsWatch(ht.c); return pw; }   // a hold taken while All holds end where is true ends at once: nothing else would ask until the character next changed
// a hold waits for a player's roll, which may never come: the GM's card, Apply now, lands it without one (the owner, 2026-11-01, by prompt: "Apply now on the card (Recommended)")
function holdAsk(camp, att, rec, ent, ht) {
    var tc = rec && camp && camp.chars && own(camp.chars, rec.charId) ? camp.chars[rec.charId] : null; if (!tc || tc.npc || !tc.ownerId || typeof net.postBlastDue !== 'function') return;
    if (ht.pin) { var hb = holdTokOf(camp, ht.m, ht.c); if (!hb || !holdsAll(function(x) { return x.by === hb.id && x.on === ht.on; }).length) return; }   // a pin with nobody held has nothing to land
    rec.htAtt = att;
    var w = holdTok(camp.items && own(camp.items, ht.m) ? camp.items[ht.m] : null, ht.on), nm = String((ent && ent.label) || 'A hold').split('{')[0].trim() + ' on ' + ((w && (w.charName || w.name)) || tc.name || 'them');
    net.postBlastDue(tc, att, nm, false, 'hold');
}
// 1.6.2 (the core's gap 214): a thing in flight whose arrival roll its target may resist waits for that roll, as a grab does: kept on the attempt (fw),
// landed by attemptCalled where the target fails, avoided where it resists. A player's target gets the GM a card whose Apply now lands it, since that roll may never come
net.flyWait = function(att, fw) {
    var rec = typeof attemptRec === 'function' ? attemptRec(att) : null, camp = getActiveCampaign(); if (net.role === 'client' || !rec || !camp || !fw) return false;
    rec.fw = fw; var tc = camp.chars && own(camp.chars, rec.charId) ? camp.chars[rec.charId] : null;
    if (tc && !tc.npc && tc.ownerId && typeof net.postBlastDue === 'function') { rec.htAtt = att; net.postBlastDue(tc, att, String(fw.name || 'It').slice(0, 50) + ' on ' + (tc.name || 'them'), false, 'hold'); }
    return true;
};
net.holdGo = function(att) {
    var rec = typeof attemptRec === 'function' ? attemptRec(att) : null, camp = getActiveCampaign(); if (net.role === 'client' || !camp) return false;
    if (rec && !rec.ht && rec.fw) { var fwG = rec.fw; rec.fw = null; if (typeof window.wpFlyLand === 'function') window.wpFlyLand(fwG, false); if (typeof net.dueOver === 'function') net.dueOver(att); if (typeof attemptDrop === 'function') attemptDrop(att); return true; }   // 1.6.2 (the core's gap 214): Apply now on a thing in flight's card lands it
    if (!rec || !rec.ht) { if (typeof toast === 'function') toast('Their roll is in already, so there is nothing to apply.'); return false; }
    var pw = holdLand(camp, rec.ht); if (pw) { if (typeof toast === 'function') toast(pw); return false; }
    if (typeof net.dueOver === 'function') net.dueOver(att); if (typeof attemptDrop === 'function') attemptDrop(att); holdLog('applied-now', {}); return true;
};
function holdsRolled(camp, ch, ent, ref, pass, tc, was, made) {
    var r = holdsRules(camp); if (!r || !ch) return;
    if (was && was.hf && pass === false) { var cW = orderById(was.hf.f), goneW = holdsOf(cW).filter(function(x) { return x.by === was.hf.by && x.on === was.hf.on; }); if (goneW.length) holdEnd(camp, cW, goneW, 'free'); }   // the holder failed to resist: free
    if (was && was.ht && pass === false) holdLand(camp, was.ht);   // the target failed to resist: held
    if (was && was.ht && was.htAtt && typeof net.dueRolled === 'function') net.dueRolled(was.htAtt);   // their roll is in: the GM's Apply now has nothing left to do
    if (typeof ref !== 'string' || !ref) return;
    var rng = tc && tc.range && typeof tc.range.tid === 'string' && typeof tc.range.mapId === 'string' ? tc.range : null, ok = pass !== false;
    if ((ref === r.take || ref === r.pin) && ok && rng) { var htW = { m: rng.mapId, c: ch.id, on: rng.tid, pin: ref === r.pin && ref !== r.take }, arW = typeof made === 'string' && made && typeof attemptRec === 'function' ? attemptRec(made) : null; if (arW) { arW.ht = htW; holdAsk(camp, made, arW, ent, htW); } else holdLand(camp, htW); }   // its target resists: the hold waits for that roll, as a break free does
    var mine = holdsAll(function(x) { return x.bc === ch.id; });
    if (mine.length && ((ref === r.keep && ok) || ref === r.squeeze || (rng && Array.isArray(r.also) && r.also.indexOf(ref) >= 0 && mine.some(function(x) { return x.rec.on === rng.tid; })))) { mine.forEach(function(x) { x.rec.k = x.c.round; }); holdLog('kept', { n: mine.length }); if (typeof fightsKeepSoon === 'function') fightsKeepSoon(); }
    if (ref !== r.free || !ok) return;
    var onMe = holdsAll(function(x) { return x.oc === ch.id; }), hit = rng ? onMe.filter(function(x) { return x.rec.by === rng.tid; }) : [], one = hit[0] || (onMe.length === 1 ? onMe[0] : null);
    if (!one) { if (onMe.length) holdTell(camp, ch.id, 'Point at the one you break free from.'); return; }
    if (typeof made === 'string' && made) { var ar = typeof attemptRec === 'function' ? attemptRec(made) : null; if (ar) ar.hf = { f: one.c.id, by: one.rec.by, on: one.rec.on }; return; }   // its target resists: the hold waits for that roll
    if (!(ent && (ent.resisted === true || typeof ent.resistBy === 'string'))) holdEnd(camp, one.c, [one.rec], 'free');
}
function holdsPrune(camp, c) {   // a token gone from the map or the fight takes its records with it
    var l = holdsOf(c); if (!l.length) return; var map = holdMap(camp, c), inF = Object.create(null); c.rows.forEach(function(r) { if (r && typeof r.tokId === 'string') inF[r.tokId] = 1; });
    var gone = l.filter(function(x) { return inF[x.by] !== 1 || inF[x.on] !== 1 || !holdTok(map, x.by) || !holdTok(map, x.on); }); if (gone.length) holdEnd(camp, c, gone, 'gone');
}
function holdsGone(camp, c) { var l = holdsOf(c); if (!l.length) return; delete c.hl; holdsSync(camp, l.map(function(x) { return x.oc; }), l.map(function(x) { return x.bc; })); holdLog('ended', { n: l.length, why: 'fight' }); }   // the fight over: every hold in it, quietly
function holdsWatch(id) {   // a holder who has lost their action or gone down lets go of all at once, whatever moved them there
    if (_holdBusy || !fightIds().length) return;
    var camp = getActiveCampaign(), r = holdsRules(camp), S = SC(), F = window.wpFormula; if (!r || !r.ends || !S || !F || !camp.chars || !own(camp.chars, id)) return;
    var mine = holdsAll(function(x) { return x.bc === id; }); if (!mine.length) return;
    var v = null; try { v = S.makeResolver(camp.system, camp.chars[id], F, null); } catch (e) { v = null; } if (typeof v !== 'function' || !S.rollNeedsOk({ needs: r.ends }, v, F)) return;
    var byFight = Object.create(null); mine.forEach(function(x) { (byFight[x.c.id] = byFight[x.c.id] || []).push(x.rec); });
    Object.keys(byFight).forEach(function(fid) { holdEnd(camp, net.combats[fid], byFight[fid], 'lost'); });
}
function holdsTurnEnd(mapId, c, row, round) {   // the holder's turn: one keep holds them all, and with none their holds end
    var camp = getActiveCampaign(), r = holdsRules(camp); if (!r || !c) return; holdsPrune(camp, c);
    if (typeof row.tokId !== 'string') return;
    var map = holdMap(camp, c), w = holdTok(map, row.tokId); if (w && typeof w.charId === 'string') holdsWatch(w.charId);
    if (!r.keep) return;
    var gone = holdsOf(c).filter(function(x) { return x.by === row.tokId && x.k !== round; }); if (gone.length) holdEnd(camp, c, gone, 'unkept');
}
// the word that stops a held token's own move, or '': a pinned token has no move, and a held one may not leave whoever holds it
function holdMoveWhy(camp, map, mapId, w, fx, fy, tx, ty) {
    if (!holdsRules(camp) || !w || !turnCombatOf(camp, mapId, w)) return '';
    var c = turnCombatOf(camp, mapId, w), recs = holdsOf(c).filter(function(x) { return x.on === w.id; }); if (!recs.length) return '';
    var sys = camp.system, dg = sys.combat && sys.combat.turn ? sys.combat.turn.diag : '', d = window.wpFog && window.wpFog.moveCells ? window.wpFog.moveCells(map, w, fx, fy, tx, ty, dg, {}) : 0; if (!(d > 0)) return '';
    if (recs.some(function(x) { return x.pin === 1; })) return 'You are pinned: your token goes back.';
    var at = Object.assign({}, w, { x: tx, y: ty });
    return recs.some(function(x) { var b = holdTok(map, x.by); return b && !allyNear(map, b, at, false); }) ? 'You are held: your token goes back.' : '';
}
function holdMoveCheck(camp, map, w, frW, msg, conn) {   // through the fight's move mode, as the move limit
    var why = holdMoveWhy(camp, map, msg.itemId, w, frW.x, frW.y, msg.x, msg.y); if (!why) return '';
    var mm = moveMode(camp, 'move'); if (mm === 'off') return '';
    if (mm === 'refuse') { if (!msg.final) return 'stop'; snapBack(camp, map, w, msg, frW, conn); turnNote(conn, why, w.charId); return 'stop'; }
    if (msg.final) { turnNote(conn, 'You moved while held.', w.charId); toast((w.charName || 'A token') + ' moved while held.'); if (typeof bellOut === 'function') bellOut(w.charId, { title: 'Turn', text: 'Moved while held.' }); }
    return '';
}
// a token that has moved, by any hand: a held one that left its holder is free, a holder drags what it holds within its drag, and one that walks further lets go
function holdsMoved(camp, map, mapId, w, from) {
    var r = holdsRules(camp), fid = r && w && from ? fightOfTok(mapId, w.id) : null, c = fid ? net.combats[fid] : null; if (!holdsOf(c).length) return;
    var dx = w.x - from.x, dy = w.y - from.y; if (!dx && !dy) return;
    var left = holdsOf(c).filter(function(x) { var b = x.on === w.id ? holdTok(map, x.by) : null; return b && !allyNear(map, b, w, false); }); if (left.length) holdEnd(camp, c, left, 'parted');
    var mine = holdsOf(c).filter(function(x) { return x.by === w.id; }); if (!mine.length) return;
    var dg = camp.system.combat && camp.system.combat.turn ? camp.system.combat.turn.diag : '', d = window.wpFog && window.wpFog.moveCells ? window.wpFog.moveCells(map, w, from.x, from.y, w.x, w.y, dg, {}) : 0, key = c.round + ':' + c.turn, used = mine[0].dr && mine[0].dr.t === key ? mine[0].dr.n : 0;
    if (typeof r.drag === 'number' && used + d <= r.drag + 0.05) {
        mine.forEach(function(x) { x.dr = { t: key, n: used + d }; var t = holdTok(map, x.on); if (t && !(window.wpFog && window.wpFog.arrivalOk && !window.wpFog.arrivalOk(map, t, t.x, t.y, t.x + dx, t.y + dy))) snapBack(camp, map, t, { campId: camp.id, itemId: mapId, wbId: t.id }, { x: t.x + dx, y: t.y + dy }, null); });   // the held token goes with its holder, for everyone, where it could walk; else the holder has left it
        if (typeof fightsKeepSoon === 'function') fightsKeepSoon();
    }
    var off = holdsOf(c).filter(function(x) { var t = x.by === w.id ? holdTok(map, x.on) : null; return t && !allyNear(map, w, t, false); }); if (off.length) holdEnd(camp, c, off, 'walked');
}
function holdsRead(list, rows) {   // a fight's holds from the save, as data: only between tokens still in its order
    var inF = Object.create(null), out = [], tok = /^[A-Za-z0-9_-]{1,80}$/, chr = /^c_[A-Za-z0-9_]{1,24}$/; rows.forEach(function(r) { if (r && typeof r.tokId === 'string') inF[r.tokId] = 1; });
    (Array.isArray(list) ? list : []).slice(0, HOLDS_MAX).forEach(function(x) { if (!x || typeof x !== 'object' || typeof x.by !== 'string' || typeof x.on !== 'string' || !tok.test(x.by) || !tok.test(x.on) || inF[x.by] !== 1 || inF[x.on] !== 1 || typeof x.bc !== 'string' || typeof x.oc !== 'string' || !chr.test(x.bc) || !chr.test(x.oc) || !fightNum(x.k)) return; var o = { by: x.by, on: x.on, bc: x.bc, oc: x.oc, k: x.k }; if (x.pin === 1) o.pin = 1; out.push(o); });
    return out;
}
net.holdsMoved = function(map, tok, from) { var camp = getActiveCampaign(); if (net.role === 'host' && map && typeof map.id === 'string' && tok && from) holdsMoved(camp, map, map.id, tok, from); };   // the GM's own drop
net.holdsPressed = function(camp, ch, ref, tc) { if (net.role === 'host') holdsRolled(camp, ch, null, ref, null, tc, null, ''); };   // the GM's own press of an action
net.holdsAt = function(mapId, byTok, tok) {   // what the GM's menu may offer on a token: null with no rule or no fight
    var camp = getActiveCampaign(); if (net.role !== 'host' || !holdsRules(camp) || !tok) return null;
    var fid = fightOfTok(mapId, tok.id), c = fid ? net.combats[fid] : null; if (!c) return null;
    var pair = byTok ? holdsOf(c).filter(function(x) { return x.by === byTok.id && x.on === tok.id; })[0] : null;
    return { can: !!byTok && !pair && fightOfTok(mapId, byTok.id) === fid, has: !!pair, pin: !!(pair && pair.pin === 1), any: holdsOf(c).filter(function(x) { return x.by === tok.id || x.on === tok.id; }).length };
};
net.holdSet = function(mapId, byTok, tok, what) {   // the GM's own hand: take, pin, free (that pair) or all (everything on or by the token)
    var camp = getActiveCampaign(); if (net.role !== 'host' || !holdsRules(camp) || !tok) return false;
    var fid = fightOfTok(mapId, tok.id), c = fid ? net.combats[fid] : null; if (!c) return false;
    if (what === 'take' || what === 'pin') { var w = holdPut(camp, mapId, byTok, tok.id, what === 'pin'); if (w && typeof toast === 'function') toast(w); return !w; }
    var gone = holdsOf(c).filter(function(x) { return what === 'all' ? x.by === tok.id || x.on === tok.id : !!byTok && x.by === byTok.id && x.on === tok.id; });
    if (gone.length) holdEnd(camp, c, gone, 'gm'); return gone.length > 0;
};
// 1.6.2, the review of backlog 237: a token given its own copy of the sheet it shared (sheets.js shareTake). Each hold record that names the token
// takes the copy's id, oc where it is held and bc where it holds, and the effects of who holds whom then stand where the records now say, on the
// original and on the copy, which came with the sheet's Held, Pinned or holder effect. Only where a record named the original before, so an effect
// the GM put on by hand stays. True where a record moved
net.holdsRetarget = function(tokId, oldId, newId) {
    var camp = getActiveCampaign(); if ((net.active && net.role === 'client') || !camp || typeof tokId !== 'string' || typeof oldId !== 'string' || typeof newId !== 'string' || !oldId || oldId === newId) return false;
    var named = holdsAll(function(x) { return x.oc === oldId || x.bc === oldId; }); if (!named.length) return false;
    var moved = 0; named.forEach(function(h) { if (h.rec.on === tokId && h.rec.oc === oldId) { h.rec.oc = newId; moved++; } if (h.rec.by === tokId && h.rec.bc === oldId) { h.rec.bc = newId; moved++; } });
    holdsSync(camp, [oldId, newId], [oldId, newId]);
    if (moved && typeof fightsKeepSoon === 'function') fightsKeepSoon();
    holdLog('split', { n: moved }); return moved > 0;
};
// [netcheck:holds-end]
// [netcheck:charsplit-start]
// 1.6.2, the review of backlog 237: a token given its own copy of a sheet while a fight runs (sheets.js shareTake). What a fight keeps of a turn by
// CHARACTER goes with the copy: the round its turn's timed effects were last counted in (turned) and its turn-end ones (fxEnded), so the copy's
// effects, which came counted, are not counted a second time in that round; and where the token's row is on turn, what its turn has spent and
// allows (turnSpent, turnMax) and a run under way, so it gets no action back. The host's own and never sent. True where anything moved
net.charSplitFight = function(oldId, newId, tokId) {
    if ((net.active && net.role === 'client') || typeof oldId !== 'string' || typeof newId !== 'string' || typeof tokId !== 'string' || !oldId || oldId === newId || !net.combats) return false;
    var moved = false, cp = function(o) { return o && typeof o === 'object' ? JSON.parse(JSON.stringify(o)) : o; };
    fightIds().forEach(function(fid) {
        var c = net.combats[fid]; if (!c) return;
        ['turned', 'fxEnded'].forEach(function(k) { if (c[k] && typeof c[k] === 'object' && own(c[k], oldId) && !own(c[k], newId)) { c[k][newId] = c[k][oldId]; moved = true; } });
        var row = Array.isArray(c.rows) ? c.rows[c.turn] : null; if (!row || row.tokId !== tokId) return;
        if (net.turnSpent && own(net.turnSpent, oldId)) { net.turnSpent[newId] = cp(net.turnSpent[oldId]); moved = true; }
        if (net.turnMax && own(net.turnMax, oldId)) { net.turnMax[newId] = cp(net.turnMax[oldId]); moved = true; }
        var mv = net.turnMove && own(net.turnMove, fid) ? net.turnMove[fid] : null; if (mv && mv.tokId === tokId && mv.charId === oldId) { mv.charId = newId; moved = true; }
    });
    if (moved && typeof fightsKeepSoon === 'function') fightsKeepSoon();
    return moved;
};
// The rows of the fights named after their tokens again, for tokens a split gave a sheet and a name of their own (whiteboard.js rowNameOf, the
// name a row takes at Start or Add), so the strip, the roster and each player's copy of the order say the name the board shows. Sent once. How many
net.fightRowsRenamed = function(tokIds) {
    var camp = getActiveCampaign(); if ((net.active && net.role === 'client') || !camp || !net.combats || !Array.isArray(tokIds) || !tokIds.length) return 0;
    var n = 0, nameOf = typeof window !== 'undefined' && typeof window.wpRowNameOf === 'function' ? window.wpRowNameOf : null;
    fightIds().forEach(function(fid) {
        var c = net.combats[fid], map = c && camp.items && own(camp.items, c.mapId) ? camp.items[c.mapId] : null; if (!c || !map || !Array.isArray(map.whiteboard) || !Array.isArray(c.rows)) return;
        c.rows.forEach(function(r) {
            if (!r || typeof r.tokId !== 'string' || tokIds.indexOf(r.tokId) < 0) return;
            var w = map.whiteboard.find(function(x) { return !!x && x.id === r.tokId; }); if (!w) return;
            var nm = nameOf ? nameOf(w, map, camp) : (w.charName || w.name || 'Unnamed'); if (typeof nm === 'string' && nm && nm !== r.name) { r.name = nm; n++; }
        });
    });
    if (!n) return 0;
    if (net.active && net.role === 'host' && typeof broadcastCombats === 'function') { try { broadcastCombats(); } catch (e) { console.error(e); } } else if (typeof fightsKeepSoon === 'function') fightsKeepSoon();
    if (typeof window !== 'undefined' && window.wpRenderCombatStrip) window.wpRenderCombatStrip();
    return n;
};
// [netcheck:charsplit-end]
function combatsOverAll() {   // the session's end: every fight ends as End ends it, quietly; how many ended. Fold 4: the furthest ahead first, so the clock stays with the one behind and those ahead keep their own time
    var n = 0, CCa = typeof timeCore === 'function' ? timeCore() : null, campA = getActiveCampaign(), idsA = fightIds();
    if (CCa) idsA = idsA.map(function(k, i) { return { k: k, i: i, a: fightAtOf(net.combats[k], campA) }; }).sort(function(x, y) { return CCa.tCmp(y.a, x.a) || (x.i - y.i); }).map(function(x) { return x.k; });
    idsA.forEach(function(fid) { if (combatOver(fid, net.combats[fid], true)) n++; });   // fold 2: each fight by its own id
    if (typeof fightsKeep === 'function') fightsKeep();   // 1.6.0: the session's end: nothing kept comes back at the next table
    return n;
}
// host: put a combat on a map (or take it off with null). Fold 2: the old name, a thin wrapper for the strip's fight on that map (fightAt): a roster
// edit or the end of that one, a new fight where the map holds none (fightSet, in the orders slice, is the one place a fight starts, changes or ends)
net.combatSet = function(mapId, combat) { var cur = fightAt(mapId); return fightSet(cur, combat ? Object.assign({}, combat, { mapId: mapId }) : null); };
// [netcheck:initfight-start]
// Initiative & turn order O1 (the owner's answer, "Into the fight, once"): a player's own roll of the system's initiative roll — the host
// rebuilt it from the entry (roll-req's act path) — sets their row's number in the combat on the map they are on, if the row has none yet
// (rolled or given by the GM), and the order re-sorts by initiative; whoever's turn it is keeps it. A second roll, a row with a number, no
// combat there, or no row of their character's token: nothing. Everyone gets the new order (never a number); the GM is told the number
function initIntoFight(camp, mapId, charId, pid, value) {
    if (net.role !== 'host' || typeof mapId !== 'string' || typeof charId !== 'string' || typeof pid !== 'string' || !pid || typeof value !== 'number' || !isFinite(value)) return false;
    var map = camp && camp.items && own(camp.items, mapId) ? camp.items[mapId] : null; if (!map || !Array.isArray(map.whiteboard)) return false;
    var mine = {}; map.whiteboard.forEach(function(w) { if (w && w.isChar && w.charId === charId && w.ownerId === pid && typeof w.id === 'string') mine[w.id] = 1; });
    var fidI = null; Object.keys(mine).forEach(function(t) { if (fidI === null) fidI = fightOfTok(mapId, t); });   // fold 2: the fight on that map that holds a token of theirs
    var c = fidI ? net.combats[fidI] : null; if (!c || !Array.isArray(c.rows)) return false;
    var row = c.rows.find(function(r) { return r && typeof r.tokId === 'string' && mine[r.tokId] === 1; }); if (!row || row.rolled === 1) return false;
    var cur = c.rows[c.turn], S = SC();
    row.init = Math.max(-1e6, Math.min(1e6, Math.round(value * 100) / 100)); row.rolled = 1; delete row.tb;   // a new number: its old roll-offs go
    var tieIF = S && S.initTie ? S.initTie(camp.system, window.wpFormula, function(r) { var tk = r && typeof r.tokId === 'string' ? map.whiteboard.find(function(w) { return w && w.id === r.tokId; }) : null; return tk && typeof tk.charId === 'string' && camp.chars && own(camp.chars, tk.charId) ? camp.chars[tk.charId] : null; }) : null;   // initiative O2: the system's tie steps
    c.rows = S && S.orderByInit ? S.orderByInit(c.rows, tieIF) : c.rows;
    var at = cur ? c.rows.indexOf(cur) : 0; c.turn = at >= 0 ? at : 0;
    if (typeof combatSideOrder === 'function') combatSideOrder(camp, mapId, c);   // initiative O4: each side stays together
    if (c.seq && typeof seqPlace === 'function') seqPlace(camp, c, { rows: c.rows, turn: c.turn, seq: c.seq, sq: c.sq, mvUsed: c.mvUsed });   // 1.6.2 (G10): a new number may mean more turns
    if (c.ck0) c.ck0[row.id] = row.init;   // ...and on a counting clock it is where this row begins
    toast((row.name || 'Someone') + ' rolled initiative: ' + row.init + ', now ' + (c.rows.indexOf(row) + 1) + ' of ' + c.rows.length + '.');
    logEvent('table', (row.name || 'Someone') + ' rolled initiative on ' + mapTitleOf(mapId) + ': ' + row.init);
    broadcastCombats(); combatRefresh();
    return true;
}
// [netcheck:initfight-end]
// [netcheck:initround-start]
// Initiative O4 (docs/TURN_ORDER_PLAN.md; for sides the owner's answer, "Players vs the rest, each round"): the system's other orders,
// combat.initiative. every: the first time the fight reaches a new round, every row whose token has a character rolls the system's initiative
// roll again through the sheet's own roll (a card on the table, or the GM's alone where its label would tell a GM-only value) and the order
// re-sorts with the tie steps; a row with no character keeps its number. side: the players' characters (a character token with a player) and
// everyone else each roll the system's sides roll when the fight starts and at each new round, again while they tie; the higher side goes
// first, each side's rows in their own order (a held row that acted keeps its place). The table sees which side is first on the strip, and
// each roll as its card
function initRulesOf(camp) { var s = camp && camp.system, ir = s && s.combat && typeof s.combat === 'object' ? s.combat.initiative : null; return ir && typeof ir === 'object' && !Array.isArray(ir) ? ir : null; }
function combatPcOf(camp, mapId) {   // a row's side: the players' for a character token with a player on that map, else the rest's
    var map = camp && camp.items && own(camp.items, mapId) ? camp.items[mapId] : null, pcs = Object.create(null);
    (map && Array.isArray(map.whiteboard) ? map.whiteboard : []).forEach(function(w) { if (w && w.isChar && typeof w.ownerId === 'string' && w.ownerId && typeof w.id === 'string') pcs[w.id] = 1; });
    return function(r) { return !!(r && typeof r.tokId === 'string' && pcs[r.tokId] === 1); };
}
function combatSideRoll(camp, mapId, c) {   // this round's side, c.side: a side alone goes first without a roll; a roll that fails keeps the side there was, or the players
    var ir = initRulesOf(camp), S = ir && typeof ir.side === 'string' && ir.side ? SC() : null; if (!S || !S.sideFirst) return;
    var isPc = combatPcOf(camp, mapId), nPc = c.rows.filter(isPc).length;
    if (!nPc || nPc === c.rows.length) { c.side = nPc ? 'pc' : 'rest'; return; }
    var why = '', label = { pc: 'Side initiative: the players', rest: 'Side initiative: the rest' };
    var got = S.sideFirst(function(side, k) { if (why) return null; var r = net.diceRoll(ir.side, { label: label[side] + (k ? ' (again)' : '') }); if (!r || r.error || typeof r.value !== 'number') { why = (r && r.error) || 'the roll failed.'; return null; } return r.value; });
    if (!got) { if (c.side !== 'pc' && c.side !== 'rest') c.side = 'pc'; toast('Side initiative: ' + why + ' ' + (c.side === 'pc' ? 'The players go first.' : 'The rest go first.')); return; }
    c.side = got.first;
    var said = 'Round ' + c.round + ' on ' + mapTitleOf(mapId) + ': the players rolled ' + got.rolls.pc.join(', then ') + ', the rest ' + got.rolls.rest.join(', then ') + '; ' + (got.first === 'pc' ? 'the players go first.' : 'the rest go first.');
    toast(said); logEvent('table', said);
}
function combatSideOrder(camp, mapId, c) {   // each side together, this round's first side first, the row on turn kept; the sides gone from the system: no side
    var ir = initRulesOf(camp); if (!ir || typeof ir.side !== 'string' || !ir.side) { delete c.side; return; }
    var S = c.side === 'pc' || c.side === 'rest' ? SC() : null; if (!S || !S.orderBySide) return;
    var cur = c.rows[c.turn]; c.rows = S.orderBySide(c.rows, combatPcOf(camp, mapId), c.side); var at = cur ? c.rows.indexOf(cur) : 0; c.turn = at >= 0 ? at : 0;
}
function combatSides(mapId, c, fresh) {   // a fight's start or a roster edit: the sides rolled if there is no side yet, then each side together (a new fight from its first)
    var camp = getActiveCampaign(), ir = initRulesOf(camp); if (!ir || typeof ir.side !== 'string' || !ir.side) { delete c.side; return; }
    if (c.side !== 'pc' && c.side !== 'rest') combatSideRoll(camp, mapId, c);
    combatSideOrder(camp, mapId, c); if (fresh) c.turn = 0;
}
// 1.6.2 (G9, fold 3): the order from a draw. Each row draws a card, highest first by a number of the deck's, or in the order drawn with none. A card marked ends stands in that order by itself, and the round ends when play reaches it (c.endAt, the host's own). What each drew is shown to the table but for a token hidden from it, and the pile stays the host's
function deckOrder(camp, c) {
    var ir = initRulesOf(camp), K = window.wpDeckCore, F = window.wpFormula; if (!ir || !ir.deck || !K || !camp.system || !c || !Array.isArray(c.rows)) return false; var d = K.deckOf(camp.system.decks, ir.deck.key); if (!d || !d.cards.length) return false;
    var rnd = function(n) { var r = F && F.evaluate ? F.evaluate('1d' + n) : null; return r && r.ok && typeof r.value === 'number' ? r.value : 1 + Math.floor(Math.random() * n); }, by = ir.deck.by, val = function(i) { return by ? K.cardVal(d, i, by) : 0; };
    var p = camp.piles && own(camp.piles, d.key) ? K.cleanPile(camp.piles[d.key], d) : null; if (!p || ir.deck.fresh === true) p = K.shufflePile(d, p, rnd, true);
    var got = [], ends = [], guard = c.rows.length + K.CARDS_MAX * 2;
    while (got.length < c.rows.length && guard-- > 0) { var dr = K.drawCards(d, p, 1, rnd); if (!dr.cards.length) break; p = dr.pile; var i = dr.cards[0]; if (d.cards[i].ends === true) ends.push({ at: got.length, v: val(i), name: d.cards[i].name }); else got.push(i); }
    var pairs = c.rows.map(function(r, k) { return { r: r, i: k < got.length ? got[k] : null, at: k }; }), has = function(x) { return x.i === null ? -Infinity : val(x.i); };
    if (by) pairs.sort(function(a, b) { var d0 = has(b) - has(a); return d0 ? (d0 > 0 ? 1 : -1) : a.at - b.at; });
    c.rows = pairs.map(function(x, k) { x.r.init = by && x.i !== null ? val(x.i) : pairs.length - k; x.r.rolled = 1; delete x.r.tb; return x.r; });
    var pos = null; ends.forEach(function(e) { var at = by ? pairs.filter(function(x) { return has(x) > e.v; }).length : e.at; if (pos === null || at < pos) pos = at; }); if (pos !== null && pos < c.rows.length) c.endAt = Math.max(1, pos); else delete c.endAt;
    camp.piles = Object.assign({}, camp.piles || {}); camp.piles[d.key] = p; saveRemoteSoon(); if (typeof net.decksTell === 'function') net.decksTell(camp);
    var map = camp.items && own(camp.items, c.mapId) ? camp.items[c.mapId] : null, lines = pairs.filter(function(x) { var tk = map && Array.isArray(map.whiteboard) ? map.whiteboard.find(function(w) { return w && w.id === x.r.tokId; }) : null; return x.i !== null && !(tk && tk.hidden); }).map(function(x) { return { n: String(x.r.name || 'Someone'), say: K.faceWords(d.cards[x.i], K.faceOf(d.cards[x.i], rnd)) }; });   // a dealt card on one of its faces (the review of story cards)
    if (lines.length && typeof net.postApplyCard === 'function') net.postApplyCard(null, 'Round ' + c.round + ': ' + d.label, lines, 'table');
    if (typeof window.wpStepLog === 'function') window.wpStepLog('decks v1', 'order', { rows: c.rows.length, ends: ends.length });
    return true;
}
function combatNewRound(mapId, c) {   // combatStep at a new round, once per round reached (a step back and on again rolls nothing); turn 0 is the new order's first
    var camp = getActiveCampaign(), ir = initRulesOf(camp); if (!ir || !camp) return;
    if (ir.deck) { if (c.round <= (typeof c.rr === 'number' ? c.rr : 1)) return; c.rr = c.round; if (deckOrder(camp, c)) c.turn = 0; return; }   // 1.6.2 (G9)
    var every = ir.every === true, side = typeof ir.side === 'string' && !!ir.side, S = every || side ? SC() : null; if (!S) return;
    if (c.round <= (typeof c.rr === 'number' ? c.rr : 1)) return; c.rr = c.round;
    if (every && window.wpSheets && window.wpSheets.rollInit) {
        var map = camp.items && own(camp.items, mapId) ? camp.items[mapId] : null;
        var tokOf = function(r) { return r && typeof r.tokId === 'string' && map && Array.isArray(map.whiteboard) ? map.whiteboard.find(function(w) { return w && w.id === r.tokId; }) : null; };
        var charOf = function(r) { var tk = tokOf(r); return tk && tk.isChar && typeof tk.charId === 'string' && camp.chars && own(camp.chars, tk.charId) ? camp.chars[tk.charId] : null; };
        for (var i = 0, n = 0; i < c.rows.length; i++) {
            var ch = charOf(c.rows[i]); if (!ch) continue;
            var tkI = tokOf(c.rows[i]), rr = window.wpSheets.rollInit(ch.id, { priv: !!(tkI && (tkI.hidden || (typeof net.tokUnseen === 'function' && net.tokUnseen(mapId, tkI.id)))) }); if (rr && rr.held) continue; if (rr && rr.error) { toast(rr.error); break; }   // held (1.5.4): its initiative roll's needs not met, it keeps its number   // no roll, dice off: said once, the rest keep their numbers; hidden pieces: a creature the GM hid, or one some player at the table cannot see (net.tokUnseen), rolls in private (its row reads Hidden to them, and the card would name it)
            if (rr && typeof rr.value === 'number' && isFinite(rr.value)) { c.rows[i].init = Math.max(-1e6, Math.min(1e6, Math.round(rr.value * 100) / 100)); c.rows[i].rolled = 1; delete c.rows[i].tb; n++; }
        }
        if (n && S.orderByInit) c.rows = S.orderByInit(c.rows, S.initTie ? S.initTie(camp.system, window.wpFormula, charOf) : null);   // nothing rolled: the order as it was
    }
    c.turn = 0;
    if (side) combatSideRoll(camp, mapId, c);
    combatSideOrder(camp, mapId, c); c.turn = 0;
}
// [netcheck:initround-end]
net.combatStep = function(mapId, dir) { return fightStep(fightAt(mapId), dir); };   // fold 2: the old name, for the strip's fight on that map
// [netcheck:turnhold-start]
// Initiative O3 (the owner's answer, "After the current turn"): the character whose turn it is holds it — play moves on as with Next turn and
// its row waits, held; later in the round, when its owner or the GM presses Act, the held row goes right after whoever is acting and keeps
// that place (it acts next). A hold not used by the round's end is lost (combatStep), and the character acts in its usual place
net.combatHold = function(mapId) { return fightHold(fightAt(mapId)); };   // fold 2: the old names, for the strip's fight on that map (fightHold, fightAct)
net.combatAct = function(mapId, rowId) { return fightAct(fightAt(mapId), rowId); };
// [netcheck:turnhold-end]
net.combatEnd = function(mapId) { return fightEnd(fightAt(mapId)); };   // fold 2: the old name, for the strip's fight on that map
// [netcheck:orders-start]
/* Fold 2 (backlog 152, docs/FIGHT_CLOCK_DESIGN.md section 4): the fights by id, outside the cut of the old names. A map may hold two fights, so a
   reader asks for the fight that holds the token or the character (fightOfTok, net.orderOf), or for every fight on the map (fightsOn). Which order
   a character is in is judged in ONE place, net.orderOf, by combatChars' rule: a character token (isChar) of a character of the campaign, a hidden
   token counted too. The API by id: fightSet starts, changes and ends a fight; fightStep, fightHold and fightAct play it; fightEnd asks first; and
   fightPlay makes a fight the one played (net.fightOn: a new fight, or the one the GM steps or plays; when it ends, the one furthest behind). The old
   names (net.combatSet, combatStep, combatHold, combatAct, combatEnd) stay as thin wrappers for the strip's fight on a map (fightAt). Fold 4 gives
   each fight its own time (below, at ordersMoved) */
net.fightOn = null;   // the fight played (its id), or null: the host's own, never sent
function fightIds() {   // every fight's id, in the order begun (on a player's app, in the order its host sent them)
    var cs = net.combats && typeof net.combats === 'object' ? net.combats : null; if (!cs) return [];
    return Object.keys(cs).filter(function(k) { var c = cs[k]; return !!c && typeof c === 'object' && typeof c.mapId === 'string' && Array.isArray(c.rows); })
        .map(function(k, i) { return { k: k, i: i, n: typeof cs[k].n === 'number' ? cs[k].n : Infinity }; })
        .sort(function(a, b) { return (a.n - b.n) || (a.i - b.i); }).map(function(x) { return x.k; });
}
function fightsOn(mapId) { return typeof mapId === 'string' && mapId ? fightIds().filter(function(k) { return net.combats[k].mapId === mapId; }) : []; }   // the fights on a map, in the order begun
function fightOfTok(mapId, tokId) {   // the fight on that map whose order holds that token, else null: a token is in one fight at most
    if (typeof tokId !== 'string' || !tokId) return null;
    var hit = null; fightsOn(mapId).forEach(function(k) { if (hit === null && net.combats[k].rows.some(function(r) { return !!r && r.tokId === tokId; })) hit = k; });
    return hit;
}
function fightAt(mapId) { var ids = fightsOn(mapId); return ids.length ? (ids.indexOf(net.fightOn) >= 0 ? net.fightOn : ids[0]) : null; }   // the strip's fight on a map: the one played, else the first begun
function orderById(id) { var cs = net.combats; return typeof id === 'string' && cs && typeof cs === 'object' && Object.prototype.hasOwnProperty.call(cs, id) && cs[id] && typeof cs[id] === 'object' && Array.isArray(cs[id].rows) ? cs[id] : null; }
function orderOfIn(camp, charId) {   // the one judge: the id of the fight a character is in (the first begun whose order holds a token of it), else null
    if (!camp || !camp.items || !camp.chars || typeof charId !== 'string' || !charId || !Object.prototype.hasOwnProperty.call(camp.chars, charId)) return null;
    var hit = null;
    fightIds().forEach(function(k) {
        if (hit !== null) return; var cb = net.combats[k], mp = Object.prototype.hasOwnProperty.call(camp.items, cb.mapId) ? camp.items[cb.mapId] : null; if (!mp || !Array.isArray(mp.whiteboard)) return;
        if (cb.rows.some(function(r) { return !!r && typeof r.tokId === 'string' && !!r.tokId && mp.whiteboard.some(function(w) { return !!w && w.id === r.tokId && !!w.isChar && w.charId === charId; }); })) hit = k;   // combatChars' rule: a character token of that character, hidden or not, its isChar read as combatChars reads it (any word that is true, as a file may write 1)
    });
    return hit;
}
net.orderOf = function(charId) { return orderOfIn(getActiveCampaign(), charId); };
net.combatFor = function(mapId) { return net.active ? orderById(fightAt(mapId)) : null; };   // the fight played on that map, else the first begun there (HUD frame HF5b, the marks)
net.combatOfTok = function(mapId, tokId) { return orderById(fightOfTok(mapId, tokId)); };   // the fight on that map that holds that token
// Fold 2's review: the fight whose round CombatRound reads for a token on a map, worked out alike on the host and on a player's app: the fight that
// holds the token, else the first begun there. Never net.fightOn, the host's own and never sent: a token in no fight on a map of two fights read
// one round on its player's own sheet and another in the host's roll. A player's app holds its fights in the order its host began them
net.combatRoundOf = function(mapId, tokId) { return orderById(fightOfTok(mapId, tokId) || fightsOn(mapId)[0] || null); };
net.fightsOn = fightsOn;
// The one judge for every character at once (fold 4: the timed effects and the second's span read many): { charId: the fight it is in }, by the very rule
// of orderOfIn, the first begun fight whose order holds a character token of it. An object with no prototype
function ordersOfChars(camp) {
    var out = Object.create(null); if (!camp || !camp.items || !camp.chars) return out;
    fightIds().forEach(function(k) {
        var cb = net.combats[k], mp = Object.prototype.hasOwnProperty.call(camp.items, cb.mapId) ? camp.items[cb.mapId] : null; if (!mp || !Array.isArray(mp.whiteboard)) return;
        var toks = Object.create(null); cb.rows.forEach(function(r) { if (r && typeof r.tokId === 'string' && r.tokId) toks[r.tokId] = 1; });
        mp.whiteboard.forEach(function(w) { if (w && typeof w.id === 'string' && toks[w.id] === 1 && !!w.isChar && typeof w.charId === 'string' && w.charId && Object.prototype.hasOwnProperty.call(camp.chars, w.charId) && !(w.charId in out)) out[w.charId] = k; });
    });
    return out;
}
/* 152 fold 4 (docs/FIGHT_CLOCK_DESIGN.md sections 1 and 4): EACH FIGHT KEEPS ITS OWN TIME, and the clock reads the one furthest behind. A fight's at is a
   time pair { s, ms } (calendarcore), the start of the round in play: the host's own, never sent (combatsFor names what it sends, and cleanFightBody
   writes none of it; fightSet puts it back after cleaning, as it does rr and side). A new fight begins at the time of the fight played (net.fightOn),
   else at the second; a wrap adds the round's length as it is at that moment, a step back past a round's first turn takes it off, and a roster edit
   that sets another round moves it by the difference; an end lets its people go at its time and one round's length, so the round a fight ends in
   counts: begun at 12:00:00 with rounds of 1 s and ended in round 3, the clock goes on from 12:00:03. THE SECOND (net.second, the host's own) is the
   floor of the least time of the fights running: it moves on only when that least time rises, and back only for a step back or a roster edit that
   lowered it. It is the table clock: written to the campaign's clock with the Calendar on (frame 'clock'; calendar.js second), kept in memory alone with
   it off (frame 'mem'), the frame fixed when the first fight begins and kept until none is left, but that a Calendar switched off while fights run
   turns it to 'mem' for good: the date then stays where it was, and no character is left ahead of a clock that never followed. With no fight
   running, time is regular, as before.
   ordersMoved is the ONE coordinator, called once at the end of every change of a fight's time (a start, a step that wraps or goes back, a hold that
   wraps, a roster edit, an end): it works out the second, hands what was lived (the round a fight closed or ended in, for its fighters; those who
   walk into a fight that is ahead, the gap up to its time; the second's move, for everyone in no fight) to calendar.js ownTime, which counts each
   character's own span ONCE for its timed effects and its time rules, moves the clock (calendar.js second) and tells the table. The GM's own step of
   a fight makes it the one played (fightStep's by: a player's End turn or hold never does); the one played that ends hands on to the one furthest
   behind, since only it moves the clock. Without calendarcore at hand a fight keeps no time and nothing here moves the clock */
net.second = null;   // while fights run: { frame: 'clock' | 'mem', s: the second, whole }; the host's own, never sent
function timeCore() { var w = typeof window !== 'undefined' ? window : null; return w && w.wpCalendarCore && typeof w.wpCalendarCore.tAdd === 'function' && typeof w.wpCalendarCore.tCmp === 'function' && typeof w.wpCalendarCore.cleanTime === 'function' ? w.wpCalendarCore : null; }
function campNow() { return typeof getActiveCampaign === 'function' ? getActiveCampaign() : null; }
function calOn() { var w = typeof window !== 'undefined' ? window : null; return !!(w && w.wpVtt && typeof w.wpVtt.on === 'function' && w.wpVtt.on('calendar') === true); }
function clockSecOf(camp) { var CC = timeCore(), ck = CC && typeof CC.cleanClock === 'function' && camp ? CC.cleanClock(camp.clock) : null; return ck ? ck.t : 0; }
function secondNow(camp) { return net.second && typeof net.second.s === 'number' ? net.second.s : clockSecOf(camp); }
function fightAtOf(c, camp) { var CC = timeCore(), a = CC && c ? CC.cleanTime(c.at) : null; return a || { s: secondNow(camp), ms: 0 }; }   // a fight that keeps no time yet reads the second
function roundMs(camp) { var S = typeof SC === 'function' ? SC() : null, rs = S && typeof S.roundSecs === 'function' ? S.roundSecs(camp && camp.system) : 6; return Math.round((typeof rs === 'number' && isFinite(rs) && rs > 0 ? rs : 6) * 1000); }   // a round's length, kept to the thousandth: whole milliseconds
function fightersOf(camp, c) { var S = typeof SC === 'function' ? SC() : null, mp = camp && camp.items && c && typeof c.mapId === 'string' && Object.prototype.hasOwnProperty.call(camp.items, c.mapId) ? camp.items[c.mapId] : null; return S && typeof S.combatChars === 'function' && mp ? S.combatChars(mp, c, camp.chars || {}).map(function(e) { return e.charId; }) : []; }   // combatChars' rule
function fightBehind() {   // the fight furthest behind (the least time; of those, the first begun), or null
    var CC = timeCore(), camp = campNow(), best = null, ba = null;
    fightIds().forEach(function(k) { var a = CC ? fightAtOf(net.combats[k], camp) : null; if (best === null || (CC && CC.tCmp(a, ba) < 0)) { best = k; ba = a; } });
    return best;
}
function fightGroup(camp, c, t0, t1, round, nm) {   // what a fight's fighters lived from t0 to t1, for calendar.js ownTime
    var nmG = typeof nm === 'string' && nm ? nm : typeof mapTitleOf === 'function' ? mapTitleOf(c.mapId) : 'a map';
    return { kind: 'fight', ids: fightersOf(camp, c), t0: t0, t1: t1, round: round, rs: roundMs(camp) / 1000, words: 'Round ' + round + ' on ' + nmG };
}
function fightTime(camp, had, f) {   // a fight begun (had null) or its roster changed: its own time, set on f before it is stored; what that lives, for ordersMoved
    var CC = timeCore(); if (!CC || !f) return null;
    var out = { groups: [], back: false };
    if (!had) {
        if (!net.second) net.second = { frame: calOn() ? 'clock' : 'mem', s: clockSecOf(camp) };   // the first fight: the second is the clock's, its frame fixed until none is left
        var act = orderById(net.fightOn); f.at = act ? fightAtOf(act, camp) : { s: secondNow(camp), ms: 0 };   // brief 8: at the time of the fight played, with none at the second
    } else {
        var a0 = fightAtOf(had, camp), d = f.round - had.round; f.at = d ? CC.tAdd(a0, d * roundMs(camp)) : a0;   // a roster edit moves it by the rounds it sets
        if (d > 0) out.groups.push(fightGroup(camp, f, a0, f.at, f.round - 1)); else if (d < 0) out.back = true;
    }
    var was = had ? fightersOf(camp, had) : [], now = fightersOf(camp, f), fresh = now.filter(function(id) { return was.indexOf(id) < 0; }), left = was.filter(function(id) { return now.indexOf(id) < 0; });
    if (had && left.length) { var aL = fightAtOf(had, camp), gL = fightGroup(camp, had, aL, CC.tAdd(aL, roundMs(camp)), had.round); gL.ids = left; out.groups.unshift(gL); }   // those taken out live the round in play and leave at its end, as an end's people do
    if (fresh.length) {   // those who join: a fight begins for them (Each fight starts again), and they walk in, living the time from the second up to the fight's as time outside one
        out.fresh = fresh; var s0 = secondNow(camp);
        if (CC.tCmp(f.at, s0) > 0) out.groups.unshift({ kind: 'out', ids: fresh, t0: { s: s0, ms: 0 }, t1: f.at, walk: true });   // walk: the fight holds them by the time it is counted, and their timed effects live the gap all the same (net.fxSpans)
    }
    return out;
}
function fightTurned(camp, c, a0, r0) {   // a step that changed the round: the fight's time moved by the round's length; the round it closed, lived by its fighters
    var CC = timeCore(); if (!CC || !c) return null;
    var d = c.round - r0; c.at = CC.tAdd(a0, d * roundMs(camp));
    return d > 0 ? { groups: [fightGroup(camp, c, a0, c.at, c.round - 1)] } : { back: true };
}
function fightEndTime(camp, c, nm) {   // an end: the round it ends in, lived by its people up to its time and one round's length, where they leave
    var CC = timeCore(); if (!CC || !c) return null;
    var a0 = fightAtOf(c, camp), a1 = CC.tAdd(a0, roundMs(camp));
    return { groups: [fightGroup(camp, c, a0, a1, c.round, nm)], last: a1 };
}
// The coordinator: o = { groups (what a fight's change lived), back (a correction may take the second back), last (an end's time: the second's floor
// once no fight is left), fresh (the characters a fight begins for) }. The second first, then each span counted once (ownTime), the clock moved
// (second), the table told; nothing on a player's app
function ordersMoved(why, o) {
    if (net.role !== 'host') return false;
    o = o && typeof o === 'object' ? o : {};
    var CC = timeCore(), camp = campNow(), w = typeof window !== 'undefined' ? window : null, cal = w && w.wpCalendar ? w.wpCalendar : null, ids = fightIds();
    var fmS = typeof SC === 'function' ? SC() : null, fm = fmS && typeof fmS.fightClock === 'function' && camp ? fmS.fightClock(camp.system) : 'sync';
    if (CC && camp && fm !== 'sync') {   // 1.6.2 Fight time, the system's: the clock runs on, or the date never moves. No second; a fight's rounds count for In a fight
        // rules alone (inOnly), each fighter a round's length, and touch no character's own time, which the clock keeps
        var gsN = (Array.isArray(o.groups) ? o.groups : []).filter(function(g) { return !!g && g.kind === 'fight' && Array.isArray(g.ids) && g.ids.length > 0; }).map(function(g) { var sp = {}, sc = Math.max(0, CC.tSpanMs(g.t0, g.t1) / 1000); g.ids.forEach(function(id) { sp[id] = sc; }); return Object.assign({}, g, { spans: sp, secs: sc, inOnly: true }); });
        if (cal) {
            try { if (Array.isArray(o.fresh) && o.fresh.length && typeof cal.fightBegan === 'function') cal.fightBegan(o.fresh); } catch (e) { console.error(e); }
            try { if (gsN.length && typeof cal.ownTime === 'function') cal.ownTime(gsN); } catch (e) { console.error(e); }
        }
        net.second = null;
    } else if (CC && camp) {
        var least = null; ids.forEach(function(k) { var a = fightAtOf(net.combats[k], camp); if (least === null || CC.tCmp(a, least) < 0) least = a; });
        var s0 = secondNow(camp), s1 = least ? CC.tFloor(least) : o.last ? CC.tFloor(o.last) : s0, back = s1 < s0 && o.back === true;
        if (s1 < s0 && !back) s1 = s0;   // the second goes back only for a correction
        var groups = (Array.isArray(o.groups) ? o.groups : []).filter(function(g) { return !!g && Array.isArray(g.ids) && g.ids.length > 0; });
        if (s1 > s0) {   // the second moved on: everyone in no fight lives it
            var inF = ordersOfChars(camp), outIds = Object.keys(camp.chars && typeof camp.chars === 'object' ? camp.chars : {}).filter(function(id) { return !inF[id]; });
            if (outIds.length) groups.push({ kind: 'out', ids: outIds, t0: { s: s0, ms: 0 }, t1: { s: s1, ms: 0 } });
        }
        if (net.second && net.second.frame === 'clock' && !calOn()) net.second.frame = 'mem';   // the Calendar switched off while fights run: from now each character's own time is kept in memory alone (calendar.js memOf takes the clock's marks), until no fight is left
        if (cal) {
            try { if (Array.isArray(o.fresh) && o.fresh.length && typeof cal.fightBegan === 'function') cal.fightBegan(o.fresh); } catch (e) { console.error(e); }
            try { if (groups.length && typeof cal.ownTime === 'function') cal.ownTime(groups); } catch (e) { console.error(e); }
            try { if (typeof cal.second === 'function') cal.second(s1, back, !ids.length); } catch (e) { console.error(e); }
        }
        if (ids.length) { if (net.second) net.second.s = s1; else net.second = { frame: calOn() ? 'clock' : 'mem', s: s1 }; } else net.second = null;
    }
    try { if (typeof net.syncClock === 'function') net.syncClock(); } catch (e) { console.error(e); }
    if (typeof broadcastCombats === 'function') broadcastCombats();
    if (typeof combatRefresh === 'function') combatRefresh();
    try { if (w && w.wpPills && typeof w.wpPills.sync === 'function') w.wpPills.sync(); } catch (e) {}
    return true;
}
net.ordersMoved = ordersMoved;
function newFightId() { var id; do { id = 'f_'; while (id.length < 10) id += 'abcdefghijklmnopqrstuvwxyz0123456789'.charAt(Math.floor(Math.random() * 36)); } while (orderById(id)); return id; }   // as a dated note's id is made
// host: a fight started (fid null: a new one on combat.mapId), its roster changed (a roster edit keeps its round and its side), or ended (combat null).
// The fight's id, or null
var _fightWas = Object.create(null);   // 1.6.0: fight -> token -> the number it had when it was taken out, the host's memory alone
net.fightWas = function(fid, tokId) { var f = _fightWas[fid]; return f && f[tokId] ? f[tokId] : null; };
function fightSet(fid, combat) {
    if (net.role !== 'host') return null;
    if (typeof net.charBatch === 'function' && !net.charBatching()) return net.charBatch(function() { return fightSet(fid, combat); });   // 1.6.3 (the combat review, finding 6): one batch, so each character changed is sent and drawn once at its end
    var had = orderById(fid), mapId = had ? had.mapId : (combat && typeof combat === 'object' && typeof combat.mapId === 'string' && combat.mapId ? combat.mapId : null), f = null, tg = null;
    if (combat && mapId) {
        f = cleanFightBody(combat, mapId); if (!f) return null;
        var cutN = Array.isArray(combat.rows) ? combat.rows.filter(function(r) { return !!r && typeof r === 'object'; }).length - f.rows.length : 0;   // 1.6.3 (the combat review, finding 14): rows past what a fight holds, said below
        var heldBy = Object.create(null); fightsOn(mapId).forEach(function(k) { if (k !== fid) net.combats[k].rows.forEach(function(r) { if (r && typeof r.tokId === 'string') heldBy[r.tokId] = 1; }); });
        f.rows = f.rows.filter(function(r) { return !(typeof r.tokId === 'string' && heldBy[r.tokId] === 1); }); if (!f.rows.length) return null;   // a token is in one fight at most: a row whose token another fight on that map holds stays out
        f.turn = Math.min(f.turn, f.rows.length - 1);
        var first = !had && !fightsOn(mapId).length;   // the map's first fight: the marks are held from now
        if (!had) fid = newFightId();
        f = Object.assign({ id: fid }, f); f.n = had && typeof had.n === 'number' ? had.n : fightNSet(_fightN + 1);
        if (had) had.rows.forEach(function(r) { if (r && typeof r.tokId === 'string' && !f.rows.some(function(x) { return x && x.tokId === r.tokId; })) { var wn = _fightWas[fid] = _fightWas[fid] || Object.create(null); wn[r.tokId] = { init: r.init, rolled: r.rolled === 1 }; } });
        tg = fightTime(campNow(), had, f);   // fold 4: its own time (a new fight's, or a roster edit's), before it is stored
        net.combats[fid] = f;
        if (first && typeof marksStart === 'function') { try { marksStart(mapId); } catch (e) { console.error(e); } }   // senses S4b: everyone's marks held from the fight's start
        if (!had && typeof deckOrder === 'function') { var campDo = campNow(); if (campDo && initRulesOf(campDo) && initRulesOf(campDo).deck) { f.rr = 1; deckOrder(campDo, f); f.turn = 0; } }   // 1.6.2 (G9): a new fight's first order is drawn too
        if (had && typeof had.endAt === 'number') f.endAt = had.endAt;
        if (had && typeof had.rr === 'number') f.rr = had.rr;   // initiative O4: the last round the fight rolled for, and this round's side, kept through a roster edit
        if (had && (had.side === 'pc' || had.side === 'rest')) f.side = had.side;
        if (typeof combatSides === 'function') combatSides(mapId, f, !had);   // ...and each side together (a new fight rolls the sides first)
        if (typeof seqPlace === 'function') seqPlace(campNow(), f, had);   // 1.6.2 (G10): a round of several turns
        if (typeof clockStart === 'function') clockStart(campNow(), f, had);   // 1.6.2 (G10): a counting clock
        if (had && had.dec) f.dec = had.dec; else delete f.dec;   // 1.6.2 (G10): what is declared stays the host's own through a roster edit
        if (had && typeof fightReachKept === 'function') fightReachKept(had, f);   // fold 3: a roster edit keeps how far the fight has gone (rh, th, turned), put back after cleaning as rr and side are; a new fight starts with none
        if (had && typeof holdsPrune === 'function') holdsPrune(getActiveCampaign(), f);   // 1.6.0: a row taken out of the order ends what it held and what held it
        if (had && chosenRule()) chosenMark(f);   // initiative O5: each row's mark of having gone, by its id, the row on turn none
        if (!had || had.round !== f.round) roundChanged(mapId, f);   // G10: the first round (a roster edit keeps its round)
        if (!had) { net.fightOn = fid; logEvent('table', 'Combat started on ' + mapTitleOf(mapId) + ': ' + f.rows.map(function(r) { return r.name; }).join(', ')); }   // a new fight is the one played
        toast(had ? 'Combat roster updated.' : 'Combat started on ' + mapTitleOf(mapId) + '. ' + (f.rows[f.turn] || f.rows[0]).name + ' goes first.');
        if (cutN > 0) { toast(cutN + (cutN === 1 ? ' was' : ' were') + ' left out. A fight holds 600 at most.'); logEvent('table', cutN + ' left out of the fight on ' + mapTitleOf(mapId) + ': a fight holds 600 at most'); }
    } else if (!combat) combatOver(fid, had);   // End: the one way a fight ends (fold 0), which the session's end and a deleted map share
    else return null;
    broadcastCombats(); combatRefresh();
    if (f && !had) { try { fxCombatEdge(mapId, f, 'bank'); } catch (e) { console.error(e); } }   // T5a: their effects' clocks stop (what ran is kept)
    if (f && !had) turnStarted(mapId, f);   // T2b: the first turn (after the broadcast: its player's note comes last)
    if (tg) ordersMoved(had ? 'edit' : 'start', tg);   // fold 4: a round edited in the roster moves the fight's time with it; those who join walk in
    return f ? fid : null;
}
// Initiative O5 (backlog 34; the owner, by prompt, 2026-10-29: "A Turn order choice"; of a new round, "the standing order repeats, but there should be
// the option to choose otherwise"): Next is chosen. A fight's rows keep their standing order, the initiative's, and a turn's end goes to the next in it
// who has not gone this round unless the one whose turn ends picks another of those (systemcore chosenNext); with none left a new round begins from the
// order's first, or from anyone the last to act picks. A player picks only at their own turn's end (the turn-end branch), the GM at any time. The
// host's own, never sent: ps, the ids of the rows that had their turn this round in the order they had it, and pp, the rounds before's (ten at most),
// kept through a roster edit (fightReachKept). Each row's dn (chosenMark) is ps as the table sees it. A step back takes back the last turn had, into
// the round before if need be: a correction, the round's time and how far the fight has gone (rh, th, eh, et) as for any step back
function chosenRule() { var camp = campNow(), sy = camp && camp.system, cm = sy && sy.combat && typeof sy.combat === 'object' ? sy.combat : null, ir = cm && cm.initiative && typeof cm.initiative === 'object' ? cm.initiative : null; return !!(ir && ir.chosen === true); }
function holdRule(k) { var camp = campNow(), sy = camp && camp.system, cm = sy && sy.combat && typeof sy.combat === 'object' ? sy.combat : null, tn = cm && cm.turn && typeof cm.turn === 'object' ? cm.turn : null; return tn ? tn[k] : undefined; }   // 1.6.0: the Combat tab's two hold rules
function chosenMark(c) {   // each row's dn from ps (rows gone from the fight dropped from it, the row on turn never gone)
    if (!c || !Array.isArray(c.rows)) return;
    var cur = c.rows[c.turn], ids = Object.create(null), gone = Object.create(null); c.rows.forEach(function(r) { if (r && typeof r.id === 'string') ids[r.id] = 1; });
    c.ps = (Array.isArray(c.ps) ? c.ps : []).filter(function(id) { return ids[id] === 1 && !(cur && cur.id === id); });
    c.ps.forEach(function(id) { gone[id] = 1; });
    c.rows.forEach(function(r) { if (!r) return; if (gone[r.id] === 1) r.dn = 1; else delete r.dn; });
}
function chosenGo(c, dir, nx, t0) {   // the place play goes: forward, nx (from chosenNext; a new round when none is left), back, the last turn had
    if (dir > 0) {
        var cur = c.rows[t0], ps = Array.isArray(c.ps) ? c.ps : [];
        if (cur && typeof cur.id === 'string' && ps.indexOf(cur.id) < 0) ps.push(cur.id);
        c.ps = ps;
        if (nx.round) { c.pp = (Array.isArray(c.pp) ? c.pp : []).concat([ps]).slice(-10); c.ps = []; c.round += 1; }
        return nx.at;
    }
    var ps2 = Array.isArray(c.ps) ? c.ps.slice() : [], back = false;
    if (!ps2.length && c.round > 1 && Array.isArray(c.pp) && c.pp.length) { ps2 = c.pp[c.pp.length - 1].slice(); back = true; }
    while (ps2.length) {
        var id = ps2.pop(), at = c.rows.findIndex(function(r) { return !!r && r.id === id; });
        if (at >= 0) { c.ps = ps2; if (back) { c.pp = c.pp.slice(0, -1); c.round -= 1; } return at; }
    }
    return t0;   // nothing to go back to
}
function fightStep(fid, dir, by, pick) {   // host: that fight's next turn (dir 1) or the one before (dir -1); by 'player': a player's own End turn or hold; initiative O5: pick, the row chosen to go next
    if (net.role !== 'host') return;
    if (typeof net.charBatch === 'function' && !net.charBatching()) return net.charBatch(function() { return fightStep(fid, dir, by, pick); });   // 1.6.3 (the combat review, finding 6): one batch, so each character changed is sent and drawn once at its end
    var c = orderById(fid); if (!c || !c.rows.length) return;
    var S5 = chosenRule() && typeof SC === 'function' ? SC() : null; if (S5 && typeof S5.chosenNext !== 'function') S5 = null;   // initiative O5: Next is chosen
    var nx = S5 && dir > 0 ? S5.chosenNext(c.rows, c.turn, typeof pick === 'string' ? pick : undefined) : null;
    if (S5 && dir > 0 && !nx) return false;   // a pick that may not go next (one who has gone, the one on turn, one not there): nothing moves
    if (by !== 'player') net.fightOn = fid;   // fold 4: the GM's own step of a fight makes it the one played
    if (dir > 0 && c.dec && c.dec.open === 1 && typeof declareReveal === 'function') declareReveal(fid);   // 1.6.2 (G10): play moving on shows what is in
    var campS = campNow(), a0 = timeCore() ? fightAtOf(c, campS) : null;   // fold 4: the fight's own time before the step
    var mapId = c.mapId, t = c.turn + (dir < 0 ? -1 : 1), r0 = c.round, t0 = c.turn, endRow = dir > 0 && c.rows[t0] && (!c.rows[t0].held || holdRule('holdEnd') === 'end') ? c.rows[t0] : null;   // 1.6.0: the turn a forward step ends (a held one only where the system says a hold ends the turn; once a turn, so acting from it runs nothing again)
    var pkFrom = c.rows[t0], pkRow = nx && nx.round && typeof pick === 'string' ? c.rows[nx.at] : null;   // initiative O5: whose turn ends, and the row picked to open a new round, found again once its order is made
    var at0 = c.sq, seqR = c.seq && typeof seqStep === 'function' ? severalRule(campS) : null, ckR = typeof clockRule === 'function' ? clockRule(campS) : null; if (seqR) seqMoved(c, seqR);
    if (S5) t = chosenGo(c, dir, nx, t0);   // initiative O5: the place chosen (a new round where none is left), or back to the last turn had (a correction)
    else if (seqR) t = seqStep(c, dir);   // 1.6.2 (G10): the round's own order of turns
    else if (ckR) t = clockStep(campS, c, dir, ckR);   // 1.6.2 (G10): a counting clock
    else if (t >= c.rows.length || (dir > 0 && typeof c.endAt === 'number' && t >= c.endAt)) { t = 0; c.round += 1; }   // 1.6.2 (G9): a card that ends the round ends it where it stands
    else if (t < 0) { if (c.round > 1) { c.round -= 1; t = (typeof c.endAt === 'number' ? Math.min(c.endAt, c.rows.length) : c.rows.length) - 1; } else t = 0; }
    c.turn = t; c.tn = (typeof c.tn === 'number' ? c.tn : 0) + 1;   // 1.6.3 (the combat review, finding 29): every step is a turn of its own, by this serial, which a player's End turn names
    if (c.round !== r0 && holdRule('hold') !== 'next' && holdRule('holdNames') !== true) c.rows.forEach(function(r) { if (r) delete r.held; });   // initiative O3 (the owner's answer): a hold not used by the round's end is lost (1.6.0: unless the system's hold lasts to the row's next turn, which the next line ends)
    if (holdRule('holdNames') === true) holdTurn(c, t, dir, t0);   // 1.6.0: a named hold lasts to its row's next turn, a row set off has had its moment, and a lost action takes a hold
    if (c.rows[t]) delete c.rows[t].held;   // ...and a row whose turn it is holds nothing
    if (endRow && typeof turnEnded === 'function') turnEnded(mapId, c, endRow, r0, t0);   // 1.6.0: its end first, before the new round and the next turn
    if (c.round > r0 && typeof combatNewRound === 'function') { combatNewRound(mapId, c); t = c.turn; }
    if (seqR && c.round > r0) { seqMake(campS, c); c.sq = 0; if (c.seq) { t = seqIdx(c, 0); c.turn = t; } }
    if (ckR && c.round > r0) { clockCycle(campS, c); t = c.turn; }
    if (S5) { var atP = pkRow ? c.rows.indexOf(pkRow) : -1; if (atP >= 0) { c.turn = atP; t = atP; } chosenMark(c); }   // initiative O5: the new round opened by the one picked, and each row's mark of having gone   // initiative O4: a new round's order (rolled again, by side), the first time the fight reaches it
    if (c.round !== r0) roundChanged(mapId, c);   // G10
    var tg = c.round !== r0 && a0 ? fightTurned(campS, c, a0, r0) : null;   // fold 4: its own time moves by the round's length (a step back, back)
    toast((c.rows[t].name || 'Someone') + "'s turn" + ((S5 || seqR || ckR ? c.round > r0 : t === 0 && dir > 0) ? '. Round ' + c.round : '') + '.');
    if (S5 && typeof pick === 'string') logEvent('table', (by === 'player' ? (pkFrom && pkFrom.name) || 'Someone' : 'The GM') + ' picked ' + (c.rows[t].name || 'someone') + ' to go ' + (c.round > r0 ? 'first in round ' + c.round : 'next') + ' on ' + mapTitleOf(mapId));   // initiative O5: a pick, in the Game Record
    broadcastCombats(); if (c.round === r0 && typeof combatRefreshTurn === 'function') combatRefreshTurn(); else combatRefresh();   // 1.6.3 (the combat review, finding 26): a step within its round draws only what shows whose turn it is
    if (c.round !== r0 || c.turn !== t0 || (seqR && c.sq !== at0) || (ckR && dir > 0)) turnStarted(mapId, c);   // T2b: whoever's turn it now is (nothing when a step back at the first turn moves nothing), after the broadcast
    if (tg) ordersMoved('step', tg);   // fold 4: the round it closed counted, and the clock moved once the fight furthest behind moves on
}
// Initiative O3 (the owner's answer, "After the current turn"): the character whose turn it is holds it — play moves on as with Next turn and its row
// waits, held; later in the round, when its owner or the GM presses Act, the held row goes right after whoever is acting and keeps that place (it
// acts next). A hold not used by the round's end is lost (fightStep), and the character acts in its usual place
// 1.6.0 A hold names what sets it off (combat.turn.holdNames). The hold keeps row.holdFor, the host's own record of a line and an optional roll, whose words reach the
// GM and the holder's player and no one else, and it lasts to that row's next turn. The GM's Set off gives the row its action before the turn on hand goes on: the
// order does not change, so a row's turns stay where they were, the roll it named comes as a card, and sf lets it act off its turn until a turn moves. At its next
// turn a hold still standing clears and a card says the action was lost. Where the system's holdLost says an action is lost while a hold stands, the hold goes in
// its place and hk keeps that row's next turn at its plain count of actions. Watched at each step of the fight, and only as it comes true: a formula true as the
// row held (was) took nothing. A step back clears a hold with no card, as it runs nothing
function holdWho(camp, c, r) { var mp = camp && camp.items && own(camp.items, c.mapId) ? camp.items[c.mapId] : null, w = mp && Array.isArray(mp.whiteboard) && typeof r.tokId === 'string' ? mp.whiteboard.filter(function(x) { return !!x && x.id === r.tokId; })[0] : null, ch = w && typeof w.charId === 'string' && camp.chars && own(camp.chars, w.charId) ? camp.chars[w.charId] : null; return w ? { w: w, ch: ch, map: mp } : null; }
function holdOwner(camp, mapId, r) { var hw = holdWho(camp, { mapId: mapId }, r); return hw && hw.w.ownerId ? hw.w.ownerId : ''; }
function holdLostNow(camp, c, r) {
    var text = holdRule('holdLost'), S = typeof SC === 'function' ? SC() : null, Fh = window.wpFormula, hw = typeof text === 'string' && text ? holdWho(camp, c, r) : null; if (!hw || !hw.ch || !S || !Fh || !camp.system) return false;
    var vt = window.wpVtt, rl = function(k) { return !vt || (vt.rulesOn ? vt.rulesOn(k) : vt.on(k)); }, tc = null; try { tc = S.withRound(S.tokenCtx(hw.map, hw.w, { turning: rl('turning'), posture: rl('posture'), elevation: rl('elevation') }), c); } catch (e) { tc = null; }
    try { return S.rollNeedsOk({ needs: text }, S.makeResolver(camp.system, hw.ch, Fh, tc), Fh) === true; } catch (e) { return false; }
}
function holdLostOn(camp, c, r) { var now = holdLostNow(camp, c, r); if (r.holdFor && r.holdFor.was === 1) { if (!now) delete r.holdFor.was; return false; } return now; }
function holdSay(camp, c, r, line, step) { var hw = holdWho(camp, c, r); if (hw && hw.ch && typeof net.damageCard === 'function') net.damageCard(hw.ch, [line]); else toast((r.name || 'Someone') + ': ' + line); if (window.wpStepLog) window.wpStepLog('hold v1', step, { round: c.round }); }
function holdGoes(camp, c, r) { delete r.held; delete r.holdFor; r.hk = 1; holdSay(camp, c, r, 'The hold went in place of a lost action. The next action stays.', 'lost'); }
function holdTurn(c, t, dir, t0) {   // the turn moved to t
    var camp = campNow();
    c.rows.forEach(function(r, i) {
        if (!r) return; delete r.sf; if (i === t0 && i !== t) delete r.hk; if (!r.holdFor) return;
        if (i === t && dir < 0) { delete r.holdFor; return; }   // a correction: nothing was lost
        if (dir > 0 && holdLostOn(camp, c, r)) { holdGoes(camp, c, r); return; }
        if (i === t) { delete r.holdFor; holdSay(camp, c, r, 'Nothing set off the hold, so that action was lost.', 'lapsed'); }
    });
}
function fightSetOff(fid, rowId) {   // the GM's press
    if (net.role !== 'host' || holdRule('holdNames') !== true) return false;
    var c = orderById(fid), row = c && typeof rowId === 'string' ? c.rows.filter(function(r) { return !!r && r.id === rowId; })[0] : null; if (!row || row.held !== 1 || !row.holdFor || c.rows[c.turn] === row) return false;
    var camp = campNow(), hf = row.holdFor; if (holdLostOn(camp, c, row)) { holdGoes(camp, c, row); broadcastCombats(); combatRefresh(); return true; }
    delete row.held; delete row.holdFor; row.sf = 1; var hw = holdWho(camp, c, row), posted = !!(hf.roll && hw && hw.ch && typeof callPost === 'function' && callPost(camp, hf.roll, hw.ch, 'its hold', false));
    if (!posted) holdSay(camp, c, row, 'The hold was set off: act now, before the turn goes on.', 'set off'); else if (window.wpStepLog) window.wpStepLog('hold v1', 'set off', { round: c.round });
    toast((row.name || 'Someone') + ' acts before the turn goes on.'); logEvent('table', (row.name || 'Someone') + ' was set off from a hold on ' + mapTitleOf(c.mapId));
    broadcastCombats(); combatRefresh(); return true;
}
function fightHold(fid, by, hf) {   // by 'player': a player's own hold (fold 4: it makes no fight the one played); hf (1.6.0): what a named hold names
    if (net.role !== 'host') return false;
    var c = orderById(fid), row = c ? c.rows[c.turn] : null; if (!row) return false;
    if (chosenRule()) return false;   // initiative O5: with Next is chosen there is no hold, a pick does it
    if (holdRule('holdNames') === true) {   // 1.6.0: a named hold names something, cleaned here against the rolls its holder may see
        var campH = campNow(), SH = typeof SC === 'function' ? SC() : null, hc = SH && typeof SH.cleanHoldFor === 'function' ? SH.cleanHoldFor(by === 'player' && window.wpSheets ? window.wpSheets.playerSystem(campH) : campH && campH.system, hf) : null; if (!hc) return false;
        row.holdFor = hc; if (holdLostNow(campH, c, row)) row.holdFor.was = 1; if (window.wpStepLog) window.wpStepLog('hold v1', 'named', { roll: !!hc.roll });
    }
    row.held = 1; toast((row.name || 'Someone') + ' holds their turn.'); logEvent('table', (row.name || 'Someone') + ' held their turn on ' + mapTitleOf(c.mapId));
    fightStep(fid, 1, by);   // play moves on (it broadcasts); a hold on the round's last turn is lost at once, as fightStep clears holds at a new round
    return true;
}
function fightAct(fid, rowId) {
    if (net.role !== 'host') return false;
    var c = orderById(fid); if (!c || typeof rowId !== 'string') return false;
    if (chosenRule()) return false;   // initiative O5: no act from a hold, which would move the standing order
    if (holdRule('holdNames') === true) return false;   // 1.6.0: a named hold fires by the GM's Set off
    var i = c.rows.findIndex(function(r) { return r && r.id === rowId; }); if (i < 0 || i === c.turn || c.rows[i].held !== 1) return false;
    if (holdRule('holdAct') === 'stay') { var rowS = c.rows[i]; delete rowS.held; toast((rowS.name || 'Someone') + ' has acted from a hold.'); logEvent('table', (rowS.name || 'Someone') + ' acted from a hold on ' + mapTitleOf(c.mapId)); broadcastCombats(); combatRefresh(); return true; }   // 1.6.0: a system that keeps its order: the hold ends, and nothing moves
    var row = c.rows.splice(i, 1)[0], t = c.turn - (i < c.turn ? 1 : 0); delete row.held;
    c.rows.splice(t + 1, 0, row); c.turn = t; if (Array.isArray(c.seq)) c.seq.splice((typeof c.sq === 'number' ? c.sq : 0) + 1, 0, row.id); if (c.ck0) c.ckNext = row.id;   // 1.6.2 (G10): a turn of its own, next
    toast((row.name || 'Someone') + ' acts next.'); logEvent('table', (row.name || 'Someone') + ' acted from a hold on ' + mapTitleOf(c.mapId));
    broadcastCombats(); combatRefresh();
    return true;
}
function fightEnd(fid) {   // host: End combat, asked first; a map's other fight goes on
    var c = net.role === 'host' ? orderById(fid) : null; if (!c) return;
    var restE = fightsOn(c.mapId).length - 1;   // the other fights on that map, which go on
    showConfirm('End combat on ' + mapTitleOf(c.mapId) + '? Round ' + c.round + ', ' + c.rows.length + ' in the order. ' + (restE > 1 ? 'The other ' + restE + ' fights there go on.' : restE === 1 ? 'The other fight there goes on.' : 'The ring and the turn strip go for everyone.'), function(yes) { if (yes) fightSet(fid, null); });
}
function fightPlay(fid) {   // host: that fight is the one played (the fight tracker's press, fold 8 of the design; fold 4: a new fight starts at its time)
    if (net.role !== 'host' || !orderById(fid)) return false;
    if (net.fightOn !== fid) { net.fightOn = fid; combatRefresh(); }
    return true;
}
net.fightSet = fightSet; net.fightStep = fightStep; net.fightHold = fightHold; net.fightAct = fightAct; net.fightSetOff = fightSetOff; net.fightEnd = fightEnd; net.fightPlay = fightPlay;
// A player's app: the toasts of a new copy of the fights follow the fight that holds a token of theirs on the map on screen, else the first fight
// there. A turn or a round that moved in it is said, and "Combat is over." when the fight they followed is gone
function fightMineKey(cs, camp, mid) {
    if (!cs || typeof cs !== 'object' || !camp || typeof mid !== 'string') return null;
    var map = camp.items && Object.prototype.hasOwnProperty.call(camp.items, mid) ? camp.items[mid] : null, mine = Object.create(null), first = null, hit = null;
    (map && Array.isArray(map.whiteboard) ? map.whiteboard : []).forEach(function(w) { if (w && w.isChar && w.ownerId && w.ownerId === net.myId && typeof w.id === 'string') mine[w.id] = 1; });
    Object.keys(cs).forEach(function(k) { var c = cs[k]; if (!c || c.mapId !== mid || !Array.isArray(c.rows)) return; if (first === null) first = k; if (hit === null && c.rows.some(function(r) { return !!r && typeof r.tokId === 'string' && mine[r.tokId] === 1; })) hit = k; });
    return hit !== null ? hit : first;
}
function combatToasts(before, after) {
    var camp = getActiveCampaign(), mid = camp && camp.activeItemId, kB = fightMineKey(before, camp, mid), kA = fightMineKey(after, camp, mid);
    var cA = kA !== null ? after[kA] : null, cB = kA !== null && before && Object.prototype.hasOwnProperty.call(before, kA) ? before[kA] : null;
    if (cA && (!cB || cB.turn !== cA.turn || cB.round !== cA.round)) toast((cB ? '' : 'Combat! ') + (cA.rows[cA.turn] || {}).name + "'s turn" + ((chosenRule() ? !!cB && cB.round < cA.round : cA.round > 1 && cA.turn === 0) ? '. Round ' + cA.round : '') + '.');
    else if (kB !== null && !Object.prototype.hasOwnProperty.call(after, kB)) toast('Combat is over.');
}
// [netcheck:orders-end]
function targetersOf(itemId, mapId) {
    return Object.keys(net.targets).filter(function(pid) { var t = net.targets[pid]; return t && t.id === itemId && t.mapId === mapId; })
        .map(function(pid) { return { id: pid, name: net.targets[pid].name || 'Player', hue: playerHue(pid) }; });
}
net.targetersOf = targetersOf;
function cleanTargets(raw) {
    var out = {};
    if (raw && typeof raw === 'object') Object.keys(raw).slice(0, 64).forEach(function(pid) {
        var t = raw[pid];
        if (t && typeof t.id === 'string' && t.id.length <= 80 && typeof t.mapId === 'string' && t.mapId.length <= 80 && typeof pid === 'string' && pid.length <= 80) {
            out[pid] = { id: t.id, mapId: t.mapId, name: String(t.name || 'Player').slice(0, 40) };
            if (typeof t.from === 'string' && t.from.length <= 77 && pid === 'tk:' + t.from) out[pid].from = t.from;   // 158: one of the GM's characters, keyed by its own token
        }
    });
    return out;
}
function applyTarget(pid, name, t) {
    if (t) { net.targets[pid] = { id: t.id, mapId: t.mapId, name: name }; if (typeof t.from === 'string') net.targets[pid].from = t.from; } else delete net.targets[pid];
    render();
}
// Toggle my own target (client or host). itemName is only for the toast.
net.setTarget = function(itemId, mapId, itemName) {
    if (!net.active && !(typeof net.soloHost === 'function' && net.soloHost())) return;   // 1.6.2: with no table open the GM's own machine points as its own host (Fight without hosting)
    var me = net.myId, cur = net.targets[me];
    var next = (cur && cur.id === itemId) ? null : { id: itemId, mapId: mapId };
    if (net.role === 'client') {
        if (net.selfHeld && next) { toast(typeof HELD_WORDS === 'string' ? HELD_WORDS : 'Your character needs a new sheet first.'); return; }   // 1.6.0 (backlog 190): a held player points at nothing (a pointer of theirs may still be cleared)
        var c0 = net.conns[0];
        if (!net.foreign || !net.syncedPeer || !c0 || !c0.open || c0.peer !== net.syncedPeer) return;   // R2 security: seated only — a token of the player's own campaign, pointed at while they wait for the GM's Allow, is named to no one
        try { c0.send({ type: 'target', id: next ? itemId : null, mapId: mapId }); } catch (e) { sendFailed(e); }
        applyTarget(me, getProfile().name, next);   // show it at once; the host's broadcast confirms
    } else if (net.role === 'host') {
        applyTarget(me, getProfile().name || 'GM', next);
        broadcastTargets();
    }
    var outF = !!next && typeof fightsOn === 'function' && typeof fightOfTok === 'function' && fightsOn(mapId).length > 0 && !fightOfTok(mapId, itemId);   // 1.6.0: a fight runs here and this token is in none of it
    toast(next ? 'Targeting ' + (itemName || 'that token') + (outF ? ', who is not in the fight' : '') + '. Click it again (or press Esc) to clear.' : 'Target cleared.');
};
net.clearMyTarget = function() { var t = net.targets[net.myId]; if (t) net.setTarget(t.id, t.mapId); };
// [netcheck:targetas-start]
// 158 (the owner by prompt, 2026-10-18: "From your selected token (Recommended)"): one of the GM's characters targets, with a pointer of its
// own drawn from its token, as a player's is: keyed 'tk:' and the token's id, beside the GM's own pointer. The host's alone. Its pointer is
// nobody's while that token is hidden or gone (targetTok), and a player whose sight drops that token is not sent it (targetsFor). Targeting
// never starts or offers a fight (the owner: "we probably cant default to a fight when one player selects another")
net.setTargetAs = function(from, itemId, mapId, itemName) {
    if (!(net.active ? net.role === 'host' : (typeof net.soloHost === 'function' && net.soloHost())) || !from || typeof from.id !== 'string' || !from.id || from.id.length > 77 || typeof itemId !== 'string' || !itemId || itemId.length > 80 || itemId === from.id || typeof mapId !== 'string' || mapId.length > 80) return false;
    var key = 'tk:' + from.id, cur = Object.prototype.hasOwnProperty.call(net.targets, key) ? net.targets[key] : null, who = String(from.charName || from.name || 'Your character').slice(0, 40);
    var next = cur && cur.id === itemId && cur.mapId === mapId ? null : { id: itemId, mapId: mapId, from: from.id };
    applyTarget(key, who, next); broadcastTargets();
    var outA = !!next && typeof fightsOn === 'function' && typeof fightOfTok === 'function' && fightsOn(mapId).length > 0 && !fightOfTok(mapId, itemId);   // 1.6.0: a token outside the fight is said, as a pointer of the GM's own says it
    toast(next ? who + ' is targeting ' + (itemName || 'that token') + (outA ? ', who is not in the fight' : '') + '. Do it again to clear it.' : who + '\u2019s target is cleared.');
    return true;
};
// 1.5.9 (the owner's game of 2026-10-25, by prompt: "Both places"): the GM takes a pointer off, a player's (keyed by their profile id) or one of the
// GM's characters' ('tk:' and its token's id), from the token's right-click menu or the party strip. The host's alone; the pointers go to the
// table afresh (broadcastTargets, per recipient as ever) and the GM is told whose it was, the name set as text by the notice. A key that holds
// no pointer changes nothing and sends nothing
net.clearTargetOf = function(pid) {
    if (!(net.active ? net.role === 'host' : (typeof net.soloHost === 'function' && net.soloHost())) || typeof pid !== 'string' || !pid || pid.length > 80 || !net.targets || !Object.prototype.hasOwnProperty.call(net.targets, pid) || !net.targets[pid]) return false;
    var t = net.targets[pid], who = String((t && typeof t.name === 'string' && t.name) || 'Player').slice(0, 40);
    applyTarget(pid, who, null); broadcastTargets();
    toast(pid === net.myId ? 'Target cleared.' : who + '\u2019s target is cleared.');
    return true;
};
// What targets a token on a map, as the facing rules read it (systemcore setAimSource, registered by the sheet module): each attacker's own
// token there, a player's character or one of the GM's characters, never the token itself. Judged for a viewer on the host (a player's
// roll): only an attacker that player sees, never one the GM hid or their sight drops. With no viewer, every attacker this screen holds; on a
// player's app their copy holds only what the host sent them
function attackerTok(map, key, t) {
    var wb = map && Array.isArray(map.whiteboard) ? map.whiteboard : [];
    if (typeof t.from === 'string') return key === 'tk:' + t.from ? (wb.find(function(w) { return !!w && w.id === t.from; }) || null) : null;
    var mine = wb.filter(function(w) { return !!w && w.isChar && !w.waiting && w.ownerId === key; });
    return mine.find(function(w) { return !!w.charId; }) || mine[0] || null;
}
net.aimsOf = function(map, tok, viewer) {
    if (!net.active || !map || typeof map.id !== 'string' || !tok || typeof tok.id !== 'string') return [];
    var host = net.role === 'host', judged = host && typeof viewer === 'string' && !!viewer, camp = judged ? getActiveCampaign() : null, drop = null, out = [];
    Object.keys(net.targets || {}).forEach(function(k) {
        var t = net.targets[k]; if (!t || typeof t !== 'object' || t.id !== tok.id || t.mapId !== map.id) return;
        var a = attackerTok(map, k, t); if (!a || a === tok || !a.isChar || a.waiting) return;
        if (judged) { if (a.hidden) return; if (mapFogged(map)) { if (!drop) drop = fogDrop(camp, map, viewer) || {}; if (drop[a.id]) return; } }
        out.push(a);
    });
    return out;
};
// [netcheck:targetas-end]
// [netcheck:ally-start]
// 1.5.9 (docs/BOOK_ES_ET_PLAN.md section 3; the book: medical items are applied "to oneself or an adjacent ally"; the owner: "Apply at once", a
// menu of you and the characters next to you with your Target first, and any adjacent character, NPCs included): a roll or an apply action whose
// Applies to is the user or an adjacent character (to: 'near') may name the token it is used on. allyNear is the one reading of next to, through
// fogcore nearTokens: the map's own grid (a gridless map by a yard of its scale) and the two heights where Token elevation is on, read from the
// pieces players hold where shown is true (a judgment made for a player). allyOn is the host's one judge of the token a press names, asked by
// char-apply, roll-req and the GM's own net.diceRoll before anything is rolled or moved: a character token of the campaign on the map the user's
// token stands on, not waiting, not the user's own character, next to the user's token; for a player (pid) also shown and kept in their copy by
// the fog, every open drag at its start. { ch, tok } or { error, message }. The GM's press reaches a hidden token too
function allyNear(map, a, b, shown) {
    var C = window.wpFogCore, S = SC(); if (!C || typeof C.nearTokens !== 'function' || !map || !a || !b) return false;
    var gt = map.meta && map.meta.gridType, g = typeof C.gridFor === 'function' ? C.gridFor(gt === 'square' || gt === 'hex' ? gt : 'off', null, map.meta && map.meta.cell) : gt === 'square' ? C.squareGrid(50) : gt === 'hex' ? C.hexGrid(30, 52) : null;   // 1.6.2 (the review of containers): the map's own lattice
    var vt = window.wpVtt, el = !vt || (vt.rulesOn ? vt.rulesOn('elevation') : vt.on('elevation')), St = window.wpStance, o = { yardPx: S && typeof S.mapYardPx === 'function' ? S.mapYardPx(map) : 50 };
    if (el && St && typeof St.tokenElevation === 'function') { o.za = Number(St.tokenElevation(a, map, !!shown)) || 0; o.zb = Number(St.tokenElevation(b, map, !!shown)) || 0; }
    return C.nearTokens(a, b, g, o);
}
var ALLY_SAYS = { far: 'They must stand next to you.', missing: 'That character is not there.', self: 'That is you: use it with no one picked.', none: 'Your character has no token on this map.', kind: 'That cannot be used on someone else.', aim: 'Point at them on the map first: it goes on your target.' };
function allyNo(k) { return { error: k, message: ALLY_SAYS[k] }; }
// 1.6.2 (the builder trial's survey): Applies to the user or their target (far): the token must be the one this user's own pointer is at, on that
// map, from the host's own record of pointers and never from the message: a player's own, else for the GM's press the character's player's, the
// pointer the GM's character holds, or the GM's. Any range: its needs can read TargetDistance
function allyAimed(camp, map, userTok, tok, pid) {
    var tg = net.targets && typeof net.targets === 'object' ? net.targets : {}, uc = camp && camp.chars && typeof userTok.charId === 'string' && own(camp.chars, userTok.charId) ? camp.chars[userTok.charId] : null;
    var keys = pid ? [pid] : [uc && uc.ownerId && !uc.npc ? uc.ownerId : '', 'tk:' + userTok.id, net.myId];
    return keys.some(function(k) { var x = typeof k === 'string' && k && own(tg, k) ? tg[k] : null; return !!x && typeof x === 'object' && x.id === tok.id && x.mapId === map.id; });
}
function allyOn(camp, map, userTok, onId, pid, far) {
    if (!camp || !map || !Array.isArray(map.whiteboard) || typeof onId !== 'string' || !onId) return allyNo('missing');
    if (!userTok || typeof userTok !== 'object' || userTok.waiting || map.whiteboard.indexOf(userTok) < 0) return allyNo('none');
    var judge = function() {
        var tok = map.whiteboard.find(function(w) { return !!w && typeof w === 'object' && w.id === onId; }) || null;
        if (!tok || !tok.isChar || tok.waiting || typeof tok.charId !== 'string' || !tok.charId || !camp.chars || !own(camp.chars, tok.charId)) return allyNo('missing');
        var ch = camp.chars[tok.charId]; if (!ch || typeof ch !== 'object' || ch.making === 1) return allyNo('missing');
        if (tok === userTok || tok.charId === userTok.charId) return allyNo('self');
        if (pid) { if (tok.hidden) return allyNo('missing'); var drop = mapFogged(map) ? fogDrop(camp, map, pid) : null; if (drop && drop[tok.id]) return allyNo('missing'); }
        if (far === true ? !allyAimed(camp, map, userTok, tok, pid) : !allyNear(map, userTok, tok, !!pid)) return allyNo(far === true ? 'aim' : 'far');
        return { ch: ch, tok: tok };
    };
    return typeof fogLanded === 'function' && typeof map.id === 'string' ? fogLanded(map.id, judge) : judge();
}
// the token context a change on the character it is used on is worked out in (its pool's most, say): its own token, on the table's settings
function allyCtx(map, tok) { var S = SC(), vt = window.wpVtt, r = function(k) { return !vt || (vt.rulesOn ? vt.rulesOn(k) : vt.on(k)); }; return S && typeof S.tokenCtx === 'function' ? S.tokenCtx(map, tok, { turning: r('turning'), posture: r('posture'), elevation: r('elevation') }) : null; }
// what a press did to the character it was used on, stored as the trade stores two characters: on the host's copy, its delta, its redraw
function allyWrite(ch, values) {
    var ks = values && typeof values === 'object' ? Object.keys(values) : []; if (!ch || !ks.length) return false;
    ch.values = ch.values || {}; ks.forEach(function(k) { ch.values[k] = values[k]; }); ch.updated = Date.now();
    if (net.syncCharDelta) net.syncCharDelta(ch.id, values);
    if (window.wpSheets && window.wpSheets.charChanged) window.wpSheets.charChanged(ch.id);
    return true;
}
// its card: to whoever may see that character's figures (scope, applyScope of the target: the table, its player and the GM, or the GM alone),
// as the presser's card says the presser's. The presser's own player, where they are not among those (conn, pid), gets the same lines with no
// figure after each and a value set said as set, so they learn what moved and never a value they could not read
function allyCard(user, target, onName, label, lines, scope, from, conn, pid, hid) {   // hid (1.6.2): a roll whose figure is hidden: its card says what moved and no figure
    var rec = { type: 'apply', id: 'r_' + Math.random().toString(36).slice(2, 10), from: from, lines: applyLines(lines), ts: Date.now() };
    if (!rec.lines.length || !target) return null;
    if (label) rec.label = String(label).slice(0, 60);
    if (user && user.name) rec.as = String(user.name).slice(0, 60);
    rec.on = String(onName || target.name || 'A character').slice(0, 60);
    if (hid === true && typeof figApply === 'function') figApply(rec);
    postApply(rec, scope, target, null);
    var sees = scope === 'table' || (scope === 'owner' && !!target.ownerId && !target.npc && target.ownerId === pid);
    if (conn && !sees && net.active && net.role === 'host') {
        var bare = Object.assign({}, rec, { priv: 'gm', lines: rec.lines.map(function(l, i) { if (l.fx === 1 || l.fx === 0) return { n: l.n, fx: l.fx }; var o = hid === true || (lines[i] && lines[i].set === true) ? { n: l.n, s: 1 } : { n: l.n, d: l.d }; if (l.roll && hid !== true) o.roll = l.roll; return o; }) });
        try { conn.send(bare); } catch (e) { sendFailed(e); }
    }
    return rec;
}
net.allyCard = function(user, target, onName, label, lines, scope) { return allyCard(user, target, onName, label, lines, scope, diceFrom(getProfile(), true), null, ''); };
net.allyOn = function(camp, map, userTok, onId, far) { return allyOn(camp, map, userTok, onId, '', far === true); };   // the GM's own press (sheets.js applyAction)
net.allyCtx = allyCtx;
// the menu's choices (sheets.js allyPick): the characters next to the user's token on this screen's own copy of the map, each by its token's
// name, a character once. A player's app reads only what it was sent; the GM's screen offers a hidden token too
net.allyChoices = function(camp, map, userTok) {
    if (!map || !Array.isArray(map.whiteboard) || !userTok || typeof userTok !== 'object' || userTok.waiting) return [];
    var out = [], seen = Object.create(null), client = net.active && net.role === 'client';
    map.whiteboard.forEach(function(w) {
        if (!w || typeof w !== 'object' || !w.isChar || w.waiting || typeof w.charId !== 'string' || !w.charId || w === userTok || w.charId === userTok.charId || seen[w.charId]) return;
        if (client && w.hidden) return;
        if (!allyNear(map, userTok, w, client)) return;
        seen[w.charId] = 1; out.push({ id: w.id, charId: w.charId, name: String(w.charName || w.name || (camp && camp.chars && own(camp.chars, w.charId) && camp.chars[w.charId] ? camp.chars[w.charId].name : '') || 'A character').slice(0, 60) });
    });
    return out;
};
// [netcheck:ally-end]
// [netcheck:rangeto-start]
// Range penalties R2 (docs/RANGE_PLAN.md 3): what RangeMod and TargetDistance read in a player's roll or apply action — from their token to
// their own pointer's target on the map they are on: a character token their copy holds (never one the GM hid, nor on a fogged map one
// their sight drops), judged as their copy is, with every open drag at its start (fold M4); never their own token. null: the names read 0,
// so a roll never learns the distance to a creature its player cannot see. Their own sheet works the same out from their copy (sheets.js
// rangeFor)
function rangeTo(camp, map, mapId, tok, pid, tid) {   // tid (fold 3b): a token the roll is aimed at in place of their pointer (a pickpocket's try)
    var S = SC(); if (!S || typeof S.rangeCtx !== 'function' || !camp || !map || !tok || typeof mapId !== 'string' || typeof pid !== 'string') return null;
    var t = typeof tid === 'string' && tid ? { id: tid, mapId: mapId } : net.targets && own(net.targets, pid) ? net.targets[pid] : null; if (!t || t.mapId !== mapId || typeof t.id !== 'string') return null;
    var judge = function() {
        var w = Array.isArray(map.whiteboard) ? map.whiteboard.find(function(x) { return !!x && x.id === t.id; }) : null;
        if (!w || !w.isChar || w.hidden || w === tok) return null;
        var drop = fogDrop(camp, map, pid); if (drop && drop[w.id]) return null;
        var vt = window.wpVtt, el = !vt || (vt.rulesOn ? vt.rulesOn('elevation') : vt.on('elevation'));
        var gOf = function(t) { var St = window.wpStance; return St && St.tokenGround ? St.tokenGround(t, map, true) : 0; };   // item 19b H5: each on the ground it stands on, as the player's copy reads it (never a piece the GM hid)
        var cOf = function(t) { return t && typeof t.charId === 'string' && camp.chars && own(camp.chars, t.charId) ? camp.chars[t.charId] : null; };   // 1.6.0: TargetSize, from the target's own character
        var bdN = window.wpFog && typeof window.wpFog.bodiesOnLine === 'function' ? window.wpFog.bodiesOnLine(map, tok, w, drop) : null;   // 1.6.2: a body in the way, never one this player's copy drops
        var rc = S.rangeCtx(camp.system, map, tok, w, { F: window.wpFormula, elev: !!el, posture: !vt || !!(vt.rulesOn ? vt.rulesOn('posture') : vt.on('posture')), groundOf: gOf, charOf: cOf, bodies: bdN }); if (rc) { rc.tid = w.id; rc.mapId = mapId; }   // R3: which target
        var Fgc = window.wpFog; if (rc && Fgc && typeof Fgc.targetLight === 'function') rc.light = Fgc.targetLight(map, w);
        if (rc && Fgc && typeof Fgc.darkAt === 'function') { var dkN = Fgc.darkAt(map, camp, w); if (dkN) { rc.dk = dkN.i; rc.dkp = dkN.pen; } var adN = Fgc.darkAt(map, camp, tok); if (adN) { rc.adk = adN.i; rc.adkp = adN.pen; } }   // 1.6.2: the darkness step at the target   // 1.6.2 (the CORE session, 5a): TargetLight in any roll
        if (rc && Fgc && typeof Fgc.coverGrade === 'function') { var cvN = Fgc.coverGrade(map, camp, tok, w, true); if (cvN) { rc.cgrade = cvN; rc.cover = cvN === 3 ? 2 : 1; var cpN = typeof Fgc.coverPro === 'function' ? Fgc.coverPro(map, camp, tok, w) : 0; if (cpN) rc.cpro = cpN; } }   // 1.6.0: TargetCover and TargetCoverGrade, as the ruler reads it
        return rc;
    };
    return typeof fogLanded === 'function' ? fogLanded(mapId, judge) : judge();
}
// Range penalties R3 (docs/RANGE_PLAN.md, the owner's answer of 2026-09-29): a public roll that reads the range — RangeMod or
// TargetDistance, directly or through a value worked out from them — goes to its roller and the GM alone while another player on the
// target's map cannot see the target, so its card never tells them how far an unseen creature is. rangeReadBy: a FRESH resolver asked for
// every name the formula reads (a branch not taken counts: the card shows the text); rangeUnseen: another admitted, connected player on that
// map whose copy would not hold the target (one the GM hid, one gone, one their fogged copy drops), judged with every open drag at its start.
// rc: the token context's range ({ mod, dist, tid, mapId }); rollerPid: the roller's own profile ('' for the GM's own roll)
function rangeReadBy(S, sys, ch, F, tc, expr, row, ask) {   // ask: another flag the same resolver keeps (coverRead)
    if (!S || typeof S.makeResolver !== 'function' || !sys || !ch || !F || typeof F.names !== 'function' || typeof expr !== 'string') return false;
    var base = S.makeResolver(sys, ch, F, tc); if (!base || typeof base.rangeRead !== 'function') return false;
    var v = row ? base.row(row.f, row.r) : base; if (!v) return false;
    (F.names(expr) || []).forEach(function(n) { var nm = typeof n === 'string' ? n : (n && typeof n.name === 'string' ? n.name : ''); if (nm) { try { v(nm); } catch (e) {} } });
    return ask && typeof base[ask] === 'function' ? base[ask]() === true : base.rangeRead() === true;
}
function rangeUnseen(camp, rc, rollerPid) {
    if (!camp || !rc || typeof rc.tid !== 'string' || typeof rc.mapId !== 'string' || !camp.items || !own(camp.items, rc.mapId)) return false;
    var map = camp.items[rc.mapId];
    var judge = function() {
        var w = Array.isArray(map.whiteboard) ? map.whiteboard.find(function(x) { return !!x && x.id === rc.tid; }) : null, asked = Object.create(null);
        return Object.keys(net.roster || {}).some(function(peer) {
            var p = net.roster[peer]; if (!p || typeof p.id !== 'string' || p.id === rollerPid || asked[p.id] || p.location !== rc.mapId) return false;
            if (!(net.conns || []).some(function(c) { return c && c.peer === peer && c.open; })) return false;
            asked[p.id] = 1;
            if (!w || w.hidden) return true;
            var drop = fogDrop(camp, map, p.id); return !!(drop && drop[w.id]);
        });
    };
    return typeof fogLanded === 'function' ? fogLanded(rc.mapId, judge) : judge();
}
// Secrets (R2): an initiative card names its creature ("as <name>"), so the roster's Roll, Roll all and the every-round re-roll roll it in private
// while some admitted, connected player would read its row as Hidden in their turn order (combatsFor's own rule): the GM hid it, it is gone, or
// their fogged copy of the map drops it and they never saw it in this fight (combatSeen) — whatever map that player is on, since every player
// gets the order and the card; judged with every open drag at its start, each player asked once
net.tokUnseen = function(mapId, tokId) {
    var camp = getActiveCampaign();
    if (!camp || typeof mapId !== 'string' || typeof tokId !== 'string' || !camp.items || !own(camp.items, mapId)) return false;
    var map = camp.items[mapId];
    var judge = function() {
        var w = Array.isArray(map.whiteboard) ? map.whiteboard.find(function(x) { return !!x && x.id === tokId; }) : null, asked = Object.create(null);
        return Object.keys(net.roster || {}).some(function(peer) {
            var p = net.roster[peer]; if (!p || typeof p.id !== 'string' || asked[p.id]) return false;
            if (!(net.conns || []).some(function(c) { return c && c.peer === peer && c.open; })) return false;
            asked[p.id] = 1;
            if (typeof combatSeen === 'function' && combatSeen(fightOfTok(mapId, tokId), p.id, tokId)) return false;   // fold 2: seen in the fight that holds it
            if (!w || w.hidden) return true;
            var drop = fogDrop(camp, map, p.id); return !!(drop && drop[tokId]);
        });
    };
    return typeof fogLanded === 'function' ? fogLanded(mapId, judge) : judge();
};
// [netcheck:rangeto-end]
// [netcheck:targethit-start]
// 1.6.0 (B5, a called shot by the target's own location; the owner's handbook: "A body has only the locations its parts give it"): the location
// row a roll's roller picked on its target's sheet, judged here. The target is the token the range was read to (rc, the token context's range:
// its tid and mapId), a character token of a character of the campaign; the row one systemcore targetHitRows offers that roller (a player:
// never a row kept from players, nor one of a GM-only list). A player's figure is worked out through the players' view alone (the target as
// that view projects it); the GM's through the system, its secret() saying when a name it read gives players another figure. null: none
function targetHitIn(camp, rc, rowId, pid) {
    var S = SC(); if (!S || typeof S.targetHitFor !== 'function' || !camp || !camp.system || !rc || typeof rc.tid !== 'string' || typeof rc.mapId !== 'string' || typeof rowId !== 'string' || !camp.items || !own(camp.items, rc.mapId)) return null;
    var map = camp.items[rc.mapId], w = map && Array.isArray(map.whiteboard) ? map.whiteboard.find(function(x) { return !!x && x.id === rc.tid; }) : null;
    var tc = w && w.isChar && typeof w.charId === 'string' && camp.chars && own(camp.chars, w.charId) ? camp.chars[w.charId] : null; if (!tc) return null;
    var view = window.wpSheets && typeof window.wpSheets.playerSystem === 'function' ? window.wpSheets.playerSystem(camp) : null;
    var vtc = view && typeof S.charForView === 'function' ? S.charForView(tc, view, { lib: typeof fxLib === 'function' ? fxLib(camp.system) : undefined, items: typeof itemLib === 'function' ? itemLib(camp.system) : undefined, full: camp.system }) : null;
    if (pid && (!view || !vtc)) return null;
    return S.targetHitFor(camp.system, tc, rowId, window.wpFormula, { player: !!pid, view: view, vtc: vtc });
}
// ... and which rows a player may pick, asked before their roll (the branch hit-ask): their own pointer's target as their copy holds it, as
// their roll's range is read (rangeTo: never a token the GM hid or their sight drops), each row as its id and its name and nothing else of the
// target. null: no target, or no hit-locations list
function targetHitAsk(camp, peer, pid, charId) {
    var S = SC(); if (!S || typeof S.targetHitRows !== 'function' || typeof S.targetHitList !== 'function' || !camp || !camp.system || !S.targetHitList(camp.system) || typeof rangeTo !== 'function') return null;
    var loc = net.roster && net.roster[peer] ? net.roster[peer].location : null, map = typeof loc === 'string' && camp.items && own(camp.items, loc) ? camp.items[loc] : null; if (!map) return null;
    var rc = rangeTo(camp, map, loc, S.charTokenOn(map, charId, pid, { strict: true }), pid); if (!rc || typeof rc.tid !== 'string') return null;
    var w = Array.isArray(map.whiteboard) ? map.whiteboard.find(function(x) { return !!x && x.id === rc.tid; }) : null, tc = w && typeof w.charId === 'string' && camp.chars && own(camp.chars, w.charId) ? camp.chars[w.charId] : null;
    return tc ? { tid: rc.tid, rows: S.targetHitRows(camp.system, tc, true) } : null;
}
// A player's app: a host that answers hit-ask says so in its join snapshot (hits: true, read as true only); an older one would stay silent, so
// such a roll is rolled with no location picked, as before. net.hitRows asks the host for the rows of its own target (cb(rows), or cb(null)
// when no answer comes); one question at a time, a newer one dropping the older unanswered
var _hitsOk = false;   // (_hitAsk, the question still open, stands in net.js above the holds slice)
function hitsKnow(v) { _hitsOk = v === true; }
net.hitsOk = function() { return net.role === 'client' ? _hitsOk : true; };
net.hitRows = function(charId, cb) {
    if (typeof cb !== 'function') return false;
    if (!(net.active && net.role === 'client') || !_hitsOk || !net.foreign || !net.conns || !net.conns[0] || !net.conns[0].open || typeof charId !== 'string') { cb(null); return false; }
    if (_hitAsk) { clearTimeout(_hitAsk.timer); hitAskSet(null); }
    var rid = 'q' + Math.random().toString(36).slice(2, 10);
    hitAskSet({ rid: rid, cb: cb, timer: setTimeout(function() { if (_hitAsk && _hitAsk.rid === rid) { var c0 = _hitAsk.cb; hitAskSet(null); try { c0(null); } catch (e) {} } }, 5000) });
    try { net.conns[0].send({ type: 'hit-ask', rid: rid, charId: charId }); } catch (e) { clearTimeout(_hitAsk.timer); hitAskSet(null); cb(null); return false; }
    return true;
};
// 1.6.0 Where a hit behind cover lands: a damage roll at a target behind cover asks here, on the host, after its entry's own aim is read. A damage roll is
// the hit: nothing rolls it for a blow that missed. The pick an attack roll made is kept for its damage, which may read no location itself (coverAims, by
// character, the host's memory alone and gone with the table). The answer is systemcore coverHitFor's. A posture sets the die aside as Target.Aimed reads it:
// systemcore coverPosture, the harsher of it and cover, so a posture cover outdoes sets nothing aside. null: nothing to say
var coverAims = Object.create(null);
function coverAimForget() { coverAims = Object.create(null); }
function coverAimNote(camp, chId, rc, rowId, reads) {   // an attack roll: its pick, or none where it read the location and picked none
    var S = SC(); if (!S || typeof S.coverHitOn !== 'function' || !camp || !S.coverHitOn(camp.system)) return;
    if (rowId && rc && typeof rc.tid === 'string') coverAims[chId] = { tid: rc.tid, row: rowId }; else if (coverAims[chId] && reads()) delete coverAims[chId];
}
function coverHitIn(camp, chId, rc, rowId, alone) {   // alone (1.6.3, the review of defense fold 1): a landed attack's damage, whose location is the landing's own; it neither reads nor uses up the pick another attack of that character left
    var S = SC(), F = window.wpFormula; if (!S || typeof S.coverHitFor !== 'function' || !camp || !camp.system || !F || !S.coverHitOn(camp.system)) return null;
    var kept = alone === true ? null : coverAims[chId]; if (alone !== true) delete coverAims[chId];
    if (!rc || typeof rc.tid !== 'string' || typeof rc.mapId !== 'string' || !camp.items || !own(camp.items, rc.mapId)) return null;
    var map = camp.items[rc.mapId], w = map && Array.isArray(map.whiteboard) ? map.whiteboard.find(function(x) { return !!x && x.id === rc.tid; }) : null, tc = w && w.isChar && typeof w.charId === 'string' && camp.chars && own(camp.chars, w.charId) ? camp.chars[w.charId] : null;
    if (!tc) return null;
    var cv = S.coverHitFor(camp.system, tc, rc.cgrade, F, { aim: rowId || (kept && kept.tid === rc.tid ? kept.row : ''), aimed: typeof S.coverPosture === 'function' && S.coverPosture(camp.system, rc).aimed === 1, die: function(n) { var q = F.evaluate('1d' + n); return q && q.ok && typeof q.value === 'number' ? q.value : 1; } });
    if (cv && window.wpStepLog) window.wpStepLog('coverhit v1', 'landed', { grade: rc.cgrade, stood: cv.stood === true, die: typeof cv.d === 'number', second: typeof cv.e === 'number' });
    return cv;
}
// [netcheck:targethit-end]
// [split:body-end]
return { allyCard: allyCard, allyCtx: allyCtx, allyNear: allyNear, allyOn: allyOn, allyWrite: allyWrite, applyTarget: applyTarget, campNow: campNow, chosenRule: chosenRule, cleanTargets: cleanTargets, combatToasts: combatToasts, combatsOverAll: combatsOverAll, coverAimForget: coverAimForget, coverAimNote: coverAimNote, coverHitIn: coverHitIn, fightAct: fightAct, fightBehind: fightBehind, fightEndTime: fightEndTime, fightHold: fightHold, fightIds: fightIds, fightOfTok: fightOfTok, fightSet: fightSet, fightStep: fightStep, fightTime: fightTime, fightsOn: fightsOn, hitsKnow: hitsKnow, holdMoveCheck: holdMoveCheck, holdMoveWhy: holdMoveWhy, holdOwner: holdOwner, holdRefQ: holdRefQ, holdsBar: holdsBar, holdsGone: holdsGone, holdsMoved: holdsMoved, holdsRead: holdsRead, holdsRolled: holdsRolled, holdsSqueeze: holdsSqueeze, holdsTurnEnd: holdsTurnEnd, holdsWatch: holdsWatch, initIntoFight: initIntoFight, initRulesOf: initRulesOf, orderById: orderById, orderOfIn: orderOfIn, ordersMoved: ordersMoved, ordersOfChars: ordersOfChars, rangeReadBy: rangeReadBy, rangeTo: rangeTo, rangeUnseen: rangeUnseen, rowOnGm: rowOnGm, targetHitAsk: targetHitAsk, targetHitIn: targetHitIn, timeCore: timeCore };   // [split:glue]
}   // [split:glue]

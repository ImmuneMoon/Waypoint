/* nettime.js: a part of net.js (docs/REFACTOR_SPLIT_PLAN.md, area 2, time rules; split 2026-11-18 with no change in behavior).
   What it holds: what time does to the characters at a table, on the host. A time rules summary sent to a character's player and
   the GM (net.timeCard, and the run's one line in the GM's chat), timed effects and their clock (charCombat, fxApply, the effects'
   own clock that runs outside a fight and stops in one), and each character's own stretch of game time handed to its timed effects
   and its row timers (net.fxSpans, net.rowSpans, net.fxGameTime). The fight's own time (the orders lines) and the clock's word to the
   table (clocksync) stay in net.js.
   Why it looks this way: these lines stood in net.js, and they still run exactly where they stood. net.js calls netTime() at its line
   `// [split:nettime.js]`, so the body below runs in the old order, after everything above that line and before everything below it.
   The body keeps its lines at the left margin inside the install function, unchanged, so that every test that reads net.js (through
   tools/srcjoin.js, which puts these lines back) sees the old file. The first lines import what the body uses of net.js (live, so a
   value net.js changes later is read as it is then); the last line hands back the names net.js uses of it. Neither side may assign
   the other's names (tools/splitcheck.js holds it). Change the code here as if it still stood in net.js. Like net.js, this file is
   kept byte for byte by git (.gitattributes), with its CRLF line endings. */
// [split:of net.js]
import { SC, _fightsWait, broadcast, chatHistoryOf, fightIds, fightTime, fightsBack, fightsHold, fromHost, getActiveCampaign, logEvent, net, orderOfIn, ordersOfChars, own, peerProfileId, pushChat, saveRemoteSoon, sendFailed, severalRule } from './net.js';   // [split:glue]
export function netTime() {   // [split:glue]
// [split:body-start]
// [netcheck:fxtime-start]
// Turn-based combat T5a (D9, D10): timed effects — each row's one remaining amount (systemcore fxTick) moves on the character's own turns in a
// combat, stops while a combat runs and starts again at its end, and runs by the clock outside combat (this machine checks every few seconds:
// the GM's own, hosting or alone). What runs out comes off, with a line for its player and the GM. Item 20 K4 (the owner's answer): with the
// Calendar on, time outside a fight runs by the game clock instead — the check only stops a clock still running (what ran is kept), and each
// move of the game clock on (never back) takes that much from every timed effect outside a fight (net.fxGameTime); switched off, they run again
function charCombat(camp, charId) {   // the combat a character's token is in, and its map id — or null; fold 2: as the one judge says (net.orderOf)
    var fid = orderOfIn(camp, charId); return fid ? { mapId: net.combats[fid].mapId, combat: net.combats[fid] } : null;
}
net.charInCombat = function(charId) { return !!(net.active && charCombat(getActiveCampaign(), charId)); };
function fxApply(camp, ch, kind, now, secs, at) {   // one tick of one character: its lists stored and sent, what ran out told (secs: the game clock's move, K4)
    var S = SC(); if (!S || !S.fxTick || !camp || !camp.system || !ch) return;
    var r = S.fxTick(camp.system, ch, kind, typeof at === 'number' ? at : now, secs), ids = Object.keys(r.values); if (!ids.length) return;
    ch.values = ch.values || {}; ids.forEach(function(fid) { ch.values[fid] = r.values[fid]; }); ch.updated = now;
    saveRemoteSoon();
    if (net.active && net.role === 'host') net.syncCharDelta(ch.id, r.values);
    if (window.wpSheets && typeof window.wpSheets.fxRanOut === 'function' && Array.isArray(r.gone) && r.gone.length) window.wpSheets.fxRanOut(ch.id, r.gone);   // 1.6.2: what ran out runs its end as one that ran out
    if (window.wpSheets) window.wpSheets.charChanged(ch.id);
    r.expired.forEach(function(nm) { fxEnded(ch, nm); });
}
function fxEnded(ch, name) {   // "Bless ran out on Pat." — a private line for the GM, and one for its player at the table
    var text = String(name).slice(0, 60) + ' ran out on ' + String(ch.name || 'a character').slice(0, 60) + '.', from = { id: net.myId || 'gm', name: 'GM', gm: true }, m = { type: 'chat', scope: 'whisper', from: from, text: text, ts: Date.now() };
    if (net.active && net.role === 'host' && ch.ownerId && !ch.npc) net.conns.forEach(function(c) { if (c.open && net.roster[c.peer] && peerProfileId(c) === ch.ownerId) { try { c.send(m); } catch (e) { sendFailed(e); } } });
    pushChat(m);
}
// [netcheck:timecard-start]
// Item 20 K5: a time rules summary (sheets.js runTimeRules) — a private line for the GM, and one for the character's player at the table unless it
// is the GM's alone (an NPC, or a rule that moves or reads what the player cannot see); and the Game Record's Time
net.timeCard = function(ch, text, gmOnly, opts) {   // opts (backlog 173): player, what its player is told (a rule set Panel only, players never told, left out; empty: nothing); gmChat false, the GM's chat gets the run's one line instead
    if (net.role === 'client' || net.stream || !ch || typeof ch !== 'object') return;
    var t = String(text || '').slice(0, 1500), m = { type: 'chat', scope: 'whisper', from: { id: net.myId || 'gm', name: 'GM', gm: true }, text: t, ts: Date.now(), kind: 'time' };   // 1.5.6: kind time, so a player's app shows it as they chose (timeNote)
    var po = opts && typeof opts === 'object' && typeof opts.player === 'string' ? opts.player.slice(0, 1500) : t, mP = po === t ? m : Object.assign({}, m, { text: po });
    if (!gmOnly && po && net.active && net.role === 'host' && ch.ownerId && !ch.npc) net.conns.forEach(function(c) { if (c.open && net.roster[c.peer] && peerProfileId(c) === ch.ownerId) { try { c.send(mP); } catch (e) { sendFailed(e); } } });
    if (!(opts && typeof opts === 'object' && opts.gmChat === false)) if (typeof timeNote === 'function') timeNote(m); else pushChat(m);   // 1.5.6: the GM's own chat by the GM's own Time rule notes choice
    logEvent('time', t);   // the Game Record keeps every line whatever the chat shows
};
// [netcheck:timecard-end]
// [netcheck:timenote-start]
// 1.5.6, backlog 173 (the owner, 2026-10-24: "notify the player privately, with the option of them turning off these notifications, or change
// how often they come in"): on a player's app a time rule's note from the GM (kind time) reaches chat as this player chose in Settings
// (wp_timeNotes): every time as ever; gathered, one note holding every line since the last, every 10 minutes or every hour; or off, none. The
// rules run on the GM's machine whatever this says. What waits is let go when the table ends; a change of the choice says what waits at once
var _timeBuf = [], _timeTimer = null;
function timeNotesMode() { try { var v = localStorage.getItem('wp_timeNotes'); return v === '10m' || v === '1h' || v === 'off' ? v : 'all'; } catch (e) { return 'all'; } }
function timeFlush() {
    if (_timeTimer) { clearTimeout(_timeTimer); _timeTimer = null; }
    if (!_timeBuf.length) return;
    var lines = _timeBuf.splice(0, _timeBuf.length), first = lines[0];
    if (first.fromHost && !(net.active && net.role === 'client')) return;   // a player's table ended: what waited goes with it (the GM's own notes run with no table too)
    var text = lines.length === 1 ? first.text : ('Time rules, ' + lines.length + ' notes:\n' + lines.map(function(m) { return m.text; }).join('\n'));
    var outT = { type: 'chat', scope: 'whisper', from: first.from, text: text.slice(0, 2000), ts: Date.now() }; if (first.fromHost) outT.toName = '';
    pushChat(outT);
}
function timeNote(m) {
    var mode = timeNotesMode();
    if (mode === 'off') return;
    if (mode === 'all') { pushChat(m); return; }
    if (_timeBuf.length >= 200) _timeBuf.shift();
    _timeBuf.push(net.role === 'client' ? Object.assign({}, m, { fromHost: true }) : m);
    if (!_timeTimer) _timeTimer = setTimeout(timeFlush, mode === '1h' ? 3600000 : 600000);
}
// Backlog 173: the GM's one chat line a run of the time rules, with Open (timepanel.js draws it): a whisper of the GM's own, so no player and no
// join's history ever holds it; the GM's own Time rule notes choice of Off posts none
net.timeRunLine = function(run) {
    if (net.role === 'client' || net.stream || !run || typeof run !== 'object' || timeNotesMode() === 'off') return false;
    pushChat({ type: 'chat', scope: 'whisper', from: { id: net.myId || 'gm', name: 'GM', gm: true }, text: String(run.text || '').slice(0, 300), ts: Date.now(), kind: 'time', trun: { id: String(run.id || '').slice(0, 40), sub: String(run.sub || '').slice(0, 200) } });
    return true;
};
net.timeNotesNow = function() { var mode = timeNotesMode(); if (mode === 'off') { _timeBuf.length = 0; if (_timeTimer) { clearTimeout(_timeTimer); _timeTimer = null; } } else timeFlush(); };
// [netcheck:timenote-end]
// Backlog 29: a tracker reached its end. Each machine that sees the tracker says it for itself (trackers.js), so the line is this machine's
// own: a whisper, which no join's history holds (chatHistoryOf), never sent. None in the stream window
// 1.6.2 (backlog 147): a name the name button made, put in this computer's chat: a whisper of its own, never sent and in no join's history
net.nameLine = function(text) {
    if (net.stream || typeof text !== 'string' || !text) return false;
    pushChat({ type: 'chat', scope: 'whisper', from: { id: 'names', name: 'Name' }, text: text.slice(0, 60), ts: Date.now(), trk: true });
    return true;
};
// 1.6.2 (backlog 138 (j) fold R2): a rest called and ended is told to the table as a line of the host's own; nothing a player sends calls or ends one
net.restLine = function(text) {
    if (!net.active || net.role !== 'host' || net.stream || typeof text !== 'string' || !text) return false;
    var msgR = { type: 'chat', scope: 'global', from: { id: net.myId, name: 'Rest', gm: true }, text: text.slice(0, 200), ts: Date.now() };
    broadcast(msgR); pushChat(msgR); return true;
};
net.trackerLine = function(text) {
    if (net.stream || typeof text !== 'string' || !text) return false;
    pushChat({ type: 'chat', scope: 'whisper', from: { id: 'tracker', name: 'Tracker' }, text: text.slice(0, 200), ts: Date.now(), trk: true });
    return true;
};
function fxCombatChars(mapId, combat) { var camp = getActiveCampaign(); if (!camp || !camp.system) return []; var S = SC(), mp = camp && camp.items && own(camp.items, mapId) ? camp.items[mapId] : null; return S && S.combatChars && mp ? S.combatChars(mp, combat, camp.chars || {}).map(function(e) { return camp.chars[e.charId]; }).filter(Boolean) : []; }
function turnFxStart(mapId, c) {   // the character whose turn begins: a round of its timed effects passes, once in each round of that fight (fold 3: c.turned, so two rows of one sheet count once)
    var camp = getActiveCampaign(), row = c && Array.isArray(c.rows) ? c.rows[c.turn] : null; if (!camp || !row) return;
    var tn = c.turned && typeof c.turned === 'object' ? c.turned : (c.turned = Object.create(null)), rd = typeof c.round === 'number' ? c.round : 1;
    var fxEach = !!(c.seq && typeof severalRule === 'function' && severalRule(camp) && severalRule(camp).fx === 'turn');   // 1.6.2 (G10): Timed effects, Each of its turns
    fxCombatChars(mapId, { rows: [row] }).forEach(function(ch) { if (typeof ch.id === 'string') { if (!fxEach && Object.prototype.hasOwnProperty.call(tn, ch.id) && tn[ch.id] >= rd) return; tn[ch.id] = rd; } fxApply(camp, ch, 'turn', Date.now()); });
}
// 1.6.0 Counts at its turn's end: the character whose turn ended, in the round it ended: a round passes for its effects set so, once in each round of that fight (c.fxEnded, { charId: round }, the host's own and never sent, as turned is)
function turnFxEnd(mapId, c, row, round) {
    var camp = getActiveCampaign(); if (!camp || !c || !row) return;
    var tn = c.fxEnded && typeof c.fxEnded === 'object' ? c.fxEnded : (c.fxEnded = Object.create(null)), rd = typeof round === 'number' ? round : 1;
    var fxEachE = !!(c.seq && typeof severalRule === 'function' && severalRule(camp) && severalRule(camp).fx === 'turn'); fxCombatChars(mapId, { rows: [row] }).forEach(function(ch) { if (typeof ch.id !== 'string') return; if (!fxEachE && Object.prototype.hasOwnProperty.call(tn, ch.id) && tn[ch.id] >= rd) return; tn[ch.id] = rd; fxApply(camp, ch, 'turnEnd', Date.now()); });
}
function fxCombatEdge(mapId, combat, kind) { var camp = getActiveCampaign(), now = Date.now(); if (kind === 'bank' && !net._fxStop) net._fxStop = now; fxCombatChars(mapId, combat).forEach(function(ch) { fxApply(camp, ch, kind, now); }); }   // bank at a combat's start, resume at its end
function fxClockTick() {   // out of combat: the clock, on the GM's own machine
    if (typeof net.charBatch === 'function' && !net.charBatching() && net.role !== 'client' && !net.stream) return net.charBatch(fxClockTick);   // 1.6.3 (the combat review, finding 6): one batch, so each character changed is sent and drawn once at its end
    if (net.role === 'client' || net.stream || (window.wpVtt && !window.wpVtt.on('sheets'))) return;
    var camp = getActiveCampaign(), now = Date.now(); if (!camp || !camp.system || !camp.chars) return;
    var byGame = !!(window.wpVtt && window.wpVtt.on('calendar')), inF = typeof ordersOfChars === 'function' ? ordersOfChars(camp) : null, fights = (typeof fightIds === 'function' && fightIds().length > 0) || (typeof _fightsWait !== 'undefined' && _fightsWait && !!camp.fights);   // 1.6.2: a fight held through the GM's reload (fightsHold, before its fightsBack) runs still, so no real seconds come off a fighter's effects in the gap. K4: the Calendar on — real time never counts outside a fight; 152 fold 4: nor while any fight runs, when everyone in no fight follows the second (net.fxSpans)
    if (byGame || fights) { if (!net._fxStop) net._fxStop = now; } else net._fxStop = 0;   // 1.6.0: when real time stopped counting. A timer begun since loses no real seconds at the bank, or a one-round effect on someone in no fight ran out at the next tick (found live)
    Object.keys(camp.chars).forEach(function(id) { if (inF ? inF[id] : charCombat(camp, id)) return; if (byGame || fights) fxApply(camp, camp.chars[id], 'bank', now, undefined, net._fxStop); else { fxApply(camp, camp.chars[id], 'resume', now); fxApply(camp, camp.chars[id], 'clock', now); } });
}
// 152 fold 4 (docs/FIGHT_CLOCK_DESIGN.md 6): each character's own span of game time as calendar.js ownTime counts it, { charId: seconds }: the timed effects
// of a character in no fight run that much, the Calendar on or off. One in a fight is passed over: its effects follow its turns (turnFxStart). walk (true
// only): the gap lived by those who walk into a fight that is ahead (fightTime), which the fight holds by then, though the gap was lived before it. Its
// effects run it too, so each span is counted once for the time rules and the timed effects alike
net.fxSpans = function(spans, walk) {
    if (net.role === 'client' || net.stream || !spans || typeof spans !== 'object' || (window.wpVtt && !window.wpVtt.on('sheets'))) return;
    var camp = getActiveCampaign(), now = Date.now(); if (!camp || !camp.system || !camp.chars) return;
    var inF = typeof ordersOfChars === 'function' ? ordersOfChars(camp) : null;
    Object.keys(spans).forEach(function(id) { var s = spans[id]; if (!own(camp.chars, id) || typeof s !== 'number' || !isFinite(s) || !(s > 0) || (walk !== true && (inF ? inF[id] : charCombat(camp, id)))) return; fxApply(camp, camp.chars[id], 'game', now, s); });
};
// 1.6.0 Counts by the game clock: each character's own span of game time (calendar.js ownTime, a fight's rounds too) on its rows' timed counters
// (systemcore rowTimers); perOf, a step's length in seconds on the campaign's calendar. Stored on the GM's machine; sent and drawn only where a
// count moved (the part of a step lived is the GM's alone). A count down that reached 0 is told to the GM, and to its player unless it is a row
// they may not see
net.rowSpans = function(spans, perOf, fight) {   // fight (1.6.2): the stretch is a fight's, so an upkeep's rate out of a fight pays nothing
    if (net.role === 'client' || net.stream || !spans || typeof spans !== 'object' || typeof perOf !== 'function' || (window.wpVtt && !window.wpVtt.on('sheets'))) return;
    var camp = getActiveCampaign(), S = SC(), now = Date.now(); if (!camp || !camp.system || !camp.chars || !S || !S.rowTimers) return;
    Object.keys(spans).forEach(function(id) {
        var s = spans[id], ch = own(camp.chars, id) ? camp.chars[id] : null; if (!ch || typeof s !== 'number' || !isFinite(s) || !(s > 0)) return;
        var r; try { r = S.rowTimers(camp.system, ch, s, perOf, window.wpFormula, fight === true); } catch (e) { if (window.wpStepLog) window.wpStepLog('rowtimer v1', 'failed', { at: 'tick', secs: Math.round(s) }); throw e; }
        var ids = Object.keys(r.values); if (!ids.length) return;
        ch.values = ch.values || {}; ids.forEach(function(fid) { ch.values[fid] = r.values[fid]; });
        saveRemoteSoon();
        if (r.moved.length) { var mv = {}; r.moved.forEach(function(fid) { mv[fid] = ch.values[fid]; }); ch.updated = now; if (net.active && net.role === 'host') net.syncCharDelta(ch.id, mv); if (window.wpSheets) window.wpSheets.charChanged(ch.id); }
        r.ended.forEach(function(e) { rowEnded(ch, e); });
        if (r.upkeepSaid && typeof net.timeCard === 'function' && S.upkeepWords) { var upG = S.upkeepWords(r.upkeepSaid, undefined, ch.name), upP = S.upkeepWords(r.upkeepSaid, true, ch.name); if (upG) net.timeCard(ch, upG, !upP, upP && upP !== upG ? { player: upP } : undefined); }   // 205 follow-up (3): what a row switched on paid by the clock, said as a time rule's summary: the GM's whole, its player's the rows they may see
        if (r.upkeep && window.wpStepLog) window.wpStepLog('upkeep v1', 'paid', { when: 'clock', paid: r.upkeep.paid, off: r.upkeep.off.length, secs: Math.round(s) });   // 1.6.0 (CORE gap 13): an upkeep paid by the clock
        if (r.ended.length && window.wpStepLog) window.wpStepLog('rowtimer v1', 'ended', { rows: r.ended.length, lists: r.moved.length, secs: Math.round(s), sent: !!(net.active && net.role === 'host') });
    });
};
function rowEnded(ch, e) {   // "Bread on Pat: Spoiled." — a private line for the GM, and one for its player at the table unless the row is theirs not to see
    var who = String(ch.name || 'a character').slice(0, 60), text = String(e.name).slice(0, 60) + ' on ' + who + ': ' + (e.word ? String(e.word).slice(0, 60) : String(e.label).slice(0, 60) + ' ran out') + '.', m = { type: 'chat', scope: 'whisper', from: { id: net.myId || 'gm', name: 'GM', gm: true }, text: text, ts: Date.now() };
    if (!e.gm && net.active && net.role === 'host' && ch.ownerId && !ch.npc) net.conns.forEach(function(c) { if (c.open && net.roster[c.peer] && peerProfileId(c) === ch.ownerId) { try { c.send(m); } catch (x) { sendFailed(x); } } });
    pushChat(m);
}
net.fxGameTime = function(secs) {   // K4: the game clock moved on secs seconds: every timed effect outside a fight runs that much (152 fold 4: as one span for every character, through net.fxSpans)
    if (net.role === 'client' || net.stream || typeof secs !== 'number' || !isFinite(secs) || !(secs > 0) || (window.wpVtt && (!window.wpVtt.on('sheets') || !window.wpVtt.on('calendar')))) return;
    var camp = getActiveCampaign(); if (!camp || !camp.system || !camp.chars) return;
    var sp = {}; Object.keys(camp.chars).forEach(function(id) { sp[id] = secs; }); net.fxSpans(sp);
};
var _fxClock = null;
function fxClockStart() { if (!_fxClock && typeof setInterval === 'function') _fxClock = setInterval(function() { try { fxClockTick(); } catch (e) {} }, 5000); }
// [netcheck:fxtime-end]
// [split:body-end]
return { charCombat: charCombat, fxClockStart: fxClockStart, fxClockTick: fxClockTick, fxCombatChars: fxCombatChars, fxCombatEdge: fxCombatEdge, fxEnded: fxEnded, timeNote: timeNote, turnFxEnd: turnFxEnd, turnFxStart: turnFxStart };   // [split:glue]
}   // [split:glue]

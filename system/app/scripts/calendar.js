/* Game calendar (1.5.0, backlog item 20) — the DOM half: the campaign's clock in the header (a chip with the date and time) and the
   Calendar window (the period in view as a grid of days by the week, the steps that move time on, a day and a time to set the clock
   to, whether players see the date). World time lives on the campaign (camp.clock: { t, hide?, hold?, rate? }); the pure half (calendarcore.js)
   turns it into a date by the system's calendar. While fights run it reads the fight furthest behind (backlog 152: net.js ordersMoved hands each
   character's own time to ownTime and the second to second()). A player's app shows the clock the host sends (net.js 'clock'), read-only, and a player may hide it for themselves (the
   Calendar feature's own per-player switch). Every text reaches the page as a text node or a value. Design of record:
   docs/CALENDAR_PLAN.md. */
import { getActiveCampaign } from './models.js';
import { showConfirm } from './dialogs.js';   // backlog 138 (j) fold R3: a record is removed after a question
import { save, saveView, toast } from './io.js';
import { roundSecs, needsHeld, chainsShallow, setDateSource } from './systemcore.js';
import { cleanRestLog } from './calendarcore.js';   // backlog 138 (j) fold R3
import { cleanEras, eraOf, noteNext, noteOn, viewCal, calNamesOf, fmtIn, fmtDateIn, cleanCalendar, cleanClock, cleanAcc, ruleFires, everySecs, fightSecs, livedSpans, freshAcc, tCmp, tSpanMs, dateOf, timeOf, periodDays, dayLength, fmtDate, fmtWhen, fmtSpan, CAL_LIMITS, moonPhases, seasonOf, PHASES } from './calendarcore.js';

function net() { return window.wpNet || null; }
function sysNow() { var sh = window.wpSheets; return sh && sh.systemOf ? sh.systemOf() : null; }
// [sinkcheck:calendarwin-start]
var restMode = false, restPick = 'active', pend = null, pendQ = [];   // item 20 K5: time moved on as Rest (else Active), the time rules waiting for the GM's word; 159: time moved on while a list waited
// What waits belongs to the campaign it was counted in (the owed review, 2026-10-09): a list of time rules due and the live time counted behind
// it carried into the next campaign opened, whose own rules then ran for hours that never passed there. Asked before either is read or added to
// (152 fold 4: a fight's rounds no longer wait for its end, so nothing of them waits here). With another campaign on screen they are PUT ASIDE for their own, and are back when it is: letting them
// go lost a list, with its counts, when another campaign was merely looked at (the review of that fix). What is kept is bounded
var pendCamp = '', pendKept = Object.create(null), PEND_KEEP = 40;
function pendFor(camp) {
    var id = camp && typeof camp.id === 'string' ? camp.id : '';
    if (id === pendCamp) return;
    if (pendCamp) {
        delete pendKept[pendCamp];
        if (pend || livePend > 0 || pendQ.length) { pendKept[pendCamp] = { pend: pend, live: livePend, q: pendQ }; var ksP = Object.keys(pendKept); if (ksP.length > PEND_KEEP) delete pendKept[ksP[0]]; }
    }
    var kP = id && pendKept[id] ? pendKept[id] : null;
    pend = kP ? kP.pend : null; livePend = kP ? kP.live : 0; pendQ = kP && Array.isArray(kP.q) ? kP.q : [];
    if (id) delete pendKept[id];
    pendCamp = id;
}
var view = null, pick = null, winSig = '', winCamp = '', winBase = '', winDay = -1;   // the window's period in view ({ yi, period }, or { page } with no periods), the day picked (a day number from 0) or null, what it last drew and for which campaign
function sysCal() { var s = sysNow(); return s && s.calendar ? s.calendar : null; }
function isPlayer() { var n = net(); return !!(n && n.foreign); }
function clockOn() { var n = net(); if (n && n.stream) return false; return !!(window.wpVtt && window.wpVtt.on('calendar')); }
function clockOf(camp) { return camp ? cleanClock(camp.clock) : null; }
function tOf(camp) { var c = clockOf(camp); return c ? c.t : 0; }
function shown(camp) { return !!camp && clockOn() && (!isPlayer() || !!clockOf(camp)); }   // a player's app holds a clock only while the host sends one
function cel(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
function cbtn(cls, text, title, act) { var b = cel('button', 'tool ghost ' + cls, text); b.type = 'button'; if (title) b.title = title; if (act) b.dataset.act = act; return b; }
// The period the clock is in, and a step to the one before or after it (years go on past the last; nothing before the first)
function viewOf(cal, t) { var d = dateOf(cal, t); return d.period < 0 ? { page: Math.floor(d.day / 28) } : { yi: d.yi, period: d.period }; }
function stepView(cal, v, dir) {
    if (v && typeof v.page === 'number') return { page: Math.max(0, v.page + (dir < 0 ? -1 : 1)) };
    var cc = cleanCalendar(cal), n = cc && cc.periods ? cc.periods.length : 0; if (!n || !v) return v;
    var p = v.period + (dir < 0 ? -1 : 1), yi = v.yi;
    if (p < 0) { if (yi <= 0) return v; yi--; p = n - 1; } else if (p >= n) { yi++; p = 0; }
    return { yi: yi, period: p };
}
// The period in view as a grid: { title, heads (the week's names), cols, cells: [{ day, n, today?, picked?, notes? } or null for a blank before
// day 1] }; nd (K3): how many notes each day holds, by day number
function gridOf(cal, v, t, pk, nd) {
    var cc = cleanCalendar(cal) || {}, dl = dayLength(cc), today = Math.floor(t / dl), wk = cc.week || [], out = { title: '', heads: [], cols: 7, cells: [] }, d0, len;
    if (!v) return out;
    if (typeof v.page === 'number') { d0 = v.page * 28; len = 28; out.title = 'Days ' + (d0 + 1) + '\u2013' + (d0 + 28); }
    else {
        var t0 = timeOf(cc, { yi: v.yi, period: v.period, pday: 1 }); if (t0 === null) return out;
        var dd = dateOf(cc, t0); d0 = Math.floor(t0 / dl); len = periodDays(cc, dd.year, v.period);
        out.title = cc.periods[v.period].name + ', ' + dd.year + (cc.era ? ' ' + cc.era : '');
    }
    if (wk.length) { out.cols = wk.length; out.heads = wk.slice(); for (var i = dateOf(cc, d0 * dl).weekday; i > 0; i--) out.cells.push(null); }
    if (typeof nd === 'function') nd = nd(d0, len);   // 1.6.2 (backlog 166 b): the notes of the days in view, yearly ones on each day they fall on
    for (var k = 0; k < len; k++) { var c = { day: d0 + k, n: typeof v.page === 'number' ? d0 + k + 1 : k + 1 }; if (d0 + k === today) c.today = true; if (d0 + k === pk) c.picked = true; if (nd && nd[d0 + k]) c.notes = nd[d0 + k]; if ((cc.moons || []).length) c.moons = moonPhases(cc, (d0 + k) * dl); out.cells.push(c); }   // 1.6.2 (backlog 147): each moon's phase that day
    return out;
}
// The steps that move time on, by the calendar's own day ({ label, secs }), and what an amount can count in ({ id, name, secs }): the
// minute, hour, day and week of the calendar, then the system's own time units (Combat tab: a watch)
function stepsOf(cal) {
    var cc = cleanCalendar(cal) || {}, S = cc.seconds || 60, M = cc.minutes || 60, dl = dayLength(cc), wk = cc.week ? cc.week.length : 0;
    var out = [{ label: '+1 minute', secs: S }, { label: '+10 minutes', secs: 10 * S }, { label: '+1 hour', secs: M * S }, { label: '+1 day', secs: dl }];
    if (wk) out.push({ label: '+1 week', secs: wk * dl });
    return out;
}
function unitsOf(cal, sys) {
    var cc = cleanCalendar(cal) || {}, S = cc.seconds || 60, M = cc.minutes || 60, dl = dayLength(cc), wk = cc.week ? cc.week.length : 0;
    var out = [{ id: 'min', name: 'minutes', secs: S }, { id: 'hour', name: 'hours', secs: M * S }, { id: 'day', name: 'days', secs: dl }];
    if (wk) out.push({ id: 'week', name: 'weeks', secs: wk * dl });
    var tu = sys && sys.combat && sys.combat.turn && Array.isArray(sys.combat.turn.units) ? sys.combat.turn.units : [];
    tu.forEach(function(u, i) { if (u && typeof u.secs === 'number' && isFinite(u.secs) && u.secs > 0 && typeof u.key === 'string') out.push({ id: 'u' + i, name: typeof u.label === 'string' && u.label ? u.label : u.key, secs: u.secs }); });
    return out;
}
// Item 20 K3: the clock's dated notes (in day order: cleanClock keeps them so), how many each day holds, the next ones, a new note's id,
// and the notes a move of the clock reaches: those whose day it steps into, forward only (moving back and on again reaches them again)
function notesOf(ck) { return ck && Array.isArray(ck.notes) ? ck.notes : []; }
function noteDays(notes, cal, d0, d1) { var m = Object.create(null), yr = typeof d0 === 'number' && typeof d1 === 'number'; notes.forEach(function(n) {   // 1.6.2 (backlog 166 b): with a range, a yearly note on each day it falls on there
    if (!yr || n.yearly !== true) { m[n.day] = (m[n.day] || 0) + 1; return; }
    for (var D = noteNext(cal, n, d0), k = 0; D >= 0 && D <= d1 && k < 400; D = noteNext(cal, n, D + 1), k++) m[D] = (m[D] || 0) + 1;
}); return m; }
function newNoteId() { var s = ''; while (s.length < 8) s += 'abcdefghijklmnopqrstuvwxyz0123456789'.charAt(Math.floor(Math.random() * 36)); return 'n_' + s; }
function notesReached(notes, t0, t1, dl, cal) { if (!(t1 > t0) || !(dl > 0)) return []; var d0 = Math.floor(t0 / dl), d1 = Math.floor(t1 / dl); return notes.filter(function(n) { if (n.yearly === true && cal) { var D = noteNext(cal, n, d0 + 1); return D > d0 && D <= d1; } return n.day > d0 && n.day <= d1; }); }   // 1.6.2 (backlog 166 b): a yearly note on any day it falls on
function winBaseOf(camp, ck, cal) { return camp.id + '|' + (ck.hide ? 1 : 0) + '|' + (liveHold(ck) ? 1 : 0) + '|' + liveRate(ck) + '|' + (isPlayer() ? '' : liveHeld(camp)) + '|' + (pend ? 1 : 0) + '|' + JSON.stringify(notesOf(ck)) + '|' + JSON.stringify(ck.eras || null) + '|' + JSON.stringify(cleanCalendar(cal)); }   // all the window shows but the time of day
function winSigOf(camp, ck, cal) { return winBaseOf(camp, ck, cal) + '|' + ck.t; }
// Item 20 K5 (the owner's answers of 2026-09-30): the time rules — rolls and apply actions that also run every so often by this clock. Rest adds
// up per character and rule, activity breaks it (calendarcore ruleFires); the steps and any amount run them as Rest or Active, a Set forward
// always asks (the GM's choice). What is due waits in the window: players' characters ticked, NPCs offered; Apply runs the ticked ones on this
// machine (sheets.js runTimeRules), Skip lets the time pass; either way what each rule has counted is kept (camp.clock.acc, the GM's own)
// K5b: the table's word on the time rules (Settings \u25b8 This campaign \u25b8 Calendar: camp.turnRules.time) — 'auto' (the default since 1.5.5:
// the rules run at once; a Set forward still asks), 'confirm' (the GM says), 'off' (none run and nothing is counted); a paused
// table runs none. 159 (the owner, 2026-10-18, of the list Ask me left at the table: "the effects should run unless i pause time. unless some
// gms might want this level of control?"): Run at once is the default, so a campaign with no word of its own runs them; Ask me is stored.
// 152 (the owner's answer, "Every character"): under Run at once an NPC's rules run as time passes, as a player's do, its summary to the GM alone
function timeMode(camp) { var t = camp && camp.turnRules && typeof camp.turnRules === 'object' ? camp.turnRules.time : ''; return t === 'confirm' || t === 'off' ? t : 'auto'; }
function tablePaused() { var n = net(); return !!(n && n.active && n.paused); }
function isPc(ch) { return !!ch && ch.npc !== true && typeof ch.ownerId === 'string' && !!ch.ownerId; }
function clockRules(sys) { return sys && Array.isArray(sys.rolls) ? sys.rolls.filter(function(r) { return r && (r.every || r.inFight); }) : []; }   // 152: By the clock, In a fight, or both
function sysUnits(sys) { return sys && sys.combat && sys.combat.turn && Array.isArray(sys.combat.turn.units) ? sys.combat.turn.units : []; }
function commitAcc(acc, live) {   // live (1.5.4): the clock ran by itself — written quietly, and not at all when the counts did not move
    var camp = getActiveCampaign(); if (!camp || isPlayer()) return;
    var ck = clockOf(camp) || { t: 0 }, nc = Object.assign({}, ck), a = cleanAcc(acc);
    if (live === true && JSON.stringify(a) === JSON.stringify(ck.acc || null)) return;
    if (a) nc.acc = a; else delete nc.acc; camp.clock = nc; if (live === true) saveView(); else save();
}
// Backlog 152 (the fight clock, docs/FIGHT_CLOCK_DESIGN.md sections 1, 5 and 6): EACH CHARACTER'S OWN TIME, counted in ONE place. A stretch of time
// comes as a group { kind, ids, t0, t1 } (times as whole seconds or calendarcore's pairs): 'clock', the clock moved with no fight running (a step,
// Move, a Set, the clock running by itself: moveTo); 'fight', a round a fight closed or the round it ended in, for its fighters (net.js ordersMoved,
// with the round, its length rs and its words, "Round 3 on Docks"); 'out', the second moving on while fights run, for everyone in no fight, and
// those who walk into a fight that is ahead of the second. Each character's span is worked out here alone, through calendarcore livedSpans: it
// lives what it has not lived yet, so a step back and on again, a fight that ran ahead or one sheet in two fights counts each second once. The marks
// are the clock's own (camp.clock.lived and top: saved, the GM's own, never sent), or, with the Calendar off while fights run (net.second's frame
// 'mem'), this machine's memory alone, let go when the last fight ends: no clock would ever reach them. Each span then goes to the timed effects
// (net.fxSpans; never a fight's, whose effects follow its turns) and to the time rules (groupRules). Under Off or a paused table the marks still
// rise, so lifting either counts nothing twice
var memT = null;   // the 'mem' frame: { camp, t: the second, whole; top: the highest second reached, a pair, or null; lived }, begun from the clock's own top and marks
function frameOf() { var n = net(); return n && n.second && n.second.frame === 'mem' ? 'mem' : 'clock'; }
function memOf(camp) {   // a character ahead of the clock (a fight that ran ahead, or the Calendar switched off while fights run) lives nothing twice in memory either
    var n = net(); if (memT && memT.camp === camp.id) return memT;
    var ck = clockOf(camp) || { t: 0 }; memT = { camp: camp.id, t: n && n.second && typeof n.second.s === 'number' ? n.second.s : ck.t, top: ck.top || null, lived: ck.lived ? JSON.parse(JSON.stringify(ck.lived)) : {} };
    return memT;
}
function hasOwn(o, k) { return !!o && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k); }
function charIdsOf(camp) { return camp && camp.chars && typeof camp.chars === 'object' ? Object.keys(camp.chars) : []; }
function ordersRun() { var n = net(); return !!(n && n.active && n.role === 'host' && n.combats && typeof n.combats === 'object' && Object.keys(n.combats).some(function(k) { return !!n.combats[k]; })); }   // a fight runs at this table
function spansOf(camp, g) {   // each character's span of a group, its mark moved on: before the clock moves, so a character is judged against the clock as it was
    var r;
    if (frameOf() === 'mem') { var m = memOf(camp); r = livedSpans(m.lived, m.top && tCmp(m.top, m.t) > 0 ? m.top : m.t, g.ids, g.t0, g.t1); m.lived = r.lived; return r.spans; }
    var ck = clockOf(camp) || { t: 0 }, nc = Object.assign({}, ck); r = livedSpans(ck.lived, ck.top || ck.t, g.ids, g.t0, g.t1);
    if (Object.keys(r.lived).length) nc.lived = r.lived; else delete nc.lived;
    if (JSON.stringify(nc.lived || null) !== JSON.stringify(ck.lived || null)) { camp.clock = cleanClock(nc) || { t: ck.t }; g.marked = true; }
    return r.spans;
}
function uniformOf(spans) { var v = null, ok = true; Object.keys(spans).forEach(function(k) { if (v === null) v = spans[k]; else if (spans[k] !== v) ok = false; }); return ok ? v : null; }
function evenSpans(camp, s) { var o = {}; charIdsOf(camp).forEach(function(id) { o[id] = s; }); return o; }
function ownTime(groups) {   // the one counter: each group's spans, once, to the timed effects and the time rules; true where a list was made
    var camp = getActiveCampaign(); pendFor(camp); if (!camp || isPlayer() || !Array.isArray(groups)) return false;
    var sys = sysNow(), n = net(), made = false, marked = false;
    groups.forEach(function(g0) {
        if (!g0 || typeof g0 !== 'object' || !Array.isArray(g0.ids)) return;
        var g = Object.assign({}, g0); g.kind = g.kind === 'fight' || g.kind === 'out' ? g.kind : 'clock';
        if (g.kind === 'fight') g.rest = false; else if (g.kind === 'out') g.rest = restMode && !ordersRun();   // 1.5.7: no rest while a fight runs   // a fight is activity; outside one, time passes as the window says (settled 16)
        if (typeof g.secs !== 'number') g.secs = Math.max(0, tSpanMs(g.t0, g.t1) / 1000);
        var spans = g.spans && typeof g.spans === 'object' ? g.spans : null; if (!spans) { g.marked = false; spans = spansOf(camp, g); if (g.marked) marked = true; }   // a move of the clock hands its spans in, and writes them with the clock
        if (!Object.keys(spans).length) return;
        g.held = needsAt(camp, sys, g, spans);   // 1.5.5: the needs of the rules ticked Only while its needs hold, judged as the stretch is counted, before its timed effects run
        if (g.kind !== 'fight' && n && typeof n.fxSpans === 'function') { try { n.fxSpans(spans, g.walk === true); } catch (e) { console.error(e); } }
        if (n && typeof n.rowSpans === 'function' && g.inOnly !== true) { try { n.rowSpans(spans, function(p) { return everySecs(sysCal(), sysUnits(sys), p); }, g.kind === 'fight'); } catch (e) { console.error(e); } }   // 1.6.0 Counts by the game clock: a row's timed counters live every stretch, a fight's rounds too   // section 6: outside a fight its timed effects follow its own time; in one, its turns. walk: those who walk into a fight live the gap before it
        if (groupRules(camp, sys, g, spans)) made = true;
    });
    if (marked && frameOf() === 'clock') saveView();   // a fight that runs ahead moves no clock: its people's marks are written quietly
    return made;
}
// fireOut (section 5): a fire runs at once or waits for the GM's word. It waits where its stretch is a Set forward, where Time rules is Ask me and the
// stretch is no fight's (a fight's run at each round, with no list: brief 7, "At each turn"), and where its rule is ticked Ask me first (ask). The rules
// that run at once are counted, run and kept now, whether or not a list waits, for every character (152, the owner's answer: "Every character"; an
// NPC's summary to the GM alone), but an NPC whose rules the GM switched off (camp.clock.rulesOff, the Rules run switch) has its fires listed,
// unticked, in a fight or out of one. The rules asked for are counted into the list, or, while one waits, queued behind it and counted once it is
// answered: the list keeps only their counts, never taking back a count the others made since (keepAsked). With the Calendar off In a fight alone
// counts, in a fight, and no list waits: there is no window to answer it in. An NPC's whose rules are off is then counted and never run, and a rule
// ticked Ask me first is counted and its runs wait in the bell for the GM's word (fold 4b, bellUp; the owner's answer of 2026-10-20: "In the bell").
// only: a stretch that waited, counted now for the rules it asked for alone
function groupRules(camp, sys, g, spans, only) {
    var mode = timeMode(camp), fight = g.kind === 'fight', cal = clockOn(); if (!sys || mode === 'off' || tablePaused() || (!fight && !cal)) return false;
    var rules = clockRules(sys); if (!cal || (fight && g.inOnly === true)) rules = rules.filter(function(r) { return !!r.inFight; }).map(function(r) { var m = { id: r.id, label: r.label, inFight: r.inFight }; if (r.ask === true) m.ask = true; return m; });   // By the clock needs the Calendar, as it always has
    if (!rules.length || !Object.keys(spans).length) return false;
    var asks = function(r) { return g.ask === true || (mode === 'confirm' && !fight) || r.ask === true; };
    var now = only ? [] : rules.filter(function(r) { return !asks(r); }), later = only ? rules.filter(function(r) { return only === true || only.indexOf(r.id) >= 0; }) : rules.filter(asks);
    var off = offOf(camp), list = [], asked = null, rd = function(f) { if (fight && f.x === 1 && typeof g.round === 'number') f.rd = g.round; return f; };
    if (now.length) {
        var before = accNow(camp), rn = firesOf(camp, sys, now, g, spans), go = [];   // 176: before, the counts the stretch began from, for when each run came due
        commitAcc(rn.acc, g.live === true); heldFollow(now, rn.acc);
        rn.fires.forEach(function(f) { rd(f); if (!off(f.c)) go.push(f); else if (cal) list.push(f); });
        if (go.length && window.wpSheets && window.wpSheets.runTimeRules) { var backs = []; window.wpSheets.runTimeRules(go, groupWords(g), fight && typeof g.round === 'number' ? { round: g.round } : undefined, backTo(backs), whenOf(sys, now, before, g)); heldBack(camp, sys, backs, true, g.live === true); }   // 1.5.5's review: a run held back keeps its time, or spends it after another count's run in this go (heldBack)
    }
    if (later.length && !cal) { var rx = firesOf(camp, sys, later, g, spans); commitAcc(rx.acc, g.live === true); heldFollow(later, rx.acc); if (rx.fires.length) bellUp(camp, sys, rx.fires.map(rd), groupWords(g)); }   // the Calendar off: counted, and its runs wait in the bell for the GM's word (fold 4b)
    else if (later.length && pend) queueStretch(camp, g, spans, later, rules);   // 159: a list waits for the GM's word, and this time is judged once it is answered
    else if (later.length) {
        var rl = firesOf(camp, sys, later, g, spans);
        if (!rl.fires.length) commitAcc(rl.acc, g.live === true);
        else { rl.fires.forEach(function(f) { list.push(rd(f)); }); asked = { acc: rl.acc, keys: keysOf(later), ids: Object.keys(spans) }; }
    }
    return list.length ? listUp(camp, g, list, asked) : false;
}
// [calendarcheck:whenof-start]
// 176 (the owner, 2026-10-28, by prompt: "Hour by hour (Recommended)"): when each run of a fire came due, in seconds into its stretch, so that
// sheets.js runTimeRules runs one character's rules in the order their runs came due and one long step gives what many short ones give. A count's
// first run comes due when it reaches its period from what it held before the stretch (before), each next one a period later. A count ticked Only
// while its needs hold is read in its own counted time, the time its needs held. null for a fire whose period cannot be read
function whenOf(sys, rules, before, g) {
    var cal = sysCal(), un = sysUnits(sys), rs = g && typeof g.rs === 'number' && g.rs > 0 ? g.rs : roundSecs(sys), b = before && typeof before === 'object' ? before : {};
    return function(fi) {
        if (!fi || typeof fi.c !== 'string' || typeof fi.r !== 'string' || !(typeof fi.n === 'number' && fi.n >= 1)) return null;
        var rl = (Array.isArray(rules) ? rules : []).filter(function(r) { return r && r.id === fi.r; })[0]; if (!rl) return null;
        var fx = fi.x === 1, k = fx ? 'x_' + fi.r.slice(2) : fi.r, per = fx ? fightSecs(cal, un, rl.inFight, rs) : everySecs(cal, un, rl.every); if (!(per > 0)) return null;
        var m = hasOwn(b, fi.c) && b[fi.c] && typeof b[fi.c] === 'object' ? b[fi.c] : {}, had = hasOwn(m, k) && typeof m[k] === 'number' && m[k] > 0 ? m[k] : 0, out = [];
        for (var i = 0; i < Math.min(500, Math.floor(fi.n)); i++) out.push(Math.round((per - had + i * per) * 1000) / 1000);
        return out;
    };
}
// [calendarcheck:whenof-end]
function firesOf(camp, sys, rules, g, spans) {   // the fires of these rules over each character's span; outside a fight with every span the same, as it always counted
    var acc = accNow(camp), ids = Object.keys(spans), one = uniformOf(spans), need = needOf(g, spans), res;   // 1.5.5: need, undefined with no rule ticked Only while its needs hold
    if (g.kind !== 'fight' && one !== null) res = need ? ruleFires(sysCal(), sysUnits(sys), rules, ids, acc, one, !!g.rest, undefined, need) : ruleFires(sysCal(), sysUnits(sys), rules, ids, acc, one, !!g.rest);
    else { var o8 = { fight: g.kind === 'fight', rs: typeof g.rs === 'number' && g.rs > 0 ? g.rs : roundSecs(sys) }; res = need ? ruleFires(sysCal(), sysUnits(sys), rules, ids, acc, spans, !!g.rest, o8, need) : ruleFires(sysCal(), sysUnits(sys), rules, ids, acc, spans, !!g.rest, o8); }
    if (need && g.pieces) dueOn(sys, rules, acc, res.fires, g);   // 1.5.5's review: where each run of a ticked count came due
    return res;
}
// 1.5.5 (the owner, 2026-10-23: "everything needs to be accounted for, no shortcuts"): a rule's By the clock or In a fight ticked Only while its needs
// hold (whileNeeds) counts only the part of each stretch in which the rule's needs hold for the character (calendarcore ruleFires' need). Each stretch
// is judged as it is counted (ownTime, before its timed effects run): a step, Move or Set as the character stands when the GM moves the clock on, and
// so at the stretch's start; a minute the clock ran by itself, a fight's round and the time outside a fight while fights run as the character stands
// when that minute or round is counted, which is when its runs are made, so a count and its runs read the character alike (to one round, or one bank
// of the running clock). A stretch counts whole or not at all, but outside a fight one is judged again at each moment within it that a timed effect of
// the character runs out (systemcore needsHeld). 1.5.5's review (a draw counted while a nap held its needs was lost, since the nap ran out before the
// run was made): a run is made as its character stood where it came due, with the timed effects it had there (dueOn, timeRuleRun's opt.due); a fire
// whose first run its needs hold back all the same (a change made before a list is answered, time judged when it was lived) gives its runs' time back
// to its count, so they come due again and nothing counted is lost, unless a run of another of its character's counts was made before it in the same
// go (one runTimeRules: the rules run at once in a stretch, one Apply of the list, one bell item), when it does nothing and its time is spent (the
// owner, 2026-10-23, by prompt: "Spent, nothing done"); and a fire run at once whose own runs make its needs fail stops there, its count at none,
// since the time after its last run was not time they held (heldBack). No second counts twice.
// needsAt: { charId: { count key: seconds its needs held } } for each count ticked so that counts in this stretch (as groupRules counts: a count that
// does not count here is not judged), each judged with the sheet's own resolver as the rule's run reads it; null where no rule is ticked, and every
// count is then as it was. With no formula engine at hand a ticked count holds for none of the stretch, as a needs formula that cannot be worked out does.
// Outside a fight it also keeps each character's pieces of the stretch (g.pieces: needsHeld's keep), where its runs come due
var HELD_ID = /^[a-z]_[A-Za-z0-9_]{1,24}$/;
function needsAt(camp, sys, g, spans) {
    var rules = clockRules(sys).filter(function(r) { return (r.every && r.every.whileNeeds === true) || (r.inFight && r.inFight.whileNeeds === true); }); if (!rules.length) return null;
    var fight = g.kind === 'fight', cal = clockOn(), asks = [], out = {}, pieces = {};
    if (timeMode(camp) !== 'off' && !tablePaused() && (fight || cal)) rules.forEach(function(r) {
        if (cal && r.every && r.every.whileNeeds === true && !(r.every.rest === true && !g.rest) && !(fight && r.every.wait === true)) asks.push({ key: r.id, rule: r, fight: false });
        if (fight && r.inFight && r.inFight.whileNeeds === true) asks.push({ key: 'x_' + r.id.slice(2), rule: r, fight: true });
    });
    var Fm = typeof window !== 'undefined' && window.wpFormula ? window.wpFormula : null, judge = asks.length > 0 && !!Fm && typeof needsHeld === 'function', flat = false;
    if (judge) { try { flat = typeof chainsShallow === 'function' && chainsShallow(sys, Fm) === true; } catch (e) { flat = false; } }   // a lazy resolver only where any resolver answers alike, as runTimeRules shares one
    var o = { round: fight && typeof g.round === 'number' ? g.round : undefined, split: !fight, flat: flat, now: Date.now() };   // in a fight a character's timed effects follow its turns: no moment within a round is judged apart
    Object.keys(spans).forEach(function(c) {
        if (!HELD_ID.test(c)) return;
        var h = {}, ch = hasOwn(camp.chars, c) ? camp.chars[c] : null, keep = fight ? null : []; asks.forEach(function(a) { h[a.key] = 0; });
        if (judge && ch && typeof ch === 'object') { try { var r = needsHeld(sys, ch, asks, Fm, spans[c], keep ? Object.assign({ keep: keep }, o) : o); asks.forEach(function(a) { if (hasOwn(r, a.key) && typeof r[a.key] === 'number') h[a.key] = r[a.key]; }); if (keep && keep.length) pieces[c] = keep; } catch (e) { console.error(e); } }
        out[c] = h;
    });
    if (Object.keys(pieces).length) g.pieces = pieces;
    return out;
}
// The need ruleFires asks of a ticked count: what needsAt judged for this stretch (g.held: a count it did not judge holds for none of it), or, for time that
// waited behind a list, what was judged when it was lived (g.gap: the seconds each ticked count's needs held for each character judged; a character it
// never judged, one made since, holds for none of it, and a count a judged character's entry does not name, a rule ticked since, counts whole). With
// neither: undefined, and ruleFires counts exactly as it always did
function needOf(g, spans) {
    var key = function(rl, fx) { return fx ? 'x_' + rl.id.slice(2) : rl.id; };
    if (g.held && typeof g.held === 'object') return function(c, rl, fx) { var h = hasOwn(g.held, c) ? g.held[c] : null, k = key(rl, fx); return h && hasOwn(h, k) && typeof h[k] === 'number' ? h[k] : 0; };
    if (g.gap && typeof g.gap === 'object') return function(c, rl, fx) { var z = hasOwn(g.gap, c) ? g.gap[c] : null, k = key(rl, fx); if (!z || typeof z !== 'object') return 0; if (!hasOwn(z, k) || typeof z[k] !== 'number') return true; return Math.max(0, z[k]); };
    return undefined;
}
// What a stretch kept behind a list (queueStretch) carries of needsAt's judgement for the rules asked for: for each character it judged, the seconds each
// ticked count it judged held. Summed, each part as it was judged, when two stretches run on as one (joinStretch), so it stays exact. null: no judgement
function gapOf(g, spans, later) {
    if (!g.held || typeof g.held !== 'object') return null;
    var z = {};
    Object.keys(spans).forEach(function(c) {
        var h = hasOwn(g.held, c) ? g.held[c] : null, m = {}; if (!h || typeof h !== 'object') return;
        later.forEach(function(r) { [r.id, 'x_' + r.id.slice(2)].forEach(function(k) { if (hasOwn(h, k) && typeof h[k] === 'number') m[k] = h[k]; }); });
        z[c] = m;
    });
    return z;
}
// 1.5.5's review: where each run of a fire of a By the clock count ticked Only while its needs hold came due, outside a fight: the piece of the stretch
// (g.pieces) in which the time its needs held reached that run's period, counted on from what the count held (acc, as ruleFires was handed it). Each
// fire so carries due, [{ n, fx }] in run order: n runs made with fx, the character's timed effects in that piece, a copy (sheets.js runTimeRules,
// systemcore timeRuleRun). Its other values are as they stand when the run is made, and a fight's round has no such moment: its effects follow its turns
var DUE_EPS = 0.0005;
function dueOn(sys, rules, acc, fires, g) {
    if (!g.pieces || typeof g.pieces !== 'object' || typeof everySecs !== 'function' || !Array.isArray(fires)) return;
    var cal = sysCal(), un = sysUnits(sys);
    fires.forEach(function(f) {
        if (!f || f.x === 1 || typeof f.c !== 'string' || !(typeof f.n === 'number' && f.n >= 1)) return;
        var rl = rules.filter(function(r) { return r && r.id === f.r; })[0]; if (!rl || !rl.every || rl.every.whileNeeds !== true) return;
        var ps = hasOwn(g.pieces, f.c) && Array.isArray(g.pieces[f.c]) ? g.pieces[f.c] : null, per = everySecs(cal, un, rl.every); if (!ps || !ps.length || !(per > 0)) return;
        var mine = hasOwn(acc, f.c) && acc[f.c] && typeof acc[f.c] === 'object' ? acc[f.c] : null, had = mine && typeof mine[rl.id] === 'number' && mine[rl.id] > 0 ? mine[rl.id] : 0;
        var held = function(p) { return !!p && !!p.ok && p.ok[rl.id] === true && p.len > 0; }, last = -1; ps.forEach(function(p, i) { if (held(p)) last = i; }); if (last < 0) return;
        var parts = [], i = 0, cum = 0;
        for (var j = 1; j <= Math.min(500, f.n); j++) {
            var at = j * per - had;   // the time its needs held, within this stretch, when run j came due
            while (i < ps.length && !(held(ps[i]) && cum + ps[i].len >= at - DUE_EPS)) { if (held(ps[i])) cum += ps[i].len; i++; }
            var k = i < ps.length ? i : last, top = parts.length ? parts[parts.length - 1] : null;
            if (top && top.p === k) top.n++; else parts.push({ p: k, n: 1 });
        }
        f.due = parts.map(function(d) { return { n: d.n, fx: JSON.parse(JSON.stringify(ps[d.p].fx || {})) }; });
    });
}
// Two fires of one count joined in a waiting list (listUp) keep where each of their runs came due, in order, up to the 500 runs a fire makes: a fire with
// no due has its runs made as its character stands when they are made
function dueJoin(a, b) {
    var out = [], left = 500;
    [a, b].forEach(function(f) { (Array.isArray(f.due) ? f.due : [{ n: f.n, fx: null }]).forEach(function(d) { if (left <= 0 || !d || typeof d.n !== 'number' || !(d.n >= 1)) return; var k = Math.min(left, Math.floor(d.n)); out.push({ n: k, fx: d.fx || null }); left -= k; }); });
    return out;
}
// What runTimeRules is told of each fire it runs (its fourth argument): kept in order, for heldBack
function backTo(list) { return function(fi, ran, held) { list.push({ fi: fi, ran: typeof ran === 'number' ? ran : 0, held: held === true }); }; }
// 1.5.5's review: a fire of a count ticked Only while its needs hold that its needs held back. Its time was counted while they held, so where its first
// run was held back (and no run of that count was made before it in the same go: those would have been its own) its runs go back to the count, n
// periods on what it holds now, and come due again the next time it counts on, unless a run of ANOTHER count of its character was made before it in the
// same go: then its time is spent, nothing goes back and the count stays as ruleFires (a fire run at once) or keepAsked (a list) left it, so a period
// lived while its needs held is gone and its run did nothing (the owner, 2026-10-23, by prompt: "Spent, nothing done": where two recoveries come due at
// the same moment and the first fills the pool, the second restores nothing and its time is not kept for later). Where its own runs made its needs fail
// part way, the time after its last run was not time they held: fresh (a fire run at once, its count this very stretch's) leaves the count at none;
// otherwise (a list or the bell answered later, while the count may have counted on) the count stands as it is. A list's own counts follow, as
// heldFollow keeps them. live: as commitAcc's.
// A go is one call of runTimeRules, whose backs this is: the rules run at once in one stretch (groupRules), one Apply of the list (pendDone) or one bell
// item (bellDone). An earlier entry of backs is a run made before this one in it: calendarcore ruleFires walks each character's rules in the order it
// is handed them, clockRules(sys), which is the order of the System editor's Rolls tab (sys.rolls), a rule's By the clock count before its In a fight
// count, so the rules run at once go in the system's order; sheets.js runTimeRules runs each character's fires in the order it is handed them, all of
// one fire's runs before the next fire's, so in one long step a later rule's runs are all made after an earlier rule's; a waiting list keeps its fires
// in the order they were first listed (listUp: a fire of a count already listed joins it in its place), which is the system's order only for what one
// stretch listed; and the rules that wait for the GM's word (Ask me, Ask me first, an NPC switched off) run in a go of their own, after those that ran
// at once, so a run made at once is never a run before them. The bell runs an item's runs, one count's, as they came due.
function heldBack(camp, sys, backs, fresh, live) {
    if (!camp || !sys || !Array.isArray(backs) || !backs.length || typeof everySecs !== 'function' || typeof fightSecs !== 'function') return false;
    var rules = clockRules(sys), cal = sysCal(), un = sysUnits(sys), ck = clockOf(camp) || { t: 0 }, acc = JSON.parse(JSON.stringify(ck.acc || {})), ran = Object.create(null), by = Object.create(null), ask = heldOf(camp), moved = false;
    backs.forEach(function(b) {
        var fi = b && b.fi; if (!fi || typeof fi.c !== 'string' || !HELD_ID.test(fi.c) || typeof fi.r !== 'string' || !(typeof fi.n === 'number' && fi.n >= 1)) return;
        var fx = fi.x === 1, k = fx ? 'x_' + fi.r.slice(2) : fi.r, sk = fi.c + ' ' + k, own = b.ran > 0 || ran[sk] === 1, mine = by[fi.c] || (by[fi.c] = []);
        var other = mine.some(function(x) { return x !== k; });   // a run of another count of this character made before it in this go, ticked or not: a rule's id or x_ and its tail, so the same rule's other count is another
        if (b.ran > 0) { ran[sk] = 1; if (mine.indexOf(k) < 0) mine.push(k); }
        var rl = rules.filter(function(r) { return r.id === fi.r; })[0], pc = rl ? (fx ? rl.inFight : rl.every) : null; if (!pc || pc.whileNeeds !== true) return;
        if (b.held !== true || (own && fresh !== true)) return;
        if (!own && other) return;   // 1.5.5 (the owner, 2026-10-23: "Spent, nothing done"): its first run held back after another count's run in this go did nothing, and its time is spent
        var per = fx ? fightSecs(cal, un, rl.inFight, roundSecs(sys)) : everySecs(cal, un, rl.every); if (!own && !(per > 0)) return;
        var put = function(o) {
            var m = hasOwn(o, fi.c) && o[fi.c] && typeof o[fi.c] === 'object' ? o[fi.c] : (o[fi.c] = {}), cur = hasOwn(m, k) && typeof m[k] === 'number' && m[k] > 0 ? m[k] : 0;
            var nx = own ? 0 : Math.round((cur + Math.min(500, Math.floor(fi.n)) * per) * 1000) / 1000;
            if (nx > 0) m[k] = nx; else delete m[k]; if (!Object.keys(m).length) delete o[fi.c];
        };
        put(acc); moved = true;
        if (ask && pend.keys.indexOf(k) >= 0 && Array.isArray(pend.ids) && pend.ids.indexOf(fi.c) >= 0) put(pend.acc);
    });
    if (moved) commitAcc(acc, live === true);
    return moved;
}
// What each rule has counted, as the next stretch counts on from it: the clock's counts, with those a waiting list holds for the rules it asked for laid
// over them, so a rule asked for in one stretch and run at once in another (a Set, then a step; a list of Ask me, then a fight) never counts the same
// time twice. A rule counted at once while a list waits moves the list's own count with it (heldFollow): Apply or Skip then keeps what was counted
function layAsked(acc, p) {
    (Array.isArray(p.ids) ? p.ids : []).forEach(function(c) {
        p.keys.forEach(function(k) { var v = hasOwn(p.acc, c) && hasOwn(p.acc[c], k) ? p.acc[c][k] : undefined; if (v === undefined) { if (hasOwn(acc, c)) delete acc[c][k]; } else { if (!hasOwn(acc, c)) acc[c] = {}; acc[c][k] = v; } });
        if (hasOwn(acc, c) && !Object.keys(acc[c]).length) delete acc[c];
    });
    return acc;
}
function heldOf(camp) { return !!pend && !!pend.acc && Array.isArray(pend.keys) && pend.keys.length > 0 && pend.camp === (camp && camp.id); }
function accNow(camp) { var ck = clockOf(camp) || { t: 0 }, cur = ck.acc ? JSON.parse(JSON.stringify(ck.acc)) : {}; return heldOf(camp) ? layAsked(cur, pend) : cur; }
function heldFollow(rules, acc) {
    if (!heldOf(getActiveCampaign())) return;
    var ks = keysOf(rules).filter(function(k) { return pend.keys.indexOf(k) >= 0; }); if (!ks.length) return;
    pend.ids.forEach(function(c) { ks.forEach(function(k) { var v = hasOwn(acc, c) && hasOwn(acc[c], k) ? acc[c][k] : undefined; if (v === undefined) { if (hasOwn(pend.acc, c)) delete pend.acc[c][k]; } else { if (!hasOwn(pend.acc, c)) pend.acc[c] = {}; pend.acc[c][k] = v; } }); });
}
function keysOf(rules) { var ks = []; rules.forEach(function(r) { ks.push(r.id, 'x_' + r.id.slice(2)); }); return ks; }   // a rule's two counts: By the clock (its id) and In a fight (x_ and its tail)
function offOf(camp) {   // the GM's Rules run switch, off (camp.clock.rulesOff): an NPC's alone, by the sheet's own NPC tick as rulesRun reads it, so a player's character, or one with no player yet, is never held by it
    var ck = clockOf(camp), set = Object.create(null); (ck && Array.isArray(ck.rulesOff) ? ck.rulesOff : []).forEach(function(id) { set[id] = 1; });
    return function(c) { var ch = hasOwn(camp.chars, c) ? camp.chars[c] : null; return set[c] === 1 && !!ch && typeof ch === 'object' && ch.npc === true; };
}
function groupWords(g) { return typeof g.words === 'string' && g.words ? g.words : spanWords(sysCal(), g.secs, g.rest, g.live); }
var PEND_FIRES = 2000;
function listUp(camp, g, fires, asked) {   // fires for the GM to answer: a list of their own, or, while one waits, joined to it (their counts are kept already)
    var on = Object.create(null); fires.forEach(function(f) { on[f.c] = isPc(hasOwn(camp.chars, f.c) ? camp.chars[f.c] : null); });
    if (pend) {
        fires.forEach(function(f) { var same = pend.fires.filter(function(x) { return x.c === f.c && x.r === f.r && (x.x === 1) === (f.x === 1); })[0]; if (same) { if (same.due || f.due) same.due = dueJoin(same, f); same.n = Math.min(500, same.n + f.n); } else if (pend.fires.length < PEND_FIRES) pend.fires.push(f); if (!hasOwn(pend.on, f.c)) pend.on[f.c] = on[f.c]; });   // 1.5.5's review: where each run came due, joined
        if (winOpen()) renderWin(); refresh(); return false;
    }
    pend = { secs: g.secs, rest: !!g.rest, fires: fires, acc: asked ? asked.acc : null, keys: asked ? asked.keys : [], ids: asked ? asked.ids : [], on: on, camp: camp.id };
    if (g.live === true) pend.live = true; if (g.kind !== 'clock') pend.words = groupWords(g);
    if (typeof window !== 'undefined' && window.wpNotices) window.wpNotices.wait('time', 'Time rules are due: ' + pendWords(sysCal()) + '.', 'time', null);   // 160: in the bell's list until it is answered
    if ((g.live === true || ordersRun()) && !winOpen()) { refresh(); toast('Time rules are due: press the date in the top row to apply or skip them.'); return true; }   // never a window opened under the GM's hands, nor while a fight runs
    if (!winOpen()) openWin(); else renderWin();
    return true;
}
// 159 (the owner, 2026-10-18: the steps were greyed while a list waited, so the clock could not be moved at the table): the steps, Move and
// Set never wait. The time they move while a list waits is kept here, in order, and judged once the list is answered (pendDone), as the
// clock's own running time is (livePend); a stretch like the one before it runs on as one, and at most PEND_Q are kept, the rest joining the last.
// 152: only the rules asked for are kept (k, where not every rule is), with a fight's kind, round and round's length, its words and each character's
// own span (c, where they differ, or not every character lives it); with none of these a stretch is kept exactly as before
var PEND_Q = 200;
function queueStretch(camp, g, spans, later, rules) {
    var ids = Object.keys(spans), one = uniformOf(spans), even = one !== null && one === g.secs && ids.length === charIdsOf(camp).length;
    var q = { s: g.secs, r: !!g.rest, a: g.ask === true, l: g.live === true };
    if (g.kind !== 'clock') q.g = g.kind; if (typeof g.round === 'number') q.n = g.round; if (g.kind === 'fight' && typeof g.rs === 'number') q.rs = g.rs; if (g.kind !== 'clock') q.w = groupWords(g);
    if (later.length !== rules.length) q.k = later.map(function(r) { return r.id; });
    if (!even) q.c = Object.assign({}, spans);
    var zq = gapOf(g, spans, later); if (zq) q.z = zq;   // 1.5.5: what of it the needs of a rule ticked Only while its needs hold held, for each character judged now
    if (q.l && Object.keys(q).length === 4) { livePend += q.s; sinceSync(); return; }   // the clock's own minutes, said under the list as they pass
    var last = pendQ.length ? pendQ[pendQ.length - 1] : null;
    if (last && (pendQ.length >= PEND_Q || sameShape(last, q))) joinStretch(camp, last, q); else pendQ.push(q);
    sinceSync();
}
function sameShape(a, b) { return a.r === b.r && a.a === b.a && a.l === b.l && a.g === b.g && a.rs === b.rs && JSON.stringify(a.k || null) === JSON.stringify(b.k || null) && !a.c === !b.c && !a.z === !b.z; }
function joinStretch(camp, a, b) {   // b runs on from a: their seconds summed (each character's own, where either has them), b's round and words the latest
    if (a.z || b.z) {   // 1.5.5: what each ticked count held, summed, each part as it was judged: none for a character a part never judged, the whole of its own span for a part that judged nothing or a count it did not name
        var spanIn = function(x, id) { return x.c ? (hasOwn(x.c, id) && typeof x.c[id] === 'number' ? x.c[id] : 0) : x.s; };
        var part = function(x, id, k) { if (!x.z || typeof x.z !== 'object') return spanIn(x, id); var e = hasOwn(x.z, id) ? x.z[id] : null; if (!e || typeof e !== 'object') return 0; return hasOwn(e, k) && typeof e[k] === 'number' ? e[k] : spanIn(x, id); };
        var zz = {}; [a.z, b.z].forEach(function(z) { if (z && typeof z === 'object') Object.keys(z).forEach(function(id) { if (!HELD_ID.test(id) || !z[id] || typeof z[id] !== 'object') return; var m = hasOwn(zz, id) ? zz[id] : (zz[id] = {}); Object.keys(z[id]).forEach(function(k) { if (HELD_ID.test(k) && !hasOwn(m, k)) m[k] = Math.round((part(a, id, k) + part(b, id, k)) * 1000) / 1000; }); }); });
        a.z = zz;
    }
    if (a.c || b.c) { var ac = a.c || evenSpans(camp, a.s), bc = b.c || evenSpans(camp, b.s), out = {}; Object.keys(ac).concat(Object.keys(bc)).forEach(function(id) { if (!hasOwn(out, id)) out[id] = Math.round(((hasOwn(ac, id) ? ac[id] : 0) + (hasOwn(bc, id) ? bc[id] : 0)) * 1000) / 1000; }); a.c = out; }
    a.s = Math.round((a.s + b.s) * 1000) / 1000; if (hasOwn(b, 'n')) a.n = b.n; if (hasOwn(b, 'w')) a.w = b.w;
}
function qGroup(q) { var g = { kind: q.g === 'fight' || q.g === 'out' ? q.g : 'clock', secs: q.s, rest: q.r === true, ask: q.a === true, live: q.l === true, round: q.n, rs: q.rs, words: q.w }; if (q.z && typeof q.z === 'object') g.gap = q.z; return g; }   // 1.5.5: gap, as judged when it was lived
function keepAsked(camp, p) {   // a list answered: the counts of the rules it asked for, as it counted them, for the characters it counted; every other count stays
    if (!p.acc || !Array.isArray(p.keys) || !p.keys.length) return;
    var ck = clockOf(camp) || { t: 0 }; commitAcc(layAsked(JSON.parse(JSON.stringify(ck.acc || {})), p));
}
// 160: time rules due, as the bell's list knows them (notices.js): they wait while a list waits for the campaign on screen; Open opens the Calendar.
// 152 fold 4b's review: a list made while the Calendar was on still waits, whole, once it is switched off, but no window opens then: Open says how to
// reach it, where it did nothing at all
var TIME_OFF = 'These time rules wait in the Calendar, which is switched off. Switch it on in Settings \u25b8 This campaign to apply or skip them.';
if (typeof window !== 'undefined') { var nkT = window.wpNoticeKinds = window.wpNoticeKinds || {}; nkT.time = { label: 'Open', still: function() { pendFor(getActiveCampaign()); return !!pend; }, run: function() { if (!clockOn()) { toast(TIME_OFF); return; } openWin(); } }; }
// 152 fold 4b (the owner's answer of 2026-10-20, by prompt: "In the bell (Recommended)"): with the Calendar off no window can give the GM's word, so a run
// of a rule ticked Ask me first that comes due in a fight waits in the bell (notices.js) under Waiting for you, one item a character and rule with its
// count. Apply (the kind's run) runs what waits through sheets.js runTimeRules, each run in the round it came due, as the list's Apply does; Skip (its
// second answer, alt) lets it go. Its counts were kept as they were counted, as a list's are once it is answered, so neither moves a count. What waits is
// this machine's memory, kept for the campaign it was counted in (bellQ, by the campaign's id) and never stored, as the bell's rule says; a character or a
// rule that is gone takes its item with it. With the Calendar on nothing of this is asked: the list holds the run, and the bell's time kind says what is due.
// It waits nowhere but the bell, so its kind says only (notices.js): its row has no x and Clear all leaves it, and Apply and Skip alone take it off the list
var bellQ = Object.create(null), BELL_CAMPS = 40, BELL_ITEMS = 200, BELL_RUNS = 60;
function bellOf(id, make) {
    if (typeof id !== 'string' || !id) return null;
    if (!bellQ[id] && make === true) { bellQ[id] = Object.create(null); var ks = Object.keys(bellQ); if (ks.length > BELL_CAMPS) delete bellQ[ks[0]]; }
    return bellQ[id] || null;
}
function bellItem(camp, key) { var b = camp ? bellOf(camp.id) : null; return b && typeof key === 'string' && hasOwn(b, key) ? b[key] : null; }
function bellWords(camp, sys, it) {   // "Kael: Brace waits for your word. 2 runs, the first due in Round 2 on Docks." (notices.js cuts it to one line)
    var ch = hasOwn(camp.chars, it.c) ? camp.chars[it.c] : null, rl = clockRules(sys).filter(function(r) { return r.id === it.r; })[0], n = 0, w = it.runs.length ? it.runs[0].w : '';
    it.runs.forEach(function(x) { n += x.n; });
    return (ch && typeof ch.name === 'string' && ch.name ? ch.name : 'A character') + ': ' + (rl && typeof rl.label === 'string' && rl.label ? rl.label : 'A rule') + ' waits for your word. '
        + (n === 1 ? '1 run' + (w ? ', due in ' + w : '') : n + ' runs' + (w ? ', the first due in ' + w : '')) + '.';
}
function bellUp(camp, sys, fires, w) {   // fires { c, r, n, x?, rd? } that came due in one stretch, its words w: each joins its character and rule's item. true where the bell holds them
    var N = typeof window !== 'undefined' ? window.wpNotices : null; if (!camp || isPlayer() || !N || typeof N.wait !== 'function' || !Array.isArray(fires) || !fires.length) return false;
    var b = bellOf(camp.id, true), said = [], fresh = false, ww = typeof w === 'string' ? w : '';
    fires.forEach(function(f) {
        if (!f || typeof f.c !== 'string' || typeof f.r !== 'string' || !(typeof f.n === 'number' && f.n > 0)) return;
        var key = 'timeask:' + f.c + ':' + f.r, it = hasOwn(b, key) ? b[key] : null, rdN = typeof f.rd === 'number' && isFinite(f.rd) ? f.rd : null, xN = f.x === 1 ? 1 : 0;
        if (!it) { if (Object.keys(b).length >= BELL_ITEMS) return; it = b[key] = { c: f.c, r: f.r, runs: [] }; fresh = true; }
        var same = it.runs.filter(function(q) { return q.rd === rdN && q.w === ww && q.x === xN; })[0];
        if (same) same.n = Math.min(500, same.n + f.n); else if (it.runs.length < BELL_RUNS) it.runs.push({ n: Math.min(500, f.n), rd: rdN, w: ww, x: xN }); else { var last = it.runs[it.runs.length - 1]; last.n = Math.min(500, last.n + f.n); }
        if (said.indexOf(key) < 0) said.push(key);
    });
    said.forEach(function(key) { N.wait(key, bellWords(camp, sys, b[key]), 'timeask', key); });   // said anew each time a run comes due, so an item the x took off the list comes back with it
    if (fresh) toast('Time rules wait for your word. Apply or skip them in the bell in the top row.');
    return said.length > 0;
}
function bellStill(key) {   // the bell asks whether an item still waits: one whose character or rule is gone goes with it
    var camp = getActiveCampaign(), it = bellItem(camp, key); if (!it) return false;
    var sys = sysNow(); if (!sys) return true;   // no system read yet: nothing is judged gone
    if (hasOwn(camp.chars, it.c) && camp.chars[it.c] && clockRules(sys).some(function(r) { return r.id === it.r; })) return true;
    delete bellOf(camp.id)[key]; return false;
}
function bellDone(key, apply) {   // Apply (true) or Skip: the item goes, and Apply runs what waited, each run in the round it came due. true where there was one
    var camp = getActiveCampaign(); if (!camp || isPlayer()) return false;
    var it = bellItem(camp, key); if (it) delete bellOf(camp.id)[key];
    if (typeof window !== 'undefined' && window.wpNotices && typeof window.wpNotices.done === 'function') window.wpNotices.done(key);
    if (!it) return false;
    if (apply === true && window.wpSheets && window.wpSheets.runTimeRules) {
        var w0 = it.runs.length ? it.runs[0].w : '', one = it.runs.every(function(q) { return q.w === w0; });
        var backs = []; window.wpSheets.runTimeRules(it.runs.map(function(q) { var f = { c: it.c, r: it.r, n: q.n }; if (q.x === 1) f.x = 1; if (q.rd !== null) f.rd = q.rd; return f; }), w0 ? (one ? w0 : 'Since ' + w0) : '', undefined, backTo(backs));
        heldBack(camp, sysNow(), backs, false);   // 1.5.5's review: a run its needs held back gives its time back to its count
    }
    return true;
}
if (typeof window !== 'undefined') { var nkB = window.wpNoticeKinds = window.wpNoticeKinds || {}; nkB.timeask = { label: 'Apply', altLabel: 'Skip', stay: true, only: true, tip: 'Run them now, each in the round it came due. Each player gets a summary of what moved or was rolled', altTip: 'Let these runs go with no rule run', still: bellStill, run: function(key) { bellDone(key, true); }, alt: function(key) { bellDone(key, false); } }; }
// 152 fold 4b: the Rules run switch on each NPC (the owner's answer 1, 2026-10-19: "a Rules run switch on each NPC, on by default", placed "somewhere easy
// to use quickly"), read and set here alone: on its token's right-click menu (whiteboard.js gmRulesModel), on its row's menu under Characters (charlist.js)
// and beside it in the waiting list (pendPanel). On: the NPC is not listed in camp.clock.rulesOff. Off: it is, an id as the clock's cleaner keeps one.
// Saved, the GM's own and never sent (net.js clockOut builds only the time and the notes players may see). rulesRun answers null where there is no
// switch: a player's app, the stream window, a campaign this machine may not write, a character that is no NPC by its sheet's own NPC tick (a player's, or
// one with no player yet, which the Characters section lists among the players: offOf never holds either), a character that is
// not there or whose id the cleaner would not keep, or a system with no time rule, where the switch would do nothing
function rulesRun(id) {
    var camp = getActiveCampaign(), n = net(); if (!camp || isPlayer() || (n && n.stream) || (typeof window !== 'undefined' && (window.wpStream || (typeof window.wpCanPersistLocal === 'function' && window.wpCanPersistLocal() !== true)))) return null;
    if (typeof id !== 'string' || !hasOwn(camp.chars, id) || !camp.chars[id] || typeof camp.chars[id] !== 'object' || camp.chars[id].npc !== true || !clockRules(sysNow()).length) return null;
    var k = cleanClock({ t: 0, rulesOff: [id] }); if (!k || !Array.isArray(k.rulesOff) || k.rulesOff[0] !== id) return null;
    return !offOf(camp)(id);
}
function setRulesRun(id, on) {   // true where it changed: saved, said in the Game Record under Time and in a notice, and each tick of it in the window set again
    var was = rulesRun(id); if (was === null || was === (on === true)) return false;
    var camp = getActiveCampaign(), ck = clockOf(camp) || { t: 0 }, nc = Object.assign({}, ck), list = (Array.isArray(ck.rulesOff) ? ck.rulesOff : []).filter(function(c) { return c !== id; });
    if (on !== true) list.push(id);
    if (list.length) nc.rulesOff = list; else delete nc.rulesOff;
    var cl = cleanClock(nc) || { t: ck.t };
    if ((Array.isArray(cl.rulesOff) && cl.rulesOff.indexOf(id) >= 0) === (on === true)) { toast('At most 1000 NPCs can have their time rules switched off.'); return false; }   // the cleaner's bound
    camp.clock = cl;
    var ch = camp.chars[id], said = (typeof ch.name === 'string' && ch.name ? ch.name : 'An NPC') + (on === true ? '\u2019s time rules run by themselves again.' : '\u2019s time rules no longer run by themselves.');
    if (net() && net().logEvent) net().logEvent('time', said);
    save(); runSync(); toast(said); return true;
}
function runSync() {   // the window's Rules run ticks, set in place, so a half-typed amount or note stays
    var b = document.getElementById('calendarBody'); if (!b) return;
    var walk = function(nd) { Array.prototype.forEach.call(nd.children || [], function(k) { if (k.classList && k.classList.contains('cal-pend-run') && k.dataset && typeof k.dataset.char === 'string') { var on = rulesRun(k.dataset.char) === true; if (k.checked !== on) k.checked = on; } walk(k); }); };
    walk(b);
}
function sinceWords(cal) { var s = livePend + pendQ.reduce(function(a, q) { return a + q.s; }, 0); return s > 0 ? fmtSpan(cal, s) + ' more has passed since. It is counted once you apply or skip these.' : ''; }
function sinceSync() { var b = document.getElementById('calendarBody'), sn = b && b.querySelector ? b.querySelector('.cal-pend-since') : null; if (sn) { var sw = sinceWords(sysCal()); if (sn.textContent !== sw) sn.textContent = sw; } }
function mapName(m) { var t = m && m.meta && typeof m.meta.title === 'string' ? m.meta.title.trim() : ''; return t || 'A map'; }
function pendWhere(camp) {   // 159: the map each character stands on, by its first token (the map on screen first, then the others by name)
    var at = Object.create(null), items = camp && camp.items && typeof camp.items === 'object' ? camp.items : {}, here = camp && typeof camp.activeItemId === 'string' ? camp.activeItemId : '';
    var order = Object.keys(items).filter(function(k) { var m = items[k]; return !!m && m.type === 'map'; });
    order.sort(function(a, b) { return a === here ? -1 : b === here ? 1 : mapName(items[a]).localeCompare(mapName(items[b])); });
    order.forEach(function(k) { var wb = Array.isArray(items[k].whiteboard) ? items[k].whiteboard : []; wb.forEach(function(w) { if (w && w.isChar === true && typeof w.charId === 'string' && !(w.charId in at)) at[w.charId] = k; }); });
    return { at: at, order: order, items: items };
}
function spanWords(cal, secs, rest, live) { return live === true ? 'The clock ran' : fmtSpan(cal, secs) + (rest ? ' of rest' : ' of activity'); }   // what a summary is headed with (1.5.4: the running clock is no stretch the GM chose)
function pendWords(cal) { return pend ? (pend.words ? pend.words : pend.live === true ? 'as the clock ran' : spanWords(cal, pend.secs, pend.rest)) : ''; }
function pendPanel(body, cal) {   // 159 (the owner by prompt, 2026-10-18: "Every character, buttons on top"; "maybe a PCs and NPCs category, and sort by map location")
    var box = cel('div', 'cal-pend'), camp = getActiveCampaign(), sys = sysNow(), byC = Object.create(null), order = [];
    var top = cel('div', 'cal-pend-bar'); top.appendChild(cel('span', 'cal-pend-head', 'Time rules due \u2014 ' + pendWords(cal)));
    top.appendChild(cbtn('cal-pend-apply', 'Apply', 'Run the ticked characters\u2019 rules now: the rolls are made for them and each player gets a summary of what moved or was rolled', 'calpendapply'));
    top.appendChild(cbtn('cal-pend-skip', 'Skip', 'Let this time pass with no rules run', 'calpendskip'));
    box.appendChild(top);
    box.appendChild(cel('div', 'sys-note cal-pend-since', sinceWords(cal)));   // empty while nothing more has passed: set in place as the clock runs (sinceSync)
    pend.fires.forEach(function(f) { if (!byC[f.c]) { byC[f.c] = []; order.push(f.c); } byC[f.c].push(f); });
    var chOf = function(cid) { return camp && camp.chars && Object.prototype.hasOwnProperty.call(camp.chars, cid) ? camp.chars[cid] : null; }, nm = function(cid) { var ch = chOf(cid); return ch && typeof ch.name === 'string' && ch.name ? ch.name : 'A character'; };
    var wh = pendWhere(camp), list = cel('div', 'cal-pend-list');
    [[true, 'Players\u2019 characters'], [false, 'NPCs']].forEach(function(g) {
        var ids = order.filter(function(cid) { var ch = chOf(cid); return !!ch && isPc(ch) === g[0]; }); if (!ids.length) return;
        list.appendChild(cel('div', 'cal-pend-group', g[1]));
        wh.order.concat(['']).forEach(function(mk) {
            var here = ids.filter(function(cid) { return (wh.at[cid] || '') === mk; }); if (!here.length) return;
            here.sort(function(a, b) { return nm(a).localeCompare(nm(b)); });
            list.appendChild(cel('div', 'cal-pend-map', mk ? 'On ' + mapName(wh.items[mk]) : 'On no map'));
            here.forEach(function(cid) {
                var row = cel('div', 'cal-pend-row'), pk = cel('label', 'cal-pend-pick'), tick = cel('input', 'cal-pend-tick'); tick.type = 'checkbox'; tick.dataset.char = cid; tick.checked = pend.on[cid] === true; pk.appendChild(tick);
                pk.appendChild(cel('span', 'cal-pend-name', nm(cid)));
                pk.appendChild(cel('span', 'cal-pend-rules', byC[cid].map(function(f) { var rl = clockRules(sys).filter(function(r) { return r.id === f.r; })[0]; return (rl && rl.label ? rl.label : 'A rule') + ' \u00d7' + f.n; }).join(', ')));
                row.appendChild(pk);
                var rr = rulesRun(cid);   // 152 fold 4b: beside each NPC, its Rules run switch (the owner's answer 1)
                if (typeof rr === 'boolean') { var rw = cel('label', 'cal-pend-runs'), rt = cel('input', 'cal-pend-run'); rt.type = 'checkbox'; rt.dataset.char = cid; rt.checked = rr; rw.title = 'Ticked, this NPC\u2019s time rules run by themselves as time passes. Unticked, they do not, and its runs wait here unticked'; rw.appendChild(rt); rw.appendChild(document.createTextNode(' Rules run')); row.appendChild(rw); }
                list.appendChild(row);
            });
        });
    });
    box.appendChild(list); body.appendChild(box);
}
function pendDone(apply) {
    var hadP = !!pend; pendFor(getActiveCampaign()); if (!pend) { if (hadP) renderWin(); return false; }   // a list of another campaign's is no list here
    var p = pend, cal = sysCal(); pend = null;
    if (typeof window !== 'undefined' && window.wpNotices) window.wpNotices.done('time');   // 160
    var camp = getActiveCampaign(); if (!camp || camp.id !== p.camp) { renderWin(); return false; }
    var backs = [], onU = apply && typeof restNow === 'function' ? restNow(camp) : null, snapU = onU && onU.undo && typeof restSnap === 'function' ? restSnap(camp) : null;   // the review of 2026-11-10: what a list applied during a rest gives is part of what the rest gave
    if (apply) { var go = p.fires.filter(function(f) { return p.on[f.c] === true; }); if (go.length && window.wpSheets && window.wpSheets.runTimeRules) window.wpSheets.runTimeRules(go, p.words || spanWords(cal, p.secs, p.rest, p.live), undefined, backTo(backs)); }
    keepAsked(camp, p);   // 152: only the counts of the rules this list asked for: a count another rule made since stays
    var sysD = sysNow();
    heldBack(camp, sysD, backs, false);   // 1.5.5's review: a run its needs held back gives its time back, on the count as the list kept it, or spends it after another count's run in this Apply (heldBack)
    if (livePend > 0) { var lp = livePend; livePend = 0; groupRules(camp, sysD, { kind: 'clock', secs: lp, rest: false, live: true }, evenSpans(camp, lp), true); }   // 1.5.4: the time that passed while this list waited (the clock running)
    while (!pend && pendQ.length) { var qd = pendQ.shift(); groupRules(camp, sysD, qGroup(qd), qd.c && typeof qd.c === 'object' ? qd.c : evenSpans(camp, qd.s), Array.isArray(qd.k) ? qd.k : true); }   // 159: then the time moved on meanwhile, in order, until a stretch makes rules due again
    if (snapU && typeof restUndoAdd === 'function') { try { restUndoAdd(camp, snapU); } catch (e) { console.error(e); } }
    renderWin(); refresh(); return true;
}
function comingUp(body, cal, notes, today, gm) {   // the next five notes from today on (a player's app holds only those it may see)
    var next = notes.map(function(n, i) { return { n: n, d: noteNext(cal, n, today), i: i }; }).filter(function(x) { return x.d >= 0; }).sort(function(a, b) { return a.d - b.d || a.i - b.i; }).slice(0, 5); if (!next.length) return;   // 1.6.2 (backlog 166 b): a yearly note by the next day it falls on
    var box = cel('div', 'cal-coming'); box.appendChild(cel('div', 'sys-num-cap', 'Coming up'));
    next.forEach(function(x) { var n = x.n;   // the date on a line of its own, and a long note held to two lines with its whole words on the tooltip (the owner: "the text below the calendar for events needs a better layout")
        var row = cel('div', 'cal-coming-row'), txt = cel('span', 'cal-coming-txt', n.text); txt.title = n.text;
        row.appendChild(cel('span', 'cal-coming-date', fmtDate(cal, x.d * dayLength(cal)) + (n.yearly === true ? ', every year' : '') + ': ')); row.appendChild(txt);
        if (gm && n.vis !== 'all') row.appendChild(cel('span', 'cal-coming-only', ' (you only)'));
        box.appendChild(row);
    });
    body.appendChild(box);
}
function dayNotes(body, cal, notes, day, gm) {   // the picked day's notes: the GM's to add, show to players or remove; a player's to read
    var box = cel('div', 'cal-notes'), mine = notes.filter(function(n) { return n.day === day || (n.yearly === true && noteOn(cal, n, day)); });   // 1.6.2 (backlog 166 b): a yearly note on each day it falls on
    box.appendChild(cel('div', 'sys-num-cap', 'Notes on ' + fmtDate(cal, day * dayLength(cal))));
    if (!mine.length && !gm) box.appendChild(cel('div', 'sys-note', 'No notes on this day.'));
    mine.forEach(function(n) {
        var row = cel('div', 'cal-note'); row.dataset.note = n.id; row.appendChild(cel('span', 'cal-note-txt', n.text));
        if (n.yearly === true && n.day !== day) row.appendChild(cel('span', 'cal-note-real', 'Every year since ' + fmtDate(cal, n.day * dayLength(cal))));
        if (gm && realWords(n.at)) row.appendChild(cel('span', 'cal-note-real', 'Written ' + realWords(n.at)));   // 1.6.2: the real date, the GM's alone
        if (gm) {
            var l = cel('label', 'cal-tick'), c = cel('input', 'cal-note-vis'); c.type = 'checkbox'; c.checked = n.vis === 'all'; c.dataset.note = n.id; c.title = 'Players see this note on the calendar';
            l.appendChild(c); l.appendChild(document.createTextNode(' Players see it')); row.appendChild(l);
            var ly = cel('label', 'cal-tick'), cy = cel('input', 'cal-note-yearly'); cy.type = 'checkbox'; cy.checked = n.yearly === true; cy.dataset.note = n.id; cy.title = 'This note comes back on the same day every year';
            ly.appendChild(cy); ly.appendChild(document.createTextNode(' Every year')); row.appendChild(ly);
            var x = cbtn('cal-note-del', '\u00d7', 'Remove this note', 'calnotedel'); x.dataset.note = n.id; row.appendChild(x);
        }
        box.appendChild(row);
    });
    if (gm) {
        var add = cel('div', 'cal-note-add'), inp = cel('input', 'field cal-note-new'); inp.type = 'text'; inp.maxLength = CAL_LIMITS.noteChars; inp.placeholder = 'A note for this day'; inp.title = 'A deadline, a festival, an event: you are reminded when the clock reaches this day'; add.appendChild(inp);
        var l2 = cel('label', 'cal-tick'), c2 = cel('input', 'cal-note-newvis'); c2.type = 'checkbox'; c2.title = 'Players see this note on the calendar'; l2.appendChild(c2); l2.appendChild(document.createTextNode(' Players see it')); add.appendChild(l2);
        var l3 = cel('label', 'cal-tick'), c3 = cel('input', 'cal-note-newyearly'); c3.type = 'checkbox'; c3.title = 'A festival or a birthday: the note comes back on the same day every year'; l3.appendChild(c3); l3.appendChild(document.createTextNode(' Every year')); add.appendChild(l3);
        add.appendChild(cbtn('cal-note-go', 'Add a note', 'Add this note to the day', 'caladdnote'));
        box.appendChild(add);
    }
    body.appendChild(box);
}
// [calendarcheck:sky-start]
// 1.6.2 (backlog 147; the owner, 2026-11-06, by prompt: the moon's phase on the grid as "both the first and second option", the drawings passed
// on docs/sheets/moon-phases-sheet.html with "Use these drawings"; the timeline "A tab beside the grid"; the real date "The GM only"). The
// eight drawings: the rim, and the lit part filled, made by createElementNS from these constants alone
var PHASE_LIT = ['', 'M12 4a8 8 0 0 1 0 16a4.5 8 0 0 0 0-16z', 'M12 4a8 8 0 0 1 0 16z', 'M12 4a8 8 0 0 1 0 16a4.5 8 0 0 1 0-16z', 'M12 4a8 8 0 1 1 0 16a8 8 0 1 1 0-16z', 'M12 4a8 8 0 0 0 0 16a4.5 8 0 0 0 0-16z', 'M12 4a8 8 0 0 0 0 16z', 'M12 4a8 8 0 0 0 0 16a4.5 8 0 0 1 0-16z'];
var SVGNS = 'http://www.w3.org/2000/svg';
function phaseIcon(i) {
    var s = document.createElementNS(SVGNS, 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'cal-moon'); s.setAttribute('aria-hidden', 'true');
    var r = document.createElementNS(SVGNS, 'circle'); r.setAttribute('class', 'cal-moon-rim'); r.setAttribute('cx', '12'); r.setAttribute('cy', '12'); r.setAttribute('r', '8'); s.appendChild(r);
    var d = PHASE_LIT[i] || ''; if (d) { var p = document.createElementNS(SVGNS, 'path'); p.setAttribute('class', 'cal-moon-lit'); p.setAttribute('d', d); s.appendChild(p); }
    return s;
}
// A day's moons in words, for its tooltip: "Selune: Full moon. Red: Waxing crescent."
function moonWords(ms) { return (ms || []).map(function(m) { return m.name + ': ' + PHASES[m.i] + '.'; }).join(' '); }
// The line under the date: the season, then each moon's phase
function skyWords(cal, t) { var se = seasonOf(cal, t), ms = moonPhases(cal, t), bits = []; if (se) bits.push(se.name + '.'); if (ms.length) bits.push(moonWords(ms)); return bits.join(' '); }
// A day's cell: its number, the first moon's phase drawn at its corner, and New or Full under the number on the day a moon is new or full
function dayFace(b, c) {
    if (!c.moons || !c.moons.length) return;
    b.appendChild(phaseIcon(c.moons[0].i));
    var pk = c.moons.filter(function(m) { return m.peak; })[0]; if (pk) b.appendChild(cel('span', 'cal-moon-w', pk.peak === 'full' ? 'Full' : 'New'));
}
var calTab = 'month';   // the window's two tabs: the month grid, or the timeline of dated notes
// The real moment a note was written, in this computer's own words, the GM's alone
function realWords(at) { if (!(typeof at === 'number' && at > 0)) return ''; try { return new Date(at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); } catch (e) { return ''; } }
// The timeline: every dated note in date order, today marked between the past and what is coming, the past dimmed. A press opens its day
function timeline(body, cal, notes, today, gm, eras) {
    var rb = cel('div', 'cal-ribbon'); body.appendChild(rb);   // 1.6.2 (backlog 166 h): the ribbon of eras, notes, sessions and now, above the list
    if (typeof window !== 'undefined' && window.wpTimeline && typeof window.wpTimeline.draw === 'function') { try { window.wpTimeline.draw(rb, cal, clockOf(getActiveCampaign()), openDay); } catch (e) {} }
    var box = cel('div', 'cal-tl'), dl = dayLength(cal), marked = false, lastEra = '';
    if (!notes.length) { box.appendChild(cel('div', 'sys-note', gm ? 'No dated notes yet. Pick a day on the month and add one.' : 'No dated notes you can see.')); body.appendChild(box); return; }
    var mark = function() { if (marked) return; marked = true; box.appendChild(cel('div', 'cal-tl-today', 'Today, ' + fmtDate(cal, today * dl))); };
    notes.forEach(function(n) {
        if (n.day >= today) mark();
        var en = eras && typeof eraOf === 'function' ? eraOf(cal, eras, dateOf(cal, n.day * dl).year) : null; if (en && en.id !== lastEra) box.appendChild(eraTag(en, 'cal-tl-era')); lastEra = en ? en.id : '';   // 1.6.2 (backlog 166 b)
        var row = cbtn('cal-tl-row' + (n.day < today ? ' cal-tl-past' : '') + (n.day === today ? ' cal-tl-now' : ''), '', 'Open this day on the month', 'caltlday'); row.dataset.day = String(n.day);
        row.appendChild(cel('span', 'cal-tl-date', fmtDate(cal, n.day * dl)));
        row.appendChild(cel('span', 'cal-tl-txt', n.text));
        if (n.yearly === true) row.appendChild(cel('span', 'cal-tl-meta', 'Every year'));
        if (gm) { var rw = realWords(n.at), meta = (n.vis === 'all' ? '' : 'You only') + (rw ? (n.vis === 'all' ? '' : '. ') + 'Written ' + rw : ''); if (meta) row.appendChild(cel('span', 'cal-tl-meta', meta)); }
        box.appendChild(row);
    });
    mark();
    body.appendChild(box);
}
// [calendarcheck:sky-end]
// [calendarcheck:eras-start]
// 1.6.2 (backlog 166 b): an era's name with its colour beside it; the colour is cleanEras' #rrggbb alone
function eraTag(e, cls) { var s = cel('span', 'cal-era' + (cls ? ' ' + cls : '')), dot = cel('span', 'cal-era-dot'); dot.style.background = /^#[0-9a-f]{6}$/.test(e.color) ? e.color : '#c9a227'; s.appendChild(dot); s.appendChild(document.createTextNode(e.name)); s.title = e.name + (typeof e.to === 'number' ? ', ' + e.from + ' to ' + e.to : ', from ' + e.from); return s; }
// The GM's eras: a row each to name it, its years, its colour and whether players see it, then a row to add one
function erasBox(body, cal, eras) {
    var box = cel('div', 'cal-eras'); box.appendChild(cel('div', 'sys-num-cap', 'Eras'));
    if (!(cleanCalendar(cal) || {}).periods) { box.appendChild(cel('div', 'sys-note', 'Eras need a calendar with years.')); body.appendChild(box); return; }
    var num = function(cls, v, tip, ph) { var n = cel('input', 'field ' + cls); n.type = 'number'; n.step = '1'; if (typeof v === 'number') n.value = String(v); n.title = tip; if (ph) n.placeholder = ph; return n; };
    (eras || []).forEach(function(e) {
        var row = cel('div', 'cal-era-row'); row.dataset.era = e.id;
        var nm = cel('input', 'field cal-era-name'); nm.type = 'text'; nm.maxLength = CAL_LIMITS.name; nm.value = e.name; nm.title = 'The era\u2019s name'; nm.dataset.era = e.id; row.appendChild(nm);
        var f = num('cal-era-from', e.from, 'The year it begins'); f.dataset.era = e.id; row.appendChild(f); row.appendChild(cel('span', 'cal-colon', 'to'));
        var t = num('cal-era-to', e.to, 'The year it ends. Empty: it goes on', 'Goes on'); t.dataset.era = e.id; row.appendChild(t);
        var c = cel('input', 'cal-era-color'); c.type = 'color'; c.value = e.color; c.title = 'Its colour'; c.dataset.era = e.id; row.appendChild(c);
        var l = cel('label', 'cal-tick'), v = cel('input', 'cal-era-vis'); v.type = 'checkbox'; v.checked = e.vis === 'all'; v.dataset.era = e.id; v.title = 'Players see this era beside the date'; l.appendChild(v); l.appendChild(document.createTextNode(' Players see it')); row.appendChild(l);
        var x = cbtn('cal-era-del', '\u00d7', 'Remove this era', 'caleradel'); x.dataset.era = e.id; row.appendChild(x);
        box.appendChild(row);
    });
    var add = cel('div', 'cal-era-row cal-era-add'), an = cel('input', 'field cal-era-newname'); an.type = 'text'; an.maxLength = CAL_LIMITS.name; an.placeholder = 'A new era'; an.title = 'A named span of years, shown beside the date'; add.appendChild(an);
    add.appendChild(num('cal-era-newfrom', null, 'The year it begins', 'From')); add.appendChild(cel('span', 'cal-colon', 'to')); add.appendChild(num('cal-era-newto', null, 'The year it ends. Empty: it goes on', 'Goes on'));
    add.appendChild(cbtn('cal-era-go', 'Add an era', 'Add this era', 'caleraadd'));
    box.appendChild(add); body.appendChild(box);
}
function editEras(fn) {
    var camp = getActiveCampaign(); if (!camp || isPlayer()) return false;
    var ck = clockOf(camp) || { t: 0 }, list = (ck.eras || []).map(function(e) { return Object.assign({}, e); }); if (fn(list) === false) return false;
    camp.clock = cleanClock(Object.assign({}, ck, { eras: list })) || { t: ck.t };
    save(); refresh(); return true;
}
function newEraId() { var a = 'abcdefghijklmnopqrstuvwxyz0123456789', s = 'e_'; for (var i = 0; i < 8; i++) s += a[Math.floor(Math.random() * a.length)]; return s; }
function addEra(name, from, to) {
    var nm = typeof name === 'string' ? name.trim() : ''; if (!nm) { toast('Type the era\u2019s name first.'); return false; }
    if (!(typeof from === 'number' && isFinite(from) && Math.floor(from) === from)) { toast('Type the year it begins.'); return false; }
    return editEras(function(list) { if (list.length >= CAL_LIMITS.eras) { toast('At most ' + CAL_LIMITS.eras + ' eras.'); return false; } var e = { id: newEraId(), name: nm, from: from }; if (typeof to === 'number' && isFinite(to) && Math.floor(to) === to) e.to = to; list.push(e); });
}
function eraSet(id, key, val) {
    return editEras(function(list) {
        var e = list.filter(function(x) { return x.id === id; })[0]; if (!e) return false;
        if (key === 'name') { var nm = typeof val === 'string' ? val.trim() : ''; if (!nm) { toast('An era needs a name.'); return false; } e.name = nm; }
        else if (key === 'from') { if (!(typeof val === 'number' && isFinite(val) && Math.floor(val) === val)) { toast('Type the year it begins.'); return false; } e.from = val; }
        else if (key === 'to') { if (val === null) delete e.to; else if (typeof val === 'number' && isFinite(val) && Math.floor(val) === val) e.to = val; else return false; }
        else if (key === 'color') e.color = val;
        else if (key === 'vis') { if (val === true) e.vis = 'all'; else delete e.vis; }
        else if (key === 'del') { list.splice(list.indexOf(e), 1); }
        else return false;
    });
}
// [calendarcheck:eras-end]
// [calendarcheck:restpick-start]
// 1.6.2 (backlog 138 (j), docs/REST_DESIGN.md fold R1; the owner, 2026-10-16, by prompt: a skip as a rest "Your default, changeable (Recommended)"): what
// time passes as when the clock moves on, restPick: 'active', 'rest' (rest time only) or one of the system's rests by its id, whose time counts as rest
// unless it says otherwise. It opens on the system's default (restSkip) each time the window opens, and a pick holds while the window is open
function restsOf(sys) { return sys && Array.isArray(sys.rests) ? sys.rests.filter(function(r) { return !!r && typeof r.id === 'string' && typeof r.name === 'string'; }) : []; }
function restByPick(sys, k) { var f = null; restsOf(sys).forEach(function(r) { if (!f && r.id === k) f = r; }); return f; }
function restDefault(sys) { var d = sys && typeof sys.restSkip === 'string' ? sys.restSkip : ''; return d === 'rest' ? 'rest' : restByPick(sys, d) ? d : 'active'; }
function pickIsRest(sys, k) { if (k === 'rest') return true; var r = restByPick(sys, k); return !!r && r.time !== false; }
function restPickSet(sys, k) { restPick = k === 'rest' || restByPick(sys, k) ? k : 'active'; restMode = pickIsRest(sys, restPick); }
function restLenWords(cal, sys, r) { var s = r && r.len ? everySecs(cal, sysUnits(sys), r.len) : 0; return s > 0 ? fmtSpan(cal, s) : ''; }
// [calendarcheck:restpick-end]
// [calendarcheck:restcall-start]
// 1.6.2 (backlog 138 (j), docs/REST_DESIGN.md fold R2; the owner, 2026-10-16, by prompt: "At the start (Recommended)"): a rest you call. Its call box
// (restCall, this screen's alone) says how long it lasts and who rests; Start the rest moves the clock its length in one save, counting it as rest for those
// who rest and as activity for those awake (moveTo's how.who), and keeps the rest on the clock (camp.clock.rest), which then waits until you end it
// (liveHeld 'rest'). A step while it is on adds to it; a step back and Set the clock wait. The table is told at the start and at the end
var restCall = null, restTold = Object.create(null);
function restNow(camp) { var ck = clockOf(camp); return ck && ck.rest && typeof ck.rest.name === 'string' ? ck.rest : null; }
function restWait(camp) {   // why Call a rest waits, in words, or '' where a rest may be called
    if (restNow(camp)) return 'A rest is on: end it first';
    if (ordersRun()) return 'End the fight to call a rest';
    var n = net(); if (n && n.active && n.role === 'host' && n.paused) return 'Resume the table first';
    if (pend) return 'Answer the time rules that wait first';
    return '';
}
function restWho(camp) { var o = {}; charIdsOf(camp).forEach(function(id) { o[id] = isPc(camp.chars[id]) ? 'rest' : 'none'; }); return o; }
function restOpen(rid) { var camp = getActiveCampaign(), r = restByPick(sysNow(), rid); if (!camp || isPlayer() || !r || restWait(camp)) return false; restCall = { rid: r.id, n: r.len.n, u: r.len.u, who: restWho(camp) }; restMapCall(camp, restCall); return true; }
function restStart() {
    var camp = getActiveCampaign(), sys = sysNow(), cal = sysCal(), rc = restCall, r = rc ? restByPick(sys, rc.rid) : null; if (!camp || isPlayer() || !r) return false;
    var why = restWait(camp); if (why) { toast(why + '.'); return false; }
    var len = everySecs(cal, sysUnits(sys), { n: rc.n, u: rc.u }); if (!(len > 0)) { toast('Set how long the rest lasts.'); return false; }
    var t0 = tOf(camp), who = {}; Object.keys(rc.who).forEach(function(k) { if (rc.who[k] === 'rest' || rc.who[k] === 'awake') who[k] = rc.who[k]; });
    var goM = rc.go && rc.map ? restMapOf(camp, rc.map) : null, hereM = restMapOf(camp, camp.activeItemId), restOn = { rid: r.id, name: r.name, from: t0, to: t0 + len, who: who };   // fold R5: the rest map, if ticked
    if (goM) { restOn.map = goM.id; if (hereM && hereM.id !== goM.id) restOn.gm = hereM.id; }
    restCall = null; restTold[camp.id] = true; var snapR = typeof restSnap === 'function' ? restSnap(camp) : null;   // the early end: everything as it stood before the start
    if (!moveTo(t0 + len, 'Rest called \u2014 ' + r.name, false, false, { who: who, restOn: restOn, restMap: restMapOf(camp, rc.map) ? { map: rc.map, go: !!rc.go } : null })) return false;
    if (goM) { try { restGo(camp, goM, hereM ? hereM.id : '', rc.npcs); } catch (e) { console.error(e); } }
    var nn = net(); if (nn && typeof nn.restLine === 'function') nn.restLine('The party rests: ' + r.name + '.');
    var rIds = Object.keys(who).filter(function(k) { return who[k] === 'rest'; }); if (((Array.isArray(r.does) && r.does.length) || r.ends === true) && rIds.length && window.wpSheets && typeof window.wpSheets.restDoes === 'function') { try { window.wpSheets.restDoes(rIds, r.does || [], 1, r); } catch (e) { console.error(e); } }   // fold R4: what it does at once, for those who rest
    if (snapR && typeof restUndoKeep === 'function') { try { restUndoKeep(camp, snapR, len); } catch (e) { console.error(e); } }   // the early end: what the start gave, kept on the rest
    return true;
}
function restEnd() {
    var camp = getActiveCampaign(), ck = clockOf(camp), on = restNow(camp); if (!camp || isPlayer() || !on) return false;
    var nc = Object.assign({}, ck); delete nc.rest; nc.rests = (ck.rests || []).concat([restRecFor(on, ck.t)]); camp.clock = cleanClock(nc) || { t: ck.t };   // fold R3: the calendar's record of it
    var nn = net(); if (nn && nn.logEvent) nn.logEvent('time', 'Rest ended \u2014 ' + on.name + ' \u2014 now ' + fmtWhen(sysCal(), ck.t));
    save(); if (nn && typeof nn.restLine === 'function') nn.restLine('The rest is over.');
    var goBack = restBackOn; restBackOn = true; if (on.map && goBack) { try { restReturn(camp, on); } catch (e) { console.error(e); } }   // fold R5: the party goes back where it was
    refresh(); return true;
}
function restNames(camp, who, kind) { var out = []; Object.keys(who || {}).forEach(function(k) { if (who[k] === kind && camp.chars && Object.prototype.hasOwnProperty.call(camp.chars, k)) { var ch = camp.chars[k]; out.push(ch && typeof ch.name === 'string' && ch.name ? ch.name : 'A character'); } }); return out; }
function restUnitOpts(sys) { var us = [['min', 'minutes'], ['hour', 'hours'], ['day', 'days'], ['week', 'weeks']]; sysUnits(sys).forEach(function(u) { if (u && typeof u.key === 'string' && u.key && u.key.toLowerCase() !== 'round') us.push([u.key, typeof u.label === 'string' && u.label.trim() ? u.label.trim() : u.key]); }); return us; }
function restPanel(body, cal, camp, sys) {
    var on = restNow(camp), rs = restsOf(sys);
    if (on) {
        var box = cel('div', 'cal-rest cal-rest-on'), hd = cel('div', 'cal-rest-head'); hd.appendChild(cel('span', 'wib wi-bed')); hd.appendChild(document.createTextNode('Resting: ' + on.name)); box.appendChild(hd);
        if (typeof on.from === 'number' && typeof on.to === 'number') box.appendChild(cel('div', 'sys-note', 'Called at ' + fmtWhen(cal, on.from) + '. The clock stands at ' + fmtWhen(cal, on.to) + ' and waits until you end the rest.'));
        var rN = restNames(camp, on.who, 'rest'), aN = restNames(camp, on.who, 'awake');
        if (rN.length) box.appendChild(cel('div', 'sys-note', 'Resting: ' + rN.join(', ') + '.')); if (aN.length) box.appendChild(cel('div', 'sys-note', 'Awake: ' + aN.join(', ') + '.'));
        var tn = cel('textarea', 'field cal-rest-notes'); tn.rows = 2; tn.maxLength = 2000; tn.value = on.notes || ''; tn.placeholder = 'What happened during the rest'; tn.title = 'Your notes on this rest. The calendar keeps them with its record'; box.appendChild(tn);   // fold R3
        var tl = cel('label', 'cal-tick'), tc = cel('input', 'cal-rest-vis'); tc.type = 'checkbox'; tc.checked = on.vis === 'all'; tc.title = 'Players see these notes on the calendar'; tl.appendChild(tc); tl.appendChild(document.createTextNode(' Players see these notes')); box.appendChild(tl);
        if (typeof restCutBox === 'function') restCutBox(box, camp, on);   // the early end
        if (on.map) restBackBox(box, camp, on);   // fold R5
        var bar = cel('div', 'cal-rest-bar'); bar.appendChild(cbtn('cal-rest-end', 'End the rest', 'The rest is over: the clock runs again from where it stands, and the table is told', 'restend')); box.appendChild(bar);
        body.appendChild(box); return;
    }
    if (!rs.length) return;
    if (restCall && !restByPick(sys, restCall.rid)) restCall = null;
    if (restCall) {
        var r = restByPick(sys, restCall.rid), cb = cel('div', 'cal-rest cal-rest-callbox'), len = everySecs(cal, sysUnits(sys), { n: restCall.n, u: restCall.u }), t0 = tOf(camp);
        var ch = cel('div', 'cal-rest-head'); ch.appendChild(cel('span', 'wib wi-bed')); ch.appendChild(document.createTextNode('Call ' + r.name)); cb.appendChild(ch);
        cb.appendChild(cel('div', 'sys-note cal-rest-span', len > 0 ? 'From ' + fmtWhen(cal, t0) + ' to ' + fmtWhen(cal, t0 + len) + '.' : 'Set how long it lasts.'));
        var lr = cel('div', 'cal-rest-len'); lr.appendChild(cel('span', 'sys-num-cap', 'Lasts'));
        var ni = cel('input', 'field cal-restcall-n'); ni.type = 'number'; ni.min = '1'; ni.max = '1000'; ni.step = '1'; ni.value = String(restCall.n); ni.title = 'How long this rest lasts, for this call only'; lr.appendChild(ni);
        var us = cel('select', 'field cal-restcall-u'); us.title = 'Its unit'; restUnitOpts(sys).forEach(function(o) { var op = cel('option', '', o[1]); op.value = o[0]; us.appendChild(op); }); us.value = restCall.u; lr.appendChild(us); cb.appendChild(lr);
        cb.appendChild(cel('div', 'sys-num-cap cal-rest-whocap', 'Who rests'));
        var row = function(into, id) { var c = camp.chars[id], w = cel('label', 'cal-rest-who'); w.appendChild(cel('span', 'cal-rest-whoname', c && typeof c.name === 'string' && c.name ? c.name : 'A character')); var sl = cel('select', 'field cal-restcall-who'); sl.dataset.char = id; sl.title = 'Rests: its time counts as rest. Awake: it counts as activity. Not counted: nothing runs for it'; [['rest', 'Rests'], ['awake', 'Awake'], ['none', 'Not counted']].forEach(function(o) { var op = cel('option', '', o[1]); op.value = o[0]; sl.appendChild(op); }); sl.value = restCall.who[id] || 'none'; w.appendChild(sl); into.appendChild(w); };
        var ids = charIdsOf(camp), pcs = ids.filter(function(id) { return isPc(camp.chars[id]); }), npcs = ids.filter(function(id) { return !isPc(camp.chars[id]); });
        pcs.forEach(function(id) { row(cb, id); }); if (!pcs.length) cb.appendChild(cel('div', 'sys-note', 'No player has a character here yet.'));
        if (npcs.length) { var nd = cel('details', 'cal-rest-npcs'); nd.appendChild(cel('summary', '', 'NPCs (' + npcs.length + ')')); npcs.forEach(function(id) { row(nd, id); }); cb.appendChild(nd); }
        restGoBox(cb, camp, restCall);   // fold R5
        var bb = cel('div', 'cal-rest-bar'); bb.appendChild(cbtn('cal-rest-start', 'Start the rest', 'The clock jumps the rest\u2019s length, the time rules count it for who rests, and the clock waits until you end the rest', 'reststart')); bb.appendChild(cbtn('cal-rest-cancel', 'Cancel', 'Call no rest', 'restcancel')); cb.appendChild(bb);
        body.appendChild(cb); return;
    }
    var why = restWait(camp), rr = cel('div', 'cal-rest cal-rest-row'); rr.appendChild(cel('span', 'sys-num-cap', 'Call a rest'));
    rs.forEach(function(r) { var lw = restLenWords(cal, sys, r), b = cbtn('cal-rest-call', r.name + (lw ? ' \u00b7 ' + lw : ''), why ? why : 'Call ' + r.name + ': the clock jumps ' + (lw || 'its length') + ', then waits until you end the rest', 'restcall'); b.dataset.rid = r.id; b.disabled = !!why; rr.appendChild(b); });
    body.appendChild(rr); body.appendChild(cel('div', 'sys-note cal-rest-note', why ? why + '.' : 'The clock jumps the rest\u2019s length, then waits until you end the rest.'));
}
// [calendarcheck:restcall-end]
// [calendarcheck:restmap-start]
// 1.6.2 (backlog 138 (j), docs/REST_DESIGN.md fold R5; the owner, 2026-10-16, by prompt: "One, changed as you go (Recommended)", and of who goes, "table,
// late joiners, plus NPCs i pick"): the rest map. The call box offers Take the party to, a tick and a map, as the campaign last left them, and the NPC
// tokens on the map you are on, each a tick. Start the rest moves the players at the table once, as a summon does with no pin (net.restParty), carries
// the ticked NPC tokens there (net.restCarry) and takes your own screen with them. A player who joins during the rest lands there (net.js restLanding).
// End the rest takes each back to the map they were on, a map since deleted or locked for players counting as gone, unless you untick it
var restBackOn = true;
function restMapOf(camp, id) { var it = camp && camp.items && typeof id === 'string' && id && Object.prototype.hasOwnProperty.call(camp.items, id) ? camp.items[id] : null; return it && it.type === 'map' ? it : null; }
function restMapList(camp) { return camp && camp.items ? Object.keys(camp.items).map(function(k) { return camp.items[k]; }).filter(function(it) { return it && it.type === 'map'; }) : []; }
function restMapFirst(camp) { var ms = restMapList(camp); return ms.filter(function(m) { return m.id !== camp.activeItemId; })[0] || ms[0] || null; }   // a rest map not yet picked: the first that is not the map you are on
function restMapName(m) { return m && m.meta && typeof m.meta.title === 'string' && m.meta.title.trim() ? m.meta.title.trim() : 'A map'; }
function restMapCall(camp, rc) { var ck = clockOf(camp), rm = ck && ck.restMap, m = rm ? restMapOf(camp, rm.map) : null; rc.map = m ? m.id : ''; rc.go = !!(m && rm.go); rc.npcs = {}; return rc; }
function restNpcToks(camp, toId) {   // the NPC tokens on the map you are on, never a player's, a waiting one or one on the rest map itself
    var here = restMapOf(camp, camp && camp.activeItemId); if (!here || here.id === toId) return [];
    return (here.whiteboard || []).filter(function(w) { if (!w || !w.isChar || w.waiting || w.ownerId) return false; var ch = typeof w.charId === 'string' && camp.chars && Object.prototype.hasOwnProperty.call(camp.chars, w.charId) ? camp.chars[w.charId] : null; return !(ch && isPc(ch)); })
        .slice(0, 100).map(function(w) { var ch = typeof w.charId === 'string' && camp.chars && Object.prototype.hasOwnProperty.call(camp.chars, w.charId) ? camp.chars[w.charId] : null; return { id: w.id, name: (ch && typeof ch.name === 'string' && ch.name) || (typeof w.charName === 'string' && w.charName) || (typeof w.name === 'string' && w.name) || 'A token' }; });
}
function restGoBox(cb, camp, rc) {
    var maps = restMapList(camp); if (!maps.length) return;
    var gr = cel('div', 'cal-rest-go'), gl = cel('label', 'cal-tick'), gc = cel('input', 'cal-restcall-go'); gc.type = 'checkbox'; gc.checked = !!rc.go; gc.title = 'The players at the table go to this map, and anyone who joins during the rest'; gl.appendChild(gc); gl.appendChild(document.createTextNode(' Take the party to')); gr.appendChild(gl);
    var ms = cel('select', 'field cal-restcall-map'); ms.title = 'The rest map. The campaign keeps it for the next rest you call'; maps.forEach(function(m) { var op = cel('option', '', restMapName(m)); op.value = m.id; ms.appendChild(op); }); ms.value = restMapOf(camp, rc.map) ? rc.map : restMapFirst(camp).id; ms.disabled = !rc.go; gr.appendChild(ms); cb.appendChild(gr);
    if (!rc.go) return;
    var nt = restNpcToks(camp, rc.map);
    if (nt.length) { cb.appendChild(cel('div', 'sys-num-cap cal-rest-whocap', 'NPCs who go too')); nt.forEach(function(t) { var l = cel('label', 'cal-tick cal-rest-npc'), c = cel('input', 'cal-restcall-npc'); c.type = 'checkbox'; c.dataset.tok = t.id; c.checked = !!rc.npcs[t.id]; c.title = 'This token goes to the rest map, and back at the end'; l.appendChild(c); l.appendChild(document.createTextNode(' ' + t.name)); cb.appendChild(l); }); }
    cb.appendChild(cel('div', 'sys-note', 'The players at the table go, and anyone who joins during the rest. NPCs go only where ticked, from the map you are on.'));
}
function restGo(camp, m, hereId, ticks) {   // after the clock has moved: the party to the rest map, where each was noted on the rest, in a quiet save outside your undo
    var nn = net(), on = restNow(camp); if (!on) return null;
    var back = nn && typeof nn.restParty === 'function' ? nn.restParty(m.id) || {} : {};
    var ids = Object.keys(ticks || {}).filter(function(k) { return ticks[k] === true; });
    var npcs = hereId && hereId !== m.id && ids.length && nn && typeof nn.restCarry === 'function' ? nn.restCarry(hereId, ids, m.id) || [] : [];
    var nr = Object.assign({}, restNow(camp)); if (Object.keys(back).length) nr.back = back; if (npcs.length) nr.npcs = npcs;
    camp.clock = cleanClock(Object.assign({}, clockOf(camp), { rest: nr })) || camp.clock;
    if (nn) nn.applyingRemote = true; save(true); if (nn) nn.applyingRemote = false;
    if (hereId !== m.id && typeof restNav === 'function') restNav(m.id);
    return { back: back, npcs: npcs };
}
function restReturn(camp, on) {   // End the rest: each player to the map they were on, each NPC token to its map and place, your own screen back where it was
    var nn = net(), m = restMapOf(camp, on.map), out = { players: 0, npcs: 0 };
    if (on.back && nn && typeof nn.restBack === 'function') out.players = nn.restBack(on.back, on.map) || 0;
    if (m && Array.isArray(on.npcs) && nn && typeof nn.restCarry === 'function') {
        var by = {}; on.npcs.forEach(function(n) { if (!restMapOf(camp, n.from)) return; (by[n.from] = by[n.from] || []).push(n); });
        Object.keys(by).forEach(function(f) { var at = {}; by[f].forEach(function(n) { at[n.tok] = { x: n.x, y: n.y }; }); out.npcs += (nn.restCarry(m.id, by[f].map(function(n) { return n.tok; }), f, at) || []).length; });
    }
    if (on.gm && restMapOf(camp, on.gm) && camp.activeItemId === on.map && typeof restNav === 'function') restNav(on.gm);
    return out;
}
function restBackWords(camp, on) {   // who goes where, in words
    var parts = [];
    Object.keys(on.back || {}).forEach(function(pid) { var rec = camp.players && Object.prototype.hasOwnProperty.call(camp.players, pid) ? camp.players[pid] : null, nm = rec && typeof rec.name === 'string' && rec.name ? rec.name : 'A player', m = restMapOf(camp, on.back[pid]); parts.push(m && !(m.meta && m.meta.playerLock) ? nm + ' to ' + restMapName(m) : nm + ' stays, since that map is gone'); });
    (on.npcs || []).forEach(function(n) { var m = restMapOf(camp, n.from), w = restMapOf(camp, on.map); var t = w ? (w.whiteboard || []).find(function(x) { return x && x.id === n.tok; }) : null; if (!t) return; var ch = typeof t.charId === 'string' && camp.chars && Object.prototype.hasOwnProperty.call(camp.chars, t.charId) ? camp.chars[t.charId] : null, nm = (ch && ch.name) || t.charName || t.name || 'A token'; parts.push(m ? nm + ' to ' + restMapName(m) : nm + ' stays, since that map is gone'); });
    var gm = on.gm ? restMapOf(camp, on.gm) : null; if (gm) parts.push('you to ' + restMapName(gm));
    return parts.length ? parts.join(', ') + '.' : 'Nobody was moved there.';
}
function restBackBox(box, camp, on) {
    var m = restMapOf(camp, on.map); box.appendChild(cel('div', 'sys-note', 'The party went to ' + (m ? restMapName(m) : 'a map since deleted') + '.'));
    var l = cel('label', 'cal-tick'), c = cel('input', 'cal-rest-back'); c.type = 'checkbox'; c.checked = restBackOn; c.title = 'Each goes back to the map they were on when the rest was called'; l.appendChild(c); l.appendChild(document.createTextNode(' Take the party back to where they were')); box.appendChild(l);
    box.appendChild(cel('div', 'sys-note cal-rest-backwho', restBackWords(camp, on)));
}
// [calendarcheck:restmap-end]
// [calendarcheck:restcut-start]
// 1.6.2 (backlog 138 (j), docs/REST_DESIGN.md, the owner's round three, 2026-10-16, by prompt: "Recount and take back (Recommended)": ending early asks
// how long the party really rested, gives only what those hours reach at each threshold, takes back what the start gave beyond that, sets the clock back
// to that hour, and keeps time short of a threshold counted toward it). Start the rest keeps what it changed (restSnap before, restUndoKeep after). The
// end box's The rest was cut short, after [n] [unit] takes back what the start gave (sheets.js restTakeBack: a value as the start left it goes back, a
// number moved since loses only the start's own move, anything else changed since stays and is named), puts the clock and its counts back where the
// rest began, and moves it on the time really rested as rest for who rested, so the time rules give what that time reaches and keep the rest of it
// counted. The rest's own list and the effects it ended came with the start and are taken back with it: a rest cut short has not reached its end
var restCut = { on: false, n: 1, u: 'hour' };
function restJ(v) { return v === undefined ? '\u0000' : JSON.stringify(v); }
function restSnap(camp) {
    var ck = clockOf(camp) || {}, cl = {}; ['acc', 'top', 'lived'].forEach(function(k) { if (ck[k] !== undefined) cl[k] = JSON.parse(JSON.stringify(ck[k])); });
    var vals = {}; charIdsOf(camp).forEach(function(id) { var c = camp.chars[id]; vals[id] = c && c.values && typeof c.values === 'object' ? JSON.parse(JSON.stringify(c.values)) : {}; });
    return { clock: cl, vals: vals };
}
function restUndoOf(camp, snap, len) {   // what changed between the snapshot and now, by character and field
    var chars = {}, has = Object.prototype.hasOwnProperty;
    charIdsOf(camp).forEach(function(id) {
        var b = snap.vals[id] || {}, c = camp.chars[id], a = c && c.values && typeof c.values === 'object' ? c.values : {}, d = {}, n = 0;
        Object.keys(b).concat(Object.keys(a)).forEach(function(fid) { if (has.call(d, fid)) return; var bv = has.call(b, fid) ? b[fid] : undefined, av = has.call(a, fid) ? a[fid] : undefined; if (restJ(bv) === restJ(av)) return; var e = {}; if (bv !== undefined) e.b = bv; if (av !== undefined) e.a = JSON.parse(JSON.stringify(av)); d[fid] = e; n++; });
        if (n) chars[id] = d;
    });
    return { len: len, clock: snap.clock, chars: chars };
}
function restUndoKeep(camp, snap, len) {
    var on = restNow(camp); if (!on) return false;
    camp.clock = cleanClock(Object.assign({}, clockOf(camp), { rest: Object.assign({}, on, { undo: restUndoOf(camp, snap, len) }) })) || camp.clock;
    var nn = net(); if (nn) nn.applyingRemote = true; save(true); if (nn) nn.applyingRemote = false;   // the GM's own, never sent, outside your undo
    return !!(restNow(camp) && restNow(camp).undo);
}
// The review of 2026-11-10: time rules that waited for the GM's word at the start (Time rules set to Ask me, a rule ticked Ask me first, an NPC whose
// rules are off) give what they give only at Apply, after the start's own snapshot. What that Apply changed joins what the rest gave, so a rest cut
// short takes it back too and the recount lists it again: a number keeps the sum of both moves, a value nobody changed in between runs from the first
// before to the last after, and anything else keeps the later part alone
function restUndoAdd(camp, snap) {
    var on = restNow(camp); if (!on || !on.undo) return false;
    var more = restUndoOf(camp, snap, on.undo.len).chars, chars = JSON.parse(JSON.stringify(on.undo.chars || {})), has = Object.prototype.hasOwnProperty, n = 0;
    var num = function(v) { return typeof v === 'number' && isFinite(v) ? v : v && typeof v === 'object' && !Array.isArray(v) && typeof v.cur === 'number' && isFinite(v.cur) ? v.cur : null; };
    Object.keys(more).forEach(function(cid) {
        var mc = more[cid], oc = has.call(chars, cid) && chars[cid] && typeof chars[cid] === 'object' ? chars[cid] : (chars[cid] = {});
        Object.keys(mc).forEach(function(fid) {
            var m = mc[fid], o = has.call(oc, fid) ? oc[fid] : null; n++;
            if (!o || typeof o !== 'object') { oc[fid] = m; return; }
            var ob = num(o.b), oa = num(o.a), mb = num(m.b), ma = num(m.a);
            if (ob !== null && oa !== null && mb !== null && ma !== null) { var nb = ob + (mb - oa); oc[fid] = { b: o.b && typeof o.b === 'object' ? Object.assign({}, o.b, { cur: nb }) : nb, a: m.a }; return; }
            if (restJ(has.call(m, 'b') ? m.b : undefined) === restJ(has.call(o, 'a') ? o.a : undefined)) { var e = {}; if (has.call(o, 'b')) e.b = o.b; if (has.call(m, 'a')) e.a = m.a; oc[fid] = e; return; }
            oc[fid] = m;
        });
    });
    if (!n) return false;
    camp.clock = cleanClock(Object.assign({}, clockOf(camp), { rest: Object.assign({}, on, { undo: Object.assign({}, on.undo, { chars: chars }) }) })) || camp.clock;
    var nn = net(); if (nn) nn.applyingRemote = true; save(true); if (nn) nn.applyingRemote = false;
    return true;
}
function restCutWhy(camp, on) {   // why this rest cannot be cut short, in words, or ''
    if (!on || !on.undo) return 'This rest cannot be cut short: it was called before Waypoint kept what a rest gives, or what it gave was too much to keep.';
    if (typeof on.from !== 'number' || typeof on.to !== 'number' || on.to - on.from !== on.undo.len) return 'You moved the clock on during this rest, so it cannot be cut short.';
    return '';
}
function restCutSecs(sys) { return everySecs(sysCal(), sysUnits(sys), { n: restCut.n, u: restCut.u }); }
function restCutBox(box, camp, on) {
    var why = restCutWhy(camp, on); if (why) { restCut.on = false; box.appendChild(cel('div', 'sys-note cal-rest-cutwhy', why)); return; }   // the tick is no longer drawn, so it no longer holds: End the rest ends it whole
    var row = cel('div', 'cal-rest-go'), l = cel('label', 'cal-tick'), c = cel('input', 'cal-rest-cut'); c.type = 'checkbox'; c.checked = !!restCut.on; c.title = 'The party rested less than the whole rest. Only that time counts, and what the start gave beyond it is taken back'; l.appendChild(c); l.appendChild(document.createTextNode(' The rest was cut short, after')); row.appendChild(l);
    var ni = cel('input', 'field cal-restcut-n'); ni.type = 'number'; ni.min = '1'; ni.max = '1000'; ni.step = '1'; ni.value = String(restCut.n); ni.disabled = !restCut.on; ni.title = 'How long the party really rested'; row.appendChild(ni);
    var us = cel('select', 'field cal-restcut-u'); us.title = 'Its unit'; restUnitOpts(sysNow()).forEach(function(o) { var op = cel('option', '', o[1]); op.value = o[0]; us.appendChild(op); }); us.value = restCut.u; us.disabled = !restCut.on; row.appendChild(us); box.appendChild(row);
    if (!restCut.on) return;
    var s = restCutSecs(sysNow()), len = on.undo.len;
    box.appendChild(cel('div', 'sys-note cal-rest-cutline', !(s > 0) ? 'Set how long the party really rested.' : s >= len ? 'That is the whole rest or more, so it ends as a whole rest.' : 'Only what ' + fmtSpan(sysCal(), s) + ' reaches is given. What the start gave beyond it is taken back, the rest\u2019s own list and the effects it ended among them, and the clock goes back to ' + fmtWhen(sysCal(), on.from + s) + '.'));
}
function restEndEarly() {
    var camp = getActiveCampaign(), on = restNow(camp); if (!camp || isPlayer() || !on) return false;
    var why = restCutWhy(camp, on); if (why) { toast(why); return false; }
    if (pend) { toast('Answer the time rules that wait first.'); return false; }
    if (ordersRun()) { toast('End the fight to cut the rest short.'); return false; }
    if (tablePaused()) { toast('Resume the table first.'); return false; }   // the review of 2026-11-10: a paused table counts no time, so the time rested would give nothing
    var s = restCutSecs(sysNow()); if (!(s > 0)) { toast('Set how long the party really rested.'); return false; }
    if (s >= on.undo.len) { restCut = { on: false, n: 1, u: 'hour' }; return restEnd(); }
    // What the start gave is taken off the rest BEFORE it is taken back (the review of 2026-11-10): whatever fails after this, a second press finds
    // nothing to take back again, and the rest then ends as a whole rest does
    var undo = on.undo, nn = net(), bare = Object.assign({}, on); delete bare.undo;
    camp.clock = cleanClock(Object.assign({}, clockOf(camp) || { t: on.to }, { rest: bare })) || camp.clock;
    if (nn) nn.applyingRemote = true; save(true); if (nn) nn.applyingRemote = false;
    var tb = { back: 0, kept: [], failed: 0 };
    try { if (window.wpSheets && typeof window.wpSheets.restTakeBack === 'function') tb = window.wpSheets.restTakeBack(undo.chars) || tb; } catch (e) { console.error(e); tb.failed = (tb.failed || 0) + 1; }
    var moved = false;
    try {
        var ck = clockOf(camp) || { t: on.to }, nc = Object.assign({}, ck, { t: on.from }); delete nc.rest; ['acc', 'top', 'lived'].forEach(function(k) { if (undo.clock && undo.clock[k] !== undefined) nc[k] = undo.clock[k]; else delete nc[k]; });
        camp.clock = cleanClock(nc) || { t: on.from };
        moved = !!moveTo(on.from + s, 'Rest cut short \u2014 ' + on.name, false, false, { who: on.who || {} });   // the time really rested, as rest for who rested and activity for who was awake
    } catch (e) { console.error(e); }
    var ck1 = clockOf(camp) || { t: on.from }, n1 = Object.assign({}, ck1); delete n1.rest; if (!moved) n1.t = on.from + s;   // whatever happened, the rest is over and the clock stands where the party stopped resting
    var rec = restRecFor(on, n1.t); rec.cut = true; n1.rests = (ck1.rests || []).concat([rec]);
    camp.clock = cleanClock(n1) || { t: n1.t };
    var ck2 = clockOf(camp) || { t: on.from + s };
    if (nn && nn.logEvent) nn.logEvent('time', 'Rest cut short \u2014 ' + on.name + ' \u2014 after ' + fmtSpan(sysCal(), s) + ', now ' + fmtWhen(sysCal(), ck2.t));
    if (typeof window !== 'undefined' && typeof window.wpStepLog === 'function') window.wpStepLog('rest v1', 'cut', { back: tb.back || 0, kept: (tb.kept || []).length, failed: tb.failed || 0, moved: moved ? 1 : 0 });
    save(); if (nn && typeof nn.restLine === 'function') nn.restLine('The rest is over, cut short after ' + fmtSpan(sysCal(), s) + '.');
    var goBack = restBackOn; restBackOn = true; restCut = { on: false, n: 1, u: 'hour' }; if (on.map && goBack) { try { restReturn(camp, on); } catch (e) { console.error(e); } }
    if (tb.failed) toast('The rest ended, but what its start gave could not be taken back on ' + tb.failed + (tb.failed === 1 ? ' character' : ' characters') + '. Check their sheets.');
    else if (!moved) toast('The rest ended, but the time rested could not be counted by the time rules.');
    if (tb.kept && tb.kept.length) toast('Changed during the rest, so what the start gave stays: ' + tb.kept.slice(0, 4).join('; ') + (tb.kept.length > 4 ? '; \u2026' : '') + '.');
    refresh(); return true;
}
// [calendarcheck:restcut-end]
// your own screen goes with the party (sidebar.js's navigateToMap, loaded on its first use)
function restNav(id) { import('./sidebar.js').then(function(m) { if (m && typeof m.navigateToMap === 'function') m.navigateToMap(id); }).catch(function(e) { console.error(e); }); }
// [calendarcheck:restrec-start]
// 1.6.2 (backlog 138 (j), docs/REST_DESIGN.md fold R3; the owner, 2026-10-16: "the calendar can auto record when rests happen and the gm can add notes on
// what happened during the rest too"): the calendar writes each rest by itself, a called one as it ends and a skip that held a rest by name for at
// least its length, into camp.clock.rests. A day a rest spans wears a teal line; a picked day lists its rests, with the GM's notes and whether players
// see them. A player reads the records the host sends (camp.restLog: names and times, and notes only where the GM ticked them)
function newRestRecId() { return 'rr_' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36); }
function restRecs(camp) { if (isPlayer()) return typeof cleanRestLog === 'function' ? cleanRestLog(camp && camp.restLog) : []; var ck = clockOf(camp); return ck && Array.isArray(ck.rests) ? ck.rests : []; }
function restRecFor(on, t) { var r = { id: newRestRecId(), name: on.name, from: typeof on.from === 'number' ? on.from : t, to: t, how: 'call' }; if (on.rid) r.rid = on.rid; if (on.who && Object.keys(on.who).length) r.who = on.who; if (on.notes) r.notes = on.notes; if (on.vis === 'all') r.vis = 'all'; if (on.map) r.map = on.map; return r; }
function restSkipRec(skip, t0, t1, lenS) { var n = Math.min(500, Math.floor((t1 - t0) / lenS)), r = { id: newRestRecId(), rid: skip.id, name: skip.name, from: t0, to: t1, how: 'skip' }; if (n > 1) r.n = n; return r; }
function restDays(camp, dl) {   // [first day, last day] of each rest the calendar holds, and of the one that is on
    var out = restRecs(camp).map(function(r) { return [Math.floor(r.from / dl), Math.floor(r.to / dl)]; }), on = isPlayer() ? null : restNow(camp);
    if (on && typeof on.from === 'number') out.push([Math.floor(on.from / dl), Math.floor(tOf(camp) / dl)]);
    return out;
}
function editRests(fn) {
    var camp = getActiveCampaign(); if (!camp || isPlayer()) return false;
    var ck = clockOf(camp) || { t: 0 }, nc = Object.assign({}, ck), list = (ck.rests || []).map(function(r) { return Object.assign({}, r); }), on = ck.rest ? Object.assign({}, ck.rest) : null;
    if (fn(list, on) === false) return false;
    nc.rests = list; if (on) nc.rest = on; camp.clock = cleanClock(nc) || { t: ck.t };
    save(); refresh(); return true;
}
function restDayList(body, cal, camp, day, gm) {
    var dl = dayLength(cal), mine = restRecs(camp).filter(function(r) { return Math.floor(r.from / dl) <= day && day <= Math.floor(r.to / dl); }); if (!mine.length) return;
    var box = cel('div', 'cal-rrs'); box.appendChild(cel('div', 'sys-num-cap', 'Rests'));
    mine.forEach(function(r) {
        var row = cel('div', 'cal-rr'); row.dataset.rr = r.id;
        var hd = cel('div', 'cal-rest-head'); hd.appendChild(cel('span', 'wib wi-bed')); hd.appendChild(document.createTextNode(r.name)); row.appendChild(hd);
        row.appendChild(cel('div', 'sys-note', 'From ' + fmtWhen(cal, r.from) + ' to ' + fmtWhen(cal, r.to) + (r.how === 'skip' ? ', from a skip' + (r.n ? ', ' + r.n + ' times' : '') : '') + (r.cut ? ', cut short' : '') + '.'));
        if (gm) {
            var rn = restNames(camp, r.who, 'rest'), an = restNames(camp, r.who, 'awake');
            if (rn.length) row.appendChild(cel('div', 'sys-note', 'Rested: ' + rn.join(', ') + '.')); if (an.length) row.appendChild(cel('div', 'sys-note', 'Awake: ' + an.join(', ') + '.'));
            if (r.map && typeof restMapOf === 'function') { var rmD = restMapOf(camp, r.map); row.appendChild(cel('div', 'sys-note', 'At ' + (rmD ? restMapName(rmD) : 'a map since deleted') + '.')); }   // fold R5
            var ta = cel('textarea', 'field cal-rr-notes'); ta.rows = 2; ta.maxLength = 2000; ta.value = r.notes || ''; ta.placeholder = 'What happened during the rest'; ta.title = 'Your notes on this rest, at most 2000 characters'; ta.dataset.rr = r.id; row.appendChild(ta);
            var l = cel('label', 'cal-tick'), c = cel('input', 'cal-rr-vis'); c.type = 'checkbox'; c.checked = r.vis === 'all'; c.dataset.rr = r.id; c.title = 'Players see these notes on the calendar'; l.appendChild(c); l.appendChild(document.createTextNode(' Players see these notes')); row.appendChild(l);
            var del = cbtn('cal-rr-del', 'Remove', 'Remove this record of the rest, with its notes', 'calrrdel'); del.dataset.rr = r.id; row.appendChild(del);
        } else if (r.notes) row.appendChild(cel('div', 'cal-rr-txt', r.notes));
        box.appendChild(row);
    });
    body.appendChild(box);
}
// [calendarcheck:restrec-end]
function renderWin() {
    var body = document.getElementById('calendarBody'), camp = getActiveCampaign(); if (!body) return;
    if (!shown(camp)) { closeWin(); return; }
    if ((restMode || restPick !== 'active') && ordersRun()) restPickSet(sysNow(), 'active');   // 1.5.7: a fight is activity, so the window shows Active while one runs
    var cal = sysCal(), ck = clockOf(camp) || { t: 0 }, t = ck.t, gm = !isPlayer(), sys = sysNow(), dl = dayLength(cal), now = dateOf(cal, t);
    if (camp.id !== winCamp) { view = null; pick = null; winCamp = camp.id; pendFor(camp); }   // another campaign on screen: its own calendar, from the clock
    if (!view) view = viewOf(cal, t);
    winSig = winSigOf(camp, ck, cal); winBase = winBaseOf(camp, ck, cal); winDay = Math.floor(t / dl);
    body.textContent = '';
    var nowL = cel('div', 'cal-now', fmtWhen(cal, t, now.s !== 0)), eraN = eraOf(cal, ck.eras, now.year); if (eraN) { nowL.appendChild(document.createTextNode(' ')); nowL.appendChild(eraTag(eraN)); } body.appendChild(nowL);   // 1.6.2 (backlog 166 b): the era the date falls in
    otherCals(body, cal, ck, t, gm);   // 1.6.2 (backlog 60): the same day in each other calendar
    var sky = skyWords(cal, t); if (sky) body.appendChild(cel('div', 'cal-sky', sky));   // 1.6.2 (backlog 147): the season and each moon's phase
    if (gm && pend) pendPanel(body, cal);   // K5: what the time rules have due, first
    if (gm && typeof restPanel === 'function') restPanel(body, cal, camp, sys); else if (!gm && typeof restNow === 'function' && restNow(camp)) body.appendChild(cel('div', 'cal-rest cal-rest-pl', 'The party is resting: ' + restNow(camp).name + '. The GM ends the rest.'));   // backlog 138 (j) fold R2
    if (gm) liveRow(body, camp, ck);   // 1.5.4: the clock runs by itself, or is held
    var notes = notesOf(ck), g = gridOf(cal, view, t, pick, function(d0, len) { return noteDays(notes, cal, d0, d0 + len - 1); }), nav = cel('div', 'cal-nav');
    var tabs = cel('div', 'cal-tabs'); tabs.role = 'tablist';   // 1.6.2 (backlog 147): Month and Timeline
    [['month', 'Month', 'The month as a grid of days'], ['timeline', 'Timeline', 'Every dated note in date order']].forEach(function(tb) { var b = cbtn('cal-tab' + (calTab === tb[0] ? ' cal-tab-on' : ''), tb[1], tb[2], 'caltab'); b.dataset.tab = tb[0]; b.role = 'tab'; b.ariaSelected = calTab === tb[0] ? 'true' : 'false'; tabs.appendChild(b); });
    body.appendChild(tabs);
    if (calTab === 'timeline') timeline(body, cal, notes, now.day, gm, ck.eras);
    else {
    nav.appendChild(cbtn('cal-prev', '\u25c0', 'The period before', 'calprev')); var ttl = cel('span', 'cal-title', g.title), vEra = view && typeof view.yi === 'number' ? eraOf(cal, ck.eras, dateOf(cal, (timeOf(cal, { yi: view.yi, period: view.period, pday: 1 }) || 0)).year) : null; if (vEra) { ttl.appendChild(document.createTextNode(' ')); ttl.appendChild(eraTag(vEra)); } nav.appendChild(ttl); nav.appendChild(cbtn('cal-next', '\u25b6', 'The period after', 'calnext'));
    nav.appendChild(cbtn('cal-back', 'Today', 'Back to the period the clock is in', 'caltoday'));
    body.appendChild(nav);
    var grid = cel('div', 'cal-grid'); grid.style.gridTemplateColumns = 'repeat(' + g.cols + ', minmax(0, 1fr))';
    g.heads.forEach(function(h) { var hd = cel('div', 'cal-head', Array.from(h).slice(0, 3).join('')); hd.title = h; grid.appendChild(hd); });
    var rdS = typeof restDays === 'function' ? restDays(camp, dl) : [];   // fold R3: the days a rest spans
    g.cells.forEach(function(c) {
        if (!c) { grid.appendChild(cel('div', 'cal-blank')); return; }
        var b = cel('button', 'cal-day' + (rdS.some(function(x) { return x[0] <= c.day && c.day <= x[1]; }) ? ' cal-has-rest' : '') + (c.today ? ' cal-is-today' : '') + (c.picked ? ' cal-is-picked' : '') + (c.notes ? ' cal-has-note' : '') + (c.moons && c.moons.length ? ' cal-has-moon' : ''), String(c.n)); b.type = 'button'; b.dataset.day = String(c.day); b.title = fmtDate(cal, c.day * dl) + (c.today ? ' (today)' : '') + (c.moons && c.moons.length ? '. ' + moonWords(c.moons) : '') + (c.notes ? ' \u2014 ' + c.notes + ' note' + (c.notes === 1 ? '' : 's') : '');
        dayFace(b, c);   // 1.6.2: the moon's phase drawn, and New or Full on its day
        grid.appendChild(b);
    });
    body.appendChild(grid);
    comingUp(body, cal, notes, now.day, gm);
    }
    if (!gm) { if (pick !== null) { dayNotes(body, cal, notes, pick, false); if (typeof restDayList === 'function') restDayList(body, cal, camp, pick, false); } body.appendChild(cbtn('cal-hideme', 'Hide the clock for me', 'Takes the clock out of your header at this table; Settings \u25b8 This campaign brings it back', 'calhideme')); return; }
    var pr = cel('div', 'cal-pick');
    if (pick === null) pr.appendChild(cel('span', 'sys-note', 'Pick a day. Then set the clock to it, or add a note to it.'));
    else {
        var cc = cleanCalendar(cal) || {}, H = cc.hours || 24, M = cc.minutes || 60;
        pr.appendChild(cel('span', 'cal-pick-txt', fmtDate(cal, pick * dl)));
        [['cal-set-h', now.h, H - 1, 'The hour (0 to ' + (H - 1) + ')'], ['cal-set-m', now.m, M - 1, 'The minute (0 to ' + (M - 1) + ')']].forEach(function(f, i) {
            if (i) pr.appendChild(cel('span', 'cal-colon', ':'));
            var n = cel('input', 'field ' + f[0]); n.type = 'number'; n.min = '0'; n.max = String(f[2]); n.step = '1'; n.value = String(f[1]); n.title = f[3]; pr.appendChild(n);
        });
        var setB = cbtn('cal-set', 'Set the clock', 'The clock goes to this day at this time; later, you are asked whether the time rules run for the time skipped', 'calset'); pr.appendChild(setB);
    }
    body.appendChild(pr);
    if (pick !== null) { dayNotes(body, cal, notes, pick, true); if (typeof restDayList === 'function') restDayList(body, cal, camp, pick, true); }
    erasBox(body, cal, ck.eras);   // 1.6.2 (backlog 166 b)
    var kd = cel('div', 'cal-kind'); kd.appendChild(cel('span', 'sys-num-cap', 'Time passes as'));
    var rsW = restsOf(sys), defK = restDefault(sys), rN = restByPick(sys, restPick), onW = typeof restNow === 'function' ? restNow(camp) : null;   // backlog 138 (j) fold R1: a system with rests has one list, opening on its default
    if (onW) { rN = null; kd.appendChild(cel('span', 'sys-note cal-kind-note', 'Steps add to ' + onW.name + ' while the rest is on: rest time for those resting, activity for those awake.')); }   // fold R2: fixed while a rest is on
    else if (rsW.length) {
        var ks = cel('select', 'field cal-kind-sel'); ks.title = 'What the time you move on counts as. It opens on your default each time the window opens';
        [['active', 'Active: no rest'], ['rest', 'Rest: rest time only']].concat(rsW.map(function(r) { var lw = restLenWords(cal, sys, r); return [r.id, r.name + (lw ? ', ' + lw : '')]; })).forEach(function(o) { var op = cel('option', '', o[1] + (o[0] === defK ? ' (your default)' : '')); op.value = o[0]; ks.appendChild(op); });
        ks.value = restPick; kd.appendChild(ks);
    } else [['active', 'Active', 'Activity: the time rules that run any time'], ['rest', 'Rest', 'Rest: every time rule, and a rule during rest only counts it']].forEach(function(k) { var b = cbtn('cal-kind-btn' + ((k[0] === 'rest') === restMode ? ' cal-kind-on' : ''), k[1], k[2] + (k[0] === defK ? '. Your default' : ''), 'calkind'); b.dataset.kind = k[0]; kd.appendChild(b); });
    if (rN) kd.appendChild(cel('span', 'sys-note cal-kind-note', rN.time === false ? 'Steps count as ' + rN.name + ', which counts as activity.' : 'Steps count as ' + rN.name + ': rest time for the time rules.'));
    else if (restMode && !onW) kd.appendChild(cel('span', 'sys-note cal-kind-note', 'Rules for rest count while you step this way.'));   // 159: the steps say it (the owner by prompt: "The steps say it (Recommended)")
    body.appendChild(kd);
    var st = cel('div', 'cal-steps'), ofR = restMode ? ' of rest' : ''; st.appendChild(cel('span', 'sys-num-cap', 'Move time on'));
    stepsOf(cal).forEach(function(s) { var b = cbtn('cal-step', s.label + ofR, 'Move the clock on ' + fmtSpan(cal, s.secs) + ofR, 'calstep'); b.dataset.secs = String(s.secs); st.appendChild(b); });
    body.appendChild(st);
    var an = cel('div', 'cal-any'), ai = cel('input', 'field cal-any-n'); ai.type = 'number'; ai.step = 'any'; ai.placeholder = 'Amount'; ai.title = 'How much: below 0 moves the clock back'; an.appendChild(ai);
    var us = cel('select', 'field cal-any-u'); us.title = 'What the amount counts in'; unitsOf(cal, sys).forEach(function(u) { var o = cel('option', '', u.name); o.value = u.id; us.appendChild(o); }); an.appendChild(us);
    var goB = cbtn('cal-any-go', restMode ? 'Move as rest' : 'Move', 'Move the clock on (or back) by this amount' + (restMode ? ', as rest' : ''), 'calany'); an.appendChild(goB);
    body.appendChild(an);
    var hl = cel('label', 'cal-tick'), hc = cel('input', 'cal-hide'); hc.type = 'checkbox'; hc.checked = !ck.hide; hc.title = 'Off: players see no date or time; you still do';
    hl.appendChild(hc); hl.appendChild(document.createTextNode(' Players see the date')); body.appendChild(hl);
    var rd = cel('div', 'sys-note cal-round'); rd.appendChild(document.createTextNode('Fights keep their own time. ')); rd.title = 'Each round adds ' + fmtSpan(cal, roundSecs(sys)) + ', the round\u2019s length from the Combat tab\u2019s Turns box. While fights run, the clock shows the fight furthest behind.'; rd.appendChild(cbtn('cal-help', 'More in Help', 'How the clock and fights keep time, in Help', 'calhelp')); body.appendChild(rd);   // 1.6.2 (the owner: "Rules to Help"): the rules are Help's, the window points there
}
// The running clock (1.5.4; the owner, 2026-10-04: "id like it to run by default", and by prompt: while a session is open, held in a fight —
// rounds move it — and "both real time and a speed i can set should be available, real time by default"). On the GM's machine, while it
// hosts a table, game time moves on with real time times the campaign's speed (camp.clock.rate: stored only when it is not 1), a whole game
// minute at a time, kept on whole minutes. It waits while the table is paused, while a fight runs on any map (the clock then follows the fight
// furthest behind: 152), and while the GM holds it (camp.clock.hold: only the hold is stored, so a campaign that never touched it runs). Two looks more than
// two minutes apart (the machine slept) count as two minutes. A minute that passes is no change of the GM's own hand: no log line, no undo
// pass and no stamp on the map — the table is told (net.syncClock), timed effects run, a dated note reached is said, and the file is written
// by the quiet save a moved view uses (io.js saveView). To the time rules it is Active time: Run at once runs them as it passes; Ask me
// counts it and, when a rule comes due, marks the chip and says so once, never opening the window under the GM's hands
// [calendarcheck:live-start]
var LIVE_GAP = 120000, LIVE_EVERY = 5000, liveAt = 0, liveMs = 0, liveBankAt = 0, livePend = 0, liveWas = null, liveSaid = false;
// 1.6.2: the system's start for the running clock (systemcore clockStart), and how a fight moves it (fightClock); with none at hand, as before
function sysClockStart() { var S = typeof window !== 'undefined' ? window.wpSystemCore : null, sys = null; try { sys = typeof sysNow === 'function' ? sysNow() : null; } catch (e) { sys = null; } return S && typeof S.clockStart === 'function' ? S.clockStart(sys) : { held: false, rate: 1 }; }
function fightMode() { var S = typeof window !== 'undefined' ? window.wpSystemCore : null, sys = null; try { sys = typeof sysNow === 'function' ? sysNow() : null; } catch (e) { sys = null; } return S && typeof S.fightClock === 'function' ? S.fightClock(sys) : 'sync'; }
function liveRate(ck) { return ck && typeof ck.rate === 'number' && CAL_LIMITS.rates.indexOf(ck.rate) >= 0 ? ck.rate : sysClockStart().rate; }   // the GM's speed, else the system's
function liveHold(ck) { return !!ck && (ck.hold === true || (ck.hold !== false && sysClockStart().held)); }   // the GM's hold either way, else the system's start
function liveHeld(camp) {   // '' while the clock runs by itself, else why it does not: off, hold, solo, paused, fight
    var n = net(), ck = clockOf(camp);
    if (!camp || isPlayer() || !clockOn()) return 'off';   // clockOn: the Calendar is on, and this is not the stream window
    if (typeof restNow === 'function' && restNow(camp)) return 'rest';   // backlog 138 (j) fold R2: it waits while the party rests
    if (liveHold(ck)) return 'hold';
    if (!(n && n.active && n.role === 'host')) return 'solo';
    if (n.paused) return 'paused';
    if (n.combats && typeof n.combats === 'object' && Object.keys(n.combats).some(function(k) { return !!n.combats[k]; }) && fightMode() !== 'runs') return 'fight';   // 1.6.2: a system whose clock runs on in a fight
    return '';
}
function liveWords(why, rate) {
    if (why === '') return rate === 1 ? 'Running in real time while your table is open.' : 'Running at \u00d7' + rate + ' while your table is open: ' + rate + ' seconds of the game to each second at the table.';
    if (why === 'hold') return 'Held: the clock moves only by your steps and by a fight\u2019s rounds.';
    if (why === 'rest') return 'Waiting: the party is resting. It runs again when you end the rest.';
    if (why === 'solo') return 'It runs by itself while you host a session: no table is open now.';
    if (why === 'paused') return 'Waiting: the table is paused.';
    if (why === 'fight') return 'Waiting: a fight is on. The clock follows the fight furthest behind.';
    return '';
}
// [calendarcheck:othercals-start]
// 1.6.2 (backlog 60; the owner, 2026-11-07, by prompt: "Yes, header shows one"): the day in each other calendar of the system, a line each, and for
// the GM which one the top row shows (camp.clock.cal, sent to players with the clock). Names and dates as text nodes
function otherCals(body, cal, ck, t, gm) {
    var names = calNamesOf(cal); if (names.length < 2) return;
    for (var k = 1; k < names.length; k++) { var ln = cel('div', 'cal-also'); ln.appendChild(cel('span', 'cal-also-name', names[k] + ': ')); ln.appendChild(cel('span', 'cal-also-date', fmtDateIn(cal, k, t))); body.appendChild(ln); }
    if (!gm) return;
    var row = cel('div', 'cal-show'); row.appendChild(cel('span', 'sys-num-cap', 'The top row shows'));
    var sel = cel('select', 'field cal-show-sel'); sel.title = 'Which calendar the date in the top row is in, for you and your players';
    names.forEach(function(n, k) { var o = cel('option', '', k ? n : 'The main calendar'); o.value = String(k); sel.appendChild(o); });
    sel.value = String(viewCal(cal, ck.cal).k); row.appendChild(sel); body.appendChild(row);
}
function setShowCal(k) {
    var camp = getActiveCampaign(); if (!camp || isPlayer()) return false;
    var ck = clockOf(camp) || { t: 0 }, n = calNamesOf(sysCal()).length, v = Number(k), cur = typeof ck.cal === 'number' ? ck.cal : 0; if (!(v >= 0 && v < n && Math.floor(v) === v) || v === cur) return false;
    var nc = Object.assign({}, ck); if (v) nc.cal = v; else delete nc.cal; camp.clock = nc;
    if (net() && net().logEvent) net().logEvent('time', 'The top row shows ' + (v ? calNamesOf(sysCal())[v] : 'the main calendar'));
    save(); refresh(); if (winOpen()) renderWin(); return true;
}
// [calendarcheck:othercals-end]
function liveRow(body, camp, ck) {   // the GM's window: Runs / Held, the speed, and what the clock is doing now
    var held = liveHold(ck), rate = liveRate(ck), row = cel('div', 'cal-live');
    row.appendChild(cel('span', 'sys-num-cap', 'The clock'));
    [['run', '\u25b6 Runs', 'The clock runs by itself while a session is open: it waits while the table is paused and while a fight is on'], ['hold', '\u275A\u275A Held', 'The clock moves only by your steps and by a fight\u2019s rounds']].forEach(function(k) {
        var b = cbtn('cal-live-btn' + ((k[0] === 'hold') === held ? ' cal-kind-on' : ''), k[1], k[2], 'callive'); b.dataset.live = k[0]; row.appendChild(b);
        if (k[0] === 'run' && !held && liveHeld(camp) !== '') { b.className += ' cal-live-wait'; b.title = k[2] + '. Picked, but not running now: the line below says why.'; }   // 1.6.2: Runs picked while the clock waits is drawn half lit
    });
    var sel = cel('select', 'field cal-live-rate'); sel.title = 'How fast the clock runs by itself';
    CAL_LIMITS.rates.forEach(function(r) { var o = cel('option', '', r === 1 ? 'Real time' : '\u00d7' + r); o.value = String(r); sel.appendChild(o); });
    sel.value = String(rate); row.appendChild(sel);
    body.appendChild(row);
    body.appendChild(cel('div', 'sys-note cal-live-note', liveWords(liveHeld(camp), rate)));
}
function setHold(hold) {
    var camp = getActiveCampaign(); if (!camp || isPlayer()) return false;
    var ck = clockOf(camp) || { t: 0 }; if (liveHold(ck) === (hold === true)) return false;
    var nc = Object.assign({}, ck); if ((hold === true) === sysClockStart().held) delete nc.hold; else nc.hold = hold === true; camp.clock = nc;   // 1.6.2: kept only where it is not the system's start
    liveAt = 0; liveMs = 0;
    if (net() && net().logEvent) net().logEvent('time', hold === true ? 'The clock is held' : 'The clock runs by itself again');
    save(); refresh(); return true;
}
function setRate(r) {
    var camp = getActiveCampaign(); if (!camp || isPlayer() || CAL_LIMITS.rates.indexOf(r) < 0) return false;
    var ck = clockOf(camp) || { t: 0 }; if (liveRate(ck) === r) return false;
    var nc = Object.assign({}, ck); if (r === sysClockStart().rate) delete nc.rate; else nc.rate = r; camp.clock = nc;
    save(); refresh(); return true;
}
function liveTick(now) {   // one look at the wall clock, about once a second on the GM's machine
    var camp = getActiveCampaign(), why = liveHeld(camp);
    if (why !== liveWas) { liveWas = why; refresh(); }   // the chip's mark and an open window say what the clock is doing
    if (why) { liveAt = 0; return false; }
    if (!liveAt) { liveAt = now; return false; }
    var dt = now - liveAt; liveAt = now; if (!(dt > 0)) return false;
    var ck = clockOf(camp) || { t: 0 }, S = (cleanCalendar(sysCal()) || {}).seconds || 60;
    liveMs += Math.min(dt, LIVE_GAP) * liveRate(ck);
    if (liveBankAt && now - liveBankAt < LIVE_EVERY) return false;   // at a fast speed: at most one move in five seconds
    var off = ck.t % S, mins = Math.floor((liveMs / 1000 + off) / S); if (mins < 1) return false;
    var secs = mins * S - off; liveMs -= secs * 1000; liveBankAt = now;
    if (!moveTo(ck.t + secs, null, true)) return false;   // live time is Active time (moveTo counts it: run at once under Run at once, counted and asked about under Ask me, nothing under Off)
    if (!liveSaid) { liveSaid = true; toast('The game clock runs by itself while your table is open. Press the date in the top row to hold it or change its speed.'); }
    return true;
}
// [calendarcheck:live-end]
// The GM moves the clock to a moment (clamped to the calendar's range): saved, sent to the table with the save, and said in the
// session log when the GM's hand moved it (why). 152: a move on with no fight running is a stretch of each character's own time (ownTime: its timed
// effects and its time rules; how: { rest, ask }, rest and a Set that asks), judged against the clock as it was; own: the second of the fights, whose
// spans ownTime has counted already. A step back keeps the highest second reached (top), so moving on again lives nothing twice
function moveTo(t1, why, live, own, how) {   // live (1.5.4): the clock ran by itself — the table is told and the file written quietly, with no save of the GM's own
    var camp = getActiveCampaign(); if (!camp || isPlayer() || typeof t1 !== 'number' || !isFinite(t1)) return false;
    var ck = clockOf(camp) || { t: 0 }, cal = sysCal(); t1 = Math.max(0, Math.min(CAL_LIMITS.time, Math.floor(t1)));
    if (t1 === ck.t) return false;
    if (ck.rest && t1 < ck.t) { toast('End the rest first.'); return false; }   // backlog 138 (j) fold R2: no step back while a rest is on
    var hits = notesReached(notesOf(ck), ck.t, t1, dayLength(cal), cal), gone = t1 - ck.t, gs = [];   // K3: the dated notes this move reaches, told to the GM
    if (gone > 0 && own !== true) {   // 152: each character's own time; backlog 138 (j) fold R2: a rest's who rests counts as rest, who is awake as activity, and nobody else
        var whoM = how && how.who && typeof how.who === 'object' ? how.who : ck.rest && ck.rest.who ? ck.rest.who : null, mk = function(ids, rest) { return { kind: 'clock', ids: ids, t0: ck.t, t1: t1, secs: gone, rest: rest, ask: !!(how && how.ask === true), live: live === true }; };
        if (whoM) [['rest', true], ['awake', false]].forEach(function(p) { var ids = charIdsOf(camp).filter(function(id) { return whoM[id] === p[0]; }); if (ids.length) gs.push(mk(ids, p[1])); });
        else gs.push(mk(charIdsOf(camp), !!(how && how.rest === true)));
        gs.forEach(function(g) { g.spans = spansOf(camp, g); ck = clockOf(camp) || ck; });
    }
    var nc = Object.assign({}, ck, { t: t1 }); if (gone < 0) nc.top = ck.top || { s: ck.t, ms: 0 };   // 152: a step back keeps the highest second reached
    if (how && how.restOn) nc.rest = how.restOn; else if (nc.rest && gone > 0) nc.rest = Object.assign({}, nc.rest, { to: t1 });
    if (how && how.restMap) nc.restMap = how.restMap;   // fold R5: the campaign's rest map, as the call box left it
    var skipDo = null;
    if (how && how.skip && how.skip.len && gone > 0 && !ck.rest && typeof restSkipRec === 'function') { var lenS = everySecs(cal, sysUnits(sysNow()), how.skip.len); if (lenS > 0 && gone >= lenS) { nc.rests = (ck.rests || []).concat([restSkipRec(how.skip, ck.t, t1, lenS)]); if ((Array.isArray(how.skip.does) && how.skip.does.length) || how.skip.ends === true) skipDo = { does: how.skip.does || [], n: Math.floor(gone / lenS), rest: how.skip }; } }   // fold R4: and its list, once each whole length, for the players' characters   // fold R3: a skip that held a rest by name for its length   // fold R2: the rest called, or a step that adds to it
    camp.clock = cleanClock(nc) || { t: t1 };
    if (why && net() && net().logEvent) net().logEvent('time', why + ' \u2014 now ' + fmtWhen(cal, t1));
    hits.forEach(function(n) { if (net() && net().logEvent) net().logEvent('time', 'Note reached \u2014 ' + fmtDate(cal, n.day * dayLength(cal)) + ': ' + n.text); });
    if (hits.length) toast(hits.length === 1 ? 'Today: ' + hits[0].text : hits.length + ' dated notes reached: ' + hits.slice(0, 3).map(function(n) { return n.text; }).join('; ') + (hits.length > 3 ? '; \u2026' : ''));
    if (gs.length) { try { ownTime(gs); } catch (e) { console.error(e); } }
    if (gone > 0 && own !== true && typeof window !== 'undefined' && typeof window.wpCloudTime === 'function') { try { window.wpCloudTime(gone); } catch (e) { console.error(e); } }   // 1.6.2: a cloud counts game time where no fight runs   // K4, K5: each character's span of it, once, to its timed effects and its time rules; a rule that fails never keeps the move from being saved and told
    if (live === true) { if (net() && net().syncClock) net().syncClock(); saveView(); } else save();
    if (skipDo && window.wpSheets && typeof window.wpSheets.restDoes === 'function') { try { window.wpSheets.restDoes(charIdsOf(camp).filter(function(id) { return isPc(camp.chars[id]); }), skipDo.does, skipDo.n, skipDo.rest); } catch (e) { console.error(e); } }
    refresh(live === true); return true;
}
// K3: the GM's edits to the notes — cleaned as a load reads them, saved, the window redrawn
function editNotes(fn) {
    var camp = getActiveCampaign(); if (!camp || isPlayer()) return false;
    var ck = clockOf(camp) || { t: 0 }, list = notesOf(ck).map(function(n) { return Object.assign({}, n); }); if (fn(list) === false) return false;
    camp.clock = cleanClock(Object.assign({}, ck, { notes: list })) || { t: ck.t };
    save(); refresh(); return true;
}
function addNote(day, text, shown, yearly) {
    var tx = typeof text === 'string' ? text.trim() : ''; if (!(typeof day === 'number' && day >= 0 && Math.floor(day) === day) || !tx) return false;
    return editNotes(function(list) { if (list.length >= CAL_LIMITS.notes) { toast('At most ' + CAL_LIMITS.notes + ' notes.'); return false; } var n = { id: newNoteId(), day: day, text: tx, at: Date.now() }; if (shown) n.vis = 'all'; if (yearly === true) n.yearly = true; list.push(n); });   // 1.6.2 (backlog 147): the real moment it was written, the GM's own
}
function noteVis(id, shown) { return editNotes(function(list) { var n = list.filter(function(x) { return x.id === id; })[0]; if (!n) return false; if (shown) n.vis = 'all'; else delete n.vis; }); }
function noteYearly(id, on) { return editNotes(function(list) { var n = list.filter(function(x) { return x.id === id; })[0]; if (!n) return false; if (on) n.yearly = true; else delete n.yearly; }); }   // 1.6.2 (backlog 166 b)
function delNote(id) { return editNotes(function(list) { var i = -1; list.forEach(function(x, k) { if (x.id === id) i = k; }); if (i < 0) return false; list.splice(i, 1); }); }
function moveBy(secs, rest, skip) { var camp = getActiveCampaign(), cal = sysCal(); if (typeof secs !== 'number' || !isFinite(secs) || !secs) return false; if (skip) return moveTo(tOf(camp) + secs, (secs > 0 ? 'Moved on ' : 'Moved back ') + fmtSpan(cal, secs) + ' as ' + skip.name, false, false, { rest: rest === true, skip: skip }); return moveTo(tOf(camp) + secs, (secs > 0 ? 'Moved on ' : 'Moved back ') + fmtSpan(cal, secs), false, false, { rest: rest === true }); }
function setHidden(hide) {
    var camp = getActiveCampaign(); if (!camp || isPlayer()) return false;
    var ck = clockOf(camp) || { t: 0 }; if (!!ck.hide === !!hide) return false;
    var nc = { t: ck.t }; if (hide) nc.hide = true; camp.clock = Object.assign({}, ck, nc); if (!hide) delete camp.clock.hide;
    if (net() && net().logEvent) net().logEvent('time', hide ? 'Players no longer see the date' : 'Players see the date again');
    save(); refresh(); return true;
}
// 1.5.5 (the release trace, loss 3): why the steps, Move and Set move nothing while a fight runs, naming each map that holds a fight by its own title,
// so a fight forgotten on another map is found: three names at most, then how many more. Plain text, which the notice draws as text
function fightHolds(camp) {
    var n = net(), cs = n && n.combats && typeof n.combats === 'object' ? n.combats : null, items = camp && camp.items && typeof camp.items === 'object' ? camp.items : null, ids = [], nF = 0;
    if (cs) Object.keys(cs).forEach(function(k) { var c = cs[k]; if (!c || typeof c !== 'object') return; nF++; var m = typeof c.mapId === 'string' ? c.mapId : ''; if (ids.indexOf(m) < 0) ids.push(m); });
    var names = ids.map(function(m) { var it = items && m && Object.prototype.hasOwnProperty.call(items, m) ? items[m] : null, t = it && it.meta && typeof it.meta.title === 'string' ? it.meta.title.trim() : ''; return t || 'a map with no name'; });
    var more = names.length - 3, shown = names.slice(0, 3), list = more > 0 ? shown.join(', ') + ' and ' + more + ' more map' + (more === 1 ? '' : 's') : shown.length > 1 ? shown.slice(0, -1).join(', ') + ' and ' + shown[shown.length - 1] : (shown[0] || '');
    return (!list ? 'A fight is on' : (nF > 1 ? 'Fights run on ' : 'A fight runs on ') + list) + ', so the clock follows the fight furthest behind. The steps, Move and Set work again once every fight has ended.';
}
function calHelp() {   // Help at its Calendar heading, which says how fights and the clock keep time
    closeWin(); if (typeof window.wpOpenHelp === 'function') window.wpOpenHelp('grids');
    var h = document.getElementById('helpCalendar'); if (!h) return;
    setTimeout(function() { try { h.scrollIntoView({ block: 'start', behavior: 'auto' }); } catch (e) {} h.classList.remove('help-hit'); void h.offsetWidth; h.classList.add('help-hit'); setTimeout(function() { h.classList.remove('help-hit'); }, 1800); }, 60);
}
function onWinClick(e) {
    var b = e.target && e.target.closest ? e.target.closest('button') : null; if (!b) return;
    if (b.id === 'calendarClose') { closeWin(); return; }
    if (b.dataset.act === 'calhelp') { calHelp(); return; }   // 1.6.2: the rules of time, in Help
    var camp = getActiveCampaign(), cal = sysCal(), act = b.dataset.act || '';
    if (b.classList.contains('cal-day')) { var d = Number(b.dataset.day); if (d >= 0 && Math.floor(d) === d) { pick = pick === d ? null : d; renderWin(); } return; }
    if (act === 'calprev' || act === 'calnext') { view = stepView(cal, view || viewOf(cal, tOf(camp)), act === 'calnext' ? 1 : -1); renderWin(); return; }
    if (act === 'caltoday') { view = viewOf(cal, tOf(camp)); pick = null; renderWin(); return; }
    if (act === 'caltab') { calTab = b.dataset.tab === 'timeline' ? 'timeline' : 'month'; renderWin(); return; }   // 1.6.2 (backlog 147): Month or Timeline
    if (act === 'caltlday') { var td = Number(b.dataset.day); if (td >= 0 && Math.floor(td) === td) { calTab = 'month'; pick = td; view = viewOf(cal, td * dayLength(cal)); renderWin(); } return; }   // a timeline row opens its day on the month
    if (isPlayer()) { if (act === 'calhideme' && window.wpVtt && window.wpVtt.setLocal('calendar', true)) { closeWin(); toast('The clock is hidden for you. Settings \u25b8 This campaign brings it back.'); } return; }
    var body = document.getElementById('calendarBody'), q = function(c) { return body ? body.querySelector('.' + c) : null; };
    if (act === 'calkind') { if (b.dataset.kind === 'rest' && ordersRun()) { restPickSet(sysNow(), 'active'); toast('A fight is running: time passes as Active until it ends.'); renderWin(); return; } restPickSet(sysNow(), b.dataset.kind === 'rest' ? 'rest' : 'active'); renderWin(); return; }   // K5; 1.5.7: no Rest while a fight runs
    if (act === 'callive') { setHold(b.dataset.live === 'hold'); return; }   // 1.5.4: Runs / Held
    if (act === 'restcall') { if (restOpen(String(b.dataset.rid || ''))) renderWin(); else { var rwW = restWait(camp); if (rwW) toast(rwW + '.'); } return; }   // backlog 138 (j) fold R2
    if (act === 'reststart') { restStart(); renderWin(); return; }
    if (act === 'restcancel') { restCall = null; renderWin(); return; }
    if (act === 'restend') { var onE = restNow(camp); if (restCut.on && typeof restEndEarly === 'function' && !(typeof restCutWhy === 'function' && restCutWhy(camp, onE))) restEndEarly(); else { restCut.on = false; restEnd(); } renderWin(); return; }   // the early end, where ticked and still possible (the review of 2026-11-10: a rest that could no longer be cut short could not be ended at all)
    if (act === 'calrrdel') { var rrD = String(b.dataset.rr || ''), rrR = restRecs(camp).filter(function(x) { return x.id === rrD; })[0]; if (!rrR) return; (typeof showConfirm === 'function' ? showConfirm : function(q, f) { f(true); })('Remove the record of ' + rrR.name + '? Its notes go with it.', function(yes) { if (yes) editRests(function(list) { var i = -1; list.forEach(function(x, k) { if (x.id === rrD) i = k; }); if (i < 0) return false; list.splice(i, 1); }); }); return; }   // fold R3
    if (act === 'calset' && restNow(camp)) { toast('End the rest first.'); return; }
    if (act === 'calpendapply') { pendDone(true); return; }
    if (act === 'calpendskip') { pendDone(false); return; }
    if ((act === 'calstep' || act === 'calany' || (act === 'calset' && pick !== null)) && ordersRun() && fightMode() === 'sync') { toast(fightHolds(camp)); return; }   // 1.6.2: only where a fight moves the clock   // 152: while a fight runs the clock follows it; nothing is greyed (159), a press says why
    if (act === 'calstep') { moveBy(Number(b.dataset.secs), restMode, restByPick(sysNow(), restPick)); return; }
    if (act === 'caladdnote' && pick !== null) { var nt = q('cal-note-new'), nv = q('cal-note-newvis'), ny = q('cal-note-newyearly'), txt = nt ? String(nt.value || '').trim() : ''; if (!txt) { toast('Type the note first.'); return; } addNote(pick, txt, !!(nv && nv.checked === true), !!(ny && ny.checked === true)); return; }
    if (act === 'caleraadd') { var ea = q('cal-era-newname'), ef = q('cal-era-newfrom'), et = q('cal-era-newto'), fv = ef && String(ef.value).trim() !== '' ? Number(ef.value) : NaN, tv = et && String(et.value).trim() !== '' ? Number(et.value) : null; addEra(ea ? String(ea.value || '') : '', fv, tv); return; }   // 1.6.2 (backlog 166 b)
    if (act === 'caleradel') { eraSet(b.dataset.era, 'del'); return; }
    if (act === 'calnotedel') { delNote(b.dataset.note); return; }
    if (act === 'calany') {
        var ni = q('cal-any-n'), ui = q('cal-any-u'), n = ni ? Number(ni.value) : NaN, u = ui ? unitsOf(cal, sysNow()).filter(function(x) { return x.id === ui.value; })[0] : null;
        if (!u || !(String(ni.value).trim() !== '' && isFinite(n)) || !n) { toast('Type an amount: below 0 moves the clock back.'); return; }
        moveBy(Math.round(n * u.secs), restMode, restByPick(sysNow(), restPick)); return;
    }
    if (act === 'calset' && pick !== null) {
        var cc = cleanCalendar(cal) || {}, H = cc.hours || 24, M = cc.minutes || 60, S = cc.seconds || 60, hi = q('cal-set-h'), mi = q('cal-set-m'), h = hi ? Number(hi.value) : 0, m = mi ? Number(mi.value) : 0;
        if (!(h >= 0 && h < H && Math.floor(h) === h && m >= 0 && m < M && Math.floor(m) === m)) { toast('The hour is 0 to ' + (H - 1) + ' and the minute 0 to ' + (M - 1) + '.'); return; }
        var t1 = pick * dayLength(cal) + (h * M + m) * S; if (moveTo(t1, 'Set', false, false, { rest: restMode, ask: true, skip: restByPick(sysNow(), restPick) })) { view = viewOf(cal, t1); pick = null; renderWin(); }   // K5: a Set forward asks (the GM's choice), whatever the table's mode
    }
}
function onWinChange(e) {
    var tg = e.target; if (!tg || !tg.classList) return;
    if (tg.classList.contains('cal-hide')) setHidden(tg.checked !== true);
    else if (tg.classList.contains('cal-live-rate')) { if (!isPlayer()) setRate(Number(tg.value)); }
    else if ((tg.classList.contains('cal-rr-notes') || tg.classList.contains('cal-rr-vis')) && tg.dataset && !isPlayer()) { var rrI = String(tg.dataset.rr || ''), isN = tg.classList.contains('cal-rr-notes'); editRests(function(list) { var x = list.filter(function(y) { return y.id === rrI; })[0]; if (!x) return false; if (isN) { if (String(tg.value).trim()) x.notes = String(tg.value); else delete x.notes; } else if (tg.checked) x.vis = 'all'; else delete x.vis; }); }   // fold R3: a record's notes
    else if ((tg.classList.contains('cal-rest-notes') || tg.classList.contains('cal-rest-vis')) && !isPlayer()) { var isN2 = tg.classList.contains('cal-rest-notes'); editRests(function(list, on) { if (!on) return false; if (isN2) { if (String(tg.value).trim()) on.notes = String(tg.value); else delete on.notes; } else if (tg.checked) on.vis = 'all'; else delete on.vis; }); }   // fold R3: the open rest's notes
    else if (restCall && tg.classList.contains('cal-restcall-n')) { var rnN = Number(tg.value); if (Math.floor(rnN) === rnN && rnN >= 1 && rnN <= 1000) restCall.n = rnN; renderWin(); }   // backlog 138 (j) fold R2: the call box
    else if (restCall && tg.classList.contains('cal-restcall-u')) { restCall.u = String(tg.value); renderWin(); }
    else if (restCall && tg.classList.contains('cal-restcall-go')) { restCall.go = !!tg.checked; var campG = getActiveCampaign(); if (restCall.go && !restMapOf(campG, restCall.map)) { var rmF = restMapFirst(campG); restCall.map = rmF ? rmF.id : ''; } renderWin(); }   // fold R5: the rest map
    else if (restCall && tg.classList.contains('cal-restcall-map')) { if (restMapOf(getActiveCampaign(), String(tg.value))) restCall.map = String(tg.value); renderWin(); }
    else if (restCall && tg.classList.contains('cal-restcall-npc') && tg.dataset && typeof tg.dataset.tok === 'string') { if (tg.checked) restCall.npcs[tg.dataset.tok] = true; else delete restCall.npcs[tg.dataset.tok]; }
    else if (tg.classList.contains('cal-rest-back')) restBackOn = !!tg.checked;
    else if (tg.classList.contains('cal-rest-cut')) { restCut.on = !!tg.checked; renderWin(); }   // the early end
    else if (tg.classList.contains('cal-restcut-n')) { var rcN = Number(tg.value); if (Math.floor(rcN) === rcN && rcN >= 1 && rcN <= 1000) restCut.n = rcN; renderWin(); }
    else if (tg.classList.contains('cal-restcut-u')) { restCut.u = String(tg.value); renderWin(); }
    else if (restCall && tg.classList.contains('cal-restcall-who') && tg.dataset && typeof tg.dataset.char === 'string' && Object.prototype.hasOwnProperty.call(restCall.who, tg.dataset.char)) restCall.who[tg.dataset.char] = tg.value === 'rest' || tg.value === 'awake' ? tg.value : 'none';
    else if (tg.classList.contains('cal-kind-sel')) { if (!isPlayer()) { var sysK = sysNow(), kv = String(tg.value || 'active'); if (kv !== 'active' && pickIsRest(sysK, kv) && ordersRun()) { restPickSet(sysK, 'active'); toast('A fight is running: time passes as Active until it ends.'); } else restPickSet(sysK, kv); renderWin(); } }   // backlog 138 (j) fold R1
    else if (tg.classList.contains('cal-show-sel')) { if (!isPlayer()) setShowCal(Number(tg.value)); }   // 1.6.2 (backlog 60)   // 1.5.4: the running clock's speed
    else if (tg.classList.contains('cal-note-vis') && tg.dataset) noteVis(tg.dataset.note, tg.checked === true);   // K3
    else if (tg.classList.contains('cal-note-yearly') && tg.dataset) { if (!isPlayer()) noteYearly(tg.dataset.note, tg.checked === true); }   // 1.6.2 (backlog 166 b)
    else if (tg.dataset && typeof tg.dataset.era === 'string' && !isPlayer()) {   // 1.6.2 (backlog 166 b): an era's own boxes
        var ek = tg.classList.contains('cal-era-name') ? 'name' : tg.classList.contains('cal-era-from') ? 'from' : tg.classList.contains('cal-era-to') ? 'to' : tg.classList.contains('cal-era-color') ? 'color' : tg.classList.contains('cal-era-vis') ? 'vis' : '';
        var ev = ek === 'vis' ? tg.checked === true : ek === 'from' ? (String(tg.value).trim() === '' ? NaN : Number(tg.value)) : ek === 'to' ? (String(tg.value).trim() === '' ? null : Number(tg.value)) : String(tg.value || '');
        if (ek && !eraSet(tg.dataset.era, ek, ev)) renderWin();
    }
    else if (tg.classList.contains('cal-pend-tick') && tg.dataset && pend && typeof tg.dataset.char === 'string' && Object.prototype.hasOwnProperty.call(pend.on, tg.dataset.char)) pend.on[tg.dataset.char] = tg.checked === true;   // K5
    else if (tg.classList.contains('cal-pend-run') && tg.dataset && typeof tg.dataset.char === 'string') { if (!setRulesRun(tg.dataset.char, tg.checked === true)) tg.checked = rulesRun(tg.dataset.char) === true; }   // 152 fold 4b: the Rules run switch, put back where it was not kept
}
// [sinkcheck:calendarwin-end]
// [calendarcheck:played-start]
// 1.6.2 (backlog 166 h; the owner, 2026-11-10, by prompt: "Also the sessions played"): a session that begins notes where the clock stands, so
// the timeline marks it. The GM's machine alone, with the Calendar on; one at the same moment as the last is no new one. Saved quietly
function sessionBegan(camp) {
    if (!camp || isPlayer() || !clockOn() || (window.wpVtt && window.wpVtt.campaignOn && !window.wpVtt.campaignOn('calendar', camp))) return false;
    var ck = clockOf(camp) || { t: 0 }, pl = Array.isArray(ck.played) ? ck.played.slice() : [], last = pl[pl.length - 1];
    if (last && last.t === ck.t) return false;
    pl.push({ t: ck.t, at: Date.now() });
    var nc = Object.assign({}, ck, { played: pl }), cl = cleanClock(nc); if (!cl) return false;
    camp.clock = cl; save(true);
    if (typeof window.wpStepLog === 'function') window.wpStepLog('timeline v1', 'session', { n: (cl.played || []).length });
    return true;
}
// What the timeline window reads: the calendar and the clock as this screen holds them, or null where the Calendar is not shown
function timeData() { var camp = getActiveCampaign(); return shown(camp) ? { cal: sysCal(), ck: clockOf(camp) || { t: 0 } } : null; }
// A day opened in the Calendar window, on the month with that day picked
function openDay(day) {
    var camp = getActiveCampaign(), cal = sysCal(); if (!shown(camp) || typeof day !== 'number' || day < 0 || Math.floor(day) !== day) return false;
    var m = document.getElementById('calendarModal'); if (!m) return false;
    if (camp.id !== winCamp) { winCamp = camp.id; pendFor(camp); }
    calTab = 'month'; pick = day; view = viewOf(cal, day * dayLength(cal)); m.style.display = 'flex'; renderWin(); return true;
}
// [calendarcheck:played-end]
function openWin() { var m = document.getElementById('calendarModal'); if (!m || !shown(getActiveCampaign())) return; view = null; pick = null; if (typeof restPickSet === 'function') { var sysO = sysNow(); restPickSet(sysO, restDefault(sysO)); } m.style.display = 'flex'; renderWin(); }   // backlog 138 (j) fold R1: it opens on the system's default
function closeWin() { var m = document.getElementById('calendarModal'); if (m) m.style.display = 'none'; }
function winOpen() { var m = document.getElementById('calendarModal'); return !!m && m.style.display !== 'none'; }
// The header's chip (every render): the date and time, for the GM with a mark while players do not see it; the open window redrawn
// only when what it shows changed (a render never takes a half-typed amount away)
function refresh(live) {   // live (1.5.4): the clock ran by itself, or a host's word of it arrived
    var chip = document.getElementById('clockChip'); if (!chip) return;
    var camp = getActiveCampaign(), on = shown(camp); chip.style.display = on ? '' : 'none';
    if (window.wpTimeline && typeof window.wpTimeline.refresh === 'function') { try { window.wpTimeline.refresh(); } catch (e) {} }   // 1.6.2 (backlog 166 h): its window follows the clock
    if (!on) { if (winOpen()) closeWin(); return; }
    var cal = sysCal(), ck = clockOf(camp) || { t: 0 }, txt = chip.querySelector('.clock-txt'), words = fmtIn(cal, ck.cal, ck.t);   // 1.6.2 (backlog 60): in the calendar the GM picked
    if (txt && txt.textContent !== words) txt.textContent = words;
    var off = !isPlayer() && !!ck.hide; chip.classList.toggle('clock-private', off);
    var why = isPlayer() ? 'off' : liveHeld(camp), run = chip.querySelector('.clock-run'), mark = why === '' ? '\u25b6' : why === 'hold' || why === 'paused' || why === 'fight' ? '\u275A\u275A' : '';   // 1.5.4: the GM sees whether the clock is running
    if (run && run.textContent !== mark) run.textContent = mark;
    var resting = typeof restNow === 'function' && !!restNow(camp); chip.classList.toggle('clock-resting', resting); if (run) { run.classList.toggle('wib', resting); run.classList.toggle('wi-bed', resting); }   // backlog 138 (j) fold R2: the bed, for the GM and a player
    if (resting && !isPlayer() && !restTold[camp.id]) { restTold[camp.id] = true; toast('A rest is still on: ' + restNow(camp).name + '. The clock waits until you end it.'); }
    if (window.wpPills && typeof window.wpPills.sync === 'function') { try { window.wpPills.sync(); } catch (e) {} }
    pendFor(camp);
    chip.classList.toggle('clock-due', !isPlayer() && !!pend);   // time rules wait for the GM's word
    var tip = isPlayer() ? 'The date and time at this table \u2014 click for the calendar' : 'The campaign\u2019s date and time' + (off ? ' (players do not see it)' : '') + (why === '' ? ', running' : why === 'hold' ? ', held' : why === 'paused' || why === 'fight' ? ', waiting' : '') + (pend ? ' \u2014 time rules are due' : '') + ' \u2014 click for the calendar';
    if (!(chip.dataset && chip.dataset.tip === tip) && chip.title !== tip) chip.title = tip;   // tooltips.js moves a title into data-tip: never written back while it says the same
    if (!winOpen()) return;
    var sig = winSigOf(camp, ck, cal); if (winSig === sig) return;
    var body = document.getElementById('calendarBody'), nl = (live === true || isPlayer()) && body && winBase === winBaseOf(camp, ck, cal) && Math.floor(ck.t / dayLength(cal)) === winDay ? body.querySelector('.cal-now') : null;
    if (nl) { winSig = sig; nl.textContent = fmtWhen(cal, ck.t, dateOf(cal, ck.t).s !== 0); }   // the clock ran on within the day: its line alone, so a half-typed note or amount stays
    else renderWin();
}
// 152 (docs/FIGHT_CLOCK_DESIGN.md 1 and 4): THE SECOND. While fights run the clock reads the floor of the least time of the fights running (net.js
// ordersMoved). With the Calendar on it is written to the clock (moveTo with own: ownTime has counted each character, so it runs no timed effect);
// forward it says the dated notes it reaches; back only for a correction (back), when the clock keeps the highest second reached as its top, so
// on again lives nothing twice. With the Calendar off (frame 'mem') it is kept here alone, and the date stays where it was. last: no fight is
// left — in memory the marks go, since no clock would reach them
function second(s1, back, last) {
    var camp = getActiveCampaign(); if (!camp || isPlayer() || typeof s1 !== 'number' || !isFinite(s1)) return false;
    s1 = Math.max(0, Math.min(CAL_LIMITS.time, Math.floor(s1)));
    if (frameOf() === 'mem') {
        var m = memOf(camp), moved = false;
        if (s1 < m.t && back === true) { m.top = m.top && tCmp(m.top, m.t) > 0 ? m.top : { s: m.t, ms: 0 }; m.t = s1; moved = true; }
        else if (s1 > m.t) { m.t = s1; moved = true; if (m.top && tCmp(m.top, s1) <= 0) m.top = null; }
        if (last === true) memT = null;
        return moved;
    }
    memT = null;
    if (!clockOn() || (s1 < tOf(camp) && back !== true)) return false;
    return moveTo(s1, null, false, true);
}
// 152: a fight begins for these characters (net.js ordersMoved): Each fight starts again takes off their In a fight counts of the rules ticked so
function fightBegan(ids) {
    var camp = getActiveCampaign(), sys = sysNow(); if (!camp || isPlayer() || !sys || !Array.isArray(ids) || !ids.length) return false;
    var ck = clockOf(camp) || { t: 0 }; if (!ck.acc) return false;
    var a = cleanAcc(freshAcc(ck.acc, ids, clockRules(sys))); if (JSON.stringify(a) === JSON.stringify(ck.acc)) return false;
    commitAcc(a); return true;
}
(function wire() {
    var chip = document.getElementById('clockChip'); if (chip) chip.addEventListener('click', openWin);
    var m = document.getElementById('calendarModal'); if (m) { m.addEventListener('click', onWinClick); m.addEventListener('change', onWinChange); m.addEventListener('mousedown', function(e) { if (e.target === m) closeWin(); }); }
    if (typeof setInterval === 'function') setInterval(function() { try { liveTick(Date.now()); } catch (e) {} }, 1000);   // 1.5.4: the running clock's look at the wall clock
    if (typeof setInterval === 'function') setInterval(function() { try { if (winOpen()) refresh(true); } catch (e) {} }, 1000);   // 1.6.2: an open window follows a pause, a table opening or a fight, which ask it nothing
})();

// 1.6.0: the date formulas read (Date.year and the rest): this campaign's clock on its system's calendar; on a player's app with no clock,
// the numbers its host sent (the date kept from players: the owner, by prompt, "The real date everywhere"); none: 0
function dateNow() {
    var camp = getActiveCampaign(); if (!camp) return null;
    var ck = clockOf(camp), CCx = window.wpCalendarCore; if (ck) return dateNamesOf(camp, ck.t);
    return CCx && CCx.cleanDateFig ? CCx.cleanDateFig(camp.dateFig) : null;
}
function dateNamesOf(camp, t) { var CCx = window.wpCalendarCore; return CCx && CCx.dateNames ? CCx.dateNames(camp.system && camp.system.calendar ? camp.system.calendar : null, t) : null; }
setDateSource(dateNow);
function words() { var camp = getActiveCampaign(), ck = clockOf(camp); if (!ck || (window.wpVtt && !window.wpVtt.on('calendar'))) return ''; return fmtWhen(sysCal(), ck.t); }   // 1.6.0: the game's time in words, for the game record
window.wpCalendar = { restName: function() { var r = restNow(getActiveCampaign()); return r ? r.name : ''; }, sessionBegan: sessionBegan, timeData: timeData, openDay: openDay, words: words, refresh: refresh, ownTime: ownTime, second: second, fightBegan: fightBegan, open: openWin, close: closeWin, moveTo: moveTo, rulesRun: rulesRun, setRulesRun: setRulesRun };
export { refresh, ownTime, second, fightBegan, openWin, closeWin, moveTo, rulesRun, setRulesRun };

/* Game calendar (1.5.0, backlog item 20) — the DOM half: the campaign's clock in the header (a chip with the date and time) and the
   Calendar window (the period in view as a grid of days by the week, the steps that move time on, a day and a time to set the clock
   to, whether players see the date). World time lives on the campaign (camp.clock: { t, hide?, hold?, rate? }); the pure half (calendarcore.js)
   turns it into a date by the system's calendar. Each round of a combat moves it on by the system's round length (net.js calls
   rounds()). A player's app shows the clock the host sends (net.js 'clock'), read-only, and a player may hide it for themselves (the
   Calendar feature's own per-player switch). Every text reaches the page as a text node or a value. Design of record:
   docs/CALENDAR_PLAN.md. */
import { getActiveCampaign } from './models.js';
import { save, saveView, toast } from './io.js';
import { roundSecs } from './systemcore.js';
import { cleanCalendar, cleanClock, cleanAcc, ruleFires, dateOf, timeOf, periodDays, dayLength, fmtDate, fmtWhen, fmtSpan, CAL_LIMITS } from './calendarcore.js';

function net() { return window.wpNet || null; }
function sysNow() { var sh = window.wpSheets; return sh && sh.systemOf ? sh.systemOf() : null; }
// [sinkcheck:calendarwin-start]
var restMode = false, pend = null, roundPend = 0;   // item 20 K5: time moved on as Rest (else Active), the time rules waiting for the GM's word, a fight's rounds not yet counted
// What waits belongs to the campaign it was counted in (the owed review, 2026-10-09): a list of time rules due, the live time counted behind
// it and a fight's rounds carried into the next campaign opened, whose own rules then ran for hours that never passed there. Asked before any
// of the three is read or added to
var pendCamp = '';
function pendFor(camp) {
    var id = camp && typeof camp.id === 'string' ? camp.id : '';
    if (pend && pend.camp !== id) pend = null;
    if (pendCamp !== id) { livePend = 0; roundPend = 0; pendCamp = id; }
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
    for (var k = 0; k < len; k++) { var c = { day: d0 + k, n: typeof v.page === 'number' ? d0 + k + 1 : k + 1 }; if (d0 + k === today) c.today = true; if (d0 + k === pk) c.picked = true; if (nd && nd[d0 + k]) c.notes = nd[d0 + k]; out.cells.push(c); }
    return out;
}
// The steps that move time on, by the calendar's own day ({ label, secs }), and what an amount can count in ({ id, name, secs }): the
// minute, hour, day and week of the calendar, then the system's own time units (Combat card: a watch)
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
function noteDays(notes) { var m = Object.create(null); notes.forEach(function(n) { m[n.day] = (m[n.day] || 0) + 1; }); return m; }
function newNoteId() { var s = ''; while (s.length < 8) s += 'abcdefghijklmnopqrstuvwxyz0123456789'.charAt(Math.floor(Math.random() * 36)); return 'n_' + s; }
function notesReached(notes, t0, t1, dl) { if (!(t1 > t0) || !(dl > 0)) return []; var d0 = Math.floor(t0 / dl), d1 = Math.floor(t1 / dl); return notes.filter(function(n) { return n.day > d0 && n.day <= d1; }); }
function winBaseOf(camp, ck, cal) { return camp.id + '|' + (ck.hide ? 1 : 0) + '|' + (ck.hold ? 1 : 0) + '|' + liveRate(ck) + '|' + (isPlayer() ? '' : liveHeld(camp)) + '|' + (pend ? 1 : 0) + '|' + JSON.stringify(notesOf(ck)) + '|' + JSON.stringify(cleanCalendar(cal)); }   // all the window shows but the time of day
function winSigOf(camp, ck, cal) { return winBaseOf(camp, ck, cal) + '|' + ck.t; }
// Item 20 K5 (the owner's answers of 2026-09-30): the time rules — rolls and apply actions that also run every so often by this clock. Rest adds
// up per character and rule, activity breaks it (calendarcore ruleFires); the steps and any amount run them as Rest or Active, a Set forward
// always asks (the GM's choice), a fight's rounds count as activity and are asked about when it ends. What is due waits in the window: players'
// characters ticked, NPCs offered; Apply runs the ticked ones on this machine (sheets.js runTimeRules), Skip lets the time pass; either way
// what each rule has counted is kept (camp.clock.acc, the GM's own)
// K5b: the table's word on the time rules (Settings \u25b8 VTT features \u25b8 Calendar: camp.turnRules.time) — 'confirm' (the default: the GM
// says), 'auto' (players' characters' rules run at once; a Set forward still asks), 'off' (none run and nothing is counted); a paused table runs none
function timeMode(camp) { var t = camp && camp.turnRules && typeof camp.turnRules === 'object' ? camp.turnRules.time : ''; return t === 'auto' || t === 'off' ? t : 'confirm'; }
function tablePaused() { var n = net(); return !!(n && n.active && n.paused); }
function isPc(ch) { return !!ch && ch.npc !== true && typeof ch.ownerId === 'string' && !!ch.ownerId; }
function clockRules(sys) { return sys && Array.isArray(sys.rolls) ? sys.rolls.filter(function(r) { return r && r.every; }) : []; }
function sysUnits(sys) { return sys && sys.combat && sys.combat.turn && Array.isArray(sys.combat.turn.units) ? sys.combat.turn.units : []; }
function commitAcc(acc, live) {   // live (1.5.4): the clock ran by itself — written quietly, and not at all when the counts did not move
    var camp = getActiveCampaign(); if (!camp || isPlayer()) return;
    var ck = clockOf(camp) || { t: 0 }, nc = Object.assign({}, ck), a = cleanAcc(acc);
    if (live === true && JSON.stringify(a) === JSON.stringify(ck.acc || null)) return;
    if (a) nc.acc = a; else delete nc.acc; camp.clock = nc; if (live === true) saveView(); else save();
}
function timePassed(secs, rest, ask, live) {   // ask: always ask (a Set forward: the GM's choice); live (1.5.4): the clock ran by itself
    var camp = getActiveCampaign(), sys = sysNow(); pendFor(camp); if (!camp || isPlayer() || typeof secs !== 'number' || !(secs > 0) || !sys || timeMode(camp) === 'off' || tablePaused()) return false;
    var rules = clockRules(sys); if (!rules.length) return false;
    var ck = clockOf(camp) || { t: 0 }, res = ruleFires(sysCal(), sysUnits(sys), rules, camp.chars ? Object.keys(camp.chars) : [], ck.acc, secs, !!rest);
    if (!res.fires.length) { commitAcc(res.acc, live); return false; }
    var on = Object.create(null); res.fires.forEach(function(f) { on[f.c] = isPc(camp.chars[f.c]); });
    if (!ask && timeMode(camp) === 'auto') {   // K5b: Automatic — players' characters' rules run now, the counts kept
        var go = res.fires.filter(function(f) { return on[f.c] === true; });
        if (go.length && window.wpSheets && window.wpSheets.runTimeRules) window.wpSheets.runTimeRules(go, spanWords(sysCal(), secs, rest, live));
        commitAcc(res.acc, live); return false;
    }
    pend = { secs: secs, rest: !!rest, fires: res.fires, acc: res.acc, on: on, camp: camp.id }; if (live === true) pend.live = true;
    if (live === true && !winOpen()) { refresh(); toast('Time rules are due: click the date in the header to apply or skip them.'); return true; }   // never a window opened under the GM's hands
    if (!winOpen()) openWin(); else renderWin();
    return true;
}
function spanWords(cal, secs, rest, live) { return live === true ? 'The clock ran' : fmtSpan(cal, secs) + (rest ? ' of rest' : ' of activity'); }   // what a summary is headed with (1.5.4: the running clock is no stretch the GM chose)
function pendWords(cal) { return pend ? (pend.live === true ? 'as the clock ran' : spanWords(cal, pend.secs, pend.rest)) : ''; }
function pendPanel(body, cal) {
    var box = cel('div', 'cal-pend'), camp = getActiveCampaign(), sys = sysNow(), byC = Object.create(null), order = [];
    box.appendChild(cel('div', 'cal-pend-head', 'Time rules due \u2014 ' + pendWords(cal)));
    pend.fires.forEach(function(f) { if (!byC[f.c]) { byC[f.c] = []; order.push(f.c); } byC[f.c].push(f); });
    order.forEach(function(cid) {
        var ch = camp && camp.chars && Object.prototype.hasOwnProperty.call(camp.chars, cid) ? camp.chars[cid] : null; if (!ch) return;
        var row = cel('label', 'cal-pend-row'), tick = cel('input', 'cal-pend-tick'); tick.type = 'checkbox'; tick.dataset.char = cid; tick.checked = pend.on[cid] === true; row.appendChild(tick);
        row.appendChild(cel('span', 'cal-pend-name', (ch.name || 'A character') + (isPc(ch) ? '' : ' (NPC)')));
        row.appendChild(cel('span', 'cal-pend-rules', byC[cid].map(function(f) { var rl = clockRules(sys).filter(function(r) { return r.id === f.r; })[0]; return (rl && rl.label ? rl.label : 'A rule') + ' \u00d7' + f.n; }).join(', ')));
        box.appendChild(row);
    });
    var bar = cel('div', 'cal-pend-bar');
    bar.appendChild(cbtn('cal-pend-apply', 'Apply', 'Run the ticked characters\u2019 rules now: the rolls are made for them and each player gets a summary', 'calpendapply'));
    bar.appendChild(cbtn('cal-pend-skip', 'Skip', 'Let this time pass with no rules run', 'calpendskip'));
    box.appendChild(bar); body.appendChild(box);
}
function pendDone(apply) {
    var hadP = !!pend; pendFor(getActiveCampaign()); if (!pend) { if (hadP) renderWin(); return false; }   // a list of another campaign's is no list here
    var p = pend, cal = sysCal(); pend = null;
    var camp = getActiveCampaign(); if (!camp || camp.id !== p.camp) { renderWin(); return false; }
    if (apply) { var go = p.fires.filter(function(f) { return p.on[f.c] === true; }); if (go.length && window.wpSheets && window.wpSheets.runTimeRules) window.wpSheets.runTimeRules(go, spanWords(cal, p.secs, p.rest, p.live)); }
    commitAcc(p.acc);
    if (livePend > 0) { var lp = livePend; livePend = 0; timePassed(lp, false, false, true); }   // 1.5.4: the time that passed while this list waited (the clock running, a fight's rounds)
    renderWin(); refresh(); return true;
}
function comingUp(body, cal, notes, today, gm) {   // the next five notes from today on (a player's app holds only those it may see)
    var next = notes.filter(function(n) { return n.day >= today; }).slice(0, 5); if (!next.length) return;
    var box = cel('div', 'cal-coming'); box.appendChild(cel('div', 'sys-num-cap', 'Coming up'));
    next.forEach(function(n) { box.appendChild(cel('div', 'cal-coming-row', fmtDate(cal, n.day * dayLength(cal)) + ': ' + n.text + (gm && n.vis !== 'all' ? ' (you only)' : ''))); });
    body.appendChild(box);
}
function dayNotes(body, cal, notes, day, gm) {   // the picked day's notes: the GM's to add, show to players or remove; a player's to read
    var box = cel('div', 'cal-notes'), mine = notes.filter(function(n) { return n.day === day; });
    box.appendChild(cel('div', 'sys-num-cap', 'Notes on ' + fmtDate(cal, day * dayLength(cal))));
    if (!mine.length && !gm) box.appendChild(cel('div', 'sys-note', 'No notes on this day.'));
    mine.forEach(function(n) {
        var row = cel('div', 'cal-note'); row.dataset.note = n.id; row.appendChild(cel('span', 'cal-note-txt', n.text));
        if (gm) {
            var l = cel('label', 'cal-tick'), c = cel('input', 'cal-note-vis'); c.type = 'checkbox'; c.checked = n.vis === 'all'; c.dataset.note = n.id; c.title = 'Players see this note on the calendar';
            l.appendChild(c); l.appendChild(document.createTextNode(' Players see it')); row.appendChild(l);
            var x = cbtn('cal-note-del', '\u00d7', 'Remove this note', 'calnotedel'); x.dataset.note = n.id; row.appendChild(x);
        }
        box.appendChild(row);
    });
    if (gm) {
        var add = cel('div', 'cal-note-add'), inp = cel('input', 'field cal-note-new'); inp.type = 'text'; inp.maxLength = CAL_LIMITS.noteChars; inp.placeholder = 'A note for this day'; inp.title = 'A deadline, a festival, an event: you are reminded when the clock reaches this day'; add.appendChild(inp);
        var l2 = cel('label', 'cal-tick'), c2 = cel('input', 'cal-note-newvis'); c2.type = 'checkbox'; c2.title = 'Players see this note on the calendar'; l2.appendChild(c2); l2.appendChild(document.createTextNode(' Players see it')); add.appendChild(l2);
        add.appendChild(cbtn('cal-note-go', 'Add', 'Add this note to the day', 'caladdnote'));
        box.appendChild(add);
    }
    body.appendChild(box);
}
function renderWin() {
    var body = document.getElementById('calendarBody'), camp = getActiveCampaign(); if (!body) return;
    if (!shown(camp)) { closeWin(); return; }
    var cal = sysCal(), ck = clockOf(camp) || { t: 0 }, t = ck.t, gm = !isPlayer(), sys = sysNow(), dl = dayLength(cal), now = dateOf(cal, t);
    if (camp.id !== winCamp) { view = null; pick = null; winCamp = camp.id; pendFor(camp); }   // another campaign on screen: its own calendar, from the clock
    if (!view) view = viewOf(cal, t);
    winSig = winSigOf(camp, ck, cal); winBase = winBaseOf(camp, ck, cal); winDay = Math.floor(t / dl);
    body.textContent = '';
    body.appendChild(cel('div', 'cal-now', fmtWhen(cal, t, now.s !== 0)));
    if (gm && pend) pendPanel(body, cal);   // K5: what the time rules have due, first
    if (gm) liveRow(body, camp, ck);   // 1.5.4: the clock runs by itself, or is held
    var notes = notesOf(ck), g = gridOf(cal, view, t, pick, noteDays(notes)), nav = cel('div', 'cal-nav');
    nav.appendChild(cbtn('cal-prev', '\u25c0', 'The period before', 'calprev')); nav.appendChild(cel('span', 'cal-title', g.title)); nav.appendChild(cbtn('cal-next', '\u25b6', 'The period after', 'calnext'));
    nav.appendChild(cbtn('cal-back', 'Today', 'Back to the period the clock is in', 'caltoday'));
    body.appendChild(nav);
    var grid = cel('div', 'cal-grid'); grid.style.gridTemplateColumns = 'repeat(' + g.cols + ', minmax(0, 1fr))';
    g.heads.forEach(function(h) { var hd = cel('div', 'cal-head', Array.from(h).slice(0, 3).join('')); hd.title = h; grid.appendChild(hd); });
    g.cells.forEach(function(c) {
        if (!c) { grid.appendChild(cel('div', 'cal-blank')); return; }
        var b = cel('button', 'cal-day' + (c.today ? ' cal-is-today' : '') + (c.picked ? ' cal-is-picked' : '') + (c.notes ? ' cal-has-note' : ''), String(c.n)); b.type = 'button'; b.dataset.day = String(c.day); b.title = fmtDate(cal, c.day * dl) + (c.today ? ' (today)' : '') + (c.notes ? ' \u2014 ' + c.notes + ' note' + (c.notes === 1 ? '' : 's') : '');
        grid.appendChild(b);
    });
    body.appendChild(grid);
    comingUp(body, cal, notes, now.day, gm);
    if (!gm) { if (pick !== null) dayNotes(body, cal, notes, pick, false); body.appendChild(cbtn('cal-hideme', 'Hide the clock for me', 'Takes the clock out of your header at this table; Settings \u25b8 VTT features brings it back', 'calhideme')); return; }
    var pr = cel('div', 'cal-pick');
    if (pick === null) pr.appendChild(cel('span', 'sys-note', 'Pick a day to set the clock to it or to write a note on it.'));
    else {
        var cc = cleanCalendar(cal) || {}, H = cc.hours || 24, M = cc.minutes || 60;
        pr.appendChild(cel('span', 'cal-pick-txt', fmtDate(cal, pick * dl)));
        [['cal-set-h', now.h, H - 1, 'The hour (0 to ' + (H - 1) + ')'], ['cal-set-m', now.m, M - 1, 'The minute (0 to ' + (M - 1) + ')']].forEach(function(f, i) {
            if (i) pr.appendChild(cel('span', 'cal-colon', ':'));
            var n = cel('input', 'field ' + f[0]); n.type = 'number'; n.min = '0'; n.max = String(f[2]); n.step = '1'; n.value = String(f[1]); n.title = f[3]; pr.appendChild(n);
        });
        var setB = cbtn('cal-set', 'Set the clock', 'The clock goes to this day at this time; later, you are asked whether the time rules run for the time skipped', 'calset'); if (pend) { setB.disabled = true; setB.title = 'Apply or skip the time rules first'; } pr.appendChild(setB);
    }
    body.appendChild(pr);
    if (pick !== null) dayNotes(body, cal, notes, pick, true);
    var kd = cel('div', 'cal-kind'); kd.appendChild(cel('span', 'sys-num-cap', 'Time passes as'));
    [['active', 'Active', 'Activity: the time rules that run any time'], ['rest', 'Rest', 'Rest: every time rule, and a rule during rest only counts it']].forEach(function(k) { var b = cbtn('cal-kind-btn' + ((k[0] === 'rest') === restMode ? ' cal-kind-on' : ''), k[1], k[2], 'calkind'); b.dataset.kind = k[0]; kd.appendChild(b); });
    body.appendChild(kd);
    var st = cel('div', 'cal-steps'); st.appendChild(cel('span', 'sys-num-cap', 'Move time on'));
    stepsOf(cal).forEach(function(s) { var b = cbtn('cal-step', s.label, 'Move the clock on ' + fmtSpan(cal, s.secs), 'calstep'); b.dataset.secs = String(s.secs); if (pend) { b.disabled = true; b.title = 'Apply or skip the time rules first'; } st.appendChild(b); });
    body.appendChild(st);
    var an = cel('div', 'cal-any'), ai = cel('input', 'field cal-any-n'); ai.type = 'number'; ai.step = 'any'; ai.placeholder = 'Amount'; ai.title = 'How much: below 0 moves the clock back'; an.appendChild(ai);
    var us = cel('select', 'field cal-any-u'); us.title = 'What the amount counts in'; unitsOf(cal, sys).forEach(function(u) { var o = cel('option', '', u.name); o.value = u.id; us.appendChild(o); }); an.appendChild(us);
    var goB = cbtn('cal-any-go', 'Move', 'Move the clock on (or back) by this amount', 'calany'); if (pend) { goB.disabled = true; goB.title = 'Apply or skip the time rules first'; } an.appendChild(goB);
    body.appendChild(an);
    var hl = cel('label', 'cal-tick'), hc = cel('input', 'cal-hide'); hc.type = 'checkbox'; hc.checked = !ck.hide; hc.title = 'Off: players see no date or time; you still do';
    hl.appendChild(hc); hl.appendChild(document.createTextNode(' Players see the date')); body.appendChild(hl);
    body.appendChild(cel('div', 'sys-note cal-round', 'Each round of a combat moves the clock on ' + fmtSpan(cal, roundSecs(sys)) + ' (the round\u2019s length: the Combat card\u2019s Turns box).'));
}
// The running clock (1.5.4; the owner, 2026-10-04: "id like it to run by default", and by prompt: while a session is open, held in a fight —
// rounds move it — and "both real time and a speed i can set should be available, real time by default"). On the GM's machine, while it
// hosts a table, game time moves on with real time times the campaign's speed (camp.clock.rate: stored only when it is not 1), a whole game
// minute at a time, kept on whole minutes. It waits while the table is paused, while a fight runs on any map (each round moves the clock, as
// ever), and while the GM holds it (camp.clock.hold: only the hold is stored, so a campaign that never touched it runs). Two looks more than
// two minutes apart (the machine slept) count as two minutes. A minute that passes is no change of the GM's own hand: no log line, no undo
// pass and no stamp on the map — the table is told (net.syncClock), timed effects run, a dated note reached is said, and the file is written
// by the quiet save a moved view uses (io.js saveView). To the time rules it is Active time: Run at once runs them as it passes; Ask me
// counts it and, when a rule comes due, marks the chip and says so once, never opening the window under the GM's hands
// [calendarcheck:live-start]
var LIVE_GAP = 120000, LIVE_EVERY = 5000, liveAt = 0, liveMs = 0, liveBankAt = 0, livePend = 0, liveWas = null, liveSaid = false;
function liveRate(ck) { return ck && typeof ck.rate === 'number' && CAL_LIMITS.rates.indexOf(ck.rate) > 0 ? ck.rate : 1; }
function liveHeld(camp) {   // '' while the clock runs by itself, else why it does not: off, hold, solo, paused, fight
    var n = net(), ck = clockOf(camp);
    if (!camp || isPlayer() || !clockOn()) return 'off';   // clockOn: the Calendar is on, and this is not the stream window
    if (ck && ck.hold === true) return 'hold';
    if (!(n && n.active && n.role === 'host')) return 'solo';
    if (n.paused) return 'paused';
    if (n.combats && typeof n.combats === 'object' && Object.keys(n.combats).some(function(k) { return !!n.combats[k]; })) return 'fight';
    return '';
}
function liveWords(why, rate) {
    if (why === '') return rate === 1 ? 'Running in real time while your table is open.' : 'Running at \u00d7' + rate + ' while your table is open: ' + rate + ' seconds of the game to each second at the table.';
    if (why === 'hold') return 'Held: the clock moves only by your steps and by a fight\u2019s rounds.';
    if (why === 'solo') return 'It runs by itself while you host a session: no table is open now.';
    if (why === 'paused') return 'Waiting: the table is paused.';
    if (why === 'fight') return 'Waiting: a fight is on, and each round moves the clock.';
    return '';
}
function liveRow(body, camp, ck) {   // the GM's window: Runs / Held, the speed, and what the clock is doing now
    var held = ck.hold === true, rate = liveRate(ck), row = cel('div', 'cal-live');
    row.appendChild(cel('span', 'sys-num-cap', 'The clock'));
    [['run', '\u25b6 Runs', 'The clock runs by itself while a session is open: it waits while the table is paused and while a fight is on'], ['hold', '\u23f8 Held', 'The clock moves only by your steps and by a fight\u2019s rounds']].forEach(function(k) {
        var b = cbtn('cal-live-btn' + ((k[0] === 'hold') === held ? ' cal-kind-on' : ''), k[1], k[2], 'callive'); b.dataset.live = k[0]; row.appendChild(b);
    });
    var sel = cel('select', 'field cal-live-rate'); sel.title = 'How fast the clock runs by itself';
    CAL_LIMITS.rates.forEach(function(r) { var o = cel('option', '', r === 1 ? 'Real time' : '\u00d7' + r); o.value = String(r); sel.appendChild(o); });
    sel.value = String(rate); row.appendChild(sel);
    body.appendChild(row);
    body.appendChild(cel('div', 'sys-note cal-live-note', liveWords(liveHeld(camp), rate)));
}
function setHold(hold) {
    var camp = getActiveCampaign(); if (!camp || isPlayer()) return false;
    var ck = clockOf(camp) || { t: 0 }; if ((ck.hold === true) === (hold === true)) return false;
    var nc = Object.assign({}, ck); if (hold === true) nc.hold = true; else delete nc.hold; camp.clock = nc;
    liveAt = 0; liveMs = 0;
    if (net() && net().logEvent) net().logEvent('time', hold === true ? 'The clock is held' : 'The clock runs by itself again');
    save(); refresh(); return true;
}
function setRate(r) {
    var camp = getActiveCampaign(); if (!camp || isPlayer() || CAL_LIMITS.rates.indexOf(r) < 0) return false;
    var ck = clockOf(camp) || { t: 0 }; if (liveRate(ck) === r) return false;
    var nc = Object.assign({}, ck); if (r === 1) delete nc.rate; else nc.rate = r; camp.clock = nc;
    save(); refresh(); return true;
}
function liveRules(secs) {   // live time is Active time (timePassed: run at once under Run at once, counted and asked about under Ask me, nothing under Off)
    pendFor(getActiveCampaign()); livePend += secs; if (pend) return;   // a list waits for the GM's word: the time since is counted once they have answered
    var s = livePend; livePend = 0; timePassed(s, false, false, true);
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
    if (!moveTo(ck.t + secs, null, true)) return false;
    if (!liveSaid) { liveSaid = true; toast('The game clock runs by itself while your table is open. Click the date in the header to hold it or change its speed.'); }
    liveRules(secs);
    return true;
}
// [calendarcheck:live-end]
// The GM moves the clock to a moment (clamped to the calendar's range): saved, sent to the table with the save, and said in the
// session log unless it came from a combat round
function moveTo(t1, why, live) {   // live (1.5.4): the clock ran by itself — the table is told and the file written quietly, with no save of the GM's own
    var camp = getActiveCampaign(); if (!camp || isPlayer() || typeof t1 !== 'number' || !isFinite(t1)) return false;
    var ck = clockOf(camp) || { t: 0 }, cal = sysCal(); t1 = Math.max(0, Math.min(CAL_LIMITS.time, Math.floor(t1)));
    if (t1 === ck.t) return false;
    var hits = notesReached(notesOf(ck), ck.t, t1, dayLength(cal)), gone = t1 - ck.t;   // K3: the dated notes this move reaches, told to the GM
    camp.clock = Object.assign({}, ck, { t: t1 });
    if (gone > 0 && net() && net().fxGameTime) net().fxGameTime(gone);   // K4: timed effects outside a fight run by the game clock (never back)
    if (why && net() && net().logEvent) net().logEvent('time', why + ' \u2014 now ' + fmtWhen(cal, t1));
    hits.forEach(function(n) { if (net() && net().logEvent) net().logEvent('time', 'Note reached \u2014 ' + fmtDate(cal, n.day * dayLength(cal)) + ': ' + n.text); });
    if (hits.length) toast(hits.length === 1 ? 'Today: ' + hits[0].text : hits.length + ' dated notes reached: ' + hits.slice(0, 3).map(function(n) { return n.text; }).join('; ') + (hits.length > 3 ? '; \u2026' : ''));
    if (live === true) { if (net() && net().syncClock) net().syncClock(); saveView(); } else save();
    refresh(live === true); return true;
}
// K3: the GM's edits to the notes — cleaned as a load reads them, saved, the window redrawn
function editNotes(fn) {
    var camp = getActiveCampaign(); if (!camp || isPlayer()) return false;
    var ck = clockOf(camp) || { t: 0 }, list = notesOf(ck).map(function(n) { return Object.assign({}, n); }); if (fn(list) === false) return false;
    camp.clock = cleanClock(Object.assign({}, ck, { notes: list })) || { t: ck.t };
    save(); refresh(); return true;
}
function addNote(day, text, shown) {
    var tx = typeof text === 'string' ? text.trim() : ''; if (!(typeof day === 'number' && day >= 0 && Math.floor(day) === day) || !tx) return false;
    return editNotes(function(list) { if (list.length >= CAL_LIMITS.notes) { toast('At most ' + CAL_LIMITS.notes + ' notes.'); return false; } var n = { id: newNoteId(), day: day, text: tx }; if (shown) n.vis = 'all'; list.push(n); });
}
function noteVis(id, shown) { return editNotes(function(list) { var n = list.filter(function(x) { return x.id === id; })[0]; if (!n) return false; if (shown) n.vis = 'all'; else delete n.vis; }); }
function delNote(id) { return editNotes(function(list) { var i = -1; list.forEach(function(x, k) { if (x.id === id) i = k; }); if (i < 0) return false; list.splice(i, 1); }); }
function moveBy(secs) { var camp = getActiveCampaign(), cal = sysCal(); if (typeof secs !== 'number' || !isFinite(secs) || !secs) return false; return moveTo(tOf(camp) + secs, (secs > 0 ? 'Moved on ' : 'Moved back ') + fmtSpan(cal, secs)); }
function setHidden(hide) {
    var camp = getActiveCampaign(); if (!camp || isPlayer()) return false;
    var ck = clockOf(camp) || { t: 0 }; if (!!ck.hide === !!hide) return false;
    var nc = { t: ck.t }; if (hide) nc.hide = true; camp.clock = Object.assign({}, ck, nc); if (!hide) delete camp.clock.hide;
    if (net() && net().logEvent) net().logEvent('time', hide ? 'Players no longer see the date' : 'Players see the date again');
    save(); refresh(); return true;
}
function onWinClick(e) {
    var b = e.target && e.target.closest ? e.target.closest('button') : null; if (!b) return;
    if (b.id === 'calendarClose') { closeWin(); return; }
    var camp = getActiveCampaign(), cal = sysCal(), act = b.dataset.act || '';
    if (b.classList.contains('cal-day')) { var d = Number(b.dataset.day); if (d >= 0 && Math.floor(d) === d) { pick = pick === d ? null : d; renderWin(); } return; }
    if (act === 'calprev' || act === 'calnext') { view = stepView(cal, view || viewOf(cal, tOf(camp)), act === 'calnext' ? 1 : -1); renderWin(); return; }
    if (act === 'caltoday') { view = viewOf(cal, tOf(camp)); pick = null; renderWin(); return; }
    if (isPlayer()) { if (act === 'calhideme' && window.wpVtt && window.wpVtt.setLocal('calendar', true)) { closeWin(); toast('The clock is hidden for you. Settings \u25b8 VTT features brings it back.'); } return; }
    var body = document.getElementById('calendarBody'), q = function(c) { return body ? body.querySelector('.' + c) : null; };
    if (act === 'calkind') { restMode = b.dataset.kind === 'rest'; renderWin(); return; }   // K5
    if (act === 'callive') { setHold(b.dataset.live === 'hold'); return; }   // 1.5.4: Runs / Held
    if (act === 'calpendapply') { pendDone(true); return; }
    if (act === 'calpendskip') { pendDone(false); return; }
    if (pend && (act === 'calstep' || act === 'calany' || act === 'calset')) { toast('Apply or skip the time rules first.'); return; }
    if (act === 'calstep') { var sv = Number(b.dataset.secs); if (moveBy(sv) && sv > 0) timePassed(sv, restMode); return; }
    if (act === 'caladdnote' && pick !== null) { var nt = q('cal-note-new'), nv = q('cal-note-newvis'), txt = nt ? String(nt.value || '').trim() : ''; if (!txt) { toast('Type the note first.'); return; } addNote(pick, txt, !!(nv && nv.checked === true)); return; }
    if (act === 'calnotedel') { delNote(b.dataset.note); return; }
    if (act === 'calany') {
        var ni = q('cal-any-n'), ui = q('cal-any-u'), n = ni ? Number(ni.value) : NaN, u = ui ? unitsOf(cal, sysNow()).filter(function(x) { return x.id === ui.value; })[0] : null;
        if (!u || !(String(ni.value).trim() !== '' && isFinite(n)) || !n) { toast('Type an amount: below 0 moves the clock back.'); return; }
        var mv = Math.round(n * u.secs); if (moveBy(mv) && mv > 0) timePassed(mv, restMode); return;
    }
    if (act === 'calset' && pick !== null) {
        var cc = cleanCalendar(cal) || {}, H = cc.hours || 24, M = cc.minutes || 60, S = cc.seconds || 60, hi = q('cal-set-h'), mi = q('cal-set-m'), h = hi ? Number(hi.value) : 0, m = mi ? Number(mi.value) : 0;
        if (!(h >= 0 && h < H && Math.floor(h) === h && m >= 0 && m < M && Math.floor(m) === m)) { toast('The hour is 0 to ' + (H - 1) + ' and the minute 0 to ' + (M - 1) + '.'); return; }
        var t1 = pick * dayLength(cal) + (h * M + m) * S, t0 = tOf(camp); if (moveTo(t1, 'Set')) { view = viewOf(cal, t1); pick = null; if (!(t1 > t0 && timePassed(t1 - t0, restMode, true))) renderWin(); }   // K5: a Set forward asks (the GM's choice), whatever the table's mode
    }
}
function onWinChange(e) {
    var tg = e.target; if (!tg || !tg.classList) return;
    if (tg.classList.contains('cal-hide')) setHidden(tg.checked !== true);
    else if (tg.classList.contains('cal-live-rate')) { if (!isPlayer()) setRate(Number(tg.value)); }   // 1.5.4: the running clock's speed
    else if (tg.classList.contains('cal-note-vis') && tg.dataset) noteVis(tg.dataset.note, tg.checked === true);   // K3
    else if (tg.classList.contains('cal-pend-tick') && tg.dataset && pend && typeof tg.dataset.char === 'string' && Object.prototype.hasOwnProperty.call(pend.on, tg.dataset.char)) pend.on[tg.dataset.char] = tg.checked === true;   // K5
}
// [sinkcheck:calendarwin-end]
function openWin() { var m = document.getElementById('calendarModal'); if (!m || !shown(getActiveCampaign())) return; view = null; pick = null; m.style.display = 'flex'; renderWin(); }
function closeWin() { var m = document.getElementById('calendarModal'); if (m) m.style.display = 'none'; }
function winOpen() { var m = document.getElementById('calendarModal'); return !!m && m.style.display !== 'none'; }
// The header's chip (every render): the date and time, for the GM with a mark while players do not see it; the open window redrawn
// only when what it shows changed (a render never takes a half-typed amount away)
function refresh(live) {   // live (1.5.4): the clock ran by itself, or a host's word of it arrived
    var chip = document.getElementById('clockChip'); if (!chip) return;
    var camp = getActiveCampaign(), on = shown(camp); chip.style.display = on ? '' : 'none';
    if (!on) { if (winOpen()) closeWin(); return; }
    var cal = sysCal(), ck = clockOf(camp) || { t: 0 }, txt = chip.querySelector('.clock-txt'), words = fmtWhen(cal, ck.t);
    if (txt && txt.textContent !== words) txt.textContent = words;
    var off = !isPlayer() && !!ck.hide; chip.classList.toggle('clock-private', off);
    var why = isPlayer() ? 'off' : liveHeld(camp), run = chip.querySelector('.clock-run'), mark = why === '' ? '\u25b6' : why === 'hold' || why === 'paused' || why === 'fight' ? '\u23f8' : '';   // 1.5.4: the GM sees whether the clock is running
    if (run && run.textContent !== mark) run.textContent = mark;
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
// Item 20 K2 (the Foundry model: a round moves world time on by the round's length): n rounds of a combat on the GM's side, forward or back
function rounds(n) {
    if (isPlayer() || typeof n !== 'number' || !isFinite(n) || !n || !clockOn()) return false;
    var camp = getActiveCampaign(), s = n * roundSecs(sysNow()), ok = moveTo(tOf(camp) + s, null);
    if (ok && s > 0) { var cmp = getActiveCampaign(); pendFor(cmp); if (timeMode(cmp) === 'auto') timePassed(s, false); else if (timeMode(cmp) !== 'off' && !tablePaused()) roundPend += s; }   // K5 (the owner's answer): a fight's rounds count as activity — run as they pass when Automatic, else asked about when it ends
    return ok;
}
function fightEnded() { pendFor(getActiveCampaign()); if (isPlayer() || !(roundPend > 0)) { roundPend = 0; return false; } var s = roundPend; roundPend = 0; if (pend) { livePend += s; return false; } return timePassed(s, false); }   // 1.5.4: a list already waiting is never written over — the rounds are counted once it is answered
(function wire() {
    var chip = document.getElementById('clockChip'); if (chip) chip.addEventListener('click', openWin);
    var m = document.getElementById('calendarModal'); if (m) { m.addEventListener('click', onWinClick); m.addEventListener('change', onWinChange); m.addEventListener('mousedown', function(e) { if (e.target === m) closeWin(); }); }
    if (typeof setInterval === 'function') setInterval(function() { try { liveTick(Date.now()); } catch (e) {} }, 1000);   // 1.5.4: the running clock's look at the wall clock
})();

window.wpCalendar = { refresh: refresh, rounds: rounds, fightEnded: fightEnded, open: openWin, close: closeWin, moveTo: moveTo };
export { refresh, rounds, fightEnded, openWin, closeWin, moveTo };

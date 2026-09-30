/* Game calendar (1.5.0, backlog item 20) — the DOM half: the campaign's clock in the header (a chip with the date and time) and the
   Calendar window (the period in view as a grid of days by the week, the steps that move time on, a day and a time to set the clock
   to, whether players see the date). World time lives on the campaign (camp.clock: { t, hide? }); the pure half (calendarcore.js)
   turns it into a date by the system's calendar. Each round of a combat moves it on by the system's round length (net.js calls
   rounds()). A player's app shows the clock the host sends (net.js 'clock'), read-only, and a player may hide it for themselves (the
   Calendar feature's own per-player switch). Every text reaches the page as a text node or a value. Design of record:
   docs/CALENDAR_PLAN.md. */
import { getActiveCampaign } from './models.js';
import { save, toast } from './io.js';
import { roundSecs } from './systemcore.js';
import { cleanCalendar, cleanClock, dateOf, timeOf, periodDays, dayLength, fmtDate, fmtWhen, fmtSpan, CAL_LIMITS } from './calendarcore.js';

function net() { return window.wpNet || null; }
function sysNow() { var sh = window.wpSheets; return sh && sh.systemOf ? sh.systemOf() : null; }
// [sinkcheck:calendarwin-start]
var view = null, pick = null, winSig = '', winCamp = '';   // the window's period in view ({ yi, period }, or { page } with no periods), the day picked (a day number from 0) or null, what it last drew and for which campaign
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
// The period in view as a grid: { title, heads (the week's names), cols, cells: [{ day, n, today?, picked? } or null for a blank before day 1] }
function gridOf(cal, v, t, pk) {
    var cc = cleanCalendar(cal) || {}, dl = dayLength(cc), today = Math.floor(t / dl), wk = cc.week || [], out = { title: '', heads: [], cols: 7, cells: [] }, d0, len;
    if (!v) return out;
    if (typeof v.page === 'number') { d0 = v.page * 28; len = 28; out.title = 'Days ' + (d0 + 1) + '–' + (d0 + 28); }
    else {
        var t0 = timeOf(cc, { yi: v.yi, period: v.period, pday: 1 }); if (t0 === null) return out;
        var dd = dateOf(cc, t0); d0 = Math.floor(t0 / dl); len = periodDays(cc, dd.year, v.period);
        out.title = cc.periods[v.period].name + ', ' + dd.year + (cc.era ? ' ' + cc.era : '');
    }
    if (wk.length) { out.cols = wk.length; out.heads = wk.slice(); for (var i = dateOf(cc, d0 * dl).weekday; i > 0; i--) out.cells.push(null); }
    for (var k = 0; k < len; k++) { var c = { day: d0 + k, n: typeof v.page === 'number' ? d0 + k + 1 : k + 1 }; if (d0 + k === today) c.today = true; if (d0 + k === pk) c.picked = true; out.cells.push(c); }
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
function renderWin() {
    var body = document.getElementById('calendarBody'), camp = getActiveCampaign(); if (!body) return;
    if (!shown(camp)) { closeWin(); return; }
    var cal = sysCal(), ck = clockOf(camp) || { t: 0 }, t = ck.t, gm = !isPlayer(), sys = sysNow(), dl = dayLength(cal), now = dateOf(cal, t);
    if (camp.id !== winCamp) { view = null; pick = null; winCamp = camp.id; }   // another campaign on screen: its own calendar, from the clock
    if (!view) view = viewOf(cal, t);
    winSig = camp.id + '|' + t + '|' + (ck.hide ? 1 : 0) + '|' + JSON.stringify(cleanCalendar(cal));
    body.textContent = '';
    body.appendChild(cel('div', 'cal-now', fmtWhen(cal, t, now.s !== 0)));
    var g = gridOf(cal, view, t, pick), nav = cel('div', 'cal-nav');
    nav.appendChild(cbtn('cal-prev', '◀', 'The period before', 'calprev')); nav.appendChild(cel('span', 'cal-title', g.title)); nav.appendChild(cbtn('cal-next', '▶', 'The period after', 'calnext'));
    nav.appendChild(cbtn('cal-back', 'Today', 'Back to the period the clock is in', 'caltoday'));
    body.appendChild(nav);
    var grid = cel('div', 'cal-grid'); grid.style.gridTemplateColumns = 'repeat(' + g.cols + ', minmax(0, 1fr))';
    g.heads.forEach(function(h) { var hd = cel('div', 'cal-head', Array.from(h).slice(0, 3).join('')); hd.title = h; grid.appendChild(hd); });
    g.cells.forEach(function(c) {
        if (!c) { grid.appendChild(cel('div', 'cal-blank')); return; }
        var b = cel('button', 'cal-day' + (c.today ? ' cal-is-today' : '') + (c.picked ? ' cal-is-picked' : ''), String(c.n)); b.type = 'button'; b.dataset.day = String(c.day); b.title = fmtDate(cal, c.day * dl) + (c.today ? ' (today)' : '');
        grid.appendChild(b);
    });
    body.appendChild(grid);
    if (!gm) { body.appendChild(cbtn('cal-hideme', 'Hide the clock for me', 'Takes the clock out of your header at this table; Settings ▸ VTT features brings it back', 'calhideme')); return; }
    var pr = cel('div', 'cal-pick');
    if (pick === null) pr.appendChild(cel('span', 'sys-note', 'Pick a day to set the clock to it.'));
    else {
        var cc = cleanCalendar(cal) || {}, H = cc.hours || 24, M = cc.minutes || 60;
        pr.appendChild(cel('span', 'cal-pick-txt', fmtDate(cal, pick * dl)));
        [['cal-set-h', now.h, H - 1, 'The hour (0 to ' + (H - 1) + ')'], ['cal-set-m', now.m, M - 1, 'The minute (0 to ' + (M - 1) + ')']].forEach(function(f, i) {
            if (i) pr.appendChild(cel('span', 'cal-colon', ':'));
            var n = cel('input', 'field ' + f[0]); n.type = 'number'; n.min = '0'; n.max = String(f[2]); n.step = '1'; n.value = String(f[1]); n.title = f[3]; pr.appendChild(n);
        });
        pr.appendChild(cbtn('cal-set', 'Set the clock', 'The clock goes to this day at this time', 'calset'));
    }
    body.appendChild(pr);
    var st = cel('div', 'cal-steps'); st.appendChild(cel('span', 'sys-num-cap', 'Move time on'));
    stepsOf(cal).forEach(function(s) { var b = cbtn('cal-step', s.label, 'Move the clock on ' + fmtSpan(cal, s.secs), 'calstep'); b.dataset.secs = String(s.secs); st.appendChild(b); });
    body.appendChild(st);
    var an = cel('div', 'cal-any'), ai = cel('input', 'field cal-any-n'); ai.type = 'number'; ai.step = 'any'; ai.placeholder = 'Amount'; ai.title = 'How much: below 0 moves the clock back'; an.appendChild(ai);
    var us = cel('select', 'field cal-any-u'); us.title = 'What the amount counts in'; unitsOf(cal, sys).forEach(function(u) { var o = cel('option', '', u.name); o.value = u.id; us.appendChild(o); }); an.appendChild(us);
    an.appendChild(cbtn('cal-any-go', 'Move', 'Move the clock on (or back) by this amount', 'calany'));
    body.appendChild(an);
    var hl = cel('label', 'cal-tick'), hc = cel('input', 'cal-hide'); hc.type = 'checkbox'; hc.checked = !ck.hide; hc.title = 'Off: players see no date or time; you still do';
    hl.appendChild(hc); hl.appendChild(document.createTextNode(' Players see the date')); body.appendChild(hl);
    body.appendChild(cel('div', 'sys-note cal-round', 'Each round of a combat moves the clock on ' + fmtSpan(cal, roundSecs(sys)) + ' (the round’s length: the Combat card’s Turns box).'));
}
// The GM moves the clock to a moment (clamped to the calendar's range): saved, sent to the table with the save, and said in the
// session log unless it came from a combat round
function moveTo(t1, why) {
    var camp = getActiveCampaign(); if (!camp || isPlayer() || typeof t1 !== 'number' || !isFinite(t1)) return false;
    var ck = clockOf(camp) || { t: 0 }, cal = sysCal(); t1 = Math.max(0, Math.min(CAL_LIMITS.time, Math.floor(t1)));
    if (t1 === ck.t) return false;
    camp.clock = Object.assign({}, ck, { t: t1 });
    if (why && net() && net().logEvent) net().logEvent('time', why + ' — now ' + fmtWhen(cal, t1));
    save(); refresh(); return true;
}
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
    if (isPlayer()) { if (act === 'calhideme' && window.wpVtt && window.wpVtt.setLocal('calendar', true)) { closeWin(); toast('The clock is hidden for you. Settings ▸ VTT features brings it back.'); } return; }
    var body = document.getElementById('calendarBody'), q = function(c) { return body ? body.querySelector('.' + c) : null; };
    if (act === 'calstep') { moveBy(Number(b.dataset.secs)); return; }
    if (act === 'calany') {
        var ni = q('cal-any-n'), ui = q('cal-any-u'), n = ni ? Number(ni.value) : NaN, u = ui ? unitsOf(cal, sysNow()).filter(function(x) { return x.id === ui.value; })[0] : null;
        if (!u || !(String(ni.value).trim() !== '' && isFinite(n)) || !n) { toast('Type an amount: below 0 moves the clock back.'); return; }
        moveBy(Math.round(n * u.secs)); return;
    }
    if (act === 'calset' && pick !== null) {
        var cc = cleanCalendar(cal) || {}, H = cc.hours || 24, M = cc.minutes || 60, S = cc.seconds || 60, hi = q('cal-set-h'), mi = q('cal-set-m'), h = hi ? Number(hi.value) : 0, m = mi ? Number(mi.value) : 0;
        if (!(h >= 0 && h < H && Math.floor(h) === h && m >= 0 && m < M && Math.floor(m) === m)) { toast('The hour is 0 to ' + (H - 1) + ' and the minute 0 to ' + (M - 1) + '.'); return; }
        var t1 = pick * dayLength(cal) + (h * M + m) * S; if (moveTo(t1, 'Set')) { view = viewOf(cal, t1); pick = null; renderWin(); }
    }
}
function onWinChange(e) { var tg = e.target; if (tg && tg.classList && tg.classList.contains('cal-hide')) setHidden(tg.checked !== true); }
// [sinkcheck:calendarwin-end]
function openWin() { var m = document.getElementById('calendarModal'); if (!m || !shown(getActiveCampaign())) return; view = null; pick = null; m.style.display = 'flex'; renderWin(); }
function closeWin() { var m = document.getElementById('calendarModal'); if (m) m.style.display = 'none'; }
function winOpen() { var m = document.getElementById('calendarModal'); return !!m && m.style.display !== 'none'; }
// The header's chip (every render): the date and time, for the GM with a mark while players do not see it; the open window redrawn
// only when what it shows changed (a render never takes a half-typed amount away)
function refresh() {
    var chip = document.getElementById('clockChip'); if (!chip) return;
    var camp = getActiveCampaign(), on = shown(camp); chip.style.display = on ? '' : 'none';
    if (!on) { if (winOpen()) closeWin(); return; }
    var cal = sysCal(), ck = clockOf(camp) || { t: 0 }, txt = chip.querySelector('.clock-txt'), words = fmtWhen(cal, ck.t);
    if (txt && txt.textContent !== words) txt.textContent = words;
    var off = !isPlayer() && !!ck.hide; chip.classList.toggle('clock-private', off);
    chip.title = isPlayer() ? 'The date and time at this table — click for the calendar' : 'The campaign’s date and time' + (off ? ' (players do not see it)' : '') + ' — click for the calendar';
    if (winOpen() && winSig !== camp.id + '|' + ck.t + '|' + (ck.hide ? 1 : 0) + '|' + JSON.stringify(cleanCalendar(cal))) renderWin();
}
// Item 20 K2 (the Foundry model: a round moves world time on by the round's length): n rounds of a combat on the GM's side, forward or back
function rounds(n) {
    if (isPlayer() || typeof n !== 'number' || !isFinite(n) || !n || !clockOn()) return false;
    var camp = getActiveCampaign(); return moveTo(tOf(camp) + n * roundSecs(sysNow()), null);
}
(function wire() {
    var chip = document.getElementById('clockChip'); if (chip) chip.addEventListener('click', openWin);
    var m = document.getElementById('calendarModal'); if (m) { m.addEventListener('click', onWinClick); m.addEventListener('change', onWinChange); m.addEventListener('mousedown', function(e) { if (e.target === m) closeWin(); }); }
})();

window.wpCalendar = { refresh: refresh, rounds: rounds, open: openWin, close: closeWin, moveTo: moveTo };
export { refresh, rounds, openWin, closeWin, moveTo };

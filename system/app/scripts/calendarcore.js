/* Game calendar (1.5.0, backlog item 20) — the pure half: a system's calendar (its periods in year order, some outside the
   month count such as a festival week or a holiday; a week of named days running on across months and years; the day's
   hours, minutes and seconds; the year that day 1 falls in, a label after it and whether years count down; a leap rule),
   cleaned the same in every view, and the date maths a campaign's clock runs on. World time is ONE whole number of
   seconds from the first moment of day 1 (as Foundry keeps its world time); a date is worked out from it and back.
   No DOM, no state: tools/calendarcheck.js runs it under Node. Published as window.wpCalendarCore.
   Design of record: docs/CALENDAR_PLAN.md. */
'use strict';

var VERSION = '1.5.0';
var LIMITS = Object.freeze({
    periods: 60, periodDays: 1000,      // a year's periods (months, festival weeks, holidays) and the days one holds
    week: 20, name: 40, era: 24,        // weekday names, a period's or a weekday's name, the label after the year (code points)
    year: 1e7,                          // the year day 1 falls in, and a leap rule's year, either way
    hours: 100, minutes: 1000, seconds: 1000,   // a day's hours, an hour's minutes, a minute's seconds
    leapEvery: 1000, leapDays: 100,     // a leap rule: every 2 to 1000 years, 1 to 100 days more
    notes: 500, noteChars: 400,         // item 20 K3: a clock's dated notes, and a note's text (code points, one line)
    time: 1e15                          // world time, in seconds (about 31 million years of 24-hour days)
});
var DAY = Object.freeze({ hours: 24, minutes: 60, seconds: 60 });   // a day's shape when the calendar says nothing
var NOTE_ID = /^n_[a-z0-9]{8}$/;   // item 20 K3: a dated note's id
var ACC_ID = /^[a-z]_[A-Za-z0-9_]{1,24}$/;   // K5: a character's or a rule's id (c_..., r_...): never a prototype's name
var CTRL_RE_G = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g;

function isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
function whole(v, lo, hi) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v && v >= lo && v <= hi ? v : null; }
function mod(a, n) { return ((a % n) + n) % n; }
function cutName(v, n) {   // plain one-line text, cut by code points
    if (typeof v !== 'string') return '';
    var s = v.replace(CTRL_RE_G, ' ').replace(/\s+/g, ' ').trim(), cps = Array.from(s);
    return cps.length > n ? cps.slice(0, n).join('').trim() : s;
}

// A system's calendar, cleaned (the same in the GM's view and the players'): { periods?: [{ name, days, extra? }], week?: [names],
// first? (the weekday of day 1, a place in week), hours?, minutes?, seconds? (only when not 24, 60, 60), era? (the label after the
// year), one? (the year day 1 falls in; absent: 1), down? (years count down: 3964, 3963 …), leap?: { every, from (a leap year,
// as the calendar numbers it), period (a place in periods), days } }. A period needs a name and 1 to 1000 days; a weekday a name.
// A leap rule's period and the first weekday are places in the lists AS WRITTEN: one dropped before them moves them with it, and the
// rule (or the first weekday) goes with a period (or a weekday) that is dropped. Nothing set: null (a plain count of days of 24 hours)
function cleanCalendar(v) {
    if (!isObj(v)) return null;
    var out = {}, ps = [], wk = [], pAt = {}, wAt = {};
    (Array.isArray(v.periods) ? v.periods : []).forEach(function(p, i) {
        if (ps.length >= LIMITS.periods || !isObj(p)) return;
        var nm = cutName(p.name, LIMITS.name), d = whole(p.days, 1, LIMITS.periodDays); if (!nm || d === null) return;
        var o = { name: nm, days: d }; if (p.extra === true) o.extra = true; pAt[i] = ps.length; ps.push(o);
    });
    if (ps.length) out.periods = ps;
    (Array.isArray(v.week) ? v.week : []).forEach(function(w, i) { if (wk.length >= LIMITS.week) return; var nm = cutName(w, LIMITS.name); if (nm) { wAt[i] = wk.length; wk.push(nm); } });
    if (wk.length) { out.week = wk; var fw = whole(v.first, 0, LIMITS.week * 1000); if (fw !== null && Object.prototype.hasOwnProperty.call(wAt, fw) && wAt[fw] > 0) out.first = wAt[fw]; }
    ['hours', 'minutes', 'seconds'].forEach(function(k) { var n = whole(v[k], 1, LIMITS[k]); if (n !== null && n !== DAY[k]) out[k] = n; });
    var era = cutName(v.era, LIMITS.era); if (era) out.era = era;
    var one = whole(v.one, -LIMITS.year, LIMITS.year); if (one !== null && one !== 1) out.one = one;
    if (v.down === true) out.down = true;
    if (ps.length && isObj(v.leap)) {
        var lv = v.leap, ev = whole(lv.every, 2, LIMITS.leapEvery), fr = whole(lv.from, -LIMITS.year, LIMITS.year), pi = whole(lv.period, 0, 1e6), ld = whole(lv.days, 1, LIMITS.leapDays);
        if (ev !== null && fr !== null && pi !== null && Object.prototype.hasOwnProperty.call(pAt, pi) && ld !== null) out.leap = { every: ev, from: fr, period: pAt[pi], days: ld };
    }
    return Object.keys(out).length ? out : null;
}

// What the maths needs, worked out from a calendar cleaned again (so a draft being edited, or anything else, is read as Save would keep it)
function shape(cal) {
    var c = cleanCalendar(cal) || {}, ps = c.periods || [], base = 0;
    ps.forEach(function(p) { base += p.days; });
    var H = c.hours || DAY.hours, M = c.minutes || DAY.minutes, S = c.seconds || DAY.seconds, one = typeof c.one === 'number' ? c.one : 1, down = c.down === true, lp = null;
    if (c.leap) lp = { every: c.leap.every, r: mod(down ? one - c.leap.from : c.leap.from - one, c.leap.every), period: c.leap.period, days: c.leap.days };
    return { c: c, ps: ps, week: c.week || [], first: c.first || 0, H: H, M: M, S: S, dayLen: H * M * S, base: base, lp: lp, one: one, down: down, era: c.era || '' };
}
// Years are counted from 0 (the year day 1 falls in); a leap year is one whose count sits on the rule's cycle
function leapY(sh, yi) { return !!sh.lp && mod(yi - sh.lp.r, sh.lp.every) === 0; }
function leapsBefore(sh, yi) { return !sh.lp || yi <= sh.lp.r ? 0 : Math.floor((yi - 1 - sh.lp.r) / sh.lp.every) + 1; }
function daysBefore(sh, yi) { return yi * sh.base + leapsBefore(sh, yi) * (sh.lp ? sh.lp.days : 0); }
function plen(sh, yi, i) { return sh.ps[i].days + (sh.lp && i === sh.lp.period && leapY(sh, yi) ? sh.lp.days : 0); }
function yearOfDay(sh, D) {
    var avg = sh.base + (sh.lp ? sh.lp.days / sh.lp.every : 0), yi = Math.max(0, Math.floor(D / avg));
    while (yi > 0 && daysBefore(sh, yi) > D) yi--;
    while (daysBefore(sh, yi + 1) <= D) yi++;
    return yi;
}
function clampT(t) { return typeof t === 'number' && isFinite(t) ? Math.floor(Math.max(0, Math.min(LIMITS.time, t))) : 0; }
function yearNo(sh, yi) { return sh.down ? sh.one - yi : sh.one + yi; }
function yearIndex(sh, year) { return sh.down ? sh.one - year : year - sh.one; }

// A moment as a date: { t, day (days since day 1, from 0), h, m, s, weekday (a place in week, -1 with none), yi (years since the first,
// from 0; -1 with no periods), year (as the calendar numbers it; null with no periods), period (a place in periods; -1 with none), pday
// (the day of that period from 1, or the day's number with no periods), month (the period's number among those inside the month count;
// 0 for one outside it or none), doy (the day of the year from 1), leap }
function dateOf(cal, t) {
    var sh = shape(cal); t = clampT(t);
    var D = Math.floor(t / sh.dayLen), sod = t - D * sh.dayLen;
    var out = { t: t, day: D, h: Math.floor(sod / (sh.M * sh.S)), m: Math.floor(sod / sh.S) % sh.M, s: sod % sh.S, weekday: sh.week.length ? mod(D + sh.first, sh.week.length) : -1 };
    if (!sh.ps.length) { out.yi = -1; out.year = null; out.period = -1; out.pday = D + 1; out.month = 0; out.doy = D + 1; out.leap = false; return out; }
    var yi = yearOfDay(sh, D), doy = D - daysBefore(sh, yi), mn = 0, i = 0;
    out.doy = doy + 1;
    for (; i < sh.ps.length; i++) { var len = plen(sh, yi, i); if (!sh.ps[i].extra) mn++; if (doy < len) break; doy -= len; }
    if (i >= sh.ps.length) i = sh.ps.length - 1;   // never: a year's days are its periods' days
    out.yi = yi; out.year = yearNo(sh, yi); out.period = i; out.pday = doy + 1; out.month = sh.ps[i].extra ? 0 : mn; out.leap = leapY(sh, yi);
    return out;
}
// A date back to world time: { year | yi, period, pday, h?, m?, s? } (with no periods: { pday, … }, pday the day's number). Anything out
// of the calendar's range (a day past its period's length, an hour past the day's, a year before the first): null
function timeOf(cal, d) {
    var sh = shape(cal); if (!isObj(d)) return null;
    var h = whole(d.h === undefined ? 0 : d.h, 0, sh.H - 1), m = whole(d.m === undefined ? 0 : d.m, 0, sh.M - 1), s = whole(d.s === undefined ? 0 : d.s, 0, sh.S - 1), D;
    if (h === null || m === null || s === null) return null;
    if (!sh.ps.length) { var dn = whole(d.pday, 1, Math.floor(LIMITS.time / sh.dayLen) + 1); if (dn === null) return null; D = dn - 1; }
    else {
        var yi = whole(typeof d.year === 'number' ? yearIndex(sh, d.year) : d.yi, 0, 1e12); if (yi === null) return null;
        var pi = whole(d.period, 0, sh.ps.length - 1); if (pi === null) return null;
        var pd = whole(d.pday, 1, plen(sh, yi, pi)); if (pd === null) return null;
        D = daysBefore(sh, yi); for (var i = 0; i < pi; i++) D += plen(sh, yi, i); D += pd - 1;
    }
    var t = D * sh.dayLen + h * sh.M * sh.S + m * sh.S + s;
    return t >= 0 && t <= LIMITS.time ? t : null;
}
// The days a period holds in a year (as the calendar numbers it), leap days included; 0 when there is no such period or year
function periodDays(cal, year, period) {
    var sh = shape(cal), yi = typeof year === 'number' && isFinite(year) ? yearIndex(sh, year) : -1;
    return sh.ps.length && whole(yi, 0, 1e12) !== null && whole(period, 0, sh.ps.length - 1) !== null ? plen(sh, yi, period) : 0;
}
function yearDays(cal, year) { var sh = shape(cal), yi = typeof year === 'number' && isFinite(year) ? yearIndex(sh, year) : -1; if (!sh.ps.length || whole(yi, 0, 1e12) === null) return 0; return sh.base + (leapY(sh, yi) ? sh.lp.days : 0); }
function dayLength(cal) { return shape(cal).dayLen; }

// Words (plain text for a text node, a title or a toast; never markup): "Primeday, 4 First, 3964 BBY"; a one-day period outside the
// month count reads by its name alone ("Taungsday, Midyear Holiday, 3964 BBY"); with no periods "Day 45"; with no weekdays no weekday
function fmtDate(cal, t) {
    var sh = shape(cal), d = dateOf(cal, t), wd = d.weekday >= 0 ? sh.week[d.weekday] + ', ' : '';
    if (!sh.ps.length) return wd + 'Day ' + d.pday;
    var p = sh.ps[d.period], alone = p.extra && plen(sh, d.yi, d.period) === 1;
    return wd + (alone ? p.name : d.pday + ' ' + p.name) + ', ' + d.year + (sh.era ? ' ' + sh.era : '');
}
function pad(n, most) { var w = String(Math.max(1, most - 1)).length, s = String(n); while (s.length < w) s = '0' + s; return s; }
function fmtTime(cal, t, secs) {   // 08:05 (a day of 24 hours), with :30 seconds when asked
    var sh = shape(cal), d = dateOf(cal, t);
    return pad(d.h, Math.max(sh.H, 11)) + ':' + pad(d.m, sh.M) + (secs ? ':' + pad(d.s, sh.S) : '');
}
function fmtWhen(cal, t, secs) { return fmtDate(cal, t) + ', ' + fmtTime(cal, t, secs); }
// A stretch of time in words by the calendar's own day: "3 days, 4 hours" (each part that is not 0, largest first); "no time" for 0
function fmtSpan(cal, secs) {
    var sh = shape(cal), n = typeof secs === 'number' && isFinite(secs) ? Math.floor(Math.abs(secs)) : 0, parts = [];
    [[sh.dayLen, 'day'], [sh.M * sh.S, 'hour'], [sh.S, 'minute'], [1, 'second']].forEach(function(u) { var k = Math.floor(n / u[0]); n -= k * u[0]; if (k) parts.push(k + ' ' + u[1] + (k === 1 ? '' : 's')); });
    return parts.length ? parts.join(', ') : 'no time';
}

// Item 20 K2: a campaign's clock (camp.clock), cleaned: { t (world time, a whole number of seconds from 0 to 10^15; absent or no number: 0),
// hide? (true only: the GM keeps the date from players), notes? (K3: dated notes, each { id: n_ and 8 of a-z 0-9, once; day: the day it
// falls on, days from day 1 counted from 0; text: one line, 400 code points; vis: 'all' only, players see it, absent: the GM's alone }, at
// most 500, in day order, a note with no day or no text dropped) }. Not an object: null (no clock yet: day 1 at 00:00)
function cleanClock(v) {
    if (!isObj(v)) return null;
    var o = { t: clampT(v.t) }, seen = Object.create(null), ns = []; if (v.hide === true) o.hide = true;
    (Array.isArray(v.notes) ? v.notes : []).forEach(function(n) {
        if (ns.length >= LIMITS.notes || !isObj(n) || typeof n.id !== 'string' || !NOTE_ID.test(n.id) || seen[n.id] === 1) return;
        var day = whole(n.day, 0, LIMITS.time), tx = cutName(n.text, LIMITS.noteChars); if (day === null || !tx) return;
        seen[n.id] = 1; var nn = { id: n.id, day: day, text: tx }; if (n.vis === 'all') nn.vis = 'all'; ns.push(nn);
    });
    if (ns.length) o.notes = ns.map(function(n, i) { return [n, i]; }).sort(function(a, b) { return a[0].day - b[0].day || a[1] - b[1]; }).map(function(x) { return x[0]; });
    var acc = cleanAcc(v.acc); if (acc) o.acc = acc;   // K5: what each character's time rules have counted (the GM's own; never sent)
    return o;
}
// Item 20 K5: what each character's time rules have counted towards their next firing — { charId: { ruleId: seconds } }, ids by pattern, seconds
// from 0 below the limit, at most 1000 characters of 50 rules; none: null
function cleanAcc(v) {
    if (!isObj(v)) return null;
    var out = {}, nc = 0;
    Object.keys(v).forEach(function(c) {
        if (nc >= 1000 || !ACC_ID.test(c) || !isObj(v[c])) return;
        var inner = {}, nr = 0; Object.keys(v[c]).forEach(function(r) { var x = v[c][r]; if (nr >= 50 || !ACC_ID.test(r) || typeof x !== 'number' || !isFinite(x) || x <= 0 || x >= LIMITS.time) return; inner[r] = Math.round(x * 1000) / 1000; nr++; });
        if (nr) { out[c] = inner; nc++; }
    });
    return nc ? out : null;
}
// K5: how long a time rule's interval is, in seconds by the calendar's own day — n minutes, hours, days or weeks (a week of the calendar's week,
// 7 days with none), or n of the system's own time units ([{ key, secs }]); 0 when it cannot be read
function everySecs(cal, units, every) {
    if (!isObj(every) || typeof every.n !== 'number' || !(every.n > 0)) return 0;
    var sh = shape(cal), per = every.u === 'min' ? sh.S : every.u === 'hour' ? sh.M * sh.S : every.u === 'day' ? sh.dayLen : every.u === 'week' ? (sh.week.length || 7) * sh.dayLen : 0;
    if (!per && typeof every.u === 'string') (Array.isArray(units) ? units : []).forEach(function(u) { if (!per && isObj(u) && typeof u.key === 'string' && u.key.toLowerCase() === every.u.toLowerCase() && typeof u.secs === 'number' && u.secs > 0) per = u.secs; });
    return per > 0 ? every.n * per : 0;
}
// K5 (the owner's answer: rest adds up, activity breaks it): the time rules a stretch of time fires — rules [{ id, every }], charIds, acc (what
// each has counted, as cleanAcc keeps it), secs (the stretch), rest (true: rest). A rule during rest only counts rest, and a stretch of activity
// clears what it had counted; any other rule counts all time. Each full interval fires once (at most 500 a stretch) and the rest carries.
// { fires: [{ c, r, n }], acc } — a new acc, the one given left as it was
function ruleFires(cal, units, rules, charIds, acc, secs, rest) {
    var out = { fires: [], acc: {} }, prev = cleanAcc(acc) || {}; Object.keys(prev).forEach(function(c) { out.acc[c] = Object.assign({}, prev[c]); });
    if (typeof secs !== 'number' || !isFinite(secs) || !(secs > 0)) return out;
    (Array.isArray(charIds) ? charIds : []).forEach(function(c) {
        if (typeof c !== 'string' || !ACC_ID.test(c)) return;
        (Array.isArray(rules) ? rules : []).forEach(function(rl) {
            if (!isObj(rl) || typeof rl.id !== 'string' || !ACC_ID.test(rl.id)) return;
            var per = everySecs(cal, units, rl.every); if (!(per > 0)) return;
            var mine = Object.prototype.hasOwnProperty.call(out.acc, c) ? out.acc[c] : (out.acc[c] = {}), had = Object.prototype.hasOwnProperty.call(mine, rl.id) ? mine[rl.id] : 0;
            if (rl.every.rest === true && !rest) { delete mine[rl.id]; if (!Object.keys(mine).length) delete out.acc[c]; return; }
            var a = had + secs, k = Math.floor(a / per), left = a - k * per;
            if (left > 0.0005) mine[rl.id] = Math.round(left * 1000) / 1000; else delete mine[rl.id];
            if (!Object.keys(mine).length) delete out.acc[c];
            if (k > 0) out.fires.push({ c: c, r: rl.id, n: Math.min(500, k) });
        });
    });
    return out;
}

// The editor's starting points (fresh objects: a caller may keep and change one). 'twelve': the real-world year, a leap day in February
// every fourth year; 'days': a plain count of days (no calendar at all)
var PRESETS = Object.freeze(['twelve', 'days']);
function preset(id) {
    if (id !== 'twelve') return null;
    var ms = [['January', 31], ['February', 28], ['March', 31], ['April', 30], ['May', 31], ['June', 30], ['July', 31], ['August', 31], ['September', 30], ['October', 31], ['November', 30], ['December', 31]];
    return { periods: ms.map(function(x) { return { name: x[0], days: x[1] }; }), week: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], leap: { every: 4, from: 4, period: 1, days: 1 } };
}

// Names another module can import beside its own LIMITS and helpers (sheets.js)
var CAL_LIMITS = LIMITS, calPreset = preset;
var API = { VERSION: VERSION, LIMITS: LIMITS, DAY: DAY, PRESETS: PRESETS, cleanCalendar: cleanCalendar, cleanClock: cleanClock, cleanAcc: cleanAcc, everySecs: everySecs, ruleFires: ruleFires, dateOf: dateOf, timeOf: timeOf, periodDays: periodDays, yearDays: yearDays, dayLength: dayLength, fmtDate: fmtDate, fmtTime: fmtTime, fmtWhen: fmtWhen, fmtSpan: fmtSpan, preset: preset };
if (typeof window !== 'undefined') window.wpCalendarCore = API;
export { VERSION, LIMITS, CAL_LIMITS, calPreset, DAY, PRESETS, cleanCalendar, cleanClock, cleanAcc, everySecs, ruleFires, dateOf, timeOf, periodDays, yearDays, dayLength, fmtDate, fmtTime, fmtWhen, fmtSpan, preset };

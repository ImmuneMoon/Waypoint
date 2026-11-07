/* Game calendar (1.5.0, backlog item 20) — the pure half: a system's calendar (its periods in year order, some outside the
   month count such as a festival week or a holiday; a week of named days running on across months and years; the day's
   hours, minutes and seconds; the year that day 1 falls in, a label after it and whether years count down; a leap rule),
   cleaned the same in every view, and the date maths a campaign's clock runs on. World time is ONE whole number of
   seconds from the first moment of day 1 (as the reference VTT keeps its world time); a date is worked out from it and back.
   No DOM, no state: tools/calendarcheck.js runs it under Node. Published as window.wpCalendarCore.
   Design of record: docs/CALENDAR_PLAN.md. */
'use strict';

var VERSION = '1.5.0';
var LIMITS = Object.freeze({
    periods: 600, periodDays: 1000,     // a year's periods (months, festival weeks, holidays) and the days one holds
    week: 200, name: 40, era: 24,       // weekday names, a period's or a weekday's name, the label after the year (code points)
    year: 1e7,                          // the year day 1 falls in, and a leap rule's year, either way
    hours: 100, minutes: 1000, seconds: 1000,   // a day's hours, an hour's minutes, a minute's seconds
    leapEvery: 1000, leapDays: 100,     // a leap rule: every 2 to 1000 years, 1 to 100 days more
    leaps: 8, leapTurns: 12,            // 1.6.2 (backlog 60): more leap rules, and the periods one rule's days take turns through
    others: 4, otherAt: 1e9,            // ... and other calendars over the same days, and how many days in each one's own count world day 1 falls
    notes: 500, noteChars: 400,         // item 20 K3: a clock's dated notes, and a note's text (code points, one line)
    rates: Object.freeze([1, 2, 5, 10, 60]),   // 1.5.4: how fast a clock may run by itself, times real time (1 is the absent default)
    moons: 4, cycle: 10000,             // 1.6.2 (backlog 147): a calendar's moons, and the days of a moon's cycle at most
    seasons: 12,                        // ... and its seasons
    time: 1e15                          // world time, in seconds (about 31 million years of 24-hour days)
});
var DAY = Object.freeze({ hours: 24, minutes: 60, seconds: 60 });   // a day's shape when the calendar says nothing
var NOTE_ID = /^n_[a-z0-9]{8}$/;   // item 20 K3: a dated note's id
var ACC_ID = /^[a-z]_[A-Za-z0-9_]{1,24}$/;   // K5: a character's or a rule's id (c_..., r_...): never a prototype's name
var CTRL_RE_G = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g;

function isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
function whole(v, lo, hi) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v && v >= lo && v <= hi ? v : null; }
function mod(a, n) { return ((a % n) + n) % n; }
function hund(v, lo, hi) { if (typeof v !== 'number' || !isFinite(v)) return null; var r = Math.round(v * 100) / 100; return r >= lo && r <= hi ? r : null; }   // a number to the hundredth, inside its bounds
function cutName(v, n) {   // plain one-line text, cut by code points
    if (typeof v !== 'string') return '';
    var s = v.replace(CTRL_RE_G, ' ').replace(/\s+/g, ' ').trim(), cps = Array.from(s);
    return cps.length > n ? cps.slice(0, n).join('').trim() : s;
}

// A system's calendar, cleaned (the same in the GM's view and the players'): { periods?: [{ name, days, extra? }], week?: [names],
// first? (the weekday of day 1, a place in week), hours?, minutes?, seconds? (only when not 24, 60, 60), era? (the label after the
// year), one? (the year day 1 falls in; absent: 1), down? (years count down: 1200, 1199 …), leap?: { every, from (a leap year,
// as the calendar numbers it), period (a place in periods), days } }. A period needs a name and 1 to 1000 days; a weekday a name.
// A leap rule's period and the first weekday are places in the lists AS WRITTEN: one dropped before them moves them with it, and the
// rule (or the first weekday) goes with a period (or a weekday) that is dropped. Nothing set: null (a plain count of days of 24 hours)
function cleanCalendar(v, inner) {
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
    // 1.6.2 (backlog 60; the owner, 2026-11-07, by prompt: "Several rules", "Yes, a rule may rotate"): more leap rules beside the first, each
    // every so many years from a year of its own, adding its days to the periods it names in turn: the first leap year it counts from to the
    // first, the next to the second, and round again. A period is a place as written, as the first rule's is; one dropped goes from the turns
    if (ps.length && Array.isArray(v.leaps)) {
        var lps = [];
        v.leaps.forEach(function(lv) {
            if (lps.length >= LIMITS.leaps || !isObj(lv)) return;
            var ev = whole(lv.every, 2, LIMITS.leapEvery), fr = whole(lv.from, -LIMITS.year, LIMITS.year), ld = whole(lv.days, 1, LIMITS.leapDays), tu = [];
            (Array.isArray(lv.periods) ? lv.periods : [lv.period]).forEach(function(pi) { if (tu.length >= LIMITS.leapTurns) return; pi = whole(pi, 0, 1e6); if (pi !== null && Object.prototype.hasOwnProperty.call(pAt, pi)) tu.push(pAt[pi]); });
            if (ev !== null && fr !== null && ld !== null && tu.length) lps.push({ every: ev, from: fr, periods: tu, days: ld });
        });
        if (lps.length) out.leaps = lps;
    }
    // 1.6.2 (backlog 147; the owner, 2026-11-06, by prompt: "Moons and phases", "Seasons"): a moon has a name, the days of its cycle (to the
    // hundredth, 2 to 10,000) and how far into its cycle it is on day 1 (absent 0, a new moon); a season a name and the day of the year it
    // begins on, a period and a day of it, in the year's order
    var mns = []; (Array.isArray(v.moons) ? v.moons : []).forEach(function(mo) {
        if (mns.length >= LIMITS.moons || !isObj(mo)) return;
        var nm = cutName(mo.name, LIMITS.name), cy = hund(mo.cycle, 2, LIMITS.cycle); if (!nm || cy === null) return;
        var o = { name: nm, cycle: cy }, at = hund(mo.at, 0, cy); if (at !== null && at > 0 && at < cy) o.at = at; mns.push(o);
    });
    if (mns.length) out.moons = mns;
    if (ps.length) {
        var sns = []; (Array.isArray(v.seasons) ? v.seasons : []).forEach(function(se) {
            if (sns.length >= LIMITS.seasons || !isObj(se)) return;
            var nm = cutName(se.name, LIMITS.name), pi = whole(se.period, 0, 1e6); if (!nm || pi === null || !Object.prototype.hasOwnProperty.call(pAt, pi)) return;
            var p = pAt[pi], dy = whole(se.day === undefined ? 1 : se.day, 1, ps[p].days); if (dy === null) return;
            sns.push({ name: nm, period: p, day: dy });
        });
        sns = sns.map(function(s, i) { return [s, i]; }).sort(function(a, b) { return a[0].period - b[0].period || a[0].day - b[0].day || a[1] - b[1]; }).map(function(x) { return x[0]; });
        if (sns.length) out.seasons = sns;
    }
    // 1.6.2 (backlog 60; the owner, 2026-11-07, by prompt: "Yes, header shows one"): other calendars reckoning the same days, as another people
    // counts them. Each has a name, periods, a week, years and leap rules of its own (no moons, no seasons, and the main calendar's day), and at: the
    // days its own count has run when world day 1 begins (0: they begin together). The campaign's clock says which one the top row shows
    if (!inner && Array.isArray(v.others)) {
        var os = [];
        v.others.forEach(function(o) {
            if (os.length >= LIMITS.others || !isObj(o)) return;
            var nm = cutName(o.name, LIMITS.name); if (!nm) return;
            var c = cleanCalendar(o, true) || {}, oo = { name: nm };
            ['periods', 'week', 'first', 'era', 'one', 'down', 'leap', 'leaps'].forEach(function(k) { if (c[k] !== undefined) oo[k] = c[k]; });
            var at = whole(o.at, 0, LIMITS.otherAt); if (at) oo.at = at;
            os.push(oo);
        });
        if (os.length) out.others = os;
    }
    return Object.keys(out).length ? out : null;
}
// 1.6.2 (backlog 60): calendar k as the clock reads it, 0 (or none, or one that is not there) the main one: { k, name, cal (a calendar to reckon and
// say a date with, the main one's day), shift (seconds to add to world time) }
function viewCal(cal, k) {
    var cc = cleanCalendar(cal) || {}, os = cc.others || [], i = whole(k, 1, os.length);
    if (i === null) return { k: 0, name: '', cal: cc, shift: 0 };
    var o = os[i - 1], c = {}; Object.keys(o).forEach(function(key) { if (key !== 'name' && key !== 'at') c[key] = o[key]; });
    ['hours', 'minutes', 'seconds'].forEach(function(key) { if (cc[key] !== undefined) c[key] = cc[key]; });
    return { k: i, name: o.name, cal: c, shift: (o.at || 0) * shape(cc).dayLen };
}
// Every calendar's name in order, the main one ''
function calNamesOf(cal) { var cc = cleanCalendar(cal) || {}; return [''].concat((cc.others || []).map(function(o) { return o.name; })); }
// A moment's date and time in calendar k: "Firstday, 4 First, 1200 BCE, 08:05"
function fmtIn(cal, k, t, secs) { var v = viewCal(cal, k); return fmtWhen(v.cal, clampT(t) + v.shift, secs); }
function fmtDateIn(cal, k, t) { var v = viewCal(cal, k); return fmtDate(v.cal, clampT(t) + v.shift); }

// What the maths needs, worked out from a calendar cleaned again (so a draft being edited, or anything else, is read as Save would keep it)
function shape(cal) {
    var c = cleanCalendar(cal) || {}, ps = c.periods || [], base = 0;
    ps.forEach(function(p) { base += p.days; });
    var H = c.hours || DAY.hours, M = c.minutes || DAY.minutes, S = c.seconds || DAY.seconds, one = typeof c.one === 'number' ? c.one : 1, down = c.down === true, lr = [];
    // each rule: every, f (the year it counts from, as years since day 1's, either way), r (its first leap year from day 1's on), days, ps (its periods in turn)
    (c.leap ? [{ every: c.leap.every, from: c.leap.from, days: c.leap.days, periods: [c.leap.period] }] : []).concat(c.leaps || []).forEach(function(l) { var f = down ? one - l.from : l.from - one; lr.push({ every: l.every, f: f, r: mod(f, l.every), days: l.days, ps: l.periods }); });
    return { c: c, ps: ps, week: c.week || [], first: c.first || 0, H: H, M: M, S: S, dayLen: H * M * S, base: base, lr: lr, lp: lr[0] || null, one: one, down: down, era: c.era || '' };
}
// Years are counted from 0 (the year day 1 falls in); a leap year is one whose count sits on the rule's cycle
function ruleHit(rl, yi) { return mod(yi - rl.r, rl.every) === 0; }
function ruleBefore(rl, yi) { return yi <= rl.r ? 0 : Math.floor((yi - 1 - rl.r) / rl.every) + 1; }   // its leap years before this one, from day 1's on
function ruleTurn(rl, yi) { return rl.ps[mod(Math.round((yi - rl.f) / rl.every), rl.ps.length)]; }   // the period this leap year's days go to: counted from the year the rule counts from
function leapY(sh, yi) { return sh.lr.some(function(rl) { return ruleHit(rl, yi); }); }
function leapDays(sh, yi) { var d = 0; sh.lr.forEach(function(rl) { if (ruleHit(rl, yi)) d += rl.days; }); return d; }
function daysBefore(sh, yi) { var d = yi * sh.base; sh.lr.forEach(function(rl) { d += ruleBefore(rl, yi) * rl.days; }); return d; }
function plen(sh, yi, i) { var d = sh.ps[i].days; sh.lr.forEach(function(rl) { if (ruleHit(rl, yi) && ruleTurn(rl, yi) === i) d += rl.days; }); return d; }
function yearOfDay(sh, D) {
    var avg = sh.base; sh.lr.forEach(function(rl) { avg += rl.days / rl.every; });
    var yi = Math.max(0, Math.floor(D / avg));
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
// 1.6.0: the date as formulas read it (Date.year, Date.day, Date.days, Date.hour, Date.minute): the year signed, so a year that counts down
// (3963 before an era) reads -3963 and an era counting down compares; the day of its period; whole days since the calendar's first; the
// hour and the minute. A calendar with no periods has no year (0)
function dateNames(cal, t) { var d = dateOf(cal, t), sh = shape(cal), o = { year: typeof d.year === 'number' ? (sh.down ? -d.year : d.year) : 0, day: d.pday, days: d.day, hour: d.h, minute: d.m }, se = seasonOf(cal, t), mp = moonPhases(cal, t);
    if (se) o.season = se.n; mp.forEach(function(m, i) { if (MOON_KEYS[i]) o[MOON_KEYS[i]] = m.i + 1; }); return o; }   // 1.6.2 (backlog 147): the season by its place (1 the first) and each moon's phase (1 new to 8), only where the calendar has them: a formula reads 0 for one it does not
// 1.6.2 (backlog 147): a moon's eight phases, in order, and the date's names for each moon
var PHASES = Object.freeze(['New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent']);
var MOON_KEYS = Object.freeze(['moon', 'moon2', 'moon3', 'moon4']);
// Each moon's phase on the day a moment falls in: [{ name, i (0 a new moon to 7), f (how far through its cycle, 0 to under 1), peak (new, full or '') }], one a moon
function moonPhases(cal, t) {
    var sh = shape(cal), D = Math.floor(clampT(t) / sh.dayLen);
    return (sh.c.moons || []).map(function(mo) { var f = mod(D + (mo.at || 0), mo.cycle) / mo.cycle, w = 0.5 / mo.cycle; return { name: mo.name, i: mod(Math.floor(f * 8 + 0.5), 8), f: f, peak: f < w || f >= 1 - w ? 'new' : f >= 0.5 - w && f < 0.5 + w ? 'full' : '' }; });   // peak: the one day a cycle nearest its new or its full point
}
// The season a moment falls in: { name, n (its place, 1 the first) }, or null with none. A day before the year's first season is in its last
function seasonOf(cal, t) {
    var sh = shape(cal), ss = sh.c.seasons || []; if (!ss.length || !sh.ps.length) return null;
    var d = dateOf(cal, t), at = ss.length - 1;
    for (var k = 0; k < ss.length; k++) { var s0 = 0; for (var i = 0; i < ss[k].period; i++) s0 += plen(sh, d.yi, i); s0 += Math.min(ss[k].day, plen(sh, d.yi, ss[k].period)); if (s0 <= d.doy) at = k; else break; }
    return { name: ss[at].name, n: at + 1 };
}
// What a player's app takes of those five numbers from its host (the date kept from players: the numbers alone), numbers only, bounded
function cleanDateFig(v) { if (!isObj(v)) return null; var o = {}, ok = true; ['year', 'day', 'days', 'hour', 'minute'].forEach(function(k) { var x = v[k]; if (typeof x !== 'number' || !isFinite(x) || Math.abs(x) > 1e12) ok = false; else o[k] = Math.round(x); });
    if (ok) ['season'].concat(MOON_KEYS).forEach(function(k) { var x = whole(v[k], 0, k === 'season' ? LIMITS.seasons : 8); if (x !== null) o[k] = x; });   // 1.6.2: the season and the moons' phases, each only as a whole number in its range
    return ok ? o : null; }
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
function yearDays(cal, year) { var sh = shape(cal), yi = typeof year === 'number' && isFinite(year) ? yearIndex(sh, year) : -1; if (!sh.ps.length || whole(yi, 0, 1e12) === null) return 0; return sh.base + leapDays(sh, yi); }
function dayLength(cal) { return shape(cal).dayLen; }

// Words (plain text for a text node, a title or a toast; never markup): "Firstday, 4 First, 1200 BCE"; a one-day period outside the
// month count reads by its name alone ("Thirdday, Midsummer Day, 1200 BCE"); with no periods "Day 45"; with no weekdays no weekday
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
// most 500, in day order, a note with no day or no text dropped) }. Backlog 152 (the fight clock), the GM's own and never sent (net.js clockOut
// builds only t and notes): top? (the highest second reached, a time pair, kept only while it is past t: after a step back), lived? (each
// character's own time past the clock's, as cleanLived keeps it, only above top or t), rulesOff? (the NPCs whose time rules do not run by
// themselves, the GM's Rules run switch: character ids by pattern, each once, at most 1000). Not an object: null (no clock yet: day 1 at 00:00)
function cleanClock(v) {
    if (!isObj(v)) return null;
    var o = { t: clampT(v.t) }, seen = Object.create(null), ns = []; if (v.hide === true) o.hide = true;
    if (v.hold === true) o.hold = true;   // 1.5.4, the running clock: only the GM's hold is stored (absent: it runs while a session is open)
    if (typeof v.rate === 'number' && v.rate !== 1 && LIMITS.rates.indexOf(v.rate) >= 0) o.rate = v.rate;   // and only a speed other than real time
    (Array.isArray(v.notes) ? v.notes : []).forEach(function(n) {
        if (ns.length >= LIMITS.notes || !isObj(n) || typeof n.id !== 'string' || !NOTE_ID.test(n.id) || seen[n.id] === 1) return;
        var day = whole(n.day, 0, LIMITS.time), tx = cutName(n.text, LIMITS.noteChars); if (day === null || !tx) return;
        seen[n.id] = 1; var nn = { id: n.id, day: day, text: tx }; if (n.vis === 'all') nn.vis = 'all'; var wr = whole(n.at, 0, MS_MAX); if (wr !== null) nn.at = wr; ns.push(nn);   // 1.6.2 (backlog 147): the real moment it was written, in milliseconds, the GM's own
    });
    if (ns.length) o.notes = ns.map(function(n, i) { return [n, i]; }).sort(function(a, b) { return a[0].day - b[0].day || a[1] - b[1]; }).map(function(x) { return x[0]; });
    var acc = cleanAcc(v.acc); if (acc) o.acc = acc;   // K5: what each character's time rules have counted (the GM's own; never sent)
    var top = cleanTime(v.top); if (top && tCmp(top, o.t) > 0) o.top = top;   // 152: the highest second reached, while the clock is under it
    var lv = cleanLived(v.lived, o.top || o.t); if (lv) o.lived = lv;   // 152: each character's own time past the clock's
    var off = cleanRulesOff(v.rulesOff); if (off) o.rulesOff = off;   // 152: the NPCs whose time rules the GM switched off
    var sc = whole(v.cal, 1, LIMITS.others); if (sc !== null) o.cal = sc;   // 1.6.2 (backlog 60): the other calendar the top row shows (absent: the main one)
    return o;
}
// Item 20 K5: what each character's time rules have counted towards their next firing — { charId: { ruleId: seconds } }, ids by pattern, seconds
// from 0 below the limit, at most 1000 characters of 100 counts (backlog 152: a rule's By the clock count, r_ and its id's tail, and its In a fight
// count, x_ and the same tail, so 50 rules make up to 100); none: null
function cleanAcc(v) {
    if (!isObj(v)) return null;
    var out = {}, nc = 0;
    Object.keys(v).forEach(function(c) {
        if (nc >= 1000 || !ACC_ID.test(c) || !isObj(v[c])) return;
        var inner = {}, nr = 0; Object.keys(v[c]).forEach(function(r) { var x = v[c][r]; if (nr >= 100 || !ACC_ID.test(r) || typeof x !== 'number' || !isFinite(x) || x <= 0 || x >= LIMITS.time) return; inner[r] = Math.round(x * 1000) / 1000; nr++; });
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
// { fires: [{ c, r, n }], acc } — a new acc, the one given left as it was. Backlog 152: an eighth argument o, a plain object whose fight is true or
// false, counts time in a fight or out of one (ruleFiresIn); anything else, or none, is the function above exactly as it was. 1.5.5: a ninth argument
// need, the judge of a count ticked Only while its needs hold (heldPart), in both ways; none, or no function, and both are exactly as they were
function ruleFires(cal, units, rules, charIds, acc, secs, rest, o, need) {
    if (fightOpt(o)) return ruleFiresIn(cal, units, rules, charIds, acc, secs, rest, o, need);
    var out = { fires: [], acc: {} }, prev = cleanAcc(acc) || {}; Object.keys(prev).forEach(function(c) { out.acc[c] = Object.assign({}, prev[c]); });
    if (typeof secs !== 'number' || !isFinite(secs) || !(secs > 0)) return out;
    (Array.isArray(charIds) ? charIds : []).forEach(function(c) {
        if (typeof c !== 'string' || !ACC_ID.test(c)) return;
        (Array.isArray(rules) ? rules : []).forEach(function(rl) {
            if (!isObj(rl) || typeof rl.id !== 'string' || !ACC_ID.test(rl.id)) return;
            var per = everySecs(cal, units, rl.every); if (!(per > 0)) return;
            var mine = Object.prototype.hasOwnProperty.call(out.acc, c) ? out.acc[c] : (out.acc[c] = {}), had = Object.prototype.hasOwnProperty.call(mine, rl.id) ? mine[rl.id] : 0;
            if (rl.every.rest === true && !rest) { delete mine[rl.id]; if (!Object.keys(mine).length) delete out.acc[c]; return; }
            var cs = heldPart(need, c, rl, false, secs); if (!(cs > 0)) { if (!Object.keys(mine).length) delete out.acc[c]; return; }   // 1.5.5: a count ticked Only while its needs hold adds only the time they held, and stands still otherwise
            var a = had + cs, k = Math.floor(a / per), left = a - k * per;
            if (left > 0.0005) mine[rl.id] = Math.round(left * 1000) / 1000; else delete mine[rl.id];
            if (!Object.keys(mine).length) delete out.acc[c];
            if (k > 0) out.fires.push({ c: c, r: rl.id, n: Math.min(500, k) });
        });
    });
    return out;
}
// 1.5.5 (the owner, 2026-10-23, of a droid's draw taken only where it slept at the moment each day began: "everything needs to be accounted for, no
// shortcuts"): a time rule's By the clock or In a fight may be ticked Only while its needs hold (every.whileNeeds, inFight.whileNeeds, true only), and
// that count then adds only the part of a stretch in which the rule's needs held for the character, standing still for the rest: never cleared, as a
// rest-only count is by activity. The core is pure, so the needs are judged by its caller and handed in as need(charId, rule, fight) (fight: the In a
// fight count; else By the clock's), asked only of a ticked count that counts in this stretch, after the rest gate: true is the whole stretch, a
// number that many of its seconds (held to it), anything else none of it. No need, no function or a count not ticked: the whole stretch, as before
function heldPart(need, c, rl, fight, s) {
    var pc = fight ? rl.inFight : rl.every; if (typeof need !== 'function' || !isObj(pc) || pc.whileNeeds !== true) return s;
    var v = false; try { v = need(c, rl, fight === true); } catch (e) { v = false; }
    return v === true ? s : typeof v === 'number' && isFinite(v) && v > 0 ? Math.min(s, v) : 0;
}

// Backlog 152 (the fight clock, docs/FIGHT_CLOCK_DESIGN.md 1 to 3): the pure core of fights that keep their own time.
// A time that is not the clock's own whole second (a fight's, a turn order's, a character's own) is a PAIR { s, ms }: whole seconds from 0 to
// 10^15 (as clampT) and whole milliseconds from 0 to 999, never past 10^15 seconds. A round's length is kept to the thousandth (systemcore
// cleanTurn), so a round is a whole number of milliseconds and every sum below is exact at any size: ten rounds of 0.1 s make one second.
var MS_MAX = 9007199254740991;   // Number.MAX_SAFE_INTEGER: a span in milliseconds is exact up to it (some 285,000 years) and held to it beyond
// A pair, as { s, ms } (ms absent: 0) or as the [s, ms] the clock stores; anything else, or one out of its bounds, is null
function cleanTime(v) {
    var s, ms;
    if (Array.isArray(v)) { if (v.length !== 2) return null; s = v[0]; ms = v[1]; }
    else if (isObj(v)) { s = v.s; ms = v.ms === undefined ? 0 : v.ms; }
    else return null;
    s = whole(s, 0, LIMITS.time); ms = whole(ms, 0, 999);
    if (s === null || ms === null || (s === LIMITS.time && ms > 0)) return null;
    return { s: s, ms: ms };
}
function tRead(v) { return typeof v === 'number' ? { s: clampT(v), ms: 0 } : cleanTime(v) || { s: 0, ms: 0 }; }   // a pair, or whole seconds (the clock's t); anything else 0
// A time moved on by dms whole milliseconds (back when below 0; a fraction rounded), held to 0 and to 10^15 seconds: a new pair
function tAdd(t, dms) {
    var a = tRead(t), d = typeof dms === 'number' && isFinite(dms) ? Math.max(-MS_MAX, Math.min(MS_MAX, Math.round(dms))) : 0, r = d % 1000;
    if (r < 0) r += 1000;
    var s = a.s + (d - r) / 1000, ms = a.ms + r;   // d - r is a whole number of seconds' milliseconds: the division is exact
    if (ms >= 1000) { ms -= 1000; s += 1; }
    if (s < 0) return { s: 0, ms: 0 };
    if (s > LIMITS.time || (s === LIMITS.time && ms > 0)) return { s: LIMITS.time, ms: 0 };
    return { s: s, ms: ms };
}
function tCmp(a, b) { var x = tRead(a), y = tRead(b); return x.s < y.s ? -1 : x.s > y.s ? 1 : x.ms < y.ms ? -1 : x.ms > y.ms ? 1 : 0; }   // -1, 0 or 1
function tFloor(t) { return tRead(t).s; }   // the whole second a time falls in: what the clock's own t reads while orders run
function tMax(a, b) { return tCmp(a, b) >= 0 ? tRead(a) : tRead(b); }
// From a to b in milliseconds (below 0 when b is before a): exact, and held to Number.MAX_SAFE_INTEGER either way
function tSpanMs(a, b) {
    var x = tRead(a), y = tRead(b);
    return Math.max(-MS_MAX, Math.min(MS_MAX, (y.s - x.s) * 1000 + (y.ms - x.ms)));   // exact wherever the answer is under the bound
}
// The marks of the characters whose own time is past the clock's (camp.clock.lived): { charId: [s, ms] }, ids by pattern (never a prototype's
// name), each a time pair above floor (a pair or whole seconds; absent: any pair), at most 1000; none: null
function cleanLived(v, floor) {
    if (!isObj(v)) return null;
    var f = floor === undefined ? null : tRead(floor), out = {}, n = 0;
    Object.keys(v).forEach(function(c) {
        if (n >= 1000 || !ACC_ID.test(c)) return;
        var tt = cleanTime(v[c]); if (!tt || (f && tCmp(tt, f) <= 0)) return;
        out[c] = [tt.s, tt.ms]; n++;
    });
    return n ? out : null;
}
// The GM's Rules run switch on each NPC, off (camp.clock.rulesOff): character ids by pattern, each once, in the order written, at most 1000; none: null
function cleanRulesOff(v) {
    if (!Array.isArray(v)) return null;
    var out = [], seen = Object.create(null);
    v.forEach(function(c) { if (out.length >= 1000 || typeof c !== 'string' || !ACC_ID.test(c) || seen[c] === 1) return; seen[c] = 1; out.push(c); });
    return out.length ? out : null;
}
// Each character's own time (design 1): L(c), the time up to which its time rules and timed effects have counted, is its mark in lived and never
// below base (the clock's t, or its top while a step back left the clock under it): a character with no mark reads base. A span from t0 to t1
// counts D = max(0, t1 - max(t0, L(c))) for each character, and L(c) becomes max(L(c), t1), so nobody lives a second twice: a step back and on
// again, a fight that ran ahead or one sheet with tokens in two fights counts each second once. ids: the characters (ids by pattern, each once).
// { spans: { charId: seconds, to the millisecond, only those above 0 }, lived: the marks after, as cleanLived keeps them above base (an empty
// object for none) } — the lived given is left as it was
function livedSpans(lived, base, ids, t0, t1) {
    var b = tRead(base), a1 = tRead(t1), marks = cleanLived(lived, b) || {}, out = { spans: {}, lived: {} }, seen = Object.create(null);
    (Array.isArray(ids) ? ids : []).forEach(function(c) {
        if (typeof c !== 'string' || !ACC_ID.test(c) || seen[c] === 1) return; seen[c] = 1;
        var L = Object.prototype.hasOwnProperty.call(marks, c) ? tRead(marks[c]) : b, d = tSpanMs(tMax(t0, L), a1);
        if (d > 0) out.spans[c] = d / 1000;
        var nl = tMax(L, a1); marks[c] = [nl.s, nl.ms];
    });
    out.lived = cleanLived(marks, b) || {};
    return out;
}
// How long a rule's In a fight interval is, in seconds: n rounds of rs seconds (the round's length), n minutes or hours of the calendar, or n of
// the system's own time units ([{ key, secs }], by key in any case); 0 when it cannot be read. A round's n is worked out to the millisecond
function fightSecs(cal, units, inFight, rs) {
    if (!isObj(inFight) || typeof inFight.n !== 'number' || !(inFight.n > 0) || typeof inFight.u !== 'string') return 0;
    if (inFight.u === 'round') return typeof rs === 'number' && isFinite(rs) && rs > 0 ? Math.round(inFight.n * rs * 1000) / 1000 : 0;
    if (inFight.u === 'min' || inFight.u === 'hour') return everySecs(cal, units, inFight);
    var per = 0; (Array.isArray(units) ? units : []).forEach(function(u) { if (!per && isObj(u) && typeof u.key === 'string' && u.key.toLowerCase() === inFight.u.toLowerCase() && typeof u.secs === 'number' && u.secs > 0) per = u.secs; });
    return per > 0 ? inFight.n * per : 0;
}
// ruleFires' eighth argument: a plain object whose fight is a boolean; anything else reads as none
function fightOpt(o) { if (!isObj(o)) return false; var pr = Object.getPrototypeOf(o); return (pr === Object.prototype || pr === null) && typeof o.fight === 'boolean'; }
// The time rules a stretch of each character's own time fires, in a fight (o.fight true; o.rs: the round's length in seconds) or out of one
// (o.fight false). secs is the stretch, or { charId: seconds } for characters with spans of their own (one with none counts nothing). The rest
// gate comes first, as above. By the clock (every, its r_ count) counts unless the rule Waits in a fight (every.wait) and this is a fight; In a
// fight (inFight, its x_ count: x_ and the rule id's tail) counts in a fight alone, through fightSecs, and holds its count out of one; its fires
// carry x: 1. Worked out in whole milliseconds, so the counts are exact; each full interval fires once (at most 500 a stretch), the rest carries.
// A character counts once however often it is named. { fires: [{ c, r, n, x? }], acc } — a new acc, the one given left as it was. 1.5.5: need, as
// ruleFires' own: a ticked count adds only its part of the stretch, in whole milliseconds, and one that adds nothing is left as it was
function ruleFiresIn(cal, units, rules, charIds, acc, secs, rest, o, need) {
    var out = { fires: [], acc: {} }, prev = cleanAcc(acc) || {}, seen = Object.create(null), one = typeof secs === 'number';
    Object.keys(prev).forEach(function(c) { out.acc[c] = Object.assign({}, prev[c]); });
    var mineOf = function(c) { return Object.prototype.hasOwnProperty.call(out.acc, c) ? out.acc[c] : (out.acc[c] = {}); };
    var tidy = function(c) { if (!Object.keys(out.acc[c]).length) delete out.acc[c]; };
    var part = function(c, rl, fight, cms) { var p = heldPart(need, c, rl, fight, cms / 1000); return p === cms / 1000 ? cms : Math.min(cms, Math.round(p * 1000)); };   // 1.5.5: the whole stretch, or the part its needs held
    var count = function(c, rid, key, per, cms, x) {
        var perMs = Math.round(per * 1000); if (!(perMs > 0) || !(cms > 0)) return;
        var mine = mineOf(c), had = Object.prototype.hasOwnProperty.call(mine, key) ? Math.round(mine[key] * 1000) : 0;
        var a = had + cms, k = Math.floor(a / perMs), left = a - k * perMs;
        if (left > 0) mine[key] = left / 1000; else delete mine[key];
        tidy(c);
        if (k > 0) { var f = { c: c, r: rid, n: Math.min(500, k) }; if (x) f.x = 1; out.fires.push(f); }
    };
    (Array.isArray(charIds) ? charIds : []).forEach(function(c) {
        if (typeof c !== 'string' || !ACC_ID.test(c) || seen[c] === 1) return; seen[c] = 1;
        var cs = one ? secs : isObj(secs) && Object.prototype.hasOwnProperty.call(secs, c) ? secs[c] : 0;
        if (typeof cs !== 'number' || !isFinite(cs) || !(cs > 0)) return;
        var cms = Math.min(1e15, Math.round(cs * 1000)); if (!(cms > 0)) return;   // a stretch counts at most 10^12 seconds (each rule fires 500 at most anyway)
        (Array.isArray(rules) ? rules : []).forEach(function(rl) {
            if (!isObj(rl) || typeof rl.id !== 'string' || !ACC_ID.test(rl.id)) return;
            var per = everySecs(cal, units, rl.every);
            if (per > 0) {
                if (rl.every.rest === true && !rest) { delete mineOf(c)[rl.id]; tidy(c); }
                else if (!(o.fight && rl.every.wait === true)) count(c, rl.id, rl.id, per, part(c, rl, false, cms), false);
            }
            if (o.fight && rl.id.slice(0, 2) !== 'x_') { var fp = fightSecs(cal, units, rl.inFight, o.rs); if (fp > 0) count(c, rl.id, 'x_' + rl.id.slice(2), fp, part(c, rl, true, cms), true); }
        });
    });
    return out;
}
// A fight begun takes off, for its fighters, the In a fight counts of the rules ticked Each fight starts again (inFight.fresh): rules [{ id,
// inFight }], charIds. A new acc ({} for none), the one given left as it was
function freshAcc(acc, charIds, rules) {
    var prev = cleanAcc(acc) || {}, out = {}, keys = [];
    Object.keys(prev).forEach(function(c) { out[c] = Object.assign({}, prev[c]); });
    (Array.isArray(rules) ? rules : []).forEach(function(rl) { if (isObj(rl) && typeof rl.id === 'string' && ACC_ID.test(rl.id) && rl.id.slice(0, 2) !== 'x_' && isObj(rl.inFight) && rl.inFight.fresh === true) keys.push('x_' + rl.id.slice(2)); });
    (Array.isArray(charIds) ? charIds : []).forEach(function(c) {
        if (typeof c !== 'string' || !ACC_ID.test(c) || !Object.prototype.hasOwnProperty.call(out, c)) return;
        keys.forEach(function(k) { delete out[c][k]; });
        if (!Object.keys(out[c]).length) delete out[c];
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
var API = { viewCal: viewCal, calNamesOf: calNamesOf, fmtIn: fmtIn, fmtDateIn: fmtDateIn, PHASES: PHASES, MOON_KEYS: MOON_KEYS, moonPhases: moonPhases, seasonOf: seasonOf, VERSION: VERSION, LIMITS: LIMITS, DAY: DAY, PRESETS: PRESETS, cleanCalendar: cleanCalendar, cleanClock: cleanClock, cleanAcc: cleanAcc, everySecs: everySecs, ruleFires: ruleFires, cleanTime: cleanTime, tAdd: tAdd, tCmp: tCmp, tFloor: tFloor, tSpanMs: tSpanMs, cleanLived: cleanLived, cleanRulesOff: cleanRulesOff, livedSpans: livedSpans, fightSecs: fightSecs, freshAcc: freshAcc, dateOf: dateOf, dateNames: dateNames, cleanDateFig: cleanDateFig, timeOf: timeOf, periodDays: periodDays, yearDays: yearDays, dayLength: dayLength, fmtDate: fmtDate, fmtTime: fmtTime, fmtWhen: fmtWhen, fmtSpan: fmtSpan, preset: preset };
if (typeof window !== 'undefined') window.wpCalendarCore = API;
export { viewCal, calNamesOf, fmtIn, fmtDateIn, PHASES, MOON_KEYS, moonPhases, seasonOf, dateNames, cleanDateFig, VERSION, LIMITS, CAL_LIMITS, calPreset, DAY, PRESETS, cleanCalendar, cleanClock, cleanAcc, everySecs, ruleFires, cleanTime, tAdd, tCmp, tFloor, tSpanMs, cleanLived, cleanRulesOff, livedSpans, fightSecs, freshAcc, dateOf, timeOf, periodDays, yearDays, dayLength, fmtDate, fmtTime, fmtWhen, fmtSpan, preset };

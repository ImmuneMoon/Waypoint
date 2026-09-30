/* Offline check of the game calendar's pure half (system/app/scripts/calendarcore.js, backlog item 20): the cleaner for a
   system's calendar, world time to a date and back, the words the clock shows, the editor's starting points; the system
   cleaner carrying it; the System editor's Calendar tab wired and said in Help, the tour and the integration guide.
   No DOM. Usage: node tools/calendarcheck.js   (exit 1 on any failure) */
'use strict';
const path = require('path'), fs = require('fs');
const NL = String.fromCharCode(10);
const app = path.join(__dirname, '..', 'system', 'app');
const url = f => 'file:///' + path.resolve(path.join(app, 'scripts', f)).replace(/[\\]/g, '/');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/\r\n/g, NL);
const j = o => JSON.stringify(o);
let pass = 0, fail = 0;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok       ', name); } else { fail++; console.log('FAIL     ', name, detail !== undefined ? '-> ' + String(detail).slice(0, 400) : ''); } }

let summed = false;   // a check that never settles (a promise nothing answers) would let Node exit with no summary and code 0: that is a failure
process.on('exit', code => { if (!summed && !code) { console.log(NL + 'FAIL      the asynchronous checks never finished (a promise was left waiting)'); process.exitCode = 1; } });
(async () => {
    let C = null, S = null, F = null, err = null;
    try { C = await import(url('calendarcore.js')); S = await import(url('systemcore.js')); F = await import(url('formula.js')); } catch (e) { err = e; }
    check('the modules load in Node with no window', !!C && !!S && !!F && !err, err && err.message);
    if (!C || !S || !F) { console.log(NL + pass + ' passed, ' + fail + ' failed.'); process.exit(1); }
    const { LIMITS, cleanCalendar, dateOf, timeOf, periodDays, yearDays, dayLength, fmtDate, fmtTime, fmtWhen, fmtSpan, preset, PRESETS } = C;
    const HOSTILE = '<img src=x onerror=alert(1)>';

    // The owner's handbook (Ch20): 368 days — the New Year Fete, five months, a holiday, the Festival of Life, three months, a holiday,
    // two months, the Festival of Stars and a holiday; a five-day week; years counted down from 3964 BBY
    const gsc = cleanCalendar({ periods: [{ name: 'New Year Fete', days: 5, extra: true }].concat(['First', 'Second', 'Third', 'Fourth', 'Fifth'].map(n => ({ name: n, days: 35 })), [{ name: 'Midyear Holiday', days: 1, extra: true }, { name: 'Festival of Life', days: 5, extra: true }], ['Sixth', 'Seventh', 'Eighth'].map(n => ({ name: n, days: 35 })), [{ name: 'Harvest Holiday', days: 1, extra: true }], ['Ninth', 'Tenth'].map(n => ({ name: n, days: 35 })), [{ name: 'Festival of Stars', days: 5, extra: true }, { name: 'Year End Holiday', days: 1, extra: true }]),
        week: ['Primeday', 'Centaxday', 'Taungsday', 'Zhellday', 'Benduday'], era: 'BBY', one: 3964, down: true });
    const tw = cleanCalendar(preset('twelve'));

    /* ---- the cleaner ---- */
    const cl1 = cleanCalendar({ periods: [{ name: '  First  ', days: 35 }, { name: 'Fete', days: 5, extra: true }, { name: 'Odd', days: 3, extra: 'yes' }, { name: '', days: 5 }, { name: 'Half', days: 2.5 }, { name: 'Zero', days: 0 }, { name: 'Big', days: 1001 }, null, 'x', { name: 'x\u0000y\u2028z', days: 1 }],
        week: ['A', ' ', 'B', 7, 'C'], first: 4, hours: 24, minutes: 30, seconds: 60, era: '  BBY ', one: 1, down: 'yes', leap: { every: 4, from: 4, period: 1, days: 1 } });
    check('item 20 K1 cleanCalendar keeps a period with a name and 1 to 1000 whole days (names trimmed, control characters and line separators as spaces), "extra" only as true, a weekday with a name; the day, the era and the first year only when not the default; "down" only as true',
        j(cl1) === j({ periods: [{ name: 'First', days: 35 }, { name: 'Fete', days: 5, extra: true }, { name: 'Odd', days: 3 }, { name: 'x y z', days: 1 }], week: ['A', 'B', 'C'], first: 2, minutes: 30, era: 'BBY', leap: { every: 4, from: 4, period: 1, days: 1 } }), j(cl1));
    const plW = [cleanCalendar({ week: ['A', '', 'B'], first: 2 }), cleanCalendar({ week: ['A', '', 'B'], first: 1 }), cleanCalendar({ week: ['A', 'B'], first: 0 }), cleanCalendar({ week: ['A', 'B'], first: 2 }), cleanCalendar({ week: ['A', 'B'], first: 1.5 })];
    const plP = [cleanCalendar({ periods: [{ name: '', days: 1 }, { name: 'A', days: 1 }, { name: 'B', days: 1 }], leap: { every: 4, from: 1, period: 2, days: 1 } }), cleanCalendar({ periods: [{ name: '', days: 1 }, { name: 'A', days: 1 }], leap: { every: 4, from: 1, period: 0, days: 1 } }), cleanCalendar({ periods: [{ name: 'A', days: 1 }], leap: { every: 4, from: 1, period: 1, days: 1 } })];
    check('item 20 K1 the first weekday and a leap rule\'s period are places in the lists as written: one dropped before them moves them down, their own dropped takes them away (the week then starts at its first kept day, the rule goes), a place past the list or not whole goes',
        j(plW) === j([{ week: ['A', 'B'], first: 1 }, { week: ['A', 'B'] }, { week: ['A', 'B'] }, { week: ['A', 'B'] }, { week: ['A', 'B'] }]) && j(plP) === j([{ periods: [{ name: 'A', days: 1 }, { name: 'B', days: 1 }], leap: { every: 4, from: 1, period: 1, days: 1 } }, { periods: [{ name: 'A', days: 1 }] }, { periods: [{ name: 'A', days: 1 }] }]), j([plW, plP]));
    const lpBad = [{ every: 1 }, { every: 1001 }, { from: 1e7 + 1 }, { from: 2.5 }, { days: 0 }, { days: 101 }, { period: -1 }, { every: '4' }].map(o => cleanCalendar({ periods: [{ name: 'A', days: 10 }], leap: Object.assign({ every: 4, from: 1, period: 0, days: 1 }, o) }));
    const lpNone = cleanCalendar({ leap: { every: 4, from: 1, period: 0, days: 1 } }), lpEdge = cleanCalendar({ periods: [{ name: 'A', days: 10 }], leap: { every: 1000, from: -1e7, period: 0, days: 100 } });
    check('item 20 K1 a leap rule is every 2 to 1000 years, from a whole year within 10,000,000 either way, 1 to 100 days, into a period kept; anything else (or no periods) drops the rule and only the rule',
        lpBad.every(c => j(c) === j({ periods: [{ name: 'A', days: 10 }] })) && lpNone === null && j(lpEdge.leap) === j({ every: 1000, from: -1e7, period: 0, days: 100 }), j([lpBad, lpNone, lpEdge]));
    const dayBad = cleanCalendar({ hours: 0, minutes: 1001, seconds: 1.5, one: 1e7 + 1 }), dayEdge = cleanCalendar({ hours: 100, minutes: 1000, seconds: 1000, one: -1e7 }), capC = cleanCalendar({ periods: Array.from({ length: 70 }, (_, i) => ({ name: 'P' + i, days: 1 })), week: Array.from({ length: 25 }, (_, i) => 'W' + i) });
    const longN = cleanCalendar({ periods: [{ name: '\u{1F600}'.repeat(45), days: 1 }], week: ['x'.repeat(50)], era: 'y'.repeat(30) });
    check('item 20 K1 the limits: 1 to 100 hours, 1 to 1000 minutes and seconds, a first year within 10,000,000 (out of range: the default, so nothing kept), 60 periods, 20 weekdays, names cut to 40 code points (an emoji is one), the era to 24',
        dayBad === null && j(dayEdge) === j({ hours: 100, minutes: 1000, seconds: 1000, one: -1e7 }) && capC.periods.length === 60 && capC.week.length === 20 && capC.periods[59].name === 'P59' && Array.from(longN.periods[0].name).length === 40 && longN.week[0].length === 40 && longN.era.length === 24 && LIMITS.periods === 60 && LIMITS.week === 20, j([dayBad, dayEdge, longN]));
    const hostileC = cleanCalendar(JSON.parse('{"__proto__": {"polluted": 1}, "periods": [{"name": "' + HOSTILE.replace(/"/g, '\\"') + '", "days": 3, "__proto__": {"extra": true}}], "week": ["constructor"], "leap": {"every": 4, "from": 1, "period": 0, "days": 1, "__proto__": {"x": 1}}}'));
    check('item 20 K1 hostile input: markup in a name is only text (the cleaner keeps it as it is; a sink shows it as text), "__proto__" keys are never read or written, nothing reaches a prototype; not an object, an array or a string is nothing',
        j(hostileC) === j({ periods: [{ name: HOSTILE, days: 3 }], week: ['constructor'], leap: { every: 4, from: 1, period: 0, days: 1 } }) && ({}).polluted === undefined && Object.getPrototypeOf(hostileC) === Object.prototype && !Object.prototype.hasOwnProperty.call(hostileC.periods[0], 'extra')
        && cleanCalendar(null) === null && cleanCalendar([]) === null && cleanCalendar('x') === null && cleanCalendar({}) === null && cleanCalendar({ periods: 'x', week: 5, leap: [] }) === null, j(hostileC));
    check('item 20 K1 cleaning is the same twice (a cleaned calendar cleans to itself: the handbook\'s, the twelve months, every one above)',
        [gsc, tw, cl1, plW[0], plP[0], lpEdge, dayEdge, capC, longN, hostileC].every(c => j(cleanCalendar(c)) === j(c)));

    /* ---- world time to a date and back ---- */
    const D = 86400, g0 = dateOf(gsc, 0), g1 = dateOf(gsc, 5 * D + 8 * 3600 + 5 * 60), gH = dateOf(gsc, 180 * D), gY = dateOf(gsc, 368 * D), gL = dateOf(gsc, 367 * D + 86399);
    check('item 20 K1 the handbook\'s year: 368 days; day 1 is Primeday, 1 New Year Fete, 3964 BBY (a period outside the month count: month 0); day 6 is 1 First (month 1); day 181 the Midyear Holiday; a year on is 3963 BBY (years count down) on a Zhellday (the week runs on); the last second of the year is the Year End Holiday at 23:59:59',
        yearDays(gsc, 3964) === 368 && yearDays(gsc, 3963) === 368 && j([g0.year, g0.period, g0.pday, g0.month, g0.weekday, g0.doy]) === j([3964, 0, 1, 0, 0, 1]) && j([g1.period, g1.pday, g1.month, g1.h, g1.m, g1.s]) === j([1, 1, 1, 8, 5, 0])
        && j([gH.period, gH.pday, gH.month, gH.weekday]) === j([6, 1, 0, 0]) && j([gY.year, gY.yi, gY.period, gY.pday, gY.weekday]) === j([3963, 1, 0, 1, 3]) && j([gL.year, gL.period, gL.pday, gL.h, gL.m, gL.s, gL.doy]) === j([3964, 15, 1, 23, 59, 59, 368]) && gsc.periods.length === 16, j([g0, g1, gH, gY, gL]));
    const t0 = dateOf(tw, 0), tFeb = dateOf(tw, (365 * 3 + 31 + 28) * D), tMar = dateOf(tw, (365 * 3 + 31 + 28 + 1) * D), tY5 = dateOf(tw, (365 * 4 + 1) * D);
    check('item 20 K1 the twelve months: 365 days, 366 in a leap year (year 4, every fourth counting from it); day 1 is Monday, 1 January, 1; year 4 has a 29 February and March after it; year 5 starts after 1461 days; a leap year\'s February holds 29 days',
        yearDays(tw, 1) === 365 && yearDays(tw, 4) === 366 && yearDays(tw, 8) === 366 && yearDays(tw, 5) === 365 && j([t0.year, t0.period, t0.pday, t0.weekday, t0.month]) === j([1, 0, 1, 0, 1]) && j([tFeb.year, tFeb.period, tFeb.pday, tFeb.leap]) === j([4, 1, 29, true])
        && j([tMar.year, tMar.period, tMar.pday, tMar.month]) === j([4, 2, 1, 3]) && j([tY5.year, tY5.period, tY5.pday, tY5.leap]) === j([5, 0, 1, false]) && periodDays(tw, 4, 1) === 29 && periodDays(tw, 5, 1) === 28 && periodDays(tw, 0, 1) === 0 && periodDays(tw, 4, 12) === 0, j([tFeb, tMar, tY5]));
    const lpDown = cleanCalendar({ periods: [{ name: 'A', days: 10 }, { name: 'B', days: 10 }], one: 100, down: true, leap: { every: 3, from: 98, period: 1, days: 2 } }), lpBack = cleanCalendar({ periods: [{ name: 'A', days: 10 }], one: 10, leap: { every: 4, from: 3, period: 0, days: 1 } });
    check('item 20 K1 a leap rule counts from its year both ways and by the calendar\'s numbering: years counted down from 100 with a leap year at 98 give 98, 95 … (and 101 were it there); a rule from a year before the first still falls every fourth year (7, 11, 15 from year 10)',
        [100, 99, 98, 97, 96, 95].map(y => yearDays(lpDown, y)) + '' === [20, 20, 22, 20, 20, 22] + '' && [10, 11, 12, 13, 14, 15].map(y => yearDays(lpBack, y)) + '' === [10, 11, 10, 10, 10, 11] + '' && periodDays(lpDown, 98, 1) === 12);
    const custom = cleanCalendar({ periods: [{ name: 'Only', days: 3 }], hours: 10, minutes: 100, seconds: 100 }), cd = dateOf(custom, 2 * 100000 + 9 * 10000 + 99 * 100 + 99);
    check('item 20 K1 a day of its own length (10 hours of 100 minutes of 100 seconds: 100,000 seconds) and a plain count of days: dayLength, the date\'s hour, minute and second, and with no periods the day\'s number, no year, no period, no weekday',
        dayLength(custom) === 100000 && dayLength(null) === 86400 && j([cd.pday, cd.h, cd.m, cd.s, cd.weekday]) === j([3, 9, 99, 99, -1]) && j((({ year, period, pday, month, weekday, yi }) => ({ year, period, pday, month, weekday, yi }))(dateOf(null, 44 * D + 5))) === j({ year: null, period: -1, pday: 45, month: 0, weekday: -1, yi: -1 }), j(cd));
    const wkF = cleanCalendar({ week: ['A', 'B', 'C'], first: 2 }), wkT = cleanCalendar({ periods: [{ name: 'M', days: 4 }], week: ['A', 'B', 'C'], first: 1 });
    check('item 20 K1 the week starts at its first weekday and runs on: day 1 of a plain count is C when C is the first, day 2 A; a four-day period over a three-day week starting at B carries the week into the next year (B C A B, then C)',
        [0, 1, 2, 3].map(d => dateOf(wkF, d * D).weekday) + '' === [2, 0, 1, 2] + '' && fmtDate(wkF, 0) === 'C, Day 1' && fmtDate(wkF, D) === 'A, Day 2' && [0, 1, 2, 3, 4].map(d => dateOf(wkT, d * D).weekday) + '' === [1, 2, 0, 1, 2] + '' && fmtDate(wkT, 4 * D) === 'C, 1 M, 2');
    let seed = 20260930; const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const cals = [gsc, tw, null, custom, lpDown, lpBack], badRT = [];
    for (let i = 0; i < 6000; i++) {
        const cal = cals[i % cals.length], t = Math.floor(rnd() * (i % 3 === 0 ? 1e15 : 1e11)), d = dateOf(cal, t);
        const back = timeOf(cal, d.year === null ? { pday: d.pday, h: d.h, m: d.m, s: d.s } : { year: d.year, period: d.period, pday: d.pday, h: d.h, m: d.m, s: d.s }), backYi = d.year === null ? back : timeOf(cal, { yi: d.yi, period: d.period, pday: d.pday, h: d.h, m: d.m, s: d.s });
        if (back !== t || backYi !== t || d.pday < 1 || (d.period >= 0 && d.pday > periodDays(cal, d.year, d.period))) { badRT.push([i, t, d, back]); if (badRT.length > 3) break; }
    }
    check('item 20 K1 a seeded walk of 6000 moments (up to the limit of 10^15 seconds) on six calendars comes back to the same second from its date, by the year as numbered and by the count of years, each day inside its period', badRT.length === 0, j(badRT));
    const tBad = [timeOf(tw, { year: 5, period: 1, pday: 29 }), timeOf(tw, { year: 4, period: 1, pday: 30 }), timeOf(tw, { year: 0, period: 0, pday: 1 }), timeOf(tw, { year: 1, period: 12, pday: 1 }), timeOf(tw, { year: 1, period: 0, pday: 1, h: 24 }), timeOf(tw, { year: 1, period: 0, pday: 1, m: 60 }), timeOf(tw, { year: 1, period: 0, pday: 1, s: -1 }), timeOf(tw, { year: 1.5, period: 0, pday: 1 }), timeOf(tw, null), timeOf(null, { pday: 0 }), timeOf(gsc, { year: 3965, period: 0, pday: 1 })];
    check('item 20 K1 timeOf refuses what the calendar has not: 29 February of a common year, 30 February of a leap year, a year before the first (year 0; 3965 BBY when years count down from 3964), a period past the year, an hour, minute or second past the day\'s, a year that is not whole, no date, day 0',
        tBad.every(v => v === null) && timeOf(tw, { year: 4, period: 1, pday: 29 }) === (365 * 3 + 31 + 28) * D && timeOf(gsc, { year: 3963, period: 0, pday: 1 }) === 368 * D, j(tBad));
    const cl = [dateOf(tw, -5).t, dateOf(tw, NaN).t, dateOf(tw, 'x').t, dateOf(tw, 1e20).t, dateOf(tw, 1.9).t];
    check('item 20 K1 world time is a whole number of seconds from 0 to 10^15: below 0, not a number or text reads 0, past the limit reads the limit, a fraction the second it is in', j(cl) === j([0, 0, 0, 1e15, 1]) && LIMITS.time === 1e15, j(cl));

    /* ---- words ---- */
    const words = [fmtWhen(gsc, 0), fmtWhen(gsc, 5 * D + 8 * 3600 + 5 * 60), fmtDate(gsc, 180 * D), fmtDate(gsc, 181 * D), fmtDate(gsc, 368 * D), fmtWhen(tw, (365 * 3 + 31 + 28) * D + 3600 * 13 + 61, true), fmtWhen(null, 44 * D + 13 * 3600), fmtWhen(custom, 2 * 100000 + 9 * 10000 + 99 * 100 + 5, true), fmtDate(cleanCalendar({ periods: [{ name: 'Moot', days: 1, extra: true }, { name: 'Long', days: 9 }] }), 0)];
    check('item 20 K1 the clock\'s words: "Primeday, 1 New Year Fete, 3964 BBY, 00:00"; a one-day period outside the month count by its name alone; a year counted down; the twelve months\' leap day with seconds; a plain count of days as "Day 45"; a day of its own length padded to its widths; no weekday with no week and no era label with none',
        j(words) === j(['Primeday, 1 New Year Fete, 3964 BBY, 00:00', 'Primeday, 1 First, 3964 BBY, 08:05', 'Primeday, Midyear Holiday, 3964 BBY', 'Centaxday, 1 Festival of Life, 3964 BBY', 'Zhellday, 1 New Year Fete, 3963 BBY', 'Sunday, 29 February, 4, 13:01:01', 'Day 45, 13:00', '3 Only, 1, 09:99:05', 'Moot, 1']), j(words));
    const spans = [fmtSpan(gsc, 3 * D + 4 * 3600), fmtSpan(tw, D + 1), fmtSpan(null, 0), fmtSpan(null, 3600), fmtSpan(custom, 100000 + 100 + 1), fmtSpan(null, -120), fmtSpan(null, 'x')];
    check('item 20 K1 a stretch of time in words by the calendar\'s own day: each part that is not 0, largest first, one without an s; no time for 0 or anything that is not a number; a negative stretch by its size',
        j(spans) === j(['3 days, 4 hours', '1 day, 1 second', 'no time', '1 hour', '1 day, 1 minute, 1 second', '2 minutes', 'no time']), j(spans));

    /* ---- starting points ---- */
    const p1 = preset('twelve'); p1.periods[0].name = 'Changed'; p1.week.length = 0;
    check('item 20 K1 the starting points: Twelve months (the real-world year, a leap day in February every fourth year from year 4) fresh each time, so a change to one never reaches the next; A plain count of days and anything else is no calendar',
        j(PRESETS) === j(['twelve', 'days']) && preset('twelve').periods[0].name === 'January' && preset('twelve').week.length === 7 && j(preset('twelve').leap) === j({ every: 4, from: 4, period: 1, days: 1 }) && preset('days') === null && preset('__proto__') === null && j(cleanCalendar(preset('twelve'))) === j(preset('twelve')));

    /* ---- the system carries it ---- */
    const sysIn = { v: 1, name: 'C', fields: [{ id: 'f_s', key: 'Sec', kind: 'number', vis: 'gm' }], rolls: [], calendar: { periods: [{ name: 'First', days: 35 }, { name: '', days: 2 }], week: ['Primeday'], era: 'BBY', one: 3964, down: true } };
    const sG = S.cleanSystem(sysIn, { F, gmView: true }), sP = S.cleanSystem(sysIn, { F, gmView: false }), sN = S.cleanSystem({ v: 1, name: 'N', fields: [], rolls: [] }, { F, gmView: true }), sJ = S.cleanSystem({ v: 1, name: 'J', fields: [], rolls: [], calendar: { periods: 'x' } }, { F, gmView: true });
    check('item 20 K1 the system cleaner carries the calendar cleaned, the same in the GM\'s view and the players\' (nothing in it is GM-only); a system without one, or with one that cleans to nothing, has no calendar key',
        j(sG.calendar) === j({ periods: [{ name: 'First', days: 35 }], week: ['Primeday'], era: 'BBY', one: 3964, down: true }) && j(sP.calendar) === j(sG.calendar) && !('calendar' in sN) && !('calendar' in sJ) && !('calendar' in S.emptySystem()), j([sG.calendar, sP.calendar]));

    /* ---- wired and said (pinned) ---- */
    const sh = read('system/app/scripts/sheets.js'), sc = read('system/app/scripts/systemcore.js'), ix = read('system/app/index.html'), tu = read('system/app/scripts/tutorial.js'), ci = read('CAMPAIGN_INTEGRATION.md'), wn = read('WHATSNEW.txt'), wa = read('system/app/assets/whatsnew.txt'), cm = read('CLAUDE.md'), ck = read('.github/workflows/checks.yml');
    check('item 20 K1 the Calendar tab is wired (pinned): its tab button and pane in the System editor, calendarcore loaded, the pane drawn when its tab is open, its handlers after the Height box\'s, systemcore\'s cleaner importing cleanCalendar and keeping the key',
        ix.includes('<button data-tab="calendar" title="The calendar your game keeps: its months and other periods, its week, its day and how its years are numbered">Calendar</button>') && ix.includes('<div id="sysCalendar" class="sys-tab" style="display:none;"></div>') && ix.includes('<script type="module" src="scripts/calendarcore.js"></script>')
        && sh.includes("var scal = ui('sysCalendar'); if (scal) { scal.style.display = tab === 'calendar' ? '' : 'none'; if (tab === 'calendar') renderCalendar(); }") && /if \(onHeightInput\(t\)\) return;[^\n]*\n\s*if \(onCalendarInput\(t\)\) return;/.test(sh) && /if \(onHeightChange\(t\)\) return;[^\n]*\n\s*if \(onCalendarChange\(t\)\) return;/.test(sh) && /if \(heightClick\(b\)\) return;[^\n]*\n\s*if \(calendarClick\(b\)\) return;/.test(sh)
        && sh.includes("import { cleanCalendar, fmtWhen, fmtDate, timeOf, calPreset, CAL_LIMITS } from './calendarcore.js';") && sc.includes("import { cleanCalendar } from './calendarcore.js';") && sc.includes('var cal = cleanCalendar(sys.calendar); if (cal) out.calendar = cal;'));
    check('item 20 K1 said (pinned): Help has a Calendar bullet before Layout\'s (periods outside the month count, the week and Day 1 is a, the day, the year and its label, years counting down, leap years, the starting points); the tour\'s System step names the Calendar tab; the integration guide the keys; What\'s New in both copies; this suite in CLAUDE.md and CI',
        ix.includes('<li><b>Calendar</b> (the System editor&rsquo;s Calendar tab) is the calendar your game keeps:') && /Outside the month count<\/b> for a festival week[\s\S]{0,400}<b>Day 1 is a<\/b>[\s\S]{0,300}<b>years count down<\/b> \(3964, then 3963\); and <b>Leap years<\/b>[\s\S]{0,300}<b>Start from<\/b> gives the real-world year or a plain count of days[\s\S]{0,300}<\/li>\n\s*<li><b>Layout<\/b>/.test(ix)
        && tu.includes('Its <b>Calendar</b> tab is the calendar your game keeps: months and festival weeks, the week, the day&rsquo;s hours, how years are numbered (counting down, if yours do) and leap years.')
        && ci.includes('Beside "combat", the system may carry "calendar" (absent: a plain count of days of 24 hours):') && ci.includes('"first" and a leap rule\'s "period" count places as written, move with a row dropped before them and go with their own.')
        && wn.includes("- The System editor's Calendar tab: the calendar your game keeps, its") && wa.includes("- The System editor's Calendar tab: the calendar your game keeps, its") && cm.includes('| `tools/calendarcheck.js` |') && ck.includes('run: node tools/calendarcheck.js'));

    summed = true;
    console.log(NL + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exit(1);
})();

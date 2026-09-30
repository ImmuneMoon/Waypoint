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

    {   // item 20 K2 (its own scope: its names never meet K1's)
    /* ---- item 20 K2: the clock ---- */
    const { cleanClock } = C;
    const ckK = [cleanClock({ t: 3600.9, hide: true, notes: [1], x: '<b>' }), cleanClock({ t: -5, hide: 'yes' }), cleanClock({ t: 1e20 }), cleanClock({ t: 'x' }), cleanClock({}), cleanClock(null), cleanClock([]), cleanClock(5), cleanClock(JSON.parse('{"__proto__": {"hide": true}, "t": 7}'))];
    check('item 20 K2 cleanClock: the time as whole seconds from 0 to 10^15 (below 0 or no number: 0, past the limit: the limit), the hide flag only as true, nothing else kept; not an object is no clock; a "__proto__" key is never read',
        j(ckK) === j([{ t: 3600, hide: true }, { t: 0 }, { t: 1e15 }, { t: 0 }, { t: 0 }, null, null, null, { t: 7 }]) && ({}).hide === undefined && j(cleanClock(ckK[0])) === j(ckK[0]), j(ckK));

    // the window and the chip (calendar.js, sliced by its calendarwin markers and from openWin to its wiring, run for real on a page of plain objects)
    const calJs = read('system/app/scripts/calendar.js'), cutJ = (a, b) => { const i = calJs.indexOf(a), k = calJs.indexOf(b, i + 1); if (i < 0 || k < 0) throw new Error('calendar.js slice: ' + a); return calJs.slice(i, k); };
    const winSrc = cutJ('// [sinkcheck:calendarwin-start]', '// [sinkcheck:calendarwin-end]') + cutJ('function openWin()', '(function wire()');
    const mkDom = () => {
        const reg = {};
        const node = (tag, text) => ({ tag, _text: text === undefined ? '' : String(text), className: '', children: [], dataset: {}, style: {}, title: '', type: '', value: '', checked: false, disabled: false, parentNode: null,
            get textContent() { return this.children.length ? this.children.map(c => c.textContent).join('') : this._text; }, set textContent(v) { this.children = []; this._text = String(v); },
            appendChild(c) { this.children.push(c); c.parentNode = this; return c; },
            get classList() { const self = this, has = c => (' ' + self.className + ' ').indexOf(' ' + c + ' ') >= 0; return { contains: has, toggle: (c, on) => { if (on === undefined) on = !has(c); if (on && !has(c)) self.className = (self.className + ' ' + c).trim(); if (!on && has(c)) self.className = (' ' + self.className + ' ').replace(' ' + c + ' ', ' ').trim(); } }; },
            querySelector(sel) { const cls = sel.replace(/^\./, ''), walk = n => { for (const k of n.children) { if ((' ' + k.className + ' ').indexOf(' ' + cls + ' ') >= 0) return k; const r = walk(k); if (r) return r; } return null; }; return walk(this); },
            closest(sel) { let n = this; while (n) { if (sel === 'button' && n.tag === 'button') return n; n = n.parentNode; } return null; } });
        const doc = { createElement: t => node(t), createTextNode: t => node('#text', t), getElementById: id => reg[id] || null };
        reg.calendarModal = node('div'); reg.calendarModal.style.display = 'none'; reg.calendarBody = node('div'); reg.clockChip = node('button'); const tx = node('span'); tx.className = 'clock-txt'; reg.clockChip.appendChild(tx);
        return { doc, reg };
    };
    const walkN = (n, p, acc) => { if (p(n)) acc.push(n); (n.children || []).forEach(k => walkN(k, p, acc)); return acc; }, findN = (n, c) => walkN(n, x => (' ' + x.className + ' ').indexOf(' ' + c + ' ') >= 0, []);
    const mkCal = o => {
        const Dm = mkDom(), log = [], saves = [], toasts = [], local = [];
        const win = { wpVtt: { on: id => id === 'calendar' && o.on !== false, setLocal: (id, off) => { local.push([id, off]); return true; } }, wpNet: o.player ? { foreign: true, logEvent: () => log.push('player!') } : { foreign: false, logEvent: (k, t) => log.push([k, t]) } };
        const api = new Function('document', 'window', 'getActiveCampaign', 'save', 'toast', 'roundSecs', 'cleanCalendar', 'cleanClock', 'dateOf', 'timeOf', 'periodDays', 'dayLength', 'fmtDate', 'fmtWhen', 'fmtSpan', 'CAL_LIMITS', 'net', 'sysNow',
            "'use strict';\n" + winSrc + '\nreturn { gridOf, stepView, viewOf, stepsOf, unitsOf, renderWin, moveTo, moveBy, setHidden, onWinClick, onWinChange, openWin, closeWin, refresh, rounds, st: () => ({ view, pick }) };')(
            Dm.doc, win, () => o.camp, () => saves.push(j(o.camp && o.camp.clock !== undefined ? o.camp.clock : null)), t => toasts.push(t), S.roundSecs, cleanCalendar, cleanClock, dateOf, timeOf, periodDays, dayLength, fmtDate, fmtWhen, fmtSpan, C.CAL_LIMITS, () => win.wpNet, () => o.sys);
        return { api, Dm, log, saves, toasts, local, win, body: Dm.reg.calendarBody, chip: Dm.reg.clockChip, modal: Dm.reg.calendarModal };
    };
    const cal0 = mkCal({ camp: { id: 'k' }, sys: null }).api, ton = timeOf(tw, { year: 1, period: 0, pday: 15, h: 10 }), g1 = cal0.gridOf(tw, { yi: 0, period: 0 }, ton, 20), g2 = cal0.gridOf(tw, { yi: 0, period: 1 }, ton, null);
    const gH = cal0.gridOf(gsc, { yi: 0, period: 6 }, 0, null), gP = cal0.gridOf(null, { page: 1 }, 29 * D, 28), gN = cal0.gridOf(custom, { yi: 0, period: 0 }, 0, null);
    check('item 20 K2 the calendar\'s grid (gridOf, run for real): the period in view by the week\'s columns and names, blank cells before its first day\'s weekday, each day numbered from 1 with its day count, today and the picked day marked; a one-day holiday outside the month count; a plain count of days in pages of 28; no week: seven columns and no names',
        g1.title === 'January, 1' && g1.cols === 7 && j(g1.heads) === j(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']) && g1.cells.length === 31 && g1.cells[0].day === 0 && g1.cells.filter(c => c.today).map(c => c.n) + '' === '15' && g1.cells.filter(c => c.picked).map(c => c.n) + '' === '21'
        && g2.title === 'February, 1' && g2.cells.slice(0, 3).every(c => c === null) && g2.cells.length === 31 && g2.cells[3].day === 31 && g2.cells[3].n === 1 && !g2.cells.some(c => c && (c.today || c.picked))
        && gH.title === 'Midyear Holiday, 3964 BBY' && gH.cells.length === 1 && gH.cells[0].day === 180 && gP.title === 'Days 29' + String.fromCharCode(0x2013) + '56' && gP.cells.length === 28 && gP.cells[0].n === 29 && gP.cells[1].today === true && gP.cells[0].picked === true && gP.heads.length === 0
        && gN.cols === 7 && gN.heads.length === 0 && gN.cells.length === 3 && gN.cells[0] !== null, j([g1.title, g2.cells.slice(0, 4), gH, gP.title]));
    const sv = [cal0.stepView(tw, { yi: 0, period: 11 }, 1), cal0.stepView(tw, { yi: 0, period: 0 }, -1), cal0.stepView(tw, { yi: 2, period: 0 }, -1), cal0.stepView(tw, { yi: 2, period: 5 }, 1), cal0.stepView(null, { page: 0 }, -1), cal0.stepView(null, { page: 3 }, 1), cal0.viewOf(tw, ton), cal0.viewOf(null, 60 * D)];
    check('item 20 K2 the window\'s steps between periods (stepView, viewOf): on past the year\'s last period into the next year, back past the first into the year before, never before the first year; a plain count by pages of 28 from 0; the view of a moment is its period (or page)',
        j(sv) === j([{ yi: 1, period: 0 }, { yi: 0, period: 0 }, { yi: 1, period: 11 }, { yi: 2, period: 6 }, { page: 0 }, { page: 4 }, { yi: 0, period: 0 }, { page: 2 }]), j(sv));
    const sysU = { combat: { turn: { secs: 1, units: [{ key: 'watch', label: 'Watches', secs: 14400 }, { key: 'x', secs: 0 }, { key: 5, secs: 1 }, { key: 'shift', label: HOSTILE, secs: 28800 }] } } };
    const st1 = cal0.stepsOf(tw), st2 = cal0.stepsOf(custom), un1 = cal0.unitsOf(tw, sysU), un2 = cal0.unitsOf(null, null);
    check('item 20 K2 the steps and the amount\'s units by the calendar\'s own day (stepsOf, unitsOf): a minute, ten minutes, an hour, a day and a week of the calendar (no week, no week step); minutes, hours, days, weeks, then the system\'s own time units with a length (a watch; its label, else its key; by place)',
        j(st1.map(s => [s.label, s.secs])) === j([['+1 minute', 60], ['+10 minutes', 600], ['+1 hour', 3600], ['+1 day', 86400], ['+1 week', 604800]]) && j(st2.map(s => s.secs)) === j([100, 1000, 10000, 100000])
        && j(un1.map(u => [u.id, u.name, u.secs])) === j([['min', 'minutes', 60], ['hour', 'hours', 3600], ['day', 'days', 86400], ['week', 'weeks', 604800], ['u0', 'Watches', 14400], ['u3', HOSTILE, 28800]]) && j(un2.map(u => u.id)) === j(['min', 'hour', 'day']), j([st1, st2, un1]));
    // the GM's window: a calendar from a file with markup in its names
    const sysH = { calendar: { periods: [{ name: HOSTILE, days: 3 }], week: [HOSTILE, 'B'], era: HOSTILE }, combat: { turn: { secs: 6 } } }, campH = { id: 'k', clock: { t: 3600 } }, WH = mkCal({ camp: campH, sys: sysH });
    WH.api.openWin(); const bH = WH.body;
    const daysH = findN(bH, 'cal-day'), headsH = findN(bH, 'cal-head'), stepsH = findN(bH, 'cal-step'), unitsH = findN(bH, 'cal-any-u')[0], hideH = findN(bH, 'cal-hide')[0];
    check('item 20 K2 the GM\'s calendar window (renderWin, run for real): the date and time; the period\'s title with the calendar\'s own names as text (the era cut to 24); the week\'s names cut to three letters with the whole name as a title; a button per day with its day count and its date as a title; a note until a day is picked; the steps with their seconds; an amount, its units and Move; Players see the date ticked while they do; the round\'s length; nothing of its own markup; the window closes when there is nothing to show',
        WH.modal.style.display === 'flex' && findN(bH, 'cal-now')[0].textContent === fmtWhen(sysH.calendar, 3600) && findN(bH, 'cal-title')[0].textContent === HOSTILE + ', 1 ' + HOSTILE.slice(0, 24)
        && headsH.length === 2 && headsH[0].textContent === '<im' && headsH[0].title === HOSTILE && daysH.length === 3 && j(daysH.map(b => [b.textContent, b.dataset.day])) === j([['1', '0'], ['2', '1'], ['3', '2']]) && daysH[0].title === fmtDate(sysH.calendar, 0) + ' (today)' && daysH[0].type === 'button'
        && walkN(bH, x => x.tag === '#text' || x.className === 'sys-note', []).some(x => x.textContent === 'Pick a day to set the clock to it or to write a note on it.') && j(stepsH.map(b => [b.textContent, b.dataset.secs, b.dataset.act])) === j([['+1 minute', '60', 'calstep'], ['+10 minutes', '600', 'calstep'], ['+1 hour', '3600', 'calstep'], ['+1 day', '86400', 'calstep'], ['+1 week', '172800', 'calstep']])
        && j(unitsH.children.map(o => o.value)) === j(['min', 'hour', 'day', 'week']) && hideH.checked === true && hideH.type === 'checkbox' && findN(bH, 'cal-round')[0].textContent.indexOf('6 seconds') > 0 && findN(bH, 'cal-hideme').length === 0
        && !/innerHTML|insertAdjacentHTML|outerHTML/.test(winSrc), j([findN(bH, 'cal-title')[0].textContent, stepsH.map(b => b.dataset.secs)]));
    // the GM's gestures
    const campG = { id: 'k', clock: { t: 0 } }, WG = mkCal({ camp: campG, sys: { calendar: tw, combat: {} } }); WG.api.openWin();
    const clickG = el => WG.api.onWinClick({ target: el }), btnG = act => findN(WG.body, 'cal-' + act)[0] || walkN(WG.body, x => x.dataset && x.dataset.act === act, [])[0];
    clickG(findN(WG.body, 'cal-day')[9]); const pickG = [WG.api.st().pick, findN(WG.body, 'cal-pick-txt')[0].textContent, findN(WG.body, 'cal-set-h')[0].value, findN(WG.body, 'cal-set-m')[0].value];
    findN(WG.body, 'cal-set-h')[0].value = '24'; clickG(btnG('set')); const badSet = [campG.clock.t, WG.toasts.slice()];
    findN(WG.body, 'cal-set-h')[0].value = '13'; findN(WG.body, 'cal-set-m')[0].value = '30'; clickG(btnG('set')); const setG = [campG.clock.t, WG.api.st().pick, WG.log.slice(-1)[0]];
    clickG(findN(WG.body, 'cal-step').find(b => b.textContent === '+1 hour')); const stepG = [campG.clock.t, WG.log.slice(-1)[0]];
    findN(WG.body, 'cal-any-n')[0].value = '2'; findN(WG.body, 'cal-any-u')[0].value = 'day'; clickG(btnG('any-go')); const anyG = campG.clock.t;
    findN(WG.body, 'cal-any-n')[0].value = '-1.5'; findN(WG.body, 'cal-any-u')[0].value = 'hour'; clickG(btnG('any-go')); const backG = [campG.clock.t, WG.log.slice(-1)[0]];
    findN(WG.body, 'cal-any-n')[0].value = ' '; findN(WG.body, 'cal-any-u')[0].value = 'hour'; clickG(btnG('any-go')); findN(WG.body, 'cal-any-n')[0].value = '1'; findN(WG.body, 'cal-any-u')[0].value = 'nope'; clickG(btnG('any-go')); const junkG = [campG.clock.t, WG.toasts.length];
    const savesG = WG.saves.length; const sameG = WG.api.moveTo(campG.clock.t, 'Set'), zeroG = WG.api.moveBy(-1e9), limitG = WG.api.moveTo(1e20, 'Set');
    check('item 20 K2 the GM moves the clock from the window (onWinClick, run for real): a day picked shows its date and the clock\'s hour and minute to set; Set the clock refuses an hour past the day (said), else goes to that day at that time, logs it and forgets the pick; a step moves it on and logs "Moved on 1 hour"; an amount in a unit moves it on or back ("Moved back 1 hour, 30 minutes"), a blank amount or an unknown unit only says so; a move to where it is does nothing, below 0 stops at 0, past the limit at the limit; each move saves',
        j(pickG) === j([9, 'Wednesday, 10 January, 1', '0', '0']) && badSet[0] === 0 && badSet[1].length === 1 && setG[0] === (9 * 86400 + 13 * 3600 + 30 * 60) && setG[1] === null && j(setG[2]) === j(['time', 'Set ' + String.fromCharCode(0x2014) + ' now Wednesday, 10 January, 1, 13:30'])
        && stepG[0] === setG[0] + 3600 && j(stepG[1]) === j(['time', 'Moved on 1 hour ' + String.fromCharCode(0x2014) + ' now Wednesday, 10 January, 1, 14:30']) && anyG === stepG[0] + 2 * 86400 && backG[0] === anyG - 5400 && backG[1][1].indexOf('Moved back 1 hour, 30 minutes') === 0
        && junkG[0] === backG[0] && junkG[1] === 3 && sameG === false && zeroG === true && campG.clock.t === 1e15 && limitG === true && WG.saves.length === savesG + 2 && WG.saves.every(s => JSON.parse(s).t >= 0), j([pickG, badSet, setG, stepG, anyG, backG, junkG, campG.clock]));
    const navG = []; clickG(btnG('next')); navG.push(j(WG.api.st().view)); clickG(btnG('prev')); clickG(btnG('prev')); navG.push(j(WG.api.st().view)); clickG(btnG('back')); navG.push(j(WG.api.st().view));
    WG.api.onWinChange({ target: Object.assign(findN(WG.body, 'cal-hide')[0], { checked: false }) }); const hid = [j(campG.clock), WG.log.slice(-1)[0]], boxOff = findN(WG.body, 'cal-hide')[0].checked; WG.api.onWinChange({ target: Object.assign(findN(WG.body, 'cal-hide')[0], { checked: true }) }); const shownAgain = [j(campG.clock), WG.log.slice(-1)[0]];
    const dv = dateOf(tw, 1e15), nowV = j({ yi: dv.yi, period: dv.period });
    check('item 20 K2 the window\'s navigation and the GM\'s Players see the date (run for real): the period after the one in view, back two (never before the first), and Today back to the clock\'s own; unticking keeps the date from players (logged) and the window shows the box unticked, ticking gives it back and leaves no hide flag',
        j(navG) === j([j({ yi: 0, period: 1 }), j({ yi: 0, period: 0 }), nowV]) && j(hid) === j([j({ t: 1e15, hide: true }), ['time', 'Players no longer see the date']]) && j(shownAgain) === j([j({ t: 1e15 }), ['time', 'Players see the date again']]) && boxOff === false && findN(WG.body, 'cal-hide')[0].checked === true, j([navG, nowV, hid, shownAgain, boxOff]));
    // a player's window
    const campP = { id: 'k', clock: { t: 100 } }, WP = mkCal({ camp: campP, sys: { calendar: tw }, player: true }); WP.api.openWin();
    const pSteps = findN(WP.body, 'cal-step').length, pHide = findN(WP.body, 'cal-hideme')[0]; WP.api.onWinClick({ target: findN(WP.body, 'cal-day')[3] }); const pPick = WP.api.st().pick;
    const pMoves = [WP.api.moveTo(5000, 'Set'), WP.api.moveBy(60), WP.api.setHidden(true), WP.api.rounds(3)]; WP.api.onWinClick({ target: pHide });
    const WP2 = mkCal({ camp: { id: 'k' }, sys: { calendar: tw }, player: true }); WP2.modal.style.display = 'flex'; WP2.api.renderWin();
    check('item 20 K2 a player\'s window (run for real): the date and the grid, a day may be picked, no steps, no amount, no Set and no Players see the date; nothing of theirs moves or hides the clock; Hide the clock for me switches the Calendar off for them at this table (the feature\'s own switch), says where it comes back and closes the window; with no clock from the host the window shuts',
        pSteps === 0 && findN(WP.body, 'cal-any-n').length === 0 && findN(WP.body, 'cal-hide').length === 0 && pHide.dataset.act === 'calhideme' && pPick === 3 && j(pMoves) === j([false, false, false, false]) && j(campP.clock) === j({ t: 100 }) && WP.log.length === 0
        && j(WP.local) === j([['calendar', true]]) && WP.toasts.length === 1 && /Settings/.test(WP.toasts[0]) && WP.modal.style.display === 'none' && WP2.modal.style.display === 'none', j([pSteps, pPick, pMoves, WP.local, WP.toasts]));
    // the chip and the rounds of a fight
    const campC = { id: 'k', clock: { t: 7200 } }, WC = mkCal({ camp: campC, sys: { calendar: tw, combat: { turn: { secs: 1 } } } }); WC.api.refresh();
    const chipTxt = () => findN(WC.chip, 'clock-txt')[0].textContent, c1 = [WC.chip.style.display, chipTxt(), WC.chip.className, WC.chip.title];
    campC.clock.hide = true; WC.api.refresh(); const c2 = [WC.chip.className, WC.chip.title];
    const r1 = WC.api.rounds(3), rT = campC.clock.t, r2 = WC.api.rounds(-1), rT2 = campC.clock.t, logR = WC.log.length, r3 = [WC.api.rounds(0), WC.api.rounds(NaN), WC.api.rounds('2')];
    WC.api.openWin(); const mark = WC.body.children[0]; WC.api.refresh(); const kept = WC.body.children[0] === mark; campC.clock.t += 60; WC.api.refresh(); const redrawn = WC.body.children[0] !== mark && findN(WC.body, 'cal-now')[0].textContent === fmtWhen(tw, campC.clock.t, dateOf(tw, campC.clock.t).s !== 0);
    const WOff = mkCal({ camp: campC, sys: { calendar: tw }, on: false }); WOff.chip.style.display = ''; WOff.modal.style.display = 'flex'; WOff.api.refresh(); const offR = WOff.api.rounds(2);
    const WPc = mkCal({ camp: { id: 'k' }, sys: { calendar: tw }, player: true }); WPc.api.refresh(); const WPd = mkCal({ camp: { id: 'k', clock: { t: 60, hide: true } }, sys: { calendar: tw }, player: true }); WPd.api.refresh();
    check('item 20 K2 the header\'s chip (refresh, run for real): the date and time; for the GM a mark and a title while players do not see it; each round of a fight moves the clock by the system\'s round length (3 rounds of 1 second, one back), never logged, nothing for no rounds or a count that is no number; the open window redrawn only when what it shows changed; the Calendar off hides the chip, shuts the window and moves nothing; a player\'s chip only while the host sends a clock, never marked private whatever it holds',
        c1[0] === '' && c1[1] === fmtWhen(tw, 7200) && c1[2] === '' && /click for the calendar/.test(c1[3]) && !/do not see/.test(c1[3]) && c2[0] === 'clock-private' && /players do not see it/.test(c2[1])
        && r1 === true && rT === 7203 && r2 === true && rT2 === 7202 && logR === WC.log.length && WC.log.length === 0 && j(r3) === j([false, false, false]) && kept && redrawn
        && WOff.chip.style.display === 'none' && WOff.modal.style.display === 'none' && offR === false && WPc.chip.style.display === 'none' && WPd.chip.style.display === '' && /at this table/.test(WPd.chip.title) && WPd.chip.className === '', j([c1, c2, rT, rT2, kept, redrawn]));

    const oS = { camp: { id: 'k1', clock: { t: 0 } }, sys: { calendar: tw } }, WS = mkCal(oS); WS.api.openWin();
    WS.api.onWinClick({ target: walkN(WS.body, x => x.dataset && x.dataset.act === 'calnext', [])[0] }); WS.api.onWinClick({ target: findN(WS.body, 'cal-day')[4] }); const vBefore = [j(WS.api.st().view), WS.api.st().pick];
    oS.camp = { id: 'k2', clock: { t: timeOf(tw, { year: 3, period: 4, pday: 1 }) } }; WS.api.refresh(); const vAfter = [j(WS.api.st().view), WS.api.st().pick, findN(WS.body, 'cal-title')[0].textContent];
    WS.api.onWinClick({ target: findN(WS.body, 'cal-day')[2] }); const pk2 = WS.api.st().pick; oS.camp = { id: 'k3', clock: { t: oS.camp.clock.t } }; WS.api.refresh(); const pk3 = WS.api.st().pick;
    check('item 20 K2 the open window follows the campaign on screen (refresh, run for real): another campaign resets the view to its own clock\'s period and forgets the day picked',
        j(vBefore) === j([j({ yi: 0, period: 1 }), 35]) && j(vAfter) === j([j({ yi: 2, period: 4 }), null, 'May, 3']) && typeof pk2 === 'number' && pk3 === null, j([vBefore, vAfter, pk2, pk3]));

    /* ---- item 20 K3: dated notes ---- */
    const nId = c => 'n_' + c.repeat(8), longTx = 'x'.repeat(390) + String.fromCodePoint(0x1F600).repeat(20);
    const nc = cleanClock({ t: 5, notes: [{ id: nId('c'), day: 40, text: 'Later', vis: 'all' }, { id: nId('a'), day: 2, text: '  Festival\u0000of\nlights  ', vis: 'gm' }, { id: nId('b'), day: 2, text: HOSTILE, vis: 'all' }, { id: nId('a'), day: 9, text: 'twice' }, { id: 'n_short', day: 1, text: 'bad id' }, { id: '__proto__', day: 1, text: 'x' }, { id: nId('d'), day: -1, text: 'x' }, { id: nId('e'), day: 1.5, text: 'x' }, { id: nId('f'), day: 3, text: '   ' }, { id: nId('g'), day: 3, text: longTx }, null, 'x'] });
    const capN = cleanClock({ t: 0, notes: Array.from({ length: 510 }, (_, i) => ({ id: 'n_' + String(i).padStart(8, '0'), day: 510 - i, text: 'N' + i })) });
    check('item 20 K3 a clock\'s dated notes (cleanClock): an id of n_ and 8 of a-z and 0-9, each once; a whole day from 0; its text one line (control characters and runs of space as one space, trimmed), at most 400 code points; players see it only as vis all; one with no day or no text dropped; kept in day order (the order written for the same day), at most 500; the same twice',
        j(nc.notes) === j([{ id: nId('a'), day: 2, text: 'Festival of lights' }, { id: nId('b'), day: 2, text: HOSTILE, vis: 'all' }, { id: nId('g'), day: 3, text: 'x'.repeat(390) + String.fromCodePoint(0x1F600).repeat(10) }, { id: nId('c'), day: 40, text: 'Later', vis: 'all' }])
        && capN.notes.length === 500 && capN.notes[0].day === 11 && capN.notes[499].day === 510 && C.LIMITS.notes === 500 && C.LIMITS.noteChars === 400 && j(cleanClock(nc)) === j(nc) && !('notes' in cleanClock({ t: 1, notes: 'x' })) && !('notes' in cleanClock({ t: 1, notes: [] })), j(nc.notes));
    // the window's notes and the reminders (calendar.js, run for real)
    const campN = { id: 'k', clock: { t: 0, notes: [{ id: nId('a'), day: 2, text: HOSTILE, vis: 'all' }, { id: nId('b'), day: 2, text: 'Secret' }, { id: nId('c'), day: 40, text: 'Later' }] } }, WN = mkCal({ camp: campN, sys: { calendar: tw, combat: { turn: { secs: 1 } } } }); WN.api.openWin();
    const dN = findN(WN.body, 'cal-day'), day3 = dN[2], comingN = findN(WN.body, 'cal-coming-row').map(r => r.textContent);
    WN.api.onWinClick({ target: day3 }); const rowsN = findN(WN.body, 'cal-note'), visN = findN(WN.body, 'cal-note-vis'), delN = findN(WN.body, 'cal-note-del'), newN = findN(WN.body, 'cal-note-new')[0];
    check('item 20 K3 the GM\'s window shows the notes (renderWin, run for real): a day that holds notes marked with a count in its title; Coming up lists the next ones from today with their dates, a GM-only one saying so; a picked day lists its notes as text, each with its Players see it tick (checked only for one players see) and a remove, then a box for a new note (400 at most) with its own tick and Add',
        (' ' + day3.className + ' ').indexOf(' cal-has-note ') >= 0 && / 2 notes$/.test(day3.title) && (' ' + dN[3].className + ' ').indexOf(' cal-has-note ') < 0
        && j(comingN) === j(['Wednesday, 3 January, 1: ' + HOSTILE, 'Wednesday, 3 January, 1: Secret (you only)', 'Saturday, 10 February, 1: Later (you only)']) && rowsN.length === 2 && j(rowsN.map(r => findN(r, 'cal-note-txt')[0].textContent)) === j([HOSTILE, 'Secret'])
        && j(visN.map(v => [v.checked, v.dataset.note, v.type])) === j([[true, nId('a'), 'checkbox'], [false, nId('b'), 'checkbox']]) && j(delN.map(x => [x.dataset.act, x.dataset.note])) === j([['calnotedel', nId('a')], ['calnotedel', nId('b')]]) && newN.maxLength === 400 && findN(WN.body, 'cal-note-go')[0].dataset.act === 'caladdnote', j([day3.title, comingN]));
    newN.value = '  Market day  '; findN(WN.body, 'cal-note-newvis')[0].checked = true; WN.api.onWinClick({ target: findN(WN.body, 'cal-note-go')[0] });
    const added = campN.clock.notes.filter(n => n.text === 'Market day')[0], redrawnN = findN(WN.body, 'cal-note-txt').map(x => x.textContent).indexOf('Market day') >= 0;
    findN(WN.body, 'cal-note-new')[0].value = '   '; WN.api.onWinClick({ target: findN(WN.body, 'cal-note-go')[0] }); const emptyToast = WN.toasts.slice(-1)[0];
    WN.api.onWinChange({ target: Object.assign(findN(WN.body, 'cal-note-vis').filter(v => v.dataset.note === nId('b'))[0], { checked: true }) }); const visOn = campN.clock.notes.filter(n => n.id === nId('b'))[0].vis;
    WN.api.onWinChange({ target: Object.assign(findN(WN.body, 'cal-note-vis').filter(v => v.dataset.note === nId('b'))[0], { checked: false }) }); const visOff = 'vis' in campN.clock.notes.filter(n => n.id === nId('b'))[0];
    WN.api.onWinClick({ target: findN(WN.body, 'cal-note-del').filter(x => x.dataset.note === nId('a'))[0] }); const afterDel = campN.clock.notes.map(n => n.id);
    const junkEdits = [WN.api.onWinChange({ target: { classList: { contains: c => c === 'cal-note-vis' }, dataset: { note: 'n_zzzzzzzz' }, checked: true } }), afterDel.length === campN.clock.notes.length];
    check('item 20 K3 the GM writes, shows and removes notes (run for real): Add puts the typed note on the picked day with a fresh id, trimmed, shown to players when ticked, saves and shows it at once; an empty note only says so; the tick shows a note to players and takes it back (no vis left); the remove takes the note away; a note that is not there changes nothing',
        !!added && redrawnN && /^n_[a-z0-9]{8}$/.test(added.id) && added.day === 2 && added.vis === 'all' && emptyToast === 'Type the note first.' && visOn === 'all' && visOff === false && afterDel.indexOf(nId('a')) < 0 && afterDel.length === 3 && junkEdits[1] === true && WN.saves.length === 4, j([added, emptyToast, visOn, visOff, afterDel, WN.saves.length]));
    const campM = { id: 'k', clock: { t: 0, notes: Array.from({ length: 500 }, (_, i) => ({ id: 'n_' + String(i).padStart(8, '0'), day: 1, text: 'N' })) } }, WM = mkCal({ camp: campM, sys: { calendar: tw } }); WM.api.openWin(); WM.api.onWinClick({ target: findN(WM.body, 'cal-day')[1] });
    findN(WM.body, 'cal-note-new')[0].value = 'One more'; WM.api.onWinClick({ target: findN(WM.body, 'cal-note-go')[0] });
    check('item 20 K3 at 500 notes a new one is refused and said, nothing saved', campM.clock.notes.length === 500 && WM.toasts.slice(-1)[0] === 'At most 500 notes.' && WM.saves.length === 0, j([campM.clock.notes.length, WM.toasts]));
    // reminders
    const campR = { id: 'k', clock: { t: 0, notes: [{ id: nId('a'), day: 2, text: 'Festival' }, { id: nId('b'), day: 3, text: 'Deadline' }, { id: nId('c'), day: 8, text: 'A' }, { id: nId('d'), day: 8, text: 'B' }, { id: nId('e'), day: 9, text: 'C' }, { id: nId('f'), day: 9, text: 'D' }] } }, WR = mkCal({ camp: campR, sys: { calendar: tw, combat: { turn: { secs: 1 } } } });
    const toastAt = () => WR.toasts.length, stepR = []; const mv = secs => { const n0 = toastAt(); WR.api.moveBy(secs); stepR.push(WR.toasts.slice(n0)); };
    mv(86400); mv(86400); mv(5 * 3600); mv(86400 - 5 * 3600 + 3600); mv(-2 * 86400); mv(2 * 86400); mv(7 * 86400);
    const noteLog = WR.log.filter(l => /^Note reached/.test(l[1])).map(l => l[1]);
    campR.clock.t = 2 * 86400 * 10 - 1; campR.clock.notes = [{ id: nId('g'), day: 20, text: 'Midnight' }]; const n0R = toastAt(); const rr = WR.api.rounds(1);
    check('item 20 K3 a move that reaches a note\'s day reminds the GM (moveTo, run for real): one toast naming it (Today: …), several named in one (the first three, then …), and a Session Log line under Time for each with its date; a move within the day, a move back and a move that stays short reach nothing; moving back and on again reaches it again; the rounds of a fight crossing midnight reach one too',
        j(stepR) === j([[], ['Today: Festival'], [], ['Today: Deadline'], [], ['2 dated notes reached: Festival; Deadline'], ['4 dated notes reached: A; B; C; ' + String.fromCharCode(0x2026)]])
        && noteLog.length === 8 && noteLog[0] === 'Note reached ' + String.fromCharCode(0x2014) + ' Wednesday, 3 January, 1: Festival' && rr === true && WR.toasts.slice(n0R)[0] === 'Today: Midnight', j([stepR, noteLog]));
    // a player's window
    const campPN = { id: 'k', clock: { t: 0, notes: [{ id: nId('a'), day: 2, text: 'Market' }] } }, WPN = mkCal({ camp: campPN, sys: { calendar: tw }, player: true }); WPN.api.openWin();
    const pComing = findN(WPN.body, 'cal-coming-row').map(r => r.textContent); WPN.api.onWinClick({ target: findN(WPN.body, 'cal-day')[2] });
    const pRows = findN(WPN.body, 'cal-note').map(r => r.textContent), pCtl = [findN(WPN.body, 'cal-note-vis').length, findN(WPN.body, 'cal-note-del').length, findN(WPN.body, 'cal-note-new').length];
    WPN.api.onWinClick({ target: findN(WPN.body, 'cal-day')[4] }); const pNone = walkN(WPN.body, x => x.className === 'sys-note', []).map(x => x.textContent);
    const pEdits = [WPN.api.onWinChange({ target: { classList: { contains: c => c === 'cal-note-vis' }, dataset: { note: nId('a') }, checked: false } })];
    check('item 20 K3 a player\'s window shows the notes it was sent (run for real): the day marked, Coming up without any GM word, a picked day\'s notes as text only (no tick, no remove, no box), No notes on this day where there are none; nothing of theirs changes a note',
        (' ' + findN(WPN.body, 'cal-day')[2].className + ' ').indexOf(' cal-has-note ') >= 0 && j(pComing) === j(['Wednesday, 3 January, 1: Market']) && j(pRows) === j(['Market']) && j(pCtl) === j([0, 0, 0]) && pNone.indexOf('No notes on this day.') >= 0 && j(campPN.clock.notes) === j([{ id: nId('a'), day: 2, text: 'Market' }]) && WPN.saves.length === 0, j([pComing, pRows, pCtl, pNone]));
    const campPast = { id: 'k', clock: { t: 10 * 86400, notes: [{ id: nId('a'), day: 2, text: 'Gone' }, { id: nId('b'), day: 10, text: 'Today too' }, { id: nId('c'), day: 40, text: 'Ahead' }] } }, WPast = mkCal({ camp: campPast, sys: { calendar: tw } }); WPast.api.openWin();
    check('item 20 K3 Coming up lists notes from today on, never one whose day has gone', j(findN(WPast.body, 'cal-coming-row').map(r => r.textContent)) === j(['Thursday, 11 January, 1: Today too (you only)', 'Saturday, 10 February, 1: Ahead (you only)']), j(findN(WPast.body, 'cal-coming-row').map(r => r.textContent)));
    const cssN = read('system/app/style.css');
    check('item 20 K3 said and styled (pinned): Help\'s Calendar list has Notes on dates (Players see it, the marks, Coming up, the reminder and its Session Log line, players never reminded); the tour names notes on dates; the integration guide the notes\' keys; What\'s New in both copies; a noted day\'s mark',
        ix.includes('<li><b>Notes on dates</b>: pick a day and write a note on it') && /<b>Notes on dates<\/b>[\s\S]{0,200}<b>Players see it<\/b>[\s\S]{0,300}<b>Coming up<\/b> lists the next five[\s\S]{0,300}you get a reminder, and the Session Log a line under Time[\s\S]{0,200}never get the reminder\.<\/li>/.test(ix)
        && read('system/app/scripts/tutorial.js').includes('to move time on and to write notes on dates, with a reminder when the clock reaches one)') && read('CAMPAIGN_INTEGRATION.md').includes('"notes" (up to 500, kept in day order): [{ "id": "n_" and 8 of a-z and 0-9, each once,')
        && read('WHATSNEW.txt').includes('- Notes on dates: pick a day in the calendar and write a note on it, for you') && read('system/app/assets/whatsnew.txt').includes('- Notes on dates: pick a day in the calendar and write a note on it, for you') && /\n  \.cal-day\.cal-has-note \{ /.test(cssN));

    /* ---- K2 wired and said (pinned) ---- */
    const mainJ = read('system/app/scripts/main.js'), ioJ = read('system/app/scripts/io.js'), vtJ = read('system/app/scripts/vtt.js'), cssJ = read('system/app/style.css');
    check('item 20 K2 wired (pinned): the chip in the header after the spacer, the Calendar window, calendar.js loaded after its core, the app\'s render refreshing the chip before its no-map return, the load cleaning a campaign\'s clock (none without the cleaner), the Calendar in the feature list (off by default, a player\'s own switch) with its rows in Settings, the chip\'s look',
        ix.includes('<div class="spacer"></div>\n    <button class="tool ghost hdr-clock" id="clockChip" style="display:none;"') && ix.includes('<span class="clock-txt"></span></button>') && ix.includes('<div id="calendarModal" style="display:none;') && ix.includes('<div id="calendarBody" class="cal-body"></div>') && ix.includes('id="calendarClose"')
        && ix.includes('<script type="module" src="scripts/calendarcore.js"></script>\n<script type="module" src="scripts/calendar.js"></script>') && /window\.wpNet\.renderWhere\(\);[^\n]*\n\s*if \(window\.wpCalendar && window\.wpCalendar\.refresh\) window\.wpCalendar\.refresh\(\);/.test(mainJ)
        && ioJ.includes("if (c.clock !== undefined) { var ckL = window.wpCalendarCore && window.wpCalendarCore.cleanClock ? window.wpCalendarCore.cleanClock(c.clock) : null; if (ckL) c.clock = ckL; else delete c.clock; }")
        && vtJ.includes("{ id: 'calendar',  label: 'Calendar',         legacyKey: null, def: false }") && ix.includes('<div class="set-vtt-row" data-vtt="calendar"') && ix.includes('id="setCalendarBtn"') && ix.includes('id="setCalendarState"') && ix.includes('id="setVttGlobalCalendarBtn"') && ix.includes('id="setVttGlobalCalendarState"')
        && /\n  \.hdr-clock \{ /.test(cssJ) && /\n  \.hdr-clock\.clock-private \{ /.test(cssJ) && /\n  \.cal-grid \{ /.test(cssJ));
    check('item 20 K2 said (pinned): Help has a Calendar section before VTT settings (the chip, the grid, Move time on and any amount in the system\'s own units, Set the clock, Players see the date, combat rounds, the session log\'s Time, not a step of Undo, Hide the clock for me) and names the calendar among the features in three places; the tour\'s VTT features step names it; the integration guide the clock\'s keys; What\'s New in both copies',
        ix.includes('<h4 id="helpCalendar">Calendar</h4>') && /<h4 id="helpCalendar">Calendar<\/h4>[\s\S]{0,300}chip at the top right[\s\S]{0,900}<b>Move time on<\/b>[\s\S]{0,300}your system&rsquo;s own time units[\s\S]{0,200}<b>Set the clock<\/b>[\s\S]{0,100}<b>Players see the date<\/b>[\s\S]{0,1200}Each round of a combat moves the clock on[\s\S]{0,300}under <b>Time<\/b>\. The clock is not a step of Undo[\s\S]{0,400}<b>Hide the clock for me<\/b>[\s\S]{0,200}\n\s*<h4 id="helpVtt">VTT settings<\/h4>/.test(ix)
        && ix.includes('fog of war, lighting, turn-based combat, the calendar, and the VTT integration master') && ix.includes('fog of war, lighting, turn-based combat and the calendar. <b>&#9881; Settings') && ix.includes('fog of war, lighting, turn-based combat and the calendar (both off until you turn them on) are switched in')
        && tu.includes('<b>Turn-based combat</b> and the <b>Calendar</b> (both off until you turn them on: the calendar puts the campaign&rsquo;s date and time in the header, and its chip opens the calendar to move time on and to write notes on dates, with a reminder when the clock reaches one)')
        && ci.includes('"clock": { "t": 3600, "hide": true },   // OPTIONAL (1.5.0, the Calendar feature)') && wn.includes('- The Calendar (Settings ' + String.fromCharCode(0x25b8) + ' VTT features; off until you turn it on): the') && wa.includes('- The Calendar (Settings ' + String.fromCharCode(0x25b8) + ' VTT features; off until you turn it on): the'));

    }
    summed = true;
    console.log(NL + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exit(1);
})();

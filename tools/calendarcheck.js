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

    // A calendar of the suite's own: 368 days — the Turn of the Year, five months, a holiday, the Festival of Spring, three months, a holiday,
    // two months, the Festival of Frost and a holiday; a five-day week; years counted down from 3964 BCE
    const gsc = cleanCalendar({ periods: [{ name: 'Turn of the Year', days: 5, extra: true }].concat(['First', 'Second', 'Third', 'Fourth', 'Fifth'].map(n => ({ name: n, days: 35 })), [{ name: 'Midsummer Day', days: 1, extra: true }, { name: 'Festival of Spring', days: 5, extra: true }], ['Sixth', 'Seventh', 'Eighth'].map(n => ({ name: n, days: 35 })), [{ name: 'Harvest Day', days: 1, extra: true }], ['Ninth', 'Tenth'].map(n => ({ name: n, days: 35 })), [{ name: 'Festival of Frost', days: 5, extra: true }, { name: 'Year End Holiday', days: 1, extra: true }]),
        week: ['Firstday', 'Secondday', 'Thirdday', 'Fourthday', 'Fifthday'], era: 'BCE', one: 3964, down: true });
    const tw = cleanCalendar(preset('twelve'));

    /* ---- the cleaner ---- */
    const cl1 = cleanCalendar({ periods: [{ name: '  First  ', days: 35 }, { name: 'Fete', days: 5, extra: true }, { name: 'Odd', days: 3, extra: 'yes' }, { name: '', days: 5 }, { name: 'Half', days: 2.5 }, { name: 'Zero', days: 0 }, { name: 'Big', days: 1001 }, null, 'x', { name: 'x\u0000y\u2028z', days: 1 }],
        week: ['A', ' ', 'B', 7, 'C'], first: 4, hours: 24, minutes: 30, seconds: 60, era: '  BCE ', one: 1, down: 'yes', leap: { every: 4, from: 4, period: 1, days: 1 } });
    check('item 20 K1 cleanCalendar keeps a period with a name and 1 to 1000 whole days (names trimmed, control characters and line separators as spaces), "extra" only as true, a weekday with a name; the day, the era and the first year only when not the default; "down" only as true',
        j(cl1) === j({ periods: [{ name: 'First', days: 35 }, { name: 'Fete', days: 5, extra: true }, { name: 'Odd', days: 3 }, { name: 'x y z', days: 1 }], week: ['A', 'B', 'C'], first: 2, minutes: 30, era: 'BCE', leap: { every: 4, from: 4, period: 1, days: 1 } }), j(cl1));
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
    check('item 20 K1 the handbook\'s year: 368 days; day 1 is Firstday, 1 Turn of the Year, 3964 BCE (a period outside the month count: month 0); day 6 is 1 First (month 1); day 181 the Midsummer Day; a year on is 3963 BCE (years count down) on a Fourthday (the week runs on); the last second of the year is the Year End Holiday at 23:59:59',
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
    check('item 20 K1 timeOf refuses what the calendar has not: 29 February of a common year, 30 February of a leap year, a year before the first (year 0; 3965 BCE when years count down from 3964), a period past the year, an hour, minute or second past the day\'s, a year that is not whole, no date, day 0',
        tBad.every(v => v === null) && timeOf(tw, { year: 4, period: 1, pday: 29 }) === (365 * 3 + 31 + 28) * D && timeOf(gsc, { year: 3963, period: 0, pday: 1 }) === 368 * D, j(tBad));
    const cl = [dateOf(tw, -5).t, dateOf(tw, NaN).t, dateOf(tw, 'x').t, dateOf(tw, 1e20).t, dateOf(tw, 1.9).t];
    check('item 20 K1 world time is a whole number of seconds from 0 to 10^15: below 0, not a number or text reads 0, past the limit reads the limit, a fraction the second it is in', j(cl) === j([0, 0, 0, 1e15, 1]) && LIMITS.time === 1e15, j(cl));

    /* ---- words ---- */
    const words = [fmtWhen(gsc, 0), fmtWhen(gsc, 5 * D + 8 * 3600 + 5 * 60), fmtDate(gsc, 180 * D), fmtDate(gsc, 181 * D), fmtDate(gsc, 368 * D), fmtWhen(tw, (365 * 3 + 31 + 28) * D + 3600 * 13 + 61, true), fmtWhen(null, 44 * D + 13 * 3600), fmtWhen(custom, 2 * 100000 + 9 * 10000 + 99 * 100 + 5, true), fmtDate(cleanCalendar({ periods: [{ name: 'Moot', days: 1, extra: true }, { name: 'Long', days: 9 }] }), 0)];
    check('item 20 K1 the clock\'s words: "Firstday, 1 Turn of the Year, 3964 BCE, 00:00"; a one-day period outside the month count by its name alone; a year counted down; the twelve months\' leap day with seconds; a plain count of days as "Day 45"; a day of its own length padded to its widths; no weekday with no week and no era label with none',
        j(words) === j(['Firstday, 1 Turn of the Year, 3964 BCE, 00:00', 'Firstday, 1 First, 3964 BCE, 08:05', 'Firstday, Midsummer Day, 3964 BCE', 'Secondday, 1 Festival of Spring, 3964 BCE', 'Fourthday, 1 Turn of the Year, 3963 BCE', 'Sunday, 29 February, 4, 13:01:01', 'Day 45, 13:00', '3 Only, 1, 09:99:05', 'Moot, 1']), j(words));
    const spans = [fmtSpan(gsc, 3 * D + 4 * 3600), fmtSpan(tw, D + 1), fmtSpan(null, 0), fmtSpan(null, 3600), fmtSpan(custom, 100000 + 100 + 1), fmtSpan(null, -120), fmtSpan(null, 'x')];
    check('item 20 K1 a stretch of time in words by the calendar\'s own day: each part that is not 0, largest first, one without an s; no time for 0 or anything that is not a number; a negative stretch by its size',
        j(spans) === j(['3 days, 4 hours', '1 day, 1 second', 'no time', '1 hour', '1 day, 1 minute, 1 second', '2 minutes', 'no time']), j(spans));

    /* ---- starting points ---- */
    const p1 = preset('twelve'); p1.periods[0].name = 'Changed'; p1.week.length = 0;
    check('item 20 K1 the starting points: Twelve months (the real-world year, a leap day in February every fourth year from year 4) fresh each time, so a change to one never reaches the next; A plain count of days and anything else is no calendar',
        j(PRESETS) === j(['twelve', 'days']) && preset('twelve').periods[0].name === 'January' && preset('twelve').week.length === 7 && j(preset('twelve').leap) === j({ every: 4, from: 4, period: 1, days: 1 }) && preset('days') === null && preset('__proto__') === null && j(cleanCalendar(preset('twelve'))) === j(preset('twelve')));

    /* ---- the system carries it ---- */
    const sysIn = { v: 1, name: 'C', fields: [{ id: 'f_s', key: 'Sec', kind: 'number', vis: 'gm' }], rolls: [], calendar: { periods: [{ name: 'First', days: 35 }, { name: '', days: 2 }], week: ['Firstday'], era: 'BCE', one: 3964, down: true } };
    const sG = S.cleanSystem(sysIn, { F, gmView: true }), sP = S.cleanSystem(sysIn, { F, gmView: false }), sN = S.cleanSystem({ v: 1, name: 'N', fields: [], rolls: [] }, { F, gmView: true }), sJ = S.cleanSystem({ v: 1, name: 'J', fields: [], rolls: [], calendar: { periods: 'x' } }, { F, gmView: true });
    check('item 20 K1 the system cleaner carries the calendar cleaned, the same in the GM\'s view and the players\' (nothing in it is GM-only); a system without one, or with one that cleans to nothing, has no calendar key',
        j(sG.calendar) === j({ periods: [{ name: 'First', days: 35 }], week: ['Firstday'], era: 'BCE', one: 3964, down: true }) && j(sP.calendar) === j(sG.calendar) && !('calendar' in sN) && !('calendar' in sJ) && !('calendar' in S.emptySystem()), j([sG.calendar, sP.calendar]));

    /* ---- wired and said (pinned) ---- */
    const sh = read('system/app/scripts/sheets.js'), sc = read('system/app/scripts/systemcore.js'), ix = read('system/app/index.html'), ci = read('CAMPAIGN_INTEGRATION.md'), wn = read('WHATSNEW.txt'), wa = read('system/app/assets/whatsnew.txt'), cm = (() => { try { return read('CLAUDE.md'); } catch (e) { if (e && e.code === 'ENOENT') return null; throw e; } })(), ck = read('.github/workflows/checks.yml');
    check('item 20 K1 the Calendar tab is wired (pinned): its tab button and pane in the System editor, calendarcore loaded, the pane drawn when its tab is open, its handlers after the Height box\'s, systemcore\'s cleaner importing cleanCalendar and keeping the key',
        ix.includes('<button data-tab="calendar" title="The calendar your game keeps: its months and other periods, its week, its day and how its years are numbered">Calendar</button>') && ix.includes('<div id="sysCalendar" class="sys-tab" style="display:none;"></div>') && ix.includes('<script type="module" src="scripts/calendarcore.js"></script>')
        && sh.includes("var scal = ui('sysCalendar'); if (scal) { scal.style.display = tab === 'calendar' ? '' : 'none'; if (tab === 'calendar') renderCalendar(); }") && /if \(onHeightInput\(t\)\) return;[^\n]*\n\s*if \(onCalendarInput\(t\)\) return;/.test(sh) && /if \(onHeightChange\(t\)\) return;[^\n]*\n\s*if \(onCalendarChange\(t\)\) return;/.test(sh) && /if \(heightClick\(b\)\) return;[^\n]*\n\s*if \(calendarClick\(b\)\) return;/.test(sh)
        && sh.includes("import { cleanCalendar, fmtWhen, fmtDate, timeOf, calPreset, CAL_LIMITS } from './calendarcore.js';") && sc.includes("import { cleanCalendar } from './calendarcore.js';") && sc.includes('var cal = cleanCalendar(sys.calendar); if (cal) out.calendar = cal;'));
    check('item 20 K1 said (pinned): Help has a Calendar bullet before Layout\'s (periods outside the month count, the week and Day 1 is a, the day, the year and its label, years counting down, leap years, the starting points); the integration guide the keys; What\'s New in both copies; this suite in CLAUDE.md and CI',
        ix.includes('<li><b>Calendar</b>, the System editor&rsquo;s Calendar tab, is the calendar your game keeps.') && /Outside the month count<\/b> for a festival week[\s\S]{0,500}<b>Day 1 is a<\/b>[\s\S]{0,400}<b>years count down<\/b>, as 1200 then 1199\.[\s\S]{0,200}<b>Leap years<\/b>[\s\S]{0,300}<b>Start from<\/b> gives the real-world year or a plain count of days[\s\S]{0,500}<\/li>\s*<\/ul>\s*<\/li>\s*<li><b>Layout<\/b>/.test(ix)
        && ci.includes('Beside "combat", the system may carry "calendar" (absent: a plain count of days of 24 hours):') && ci.includes('"first" and a leap rule\'s "period" count places as written, move with a row dropped before them and go with their own.')
        && wn.includes("- The System editor's Calendar tab: the calendar your game keeps, its") && wa.includes("- The System editor's Calendar tab: the calendar your game keeps, its") && (cm === null || cm.includes('| `tools/calendarcheck.js` |')) && ck.includes('run: node tools/calendarcheck.js'));

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
        reg.calendarModal = node('div'); reg.calendarModal.style.display = 'none'; reg.calendarBody = node('div'); reg.clockChip = node('button'); const tx = node('span'); tx.className = 'clock-txt'; reg.clockChip.appendChild(tx); const rn = node('span'); rn.className = 'clock-run'; reg.clockChip.appendChild(rn);
        return { doc, reg };
    };
    const walkN = (n, p, acc) => { if (p(n)) acc.push(n); (n.children || []).forEach(k => walkN(k, p, acc)); return acc; }, findN = (n, c) => walkN(n, x => (' ' + x.className + ' ').indexOf(' ' + c + ' ') >= 0, []);
    const mkCal = o => {
        const Dm = mkDom(), log = [], saves = [], toasts = [], local = [], game = [], runs = [], views = [], syncs = [], notes = [];
        const win = { wpVtt: { on: id => id === 'calendar' && o.on !== false, setLocal: (id, off) => { local.push([id, off]); return true; } }, wpNet: o.player ? { foreign: true, logEvent: () => log.push('player!'), fxGameTime: s => game.push(['player!', s]), fxSpans: sp => game.push(['player!', sp]) } : { foreign: false, active: !!o.paused || !!o.host, role: o.role || (o.host ? 'host' : undefined), paused: !!o.paused, stream: !!o.stream, combats: o.combats, second: o.second, syncClock: () => syncs.push(j(o.camp && o.camp.clock)), logEvent: (k, t) => log.push([k, t]), fxGameTime: s => game.push(s), fxSpans: sp => game.push(JSON.parse(JSON.stringify(sp))) }, wpSheets: { runTimeRules: (fires, words, at) => { runs.push([JSON.parse(JSON.stringify(fires)), words].concat(at !== undefined ? [JSON.parse(JSON.stringify(at))] : [])); return fires.length; } },
            wpFormula: F, wpNotices: { wait: (k, t, kind, arg) => { notes.push(['wait', k, t, kind, arg]); return true; }, done: k => { notes.push(['done', k]); return true; } } };   // 152 fold 4b: the bell, a recorder; 1.5.5: the formula engine, as the app's page holds it
        const api = new Function('document', 'window', 'getActiveCampaign', 'save', 'saveView', 'toast', 'roundSecs', 'cleanCalendar', 'cleanClock', 'cleanAcc', 'ruleFires', 'livedSpans', 'freshAcc', 'tCmp', 'tSpanMs', 'dateOf', 'timeOf', 'periodDays', 'dayLength', 'fmtDate', 'fmtWhen', 'fmtSpan', 'CAL_LIMITS', 'net', 'sysNow', 'needsHeld', 'chainsShallow', 'everySecs', 'fightSecs',
            "'use strict';\n" + winSrc + '\nreturn { gridOf, stepView, viewOf, stepsOf, unitsOf, renderWin, moveTo, moveBy, setHidden, onWinClick, onWinChange, openWin, closeWin, refresh, ownTime, second, fightBegan, liveTick, liveHeld, liveRate, setHold, setRate, rulesRun: typeof rulesRun === "function" ? rulesRun : null, setRulesRun: typeof setRulesRun === "function" ? setRulesRun : null, bellUp: typeof bellUp === "function" ? bellUp : null, bellDone: typeof bellDone === "function" ? bellDone : null, bellStill: typeof bellStill === "function" ? bellStill : null, st: () => ({ view, pick, pend, restMode, pendQ }), liveSt: () => ({ liveAt, liveMs, livePend, liveBankAt }), memSt: () => memT };')(
            Dm.doc, win, () => o.camp, () => saves.push(j(o.camp && o.camp.clock !== undefined ? o.camp.clock : null)), () => views.push(j(o.camp && o.camp.clock !== undefined ? o.camp.clock : null)), t => toasts.push(t), S.roundSecs, cleanCalendar, cleanClock, C.cleanAcc, o.ruleFires || C.ruleFires, C.livedSpans, C.freshAcc, C.tCmp, C.tSpanMs, dateOf, timeOf, periodDays, dayLength, fmtDate, fmtWhen, fmtSpan, C.CAL_LIMITS, () => win.wpNet, () => o.sys, S.needsHeld, o.chainsShallow || S.chainsShallow, C.everySecs, C.fightSecs);
        return { api, Dm, log, saves, toasts, local, game, runs, views, syncs, notes, win, body: Dm.reg.calendarBody, chip: Dm.reg.clockChip, modal: Dm.reg.calendarModal };
    };
    const cal0 = mkCal({ camp: { id: 'k' }, sys: null }).api, ton = timeOf(tw, { year: 1, period: 0, pday: 15, h: 10 }), g1 = cal0.gridOf(tw, { yi: 0, period: 0 }, ton, 20), g2 = cal0.gridOf(tw, { yi: 0, period: 1 }, ton, null);
    const gH = cal0.gridOf(gsc, { yi: 0, period: 6 }, 0, null), gP = cal0.gridOf(null, { page: 1 }, 29 * D, 28), gN = cal0.gridOf(custom, { yi: 0, period: 0 }, 0, null);
    check('item 20 K2 the calendar\'s grid (gridOf, run for real): the period in view by the week\'s columns and names, blank cells before its first day\'s weekday, each day numbered from 1 with its day count, today and the picked day marked; a one-day holiday outside the month count; a plain count of days in pages of 28; no week: seven columns and no names',
        g1.title === 'January, 1' && g1.cols === 7 && j(g1.heads) === j(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']) && g1.cells.length === 31 && g1.cells[0].day === 0 && g1.cells.filter(c => c.today).map(c => c.n) + '' === '15' && g1.cells.filter(c => c.picked).map(c => c.n) + '' === '21'
        && g2.title === 'February, 1' && g2.cells.slice(0, 3).every(c => c === null) && g2.cells.length === 31 && g2.cells[3].day === 31 && g2.cells[3].n === 1 && !g2.cells.some(c => c && (c.today || c.picked))
        && gH.title === 'Midsummer Day, 3964 BCE' && gH.cells.length === 1 && gH.cells[0].day === 180 && gP.title === 'Days 29' + String.fromCharCode(0x2013) + '56' && gP.cells.length === 28 && gP.cells[0].n === 29 && gP.cells[1].today === true && gP.cells[0].picked === true && gP.heads.length === 0
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
    const pMoves = [WP.api.moveTo(5000, 'Set'), WP.api.moveBy(60), WP.api.setHidden(true), WP.api.second(103, false, false)]; WP.api.onWinClick({ target: pHide });
    const WP2 = mkCal({ camp: { id: 'k' }, sys: { calendar: tw }, player: true }); WP2.modal.style.display = 'flex'; WP2.api.renderWin();
    check('item 20 K2 a player\'s window (run for real): the date and the grid, a day may be picked, no steps, no amount, no Set and no Players see the date; nothing of theirs moves or hides the clock; Hide the clock for me switches the Calendar off for them at this table (the feature\'s own switch), says where it comes back and closes the window; with no clock from the host the window shuts',
        pSteps === 0 && findN(WP.body, 'cal-any-n').length === 0 && findN(WP.body, 'cal-hide').length === 0 && pHide.dataset.act === 'calhideme' && pPick === 3 && j(pMoves) === j([false, false, false, false]) && j(campP.clock) === j({ t: 100 }) && WP.log.length === 0
        && j(WP.local) === j([['calendar', true]]) && WP.toasts.length === 1 && /Settings/.test(WP.toasts[0]) && WP.modal.style.display === 'none' && WP2.modal.style.display === 'none', j([pSteps, pPick, pMoves, WP.local, WP.toasts]));
    // the chip and the second of the fights (152 fold 4, moved on purpose from the rounds of a fight: the clock reads the fight furthest behind)
    const campC = { id: 'k', clock: { t: 7200 } }, WC = mkCal({ camp: campC, sys: { calendar: tw, combat: { turn: { secs: 1 } } } }); WC.api.refresh();
    const chipTxt = () => findN(WC.chip, 'clock-txt')[0].textContent, c1 = [WC.chip.style.display, chipTxt(), WC.chip.className, WC.chip.title];
    campC.clock.hide = true; WC.api.refresh(); const c2 = [WC.chip.className, WC.chip.title];
    const r1 = WC.api.second(7203, false, false), rT = campC.clock.t, rNo = WC.api.second(7202, false, false), r2 = WC.api.second(7202, true, false), rT2 = campC.clock.t, rTop = j(campC.clock.top), logR = WC.log.length, r3 = [WC.api.second(7202, true, false), WC.api.second(NaN), WC.api.second('2')];
    WC.api.openWin(); const mark = WC.body.children[0]; WC.api.refresh(); const kept = WC.body.children[0] === mark; campC.clock.t += 60; WC.api.refresh(); const redrawn = WC.body.children[0] !== mark && findN(WC.body, 'cal-now')[0].textContent === fmtWhen(tw, campC.clock.t, dateOf(tw, campC.clock.t).s !== 0);
    const WOff = mkCal({ camp: campC, sys: { calendar: tw }, on: false }); WOff.chip.style.display = ''; WOff.modal.style.display = 'flex'; WOff.api.refresh(); const offR = WOff.api.second(campC.clock.t + 2, false, false);
    const WPc = mkCal({ camp: { id: 'k' }, sys: { calendar: tw }, player: true }); WPc.api.refresh(); const WPd = mkCal({ camp: { id: 'k', clock: { t: 60, hide: true } }, sys: { calendar: tw }, player: true }); WPd.api.refresh();
    check('item 20 K2 the header\'s chip (refresh, run for real): the date and time; for the GM a mark and a title while players do not see it; 152 fold 4: the second of the fights moves the clock (calendar.js second, in place of each round: 3 seconds on), back only for a correction, which keeps the highest second reached as the clock\'s top, never logged, nothing for a second where it is or one that is no number; the open window redrawn only when what it shows changed; the Calendar off hides the chip, shuts the window and moves nothing; a player\'s chip only while the host sends a clock, never marked private whatever it holds',
        c1[0] === '' && c1[1] === fmtWhen(tw, 7200) && c1[2] === '' && /click for the calendar/.test(c1[3]) && !/do not see/.test(c1[3]) && c2[0] === 'clock-private' && /players do not see it/.test(c2[1])
        && r1 === true && rT === 7203 && rNo === false && r2 === true && rT2 === 7202 && rTop === j({ s: 7203, ms: 0 }) && logR === WC.log.length && WC.log.length === 0 && j(r3) === j([false, false, false]) && kept && redrawn
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
    campR.clock.t = 2 * 86400 * 10 - 1; campR.clock.notes = [{ id: nId('g'), day: 20, text: 'Midnight' }]; const n0R = toastAt(); const rr = WR.api.second(campR.clock.t + 1, false, false);
    check('item 20 K3 a move that reaches a note\'s day reminds the GM (moveTo, run for real): one toast naming it (Today: …), several named in one (the first three, then …), and a Session Log line under Time for each with its date; a move within the day, a move back and a move that stays short reach nothing; moving back and on again reaches it again; the second of the fights crossing midnight reaches one too (152 fold 4)',
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
    check('item 20 K3 said and styled (pinned): Help\'s Calendar list has Notes on dates (Players see it, the marks, Coming up, the reminder and its Session Log line, players never reminded); the integration guide the notes\' keys; What\'s New in both copies; a noted day\'s mark',
        ix.includes('<li><b>Notes on dates</b>: pick a day and write a note on it') && /<b>Notes on dates<\/b>[\s\S]{0,200}<b>Players see it<\/b>[\s\S]{0,400}<b>Coming up<\/b> lists the next five[\s\S]{0,400}you get a reminder, and the Session Log gets a line under Time[\s\S]{0,400}never get the reminder\.<\/li>/.test(ix) && read('CAMPAIGN_INTEGRATION.md').includes('"notes" (up to 500, kept in day order): [{ "id": "n_" and 8 of a-z and 0-9, each once,')
        && read('WHATSNEW.txt').includes('- Notes on dates: pick a day in the calendar and write a note on it, for you') && read('system/app/assets/whatsnew.txt').includes('- Notes on dates: pick a day in the calendar and write a note on it, for you') && /\n  \.cal-day\.cal-has-note \{ /.test(cssN));

    // item 20 K4: each move of the clock on tells the timed effects how far (152 fold 4: each character's own span, net.fxSpans), never a move back or one that moves nothing
    const campE = { id: 'k', clock: { t: 100 }, chars: { c_a: { id: 'c_a', name: 'Kael', ownerId: 'u_a' }, c_n: { id: 'c_n', name: 'Unit 7', npc: true } } }, WE = mkCal({ camp: campE, sys: { calendar: tw, combat: { turn: { secs: 1 } } } });
    WE.api.moveBy(3600); WE.api.moveBy(-60); WE.api.moveBy(30); WE.api.moveBy(60); WE.api.second(campE.clock.t + 2, false, false); WE.api.moveTo(campE.clock.t, 'Set'); WE.api.moveBy(-1e9); WE.api.moveTo(500, 'Set'); WE.api.moveTo(5000, 'Set');
    const WEp = mkCal({ camp: { id: 'k', clock: { t: 1 }, chars: { c_a: {} } }, sys: { calendar: tw }, player: true }); WEp.api.moveBy(60); WEp.api.second(70, false, false);
    check('item 20 K4 a move of the clock on tells the timed effects how far it went (moveTo, run for real; 152 fold 4: as each character\'s own span, so a step back and on again counts nothing twice): a step on gives each character its seconds; a step back, then a step that stays under the second it left, gives none, and one past it only what lies past it; the second of the fights gives nothing here (ownTime has counted each character already); a move to where it is, one back to 0, and a set to a moment under the highest reached give nothing, and a set past it only the rest; a player\'s app never',
        j(WE.game) === j([{ c_a: 3600, c_n: 3600 }, { c_a: 30, c_n: 30 }, { c_a: 1268, c_n: 1268 }]) && WEp.game.length === 0, j([WE.game, WEp.game]));
    check('item 20 K4 said (pinned): Help\'s effect durations name the Calendar\'s clock; its Calendar list has Timed effects; What\'s New in both copies',
        ix.includes('Outside a combat the clock runs. With the <b>Calendar</b> on that is the campaign&rsquo;s own clock: each move of it on takes that much, and real time never counts.') && ix.includes('<li><b>Timed effects</b>: with the calendar on, an effect&rsquo;s time outside a fight runs by the clock, never in real time') && wn.includes('- With the Calendar on, a timed effect outside a fight runs by the') && wa.includes('- With the Calendar on, a timed effect outside a fight runs by the'));

    /* ---- item 20 K5: time rules ---- */
    const accK = C.cleanAcc({ c_a: { r_heal: 100.12345, r_fp: 0, r_x: -3, bad: 5, r_y: 'x', r_z: 1e20 }, __proto__x: { r_a: 1 }, c_b: 'x', c_c: {}, 'c_d': { r_a: 7 } });
    check('item 20 K5 what each character\'s time rules have counted (cleanAcc, the GM\'s own): ids by pattern (a character\'s and a rule\'s: a letter, _ and letters or digits), seconds above 0 below the limit to the millisecond, at most 100 counts a character (backlog 152: a rule\'s By the clock count and its In a fight count) and 1000 characters; nothing is null; a clock keeps it (cleanClock)',
        j(accK) === j({ c_a: { r_heal: 100.123 }, c_d: { r_a: 7 } }) && C.cleanAcc({}) === null && C.cleanAcc('x') === null && j(cleanClock({ t: 1, acc: { c_a: { r_a: 5 } } })) === j({ t: 1, acc: { c_a: { r_a: 5 } } }) && !('acc' in cleanClock({ t: 1, acc: { c_a: {} } })), j(accK));
    const unitsK = [{ key: 'Watch', secs: 14400 }], evK = [C.everySecs(tw, unitsK, { n: 10, u: 'min' }), C.everySecs(tw, unitsK, { n: 1, u: 'hour' }), C.everySecs(tw, unitsK, { n: 2, u: 'day' }), C.everySecs(tw, unitsK, { n: 1, u: 'week' }), C.everySecs(gsc, unitsK, { n: 1, u: 'week' }), C.everySecs(null, unitsK, { n: 1, u: 'week' }), C.everySecs(custom, unitsK, { n: 1, u: 'day' }), C.everySecs(tw, unitsK, { n: 3, u: 'watch' }), C.everySecs(tw, unitsK, { n: 1, u: 'shift' }), C.everySecs(tw, unitsK, null), C.everySecs(tw, unitsK, { n: 0, u: 'day' })];
    check('item 20 K5 a clock rule\'s interval (everySecs) by the calendar\'s own day: minutes, hours, days, a week of the calendar\'s week (7 days with none), a day of its own length, a time unit of the system by key in any case; a unit it does not know, no rule or no count is 0',
        j(evK) === j([600, 3600, 172800, 604800, 432000, 604800, 100000, 43200, 0, 0, 0]), j(evK));
    const rulesK = [{ id: 'r_heal', every: { n: 1, u: 'day', rest: true } }, { id: 'r_fp', every: { n: 10, u: 'min', rest: true } }, { id: 'r_any', every: { n: 1, u: 'hour' } }, { id: 'r_bad', every: { n: 1, u: 'shift' } }, { id: 'bad', every: { n: 1, u: 'min' } }, null];
    const f1 = C.ruleFires(tw, [], rulesK, ['c_a', 'c_b', 'bad id', 5], null, 8 * 3600, true), f2 = C.ruleFires(tw, [], rulesK, ['c_a'], f1.acc, 16 * 3600 + 300, true), f3 = C.ruleFires(tw, [], rulesK, ['c_a'], f2.acc, 1800, false), f4 = C.ruleFires(tw, [], rulesK, ['c_a'], f3.acc, 365 * 86400, true);
    const f0 = [C.ruleFires(tw, [], rulesK, ['c_a'], f1.acc, 0, true), C.ruleFires(tw, [], rulesK, ['c_a'], f1.acc, -60, true), C.ruleFires(tw, [], rulesK, ['c_a'], f1.acc, 'x', true)];
    check('item 20 K5 the rules a stretch of time fires (ruleFires; the owner\'s answer: rest adds up, activity breaks it): 8 hours of rest fire the 10-minute rule 48 times and count 8 hours towards the daily one; 16 hours and 5 minutes more make the day (1) and 96 more, 5 minutes carried; half an hour of activity fires the any-time rule not yet and clears the rest-only counts; a year of rest fires at most 500 a stretch; rules and characters with bad ids or intervals are passed over; the acc given is left as it was; no stretch fires nothing and keeps the counts',
        j(f1.fires) === j([{ c: 'c_a', r: 'r_fp', n: 48 }, { c: 'c_a', r: 'r_any', n: 8 }, { c: 'c_b', r: 'r_fp', n: 48 }, { c: 'c_b', r: 'r_any', n: 8 }]) && j(f1.acc) === j({ c_a: { r_heal: 28800 }, c_b: { r_heal: 28800 } })
        && j(f2.fires) === j([{ c: 'c_a', r: 'r_heal', n: 1 }, { c: 'c_a', r: 'r_fp', n: 96 }, { c: 'c_a', r: 'r_any', n: 16 }]) && j(f2.acc) === j({ c_a: { r_heal: 300, r_fp: 300, r_any: 300 }, c_b: { r_heal: 28800 } })
        && j(f3.fires) === j([]) && j(f3.acc) === j({ c_a: { r_any: 2100 }, c_b: { r_heal: 28800 } }) && f4.fires.every(f => f.n <= 500) && f4.fires.find(f => f.r === 'r_fp').n === 500 && f4.fires.find(f => f.r === 'r_heal').n === 365
        && j(f1.acc) === j({ c_a: { r_heal: 28800 }, c_b: { r_heal: 28800 } }) && f0.every(r => r.fires.length === 0 && j(r.acc) === j(f1.acc)), j([f1, f2, f3]));
    {   // backlog 152, fold 1: the fight clock's pure core (calendarcore.js; docs/FIGHT_CLOCK_DESIGN.md 1 to 3), in a scope of its own
        // ruleFires with no eighth argument, or one that is no plain object whose fight is a boolean, is the function it was: the pins above, again
        const hostileO = [undefined, null, 'x', 7, [], { fight: 'yes' }, { fight: 1 }, { rs: 1 }, Object.create({ fight: true }), new Date(0), JSON.parse('{"__proto__": {"fight": true}}')];
        const sameAs = hostileO.map(o => { const g1 = C.ruleFires(tw, [], rulesK, ['c_a', 'c_b', 'bad id', 5], null, 8 * 3600, true, o), g2 = C.ruleFires(tw, [], rulesK, ['c_a'], g1.acc, 16 * 3600 + 300, true, o), g3 = C.ruleFires(tw, [], rulesK, ['c_a'], g2.acc, 1800, false, o), g4 = C.ruleFires(tw, [], rulesK, ['c_a'], g3.acc, 365 * 86400, true, o); return j([g1, g2, g3, g4]) === j([f1, f2, f3, f4]); });
        check('152 fold 1 ruleFires with no eighth argument is the function it was (the pins above): absent, null, text, a number, a list, a fight that is no boolean, none at all, a fight only inherited, a date and a parsed "__proto__" key each give the very fires and counts pinned for it',
            sameAs.every(Boolean) && sameAs.length === 11, j(sameAs));
        // section 13's table: By the clock (every), In a fight (inFight, its count under x_ and the rule's tail) and Waits in a fight (every.wait)
        const UN = [{ key: 'Tick', secs: 1 }], fo = { fight: true, rs: 1 }, oo = { fight: false, rs: 1 };
        const RT = [{ id: 'r_clk', every: { n: 1, u: 'min' } }, { id: 'r_fgt', inFight: { n: 10, u: 'round' } }, { id: 'r_bw', every: { n: 1, u: 'min', wait: true }, inFight: { n: 30, u: 'Tick' } }, { id: 'r_bo', every: { n: 1, u: 'min' }, inFight: { n: 20, u: 'round' } }];
        const inF = C.ruleFires(tw, UN, RT, ['c_a'], null, 70, false, fo), outF = C.ruleFires(tw, UN, RT, ['c_a'], null, 70, false, oo), noO = C.ruleFires(tw, UN, RT, ['c_a'], null, 70, false);
        const after = C.ruleFires(tw, UN, RT, ['c_a'], inF.acc, 50, false, oo), back = C.ruleFires(tw, UN, RT, ['c_a'], after.acc, 20, false, fo);
        check('152 fold 1 the four ways a time rule can be set (ruleFires\' eighth argument, section 13\'s table): By the clock alone counts in a fight and out of one as it always did; In a fight alone counts only in a fight, its fires carrying x and its count under x_ and the rule\'s tail, and holds its count out of one; both with Waits in a fight have two rates, the clock\'s count waiting through the fight and going on after it, the fight\'s held outside, nothing counted twice; both without it count the fight\'s rate on top of the clock\'s; with no eighth argument In a fight and Waits mean nothing',
            j(inF) === j({ fires: [{ c: 'c_a', r: 'r_clk', n: 1 }, { c: 'c_a', r: 'r_fgt', n: 7, x: 1 }, { c: 'c_a', r: 'r_bw', n: 2, x: 1 }, { c: 'c_a', r: 'r_bo', n: 1 }, { c: 'c_a', r: 'r_bo', n: 3, x: 1 }], acc: { c_a: { r_clk: 10, x_bw: 10, r_bo: 10, x_bo: 10 } } })
            && j(outF) === j({ fires: [{ c: 'c_a', r: 'r_clk', n: 1 }, { c: 'c_a', r: 'r_bw', n: 1 }, { c: 'c_a', r: 'r_bo', n: 1 }], acc: { c_a: { r_clk: 10, r_bw: 10, r_bo: 10 } } })
            && j(noO) === j(outF)
            && j(after) === j({ fires: [{ c: 'c_a', r: 'r_clk', n: 1 }, { c: 'c_a', r: 'r_bo', n: 1 }], acc: { c_a: { x_bw: 10, x_bo: 10, r_bw: 50 } } })
            && j(back) === j({ fires: [{ c: 'c_a', r: 'r_fgt', n: 2, x: 1 }, { c: 'c_a', r: 'r_bw', n: 1, x: 1 }, { c: 'c_a', r: 'r_bo', n: 1, x: 1 }], acc: { c_a: { x_bo: 10, r_bw: 50, r_clk: 20, r_bo: 20 } } }),
            j([inF, outF, noO, after, back]));
        // the rest gate comes first, in a fight too; a stretch of each character's own (secs as a map); a character named twice counts once
        const RR = [{ id: 'r_rst', every: { n: 1, u: 'min', rest: true, wait: true } }, { id: 'r_fx', inFight: { n: 5, u: 'round' } }];
        const restIn = C.ruleFires(tw, UN, RR, ['c_a'], { c_a: { r_rst: 30 } }, 10, false, fo), restOut = C.ruleFires(tw, UN, RR, ['c_a'], { c_a: { r_rst: 30 } }, 40, true, oo);
        const perC = C.ruleFires(tw, UN, RR, ['c_a', 'c_b', 'c_c', 'c_a', 'bad', 5], null, JSON.parse('{"c_a": 12, "c_b": 5, "c_c": "x", "__proto__": 99, "c_z": 60}'), false, fo);
        check('152 fold 1 the rest gate comes first (ruleFires): a fight breaks a rest, so a rest-only count is cleared in a fight even when it Waits in a fight, and rest out of a fight counts it; a stretch may be each character\'s own, by id, one with none or with no number counting nothing, a key that names no character read by none; a character named twice counts once',
            j(restIn) === j({ fires: [{ c: 'c_a', r: 'r_fx', n: 2, x: 1 }], acc: {} }) && j(restOut) === j({ fires: [{ c: 'c_a', r: 'r_rst', n: 1 }], acc: { c_a: { r_rst: 10 } } })
            && j(perC) === j({ fires: [{ c: 'c_a', r: 'r_fx', n: 2, x: 1 }, { c: 'c_b', r: 'r_fx', n: 1, x: 1 }], acc: { c_a: { x_fx: 2 } } }), j([restIn, restOut, perC]));
        // the time pairs: exact at any size, ten rounds of 0.1 s make one second
        let tp = { s: 43200, ms: 0 }, fl = 43200; for (let i = 0; i < 10; i++) { tp = C.tAdd(tp, 100); fl += 0.1; }
        const tAd = [C.tAdd({ s: 999999999999998, ms: 999 }, 1), C.tAdd({ s: 123456789012345, ms: 900 }, 300), C.tAdd({ s: 123456789012345, ms: 100 }, -300), C.tAdd({ s: 0, ms: 500 }, -501), C.tAdd(1e15 - 1, 1500), C.tAdd(7, 0.6), C.tAdd([7, 5], 'x'), C.tAdd('x', 1000), C.tAdd({ s: 5, ms: 0 }, -86400000 * 1e5), C.tAdd(0, Infinity)];
        const tCm = [C.tCmp({ s: 5, ms: 1 }, { s: 5 }), C.tCmp([5, 0], 5), C.tCmp({ s: 4, ms: 999 }, 5), C.tCmp({ s: 999999999999999, ms: 1 }, { s: 999999999999999, ms: 0 })];
        const tSp = [C.tSpanMs({ s: 10, ms: 900 }, { s: 12, ms: 100 }), C.tSpanMs({ s: 12, ms: 100 }, { s: 10, ms: 900 }), C.tSpanMs({ s: 0 }, { s: 9007199254740, ms: 991 }), C.tSpanMs({ s: 0 }, { s: 9007199254740, ms: 999 }), C.tSpanMs(0, 1e15), C.tSpanMs(1e15, 0), C.tSpanMs({ s: 999999999999, ms: 1 }, { s: 1000000000000, ms: 0 })];
        const cT = [C.cleanTime({ s: 5 }), C.cleanTime([5, 999]), C.cleanTime([5, 1000]), C.cleanTime({ s: 1e15, ms: 1 }), C.cleanTime({ s: 1e15 }), C.cleanTime({ s: -1 }), C.cleanTime({ s: 1.5 }), C.cleanTime([1, 2, 3]), C.cleanTime('x'), C.cleanTime(5), C.cleanTime(JSON.parse('{"__proto__": {"s": 9}}'))];
        check('152 fold 1 a time is a pair of whole seconds and whole milliseconds, exact at any size (tAdd, tCmp, tFloor, tSpanMs, cleanTime): ten rounds of 0.1 s from 12:00:00 make 12:00:01 exactly, where adding 0.1 ten times does not; a carry and a borrow near 10^15 and at 0; held to 0 and to 10^15; a fraction of a millisecond rounded, an amount that is no number moves nothing; a span exact in milliseconds and held to the largest whole number a number holds exactly; a pair read as { s, ms } or [s, ms], anything out of its bounds none',
            j(tp) === j({ s: 43201, ms: 0 }) && fl !== 43201 && C.tFloor(tp) === 43201 && C.tFloor({ s: 7, ms: 999 }) === 7
            && j(tAd) === j([{ s: 999999999999999, ms: 0 }, { s: 123456789012346, ms: 200 }, { s: 123456789012344, ms: 800 }, { s: 0, ms: 0 }, { s: 1e15, ms: 0 }, { s: 7, ms: 1 }, { s: 7, ms: 5 }, { s: 1, ms: 0 }, { s: 0, ms: 0 }, { s: 0, ms: 0 }])
            && j(tCm) === j([1, 0, -1, 1]) && j(tSp) === j([1200, -1200, 9007199254740991, 9007199254740991, 9007199254740991, -9007199254740991, 999])
            && j(cT) === j([{ s: 5, ms: 0 }, { s: 5, ms: 999 }, null, null, { s: 1e15, ms: 0 }, null, null, null, null, null, null]) && ({}).s === undefined, j([tp, fl, tAd, tCm, tSp, cT]));
        // each character's own time (livedSpans): nobody lives a second twice
        const w1 = C.livedSpans(null, 43200, ['c_a', 'c_n'], { s: 43200 }, { s: 43201 }), prevOn = C.livedSpans(w1.lived, 43200, ['c_a', 'c_n'], { s: 43200 }, { s: 43201 }), w2 = C.livedSpans(prevOn.lived, 43200, ['c_a', 'c_n'], { s: 43201 }, { s: 43202 });
        const twoF = C.livedSpans(w2.lived, 43200, ['c_n'], { s: 43200 }, { s: 43202, ms: 500 }), topR = C.livedSpans({ c_low: [43100, 0] }, { s: 43205, ms: 0 }, ['c_new', 'c_low', 'c_new', 'bad', 5, '__proto__'], { s: 43200 }, { s: 43206, ms: 250 });
        const givenL = { c_a: [43210, 0] }, keepL = j(givenL), tenths = (() => { let lv = null, sum = 0; for (let i = 0; i < 10; i++) { const r = C.livedSpans(lv, 0, ['c_a'], C.tAdd(0, i * 100), C.tAdd(0, (i + 1) * 100)); sum += Math.round(r.spans.c_a * 1000); lv = r.lived; } return [sum, lv]; })();
        const bigL = {}; for (let i = 0; i < 1005; i++) bigL['c_' + i] = [50, 0]; const capL = C.livedSpans(bigL, 0, [], { s: 0 }, { s: 1 });
        check('152 fold 1 each character\'s own time (livedSpans, section 1\'s rule): a span counts what a character has not yet lived and marks it lived, so a fight\'s round lived, a step back and the same round again counts nothing, and on counts the next; one sheet in two fights lives the second fight\'s round only past the first\'s; a character with no mark, or a mark under the clock, reads the clock or its top; each counted once, ids by pattern; the marks kept only past base, at most 1000; ten spans of 0.1 s make one second in all; the marks given are left as they were',
            j(w1) === j({ spans: { c_a: 1, c_n: 1 }, lived: { c_a: [43201, 0], c_n: [43201, 0] } }) && j(prevOn) === j({ spans: {}, lived: w1.lived }) && j(w2.spans) === j({ c_a: 1, c_n: 1 })
            && j(twoF) === j({ spans: { c_n: 0.5 }, lived: { c_a: [43202, 0], c_n: [43202, 500] } }) && j(topR) === j({ spans: { c_new: 1.25, c_low: 1.25 }, lived: { c_new: [43206, 250], c_low: [43206, 250] } })
            && j(C.livedSpans(givenL, 43200, ['c_a'], { s: 43200 }, { s: 43215 })) === j({ spans: { c_a: 5 }, lived: { c_a: [43215, 0] } }) && j(givenL) === keepL
            && tenths[0] === 1000 && j(tenths[1]) === j({ c_a: [1, 0] }) && Object.keys(capL.lived).length === 1000 && j(C.livedSpans('x', 'y', 'z', null, null)) === j({ spans: {}, lived: {} }), j([w1, prevOn, w2, twoF, topR, tenths]));
        // fightSecs and freshAcc
        const fsx = [C.fightSecs(tw, UN, { n: 3, u: 'round' }, 0.1), C.fightSecs(tw, UN, { n: 7, u: 'round' }, 1.25), C.fightSecs(tw, UN, { n: 2, u: 'min' }, 1), C.fightSecs(custom, UN, { n: 1, u: 'hour' }, 1), C.fightSecs(tw, UN, { n: 4, u: 'TICK' }, 1), C.fightSecs(tw, UN, { n: 1, u: 'round' }, 0), C.fightSecs(tw, UN, { n: 1, u: 'round' }, 'x'), C.fightSecs(tw, UN, { n: 1, u: 'day' }, 1), C.fightSecs(tw, UN, { n: 0, u: 'round' }, 1), C.fightSecs(tw, UN, null, 1)];
        const accF = { c_a: { r_x: 5, x_x: 7, x_y: 3 }, c_b: { x_x: 2 }, c_c: { x_x: 9 } }, keepF = j(accF);
        const frF = C.freshAcc(accF, ['c_a', 'c_b', 'c_q', '__proto__', 5], [{ id: 'r_x', inFight: { n: 1, u: 'round', fresh: true } }, { id: 'r_y', inFight: { n: 1, u: 'round' } }, { id: 'r_z', inFight: { n: 1, u: 'round', fresh: 'yes' } }, null, { id: 'x_x', inFight: { n: 1, u: 'round', fresh: true } }]);
        check('152 fold 1 an In a fight interval (fightSecs): rounds by the round\'s length to the millisecond, minutes and hours by the calendar\'s own day, a time unit of the system by key in any case; a round with no length, a day, no count or no rule none; Each fight starts again (freshAcc) takes off only the In a fight counts of the rules ticked so, true only, for the fighters named, the acc given left as it was',
            j(fsx) === j([0.3, 8.75, 120, 10000, 4, 0, 0, 0, 0, 0]) && j(frF) === j({ c_a: { r_x: 5, x_y: 3 }, c_c: { x_x: 9 } }) && j(accF) === keepF && j(C.freshAcc(null, ['c_a'], [])) === '{}', j([fsx, frF]));
        // the clock keeps top, lived and the NPCs whose rules are off (the GM's own: net.js clockOut builds only t and notes)
        const ckF = cleanClock({ t: 100, top: { s: 150, ms: 250, x: 1 }, lived: { c_a: [160, 5], c_b: [150, 250], c_c: [120, 0], c_d: [170, 1000], c_e: { s: 155 }, x: [200, 0] }, rulesOff: ['c_n', 'c_n', 'Bad', 5, '<b>', 'c_m'], acc: { c_a: { x_dr: 2 } } });
        const ckN = [cleanClock({ t: 100, lived: { c_a: [100, 0], c_b: [100, 1] } }), cleanClock({ t: 100, top: { s: 100 } }), cleanClock({ t: 100, top: [99, 999] }), cleanClock({ t: 100, top: { s: 1e15, ms: 1 } }), cleanClock({ t: 1, top: 'x', lived: 'x', rulesOff: 'c_n' }), cleanClock({ t: 1, rulesOff: [] })];
        const ckP = cleanClock(JSON.parse('{"t": 1, "top": {"__proto__": {"s": 9}}, "lived": {"__proto__": [5, 0], "constructor": [5, 0], "c_a": [5, 0]}, "rulesOff": ["__proto__", "constructor", "c_n"]}'));
        const bigR = Array.from({ length: 1005 }, (_, i) => 'c_' + i), bigLv = {}; bigR.forEach(id => { bigLv[id] = [9, 0]; }); const ckCap = cleanClock({ t: 1, lived: bigLv, rulesOff: bigR });
        check('152 fold 1 the clock keeps what the fight clock needs, the GM\'s own (cleanClock): top, the highest second reached, as a pair only while past the clock; each character\'s own time as [s, ms] only past top, or past the clock with none; the NPCs whose rules are off, ids by pattern each once in the order written; at most 1000 of each; never a prototype\'s name; after what it kept before, the same cleaned twice',
            j(ckF) === j({ t: 100, acc: { c_a: { x_dr: 2 } }, top: { s: 150, ms: 250 }, lived: { c_a: [160, 5], c_e: [155, 0] }, rulesOff: ['c_n', 'c_m'] }) && j(cleanClock(ckF)) === j(ckF)
            && j(ckN) === j([{ t: 100, lived: { c_b: [100, 1] } }, { t: 100 }, { t: 100 }, { t: 100 }, { t: 1 }, { t: 1 }]) && j(ckP) === j({ t: 1, lived: { c_a: [5, 0] }, rulesOff: ['c_n'] }) && ({}).s === undefined
            && Object.keys(ckCap.lived).length === 1000 && ckCap.rulesOff.length === 1000 && ckCap.rulesOff[999] === 'c_999', j([ckF, ckN, ckP]));
        const many = {}; for (let i = 0; i < 105; i++) many['r_' + i] = i + 1; const accCap = C.cleanAcc({ c_a: many, c_b: { r_heal: 5, x_heal: 7 } });
        check('152 fold 1 a character keeps 100 counts (cleanAcc): a rule\'s By the clock count and its In a fight count, so 50 rules make up to 100; the 101st is dropped',
            Object.keys(accCap.c_a).length === 100 && accCap.c_a.r_99 === 100 && !('r_100' in accCap.c_a) && j(accCap.c_b) === j({ r_heal: 5, x_heal: 7 }), j(Object.keys(accCap.c_a).length));
        // the review of fold 1: each case below gives one answer under the rule and another under the reading next to it
        const RW = [{ id: 'r_w', every: { n: 1, u: 'min', wait: true } }, { id: 'r_f', inFight: { n: 10, u: 'round' } }];
        const rwNone = C.ruleFires(tw, [], RW, ['c_a'], null, 70, false), rwFight = C.ruleFires(tw, [], RW, ['c_a'], null, 70, false, fo), rwHost = hostileO.map(o => j(C.ruleFires(tw, [], RW, ['c_a'], null, 70, false, o)));
        check('152 fold 1 review: an eighth argument that is no plain object whose fight is a boolean is read as none on rules a fight counts otherwise (one that Waits in a fight, one In a fight alone): each of the eleven gives what no argument gives, never what a fight gives',
            j(rwNone) === j({ fires: [{ c: 'c_a', r: 'r_w', n: 1 }], acc: { c_a: { r_w: 10 } } }) && j(rwFight) === j({ fires: [{ c: 'c_a', r: 'r_f', n: 7, x: 1 }], acc: {} }) && rwHost.length === 11 && rwHost.every(s => s === j(rwNone)), j([rwNone, rwFight, rwHost]));
        const lvAhead = C.livedSpans({ c_a: [43210, 0] }, 43200, ['c_a'], { s: 43200 }, { s: 43205 }), lvLate = C.livedSpans(null, 43200, ['c_a'], { s: 43203 }, { s: 43205 });
        const lvWalk = (() => { let lv = { c_a: [43210, 0] }; const pts = [43200, 43205, 43210, 43212], got = []; for (let i = 1; i < pts.length; i++) { const r = C.livedSpans(lv, pts[i - 1], ['c_a'], { s: pts[i - 1] }, { s: pts[i] }); got.push(r.spans.c_a || 0); lv = r.lived; } return [got, lv]; })();
        check('152 fold 1 review: a character whose own time is past a span\'s end lives none of it and keeps its mark, never moved back; a span that begins past a character\'s mark counts from the span\'s start, never from the mark; a fight that ran ahead counts nothing again as the clock catches up, and only what lies past its end (livedSpans)',
            j(lvAhead) === j({ spans: {}, lived: { c_a: [43210, 0] } }) && j(lvLate) === j({ spans: { c_a: 2 }, lived: { c_a: [43205, 0] } }) && j(lvWalk) === j([[0, 0, 2], { c_a: [43212, 0] }]), j([lvAhead, lvLate, lvWalk]));
        const tenthR = [{ id: 'r_f', inFight: { n: 10, u: 'round' } }], tenthW = (() => { let acc = null; const got = []; for (let i = 0; i < 10; i++) { const r = C.ruleFires(tw, [], tenthR, ['c_a'], acc, 0.1, false, { fight: true, rs: 0.1 }); got.push(r.fires); acc = r.acc; } return [got, acc]; })();
        const capR = C.ruleFires(tw, [], [{ id: 'r_f', inFight: { n: 1, u: 'round' } }], ['c_a'], null, 365 * 86400 + 0.25, false, fo);
        check('152 fold 1 review: In a fight counts rounds by the round\'s length the fight hands in (ruleFires\' o.rs), so ten stretches of 0.1 s against a rule of 10 rounds of 0.1 s fire it once, on the tenth, with nothing left over; a long stretch fires a rule at most 500 times and carries only what is left of its last round',
            j(tenthW) === j([[[], [], [], [], [], [], [], [], [], [{ c: 'c_a', r: 'r_f', n: 1, x: 1 }]], {}]) && j(capR) === j({ fires: [{ c: 'c_a', r: 'r_f', n: 500, x: 1 }], acc: { c_a: { x_f: 0.25 } } }), j([tenthW, capR]));
        const RB = [{ id: 'r_rb', every: { n: 1, u: 'min', rest: true }, inFight: { n: 5, u: 'round' } }], rbIn = C.ruleFires(tw, [], RB, ['c_a'], { c_a: { r_rb: 30, x_rb: 2 } }, 10, false, fo), rbOut = C.ruleFires(tw, [], RB, ['c_a'], { c_a: { r_rb: 30, x_rb: 2 } }, 40, true, oo);
        check('152 fold 1 review: a rule By the clock during rest only and In a fight too: the fight breaks the rest, which clears the By the clock count alone, and the In a fight count goes on, since In a fight has no rest of its own; resting out of a fight counts By the clock and holds In a fight',
            j(rbIn) === j({ fires: [{ c: 'c_a', r: 'r_rb', n: 2, x: 1 }], acc: { c_a: { x_rb: 2 } } }) && j(rbOut) === j({ fires: [{ c: 'c_a', r: 'r_rb', n: 1 }], acc: { c_a: { r_rb: 10, x_rb: 2 } } }), j([rbIn, rbOut]));
        const frY = C.freshAcc({ c_a: { x_z: 4, x_x: 7 } }, ['c_a'], [{ id: 'r_z', inFight: { n: 1, u: 'round', fresh: 'yes' } }, { id: 'r_x', inFight: { n: 1, u: 'round', fresh: true } }]);
        const wkU = [{ key: 'Week', secs: 50 }], fsW = [C.fightSecs(tw, wkU, { n: 2, u: 'week' }, 1), C.everySecs(tw, wkU, { n: 2, u: 'week' }), C.fightSecs(tw, UN, { n: 1, u: 'day' }, 1)];
        check('152 fold 1 review: Each fight starts again only as true (freshAcc keeps the In a fight count of a rule whose word is yes); In a fight\'s unit other than a round, minutes or hours is a time unit of the system\'s own by its key (fightSecs): one keyed week reads that unit, never the calendar\'s week as By the clock reads its own, and a day, which no unit may be keyed, is none',
            j(frY) === j({ c_a: { x_z: 4 } }) && j(fsW) === j([100, 1209600, 0]), j([frY, fsW]));
    }
    // the window's flows (calendar.js, run for real): Rest or Active, what is due, Apply and Skip, a Set forward, a fight's rounds
    const sysTR = { calendar: tw, combat: { turn: { secs: 6 } }, rolls: [{ id: 'r_heal', label: 'Heal', formula: '3d6', every: { n: 1, u: 'day', rest: true } }, { id: 'r_fp', label: HOSTILE, apply: [], every: { n: 10, u: 'min', rest: true } }, { id: 'r_any', label: 'Any', apply: [], every: { n: 1, u: 'hour' } }, { id: 'r_none', label: 'Plain', formula: '1d6' }] };
    const campTR = { id: 'k', clock: { t: 0 }, turnRules: { time: 'confirm' }, chars: { c_a: { id: 'c_a', name: 'Pat', ownerId: 'u_a' }, c_n: { id: 'c_n', name: HOSTILE, npc: true }, c_o: { id: 'c_o', name: 'Loose' } } }, WT = mkCal({ camp: campTR, sys: sysTR }); WT.api.openWin();
    const kindBtns = findN(WT.body, 'cal-kind-btn'), kind0 = [kindBtns.map(b => [b.dataset.act, b.dataset.kind, b.textContent]), kindBtns.map(b => b.className.indexOf('cal-kind-on') >= 0)];
    WT.api.onWinClick({ target: kindBtns[1] }); const restOn = WT.api.st().restMode === true && findN(WT.body, 'cal-kind-btn')[1].className.indexOf('cal-kind-on') >= 0;
    WT.api.onWinClick({ target: findN(WT.body, 'cal-step').find(b => b.textContent === '+1 day of rest') });
    const pend1 = WT.api.st().pend, rowsT = findN(WT.body, 'cal-pend-row').map(r => [findN(r, 'cal-pend-tick')[0].checked, findN(r, 'cal-pend-name')[0].textContent, findN(r, 'cal-pend-rules')[0].textContent]), headT = findN(WT.body, 'cal-pend-head')[0].textContent;
    const stepsOn = findN(WT.body, 'cal-step').every(b => b.disabled !== true) && findN(WT.body, 'cal-any-go')[0].disabled !== true && findN(WT.body, 'cal-step').map(b => b.textContent).join('|') === '+1 minute of rest|+10 minutes of rest|+1 hour of rest|+1 day of rest|+1 week of rest' && findN(WT.body, 'cal-any-go')[0].textContent === 'Move as rest' && findN(WT.body, 'cal-kind-note').length === 1;
    const groupsT = [findN(WT.body, 'cal-pend-group').map(g => g.textContent), findN(WT.body, 'cal-pend-map').map(g => g.textContent), findN(WT.body, 'cal-pend-bar')[0].children.map(c => c.className.split(' ').pop()), findN(WT.body, 'cal-pend-since').map(x => x.textContent)];
    WT.api.onWinChange({ target: Object.assign(findN(WT.body, 'cal-pend-tick').find(x => x.dataset.char === 'c_n'), { checked: true }) }); WT.api.onWinChange({ target: Object.assign(findN(WT.body, 'cal-pend-tick').find(x => x.dataset.char === 'c_a'), { checked: false }) });
    WT.api.onWinClick({ target: findN(WT.body, 'cal-pend-apply')[0] }); const applied = [JSON.parse(JSON.stringify(WT.runs)), WT.api.st().pend, j(campTR.clock.acc || null)];
    check('item 20 K5 the GM moves time on as Rest or Active (the window, run for real): Active first; a day of rest makes the rules due — a panel naming the stretch, each character with its rules and counts as text, Apply and Skip at its top (159), the players\' characters and then the NPCs (and one with no player) in two groups, each by the map it stands on, players\' characters ticked and NPCs offered unticked; the steps, Move and Set never held, saying of rest while Rest is picked (159); the ticks change who runs; Apply runs the ticked ones (sheets.js runTimeRules, the stretch in words) and keeps what each rule counted',
        j(kind0) === j([[['calkind', 'active', 'Active'], ['calkind', 'rest', 'Rest']], [true, false]]) && restOn && !!pend1 && pend1.rest === true && headT === 'Time rules due \u2014 1 day of rest'
        && j(rowsT) === j([[true, 'Pat', 'Heal \u00d71, ' + HOSTILE + ' \u00d7144, Any \u00d724'], [false, HOSTILE, 'Heal \u00d71, ' + HOSTILE + ' \u00d7144, Any \u00d724'], [false, 'Loose', 'Heal \u00d71, ' + HOSTILE + ' \u00d7144, Any \u00d724']]) && stepsOn && j(groupsT) === j([['Players\u2019 characters', 'NPCs'], ['On no map', 'On no map'], ['cal-pend-head', 'cal-pend-apply', 'cal-pend-skip'], ['']])
        && applied[0].length === 1 && j(applied[0][0][0].map(f => f.c)) === j(['c_n', 'c_n', 'c_n']) && applied[0][0][1] === '1 day of rest' && applied[1] === null && applied[2] === 'null', j([kind0, rowsT, headT, applied, stepsOn, groupsT]));
    WT.api.onWinClick({ target: findN(WT.body, 'cal-step').find(b => b.textContent === '+10 minutes of rest') }); const p2 = WT.api.st().pend; WT.api.onWinClick({ target: findN(WT.body, 'cal-pend-skip')[0] }); const skipped = [WT.runs.length, WT.api.st().pend, j(campTR.clock.acc || null)];
    WT.api.onWinClick({ target: findN(WT.body, 'cal-kind-btn')[0] }); WT.api.onWinClick({ target: findN(WT.body, 'cal-step').find(b => b.textContent === '+10 minutes') }); const quiet = [WT.api.st().pend, j(campTR.clock.acc)];
    check('item 20 K5 Skip lets the time pass with no rule run and keeps what each rule counted; a stretch that makes nothing due asks nothing and keeps the counts (10 minutes of rest skipped: the daily rule at 10 minutes, the 10-minute rule used up; 10 minutes of activity after: the any-time rule at 20 minutes of its hour, the rest-only counts cleared)',
        !!p2 && skipped[0] === 1 && skipped[1] === null && skipped[2] === j({ c_a: { r_heal: 600, r_any: 600 }, c_n: { r_heal: 600, r_any: 600 }, c_o: { r_heal: 600, r_any: 600 } }) && quiet[0] === null && quiet[1] === j({ c_a: { r_any: 1200 }, c_n: { r_any: 1200 }, c_o: { r_any: 1200 } }), j([skipped, quiet]));
    // a Set forward always asks; a fight's rounds count as activity and run at once with no list, even under Ask me (152 fold 4: brief 7, "At each turn"); a player never
    const campS = { id: 'k', clock: { t: 0 }, turnRules: { time: 'confirm' }, chars: { c_a: { id: 'c_a', name: 'Pat', ownerId: 'u_a' } } }, WS2 = mkCal({ camp: campS, sys: sysTR }); WS2.api.openWin();
    WS2.api.onWinClick({ target: findN(WS2.body, 'cal-day')[3] }); findN(WS2.body, 'cal-set-h')[0].value = '6'; WS2.api.onWinClick({ target: findN(WS2.body, 'cal-set')[0] }); const setAsk = WS2.api.st().pend;
    WS2.api.onWinClick({ target: findN(WS2.body, 'cal-pend-skip')[0] });
    const tS = campS.clock.t, r600 = WS2.api.ownTime([{ kind: 'fight', ids: ['c_a'], t0: tS, t1: tS + 3600, round: 600, rs: 6, words: 'Round 600 on Docks' }]), fightRun = JSON.parse(JSON.stringify(WS2.runs)), roundsHeld = [WS2.api.st().pend, WS2.api.st().pendQ.length];
    const campPl = { id: 'k', clock: { t: 0 }, chars: { c_a: { id: 'c_a', name: 'Pat', ownerId: 'u_a' } } }, WPl = mkCal({ camp: campPl, sys: sysTR, player: true }), plPass = WPl.api.ownTime([{ kind: 'clock', ids: ['c_a'], t0: 0, t1: 86400, rest: true }]), plEnd = WPl.api.second(60, false, true);
    check('item 20 K5 a Set forward always asks (the owner\'s answer: the GM\'s choice), the time skipped as Active or Rest; 152 fold 4: a fight\'s round counts as activity and runs at once with no list even under Ask me (an hour of rounds: the any-time rule run, headed by its round and handed that round); a player\'s app never runs or asks',
        !!setAsk && setAsk.secs === 3 * 86400 + 6 * 3600 && setAsk.rest === false && r600 === false && j(fightRun) === j([[[{ c: 'c_a', r: 'r_any', n: 1 }], 'Round 600 on Docks', { round: 600 }]]) && j(roundsHeld) === j([null, 0])
        && plPass === false && plEnd === false && WPl.runs.length === 0, j([setAsk && setAsk.secs, r600, fightRun, roundsHeld]));

    // item 20 K5b: the table's word on the time rules (camp.turnRules.time) and a paused table
    const mkRule = (tr, o) => { const camp = { id: 'k', clock: { t: 0 }, turnRules: tr, chars: { c_a: { id: 'c_a', name: 'Pat', ownerId: 'u_a' }, c_n: { id: 'c_n', name: 'Orc', npc: true } } }; return { camp, W: mkCal(Object.assign({ camp, sys: sysTR }, o || {})) }; };
    const A1 = mkRule({ time: 'auto' }); A1.W.api.openWin(); A1.W.api.onWinClick({ target: findN(A1.W.body, 'cal-kind-btn')[1] }); A1.W.api.onWinClick({ target: findN(A1.W.body, 'cal-step').find(b => b.textContent === '+1 day of rest') });
    const autoRun = [JSON.parse(JSON.stringify(A1.W.runs)), A1.W.api.st().pend, j(A1.camp.clock.acc || null)];
    A1.W.api.onWinClick({ target: findN(A1.W.body, 'cal-day')[5] }); findN(A1.W.body, 'cal-set-h')[0].value = '0'; A1.W.api.onWinClick({ target: findN(A1.W.body, 'cal-set')[0] }); const autoSet = A1.W.api.st().pend; A1.W.api.onWinClick({ target: findN(A1.W.body, 'cal-pend-skip')[0] });
    const fightOf = (W, camp) => W.api.ownTime([{ kind: 'fight', ids: ['c_a', 'c_n'], t0: camp.clock.t, t1: camp.clock.t + 3600, round: 3, rs: 6, words: 'Round 3 on Docks' }]);
    const runsBefore = A1.W.runs.length; fightOf(A1.W, A1.camp); const autoRounds = [A1.W.runs.length - runsBefore, j((A1.W.runs[runsBefore] || [[]])[0].map(f => f.c))];
    const O1 = mkRule({ time: 'off' }); O1.W.api.openWin(); O1.W.api.onWinClick({ target: findN(O1.W.body, 'cal-step').find(b => b.textContent === '+1 day') }); fightOf(O1.W, O1.camp); const offRes = [O1.W.api.st().pend, O1.W.runs.length, 'acc' in O1.camp.clock, j(O1.camp.clock.lived)];
    const P1 = mkRule({}, { paused: true }); P1.W.api.openWin(); P1.W.api.onWinClick({ target: findN(P1.W.body, 'cal-step').find(b => b.textContent === '+1 day') }); fightOf(P1.W, P1.camp); const pausedRes = [P1.W.api.st().pend, P1.W.runs.length, 'acc' in P1.camp.clock, j(P1.camp.clock.lived)];
    const J1 = mkRule({ time: '<b>auto</b>' }); J1.W.api.openWin(); J1.W.api.onWinClick({ target: findN(J1.W.body, 'cal-step').find(b => b.textContent === '+1 day') }); const junkMode = !J1.W.api.st().pend && J1.W.runs.length === 1;
    const N1 = mkRule(undefined); N1.W.api.openWin(); N1.W.api.onWinClick({ target: findN(N1.W.body, 'cal-step').find(b => b.textContent === '+1 day') }); const noWord = [N1.W.api.st().pend, N1.W.runs.length, j(N1.W.runs[0] && N1.W.runs[0][0].map(f => f.c))];
    const C1 = mkRule({ time: 'confirm' }); C1.W.api.openWin(); C1.W.api.onWinClick({ target: findN(C1.W.body, 'cal-step').find(b => b.textContent === '+1 day') }); const askWord = [!!C1.W.api.st().pend, C1.W.runs.length];
    const livedOO = j({ c_a: [86400 + 3600, 0], c_n: [86400 + 3600, 0] });
    check('item 20 K5b the table\'s word on the time rules (run for real): Run at once runs every character\'s rules as time passes (152 fold 4, the owner\'s answer "Every character": an NPC\'s too, its summary the GM\'s alone) and keeps the counts, a Set forward still asks, the rounds of a fight run as they pass, an NPC\'s too; Off runs and counts nothing, and a paused table runs and counts nothing, while each character\'s own time still rises (so lifting either counts nothing twice); no word and a word it does not know are the default since 1.5.5, Run at once (159), and Ask me asks',
        autoRun[0].length === 1 && j(autoRun[0][0][0].map(f => f.c)) === j(['c_a', 'c_a', 'c_a', 'c_n', 'c_n', 'c_n']) && autoRun[0][0][1] === '1 day of rest' && autoRun[1] === null && autoRun[2] === 'null' && !!autoSet && autoRounds[0] === 1 && autoRounds[1] === j(['c_a', 'c_n'])
        && j(offRes) === j([null, 0, false, livedOO]) && j(pausedRes) === j([null, 0, false, livedOO]) && junkMode === true && j(noWord) === j([null, 1, '["c_a","c_n"]']) && j(askWord) === j([true, 0]), j([autoRun, autoSet && autoSet.secs, autoRounds, offRes, pausedRes, noWord, askWord]));
    // 159 (the owner, 2026-10-18: the clock could not be moved at the table while a list of time rules waited): the steps, Move and Set never
    // wait; the time moved meanwhile is kept in order, like stretches run on as one, put aside with its campaign, and judged once the list is answered
    {
        const campQ = { id: 'k', clock: { t: 0 }, turnRules: { time: 'confirm' }, chars: { c_a: { id: 'c_a', name: 'Pat', ownerId: 'u_a' } } }, oQ = { camp: campQ, sys: sysTR }, WQ = mkCal(oQ); WQ.api.openWin();
        const stepQ = txt => WQ.api.onWinClick({ target: findN(WQ.body, 'cal-step').find(b => b.textContent === txt) });
        WQ.api.onWinClick({ target: findN(WQ.body, 'cal-kind-btn')[1] }); stepQ('+1 day of rest'); const pQ1 = WQ.api.st().pend;
        stepQ('+1 hour of rest'); stepQ('+1 hour of rest'); WQ.api.onWinClick({ target: findN(WQ.body, 'cal-kind-btn')[0] }); stepQ('+10 minutes');
        const since = findN(WQ.body, 'cal-pend-since')[0], q1 = [campQ.clock.t, WQ.api.st().pend === pQ1, j(WQ.api.st().pendQ), since ? since.textContent : null, findN(WQ.body, 'cal-step').every(b => b.disabled !== true)];
        findN(WQ.body, 'cal-any-n')[0].value = '-5'; findN(WQ.body, 'cal-any-u')[0].value = 'min'; WQ.api.onWinClick({ target: findN(WQ.body, 'cal-any-go')[0] }); const back = [campQ.clock.t, WQ.api.st().pendQ.length];
        WQ.api.onWinClick({ target: findN(WQ.body, 'cal-day').find(b => b.dataset.day === '5') }); findN(WQ.body, 'cal-set-h')[0].value = '0'; findN(WQ.body, 'cal-set-m')[0].value = '0';
        const tSet0 = campQ.clock.t; WQ.api.onWinClick({ target: findN(WQ.body, 'cal-set')[0] }); const setQ = [campQ.clock.t, WQ.api.st().pend === pQ1, j(WQ.api.st().pendQ.map(q => [q.r, q.a]))];
        const campO = { id: 'k2', clock: { t: 0 }, turnRules: { time: 'confirm' }, chars: {} }; oQ.camp = campO; WQ.api.refresh(); const away = [WQ.api.st().pend, WQ.api.st().pendQ.length];
        oQ.camp = campQ; WQ.api.refresh(); const home = [WQ.api.st().pend === pQ1, WQ.api.st().pendQ.length];
        WQ.api.onWinClick({ target: findN(WQ.body, 'cal-pend-skip')[0] }); const p2 = WQ.api.st().pend, s2 = [p2 && p2.secs, p2 && p2.rest, j(WQ.api.st().pendQ.map(q => q.s))];
        WQ.api.onWinClick({ target: findN(WQ.body, 'cal-pend-skip')[0] }); const p3 = WQ.api.st().pend, s3 = [p3 && p3.secs, p3 && p3.rest, WQ.api.st().pendQ.length];
        WQ.api.onWinClick({ target: findN(WQ.body, 'cal-pend-skip')[0] }); const s4 = [WQ.api.st().pend, WQ.api.st().pendQ.length, WQ.runs.length];
        check('159 the steps, Move and Set never wait for a list of time rules (calendar.js, run for real): the clock moves at once, the list stays as it was, and its time is kept behind it, a stretch like the last one run on as one (two hours of rest), a stretch of another kind apart (ten minutes of activity), a move back counting nothing, a Set forward kept as one that asks; the list says how much more has passed; another campaign on screen has none of it and it is back with its own; each Skip lets the next stretch be judged in order, the first that makes rules due a list of its own, until nothing waits',
            j(q1) === j([86400 + 7800, true, j([{ s: 7200, r: true, a: false, l: false }, { s: 600, r: false, a: false, l: false }]), '2 hours, 10 minutes more has passed since. It is counted once you apply or skip these.', true])
            && j(back) === j([86400 + 7500, 2]) && setQ[0] === 5 * 86400 && setQ[1] === true && setQ[2] === j([[true, false], [false, false], [false, true]])
            && j(away) === j([null, 0]) && j(home) === j([true, 3])
            && s2[0] === 7200 && s2[1] === true && s2[2] === j([600, 5 * 86400 - tSet0]) && s3[0] === 5 * 86400 - tSet0 && s3[1] === false && s3[2] === 0 && j(s4) === j([null, 0, 0]), j([q1, back, setQ, away, home, s2, s3, s4, since && since.textContent]));
    }
    // 159 (the owner by prompt: "maybe a PCs and NPCs category, and sort by map location"): the list in two groups, each by the map its
    // characters stand on — the map on screen first, the others by name, then those on no map — and by name within a map
    {
        const tk = (c, x) => Object.assign({ isChar: true, charId: c }, x || {});
        const campG2 = { id: 'k', activeItemId: 'm_c', clock: { t: 0 }, turnRules: { time: 'confirm' },
            items: { m_a: { type: 'map', meta: { title: 'Docks' }, whiteboard: [tk('c_b')] }, m_b: { type: 'map', meta: { title: 'Alley' }, whiteboard: [tk('c_a'), tk('c_n'), tk('c_y'), tk('c_c')] }, m_c: { type: 'map', meta: { title: 'Zz ' + HOSTILE }, whiteboard: [tk('c_n'), { isChar: false, charId: 'c_z' }] }, p1: { type: 'page', whiteboard: [tk('c_z')] } },
            chars: { c_a: { id: 'c_a', name: 'Pat', ownerId: 'u_a' }, c_b: { id: 'c_b', name: 'Bo', ownerId: 'u_b' }, c_c: { id: 'c_c', name: 'Abe', ownerId: 'u_c' }, c_n: { id: 'c_n', name: 'Orc', npc: true }, c_y: { id: 'c_y', name: 'Ann', npc: true }, c_z: { id: 'c_z', name: 'Zed', npc: true } } };
        const WG2 = mkCal({ camp: campG2, sys: sysTR }); WG2.api.openWin(); WG2.api.onWinClick({ target: findN(WG2.body, 'cal-step').find(b => b.textContent === '+1 day') });
        const list = findN(WG2.body, 'cal-pend-list')[0], seq = list ? walkN(list, x => /cal-pend-(group|map|name)/.test(x.className), []).map(x => x.textContent) : [];
        check('159 the list of time rules due in two groups by map (calendar.js pendWhere and pendPanel, run for real): the players\' characters, then the NPCs; within each the map on screen first, the others by their name, then those on no map; a character on the map of its first token in that order; a page, a piece that is no character and a map\'s name as text alone',
            j(seq) === j(['Players\u2019 characters', 'On Alley', 'Abe', 'Pat', 'On Docks', 'Bo', 'NPCs', 'On Zz ' + HOSTILE, 'Orc', 'On Alley', 'Ann', 'On no map', 'Zed']), j(seq));
    }
    // the players' Fill and Reset all (sheets.js fillBarred) and the settings, pinned
    const shK = read('system/app/scripts/sheets.js'), fbLine = shK.slice(shK.indexOf('function fillBarred()'), shK.indexOf('\n', shK.indexOf('function fillBarred()'))), stK = read('system/app/scripts/settings.js');
    const fb = (role, fill) => new Function('isClient', 'getActiveCampaign', fbLine + '\nreturn fillBarred();')(() => role === 'client', () => ({ turnRules: fill === undefined ? undefined : { fill: fill } }));
    check('item 20 K5b a player\'s Fill button and a section\'s Reset all stay inert only at a table whose GM fills pools (fillBarred, run for real: a player\'s app and fill gm alone); the pool\'s button and the chip use it; the Calendar row\'s two selects in Settings with their handlers; said in Help, the guide and What\'s New',
        fb('client', 'gm') === true && fb('client', 'owner') === false && fb('client') === false && fb('host', 'gm') === false && fb('client', 'GM') === false
        && shK.includes("var fb = typeof fillBarred === 'function' && fillBarred(); rs.title = fb ? 'The GM fills pools at this table'") && shK.includes("barred = typeof fillBarred === 'function' && fillBarred(), on = live && targets.length > 0 && !barred;")
        && ix.includes('<span class="set-name">Time rules<small>What happens when time passes and your system&rsquo;s time rules are due.</small></span> <select id="setTimeRulesMode" class="map-select" style="margin-left:auto;"><option value="auto">Run at once</option><option value="confirm">Ask me</option><option value="off">Off</option></select>') && ix.includes('<span class="set-name">Players fill their own pools<small>Whether a player may fill a pool of their own back to full.</small></span> <select id="setFillMode" class="map-select" style="margin-left:auto;"><option value="owner">Yes</option><option value="gm">No, only you</option></select>')
        && stK.includes("if (val === 'auto') delete tr.time; else tr.time = val; camp.turnRules = tr;") && stK.includes("trM.value = tv0 === 'confirm' || tv0 === 'off' ? tv0 : 'auto';") && stK.includes("if (_fillSel.value === 'gm') tr.fill = 'gm'; else delete tr.fill; camp.turnRules = tr;")
        && ix.includes('<b>Players fill their own pools</b>: <b>No, only you</b> keeps a player&rsquo;s Fill button and a section&rsquo;s Reset all inert') && ci.includes('"time" ("confirm" or "off"; absent or "auto": they run at once, the default since 1.5.5)') && ix.includes('<b>Run at once</b>, <b>Ask me</b> or <b>Off</b>. Run at once is the default.') && wn.includes('or be off, and you can keep players from filling their own pools.'));

    /* ---- K2 wired and said (pinned) ---- */
    const mainJ = read('system/app/scripts/main.js'), ioJ = read('system/app/scripts/io.js'), vtJ = read('system/app/scripts/vtt.js'), cssJ = read('system/app/style.css');
    check('item 20 K2 wired (pinned): the chip in the header after the spacer, the Calendar window, calendar.js loaded after its core, the app\'s render refreshing the chip before its no-map return, the load cleaning a campaign\'s clock (none without the cleaner), the Calendar in the feature list (on by default since 2026-09-30, a player\'s own switch) with its rows in Settings, the chip\'s look',
        ix.includes('<div class="spacer"></div>\n    <button class="tool ghost hdr-clock" id="clockChip" style="display:none;"') && ix.includes('<span class="clock-txt"></span></button>') && ix.includes('<div id="calendarModal" style="display:none;') && ix.includes('<div id="calendarBody" class="cal-body"></div>') && ix.includes('id="calendarClose"')
        && ix.includes('<script type="module" src="scripts/calendarcore.js"></script>\n<script type="module" src="scripts/calendar.js"></script>') && /window\.wpNet\.renderWhere\(\);[^\n]*\n\s*if \(window\.wpCalendar && window\.wpCalendar\.refresh\) window\.wpCalendar\.refresh\(\);/.test(mainJ)
        && ioJ.includes("if (c.clock !== undefined) { var ckL = window.wpCalendarCore && window.wpCalendarCore.cleanClock ? window.wpCalendarCore.cleanClock(c.clock) : null; if (ckL) c.clock = ckL; else delete c.clock; }")
        && vtJ.includes("{ id: 'calendar',  label: 'Calendar',         legacyKey: null }") && ix.includes('<div class="set-vtt-row" data-vtt="calendar"') && ix.includes('id="setCalendarBtn"') && ix.includes('id="setCalendarState"') && ix.includes('id="setVttGlobalCalendarBtn"') && ix.includes('id="setVttGlobalCalendarState"')
        && /\n  \.hdr-clock \{ /.test(cssJ) && /\n  \.hdr-clock\.clock-private \{ /.test(cssJ) && /\n  \.cal-grid \{ /.test(cssJ));
    check('item 20 K2 said (pinned): Help has a Calendar section before VTT settings (the chip, the grid, Move time on and any amount in the system\'s own units, Set the clock, Players see the date, a fight\'s own time with the clock following the fight furthest behind and the round a fight ends in counting (152 fold 4, moved on purpose), the session log\'s Time, not a step of Undo, Hide the clock for me) and names the calendar among the features in three places; the integration guide the clock\'s keys; What\'s New in both copies',
        ix.includes('<h4 id="helpCalendar">Calendar</h4>') && /<h4 id="helpCalendar">Calendar<\/h4>[\s\S]{0,300}chip at the top right[\s\S]{0,900}<b>Move time on<\/b>[\s\S]{0,300}your system&rsquo;s own time units[\s\S]{0,200}<b>Set the clock<\/b>[\s\S]{0,100}<b>Players see the date<\/b>[\s\S]{0,7500}<p>Each fight keeps its own time\. Each round adds the round&rsquo;s length[\s\S]{0,300}the clock shows the fight furthest behind[\s\S]{0,100}The round a fight ends in counts\. With rounds of 1 second, a fight begun at 12:00:00 and ended in round 3 lets the clock go on from 12:00:03\.[\s\S]{0,200}under <b>Time<\/b>\. The clock is not a step of Undo[\s\S]{0,400}<b>Hide the clock for me<\/b>[\s\S]{0,200}\n\s*<h4 id="helpVtt">VTT settings<\/h4>/.test(ix.replace(/<svg class="ico"[^>]*>[\s\S]*?<\/svg>/g, '{ico}'))
        && ix.includes('fog of war, lighting, turn-based combat, the calendar, video, table trackers, and the VTT integration master') && ix.includes('The others are visual effects, fog of war, lighting, turn-based combat, the calendar, video and table trackers.</li>') && ix.includes('Then come visual effects, fog of war, lighting, turn-based combat, the calendar, video and table trackers. Every one is on for a new campaign until you switch it off.')
        && ci.includes('"clock": { "t": 3600, "hide": true },   // OPTIONAL (1.5.0, the Calendar feature)') && wn.includes('- The Calendar (Settings ' + String.fromCharCode(0x25b8) + ' VTT features; on by default): the') && wa.includes('- The Calendar (Settings ' + String.fromCharCode(0x25b8) + ' VTT features; on by default): the'));

    /* ---- 1.5.4: the running clock (the owner, 2026-10-04: it runs by itself while a session is open, holds in a fight — rounds move it —
       and runs in real time or at a speed the GM picks) ---- */
    {
    const ckR = [cleanClock({ t: 5, hold: true, rate: 10 }), cleanClock({ t: 5, hold: 'yes', rate: 1 }), cleanClock({ t: 5, hold: 1, rate: 3 }), cleanClock({ t: 5, rate: '5' }), cleanClock({ t: 5, rate: 60.5 }), cleanClock({ t: 5, hide: true, hold: true, rate: 60, notes: [{ id: nId('a'), day: 1, text: 'N' }] }), cleanClock({ t: 5, rate: NaN }), cleanClock(JSON.parse('{"__proto__": {"hold": true, "rate": 5}, "t": 7}'))];
    check('the running clock, cleaned (cleanClock): the hold only as true and the speed only as 2, 5, 10 or 60 (real time is the absent key), anything else dropped; kept beside the hide flag and the notes, the same cleaned twice; a "__proto__" key is never read',
        j(ckR) === j([{ t: 5, hold: true, rate: 10 }, { t: 5 }, { t: 5 }, { t: 5 }, { t: 5 }, { t: 5, hide: true, hold: true, rate: 60, notes: [{ id: nId('a'), day: 1, text: 'N' }] }, { t: 5 }, { t: 7 }]) && j(cleanClock(ckR[5])) === j(ckR[5]) && j(C.CAL_LIMITS.rates) === j([1, 2, 5, 10, 60]) && Object.isFrozen(C.CAL_LIMITS.rates), j(ckR));
    const lh = o => { const camp = { id: 'k', clock: o.clock || { t: 0 } }; return mkCal(Object.assign({ camp, sys: { calendar: tw } }, o)).api.liveHeld(o.noCamp ? null : camp); };
    const lhGot = { runs: lh({ host: true }), solo: lh({}), hold: lh({ host: true, clock: { t: 0, hold: true } }), holdSolo: lh({ clock: { t: 0, hold: true } }), paused: lh({ host: true, paused: true }), fight: lh({ host: true, combats: { m1: { rows: [] } } }), fightOver: lh({ host: true, combats: { m1: null } }),
        player: lh({ player: true }), stream: lh({ host: true, stream: true }), off: lh({ host: true, on: false }), noCamp: lh({ host: true, noCamp: true }), client: lh({ host: true, role: 'client' }) };
    check('when the clock runs by itself (liveHeld, run for real): only on the GM\'s machine while it hosts a table with the Calendar on — held by the GM\'s own hold (said first, hosting or not), with no table open, while the table is paused and while a fight is on on any map; never on a player\'s app, in the stream window or with no campaign',
        j(lhGot) === j({ runs: '', solo: 'solo', hold: 'hold', holdSolo: 'hold', paused: 'paused', fight: 'fight', fightOver: '', player: 'off', stream: 'off', off: 'off', noCamp: 'off', client: 'solo' }), j(lhGot));
    const mkLive = (o, clock) => { const camp = { id: 'k', clock: clock || { t: 0 }, turnRules: o && o.tr, chars: o && o.chars }, W = mkCal(Object.assign({ camp, sys: { calendar: tw }, host: true }, o || {})); return { camp, W, tick: s => W.api.liveTick(Math.round(s * 1000)) }; };
    const chL1 = () => ({ c_a: { id: 'c_a', name: 'Kael', ownerId: 'u_a' } });
    const L1 = mkLive({ chars: chL1() }), l1 = [L1.tick(1), L1.tick(31), L1.tick(60.9), L1.camp.clock.t, L1.tick(61), L1.camp.clock.t, L1.W.saves.length, L1.W.views.length, L1.W.syncs.length, L1.W.log.length, j(L1.W.game), L1.W.toasts.length, L1.tick(121), L1.camp.clock.t, L1.W.toasts.length, L1.W.saves.length];
    const L2 = mkLive(null, { t: 7 }); L2.tick(1); const l2 = [L2.tick(53.9), L2.tick(54), L2.camp.clock.t, L2.tick(114), L2.camp.clock.t];
    const L3 = mkLive(); L3.tick(1); const l3 = [L3.tick(601), L3.camp.clock.t];
    const L4 = mkLive({ chars: chL1() }, { t: 0, rate: 60 }); L4.tick(1); const l4 = [L4.tick(2), L4.camp.clock.t, L4.tick(3), L4.tick(6.9), L4.camp.clock.t, L4.tick(7), L4.camp.clock.t, j(L4.W.game)];
    const L4b = mkLive(null, { t: 0, rate: 3 }); L4b.tick(1); const l4b = [L4b.tick(21), L4b.tick(61), L4b.camp.clock.t];
    const LE = mkLive(null, { t: C.CAL_LIMITS.time }); LE.tick(1); const le = [LE.tick(61), LE.camp.clock.t === C.CAL_LIMITS.time, LE.W.toasts.length];
    check('the clock runs (liveTick, run for real on a clock of the suite\'s own): a first look only starts the count; a whole game minute is banked as it fills — the table told, timed effects run, the quiet write and no save of the GM\'s own, no Session Log line — and the GM is told once that it runs; a clock off the minute lands on it and stays on whole minutes; two looks ten minutes apart count two minutes; at ×60 a game minute each second, moved at most once in five seconds; a speed that is none is real time; at the end of time nothing moves',
        j(l1) === j([false, false, false, 0, true, 60, 0, 1, 1, 0, '[{"c_a":60}]', 1, true, 120, 1, 0]) && j(l2) === j([false, true, 60, true, 120]) && j(l3) === j([true, 120]) && j(l4) === j([true, 60, false, false, 60, true, 360, '[{"c_a":60},{"c_a":300}]']) && j(l4b) === j([false, true, 60]) && j(le) === j([false, true, 0]), j([l1, l2, l3, l4, l4b, le]));
    const L5 = mkLive(); L5.tick(1); L5.W.win.wpNet.paused = true; const l5a = [L5.tick(61), L5.tick(661), L5.camp.clock.t]; L5.W.win.wpNet.paused = false; const l5b = [L5.tick(662), L5.tick(721.9), L5.camp.clock.t, L5.tick(722), L5.camp.clock.t];
    const L6 = mkLive(); L6.tick(1); L6.W.win.wpNet.combats = { m: { rows: [] } }; const l6a = [L6.tick(61), L6.tick(661), L6.camp.clock.t]; L6.W.win.wpNet.combats = {}; const l6b = [L6.tick(662), L6.tick(722), L6.camp.clock.t];
    const L7 = mkLive(); L7.tick(1); L7.tick(31); const h1 = L7.W.api.setHold(true), h1b = L7.W.api.setHold(true), l7a = [h1, h1b, L7.camp.clock.hold, L7.tick(91), L7.camp.clock.t, L7.W.saves.length, j(L7.W.log)]; const h2 = L7.W.api.setHold(false), l7b = [h2, 'hold' in L7.camp.clock, L7.tick(92), L7.tick(151.9), L7.camp.clock.t, L7.tick(152), L7.camp.clock.t, j(L7.W.log.slice(1))];
    const LS = mkLive({ host: false }); LS.tick(1); const ls = [LS.tick(601), LS.camp.clock.t];
    const LP = mkLive({ host: false, player: true }); LP.tick(1); const lp = [LP.tick(601), LP.camp.clock.t, LP.W.api.setHold(true), LP.W.api.setRate(5), j(LP.camp.clock)];
    const LR = mkLive(), r1 = [LR.W.api.setRate(10), LR.camp.clock.rate, LR.W.api.setRate(10), LR.W.api.setRate(7), LR.W.api.setRate('5'), LR.camp.clock.rate, LR.W.api.setRate(1), 'rate' in LR.camp.clock, LR.W.saves.length];
    check('the clock waits and is held (run for real): a paused table and a fight on any map stop it, and the wait is not counted when it runs again; the GM\'s hold stops it, is stored, saved and said in the Session Log, drops what was counted, and Runs takes the hold away; with no table open, and on a player\'s app, it never moves and takes no hold or speed; a speed is one of the list (10 stored, real time the absent key, 7 and a word refused), saved',
        j(l5a) === j([false, false, 0]) && j(l5b) === j([false, false, 0, true, 60]) && j(l6a) === j([false, false, 0]) && j(l6b) === j([false, true, 60])
        && j(l7a) === j([true, false, true, false, 0, 1, '[["time","The clock is held"]]']) && j(l7b) === j([true, false, false, false, 0, true, 60, '[["time","The clock runs by itself again"]]'])
        && j(ls) === j([false, 0]) && j(lp) === j([false, 0, false, false, '{"t":0}']) && j(r1) === j([true, 10, false, false, false, 10, true, false, 2]), j([l5a, l5b, l6a, l6b, l7a, l7b, ls, lp, r1]));
    // the window's row and the chip's mark
    const LW = mkLive(); LW.W.api.openWin(); const lbtn = () => findN(LW.W.body, 'cal-live-btn'), lsel = () => findN(LW.W.body, 'cal-live-rate')[0], lnote = () => findN(LW.W.body, 'cal-live-note')[0].textContent;
    const w0 = [lbtn().map(b => [b.textContent, b.dataset.act, b.dataset.live, b.className.indexOf('cal-kind-on') >= 0]), lsel().children.map(o => [o.textContent, o.value]), lsel().value, lnote()];
    LW.W.api.onWinClick({ target: lbtn()[1] }); const w1 = [LW.camp.clock.hold, lbtn().map(b => b.className.indexOf('cal-kind-on') >= 0), lnote()];
    LW.W.api.onWinClick({ target: lbtn()[0] }); const w2 = ['hold' in LW.camp.clock, lnote()];
    LW.W.api.onWinChange({ target: Object.assign(lsel(), { value: '5' }) }); const w3 = [LW.camp.clock.rate, lsel().value, lnote()];
    LW.W.api.onWinChange({ target: Object.assign(lsel(), { value: '7' }) }); const w4 = LW.camp.clock.rate;
    LW.W.win.wpNet.paused = true; LW.tick(1); const w5 = lnote(); LW.W.win.wpNet.paused = false; LW.W.win.wpNet.combats = { m: { rows: [] } }; LW.tick(2); const w6 = lnote();
    const soloW = mkLive({ host: false }); soloW.W.api.openWin(); const w7 = findN(soloW.W.body, 'cal-live-note')[0].textContent;
    const plW = mkCal({ camp: { id: 'k', clock: { t: 100 } }, sys: { calendar: tw }, player: true }); plW.api.openWin(); const w8 = [findN(plW.body, 'cal-live').length, findN(plW.body, 'cal-live-btn').length, findN(plW.body, 'cal-live-rate').length];
    const chipOf = W => [findN(W.chip, 'clock-run')[0].textContent, W.chip.title, W.chip.className];
    const LC = mkLive(); LC.W.api.refresh(); const c0 = chipOf(LC.W); LC.W.win.wpNet.paused = true; LC.tick(1); const cP = chipOf(LC.W); LC.W.win.wpNet.paused = false; LC.W.api.setHold(true); const cH = chipOf(LC.W);
    const cS = (() => { const x = mkLive({ host: false }); x.W.api.refresh(); return chipOf(x.W); })(), cPl = (() => { plW.api.refresh(); return chipOf(plW); })();
    const TIP = 'The campaign’s date and time';
    check('the Calendar window\'s clock row and the chip\'s mark (run for real): Runs and Held with the one in force lit, the speeds as a list (Real time, ×2, ×5, ×10, ×60) and a line saying what the clock is doing — running in real time or at its speed, held, waiting for a paused table or a fight, or that no table is open; Held and Runs switch the hold, the list sets the speed and takes none it does not offer; a player\'s window has no such row; the GM\'s chip shows a triangle while it runs, two bars while it waits or is held and nothing with no table, and its tooltip says which; a player\'s chip shows neither',
        j(w0) === j([[['▶ Runs', 'callive', 'run', true], ['⏸ Held', 'callive', 'hold', false]], [['Real time', '1'], ['×2', '2'], ['×5', '5'], ['×10', '10'], ['×60', '60']], '1', 'Running in real time while your table is open.'])
        && j(w1) === j([true, [false, true], 'Held: the clock moves only by your steps and by a fight’s rounds.']) && j(w2) === j([false, 'Running in real time while your table is open.'])
        && j(w3) === j([5, '5', 'Running at ×5 while your table is open: 5 seconds of the game to each second at the table.']) && w4 === 5 && w5 === 'Waiting: the table is paused.' && w6 === 'Waiting: a fight is on. The clock follows the fight furthest behind.'
        && w7 === 'It runs by itself while you host a session: no table is open now.' && j(w8) === j([0, 0, 0])
        && j(c0) === j(['▶', TIP + ', running — click for the calendar', '']) && j(cP) === j(['⏸', TIP + ', waiting — click for the calendar', '']) && j(cH) === j(['⏸', TIP + ', held — click for the calendar', ''])
        && j(cS) === j(['', TIP + ' — click for the calendar', '']) && j(cPl) === j(['', 'The date and time at this table — click for the calendar', '']), j([w0, w1, w2, w3, w4, w5, w6, w7, w8, c0, cP, cH, cS, cPl]));
    // a minute that passes takes nothing half-typed away
    const LI = mkLive(); LI.W.api.openWin(); const amt = findN(LI.W.body, 'cal-any-n')[0], now0 = findN(LI.W.body, 'cal-now')[0]; amt.value = '37'; LI.tick(1); LI.tick(61);
    const inPlace = [findN(LI.W.body, 'cal-any-n')[0] === amt, amt.value, findN(LI.W.body, 'cal-now')[0] === now0, now0.textContent === fmtWhen(tw, 60, false), LI.camp.clock.t];
    LI.camp.clock = { t: 86400 - 60 }; LI.W.api.renderWin(); const amt2 = findN(LI.W.body, 'cal-any-n')[0]; amt2.value = '5'; LI.tick(62); LI.tick(122); const nextDay = [LI.camp.clock.t, findN(LI.W.body, 'cal-any-n')[0] === amt2, findN(LI.W.body, 'cal-is-today').map(b => b.dataset.day)];
    const campPp = { id: 'k', clock: { t: 100 } }, PP = mkCal({ camp: campPp, sys: { calendar: tw }, player: true }); PP.api.openWin(); const pn = findN(PP.body, 'cal-now')[0]; campPp.clock = { t: 160 }; PP.api.refresh(); const pIn = [findN(PP.body, 'cal-now')[0] === pn, pn.textContent === fmtWhen(tw, 160, true)];
    check('a minute that passes redraws only the window\'s date line (run for real): the open window keeps its nodes, so an amount half typed stays; into another day the window is drawn again with that day as today; a player\'s open window takes the host\'s word of the time the same way',
        j(inPlace) === j([true, '37', true, true, 60]) && j(nextDay) === j([86400, false, ['1']]) && j(pIn) === j([true, true]), j([inPlace, nextDay, pIn]));
    // the time rules: live time is Active time
    const charsL = () => ({ c_a: { id: 'c_a', name: 'Pat', ownerId: 'u_a' }, c_n: { id: 'c_n', name: 'Orc', npc: true } });
    const LQ = mkLive({ sys: sysTR, tr: { time: 'confirm' }, chars: charsL() }); LQ.tick(1); for (let s = 61; s <= 3541; s += 60) LQ.tick(s);
    const q0 = [LQ.camp.clock.t, LQ.W.api.st().pend, LQ.W.saves.length, j(LQ.camp.clock.acc)];
    LQ.tick(3601); const pq = LQ.W.api.st().pend, q1 = [LQ.camp.clock.t, !!pq, LQ.W.modal.style.display, LQ.W.toasts.slice(-1)[0], LQ.W.chip.className, LQ.W.saves.length, pq && j(pq.fires), pq && pq.live, /time rules are due/.test(LQ.W.chip.title)];
    LQ.tick(3661); LQ.tick(3721); const q2 = [LQ.camp.clock.t, LQ.W.api.liveSt().livePend, LQ.W.api.st().pend === pq, LQ.W.toasts.filter(t => /Time rules are due/.test(t)).length];
    const q3f = LQ.W.api.ownTime([{ kind: 'fight', ids: ['c_a', 'c_n'], t0: LQ.camp.clock.t, t1: LQ.camp.clock.t + 60, round: 10, rs: 6, words: 'Round 10 on Docks' }]); const q3 = [q3f, LQ.W.api.liveSt().livePend, LQ.W.api.st().pend === pq, LQ.W.runs.length];
    LQ.W.api.openWin(); const q4 = [findN(LQ.W.body, 'cal-pend-head')[0].textContent, findN(LQ.W.body, 'cal-pend-row').map(r => [findN(r, 'cal-pend-tick')[0].checked, findN(r, 'cal-pend-name')[0].textContent])];
    LQ.W.api.onWinClick({ target: findN(LQ.W.body, 'cal-pend-apply')[0] }); const q5 = [JSON.parse(JSON.stringify(LQ.W.runs)), LQ.W.api.st().pend, LQ.W.api.liveSt().livePend, j(LQ.camp.clock.acc), LQ.W.chip.className];

    {   // 159: the clock's own minutes behind a waiting list are said in the open window's line, in place, so a half-typed amount stays
        const LS = mkLive({ sys: sysTR, tr: { time: 'confirm' }, chars: charsL() }); LS.tick(1); for (let s = 61; s <= 3601; s += 60) LS.tick(s);
        LS.W.api.openWin(); const mk = LS.W.body.children[0], amt = findN(LS.W.body, 'cal-any-n')[0]; amt.value = '37'; const s0 = findN(LS.W.body, 'cal-pend-since').map(x => x.textContent).join('|');
        LS.tick(3661); LS.tick(3721); const sn = findN(LS.W.body, 'cal-pend-since')[0], s1 = [s0, sn ? sn.textContent : null, LS.W.body.children[0] === mk, findN(LS.W.body, 'cal-any-n')[0] === amt && amt.value === '37'];
        check('159 the minutes the clock runs behind a waiting list are said in its line as they pass (calendar.js refresh, run for real): an empty line while nothing waits behind it (hidden by the style sheet), then its words, set in place as each minute is counted, the window\'s other nodes and a half-typed amount kept',
            j(s1) === j(['', '2 minutes more has passed since. It is counted once you apply or skip these.', true, true]), j(s1));
    }
    const LA = mkLive({ sys: sysTR, tr: { time: 'auto' }, chars: charsL() }); LA.tick(1); for (let s = 61; s <= 3601; s += 60) LA.tick(s);
    const a1 = [LA.camp.clock.t, JSON.parse(JSON.stringify(LA.W.runs)), LA.W.api.st().pend, LA.W.saves.length, LA.W.modal.style.display, LA.W.views.length > 0];
    const LO = mkLive({ sys: sysTR, tr: { time: 'off' }, chars: charsL() }); LO.tick(1); for (let s = 61; s <= 3601; s += 60) LO.tick(s);
    const o1 = [LO.camp.clock.t, LO.W.runs.length, LO.W.api.st().pend, 'acc' in LO.camp.clock];
    check('time that passes by itself is Active time for the time rules (run for real): under Ask me it is counted minute by minute with no save of the GM\'s own, and the hour that makes a rule due marks the chip and says so once — the window is not opened; the time after that waits (the clock\'s own: the list is never written over) and is counted once the GM answers, while a fight\'s round meanwhile counts at once on top of the list\'s own count (152 fold 4), so nothing counts twice; the list is headed "as the clock ran" and the summary "The clock ran"; Run at once runs every character\'s rules as the hour passes, an NPC\'s too (152 fold 4); Off runs and counts nothing',
        j(q0) === j([3540, null, 0, '{"c_a":{"r_any":3540},"c_n":{"r_any":3540}}'])
        && j(q1) === j([3600, true, 'none', 'Time rules are due: click the date in the header to apply or skip them.', 'clock-due', 0, '[{"c":"c_a","r":"r_any","n":1},{"c":"c_n","r":"r_any","n":1}]', true, true])
        && j(q2) === j([3720, 120, true, 1]) && j(q3) === j([false, 120, true, 0]) && j(q4) === j(['Time rules due — as the clock ran', [[true, 'Pat'], [false, 'Orc']]])
        && j(q5) === j([[[[{ c: 'c_a', r: 'r_any', n: 1 }], 'The clock ran']], null, 0, '{"c_a":{"r_any":180},"c_n":{"r_any":180}}', ''])
        && j(a1) === j([3600, [[[{ c: 'c_a', r: 'r_any', n: 1 }, { c: 'c_n', r: 'r_any', n: 1 }], 'The clock ran']], null, 0, 'none', true]) && j(o1) === j([3600, 0, null, false]), j([q0, q1, q2, q3, q4, q5, a1, o1]));
    // The owed review, 2026-10-09 (backlog 138): what waits belongs to the campaign it was counted in. A list of time rules due, the live time
    // counted behind it and a fight's rounds carried into the next campaign opened: its chip said rules were due, its own rules did not run, and
    // when the GM answered, the hours that had passed in the first campaign were counted in the second. The first fix let them go, which lost a
    // list for good when another campaign was merely looked at (its review): each campaign's is now KEPT for it, and is back when it is
    {
        const campOf = id => ({ id, clock: { t: 0 }, turnRules: { time: 'confirm' }, chars: charsL() }), oS = { camp: campOf('A'), sys: sysTR, host: true }, WS = mkCal(oS), tickS = s => WS.api.liveTick(Math.round(s * 1000)), campA = oS.camp;
        tickS(1); for (let s = 61; s <= 3601; s += 60) tickS(s);                                   // an hour in A: a rule is due, and the list waits
        tickS(3661); tickS(3721); WS.api.moveBy(600);                                              // two minutes more behind it, and a step of ten minutes (152 fold 4: in place of a fight's rounds)
        const pA = WS.api.st().pend, sA = [!!pA, pA && pA.camp, WS.api.liveSt().livePend, WS.api.st().pendQ.length, /clock-due/.test(WS.chip.className)];
        const campB = campOf('B'); oS.camp = campB; WS.api.refresh();                               // another campaign on screen
        const sB = [WS.api.st().pend, WS.api.liveSt().livePend, WS.api.st().pendQ.length, /clock-due/.test(WS.chip.className), /time rules are due/.test(WS.chip.title)];
        const dueSaid = WS.toasts.filter(t => /Time rules are due/.test(t)).length; tickS(3781); tickS(3841);   // B's own minutes: counted from nothing
        const sB2 = [WS.api.st().pend, WS.runs.length, j(campB.clock.acc), WS.toasts.filter(t => /Time rules are due/.test(t)).length === dueSaid, WS.api.st().pendQ.length];
        oS.camp = campA; WS.api.refresh();                                                          // and A again: its list, its minutes and its step are as they were left
        const sA2 = [WS.api.st().pend === pA, WS.api.liveSt().livePend, WS.api.st().pendQ.length, /clock-due/.test(WS.chip.className)];
        oS.camp = null; WS.api.ownTime([]); oS.camp = campA; WS.api.refresh(); const sA3 = [WS.api.st().pend === pA, WS.api.liveSt().livePend];   // no campaign on screen for a moment: nothing is lost
        // a list still drawn from the first campaign, answered after the switch: it is no list here, nothing of it is counted, and it still waits for its own campaign
        const oT = { camp: campOf('A'), sys: sysTR, host: true }, WT = mkCal(oT), tickT = s => WT.api.liveTick(Math.round(s * 1000)), campA2 = oT.camp; tickT(1); for (let s = 61; s <= 3601; s += 60) tickT(s); tickT(3661);
        WT.api.openWin(); const pT = WT.api.st().pend, skipBtn = findN(WT.body, 'cal-pend-skip')[0], campB2 = campOf('B'); oT.camp = campB2; WT.api.onWinClick({ target: skipBtn });
        const sT = [!!skipBtn, WT.api.st().pend, WT.api.liveSt().livePend, WT.runs.length, 'acc' in campB2.clock, findN(WT.body, 'cal-pend-head').length];
        oT.camp = campA2; WT.api.refresh(); const sT2 = [WT.api.st().pend === pT, WT.api.liveSt().livePend];
        // many campaigns looked at with something waiting in each: the kept ones are bounded
        const oM = { camp: campOf('m0'), sys: sysTR, host: true }, WM = mkCal(oM); for (let i = 0; i < 60; i++) { oM.camp = campOf('m' + i); WM.api.moveTo(3600, 'Set', false, false, { ask: true }); WM.api.refresh(); }
        oM.camp = campOf('m59'); WM.api.refresh(); const lastKept = !!WM.api.st().pend; oM.camp = campOf('m0'); WM.api.refresh(); const firstKept = !!WM.api.st().pend;
        check('what waits in the calendar belongs to its campaign (the owed review of 2026-10-09 and the review of its first fix; calendar.js, run for real with a hosting table and a clock of the suite\'s own): with another campaign on screen a list of time rules due in the first, the minutes counted behind it and a step moved on meanwhile (152 fold 4: in place of a fight\'s rounds, which no longer wait) are put aside, so the second campaign\'s chip says nothing is due, its own rules count its own minutes from nothing and nothing runs for hours that passed elsewhere; when the first campaign is back its list is due again, with its minutes and its rounds as they were left, and a moment with no campaign on screen loses nothing; a list still drawn from the first campaign and answered after the switch is no list in the second, counts nothing there and still waits for its own; what is kept for campaigns that are looked at is bounded',
            j(sA) === j([true, 'A', 120, 1, true]) && j(sB) === j([null, 0, 0, false, false]) && sB2[0] === null && sB2[1] === 0 && sB2[2] === '{"c_a":{"r_any":120},"c_n":{"r_any":120}}' && sB2[3] === true && sB2[4] === 0
            && j(sA2) === j([true, 120, 1, true]) && j(sA3) === j([true, 120]) && j(sT) === j([true, null, 0, 0, false, 0]) && j(sT2) === j([true, 60]) && lastKept === true && firstKept === false
            && calJs.includes("function pendFor(camp) {") && (calJs.match(/pendFor\(/g) || []).length === 6, j([sA, sB, sB2, sA2, sA3, sT, sT2, lastKept, firstKept]));
    }
    {   // backlog 152, fold 4 (docs/FIGHT_CLOCK_DESIGN.md 1, 4 to 6; the owner's answer to question 1, "Every character"): each character's own time, the
        // second, Ask me first while a list waits, the Rules run switch, the steps while a fight runs, In a fight with the Calendar off (calendar.js, run for real)
        const sys4 = { calendar: tw, combat: { turn: { secs: 1 } }, rolls: [{ id: 'r_go', label: 'Drain', apply: [], every: { n: 1, u: 'hour' } }, { id: 'r_ask', label: 'Check', apply: [], every: { n: 1, u: 'hour' }, ask: true }, { id: 'r_fgt', label: 'Charge', apply: [], inFight: { n: 2, u: 'round' } }] };
        const chars4 = () => ({ c_a: { id: 'c_a', name: 'Kael', ownerId: 'u_a' }, c_n: { id: 'c_n', name: 'Unit 7', npc: true } });
        const firesOfW = W => W.runs.map(r => [r[0].map(f => f.c + ':' + f.r + (f.x ? ':x' : '') + ':' + f.n), r[1]].concat(r.length > 2 ? [r[2]] : []));
        const cnt = (acc, c, r) => acc && acc[c] && typeof acc[c][r] === 'number' ? acc[c][r] : 0;
        // Ask me first while Run at once: the rule not ticked runs as time passes, a list waits for the one ticked, and its counts are kept through Skip and Apply
        const campA = { id: 'k', clock: { t: 0 }, chars: chars4() }, WA = mkCal({ camp: campA, sys: sys4 }); WA.api.openWin();
        const stepA = txt => WA.api.onWinClick({ target: findN(WA.body, 'cal-step').find(b => b.textContent === txt) });
        stepA('+10 minutes'); stepA('+10 minutes'); stepA('+10 minutes');
        const a0 = [cnt(campA.clock.acc, 'c_a', 'r_go'), cnt(campA.clock.acc, 'c_a', 'r_ask'), cnt(campA.clock.acc, 'c_n', 'r_go'), WA.runs.length, WA.api.st().pend];
        stepA('+1 hour');
        const pA1 = WA.api.st().pend, a1 = [firesOfW(WA), !!pA1, pA1 && pA1.fires.map(f => f.c + ':' + f.r), pA1 && j(pA1.on)];
        stepA('+1 hour'); stepA('+10 minutes');
        const a2 = [firesOfW(WA).length, j(WA.api.st().pendQ), cnt(campA.clock.acc, 'c_a', 'r_go'), cnt(campA.clock.acc, 'c_n', 'r_go'), cnt(campA.clock.acc, 'c_a', 'r_ask')];
        WA.api.onWinClick({ target: findN(WA.body, 'cal-pend-skip')[0] });
        const pA3 = WA.api.st().pend, a3 = [cnt(campA.clock.acc, 'c_a', 'r_go'), cnt(campA.clock.acc, 'c_n', 'r_go'), cnt(campA.clock.acc, 'c_a', 'r_ask'), !!pA3, pA3 && pA3.fires.map(f => f.c + ':' + f.r), WA.api.st().pendQ.length];
        WA.api.onWinClick({ target: findN(WA.body, 'cal-pend-apply')[0] });
        const a4 = [firesOfW(WA).slice(2), cnt(campA.clock.acc, 'c_a', 'r_go'), cnt(campA.clock.acc, 'c_a', 'r_ask'), cnt(campA.clock.acc, 'c_n', 'r_ask'), WA.api.st().pend];
        WA.api.onWinClick({ target: findN(WA.body, 'cal-day')[3] }); findN(WA.body, 'cal-set-h')[0].value = '0'; const runsSet = WA.runs.length; WA.api.onWinClick({ target: findN(WA.body, 'cal-set')[0] });
        const a5 = [WA.runs.length - runsSet, WA.api.st().pend && Array.from(new Set(WA.api.st().pend.fires.map(f => f.r)))];
        check('152 fold 4 a rule ticked Ask me first waits for your word while the others run (calendar.js, run for real): under Run at once a rule with no tick runs as time passes for every character, an NPC too, while the ticked one is listed (Kael ticked, Unit 7 offered); time that passes while the list waits runs the rule with no tick at once and queues the ticked one\'s time alone behind the list; Skip keeps the ticked rule\'s count as the list counted it and never takes back the count the other rule made since; the time queued makes the ticked rule due again, and Apply runs it for the ticked one; a Set forward still lists every rule and runs nothing at once',
            j(a0) === j([1800, 1800, 1800, 0, null])
            && j(a1) === j([[[['c_a:r_go:1', 'c_n:r_go:1'], '1 hour of activity']], true, ['c_a:r_ask', 'c_n:r_ask'], '{"c_a":true,"c_n":false}'])
            && j(a2) === j([2, j([{ s: 4200, r: false, a: false, l: false, k: ['r_ask'] }]), 2400, 2400, 1800])
            && j(a3) === j([2400, 2400, 1800, true, ['c_a:r_ask', 'c_n:r_ask'], 0])
            && j(a4) === j([[[['c_a:r_ask:1'], '1 hour, 10 minutes of activity']], 2400, 2400, 2400, null])
            && j(a5) === j([0, ['r_go', 'r_ask']]), j([a0, a1, a2, a3, a4, a5]));
        // the Rules run switch: an NPC listed in camp.clock.rulesOff has its fires listed unticked, never run by itself; a player's character is never held by it
        const campB = { id: 'k', clock: { t: 0, rulesOff: ['c_n', 'c_a'] }, chars: chars4() }, WB = mkCal({ camp: campB, sys: { calendar: tw, rolls: [sys4.rolls[0]] } }); WB.api.openWin();
        WB.api.onWinClick({ target: findN(WB.body, 'cal-step').find(b => b.textContent === '+1 hour') });
        const pB = WB.api.st().pend, b1 = [firesOfW(WB), pB && pB.fires.map(f => f.c + ':' + f.r), pB && j(pB.on), j(campB.clock.acc || null)];
        WB.api.onWinClick({ target: findN(WB.body, 'cal-pend-skip')[0] }); const b2 = [WB.api.st().pend, j(campB.clock.acc || null), WB.runs.length];
        check('152 fold 4 the GM\'s Rules run switch, off (camp.clock.rulesOff, run for real): an NPC listed there has none of its time rules run by itself, its fires going to the waiting list unticked with their counts kept; a player\'s character named there runs as ever; Skip runs nothing',
            j(b1) === j([[[['c_a:r_go:1'], '1 hour of activity']], ['c_n:r_go'], '{"c_n":false}', 'null']) && j(b2) === j([null, 'null', 1]), j([b1, b2]));
        // while a fight runs the steps, Move and Set move nothing, a press says why, nothing is greyed; with no fight they work as before. 1.5.5 (the release
        // trace, loss 3; moved on purpose): the words name the map that holds the fight, the Docks
        const campF = { id: 'k', clock: { t: 600 }, chars: chars4(), items: { m1: { type: 'map', meta: { title: 'Docks' } } } }, WF = mkCal({ camp: campF, sys: sys4, host: true, combats: { f_docks001: { mapId: 'm1', rows: [] } } }); WF.api.openWin();
        WF.api.onWinClick({ target: findN(WF.body, 'cal-step').find(b => b.textContent === '+1 hour') });
        findN(WF.body, 'cal-any-n')[0].value = '2'; findN(WF.body, 'cal-any-u')[0].value = 'hour'; WF.api.onWinClick({ target: findN(WF.body, 'cal-any-go')[0] });
        WF.api.onWinClick({ target: findN(WF.body, 'cal-day')[4] }); findN(WF.body, 'cal-set-h')[0].value = '3'; WF.api.onWinClick({ target: findN(WF.body, 'cal-set')[0] });
        const SAYS = 'A fight runs on Docks, so the clock follows the fight furthest behind. The steps, Move and Set work again once every fight has ended.';
        const f1 = [campF.clock.t, WF.toasts.slice(), WF.runs.length, findN(WF.body, 'cal-step').every(b => b.disabled !== true) && findN(WF.body, 'cal-any-go')[0].disabled !== true, findN(WF.body, 'cal-live-note')[0].textContent, findN(WF.body, 'cal-round')[0].textContent];
        WF.win.wpNet.combats = {}; WF.api.onWinClick({ target: findN(WF.body, 'cal-step').find(b => b.textContent === '+1 hour') }); const f2 = [campF.clock.t, WF.toasts.length];
        check('152 fold 4 while a fight runs the Calendar\'s steps, Move and Set move nothing, and a press says why in plain words, nothing greyed (calendar.js, run for real); the window says the clock follows the fight furthest behind and that each fight keeps its own time; with no fight running a step works as before',
            j(f1) === j([600, [SAYS, SAYS, SAYS], 0, true, 'Waiting: a fight is on. The clock follows the fight furthest behind.', 'Each fight keeps its own time. Each round adds 1 second, the round\u2019s length from the Combat card\u2019s Turns box. While fights run, the clock shows the fight furthest behind.']) && j(f2) === j([4200, 3]), j([f1, f2]));
        // 1.5.5 (the release trace, loss 3): the refusal names each map that holds a fight by its own title, as text, so a fight forgotten on another map is
        // found: two fights on one map and one on a map whose title is markup, three maps named and then how many more, a map whose title is blank or that
        // is gone, a fight on a map named as a prototype's key; the clock moves nothing in any of them
        const holdsOf = (items, combats) => { const cH = { id: 'k', clock: { t: 600 }, chars: chars4(), items }, WH2 = mkCal({ camp: cH, sys: sys4, host: true, combats }); WH2.api.openWin(); WH2.api.onWinClick({ target: findN(WH2.body, 'cal-step').find(b => b.textContent === '+1 hour') }); return [cH.clock.t, WH2.toasts.slice()]; };
        const mapH = t => ({ type: 'map', meta: { title: t } }), fH = m => ({ mapId: m, rows: [] }), TAIL = ', so the clock follows the fight furthest behind. The steps, Move and Set work again once every fight has ended.';
        const hd = [holdsOf({ m1: mapH('Docks'), m2: mapH(HOSTILE) }, { f_aaaaaaaa: fH('m1'), f_bbbbbbbb: fH('m2'), f_cccccccc: fH('m1') }),
            holdsOf({ m1: mapH('Docks'), m2: mapH('  Pier  '), m3: mapH('Harbour'), m4: mapH('Mill'), m5: mapH('') }, { f_1: fH('m1'), f_2: fH('m2'), f_3: fH('m3'), f_4: fH('m4'), f_5: fH('m5') }),
            holdsOf({ m1: mapH('Docks'), m2: mapH('Pier'), m3: mapH('Harbour'), m4: mapH('Mill') }, { f_1: fH('m1'), f_2: fH('m2'), f_3: fH('m3'), f_4: fH('m4') }),
            holdsOf({ m1: mapH('Docks'), m2: mapH('Pier'), m3: mapH('   ') }, { f_1: fH('m1'), f_2: fH('m3'), f_3: fH('m2') }),
            holdsOf({ m1: mapH('Docks') }, { f_1: fH('mGone') }), holdsOf({ m1: mapH('Docks') }, { f_1: fH('__proto__') }), holdsOf({ m1: mapH('Docks') }, { f_1: fH('m1'), f_2: fH('m1') })];
        const calH = read('system/app/scripts/calendar.js'), ioH = read('system/app/scripts/io.js');
        check('1.5.5 (the release trace, loss 3) while fights run the Calendar\'s refusal names each map that holds one by its own title, as plain text, so a fight forgotten on another map is found (calendar.js fightHolds, run for real): one fight on a map, two fights on one map, fights on two maps (a title that is markup said as the very characters it holds), three maps named and then how many more, a title trimmed, a blank title and a map that is gone or named as a prototype\'s key said as a map with no name; the clock moves in none of them; the words go to the notice alone, which draws them as text',
            j(hd) === j([[600, ['Fights run on Docks and ' + HOSTILE + TAIL]], [600, ['Fights run on Docks, Pier, Harbour and 2 more maps' + TAIL]], [600, ['Fights run on Docks, Pier, Harbour and 1 more map' + TAIL]],
                [600, ['Fights run on Docks, a map with no name and Pier' + TAIL]], [600, ['A fight runs on a map with no name' + TAIL]], [600, ['A fight runs on a map with no name' + TAIL]], [600, ['Fights run on Docks' + TAIL]]])
            && (calH.match(/fightHolds\(/g) || []).length === 2 && calH.includes('&& ordersRun()) { toast(fightHolds(camp)); return; }') && !/FIGHT_HOLDS/.test(calH)
            && ioH.includes("document.getElementById('toastMsg').textContent = msg;"), j(hd));
        // the second (calendar.js second): with the Calendar on it is the clock, on and reaching the dated notes, back only for a correction that keeps the top;
        // it counts no timed effect (ownTime has counted each character already); the Calendar off ('mem'): kept in memory alone, let go with the last fight
        const campS4 = { id: 'k', clock: { t: 43200, notes: [{ id: nId('a'), day: 0, text: 'Noon' }, { id: nId('b'), day: 1, text: 'Dawn' }] }, chars: chars4() }, WS4 = mkCal({ camp: campS4, sys: sys4, host: true });
        const s1 = [WS4.api.second(43203, false, false), campS4.clock.t, WS4.api.second(43201, false, false), campS4.clock.t, WS4.api.second(43201, true, false), campS4.clock.t, j(campS4.clock.top), WS4.api.second(43203, false, false), 'top' in campS4.clock, WS4.api.second(86400, false, true), WS4.toasts.slice(), WS4.log.filter(l => !/^Note reached/.test(l[1])).length, j(WS4.game)];
        const campM = { id: 'k', clock: { t: 500 }, chars: chars4() }, WM4 = mkCal({ camp: campM, sys: sys4, host: true, second: { frame: 'mem', s: 500 } });
        const s2 = [WM4.api.second(505, false, false), campM.clock.t, WM4.api.memSt() && WM4.api.memSt().t];
        WM4.api.ownTime([{ kind: 'fight', ids: ['c_a', 'c_n'], t0: { s: 505 }, t1: { s: 506 }, round: 1, rs: 1, words: 'Round 1 on Docks' }]);
        const s3 = [j(WM4.api.memSt().lived), 'lived' in campM.clock]; WM4.api.second(506, false, true); const s4 = [WM4.api.memSt(), campM.clock.t];
        check('152 fold 4 the second (calendar.js second, run for real): with the Calendar on it moves the clock on, saying a dated note it reaches, with no Session Log line and no timed effect counted; back only for a correction, when the clock keeps the highest second reached as its top, which goes once the clock is past it; with the Calendar off it is kept in memory alone with each character\'s own time, the clock never moved, and let go with the last fight',
            j(s1) === j([true, 43203, false, 43203, true, 43201, '{"s":43203,"ms":0}', true, false, true, ['Today: Dawn'], 0, '[]']) && j(s2) === j([true, 500, 505]) && j(s3) === j([j({ c_a: [506, 0], c_n: [506, 0] }), false]) && j(s4) === j([null, 500]), j([s1, s2, s3, s4]));
        // each character's own time (ownTime): a fight's rounds, In a fight by its rounds with the Calendar off, never By the clock, a fire handed its round;
        // a round lived again counts nothing; the time outside a fight runs the timed effects of those in no fight with the Calendar off too, with no rule
        const campO4 = { id: 'k', clock: { t: 500 }, chars: Object.assign(chars4(), { c_o: { id: 'c_o', name: 'Crane', npc: true } }) }, WO4 = mkCal({ camp: campO4, sys: sys4, host: true, on: false, second: { frame: 'mem', s: 500 } });
        const roundO = i => WO4.api.ownTime([{ kind: 'fight', ids: ['c_a', 'c_n'], t0: { s: 499 + i }, t1: { s: 500 + i }, round: i, rs: 1, words: 'Round ' + i + ' on Docks' }]);
        [1, 2, 3, 4].forEach(roundO); roundO(4); WO4.api.ownTime([{ kind: 'out', ids: ['c_o'], t0: { s: 500 }, t1: { s: 504 } }]);
        const o4 = [firesOfW(WO4), WO4.runs.map(r => r[0].map(f => f.rd)), j(campO4.clock.acc || null), j(WO4.game), WO4.api.st().pend, campO4.clock.t];
        check('152 fold 4 each character\'s own time in a fight (calendar.js ownTime, run for real): with the Calendar off In a fight still counts by the rounds and runs for everyone in it, an NPC too, its fires handed their round, while By the clock counts nothing, ticked Ask me first or not, since it needs the Calendar; the same round lived again counts nothing; time outside a fight runs the timed effects of those in no fight, with no rule; nothing waits and the clock never moves',
            j(o4) === j([[[['c_a:r_fgt:x:1', 'c_n:r_fgt:x:1'], 'Round 2 on Docks', { round: 2 }], [['c_a:r_fgt:x:1', 'c_n:r_fgt:x:1'], 'Round 4 on Docks', { round: 4 }]], [[2, 2], [4, 4]], 'null', j([{ c_o: 4 }]), null, 500]), j(o4));
        // an NPC switched off in a fight: listed unticked with its round, and while a fight runs the window never opens by itself
        const campR4 = { id: 'k', clock: { t: 0, rulesOff: ['c_n'] }, chars: chars4() }, WR4 = mkCal({ camp: campR4, sys: sys4, host: true, combats: { f_docks001: { mapId: 'm1', rows: [] } } });
        [1, 2].forEach(i => WR4.api.ownTime([{ kind: 'fight', ids: ['c_a', 'c_n'], t0: { s: i - 1 }, t1: { s: i }, round: i, rs: 1, words: 'Round ' + i + ' on Docks' }]));
        const pR4 = WR4.api.st().pend, r4 = [firesOfW(WR4), pR4 && pR4.fires.map(f => [f.c, f.r, f.x, f.rd]), pR4 && pR4.words, WR4.modal.style.display, WR4.toasts.slice(-1)[0], /clock-due/.test(WR4.chip.className)];
        check('152 fold 4 in a fight an NPC whose rules are switched off has its fires listed unticked with the round they came from, the others run at once, and while a fight runs the window never opens by itself: the chip and a notice say the rules are due',
            j(r4) === j([[[['c_a:r_fgt:x:1'], 'Round 2 on Docks', { round: 2 }]], [['c_n', 'r_fgt', 1, 2]], 'Round 2 on Docks', 'none', 'Time rules are due: click the date in the header to apply or skip them.', true]), j(r4));
        // the review of fold 4: a rule ticked Ask me first in a fight, with the Calendar on (listed) and off (counted and never run: nothing could give the GM's word)
        const sysFa = { calendar: tw, combat: { turn: { secs: 1 } }, rolls: [{ id: 'r_fa', label: 'Brace', apply: [], inFight: { n: 2, u: 'round' }, ask: true }, { id: 'r_fgt', label: 'Charge', apply: [], inFight: { n: 1, u: 'round' } }] };
        const fightR = (W, i) => W.api.ownTime([{ kind: 'fight', ids: ['c_a', 'c_n'], t0: { s: i - 1 }, t1: { s: i }, round: i, rs: 1, words: 'Round ' + i + ' on Docks' }]);
        const campFa = { id: 'k', clock: { t: 0 }, chars: chars4() }, WFa = mkCal({ camp: campFa, sys: sysFa, host: true, on: false, second: { frame: 'mem', s: 0 }, combats: { f_docks001: { mapId: 'm1', rows: [] } } });
        fightR(WFa, 1); const fa1 = j(campFa.clock.acc || null); fightR(WFa, 2); const fa = [fa1, firesOfW(WFa), j(campFa.clock.acc || null), WFa.api.st().pend, WFa.toasts.length, WFa.notes.map(n => n[0] + ' ' + n[1])];
        const campFb = { id: 'k', clock: { t: 0 }, chars: chars4() }, WFb = mkCal({ camp: campFb, sys: sysFa, host: true, combats: { f_docks001: { mapId: 'm1', rows: [] } } });
        fightR(WFb, 1); fightR(WFb, 2); const pFb = WFb.api.st().pend, fb = [firesOfW(WFb), pFb && pFb.fires.map(f => [f.c, f.r, f.x, f.rd]), pFb && j(pFb.on), WFb.modal.style.display];
        const R1 = [['c_a:r_fgt:x:1', 'c_n:r_fgt:x:1'], 'Round 1 on Docks', { round: 1 }], R2 = [['c_a:r_fgt:x:1', 'c_n:r_fgt:x:1'], 'Round 2 on Docks', { round: 2 }];
        check('152 fold 4 (the review) a rule ticked Ask me first waits for your word in a fight too (calendar.js, run for real): with the Calendar on its fires are listed with their round, Kael ticked and Unit 7 offered, the window not opened, while the rule with no tick runs at each round, and nothing of them goes to the bell but the list\'s own word; with the Calendar off it is counted, a round each, and when it comes due it runs for nobody and its runs wait in the bell, one item for Kael and one for Unit 7, said in a notice once (fold 4b, moved on purpose: it ran for nobody and nothing waited)',
            j(fa) === j([j({ c_a: { x_fa: 1 }, c_n: { x_fa: 1 } }), [R1, R2], 'null', null, 1, ['wait timeask:c_a:r_fa', 'wait timeask:c_n:r_fa']]) && WFb.notes.every(n => !/^timeask/.test(n[1])) && WFb.notes.some(n => n[0] === 'wait' && n[1] === 'time') && j(fb) === j([[R1, R2], [['c_a', 'r_fa', 1, 2], ['c_n', 'r_fa', 1, 2]], '{"c_a":true,"c_n":false}', 'none']), j([fa, fb]));
        // the second moving on while fights run is time outside one for those in none. Since 1.5.7 (the owner, 2026-10-25: "i shouldnt be able to enter
        // combat in a rest time") it passes as Active: Rest cannot be picked while a fight runs (moved on purpose: it passed as the window said)
        const sysRs = { calendar: tw, combat: { turn: { secs: 1, units: [{ key: 'Sec', secs: 1 }] } }, rolls: [{ id: 'r_rst', label: 'Mend', apply: [], every: { n: 2, u: 'Sec', rest: true } }] };
        const campRs = { id: 'k', clock: { t: 0 }, chars: chars4() }, WRs = mkCal({ camp: campRs, sys: sysRs, host: true, combats: { f_docks001: { mapId: 'm1', rows: [] } } }); WRs.api.openWin();
        const outR = i => WRs.api.ownTime([{ kind: 'out', ids: ['c_a', 'c_n'], t0: { s: i - 1 }, t1: { s: i } }]), kindB = k => WRs.api.onWinClick({ target: findN(WRs.body, 'cal-kind-btn').find(b => b.dataset.kind === k) });
        const toastsRs0 = WRs.toasts.length; kindB('rest'); const refusedRs = WRs.toasts.slice(toastsRs0).map(String), kindsRs = findN(WRs.body, 'cal-kind-btn').map(b => b.dataset.kind + (/cal-kind-on/.test(b.className) ? '*' : '')).join(',');
        outR(1); outR(2); outR(3); const rs1 = [firesOfW(WRs), j(campRs.clock.acc || null)];
        check('1.5.7 (moved on purpose from 152 fold 4\'s review) while fights run, time passes as Active (calendar.js, run for real): Rest is refused with a word of why and the window still shows Active, and the time outside a fight counts no rule for rest for anyone in no fight',
            refusedRs.length === 1 && /fight is running/i.test(refusedRs[0]) && kindsRs === 'active*,rest' && j(rs1) === j([[], 'null']), j([refusedRs, kindsRs, rs1]));
        // a time rule that fails never keeps a move of the clock from being saved and told to the table
        const campTh = { id: 'k', clock: { t: 0 }, chars: chars4() }, WTh = mkCal({ camp: campTh, sys: { calendar: tw, rolls: [sys4.rolls[0]] }, host: true });
        WTh.win.wpSheets.runTimeRules = () => { throw new Error('rule failed'); };
        const ceTh = console.error, errTh = []; console.error = e => errTh.push(String(e && e.message || e)); let thrownTh = null;
        try { WTh.api.moveTo(3600, null, true); WTh.api.moveBy(3600); } catch (e) { thrownTh = String(e && e.message || e); } finally { console.error = ceTh; }
        const th = [thrownTh, campTh.clock.t, WTh.syncs.length, WTh.views.length, WTh.saves.length, errTh];
        check('152 fold 4 (the review) a time rule that fails keeps no move of the clock from being saved and told (calendar.js moveTo, run for real): the clock run on an hour by itself is told to the table and written quietly, a step of an hour is saved, and each failure is said as an error, never thrown at the caller',
            j(th) === j([null, 7200, 1, 1, 2, ['rule failed', 'rule failed']]), j(th));
        // 152 fold 4b (the owner's answer 1, 2026-10-19: "a Rules run switch on each NPC, on by default", "placed somewhere easy to use quickly"): the
        // switch read and set in calendar.js alone, its tick beside each NPC in the waiting list, saved in camp.clock.rulesOff (run for real)
        {
            let x4b = ''; try {   // a check of its own that fails as a check where the code is not there
            const sysRr = { calendar: tw, combat: { turn: { secs: 1 } }, rolls: [sys4.rolls[0]] };
            const campRr = { id: 'k', clock: { t: 0 }, turnRules: { time: 'confirm' }, chars: chars4() }, WRr = mkCal({ camp: campRr, sys: sysRr }); WRr.api.openWin();
            const stepRr = txt => WRr.api.onWinClick({ target: findN(WRr.body, 'cal-step').find(b => b.textContent === txt) }), runTicks = () => findN(WRr.body, 'cal-pend-run').map(t => [t.dataset.char, t.checked, t.type]);
            stepRr('+1 hour');
            const rowsRr = findN(WRr.body, 'cal-pend-row').map(r => [findN(r, 'cal-pend-name')[0].textContent, findN(r, 'cal-pend-tick').length, findN(r, 'cal-pend-runs').map(l => [l.tag, l.title.length > 40, walkN(l, x => x.tag === '#text', []).map(x => x.textContent).join('')])]);
            const t0 = runTicks(), savesRr = WRr.saves.length;
            WRr.api.onWinChange({ target: Object.assign(findN(WRr.body, 'cal-pend-run')[0], { checked: false }) });
            const r1 = [j(campRr.clock.rulesOff || null), WRr.saves.length - savesRr, WRr.log.slice(-1)[0], WRr.toasts.slice(-1)[0], runTicks(), WRr.api.rulesRun('c_n'), WRr.api.st().pend.on.c_n];
            WRr.api.onWinClick({ target: findN(WRr.body, 'cal-pend-skip')[0] }); campRr.turnRules.time = 'auto'; stepRr('+1 hour');
            const pRr = WRr.api.st().pend, r2 = [firesOfW(WRr), pRr && pRr.fires.map(f => f.c + ':' + f.r), pRr && j(pRr.on), runTicks()];
            WRr.api.onWinChange({ target: Object.assign(findN(WRr.body, 'cal-pend-run')[0], { checked: true }) });
            const r3 = ['rulesOff' in campRr.clock, WRr.log.slice(-1)[0], runTicks()];
            WRr.api.setRulesRun('c_n', false); const r4 = [runTicks(), j(campRr.clock.rulesOff)];   // set from another place, a token's menu: the open list's tick follows in place
            const sv5 = WRr.saves.length, r5 = [WRr.api.rulesRun('c_a'), WRr.api.rulesRun('c_zz'), WRr.api.rulesRun('__proto__'), WRr.api.rulesRun('constructor'), WRr.api.rulesRun(5), WRr.api.setRulesRun('c_a', false), WRr.api.setRulesRun('c_n', false), WRr.api.setRulesRun('c_zz', false), j(campRr.clock.rulesOff), WRr.saves.length - sv5];
            WRr.api.onWinChange({ target: Object.assign(findN(WRr.body, 'cal-pend-run')[0], { checked: true, dataset: { char: 'c_a' } }) }); const r6 = [j(campRr.clock.rulesOff), findN(WRr.body, 'cal-pend-run')[0].checked];   // a tick naming a player's character changes nothing and is put back
            const otherRr = o => mkCal(Object.assign({ camp: { id: 'k', clock: { t: 0 }, chars: chars4() }, sys: sysRr }, o));
            const longId = 'c_' + 'x'.repeat(30), WLong = otherRr({ camp: { id: 'k', clock: { t: 0 }, chars: Object.assign(chars4(), { [longId]: { id: longId, name: 'Long', npc: true } }) } }), WRo = otherRr({}); WRo.win.wpCanPersistLocal = () => false;
            const capIds = Array.from({ length: 1000 }, (_, i) => 'c_' + i), campCap = { id: 'k', clock: { t: 0, rulesOff: capIds.slice() }, chars: chars4() }, WCap = mkCal({ camp: campCap, sys: sysRr });
            const r7 = [otherRr({ player: true }).api.rulesRun('c_n'), otherRr({ stream: true }).api.rulesRun('c_n'), otherRr({ sys: { calendar: tw, rolls: [{ id: 'r_x', label: 'Plain', formula: '1d6' }] } }).api.rulesRun('c_n'), WRo.api.rulesRun('c_n'), WLong.api.rulesRun(longId), otherRr({}).api.rulesRun('c_n'),
                WCap.api.rulesRun('c_n'), WCap.api.setRulesRun('c_n', false), WCap.toasts.slice(), campCap.clock.rulesOff.length, campCap.clock.rulesOff.indexOf('c_n'), WCap.saves.length];
            check('152 fold 4b the Rules run switch on each NPC (calendar.js rulesRun and setRulesRun, run for real; the owner\'s answer 1: "a Rules run switch on each NPC, on by default"): its tick stands beside each NPC in the waiting list, ticked while its rules run, and never beside a player\'s character; unticked, it writes the NPC into camp.clock.rulesOff, saves, says so in the Session Log under Time and in a notice, and leaves the list\'s own tick as it was; from then on that NPC\'s rules run nothing by themselves, its fire listed unticked while Kael\'s rule runs; ticked again it takes the NPC out and nothing of the key is left; set from another place, the open list\'s tick follows in place; no switch for a player\'s character, a character that is not there, a prototype\'s name, a player\'s app, the stream window, a campaign this machine may not write, a system with no time rule or an id the clock would not keep, and a press there changes nothing; at the cleaner\'s 1000 it says so and keeps what it had',
                j(rowsRr) === j([['Kael', 1, []], ['Unit 7', 1, [['label', true, ' Rules run']]]]) && j(t0) === j([['c_n', true, 'checkbox']])
                && j(r1) === j([j(['c_n']), 1, ['time', 'Unit 7\u2019s time rules no longer run by themselves.'], 'Unit 7\u2019s time rules no longer run by themselves.', [['c_n', false, 'checkbox']], false, false])
                && j(r2) === j([[[['c_a:r_go:1'], '1 hour of activity']], ['c_n:r_go'], '{"c_n":false}', [['c_n', false, 'checkbox']]])
                && j(r3) === j([false, ['time', 'Unit 7\u2019s time rules run by themselves again.'], [['c_n', true, 'checkbox']]]) && j(r4) === j([[['c_n', false, 'checkbox']], j(['c_n'])])
                && j(r5) === j([null, null, null, null, null, false, false, false, j(['c_n']), 0]) && j(r6) === j([j(['c_n']), false])
                && j(r7) === j([null, null, null, null, null, true, true, false, ['At most 1000 NPCs can have their time rules switched off.'], 1000, -1, 0]), j([rowsRr, t0, r1, r2, r3, r4, r5, r6, r7]));
            } catch (e) { x4b = String(e && e.stack || e); }
            if (x4b) check('152 fold 4b the Rules run switch on each NPC (calendar.js rulesRun and setRulesRun, run for real) could be run', false, x4b);
        }
        // 152 fold 4b (the owner's answer 4, 2026-10-20, by prompt: "In the bell (Recommended)"): with the Calendar off a rule ticked Ask me first that comes
        // due in a fight waits in the bell, one item a character and rule with its count, Apply running it in the round it came due and Skip letting it go
        {
            let y4b = ''; try {   // a check of its own that fails as a check where the code is not there
            const sysB = { calendar: tw, combat: { turn: { secs: 1 } }, rolls: [{ id: 'r_fa', label: 'Brace', apply: [], inFight: { n: 2, u: 'round' }, ask: true }, { id: 'r_fgt', label: 'Charge', apply: [], inFight: { n: 1, u: 'round' } }] };
            const campB4 = { id: 'k', clock: { t: 0 }, chars: chars4() }, WB4 = mkCal({ camp: campB4, sys: sysB, host: true, on: false, second: { frame: 'mem', s: 0 }, combats: { f_docks001: { mapId: 'm1', rows: [] } } });
            const fr = i => WB4.api.ownTime([{ kind: 'fight', ids: ['c_a', 'c_n'], t0: { s: i - 1 }, t1: { s: i }, round: i, rs: 1, words: 'Round ' + i + ' on Docks' }]);
            const K = WB4.win.wpNoticeKinds.timeask, keyA = 'timeask:c_a:r_fa', keyN = 'timeask:c_n:r_fa', TOLD = 'Time rules wait for your word. Apply or skip them in the bell in the top row.';
            fr(1); fr(2);
            const b1 = [WB4.notes.slice(), WB4.toasts.slice(), firesOfW(WB4).length, WB4.api.st().pend, [K.label, K.altLabel, K.stay, typeof K.run, typeof K.alt, typeof K.tip, typeof K.altTip, K.only], K.still(keyA), K.still(keyN), K.still('timeask:c_a:r_fgt'), K.still('nope'), K.still(5)];
            fr(3); fr(4); const b2 = [WB4.notes.slice(b1[0].length), WB4.toasts.length];
            const accB = j(campB4.clock.acc || null), runsB = WB4.runs.length;
            K.run(keyA); const b3 = [WB4.runs.slice(runsB).map(r => [r[0].map(f => [f.c, f.r, f.x, f.n, f.rd]), r[1]]), WB4.notes.slice(-1)[0], K.still(keyA), j(campB4.clock.acc || null) === accB];
            K.alt(keyN); const b4 = [WB4.runs.length - runsB, WB4.notes.slice(-1)[0], K.still(keyN), j(campB4.clock.acc || null) === accB];
            K.run(keyA); K.alt(keyN); const b5 = [WB4.runs.length - runsB, WB4.notes.slice(-2)];   // nothing is left to run or let go: the bell is told it is done
            fr(5); fr(6); const b6 = [K.still(keyA), K.still(keyN), WB4.toasts.length], runs6 = WB4.runs.length; delete campB4.chars.c_n; const b7 = [K.still(keyN), K.still(keyA), WB4.api.bellDone(keyN, true), WB4.runs.length - runs6];
            const b8 = [!/timeask|waits for your word/.test(j(campB4)), j(Object.keys(campB4.clock).sort()), (() => {   // 152 fold 4b's review: a player's app makes nothing and answers nothing, an item there or not (the GM's machine, then the same machine as a player's app)
                const campP = { id: 'k', clock: { t: 0 }, chars: chars4() }, WPl = mkCal({ camp: campP, sys: sysB, host: true, on: false, second: { frame: 'mem', s: 0 } }), fP = [{ c: 'c_a', r: 'r_fa', n: 1, x: 1, rd: 2 }];
                WPl.win.wpNet.foreign = true; const upP = WPl.api.bellUp(campP, sysB, fP, 'Round 2 on Docks');
                WPl.win.wpNet.foreign = false; const upG = WPl.api.bellUp(campP, sysB, fP, 'Round 2 on Docks');
                WPl.win.wpNet.foreign = true; const doneP = [WPl.api.bellDone(keyA, true), WPl.runs.length, WPl.api.bellStill(keyA), WPl.notes.filter(n => n[0] === 'done').length];
                WPl.win.wpNet.foreign = false; const doneG = [WPl.api.bellDone(keyA, true), WPl.runs.length];
                return [upP, upG, doneP, doneG];
            })()];
            const campOne = { id: 'k', clock: { t: 0 }, chars: chars4() }, WOne = mkCal({ camp: campOne, sys: sysB, host: true, on: false, second: { frame: 'mem', s: 0 } }), b9 = [WOne.api.bellUp(campOne, sysB, [{ c: 'c_a', r: 'r_fa', n: 1, x: 1, rd: 3 }, { c: 'c_a', r: 'r_fa', n: 2, x: 1, rd: 3 }, { c: 'c_a', r: 'r_fa', n: 0 }, null, { c: 5, r: 'r_fa', n: 1 }], 'Round 3 on Docks'), WOne.notes.map(n => n[2])];
            check('152 fold 4b with the Calendar off a rule ticked Ask me first waits in the bell (calendar.js bellUp, bellStill and bellDone, run for real; the owner\'s answer 4: "In the bell"): when it comes due in a fight each character\'s run waits under its own item, in its words, with the round it came due, said in a notice once; the kind is Apply with Skip beside it, which keep the list up; a run that comes due again joins its item and its count, said anew; Apply runs what waited through runTimeRules, each run in the round it came due, and the item goes; Skip lets it go and runs nothing; neither moves a count; with nothing left neither does anything but tell the bell it is done; an item whose character is gone goes with it; nothing of it is stored on the campaign; a player\'s app makes nothing and answers nothing, an item there or not; runs of the same round join, and a run that is no run is passed over',
                j(b1) === j([[['wait', keyA, 'Kael: Brace waits for your word. 1 run, due in Round 2 on Docks.', 'timeask', keyA], ['wait', keyN, 'Unit 7: Brace waits for your word. 1 run, due in Round 2 on Docks.', 'timeask', keyN]], [TOLD], 2, null, ['Apply', 'Skip', true, 'function', 'function', 'string', 'string', true], true, true, false, false, false])
                && j(b2) === j([[['wait', keyA, 'Kael: Brace waits for your word. 2 runs, the first due in Round 2 on Docks.', 'timeask', keyA], ['wait', keyN, 'Unit 7: Brace waits for your word. 2 runs, the first due in Round 2 on Docks.', 'timeask', keyN]], 1])
                && j(b3) === j([[[[['c_a', 'r_fa', 1, 1, 2], ['c_a', 'r_fa', 1, 1, 4]], 'Since Round 2 on Docks']], ['done', keyA], false, true]) && j(b4) === j([1, ['done', keyN], false, true])
                && j(b5) === j([1, [['done', keyA], ['done', keyN]]]) && j(b6) === j([true, true, 2]) && j(b7) === j([false, true, false, 0])
                && j(b8) === j([true, j(['t']), [false, true, [false, 0, true, 0], [true, 1]]]) && j(b9) === j([true, ['Kael: Brace waits for your word. 3 runs, the first due in Round 3 on Docks.']]), j([b1, b2, b3, b4, b5, b6, b7, b8, b9]));
            } catch (e) { y4b = String(e && e.stack || e); }
            if (y4b) check('152 fold 4b with the Calendar off a rule ticked Ask me first waits in the bell (calendar.js, run for real) could be run', false, y4b);
        }
        // 152 fold 4b's review (run for real): a character with no player yet is no NPC, by its sheet's own NPC tick as the Characters section reads it,
        // so it has no Rules run switch and an id of its in camp.clock.rulesOff holds nothing; an NPC switched off runs nothing by itself with the Calendar
        // off, but a rule of its ticked Ask me first still waits in the bell, as Help and both notes now say; and a list that still waits once the Calendar
        // is switched off says, from the bell, how to reach it, where its Open did nothing
        {
            let r4r = ''; try {   // a check of its own that fails as a check where the code is not there
            const sysU = { calendar: tw, combat: { turn: { secs: 1 } }, rolls: [sys4.rolls[0]] };
            const campU = { id: 'k', clock: { t: 0, rulesOff: ['c_u', 'c_v', 'c_n'] }, chars: Object.assign(chars4(), { c_u: { id: 'c_u', name: 'Mira', ownerId: '', npc: false }, c_v: { id: 'c_v', name: 'Vex' } }) }, WU = mkCal({ camp: campU, sys: sysU });
            const u1 = [WU.api.rulesRun('c_u'), WU.api.rulesRun('c_v'), WU.api.rulesRun('c_n'), WU.api.setRulesRun('c_u', true), WU.api.setRulesRun('c_v', false), j(campU.clock.rulesOff), WU.saves.length];
            WU.api.moveBy(3600); const pU = WU.api.st().pend, u2 = [firesOfW(WU), pU && pU.fires.map(f => f.c + ':' + f.r), findN(WU.body, 'cal-pend-run').map(t => t.dataset.char)];
            const sysF3 = { calendar: tw, combat: { turn: { secs: 1 } }, rolls: [{ id: 'r_fa', label: 'Brace', apply: [], inFight: { n: 2, u: 'round' }, ask: true }, { id: 'r_fgt', label: 'Charge', apply: [], inFight: { n: 1, u: 'round' } }] };
            const campF3 = { id: 'k', clock: { t: 0, rulesOff: ['c_n'] }, chars: chars4() }, WF3 = mkCal({ camp: campF3, sys: sysF3, host: true, on: false, second: { frame: 'mem', s: 0 }, combats: { f_docks001: { mapId: 'm1', rows: [] } } });
            [1, 2].forEach(i => WF3.api.ownTime([{ kind: 'fight', ids: ['c_a', 'c_n'], t0: { s: i - 1 }, t1: { s: i }, round: i, rs: 1, words: 'Round ' + i + ' on Docks' }]));
            const f3 = [firesOfW(WF3), WF3.notes.map(n => n[0] + ' ' + n[1]), WF3.api.st().pend];
            const oS = { camp: { id: 'k', clock: { t: 0 }, turnRules: { time: 'confirm' }, chars: chars4() }, sys: sysU }, WS = mkCal(oS); WS.api.moveBy(3600);
            const s1 = [!!WS.api.st().pend, WS.modal.style.display]; WS.api.closeWin(); oS.on = false;
            const TK = WS.win.wpNoticeKinds.time, tN = WS.toasts.length; TK.run(); const s2 = [TK.still(), WS.modal.style.display, WS.toasts.slice(tN)];
            oS.on = true; TK.run(); const s3 = [WS.modal.style.display, WS.toasts.length - tN];
            const ixR = read('system/app/index.html'), wnR = read('WHATSNEW.txt'), waR = read('system/app/assets/whatsnew.txt');
            const NOTE = '  With the Calendar switched off they are let go, but a rule ticked' + NL + '  Ask me first still waits in the bell. You find the switch on the' + NL, NOTE2 = '  it came due, and Skip lets it go. It stays in the bell until you' + NL + '  apply or skip it.' + NL;
            const words = [ixR.includes('<li><b>Rules run</b> is a switch on each NPC, on until you switch it off. Off, its time rules never run by themselves, in a fight or out of one. Its runs wait unticked in the list. With the Calendar off they are let go, but a rule ticked <b>Ask me first</b> still waits in the bell. You find the switch on its token&rsquo;s right-click menu, on its row&rsquo;s menu under <b>Characters</b>, and beside it in the list.</li>'),
                ixR.includes('<b>Apply</b> runs it in the round it came due, and <b>Skip</b> lets it go. It stays in the bell until you apply or skip it.</li>'), !ixR.includes('Switch it on its token'), [wnR, waR].every(w => w.includes(NOTE) && w.includes(NOTE2) && !w.includes("  Switch it on the NPC's token"))];
            check('152 fold 4b\'s review a character with no player yet is no NPC (calendar.js rulesRun and offOf, run for real): it has no Rules run switch and its id in camp.clock.rulesOff holds nothing, so its rules run as a player\'s character\'s do while the NPC switched off is listed unticked with its switch beside it; with the Calendar off an NPC switched off runs nothing by itself, but its rule ticked Ask me first still waits in the bell, as Help and both release notes say; and a list that still waits once the Calendar is switched off is said, from the bell, to wait in the Calendar until it is switched on, the window opening again once it is',
                j(u1) === j([null, null, false, false, false, j(['c_u', 'c_v', 'c_n']), 0]) && j(u2) === j([[[['c_a:r_go:1', 'c_u:r_go:1', 'c_v:r_go:1'], '1 hour of activity']], ['c_n:r_go'], ['c_n']])
                && j(f3) === j([[[['c_a:r_fgt:x:1'], 'Round 1 on Docks', { round: 1 }], [['c_a:r_fgt:x:1'], 'Round 2 on Docks', { round: 2 }]], ['wait timeask:c_a:r_fa', 'wait timeask:c_n:r_fa'], null])
                && j(s1) === j([true, 'flex']) && j(s2) === j([true, 'none', ['These time rules wait in the Calendar, which is switched off. Switch it on in Settings \u25b8 VTT features to apply or skip them.']]) && j(s3) === j(['flex', 1])
                && words.every(w => w === true), j([u1, u2, f3, s1, s2, s3, words]));
            } catch (e) { r4r = String(e && e.stack || e); }
            if (r4r) check('152 fold 4b\'s review a character with no player yet is no NPC (calendar.js, run for real) could be run', false, r4r);
        }
    }
    {   // 1.5.5 (the owner, 2026-10-23, of a droid's sleep draw taken only where it slept at the moment each day began: "everything needs to be accounted
        // for, no shortcuts"): a time rule's By the clock or In a fight ticked Only while its needs hold (whileNeeds) counts only the time its needs hold.
        // The pure core (calendarcore ruleFires' ninth argument), the judge (systemcore needsHeld) and the window (calendar.js ownTime and needsAt, the
        // time kept behind a list and its answer, the clock's own minutes, a fight's round), each run for real, in a scope of their own; each check runs
        // on its own, so one that throws is a failure of its own and the others still run
        const tcH = (name, fn) => { let r; try { r = fn(); } catch (e) { r = [false, String(e && e.stack || e)]; } check(name, r[0] === true, r[1]); };
        const RF = C.ruleFires, stripH = rs => JSON.parse(j(rs), (k, v) => k === 'whileNeeds' ? undefined : v);
        // (1) the core
        tcH('1.5.5 Only while its needs hold, the core (calendarcore ruleFires, run for real over 400 seeded stretches, in a fight and out of one, rest and activity, one stretch or each character\'s own): with no judge, with a judge that is no function, with one that says the whole stretch or more than it, the counts and fires are byte for byte what the same rules give with the tick taken off, so a system with no tick counts as it did; and a judge that says none of it is heard, so the tick is no word that changes nothing', () => {
            let sdH = 155023; const rnH = n => { sdH = (sdH * 1103515245 + 12345) % 2147483648; return Math.floor(sdH / 2147483648 * n); }, pkH = a => a[rnH(a.length)];
            const mkRH = i => { const r = { id: 'r_q' + i }; if (rnH(3)) r.every = { n: pkH([1, 2, 5]), u: pkH(['min', 'hour', 'day']), rest: pkH([true, undefined]), wait: pkH([true, undefined]), whileNeeds: pkH([true, undefined, 'yes']) }; if (rnH(2)) r.inFight = { n: pkH([1, 3]), u: pkH(['round', 'min']), whileNeeds: pkH([true, undefined]) }; return r; };
            const diffH = []; let tickedH = 0, heardH = 0;
            for (let i = 0; i < 400; i++) {
                const rules = Array.from({ length: 1 + rnH(4) }, (_, k) => mkRH(i * 10 + k)), ids = ['c_a', 'c_b', 'c_c'].slice(0, 1 + rnH(3)), acc = {};
                ids.forEach(c => { if (rnH(2)) { acc[c] = {}; rules.forEach(r => { if (rnH(2)) acc[c][r.id] = 1 + rnH(5000); if (rnH(3) === 0) acc[c]['x_' + r.id.slice(2)] = 1 + rnH(20); }); } });
                const secs = rnH(3) ? pkH([60, 3600, 86400, 90000, 0.5]) : { c_a: pkH([60, 7, 86400]), c_b: pkH([1, 3600]) }, rest = rnH(2) === 0, o = pkH([undefined, { fight: false }, { fight: true, rs: 6 }, { fight: true, rs: 0.1 }]);
                if (rules.some(r => (r.every && r.every.whileNeeds === true) || (r.inFight && r.inFight.whileNeeds === true))) tickedH++;
                const base = j(RF(tw, [], stripH(rules), ids, acc, secs, rest, o)), seen = [j(RF(tw, [], rules, ids, acc, secs, rest, o)), j(RF(tw, [], rules, ids, acc, secs, rest, o, () => true)), j(RF(tw, [], rules, ids, acc, secs, rest, o, 'judge')), j(RF(tw, [], rules, ids, acc, secs, rest, o, () => 1e12))];
                if (seen.some(s => s !== base)) diffH.push([i, base, seen]);
                if (j(RF(tw, [], rules, ids, acc, secs, rest, o, () => false)) !== base) heardH++;
            }
            return [diffH.length === 0 && tickedH > 100 && heardH > 40, j([diffH.slice(0, 2), tickedH, heardH])];
        });
        const rS = [{ id: 'r_sl', every: { n: 1, u: 'day', whileNeeds: true } }, { id: 'r_pl', every: { n: 1, u: 'hour' } }];
        tcH('1.5.5 Only while its needs hold, the core: a count the judge says did not hold stands still, never cleared and never begun (its 100 seconds kept, none made for another character), while a count with no tick counts on; a number counts that many seconds, held to the stretch; true the whole stretch; anything else, and a judge that throws, none of it; a rule every day whose needs hold one stretch of eight hours in three runs once three such stretches have passed, however they were broken up; each character\'s own stretch counts the part in whole milliseconds', () => {
            const sNo = RF(tw, [], rS, ['c_a', 'c_b'], { c_a: { r_sl: 100 } }, 86400, false, undefined, () => false);
            const partsH = [3600, 1e9, true, -5, NaN, 'x', {}, null, false].map(v => { const r = RF(tw, [], rS.slice(0, 1), ['c_a'], { c_a: { r_sl: 100 } }, 86400, false, undefined, () => v); return [r.acc.c_a ? r.acc.c_a.r_sl : 0, r.fires.length]; });
            const thrownH = RF(tw, [], rS.slice(0, 1), ['c_a'], { c_a: { r_sl: 100 } }, 86400, false, undefined, () => { throw new Error('no'); });
            let accD = {}; const firesD = []; for (let i = 0; i < 9; i++) { const r = RF(tw, [], rS.slice(0, 1), ['c_a'], accD, 28800, false, undefined, () => i % 3 === 0); accD = r.acc; firesD.push(r.fires.length); }
            const msH = RF(tw, [], [{ id: 'r_q', every: { n: 1, u: 'min', whileNeeds: true } }], ['c_a'], {}, { c_a: 10 }, false, { fight: false }, () => 0.0015);
            return [j(sNo) === j({ fires: [{ c: 'c_a', r: 'r_pl', n: 24 }, { c: 'c_b', r: 'r_pl', n: 24 }], acc: { c_a: { r_sl: 100 } } })
                && j(partsH) === j([[3700, 0], [100, 1], [100, 1], [100, 0], [100, 0], [100, 0], [100, 0], [100, 0], [100, 0]]) && j(thrownH) === j({ fires: [], acc: { c_a: { r_sl: 100 } } })
                && j(firesD) === j([0, 0, 0, 0, 0, 0, 1, 0, 0]) && j(accD) === j({}) && j(msH.acc) === j({ c_a: { r_q: 0.002 } }), j([sNo, partsH, thrownH, firesD, accD, msH])];
        });
        tcH('1.5.5 Only while its needs hold, the core: the judge is asked of a ticked count alone, and only where it counts in that stretch, with the character, the rule and whether it is the In a fight count: never of a count with no tick, of a rest-only count that activity clears, of a By the clock count that waits in a fight, nor of an In a fight count out of a fight', () => {
            const rA = [{ id: 'r_sl', every: { n: 1, u: 'day', whileNeeds: true } }, { id: 'r_dr', every: { n: 1, u: 'hour', rest: true, whileNeeds: true } }, { id: 'r_pl', every: { n: 1, u: 'hour' } }, { id: 'r_fi', every: { n: 1, u: 'hour', wait: true, whileNeeds: true }, inFight: { n: 2, u: 'round', whileNeeds: true } }];
            const callsA = [], spyA = (c, r, fx) => { callsA.push(c + ':' + r.id + ':' + fx); return true; };
            RF(tw, [], rA, ['c_a'], {}, 600, false, undefined, spyA); callsA.push('|'); RF(tw, [], rA, ['c_a'], {}, 600, true, undefined, spyA); callsA.push('|');
            RF(tw, [], rA, ['c_a'], {}, { c_a: 12 }, false, { fight: true, rs: 6 }, spyA); callsA.push('|'); RF(tw, [], rA, ['c_a'], {}, { c_a: 12 }, false, { fight: false }, spyA);
            return [j(callsA) === j(['c_a:r_sl:false', 'c_a:r_fi:false', '|', 'c_a:r_sl:false', 'c_a:r_dr:false', 'c_a:r_fi:false', '|', 'c_a:r_sl:false', 'c_a:r_fi:true', '|', 'c_a:r_sl:false', 'c_a:r_fi:false']), j(callsA)];
        });

        // (2) the judge (systemcore needsHeld), with the sheet's own resolver
        const rawJ = { v: 1, name: 'Droids', calendar: tw, combat: { turn: { secs: 6 } }, fields: [{ id: 'f_sl', key: 'Asleep', kind: 'toggle' }, { id: 'f_ch', key: 'Charging', kind: 'toggle' }, { id: 'f_pp', key: 'PP', kind: 'resource', maxFormula: '10', def: 'max', min: 0 }, { id: 'f_fx', key: 'Fx', kind: 'effects' }],
            effects: [{ id: 'e_nap', name: 'Nap', mods: [{ f: 'f_sl', op: 'on' }] }],
            rolls: [{ id: 'r_sl', label: 'Sleep draw', apply: [{ f: 'f_pp', formula: '1' }], needs: 'Asleep', every: { n: 1, u: 'day', whileNeeds: true } },
                { id: 'r_ch', label: 'Charge', apply: [{ f: 'f_pp', formula: '1', add: true }], needs: 'Charging', every: { n: 1, u: 'hour', whileNeeds: true }, inFight: { n: 1, u: 'round', whileNeeds: true } },
                { id: 'r_r3', label: 'Late', apply: [{ f: 'f_pp', formula: '1' }], needs: 'CombatRound > 2', every: { n: 1, u: 'hour', whileNeeds: true }, inFight: { n: 1, u: 'round', whileNeeds: true } },
                { id: 'r_bd', label: 'Typo', apply: [{ f: 'f_pp', formula: '1' }], needs: 'Asleeep > 0', every: { n: 1, u: 'hour', whileNeeds: true } }] };
        const sysJ = S.cleanSystem(rawJ, { F, gmView: true }), RJ = id => sysJ.rolls.find(r => r.id === id), NOW = 5e12;
        const nap = (left, more) => [Object.assign({ id: 'x1', ref: 'e_nap', on: true, t: { left: left, at: 0 } }, more || {})];
        const hJ = (ch, asks, secs, o) => S.needsHeld(sysJ, ch, asks, F, secs, o), aSl = [{ key: 'r_sl', rule: RJ('r_sl'), fight: false }];
        tcH('1.5.5 the judge (systemcore needsHeld, run for real with the sheet\'s own resolver): a stretch counts whole where the needs hold as the character stands and none of it where they do not; outside a fight it is judged again at each moment a timed effect of the character runs out, so a nap of 8 hours counts 8 hours of a day, a paused one the whole day, one already running its last hour an hour, one switched off none, and two that end at one and two hours two hours; without that the stretch is judged at its start alone; a lazy resolver shared as runTimeRules shares one and the sheet worked out whole agree; the character is never changed', () => {
            const chJ = { up: { id: 'c_up', values: {} }, sl: { id: 'c_sl', values: { f_sl: true } }, nap8: { id: 'c_n8', values: { f_fx: nap(28800) } }, napP: { id: 'c_np', values: { f_fx: [{ id: 'x1', ref: 'e_nap', on: true, t: { left: 100, at: 0, p: 1 } }] } },
                napR: { id: 'c_nr', values: { f_fx: nap(7200, { t: { left: 7200, at: NOW - 3600 * 1000 } }) } }, napOff: { id: 'c_no', values: { f_fx: nap(28800, { on: false }) } }, two: { id: 'c_2', values: { f_fx: [{ id: 'x1', ref: 'e_nap', on: true, t: { left: 3600, at: 0 } }, { id: 'x2', name: 'Doze', on: true, mods: [{ f: 'f_sl', op: 'on' }], t: { left: 7200, at: 0 } }] } } };
            const keepJ = j(chJ), flatJ = S.chainsShallow(sysJ, F), rowsJ = ['up', 'sl', 'nap8', 'napP', 'napR', 'napOff', 'two'].map(k => [true, false].map(sp => [true, false].map(fl => hJ(chJ[k], aSl, 86400, { split: sp, flat: fl, now: NOW }).r_sl)));
            return [flatJ === true && j(rowsJ) === j([[[0, 0], [0, 0]], [[86400, 86400], [86400, 86400]], [[28800, 28800], [86400, 86400]], [[86400, 86400], [86400, 86400]], [[3600, 3600], [86400, 86400]], [[0, 0], [0, 0]], [[7200, 7200], [86400, 86400]]]) && j(chJ) === keepJ, j(rowsJ)];
        });
        tcH('1.5.5 the judge: an In a fight count reads CombatRound as the round its runs read (round 3 holds where round 2 does not), a By the clock count reads it as 0, as its runs do; a needs formula that cannot be worked out holds for none of the stretch, flat or not; a rule with no needs holds throughout; an ask with a key that is no count\'s, a rule that is no object or no ask at all is left out; no stretch, no system, character or formula engine, or asks that are no list: nothing held; the answer to the millisecond', () => {
            const aAll = [{ key: 'r_ch', rule: RJ('r_ch'), fight: false }, { key: 'x_ch', rule: RJ('r_ch'), fight: true }, { key: 'r_r3', rule: RJ('r_r3'), fight: false }, { key: 'x_r3', rule: RJ('r_r3'), fight: true }, { key: 'r_bd', rule: RJ('r_bd'), fight: false }, { key: 'r_no', rule: { id: 'r_no' }, fight: false }];
            const chC = { id: 'c_c', values: { f_ch: true } }, rdJ = [3, 2, undefined, 'x'].map(rd => [true, false].map(fl => hJ(chC, aAll, 6, { round: rd, flat: fl, now: NOW })));
            const odd = [hJ(chC, aAll.concat([{ key: '__proto__', rule: RJ('r_ch') }, { key: 'not a key', rule: RJ('r_ch') }, { key: 'r_zz', rule: 'r_ch' }, null]), 6, {}), hJ(chC, aSl, 0, {}), hJ(chC, aSl, -5, {}), hJ(chC, aSl, NaN, {}), hJ(chC, aSl, '6', {}),
                S.needsHeld(null, chC, aSl, F, 6, {}), S.needsHeld(sysJ, null, aSl, F, 6, {}), S.needsHeld(sysJ, chC, aSl, null, 6, {}), hJ(chC, 'asks', 6, {}), hJ({ id: 'c_s', values: { f_sl: true } }, aSl, 2.0004, null)];
            return [j(rdJ[0][0]) === j({ r_ch: 6, x_ch: 6, r_r3: 0, x_r3: 6, r_bd: 0, r_no: 6 }) && j(rdJ[1][0]) === j({ r_ch: 6, x_ch: 6, r_r3: 0, x_r3: 0, r_bd: 0, r_no: 6 }) && j(rdJ[2][0]) === j(rdJ[1][0]) && j(rdJ[3][0]) === j(rdJ[1][0]) && rdJ.every(p => j(p[0]) === j(p[1]))
                && j(odd[0]) === j(rdJ[2][0]) && !Object.prototype.hasOwnProperty.call(odd[0], '__proto__') && j(odd.slice(1, 5)) === j([{ r_sl: 0 }, { r_sl: 0 }, { r_sl: 0 }, { r_sl: 0 }]) && j(odd.slice(5, 9)) === j([{ r_sl: 0 }, { r_sl: 0 }, { r_sl: 0 }, {}]) && j(odd[9]) === j({ r_sl: 2 }), j([rdJ, odd])];
        });
        tcH('1.5.5 the judge where chainsShallow fails: a needs formula that a lazy resolver cannot work out (a chain of 70 formulas, past the engine\'s depth) but the sheet worked out whole can is read through resolveAll, as timeRuleRun\'s run reads it there, so the two agree (systemcore rollNeedsOk\'s more, asked only then; a more that gives no resolver or throws: as before)', () => {
            const deepF = Array.from({ length: 70 }, (_, i) => ({ id: 'f_d' + i, key: 'C' + i, kind: 'formula', formula: i === 0 ? '1' : 'C' + (i - 1) + ' + 1' }));
            const sysD = S.cleanSystem({ v: 1, name: 'Deep', fields: deepF, rolls: [{ id: 'r_dp', label: 'Deep', apply: [], needs: 'C69 > 0', every: { n: 1, u: 'hour', whileNeeds: true } }] }, { F, gmView: true }), chD = { id: 'c_d', values: {} }, ruleD = sysD.rolls[0];
            const deep = [S.chainsShallow(sysD, F), S.rollNeedsOk(ruleD, S.makeResolver(sysD, chD, F), F), S.rollNeedsOk(ruleD, S.resolveAll(sysD, chD, F).vars, F), S.needsHeld(sysD, chD, [{ key: 'r_dp', rule: ruleD, fight: false }], F, 60, { flat: false }).r_dp,
                S.rollNeedsOk(ruleD, S.makeResolver(sysD, chD, F), F, () => S.resolveAll(sysD, chD, F).vars), S.rollNeedsOk(ruleD, S.makeResolver(sysD, chD, F), F, () => 'no'), S.rollNeedsOk(ruleD, S.makeResolver(sysD, chD, F), F, () => { throw new Error('x'); })];
            return [j(deep) === j([false, false, true, 60, true, false, false]), j(deep)];
        });

        // (3) the window (calendar.js, run for real through mkCal): each stretch judged as it is counted, before its timed effects run
        const mkH = (sys, tr, chars, more) => { const camp = { id: 'k', clock: { t: 0 }, turnRules: tr, chars: chars }; return Object.assign({ camp }, { W: mkCal(Object.assign({ camp, sys }, more || {})) }); };
        const cntH = (acc, c, r) => acc && acc[c] && typeof acc[c][r] === 'number' ? acc[c][r] : 0, firesH = W => W.runs.map(r => r[0].map(f => f.c + ':' + f.r + (f.x ? ':x' : '') + ':' + f.n).join(' '));
        const sysW = Object.assign({}, sysJ, { rolls: [RJ('r_sl'), { id: 'r_pl', label: 'Plain', apply: [], every: { n: 1, u: 'day' } }] });
        tcH('1.5.5 the window (calendar.js ownTime, run for real): a rule every day ticked Only while its needs hold counts each character\'s own stretches only while its needs hold, judged as the clock moves on: Kael asleep 12 hours, awake 12 and asleep 12 more runs once, at the end of the third, while Unit 7, asleep only in the middle twelve, holds 12 hours; the rule beside it with no tick counts on as ever; a stretch is judged before its timed effects run (what they change counts from the next stretch); a nap of 2 hours inside a stretch of 10 counts 2 hours; a player\'s app judges nothing and counts nothing', () => {
            const H1 = mkH(sysW, undefined, { c_a: { id: 'c_a', name: 'Kael', ownerId: 'u_a', values: { f_sl: true } }, c_b: { id: 'c_b', name: 'Unit 7', npc: true, values: {} } }), ch1 = H1.camp.chars;
            const st1 = [], snap1 = () => st1.push([cntH(H1.camp.clock.acc, 'c_a', 'r_sl'), cntH(H1.camp.clock.acc, 'c_b', 'r_sl'), cntH(H1.camp.clock.acc, 'c_a', 'r_pl')]);
            H1.W.api.moveBy(43200); snap1(); ch1.c_a.values.f_sl = false; ch1.c_b.values.f_sl = true; H1.W.api.moveBy(43200); snap1(); ch1.c_a.values.f_sl = true; ch1.c_b.values.f_sl = false; H1.W.api.moveBy(43200); snap1();
            H1.W.win.wpNet.fxSpans = sp => { ch1.c_a.values.f_sl = false; ch1.c_b.values.f_sl = true; }; H1.W.api.moveBy(3600); snap1();   // the stretch's timed effects run after it is judged
            H1.W.win.wpNet.fxSpans = () => {}; ch1.c_b.values = { f_fx: nap(7200) }; H1.W.api.moveBy(36000); snap1();
            const HP = mkH(sysW, undefined, { c_a: { id: 'c_a', name: 'Kael', ownerId: 'u_a', values: { f_sl: true } } }, { player: true }); HP.W.api.ownTime([{ kind: 'clock', ids: ['c_a'], t0: 0, t1: 86400 }]);   // a player's app judges nothing and counts nothing
            return [j(st1) === j([[43200, 0, 43200], [43200, 43200, 0], [0, 43200, 43200], [3600, 43200, 46800], [3600, 50400, 82800]]) && j(firesH(H1.W)) === j(['c_a:r_pl:1 c_b:r_pl:1', 'c_a:r_sl:1']) && HP.W.runs.length === 0 && !HP.camp.clock.acc, j([st1, firesH(H1.W), HP.camp.clock])];
        });
        tcH('1.5.5 the window: with no rule ticked nothing is judged and ruleFires is called exactly as before 1.5.5, with no ninth argument, by a step and by a fight\'s round; with one ticked, the judge is handed to it', () => {
            const spyRF = [], spyOf = arr => function() { arr.push(arguments.length); return C.ruleFires.apply(null, arguments); };
            const H0 = mkH(Object.assign({}, sysW, { rolls: stripH(sysW.rolls) }), undefined, { c_a: { id: 'c_a', name: 'Kael', values: { f_sl: true } } }, { ruleFires: spyOf(spyRF) });
            H0.W.api.moveBy(90000); H0.W.api.ownTime([{ kind: 'fight', ids: ['c_a'], t0: H0.camp.clock.t, t1: H0.camp.clock.t + 6, round: 1, rs: 6, words: 'Round 1 on Docks' }]);
            const spyRF2 = [], H2 = mkH(sysW, undefined, { c_a: { id: 'c_a', name: 'Kael', values: { f_sl: true } } }, { ruleFires: spyOf(spyRF2) }); H2.W.api.moveBy(90000);
            return [j(spyRF) === j([7, 8]) && j(H0.camp.clock.acc) === j({ c_a: { r_sl: 3606, r_pl: 3606 } }) && j(spyRF2) === j([9]), j([spyRF, H0.camp.clock.acc, spyRF2])];
        });
        tcH('1.5.5 the window under Ask me: time moved on while a list waits keeps what was judged as it was lived (pendQ\'s z: the seconds each ticked count held, for every character judged, summed as stretches run on as one), and the answer counts it so: Kael awake one hour and asleep the next holds one hour, Unit 7, awake both, none, though Unit 7 sleeps and Kael wakes before you skip; the clock\'s own minutes, judged, are kept in order with what they held, each run on as one (1.5.5\'s review, a deliberate change of this pin: z says what held for each character judged, where it said what did not hold for those it did not hold for, so that a character made since holds none of it; and a judged minute never joins the minutes kept as one number, which every character counts whole)', () => {
            const sysQ = Object.assign({}, sysJ, { rolls: [RJ('r_sl')] });
            const HQ = mkH(sysQ, { time: 'confirm' }, { c_a: { id: 'c_a', name: 'Kael', ownerId: 'u_a', values: { f_sl: true } }, c_b: { id: 'c_b', name: 'Unit 7', npc: true, values: {} } }), chQ = HQ.camp.chars;
            HQ.W.api.moveBy(86400); const pQ = HQ.W.api.st().pend, listQ = pQ ? pQ.fires.map(f => f.c + ':' + f.r + ':' + f.n) : null;
            chQ.c_a.values.f_sl = false; HQ.W.api.moveBy(3600); chQ.c_a.values.f_sl = true; HQ.W.api.moveBy(3600); const qQ = JSON.parse(j(HQ.W.api.st().pendQ));
            chQ.c_b.values.f_sl = true; chQ.c_a.values.f_sl = false; HQ.W.api.onWinClick({ target: findN(HQ.W.body, 'cal-pend-skip')[0] });
            const afterQ = [HQ.W.api.st().pend, HQ.W.api.st().pendQ.length, j(HQ.camp.clock.acc || null)];
            HQ.W.api.moveBy(86400); const pQ2 = HQ.W.api.st().pend; HQ.W.api.moveTo(HQ.camp.clock.t + 60, null, true); chQ.c_a.values.f_sl = true; HQ.W.api.moveTo(HQ.camp.clock.t + 60, null, true); HQ.W.api.moveTo(HQ.camp.clock.t + 60, null, true);
            const liveQ = [!!pQ2, HQ.W.api.liveSt().livePend, JSON.parse(j(HQ.W.api.st().pendQ))];
            return [j(listQ) === j(['c_a:r_sl:1']) && j(qQ) === j([{ s: 7200, r: false, a: false, l: false, z: { c_a: { r_sl: 3600 }, c_b: { r_sl: 0 } } }]) && j(afterQ) === j([null, 0, j({ c_a: { r_sl: 3600 } })])
                && liveQ[0] === true && liveQ[1] === 0 && j(liveQ[2]) === j([{ s: 180, r: false, a: false, l: true, z: { c_a: { r_sl: 120 }, c_b: { r_sl: 180 } } }]), j([listQ, qQ, afterQ, liveQ])];
        });
        tcH('1.5.5 the window in a fight (calendar.js ownTime with a fight\'s round, run for real): an In a fight count ticked so is judged in the round its runs read, so Kael, charging, runs Charge each round while Unit 7 does not, and a rule that needs CombatRound > 2 runs in round 3 alone; the By the clock counts beside them are judged with no round, as their runs read it', () => {
            const sysF = Object.assign({}, sysJ, { rolls: [RJ('r_ch'), RJ('r_r3')] });
            const HF = mkH(sysF, undefined, { c_a: { id: 'c_a', name: 'Kael', ownerId: 'u_a', values: { f_ch: true } }, c_b: { id: 'c_b', name: 'Unit 7', npc: true, values: {} } });
            [1, 2, 3].forEach(rd => HF.W.api.ownTime([{ kind: 'fight', ids: ['c_a', 'c_b'], t0: { s: rd * 6 - 6 }, t1: { s: rd * 6 }, round: rd, rs: 6, words: 'Round ' + rd + ' on Docks' }]));
            return [j(firesH(HF.W)) === j(['c_a:r_ch:x:1', 'c_a:r_ch:x:1', 'c_a:r_ch:x:1 c_a:r_r3:x:1 c_b:r_r3:x:1']) && j(HF.camp.clock.acc) === j({ c_a: { r_ch: 18 } }), j([firesH(HF.W), HF.camp.clock.acc])];
        });
        tcH('1.5.5 the window with the Calendar off: a rule ticked Ask me first and Only while its needs hold waits in the bell as any rule does, for the characters whose needs held alone (Kael, charging, waits there with his round; Unit 7, not charging, counts nothing and waits nowhere)', () => {
            const sysB = Object.assign({}, sysJ, { rolls: [Object.assign({}, RJ('r_ch'), { ask: true })] });
            const HB = mkH(sysB, undefined, { c_a: { id: 'c_a', name: 'Kael', ownerId: 'u_a', values: { f_ch: true } }, c_b: { id: 'c_b', name: 'Unit 7', npc: true, values: {} } }, { on: false });
            HB.W.api.ownTime([{ kind: 'fight', ids: ['c_a', 'c_b'], t0: { s: 0 }, t1: { s: 6 }, round: 2, rs: 6, words: 'Round 2 on Docks' }]);
            const waits = HB.W.notes.filter(n => n[0] === 'wait').map(n => n[1]);
            return [j(waits) === j(['timeask:c_a:r_ch']) && HB.W.runs.length === 0 && !HB.camp.clock.acc, j([HB.W.notes, HB.W.runs, HB.camp.clock])];
        });

        // (4) 1.5.5's review (a draw counted while a nap held its needs was lost: the nap ran out before the run was made, and the run was judged after it):
        // the window with the REAL runs behind it, end to end: calendar.js ownTime, the timed effects run as net.fxSpans runs them (systemcore fxTick, stored
        // as fxApply stores them), sheets.js runTimeRules sliced by its timerules markers and run for real over the real timeRuleRun, and what it tells
        // calendar.js of each run (heldBack). Each check fails without the review's fix
        const rawE = { v: 1, name: 'Droids', calendar: tw, combat: { turn: { secs: 6 } },
            fields: [{ id: 'f_sl', key: 'Asleep', kind: 'toggle' }, { id: 'f_ch', key: 'Charging', kind: 'toggle' }, { id: 'f_pp', key: 'PP', kind: 'resource', maxFormula: '20', def: 'max', min: 0 }, { id: 'f_lm', key: 'Lumen', kind: 'number', def: 0 }, { id: 'f_fx', key: 'Fx', kind: 'effects' }],
            effects: [{ id: 'e_nap', name: 'Nap', mods: [{ f: 'f_sl', op: 'on' }] }, { id: 'e_dock', name: 'Dock', mods: [{ f: 'f_ch', op: 'on' }] }],
            rolls: [{ id: 'r_sl', label: 'Sleep draw', apply: [{ f: 'f_pp', formula: '1' }], needs: 'Asleep', every: { n: 1, u: 'day', whileNeeds: true } },
                { id: 'r_ch', label: 'Charge', apply: [{ f: 'f_pp', formula: '1', add: true }], needs: 'Charging', every: { n: 1, u: 'hour', whileNeeds: true } },
                { id: 'r_hd', label: 'Hourly draw', apply: [{ f: 'f_pp', formula: '1' }], needs: 'PP > 0', every: { n: 1, u: 'hour', whileNeeds: true } },
                { id: 'r_dr', label: 'Drain', apply: [{ f: 'f_pp', formula: '1' }], every: { n: 1, u: 'hour' } },
                { id: 'r_gl', label: 'Glow', apply: [{ f: 'f_lm', formula: '1', add: true }], needs: 'PP > 2', every: { n: 1, u: 'hour', whileNeeds: true } },
                { id: 'r_rs', label: 'Dream', apply: [{ f: 'f_lm', formula: '1', add: true }], needs: 'Asleep', every: { n: 1, u: 'hour', rest: true, whileNeeds: true } }] };
        const sysE = S.cleanSystem(rawE, { F, gmView: true }), RE = id => sysE.rolls.find(r => r.id === id), sysOfE = ids => Object.assign({}, sysE, { rolls: ids.map(RE) });
        const shE = read('system/app/scripts/sheets.js'), trA = shE.indexOf('// [sinkcheck:timerules-start]'), trB = shE.indexOf('// [sinkcheck:timerules-end]'), trSrcE = trA >= 0 && trB > trA ? shE.slice(trA, trB) : '';
        const napE = h => ({ id: 'n' + h, ref: 'e_nap', on: true, t: { left: h * 3600, at: 0 } }), dockE = h => ({ id: 'd' + h, ref: 'e_dock', on: true, t: { left: h * 3600, at: 0 } });
        const mkE = (sys, chars, tr, more) => {   // the window with the real runs behind it
            const H = mkH(sys, tr, chars, more), camp = H.camp, cards = [];
            camp.system = sys;
            const rtr = new Function('getActiveCampaign', 'systemOf', 'net', 'F', 'charById', 'timeRuleRun', 'gmOnlyNames', 'applyScope', 'renderViews', 'save', 'window', 'makeResolver', 'hasDice', 'figText', 'ruleRunCtx', 'chainsShallow', "'use strict';" + NL + trSrcE + NL + 'return runTimeRules;')(
                () => camp, c => c.system, () => ({ active: false, timeCard: (ch, text) => cards.push([ch.id, text]) }), () => F, (id, c) => (Object.prototype.hasOwnProperty.call(c.chars, id) ? c.chars[id] : null), S.timeRuleRun, S.gmOnlyNames, S.applyScope, () => {}, () => {}, { wpDiceCore: null, appRender: () => {} }, S.makeResolver, S.hasDice, S.figText, S.ruleRunCtx, S.chainsShallow);
            H.W.win.wpSheets.runTimeRules = (fires, words, at, back, when) => { H.W.runs.push([JSON.parse(j(fires)), words]); return rtr(fires, words, at, back, when); };   // 176: when, as the app hands it
            H.W.win.wpNet.fxSpans = sp => Object.keys(sp).forEach(id => { const ch = camp.chars[id]; if (!ch) return; const r = S.fxTick(sys, ch, 'game', Date.now(), sp[id]); Object.keys(r.values).forEach(k => { ch.values[k] = r.values[k]; }); });   // as net.fxSpans and fxApply store them
            return Object.assign(H, { cards });
        };
        const ppE = ch => ch.values.f_pp && typeof ch.values.f_pp.cur === 'number' ? ch.values.f_pp.cur : 20, lmE = ch => typeof ch.values.f_lm === 'number' ? ch.values.f_lm : 0;
        const canon = o => JSON.parse(JSON.stringify(o === undefined ? null : o, (k, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.keys(v).sort().reduce((a, x) => { a[x] = v[x]; return a; }, {}) : v));
        const kaelE = vals => ({ c_a: { id: 'c_a', name: 'Kael', ownerId: 'u_a', values: vals || {} } });
        tcH('1.5.5\'s review: a run is made as its character stood where it came due (calendar.js dueOn, sheets.js runTimeRules, systemcore timeRuleRun\'s due, run end to end): Kael, with 16 hours of sleep counted and a nap of 8 hours, completes his day 8 hours into a step of a day and his Sleep draw is taken, though the nap has run out by the time the run is made; the same day as a step of 4 hours and one of 20; three naps of 8 hours, each laid on before a step of 8 hours; one nap of 30 hours and a step of 2 days, 6 hours carried; and a dock of 2 hours in a step of 10 hours charging him twice. Each run is summed up as any is', () => {
            if (!trSrcE) return [false, 'sheets.js has no timerules slice'];
            const out = [];
            { const E = mkE(sysOfE(['r_sl']), kaelE({ f_fx: [napE(8)] })); E.camp.clock.acc = { c_a: { r_sl: 57600 } }; E.W.api.moveBy(86400); out.push([ppE(E.camp.chars.c_a), canon(E.camp.clock.acc), E.cards.length]); }
            { const E = mkE(sysOfE(['r_sl']), kaelE({ f_fx: [napE(8)] })); E.camp.clock.acc = { c_a: { r_sl: 57600 } }; E.W.api.moveBy(14400); E.W.api.moveBy(72000); out.push([ppE(E.camp.chars.c_a), canon(E.camp.clock.acc), E.cards.length]); }
            { const E = mkE(sysOfE(['r_sl']), kaelE()); for (let i = 0; i < 3; i++) { E.camp.chars.c_a.values.f_fx = [napE(8)]; E.W.api.moveBy(28800); } out.push([ppE(E.camp.chars.c_a), canon(E.camp.clock.acc), E.cards.length]); }
            { const E = mkE(sysOfE(['r_sl']), kaelE({ f_fx: [napE(30)] })); E.W.api.moveBy(172800); out.push([ppE(E.camp.chars.c_a), canon(E.camp.clock.acc), E.cards.length]); }
            { const E = mkE(sysOfE(['r_ch']), kaelE({ f_pp: { cur: 10 }, f_fx: [dockE(2)] })); E.W.api.moveBy(36000); out.push([ppE(E.camp.chars.c_a), canon(E.camp.clock.acc), E.cards.length]); }
            return [j(out) === j([[19, null, 1], [19, null, 1], [19, null, 1], [19, canon({ c_a: { r_sl: 21600 } }), 1], [12, null, 1]]), j(out)];
        });
        tcH('1.5.5\'s review: a run its needs hold back all the same gives its time back to its count (calendar.js heldBack): under Ask me, a day Kael slept is listed, you wake him and apply, and the draw is held back with the day kept on his count; a minute of sleep later the draw comes due again, at once, and is taken; nothing else of the count moves', () => {
            if (!trSrcE) return [false, 'sheets.js has no timerules slice'];
            const E = mkE(sysOfE(['r_sl']), kaelE({ f_sl: true }), { time: 'confirm' }), ch = E.camp.chars.c_a, out = [];
            E.W.api.moveBy(86400); out.push((E.W.api.st().pend || { fires: [] }).fires.map(f => f.c + ':' + f.r + ':' + f.n));
            ch.values.f_sl = false; E.W.api.onWinClick({ target: findN(E.W.body, 'cal-pend-apply')[0] }); out.push([ppE(ch), canon(E.camp.clock.acc), E.cards.length]);
            ch.values.f_sl = true; E.W.api.moveBy(60); out.push((E.W.api.st().pend || { fires: [] }).fires.map(f => f.c + ':' + f.r + ':' + f.n));
            E.W.api.onWinClick({ target: findN(E.W.body, 'cal-pend-apply')[0] }); out.push([ppE(ch), canon(E.camp.clock.acc), E.cards.length]);
            return [j(out) === j([['c_a:r_sl:1'], [20, canon({ c_a: { r_sl: 86400 } }), 0], ['c_a:r_sl:1'], [19, canon({ c_a: { r_sl: 60 } }), 1]]), j(out)];
        });
        tcH('1.5.5\'s review: a rule whose own runs make its needs fail stops there with its count at none, since the time after its last run was not time they held (heldBack, fresh): Kael\'s Hourly draw, which needs PP above 0, takes his last 3 PP in a step of 10 and a half hours and keeps no half hour, so with 5 PP and half an hour more it draws nothing, exactly as the same time stepped an hour at a time gives', () => {
            if (!trSrcE) return [false, 'sheets.js has no timerules slice'];
            const run = steps => { const E = mkE(sysOfE(['r_hd']), kaelE({ f_pp: { cur: 3 } })), ch = E.camp.chars.c_a; steps.forEach(s => E.W.api.moveBy(s)); const mid = [ppE(ch), canon(E.camp.clock.acc)]; ch.values.f_pp = { cur: 5 }; E.W.api.moveBy(1800); return [mid, ppE(ch), canon(E.camp.clock.acc)]; };
            const one = run([37800]), many = run([3600, 3600, 3600, 3600, 3600, 3600, 3600, 3600, 3600, 3600, 1800]);
            return [j(one) === j([[0, null], 5, canon({ c_a: { r_hd: 1800 } })]) && j(many) === j(one), j([one, many])];
        });
        tcH('176 (the owner, 2026-10-28, by prompt: "Hour by hour (Recommended)"): a long step runs one character\'s rules in the order their runs came due (calendar.js whenOf, sheets.js runTimeRules, end to end): a lamp of 5 Charge whose Battery takes 1 an hour and whose Shine needs Charge above 0 shines 4 hours in one step of 10 hours, as in ten steps of an hour; one summary line a rule, its values summed; a rule due on the half hour runs between them; with no when, rule by rule as before', () => {
            if (!trSrcE) return [false, 'sheets.js has no timerules slice'];
            const rawL = { v: 1, name: 'Lamp', calendar: tw, fields: [{ id: 'f_cg', key: 'Charge', kind: 'resource', maxFormula: '5', def: 'max', min: 0 }, { id: 'f_lm', key: 'Lumen', kind: 'number', def: 0 }, { id: 'f_hf', key: 'Half', kind: 'number', def: 0 }],
                rolls: [{ id: 'r_bt', label: 'Battery', apply: [{ f: 'f_cg', formula: '1' }], every: { n: 1, u: 'hour' } }, { id: 'r_sh', label: 'Shine', apply: [{ f: 'f_lm', formula: '1', add: true }], needs: 'Charge > 0', every: { n: 1, u: 'hour' } },
                    { id: 'r_hf', label: 'Tick', apply: [{ f: 'f_hf', formula: 'Charge', add: true }], every: { n: 30, u: 'min' } }] };
            const sysL = S.cleanSystem(rawL, { F, gmView: true }), RL = ids => Object.assign({}, sysL, { rolls: ids.map(id => sysL.rolls.find(r => r.id === id)) });
            const cg = ch => ch.values.f_cg && typeof ch.values.f_cg.cur === 'number' ? ch.values.f_cg.cur : 5, lm = ch => typeof ch.values.f_lm === 'number' ? ch.values.f_lm : 0;
            const run = (ids, steps) => { const E = mkE(RL(ids), kaelE()), ch = E.camp.chars.c_a; steps.forEach(s => E.W.api.moveBy(s)); return { r: [cg(ch), lm(ch)], cards: E.cards.map(c => c[1]), ch }; };
            const one = run(['r_bt', 'r_sh'], [36000]), many = run(['r_bt', 'r_sh'], Array(10).fill(3600));
            const half = run(['r_bt', 'r_hf'], [7200]);
            const fx = { values: {} }, noWhen = (() => { const E = mkE(RL(['r_bt', 'r_sh']), kaelE()), ch = E.camp.chars.c_a; E.W.win.wpSheets.runTimeRules = ((orig) => (f, w, a, b) => orig(f, w, a, b))(E.W.win.wpSheets.runTimeRules); E.W.api.moveBy(36000); return [cg(ch), lm(ch)]; })();
            const card = one.cards[0] || '';
            return [j(one.r) === j([0, 4]) && j(many.r) === j([0, 4]) && /Battery \u00d710: Charge -5 \u2192 0/.test(card) && /Shine \u00d710: Lumen \+4 \u2192 4/.test(card) && card.indexOf('Battery') < card.indexOf('Shine')
                && half.ch.values.f_hf === 16 && j(noWhen) === j([0, 0]), j([one.r, many.r, card, half.ch.values, noWhen])];
        });
        tcH('1.5.5\'s review: time kept behind a list holds for none of a character it never judged (calendar.js gapOf, needOf, joinStretch): a character made while a list waits counts none of the hour stepped on before it was made, once you skip, while Kael, asleep through it, counts it whole; two such hours run on as one keep each character\'s own', () => {
            const E = mkH(sysOfE(['r_sl']), { time: 'confirm' }, kaelE({ f_sl: true }));
            E.W.api.moveBy(86400); E.W.api.moveBy(3600); E.camp.chars.c_n = { id: 'c_n', name: 'Pebbles', npc: true, values: { f_sl: true } }; E.W.api.moveBy(3600);
            const q = JSON.parse(j(E.W.api.st().pendQ)); E.W.api.onWinClick({ target: findN(E.W.body, 'cal-pend-skip')[0] });
            return [j(q) === j([{ s: 7200, r: false, a: false, l: false, z: { c_a: { r_sl: 7200 }, c_n: { r_sl: 3600 } } }]) && j(canon(E.camp.clock.acc)) === j(canon({ c_a: { r_sl: 7200 }, c_n: { r_sl: 3600 } })), j([q, E.camp.clock.acc])];
        });
        tcH('1.5.5\'s review, owed tests: with no formula engine at hand a ticked count stands still while one with no tick counts on (calendar.js needsAt); time outside fights while fights run is judged as the window says, so a rest-only rule ticked so counts none of it under Active and all of it under Rest, and a dock that runs out within it still charges for the time it held', () => {
            if (!trSrcE) return [false, 'sheets.js has no timerules slice'];
            const N = mkH(sysW, undefined, kaelE({ f_sl: true })); delete N.W.win.wpFormula; N.W.api.moveBy(43200);
            const noF = canon(N.camp.clock.acc);
            const E = mkE(sysOfE(['r_ch', 'r_rs']), kaelE({ f_sl: true, f_pp: { cur: 10 }, f_fx: [dockE(2)] })), ch = E.camp.chars.c_a; E.W.api.openWin();
            E.W.api.ownTime([{ kind: 'out', ids: ['c_a'], t0: { s: 0 }, t1: { s: 36000 } }]); const act = [ppE(ch), lmE(ch), canon(E.camp.clock.acc)];
            E.W.api.onWinClick({ target: findN(E.W.body, 'cal-kind-btn')[1] }); E.W.api.ownTime([{ kind: 'out', ids: ['c_a'], t0: { s: 36000 }, t1: { s: 39600 } }]); const rst = [ppE(ch), lmE(ch), canon(E.camp.clock.acc)];
            return [j(noF) === j(canon({ c_a: { r_pl: 43200 } })) && j(act) === j([12, 0, null]) && j(rst) === j([12, 1, null]), j([noF, act, rst])];
        });
        tcH('1.5.5\'s review, owed tests: what judging costs through calendar.js needsAt itself, a minute of the clock on 160 characters of a sheet of 160 fields: chainsShallow asked once for the stretch, never once a character, the formula engine asked a handful of times a character, never the sheet worked out whole, well within a second', () => {
            const flds = [{ id: 'f_sl', key: 'Asleep', kind: 'toggle' }].concat(Array.from({ length: 159 }, (_, i) => ({ id: 'f_g' + i, key: 'G' + i, kind: 'formula', formula: '1 + ' + i })));
            const sysC = S.cleanSystem({ v: 1, name: 'Cost', calendar: tw, fields: flds, rolls: [{ id: 'r_sl', label: 'Sleep draw', apply: [], needs: 'Asleep and G3 > 0', every: { n: 1, u: 'day', whileNeeds: true } }] }, { F, gmView: true });
            const chars = {}; for (let i = 0; i < 160; i++) chars['c_' + i] = { id: 'c_' + i, name: 'Unit ' + i, npc: true, values: { f_sl: i % 2 === 0 } };
            let shallow = 0, asks = 0; const W = mkH(sysC, undefined, chars, { chainsShallow: (s, Fx) => { shallow++; return S.chainsShallow(s, Fx); } });
            W.W.win.wpFormula = Object.assign({}, F, { evaluate: (t, o) => { asks++; return F.evaluate(t, o); }, evaluateAst: (a, o) => { asks++; return F.evaluateAst(a, o); } });
            const t0 = Date.now(); W.W.api.moveBy(60); const ms = Date.now() - t0, acc = W.camp.clock.acc || {}, held = Object.keys(acc).length;
            return [shallow === 1 && asks <= 160 * 8 && ms < 1000 && held === 80 && acc.c_0 && acc.c_0.r_sl === 60 && !acc.c_1, j({ shallow, asks, ms, held })];
        });

        // (5) two rules due at the same moment (the owner, 2026-10-23, by prompt: "Spent, nothing done (Recommended)", which they wrote as a rule of their
        // own system: where two recoveries come due at the same moment and the first fills a pool, the second restores nothing to that pool and its time
        // is not kept for later). calendar.js heldBack: a fire of a ticked count whose first run its needs hold back, where a run of another count of the
        // same character was made before it in the same go (one runTimeRules: the rules run at once in a stretch, one Apply of the list, one bell item),
        // spends its time: nothing goes back on its count. Within a go a character's fires run in the system's order, a list's in the order they were
        // first listed, each fire's runs before the next fire's. The Glow pin below moved on purpose: Glow kept the hour, and was made a minute later for
        // nothing. The checks up to the one under Ask me fail with heldBack as it was; those after it pin where the time still goes back and where it is
        // still spent, each failing with a heldBack that reads the go otherwise (a held run counted as a run, a later run, another character's, the same
        // rule's other count not counted, a fire's own runs spent as another's, or a cause in place of the order)
        tcH('1.5.5, a deliberate change of a pin of 1.5.5\'s review (the owner, 2026-10-23, by prompt: "Spent, nothing done"): a run held back by another rule\'s run before it at the same moment does nothing and its time is spent: Drain takes Kael from 3 PP to 2 before Glow, which needs more than 2 and counted the hour while he had 3, is made; Glow does nothing and keeps no hour, so the next step counts on from nothing and gives no Lumen. A rule with no tick, held back, keeps nothing, as before', () => {
            if (!trSrcE) return [false, 'sheets.js has no timerules slice'];
            const E = mkE(sysOfE(['r_dr', 'r_gl']), kaelE({ f_pp: { cur: 3 } })), ch = E.camp.chars.c_a, out = [];
            E.W.api.moveBy(3600); out.push([ppE(ch), lmE(ch), canon(E.camp.clock.acc)]);
            ch.values.f_pp = { cur: 10 }; E.W.api.moveBy(60); out.push([ppE(ch), lmE(ch), canon(E.camp.clock.acc)]);
            const plain = Object.assign({}, RE('r_gl'), { every: { n: 1, u: 'hour' } }), E2 = mkE(Object.assign({}, sysE, { rolls: [RE('r_dr'), plain] }), kaelE({ f_pp: { cur: 3 } }));
            E2.W.api.moveBy(3600); out.push([ppE(E2.camp.chars.c_a), lmE(E2.camp.chars.c_a), canon(E2.camp.clock.acc)]);
            return [j(out) === j([[2, 0, null], [10, 0, canon({ c_a: { r_dr: 60, r_gl: 60 } })], [2, 0, null]]), j(out)];
        });
        const rawK = { v: 1, name: 'Pools', calendar: tw, combat: { turn: { secs: 6 } },
            fields: [{ id: 'f_fp', key: 'FP', kind: 'resource', maxFormula: '16', def: 'max', min: 0 }, { id: 'f_hp', key: 'HP', kind: 'resource', maxFormula: '12', def: 'max', min: 0 }],
            rolls: [{ id: 'r_br', label: 'Breath', apply: [{ f: 'f_fp', formula: '1', add: true }], needs: 'FP < FP.max', every: { n: 1, u: 'hour', whileNeeds: true } },
                { id: 'r_rs', label: 'Rest', apply: [{ f: 'f_fp', formula: 'floor(FP / 8)', add: true }], needs: 'FP < FP.max', every: { n: 1, u: 'hour', rest: true, whileNeeds: true } },
                { id: 'r_md', label: 'Mend', apply: [{ f: 'f_hp', formula: '1', add: true }], needs: 'HP < HP.max', every: { n: 1, u: 'hour', whileNeeds: true } },
                { id: 'r_rf', label: 'Restore', apply: [{ f: 'f_fp', formula: 'FP.max', set: true }, { f: 'f_hp', formula: 'HP.max', set: true }], needs: 'FP < FP.max or HP < HP.max', every: { n: 8, u: 'hour', whileNeeds: true } }] };
        const sysK = S.cleanSystem(rawK, { F, gmView: true }), RK = id => sysK.rolls.find(r => r.id === id), sysOfK = ids => Object.assign({}, sysK, { rolls: ids.map(RK) });
        const okK = !!trSrcE && sysK.rolls.length === 4 && sysK.rolls.every(r => r.every && r.every.whileNeeds === true) && RK('r_rs').every.rest === true && RK('r_rf').apply.every(c => c.set === true);   // the four rules as written
        const fpK = ch => ch.values.f_fp && typeof ch.values.f_fp.cur === 'number' ? ch.values.f_fp.cur : 16, hpK = ch => ch.values.f_hp && typeof ch.values.f_hp.cur === 'number' ? ch.values.f_hp.cur : 12;
        const pendK = E => (E.W.api.st().pend || { fires: [] }).fires.map(f => f.c + ':' + f.r + ':' + f.n);
        tcH('1.5.5, two rules due at one moment (the owner\'s "Spent, nothing done"): Breath adds 1 FP an hour and Rest an eighth of what FP holds an hour, both needing FP below its most and listed in that order; from 15 of 16 Breath fills the pool at the hour, so Rest, made after it, does nothing and keeps no time, and 8 FP spent and a minute more give nothing; the same in steps of an hour, of 10 minutes and of a minute, all as rest', () => {
            if (!okK) return [false, 'sheets.js has no timerules slice, or the rules did not clean as written'];
            const run = (step, n) => { const E = mkE(sysOfK(['r_br', 'r_rs']), kaelE({ f_fp: { cur: 15 } })), ch = E.camp.chars.c_a; for (let i = 0; i < n; i++) E.W.api.moveBy(step, true); const at = [fpK(ch), canon(E.camp.clock.acc)]; ch.values.f_fp = { cur: 8 }; E.W.api.moveBy(60, true); return [at, fpK(ch), canon(E.camp.clock.acc), E.W.runs.length]; };
            const outK = [run(3600, 1), run(600, 6), run(60, 60)];
            return [outK.every(o => j(o) === j([[16, null], 8, canon({ c_a: { r_br: 60, r_rs: 60 } }), 1])), j(outK)];
        });
        tcH('1.5.5, two rules due at one moment, the review\'s own case: a pool of 16 holding 13, Breath and Rest, 3 hours of rest stepped an hour at a time, then 6 spent and a minute more of rest: the pool holds 10 and no hour is kept, where Rest\'s kept hour gave 11', () => {
            // By hand. Hour 1, judged at 13: both count it and both are made, Breath 13 to 14, Rest an eighth of 14, so 1, to 15. Hour 2, judged at 15:
            // both count it, Breath 15 to 16, and Rest, made after it on a full pool, is held back: its hour is spent (heldBack as it was put it back on
            // its count). Hour 3, judged at 16: neither counts. 6 spent: 10. A minute, judged at 10: each counts 60 seconds and nothing comes due, so 10.
            // With the hour kept, Rest came due at once in that minute and gave an eighth of 10, so 1: 11
            if (!okK) return [false, 'sheets.js has no timerules slice, or the rules did not clean as written'];
            const E = mkE(sysOfK(['r_br', 'r_rs']), kaelE({ f_fp: { cur: 13 } })), ch = E.camp.chars.c_a, out = [];
            for (let i = 0; i < 3; i++) { E.W.api.moveBy(3600, true); out.push(fpK(ch)); }
            ch.values.f_fp = { cur: fpK(ch) - 6 }; E.W.api.moveBy(60, true); out.push(fpK(ch), canon(E.camp.clock.acc));
            return [j(out) === j([15, 16, 16, 10, canon({ c_a: { r_br: 60, r_rs: 60 } })]), j(out)];
        });
        tcH('1.5.5, two rules due at one moment, a third after them: Restore, every 8 hours, sets FP and HP to their most and needs either below it; listed after Breath and Mend, which each add 1 an hour to FP and to HP while below its most, it comes due at the 8th hour just as they fill both pools, does nothing and keeps no time, so 5 FP spent and a minute more restore nothing; stepped an hour at a time', () => {
            if (!okK) return [false, 'sheets.js has no timerules slice, or the rules did not clean as written'];
            const E = mkE(sysOfK(['r_br', 'r_md', 'r_rf']), kaelE({ f_fp: { cur: 8 }, f_hp: { cur: 4 } })), ch = E.camp.chars.c_a, out = [];
            for (let i = 0; i < 8; i++) E.W.api.moveBy(3600);
            out.push([fpK(ch), hpK(ch), canon(E.camp.clock.acc)]);
            ch.values.f_fp = { cur: 11 }; E.W.api.moveBy(60); out.push([fpK(ch), hpK(ch), canon(E.camp.clock.acc)]);
            return [j(out) === j([[16, 12, null], [11, 12, canon({ c_a: { r_br: 60, r_rf: 60 } })]]), j(out)];
        });
        tcH('1.5.5, two rules due at one moment under Ask me: an hour of rest from 15 FP of 16 lists Breath and Rest, and one Apply runs both: Breath fills the pool and Rest, made after it, does nothing and keeps no time, so 8 FP spent and a minute more of rest list nothing and give nothing', () => {
            if (!okK) return [false, 'sheets.js has no timerules slice, or the rules did not clean as written'];
            const E = mkE(sysOfK(['r_br', 'r_rs']), kaelE({ f_fp: { cur: 15 } }), { time: 'confirm' }), ch = E.camp.chars.c_a, out = [];
            E.W.api.moveBy(3600, true); out.push(pendK(E));
            E.W.api.onWinClick({ target: findN(E.W.body, 'cal-pend-apply')[0] }); out.push([fpK(ch), canon(E.camp.clock.acc), E.W.runs.length]);
            ch.values.f_fp = { cur: 8 }; E.W.api.moveBy(60, true); out.push([pendK(E), fpK(ch), canon(E.camp.clock.acc)]);
            return [j(out) === j([['c_a:r_br:1', 'c_a:r_rs:1'], [16, null, 1], [[], 8, canon({ c_a: { r_br: 60, r_rs: 60 } })]]), j(out)];
        });
        tcH('1.5.5, the same rule\'s other count is another count: Battery adds 1 PP an hour by the clock and in a fight, both ticked and needing PP below its most; in a fight\'s round of an hour from 19 of 20 its By the clock run fills the pool, and its In a fight run, made after it in the same go, does nothing and keeps no time (heldBack names a count by the rule\'s id, or x_ and its tail)', () => {
            if (!trSrcE) return [false, 'sheets.js has no timerules slice'];
            const sysB = S.cleanSystem({ v: 1, name: 'B', calendar: tw, combat: { turn: { secs: 6 } }, fields: [{ id: 'f_pp', key: 'PP', kind: 'resource', maxFormula: '20', def: 'max', min: 0 }],
                rolls: [{ id: 'r_bt', label: 'Battery', apply: [{ f: 'f_pp', formula: '1', add: true }], needs: 'PP < PP.max', every: { n: 1, u: 'hour', whileNeeds: true }, inFight: { n: 1, u: 'hour', whileNeeds: true } }] }, { F, gmView: true });
            const ok = sysB.rolls.length === 1 && sysB.rolls[0].every.whileNeeds === true && sysB.rolls[0].inFight.whileNeeds === true;
            const E = mkE(sysB, kaelE({ f_pp: { cur: 19 } })), ch = E.camp.chars.c_a;
            E.W.api.ownTime([{ kind: 'fight', ids: ['c_a'], t0: { s: 0 }, t1: { s: 3600 }, round: 1, rs: 6, words: 'Round 1 on Docks' }]);
            const out = [ppE(ch), canon(E.camp.clock.acc), E.W.runs.map(r => r[0])];
            return [ok && j(out) === j([20, null, [[{ c: 'c_a', r: 'r_bt', n: 1 }, { c: 'c_a', r: 'r_bt', n: 1, x: 1, rd: 1 }]]]), j(out)];
        });
        tcH('1.5.5, another character\'s runs are no runs before it: under Ask me Kael (20 PP) and Ilsa (3 PP) each have Glow then Drain listed after an hour; you take Ilsa to 2 PP and apply: Kael\'s Glow and Drain are made before hers, yet Ilsa\'s Glow, held back with no run of hers before it, keeps its hour', () => {
            if (!trSrcE) return [false, 'sheets.js has no timerules slice'];
            const E = mkE(sysOfE(['r_gl', 'r_dr']), { c_a: { id: 'c_a', name: 'Kael', ownerId: 'u_a', values: { f_pp: { cur: 20 } } }, c_b: { id: 'c_b', name: 'Ilsa', ownerId: 'u_b', values: { f_pp: { cur: 3 } } } }, { time: 'confirm' });
            E.W.api.moveBy(3600); const l = (E.W.api.st().pend || { fires: [] }).fires.map(x => x.c + ':' + x.r + ':' + x.n);
            E.camp.chars.c_b.values.f_pp = { cur: 2 }; E.W.api.onWinClick({ target: findN(E.W.body, 'cal-pend-apply')[0] });
            const out = [l, ppE(E.camp.chars.c_a), lmE(E.camp.chars.c_a), ppE(E.camp.chars.c_b), lmE(E.camp.chars.c_b), canon(E.camp.clock.acc)];
            return [j(out) === j([['c_a:r_gl:1', 'c_a:r_dr:1', 'c_b:r_gl:1', 'c_b:r_dr:1'], 19, 1, 1, 0, canon({ c_b: { r_gl: 3600 } })]), j(out)];
        });
        tcH('1.5.5, a run held back is no run before the next: under Ask me an hour of rest from 15 FP of 16 lists Breath and Rest; you fill FP and apply: both are held back, neither makes a run, and both keep their hour, with no summary', () => {
            if (!okK) return [false, 'sheets.js has no timerules slice, or the rules did not clean as written'];
            const E = mkE(sysOfK(['r_br', 'r_rs']), kaelE({ f_fp: { cur: 15 } }), { time: 'confirm' }), ch = E.camp.chars.c_a;
            E.W.api.moveBy(3600, true); const l = pendK(E); ch.values.f_fp = { cur: 16 }; E.W.api.onWinClick({ target: findN(E.W.body, 'cal-pend-apply')[0] });
            const out = [l, fpK(ch), canon(E.camp.clock.acc), E.W.runs.length, E.cards.length];
            return [j(out) === j([['c_a:r_br:1', 'c_a:r_rs:1'], 16, canon({ c_a: { r_br: 3600, r_rs: 3600 } }), 1, 0]), j(out)];
        });
        tcH('1.5.5, a run made after it is no run before it: under Ask me an hour from 3 PP lists Glow then Drain; you take PP to 2 and apply: Glow, held back with no run before it, keeps its hour though Drain\'s run is made after it', () => {
            if (!trSrcE) return [false, 'sheets.js has no timerules slice'];
            const E = mkE(sysOfE(['r_gl', 'r_dr']), kaelE({ f_pp: { cur: 3 } }), { time: 'confirm' }), ch = E.camp.chars.c_a;
            E.W.api.moveBy(3600); const l = (E.W.api.st().pend || { fires: [] }).fires.map(x => x.c + ':' + x.r + ':' + x.n); ch.values.f_pp = { cur: 2 }; E.W.api.onWinClick({ target: findN(E.W.body, 'cal-pend-apply')[0] });
            const out = [l, ppE(ch), lmE(ch), canon(E.camp.clock.acc)];
            return [j(out) === j([['c_a:r_gl:1', 'c_a:r_dr:1'], 1, 0, canon({ c_a: { r_gl: 3600 } })]), j(out)];
        });
        tcH('1.5.5, a rule\'s own runs that make its needs fail follow the own-runs rule after another count\'s run too: Drain then Hourly draw in a step of 10 and a half hours from 15 PP; Drain takes 10 and Hourly draw\'s own runs take the last 5, its needs then fail, and its count is none, since the time after its last run was not time they held, though Drain ran before it', () => {
            if (!trSrcE) return [false, 'sheets.js has no timerules slice'];
            const E = mkE(sysOfE(['r_dr', 'r_hd']), kaelE({ f_pp: { cur: 15 } })), ch = E.camp.chars.c_a; E.W.api.moveBy(37800);
            const out = [ppE(ch), canon(E.camp.clock.acc)];
            return [j(out) === j([0, canon({ c_a: { r_dr: 1800 } })]), j(out)];
        });
        // heldBack reads the go and not the cause: a run of another count before it spends the time of a run held back for any reason, here a change the
        // GM made before answering the list. This case is a question for the owner (2026-10-23); until they answer, this is the rule Help says
        tcH('1.5.5, any run of the character\'s before it is a run before it, whatever held it back: under Ask me a day Kael slept lists Drain and the Sleep draw; you wake him and apply: Drain is made first, and the draw, held back, does nothing and its day is spent; listed the other way round, the draw is made first, held back with no run before it, and keeps its day', () => {
            if (!trSrcE) return [false, 'sheets.js has no timerules slice'];
            const run = ids => { const E = mkE(sysOfE(ids), kaelE({ f_sl: true }), { time: 'confirm' }), ch = E.camp.chars.c_a; E.W.api.moveBy(86400); const l = (E.W.api.st().pend || { fires: [] }).fires.map(x => x.c + ':' + x.r + ':' + x.n); ch.values.f_sl = false; E.W.api.onWinClick({ target: findN(E.W.body, 'cal-pend-apply')[0] }); return [l, ppE(ch), canon(E.camp.clock.acc)]; };
            const out = [run(['r_dr', 'r_sl']), run(['r_sl', 'r_dr'])];
            return [j(out) === j([[['c_a:r_dr:24', 'c_a:r_sl:1'], 0, null], [['c_a:r_sl:1', 'c_a:r_dr:24'], 0, canon({ c_a: { r_sl: 86400 } })]]), j(out)];
        });
    }
    check('the running clock is wired and said (pinned): one look a second from the page\'s wiring; a minute banked tells the table and writes quietly, never through a save; the chip\'s mark in the page; Help\'s Calendar list, the integration guide\'s keys and What\'s New in both copies; its styles',
        calJs.includes("import { save, saveView, toast } from './io.js';") && calJs.includes("    if (typeof setInterval === 'function') setInterval(function() { try { liveTick(Date.now()); } catch (e) {} }, 1000);")
        && calJs.includes("    if (live === true) { if (net() && net().syncClock) net().syncClock(); saveView(); } else save();") && calJs.includes("if (live === true) saveView(); else save();")
        && ix.includes('<span class="clock-run" aria-hidden="true"></span><span class="clock-txt"></span></button>') && ix.includes('<li><b>The clock runs by itself</b> while you host a session') && ix.includes('the clock running by itself, or the rounds of a fight for everyone not in it') && ci.includes('"hold": true (1.5.4) keeps the clock from running by itself while the GM hosts a session') && ci.includes('"rate": 2, 5, 10 or 60 (1.5.4)')
        && wn.includes('- The game clock runs by itself while you host a session') && wa.includes('- The game clock runs by itself while you host a session') && /\n  \.hdr-clock \.clock-run \{ /.test(cssJ) && /\n  \.cal-live \{ /.test(cssJ));
    }

    }
    summed = true;
    console.log(NL + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exit(1);
})();

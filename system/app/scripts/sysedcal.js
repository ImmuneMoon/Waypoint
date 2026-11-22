/* sysedcal.js: a part of sheets.js (docs/REFACTOR_SPLIT_PLAN.md, area 7, the System editor; split 2026-11-19 with no change in behavior).
   What it holds: the Calendar tab and the Senses box: the calendar and its other calendars,
   leap rules, the Rests box with what a rest does and takes back (restDoes, restTakeBack, restRecJoin, which run when a rest is
   called), and the system's senses with a band's noticing (from [sinkcheck:calendarbox-start] to [sinkcheck:sensesbox-end]).
   Why it looks this way: these lines stood in sheets.js, and they still run exactly where they stood. sheets.js calls sysedCal() at
   its line `// [split:sysedcal.js]`, so the body below runs in the old order, after everything above that line and before everything
   below it. The body keeps its lines at the left margin inside the install function, unchanged, so that every test that reads
   sheets.js (through tools/srcjoin.js, which puts these lines back) sees the old file. The first lines import what the body uses of
   sheets.js (live, so a value sheets.js changes later is read as it is then); the last line hands back the names sheets.js uses of it.
   Neither side may assign the other's names (tools/splitcheck.js holds it): the editor's own state (draft, dirty, tab, layoutView and
   the rest) stands in sheets.js and a part sets it through the setters beside `var draft`. Change the code here as if it still stood
   in sheets.js. */
// [split:of sheets.js]
import { CAL_LIMITS, F, LIGHT_UNITS, LIMITS, REST_MAX, afterCharChange, applyAction, budgetNote, calPreset, charById, cleanCalendar, clone, commitMany, dateOf, dayLength, draft, el, entryNames, entryPick, errorCell, everySecs, fmtDate, fmtSpan, fmtWhen, followQuiet, getActiveCampaign, gmViewFields, input, keepPlace, labeledSelect, lastChange, lastChangeSet, markDirty, patchErrors, pressHold, refreshErrors, renderAll, restAtOf, restRevKeep, rolled, save, secretFieldIds, segPut, select, showConfirm, tab, timeOf, toast, ui, uid } from './sheets.js';   // [split:glue]
export function sysedCal() {   // [split:glue]
// [split:body-start]
// [sinkcheck:calendarbox-start]
// Item 20 K1 (docs/CALENDAR_PLAN.md; the owner's answers of 2026-09-30): the system's calendar, the System editor's Calendar tab — a year's
// periods in order (a name, its days, whether it stands outside the month count: a festival week, a holiday), the week's days and which
// one day 1 is, the day's hours, minutes and seconds, the year of day 1 with the label after it and whether years count down, and a leap
// rule. Every text lands as a value or a text node; Save cleans it (calendarcore cleanCalendar) and refreshErrors says what it would drop
// 1.6.2 (backlog 60): the tab edits the main calendar or another one (_calK, 1 the first other), the same rows for either
var _calK = 0;
function calMain() { if (!draft.calendar || typeof draft.calendar !== 'object' || Array.isArray(draft.calendar)) draft.calendar = {}; return draft.calendar; }
function calOther(m) { var os = m && Array.isArray(m.others) ? m.others : null, o = os && _calK >= 1 && Math.floor(_calK) === _calK ? os[_calK - 1] : null; return o && typeof o === 'object' && !Array.isArray(o) ? o : null; }
function calDraft() { var m = calMain(), o = calOther(m); if (_calK && !o) _calK = 0; return o || m; }
function calOf() { var m = draft && draft.calendar && typeof draft.calendar === 'object' && !Array.isArray(draft.calendar) ? draft.calendar : {}, o = calOther(m); if (_calK && !o) _calK = 0; return o || m; }
function calNum(cls, value, title, min, max, cap) {
    var l = el('label', 'sys-num'); if (cap) l.appendChild(el('span', 'sys-num-cap', cap));
    var n = el('input', 'field ' + cls); n.type = 'number'; n.min = String(min); n.max = String(max); n.step = '1'; n.value = typeof value === 'number' && isFinite(value) ? String(value) : ''; n.title = title;
    l.appendChild(n); return l;
}
function calSums(cal) {   // [the year's length in words, day 1 and a year on as the clock reads them]: the calendar as Save would keep it
    var cc = cleanCalendar(cal), ps = cc && cc.periods ? cc.periods : [], base = 0; ps.forEach(function(p) { base += p.days; });
    if (!ps.length) return ['No periods: the clock counts days (Day 1, Day 2 \u2026).', _calK ? 'World day 1 reads: ' + fmtDate(cc, otherAt(cal) * dayLength(cc)) + '.' : 'Day 1 reads: ' + fmtWhen(cc, 0) + '.'];
    var ms = ps.filter(function(p) { return !p.extra; }).length, ex = ps.length - ms, rls = (cc.leap ? [cc.leap] : []).concat(cc.leaps || []), lp = rls.length === 1 ? rls[0].days : 0, y2 = timeOf(cc, { yi: 1, period: 0, pday: 1 });
    return [base + ' days a year' + (lp ? ' (' + (base + lp) + ' in a leap year)' : rls.length > 1 ? ' (longer in its leap years)' : '') + ': ' + ms + ' month' + (ms === 1 ? '' : 's') + (ex ? ' and ' + ex + ' period' + (ex === 1 ? '' : 's') + ' outside the month count' : '') + '.',
        (_calK ? 'World day 1 reads: ' + fmtDate(cc, otherAt(cal) * dayLength(cc)) + '.' : 'Day 1 reads: ' + fmtWhen(cc, 0) + (y2 !== null ? '. A year on: ' + fmtDate(cc, y2) : '') + '.')];
}
function renderCalendar() { var box = ui('sysCalendar'); if (!box) return; var st = box.scrollTop; box.textContent = ''; calendarBox(box, calOf()); if (typeof restsBox === 'function') box.appendChild(restsBox()); box.scrollTop = st; }   // the pane scrolls: a redraw keeps its place
function calendarBox(box, cal) {
    var wrap = el('div', 'sys-cal');
    wrap.appendChild(el('div', 'sys-light-head', 'Calendar'));
    wrap.appendChild(el('div', 'sys-note', 'The calendar your game keeps: its months and other periods, its week, its day and how its years are numbered. With none, a plain count of days of 24 hours.'));
    calStrip(wrap, cal);
    var pr = el('div', 'sys-flags sys-cal-presets'); pr.appendChild(el('span', 'sys-num-cap', 'Start from'));
    [['twelve', 'Twelve months', 'The real-world year: twelve months, a seven-day week, a leap day in February every fourth year. It replaces what is here.'], ['days', 'A plain count of days', 'No calendar: the clock counts days (Day 1, Day 2 \u2026). It clears what is here.']].forEach(function(p) {
        var b = el('button', 'tool ghost sys-btn sys-cal-preset', p[1]); b.dataset.act = 'calpreset'; b.dataset.preset = p[0]; b.title = p[2]; pr.appendChild(b);
    });
    wrap.appendChild(pr);
    wrap.appendChild(el('div', 'sys-cal-sub', 'Periods, in year order'));
    var ps = Array.isArray(cal.periods) ? cal.periods : [];
    ps.forEach(function(p0, i) {
        var p = p0 && typeof p0 === 'object' ? p0 : {}, rw = el('div', 'sys-flags sys-cal-prow'); rw.dataset.ci = String(i);
        var nm = input('sys-cal-pname field', typeof p.name === 'string' ? p.name : '', 'This period\u2019s name: a month (First, January), a festival week or a holiday', 'Name'); nm.maxLength = CAL_LIMITS.name; rw.appendChild(nm);
        rw.appendChild(calNum('sys-cal-pdays', p.days, 'How many days it holds (1 to ' + CAL_LIMITS.periodDays + ')', 1, CAL_LIMITS.periodDays, i === 0 ? 'Days' : ''));
        var xl = el('label', 'sys-cal-tick'), xc = el('input', 'sys-cal-pextra'); xc.type = 'checkbox'; xc.checked = p.extra === true; xc.title = 'Outside the month count: a festival week or a holiday between months, never numbered as a month';
        xl.appendChild(xc); xl.appendChild(document.createTextNode(' Outside the month count')); rw.appendChild(xl);
        [['up', '\u25b2', 'Move up'], ['down', '\u25bc', 'Move down'], ['del', '\u00d7', 'Remove']].forEach(function(bd) { var bb = el('button', 'tool ghost sys-btn', bd[1]); bb.dataset.act = 'calp' + bd[0]; bb.title = bd[2]; (typeof segPut === 'function' ? segPut(rw, bb) : rw.appendChild(bb)); });
        wrap.appendChild(rw);
    });
    var pa = el('button', 'tool ghost sys-btn sys-cal-padd', '+ Period'); pa.dataset.act = 'calpadd'; pa.disabled = ps.length >= CAL_LIMITS.periods; pa.title = pa.disabled ? 'At most ' + CAL_LIMITS.periods : 'A month, a festival week or a holiday, at the end of the year'; wrap.appendChild(pa);
    wrap.appendChild(el('div', 'sys-cal-sub', 'The week'));
    var wk = Array.isArray(cal.week) ? cal.week : [];
    wk.forEach(function(w, i) {
        var rw = el('div', 'sys-flags sys-cal-wrow'); rw.dataset.wi = String(i);
        var wi = input('sys-cal-wname field', typeof w === 'string' ? w : '', 'This weekday\u2019s name', 'Day ' + (i + 1)); wi.maxLength = CAL_LIMITS.name; rw.appendChild(wi);
        [['up', '\u25b2', 'Move up'], ['down', '\u25bc', 'Move down'], ['del', '\u00d7', 'Remove']].forEach(function(bd) { var bb = el('button', 'tool ghost sys-btn', bd[1]); bb.dataset.act = 'calw' + bd[0]; bb.title = bd[2]; (typeof segPut === 'function' ? segPut(rw, bb) : rw.appendChild(bb)); });
        wrap.appendChild(rw);
    });
    var wa = el('button', 'tool ghost sys-btn sys-cal-wadd', '+ Weekday'); wa.dataset.act = 'calwadd'; wa.disabled = wk.length >= CAL_LIMITS.week; wa.title = wa.disabled ? 'At most ' + CAL_LIMITS.week : 'A day of the week, at its end; the week runs on across months and years'; wrap.appendChild(wa);
    if (wk.length) wrap.appendChild(labeledSelect('sys-cal-first', 'Day 1 is a', wk.map(function(w, i) { return [String(i), typeof w === 'string' && w.trim() ? w : 'Day ' + (i + 1)]; }), String(typeof cal.first === 'number' ? cal.first : 0), 'The weekday of the very first day; the week runs on from it'));
    if (!_calK) {
    wrap.appendChild(el('div', 'sys-cal-sub', 'The day'));
    var dr = el('div', 'sys-flags sys-cal-day');
    dr.appendChild(calNum('sys-cal-hours', typeof cal.hours === 'number' ? cal.hours : 24, 'Hours in a day (1 to ' + CAL_LIMITS.hours + ')', 1, CAL_LIMITS.hours, 'Hours a day'));
    dr.appendChild(calNum('sys-cal-minutes', typeof cal.minutes === 'number' ? cal.minutes : 60, 'Minutes in an hour (1 to ' + CAL_LIMITS.minutes + ')', 1, CAL_LIMITS.minutes, 'Minutes an hour'));
    dr.appendChild(calNum('sys-cal-seconds', typeof cal.seconds === 'number' ? cal.seconds : 60, 'Seconds in a minute (1 to ' + CAL_LIMITS.seconds + ')', 1, CAL_LIMITS.seconds, 'Seconds a minute'));
    wrap.appendChild(dr);
    }
    wrap.appendChild(el('div', 'sys-cal-sub', 'Years'));
    var yr = el('div', 'sys-flags sys-cal-years');
    yr.appendChild(calNum('sys-cal-one', typeof cal.one === 'number' ? cal.one : 1, 'The year the very first day falls in', -CAL_LIMITS.year, CAL_LIMITS.year, 'Day 1 is in year'));
    var eraL = el('label', 'sys-num'); eraL.appendChild(el('span', 'sys-num-cap', 'After the year'));
    var eraI = input('sys-cal-era field', typeof cal.era === 'string' ? cal.era : '', 'A label after the year\u2019s number (BCE, CE); empty: none', 'e.g. BCE'); eraI.maxLength = CAL_LIMITS.era; eraL.appendChild(eraI); yr.appendChild(eraL);
    var dnL = el('label', 'sys-cal-tick'), dnC = el('input', 'sys-cal-down'); dnC.type = 'checkbox'; dnC.checked = cal.down === true; dnC.title = 'Years count down, as a count before an event does: 3964, then 3963';
    dnL.appendChild(dnC); dnL.appendChild(document.createTextNode(' Years count down')); yr.appendChild(dnL);
    wrap.appendChild(yr);
    var lp = cal.leap && typeof cal.leap === 'object' && !Array.isArray(cal.leap) ? cal.leap : null, lr = el('div', 'sys-flags sys-cal-leap'), lx = Array.isArray(cal.leaps) ? cal.leaps : [];
    var lpL = el('label', 'sys-cal-tick'), lpC = el('input', 'sys-cal-leapon'); lpC.type = 'checkbox'; lpC.checked = !!lp || lx.length > 0; lpC.disabled = !ps.length && !lp; lpC.title = ps.length ? 'Some years are longer: a period gains days every so many years' : 'Add a period first: a leap year\u2019s days go into one';
    lpL.appendChild(lpC); lpL.appendChild(document.createTextNode(' Leap years')); lr.appendChild(lpL);
    if (lp) {
        lr.appendChild(calNum('sys-cal-levery', lp.every, 'Every how many years (2 to ' + CAL_LIMITS.leapEvery + ')', 2, CAL_LIMITS.leapEvery, 'Every (years)'));
        lr.appendChild(calNum('sys-cal-lfrom', lp.from, 'A leap year, as the calendar numbers it: the rule counts from it both ways', -CAL_LIMITS.year, CAL_LIMITS.year, 'Counting from year'));
        lr.appendChild(calNum('sys-cal-ldays', lp.days, 'How many days a leap year adds (1 to ' + CAL_LIMITS.leapDays + ')', 1, CAL_LIMITS.leapDays, 'Days more'));
        if (ps.length) lr.appendChild(labeledSelect('sys-cal-lperiod', 'In', ps.map(function(p, i) { return [String(i), p && typeof p.name === 'string' && p.name.trim() ? p.name : 'Period ' + (i + 1)]; }), String(lp.period), 'The period that gains the days'));
        if (ps.length) { var th0 = el('button', 'tool ghost sys-btn sys-cal-lthen', '+ Then'); th0.dataset.act = 'callthen0'; th0.title = 'Its days take turns: the next leap year they go to another period'; lr.appendChild(th0); }
    }
    wrap.appendChild(lr);
    leapRows(wrap, cal, ps, lp, lx);
    // 1.6.2 (backlog 147; the owner, by prompt: "Moons and phases", "Seasons"): each season by the day of the year it begins on, each moon by its cycle
    if (!_calK) {
    wrap.appendChild(el('div', 'sys-cal-sub', 'Seasons'));
    var ss = Array.isArray(cal.seasons) ? cal.seasons : [];
    ss.forEach(function(s0, i) {
        var s = s0 && typeof s0 === 'object' ? s0 : {}, rw = el('div', 'sys-flags sys-cal-srow'); rw.dataset.si = String(i);
        var nm = input('sys-cal-sname field', typeof s.name === 'string' ? s.name : '', 'This season\u2019s name: Spring, the Wet, Long Night', 'Name'); nm.maxLength = CAL_LIMITS.name; rw.appendChild(nm);
        if (ps.length) rw.appendChild(labeledSelect('sys-cal-speriod', 'Begins in', ps.map(function(p, k) { return [String(k), p && typeof p.name === 'string' && p.name.trim() ? p.name : 'Period ' + (k + 1)]; }), String(typeof s.period === 'number' ? s.period : 0), 'The period the season begins in'));
        rw.appendChild(calNum('sys-cal-sday', typeof s.day === 'number' ? s.day : 1, 'The day of that period it begins on', 1, CAL_LIMITS.periodDays, 'On day'));
        var sd = el('button', 'tool ghost sys-btn', '\u00d7'); sd.dataset.act = 'calsdel'; sd.title = 'Remove'; rw.appendChild(sd);
        wrap.appendChild(rw);
    });
    var sa = el('button', 'tool ghost sys-btn sys-cal-sadd', '+ Season'); sa.dataset.act = 'calsadd'; sa.disabled = !ps.length || ss.length >= CAL_LIMITS.seasons; sa.title = !ps.length ? 'Add a period first: a season begins on a day of one' : ss.length >= CAL_LIMITS.seasons ? 'At most ' + CAL_LIMITS.seasons : 'A season, from the day it begins on until the next one begins'; wrap.appendChild(sa);
    wrap.appendChild(el('div', 'sys-cal-sub', 'Moons'));
    var mo = Array.isArray(cal.moons) ? cal.moons : [];
    mo.forEach(function(m0, i) {
        var m = m0 && typeof m0 === 'object' ? m0 : {}, rw = el('div', 'sys-flags sys-cal-mrow'); rw.dataset.mi = String(i);
        var nm = input('sys-cal-mname field', typeof m.name === 'string' ? m.name : '', 'This moon\u2019s name', 'Name'); nm.maxLength = CAL_LIMITS.name; rw.appendChild(nm);
        var cy = calNum('sys-cal-mcycle', m.cycle, 'The days from one new moon to the next, to the hundredth (2 to ' + CAL_LIMITS.cycle + ')', 2, CAL_LIMITS.cycle, 'Days a cycle'); cy.querySelector('input').step = '0.01'; rw.appendChild(cy);
        var at = calNum('sys-cal-mat', typeof m.at === 'number' ? m.at : 0, 'How many days into its cycle it is on day 1. 0 is a new moon, half its cycle a full moon', 0, CAL_LIMITS.cycle, 'Days in on day 1'); at.querySelector('input').step = '0.01'; rw.appendChild(at);
        var md = el('button', 'tool ghost sys-btn', '\u00d7'); md.dataset.act = 'calmdel'; md.title = 'Remove'; rw.appendChild(md);
        wrap.appendChild(rw);
    });
    var ma = el('button', 'tool ghost sys-btn sys-cal-madd', '+ Moon'); ma.dataset.act = 'calmadd'; ma.disabled = mo.length >= CAL_LIMITS.moons; ma.title = ma.disabled ? 'At most ' + CAL_LIMITS.moons : 'A moon: the Calendar shows its phase on every day'; wrap.appendChild(ma);
    }
    var sm = calSums(cal), s1 = el('div', 'sys-note sys-cal-sum', sm[0]), s2 = el('div', 'sys-note sys-cal-preview', sm[1]); s1.id = 'sysCalSum'; s2.id = 'sysCalPreview';
    wrap.appendChild(s1); wrap.appendChild(s2);
    var err = errorCell('calendar'); err.dataset.errFor = 'calendar'; wrap.appendChild(err);
    box.appendChild(wrap);
}
// [systemcheck:leaprows-start]
// 1.6.2 (backlog 60; the owner, 2026-11-07, by prompt: "Several rules", "Yes, a rule may rotate"): the leap rules beside the first, each with
// its own years and days and the periods its days take turns through, in order. The first rule stays as it was while it names one period
function leapPeriodOpts(ps) { return ps.map(function(p, i) { return [String(i), p && typeof p.name === 'string' && p.name.trim() ? p.name : 'Period ' + (i + 1)]; }); }
function leapRows(wrap, cal, ps, lp, lx) {
    if (!ps.length) return;
    lx.forEach(function(r0, k) {
        var r = r0 && typeof r0 === 'object' ? r0 : {}, rw = el('div', 'sys-flags sys-cal-lrow'); rw.dataset.lk = String(k);
        rw.appendChild(el('span', 'sys-num-cap sys-cal-lname', 'Rule ' + (k + (lp ? 2 : 1))));
        rw.appendChild(calNum('sys-cal-lxevery', r.every, 'Every how many years (2 to ' + CAL_LIMITS.leapEvery + ')', 2, CAL_LIMITS.leapEvery, 'Every (years)'));
        rw.appendChild(calNum('sys-cal-lxfrom', r.from, 'A leap year of this rule, as the calendar numbers it. Its days go to the first period in that year', -CAL_LIMITS.year, CAL_LIMITS.year, 'Counting from year'));
        rw.appendChild(calNum('sys-cal-lxdays', r.days, 'How many days its leap year adds (1 to ' + CAL_LIMITS.leapDays + ')', 1, CAL_LIMITS.leapDays, 'Days more'));
        var tu = Array.isArray(r.periods) ? r.periods : [];
        tu.forEach(function(pi, ti) {
            var sl = labeledSelect('sys-cal-lturn', ti === 0 ? 'In' : 'then', leapPeriodOpts(ps), String(typeof pi === 'number' ? pi : 0), ti === 0 ? 'The period that gains the days first' : 'The period that gains them the next leap year, in turn'); sl.dataset.ti = String(ti); rw.appendChild(sl);
            if (tu.length > 1) { var td = el('button', 'tool ghost sys-btn sys-cal-ltdel', '\u00d7'); td.dataset.act = 'callturndel'; td.dataset.ti = String(ti); td.title = 'Take this period out of the turns'; rw.appendChild(td); }
        });
        var tha = el('button', 'tool ghost sys-btn sys-cal-lthen', '+ Then'); tha.dataset.act = 'callturnadd'; tha.disabled = tu.length >= CAL_LIMITS.leapTurns; tha.title = tha.disabled ? 'At most ' + CAL_LIMITS.leapTurns : 'Its days take turns: the next leap year they go to another period'; rw.appendChild(tha);
        var rd = el('button', 'tool ghost sys-btn sys-cal-lrdel', 'Remove rule'); rd.dataset.act = 'callruledel'; rd.title = 'Remove this leap rule'; rw.appendChild(rd);
        wrap.appendChild(rw);
    });
    if (lp || lx.length) { var ra = el('button', 'tool ghost sys-btn sys-cal-ladd', '+ Leap rule'); ra.dataset.act = 'calruleadd'; ra.disabled = lx.length >= CAL_LIMITS.leaps; ra.title = ra.disabled ? 'At most ' + CAL_LIMITS.leaps + ' more' : 'Another rule beside it: other years, other days, other periods'; wrap.appendChild(ra); }
}
function leapRuleOf(t) { var cal = calDraft(), rw = t.closest ? t.closest('.sys-cal-lrow') : null, k = rw ? +rw.dataset.lk : -1; return Array.isArray(cal.leaps) && k >= 0 && Math.floor(k) === k && cal.leaps[k] && typeof cal.leaps[k] === 'object' ? { cal: cal, k: k, r: cal.leaps[k] } : null; }
function leapInput(t, c, numV) {
    if (!(c.indexOf('sys-cal-lxevery') >= 0 || c.indexOf('sys-cal-lxfrom') >= 0 || c.indexOf('sys-cal-lxdays') >= 0)) return false;
    var q = leapRuleOf(t); if (!q) return true;
    var lk = c.indexOf('sys-cal-lxevery') >= 0 ? 'every' : c.indexOf('sys-cal-lxfrom') >= 0 ? 'from' : 'days', ln = numV(); if (ln === null) delete q.r[lk]; else q.r[lk] = ln;
    return 'input';
}
function leapChange(t, c) {
    if (c.indexOf('sys-cal-lturn') < 0) return false;
    var q = leapRuleOf(t), sl = t.closest ? t.closest('[data-ti]') : null, ti = sl ? +sl.dataset.ti : -1, v = Number(t.value), cal = calDraft();
    if (!q || !Array.isArray(q.r.periods) || !(ti >= 0 && ti < q.r.periods.length && Math.floor(ti) === ti) || !(v >= 0 && Math.floor(v) === v && Array.isArray(cal.periods) && v < cal.periods.length)) return true;
    q.r.periods[ti] = v; return 'change';
}
function leapClick(b) {
    var act = b.dataset.act || '', cal = calDraft(), lx = Array.isArray(cal.leaps) ? cal.leaps : null;
    if (act === 'callthen0') {   // the first rule takes turns: it moves beside the others as their first, with the period after its own next
        var lp = cal.leap && typeof cal.leap === 'object' && !Array.isArray(cal.leap) ? cal.leap : null, n = Array.isArray(cal.periods) ? cal.periods.length : 0; if (!lp || !n) return true;
        var p0 = typeof lp.period === 'number' ? lp.period : 0, r = {}; ['every', 'from', 'days'].forEach(function(k) { if (lp[k] !== undefined) r[k] = lp[k]; }); r.periods = [p0, (p0 + 1) % n];
        cal.leaps = [r].concat(lx || []).slice(0, CAL_LIMITS.leaps); delete cal.leap;
    } else if (act === 'calruleadd') {
        var all = (lx || []); if (all.length >= CAL_LIMITS.leaps) { toast('At most ' + CAL_LIMITS.leaps + ' more.'); return true; }
        all.push({ every: 4, from: typeof cal.one === 'number' ? cal.one : 1, days: 1, periods: [0] }); cal.leaps = all;
    } else if (act === 'callruledel' || act === 'callturnadd' || act === 'callturndel') {
        var q = leapRuleOf(b); if (!q) return true;
        if (act === 'callruledel') { cal.leaps.splice(q.k, 1); if (!cal.leaps.length) delete cal.leaps; }
        else { var tu = Array.isArray(q.r.periods) ? q.r.periods : (q.r.periods = []), m = Array.isArray(cal.periods) ? cal.periods.length : 0;
            if (act === 'callturnadd') { if (tu.length >= CAL_LIMITS.leapTurns || !m) return true; tu.push(tu.length ? (tu[tu.length - 1] + 1) % m : 0); }
            else { var ti = +b.dataset.ti; if (!(ti >= 0 && ti < tu.length && Math.floor(ti) === ti) || tu.length < 2) return true; tu.splice(ti, 1); } }
    } else return false;
    markDirty(); renderAll(); return true;
}
// A period moved or removed: the rules' turns follow it, and a rule left with none goes
function leapFollow(cal, op, i, j) {
    if (!Array.isArray(cal.leaps)) return;
    cal.leaps.forEach(function(r) { if (!r || typeof r !== 'object' || !Array.isArray(r.periods)) return;
        r.periods = r.periods.filter(function(p) { return !(op === 'del' && p === i); }).map(function(p) { if (typeof p !== 'number') return p; if (op === 'del') return p > i ? p - 1 : p; return p === i ? j : p === j ? i : p; }); });
    cal.leaps = cal.leaps.filter(function(r) { return !(r && typeof r === 'object' && Array.isArray(r.periods) && !r.periods.length); });
    if (!cal.leaps.length) delete cal.leaps;
}
// [systemcheck:leaprows-end]
// [systemcheck:calstrip-start]
// 1.6.2 (backlog 60; the owner, 2026-11-07, by prompt: "Yes, header shows one"): other calendars over the same days. A strip picks the one the tab
// edits; another calendar has a name and the day of its own count that world day 1 falls on, and the main calendar's day, so no Day, Seasons or Moons
function otherAt(o) { var v = o && typeof o.at === 'number' && isFinite(o.at) ? Math.floor(o.at) : 0; return v > 0 ? v : 0; }
function calStrip(wrap, cal) {
    var m = calMain(), os = Array.isArray(m.others) ? m.others : [], st = el('div', 'sys-flags sys-cal-cals');
    [null].concat(os).forEach(function(o, k) { var nm = k ? (o && typeof o.name === 'string' && o.name.trim() ? o.name : 'Calendar ' + (k + 1)) : 'The main calendar', b = el('button', 'tool ghost sys-btn sys-cal-pick' + (k === _calK ? ' on' : ''), nm); b.dataset.act = 'calpick'; b.dataset.k = String(k); b.title = k ? 'Edit this calendar: the same days, counted its own way' : 'Edit the calendar the game keeps'; b.ariaPressed = k === _calK ? 'true' : 'false'; st.appendChild(b); });
    var add = el('button', 'tool ghost sys-btn sys-cal-oadd', '+ Another calendar'); add.dataset.act = 'calother'; add.disabled = os.length >= CAL_LIMITS.others; add.title = add.disabled ? 'At most ' + CAL_LIMITS.others : 'The same days as another people counts them. The Calendar shows the day in each, and the top row the one you pick'; st.appendChild(add);
    wrap.appendChild(st);
    if (!_calK) return;
    var row = el('div', 'sys-flags sys-cal-orow'), nmI = input('sys-cal-oname field', typeof cal.name === 'string' ? cal.name : '', 'This calendar\u2019s name, as the Calendar and the top row say it', 'Name'); nmI.maxLength = CAL_LIMITS.name; row.appendChild(nmI);
    var rm = el('button', 'tool ghost sys-btn sys-cal-odel', 'Remove this calendar'); rm.dataset.act = 'calodel'; rm.title = 'Take this calendar away. The main calendar stays'; row.appendChild(rm);
    wrap.appendChild(row);
    var cc = cleanCalendar(cal, true) || {}, ps = cc.periods || [], dl = dayLength(cc), d = dateOf(cc, otherAt(cal) * dl), at = el('div', 'sys-flags sys-cal-oat');
    at.appendChild(el('span', 'sys-num-cap', 'World day 1 falls on'));
    if (ps.length) {
        at.appendChild(calNum('sys-cal-oday', d.pday, 'The day of that period', 1, CAL_LIMITS.periodDays, 'Day'));
        at.appendChild(labeledSelect('sys-cal-operiod', 'Of', ps.map(function(p, i) { return [String(i), p.name]; }), String(d.period), 'The period of this calendar'));
        at.appendChild(calNum('sys-cal-oyear', d.year, 'The year, as this calendar numbers it', -CAL_LIMITS.year, CAL_LIMITS.year, 'Year'));
    } else at.appendChild(calNum('sys-cal-oday', d.pday, 'Its own day count on world day 1', 1, CAL_LIMITS.otherAt, 'Its day'));
    wrap.appendChild(at);
}
// The day world day 1 falls on, from the three boxes: written as days since this calendar's day 1, or refused in words
function otherAtSet(cal, box) {
    var cc = cleanCalendar(cal, true) || {}, ps = cc.periods || [], q = function(c) { var e = box.querySelector('.' + c); return e ? Number(e.value) : NaN; }, t;
    if (ps.length) t = timeOf(cc, { year: q('sys-cal-oyear'), period: q('sys-cal-operiod'), pday: q('sys-cal-oday') }); else { var n = q('sys-cal-oday'); t = n >= 1 && Math.floor(n) === n ? (n - 1) * dayLength(cc) : null; }
    if (t === null || !(t >= 0)) { toast('That day is not in this calendar, or falls before its first day.'); return false; }
    var dd = Math.floor(t / dayLength(cc)); if (dd > CAL_LIMITS.otherAt) { toast('That day is too far into this calendar.'); return false; }
    if (dd) cal.at = dd; else delete cal.at; return true;
}
function calStripClick(b) {
    var act = b.dataset.act || '', m = calMain();
    if (act === 'calpick') { var k = +b.dataset.k, n = Array.isArray(m.others) ? m.others.length : 0; if (!(k >= 0 && k <= n && Math.floor(k) === k)) return true; _calK = k; renderAll(); return true; }
    if (act === 'calother') { var os = Array.isArray(m.others) ? m.others : (m.others = []); if (os.length >= CAL_LIMITS.others) { toast('At most ' + CAL_LIMITS.others + '.'); return true; } os.push({ name: '' }); _calK = os.length; markDirty(); renderAll(); return true; }
    if (act === 'calodel') { var o = calOther(m); if (!o) return true; m.others.splice(_calK - 1, 1); if (!m.others.length) delete m.others; _calK = 0; markDirty(); renderAll(); return true; }
    return false;
}
// [systemcheck:calstrip-end]
function calRefreshText() { var sm = calSums(calOf()), a = ui('sysCalSum'), b = ui('sysCalPreview'); if (a) a.textContent = sm[0]; if (b) b.textContent = sm[1]; }
function onCalendarInput(t) {
    var c = t.className || ''; if (typeof c !== 'string' || c.indexOf('sys-cal-') < 0) return false;
    var cal = calDraft(), numV = function() { var v = Number(t.value); return String(t.value).trim() !== '' && isFinite(v) ? v : null; };
    var lx = leapInput(t, c, numV); if (lx === true) return true; if (lx) { markDirty(); patchErrors(); calRefreshText(); return true; }   // 1.6.2: a leap rule beside the first
    if (c.indexOf('sys-cal-oname') >= 0) { if (_calK) cal.name = String(t.value).slice(0, CAL_LIMITS.name * 2); markDirty(); patchErrors(); return true; }   // 1.6.2 (backlog 60): another calendar's name
    if (c.indexOf('sys-cal-oyear') >= 0 || c.indexOf('sys-cal-oday') >= 0) return true;   // ... the day it begins on is read when a box is left
    if (c.indexOf('sys-cal-pname') >= 0 || c.indexOf('sys-cal-pdays') >= 0) {
        var prw = t.closest ? t.closest('.sys-cal-prow') : null, i = prw ? +prw.dataset.ci : -1, p = Array.isArray(cal.periods) && i >= 0 && Math.floor(i) === i && cal.periods[i] && typeof cal.periods[i] === 'object' ? cal.periods[i] : null; if (!p) return true;
        if (c.indexOf('sys-cal-pname') >= 0) p.name = String(t.value).slice(0, CAL_LIMITS.name * 2); else { var d = numV(); if (d === null) delete p.days; else p.days = d; }
    } else if (c.indexOf('sys-cal-sname') >= 0 || c.indexOf('sys-cal-sday') >= 0) {   // 1.6.2: a season's name and its day
        var srw = t.closest ? t.closest('.sys-cal-srow') : null, si = srw ? +srw.dataset.si : -1, s = Array.isArray(cal.seasons) && si >= 0 && Math.floor(si) === si && cal.seasons[si] && typeof cal.seasons[si] === 'object' ? cal.seasons[si] : null; if (!s) return true;
        if (c.indexOf('sys-cal-sname') >= 0) s.name = String(t.value).slice(0, CAL_LIMITS.name * 2); else { var sd = numV(); if (sd === null) delete s.day; else s.day = sd; }
    } else if (c.indexOf('sys-cal-mname') >= 0 || c.indexOf('sys-cal-mcycle') >= 0 || c.indexOf('sys-cal-mat') >= 0) {   // ... a moon's name, its cycle and where it stands on day 1
        var mrw = t.closest ? t.closest('.sys-cal-mrow') : null, mi = mrw ? +mrw.dataset.mi : -1, mo = Array.isArray(cal.moons) && mi >= 0 && Math.floor(mi) === mi && cal.moons[mi] && typeof cal.moons[mi] === 'object' ? cal.moons[mi] : null; if (!mo) return true;
        if (c.indexOf('sys-cal-mname') >= 0) mo.name = String(t.value).slice(0, CAL_LIMITS.name * 2); else { var mk = c.indexOf('sys-cal-mcycle') >= 0 ? 'cycle' : 'at', mv = numV(); if (mv === null) delete mo[mk]; else mo[mk] = mv; }
    } else if (c.indexOf('sys-cal-wname') >= 0) {
        var wrw = t.closest ? t.closest('.sys-cal-wrow') : null, k = wrw ? +wrw.dataset.wi : -1; if (!(Array.isArray(cal.week) && k >= 0 && k < cal.week.length && Math.floor(k) === k)) return true;
        cal.week[k] = String(t.value).slice(0, CAL_LIMITS.name * 2);
    } else {
        var key = ['hours', 'minutes', 'seconds', 'one'].filter(function(k0) { return c.indexOf('sys-cal-' + k0) >= 0; })[0];
        if (key) { var n = numV(); if (n === null) delete cal[key]; else cal[key] = n; }
        else if (c.indexOf('sys-cal-era') >= 0) { if (String(t.value).trim()) cal.era = String(t.value).slice(0, CAL_LIMITS.era * 2); else delete cal.era; }
        else if (c.indexOf('sys-cal-levery') >= 0 || c.indexOf('sys-cal-lfrom') >= 0 || c.indexOf('sys-cal-ldays') >= 0) {
            var lp = cal.leap && typeof cal.leap === 'object' && !Array.isArray(cal.leap) ? cal.leap : null; if (!lp) return true;
            var lk = c.indexOf('sys-cal-levery') >= 0 ? 'every' : c.indexOf('sys-cal-lfrom') >= 0 ? 'from' : 'days', ln = numV(); if (ln === null) delete lp[lk]; else lp[lk] = ln;
        } else return true;   // a tick's or a select's input event: its change event does the work
    }
    markDirty(); patchErrors(); calRefreshText(); return true;
}
function onCalendarChange(t) {
    var c = t.className || ''; if (typeof c !== 'string' || c.indexOf('sys-cal-') < 0) return false;
    var cal = calDraft();
    var lc = leapChange(t, c); if (lc === true) return true; if (lc) { markDirty(); patchErrors(); calRefreshText(); return true; }   // 1.6.2: a rule's period in turn
    if (c.indexOf('sys-cal-oyear') >= 0 || c.indexOf('sys-cal-oday') >= 0 || c.indexOf('sys-cal-operiod') >= 0) { var ob = t.closest ? t.closest('.sys-cal-oat') : null; if (_calK && ob && otherAtSet(cal, ob)) { markDirty(); patchErrors(); } renderAll(); return true; }   // 1.6.2 (backlog 60): the day world day 1 falls on
    if (c.indexOf('sys-cal-pextra') >= 0) {
        var rw = t.closest ? t.closest('.sys-cal-prow') : null, i = rw ? +rw.dataset.ci : -1, p = Array.isArray(cal.periods) && i >= 0 && Math.floor(i) === i && cal.periods[i] && typeof cal.periods[i] === 'object' ? cal.periods[i] : null; if (!p) return true;
        if (t.checked === true) p.extra = true; else delete p.extra;
    }
    else if (c.indexOf('sys-cal-down') >= 0) { if (t.checked === true) cal.down = true; else delete cal.down; }
    else if (c.indexOf('sys-cal-first') >= 0) { var f = Number(t.value); if (f > 0 && Math.floor(f) === f && Array.isArray(cal.week) && f < cal.week.length) cal.first = f; else delete cal.first; }
    else if (c.indexOf('sys-cal-leapon') >= 0) {
        if (t.checked === true) { if ((!cal.leap || typeof cal.leap !== 'object' || Array.isArray(cal.leap)) && !(Array.isArray(cal.leaps) && cal.leaps.length)) cal.leap = { every: 4, from: typeof cal.one === 'number' ? cal.one : 1, period: 0, days: 1 }; } else { delete cal.leap; delete cal.leaps; }   // 1.6.2: off takes every rule
        markDirty(); renderAll(); return true;
    }
    else if (c.indexOf('sys-cal-speriod') >= 0) { var srw2 = t.closest ? t.closest('.sys-cal-srow') : null, si2 = srw2 ? +srw2.dataset.si : -1, s2 = Array.isArray(cal.seasons) && si2 >= 0 && Math.floor(si2) === si2 && cal.seasons[si2] && typeof cal.seasons[si2] === 'object' ? cal.seasons[si2] : null, pv = Number(t.value); if (!s2 || !(pv >= 0 && Math.floor(pv) === pv && Array.isArray(cal.periods) && pv < cal.periods.length)) return true; s2.period = pv; }   // 1.6.2: the period a season begins in
    else if (c.indexOf('sys-cal-lperiod') >= 0) { var lp = cal.leap && typeof cal.leap === 'object' && !Array.isArray(cal.leap) ? cal.leap : null, v = Number(t.value); if (!lp || !(v >= 0 && Math.floor(v) === v && Array.isArray(cal.periods) && v < cal.periods.length)) return true; lp.period = v; }
    else return true;   // the boxes' change events (their input events did the work)
    markDirty(); patchErrors(); calRefreshText(); return true;
}
function calendarClick(b) {
    var act = b.dataset.act || '';
    if (calStripClick(b)) return true;   // 1.6.2 (backlog 60): which calendar the tab edits
    if (act === 'calpreset') {
        var pid = b.dataset.preset;
        if (_calK) { var mo0 = calMain(), oo = calOther(mo0); if (!oo) return true; var keep = { name: oo.name }; if (oo.at) keep.at = oo.at; var pz0 = pid === 'days' ? {} : calPreset(pid); if (!pz0) return true; delete pz0.hours; delete pz0.minutes; delete pz0.seconds; mo0.others[_calK - 1] = Object.assign(keep, pz0); markDirty(); renderAll(); return true; }
        var putCal = function() {
        if (pid === 'days') { var keptO = draft.calendar && Array.isArray(draft.calendar.others) ? draft.calendar.others : null; delete draft.calendar; if (keptO) draft.calendar = { others: keptO }; } else { var pz = calPreset(pid); if (!pz) return true; if (draft.calendar && Array.isArray(draft.calendar.others)) pz.others = draft.calendar.others; draft.calendar = pz; }   // the other calendars stay
        markDirty(); renderAll(); };
        // 1.6.3 (the review of the System editor, finding 5): a preset replaces the calendar's periods, its week and its leap rules, so a calendar that
        // holds periods is asked about first, by a button that names the act
        var calHas = draft.calendar && Array.isArray(draft.calendar.periods) && draft.calendar.periods.length;
        if (calHas && typeof showConfirm === 'function') showConfirm('Replace your calendar with this one? Its periods, week and leap rules go, and the other calendars are kept. Undo brings it back.', function(yes) { if (yes && draft) putCal(); }, { noEnter: true, yes: 'Replace' }); else putCal();
        return true;
    }
    if (/^cal(lthen0|ruleadd|ruledel|turnadd|turndel)$/.test(act)) return leapClick(b);   // 1.6.2 (backlog 60): the leap rules
    var sm2 = /^cal(s|m)(add|del)$/.exec(act);   // 1.6.2 (backlog 147): a season or a moon added at the end, or a row removed
    if (sm2) {
        var calS = calDraft(), keyS = sm2[1] === 's' ? 'seasons' : 'moons', capS = sm2[1] === 's' ? CAL_LIMITS.seasons : CAL_LIMITS.moons, arrS = Array.isArray(calS[keyS]) ? calS[keyS] : (calS[keyS] = []);
        if (sm2[2] === 'add') { if (arrS.length >= capS) { toast('At most ' + capS + '.'); return true; } arrS.push(sm2[1] === 's' ? { name: '', period: 0, day: 1 } : { name: '', cycle: 30 }); }
        else { var rwS = b.closest ? b.closest(sm2[1] === 's' ? '.sys-cal-srow' : '.sys-cal-mrow') : null, iS = rwS ? +(sm2[1] === 's' ? rwS.dataset.si : rwS.dataset.mi) : -1; if (!(iS >= 0 && iS < arrS.length && Math.floor(iS) === iS)) return true; arrS.splice(iS, 1); if (!arrS.length) delete calS[keyS]; }
        markDirty(); renderAll(); return true;
    }
    var m = /^cal(p|w)(add|up|down|del)$/.exec(act); if (!m) return false;
    var cal = calDraft(), isP = m[1] === 'p', key = isP ? 'periods' : 'week', cap = isP ? CAL_LIMITS.periods : CAL_LIMITS.week, arr = Array.isArray(cal[key]) ? cal[key] : (cal[key] = []);
    var rw = b.closest ? b.closest(isP ? '.sys-cal-prow' : '.sys-cal-wrow') : null, i = rw ? +(isP ? rw.dataset.ci : rw.dataset.wi) : -1;
    // the leap rule's period and the first weekday are places in these lists: they follow a move, and go with a remove of their own row
    var refOf = function() { return isP ? (cal.leap && typeof cal.leap === 'object' && typeof cal.leap.period === 'number' ? cal.leap.period : -1) : (typeof cal.first === 'number' ? cal.first : 0); };
    var setRef = function(v) { if (isP) { if (cal.leap && typeof cal.leap === 'object') { if (v < 0) delete cal.leap; else cal.leap.period = v; } } else if (v > 0) cal.first = v; else delete cal.first; };
    if (m[2] === 'add') { if (arr.length >= cap) { toast('At most ' + cap + '.'); return true; } arr.push(isP ? { name: '', days: 30 } : ''); }
    else if (!(i >= 0 && i < arr.length && Math.floor(i) === i)) return true;
    else {
        var r = refOf(), j = m[2] === 'up' ? i - 1 : m[2] === 'down' ? i + 1 : -1;
        if (m[2] === 'del') { arr.splice(i, 1); if (r === i) setRef(isP ? -1 : 0); else if (r > i) setRef(r - 1); if (isP) leapFollow(cal, 'del', i); }
        else if (j >= 0 && j < arr.length) { arr.splice(j, 0, arr.splice(i, 1)[0]); if (r === i) setRef(j); else if (r === j) setRef(i); if (isP) leapFollow(cal, 'move', i, j); }
        if (isP && Array.isArray(cal.seasons)) {   // 1.6.2: a season begins in a period by its place, so it follows a move, and goes with its period
            cal.seasons = cal.seasons.filter(function(s) { return !(s && typeof s === 'object' && m[2] === 'del' && s.period === i); });
            cal.seasons.forEach(function(s) { if (!s || typeof s !== 'object' || typeof s.period !== 'number') return; if (m[2] === 'del') { if (s.period > i) s.period--; } else if (j >= 0 && j < arr.length) { if (s.period === i) s.period = j; else if (s.period === j) s.period = i; } });
            if (!cal.seasons.length) delete cal.seasons;
        }
    }
    markDirty(); renderAll(); return true;
}
// [sinkcheck:calendarbox-end]
// [systemcheck:restsbox-start]
// 1.6.2 (backlog 138 (j), docs/REST_DESIGN.md fold R1; the owner, 2026-10-16, by prompt: rests "set per system per campaign", a skip as a rest "Your default,
// changeable"): the system's rests under the calendar (draft.rests, draft.restSkip; systemcore cleanRests keeps them in the GM's view alone). Each a name,
// a length and whether its time counts as rest; the Calendar window offers each when the clock moves on, and opens on the default. Every text is a value or
// a text node, the box has listeners of its own, and what Save drops is said under it as the cleaner reads it
function restUnits(sys) {
    var us = [['min', 'Minutes'], ['hour', 'Hours'], ['day', 'Days'], ['week', 'Weeks']], tu = sys && sys.combat && sys.combat.turn && Array.isArray(sys.combat.turn.units) ? sys.combat.turn.units : [];
    tu.forEach(function(u) { if (u && typeof u.key === 'string' && u.key && u.key.toLowerCase() !== 'round') us.push([u.key, typeof u.label === 'string' && u.label.trim() ? u.label.trim() : u.key]); });
    return us;
}
function restNewId(rs) { var id; do { id = 'rs_' + Math.random().toString(36).slice(2, 10).replace(/[^a-z0-9]/g, '') + 'r'; } while (rs.some(function(r) { return r && r.id === id; })); return id; }
// What a rest of that length gives, from the time rules By the clock as Save keeps them, counted from nothing (a count already under way may add one more)
function restPreview(sys, r) {
    if (!r || !r.len) return '';
    var cal = cleanCalendar(sys && sys.calendar), tu = sys && sys.combat && sys.combat.turn && Array.isArray(sys.combat.turn.units) ? sys.combat.turn.units : [], len = everySecs(cal, tu, r.len); if (!(len > 0)) return '';
    var lw = fmtSpan(cal, len), runs = [];
    (Array.isArray(sys && sys.rolls) ? sys.rolls : []).forEach(function(x) {
        if (!x || !x.every || typeof x.every !== 'object') return; if (r.time === false && x.every.rest === true) return;
        var per = everySecs(cal, tu, x.every); if (!(per > 0)) return; var n = Math.min(500, Math.floor(len / per)); if (n > 0) runs.push((typeof x.label === 'string' && x.label.trim() ? x.label.trim() : 'A time rule') + ' \u00d7' + n);
    });
    if (r.time === false) return 'Its ' + lw + ' count as activity' + (runs.length ? ': ' + runs.join(', ') + '.' : '. No time rule runs in that time.');
    return runs.length ? 'In ' + lw + ' of rest, each who rests gets: ' + runs.join(', ') + '.' : 'In ' + lw + ' of rest no time rule runs. Rules are set By the clock on the Rolls tab.';
}
// fold R4: what a rest's list can name, and each named in words
var REST_DOES_N = 8;
function restSecs(sys) { return (sys && sys.sheet && Array.isArray(sys.sheet.sections) ? sys.sheet.sections : []).filter(function(s) { return s && typeof s.id === 'string' && Array.isArray(s.fields) && s.fields.some(function(pl) { var f = pl && (sys.fields || []).filter(function(x) { return x && x.id === pl.id; })[0]; return !!f && (f.kind === 'resource' || f.counter === true); }); }); }
function restDoWord(sys, d) {
    var nm = function(x, fb) { return x && typeof (x.label || x.title || x.key) === 'string' && String(x.label || x.title || x.key).trim() ? String(x.label || x.title || x.key).trim() : fb; };
    if (d.k === 'roll') { var r = (sys.rolls || []).filter(function(x) { return x && x.id === d.id; })[0]; return (r && Array.isArray(r.apply) ? 'Run ' : 'Roll ') + nm(r, 'a roll that is gone'); }
    if (d.k === 'pool') return 'Fill ' + nm((sys.fields || []).filter(function(x) { return x && x.id === d.id; })[0], 'a pool that is gone');
    return 'Reset ' + nm((sys.sheet && Array.isArray(sys.sheet.sections) ? sys.sheet.sections : []).filter(function(x) { return x && x.id === d.id; })[0], 'a section that is gone');
}
function restDoOpts(sys, ds) {
    var has = function(k, id) { return ds.some(function(d) { return d && d.k === k && d.id === id; }); }, out = [['', 'Add\u2026']];
    (sys.rolls || []).forEach(function(r) { if (r && typeof r.id === 'string' && r.init !== true && !has('roll', r.id)) out.push(['roll:' + r.id, restDoWord(sys, { k: 'roll', id: r.id })]); });
    (sys.fields || []).forEach(function(f) { if (f && f.kind === 'resource' && typeof f.id === 'string' && !has('pool', f.id)) out.push(['pool:' + f.id, restDoWord(sys, { k: 'pool', id: f.id })]); });
    restSecs(sys).forEach(function(s) { if (!has('reset', s.id)) out.push(['reset:' + s.id, restDoWord(sys, { k: 'reset', id: s.id })]); });
    return out;
}
function restEndsWords(sys, r) {   // fold R6: which of the library's effects this rest ends, by each one's Ends with pick, else by its Duration note (systemcore fxEndsWith, the one judge)
    var S = window.wpSystemCore, nm = typeof r.name === 'string' ? r.name.trim() : '', hit = [];
    var others = (Array.isArray(sys.rests) ? sys.rests : []).map(function(x) { return x && typeof x.name === 'string' ? x.name : ''; });
    var ends = S && typeof S.fxEndsWith === 'function' ? function(d) { return S.fxEndsWith(d, null, r, others); } : S && typeof S.durNamesRest === 'function' ? function(d) { return S.durNamesRest(d.dur, nm, others); } : null;
    if (nm && ends) (Array.isArray(sys.effects) ? sys.effects : []).forEach(function(d) { if (d && ends(d)) hit.push(typeof d.name === 'string' && d.name.trim() ? d.name.trim() : 'An effect'); });
    return hit.length ? 'It ends ' + hit.join(', ') + ', and any effect made on the spot whose Duration names ' + nm + '.' : 'No effect ends with ' + (nm || 'this rest') + ' yet. Pick it under Ends with on an effect, or write Until ' + (nm || 'its name') + ' in its Duration.';
}
function restSays(sys) {
    var out = [], rs = Array.isArray(sys && sys.rests) ? sys.rests : [], kept = 0, ids = Object.create(null), us = Object.create(null);
    restUnits(sys).forEach(function(u) { us[u[0].toLowerCase()] = 1; });
    rs.forEach(function(r, i) {
        if (!r || typeof r !== 'object') return; var nm = typeof r.name === 'string' && r.name.trim() ? r.name.trim() : 'Rest ' + (i + 1);
        if (kept >= REST_MAX) { out.push(nm + ': at most ' + REST_MAX + ' rests. Save drops it.'); return; }
        if (!(typeof r.name === 'string' && r.name.trim())) { out.push(nm + ': it needs a name. Until it has one, Save drops it.'); return; }
        var L = r.len && typeof r.len === 'object' ? r.len : {}, n = L.n;
        if (!(typeof n === 'number' && Math.floor(n) === n && n >= 1 && n <= 1000)) { out.push(nm + ': Lasts takes a whole number from 1 to 1000. Save drops it.'); return; }
        if (!(typeof L.u === 'string' && us[L.u.toLowerCase()])) { out.push(nm + ': its unit is not one of the system\u2019s time units now. Save drops it.'); return; }
        kept++; ids[r.id] = 1;
    });
    if (typeof sys.restSkip === 'string' && sys.restSkip && sys.restSkip !== 'rest' && !ids[sys.restSkip]) out.push('A time skip counts as names a rest Save drops, so the Calendar window opens on Active.');
    rs.forEach(function(r, i) {   // fold R4: a roll both on a rest's list and By the clock during rest runs twice (kept, as warned)
        if (!r || typeof r !== 'object' || !Array.isArray(r.does)) return; var nm = typeof r.name === 'string' && r.name.trim() ? r.name.trim() : 'Rest ' + (i + 1);
        r.does.forEach(function(d) { if (!d) return; if (d.k === 'roll') { var x = (sys.rolls || []).filter(function(y) { return y && y.id === d.id; })[0]; if (!x) out.push(nm + ': a roll on its list is gone. Save drops it.'); else if (x.every && typeof x.every === 'object' && r.time !== false) out.push(nm + ': ' + restDoWord(sys, d).replace(/^(Roll|Run) /, '') + ' also runs By the clock, so this rest runs it twice. Save keeps it.'); } else if (d.k === 'pool' && !(sys.fields || []).some(function(f) { return f && f.id === d.id && f.kind === 'resource'; })) out.push(nm + ': a pool on its list is gone. Save drops it.'); else if (d.k === 'reset' && !restSecs(sys).some(function(s) { return s.id === d.id; })) out.push((sys.sheet && Array.isArray(sys.sheet.sections) ? sys.sheet.sections : []).some(function(s) { return s && s.id === d.id; }) ? nm + ': a section on its list holds no pool or counter now, so resetting it does nothing. Save keeps it.' : nm + ': a section on its list is gone. Save drops it.'); });
    });
    return out;
}
function restsBox() {
    var wrap = el('div', 'sys-rests');
    var draw = function() {
        wrap.textContent = ''; var sys = draft || {}, rs = Array.isArray(sys.rests) ? sys.rests : [];
        wrap.appendChild(el('div', 'sys-light-head', 'Rests'));
        wrap.appendChild(el('div', 'sys-note', 'A rest is a way time can pass, such as a short rest or a full night. You pick it in the Calendar window when you move time on, and its time counts as rest for the time rules.'));
        var opts = [['', 'Active: no rest'], ['rest', 'Rest: rest time only']].concat(rs.filter(function(r) { return r && typeof r.id === 'string'; }).map(function(r) { return [r.id, typeof r.name === 'string' && r.name.trim() ? r.name.trim() : 'A rest with no name']; }));
        var cur = typeof sys.restSkip === 'string' ? sys.restSkip : '';
        wrap.appendChild(labeledSelect('sys-rest-skip', 'A time skip counts as', opts, cur, 'What the Calendar window starts on each time it opens. You can change it there for each skip.'));
        wrap.appendChild(el('div', 'sys-note', 'What the Calendar window starts on before each skip. You can change it there.'));
        rs.forEach(function(r0, i) {
            var r = r0 && typeof r0 === 'object' ? r0 : {}, L = r.len && typeof r.len === 'object' ? r.len : {}, cd = el('div', 'sys-rest-card'); cd.dataset.ri = String(i);
            var row = el('div', 'sys-flags sys-rest-row');
            var nm = input('sys-rest-name field', typeof r.name === 'string' ? r.name : '', 'The rest\u2019s name, as the Calendar window lists it', 'Name'); nm.maxLength = 60; row.appendChild(nm);
            var ln = el('label', 'sys-num'); ln.appendChild(el('span', 'sys-num-cap', 'Lasts'));
            var lnB = el('span', 'sys-rest-len'), n = el('input', 'field sys-rest-n'); n.type = 'number'; n.min = '1'; n.max = '1000'; n.step = '1'; n.value = typeof L.n === 'number' && isFinite(L.n) ? String(L.n) : ''; n.title = 'How long it lasts: a whole number from 1 to 1000'; lnB.appendChild(n);
            var uo = restUnits(sys), uv = typeof L.u === 'string' ? L.u : 'hour'; if (!uo.some(function(o) { return o[0] === uv; })) uo.push([uv, uv + ' (not a unit now)']);
            lnB.appendChild(select('sys-rest-u', uo, uv, 'Its unit: minutes, hours, days, weeks or one of the system\u2019s own time units')); ln.appendChild(lnB); row.appendChild(ln);
            var tl = el('label', 'sys-cal-tick'), tc = el('input', 'sys-rest-time'); tc.type = 'checkbox'; tc.checked = r.time !== false; tc.title = 'Its time counts as rest for the time rules, as a step set to Rest does. Unticked, it counts as activity';
            tl.appendChild(tc); tl.appendChild(document.createTextNode(' Counts as rest time')); row.appendChild(tl);
            [['up', '\u25b2', 'Move up'], ['down', '\u25bc', 'Move down'], ['del', '\u00d7', 'Remove']].forEach(function(bd) { var bb = el('button', 'tool ghost sys-btn', bd[1]); bb.type = 'button'; bb.dataset.act = 'rest' + bd[0]; bb.title = bd[2]; (typeof segPut === 'function' ? segPut(row, bb) : row.appendChild(bb)); });
            cd.appendChild(row);
            var dw = el('div', 'sys-flags sys-rest-does'); dw.appendChild(el('span', 'sys-num-cap', 'When called, it also'));   // fold R4
            var ds = Array.isArray(r.does) ? r.does : [];
            ds.forEach(function(d, j) { var ch = el('span', 'sys-rest-chip'); ch.appendChild(document.createTextNode(restDoWord(sys, d))); var x = el('button', 'tool ghost sys-btn sys-rest-chipx', '\u00d7'); x.type = 'button'; x.dataset.act = 'restdox'; x.dataset.dj = String(j); x.title = 'Take this off the list'; ch.appendChild(x); dw.appendChild(ch); });
            if (ds.length < REST_DOES_N) { var ao = restDoOpts(sys, ds); if (ao.length > 1) dw.appendChild(select('sys-rest-doadd', ao, '', 'Add a roll or action run for each who rests, a pool filled to its most, or a section\u2019s Reset all')); }
            cd.appendChild(dw);
            var el6 = el('label', 'sys-cal-tick'), ec6 = el('input', 'sys-rest-ends'); ec6.type = 'checkbox'; ec6.checked = r.ends === true; ec6.title = 'Each who rests loses every effect that picks this rest under Ends with, and every other effect whose Duration note names this rest, such as Until a long rest'; el6.appendChild(ec6); el6.appendChild(document.createTextNode(' Ends effects that last until this rest')); cd.appendChild(el6);   // fold R6
            if (r.ends === true) cd.appendChild(el('div', 'sys-note sys-rest-endsfx', restEndsWords(sys, r)));
            var pv = restPreview(sys, r); if (pv) cd.appendChild(el('div', 'sys-note sys-rest-preview', pv));
            wrap.appendChild(cd);
        });
        var ad = el('button', 'tool ghost sys-btn sys-rest-add', '+ Rest'); ad.type = 'button'; ad.dataset.act = 'restadd'; ad.disabled = rs.length >= REST_MAX; ad.title = ad.disabled ? 'At most ' + REST_MAX + ' rests' : 'A rest with a name and a length, offered in the Calendar window'; wrap.appendChild(ad);
        restSays(sys).forEach(function(t) { wrap.appendChild(el('div', 'sys-err-line sys-rest-err', t)); });
    };
    var at = function(e) { var c = e.target && e.target.closest ? e.target.closest('.sys-rest-card') : null, i = c ? Number(c.dataset.ri) : -1, rs = Array.isArray(draft.rests) ? draft.rests : null; return rs && i >= 0 && rs[i] && typeof rs[i] === 'object' ? { rs: rs, i: i, r: rs[i] } : null; };
    var hold = typeof pressHold === 'function' && typeof window !== 'undefined' && window && typeof window.addEventListener === 'function' ? pressHold(wrap, window) : null;   // a name or a number left by a press on another control: the press lands first (io.js pressHold)
    var done = function(redraw) { if (typeof markDirty === 'function') markDirty(); if (typeof patchErrors === 'function') patchErrors(); if (!redraw) return; var again = function() { if (typeof keepPlace === 'function') keepPlace(wrap, draw); else draw(); }; if (hold && hold.busy()) hold.then(again); else again(); };   // drawn again with the focus given back to the control that held it (io.js keepPlace): a box clicked into straight after a name was typed keeps the cursor
    wrap.addEventListener('input', function(e) {
        e.stopPropagation(); var a = at(e), t = e.target; if (!a || !t || !t.classList) return;
        if (t.classList.contains('sys-rest-name')) { a.r.name = String(t.value).slice(0, 60); done(false); }
        else if (t.classList.contains('sys-rest-n')) { if (!a.r.len || typeof a.r.len !== 'object') a.r.len = {}; a.r.len.n = String(t.value).trim() === '' ? NaN : Number(t.value); done(false); }
    });
    wrap.addEventListener('change', function(e) {
        e.stopPropagation(); var t = e.target; if (!t || !t.classList) return;
        if (t.classList.contains('sys-rest-skip')) { if (t.value) draft.restSkip = String(t.value); else delete draft.restSkip; done(true); return; }
        var a = at(e); if (!a) return;
        if (t.classList.contains('sys-rest-doadd')) { var mv = /^(roll|pool|reset):(.+)$/.exec(String(t.value || '')); if (!mv) return; if (!Array.isArray(a.r.does)) a.r.does = []; if (a.r.does.length < REST_DOES_N && !a.r.does.some(function(d) { return d && d.k === mv[1] && d.id === mv[2]; })) a.r.does.push({ k: mv[1], id: mv[2] }); done(true); return; }   // fold R4
        if (t.classList.contains('sys-rest-u')) { if (!a.r.len || typeof a.r.len !== 'object') a.r.len = {}; a.r.len.u = String(t.value); }
        else if (t.classList.contains('sys-rest-time')) { if (t.checked) delete a.r.time; else a.r.time = false; }
        else if (t.classList.contains('sys-rest-ends')) { if (t.checked) a.r.ends = true; else delete a.r.ends; }   // fold R6
        done(true);
    });
    wrap.addEventListener('click', function(e) {
        var b = e.target && e.target.closest ? e.target.closest('button') : null; if (!b || !b.dataset || !/^rest/.test(b.dataset.act || '')) return; e.stopPropagation(); e.preventDefault();
        var act = b.dataset.act;
        if (act === 'restadd') { if (!Array.isArray(draft.rests)) draft.rests = []; if (draft.rests.length < REST_MAX) draft.rests.push({ id: restNewId(draft.rests), name: '', len: { n: 8, u: 'hour' } }); done(true); var ns = wrap.querySelectorAll('.sys-rest-name'); try { if (ns.length) ns[ns.length - 1].focus(); } catch (er) {} return; }
        var a = at(e); if (!a) return;
        if (act === 'restdox') { var dj = Number(b.dataset.dj); if (Array.isArray(a.r.does) && dj >= 0) { a.r.does.splice(dj, 1); if (!a.r.does.length) delete a.r.does; } }   // fold R4
        else if (act === 'restdel') { a.rs.splice(a.i, 1); if (draft.restSkip === a.r.id) delete draft.restSkip; if (!a.rs.length) delete draft.rests; }
        else if (act === 'restup' && a.i > 0) { a.rs.splice(a.i - 1, 0, a.rs.splice(a.i, 1)[0]); }
        else if (act === 'restdown' && a.i < a.rs.length - 1) { a.rs.splice(a.i + 1, 0, a.rs.splice(a.i, 1)[0]); }
        done(true);
    });
    draw(); return wrap;
}
// fold R4: a rest's list run for those who rest, on the machine that owns the campaign. ONE change a character with one Revert (the review of
// 2026-11-10): the effects that end with the rest come off (fold R6, each through the effects list's own remove, on the whole character, so a pool's
// most is judged with its links and station), then the sections are reset, then the pools are filled, each judged on the working copy as the step
// before left it, so a pool whose most reads a counter the rest resets is filled to its new most. A pool that already READS its most is not written
// (so one with nothing stored that starts at its most stays so, and one that starts at a number is filled). A reset runs what typing that figure
// fills, as Reset all does. Then each roll or action is run as the GM's own press, times over for a skip that held the rest that many times (20 at
// most). Each character has ONE record of what the rest gave it (1.6.2, the owner: "Each sheet its own"): what an action of the list changed by
// applyAction is joined to it (restRecJoin: a field's value before is the earliest seen), and the records are handed to restRevKeep, so that
// Revert on each rested character's sheet takes back that character's part. What a roll's own Then moves is not in it
function restRecJoin(rec, lc, charId) {   // the record of one character's rest, with a later change of that character joined: [the record, or one made of the change]
    if (!lc || typeof lc !== 'object' || lc === rec || lc.charId !== charId || typeof lc.fieldId !== 'string') return rec;
    var has = Object.prototype.hasOwnProperty, ks = [lc.fieldId].concat(lc.extra && typeof lc.extra === 'object' ? Object.keys(lc.extra) : []), was = function(k) { return k === lc.fieldId ? lc.prev : lc.extra[k]; };
    if (!rec) { rec = { charId: charId, fieldId: lc.fieldId, prev: lc.prev, extra: null }; if (lc.af !== undefined) rec.af = lc.af; ks = ks.slice(1).concat([lc.fieldId]); }
    ks.forEach(function(k) { if (k === rec.fieldId || (rec.extra && has.call(rec.extra, k))) return; (rec.extra = rec.extra || {})[k] = was(k); });
    if (lc.also && !rec.also) rec.also = lc.also;
    return rec;
}
function restDoes(ids, does, times, rest) {
    var camp = getActiveCampaign(), sys = camp && camp.system, ends = !!rest && rest.ends === true; does = Array.isArray(does) ? does : []; if (!sys || (!does.length && !ends) || !Array.isArray(ids)) return 0;
    var n = Math.max(1, Math.min(20, Math.floor(typeof times === 'number' && isFinite(times) ? times : 1))), done = 0, S = window.wpSystemCore, has = Object.prototype.hasOwnProperty, recs = {}, ats = {};
    ids.forEach(function(id) {
        var c = charById(id, camp); if (!c) return;
        var rec = null, was = lastChange, join = function() { if (lastChange !== was && lastChange !== rec) rec = restRecJoin(rec, lastChange, id); if (rec) lastChangeSet(rec); was = lastChange; };   // whatever changed this character since is joined to its one record
        var work = Object.assign({}, c, { values: clone(c.values || {}) }), d = {}, prev = {}, order = [], af0 = c.af ? clone(c.af) : null; if (c.af) work.af = clone(c.af);
        var seen = function(k) { if (has.call(prev, k)) return; prev[k] = c.values && has.call(c.values, k) ? clone(c.values[k]) : undefined; order.push(k); };
        var put = function(fid, value) {
            if (!S || typeof S.applyEdit !== 'function') return; var rs = S.applyEdit(sys, work, fid, value, F(), {}); if (!rs || !rs.ok || rs.clear) return;
            var fl = typeof S.autoFills === 'function' ? S.autoFills(sys, work, fid, rs.value, F()) : {};   // what typing that figure fills, as the section's own Reset all fills it (commitMany)
            seen(fid); Object.keys(fl).forEach(seen);
            if (typeof S.autoStore === 'function') S.autoStore(work, fid, rs.value, fl); else { work.values[fid] = rs.value; Object.keys(fl).forEach(function(k) { work.values[k] = fl[k]; }); }
            d[fid] = rs.value; Object.keys(fl).forEach(function(k) { d[k] = fl[k]; });
        };
        if (ends && S && typeof S.restEndsFx === 'function' && typeof S.applyEffectOp === 'function') S.restEndsFx(sys, work, rest).rows.forEach(function(rw) {
            var rs = S.applyEffectOp(sys, work, rw.f, { op: 'remove', rowId: rw.id }, F()); if (!rs || !rs.ok) return;
            seen(rw.f); work.values[rw.f] = rs.value; d[rw.f] = rs.value; if (rs.clamp) Object.keys(rs.clamp).forEach(function(k) { seen(k); work.values[k] = rs.clamp[k]; d[k] = rs.clamp[k]; });
        });
        does.forEach(function(x) {   // the sections first, whatever the list's order
            if (!x || x.k !== 'reset' || !S || typeof S.resetTargets !== 'function') return; var sc = (sys.sheet && Array.isArray(sys.sheet.sections) ? sys.sheet.sections : []).filter(function(y) { return y && y.id === x.id; })[0]; if (!sc) return;
            S.resetTargets(sys, work, sc, F(), { gm: true, rules: true }).targets.forEach(function(t) { put(t.fieldId, t.value); });   // rules (1.6.3): a rest is the rules, so a field's Locked while holds it back no more than an action
        });
        does.forEach(function(x) {   // then the pools, against the counters as reset
            if (!x || x.k !== 'pool' || !S || typeof S.makeResolver !== 'function') return; var f = (sys.fields || []).filter(function(y) { return y && y.id === x.id && y.kind === 'resource'; })[0]; if (!f) return;
            var Rp = S.makeResolver(sys, work, F()), mx = Rp(f.key + '.max'), cu = Rp(f.key);   // what the pool READS now: one with nothing stored reads its starting value, which is its most only where it starts there
            if (typeof mx === 'number' && isFinite(mx) && typeof cu === 'number' && isFinite(cu) && mx !== cu) put(f.id, mx);
        });
        if (order.length) {
            var ex = null; order.slice(1).forEach(function(k) { (ex = ex || {})[k] = prev[k]; }); lastChangeSet(rec = { charId: c.id, fieldId: order[0], prev: prev[order[0]], extra: ex, af: af0 }); was = lastChange;
            var bNote = typeof budgetNote === 'function' ? budgetNote : null; if (bNote) bNote(sys, c, d);   // 126: the GM's notice, as commitMany asked it when a rest went through it
            c.values = work.values; if (work.af && Object.keys(work.af).length) c.af = work.af; else delete c.af;
            afterCharChange(c, false, d); done++; join();
        }
        does.forEach(function(x) {
            if (!x || x.k !== 'roll') return; var r = (sys.rolls || []).filter(function(y) { return y && y.id === x.id; })[0]; if (!r) return;
            var lb = String(r.label || (Array.isArray(r.apply) ? 'Apply' : 'Roll')).split('{')[0].trim() || 'Roll';
            for (var k = 0; k < n; k++) { var cN = charById(id, camp); if (!cN) return; if (Array.isArray(r.apply)) { applyAction(r, cN, lb); join(); } else if (window.wpDice && window.wpDice.rollFor) window.wpDice.rollFor(cN.id, r.formula, lb, r.vis === 'gm' ? { act: r.id, gmOnly: true } : { act: r.id }); }
            done++;
        });
        join(); if (rec) { recs[id] = rec; var cE = charById(id, camp), atE = {}; if (cE && typeof restAtOf === 'function') { [rec.fieldId].concat(rec.extra ? Object.keys(rec.extra) : []).forEach(function(k) { atE[k] = restAtOf(cE.values && has.call(cE.values, k) ? cE.values[k] : undefined); }); ats[id] = atE; } }
    });
    if (typeof restRevKeep === 'function') restRevKeep(recs, ats);   // one Revert a rested character's sheet
    return done;
}
// the early end (the owner's round three, "Recount and take back"): what the start of a rest gave, taken back, character by character. A value that still
// stands as the start left it goes back to what it was; a number (a pool's current among them) moved since loses only the start's own move; a list of
// rows (an effects list, an inventory) is taken back ROW BY ROW, so a row the start changed and nobody touched since goes back though another row was
// added meanwhile, a row the start took off comes back, and a row the start added goes; anything else changed since stays as it is and is named.
// Each value is cleaned as any value is on its way in (the kept diff is data from the save), a pool held to its least value and its most. It is a
// correction: the followers that run something only note (followQuiet). A character that fails is counted and the others go on
function restTakeBack(diffs) {
    var camp = getActiveCampaign(), sys = camp && camp.system, out = { back: 0, kept: [], failed: 0 }, has = Object.prototype.hasOwnProperty, S = window.wpSystemCore; if (!sys || !diffs || typeof diffs !== 'object') return out;
    var J = function(v) { return v === undefined ? '\u0000' : JSON.stringify(v); }, num = function(v) { return typeof v === 'number' && isFinite(v) ? v : v && typeof v === 'object' && !Array.isArray(v) && typeof v.cur === 'number' && isFinite(v.cur) ? v.cur : null; };
    var fname = function(f) { return f && typeof (f.label || f.key) === 'string' && String(f.label || f.key).trim() ? String(f.label || f.key).trim() : 'a field'; };
    var rowsOk = function(v) { return Array.isArray(v) && v.every(function(r) { return !!r && typeof r === 'object' && !Array.isArray(r) && typeof r.id === 'string'; }); };
    var byId = function(v) { var m = Object.create(null); v.forEach(function(r) { m[r.id] = r; }); return m; };
    var vo = S && typeof S.valueOpts === 'function' ? S.valueOpts(sys) : null;
    if (typeof followQuiet === 'function') followQuiet(true);
    try {
        Object.keys(diffs).forEach(function(cid) {
            try {
                var c = charById(cid, camp), df = diffs[cid]; if (!c || !df || typeof df !== 'object') return;
                var vals = Object.assign({}, c.values || {}), d = {}, prev = {}, keptF = [];
                var kindOf = function(fid) { var f0 = (sys.fields || []).filter(function(x) { return x && x.id === fid; })[0]; return f0 ? f0.kind : ''; };
                Object.keys(df).sort(function(x, y) { return (kindOf(x) === 'resource' ? 1 : 0) - (kindOf(y) === 'resource' ? 1 : 0); }).forEach(function(fid) {   // the pools last: each is held to the most that the values ALREADY taken back give (an effect that raised it is back by then), whatever order the values were stored in
                    var e = df[fid], f = (sys.fields || []).filter(function(x) { return x && x.id === fid; })[0]; if (!e || typeof e !== 'object' || !f) return;
                    var b = has.call(e, 'b') ? e.b : undefined, a = has.call(e, 'a') ? e.a : undefined, cur = has.call(vals, fid) ? vals[fid] : undefined, nv, part = false;
                    if (J(cur) === J(a)) nv = b;
                    else if (rowsOk(cur) && rowsOk(a) && rowsOk(b)) {
                        var ai = byId(a), bi = byId(b), here = Object.create(null), rows = [];
                        cur.forEach(function(r) { here[r.id] = 1; var ra = ai[r.id], rb = bi[r.id]; if (ra && J(ra) === J(r)) { if (rb) rows.push(clone(rb)); return; } rows.push(r); if (ra && !(rb && J(ra) === J(rb))) part = true; });
                        b.forEach(function(rb, i) { if (!ai[rb.id] && !here[rb.id]) rows.splice(Math.min(i, rows.length), 0, clone(rb)); });
                        nv = rows;
                    }
                    else { var nb = num(b), na = num(a), ncu = num(cur); if (nb === null || na === null || ncu === null) { keptF.push(fname(f)); return; } nv = cur && typeof cur === 'object' ? Object.assign({}, cur, { cur: ncu - (na - nb) }) : ncu - (na - nb); }
                    if (nv !== undefined) {
                        if (!S || typeof S.cleanValue !== 'function') { keptF.push(fname(f)); return; }   // with no cleaner at hand nothing is written
                        var o2 = vo; if (f.kind === 'resource' && typeof S.makeResolver === 'function') { var mx = S.makeResolver(sys, Object.assign({}, c, { values: vals }), F())(f.key + '.max'); o2 = Object.assign({}, vo || {}, typeof mx === 'number' && isFinite(mx) ? { max: mx } : {}); }
                        nv = S.cleanValue(f, nv, o2 || undefined); if (nv === undefined) { keptF.push(fname(f)); return; }
                    }
                    if (part) keptF.push(fname(f));
                    if (J(nv) === J(cur)) return;
                    prev[fid] = cur === undefined ? undefined : clone(cur); if (nv === undefined) delete vals[fid]; else vals[fid] = clone(nv); d[fid] = nv === undefined ? null : nv;
                });
                if (keptF.length) out.kept.push((typeof c.name === 'string' && c.name ? c.name : 'A character') + ', ' + keptF.join(', '));
                var ks = Object.keys(d); if (!ks.length) return;
                var ex = null; ks.slice(1).forEach(function(k) { (ex = ex || {})[k] = prev[k]; }); lastChangeSet({ charId: c.id, fieldId: ks[0], prev: prev[ks[0]], extra: ex });
                c.values = vals; afterCharChange(c, false, d); out.back++;
            } catch (er) { out.failed++; if (typeof window !== 'undefined' && window && typeof window.wpStepLog === 'function') window.wpStepLog('rest v1', 'takeback-fail', { err: String((er && er.message) || er).slice(0, 80) }); }
        });
    } finally { if (typeof followQuiet === 'function') followQuiet(false); }
    return out;
}
// [systemcheck:restsbox-end]
// Senses S2a: the system's senses on the Combat tab (docs/SENSES_PLAN.md 4.3) — each a name, where its range comes from (a field of the
// character, or a number every character has), what it counts in (never a silent yards: a new row takes the system's first light's unit,
// else the last picked here, else it waits for one and Save leaves it out), whether walls stop it, whether it sees all round and whether it
// sees the dark as dim; each row ends in one plain sentence of what it does. Every text lands as a value or a text node. Save cleans them (a
// sense on a value its owner cannot read is dropped for everyone); refreshErrors says what it would drop
// The eyes' arc (the owner's ruling of 2026-10-03): under the blind switch, "Sight arc from" names the number or formula field that gives a
// character's own sight arc in degrees (combat.senses.arc), or the map's arc for none, with its sentence (arcSentence)
// [sinkcheck:sensesbox-start]
var _senseUnit = '', SENSE_WORDS = { yd: 'yards', ft: 'feet', m: 'meters', cells: 'grid cells' };
// senses S4: a mark sense's mark, as its player sees it (the shape the fog draws, and the word shown while the pointer is on it); none: a presence
var SENSE_GLYPH_SAY = { sound: 'three arcs, “Heard”', tremor: 'a zigzag, “Felt”', presence: 'a ring round a dot, “Sensed”', heat: 'a teardrop, “Heat”' };
function senseGlyphOf(s) { return typeof s.glyph === 'string' && Object.prototype.hasOwnProperty.call(SENSE_GLYPH_SAY, s.glyph) ? s.glyph : 'presence'; }
function sensesDraft() { var cm = draft.combat || (draft.combat = { blastAuto: 'full', blastRoller: 'owner', hpResource: '' }); return cm.senses && typeof cm.senses === 'object' && !Array.isArray(cm.senses) ? cm.senses : (cm.senses = {}); }
function senseRangeFields() { return (draft.fields || []).filter(function(f) { return !!f && (f.kind === 'number' || f.kind === 'formula' || f.kind === 'skill' || f.kind === 'resource'); }); }
function senseSecrets() { try { return secretFieldIds({ fields: gmViewFields(draft, F()), items: draft.items, core: draft.core, tables: draft.tables }, F()); } catch (e) { return null; } }
// senses S3: the fields a switch may read (a sense's off, the blind switch): toggles first, then numbers and formulas, as the cleaner takes them
function senseSwitchFields() { var fs = (draft.fields || []).filter(function(f) { return !!f && (f.kind === 'toggle' || f.kind === 'number' || f.kind === 'formula'); }); return fs.filter(function(f) { return f.kind === 'toggle'; }).concat(fs.filter(function(f) { return f.kind !== 'toggle'; })); }
function senseSwitchOf(v) { var id = v && typeof v === 'object' && typeof v.field === 'string' ? v.field : '', out = null; if (id) senseSwitchFields().forEach(function(f) { if (f.id === id) out = f; }); return out; }
function senseSentence(s, fieldsR, secret) {
    var arF0 = senseArcOf(s.arc), r = s.range && typeof s.range === 'object' ? s.range : {}, how = (s.walls === 'pass' ? ', through walls' : '') + (s.arc === 'all' ? ', all round' : typeof s.arc === 'number' && s.arc >= 1 ? ', through an arc of ' + s.arc + ' degrees on its facing' : arF0 ? ', through an arc of the character’s ' + (arF0.label || arF0.key) + ' in degrees' : ''), word = SENSE_WORDS[Object.prototype.hasOwnProperty.call(LIGHT_UNITS, s.unit) ? s.unit : 'yd'];
    var mark = s.grade === 'mark', verb = mark ? 'Marks every creature within ' : 'Sees everything within ';   // senses S4
    if (s.unit === '?') return 'Pick what its range counts in: Save leaves this sense out until you do.';
    var out = [], sw = s.off !== undefined ? senseSwitchOf(s.off) : null, swName = sw ? sw.label || sw.key : '';
    if (sw && (!secret || secret[sw.id])) return 'Save drops this sense: its owner cannot read ' + swName + ', which switches it off (a GM-only value, or one worked out from one). Make that value visible to its owner, or have it never switched off.';
    if (r.by === 'field') {
        var f = null; fieldsR.forEach(function(x) { if (x.id === r.field) f = x; });
        if (!f) return 'Pick where its range comes from: Save drops this sense.';
        var nm = f.label || f.key;
        if (!secret || secret[f.id]) return 'Save drops this sense: its owner cannot read ' + nm + ' (a GM-only value, or one worked out from one). Make that value visible to its owner, or give the range as a number.';
        out.push(verb + 'the character’s ' + nm + ' (in ' + word + ')' + how + '.'); out.push('A value of 0 or less: that character does not have it.');
        if (f.edit === 'owner' && f.kind !== 'formula') out.push('Its owner can change this on their sheet.');
    } else if (r.by === 'eyes') {
        out.push((mark ? 'Marks every creature' : 'Sees everything') + ' as far as the eyes reach' + how + '.'); out.push('Every character has this sense, and it is off while they are blind. On a dark map that is their Sight' + (s.shows === 'side' ? ' and what is lit.' : '.'));
    } else {
        var n = typeof r.n === 'number' && isFinite(r.n) ? r.n : 0;
        if (!(n > 0)) return 'A range of 0: no one has it unless a token is given a range of its own in its Properties.';
        out.push(verb + n + ' ' + word + how + '.'); out.push('Every character has this sense.');
        if (s.unit === 'cells' && n > 60) out.push('60 cells is the most a sense reaches.');
    }
    if (s.eyes === true && r.by !== 'eyes') out.push('A sense of the eyes: off while the character is blind.');
    if (arF0 && (!secret || secret[arF0.id])) out.push('Save takes its arc off: its owner cannot read ' + (arF0.label || arF0.key) + '. It then looks through the eyes’ arc.');
    if (s.veil === true) out.push('It sees through smoke.');   // senses S7b
    if (sw) out.push('Off while ' + swName + ' is ticked or above 0.' + (sw.edit === 'owner' && sw.kind !== 'formula' ? ' Its owner can change that on their sheet.' : ''));
    else if (s.off !== undefined) out.push('Its switch is no longer here: Save keeps the sense, never switched off.');
    if (s.arc === 0) out.push('Type its degrees. With none it looks through the eyes’ arc.');
    if (s.shows === 'side' && !mark) out.push('Its ground shows dimmed, whatever the light. A creature there shows dimmed too, unless its token is ticked as not noticed, and then it is not drawn. A cell the eyes also see reads as the eyes see it.' + noticeSays(s));
    else if (mark) out.push('A creature it finds that the eyes do not see shows to its player as a nameless mark in its cell, never as itself: ' + SENSE_GLYPH_SAY[senseGlyphOf(s)] + '.');
    else out.push(s.shows === 'dim' ? 'What it sees in the dark it sees as dim.' : 'Seen clearly, light or none: no dim or dark name shows inside its range.');
    return out.join(' ');
}
// senses S3: the sentence under the blind switch
function blindSentence(sn) {
    var b = sn && typeof sn === 'object' ? sn.blind : undefined; if (b === undefined) return 'No field makes a character blind: the Blind tick in a token’s Properties still does.';
    var f = senseSwitchOf(b); if (!f) return 'Pick the field that makes a character blind: Save leaves the blind switch out.';
    var nm = f.label || f.key, secret = senseSecrets();
    if (!secret || secret[f.id]) return 'Save drops the blind switch: its owner cannot read ' + nm + ' (a GM-only value, or one worked out from one). Make that value visible to its owner.';
    return 'A character is blind while ' + nm + ' is ticked or above 0: its eyes see only its own cell, a sense of the eyes is off, and a sense that does not use the eyes still works.' + (f.edit === 'owner' && f.kind !== 'formula' ? ' Its owner can change this on their sheet.' : '');
}
// the eyes' arc: the fields it may read (a number or a formula, as the cleaner takes them) and the sentence under "Sight arc from"
function senseArcFields() { return (draft.fields || []).filter(function(f) { return !!f && (f.kind === 'number' || f.kind === 'formula'); }); }
function senseArcOf(v) { var id = v && typeof v === 'object' && typeof v.field === 'string' ? v.field : '', out = null; if (id) senseArcFields().forEach(function(f) { if (f.id === id) out = f; }); return out; }
function arcSentence(sn) {
    var a = sn && typeof sn === 'object' ? sn.arc : undefined; if (a === undefined) return 'Every character’s eyes see through the map’s vision arc (the fog menu’s Vision).';
    var f = senseArcOf(a); if (!f) return 'Pick the number or formula field that gives a character’s sight arc: Save leaves it out.';
    var nm = f.label || f.key, secret = senseSecrets();
    if (!secret || secret[f.id]) return 'Save drops the sight arc: its owner cannot read ' + nm + ' (a GM-only value, or one worked out from one). Make that value visible to its owner.';
    return 'A character sees through an arc of its own, the character’s ' + nm + ' in degrees (1 to 360), wherever the map’s Vision is a facing cone: wider or narrower than the map’s. A value of 0 or less: the map’s arc. A map set to All around still sees all round, as every token does while Token facing is off.' + (f.edit === 'owner' && f.kind !== 'formula' ? ' Its owner can change this on their sheet.' : '');
}
function sensesBox(box, cm) {
    var sn = cm.senses && typeof cm.senses === 'object' && !Array.isArray(cm.senses) ? cm.senses : {}, arr = Array.isArray(sn.list) ? sn.list : [], wrap = el('div', 'sys-light sys-senses');
    var fieldsR = senseRangeFields(), secret = senseSecrets(), swF = senseSwitchFields();
    wrap.appendChild(el('div', 'sys-light-head', 'Senses'));
    wrap.appendChild(el('div', 'sys-note', 'Senses besides the eyes, for fogged maps: a sense sees every cell within its range, and the creatures standing there reach its player as the eyes would show them, or it marks them: a creature it finds that the eyes do not see shows to its player as a nameless mark in its cell. Its range comes from a field of the character (one its player can read) or is one number every character has.'));
    arr.forEach(function(s0, i) {
        var s = s0 && typeof s0 === 'object' ? s0 : {}, r = s.range && typeof s.range === 'object' ? s.range : {}, byField = r.by === 'field', rw = el('div', 'sys-flags sys-light-row sys-sense-row'); rw.dataset.si = String(i);
        var n = input('sys-sense-name field', typeof s.name === 'string' ? s.name : '', 'Its name: Darkvision, Blindsight, Ether Sight', 'Name'); n.maxLength = LIMITS.label; rw.appendChild(n);
        var mark = s.grade === 'mark';   // senses S4: what it shows, and a mark's own mark
        rw.appendChild(select('sys-sense-grade', [['full', 'Shows everything in range'], ['side', 'Side vision: dimmed'], ['mark', 'A nameless mark']], mark ? 'mark' : s.shows === 'side' ? 'side' : 'full', 'Everything in range: its cells are seen and the creatures there appear as themselves. Side vision: its ground and what it notices show dimmed, and a token ticked as not noticed is not drawn. A nameless mark: a creature it finds that the eyes do not see shows to its player as a mark in its cell, never as itself'));
        if (mark) rw.appendChild(select('sys-sense-glyph', [['sound', 'Mark: a sound'], ['tremor', 'Mark: a tremor'], ['presence', 'Mark: a presence'], ['heat', 'Mark: heat']], senseGlyphOf(s), 'The mark its player sees, told apart by its shape: three arcs for a sound, a zigzag for a tremor, a ring for a presence, a teardrop for heat'));
        var byEyes = r.by === 'eyes', ropts = [['#n', 'A number (every character)'], ['#e', 'As far as the eyes reach']].concat(fieldsR.map(function(f) { return [f.id, 'From ' + (f.label || f.key)]; }));
        if (byField && typeof r.field === 'string' && !fieldsR.some(function(f) { return f.id === r.field; })) ropts.push([r.field, 'From a field no longer here']);
        rw.appendChild(select('sys-sense-from', ropts, byField ? r.field : byEyes ? '#e' : '#n', 'Where its range comes from: a field of the character (worked out for each character, effects and all), one number every character has, or as far as the eyes reach on that map, for a sense that widens what the eyes see'));
        if (!byField && !byEyes) { var nl = el('label', 'sys-num'); nl.appendChild(el('span', 'sys-num-cap', 'Range')); var ni = el('input', 'field sys-sense-n'); ni.type = 'number'; ni.min = '0'; ni.max = '100000'; ni.step = 'any'; ni.value = typeof r.n === 'number' ? String(r.n) : ''; ni.title = 'How far it reaches, for every character (0: no one has it)'; nl.appendChild(ni); rw.appendChild(nl); }
        if (!byEyes) rw.appendChild(select('sys-sense-unit', (s.unit === '?' ? [['?', '— pick a unit —']] : []).concat([['yd', 'yards'], ['ft', 'feet'], ['m', 'meters'], ['cells', 'grid cells']]), s.unit === '?' ? '?' : (typeof s.unit === 'string' && Object.prototype.hasOwnProperty.call(LIGHT_UNITS, s.unit) ? s.unit : 'yd'), 'What its range counts in: each map’s scale converts it (60 ft on 5 ft squares is 12 squares)'));
        [['walls', 'Walls stop it', s.walls !== 'pass', 'Ticked: whatever blocks sight stops it, as it stops the eyes. Unticked: it passes walls'], ['arc', 'All round (ignores facing)', s.arc === 'all', 'Ticked: it sees in every direction, whatever arc its token’s eyes see through'], ['dim', 'What it sees in the dark it sees as dim', s.shows === 'dim', 'Ticked: in the dark it shows cells dim (the dim name shows on the ruler and at a target mark), in light as the light is. Unticked: clear'], ['eyes', 'Uses the eyes (off while blind)', s.eyes === true, 'Ticked: a sense of the eyes, off while the character is blind (darkvision, truesight). Unticked: it works blind (blindsight, a sense of the Ether)'], ['veil', 'Sees through smoke', s.veil === true, 'Ticked: smoke hides nothing from it. Unticked: it does not see into or through smoke (a sense that passes walls always does)']].filter(function(g) { return !((mark || s.shows === 'side') && g[0] === 'dim'); }).forEach(function(g) {   // a mark sees no cells: no dim
            var tl = el('label', 'sys-hover'), tc = el('input', 'sys-sense-tick'); tc.type = 'checkbox'; tc.checked = g[2]; tc.dataset.tick = g[0]; tl.appendChild(tc); tl.appendChild(document.createTextNode(' ' + g[1])); tl.title = g[3]; rw.appendChild(tl);
        });
        if (s.arc !== 'all') {   // 1.6.0: an arc of its own, wider than the eyes' for side vision
            var saF = senseArcOf(s.arc), saId = s.arc && typeof s.arc === 'object' && typeof s.arc.field === 'string' ? s.arc.field : '', sopts = [['', 'The eyes’ arc'], ['#n', 'An arc of its own']].concat(senseArcFields().map(function(f) { return [f.id, 'Arc from ' + (f.label || f.key)]; }));
            if (saId && !saF) sopts.push([saId, 'Arc from a field no longer here']);
            rw.appendChild(select('sys-sense-arcfrom', sopts, saId || (typeof s.arc === 'number' ? '#n' : ''), 'The arc it looks through, centered on the facing: the eyes’ arc, a number of degrees every character has, or a number or formula field of the character, so a trait can widen it. 360 is all round'));
            if (typeof s.arc === 'number') { var sal = el('label', 'sys-num'); sal.appendChild(el('span', 'sys-num-cap', 'Degrees')); var sai = el('input', 'field sys-sense-arcn'); sai.type = 'number'; sai.min = '1'; sai.max = '360'; sai.step = '1'; sai.value = s.arc ? String(s.arc) : ''; sai.placeholder = 'Degrees'; sai.title = 'The whole arc in degrees, centered on the facing: half of it each side'; sal.appendChild(sai); rw.appendChild(sal); }
        }
        var offId = s.off && typeof s.off === 'object' && typeof s.off.field === 'string' ? s.off.field : '', oopts = [['', 'Never switched off']].concat(swF.map(function(f) { return [f.id, 'Off while ' + (f.label || f.key)]; }));   // senses S3
        if (offId && !swF.some(function(f) { return f.id === offId; })) oopts.push([offId, 'Off by a field no longer here']);
        rw.appendChild(select('sys-sense-off', oopts, offId, 'A field of the character that switches this sense off while it is ticked or above 0 (Deafened for hearing): toggles first'));
        [['up', '▲', 'Move up'], ['down', '▼', 'Move down'], ['del', '×', 'Remove']].forEach(function(bd) { var bb = el('button', 'tool ghost sys-btn', bd[1]); bb.dataset.act = 'sn' + bd[0]; bb.title = bd[2]; (typeof segPut === 'function' ? segPut(rw, bb) : rw.appendChild(bb)); });
        wrap.appendChild(rw);
        wrap.appendChild(el('div', 'sys-note sys-sense-says', senseSentence(s, fieldsR, secret)));
        if (s.shows === 'side' && !mark) wrap.appendChild(noticeRow(s, i));   // 1.6.0: it may notice by a roll
    });
    var full = arr.length >= LIMITS.senses, adds = el('div', 'sys-flags');
    [['side', '+ Side vision', 'A wider view beside the eyes’ arc, its ground and what it notices dimmed, as far as the eyes reach, stopped by walls. Type how many degrees it covers, wider than the eyes’ arc'], ['dark', '+ Sees without light', 'A sense that sees in the dark, as dim: darkvision'], ['noeyes', '+ Sees without eyes', 'A sense that works blind, all round: blindsight, a sense of the Ether'], ['hears', '+ Hears', 'A nameless mark for a sound, through walls, all round; off while the system’s Deafened toggle is ticked, if it has one'], ['feels', '+ Feels through the ground', 'A nameless mark for a tremor, through walls, all round: tremorsense'], ['near', '+ Senses what is near', 'A nameless mark for a presence, through walls, all round'], ['creature', '+ A creature’s sense (set per token)', 'A nameless mark with a range of 0: no one has it until a token is given a range of its own in its Properties (a beast’s vibration sense)'], ['custom', '+ Custom sense', 'A sense of your own']].forEach(function(g) { var b = el('button', 'tool ghost sys-btn sys-light-add', g[1]); b.dataset.act = 'snadd'; b.dataset.tpl = g[0]; b.disabled = full; b.title = full ? 'At most ' + LIMITS.senses : g[2]; adds.appendChild(b); });
    wrap.appendChild(adds);
    wrap.appendChild(el('div', 'sys-note', 'Sight is the eyes’ own range in the dark. A sense that sees without light adds to it; the longer of the two is what the token sees.'));
    var vw = sn.view && typeof sn.view === 'object' ? sn.view : null, vwV = vw && vw.mode === 'arc' ? 'arc' : vw && vw.mode === 'all' ? 'all' : '', vrow = el('div', 'sys-flags');   // 1.6.0: the Vision of a map with none of its own
    vrow.appendChild(el('span', 'sys-num-cap', 'A map with no Vision sees'));
    vrow.appendChild(select('sys-sense-view', [['', 'As its grid does'], ['all', 'All round'], ['arc', 'Through a facing arc']], vwV, 'What a map that has no Vision of its own sees by. As its grid does: all round on squares, a front cone on hexes. A Vision set on the map, or one the campaign keeps for new maps, wins'));
    if (vwV === 'arc') { var val = el('label', 'sys-num'); val.appendChild(el('span', 'sys-num-cap', 'Degrees')); var vai = el('input', 'field sys-sense-viewarc'); vai.type = 'number'; vai.min = '1'; vai.max = '360'; vai.step = '1'; vai.value = typeof vw.arc === 'number' ? String(vw.arc) : ''; vai.title = 'The whole arc in degrees, centered on the facing'; val.appendChild(vai); vrow.appendChild(val); }
    wrap.appendChild(vrow);
    var blId = sn.blind && typeof sn.blind === 'object' && typeof sn.blind.field === 'string' ? sn.blind.field : '', bopts = [['', 'No blind switch']].concat(swF.map(function(f) { return [f.id, 'Blind while ' + (f.label || f.key)]; }));   // senses S3: the system's blind switch
    if (blId && !swF.some(function(f) { return f.id === blId; })) bopts.push([blId, 'Blind by a field no longer here']);
    var brow = el('div', 'sys-flags'); brow.appendChild(el('span', 'sys-num-cap', 'Blind when')); brow.appendChild(select('sys-sense-blind', bopts, blId, 'A field of the character that makes it blind while it is ticked or above 0 (Blinded): its eyes see only its own cell, and a sense of the eyes is off; toggles first')); wrap.appendChild(brow);
    wrap.appendChild(el('div', 'sys-note sys-blind-says', blindSentence(sn)));
    var arF = senseArcFields(), arId = sn.arc && typeof sn.arc === 'object' && typeof sn.arc.field === 'string' ? sn.arc.field : '', aopts = [['', 'The map’s arc']].concat(arF.map(function(f) { return [f.id, 'From ' + (f.label || f.key)]; }));   // the eyes' arc, from the sheet
    if (arId && !arF.some(function(f) { return f.id === arId; })) aopts.push([arId, 'From a field no longer here']);
    var arow = el('div', 'sys-flags'); arow.appendChild(el('span', 'sys-num-cap', 'Sight arc from')); arow.appendChild(select('sys-sense-eyearc', aopts, arId, 'A number or formula field of the character that gives its own sight arc in degrees (1 to 360) on a map with a facing cone: 300 for one who sees to the sides, 360 for one who sees all round. The map’s arc: every character sees through the map’s')); wrap.appendChild(arow);
    wrap.appendChild(el('div', 'sys-note sys-arc-says', arcSentence(sn)));
    var err = errorCell('senses'); err.dataset.errFor = 'senses'; wrap.appendChild(err);
    box.appendChild(wrap);
}
// 1.6.0: a band that notices by a roll: its check on the viewer's sheet, and how a creature sneaks past it. Blank: the GM's tick alone
function noticeRow(s, i) {
    var n = s.notice && typeof s.notice === 'object' ? s.notice : {}, rw = el('div', 'sys-flags sys-light-row sys-sense-row sys-sense-nrow'), has = typeof n.check === 'string' && !!n.check.trim(), sk = typeof n.sneak === 'string' && !!n.sneak.trim(); rw.dataset.si = String(i);
    rw.appendChild(el('span', 'sys-num-cap', 'Noticed by'));
    var ck = input('sys-sense-nkcheck field', typeof n.check === 'string' ? n.check : '', 'A check on the viewer\u2019s sheet, rolled in secret by the GM\u2019s machine. It may read TargetSize, TargetDistance, RangeMod, TargetLight (0 dark, 1 dim, 2 clear), TargetLoud (with Loud by), TargetCover (0 none, 1 some, 2 no clear line) and AttemptMargin. Blank: a creature in the band is noticed unless you tick it in its Properties', 'A check on the viewer\u2019s sheet'); ck.maxLength = LIMITS.formula; rw.appendChild(ck);
    if (!has && !sk) return rw;   // 1.6.3: a Sneaking where kept while Noticed by is emptied stays in sight, and the Senses box says that Save drops it
    rw.appendChild(el('span', 'sys-num-cap', 'Loud by'));   // 1.6.0: a roll of a row with this stat marks its token loud
    var nzC = typeof n.noise === 'string' ? n.noise : '', nzs = [], nzSeen = Object.create(null); (Array.isArray(draft.fields) ? draft.fields : []).forEach(function(f) { if (f && f.kind === 'item-list' && f.list && Array.isArray(f.list.stats)) f.list.stats.forEach(function(x) { var k = x && typeof x.key === 'string' ? x.key : '', lk = k.toLowerCase(); if (k && x.kind !== 'pick' && (x.vis !== 'gm' || k === nzC) && !nzSeen[lk]) { nzSeen[lk] = 1; nzs.push([k, (x.label || k) + ' (' + (f.label || f.key || 'a list') + ')']); } }); });
    var nzO = [['', 'No roll is loud']].concat(nzs); if (nzC && !nzO.some(function(o) { return o[0] === nzC; })) nzO.push([nzC, 'A stat no longer here']);
    rw.appendChild(select('sys-sense-nknoise', nzO, nzC, 'A stat of a list. A roll of a row with this stat not 0 marks its token loud by that figure, until its next turn in a fight and for a few seconds out of one. A noticing check can read how loud it is'));
    rw.appendChild(el('span', 'sys-num-cap', 'Sneaking where'));
    var sn = input('sys-sense-nksneak field', typeof n.sneak === 'string' ? n.sneak : '', 'A formula on the creature\u2019s own sheet, true while it is sneaking: a toggle, or anything else that says so. No dice. Blank: nothing sneaks past this band', 'A formula on its own sheet'); sn.maxLength = LIMITS.formula; rw.appendChild(sn);
    if (!sk) return rw;
    var st = n.stealth && typeof n.stealth === 'object' ? n.stealth : {}, cur = typeof st.r === 'string' ? 'r:' + st.r : typeof st.l === 'string' ? 'l:' + st.l : '';
    var opts = [['', '\u2014 pick a sneak roll \u2014']].concat((Array.isArray(draft.rolls) ? draft.rolls : []).filter(function(r) { return r && !r.apply; }).map(function(r) { return ['r:' + r.id, 'Sneak roll: ' + (r.label || r.id)]; }), (Array.isArray(draft.fields) ? draft.fields : []).filter(function(f) { return f && f.kind === 'item-list'; }).map(function(f) { return ['l:' + f.id, 'Sneak roll: a roll of ' + (f.label || f.key)]; }));
    if (cur && !opts.some(function(o) { return o[0] === cur; })) opts.push([cur, 'A roll no longer here']);
    rw.appendChild(select('sys-sense-nkroll', opts, cur, 'The roll a sneak\u2019s player makes. A failure is noticed. A success takes its margin off each viewer\u2019s check'));
    if (typeof st.l === 'string') { var ky = input('sys-sense-nkkey field', typeof st.key === 'string' ? st.key : '', 'Which entry of the list is the sneak roll', 'Entry'); ky.maxLength = LIMITS.label; rw.appendChild(entryPick(ky, entryNames(draft, st.l), 'Pick an entry')); }
    return rw;
}
function noticeSays(s) {
    var n = s.notice && typeof s.notice === 'object' ? s.notice : null; if (!n || typeof n.check !== 'string' || !n.check.trim()) return '';
    return ' A creature moving there is noticed with no roll. One standing still is checked in secret when it comes into the band or stops there, and the result stands until the light or its cover changes, it moves after a failure, or the viewer turns away.';
}
function senseAt(t) { var rw = t.closest('.sys-sense-row'), i = rw ? +rw.dataset.si : -1, sn = sensesDraft(), arr = Array.isArray(sn.list) ? sn.list : []; return i >= 0 && arr[i] && typeof arr[i] === 'object' ? { s: arr[i], rw: rw } : null; }
function senseSays(at) { var say = at.rw.nextSibling; if (say && say.classList && say.classList.contains('sys-sense-says')) say.textContent = senseSentence(at.s, senseRangeFields(), senseSecrets()); }
function onSensesInput(t) {
    var c = t.className || ''; if (typeof c !== 'string' || c.indexOf('sys-sense-') < 0) return false;
    if (c.indexOf('sys-sense-nk') >= 0) {   // 1.6.0: a band's check, a sneak's mark and its roll's entry
        if (c.indexOf('sys-sense-nkroll') >= 0 || c.indexOf('sys-sense-nknoise') >= 0) return true;
        var atN = senseAt(t); if (!atN) return true;
        var nk = atN.s.notice && typeof atN.s.notice === 'object' ? atN.s.notice : (atN.s.notice = {}), tv = t.value;
        if (c.indexOf('sys-sense-nkcheck') >= 0) { if (tv.trim()) nk.check = tv; else { delete nk.check; if (!Object.keys(nk).length) delete atN.s.notice; } }   // 1.6.3: emptied, the rest stays to be said (Save drops it), never taken away unseen
        else if (c.indexOf('sys-sense-nksneak') >= 0) { if (tv.trim()) nk.sneak = tv; else { delete nk.sneak; delete nk.stealth; } }
        else if (nk.stealth && typeof nk.stealth === 'object') { if (tv.trim()) nk.stealth.key = tv.trim(); else delete nk.stealth.key; }
        markDirty(); patchErrors(); return true;
    }
    if (c.indexOf('sys-sense-viewarc') >= 0) { var snv = sensesDraft(), vn = Number(t.value); if (snv.view && snv.view.mode === 'arc') { if (t.value.trim() && isFinite(vn)) snv.view.arc = vn; else delete snv.view.arc; markDirty(); patchErrors(); } return true; }   // 1.6.0: the Vision of a map with none of its own
    if (c.indexOf('sys-sense-name') < 0 && c.indexOf('sys-sense-n') < 0 && c.indexOf('sys-sense-arcn') < 0) return true;   // the selects' and the ticks' change events do the work
    var at = senseAt(t); if (!at) return true;
    if (c.indexOf('sys-sense-arcn') >= 0) { var an = Number(t.value); if (!t.value.trim()) at.s.arc = 0; else if (isFinite(an)) at.s.arc = an; senseSays(at); markDirty(); patchErrors(); return true; }   // 1.6.0: its own arc
    if (c.indexOf('sys-sense-name') >= 0) at.s.name = t.value.slice(0, LIMITS.label);
    else { var r = at.s.range && typeof at.s.range === 'object' ? at.s.range : (at.s.range = { by: 'n' }), nv = Number(t.value); if (t.value.trim() && isFinite(nv)) r.n = nv; else delete r.n; }
    senseSays(at); markDirty(); patchErrors(); return true;
}
function onSensesChange(t) {
    var c = t.className || ''; if (typeof c !== 'string' || c.indexOf('sys-sense-') < 0) return false;
    if (c.indexOf('sys-sense-nkroll') >= 0) { var atR = senseAt(t); if (!atR || !atR.s.notice) return true; var rv = t.value; var wasL = !!(atR.s.notice.stealth && atR.s.notice.stealth.l), isL = rv.slice(0, 2) === 'l:', siR = atR.rw.dataset.si; if (rv.slice(0, 2) === 'r:') atR.s.notice.stealth = { r: rv.slice(2) }; else if (isL) atR.s.notice.stealth = { l: rv.slice(2) }; else delete atR.s.notice.stealth; markDirty(); patchErrors(); if (wasL === isL) return true; renderAll(); var nrR = document.querySelector('.sys-sense-nrow[data-si="' + siR + '"] .sys-sense-nkroll'); if (nrR) nrR.focus(); return true; }   // the list keeps the keys: only the key box comes or goes
    if (c.indexOf('sys-sense-nkcheck') >= 0 || c.indexOf('sys-sense-nksneak') >= 0) { var atB = senseAt(t), siB = atB ? atB.rw.dataset.si : '', isCk = c.indexOf('sys-sense-nkcheck') >= 0, nextC = isCk ? 'sys-sense-nksneak' : 'sys-sense-nkroll', rowB = atB ? atB.rw : null, had = !!(rowB && rowB.querySelector('.' + nextC)), goes = !!t.value.trim(); markDirty(); if (had === goes) return true; renderAll(); if (goes && siB) { var nrB = document.querySelector('.sys-sense-nrow[data-si="' + siB + '"] .' + nextC); if (nrB) nrB.focus(); } return true; }   // the box after it comes or goes, and the keys stay in the row
    if (c.indexOf('sys-sense-nkkey') >= 0) return true;
    if (c.indexOf('sys-sense-nknoise') >= 0) { var atZ = senseAt(t); if (atZ && atZ.s.notice) { if (t.value) atZ.s.notice.noise = t.value; else delete atZ.s.notice.noise; markDirty(); patchErrors(); } return true; }   // 1.6.0
    if (c.indexOf('sys-sense-from') < 0 && c.indexOf('sys-sense-unit') < 0 && c.indexOf('sys-sense-tick') < 0 && c.indexOf('sys-sense-off') < 0 && c.indexOf('sys-sense-blind') < 0 && c.indexOf('sys-sense-eyearc') < 0 && c.indexOf('sys-sense-grade') < 0 && c.indexOf('sys-sense-glyph') < 0 && c.indexOf('sys-sense-arcfrom') < 0 && c.indexOf('sys-sense-view') < 0) return true;   // the boxes' change events (their input events did the work)
    if (c.indexOf('sys-sense-viewarc') >= 0) return true;
    if (c.indexOf('sys-sense-view') >= 0) { var snw = sensesDraft(); if (t.value === 'all') snw.view = { mode: 'all' }; else if (t.value === 'arc') snw.view = { mode: 'arc', arc: 180 }; else delete snw.view; markDirty(); renderAll(); return true; }   // 1.6.0: the Vision of a map with none of its own
    if (c.indexOf('sys-sense-eyearc') >= 0) { var sna = sensesDraft(); if (t.value && typeof t.value === 'string') sna.arc = { field: t.value }; else delete sna.arc; markDirty(); renderAll(); return true; }   // the eyes' arc: the field it comes from, or the map's arc (its sentence redrawn)
    if (c.indexOf('sys-sense-blind') >= 0) { var snd = sensesDraft(); if (t.value) snd.blind = { field: t.value }; else delete snd.blind; markDirty(); renderAll(); return true; }   // senses S3: the blind switch (its sentence redrawn)
    var at = senseAt(t); if (!at) return true;
    var s = at.s;
    if (c.indexOf('sys-sense-off') >= 0) { if (t.value) s.off = { field: t.value }; else delete s.off; senseSays(at); markDirty(); patchErrors(); return true; }
    if (c.indexOf('sys-sense-arcfrom') >= 0) { if (t.value === '#n') s.arc = 0; else if (t.value) s.arc = { field: t.value }; else delete s.arc; markDirty(); renderAll(); return true; }   // 1.6.0: the degrees box comes or goes
    if (c.indexOf('sys-sense-grade') >= 0) {   // senses S4: everything in range or a mark (the glyph list and the dim tick come or go)
        if (t.value === 'mark') { s.grade = 'mark'; delete s.shows; s.glyph = senseGlyphOf(s); } else if (t.value === 'side') { s.grade = 'full'; s.shows = 'side'; delete s.glyph; } else if (t.value === 'full') { s.grade = 'full'; delete s.glyph; if (s.shows === 'side') delete s.shows; } else return true;
        markDirty(); renderAll(); return true;
    }
    if (c.indexOf('sys-sense-glyph') >= 0) { if (s.grade !== 'mark' || typeof t.value !== 'string' || !Object.prototype.hasOwnProperty.call(SENSE_GLYPH_SAY, t.value)) return true; s.glyph = t.value; senseSays(at); markDirty(); patchErrors(); return true; }
    if (c.indexOf('sys-sense-from') >= 0) {
        s.range = t.value === '#n' ? { by: 'n', n: 0 } : t.value === '#e' ? { by: 'eyes' } : { by: 'field', field: t.value }; if (t.value === '#e') delete s.unit;
        markDirty(); renderAll(); return true;   // the number box comes or goes
    }
    if (c.indexOf('sys-sense-unit') >= 0) { if (t.value === 'yd') { delete s.unit; _senseUnit = 'yd'; } else if (typeof t.value === 'string' && Object.prototype.hasOwnProperty.call(LIGHT_UNITS, t.value)) { s.unit = t.value; _senseUnit = t.value; } }
    else if (t.dataset.tick === 'walls') { if (t.checked) delete s.walls; else s.walls = 'pass'; }
    else if (t.dataset.tick === 'arc') { if (t.checked) s.arc = 'all'; else delete s.arc; markDirty(); renderAll(); return true; }   // 1.6.0: its own arc comes or goes
    else if (t.dataset.tick === 'dim') { if (t.checked) s.shows = 'dim'; else delete s.shows; }
    else if (t.dataset.tick === 'eyes') { if (t.checked) s.eyes = true; else delete s.eyes; }
    else if (t.dataset.tick === 'veil') { if (t.checked) s.veil = true; else delete s.veil; }   // senses S7b
    senseSays(at); markDirty(); patchErrors(); return true;
}
function senseUnitFor() {   // a new row's unit: the system's first light's, else the last picked here, else none yet ('?': Save waits for one)
    var lt = draft.combat && draft.combat.light && typeof draft.combat.light === 'object' ? draft.combat.light : null, p = lt && Array.isArray(lt.presets) && lt.presets.length ? lt.presets[0] : null;
    if (p && typeof p === 'object') return typeof p.unit === 'string' && Object.prototype.hasOwnProperty.call(LIGHT_UNITS, p.unit) ? p.unit : 'yd';
    return _senseUnit || '?';
}
function sensesClick(b) {
    var m = /^sn(add|up|down|del)$/.exec(b.dataset.act || ''); if (!m) return false;
    var sn = sensesDraft(), arr = Array.isArray(sn.list) ? sn.list : (sn.list = []);
    var rw = b.closest('.sys-sense-row'), i = rw ? +rw.dataset.si : -1;
    if (m[1] === 'add') {
        if (arr.length >= LIMITS.senses) { toast('At most ' + LIMITS.senses + '.'); return true; }
        var id = ''; for (var k = 0; k < 20 && !(/^sn_[a-z0-9]{8}$/.test(id) && !arr.some(function(x) { return x && x.id === id; })); k++) id = uid('sn_');
        var tpl = b.dataset.tpl, mk = { hears: ['Hearing', 'sound'], feels: ['Tremorsense', 'tremor'], near: ['Presence', 'presence'], creature: ['A creature’s sense', 'tremor'] }, mt = Object.prototype.hasOwnProperty.call(mk, tpl) ? mk[tpl] : null;
        var u = senseUnitFor(), row = { id: id, name: tpl === 'dark' ? 'Sees in the dark' : tpl === 'noeyes' ? 'Sees without eyes' : tpl === 'side' ? 'Side vision' : mt ? mt[0] : '', range: tpl === 'side' ? { by: 'eyes' } : { by: 'n', n: 0 }, grade: mt ? 'mark' : 'full' };
        if (tpl === 'side') { row.arc = 0; row.shows = 'side'; } else if (u !== 'yd') row.unit = u;
        if (tpl === 'dark') { row.shows = 'dim'; row.eyes = true; }   // senses S3: darkvision is a sense of the eyes
        if (tpl === 'noeyes') row.arc = 'all';
        if (mt) { row.walls = 'pass'; row.arc = 'all'; row.glyph = mt[1]; }   // senses S4: the marks' templates pass walls and hear all round
        if (tpl === 'hears') { var sec = senseSecrets(), deaf = senseSwitchFields().filter(function(f) { return f.kind === 'toggle' && /^deaf/i.test(String(f.key || '')) && sec && !sec[f.id]; })[0]; if (deaf) row.off = { field: deaf.id }; }   // off while Deafened, one its owner can read
        arr.push(row);
    }
    else if (!(i >= 0 && i < arr.length && Math.floor(i) === i)) return true;
    else if (m[1] === 'up') { if (i > 0) arr.splice(i - 1, 0, arr.splice(i, 1)[0]); }
    else if (m[1] === 'down') { if (i < arr.length - 1) arr.splice(i + 1, 0, arr.splice(i, 1)[0]); }
    else arr.splice(i, 1);
    markDirty(); renderAll(); return true;
}
// [sinkcheck:sensesbox-end]
// [split:body-end]
return { calendarClick: calendarClick, onCalendarChange: onCalendarChange, onCalendarInput: onCalendarInput, onSensesChange: onSensesChange, onSensesInput: onSensesInput, renderCalendar: renderCalendar, restDoes: restDoes, restTakeBack: restTakeBack, senseArcOf: senseArcOf, senseRangeFields: senseRangeFields, senseSecrets: senseSecrets, senseSwitchFields: senseSwitchFields, sensesBox: sensesBox, sensesClick: sensesClick };   // [split:glue]
}   // [split:glue]

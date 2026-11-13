// The timeline ribbon (1.6.2, backlog 166 h): timeline.js's core slice run for real with the real calendar core, the clock's record of the
// sessions played, and the wiring pinned. Plain Node, no dependencies, exits 1 on any failure.
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0, summed = false;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok        ' + name); } else { fail++; console.log('FAIL      ' + name + (detail !== undefined ? ' -> ' + detail : '')); } }
process.on('exit', () => { if (!summed) { console.log('FAIL      timelinecheck: an asynchronous check never finished'); process.exitCode = 1; } });
const root = path.join(__dirname, '..', 'system', 'app'), read = f => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n');
const url = f => 'file:///' + path.resolve(path.join(root, 'scripts', f)).split(String.fromCharCode(92)).join('/');
const J = JSON.stringify;
(async () => {
    const C = await import(url('calendarcore.js'));
    const src = read('scripts/timeline.js'), a = src.indexOf('// [timelinecheck:core-start]'), z = src.indexOf('// [timelinecheck:core-end]');
    check('the core slice is there once', a > 0 && z > a && src.indexOf('// [timelinecheck:core-start]', a + 1) < 0);
    const T = new Function('cleanCalendar', 'dateOf', 'timeOf', 'dayLength', 'noteNext', 'fmtDate', src.slice(a, z) + '\nreturn { tlItems, tlOccur, tlLimits, tlZoom, tlFit, tlTicks };')(C.cleanCalendar, C.dateOf, C.timeOf, C.dayLength, C.noteNext, C.fmtDate);
    const cal = C.cleanCalendar(C.preset('twelve')), dl = C.dayLength(cal), yd = C.yearDays(cal, 1), plain = C.cleanCalendar({});
    // the clock's record of the sessions played
    const pl = C.cleanPlayed([{ t: 86400, at: 1762400000000 }, { t: -1 }, { t: 'x' }, null, { t: 172800 }, { t: 1e16 }]);
    const many = C.cleanPlayed(Array.from({ length: 700 }, (x, i) => ({ t: i })));
    const ck0 = C.cleanClock({ t: 5, played: [{ t: 3, at: 9 }] }), ckNone = C.cleanClock({ t: 5, played: [] });
    check('166 h the sessions played (calendarcore cleanPlayed, run for real): each where the clock stood as it began and, the GM’s alone, when it was played; in order, the newest 500 kept; anything else dropped; the clock keeps them, and none means no key',
        J(pl) === J([{ t: 86400, at: 1762400000000 }, { t: 172800 }]) && many.length === 500 && many[0].t === 200 && many[499].t === 699 && C.cleanPlayed('x') === null && C.cleanPlayed([]) === null
        && J(ck0.played) === J([{ t: 3, at: 9 }]) && !('played' in ckNone) && C.LIMITS.played === 500, J(pl));
    // what stands on the ribbon
    const ck = { t: 100 * dl, notes: [{ id: 'n_1', day: 40, text: 'Flood' }, { id: 'n_2', day: 10, text: 'Feast', yearly: true }], eras: [{ id: 'e_aaaaaaaa', name: 'Floods', from: 1, to: 2, color: '#123456' }, { id: 'e_bbbbbbbb', name: 'Now', from: 3, color: 'nope' }], played: [{ t: 50 * dl + dl / 2, at: 7 }] };
    const it = T.tlItems(cal, ck);
    check('166 h what stands on the ribbon (tlItems, run for real): now as a day, each era from the first day of its first year to the first day of the year after its last (still going with no end), its color or the gold, the notes and the sessions played as days',
        it.today === 100 && it.eras.length === 2 && it.eras[0].d0 === 0 && it.eras[0].d1 === 2 * yd && it.eras[1].d0 === 2 * yd && it.eras[1].d1 === null && it.eras[0].color === '#123456' && it.eras[1].color === '#c9a227'
        && it.notes.length === 2 && J(it.sessions) === J([{ day: 50.5, at: 7 }]) && T.tlItems(plain, { t: 0, eras: ck.eras }).eras.length === 0, J(it.eras));
    const oc = T.tlOccur(cal, ck.notes, 0, 3 * yd);
    check('166 h the notes in view (tlOccur): a note on its day where it falls in view, a yearly note at every year it falls in, in date order',
        J(oc.map(o => [o.id, o.day])) === J([['n_2', 10], ['n_1', 40], ['n_2', 10 + yd], ['n_2', 10 + 2 * yd]]) && T.tlOccur(cal, ck.notes, 41, 50).length === 0, J(oc.map(o => [o.id, o.day])));
    // the view
    const lim = T.tlLimits(cal, 600), v = { c: 500, dpp: 2 }, w = 600, at = 150, dayAt = v.c - w * v.dpp / 2 + at * v.dpp, z1 = T.tlZoom(v, 0.25, at, w, lim), dayAt2 = z1.c - w * z1.dpp / 2 + at * z1.dpp;
    check('166 h the zoom (tlZoom, tlLimits, tlFit): the day under the pointer stays under it, near enough a day 80 px wide and far enough 100,000 years, and a fit shows every day asked for',
        Math.abs(dayAt - dayAt2) < 1e-9 && z1.dpp === 0.5 && T.tlZoom(v, 1e-9, at, w, lim).dpp === lim.min && lim.min === 1 / 80 && T.tlZoom(v, 1e12, at, w, lim).dpp === lim.max && Math.abs(lim.max - 100000 * yd / 600) < 1e-6
        && (function() { const f = T.tlFit(10, 610, 600, lim); return f.c === 310 && f.c - 300 * f.dpp <= 10 && f.c + 300 * f.dpp >= 610; })(), J([dayAt, dayAt2, z1]));
    const tY = T.tlTicks(cal, 0, 40 * yd, 600), tP = T.tlTicks(cal, 0, 2 * yd, 600), tD = T.tlTicks(cal, 0, 20, 600), tN = T.tlTicks(plain, 0, 20, 600);
    check('166 h the ticks (tlTicks): by years far out, by months in a year or two, by days close in, at least 70 px apart; with no years, by days counted',
        tY.length > 2 && tY.every(t => /^\d+$/.test(t.label)) && tP[0].label === 'January, 1' && tP.some(t => t.label === 'January, 2') && tD.length > 3 && tD.every((t, i) => !i || (t.day - tD[i - 1].day) * 600 / 20 >= 70) && /^Day \d+$/.test(tN[0].label), J([tY.slice(0, 3), tP.slice(0, 3), tD.slice(0, 3), tN.slice(0, 2)]));
    // the wiring
    const ix = read('index.html'), calJ = read('scripts/calendar.js'), net = read('scripts/net.js'), rec = read('scripts/record.js'), fl = read('scripts/floats.js'), esc = read('scripts/esckey.js');
    const box = ix.slice(ix.indexOf('<div id="timelinePanel"'), ix.indexOf('<div id="storyPanel"'));
    check('166 h wired (pinned): the ribbon above the list in the Calendar’s Timeline tab and in a window of its own from the campaign menu, a floating box by the rules; a press opens the day in the Calendar; a new session notes where the clock stands; players are sent where each session began and never when; drawn with elements and text nodes; Help says it',
        ['timelineHead', 'timelineClose', 'timelineBody'].every(i => box.includes('id="' + i + '"')) && !/<script|\son[a-z]+=/i.test(box) && ix.includes('id="timelineCampBtn"') && ix.includes('<script type="module" src="scripts/timeline.js"></script>')
        && /var FLOAT_IDS = \[[^\]]*'timelinePanel'/.test(fl) && /var ESC_LAST = \[[^\]]*'timelinePanel'/.test(esc) && esc.includes("timelinePanel: function(el) { if (!escPress(doc, 'timelineClose')) el.style.display = 'none'; },")
        && calJ.includes("window.wpTimeline.draw(rb, cal, clockOf(getActiveCampaign()), openDay);") && calJ.includes('sessionBegan: sessionBegan, timeData: timeData, openDay: openDay,') && rec.includes("window.wpCalendar.sessionBegan(camp);")
        && net.includes("if (ck.played) o.played = ck.played.map(function(p) { return { t: p.t }; });") && net.includes("if (ckIn && ckIn.played && campCk.clock) campCk.clock.played = ckIn.played.map(function(p) { return { t: p.t }; });")
        && !/innerHTML|insertAdjacentHTML|outerHTML/.test(src) && ix.includes('<b data-ctl="#timelineCampBtn">Timeline</b>'));
    summed = true;
    console.log('\n' + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exit(1);
})();

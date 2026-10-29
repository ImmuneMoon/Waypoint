/* Offline check of the table trackers (1.6.0, backlog 29; the owner, 2026-10-29, by prompt on the mock-up sheet: "A. A strip on the map",
   a countdown's time "Each one picks", a clock "A. A circle in parts", and at the end "A. Glow and a chat line"). The pure half (trackcore.js)
   is imported and run; the strip's module (trackers.js) is sliced by its [trackcheck:core-*] markers, the stream window (stream.js) by its
   [trackcheck:stream-*] markers, and both run on plain objects. The wire is netcheck's (trksync, trkmsg). The page, the floating box's lists,
   the load's cleaner, the VTT switch, Help, both release notes and the CI step are pinned. No browser, no network.
   Usage: node tools/trackcheck.js   (exit 1 on any failure) */
'use strict';
const path = require('path'), fs = require('fs');
const NL = String.fromCharCode(10);
const root = path.join(__dirname, '..'), app = path.join(root, 'system', 'app');
const readU = f => fs.readFileSync(path.join(app, f), 'utf8').replace(/\r\n/g, NL);
const readRoot = f => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, NL);
const j = o => JSON.stringify(o);
let pass = 0, fail = 0, summed = false;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok        ' + name); } else { fail++; console.log('FAIL      ' + name + (detail !== undefined ? '  -> ' + String(typeof detail === 'string' ? detail : j(detail)).slice(0, 1500) : '')); } }
function slice(src, tag) {
    const a = src.indexOf('// [' + tag + '-start]'), b = src.indexOf('// [' + tag + '-end]');
    if (a < 0 || b < a) throw new Error('no slice ' + tag);
    return src.slice(src.indexOf(NL, a) + 1, b);
}
const count = (s, t) => s.split(t).length - 1;
const url = f => 'file:///' + path.resolve(path.join(app, 'scripts', f)).split(String.fromCharCode(92)).join('/');

(async () => {
    const T = await import(url('trackcore.js'));
    const trJs = readU('scripts/trackers.js'), stJs = readU('scripts/stream.js'), ix = readU('index.html'), css = readU('style.css');

    /* ================= what a campaign keeps ================= */
    {
        const P = JSON.parse('{"id":"__proto__","kind":"count"}');
        const raw = [
            { id: 'a', kind: 'count', name: '  Fear' + String.fromCharCode(10) + 'x  ', v: 3.6, color: 'red', vis: 'all', junk: '<b>' },
            { id: 'b', kind: 'timer', total: 600400, left: 9e9, run: true, end: 1000, map: 'm1', vis: 'yes' },
            { id: 'c', kind: 'clock', parts: 40, fill: -3, map: 'gone' },
            P, { id: 'constructor', kind: 'count' }, { id: 'bad id', kind: 'count' }, { id: 'x', kind: 'dice' }, null, 'x',
            { id: 'a', kind: 'clock' },
            { id: 'd', kind: 'count', v: 50, min: 10, max: 2, start: 7 },
            { id: 'e', kind: 'count', v: -50, min: -5, max: 5, start: 0 },
            { id: 'f', kind: 'timer', base: 'game', total: 1e12, run: true },
            { id: 'g', kind: 'count', name: 'n'.repeat(90), color: 'url(x)' }
        ];
        const out = T.cleanTrackers(raw, { maps: { m1: 1 } });
        check('a campaign\'s trackers are cleaned (trackcore cleanTrackers, run for real): an id once and never a prototype\'s name, a known kind, a one-line name cut at 40 (a kind\'s own name when none), a colour from the fixed list by its name alone, vis only as all, nothing else kept',
            j(out.map(t => t.id)) === j(['a', 'b', 'd', 'e', 'f', 'g']) && out[0].name === 'Fear x' && out[0].color === 'red' && out[0].vis === 'all' && !('junk' in out[0]) && out[0].v === 4
            && out[1].name === 'Countdown' && out[1].color === 'gold' && !('vis' in out[1]) && out[5].name.length === 40 && out[5].color === 'gold', j(out));
        check('a tracker of a map that is gone goes with it; one of a map still there keeps its map; with no list of maps (a player\'s copy) the map is kept as it is',
            !out.some(t => t.id === 'c') && out[1].map === 'm1' && T.cleanTracker({ id: 'c', kind: 'clock', map: 'gone' }, {}).map === 'gone' && T.cleanTracker({ id: 'c', kind: 'clock', map: '__proto__' }, {}).map === undefined);
        check('a counter keeps its value within its lowest and highest (a lowest above the highest is neither), and Reset\'s value only when it is not 0; a clock keeps 2 to 12 parts and a fill within them',
            out[2].v === 50 && !('min' in out[2]) && !('max' in out[2]) && out[2].start === 7 && out[3].v === -5 && out[3].min === -5 && out[3].max === 5 && !('start' in out[3])
            && j(T.cleanTracker({ id: 'c', kind: 'clock', parts: 40, fill: -3 }, {})) === j({ id: 'c', kind: 'clock', name: 'Clock', color: 'gold', parts: 12, fill: 0 }) && T.cleanTracker({ id: 'c', kind: 'clock', parts: 1, fill: 9 }, {}).fill === 2);
        check('a countdown keeps a total of whole seconds within its cap (24 hours of real time, 3650 days of game time), a time left within it, and runs only with an end to run to',
            out[1].total === 600000 && out[1].left === 600000 && out[1].run === true && out[1].end === 1000 && out[4].base === 'game' && out[4].total === T.LIMITS.game && !('run' in out[4]) && !('end' in out[4])
            && T.cleanTracker({ id: 't', kind: 'timer', total: 5 }, {}).total === 1000 && T.cleanTracker({ id: 't', kind: 'timer', total: 1e15 }, {}).total === T.LIMITS.real);
        const many = Array.from({ length: 200 }, (_, i) => ({ id: 'k' + i, kind: 'count' })), junk = Array.from({ length: 5000 }, () => null).concat([{ id: 'late', kind: 'count' }]);
        check('a campaign holds at most 24 trackers, and a list of junk is read only so far (a long one costs nothing)', T.cleanTrackers(many).length === 24 && T.cleanTrackers(junk).length === 0 && j(T.cleanTrackers('x')) === '[]' && j(T.cleanTrackers(null)) === '[]');
        const w = T.cleanTracker({ id: 'w', kind: 'timer', total: 60000, left: 30000, run: true, end: 5, map: 'm1', vis: 'all' }, { wire: true });
        check('a player\'s copy (wire) keeps no map, no vis and no end: a running countdown is its time left and run', j(w) === j({ id: 'w', kind: 'timer', name: 'Countdown', color: 'gold', total: 60000, left: 30000, run: true }));
    }

    /* ================= what a player is sent ================= */
    {
        const list = T.cleanTrackers([
            { id: 'all', kind: 'count', name: 'Fear', v: 2, vis: 'all' },
            { id: 'gm', kind: 'count', name: 'Secret', v: 9 },
            { id: 'here', kind: 'clock', name: 'Alarm', parts: 6, fill: 2, vis: 'all', map: 'm1' },
            { id: 'there', kind: 'clock', name: 'Other', parts: 4, fill: 1, vis: 'all', map: 'm2' },
            { id: 'run', kind: 'timer', name: 'Ritual', total: 60000, run: true, end: 31000, vis: 'all' },
            { id: 'game', kind: 'timer', name: 'Caravan', base: 'game', total: 7200, run: true, end: 10000, vis: 'all' },
            { id: 'over', kind: 'timer', name: 'Done', total: 5000, run: true, end: 500, vis: 'all' }
        ], {});
        const m1 = T.wireFor(list, 'm1', 1000, 4600), none = T.wireFor(list, null, 1000, 4600), txt = j(m1) + j(none);
        check('a player is sent the trackers shown to the table on every map and on the map they stand on (trackcore wireFor): a GM-only tracker never, another map\'s never, and no map, vis or end in any',
            j(m1.map(t => t.id)) === j(['all', 'here', 'run', 'game', 'over']) && j(none.map(t => t.id)) === j(['all', 'run', 'game', 'over']) && !/Secret|"gm"|"map"|"vis"|"end"|m1|m2/.test(txt), txt);
        check('a running countdown is sent as its time left at that moment (real: its end less now; game: its end less the clock), and one that has reached its end as stopped',
            j(m1[2]) === j({ id: 'run', kind: 'timer', name: 'Ritual', color: 'gold', total: 60000, left: 30000, run: true }) && j(m1[3]) === j({ id: 'game', kind: 'timer', name: 'Caravan', color: 'gold', base: 'game', total: 7200, left: 5400, run: true })
            && j(m1[4]) === j({ id: 'over', kind: 'timer', name: 'Done', color: 'gold', total: 5000, left: 0 }), j(m1));
        const s1 = T.wireSig(list, 'm1', 1000, 4600), s2 = T.wireSig(list, 'm1', 9000, 4600), s3 = T.wireSig(list, 'm1', 9000, 4660), s4 = T.wireSig(T.cleanTrackers(list.map(t => t.id === 'all' ? Object.assign({}, t, { v: 3 }) : t)), 'm1', 9000, 4660);
        check('what the host compares (wireSig) stands still while a real countdown runs (sent once, worked out on each machine), and moves when the game clock moves or a value changes',
            s1 === s2 && s2 !== s3 && s3 !== s4);
    }

    /* ================= the GM's hand and the words ================= */
    {
        const c = T.cleanTracker({ id: 'c', kind: 'count', v: 4, min: 0, max: 5, start: 2 }, {}), k = T.cleanTracker({ id: 'k', kind: 'clock', parts: 3, fill: 2 }, {});
        const r = T.cleanTracker({ id: 'r', kind: 'timer', total: 10000 }, {}), g = T.cleanTracker({ id: 'g', kind: 'timer', base: 'game', total: 3600 }, {});
        const s1 = T.step(c, 1), s2 = T.step(s1, 1), kk = T.step(k, 1);
        const st = T.start(r, 1000, 0), pa = T.pause(st, 4000, 0), st2 = T.start(pa, 10000, 0), gs = T.start(g, 0, 500);
        check('the GM\'s hand (trackcore step, start, pause, reset, settle, run for real): a counter and a clock step within their bounds and answer null at them; a countdown starts from its time left, pauses where it stands, starts again from there; Reset puts each back',
            s1.v === 5 && s2 === null && c.v === 4 && kk.fill === 3 && T.step(kk, 1) === null && T.step(r, 1) === null
            && st.run === true && st.end === 11000 && pa.left === 7000 && !('run' in pa) && !('end' in pa) && st2.end === 17000 && gs.end === 4100 && T.start(st, 0, 0) === null && T.pause(r, 0, 0) === null
            && T.reset(s1).v === 2 && T.reset(kk).fill === 0 && j(T.reset(st)) === j(r) && T.reset(r) === null
            && T.settle(st, 5000, 0) === null && j(T.settle(st, 11000, 0)) === j(Object.assign({}, r, { left: 0 })), j([s1, kk, st, pa, st2, gs]));
        check('a tracker reaches its end (doneOf): a countdown at no time left, a clock with every part filled, a counter never',
            T.doneOf(T.cleanTracker({ id: 'x', kind: 'timer', total: 1000, left: 0 }, {}), 0, 0) && !T.doneOf(r, 0, 0) && T.doneOf(T.step(k, 1), 0, 0) && !T.doneOf(k, 0, 0) && !T.doneOf(c, 0, 0) && T.doneOf(st, 11001, 0) && !T.doneOf(st, 10999, 0));
        check('the words: a real countdown as m:ss or h:mm:ss, a game one by its two largest units with the calendar\'s day, a counter its number, a clock its fill of its parts, and the chat line',
            T.fmtReal(272000) === '04:32' && T.fmtReal(3723000) === '1:02:03' && T.fmtReal(0) === '00:00' && T.fmtReal(1) === '00:01'
            && T.fmtGame(8100) === '2 h 15 min' && T.fmtGame(183600) === '2 d 3 h' && T.fmtGame(183600, 100000) === '1 d 23 h' && T.fmtGame(300) === '5 min' && T.fmtGame(125) === '2 min 5 s' && T.fmtGame(42) === '42 s'
            && T.face(c, 0, 0) === '4' && T.face(k, 0, 0) === '2/3' && T.face(gs, 0, 600, 86400) === '58 min'
            && T.endLine(r) === 'The Countdown countdown has run out.' && T.endLine(k) === 'The Clock clock is full.');
        const parts = T.clockParts(8, 3, 10, 8.5);
        check('a clock is drawn as one path a part from the top, clockwise, the filled ones first, from numbers alone', parts.length === 8 && parts.filter(p => p.on).length === 3 && parts[0].on && !parts[7].on && parts.every(p => /^M10 10L[0-9. -]+A8\.5 8\.5 0 0 1 [0-9. -]+Z$/.test(p.d)), j(parts.slice(0, 2)));
    }

    /* ================= the strip's module, sliced ================= */
    {
        const win = { wpTrackCore: T };
        const M = new Function('window', 'TK', slice(trJs, 'trackcheck:core') + '\nreturn { atTable, gmHand, mapsOf, localCopy, newlyDone, fromForm };')(win, () => T);
        const host = { active: true, role: 'host' }, pl = { active: true, role: 'client', foreign: true }, wait = { active: true, role: 'client', foreign: false }, stream = { active: true, role: 'client', foreign: true, stream: true };
        check('who may change the trackers (trackers.js gmHand): the campaign\'s own machine, solo or hosting; never a player at a table, never the stream window, never where the app keeps nothing of its own',
            M.gmHand(null, {}) && M.gmHand(host, {}) && !M.gmHand(pl, {}) && !M.gmHand(stream, {}) && !M.gmHand(host, { wpStream: true }) && !M.gmHand(host, { wpCanPersistLocal: () => false }) && M.gmHand(host, { wpCanPersistLocal: () => true }) && M.atTable(pl) && !M.atTable(wait));
        const lc = M.localCopy([{ id: 'r', kind: 'timer', total: 9000, left: 4000, run: true }, { id: 'g', kind: 'timer', base: 'game', total: 600, left: 300, run: true }, { id: 'c', kind: 'count', v: 1 }], 50000);
        check('a player\'s copy runs on its own clock (localCopy): a running real countdown ends at its time left from the moment it arrived; a game one stands at what was sent until the host sends again',
            lc[0].end === 54000 && T.leftNow(lc[0], 52000, 0) === 2000 && !('run' in lc[1]) && T.leftNow(lc[1], 99999, 99999) === 300 && j(lc[2]) === j({ id: 'c', kind: 'count', v: 1 }), j(lc));
        const seen = Object.create(null), a = T.cleanTrackers([{ id: 'k', kind: 'clock', parts: 2, fill: 1 }, { id: 'f', kind: 'clock', parts: 2, fill: 2 }]);
        const first = M.newlyDone(a, seen, 0, 0), b = T.cleanTrackers([{ id: 'k', kind: 'clock', parts: 2, fill: 2 }, { id: 'f', kind: 'clock', parts: 2, fill: 2 }, { id: 'n', kind: 'clock', parts: 2, fill: 2 }]);
        const second = M.newlyDone(b, seen, 0, 0), third = M.newlyDone(b, seen, 0, 0);
        check('an end is said once, and only as news (newlyDone): a tracker first seen at its end (a join, a tracker shown later) says nothing; one that reaches its end says it once',
            first.length === 0 && j(second.map(t => t.id)) === j(['k']) && third.length === 0, j([first, second, third]));
        const f1 = M.fromForm({ id: 'x', kind: 'count', name: 'Fear', color: 'red', here: true, table: true, v: '3', min: '', max: '9', start: '' }, 'm1', 60);
        const f2 = M.fromForm({ id: 'y', kind: 'timer', name: 'Ritual', color: 'blue', here: false, table: false, amount: '10', base: 'real' }, 'm1', 60);
        const f3 = M.fromForm({ id: 'z', kind: 'timer', name: 'Trip', color: 'gold', here: true, table: true, amount: '2', base: 'game' }, '', 3600);
        const f4 = M.fromForm({ id: 'w', kind: 'timer', amount: '', base: 'real' }, 'm1', 60), f5 = M.fromForm({ id: 'v', kind: 'timer', amount: '5', base: 'real', sameTime: true, left: 1000, run: true, end: 77 }, 'm1', 60);
        check('the form becomes a tracker (fromForm): blank lowest and highest are none; This map needs a map on screen; a countdown\'s time is its amount times its unit; Keep the time it has left keeps its place',
            j(f1) === j({ id: 'x', kind: 'count', name: 'Fear', color: 'red', map: 'm1', vis: 'all', v: 3, max: 9 }) && j(f2) === j({ id: 'y', kind: 'timer', name: 'Ritual', color: 'blue', total: 600000, left: 600000 })
            && j(f3) === j({ id: 'z', kind: 'timer', name: 'Trip', color: 'gold', vis: 'all', base: 'game', total: 7200, left: 7200 }) && f4.total === 600000 && f5.left === 1000 && f5.run === true && f5.end === 77, j([f1, f2, f3, f4, f5]));
    }

    /* ================= the stream window ================= */
    {
        const got = [], win = { wpTrackCore: T, wpTrackers: { receive: (l, at) => got.push([l, at]) } };
        const S = new Function('window', slice(stJs, 'trackcheck:stream') + '\nreturn streamTrackers;')(win);
        const camp = { id: 'k', clock: { t: 100 }, trackers: [{ id: 'a', kind: 'count', name: 'Fear', v: 1, vis: 'all' }, { id: 's', kind: 'count', name: 'Secret' }, { id: 'h', kind: 'clock', name: 'Alarm', vis: 'all', map: 'm1', parts: 4, fill: 1 }, { id: 'r', kind: 'timer', name: 'Ritual', total: 9000, run: true, end: 5000, vis: 'all' }] };
        const l1 = S(camp, 'm1', 1000), again = S(camp, 'm1', 2000), l2 = S(camp, 'm2', 2000), l3 = S(null, 'm2', 2000);
        check('the stream window (stream.js streamTrackers, run for real) shows the trackers shown to the table on every map and on the map it shows, as a player is sent them: never a GM-only one; it hands them on only when they change',
            j(l1.map(t => t.id)) === j(['a', 'h', 'r']) && l1[2].left === 4000 && !/Secret|vis|map/.test(j(got)) && got.length === 3 && j(l2.map(t => t.id)) === j(['a', 'r']) && j(l3) === '[]' && again.length === 3, j(got));
    }

    /* ================= the page, the lists and the pins ================= */
    {
        const floats = readU('scripts/floats.js'), sheets = readU('scripts/sheets.js'), esc = readU('scripts/esckey.js'), io = readU('scripts/io.js'), vtt = readU('scripts/vtt.js'), main = readU('scripts/main.js'), net = fs.readFileSync(path.join(app, 'scripts', 'net.js'), 'latin1').replace(/\r\n/g, NL);
        check('the page holds the strip on the play map, the menu and the form (a floating box with its close button), and loads the two modules after the Time rules panel',
            count(ix, '<div id="trkStrip" role="group" aria-label="Table trackers" style="display:none;"></div>') === 1 && count(ix, 'id="trkMenu"') === 1 && count(ix, 'id="trkPanel"') === 1 && count(ix, 'id="trkCloseBtn"') === 1 && count(ix, 'id="trkBody"') === 1
            && ix.indexOf('id="combatStrip"') < ix.indexOf('id="trkStrip"') && ix.indexOf('id="trkStrip"') < ix.indexOf('<div id="whiteboardWrap">')
            && ix.indexOf('scripts/timepanel.js') < ix.indexOf('scripts/trackcore.js') && ix.indexOf('scripts/trackcore.js') < ix.indexOf('scripts/trackers.js'));
        check('the form is a floating box by the rules (FLOAT_IDS, Z_BOXES, ESC_LAST with its close button) and the menu is put away by Escape as a right-click menu is (ESC_RIGHT)',
            /var FLOAT_IDS = \[[^\]]*'trkPanel'\]/.test(floats) && /var Z_BOXES = \[[^\]]*'trkPanel'\]/.test(sheets) && /var ESC_LAST = \[[^\]]*'trkPanel'\]/.test(esc) && /var ESC_RIGHT = \[[^\]]*'trkMenu'\]/.test(esc)
            && esc.includes("trkPanel: function(el) { if (!escPress(doc, 'trkCloseBtn')) el.style.display = 'none'; } };"));
        check('a load and an import clean the trackers and the players they are kept from (io.js, trackcore imported first), the strip follows every render, and the VTT switch Table trackers is the roster\'s last, the GM\'s alone (moved on purpose: the switch the building fold left out)',
            io.includes("import './trackcore.js';") && io.includes("var tkL = TKl && TKl.cleanTrackers ? TKl.cleanTrackers(c.trackers, { maps: tkM }) : []; if (tkL.length) c.trackers = tkL; else delete c.trackers; }")
            && io.includes("if (c.trkHide !== undefined) { var tkH = window.wpTrackCore && window.wpTrackCore.cleanHide ? window.wpTrackCore.cleanHide(c.trkHide) : []; if (tkH.length) c.trkHide = tkH; else delete c.trkHide; }")
            && vtt.includes("    { id: 'trackers',  label: 'Table trackers',   legacyKey: null, noLocal: true }   // 1.6.0 backlog 29") && /\n\];/.test(vtt.slice(vtt.indexOf("{ id: 'trackers'"), vtt.indexOf("{ id: 'trackers'") + 400))
            && count(main, 'if (window.wpTrackers) window.wpTrackers.draw();') === 2);
        check('the snapshot never carries the trackers (sanitizeAppState deletes them); a joiner is sent theirs after it; a player at another map is sent that map\'s; the chat line is a whisper of this machine\'s own, drawn by trackers.js',
            net.includes("delete camp.trackers; // backlog 29") && net.includes("if (snapOk && typeof net.trackersForget === 'function') { net.trackersForget(conn.peer); trkSendTo(conn, Date.now()); }")
            && net.includes("broadcast({ type: 'roster', roster: rosterPayload(), away: awayMap() }, null); if (typeof net.syncTrackers === 'function') net.syncTrackers(); }")
            && net.includes("pushChat({ type: 'chat', scope: 'whisper', from: { id: 'tracker', name: 'Tracker' }, text: text.slice(0, 200), ts: Date.now(), trk: true });")
            && net.includes("m.trk && window.wpTrackers && window.wpTrackers.renderLine ? window.wpTrackers.renderLine(m) : chatEntryNode(m);") && net.includes("function chatHistoryOf(log) { return log.filter(function(m) { return m.scope !== 'whisper'; })")
            && !/msg\.type === 'trackers' && net\.role === 'host'/.test(net));
        check('the strip draws with elements and text nodes only: no markup anywhere in trackers.js, a colour only from the fixed list, every step logged',
            !/innerHTML|outerHTML|insertAdjacentHTML/.test(trJs) && /dot\.style\.background = hex;/.test(trJs) && /hex = T\.COLORS\[t\.color\] \|\| T\.COLORS\.gold/.test(trJs) && ['step', 'start', 'pause', 'reset', 'shown', 'where', 'remove', 'settle', 'add', 'edit', 'end', 'received', 'fold', 'form', 'fail'].every(w => trJs.includes("'" + w + "'")) && trJs.includes("window.wpStepLog('trackers v1', step, facts || {})")
            && css.includes('#trkStrip .trk-pill.trk-done {') && css.includes('#trkPanel {'));
        const help = ix.slice(ix.indexOf('<h4 id="helpTrackers">Table trackers</h4>'), ix.indexOf('<h4>Coordinate rulers &amp; minimap</h4>'));
        check('Help has Table trackers on the Play Map part (the three kinds, + Tracker, who sees it, the end, the fold, the log) and a line for players; both release notes say it',
            help.length > 400 && help.includes('<b>+ Tracker</b> opens a small form.') && help.includes('It never leaves your computer.') && help.includes('Table Chat says so on every screen that sees it.') && help.includes('Each step is written to <b>saves/error.log</b>.')
            && ix.includes('<li><b>Table trackers:</b> the pills at the top left of the map are counters, countdowns and clocks your GM shows the table.')
            && ['WHATSNEW.txt', 'system/app/assets/whatsnew.txt'].every(f => readRoot(f).includes(NL + 'Table trackers' + NL + '- Put counters, countdowns and clocks on the play map.')));
        /* the owner, 2026-10-29, by prompt: "gm but for the whole table or specific players", and for the one player "maybe a combo of all?" */
        const H = T.cleanHide(['u_a', 'u_a', '<b>', '', 5, null, '__proto__', 'constructor', 'x'.repeat(81), 'u.b:1-_'].concat(Array.from({ length: 80 }, (_, i) => 'p' + i)));
        check('backlog 29 the players the trackers are kept from: profile ids only, each once, no prototype name, at most 64; none from no list; hiddenFrom asks that list; hideSet puts one in or takes one out, null where nothing changes',
            H.length === 64 && H[0] === 'u_a' && H[1] === 'u.b:1-_' && !H.includes('<b>') && !H.includes('__proto__') && !H.includes('constructor') && j(T.cleanHide('u_a')) === '[]' && j(T.cleanHide(undefined)) === '[]'
            && T.hiddenFrom({ trkHide: ['u_a'] }, 'u_a') === true && T.hiddenFrom({ trkHide: ['u_a'] }, 'u_b') === false && T.hiddenFrom(null, 'u_a') === false && T.hiddenFrom({ trkHide: 'u_a' }, 'u_a') === false
            && j(T.hideSet(['u_a'], 'u_b', true)) === j(['u_a', 'u_b']) && j(T.hideSet(['u_a', 'u_b'], 'u_a', false)) === j(['u_b']) && T.hideSet(['u_a'], 'u_a', true) === null && T.hideSet([], 'u_a', false) === null
            && T.hideSet([], '<b>', true) === null && T.hideSet([], '__proto__', true) === null && T.hideSet(H, 'zz', true) === null && T.LIMITS.hide === 64, j(H));
        const wbJ = readU('scripts/whiteboard.js'), setJ = readU('scripts/settings.js');
        check('backlog 29 Table trackers switched off: the strip, the menu and the form stand aside and no end is said (trackers.js featOn), the stream window shows none, and a change of the switch reaches the wire at once (vtt.js changed)',
            trJs.includes("function featOn() { var v = window.wpVtt; return !v || typeof v.on !== 'function' || v.on('trackers') !== false; }") && trJs.includes("play = onPlay() && !!camp && on,") && trJs.includes("if (!on) { if (_menu) closeMenu(); if (_form) closeForm(); }")
            && trJs.includes("if (!featOn()) { _seen = Object.create(null); _seenKey = ''; return; }") && trJs.includes("|| !gmHand(net(), window) || !featOn()) return;")
            && stJs.includes("if (camp && V && typeof V.campaignOn === 'function' && V.campaignOn('trackers', camp) === false) camp = null;") && vtt.includes("if (n && n.syncTrackers) n.syncTrackers();"));
        check('backlog 29 the GM keeps the trackers from one player in three places, all through trackers.js setHidden (the GM\'s hand, saved, sent at once, logged): Who sees these at the end of the GM\'s strip, a player\'s menu on the party strip and on their token, and a tick per player under the switch in Settings',
            trJs.includes("wb.id = 'trkWho';") && trJs.includes("if (b.id === 'trkWho') { if (_menu === '@who') closeMenu(); else openWho(b); return; }") && trJs.includes("b.dataset.trkwho = p.id;") && trJs.includes("log('hide', { on: on === true, n: next.length });")
            && trJs.includes("var camp = campNow(), T = TK(); if (!camp || !T || !gmHand(net(), window)) return false;") && trJs.includes("setHidden: setHidden };")
            && wbJ.includes("items.push({ act: 'trkHide', label:") && wbJ.includes("else if (act === 'trkHide') {") && wbJ.includes("<div class=\"menu-item cm-trk-hide\">") && wbJ.includes("} else if (action.includes('cm-trk-hide')) {")
            && setJ.includes("function syncTrkHide(camp, editable, client) {") && setJ.includes("if (!T.setHidden(p.id, cb.checked))") && ix.includes('<div id="setTrkHide" class="gm-only set-trk-hide"')
            && ix.includes('<div class="set-vtt-row" data-vtt="trackers"') && ix.includes('id="setTrackersBtn"') && ix.includes('id="setVttGlobalTrackersBtn"'));
        check('backlog 29 Help says where the switch is and the three ways to keep the trackers from one player, the player\'s line says the GM may, and both release notes say it',
            help.includes('<b>Settings &#9656; VTT features &#9656; Table trackers</b>') && help.includes('<b>Who sees these</b>') && help.includes('<b>Hide table trackers from them</b>') && help.includes('That player then gets no tracker at all.')
            && ix.includes('Your GM may switch them off, for the table or for you alone.') && ['WHATSNEW.txt', 'system/app/assets/whatsnew.txt'].every(f => readRoot(f).includes('- Table trackers is a VTT feature in Settings, on by default.')));
        const ci = readRoot('.github/workflows/checks.yml');
        check('CI runs this suite', ci.includes('run: node tools/trackcheck.js'));
    }

    summed = true;
    console.log(NL + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exit(1);
})().catch(e => { console.log('FAIL      the suite stopped: ' + (e && e.stack || e)); process.exit(1); });
process.on('exit', () => { if (!summed) { console.log('FAIL      the suite never finished its checks'); process.exitCode = 1; } });

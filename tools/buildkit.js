/* buildkit.js: what tools/buildcheck.js and tools/buildtoolcheck.js share, so that neither keeps a copy (docs/REFACTOR_SPLIT_PLAN.md,
   "Tests move with their area", area 4, 2026-11-18). It is not a suite: its name does not end in check.js, so no CI step runs it.

   Why it exists. buildcheck.js held the map builder's tests in one file. When the Build tool and the generators' dialogs moved out of
   whiteboard.js into wbbuild.js and wbgen.js (area 4), their tests moved into buildtoolcheck.js, which reads those parts by name. What
   both suites used from buildcheck's head came here, unchanged:
   - NL, url(f), read(f), j(o): a line break, a script's file URL, a file of the repository read as LF (Help without a chip's mark),
     JSON.stringify.
   - winRec, escFirst, ESC_WANT, ESC_FIRST, escSaid, ESC_WORDS: a window that keeps its listeners, and what a dialog's world says of Escape
     heard first there (the review of fold B6), for the generators' dialogs and Save Map as Picture.
   - cut(src, head, indent): the first function of that name in a source, to its closing brace at the indent it opened with.
   - lcg(at): a tiny seeded random walk, { rnd, ri, skip }, the same every run, one for each suite that asks. It starts `at` draws
     in, and skip(n) passes n draws over: each seeded block of the two suites draws the very numbers it drew when buildcheck.js held
     them all in one walk (the review of next area 1, 2026-11-18), so the seeded cases that ran before run again.
   - cutM(s, name, file): the text between a [buildcheck:name-start] and -end marker of a source; partOf(name): a part of a split
     giant script, read by its own name (tools/checkkit.js part).
   - HOSTILE: the values a cleaner is tried on.
   - sortKeys(o) and b5Kit(B): a piece's keys in sorted order, and the pieces and marks of a secret door (fold B5) that buildcheck's
     secret door blocks and buildtoolcheck's Build checks of a secret door both read.
   - wallOracle(B, F, hx): a counter of the suites' own for what stands and what is laid along a lattice (the walls around a
     selection and a door's cut are judged by it), made with buildcore, fogcore and a hex grid; it answers its functions by name.
   Requiring it installs srcjoin first, so that a read of a split script answers its joined text. */
'use strict';
require('./srcjoin').install();   // a split giant script reads joined, exactly as it was before the split (tools/srcjoin.js)
const path = require('path'), fs = require('fs');
const NL = String.fromCharCode(10);
const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).replace(/[\\]/g, '/');
const read = f => { const t = fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/\r\n/g, NL); return /index\.html$/.test(f) ? t.replace(/<b data-ctl="[^"]*">/g, '<b>') : t; };   // 1.6.2: Help's words read without a chip's mark (backlog 142), which helpchipcheck holds
const j = o => JSON.stringify(o);
// a window that keeps its listeners, and what a dialog's world says of Escape heard first there (the review of fold B6): used by the
// dungeon's and the city's dialog alike
const winRec = () => ({ on: {}, addEventListener(ev, fn, cap) { (this.on[ev] = this.on[ev] || []).push({ fn, cap }); }, fire(ev, arg) { const e = Object.assign({ stopped: 0, stoppedNow: 0, prevented: 0, stopPropagation() { this.stopped++; }, stopImmediatePropagation() { this.stoppedNow++; }, preventDefault() { this.prevented++; } }, arg || {}); (this.on[ev] || []).forEach(l => l.fn.call(this, e)); return e; } });   // the window: it hears a key before the document does
const escFirst = (mk, wire, rowId, modalId, fieldId) => { try {
    const W = mk({}); W.api[wire](); const cap = W.win.on.keydown.map(l => l.cap === true).join(), down = W.win.fire('keydown', { key: 'Escape', target: {} });
    W.els[rowId].fire('click'); const other = W.win.fire('keydown', { key: 'a', target: W.els[fieldId] }), inside = W.win.fire('keydown', { key: 'Escape', target: W.els[fieldId] }), inDown = W.els[modalId].style.display, inFocus = W.els[rowId].focused > 0;
    W.els[rowId].fire('click'); const outside = W.win.fire('keydown', { key: 'Escape', target: {} }), outDown = W.els[modalId].style.display;
    W.els[rowId].fire('click'); const held = W.win.fire('keydown', { key: 'Escape', repeat: true, target: {} }), heldUp = W.els[modalId].style.display, old = W.win.fire('keydown', { key: 'Escape', target: {}, stopImmediatePropagation: undefined }), oldDown = W.els[modalId].style.display;
    const Q = mk({ asking: true }); Q.els.customConfirm = Q.els.customConfirm || { style: {} }; Q.els.customConfirm.style.display = 'flex'; Q.api[wire](); Q.els[rowId].fire('click'); const ask = Q.win.fire('keydown', { key: 'Escape', target: {} }), askUp = Q.els[modalId].style.display, askHeld = Q.win.fire('keydown', { key: 'Escape', repeat: true, target: {} }), askHeldUp = Q.els[modalId].style.display;
    const rEsc = W.els[rowId].fire('keydown', { key: 'Escape', repeat: true }), rFresh = W.els[rowId].fire('keydown', { key: 'Escape', repeat: false }), rEnter = W.els[rowId].fire('keydown', { key: 'Enter', repeat: true }), rSpace = W.els[rowId].fire('keydown', { key: ' ', repeat: true }), rA = W.els[rowId].fire('keydown', { key: 'a', repeat: true }), rEnterFresh = W.els[rowId].fire('keydown', { key: 'Enter', repeat: false });
    const N = mk({}); delete N.win.addEventListener; let bare = true; try { N.api[wire](); } catch (e) { bare = false; }
    // the press that put the dialog away is the dialog's for as long as it is held (the second review of fold B6): a world of its own, so no probe above moves
    const H = mk({}); H.api[wire](); const hKey = (ev, more) => H.win.fire(ev, Object.assign({ key: 'Escape', target: {} }, more || {})), hSaid = e => [e.stoppedNow, e.stopped, e.prevented], hRep = more => hSaid(hKey('keydown', Object.assign({ repeat: true }, more || {}))).concat([H.els[modalId].style.display]), hAway = () => { H.els[rowId].fire('click'); const e = hKey('keydown'); return [e.stoppedNow, e.prevented, H.els[modalId].style.display]; };
    const hNone = hRep(), hDownKey = hSaid(hKey('keydown')), hDown = hRep();   // no press put the dialog away: a held Escape is left alone, and so is one after a fresh Escape while the dialog was down
    const hPut = hAway(), hHeld = hRep(), hHeld2 = hRep(), hOld = hRep({ stopImmediatePropagation: undefined });   // right after the press that put it away, for as long as it is held, and where an event has no immediate stop
    const hUpEv = hSaid(hKey('keyup')), hUp = hRep();   // Escape let go
    hAway(); const hOtherEv = hSaid(hKey('keydown', { key: 'a' })), hOther = hRep();   // a fresh press of another key
    hAway(); const hEscEv = hSaid(hKey('keydown')), hEsc = hRep();   // a fresh press of Escape itself, while the dialog is down, ends it too: that press is left alone, and so is the held Escape after it
    hAway(); const hUpOtherEv = hSaid(hKey('keyup', { key: 'a' })), hUpOther = hRep(), hRepOther = hSaid(hKey('keydown', { key: 'a', repeat: true })), hStill = hRep();   // another key let go, and another key held: neither ends it
    hKey('keyup'); H.els[rowId].fire('click'); const hUpHeld = hRep();   // let go, and the dialog up again: a held Escape is the dialog's own to stop, and puts nothing away
    // what the third review's second reader found: two things the words below say that no probe held. Each in a world of its own
    const key3 = e => [e.stoppedNow, e.stopped, e.prevented], rep3 = X => key3(X.win.fire('keydown', { key: 'Escape', repeat: true, target: {} })).concat([X.els[modalId].style.display]);
    const A3 = mk({}); A3.api[wire](); A3.els[rowId].fire('click'); const aUp = rep3(A3); A3.els[modalId].style.display = 'none'; const aLate = rep3(A3), aLate2 = rep3(A3);   // a held Escape that the dialog stopped while it was up is no press that put it away: with the dialog put away by other means, the same held Escape is left alone
    const Q3 = mk({}); Q3.api[wire](); Q3.els[rowId].fire('click'); Q3.win.fire('keydown', { key: 'Escape', target: {} }); Q3.els.customConfirm = Q3.els.customConfirm || { style: {} }; Q3.els.customConfirm.style.display = 'flex'; const qDown = rep3(Q3);   // the press that put the dialog away, still held when a question of the app's own comes up: stopped all the same
    Q3.els.customConfirm.style.display = 'none'; Q3.els[rowId].fire('click'); Q3.els.customConfirm.style.display = 'flex'; const qUp = rep3(Q3);   // ... and with the dialog opened again by its row, under that question
    const lis = [Object.keys(W.win.on).sort().join(), W.win.on.keydown.length, (W.win.on.keyup || []).map(l => l.cap === true).join()];   // what the wiring left on the window
    return [cap, [down.stoppedNow, down.prevented], [other.stoppedNow, other.stopped, other.prevented], [inside.stoppedNow, inside.prevented, inDown, inFocus], [outside.stoppedNow, outside.prevented, outDown], [held.stoppedNow, held.prevented, heldUp], [old.stopped, old.prevented, oldDown], [ask.stoppedNow, ask.stopped, ask.prevented, askUp],
        [rEsc.prevented, rEsc.stopped], [rFresh.prevented, rFresh.stopped], [rEnter.prevented, rEnter.stopped, rSpace.prevented, rSpace.stopped], [rA.prevented, rA.stopped, rEnterFresh.prevented, rEnterFresh.stopped], bare,
        lis, [hNone, hDownKey, hDown], [hPut, hHeld, hHeld2, hOld], [hUpEv, hUp], [hOtherEv, hOther], [hEscEv, hEsc], [hUpOtherEv, hUpOther, hRepOther, hStill], hUpHeld, [askHeld.stoppedNow, askHeld.stopped, askHeld.prevented, askHeldUp], [aUp, aLate, aLate2], [qDown, qUp]];
} catch (e) { return String(e && e.stack || e); } };
const ESC_WANT = ['true', [0, 0], [0, 0, 0], [1, 1, 'none', true], [1, 1, 'none'], [1, 1, 'flex'], [1, 1, 'none'], [0, 0, 0, 'flex'], [1, 1], [0, 0], [1, 1, 1, 1], [0, 0, 0, 0], true,
    ['keydown,keyup', 1, 'true'], [[0, 0, 0, 'none'], [0, 0, 0], [0, 0, 0, 'none']], [[1, 1, 'none'], [1, 0, 1, 'none'], [1, 0, 1, 'none'], [0, 1, 1, 'none']], [[0, 0, 0], [0, 0, 0, 'none']], [[0, 0, 0], [0, 0, 0, 'none']], [[0, 0, 0], [0, 0, 0, 'none']], [[0, 0, 0], [1, 0, 1, 'none'], [0, 0, 0], [1, 0, 1, 'none']], [1, 0, 1, 'flex'], [0, 0, 0, 'flex'], [[1, 0, 1, 'flex'], [0, 0, 0, 'none'], [0, 0, 0, 'none']], [[1, 0, 1, 'none'], [1, 0, 1, 'flex']]], ESC_FIRST = j(ESC_WANT);
// what a failing run says: only the entries that differ, each with its place in the list (the whole list is longer than a detail prints)
const escSaid = got => Array.isArray(got) ? j((got.length === ESC_WANT.length ? [] : [['length', got.length, ESC_WANT.length]]).concat(got.map((v, i) => [i, v]).filter(p => j(p[1]) !== j(ESC_WANT[p[0]])))) : String(got);
const ESC_WORDS = ' hears Escape FIRST, at the window in the capture phase, and lets it go no further (the review of fold B6). With the focus in the dialog or outside it the key is stopped at once, before any listener of the document such as the dice roller\'s, and the dialog is put away with the focus back on its row. A held Escape is stopped and puts nothing away. Where an event has no immediate stop the plain one is used. Any other key, a key while the dialog is down and a key while a question of the app\'s own is up are left alone. On the row itself a key still held from the press that put the dialog away goes no further, Escape as Enter and the space bar, so Build\'s own Escape does not put the tool away, while a fresh press and any other key are the page\'s. A window that keeps no listeners is no error. The press that put the dialog away is the dialog\'s for as long as it is held (the second review). Its repeats are stopped at once at the window and prevented while the dialog stays down, however many come. That ends when Escape is let go, and at any fresh press of a key, another key or Escape itself. It does not end when another key is let go or held. A held Escape with no such press before it is left alone: with no press at all, after a fresh Escape while the dialog was down, and under a question. The wiring leaves the window one keydown listener and one keyup listener, both in the capture phase, and the keyup listener stops nothing. A held Escape that the dialog stopped while it was up is no press that put it away (the third review): once the dialog is put away by other means, the same held Escape is left alone, however often it comes. And the press that did put the dialog away, still held, is stopped under a question of the app\'s own too: with the dialog down, and with the dialog opened again by its row';
// the first function of that name in a source, up to its closing brace at the indent it opened with (how fogcheck slices fog.js)
function cut(src, head, indent) { const i = src.indexOf(head), end = NL + (indent || '') + '}' + NL, k = src.indexOf(end, i); if (i < 0 || k < 0) throw new Error('buildcheck: ' + head + ' not found'); return src.slice(i, k + end.length); }
// a tiny LCG: the same walk every run (each suite has its own, from the same seed). at: how many draws it starts past; skip(n): n
// draws passed over, so that a block keeps the place in the walk it had when buildcheck.js drew every block from one walk
function lcg(at) { let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648; const ri = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1)); const skip = n => { for (let i = 0; i < n; i++) rnd(); }; skip(at || 0); return { rnd, ri, skip }; }
const cutM = (s, name, file) => { const a = '// [buildcheck:' + name + '-start]', b = '// [buildcheck:' + name + '-end]', i = s.indexOf(a), k = s.indexOf(b); if (i < 0 || k < i) throw new Error('buildcheck: ' + name + ' markers not found in ' + file); return s.slice(i, k); };
// a part of a split giant script, read by its own name (area 4: the Build tool in wbbuild.js, the generators' dialogs in wbgen.js)
const partOf = n => require('./checkkit').part(n);
const HOSTILE = ['constructor', '__proto__', 'hasOwnProperty', 'toString', 'valueOf', 'Flagstones', 'flagstones ', ' flagstones', 'url(x)', '/saves/images/x.png', 'data:image/png;base64,AA', '', 1, null, undefined, {}, [], true];
// the walls' counter, made with the cores and the hex grid the suite holds
function wallOracle(B, F, hx) {
    // A counter of the suite's own for what stands and what is laid (the third review: what stands is judged side by side). A lattice as the
    // suite reads it: a cell's sides, each with its two corners and the cell across it. A side is named by its middle
    const SQD = [[0, -1, 0, 0, 1, 0], [1, 0, 1, 0, 1, 1], [0, 1, 0, 1, 1, 1], [-1, 0, 0, 0, 0, 1]], EHD = [[0, -1], [1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0]], eKey = (a, b) => Math.round((a[0] + b[0]) * 5) + ',' + Math.round((a[1] + b[1]) * 5);
    const eSides = (g, c) => g.type === 'square' ? SQD.map(d => ({ nb: { c: c.c + d[0], r: c.r + d[1] }, a: [(c.c + d[2]) * g.size, (c.r + d[3]) * g.size], b: [(c.c + d[4]) * g.size, (c.r + d[5]) * g.size] }))
        : EHD.map(d => { const nb = { q: c.q + d[0], r: c.r + d[1] }, p = F.cellCenter(c, g), n = F.cellCenter(nb, g), mx = (p.x + n.x) / 2, my = (p.y + n.y) / 2, ax = d[0] ? g.s / 4 : g.s / 2, ay = d[0] ? ((n.x - p.x) * (n.y - p.y) > 0 ? -1 : 1) * g.h / 4 : 0; return { nb, a: [mx - ax, my - ay], b: [mx + ax, my + ay] }; });
    const eCell = (g, c) => (g.type === 'square' ? { type: 'rect', x: c.c * g.size, y: c.r * g.size, w: g.size, h: g.size } : Object.assign({ type: 'hexagon' }, B.hexCellBox(g, c))), eNb = (g, c, d) => (g.type === 'square' ? { c: c.c + d[0], r: c.r + d[1] } : { q: c.q + d[0], r: c.r + d[1] }), eDirs = g => (g.type === 'square' ? SQD : EHD);
    // the outer sides of a set of cells: a side's name -> its two corners, the cell inside and the cell outside
    const eOuter = (g, cells) => { const inS = new Set(cells.map(c => F.cellKey(c, g))), m = new Map(); cells.forEach(c => eSides(g, c).forEach(sd => { if (!inS.has(F.cellKey(sd.nb, g))) m.set(eKey(sd.a, sd.b), { a: sd.a, b: sd.b, in: c, out: sd.nb }); })); return m; };
    // The sides a line runs along, read stretch by stretch from its points alone, in its own box at its own scale. On a square lattice a level
    // or upright stretch between lattice corners runs along every cell side between them. On a hex lattice a stretch that joins the two corners
    // of one side runs along that side. `odd` counts every other stretch. This is how a NEW line is read: the app lays its lines from lattice
    // corner to lattice corner, and a new line that does anything else is wrong. What STANDS is read by eHeld as well, below: a standing
    // wall may have a point in the middle of a side, or be one straight stretch over several sides and the dips between them
    const eOn = (v, step) => Math.abs(v - Math.round(v / step) * step) < 0.02;
    const eUnits = (g, w) => { const fx = w.baseW > 0 ? w.w / w.baseW : 1, fy = w.baseH > 0 ? w.h / w.baseH : 1, P = w.pts.map(p => [w.x + p[0] * fx, w.y + p[1] * fy]), keys = []; let odd = 0;
        for (let i = 1; i < P.length; i++) { const a = P[i - 1], b = P[i];
            if (g.type === 'square') { const s = g.size, lev = Math.abs(a[1] - b[1]) < 0.02, upr = Math.abs(a[0] - b[0]) < 0.02;
                if (lev === upr || ![a[0], a[1], b[0], b[1]].every(v => eOn(v, s))) { odd++; continue; }
                const n = Math.round(Math.abs(lev ? b[0] - a[0] : b[1] - a[1]) / s), x0 = Math.min(a[0], b[0]), y0 = Math.min(a[1], b[1]);
                for (let k = 0; k < n; k++) keys.push(lev ? eKey([x0 + k * s, y0], [x0 + (k + 1) * s, y0]) : eKey([x0, y0 + k * s], [x0, y0 + (k + 1) * s])); }
            else if (Math.abs(Math.hypot(b[0] - a[0], b[1] - a[1]) - g.s) < 0.05 && eOn(a[0], g.s / 2) && eOn(b[0], g.s / 2) && eOn(a[1], g.h / 2) && eOn(b[1], g.h / 2)) keys.push(eKey(a, b)); else odd++; }
        return { keys, odd }; };
    const eIsWall = w => !!w && w.type === 'path' && w.tip !== 'fill' && w.blocksSight === true && w.sightType !== 'door' && !w.hidden;
    // What stands, read TOGETHER (the fifth round: the source gathers what stands a lattice line at a time). The suite asks it the other way
    // round, a side at a time: of all the stretches of all the standing walls, those that lie on the side's own line (both ends of the stretch
    // within a pixel of it) are laid along that line, those that touch or overlap within a pixel are joined, and the side is walled where one
    // joined stretch holds both its corners within a pixel. So a wall drawn as one straight stretch over several sides, a wall with a point in
    // the middle of a side and two walls that meet in the middle of a side all wall it
    const eSegs = map => { const out = []; map.filter(eIsWall).forEach(w => { const fx = w.baseW > 0 ? w.w / w.baseW : 1, fy = w.baseH > 0 ? w.h / w.baseH : 1, P = w.pts.map(p => [w.x + p[0] * fx, w.y + p[1] * fy]); for (let i = 1; i < P.length; i++) out.push([P[i - 1][0], P[i - 1][1], P[i][0], P[i][1], Math.min(P[i - 1][0], P[i][0]), Math.min(P[i - 1][1], P[i][1]), Math.max(P[i - 1][0], P[i][0]), Math.max(P[i - 1][1], P[i][1])]); }); return out; };   // a stretch: its two ends and its box
    const eHeld = (sd, segs) => { const ax = sd.a[0], ay = sd.a[1], len = Math.hypot(sd.b[0] - ax, sd.b[1] - ay), dx = (sd.b[0] - ax) / len, dy = (sd.b[1] - ay) / len, iv = [];
        const x0 = Math.min(ax, sd.b[0]) - 2, y0 = Math.min(ay, sd.b[1]) - 2, x1 = Math.max(ax, sd.b[0]) + 2, y1 = Math.max(ay, sd.b[1]) + 2;   // a stretch whose box does not reach the side's own, two pixels wider, holds no part of the side
        for (let n = 0; n < segs.length; n++) { const s = segs[n]; if (s[6] < x0 || s[4] > x1 || s[7] < y0 || s[5] > y1) continue;
            if (Math.abs((s[0] - ax) * dy - (s[1] - ay) * dx) > 1 || Math.abs((s[2] - ax) * dy - (s[3] - ay) * dx) > 1) continue;
            const t0 = (s[0] - ax) * dx + (s[1] - ay) * dy, t1 = (s[2] - ax) * dx + (s[3] - ay) * dy; iv.push(t0 < t1 ? [t0, t1] : [t1, t0]); }
        iv.sort((p, q) => p[0] - q[0]);
        for (let i = 0, lo = 0, hi = 0; i <= iv.length; i++) { if (i && i < iv.length && iv[i][0] <= hi + 1) { hi = Math.max(hi, iv[i][1]); continue; } if (i && lo <= 1 && hi >= len - 1) return true; if (i < iv.length) { lo = iv[i][0]; hi = iv[i][1]; } }
        return false; };
    // One answer judged. `want`: the sides that are to be walled, a Map by name. `map`: what stands. The answer is wrong when a wanted side is
    // walled twice or left bare by what stands and the new lines together, when a new line runs along anything else or along no side, and
    // when had is not the number of wanted sides that stood walled. A side stands walled where a standing stretch runs along it from corner
    // to corner (counted, so that two such walls on one side are seen) or else where the standing lines TOGETHER hold it (eHeld). A wanted
    // side handed in without its corners (a corridor's, named by its key alone) is read the first way only
    const eJudge = (g, want, map, res) => { const st = new Map(), nw = new Map(); let bad = 0, had = 0;
        map.filter(eIsWall).forEach(w => eUnits(g, w).keys.forEach(k => st.set(k, (st.get(k) || 0) + 1)));
        res.lines.forEach(L => { const u = eUnits(g, L); bad += u.odd; u.keys.forEach(k => nw.set(k, (nw.get(k) || 0) + 1)); });
        let segs = null; want.forEach((v, k) => { const s = st.get(k) || (v && v.a && v.b && eHeld(v, segs || (segs = eSegs(map))) ? 1 : 0); if (s) had++; if (s + (nw.get(k) || 0) !== 1) bad++; });
        nw.forEach((n, k) => { if (!want.has(k)) bad++; });
        return { bad: bad + (res.had === had ? 0 : 1), had, laid: [...nw.values()].reduce((a, b) => a + b, 0) }; };
    // a line's geometry as a list, a level and an upright line's, a box and a hexagon on its cell: what the checks below compare and lay
    const eL = r => r.lines.map(L => [L.x, L.y, L.w, L.h, L.pts]), eH = (x, y, len) => [x, y, len, 10, [[0, 0], [len, 0]]], eV = (x, y, len) => [x, y, 10, len, [[0, 0], [0, len]]], eRect = (x, y, w, h) => ({ type: 'rect', x, y, w, h }), eHexOf = c => Object.assign({ type: 'hexagon' }, B.hexCellBox(hx, c));
    // the lattice sides that meet a corner of the outline (the first corner of the outer side handed in) and are no outer sides themselves: where a wall only touches the outline
    const eTouch = (g, outer, side) => { const cand = []; [side.in, side.out].forEach(c => eSides(g, c).forEach(sd => { if (!outer.has(eKey(sd.a, sd.b)) && [sd.a, sd.b].some(p => Math.hypot(p[0] - side.a[0], p[1] - side.a[1]) < 0.1)) cand.push(sd); })); return cand; };
    return { SQD: SQD, EHD: EHD, eKey: eKey, eSides: eSides, eCell: eCell, eNb: eNb, eDirs: eDirs, eOuter: eOuter, eOn: eOn, eUnits: eUnits, eIsWall: eIsWall, eSegs: eSegs, eHeld: eHeld, eJudge: eJudge, eL: eL, eH: eH, eV: eV, eRect: eRect, eHexOf: eHexOf, eTouch: eTouch };
}
// the pieces and marks of fold B5 (a secret door) that buildcheck.js's secret door blocks and buildtoolcheck.js's Build checks of a
// secret door both read (the review of next area 1, 2026-11-18), made with buildcore: a piece's keys in sorted order and alike, a piece
// less one key or its name, a door block of a material, the Secret tick with a look, the Wall's color, where Build would lay again over
// a door, and the three keys of the secret and the three of Match a wall
const sortKeys = o => { const r = {}; Object.keys(o).sort().forEach(k => { r[k] = o[k]; }); return r; };
function b5Kit(B) {
    const b5Same = (a, b) => j(sortKeys(a)) === j(sortKeys(b));
    const b5Off = (o, k) => { const r = Object.assign({}, o); delete r[k]; return r; }, b5Less = w => b5Off(w, 'name'), b5Nameless = s => !!s && !('name' in s);   // a wall less its name: what the players hold of a secret door has no name key at all (the second review of fold B5)
    const b5Blk = (m, extra) => Object.assign({ id: 'D', type: 'rect', x: 350, y: 150, w: 50, h: 50, z: 10 }, B.pieceProps(m), extra || {});
    const b5Tick = { secret: true, seenColor: '#112233', seenTexture: 'stone' }, b5WallCol = B.MATERIALS.wall.color;
    const b5At = (extra, t) => B.seatedAt([Object.assign({ type: t || 'rect', x: 0, y: 0, w: 50, h: 50 }, B.pieceProps('door'), extra)], { type: t || 'rect', x: 0, y: 0, w: 50, h: 50 });
    const b5Three = ['secret', 'seenColor', 'seenTexture'];
    const mwThree = ['seenWidth', 'seenOpacity', 'seenTip'], mwSix = b5Three.concat(mwThree), mwSeen = { seenWidth: 9, seenOpacity: 0.4, seenTip: 'round' }, mwClean = s => mwSix.every(k => !(k in s));
    return { b5Same, b5Off, b5Less, b5Nameless, b5Blk, b5Tick, b5WallCol, b5At, b5Three, mwThree, mwSix, mwSeen, mwClean };
}
module.exports = { NL, url, read, j, winRec, escFirst, ESC_WANT, ESC_FIRST, escSaid, ESC_WORDS, cut, lcg, cutM, partOf, HOSTILE, wallOracle, sortKeys, b5Kit };

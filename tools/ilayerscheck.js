// Interaction layers (1.6.2, backlog 43): ilayers.js run for real, its core sliced by its [ilayerscheck:*] markers and the whole module on a page
// of plain objects with a storage of the suite's own; the board's marks and picks, the styles, the page, Help and both release notes pinned.
// Plain Node, no dependencies, exits 1 on any failure.
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0, summed = false;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok        ' + name); } else { fail++; console.log('FAIL      ' + name + (detail !== undefined ? ' -> ' + detail : '')); } }
process.on('exit', () => { if (!summed) { console.log('FAIL      ilayerscheck: an asynchronous check never finished'); process.exitCode = 1; } });
const root = path.join(__dirname, '..', 'system', 'app'), read = f => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n');
const J = JSON.stringify;
const src = read('scripts/ilayers.js');
const cut = (name) => { const a = src.indexOf('// [ilayerscheck:' + name + '-start]'), z = src.indexOf('// [ilayerscheck:' + name + '-end]'); if (a < 0 || z < a) throw new Error('slice ' + name); return src.slice(a, z); };
const C = new Function(cut('core') + '\nreturn { KINDS, MAIN_IDS, kindsOf, cleanState, judge, playersView, isPlayersView, rowOf };')();
const FC = { isDoor: w => !!w && (w.blocksSight === true || w.barrier === true) && w.sightType === 'door', isPortal: (w, m) => !!w && (!!w.targetMapId || (!!w.nodeId && !!m && (m.rooms || []).some(r => r.id === w.nodeId && r.targetMapId))) };

/* ---- the core ---- */
{
    const map = { rooms: [{ id: 'r1', targetMapId: 'm2' }, { id: 'r2' }] };
    const k = w => C.kindsOf(w, map, FC).join(',');
    const r = [k({ type: 'trigger' }), k({ type: 'trigger', hidden: true }), k({ blocksSight: true, sightType: 'door' }), k({ targetMapId: 'm9' }), k({ nodeId: 'r1' }), k({ nodeId: 'r2' }),
        k({ blocksSight: true }), k({ barrier: true }), k({ gmNoteFor: 'p1' }), k({ type: 'light' }), k({ type: 'rect', roomArea: true, hidden: true, nodeId: 'r2' }), k({ isChar: true, hidden: true, blocksSight: true }),
        k({ waiting: true, gmNoteFor: 'x' }), k({ type: 'rect' }), k(null), k('x'), C.kindsOf({ targetMapId: 'm' }, map, null).join(','),
        k({ type: 'image' }), k({ type: 'text', hidden: true }), k({ type: 'path' }), k({ type: 'path', blocksSight: true }), k({ type: 'rect', fill: true }), k({ type: 'hexagon' }), k({ type: 'image', nodeId: 'r1' }), k({ type: 'what' }), k({ type: 'image', box: 'c_bxabcd1234' }), k({ type: 'rect', box: 'c_bxabcd1234', hidden: true })];
    check('the kinds a piece belongs to (ilayers.js core, run for real): a trigger zone, a door or a portal (its own or its room\'s), a wall or a barrier that is no door, a GM note card, a light, a room area, a hidden piece; one piece in several; a token a character, hidden or not; with no fog core no portal or door; and under Show more (the owner, 2026-11-12: "everything should be listed") a piece in none of those is a picture, a text box, a drawing, a painted cell or a shape, never a wall drawn with the pen nor a picture that is a way to another map, and a kind the app does not know none',
        J(r) === J(['trigger', 'trigger,hidden', 'portal', 'portal', 'portal', '', 'wall', 'wall', 'note', 'light', 'area,hidden', 'token,hidden', 'token', 'shape', '', '', '', 'image', 'text,hidden', 'path', 'wall', 'fill', 'shape', 'portal', '', 'box', 'box,hidden']), J(r));
    const st = C.cleanState({ wall: { s: false }, note: { s: true, p: false }, light: { s: true, p: true }, trigger: 'x', nope: { s: false }, __proto__: { s: false } });
    check('what this computer keeps (cleanState): a row that differs from shown and taking clicks, read as data; a kind out of sight takes no clicks; anything else none, in an object with no prototype',
        J(Object.assign({}, st)) === J({ wall: { s: false, p: false }, note: { s: true, p: false } }) && Object.getPrototypeOf(st) === null && J(Object.assign({}, C.cleanState(null))) === '{}' && J(Object.assign({}, C.cleanState([1]))) === '{}', J(st));
    const j = (w) => J(C.judge(w, map, FC, st));
    check('a piece on the GM\'s screen (judge): out of sight where any of its kinds is, taking no clicks where any is off or takes none; a piece in no kind as it is',
        j({ blocksSight: true }) === J({ off: true, through: true }) && j({ gmNoteFor: 'p' }) === J({ off: false, through: true }) && j({ type: 'light' }) === J({ off: false, through: false }) && j({ type: 'rect' }) === J({ off: false, through: false }) && j({ gmNoteFor: 'p', blocksSight: true }) === J({ off: true, through: true }));
    const p1 = C.playersView(st, null), p2 = C.playersView(p1.st, p1.prev);
    const q0 = C.cleanState({ wall: { s: false }, image: { s: false } }), q1 = C.playersView(q0, null), q2 = C.playersView(Object.assign(Object.create(null), q1.st, { text: { s: true, p: false } }), q1.prev);
    check('As players see it (playersView) puts away only the GM\'s own kinds: a kind under Show more stays as it was, and one changed meanwhile stays changed when the rest come back',
        J(C.MAIN_IDS) === J(['trigger', 'portal', 'wall', 'note', 'light', 'area', 'hidden']) && C.KINDS.some(x => x.k === 'box' && x.seen === true) && q1.st.image.s === false && q1.st.token === undefined && q1.st.trigger.s === false && J(Object.assign({}, q1.prev)) === J({ wall: { s: false, p: false } })
        && J(Object.assign({}, q2.st)) === J({ wall: { s: false, p: false }, image: { s: false, p: false }, text: { s: true, p: false } }) && q2.prev === null, J([q1, q2]));
    check('As players see it (playersView): every row out of sight, what was there kept; a second press puts it back exactly',
        C.isPlayersView(p1.st) && C.MAIN_IDS.every(k => p1.st[k].s === false) && J(Object.assign({}, p1.prev)) === J(Object.assign({}, st)) && !C.isPlayersView(p2.st) && J(Object.assign({}, p2.st)) === J(Object.assign({}, st)) && p2.prev === null
        && J(C.KINDS.map(x => x.name)) === J(['Trigger zones', 'Portals and doors', 'Walls and barriers', 'GM notes', 'Lights', 'Room areas', 'Hidden pieces', 'Containers', 'Characters', 'Pictures', 'Shapes', 'Drawings', 'Text boxes', 'Painted cells'])
        && J(C.KINDS.filter(x => x.more).map(x => x.k)) === J(['token', 'image', 'shape', 'path', 'text', 'fill']));
}

/* ---- the module on a page of plain objects ---- */
function mkEl(tag) {
    const cls = new Set();
    return { tagName: tag.toUpperCase(), children: [], attrs: {}, dataset: {}, listeners: {}, firstChild: null, _text: '',
        classList: { add: c => cls.add(c), remove: c => cls.delete(c), contains: c => cls.has(c), toggle: (c, on) => { if (on === undefined ? !cls.has(c) : on) cls.add(c); else cls.delete(c); } },
        get className() { return [...cls].join(' '); }, set className(v) { cls.clear(); String(v).split(/\s+/).filter(Boolean).forEach(c => cls.add(c)); },
        get textContent() { return this._text + this.children.map(k => k.textContent).join(''); }, set textContent(v) { this.children.length = 0; this._text = String(v); },
        appendChild(c) { this.children.push(c); this.firstChild = this.children[0]; return c; }, removeChild(c) { this.children.splice(this.children.indexOf(c), 1); this.firstChild = this.children[0] || null; return c; },
        setAttribute(k, v) { this.attrs[k] = String(v); }, addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); },
        querySelectorAll(sel) { const want = sel.replace(/^\./, ''), out = []; const walk = n => n.children.forEach(k => { if (k.classList.contains(want)) out.push(k); walk(k); }); walk(this); return out; } };
}
function world(o) {
    o = o || {};
    const store = Object.assign({}, o.store || {}), steps = [], renders = [];
    const ls = { getItem: k => Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
    const box = mkEl('div'), doc = { readyState: 'complete', getElementById: id => (id === 'iLayers' ? box : null), createElement: mkEl, addEventListener() {} };
    const map = { rooms: [], whiteboard: [] };
    const win = { wpFogCore: FC, wpNet: o.net || null, wpStream: !!o.stream, wpStepLog: (n, s, f) => steps.push(n + ' ' + s + ' ' + J(f)), appRender: () => renders.push(1) };
    const body = src.replace(/^import [^\n]*\n/gm, '').replace(/^export \{[^\n]*\};?[ \t]*$/m, '');
    const st = { selWbIds: [], selWbId: null };
    win.addEventListener = (t, f) => { (win.listeners = win.listeners || {})[t] = f; };
    new Function('window', 'document', 'localStorage', 'getActiveMap', 'state', body)(win, doc, ls, () => map, st);
    return { win, box, store, steps, renders, map, st, api: win.wpILayers };
}
{
    const W = world(), rows = W.box.children.filter(c => c.className === 'il-row');
    const head = W.box.children[0], wallRow = rows.find(r => r.dataset.kind === 'wall'), tickS = wallRow.children[1], tickP = wallRow.children[2];
    const first = [head.className, head.children.map(c => c.textContent), rows.map(r => r.children[0].textContent), tickS.checked, tickP.checked, tickS.attrs['aria-label']];
    tickS.checked = false; tickS.listeners.change[0](); const afterOff = [W.store.wp_iLayers, W.renders.length, W.steps.slice(-1)[0]];
    const wall2 = W.box.children.filter(c => c.className === 'il-row').find(r => r.dataset.kind === 'wall'); const disabled = wall2.children[2].disabled;
    const el = mkEl('div'); W.api.mark(el, { blocksSight: true }, W.map); const m1 = [el.classList.contains('il-off'), el.classList.contains('il-through')];
    const el2 = mkEl('div'); W.api.mark(el2, { type: 'rect' }, W.map); const m2 = [el2.className, el2._il];
    const thr = [W.api.through({ blocksSight: true }), W.api.through({ type: 'rect' })];
    W.api.set('wall', 's', true); W.api.mark(el, { blocksSight: true }, W.map); const m3 = [el.className, W.store.wp_iLayers];
    W.api.set('note', 'p', false); const m4 = W.store.wp_iLayers;
    const pb = () => W.box.children.find(c => c.className && c.className.indexOf('il-players') >= 0);
    pb().listeners.click[0](); const pv = [pb().textContent, pb().className, J(JSON.parse(W.store.wp_iLayersPrev))];
    pb().listeners.click[0](); const back = [pb().textContent, W.store.wp_iLayers, W.store.wp_iLayersPrev];
    check('the Layers window\'s part (ilayers.js, run for real): a heading and a row a kind with its name as text and two ticks, Shown and Clicks, each named for a screen reader; Shown unticked keeps the row out of sight and its Clicks off and unusable, stored on this computer, the board drawn again and the step logged; the board marks a piece off and through, a piece in no kind never touched; shown again takes clicks again; As players see it puts every row away and a second press puts back what was there',
        J(first) === J(['il-head', ['Show on my map', 'Shown', 'Clicks'], ['Trigger zones', 'Portals and doors', 'Walls and barriers', 'GM notes', 'Lights', 'Room areas', 'Hidden pieces', 'Containers'], true, true, 'Shown on my map: Walls and barriers'])
        && afterOff[0] === J({ wall: { s: false, p: false } }) && afterOff[1] === 1 && afterOff[2] === 'ilayers v1 set {"kind":"wall","s":false,"p":false}' && disabled === true
        && J(m1) === J([true, true]) && J(m2) === J(['', false]) && J(thr) === J([true, false]) && m3[0] === '' && m3[1] === undefined && m4 === J({ note: { s: true, p: false } })
        && pv[0] === 'Back to what I had' && pv[1] === 'tool ghost il-players on' && pv[2] === J({ note: { s: true, p: false } }) && back[0] === 'As players see it' && back[1] === J({ note: { s: true, p: false } }) && back[2] === undefined,
        J([first, afterOff, disabled, m1, m2, thr, m3, m4, pv, back]));
    {   // Show more: a fold after the GM's own kinds, its rows inside, shut until opened and kept so on this computer, open while a row of it is put away
        const V = world(), fold = () => V.box.children.find(c => c.className && c.className.indexOf('il-more') >= 0 && c.tagName === 'BUTTON'), body = () => V.box.children.find(c => c.className === 'il-more-body');
        const at = V.box.children.indexOf(fold()), names = body().children.map(r => r.children[0].textContent), shut = [fold().textContent, fold().attrs['aria-expanded'], fold().attrs['aria-controls'], body().id, !!body().hidden];
        fold().listeners.click[0](); const open = [fold().textContent, fold().attrs['aria-expanded'], !!body().hidden, V.store.wp_iLayersMore];
        fold().listeners.click[0](); const again = [!!body().hidden, V.store.wp_iLayersMore];
        const pic = body().children.find(r => r.dataset.kind === 'image'); pic.children[1].checked = false; pic.children[1].listeners.change[0]();
        const kept = [!!body().hidden, fold().attrs['aria-expanded'], V.store.wp_iLayers];
        const el = mkEl('div'); V.api.mark(el, { type: 'image', id: 'p' }, V.map); const el2 = mkEl('div'); V.api.mark(el2, { type: 'image', isChar: true }, V.map);
        const pb = V.box.children.find(c => c.className && c.className.indexOf('il-players') >= 0); pb.listeners.click[0]();
        check('Show more (the owner, 2026-11-12, run for real): a fold right after the GM\'s own kinds with the six other kinds inside, shut at first, opened and shut by its press and kept on this computer, open while one of its rows is put away; a picture unticked goes out of sight and a character token does not; As players see it leaves those rows alone',
            at === 9 && J(names) === J(['Characters', 'Pictures', 'Shapes', 'Drawings', 'Text boxes', 'Painted cells']) && J(shut) === J(['Show more', 'false', 'iLayersMore', 'iLayersMore', true])
            && J(open) === J(['Show less', 'true', false, '1']) && J(again) === J([true, undefined]) && J(kept) === J([false, 'true', J({ image: { s: false, p: false } })])
            && el.classList.contains('il-off') && !el2.classList.contains('il-off') && JSON.parse(V.store.wp_iLayers).image.s === false && JSON.parse(V.store.wp_iLayers).trigger.s === false,
            J([at, names, shut, open, again, kept]));
    }
    {   // the review: a piece put out of sight leaves the selection; another window's change is heard
        const Q = world(); Q.map.whiteboard = [{ id: 'w1', blocksSight: true }, { id: 'p1', type: 'rect' }, { id: 'n1', gmNoteFor: 'x' }];
        Q.st.selWbIds = ['w1', 'p1', 'n1']; Q.st.selWbId = 'n1';
        Q.api.set('wall', 's', false); const s1 = [J(Q.st.selWbIds), Q.st.selWbId];
        Q.api.set('note', 'p', false); const s2 = [J(Q.st.selWbIds), Q.st.selWbId];
        Q.api.players(); const s3 = [J(Q.st.selWbIds), Q.st.selWbId, Q.api.offNow({ type: 'rect' }), Q.api.offNow({ gmNoteFor: 'y' })];
        Q.store.wp_iLayers = J({ trigger: { s: false } }); Q.win.listeners.storage({ key: 'wp_iLayers' }); const s4 = [Q.api.offNow({ type: 'trigger' }), Q.api.offNow({ gmNoteFor: 'y' })];
        check('the review: a piece put out of sight leaves the selection, so Delete and the arrow keys never act on what the GM cannot see; a piece that only takes no clicks stays selected; another window of this computer is heard',
            J(s1) === J([J(['p1', 'n1']), 'n1']) && J(s2) === J([J(['p1', 'n1']), 'n1']) && J(s3) === J([J(['p1']), 'p1', false, true]) && J(s4) === J([true, false]), J([s1, s2, s3, s4]));
        const ix2 = read('scripts/inspector.js'), fg = read('scripts/fog.js');
        check('the review (source): the Layers list picks no piece out of sight and says why; fog\'s Whole piece passes over a kind that takes no clicks; the focus goes back to the tick or button pressed',
            ix2.includes("if (window.wpILayers && window.wpILayers.offNow && window.wpILayers.offNow(target)) { toast('That piece is out of sight on your screen. Tick its kind under Show on my map to pick it.'); return; }")
            && fg.includes("if (typeof window !== 'undefined' && window.wpILayers && window.wpILayers.through(w)) continue;") && src.includes("set(x.k, c[0], t.checked); refocus('.il-row[data-kind=\"' + x.k + '\"] .il-' + c[0]);") && src.includes("players(); refocus('.il-players');"));
    }
    const P = world({ net: { active: true, role: 'client' }, store: { wp_iLayers: J({ wall: { s: false } }) } }), S = world({ stream: true, store: { wp_iLayers: J({ wall: { s: false } }) } }), F = world({ net: { foreign: true }, store: { wp_iLayers: J({ wall: { s: false } }) } });
    const pe = mkEl('div'), se = mkEl('div'), fe = mkEl('div'); P.api.mark(pe, { blocksSight: true }, P.map); S.api.mark(se, { blocksSight: true }, S.map); F.api.mark(fe, { blocksSight: true }, F.map);
    check('nothing changes on a player\'s app, at someone else\'s table or in the stream window, whatever this computer keeps',
        pe.className === '' && se.className === '' && fe.className === '' && !P.api.through({ blocksSight: true }) && !S.api.through({ blocksSight: true }));
}

/* ---- the board, the page, the words ---- */
{
    const wb = read('scripts/whiteboard.js'), dm = read('scripts/datamap.js'), css = read('style.css'), ix = read('index.html');
    const TH = "(typeof window !== 'undefined' && window.wpILayers && window.wpILayers.through(c))";
    check('the board asks it (source): every piece marked at every draw; a wall line picked by its stroke, a locked piece handing its press on, a press handed to a token and a marquee pass over a piece that takes no clicks; the styles put a piece out of sight keeping its place and let clicks through it and its parts',
        wb.includes("          if (window.wpILayers) window.wpILayers.mark(el, item, activeMap);") && dm.includes("if (!wallLine(c) || (c.locked && !pressed.locked) || " + TH + ") return;") /* backlog 231: a locked line is picked from a locked piece (moved on purpose) */ && dm.includes("if (!c.isChar || c.locked || c.id === item.id || " + TH + " || px < c.x")
        && dm.split("if (typeof window !== 'undefined' && window.wpILayers && window.wpILayers.through(cand)) return;").length === 3 && dm.includes("if (!onlyOwn && window.wpILayers && window.wpILayers.through(w)) return;")
        && css.includes('#whiteboard .wb-item.il-off, #whiteboard .wb-item.il-off * { visibility: hidden !important; }') && css.includes('#whiteboard .wb-item.il-through, #whiteboard .wb-item.il-through * { pointer-events: none !important; }')
        && ix.includes('<script type="module" src="scripts/ilayers.js"></script>') && ix.includes('<div id="iLayers" role="group" aria-label="Show on my map"></div>\n    <div id="layersList"></div>'));
    const wn = fs.readFileSync(path.join(__dirname, '..', 'WHATSNEW.txt'), 'utf8').replace(/\r\n/g, '\n'), wn2 = read('assets/whatsnew.txt');
    check('Help and both release notes say it',
        ix.includes('<b>Show on my map</b>') && ix.includes('<b>As players see it</b>') && [wn, wn2].every(t => t.includes('- The Layers window now starts with Show on my map: trigger zones, portals and')));
}
summed = true;
console.log('\n' + pass + ' passed, ' + fail + ' failed.');
if (fail) process.exitCode = 1;

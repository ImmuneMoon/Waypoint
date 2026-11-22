// objcheck — map objects (1.6.0; the owner, 2026-10-31, by prompt: "A row in Add", "The grade it says", and "with the system as long as the ones added
// to a campaign by the GM arent shown in other campaigns by default, but can be imported into them still"). objcore.js imported and run: an object as
// it is kept, against hostile input, what a placed one is, and taking one from another campaign. The system's set through the real cleanSystem, in
// the GM's view alone. The window's own judges (mapobjects.js, sliced by its [objcheck:win-*] markers) run on plain objects, and its wiring pinned:
// the page, the Add row, Escape, the wire, the import, Help, the guide and both release notes. No browser, no network.
'use strict';
require('./srcjoin').install();   // a split giant script reads joined, exactly as it was before the split (tools/srcjoin.js)
const fs = require('fs'), path = require('path'), url = require('url');
let pass = 0, fail = 0, summed = false;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok        ' + name); } else { fail++; console.log('FAIL      ' + name + (detail !== undefined ? '  -> ' + JSON.stringify(detail) : '')); } }
const J = JSON.stringify, NL = '\n', root = path.join(__dirname, '..');
const app = p => path.join(root, 'system', 'app', p), read = p => fs.readFileSync(app(p), 'utf8').replace(/\r\n/g, NL), readRoot = p => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, NL);
const slice = (s, t) => { const a = s.indexOf('// [' + t + '-start]'), b = s.indexOf('// [' + t + '-end]'); if (a < 0 || b < a) throw new Error('no slice ' + t); return s.slice(s.indexOf(NL, a) + 1, b); };
(async () => {
    const O = await import(url.pathToFileURL(app('scripts/objcore.js')).href), F = await import(url.pathToFileURL(app('scripts/formula.js')).href), S = await import(url.pathToFileURL(app('scripts/systemcore.js')).href), FC = await import(url.pathToFileURL(app('scripts/fogcore.js')).href);
    const PIC = '/saves/images/table.png';
    check('an object as it is kept: a name, a picture, a grade, what it stops and its size, a key that says nothing left out',
        J(O.cleanObj({ id: 'a', name: '  Table ', src: PIC, cover: 'threeq', stops: true, w: 2, h: 1, extra: 1 })) === J({ id: 'a', name: 'Table', src: PIC, cover: 'threeq', stops: true, w: 2 })
        && J(O.cleanObj({ id: 'a', name: 'Box', sight: true, stops: true })) === J({ id: 'a', name: 'Box', sight: true }) && J(O.cleanObj({ id: 'a', name: 'Box', color: '#ABCDEF' })) === J({ id: 'a', name: 'Box', color: '#abcdef' }));
    check('what is no object is none: no id, no name, an id with markup, a list; a picture only as one of the campaign\'s own, a grade only of the three',
        [null, 1, [], {}, { id: 'a' }, { name: 'x' }, { id: '<b>', name: 'x' }, { id: 'a', name: '   ' }].every(o => O.cleanObj(o) === null)
        && !O.cleanObj({ id: 'a', name: 'x', src: 'https://elsewhere.example/a.png' }).src && !O.cleanObj({ id: 'a', name: 'x', src: '/saves/images/../data.json' }).src && !O.cleanObj({ id: 'a', name: 'x', src: '/saves/images/journal/a.png' }).src
        && !O.cleanObj({ id: 'a', name: 'x', cover: 'all' }).cover && !O.cleanObj({ id: 'a', name: 'x', cover: 'constructor' }).cover && !O.cleanObj({ id: 'a', name: 'x', sight: 1 }).sight);
    const many = Array.from({ length: 2100 }, (_, i) => ({ id: 'o' + i, name: 'n' + i }));
    check('a list: each id once, 2000 at most (200 before 1.6.2), anything else empty', O.cleanObjects(many).length === O.OBJ_MAX && O.OBJ_MAX === 2000 && O.cleanObjects([{ id: 'a', name: 'x' }, { id: 'a', name: 'y' }]).length === 1 && J(O.cleanObjects('x')) === '[]' && J(O.cleanObjects(null)) === '[]');
    const tb = O.objProps({ id: 'a', name: 'Table', src: PIC, cover: 'half', w: 2 }, false), hx = O.objProps({ id: 'a', name: 'Crate', cover: 'threeq', stops: true }, true), wl = O.objProps({ id: 'a', name: 'Pillar', sight: true, cover: 'half' }, false), rug = O.objProps({ id: 'a', name: 'Rug' }, false);
    check('a placed object is an ordinary piece with its values: its grade by coverAs beside a see-over cover, stopping tokens by the barrier key, blocking sight as a wall, none at all where it says none, its size in the map\'s cells',
        tb.src === PIC && tb.w === 100 && tb.h === 50 && tb.cover === 'yes' && tb.coverAs === 'half' && tb.layer === 'back-mid' && hx.w === 60 && hx.h === 52 && hx.barrier === true && hx.coverAs === 'threeq' && !!hx.color
        && wl.blocksSight === true && wl.coverAs === undefined && rug.cover === 'no' && rug.coverAs === undefined && O.objType({ id: 'a', name: 'x', src: PIC }) === 'image' && O.objType({ id: 'a', name: 'x' }) === 'rect' && O.objProps(null) === null);
    const mine = [{ id: 'a', name: 'Table', src: PIC }], t1 = O.objTake(mine, { id: 'z', name: 'Crate', cover: 'half' }, 'n1'), t2 = O.objTake(mine, { id: 'z', name: 'Table', src: PIC }, 'n2');
    check('taken from another campaign: a copy under a new id, and the same object not twice; a new id no list holds', t1.took === true && t1.list.length === 2 && t1.list[1].id === 'n1' && t2.same === true && t2.list.length === 1
        && O.objId([[{ id: 'o_a' }]], 10) === 'o_a_1' && /^o_/.test(O.objId([], 1)) && O.objTake(many, { id: 'z', name: 'New' }, 'n3').full === true);
    {   // 1.6.2: an object's Protection, cleaned, placed as the piece's coverPro, said in its words
        const pp = O.objProps({ id: 'a', name: 'Crate', cover: 'half', pro: 4 }, false), pw = O.objProps({ id: 'a', name: 'Pillar', sight: true, pro: 6 }, false);
        check('1.6.2 an object\u2019s Protection: a whole number kept, placed as the piece\u2019s coverPro whether it blocks sight or not, said in its words, nothing else kept',
            O.cleanObj({ id: 'a', name: 'x', pro: 4.6 }).pro === 4 && !('pro' in O.cleanObj({ id: 'a', name: 'x', pro: '4' })) && !('pro' in O.cleanObj({ id: 'a', name: 'x', pro: 0 })) && pp.coverPro === 4 && pw.coverPro === 6 && !('coverPro' in O.objProps({ id: 'a', name: 'x', cover: 'half' }, false)) && O.objWords({ id: 'a', name: 'x', cover: 'half', pro: 4 }) === 'Half cover · Protection 4');
    }
    check('its words say what it does', O.objWords({ id: 'a', name: 'x', cover: 'half' }) === 'Half cover' && O.objWords({ id: 'a', name: 'x', sight: true }) === 'Blocks sight' && O.objWords({ id: 'a', name: 'x', stops: true, w: 2 }) === 'No cover · Stops tokens · 2 by 1 cells');
    // the grade on the line, by the ruler's own lines
    const grid = FC.squareGrid(50), a = FC.cellOf(25, 125, grid), b = FC.cellOf(325, 125, grid), on = FC.cellKey(FC.cellOf(175, 125, grid), grid), off = FC.cellKey(FC.cellOf(175, 325, grid), grid), set = k => { const s = Object.create(null); s[k] = 1; return s; };
    check('fogcore gradeOnLine: an object on the line gives its grade, the highest of those on it, one off the line none',
        FC.gradeOnLine(a, b, grid, { half: set(on) }) === 'half' && FC.gradeOnLine(a, b, grid, { half: set(on), total: set(on) }) === 'total' && FC.gradeOnLine(a, b, grid, { threeq: set(off) }) === '' && FC.gradeOnLine(a, b, grid, null) === '');
    check('fogcore coverAsOf: only on a piece that gives see-over cover, never a wall, a token, a hidden piece or one set to none; cleanCoverAs only the three words',
        FC.coverAsOf({ type: 'rect', cover: 'yes', coverAs: 'half' }) === 'half' && FC.coverAsOf({ type: 'rect', cover: 'yes', coverAs: 'half', blocksSight: true }) === '' && FC.coverAsOf({ type: 'rect', cover: 'no', coverAs: 'half' }) === '' && FC.coverAsOf({ type: 'rect', cover: 'yes', coverAs: 'half', isChar: true }) === '' && FC.coverAsOf({ type: 'rect', cover: 'yes', coverAs: 'half', hidden: true }) === ''
        && ['half', 'threeq', 'total'].every(g => FC.cleanCoverAs(g) === g) && ['', 'x', 'constructor', 1, null].every(g => FC.cleanCoverAs(g) === ''));
    // the system's set is the GM's
    const sys = S.cleanSystem({ name: 'T', objects: [{ id: 'a', name: 'Table', cover: 'half' }, { id: '<x>', name: 'no' }] }, { F, gm: true }), noSet = S.cleanSystem({ name: 'T' }, { F, gm: true }), keys = o => Object.keys(o).sort();
    const pl = S.cleanSystem({ name: 'T', objects: [{ id: 'a', name: 'Table' }] }, { F, gmView: false });
    check('a system\'s set is cleaned with the system and kept in the GM\'s view; a system with none holds no key', J(sys.objects) === J([{ id: 'a', name: 'Table', cover: 'half' }]) && noSet.objects === undefined && pl.objects === undefined, [sys.objects, pl.objects]);
    // the window's own judges
    const src = read('scripts/mapobjects.js'), W = new Function(slice(src, 'objcheck:win') + '\nreturn { objMay, listsOf, listPut, othersOf };')();
    check('who may: never at someone\'s table, in the stream window or where the app keeps nothing', W.objMay({}, {}) === true && W.objMay({ active: true, role: 'client' }, {}) === false && W.objMay({ stream: true }, {}) === false && W.objMay({}, { wpStream: true }) === false && W.objMay({}, { wpCanPersistLocal: () => false }) === false && W.objMay({}, { wpCanPersistLocal: () => true }) === true);
    const here = { id: 'c1', name: 'Here', system: { objects: [{ id: 's', name: 'Bench' }] }, objects: [{ id: 'm', name: 'Mine' }] }, there = { id: 'c2', name: 'There', objects: [{ id: 'x', name: 'Crate' }] }, none = { id: 'c3', name: 'Empty' };
    check('an object made in one campaign shows in no other until it is imported: each campaign reads its own two lists, and only the import names another\'s',
        J(W.listsOf(there, O).own.map(o => o.name)) === J(['Crate']) && !W.listsOf(there, O).sys.length && J(W.listsOf(here, O).own.map(o => o.name)) === J(['Mine']) && J(W.othersOf({ c1: here, c2: there, c3: none }, here, O).map(x => [x.camp, x.o.name])) === J([['There', 'Crate']]) && J(W.othersOf(null, here, O)) === '[]');
    const c = { id: 'c', system: { objects: [{ id: 's', name: 'B' }] }, objects: [{ id: 'm', name: 'M' }] }; W.listPut(c, 'sys', []); W.listPut(c, 'own', []);
    check('a list left empty leaves no key, and a campaign with no system holds no set', c.system.objects === undefined && c.objects === undefined && W.listPut({ id: 'x' }, 'sys', [{}]) === false);
    // 1.6.3 (the editor coverage audit, gap 5): an object with no picture is drawn in its own color, and the color is picked in its row's editor.
    // Eight objects in the shape a real system holds, each with a color only a file could set before. The first check is a GUARD, not the fold's
    // test: the cleaner kept a color before the fold too, and this holds it so (with the drawing in that color). The fold's test is the second: the editor
    // (mapobjects.js formInto, sliced by its [objcheck:form-*] markers and run for real on a page of plain objects) shows the swatch for an object
    // with no picture alone, set to its color or the plain land color, and a pick is committed through the cleaner as a color in lower case
    const LIVE = [{ id: 'chair', name: 'Chair', cover: 'half', color: '#c0392b' }, { id: 'table', name: 'Table', cover: 'half', stops: true, w: 2, color: '#8e5a2b' }, { id: 'supply_box', name: 'Supply box', cover: 'half', stops: true, color: '#e0b04a' }, { id: 'cargo_crate', name: 'Cargo crate', cover: 'threeq', stops: true, color: '#3f8f5f' },
        { id: 'fuel_drum', name: 'Fuel drum', cover: 'half', stops: true, color: '#2f6f9f' }, { id: 'low_wall', name: 'Low wall', cover: 'threeq', stops: true, w: 3, color: '#8a8f98' }, { id: 'pillar', name: 'Pillar', cover: 'total', sight: true, color: '#6a4c93' }, { id: 'wall_section', name: 'Wall section', cover: 'total', sight: true, w: 3, color: '#3a3f47' }];
    const sysL = S.cleanSystem({ name: 'T', objects: LIVE }, { F, gm: true });
    check('1.6.3 (a guard the color swatch rests on, which held before it) eight objects of a real system\'s shape, each in its own color, are kept whole by the cleaner and through the system, and each is placed in its color',
        J(O.cleanObjects(LIVE)) === J(LIVE) && J(sysL.objects) === J(LIVE) && LIVE.every(o => O.objProps(o, false).color === o.color) && O.objProps({ id: 'a', name: 'x' }, false).color === '#6b5b45');
    let oc = null, ocErr = '';
    try {
        const mkE = tag => ({ tag, kids: [], on: {}, dataset: {}, attrs: {}, value: '', appendChild(c) { this.kids.push(c); return c; }, addEventListener(t, f) { this.on[t] = f; }, setAttribute(k, v) { this.attrs[k] = v; }, set textContent(v) { this.kids = []; this._t = v; }, get textContent() { return this._t || ''; } });
        const el = (tag, cls, text) => { const e = mkE(tag); if (cls) e.className = cls; if (text !== undefined) e._t = String(text); return e; };
        const btn = (cls, text, tip) => { const b = el('button', cls, text); if (tip) b.dataset.tip = tip; return b; };
        const walk = (n, f, out = []) => { if (f(n)) out.push(n); (n.kids || []).forEach(k => walk(k, f, out)); return out; };
        const camp = { id: 'c', objects: JSON.parse(J(LIVE)).concat([{ id: 'pic', name: 'Picture crate', src: PIC }, { id: 'plain', name: 'Plain' }, { id: 'seat', name: 'Seat', furn: 'chair' }]) }, stored = [];
        const formInto = new Function('OC', 'el', 'btn', 'listsOf', 'campNow', 'store', 'draw', 'pickPic', 'toast', 'save', 'log', 'nowOf', 'showConfirm', 'window', 'OBJ_LAND', '"use strict";\n' + slice(src, 'objcheck:form') + '\nreturn formInto;')(
            () => O, el, btn, W.listsOf, () => camp, (kind, list) => { stored.push(list); camp.objects = list; return true; }, () => {}, () => {}, () => {}, () => {}, () => {}, o => o, () => {}, {}, (/var OBJ_LAND = '(#[0-9a-f]{6})';/.exec(src) || [])[1]);
        const swatchOf = id => { const box = mkE('div'); formInto(box, camp.objects.find(o => o.id === id), 'own', camp.objects); return walk(box, n => n.className === 'obj-color')[0] || null; };
        const chair = swatchOf('chair'), drawn = [chair.type, chair.value, chair.attrs['aria-label'], !!chair.dataset.tip];
        chair.value = '#12ABEF'; chair.on.change(); const picked = stored[stored.length - 1].find(o => o.id === 'chair');
        oc = { drawn, picked, plain: swatchOf('plain').value, pic: swatchOf('pic'), furn: swatchOf('seat'), others: J(stored[stored.length - 1].filter(o => o.id !== 'chair').slice(0, 7)) === J(LIVE.slice(1)) };
        // 1.6.3 (Fulllion's rulings of 2026-11-20): Protection follows Cover. With No cover and no Blocks sight its box stands greyed, its figure still
        // shown, and its tip says why; with a grade or Blocks sight it is live
        const proOf = o => { const box = mkE('div'); formInto(box, o, 'own', camp.objects); return walk(box, n => n.tag === 'input' && n.type === 'number')[0] || null; };
        const pNone = proOf({ id: 'p1', name: 'Rug', pro: 3 }), pHalf = proOf({ id: 'p2', name: 'Crate', cover: 'half', pro: 3 }), pSight = proOf({ id: 'p3', name: 'Pillar', sight: true, pro: 3 });
        oc.pro = [pNone.disabled, pNone.value, pNone.dataset.tip, pHalf.disabled, /stops nothing/.test(pHalf.dataset.tip), pSight.disabled];
    } catch (e) { ocErr = String(e && e.stack || e).slice(0, 600); }
    check('1.6.3 (the audit, gap 5) a map object\'s color is picked in its row\'s editor: a swatch of the app\'s own color input for an object with no picture alone, set to its color or else the plain land color objcore draws, a pick kept by the cleaner in lower case and nothing else changed; an object with a picture, or one that names a furnishing, has none',
        !!oc && J(oc.drawn) === J(['color', '#c0392b', 'Its color', true]) && J(oc.picked) === J({ id: 'chair', name: 'Chair', cover: 'half', color: '#12abef' }) && oc.plain === '#6b5b45' && oc.pic === null && oc.furn === null && oc.others === true
        && /var LAND_COLOR = '#6b5b45';/.test(read('scripts/objcore.js')) && src.includes("var OBJ_LAND = '#6b5b45';") && read('style.css').includes('.obj-form input.obj-color {'), ocErr || oc);
    check('1.6.3 (Fulllion\'s rulings of 2026-11-20) an object\'s Protection counts only beside a Cover or Blocks sight: with neither its box stands greyed with its figure and says to pick a Cover first, and its words never say Protection beside No cover; with a grade or Blocks sight the box is live (mapobjects.js formInto run for real, objcore objWords)',
        !!oc && J(oc.pro) === J([true, 3, 'Protection counts only for an object that gives cover or blocks sight. Pick a Cover first.', false, true, false])
        && O.objWords({ id: 'a', name: 'x', pro: 3 }) === 'No cover' && O.objWords({ id: 'a', name: 'x', sight: true, pro: 3 }) === 'Blocks sight · Protection 3' && O.objWords({ id: 'a', name: 'x', cover: 'half', pro: 4 }) === 'Half cover · Protection 4', ocErr || oc);
    {   // 1.6.3 (the review of the System editor and the Library window, finding 30): a field's change keeps the focus and the list's place, and figures are the app's counters
        let o30 = null, o30Err = '';
        try {
            const mkE = tag => ({ tag, kids: [], on: {}, dataset: {}, attrs: {}, value: '', appendChild(c) { this.kids.push(c); return c; }, addEventListener(t, f) { this.on[t] = f; }, setAttribute(k, v) { this.attrs[k] = v; }, set textContent(v) { this.kids = []; this._t = v; }, get textContent() { return this._t || ''; } });
            const el = (tag, cls, text) => { const e = mkE(tag); if (cls) e.className = cls; if (text !== undefined) e._t = String(text); return e; };
            const btn = (cls, text, tip) => { const b = el('button', cls, text); if (tip) b.dataset.tip = tip; return b; };
            const walk = (n, f, out = []) => { if (f(n)) out.push(n); (n.kids || []).forEach(k => walk(k, f, out)); return out; };
            const camp = { id: 'c', objects: [{ id: 'crate', name: 'Crate', cover: 'half', pro: 2, w: 2, color: '#112233' }, { id: 'rug', name: 'Rug' }] }, stored = [], steps = [];
            const step = o => { steps.push(o); const w = el('span', 'ui-step'); w.input = el('input'); Object.keys(o.data || {}).forEach(k => { w.input.dataset[k] = o.data[k]; }); w.kids.push(w.input); return w; };
            const mkForm = win => new Function('OC', 'el', 'btn', 'listsOf', 'campNow', 'store', 'draw', 'pickPic', 'toast', 'save', 'log', 'nowOf', 'showConfirm', 'window', 'OBJ_LAND', '"use strict";\n' + slice(src, 'objcheck:form') + '\nreturn formInto;')(
                () => O, el, btn, W.listsOf, () => camp, (kind, list) => { stored.push(list); camp.objects = list; return true; }, () => {}, () => {}, () => {}, () => {}, () => {}, o => o, () => {}, win, '#6b5b45');
            const box = el('div'); mkForm({ wpUi: { step } })(box, camp.objects[0], 'own', camp.objects);
            const keys = walk(box, n => !!(n.dataset && n.dataset.objk)).map(n => n.dataset.objk);
            const asked = steps.map(s => [s.data.objk, s.value, s.min, s.max, !!s.off]);
            steps[0].set(5); const pro = stored[stored.length - 1].find(x => x.id === 'crate').pro; steps[1].set(3); const wide = stored[stored.length - 1].find(x => x.id === 'crate').w;
            const rugBox = el('div'); steps.length = 0; mkForm({ wpUi: { step } })(rugBox, { id: 'rug', name: 'Rug' }, 'own', camp.objects); const rugOff = steps[0].off === true;
            const plainBox = el('div'); mkForm({})(plainBox, camp.objects[0], 'own', camp.objects); const plain = walk(plainBox, n => n.tag === 'input' && n.type === 'number').map(n => n.dataset.objk);
            // draw() asks once for a drawing a moment later, and drawNow makes it through keepPlace, keyed by data-objk
            const dA = src.indexOf('var _drawT = 0;'), dZ = src.indexOf('function drawList() {'), timers = [], kp = [];
            const D = new Function('setTimeout', 'keepPlace', '$', 'OC', '_hold', 'drawList', '"use strict";\n' + src.slice(dA, dZ) + '\nreturn { draw, drawNow, objKeyOf };')(f => { timers.push(f); return 1; }, (root, fn, idOf) => { kp.push([root, idOf]); fn(); }, id => (id === 'objList' ? { id } : null), () => O, null, () => kp.push('drawn'));
            D.draw(); D.draw(); const oneTimer = timers.length; timers[0](); D.draw();
            o30 = { keys, asked, pro, wide, rugOff, plain, oneTimer, timersAfter: timers.length, kp: kp.length, key: D.objKeyOf({ dataset: { objk: 'crate:name' } }), none: D.objKeyOf({ dataset: {} }) };
        } catch (e) { o30Err = String(e && e.stack || e).slice(0, 600); }
        check('1.6.3 (finding 30) the Map objects window keeps the focus and its place after a field’s change: each control says which object and value it is for, a change asks for one drawing a moment later, once the focus has landed, and the drawing is made through io.js keepPlace keyed by them; Protection and the two sizes are the app’s own counters, Protection greyed with no cover, a plain number box where the parts are not there (mapobjects.js formInto and draw, run for real)',
            !!o30 && ['crate:name', 'crate:cover', 'crate:pro', 'crate:color', 'crate:tick:Blocks sight', 'crate:tick:Stops tokens', 'crate:w', 'crate:h'].every(k => o30.keys.includes(k)) && J(o30.asked) === J([['crate:pro', 2, 0, 999, false], ['crate:w', 2, 1, 12, false], ['crate:h', 1, 1, 12, false]])
            && o30.pro === 5 && o30.wide === 3 && o30.rugOff === true && J(o30.plain) === J(['crate:pro', 'crate:w', 'crate:h']) && o30.oneTimer === 1 && o30.timersAfter === 2 && o30.kp === 2 && o30.key === 'k:crate:name' && o30.none === null
            && src.includes("import { save, toast, pressHold, keepPlace } from './io.js';") && src.includes('    keepPlace(box, drawList, objKeyOf);') && src.includes("    _win.edit = ''; _win.from = false; drawNow(); m.style.display = 'flex';"), o30Err || J(o30));
    }
    // the wiring
    const ix = read('index.html'), net = fs.readFileSync(app('scripts/net.js'), 'latin1'), cln = read('scripts/cleanup.js'), io = read('scripts/io.js'), esc = read('scripts/esckey.js'), fog = read('scripts/fog.js'), ins = read('scripts/inspector.js'), wb = read('scripts/whiteboard.js');
    check('the window: its row in Add the GM\'s alone, its box, its script, Escape; words as text alone, no markup written', /id="addObjectsBtn"/.test(ix) && /body\.net-client #addObjectsBtn/.test(read('style.css')) && /id="objModal"/.test(ix) && /src="scripts\/mapobjects\.js"/.test(ix) && esc.includes("['objModal', 'objClose']") && !/innerHTML|insertAdjacentHTML|outerHTML/.test(src) && wb.includes('window.wpArmPlacement = armPlacement;'));
    check('on the wire: the GM\'s own list never, a placed object\'s grade only as one of the three, on its way out and on a player\'s app; a file\'s cleaned; the load cleans the list', /delete camp\.objects;/.test(require('./checkkit').part('netfog.js')) && (net.match(/cleanCoverAs\(w\.coverAs\)/g) || []).length === 2 && /cleanCoverAs\(w\.coverAs\)/.test(cln) && /cleanObjects\(c\.objects\)/.test(io));
    check('the attack reads a grade apart from the see-over cells, a blast reads what it covers, and Properties says the grade and may change it', /C\.gradeOnLine\(a, b, grid, gr\)/.test(fog) && fog.includes("blast !== true && role === 'soft' && C.coverAsOf") && ins.includes("if (this.value === 'as') return;") && ins.includes('delete w.coverAs;'));
    check('a map object keeps its own size whatever New shape size says', src.includes('window.wpPlace.sized = true;') && wb.includes("type !== 'text' && !P.sized;"));
    check('a press survives a field\'s change: the window holds its redraw for a press under way, and what a press then does reads the object as it stands', src.includes("_hold = pressHold($('objList'), window);") && src.includes('if (_hold && _hold.busy()) { _hold.then(draw); return; }') && src.includes('place(nowOf(o));') && src.includes('listsOf(campNow(), C)[kind].map('));
    check('Build\'s options list them, and Select and Pan share one place: both buttons in the page once, the box its one class, the small arrow pressing the other', /id="buildObjRows"/.test(ix) && /id="buildObjBtn"/.test(ix) && src.includes("on('buildOptBtn', rows)") && /<div class="sel-swap" id="selSwap">/.test(ix) && ix.split('id="moveModeBtn"').length === 2 && ix.split('id="panModeBtn"').length === 2 && /id="selSwapBtn"/.test(ix) && read('style.css').includes('#selSwap:not(.on-pan) #panModeBtn, #selSwap.on-pan #moveModeBtn { display: none; }') && wb.includes("swp.classList.toggle('on-pan', activeId === 'panModeBtn')"));
    const help = read('index.html'), wn = readRoot('WHATSNEW.txt'), wn2 = read('assets/whatsnew.txt'), guide = readRoot('CAMPAIGN_INTEGRATION.md');
    check('Help, the guide and both release notes say it', /<b>Map objects:<\/b>/.test(help) && /Map objects/.test(wn) && /Map objects/.test(wn2) && /`objects`/.test(guide));
    console.log(pass + ' passed, ' + fail + ' failed.'); summed = true;
    process.exitCode = fail ? 1 : 0;
})().catch(e => { console.log('FAIL      ' + (e && e.stack || e)); summed = true; process.exitCode = 1; });
process.on('exit', () => { if (!summed) { console.log('FAIL      the suite never finished'); process.exitCode = 1; } });

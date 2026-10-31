// objcheck — map objects (1.6.0; the owner, 2026-10-31, by prompt: "A row in Add", "The grade it says", and "with the system as long as the ones added
// to a campaign by the GM arent shown in other campaigns by default, but can be imported into them still"). objcore.js imported and run: an object as
// it is kept, against hostile input, what a placed one is, and taking one from another campaign. The system's set through the real cleanSystem, in
// the GM's view alone. The window's own judges (mapobjects.js, sliced by its [objcheck:win-*] markers) run on plain objects, and its wiring pinned:
// the page, the Add row, Escape, the wire, the import, Help, the guide and both release notes. No browser, no network.
'use strict';
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
    const many = Array.from({ length: 300 }, (_, i) => ({ id: 'o' + i, name: 'n' + i }));
    check('a list: each id once, 200 at most, anything else empty', O.cleanObjects(many).length === O.OBJ_MAX && O.OBJ_MAX === 200 && O.cleanObjects([{ id: 'a', name: 'x' }, { id: 'a', name: 'y' }]).length === 1 && J(O.cleanObjects('x')) === '[]' && J(O.cleanObjects(null)) === '[]');
    const tb = O.objProps({ id: 'a', name: 'Table', src: PIC, cover: 'half', w: 2 }, false), hx = O.objProps({ id: 'a', name: 'Crate', cover: 'threeq', stops: true }, true), wl = O.objProps({ id: 'a', name: 'Pillar', sight: true, cover: 'half' }, false), rug = O.objProps({ id: 'a', name: 'Rug' }, false);
    check('a placed object is an ordinary piece with its values: its grade by coverAs beside a see-over cover, stopping tokens by the barrier key, blocking sight as a wall, none at all where it says none, its size in the map\'s cells',
        tb.src === PIC && tb.w === 100 && tb.h === 50 && tb.cover === 'yes' && tb.coverAs === 'half' && tb.layer === 'middle' && hx.w === 60 && hx.h === 52 && hx.barrier === true && hx.coverAs === 'threeq' && !!hx.color
        && wl.blocksSight === true && wl.coverAs === undefined && rug.cover === 'no' && rug.coverAs === undefined && O.objType({ id: 'a', name: 'x', src: PIC }) === 'image' && O.objType({ id: 'a', name: 'x' }) === 'rect' && O.objProps(null) === null);
    const mine = [{ id: 'a', name: 'Table', src: PIC }], t1 = O.objTake(mine, { id: 'z', name: 'Crate', cover: 'half' }, 'n1'), t2 = O.objTake(mine, { id: 'z', name: 'Table', src: PIC }, 'n2');
    check('taken from another campaign: a copy under a new id, and the same object not twice; a new id no list holds', t1.took === true && t1.list.length === 2 && t1.list[1].id === 'n1' && t2.same === true && t2.list.length === 1
        && O.objId([[{ id: 'o_a' }]], 10) === 'o_a_1' && /^o_/.test(O.objId([], 1)) && O.objTake(many, { id: 'z', name: 'New' }, 'n3').full === true);
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
    // the wiring
    const ix = read('index.html'), net = fs.readFileSync(app('scripts/net.js'), 'latin1'), cln = read('scripts/cleanup.js'), io = read('scripts/io.js'), esc = read('scripts/esckey.js'), fog = read('scripts/fog.js'), ins = read('scripts/inspector.js'), wb = read('scripts/whiteboard.js');
    check('the window: its row in Add the GM\'s alone, its box, its script, Escape; words as text alone, no markup written', /id="addObjectsBtn"/.test(ix) && /body\.net-client #addObjectsBtn/.test(read('style.css')) && /id="objModal"/.test(ix) && /src="scripts\/mapobjects\.js"/.test(ix) && esc.includes("['objModal', 'objClose']") && !/innerHTML|insertAdjacentHTML|outerHTML/.test(src) && wb.includes('window.wpArmPlacement = armPlacement;'));
    check('on the wire: the GM\'s own list never, a placed object\'s grade only as one of the three, on its way out and on a player\'s app; a file\'s cleaned; the load cleans the list', /delete camp\.objects;/.test(net) && (net.match(/cleanCoverAs\(w\.coverAs\)/g) || []).length === 2 && /cleanCoverAs\(w\.coverAs\)/.test(cln) && /cleanObjects\(c\.objects\)/.test(io));
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

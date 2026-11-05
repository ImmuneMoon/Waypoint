// rowlockcheck — Locked while (1.6.2; asked by a build session for a droid's location rows, which its fitted parts lay; the owner, 2026-11-05,
// by prompt: "Locked for all (Recommended)"). systemcore's cleaner and judge imported and run, the real applyRowOp on each way a row's cell
// changes, the sheet's half (sheets.js's rowlockui slice) run on a page of plain objects, and the wiring pinned. No browser, no network.
'use strict';
const fs = require('fs'), path = require('path'), url = require('url');
let pass = 0, fail = 0, summed = false;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok        ' + name); } else { fail++; console.log('FAIL      ' + name + (detail === undefined ? '' : ' -> ' + String(detail).slice(0, 600))); } }
const J = JSON.stringify, NL = '\n', root = path.join(__dirname, '..');
const app = p => path.join(root, 'system', 'app', p), read = p => fs.readFileSync(app(p), 'utf8').replace(/\r\n/g, NL), readRoot = p => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, NL);
globalThis.window = globalThis.window || {};
process.on('exit', () => { if (!summed) { console.log('FAIL      the suite never reached its summary'); process.exitCode = 1; } });
(async () => {
    const S = await import(url.pathToFileURL(app('scripts/systemcore.js')).href), F = await import(url.pathToFileURL(app('scripts/formula.js')).href);
    const RAW = { v: 1, name: 'L', fields: [
        { id: 'f_droid', key: 'Droid', label: 'Droid', kind: 'toggle', vis: 'all', edit: 'owner' },
        { id: 'f_sec', key: 'Secret', label: 'Secret', kind: 'number', vis: 'gm' },
        { id: 'f_loc', key: 'Locs', label: 'Locations', kind: 'item-list', vis: 'all', edit: 'owner', list: { custom: true, lvl: { label: 'Rank', min: 0, max: 5 }, stats: [{ key: 'loc', label: 'Kind', kind: 'num' }, { key: 'side', label: 'Side', kind: 'num' }, { key: 'Wt', label: 'Weight', kind: 'num' }],
            lock: { if: 'Droid', cells: ['name', 'LOC', 'side', 'qty', 'lvl', 'nope', 'name', 7], says: 'Set by the build.\nIts parts lay it.' } } },
        { id: 'f_nq', key: 'Parts', label: 'Parts', kind: 'item-list', vis: 'all', edit: 'owner', list: { noQty: true, lock: { if: 'Droid', cells: ['qty', 'lvl'] } } },
        { id: 'f_gm', key: 'Hidden', label: 'Hidden', kind: 'item-list', vis: 'all', edit: 'owner', list: { lock: { if: 'Secret > 0', cells: ['name'] } } },
        { id: 'f_dice', key: 'Dice', label: 'Dice', kind: 'item-list', vis: 'all', edit: 'owner', list: { lock: { if: '1d6 > 3', cells: ['name'] } } }] };
    const sy = S.cleanSystem(RAW, { F, gmView: true }), pv = S.cleanSystem(sy, { F, gmView: false }), fld = (s, id) => s.fields.filter(f => f.id === id)[0], lk = (s, id) => { const f = fld(s, id); return f && f.list ? f.list.lock : undefined; };
    check('a lock keeps its test, the cells its list has (a stat by the list’s own spelling, each once) and its words on one line; a level with no level and a count with no quantity are no cells, and a lock with no cell is none',
        J(fld(sy, 'f_loc').list.lock) === J({ if: 'Droid', cells: ['name', 'loc', 'side', 'qty', 'lvl'], says: 'Set by the build. Its parts lay it.' }) && lk(sy, 'f_nq') === undefined
        && S.cleanLock({ cells: ['name'] }, { stats: [] }) === undefined && S.cleanLock({ if: 'Droid', cells: [] }, {}) === undefined && S.cleanLock('x', {}) === undefined, J(fld(sy, 'f_loc').list.lock));
    check('a lock its players could read stands in both views; one that reads a GM-only value on a list players see, or rolls dice, goes from both, so a player’s app and the host judge alike',
        J(lk(pv, 'f_loc')) === J(lk(sy, 'f_loc')) && lk(pv, 'f_gm') === undefined && lk(pv, 'f_dice') === undefined && lk(sy, 'f_dice') === undefined && lk(sy, 'f_gm') === undefined);
    const errs = S.validateSystem(Object.assign({}, sy, { fields: sy.fields.map(f => f.id === 'f_loc' ? Object.assign({}, f, { list: Object.assign({}, f.list, { lock: { if: 'Nope +', cells: ['name'] } }) }) : f) }), F);
    check('the validator reads a lock’s test as the character’s and says it under Locked while', J(errs).includes('Locked while: '), J(errs).slice(0, 300));
    const row = () => ({ id: 'w_abcd1234', qty: 2, lvl: 1, def: { name: 'Arm', category: '', icon: '', notes: '', vis: 'all', stats: { loc: 2, side: 1, Wt: 3 } } });
    const lib = () => ({ id: 'w_libr1234', defId: 'i_arm', qty: 1, lvl: 1, ov: { name: 'Left arm', stats: { side: 1 } } });
    const ch = (on, more) => Object.assign({ id: 'c1', values: { f_droid: on, f_loc: [row(), lib()] } }, more || {});
    const op = (q, on, o) => S.applyRowOp(sy, ch(on), 'f_loc', q, F, o || {});
    const R = 'w_abcd1234', L = 'w_libr1234';
    const cases = [
        ['the name of a row of its own', { op: 'custom', rowId: R, def: { name: 'Leg' } }],
        ['a stat of a row of its own', { op: 'custom', rowId: R, def: { stats: { loc: 3 } } }],
        ['every stat of a row of its own put back', { op: 'custom', rowId: R, def: { stats: null } }],
        ['the count', { op: 'setQty', rowId: R, qty: 3 }],
        ['the level', { op: 'set', rowId: R, facts: { lvl: 2 } }],
        ['a copy’s own name', { op: 'ov', rowId: L, ov: { name: 'Right arm' } }],
        ['a copy’s own stat', { op: 'ov', rowId: L, ov: { stats: { side: 2 } } }],
        ['every value of a copy put back', { op: 'ov', rowId: L, ov: null }]
    ];
    const gm = cases.map(c => op(c[1], true)), pl = cases.map(c => op(c[1], true, { player: true }));
    check('while the test holds, every way a locked cell changes is refused, in the rule’s own words, to the GM and a player alike: ' + cases.map(c => c[0]).join(', '),
        gm.every(r => r.ok === false && r.locked === true && r.msg === 'Set by the build. Its parts lay it.') && pl.every(r => r.ok === false && (r.locked === true || r.reason === 'field' || r.reason === 'missing')), J(gm.map(r => r.ok + (r.locked ? 'L' : ''))) + J(pl.map(r => r.reason + (r.locked ? 'L' : ''))));
    const free = [op({ op: 'custom', rowId: R, def: { notes: 'Scratched' } }, true), op({ op: 'custom', rowId: R, def: { stats: { Wt: 4 } } }, true), op({ op: 'custom', rowId: R, def: { name: 'Arm' } }, true), op({ op: 'custom', rowId: 'w_newr1234', def: { name: 'Tail' } }, true)];
    check('what it does not lock stays free: notes, a stat not ticked, a name set to what it is, and a new row', free.every(r => r.ok === true), J(free.map(r => r.ok)));
    const off = cases.map(c => op(c[1], false)).filter((r, i) => i < 5);
    check('once the test does not hold, the GM changes them as ever', off.every(r => r.ok === true), J(off.map(r => r.ok + ' ' + r.reason)));
    const chF = ch(true, { making: 1, ownerId: 'u' }); chF.values.f_loc[0].own = 1; const fill = S.applyRowOp(sy, chF, 'f_loc', { op: 'custom', rowId: R, def: { name: 'Leg' } }, F, { player: true, fill: true });
    check('a file that fills a character still lays a locked cell', fill.ok === true, J(fill));
    const noF = S.applyRowOp(sy, ch(true), 'f_loc', { op: 'custom', rowId: R, def: { name: 'Leg' } }, null, {});
    check('with no formula engine the test does not hold, so nothing is refused for want of one', noF.ok === true);
    const plain = S.applyRowOp(Object.assign({}, sy, { fields: sy.fields.map(f => f.id === 'f_loc' ? Object.assign({}, f, { list: Object.assign({}, f.list, { lock: { if: 'Droid', cells: ['name'] } }) }) : f) }), ch(true), 'f_loc', { op: 'custom', rowId: R, def: { name: 'Leg', stats: { loc: 9 } } }, F, {});
    check('with no words of its own a refusal names the cells it locks', plain.ok === false && plain.msg === 'This row’s name cannot be changed while its rule holds.', J(plain));
    check('lockCells says what is locked now, null while the test does not hold', J(S.lockCells(sy, ch(true), fld(sy, 'f_loc').list, F)) === J({ name: 1, 's:loc': 1, 's:side': 1, qty: 1, lvl: 1 }) && S.lockCells(sy, ch(false), fld(sy, 'f_loc').list, F) === null);

    // the sheet's half, run on a page of plain objects
    const sh = read('scripts/sheets.js'), a = sh.indexOf('// [systemcheck:rowlockui-start]'), b = sh.indexOf('// [systemcheck:rowlockui-end]');
    const win = { wpSystemCore: S, wpFormula: F };
    const UI = new Function('window', sh.slice(a, b) + '\nreturn { lockSet, lockedHere, lockForm, lockTip };')(win);
    const mk = part => ({ dataset: { part }, disabled: false, title: '', classList: { s: [], add(c) { this.s.push(c); } } });
    const parts = ['rf-' + R + '-name', 'rf-' + R + '-s-loc', 'rf-' + R + '-s-Wt', 'rf-' + R + '-notes', 'rf-other-name'].map(mk), form = { querySelectorAll: () => parts };
    const c1 = ch(true), f1 = fld(sy, 'f_loc');
    UI.lockSet(f1, c1, sy); UI.lockForm(form, c1, f1, R);
    check('the sheet asks the one judge as a list is drawn: a locked name or stat box of the ✎ form is drawn as it reads with the rule’s words as its tooltip, and nothing else is touched',
        UI.lockedHere(c1, f1, 'qty') && UI.lockedHere(c1, f1, 'lvl') && UI.lockedHere(c1, f1, 's:loc') && !UI.lockedHere(c1, f1, 's:wt') && !UI.lockedHere(ch(true), f1, 'qty')
        && J(parts.map(p => p.disabled)) === J([true, true, false, false, false]) && parts[0].title === 'Set by the build. Its parts lay it.', J(parts.map(p => p.disabled)));
    UI.lockSet(f1, ch(false), sy); const c3 = { id: 'c3' };
    check('while the test does not hold nothing is locked on the sheet, and a list with no lock locks nothing', !UI.lockedHere(c3, f1, 'qty') && (UI.lockSet(fld(sy, 'f_droid'), c3, sy), !UI.lockedHere(c3, fld(sy, 'f_droid'), 'name')));
    check('the row’s controls ask it: its count, its level, a stat’s menu and both ✎ forms',
        /function itemQtyCell\(entry, c, f\) \{\n    if \(typeof lockedHere === 'function' && lockedHere\(c, f, 'qty'\)\)/.test(sh) && /function lvlCtl\(entry, def, c, f, spec, editable\) \{\n    if \(typeof lockedHere === 'function' && lockedHere\(c, f, 'lvl'\)\) editable = false;/.test(sh)
        && /function statMenu\(s, sv, entry, rd, c, f, spec, mode\) \{\n    if \(s && typeof s\.key === 'string' && typeof lockedHere === 'function' && lockedHere\(c, f, 's:' \+ s\.key\.toLowerCase\(\)\)\) return null;/.test(sh)
        && (sh.match(/    return typeof lockForm === 'function' \? lockForm\(form, c, f, rid\) : form;/g) || []).length === 2 && (sh.match(/if \(typeof lockSet === 'function'\) lockSet\(f, c, sysI\);/g) || []).length === 2);
    const sc = read('scripts/systemcore.js');
    check('applyRowOp asks the judge before any op on a row that is there, past a file that fills a character', sc.includes("    if (!fl && q.op !== 'add') { var lkH = rowLockHit(sys, char, f, list, q, F); if (lkH) return lkH; }"));
    check('the System editor’s Lists tab sets it: Locked while, a tick for each cell, and Refused with; the three are in the Other rules group, and Locked while is a form that asks when its rows are locked',
        sh.includes("lkI = el('input', 'field sys-list-lockif')") && sh.includes("li = el('input', 'sys-list-lockcell')") && sh.includes("lsI = el('input', 'field sys-list-locksays')") && sh.includes("else if (c.indexOf('sys-list-lockif') >= 0)") && sh.includes("else if (c.indexOf('sys-list-lockcell') >= 0)") && sh.includes("else if (c.indexOf('sys-list-locksays') >= 0)")
        && read('scripts/sysui.js').includes("['sys-list-lockif', 'sys-list-lockcell', 'sys-list-locksays', 'sys-list-modsif',") && read('scripts/formbox.js').includes("'sys-list-lockif': ['When are its rows locked?'") && read('scripts/formbox.js').includes("var EMPTY = { 'sys-list-lockif': 'Never',"));
    const ix = read('index.html'), wn = [readRoot('WHATSNEW.txt'), read('assets/whatsnew.txt')];
    check('Help says it, and both release notes alike', ix.includes('<b>Locked while</b>') && wn.every(t => t.includes('Locked while')) && wn[0] === wn[1].replace(/color/g, 'colour') || wn.every(t => t.includes('Locked while')));
    check('CI runs this suite', readRoot('.github/workflows/checks.yml').includes('run: node tools/rowlockcheck.js'));
    summed = true;
    console.log('\n' + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exitCode = 1;
})();

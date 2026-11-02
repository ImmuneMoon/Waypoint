/* Offline check of arranging a sheet by dragging (1.6.2, backlog 171 (b); the owner, by prompt: "In the System editor (Recommended)", "Sections and
   fields (Recommended)", "Side by side (Recommended)"). The pure half (arrangecore.js) is imported and run: what a drop means and what it does to a
   layout's sections, over seeded walks that hold every section and every field. The real systemcore cleans a section's `beside`, and the real
   buildSections, sliced by sheets.js's own lines, stands sections on one row. The page, the styles, Escape's word, Help, both release notes and the
   CI step are pinned. Pressing it is a live check.
   Usage: node tools/arrangecheck.js   (exit 1 on any failure) */
'use strict';
const path = require('path'), fs = require('fs'), url = require('url');
const NL = String.fromCharCode(10);
const root = path.join(__dirname, '..'), app = path.join(root, 'system', 'app');
const readU = f => fs.readFileSync(path.join(app, f), 'utf8').replace(/\r\n/g, NL);
const readRoot = f => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, NL);
const j = o => JSON.stringify(o);
let pass = 0, fail = 0, summed = false;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok        ' + name); } else { fail++; console.log('FAIL      ' + name + (detail !== undefined ? '  -> ' + String(typeof detail === 'string' ? detail : j(detail)).slice(0, 300) : '')); process.exitCode = 1; } }
const scriptUrl = f => url.pathToFileURL(path.join(app, 'scripts', f)).href;
process.on('exit', code => { if (!summed && !code) { console.log('FAIL      the asynchronous checks never finished'); process.exitCode = 1; } });
const S = (id, more) => Object.assign({ id, title: id, cols: 2, fields: [] }, more || {});
const order = secs => secs.map(s => s.id + (s.beside ? '+' : '')).join(' ');
const R = 1;

(async () => {
    const A = await import(scriptUrl('arrangecore.js'));
    const C = await import(scriptUrl('systemcore.js'));
    // ---- a row: moved over, moved beside, moved off ----
    let s = [S('a'), S('b'), S('c')];
    check('a section dropped on another\'s right edge stands beside it', A.moveSection(s, 'c', { right: 'a' }) && order(s) === 'a c+ b', order(s));
    check('dropped on its left edge it takes that section\'s place on the row, and that section stands beside it', A.moveSection(s, 'b', { left: 'a' }) && order(s) === 'b a+ c+', order(s));
    check('a row above takes it off the row, and it stands above the whole row', A.moveSection(s, 'c', { before: 'b' }) && order(s) === 'c b a+', order(s));
    s = [S('a'), S('b', { beside: true }), S('c', { beside: true }), S('d')];
    check('the first of a row taken away: the next leads what is left of the row', A.moveSection(s, 'a', { after: 'd' }) && order(s) === 'b c+ d a', order(s));
    s = [S('a'), S('b', { beside: true }), S('c', { beside: true }), S('d')];
    check('a row below a section on a row lands below the whole row', A.moveSection(s, 'd', { after: 'a' }) === false && order(s) === 'a b+ c+ d', order(s));
    s = [S('a'), S('b', { beside: true }), S('c', { beside: true }), S('d')];
    check('the middle of a row taken out: the row closes up', A.moveSection(s, 'b', { after: 'd' }) && order(s) === 'a c+ d b', order(s));
    s = [S('a'), S('b', { beside: true }), S('c', { beside: true })];
    check('one of a row dropped below its own first leaves the row, below all of it', A.moveSection(s, 'b', { after: 'a' }) && order(s) === 'a c+ b', order(s));
    s = [S('a'), S('b', { beside: true })];
    check('dropped on itself, above: the first of a row takes a row of its own', A.moveSection(s, 'a', { before: 'a' }) && order(s) === 'a b', order(s));
    s = [S('a'), S('b', { beside: true })];
    check('dropped on itself, below: the last of a row takes a row of its own', A.moveSection(s, 'b', { after: 'b' }) && order(s) === 'a b', order(s));
    s = [S('a'), S('b')];
    check('a drop that changes nothing says so, so that it is no step of Undo', A.moveSection(s, 'a', { before: 'b' }) === false && order(s) === 'a b', order(s));
    check('a section that is not there moves nothing', A.moveSection(s, 'z', { before: 'a' }) === false && A.moveSection(s, 'a', { before: 'z' }) === false && A.moveSection(null, 'a', {}) === false);
    // ---- tabs, above the tabs, sub-sections ----
    s = [S('a', { tab: 't1' }), S('b', { tab: 't1', beside: true }), S('c', { tab: 't2' })];
    const T = ['t1', 't2'];
    check('dropped on a tab it goes to the end of that tab and the row it left closes', A.moveSection(s, 'a', { tab: 't2' }, T) && order(s) === 'b c a' && s[2].tab === 't2', order(s));
    check('a tab that is not there takes nothing', A.moveSection(s, 'a', { tab: 'tx' }, T) === false);
    s = [S('a', { tab: 't1' }), S('b', { tab: 't2' })];
    check('dropped by a section of another tab it takes that tab', A.moveSection(s, 'a', { after: 'b' }, T) && s[1].id === 'a' && s[1].tab === 't2', j(s));
    s = [S('a', { pinned: true }), S('b', { tab: 't1' })];
    check('dropped by a section above the tabs it stands above the tabs too', A.moveSection(s, 'b', { after: 'a' }, T) && s[1].pinned === true && !s[1].tab, j(s));
    check('and dropped back on a tab it does not', A.moveSection(s, 'b', { tab: 't1' }, T) && !s[1].pinned, j(s));
    s = [S('a'), S('b', { tab: 't2' })];
    check('a row is judged within one tab: the first on the second tab joins nothing on the first', A.rowHead(s, 'b', T) === 'b');
    s = [S('a'), S('k', { parent: 'a', first: true }), S('m', { parent: 'a' }), S('b')];
    check('a sub-section dropped by a top-level section leaves its parent', A.moveSection(s, 'k', { after: 'b' }) && !s[3].parent && s[3].first === undefined, j(s));
    s = [S('a'), S('k', { parent: 'a', first: true }), S('b')];
    check('a section dropped by a sub-section becomes its sibling', A.moveSection(s, 'b', { before: 'k' }) && s.find(x => x.id === 'b').parent === 'a' && s.find(x => x.id === 'b').first === true, j(s));
    s = [S('a'), S('k', { parent: 'a' }), S('b'), S('m', { parent: 'b' })];
    check('a section that holds sub-sections never becomes one', A.moveSection(s, 'b', { before: 'k' }) && !s.find(x => x.id === 'b').parent, j(s));
    s = [S('a'), S('k', { parent: 'a' })];
    check('a section never lands beside its own sub-section', A.moveSection(s, 'a', { right: 'k' }) === false);
    // ---- fields ----
    let f = [S('a', { fields: [{ id: '1' }, { id: '2' }, { id: '3' }] }), S('b', { fields: [{ id: '4' }] }), S('e')];
    const fs2 = () => f.map(x => x.fields.map(p => p.id).join('')).join('|');
    check('a field moved later in its section', A.moveField(f, 'a', 0, 'a', 2) && fs2() === '213|4|', fs2());
    check('a field moved earlier in its section', A.moveField(f, 'a', 2, 'a', 0) && fs2() === '321|4|', fs2());
    check('a field moved to where it stands moves nothing', A.moveField(f, 'a', 1, 'a', 1) === false && A.moveField(f, 'a', 1, 'a', 2) === false);
    check('a field moved into another section, before a place', A.moveField(f, 'a', 0, 'b', 0) && fs2() === '21|34|', fs2());
    check('a field dropped past the end stands last, and into a section with none', A.moveField(f, 'a', 0, 'e', 9) && fs2() === '1|34|2', fs2());
    check('a place that is not there moves nothing', A.moveField(f, 'a', 7, 'b', 0) === false && A.moveField(f, 'z', 0, 'b', 0) === false);
    check('a field off the sheet added', A.addField(f, 'e', { id: '9' }, 0) && fs2() === '1|34|92', fs2());
    // ---- where a pointer is ----
    const B = [{ id: 'a', l: 0, t: 0, r: 200, b: 100 }, { id: 'b', l: 0, t: 110, r: 200, b: 200 }];
    check('over a section\'s left edge', j(A.dropSection(B, 5, 50, 'x')) === '{"left":"a"}');
    check('over a section\'s right edge', j(A.dropSection(B, 195, 50, 'x')) === '{"right":"a"}');
    check('over its upper half', j(A.dropSection(B, 100, 20, 'x')) === '{"before":"a"}');
    check('over its lower half', j(A.dropSection(B, 100, 80, 'x')) === '{"after":"a"}');
    check('the gap between two goes to the nearer', j(A.dropSection(B, 100, 103, 'x')) === '{"after":"a"}' && j(A.dropSection(B, 100, 108, 'x')) === '{"before":"b"}');
    check('past the last', j(A.dropSection(B, 100, 400, 'x')) === '{"after":"b"}');
    check('its own box is no target', j(A.dropSection(B, 100, 50, 'a')).includes('"b"'));
    check('nothing to drop by, no target', A.dropSection([{ id: 'a', l: 0, t: 0, r: 9, b: 9 }], 1, 1, 'a') === null);
    const narrow = [{ id: 'a', l: 0, t: 0, r: 100, b: 100 }];
    check('a narrow section keeps a middle: its edges are a share of its width', j(A.dropSection(narrow, 30, 40, 'x')) === '{"before":"a"}');
    const cells = [{ pi: 0, l: 0, t: 0, r: 100, b: 40 }, { pi: 1, l: 110, t: 0, r: 210, b: 40 }, { pi: 2, l: 0, t: 50, r: 210, b: 90 }];
    check('a field before a cell, by its left half', A.dropField(cells, 10, 20, 3) === 0);
    check('past that half, the next', A.dropField(cells, 90, 20, 3) === 1);
    check('the next row', A.dropField(cells, 10, 48, 3) === 2);
    check('past the last', A.dropField(cells, 200, 80, 3) === 3 && A.dropField(cells, 10, 200, 3) === 3 && A.dropField([], 1, 1, 0) === 0);
    check('a section cleaned by the system keeps the draft\'s places', j(A.placeMap([{ id: 'a' }, { id: 'gone' }, { id: 'b' }, { kind: 'divider' }], [{ id: 'a' }, { id: 'b' }, { kind: 'divider' }])) === '[0,2,3]');
    check('a list placed twice keeps both places', j(A.placeMap([{ id: 'l', cats: ['x'] }, { id: 'l', cats: ['y'] }], [{ id: 'l' }, { id: 'l' }])) === '[0,1]');
    check('a placement the draft does not hold answers none', j(A.placeMap([], [{ id: 'a' }])) === '[-1]');
    // ---- the keys ----
    s = [S('a'), S('b'), S('c')];
    check('Alt and Right joins the row before', j(A.sectionKey(s, 'b', 'ArrowRight')) === '{"right":"a"}');
    check('the first has no row before', A.sectionKey(s, 'a', 'ArrowRight') === null && A.sectionKey(s, 'a', 'ArrowLeft') === null && A.sectionKey(s, 'a', 'ArrowUp') === null);
    check('Alt and Down goes below the next row', j(A.sectionKey(s, 'a', 'ArrowDown')) === '{"after":"b"}' && A.sectionKey(s, 'c', 'ArrowDown') === null);
    s = [S('a'), S('b', { beside: true })];
    check('on a row, Alt and Right changes places, Alt and Left the other way', j(A.sectionKey(s, 'a', 'ArrowRight')) === '{"right":"b"}' && j(A.sectionKey(s, 'b', 'ArrowLeft')) === '{"left":"a"}');
    check('on a row, Alt and Up or Down takes it off the row', j(A.sectionKey(s, 'b', 'ArrowDown')) === '{"after":"b"}' && j(A.sectionKey(s, 'b', 'ArrowUp')) === '{"before":"a"}' && j(A.sectionKey(s, 'a', 'ArrowUp')) === '{"before":"a"}');
    s = [S('a'), S('b', { beside: true })]; A.moveSection(s, 'a', { before: 'a' });
    check('and it does', order(s) === 'a b', order(s));
    // ---- a seeded walk: nothing lost, nothing doubled, every row a true row ----
    let seed = 90121; const rnd = n => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
    let lost = 0, bad = 0, steps = 0;
    for (let run = 0; run < 400; run++) {
        const tabs = run % 3 ? ['t1', 't2'] : [], n = 3 + rnd(6), list = [];
        for (let i = 0; i < n; i++) { const o = { id: 's' + i, cols: 2, fields: [{ id: 'f' + i }] }; if (tabs.length && rnd(2)) o.tab = tabs[rnd(2)]; if (i && rnd(3) === 0) o.beside = true; if (i && rnd(5) === 0) o.parent = 's' + rnd(i); list.push(o); }
        for (let k = 0; k < 14; k++) {
            const pick = list[rnd(list.length)], other = list[rnd(list.length)], kind = ['before', 'after', 'left', 'right'][rnd(4)];
            const w = {}; w[kind] = other.id; if (tabs.length && rnd(6) === 0) { delete w[kind]; w.tab = tabs[rnd(2)]; }
            A.moveSection(list, pick.id, w, tabs); steps++;
            if (list.length !== n || new Set(list.map(x => x.id)).size !== n) lost++;
            list.forEach(x => { if (x.first && !x.parent) bad++; if (x.parent === x.id) bad++; });
        }
    }
    check('2,800 seeded drops: no section lost or doubled, no sub-section\'s mark left on a section that is none', lost === 0 && bad === 0 && steps === 5600, { lost, bad, steps });
    // ---- the cleaner, and the sheet drawing a row ----
    const ctx = { fieldIds: { x: 'number' }, rollIds: {}, tabIds: {}, groupIds: {} };
    const cs = secs => { const sys = C.cleanSystem({ v: 1, fields: [{ id: 'x', key: 'X', label: 'X', kind: 'number' }], rolls: [], sheet: { sections: secs } }, { F: await0.F, gmView: true }); return sys.sheet.sections; };
    const await0 = {}; await0.F = await import(scriptUrl('formula.js'));
    const one = cs([{ id: 's_a', title: 'A', cols: 1, fields: [{ id: 'x', w: 1 }] }, { id: 's_b', title: 'B', cols: 1, fields: [], beside: true }, { id: 's_c', title: 'C', cols: 1, fields: [], beside: 'yes' }, { id: 's_d', title: 'D', cols: 1, fields: [], beside: 1 }]);
    check('the cleaner keeps beside as true alone, in the GM\'s view', one[1].beside === true && !('beside' in one[0]) && !('beside' in one[2]) && !('beside' in one[3]), j(one));
    const pv = C.cleanSystem({ v: 1, fields: [{ id: 'x', key: 'X', label: 'X', kind: 'number' }], rolls: [], sheet: { sections: [{ id: 's_a', cols: 1, fields: [] }, { id: 's_b', cols: 1, fields: [], beside: true }] } }, { F: await0.F, gmView: false });
    check('and in the players\' view', pv.sheet.sections[1].beside === true, j(pv.sheet.sections));
    check('cleaned twice alike', j(C.cleanSystem(pv, { F: await0.F, gmView: false }).sheet.sections) === j(pv.sheet.sections));
    // ---- a section's row, drawn: the real sideAdd on a page of plain objects ----
    const shS = readU('scripts/sheets.js'), a0 = shS.indexOf('function sideAdd(into, secEl, sec) {'), a1 = shS.indexOf('\n    }\n', a0) + 7;
    const page = () => { const mkE = (cls) => { const e = { cls: cls || '', kids: [], parentNode: null, classList: { contains: k => e.cls === k }, appendChild(c) { if (c.parentNode) c.parentNode.kids.splice(c.parentNode.kids.indexOf(c), 1); c.parentNode = e; e.kids.push(c); return c; }, insertBefore(c, b) { c.parentNode = e; e.kids.splice(e.kids.indexOf(b), 0, c); return c; } }; return e; }; return mkE; };
    const mkE = page(), run = new Function('el', 'var sideLast = null;\n' + shS.slice(a0, a1) + '\nreturn { add: sideAdd, reset: function() { sideLast = null; } };')((tag, cls) => mkE(cls));
    const body = mkE('body'), secA = mkE('a'), secB = mkE('b'), secC = mkE('c'), secD = mkE('d'), secE = mkE('e');
    run.add(body, secA, {}); run.add(body, secB, { beside: true }); run.add(body, secC, { beside: true }); run.add(body, secD, {}); run.reset(); run.add(body, secE, { beside: true });
    check('sections set Beside the one before share a row in their order, and the next stands on its own', body.kids.length === 3 && body.kids[0].cls === 'sheet-siderow' && body.kids[0].kids.map(k => k.cls).join() === 'a,b,c' && body.kids[1] === secD, body.kids.map(k => k.cls));
    check('with nothing before it in its run, a section set beside stands alone', body.kids[2] === secE);
    // ---- the smaller finds of a walk through the builder from nothing ----
    const shK = readU('scripts/sheets.js'), k0 = shK.indexOf('function keyFromLabel(label, f) {'), k1 = shK.indexOf('function arrSet(on) {');
    const keyKit = fields => new Function('draft', 'F', 'validKey', 'var _keyAuto = new WeakSet();\n' + shK.slice(k0, k1) + '\nreturn { keyFromLabel: keyFromLabel, keyFollows: keyFollows, auto: _keyAuto };')({ fields }, () => null, k => /^[A-Za-z][A-Za-z0-9]*$/.test(k) && k !== 'floor');
    const fA = { key: '', label: '' }, fB = { key: 'BodyStrength', label: 'Other' }, kit = keyKit([fA, fB]), kb = { value: '' }, tBox = { closest: () => ({ querySelector: () => kb }) };
    check('a field with no key takes one from its label, in words a formula can read', kit.keyFromLabel('2 Mind & Will', fA) === 'MindWill' && kit.keyFromLabel('', fA) === '' && kit.keyFromLabel('!!!', fA) === '');
    check('never one another field holds', kit.keyFromLabel('body strength', fA) === 'BodyStrength2');
    check('never a word the formula language keeps', kit.keyFromLabel('floor', fA) === 'Floor' && keyKit([]).keyFromLabel('fl', {}) === 'Fl');
    fA.label = 'Speed'; kit.keyFollows(fA, tBox); const k1st = fA.key; fA.label = 'Speed Run'; kit.keyFollows(fA, tBox);
    check('it follows the label, and the box shows it', k1st === 'Speed' && fA.key === 'SpeedRun' && kb.value === 'SpeedRun');
    kit.auto.delete(fA); fA.label = 'Other words'; kit.keyFollows(fA, tBox);
    check('a key typed by hand stands', fA.key === 'SpeedRun');
    check('typing in the key box ends it, and a new row says nothing until something is typed', /f\.key = t\.value\.trim\(\); _keyAuto\.delete\(f\);/.test(shK) && /if \(\(f\.key \|\| f\.label\) && !validKey\(f\.key \|\| '', F\(\)\)\)/.test(shK));
    check('an empty system says what a field is', /A field is one thing on a sheet: a number, a pool such as hit points, a choice or a list of gear\./.test(shK));
    const prev = { fields: [{ id: 'f_m', key: 'Mods', kind: 'item-list', list: { stats: [{ key: 'Slot', kind: 'pick', opts: [{ label: 'Overlay' }, { label: 'Rig' }] }] } }, { id: 'f_h', key: 'Host', kind: 'item-list', list: { parts: { from: 'f_m', caps: [{ slot: 'Slot', is: 'Overlay', by: 'N' }, { slot: 'Slot', is: ['Overlay', 'Rig'], by: 'N' }, { slot: 'Other', is: 'Overlay', by: 'N' }] } } }] };
    const next = JSON.parse(j(prev)); next.fields[0].list.stats[0].opts[0].label = 'Plate';
    C.renamesCarry(prev, next);
    const lines = next.fields[1].list.parts.caps;
    check('a line of Holds by kind follows a value renamed in its parts\' list, alone or among several, and a line of another stat stays', lines[0].is === 'Plate' && j(lines[1].is) === '["Plate","Rig"]' && lines[2].is === 'Overlay', j(lines));
    const ixP = readU('index.html'), sbP = readU('scripts/sidebar.js');
    check('the empty sections say press +, and a + is in sight on each, pressing the control that makes one', ['newDocBtn', 'newPlannerBtn', 'newMapSidebarBtn'].every(id => ixP.includes('section-plus" data-press="' + id + '"') && ixP.split('id="' + id + '"').length === 2) && sbP.includes("querySelectorAll('.section-plus')") && sbP.includes('document.getElementById(b.dataset.press)'));
    check('+ Field puts the cursor in Label, and a key with no label is a name', shK.includes("var k = last.querySelector('input.sys-label'); if (k) k.focus();") && readU('scripts/sysui.js').includes("nm = r.name || r.key || 'No name yet';"));
    check('the Reader mark stands aside where there is no reader and no mark', shK.includes('mkR.hidden = !draft.mark && !sysReaders();'));
    const su = readU('scripts/sysui.js');
    check('a time rule\'s unit with no number beside it sets nothing, so its group is not in use', /hasClass\(n, 'sys-roll-evu'\)[^\n]*\.sys-roll-evn[^\n]*!every\.value\) return false/.test(su));
    check('Arrange on a HUD with nothing on it yet keeps its list and says what to press', /'No HUD yet\. Press \+ Section, or Copy the sheet\\u2019s sections\.'/.test(shK) && /st\.host\.hud\(\) \? 'Not on the HUD' : 'Not on the sheet'/.test(readU('scripts/arrange.js')));
    // ---- the page and the words ----
    const sh = readU("scripts/sheets.js"), css = readU('style.css'), html = readU('index.html'), core = readU('scripts/systemcore.js');
    check('buildSections stands a section on the row of the one before', /function sideAdd\(into, secEl, sec\)/.test(sh) && (sh.match(/sideAdd\(/g) || []).length === 3, (sh.match(/sideAdd\(/g) || []).length);
    check('a section never drawn on a row where nothing is before it, and each tab begins anew', /sec\.beside === true && sideLast/.test(sh) && /sideLast = null/.test(sh));
    check('the preview draws every section open while it is arranged, and an empty section with its word', /!printV && !arrV/.test(sh) && /hasOwn \|\| kids \|\| arrV/.test(sh) && sh.includes("'Drop a field here'"));
    check('the marks a grip finds stand only on an arranged preview', (sh.match(/arrV\) [a-z]+\.dataset\.arr/g) || []).length === 3, sh.match(/arrV\) [a-z]+\.dataset\.arr/g));
    check('a row wraps where the window is narrow, and a section on it keeps a width of its own', /\.sheet-siderow \{ display: flex; flex-wrap: wrap;/.test(css) && /\.sheet-siderow > \.sheet-section \{ flex: 1 1 190px; min-width: 0; \}/.test(css));
    check('a grip takes presses in a preview that takes none', /\.sys-layout-preview \* \{ pointer-events: none; \}/.test(css) && /\.sys-layout-preview \.arr-bar[^}]*pointer-events: auto/.test(css) && /\.sys-layout-preview \.arr-f[^}]*pointer-events: auto/.test(css));
    check('the list on the left says so too, and is no drag alone', sh.includes("select('sys-sec-beside', [['', 'On its own row'], ['1', 'Beside the one before']]") && /classList\.contains\('sys-sec-beside'\)/.test(sh));
    check('the Layout tab has Arrange, its Undo and its words, and the sheet its button', /id="sysArrange"/.test(html) && /id="sysArrUndo"/.test(html) && /id="sysArrHelp"/.test(html) && /id="sysArrList"/.test(html) && /id="sheetArrange"/.test(html));
    check('the module is loaded', /<script type="module" src="scripts\/arrange\.js"><\/script>/.test(html));
    check('Escape stops a drag and closes nothing', /arr-drag/.test(readU('scripts/esckey.js')));
    check('a drop writes no markup', !/innerHTML/.test(readU('scripts/arrange.js')) && !/innerHTML/.test(readU('scripts/arrangecore.js')));
    check('Help says it', /<b>Arrange<\/b>/.test(html) && /Beside the one before/.test(html));
    check('both release notes say it', /Arrange/.test(readRoot('WHATSNEW.txt')) && /Arrange/.test(readU('assets/whatsnew.txt')));
    check('the guide names the key', /beside/.test(readRoot('CAMPAIGN_INTEGRATION.md')));
    check('the CI step is there', readRoot('.github/workflows/checks.yml').includes('run: node tools/arrangecheck.js'));
    check('the cleaner keeps it in one place', (core.match(/s\.beside === true/g) || []).length === 1);
    console.log('');
    console.log(pass + ' passed, ' + fail + ' failed');
    summed = true;
})().catch(e => { summed = true; console.log('FAIL      ' + (e && e.stack || e)); process.exitCode = 1; });

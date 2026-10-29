/* Offline check of the Image Library's tags (1.6.0, backlog 34; the owner, by prompt: "Categories become Tags (Recommended)").
   The pure half (imgtagcore.js) is imported and run: the store's cleaner, a Merge, and the chip row, the tag menu, a cell's label and the
   preview's lines drawn on tools/boxdom.js, a page that refuses markup. The wiring is pinned: the load's cleaner, a Merge through the
   core, the library drawing through it, the words, Help, both release notes and the CI step. No browser, no network.
   Usage: node tools/imgtagcheck.js   (exit 1 on any failure) */
'use strict';
const path = require('path'), fs = require('fs');
const NL = String.fromCharCode(10);
const root = path.join(__dirname, '..'), app = path.join(root, 'system', 'app');
const readU = f => fs.readFileSync(path.join(app, f), 'utf8').replace(/\r\n/g, NL);
const readRoot = f => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, NL);
const j = o => JSON.stringify(o);
let pass = 0, fail = 0, summed = false;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok        ' + name); } else { fail++; console.log('FAIL      ' + name + (detail !== undefined ? '  -> ' + String(typeof detail === 'string' ? detail : j(detail)).slice(0, 1500) : '')); } }
const between = (s, a, b) => { const i = s.indexOf(a), k = s.indexOf(b, i + 1); return i >= 0 && k > i ? s.slice(i, k) : ''; };
const url = f => 'file:///' + path.resolve(path.join(app, 'scripts', f)).split(String.fromCharCode(92)).join('/');
const ch = n => String.fromCharCode(n);

(async () => {
    const T = await import(url('imgtagcore.js'));
    const { makeDom } = require('./boxdom.js');
    const wb = readU('scripts/whiteboard.js'), io = readU('scripts/io.js'), mn = readU('scripts/main.js'), ix = readU('index.html'), tu = readU('scripts/tutorial.js');
    const evil = '<img src=x onerror=alert(1)>"' + ch(10) + 'x';
    const walk = n => { const out = []; (function w(x) { out.push(x); (x.childNodes || []).forEach(w); })(n); return out; };
    const textOnly = n => walk(n).every(x => x.nodeType === 3 || x.nodeType === 1);

    /* ================= what a store keeps ================= */
    {
        check('a tag name: text with no control or direction characters, its spaces made one, cut to 40 characters (a pair of surrogates never split), the chip row\'s own words refused, nothing else is a name',
            T.tagName('  Night' + ch(9) + ch(10) + '  docks ') === 'Night docks' && T.tagName('a' + ch(0x202e) + 'b' + ch(0x200b) + 'c') === 'a b c' && T.tagName('x'.repeat(60)).length === 40
            && Array.from(T.tagName(ch(0xd83d) + ch(0xde00) + 'y'.repeat(39) + 'z')).length === 40 && !/[\ud800-\udbff]$/.test(T.tagName('y'.repeat(39) + ch(0xd83d) + ch(0xde00) + ch(0xd83d) + ch(0xde00)))
            && T.tagName('__none') === '' && T.tagName('__bymap') === '' && T.tagName(' __none ') === '' && T.tagName(5) === '' && T.tagName(null) === '' && T.tagName('   ') === '' && T.tagName('Villains') === 'Villains',
            j([T.tagName('  Night' + ch(9) + ch(10) + '  docks '), T.tagName('a' + ch(0x202e) + 'b' + ch(0x200b) + 'c')]));
        const raw = JSON.parse(j({ list: ['Villains', ' Villains ', 'Night' + ch(7), '__none', 5, null, 'Docks', 'X'.repeat(50)], by: {
            '/saves/images/m/a.png': ['Villains', 'Night' + ch(7), 'Gone', 'Villains'], '/saves/images/m/b.png': 'Docks', 'relative.png': ['Villains'], '/saves/images/m/c.png': [], '/saves/images/m/d.png': [5, {}],
            ['/saves/images/' + ch(10) + 'e.png']: ['Docks'] }, shelf: { Docks: true, Nope: true, Villains: 0 } }));
        raw.by['__proto__'] = ['Villains'];
        const c = T.cleanStore(raw);
        check('a store cleaned: unique names (a name that cleans to one already listed is that one), a picture\'s tags renamed with their name and only what the store lists, a picture with none or an odd key dropped, a shelf only of a listed name set true',
            j(c.list) === j(['Villains', 'Night', 'Docks', 'X'.repeat(40)]) && j(c.by['/saves/images/m/a.png']) === j(['Villains', 'Night']) && j(c.by['/saves/images/m/b.png']) === j(['Docks'])
            && j(Object.keys(c.by)) === j(['/saves/images/m/a.png', '/saves/images/m/b.png']) && j(c.shelf) === j({ Docks: true }) && Object.getPrototypeOf(c.by) === Object.prototype, j(c));
        check('no store at all is null; a store of nothing is shaped and empty (storeEmpty says so); an old shape with none of the keys is an empty store',
            T.cleanStore(null) === null && T.cleanStore([1]) === null && T.cleanStore('x') === null && T.storeEmpty(T.cleanStore({})) && j(T.cleanStore({ scenes: { label: 'Scenes' } })) === j({ list: [], by: {}, shelf: {} }) && !T.storeEmpty(c));
        const big = { list: [], by: {} }; for (let i = 0; i < 450; i++) big.list.push('t' + i); for (let i = 0; i < 70; i++) (big.by['/p.png'] = big.by['/p.png'] || []).push('t' + i);
        const cb = T.cleanStore(big);
        check('a store\'s caps: ' + T.LIMITS.tags + ' tags, ' + T.LIMITS.perPic + ' on a picture', cb.list.length === T.LIMITS.tags && cb.by['/p.png'].length === T.LIMITS.perPic);
        const m = T.mergeStores({ list: ['A', 'B'], by: { '/a.png': ['A'] }, shelf: {} }, { list: ['B', 'C' + ch(0)], by: { '/a.png': ['C' + ch(0), 'B'], '/b.png': ['C'], '/x.png': ['Q'] }, shelf: { C: true } });
        check('a Merge: the file\'s tags join (cleaned first), a picture keeps its tags and gains the file\'s, a tag the file does not list is no tag, its shelf stays on; a file with no store leaves ours as it was',
            j(m) === j({ list: ['A', 'B', 'C'], by: { '/a.png': ['A', 'C', 'B'], '/b.png': ['C'] }, shelf: { C: true } }) && j(T.mergeStores({ list: ['A'], by: {}, shelf: {} }, 5)) === j({ list: ['A'], by: {}, shelf: {} }) && j(T.mergeStores(undefined, { list: ['Z'] })) === j({ list: ['Z'], by: {}, shelf: {} }), j(m));
    }

    /* ================= filtering and saved filters (the owner: "A switch, All by default (Recommended)", and saved filters "chips, kept
       with the campaign, export/ importable from another campaign without always showing by default") ================= */
    {
        const f = T.cleanFilter({ name: ' Wet' + ch(10) + 'harbor ', tags: ['Harbor', ' Harbor ', 'Night' + ch(0x200b), '__none', 4], match: 'nope', words: '  rain   ' + ch(7) + ' docks ' });
        check('a saved filter cleaned: its name as a tag\'s, its tags cleaned and unique (the chip row\'s own words none), the switch all unless any, its words as text; a filter with no name or with nothing to filter by is none',
            j(f) === j({ name: 'Wet harbor', tags: ['Harbor', 'Night'], match: 'all', words: 'rain docks' }) && T.cleanFilter({ name: 'x', tags: [], words: '  ' }) === null && T.cleanFilter({ tags: ['A'] }) === null
            && T.cleanFilter({ name: 'x', words: 'w', match: 'any' }).match === 'any' && T.cleanFilter([1]) === null && T.cleanFilter({ name: 'x', tags: Array.from({ length: 20 }, (_, i) => 't' + i) }).tags.length === T.LIMITS.filterTags
            && T.filterWords('a'.repeat(100)).length === T.LIMITS.words, j(f));
        const fl = T.cleanFilters([{ name: 'A', tags: ['x'] }, { name: 'a', tags: ['y'] }, null, { name: 'B', words: 'w' }].concat(Array.from({ length: 70 }, (_, i) => ({ name: 'f' + i, words: 'w' }))));
        const cs = T.cleanStore({ list: ['x'], filters: [{ name: 'A', tags: ['x'] }] }), cs2 = T.cleanStore({ list: ['x'], filters: [{ name: 'A', tags: ['x'] }] }, { filters: true });
        check('a campaign\'s saved filters: unique by name, case aside, the first kept, at most ' + T.LIMITS.filters + '; kept only in a campaign\'s store (cleanStore with filters), never the shared one; a store with only a filter is no empty store',
            fl.length === T.LIMITS.filters && fl[0].tags[0] === 'x' && fl[1].name === 'B' && !('filters' in cs) && cs2.filters.length === 1 && !T.storeEmpty({ list: [], by: {}, shelf: {}, filters: [{ name: 'A', tags: [], match: 'all', words: 'w' }] }));
        const mg = T.mergeStores({ list: ['x'], filters: [{ name: 'Mine', tags: ['x'], words: '' }] }, { list: ['y'], filters: [{ name: 'MINE', words: 'theirs' }, { name: 'New', tags: ['y'] }] });
        check('a Merge of a campaign file: its saved filters join by a name this campaign has not used, ours keep theirs', j(mg.filters.map(x => [x.name, x.tags, x.words])) === j([['Mine', ['x'], ''], ['New', ['y'], '']]), j(mg.filters));
        check('the picked tags: all needs every one, any one of them, none picked passes everything',
            T.matchTags(['a', 'b', 'c'], ['a', 'c'], 'all') && !T.matchTags(['a'], ['a', 'c'], 'all') && T.matchTags(['a'], ['a', 'c'], 'any') && !T.matchTags(['b'], ['a', 'c'], 'any') && T.matchTags([], [], 'all') && T.matchTags(['z'], null, 'any'));
        check('the words: every word typed must be in the name, the map or a tag, in any order and case aside; nothing typed passes everything',
            j(T.words('  Night   DOCKS ')) === j(['night', 'docks']) && T.matchWords(['night docks.png', 'loose', 'Harbor'], T.words('harbor night')) && !T.matchWords(['night docks.png', 'loose'], T.words('night rain'))
            && T.matchWords(['a.png'], []) && T.matchWords(['Docks at Night.png', '', 'Wet'], T.words('wet docks')));
        const sf = { name: 'S', tags: ['A', 'B'], match: 'all', words: 'Rain' };
        check('what is shown now is a saved filter: the same tags in any order, the switch where two or more tags make it count, the same words case and spaces aside',
            T.sameFilter(sf, { tags: ['B', 'A'], match: 'all', words: '  rain ' }) && !T.sameFilter(sf, { tags: ['B', 'A'], match: 'any', words: 'rain' }) && !T.sameFilter(sf, { tags: ['A'], match: 'all', words: 'rain' })
            && T.sameFilter({ name: 'O', tags: ['A'], match: 'all', words: '' }, { tags: ['A'], match: 'any', words: '' }) && !T.sameFilter(sf, { tags: ['A', 'B'], match: 'all', words: 'rain docks' }) && !T.sameFilter(null, {}));
        check('a name none of the list has: the name, else numbered, within the length of a name',
            T.freeName('Wet', [{ name: 'Dry' }]) === 'Wet' && T.freeName('Wet', [{ name: 'wet' }]) === 'Wet (2)' && T.freeName('Wet', [{ name: 'Wet' }, { name: 'Wet (2)' }]) === 'Wet (3)' && T.freeName('x'.repeat(40), [{ name: 'x'.repeat(40) }]).length === 40);
        const dom = makeDom(), d = dom.document, row = d.createElement('div'), menu = d.createElement('div');
        let err = '';
        try {
            T.drawRow(d, row, { scopes: [], all: { count: 1 }, tags: [{ name: 'A', store: 'camp', count: 1, active: true }, { name: 'B', store: 'camp', count: 1, active: true }], none: { count: 0 }, make: false, match: 'any',
                saved: { list: [{ name: evil, active: true }, { name: 'Two' }], save: true, imp: true, tools: true } });
            T.drawFilterMenu(d, menu, [{ camp: 'k2', name: evil, filters: [{ name: evil, tags: [evil] }, { name: 'W', tags: [] }] }]);
        } catch (e) { err = String(e && e.stack || e); }
        const sw = row.querySelector('.img-match'), sb = walk(row).filter(n => n.tagName === 'BUTTON');
        check('the Match switch (drawRow, once two or more tags are picked): the app\'s own segmented control, all and any, the one in force lit; the Saved row: a chip a saved filter, its name text, the one shown lit, Save this filter, Import from another campaign, and the lit one\'s Rename and Delete',
            !err && textOnly(row) && !!sw && /seg-control/.test(sw.className) && j(walk(sw).filter(n => n.tagName === 'BUTTON').map(b => [b.dataset.match, /active/.test(b.className), /seg-btn/.test(b.className)])) === j([['all', false, true], ['any', true, true]])
            && sb.filter(b => b.dataset.saved !== undefined).map(b => b.dataset.saved + '|' + /active/.test(b.className)).join(',') === '0|true,1|false' && sb.find(b => b.dataset.saved === '0').childNodes[0].nodeValue === ch(0x2605) + ' ' + evil
            && j(sb.filter(b => b.dataset.act).map(b => b.dataset.act)) === j(['filter-save', 'filter-import', 'filter-rename', 'filter-delete']) && row.textContent.indexOf('Saved') >= 0, err || row.textContent);
        const row2 = d.createElement('div'); T.drawRow(d, row2, { scopes: [], all: { count: 1 }, tags: [], none: { count: 0 }, saved: { list: [], save: false, imp: true, tools: false } });
        const mi = walk(menu).filter(n => n.tagName === 'BUTTON'), menu2 = d.createElement('div'); T.drawFilterMenu(d, menu2, []);
        check('no saved filter yet says how to make one, with no switch while one tag or none is picked; the import menu lists another campaign\'s filters under its name, as text, each naming its campaign and place, and says so when none has one',
            !row2.querySelector('.img-match') && row2.textContent.indexOf('None yet') >= 0 && textOnly(menu) && j(mi.map(b => [b.dataset.act, b.dataset.camp, b.dataset.i])) === j([['filter-take', 'k2', '0'], ['filter-take', 'k2', '1']])
            && walk(menu).some(n => n.className === 'party-menu-head' && n.textContent === evil) && mi[0].title === 'Tags: ' + evil && mi[1].title === 'Words only' && menu2.textContent.indexOf('No other campaign of yours has one.') >= 0, j(mi.map(b => b.title)));
    }

    /* ================= drawn as text ================= */
    {
        const dom = makeDom(), d = dom.document, row = d.createElement('div'), menu = d.createElement('div');
        row.appendChild(d.createTextNode('stale'));
        let err = '';
        try {
            T.drawRow(d, row, { scopes: [{ scope: 'camp', text: evil, count: 3, title: 't', active: true }, { scope: 'all', text: 'All campaigns', count: 9 }], imp: true, all: { count: 4, active: false }, bymap: false,
                tags: [{ name: evil, store: 'camp', count: 2, active: true }, { name: 'Ships', store: 'shared', count: 1 }], none: { count: 5, active: false }, make: true, tools: { shelf: true, shared: false } });
            T.drawMenu(d, menu, { scene: true, head: 'Tags of 3 pictures', tags: [{ name: evil, store: 'shared', state: 'all', n: 3, of: 3 }, { name: 'Ships', store: 'camp', state: 'some', n: 1, of: 3 }, { name: 'Dock', store: 'camp', state: 'none', n: 0, of: 3 }], from: evil, move: [{ name: 'Ships', store: 'camp' }] });
        } catch (e) { err = String(e && e.stack || e); }
        const btns = walk(row).filter(n => n.tagName === 'BUTTON'), tagB = btns.find(b => b.dataset.cat === evil);
        check('the chip row (imgtagcore drawRow, run for real on a page that refuses markup): a tag\'s name and a campaign\'s name are text nodes, a chip names its tag in data-cat as written, the shared mark is its own span, what was there before is gone',
            !err && textOnly(row) && !!tagB && tagB.childNodes[0].nodeType === 3 && tagB.childNodes[0].nodeValue === evil && tagB.className.indexOf('active') >= 0 && btns.find(b => b.dataset.scope === 'camp').childNodes[0].nodeValue === evil
            && row.textContent.indexOf('stale') < 0 && btns.some(b => b.dataset.cat === 'Ships' && b.className.indexOf('img-cat-shared') >= 0 && b.querySelector('.img-cat-mark'))
            && j(btns.map(b => b.dataset.act || b.dataset.scope || ('cat:' + b.dataset.cat))) === j(['camp', 'all', 'picker', 'cat:', 'cat:__bymap', 'cat:' + evil, 'cat:Ships', 'cat:__none', 'new', 'new-shared', 'shelf', 'share', 'rename', 'delete'])
            && btns.every(b => b.type === 'button' && /\bjournal-from\b/.test(b.className)) && row.textContent.indexOf('No tag') >= 0 && row.textContent.indexOf('+ New tag') >= 0 && row.textContent.indexOf('Delete tag') >= 0,
            err || j(btns.map(b => [b.className, b.dataset, b.textContent])));
        const mb = walk(menu).filter(n => n.tagName === 'BUTTON');
        const marks = mb.filter(b => b.dataset.act === 'toggle').map(b => [b.querySelector('.img-tag-state').textContent, b.attrs['aria-pressed'], b.querySelector('.img-tag-some') ? b.querySelector('.img-tag-some').textContent : '', b.title]);
        check('the tag menu (drawMenu; the owner: "Add a Select button (Recommended)" with a Tags list that adds to all or takes from all): Show as a scene, every tag a toggle marked with a check when all have it, a dash and how many when some do, nothing when none, a new tag, and inside a tag\'s view Move and Remove; every name a text node, named in data-cat as written',
            !err && textOnly(menu) && j(mb.map(b => b.dataset.act)) === j(['scene', 'toggle', 'toggle', 'toggle', 'new-add', 'move', 'new-move', 'remove']) && mb[1].dataset.cat === evil && mb[1].childNodes[1].nodeValue === evil + ' ' + ch(0x25c7) && mb[7].dataset.cat === evil
            && j(marks.map(x => x.slice(0, 3))) === j([[ch(0x2713), 'true', ''], [ch(0x2013), 'mixed', '1 of 3'], ['', 'false', '']]) && marks[0][3] === 'All 3 have it. Click to take it from all' && marks[1][3] === '1 of 3 have it. Click to give it to all' && marks[2][3] === 'None has it. Click to give it to all 3'
            && walk(menu).filter(n => n.className === 'party-menu-head').map(n => n.textContent).join('|') === 'Tags of 3 pictures|Move from ' + evil + ' to' && mb.every(b => /party-menu-item/.test(b.className))
            && T.tagState(0, 3) === 'none' && T.tagState(2, 3) === 'some' && T.tagState(3, 3) === 'all' && T.tagState(1, 1) === 'all', j(marks));
        const cell = d.createElement('div'); cell.dataset.src = '/a.png'; cell.dataset.name = 'a.png'; cell.appendChild(d.createElement('img')); cell.appendChild(d.createElement('div'));
        T.cellTags(d, cell, [evil, 'Ships'], true, 'right-click to tag it'); T.cellTags(d, cell, [evil, 'Ships'], true, 'right-click to tag it');
        const lab = cell.querySelectorAll('.img-lib-tag');
        const cell2 = d.createElement('div'); cell2.dataset.name = 'b.png'; cell2.appendChild(d.createElement('img')); T.cellTags(d, cell2, ['Ships'], false, '');
        const box = d.createElement('div'); T.previewTags(d, box, evil, [evil]); const box2 = d.createElement('div'); T.previewTags(d, box2, '', []);
        check('a cell\'s label and title, and the preview\'s lines: the tags as one text, drawn once however often, after the picture; none in a tag\'s own view; the preview says Tag or Tags, or none',
            lab.length === 1 && lab[0].childNodes[0].nodeValue === evil + ', Ships' && cell.childNodes[1] === lab[0] && cell.title === 'a.png ' + ch(0xb7) + ' ' + evil + ', Ships ' + ch(0x2014) + ' right-click to tag it'
            && !cell2.querySelector('.img-lib-tag') && cell2.title === 'b.png ' + ch(0xb7) + ' Ships' && textOnly(box) && box.textContent === 'Map: ' + evil + 'Tag: ' + evil && box2.textContent === 'Tags: none', j([cell.title, box.textContent]));
    }

    /* ================= the wiring ================= */
    {
        const rc = between(wb, '  function renderImgCats() {', '  function tagLog('), om = between(wb, '  function openImgCatMenu(', '  function hideImgCatMenu()');
        check('the library draws its chips and its tag menu through the core, with no markup of a name (no innerHTML in either), and imports the core',
            wb.includes("import * as TagCore from './imgtagcore.js';") && rc.includes('TagCore.drawRow(document, row, m);') && !/innerHTML/.test(rc) && om.includes('TagCore.drawMenu(document, menu,') && !/innerHTML/.test(om));
        const grid = between(wb, '  function renderImgLib(filter) {', '  // Multi-pick:');
        check('the grid: no tag name in its markup, each cell\'s label and title drawn after as text (cellTags); the preview\'s lines through previewTags',
            !/img-lib-tag|esc\(imgCatOf/.test(grid) && grid.includes("TagCore.cellTags(document, cell, imgCatsOf(cell.dataset.src), label, hint);") && wb.includes("TagCore.previewTags(document, document.getElementById('imgLibPreviewMeta'), mapName, imgCatsOf(src));")
            && !/innerHTML/.test(between(wb, '  function openImgPreview(', '  // The pictures currently in the grid')));
        check('a new or renamed tag goes through tagName (the chip row\'s own words refused, cut as the cleaner cuts)',
            /showPrompt\(shared \? 'New shared tag \(every campaign sees it\):' : 'New tag:', '', function\(name\) \{\n          name = TagCore\.tagName\(String\(name \|\| ''\)\); if \(!name\) return;/.test(wb)
            && /showPrompt\('Rename tag:', old, function\(name\) \{\n                  name = TagCore\.tagName\(String\(name \|\| ''\)\);/.test(wb));
        check('the load cleans the shared store and each campaign\'s through cleanStore, keeps an empty one (the cleanup reads a shared store as a mark), and the core is loaded before the first load',
            io.includes("import './imgtagcore.js';") && io.includes('if (data.imageCats !== undefined) { var itA = ITC.cleanStore(data.imageCats); if (itA) data.imageCats = itA; else delete data.imageCats; }')
            && io.includes('var itC = ITC.cleanStore(cc.imageCats, { filters: true }); if (itC) cc.imageCats = itC; else delete cc.imageCats;') && io.indexOf('ITC.cleanStore(data.imageCats)') < io.indexOf('window.wpMigratePictures(data)'));
        check('a Merge of a campaign\'s tags goes through mergeStores (the older merge stays for a page without the core)',
            mn.includes("if (ic.imageCats && typeof ic.imageCats === 'object' && window.wpImgTagCore) { var mgT = window.wpImgTagCore.mergeStores(existing.imageCats, ic.imageCats);") && mn.includes("else if (ic.imageCats && typeof ic.imageCats === 'object') {"));
        const lib = between(wb, '  function renderImgLib(filter) {', '  // Multi-pick:'), rowC = between(wb, '      row.addEventListener(\'click\', function(e) {', '      // right-click a picture:');
        check('the grid filters by the picked tags through matchTags with the switch, and by every word through matchWords over the name, the map and the tags',
            lib.includes("picked = pickedTags(), ws = TagCore.words(filter);") && lib.includes("(picked.length && !TagCore.matchTags(imgCatsOf(im.path), picked, _imgLibMatch))") && lib.includes("if (!TagCore.matchWords([im.name, label].concat(imgCatsOf(im.path)), ws)) return;"));
        check('Ctrl-click on a tag\'s chip adds it to the picked ones or takes it off (never the last); a plain click picks one alone; the switch, a saved chip and the four saved-filter tools are wired',
            rowC.includes("if ((e.ctrlKey || e.metaKey) && isTagCat(cv) && isTagCat(_imgLibCat)) {") && rowC.includes("if (atC < 0) pkC.push(cv); else if (pkC.length > 1) pkC.splice(atC, 1);") && rowC.includes("} else { _imgLibCat = cv; _imgLibAlso = []; }")
            && rowC.includes("if (b.dataset.match) { _imgLibMatch = b.dataset.match === 'any' ? 'any' : 'all';") && rowC.includes("if (b.dataset.saved !== undefined) { applySaved(+b.dataset.saved); return; }")
            && ['saveFilter()', 'renameFilter()', 'deleteFilter()', 'openFilterImport('].every(s => rowC.includes(s)) && wb.includes("if (act === 'filter-take') { takeFilter(b.dataset.camp, +b.dataset.i); return; }"));
        check('the one tag in view (its tools, Move and Remove, the cast shelf) is the tag picked alone (soleTag)', /var cur = imgCatsOf\(path\), from = soleTag\(\);/.test(wb) && /var from = soleTag\(\);/.test(wb) && wb.includes('fromV = soleTag();') && wb.includes('if (!_imgLibPicker && soleTag()) {') && wb.includes('!!(soleTag() && isShelved(soleTag()))'));
        const sv = between(wb, '  function saveFilter() {', '  // The tag menu for one picture.');
        check('saved filters live in the campaign\'s own store (filterList), another campaign\'s are read only when Import from another campaign is asked, a taken one is numbered and the tags it lacks made here; each step logs',
            wb.includes("function savedFilters(campId) { var c = campId ? catStore(campId) : EMPTY_CATS; return Array.isArray(c.filters) ? c.filters : []; }") && sv.includes('var list = filterList(camp.id, true), at = filterAt(list, name, -1);')
            && sv.includes('var name = TagCore.freeName(f.name, list)') && sv.includes("nf.tags.forEach(function(t) { if (!catHome(t) && c.list.length < TagCore.LIMITS.tags) { c.list.push(t); made++; } });")
            && ['filter-save', 'filter-apply', 'filter-rename', 'filter-delete', 'filter-import'].every(s => sv.includes("tagLog('" + s + "'")) && wb.includes("tagLog('filter-match'") && wb.includes("tagLog('filter-tags'"));
        check('Help says how to filter by several tags, what the words match, how to save, rename, delete and bring in a saved filter, and both release notes say it',
            ix.includes('<kbd>Ctrl</kbd>-click more. <b>Match</b> beside them') && ix.includes('Each word must be in the picture&rsquo;s name, its map or its tags.') && ix.includes('<li><b>Save this filter&hellip;</b> under <b>Saved</b>') && ix.includes('Only the ones you take come in.')
            && [readRoot('WHATSNEW.txt'), readU('assets/whatsnew.txt')].every(t => t.includes('- Filter by several tags: pick a tag\'s chip, then Ctrl-click more.') && t.includes('- Save a filter by name: Save this filter... keeps the tags, the switch')));
        const om2 = between(wb, '  function openImgCatMenu(', '  function hideImgCatMenu()'), bar = between(wb, '  function renderImgSelBar() {', '  function castCells()');
        check('the Tags list: each tag with how many of the pictures have it (tagState); its click takes the tag from all when all have it, else gives it to all; a right-click on a picked picture speaks for all the picked',
            om2.includes("return { name: c.name, store: c.store, state: TagCore.tagState(n, paths.length), n: n, of: paths.length };") && om2.includes("head: many ? 'Tags of ' + paths.length + ' pictures' : 'Tags', tags: tags,")
            && wb.includes("if (act === 'toggle') { var tps = Array.isArray(src) ? src : [src]; imgCatChange(src, tps.every(function(p) { return imgCatsOf(p).indexOf(cat) >= 0; }) ? 'remove' : 'add', cat); return; }")
            && wb.includes("openImgCatMenu(_imgLibSel[cell.dataset.src] && pickedN.length > 1 ? pickedN : cell.dataset.src, e.clientX, e.clientY);"));
        check('Select: a button of the app\'s own beside the search box, a switch (aria-pressed) that makes a plain click pick, never the copies button; hidden while one picture is chosen for a block; off each time the library opens; Select all shown and Done on the bar, Ctrl+A the same pick; each logs',
            ix.includes('<button type="button" class="tool ghost" id="imgLibSelectBtn" aria-pressed="false"') && wb.includes("(e.ctrlKey || e.metaKey || e.shiftKey || (_imgLibSelMode && !e.target.closest('.img-cell-batch')))")
            && wb.includes("b.style.display = _imgLibPick && !_imgLibPicker ? 'none' : '';") && (wb.match(/_imgLibSel = \{\}; _imgLibLastPick = null; _imgLibSelMode = false;/g) || []).length === 2
            && bar.includes('data-act="all"') && bar.includes('data-act="done"') && bar.includes('Click pictures to pick them') && wb.includes("else if (b.dataset.act === 'all') { selectAllShown();") && wb.includes("else if (b.dataset.act === 'done') { _imgLibSelMode = false;")
            && (wb.match(/selectAllShown\(\);/g) || []).length === 2 && wb.includes("tagLog('select-all', { pics: _imgLibOrder.length })") && wb.includes("tagLog('select', { on: _imgLibSelMode })"));
        check('Help says how to pick many and what the marks of the Tags list mean, and both release notes say it',
            ix.includes('press <b>Select</b> beside the search box. A plain click then picks a picture, and <b>Select all shown</b> picks every one in view.') && ix.includes('A tick means every picked picture has it. A short line means only some do.')
            && [readRoot('WHATSNEW.txt'), readU('assets/whatsnew.txt')].every(t => t.includes('- Tag many pictures at once. Select beside the search box makes a plain')));
        const steps = ['tag-new', 'tag-shelf', 'tag-share', 'tag-rename', 'tag-delete'];
        check('every step of a tag logs as imglib v1, with counts and a store\'s kind only (stepLog cleans the rest)', wb.includes("function tagLog(step, facts) { if (window.wpStepLog) window.wpStepLog('imglib v1', step, facts); }")
            && steps.every(s => wb.includes("tagLog('" + s + "'")) && wb.includes("tagLog('tag-' + act, { pics: many ? path.length : 1 });") && !/tagLog\([^)]*name\s*[,}]/.test(wb));
        const wn = readRoot('WHATSNEW.txt'), an = readU('assets/whatsnew.txt'), ci = readRoot('.github/workflows/checks.yml');
        check('the words: the library says tag, never category; Help says what a tag is, that tags stay on this computer, and where the steps are; the tour and both release notes say it',
            ix.includes('placeholder="Filter by name, map or tag&hellip;"') && ix.includes('id="imgLibPreviewCat" title="Give this picture a tag (it can wear several)">Tags&hellip;</button>') && !/Add to category/.test(ix + wb)
            && ix.includes('<li><b>Tags</b> sort your pictures.') && ix.includes('They stay on your computer and never go to your players.') && ix.includes('as imglib v1 lines') && !/category|categor/i.test(between(wb, '  function renderImgCats() {', '  function tagLog(') + between(wb, "      var others = catList()", "      menu.dataset.src = many"))
            && tu.includes('Filter by name, map or tag, and give pictures tags to sort them.') && [wn, an].every(t => t.includes('Image Library tags') && t.includes('- Tags are yours alone: they stay on your computer and never go to your')), '');
        check('CI runs this suite', ci.includes('run: node tools/imgtagcheck.js'));
    }

    summed = true;
    console.log(NL + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exit(1);
})().catch(e => { console.log('FAIL      the suite stopped: ' + (e && e.stack || e)); process.exit(1); });
process.on('exit', () => { if (!summed) { console.log('FAIL      the suite never finished its checks'); process.exitCode = 1; } });

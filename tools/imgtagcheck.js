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

    /* ================= drawn as text ================= */
    {
        const dom = makeDom(), d = dom.document, row = d.createElement('div'), menu = d.createElement('div');
        row.appendChild(d.createTextNode('stale'));
        let err = '';
        try {
            T.drawRow(d, row, { scopes: [{ scope: 'camp', text: evil, count: 3, title: 't', active: true }, { scope: 'all', text: 'All campaigns', count: 9 }], imp: true, all: { count: 4, active: false }, bymap: false,
                tags: [{ name: evil, store: 'camp', count: 2, active: true }, { name: 'Ships', store: 'shared', count: 1 }], none: { count: 5, active: false }, make: true, tools: { shelf: true, shared: false } });
            T.drawMenu(d, menu, { scene: true, head: 'Add a tag', add: [{ name: evil, store: 'shared' }], from: evil, move: [{ name: 'Ships', store: 'camp' }] });
        } catch (e) { err = String(e && e.stack || e); }
        const btns = walk(row).filter(n => n.tagName === 'BUTTON'), tagB = btns.find(b => b.dataset.cat === evil);
        check('the chip row (imgtagcore drawRow, run for real on a page that refuses markup): a tag\'s name and a campaign\'s name are text nodes, a chip names its tag in data-cat as written, the shared mark is its own span, what was there before is gone',
            !err && textOnly(row) && !!tagB && tagB.childNodes[0].nodeType === 3 && tagB.childNodes[0].nodeValue === evil && tagB.className.indexOf('active') >= 0 && btns.find(b => b.dataset.scope === 'camp').childNodes[0].nodeValue === evil
            && row.textContent.indexOf('stale') < 0 && btns.some(b => b.dataset.cat === 'Ships' && b.className.indexOf('img-cat-shared') >= 0 && b.querySelector('.img-cat-mark'))
            && j(btns.map(b => b.dataset.act || b.dataset.scope || ('cat:' + b.dataset.cat))) === j(['camp', 'all', 'picker', 'cat:', 'cat:__bymap', 'cat:' + evil, 'cat:Ships', 'cat:__none', 'new', 'new-shared', 'shelf', 'share', 'rename', 'delete'])
            && btns.every(b => b.type === 'button' && /\bjournal-from\b/.test(b.className)) && row.textContent.indexOf('No tag') >= 0 && row.textContent.indexOf('+ New tag') >= 0 && row.textContent.indexOf('Delete tag') >= 0,
            err || j(btns.map(b => [b.className, b.dataset, b.textContent])));
        const mb = walk(menu).filter(n => n.tagName === 'BUTTON');
        check('the tag menu (drawMenu): Show as a scene, the tags to add, a new tag, and inside a tag\'s view Move and Remove, every name a text node and named in data-cat as written',
            !err && textOnly(menu) && j(mb.map(b => b.dataset.act)) === j(['scene', 'add', 'new-add', 'move', 'new-move', 'remove']) && mb[1].dataset.cat === evil && mb[1].childNodes[0].nodeValue === evil && mb[5].dataset.cat === evil
            && walk(menu).filter(n => n.className === 'party-menu-head').map(n => n.textContent).join('|') === 'Add a tag|Move from ' + evil + ' to' && mb.every(b => /party-menu-item/.test(b.className)), j(mb.map(b => b.dataset)));
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
            && io.includes('var itC = ITC.cleanStore(cc.imageCats); if (itC) cc.imageCats = itC; else delete cc.imageCats;') && io.indexOf('ITC.cleanStore(data.imageCats)') < io.indexOf('window.wpMigratePictures(data)'));
        check('a Merge of a campaign\'s tags goes through mergeStores (the older merge stays for a page without the core)',
            mn.includes("if (ic.imageCats && typeof ic.imageCats === 'object' && window.wpImgTagCore) { var mgT = window.wpImgTagCore.mergeStores(existing.imageCats, ic.imageCats);") && mn.includes("else if (ic.imageCats && typeof ic.imageCats === 'object') {"));
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

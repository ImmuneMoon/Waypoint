/* Offline check of the page's own navigation (system/app/scripts/pagenav.js): the Outline of a drawn planner or page, its menu, and the
   folds. The module's three slices are run for real on tools/boxdom.js, a page of plain objects that refuses markup, over trees built by
   hand and over what the two real renderers draw (docrender.js renderDoc; planner.js plannerPreviewHtml, sliced), read into that page by
   a small reader of this suite's own, with a storage, a campaign and a page observer of the suite's own. No browser.
   Usage: node tools/pagecheck.js */
'use strict';
const fs = require('fs'), path = require('path');
const { makeDom } = require('./boxdom.js');
const app = path.join(__dirname, '..', 'system', 'app'), root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(app, f), 'utf8').replace(/\r\n/g, '\n');
const modUrl = f => 'file:///' + path.resolve(path.join(app, 'scripts', f)).replace(/\\/g, '/');
const J = JSON.stringify;
let pass = 0, fail = 0;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok       ', name); } else { fail++; console.log('FAIL     ', name, detail !== undefined ? '-> ' + String(detail).slice(0, 700) : ''); } }

const src = read('scripts/pagenav.js');
const slice = n => { const a = src.indexOf('// [pagecheck:' + n + '-start]'), z = src.indexOf('// [pagecheck:' + n + '-end]'); if (a < 0 || z < a) throw new Error('pagecheck: the ' + n + ' slice is not marked'); return src.slice(a, z); };
// an element of the test page: its class, its children (a string is a text node), its data
const mk = (dom, tag, cls, kids, data) => { const e = dom.document.createElement(tag); if (cls) e.className = cls; Object.keys(data || {}).forEach(k => { e.dataset[k] = data[k]; }); (kids || []).forEach(k => e.appendChild(typeof k === 'string' ? dom.document.createTextNode(k) : k)); return e; };
const blk = (dom, i, kids) => mk(dom, 'div', 'pv-blk', kids, i === null ? {} : { blk: String(i) });
// markup as the two renderers write it, read into the test page: tags, their class and data, text with the entities they use. A reader of
// this suite's own, for well-formed markup only (the renderers' own): it makes elements and text nodes, as a browser would for these
const VOID = { br: 1, hr: 1, img: 1, input: 1, col: 1 };
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', mdash: '—', nbsp: ' ', rsquo: '’', hellip: '…' };
const ent = s => s.replace(/&(?:([a-z]+)|#(\d+)|#x([0-9a-fA-F]+));/g, (m, n, d, x) => d ? String.fromCodePoint(+d) : x ? String.fromCodePoint(parseInt(x, 16)) : (Object.prototype.hasOwnProperty.call(ENT, n) ? ENT[n] : m));
function toTree(dom, html) {
    const doc = dom.document, top = doc.createElement('div'), stack = [top], re = /<\/([a-zA-Z0-9]+)\s*>|<([a-zA-Z0-9]+)((?:\s+[^\s=>\/]+(?:="[^"]*")?)*)\s*\/?>|([^<]+)/g;
    let m;
    while ((m = re.exec(html))) {
        const at = stack[stack.length - 1];
        if (m[1]) { for (let i = stack.length - 1; i > 0; i--) if (stack[i].nodeName === m[1].toUpperCase()) { stack.length = i; break; } }
        else if (m[2]) {
            const e = doc.createElement(m[2]);
            (m[3].match(/[^\s=]+(?:="[^"]*")?/g) || []).forEach(a => { const i = a.indexOf('='), k = i < 0 ? a : a.slice(0, i), v = i < 0 ? '' : ent(a.slice(i + 2, -1)); if (k === 'class') e.className = v; else if (k.indexOf('data-') === 0) e.dataset[k.slice(5)] = v; else e.setAttribute(k, v); });
            at.appendChild(e); if (!VOID[m[2].toLowerCase()]) stack.push(e);
        } else at.appendChild(doc.createTextNode(ent(m[4])));
    }
    return top;
}

let summed = false;   // a check that never settles (a promise nothing answers) would let Node exit with no summary and code 0: that is a failure
process.on('exit', code => { if (!summed && !code) { console.log('\nFAIL      the asynchronous checks never finished (a promise was left waiting)'); process.exitCode = 1; } });
(async () => {
    const SC = await import(modUrl('safecore.js')), DR = await import(modUrl('docrender.js'));
    const O = new Function(slice('outline') + '\nreturn { navHas: navHas, navFirstEl: navFirstEl, navBlocks: navBlocks, navHead: navHead, navText: navText, navOutline: navOutline };')();
    const lines = list => list.map(h => h.level + ' ' + h.bi + ' ' + h.text);

    /* ---- the outline of a drawn page: what counts as a heading, and its words ---- */
    {
        const d = makeDom();
        const planner = mk(d, 'div', 'wrap', [
            blk(d, 0, [mk(d, 'h1', '', ['Session 1 — The Hill Road', mk(d, 'span', 'sub', ['A one-evening adventure'])])]),
            blk(d, 1, [mk(d, 'p', 'lede', ['Raiders are bleeding the caravans.'])]),
            blk(d, 2, [mk(d, 'h2', '', ['Beats'])]),
            blk(d, 3, [mk(d, 'div', 'node', [mk(d, 'h3', '', ['The driver at the inn', ' ', mk(d, 'span', 'tag', ['social'])]), mk(d, 'p', 'must', ['Must resolve']), mk(d, 'table', '', [])])]),
            blk(d, 4, [mk(d, 'div', 'node plain-table', [mk(d, 'table', '', [])])]),
            blk(d, 5, [mk(d, 'div', 'callout', [mk(d, 'h2', '', ['Not a heading of the page'])])]),
            blk(d, 6, [mk(d, 'h2', '', ['If they ', mk(d, 'mark', 'pf-hit', ['chase']), ' the\n   raiders  '])]),
            blk(d, 7, [mk(d, 'p', '', ['The survivors raft downriver.'])])]);
        const got = O.navOutline(planner);
        check('the outline of a drawn planner: its title without its subtitle, each section heading, and each node by its title without its tag, in the page\'s order and by level — 1 for the title, 2 for a section, 3 for a node; a node with no title, a callout (whatever it holds), a lead and plain text are no headings; a word Find has lit inside a heading is still part of it, and white space is folded; each entry names its block by the block\'s own number and its heading element',
            J(lines(got)) === J(['1 0 Session 1 — The Hill Road', '2 2 Beats', '3 3 The driver at the inn', '2 6 If they chase the raiders']) && got[0].el.nodeName === 'H1' && got[2].el.nodeName === 'H3' && got[2].el.parentNode.className === 'node' && got.every(h => h.el.parentNode), J(lines(got)));
        const long = 'x'.repeat(119) + '😀' + 'tail', page = mk(d, 'div', 'wrap', [
            blk(d, 0, [mk(d, 'h1', '', ['House rules'])]),
            blk(d, 1, [mk(d, 'h2', '', ['At the table'])]),
            mk(d, 'div', 'doc-section doc-cols-2', [
                blk(d, 2, [mk(d, 'h3', 'doc-h3', ['Inspiration'])]),
                blk(d, 3, [mk(d, 'div', 'node plain-table doc-tablewrap', [mk(d, 'h3', '', ['Travel pace']), mk(d, 'table', 'doc-table', [])])]),
                blk(d, 4, [mk(d, 'div', 'node plain-table doc-tablewrap', [mk(d, 'table', 'doc-table', [])])])]),
            mk(d, 'div', 'doc-clear', []),
            blk(d, 5, [mk(d, 'h2', '', ['   ', mk(d, 'span', 'sub', ['only a subtitle'])])]),
            blk(d, 6, [mk(d, 'figure', 'doc-img', [])]),
            blk(d, 7, [mk(d, 'h2', '', [long])]),
            blk(d, null, [mk(d, 'h2', '', ['A block with no number'])]),
            blk(d, 8, [mk(d, 'div', 'node', [mk(d, 'p', '', ['x']), mk(d, 'h3', '', ['Not first'])])]),
            blk(d, 9, [mk(d, 'div', 'raw', [blk(d, 10, [mk(d, 'h2', '', ['A block inside a block'])])])]),
            blk(d, 11, ['text first ', mk(d, 'h3', '', ['After text is still the first element'])]),
            blk(d, 12, []),
            blk(d, 13, [mk(d, 'div', 'nodes', [mk(d, 'h3', '', ['A class that only begins like node'])])]),
            blk(d, 14, [mk(d, 'h3', '', ['Kept ', mk(d, 'span', 'subtle', ['whole']), mk(d, 'span', 'tagged', [' words'])])]),
            mk(d, 'div', 'pv-blks', [mk(d, 'div', 'x', [blk(d, 15, [mk(d, 'h2', '', ['Deep in other boxes'])])])])]);
        const gotP = O.navOutline(page), cut = gotP.filter(h => h.bi === '7')[0];
        check('the outline of a drawn page: its title, its sections, a third-level heading and a table by its title, found inside a section\'s columns and inside any other box too; a table with no title, a picture, a heading that is blank or only a subtitle, a block with no number, a title that is not the first thing in its box and a block drawn inside another block are left out; a class is taken by its whole name (a box named nodes is no node, a part named subtle or tagged is part of the heading); a heading\'s words are cut at 120 characters, never through a character',
            J(lines(gotP).filter(l => l.indexOf('2 7 ') !== 0)) === J(['1 0 House rules', '2 1 At the table', '3 2 Inspiration', '3 3 Travel pace', '3 11 After text is still the first element', '3 14 Kept whole words', '2 15 Deep in other boxes']) && !!cut && Array.from(cut.text).length === 120 && cut.text === 'x'.repeat(119) + '😀'
            && O.navBlocks(page).length === 16 && J(O.navOutline(null)) === '[]' && J(O.navOutline(mk(d, 'div', '', []))) === '[]' && O.navHead(blk(d, 0, ['only text'])) === null && O.navText(mk(d, 'h2', '', [])) === '', J(lines(gotP)));
    }

    /* ---- the outline over what the two real renderers draw ---- */
    let real = null;   // the two drawn trees, kept for the folds' own check further down
    {
        const d = makeDom(), sliceOf = (file, a, b) => { const s = read(file), i = s.indexOf(a), k = s.indexOf(b); if (i < 0 || k < i) throw new Error('pagecheck: ' + a + ' is not in ' + file); return s.slice(i + a.length, k); };
        const plannerPreviewHtml = new Function('esc', 'sanitizeHtml', 'proseHtml', 'stripMermaidLinks', 'compileFlowchart', 'docStyleCss', 'mergeDocStyle', 'num', 'picRef', 'fmtHtml', 'fmtRich', 'fieldFmt', 'colFmtOf', 'cellFmtOf', 'mermaidPre',
            sliceOf('scripts/planner.js', '// [sinkcheck:planner-preview-start]', '// [sinkcheck:planner-preview-end]') + '\nreturn plannerPreviewHtml;')(SC.esc, DR.sanitizeHtml, DR.proseHtml, DR.stripMermaidLinks, DR.compileFlowchart, DR.docStyleCss, DR.mergeDocStyle, SC.num, SC.picRef, DR.fmtHtml, DR.fmtRich, DR.fieldFmt, DR.colFmtOf, DR.cellFmtOf, DR.mermaidPre);
        const HOSTILE = '<img src=x onerror=alert(1)> & "quoted"';
        const plan = { id: 'p1', type: 'planner', blocks: [{ type: 'h1', title: 'Session 1', sub: 'An evening' }, { type: 'lede', content: 'Lead.' }, { type: 'h2', title: 'Beats' },
            { type: 'node', title: 'The inn', tag: 'social', must: 'Find the driver', rows: [{ col1: 'Ask', col2: 'Why', col3: '1', col4: 'Next' }] }, { type: 'node', mode: 'table', title: 'Prices', cols: ['Item'], rows: [{ col1: 'Ale' }] }, { type: 'node', mode: 'table', rows: [{ col1: 'x' }] },
            { type: 'callout', content: '<p>A note</p>' }, { type: 'h2', title: HOSTILE }, { type: 'text', content: '<p>The end.</p>' }, { type: 'flowchart', nodes: [{ id: 'a', label: 'Start' }], edges: [] }] };
        const pTree = toTree(d, plannerPreviewHtml(plan, { id: 'c1', items: {} })), pGot = lines(O.navOutline(pTree));
        const doc = DR.cleanDoc({ id: 'd1', type: 'doc', meta: { title: 'Rules' }, blocks: [{ type: 'h1', title: 'House rules', sub: 'What we agreed' }, { type: 'h2', title: 'At the table', cols: 2 }, { type: 'h3', title: 'Inspiration' }, { type: 'text', content: '<p>Spend it.</p>' },
            { type: 'table', title: 'Travel pace', cols: ['Pace', 'Per hour'], rows: [['Fast', '4 miles']] }, { type: 'table', cols: ['A'], rows: [['b']] }, { type: 'h2', title: HOSTILE }, { type: 'callout', content: '<p>Mind this.</p>' }, { type: 'rule' }] });
        const dTree = toTree(d, DR.renderDoc(doc, {})), dGot = lines(O.navOutline(dTree));
        check('the outline over what the real renderers draw (planner.js plannerPreviewHtml, sliced, and docrender.js renderDoc, each read into the test page): a planner gives its title, its sections and its titled nodes — a scene node and a plain table alike, an untitled one not —, a page its title, its sections, its third-level headings and its titled tables, also where a section sets them in columns; a page\'s heading comes out as the characters it holds, markup and all, and a planner\'s, whose titles read typed markup, as the text the sanitiser left of it: the outline reads the drawn text, never the stored one',
            J(pGot) === J(['1 0 Session 1', '2 2 Beats', '3 3 The inn', '3 4 Prices', '2 7 & "quoted"']) && J(dGot) === J(['1 0 House rules', '2 1 At the table', '3 2 Inspiration', '3 4 Travel pace', '2 6 ' + HOSTILE])
            && pTree.querySelectorAll('.pv-blk').length === plan.blocks.length && dTree.querySelectorAll('.doc-section .pv-blk').length === 4, J([pGot, dGot]));
        real = { p: pTree, d: dTree, hostile: HOSTILE, pv: plannerPreviewHtml };
    }

    /* ---- the menu, run for real on the test page ---- */
    const TIP = 'Outline: the headings of this page. Click one to jump to it.';
    // this computer's storage, as the suite gives it: what is kept, how often it was written, and a store that refuses
    const mkStore = () => { const s = { data: Object.create(null), sets: 0, failRead: false, failWrite: false,
        getItem(k) { if (s.failRead) throw new Error('no storage here'); return k in s.data ? s.data[k] : null; },
        setItem(k, v) { if (s.failWrite) throw new Error('the store is full'); s.sets++; s.data[k] = String(v); } }; return s; };
    // one window of the app: its page, its places, the campaign and the pages it shows (N.camp, N.panelId, N.readerId, changed at will), the
    // storage of the computer it runs on (o.store: two windows of one computer share it) and, with o.observer, a page observer
    const mkNav = o => { o = o || {};
        const dom = makeDom(), doc = dom.document, loc = { search: o.search || '' }, el = {}, obs = [], winOn = {}, store = o.store || mkStore();
        const N = { camp: o.camp === undefined ? { id: 'c1', activeItemId: 'p1' } : o.camp, panelId: o.panelId === undefined ? 'd1' : o.panelId, readerId: o.readerId === undefined ? 'd2' : o.readerId };
        const win = { innerWidth: o.vw || 1000, innerHeight: o.vh || 600, localStorage: store, wpDocPanel: { openId: () => N.panelId }, wpDocReaderOpenId: () => N.readerId, addEventListener: (ev, fn) => { (winOn[ev] = winOn[ev] || []).push(fn); } };
        if (o.observer) win.MutationObserver = function(fn) { this.observe = (target, opts) => { obs.push({ fn: fn, target: target, opts: opts }); }; };
        const add = (parent, tag, id, cls) => { const e = doc.createElement(tag); e.id = id; if (cls) e.className = cls; parent.appendChild(e); el[id] = e; return e; };
        if (!o.popout) [['plannerOutlineBtn', 'plannerPreview'], ['docPanelOutline', 'docPanelBody'], ['docReaderOutline', 'docReaderBody']].forEach((p, i) => { if (o.skip === p[0]) return; add(doc.body, 'button', p[0]).rect = { left: 100 + i * 300, top: 20, right: 180 + i * 300, bottom: 44 }; add(doc.body, 'div', p[1], 'doc-view'); });
        else { const wrap = add(doc.body, 'div', 'popoutWrap'), bar = add(wrap, 'div', 'popoutBar'); add(bar, 'span', 'popoutTitle'); if (!o.noDock) add(bar, 'button', 'popoutDock'); add(wrap, 'div', 'popoutBody'); }
        const api = new Function('document', 'window', 'location', 'setTimeout', 'URLSearchParams', 'getActiveCampaign', "'use strict';\n" + slice('outline') + '\n' + slice('fold') + '\n' + slice('land') + '\n' + slice('menu') + (o.publish ? '\n' + src.slice(src.indexOf('// [pagecheck:menu-end]')) : '')
            + '\nreturn { navWire: navWire, navToggle: navToggle, navClose: navClose, navIsOpen: navIsOpen, navRootOf: navRootOf, menu: function() { return _navMenu; }, from: function() { return _navFrom; }, places: NAV_PLACES,'
            + ' landOf: landOf, land: land, landFold: landFold, landRuns: landRuns, landFind: landFind, landWords: landWords, navFlash: navFlash, navGo: navGo, landCaps: { q: LAND_Q, at: LAND_AT },'
            + ' foldHash: foldHash, navKeyFor: navKeyFor, foldPage: foldPage, foldRead: foldRead, foldGet: foldGet, foldPut: foldPut, foldText: foldText, foldWords: foldWords, foldParts: foldParts, foldApply: foldApply, foldSet: foldSet, foldToggle: foldToggle, foldAll: foldAll, foldReveal: foldReveal, foldStrip: foldStrip,'
            + ' mem: function() { return Object.keys(_foldMem); }, caps: { store: FOLD_STORE, pages: FOLD_PAGES, marks: FOLD_MARKS, total: FOLD_TOTAL } };')(doc, win, loc, dom.setTimeout, URLSearchParams, () => N.camp);
        const page = (root, heads) => { while (root.firstChild) root.removeChild(root.firstChild); const w = mk(dom, 'div', 'wrap', heads.map((h, i) => blk(dom, h.bi === undefined ? i : h.bi, h.tag ? [mk(dom, h.tag, '', [h.text])] : [mk(dom, 'p', '', [h.text])]))); root.appendChild(w); return w; };
        const rows = () => (api.menu() ? api.menu().querySelectorAll('.pagenav-row') : []), heads = root => root.querySelectorAll('.pv-blk').map(b => b.childNodes.filter(c => !(c.nodeType === 1 && c.className === 'pv-fold-btn'))[0]);
        return Object.assign(N, { dom, doc, win, el, api, page, rows, heads, store, obs, press: (b, key) => dom.fire(b, 'click', { detail: key ? 0 : 1 }), shape: () => rows().map(r => r.className + '|' + r.dataset.blk + '|' + r.childNodes.map(c => (c.nodeType === 3 ? 't:' + c.nodeValue : 'e:' + c.nodeName)).join(',')),
            redrawn: root => obs.filter(x => x.target === root).forEach(x => x.fn([])), told: e => (winOn.storage || []).forEach(fn => fn(e)), kept: () => (store.data.wp_pageFolds === undefined ? null : JSON.parse(store.data.wp_pageFolds)) }); };
    const HEADS = [{ tag: 'h1', text: 'Title' }, { tag: null, text: 'prose' }, { tag: 'h2', text: 'Part one' }, { tag: 'h3', text: 'A detail' }, { tag: 'h2', text: 'Part two' }];
    {
        const N = mkNav(); N.api.navWire(); N.page(N.el.plannerPreview, HEADS); N.page(N.el.docPanelBody, [{ tag: 'h1', text: 'Other page' }]);
        const b = N.el.plannerOutlineBtn, wired = ['plannerOutlineBtn', 'docPanelOutline', 'docReaderOutline'].map(id => [N.el[id].getAttribute('aria-haspopup'), N.el[id].getAttribute('aria-expanded'), (N.el[id].handlers.click || []).length]);
        const before = [N.api.menu(), N.doc.getElementById('pageNavMenu')];
        N.press(b); const m = N.api.menu(), open1 = [N.api.navIsOpen(), m.parentNode === N.doc.body, m.id, m.getAttribute('role'), m.style.display, b.getAttribute('aria-expanded'), m.style.left, m.style.top, N.doc.activeElement === N.doc.body], shape1 = N.shape();
        check('the Outline menu, opened by a press (pagenav.js, its menu slice run for real): nothing is made until the first press; the menu is then made once, in the page\'s body, and shown under the button, at the button\'s left edge; it holds one row a heading — a button, its class by the heading\'s level, its block\'s number, its words a text node and nothing else; the button says it is open; a press by the pointer leaves the focus where it was; every place is wired alike',
            J(wired) === J([['menu', 'false', 1], ['menu', 'false', 1], ['menu', 'false', 1]]) && before[0] === null && before[1] === null && J(open1) === J([true, true, 'pageNavMenu', 'menu', 'block', 'true', '100px', '48px', true])
            && J(shape1) === J(['pagenav-row pagenav-lv1|0|t:Title', 'pagenav-row pagenav-lv2|2|t:Part one', 'pagenav-row pagenav-lv3|3|t:A detail', 'pagenav-row pagenav-lv2|4|t:Part two']) && N.rows().every(r => r.getAttribute('role') === 'menuitem' && r.type === 'button' && r.nodeName === 'BUTTON'), J([wired, open1, shape1]));
        const hs = N.heads(N.el.plannerPreview), row = N.rows()[2]; N.dom.fire(row, 'click');
        const went = [hs.map(h => h.calls.filter(c => c === 'scrollIntoView').length), hs[3].classList.contains('pagenav-hit'), N.api.navIsOpen(), m.style.display, b.getAttribute('aria-expanded'), N.api.from(), b.calls.indexOf('focus') < 0]; N.dom.runTimers(); const faded = hs[3].classList.contains('pagenav-hit');
        check('a row pressed: its heading, and no other, is brought into view and lit for a moment; the menu is put away and the button says so; the focus is not moved; the light goes out by itself',
            J(went) === J([[0, 0, 0, 1, 0], true, false, 'none', 'false', null, true]) && faded === false, J([went, faded]));
        N.press(b, true); const keyed = [N.api.navIsOpen(), N.doc.activeElement === N.rows()[0], N.doc.getElementById('pageNavMenu') === m, N.doc.querySelectorAll('#pageNavMenu').length];
        const ring = () => N.api.menu().querySelectorAll('.pagenav-row, .pagenav-act'), foot = ring().slice(4).map(a => a.nodeName + '|' + a.type + '|' + a.className + '|' + a.dataset.act + '|' + a.getAttribute('role') + '|' + a.childNodes.map(c => (c.nodeType === 3 ? 't:' + c.nodeValue : 'e')).join(','));
        const key = k => { const e = N.dom.fire(N.doc.activeElement, 'keydown', { key: k }); return [ring().indexOf(N.doc.activeElement), !!e.defaultPrevented]; };
        const moves = [key('ArrowDown'), key('ArrowDown'), key('End'), key('ArrowDown'), key('ArrowUp'), key('Home'), key('ArrowUp'), key('a')];
        check('the Outline menu, opened from the keyboard: the same menu is used again, and its first row takes the focus; the arrow keys move along the rows and then along Fold all and Open all at the menu\'s foot (two buttons with fixed words, items of the menu like the rows), and wrap round; Home and End go to the ends; each is taken as the menu\'s own; any other key is left alone',
            J(keyed) === J([true, true, true, 1]) && J(moves) === J([[1, true], [2, true], [5, true], [0, true], [5, true], [0, true], [5, true], [5, false]])
            && J(foot) === J(['BUTTON|button|pagenav-act|foldall|menuitem|t:Fold all', 'BUTTON|button|pagenav-act|openall|menuitem|t:Open all']) && ring()[4].parentNode.className === 'pagenav-foot' && ring()[4].parentNode === N.api.menu().lastChild, J([keyed, moves, foot]));
        const esc = N.dom.fire(N.doc.activeElement, 'keydown', { key: 'Escape' }), escaped = [N.api.navIsOpen(), !!esc.defaultPrevented, !!esc.stopped, N.doc.activeElement === b, b.getAttribute('aria-expanded')];
        const esc2 = N.dom.fire(b, 'keydown', { key: 'Escape' }), idle = [!!esc2.defaultPrevented, !!esc2.stopped];
        check('Escape puts the menu away, gives the focus back to its button and goes no further (what is under the menu does not take the same press); with no menu up, Escape is not touched',
            J(escaped) === J([false, true, true, true, 'false']) && J(idle) === J([false, false]), J([escaped, idle]));
        N.press(b); N.press(b); const toggled = [N.api.navIsOpen(), N.doc.activeElement === b];
        N.press(b); const p2 = N.el.docPanelOutline; N.press(p2); const moved = [N.api.navIsOpen(), N.api.from() === p2, b.getAttribute('aria-expanded'), p2.getAttribute('aria-expanded'), N.shape(), N.api.menu().style.left];
        const inMenu = N.dom.fire(N.rows()[0], 'pointerdown'), onBtn = N.dom.fire(p2, 'pointerdown'), still = N.api.navIsOpen(); N.dom.fire(N.el.docPanelBody, 'pointerdown'); const outside = [still, N.api.navIsOpen(), p2.getAttribute('aria-expanded'), p2.calls.indexOf('focus') < 0];
        N.dom.fire(N.el.docPanelBody, 'pointerdown'); const quiet = N.api.navIsOpen();
        check('the button again puts its menu away and keeps the focus; another place\'s button moves the menu there, with that page\'s headings, and the first button no longer says it is open; a press in the menu or on its button leaves it up, a press anywhere else puts it away without taking the focus',
            J(toggled) === J([false, true]) && J(moved) === J([true, true, 'false', 'true', ['pagenav-row pagenav-lv1|0|t:Other page'], '400px']) && J(outside) === J([true, false, 'false', true]) && quiet === false && !inMenu.stopped && !onBtn.stopped, J([toggled, moved, outside]));
    }
    {
        // the page drawn again between the press that opened the menu and the press on a row; a page with no heading; a place that is not on the page
        const N = mkNav({ skip: 'docReaderOutline' }); let err = ''; try { N.api.navWire(); } catch (e) { err = String(e); }
        const b = N.el.plannerOutlineBtn; N.page(N.el.plannerPreview, HEADS); N.press(b); const oldHeads = N.heads(N.el.plannerPreview), row2 = N.rows()[1], row4 = N.rows()[3];
        N.page(N.el.plannerPreview, [{ tag: 'h1', text: 'Title' }, { tag: 'h2', text: 'Part one, renamed', bi: 2 }]); const newHeads = N.heads(N.el.plannerPreview);
        N.dom.fire(row2, 'click'); const again = [oldHeads.map(h => h.calls.length), newHeads.map(h => h.calls.filter(c => c === 'scrollIntoView').length), N.api.navIsOpen()];
        N.press(b); const relisted = N.shape(); N.page(N.el.plannerPreview, [{ tag: 'h1', text: 'Title' }]); let err2 = ''; try { N.dom.fire(N.rows()[1], 'click'); } catch (e) { err2 = String(e); } const gone = [N.heads(N.el.plannerPreview).map(h => h.calls.length), N.api.navIsOpen()];
        N.page(N.el.plannerPreview, [{ tag: null, text: 'no heading here' }]); N.press(b, true); const none = [N.rows().length, N.api.menu().childNodes.map(c => c.className + '|' + c.textContent), N.doc.activeElement === N.api.menu().querySelector('.pagenav-act'), N.api.navIsOpen()];
        N.api.navClose(false); N.page(N.el.plannerPreview, []); N.press(b, true); const bare = [N.api.menu().childNodes.map(c => c.className + '|' + c.textContent), N.doc.activeElement === N.api.menu().querySelector('.pagenav-act'), N.api.menu().querySelectorAll('.pagenav-act').length, N.api.navIsOpen()];
        check('a page drawn again while its menu is up: a row finds its heading again by the block\'s number, so the heading now on the page is the one brought into view, never the one that was drawn before; a row whose block is gone brings nothing into view and throws nothing; opened again, the menu lists the page as it now is; a page with no heading says so in words and puts no row in the menu — its foot still has Fold all and Open all where the page has a part that folds, the first of them taking the focus from the keyboard, and no foot at all where nothing on the page folds; a place that is not on the page is passed over',
            err === '' && J(again) === J([[0, 0, 0, 0, 0], [0, 1], false]) && J(relisted) === J(['pagenav-row pagenav-lv1|0|t:Title', 'pagenav-row pagenav-lv2|2|t:Part one, renamed']) && err2 === '' && J(gone) === J([[0], false])
            && J(none) === J([0, ['pagenav-none|This page has no headings.', 'pagenav-foot|Fold allOpen all'], true, true]) && J(bare) === J([['pagenav-none|This page has no headings.'], false, 0, true]) && row4.dataset.blk === '4', J([err, again, relisted, err2, gone, none, bare]));
    }
    {
        // where the menu is put: under its button, kept inside the window
        const N = mkNav({ vw: 800, vh: 500 }); N.api.navWire(); N.page(N.el.plannerPreview, HEADS); const b = N.el.plannerOutlineBtn;
        N.press(b); N.api.navClose(false); N.api.menu().rect = { left: 0, top: 0, right: 200, bottom: 300 };
        const at = r => { b.rect = r; N.press(b); const m = N.api.menu(), got = [m.style.left, m.style.top]; N.api.navClose(false); return got; };
        const placed = [at({ left: 100, top: 20, right: 180, bottom: 44 }), at({ left: 700, top: 20, right: 780, bottom: 44 }), at({ left: 100, top: 400, right: 180, bottom: 424 }), at({ left: -50, top: 20, right: 30, bottom: 44 })];
        N.win.innerWidth = 150; N.win.innerHeight = 200; const tiny = at({ left: 100, top: 100, right: 140, bottom: 124 });
        check('where the menu is put: under its button and at its left edge; kept inside the window at the right, and as low as it fits where there is no room under the button; never off the left or the top edge, in a window smaller than the menu too',
            J(placed) === J([['100px', '48px'], ['594px', '48px'], ['100px', '194px'], ['6px', '48px']]) && J(tiny) === J(['6px', '6px']), J([placed, tiny]));
    }
    {
        // a page in a window of its own: its bar is built by popout.js, so the button is made here
        const N = mkNav({ popout: true, search: '?popout=doc:c1/p1' }); N.api.navWire();
        const bar = N.el.popoutBar, pb = N.doc.getElementById('popoutOutline'), made = [bar.childNodes.map(c => c.id), pb && pb.nodeName, pb && pb.type, pb && pb.title, pb && pb.childNodes.map(c => (c.nodeType === 3 ? 't:' + c.nodeValue : 'e')), N.doc.querySelectorAll('#popoutOutline').length];
        N.page(N.el.popoutBody, HEADS); N.press(pb); const inWrap = [N.api.menu().parentNode === N.el.popoutWrap, N.api.navIsOpen(), N.rows().length];
        const S = mkNav({ popout: true, search: '?popout=sheet:c1/x' }); S.api.navWire(); const M = mkNav({ popout: true, search: '' }); M.api.navWire(); const C = mkNav({ popout: true, search: '?popout=chat:' }); C.api.navWire();
        const D = mkNav({ popout: true, noDock: true, search: '?popout=doc:c1/p1' }); D.api.navWire();
        check('a page in a window of its own: its Outline button is made once, a button with fixed words and the same tooltip, put before the button that docks the page back (last in the bar where there is none); its menu is made inside that window\'s own wrap, the one thing such a window shows; a sheet\'s window, the chat\'s and a window that is no window of its own get no button',
            J(made) === J([['popoutTitle', 'popoutOutline', 'popoutDock'], 'BUTTON', 'button', TIP, ['t:Outline'], 1]) && J(inWrap) === J([true, true, 4])
            && S.doc.getElementById('popoutOutline') === null && M.doc.getElementById('popoutOutline') === null && C.doc.getElementById('popoutOutline') === null && J(D.el.popoutBar.childNodes.map(c => c.id)) === J(['popoutTitle', 'popoutOutline']), J([made, inWrap]));
    }
    {
        // a heading's text is text: the test page throws on any markup written into it, and the row holds the characters as they are
        const N = mkNav(); N.api.navWire(); const HOSTILE = '<img src=x onerror=alert(1)><script>x</script>" onmouseover="y'; let err = '';
        N.page(N.el.plannerPreview, [{ tag: 'h1', text: HOSTILE }, { tag: 'h2', text: '__proto__' }, { tag: 'h2', text: 'constructor' }]); try { N.press(N.el.plannerOutlineBtn); } catch (e) { err = String(e); }
        check('a heading\'s words in the menu are text: a heading that holds markup is shown as those characters, in one text node, with no element made of them, on a page that refuses any markup written into it; a heading named as a prototype\'s key is a row like any other; the module writes no markup anywhere',
            err === '' && J(N.shape()) === J(['pagenav-row pagenav-lv1|0|t:' + HOSTILE, 'pagenav-row pagenav-lv2|1|t:__proto__', 'pagenav-row pagenav-lv2|2|t:constructor']) && N.api.menu().all().every(e => e.nodeName === 'BUTTON')
            && !/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(src) && ({}).blk === undefined, J([err, N.shape()]));
    }

    /* ---- the folds ---- */
    // the suite's own hash of a text (FNV-1a, 32 bits, over the text's code units), written apart from the module's
    const fnv = s => { let h = 2166136261n; for (let i = 0; i < s.length; i++) { h ^= BigInt(s.charCodeAt(i)); h = (h * 16777619n) & 0xffffffffn; } return h.toString(16).padStart(8, '0'); };
    // a drawn page for the folds: one block an entry, nested as the renderers nest it
    const partOf = (dom, e) => {
        const k = e[0], t = e[1];
        if (k === 'h1' || k === 'h2' || k === 'h3') return [mk(dom, k, '', [t])];
        if (k === 'p') return [mk(dom, 'p', '', t === '' ? [] : [t])];
        if (k === 'node') return [mk(dom, 'div', 'node', [mk(dom, 'h3', '', e[2] ? [t, ' ', mk(dom, 'span', 'tag', [e[2]])] : (t ? [t] : [])), mk(dom, 'p', 'must', ['Must resolve'])])];
        if (k === 'table') return [mk(dom, 'div', 'node plain-table', [mk(dom, 'table', '', t.map((r, ri) => mk(dom, 'tr', '', r.map(c => mk(dom, ri ? 'td' : 'th', '', [c])))))])];
        if (k === 'chart') return [mk(dom, 'div', 'diagram fc-box', [mk(dom, 'pre', 'mermaid', [t || 'graph TD; A-->B'])])];
        if (k === 'fig') return [mk(dom, 'figure', 'doc-img', [mk(dom, 'img', '', [])].concat(t ? [mk(dom, 'figcaption', '', [t])] : []))];
        if (k === 'hr') return [mk(dom, 'hr', 'doc-rule', [])];
        if (k === 'box') return [mk(dom, 'div', 'callout', t ? [t] : [])];
        if (k === 'bare') return [t];
        if (k === 'empty') return [];
        throw new Error('pagecheck: no such part: ' + k);
    };
    const draw = (N, root, spec) => { while (root.firstChild) root.removeChild(root.firstChild); const w = mk(N.dom, 'div', 'wrap', spec.map((e, i) => blk(N.dom, i, partOf(N.dom, e)))); root.appendChild(w); return w; };
    const blocks = root => root.querySelectorAll('.pv-blk'), btnOf = b => b.childNodes.filter(c => c.nodeType === 1 && c.className === 'pv-fold-btn');
    const kid = b => b.childNodes.filter(c => !(c.nodeType === 1 && c.className === 'pv-fold-btn'))[0];   // a block's first drawn child: its arrow, which the folds put first, is passed over
    // a page's folds at a glance: each block's number, S where it is folded, H where a folded heading puts it away, - where it has no arrow
    const stOf = root => blocks(root).map((b, i) => i + (b.classList.contains('pv-fold-shut') ? 'S' : '') + (b.classList.contains('pv-fold-hid') ? 'H' : '') + (btnOf(b).length ? '' : '-')).join(' ');
    // a tree as one text: every element with its class, its data and its attributes, and every text node
    const ser = n => (n.nodeType === 3 ? J(n.nodeValue) : '<' + n.nodeName + '.' + n.className + J(n.dataset) + J(n.attrs) + '>' + n.childNodes.map(ser).join('') + '</>');
    const PAGE = [['h1', 'Title'], ['p', 'Lead text'], ['h2', 'Beats'], ['node', 'The inn', 'social'], ['table', [['Item', 'Price'], ['Ale', '2 cp']]], ['h3', 'Detail'], ['p', 'Under detail'], ['hr'], ['h2', 'Empty section'], ['h2', 'Charts'],
        ['chart'], ['chart'], ['fig', 'A map'], ['fig', null], ['empty'], ['p', ''], ['bare', 'just words'], ['box', ''], ['p', 'Lead text'], ['h2', 'Beats']];
    const OPEN = '0- 1 2 3 4 5 6 7- 8- 9 10 11 12 13 14- 15- 16 17 18 19-';
    {
        const N = mkNav(), root = N.el.plannerPreview; draw(N, root, PAGE);
        const got = N.api.foldParts(root), line = p => p.at + ' ' + p.kind + ' ' + p.level + ' ' + p.holds + ' ' + p.words;
        const want = ['1 body 0 0 Lead text', '2 head 2 4 Beats', '3 body 0 0 The inn', '4 body 0 0 Item Price Ale 2 cp', '5 head 3 1 Detail', '6 body 0 0 Under detail', '9 head 2 7 Charts', '10 body 0 0 Chart', '11 body 0 0 Chart', '12 body 0 0 A map', '13 body 0 0 Picture', '16 body 0 0 just words', '17 body 0 0 Folded', '18 body 0 0 Lead text'];
        const bases = ['b:Lead text', 'h2:Beats', 'b:The inn', 'b:Item Price Ale 2 cp', 'h3:Detail', 'b:Under detail', 'h2:Charts', 'b:Chart', 'b:Chart#2', 'b:A map', 'b:Picture', 'b:just words', 'b:Folded', 'b:Lead text#2'];
        check('what folds on a drawn page (pagenav.js, its fold slice run for real): a heading folds what stands under it, down to the next heading of its level or a higher one, and counts the parts it holds — a rule, an empty box and a paragraph with no words are no part; every other block folds itself and goes by its own words: a node or a titled table by its title without its tag, a plain table by its cells with a space between them, a chart as Chart, a picture by its caption or as Picture, bare text by its words, an empty box that still draws as Folded; the page\'s one title folds nothing, and neither does a heading with nothing under it; each part\'s mark is a short hash of what it is and its words, a second part of the same words numbered',
            J(got.parts.map(line)) === J(want) && J(got.parts.map(p => p.mark)) === J(bases.map(fnv)) && J(got.levels) === J([1, 0, 2, 0, 0, 3, 0, 0, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2]) && got.blocks.length === 20 && got.parts.every(p => /^[0-9a-f]{8}$/.test(p.mark)) && new Set(got.parts.map(p => p.mark)).size === 14
            && N.api.foldHash('') === '811c9dc5' && N.api.foldHash('a') === 'e40c292c' && N.api.foldHash('h2:Bëats 😀') === fnv('h2:Bëats 😀') && N.api.foldHash('h2:Part 218') === '011c9dcd' && N.api.foldHash('h2:Part 219') === '001c9c3a', J([got.parts.map(line), got.levels]));
        const Z = mkNav(), rz = Z.el.plannerPreview; draw(Z, rz, [['h2', 'Part 218'], ['p', 'x'], ['h2', 'Part 219'], ['p', 'y']]); Z.api.foldApply(rz); const zr = [Z.api.foldToggle(rz, blocks(rz)[0]), Z.api.foldToggle(rz, blocks(rz)[2])];
        const Y = mkNav(), ry = Y.el.plannerPreview; draw(Y, ry, [['h2', 'A'], ['h3', 'B'], ['p', 'x'], ['h3', 'C'], ['p', 'y'], ['h2', 'D'], ['p', 'z']]); Y.api.foldApply(ry); Y.api.foldToggle(ry, blocks(ry)[0]); Y.api.foldToggle(ry, blocks(ry)[1]); const inA = stOf(ry); Y.api.foldToggle(ry, blocks(ry)[0]); const outA = stOf(ry);
        check('a mark is always eight characters, a hash that begins with zeros too, so a part whose hash does folds like any other; a folded heading inside a folded section ends at the next heading of its own level, which stays put away with the section around it and shows again when that section opens',
            J(zr) === J([true, true]) && stOf(rz) === '0S 1H 2S 3H' && J(Z.kept().pages[fnv('c1/p1')].m) === J(['011c9dcd', '001c9c3a']) && inA === '0S 1SH 2H 3H 4H 5 6' && outA === '0 1S 2H 3 4 5 6', J([zr, stOf(rz), Z.kept(), inA, outA]));
        const two = mkNav(), r2 = two.el.plannerPreview; draw(two, r2, [['h1', 'One'], ['p', 'a'], ['h1', 'Two'], ['p', 'b'], ['h2', 'Sub'], ['p', 'c'], ['h3', 'Last'], ['hr'], ['p', '']]);
        const moved = mkNav(), r3 = moved.el.plannerPreview; draw(moved, r3, [['p', 'New first'], ['h2', 'A new section']].concat(PAGE.slice(0, 5)).concat([['p', 'In between']]).concat(PAGE.slice(5, 9)).concat([['h2', 'Charts, renamed']]).concat(PAGE.slice(10)));
        const m0 = Object.create(null), m1 = Object.create(null); got.parts.forEach(p => { m0[p.kind + ':' + p.words + ':' + p.at] = p.mark; }); moved.api.foldParts(r3).parts.forEach(p => { m1[p.kind + ':' + p.words] = (m1[p.kind + ':' + p.words] || []).concat(p.mark); });
        const nest = mkNav(), r4 = nest.el.plannerPreview; r4.appendChild(mk(nest.dom, 'div', 'wrap', [blk(nest.dom, 0, [mk(nest.dom, 'div', 'raw', [blk(nest.dom, 1, [mk(nest.dom, 'p', '', ['inner'])])])]), mk(nest.dom, 'div', 'doc-section doc-cols-2', [blk(nest.dom, 2, [mk(nest.dom, 'p', '', ['in a column'])])])]));
        check('a page with more than one title folds by its titles too, each down to the next; a heading with only a rule and an empty paragraph under it folds nothing, though the section around it counts it as something it holds; a part keeps its mark when blocks are added before it, between and after, a heading given other words gets another mark, and a section that gains a part counts it; a block drawn inside a block is no part of its own, a block inside a section\'s columns is',
            J(two.api.foldParts(r2).parts.map(p => p.at + ' ' + p.kind + ' ' + p.level + ' ' + p.holds)) === J(['0 head 1 1', '1 body 0 0', '2 head 1 4', '3 body 0 0', '4 head 2 2', '5 body 0 0'])
            && m1['head:Beats'][0] === m0['head:Beats:2'] && m1['body:The inn'][0] === m0['body:The inn:3'] && m1['head:Detail'][0] === m0['head:Detail:5'] && J(m1['body:Lead text']) === J([m0['body:Lead text:1'], m0['body:Lead text:18']]) && J(m1['body:Chart']) === J([m0['body:Chart:10'], m0['body:Chart:11']])
            && m1['head:Charts'] === undefined && m1['head:Charts, renamed'][0] === fnv('h2:Charts, renamed') && moved.api.foldParts(r3).parts.filter(p => p.words === 'Beats')[0].holds === 5
            && J(nest.api.foldParts(r4).parts.map(p => p.at + ' ' + p.words)) === J(['0 inner', '1 in a column']), J([two.api.foldParts(r2).parts.map(p => p.at + ' ' + p.kind + ' ' + p.level + ' ' + p.holds), m1, nest.api.foldParts(r4).parts]));
        const long = 'w'.repeat(119) + '😀' + 'tail', W = mkNav(), d = W.dom;
        const lower = mk(d, 'style', '', ['g{fill:red}']); lower.nodeName = 'style';
        const odd = blk(d, 9, [mk(d, 'style', '', ['p{color:red}']), mk(d, 'script', '', ['run()']), lower, mk(d, 'p', '', ['One', mk(d, 'br', '', []), 'two ', mk(d, 'b', '', ['th']), 'ree']), mk(d, 'ul', '', [mk(d, 'li', '', ['four']), mk(d, 'li', '', ['five'])]), mk(d, 'button', 'pv-fold-btn', ['ARROW'])]);
        const far = blk(d, 10, [mk(d, 'p', '', [' '.repeat(1989) + 'abcdefghi' + '😀' + 'zz']), mk(d, 'p', '', ['never read'])]);
        check('a part\'s own words: its text with a space where a line, a cell or a list item ends and none inside a word that changes its look, white space folded, cut at 120 characters and never through a character; never a style sheet\'s, a script\'s or its own arrow\'s; only the block\'s first two thousand characters are read, and a character cut in two by that is dropped',
            W.api.foldText(blk(d, 0, [mk(d, 'p', '', [long])])) === 'w'.repeat(119) + '😀' && W.api.foldText(odd) === 'One two three four five' && W.api.foldText(far) === 'abcdefghi' && W.api.foldText(blk(d, 1, [])) === ''
            && W.api.foldWords(blk(d, 2, partOf(d, ['node', '', null]))) === 'Must resolve' && W.api.foldWords(blk(d, 3, partOf(d, ['chart', 'graph LR; words-->here']))) === 'Chart' && W.api.foldWords(blk(d, 4, [mk(d, 'div', 'diagrams', ['not a chart'])])) === 'not a chart',
            J([W.api.foldText(odd), W.api.foldText(far), W.api.foldWords(blk(d, 2, partOf(d, ['node', '', null])))]));
    }
    {
        // drawn, and drawn again
        const N = mkNav(), root = N.el.plannerPreview, B = () => blocks(root); draw(N, root, PAGE); const asDrawn = ser(root), marks = Object.create(null); N.api.foldParts(root).parts.forEach(p => { marks[p.at] = p.mark; });
        const out0 = J(lines(O.navOutline(root))); N.api.foldApply(root); const s0 = stOf(root), b0 = B().map(b => btnOf(b)[0] || null), ser0 = ser(root), out1 = J(lines(O.navOutline(root)));
        const shapes = B().map((b, i) => { const a = b0[i]; return b.className + '|' + (b.dataset.fold !== undefined && b.dataset.fold === marks[i] ? 'm' : '') + (b.dataset.fold === undefined ? 'u' : '') + (b.dataset.foldHint === undefined ? '' : 'HINT') + '|' + (a ? [a === b.firstChild, a.nodeName, a.type, a.childNodes.length, a.dataset.tip, a.hasAttribute('title'), a.getAttribute('aria-label'), a.getAttribute('aria-expanded'), a.getAttribute('tabindex')].join(',') : '-'); });
        const head = 'pv-blk pv-fold-head|m|true,BUTTON,button,0,Fold this section,false,Fold this section,true,', body = 'pv-blk pv-fold-body|m|true,BUTTON,button,0,Fold this part,false,Fold this part,true,-1', none = 'pv-blk|u|-';
        N.api.foldApply(root); N.api.foldApply(root); const b1 = B().map(b => btnOf(b)[0] || null);
        check('the folds drawn on a page with nothing folded (foldApply): every part that folds gets one arrow, a button with no text that is the first thing in its block, its tooltip in data-tip and never in title, saying what a press does and that the part is open; a section\'s arrow is in the keyboard\'s order, a part\'s is not; the block carries its kind and its mark; a block that does not fold is left exactly as drawn; the page\'s box is marked; nothing is written to this computer; drawn again, nothing changes and no second arrow is made; the Outline reads the page with its arrows exactly as it read it without them',
            s0 === OPEN && out1 === out0 && JSON.parse(out0).length === 7 && J(shapes) === J([none, body, head, body, body, head, body, none, none, head, body, body, body, body, none, none, body, body, body, none]) && root.className === 'doc-view pv-folds' && ser(root) === ser0 && b1.every((a, i) => a === b0[i]) && root.querySelectorAll('.pv-fold-btn').length === 14
            && N.store.sets === 0 && N.kept() === null && asDrawn !== ser0, J([s0, shapes]));
        const t = i => N.api.foldToggle(root, B()[i]), a = i => btnOf(B()[i])[0];
        const r1 = t(2), s1 = stOf(root), h1 = [B()[2].dataset.foldHint, a(2).getAttribute('aria-expanded'), a(2).dataset.tip, a(2).getAttribute('aria-label'), B()[2].className, B()[7].className, B()[3].className, a(2) === b0[2]], kept1 = N.kept();
        const r2 = t(5), s2 = stOf(root), r3 = t(2), s3 = stOf(root), h3 = [B()[5].dataset.foldHint, B()[2].dataset.foldHint, a(2).getAttribute('aria-expanded'), a(2).dataset.tip];
        const r4 = t(4), s4 = stOf(root), h4 = [B()[4].dataset.foldHint, B()[4].className, a(4).dataset.tip, a(4).getAttribute('aria-expanded')], kept4 = N.kept();
        t(5); t(4); const s5 = stOf(root), kept5 = N.kept(), ser5 = ser(root);
        B()[1].dataset.fold = 'not-a-mark'; const bad = [N.api.foldToggle(root, B()[1]), N.api.foldToggle(root, B()[0]), N.api.foldToggle(root, null), N.api.foldToggle(null, B()[2]), stOf(root), N.store.sets];
        check('a part folded and opened (foldToggle): a folded heading puts away every block under it down to the next heading of its level or a higher one — a rule among them — and says how many parts it holds; a heading that is itself put away can be folded, and stays folded when the section around it is opened; a folded part goes by its own words; the arrow says the part is folded and what a press does now; what is folded is kept on this computer as marks under a hash of the campaign and the page, and nothing is kept for a page with nothing folded; a block whose mark is no mark, a block that does not fold, no block and no page fold nothing',
            r1 === true && s1 === '0- 1 2S 3H 4H 5H 6H 7H- 8- 9 10 11 12 13 14- 15- 16 17 18 19-' && J(h1) === J(['4 parts folded', 'false', 'Open this section', 'Open this section', 'pv-blk pv-fold-head pv-fold-shut', 'pv-blk pv-fold-hid', 'pv-blk pv-fold-body pv-fold-hid', true])
            && J(kept1) === J({ v: 1, seq: 1, pages: { [fnv('c1/p1')]: { t: 1, m: [fnv('h2:Beats')] } } })
            && r2 === true && s2 === '0- 1 2S 3H 4H 5SH 6H 7H- 8- 9 10 11 12 13 14- 15- 16 17 18 19-' && r3 === true && s3 === '0- 1 2 3 4 5S 6H 7H- 8- 9 10 11 12 13 14- 15- 16 17 18 19-' && J(h3) === J(['1 part folded', undefined, 'true', 'Fold this section'])
            && r4 === true && s4 === '0- 1 2 3 4S 5S 6H 7H- 8- 9 10 11 12 13 14- 15- 16 17 18 19-' && J(h4) === J(['Item Price Ale 2 cp', 'pv-blk pv-fold-body pv-fold-shut', 'Open this part', 'false']) && J(kept4) === J({ v: 1, seq: 4, pages: { [fnv('c1/p1')]: { t: 4, m: [fnv('h3:Detail'), fnv('b:Item Price Ale 2 cp')] } } })
            && s5 === OPEN && J(kept5) === J({ v: 1, seq: 6, pages: {} }) && ser5 === ser0 && J(bad) === J([false, false, false, false, OPEN, 6]), J([s1, h1, kept1, s2, s3, h3, s4, h4, kept4, s5, kept5, bad]));
        const L = mkNav({ camp: { id: 'camp-one', activeItemId: 'page-one' } }), rl = L.el.plannerPreview; draw(L, rl, [['h2', 'A secret heading'], ['p', 'x'.repeat(100)], ['p', 'short'], ['p', 'y'.repeat(79) + '😀tail'], ['p', 'z'.repeat(80)]]); L.api.foldApply(rl);
        L.api.foldToggle(rl, blocks(rl)[0]); L.api.foldToggle(rl, blocks(rl)[1]); const raw = L.store.data.wp_pageFolds; L.api.foldToggle(rl, blocks(rl)[3]); L.api.foldToggle(rl, blocks(rl)[4]);
        check('a folded part\'s word is cut at 80 characters with an ellipsis, never through a character, and a word of exactly 80 is left whole; what this computer keeps of a page is a list of hashes: no word of the page, and neither the campaign\'s name nor the page\'s',
            blocks(rl)[1].dataset.foldHint === 'x'.repeat(80) + '…' && blocks(rl)[0].dataset.foldHint === '4 parts folded' && blocks(rl)[3].dataset.foldHint === 'y'.repeat(79) + '😀…' && blocks(rl)[4].dataset.foldHint === 'z'.repeat(80)
            && raw === J({ v: 1, seq: 2, pages: { [fnv('camp-one/page-one')]: { t: 2, m: [fnv('h2:A secret heading'), fnv('b:' + 'x'.repeat(100))] } } }) && !/secret|heading|xxx|camp-one|page-one|short/.test(raw), raw);
    }
    {
        // as you left it; one page, one set of folds
        const store = mkStore(), A = mkNav({ store: store }), ra = A.el.plannerPreview; draw(A, ra, PAGE); A.api.foldApply(ra); A.api.foldToggle(ra, blocks(ra)[9]); A.api.foldToggle(ra, blocks(ra)[1]);
        const left = stOf(ra), LEFT = '0- 1S 2 3 4 5 6 7- 8- 9S 10H 11H 12H 13H 14H- 15H- 16H 17H 18H 19-';
        const Bn = mkNav({ store: store }), rb = Bn.el.plannerPreview; draw(Bn, rb, PAGE); const before = stOf(rb); Bn.api.navWire(); const again = stOf(rb), mem = Bn.api.mem().length;
        Bn.camp = { id: 'c1', activeItemId: 'p2' }; Bn.api.foldApply(rb); const other = stOf(rb); Bn.camp = { id: 'c2', activeItemId: 'p1' }; Bn.api.foldApply(rb); const otherCamp = stOf(rb); Bn.camp = { id: 'c1', activeItemId: 'p1' }; Bn.api.foldApply(rb); const back = stOf(rb);
        check('a page opens as you left it: the app started again on the same computer, with nothing in memory, draws the page with the same parts folded — at once for a page already drawn when the folds are wired; another page, and the same page of another campaign, have folds of their own',
            left === LEFT && before === PAGE.map((e, i) => i + '-').join(' ') && again === LEFT && mem === 0 && other === OPEN && otherCamp === OPEN && back === LEFT, J([left, before, again, other, otherCamp, back]));
        const Pr = mkNav(), rq = Pr.el.plannerPreview, renamed = PAGE.map((e, i) => (i === 2 ? ['h2', 'Beats!'] : e)), mOf = () => J(Pr.kept().pages[fnv('c1/p1')].m), redo = spec => { draw(Pr, rq, spec); Pr.api.foldApply(rq); return stOf(rq); };
        redo(PAGE); Pr.api.foldToggle(rq, blocks(rq)[2]); Pr.api.foldToggle(rq, blocks(rq)[9]);
        const sprung = [redo(renamed), mOf()], backAgain = redo(PAGE); redo(renamed); Pr.api.foldToggle(rq, blocks(rq)[1]); const let_go = mOf(), gone = redo(PAGE);
        check('a fold belongs to a part with those words: a heading given other words is drawn open, and is folded again if its words come back before anything else is folded; the next fold made on the page lets go of every mark that is on no part of the page as it is drawn, so a part that comes back later comes back open',
            J(sprung) === J(['0- 1 2 3 4 5 6 7- 8- 9S 10H 11H 12H 13H 14H- 15H- 16H 17H 18H 19-', J([fnv('h2:Beats'), fnv('h2:Charts')])]) && backAgain === '0- 1 2S 3H 4H 5H 6H 7H- 8- 9S 10H 11H 12H 13H 14H- 15H- 16H 17H 18H 19-'
            && let_go === J([fnv('h2:Charts'), fnv('b:Lead text')]) && gone === '0- 1S 2 3 4 5 6 7- 8- 9S 10H 11H 12H 13H 14H- 15H- 16H 17H 18H 19-', J([sprung, backAgain, let_go, gone]));
        const K = mkNav({ camp: { id: 'cA', activeItemId: 'pA' }, panelId: 'pB', readerId: 'pC' }), keys = ['plannerPreview', 'docPanelBody', 'docReaderBody', 'popoutBody', 'elsewhere', undefined].map(id => K.api.navKeyFor(id));
        const pop = s => mkNav({ popout: true, search: s, camp: { id: 'zz', activeItemId: 'zz' } }).api.navKeyFor('popoutBody'), pops = [pop('?popout=doc:cA/pA'), pop('?popout=doc%3AcA%2FpA'), pop('?popout=doc:c%20A/p%2FA'), pop('?popout=sheet:cA/x'), pop('?popout=chat:'), pop('?popout=doc:'), pop('')];
        const hashOf = (camp, id) => { K.camp = camp; K.panelId = id; return [K.api.foldPage(K.el.plannerPreview), K.api.foldPage(K.el.docPanelBody)]; };
        const named = hashOf({ id: 'cA', activeItemId: 'pA' }, 'pB'), odd = [hashOf(null, 'pB'), hashOf({ activeItemId: 'pA' }, 'pB'), hashOf({ id: 7, activeItemId: 'pA' }, 'pB'), hashOf({ id: 'cA', activeItemId: null }, null), hashOf({ id: 'cA', activeItemId: 5 }, 9), hashOf({ id: '', activeItemId: 'pA' }, '')];
        Object.defineProperty(K, 'camp', { get() { throw new Error('no campaign can be read'); } }); const thrown = [K.api.foldPage(K.el.plannerPreview), K.api.foldPage(null), K.api.foldPage({})];
        check('the page a place shows, by which its folds are kept: the planner\'s own view shows the campaign\'s open item, the panel over the map the page it was opened on, the reader the page it reads, and a window of its own the campaign and the page of its address as the browser decodes it — one page has one key wherever it is read; a sheet\'s window, the chat\'s, an address with no page, a place the app does not know, no campaign, a campaign with no id and a page id that is no text have none, and a campaign that cannot be read throws nothing',
            J(keys) === J(['cA/pA', 'cA/pB', 'cA/pC', '', '', '']) && J(pops) === J(['cA/pA', 'cA/pA', 'c A/p/A', '', '', '', '']) && J(named) === J([fnv('cA/pA'), fnv('cA/pB')]) && odd.every(o => J(o) === J(['', ''])) && J(thrown) === J(['', '', '']), J([keys, pops, named, odd, thrown]));
        const T = mkNav({ panelId: 'p1' }), rp = T.el.plannerPreview, rd = T.el.docPanelBody, rr = T.el.docReaderBody; [rp, rd, rr].forEach(r => { draw(T, r, PAGE); T.api.foldApply(r); });
        T.api.foldToggle(rd, blocks(rd)[2]); const both = [stOf(rp), stOf(rd), stOf(rr)]; T.api.foldAll(rp, false); const both2 = [stOf(rp), stOf(rd), stOf(rr)];
        const X = mkNav({ store: store }), Y = mkNav({ store: store }), rx = X.el.plannerPreview, ry = Y.el.plannerPreview; draw(X, rx, PAGE); draw(Y, ry, PAGE); X.api.navWire(); Y.api.navWire();
        X.api.foldToggle(rx, blocks(rx)[9]); const lag = stOf(ry); Y.told({ key: 'wp_profile' }); const deaf = stOf(ry); Y.told({ key: 'wp_pageFolds' }); const heard = stOf(ry);
        X.api.foldToggle(rx, blocks(rx)[1]); Y.told({ key: null }); const cleared = stOf(ry); Y.api.foldToggle(ry, blocks(ry)[2]); const one = [stOf(ry), J(Y.kept().pages[fnv('c1/p1')].m)];
        check('one page has one set of folds on this computer: folded in the panel over the map, it is folded at once in the planner\'s own view of the same page, and a place that shows another page is left alone; a second window of the app follows when the first folds or opens something (the storage event for the folds\' own key, or for a store that was cleared, never another key\'s), so a press there changes one part and nothing else',
            J(both) === J(['0- 1 2S 3H 4H 5H 6H 7H- 8- 9 10 11 12 13 14- 15- 16 17 18 19-', '0- 1 2S 3H 4H 5H 6H 7H- 8- 9 10 11 12 13 14- 15- 16 17 18 19-', OPEN]) && J(both2) === J([OPEN, OPEN, OPEN])
            && lag === LEFT && deaf === LEFT && heard === '0- 1S 2 3 4 5 6 7- 8- 9 10 11 12 13 14- 15- 16 17 18 19-' && cleared === OPEN && J(one) === J(['0- 1 2S 3H 4H 5H 6H 7H- 8- 9 10 11 12 13 14- 15- 16 17 18 19-', J([fnv('h2:Beats')])]), J([both, both2, lag, deaf, heard, cleared, one]));
    }
    {
        // a page that cannot be named, and a computer that keeps nothing
        const N = mkNav({ camp: null }), rp = N.el.plannerPreview, rd = N.el.docPanelBody; draw(N, rp, PAGE); draw(N, rd, PAGE); N.api.navWire();
        const r = N.api.foldToggle(rp, blocks(rp)[2]), s = [stOf(rp), stOf(rd), N.store.sets, N.kept(), J(N.api.mem())]; draw(N, rp, PAGE); N.api.foldApply(rp); const redrawn = stOf(rp); N.api.foldAll(rp, false); const opened = [stOf(rp), J(N.api.mem()), N.store.sets];
        const F = mkNav({ panelId: 'p1' }), fp = F.el.plannerPreview, fd = F.el.docPanelBody; draw(F, fp, PAGE); draw(F, fd, PAGE); F.api.navWire(); F.store.failWrite = true;
        let err = ''; try { F.api.foldToggle(fp, blocks(fp)[2]); } catch (e) { err = String(e); } const full = [stOf(fp), stOf(fd), F.kept(), J(F.api.mem())]; draw(F, fp, PAGE); F.api.foldApply(fp); const fullAgain = stOf(fp);
        F.store.failWrite = false; F.api.foldToggle(fd, blocks(fd)[1]); const healed = [stOf(fp), stOf(fd), J(F.kept().pages[fnv('c1/p1')].m), J(F.api.mem())];
        F.store.failRead = true; let err2 = ''; try { F.api.foldApply(fp); F.api.foldToggle(fp, blocks(fp)[9]); } catch (e) { err2 = String(e); } const blind = [stOf(fp), J(F.api.mem())];
        check('a page that cannot be named (no campaign) still folds: this window remembers it by the place that shows it, through a redraw, writes nothing to this computer, and another place is left alone; a computer that cannot keep anything (a full store, no storage) throws nothing — this window remembers the page by itself, wherever it shows it, and once the store takes a write again everything is kept there and nothing by the window',
            r === true && J(s) === J(['0- 1 2S 3H 4H 5H 6H 7H- 8- 9 10 11 12 13 14- 15- 16 17 18 19-', OPEN, 0, null, J(['?plannerPreview'])]) && redrawn === s[0] && J(opened) === J([OPEN, J(['?plannerPreview']), 0])
            && err === '' && J(full) === J([s[0], s[0], null, J([fnv('c1/p1')])]) && fullAgain === s[0] && J(healed) === J(['0- 1S 2S 3H 4H 5H 6H 7H- 8- 9 10 11 12 13 14- 15- 16 17 18 19-', '0- 1S 2S 3H 4H 5H 6H 7H- 8- 9 10 11 12 13 14- 15- 16 17 18 19-', J([fnv('h2:Beats'), fnv('b:Lead text')]), '[]'])
            && err2 === '' && J(blind) === J(['0- 1 2 3 4 5 6 7- 8- 9S 10H 11H 12H 13H 14H- 15H- 16H 17H 18H 19-', J([fnv('c1/p1')])]), J([s, redrawn, opened, err, full, fullAgain, healed, err2, blind]));
    }

    {
        // Fold all and Open all
        const N = mkNav(), root = N.el.plannerPreview, B = () => blocks(root); draw(N, root, PAGE); N.api.navWire(); N.api.foldToggle(root, B()[4]);
        N.api.foldAll(root, true); const all = stOf(root), keptAll = N.kept().pages[fnv('c1/p1')].m; N.api.foldAll(root, true); const twice = [stOf(root), N.kept().pages[fnv('c1/p1')].m.length];
        N.api.foldAll(root, false); const none = stOf(root), keptNone = N.kept();
        const b = N.el.plannerOutlineBtn, act = w => N.api.menu().querySelectorAll('.pagenav-act').filter(a => a.dataset.act === w)[0];
        N.press(b); N.dom.fire(act('foldall'), 'click'); const byMenu = [stOf(root), N.api.navIsOpen(), b.getAttribute('aria-expanded'), B().map(kid).filter(x => x && x.calls && x.calls.filter(c => c === 'scrollIntoView').length).length];
        N.press(b); N.dom.fire(act('openall'), 'click'); const byMenu2 = [stOf(root), N.api.navIsOpen()];
        const P = mkNav(), rp = P.el.plannerPreview; draw(P, rp, [['p', 'a'], ['p', 'b'], ['hr'], ['chart']]); P.api.foldAll(rp, true); const plain = stOf(rp); P.api.foldAll(rp, false); const plain2 = stOf(rp);
        const T = mkNav(), rt = T.el.plannerPreview; draw(T, rt, [['h1', 'Only a title'], ['p', 'a'], ['p', 'b']]); T.api.foldAll(rt, true); const titled = stOf(rt);
        const M = mkNav(), rm = M.el.plannerPreview, many = []; for (let i = 0; i < 450; i++) many.push(['p', 'part ' + i]); draw(M, rm, many); M.api.foldAll(rm, true);
        const capped = [M.kept().pages[fnv('c1/p1')].m.length, blocks(rm).filter(x => x.classList.contains('pv-fold-shut')).length, blocks(rm)[399].classList.contains('pv-fold-shut'), blocks(rm)[400].classList.contains('pv-fold-shut')];
        check('Fold all folds every heading that folds — the sections inside a folded section too, so each opens to its own headings — and keeps what was folded by hand; a second press changes nothing; Open all leaves nothing folded and nothing kept for the page; both are at the foot of the Outline menu, where a press puts the menu away and scrolls nowhere; on a page with no heading that folds (none, or only its title) Fold all folds every part; at most 400 parts of a page are kept folded',
            all === '0- 1 2S 3H 4SH 5SH 6H 7H- 8- 9S 10H 11H 12H 13H 14H- 15H- 16H 17H 18H 19-' && J(keptAll) === J(['b:Item Price Ale 2 cp', 'h2:Beats', 'h3:Detail', 'h2:Charts'].map(fnv)) && J(twice) === J([all, 4]) && none === OPEN && J(keptNone.pages) === '{}'
            && J(byMenu) === J(['0- 1 2S 3H 4H 5SH 6H 7H- 8- 9S 10H 11H 12H 13H 14H- 15H- 16H 17H 18H 19-', false, 'false', 0]) && J(byMenu2) === J([OPEN, false])
            && plain === '0S 1S 2- 3S' && plain2 === '0 1 2- 3' && titled === '0- 1S 2S' && J(capped) === J([400, 400, true, false]) && N.api.caps.marks === 400, J([all, keptAll, twice, none, byMenu, byMenu2, plain, plain2, titled, capped]));
    }
    {
        // Find and the Outline open what they lead to
        const N = mkNav(), root = N.el.plannerPreview, B = () => blocks(root); draw(N, root, PAGE); N.api.navWire(); [2, 5, 6, 9, 12].forEach(i => N.api.foldToggle(root, B()[i]));
        const s0 = stOf(root), sets0 = N.store.sets, hit = kid(B()[6]);
        const r1 = N.api.foldReveal(root, hit, false), s1 = stOf(root), sets1 = N.store.sets, r2 = N.api.foldReveal(root, hit, false), sets2 = N.store.sets;
        [2, 5].forEach(i => N.api.foldToggle(root, B()[i])); const h3 = kid(B()[5]);
        const r3 = N.api.foldReveal(root, h3, false), s3 = stOf(root), r4 = N.api.foldReveal(root, h3, true), s4 = stOf(root); N.api.foldToggle(root, B()[2]);   // the section before is folded again: nothing below may open it
        const cap = kid(B()[12]).childNodes[1], r5 = N.api.foldReveal(root, cap, false), s5 = stOf(root), r6 = N.api.foldReveal(root, kid(B()[8]), false), s6 = stOf(root), r7 = N.api.foldReveal(root, kid(B()[9]), true), s7 = stOf(root);
        const other = N.el.docPanelBody; draw(N, other, PAGE);
        const noes = [N.api.foldReveal(root, null, false), N.api.foldReveal(null, hit, false), N.api.foldReveal(root, root, false), N.api.foldReveal(root, kid(blocks(other)[6]), false), N.api.foldReveal(root, hit.childNodes[0], false), N.api.foldReveal(root, kid(B()[0]), true)];
        const where = [N.api.navRootOf(hit) === root, N.api.navRootOf(blocks(other)[3]) === other, N.api.navRootOf(N.el.plannerOutlineBtn), N.api.navRootOf(null), N.api.navRootOf(hit.childNodes[0])];
        const S5 = '0- 1 2S 3H 4H 5H 6H 7H- 8- 9 10 11 12 13 14- 15- 16 17 18 19-';
        check('what leads into a folded part opens it (foldReveal): a hit inside a folded text under a folded heading under a folded section opens all three, and no other fold — a section elsewhere and a part in it stay folded; done again it changes nothing and writes nothing; a hit in a folded heading\'s own words opens the sections around it and leaves its own folded, while the Outline, which jumps to a heading, opens that heading\'s own section too; a hit in a folded part\'s words opens the part and the section it lies in, never a folded section that ends before it, and neither does a hit in the next heading of that section\'s level; nothing to open, no element, an element of another place, an element outside every block and a text node open nothing; an element\'s place is the box its page is drawn in',
            s0 === '0- 1 2S 3H 4H 5SH 6SH 7H- 8- 9S 10H 11H 12SH 13H 14H- 15H- 16H 17H 18H 19-' && r1 === true && s1 === '0- 1 2 3 4 5 6 7- 8- 9S 10H 11H 12SH 13H 14H- 15H- 16H 17H 18H 19-' && sets1 === sets0 + 1 && r2 === false && sets2 === sets1
            && r3 === true && s3 === '0- 1 2 3 4 5S 6H 7H- 8- 9S 10H 11H 12SH 13H 14H- 15H- 16H 17H 18H 19-' && r4 === true && s4 === s1
            && r5 === true && s5 === S5 && r6 === false && s6 === S5 && r7 === false && s7 === S5
            && J(noes) === J([false, false, false, false, false, false]) && J(where) === J([true, true, null, null, null]), J([s0, r1, s1, r2, r3, s3, r4, s4, r5, s5, r6, s6, noes, where]));
        // the Outline's row for a heading that is put away
        N.api.foldAll(root, false); [2, 5].forEach(i => N.api.foldToggle(root, B()[i])); const folded = stOf(root); N.press(N.el.plannerOutlineBtn); const listed = N.shape();
        N.dom.fire(N.rows().filter(r => r.dataset.blk === '5')[0], 'click'); const went = [stOf(root), kid(B()[5]).calls.filter(c => c === 'scrollIntoView').length, kid(B()[5]).classList.contains('pagenav-hit'), N.api.navIsOpen()]; N.dom.runTimers();
        const X = mkNav(), rx = X.el.plannerPreview; rx.appendChild(mk(X.dom, 'div', 'wrap', [blk(X.dom, 0, [mk(X.dom, 'div', 'raw', [blk(X.dom, 1, [mk(X.dom, 'p', '', ['inner words'])])])])])); X.api.foldApply(rx); X.api.foldToggle(rx, blocks(rx)[0]);
        const inner = kid(blocks(rx)[1]), nested = [stOf(rx), X.api.foldReveal(rx, inner, false), stOf(rx)];
        // The owed review, 2026-10-09 (backlog 136): a block that opens with a heading and holds more. Folded, the rest of the block is put away
        // with what stands under it, and a Find hit there stayed out of sight
        const Y = mkNav(), ry = Y.el.plannerPreview; ry.appendChild(mk(Y.dom, 'div', 'wrap', [blk(Y.dom, 0, [mk(Y.dom, 'h1', '', ['Title'])]), blk(Y.dom, 1, [mk(Y.dom, 'h2', '', ['Scene one']), mk(Y.dom, 'p', '', ['The password is swordfish.'])]), blk(Y.dom, 2, [mk(Y.dom, 'p', '', ['after'])]), blk(Y.dom, 3, [mk(Y.dom, 'h2', '', ['Scene two'])]), blk(Y.dom, 4, [mk(Y.dom, 'p', '', ['end'])])]));
        Y.api.foldApply(ry); Y.api.foldToggle(ry, blocks(ry)[1]);
        const own1 = blocks(ry)[1].childNodes.filter(c => !(c.nodeType === 1 && c.className === 'pv-fold-btn')), yFold = stOf(ry), yInHead = Y.api.foldReveal(ry, own1[0], false), yStill = stOf(ry), yBlock = Y.api.foldReveal(ry, blocks(ry)[1], false), yStill2 = stOf(ry);
        const yRest = Y.api.foldReveal(ry, own1[1], false), yOpen = stOf(ry); Y.api.foldToggle(ry, blocks(ry)[1]); const yOwn = Y.api.foldReveal(ry, own1[0], true), yOpen2 = stOf(ry);
        check('a hit in the rest of a block that opens with a heading (the owed review of 2026-10-09; foldReveal, run for real): folded, such a block puts its own remainder away with what stands under it; a hit in that remainder opens it, where a hit in the heading\'s own words, or on the block itself, leaves it folded as before, and the Outline\'s press opens it as it always did',
            yFold === '0- 1S 2H 3 4' && yInHead === false && yStill === yFold && yBlock === false && yStill2 === yFold && yRest === true && yOpen === '0- 1 2 3 4' && yOwn === true && yOpen2 === yOpen, J([yFold, yInHead, yBlock, yRest, yOpen, yOwn]));
        check('the Outline lists a page\'s headings whether they are folded or put away, and a press on one that is put away opens the section around it and its own, then brings it into view; a hit inside a block drawn inside a block opens the page\'s own block around it',
            folded === '0- 1 2S 3H 4H 5SH 6H 7H- 8- 9 10 11 12 13 14- 15- 16 17 18 19-' && J(listed) === J(['pagenav-row pagenav-lv1|0|t:Title', 'pagenav-row pagenav-lv2|2|t:Beats', 'pagenav-row pagenav-lv3|3|t:The inn', 'pagenav-row pagenav-lv3|5|t:Detail', 'pagenav-row pagenav-lv2|8|t:Empty section', 'pagenav-row pagenav-lv2|9|t:Charts', 'pagenav-row pagenav-lv2|19|t:Beats'])
            && J(went) === J([OPEN, 1, true, false]) && J(nested) === J(['0S 1-', true, '0 1-']), J([folded, listed, went, nested]));
    }
    {
        // an export reads the page as it was drawn
        const S = mkNav(), rs = S.el.plannerPreview; draw(S, rs, PAGE); const drawn = ser(rs); S.api.foldApply(rs); [2, 4, 9].forEach(i => S.api.foldToggle(rs, blocks(rs)[i])); const folded = stOf(rs), kept = J(S.kept());
        S.api.foldStrip(rs); const bare = [ser(rs) === drawn, rs.className, rs.querySelectorAll('.pv-fold-btn').length, stOf(rs), J(S.kept()) === kept]; S.api.foldStrip(rs); const twice = ser(rs) === drawn;
        S.api.foldApply(rs); const back = stOf(rs); let err = ''; try { S.api.foldStrip(null); S.api.foldApply(null); S.api.foldApply({}); } catch (e) { err = String(e); }
        check('the folds taken off a page (foldStrip, what an export does before it reads the page\'s markup): every arrow, class, mark and word goes and the page\'s box is unmarked — the tree is exactly the one that was drawn; what is kept is not touched, so the folds go back on as they were; no page throws nothing',
            folded === '0- 1 2S 3H 4SH 5H 6H 7H- 8- 9S 10H 11H 12H 13H 14H- 15H- 16H 17H 18H 19-' && J(bare) === J([true, 'doc-view', 0, PAGE.map((e, i) => i + '-').join(' '), true]) && twice === true && back === folded && err === '', J([folded, bare, twice, back, err]));
    }
    {
        // what this computer kept, read as what of it is sound
        const H = mkNav(), rh = H.el.plannerPreview; draw(H, rh, PAGE); const pk = fnv('c1/p1'), good = fnv('h2:Beats'), BEATS = '0- 1 2S 3H 4H 5H 6H 7H- 8- 9 10 11 12 13 14- 15- 16 17 18 19-';
        const put = v => { H.store.data.wp_pageFolds = typeof v === 'string' ? v : J(v); let err = ''; try { H.api.foldApply(rh); } catch (e) { err = ' THREW ' + e; } return stOf(rh) + err; };
        const junk = [put('{not json'), put('null'), put('[]'), put('7'), put('"text"'), put({ v: 2, pages: { [pk]: { t: 1, m: [good] } } }), put({ pages: { [pk]: { t: 1, m: [good] } } }), put({ v: 1, pages: [{ t: 1, m: [good] }] }), put({ v: 1, pages: null }),
            put({ v: 1, pages: { [pk]: { t: 1, m: 'x' } } }), put({ v: 1, pages: { [pk]: [good] } }), put({ v: 1, pages: { [pk]: null } }), put({ v: 1, pages: { [pk]: { t: 1, m: [] } } }), put({ v: 1, pages: { [pk.toUpperCase()]: { t: 1, m: [good] } } }), put({ v: 1, pages: { [pk + '0']: { t: 1, m: [good] } } })];
        const sound = [put({ v: 1, pages: { [pk]: { t: 1, m: [good] } } }), put({ v: 1, seq: 'x', pages: { [pk]: { t: 'soon', m: [7, null, {}, [], 'zz', good.toUpperCase(), good + '0', ' ' + good, good, good] } } }),
            put('{"v":1,"pages":{"__proto__":{"t":1,"m":["' + good + '"]},"constructor":{"t":1,"m":["' + good + '"]},"' + pk + '":{"t":1,"m":["' + good + '","__proto__","constructor"]}}}')];
        const cleanOf = v => { H.store.data.wp_pageFolds = typeof v === 'string' ? v : J(v); const o = H.api.foldRead(); return J([o.v, o.seq, Object.keys(o.pages).map(k => k + ':' + o.pages[k].t + ':' + o.pages[k].m.length), Object.getPrototypeOf(o.pages)]); };
        const hex = i => i.toString(16).padStart(8, '0'), marksOf = n => { const m = []; for (let i = 0; i < n; i++) m.push(hex(i + 1)); return m; };
        const q = s => '"' + s + '"', onePage = '{"t":1,"m":[' + q(good) + ']}';
        const mixed = '{"v":1,"seq":1,"pages":{"zz":' + onePage + ',"ABCDEF12":' + onePage + ',"abcdef123":' + onePage + ',"__proto__":' + onePage + ',' + q(hex(1)) + ':{"t":1,"m":"x"},' + q(hex(2)) + ':[' + q(good) + '],' + q(hex(3)) + ':null,' + q(hex(5)) + ':{"t":9,"m":["zz"]},' + q(hex(6)) + ':7,'
            + q(hex(4)) + ':{"t":2,"m":[' + q(good) + ',"zz",7,' + q(good.toUpperCase()) + ',' + q(good) + ']}}}';
        const reads = [cleanOf({ v: 1, seq: 12.9, pages: { [hex(1)]: { t: 3.7, m: [good] }, [hex(2)]: { t: -5, m: [good] }, [hex(3)]: { t: 1e300, m: [good] }, [hex(4)]: { t: NaN, m: [good, good] }, [hex(5)]: { m: marksOf(500) } } }), cleanOf({ v: 1, seq: 1e300, pages: { [hex(1)]: { t: 40, m: [good] } } }), cleanOf({ v: 1, seq: 5, pages: { [hex(1)]: { t: 40, m: [good] } } }), cleanOf(mixed)];
        const big = { v: 1, seq: 350, pages: {} }; for (let i = 1; i <= 350; i++) big.pages[hex(i)] = { t: i, m: [good] }; H.store.data.wp_pageFolds = J(big); const cut = Object.keys(H.api.foldRead().pages).length;
        check('what this computer kept is read as what of it is sound: a store that is no JSON, another version, no list of pages, a page under a key that is no page key, a page with no marks — none of it folds anything and nothing is thrown; of a page\'s marks only those that are marks count, each once; a key a prototype holds is no page and no mark, and nothing is written onto a prototype; a time that is no whole number from 0 up reads 0 or its whole part, the count never less than the newest page\'s time, at most 400 marks a page and 300 pages',
            junk.every(s => s === OPEN) && sound.every(s => s === BEATS) && ({}).m === undefined && ({}).t === undefined && ({}).pages === undefined
            && J(reads) === J([J([1, 12, [hex(1) + ':3:1', hex(2) + ':0:1', hex(3) + ':0:1', hex(4) + ':0:1', hex(5) + ':0:400'], null]), J([1, 40, [hex(1) + ':40:1'], null]), J([1, 40, [hex(1) + ':40:1'], null]), J([1, 2, [hex(4) + ':2:1'], null])]) && cut === 300 && H.api.caps.pages === 300, J([junk, sound, reads, cut]));
        // the caps, at a write
        const C = mkNav(), rc = C.el.plannerPreview; draw(C, rc, PAGE); C.api.foldApply(rc);
        const full = { v: 1, seq: 300, pages: {} }; for (let i = 1; i <= 300; i++) full.pages[hex(i)] = { t: i, m: [good] }; C.store.data.wp_pageFolds = J(full);
        C.api.foldToggle(rc, blocks(rc)[2]); const k1 = C.kept(), pages1 = [Object.keys(k1.pages).length, k1.pages[hex(1)] === undefined, !!k1.pages[hex(2)], J(k1.pages[pk]), k1.seq];
        C.api.foldToggle(rc, blocks(rc)[1]); const k2 = C.kept(), pages2 = [Object.keys(k2.pages).length, !!k2.pages[hex(2)], J(k2.pages[pk]), k2.seq];
        const heavy = { v: 1, seq: 15, pages: {} }; for (let i = 1; i <= 15; i++) heavy.pages[hex(i)] = { t: 16 - i, m: marksOf(400) }; C.store.data.wp_pageFolds = J(heavy);
        C.api.foldAll(rc, false); const k3 = C.kept(), total3 = Object.keys(k3.pages).reduce((n, k) => n + k3.pages[k].m.length, 0);
        C.api.foldToggle(rc, blocks(rc)[2]); const k4 = C.kept(), total4 = Object.keys(k4.pages).reduce((n, k) => n + k4.pages[k].m.length, 0), pages4 = [Object.keys(k4.pages).length, k4.pages[hex(15)] === undefined, !!k4.pages[hex(14)], !!k4.pages[pk]];
        const fullest = { v: 1, seq: 300, pages: {} }; for (let i = 1; i <= 300; i++) fullest.pages[hex(0xa0000000 + i)] = { t: i, m: marksOf(20).map(m => 'f' + m.slice(1)) };
        check('what this computer keeps is bounded: 300 pages, and 6,000 marks in all — when a write would pass either, the pages folded longest ago go first, never the page just folded, which is always the newest; a page folded again moves no other page out; at its fullest it is under 100 KB, written into the settings file with every other setting',
            J(pages1) === J([300, true, true, J({ t: 301, m: [good] }), 301]) && J(pages2) === J([300, true, J({ t: 302, m: [good, fnv('b:Lead text')] }), 302]) && total3 === 6000 && Object.keys(k3.pages).length === 15
            && total4 === 5601 && J(pages4) === J([15, true, true, true]) && C.api.caps.total === 6000 && C.api.caps.store === 'wp_pageFolds' && J(J(fullest)).length < 100000 && J(J(heavy)).length < 100000, J([pages1, pages2, total3, total4, pages4, J(J(fullest)).length]));
    }
    {
        // the wiring: an arrow pressed, a folded part pressed, the page drawn again
        const N = mkNav({ observer: true }), root = N.el.plannerPreview, B = () => blocks(root), arrow = i => btnOf(B()[i])[0]; draw(N, root, PAGE); N.api.navWire();
        const watched = [N.obs.length, N.obs.map(o => o.target.id), N.obs.map(o => J(o.opts))];
        const e1 = N.dom.fire(arrow(2), 'click'), s1 = stOf(root), e2 = N.dom.fire(kid(B()[2]), 'click'), s2 = stOf(root); N.dom.fire(arrow(2), 'click'); const e3 = N.dom.fire(B()[2], 'click'), s3 = stOf(root);
        const e4 = N.dom.fire(kid(B()[1]), 'click'), e5 = N.dom.fire(B()[1], 'click'), e6 = N.dom.fire(kid(B()[0]), 'click'), s6 = stOf(root);
        N.dom.fire(arrow(4), 'click'); const s7 = stOf(root), e8 = N.dom.fire(B()[4], 'click'), s8 = stOf(root);
        const link = mk(N.dom, 'a', '', ['a link']); kid(B()[9]).appendChild(link); N.api.foldApply(root); N.dom.fire(arrow(9), 'click'); const s9 = stOf(root), e9 = N.dom.fire(link, 'click'), s10 = stOf(root), e11 = N.dom.fire(kid(B()[9]), 'click'), s11 = stOf(root);
        let seen = 0; root.addEventListener('dblclick', () => { seen++; }); const d1 = N.dom.fire(arrow(2), 'dblclick'), seen1 = seen, d2 = N.dom.fire(B()[1], 'dblclick'), seen2 = seen;
        N.dom.fire(arrow(2), 'click'); const before = stOf(root); draw(N, root, PAGE); const fresh = stOf(root); N.redrawn(root); const after = stOf(root); N.redrawn(N.el.docPanelBody); N.redrawn(root); const after2 = stOf(root);
        const Q = mkNav(), rq = Q.el.plannerPreview; draw(Q, rq, PAGE); let err = ''; try { Q.api.navWire(); } catch (e) { err = String(e); }
        check('the folds wired on a page: a press on an arrow folds its part and goes no further; a press anywhere on a folded part opens it — on a folded heading\'s words, on the line a folded part leaves — but never a press on a link inside it, which is the link\'s; a press on an open part\'s words, and on the title, does nothing and is left alone; a quick second press on an arrow is no double-click on the block, while a double-click on the block itself still is; each place\'s box is watched for its own children only, and a page drawn again gets its folds back as they were; without a page observer the folds are still wired',
            J(watched) === J([3, ['plannerPreview', 'docPanelBody', 'docReaderBody'], ['{"childList":true}', '{"childList":true}', '{"childList":true}']])
            && e1.defaultPrevented && e1.stopped && s1 === '0- 1 2S 3H 4H 5H 6H 7H- 8- 9 10 11 12 13 14- 15- 16 17 18 19-' && e2.defaultPrevented && e2.stopped && s2 === OPEN && e3.stopped && s3 === OPEN
            && !e4.defaultPrevented && !e4.stopped && !e5.stopped && !e6.stopped && s6 === OPEN && s7 === '0- 1 2 3 4S 5 6 7- 8- 9 10 11 12 13 14- 15- 16 17 18 19-' && e8.stopped && s8 === OPEN
            && s9 === '0- 1 2 3 4 5 6 7- 8- 9S 10H 11H 12H 13H 14H- 15H- 16H 17H 18H 19-' && !e9.defaultPrevented && !e9.stopped && s10 === s9 && e11.stopped && s11 === OPEN
            && d1.stopped && seen1 === 0 && !d2.stopped && seen2 === 1 && before === s1 && fresh === PAGE.map((e, i) => i + '-').join(' ') && after === s1 && after2 === s1 && err === '' && stOf(rq) === OPEN, J([watched, s1, s2, s3, s6, s7, s8, s9, s10, s11, seen1, seen2, before, fresh, after, err]));
    }
    {
        // a part's word is text: an attribute a style sheet prints, never an element
        const HOSTILE = '<img src=x onerror=alert(1)><script>x</script>" onmouseover="y', N = mkNav(), root = N.el.plannerPreview; let err = '';
        draw(N, root, [['h2', HOSTILE], ['node', HOSTILE, null], ['p', HOSTILE], ['h2', '__proto__'], ['p', 'constructor'], ['p', '__proto__']]); const names = () => root.all().map(e => e.nodeName).join(' '), n0 = names();
        try { N.api.navWire(); N.api.foldAll(root, true); blocks(root).forEach(b => { if (!b.classList.contains('pv-fold-shut')) N.api.foldToggle(root, b); }); } catch (e) { err = String(e); }
        const hints = blocks(root).map(b => b.dataset.foldHint), n1 = names();
        check('a folded part\'s word is text: a title, a heading or a paragraph that holds markup is kept as those characters in an attribute of its block, cut at 80, on a page that refuses any markup written into it — the only element the folds ever make is the arrow, a button; a part named as a prototype\'s key folds like any other and nothing is written onto a prototype',
            err === '' && J(hints) === J(['2 parts folded', Array.from(HOSTILE).slice(0, 80).join(''), Array.from(HOSTILE).slice(0, 80).join(''), '2 parts folded', 'constructor', '__proto__']) && n0 === 'DIV DIV H2 DIV DIV H3 P DIV P DIV H2 DIV P DIV P'
            && n1 === 'DIV DIV BUTTON H2 DIV BUTTON DIV H3 P DIV BUTTON P DIV BUTTON H2 DIV BUTTON P DIV BUTTON P' && ({}).fold === undefined && Object.keys(Object.prototype).length === 0 && HOSTILE.length < 80, J([err, hints, n0, n1]));
    }
    {
        // the folds over what the two real renderers draw
        const line = p => p.at + ' ' + p.kind + ' ' + p.level + ' ' + p.holds + ' ' + p.words, N = mkNav(), root = N.el.plannerPreview, D = mkNav(), rd = D.el.docReaderBody;
        const pParts = N.api.foldParts(real.p).parts.map(line), dParts = D.api.foldParts(real.d).parts.map(line);
        root.appendChild(real.p.childNodes[0]); rd.appendChild(real.d.childNodes[0]); N.api.navWire(); D.api.navWire(); const open = [stOf(root), stOf(rd), rd.querySelectorAll('.doc-section .pv-fold-btn').length];
        N.api.foldToggle(root, blocks(root)[2]); N.api.foldToggle(root, blocks(root)[8]); D.api.foldToggle(rd, blocks(rd)[1]); D.api.foldToggle(rd, blocks(rd)[7]);
        const shut = [stOf(root), blocks(root)[2].dataset.foldHint, blocks(root)[8].dataset.foldHint, stOf(rd), blocks(rd)[1].dataset.foldHint, blocks(rd)[7].dataset.foldHint];
        check('the folds over what the real renderers draw (the planner\'s preview and a page, as the outline check read them): a planner\'s sections hold its nodes, tables and callouts, a page\'s section holds its sub-headings, texts and tables, also where it sets them in columns; a node and a titled table go by their titles, an untitled table by its cells, a flowchart as Chart, a text by its words, a page\'s rule folds nothing; folded, a section says how many parts it holds and a text goes by its words',
            J(pParts) === J(['1 body 0 0 Lead.', '2 head 2 4 Beats', '3 body 0 0 The inn', '4 body 0 0 Prices', '5 body 0 0 Item Detail Notes x', '6 body 0 0 A note', '7 head 2 2 & "quoted"', '8 body 0 0 The end.', '9 body 0 0 Chart'])
            && J(dParts) === J(['1 head 2 4 At the table', '2 head 3 3 Inspiration', '3 body 0 0 Spend it.', '4 body 0 0 Travel pace', '5 body 0 0 A b', '6 head 2 1 ' + real.hostile, '7 body 0 0 Mind this.'])
            && J(open) === J(['0- 1 2 3 4 5 6 7 8 9', '0- 1 2 3 4 5 6 7 8-', 4]) && J(shut) === J(['0- 1 2S 3H 4H 5H 6H 7 8S 9', '4 parts folded', 'The end.', '0- 1S 2H 3H 4H 5H 6 7S 8-', '4 parts folded', 'Mind this.']), J([pParts, dParts, open, shut]));
    }

    /* ---- landing: a page opened at one block or at a search hit (1.5.4; docs/PLANNER_ORG_DESIGN.md 4.1) ---- */
    {
        // the one cleaner of a landing (pagenav.js landOf, its land slice run for real)
        const N = mkNav(), lo = N.api.landOf, x199 = 'x'.repeat(199), E = '\ud83d\ude00';
        const qs = [lo({ q: 'Ves Karn' }), lo({ q: '  Ves  Karn \n' }), lo({ q: 'x'.repeat(200) }), lo({ q: 'x'.repeat(201) }), lo({ q: x199 + E + 'y' }), lo({ q: x199 + '\ud83d' }), lo({ q: 'a\udc00b\ud800' }), lo({ q: 'a'.repeat(199) + ' b' }), lo({ q: '   ' + 'z'.repeat(250) }), lo({ q: E }), lo({ q: '__proto__' })];
        const QS = [{ q: 'Ves Karn' }, { q: 'Ves  Karn' }, { q: 'x'.repeat(200) }, { q: 'x'.repeat(200) }, { q: x199 + E }, { q: x199 }, { q: 'ab' }, { q: 'a'.repeat(199) }, { q: 'z'.repeat(200) }, { q: E }, { q: '__proto__' }];
        const blanks = [lo({ q: '' }), lo({ q: ' \t\n ' }), lo({ q: '\ud800' }), lo({ q: '   ', at: 'b_1' }), lo({ q: 'x', at: 'b_1' }), lo({ q: 7, at: 'b_1' })];
        const ats = [lo({ at: 'b_abc12' }), lo({ at: 'A'.repeat(64) }), lo({ at: 'A'.repeat(65) }), lo({ at: '' }), lo({ at: 'b abc' }), lo({ at: 'b/abc' }), lo({ at: 'b_\u00e9' }), lo({ at: 'b_1\n' }), lo({ at: '"]' }), lo({ at: 'b_1\u0000' }), lo({ at: '__proto__' }), lo({ at: 'constructor' }), lo({ at: 5 }), lo({ at: '-_-' })];
        const JUNK = [null, undefined, 0, 7, NaN, '', 'b_1', 'q', true, false, [], ['b_1'], Object.assign([], { at: 'b_1' }), () => 1, Symbol('x'), 10n, new String('x'), Object.create({ at: 'b_1' }), Object.create({ q: 'x' }), { get q() { throw new Error('read'); } },
            new Proxy({}, { getOwnPropertyDescriptor() { throw new Error('trap'); } }), { q: new String('x') }, { q: { toString: () => 'x' } }, { at: ['b_1'] }, JSON.parse('{"__proto__": {"at": "b_1"}}'), { q: null, at: null }];
        let threw = ''; const junk = JUNK.map(v => { try { return lo(v); } catch (e) { threw = String(e); return 'threw'; } });
        check('the one cleaner of a landing (pagenav.js landOf, run for real): words are a search hit, trimmed, cut at 200 characters by whole characters — a character of two halves is never cut, half a character is dropped, and a cut that leaves a space at the end is trimmed again —, white space inside kept; with no words a block\'s id is the landing, 1 to 64 letters, digits, _ and - and nothing else; words come before an id; anything else, an empty or blank text, a key the landing only inherits, a key that throws when read and junk of every type is no landing, and nothing throws; what comes back holds its one key alone',
            J(qs) === J(QS) && J(blanks) === J([null, null, null, { at: 'b_1' }, { q: 'x' }, { at: 'b_1' }])
            && J(ats) === J([{ at: 'b_abc12' }, { at: 'A'.repeat(64) }, null, null, null, null, null, null, null, null, { at: '__proto__' }, { at: 'constructor' }, null, { at: '-_-' }])
            && threw === '' && junk.every(v => v === null) && qs.concat(ats).filter(Boolean).every(v => Object.keys(v).length === 1) && ({}).q === undefined && ({}).at === undefined && N.api.landCaps.q === 200, J([qs, blanks, ats, junk, threw]));
    }
    {
        // a drawn page opened at a block: found by its own entry of the item's blocks, the folds around it opened, brought into view and lit
        const N = mkNav(), root = N.el.plannerPreview, B = () => blocks(root), it = { blocks: PAGE.map((e, i) => ({ id: 'b_' + i, type: 'text' })) };
        draw(N, root, PAGE); N.api.navWire();
        const seen = [], is0 = N.dom.El.prototype.is; N.dom.El.prototype.is = function(sel) { seen.push(sel); return is0.call(this, sel); };
        const scrolls = () => B().map((b, i) => b.calls.filter(c => c === 'scrollIntoView').length ? i : -1).filter(i => i >= 0);
        N.api.foldToggle(root, B()[9]); N.api.foldToggle(root, B()[12]); const shut = stOf(root), sets0 = N.store.sets;
        const r1 = N.api.land(root, it, { at: 'b_12' }), s1 = [stOf(root), scrolls(), B()[12].classList.contains('pagenav-hit'), B().filter(b => b.classList.contains('pagenav-hit')).length]; N.dom.runTimers(); const lit1 = B()[12].classList.contains('pagenav-hit');
        N.api.foldToggle(root, B()[2]); N.api.foldToggle(root, B()[5]); const r2 = N.api.land(root, it, { at: 'b_5' }), s2 = [stOf(root), scrolls()];
        N.api.foldToggle(root, B()[2]); N.api.foldToggle(root, B()[5]); const r3 = N.api.land(root, it, { at: 'b_6' }), s3 = stOf(root); N.dom.runTimers();
        N.api.foldToggle(root, B()[9]); const before = [stOf(root), N.store.sets, scrolls().length];
        const missing = [N.api.land(root, it, { at: 'b_99' }), N.api.land(root, it, { at: 'b 1' }), N.api.land(root, it, null), N.api.land(root, it, {}), N.api.land(root, null, { at: 'b_1' }), N.api.land(root, { blocks: 'b_1' }, { at: 'b_1' }), N.api.land(null, it, { at: 'b_1' }), N.api.land(root, { get blocks() { throw new Error('read'); } }, { at: 'b_1' }), N.api.land(mk(N.dom, 'div', '', []), it, { at: 'b_1' }), N.api.land(root, { blocks: [] }, { at: 'b_1' })];
        const after = [stOf(root), N.store.sets, scrolls().length];
        check('a page opened at a block (pagenav.js land, run for real): the block is found by reading each drawn block\'s own entry of the item\'s blocks by its data-blk; the sections folded around it and its own part are opened, as the Outline opens them — a heading jumped to opens its own section too —, it alone is brought into view and lit, and the light goes out by itself; an id that is not on the page, an id that is no id, no landing, no item, an item whose blocks are no list or cannot be read, no page and a page with no blocks land nowhere, open nothing, write nothing and throw nothing; no selector the module asks for ever holds the landing',
            shut === '0- 1 2 3 4 5 6 7- 8- 9S 10H 11H 12SH 13H 14H- 15H- 16H 17H 18H 19-' && r1 === true && J(s1) === J([OPEN, [12], true, 1]) && lit1 === false && sets0 > 0
            && r2 === true && J(s2) === J([OPEN, [5, 12]]) && r3 === true && s3 === OPEN && missing.every(v => v === false) && J(after) === J(before) && before[0] === '0- 1 2 3 4 5 6 7- 8- 9S 10H 11H 12H 13H 14H- 15H- 16H 17H 18H 19-'
            && seen.length > 0 && !seen.some(s => /b_\d|b 1/.test(s)), J([shut, r1, s1, lit1, r2, s2, r3, s3, missing, before, after, seen.filter(s => /b_/.test(s))]));
        // the item's blocks read as data: only an entry of its own, at its own number; a list with a hole of a billion; two blocks of one id
        const M = mkNav(), rm = M.el.plannerPreview, sparse = []; sparse.length = 1e9; sparse[3] = { id: 'b_3' }; draw(M, rm, [['p', 'zero'], ['p', 'one'], ['p', 'two'], ['p', 'three'], ['p', 'four']]);
        const odd = mk(M.dom, 'div', 'wrap', [blk(M.dom, '04', [mk(M.dom, 'p', '', ['oh four'])]), blk(M.dom, ' 1', [mk(M.dom, 'p', '', ['space one'])]), blk(M.dom, '-1', [mk(M.dom, 'p', '', ['minus one'])]), blk(M.dom, '1e0', [mk(M.dom, 'p', '', ['one again'])])]); rm.appendChild(odd);
        const at = (blocksOf, id) => { const was = blocks(rm).map(b => b.calls.length); const r = M.api.land(rm, { blocks: blocksOf }, { at: id }); return [r, blocks(rm).map((b, i) => b.calls.length > was[i] ? i : -1).filter(i => i >= 0)]; };
        const protoList = [{ id: 'b_0' }, Object.create({ id: 'b_ghost' }), null, 'b_3', { id: 'b_4' }];
        const t0 = Date.now(), reads = [at(sparse, 'b_3'), at([{ id: 'b_0' }, { id: 'dup' }, { id: 'x' }, { id: 'dup' }], 'dup'), at(protoList, 'b_ghost'), at(protoList, 'b_3'), at(protoList, 'b_4'), at([{ id: 'b_0' }, { id: 'b_1' }, { id: 'b_2' }, { id: 'b_3' }, { id: 'b_4' }], 'b_4'), at(Object.assign([], { 9: { id: 'b_9' } }), 'b_9')], took = Date.now() - t0;
        const O = mkNav(), ro = O.el.plannerPreview; ro.appendChild(mk(O.dom, 'div', 'wrap', ['04', ' 7', '-0', '7.0', '1e1', '+3'].map(n => blk(O.dom, n, [mk(O.dom, 'p', '', ['odd ' + n])])))); const oddList = []; [0, 3, 4, 7, 10].forEach(i => { oddList[i] = { id: 'b_' + i }; });
        const inh = []; Object.setPrototypeOf(inh, Object.assign(Object.create(Array.prototype), { 3: { id: 'b_inh' } })); const IN = mkNav(), rin = IN.el.plannerPreview; draw(IN, rin, [['p', 'a'], ['p', 'b'], ['p', 'c'], ['p', 'd']]);
        const oddReads = [0, 3, 4, 7, 10].map(i => O.api.land(ro, { blocks: oddList }, { at: 'b_' + i })).concat([Array.isArray(inh), IN.api.land(rin, { blocks: inh }, { at: 'b_inh' })]);
        check('the item\'s blocks read as data: a block is matched only by an id of its own at the very number its drawn box carries — never one an entry only inherits, an entry that is no object, a number written otherwise (04, a space, a sign, an exponent) or a block that is not drawn —; two blocks of one id land on the first; a list with a hole a billion long is read only as far as the page is drawn',
            J(reads) === J([[true, [3]], [true, [1]], [false, []], [false, []], [true, [4]], [true, [4]], [false, []]]) && took < 500 && J(oddReads) === J([false, false, false, false, false, true, false]), J([reads, took, oddReads]));
    }
    {
        // a drawn page opened at a search hit: the first block that holds the words, as the page's Find folds them
        const N = mkNav(), root = N.el.plannerPreview, B = () => blocks(root), it = { blocks: [] };
        draw(N, root, PAGE); N.api.navWire(); N.api.foldToggle(root, B()[2]); N.api.foldToggle(root, B()[5]); N.api.foldToggle(root, B()[9]); N.api.foldToggle(root, B()[12]);
        const q = (s, item) => { const was = B().map(b => b.calls.length), r = N.api.land(root, item === undefined ? it : item, { q: s }); return [r, B().map((b, i) => b.calls.length > was[i] ? i : -1).filter(i => i >= 0)]; };
        const hits = [q('UNDER detail'), stOf(root), q('lead text'), q('a map'), stOf(root), q('just'), q('nothing like it'), q('   '), q('a map', null), q('chart'), q('nothing alike')];
        N.dom.runTimers(); const unlit = B().every(b => !b.classList.contains('pagenav-hit'));
        const W = mkNav(), rw = W.el.docReaderBody, d = W.dom;
        rw.appendChild(mk(d, 'div', 'wrap', [blk(d, 0, [mk(d, 'h1', '', ['Session ', mk(d, 'span', '', ['One']), mk(d, 'span', 'sub', ['Road trip'])])]), blk(d, 1, [mk(d, 'p', '', ['beta alpha'])]), blk(d, 2, [mk(d, 'p', '', ['alpha']), mk(d, 'p', '', ['gamma beta'])]), blk(d, 3, [mk(d, 'p', '', ['the alpha beta line'])]),
            blk(d, 4, [mk(d, 'p', '', ['S', mk(d, 'b', '', ['\u00e9']), 'lkath elder'])]), blk(d, 5, [mk(d, 'style', '', ['.hidden-words{}']), mk(d, 'script', '', ['secret()'])]), blk(d, 6, [mk(d, 'p', '', ['Ab']), mk(d, 'p', '', ['cd'])])]));
        const wq = s => { const was = blocks(rw).map(b => b.calls.length); const r = W.api.land(rw, null, { q: s }); return [r, blocks(rw).map((b, i) => b.calls.length > was[i] ? i : -1).filter(i => i >= 0)]; };
        const words = [wq('alpha beta'), wq('gamma alpha'), wq('session one'), wq('oneroad'), wq('SELKATH'), wq('hidden'), wq('secret'), wq('ab cd'), wq('b c'), wq('secret hidden')];
        const runs = W.api.landRuns(blocks(rw)[0]), folds = W.api.landFold('\u00c0 \u00e9 \u1e9e \u0130 Z');
        check('a page opened at a search hit (pagenav.js land, run for real): the first block that holds the words, case and accents aside, read in the stretches the page\'s Find reads — a word drawn in runs is whole, a subtitle and a paragraph end a stretch, a style sheet and a script are not read —, the folds around it opened and it brought into view and lit; where no block holds the words together, the first that holds each of them at the start of a word, else the first that holds any of them at the start of a word (it in Item, never the it inside Title); words found nowhere, blank words and a page that holds none land nowhere; a search hit needs no item',
            J(hits) === J([[true, [6]], '0- 1 2 3 4 5 6 7- 8- 9S 10H 11H 12SH 13H 14H- 15H- 16H 17H 18H 19-', [true, [1]], [true, [12]], OPEN, [true, [16]], [true, [4]], [false, []], [true, [12]], [true, [9]], [false, []]]) && unlit
            && J(words) === J([[true, [3]], [true, [2]], [true, [0]], [false, []], [true, [4]], [false, []], [false, []], [true, [6]], [true, [1]], [false, []]]) && J(runs) === J(['session one', 'road trip']) && folds === 'a e \u00df i z', J([hits, words, runs, folds]));
    }
    // ONE rule for where words land (the maintainer's decision on the review of step 1, its finding 5): the whole phrase in one stretch; else the
    // first block that holds every word at the start of a word; else the first that holds any of them so; else none. A page is read as the page's
    // Find reads it: no diagram source the diagram library has not drawn yet, and in a drawn chart its HTML labels alone. The probes: each a name,
    // the page's blocks (a text is a paragraph, a function draws a block's parts), the words and the block they land on (-1: none)
    const kidsOf = (d, e) => typeof e === 'string' ? [mk(d, 'p', '', [e])] : e(d);
    const putPage = (N, root, spec) => { while (root.firstChild) root.removeChild(root.firstChild); root.appendChild(mk(N.dom, 'div', 'wrap', spec.map((e, i) => blk(N.dom, i, kidsOf(N.dom, e))))); };
    const chartSrc = s => d => [mk(d, 'div', 'diagram fc-box', [mk(d, 'pre', 'mermaid', [s])])], codeOf = s => d => [mk(d, 'pre', 'doc-code', [s])];
    const chartDrawn = lab => d => [mk(d, 'div', 'diagram fc-box', [mk(d, 'pre', 'mermaid', [mk(d, 'svg', '', [mk(d, 'style', '', ['.gold > rect { fill: #302517; }']), mk(d, 'g', 'node', [mk(d, 'foreignObject', '', [mk(d, 'div', '', [mk(d, 'span', 'nodeLabel', [lab])])])])])])])];
    const seqDrawn = (...ws) => d => [mk(d, 'div', 'diagram', [mk(d, 'pre', 'mermaid', [mk(d, 'svg', '', ws.map(w => mk(d, 'text', 'actor', [mk(d, 'tspan', '', [w])])))])])];
    const LAND_PROBES = [
        ['any word: the review\'s own probe, where the words never stand together', ['The bridge at Osk is down.', 'Wade in where the reeds grow thin.'], 'osk reeds', 0],
        ['every word before any word: the review\'s own probe', ['Osk is near.', 'The ford is deep.', 'Past Osk the reeds grow.'], 'osk reeds', 2],
        ['the phrase before every word', ['Osk and the reeds.', 'Here osk reeds grow.'], 'osk reeds', 1],
        ['every word only at the start of a word', ['Kiosk breeds osk.', 'Osk and the reeds.'], 'osk reeds', 1],
        ['any word only at the start of a word', ['Kiosk and breeds.', 'The ford.', 'Then Osk.'], 'osk reeds', 2],
        ['words found nowhere', ['The ford.', 'Past the bridge.'], 'osk reeds', -1],
        ['one word is the phrase, wherever it stands', ['A kiosk.', 'Osk.'], 'osk', 0],
        ['a diagram\'s source not drawn yet is not read, a code block is', [chartSrc('flowchart TD\nclassDef gold fill:#302517\nn0["Osk"]:::gold'), codeOf('A gold bar.'), 'Gold glints.'], 'gold', 1],
        ['a drawn chart\'s HTML label is read', ['The ford.', chartDrawn('Gold gate'), 'Gold glints.'], 'gold', 1],
        ['a drawn chart\'s own text is not read', [seqDrawn('Gold bar', 'Osk'), 'Gold glints.'], 'gold', 1],
        ['the words after a drawn chart in its block are read', [d => [mk(d, 'pre', 'mermaid', [mk(d, 'svg', '', [mk(d, 'text', '', ['x'])])]), mk(d, 'p', '', ['The ford beyond.'])], 'The ford.'], 'ford', 0]
    ];
    {
        // the page itself and a player's reader land by the rule through the module's own published pagenav (land, run for real), and landWords
        // answers the very block
        const N = mkNav({ publish: true }), pn = N.win.wpPageNav, lit = r => blocks(r).map((b, i) => (b.classList.contains('pagenav-hit') ? i : -1)).filter(i => i >= 0);
        const got = LAND_PROBES.map(p => {
            const at = ['plannerPreview', 'docReaderBody'].map(id => { const r = N.el[id]; putPage(N, r, p[1]); const ok = pn.land(r, { blocks: [] }, { q: p[2] }), l = lit(r); N.dom.runTimers(); return [ok, l]; });
            return [p[0], at, blocks(N.el.plannerPreview).indexOf(pn.landWords(N.el.plannerPreview, p[2]))];
        });
        const want = LAND_PROBES.map(p => [p[0], [0, 1].map(() => [p[3] >= 0, p[3] >= 0 ? [p[3]] : []]), p[3]]);
        const rw = N.el.docReaderBody, odd = [pn.landWords(null, 'osk'), pn.landWords(rw, '   '), pn.landWords(rw, 7), pn.landWords(rw, null), pn.landWords(rw, { toString() { throw new Error('read'); } }), pn.landWords({}, 'ford'), pn.landWords(rw, ['ford'])];
        let threw = ''; try { pn.landWords(Object.defineProperty({}, 'childNodes', { get() { throw new Error('read'); } }), 'ford'); } catch (e) { threw = String(e); }
        const longQ = 'Ford' + ' '.repeat(300) + 'Osk'; putPage(N, rw, ['Osk is near.', 'The ford is deep.']); const cutW = blocks(rw).indexOf(pn.landWords(rw, longQ)); pn.land(rw, { blocks: [] }, { q: longQ }); const cutL = blocks(rw).map((b, i) => (b.classList.contains('pagenav-hit') ? i : -1)).filter(i => i >= 0); N.dom.runTimers();   // the cleaner cuts the words at 200 characters: Ford alone
        const md = (() => { try { return fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8').replace(/\r\n/g, '\n'); } catch (e) { if (e && e.code === 'ENOENT') return null; throw e; } })();   // CLAUDE.md is kept on the maintainer's machine only (git-ignored): its pin runs where it is there
        check('ONE rule for where words land (the review of step 1, its finding 5; pagenav.js land and landWords, run for real through the module\'s own published wpPageNav, for the page itself and a player\'s reader): the whole phrase first; else the first block that holds every word at the start of a word; else the first that holds any of them at the start of a word, the review\'s own two probes among them; else nowhere; a page read as the page\'s Find reads it, so a diagram\'s source not drawn yet and a drawn chart\'s own text are not read while its HTML label and a code block are, and the words after a chart in its block are; landWords answers the very block, for the words as the landing\'s cleaner keeps them, and nothing for no page, blank words, words that are no text and a page it cannot read, and never throws; CLAUDE.md says the rule where it is there',
            J(got) === J(want) && odd.every(v => v === null) && threw === '' && cutW === 1 && J(cutL) === '[1]' && (md === null || md.includes('else the first that holds each word at the start of a word, else the first that holds any of them so, else none.')), J([got.filter((g, i) => J(g) !== J(want[i])), odd, threw]));
    }
    {
        // the four places a page is read land on one block (the review of step 1, its finding 5): the page itself and a player's reader through
        // the module's own published pagenav (land), the panel over the map through docpanel.js open (its panelfold, panelfind and panelland
        // slices, run for real) and a page's window through popout.js popLandNow (its popland slice) with a Find of its own (hlFinder), each with
        // the module's own published wpPageNav on the same test page. The panel and the window mark every hit, and focus the first in that block.
        // The test page is given what a Find of the page uses that tools/boxdom.js leaves out: a text node split, and an element made whole
        const dpS = read('scripts/docpanel.js'), poS = read('scripts/popout.js'), cut = (s, n) => { const a = s.indexOf('// [textcheck:' + n + '-start]'), z = s.indexOf('// [textcheck:' + n + '-end]'); if (a < 0 || z < a) throw new Error('pagecheck: the ' + n + ' slice is not marked'); return s.slice(a, z); };
        const textOps = dom => {
            const T = dom.document.createTextNode('').constructor;
            T.prototype.splitText = function(at) { const rest = dom.document.createTextNode(this.nodeValue.slice(at)); this.nodeValue = this.nodeValue.slice(0, at); const l = this.parentNode.childNodes; l.splice(l.indexOf(this) + 1, 0, rest); rest.parentNode = this.parentNode; return rest; };
            dom.El.prototype.normalize = function() { for (let i = 0; i < this.childNodes.length; i++) { const n = this.childNodes[i]; if (n.nodeType !== 3) { n.normalize(); continue; } if (!n.nodeValue) { this.childNodes.splice(i--, 1); continue; } const nx = this.childNodes[i + 1]; if (nx && nx.nodeType === 3) { n.nodeValue += nx.nodeValue; this.childNodes.splice(i + 1, 1); i--; } } };
        };
        const PLs = new Function(cut(poS, 'popland') + '\nreturn { popPlace: popPlace, popLandNow: popLandNow };')();
        const litOf = r => blocks(r).map((b, i) => (b.classList.contains('pagenav-hit') ? i : -1)).filter(i => i >= 0);
        const curOf = (r, hits, cur) => (cur >= 0 && hits[cur] ? blocks(r).indexOf(hits[cur][0].closest('.pv-blk')) : -1);
        const agree = p => {
            const N = mkNav({ publish: true }), W = mkNav({ publish: true, popout: true }), it = { blocks: [] }; textOps(N.dom); textOps(W.dom);
            [N.el.plannerPreview, N.el.docReaderBody, N.el.docPanelBody].forEach(r => putPage(N, r, p[1])); putPage(W, W.el.popoutBody, p[1]);
            N.win.wpPageNav.land(N.el.plannerPreview, it, { q: p[2] }); N.win.wpPageNav.land(N.el.docReaderBody, it, { q: p[2] });
            const box = { value: '' }, cnt = { textContent: '' }, panel = { style: { display: 'none' } }, camp = { id: 'c1', items: { p1: { type: 'planner', blocks: [] } } };
            const ui = id => ({ docPanelBody: N.el.docPanelBody, docPanelSearchInput: box, docPanelFindCount: cnt, docPanel: panel })[id] || null; N.win.wpPageShelf = { opened: () => {} };
            const PN = new Function('ui', 'activeCamp', 'window', 'document', "var query = '', openId = '', lastSig = '', tabs = [], drawGen = 0, landPend = null;\n" + cut(dpS, 'panelfold') + '\n' + cut(dpS, 'panelfind')
                + "\nvar panelFind = hlFinder(function() { return ui('docPanelBody'); }, function() { return ui('docPanelFindCount'); });\n"
                + "function tabKeep() {} function tabsKept(t) { return t; } function tabsWith(t, id) { return t.indexOf(id) < 0 ? t.concat([id]) : t; } function place() {}\n"
                + "function clearSearch() { query = ''; var b = ui('docPanelSearchInput'); if (b) b.value = ''; panelFind.clear(); }\nfunction draw(force) { drawGen++; landPend = null; }\n"
                + cut(dpS, 'panelland') + '\nreturn { open: open, hits: function() { return panelFind.hits(); }, cur: function() { return panelFind.cur(); } };')(ui, () => camp, N.win, N.doc);
            PN.open('p1', { q: p[2] });
            const wbox = { value: '' }, wcnt = { textContent: '' }, finder = new Function('ui', 'document', 'window', cut(dpS, 'panelfold') + '\n' + cut(dpS, 'panelfind') + '\nreturn hlFinder;')(() => null, W.doc, W.win)(() => W.el.popoutBody, () => wcnt);
            PLs.popLandNow(PLs.popPlace('c1/p1/q:' + p[2]), W.win.wpPageNav, W.el.popoutBody, it, finder, wbox, false);
            return [litOf(N.el.plannerPreview), litOf(N.el.docReaderBody), litOf(N.el.docPanelBody), litOf(W.el.popoutBody), curOf(N.el.docPanelBody, PN.hits(), PN.cur()), curOf(W.el.popoutBody, finder.hits(), finder.cur()), box.value === p[2] && wbox.value === p[2], cnt.textContent === wcnt.textContent, PN.hits().length > 0 === p[3] >= 0];
        };
        const four = LAND_PROBES.map(p => [p[0], agree(p)]), fourWant = LAND_PROBES.map(p => { const at = p[3] >= 0 ? [p[3]] : []; return [p[0], [at, at, at, at, p[3], p[3], true, true, true]]; });
        check('the four places a page is read land on one block (the review of step 1, its finding 5): the page itself and a player\'s reader (pagenav.js land), the panel over the map (docpanel.js open, its panelland slice with its own Find, run for real) and a page\'s window (popout.js popLandNow with a Find of its own), each with the module\'s own published wpPageNav, light the same block for every probe — the review\'s own two among them, where the panel and the window used to light the block of their first hit —, the panel and the window focus the first hit in that block and count alike, and words that land nowhere light nothing anywhere',
            J(four) === J(fourWant), J(four.filter((f, i) => J(f) !== J(fourWant[i]))));
        // one block lit, with the module's own published wpPageNav (the maintainer's decision, found live): a page whose third block is a flowchart
        // labelled "Gold gate" and whose tenth says "Gold glints here.", opened at "gold gate" in the panel over the map (docpanel.js open and
        // landAgain, their slices run for real) and in a page's window (popout.js popLandNow with a Find of its own): the tenth block is landed on and
        // lit while the chart waits to be drawn; drawn, the search is applied again and the landing made again on the chart's own block, and the light
        // goes from the tenth to the third, so that one block is lit. A wheel on the page meanwhile, and the landing is not made again
        const GOLDP = ['The road.', 'A hill.', chartSrc('flowchart TD\nn0["Gold gate"]\n'), 'A wall.', 'A field.', 'A stone.', 'A bridge.', 'A tower.', 'A well.', 'Gold glints here.', 'A barn.'];
        const drawGold = (N, r) => { const pre = blocks(r)[2].querySelector('pre.mermaid'); while (pre.firstChild) pre.removeChild(pre.firstChild); pre.appendChild(chartDrawn('Gold gate')(N.dom)[0].childNodes[0].childNodes[0]); };
        const oneLit = wheel => {
            const N = mkNav({ publish: true }), W = mkNav({ publish: true, popout: true }), it = { blocks: [] }, r = N.el.docPanelBody, wr = W.el.popoutBody; textOps(N.dom); textOps(W.dom);
            putPage(N, r, GOLDP); putPage(W, wr, GOLDP);
            const box = { value: '' }, cnt = { textContent: '' }, panel = { style: { display: 'none' } }, camp = { id: 'c1', items: { p1: { type: 'planner', blocks: [] } } };
            const ui = id => ({ docPanelBody: r, docPanelSearchInput: box, docPanelFindCount: cnt, docPanel: panel })[id] || null; N.win.wpPageShelf = { opened: () => {} };
            const PN = new Function('ui', 'activeCamp', 'window', 'document', "var query = '', openId = '', lastSig = '', tabs = [], drawGen = 0, landPend = null;\n" + cut(dpS, 'panelfold') + '\n' + cut(dpS, 'panelfind')
                + "\nvar panelFind = hlFinder(function() { return ui('docPanelBody'); }, function() { return ui('docPanelFindCount'); });\n"
                + "function tabKeep() {} function tabsKept(t) { return t; } function tabsWith(t, id) { return t.indexOf(id) < 0 ? t.concat([id]) : t; } function place() {}\n"
                + "function clearSearch() { query = ''; var b = ui('docPanelSearchInput'); if (b) b.value = ''; panelFind.clear(); }\nfunction draw(force) { drawGen++; landPend = null; }\n"
                + cut(dpS, 'panelland') + "\nreturn { open: open, charted: function() { if (query.trim()) panelFind.find(query); landAgain(drawGen); }, hits: function() { return panelFind.hits(); }, cur: function() { return panelFind.cur(); } };")(ui, () => camp, N.win, N.doc);
            PN.open('p1', { q: 'gold gate' }); const p0 = [litOf(r), curOf(r, PN.hits(), PN.cur())];
            if (wheel) N.dom.fire(blocks(r)[5], 'wheel');
            drawGold(N, r); r.scrollTop = 240; PN.charted(); const p1 = [litOf(r), curOf(r, PN.hits(), PN.cur()), cnt.textContent];
            const wbox = { value: '' }, wcnt = { textContent: '' }, finder = new Function('ui', 'document', 'window', cut(dpS, 'panelfold') + '\n' + cut(dpS, 'panelfind') + '\nreturn hlFinder;')(() => null, W.doc, W.win)(() => wr, () => wcnt);
            PLs.popLandNow(PLs.popPlace('c1/p1/q:gold gate'), W.win.wpPageNav, wr, it, finder, wbox, false); const w0 = [litOf(wr), curOf(wr, finder.hits(), finder.cur())];
            drawGold(W, wr); finder.find(wbox.value); PLs.popLandNow(PLs.popPlace('c1/p1/q:gold gate'), W.win.wpPageNav, wr, it, finder, wbox, true); const w1 = [litOf(wr), curOf(wr, finder.hits(), finder.cur()), wcnt.textContent];
            N.dom.runTimers(); W.dom.runTimers();
            return [p0, p1, w0, w1, litOf(r).concat(litOf(wr)), typeof N.win.wpPageNav.unflash];
        };
        const lit1 = oneLit(false), lit2 = oneLit(true);
        check('a landing made again lights one block (the maintainer\'s decision, found live; docpanel.js open and landAgain and popout.js popLandNow, run for real with the module\'s own published wpPageNav and its flash and unflash): opened at "gold gate", the panel and a page\'s window light "Gold glints here." while the chart waits to be drawn; drawn, the landing is made again on the chart\'s own block, its hit focused, and the light goes from the first block to it, so one block is lit, though the chart moved the page\'s scrollTop; the light then goes out by itself; a wheel on the panel\'s page meanwhile, and its landing is not made again: the first block stays lit and no hit is focused, the landed block holding none',
            J(lit1) === J([[[9], 9], [[2], 2, '1/1'], [[9], 9], [[2], 2, '1/1'], [], 'function']) && J(lit2) === J([[[9], 9], [[9], -1, '0/1'], [[9], 9], [[2], 2, '1/1'], [], 'function']), J([lit1, lit2]));
        // a press of the Outline menu moves the page by the reader's own hand (pagenav.js navHand, its menu slice run for real with docpanel.js's
        // own watch): a row pressed and Fold all, Open all each count; opening the menu counts nothing; with no watch published the menu works as ever
        const RHp = new Function(cut(dpS, 'panelhand') + '\nreturn readerHand;')(), O = mkNav(); O.win.wpDocPanel.hand = RHp; O.api.navWire(); O.page(O.el.docPanelBody, HEADS);
        const hO = RHp(O.el.docPanelBody), mO = hO.mark(); O.press(O.el.docPanelOutline); const opened = hO.since(mO); O.dom.fire(O.rows()[1], 'click'); const row = [hO.since(mO), hO.mark() - mO];
        O.press(O.el.docPanelOutline); const mF = hO.mark(); O.dom.fire(O.api.menu().querySelectorAll('.pagenav-act')[0] || O.rows()[0], 'click'); const act = hO.since(mF);
        const Q = mkNav(); Q.api.navWire(); Q.page(Q.el.docPanelBody, HEADS); Q.press(Q.el.docPanelOutline); let qErr = ''; try { Q.dom.fire(Q.rows()[1], 'click'); } catch (e) { qErr = String(e); }
        check('a press of the Outline menu is the reader\'s own move of the page (pagenav.js navHand, run for real with docpanel.js readerHand): a row pressed counts once on the page\'s watch, so a landing waiting to be made again is not made; a press at the menu\'s foot counts too; opening the menu counts nothing; with no watch published the row works and throws nothing',
            opened === false && J(row) === J([true, 1]) && act === true && qErr === '' && Q.api.navIsOpen() === false, J([opened, row, act, qErr]));
    }
    {
        // a landing made once more (the review of step 1, 2026-10-16): docpanel.js and popout.js land a page again once its charts are drawn and
        // pass land's fourth argument, true. The block is brought into view and the folds around it opened as the first time, and it is not lit a
        // second time; only true says so. Words a drawn chart holds as a label are found as any words are: the page itself lands at words so too
        const N = mkNav(), root = N.el.plannerPreview, B = () => blocks(root), it = { blocks: PAGE.map((e, i) => ({ id: 'b_' + i, type: 'text' })) };
        draw(N, root, PAGE); N.api.navWire();
        const lit = () => B().map((b, i) => (b.classList.contains('pagenav-hit') ? i : -1)).filter(i => i >= 0), calls = () => B().map(b => b.calls.length);
        const went = was => B().map((b, i) => (b.calls.slice(was[i]).indexOf('scrollIntoView') >= 0 ? i : -1)).filter(i => i >= 0);
        const shut = () => { N.api.foldToggle(root, B()[9]); N.api.foldToggle(root, B()[12]); return stOf(root); };
        const s0 = shut(); let w = calls(); const a1 = [N.api.land(root, it, { at: 'b_12' }, true), stOf(root), went(w), lit()];
        const s1 = shut(); w = calls(); const a2 = [N.api.land(root, it, { q: 'a map' }, true), stOf(root), went(w), lit()];
        const odd = [false, undefined, null, 1, 'true', {}, [true]].map(ag => { N.dom.runTimers(); w = calls(); const r = N.api.land(root, it, { at: 'b_6' }, ag); return J([r, went(w), lit()]); });
        N.dom.runTimers(); const out = lit();
        const C = mkNav(), rc = C.el.docPanelBody, d = C.dom;
        rc.appendChild(mk(d, 'div', 'wrap', [blk(d, 0, [mk(d, 'h2', '', ['Flow'])]), blk(d, 1, [mk(d, 'div', 'diagram fc-box', [mk(d, 'svg', '', [mk(d, 'style', '', ['.nodeLabel { color: red } start here']),
            mk(d, 'g', 'node', [mk(d, 'foreignObject', '', [mk(d, 'div', '', [mk(d, 'span', 'nodeLabel', ['Start ', mk(d, 'b', '', ['here'])])])])])])])]), blk(d, 2, [mk(d, 'p', '', ['start here, in words'])])]));
        const cw = blocks(rc).map(b => b.calls.length), chart = [C.api.land(rc, null, { q: 'START  here' }), blocks(rc).map((b, i) => (b.calls.slice(cw[i]).indexOf('scrollIntoView') >= 0 ? i : -1)).filter(i => i >= 0), blocks(rc).map(b => b.classList.contains('pagenav-hit'))];
        check('a landing made once more (pagenav.js land with its fourth argument true, run for real; the review of step 1): a block, and words, brought into view and the folds around them opened as the first time, and nothing lit a second time; any other fourth argument lights the block as a landing does, and the light goes out by itself; words a drawn chart holds as its label are found as any words are, its style sheet not read',
            s0 === '0- 1 2 3 4 5 6 7- 8- 9S 10H 11H 12SH 13H 14H- 15H- 16H 17H 18H 19-' && J(a1) === J([true, OPEN, [12], []]) && s1 === s0 && J(a2) === J([true, OPEN, [12], []])
            && odd.every(o => o === J([true, [6], [6]])) && J(out) === '[]' && J(chart) === J([true, [1], [false, true, false]]), J([s0, a1, s1, a2, odd, out, chart]));
    }
    {
        // the folds kept for a page are put on before it moves; a place that is no reading place is not given folds
        const store = mkStore(), A = mkNav({ store: store }), ra = A.el.plannerPreview; draw(A, ra, PAGE); A.api.foldApply(ra); A.api.foldToggle(ra, blocks(ra)[2]); A.api.foldToggle(ra, blocks(ra)[9]);
        const Bn = mkNav({ store: store }), rb = Bn.el.plannerPreview, it = { blocks: PAGE.map((e, i) => ({ id: 'b_' + i })) }; draw(Bn, rb, PAGE); const bare = stOf(rb);
        const r = Bn.api.land(rb, it, { at: 'b_12' }), put = [stOf(rb), rb.className, blocks(rb)[12].calls.filter(c => c === 'scrollIntoView').length];
        const Cn = mkNav({ store: store }), rc = Cn.el.plannerPreview; draw(Cn, rc, PAGE); const r19 = Cn.api.land(rc, it, { at: 'b_19' }), put19 = [stOf(rc), blocks(rc)[19].calls.filter(c => c === 'scrollIntoView').length];   // nothing around it to open: the kept folds are put on all the same
        const Z = mkNav(), rz = mk(Z.dom, 'div', 'loose', []); rz.id = 'elsewhere'; Z.doc.body.appendChild(rz); rz.appendChild(mk(Z.dom, 'div', 'wrap', [blk(Z.dom, 0, [mk(Z.dom, 'h2', '', ['Head'])]), blk(Z.dom, 1, [mk(Z.dom, 'p', '', ['body words'])])]));
        const rz1 = Z.api.land(rz, { blocks: [{ id: 'a' }, { id: 'b' }] }, { at: 'b' }), zs = [rz.className, blocks(rz).map(b => b.childNodes.length)];
        check('a page drawn a moment ago and opened at a block: the folds this computer keeps for it are put on first, so nothing above the block folds away after it was brought into view, and those around it are then opened; a box that is no reading place lands without being given folds',
            bare === PAGE.map((e, i) => i + '-').join(' ') && r === true && J(put) === J(['0- 1 2S 3H 4H 5H 6H 7H- 8- 9 10 11 12 13 14- 15- 16 17 18 19-', 'doc-view pv-folds', 1]) && r19 === true && J(put19) === J(['0- 1 2S 3H 4H 5H 6H 7H- 8- 9 10 11 12 13 14- 15- 16 17 18 19-', 1]) && rz1 === true && J(zs) === J(['loose', [1, 1]]), J([bare, r, put, rz1, zs]));
    }
    {
        // landing over what the two real renderers draw: the number each drawn block carries is its place in the item's blocks
        const d = makeDom(), camp = { id: 'c1', items: {} };
        const plan = { id: 'p9', type: 'planner', blocks: [{ id: 'b_t', type: 'h1', title: 'Session 7' }, null, { id: 'b_m', type: 'mystery' }, { id: 'b_h', type: 'h2', title: 'Beats' }, { id: 'b_n', type: 'node', title: 'The inn', tag: 'social', rows: [{ col1: 'Ask', col2: 'The barkeep knows Osk' }] }, { id: 'b_x', type: 'text', content: '<p>The end.</p>' }] };
        const page = { id: 'd9', type: 'doc', meta: { title: 'Rules' }, blocks: [{ id: 'b_t', type: 'h1', title: 'House rules' }, 7, { id: 'b_m', type: 'mystery' }, { id: 'b_s', type: 'h2', title: 'At the table', cols: 2 }, { id: 'b_3', type: 'h3', title: 'Inspiration' }, { id: 'b_p', type: 'text', content: '<p>Spend it on a reroll.</p>' }, { id: 'b_r', type: 'rule' }, { id: 'b_e', type: 'h2', title: 'Last' }] };
        const into = (N, root, tree) => { while (tree.firstChild) root.appendChild(tree.firstChild); };
        const P1 = mkNav(), rp = P1.el.docPanelBody; into(P1, rp, toTree(d, real.pv(plan, camp, ''))); P1.api.navWire();
        const D1 = mkNav(), rd = D1.el.docReaderBody; into(D1, rd, toTree(d, DR.renderDoc(page, {}))); D1.api.navWire();
        const nums = r => blocks(r).map(b => b.dataset.blk).join(' '), lit = (N, r, l, it) => { const was = blocks(r).map(b => b.calls.length), ok = N.api.land(r, it, l); return [ok, blocks(r).map((b, i) => b.calls.length > was[i] ? b.dataset.blk : null).filter(x => x !== null)]; };
        const pl = [nums(rp), lit(P1, rp, { at: 'b_n' }, plan), lit(P1, rp, { at: 'b_m' }, plan), lit(P1, rp, { q: 'barkeep knows' }, plan), lit(P1, rp, { at: 'b_x' }, plan)];
        const dl = [nums(rd), lit(D1, rd, { at: 'b_3' }, page), lit(D1, rd, { at: 'b_m' }, page), lit(D1, rd, { q: 'reroll' }, page), lit(D1, rd, { at: 'b_e' }, page), rd.querySelectorAll('.doc-section .pv-blk').length];
        check('landing over what the real renderers draw (the planner\'s own renderer, sliced, and docrender.js renderDoc, each read into the test page): both number a drawn block by its place in the item\'s blocks; the planner draws nothing for an entry that is no block and an empty box for a kind it does not know, the page draws nothing for either, and every block after them keeps its own number, so a landing by id finds the very block — inside a section\'s columns too — and one whose block is not drawn finds none',
            J(pl) === J(['0 2 3 4 5', [true, ['4']], [true, ['2']], [true, ['4']], [true, ['5']]]) && J(dl) === J(['0 3 4 5 6 7', [true, ['4']], [false, []], [true, ['5']], [true, ['7']], 3]), J([pl, dl]));
    }
    {
        // the page's Find and the landing fold words alike; a window of its own keeps its page's folds under the page alone
        const dp = read('scripts/docpanel.js'), a = dp.indexOf('// [textcheck:panelfold-start]'), z = dp.indexOf('// [textcheck:panelfold-end]');
        const fold = new Function(dp.slice(a, z) + '\nreturn fold;')(), N = mkNav(), lf = N.api.landFold;
        let diff = -1; for (let c = 0; c < 0x10000 && diff < 0; c++) { const s = 'a' + String.fromCharCode(c) + 'B'; if (fold(s) !== lf(s)) diff = c; }
        const astral = ['\ud83d\ude00', '\ud835\udc00', 'Caf\u00e9 \u1ebd'].every(s => fold(s) === lf(s));
        const pop = (s, key) => { const K = mkNav({ popout: true, search: s, camp: { id: 'zz', activeItemId: 'zz' } }); if (key !== undefined) K.win.wpPopoutKey = key; return K.api.navKeyFor('popoutBody'); };
        const keys = [pop('?popout=doc:cA/pA/at:b_1', 'cA/pA'), pop('?popout=doc:cA/pA/q:x%2Fy', 'cA/pA'), pop('?popout=doc:cA/pA', 'cA/pA'), pop('?popout=doc:cA/pA/at:b_1', 7), pop('?popout=doc:cA/pA', '')];
        check('the landing folds words exactly as the page\'s Find does (docpanel.js fold, sliced, over every character of the basic plane and beyond it); a page in a window of its own keeps its folds under the campaign and the page popout.js read from its address, never the landing after them, so it shares them with every other place that shows the page; the module publishes landOf, land and flash, and lights an element in one place only, which the Outline and a landing share',
            diff === -1 && astral && J(keys) === J(['cA/pA', 'cA/pA', 'cA/pA', 'cA/pA/at:b_1', '']) && src.includes("        landOf: landOf, land: land, flash: navFlash   // 1.5.4: a page opened at one block or at a search hit") && src.split("classList.add('pagenav-hit')").length === 2, J([diff, keys]));
    }

    /* ---- wired, styled and said ---- */
    {
        const ix = read('index.html'), css = read('style.css'), hb = read('scripts/handbook.js'), dr = read('scripts/docrender.js'), pl = read('scripts/planner.js'), wn = ['WHATSNEW.txt', 'system/app/assets/whatsnew.txt'].map(f => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n'));
        const ICO = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M8 12h12M12 18h8"/></svg>';
        check('the Outline is wired: the page has its three buttons, each with the same tooltip — in the planner\'s bar before the Find box, in the reader\'s head before its close button, first in the panel\'s search row — and loads the module after the one that builds a window of its own; the module names the four places, each a button and the box its page is drawn in; the reader steps back from Escape while the menu is up',
            ix.includes('        <button class="tool ghost" id="plannerOutlineBtn" title="' + TIP + '">' + ICO + ' Outline</button>\n        <input type="search" id="plannerFind"')
            && ix.includes('<h3 id="docReaderTitle">Page</h3><button id="docReaderOutline" class="tool ghost" title="' + TIP + '">' + ICO + ' Outline</button><button id="docReaderClose"')
            && ix.includes('    <div id="docPanelSearchRow">\n        <button class="tool ghost notepad-btn" id="docPanelOutline" title="' + TIP + '">Outline</button>\n')
            && ix.includes('<script type="module" src="scripts/popout.js"></script>\n<script type="module" src="scripts/pagenav.js"></script>\n') && ix.split('scripts/pagenav.js').length === 2 && !/id="popoutOutline"/.test(ix)
            && src.includes("var NAV_PLACES = [['plannerOutlineBtn', 'plannerPreview'], ['docPanelOutline', 'docPanelBody'], ['docReaderOutline', 'docReaderBody'], ['popoutOutline', 'popoutBody']];") && src.includes("pb.title = '" + TIP + "';")
            && ['plannerPreview', 'docPanelBody', 'docReaderBody'].every(id => ix.includes('id="' + id + '"')) && /var ABOVE = \['pageNavMenu', /.test(hb));
        check('the Outline is styled: the menu is fixed over the reader and its notices, scrolls by itself past three fifths of the window, and its rows step in by level; a heading jumped to is lit and, in the planner\'s own view, lands clear of the bar that stays at the top; with motion reduced it is outlined and nothing moves; a window of its own still hides everything but its wrap, where the menu is made',
            /\n  #pageNavMenu \{ position: fixed; z-index: 99996; [^\n]*max-height: 60vh; overflow: auto;/.test(css) && /\n  #docReaderModal \{ position: fixed;[^\n]*z-index: 99990;/.test(css) && /\n  body\.doc-reader-open #toast \{ z-index: 99995; \}/.test(css)
            && /\n  #pageNavMenu \.pagenav-lv2 \{ padding-left: 26px; \}\n  #pageNavMenu \.pagenav-lv3 \{ padding-left: 40px;/.test(css) && /\n  \.doc-view \.pagenav-hit, #popoutBody \.pagenav-hit \{ animation: pageNavHit 1\.3s ease-out;/.test(css)
            && /@media \(prefers-reduced-motion: reduce\) \{ \.doc-view \.pagenav-hit, #popoutBody \.pagenav-hit \{ animation: none; outline: 2px solid var\(--gold\); \} \}/.test(css) && /\n  #plannerPreview \.pv-blk, #plannerPreview \.pv-blk :is\(h1, h2, h3\) \{ scroll-margin-top: var\(--pv-top, 58px\); \}/.test(css)
            && css.includes('body.popout-mode > *:not(#popoutWrap):not(#chatPanel):not(#customConfirm):not(svg):not([id^="dmermaid"]) { display: none !important; }') && /#popoutBar #popoutDock, #popoutBar #popoutOutline \{ flex: none;/.test(css));
        check('the renderers still draw what the outline reads: each block in a box of its own that carries the block\'s number, a page\'s and a planner\'s alike, with a heading, a node\'s title or a table\'s title as the first thing in it',
            dr.includes("var blk = '<div class=\"pv-blk\" data-blk=\"' + i + '\">';") && pl.includes("html += '<div class=\"pv-blk\" data-blk=\"' + _bi + '\">';") && dr.includes("case 'h3': blk += '<h3 class=\"doc-h3\">'")
            && dr.includes("blk += '<div' + layoutAttrs(b, 'node plain-table doc-tablewrap') + '>';\n                if (b.title) blk += '<h3>'") && pl.includes("html += '<div class=\"node' + (plainPv ? ' plain-table' : '') + '\">';\n              if (!plainPv || b.title) html += '<h3>'"));
        const mainSrc = read('scripts/main.js'), panelSrc = read('scripts/docpanel.js'), scripts = fs.readdirSync(path.join(app, 'scripts')).filter(f => /\.js$/.test(f));
        check('the folds are wired: Find in the planner\'s own view and Find in the panel over the map open the fold their current hit lies in before they scroll to it; the two exports that read the preview\'s own markup take the folds off first and put them back, the picture also when it fails; the panel says which page it shows; the module publishes what these call, asks for the open campaign, follows another window through the storage event, and holds every fold class and the folds\' own storage key by itself',
            pl.includes("      if (typeof window !== 'undefined' && window.wpPageNav && typeof window.wpPageNav.reveal === 'function') window.wpPageNav.reveal(h[0]);   // a hit inside a folded part: the fold is opened first (pagenav.js)\n      h[0].scrollIntoView({ block: 'center', behavior: quiet ? 'auto' : 'smooth' });\n")
            && panelSrc.includes("if (hits[curHit] && typeof window !== 'undefined' && window.wpPageNav && typeof window.wpPageNav.reveal === 'function') window.wpPageNav.reveal(hits[curHit][0]); if (scroll !== false && hits[curHit]) hits[curHit][0].scrollIntoView(")
            && panelSrc.includes('window.wpDocPanel = { open: open, close: close, refresh: refresh, popOut: popOut, openId: function() { return openId; }, tabs: function() { return tabs.slice(); } };')
            && mainSrc.includes("          if (navX && navX.strip) navX.strip(pvX);   // the page as drawn: an export carries no fold and no fold arrow (pagenav.js)\n          var content = pvX.innerHTML;\n          if (navX && navX.apply) navX.apply(pvX);\n")
            && mainSrc.includes("refoldI = function() { if (pvI && navI && navI.apply) navI.apply(pvI); };\n      if (pvI && navI && navI.strip) navI.strip(pvI);") && mainSrc.includes("      html2canvas(target, opts).then(function(cv) {\n          refoldI();\n") && mainSrc.includes("      }).catch(function() {\n\n          refoldI();\n")
            && src.includes("        reveal: function(el) { var root = navRootOf(el); return root ? foldReveal(root, el, false) : false; },") && src.includes('        strip: foldStrip, apply: foldApply') && src.includes("import { getActiveCampaign } from './models.js';")
            && src.includes("    if (typeof window.addEventListener === 'function') window.addEventListener('storage', function(e) {\n        if (e && e.key !== null && e.key !== FOLD_STORE) return;\n")
            && src.includes("        if (typeof window.MutationObserver === 'function') new window.MutationObserver(function() { foldApply(root); }).observe(root, { childList: true });")
            && J(scripts.filter(f => /pv-fold|wp_pageFolds/.test(read('scripts/' + f)))) === J(['pagenav.js']));
        const fa = css.indexOf('  @media screen {\n    .pv-folds .pv-fold-btn { display: block; float: left;'), fz = css.indexOf('\n  }\n  #plannerPreview .pv-blk, #plannerPreview .pv-blk :is(h1, h2, h3) { scroll-margin-top: var(--pv-top, 58px); }'), foldCss = fa > 0 && fz > fa ? css.slice(fa + '  @media screen {\n'.length, fz + 1) : '';
        const am = /\n    \.pv-folds \.pv-fold-btn \{ display: block; float: left; width: (\d+)px; height: (\d+)px; margin: (-?\d+)px (-?\d+)px (-?\d+)px (-?\d+)px; padding: 0;/.exec('\n' + foldCss), box = am ? [+am[6] + +am[1] + +am[4], +am[3] + +am[2] + +am[5]] : null;
        check('the folds are styled, on screen only: an arrow shows only on a page the folds have marked; an open block is never positioned for it (a positioned block would be painted after the blocks before it, its background over a picture floated beside it): the arrow is floated into the left margin with a margin box of no width and no height, so it moves and clears nothing, and only a folded part, whose content is put away, is positioned for its word and its arrow; what is put away keeps its place in the page\'s layout — never display: none, so a chart drawn while it is folded is laid out as it will be shown —, a folded part is clipped downwards only so that its arrow in the margin shows, and its word and a heading\'s count are printed from an attribute; every rule lives under the folds\' own class inside the screen block, so a printed page is the page as drawn',
            foldCss.length > 500 && css.includes('\n  .pv-fold-btn { display: none; }\n  @media screen {\n') && foldCss.split('\n').filter(Boolean).every(l => /^    \.pv-folds \.pv-/.test(l)) && !/display:\s*none/.test(foldCss)
            && J(box) === J([0, 0]) && am[6] === '-17' && foldCss.split('position: ').length === 4 && !/\.pv-folds \.pv-blk \{/.test(foldCss)
            && foldCss.includes('    .pv-folds .pv-fold-body.pv-fold-shut { position: relative; display: flow-root; height: 26px; overflow-x: visible; overflow-y: clip; visibility: hidden; margin: 4px 0; cursor: pointer; }')
            && foldCss.includes('    .pv-folds .pv-fold-body.pv-fold-shut > .pv-fold-btn { float: none; position: absolute; left: -17px; top: 4px; margin: 0; visibility: visible; }\n')
            && foldCss.includes('    .pv-folds .pv-blk.pv-fold-hid { height: 0; overflow: hidden; visibility: hidden; margin: 0; padding: 0; }\n    .pv-folds .pv-blk.pv-fold-hid > .pv-fold-btn { visibility: hidden; }\n    .pv-folds .pv-blk.pv-fold-hid::after { content: none; }\n')
            && foldCss.split('content: attr(data-fold-hint)').length === 3 && foldCss.includes("    .pv-folds .pv-fold-btn::before { content: '\\25BE'; }\n    .pv-folds .pv-fold-shut > .pv-fold-btn::before { content: '\\25B8'; }\n")
            && foldCss.includes('    .pv-folds .pv-fold-head.pv-fold-shut > .pv-fold-btn + * ~ * { height: 0; overflow: hidden; visibility: hidden; margin: 0; padding: 0; border: 0; }')
            && foldCss.indexOf('.pv-fold-body.pv-fold-shut {') < foldCss.indexOf('.pv-blk.pv-fold-hid {')
            && (css.replace(foldCss, '').match(/pv-fold/g) || []).length === 2 && /\n  #pageNavMenu \.pagenav-foot \{ display: flex;/.test(css) && /\n  #pageNavMenu \.pagenav-act \{ flex: 1;/.test(css), J([box, foldCss.slice(0, 200)]));
        const FOLDNOTE = '- Fold a page down to what you need. An arrow in the left margin folds\n  a section, from its heading to the next heading. Each text, table and\n  chart has a small arrow of its own. Click a folded part to open it.\n  Fold all and Open all are at the foot of the Outline menu. A page\n  opens as you left it on this computer. Find and the Outline open\n  what they lead to. An export or a print shows the whole page.\n';
        check('the folds are said: Help\'s Planners part, right after the Outline, says what the arrows fold, how a folded part opens, where Fold all and Open all are, that a page opens as it was left and that each person\'s folds are their own, what Find and the Outline do, and that an export or a print shows the whole page; both release notes carry the lines, alike',
            ix.includes('a player&rsquo;s reader have the same button.</li>\n                          <li><b>Folds</b>: an arrow in the page&rsquo;s left margin folds a section, from its heading down to the next heading. Each text, table and chart has a small arrow of its own. Click a folded part to open it. <b>Fold all</b> and <b>Open all</b> are at the foot of the Outline menu. A page opens as you left it on this computer, and each person&rsquo;s folds are their own. Find and the Outline open what they lead to. An export or a print shows the whole page.</li>\n')
            && wn.every(t => t.includes("  a player's reader.\n" + FOLDNOTE)));
        check('the Outline is said: Help\'s Planners part says what the button does and where else it is; both release notes carry the line, alike; the suite is one of those CI runs',
            fs.readFileSync(path.join(root, '.github/workflows/checks.yml'), 'utf8').includes('        run: node tools/pagecheck.js') && ix.includes('<li><b>Outline</b>, beside the Find box, lists the page&rsquo;s headings. Click one to jump to it. The panel over the map, a page in its own window and a player&rsquo;s reader have the same button.</li>')
            && wn.every(t => t.includes('- Outline, wherever you read a planner or a page: the button lists\n  the page\'s headings, and a click on one jumps to it. It is in the\n  planner\'s own view, the panel over the map, a page\'s own window and\n  a player\'s reader.\n')));
    }

    /* ---- the planner's own view: a block or a heading jumped to lands clear of the Find bar, however many rows the bar takes (backlog 143) ---- */
    // Found live 2026-10-16: the bar takes one row or more as the view's width allows (99 px in a 1366 by 850 window with the left panel
    // docked), and the style sheet gave a block a fixed 58 px, and a heading the Outline jumps to none at all, so the top of either stayed
    // under the bar. pagenav.js's bartop slice measures the bar and writes the margin; it is run here on a page of plain objects
    {
        const css = read('style.css'), ix = read('index.html'), wn = ['WHATSNEW.txt', 'system/app/assets/whatsnew.txt'].map(f => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n'));
        const bt = slice('bartop'), B = new Function(bt + '\nreturn { NAV_BAR: NAV_BAR, navBarTop: navBarTop, navBarSet: navBarSet, navBarWire: navBarWire };')();
        // a page of plain objects of this suite's own: a bar whose height a check sets, a box whose style keeps what is written on it, a window
        const page = o => {
            o = o || {};
            const props = {}, log = [], on = {}, made = [];
            const box = { style: { setProperty(k, v) { log.push('set ' + k + ' ' + v); props[k] = v; }, removeProperty(k) { log.push('remove ' + k); delete props[k]; } } };
            const bar = { h: o.h, getBoundingClientRect() { if (o.throws) throw new Error('no layout'); return { top: 0, height: this.h, bottom: this.h }; } };
            const doc = { defaultView: { addEventListener(t, f) { (on[t] = on[t] || []).push(f); } }, getElementById: id => id === 'plannerFindBar' ? (o.noBar ? null : bar) : id === 'plannerPreview' ? (o.noBox ? null : box) : null };
            function Obs(cb) { made.push(this); this.cb = cb; this.seen = []; }
            Obs.prototype.observe = function(el) { this.seen.push(el); };
            return { doc, bar, box, props, log, on, made, Obs };
        };
        const RULE = '\n  #plannerPreview .pv-blk, #plannerPreview .pv-blk :is(h1, h2, h3) { scroll-margin-top: var(--pv-top, 58px); }';
        const fb = /\n  #plannerFindBar \{ position: sticky; top: (-?\d+)px; [^\n]*? margin: (-?\d+)px (-?\d+)px (\d+)px; /.exec(css), wrapPad = /\n  #plannerPreviewWrap \{ [^\n]*?padding: (\d+)px;/.exec(css);
        const fbm = /scroll-margin-top: var\(--pv-top, (\d+)px\)/.exec(css), fallback = fbm ? fbm[1] : '';
        const bad = ['', 0, -3, NaN, Infinity, -Infinity, '99', null, undefined, 10000, {}, [98]].filter(h => B.navBarTop(h) !== '');
        check('the margin a block keeps above it follows the bar: its height rounded up and the gap the bar keeps under it, so a one-row bar of 48 px gives exactly the 58 px the style sheet always gave, and two or three rows give more; nothing for a height that is no measure (a view put away measures 0, and no text, list or object is a height)',
            B.navBarTop(48) === '58px' && B.navBarTop(56.8) === '67px' && B.navBarTop(98.6) === '109px' && B.navBarTop(128.6) === '139px' && B.navBarTop(0.2) === '11px' && B.navBarTop(9999.5) === '10010px' && bad.length === 0 && B.NAV_BAR[2] === 10,
            J([B.navBarTop(98.6), bad]));
        // where a block lands, worked out from the style sheet and the slice: the bar sticks at the very top of the view and covers its own height;
        // a block jumped to stands its margin below the view's top. Every bar height lands it clear of the bar, at the very place the page's first
        // block stands under the bar (the bar's height and its own margin-bottom). The old fixed 58 px left 41 px of it under a bar of two rows
        const lands = [56.8, 98.6, 128.6, 200, 431.3].map(h => { const p = page({ h }); B.navBarSet(p.doc); const m = parseFloat(p.props['--pv-top'] || (fallback + 'px')); return { h, m, clear: m >= h, first: m === Math.ceil(h) + (fb ? +fb[4] : NaN) }; });
        check('a block or a heading brought to the top of the planner\'s own view lands clear of the Find bar, however many rows it takes: the style sheet\'s one rule gives every block and every heading in it (what the Outline and a landing bring to the top) the margin the slice writes, with 58 px where nothing is measured; the bar sticks at the very top of the view (its top and its upper margin undo the view\'s padding), and the gap the slice adds is the bar\'s own margin-bottom, so a block lands where the page\'s first block stands under the bar',
            lands.every(l => l.clear && l.first) && css.split(RULE).length === 2 &&fallback === '58' && !/\n  #plannerPreview \.pv-blk \{ scroll-margin-top: 58px; \}/.test(css)
            && fb && wrapPad && +fb[1] === -wrapPad[1] && +fb[2] === -wrapPad[1] && +fb[3] === -wrapPad[1] && +fb[4] === B.NAV_BAR[2] && css.split('--pv-top').length === 2,
            J([lands, fb && fb.slice(1), wrapPad && wrapPad[1], fallback]));
        // what the Outline brings to the top is a heading of its block (navGo(now.el), now.el from navOutline), and a landing brings the block itself:
        // both are what the rule names
        const d0 = makeDom(), pv = mk(d0, 'div', 'wrap', [blk(d0, 0, [mk(d0, 'h1', '', ['Title'])]), blk(d0, 1, [mk(d0, 'h2', '', ['A section'])]), blk(d0, 2, [mk(d0, 'div', 'node', [mk(d0, 'h3', '', ['A node'])])]), blk(d0, 3, [mk(d0, 'h3', 'doc-h3', ['A sub-heading'])])]);
        const heads = O.navOutline(pv);
        check('what the Outline and a landing bring to the top is what the rule names: every heading the Outline lists is an h1, h2 or h3 inside a block, the Outline\'s press scrolls that heading and a landing scrolls the block, both through the one scroll (block start)',
            heads.length === 4 && heads.every(h => ['H1', 'H2', 'H3'].indexOf(h.el.nodeName) >= 0 && h.el.closest('.pv-blk')) && src.includes('        navGo(now.el);\n') && src.includes("        if (again === true) navTop(el); else navGo(el);\n")
            && src.includes("function navTop(el) { try { if (typeof navBarFor === 'function') navBarFor(el); el.scrollIntoView({ block: 'start', behavior: 'auto' }); } catch (err) {} }") && src.split('scrollIntoView(').length === 2, J(heads.map(h => h.el.nodeName)));
        // the slice on the page of plain objects
        const p1 = page({ h: 98.6 }), w1 = B.navBarSet(p1.doc); p1.bar.h = 0; const w2 = B.navBarSet(p1.doc);
        const pNo = page({ h: 98.6, noBar: true }); pNo.props['--pv-top'] = '99px'; const w3 = B.navBarSet(pNo.doc);
        const pBox = page({ h: 98.6, noBox: true }), w4 = B.navBarSet(pBox.doc), pThrow = page({ h: 98.6, throws: true }), w5 = B.navBarSet(pThrow.doc);
        let threw = false; try { B.navBarSet(null); B.navBarSet({}); } catch (e) { threw = true; }
        check('the margin is written on the box of the page and taken off where nothing is measured: a bar of two rows gives 109 px; the view put away (the bar measures 0) takes it off, so the style sheet\'s 58 px stands; no bar takes it off; no box, a bar that cannot be measured, or a page that is none writes nothing and throws nothing',
            w1 === '109px' && w2 === '' && J(p1.log) === J(['set --pv-top 109px', 'remove --pv-top']) && !('--pv-top' in p1.props) && w3 === '' && !('--pv-top' in pNo.props)
            && w4 === '' && pBox.log.length === 0 && w5 === '' && pThrow.log.length === 0 && !threw, J([w1, w2, p1.log, w3, w4, w5, threw]));
        const pO = page({ h: 56.8 }), r1 = B.navBarWire(pO.doc, pO.Obs), at1 = pO.props['--pv-top']; pO.bar.h = 128.6; pO.made[0].cb([]); const at2 = pO.props['--pv-top']; pO.bar.h = 0; pO.made[0].cb([]); const at3 = pO.props['--pv-top'];
        const pR = page({ h: 98.6 }), r2 = B.navBarWire(pR.doc, undefined), atR1 = pR.props['--pv-top']; pR.bar.h = 56.8; (pR.on.resize || []).forEach(f => f()); const atR2 = pR.props['--pv-top'];
        const pN = page({ h: 98.6, noBar: true }), r3 = B.navBarWire(pN.doc, pN.Obs);
        let threw2 = false, r4, r5; try { r4 = B.navBarWire(null, pN.Obs); r5 = B.navBarWire({}, pN.Obs); } catch (e) { threw2 = true; }
        check('the margin is kept current whenever the bar changes size: one observer follows the bar and writes the margin at once (two rows and a wider view, then three, then the view put away); with no observer at hand, every change of the window\'s size; with no bar, nothing is followed, made or written; the slice reads nothing but the page it is handed, and pagenav.js hands it the page and the browser\'s observer once, right after the module wires its places',
            r1 === true && pO.made.length === 1 && pO.made[0].seen.length === 1 && pO.made[0].seen[0] === pO.bar && at1 === '67px' && at2 === '139px' && at3 === undefined && !pO.on.resize
            && r2 === true && atR1 === '109px' && atR2 === '67px' && (pR.on.resize || []).length === 1
            && r3 === false && pN.made.length === 0 && pN.log.length === 0 && !pN.on.resize && r4 === false && r5 === false && !threw2
            && !/\bwindow\b|\bdocument\b/.test(bt.replace(/\/\/[^\n]*/g, '')) && src.includes("\n    navWire();\n    navBarWire(document, window.ResizeObserver);   // backlog 143") && src.split('navBarWire(').length === 3,
            J([r1, at1, at2, at3, r2, atR1, atR2, r3, r4, r5, threw2]));
        // a landing made as the view comes up (quick-jump's Enter from the data map, found in the review of 2026-10-16) scrolls before the browser
        // tells the observer the bar's size, and the view put away had taken the margin off: the one scroll measures the bar itself first. Run for real:
        // the land slice and this one together, a block that records the margin as it is scrolled to, and no observer told anything
        const LT = new Function("'use strict';\n" + slice('land') + '\n' + bt + '\nreturn { navTop: navTop, navBarFor: navBarFor };')();
        const at = [], own = (p, inPv) => ({ ownerDocument: p.doc, closest: sel => (inPv && sel === '#plannerPreview' ? p.box : null), scrollIntoView(o) { at.push([p.props['--pv-top'], o && o.block]); } });
        const pL = page({ h: 98.6 }); LT.navTop(own(pL, true)); pL.bar.h = 128.6; LT.navTop(own(pL, true));
        const pP = page({ h: 98.6 }); LT.navTop(own(pP, false)); const pH = page({ h: 0 }); pH.props['--pv-top'] = '109px'; LT.navTop(own(pH, true));
        let threw3 = false, f3; try { LT.navTop(null); f3 = [LT.navBarFor(null), LT.navBarFor({}), LT.navBarFor({ ownerDocument: null, closest: () => ({}) })]; } catch (e) { threw3 = true; }
        check('a block or a heading scrolled to as the planner\'s own view comes up lands clear of the bar all the same: the one scroll measures the bar first, so the margin is the bar\'s as it stands at that moment (two rows, then three) though no observer was told; a block of any other place writes nothing and is scrolled all the same; the view put away measures nothing and takes the margin off; nothing that is no block throws or writes',
            J(at) === J([['109px', 'start'], ['139px', 'start'], [undefined, 'start'], [undefined, 'start']]) && J(pL.log) === J(['set --pv-top 109px', 'set --pv-top 139px']) && pP.log.length === 0 && J(pH.log) === J(['remove --pv-top'])
            && !threw3 && J(f3) === J(['', '', '']) && src.split('navBarFor(').length === 3,
            J([at, pL.log, pP.log, pH.log, threw3, f3]));
        // the other places a page is read have no bar over the box they scroll: their bars stand beside it, so a block there lands at the top in sight
        const stickies = css.split('\n').filter(l => /position:\s*sticky/.test(l)).map(l => l.trim().split(' {')[0]);
        check('only the planner\'s own view has a bar over the page it scrolls: the page panel\'s search row, a page\'s own window\'s bar and the reader\'s head stand outside the box each scrolls, and no rule makes anything over a page sticky but the planner\'s Find bar, so the panel, a window of its own and the reader are left as they were',
            J(stickies) === J(['.lib-fbtns', '.sheet-frame', '.sheet-sticky-titles > .sheet-section:not(.sheet-subsection):not(.sheet-dash) > .sheet-sec-title', '#plannerFindBar'])
            && /\n  #docPanelSearchRow \{ [^\n]*flex: none;/.test(css) && /\n  #docPanelBody \{ overflow: auto;/.test(css) && /\n  #popoutBar \{ flex: none;/.test(css) && /\n  #docReaderBody \{ flex: 1; overflow-y: auto;/.test(css)
            && /<div id="docReaderModal" style="display:none;">\n    <div class="doc-reader-head">[^\n]*\n    <div id="docReaderBody" class="doc-view"><\/div>\n<\/div>/.test(ix) && J(B.NAV_BAR.slice(0, 2)) === J(['plannerFindBar', 'plannerPreview']), J(stickies));
        check('the landing clear of the bar is said: both release notes carry the line under 1.5.4\'s fixes, alike', wn.every(t => t.split("- In a planner's or a page's own view, a part the Outline jumps to, or\n  a search lands on, is no longer half hidden under the Find bar. Where\n  the bar took two rows, the top of the part stayed under it.\n").length === 2) && wn[0].indexOf("- In a planner's or a page's own view, a part the Outline jumps to, or\n  a search lands on, is no longer half hidden under the Find bar. Where\n  the bar took two rows, the top of the part stayed under it.\n") < wn[0].indexOf('WAYPOINT 1.5.3'));
    }

    summed = true;
    console.log('\n' + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exit(1);
})();

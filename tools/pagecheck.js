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
        setItem(k, v) { if (s.failWrite) throw new Error('the store is full'); s.sets++; s.data[k] = String(v); },
        removeItem(k) { if (s.failWrite) throw new Error('the store is full'); delete s.data[k]; } }; return s; };
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
            + ' partsOn: partsOn, partOpen: partOpen, foldHash: foldHash, navKeyFor: navKeyFor, foldPage: foldPage, foldRead: foldRead, foldGet: foldGet, foldPut: foldPut, foldText: foldText, foldWords: foldWords, foldParts: foldParts, foldApply: foldApply, foldSet: foldSet, foldToggle: foldToggle, foldAll: foldAll, foldReveal: foldReveal, foldStrip: foldStrip,'
            + ' mem: function() { return Object.keys(_foldMem); }, caps: { store: FOLD_STORE, pages: FOLD_PAGES, marks: FOLD_MARKS, total: FOLD_TOTAL } };')(doc, win, loc, dom.setTimeout, URLSearchParams, () => N.camp);
        const page = (root, heads) => { while (root.firstChild) root.removeChild(root.firstChild); const w = mk(dom, 'div', 'wrap', heads.map((h, i) => blk(dom, h.bi === undefined ? i : h.bi, h.tag ? [mk(dom, h.tag, '', [h.text])] : [mk(dom, 'p', '', [h.text])]))); root.appendChild(w); return w; };
        const rows = () => (api.menu() ? api.menu().querySelectorAll('.pagenav-row') : []), heads = root => root.querySelectorAll('.pv-blk').map(b => b.childNodes.filter(c => !(c.nodeType === 1 && c.className === 'pv-fold-btn'))[0]);
        return Object.assign(N, { dom, doc, win, el, api, page, rows, heads, store, obs, press: (b, key) => dom.fire(b, 'click', { detail: key ? 0 : 1 }), shape: () => rows().map(r => r.className + '|' + r.dataset.blk + '|' + r.childNodes.map(c => (c.nodeType === 3 ? 't:' + c.nodeValue : 'e:' + c.nodeName)).join(',')),
            redrawn: root => obs.filter(x => x.target === root).forEach(x => x.fn([])), told: e => (winOn.storage || []).forEach(fn => fn(e)), kept: () => (store.data.wp_pageFolds === undefined ? null : JSON.parse(store.data.wp_pageFolds)) }); };
    const HEADS = [{ tag: 'h1', text: 'Title' }, { tag: null, text: 'prose' }, { tag: 'h2', text: 'Part one' }, { tag: 'h3', text: 'A detail' }, { tag: 'h2', text: 'Part two' }];
    {   // 1.6.2 (docs/PLANNER_ORG_DESIGN.md 6.1): a part of a page in a window of its own, from the Outline and from a fold's arrow
        const mkP = may => { const N = mkNav({ camp: { id: 'c1', activeItemId: 'p1', items: { p1: { type: 'planner', blocks: [{ id: 'b_t' }, { id: 'b_p' }, { id: 'b_one' }, { id: 'bad id' }, { id: 'b_two' }] }, d1: { type: 'doc', blocks: [{ id: 'd_a' }] } } } }), opened = [];
            if (may !== null) N.win.wpPageShelf = { partMay: () => { if (may === 'throws') throw new Error('x'); return may; }, openPart: (id, at) => { opened.push([id, at]); return 'part'; } };
            N.api.navWire(); N.page(N.el.plannerPreview, HEADS); N.page(N.el.docPanelBody, [{ tag: 'h1', text: 'Other page' }, { tag: 'h2', text: 'Sec' }, { tag: null, text: 'words' }]); N.page(N.el.docReaderBody, HEADS);
            ['plannerPreview', 'docPanelBody', 'docReaderBody'].forEach(id => N.api.foldApply(N.el[id])); return { N, opened }; };
        const wins = N => (N.api.menu() ? N.api.menu().querySelectorAll('.pagenav-win') : []);
        const Y = mkP(true), N1 = Y.N; N1.press(N1.el.plannerOutlineBtn);
        const drawn = [N1.shape(), wins(N1).map(w => [w.nodeName, w.type, w.className, w.dataset.blk, w.getAttribute('role'), w.getAttribute('aria-label'), w.title, w.childNodes.length, w.previousSibling === N1.rows().filter(x => x.dataset.blk === w.dataset.blk)[0]])];
        const boxed = [N1.api.menu().childNodes[0].className, N1.api.menu().childNodes[0].childNodes.length, N1.api.menu().childNodes[1].className];
        N1.dom.fire(wins(N1)[1], 'click', {}); const afterWin = [J(Y.opened.splice(0)), N1.api.navIsOpen()];
        N1.press(N1.el.plannerOutlineBtn); N1.dom.fire(wins(N1)[2], 'click', {}); const badId = J(Y.opened.splice(0));
        N1.press(N1.el.docPanelOutline); const panelN = wins(N1).length; N1.dom.fire(wins(N1)[1], 'click', {}); const panelPart = J(Y.opened.splice(0));
        N1.press(N1.el.docReaderOutline); const readerN = [wins(N1).length, N1.rows().map(x => x.className).join()]; boxed.push(N1.api.menu().childNodes[0].className); N1.api.navClose(false);
        // the keys: Right goes from a row to its window button and Left back; Up and Down go on from the button's own row
        N1.press(N1.el.plannerOutlineBtn, true); const at = () => { const a = N1.doc.activeElement; return (a.className.indexOf('pagenav-win') >= 0 ? 'w' : a.className.indexOf('pagenav-row') >= 0 ? 'r' : '?') + (a.dataset.blk || ''); };
        const kd = k => { const e = N1.dom.fire(N1.doc.activeElement, 'keydown', { key: k }); return at() + (e.defaultPrevented ? '!' : ''); };
        const keys = [at(), kd('ArrowRight'), kd('ArrowRight'), kd('ArrowDown'), kd('ArrowRight'), kd('ArrowLeft'), kd('ArrowLeft'), kd('ArrowRight'), kd('ArrowUp')];
        // the menu's keys are the menu's: the page reads an arrow and Delete as acting on the map's selection and a letter as a command's key
        const heard = (k, more) => { const e = N1.dom.fire(N1.doc.activeElement, 'keydown', Object.assign({ key: k }, more || {})); return (e.stopped ? 's' : '-') + (e.defaultPrevented ? 'p' : '-'); };
        const stops = ['ArrowDown', 'ArrowUp', 'End', 'Home', 'ArrowRight', 'ArrowRight', 'ArrowLeft', 'ArrowLeft', 'p', 'Delete', 'Backspace'].map(k => heard(k)).concat([heard('Enter'), heard(' '), heard('Tab'), heard('p', { ctrlKey: true }), heard('F2')]); N1.api.navClose(false);
        // a fold's arrow: its tooltip says the way, Ctrl+click opens the part and folds nothing, a plain click folds as ever
        const arrow = (N, root, bi) => root.querySelectorAll('.pv-blk').filter(b => b.dataset.blk === String(bi))[0].childNodes[0], shutN = root => root.querySelectorAll('.pv-fold-shut').length;
        const a2 = arrow(N1, N1.el.plannerPreview, 2), tips = [a2.dataset.tip, a2.getAttribute('aria-label'), arrow(N1, N1.el.docReaderBody, 2).dataset.tip];
        N1.dom.fire(a2, 'click', { ctrlKey: true }); const ctrl = [J(Y.opened.splice(0)), shutN(N1.el.plannerPreview)];
        N1.dom.fire(arrow(N1, N1.el.plannerPreview, 2), 'click', { metaKey: true }); const meta = [J(Y.opened.splice(0)), shutN(N1.el.plannerPreview)];
        N1.dom.fire(arrow(N1, N1.el.plannerPreview, 2), 'click', {}); const plain = [J(Y.opened.splice(0)), shutN(N1.el.plannerPreview)];
        N1.dom.fire(arrow(N1, N1.el.docReaderBody, 2), 'click', { ctrlKey: true }); const reader = [J(Y.opened.splice(0)), shutN(N1.el.docReaderBody)];
        const direct = [N1.api.partsOn(N1.el.plannerPreview), N1.api.partsOn(N1.el.docPanelBody), N1.api.partsOn(N1.el.docReaderBody), N1.api.partsOn(null), N1.api.partOpen(N1.el.plannerPreview, '4'), N1.api.partOpen(N1.el.plannerPreview, 'x'), N1.api.partOpen(N1.el.plannerPreview, 99), N1.api.partOpen(N1.el.docReaderBody, 0), J(Y.opened.splice(0))];
        N1.camp.activeItemId = 'gone'; const goneItem = [N1.api.partOpen(N1.el.plannerPreview, 2), Y.opened.length];
        const offs = [false, null, 'throws', 1].map(may => { const O = mkP(may), n = O.N; n.press(n.el.plannerOutlineBtn); const out = [n.api.partsOn(n.el.plannerPreview), wins(n).length, n.rows().map(x => x.className).join(), arrow(n, n.el.plannerPreview, 2).dataset.tip]; n.api.navClose(false); n.dom.fire(arrow(n, n.el.plannerPreview, 2), 'click', { ctrlKey: true }); return out.concat([O.opened.length, shutN(n.el.plannerPreview)]); });
        check('1.6.2 a part in a window of its own, from the Outline (pagenav.js, run for real): where this screen may open one, in the planner\'s own view and the panel over the map, each row of the Outline is followed by a window button of its own, a button with no text node, named for the heading, carrying the block\'s number; pressed, it puts the menu away and asks the shelf for the page that place shows and the id of the block at that number, whatever that id is; a player\'s reader has none; Right goes from a row to its button and Left back, and Up and Down go on from the button\'s row',
            J(drawn[0]) === J(['pagenav-row pagenav-lv1|0|t:Title', 'pagenav-row pagenav-lv2|2|t:Part one', 'pagenav-row pagenav-lv3|3|t:A detail', 'pagenav-row pagenav-lv2|4|t:Part two']) && J(boxed) === J(['pagenav-parts', 8, 'pagenav-foot', 'pagenav-row pagenav-lv1'])
            && J(drawn[1]) === J([0, 2, 3, 4].map((bi, k) => ['BUTTON', 'button', 'pagenav-win wib wi-dup', String(bi), 'menuitem', 'Open ' + ['Title', 'Part one', 'A detail', 'Part two'][k] + ' in a window of its own', 'Open this part alone in a window of its own', 0, true]))
            && J(afterWin) === J([J([['p1', 'b_one']]), false]) && badId === J([['p1', 'bad id']]) && panelN === 2 && panelPart === J([['d1', '']]) && J(readerN) === J([0, 'pagenav-row pagenav-lv1,pagenav-row pagenav-lv2,pagenav-row pagenav-lv3,pagenav-row pagenav-lv2'])
            && J(keys) === J(['r0', 'w0!', 'w0', 'r2!', 'w2!', 'r2!', 'r2', 'w2!', 'r0!']), J([drawn, boxed, afterWin, badId, panelN, panelPart, readerN, keys]));
        check('the Outline menu\'s keys go no further than the menu (the review of a part\'s window, found by reading: with a token selected an arrow in the menu also moved the token): Up, Down, Home and End, Right and Left with or without a button to go to, a letter, Delete and Backspace are stopped there; Enter and Space are the row\'s own press, and Tab, a key held with Ctrl and any other key go on',
            J(stops) === J(['sp', 'sp', 'sp', 'sp', 'sp', 's-', 'sp', 's-', 's-', 's-', 's-', '--', '--', '--', '--', '--']), J(stops));
        check('a fold\'s arrow opens its part too: its tooltip says that Ctrl+click opens it in a window of its own, only where one may open; Ctrl or the command key with a click asks for the part and folds nothing, a plain click folds as ever and opens nothing, and in a player\'s reader the same press only folds; a number that names no block opens the page\'s own window, a place with no page nothing; where the shelf says no, is not there, throws or answers anything but yes, there is no button, no word of it in a tooltip, and Ctrl+click folds',
            J(tips) === J(['Fold this section. Ctrl+click opens it in a window of its own.', 'Fold this section', 'Fold this section']) && J(ctrl) === J([J([['p1', 'b_one']]), 0]) && J(meta) === J([J([['p1', 'b_one']]), 0]) && J(plain) === J(['[]', 1]) && J(reader) === J(['[]', 1])
            && J(direct) === J([true, true, false, false, 'part', 'part', 'part', '', J([['p1', 'b_two'], ['p1', ''], ['p1', '']])]) && J(goneItem) === J(['', 0])
            && offs.every(o => J(o) === J([false, 0, 'pagenav-row pagenav-lv1,pagenav-row pagenav-lv2,pagenav-row pagenav-lv3,pagenav-row pagenav-lv2', 'Fold this section', 0, 1])), J([tips, ctrl, meta, plain, reader, direct, goneItem, offs]));
    }
    {   // the review of a part's window: folds of its own, and Back to the part
        const store = mkStore(), SEC = [{ tag: 'h1', text: 'Title' }, { tag: 'h2', text: 'Part one' }, { tag: null, text: 'under one' }, { tag: 'h2', text: 'Part two' }, { tag: null, text: 'under two' }];
        const shutOf = root => root.querySelectorAll('.pv-fold-shut').length, pagesKept = N => Object.keys((N.kept() || { pages: {} }).pages).length;
        const A = mkNav({ store, camp: { id: 'c1', activeItemId: 'p1' } }); A.page(A.el.plannerPreview, SEC); A.api.foldApply(A.el.plannerPreview); A.api.foldAll(A.el.plannerPreview, true);
        const main0 = [shutOf(A.el.plannerPreview), pagesKept(A)];
        const B = mkNav({ popout: true, search: '?popout=doc:c1/p1/part:b_one', store }); B.win.wpPopoutKey = 'c1/p1'; B.win.wpPopoutFoldKey = 'c1/p1/part:b_one';
        B.page(B.el.popoutBody, [{ tag: 'h2', text: 'Part one' }, { tag: null, text: 'under one' }, { tag: 'h3', text: 'Deeper' }, { tag: null, text: 'deep words' }]); B.api.foldApply(B.el.popoutBody);
        const part0 = [shutOf(B.el.popoutBody), B.api.foldPage(B.el.popoutBody) !== A.api.foldPage(A.el.plannerPreview), B.api.navKeyFor('popoutBody')];
        B.api.foldAll(B.el.popoutBody, true); const part1 = [shutOf(B.el.popoutBody), pagesKept(B)];
        A.api.foldApply(A.el.plannerPreview); const main1 = shutOf(A.el.plannerPreview);
        B.api.foldAll(B.el.popoutBody, false); A.api.foldApply(A.el.plannerPreview); const main2 = [shutOf(B.el.popoutBody), shutOf(A.el.plannerPreview)];
        B.win.wpPopoutFoldKey = ''; B.api.foldApply(B.el.popoutBody); const whole = [B.api.foldPage(B.el.popoutBody) === A.api.foldPage(A.el.plannerPreview), shutOf(B.el.popoutBody)];
        check('a part\'s window keeps folds of its own (pagenav.js foldPage, run for real in two windows on one store): the part opens unfolded though its section is folded on the page; a fold or Open all there is kept under the page and the part and leaves every fold of the page as it was, in every window; the window\'s page key, which its history reads, is still the page\'s; once it shows the whole page it shares the page\'s folds again',
            J(main0) === J([2, 1]) && J(part0) === J([0, true, 'c1/p1']) && part1[0] >= 1 && part1[1] === 2 && main1 === 2 && J(main2) === J([0, 2]) && whole[0] === true && whole[1] >= 1, J([main0, part0, part1, main1, main2, whole]));
        // the history of a part's window
        const d = makeDom(), doc2 = d.document, calls = []; let page = 'p1', part = 'b_one';
        const win2 = { wpDocPanel: { hand: () => ({ mark: () => 0, since: () => false, moved() {} }) }, wpPopoutGo(id, land, pt) { calls.push([id, land ? land.at : '', pt === undefined ? null : pt]); page = id; part = typeof pt === 'string' ? pt : ''; return true; } };
        Object.defineProperty(win2, 'wpPopoutPart', { get: () => part });
        const area = d.mk('div', '', null, 'popoutWrap'), btn2 = d.mk('button', '', null, 'popoutOutline'), root2 = d.mk('div', '', null, 'popoutBody'); root2.ownerDocument = doc2; area.appendChild(btn2); area.appendChild(root2); doc2.body.appendChild(area);
        const H = new Function('document', 'window', 'setTimeout', 'NAV_PLACES', 'LAND_AT', 'navKeyFor', 'navBlocks', slice('hist') + '\nreturn { histHere: histHere, histFollow: histFollow, histStep: histStep, histPart: histPart };')(doc2, win2, f => { f(); }, [['popoutOutline', 'popoutBody']], /^[A-Za-z0-9_-]{1,64}$/, () => 'c1/' + page, () => []);
        const here0 = H.histHere(root2), f1 = H.histFollow(root2, 'p2', 'b_x'), here1 = H.histHere(root2), b1 = H.histStep(root2, -1), f2 = H.histFollow(root2, 'p1', 'b_y'), b2 = H.histStep(root2, -1), w1 = H.histStep(root2, 1);
        const otherPlace = H.histPart({ id: 'docPanelBody' });
        // the spot of a part is not put back once the window shows the whole page, or another part: its block number is counted in its own part
        const d3 = makeDom(), doc3 = d3.document, timers = []; let page3 = 'p2', part3 = '';
        const win3 = { wpDocPanel: { hand: () => ({ mark: () => 0, since: () => false, moved() {} }) }, wpPopoutGo(id, land, pt) { page3 = id; part3 = typeof pt === 'string' ? pt : ''; return true; } }; Object.defineProperty(win3, 'wpPopoutPart', { get: () => part3 });
        const area3 = d3.mk('div', '', null, 'popoutWrap'), root3 = d3.mk('div', '', null, 'popoutBody'); root3.ownerDocument = doc3; area3.appendChild(d3.mk('button', '', null, 'popoutOutline')); area3.appendChild(root3); doc3.body.appendChild(area3);
        const H3 = new Function('document', 'window', 'setTimeout', 'NAV_PLACES', 'LAND_AT', 'navKeyFor', 'navBlocks', slice('hist') + '\nreturn { histOf: histOf, histPush: histPush, histStep: histStep };')(doc3, win3, f => { timers.push(f); }, [['popoutOutline', 'popoutBody']], /^[A-Za-z0-9_-]{1,64}$/, () => 'c1/' + page3, () => []);
        H3.histPush(H3.histOf('popoutBody'), { id: 'p1', top: 40, h: 900, blk: '0', off: 0, part: 'b_one' }); root3.scrollTop = 7;
        const back3 = H3.histStep(root3, -1), shown3 = [page3, part3]; timers.splice(0, 1).forEach(f => f()); const put1 = root3.scrollTop;
        part3 = ''; root3.scrollTop = 1900; timers.splice(0).forEach(f => f()); const put2 = root3.scrollTop;
        check('the spot a part was left at is put back only while the window still shows that part (pagenav.js histRestore, run for real with its timers held): Back shows the part and scrolls it to where it stood; once Whole page has taken the part\'s place the timers still waiting put nothing back, so the page stays where it landed',
            back3 === true && J(shown3) === J(['p1', 'b_one']) && put1 === 40 && put2 === 1900, J([back3, shown3, put1, put2]));
        check('a part\'s window in its history (pagenav.js, the hist slice run for real): where it stood names its part, and a whole page names none; Back shows the part again, also where the link led to another place of the same page, so the block it scrolls to is counted in the part as it was noted; Forward shows the whole page the link opened; no other place has a part',
            here0.part === 'b_one' && Object.prototype.hasOwnProperty.call(here1, 'part') === false && [f1, b1, f2, b2, w1].every(v => v === true) && otherPlace === ''
            && J(calls) === J([['p2', 'b_x', null], ['p1', '', 'b_one'], ['p1', 'b_y', null], ['p1', '', 'b_one'], ['p1', '', null]]), J([here0, here1, calls]));
        const html = read('index.html'), css = read('style.css'), notes = [fs.readFileSync(path.join(app, '..', '..', 'WHATSNEW.txt'), 'utf8'), read('assets/whatsnew.txt')].map(t => t.replace(/\r\n/g, '\n'));
        check('a part in its own window is said and styled (pinned): Help has its entry under the planner\'s reading, and the Prep entry its point; both release notes say it; the Outline\'s rows and their window buttons stand in two columns, and a part\'s window lets its bar wrap before its title is cut to nothing',
            html.includes('<li><b>A part in its own window</b>: open the Outline and press the window button beside a heading. That section opens alone in a window of its own, with what stands under it.') && html.includes('<li>The window button on a card opens that card alone in a window of its own.</li>')
            && notes.every(t => t.includes('- A part of a planner opens alone in a window of its own. In the Outline,\n  press the window button beside a heading. Ctrl+click on a fold arrow\n  does the same, and so does the window button on a card in Prep.\n'))
            && css.includes('\n  #pageNavMenu .pagenav-parts { display: grid; grid-template-columns: minmax(0, 1fr) 30px; align-items: center; }\n  #pageNavMenu .pagenav-win { width: 26px; height: 24px;') && css.includes('\n  #popoutBar:has(#popoutWhole) { flex-wrap: wrap; row-gap: 6px; }') && css.includes('\n  #popoutBar:has(#popoutWhole) #popoutTitle { flex-basis: 180px; }') && css.includes('\n  #popoutBar #popoutWhole { flex: none;'));
    }
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
            J(keyed) === J([true, true, true, 1]) && J(moves) === J([[1, true], [2, true], [6, true], [0, true], [6, true], [0, true], [6, true], [6, false]])   /* 1.6.2 (107 (a)) moved on purpose, 5 to 6: a page of two sections or more has the Contents tick at the foot too */
            && J(foot) === J(['BUTTON|button|pagenav-act|foldall|menuitem|t:Fold all', 'BUTTON|button|pagenav-act|openall|menuitem|t:Open all', 'BUTTON|button|pagenav-act pagenav-tick on|toc|menuitemcheckbox|t:Contents']) && ring()[4].parentNode.className === 'pagenav-foot' && ring()[4].parentNode === N.api.menu().lastChild, J([keyed, moves, foot]));
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
        const qs = [lo({ q: 'Ula Torv' }), lo({ q: '  Ula  Torv \n' }), lo({ q: 'x'.repeat(200) }), lo({ q: 'x'.repeat(201) }), lo({ q: x199 + E + 'y' }), lo({ q: x199 + '\ud83d' }), lo({ q: 'a\udc00b\ud800' }), lo({ q: 'a'.repeat(199) + ' b' }), lo({ q: '   ' + 'z'.repeat(250) }), lo({ q: E }), lo({ q: '__proto__' })];
        const QS = [{ q: 'Ula Torv' }, { q: 'Ula  Torv' }, { q: 'x'.repeat(200) }, { q: 'x'.repeat(200) }, { q: x199 + E }, { q: x199 }, { q: 'ab' }, { q: 'a'.repeat(199) }, { q: 'z'.repeat(200) }, { q: E }, { q: '__proto__' }];
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
            blk(d, 4, [mk(d, 'p', '', ['S', mk(d, 'b', '', ['\u00e9']), 'lfolk elder'])]), blk(d, 5, [mk(d, 'style', '', ['.hidden-words{}']), mk(d, 'script', '', ['secret()'])]), blk(d, 6, [mk(d, 'p', '', ['Ab']), mk(d, 'p', '', ['cd'])])]));
        const wq = s => { const was = blocks(rw).map(b => b.calls.length); const r = W.api.land(rw, null, { q: s }); return [r, blocks(rw).map((b, i) => b.calls.length > was[i] ? i : -1).filter(i => i >= 0)]; };
        const words = [wq('alpha beta'), wq('gamma alpha'), wq('session one'), wq('oneroad'), wq('SELFOLK'), wq('hidden'), wq('secret'), wq('ab cd'), wq('b c'), wq('secret hidden')];
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
        ['any word: the review\'s own probe, where the words never stand together', ['The bridge at Ysk is down.', 'Wade in where the reeds grow thin.'], 'ysk reeds', 0],
        ['every word before any word: the review\'s own probe', ['Ysk is near.', 'The ford is deep.', 'Past Ysk the reeds grow.'], 'ysk reeds', 2],
        ['the phrase before every word', ['Ysk and the reeds.', 'Here ysk reeds grow.'], 'ysk reeds', 1],
        ['every word only at the start of a word', ['Kiysk breeds ysk.', 'Ysk and the reeds.'], 'ysk reeds', 1],
        ['any word only at the start of a word', ['Kiysk and breeds.', 'The ford.', 'Then Ysk.'], 'ysk reeds', 2],
        ['words found nowhere', ['The ford.', 'Past the bridge.'], 'ysk reeds', -1],
        ['one word is the phrase, wherever it stands', ['A kiysk.', 'Ysk.'], 'ysk', 0],
        ['a diagram\'s source not drawn yet is not read, a code block is', [chartSrc('flowchart TD\nclassDef gold fill:#302517\nn0["Ysk"]:::gold'), codeOf('A gold bar.'), 'Gold glints.'], 'gold', 1],
        ['a drawn chart\'s HTML label is read', ['The ford.', chartDrawn('Gold gate'), 'Gold glints.'], 'gold', 1],
        ['a drawn chart\'s own text is not read', [seqDrawn('Gold bar', 'Ysk'), 'Gold glints.'], 'gold', 1],
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
        const rw = N.el.docReaderBody, odd = [pn.landWords(null, 'ysk'), pn.landWords(rw, '   '), pn.landWords(rw, 7), pn.landWords(rw, null), pn.landWords(rw, { toString() { throw new Error('read'); } }), pn.landWords({}, 'ford'), pn.landWords(rw, ['ford'])];
        let threw = ''; try { pn.landWords(Object.defineProperty({}, 'childNodes', { get() { throw new Error('read'); } }), 'ford'); } catch (e) { threw = String(e); }
        const longQ = 'Ford' + ' '.repeat(300) + 'Ysk'; putPage(N, rw, ['Ysk is near.', 'The ford is deep.']); const cutW = blocks(rw).indexOf(pn.landWords(rw, longQ)); pn.land(rw, { blocks: [] }, { q: longQ }); const cutL = blocks(rw).map((b, i) => (b.classList.contains('pagenav-hit') ? i : -1)).filter(i => i >= 0); N.dom.runTimers();   // the cleaner cuts the words at 200 characters: Ford alone
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
        const plan = { id: 'p9', type: 'planner', blocks: [{ id: 'b_t', type: 'h1', title: 'Session 7' }, null, { id: 'b_m', type: 'mystery' }, { id: 'b_h', type: 'h2', title: 'Beats' }, { id: 'b_n', type: 'node', title: 'The inn', tag: 'social', rows: [{ col1: 'Ask', col2: 'The barkeep knows Ysk' }] }, { id: 'b_x', type: 'text', content: '<p>The end.</p>' }] };
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
            && dr.includes("blk += '<div' + layoutAttrs(b, 'node plain-table doc-tablewrap') + '>';\n                if (b.title) blk += '<h3>'") && pl.includes("html += '<div class=\"node' + (plainPv ? ' plain-table' : '') + (kdP.ico ? ' card-' + kdP.key : '') + (doneP ? ' card-done' : '') + (whenP === 'tonight' || whenP === 'ahead' ? ' card-' + whenP : '') + '\">';\n              if (!plainPv || b.title) html += '<h3>'"));   /* 1.6.2 (166 d) a scene's session, moved on purpose */   // backlog 107 step 3: a card of a kind adds a class, and its drawing stands inside the heading
        const mainSrc = read('scripts/main.js'), panelSrc = read('scripts/docpanel.js'), scripts = fs.readdirSync(path.join(app, 'scripts')).filter(f => /\.js$/.test(f));
        check('the folds are wired: Find in the planner\'s own view and Find in the panel over the map open the fold their current hit lies in before they scroll to it; the two exports that read the preview\'s own markup take the folds off first and put them back, the picture also when it fails; the panel says which page it shows; the module publishes what these call, asks for the open campaign, follows another window through the storage event, and holds every fold class and the folds\' own storage key by itself',
            pl.includes("      if (typeof window !== 'undefined' && window.wpPageNav && typeof window.wpPageNav.reveal === 'function') window.wpPageNav.reveal(h[0]);   // a hit inside a folded part: the fold is opened first (pagenav.js)\n      h[0].scrollIntoView({ block: 'center', behavior: quiet ? 'auto' : 'smooth' });\n")
            && panelSrc.includes("if (hits[curHit] && typeof window !== 'undefined' && window.wpPageNav && typeof window.wpPageNav.reveal === 'function') window.wpPageNav.reveal(hits[curHit][0]); if (scroll !== false && hits[curHit]) hits[curHit][0].scrollIntoView(")
            && panelSrc.includes('window.wpDocPanel = { open: open, close: close, refresh: refresh, popOut: popOut, openId: function() { return openId; }, tabs: function() { return tabs.slice(); } };')
            && mainSrc.includes("          if (navX && navX.strip) navX.strip(pvX);   // the page as drawn: an export carries no fold and no fold arrow (pagenav.js)\n          var content = pvX.innerHTML;\n          if (navX && navX.apply) navX.apply(pvX);\n")
            && mainSrc.includes("refoldI = function() { if (pvI && navI && navI.apply) navI.apply(pvI); };\n      if (pvI && navI && navI.strip) navI.strip(pvI);") && mainSrc.includes("      html2canvas(target, opts).then(function(cv) {\n          refoldI();\n") && mainSrc.includes("      }).catch(function() {\n\n          refoldI();\n")
            && src.includes("        reveal: function(el) { var root = navRootOf(el); return root ? foldReveal(root, el, false) : false; },") && src.includes('        strip: foldStrip, apply: foldApply') && src.includes("import { getActiveCampaign } from './models.js';")
            && src.includes("    if (typeof window.addEventListener === 'function') window.addEventListener('storage', function(e) {\n        if (e && e.key !== null && e.key !== FOLD_STORE && !(typeof TOC_STORE === 'string' && e.key === TOC_STORE)) return;")   /* 1.6.2 (107 (a)) moved on purpose: another window follows the Contents tick too */
            && src.includes("        if (typeof window.MutationObserver === 'function') new window.MutationObserver(function() { foldApply(root); }).observe(root, { childList: true });")
            && J(scripts.filter(f => /pv-fold|wp_pageFolds/.test(read('scripts/' + f)))) === J(['pagenav.js']));
        const fa = css.indexOf('  @media screen {\n    .pv-folds .pv-fold-btn { display: block; float: left;'), fz = css.indexOf('\n  }\n  #plannerPreview .pv-blk, #plannerPreview .pv-blk :is(h1, h2, h3) { scroll-margin-top: var(--pv-top, 58px); }'), foldCss = fa > 0 && fz > fa ? css.slice(fa + '  @media screen {\n'.length, fz + 1) : '';
        const am = /\n    \.pv-folds \.pv-fold-btn \{ display: block; float: left; width: (\d+)px; height: (\d+)px; margin: (-?\d+)px (-?\d+)px (-?\d+)px (-?\d+)px; padding: 0;/.exec('\n' + foldCss), box = am ? [+am[6] + +am[1] + +am[4], +am[3] + +am[2] + +am[5]] : null;
        check('the folds are styled, on screen only: an arrow shows only on a page the folds have marked; an open block is never positioned for it (a positioned block would be painted after the blocks before it, its background over a picture floated beside it): the arrow is floated into the left margin with a margin box of no width and no height, so it moves and clears nothing, and only a folded part, whose content is put away, is positioned for its word and its arrow; what is put away keeps its place in the page\'s layout — never display: none, so a chart drawn while it is folded is laid out as it will be shown —, a folded part is clipped downwards only so that its arrow in the margin shows, and its word and a heading\'s count are printed from an attribute; every rule lives under the folds\' own class inside the screen block, so a printed page is the page as drawn',
            foldCss.length > 500 && css.includes('\n  .pv-fold-btn { display: none; }\n  @media screen {\n') && foldCss.split('\n').filter(Boolean).every(l => /^    \.pv-folds \.pv-/.test(l)) && !/display:\s*none/.test(foldCss)
            && J(box) === J([0, 0]) && am[6] === '-17' && foldCss.split('position: ').length === 5 && foldCss.includes('    .pv-folds .pv-cards > .pv-blk.pv-fold-hid { position: absolute; left: 0; width: 100%; }') && !/\.pv-folds \.pv-blk \{/.test(foldCss)   /* 1.6.2 (107 (a)) moved on purpose, 4 to 5: a part put away inside a row of cards is taken out of the row */
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
            J(stickies) === J(['.pv-toc.pv-toc-col' /* 1.6.2 (107 (a)), added on purpose: the Contents column stands in the margin BESIDE the planner's page, under its bar, never over the page */, '.build-tabs', '.pbe-barslot', '.cm-fx-find', '.lib-fbtns', '.sheet-frame', '.sheet-sticky-titles > .sheet-section:not(.sheet-subsection):not(.sheet-dash) > .sheet-sec-title', '#plannerFindBar'])
            && /\n  #docPanelSearchRow \{ [^\n]*flex: none;/.test(css) && /\n  #docPanelBody \{ overflow: auto;/.test(css) && /\n  #popoutBar \{ flex: none;/.test(css) && /\n  #docReaderBody \{ flex: 1; overflow-y: auto;/.test(css)
            && /<div id="docReaderModal" style="display:none;">\n    <div class="doc-reader-head">[^\n]*\n    <div id="docReaderBody" class="doc-view"><\/div>\n<\/div>/.test(ix) && J(B.NAV_BAR.slice(0, 2)) === J(['plannerFindBar', 'plannerPreview']), J(stickies));
        check('the landing clear of the bar is said: both release notes carry the line under 1.5.4\'s fixes, alike', wn.every(t => t.split("- In a planner's or a page's own view, a part the Outline jumps to, or\n  a search lands on, is no longer half hidden under the Find bar. Where\n  the bar took two rows, the top of the part stayed under it.\n").length === 2) && wn[0].indexOf("- In a planner's or a page's own view, a part the Outline jumps to, or\n  a search lands on, is no longer half hidden under the Find bar. Where\n  the bar took two rows, the top of the part stayed under it.\n") < wn[0].indexOf('WAYPOINT 1.5.3'));
    }

    /* ---- 1.5.8: Back and Forward (the hist slice run for real on tools/boxdom.js, with a shelf, a campaign and a reader's hand of this suite's own).
       The owner, 2026-10-25, of a link followed to a chapter of a planner: "I don't want to have to be scrambling around trying to find where I
       came from"; by prompt "Back and Forward buttons (Recommended)" ---- */
    {
        const d = makeDom(), doc = d.document, cur = { plannerPreview: 'p1', docPanelBody: 'g1', popoutBody: 'w1', docReaderBody: 'r1' }, calls = [];
        const hand = { n: 0, mark() { return this.n; }, since(m) { return typeof m !== 'number' || this.n !== m; } };
        const win = { wpPageShelf: { linkGo(id, at, way) { calls.push(['go', id, at, way]); if (id === 'gone' || id === 'planner_x') return ''; cur[way === 'panel' ? 'docPanelBody' : 'plannerPreview'] = id; return way; } },
            wpDocPanel: { hand: () => hand }, wpPopoutGo(id, land) { calls.push(['pop', id, land]); cur.popoutBody = id; return true; },
            wpOpenDoc(id, land) { calls.push(['reader', id, land || null]); if (id === 'planner_x') return false; cur.docReaderBody = id; return true; } };
        const NAVP = [['plannerOutlineBtn', 'plannerPreview'], ['docPanelOutline', 'docPanelBody'], ['docReaderOutline', 'docReaderBody'], ['popoutOutline', 'popoutBody']];
        const shown = el => { el.getClientRects = () => [1]; return el; };
        const mkPlace = (areaId, btnId, rootId) => { const area = shown(d.mk('div', '', null, areaId)), btn = d.mk('button', 'tool ghost', null, btnId), root = d.mk('div', '', null, rootId); root.ownerDocument = doc; area.appendChild(btn); area.appendChild(root); doc.body.appendChild(area); return { area, btn, root }; };
        const P = mkPlace('plannerPreviewWrap', 'plannerOutlineBtn', 'plannerPreview'), Q = mkPlace('docPanel', 'docPanelOutline', 'docPanelBody'), R = mkPlace('docReaderModal', 'docReaderOutline', 'docReaderBody'), W = mkPlace('popoutWrap', 'popoutOutline', 'popoutBody');
        const blocks = root => root.childNodes.filter(n => n.nodeType === 1 && n.className === 'pv-blk');
        const H = new Function('document', 'window', 'setTimeout', 'NAV_PLACES', 'LAND_AT', 'navKeyFor', 'navBlocks', slice('hist')
            + '\nreturn { histOf: histOf, histPush: histPush, histTake: histTake, histHere: histHere, histPut: histPut, histFollow: histFollow, histStep: histStep, histWire: histWire, histSync: histSync, HIST_MAX: HIST_MAX };')(
            doc, win, d.setTimeout, NAVP, /^[A-Za-z0-9_-]{1,64}$/, id => cur[id] ? 'c1/' + cur[id] : '', blocks);
        // the lists themselves
        const h0 = { back: [], fwd: [{ id: 'f' }], gen: 0 }; for (let i = 0; i < 60; i++) H.histPush(h0, { id: 'e' + i });
        const t1 = H.histTake(h0, -1, { id: 'now' }), t2 = H.histTake(h0, 1, { id: 'now2' }), t3 = H.histTake({ back: [], fwd: [] }, -1, { id: 'x' });
        check('Back and Forward, the lists (pagecheck hist slice, run for real): a step noted goes on Back and takes Forward away, Back holds the newest 50; a step back hands its entry over and puts where the place stands on Forward, a step forward the other way; nothing to take is null',
            H.HIST_MAX === 50 && h0.back.length === 50 && t1 && t1.id === 'e59' && t2 && t2.id === 'now' && h0.back[h0.back.length - 1].id === 'now2' && h0.fwd.length === 0 && t3 === null && H.histPush(h0, null) === false, J([h0.back.length, t1, t2]));
        // the buttons
        H.histWire(doc);
        const bk = id => doc.getElementById('pageHistBack_' + id), fw = id => doc.getElementById('pageHistFwd_' + id);
        const made = ['plannerPreview', 'docPanelBody', 'docReaderBody', 'popoutBody'].map(id => { const a = bk(id), b = fw(id), kids = a && a.parentNode.childNodes; return [!!a && !!b, a && kids.indexOf(a) + 1 === kids.indexOf(b) && kids.indexOf(b) + 1 === kids.indexOf(doc.getElementById(NAVP.filter(p => p[1] === id)[0][0])), a && a.disabled, b && b.disabled, a && a.attrs['aria-label'], b && b.attrs['aria-label'], a && a.childNodes.length === 1 && a.childNodes[0].nodeType === 3]; });
        H.histWire(doc);
        check('Back and Forward, the buttons: each place a page is read gets a Back and a Forward button right before its Outline button, named for a screen reader, made by name with one text node each, off while there is nowhere to go, made once however often it is wired',
            made.every(m => J(m) === J([true, true, true, true, 'Back', 'Forward', true])) && doc.body.all().filter(n => /^pageHist/.test(n.id)).length === 8
            && bk('plannerPreview').className === 'tool ghost pagenav-hist' && /Alt\+Left/.test(bk('plannerPreview').title) && /Alt\+Right/.test(fw('plannerPreview').title), J(made));
        // a link followed in the planner's own view: the spot is noted, then Back puts it back once drawn
        const box = P.area; box.rect = { left: 0, top: 100, right: 500, bottom: 700 }; box.scrollTop = 340; box.scrollHeight = 3000;
        const pb = (i, top, bottom) => { const b = d.mk('div', 'pv-blk', { blk: i }); b.rect = { left: 0, top: top, right: 500, bottom: bottom }; P.root.appendChild(b); return b; };
        pb(0, -300, 40); pb(1, 40, 180); pb(2, 180, 400);
        const here = H.histHere(P.root);
        const ok1 = H.histFollow(P.root, 'p2', 'b_x'), after1 = [J(calls.slice(-1)[0]), bk('plannerPreview').disabled, fw('plannerPreview').disabled, H.histOf('plannerPreview').back.length];
        const gone = H.histFollow(P.root, 'gone', ''), badAt = H.histFollow(P.root, 'p3', 'no good'), after2 = [H.histOf('plannerPreview').back.length, J(calls.slice(-1)[0])];
        check('Back and Forward, following a link: where the place stands is noted as its page, where it was scrolled to, how tall it was and the block at the top with how far into it the view begins; the page opens in the same place by its own way (the planner\'s own view as the page itself) at the block the link names; Back comes on and Forward stays off; a page that is not there opens nothing and is noted nowhere; a block id that is no block id is no landing',
            J(here) === J({ id: 'p1', top: 340, h: 3000, blk: '1', off: 60 }) && ok1 === true && J(after1) === J([J(['go', 'p2', 'b_x', 'go']), false, true, 1]) && gone === false && badAt === true && J(after2) === J([2, J(['go', 'p3', '', 'go'])]), J([here, after1, after2]));
        // Back: the page opened again and the spot put back, at the first timer and after the charts; never once the reader moved it
        d.runTimers(); box.scrollTop = 900;
        const s1 = H.histStep(P.root, -1); const opened = J(calls.slice(-1)[0]);
        d.page.timers.shift()(); const put1 = box.scrollTop; box.scrollTop = 5; d.runTimers(); const put2 = box.scrollTop;
        const s2 = H.histStep(P.root, -1); d.page.timers.shift()(); box.scrollTop = 7; hand.n++; d.runTimers(); const put3 = box.scrollTop;
        check('Back and Forward, Back: the page the step names opens in the same place and the spot it was left at is put back, once the press has been heard and again as the page\'s charts are drawn, unless the reader has moved the page by their own hand meanwhile (docpanel.js readerHand), which it never overrides; the place\'s own lists follow, Forward now on',
            s1 === true && opened === J(['go', 'p2', '', 'go']) && put1 === 340 && put2 === 340 && s2 === true && put3 === 7 && J([H.histOf('plannerPreview').back.length, H.histOf('plannerPreview').fwd.length]) === J([0, 2]) && fw('plannerPreview').disabled === false && bk('plannerPreview').disabled === true, J([s1, opened, put1, put2, s2, put3]));
        // Forward, and a page drawn anew of another height lands by its block
        const f1 = H.histStep(P.root, 1); const fCall = J(calls.slice(-1)[0]); box.scrollHeight = 2500; box.scrollTop = 0;
        P.root.childNodes[1].getBoundingClientRect = () => ({ left: 0, right: 500, top: 600 - box.scrollTop, bottom: 740 - box.scrollTop, width: 500, height: 140 });   // the block now 500 into the page, its place on screen moving with the scroll as a browser's does
        d.runTimers(); const putF = box.scrollTop;
        const bl = H.histOf('plannerPreview').back.map(e => e.id).join(), nf = H.histStep(P.root, 1), nfCall = J(calls.slice(-1)[0]); d.runTimers(); const n2 = calls.length, nn = H.histStep(P.root, 1), none = nn === false && calls.length === n2;
        check('Back and Forward, Forward: the step goes the other way; where the page is no longer as tall as it was, the block that stood at the top is brought back to the very place in it; with nowhere to go nothing is opened',
            f1 === true && fCall === J(['go', 'p2', '', 'go']) && putF === 560 && bl === 'p1' && nf === true && nfCall === J(['go', 'p3', '', 'go']) && none === true, J([f1, fCall, putF, bl, nf, nfCall, nn]));
        // the same page: nothing is opened again, the spot alone is put back
        const before = calls.length; cur.plannerPreview = 'p2';
        const hSame = H.histOf('plannerPreview'); hSame.back.push({ id: 'p2', top: 77, h: 2500, blk: '', off: 0 }); hSame.fwd = [];
        H.histStep(P.root, -1); d.runTimers();
        check('Back and Forward, within one page: a step to a spot of the page on screen opens nothing again and puts the spot back', calls.length === before && box.scrollTop === 77, J([calls.length - before, box.scrollTop]));
        // a page that is gone: the step is passed over and the place stays as it was
        hSame.back.push({ id: 'gone', top: 10, h: 0, blk: '', off: 0 }); const b4 = hSame.back.length, f4 = hSame.fwd.length;
        const sg = H.histStep(P.root, -1);
        check('Back and Forward, a page that is gone: the step is dropped, the shelf says so, and the place and its Forward stay as they were', sg === false && hSame.back.length === b4 - 1 && hSame.fwd.length === f4 && J(calls.slice(-1)[0]) === J(['go', 'gone', '', 'go']));
        // the other places open by their own ways
        Q.area.rect = { left: 0, top: 0, right: 400, bottom: 500 }; Q.root.scrollTop = 120; Q.root.scrollHeight = 900;
        H.histFollow(Q.root, 'g2', 'b_q'); const qCall = J(calls.slice(-1)[0]);
        H.histFollow(W.root, 'w2', 'b_w'); const wCall = J(calls.slice(-1)[0]);
        H.histFollow(R.root, 'r2', ''); const rCall = J(calls.slice(-1)[0]); H.histFollow(R.root, 'planner_x', 'b_z'); const rFall = J(calls.slice(-2));
        check('Back and Forward, every place by its own way: the panel over the map through the shelf as the panel, a window of its own in itself (popout.js wpPopoutGo), a player\'s reader in itself (handbook.js wpOpenDoc) and, for what the reader cannot open, the shelf, which says why; each place keeps its own lists',
            qCall === J(['go', 'g2', 'b_q', 'panel']) && wCall === J(['pop', 'w2', { at: 'b_w' }]) && rCall === J(['reader', 'r2', null]) && rFall === J([['reader', 'planner_x', { at: 'b_z' }], ['go', 'planner_x', 'b_z', 'go']])
            && H.histOf('docPanelBody').back.length === 1 && H.histOf('popoutBody').back.length === 1 && H.histOf('docReaderBody').back.length === 1 && H.histOf('docPanelBody').back[0].id === 'g1', J([qCall, wCall, rCall, rFall]));
        // the keys
        const link = d.mk('a'); link.attrs.href = '#'; Q.root.appendChild(link); link.focus();
        const k1 = d.fire(link, 'keydown', { key: 'ArrowLeft', altKey: true }); const kCall = J(calls.slice(-1)[0]);
        const input = d.mk('input'); Q.area.appendChild(input); input.focus(); const n0 = calls.length; const k2 = d.fire(input, 'keydown', { key: 'ArrowRight', altKey: true });
        link.focus(); const k3 = d.fire(link, 'keydown', { key: 'ArrowRight', altKey: true, ctrlKey: true }), k4 = d.fire(link, 'keydown', { key: 'ArrowRight' }), k5 = d.fire(link, 'keydown', { key: 'ArrowRight', altKey: true, repeat: true });
        const n1 = calls.length; link.blur(); d.fire(W.root, 'pointerdown', {}); const k6 = d.fire(doc.body, 'keydown', { key: 'ArrowLeft', altKey: true }); const k6Call = J(calls.slice(-1)[0]);
        check('Back and Forward, the keys: Alt+Left in a place goes back there, taken from the page; in a field, with another key held, without Alt or held down nothing happens; with the focus nowhere in particular the place pressed last answers',
            k1.defaultPrevented && k1.stopped && kCall === J(['go', 'g1', '', 'panel']) && !k2.defaultPrevented && !k3.defaultPrevented && !k4.defaultPrevented && !k5.defaultPrevented && n1 === n0
            && k6.defaultPrevented && k6Call === J(['pop', 'w1', null]), J([kCall, k6Call, n0, n1, calls.length]));
        const srcH = slice('hist');
        check('Back and Forward, wired and kept to memory: the module wires them once its places and the bar are, and publishes the place of a link, a follow and a step; nothing of a step is stored or sent, and the buttons are made by name with text nodes alone',
            src.includes("    navBarWire(document, window.ResizeObserver);   // backlog 143: a block jumped to in the planner's own view lands clear of its Find bar\n    histWire(document);")
            && src.includes('    window.wpPageNav.placeOf = navRootOf; window.wpPageNav.follow = histFollow; window.wpPageNav.step = histStep;\n')
            && !/localStorage|sessionStorage|wpNet|innerHTML|insertAdjacentHTML|fetch\(/.test(srcH) && (srcH.match(/createElement\('[a-z]+'\)/g) || []).join() === "createElement('button')");
        // said
        const ixH = read('index.html'), wnH = [fs.readFileSync(path.join(root, 'WHATSNEW.txt'), 'utf8'), read('assets/whatsnew.txt')].map(s => s.replace(/\r\n/g, '\n'));
        check('Back and Forward is said: Help names the arrows beside Outline, the keys and right-clicking a page link, and both release notes carry the same lines under 1.5.8',
            ixH.includes('<li><b>Back and Forward.</b> After you follow a page link, the left arrow beside <b>Outline</b>') && ixH.includes('<li>Right-click a page link to choose where it opens: here, in a new window or in the panel over the map.')
            && wnH.every(t => t.includes('- Back and Forward: after you follow a link to another page or to a\n') && t.indexOf('- Back and Forward: after') < t.indexOf('WAYPOINT 1.5.7')) && wnH[0].slice(0, wnH[0].indexOf('WAYPOINT 1.5.7')) === wnH[1].slice(0, wnH[1].indexOf('WAYPOINT 1.5.7')));
    }

    /* ---- tables that fit (1.6.2, backlog 107 (a); docs/PLANNER_ORG_DESIGN.md 4.2) ---- */
    {
        const TF = new Function('setTimeout', "'use strict';\n" + slice('tfit') + '\nreturn { TFIT_COL: TFIT_COL, TFIT_MIN: TFIT_MIN, tfitStacks: tfitStacks, tfitHeads: tfitHeads, tableFit: tableFit, tableUnfit: tableUnfit, tfitWatch: tfitWatch };')(() => { throw new Error('a timer of the page'); });
        const S = TF.tfitStacks;
        check('tables that fit, the rule: a table stacks where its box has less than 125 px a column, from three columns up. Two columns always fit, and a box that has no width, as a place that is put away, decides nothing',
            TF.TFIT_COL === 125 && TF.TFIT_MIN === 3 && S(374, 3) === true && S(375, 3) === false && S(499, 4) === true && S(500, 4) === false && S(749, 6) === true && S(750, 6) === false && S(100, 2) === false && S(1, 1) === false
            && S(0, 4) === false && S(-5, 4) === false && S(NaN, 4) === false && S('300', 4) === false && S(300, '4') === false && S(undefined, 4) === false);
        const d = makeDom(), sliceOf = (file, a, b) => { const s = read(file), i = s.indexOf(a), k = s.indexOf(b); if (i < 0 || k < i) throw new Error('pagecheck: ' + a + ' is not in ' + file); return s.slice(i + a.length, k); };
        const plannerPreviewHtml = new Function('esc', 'sanitizeHtml', 'proseHtml', 'stripMermaidLinks', 'compileFlowchart', 'docStyleCss', 'mergeDocStyle', 'num', 'picRef', 'fmtHtml', 'fmtRich', 'fieldFmt', 'colFmtOf', 'cellFmtOf', 'mermaidPre',
            sliceOf('scripts/planner.js', '// [sinkcheck:planner-preview-start]', '// [sinkcheck:planner-preview-end]') + '\nreturn plannerPreviewHtml;')(SC.esc, DR.sanitizeHtml, DR.proseHtml, DR.stripMermaidLinks, DR.compileFlowchart, DR.docStyleCss, DR.mergeDocStyle, SC.num, SC.picRef, DR.fmtHtml, DR.fmtRich, DR.fieldFmt, DR.colFmtOf, DR.cellFmtOf, DR.mermaidPre);
        const HOSTILE = '<img src=x onerror=alert(1)> & "quoted"', LONG = 'A column whose name runs on and on past what a small block has room to print before its cell';
        const plan = { id: 'p1', type: 'planner', blocks: [{ type: 'h1', title: 'Session 1' },
            { type: 'node', title: 'The inn', rows: [{ col1: 'Ask', col2: 'Why', col3: '', col4: 'Next' }, { col1: 'Wait', col2: 'Dusk', col3: '2', col4: '' }] },
            { type: 'node', mode: 'table', title: 'Prices', cols: ['Item', 'Cost'], rows: [{ col1: 'Ale', col2: '2' }] },
            { type: 'node', mode: 'table', cols: ['Name', 'Wants', 'Says'], rows: [{ col1: 'Bren', col2: 'Coin', col3: 'Little' }] }] };
        const doc = DR.cleanDoc({ id: 'd1', type: 'doc', meta: { title: 'Rules' }, blocks: [{ type: 'h1', title: 'House rules' },
            { type: 'table', title: 'Travel', cols: ['Pace', HOSTILE, LONG, 'Notes'], rows: [['Fast', '4 miles', '30 miles', ''], ['Slow', '2 miles', '18 miles', 'Stealth']] },
            { type: 'table', cols: [], rows: [['a', 'b', 'c', 'd']] },
            { type: 'table', cols: ['A', 'B', 'C', 'D'], rows: [['1', '2', '3', '4']], layout: { float: 'left' } },
            { type: 'table', cols: ['A', 'B'], rows: [['1', '2']] }] });
        const pT = toTree(d, plannerPreviewHtml(plan, { id: 'c1', items: {} })), dT = toTree(d, DR.renderDoc(doc, {}));
        const ser = n => n.nodeType === 3 ? '#' + n.nodeValue : n.nodeName + '.' + n.className + J(n.attrs) + J(n.dataset) + '[' + n.childNodes.map(ser).join('|') + ']';
        const tabs = t => t.querySelectorAll('table'), st = t => tabs(t).map(x => (x.classList.contains('pv-tstack') ? 1 : 0)).join(''), cells = x => x.querySelectorAll('td').map(c => c.getAttribute('data-col'));
        const p0 = ser(pT), d0 = ser(dT), txt0 = pT.textContent + dT.textContent, shape = [tabs(pT).length, tabs(dT).length, tabs(dT).map(x => x.parentNode.className).join('|'), tabs(pT).map(x => x.parentNode.className).join('|')];
        let W = 360; const w = () => W;
        const n1 = [TF.tableFit(pT, w), TF.tableFit(dT, w)], s1 = [st(pT), st(dT)], heads = TF.tfitHeads(tabs(pT)[0]), c1 = [cells(tabs(pT)[0]), cells(tabs(pT)[2]), cells(tabs(dT)[0])], txt1 = pT.textContent + dT.textContent;
        const again = [TF.tableFit(pT, w), TF.tableFit(dT, w), ser(pT) !== p0, ser(dT) !== d0];
        W = 0; const away = [TF.tableFit(pT, w), TF.tableFit(dT, w), st(pT), st(dT)];
        W = 400; const mid = [TF.tableFit(pT, w), st(pT), cells(tabs(pT)[2]).join()];   // three columns have room at 400, four do not
        W = 900; const wide = [TF.tableFit(pT, w), TF.tableFit(dT, w), ser(pT) === p0, ser(dT) === d0];
        W = 360; TF.tableFit(pT, w); TF.tableFit(dT, w); TF.tableUnfit(pT); TF.tableUnfit(dT); const bare = [ser(pT) === p0, ser(dT) === d0]; TF.tableUnfit(pT); const twice = ser(pT) === p0;
        check('tables that fit, over what the two real renderers draw (a card with its four columns, a plain table of two and of three, a page table of four, one with no headings, one set beside the text and one of two): at 360 px the tables of three and four columns are stacked and no other, each cell but the first carries its column\'s name as the attribute data-col, and no word of the page changes. A heading that is markup in a file reaches the attribute as the characters it holds, and a long one is cut at 60 characters. Fitted again nothing changes. A place with no width is left as it stands. At 400 px the table of three is a table again, at 900 px every table is, and the tree is then exactly as it was drawn, as it is after the fit is taken off for an export',
            J(shape) === J([3, 4, 'node plain-table doc-tablewrap|node plain-table doc-tablewrap|node plain-table doc-tablewrap fl-left|node plain-table doc-tablewrap', 'node|node plain-table|node plain-table']) && J(n1) === '[2,1]' && J(s1) === J(['101', '1000']) && heads.length === 4
            && J(c1[0]) === J([null, heads[1], heads[2], heads[3], null, heads[1], heads[2], heads[3]]) && J(c1[1]) === J([null, 'Wants', 'Says'])
            && J(c1[2]) === J([null, HOSTILE, Array.from(LONG).slice(0, 60).join('').trim() + '\u2026', 'Notes', null, HOSTILE, Array.from(LONG).slice(0, 60).join('').trim() + '\u2026', 'Notes']) && txt1 === txt0
            && J(again) === '[0,0,true,true]' && J(away) === J([0, 0, '101', '1000']) && J(mid) === J([1, '100', ',,']) && J(wide) === '[1,1,true,true]' && J(bare) === '[true,true]' && twice === true,
            J([shape, n1, s1, heads, c1, txt1 === txt0, again, away, mid, wide, bare, twice]));
        // a table that is not the app's own, the default measure, and the watch
        const cell = (tag, t) => mk(d, tag, '', [t]), raw = mk(d, 'div', 'pv-blk', [mk(d, 'div', 'raw-html', [mk(d, 'table', '', [mk(d, 'thead', '', [mk(d, 'tr', '', ['A', 'B', 'C', 'D'].map(t => cell('th', t)))]), mk(d, 'tbody', '', [mk(d, 'tr', '', ['1', '2', '3', '4'].map(t => cell('td', t)))])])])]);
        const rawN = TF.tableFit(raw, () => 200), rawSt = st(raw);
        const own = mk(d, 'div', 'pv-blk', [mk(d, 'div', 'node', [mk(d, 'table', '', [mk(d, 'thead', '', [mk(d, 'tr', '', ['A', 'B', 'C'].map(t => cell('th', t)))]), mk(d, 'tbody', '', [mk(d, 'tr', '', ['1', '2', '3'].map(t => cell('td', t)))])])])]);
        own.querySelectorAll('.node')[0].clientWidth = 300; const ownN = TF.tableFit(own), ownSt = st(own); own.querySelectorAll('.node')[0].clientWidth = 380; const ownBack = [TF.tableFit(own), st(own)];
        const junk = [TF.tableFit(null), TF.tableFit({}), TF.tableUnfit(null), TF.tableUnfit({})];
        let cb = null; const seen = [], later = [], rootW = { clientWidth: 500, asked: 0, querySelectorAll() { this.asked++; return []; } };
        function Obs(f) { cb = f; this.observe = el => { seen.push(el); }; }
        const o = TF.tfitWatch(rootW, Obs, fn => { later.push(fn); }); cb(); const same = [later.length, rootW.asked];
        rootW.clientWidth = 400; cb(); cb(); const moved = [later.length, rootW.asked]; later[0](); const ran = rootW.asked; cb(); const quiet = later.length; rootW.clientWidth = 300; cb(); const next = later.length;
        check('tables that fit, the rest: a table that is not the app\'s own, as one in a Raw HTML block, is never stacked. With no measure handed in the room is the width of the box the table stands in. Junk fits nothing and throws nothing. A place is watched with one observer: the same width says nothing, another width fits its tables once, a moment later, however often it is told meanwhile, and with no observer nothing is watched',
            rawN === 0 && rawSt === '0' && ownN === 1 && ownSt === '1' && J(ownBack) === J([1, '0']) && J(junk) === J([0, 0, undefined, undefined]) && !!o && seen.length === 1 && seen[0] === rootW && J(same) === '[0,0]' && J(moved) === '[1,0]' && ran === 1 && quiet === 1 && next === 2
            && TF.tfitWatch(rootW, undefined) === null && TF.tfitWatch(null, Obs) === null, J([rawN, rawSt, ownN, ownSt, ownBack, junk, seen.length, same, moved, ran, quiet, next]));
        // wired, styled and said
        const css = read('style.css'), a = css.indexOf('  /* Tables that fit (1.6.2, backlog 107 (a); pagenav.js tableFit)'), z = css.indexOf('\n  }\n', a), tcss = a < 0 || z < a ? '' : css.slice(a, z);
        const ixT = read('index.html'), wnT = [fs.readFileSync(path.join(root, 'WHATSNEW.txt'), 'utf8'), read('assets/whatsnew.txt')].map(s => s.replace(/\r\n/g, '\n'));
        check('tables that fit, wired, styled and said: the folds\' draw fits the tables last and the strip for an export takes the fit off, each asked through typeof so that a suite that runs the folds alone is as it was. Each place is watched for its width. The rules stand in one screen-only block, so paper keeps the table: the table stays a flow root, so it keeps clear of a picture floated beside it, the heading row is put away but for one that holds a word Find lit, a row is a block, an empty cell is put away and a cell prints its column\'s name from data-col. No rule outside that block names the class. The slice writes no markup and stores nothing. Help and both release notes say it',
            /\n    if \(typeof tableFit === 'function'\) tableFit\(root\);[^\n]*\n    if \(typeof tocDraw === 'function'\) tocDraw\(root\);[^\n]*\n\}\n/.test(src) && /function foldStrip\(root\) \{[^\n]*if \(typeof tableUnfit === 'function'\) tableUnfit\(root\); if \(typeof window !== 'undefined' && window\.wpInlineDice/.test(src)
            && src.includes("        if (typeof tfitWatch === 'function') tfitWatch(root, window.ResizeObserver);") && !/innerHTML|insertAdjacentHTML|localStorage|createElement/.test(slice('tfit'))
            && tcss.includes('\n  @media screen {\n    .doc-view table.pv-tstack { display: flow-root;') && tcss.includes('    .doc-view table.pv-tstack thead:has(mark) { display: block;') && tcss.includes('    .doc-view table.pv-tstack thead { display: none; }\n') && tcss.includes('    .doc-view table.pv-tstack tr { display: block;')
            && tcss.includes('    .doc-view table.pv-tstack td:empty { display: none; }\n') && tcss.includes('    .doc-view table.pv-tstack td[data-col]::before { content: attr(data-col);') && (css.replace(tcss, '').match(/pv-tstack/g) || []).length === 0
            && ixT.includes('<li><b>Tables that fit</b>: where a table has less room than its columns need, each row reads as one small block.') && wnT.every(t => t.includes('- A table in a narrow place now reads a row at a time. Each row is a small\n') && t.indexOf('- A table in a narrow place') < t.indexOf('WAYPOINT 1.6.1')),
            J([tcss.length, (css.replace(tcss, '').match(/pv-tstack/g) || []).length]));
    }

    /* ---- cards side by side (1.6.2, backlog 107 (a); docs/PLANNER_ORG_DESIGN.md 4.6) ---- */
    {
        const CCm = await import(modUrl('cardcore.js'));
        const d = makeDom(), sliceOf = (file, a, b) => { const s = read(file), i = s.indexOf(a), k = s.indexOf(b); if (i < 0 || k < i) throw new Error('pagecheck: ' + a + ' is not in ' + file); return s.slice(i + a.length, k); };
        const pvSrc = sliceOf('scripts/planner.js', '// [sinkcheck:planner-preview-start]', '// [sinkcheck:planner-preview-end]') + '\nreturn plannerPreviewHtml;';
        const NAMES = ['esc', 'sanitizeHtml', 'proseHtml', 'stripMermaidLinks', 'compileFlowchart', 'docStyleCss', 'mergeDocStyle', 'num', 'picRef', 'fmtHtml', 'fmtRich', 'fieldFmt', 'colFmtOf', 'cellFmtOf', 'mermaidPre'];
        const ARGS = [SC.esc, DR.sanitizeHtml, DR.proseHtml, DR.stripMermaidLinks, DR.compileFlowchart, DR.docStyleCss, DR.mergeDocStyle, SC.num, SC.picRef, DR.fmtHtml, DR.fmtRich, DR.fieldFmt, DR.colFmtOf, DR.cellFmtOf, DR.mermaidPre];
        const withCC = new Function(...NAMES, 'CC', pvSrc)(...ARGS, CCm), noCC = new Function(...NAMES, pvSrc)(...ARGS);
        const HOST = 'x" onload="alert(1)';
        const blocksOf = () => [{ type: 'h1', title: 'Session' }, { type: 'h2', title: 'People', cards: 'medium' }, { type: 'text', content: '<p>Read this.</p>' }, { type: 'node', title: 'The gate', rows: [{ col1: 'Rush', col2: 'Time', col3: '1', col4: 'Open' }] },
            { type: 'node', mode: 'person', title: 'Kael' }, { type: 'callout', content: '<p>Mind the tide.</p>' }, { type: 'node', mode: 'table', title: 'Prices', cols: ['Item', 'Cost'], rows: [{ col1: 'Ale', col2: '2' }], layout: { span: true } },
            { type: 'flowchart', nodes: [{ id: 'a', label: 'Start' }], edges: [] }, { type: 'callout', content: '<p>Not wide.</p>', layout: { span: true } }, { type: 'node', title: 'Not ticked', layout: { span: 'true' } },
            { type: 'h2', title: 'After' }, { type: 'node', title: 'Alone' }, { type: 'h2', title: 'Hostile', cards: HOST }, { type: 'node', title: 'Still alone' }, { type: 'h2', title: 'Last', cards: 'small' }, { type: 'node', mode: 'clue', title: 'Ash' }];
        const plan = { id: 'p1', type: 'planner', blocks: blocksOf() }, bare = { id: 'p1', type: 'planner', blocks: blocksOf().map(b => { const c = Object.assign({}, b); delete c.cards; delete c.layout; return c; }) }, camp = { id: 'c1', items: {} };
        const hC = withCC(plan, camp), hB = withCC(bare, camp), hN = noCC(plan, camp), hNb = noCC(bare, camp), tC = toTree(d, hC), tB = toTree(d, hB);
        const wraps = tC.querySelectorAll('.pv-cards'), inWrap = w => w.childNodes.map(c => c.dataset.blk + (/(^| )pv-wide( |$)/.test(c.className) ? 'w' : '')).join(' ');
        const opens = (hC.match(/<div/g) || []).length, closes = (hC.match(/<\/div>/g) || []).length;
        const NV = new Function('document', 'window', slice('outline') + slice('fold') + 'return { foldParts: foldParts, navOutline: navOutline, navBlocks: navBlocks };')({}, {});
        const outl = t => J(NV.navOutline(t).map(o => o.level + ' ' + o.bi + ' ' + o.text)), marks = t => J(NV.foldParts(t).parts.map(p => p.at + ' ' + p.kind + ' ' + p.mark)), nums = t => NV.navBlocks(t).map(b => b.dataset.blk).join();
        check('cards side by side, over what the real renderer draws (planner.js plannerPreviewHtml with the real card core): the blocks under a section set to Cards stand in one wrapper that wears pv-cards and its size, up to the next section, and a section at the planner\'s end is closed. In it text and a chart take the whole row and so does a table ticked Wide card; a card, a person and a note do not, nor a note that carries the tick, nor a card whose tick is not true. A size that is markup in a file makes no wrapper and reaches no class. Every div that is opened is closed. With no card core at hand nothing is wrapped. The same planner with neither key is drawn exactly as the one with them, less the wrappers and the wide class, and has none of either',
            wraps.length === 2 && wraps[0].className === 'pv-cards pv-cards-medium' && wraps[1].className === 'pv-cards pv-cards-small' && inWrap(wraps[0]) === '2w 3 4 5 6w 7w 8 9' && inWrap(wraps[1]) === '15'
            && !hC.includes('onload') && !/pv-cards-(?!medium|small)/.test(hC) && opens === closes && !/pv-cards|pv-wide/.test(hN) && !/pv-cards|pv-wide/.test(hB)
            && hC.replace(/<div class="pv-cards pv-cards-(?:small|medium|large)">/g, '').replace(/ pv-wide"/g, '"').replace(/<\/div>/g, '') === hB.replace(/<\/div>/g, '') && hN === hNb && opens === (hB.match(/<div/g) || []).length + 2,
            J([wraps.map(w => w.className + ': ' + inWrap(w)), opens, closes, hC.includes('onload')]));
        check('cards side by side, the page\'s own navigation over a section of cards: every block is still a block of the page in its order, the Outline lists the same headings by the same numbers, and every fold has the very mark it has in one column, so a fold kept for a page stays when its section becomes cards',
            nums(tC) === nums(tB) && nums(tC) === '0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15' && outl(tC) === outl(tB) && JSON.parse(outl(tC)).length >= 8 && marks(tC) === marks(tB) && JSON.parse(marks(tC)).length >= 10, J([nums(tC), outl(tC), marks(tC) === marks(tB)]));
        // the page editor's + and the inline dice's label, in a row of cards (the review of the fold)
        const pgSrc = sliceOf('scripts/planner.js', '// [pagecheck:pgadd-start]', '// [pagecheck:pgadd-end]'), dE = makeDom(), tE = toTree(dE, hC), pvE = tE.childNodes[0], asAttr = t => t.querySelectorAll('.pv-blk').forEach(f => f.setAttribute('data-blk', f.dataset.blk));   // the test page keeps data- values apart from attributes: a block's number is both in a browser
        asAttr(tE);
        let placed = 0; const pgRun = on => new Function('pgEls', 'pgOn', 'getActiveMap', 'pgPlace', 'document', pgSrc + '\nreturn pgAfterDraw;')(() => ({ pv: pvE }), () => on, () => plan, () => { placed++; }, dE.document)();
        pgRun(true);
        const wrapE = tE.querySelectorAll('.pv-cards')[0], kidsE = wrapE.childNodes.map(c => (c.className.indexOf('pg-add') >= 0 ? '+' + c.getAttribute('data-at') : c.dataset.blk + (/pv-wide/.test(c.className) ? 'w' : ''))).join(' ');
        const inCard = tE.querySelectorAll('.pv-blk').filter(f => f.parentNode === wrapE && !/pv-wide/.test(f.className)).map(f => { const last = f.childNodes[f.childNodes.length - 1], first = f.childNodes[0]; return f.dataset.blk + ':' + (last.className === 'pg-add' && last.getAttribute('data-at') === f.dataset.blk ? 'last' : 'no') + ':' + (first.className === 'pg-add' ? 'first' : 'ok') + ':' + f.querySelectorAll('.pg-add').length; }).join(' ');
        const adds = tE.querySelectorAll('.pg-add').map(b => b.getAttribute('data-at')).sort((a, b) => a - b).join(), outE = outl(tE), endE = pvE.childNodes[pvE.childNodes.length - 1];
        const dR = makeDom(), tR = toTree(dR, hC); asAttr(tR); let placedR = 0; new Function('pgEls', 'pgOn', 'getActiveMap', 'pgPlace', 'document', pgSrc + '\nreturn pgAfterDraw;')(() => ({ pv: tR.childNodes[0] }), () => false, () => plan, () => { placedR++; }, dR.document)();
        const idSrc = read('scripts/inlinedice.js'), ia = idSrc.indexOf('function labelOf(btn) {'), iz = idSrc.indexOf('\n}\n', ia), labelOf = new Function(idSrc.slice(ia, iz + 2) + '\nreturn labelOf;')();
        const dL = makeDom(), tL = toTree(dL, hC), close = (n, t) => { for (let x = n; x; x = x.parentNode) if (x.className && t(x)) return x; return null; }, has = (n, c) => (' ' + n.className + ' ').indexOf(' ' + c + ' ') >= 0;
        const btnIn = bi => { const f = tL.querySelectorAll('.pv-blk').filter(x => x.dataset.blk === String(bi))[0]; return { closest: sel => (sel === '.pv-blk' ? f : null), textContent: 'x' }; };
        tL.querySelectorAll('.pv-blk').concat(tL.querySelectorAll('.pv-cards')).forEach(n => { Object.defineProperty(n, 'previousElementSibling', { get() { const l = this.parentNode.childNodes, i = l.indexOf(this); for (let j = i - 1; j >= 0; j--) if (l[j].nodeType === 1) return l[j]; return null; } }); n.matches = () => false; n.querySelector = () => { let hit = null; (function walk(x) { (x.childNodes || []).forEach(c => { if (hit || c.nodeType !== 1) return; if (/^H[123]$/.test(c.nodeName)) hit = c; else walk(c); }); })(n); return hit; }; });   // the first heading under it, as the selector h1, h2, h3 finds
        const labels = [labelOf(btnIn(2)), labelOf(btnIn(5)), labelOf(btnIn(11))];
        check('cards side by side, the page editor and the dice: in the planner\'s own Edit view the + of a card in a row of cards stands inside the card as its last child, so the row holds only cards and the + of each block that takes the whole row, never a + in a cell of its own; a card\'s first element is still its own, so the Outline reads the page as before; every block has one + and the page one more at its end, and with the editor off nothing is added. A dice button in the first block of a row of cards is still named by its section, found past the wrapper, and one further down by the card above it, as in one column',
            kidsE === '+2 2w 3 4 5 +6 6w +7 7w 8 9' && inCard === '3:last:ok:1 4:last:ok:1 5:last:ok:1 8:last:ok:1 9:last:ok:1' && adds === '0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16' && outE === outl(tC) && has(endE, 'pg-add-end') && placed === 1
            && tR.querySelectorAll('.pg-add').length === 0 && placedR === 1 && J(labels) === J(['People', 'Kael', 'Alone']), J([kidsE, inCard, adds, outE === outl(tC), labels]));
        const css = read('style.css'), pl = read('scripts/planner.js'), ix = read('index.html'), wn = [fs.readFileSync(path.join(root, 'WHATSNEW.txt'), 'utf8'), read('assets/whatsnew.txt')].map(s => s.replace(/\r\n/g, '\n'));
        const widths = ['small', 'medium', 'large'].map(z => +((new RegExp('\\n  \\.doc-view \\.pv-cards-' + z + ' \\{ grid-template-columns: repeat\\(auto-fill, minmax\\(min\\(100%, (\\d+)px\\), 1fr\\)\\); \\}').exec(css) || [])[1] || 0));
        const gap = +((/\n  \.doc-view \.pv-cards \{ display: grid; gap: \d+px (\d+)px; align-items: start; position: relative; \}/.exec(css) || [])[1] || 0), fits = (room, w) => Math.max(1, Math.floor((room + gap) / (w + gap)));
        check('cards side by side, styled and wired: the wrapper is a grid whose columns fill the room, and by the style sheet\'s own numbers a page of 980 px holds five Small, three Medium or two Large and the panel over the map two Small or one, with a gap wide enough for a card\'s fold arrow. A wide block spans the row, paper splits no card, and a part put away in a row of cards leaves the row. The editor offers Blocks under it and Card size on a planner\'s section heading and Wide card on a card or a picture of such a section, each change one save, and the preview asks the card core through typeof. Help, the Markdown notes and both release notes say it',
            J(widths.map(w => fits(980, w))) === '[5,3,2]' && J(widths.map(w => fits(392, w))) === '[2,1,1]' && gap >= 18 && css.includes('\n  .doc-view .pv-cards > .pv-wide { grid-column: 1 / -1; }\n') && css.includes('\n  .doc-view .pv-cards > .pv-blk { min-width: 0; }\n')
            && css.includes('\n  @media print { .doc-view .pv-cards > .pv-blk { break-inside: avoid; } }\n') && css.includes('\n  .doc-view .pv-cards > .pg-add { grid-column: 1 / -1; }\n') && css.includes('\n  .pbe-page .pv-cards > .pv-blk:where(:not(.pv-wide)) { position: relative; padding-top: 12px; }') && css.includes('\n  .doc-view .pv-cards > .pv-blk > .pg-add { position: absolute; left: 0; top: 0; }\n')
            && pl.includes("if (fl > flMax) fl = Math.max(Math.round(pvr.left - pr.left), flMax);") && css.includes('    .pv-folds .pv-cards > .pv-blk.pv-fold-hid { position: absolute; left: 0; width: 100%; }')
            && pl.includes("var ccS = typeof CC === 'object' && CC && typeof CC.cleanCards === 'function' ? CC : null, cardsOn = '';") && pl.includes('<select class="b-h2cards" data-idx="') && pl.includes('<select class="b-h2size" data-idx="') && pl.includes('<input type="checkbox" class="b-wide" data-idx="')
            && pl.includes("if (this.value === 'cards') bb.cards = CC.cleanCards(bb.cards) || 'medium'; else delete bb.cards; save(true); renderPlanner(); }));") && pl.includes("CC.wideSet(bb, this.checked); save(true); renderPlanner(); }));")
            && pl.includes("if (!isDocEd && secCards && CC.wideMay(b)) html +=") && pl.includes("if (!isDocEd && b.type === 'h2') html +=")
            && ix.includes('<li><b>Cards side by side</b>: a section heading of a planner has <b>Blocks under it</b>.') && ix.includes('<li>In a planner, <code>## Opening {cards=medium}</code> sets the blocks under that section as cards.')
            && wn.every(t => t.includes("- A planner's section can lay its cards side by side. On the section\n") && t.indexOf("- A planner's section can lay its cards") < t.indexOf('WAYPOINT 1.6.1')), J([widths, gap, widths.map(w => fits(980, w)), widths.map(w => fits(392, w))]));
    }

    /* ---- the page editor's open form belongs to its page (1.6.2, found by hand) ---- */
    {
        const plS = read('scripts/planner.js'), a = plS.indexOf('// [pagecheck:pgitem-start]'), z = plS.indexOf('// [pagecheck:pgitem-end]');
        const st = { am: { id: 'p1' } }, ro = { n: 0, disconnect() { this.n++; } }, pg = { open: 2, item: 'p1', ro: null };
        const F = new Function('_pg', 'getActiveMap', plS.slice(a, z) + '\nreturn { pgOwn: pgOwn, pgItemNow: pgItemNow };')(pg, () => st.am);
        F.pgOwn(); const same = pg.open;
        st.am = { id: 'p2' }; pg.ro = ro; F.pgOwn(); const other = [pg.open, pg.ro, ro.n];
        pg.open = 1; pg.item = 'p2'; st.am = null; F.pgOwn(); const none = pg.open;
        const old = { open: 3, ro: null }; new Function('_pg', 'getActiveMap', plS.slice(a, z) + '\nreturn pgOwn;')(old, () => ({ id: 'p9' }))();
        check('the page editor\'s open form belongs to the page it was opened on: with that page on screen it stays open, with another page or none it is put away and its observer let go, so the block at the same place of another page never comes up open; a form opened by a path that named no page is left as it was; opening notes the page, and placing and reopening ask first',
            a > 0 && z > a && same === 2 && J(other) === J([-1, null, 1]) && none === -1 && old.open === 3
            && plS.includes("      _pg.open = Math.round(Number(i)); _pg.item = pgItemNow(); pgPlace();\n") && plS.includes("  function pgPlace() {   // the open form over (or under) its drawn block, the page making room for it\n      pgOwn();\n") && plS.includes("  function pgReopen() { pgOwn(); if (!pgOn() || _pg.open < 0) return;"), J([same, other, none, old.open]));
    }

    /* ---- Mentioned in (1.6.2, backlog 107 (a); docs/PLANNER_ORG_DESIGN.md 4.9): the button the preview draws ---- */
    {
        const CCm = await import(modUrl('cardcore.js'));
        const d = makeDom(), sliceOf = (file, a, b) => { const s = read(file), i = s.indexOf(a), k = s.indexOf(b); if (i < 0 || k < i) throw new Error('pagecheck: ' + a + ' is not in ' + file); return s.slice(i + a.length, k); };
        const pvSrc = sliceOf('scripts/planner.js', '// [sinkcheck:planner-preview-start]', '// [sinkcheck:planner-preview-end]') + '\nreturn plannerPreviewHtml;';
        const NAMES = ['esc', 'sanitizeHtml', 'proseHtml', 'stripMermaidLinks', 'compileFlowchart', 'docStyleCss', 'mergeDocStyle', 'num', 'picRef', 'fmtHtml', 'fmtRich', 'fieldFmt', 'colFmtOf', 'cellFmtOf', 'mermaidPre'];
        const ARGS = [SC.esc, DR.sanitizeHtml, DR.proseHtml, DR.stripMermaidLinks, DR.compileFlowchart, DR.docStyleCss, DR.mergeDocStyle, SC.num, SC.picRef, DR.fmtHtml, DR.fmtRich, DR.fieldFmt, DR.colFmtOf, DR.cellFmtOf, DR.mermaidPre];
        const withCC = new Function(...NAMES, 'CC', pvSrc)(...ARGS, CCm), noCC = new Function(...NAMES, pvSrc)(...ARGS);
        const HOST = 'b"><img src=x onerror=alert(1)>';
        const mk = ids => [{ type: 'h1', title: 'Session' }, { type: 'node', mode: 'person', title: 'Kael' }, { type: 'node', mode: 'place', title: 'The <b>ford</b>' }, { type: 'node', mode: 'clue', title: 'Ash' }, { type: 'node', title: 'The gate' },
            { type: 'node', mode: 'table', title: 'Prices', cols: ['Item'], rows: [{ col1: 'Ale' }] }, { type: 'node', mode: 'person', title: '' }, { type: 'node', mode: 'person', title: 'Mira' }].map((b, i) => ids ? Object.assign({ id: i === 7 ? HOST : 'b_' + i }, b) : b);
        const withIds = { id: 'p"1', type: 'planner', blocks: mk(true) }, noIds = { id: 'p"1', type: 'planner', blocks: mk(false) }, camp = { id: 'c1', items: {} };
        const hI = withCC(withIds, camp), hN = withCC(noIds, camp), hO = noCC(withIds, camp), tI = toTree(d, hI), tN = toTree(d, hN);
        const btns = tI.querySelectorAll('.pv-ment'), got = btns.map(b => [b.closest('.pv-blk').dataset.blk, b.dataset.page, b.dataset.at, b.dataset.say, b.childNodes.length, b.getAttribute('aria-label'), b.parentNode.className, b.parentNode.dataset['html2canvas-ignore']]);
        const NV = new Function('document', 'window', slice('outline') + slice('fold') + 'return { foldParts: foldParts, navOutline: navOutline };')({}, {});
        const marks = t => J(NV.foldParts(t).parts.map(p => p.at + ' ' + p.kind + ' ' + p.mark)), outl = t => J(NV.navOutline(t).map(o => o.level + ' ' + o.bi + ' ' + o.text));
        check('Mentioned in, over what the real renderer draws (planner.js plannerPreviewHtml with the real card core): a person and a place card with a name and an id of its own end in one button that names its planner and its block, both as escaped attributes, and holds no text node, its words an attribute the style sheet prints; a clue, a scene, a plain table, a card with no name, a card with no id and a planner drawn with no card core get none; the Outline and every fold mark are the same with the button as without it',
            J(got) === J([['1', 'p"1', 'b_1', 'Mentioned in\u2026', 0, 'Mentioned in', 'pv-linkrow pv-ment-row', 'true'], ['2', 'p"1', 'b_2', 'Mentioned in\u2026', 0, 'Mentioned in', 'pv-linkrow pv-ment-row', 'true'], ['7', 'p"1', HOST, 'Mentioned in\u2026', 0, 'Mentioned in', 'pv-linkrow pv-ment-row', 'true']])
            && tI.querySelectorAll('img').length === 0 && !hN.includes('pv-ment') && !hO.includes('pv-ment') && marks(tI) === marks(tN) && outl(tI) === outl(tN)
            && hI.split('pv-ment-row').length - 1 === 3, J([got, marks(tI) === marks(tN), hO.includes('pv-ment')]));
    }

    /* ---- Names only (1.6.2, backlog 107 (a); docs/PLANNER_ORG_DESIGN.md 4.7) ---- */
    {
        const N = mkNav(), rt = N.el.plannerPreview, D = N.dom, el = (tag, cls, kids) => mk(D, tag, cls, kids), bk = (i, kids, wide) => { const b = blk(D, i, kids); if (wide) b.className = 'pv-blk pv-wide'; return b; };
        const card = (i, name, wide) => bk(i, [el('div', 'node', [el('h3', '', [name]), el('p', '', ['Wants something.'])])], wide);
        const build = () => { while (rt.firstChild) rt.removeChild(rt.firstChild);
            const wrapA = el('div', 'pv-cards pv-cards-medium', [bk(2, [el('p', '', ['Read this aloud.'])], true), card(3, 'Kael'), card(4, 'Mira'), card(5, 'Big one', true), bk(6, [el('figure', 'planner-img', [])], true)]);
            const wrapB = el('div', 'pv-cards pv-cards-small', [bk(9, [el('p', '', ['Only words here.'])], true)]);
            rt.appendChild(el('div', 'wrap', [bk(0, [el('h1', '', ['Session'])]), bk(1, [el('h2', '', ['People'])]), wrapA, bk(7, [el('h2', '', ['After'])]), bk(8, [el('h2', '', ['Words'])]), wrapB])); return [wrapA, wrapB]; };
        const serN = n => n.nodeType === 3 ? '#' + n.nodeValue : n.nodeName + '.' + n.className + J(n.attrs) + J(n.dataset) + '[' + n.childNodes.map(serN).join('|') + ']';
        const [wA, wB] = build(), drawn = serN(rt), outl0 = J(N.api.foldParts(rt).parts.map(p => p.at + p.kind + p.mark));
        N.api.navWire(); N.api.foldApply(rt);
        const nb = () => wA.childNodes.filter(c => c.nodeType === 1 && c.className === 'pv-names-btn'), b0 = nb()[0], first = [nb().length, wA.childNodes[0] === b0, b0 && b0.nodeName, b0 && b0.type, b0 && b0.dataset.say + '|' + b0.getAttribute('aria-label') + '|' + b0.childNodes.length + '|' + b0.textContent, b0 && b0.getAttribute('aria-pressed'), b0 && b0.dataset.tip, wB.childNodes.filter(c => c.className === 'pv-names-btn').length];
        const sameParts = J(N.api.foldParts(rt).parts.map(p => p.at + p.kind + p.mark)) === outl0, shutOf = () => blocks(rt).map((b, i) => (b.classList.contains('pv-fold-shut') ? b.dataset.blk : '')).filter(Boolean).join();
        D.fire(b0, 'click'); const named = [shutOf(), nb()[0] === b0, b0.dataset.say, b0.getAttribute('aria-pressed'), b0.dataset.tip, Object.keys(N.kept().pages).length];
        D.fire(b0, 'click'); const opened = [shutOf(), b0.dataset.say + '|' + b0.getAttribute('aria-label'), b0.getAttribute('aria-pressed')];
        N.api.foldToggle(rt, blocks(rt)[3]); const one = [shutOf(), nb()[0].dataset.say]; D.fire(nb()[0], 'click'); const rest = [shutOf(), nb()[0].dataset.say];
        D.fire(nb()[0], 'click'); N.api.foldToggle(rt, blocks(rt)[1]); const secShut = [nb().length, blocks(rt)[1].classList.contains('pv-fold-shut')]; N.api.foldToggle(rt, blocks(rt)[1]); const secOpen = [nb().length, nb()[0] && nb()[0].dataset.say];
        const ob = N.el.plannerOutlineBtn; N.press(ob, true); const foot = N.api.menu().querySelectorAll('.pagenav-act').map(a => a.dataset.act + '|' + a.textContent), all = N.api.menu().querySelectorAll('.pagenav-act').filter(a => a.dataset.act === 'namesall')[0];
        D.fire(all, 'click'); const allDone = [shutOf(), nb()[0].dataset.say, N.api.navIsOpen()];
        const pageText = rt.textContent, noWords = !/Names only|Open cards/.test(pageText);   // the page's Find walks its text nodes: the button's words are none of them
        N.api.foldStrip(rt); const bare = [serN(rt) === drawn, nb().length];
        const P = mkNav(); P.page(P.el.plannerPreview, [{ tag: 'h1', text: 'T' }, { tag: 'h2', text: 'A' }, { text: 'words' }]); P.api.navWire(); P.api.foldApply(P.el.plannerPreview); P.press(P.el.plannerOutlineBtn, true); const plainFoot = P.api.menu().querySelectorAll('.pagenav-act').map(a => a.dataset.act).join();
        const W = mkNav(), rw = W.el.plannerPreview; rw.appendChild(mk(W.dom, 'div', 'wrap', [blk(W.dom, 0, [mk(W.dom, 'h2', '', ['Words'])]), mk(W.dom, 'div', 'pv-cards pv-cards-small', [(() => { const b = blk(W.dom, 1, [mk(W.dom, 'p', '', ['Only words here.'])]); b.className = 'pv-blk pv-wide'; return b; })()])]));
        W.api.navWire(); W.api.foldApply(rw); W.press(W.el.plannerOutlineBtn, true); const wordsFoot = W.api.menu().querySelectorAll('.pagenav-act').map(a => a.dataset.act).join();
        check('Names only, run for real on a page with a row of cards: the row gets one button as its first child, which is no block of the page, so the parts that fold and their marks are as without it. A press folds every card of that row to its name, a card ticked Wide card among them, and never the text or the picture that take the whole row; the same button then reads Open cards and a press opens them. With one card folded it still reads Names only and folds the rest. While the section itself is folded the button is gone, and it is back when the section opens. A row that holds no card has no button. The button holds no text node: its words are an attribute the style sheet prints, so the page\'s Find, which walks every text node, never meets them. The Outline menu\'s foot offers Cards to names on a page that holds a card in a row and on no other, a page whose only row holds text among them, and it folds every card. Taken off for an export the page is exactly as drawn',
            J(first) === J([1, true, 'BUTTON', 'button', 'Names only|Names only|0|', 'false', 'Fold every card of this section to its name', 0]) && sameParts && J(named) === J(['3,4,5', true, 'Open cards', 'true', 'Open every card of this section', 1]) && J(opened) === J(['', 'Names only|Names only', 'false'])
            && J(one) === J(['3', 'Names only']) && J(rest) === J(['3,4,5', 'Open cards']) && J(secShut) === J([0, true]) && J(secOpen) === J([1, 'Names only']) && J(foot) === J(['foldall|Fold all', 'openall|Open all', 'namesall|Cards to names', 'toc|Contents'])
            && J(allDone) === J(['3,4,5', 'Open cards', false]) && noWords && J(bare) === '[true,0]' && plainFoot === 'foldall,openall' && wordsFoot === 'foldall,openall', J([first, sameParts, named, opened, one, rest, secShut, secOpen, foot, allDone, bare, plainFoot]));
        const cssN = read('style.css'), ixN = read('index.html'), wnN = [fs.readFileSync(path.join(root, 'WHATSNEW.txt'), 'utf8'), read('assets/whatsnew.txt')].map(s => s.replace(/\r\n/g, '\n'));
        check('Names only, styled and said: the button shows only on a page the folds have marked and on screen, at the right end of its row of cards; Help and both release notes say it',
            cssN.includes('\n  .pv-names-btn { display: none; }\n  .pv-fold-btn { display: none; }\n  @media screen {\n') && cssN.includes('    .pv-folds .pv-names-btn { display: block; grid-column: 1 / -1; justify-self: end;') && cssN.includes('    .pv-folds .pv-names-btn::before { content: attr(data-say); }\n')
            && src.includes("var nb = !a && t && t.closest ? t.closest('.pv-names-btn') : null; if (nb) { e.preventDefault(); e.stopPropagation(); namesToggle(root, nb); return; }")
            && ixN.includes('<li><b>Names only</b>: a section of cards has a small <b>Names only</b> button at its top right.') && wnN.every(t => t.includes('- Names only, at the top right of a section of cards, folds its cards to\n') && t.indexOf('- Names only, at the top right') < t.indexOf('WAYPOINT 1.6.1')));
    }

    /* ---- Contents (1.6.2, backlog 107 (a); docs/PLANNER_ORG_DESIGN.md 4.7) ---- */
    {
        const HOSTILE = '<img src=x onerror=alert(1)>';
        const fill = (N, rt) => { const D = N.dom, el = (tag, cls, kids) => mk(D, tag, cls, kids), card = (i, name, cls) => blk(D, i, [el('div', 'node' + (cls ? ' ' + cls : ''), [el('h3', '', [name]), el('p', '', ['Words.'])])]);
            while (rt.firstChild) rt.removeChild(rt.firstChild);
            const w = el('div', 'wrap', [blk(D, 0, [el('h1', '', ['Session'])]), card(1, 'Before any section'), blk(D, 2, [el('h2', '', ['People'])]), el('div', 'pv-cards pv-cards-medium', [card(3, 'Kael', 'card-person'), card(4, 'Mira')]),
                blk(D, 5, [el('h2', '', [HOSTILE])]), card(6, 'Dock', 'card-place'), card(7, 'Prices', 'plain-table'), blk(D, 8, [el('h2', '', ['Empty'])]), blk(D, 9, [el('p', '', ['Only words.'])])]);
            rt.appendChild(w); return w; };
        const N = mkNav(), rt = N.el.docPanelBody, D = N.dom; fill(N, rt); N.api.navWire(); N.api.foldApply(rt);
        const toc = () => rt.parentNode.childNodes.filter(c => c.nodeType === 1 && c.className.split(' ')[0] === 'pv-toc'), t0 = toc()[0], B = () => blocks(rt);
        const rows = t => t.childNodes.map(c => c.className.replace(' on', '') + '|' + (c.dataset.blk || '') + '|' + c.childNodes.map(k => (k.nodeType === 3 ? k.nodeValue : k.nodeName + (k.className ? '.' + k.className : '') + ':' + k.textContent)).join(','));
        const made = [toc().length, t0 && t0.nodeName, t0 && t0.getAttribute('aria-label'), t0 && t0.nextSibling === rt, J(rows(t0)), /Contents/.test(rt.textContent)];
        const onOf = () => t0.childNodes.filter(c => /(^| )on( |$)/.test(c.className)).map(c => c.dataset.blk).join();
        B()[2].rect = { left: 0, top: 20, right: 10, bottom: 40 }; B()[5].rect = { left: 0, top: 300, right: 10, bottom: 320 }; B()[8].rect = { left: 0, top: 900, right: 10, bottom: 920 };
        N.api.foldApply(rt); const first = onOf(); B()[5].rect = { left: 0, top: 40, right: 10, bottom: 60 }; D.fire(rt, 'scroll'); const before = onOf(); D.runTimers(); const second = onOf();
        B()[2].rect = { left: 0, top: 500, right: 10, bottom: 520 }; B()[5].rect = { left: 0, top: 700, right: 10, bottom: 720 }; D.fire(rt, 'scroll'); D.runTimers(); const none = onOf();
        rt.scrollTop = 400; rt.clientHeight = 300; rt.scrollHeight = 700; rt.rect = { left: 0, top: 0, right: 400, bottom: 300 }; B()[2].rect = { left: 0, top: -200, right: 10, bottom: -180 }; B()[5].rect = { left: 0, top: 150, right: 10, bottom: 170 }; D.fire(rt, 'scroll'); D.runTimers(); const atEnd = onOf();
        rt.scrollTop = 0; N.api.foldToggle(rt, B()[2]); const hid = B()[3].classList.contains('pv-fold-hid'), chip = t0.childNodes.filter(c => c.dataset.blk === '3')[0], h3 = B()[3].childNodes.filter(c => c.nodeType === 1 && /(^| )node( |$)/.test(c.className))[0].childNodes[0], was = h3.calls.length;
        D.fire(chip, 'click'); const went = [B()[3].classList.contains('pv-fold-hid'), B()[2].classList.contains('pv-fold-shut'), h3.calls.slice(was).indexOf('scrollIntoView') >= 0, toc()[0] === t0];
        const F = mkNav(), rf = F.el.docPanelBody; F.page(rf, [{ tag: 'h1', text: 'T' }, { tag: 'h1', text: 'Act 2' }, { tag: 'h2', text: 'Docks' }, { text: 'words' }, { tag: 'h2', text: 'Market' }, { text: 'more' }, { tag: 'h1', text: 'Act 3' }, { text: 'end' }]); F.api.navWire(); F.api.foldApply(rf);
        const tf = rf._wpToc, fB = blocks(rf); fB[1].rect = { left: 0, top: 10, right: 9, bottom: 30 }; [2, 4].forEach(i => { fB[i].rect = { left: 0, top: 30, right: 9, bottom: 30 }; }); fB[6].rect = { left: 0, top: 400, right: 9, bottom: 420 };
        F.api.foldToggle(rf, fB[1]); F.dom.fire(rf, 'scroll'); F.dom.runTimers(); const foldedNow = [fB[2].classList.contains('pv-fold-hid'), tf.childNodes.filter(c => /(^| )on( |$)/.test(c.className)).map(c => c.dataset.blk).join()];
        const chips = t0.childNodes.filter(c => /pv-toc-sec/.test(c.className)); t0.clientWidth = 100; t0.scrollWidth = 400; t0.scrollLeft = 0; chips.forEach((c, i) => { c.offsetLeft = i * 150; c.rect = { left: 0, top: 0, right: 120, bottom: 20 }; });   // the test page works a width out from a rect
        B()[2].rect = { left: 0, top: -500, right: 10, bottom: -480 }; B()[5].rect = { left: 0, top: -300, right: 10, bottom: -280 }; B()[8].rect = { left: 0, top: 20, right: 10, bottom: 40 }; rt.scrollTop = 0; D.fire(rt, 'scroll'); D.runTimers(); const seen = [onOf(), t0.scrollLeft];
        const wh = D.fire(t0, 'wheel', { deltaY: -60 }), wheeled = [t0.scrollLeft, !!wh.defaultPrevented]; t0.scrollWidth = 90; const wh2 = D.fire(t0, 'wheel', { deltaY: 40 }), still = [t0.scrollLeft, !!wh2.defaultPrevented]; t0.scrollWidth = 400;
        B()[2].rect = { left: 0, top: 20, right: 10, bottom: 40 }; B()[5].rect = { left: 0, top: 300, right: 10, bottom: 320 }; B()[8].rect = { left: 0, top: 900, right: 10, bottom: 920 }; D.fire(rt, 'scroll'); D.runTimers(); const seenBack = [onOf(), t0.scrollLeft];
        const pic = t0.getAttribute('data-html2canvas-ignore');
        const ob = N.el.docPanelOutline; N.press(ob, true); const tick = () => N.api.menu().querySelectorAll('.pagenav-act').filter(a => a.dataset.act === 'toc')[0], t1 = [tick().className, tick().getAttribute('role'), tick().getAttribute('aria-checked'), tick().textContent];
        D.fire(tick(), 'click'); const off = [toc().length, N.store.data.wp_pageToc, N.api.navIsOpen()]; N.api.foldApply(rt); const stillOff = toc().length;
        N.press(ob, true); const t2 = [tick().className, tick().getAttribute('aria-checked')]; D.fire(tick(), 'click'); const back = [toc().length, toc()[0] === t0, N.store.data.wp_pageToc === undefined];
        N.store.data.wp_pageToc = 'off'; N.told({ key: 'wp_pageToc' }); const toldOff = toc().length; delete N.store.data.wp_pageToc; N.told({ key: 'wp_other' }); const deaf = toc().length; N.told({ key: 'wp_pageToc' }); const toldOn = toc().length;
        const P = mkNav(), rp = P.el.docPanelBody; P.page(rp, [{ tag: 'h1', text: 'T' }, { tag: 'h2', text: 'A' }, { text: 'words' }]); P.api.navWire(); P.api.foldApply(rp); const one = rp.parentNode.childNodes.filter(c => c.nodeType === 1 && c.className === 'pv-toc').length;
        P.press(P.el.docPanelOutline, true); const oneFoot = P.api.menu().querySelectorAll('.pagenav-act').map(a => a.dataset.act).join();
        check('Contents, run for real: a page with two sections or more gets one strip, this module\'s own element right before the box the page is drawn in and outside it, so no word of it is a word of the page. It lists each section with how many cards it holds and each card under it with its kind\'s drawing, a person and a place by theirs; the page\'s title is no section, a card before the first section belongs to none and a plain table is no card; a heading that is markup in a file is text. The section in view is marked: the last whose heading has reached the top of the box, the first before any has, and at the page\'s end the last one in sight, worked out a moment after a scroll. A section put away by a folded section above it is never the one in view. In a strip too narrow for its chips the chip of the section in view is brought into sight by the strip\'s own scroll, and the wheel moves the strip sideways only while it has more than it shows. A press on a card inside a folded section opens the section and goes to the card. It is marked to stay out of a picture of the page, and another window of this computer follows the tick. The Outline menu\'s foot has a Contents tick on such a page and on no other: unticked it puts Contents away and keeps that for this computer, a redraw leaves it away, and ticked again the same strip is back',
            J(made) === J([1, 'NAV', 'Contents', true, J(['pv-toc-head||Contents', 'pv-toc-sec|2|People,SMALL:2', 'pv-toc-card|3|I.wib wi-person:,Kael', 'pv-toc-card|4|Mira', 'pv-toc-sec|5|' + HOSTILE + ',SMALL:1', 'pv-toc-card|6|I.wib wi-marker:,Dock', 'pv-toc-sec|8|Empty']), false])
            && first === '2' && before === '2' && second === '5' && none === '2' && atEnd === '5' && hid === true && J(went) === '[false,false,true,true]'
            && J(foldedNow) === J([true, '1']) && J(seen) === J(['8', 328]) && J(wheeled) === J([268, true]) && J(still) === J([268, false])   /* the third chip stands at 300 and is 120 wide in a strip 100 wide: 300 + 120 + 8 - 100 */ && J(seenBack) === J(['2', 0]) && pic === 'true' && toldOff === 0 && deaf === 0 && toldOn === 1
            && J(t1) === J(['pagenav-act pagenav-tick on', 'menuitemcheckbox', 'true', 'Contents']) && J(off) === J([0, 'off', false]) && stillOff === 0 && J(t2) === J(['pagenav-act pagenav-tick', 'false']) && J(back) === '[1,true,true]' && one === 0 && oneFoot === 'foldall,openall',
            J([foldedNow, seen, wheeled, still, seenBack, pic, toldOff, deaf, toldOn, made, first, before, second, none, atEnd, hid, went, t1, off, stillOff, t2, back, one, oneFoot]));
        // the planner's own view: in its bar as a strip, or beside the page as a column where the margin has room
        const V = mkNav(), rv = V.el.plannerPreview, bar = V.doc.createElement('div'); bar.id = 'plannerFindBar'; bar.rect = { left: 0, top: 0, right: 900, bottom: 62 }; rv.parentNode.insertBefore(bar, rv);
        const wv = fill(V, rv); V.api.navWire(); V.api.foldApply(rv); const tv = bar.childNodes.filter(c => c.className === 'pv-toc')[0], strip = [!!tv, bar.childNodes[bar.childNodes.length - 1] === tv, tv && tv.className, tv && (tv.style.top || '')];
        rv.parentNode.clientWidth = 1492; wv.clientWidth = 1020; V.api.foldApply(rv); const col = [tv.parentNode === rv.parentNode, tv.nextSibling === rv, tv.className, tv.style.top, bar.childNodes.indexOf(tv) < 0];
        bar.rect = { left: 0, top: 0, right: 900, bottom: 100 }; const hooked = new Function('document', 'window', 'setTimeout', slice('outline') + slice('menu').slice(slice('menu').indexOf('var TOC_STORE')) + '\nreturn tocTop;');
        rv.parentNode.clientWidth = 1490; V.api.foldApply(rv); const tight = [tv.parentNode === bar, tv.className, tv.style.top || ''];
        rv.parentNode.removeChild(bar); V.api.foldApply(rv); const noBar = [tv.parentNode === bar, bar.childNodes.indexOf(tv) >= 0];
        const cssT = read('style.css'), a = cssT.indexOf('  /* Contents (1.6.2, backlog 107 (a); pagenav.js tocDraw)'), z = cssT.indexOf('\n  }\n', a), tcss = a < 0 || z < a ? '' : cssT.slice(a, z), ixT = read('index.html'), wnT = [fs.readFileSync(path.join(root, 'WHATSNEW.txt'), 'utf8'), read('assets/whatsnew.txt')].map(s => s.replace(/\r\n/g, '\n'));
        check('Contents, the planner\'s own view, the styles and the words: there the strip stands in the bar that stays at the top of the page, as its last child, so the bar\'s own measure makes room for it; where the box leaves 236 px or more beside the page, room for the column and the fold arrows in the page\'s margin, it is a column right before the page, held under the bar by the bar\'s own measure, and the page is then a flow root, so a clear inside it never clears the column; with less room it is the strip again. While the bar is off the page for a moment, as for a picture, Contents is left where it stands. It shows on screen only, the column alone lists the cards, and it is drawn again when a place changes width. Help and both release notes say it',
            J(strip) === J([true, true, 'pv-toc', '']) && J(col) === J([true, true, 'pv-toc pv-toc-col', '72px', true]) && J(tight) === J([true, 'pv-toc', '']) && J(noBar) === '[true,true]' && typeof hooked === 'function'
            && src.includes("go = function() { navBarSet(doc); if (typeof tocTop === 'function') tocTop(doc); };") && tcss.includes('    .pv-toc.pv-toc-col + #plannerPreview { display: flow-root; }')
            && tcss.includes('\n  .pv-toc { display: none; }\n  @media screen {\n    .pv-toc { display: flex; flex: none;') && tcss.includes('    .pv-toc .pv-toc-card { display: none; }\n') && tcss.includes('    .pv-toc-col .pv-toc-card { display: flex;') && tcss.includes('    .pv-toc.pv-toc-col { display: block; position: sticky; float: left; width: 190px;')
            && (cssT.replace(tcss, '').match(/pv-toc/g) || []).length === 0 && src.includes("try { tableFit(root); if (typeof tocDraw === 'function') tocDraw(root); } catch (e) {}") && src.includes("if (act.dataset.act === 'toc') tocSet(tocOff());")
            && ixT.includes('<li><b>Contents</b>: a page with two sections or more shows them as a row of chips above it.') && wnT.every(t => t.includes('- Contents: a page with two sections or more shows them as a row of chips\n') && t.indexOf('- Contents: a page with two sections') < t.indexOf('WAYPOINT 1.6.1')), J([strip, col, tight, tcss.length, (cssT.replace(tcss, '').match(/pv-toc/g) || []).length]));
    }

    summed = true;
    console.log('\n' + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exit(1);
})();

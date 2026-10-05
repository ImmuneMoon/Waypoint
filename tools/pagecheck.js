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
        real = { p: pTree, d: dTree, hostile: HOSTILE };
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
        const api = new Function('document', 'window', 'location', 'setTimeout', 'URLSearchParams', 'getActiveCampaign', "'use strict';\n" + slice('outline') + '\n' + slice('fold') + '\n' + slice('menu')
            + '\nreturn { navWire: navWire, navToggle: navToggle, navClose: navClose, navIsOpen: navIsOpen, navRootOf: navRootOf, menu: function() { return _navMenu; }, from: function() { return _navFrom; }, places: NAV_PLACES,'
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
            && /@media \(prefers-reduced-motion: reduce\) \{ \.doc-view \.pagenav-hit, #popoutBody \.pagenav-hit \{ animation: none; outline: 2px solid var\(--gold\); \} \}/.test(css) && /\n  #plannerPreview \.pv-blk \{ scroll-margin-top: 58px; \}/.test(css)
            && css.includes('body.popout-mode > *:not(#popoutWrap):not(#chatPanel):not(#customConfirm):not(svg):not([id^="dmermaid"]) { display: none !important; }') && /#popoutBar #popoutDock, #popoutBar #popoutOutline \{ flex: none;/.test(css));
        check('the renderers still draw what the outline reads: each block in a box of its own that carries the block\'s number, a page\'s and a planner\'s alike, with a heading, a node\'s title or a table\'s title as the first thing in it',
            dr.includes("var blk = '<div class=\"pv-blk\" data-blk=\"' + i + '\">';") && pl.includes("html += '<div class=\"pv-blk\" data-blk=\"' + _bi + '\">';") && dr.includes("case 'h3': blk += '<h3 class=\"doc-h3\">'")
            && dr.includes("blk += '<div' + layoutAttrs(b, 'node plain-table doc-tablewrap') + '>';\n                if (b.title) blk += '<h3>'") && pl.includes("html += '<div class=\"node' + (plainPv ? ' plain-table' : '') + '\">';\n              if (!plainPv || b.title) html += '<h3>'"));
        const mainSrc = read('scripts/main.js'), panelSrc = read('scripts/docpanel.js'), scripts = fs.readdirSync(path.join(app, 'scripts')).filter(f => /\.js$/.test(f));
        check('the folds are wired: Find in the planner\'s own view and Find in the panel over the map open the fold their current hit lies in before they scroll to it; the two exports that read the preview\'s own markup take the folds off first and put them back, the picture also when it fails; the panel says which page it shows; the module publishes what these call, asks for the open campaign, follows another window through the storage event, and holds every fold class and the folds\' own storage key by itself',
            pl.includes("      if (typeof window !== 'undefined' && window.wpPageNav && typeof window.wpPageNav.reveal === 'function') window.wpPageNav.reveal(h[0]);   // a hit inside a folded part: the fold is opened first (pagenav.js)\n      h[0].scrollIntoView({ block: 'center', behavior: quiet ? 'auto' : 'smooth' });\n")
            && panelSrc.includes("if (hits[curHit] && typeof window !== 'undefined' && window.wpPageNav && typeof window.wpPageNav.reveal === 'function') window.wpPageNav.reveal(hits[curHit][0]); if (scroll !== false && hits[curHit]) hits[curHit][0].scrollIntoView(")
            && panelSrc.includes('window.wpDocPanel = { open: open, close: close, refresh: refresh, popOut: popOut, openId: function() { return openId; } };')
            && mainSrc.includes("          if (navX && navX.strip) navX.strip(pvX);   // the page as drawn: an export carries no fold and no fold arrow (pagenav.js)\n          var content = pvX.innerHTML;\n          if (navX && navX.apply) navX.apply(pvX);\n")
            && mainSrc.includes("refoldI = function() { if (pvI && navI && navI.apply) navI.apply(pvI); };\n      if (pvI && navI && navI.strip) navI.strip(pvI);") && mainSrc.includes("      html2canvas(target, opts).then(function(cv) {\n          refoldI();\n") && mainSrc.includes("      }).catch(function() {\n\n          refoldI();\n")
            && src.includes("        reveal: function(el) { var root = navRootOf(el); return root ? foldReveal(root, el, false) : false; },") && src.includes('        strip: foldStrip, apply: foldApply') && src.includes("import { getActiveCampaign } from './models.js';")
            && src.includes("    if (typeof window.addEventListener === 'function') window.addEventListener('storage', function(e) {\n        if (e && e.key !== null && e.key !== FOLD_STORE) return;\n")
            && src.includes("        if (typeof window.MutationObserver === 'function') new window.MutationObserver(function() { foldApply(root); }).observe(root, { childList: true });")
            && J(scripts.filter(f => /pv-fold|wp_pageFolds/.test(read('scripts/' + f)))) === J(['pagenav.js']));
        const fa = css.indexOf('  @media screen {\n    .pv-folds .pv-fold-btn { display: block; float: left;'), fz = css.indexOf('\n  }\n  #plannerPreview .pv-blk { scroll-margin-top: 58px; }'), foldCss = fa > 0 && fz > fa ? css.slice(fa + '  @media screen {\n'.length, fz + 1) : '';
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

    summed = true;
    console.log('\n' + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exit(1);
})();

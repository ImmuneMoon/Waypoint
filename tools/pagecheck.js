/* Offline check of the page's own navigation (system/app/scripts/pagenav.js): the Outline of a drawn planner or page, and its menu.
   The module's two slices are run for real on tools/boxdom.js, a page of plain objects that refuses markup, over trees built by hand and
   over what the two real renderers draw (docrender.js renderDoc; planner.js plannerPreviewHtml, sliced), read into that page by a small
   reader of this suite's own. No browser. Usage: node tools/pagecheck.js */
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
    }

    /* ---- the menu, run for real on the test page ---- */
    const TIP = 'Outline: the headings of this page. Click one to jump to it.';
    const mkNav = o => { o = o || {};
        const dom = makeDom(), doc = dom.document, win = { innerWidth: o.vw || 1000, innerHeight: o.vh || 600 }, loc = { search: o.search || '' }, el = {};
        const add = (parent, tag, id, cls) => { const e = doc.createElement(tag); e.id = id; if (cls) e.className = cls; parent.appendChild(e); el[id] = e; return e; };
        if (!o.popout) [['plannerOutlineBtn', 'plannerPreview'], ['docPanelOutline', 'docPanelBody'], ['docReaderOutline', 'docReaderBody']].forEach((p, i) => { if (o.skip === p[0]) return; add(doc.body, 'button', p[0]).rect = { left: 100 + i * 300, top: 20, right: 180 + i * 300, bottom: 44 }; add(doc.body, 'div', p[1], 'doc-view'); });
        else { const wrap = add(doc.body, 'div', 'popoutWrap'), bar = add(wrap, 'div', 'popoutBar'); add(bar, 'span', 'popoutTitle'); if (!o.noDock) add(bar, 'button', 'popoutDock'); add(wrap, 'div', 'popoutBody'); }
        const api = new Function('document', 'window', 'location', 'setTimeout', 'URLSearchParams', "'use strict';\n" + slice('outline') + '\n' + slice('menu')
            + '\nreturn { navWire: navWire, navToggle: navToggle, navClose: navClose, navIsOpen: navIsOpen, menu: function() { return _navMenu; }, from: function() { return _navFrom; }, places: NAV_PLACES };')(doc, win, loc, dom.setTimeout, URLSearchParams);
        const page = (root, heads) => { while (root.firstChild) root.removeChild(root.firstChild); const w = mk(dom, 'div', 'wrap', heads.map((h, i) => blk(dom, h.bi === undefined ? i : h.bi, h.tag ? [mk(dom, h.tag, '', [h.text])] : [mk(dom, 'p', '', [h.text])]))); root.appendChild(w); return w; };
        const rows = () => (api.menu() ? api.menu().querySelectorAll('.pagenav-row') : []), heads = root => root.querySelectorAll('.pv-blk').map(b => b.childNodes[0]);
        return { dom, doc, win, el, api, page, rows, heads, press: (b, key) => dom.fire(b, 'click', { detail: key ? 0 : 1 }), shape: () => rows().map(r => r.className + '|' + r.dataset.blk + '|' + r.childNodes.map(c => (c.nodeType === 3 ? 't:' + c.nodeValue : 'e:' + c.nodeName)).join(',')) }; };
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
        const key = k => { const e = N.dom.fire(N.doc.activeElement, 'keydown', { key: k }); return [N.rows().indexOf(N.doc.activeElement), !!e.defaultPrevented]; };
        const moves = [key('ArrowDown'), key('ArrowDown'), key('End'), key('ArrowDown'), key('ArrowUp'), key('Home'), key('ArrowUp'), key('a')];
        check('the Outline menu, opened from the keyboard: the same menu is used again, and its first row takes the focus; the arrow keys move along the rows and wrap round, Home and End go to the ends, each taken as the menu\'s own; any other key is left alone',
            J(keyed) === J([true, true, true, 1]) && J(moves) === J([[1, true], [2, true], [3, true], [0, true], [3, true], [0, true], [3, true], [3, false]]), J([keyed, moves]));
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
        N.page(N.el.plannerPreview, [{ tag: null, text: 'no heading here' }]); N.press(b, true); const none = [N.rows().length, N.api.menu().childNodes.map(c => c.className + '|' + c.textContent), N.doc.activeElement === N.doc.body || N.doc.activeElement === b, N.api.navIsOpen()];
        check('a page drawn again while its menu is up: a row finds its heading again by the block\'s number, so the heading now on the page is the one brought into view, never the one that was drawn before; a row whose block is gone brings nothing into view and throws nothing; opened again, the menu lists the page as it now is; a page with no heading says so in words and puts no row in the menu; a place that is not on the page is passed over',
            err === '' && J(again) === J([[0, 0, 0, 0, 0], [0, 1], false]) && J(relisted) === J(['pagenav-row pagenav-lv1|0|t:Title', 'pagenav-row pagenav-lv2|2|t:Part one, renamed']) && err2 === '' && J(gone) === J([[0], false])
            && J(none) === J([0, ['pagenav-none|This page has no headings.'], true, true]) && row4.dataset.blk === '4', J([err, again, relisted, err2, gone, none]));
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
        check('the Outline is said: Help\'s Planners part says what the button does and where else it is; both release notes carry the line, alike; the suite is one of those CI runs',
            fs.readFileSync(path.join(root, '.github/workflows/checks.yml'), 'utf8').includes('        run: node tools/pagecheck.js') && ix.includes('<li><b>Outline</b>, beside the Find box, lists the page&rsquo;s headings. Click one to jump to it. The panel over the map, a page in its own window and a player&rsquo;s reader have the same button.</li>')
            && wn.every(t => t.includes('- Outline, wherever you read a planner or a page: the button lists\n  the page\'s headings, and a click on one jumps to it. It is in the\n  planner\'s own view, the panel over the map, a page\'s own window and\n  a player\'s reader.\n')));
    }

    summed = true;
    console.log('\n' + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exit(1);
})();

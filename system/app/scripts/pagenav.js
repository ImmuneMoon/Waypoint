/* The page's own navigation, wherever a planner or a page is read (1.5.4).
   The owner, 2026-10-05, by prompt: an outline of the page to jump by — "Yes, behind a button" — "Everywhere a page is read"; and folds,
   "Both": a heading's arrow folds its whole section down to the next heading, and inside an open section each text area, table and
   chart has its own small arrow; a page opens "As you left it" (all open the first time, then remembered on this computer).
   An Outline button opens the list of the page's headings as a menu; a click on one brings that heading into view. The menu's foot has
   Fold all and Open all. The places: the planner's own preview (#plannerPreview), the panel over the map (#docPanelBody), a player's
   reader (#docReaderBody) and a page in a window of its own (#popoutBody; that window's bar is built by popout.js, so its button is
   made here).
   A heading is what a drawn block opens with: a page's h1 / h2 / h3, the title of a planner's node, the title of a table.
   Everything read here is the DRAWN page (its .pv-blk boxes), never the stored one, so a planner and a page need no rule of their own.
   Everything shown — a menu row, the word a folded part goes by — is text: a text node, or an attribute a style sheet prints. Never
   markup. What is remembered of a page is a list of short hashes: no word of the page is kept. One page has one set of folds on this
   computer, in every place and every window of this app that shows it. */
import { getActiveCampaign } from './models.js';

// [pagecheck:outline-start]
function navHas(el, c) { return (' ' + (el && typeof el.className === 'string' ? el.className : '') + ' ').indexOf(' ' + c + ' ') >= 0; }
function navFirstEl(n) { for (var i = 0; n && n.childNodes && i < n.childNodes.length; i++) if (n.childNodes[i].nodeType === 1 && !navHas(n.childNodes[i], 'pv-fold-btn')) return n.childNodes[i]; return null; }   // never a fold's arrow, which the folds put first in a block
// the drawn blocks of a page, in order: every .pv-blk under root, wherever it sits (a section's columns nest them); never one inside another
function navBlocks(root) {
    var out = [];
    (function walk(n) { for (var i = 0; n && n.childNodes && i < n.childNodes.length; i++) { var k = n.childNodes[i]; if (k.nodeType !== 1) continue; if (navHas(k, 'pv-blk')) out.push(k); else walk(k); } })(root);
    return out;
}
// the heading a drawn block opens with: { level, el }, or null. A node's or a table's title counts as a third-level heading (both renderers
// draw a titled table and a planner's node in a box of class node, its title first)
function navHead(blk) {
    var k = navFirstEl(blk); if (!k) return null;
    var t = k.nodeName;
    if (t === 'H1' || t === 'H2' || t === 'H3') return { level: +t.charAt(1), el: k };
    if (t === 'DIV' && navHas(k, 'node')) { var h = navFirstEl(k); if (h && h.nodeName === 'H3') return { level: 3, el: h }; }
    return null;
}
// a heading's own words: its text without its subtitle (.sub) and without a node's tag (.tag), white space folded, 120 characters at most
function navText(el) {
    var s = '';
    (function walk(n) { for (var i = 0; n && n.childNodes && i < n.childNodes.length; i++) { var k = n.childNodes[i]; if (k.nodeType === 3) s += k.nodeValue; else if (k.nodeType === 1 && !navHas(k, 'sub') && !navHas(k, 'tag')) walk(k); } })(el);
    return Array.from(s.replace(/\s+/g, ' ').trim()).slice(0, 120).join('');
}
// [{ level, text, bi, el }]: bi is the block's own number (its data-blk), by which a row finds its heading again after the page was drawn again
function navOutline(root) {
    var out = [];
    navBlocks(root).forEach(function(b) {
        var h = navHead(b); if (!h) return;
        var text = navText(h.el), bi = b.dataset && typeof b.dataset.blk === 'string' ? b.dataset.blk : '';
        if (text && bi) out.push({ level: h.level, text: text, bi: bi, el: h.el });
    });
    return out;
}
// [pagecheck:outline-end]

// [pagecheck:fold-start]
// Folds. A page's parts that fold are its headings (a heading puts away every block after it, down to the next heading of its level or a
// higher one) and its other blocks (each puts away itself). The page's one title folds nothing, and neither does a heading with nothing
// under it, a rule or an empty box.
// A part is known by a mark: a short hash of what it is and its words, so a fold stays on its part when blocks are added around it, and
// nothing of the page's text is kept. What is folded on a page is remembered on this computer under a hash of the campaign and the page:
// one page has one set of folds, in every place and every window of this app that shows it. A page that cannot be named is remembered by
// the place that shows it, until the window closes.
var NAV_PLACES = [['plannerOutlineBtn', 'plannerPreview'], ['docPanelOutline', 'docPanelBody'], ['docReaderOutline', 'docReaderBody'], ['popoutOutline', 'popoutBody']];   // a button, and the box its page is drawn in
var FOLD_STORE = 'wp_pageFolds', FOLD_PAGES = 300, FOLD_MARKS = 400, FOLD_TOTAL = 6000, FOLD_MARK = /^[0-9a-f]{8}$/;   // every wp_ setting is mirrored to the settings file: this one stays under 100 KB at its fullest
var _foldMem = Object.create(null);   // what this window holds by itself: a page that cannot be named (under its place), and a page this computer could not keep (under its key)
function foldHash(s) { s = String(s); var h = 0x811c9dc5; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return ('0000000' + h.toString(16)).slice(-8); }
// the campaign and the page a place shows, as one text ('' where it cannot be said). One page has one key wherever it is read
function navKeyFor(rootId) {
    if (rootId === 'popoutBody') { var m = /^doc:(.+)$/.exec(new URLSearchParams(location.search).get('popout') || ''); return m ? m[1] : ''; }
    var camp = typeof getActiveCampaign === 'function' ? getActiveCampaign() : null, cid = camp && typeof camp.id === 'string' ? camp.id : '', id = '';
    if (rootId === 'plannerPreview') id = camp && typeof camp.activeItemId === 'string' ? camp.activeItemId : '';
    else if (rootId === 'docPanelBody') id = window.wpDocPanel && typeof window.wpDocPanel.openId === 'function' ? window.wpDocPanel.openId() : '';
    else if (rootId === 'docReaderBody') id = typeof window.wpDocReaderOpenId === 'function' ? window.wpDocReaderOpenId() : '';
    return cid && typeof id === 'string' && id ? cid + '/' + id : '';
}
function foldPage(root) { var k = ''; try { k = navKeyFor(root && root.id); } catch (e) { k = ''; } return typeof k === 'string' && k ? foldHash(k) : ''; }
// what this computer keeps, read as what of it is sound: { v: 1, seq, pages: { page: { t, m: [mark] } } }. Anything else in it is passed over.
// It throws where there is no storage to read (a private window): the caller's to catch, so that nothing is then written over what is kept
function foldRead() {
    var raw = window.localStorage.getItem(FOLD_STORE), o = null, out = { v: 1, seq: 0, pages: Object.create(null) }, n = 0;
    try { o = JSON.parse(raw || 'null'); } catch (e) { o = null; }
    if (!o || typeof o !== 'object' || o.v !== 1 || !o.pages || typeof o.pages !== 'object' || Array.isArray(o.pages)) return out;
    Object.keys(o.pages).forEach(function(k) {
        var p = o.pages[k]; if (n >= FOLD_PAGES || !FOLD_MARK.test(k) || !p || typeof p !== 'object' || !Array.isArray(p.m)) return;
        var m = [], seen = Object.create(null);
        p.m.slice(0, FOLD_MARKS).forEach(function(x) { if (typeof x === 'string' && FOLD_MARK.test(x) && !seen[x]) { seen[x] = 1; m.push(x); } });
        if (!m.length) return;
        var t = typeof p.t === 'number' && p.t >= 0 && p.t <= 9e15 ? Math.floor(p.t) : 0;
        out.pages[k] = { t: t, m: m }; n++; if (t > out.seq) out.seq = t;
    });
    if (typeof o.seq === 'number' && o.seq > out.seq && o.seq <= 9e15) out.seq = Math.floor(o.seq);
    return out;
}
// what is folded on the page a place shows: { mark: 1 }. What this computer keeps, and this window's own word only where nothing could be kept
function foldGet(root) {
    var pk = foldPage(root), list = _foldMem[pk || '?' + (root && root.id)], out = Object.create(null);
    if (!list && pk) { try { var p = foldRead().pages[pk]; list = p ? p.m : null; } catch (e) { list = null; } }
    (list || []).forEach(function(k) { if (typeof k === 'string' && FOLD_MARK.test(k)) out[k] = 1; });
    return out;
}
function foldPut(root, map) {
    var pk = foldPage(root), mk = pk || '?' + (root && root.id), list = Object.keys(map).slice(0, FOLD_MARKS);
    if (!pk) { _foldMem[mk] = list; return; }
    try {
        var o = foldRead(), size = function(id) { return o.pages[id].m.length; };
        o.seq += 1;
        if (list.length) o.pages[pk] = { t: o.seq, m: list }; else delete o.pages[pk];
        var ids = Object.keys(o.pages).sort(function(a, b) { return o.pages[a].t - o.pages[b].t; }), total = ids.reduce(function(n, id) { return n + size(id); }, 0);
        while (ids.length && (ids.length > FOLD_PAGES || total > FOLD_TOTAL)) { var old = ids.shift(); total -= size(old); delete o.pages[old]; }   // the pages folded longest ago go first
        window.localStorage.setItem(FOLD_STORE, JSON.stringify(o));
        delete _foldMem[mk];
    } catch (e) { _foldMem[mk] = list; }   // nothing could be kept (a private window, a full store): this window remembers by itself
}
function foldCut(s, n) { var a = Array.from(s); return a.length > n ? a.slice(0, n).join('') + '…' : s; }
var FOLD_BREAK = { P: 1, DIV: 1, BR: 1, LI: 1, UL: 1, OL: 1, TR: 1, TD: 1, TH: 1, TABLE: 1, PRE: 1, FIGURE: 1, FIGCAPTION: 1, BLOCKQUOTE: 1, H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1 };
// a block's own first words: its text, with a space where a line, a cell or a list item ends, 120 characters at most. Never its arrow's,
// a style sheet's or a script's
function foldText(b) {
    var s = '';
    (function walk(n) {
        for (var i = 0; n && n.childNodes && i < n.childNodes.length && s.length < 2000; i++) {
            var k = n.childNodes[i]; if (k.nodeType === 3) { s += k.nodeValue; continue; }
            if (k.nodeType !== 1 || navHas(k, 'pv-fold-btn')) continue;
            var t = String(k.nodeName).toUpperCase(); if (t === 'STYLE' || t === 'SCRIPT') continue;
            if (FOLD_BREAK[t] === 1) s += ' ';
            walk(k);
            if (FOLD_BREAK[t] === 1) s += ' ';
        }
    })(b);
    return Array.from(s.slice(0, 2000).replace(/[\ud800-\udbff]$/, '').replace(/\s+/g, ' ').trim()).slice(0, 120).join('');
}
// the words a part goes by while it is put away: a node's or a table's title, a chart, else its own first words
function foldWords(b) {
    var h = navHead(b), k = navFirstEl(b), t = h ? navText(h.el) : ''; if (t) return t;
    if (k && navHas(k, 'diagram')) return 'Chart';
    return foldText(b) || (k && k.nodeName === 'FIGURE' ? 'Picture' : 'Folded');
}
// { blocks, levels, parts }: every drawn block, its heading level (0: no heading), and the parts that fold: { at, kind, level, mark, words, holds }
function foldParts(root) {
    var blocks = navBlocks(root), n1 = 0, seen = Object.create(null), cand = [], levels = [];
    blocks.forEach(function(b) { var k = navFirstEl(b); if (k && k.nodeName === 'H1') n1++; });
    blocks.forEach(function(b, i) {
        var k = navFirstEl(b), t = k ? k.nodeName : '', lv = t === 'H1' || t === 'H2' || t === 'H3' ? +t.charAt(1) : 0;
        levels[i] = lv;
        if (t === 'HR' || ((!k || t === 'P') && !foldText(b))) return;   // a rule, an empty box, a paragraph with no words: nothing to fold, and nothing a heading puts away
        var words = lv ? navText(k) : foldWords(b), base = (lv ? 'h' + lv : 'b') + ':' + words;
        seen[base] = (seen[base] || 0) + 1;
        cand.push({ at: i, kind: lv ? 'head' : 'body', level: lv, mark: foldHash(base + (seen[base] > 1 ? '#' + seen[base] : '')), words: words, holds: 0 });
    });
    // a heading folds what stands under it, down to the next heading of its level or a higher one. One with nothing under it folds nothing,
    // and neither does the page's one title
    var parts = cand.filter(function(p, ci) {
        if (p.kind !== 'head') return true;
        for (var c = ci + 1; c < cand.length && !(cand[c].level && cand[c].level <= p.level); c++) p.holds++;
        return p.holds > 0 && !(p.level === 1 && n1 < 2);
    });
    return { blocks: blocks, levels: levels, parts: parts };
}
function foldBtnOf(blk) { var kids = blk.childNodes, first = kids && kids.length ? kids[0] : null; return first && first.nodeType === 1 && navHas(first, 'pv-fold-btn') ? first : null; }
// a block as it was drawn: no arrow, no fold class, no fold word
function foldClear(blk) {
    var b = foldBtnOf(blk); if (b) blk.removeChild(b);
    ['pv-fold-head', 'pv-fold-body', 'pv-fold-shut', 'pv-fold-hid'].forEach(function(c) { blk.classList.remove(c); });
    if (blk.dataset) { delete blk.dataset.fold; delete blk.dataset.foldHint; }
}
// Draws the folds of the page a place shows, from what is remembered: each part that folds gets its arrow (a button, the block's first
// child, made once: the style sheet floats it into the margin, so no block has to be positioned for it), a folded part its word, and
// every block a folded heading puts away is marked hidden. Run again it changes nothing
function foldApply(root) {
    if (!root || !root.classList) return;
    var page = foldParts(root), shut = foldGet(root), n = page.blocks.length, part = [], hidden = [], under = 0, i;
    page.parts.forEach(function(p) { part[p.at] = p; });
    for (i = 0; i < n; i++) {
        var lv = page.levels[i], p = part[i];
        if (lv && under && lv <= under) under = 0;   // a heading of that level, or a higher one, ends the folded section
        hidden[i] = under > 0;
        if (!under && p && p.kind === 'head' && shut[p.mark] === 1) under = lv;
    }
    for (i = 0; i < n; i++) {
        var blk = page.blocks[i], q = part[i];
        if (!q) { foldClear(blk); if (hidden[i]) blk.classList.add('pv-fold-hid'); continue; }
        var isShut = shut[q.mark] === 1, head = q.kind === 'head', btn = foldBtnOf(blk), say = (isShut ? 'Open this ' : 'Fold this ') + (head ? 'section' : 'part');
        if (!btn) { btn = document.createElement('button'); btn.type = 'button'; btn.className = 'pv-fold-btn'; blk.insertBefore(btn, blk.firstChild); }
        blk.classList.toggle('pv-fold-head', head); blk.classList.toggle('pv-fold-body', !head); blk.classList.toggle('pv-fold-shut', isShut); blk.classList.toggle('pv-fold-hid', hidden[i]);
        blk.dataset.fold = q.mark;
        if (isShut) blk.dataset.foldHint = head ? q.holds + (q.holds === 1 ? ' part folded' : ' parts folded') : foldCut(q.words, 80); else delete blk.dataset.foldHint;
        btn.dataset.tip = say; btn.removeAttribute('title'); btn.setAttribute('aria-label', say); btn.setAttribute('aria-expanded', isShut ? 'false' : 'true');
        if (head) btn.removeAttribute('tabindex'); else btn.setAttribute('tabindex', '-1');   // the keyboard steps through the sections' arrows, not every block's
    }
    root.classList.add('pv-folds');
}
// Sets what is folded on the page a place shows: kept, drawn there, and drawn in every other place of this window that shows the same page.
// A mark that is on no part of the page as it is drawn there is let go: its part was changed or taken away
function foldSet(root, map) {
    var live = Object.create(null), keep = Object.create(null);
    foldParts(root).parts.forEach(function(p) { live[p.mark] = 1; });
    Object.keys(map).forEach(function(k) { if (live[k] === 1) keep[k] = 1; });
    foldPut(root, keep); foldApply(root);
    var pk = foldPage(root); if (!pk) return;
    NAV_PLACES.forEach(function(p) { var r = document.getElementById(p[1]); if (r && r !== root && foldPage(r) === pk) foldApply(r); });
}
function foldToggle(root, blk) {
    var mark = blk && blk.dataset ? blk.dataset.fold : ''; if (!root || typeof mark !== 'string' || !FOLD_MARK.test(mark)) return false;
    var shut = foldGet(root); if (shut[mark] === 1) delete shut[mark]; else shut[mark] = 1;
    foldSet(root, shut); return true;
}
// Fold all: every heading that folds, and where the page has none, every part. Open all: nothing stays folded
function foldAll(root, on) {
    var shut = on ? foldGet(root) : Object.create(null);
    if (on) { var ps = foldParts(root).parts, heads = ps.filter(function(p) { return p.kind === 'head'; }); (heads.length ? heads : ps).forEach(function(p) { shut[p.mark] = 1; }); }
    foldSet(root, shut);
}
// Opens whatever puts an element of the page away: the folded sections it lies in and its own part; with own, a heading's own section too
function foldReveal(root, el, own) {
    if (!root || !el || !el.closest) return false;
    var page = foldParts(root), blk = el.closest('.pv-blk'), at = -1;
    while (blk && (at = page.blocks.indexOf(blk)) < 0) blk = blk.parentNode && blk.parentNode.closest ? blk.parentNode.closest('.pv-blk') : null;   // a block drawn inside a block: the page's own block around it
    if (at < 0) return false;
    var shut = foldGet(root), part = [], stack = [], changed = false, open = function(p) { if (p && shut[p.mark] === 1) { delete shut[p.mark]; changed = true; } };
    page.parts.forEach(function(p) { part[p.at] = p; });
    for (var i = 0; i < at; i++) { var lv = page.levels[i]; if (!lv) continue; stack = stack.filter(function(o) { return o.level < lv; }); stack.push({ level: lv, part: part[i] }); }
    var lvAt = page.levels[at]; if (lvAt) stack = stack.filter(function(o) { return o.level < lvAt; });
    stack.forEach(function(o) { open(o.part); });
    if (part[at] && (part[at].kind === 'body' || own)) open(part[at]);
    if (changed) foldSet(root, shut);
    return changed;
}
// the page as it was drawn: every arrow, class and word of the folds taken off (before the page's markup is read for an export)
function foldStrip(root) { if (!root) return; navBlocks(root).forEach(foldClear); if (root.classList) root.classList.remove('pv-folds'); }
// [pagecheck:fold-end]

// [pagecheck:menu-start]
var _navMenu = null, _navFrom = null, _navRoot = null;   // the menu (made at the first press), the button it is open from, and the page it lists
function navMenuEl() {
    if (_navMenu) return _navMenu;
    var m = document.createElement('div'); m.id = 'pageNavMenu'; m.setAttribute('role', 'menu'); m.style.display = 'none';
    (document.getElementById('popoutWrap') || document.body).appendChild(m);   // a window of its own hides everything outside its own wrap
    m.addEventListener('click', function(e) {
        var act = e.target && e.target.closest ? e.target.closest('.pagenav-act') : null, row = act ? null : (e.target && e.target.closest ? e.target.closest('.pagenav-row') : null); if (!act && !row) return;
        var root = _navRoot; navClose(false); if (!root) return;
        if (act) { foldAll(root, act.dataset.act === 'foldall'); return; }
        var bi = row.dataset.blk, find = function() { return navOutline(root).filter(function(h) { return h.bi === bi; })[0]; }, now = find(); if (!now) return;   // read again: the page may have been drawn again since
        if (foldReveal(root, now.el, true)) now = find() || now;   // a heading that was put away is brought out, and its own section opened
        try { now.el.scrollIntoView({ block: 'start', behavior: 'auto' }); } catch (err) {}
        now.el.classList.add('pagenav-hit'); setTimeout(function() { now.el.classList.remove('pagenav-hit'); }, 1300);
    });
    m.addEventListener('keydown', function(e) {
        var rows = Array.prototype.slice.call(m.querySelectorAll('.pagenav-row, .pagenav-act')), at = rows.indexOf(document.activeElement), to = -1;   // the headings, then Fold all and Open all
        if (e.key === 'ArrowDown') to = at < 0 || at === rows.length - 1 ? 0 : at + 1;
        else if (e.key === 'ArrowUp') to = at <= 0 ? rows.length - 1 : at - 1;
        else if (e.key === 'Home') to = 0;
        else if (e.key === 'End') to = rows.length - 1;
        if (to < 0 || !rows[to]) return;
        e.preventDefault(); rows[to].focus();
    });
    return (_navMenu = m);
}
function navIsOpen() { return !!(_navMenu && _navMenu.style.display !== 'none'); }
function navClose(refocus) {
    if (!navIsOpen()) return;
    _navMenu.style.display = 'none';
    var b = _navFrom; _navFrom = null; _navRoot = null;
    if (b) { b.setAttribute('aria-expanded', 'false'); if (refocus) b.focus(); }
}
// the rows: a button each, its class by the heading's level, its words a text node; then, where the page has a part that folds, a foot
// with Fold all and Open all
function navFill(m, list, folds) {
    while (m.firstChild) m.removeChild(m.firstChild);
    if (!list.length) { var none = document.createElement('div'); none.className = 'pagenav-none'; none.appendChild(document.createTextNode('This page has no headings.')); m.appendChild(none); }
    list.forEach(function(h) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'pagenav-row pagenav-lv' + h.level; b.dataset.blk = h.bi; b.setAttribute('role', 'menuitem');
        b.appendChild(document.createTextNode(h.text)); m.appendChild(b);
    });
    if (!folds) return;
    var foot = document.createElement('div'); foot.className = 'pagenav-foot';
    [['foldall', 'Fold all'], ['openall', 'Open all']].forEach(function(a) { var b = document.createElement('button'); b.type = 'button'; b.className = 'pagenav-act'; b.dataset.act = a[0]; b.setAttribute('role', 'menuitem'); b.appendChild(document.createTextNode(a[1])); foot.appendChild(b); });
    m.appendChild(foot);
}
function navOpen(btn, root, byKey) {
    var m = navMenuEl(); navFill(m, navOutline(root), foldParts(root).parts.length > 0);
    _navFrom = btn; _navRoot = root; btn.setAttribute('aria-expanded', 'true');
    m.style.left = '0px'; m.style.top = '0px'; m.style.display = 'block';
    var r = btn.getBoundingClientRect(), vw = window.innerWidth || 0, vh = window.innerHeight || 0, w = m.offsetWidth || 0, h = m.offsetHeight || 0;
    var x = Math.max(6, Math.min(r.left, vw - w - 6)), y = r.bottom + 4;
    if (y + h > vh - 6) y = Math.max(6, vh - h - 6);   // no room under the button: as low as it fits
    m.style.left = x + 'px'; m.style.top = y + 'px';
    if (byKey) { var first = m.querySelector('.pagenav-row, .pagenav-act'); if (first) first.focus(); }
}
function navToggle(btn, root, byKey) {
    if (_navFrom === btn && navIsOpen()) { navClose(true); return; }
    navClose(false); navOpen(btn, root, byKey);
}
function navWire() {
    var spec = new URLSearchParams(location.search).get('popout') || '', bar = document.getElementById('popoutBar');
    if (bar && spec.indexOf('doc:') === 0) {   // a page in a window of its own: its bar has no Outline button of its own
        var pb = document.createElement('button'); pb.id = 'popoutOutline'; pb.type = 'button'; pb.title = 'Outline: the headings of this page. Click one to jump to it.';
        pb.appendChild(document.createTextNode('Outline')); bar.insertBefore(pb, document.getElementById('popoutDock'));
    }
    NAV_PLACES.forEach(function(p) {
        var btn = document.getElementById(p[0]), root = document.getElementById(p[1]); if (!btn || !root) return;
        btn.setAttribute('aria-haspopup', 'menu'); btn.setAttribute('aria-expanded', 'false');
        btn.addEventListener('click', function(e) { navToggle(btn, root, e.detail === 0); });   // detail 0: pressed by the keyboard
        // the folds of the page drawn here: an arrow pressed, and the page drawn again (its box is filled anew each time)
        root.addEventListener('click', function(e) {
            var t = e.target, a = t && t.closest ? t.closest('.pv-fold-btn') : null, blk = a ? a.closest('.pv-blk') : null;
            if (!blk && t && t.closest && !t.closest('a, button, input, select, textarea')) { var s = t.closest('.pv-blk'); if (s && s.classList.contains('pv-fold-shut')) blk = s; }   // an arrow; or a folded part, pressed anywhere but on a link or a control in it
            if (!blk) return;
            e.preventDefault(); e.stopPropagation(); foldToggle(root, blk);
        });
        root.addEventListener('dblclick', function(e) { if (e.target && e.target.closest && e.target.closest('.pv-fold-btn')) e.stopPropagation(); }, true);   // a quick second press on an arrow is no double-click on the block
        if (typeof window.MutationObserver === 'function') new window.MutationObserver(function() { foldApply(root); }).observe(root, { childList: true });
        foldApply(root);
    });
    // another window of this app folded or opened something: what this one shows follows (one page has one set of folds on this computer)
    if (typeof window.addEventListener === 'function') window.addEventListener('storage', function(e) {
        if (e && e.key !== null && e.key !== FOLD_STORE) return;
        NAV_PLACES.forEach(function(p) { var r = document.getElementById(p[1]); if (r) foldApply(r); });
    });
    document.addEventListener('pointerdown', function(e) {
        if (!navIsOpen()) return;
        var t = e.target;
        if (t && t.closest && (t.closest('#pageNavMenu') || (_navFrom && _navFrom.contains(t)))) return;
        navClose(false);
    }, true);
    document.addEventListener('keydown', function(e) {
        if (e.key !== 'Escape' || !navIsOpen()) return;
        e.preventDefault(); e.stopPropagation(); navClose(true);
    }, true);
}
// the place a drawn element belongs to (its box), or null
function navRootOf(el) { for (var i = 0; el && el.closest && i < NAV_PLACES.length; i++) { var r = el.closest('#' + NAV_PLACES[i][1]); if (r) return r; } return null; }
// [pagecheck:menu-end]

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    navWire();
    window.wpPageNav = {
        outline: navOutline, close: function() { navClose(false); }, isOpen: navIsOpen,
        reveal: function(el) { var root = navRootOf(el); return root ? foldReveal(root, el, false) : false; },   // Find, before it scrolls to a hit
        strip: foldStrip, apply: foldApply   // an export of the page's own markup takes the folds off, then puts them back
    };
}

/* Doc panel — a planner or handbook page popped OVER the play map, like the character-sheet panel.
   Read-only (the shared docrender.js output — the same page a player sees) and LIVE: it re-renders as
   the doc is edited in the app, and stays put (draggable header, resizable, remembered position/size),
   so the GM can keep a page open beside the map. GM-only pages show here — it is the GM's own reference.

   Search (smart, case + accent insensitive): the search box finds across the CONTENT of EVERY page
   (ranked results with a snippet, click to open that page) AND highlights matches on the page shown,
   with a count and next/prev. Phrase first, then each word at word starts — like the editor's Find. */
import { state } from './state.js';

const ui = function(id) { return document.getElementById(id); };
var openId = '';        // the doc/planner item id currently shown; '' = closed
var lastSig = '';
var tabs = [], tabTop = Object.create(null), tabSig = '', drawnId = '';   // 1.5.4 tabs: the pages open in the panel, in the order they were opened (openId is the one in front); where each was scrolled to; the strip as last drawn; the page last drawn
var mmMode = '';
var query = '';         // the live search query
var drawGen = 0, landPend = null;   // 1.5.4: each drawing of the page has a number; the landing last made, until the page's charts are drawn

function activeCamp() { try { var s = state.appState; return s && s.campaigns ? s.campaigns[s.activeCampaignId] : null; } catch (e) { return null; } }

/* ---------- search helpers (pure) ---------- */
// [textcheck:panelfold-start]
// Fold to a case- and accent-insensitive form, length-preserving so string indices still map to the original.
function fold(s) { return String(s == null ? '' : s).replace(/[À-ɏḀ-ỿ]/g, function(c) { return c.normalize('NFD')[0] || c; }).toLowerCase(); }
function escRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function escHtml(s) { return String(s).replace(/[&<>"]/g, function(c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function stripMarkup(s) { return String(s || '').replace(/<[^>]*>/g, ' ').replace(/[*_`~#>\[\]()]/g, ' ').replace(/\s+/g, ' ').trim(); }
function rowText(r) {   // a table row is an array, {cells:[…]}, or a {col1,col2,…} object — pull every string cell
    if (Array.isArray(r)) return r.filter(function(c) { return typeof c === 'string'; }).join(' ');
    if (r && Array.isArray(r.cells)) return r.cells.filter(function(c) { return typeof c === 'string'; }).join(' ');
    if (r && typeof r === 'object') { var o = ''; for (var k in r) { if (typeof r[k] === 'string') o += r[k] + ' '; } return o; }
    return typeof r === 'string' ? r : '';
}
function blockText(b) {
    if (!b || typeof b !== 'object') return '';
    switch (b.type) {
        case 'h1': return (b.title || '') + ' ' + (b.sub || '');
        case 'h2': case 'h3': return b.title || '';
        case 'text': case 'lede': case 'oneline': case 'callout': case 'flare': return stripMarkup(b.content || '');
        case 'image': return (b.caption || '') + ' ' + (b.alt || '');
        case 'table': return (b.title || '') + ' ' + (Array.isArray(b.cols) ? b.cols.join(' ') : '') + ' ' + (Array.isArray(b.rows) ? b.rows.map(rowText).join(' ') : '');
        // 1.5.4: a planner's node (its name, tag, Must resolve line, headings and rows) and a flowchart's labels are page text too. Until now a word
        // that stood only in a node's table was found by no search: not quick-jump's, not the panel's, not the lists'
        case 'node': return stripMarkup([b.title, b.tag, b.must].concat(Array.isArray(b.cols) ? b.cols : []).filter(function(s) { return typeof s === 'string'; }).join(' ') + ' ' + (Array.isArray(b.rows) ? b.rows.map(rowText).join(' ') : ''));
        case 'flowchart': return stripMarkup((Array.isArray(b.nodes) ? b.nodes : []).concat(Array.isArray(b.edges) ? b.edges : []).map(function(n) { return n && typeof n.text === 'string' ? n.text : ''; }).join(' '));
        default: return '';   // a diagram written as source: its mermaid text is skipped
    }
}
function docText(doc) { return (doc && Array.isArray(doc.blocks) ? doc.blocks : []).map(blockText).join('  —  ').replace(/\s+/g, ' ').trim(); }
// Ranges [start,end] of matches in a FOLDED string: the whole phrase; if it never appears, each word at a word start.
function matchRanges(ft, nq, words) {
    var ranges = [], i;
    i = 0; while ((i = ft.indexOf(nq, i)) !== -1) { ranges.push([i, i + nq.length]); i += Math.max(1, nq.length); }
    if (!ranges.length && words.length > 1) {
        words.forEach(function(w) {
            if (!w) return; var re = new RegExp('(^|[^a-z0-9])(' + escRe(w) + ')', 'g'), m;
            while ((m = re.exec(ft))) { var s = m.index + m[1].length; ranges.push([s, s + w.length]); if (re.lastIndex <= s) re.lastIndex = s + 1; }
        });
        ranges.sort(function(a, b) { return a[0] - b[0]; });
        ranges = ranges.filter(function(r, k) { return k === 0 || r[0] >= ranges[k - 1][1]; });
    }
    return ranges;
}
// [textcheck:panelfold-end]

/* ---------- cross-page search (shared: the panel + the app-wide page search + Ctrl+K use this) ---------- */
function searchAll(q, camp, types) {
    camp = camp || activeCamp(); if (!camp || !camp.items) return [];
    types = types || ['doc', 'planner'];
    var nq = fold(q).trim(); if (!nq) return [];
    var words = nq.split(/\s+/).filter(Boolean), out = [];
    Object.keys(camp.items).forEach(function(id) {
        var it = camp.items[id]; if (!it || types.indexOf(it.type) === -1) return;
        var title = (it.meta && it.meta.title) || it.name || (it.type === 'planner' ? 'Planner' : 'Page');
        var text = docText(it), ft = fold(text), fTitle = fold(title), score = 0;
        if (fTitle.indexOf(nq) !== -1) score += 100;
        var phrasePos = ft.indexOf(nq); if (phrasePos !== -1) score += 50;
        words.forEach(function(w) {
            if (new RegExp('(^|[^a-z0-9])' + escRe(w)).test(fTitle)) score += 8;
            if (new RegExp('(^|[^a-z0-9])' + escRe(w)).test(ft)) score += 10;
            else if (ft.indexOf(w) !== -1) score += 3;
        });
        if (score <= 0) return;
        var pos = phrasePos !== -1 ? phrasePos : (words.length ? ft.indexOf(words[0]) : 0);
        out.push({ id: id, title: title, type: it.type, score: score, snippet: snippetHtml(text, pos, nq, words), cur: id === openId });
    });
    out.sort(function(a, b) { return b.score - a.score || a.title.localeCompare(b.title); });
    return out.slice(0, 40);
}
function snippetHtml(text, pos, nq, words) {
    if (!(pos >= 0)) pos = 0;
    var start = Math.max(0, pos - 40), end = Math.min(text.length, pos + 120), seg = text.slice(start, end);
    var ranges = matchRanges(fold(seg), nq, words), out = '', last = 0;
    ranges.forEach(function(r) { out += escHtml(seg.slice(last, r[0])) + '<mark>' + escHtml(seg.slice(r[0], r[1])) + '</mark>'; last = r[1]; });
    out += escHtml(seg.slice(last));
    return (start > 0 ? '…' : '') + out + (end < text.length ? '…' : '');
}
function renderResults(list) {
    var box = ui('docPanelResults'); if (!box) return;
    if (!list || !list.length) { box.style.display = 'none'; box.innerHTML = ''; return; }
    box.innerHTML = list.map(function(r) {
        return '<div class="docpanel-res" data-id="' + escHtml(r.id) + '"><div class="r-title">' + escHtml(r.title) + (r.cur ? ' <span class="r-here">(open)</span>' : '') + '</div><div class="r-snip">' + r.snippet + '</div></div>';
    }).join('');
    box.style.display = 'block';
}

/* ---------- in-page highlight ---------- */
// [textcheck:panelfind-start]
// The page's text is read in stretches: the text nodes of one run of inline content, joined. So a word drawn as several runs (part of it
// coloured or bold by the Text style bar) is marked whole and a phrase is found across a run boundary, as the editor's Find reads its
// preview (planner.js pfStretches). A hit is the list of its marks: one around its part of each text node it lies in.
// Elements whose text runs on with the text around them, so a hit may cross them: the inline tags the page sanitiser and a flowchart label
// write, and a span with no class (a run of a styled field, a text block's colour or size). Anything else ends a stretch: a paragraph, a
// cell, a heading, a line break, a span with a class of the renderer's (a subtitle, a chart's label box). A script or a style sheet is not text.
var HL_INLINE = { SPAN: 1, B: 1, STRONG: 1, I: 1, EM: 1, U: 1, S: 1, STRIKE: 1, A: 1, CODE: 1, FONT: 1, BIG: 1, SMALL: 1, MARK: 1 };
// 1.5.4 (the review of step 1, found live): a diagram's source that the diagram library has not drawn yet is not read. The library reads that
// pre's markup, so a mark put there broke the chart: a page opened at "gold" drew its flowcharts as a syntax error, every flowchart's source
// holding the word. A pre of class mermaid is read once a chart is drawn in it. In a drawn chart only its HTML labels are read (a
// foreignObject's): a mark is HTML, and inside the chart's own text (an svg text) it is not drawn, so the words found went with it
function hlUndrawn(n, tag) {
    if (tag !== 'PRE' || (' ' + String(n.className || '') + ' ').indexOf(' mermaid ') < 0) return false;
    for (var k = n.firstChild; k; k = k.nextSibling) if (k.nodeType === 1 && String(k.nodeName).toUpperCase() === 'SVG') return false;
    return true;
}
function hlStretches(root) {
    var out = [], cur = [];
    var end = function() { if (cur.some(function(n) { return n.nodeValue.trim(); })) out.push(cur); cur = []; };
    var walk = function(el, svg) {   // svg: inside a drawn chart and outside its HTML labels, where no text is read
        for (var n = el.firstChild; n; n = n.nextSibling) {
            if (n.nodeType === 3) { if (n.nodeValue && !svg) cur.push(n); continue; }
            if (n.nodeType !== 1) continue;
            var tag = String(n.nodeName).toUpperCase();
            if (tag === 'SCRIPT' || tag === 'STYLE' || hlUndrawn(n, tag)) continue;
            if (tag === 'SVG' || tag === 'FOREIGNOBJECT') { end(); walk(n, tag === 'SVG'); end(); continue; }
            if (HL_INLINE[tag] && !(tag === 'SPAN' && n.className)) walk(n, svg); else { end(); walk(n, svg); end(); }
        }
    };
    walk(root, false); end();
    return out;
}
// Each range [start, end) of a stretch's joined text gets a <mark> around its part of every text node it lies in
function hlWrap(seg, ranges) {
    var found = [], starts = [], lens = [], at = 0;
    seg.forEach(function(n) { starts.push(at); lens.push(n.nodeValue.length); at += n.nodeValue.length; });
    for (var i = ranges.length - 1; i >= 0; i--) {   // from the end, and each range's nodes from the last, so earlier offsets stay valid
        var r = ranges[i], marks = [];
        for (var k = seg.length - 1; k >= 0; k--) {
            var a = Math.max(r[0], starts[k]) - starts[k], z = Math.min(r[1], starts[k] + lens[k]) - starts[k];
            if (a >= z) continue;
            var rest = seg[k].splitText(a); rest.splitText(z - a);
            var mk = document.createElement('mark'); mk.className = 'docpanel-hit'; rest.parentNode.insertBefore(mk, rest); mk.appendChild(rest);
            marks.unshift(mk);
        }
        if (marks.length) found.unshift(marks);
    }
    return found;
}
// [textcheck:panelhand-start]
// 1.5.4 (found live: a chart drawn above the block a page landed on moved scrollTop, so the landing waiting for the charts was never made again):
// whether the reader has moved a page by their own hand since a moment is judged by their own input, never by scrollTop, which the browser moves
// itself to keep the view still when something above is drawn (scroll anchoring). One watch for each element asked for: it counts a wheel, a
// touch, a press on its scrollbar or its body, and a key that scrolls while the focus is in it (never one typed into a field); moved() counts the
// reader's own move of it by another control (a search or a step of its Find, a row of its Outline), for it and for each element watched around
// it. mark() is the count so far and since(m) whether the reader has moved it after mark m. Null for what cannot be watched
var HAND_KEYS = { ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1, PageUp: 1, PageDown: 1, Home: 1, End: 1, ' ': 1, Spacebar: 1, Tab: 1 };
var handOf = typeof WeakMap === 'function' ? new WeakMap() : null;
function handField(t) { var tag = t && t.nodeName ? String(t.nodeName).toUpperCase() : ''; return !!t && (t.isContentEditable === true || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'); }
function readerHand(el) {
    if (!handOf || !el || typeof el !== 'object' || typeof el.addEventListener !== 'function') return null;
    var w = handOf.get(el); if (w) return w.api;
    w = { n: 0 };
    var bump = function() { w.n++; }, opt = { capture: true, passive: true };
    try {
        ['wheel', 'touchstart', 'touchmove', 'pointerdown', 'mousedown'].forEach(function(t) { el.addEventListener(t, bump, opt); });
        el.addEventListener('keydown', function(e) { if (e && HAND_KEYS[e.key] === 1 && !handField(e.target)) bump(); }, true);
    } catch (e) { return null; }
    w.api = { mark: function() { return w.n; }, since: function(m) { return typeof m !== 'number' || w.n !== m; }, moved: function() { for (var n = el; n; n = n.parentNode) { var o = handOf.get(n); if (o) o.n++; } } };
    handOf.set(el, w);
    return w.api;
}
function handSince(el, m) { var h = readerHand(el); return !!h && h.since(m); }
// [textcheck:panelhand-end]
// 1.5.4: a Find on one page's box, with its own hits, its focused one and its words. The panel over the map has one; a page in a window of its
// own has another (popout.js, through wpDocPanel.finder). The box and its count are asked for each time, since a page is drawn anew. A search
// brings its focused hit into view: true smoothly, 'now' at once, anything else not at all (a page drawn again keeps its place); null marks
// the hits and focuses none (a landing, which focuses a hit of its own)
function hlFinder(rootOf, countOf) {
    var hits = [], curHit = -1, query = '', litBlk = null;   // litBlk: the block a landing last lit
    function clearMarks() {
        var body = rootOf(); if (!body) return;
        var ms = body.querySelectorAll('mark.docpanel-hit');
        ms.forEach(function(m) { var p = m.parentNode; while (m.firstChild) p.insertBefore(m.firstChild, m); p.removeChild(m); });
        if (ms.length) body.normalize();
        hits = []; curHit = -1;
    }
    function highlightBody(q, scroll) {
        var own = scroll === true || scroll === 'now'; if (own) { litBlk = null; handMoved(); }   // a search of its own: a landing is over, and the reader has moved the page by their own hand
        query = typeof q === 'string' ? q : ''; clearMarks();
        var body = rootOf(); if (!body) { updateCount(); return; }
        var nq = fold(query).trim(); if (!nq) { updateCount(); return; }
        var words = nq.split(/\s+/).filter(Boolean), segs = hlStretches(body);
        var texts = segs.map(function(seg) { return fold(seg.map(function(n) { return n.nodeValue; }).join('')); });
        // the phrase first, across the whole page: where it stands anywhere, only it is marked, and the words are each marked only where the
        // phrase is nowhere on the page (as the editor's own Find and a landing read the page: planner.js plannerFindApply, pagenav.js land)
        var whole = texts.some(function(t) { return t.indexOf(nq) !== -1; });
        segs.forEach(function(seg, k) {
            var ranges = matchRanges(texts[k], nq, whole ? [] : words);
            if (ranges.length) hits = hits.concat(hlWrap(seg, ranges));
        });
        if (hits.length && scroll !== null) { curHit = own ? 0 : landKept(); markCur(scroll === true || scroll === 'now' ? scroll : false); }
        updateCount();
    }
    function markCur(scroll) { hits.forEach(function(h, k) { h.forEach(function(m) { m.classList.toggle('cur', k === curHit); }); }); if (hits[curHit] && typeof window !== 'undefined' && window.wpPageNav && typeof window.wpPageNav.reveal === 'function') window.wpPageNav.reveal(hits[curHit][0]); if (scroll !== false && hits[curHit]) hits[curHit][0].scrollIntoView({ block: 'center', behavior: scroll === 'now' ? 'auto' : 'smooth' }); }   // a hit inside a folded part: the fold is opened first (pagenav.js)
    function step(dir) { if (!hits.length) return; handMoved(); curHit = (curHit + dir + hits.length) % hits.length; markCur(true); updateCount(); }
    function updateCount() { var c = countOf(); if (c) c.textContent = hits.length ? (curHit + 1) + '/' + hits.length : (query.trim() ? '0' : ''); }
    // the reader's own move of the page through this Find (readerHand): a landing waiting to be made again is not made
    function handMoved() { var h = readerHand(rootOf()); if (h) h.moved(); }
    // the hit a search applied again focuses (the page's charts drawn, the page drawn again): while the block a landing landed on is still on the
    // page, the first hit in it, or none where it holds none, as the landing focused it; else the page's first hit, as ever
    function landKept() { var root = rootOf(), n; for (n = litBlk; n && root; n = n.parentNode) if (n === root) return firstIn(litBlk); return 0; }
    function firstIn(blk) { var i, n; for (i = 0; blk && i < hits.length; i++) for (n = hits[i][0]; n; n = n.parentNode) if (n === blk) return i; return -1; }
    // a page opened at a search hit: the folds kept for the page put on first (it was drawn a moment ago) and every hit marked. The block the words
    // land on by the ONE rule every place lands by (pagenav.js landWords: the phrase, else every word, else any word; the review of step 1) is
    // brought into view at once and lit for a moment, the first hit in it the focused one, so that Enter steps on from there. Where that block
    // holds no hit, it is brought into view itself and no hit is focused; where the words land nowhere, nothing moves. With no rule at hand, the
    // first hit and its block, as a search finds them
    function landQ(q, again) {
        var nav = typeof window !== 'undefined' ? window.wpPageNav : null, body = rootOf(); if (body && nav && typeof nav.apply === 'function') nav.apply(body);
        highlightBody(q, null);
        var h = hits[0], blk = h && h[0] && h[0].closest ? h[0].closest('.pv-blk') : null, k = hits.length ? 0 : -1;
        if (nav && typeof nav.landWords === 'function') {
            blk = body ? nav.landWords(body, query) : null; k = -1;
            if (blk) k = firstIn(blk);
        }
        if (k >= 0) { curHit = k; markCur('now'); }
        else if (blk) { if (typeof nav.reveal === 'function') nav.reveal(blk); try { blk.scrollIntoView({ block: 'start', behavior: 'auto' }); } catch (e) {} }
        updateCount();
        if (again && blk && litBlk && blk !== litBlk && nav && typeof nav.unflash === 'function') nav.unflash(litBlk);   // made again on another block: the light the landing put on the first is taken off, so one block is lit
        if (blk && (!again || blk !== litBlk) && nav && typeof nav.flash === 'function') nav.flash(blk);   // made again, only another block: words that stand only in a chart's label are found once it is drawn (the review of step 1)
        if (!again || blk) litBlk = blk;
        return k >= 0 || !!blk;
    }
    return { find: highlightBody, clear: function() { query = ''; clearMarks(); updateCount(); }, step: step, count: updateCount, land: landQ, hits: function() { return hits; }, cur: function() { return curHit; }, words: function() { return query; } };
}
// [textcheck:panelfind-end]
// the panel's own Find
var panelFind = hlFinder(function() { return ui('docPanelBody'); }, function() { return ui('docPanelFindCount'); });
function clearMarks() { panelFind.clear(); }
function highlightBody(q, scroll) { panelFind.find(q, scroll); }
function step(dir) { panelFind.step(dir); }
function updateCount() { panelFind.count(); }

function runSearch() {
    var box = ui('docPanelSearchInput'); query = box ? box.value : '';
    highlightBody(query, true);   // 1.5.4: typed by hand, the search goes to its first hit, so Enter then takes the second
    renderResults(searchAll(query));
}
function clearSearch() { query = ''; var box = ui('docPanelSearchInput'); if (box) box.value = ''; clearMarks(); renderResults([]); updateCount(); }

/* ---------- render the page ---------- */
function setMermaidStrict() {
    if (!window.mermaid || !window.wpMermaidConfig || mmMode === 'strict') return;
    try { window.mermaid.initialize(Object.assign({}, window.wpMermaidConfig, { securityLevel: 'strict' })); mmMode = 'strict'; } catch (e) {}
}
// [shelfcheck:tabs-start]
/* Tabs (1.5.4, backlog 125; the owner by prompt: "Tabs": both pages stay open in the one panel, each on a tab). A page opened in the
   panel takes a tab at the end, eight at most (the oldest goes). The tab in front is the page shown. A tab closes by its own button or
   the middle mouse button, and the page beside it comes to the front. The strip shows only when more than one page is open, so a panel
   with one page looks as it always did. The panel's own close button closes every tab. */
var TAB_MAX = 8;
function tabsWith(list, id) { if (list.indexOf(id) >= 0) return list.slice(); var t = list.concat([id]); while (t.length > TAB_MAX) t.shift(); return t; }
// The list without a tab, and the tab in front afterwards: the same one, or, when the one in front went, the one that took its place (else the one before it)
function tabsWithout(list, id, front) {
    var at = list.indexOf(id), t = list.filter(function(x) { return x !== id; });
    return { tabs: t, front: front !== id ? (t.indexOf(front) >= 0 ? front : '') : (at >= 0 && t.length ? t[Math.min(at, t.length - 1)] : '') };
}
// Only the pages that are still there: a page deleted, or another campaign on screen, has no tab
function tabsKept(list, camp) {
    return list.filter(function(id) { var it = camp && camp.items && typeof id === 'string' && Object.prototype.hasOwnProperty.call(camp.items, id) ? camp.items[id] : null; return !!it && (it.type === 'doc' || it.type === 'planner'); });
}
function tabTitle(it) { var t = it && it.meta && typeof it.meta.title === 'string' ? it.meta.title.replace(/\s+/g, ' ').trim() : ''; return (t || (it && it.type === 'planner' ? 'Planner' : 'Page')).slice(0, 80); }
// The strip, made of elements and text nodes only: a tab is its page's name and a button that closes it
function tabsDraw(strip, list, front, camp) {
    strip.textContent = '';
    if (list.length < 2) { strip.style.display = 'none'; return 0; }
    list.forEach(function(id) {
        var name = tabTitle(camp.items[id]), tab = document.createElement('div'), b = document.createElement('button'), x = document.createElement('button');
        tab.className = 'docpanel-tab' + (id === front ? ' on' : ''); tab.dataset.id = id;
        b.type = 'button'; b.className = 'docpanel-tab-name'; b.textContent = name; b.title = name; b.setAttribute('aria-pressed', id === front ? 'true' : 'false');
        x.type = 'button'; x.className = 'docpanel-tab-x'; x.title = 'Close this tab'; x.setAttribute('aria-label', 'Close ' + name);
        tab.appendChild(b); tab.appendChild(x); strip.appendChild(tab);
    });
    strip.style.display = 'flex';
    return list.length;
}
// [shelfcheck:tabs-end]
function place() {
    var p = ui('docPanel'); if (!p) return;
    try {
        var pos = JSON.parse(localStorage.getItem('wp_docPanel') || 'null'); if (!pos) return;
        if (isFinite(pos.x) && isFinite(pos.y)) { p.style.left = Math.max(0, Math.min(window.innerWidth - 160, pos.x)) + 'px'; p.style.top = Math.max(0, Math.min(window.innerHeight - 80, pos.y)) + 'px'; p.style.right = 'auto'; }
        if (isFinite(pos.w) && isFinite(pos.h)) { p.style.width = pos.w + 'px'; p.style.height = pos.h + 'px'; }
    } catch (e) {}
}
function draw(force) {
    var p = ui('docPanel'); if (!p || p.style.display === 'none' || !openId) return;
    var camp = activeCamp(); var it = camp && camp.items && camp.items[openId];
    if (!it || (it.type !== 'doc' && it.type !== 'planner')) { tabClose(openId); return; }   // deleted / not a doc → close
    var title = (it.meta && it.meta.title) || it.name || (it.type === 'planner' ? 'Planner' : 'Page');
    var t = ui('docPanelTitle'); if (t) t.textContent = title;
    tabsSync(camp);   // 1.5.4: the tab strip follows the pages open in the panel and their names
    var sig = title + ' ' + JSON.stringify(it.blocks || []) + ' ' + JSON.stringify((it.meta && it.meta.style) || null) + ' ' + JSON.stringify(camp.docStyle || null);
    if (!force && sig === lastSig) return;   // nothing changed — skip the re-render (and keep highlights)
    lastSig = sig; var gen = ++drawGen; landPend = null;
    var body = ui('docPanelBody'); if (!body) return;
    var DR = window.wpDocRender; if (!DR || !DR.renderDoc) return;
    setMermaidStrict();
    var keep = drawnId === openId ? body.scrollTop : (tabTop[openId] || 0); drawnId = openId;   // 1.5.4: the same page drawn again keeps its place; a tab brought to the front comes back where it was left
    var ph = it.type === 'planner' && typeof window.wpPlannerRead === 'function' ? window.wpPlannerRead(it, camp, '<div class="docpanel-msg">This planner has no content yet.</div>') : null;   // 1.5.4: a planner by its own renderer (a node table and a Raw HTML block are a planner's alone); null for a campaign from someone else's table
    if (typeof ph === 'string') body.innerHTML = ph;
    else body.innerHTML = DR.renderDoc(it, { mermaid: !!window.mermaid, docStyle: camp.docStyle, empty: '<div class="docpanel-msg">This page has no content yet.</div>' });
    body.scrollTop = keep;
    if (window.mermaid) {
        var mnodes = Array.prototype.slice.call(body.querySelectorAll('pre.mermaid'));
        if (mnodes.length) { try { Promise.resolve(window.mermaid.run({ nodes: mnodes })).then(function() { if (window.wpFcPostProcess) window.wpFcPostProcess(body, it); }).catch(function() {}).then(function() { if (query.trim()) highlightBody(query); }).then(function() { landAgain(gen); }).catch(function() {}); } catch (e) {} }   // 1.5.4 (the review of step 1): a chart the library could not draw stops neither (it rejects the whole run for one)
    }
    if (query.trim()) highlightBody(query);   // re-apply the in-page highlight after a live re-render
}

// [textcheck:panelland-start]
// 1.5.4: a page opened in the panel at one block or at a search hit (docs/PLANNER_ORG_DESIGN.md 4.1). The landing is cleaned by pagenav.js
// (wpPageNav.landOf). Words go into the panel's own search, which marks them and goes to the first; a block is landed on by wpPageNav.land.
// The page's charts are drawn a moment later and may move it: once they are, the landing is made again, unless the reader has moved the page by
// their own hand since (readerHand: their input on it, never scrollTop, which the browser moves itself when a chart above the block is drawn)
function landNav() { return typeof window !== 'undefined' && window.wpPageNav ? window.wpPageNav : null; }
function landHere(it, L, again) {
    var body = ui('docPanelBody'), nav = landNav(); if (!body || !L || !nav) return false;
    if (L.q) { if (!again) { var box = ui('docPanelSearchInput'); if (box) box.value = L.q; query = L.q; } return panelFind.land(query, again); }
    return typeof nav.land === 'function' ? nav.land(body, it, L, again) : false;
}
function landOpen(it, land) {
    var nav = landNav(), L = nav && typeof nav.landOf === 'function' ? nav.landOf(land) : null, body = ui('docPanelBody'); if (!L || !body) return false;
    var ok = landHere(it, L, false), h = readerHand(body);
    landPend = { gen: drawGen, id: openId, L: L, hand: h ? h.mark() : null };
    return ok;
}
function landAgain(gen) {
    var p = landPend, body = ui('docPanelBody'); if (!p || p.gen !== gen) return; landPend = null;
    if (!body || p.id !== openId || handSince(body, p.hand)) return;   // another page in front, or the reader has moved the page by their own hand since: never against them
    var camp = activeCamp(), it = camp && camp.items && Object.prototype.hasOwnProperty.call(camp.items, p.id) ? camp.items[p.id] : null;
    if (it) landHere(it, p.L, true);
}
function open(id, land) {
    var camp = activeCamp(); var it = camp && camp.items && camp.items[id];
    if (!it || (it.type !== 'doc' && it.type !== 'planner')) return;
    tabKeep(); tabs = tabsWith(tabsKept(tabs, camp), id);   // 1.5.4: a page opened in the panel takes a tab; the page in front keeps where it was scrolled to
    openId = id; lastSig = '';
    var p = ui('docPanel'); if (!p) return;
    p.style.display = 'flex'; if (window.wpFloats) window.wpFloats.reveal(p); place();   // 1.5.4 (floats.js): asked for here, so it shows on this view
    clearSearch(); draw(true);
    if (window.wpPageShelf && window.wpPageShelf.opened) window.wpPageShelf.opened(id);   // 1.5.4 (pageshelf.js): one of the last pages opened, and the head's pin follows it
    landOpen(it, land);   // 1.5.4: at one block or at a search hit; with no landing, nothing more
}
// [textcheck:panelland-end]
function close() { openId = ''; lastSig = ''; tabs = []; tabTop = Object.create(null); tabSig = ''; drawnId = ''; var strip = ui('docPanelTabs'); if (strip) { strip.textContent = ''; strip.style.display = 'none'; } clearMarks(); var box = ui('docPanelSearchInput'); if (box) box.value = ''; query = ''; renderResults([]); var p = ui('docPanel'); if (p) p.style.display = 'none'; }
// [shelfcheck:tabdo-start]
// 1.5.4 tabs: where the page in front is scrolled to; the strip drawn when its pages, their names or the one in front changed; a tab
// brought to the front; a tab closed (the panel closes with its last one)
function tabKeep() { var b = ui('docPanelBody'); if (b && openId) tabTop[openId] = b.scrollTop; }
function tabsSync(camp) {
    var strip = ui('docPanelTabs'); if (!strip || !camp) return;
    tabs = tabsKept(tabs, camp); if (openId && tabs.indexOf(openId) < 0) tabs = tabsWith(tabs, openId);
    var sig = openId + '|' + tabs.map(function(id) { return id + ':' + tabTitle(camp.items[id]); }).join('|');
    if (sig === tabSig) return;
    tabSig = sig; tabsDraw(strip, tabs, openId, camp);
}
function tabFront(id) {
    if (id === openId || tabsKept(tabs, activeCamp()).indexOf(id) < 0) return;
    tabKeep(); openId = id; lastSig = ''; draw(true);
    if (window.wpPageShelf && window.wpPageShelf.opened) window.wpPageShelf.opened(id);   // the head's pin follows the page in front
}
function tabClose(id) {
    var camp = activeCamp(), r = tabsWithout(tabs, id, openId), kept = tabsKept(r.tabs, camp), front = kept.indexOf(r.front) >= 0 ? r.front : (kept[0] || '');
    delete tabTop[id]; tabs = kept;
    if (!front) { close(); return; }
    if (front === openId) { tabsSync(camp); return; }
    openId = front; lastSig = ''; draw(true);
    if (window.wpPageShelf && window.wpPageShelf.opened) window.wpPageShelf.opened(front);
}
// [shelfcheck:tabdo-end]
function refresh() { if (openId) draw(false); }   // called from the app's render cycle — sig-checked, cheap no-op when unchanged

// [textcheck:panelpop-start]
// A page or a planner in a window of its own (read-only: popout.js draws it, follows the GM's edits and can dock it back). One address, the
// only one the shell lets a page open for a page. Asked by the panel's own button and by the left panel's menu (Open in a new window)
// 1.5.4: where the window lands, after the item in its address: /at:<block id> or /q:<words>, each encoded, inside the doc: part the shell's
// own window rule takes (shellguard.js childWindowOk), so that rule is untouched and a window that opens fresh is told too. pagenav.js cleans
// the landing first; none adds nothing, and a landing that cannot be read never keeps the page from opening
function popLand(land) {
    var L = null; try { var nav = window.wpPageNav; L = nav && typeof nav.landOf === 'function' ? nav.landOf(land) : null; } catch (e) { L = null; }
    return !L ? '' : L.q ? '/q:' + encodeURIComponent(L.q) : '/at:' + encodeURIComponent(L.at);
}
function popOut(id, land) {
    var camp = activeCamp(); if (!camp || typeof camp.id !== 'string' || typeof id !== 'string' || !id) return false;
    var made = null; try { made = window.open(location.origin + '/?popout=doc:' + encodeURIComponent(camp.id) + '/' + encodeURIComponent(id) + popLand(land), 'wpPopout_' + id, 'width=820,height=1000'); } catch (e) { made = null; }
    if (!made) return false;   // the owed review, 2026-10-09: no window came up (refused or blocked). The caller falls back to the panel, and no tab is closed for a window that is not there
    if (window.wpPageShelf && window.wpPageShelf.opened) window.wpPageShelf.opened(id);   // 1.5.4 (pageshelf.js): one of the last pages opened
    return true;
}
// The owed review, 2026-10-09: a page docked back opens the panel in the app's own window alone. The stream window shows the table's view and
// has no way to put a panel away, and it hears the same word
// 1.5.4: the page a window docked back names: the item after its campaign. What follows the item (a landing, or an address of another shape)
// is not the item's, unless the whole of it is a page of the campaign and the item alone is not (an id with a slash in it)
function dockId(arg, camp) {
    var a = typeof arg === 'string' ? arg : '', rest = a.slice(a.indexOf('/') + 1), cut = rest.indexOf('/');
    var page = function(id) { var it = camp && camp.items && typeof camp.items === 'object' && Object.prototype.hasOwnProperty.call(camp.items, id) ? camp.items[id] : null; return !!it && typeof it === 'object' && (it.type === 'doc' || it.type === 'planner'); };
    return cut < 0 || (page(rest) && !page(rest.slice(0, cut))) ? rest : rest.slice(0, cut);
}
function dockTakes(search) { try { var q = new URLSearchParams(String(search == null ? '' : search)); return !q.has('stream') && !q.has('popout'); } catch (e) { return false; } }
// [textcheck:panelpop-end]

/* ---------- wiring ---------- */
(function wire() {
    var p = ui('docPanel'), head = ui('docPanelHead'); if (!p || !head) return;
    var cl = ui('docPanelClose'); if (cl) cl.addEventListener('click', close);
    var pop = ui('docPanelPop');
    if (pop) pop.addEventListener('click', function() {   // pop out into its own window; dock-back there reopens this panel
        if (openId && popOut(openId)) tabClose(openId);   // 1.5.4: the page goes to a window of its own and its tab closes; the panel stays while other tabs are open
    });
    // A popped-out doc window that "docks back" reopens the in-app panel here.
    try { new BroadcastChannel('waypoint').addEventListener('message', function(e) {
        if (e.data && e.data.type === 'dock' && e.data.kind === 'doc' && dockTakes(location.search)) open(dockId(e.data.arg, activeCamp()));   // 1.5.4: the item alone, whatever follows it
    }); } catch (e) {}
    // 1.5.4 tabs: a press on a tab's name brings its page to the front; its own button, or the middle mouse button anywhere on it, closes it
    var strip = ui('docPanelTabs');
    if (strip) {
        strip.addEventListener('click', function(e) { var tab = e.target.closest ? e.target.closest('.docpanel-tab') : null; if (!tab) return; if (e.target.closest('.docpanel-tab-x')) tabClose(tab.dataset.id); else tabFront(tab.dataset.id); });
        strip.addEventListener('auxclick', function(e) { var tab = e.button === 1 && e.target.closest ? e.target.closest('.docpanel-tab') : null; if (tab) { e.preventDefault(); tabClose(tab.dataset.id); } });
    }
    var drag = null;
    function savePos() { var r = p.getBoundingClientRect(); try { localStorage.setItem('wp_docPanel', JSON.stringify({ x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) })); } catch (e) {} }
    head.addEventListener('pointerdown', function(e) { if (e.target.closest('button, select, input')) return; var r = p.getBoundingClientRect(); drag = { dx: e.clientX - r.left, dy: e.clientY - r.top }; head.setPointerCapture(e.pointerId); });
    head.addEventListener('pointermove', function(e) { if (!drag) return; p.style.left = (e.clientX - drag.dx) + 'px'; p.style.top = (e.clientY - drag.dy) + 'px'; p.style.right = 'auto'; });
    head.addEventListener('pointerup', function() { if (!drag) return; drag = null; savePos(); });
    try { new ResizeObserver(function() { if (p.style.display !== 'none') savePos(); }).observe(p); } catch (e) {}

    // [textcheck:panelbox-start]
    // the search runs 130 ms after the last key. 1.5.4: Enter pressed before it ran searches the words typed first, which takes the first hit,
    // so it never steps through the hits of the words before them (the typed search then scrolls to its first hit)
    var box = ui('docPanelSearchInput'), st = null;
    if (box) {
        box.addEventListener('input', function() { clearTimeout(st); st = setTimeout(runSearch, 130); });
        box.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') { e.preventDefault(); clearTimeout(st); if (box.value !== query) runSearch(); else step(e.shiftKey ? -1 : 1); }
            else if (e.key === 'Escape') { e.preventDefault(); if (query) { clearSearch(); } else { close(); } }
        });
    }
    // [textcheck:panelbox-end]
    var nx = ui('docPanelFindNext'), pv = ui('docPanelFindPrev');
    if (nx) nx.addEventListener('click', function() { step(1); });
    if (pv) pv.addEventListener('click', function() { step(-1); });
    var res = ui('docPanelResults');
    if (res) res.addEventListener('click', function(e) {
        var row = e.target.closest && e.target.closest('.docpanel-res'); if (!row) return;
        open(row.dataset.id, { q: query });   // 1.5.4: the query kept and the page opened at its first hit (a blank query is no landing)
    });
    // Esc closes the panel when focus is on it or nowhere (never steals Esc from a dialog/menu/input elsewhere)
    document.addEventListener('keydown', function(e) {
        if (e.key !== 'Escape' || !openId || (window.wpFloats && window.wpFloats.away(ui('docPanel')))) return;   // 1.5.4 (floats.js): a panel put away with its view is not closed by a key
        var ae = document.activeElement;
        if (ae && ae.id === 'docPanelSearchInput') return;   // the input's own handler deals with Esc
        if (!ae || ae === document.body || (ae.closest && ae.closest('#docPanel'))) close();
    });
})();

window.wpDocPanel = { open: open, close: close, refresh: refresh, popOut: popOut, openId: function() { return openId; }, tabs: function() { return tabs.slice(); } };
window.wpDocPanel.finder = hlFinder;   // 1.5.4: a Find of its own for a page in a window of its own (popout.js)
window.wpDocPanel.hand = readerHand;   // 1.5.4: whether the reader has moved a page by their own hand since a landing (popout.js, planner.js, handbook.js, pagenav.js)
// Shared content search for the app-wide page search + Ctrl+K: ranked page results with a highlighted snippet.
// (q, campaign?=active, types?=['doc','planner']) -> [{ id, title, type, score, snippet /* escaped HTML + <mark> */ }].
window.wpDocSearch = function(q, camp, types) { return searchAll(q, camp, types); };

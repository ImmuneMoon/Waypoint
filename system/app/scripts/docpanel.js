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
var mmMode = '';
var query = '';         // the live search query
var hits = [], curHit = -1;   // in-page highlight <mark> nodes + the focused one

function activeCamp() { try { var s = state.appState; return s && s.campaigns ? s.campaigns[s.activeCampaignId] : null; } catch (e) { return null; } }

/* ---------- search helpers (pure) ---------- */
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
        default: return '';   // diagrams / flowcharts: skip the mermaid source
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
function clearMarks() {
    var body = ui('docPanelBody'); if (!body) return;
    var ms = body.querySelectorAll('mark.docpanel-hit');
    ms.forEach(function(m) { m.replaceWith(document.createTextNode(m.textContent)); });
    if (ms.length) body.normalize();
    hits = []; curHit = -1;
}
function highlightBody(q) {
    clearMarks();
    var body = ui('docPanelBody'); if (!body) { updateCount(); return; }
    var nq = fold(q).trim(); if (!nq) { updateCount(); return; }
    var words = nq.split(/\s+/).filter(Boolean);
    var walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, null), nodes = [], n;
    while ((n = walker.nextNode())) { if (n.nodeValue && n.nodeValue.trim() && !(n.parentNode && n.parentNode.tagName === 'SCRIPT')) nodes.push(n); }
    nodes.forEach(function(node) {
        var text = node.nodeValue, ranges = matchRanges(fold(text), nq, words);
        if (!ranges.length) return;
        var frag = document.createDocumentFragment(), last = 0;
        ranges.forEach(function(r) {
            if (r[0] > last) frag.appendChild(document.createTextNode(text.slice(last, r[0])));
            var mk = document.createElement('mark'); mk.className = 'docpanel-hit'; mk.textContent = text.slice(r[0], r[1]);
            frag.appendChild(mk); hits.push(mk); last = r[1];
        });
        if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
        node.parentNode.replaceChild(frag, node);
    });
    if (hits.length) { curHit = 0; markCur(false); }
    updateCount();
}
function markCur(scroll) { hits.forEach(function(m, k) { m.classList.toggle('cur', k === curHit); }); if (scroll !== false && hits[curHit]) hits[curHit].scrollIntoView({ block: 'center', behavior: 'smooth' }); }
function step(dir) { if (!hits.length) return; curHit = (curHit + dir + hits.length) % hits.length; markCur(true); updateCount(); }
function updateCount() { var c = ui('docPanelFindCount'); if (c) c.textContent = hits.length ? (curHit + 1) + '/' + hits.length : (query.trim() ? '0' : ''); }

function runSearch() {
    var box = ui('docPanelSearchInput'); query = box ? box.value : '';
    highlightBody(query);
    renderResults(searchAll(query));
}
function clearSearch() { query = ''; var box = ui('docPanelSearchInput'); if (box) box.value = ''; clearMarks(); renderResults([]); updateCount(); }

/* ---------- render the page ---------- */
function setMermaidStrict() {
    if (!window.mermaid || !window.wpMermaidConfig || mmMode === 'strict') return;
    try { window.mermaid.initialize(Object.assign({}, window.wpMermaidConfig, { securityLevel: 'strict' })); mmMode = 'strict'; } catch (e) {}
}
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
    if (!it || (it.type !== 'doc' && it.type !== 'planner')) { close(); return; }   // deleted / not a doc → close
    var title = (it.meta && it.meta.title) || it.name || (it.type === 'planner' ? 'Planner' : 'Page');
    var t = ui('docPanelTitle'); if (t) t.textContent = title;
    var sig = title + ' ' + JSON.stringify(it.blocks || []) + ' ' + JSON.stringify((it.meta && it.meta.style) || null) + ' ' + JSON.stringify(camp.docStyle || null);
    if (!force && sig === lastSig) return;   // nothing changed — skip the re-render (and keep highlights)
    lastSig = sig;
    var body = ui('docPanelBody'); if (!body) return;
    var DR = window.wpDocRender; if (!DR || !DR.renderDoc) return;
    setMermaidStrict();
    var keep = body.scrollTop;
    body.innerHTML = DR.renderDoc(it, { mermaid: !!window.mermaid, docStyle: camp.docStyle, empty: '<div class="docpanel-msg">This page has no content yet.</div>' });
    body.scrollTop = keep;
    if (window.mermaid) {
        var mnodes = Array.prototype.slice.call(body.querySelectorAll('pre.mermaid'));
        if (mnodes.length) { try { Promise.resolve(window.mermaid.run({ nodes: mnodes })).then(function() { if (window.wpFcPostProcess) window.wpFcPostProcess(body, it); if (query.trim()) highlightBody(query); }).catch(function() {}); } catch (e) {} }
    }
    if (query.trim()) highlightBody(query);   // re-apply the in-page highlight after a live re-render
}

function open(id) {
    var camp = activeCamp(); var it = camp && camp.items && camp.items[id];
    if (!it || (it.type !== 'doc' && it.type !== 'planner')) return;
    openId = id; lastSig = '';
    var p = ui('docPanel'); if (!p) return;
    p.style.display = 'flex'; place();
    clearSearch(); draw(true);
}
function close() { openId = ''; lastSig = ''; clearMarks(); var box = ui('docPanelSearchInput'); if (box) box.value = ''; query = ''; renderResults([]); var p = ui('docPanel'); if (p) p.style.display = 'none'; }
function refresh() { if (openId) draw(false); }   // called from the app's render cycle — sig-checked, cheap no-op when unchanged

/* ---------- wiring ---------- */
(function wire() {
    var p = ui('docPanel'), head = ui('docPanelHead'); if (!p || !head) return;
    var cl = ui('docPanelClose'); if (cl) cl.addEventListener('click', close);
    var drag = null;
    function savePos() { var r = p.getBoundingClientRect(); try { localStorage.setItem('wp_docPanel', JSON.stringify({ x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) })); } catch (e) {} }
    head.addEventListener('pointerdown', function(e) { if (e.target.closest('button, select, input')) return; var r = p.getBoundingClientRect(); drag = { dx: e.clientX - r.left, dy: e.clientY - r.top }; head.setPointerCapture(e.pointerId); });
    head.addEventListener('pointermove', function(e) { if (!drag) return; p.style.left = (e.clientX - drag.dx) + 'px'; p.style.top = (e.clientY - drag.dy) + 'px'; p.style.right = 'auto'; });
    head.addEventListener('pointerup', function() { if (!drag) return; drag = null; savePos(); });
    try { new ResizeObserver(function() { if (p.style.display !== 'none') savePos(); }).observe(p); } catch (e) {}

    var box = ui('docPanelSearchInput'), st = null;
    if (box) {
        box.addEventListener('input', function() { clearTimeout(st); st = setTimeout(runSearch, 130); });
        box.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') { e.preventDefault(); step(e.shiftKey ? -1 : 1); }
            else if (e.key === 'Escape') { e.preventDefault(); if (query) { clearSearch(); } else { close(); } }
        });
    }
    var nx = ui('docPanelFindNext'), pv = ui('docPanelFindPrev');
    if (nx) nx.addEventListener('click', function() { step(1); });
    if (pv) pv.addEventListener('click', function() { step(-1); });
    var res = ui('docPanelResults');
    if (res) res.addEventListener('click', function(e) {
        var row = e.target.closest && e.target.closest('.docpanel-res'); if (!row) return;
        var id = row.dataset.id, q = query;
        open(id);
        if (q) { var b = ui('docPanelSearchInput'); if (b) b.value = q; query = q; highlightBody(q); }   // keep the query, jump into the opened page
    });
    // Esc closes the panel when focus is on it or nowhere (never steals Esc from a dialog/menu/input elsewhere)
    document.addEventListener('keydown', function(e) {
        if (e.key !== 'Escape' || !openId) return;
        var ae = document.activeElement;
        if (ae && ae.id === 'docPanelSearchInput') return;   // the input's own handler deals with Esc
        if (!ae || ae === document.body || (ae.closest && ae.closest('#docPanel'))) close();
    });
})();

window.wpDocPanel = { open: open, close: close, refresh: refresh };
// Shared content search for the app-wide page search + Ctrl+K: ranked page results with a highlighted snippet.
// (q, campaign?=active, types?=['doc','planner']) -> [{ id, title, type, score, snippet /* escaped HTML + <mark> */ }].
window.wpDocSearch = function(q, camp, types) { return searchAll(q, camp, types); };

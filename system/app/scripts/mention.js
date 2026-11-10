/* @-mentions (1.6.2, backlog 166 f; the owner, 2026-11-09, by prompt: pages and planners, maps, characters and a map's rooms; in pages and the
   Journal, and in Table Chat and the table notepad; a chip that follows the new name; a press that opens it). Typing @ in a box that takes links
   opens a short list of what the campaign holds that narrows as you type; a pick puts the thing's name in, linked as a mention (textfmt.js
   mentionLink: #wp:@:<kind>:<id>[:<at>]), and a read view draws it as a chip in its current name (pageshelf.js mentionPaint). The editors do the
   writing (planner.js wpTextBox.mentionCan, mentionAt, mention): this module only reads, lists and hands the pick on. The list is made of
   elements and text nodes only. */
import { getActiveCampaign } from './models.js';

// [shelfcheck:mentionpick-start]
var MENTION_MAX = 8, ID = /^[A-Za-z0-9_-]{1,80}$/, AT = /^[A-Za-z0-9_-]{1,64}$/;
function plain(s, n) { return String(s == null ? '' : s).replace(/<[^>]*>/g, '').replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n || 80); }
// Everything a mention may name, as { kind, word, label, href }: the pages and planners by title, the maps, each map's named rooms after it, the
// characters. On a player's app only what it holds, which is what the GM let it see
function mentionAll(camp) {
    var out = []; if (!camp) return out;
    var items = camp.items && typeof camp.items === 'object' ? camp.items : {};
    Object.keys(items).forEach(function(id) {
        var it = items[id]; if (!it || typeof it !== 'object' || !ID.test(id)) return;
        var t = plain(it.meta && it.meta.title);
        if (it.type === 'planner' || it.type === 'doc') { if (t) out.push({ kind: 'page', word: it.type === 'planner' ? 'Planner' : 'Page', label: t, href: '#wp:@:page:' + id }); return; }
        if (it.type !== 'map' || it.meta && it.meta.stub === true && !t) return;
        out.push({ kind: 'map', word: 'Map', label: t || 'A map', href: '#wp:@:map:' + id });
        (Array.isArray(it.rooms) ? it.rooms : []).slice(0, 400).forEach(function(r) { var rn = r && plain(r.name); if (rn && typeof r.id === 'string' && AT.test(r.id)) out.push({ kind: 'map', word: 'Room', label: (t || 'A map') + ' \u203a ' + rn, href: '#wp:@:map:' + id + ':' + r.id }); });
    });
    var chars = camp.chars && typeof camp.chars === 'object' ? camp.chars : {};
    Object.keys(chars).forEach(function(id) { var c = chars[id], n = c && plain(c.name); if (n && ID.test(id)) out.push({ kind: 'char', word: c.npc === true ? 'NPC' : 'Character', label: n, href: '#wp:@:char:' + id }); });
    return out;
}
// What matches the words typed after @, the best first: a name that begins with them, then one with a word that does, then one that holds them
function mentionFind(camp, q) {
    var w = plain(q, 40).toLowerCase(), all = mentionAll(camp);
    var rank = function(x) { var l = x.label.toLowerCase(); return !w ? 0 : l.indexOf(w) === 0 ? 0 : l.indexOf(' ' + w) >= 0 || l.indexOf('\u203a ' + w) >= 0 ? 1 : l.indexOf(w) >= 0 ? 2 : 9; };
    return all.map(function(x, i) { return { x: x, r: rank(x), i: i }; }).filter(function(o) { return o.r < 9; }).sort(function(a, b) { return a.r - b.r || a.x.label.localeCompare(b.x.label) || a.i - b.i; }).slice(0, MENTION_MAX).map(function(o) { return o.x; });
}
// The words after an @ the caret stands right after, in the text before it: an @ at the start or after a space or an opening bracket, then up to
// 40 characters with no space and no other @. null where the caret is after none
function mentionQuery(before) { var m = /(?:^|[\s(\[{])@([^\s@]{0,40})$/.exec(String(before == null ? '' : before)); return m ? m[1] : null; }
// [shelfcheck:mentionpick-end]

var st = { el: null, q: '', rows: [], i: 0, menu: null };
function menuEl() {
    if (st.menu && st.menu.isConnected) return st.menu;
    var m = document.createElement('div'); m.id = 'mentionMenu'; m.className = 'mention-menu'; m.hidden = true; m.setAttribute('role', 'listbox'); m.setAttribute('aria-label', 'Mention');
    m.addEventListener('mousedown', function(e) { e.preventDefault(); });   // the box keeps the focus and its caret
    m.addEventListener('click', function(e) { var b = e.target && e.target.closest ? e.target.closest('.mention-row') : null; if (!b) return; st.i = Number(b.dataset.i) || 0; pick(); });
    document.body.appendChild(m); st.menu = m; return m;
}
function close() { if (st.menu) { st.menu.hidden = true; st.menu.textContent = ''; } st.el = null; st.rows = []; }
function draw() {
    var m = menuEl(); m.textContent = '';
    if (!st.rows.length) { var none = document.createElement('div'); none.className = 'mention-none'; none.textContent = 'Nothing here by that name'; m.appendChild(none); }
    st.rows.forEach(function(r, i) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'mention-row' + (i === st.i ? ' on' : ''); b.dataset.i = String(i); b.setAttribute('role', 'option'); b.setAttribute('aria-selected', i === st.i ? 'true' : 'false');
        var n = document.createElement('span'); n.className = 'mention-name'; n.textContent = r.label; b.appendChild(n);
        var k = document.createElement('span'); k.className = 'mention-kind'; k.textContent = r.word; b.appendChild(k);
        m.appendChild(b);
    });
    m.hidden = false;
}
function place() {
    var m = st.menu; if (!m || m.hidden) return;
    var r = null; if (!plainBox(st.el)) try { var gs = window.getSelection(); if (gs && gs.rangeCount) { var rg = gs.getRangeAt(0).cloneRange(); rg.collapse(true); var rs = rg.getClientRects(); r = rs && rs.length ? rs[0] : rg.getBoundingClientRect(); } } catch (e) { r = null; }
    if (!r || (!r.left && !r.top)) r = st.el.getBoundingClientRect();
    var w = m.offsetWidth || 260, h = m.offsetHeight || 200, vw = window.innerWidth || 1200, vh = window.innerHeight || 800;
    var x = Math.max(8, Math.min(vw - w - 8, r.left)), y = r.bottom + 4 + h > vh - 8 ? Math.max(8, r.top - h - 4) : r.bottom + 4;
    m.style.left = Math.round(x) + 'px'; m.style.top = Math.round(y) + 'px';
}
// [shelfcheck:mentionplain-start]
// A plain box (an input or a textarea marked data-mentions: Table Chat's) keeps what was picked on itself, { label, href } in order, and hands
// it on with its words when they are sent: mentionTake finds each pick's words in the text as sent, in order and apart, and gives the stretches
// (textfmt cleanMentions cleans them again on every machine). A pick whose words were since typed over is no mention
function plainBox(t) { return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') && t.hasAttribute && t.hasAttribute('data-mentions') ? t : null; }
function mentionTake(picks, text) {
    var out = [], used = [], s = String(text == null ? '' : text);
    (Array.isArray(picks) ? picks : []).slice(0, 40).forEach(function(p) {
        var w = p && typeof p.label === 'string' ? p.label : '', h = p && typeof p.href === 'string' ? p.href : ''; if (!w || !h) return;
        for (var i = s.indexOf(w); i >= 0; i = s.indexOf(w, i + 1)) {
            var e = i + w.length; if (used.some(function(u) { return i < u[1] && e > u[0]; })) continue;
            used.push([i, e]); out.push({ s: i, e: e, h: h }); return;
        }
    });
    return out.sort(function(a, b) { return a.s - b.s; }).slice(0, 20);
}
function plainPut(el, from, to, label, href) {
    var v = String(el.value || ''); if (from < 0 || to > v.length || from > to) return false;
    el.value = v.slice(0, from) + label + ' ' + v.slice(to);
    var c = from + label.length + 1; try { el.setSelectionRange(c, c); } catch (e) {}
    (el._wpMen = Array.isArray(el._wpMen) ? el._wpMen : []).push({ label: label, href: href }); if (el._wpMen.length > 40) el._wpMen.shift();
    return true;
}
// [shelfcheck:mentionplain-end]
function boxOf(t) {
    var pb = plainBox(t); if (pb) return pb;
    var el = t && t.closest ? t.closest('.ts-box, .rte-body') : null, tb = window.wpTextBox;
    return el && tb && typeof tb.mentionCan === 'function' && tb.mentionCan(el) ? el : null;
}
function onInput(e) {
    var el = boxOf(e.target); if (!el) { if (st.el) close(); return; }
    if (el === plainBox(el)) {
        var a = el.selectionStart, b = el.selectionEnd, qp = a === b && typeof a === 'number' ? mentionQuery(String(el.value || '').slice(0, a)) : null;
        if (qp === null) { close(); return; }
        st.el = el; st.q = qp; st.rows = mentionFind(getActiveCampaign(), qp); st.i = 0; draw(); place(); return;
    }
    var gs = window.getSelection ? window.getSelection() : null, n = gs && gs.isCollapsed ? gs.anchorNode : null;
    var q = n && n.nodeType === 3 && el.contains(n) ? mentionQuery(n.nodeValue.slice(0, gs.anchorOffset)) : null;
    if (q === null) { close(); return; }
    st.el = el; st.q = q; st.rows = mentionFind(getActiveCampaign(), q); st.i = 0; draw(); place();
}
function pick() {
    var el = st.el, r = st.rows[st.i], q = st.q, tb = window.wpTextBox; close();
    if (el && r && plainBox(el)) {
        var at = el.selectionStart, okP = typeof at === 'number' && at >= q.length + 1 && plainPut(el, at - q.length - 1, at, r.label, r.href);
        if (typeof window.wpStepLog === 'function') window.wpStepLog('mention v1', okP ? 'put' : 'refused', { kind: r.kind, box: 'plain' });
        return okP;
    }
    if (!el || !r || !tb || typeof tb.mentionAt !== 'function') return false;
    var at = tb.mentionAt(el); if (!(at >= q.length + 1)) return false;
    var ok = tb.mention(el, at - q.length - 1, at, r.label, r.href);
    if (typeof window.wpStepLog === 'function') window.wpStepLog('mention v1', ok ? 'put' : 'refused', { kind: r.kind });
    return ok;
}
function onKey(e) {
    if (!st.el || !st.menu || st.menu.hidden) return;
    var k = e.key;
    if (k === 'ArrowDown' || k === 'ArrowUp') { if (st.rows.length) { st.i = (st.i + (k === 'ArrowDown' ? 1 : st.rows.length - 1)) % st.rows.length; draw(); } }
    else if ((k === 'Enter' || k === 'Tab') && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) { if (!st.rows.length) { close(); return; } pick(); }
    else if (k === 'Escape') close();
    else return;
    e.preventDefault(); e.stopPropagation();
}
if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('input', onInput);
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', function(e) { if (st.menu && !st.menu.hidden && !(e.target && e.target.closest && e.target.closest('#mentionMenu'))) close(); }, true);
    document.addEventListener('focusout', function() { setTimeout(function() { if (st.el && document.activeElement !== st.el) close(); }, 0); });
    window.addEventListener('resize', close);
}
// The mentions a plain box holds for the words it now sends, and the box's picks let go of (a sent line starts afresh)
function take(el, text) { var out = el ? mentionTake(el._wpMen, text) : []; if (el) el._wpMen = []; return out; }
window.wpMention = { all: mentionAll, find: mentionFind, query: mentionQuery, take: take, close: close };
export { mentionAll, mentionFind, mentionQuery };

/* A table's scroll bar and heading row that follow the reader (1.6.2).
   The owner, 2026-11-14: "lets have the horizontal scroll bar for a table stick to the bottom of the screen while navigating it, and allow
   pinning of the table headers, like google docs does". Two things, drawn over the page while a table is in view and nothing stored:
     - THE BAR. A table whose box scrolls sideways (pagenav.js tableFit's pv-tscroll on a page, and the editor's own table, .b-table) has its
       scroll bar at its foot, which for a long table is far below what is on screen. While such a table fills the bottom of the view and its
       own bar is out of sight, one bar of this module's own stands at the bottom of the view over it, as wide as the box, and the two scroll
       together (tfBarAt says where).
     - THE HEADING ROW. A table pinned by its writer (the block's pin, true only: docrender.js draws it as table.t-pin, planner.js offers Pin
       heading row beside Columns, as Google Docs' Pin header row does) keeps its heading row in sight: once the real row has scrolled above
       the top of the view while the table goes on below, a copy of it stands at the top of the view, each name over its own column and
       following the table sideways (tfHeadAt). The editor's own table always keeps its headings in sight: it is where the GM types.
   The copy holds no text node: each name is an attribute the style sheet prints, so the page's Find, a landing at words and Mentioned in
   never read it twice; it takes no pointer, so a press goes to what is under it. Both are drawn only where the place they belong to is on
   top at that spot (a panel or a window over it hides them), never in print, and never inside the box of a page (they live in the window's
   own wrapper), so an export, a picture of the page and a page's Find never meet them. Asked again at every scroll anywhere (a capture
   listener), every change of the window's size, and twice a second for a page drawn again; the work is done once a frame. No
   ResizeObserver: a size this module sets is never one a watcher reads. */
'use strict';

var TF_BAR_H = 14;    // the bar's height, its own scroll bar's
var TF_MIN = 60;      // a box narrower than this on screen gets no bar
// [pagecheck:tfollow-start]
// Where the bar stands, or null. r: the box's rect on screen; sw, cw: its scrollWidth and clientWidth; reg: the room the place shows
// { left, top, right, bottom }. Only a box wider inside than it shows, whose foot (where its own bar is) is below the room and whose top is
// well inside it (48 px), gets one; it covers the part of the box the room shows. offset: how far the bar's left edge is from the box's
function tfBarAt(r, sw, cw, reg) {
    if (!r || !reg || !(sw > cw + 1) || !(cw > 0)) return null;
    if (r.bottom <= reg.bottom || r.top >= reg.bottom - 48 || r.bottom <= reg.top) return null;
    var left = Math.max(r.left, reg.left), right = Math.min(r.left + cw, reg.right);
    if (right - left < TF_MIN) return null;
    return { left: Math.round(left), width: Math.round(right - left), top: Math.round(reg.bottom - TF_BAR_H), offset: Math.round(left - r.left) };
}
// Where the copy of a heading row stands, or null. head: the real row's rect, table: the table's, reg: the room. Only once the real row is
// above the top of the room while the table still goes on below it, by more than the row and a little more
function tfHeadAt(head, table, reg) {
    if (!head || !table || !reg) return null;
    var h = head.bottom - head.top; if (!(h > 0)) return null;
    if (head.top >= reg.top || table.bottom < reg.top + h + 24 || table.top >= reg.bottom) return null;
    return { top: Math.round(reg.top), height: Math.round(h) };
}
// The names of a heading row as the copy draws them: each cell's place from the clip's left edge, its width and its words (cut at 80
// characters, white space folded). cells: [{ rect, text, first }] in order; clipLeft: where the copy's box begins on screen
function tfHeadCells(cells, clipLeft) {
    return (cells || []).map(function(c) {
        var t = Array.from(String(c.text == null ? '' : c.text).replace(/\s+/g, ' ').trim()).slice(0, 80).join('');
        return { left: Math.round(c.rect.left - clipLeft), width: Math.max(0, Math.round(c.rect.right - c.rect.left)), text: t, first: !!c.first };
    });
}
// Whether a heading of the real row stands for the held first column in the copy (its tf-first look): the first heading of a page's table in
// the scroll form (pv-tscroll) alone, never the editor's boxes (ed), and never a first heading merged over more columns (1.6.2: the style sheet
// holds no such heading in view, so the copy does not either). c: the heading, k: its place in the row, box: what the table scrolls in
function tfHeldFirst(c, k, ed, box) { return !ed && k === 0 && !!box && !!box.classList && box.classList.contains('pv-tscroll') && !(c && c.getAttribute && +c.getAttribute('colspan') > 1); }
// The stacking z of the place an element stands in, so the bar and the copy stand just over that place and under whatever is raised above it:
// the z-index of its ancestor that is a child of the host (the body, or a window's own wrapper), where that is a whole number; '' where it is
// auto or the element is not under the host (the style sheet's value then stands). The bar and the copy come later in the host than every
// place, so a tie puts them over their own place. zOf(el): the computed z-index of an element (getComputedStyle there, a stand-in in a suite)
function tfZOf(el, host, zOf) {
    var n = el; while (n && n.parentElement && n.parentElement !== host) n = n.parentElement;
    if (!n || !host || n.parentElement !== host) return '';
    var z = String(zOf(n) == null ? '' : zOf(n)); return /^-?\d+$/.test(z) ? z : '';
}
// The candidates in the order they are tried: those whose scroller (scOf) is the one the reader scrolled last (want) first, then the rest in
// the page's order. Found live: in Side by side the editor's own table comes first in the page and took the bar and the copy from the preview
// the GM was reading. want undefined: nothing scrolled yet, the page's order as it is
function tfFirst(items, scOf, want) {
    var list = Array.prototype.slice.call(items || []); if (want === undefined) return list;
    var mine = [], rest = []; list.forEach(function(x) { (scOf(x) === want ? mine : rest).push(x); });
    return mine.concat(rest);
}
// [pagecheck:tfollow-end]

var tf = { bar: null, inner: null, head: null, box: null, raf: 0, wired: false, lastSc: undefined };   // lastSc: the element the reader last scrolled up and down (null: the window)
function tfZ(el) { return getComputedStyle(el).zIndex; }
// The bar or the copy given the z of the place it serves (tfZOf), written only where it changed
function tfZSet(node, el) { var z = tfZOf(el, node.parentElement, tfZ); if (node.style.zIndex !== z) node.style.zIndex = z; }
function tfOwn(el) { return !!el && (el === tf.bar || el === tf.head || (tf.bar && tf.bar.contains(el)) || (tf.head && tf.head.contains(el))); }
// The element that scrolls a box up and down: its nearest ancestor that scrolls so; null for the window itself
function tfScroller(el) {
    for (var n = el.parentElement; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
        var oy = getComputedStyle(n).overflowY;
        if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight + 1) return n;
    }
    return null;
}
// The room a place shows of a box: its scroller's inside on screen, within the window, less a bar that stands at the scroller's top (the
// planner's Find bar, which sticks there)
function tfRoom(el) {
    var sc = tfScroller(el), vw = window.innerWidth, vh = window.innerHeight, r = sc ? sc.getBoundingClientRect() : { left: 0, top: 0, right: vw, bottom: vh };
    var reg = { sc: sc, left: Math.max(0, r.left), top: Math.max(0, r.top), right: Math.min(vw, sc ? r.left + sc.clientWidth : vw), bottom: Math.min(vh, sc ? r.top + sc.clientHeight : vh) };
    var fb = sc ? sc.querySelector('#plannerFindBar') : null;
    if (fb && fb.parentElement === sc && fb.offsetParent) { var fr = fb.getBoundingClientRect(); if (fr.top <= reg.top + 2 && fr.bottom > reg.top) reg.top = fr.bottom; }
    // a block open on the page keeps its head (its name and Done) in sight at the top as it scrolls: the room of a table inside it starts under that head
    var form = el.closest ? el.closest('.planner-block-edit.pg-open') : null, bh = form ? form.querySelector('.block-head') : null;
    if (bh && bh.parentElement === form) { var hr = bh.getBoundingClientRect(); if (hr.top <= reg.top + 2 && hr.bottom > reg.top) reg.top = hr.bottom; }
    return reg;
}
// Is the table itself what is on screen at this spot: the first thing there that is not this module's own is inside the box or the table, so
// a panel, a menu, or a block open on the page over it (found live: the page's own table behind the open block took the copy) hides the
// bar and the copy
function tfOnTop(el, x, y) {
    var all = document.elementsFromPoint ? document.elementsFromPoint(x, y) : [];
    for (var i = 0; i < all.length; i++) { if (tfOwn(all[i])) continue; return el.contains(all[i]); }
    return false;
}
function tfSeen(el) { if (!el || !el.offsetParent) return false; var r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < window.innerHeight && r.width > 0; }
function tfMake() {
    if (tf.bar) return;
    var host = document.getElementById('popoutWrap') || document.body;   // a window of its own shows only its wrapper
    tf.bar = document.createElement('div'); tf.bar.className = 'tf-bar'; tf.bar.hidden = true; tf.bar.setAttribute('aria-hidden', 'true');
    tf.inner = document.createElement('div'); tf.inner.className = 'tf-bar-inner'; tf.bar.appendChild(tf.inner);
    tf.head = document.createElement('div'); tf.head.className = 'tf-head'; tf.head.hidden = true; tf.head.setAttribute('aria-hidden', 'true');
    host.appendChild(tf.bar); host.appendChild(tf.head);
    tf.bar.addEventListener('scroll', function() { var b = tf.box; if (b && b.isConnected && b.scrollLeft !== tf.bar.scrollLeft) b.scrollLeft = tf.bar.scrollLeft; });
}
// Once a frame: the bar and the copy where they belong now
function tfNow() {
    tf.raf = 0;
    if (document.hidden) return;
    tfMake();
    tfBar(); tfHead();
}
function tfBar() {
    var boxes = tfFirst(document.querySelectorAll('.pv-tscroll, .b-table'), tfScroller, tf.lastSc), pick = null;
    for (var i = 0; i < boxes.length && !pick; i++) {
        var b = boxes[i]; if (!tfSeen(b)) continue;
        var reg = tfRoom(b), at = tfBarAt(b.getBoundingClientRect(), b.scrollWidth, b.clientWidth, reg);
        if (at && tfOnTop(b, at.left + at.width / 2, at.top + 2)) pick = { b: b, at: at };
    }
    if (!pick) { if (!tf.bar.hidden) tf.bar.hidden = true; tf.box = null; return; }
    var s = tf.bar.style, b2 = pick.b;
    s.left = pick.at.left + 'px'; s.top = pick.at.top + 'px'; s.width = pick.at.width + 'px';
    tf.inner.style.width = (b2.scrollWidth - b2.clientWidth + pick.at.width) + 'px';   // the same reach as the box's own scroll, so the two move one for one
    tfZSet(tf.bar, b2);   // over its own place: a player's reader and the panel over the map stand above the style sheet's 9001
    tf.box = b2; if (tf.bar.hidden) tf.bar.hidden = false;
    if (tf.bar.scrollLeft !== b2.scrollLeft) tf.bar.scrollLeft = b2.scrollLeft;
}
function tfHead() {
    var ts = tfFirst(document.querySelectorAll('table.t-pin, .b-table'), tfScroller, tf.lastSc), pick = null;
    for (var i = 0; i < ts.length && !pick; i++) {
        var t = ts[i], ed = t.classList.contains('b-table');
        if (!ed && t.classList.contains('pv-tstack')) continue;   // the cards have no heading row
        var row = ed ? t.querySelector('.b-heads') : t.querySelector('thead tr'); if (!row || !tfSeen(t)) continue;
        var box = ed ? t : t.parentElement && t.parentElement.classList.contains('pv-tscroll') ? t.parentElement : t;
        var reg = tfRoom(t), at = tfHeadAt(row.getBoundingClientRect(), t.getBoundingClientRect(), reg); if (!at) continue;
        var br = box.getBoundingClientRect(), left = Math.max(br.left, reg.left), right = Math.min(br.left + (box.clientWidth || br.width), reg.right);
        if (right - left < TF_MIN || !tfOnTop(box.contains(t) ? box : t, left + 4, at.top + 2)) continue;
        var cells = Array.prototype.map.call(ed ? row.querySelectorAll('.ts-box') : row.children, function(c, k) { return { rect: c.getBoundingClientRect(), text: ed && typeof c._tsText === 'string' ? c._tsText : c.textContent, first: tfHeldFirst(c, k, ed, box) }; });   // a merged first heading is not held (1.6.2, tfHeldFirst)
        pick = { at: at, left: left, width: right - left, cells: tfHeadCells(cells, left), ed: ed, t: t };
    }
    if (!pick) { if (!tf.head.hidden) tf.head.hidden = true; return; }
    var s = tf.head.style; s.left = Math.round(pick.left) + 'px'; s.top = pick.at.top + 'px'; s.width = Math.round(pick.width) + 'px'; s.height = pick.at.height + 'px';
    tf.head.classList.toggle('tf-head-ed', pick.ed);
    tfZSet(tf.head, pick.t);
    var kids = tf.head.children;
    while (kids.length > pick.cells.length) tf.head.removeChild(tf.head.lastChild);
    while (kids.length < pick.cells.length) tf.head.appendChild(document.createElement('span'));
    pick.cells.forEach(function(c, k) {
        var el = kids[k];
        el.style.left = c.left + 'px'; el.style.width = c.width + 'px';
        if (el.getAttribute('data-t') !== c.text) el.setAttribute('data-t', c.text);   // printed by the style sheet: no text node
        el.classList.toggle('tf-first', c.first);
    });
    if (tf.head.hidden) tf.head.hidden = false;
}
function tfSoon() { if (!tf.raf) tf.raf = requestAnimationFrame(tfNow); }
function tfWire() {
    if (tf.wired || typeof document === 'undefined') return; tf.wired = true;
    var q = new URLSearchParams(location.search); if (q.has('stream')) return;   // the stream window shows the table's view, never a page
    document.addEventListener('scroll', function(e) {
        if (e.target === tf.bar) return;
        // 1.6.3 (the improvement week's review, finding 31): the play map's own box holds no table of a page, so its scroll (every step of a pan)
        // measures nothing: tfNow walked and measured every table of the document at each one. A table in a page standing over the map (the panel,
        // a reader) scrolls in a box of its own, which is heard as ever, and the half-second look below still runs
        if (e.target && e.target.id === 'whiteboardWrap') return;
        // the scroller the reader is moving now, tried first by tfBar and tfHead (tfFirst): an element that scrolls up and down, or null for the page
        var st = e.target; if (st && st.nodeType === 1 && st.scrollHeight > st.clientHeight + 1 && st !== document.body && st !== document.documentElement) tf.lastSc = st; else if (st && (st.nodeType === 9 || st === document.body || st === document.documentElement)) tf.lastSc = null;
        if (tf.box && e.target === tf.box && tf.bar && tf.bar.scrollLeft !== tf.box.scrollLeft) tf.bar.scrollLeft = tf.box.scrollLeft; tfSoon(); }, true);
    window.addEventListener('resize', tfSoon);
    setInterval(tfSoon, 500);   // a page drawn again, a fold opened, a table's box filled anew
}
if (typeof window !== 'undefined' && typeof document !== 'undefined') { tfWire(); window.wpTableFollow = { now: tfNow }; }
export { tfBarAt, tfHeadAt, tfHeadCells, tfZOf, tfFirst, TF_BAR_H };

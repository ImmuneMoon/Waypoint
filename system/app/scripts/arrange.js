/* Arranging a sheet by dragging (1.6.2, backlog 171 (b); the owner, by prompt: "In the System editor (Recommended)", "Sections and fields
   (Recommended)", "Side by side (Recommended)"). The Layout tab's preview, made large: the sheet stays drawn and untouched (inert, as a preview is),
   and a layer of its own over it holds a grip for each section and each field. Nothing changes for anyone until the System editor's Save. The
   host (sheets.js) holds the draft; what a drop means is arrangecore.js. A press is a pointer's, kept on the preview so that a redraw under a drag
   loses nothing, and a grip takes Alt and the arrow keys. Words reach the page as text nodes alone. */
import * as A from './arrangecore.js';

var st = { on: false, host: null, box: null, view: null, boxes: [], cells: {}, hist: [], drag: null, focus: '', wait: null };
var DRAG_PX = 4, TAB_WAIT = 500, HIST = 30;
function log(step, facts) { try { if (typeof window.wpStepLog === 'function') window.wpStepLog('arrange v1', step, facts || {}); } catch (e) {} }
function mk(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function ui(id) { return document.getElementById(id); }
function tabIds() { return st.host.tabs().map(function(t) { return t.id; }); }
function secOf(id) { return st.host.sections().find(function(s) { return s.id === id; }) || null; }
function nameOf(s) { return (s && s.title) || 'Untitled section'; }

// [arrangecheck:measure-start]
function contentOf(box) { var b = box.getBoundingClientRect(), ox = box.scrollLeft - b.left - box.clientLeft, oy = box.scrollTop - b.top - box.clientTop; return function(r) { return { l: r.left + ox, t: r.top + oy, r: r.right + ox, b: r.bottom + oy }; }; }
function measure(box, viewSecs) {
    var to = contentOf(box), boxes = [], cells = {}, draftOf = {};
    st.host.sections().forEach(function(s) { draftOf[s.id] = s; });
    Array.prototype.forEach.call(box.querySelectorAll('[data-arr-sid]'), function(el) {
        var id = el.dataset.arrSid, d = draftOf[id]; if (!d) return;
        var up = el.parentNode && el.parentNode.closest ? el.parentNode.closest('[data-arr-sid]') : null, head = el.querySelector(':scope > .sheet-sec-title');
        var e = to(el.getBoundingClientRect()); e.id = id; e.kid = !!up; e.up = up ? up.dataset.arrSid : null; e.head = head ? to(head.getBoundingClientRect()) : null;
        if (e.r - e.l < 1) return;
        boxes.push(e);
        var vs = viewSecs.find(function(s) { return s.id === id; }), map = vs ? A.placeMap(d.fields, vs.fields) : [], list = [];
        Array.prototype.forEach.call(el.querySelectorAll('[data-arr-pi]'), function(n) {
            var own = n.closest('[data-arr-sid]'); if (own !== el) return;
            var pi = map[+n.dataset.arrPi]; if (typeof pi !== 'number' || pi < 0) return;
            var c = to(n.getBoundingClientRect()); if (c.r - c.l < 1) return;
            c.pi = pi; c.sid = id; list.push(c);
        });
        cells[id] = list;
    });
    return { boxes: boxes, cells: cells };
}
// [arrangecheck:measure-end]

// [arrangecheck:layer-start]
function place(e, r) { e.style.left = r.l + 'px'; e.style.top = r.t + 'px'; e.style.width = (r.r - r.l) + 'px'; e.style.height = (r.b - r.t) + 'px'; }
function grip(cls, words, key) { var g = mk('button', 'arr-grip ' + cls, '⋮'); g.type = 'button'; g.setAttribute('aria-label', words); g.title = words + '. Drag it, or use Alt and the arrow keys.'; g.dataset.key = key; return g; }
function drawLayer() {
    var box = st.box, old = box.querySelector(':scope > .arr-layer'), held = document.activeElement;
    if (!st.focus && old && held && old.contains(held) && held.dataset && held.dataset.key) st.focus = held.dataset.key;   // a redraw keeps the focus where it was
    if (old) old.parentNode.removeChild(old);
    var viewSecs = (st.view && st.view.sheet && st.view.sheet.sections) || [], m = measure(box, viewSecs), lay = mk('div', 'arr-layer');
    st.boxes = m.boxes; st.cells = m.cells;
    m.boxes.forEach(function(b) {
        var d = secOf(b.id), sec = mk('div', 'arr-sec' + (b.kid ? ' arr-kid' : '')); place(sec, b);
        var bar = mk('div', 'arr-bar'); bar.dataset.drag = 's'; bar.dataset.id = b.id; if (b.head) bar.style.height = Math.max(20, b.head.b - b.head.t) + 'px';
        bar.appendChild(grip('arr-grip-sec', 'Move section ' + nameOf(d), 's:' + b.id));
        var cols = Math.max(1, Math.min(4, (d && d.cols) || 1)), cb = mk('button', 'arr-chip', cols + (cols === 1 ? ' column' : ' columns')); cb.type = 'button'; cb.title = 'How many fields stand on a row of this section. Press to change.'; cb.dataset.cols = b.id; cb.dataset.key = 'c:' + b.id;
        bar.appendChild(cb); sec.appendChild(bar); lay.appendChild(sec);
        (m.cells[b.id] || []).forEach(function(c) {
            var pl = d && d.fields && d.fields[c.pi], f = mk('div', 'arr-f'); place(f, c); f.dataset.drag = 'f'; f.dataset.id = b.id; f.dataset.pi = String(c.pi);
            f.appendChild(grip('arr-grip-f', 'Move ' + st.host.plName(pl), 'f:' + b.id + ':' + c.pi));
            var w = mk('button', 'arr-chip arr-wide' + (pl && pl.w === 'row' ? ' on' : ''), 'Wide'); w.type = 'button'; w.title = 'Take the whole row of this section'; w.setAttribute('aria-pressed', pl && pl.w === 'row' ? 'true' : 'false'); w.dataset.wide = b.id; w.dataset.pi = String(c.pi); w.dataset.key = 'w:' + b.id + ':' + c.pi;
            f.appendChild(w); lay.appendChild(f);
        });
    });
    box.appendChild(lay);
    if (st.focus) { var keep = st.focus, g = lay.querySelector('[data-key="' + keep.replace(/"/g, '') + '"]'); st.focus = ''; if (g) g.focus({ preventScroll: false }); }
}
// [arrangecheck:layer-end]

// [arrangecheck:list-start]
function drawList() {
    var box = ui('sysArrList'); if (!box) return;
    box.textContent = '';
    box.appendChild(mk('div', 'sys-tabmgr-head', 'Sections'));
    var tabs = st.host.tabs(), secs = st.host.sections(), names = {}; tabs.forEach(function(t) { names[t.id] = t.label || 'Tab'; });
    secs.forEach(function(s) { var b = mk('button', 'arr-row' + (s.parent ? ' arr-row-kid' : ''), nameOf(s)); b.type = 'button'; b.dataset.show = s.id; b.title = 'Show this section in the preview'; box.appendChild(b); });
    if (!secs.length) box.appendChild(mk('div', 'sys-hint', 'No sections yet.'));
    var rest = st.host.unplaced();
    box.appendChild(mk('div', 'sys-tabmgr-head arr-rest', st.host.hud() ? 'Not on the HUD' : 'Not on the sheet'));
    if (!rest.length) box.appendChild(mk('div', 'sys-hint', 'Everything is placed.'));
    rest.forEach(function(r) { var b = mk('button', 'arr-row arr-new', r.name); b.type = 'button'; b.dataset.drag = 'n'; b.dataset.v = r.v; b.title = 'Drag this onto a section, or press Enter to add it to the first section'; box.appendChild(b); });
}
// [arrangecheck:list-end]

function undoSync() { var u = ui('sysArrUndo'); if (u) u.disabled = !st.hist.length; }
function moved(snap, what) { st.hist.push(snap); if (st.hist.length > HIST) st.hist.shift(); log('move', { what: what, steps: st.hist.length }); st.host.changed(); undoSync(); }

// [arrangecheck:drop-start]
function inside(b, p) { return p.x >= b.l && p.x <= b.r && p.y >= b.t && p.y <= b.b; }
function pointOf(e) { var to = contentOf(st.box), r = to({ left: e.clientX, top: e.clientY, right: e.clientX, bottom: e.clientY }); return { x: r.l, y: r.t }; }
function tabAt(e) { var hit = null; Array.prototype.forEach.call(st.box.querySelectorAll('[data-arr-tab]'), function(t) { var r = t.getBoundingClientRect(); if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) hit = t; }); return hit; }
function target(d, e) {
    var p = pointOf(e), tb = tabAt(e);
    if (tb) return { tab: tb.dataset.arrTab, el: tb };
    if (d.kind === 's') {
        var kids = st.boxes.filter(function(b) { return b.kid && b.id !== d.id; }), holds = st.host.sections().some(function(s) { return s.parent === d.id; }), kid = holds ? null : kids.filter(function(b) { return inside(b, p); })[0];
        var list = kid ? kids.filter(function(b) { return b.up === kid.up; }) : st.boxes.filter(function(b) { return !b.kid; });
        return A.dropSection(list, p.x, p.y, d.id);
    }
    var sec = null; st.boxes.forEach(function(b) { if (inside(b, p) && (!sec || b.kid)) sec = b; });
    if (!sec) return null;
    var s = secOf(sec.id); return { sid: sec.id, at: A.dropField(st.cells[sec.id] || [], p.x, p.y, s && s.fields ? s.fields.length : 0) };
}
function markFor(t) {   // the line that shows where a drop lands, as { l, t, r, b } in the preview's own coordinates
    if (!t) return null;
    if (t.sid) { var cs = st.cells[t.sid] || [], c = cs.filter(function(x) { return x.pi === t.at; })[0], last = cs[cs.length - 1], B = st.boxes.filter(function(b) { return b.id === t.sid; })[0]; if (c) return { l: c.l - 4, t: c.t, r: c.l - 1, b: c.b }; if (last) return { l: last.r + 1, t: last.t, r: last.r + 4, b: last.b }; return B ? { l: B.l + 2, t: B.b - 5, r: B.r - 2, b: B.b - 2 } : null; }
    var key = t.before || t.after || t.left || t.right, one = st.boxes.filter(function(b) { return b.id === key; })[0]; if (!one) return null;
    if (t.left) return { l: one.l - 5, t: one.t, r: one.l - 2, b: one.b };
    if (t.right) return { l: one.r + 2, t: one.t, r: one.r + 5, b: one.b };
    var secs = st.host.sections(), ids = tabIds(), a = A.rowHead(secs, key, ids), z = A.rowTail(secs, key, ids), row = st.boxes.filter(function(b) { return b.id === key || b.id === a || b.id === z || (!one.kid && !b.kid && b.t < one.b && b.b > one.t); });
    var L = Math.min.apply(null, row.map(function(b) { return b.l; })), R = Math.max.apply(null, row.map(function(b) { return b.r; })), T = Math.min.apply(null, row.map(function(b) { return b.t; })), B2 = Math.max.apply(null, row.map(function(b) { return b.b; }));
    return t.before ? { l: L, t: T - 5, r: R, b: T - 2 } : { l: L, t: B2 + 2, r: R, b: B2 + 5 };
}
function showMark(t) {
    var lay = st.box.querySelector(':scope > .arr-layer'), m = st.box.querySelector('.arr-mark'), r = markFor(t);
    Array.prototype.forEach.call(st.box.querySelectorAll('.arr-tabon'), function(x) { x.classList.remove('arr-tabon'); });
    if (t && t.el) t.el.classList.add('arr-tabon');
    if (!r || !lay) { if (m) m.hidden = true; return; }
    if (!m) { m = mk('div', 'arr-mark'); lay.appendChild(m); }
    m.hidden = false; place(m, r);
}
function ghost(e, words) { var g = ui('arrGhost'); if (!g) { g = mk('div', ''); g.id = 'arrGhost'; document.body.appendChild(g); } g.textContent = words; g.style.left = (e.clientX + 12) + 'px'; g.style.top = (e.clientY + 8) + 'px'; g.hidden = false; }
function dragEnd() { var g = ui('arrGhost'); if (g) g.hidden = true; document.body.classList.remove('arr-drag'); document.removeEventListener('keydown', dragKey, true); if (st.wait) { clearTimeout(st.wait.t); st.wait = null; } if (st.box) { showMark(null); if (st.drag && st.box.hasPointerCapture && st.box.hasPointerCapture(st.drag.pid)) { try { st.box.releasePointerCapture(st.drag.pid); } catch (e) {} } } st.drag = null; }
function dragKey(e) { if (e.key === 'Escape' && st.drag) { e.preventDefault(); e.stopPropagation(); log('cancel', {}); dragEnd(); } }
function apply(d, t) {
    var secs = st.host.sections(), snap = JSON.stringify(secs), ok = false, what = d.kind;
    if (d.kind === 's') ok = A.moveSection(secs, d.id, t.tab ? { tab: t.tab } : t, tabIds());
    else if (t.tab) return;
    else if (d.kind === 'f') ok = A.moveField(secs, d.id, d.pi, t.sid, t.at);
    else { if (st.host.full()) { st.host.say('This view holds as many placements as it can.'); return; } ok = A.addField(secs, t.sid, st.host.pl(d.v), t.at); }
    if (ok) moved(snap, what);
}
function down(e) {
    if (e.button !== 0 || !st.on || st.drag) return;
    var t = e.target; if (!t || !t.closest || t.closest('.arr-chip')) return;
    var h = t.closest('[data-drag]'); if (!h) return;
    e.preventDefault();
    st.drag = { kind: h.dataset.drag, id: h.dataset.id, pi: +h.dataset.pi, v: h.dataset.v, x: e.clientX, y: e.clientY, live: false, pid: e.pointerId, words: h.dataset.drag === 's' ? nameOf(secOf(h.dataset.id)) : h.dataset.drag === 'f' ? st.host.plName((secOf(h.dataset.id) || {}).fields && secOf(h.dataset.id).fields[+h.dataset.pi]) : h.textContent };
    try { st.box.setPointerCapture(e.pointerId); } catch (er) {}
    document.addEventListener('keydown', dragKey, true);
}
function move(e) {
    var d = st.drag; if (!d) return;
    if (!d.live) { if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) < DRAG_PX) return; d.live = true; document.body.classList.add('arr-drag'); }
    ghost(e, d.words);
    var b = st.box.getBoundingClientRect(); if (e.clientY < b.top + 28) st.box.scrollTop -= 14; else if (e.clientY > b.bottom - 28) st.box.scrollTop += 14;
    var t = target(d, e); d.t = t; showMark(t);
    if (t && t.tab && d.kind !== 's') { if (!st.wait || st.wait.tab !== t.tab) { if (st.wait) clearTimeout(st.wait.t); st.wait = { tab: t.tab, t: setTimeout(function() { st.wait = null; if (st.drag) st.host.showTab(t.tab); }, TAB_WAIT) }; } }
    else if (st.wait) { clearTimeout(st.wait.t); st.wait = null; }
}
function up(e) { var d = st.drag; if (!d) return; var live = d.live, t = live ? target(d, e) : null; dragEnd(); if (t) apply(d, t); }
function cancel() { if (st.drag) dragEnd(); }
// [arrangecheck:drop-end]

// [arrangecheck:keys-start]
function press(e) {
    var t = e.target, wide = t.closest ? t.closest('[data-wide]') : null, cols = t.closest ? t.closest('[data-cols]') : null;
    if (wide) { var s = secOf(wide.dataset.wide), pl = s && s.fields && s.fields[+wide.dataset.pi]; if (!pl) return; var snap = JSON.stringify(st.host.sections()); pl.w = pl.w === 'row' ? 1 : 'row'; st.focus = wide.dataset.key; moved(snap, 'wide'); return; }
    if (cols) { var c = secOf(cols.dataset.cols); if (!c) return; var was = JSON.stringify(st.host.sections()); c.cols = ((Math.max(1, Math.min(4, c.cols || 1))) % 4) + 1; st.focus = cols.dataset.key; moved(was, 'cols'); }
}
function keys(e) {
    if (!e.altKey || !/^Arrow(Up|Down|Left|Right)$/.test(e.key)) return;
    var g = e.target && e.target.closest ? e.target.closest('.arr-grip') : null; if (!g) return;
    e.preventDefault(); e.stopPropagation();
    var k = g.dataset.key.split(':'), secs = st.host.sections(), snap = JSON.stringify(secs), ok = false;
    if (k[0] === 's') { var w = A.sectionKey(secs, k[1], e.key, tabIds()); ok = !!w && A.moveSection(secs, k[1], w, tabIds()); st.focus = g.dataset.key; }
    else {
        var pi = +k[2], s = secOf(k[1]), back = e.key === 'ArrowUp' || e.key === 'ArrowLeft', n = s && s.fields ? s.fields.length : 0, order = st.boxes.map(function(b) { return b.id; }), at = order.indexOf(k[1]);
        if (back ? pi > 0 : pi < n - 1) { ok = A.moveField(secs, k[1], pi, k[1], back ? pi - 1 : pi + 2); st.focus = 'f:' + k[1] + ':' + (back ? pi - 1 : pi + 1); }
        else { var o = order[at + (back ? -1 : 1)]; if (o) { var to = secOf(o), m = to && to.fields ? to.fields.length : 0; ok = A.moveField(secs, k[1], pi, o, back ? m : 0); st.focus = 'f:' + o + ':' + (back ? m : 0); } }
    }
    if (ok) moved(snap, k[0]); else st.focus = '';
}
function listPress(e) {
    var t = e.target && e.target.closest ? e.target.closest('.arr-row') : null; if (!t) return;
    if (t.dataset.show) { var s = secOf(t.dataset.show); if (!s) return; var ids = tabIds(), tb = A.runOf(s, ids); if (ids.indexOf(tb) >= 0) st.host.showTab(tb); var el = null; Array.prototype.forEach.call(st.box.querySelectorAll('[data-arr-sid]'), function(x) { if (x.dataset.arrSid === s.id) el = x; }); if (el && el.scrollIntoView) el.scrollIntoView({ block: 'start' }); return; }
    if (t.dataset.v && e.detail === 0) { var first = st.boxes[0]; if (!first) return; var secs = st.host.sections(), snap = JSON.stringify(secs); if (st.host.full()) { st.host.say('This view holds as many placements as it can.'); return; } if (A.addField(secs, first.id, st.host.pl(t.dataset.v))) moved(snap, 'n'); }
}
// [arrangecheck:keys-end]

function wireOnce() {
    var box = st.box; if (!box || box.dataset.arrWired) return; box.dataset.arrWired = '1';
    box.addEventListener('pointerdown', down); box.addEventListener('pointermove', move); box.addEventListener('pointerup', up); box.addEventListener('pointercancel', cancel); box.addEventListener('lostpointercapture', cancel);
    box.addEventListener('click', press); box.addEventListener('keydown', keys, true);
    var list = ui('sysArrList'); if (list) { list.addEventListener('pointerdown', down); list.addEventListener('click', listPress); }
    if (typeof ResizeObserver === 'function') new ResizeObserver(function() { if (st.on && !st.drag) drawLayer(); }).observe(box);
}
window.wpArrange = {
    host: function(h) { st.host = h; },
    on: function() { return st.on; },
    set: function(on) {
        var b = ui('sysArrange'), wrap = document.querySelector('.sys-layout-wrap'); st.on = !!on; st.hist = []; undoSync();
        if (b) { b.classList.toggle('on', st.on); b.setAttribute('aria-pressed', st.on ? 'true' : 'false'); }
        if (wrap) wrap.classList.toggle('sys-arrange', st.on);
        var lt = ui('sysLayout'); if (lt) lt.classList.toggle('sys-arranging', st.on);
        var help = ui('sysArrHelp'); if (help) help.hidden = !st.on;
        var u = ui('sysArrUndo'); if (u) u.hidden = !st.on;
        if (!st.on) { if (st.drag) dragEnd(); var old = st.box && st.box.querySelector(':scope > .arr-layer'); if (old) old.parentNode.removeChild(old); }
        log(st.on ? 'on' : 'off', {});
    },
    sync: function(box, view) {   // the preview was drawn again
        if (!st.on || !box) return;
        st.box = box; st.view = view; wireOnce();
        var fr = box.querySelector(':scope > .sheet-frame');
        if (fr) { fr.inert = false; Array.prototype.forEach.call(fr.children, function(c) { c.inert = !c.classList.contains('sheet-tabs'); }); }
        drawLayer(); drawList();
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(function() { if (st.on && !st.drag) drawLayer(); });
        undoSync();
    },
    undo: function() { if (!st.hist.length || !st.host) return; st.host.restore(JSON.parse(st.hist.pop())); log('undo', { steps: st.hist.length }); undoSync(); }
};

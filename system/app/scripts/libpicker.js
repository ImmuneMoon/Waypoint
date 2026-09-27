/* libpicker.js — "From the library…", the picker that adds library entries to an item list (Stage 6, library L2c). A popover over
   the sheet: a search (every word, over name, key, category, tags and reference), chips for the pack and the category (the list's own
   categories only), the entries grouped by category in a list drawn only where it shows (thousands stay quick), a preview of the one
   highlighted (its stats under the list's labels, notes, description, tags, reference; the GM's notes to the GM), and a quantity with
   Add. Arrow keys move, Enter adds and closes, Shift+Enter adds and stays open, Ctrl-click picks several, double-click adds one. Built
   with text nodes only. The caller hands it a source (packs and their entries) and what an add does; the rules are librarycore's. */
import { entryHay, queryWords } from './librarycore.js';

var ROW_H = 28, W = 580;
var st = null;   // { pop, opts, all, rows, hi, picked, q, pack, cat, timer }
function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined && text !== null) e.textContent = String(text); return e; }
function map() { return Object.create(null); }
function lc(s) { return String(s || '').toLowerCase(); }
var byName = typeof Intl !== 'undefined' && Intl.Collator ? new Intl.Collator(undefined, { sensitivity: 'base', numeric: true }).compare : function(a, b) { return String(a).localeCompare(String(b)); };
function isOpen() { return !!st; }
function close() { if (!st) return; clearTimeout(st.timer); document.removeEventListener('mousedown', st.outside, true); if (st.pop.parentNode) st.pop.parentNode.removeChild(st.pop); var a = st.opts.anchor; st = null; if (a && a.isConnected) try { a.focus({ preventScroll: true }); } catch (e) {} }
function gmOnly(x) { return x.e.vis === 'gm' || x.p.vis === 'gm'; }

// opts: { anchor, title, cats (the list's categories, or null), once (entry ids already carried on a list that holds each once), noQty,
//         labels (stat key -> the list's label), gm, source: { packs() -> [{ id, name, icon, vis }], entries(packId) -> [entry] },
//         onAdd(ids, qty) }
function open(opts) {
    close();
    if (!opts || !opts.source || typeof opts.onAdd !== 'function') return;
    var cats = Array.isArray(opts.cats) && opts.cats.length ? opts.cats.map(lc) : null, all = [];
    (opts.source.packs() || []).forEach(function(p) { (opts.source.entries(p.id) || []).forEach(function(e) { if (!e || typeof e.id !== 'string') return; if (cats && cats.indexOf(lc(e.category)) < 0) return; all.push({ e: e, p: p, hay: entryHay(e) }); }); });
    all.sort(function(a, b) { return byName(a.e.category || '', b.e.category || '') || byName(a.e.name, b.e.name); });
    var pop = el('div', 'lib-pick'); pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Add from the library');
    st = { pop: pop, opts: opts, all: all, rows: [], hi: -1, picked: map(), q: '', pack: '', cat: null, timer: null, outside: null };   // cat: null every category ('' is "no category")
    var head = el('div', 'lib-pick-head'); head.appendChild(el('b', null, opts.title || 'Add from the library'));
    var x = el('button', 'tool ghost lib-pick-x', '×'); x.type = 'button'; x.title = 'Close (Esc)'; x.addEventListener('click', close); head.appendChild(x); pop.appendChild(head);
    var search = el('input', 'field lib-pick-search'); search.type = 'text'; search.maxLength = 120; search.placeholder = 'Search names, keys, categories, tags…'; pop.appendChild(search);
    var chips = el('div', 'lib-pick-chips'); pop.appendChild(chips);
    var body = el('div', 'lib-pick-body'), list = el('div', 'lib-pick-list'), spacer = el('div', 'lib-spacer'), prev = el('div', 'lib-pick-prev');
    list.appendChild(spacer); body.appendChild(list); body.appendChild(prev); pop.appendChild(body);
    var foot = el('div', 'lib-pick-foot'), qty = el('input', 'field lib-pick-qty'); qty.type = 'number'; qty.min = '1'; qty.max = '99'; qty.value = '1'; qty.title = 'How many';
    var add = el('button', 'tool lib-pick-add', 'Add'); add.type = 'button';
    var hint = el('span', 'lib-pick-hint', 'Enter adds · Shift+Enter adds and stays open · Ctrl-click picks several');
    if (!opts.noQty) foot.appendChild(qty); foot.appendChild(add); foot.appendChild(hint); pop.appendChild(foot);
    st.els = { search: search, chips: chips, list: list, spacer: spacer, prev: prev, qty: qty, add: add, hint: hint };

    search.addEventListener('input', function() { clearTimeout(st.timer); st.timer = setTimeout(function() { if (!st) return; st.q = search.value; filter(); }, 100); });
    list.addEventListener('scroll', draw, { passive: true });
    add.addEventListener('click', function() { doAdd(false); });
    pop.addEventListener('keydown', function(e) {
        e.stopPropagation();   // its keys stay its own: nothing under it (the sheet, the HUD, the map) hears them
        if (e.key === 'Escape') { e.preventDefault(); close(); }
        else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); move(e.key === 'ArrowDown' ? 1 : -1); }
        else if (e.key === 'Enter' && e.target !== add) { e.preventDefault(); doAdd(e.shiftKey); }
    });
    st.outside = function(e) { if (st && !st.pop.contains(e.target)) close(); };
    document.addEventListener('mousedown', st.outside, true);
    document.body.appendChild(pop); place(); chipsDraw(); filter();
    try { search.focus({ preventScroll: true }); } catch (e) {}
}
function place() {
    var pop = st.pop, a = st.opts.anchor, r = a && a.getBoundingClientRect ? a.getBoundingClientRect() : { left: 80, right: 80, top: 80, bottom: 80 };
    var w = Math.min(W, window.innerWidth - 16), h = Math.min(520, window.innerHeight - 16);
    pop.style.width = w + 'px'; pop.style.height = h + 'px';
    var left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)), top = r.bottom + 4;
    if (top + h > window.innerHeight - 8) top = r.top - h - 4 >= 8 ? r.top - h - 4 : Math.max(8, window.innerHeight - h - 8);
    pop.style.left = left + 'px'; pop.style.top = top + 'px';
}
function chip(parent, text, on, fn) { var b = el('button', 'lib-pick-chip' + (on ? ' on' : ''), text); b.type = 'button'; b.addEventListener('click', fn); parent.appendChild(b); }
function chipsDraw() {
    var box = st.els.chips; box.textContent = '';
    var packs = [], pn = map(), cn = map(), catsSeen = [];
    st.all.forEach(function(x) { if (!pn[x.p.id]) { pn[x.p.id] = 0; packs.push(x.p); } pn[x.p.id]++; var k = x.e.category || ''; if (cn[k] === undefined) { cn[k] = 0; catsSeen.push(k); } cn[k]++; });
    if (packs.length > 1) {
        chip(box, 'Every pack', !st.pack, function() { st.pack = ''; chipsDraw(); filter(); });
        packs.forEach(function(p) { chip(box, ((p.icon && !/^icon:/.test(p.icon)) ? p.icon + ' ' : '') + p.name + ' ' + pn[p.id], st.pack === p.id, function() { st.pack = st.pack === p.id ? '' : p.id; chipsDraw(); filter(); }); });
    }
    if (catsSeen.length > 1) {
        if (packs.length > 1) box.appendChild(el('span', 'lib-pick-sep'));
        chip(box, 'Every category', st.cat === null, function() { st.cat = null; chipsDraw(); filter(); });
        catsSeen.forEach(function(k) { chip(box, (k || 'No category') + ' ' + cn[k], st.cat === k, function() { st.cat = st.cat === k ? null : k; chipsDraw(); filter(); }); });
    }
    box.style.display = box.childNodes.length ? '' : 'none';
}
// the rows shown: the entries that pass the chips and every word of the search, a header row before each category
function filter() {
    var words = queryWords(st.q), rows = [], last = null;
    st.all.forEach(function(x) {
        if (st.pack && x.p.id !== st.pack) return; if (st.cat !== null && (x.e.category || '') !== st.cat) return;
        if (words.length && !words.every(function(w) { return x.hay.indexOf(w) >= 0; })) return;
        var k = x.e.category || ''; if (k !== last) { rows.push({ hdr: k || 'No category' }); last = k; }
        rows.push(x);
    });
    st.rows = rows; st.hi = -1; for (var i = 0; i < rows.length; i++) if (!rows[i].hdr && !isOnce(rows[i])) { st.hi = i; break; }
    st.els.spacer.style.height = (rows.length * ROW_H) + 'px'; st.els.list.scrollTop = 0;
    var old = st.els.list.querySelector('.lib-empty'); if (old) old.parentNode.removeChild(old);
    if (!rows.length) st.els.list.appendChild(el('div', 'lib-empty', st.all.length ? 'Nothing matches.' : 'The library has nothing for this list' + (st.opts.cats ? ' (its categories: ' + st.opts.cats.join(', ') + ')' : '') + '.'));
    draw(); preview(); addLabel();
}
function isOnce(x) { return !!(st.opts.once && st.opts.once[x.e.id] === 1); }
function draw() {
    if (!st) return; var list = st.els.list, sp = st.els.spacer, top = list.scrollTop, h = list.clientHeight || 300;
    sp.textContent = '';
    var from = Math.max(0, Math.floor(top / ROW_H) - 10), to = Math.min(st.rows.length, Math.ceil((top + h) / ROW_H) + 10);
    for (var i = from; i < to; i++) (function(x, i) {
        if (x.hdr) { var hd = el('div', 'lib-pick-hdr', x.hdr); hd.style.top = (i * ROW_H) + 'px'; sp.appendChild(hd); return; }
        var once = isOnce(x), r = el('button', 'lib-row lib-pick-row' + (i === st.hi ? ' hi' : '') + (st.picked[x.e.id] ? ' on' : '') + (once ? ' once' : '')); r.type = 'button'; r.style.top = (i * ROW_H) + 'px';
        if (once) r.title = 'Already on the list';
        r.appendChild(el('span', 'lib-row-ico', x.e.icon && !/^icon:/.test(x.e.icon) ? x.e.icon : ''));
        r.appendChild(el('span', 'lib-row-name', x.e.name));
        if (gmOnly(x)) r.appendChild(el('span', 'sheet-chip sheet-chip-gm', 'GM'));
        r.appendChild(el('span', 'lib-row-cat', x.p.name));
        r.addEventListener('click', function(ev) { if (once) return; if (ev.ctrlKey || ev.metaKey) { if (st.picked[x.e.id]) delete st.picked[x.e.id]; else st.picked[x.e.id] = 1; } st.hi = i; draw(); preview(); addLabel(); });
        r.addEventListener('dblclick', function() { if (once) return; st.hi = i; st.picked = map(); doAdd(false); });
        sp.appendChild(r);
    })(st.rows[i], i);
}
function move(d) {
    var i = st.hi; for (var k = 0; k < st.rows.length; k++) { i += d; if (i < 0 || i >= st.rows.length) return; if (!st.rows[i].hdr && !isOnce(st.rows[i])) break; }
    if (i < 0 || i >= st.rows.length || st.rows[i].hdr) return;
    st.hi = i; var list = st.els.list, y = i * ROW_H;
    if (y < list.scrollTop) list.scrollTop = y; else if (y + ROW_H > list.scrollTop + list.clientHeight) list.scrollTop = y + ROW_H - list.clientHeight;
    draw(); preview();
}
function line(box, label, value) { if (value === undefined || value === null || value === '') return; var r = el('div', 'lib-pick-line'); r.appendChild(el('span', 'lib-pick-k', label)); r.appendChild(el('span', 'lib-pick-v', value)); box.appendChild(r); }
function preview() {
    var box = st.els.prev, x = st.hi >= 0 ? st.rows[st.hi] : null; box.textContent = '';
    if (!x || x.hdr) { box.appendChild(el('div', 'lib-empty', 'Choose an entry to see it here.')); return; }
    var e = x.e, h = el('div', 'lib-pick-name', ((e.icon && !/^icon:/.test(e.icon)) ? e.icon + ' ' : '') + e.name); if (gmOnly(x)) h.appendChild(el('span', 'sheet-chip sheet-chip-gm', 'GM only')); box.appendChild(h);
    box.appendChild(el('div', 'lib-pick-sub', [e.category || 'No category', x.p.name].join(' · ')));
    var labels = st.opts.labels || {}, stats = e.stats && typeof e.stats === 'object' ? e.stats : {};
    Object.keys(labels).forEach(function(k) { var key = Object.keys(stats).filter(function(s) { return lc(s) === lc(k); })[0]; if (key !== undefined) line(box, labels[k], String(stats[key])); });
    if (typeof e.lvl === 'number') line(box, 'Starts at', String(e.lvl));
    if (e.area && e.area.ft) line(box, 'Blast', e.area.ft + ' ft');
    if (st.opts.gm) { line(box, 'Damage', e.damage); line(box, 'Cost', e.cost); }
    if (e.notes) box.appendChild(el('div', 'lib-pick-notes', e.notes));
    if (e.desc) box.appendChild(el('div', 'lib-pick-desc', e.desc));
    if (Array.isArray(e.tags) && e.tags.length) line(box, 'Tags', e.tags.join(', '));
    line(box, 'Reference', e.ref);
    if (st.opts.gm && e.gmNotes) { box.appendChild(el('div', 'lib-fsub', 'GM notes')); box.appendChild(el('div', 'lib-pick-desc', e.gmNotes)); }
}
function chosenIds() { var ids = Object.keys(st.picked).filter(function(id) { return st.all.some(function(x) { return x.e.id === id && !isOnce(x); }); }); if (ids.length) return ids; var x = st.hi >= 0 ? st.rows[st.hi] : null; return x && !x.hdr && !isOnce(x) ? [x.e.id] : []; }
function addLabel() { var n = Object.keys(st.picked).length; st.els.add.textContent = n > 1 ? 'Add ' + n : 'Add'; st.els.add.disabled = !chosenIds().length; }
function doAdd(stay) {
    var ids = chosenIds(); if (!ids.length) return;
    var q = st.opts.noQty ? 1 : Math.max(1, Math.min(99, parseInt(st.els.qty.value, 10) || 1));
    var opts = st.opts; try { opts.onAdd(ids, q); } catch (e) { console.error(e); }
    if (!stay) { close(); return; }
    if (opts.once) ids.forEach(function(id) { opts.once[id] = 1; });   // a list that holds each once: what was just added greys out
    st.picked = map(); st.els.hint.textContent = 'Added ' + (ids.length === 1 ? 'one' : ids.length) + '. Enter adds · Shift+Enter adds and stays open';
    if (opts.once) filter(); else { draw(); addLabel(); }
}

window.wpLibPicker = { open: open, close: close, isOpen: isOpen };
